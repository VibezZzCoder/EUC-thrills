/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra runtime — M39 (`docs/M39_ULTRA.md` §3.6, §6.3 W5).
 *
 * Everything `render/Renderer.ts` does *about* Ultra lives here: the intent
 * and its refusals, admission per world, the activation sequence, the per-frame
 * solo hook, the resource ledger, safety demotion, shader-error demotion,
 * context restore, and the single idempotent `teardown` every exit shares. The
 * renderer keeps the ordinary frame exactly as it was and calls in at a handful
 * of guarded points; nothing below runs on a Low, Medium or High frame except
 * the three one-line questions the renderer asks every frame (`active`,
 * `demotionPending`, `tierPixelCap`), each of which answers the ordinary value
 * immediately when Ultra is not engaged.
 *
 * **Why a host, not a renderer reference.** Every GPU-touching step — building
 * a world, painting a sky, filtering an environment, rendering the far map and
 * the first frame, the shader-error hook — is a method on `UltraHost`, which
 * `GameRenderer` implements in a few lines each. The state machine itself
 * therefore runs under `node --test` against a fake host, which is how
 * `ultraRuntime.test.ts` proves that teardown is idempotent after a failure at
 * *every* stage, that the ledger returns to zero, and that the rider flags come
 * back as authored — none of which a browser spec can reach one stage at a
 * time. The lighting maths is never here: every lighting value is written by
 * W4's functions (`shadowRigFor`, `writeShadowRig`, `finaliseShadowFocus`,
 * `ultraFill`, `updateUltraShared`, `tuneUltraShared`) or by the venue rig's
 * tier, and this file introduces no lighting constant (§3.1, invariant 6).
 *
 * **Refusal scopes (§6.2).** `capability` and `setup-failed` are sticky for the
 * session; `envelope` is this world's and is re-judged on the next;
 * `presentation-override` holds while the diagnostic override does. A request
 * made while more than one view is drawn is refused for as long as that lasts
 * (a `setup-failed` naming the view count, never stored): Ultra draws one view.
 *
 * No parameter properties and no enum (`erasableSyntaxOnly`, invariant 13).
 */
import * as THREE from 'three';
import { ULTRA } from '../../data/tuning.ts';
import type { ResolvedVenueLook } from '../../data/venueLook.ts';
import type { LevelPlan } from '../../level/plan.ts';
import type { PresentationCost, PresentationRecipeId, PresentationSelection } from '../presentation.ts';
import type {
  LightingTier,
  UltraEnvironment,
  UltraSkyTexture,
  VenueLighting,
  VenueLightingHooks,
} from '../Renderer.ts';
import { createSky, cumulusSeedFor, skyParamsFor, type SkyOptions, type SkyTexture } from '../sky.ts';
import type { TerrainView } from '../terrain.ts';
import {
  cubeTargetBytes,
  ultraEnvironmentSourceBytes,
  ultraTargetBytes,
  type judgeUltra,
  type UltraCaps,
} from './ultraCost.ts';
import { downSunOf, riderContactOccluders, type RiderContact } from './groundContact.ts';
import { ULTRA_CONTACT_FLOATS, ULTRA_CONTACT_SHADE_FLOATS, ULTRA_CONTACT_SLOTS, ULTRA_CONTACT_VEC4_PER_SLOT } from './ultraGroundDetail.ts';
import { EMPTY_FAR_SHADOW_BYTES, releaseEmptyFarShadowMap, UltraFarShadow } from './ultraFarShadow.ts';
import { createUltraBackgroundCube } from './ultraBackgroundCube.ts';
import {
  holdRiderShadow, rekeyRiderLight, releaseRiderShadow, riderLightUniforms, type HeldRiderShadow,
} from './ultraRiderShadow.ts';
import { ultraShadowMapSizesAfter, type UltraShadowMapSizes } from './ultraShadowSizes.ts';
import {
  finaliseShadowFocus,
  readUltraLive,
  shadowRigFor,
  ultraFill,
  writeShadowRig,
} from './ultraLighting.ts';
import { createUltraShared, tuneUltraShared, updateUltraShared } from './ultraMaterials.ts';
import { holdRendererState } from './ultraRendererState.ts';
import type {
  BuildRecipe,
  BuildRecipeId,
  ShadowRig,
  UltraBuildContext,
  UltraFaultPlant,
  UltraFaultStage,
  UltraFrameCost,
  UltraGlError,
  UltraGlStage,
  UltraKitOverride,
  UltraKitSwitch,
  UltraLiveTuning,
  UltraRecipe,
  UltraRefusal,
  UltraReport,
  UltraShared,
  UltraTierResult,
} from './ultraTypes.ts';

/** The three ordinary words `GameRenderer.setQuality` speaks. */
export type OrdinaryQuality = 'low' | 'medium' | 'high';

/** `judgeUltra`'s whole answer, as the host hands it back. */
export type UltraJudgement = ReturnType<typeof judgeUltra>;

/** Told a description of a shader that failed to compile or link. */
export type ShaderErrorHook = (detail: string) => void;

/**
 * How a teardown ends (§3.6):
 *
 *   - `exit` — tier exit, failed setup, safety demotion: everything, including
 *     re-hanging the light at the ordinary tier and rebuilding the ordinary
 *     world;
 *   - `world` — `setLevel` into a world that draws ordinary: everything but the
 *     light (the caller hangs the *new* look at the ordinary tier next, so the
 *     sky is painted once) and the world (the caller has already disposed it);
 *   - `dispose` — the renderer is going away: everything but re-hanging the
 *     light and rebuilding a world nobody will see.
 */
export type TeardownMode = 'exit' | 'world' | 'dispose';

/**
 * What the runtime needs from the renderer. Everything that touches the GPU is
 * a method, so a fake host drives the whole lifecycle headlessly.
 */
export interface UltraHost {
  readonly scene: THREE.Scene;
  readonly sun: THREE.DirectionalLight;
  /** The venue rig — created *after* the runtime, so it is asked for, not held. */
  lighting(): VenueLighting;
  /** What `setQuality` last wrote; the ordinary rig a teardown returns to. */
  ordinaryQuality(): OrdinaryQuality;
  /** Views the frame draws (the perf quad probe counts as its four panes). */
  viewCount(): number;
  /** Activation step 1: WebGL2, half-float render targets, `MAX_TEXTURE_SIZE`. */
  probeCaps(): UltraCaps;
  /** `renderer.capabilities.getMaxAnisotropy()`; 1 headlessly. */
  maxAnisotropy(): number;
  /** W7's admission, `judgeUltra(plan, caps, override)`. */
  judge(plan: LevelPlan, caps: UltraCaps, override: UltraKitOverride | null): UltraJudgement;
  /** The terrain view the scene is drawing, or null between a dispose and a build. */
  installedTerrain(): TerrainView | null;
  /**
   * Dispose whatever terrain is installed, *then* build and install this one
   * (one world at a time, §3.6 step 5). `context` null is the ordinary call,
   * exactly `createTerrain(plan, recipe)`.
   *
   * `beforeBuild` (Fable F1) runs after the outgoing view is disposed and
   * before the new one is built — where the planted `?ultrafault=build` fires,
   * so the planted failure has the shape of a real builder exception: the old
   * world already gone, nothing installed.
   */
  installTerrain(
    plan: LevelPlan,
    recipe: BuildRecipe,
    context: UltraBuildContext | null,
    beforeBuild?: () => void,
  ): TerrainView;
  /**
   * The Ultra sky (T8): W4's `createSky(look, ultraSkyOptions(maxAnisotropy,
   * cloudSeed))`, with `cloudSeed` the installed plan's `cumulusSeedFor(plan.id)`.
   * The renderer paints through an `UltraSkyCache` (Fable I1).
   */
  paintUltraSky(look: ResolvedVenueLook, cloudSeed: number): SkyTexture;
  /**
   * The drawn background for an Ultra sky (Fable F3, A22): the sky converted
   * to a colour-only cube (`bakeUltraSkyBackground`). Optional — a host
   * without it draws the equirect sky itself, as three would.
   */
  bakeSkyBackground?(sky: THREE.Texture): UltraSkyBackground;
  /**
   * The canvas in CSS pixels and the ordinary pixel ratio
   * (`min(devicePixelRatio, maxPixelRatio)`), from which the runtime works out
   * the buffer an Ultra frame draws to (A22's map sizes). Zero before layout.
   */
  canvas(): { readonly width: number; readonly height: number; readonly pixelRatio: number };
  /** The painted-sky environment (T1): W4's `buildUltraEnvironment`. */
  buildEnvironment(look: ResolvedVenueLook, live: UltraLiveTuning): UltraEnvironment;
  /** The static far map (T12): `far.build(renderer, scene, sunOffsetUnit)`, outside any frame. */
  buildFarShadow(far: UltraFarShadow, sunOffsetUnit: THREE.Vector3): void;
  /**
   * Draw one solo Ultra frame now — which compiles every Ultra program and
   * allocates the near map — and return `gl.getError()` (0 is `NO_ERROR`).
   * Must call `beforeSoloRender` exactly as a real frame does. Nothing
   * pending is drained first (A28 C1): the activation drained the stale
   * errors before its first allocation, so what is pending now is Ultra's.
   */
  drawFirstFrame(): number;
  /**
   * A28 C1: read the context's pending errors in order — `gl.getError()`
   * until `NO_ERROR`, at most `limit` reads (a lost context may keep
   * answering) — and return the codes read. Reading clears them from the
   * context; the runtime keeps them. Optional: a host without it reads none.
   */
  readGlErrors?(limit: number): readonly number[];
  /**
   * A28 C1: `gl.checkFramebufferStatus` for an Ultra render target (the
   * first incomplete face of a cube), or null when it cannot be asked — a
   * lost context, a target nothing has rendered into, or a check that failed
   * (0; the runtime treats a 0 as null too). Optional.
   */
  framebufferStatus?(target: THREE.RenderTarget): number | null;
  /**
   * A28 C1, `?ultrafault=gl-*` only: raise a genuine GL error of `code` on
   * the context now (INVALID_FRAMEBUFFER_OPERATION or INVALID_ENUM). Optional.
   */
  raiseGlError?(code: number): void;
  /** Install the renderer's `debug.onShaderError` hook, or remove it with null. */
  setShaderErrorHook(hook: ShaderErrorHook | null): void;
  /** Re-run `GameRenderer.resize()` so a changed `tierPixelCap` takes effect. */
  resize(): void;
  /** The ordinary `setShadowFocus`, literally — how a teardown hands the cascade back. */
  setShadowFocus(x: number, y: number, z: number): void;
  /** Milliseconds, for the recorded timings only (never a frame interval). */
  now(): number;
}

/** `gl.OUT_OF_MEMORY` — a `getError` code that refuses (§6.3 W5 step 9, A28 C1). */
export const GL_OUT_OF_MEMORY = 0x0505;
/** `gl.INVALID_FRAMEBUFFER_OPERATION` — the other `getError` code that refuses (A28 C1). */
export const GL_INVALID_FRAMEBUFFER_OPERATION = 0x0506;
/** `gl.INVALID_ENUM` — recorded, never refusing; what `?ultrafault=gl-enum` raises. */
export const GL_INVALID_ENUM = 0x0500;
/** `gl.FRAMEBUFFER_COMPLETE`; any other framebuffer status on an Ultra target refuses. */
export const GL_FRAMEBUFFER_COMPLETE = 0x8cd5;
/** The most `getError` reads per stage (A28 C1): a lost context may keep answering. */
export const GL_ERROR_READS = 16;

