/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The M39 Ultra shared contract — types only, no runtime code.
 *
 * Written verbatim from `docs/M39_ULTRA.md` §6.2 by the W0 package and
 * **frozen for Wave 1**: every Ultra builder (tier, UI, forms, lighting,
 * renderer, surfaces, cost) compiles against these shapes while the others are
 * being written, so a change here is a coordinator amendment, never a local
 * edit (§6.1, invariant 16). A builder that needs more adds a compatible
 * export in its own file and reports it as a contract question.
 *
 * **Why a types-only file.** It is imported by `render/Renderer.ts`, by the
 * `render/ultra/*` modules and by `app/` through `import type`, so it must
 * stay erasable (`erasableSyntaxOnly`, invariant 13): no enum, no value, no
 * DOM. The three import is `import type` for the same reason — nothing here
 * reaches the bundle.
 *
 * **What Ultra is** (§0.1): the same plan and simulation, rendered forward to
 * the existing MSAA canvas with no HDR post chain, as an isolated render-owned
 * recipe with its own measured envelope. Low/Medium/High stay byte-identical;
 * everything below describes the *extra* path only.
 */
import type * as THREE from 'three';
import type { PresentationRecipe, PresentationRecipeId } from '../presentation.ts';

/** The two Ultra rungs (§5): `ultra-full` first, `ultra-lit` when it breaches. */
export type UltraRecipeId = 'ultra-full' | 'ultra-lit';
/** Whatever a world was actually built with — an ordinary recipe or an Ultra rung. */
export type BuildRecipeId = PresentationRecipeId | UltraRecipeId;

/** Which Ultra components a recipe builds. `lighting:false` exists only for the
 *  `?ultrakit=-lighting` diagnostic (U1 attribution captures); no shipped rung uses it. */
export interface UltraKit {
  readonly forms: boolean;      // W3 foliage + furniture builders (false on ultra-lit → enhanced builders)
  readonly buildings: boolean;  // W3 facade/cap/gable builders + building casting + relief
  readonly facadeMaps: boolean; // W6 normal + ORM pages, Ultra albedo copy with anisotropy
  readonly ground: boolean;     // W6 contact AO attributes (+ W4 brick joints)
  readonly edgeFill: boolean;   // W6 fill-only corner fill (kill flag)
  readonly blocks: boolean;     // W6 block base AO + plank courses
  readonly lighting: boolean;   // W4 env + bounce + near cascade + receive flags + response
  readonly farShadow: boolean;  // W4 static far map (T12), from ULTRA.farShadow.enabled
  readonly ao: false;           // T13 reserved; only a coordinator amendment may widen this
}
/** The kit switches a `?ultrakit=` diagnostic may flip. `ao` is not one of them. */
export type UltraKitSwitch = Exclude<keyof UltraKit, 'ao'>;
/** A sparse diagnostic override, e.g. `{ lighting: false }` for `?ultrakit=-lighting`. */
export type UltraKitOverride = Readonly<Partial<Record<UltraKitSwitch, boolean>>>;

/**
 * An Ultra rung. Carries the ordinary recipe's flags (`foliage`, `walls`) so
 * every ordinary branch that reads them keeps working on an Ultra world, plus
 * the kit that says which Ultra builders run.
 */
export interface UltraRecipe extends Omit<PresentationRecipe, 'id'> {
  readonly id: UltraRecipeId;   // foliage:true, walls:true on both rungs
  readonly ultra: UltraKit;
}
/** What `createTerrain`/`createProps` accept: ordinary or Ultra. */
export type BuildRecipe = PresentationRecipe | UltraRecipe;

/** Uniforms every Ultra material shares; W4 chooses the names. Opaque to W3/W6. */
export interface UltraShared { readonly uniforms: Readonly<Record<string, THREE.IUniform>>; }

/** Handed by the renderer to createTerrain/createProps/markings/hazards. Headless: see createUltraShared(). */
export interface UltraBuildContext {
  readonly recipe: UltraRecipe;
  readonly shared: UltraShared;
  readonly maxAnisotropy: number; // renderer.capabilities.getMaxAnisotropy(); 1 in node
}

/** The facade atlas's Ultra companions (T4), owned per view and disposed with it. */
export interface UltraFacadeMaps {
  readonly albedo: THREE.DataTexture; // same texels as the ordinary atlas, own instance, anisotropy set
  readonly normal: THREE.DataTexture; // 1024², painted mips
  readonly orm: THREE.DataTexture;    // R occlusion, G roughness, B metalness, A glass mask; painted mips
  readonly bytes: number;
  dispose(): void;
}

/**
 * W4 live-tunable values (registered F4 paths 'ULTRA.<field>'); Game reads and forwards them.
 * The last two (final touch, post round 4) are the A14/A20 static-shade lift at the camera and
 * at distance, on F4 as `ULTRA.shade.lift` / `ULTRA.shade.liftFar` for the owner's Trades 1 and 2.
 */
export interface UltraLiveTuning {
  readonly nearBias: number; readonly nearNormalBias: number; readonly nearRadius: number;
  readonly envKappa: number; readonly bounceLift: number;
  readonly groundSpec: number; readonly glassSpec: number; readonly waterSpec: number;
  readonly contactStrength: number; readonly contactDirectShare: number;
  readonly foliageWrap: number; readonly foliageTransmission: number; readonly specAA: number;
  readonly shadeLift: number; readonly shadeLiftFar: number;
}

/**
 * Every field the single sun's shadow rig carries, ordinary or Ultra (§3.2).
 * `shadowRigFor('ordinary', q)` must equal today's constructor/`setQuality`
 * values exactly; `forwardShare`/`snap`/`fadeShare` are Ultra-only and read 0 /
 * false / 0 on the ordinary rig.
 */
