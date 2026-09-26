/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { LIGHTING, ULTRA } from '../../data/tuning.ts';
import type { VenueLook } from '../../data/venueLook.ts';
import type { LevelPlan } from '../../level/plan.ts';
import {
  ENHANCED_PRESENTATION,
  presentationCost,
  type PresentationSelection,
} from '../presentation.ts';
import { createSliceLevel } from '../../level/sliceLevel.ts';
import { createCopRider } from '../copRider.ts';
import { createVenueLighting, type UltraEnvironment, type VenueLighting } from '../Renderer.ts';
import { createSky, cumulusSeedFor, type SkyOptions, type SkyTexture } from '../sky.ts';
import { DAYLIGHT_LOOK } from '../../data/venueLook.ts';
import type { TerrainView } from '../terrain.ts';
import { HEADLESS_CAPS, ultraEnvironmentSourceBytes, type UltraCaps } from './ultraCost.ts';
import { downSunOf } from './groundContact.ts';
import { EMPTY_FAR_SHADOW_BYTES, emptyFarShadowMap, type UltraFarShadow } from './ultraFarShadow.ts';
import { ULTRA_CONTACT_SLOTS, ULTRA_CONTACT_VEC4_PER_SLOT } from './ultraGroundDetail.ts';
import { applyKitOverride, ULTRA_FULL, ULTRA_LIT, ULTRA_STATIC_LAYER } from './ultraRecipe.ts';
import { hasRiderShadow, ULTRA_RIDER_SHADOW_KEY } from './ultraRiderShadow.ts';
import { ultraFramebufferStatus } from './ultraRendererState.ts';
import { ultraShadowMapSizesFor } from './ultraShadowSizes.ts';
import {
  bakeUltraSkyBackground,
  GL_ERROR_READS,
  GL_FRAMEBUFFER_COMPLETE,
  GL_INVALID_ENUM,
  GL_INVALID_FRAMEBUFFER_OPERATION,
  GL_OUT_OF_MEMORY,
  glFinding,
  glNoticeMessage,
  isReceivingRig,
  ULTRA_CONTACT_RIGS,
  ULTRA_SKY_CACHE_ENTRIES,
  UltraSkyCache,
  ultraDrawingBufferFor,
  measuredPropColourTriangles,
  missingCapability,
  picksUpEnvironment,
  releaseEnvironmentPrograms,
  shippedUltraLive,
  ultraPixelCap,
  ultraPresentationCost,
  UltraRuntime,
  type ShaderErrorHook,
  type UltraHost,
  type UltraJudgement,
} from './ultraRuntime.ts';
import type {
  BuildRecipe,
  UltraBuildContext,
  UltraFaultStage,
  UltraFrameCost,
  UltraKitOverride,
  UltraRecipe,
  UltraTierResult,
} from './ultraTypes.ts';

/**
 * The Ultra runtime's lifecycle, headlessly — M39 (`docs/M39_ULTRA.md` §3.6,
 * §6.3 W5).
 *
 * A browser can only ever watch Ultra fail at the one stage a URL planted,
 * and it cannot see a WeakMap or a ledger entry that should have gone. Here
 * the runtime drives a fake `UltraHost`: a real scene, a real sun and
 * hemisphere, the real venue rig (`createVenueLighting`) with the runtime's
 * own hooks, W4's real rig writers — and counting fakes for everything that
 * would need a GL context (the terrain build, the sky painter, the PMREM
 * environment, the far map, the first frame and the shader hook). So every
 * assertion below is about the runtime's own decisions: order, refusal
 * scope, exact restoration, the ledger, and the rider flags.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

const MIB = 1024 * 1024;

/** The model a fake judge admits with: small, recognisable numbers. */
const FAKE_COST: UltraFrameCost = Object.freeze({
  solo: Object.freeze({ drawCalls: 150, triangles: 700_000 }),
  props: Object.freeze({ drawCalls: 30, triangles: 300_000 }),
  passes: Object.freeze([
    Object.freeze({ name: 'near-shadow', when: 'every-frame', drawCalls: 25, triangles: 200_000 }),
    Object.freeze({ name: 'colour', when: 'every-frame', drawCalls: 35, triangles: 373_382 }),
    Object.freeze({ name: 'pmrem-build', when: 'activation', drawCalls: 20, triangles: 40 }),
  ]),
}) as UltraFrameCost;

function admit(recipe: UltraRecipe): UltraJudgement {
  return { recipe, cost: FAKE_COST, refusal: null, rungs: [] };
}

/** A plan the fakes never read beyond its look, its id (the cumulus seed) and identity. */
function fakePlan(look?: VenueLook, id = 'fake-plan'): LevelPlan {
  return { id, look } as unknown as LevelPlan;
}

const SELECTION: PresentationSelection = Object.freeze({
  recipe: ENHANCED_PRESENTATION,
  cost: presentationCost(createSliceLevel(), ENHANCED_PRESENTATION),
  verdicts: [],
});

/** The Switchback look, which moves every axis a look has. */
const WARM: VenueLook = {
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

interface Counts {
  skiesPainted: number;
  /** The cumulus seed each Ultra sky was painted with, in order. */
  skySeeds: number[];
  skiesDisposed: number;
  environmentsBuilt: number;
  environmentsDisposed: number;
  terrainsBuilt: string[];
  terrainsDisposed: number;
  farBuilds: number;
  /** The edge of each far map built, in order (A22). */
  farSizes: number[];
  firstFrames: number;
  resizes: number;
  /** F3: background cubes baked, re-baked and disposed (only with `bake`). */
  cubesBaked: number;
  cubesRebaked: number;
  cubesDisposed: number;
  /** A28, FE: cube faces released at a context loss, the cube kept (only with `bake`). */
  cubesReleased: number;
}

interface Fixture {
  readonly runtime: UltraRuntime;
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  readonly hemisphere: THREE.HemisphereLight;
  readonly lighting: VenueLighting;
  readonly camera: THREE.PerspectiveCamera;
  readonly counts: Counts;
  /** What the host's fakes answer; tests change these between calls. */
  readonly host: {
    views: number;
    caps: UltraCaps;
    judge: (plan: LevelPlan, override: UltraKitOverride | null) => UltraJudgement;
    firstFrameCode: number;
    /** Called inside the first frame, like a program failing to link would. */
    duringFirstFrame: (() => void) | null;
    /** Called inside `installTerrain` after the old view is disposed, like a builder would. */
    duringBuild: ((context: UltraBuildContext | null) => void) | null;
    shaderHook: ShaderErrorHook | null;
    /** The canvas the host reports: CSS size and the ordinary ratio. */
    canvas: { width: number; height: number; pixelRatio: number };
    /** A28 C1: the context's pending GL errors, oldest first (`readGlErrors` takes them). */
    glPending: number[];
    /** A28 C1: a lost context — every `getError` answers this, forever. */
    glForever: number | null;
    /** A28 C1: what `framebufferStatus` answers for a target. */
    framebuffer: (target: THREE.RenderTarget) => number | null;
    /** A28 C1: the codes `raiseGlError` was asked for, in order. */
    raised: number[];
    /** Called inside each allocation stage's fake, like a GPU step raising an error would. */
    onStage: ((stage: 'sky' | 'environment' | 'far-shadow') => void) | null;
    /** A28, FE: called inside `buildFarShadow` with the runtime's far map, so a test can really build one. */
    farBuild: ((far: UltraFarShadow, sunOffsetUnit: THREE.Vector3) => void) | null;
    /** The host calls, in order: GL reads (`read`), the stages, the first frame. */
    log: string[];
  };
  terrain(): TerrainView | null;
  /** The build context the last Ultra terrain was built with (its shared uniforms), or null. */
  context(): UltraBuildContext | null;
  exposure(): number;
}

/** A terrain view the runtime can install and dispose, with nothing on the GPU. */
function fakeTerrain(recipe: BuildRecipe, context: UltraBuildContext | null, counts: Counts): TerrainView {
  const group = new THREE.Group();
  group.name = 'level-terrain';
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const props = new THREE.InstancedMesh(geometry, material, 3);
  props.name = 'level-props-trunk';
  group.add(props);
  counts.terrainsBuilt.push(recipe.id);
  return {
    group,
    cellsDrawn: 0,
    triangles: 36,
    recipe: recipe.id,
    blockTriangles: 1234,
    textures: 0,
    ultra: context === null
      ? null
      : { bytes: 3 * MIB, textures: 2, attributeBytes: MIB, filledCorners: 0 },
    setSurroundCentre(): void {},
    dispose(): void {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      counts.terrainsDisposed += 1;
    },
  } as unknown as TerrainView;
}

/** The fake background cube's bytes: the model's 1024-face figure, recognisably. */
const FAKE_CUBE_BYTES = 32 * MIB;

function fixture(options: { readonly bake?: boolean | 'throw' } = {}): Fixture {
  const scene = new THREE.Scene();
  const hemisphere = new THREE.HemisphereLight(0x000000, 0x000000, 0);
  scene.add(hemisphere);

  // The renderer constructor's ordinary rig, written the way it writes it.
  const sun = new THREE.DirectionalLight(0x000000, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(LIGHTING.shadowMapSize);
  sun.shadow.bias = LIGHTING.shadowBias;
  sun.shadow.normalBias = LIGHTING.shadowNormalBias;
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -LIGHTING.shadowRadius;
  shadowCamera.right = LIGHTING.shadowRadius;
  shadowCamera.top = LIGHTING.shadowRadius;
  shadowCamera.bottom = -LIGHTING.shadowRadius;
  shadowCamera.near = 1;
  shadowCamera.far = LIGHTING.sunDistance * 2;
  shadowCamera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.set(0, 2, -5);
  camera.lookAt(0, 1, 0);

  const counts: Counts = {
    skiesPainted: 0,
    skySeeds: [],
    skiesDisposed: 0,
    environmentsBuilt: 0,
    environmentsDisposed: 0,
    terrainsBuilt: [],
    terrainsDisposed: 0,
    farBuilds: 0,
    farSizes: [],
    firstFrames: 0,
    resizes: 0,
    cubesBaked: 0,
    cubesRebaked: 0,
    cubesDisposed: 0,
    cubesReleased: 0,
  };
  const hostState: Fixture['host'] = {
    views: 1,
    caps: { ...HEADLESS_CAPS },
    judge: (_plan, override) => admit(applyKitOverride(ULTRA_FULL, override)),
    firstFrameCode: 0,
    duringFirstFrame: null,
    duringBuild: null,
    shaderHook: null,
    // q205's reference: 1920×1080 at DPR 1, where the budget does not bind.
    canvas: { width: 1920, height: 1080, pixelRatio: 1 },
    glPending: [],
    glForever: null,
    framebuffer: () => GL_FRAMEBUFFER_COMPLETE,
    raised: [],
    onStage: null,
    farBuild: null,
    log: [],
  };

  let terrain: TerrainView | null = null;
  let lastContext: UltraBuildContext | null = null;
  let exposure = Number.NaN;
  // Created after the runtime, exactly as in the renderer; the host asks for it.
  let lighting: VenueLighting | null = null;
  let tick = 0;

  const host: UltraHost = {
    scene,
    sun,
    lighting: () => {
      if (lighting === null) throw new Error('the rig is not built yet');
      return lighting;
    },
    ordinaryQuality: () => 'high',
    viewCount: () => hostState.views,
    probeCaps: () => hostState.caps,
    maxAnisotropy: () => 1,
    judge: (plan, _caps, override) => hostState.judge(plan, override),
    installedTerrain: () => terrain,
    installTerrain: (_plan, recipe, context, beforeBuild) => {
      terrain?.dispose();
      terrain = null;
      // As the renderer: the planted build fault fires with the old world gone.
      beforeBuild?.();
      hostState.duringBuild?.(context);
      const view = fakeTerrain(recipe, context, counts);
      lastContext = context;
      terrain = view;
      scene.add(view.group);
      return view;
    },
    paintUltraSky: (_look, cloudSeed): SkyTexture => {
      counts.skiesPainted += 1;
      counts.skySeeds.push(cloudSeed);
      hostState.log.push('sky');
      const texture = new THREE.DataTexture(new Uint8Array(8 * 4 * 4), 8, 4, THREE.RGBAFormat);
      texture.name = 'fake-ultra-sky';
      texture.generateMipmaps = false;
      hostState.onStage?.('sky');
      return {
        texture,
        dispose(): void {
          counts.skiesDisposed += 1;
          texture.dispose();
        },
      };
    },
    buildEnvironment: (): UltraEnvironment => {
      counts.environmentsBuilt += 1;
      hostState.log.push('environment');
      const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
      // A28 C1: a target the activation checks the framebuffer of, by name.
      const target = new THREE.WebGLRenderTarget(1, 1);
      target.texture.name = 'fake-environment-target';
      hostState.onStage?.('environment');
      return {
        texture,
        target,
        bytes: 6 * MIB,
        cubeSize: 256,
        dispose(): void {
          counts.environmentsDisposed += 1;
          texture.dispose();
          target.dispose();
        },
      };
    },
    buildFarShadow: (far, sunOffsetUnit) => {
      counts.farBuilds += 1;
      counts.farSizes.push(far.mapSize);
      hostState.log.push('far-shadow');
      hostState.farBuild?.(far, sunOffsetUnit);
      hostState.onStage?.('far-shadow');
    },
    drawFirstFrame: () => {
      counts.firstFrames += 1;
      hostState.log.push('first-frame');
      runtime.beforeSoloRender(camera);
      hostState.duringFirstFrame?.();
      return hostState.firstFrameCode;
    },
    readGlErrors: (limit) => {
      hostState.log.push(`read(${limit})`);
      if (hostState.glForever !== null) return new Array<number>(limit).fill(hostState.glForever);
      return hostState.glPending.splice(0, limit);
    },
    framebufferStatus: (target) => hostState.framebuffer(target),
    raiseGlError: (code) => {
      hostState.raised.push(code);
      hostState.glPending.push(code);
    },
    setShaderErrorHook: (hook) => {
      hostState.shaderHook = hook;
    },
    canvas: () => hostState.canvas,
    resize: () => {
      counts.resizes += 1;
      // As the renderer's resize: the buffer the (possibly capped) ratio draws.
      if (runtime.active) {
        const { width, height, pixelRatio } = hostState.canvas;
        const ratio = Math.min(pixelRatio, runtime.tierPixelCap(width, height));
        runtime.onDrawingBuffer(Math.floor(width * ratio), Math.floor(height * ratio));
      }
    },
    setShadowFocus: (x, y, z) => {
      // `GameRenderer.setShadowFocus`, literally.
      const offset = host.lighting().sunOffset;
      sun.target.position.set(x, y, z);
      sun.position.set(x + offset.x, y + offset.y, z + offset.z);
    },
    now: () => {
      tick += 1;
      return tick;
    },
  };

  if (options.bake !== undefined) {
    // F3: the renderer's `bakeUltraSkyBackground`, faked — a cube texture
    // the rig hangs, with the model's bytes.
    host.bakeSkyBackground = (sky) => {
      if (options.bake === 'throw') throw new Error('no cube today');
      counts.cubesBaked += 1;
      const texture = new THREE.CubeTexture();
      texture.name = `cube-of-${sky.name}`;
      // A28 C1: the target whose framebuffers the activation checks.
      const target = new THREE.WebGLCubeRenderTarget(1);
      target.texture.name = 'fake-sky-cube-target';
      return {
        texture,
        target,
        bytes: FAKE_CUBE_BYTES,
        rebake(): void {
          counts.cubesRebaked += 1;
        },
        release(): void {
          counts.cubesReleased += 1;
          hostState.log.push('release(sky-cube)');
        },
        dispose(): void {
          counts.cubesDisposed += 1;
          texture.dispose();
          target.dispose();
        },
      };
    };
  }

  const runtime = new UltraRuntime(host);
  lighting = createVenueLighting(
    {
      scene,
      sun,
      hemisphere,
      setExposure: (value: number): void => {
        exposure = value;
      },
    },
    runtime.lightingHooks,
  );
  // The first world, exactly as `setLevel` installs it.
  runtime.installWorld(fakePlan(), SELECTION, undefined);

  return {
    runtime,
    scene,
    sun,
    hemisphere,
    lighting,
    camera,
    counts,
    host: hostState,
    terrain: () => terrain,
    context: () => lastContext,
    exposure: () => exposure,
  };
}

/** A rider rig as `render/ridingRig.ts` names it, with mixed authored flags. */
function riderRig(name = 'riding-rig'): { group: THREE.Group; meshes: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.name = name;
  const geometry = new THREE.BoxGeometry();
  const meshes = [0, 1, 2].map((index) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    // Body parts do not receive; the tyre does — as authored today.
    mesh.receiveShadow = index === 2;
    group.add(mesh);
    return mesh;
  });
  return { group, meshes };
}

/** Every field the runtime or the rig writes, as plain values. */
function state(f: Fixture): Record<string, unknown> {
  const shadow = f.sun.shadow;
  const camera = shadow.camera;
  const fog = f.scene.fog as THREE.Fog;
  const background = f.scene.background as THREE.DataTexture;
  return {
    mapSize: [shadow.mapSize.x, shadow.mapSize.y],
    bias: shadow.bias,
    normalBias: shadow.normalBias,
    radius: shadow.radius,
    shadowIntensity: shadow.intensity,
    box: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far],
    sunPosition: f.sun.position.toArray(),
    sunTarget: f.sun.target.position.toArray(),
    sunIntensity: f.sun.intensity,
    sunColour: f.sun.color.getHex(),
    hemisphereIntensity: f.hemisphere.intensity,
    hemisphereSky: f.hemisphere.color.getHex(),
    hemisphereGround: f.hemisphere.groundColor.getHex(),
    fog: [fog.color.getHex(), fog.near, fog.far],
    exposure: f.exposure(),
    environment: f.scene.environment === null ? null : f.scene.environment.name,
    environmentIntensity: f.scene.environmentIntensity,
    lightingTier: f.lighting.tier,
    sky: [background.name, background.image.width, background.image.height],
  };
}

