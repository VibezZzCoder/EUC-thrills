/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { generateLevel } from '../level/generateRoute.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createTerrain, type TerrainView } from './terrain.ts';
import {
  createVenueLighting,
  type UltraEnvironment,
  type UltraSkyTexture,
  type VenueLighting,
  type VenueLightingHooks,
} from './Renderer.ts';
import { LIGHTING } from '../data/tuning.ts';
import type { ResolvedVenueLook, VenueLook } from '../data/venueLook.ts';
import { ENHANCED_PRESENTATION, type PresentationSelection } from './presentation.ts';
import type { SkyTexture } from './sky.ts';
import { HEADLESS_CAPS } from './ultra/ultraCost.ts';
import { applyKitOverride, ULTRA_FULL } from './ultra/ultraRecipe.ts';
import { UltraRuntime, type UltraHost } from './ultra/ultraRuntime.ts';

/**
 * Regeneration is a lifecycle event — M12 Phase 3.
 *
 * `docs/PLANS.md` §10, Phase 3: *"Regeneration is the new lifecycle event, so
 * invariant 10 grows a test: N sequential generations plateau GPU objects — a
 * generator that leaks a world per seed fails regardless of how cheap each
 * world is."*
 *
 * Invariant 10 has been checked since M1 across advancing, resizing, resetting
 * and restarting, and every one of those measurements is taken on a world that
 * was built once. A generator makes the *world* disposable, which is a fault
 * class none of those tests can reach: a build path that forgets one
 * `removeFromParent` is invisible while there is only ever one level, and
 * leaks an entire heightfield the moment there are two.
 *
 * **This half runs headlessly and asks about the scene graph**; the GPU
 * counters it cannot see — `renderer.info.memory`, compiled programs, the
 * buffers behind an `InstancedMesh` — are asserted against a real
 * `WebGLRenderer` in `tests/m12.spec.ts`. Both are needed and neither
 * substitutes for the other: a leaked group is invisible to `info.memory`
 * while its geometry is disposed, and a leaked instance buffer is invisible to
 * the scene graph while its group is removed.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** Enough seeds that a per-world leak is unmistakable, few enough to run always. */
const SEEDS = ['sweep-0', 'sweep-1', 'sweep-2', 'sweep-3', 'sweep-4', 'sweep-5'];

interface SceneCensus {
  readonly objects: number;
  readonly meshes: number;
  readonly geometries: number;
  readonly materials: number;
}

/**
 * Everything reachable from the scene root, and every distinct resource it
 * still refers to.
 *
 * Distinct rather than total: the renderer shares one material across the
 * heightfield's groups, and counting references would report sharing as growth.
 */
function census(scene: THREE.Object3D): SceneCensus {
  let objects = 0;
  let meshes = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    objects += 1;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    meshes += 1;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
    }
  });
  return { objects, meshes, geometries: geometries.size, materials: materials.size };
}

test('a scene that has built and thrown away six worlds is the scene it started as', () => {
  const scene = new THREE.Scene();
  const empty = census(scene);
  assert.equal(empty.objects, 1, 'the fixture starts with the scene root and nothing else');

  const after: SceneCensus[] = [];
  for (const seed of SEEDS) {
    const view = createTerrain(generateLevel(seed).plan);
    scene.add(view.group);
    // The world is genuinely present in between, or the teardown proves nothing.
    assert.ok(census(scene).meshes > 4, `${seed} built almost nothing`);
    view.dispose();
    after.push(census(scene));
  }

  for (const [index, sample] of after.entries()) {
    assert.deepEqual(
      sample,
      empty,
      `after ${index + 1} generation(s) the scene still holds `
        + `${sample.objects - empty.objects} object(s), `
        + `${sample.meshes - empty.meshes} mesh(es) and `
        + `${sample.geometries - empty.geometries} geometr(ies) from a world that was `
        + 'thrown away. A generator that leaks a world per seed fails regardless of '
        + 'how cheap each world is.',
    );
  }
});

test('the sixth world costs what the first world costs', () => {
  // The other half of a plateau: a scene that empties correctly could still be
  // paying more to build the sixth world than the first — a per-build cache
  // that never resets, for instance. One seed, built six times, must produce
  // the same census every time.
  const scene = new THREE.Scene();
  const plan = generateLevel('sweep-0').plan;

  const built: SceneCensus[] = [];
  for (let round = 0; round < 6; round += 1) {
    const view = createTerrain(plan);
    scene.add(view.group);
    built.push(census(scene));
    view.dispose();
  }

  for (const sample of built) assert.deepEqual(sample, built[0]);
});

test('a world is disposed even when the next one is a different shape', () => {
  // Levels differ in which surfaces, block materials and prop parts they use,
  // and the renderer builds one mesh per *present* kind — so the teardown that
  // matters is the one where the outgoing world owns meshes the incoming one
  // does not. The slice, the proving-ground-free generator and a generated
  // route are three different shapes; alternating them exercises that.
  const scene = new THREE.Scene();
  const plans: LevelPlan[] = [
    createSliceLevel(),
    generateLevel('sweep-7').plan,
    createSliceLevel(),
    generateLevel('sweep-8').plan,
  ];

  const empty = census(scene);
  for (const plan of plans) {
    const view = createTerrain(plan);
    scene.add(view.group);
    view.dispose();
    assert.deepEqual(census(scene), empty);
  }
});