const GL_CODE_NAMES: ReadonlyMap<number, string> = new Map([
  [0x0500, 'INVALID_ENUM'],
  [0x0501, 'INVALID_VALUE'],
  [0x0502, 'INVALID_OPERATION'],
  [0x0505, 'OUT_OF_MEMORY'],
  [0x0506, 'INVALID_FRAMEBUFFER_OPERATION'],
  [0x9242, 'CONTEXT_LOST_WEBGL'],
  [0x8cd6, 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT'],
  [0x8cd7, 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT'],
  [0x8cd9, 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS'],
  [0x8cdd, 'FRAMEBUFFER_UNSUPPORTED'],
  [0x8d56, 'FRAMEBUFFER_INCOMPLETE_MULTISAMPLE'],
]);

function glHex(code: number): string {
  return `0x${code.toString(16).padStart(4, '0')}`;
}

/** A GL error or framebuffer status by its WebGL name, or its hex when it has none here. */
export function glCodeName(code: number): string {
  return GL_CODE_NAMES.get(code) ?? glHex(code);
}

/** What each GL stage follows, for a refusal's words. */
const GL_STAGE_WORDS: Readonly<Record<UltraGlStage, string>> = Object.freeze({
  stale: 'before Ultra started',
  sky: 'the Ultra sky background cube',
  environment: 'the Ultra environment',
  'far-shadow': 'the Ultra far shadow map',
  'first-frame': 'the first Ultra frame',
});

/**
 * The genuine GL error `?ultrafault=` raises at each stage (A28 C1), after
 * that stage's allocation and before its read.
 */
const GL_PLANTS: Readonly<Partial<Record<UltraGlStage, { readonly fault: UltraFaultPlant; readonly code: number }>>> =
  Object.freeze({
    sky: Object.freeze({ fault: 'gl-sky', code: GL_INVALID_FRAMEBUFFER_OPERATION }),
    environment: Object.freeze({ fault: 'gl-enum', code: GL_INVALID_ENUM }),
    'first-frame': Object.freeze({ fault: 'gl-framebuffer', code: GL_INVALID_FRAMEBUFFER_OPERATION }),
  });

/**
 * One finding of an activation's GL check (A28 C1). It refuses when it is an
 * incomplete framebuffer or an OUT_OF_MEMORY / INVALID_FRAMEBUFFER_OPERATION
 * from any stage after the stale drain.
 */
export function glFinding(stage: UltraGlStage, code: number, target: string | null): UltraGlError {
  const refuses = stage !== 'stale'
    && (target !== null || code === GL_OUT_OF_MEMORY || code === GL_INVALID_FRAMEBUFFER_OPERATION);
  return Object.freeze({ stage, code, name: glCodeName(code), target, refuses });
}

/** The words a refusing finding fails the activation with: its stage and its code. */
export function glRefusalMessage(finding: UltraGlError): string {
  const after = GL_STAGE_WORDS[finding.stage];
  return finding.target === null
    ? `gl.getError() reported ${finding.name} (${glHex(finding.code)}) after ${after}`
    : `the ${finding.target} framebuffer is incomplete (${finding.name}, ${glHex(finding.code)}) after ${after}`;
}

/**
 * The words a non-refusing finding is surfaced with (Fable finding 7): its
 * stage and code, and that it is recorded and does not refuse (A28 C1).
 */
export function glNoticeMessage(finding: UltraGlError): string {
  return `${glRefusalMessage(finding)}; recorded in the Ultra report (glErrors), and it does not refuse Ultra`;
}

/**
 * Bytes per near-map texel as three 0.185.1 allocates a PCF map: an RGBA8
 * colour target plus a 32-bit `UnsignedIntType` depth texture
 * (`WebGLShadowMap.js:252-253`) — §5's 128 MiB at 4096².
 */
const NEAR_BYTES_PER_TEXEL = 8;

/**
 * The scene children whose meshes receive shadow on the Ultra tier, by the
 * names their builders give them: every seat's rig (`render/ridingRig.ts`) and
 * the pack's three trims (`render/copRider.ts`: the tail `cop-rider`, the
 * patrols `cop2-rider` and `cop3-rider`, M39 Part P). Three identical officers
 * are one force (q211), so a patrol lit by the ordinary materials beside an
 * Ultra-lit tail would read as a different man. The ghost is deliberately
 * absent — it is MeshBasic and translucent and is untouched by Ultra (§3.3) —
 * as are the perf probe's rigs, which cannot coexist with Ultra.
 */
export const ULTRA_RECEIVING_RIGS: ReadonlySet<string> = new Set(['riding-rig', 'cop-rider', 'cop2-rider', 'cop3-rider']);

/** Whether a scene child is a rider rig whose meshes receive on the Ultra tier. */
export function isReceivingRig(object: THREE.Object3D): boolean {
  return ULTRA_RECEIVING_RIGS.has(object.name);
}

/**
 * Where each rig's contact is read (coordinator amendment A9): the scene
 * child's name, the rig group whose position is the wheel's ground contact
 * (the controller's pose `x, y, z`, `render/ridingRig.ts`), and the pelvis
 * whose ground projection is the body's footprint. The cop's copy of the rig
 * prefixes every name with `cop-` (`render/copRider.ts`), and the pack's
 * patrols with `cop2-` and `cop3-` (M39 Part P, R-7). The player's rig is
 * listed first so it always has slots; `ULTRA_CONTACT_SLOTS` holds every body
 * listed here, two slots each. The ghost is absent — it is a ghost.
 */
export const ULTRA_CONTACT_RIGS: readonly { readonly child: string; readonly rig: string | null; readonly pelvis: string }[] = Object.freeze([
  Object.freeze({ child: 'riding-rig', rig: null, pelvis: 'rider-pelvis' }),
  Object.freeze({ child: 'cop-rider', rig: 'cop-riding-rig', pelvis: 'cop-rider-pelvis' }),
  Object.freeze({ child: 'cop2-rider', rig: 'cop2-riding-rig', pelvis: 'cop2-rider-pelvis' }),
  Object.freeze({ child: 'cop3-rider', rig: 'cop3-riding-rig', pelvis: 'cop3-rider-pelvis' }),
]);

/**
 * The Ultra pixel cap, T0 (§2.1): `√(budget / cssPixels)`, so the drawing
 * buffer never holds more than `budget` device pixels. `Infinity` for an empty
 * box, where the renderer's resize returns early anyway.
 *
 * It is a *third* term in `Math.min`, never a write to `maxPixelRatio`, so the
 * `applyTuning` push (q206) cannot clobber it; and because it is a `min`, the
 * Ultra ratio is never above High's at any size.
 */
export function ultraPixelCap(budget: number, cssWidth: number, cssHeight: number): number {
  const area = cssWidth * cssHeight;
  return area > 0 ? Math.sqrt(budget / area) : Number.POSITIVE_INFINITY;
}

/**
 * The drawing buffer an Ultra frame draws to on a `cssWidth × cssHeight`
 * canvas whose ordinary ratio is `pixelRatio` (`min(dpr, maxPixelRatio)`):
 * T0's third `Math.min` term applied, then `WebGLRenderer.setSize`'s own
 * `Math.floor`. This is what A22's map sizes are chosen from at activation,
 * before the first Ultra `resize` has run.
 */
export function ultraDrawingBufferFor(
  budget: number,
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): { width: number; height: number } {
  if (!(cssWidth > 0 && cssHeight > 0)) return { width: 0, height: 0 };
  const ratio = Math.min(pixelRatio, ultraPixelCap(budget, cssWidth, cssHeight));
  return { width: Math.floor(cssWidth * ratio), height: Math.floor(cssHeight * ratio) };
}

/**
 * The drawn background of an Ultra sky (Fable F3, coordinator ruling on A22).
 *
 * three 0.185.1 draws an equirectangular `scene.background` through a cube it
 * converts the texture into (`WebGLEnvironments.getCube`): a
 * `WebGLCubeRenderTarget(image.height)` with RGBA8 faces, the sky's mips —
 * and, by `RenderTarget`'s default, a `DEPTH_COMPONENT24` renderbuffer per
 * face that the conversion never tests against. At the Ultra sky's 1024 faces
 * that is 32 MiB of colour and 24 MiB of depth nobody counted. Under Ultra the
 * runtime makes that cube itself, **colour only**, and hangs *it* as the
 * background, so three never builds its own; the ordinary tier keeps three's
 * conversion untouched. The drawn pixels are the same: the same
 * `fromEquirectangularTexture`, the same face size, filters and mips, and a
 * render-target cube texture is drawn with the same `flipEnvMap` as three's.
 */
export interface UltraSkyBackground {
  /** What `scene.background` holds while the sky is hung. */
  readonly texture: THREE.Texture;
  /** The cube target, when the baker names it: the activation checks its framebuffers (A28 C1). */
  readonly target?: THREE.RenderTarget;
  /** Its bytes, as `cubeTargetBytes` prices the model's `sky-background-cube` row. */
  readonly bytes: number;
  /** Convert the sky again — after a context restore, when the faces' content is gone. */
  rebake(): void;
  /**
   * Free the faces' GPU copy and keep the cube for `rebake` — the lost
   * context's half of that pair (A28, FE: `UltraRuntime.onContextLost`).
   * three frees them through the bookkeeping that made them, while the lost
   * context makes every delete a no-op; the `rebake` after the restore sets
   * the cube up again on the new context.
   */
  release(): void;
  dispose(): void;
}

/**
 * Bake an Ultra sky's background cube (`UltraSkyBackground`): the sky's
 * height a face, colour only, converted now — which is outside any frame,
 * because the rig paints skies at activation and at world swaps. The sky
 * texture stays the caller's; this disposes only the cube. The target itself
 * is `ultraBackgroundCube.ts`'s `createUltraBackgroundCube(height)`, the one
 * the model prices (renamed from a same-named twin in the final touch, so a
 * pin can never again check the wrong one: §U2, U4 stabilizer).
 *
 * A28 C2: the cube is this function's from its construction, so a conversion
 * that throws disposes it before the error leaves, and neither a failed bake
 * nor a failed re-bake leaves the renderer bound to it (`convertSky`).
 */
export function bakeUltraSkyBackground(renderer: THREE.WebGLRenderer, sky: THREE.Texture): UltraSkyBackground {
  const edge = (sky.image as { height?: number } | null)?.height ?? 0;
  if (!(edge > 0)) throw new Error('the Ultra sky has no height to convert into a background cube');
  // The one colour-only target the model prices (`ultraBackgroundCube.ts`;
  // `ultraCost.test.ts` pins it depth-free), never a second construction.
  const target = createUltraBackgroundCube(edge);
  let bytes: number;
  try {
    convertSky(renderer, target, sky);
    // `WebGLEnvironments.mapTextureMapping`, as three maps its own conversion
    // of an equirectangular reflection texture.
    target.texture.mapping = THREE.CubeReflectionMapping;
    bytes = cubeTargetBytes(target);
  } catch (error) {
    target.dispose();
    throw error;
  }
  return {
    texture: target.texture,
    target,
    bytes,
    rebake(): void {
      convertSky(renderer, target, sky);
    },
    // Only the GPU copy: a render target stays usable after `dispose`, and
    // three allocates it again the next time it is rendered into.
    release(): void {
      target.dispose();
    },
    dispose(): void {
      target.dispose();
    },
  };
}

/**
 * `target.fromEquirectangularTexture(renderer, sky)`, putting back what three
 * leaves behind when a face's render throws (A28 C2): the renderer's target,
 * face, level and XR flag (`holdRendererState`), and the sky's `minFilter`,
 * which the conversion lowers to `LinearFilter` for its duration.
 */
function convertSky(renderer: THREE.WebGLRenderer, target: THREE.WebGLCubeRenderTarget, sky: THREE.Texture): void {
  const restore = holdRendererState(renderer);
  const minFilter = sky.minFilter;
  try {
    target.fromEquirectangularTexture(renderer, sky);
  } catch (error) {
    sky.minFilter = minFilter;
    restore();
    throw error;
  }
}

/** How many painted Ultra skies the cache keeps (Fable I1): the title's, the ride's, one more. */
export const ULTRA_SKY_CACHE_ENTRIES = 3;

interface CachedSky {
  readonly key: string;
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/**
 * The painted Ultra skies, kept CPU-side (Fable I1). Painting the 2048×1024
 * sky is about 370 ms on the Air, and every world swap under Ultra repainted
 * it, because the cumulus seed is per plan: title → ride → title painted three
 * skies for two. `paintSky` is pure (invariant 12), so its pixels are a
 * function of `skyParamsFor(look, options)` — which carries every painted
 * field, the size and the cloud seed — and a repeated key returns a **fresh**
 * texture over the same pixel buffer: its own `Source`, so the GPU copy of a
 * disposed sky is never resurrected or shared, and nothing about how three
 * uploads it changes.
 *
 * Least recently used goes first; `ULTRA_SKY_CACHE_ENTRIES` buffers of 8 MiB
 * at most, and the renderer clears the cache when Ultra is no longer wanted.
 * The ordinary sky never passes through here (`createSky(look)` stays exactly
 * as it was).
 */
export class UltraSkyCache {
  private readonly entries: CachedSky[] = [];
  private readonly capacity: number;
  private misses = 0;
  private hits = 0;

  constructor(capacity: number = ULTRA_SKY_CACHE_ENTRIES) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  /** `createSky(look, options)`, painted once per key. */
  paint(look: ResolvedVenueLook, options: SkyOptions): SkyTexture {
    const key = JSON.stringify(skyParamsFor(look, options));
    const at = this.entries.findIndex((entry) => entry.key === key);
    if (at >= 0) {
      const [entry] = this.entries.splice(at, 1);
      this.entries.push(entry);
      this.hits += 1;
      return skyFromPixels(entry, options);
    }
    const sky = createSky(look, options);
    this.misses += 1;
    const image = sky.texture.image as { data: Uint8Array; width: number; height: number };
    this.entries.push({ key, pixels: image.data, width: image.width, height: image.height });
    while (this.entries.length > this.capacity) this.entries.shift();
    return sky;
  }

  /** Forget every painted sky (Ultra is no longer wanted). */
  clear(): void {
    this.entries.length = 0;
  }

  /** How many skies are held, and how many paints were saved — for the test and the report. */
  stats(): { readonly entries: number; readonly hits: number; readonly misses: number } {
    return { entries: this.entries.length, hits: this.hits, misses: this.misses };
  }
}

/**
 * A sky texture over cached pixels, field for field what `createSky` makes
 * (`ultraRuntime.test.ts` compares the two): the same format, mapping, colour
 * space, wrap, filters, mips and anisotropy.
 */
function skyFromPixels(entry: CachedSky, options: SkyOptions): SkyTexture {
  const texture = new THREE.DataTexture(entry.pixels, entry.width, entry.height, THREE.RGBAFormat);
  texture.name = 'sky';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = options.anisotropy ?? 1;
  texture.needsUpdate = true;
  return {
    texture,
    dispose(): void {
      texture.dispose();
    },
  };
}

/** Which capability the probe found missing, or null (activation step 1). */
export function missingCapability(
  caps: UltraCaps,
): Extract<UltraRefusal, { kind: 'capability' }>['missing'] | null {
  if (!caps.webgl2) return 'webgl2';
  if (!caps.halfFloatRenderable) return 'half-float-render';
  // The near map is the largest texture Ultra allocates.
  if (caps.maxTextureSize < ULTRA.near.mapSize) return 'max-texture-size';
  return null;
}

/**
 * The fifteen live values exactly as the table ships them — what the runtime
 * starts from until `Game.applyTuning` pushes the F4 panel's through
 * `setUltraTuning`. Read through W4's own `readUltraLive`, so the paths are
 * the registered ones; a path may be nested (`ULTRA.shade.lift`), so it is
 * walked field by field below `ULTRA`.
 */
export function shippedUltraLive(): UltraLiveTuning {
  return readUltraLive((path) => {
    let node: unknown = ULTRA;
    for (const key of path.split('.').slice(1)) {
      node = node !== null && typeof node === 'object' ? (node as Readonly<Record<string, unknown>>)[key] : undefined;
    }
    if (typeof node !== 'number') throw new Error(`${path} is not a live Ultra number`);
    return node;
  });
}

/**
 * `presentation().cost` while an Ultra rung is built: the ordinary shape, with
 * every figure that Ultra changes restated for what was actually built.
 *
 *   - `recipe`, `frame.solo`, the prop family and the level's colour/shadow
 *     split are W7's model (`UltraFrameCost` — the every-frame passes are the
 *     level's own, the solo frame carries the full reserve);
 *   - the prop colour and block colour triangles, which the Ultra model does
 *     not split out, are *measured* off the built view, as
 *     `TerrainView.blockTriangles` always has been;
 *   - `frame.split`/`quad` stay the ordinary rung's: Ultra never draws a split
 *     (a second view demotes first), so those are what a split *would* draw.
 *
 * A null cost (a judge that admitted without pricing) keeps the ordinary
 * figures under the Ultra id rather than inventing any.
 */
export interface BuiltPresentationCost extends Omit<PresentationCost, 'recipe'> {
  readonly recipe: BuildRecipeId;
}

export function ultraPresentationCost(
  ordinary: PresentationCost,
  recipe: UltraRecipe,
  cost: UltraFrameCost | null,
  built: { readonly propColourTriangles: number; readonly blockColourTriangles: number },
): BuiltPresentationCost {
  if (cost === null) return { ...ordinary, recipe: recipe.id };
  let drawCalls = 0;
  let colourTriangles = 0;
  let shadowTriangles = 0;
  for (const pass of cost.passes) {
    if (pass.when !== 'every-frame') continue;
    drawCalls += pass.drawCalls;
    if (pass.name === 'colour') colourTriangles += pass.triangles;
    else shadowTriangles += pass.triangles;
  }
  return {
    ...ordinary,
    recipe: recipe.id,
    drawCalls,
    triangles: colourTriangles + shadowTriangles,
    colourTriangles,
    shadowTriangles,
    propDrawCalls: cost.props.drawCalls,
    propTriangles: cost.props.triangles,
    propColourTriangles: built.propColourTriangles,
    blockColourTriangles: built.blockColourTriangles,
    frame: { ...ordinary.frame, solo: { ...cost.solo } },
  };
}

/**
 * Colour-pass triangles of the prop buckets under a built view, measured: each
 * `level-props-*` mesh's triangles times its instance count.
 */
export function measuredPropColourTriangles(root: THREE.Object3D): number {
  let total = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true || !mesh.name.startsWith('level-props-')) return;
    const geometry = mesh.geometry;
    const vertices = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    const instanced = mesh as THREE.InstancedMesh;
    total += (vertices / 3) * (instanced.isInstancedMesh === true ? instanced.count : 1);
  });
  return total;
}

/**
 * Whether three keys this material's program on `scene.environment` — the
 * classes `WebGLPrograms.getParameters` hands the scene environment to in
 * three 0.185.1 (`WebGLPrograms.js:60`). Only these compile a second,
 * environment-lit program when the Ultra fill hangs.
 */
export function picksUpEnvironment(material: THREE.Material): boolean {
  const flags = material as Partial<Record<
    'isMeshStandardMaterial' | 'isMeshLambertMaterial' | 'isMeshPhongMaterial',
    boolean
  >>;
  return flags.isMeshStandardMaterial === true
    || flags.isMeshLambertMaterial === true
    || flags.isMeshPhongMaterial === true;
}

/**
 * Release the programs the Ultra environment compiled for the materials that
 * outlive the tier (§3.6 step 7, "the programs count returns to its pre-Ultra
 * value") — found by the M39 integrator's first browser round trip, which
 * came back from Ultra with three programs more than it left with. The same
 * call runs the other way on a lit entry (activation step 4b, Fable N2): there
 * it releases the ordinary variants the ordinary light compiled, so a second
 * entry holds what a first one does (25 against 22 on the slice before it).
 *
 * **Why they stay.** three keeps every program a material has ever compiled
 * in that material's own cache until the material is disposed
 * (`WebGLRenderer.getProgram` / `releaseMaterialProgramReferences`). Ultra's
 * own materials go with the Ultra world, but the rider, the wheel, the cop
 * and every other Standard material that is not the world's picked up the
 * PMREM environment while it hung — a new program variant each (`USE_ENVMAP`,
 * cube-UV) — and switch back to their old variant when it is taken down,
 * still holding the Ultra one. Nothing leaks per cycle (the next round reuses
 * the held variant, so the count plateaus), but the ordinary session no longer
 * has the ordinary program set.
 *
 * **What this does.** `Material.dispose()` is only an event: three drops the
 * material's GPU-side state and its program references, and the material
 * itself stays whole and usable — the next frame re-acquires its program by
 * the same cache key, reusing one another material still holds or compiling
 * the identical source again. Textures, uniforms' values and the material's
 * id (which is what three's opaque sort reads) are untouched, so the frame is
 * byte-identical. `skip` is the installed world, whose own dispose frees its
 * materials. Returns how many materials were released.
 */
export function releaseEnvironmentPrograms(root: THREE.Object3D, skip: THREE.Object3D | null): number {
  const released = new Set<THREE.Material>();
  const visit = (node: THREE.Object3D): void => {
    if (node === skip) return;
    const material = (node as Partial<THREE.Mesh>).material;
    const materials = material === undefined ? [] : Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      if (released.has(entry) || !picksUpEnvironment(entry)) continue;
      released.add(entry);
      entry.dispose();
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return released.size;
}

/** Whether `node` sits under `ancestor` (a parent walk; no allocation). */
function isUnder(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let at: THREE.Object3D | null = node.parent;
  while (at !== null) {
    if (at === ancestor) return true;
    at = at.parent;
  }
  return false;
}

/** A failure at a named activation stage. */
class UltraStageError extends Error {
  readonly stage: UltraFaultStage;

  constructor(stage: UltraFaultStage, message: string) {
    super(message);
    this.name = 'UltraStageError';
    this.stage = stage;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const KIT_SWITCHES: readonly UltraKitSwitch[] = Object.freeze([
  'forms',
  'buildings',
  'facadeMaps',
  'ground',
  'edgeFill',
  'blocks',
  'lighting',
  'farShadow',
]);

function sameRecipe(a: UltraRecipe, b: UltraRecipe): boolean {
  if (a.id !== b.id || a.foliage !== b.foliage || a.walls !== b.walls) return false;
  return KIT_SWITCHES.every((name) => a.ultra[name] === b.ultra[name]);
}

function sameOverride(a: UltraKitOverride | null, b: UltraKitOverride | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return KIT_SWITCHES.every((name) => a[name] === b[name]);
}

/** The transient refusal while more than one view is drawn. */
function singleViewRefusal(views: number): UltraRefusal {
  return {
    kind: 'setup-failed',
    stage: 'build',
    message: `Ultra draws one view and the frame draws ${views}`,
  };
}

/** A sky texture's bytes: RGBA8, with the full mip chain when it has one. */
function skyBytes(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  const base = (image?.width ?? 0) * (image?.height ?? 0) * 4;
  return Math.round(texture.generateMipmaps ? (base * 4) / 3 : base);
}

interface Decision {
  readonly recipe: UltraRecipe | null;
  readonly cost: UltraFrameCost | null;
}

interface Timings {
  buildMs: number;
  skyMs: number;
  envMs: number;
  farMs: number;
  compileMs: number;
}

function zeroTimings(): Timings {
  return { buildMs: 0, skyMs: 0, envMs: 0, farMs: 0, compileMs: 0 };
}

export class UltraRuntime {
  private readonly host: UltraHost;

  // -- Intent -------------------------------------------------------------
  private wanted = false;
  private kitOverride: UltraKitOverride | null = null;
  /** `?ultrafault=`: fires only inside an activation, at its stage. */
  private plantedFault: UltraFaultPlant | null = null;
  /** A28 C1: an activation is reading the GL after each allocation stage (its stale drain to its end). */
  private glWatch = false;
  /** A28 C1: what the last activation's GL checks found, in order — kept, never discarded. */
  private glErrors: UltraGlError[] = [];
  /** Fable finding 7: the `stage:code` pairs this activation has already surfaced with a warning. */
  private glWarned = new Set<string>();
  private live: UltraLiveTuning;

  // -- The installed world ------------------------------------------------
  private plan: LevelPlan | null = null;
  private selection: PresentationSelection | null = null;
  private overrideId: PresentationRecipeId | undefined = undefined;
  /** `judgeUltra` is pure, so one answer per (plan, override) is enough. */
  private judgement: {
    readonly plan: LevelPlan;
    readonly override: UltraKitOverride | null;
    readonly verdict: UltraJudgement;
  } | null = null;

  // -- Refusals -----------------------------------------------------------
  /** `capability` or `setup-failed`: holds for the session. */
  private sticky: UltraRefusal | null = null;
  /** `envelope`: this world's; cleared when the next world is installed. */
  private worldRefusal: UltraRefusal | null = null;

  // -- What is built ------------------------------------------------------
  /** Anything Ultra-owned exists; `teardown`'s early-out. */
  private engaged = false;
  /** The frame hook and the pixel cap are on. */
  private activeFlag = false;
  private activating = false;
  /** The Ultra rung the installed world was built with, while it is active. */
  private built: { readonly recipe: UltraRecipe; readonly cost: UltraFrameCost | null } | null = null;
  /** Whether the *installed* terrain is an Ultra build. */
  private terrainIsUltra = false;
  private shared: UltraShared | null = null;
  /** The Ultra near rig while it is written on the sun; null while the ordinary one stands. */
  private rig: ShadowRig | null = null;
  /** The rig the frame hook hands `updateUltraShared` (the Ultra one, or the ordinary one under `-lighting`). */
  private frameRig: ShadowRig | null = null;
  private far: UltraFarShadow | null = null;
  private farBuiltAtMs = 0;
  /** Authored `receiveShadow` per rider mesh while Ultra holds them; null when not holding. */
  private riderFlags: WeakMap<THREE.Object3D, boolean> | null = null;
  /**
   * A15: authored `envMap` / `envMapIntensity` per held rider, wheel and cop
   * standard material, and the set of them the frame hook writes; null (and
   * empty) when not holding.
   */
  /**
   * A15 + round 3 item 3: per held rider, wheel and cop standard material, its
   * authored `envMap` / `envMapIntensity` and the authored compile hooks the
   * fixed-disk shadow patch (`ultraRiderShadow.ts`) wraps; null (and the set
   * empty) when not holding.
   */
  private riderEnv: WeakMap<THREE.MeshStandardMaterial, {
    envMap: THREE.Texture | null;
    envMapIntensity: number;
    shadow: HeldRiderShadow;
  }> | null = null;
  private readonly riderMaterials = new Set<THREE.MeshStandardMaterial>();
  /**
   * A28 (Trade 1): the uniforms the held rider, wheel and cop materials' light
   * in static shade reads — getters onto the current world's far map, so a
   * held material never keeps a swapped-out world's map (`ultraRiderShadow.ts`).
   */
  private readonly riderLight = riderLightUniforms(() => this.shared);
  /**
   * F-A1: whether the held rider programs are keyed for a far map (they
   * carry the light and its shadow sampler exactly then); null from a hold's
   * start until its first frame. The frame hook re-keys them when the far
   * map comes or goes (`rekeyRiderLight`).
   */
  private riderFarKeyed: boolean | null = null;
  private shaderHookInstalled = false;
  private shaderFailure: string | null = null;
  private demotions = 0;
  private timings: Timings = zeroTimings();
  private installs = 0;
  /** T0's budget, device pixels: `ULTRA.pixelBudget` until F4 moves it (Fable I4). */
  private pixelBudget: number = ULTRA.pixelBudget;
  /** A22: the near and far map edges this activation chose from the drawing buffer; null when not engaged. */
  private mapSizes: UltraShadowMapSizes | null = null;
  /** F3: the colour-only background cube of the Ultra sky that is hung, while it is. */
  private skyBackground: UltraSkyBackground | null = null;
  /**
   * Fable N2: whether the materials that outlive a world swap (rider, wheel,
   * cop, gates…) may hold ordinary, environment-free program variants — true
   * from boot and whenever the ordinary light may have drawn them (after any
   * teardown, or an Ultra rung built with `-lighting`); false once a lit
   * activation has released them. The mirror of teardown step 4b.
   */
  private ordinaryVariantsHeld = true;

  // -- Frame scratch --------------------------------------------------------
  private readonly pose = new THREE.Vector3();
  private readonly lastFinal = new THREE.Vector3();
  private hasFinal = false;
  private readonly forward = new THREE.Vector3();
  private readonly sunUnit = new THREE.Vector3();
  /**
   * A9: the packed contact occluders, and per-rig scratch — a contact with a
   * pelvis and one without, both preallocated, so the frame hook allocates
   * nothing of its own (Fable F7).
   */
  private readonly contactPacked = new Float32Array(ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_FLOATS);
  /** A28 (Trade 1): each slot's shade shape, `(x, z, radius, strength)`, preallocated. */
  private readonly contactShadePacked = new Float32Array(ULTRA_CONTACT_SLOTS * ULTRA_CONTACT_SHADE_FLOATS);
  private readonly contactRiders: {
    readonly withPelvis: { readonly wheel: THREE.Vector3; readonly pelvis: THREE.Vector3 };
    readonly wheelOnly: { readonly wheel: THREE.Vector3; readonly pelvis: null };
  }[] = ULTRA_CONTACT_RIGS.map(() => {
    const wheel = new THREE.Vector3();
    return { withPelvis: { wheel, pelvis: new THREE.Vector3() }, wheelOnly: { wheel, pelvis: null } };
  });
  private readonly contactList: RiderContact[] = [];
  private readonly downSun = { x: 0, z: 0 };
  /**
   * `updateUltraShared`'s per-frame argument, one object refilled every solo
   * frame (Fable F7's residual: it was a fresh literal each frame). The rig is
   * a placeholder until the first frame writes the real one.
   */
  private readonly frameInputs: { sun: THREE.DirectionalLight; rig: ShadowRig; far: UltraFarShadow | null };
  /**
   * Each contact child's inner rig (Fable F7: the cop's `cop-riding-rig`, found
   * once per child rather than by a `getObjectByName` walk every frame), and
   * each rig's pelvis, found once per rig object (a re-dressed rider is a new
   * rig). A cached rig that has left its child is looked up again.
   */
  private readonly rigOf = new WeakMap<THREE.Object3D, THREE.Object3D | null>();
  private readonly pelvisOf = new WeakMap<THREE.Object3D, THREE.Object3D | null>();

  constructor(host: UltraHost) {
    this.host = host;
    this.live = shippedUltraLive();
    this.frameInputs = { sun: host.sun, rig: shadowRigFor('ordinary', 'high'), far: null };
  }

  /**
   * The venue rig's Ultra hooks. Each one times itself for the report and is
   * where a planted `sky`/`environment` fault fires; the rig catches a throw
   * and falls back to the ordinary tier by itself, and the activation reads
   * its `failure` to name the stage.
   */
  readonly lightingHooks: VenueLightingHooks = {
    ultraSky: (look: ResolvedVenueLook): UltraSkyTexture => {
      this.plant('sky');
      const started = this.host.now();
      const sky = this.host.paintUltraSky(look, this.cloudSeed());
      const bake = this.host.bakeSkyBackground;
      // F3: the drawn background is the sky's own colour-only cube. A bake
      // that throws leaves nothing behind (the rig falls back on `sky`), and
      // neither does this stage's GL read after it (A28 C1, C2).
      let background: UltraSkyBackground | null = null;
      let skyMs = 0;
      try {
        if (bake !== undefined) background = bake.call(this.host, sky.texture);
        skyMs = this.host.now() - started;
        this.watchStage('sky', 'sky-background-cube', background?.target);
      } catch (error) {
        background?.dispose();
        sky.dispose();
        throw error;
      }
      this.timings.skyMs = skyMs;
      if (background === null) return sky;
      const hung = background;
      this.skyBackground = hung;
      return {
        texture: sky.texture,
        background: hung.texture,
        dispose: (): void => {
          if (this.skyBackground === hung) this.skyBackground = null;
          hung.dispose();
          sky.dispose();
        },
      };
    },
    // The plan's cumulus seed: the rig repaints when it moves on an unchanged
    // look (gauntlet round 1 item 4, "placement varied per plan").
    ultraSkyKey: (): number => this.cloudSeed(),
    ultraEnvironment: (look: ResolvedVenueLook): UltraEnvironment => {
      this.plant('environment');
      const started = this.host.now();
      const environment = this.host.buildEnvironment(look, this.live);
      this.timings.envMs = this.host.now() - started;
      try {
        this.watchStage('environment', 'environment', environment.target);
      } catch (error) {
        environment.dispose();
        throw error;
      }
      return environment;
    },
    ultraFill: (look: ResolvedVenueLook, tunedHemisphere: number | undefined) =>
      ultraFill(look, tunedHemisphere, this.live),
  };

  /** The installed plan's cumulus seed (`cumulusSeedFor(plan.id)`); 0 before any plan. */
  private cloudSeed(): number {
    return this.plan === null ? 0 : cumulusSeedFor(this.plan.id);
  }

  // ---------------------------------------------------------------------------
  // What the renderer asks
  // ---------------------------------------------------------------------------

  /** Whether the app asked for Ultra. */
  get requested(): boolean {
    return this.wanted;
  }

  /** Whether an Ultra rung is built and drawing. The renderer's per-frame question. */
  get active(): boolean {
    return this.activeFlag;
  }

  /** A shader failed while Ultra was active; `demote` at the top of the next frame. */
  get demotionPending(): boolean {
    return this.activeFlag && this.shaderFailure !== null;
  }

  /** The live Ultra values the fill, the rig and the materials read. */
  get liveTuning(): UltraLiveTuning {
    return this.live;
  }

  /**
   * T0's third `Math.min` term: the pixel budget while Ultra is active,
   * `Infinity` otherwise — so the ordinary expression is literally unchanged.
   */
  tierPixelCap(cssWidth: number, cssHeight: number): number {
    return this.activeFlag
      ? ultraPixelCap(this.pixelBudget, cssWidth, cssHeight)
      : Number.POSITIVE_INFINITY;
  }

  /** T0's budget as the runtime applies it (`ULTRA.pixelBudget`, or the F4 value). */
  get ultraPixelBudget(): number {
    return this.pixelBudget;
  }

  /**
   * The F4 `ULTRA.pixelBudget` knob (Fable I4). While Ultra draws, the buffer
   * follows at once (`resize`, which also re-chooses the map sizes when the
   * buffer crosses A22's line); otherwise it is simply what the next
   * activation uses. A non-positive or non-finite value is ignored.
   */
  setPixelBudget(pixels: number): void {
    if (!(Number.isFinite(pixels) && pixels > 0) || pixels === this.pixelBudget) return;
    this.pixelBudget = pixels;
    if (this.activeFlag) this.host.resize();
  }

  /**
   * The drawing buffer changed while Ultra draws (`GameRenderer.resize`, after
   * `setSize`). A22: when the new buffer leaves the maps' band — up at
   * 2,000,000 px, back down only below 1,800,000 px (Fable N1's hysteresis,
   * `ultraShadowMapSizesAfter`) — the near rig is re-written at the new edge
   * (three reallocates the map on the next shadow pass) and the far map is
   * rebuilt at its new edge, here, outside any frame — `resize` runs before
   * `beginFrame`. Any other resize changes nothing here, so a window dragged
   * to and fro across the line no longer reallocates 128 MiB at each
   * crossing. Never during an activation, which has already chosen from the
   * buffer it is about to draw.
   */
  onDrawingBuffer(width: number, height: number): void {
    if (!this.activeFlag || this.activating || this.mapSizes === null) return;
    if (!(width > 0 && height > 0)) return;
    const next = ultraShadowMapSizesAfter(this.mapSizes, width, height);
    const current = this.mapSizes;
    if (next.near === current.near && next.far === current.far) return;
    this.mapSizes = next;
    if (this.rig !== null && next.near !== current.near) {
      const rig = this.ultraRig();
      this.rig = rig;
      this.frameRig = rig;
      writeShadowRig(this.host.sun, rig);
    }
    const far = this.far;
    if (far !== null && far.mapSize !== next.far) {
      try {
        far.dispose();
        this.far = null;
        const rebuilt = new UltraFarShadow(next.far);
        this.far = rebuilt;
        this.buildFar(rebuilt);
      } catch (error) {
        this.fail('far-shadow', error);
      }
    }
  }

  /** The Ultra rung and its model while it is drawing, for `presentation()`. */
  builtUltra(): { readonly recipe: UltraRecipe; readonly cost: UltraFrameCost | null } | null {
    return this.activeFlag ? this.built : null;
  }

  /**
   * Why a requested Ultra is not drawing — null while it is, or while it was
   * never asked for (a sticky refusal is reported either way: it is a fact
   * about the session, and it is what the next request will meet).
   */
  get refusal(): UltraRefusal | null {
    if (this.activeFlag) return null;
    if (this.sticky !== null) return this.sticky;
    if (!this.wanted) return null;
    if (this.overrideId !== undefined) return { kind: 'presentation-override', recipe: this.overrideId };
    if (this.worldRefusal !== null) return this.worldRefusal;
    const views = this.host.viewCount();
    if (views > 1) return singleViewRefusal(views);
    return null;
  }

  // ---------------------------------------------------------------------------
  // What the app says
  // ---------------------------------------------------------------------------

  /** Record the intent and any `?ultrakit=` override; acted on at the next world or reconcile. */
  setWanted(wanted: boolean, override: UltraKitOverride | null): void {
    this.wanted = wanted;
    if (!sameOverride(override, this.kitOverride)) {
      this.kitOverride = override;
      this.judgement = null;
    }
  }

  /**
   * Plant (or clear) an activation failure at a stage, or a genuine GL error
   * at one (A28 C1's `gl-*` plants) — `?ultrafault=`.
   */
  setFault(plant: UltraFaultPlant | null): void {
    this.plantedFault = plant;
  }

  /**
   * The fifteen live values from the F4 panel. Absolute writes through W4's
   * functions: the shared uniforms (the response values and, since the final
   * touch, the static-shade lift's `shadeLift` / `shadeLiftFar`); the near
   * rig's three live values; the fill (κ) and — only when β moved — a PMREM
   * rebuild.
   */
  setLive(values: UltraLiveTuning): void {
    const previous = this.live;
    this.live = values;
    if (this.shared !== null) tuneUltraShared(this.shared, values);
    if (this.rig !== null) {
      const rig = this.ultraRig();
      this.rig = rig;
      this.frameRig = rig;
      writeShadowRig(this.host.sun, rig);
    }
    const lighting = this.host.lighting();
    if (lighting.tier !== 'ultra') return;
    lighting.refreshUltra(values.bounceLift !== previous.bounceLift);
    if (lighting.tier !== 'ultra') this.failFromLighting(lighting);
  }

  /**
   * `setQuality` has just written the ordinary rig and pixel ceiling. While an
   * Ultra rig stands, write it back over the ordinary one (the Ultra tier is
   * always drawn over High, so this only happens between a tier change's two
   * calls, and nothing renders between them).
   */
  onOrdinaryQuality(): void {
    if (!this.activeFlag) return;
    if (this.rig !== null) {
      const rig = this.ultraRig();
      this.rig = rig;
      this.frameRig = rig;
      writeShadowRig(this.host.sun, rig);
    } else {
      this.frameRig = shadowRigFor('ordinary', this.host.ordinaryQuality());
    }
  }

  // ---------------------------------------------------------------------------
  // Worlds
  // ---------------------------------------------------------------------------

  /**
   * Hang a new world's light and build its terrain, at whichever tier it gets
   * — `GameRenderer.setLevel`'s steps 2–6 (§6.3 W5). The caller has already
   * disposed the outgoing terrain and chosen the ordinary selection.
   *
   * The tier is decided **before** the light is hung, so a look change paints
   * its sky and environment once, at the tier it will be drawn at: entering or
   * staying on Ultra hangs the Ultra light for the new look directly, and
   * leaving Ultra for this world tears down first and hangs the ordinary one.
   */
  installWorld(
    plan: LevelPlan,
    selection: PresentationSelection,
    overrideId: PresentationRecipeId | undefined,
  ): TerrainView {
    this.plan = plan;
    this.selection = selection;
    this.overrideId = overrideId;
    // World-scoped: the envelope verdict is this plan's, and the outgoing
    // terrain is already gone.
    this.worldRefusal = null;
    this.terrainIsUltra = false;
    const lighting = this.host.lighting();
    const decision = this.decide();

    if (decision.recipe === null) {
      this.teardown('world');
      lighting.apply(plan.look, 'ordinary');
      return this.install(plan, selection.recipe, null);
    }

    // Staying on (or entering) Ultra: only this world's pieces go. The tier's
    // light, rig and rider flags carry over and are converged by `activate`.
    this.retireWorld();
    this.timings = zeroTimings();
    this.engaged = true;
    this.activating = true;
    // A28 C1: the activation's one stale drain, before its first allocation
    // (the sky and environment the light paints next); `activate` carries
    // the same watch on rather than draining again.
    this.beginGlWatch();
    const tier: LightingTier = decision.recipe.ultra.lighting ? 'ultra' : 'ordinary';
    lighting.apply(plan.look, tier);
    this.activating = false;
    // A sky or environment that could not be built has already fallen back to
    // the ordinary light; fail on its stage rather than try it a second time.
    if (lighting.tier !== tier) {
      this.glWatch = false;
      this.failFromLighting(lighting);
    } else this.activate(decision.recipe, decision.cost, true);
    return this.host.installedTerrain() ?? this.install(plan, selection.recipe, null);
  }

  /**
   * Bring the built world in line with the intent (§6.3 W5): rebuilds only when
   * the built recipe differs from what the intent now resolves to, and touches
   * the terrain and the tier's own resources — never gates, targets, ghost or
   * cop, and never the plan.
   */
  reconcile(): UltraTierResult {
    const installsBefore = this.installs;
    if (this.plan === null || this.selection === null) return this.result(installsBefore);
    const decision = this.decide();
    if (decision.recipe === null) {
      this.teardown('exit');
      return this.result(installsBefore);
    }
    const built = this.built;
    if (this.activeFlag && built !== null && sameRecipe(built.recipe, decision.recipe)) {
      return this.result(installsBefore);
    }
    this.retireWorld();
    this.timings = zeroTimings();
    this.activate(decision.recipe, decision.cost);
    // Fable F1: whatever failed, the ordinary world is standing — a builder
    // that threw after the old view was disposed has already been answered by
    // the teardown's step 5; this is the backstop for any path that was not.
    this.ensureWorld();
    return this.result(installsBefore);
  }

  /**
   * Never leave the scene without a world (Fable F1): with a plan installed
   * and nothing built, build the ordinary selection. `GameRenderer.
   * currentTerrain()` throws on an empty scene and `Game.render` reads it every
   * frame, so an empty scene is a frame loop that throws until the next world.
   */
  private ensureWorld(): void {
    const plan = this.plan;
    const selection = this.selection;
    if (plan === null || selection === null || this.host.installedTerrain() !== null) return;
    this.terrainIsUltra = false;
    this.install(plan, selection.recipe, null);
  }

  // ---------------------------------------------------------------------------
  // Frames
  // ---------------------------------------------------------------------------

  /**
   * The solo frame's Ultra hook, after the viewport lines of
   * `GameRenderer.renderView` (§6.3 W5): finalise the near cascade from the
   * focus the game set this frame, then hand the shared uniforms this frame's
   * rig and far map.
   *
   * **The pose is the focus the game set, not the finalised target.**
   * `Game.render` re-points the cascade (`setShadowFocus`) before every pass,
   * so the target normally holds this frame's rider. A caller that renders
   * again without re-pointing it — `GameRenderer.render()` in the specs — leaves
   * last frame's *finalised* target there; finalising that again would push
   * the cascade another forward share ahead every frame. So a target still
   * equal to the last finalised one means "nobody moved it" and the last pose
   * is reused.
   *
   * Nothing here allocates (Fable F7): the pose, forward and sun vectors,
   * `updateUltraShared`'s argument, the contact scratch and the rig lookups
   * are all preallocated or cached, and every loop is indexed.
   */
  beforeSoloRender(camera: THREE.Camera): void {
    const shared = this.shared;
    if (shared === null) return;
    const sun = this.host.sun;
    const rig = this.rig;
    if (rig !== null) {
      const target = sun.target.position;
      if (!this.hasFinal || !target.equals(this.lastFinal)) this.pose.copy(target);
      camera.getWorldDirection(this.forward);
      this.sunUnit.copy(this.host.lighting().sunOffset).normalize();
      finaliseShadowFocus(sun, this.pose, this.forward, this.sunUnit, rig);
      this.lastFinal.copy(sun.target.position);
      this.hasFinal = true;
    }
    const frameRig = this.frameRig;
    if (frameRig !== null) {
      // Filled in place, never a literal per frame (Fable F7's residual), and
      // emptied again so it holds no world's far map between frames.
      const inputs = this.frameInputs;
      inputs.sun = sun;
      inputs.rig = frameRig;
      inputs.far = this.far;
      updateUltraShared(shared, inputs);
      inputs.far = null;
    }
    this.feedContacts(shared);
    if (this.riderEnv !== null) {
      // F-A1: after the far map is handed over and before anything draws —
      // a held program with the light's shadow sampler never meets a null map.
      this.riderFarKeyed = rekeyRiderLight(this.riderMaterials, this.riderLight, this.riderFarKeyed);
      this.syncRiderEnvironment();
    }
  }

  /**
   * The dynamic contact occluders (A9), every solo frame: each visible
   * contact rig's wheel and pelvis, in world space as this frame posed them,
   * turned into `(x, z, radius, strength)` slots by `riderContactOccluders`
   * and written into the shared `ultraContactPoints` / `ultraContactCount`,
   * which only the ground patch reads. Zero passes, zero bytes. The runtime's
   * side allocates nothing per frame (Fable F7): the rigs and pelvises are
   * cached per object, the contacts and the down-sun direction are
   * preallocated scratch, and the loops are indexed.
   */
  private feedContacts(shared: UltraShared): void {
    const points = shared.uniforms.ultraContactPoints as THREE.IUniform<THREE.Vector4[]> | undefined;
    const count = shared.uniforms.ultraContactCount as THREE.IUniform<number> | undefined;
    if (points === undefined || count === undefined) return;
    const plan = this.plan;
    const list = this.contactList;
    list.length = 0;
    if (plan !== null) {
      const children = this.host.scene.children;
      for (let which = 0; which < ULTRA_CONTACT_RIGS.length; which += 1) {
        const spec = ULTRA_CONTACT_RIGS[which];
        let child: THREE.Object3D | null = null;
        for (let index = 0; index < children.length; index += 1) {
          const candidate = children[index];
          if (candidate.name === spec.child && candidate.visible) {
            child = candidate;
            break;
          }
        }
        if (child === null) continue;
        const rig = spec.rig === null ? child : this.innerRig(child, spec.rig);
        if (rig === null || !rig.visible) continue;
        let pelvis = this.pelvisOf.get(rig);
        if (pelvis === undefined) {
          pelvis = rig.getObjectByName(spec.pelvis) ?? null;
          this.pelvisOf.set(rig, pelvis);
        }
        const scratch = this.contactRiders[which];
        rig.getWorldPosition(scratch.withPelvis.wheel);
        if (pelvis !== null) {
          pelvis.getWorldPosition(scratch.withPelvis.pelvis);
          list.push(scratch.withPelvis);
        } else {
          list.push(scratch.wheelOnly);
        }
      }
    }
    // A15: the body pool lies along the sun's ground azimuth (null → round).
    const offset = this.host.lighting().sunOffset;
    const downSun = downSunOf(offset, this.downSun);
    // A28 (Trade 1): and each slot's compact shape for static shade, when the world declares it.
    const shadeUniform = shared.uniforms.ultraContactShade as THREE.IUniform<THREE.Vector4[]> | undefined;
    const shadePacked = shadeUniform === undefined ? null : this.contactShadePacked;
    const written = plan === null ? 0 : riderContactOccluders(plan, list, this.contactPacked, downSun, shadePacked);
    const packed = this.contactPacked;
    let slots = Math.min(written, Math.floor(points.value.length / ULTRA_CONTACT_VEC4_PER_SLOT));
    if (shadeUniform !== undefined) slots = Math.min(slots, shadeUniform.value.length);
    for (let slot = 0; slot < slots; slot += 1) {
      const at = slot * ULTRA_CONTACT_FLOATS;
      points.value[slot * 2].set(packed[at], packed[at + 1], packed[at + 2], packed[at + 3]);
      points.value[slot * 2 + 1].set(packed[at + 4], packed[at + 5], packed[at + 6], packed[at + 7]);
      if (shadeUniform !== undefined) {
        const s = slot * ULTRA_CONTACT_SHADE_FLOATS;
        shadeUniform.value[slot].set(this.contactShadePacked[s], this.contactShadePacked[s + 1], this.contactShadePacked[s + 2], this.contactShadePacked[s + 3]);
      }
    }
    count.value = slots;
  }

  /**
   * A contact child's named inner rig (the cop's `cop-riding-rig`), found by a
   * graph walk once per child and cached (Fable F7). A cached rig that no
   * longer sits under its child — the child re-dressed — is looked up again.
   */
  private innerRig(child: THREE.Object3D, name: string): THREE.Object3D | null {
    const cached = this.rigOf.get(child);
    if (cached !== undefined) {
      if (cached !== null && isUnder(cached, child)) return cached;
      // "No such rig" is asked again only once the child's children change.
      if (cached === null && this.rigChildCount.get(child) === child.children.length) return null;
    }
    const found = child.getObjectByName(name) ?? null;
    this.rigOf.set(child, found);
    this.rigChildCount.set(child, child.children.length);
    return found;
  }

  /** The child count a "no such rig" answer was given at. */
  private readonly rigChildCount = new WeakMap<THREE.Object3D, number>();

  // -- Rider environment response (A15; Wave 4, R-G) -------------------------

  /**
   * Point every held rider, wheel and cop material at this frame's Ultra
   * environment with its own intensity, `environmentIntensity ×
   * ULTRA.rider.envResponse` — every solo frame, so a κ push, a look change or
   * a re-dressed rig is followed without a hand-off. three uses a material's
   * own `envMapIntensity` only while its `envMap` is set (it overwrites it
   * with `scene.environmentIntensity` when the map comes from the scene), and
   * `envMap || scene.environment` is the same PMREM either way, so the
   * program is the one the material already had. With no environment hung,
   * the authored values stand. Nothing allocates.
   */
  private syncRiderEnvironment(): void {
    const scene = this.host.scene;
    this.envTexture = scene.environment;
    this.envIntensity = scene.environmentIntensity * ULTRA.rider.envResponse;
    this.riderMaterials.forEach(this.syncRiderMaterial);
  }

  private envTexture: THREE.Texture | null = null;
  private envIntensity = 1;

  private readonly syncRiderMaterial = (material: THREE.MeshStandardMaterial): void => {
    const authored = this.riderEnv?.get(material);
    if (authored === undefined) return;
    if (this.envTexture === null) {
      material.envMap = authored.envMap;
      material.envMapIntensity = authored.envMapIntensity;
      return;
    }
    if (material.envMap !== this.envTexture) material.envMap = this.envTexture;
    material.envMapIntensity = this.envIntensity;
  };

  /** Demote after a shader error, at the top of the next frame. */
  demote(): void {
    if (!this.demotionPending) return;
    this.fail('shader', this.shaderFailure ?? 'a shader failed while Ultra was active');
  }

  /**
   * `setViewCount(n > 1)` while active: the app should have left Ultra first
   * (`openCouch`'s first line), so this is the backstop — tear down, count it,
   * say so once, never throw. Not sticky: the intent stands, and a later
   * reconcile at one view may build Ultra again.
   */
  safetyDemote(views: number): void {
    if (!this.activeFlag) return;
    this.demotions += 1;
    console.error(
      `Ultra: safety demotion — the frame was asked for ${views} views while Ultra was active. `
        + 'Ultra draws one view, so this frame is High; the app leaves Ultra before a split.',
    );
    this.teardown('exit');
  }

  /**
   * The context was lost (A28, FE): release every Ultra resource that held
   * rendered content — the sky's background cube, the PMREM environment and
   * the far map — now, while the context is lost, so `onContextRestored`
   * only builds.
   *
   * **Why at the loss.** three 0.185.1's context restore replaces its whole
   * bookkeeping (`initGLContext`), but every object it set up before the loss
   * keeps a `dispose` listener bound to the old bookkeeping, which deletes
   * the old WebGL objects. After the restore those objects belong to a dead
   * context generation, so each delete is rejected with `INVALID_OPERATION`
   * ("object does not belong to this context"). Releasing them here instead
   * runs the same listener while the context is lost, when WebGL makes every
   * delete a silent no-op. The listener then removes itself, so a later
   * dispose of the rebuilt objects deletes only live ones. Until this, the
   * restore raised one `INVALID_OPERATION` on every Ultra world, from five
   * rejected deletes: the environment's target (framebuffer and texture) in
   * `lighting.refreshUltra(true)`, and the far map's depth texture,
   * framebuffer and colour texture. It changed no pixel: a rejected delete
   * frees nothing and binds nothing.
   *
   * Nothing is drawn while the context is lost (three's `render` returns at
   * once), so nothing can sample the released targets in the meantime. The
   * ledger is not a GPU measurement until the restore rebuilds them.
   */
  onContextLost(): void {
    if (!this.activeFlag) return;
    this.skyBackground?.release();
    const lighting = this.host.lighting();
    if (lighting.tier === 'ultra') lighting.releaseUltraEnvironment();
    this.far?.dispose();
    // A28 follow-up (CL): the empty far map is one per module and on no
    // scene, so the renderer's walk (`releaseLostContext`) reaches it only
    // while a material happens to be bound to it; it is released here on the
    // same terms, and three uploads it again the next time it is bound.
    releaseEmptyFarShadowMap();
  }

  /**
   * The context came back (three has already re-initialised): every GPU-side
   * Ultra resource that held rendered content is rebuilt — the sky's
   * background cube, the PMREM environment and the far map — before the game
   * hears about it. Everything else re-uploads from CPU data by itself.
   *
   * A28, FE: `onContextLost` released all three, so nothing here deletes a
   * pre-loss WebGL object: the environment's rebuild has none to drop, and
   * the far map's `dispose` finds nothing to free. The restore event raises
   * no GL error (`tests/m39-ultra.spec.ts` journey 15).
   */
  onContextRestored(): void {
    if (!this.activeFlag) return;
    let stage: UltraFaultStage = 'sky';
    try {
      // F3: the background cube's faces were rendered content; the sky
      // itself re-uploads from its CPU pixels on the way.
      this.skyBackground?.rebake();
      stage = 'environment';
      const lighting = this.host.lighting();
      if (lighting.tier === 'ultra') {
        lighting.refreshUltra(true);
        if (lighting.tier !== 'ultra') {
          this.failFromLighting(lighting);
          return;
        }
      }
      const far = this.far;
      if (far !== null) {
        stage = 'far-shadow';
        far.dispose();
        this.buildFar(far);
      }
    } catch (error) {
      this.fail(stage, error);
    }
  }

  // ---------------------------------------------------------------------------
  // The report
  // ---------------------------------------------------------------------------

  /**
   * `renderer.ultraReport()`. The renderer supplies what only it can read (the
   * live sky, the drawing buffer, the program count); the runtime adds the
   * Ultra facts. Bytes are the **ledger**: the Ultra-owned resources that exist
   * right now — 0 whenever Ultra is not engaged.
   */
  report(frame: {
    readonly sky: UltraReport['sky'];
    readonly drawingBuffer: UltraReport['drawingBuffer'];
    readonly programs: number;
  }): UltraReport {
    const built = this.builtUltra();
    const lighting = this.host.lighting();
    const environment = lighting.environment;
    const far = this.far;
    const steady = this.steadyBytes();
    return {
      requested: this.wanted,
      active: this.activeFlag,
      recipe: this.installedRecipe(),
      kit: built?.recipe.ultra ?? null,
      refusal: this.refusal,
      cost: built?.cost ?? null,
      // The model at this buffer, with the map edges this activation actually
      // holds (N1: inside the band they can be the full ones a little under
      // the 2 MP line, where the fresh rule alone would price the small ones).
      targets: built === null
        ? []
        : ultraTargetBytes(
          built.recipe,
          { width: frame.drawingBuffer.width, height: frame.drawingBuffer.height },
          this.mapSizes ?? undefined,
        ),
      bytes: {
        steady,
        // The steady set plus the two allocations that overlap it during a
        // switch, as the model's `peakSwitch` counts them (Fable N5): the
        // PMREM ping-pong target (the size of the cube-UV target, so its
        // bytes) and the half-float equirect source it filters. The outgoing
        // near map is disposed before the new one, and one world is built at
        // a time.
        peakSwitch: this.activeFlag
          ? steady + (environment === null ? 0 : environment.bytes + ultraEnvironmentSourceBytes())
          : 0,
      },
      shadow: this.rig === null ? null : { ...this.rig, mapSizeReadBack: this.nearReadBack() },
      farShadow: far === null || far.texture === null
        ? null
        : { mapSize: far.mapSize, texelMetres: far.texelMetres, builtAtMs: this.farBuiltAtMs },
      environment: environment === null
        ? null
        : {
          cubeSize: environment.cubeSize,
          bytes: environment.bytes,
          intensity: this.host.scene.environmentIntensity,
          kappa: this.live.envKappa,
          bounceLift: this.live.bounceLift,
        },
      sky: frame.sky,
      drawingBuffer: frame.drawingBuffer,
      programs: frame.programs,
      timings: { ...this.timings },
      safetyDemotions: this.demotions,
      // A28 C1: kept past the activation — a refusal's evidence outlives it.
      glErrors: [...this.glErrors],
    };
  }

  // ---------------------------------------------------------------------------
  // Teardown — the one exit (§3.6)
  // ---------------------------------------------------------------------------

  /**
   * Return every Ultra-owned piece to the ordinary state, in §3.6's order.
   * Idempotent, and tolerant of a partial activation: each step undoes only
   * what its own state says exists, so a failure at any stage leaves nothing
   * behind. Nothing here is a snapshot restore — the light and the rig are
   * re-written by the ordinary writers (§3.1).
   */
  teardown(mode: TeardownMode = 'exit'): void {
    if (!this.engaged) return;
    const host = this.host;
    this.activeFlag = false;
    this.activating = false;
    this.glWatch = false;

    // 1. The light: the rig's tier back to ordinary — hemisphere, environment
    //    off and disposed, the 1024 sky repainted, `applyTuned` last.
    if (mode === 'exit') host.lighting().setTier('ordinary');

    // 2. The shadow rig, written by W4's writer from the ordinary rule, and
    //    the cascade handed back through the ordinary `setShadowFocus` on the
    //    last pose (or, when no Ultra frame was drawn, on the target, which
    //    nothing has finalised) — so the light sits exactly where the
    //    ordinary path puts it, to the bit, rather than rescaled twice.
    if (this.rig !== null) {
      this.rig = null;
      writeShadowRig(host.sun, shadowRigFor('ordinary', host.ordinaryQuality()));
      const pose = this.hasFinal ? this.pose : host.sun.target.position;
      host.setShadowFocus(pose.x, pose.y, pose.z);
    }
    this.frameRig = null;
    this.hasFinal = false;

    // 3. The rider flags, from the authored booleans; the listeners removed.
    this.releaseRiders();

    // 4. The far map (and, F-A3, the empty one bound when there was none).
    this.far?.dispose();
    this.far = null;
    releaseEmptyFarShadowMap();
    this.farBuiltAtMs = 0;

    // 4b. The programs the environment compiled for everything that is not
    //     the world (step 7's program count): released before the world is
    //     swapped, so the ordinary world's fresh materials are never touched.
    //     Not on `dispose` — the renderer frees every program itself.
    if (mode !== 'dispose') releaseEnvironmentPrograms(host.scene, host.installedTerrain()?.group ?? null);
    //     From here the ordinary light draws them, so the next lit entry
    //     releases their ordinary variants in turn (activation step 4b, N2).
    this.ordinaryVariantsHeld = true;

    // 5. The world: the Ultra view goes first (inside `installTerrain`), then
    //    the ordinary selection is rebuilt. Gates, targets, ghost, cop and
    //    particles are not this function's. Fable F1: an Ultra build that
    //    threw *after* `installTerrain` disposed the old view leaves nothing
    //    installed and `terrainIsUltra` false — an exit rebuilds the ordinary
    //    world then too, so a failed activation never leaves the scene empty.
    //    A `world` teardown leaves an empty scene alone: its caller is about
    //    to install the next world. If the ordinary build itself throws, the
    //    rest of the teardown still runs and the error is rethrown after it.
    let rebuildError: unknown = null;
    const plan = this.plan;
    const selection = this.selection;
    const rebuild = mode === 'exit'
      && plan !== null
      && selection !== null
      && (this.terrainIsUltra || host.installedTerrain() === null);
    this.terrainIsUltra = false;
    if (rebuild) {
      try {
        this.install(plan, selection.recipe, null);
      } catch (error) {
        rebuildError = error;
      }
    }
    this.built = null;
    this.shared = null;
    this.mapSizes = null;

    // 6. Pixels: the cap is off with `activeFlag`, then the buffer follows.
    host.resize();

    // 7. Diagnostics: the hook removed, the ledger at zero.
    if (this.shaderHookInstalled) {
      host.setShaderErrorHook(null);
      this.shaderHookInstalled = false;
    }
    this.shaderFailure = null;
    this.engaged = false;
    if (rebuildError !== null) throw rebuildError;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * What the intent resolves to for the installed plan: an Ultra rung, or a
   * refusal recorded at its scope.
   */
  private decide(): Decision {
    const none: Decision = { recipe: null, cost: null };
    const plan = this.plan;
    if (!this.wanted || plan === null) return none;
    if (this.sticky !== null) return none;
    if (this.overrideId !== undefined) return none;
    if (this.host.viewCount() > 1) return none;

    const caps = this.host.probeCaps();
    const missing = missingCapability(caps);
    if (missing !== null) {
      this.sticky = { kind: 'capability', missing };
      return none;
    }

    let verdict: UltraJudgement;
    try {
      verdict = this.judge(plan, caps);
    } catch (error) {
      this.sticky = {
        kind: 'setup-failed',
        stage: 'build',
        message: `judging the Ultra envelope threw: ${messageOf(error)}`,
      };
      return none;
    }
    if (verdict.recipe === null) {
      const refusal: UltraRefusal = verdict.refusal ?? {
        kind: 'setup-failed',
        stage: 'build',
        message: 'the Ultra envelope admitted no rung and named no reason',
      };
      if (refusal.kind === 'envelope') this.worldRefusal = refusal;
      else if (refusal.kind !== 'presentation-override') this.sticky = refusal;
      return none;
    }
    this.worldRefusal = null;
    return { recipe: verdict.recipe, cost: verdict.cost };
  }

  private judge(plan: LevelPlan, caps: UltraCaps): UltraJudgement {
    const cached = this.judgement;
    if (cached !== null && cached.plan === plan && sameOverride(cached.override, this.kitOverride)) {
      return cached.verdict;
    }
    const verdict = this.host.judge(plan, caps, this.kitOverride);
    this.judgement = { plan, override: this.kitOverride, verdict };
    return verdict;
  }

  /**
   * The activation sequence (§6.3 W5), converging every tier-scoped piece on
   * `recipe`'s kit. Returns whether it succeeded; a failure at any stage has
   * already torn everything down, recorded a sticky refusal and rebuilt the
   * ordinary world.
   */
  private activate(recipe: UltraRecipe, cost: UltraFrameCost | null, drained = false): boolean {
    const host = this.host;
    const plan = this.plan;
    const selection = this.selection;
    if (plan === null || selection === null) return false;
    this.engaged = true;
    this.activating = true;
    const lit = recipe.ultra.lighting;
    let stage: UltraFaultStage = 'environment';
    try {
      // A28 C1: the stale drain, once, before the first allocation — unless
      // `installWorld` drained already (`drained`), before the light it hung
      // for this activation. From here each allocation stage's GL errors are
      // read and kept, and any that refuse fail the activation on `gl-error`.
      if (!drained) this.beginGlWatch();

      // 5–6. Environment and sky: hung by `installWorld` already on a world
      //      change (this is then a no-op), hung here on a tier change. The
      //      rig falls back by itself and says which piece failed.
      const lighting = host.lighting();
      const tier: LightingTier = lit ? 'ultra' : 'ordinary';
      lighting.setTier(tier);
      if (lighting.tier !== tier) throw this.lightingError(lighting);
      this.refuseOnGl();

      // 3. The world, with the build context every Ultra builder reads. A
      //    planted `build` fault fires inside the install, after the old view
      //    is disposed — where a real builder exception lands (Fable F1).
      stage = 'build';
      const shared = createUltraShared();
      tuneUltraShared(shared, this.live);
      this.shared = shared;
      const started = host.now();
      this.install(plan, recipe, { recipe, shared, maxAnisotropy: host.maxAnisotropy() }, this.plantBuild);
      this.terrainIsUltra = true;
      this.timings.buildMs = host.now() - started;

      // A22 (Fable F5): both shadow maps sized from the buffer this frame
      // will draw to, before the rig and the far map are made from them.
      this.mapSizes = this.chooseMapSizes();

      // 4. The rider and wheel receive (§3.2) — or, under `-lighting`, keep
      //    exactly their authored flags.
      if (lit) this.holdRiders();
      else this.releaseRiders();

      // 4b. Fable N2, the mirror of teardown step 4b: entering the lit tier,
      //     release the ordinary (hemisphere-lit) programs every material
      //     outside the new world compiled while the ordinary light hung, so
      //     an entry after an exit holds exactly the programs a first entry
      //     does (three keeps a material's every variant until it is
      //     disposed). The first Ultra frame below re-acquires each one's
      //     environment-lit variant. Only on entry: between two lit Ultra
      //     worlds they hold nothing ordinary, and releasing them would only
      //     recompile what they already hold. Under `-lighting` they keep
      //     drawing ordinary variants, so nothing is released.
      if (lit && this.ordinaryVariantsHeld) {
        releaseEnvironmentPrograms(host.scene, host.installedTerrain()?.group ?? null);
        this.ordinaryVariantsHeld = false;
      } else if (!lit) {
        this.ordinaryVariantsHeld = true;
      }

      // 7. The near rig, from W4's rule plus the three live near values.
      stage = 'shadow';
      this.plant('shadow');
      if (lit) {
        const rig = this.ultraRig();
        this.rig = rig;
        this.frameRig = rig;
        writeShadowRig(host.sun, rig);
      } else {
        if (this.rig !== null) {
          this.rig = null;
          writeShadowRig(host.sun, shadowRigFor('ordinary', host.ordinaryQuality()));
          const pose = this.hasFinal ? this.pose : host.sun.target.position;
          host.setShadowFocus(pose.x, pose.y, pose.z);
          this.hasFinal = false;
        }
        this.frameRig = shadowRigFor('ordinary', host.ordinaryQuality());
      }

      // 8. The far map, once for this world, outside any frame.
      if (recipe.ultra.farShadow) {
        stage = 'far-shadow';
        this.plant('far-shadow');
        const far = new UltraFarShadow(this.mapSizes.far);
        this.far = far;
        this.buildFar(far);
        this.watchStage('far-shadow', 'far-shadow-map', far.renderTarget);
        this.refuseOnGl();
      }

      // 9. The first frame, at the Ultra pixel ratio: every Ultra program
      //    compiles and the near map allocates here, so an out-of-memory or a
      //    shader that will not link is found now rather than mid-ride.
      stage = 'shader';
      this.shaderFailure = null;
      host.setShaderErrorHook(this.onShaderError);
      this.shaderHookInstalled = true;
      this.built = { recipe, cost };
      this.activeFlag = true;
      host.resize();
      const drawn = host.now();
      const code = host.drawFirstFrame();
      this.timings.compileMs = host.now() - drawn;
      if (this.faultAt('shader') && this.shaderFailure === null) {
        this.shaderFailure = 'planted by ?ultrafault=shader';
      }
      if (this.shaderFailure !== null) throw new UltraStageError('shader', this.shaderFailure);
      // A28 C1: the frame's own code, everything else pending since the last
      // stage's read, and the near map's framebuffer (an Ultra target only
      // while the Ultra rig stands).
      this.watchStage('first-frame', 'near-shadow-map', this.rig === null ? null : host.sun.shadow.map, code);
      if (this.faultAt('gl-error')) this.keepGl(glFinding('first-frame', GL_OUT_OF_MEMORY, null));
      this.refuseOnGl();

      // 10. The ledger is read on demand (`report`): the steady set, and the
      //     switch peak as the steady set plus the PMREM ping-pong target.
      this.activating = false;
      this.glWatch = false;
      return true;
    } catch (error) {
      this.activating = false;
      this.glWatch = false;
      this.fail(error instanceof UltraStageError ? error.stage : stage, error);
      return false;
    }
  }

  /**
   * World-scoped teardown between two Ultra worlds (or two Ultra rungs): the
   * frame hook off and this world's far map gone; the tier's light, rig and
   * rider flags stay, so the next activation converges them without
   * re-allocating the 4096 map.
   */
  private retireWorld(): void {
    this.activeFlag = false;
    this.built = null;
    this.far?.dispose();
    this.far = null;
    // F-A3: the empty far map's GPU copy too, whether or not this world bound
    // it; the next world's first frame uploads it again if it needs it.
    releaseEmptyFarShadowMap();
    this.farBuiltAtMs = 0;
    this.shaderFailure = null;
  }

  /** Record a sticky `setup-failed` and tear everything down. */
  private fail(stage: UltraFaultStage, error: unknown): void {
    const message = messageOf(error);
    this.sticky = { kind: 'setup-failed', stage, message };
    console.warn(`Ultra could not start (${stage}): ${message} — drawing High.`);
    this.teardown('exit');
  }

  private failFromLighting(lighting: VenueLighting): void {
    const error = this.lightingError(lighting);
    this.fail(error.stage, error);
  }

  private lightingError(lighting: VenueLighting): UltraStageError {
    const failure = lighting.failure;
    return new UltraStageError(
      failure?.stage ?? 'environment',
      failure?.message ?? 'the Ultra light could not be hung',
    );
  }

  /** Throw here if `?ultrafault=` planted this stage and an activation is running. */
  private plant(stage: UltraFaultStage): void {
    if (this.faultAt(stage)) throw new UltraStageError(stage, `planted by ?ultrafault=${stage}`);
  }

  private faultAt(plant: UltraFaultPlant): boolean {
    return this.activating && this.plantedFault === plant;
  }

  // -- The activation's GL check (A28 C1) -----------------------------------

  /**
   * An activation begins: forget the last one's findings and drain what is
   * pending — once, boundedly — keeping it as `stale`, which never refuses.
   */
  private beginGlWatch(): void {
    this.glErrors = [];
    this.glWarned = new Set();
    this.glWatch = true;
    this.readGl('stale', 0);
  }

  /** Keep `first` (a code the host already read) and every error still pending, as `stage`'s. */
  private readGl(stage: UltraGlStage, first: number): void {
    if (first !== 0) this.keepGl(glFinding(stage, first, null));
    const read = this.host.readGlErrors;
    if (read === undefined) return;
    for (const code of read.call(this.host, GL_ERROR_READS)) {
      if (code !== 0) this.keepGl(glFinding(stage, code, null));
    }
  }

  /**
   * Keep one finding. One that neither refuses nor is stale is also said
   * (Fable finding 7): an INVALID_OPERATION on the first frame — a held
   * program whose every draw is rejected — used to pass the activation in
   * silence. One warning per stage and code per activation, so a lost context
   * answering every read says so once a stage. A refusing finding is worded
   * by the refusal's own warning (`fail`); a stale one is not Ultra's.
   */
  private keepGl(finding: UltraGlError): void {
    this.glErrors.push(finding);
    if (finding.refuses || finding.stage === 'stale') return;
    const key = `${finding.stage}:${finding.code}`;
    if (this.glWarned.has(key)) return;
    this.glWarned.add(key);
    console.warn(`Ultra: ${glNoticeMessage(finding)}.`);
  }

  /**
   * After an allocation stage, while an activation watches: raise the stage's
   * planted GL error (`?ultrafault=gl-*`), read and keep what is pending, and
   * check the stage's render target's framebuffer. Records only — the
   * activation refuses on what was kept (`refuseOnGl`) — so a hook inside
   * the light's rig never throws a GL finding at the rig.
   */
  private watchStage(
    stage: Exclude<UltraGlStage, 'stale'>,
    targetName: string,
    target: THREE.RenderTarget | null | undefined,
    first = 0,
  ): void {
    if (!this.glWatch) return;
    const plant = GL_PLANTS[stage];
    if (plant !== undefined && this.faultAt(plant.fault)) this.host.raiseGlError?.(plant.code);
    this.readGl(stage, first);
    const status = this.host.framebufferStatus;
    if (status === undefined || target === null || target === undefined) return;
    const code = status.call(this.host, target);
    // Fable finding 6: 0 is what a failed check returns (a context lost after
    // the host looked), no framebuffer's status — no finding, as null is.
    if (code !== null && code !== 0 && code !== GL_FRAMEBUFFER_COMPLETE) this.keepGl(glFinding(stage, code, targetName));
  }

  /** Fail the activation on `gl-error` when anything kept so far refuses, naming its stage and code. */
  private refuseOnGl(): void {
    const refusing = this.glErrors.find((finding) => finding.refuses);
    if (refusing !== undefined) throw new UltraStageError('gl-error', glRefusalMessage(refusing));
  }

  /** The planted `build` fault, handed to `installTerrain` as its `beforeBuild`. */
  private readonly plantBuild = (): void => {
    this.plant('build');
  };

  private install(
    plan: LevelPlan,
    recipe: BuildRecipe,
    context: UltraBuildContext | null,
    beforeBuild?: () => void,
  ): TerrainView {
    this.installs += 1;
    return beforeBuild === undefined
      ? this.host.installTerrain(plan, recipe, context)
      : this.host.installTerrain(plan, recipe, context, beforeBuild);
  }

  /**
   * A22: the map sizes for the buffer the Ultra frame will draw to — the
   * canvas at the ordinary ratio with T0's cap applied, as the next `resize`
   * will set it. Entering from the ordinary tier (nothing held) this is the
   * fresh rule: before layout the buffer is empty and it answers the small
   * maps, and the first real `resize` re-chooses (`onDrawingBuffer`). A
   * re-activation that still holds maps (a world swap or a kit change under
   * Ultra) re-chooses inside N1's band, so a buffer in the band keeps them.
   */
  private chooseMapSizes(): UltraShadowMapSizes {
    const canvas = this.host.canvas();
    const buffer = ultraDrawingBufferFor(this.pixelBudget, canvas.width, canvas.height, canvas.pixelRatio);
    return ultraShadowMapSizesAfter(this.mapSizes, buffer.width, buffer.height);
  }

  private buildFar(far: UltraFarShadow): void {
    this.sunUnit.copy(this.host.lighting().sunOffset).normalize();
    const started = this.host.now();
    this.host.buildFarShadow(far, this.sunUnit);
    this.farBuiltAtMs = this.host.now();
    this.timings.farMs = this.farBuiltAtMs - started;
  }

  /**
   * W4's Ultra rig with the three live near values in it — the F4 paths
   * `ULTRA.nearBias`, `nearNormalBias` and `nearRadius` are the ones the panel
   * moves. Written through the lighting owner's own `shadowRigFor` (W4's
   * compatible addition, adopted at integration; its fourth argument, the
   * buffer-sized near edge, adopted by the U4 stabilizer), so the rule for
   * which live values and which edge reach the rig lives in one place.
   */
  private ultraRig(): ShadowRig {
    // A22: the edge this activation chose from the drawing buffer
    // (`ultraShadowMapSizesFor` only steps down), through the lighting
    // owner's own writer, which rounds and clamps it to [1024, the table's].
    return shadowRigFor('ultra', this.host.ordinaryQuality(), this.live, this.mapSizes?.near);
  }

  private nearReadBack(): number {
    return this.host.sun.shadow.map?.width ?? 0;
  }

  /** The ledger: every Ultra-owned GPU resource that exists right now. */
  private steadyBytes(): number {
    if (!this.engaged) return 0;
    let bytes = 0;
    if (this.rig !== null) {
      const edge = this.nearReadBack();
      bytes += edge * edge * NEAR_BYTES_PER_TEXEL;
    }
    const far = this.far;
    // F-A3: a world that asked for a far map and built none (nothing on layer
    // 5) binds the uploaded empty one instead (`emptyFarShadowMap`).
    if (far !== null) bytes += far.texture === null ? EMPTY_FAR_SHADOW_BYTES : far.bytes;
    const lighting = this.host.lighting();
    bytes += lighting.environment?.bytes ?? 0;
    if (lighting.tier === 'ultra') {
      bytes += skyBytes(lighting.sky.texture);
      // F3: the drawn background, three's conversion of the sky made colour
      // only (the model's `sky-background-cube`).
      bytes += this.skyBackground?.bytes ?? 0;
    }
    if (this.terrainIsUltra) bytes += this.host.installedTerrain()?.ultra?.bytes ?? 0;
    return bytes;
  }

  /**
   * The recipe the installed world was actually built with (Fable F1: after a
   * failed activation this is what stands, never what was asked for).
   */
  private installedRecipe(): BuildRecipeId {
    return this.built?.recipe.id
      ?? this.host.installedTerrain()?.recipe
      ?? this.selection?.recipe.id
      ?? 'baseline';
  }

  private result(installsBefore: number): UltraTierResult {
    return {
      active: this.activeFlag,
      recipe: this.installedRecipe(),
      refusal: this.refusal,
      terrainChanged: this.installs !== installsBefore,
    };
  }

  // -- Rider receive flags (§3.2, §3.6 step 3) ------------------------------

  /**
   * Every rider rig in the scene receives, and so does every rig added while
   * Ultra holds them (`childadded`); a rig that leaves the scene goes with its
   * authored flags (`childremoved`), so a rig re-dressed or despawned mid-Ultra
   * never keeps an Ultra flag. The authored booleans live in a WeakMap, so a
   * disposed rig is never retained by it.
   */
  private holdRiders(): void {
    const scene = this.host.scene;
    if (this.riderFlags === null) {
      this.riderFlags = new WeakMap();
      this.riderEnv = new WeakMap();
      scene.addEventListener('childadded', this.onChildAdded);
      scene.addEventListener('childremoved', this.onChildRemoved);
    }
    for (const child of scene.children) this.receiveOn(child);
  }

  private releaseRiders(): void {
    if (this.riderFlags === null) return;
    const scene = this.host.scene;
    scene.removeEventListener('childadded', this.onChildAdded);
    scene.removeEventListener('childremoved', this.onChildRemoved);
    for (const child of scene.children) this.restoreOn(child);
    // A rig that left the scene without its event (never, today) still gets
    // its materials back: everything still held is restored here.
    this.riderMaterials.forEach(this.restoreRiderMaterial);
    this.riderMaterials.clear();
    this.riderFlags = null;
    this.riderEnv = null;
    this.riderFarKeyed = null;
  }

  private receiveOn(root: THREE.Object3D): void {
    const flags = this.riderFlags;
    const env = this.riderEnv;
    if (flags === null || env === null || !isReceivingRig(root)) return;
    root.traverse((node) => {
      if ((node as THREE.Mesh).isMesh !== true) return;
      if (!flags.has(node)) flags.set(node, node.receiveShadow);
      node.receiveShadow = true;
      // A15: the rider's own share of the environment (`syncRiderEnvironment`),
      // and round 3 item 3: the near map read through the fixed, world-locked
      // disk rather than three's per-pixel dithered taps (`ultraRiderShadow.ts`).
      const material = (node as THREE.Mesh).material;
      for (const each of Array.isArray(material) ? material : [material]) {
        const standard = each as THREE.MeshStandardMaterial;
        if (standard.isMeshStandardMaterial !== true) continue;
        if (!env.has(standard)) {
          env.set(standard, {
            envMap: standard.envMap,
            envMapIntensity: standard.envMapIntensity,
            shadow: holdRiderShadow(standard, this.riderLight),
          });
        }
        this.riderMaterials.add(standard);
      }
    });
    this.syncRiderEnvironment();
  }

  private restoreOn(root: THREE.Object3D): void {
    const flags = this.riderFlags;
    if (flags === null || !isReceivingRig(root)) return;
    root.traverse((node) => {
      const authored = flags.get(node);
      if (authored !== undefined) {
        node.receiveShadow = authored;
        flags.delete(node);
      }
      const material = (node as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (material === undefined) return;
      for (const each of Array.isArray(material) ? material : [material]) {
        this.restoreRiderMaterial(each as THREE.MeshStandardMaterial);
      }
    });
  }

  /**
   * Put a held material's authored `envMap`, `envMapIntensity` and compile
   * hooks back, exactly, and stop holding it. The Ultra shadow program it
   * compiled is released with the environment ones (teardown step 4b).
   */
  private readonly restoreRiderMaterial = (material: THREE.MeshStandardMaterial): void => {
    const authored = this.riderEnv?.get(material);
    if (authored === undefined) return;
    material.envMap = authored.envMap;
    material.envMapIntensity = authored.envMapIntensity;
    releaseRiderShadow(material, authored.shadow);
    this.riderEnv?.delete(material);
    this.riderMaterials.delete(material);
  };

  private readonly onChildAdded = (event: { child: THREE.Object3D }): void => {
    this.receiveOn(event.child);
  };

  private readonly onChildRemoved = (event: { child: THREE.Object3D }): void => {
    this.restoreOn(event.child);
  };

  /**
   * `renderer.debug.onShaderError` while Ultra is active: note the first
   * failure and say so (installing a hook silences three's own report); the
   * demotion happens at the top of the next frame, never inside a render.
   */
  private readonly onShaderError = (detail: string): void => {
    if (this.shaderFailure !== null) return;
    this.shaderFailure = detail;
    console.error(`Ultra: a shader failed while Ultra was active; drawing High from the next frame.\n${detail}`);
  };
}