function report(f: Fixture): ReturnType<UltraRuntime['report']> {
  return f.runtime.report({
    sky: { width: 1, height: 1, anisotropy: 1 },
    drawingBuffer: { width: 1920, height: 1080, ratio: 1, tierCap: f.runtime.tierPixelCap(1920, 1080) },
    programs: 0,
  });
}

/** Silence (and count) the runtime's console lines for one call. */
function quietly<T>(run: () => T): { value: T; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const error = console.error;
  const warn = console.warn;
  console.error = (...args: unknown[]): void => {
    errors.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]): void => {
    warnings.push(args.map(String).join(' '));
  };
  try {
    return { value: run(), errors, warnings };
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

// ---------------------------------------------------------------------------

test('an ordinary session never engages: no Ultra build, no ledger, no tier cap', () => {
  const f = fixture();
  const before = state(f);
  f.runtime.installWorld(fakePlan(WARM), SELECTION, undefined);
  f.runtime.installWorld(fakePlan(), SELECTION, undefined);
  const result = f.runtime.reconcile();

  assert.equal(result.active, false);
  assert.equal(result.terrainChanged, false, 'an ordinary reconcile rebuilds nothing');
  assert.equal(result.refusal, null, 'nothing was asked for, so nothing was refused');
  assert.deepEqual(f.counts.terrainsBuilt, ['enhanced', 'enhanced', 'enhanced']);
  assert.equal(f.counts.skiesPainted, 0, 'no Ultra sky painted');
  assert.equal(f.counts.environmentsBuilt, 0, 'no environment built');
  assert.equal(f.counts.firstFrames, 0);
  assert.equal(f.runtime.active, false);
  assert.equal(f.runtime.tierPixelCap(1440, 900), Number.POSITIVE_INFINITY);
  assert.deepEqual(state(f), before, 'the daylight world comes back exactly');
  const ordinary = report(f);
  assert.equal(ordinary.requested, false);
  assert.equal(ordinary.recipe, 'enhanced');
  assert.equal(ordinary.bytes.steady, 0);
  assert.deepEqual(ordinary.targets, []);
});

test('activation builds every piece, and the one teardown returns every written field', () => {
  const f = fixture();
  const rider = riderRig();
  const cop = riderRig('cop-rider');
  f.scene.add(rider.group);
  f.scene.add(cop.group);
  const before = state(f);
  const authored = [...rider.meshes, ...cop.meshes].map((mesh) => mesh.receiveShadow);

  f.runtime.setWanted(true, null);
  const on = f.runtime.reconcile();
  assert.equal(on.active, true);
  assert.equal(on.recipe, 'ultra-full');
  assert.equal(on.terrainChanged, true);
  assert.equal(f.runtime.active, true);
  assert.equal(f.lighting.tier, 'ultra');
  assert.notEqual(f.scene.environment, null, 'the environment is the fill');
  assert.equal(f.counts.environmentsBuilt, 1);
  assert.equal(f.counts.skiesPainted, 1, 'one Ultra sky');
  assert.equal(f.terrain()?.recipe, 'ultra-full');
  assert.equal(f.counts.firstFrames, 1, 'one first frame, with its getError');
  assert.equal(f.counts.farBuilds, ULTRA_FULL.ultra.farShadow ? 1 : 0);
  assert.ok(f.host.shaderHook !== null, 'the shader-error hook is installed while active');
  for (const mesh of [...rider.meshes, ...cop.meshes]) assert.equal(mesh.receiveShadow, true);
  // The live near values reach the rig, whatever W4's rule says of the rest.
  assert.equal(f.sun.shadow.bias, ULTRA.nearBias);
  assert.equal(f.sun.shadow.normalBias, ULTRA.nearNormalBias);
  assert.equal(f.sun.shadow.radius, ULTRA.nearRadius);
  const cap = f.runtime.tierPixelCap(1440, 900);
  assert.ok(Number.isFinite(cap), 'the pixel budget binds while active');

  const live = report(f);
  assert.equal(live.active, true);
  assert.equal(live.recipe, 'ultra-full');
  assert.deepEqual(live.kit, ULTRA_FULL.ultra);
  assert.deepEqual(live.cost, FAKE_COST);
  assert.ok(live.bytes.steady >= 6 * MIB + 3 * MIB, 'the environment and the world are in the ledger');
  // Fable N5: the live switch peak carries what the model's does — the PMREM
  // ping-pong (the environment's size) and the 4 MiB half-float source.
  assert.equal(live.bytes.peakSwitch - live.bytes.steady, 6 * MIB + ultraEnvironmentSourceBytes());
  assert.equal(ultraEnvironmentSourceBytes(), 4 * MIB);
  assert.equal(live.environment?.cubeSize, 256);
  assert.notEqual(live.shadow, null);

  f.runtime.setWanted(false, null);
  const off = f.runtime.reconcile();
  assert.equal(off.active, false);
  assert.equal(off.recipe, 'enhanced');
  assert.equal(off.terrainChanged, true);
  assert.deepEqual(state(f), before, 'leaving Ultra left something behind on the light, the rig or the sky');
  assert.deepEqual([...rider.meshes, ...cop.meshes].map((mesh) => mesh.receiveShadow), authored);
  assert.equal(f.counts.environmentsDisposed, f.counts.environmentsBuilt);
  assert.equal(f.counts.skiesDisposed, f.counts.skiesPainted, 'the Ultra sky is gone');
  assert.equal(f.terrain()?.recipe, 'enhanced');
  assert.equal(f.host.shaderHook, null, 'the hook goes with the tier');
  assert.equal(f.runtime.tierPixelCap(1440, 900), Number.POSITIVE_INFINITY);
  const after = report(f);
  assert.equal(after.bytes.steady, 0, 'the ledger reads zero');
  assert.equal(after.bytes.peakSwitch, 0);
  assert.deepEqual(after.targets, []);

  // The listener went too: a rig added now keeps its own flags.
  const late = riderRig();
  f.scene.add(late.group);
  assert.deepEqual(late.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);

  // Idempotent: a second and third teardown change nothing.
  const settled = state(f);
  const built = f.counts.terrainsBuilt.length;
  f.runtime.teardown();
  f.runtime.teardown('exit');
  assert.deepEqual(state(f), settled);
  assert.equal(f.counts.terrainsBuilt.length, built);
});

test('leaving Ultra releases the environment programs of every material that outlives the tier, and nothing else', () => {
  // §3.6 step 7: the program count returns to its pre-Ultra value. three keeps
  // every program a material ever compiled until the material is disposed, so
  // the rider's Standard materials would keep their environment-lit variants
  // (the integrator's first browser round trip came back 12 → 15). The release
  // is `Material.dispose()` — an event, which headlessly is all there is to see.
  const f = fixture();
  const rider = riderRig();
  const ghostMaterial = new THREE.MeshBasicMaterial();
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(), ghostMaterial);
  ghost.name = 'ghost-rider';
  const shared = new THREE.MeshStandardMaterial();
  const pair = [new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Mesh(new THREE.BoxGeometry(), [shared, shared])];
  f.scene.add(rider.group, ghost, ...pair);
  const disposed = new Map<THREE.Material, number>();
  const watch = (material: THREE.Material): void => {
    material.addEventListener('dispose', () => disposed.set(material, (disposed.get(material) ?? 0) + 1));
  };
  for (const mesh of rider.meshes) watch(mesh.material as THREE.Material);
  watch(ghostMaterial);
  watch(shared);

  // An ordinary session releases nothing: ordinary programs are never touched.
  f.runtime.installWorld(fakePlan(WARM), SELECTION, undefined);
  f.runtime.reconcile();
  assert.equal(disposed.size, 0);

  // Fable N2: entering the lit tier releases the ordinary variants the same
  // materials compiled under the ordinary light — once each, and never the
  // new world's own or a MeshBasic's.
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(f.runtime.active, true);
  for (const mesh of rider.meshes) {
    assert.equal(disposed.get(mesh.material as THREE.Material), 1, 'each rider material released once on entry');
  }
  assert.equal(disposed.get(shared), 1, 'a material shared by meshes and groups is released once on entry');
  assert.equal(disposed.get(ghostMaterial), undefined, 'MeshBasic never picks up the environment');

  // A world swap under Ultra holds nothing ordinary, so releases nothing.
  f.runtime.installWorld(fakePlan(WARM, 'second-world'), SELECTION, undefined);
  assert.equal(f.runtime.active, true);
  assert.equal(disposed.get(shared), 1, 'a world swap under Ultra re-released the environment programs');

  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  for (const mesh of rider.meshes) {
    assert.equal(disposed.get(mesh.material as THREE.Material), 2, 'each rider material released once on exit');
  }
  assert.equal(disposed.get(shared), 2, 'a material shared by meshes and groups is released once on exit');
  assert.equal(disposed.get(ghostMaterial), undefined, 'MeshBasic never picks up the environment');

  // Idempotent: the tier is gone, so a second teardown releases nothing more.
  f.runtime.teardown('exit');
  assert.equal(disposed.get(shared), 2);

  // `dispose` leaves program release to the renderer's own shutdown (the
  // entry still releases the ordinary variants, as every entry does).
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(disposed.get(shared), 3, 'the second entry released the ordinary variants again');
  f.runtime.teardown('dispose');
  assert.equal(disposed.get(shared), 3, 'the renderer frees every program itself on dispose');
});

/**
 * three's program cache, modelled closely enough to count programs the way
 * `renderer.info.programs` does: a material drawn in a frame acquires the
 * program for its current key — its class, whether the scene environment
 * reaches it (`picksUpEnvironment`), and its `customProgramCacheKey()` (the
 * rider's fixed-disk shadow patch) — and holds every key it ever acquired
 * until it is disposed (`releaseMaterialProgramReferences`). A program lives
 * while any material holds its key.
 */
function programCache(scene: THREE.Scene): { draw(): void; count(): number } {
  const held = new Map<THREE.Material, Set<string>>();
  const listen = (material: THREE.Material): void => {
    const drop = (): void => {
      held.delete(material);
      material.removeEventListener('dispose', drop);
    };
    material.addEventListener('dispose', drop);
  };
  return {
    draw(): void {
      scene.traverse((node) => {
        const material = (node as Partial<THREE.Mesh>).material;
        if (material === undefined || !node.visible) return;
        for (const each of Array.isArray(material) ? material : [material]) {
          let keys = held.get(each);
          if (keys === undefined) {
            keys = new Set();
            held.set(each, keys);
            listen(each);
          }
          const lit = picksUpEnvironment(each) && scene.environment !== null ? 'environment' : 'hemisphere';
          keys.add(`${each.type}|${lit}|${each.customProgramCacheKey()}`);
        }
      });
    },
    count(): number {
      const live = new Set<string>();
      for (const keys of held.values()) for (const key of keys) live.add(key);
      return live.size;
    },
  };
}