// ---------------------------------------------------------------------------
// A venue's light is a lifecycle event too — M36 Phase 4
// ---------------------------------------------------------------------------

/**
 * The warm late afternoon Switchback Park is authored in, as a fixture.
 *
 * The park itself wires this next (`level/switchbackLevel.ts` owns the
 * descriptor); the numbers are here because what this half of the file tests
 * is the *restoration*, and that needs a look which moves every axis a look
 * has — both light colours, both intensities, the sun's bearing and height,
 * all three sky colours and the exposure. A descriptor that moved fewer would
 * let a stuck value through.
 */
const WARM_LATE_AFTERNOON: VenueLook = {
  sunAzimuth: -1.75,
  sunElevation: 0.58,
  sunColour: 0xffd9a8,
  sunIntensity: 2.45,
  skyColour: 0x8bb2e6,
  groundBounceColour: 0xb9a68d,
  hemisphereIntensity: 1.22,
  horizonColour: 0xdfc8a8,
  skyZenithColour: 0x4d80c6,
  skySunColour: 0xffe0b0,
  exposure: 1.06,
};

/**
 * Everything a look is allowed to have touched, as numbers.
 *
 * Numbers rather than the three.js objects themselves, and that is not a
 * stylistic choice: a census holding a `THREE.Texture` is a census holding a
 * two-megabyte pixel buffer and a cyclic object graph, and `assert.deepEqual`
 * over one of those does not finish. The background is compared by identity,
 * separately, which is the only question worth asking about it anyway.
 */
interface LookValues {
  readonly fogColour: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly hemisphereSky: number;
  readonly hemisphereGround: number;
  readonly hemisphereIntensity: number;
  readonly sunColour: number;
  readonly sunIntensity: number;
  readonly sunOffsetX: number;
  readonly sunOffsetY: number;
  readonly sunOffsetZ: number;
  readonly exposure: number;
}

interface LightingFixture {
  readonly rig: VenueLighting;
  readonly skiesBuilt: Set<THREE.Texture>;
  readonly skiesDisposed: Set<THREE.Texture>;
  values(): LookValues;
  background(): THREE.Texture | null;
  children(): number;
}

/** A rig over a plain scene and the two lights it is allowed to write. */
function lightingFixture(): LightingFixture {
  const scene = new THREE.Scene();
  const hemisphere = new THREE.HemisphereLight(0x000000, 0x000000, 0);
  const sun = new THREE.DirectionalLight(0x000000, 0);
  scene.add(hemisphere);
  scene.add(sun);
  scene.add(sun.target);

  let exposure = Number.NaN;
  const rig = createVenueLighting({
    scene,
    sun,
    hemisphere,
    setExposure: (value: number): void => {
      exposure = value;
    },
  });

  // Every sky the rig builds and every one it lets go of. A swap that forgot
  // to dispose the outgoing texture would leave these two sets one further
  // apart on each swap — the leak `tests/m36.spec.ts`'s twelve-rebuild
  // plateau measures on a real GPU, caught here without one.
  const skiesBuilt = new Set<THREE.Texture>();
  const skiesDisposed = new Set<THREE.Texture>();
  const watch = (): void => {
    const texture = rig.sky.texture;
    if (skiesBuilt.has(texture)) return;
    skiesBuilt.add(texture);
    texture.addEventListener('dispose', () => skiesDisposed.add(texture));
  };
  watch();

  return {
    rig,
    skiesBuilt,
    skiesDisposed,
    values(): LookValues {
      watch();
      const fog = scene.fog as THREE.Fog;
      return {
        fogColour: fog.color.getHex(),
        fogNear: fog.near,
        fogFar: fog.far,
        hemisphereSky: hemisphere.color.getHex(),
        hemisphereGround: hemisphere.groundColor.getHex(),
        hemisphereIntensity: hemisphere.intensity,
        sunColour: sun.color.getHex(),
        sunIntensity: sun.intensity,
        sunOffsetX: rig.sunOffset.x,
        sunOffsetY: rig.sunOffset.y,
        sunOffsetZ: rig.sunOffset.z,
        exposure,
      };
    },
    background(): THREE.Texture | null {
      watch();
      return scene.background as THREE.Texture | null;
    },
    children(): number {
      return scene.children.length;
    },
  };
}