export interface ShadowRig {
  readonly mapSize: number; readonly extent: number; readonly near: number; readonly far: number;
  readonly bias: number; readonly normalBias: number; readonly radius: number; readonly intensity: number;
  readonly lightDistance: number; readonly forwardShare: number; readonly snap: boolean; readonly fadeShare: number;
}

/** Where an Ultra activation can fail (and where `?ultrafault=` plants a failure). */
export type UltraFaultStage = 'build' | 'sky' | 'environment' | 'shadow' | 'far-shadow' | 'shader' | 'gl-error';
/**
 * What `?ultrafault=` may plant (A28 C1): a stage's failure, or a genuine GL
 * error raised on the context at one allocation stage, so the activation's GL
 * check is proved from outside. `gl-sky` raises INVALID_FRAMEBUFFER_OPERATION
 * after the sky's background cube and `gl-framebuffer` after the first frame
 * (both refuse, on `gl-error`); `gl-enum` raises INVALID_ENUM after the
 * environment (recorded in the report; Ultra stays on).
 */
export type UltraFaultPlant = UltraFaultStage | 'gl-sky' | 'gl-framebuffer' | 'gl-enum';
/**
 * Where an Ultra activation read the GL (A28 C1): `stale` is what was pending
 * before its first allocation (drained once, never refusing); the rest follow
 * each allocation stage.
 */
export type UltraGlStage = 'stale' | 'sky' | 'environment' | 'far-shadow' | 'first-frame';
/**
 * One thing an activation's GL check found, kept for the report (A28 C1): a
 * `gl.getError()` code (`target` null), or an Ultra render target whose
 * framebuffer is incomplete (`target` its name, `code` the
 * `checkFramebufferStatus` value). `refuses` when it failed the activation:
 * OUT_OF_MEMORY, INVALID_FRAMEBUFFER_OPERATION or an incomplete framebuffer,
 * from any stage but `stale`.
 */
export interface UltraGlError {
  readonly stage: UltraGlStage; readonly code: number; readonly name: string;
  readonly target: string | null; readonly refuses: boolean;
}
/** The §5 envelope's axes, as a refusal names them. */
export type UltraEnvelopeAxis =
  | 'soloDraws' | 'soloTriangles' | 'propDraws' | 'propTriangles' | 'bytes' | 'programs' | 'shadowMap';
/** Why Ultra is not drawing, with its scope in the trailing comment (§5, §6.3 W1). */
export type UltraRefusal =
  | { readonly kind: 'presentation-override'; readonly recipe: PresentationRecipeId }                // per boot
  | { readonly kind: 'capability'; readonly missing: 'webgl2' | 'half-float-render' | 'max-texture-size' } // session-sticky
  | { readonly kind: 'envelope'; readonly axis: UltraEnvelopeAxis; readonly value: number; readonly ceiling: number } // world-scoped
  | { readonly kind: 'setup-failed'; readonly stage: UltraFaultStage; readonly message: string };     // session-sticky

/** One GPU target the Ultra ledger prices (§5, W7's `ultraTargetBytes`). */
export interface TargetReport {
  readonly name: string; readonly width: number; readonly height: number;
  readonly format: string; readonly samples: number; readonly bytes: number;
}
/** One scene render in the Ultra pass list (§2.3). */
export interface UltraPassReport {
  readonly name: 'near-shadow' | 'colour' | 'far-shadow-build' | 'pmrem-build';
  readonly when: 'every-frame' | 'activation';
  readonly drawCalls: number; readonly triangles: number;
}
/** The Ultra frame model: solo frame, the prop family, and the passes. */
export interface UltraFrameCost {
  readonly solo: { readonly drawCalls: number; readonly triangles: number };
  readonly props: { readonly drawCalls: number; readonly triangles: number };
  readonly passes: readonly UltraPassReport[];
}
/** Everything `renderer.ultraReport()` tells the QA bridge, the tools and the auditor. */
export interface UltraReport {
  readonly requested: boolean; readonly active: boolean;
  readonly recipe: BuildRecipeId; readonly kit: UltraKit | null;
  readonly refusal: UltraRefusal | null;
  readonly cost: UltraFrameCost | null;
  readonly targets: readonly TargetReport[];
  readonly metricFacade?: { readonly proxyFlagBytes: number; readonly proxyColourPieces: number; readonly discardedColourTriangles: number; readonly commonGeometryBytes: number };
  readonly bytes: { readonly steady: number; readonly peakSwitch: number };
  readonly shadow: (ShadowRig & { readonly mapSizeReadBack: number }) | null;
  readonly farShadow: { readonly mapSize: number; readonly texelMetres: number; readonly builtAtMs: number } | null;
  readonly environment: { readonly cubeSize: number; readonly bytes: number; readonly intensity: number; readonly kappa: number; readonly bounceLift: number } | null;
  readonly sky: { readonly width: number; readonly height: number; readonly anisotropy: number };
  readonly drawingBuffer: { readonly width: number; readonly height: number; readonly ratio: number; readonly tierCap: number };
  readonly programs: number;
  readonly timings: { readonly buildMs: number; readonly skyMs: number; readonly envMs: number; readonly farMs: number; readonly compileMs: number };
  readonly safetyDemotions: number;
  /** A28 C1: what the last activation's GL checks found, in order (empty before any activation). */
  readonly glErrors: readonly UltraGlError[];
}
/** What `renderer.reconcileUltra()` did: the built recipe and whether the terrain was rebuilt. */
export interface UltraTierResult {
  readonly active: boolean; readonly recipe: BuildRecipeId;
  readonly refusal: UltraRefusal | null; readonly terrainChanged: boolean;
}