test('N2: an entry after an exit holds exactly the programs a first entry does, and the counts plateau both ways', () => {
  // The Fable re-verify read 22 programs on the slice's first activation and
  // 25 on every entry after an exit: the rider, wheel and cop materials (and
  // every other Standard material outside the world) kept the ordinary
  // variant the High frames compiled beside the environment one.
  const dress = (f: Fixture): void => {
    f.scene.add(riderRig().group, riderRig('cop-rider').group);
    const gate = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    gate.name = 'gate';
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    ghost.name = 'ghost-rider';
    f.scene.add(gate, ghost);
  };

  // The first activation with no ordinary frame behind it (a boot into Ultra).
  const boot = fixture();
  dress(boot);
  const bootCache = programCache(boot.scene);
  boot.runtime.setWanted(true, null);
  boot.runtime.reconcile();
  assert.equal(boot.runtime.active, true);
  bootCache.draw();
  const firstEntry = bootCache.count();

  // A session that rides High first, then goes Ultra → High → Ultra, three times.
  const f = fixture();
  dress(f);
  const cache = programCache(f.scene);
  cache.draw();
  const high = cache.count();
  const ultraCounts: number[] = [];
  const highCounts: number[] = [];
  for (let round = 0; round < 3; round += 1) {
    f.runtime.setWanted(true, null);
    f.runtime.reconcile();
    assert.equal(f.runtime.active, true);
    cache.draw();
    cache.draw();
    ultraCounts.push(cache.count());
    f.runtime.setWanted(false, null);
    f.runtime.reconcile();
    cache.draw();
    highCounts.push(cache.count());
  }
  assert.ok(firstEntry > high, `the Ultra frame compiles its own variants (${firstEntry} against High's ${high})`);
  assert.deepEqual(ultraCounts, [firstEntry, firstEntry, firstEntry], 'every entry holds what the first did');
  assert.deepEqual(highCounts, [high, high, high], 'every exit holds what High did');

  // A world swap under Ultra keeps the count (nothing released, nothing extra).
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  cache.draw();
  f.runtime.installWorld(fakePlan(WARM, 'second-world'), SELECTION, undefined);
  cache.draw();
  assert.equal(cache.count(), firstEntry);

  // Under `-lighting` nothing environment-lit is compiled, so an entry from
  // it is an entry from the ordinary light: the lit rung's count again.
  f.runtime.setWanted(true, { lighting: false });
  f.runtime.reconcile();
  cache.draw();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  cache.draw();
  assert.equal(cache.count(), firstEntry);
});

test('the program release skips the installed world and reaches Lambert and Phong as three does', () => {
  const root = new THREE.Group();
  const world = new THREE.Group();
  const worldMaterial = new THREE.MeshStandardMaterial();
  world.add(new THREE.Mesh(new THREE.BoxGeometry(), worldMaterial));
  const kinds = [
    new THREE.MeshStandardMaterial(),
    new THREE.MeshPhysicalMaterial(),
    new THREE.MeshLambertMaterial(),
    new THREE.MeshPhongMaterial(),
    new THREE.MeshBasicMaterial(),
    new THREE.PointsMaterial(),
  ];
  root.add(world, ...kinds.map((material) => new THREE.Mesh(new THREE.BoxGeometry(), material)));
  const seen: THREE.Material[] = [];
  for (const material of [worldMaterial, ...kinds]) {
    material.addEventListener('dispose', () => seen.push(material));
  }
  assert.equal(releaseEnvironmentPrograms(root, world), 4);
  assert.deepEqual(seen, kinds.slice(0, 4), 'environment-keyed classes only, and never the world');
  assert.equal(picksUpEnvironment(new THREE.ShaderMaterial()), false);
});

const STAGES: readonly UltraFaultStage[] = [
  'build',
  'sky',
  'environment',
  'shadow',
  'far-shadow',
  'shader',
  'gl-error',
];

for (const stage of STAGES) {
  test(`a failure at "${stage}" tears everything down, refuses for the session, and teardown stays idempotent`, () => {
    const f = fixture();
    const rider = riderRig();
    f.scene.add(rider.group);
    const before = state(f);

    f.runtime.setFault(stage);
    f.runtime.setWanted(true, null);
    const { value: result, warnings } = quietly(() => f.runtime.reconcile());

    assert.equal(result.active, false);
    assert.deepEqual(
      { kind: result.refusal?.kind, stage: result.refusal?.kind === 'setup-failed' ? result.refusal.stage : null },
      { kind: 'setup-failed', stage },
    );
    assert.equal(warnings.length, 1, 'one line says why');
    assert.deepEqual(state(f), before, `a failure at ${stage} left part of Ultra behind`);
    assert.deepEqual(rider.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);
    assert.equal(f.terrain()?.recipe, 'enhanced', 'the ordinary world is what is installed');
    assert.equal(f.counts.environmentsDisposed, f.counts.environmentsBuilt, 'no environment leaked');
    assert.equal(f.counts.skiesDisposed, f.counts.skiesPainted, 'no Ultra sky leaked');
    assert.equal(f.host.shaderHook, null);
    assert.equal(report(f).bytes.steady, 0);
    assert.equal(f.runtime.tierPixelCap(1440, 900), Number.POSITIVE_INFINITY);

    // Sticky: the next world and the next reconcile do not try again.
    const built = f.counts.terrainsBuilt.length;
    const again = f.runtime.reconcile();
    f.runtime.installWorld(fakePlan(WARM), SELECTION, undefined);
    assert.equal(again.active, false);
    assert.equal(f.runtime.active, false);
    assert.equal(f.runtime.refusal?.kind, 'setup-failed');
    assert.deepEqual(f.counts.terrainsBuilt.slice(built), ['enhanced'], 'only the ordinary world was built');

    // Idempotent after partial construction.
    const settled = state(f);
    f.runtime.teardown();
    f.runtime.teardown('exit');
    assert.deepEqual(state(f), settled);
  });
}

test('a shader that fails after activation demotes at the next frame, and says so once', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(f.runtime.active, true);
  const hook = f.host.shaderHook;
  assert.ok(hook !== null);

  const { errors } = quietly(() => {
    hook('ERROR: 0:1: an Ultra patch that does not link');
    hook('a second report of the same failure');
  });
  assert.equal(errors.length, 1, 'three’s own report is silenced by the hook, so the runtime says it — once');
  assert.equal(f.runtime.demotionPending, true);
  assert.equal(f.runtime.active, true, 'never inside a render: the demotion waits for the frame boundary');

  quietly(() => f.runtime.demote());
  assert.equal(f.runtime.active, false);
  assert.equal(f.runtime.refusal?.kind, 'setup-failed');
  assert.equal(f.runtime.refusal?.kind === 'setup-failed' ? f.runtime.refusal.stage : null, 'shader');
  assert.equal(f.terrain()?.recipe, 'enhanced');
});

test('a first frame that runs out of memory refuses on gl-error', () => {
  const f = fixture();
  f.host.firstFrameCode = GL_OUT_OF_MEMORY;
  f.runtime.setWanted(true, null);
  const { value: result } = quietly(() => f.runtime.reconcile());
  assert.equal(result.active, false);
  assert.equal(result.refusal?.kind === 'setup-failed' ? result.refusal.stage : null, 'gl-error');
});

test('a shader failing inside the first frame refuses on shader, not later', () => {
  const f = fixture();
  f.host.duringFirstFrame = (): void => f.host.shaderHook?.('link failed');
  f.runtime.setWanted(true, null);
  const { value: result } = quietly(() => f.runtime.reconcile());
  assert.equal(result.active, false);
  assert.equal(result.refusal?.kind === 'setup-failed' ? result.refusal.stage : null, 'shader');
});

// ---------------------------------------------------------------------------
// A28 C1 — GPU errors reach the fallback (Codex's post-GU finding)
// ---------------------------------------------------------------------------

/** The refusal a result carries, as `{ stage, message }`, or null. */
function setupFailure(refusal: UltraTierResult['refusal']): { stage: string; message: string } | null {
  return refusal?.kind === 'setup-failed' ? { stage: refusal.stage, message: refusal.message } : null;
}

/** The far map on, whatever `ULTRA.farShadow.enabled` ships as, so all four stages run. */
const ALL_STAGES: UltraKitOverride = Object.freeze({ farShadow: true });

test('A28 C1: stale errors are drained once, before the first allocation, kept as stale, and never refuse', () => {
  const f = fixture();
  // Pending before Ultra was asked for — an ordinary frame's, not Ultra's.
  f.host.glPending.push(0x0502, GL_OUT_OF_MEMORY);
  f.host.log.length = 0;
  f.runtime.setWanted(true, ALL_STAGES);
  const { warnings } = quietly(() => f.runtime.reconcile());
  assert.equal(f.runtime.active, true, 'a stale error refused Ultra');
  assert.deepEqual(warnings, [], 'a stale error is not Ultra\'s, and is not said as if it were (Fable finding 7)');
  assert.deepEqual(
    report(f).glErrors.map(({ stage, name, refuses }) => ({ stage, name, refuses })),
    [
      { stage: 'stale', name: 'INVALID_OPERATION', refuses: false },
      { stage: 'stale', name: 'OUT_OF_MEMORY', refuses: false },
    ],
  );
  // One bounded drain, then one read after each allocation stage — never a
  // second drain, and the first read comes before the first allocation.
  const read = `read(${GL_ERROR_READS})`;
  assert.deepEqual(f.host.log, [
    read, 'sky', read, 'environment', read, 'far-shadow', read, 'first-frame', read,
  ]);
});

test('A28 C1: a world swap under Ultra drains once, before the light it paints for that world', () => {
  const f = fixture();
  f.runtime.setWanted(true, ALL_STAGES);
  f.runtime.reconcile();
  f.host.glPending.push(0x0501);
  f.host.log.length = 0;
  f.runtime.installWorld(fakePlan(WARM, 'another-plan'), SELECTION, undefined);
  assert.equal(f.runtime.active, true);
  const read = `read(${GL_ERROR_READS})`;
  assert.deepEqual(f.host.log, [
    read, 'sky', read, 'environment', read, 'far-shadow', read, 'first-frame', read,
  ]);
  assert.deepEqual(report(f).glErrors.map(({ stage, name }) => `${stage}:${name}`), ['stale:INVALID_VALUE']);
});

for (const stage of ['sky', 'environment', 'far-shadow'] as const) {
  for (const code of [GL_OUT_OF_MEMORY, GL_INVALID_FRAMEBUFFER_OPERATION]) {
    const name = code === GL_OUT_OF_MEMORY ? 'OUT_OF_MEMORY' : 'INVALID_FRAMEBUFFER_OPERATION';
    test(`A28 C1: ${name} raised by the ${stage} stage survives to the check, refuses on gl-error, and leaves nothing`, () => {
      const f = fixture({ bake: true });
      const rider = riderRig();
      f.scene.add(rider.group);
      const before = state(f);
      f.host.onStage = (at): void => {
        if (at === stage) f.host.glPending.push(code);
      };
      f.runtime.setWanted(true, ALL_STAGES);
      const { value: result, warnings } = quietly(() => f.runtime.reconcile());

      assert.equal(result.active, false);
      const failure = setupFailure(result.refusal);
      assert.equal(failure?.stage, 'gl-error');
      assert.match(failure?.message ?? '', new RegExp(`${name} \\(0x050[56]\\) after the Ultra `));
      assert.match(failure?.message ?? '', stage === 'far-shadow' ? /far shadow/ : new RegExp(stage));
      assert.equal(warnings.length, 1, 'one line says why');
      assert.equal(f.counts.firstFrames, 0, 'no first frame was drawn on a context that had already failed');
      const kept = report(f).glErrors.filter((finding) => finding.refuses);
      assert.deepEqual(kept.map(({ stage: at, code: kind, target }) => ({ at, kind, target })), [
        { at: stage, kind: code, target: null },
      ]);
      // The ordinary state exactly, and every Ultra piece freed.
      assert.deepEqual(state(f), before);
      assert.deepEqual(rider.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);
      assert.equal(f.terrain()?.recipe, 'enhanced');
      assert.equal(f.counts.environmentsDisposed, f.counts.environmentsBuilt);
      assert.equal(f.counts.skiesDisposed, f.counts.skiesPainted);
      assert.equal(f.counts.cubesDisposed, f.counts.cubesBaked);
      assert.equal(report(f).bytes.steady, 0);
      // Session-sticky, like every setup failure.
      assert.equal(f.runtime.reconcile().active, false);
    });
  }
}

test('A28 C1: INVALID_FRAMEBUFFER_OPERATION after the first frame refuses (Codex probe 2), from its code or pending after it', () => {
  for (const where of ['code', 'pending'] as const) {
    const f = fixture();
    if (where === 'code') f.host.firstFrameCode = GL_INVALID_FRAMEBUFFER_OPERATION;
    else f.host.duringFirstFrame = (): void => void f.host.glPending.push(GL_INVALID_FRAMEBUFFER_OPERATION);
    f.runtime.setWanted(true, null);
    const { value: result } = quietly(() => f.runtime.reconcile());
    assert.equal(result.active, false, where);
    const failure = setupFailure(result.refusal);
    assert.equal(failure?.stage, 'gl-error', where);
    assert.equal(
      failure?.message,
      'gl.getError() reported INVALID_FRAMEBUFFER_OPERATION (0x0506) after the first Ultra frame',
      where,
    );
    assert.equal(report(f).bytes.steady, 0, where);
  }
});

test('A28 C1: other codes are recorded against their stage and do not refuse', () => {
  const f = fixture();
  f.host.onStage = (at): void => {
    if (at === 'environment') f.host.glPending.push(GL_INVALID_ENUM);
  };
  f.host.firstFrameCode = 0x0501;
  f.host.duringFirstFrame = (): void => void f.host.glPending.push(0x0502);
  f.runtime.setWanted(true, null);
  const { warnings } = quietly(() => f.runtime.reconcile());
  assert.equal(f.runtime.active, true);
  assert.equal(f.runtime.refusal, null);
  assert.deepEqual(
    report(f).glErrors.map(({ stage, name, target, refuses }) => ({ stage, name, target, refuses })),
    [
      { stage: 'environment', name: 'INVALID_ENUM', target: null, refuses: false },
      { stage: 'first-frame', name: 'INVALID_VALUE', target: null, refuses: false },
      { stage: 'first-frame', name: 'INVALID_OPERATION', target: null, refuses: false },
    ],
  );
  // Fable finding 7: recorded, and said — one line each, in the order found.
  assert.deepEqual(warnings, report(f).glErrors.map((finding) => `Ultra: ${glNoticeMessage(finding)}.`));
  // The next activation starts its own record.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  f.host.onStage = null;
  f.host.firstFrameCode = 0;
  f.host.duringFirstFrame = null;
  f.runtime.setWanted(true, null);
  assert.deepEqual(quietly(() => f.runtime.reconcile()).warnings, []);
  assert.deepEqual(report(f).glErrors, []);
});