test('a venue with no look is composed as exactly the daylight LIGHTING ships', () => {
  const fixture = lightingFixture();
  const daylight = fixture.values();

  // The sun hangs where the constructor used to put it, derived from the same
  // two constants the painted sun is.
  const horizontal = Math.cos(LIGHTING.sunElevation) * LIGHTING.sunDistance;
  assert.deepEqual(daylight, {
    fogColour: LIGHTING.horizonColour,
    fogNear: LIGHTING.fogNear,
    fogFar: LIGHTING.fogFar,
    hemisphereSky: LIGHTING.skyColour,
    hemisphereGround: LIGHTING.groundBounceColour,
    hemisphereIntensity: LIGHTING.hemisphereIntensity,
    sunColour: LIGHTING.sunColour,
    sunIntensity: LIGHTING.sunIntensity,
    sunOffsetX: Math.sin(LIGHTING.sunAzimuth) * horizontal,
    sunOffsetY: Math.sin(LIGHTING.sunElevation) * LIGHTING.sunDistance,
    sunOffsetZ: Math.cos(LIGHTING.sunAzimuth) * horizontal,
    exposure: LIGHTING.exposure,
  }, 'a world that authors no look is judged in the frame it shipped in — '
    + 'M36 §36.7 keeps today’s daylight as the default for every existing world');

  assert.equal(fixture.background(), fixture.rig.sky.texture, 'the sky is the background');
  assert.equal(fixture.children(), 3, 'one hemisphere, one sun, one sun target — and no more');
  fixture.rig.dispose();
});

test('park → slice → park restores each look exactly, and leaves one sky alive', () => {
  const fixture = lightingFixture();

  const daylight = fixture.values();
  fixture.rig.apply(WARM_LATE_AFTERNOON);
  const warm = fixture.values();
  const warmSky = fixture.background();
  fixture.rig.apply(undefined);
  const back = fixture.values();
  fixture.rig.apply(WARM_LATE_AFTERNOON);
  const warmAgain = fixture.values();

  // The park's look has to move every axis, or the round trip proves nothing.
  for (const key of Object.keys(daylight) as (keyof LookValues)[]) {
    if (key === 'fogNear' || key === 'fogFar') continue;
    assert.notEqual(warm[key], daylight[key], `the park's look must move ${key}`);
  }

  assert.deepEqual(back, daylight,
    'leaving the park left something of it behind on the lights, the haze or the exposure');
  assert.deepEqual(warmAgain, warm, 'coming back to the park did not restore its look');

  // Its own numbers, not merely "different from daylight".
  assert.equal(warm.fogColour, WARM_LATE_AFTERNOON.horizonColour);
  assert.equal(warm.sunColour, WARM_LATE_AFTERNOON.sunColour);
  assert.equal(warm.hemisphereSky, WARM_LATE_AFTERNOON.skyColour);
  assert.equal(warm.hemisphereGround, WARM_LATE_AFTERNOON.groundBounceColour);
  assert.equal(warm.exposure, WARM_LATE_AFTERNOON.exposure);
  // It authors neither haze distance, so both stay the shipped ones: a partial
  // descriptor is filled from `LIGHTING`, never from the venue before it.
  assert.equal(warm.fogNear, LIGHTING.fogNear);
  assert.equal(warm.fogFar, LIGHTING.fogFar);

  // Three sky changes, three repaints, and exactly one texture still alive.
  assert.equal(fixture.skiesBuilt.size, 4, 'daylight, warm, daylight, warm');
  assert.equal(fixture.skiesDisposed.size, 3, 'every sky but the live one is gone');
  assert.notEqual(fixture.background(), warmSky, 'the park came back on a fresh texture');
  assert.equal(fixture.background(), fixture.rig.sky.texture);
  assert.ok(!fixture.skiesDisposed.has(fixture.rig.sky.texture), 'the live sky was disposed');

  fixture.rig.dispose();
  assert.equal(fixture.skiesDisposed.size, 4, 'and the last one goes with the renderer');
  assert.equal(fixture.background(), null);
});

test('a swap between two worlds whose skies agree repaints nothing', () => {
  // Every venue swap in the game today: only the park authors a look, so
  // BelVar → the slice → a generated route must not build and throw away a
  // 1024x512 texture for a sky none of them changes.
  const fixture = lightingFixture();
  fixture.rig.apply(undefined);
  fixture.rig.apply({ exposure: 1.2, sunIntensity: 2.0, fogFar: 400 });
  fixture.rig.apply(undefined);
  assert.equal(fixture.skiesBuilt.size, 1, 'a look that paints the same sky must reuse it');
  assert.equal(fixture.skiesDisposed.size, 0);
  fixture.rig.dispose();
});

test('the F4 panel wins over a venue, and only while a value is actually tuned', () => {
  // `app/Game.ts:applyTuning` pushes all three values on every change, so an
  // untouched panel arrives as the shipped defaults and must not overwrite the
  // venue's own. See the precedence rule on `VenueLighting`.
  const fixture = lightingFixture();

  fixture.rig.tune({
    exposure: LIGHTING.exposure,
    sunIntensity: LIGHTING.sunIntensity,
    hemisphereIntensity: LIGHTING.hemisphereIntensity,
  });
  fixture.rig.apply(WARM_LATE_AFTERNOON);
  const untouched = fixture.values();
  assert.equal(untouched.exposure, WARM_LATE_AFTERNOON.exposure,
    'an untouched panel is not an override');
  assert.equal(untouched.sunIntensity, WARM_LATE_AFTERNOON.sunIntensity);
  assert.equal(untouched.hemisphereIntensity, WARM_LATE_AFTERNOON.hemisphereIntensity);

  fixture.rig.tune({ exposure: 1.4 });
  assert.equal(fixture.values().exposure, 1.4, 'a dragged slider overrides the venue');

  // And it survives the venue under it changing, in both directions.
  fixture.rig.apply(undefined);
  assert.equal(fixture.values().exposure, 1.4, 'leaving the park dropped the override');
  fixture.rig.apply(WARM_LATE_AFTERNOON);
  assert.equal(fixture.values().exposure, 1.4, 'returning to it dropped the override');

  // Dragged back to its exact default, the value goes back to the venue.
  fixture.rig.tune({ exposure: LIGHTING.exposure });
  assert.equal(fixture.values().exposure, WARM_LATE_AFTERNOON.exposure);
  fixture.rig.dispose();
});

