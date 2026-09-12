/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { generateLevel } from '../level/generateRoute.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createTerrain } from './terrain.ts';
import { createVenueLighting, type VenueLighting } from './Renderer.ts';
import { LIGHTING } from '../data/tuning.ts';
import type { VenueLook } from '../data/venueLook.ts';

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