test('Fable finding 7: a non-refusing GL finding is said once per stage and code per activation, and never changes the refusal rule', () => {
  // The finding's own case: every draw of a held program rejected on the
  // first frame, INVALID_OPERATION each time, and Ultra stays on.
  const f = fixture();
  f.host.duringFirstFrame = (): void => void f.host.glPending.push(0x0502, 0x0502, 0x0502, 0x0502, 0x0502);
  f.host.onStage = (at): void => {
    if (at === 'sky') f.host.glPending.push(0x0502);
  };
  f.runtime.setWanted(true, ALL_STAGES);
  const first = quietly(() => f.runtime.reconcile());
  assert.equal(first.value.active, true, 'INVALID_OPERATION refuses Ultra: A28 C1 says it does not');
  assert.equal(report(f).glErrors.length, 6, 'every read is kept');
  assert.deepEqual(first.warnings, [
    'Ultra: gl.getError() reported INVALID_OPERATION (0x0502) after the Ultra sky background cube; '
      + 'recorded in the Ultra report (glErrors), and it does not refuse Ultra.',
    'Ultra: gl.getError() reported INVALID_OPERATION (0x0502) after the first Ultra frame; '
      + 'recorded in the Ultra report (glErrors), and it does not refuse Ultra.',
  ], 'not one line per stage and code');
  assert.equal(first.errors.length, 0);

  // Once per activation: a world swap under Ultra is a new activation, and says it again.
  const again = quietly(() => f.runtime.installWorld(fakePlan(WARM, 'another-plan'), SELECTION, undefined));
  assert.equal(f.runtime.active, true);
  assert.equal(again.warnings.length, 2);

  // A refusing finding alongside is worded once, by the refusal, never as a notice.
  const g = fixture();
  g.host.onStage = (at): void => {
    if (at === 'environment') g.host.glPending.push(0x0502, GL_OUT_OF_MEMORY);
  };
  g.runtime.setWanted(true, null);
  const refused = quietly(() => g.runtime.reconcile());
  assert.equal(refused.value.active, false);
  assert.equal(setupFailure(refused.value.refusal)?.stage, 'gl-error');
  assert.equal(refused.warnings.length, 2, 'one notice for INVALID_OPERATION, one refusal for OUT_OF_MEMORY');
  assert.match(refused.warnings[0], /INVALID_OPERATION \(0x0502\) after the Ultra environment; recorded/);
  assert.match(refused.warnings[1], /^Ultra could not start \(gl-error\): gl\.getError\(\) reported OUT_OF_MEMORY/);

  // The rule itself is A28 C1's, unchanged: only OUT_OF_MEMORY, INVALID_FRAMEBUFFER_OPERATION
  // or an incomplete framebuffer refuse, and never from the stale drain.
  for (const code of [0x0500, 0x0501, 0x0502, 0x9242]) {
    assert.equal(glFinding('first-frame', code, null).refuses, false, `0x${code.toString(16)}`);
  }
  assert.equal(glFinding('sky', GL_OUT_OF_MEMORY, null).refuses, true);
  assert.equal(glFinding('far-shadow', GL_INVALID_FRAMEBUFFER_OPERATION, null).refuses, true);
  assert.equal(glFinding('environment', 0x8cd6, 'environment').refuses, true);
  assert.equal(glFinding('stale', GL_OUT_OF_MEMORY, null).refuses, false);
});

test('A28 C1: an incomplete framebuffer on an Ultra target refuses, naming the target; an unaskable one does not', () => {
  const targetName = (target: THREE.RenderTarget): string => (target as THREE.WebGLRenderTarget).texture.name;
  for (const [name, stage, words] of [
    ['fake-sky-cube-target', 'sky', 'the sky-background-cube framebuffer'],
    ['fake-environment-target', 'environment', 'the environment framebuffer'],
  ] as const) {
    const f = fixture({ bake: true });
    const checked: string[] = [];
    f.host.framebuffer = (target): number => {
      checked.push(targetName(target));
      return targetName(target) === name ? 0x8cd6 : GL_FRAMEBUFFER_COMPLETE;
    };
    f.runtime.setWanted(true, null);
    const { value: result } = quietly(() => f.runtime.reconcile());
    assert.equal(result.active, false, stage);
    const failure = setupFailure(result.refusal);
    assert.equal(failure?.stage, 'gl-error', stage);
    assert.equal(
      failure?.message,
      `${words} is incomplete (FRAMEBUFFER_INCOMPLETE_ATTACHMENT, 0x8cd6) after the Ultra ${stage === 'sky' ? 'sky background cube' : 'environment'}`,
    );
    assert.ok(checked.includes(name), `${name} was never checked`);
    assert.equal(f.counts.cubesDisposed, f.counts.cubesBaked);
    assert.equal(f.counts.environmentsDisposed, f.counts.environmentsBuilt);
  }
  // A target the host cannot ask about (a lost context, a target never drawn) is no finding.
  const f = fixture({ bake: true });
  f.host.framebuffer = (): null => null;
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(f.runtime.active, true);
  assert.deepEqual(report(f).glErrors, []);
});

test('Fable finding 6: a framebuffer check that answers 0 (it failed) is no finding and refuses nothing', () => {
  // `checkFramebufferStatus` returns 0 on an error — a context lost between
  // the host's isContextLost() and the call. That is no status of any
  // framebuffer; it refused as "incomplete (0x0000)" before.
  const f = fixture({ bake: true });
  const checked: string[] = [];
  f.host.framebuffer = (target): number => {
    checked.push((target as THREE.WebGLRenderTarget).texture.name);
    return 0;
  };
  f.runtime.setWanted(true, ALL_STAGES);
  const { value: result, warnings } = quietly(() => f.runtime.reconcile());
  assert.ok(checked.includes('fake-sky-cube-target') && checked.includes('fake-environment-target'), 'the targets were never asked');
  assert.equal(result.active, true, `a failed check refused Ultra: ${JSON.stringify(result.refusal)}`);
  assert.deepEqual(report(f).glErrors, []);
  assert.deepEqual(warnings, []);
});

/**
 * A renderer as `ultraFramebufferStatus` reads it: a context whose
 * `checkFramebufferStatus` answers `statuses` face by face (then COMPLETE),
 * three's property store, and the binding calls it makes.
 */
function statusRenderer(options: {
  readonly statuses?: readonly number[];
  readonly lost?: boolean;
  readonly setUp?: boolean;
  readonly framebuffer?: boolean;
}): { renderer: THREE.WebGLRenderer; binds: string[]; checks: number } {
  const binds: string[] = [];
  const statuses = [...(options.statuses ?? [])];
  const bound = { target: 'canvas' as string, face: 2, level: 1 };
  let checks = 0;
  const gl = {
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: GL_FRAMEBUFFER_COMPLETE,
    isContextLost: (): boolean => options.lost === true,
    checkFramebufferStatus: (which: number): number => {
      assert.equal(which, 0x8d40);
      checks += 1;
      return statuses.shift() ?? GL_FRAMEBUFFER_COMPLETE;
    },
  };
  const state = { __webglFramebuffer: options.framebuffer === false ? undefined : {} };
  const renderer = {
    getContext: () => gl,
    properties: { has: () => options.setUp !== false, get: () => state },
    xr: { enabled: false },
    autoClear: true,
    getRenderTarget: () => (bound.target === 'canvas' ? null : bound.target),
    getActiveCubeFace: () => bound.face,
    getActiveMipmapLevel: () => bound.level,
    setRenderTarget: (target: THREE.RenderTarget | string | null, face = 0, level = 0): void => {
      const name = target === null ? 'canvas' : typeof target === 'string' ? target : (target as THREE.WebGLRenderTarget).texture.name;
      binds.push(`${name}:${face}:${level}`);
      Object.assign(bound, { target: name, face, level });
    },
  };
  return {
    renderer: renderer as unknown as THREE.WebGLRenderer,
    binds,
    get checks(): number {
      return checks;
    },
  };
}

test('Fable finding 6: the renderer\'s framebuffer check answers null for a 0, a lost context or a target three never set up, and puts the binding back', () => {
  const cube = new THREE.WebGLCubeRenderTarget(4);
  cube.texture.name = 'cube';
  const flat = new THREE.WebGLRenderTarget(4, 4);
  flat.texture.name = 'flat';
  try {
    // Every face of a cube, complete: COMPLETE, with the renderer's binding put back exactly.
    const whole = statusRenderer({});
    assert.equal(ultraFramebufferStatus(whole.renderer, cube), GL_FRAMEBUFFER_COMPLETE);
    assert.deepEqual(whole.binds, ['cube:0:0', 'cube:1:0', 'cube:2:0', 'cube:3:0', 'cube:4:0', 'cube:5:0', 'canvas:2:1']);
    // The first incomplete face answers, and the walk stops there.
    const torn = statusRenderer({ statuses: [GL_FRAMEBUFFER_COMPLETE, GL_FRAMEBUFFER_COMPLETE, 0x8cd6] });
    assert.equal(ultraFramebufferStatus(torn.renderer, cube), 0x8cd6);
    assert.equal(torn.checks, 3);
    assert.equal(torn.binds.at(-1), 'canvas:2:1');
    // 0 — the call failed (the context went between the check and the call) — is null, on any face.
    for (const statuses of [[0], [GL_FRAMEBUFFER_COMPLETE, 0]]) {
      const failed = statusRenderer({ statuses });
      assert.equal(ultraFramebufferStatus(failed.renderer, cube), null, JSON.stringify(statuses));
      assert.equal(failed.binds.at(-1), 'canvas:2:1', 'the binding was not put back');
    }
    const single = statusRenderer({ statuses: [0] });
    assert.equal(ultraFramebufferStatus(single.renderer, flat), null);
    assert.deepEqual(single.binds, ['flat:0:0', 'canvas:2:1']);
    // Unaskable, and nothing bound: a lost context, a target three never set up, one with no framebuffer yet.
    for (const options of [{ lost: true }, { setUp: false }, { framebuffer: false }]) {
      const unaskable = statusRenderer(options);
      assert.equal(ultraFramebufferStatus(unaskable.renderer, flat), null, JSON.stringify(options));
      assert.deepEqual(unaskable.binds, [], `${JSON.stringify(options)} bound a target`);
      assert.equal(unaskable.checks, 0);
    }
  } finally {
    cube.dispose();
    flat.dispose();
  }
});

test('A28 C1: a lost context that answers every getError is read boundedly, and does not refuse by itself', () => {
  const f = fixture();
  f.host.glForever = 0x9242;
  f.host.log.length = 0;
  f.runtime.setWanted(true, ALL_STAGES);
  const { warnings } = quietly(() => f.runtime.reconcile());
  const reads = f.host.log.filter((entry) => entry.startsWith('read('));
  assert.ok(reads.length > 0);
  assert.ok(reads.every((entry) => entry === `read(${GL_ERROR_READS})`), 'an unbounded read');
  assert.equal(report(f).glErrors.length, reads.length * GL_ERROR_READS);
  assert.ok(report(f).glErrors.every((finding) => finding.name === 'CONTEXT_LOST_WEBGL' && !finding.refuses));
  assert.equal(f.runtime.active, true, 'context loss has its own path (restore); the GL check is not it');
  // Fable finding 7, bounded: every read kept, one line for each stage after the stale drain.
  assert.deepEqual(warnings.map((line) => /after (the [^;]+);/.exec(line)?.[1]), [
    'the Ultra sky background cube', 'the Ultra environment', 'the Ultra far shadow map', 'the first Ultra frame',
  ]);
  assert.ok(warnings.every((line) => line.includes('CONTEXT_LOST_WEBGL (0x9242)')));
});

test('A28 C1: nothing is read outside an activation (a β rebuild, a context restore)', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  f.host.glPending.push(GL_OUT_OF_MEMORY);
  f.host.log.length = 0;
  f.runtime.setLive({ ...shippedUltraLive(), bounceLift: shippedUltraLive().bounceLift + 0.25 });
  f.runtime.onContextRestored();
  assert.deepEqual(f.host.log.filter((entry) => entry.startsWith('read(')), []);
  assert.deepEqual(f.host.glPending, [GL_OUT_OF_MEMORY], 'an error was consumed outside an activation');
  assert.equal(f.runtime.active, true);
});

test('A28 C1: ?ultrafault=gl-* raises a genuine error at its stage — two refuse on gl-error, gl-enum is only recorded', () => {
  const cases = [
    { plant: 'gl-sky', code: GL_INVALID_FRAMEBUFFER_OPERATION, stage: 'sky', refuses: true },
    { plant: 'gl-framebuffer', code: GL_INVALID_FRAMEBUFFER_OPERATION, stage: 'first-frame', refuses: true },
    { plant: 'gl-enum', code: GL_INVALID_ENUM, stage: 'environment', refuses: false },
  ] as const;
  for (const { plant, code, stage, refuses } of cases) {
    const f = fixture();
    // Planted before the first world too (as Game does), and never raised
    // until Ultra is asked for.
    f.runtime.setFault(plant);
    f.runtime.installWorld(fakePlan(), SELECTION, undefined);
    assert.deepEqual(f.host.raised, [], `${plant} fired outside an activation`);
    f.runtime.setWanted(true, null);
    const { value: result } = quietly(() => f.runtime.reconcile());
    assert.deepEqual(f.host.raised, [code], plant);
    assert.equal(result.active, !refuses, plant);
    if (refuses) assert.equal(setupFailure(result.refusal)?.stage, 'gl-error', plant);
    assert.deepEqual(
      report(f).glErrors.map((finding) => ({ stage: finding.stage, code: finding.code, refuses: finding.refuses })),
      [{ stage, code, refuses }],
      plant,
    );
  }
});

test('A28 C2: a GL read after the sky cube or the environment that throws frees what the stage allocated', () => {
  for (const failing of ['fake-sky-cube-target', 'fake-environment-target'] as const) {
    const f = fixture({ bake: true });
    f.host.framebuffer = (target): number => {
      if ((target as THREE.WebGLRenderTarget).texture.name === failing) throw new Error('the bind threw');
      return GL_FRAMEBUFFER_COMPLETE;
    };
    f.runtime.setWanted(true, null);
    const { value: result } = quietly(() => f.runtime.reconcile());
    assert.equal(result.active, false, failing);
    assert.equal(setupFailure(result.refusal)?.stage, failing === 'fake-sky-cube-target' ? 'sky' : 'environment');
    assert.equal(f.counts.cubesDisposed, f.counts.cubesBaked, `${failing}: a cube leaked`);
    assert.equal(f.counts.skiesDisposed, f.counts.skiesPainted, `${failing}: a sky leaked`);
    assert.equal(f.counts.environmentsDisposed, f.counts.environmentsBuilt, `${failing}: an environment leaked`);
    assert.equal(report(f).bytes.steady, 0);
  }
});

test('rider flags: authored booleans come back, including rigs added and removed mid-Ultra', () => {
  const f = fixture();
  const before = riderRig();
  const ghost = riderRig('ghost-rider');
  f.scene.add(before.group);
  f.scene.add(ghost.group);

  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.deepEqual(before.meshes.map((mesh) => mesh.receiveShadow), [true, true, true]);
  assert.deepEqual(
    ghost.meshes.map((mesh) => mesh.receiveShadow),
    [false, false, true],
    'the ghost is untouched by Ultra',
  );

  // A seat spawned (or re-dressed) mid-Ultra is caught by `childadded`.
  const spawned = riderRig();
  f.scene.add(spawned.group);
  assert.deepEqual(spawned.meshes.map((mesh) => mesh.receiveShadow), [true, true, true]);

  // A rig that leaves mid-Ultra leaves with its authored flags (`childremoved`),
  // so a rig kept and re-added later can never carry an Ultra flag.
  f.scene.remove(before.group);
  assert.deepEqual(before.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);

  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  assert.deepEqual(spawned.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);

  // And a rig re-added after the teardown is simply as authored.
  f.scene.add(before.group);
  assert.deepEqual(before.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);
});