// ---------------------------------------------------------------------------
// The Ultra tier is a lifecycle event of the same rig — M39 (§3.6)
// ---------------------------------------------------------------------------

/**
 * Hooks that build nothing on a GPU and count everything: the Ultra sky, the
 * PMREM environment (the "counting fake environment factory" of §6.3 W5) and
 * every fill the rig asks for, with the tuned hemisphere it was handed. The
 * fill is a fake too — a recognisable function of its inputs — so what is
 * asserted is the rig's *wiring and restoration*, never W4's numbers, which
 * W4's own tests own and U2 tunes.
 */
interface CountingHooks {
  readonly hooks: VenueLightingHooks;
  readonly counts: {
    skiesPainted: number;
    skiesDisposed: number;
    environmentsBuilt: number;
    environmentsDisposed: number;
  };
  /** The tuned hemisphere each fill was handed, in order. */
  readonly tunedSeen: (number | undefined)[];
  failNext: 'sky' | 'environment' | null;
}

/** The fake fill: hemisphere kept and zeroed, environment = fill / π. */
function fakeFill(look: ResolvedVenueLook, tuned: number | undefined): {
  hemisphereIntensity: number;
  environmentIntensity: number;
} {
  return { hemisphereIntensity: 0, environmentIntensity: (tuned ?? look.hemisphereIntensity) / Math.PI };
}

function countingHooks(): CountingHooks {
  const counts = { skiesPainted: 0, skiesDisposed: 0, environmentsBuilt: 0, environmentsDisposed: 0 };
  const tunedSeen: (number | undefined)[] = [];
  const state: CountingHooks = {
    counts,
    tunedSeen,
    failNext: null,
    hooks: {
      ultraSky(): SkyTexture {
        if (state.failNext === 'sky') throw new Error('no Ultra sky today');
        counts.skiesPainted += 1;
        const texture = new THREE.DataTexture(new Uint8Array(16 * 8 * 4), 16, 8, THREE.RGBAFormat);
        texture.name = 'ultra-sky';
        return {
          texture,
          dispose(): void {
            counts.skiesDisposed += 1;
            texture.dispose();
          },
        };
      },
      ultraEnvironment(): UltraEnvironment {
        if (state.failNext === 'environment') throw new Error('no environment today');
        counts.environmentsBuilt += 1;
        const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
        texture.name = 'ultra-environment';
        return {
          texture,
          bytes: 6 * 1024 * 1024,
          cubeSize: 256,
          dispose(): void {
            counts.environmentsDisposed += 1;
            texture.dispose();
          },
        };
      },
      ultraFill(look, tunedHemisphere) {
        tunedSeen.push(tunedHemisphere);
        return fakeFill(look, tunedHemisphere);
      },
    },
  };
  return state;
}

interface TierFixture {
  readonly rig: VenueLighting;
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  readonly counting: CountingHooks;
  /** Ordinary skies: built by `createSky`, told apart from the fakes by name. */
  readonly ordinarySkies: { built: number; disposed: number };
  /** Every field the rig writes on either tier, as plain values. */
  values(): Record<string, unknown>;
}

/** The M36 fixture above, with the Ultra hooks — and every rig-written field. */
function tierFixture(): TierFixture {
  const scene = new THREE.Scene();
  const hemisphere = new THREE.HemisphereLight(0x000000, 0x000000, 0);
  const sun = new THREE.DirectionalLight(0x000000, 0);
  scene.add(hemisphere);
  scene.add(sun);
  scene.add(sun.target);
  let exposure = Number.NaN;
  const counting = countingHooks();
  const rig = createVenueLighting(
    {
      scene,
      sun,
      hemisphere,
      setExposure: (value: number): void => {
        exposure = value;
      },
    },
    counting.hooks,
  );

  const ordinarySkies = { built: 0, disposed: 0 };
  const seen = new Set<THREE.Texture>();
  const watch = (): void => {
    const texture = rig.sky.texture;
    if (seen.has(texture) || texture.name !== 'sky') return;
    seen.add(texture);
    ordinarySkies.built += 1;
    texture.addEventListener('dispose', () => {
      ordinarySkies.disposed += 1;
    });
  };
  watch();

  return {
    rig,
    scene,
    sun,
    hemisphere,
    counting,
    ordinarySkies,
    values(): Record<string, unknown> {
      watch();
      const fog = scene.fog as THREE.Fog;
      const background = scene.background as THREE.DataTexture;
      return {
        tier: rig.tier,
        fog: [fog.color.getHex(), fog.near, fog.far],
        hemisphere: [hemisphere.color.getHex(), hemisphere.groundColor.getHex(), hemisphere.intensity],
        sun: [sun.color.getHex(), sun.intensity],
        sunOffset: rig.sunOffset.toArray(),
        sunPosition: sun.position.toArray(),
        exposure,
        environment: scene.environment === null ? null : scene.environment.name,
        environmentIntensity: scene.environmentIntensity,
        rigEnvironment: rig.environment === null ? null : rig.environment.cubeSize,
        sky: [background.name, background.image.width, background.image.height],
        skyIsBackground: background === rig.sky.texture,
      };
    },
  };
}

test('daylight → ultra → daylight restores every rig-written field, and leaves one sky alive', () => {
  const fixture = tierFixture();
  const daylight = fixture.values();

  fixture.rig.setTier('ultra');
  const ultra = fixture.values();
  assert.equal(ultra.tier, 'ultra');
  assert.equal(ultra.environment, 'ultra-environment', 'the environment is the fill');
  assert.equal(ultra.hemisphere instanceof Array && ultra.hemisphere[2], 0, 'the hemisphere is kept and zeroed');
  assert.equal(ultra.environmentIntensity, LIGHTING.hemisphereIntensity / Math.PI);
  assert.deepEqual(ultra.sky, ['ultra-sky', 16, 8], 'the Ultra sky is the background');
  // The look itself does not move with the tier (§3.2: sun, fog, exposure unchanged).
  assert.deepEqual(
    { fog: ultra.fog, sun: ultra.sun, sunOffset: ultra.sunOffset, exposure: ultra.exposure },
    { fog: daylight.fog, sun: daylight.sun, sunOffset: daylight.sunOffset, exposure: daylight.exposure },
  );
  // A repeat is a no-op: nothing rebuilt.
  fixture.rig.setTier('ultra');
  assert.equal(fixture.counting.counts.environmentsBuilt, 1);
  assert.equal(fixture.counting.counts.skiesPainted, 1);

  fixture.rig.setTier('ordinary');
  assert.deepEqual(fixture.values(), daylight, 'leaving Ultra left something of it on the light');
  const { counts } = fixture.counting;
  assert.equal(counts.environmentsDisposed, counts.environmentsBuilt, 'the PMREM target went with the tier');
  assert.equal(counts.skiesDisposed, counts.skiesPainted, 'the Ultra sky went with the tier');
  assert.equal(fixture.ordinarySkies.built, 2, 'the 1024 sky was repainted for the look');
  assert.equal(fixture.ordinarySkies.disposed, 1, 'and exactly one ordinary sky is alive');
  assert.equal(fixture.rig.failure, null);

  fixture.rig.dispose();
  assert.equal(fixture.ordinarySkies.disposed, 2);
});

test('an Ultra sky that brings its own background cube is drawn through it, and the ordinary sky comes back on exit (F3)', () => {
  const counting = countingHooks();
  let cubes = 0;
  let cubesDisposed = 0;
  const hooks: VenueLightingHooks = {
    ...counting.hooks,
    // The runtime's hook shape: the equirect as `texture`, its cube as `background`.
    ultraSky(look): UltraSkyTexture {
      const sky = counting.hooks.ultraSky(look);
      const cube = new THREE.CubeTexture();
      cube.name = 'ultra-sky-cube';
      cubes += 1;
      return {
        texture: sky.texture,
        background: cube,
        dispose(): void {
          cubesDisposed += 1;
          cube.dispose();
          sky.dispose();
        },
      };
    },
  };
  const scene = new THREE.Scene();
  const hemisphere = new THREE.HemisphereLight(0x000000, 0x000000, 0);
  const sun = new THREE.DirectionalLight(0x000000, 0);
  const rig = createVenueLighting({ scene, sun, hemisphere, setExposure: () => {} }, hooks);
  const ordinary = scene.background as THREE.Texture;
  assert.equal(ordinary, rig.sky.texture, 'the ordinary rig hangs the equirect, for three to convert');

  rig.setTier('ultra');
  assert.equal((scene.background as THREE.Texture).name, 'ultra-sky-cube', 'the cube is the background');
  assert.equal(rig.sky.texture.name, 'ultra-sky', 'the rig still holds, and reports, the painted equirect');
  rig.apply(WARM_LATE_AFTERNOON);
  assert.equal(cubes, 2);
  assert.equal(cubesDisposed, 1, 'the outgoing cube went with its sky');

  rig.setTier('ordinary');
  assert.equal(cubesDisposed, cubes, 'no cube outlives the tier');
  assert.equal(scene.background, rig.sky.texture, 'the ordinary equirect is the background again');
  assert.equal((scene.background as THREE.Texture).name, 'sky');
  rig.dispose();
});