test('A15: rider, wheel and cop materials take envResponse of the Ultra environment, through the same map, and come back exactly', () => {
  const f = fixture();
  const rider = riderRig();
  const cop = riderRig('cop-rider');
  // One material authored with its own map and intensity; one that is not standard (a basic decal).
  const own = rider.meshes[1].material as THREE.MeshStandardMaterial;
  const authoredMap = new THREE.Texture();
  own.envMap = authoredMap;
  own.envMapIntensity = 0.7;
  const basic = new THREE.MeshBasicMaterial();
  rider.meshes[0].material = [rider.meshes[0].material as THREE.Material, basic];
  f.scene.add(rider.group);
  f.scene.add(cop.group);
  const standards = (): THREE.MeshStandardMaterial[] => [...rider.meshes, ...cop.meshes]
    .flatMap((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]))
    .filter((material): material is THREE.MeshStandardMaterial => (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true);
  const authored = standards().map((material) => [material.envMap, material.envMapIntensity]);
  assert.equal(authored.length, 6);

  f.runtime.setWanted(true, null);
  assert.equal(f.runtime.reconcile().active, true);
  const environment = f.scene.environment;
  assert.notEqual(environment, null);
  const expect = (): void => {
    for (const material of standards()) {
      // three reads `envMap || scene.environment`: the same PMREM, so the program the material already had.
      assert.equal(material.envMap, f.scene.environment, 'a held material is not on the Ultra environment');
      assert.ok(Math.abs(material.envMapIntensity - f.scene.environmentIntensity * ULTRA.rider.envResponse) < 1e-12);
    }
  };
  expect();
  assert.ok('envMap' in basic && (basic as THREE.MeshBasicMaterial).envMap === null, 'a basic material was touched');
  // A κ push (the fill's intensity) is followed at the next frame.
  f.scene.environmentIntensity *= 1.2;
  f.runtime.beforeSoloRender(f.camera);
  expect();
  // A rig spawned mid-Ultra is held at once; one that leaves gets its own values back.
  const spawned = riderRig('cop-rider');
  f.scene.add(spawned.group);
  for (const mesh of spawned.meshes) assert.equal((mesh.material as THREE.MeshStandardMaterial).envMap, f.scene.environment);
  f.scene.remove(spawned.group);
  for (const mesh of spawned.meshes) {
    assert.equal((mesh.material as THREE.MeshStandardMaterial).envMap, null);
    assert.equal((mesh.material as THREE.MeshStandardMaterial).envMapIntensity, 1);
  }
  // Leaving restores every authored value exactly — the map and the intensity.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  assert.deepEqual(standards().map((material) => [material.envMap, material.envMapIntensity]), authored);
  assert.equal(own.envMap, authoredMap);
  assert.equal(own.envMapIntensity, 0.7);
  // …and the frame hook no longer writes them.
  f.runtime.beforeSoloRender(f.camera);
  assert.deepEqual(standards().map((material) => [material.envMap, material.envMapIntensity]), authored);
});

test('the pixel budget: Ultra never draws more pixels than the budget, nor at a higher ratio than High', () => {
  // A26: the owner's Air in "looks like 1440×900" at DPR 2 — High draws
  // 2880×1800, and so does Ultra now (5,184,000 px, exactly High's ratio 2;
  // the earlier 4,096,000 drew the panel's 2560×1600 and read 1.33–1.41×
  // softer on the retina pair).
  assert.equal(ULTRA.pixelBudget, 5_184_000);
  const air = ultraPixelCap(ULTRA.pixelBudget, 1440, 900);
  assert.equal(air, 2);
  assert.equal(Math.round(1440 * air), 2880);
  assert.equal(Math.round(900 * air), 1800);
  // Its larger scaled mode (1680×1050 at DPR 2, where High draws 3360×2100)
  // is where the budget binds: Ultra draws the same 2880×1800.
  const more = ultraPixelCap(ULTRA.pixelBudget, 1680, 1050);
  assert.ok(more < 2);
  assert.equal(Math.round(1680 * more), 2880);
  assert.equal(Math.round(1050 * more), 1800);
  // q205's 1920×1080 at DPR 1: the budget does not bind, so pairs are like for like.
  assert.ok(ultraPixelCap(ULTRA.pixelBudget, 1920, 1080) > 1);
  assert.equal(ultraPixelCap(ULTRA.pixelBudget, 0, 900), Number.POSITIVE_INFINITY);

  for (const [width, height] of [[375, 812], [812, 375], [1280, 720], [1440, 900], [1920, 1080], [2560, 1440], [3840, 2160]]) {
    for (const dpr of [1, 1.5, 2, 3]) {
      const high = Math.min(dpr, 2);
      const ultra = Math.min(dpr, 2, ultraPixelCap(ULTRA.pixelBudget, width, height));
      assert.ok(ultra <= high, `${width}×${height}@${dpr}: Ultra's ratio above High's`);
      assert.ok(
        width * height * ultra * ultra <= ULTRA.pixelBudget * (1 + 1e-9) || ultra === high,
        `${width}×${height}@${dpr}: over the budget without being High's own ratio`,
      );
    }
  }

  const f = fixture();
  assert.equal(f.runtime.tierPixelCap(1440, 900), Number.POSITIVE_INFINITY, 'no cap on an ordinary tier');
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(f.runtime.tierPixelCap(1440, 900), air);
  assert.ok(f.counts.resizes > 0, 'the buffer was re-sized when the cap came on');
});

test('refusal scopes: capability and setup-failed hold for the session, envelope for the world, override per call', () => {
  // Capability — sticky even once the caps would pass.
  {
    const f = fixture();
    f.host.caps = { ...HEADLESS_CAPS, halfFloatRenderable: false };
    f.runtime.setWanted(true, null);
    const refused = f.runtime.reconcile();
    assert.deepEqual(refused.refusal, { kind: 'capability', missing: 'half-float-render' });
    f.host.caps = { ...HEADLESS_CAPS };
    f.runtime.installWorld(fakePlan(), SELECTION, undefined);
    assert.equal(f.runtime.active, false);
    assert.equal(f.runtime.refusal?.kind, 'capability');
  }
  // Envelope — this world only; the next world is judged afresh.
  {
    const f = fixture();
    const heavy = fakePlan();
    f.host.judge = (plan, override) => plan === heavy
      ? {
        recipe: null,
        cost: null,
        refusal: { kind: 'envelope', axis: 'soloTriangles', value: 1_200_000, ceiling: 1_100_000 },
        rungs: [],
      }
      : admit(applyKitOverride(ULTRA_FULL, override));
    f.runtime.setWanted(true, null);
    f.runtime.installWorld(heavy, SELECTION, undefined);
    assert.equal(f.runtime.active, false);
    assert.equal(f.runtime.refusal?.kind, 'envelope');
    assert.equal(f.terrain()?.recipe, 'enhanced');
    f.runtime.installWorld(fakePlan(), SELECTION, undefined);
    assert.equal(f.runtime.active, true, 'the envelope refusal was carried to a world it was not about');
    assert.equal(f.runtime.refusal, null);
  }
  // Presentation override — refused while it is present, admitted without it.
  {
    const f = fixture();
    f.runtime.setWanted(true, null);
    f.runtime.installWorld(fakePlan(), SELECTION, 'baseline');
    assert.equal(f.runtime.active, false);
    assert.deepEqual(f.runtime.refusal, { kind: 'presentation-override', recipe: 'baseline' });
    f.runtime.installWorld(fakePlan(), SELECTION, undefined);
    assert.equal(f.runtime.active, true);
  }
  // More than one view — refused for as long as it lasts, never stored.
  {
    const f = fixture();
    f.host.views = 2;
    f.runtime.setWanted(true, null);
    assert.equal(f.runtime.reconcile().active, false);
    assert.equal(f.runtime.refusal?.kind, 'setup-failed');
    f.host.views = 1;
    assert.equal(f.runtime.reconcile().active, true);
  }
  // Not wanted — nothing refused (only a sticky refusal is always reported).
  {
    const f = fixture();
    f.runtime.setWanted(false, null);
    assert.equal(f.runtime.reconcile().refusal, null);
  }
});

test('missing capabilities are named in the probe order', () => {
  assert.equal(missingCapability(HEADLESS_CAPS), null);
  assert.equal(missingCapability({ ...HEADLESS_CAPS, webgl2: false }), 'webgl2');
  assert.equal(missingCapability({ ...HEADLESS_CAPS, halfFloatRenderable: false }), 'half-float-render');
  assert.equal(missingCapability({ ...HEADLESS_CAPS, maxTextureSize: ULTRA.near.mapSize - 1 }), 'max-texture-size');
  assert.equal(missingCapability({ ...HEADLESS_CAPS, maxTextureSize: ULTRA.near.mapSize }), null);
});

test('a safety demotion counts itself, says so once, and is not sticky', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const before = f.counts.terrainsBuilt.length;
  const { errors } = quietly(() => f.runtime.safetyDemote(2));
  assert.equal(errors.length, 1);
  assert.equal(f.runtime.active, false);
  assert.equal(report(f).safetyDemotions, 1);
  assert.deepEqual(f.counts.terrainsBuilt.slice(before), ['enhanced']);
  // Not active: a second call is a no-op and does not count.
  quietly(() => f.runtime.safetyDemote(2));
  assert.equal(report(f).safetyDemotions, 1);
  // The intent stood: back at one view, a reconcile builds Ultra again.
  assert.equal(f.runtime.reconcile().active, true);
});

test('the frame hook finalises from the focus the game set, and never drifts when nobody re-points it', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();

  // The game points the cascade at the rider, then draws.
  const offset = f.lighting.sunOffset;
  f.sun.target.position.set(10, 0, 20);
  f.sun.position.set(10 + offset.x, offset.y, 20 + offset.z);
  f.runtime.beforeSoloRender(f.camera);
  const first = { target: f.sun.target.position.toArray(), sun: f.sun.position.toArray() };

  // `GameRenderer.render()` draws again without re-pointing it.
  f.runtime.beforeSoloRender(f.camera);
  f.runtime.beforeSoloRender(f.camera);
  assert.deepEqual(
    { target: f.sun.target.position.toArray(), sun: f.sun.position.toArray() },
    first,
    'finalising an already-finalised target again pushed the cascade further ahead',
  );
});

test('live values: κ re-runs the fill, β rebuilds the environment, the near values reach the rig', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const built = f.counts.environmentsBuilt;
  const shipped = shippedUltraLive();

  f.runtime.setLive({ ...shipped, envKappa: shipped.envKappa * 1.5 });
  assert.equal(f.counts.environmentsBuilt, built, 'κ alone does not rebuild the PMREM');

  f.runtime.setLive({ ...shipped, bounceLift: shipped.bounceLift + 0.25 });
  assert.equal(f.counts.environmentsBuilt, built + 1, 'β is painted into the environment');
  assert.equal(f.counts.environmentsDisposed, built, 'the outgoing environment was disposed');

  f.runtime.setLive({ ...shipped, nearBias: -0.001, nearNormalBias: 0.03, nearRadius: 1.5 });
  assert.equal(f.sun.shadow.bias, -0.001);
  assert.equal(f.sun.shadow.normalBias, 0.03);
  assert.equal(f.sun.shadow.radius, 1.5);
  assert.equal(report(f).environment?.kappa, shipped.envKappa);

  // On an ordinary tier a live push touches nothing but the stored values.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  const settled = state(f);
  f.runtime.setLive({ ...shipped, nearBias: -0.002, bounceLift: 2 });
  assert.deepEqual(state(f), settled);
});

test('a restored context rebuilds the environment and the far map before the game hears of it', () => {
  const f = fixture();
  f.runtime.onContextRestored();
  assert.equal(f.counts.environmentsBuilt, 0, 'nothing to rebuild on an ordinary tier');

  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const environments = f.counts.environmentsBuilt;
  const farBuilds = f.counts.farBuilds;
  f.runtime.onContextRestored();
  assert.equal(f.counts.environmentsBuilt, environments + 1);
  assert.equal(f.counts.farBuilds, farBuilds + (ULTRA_FULL.ultra.farShadow ? 1 : 0));
  assert.equal(f.runtime.active, true);
});

/**
 * A real far map for the fixture's fake `buildFarShadow` (A28, FE): one
 * layer-5 box and a renderer that records nothing, so `UltraFarShadow.build`
 * allocates its real target and depth texture — the two objects three would
 * delete through its pre-loss bookkeeping.
 */
function realFarBuild(far: UltraFarShadow, sunOffsetUnit: THREE.Vector3): void {
  const scene = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(20, 30, 20), new THREE.MeshStandardMaterial());
  box.position.set(40, 15, 60);
  box.layers.enable(ULTRA_STATIC_LAYER);
  scene.add(box);
  let target: THREE.WebGLRenderTarget | null = null;
  const renderer = {
    shadowMap: { autoUpdate: true, needsUpdate: false },
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget(next: THREE.WebGLRenderTarget | null): void { target = next; },
    clear(): void {},
    render(): void {},
  } as unknown as THREE.WebGLRenderer;
  far.build(renderer, scene, sunOffsetUnit);
}