test('park → ultra → slice → ordinary lands exactly where park → slice does', () => {
  const walked = tierFixture();
  walked.rig.apply(WARM_LATE_AFTERNOON);
  walked.rig.setTier('ultra');
  const parkUltra = walked.values();
  walked.rig.apply(undefined);
  const sliceUltra = walked.values();
  walked.rig.setTier('ordinary');

  const direct = tierFixture();
  direct.rig.apply(WARM_LATE_AFTERNOON);
  direct.rig.apply(undefined);

  assert.deepEqual(walked.values(), direct.values());
  // The swap at Ultra rebuilt the environment for the new look, and repainted
  // the Ultra sky — once each, disposing the outgoing ones first.
  const { counts } = walked.counting;
  assert.equal(counts.environmentsBuilt, 2);
  assert.equal(counts.environmentsDisposed, 2);
  assert.equal(counts.skiesPainted, 2);
  assert.equal(counts.skiesDisposed, 2);
  assert.notDeepEqual(parkUltra.environmentIntensity, sliceUltra.environmentIntensity,
    'the fill follows the look it is hung for');
  assert.equal(parkUltra.environmentIntensity, WARM_LATE_AFTERNOON.hemisphereIntensity! / Math.PI);

  // A look and a tier changed together paint once, at the tier they end on.
  const together = tierFixture();
  together.rig.apply(WARM_LATE_AFTERNOON, 'ultra');
  assert.equal(together.ordinarySkies.built, 1, 'no ordinary park sky was painted on the way in');
  assert.equal(together.counting.counts.skiesPainted, 1);
  assert.deepEqual(together.values(), parkUltra);
});

test('the F4 panel wins over a venue at Ultra too, in both directions of a tier change', () => {
  const fixture = tierFixture();
  // An untouched panel, pushed as `applyTuning` pushes it: not an override.
  fixture.rig.tune({
    exposure: LIGHTING.exposure,
    sunIntensity: LIGHTING.sunIntensity,
    hemisphereIntensity: LIGHTING.hemisphereIntensity,
  });
  fixture.rig.apply(WARM_LATE_AFTERNOON, 'ultra');
  assert.equal(fixture.counting.tunedSeen.at(-1), undefined, 'the fill saw no tuned hemisphere');
  assert.equal(fixture.scene.environmentIntensity, WARM_LATE_AFTERNOON.hemisphereIntensity! / Math.PI);

  // A dragged hemisphere reaches the Ultra fill, absolute, not the light.
  fixture.rig.tune({ hemisphereIntensity: 0.8 });
  assert.equal(fixture.counting.tunedSeen.at(-1), 0.8);
  assert.equal(fixture.scene.environmentIntensity, 0.8 / Math.PI);
  assert.equal(fixture.hemisphere.intensity, 0);

  // A dragged exposure survives the tier change in both directions.
  fixture.rig.tune({ exposure: 1.4 });
  fixture.rig.setTier('ordinary');
  assert.equal(fixture.values().exposure, 1.4, 'leaving Ultra dropped the override');
  assert.equal(fixture.hemisphere.intensity, 0.8, 'the tuned hemisphere is the ordinary fill again');
  fixture.rig.setTier('ultra');
  assert.equal(fixture.values().exposure, 1.4, 'entering Ultra dropped the override');
  assert.equal(fixture.scene.environmentIntensity, 0.8 / Math.PI);

  // Dragged back to their exact defaults, both go back to the venue.
  fixture.rig.tune({ exposure: LIGHTING.exposure, hemisphereIntensity: LIGHTING.hemisphereIntensity });
  assert.equal(fixture.values().exposure, WARM_LATE_AFTERNOON.exposure);
  assert.equal(fixture.counting.tunedSeen.at(-1), undefined);
  fixture.rig.setTier('ordinary');
  assert.equal(fixture.hemisphere.intensity, WARM_LATE_AFTERNOON.hemisphereIntensity);
  assert.equal(fixture.scene.environmentIntensity, 1);
});

test('an Ultra piece that cannot be built falls back to exactly the ordinary light', () => {
  for (const piece of ['sky', 'environment'] as const) {
    const fixture = tierFixture();
    fixture.rig.apply(WARM_LATE_AFTERNOON);
    const ordinary = fixture.values();

    fixture.counting.failNext = piece;
    fixture.rig.setTier('ultra');
    assert.equal(fixture.rig.tier, 'ordinary', `a failed ${piece} left the rig on the Ultra tier`);
    assert.equal(fixture.rig.failure?.stage, piece);
    assert.deepEqual(
      { ...fixture.values(), sky: null },
      { ...ordinary, sky: null },
      `a failed ${piece} left part of Ultra on the light`,
    );
    assert.equal((fixture.values().sky as unknown[])[0], 'sky', 'the background is an ordinary sky');
    const { counts } = fixture.counting;
    assert.equal(counts.environmentsDisposed, counts.environmentsBuilt);
    assert.equal(counts.skiesDisposed, counts.skiesPainted);

    // The next attempt starts clean.
    fixture.counting.failNext = null;
    fixture.rig.setTier('ultra');
    assert.equal(fixture.rig.tier, 'ultra');
    assert.equal(fixture.rig.failure, null);
    fixture.rig.dispose();
  }
});