test('A28, FE: a lost context releases the sky cube, the environment and the far map; the restore only builds, and deletes nothing', () => {
  const f = fixture({ bake: true });
  f.host.farBuild = realFarBuild;
  // Off the tier a loss touches nothing.
  f.runtime.onContextLost();
  assert.equal(f.counts.cubesReleased + f.counts.environmentsDisposed, 0);

  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(f.runtime.active, true);
  const far = (f.runtime as unknown as { far: UltraFarShadow | null }).far;
  assert.ok(far !== null && far.texture !== null && far.renderTarget !== null, 'the full kit built a real far map');
  const environment = f.lighting.environment;
  assert.ok(environment?.target !== undefined, 'the fake environment carries a target');

  // Who frees what, and when: three's pre-loss `dispose` listeners fire on
  // these events. Each must fire while the context is lost, never after it.
  let phase: 'ultra' | 'lost' | 'restored' = 'ultra';
  const freed: string[] = [];
  const watch = (name: string, target: THREE.EventDispatcher<{ dispose: object }>): void => {
    target.addEventListener('dispose', () => { freed.push(`${name}@${phase}`); });
  };
  watch('far target', far.renderTarget as THREE.EventDispatcher<{ dispose: object }>);
  watch('far depth', far.texture as THREE.EventDispatcher<{ dispose: object }>);
  watch('environment target', environment.target as THREE.EventDispatcher<{ dispose: object }>);
  const before = { ...f.counts };
  const skyTexture = f.lighting.sky.texture;
  const background = f.scene.background;

  phase = 'lost';
  f.host.log.length = 0;
  f.runtime.onContextLost();
  assert.deepEqual([...freed].sort(), ['environment target@lost', 'far depth@lost', 'far target@lost']);
  assert.equal(f.counts.cubesReleased, 1, 'the cube faces were not released at the loss');
  assert.equal(f.counts.cubesDisposed, before.cubesDisposed, 'the loss disposed the cube the restore re-bakes');
  assert.equal(f.counts.environmentsDisposed, before.environmentsDisposed + 1);
  assert.equal(f.lighting.environment === null && f.scene.environment === null, true, 'the environment is still hung');
  // Read through a function: the asserts below would otherwise narrow the getters for good.
  const farHolds = (): boolean => far.texture !== null || far.renderTarget !== null;
  assert.equal(farHolds(), false, 'the far map still holds its target after the loss');
  // Nothing is built on a lost context, the tier stands, the sky stays hung.
  assert.equal(f.counts.environmentsBuilt, before.environmentsBuilt);
  assert.equal(f.counts.farBuilds, before.farBuilds);
  assert.equal(f.counts.cubesRebaked, before.cubesRebaked);
  assert.equal(f.runtime.active, true, 'a loss is not an exit');
  assert.equal(f.lighting.tier, 'ultra');
  assert.equal(f.lighting.sky.texture, skyTexture);
  assert.equal(f.scene.background, background);
  assert.deepEqual(f.host.log.filter((entry) => entry.startsWith('read(')), [], 'the loss read the GL error flags');

  phase = 'restored';
  const released = f.counts.environmentsDisposed;
  f.runtime.onContextRestored();
  assert.deepEqual(freed.filter((entry) => entry.endsWith('@restored')), [], 'the restore deleted a pre-loss object');
  assert.equal(f.counts.environmentsDisposed, released, 'the restore disposed an environment');
  assert.equal(f.counts.cubesDisposed, before.cubesDisposed);
  assert.equal(f.counts.environmentsBuilt, before.environmentsBuilt + 1);
  assert.equal(f.counts.cubesRebaked, before.cubesRebaked + 1);
  assert.equal(f.counts.farBuilds, before.farBuilds + 1);
  assert.ok(f.lighting.environment !== null && f.scene.environment === f.lighting.environment.texture);
  assert.equal(farHolds(), true, 'the far map was not rebuilt');
  assert.equal(f.runtime.active, true);
  assert.equal(report(f).environment?.cubeSize, 256);
  assert.notEqual(report(f).farShadow, null);

  // A second loss and restore behave the same; the exit frees what the last restore built.
  phase = 'lost';
  f.runtime.onContextLost();
  phase = 'restored';
  f.runtime.onContextRestored();
  assert.deepEqual(freed.filter((entry) => entry.endsWith('@restored')), []);
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  assert.equal(f.counts.environmentsDisposed, f.counts.environmentsBuilt);
  assert.equal(f.counts.cubesDisposed, f.counts.cubesBaked);
  const settled = { ...f.counts };
  f.runtime.onContextLost();
  assert.deepEqual(f.counts, settled, 'a loss off the tier released something');
});

test('a world swap at Ultra paints each sky and environment once, at the tier it is drawn at', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  // Entering Ultra *with* a world: the Ultra light is hung for the new look
  // directly — no ordinary repaint of the park first.
  f.runtime.installWorld(fakePlan(WARM), SELECTION, undefined);
  assert.equal(f.runtime.active, true);
  assert.equal(f.counts.skiesPainted, 1);
  assert.equal(f.counts.environmentsBuilt, 1);

  // Park → slice at Ultra: one Ultra sky and one environment for the new look.
  f.runtime.installWorld(fakePlan(), SELECTION, undefined);
  assert.equal(f.counts.skiesPainted, 2);
  assert.equal(f.counts.environmentsBuilt, 2);
  assert.equal(f.counts.environmentsDisposed, 1);

  // Slice → slice: the same look paints nothing.
  f.runtime.installWorld(fakePlan(), SELECTION, undefined);
  assert.equal(f.counts.skiesPainted, 2);
  assert.equal(f.counts.environmentsBuilt, 2);

  // Slice → another daylight plan (Wave 3, gauntlet round 1 item 4): the same
  // look, but the plan's cumulus seed moved, so the Ultra sky — and only the
  // sky — repaints, once, with the new plan's seed.
  f.runtime.installWorld(fakePlan(undefined, 'belvar-r1'), SELECTION, undefined);
  assert.equal(f.counts.skiesPainted, 3);
  assert.equal(f.counts.skiesDisposed, 2, 'the outgoing Ultra sky went first');
  assert.equal(f.counts.environmentsBuilt, 2, 'the environment follows the look alone');
  assert.deepEqual(
    f.counts.skySeeds,
    [cumulusSeedFor('fake-plan'), cumulusSeedFor('fake-plan'), cumulusSeedFor('belvar-r1')],
  );
  assert.notEqual(cumulusSeedFor('belvar-r1'), cumulusSeedFor('fake-plan'));
  f.runtime.installWorld(fakePlan(undefined, 'belvar-r1'), SELECTION, undefined);
  assert.equal(f.counts.skiesPainted, 3, 'the same plan id paints nothing');

  // A kit override is a different recipe: rebuilt on reconcile, light kept.
  f.runtime.setWanted(true, { farShadow: false, forms: false });
  const swapped = f.runtime.reconcile();
  assert.equal(swapped.terrainChanged, true);
  assert.equal(f.runtime.active, true);
  assert.equal(f.counts.environmentsBuilt, 2, 'the light did not change, so it was not rebuilt');
  assert.equal(report(f).kit?.forms, false);
  // …and the same intent again changes nothing.
  assert.equal(f.runtime.reconcile().terrainChanged, false);
});

test('?ultrakit=-lighting builds the Ultra world under the ordinary light and flags', () => {
  const f = fixture();
  const rider = riderRig();
  f.scene.add(rider.group);
  const before = state(f);
  f.runtime.setWanted(true, { lighting: false });
  f.runtime.reconcile();
  assert.equal(f.runtime.active, true);
  assert.equal(f.terrain()?.recipe, 'ultra-full');
  assert.deepEqual(state(f), before, 'the ordinary light, rig and sky stand under -lighting');
  assert.deepEqual(rider.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);
  assert.equal(f.counts.environmentsBuilt, 0);
  assert.equal(report(f).shadow, null, 'no Ultra rig to report');
});

test('the Ultra presentation cost restates what was built, and nothing else', () => {
  const ordinary = SELECTION.cost;
  const cost = ultraPresentationCost(ordinary, ULTRA_LIT, FAKE_COST, {
    propColourTriangles: 111,
    blockColourTriangles: 222,
  });
  assert.equal(cost.recipe, 'ultra-lit');
  assert.deepEqual(cost.frame.solo, FAKE_COST.solo);
  assert.deepEqual(cost.frame.split, ordinary.frame.split, 'a split is never drawn at Ultra');
  assert.equal(cost.drawCalls, 60, 'the two every-frame passes, not the activation one');
  assert.equal(cost.colourTriangles, 373_382);
  assert.equal(cost.shadowTriangles, 200_000);
  assert.equal(cost.triangles, 573_382);
  assert.equal(cost.propDrawCalls, 30);
  assert.equal(cost.propTriangles, 300_000);
  assert.equal(cost.propColourTriangles, 111);
  assert.equal(cost.blockColourTriangles, 222);
  assert.deepEqual(ultraPresentationCost(ordinary, ULTRA_FULL, null, { propColourTriangles: 0, blockColourTriangles: 0 }),
    { ...ordinary, recipe: 'ultra-full' });

  const group = new THREE.Group();
  const trunk = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 5);
  trunk.name = 'level-props-trunk';
  const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  other.name = 'level-blocks-stone';
  group.add(trunk, other);
  assert.equal(measuredPropColourTriangles(group), 12 * 5);
});

test('A9: every solo frame feeds the rider’s and the cop’s contact into the shared uniforms', () => {
  const f = fixture();
  const config = ULTRA.contact.riders;
  // The player's rig: its position is the wheel's contact; the pelvis a child.
  const rider = riderRig();
  const pelvis = new THREE.Group();
  pelvis.name = 'rider-pelvis';
  pelvis.position.set(0.25, 1, 0);
  rider.group.add(pelvis);
  rider.group.position.set(5, 0, 7);
  // The cop, hidden until a chase: his copy of the rig carries prefixed names.
  const cop = new THREE.Group();
  cop.name = 'cop-rider';
  cop.visible = false;
  const copRig = new THREE.Group();
  copRig.name = 'cop-riding-rig';
  copRig.position.set(-3, 0, 2);
  cop.add(copRig);
  const copPelvis = new THREE.Group();
  copPelvis.name = 'cop-rider-pelvis';
  copPelvis.position.set(0, 1, 0);
  copRig.add(copPelvis);
  f.scene.add(cop);
  f.scene.add(rider.group);

  f.runtime.setWanted(true, null);
  assert.equal(f.runtime.reconcile().active, true);
  const uniforms = f.context()!.shared.uniforms;
  const points = uniforms.ultraContactPoints.value as THREE.Vector4[];
  const count = (): number => uniforms.ultraContactCount.value as number;
  // The first frame fed the player's two occluders, and the hidden cop none.
  assert.equal(count(), 2);
  // Two vec4s a slot (A15): (x, z, along, strength), then (axis, across, 0).
  const near = (slot: number, x: number, z: number, radius: number, strength: number, across = radius): void => {
    const v = points[slot * 2];
    const e = points[slot * 2 + 1];
    assert.ok(Math.abs(v.x - x) < 1e-5 && Math.abs(v.y - z) < 1e-5, `at (${v.x}, ${v.y}), want (${x}, ${z})`);
    assert.ok(Math.abs(v.z - radius) < 1e-5 && Math.abs(v.w - strength) < 1e-6, `r ${v.z} s ${v.w}`);
    assert.ok(Math.abs(e.z - across) < 1e-5, `across ${e.z}, want ${across}`);
    assert.ok(Math.abs(Math.hypot(e.x, e.y) - 1) < 1e-5, 'the axis is not a unit direction');
  };
  // The body pool lies down-sun of the pelvis, stretched along the sun's azimuth.
  assert.equal(points.length, ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_VEC4_PER_SLOT, 'the shared array is not two vec4s a slot');
  const down = downSunOf(f.lighting.sunOffset)!;
  assert.notEqual(down, null);
  const body = config.body;
  const bodyAt = (x: number, z: number): [number, number] => [x + down.x * body.downSunMetres, z + down.z * body.downSunMetres];
  near(0, 5, 7, config.wheel.radius, config.wheel.strength);
  near(1, ...bodyAt(5.25, 7), body.radius * body.stretch, body.strength, body.radius * body.across);
  assert.ok(Math.abs(points[3].x - down.x) < 1e-6 && Math.abs(points[3].y - down.z) < 1e-6, 'the body pool is not along the sun');
  // The chase starts: the cop's two join, after the player's.
  cop.visible = true;
  f.runtime.beforeSoloRender(f.camera);
  assert.equal(count(), 4);
  near(2, -3, 2, config.wheel.radius, config.wheel.strength);
  near(3, ...bodyAt(-3, 2), body.radius * body.stretch, body.strength, body.radius * body.across);
  // This frame's pose, not last frame's: the rider moved.
  rider.group.position.set(9, 0, 1);
  f.runtime.beforeSoloRender(f.camera);
  near(0, 9, 1, config.wheel.radius, config.wheel.strength);
  // M39 Part P: the pack's two patrols join after the tail, two slots each,
  // so the rider and all three officers are grounded at once — none dropped.
  const patrols = [2, 3].map((n, i) => {
    const child = new THREE.Group();
    child.name = `cop${n}-rider`;
    const rig = new THREE.Group();
    rig.name = `cop${n}-riding-rig`;
    rig.position.set(20 + 10 * i, 0, -4);
    child.add(rig);
    const hip = new THREE.Group();
    hip.name = `cop${n}-rider-pelvis`;
    hip.position.set(0, 1, 0);
    rig.add(hip);
    f.scene.add(child);
    return child;
  });
  f.runtime.beforeSoloRender(f.camera);
  assert.equal(count(), ULTRA_CONTACT_SLOTS, 'the rider and the whole pack fill every slot');
  near(4, 20, -4, config.wheel.radius, config.wheel.strength);
  near(6, 30, -4, config.wheel.radius, config.wheel.strength);
  // A patrol hidden (the pack sized by `?cops=`) feeds nothing, and the rest keep theirs.
  patrols[1].visible = false;
  f.runtime.beforeSoloRender(f.camera);
  assert.equal(count(), 6);
  for (const patrol of patrols) f.scene.remove(patrol);
  // A hidden player's rig feeds nothing; the cop keeps his.
  rider.group.visible = false;
  f.runtime.beforeSoloRender(f.camera);
  assert.equal(count(), 2);
  near(0, -3, 2, config.wheel.radius, config.wheel.strength);
  // The uniforms are the tier's: teardown drops the shared set with the world.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  assert.equal(f.runtime.active, false);
});

test('M39 Part P: every trim of the pack receives and grounds on Ultra, and the slots hold every listed body', () => {
  // By the names the renderer's builder gives them (`Renderer.ts` builds the
  // tail un-indexed and the patrols as index 1 and 2), not by a copy of them.
  for (const index of [0, 1, 2]) {
    const cop = createCopRider(index === 0 ? {} : { index });
    assert.ok(isReceivingRig(cop.group), `${cop.group.name} does not receive on Ultra`);
    const spec = ULTRA_CONTACT_RIGS.find((each) => each.child === cop.group.name);
    assert.ok(spec !== undefined, `${cop.group.name} has no contact entry`);
    assert.ok(spec.rig !== null && cop.group.getObjectByName(spec.rig) !== undefined, `${cop.group.name} has no ${spec.rig}`);
    assert.ok(cop.group.getObjectByName(spec.pelvis) !== undefined, `${cop.group.name} has no ${spec.pelvis}`);
  }
  // Two slots a body (the wheel's core, the body's pool), every listed body at once.
  assert.equal(ULTRA_CONTACT_SLOTS, 2 * ULTRA_CONTACT_RIGS.length);
});

test('the shipped live set is the table’s fifteen numbers, nested paths walked', () => {
  const live = shippedUltraLive();
  assert.equal(Object.keys(live).length, 15);
  assert.equal(live.nearBias, ULTRA.nearBias);
  assert.equal(live.bounceLift, ULTRA.bounceLift);
  assert.equal(live.specAA, ULTRA.specAA);
  // Final touch: `ULTRA.shade.lift` / `.liftFar` sit one level down.
  assert.equal(live.shadeLift, ULTRA.shade.lift);
  assert.equal(live.shadeLiftFar, ULTRA.shade.liftFar);
});


// ---------------------------------------------------------------------------
// Final wave — P-RT (Fable F1, F3, F5, F7, I1, I4; round 3 item 3)
// ---------------------------------------------------------------------------

test('F1: a builder that throws inside the install on a tier switch leaves the ordinary world standing', () => {
  const f = fixture();
  const rider = riderRig();
  f.scene.add(rider.group);
  const before = state(f);
  // Distinct from the planted fault: the host's own build throws, after the
  // renderer has disposed the old world, for an Ultra context only.
  f.host.duringBuild = (context): void => {
    if (context !== null) throw new Error('an Ultra builder fell over on this plan');
  };

  f.runtime.setWanted(true, null);
  const { value: result, warnings } = quietly(() => f.runtime.reconcile());
  assert.equal(result.active, false);
  assert.equal(result.recipe, 'enhanced', 'the result names the world that stands, not the one asked for');
  assert.equal(result.terrainChanged, true, 'the ordinary world was rebuilt');
  assert.equal(result.refusal?.kind, 'setup-failed');
  assert.equal(result.refusal?.kind === 'setup-failed' ? result.refusal.stage : null, 'build');
  assert.match(result.refusal?.kind === 'setup-failed' ? result.refusal.message : '', /fell over/);
  assert.equal(warnings.length, 1, 'one line says why');
  assert.notEqual(f.terrain(), null, 'a world is installed');
  assert.equal(f.terrain()?.recipe, 'enhanced');
  assert.equal(f.terrain()?.group.parent, f.scene, 'and it is in the scene');
  assert.deepEqual(f.counts.terrainsBuilt, ['enhanced', 'enhanced'], 'the boot world, then the ordinary rebuild — nothing Ultra');
  assert.deepEqual(state(f), before, 'the failed switch left part of Ultra behind');
  assert.deepEqual(rider.meshes.map((mesh) => mesh.receiveShadow), [false, false, true]);
  assert.equal(report(f).recipe, 'enhanced');
  assert.equal(report(f).bytes.steady, 0);
  assert.equal(f.host.shaderHook, null);

  // Settings High, then Ultra again: sticky, and the standing world stays.
  f.runtime.setWanted(false, null);
  assert.equal(f.runtime.reconcile().terrainChanged, false);
  f.runtime.setWanted(true, null);
  const again = f.runtime.reconcile();
  assert.equal(again.terrainChanged, false);
  assert.equal(again.recipe, 'enhanced');
  assert.equal(f.terrain()?.recipe, 'enhanced');
});

test('F1: a builder that throws inside the install on a world load builds the ordinary world once', () => {
  const f = fixture();
  f.host.duringBuild = (context): void => {
    if (context !== null) throw new Error('an Ultra builder fell over on this plan');
  };
  f.runtime.setWanted(true, null);
  const built = f.counts.terrainsBuilt.length;
  const { value: view } = quietly(() => f.runtime.installWorld(fakePlan(WARM, 'unbounded-seed'), SELECTION, undefined));
  assert.equal(view, f.terrain(), 'setLevel is handed the installed world');
  assert.equal(view.recipe, 'enhanced');
  assert.deepEqual(f.counts.terrainsBuilt.slice(built), ['enhanced'], 'one ordinary build, never two');
  assert.equal(f.runtime.refusal?.kind, 'setup-failed');
});

test('F1: when the ordinary rebuild throws as well, the teardown still finishes and the error surfaces', () => {
  const f = fixture();
  f.host.duringBuild = (): void => {
    throw new Error('nothing builds today');
  };
  f.runtime.setWanted(true, null);
  quietly(() => assert.throws(() => f.runtime.reconcile(), /nothing builds today/));
  assert.equal(f.runtime.active, false);
  assert.equal(f.host.shaderHook, null);
  assert.equal(f.runtime.tierPixelCap(1440, 900), Number.POSITIVE_INFINITY);
  assert.equal(f.lighting.tier, 'ordinary');
  assert.equal(report(f).bytes.steady, 0);
  // The next world, with the builder back, installs the ordinary one.
  f.host.duringBuild = null;
  f.runtime.installWorld(fakePlan(), SELECTION, undefined);
  assert.equal(f.terrain()?.recipe, 'enhanced');
});

test('F1: the planted ?ultrafault=build fires inside the install, with the old world disposed', () => {
  const f = fixture();
  const disposedBefore = f.counts.terrainsDisposed;
  f.runtime.setFault('build');
  f.runtime.setWanted(true, null);
  const { value: result } = quietly(() => f.runtime.reconcile());
  assert.equal(f.counts.terrainsDisposed, disposedBefore + 1, 'the boot world was disposed before the plant fired');
  assert.equal(result.terrainChanged, true);
  assert.equal(result.recipe, 'enhanced');
  assert.equal(f.terrain()?.recipe, 'enhanced');
});

test('A22: the shadow maps are sized from the buffer the Ultra frame draws', () => {
  const cases: { name: string; canvas: { width: number; height: number; pixelRatio: number }; full: boolean }[] = [
    { name: 'q205 1920×1080 at DPR 1 (2.07 MP)', canvas: { width: 1920, height: 1080, pixelRatio: 1 }, full: true },
    { name: 'the Air at 1440×900 CSS, DPR 2 (2880×1800 under the A26 budget)', canvas: { width: 1440, height: 900, pixelRatio: 2 }, full: true },
    { name: 'the Air at 1680×1050 CSS, DPR 2 (2880×1800, the budget binding)', canvas: { width: 1680, height: 1050, pixelRatio: 2 }, full: true },
    { name: 'a phone at 390×844 CSS, DPR-2 cap (1.32 MP)', canvas: { width: 390, height: 844, pixelRatio: 2 }, full: false },
    { name: 'a Pixel 7 at 412×839 CSS, DPR-2 cap (1.38 MP)', canvas: { width: 412, height: 839, pixelRatio: 2 }, full: false },
  ];
  for (const each of cases) {
    const f = fixture();
    f.host.canvas = each.canvas;
    f.runtime.setWanted(true, null);
    assert.equal(f.runtime.reconcile().active, true, each.name);
    const near = each.full ? ULTRA.near.mapSize : 2048;
    const far = each.full ? ULTRA.farShadow.mapSize : 2048;
    assert.equal(f.sun.shadow.mapSize.x, near, `${each.name}: near`);
    assert.equal(report(f).shadow?.mapSize, near, `${each.name}: reported near`);
    if (ULTRA_FULL.ultra.farShadow) assert.deepEqual(f.counts.farSizes, [far], `${each.name}: far`);
  }
  // The reference captures keep exactly the maps they were taken with.
  assert.deepEqual(ultraShadowMapSizesFor(1920, 1080), { near: 4096, far: 3072 });
  assert.deepEqual(ultraShadowMapSizesFor(2560, 1600), { near: 4096, far: 3072 });
  assert.deepEqual(ultraDrawingBufferFor(ULTRA.pixelBudget, 1440, 900, 2), { width: 2880, height: 1800 });
  assert.deepEqual(ultraDrawingBufferFor(4_096_000, 1440, 900, 2), { width: 2560, height: 1600 }, 'the pre-A26 budget');
  assert.deepEqual(ultraDrawingBufferFor(ULTRA.pixelBudget, 0, 900, 2), { width: 0, height: 0 });
});

test('A22: a resize across the 2 MP line re-sizes both maps, and any other resize changes nothing', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const farBuilds = f.counts.farBuilds;
  f.runtime.onDrawingBuffer(1900, 1080); // still over the line
  assert.equal(f.counts.farBuilds, farBuilds, 'a resize inside the bucket rebuilds nothing');
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize);

  f.runtime.onDrawingBuffer(780, 1688); // a phone-sized buffer
  assert.equal(f.sun.shadow.mapSize.x, 2048);
  assert.equal(report(f).shadow?.mapSize, 2048);
  if (ULTRA_FULL.ultra.farShadow) {
    assert.equal(f.counts.farBuilds, farBuilds + 1, 'the far map was rebuilt at its new edge');
    assert.equal(f.counts.farSizes.at(-1), 2048);
  }
  f.runtime.onDrawingBuffer(1920, 1080);
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize);
  if (ULTRA_FULL.ultra.farShadow) assert.equal(f.counts.farSizes.at(-1), ULTRA.farShadow.mapSize);
  assert.equal(f.runtime.active, true);

  // Not engaged: ignored; and a teardown writes the ordinary rig whatever was chosen.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  const after = f.counts.farBuilds;
  f.runtime.onDrawingBuffer(780, 1688);
  assert.equal(f.counts.farBuilds, after);
  assert.equal(f.sun.shadow.mapSize.x, LIGHTING.shadowMapSize);
});

test('N1: a window dragged to and fro across the 2 MP line reallocates nothing — the maps move only when the buffer leaves the band', () => {
  const f = fixture();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const far = ULTRA_FULL.ultra.farShadow;
  const builds = (): number => f.counts.farBuilds;
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize, 'q205 1920×1080 takes the full maps');
  const start = builds();

  // Across the line and back, twenty times, and down into the band: nothing moves.
  for (let crossing = 0; crossing < 20; crossing += 1) {
    f.runtime.onDrawingBuffer(crossing % 2 === 0 ? 1999 : 2001, 1000);
    assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize, `crossing ${crossing}: the near map moved`);
  }
  f.runtime.onDrawingBuffer(1900, 1000); // 1.9 MP: inside the band
  f.runtime.onDrawingBuffer(1800, 1000); // exactly 1.8 MP: still inside
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize);
  assert.equal(builds(), start, 'no far map was rebuilt inside the band');
  assert.equal(report(f).shadow?.mapSize, ULTRA.near.mapSize);

  // Below the band: the small maps, once.
  f.runtime.onDrawingBuffer(1700, 1000);
  assert.equal(f.sun.shadow.mapSize.x, 2048);
  if (far) assert.deepEqual(f.counts.farSizes.slice(-1), [2048]);
  const afterDrop = builds();
  assert.equal(afterDrop, start + (far ? 1 : 0));
  // Back up into the band: the small maps stay; only 2 MP takes the full ones again.
  f.runtime.onDrawingBuffer(1900, 1000);
  f.runtime.onDrawingBuffer(1999, 1000);
  assert.equal(f.sun.shadow.mapSize.x, 2048);
  assert.equal(builds(), afterDrop);
  f.runtime.onDrawingBuffer(2000, 1000);
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize);
  assert.equal(builds(), afterDrop + (far ? 1 : 0));

  // A world swap under Ultra with the buffer in the band keeps the maps it holds…
  f.host.canvas = { width: 1900, height: 1000, pixelRatio: 1 };
  f.runtime.installWorld(fakePlan(undefined, 'band-world'), SELECTION, undefined);
  assert.equal(f.runtime.active, true);
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize, 'a world swap in the band dropped the maps');
  if (far) assert.equal(f.counts.farSizes.at(-1), ULTRA.farShadow.mapSize);
  // …while an entry from the ordinary tier at the same buffer is a fresh choice.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  assert.equal(f.sun.shadow.mapSize.x, 2048, 'a fresh entry at 1.9 MP takes the small maps');
  if (far) assert.equal(f.counts.farSizes.at(-1), 2048);
});

test('I4: the pixel budget is live — the cap follows it at once, and a buffer pushed under 2 MP drops the maps', () => {
  const f = fixture();
  assert.equal(f.runtime.ultraPixelBudget, ULTRA.pixelBudget);
  // Not drawing: stored for the next activation, nothing resized.
  const idle = f.counts.resizes;
  f.runtime.setPixelBudget(3_000_000);
  assert.equal(f.counts.resizes, idle);
  assert.equal(f.runtime.tierPixelCap(1920, 1080), Number.POSITIVE_INFINITY, 'the ordinary expression is untouched');
  f.runtime.setPixelBudget(ULTRA.pixelBudget);

  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const resizes = f.counts.resizes;
  f.runtime.setPixelBudget(1_500_000);
  assert.equal(f.counts.resizes, resizes + 1, 'the buffer follows the knob at once');
  assert.equal(f.runtime.tierPixelCap(1920, 1080), Math.sqrt(1_500_000 / (1920 * 1080)));
  assert.equal(f.sun.shadow.mapSize.x, 2048, 'a 1.5 MP buffer takes the small maps');
  f.runtime.setPixelBudget(ULTRA.pixelBudget);
  assert.equal(f.sun.shadow.mapSize.x, ULTRA.near.mapSize);
  // Nonsense is ignored.
  for (const nonsense of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    f.runtime.setPixelBudget(nonsense);
    assert.equal(f.runtime.ultraPixelBudget, ULTRA.pixelBudget);
  }
});

test('F3: the Ultra sky is drawn through its own colour-only cube, which the ledger counts and every exit disposes', () => {
  const f = fixture({ bake: true });
  const plain = fixture();
  const ordinary = f.scene.background as THREE.Texture;
  assert.equal(ordinary.name, 'sky', 'an ordinary rig hangs the equirect sky, as three expects');

  f.runtime.setWanted(true, null);
  plain.runtime.setWanted(true, null);
  f.runtime.reconcile();
  plain.runtime.reconcile();
  const background = f.scene.background as THREE.Texture;
  assert.equal((background as THREE.CubeTexture).isCubeTexture, true, 'the background is the cube');
  assert.equal(background.name, 'cube-of-fake-ultra-sky');
  assert.equal(f.lighting.sky.texture.name, 'fake-ultra-sky', 'the rig still reports the painted equirect');
  assert.equal(f.counts.cubesBaked, 1);
  assert.equal(report(f).bytes.steady - report(plain).bytes.steady, FAKE_CUBE_BYTES, 'the cube is in the ledger');
  assert.equal(report(f).bytes.peakSwitch - report(plain).bytes.peakSwitch, FAKE_CUBE_BYTES);

  // A restored context re-converts the faces.
  f.runtime.onContextRestored();
  assert.equal(f.counts.cubesRebaked, 1);

  // A world swap: a new sky, a new cube, the old one gone first.
  f.runtime.installWorld(fakePlan(undefined, 'another-plan'), SELECTION, undefined);
  assert.equal(f.counts.cubesBaked, 2);
  assert.equal(f.counts.cubesDisposed, 1);
  assert.equal((f.scene.background as THREE.Texture).name, 'cube-of-fake-ultra-sky');

  // Exit: every cube disposed, the ordinary equirect hung, the ledger at zero.
  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  assert.equal(f.counts.cubesDisposed, f.counts.cubesBaked);
  assert.equal((f.scene.background as THREE.Texture).name, 'sky');
  assert.equal((f.scene.background as THREE.CubeTexture).isCubeTexture, undefined);
  assert.equal(report(f).bytes.steady, 0);
  f.runtime.onContextRestored();
  assert.equal(f.counts.cubesRebaked, 1, 'nothing to re-convert off the tier');
});

test('F3: a cube that cannot be baked falls back on the sky stage and leaks no sky', () => {
  const f = fixture({ bake: 'throw' });
  const before = state(f);
  f.runtime.setWanted(true, null);
  const { value: result } = quietly(() => f.runtime.reconcile());
  assert.equal(result.active, false);
  assert.equal(result.refusal?.kind === 'setup-failed' ? result.refusal.stage : null, 'sky');
  assert.equal(f.counts.skiesDisposed, f.counts.skiesPainted, 'the painted sky went with the failed cube');
  assert.deepEqual(state(f), before);
});

/**
 * A GL-less renderer for three's own cube conversion (A28 C2): it records
 * every target it is pointed at and hears each one's `dispose`, and its
 * `render` throws on the `throwOn`-th call — inside the conversion, after the
 * cube exists, as a lost or exhausted context can. It starts on a target of
 * its own with XR on, so a conversion that strands either state shows.
 */