test('A28, FE: a lost context takes the Ultra environment down once, and the restore\'s refresh builds the next with nothing to dispose', () => {
  const fixture = tierFixture();
  fixture.rig.apply(WARM_LATE_AFTERNOON, 'ultra');
  const hung = fixture.values();
  const { counts } = fixture.counting;
  assert.equal(counts.environmentsBuilt, 1);
  const skies = { painted: counts.skiesPainted, disposed: counts.skiesDisposed };

  // The loss (`UltraRuntime.onContextLost`): off the scene and disposed, while
  // the lost context makes the deletes no-ops. The tier and the sky stand.
  fixture.rig.releaseUltraEnvironment();
  assert.equal(counts.environmentsDisposed, 1);
  assert.equal(fixture.rig.environment, null);
  assert.equal(fixture.scene.environment, null);
  assert.equal(fixture.rig.tier, 'ultra', 'a loss is not a tier change');
  assert.deepEqual({ painted: counts.skiesPainted, disposed: counts.skiesDisposed }, skies);
  fixture.rig.releaseUltraEnvironment();
  assert.equal(counts.environmentsDisposed, 1, 'a second release disposed again');

  // The restore (`refreshUltra(true)`): one new environment, nothing disposed,
  // and the light is the one that was hung before the loss.
  fixture.rig.refreshUltra(true);
  assert.equal(counts.environmentsBuilt, 2);
  assert.equal(counts.environmentsDisposed, 1, 'the restore disposed an environment');
  assert.deepEqual(fixture.values(), hung);

  // Off the tier a release is a no-op; leaving disposes the rebuilt one.
  fixture.rig.setTier('ordinary');
  assert.equal(counts.environmentsDisposed, 2);
  fixture.rig.releaseUltraEnvironment();
  assert.equal(counts.environmentsDisposed, 2);
  fixture.rig.dispose();
});

test('an ordinary rig never calls a hook, and refuses the Ultra tier without them', () => {
  const fixture = tierFixture();
  fixture.rig.apply(WARM_LATE_AFTERNOON);
  fixture.rig.apply(undefined);
  fixture.rig.tune({ exposure: 1.3 });
  fixture.rig.refreshUltra(true);
  fixture.rig.releaseUltraEnvironment();
  assert.deepEqual(fixture.counting.counts, {
    skiesPainted: 0,
    skiesDisposed: 0,
    environmentsBuilt: 0,
    environmentsDisposed: 0,
  });
  assert.equal(fixture.counting.tunedSeen.length, 0);

  const bare = lightingFixture();
  assert.throws(() => bare.rig.setTier('ultra'), /hooks/);
  assert.equal(bare.rig.tier, 'ordinary', 'a refused tier change moves nothing');
  bare.rig.dispose();
});

/**
 * The whole §3.6 teardown through the runtime, with the shadow rig: a real
 * `UltraRuntime` over the rig above, W4's real rig writers, and fakes for the
 * GPU half. `ultraRuntime.test.ts` walks every fault stage; this is the
 * lifecycle walk the card names — daylight → ultra → daylight, and
 * park → ultra → slice → ordinary — compared field by field, shadow rig
 * included, with a world built without Ultra at all.
 */
function runtimeFixture(): {
  runtime: UltraRuntime;
  tier: TierFixture;
  values(): Record<string, unknown>;
  world(look?: VenueLook): void;
} {
  const tier = tierFixture();
  const { scene, sun } = tier;
  // The renderer constructor's ordinary cascade.
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LIGHTING.shadowMapSize);
  sun.shadow.bias = LIGHTING.shadowBias;
  sun.shadow.normalBias = LIGHTING.shadowNormalBias;
  const box = sun.shadow.camera;
  box.left = -LIGHTING.shadowRadius;
  box.right = LIGHTING.shadowRadius;
  box.top = LIGHTING.shadowRadius;
  box.bottom = -LIGHTING.shadowRadius;
  box.near = 1;
  box.far = LIGHTING.sunDistance * 2;
  box.updateProjectionMatrix();
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.position.set(0, 2, -5);
  camera.lookAt(0, 1, 0);

  let terrain: TerrainView | null = null;
  // The runtime reads only the recipe off the selection (to rebuild the
  // ordinary world); the cost is the renderer's to report, not this walk's.
  const selection: PresentationSelection = {
    recipe: ENHANCED_PRESENTATION,
    cost: {} as PresentationSelection['cost'],
    verdicts: [],
  };
  const host: UltraHost = {
    scene,
    sun,
    lighting: () => tier.rig,
    ordinaryQuality: () => 'high',
    viewCount: () => 1,
    probeCaps: () => HEADLESS_CAPS,
    maxAnisotropy: () => 1,
    judge: (_plan, _caps, override) => ({
      recipe: applyKitOverride(ULTRA_FULL, override),
      cost: null,
      refusal: null,
      rungs: [],
    }),
    installedTerrain: () => terrain,
    installTerrain: (_plan, recipe) => {
      terrain?.dispose();
      const group = new THREE.Group();
      scene.add(group);
      terrain = {
        group,
        recipe: recipe.id,
        ultra: null,
        dispose: (): void => {
          group.removeFromParent();
        },
      } as unknown as TerrainView;
      return terrain;
    },
    paintUltraSky: (look) => tier.counting.hooks.ultraSky(look),
    buildEnvironment: (look) => tier.counting.hooks.ultraEnvironment(look),
    buildFarShadow: () => {},
    drawFirstFrame: () => {
      runtime.beforeSoloRender(camera);
      return 0;
    },
    setShaderErrorHook: () => {},
    canvas: () => ({ width: 1920, height: 1080, pixelRatio: 1 }),
    resize: () => {},
    setShadowFocus: (x, y, z) => {
      const offset = tier.rig.sunOffset;
      sun.target.position.set(x, y, z);
      sun.position.set(x + offset.x, y + offset.y, z + offset.z);
    },
    now: () => 0,
  };
  // The runtime's own hooks are what the renderer hands the rig; here the rig
  // already has the counting ones, and the host routes the runtime's builds
  // to them, so both count the same pieces.
  const runtime = new UltraRuntime(host);
  const plans = new Map<VenueLook | undefined, LevelPlan>();
  const world = (look?: VenueLook): void => {
    let plan = plans.get(look);
    if (plan === undefined) {
      plan = { look } as unknown as LevelPlan;
      plans.set(look, plan);
    }
    runtime.installWorld(plan, selection, undefined);
  };
  world();
  return {
    runtime,
    tier,
    world,
    values(): Record<string, unknown> {
      const shadow = sun.shadow;
      return {
        ...tier.values(),
        shadowRig: [
          shadow.mapSize.x,
          shadow.bias,
          shadow.normalBias,
          shadow.radius,
          shadow.intensity,
          box.left,
          box.right,
          box.top,
          box.bottom,
          box.near,
          box.far,
        ],
        sunTarget: sun.target.position.toArray(),
        terrain: terrain?.recipe ?? null,
      };
    },
  };
}