function conversionRenderer(throwOn: number | null): {
  renderer: THREE.WebGLRenderer;
  previous: THREE.WebGLRenderTarget;
  state: { target: THREE.RenderTarget | null; renders: number; throwOn: number | null };
  seen: THREE.RenderTarget[];
  disposed: Set<THREE.RenderTarget>;
} {
  const previous = new THREE.WebGLRenderTarget(2, 2);
  const state = { target: previous as THREE.RenderTarget | null, face: 0, level: 0, renders: 0, throwOn };
  const seen: THREE.RenderTarget[] = [];
  const disposed = new Set<THREE.RenderTarget>();
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem,
    reversedDepthBuffer: false,
    xr: { enabled: true },
    autoClear: true,
    getRenderTarget: () => state.target,
    getActiveCubeFace: () => state.face,
    getActiveMipmapLevel: () => state.level,
    setRenderTarget(target: THREE.RenderTarget | null, face = 0, level = 0): void {
      state.target = target;
      state.face = face;
      state.level = level;
      if (target !== null && target !== previous && !seen.includes(target)) {
        seen.push(target);
        target.addEventListener('dispose', () => disposed.add(target));
      }
    },
    render(): void {
      state.renders += 1;
      if (state.renders === state.throwOn) throw new Error('context lost mid-conversion');
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, previous, state, seen, disposed };
}

/** A small painted-sky stand-in with the filters `createSky` gives the real one. */
function skyForBake(): THREE.DataTexture {
  const sky = new THREE.DataTexture(new Uint8Array(8 * 4 * 4), 8, 4, THREE.RGBAFormat);
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.minFilter = THREE.LinearMipmapLinearFilter;
  sky.magFilter = THREE.LinearFilter;
  sky.generateMipmaps = true;
  return sky;
}

test('A28 C2: a sky-cube conversion that throws inside disposes the cube it created and puts the renderer back', () => {
  // The first face, a middle face and the last: the cube exists for all three.
  for (const throwOn of [1, 4, 6]) {
    const sky = skyForBake();
    const fake = conversionRenderer(throwOn);
    assert.throws(() => bakeUltraSkyBackground(fake.renderer, sky), /context lost mid-conversion/);
    assert.equal(fake.seen.length, 1, `throw on render ${throwOn}: created`);
    assert.ok(fake.seen[0] instanceof THREE.WebGLCubeRenderTarget);
    assert.equal(fake.disposed.size, 1, `throw on render ${throwOn}: the cube was stranded`);
    assert.equal(fake.state.target, fake.previous, 'the renderer was left on the disposed cube');
    assert.equal(fake.renderer.xr.enabled, true, 'XR was left off');
    assert.equal(sky.minFilter, THREE.LinearMipmapLinearFilter, 'the sky kept the conversion’s filter');
  }
});

test('A28 C2: a baked cube is the one target made; a re-bake that throws keeps it (it is owned) and puts the renderer back', () => {
  const sky = skyForBake();
  const fake = conversionRenderer(null);
  const background = bakeUltraSkyBackground(fake.renderer, sky);
  assert.equal(fake.seen.length, 1);
  assert.equal(background.target, fake.seen[0]);
  assert.equal(background.texture, (fake.seen[0] as THREE.WebGLCubeRenderTarget).texture);
  assert.equal(fake.disposed.size, 0);
  assert.equal(fake.state.target, fake.previous);

  // The context comes back and the re-conversion fails half way.
  fake.state.throwOn = fake.state.renders + 3;
  assert.throws(() => background.rebake(), /context lost mid-conversion/);
  assert.equal(fake.disposed.size, 0, 'the re-bake disposed a cube the runtime still hangs');
  assert.equal(fake.state.target, fake.previous);
  assert.equal(fake.renderer.xr.enabled, true);
  assert.equal(sky.minFilter, THREE.LinearMipmapLinearFilter);

  background.dispose();
  assert.equal(fake.disposed.size, 1);
});

test('A28, FE: release frees the cube\'s GPU copy at a context loss and keeps the cube: the re-bake converts into the same one', () => {
  const sky = skyForBake();
  const fake = conversionRenderer(null);
  const background = bakeUltraSkyBackground(fake.renderer, sky);
  const cube = fake.seen[0];
  const renders = fake.state.renders;
  background.release();
  assert.deepEqual([...fake.disposed], [cube], 'the loss did not free the faces through three');
  assert.equal(fake.state.renders, renders, 'a release converted');
  assert.equal(background.texture, (cube as THREE.WebGLCubeRenderTarget).texture, 'the hung texture moved');
  background.rebake();
  assert.equal(fake.seen.length, 1, 'the re-bake made a second cube');
  assert.equal(fake.state.renders, renders + 6, 'the re-bake did not convert six faces into the kept cube');
  assert.equal(fake.state.target, fake.previous);
  background.dispose();
  assert.deepEqual([...fake.disposed], [cube]);
});

const SKY_TEXTURE_FIELDS = [
  'name', 'mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'format',
  'internalFormat', 'type', 'colorSpace', 'generateMipmaps', 'premultiplyAlpha', 'flipY', 'unpackAlignment',
  'rotation', 'matrixAutoUpdate',
] as const;

test('I1: a painted Ultra sky is painted once per key, and a cached copy is createSky’s texture field for field', () => {
  // Small so the test is quick; the key and the copy do not depend on the size.
  const options: SkyOptions = {
    width: 64,
    height: 32,
    anisotropy: 4,
    fineOctaveAmplitude: 0.5,
    daylightClouds: true,
    cloudSeed: 11,
  };
  const cache = new UltraSkyCache(2);
  const first = cache.paint(DAYLIGHT_LOOK, options);
  const again = cache.paint(DAYLIGHT_LOOK, options);
  assert.deepEqual(cache.stats(), { entries: 1, hits: 1, misses: 1 });

  const fresh = createSky(DAYLIGHT_LOOK, options);
  const record = (texture: THREE.Texture): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const key of SKY_TEXTURE_FIELDS) out[key] = texture[key];
    out.offset = texture.offset.toArray();
    out.repeat = texture.repeat.toArray();
    out.center = texture.center.toArray();
    out.isDataTexture = (texture as THREE.DataTexture).isDataTexture;
    const image = texture.image as { width: number; height: number };
    out.size = [image.width, image.height];
    return out;
  };
  assert.deepEqual(record(again.texture), record(fresh.texture));
  const json = (texture: THREE.Texture): Record<string, unknown> => {
    const out = texture.toJSON() as unknown as Record<string, unknown>;
    delete out.uuid;
    delete out.image;
    return out;
  };
  assert.deepEqual(json(again.texture), json(fresh.texture), 'every serialised field agrees');
  assert.deepEqual(
    (again.texture.image as { data: Uint8Array }).data,
    (fresh.texture.image as { data: Uint8Array }).data,
    'the same pixels',
  );
  assert.ok(again.texture.version > 0, 'the copy uploads on its first frame');
  assert.notEqual(again.texture, first.texture);
  assert.notEqual(again.texture.source, first.texture.source, 'its own Source: a disposed sky is never shared');

  // Another plan's seed is another sky; the least recently used goes first.
  cache.paint(DAYLIGHT_LOOK, { ...options, cloudSeed: 12 });
  cache.paint(DAYLIGHT_LOOK, { ...options, cloudSeed: 13 });
  assert.equal(cache.stats().entries, 2);
  cache.paint(DAYLIGHT_LOOK, options);
  assert.equal(cache.stats().misses, 4, 'seed 11 was the oldest and was evicted');
  cache.paint(DAYLIGHT_LOOK, { ...options, cloudSeed: 13 });
  assert.equal(cache.stats().hits, 2, 'seed 13 was kept');
  cache.clear();
  assert.equal(cache.stats().entries, 0);
  assert.ok(ULTRA_SKY_CACHE_ENTRIES >= 2 && ULTRA_SKY_CACHE_ENTRIES <= 3);
  first.dispose();
  again.dispose();
  fresh.dispose();
});

test('F7: the cop’s inner rig is found once per cop, not walked for every frame, and found again when re-dressed', () => {
  const f = fixture();
  const cop = new THREE.Group();
  cop.name = 'cop-rider';
  const rig = new THREE.Group();
  rig.name = 'cop-riding-rig';
  rig.position.set(-3, 0, 2);
  cop.add(rig);
  let walks = 0;
  const walk = cop.getObjectByName.bind(cop);
  cop.getObjectByName = (name: string): THREE.Object3D | undefined => {
    walks += 1;
    return walk(name);
  };
  f.scene.add(cop);
  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  const uniforms = f.context()!.shared.uniforms;
  const points = uniforms.ultraContactPoints.value as THREE.Vector4[];
  for (let frame = 0; frame < 5; frame += 1) f.runtime.beforeSoloRender(f.camera);
  assert.equal(walks, 1, 'one walk for the cop, however many frames');
  assert.ok(Math.abs(points[0].x + 3) < 1e-6 && Math.abs(points[0].y - 2) < 1e-6);

  // Re-dressed: the old rig leaves, a new one stands elsewhere.
  cop.remove(rig);
  const dressed = new THREE.Group();
  dressed.name = 'cop-riding-rig';
  dressed.position.set(4, 0, -6);
  cop.add(dressed);
  f.runtime.beforeSoloRender(f.camera);
  f.runtime.beforeSoloRender(f.camera);
  assert.equal(walks, 2, 'found again once, then cached');
  assert.ok(Math.abs(points[0].x - 4) < 1e-6 && Math.abs(points[0].y + 6) < 1e-6);
});

test('round 3 item 3: held rider materials read the near map through the disk, and come back exactly', () => {
  const f = fixture();
  const rider = riderRig();
  const cop = riderRig('cop-rider');
  f.scene.add(rider.group);
  f.scene.add(cop.group);
  const materials = [...rider.meshes, ...cop.meshes].map((mesh) => mesh.material as THREE.MeshStandardMaterial);
  // One material arrives with its own compile hook and key, as a rider patch might.
  const authored = materials[0];
  let authoredRuns = 0;
  const authoredCompile = (): void => {
    authoredRuns += 1;
  };
  const authoredKey = (): string => 'authored-key';
  authored.onBeforeCompile = authoredCompile;
  authored.customProgramCacheKey = authoredKey;
  const versions = materials.map((material) => material.version);

  f.runtime.setWanted(true, null);
  f.runtime.reconcile();
  materials.forEach((material, index) => {
    assert.ok(hasRiderShadow(material), `material ${index} carries the rider filter`);
    assert.ok(material.version > versions[index], `material ${index} was flagged for a program change`);
  });
  assert.equal(authored.customProgramCacheKey(), `authored-key|${ULTRA_RIDER_SHADOW_KEY}`);
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {},
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  authored.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
  assert.equal(authoredRuns, 1, 'the authored hook still runs');
  assert.ok(shader.fragmentShader.includes('shadow = ultraNearEdgeShadow( shadowMap'), 'the ground’s filter replaced three’s taps');

  // A rig added while Ultra holds is held; one removed is handed back.
  const late = riderRig();
  f.scene.add(late.group);
  const lateMaterial = late.meshes[0].material as THREE.MeshStandardMaterial;
  assert.ok(hasRiderShadow(lateMaterial));
  f.scene.remove(late.group);
  assert.equal(hasRiderShadow(lateMaterial), false);
  assert.equal(Object.prototype.hasOwnProperty.call(lateMaterial, 'onBeforeCompile'), false);

  f.runtime.setWanted(false, null);
  f.runtime.reconcile();
  for (const material of materials.slice(1)) {
    assert.equal(hasRiderShadow(material), false);
    assert.equal(Object.prototype.hasOwnProperty.call(material, 'onBeforeCompile'), false, 'the prototype hook is uncovered');
    assert.equal(Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey'), false);
    assert.equal(material.onBeforeCompile, THREE.Material.prototype.onBeforeCompile);
  }
  assert.equal(authored.onBeforeCompile, authoredCompile, 'an own hook comes back as itself');
  assert.equal(authored.customProgramCacheKey, authoredKey);
  assert.equal(authored.customProgramCacheKey(), 'authored-key');

  // Under `-lighting` the rider keeps its authored flags, so nothing is patched.
  const unlit = fixture();
  const plainRider = riderRig();
  unlit.scene.add(plainRider.group);
  unlit.runtime.setWanted(true, { lighting: false });
  unlit.runtime.reconcile();
  assert.equal(unlit.runtime.active, true);
  for (const mesh of plainRider.meshes) assert.equal(hasRiderShadow(mesh.material as THREE.Material), false);
});

test('F-A3: a world whose far build finds nothing binds the uploaded empty far map, never null, charges its 4 B, and gives it up at every retire and exit', () => {
  const f = fixture();
  const empty = emptyFarShadowMap();
  let released = 0;
  const listener = (): void => { released += 1; };
  empty.addEventListener('dispose', listener);
  try {
    // No far map on the kit: no program declares the far sampler, and the
    // ledger has no line for the empty map.
    f.runtime.setWanted(true, { farShadow: false });
    f.runtime.reconcile();
    assert.equal(f.runtime.active, true);
    const without = report(f).bytes.steady;

    // The far map on. The fake host's far build renders nothing, which is
    // exactly what a world with nothing on layer 5 gets (`texture` stays null).
    released = 0;
    const builds = f.counts.farBuilds;
    f.runtime.setWanted(true, ALL_STAGES);
    f.runtime.reconcile();
    assert.equal(f.runtime.active, true);
    assert.equal(f.counts.farBuilds, builds + 1);
    assert.ok(released >= 1, 'the rung change retired a world without releasing the empty far map');
    const u = f.context()?.shared.uniforms;
    assert.ok(u !== undefined);
    // The first frame's hook ran (`drawFirstFrame` calls it): the sampler holds the empty map, lookups off.
    assert.equal(u.ultraFarMap.value, empty, 'the first frame drew with the far sampler bound null');
    assert.equal(u.ultraFarEnabled.value, 0);
    const on = report(f);
    assert.equal(on.farShadow, null, 'the report invents a far map');
    assert.equal(on.bytes.steady - without, EMPTY_FAR_SHADOW_BYTES, 'the empty far map is not in the ledger');

    // A world swap: released with the old world, bound again by the new one.
    released = 0;
    f.runtime.installWorld(fakePlan(WARM), SELECTION, undefined);
    assert.equal(f.runtime.active, true);
    assert.ok(released >= 1, 'a world swap kept the empty far map');
    assert.equal(f.context()?.shared.uniforms.ultraFarMap.value, empty);

    // Exit: the one teardown frees it, and the ledger reads 0.
    released = 0;
    f.runtime.setWanted(false, null);
    f.runtime.reconcile();
    assert.equal(f.runtime.active, false);
    assert.ok(released >= 1, 'the teardown kept the empty far map');
    assert.equal(report(f).bytes.steady, 0);
  } finally {
    empty.removeEventListener('dispose', listener);
  }
});