test('the §3.6 teardown restores the light and the shadow rig together, walked through the runtime', () => {
  // daylight → ultra → daylight
  const walked = runtimeFixture();
  const daylight = walked.values();
  walked.runtime.setWanted(true, null);
  walked.runtime.reconcile();
  const ultra = walked.values();
  assert.equal(ultra.tier, 'ultra');
  assert.equal(ultra.terrain, 'ultra-full');
  assert.notDeepEqual(ultra.shadowRig, daylight.shadowRig, 'the Ultra rig was written');
  walked.runtime.setWanted(false, null);
  walked.runtime.reconcile();
  assert.deepEqual(walked.values(), daylight);

  // park → ultra → slice → ordinary, against park → slice with no Ultra at all
  const toured = runtimeFixture();
  toured.world(WARM_LATE_AFTERNOON);
  toured.runtime.setWanted(true, null);
  toured.runtime.reconcile();
  toured.world();
  assert.equal(toured.runtime.active, true, 'the slice was built at Ultra');
  toured.runtime.setWanted(false, null);
  toured.runtime.reconcile();

  const direct = runtimeFixture();
  direct.world(WARM_LATE_AFTERNOON);
  direct.world();
  assert.deepEqual(toured.values(), direct.values());
  const { counts } = toured.tier.counting;
  assert.equal(counts.environmentsDisposed, counts.environmentsBuilt);
  assert.equal(counts.skiesDisposed, counts.skiesPainted);
});

test('the Ultra sky key (the plan’s cumulus seed) repaints on the Ultra tier only, and an ordinary rig never reads it', () => {
  const counting = countingHooks();
  let key = 7;
  let keyReads = 0;
  const hooks: VenueLightingHooks = {
    ...counting.hooks,
    ultraSkyKey: (): number => {
      keyReads += 1;
      return key;
    },
  };
  const scene = new THREE.Scene();
  const hemisphere = new THREE.HemisphereLight(0x000000, 0x000000, 0);
  const sun = new THREE.DirectionalLight(0x000000, 0);
  const rig = createVenueLighting({ scene, sun, hemisphere, setExposure: () => {} }, hooks);

  // Ordinary: world swaps and a moved key are invisible to the rig.
  rig.apply(undefined);
  key = 8;
  rig.apply(undefined);
  assert.equal(keyReads, 0, 'an ordinary rig never asks for the Ultra sky key');
  assert.equal(counting.counts.skiesPainted, 0);

  // Ultra: one sky on entry; the same look and key paints nothing more…
  rig.setTier('ultra');
  assert.equal(counting.counts.skiesPainted, 1);
  rig.apply(undefined);
  assert.equal(counting.counts.skiesPainted, 1);
  // …and a moved key on the same look repaints once, disposing the old sky first.
  key = 9;
  rig.apply(undefined);
  assert.equal(counting.counts.skiesPainted, 2);
  assert.equal(counting.counts.skiesDisposed, 1);
  assert.equal(counting.counts.environmentsBuilt, 1, 'the environment follows the look alone');

  // Back to ordinary: the key is not read again.
  rig.setTier('ordinary');
  const reads = keyReads;
  key = 10;
  rig.apply(undefined);
  assert.equal(keyReads, reads);
  assert.equal(counting.counts.skiesDisposed, counting.counts.skiesPainted);
});
