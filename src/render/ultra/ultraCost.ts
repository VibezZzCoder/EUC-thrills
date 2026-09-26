/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The Ultra cost model and admission — M39 (`docs/M39_ULTRA.md` §5, package
 * W7).
 *
 * **Separate from `presentationCost`, on purpose.** That function throws on a
 * cast-flag change (`presentation.ts:136-138`) and holds the draw calls fixed
 * (`:164`), both of which are true of the enhanced recipe and false of Ultra,
 * where the building parts start casting. So Ultra is priced here —
 * `planRenderCost` + `ULTRA_PART_COSTS` deltas + cast flips +
 * `ultraColliderTriangles` + `NON_LEVEL_RESERVE` + the pass list — and judged
 * against `ULTRA_ENVELOPE`, never against Contracts 1–3 and never through
 * admission (the plan is already immutable when this runs).
 *
 * **The model is the built scene counted another way.** Every figure below is
 * one `render/renderCost.ts:measureLevelScene(plan, rung)` reads off the
 * world `createTerrain` actually builds, and `ultraCost.test.ts` holds the two
 * equal — exactly, not approximately — on the slice, BelVar, Switchback, the
 * proving ground, the `euc` town and the heavy seed, under both rungs. That is
 * `level/renderBudget.ts`'s discipline one tier up: a cost model that drifts
 * from reality is the top render risk, and exact agreement with a measurement
 * is the only mitigation that does not rot.
 *
 * **What a rung changes, and what it cannot.** The same meshes are built in
 * the same buckets (§4 rules), so the colour-pass draw calls are the ordinary
 * model's own. Triangles move where a part's builder changes — the Ultra
 * forms under `kit.forms`, the facade/cap/gable builders under
 * `kit.buildings`, both read from `ULTRA_PART_COSTS` exactly as `props.ts`
 * chooses a builder — and where a block gains plank courses or base-AO rows
 * (`ultraColliderTriangles`). Shadow-pass draw calls move only where a part's
 * cast flag flips (`ultraCasts`: the buildings start throwing shade, D2), and
 * a flipped part is charged its triangles a second time. The heightfield,
 * surround, markings and hazards gain attributes and materials, never
 * triangles.
 *
 * `judgeUltra` walks `ULTRA_LADDER` with any `?ultrakit=` override applied and
 * takes the first rung with no breach; if both breach, or the capability
 * probe fails, the answer is a worded refusal and the world draws High. It is
 * asked once per world in `Renderer.setLevel`, never as a runtime governor.
 *
 * Draw calls, triangles and bytes are reportable evidence. A frame interval is
 * not (`AGENTS.md`), and nothing here times anything.
 */
import {
  LEVEL_GEOMETRY_COST,
  NON_LEVEL_RESERVE,
  PART_COSTS,
  type PropPartId,
} from '../../data/renderCost.ts';
import { ULTRA } from '../../data/tuning.ts';
import type { LevelPlan } from '../../level/plan.ts';
import { colliderMaterial, planRenderCost } from '../../level/renderBudget.ts';
import { ENHANCED_PART_COSTS } from '../enhancedCatalog.ts';
import { FACADE_ATLAS_SIZE } from '../facadeAtlas.ts';
import { ultraColliderTriangles } from './ultraBlocks.ts';
import { ultraDetailMapsSampled } from './ultraGroundDetail.ts';
import { ULTRA_PART_COSTS } from './ultraCatalog.ts';
import { ULTRA_ENVELOPE, ULTRA_ENVELOPE_AXES } from './ultraEnvelope.ts';
import { ULTRA_BUILDING_BUILDERS, ULTRA_FORM_BUILDERS, ultraCasts } from './ultraKit.ts';
import { applyKitOverride, ULTRA_LADDER } from './ultraRecipe.ts';
import { ultraShadowMapSizesFor, type UltraShadowMapSizes } from './ultraShadowSizes.ts';
import type {
  TargetReport,
  UltraEnvelopeAxis,
  UltraFrameCost,
  UltraKitOverride,
  UltraPassReport,
  UltraRecipe,
  UltraRecipeId,
  UltraRefusal,
} from './ultraTypes.ts';

/** What the renderer's capability probe found (§6.3 W5, activation step 1). */
export interface UltraCaps {
  maxTextureSize: number;
  halfFloatRenderable: boolean;
  webgl2: boolean;
}

/**
 * The capabilities a headless test judges against: the q205 reference Mac's
 * (WebGL2, half-float renderable, `MAX_TEXTURE_SIZE` 16384), so `node --test`
 * admits exactly what the owner's machine would.
 */
export const HEADLESS_CAPS: UltraCaps = Object.freeze({
  maxTextureSize: 16384,
  halfFloatRenderable: true,
  webgl2: true,
});

/**
 * The drawing buffer admission prices targets at: the pixel budget's own
 * rectangle, the largest buffer Ultra ever draws to — 2880×1800 since A26
 * (the Air's retina buffer, 5,184,000 px; §2.1), 2560×1600 before it. Only
 * the shadow maps follow the buffer, and both rectangles keep the full maps,
 * so the byte model is the same at either.
 *
 * Since A22 (Fable F5) the two shadow maps are sized from the drawing buffer
 * at activation (`ultraShadowMapSizesFor`: a buffer of 2,000,000 px or more
 * keeps the 4096 near / 3072 far maps, a smaller one, such as a phone at the
 * DPR-2 cap, gets 2048 / 2048). The rule only ever steps *down* from the
 * largest buffer, so pricing admission here prices the worst case, not
 * whatever window happened to be open. Nothing else Ultra owns scales with
 * the buffer (§2.3: no post chain, zero per-frame targets).
 */
export const ULTRA_JUDGE_BUFFER: { readonly width: number; readonly height: number } = Object.freeze({
  width: 2880,
  height: 1800,
});

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

/**
 * Which builder a part draws with under a rung — `render/props.ts`'s own
 * selection (§6.3 W3), restated for pricing:
 *
 *   `(kit.forms ? ULTRA_FORM_BUILDERS[part]) ?? (kit.buildings ?
 *   ULTRA_BUILDING_BUILDERS[part]) ?? (recipe.foliage ? ENHANCED[part]) ??
 *   the ordinary builder`.
 *
 * The tables are read rather than copied, so a part W3 adds to either table
 * is priced from the catalogue the moment it is built, and a part it removes
 * falls back to its enhanced or ordinary price the same way.
 */
export type UltraPartSource = 'forms' | 'buildings' | 'enhanced' | 'baseline';

export function ultraPartSource(part: PropPartId, recipe: UltraRecipe): UltraPartSource {
  const kit = recipe.ultra;
  if (kit.forms && ULTRA_FORM_BUILDERS[part] !== undefined) return 'forms';
  if (kit.buildings && ULTRA_BUILDING_BUILDERS[part] !== undefined) return 'buildings';
  if (recipe.foliage && ENHANCED_PART_COSTS[part] !== undefined) return 'enhanced';
  return 'baseline';
}

/**
 * Colour-pass triangles one instance of a part draws under a rung.
 *
 * `ULTRA_PART_COSTS` is measured under `ULTRA_FULL` (both switches on), so a
 * part the rung builds with an Ultra builder takes its catalogue price, and
 * every other part the enhanced or baseline price it would have on an
 * ordinary world — `ultra-lit`'s trees are the enhanced trees, priced as such.
 */
export function ultraPartTriangles(part: PropPartId, recipe: UltraRecipe): number {
  switch (ultraPartSource(part, recipe)) {
    case 'forms':
    case 'buildings':
      return ULTRA_PART_COSTS[part].triangles;
    case 'enhanced':
      return ENHANCED_PART_COSTS[part]!.triangles;
    case 'baseline':
      return PART_COSTS[part].triangles;
  }
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

/**
 * Three's PMREM layout for an equirectangular source, as
 * `PMREMGenerator._fromTexture` builds it in 0.185.1: the cube size is
 * `2^⌊log2(width / 4)⌋`, the level count is `lodMax − LOD_MIN + 1` plus six
 * extra blur levels, and each level is one six-face plane (twelve
 * triangles). `ultraCost.test.ts` drives the real generator against a
 * counting renderer and holds these to what it draws.
 */
const PMREM_LOD_MIN = 4;
const PMREM_EXTRA_LODS = 6;
const PMREM_PLANE_TRIANGLES = 12;
/** Three's floor on the cube-UV width: `3 · max(cubeSize, 16 · 7)`. */
const PMREM_MIN_FACE_WIDTH = 16 * 7;

/** The cube size three filters a `sourceWidth`-wide equirect into (256 for 1024). */
export function pmremCubeSize(sourceWidth: number): number {
  return 2 ** Math.floor(Math.log2(sourceWidth / 4));
}

/**
 * The activation-only PMREM build: one equirect-to-cube-UV draw, then two
 * GGX draws per further level (`_applyPMREM` → `_applyGGXFilter`). For the
 * 1024-wide environment that is 21 draws and 252 triangles — §5's "about
 * 20 quad draws".
 */
export function pmremBuildPass(sourceWidth: number): { drawCalls: number; triangles: number } {
  const lodMax = Math.floor(Math.log2(sourceWidth / 4));
  const levels = lodMax - PMREM_LOD_MIN + 1 + PMREM_EXTRA_LODS;
  const drawCalls = 1 + 2 * (levels - 1);
  return { drawCalls, triangles: drawCalls * PMREM_PLANE_TRIANGLES };
}

/**
 * The half-float equirect source the PMREM is filtered from
 * (`ultraEnvironmentSource`): `ULTRA.env.width × height` RGBA16F, 8 B a
 * texel, no mips — 4 MiB at 1024×512. It lives only while the environment is
 * built, so it is in the switch peak and never in the steady set; the model
 * (`ultraBytes`) and the live ledger (`UltraRuntime.report`) both add it from
 * here (Fable N5).
 */
export function ultraEnvironmentSourceBytes(): number {
  return ULTRA.env.width * ULTRA.env.height * 8;
}

/** The PMREM cube-UV target (and its same-size ping-pong), RGBA16F. */
function pmremTarget(cubeSize: number): { width: number; height: number; bytes: number } {
  const width = 3 * Math.max(cubeSize, PMREM_MIN_FACE_WIDTH);
  const height = 4 * cubeSize;
  return { width, height, bytes: width * height * 8 };
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/**
 * Everything `ultraCost` knows about a rung on a plan, split the way
 * `measureLevelScene` reports the built scene — which is what the model =
 * built test compares, field for field. `frame` is the §6.2 answer.
 */
export interface UltraCostBreakdown {
  readonly recipe: UltraRecipeId;
  /** Level colour-pass draw calls: the ordinary model's own (same meshes, same buckets). */
  readonly colourDrawCalls: number;
  /** Level shadow-pass draw calls: the ordinary model's plus one per part the rung starts casting. */
  readonly shadowDrawCalls: number;
  readonly colourTriangles: number;
  readonly shadowTriangles: number;
  /** The prop family alone, colour + shadow — what `ULTRA_ENVELOPE.propDraws/propTriangles` bound. */
  readonly propDrawCalls: number;
  readonly propColourTriangles: number;
  readonly propShadowTriangles: number;
  /** The collider blocks alone, colour pass (they cast, so the shadow pass carries the same again). */
  readonly blockColourTriangles: number;
  /** Parts present whose shadow flag the rung flips, in plan order (the buildings, D2). */
  readonly castFlips: readonly PropPartId[];
  readonly frame: UltraFrameCost;
}

/**
 * Price a plan under an Ultra rung, with the working shown. See the file
 * comment for what moves and what cannot.
 */
export function ultraCostBreakdown(plan: LevelPlan, recipe: UltraRecipe): UltraCostBreakdown {
  const base = planRenderCost(plan);
  const kit = recipe.ultra;

  let propDrawCalls = 0;
  let propColour = 0;
  let propShadow = 0;
  let baselinePropColour = 0;
  let baselinePropShadow = 0;
  let shadowCallDelta = 0;
  const castFlips: PropPartId[] = [];
  for (const [part, count] of base.partInstances) {
    const ordinary = PART_COSTS[part];
    const triangles = ultraPartTriangles(part, recipe);
    const casts = ultraCasts(part, ordinary.castsShadow, kit);
    if (casts !== ordinary.castsShadow) {
      shadowCallDelta += casts ? 1 : -1;
      castFlips.push(part);
    }
    propDrawCalls += casts ? 2 : 1;
    propColour += triangles * count;
    if (casts) propShadow += triangles * count;
    baselinePropColour += ordinary.triangles * count;
    if (ordinary.castsShadow) baselinePropShadow += ordinary.triangles * count;
  }

  // Blocks cast, so a changed block is charged twice — once per pass — which
  // is `presentationCost`'s coursed-wall rule, one tier up.
  let baselineBlocks = 0;
  let blocks = 0;
  for (const segment of plan.segments) {
    for (const collider of segment.colliders) {
      baselineBlocks += LEVEL_GEOMETRY_COST.trianglesPerCollider;
      blocks += ultraColliderTriangles(collider, colliderMaterial(collider), kit);
    }
  }

  // Everything a rung does not touch is the ordinary model's own figure; the
  // deltas ride on top of it.
  const colourDrawCalls = base.colourDrawCalls;
  const shadowDrawCalls = base.shadowDrawCalls + shadowCallDelta;
  const colourTriangles = base.colourTriangles
    + (propColour - baselinePropColour)
    + (blocks - baselineBlocks);
  const shadowTriangles = base.shadowTriangles
    + (propShadow - baselinePropShadow)
    + (blocks - baselineBlocks);

  // The pass list (§2.3). The two every-frame passes carry the *level's*
  // share, so `solo` is exactly those two plus the full non-level reserve —
  // the reserve is not split by pass because `NON_LEVEL_RESERVE` is one
  // measured total (rider, ghost or cop, gates, particles, background).
  //
  // The far depth render draws exactly the layer-5 set (§3.4): every mesh
  // that casts under the rung — the casting props and the blocks — and
  // nothing else, because the heightfield, markings and hazards never cast
  // and the rider, cop, ghost and particles never join the layer. That set is
  // the level's own shadow pass, so its price is that pass's price.
  //
  // One addition this pass does not count (Wave 4, A16): on a world where a
  // cap closes a slot, the cap bucket's `onBeforeRender` draws it once more
  // into the far map with the slot push (`ultraBuildings.ultraSlotFarDepth`)
  // — one activation-only call, the cap bucket's triangles again (+1 /
  // +5,016 on the euc town). Which worlds have a slot is a fact about the
  // built cap matrices, not the plan's part counts, so the model leaves it
  // out and the far envelope is settled on the drawn figure instead;
  // `ultraCost.test.ts` bounds this pass plus the lid on the whole corpus and
  // measures the lid on the six worlds.
  const passes: UltraPassReport[] = [
    { name: 'near-shadow', when: 'every-frame', drawCalls: shadowDrawCalls, triangles: shadowTriangles },
    { name: 'colour', when: 'every-frame', drawCalls: colourDrawCalls, triangles: colourTriangles },
  ];
  if (kit.farShadow) {
    passes.push({ name: 'far-shadow-build', when: 'activation', drawCalls: shadowDrawCalls, triangles: shadowTriangles });
  }
  if (kit.lighting) {
    const pmrem = pmremBuildPass(ULTRA.env.width);
    passes.push({ name: 'pmrem-build', when: 'activation', drawCalls: pmrem.drawCalls, triangles: pmrem.triangles });
  }

  return {
    recipe: recipe.id,
    colourDrawCalls,
    shadowDrawCalls,
    colourTriangles,
    shadowTriangles,
    propDrawCalls,
    propColourTriangles: propColour,
    propShadowTriangles: propShadow,
    blockColourTriangles: blocks,
    castFlips,
    frame: {
      solo: {
        drawCalls: colourDrawCalls + shadowDrawCalls + NON_LEVEL_RESERVE.drawCalls,
        triangles: colourTriangles + shadowTriangles + NON_LEVEL_RESERVE.triangles,
      },
      props: { drawCalls: propDrawCalls, triangles: propColour + propShadow },
      passes,
    },
  };
}

/** The Ultra frame model for a plan under a rung (§6.2). */
export function ultraCost(plan: LevelPlan, recipe: UltraRecipe): UltraFrameCost {
  return ultraCostBreakdown(plan, recipe).frame;
}

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/**
 * Bytes of a full mip chain down to 1×1 — the true allocation, level by
 * level, rather than the "a third over the base" estimate (they differ by a
 * byte or two on a square power of two, more on a non-square one).
 */
export function mipChainBytes(width: number, height: number, bytesPerTexel: number): number {
  let bytes = 0;
  let w = width;
  let h = height;
  for (;;) {
    bytes += w * h * bytesPerTexel;
    if (w === 1 && h === 1) return bytes;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
}

/**
 * Bytes of a cube render target as three 0.185.1 allocates one: six RGBA8
 * faces, each with its full mip chain when the texture generates mips, plus —
 * when `depthBuffer` is true, which is `RenderTarget`'s default — one
 * `DEPTH_COMPONENT24` renderbuffer per face (`WebGLTextures.
 * setupDepthRenderbuffer`, 4 B/texel), which lives as long as the target.
 *
 * Exported so the runtime ledger prices the live background cube with the
 * same arithmetic the model uses (A22, Fable F3): the model's
 * `sky-background-cube` row is this function of the cube Ultra builds
 * (`createUltraBackgroundCube`, colour only), and `ultraCost.test.ts` holds
 * the two equal — so a depth-buffered cube, 24 MiB more at 1024, cannot
 * return without the test saying so.
 */
export function cubeTargetBytes(target: {
  readonly width: number;
  readonly depthBuffer: boolean;
  readonly texture: { readonly generateMipmaps: boolean };
}): number {
  const edge = target.width;
  const face = target.texture.generateMipmaps ? mipChainBytes(edge, edge, 4) : edge * edge * 4;
  return 6 * face + (target.depthBuffer ? 6 * edge * edge * 4 : 0);
}

/**
 * Every Ultra-owned GPU allocation a rung holds while it draws, with its
 * bytes — the ledger's arithmetic (§5), so `ultraReport().bytes.steady` has a
 * model to be held to:
 *
 * - `near-shadow` (lighting): three's allocation for the near map, RGBA8
 *   colour + 32-bit depth, **8 B/texel** — 128 MiB at 4096² (High's 2048 is
 *   32). Its edge is `ultraShadowMapSizesFor(buffer)`'s (A22, Fable F5):
 *   4096 on a buffer of 2,000,000 px or more, 2048 below that (32 MiB).
 * - `environment` (lighting): the PMREM cube-UV target,
 *   `3·max(cube, 112) × 4·cube` RGBA16F — 6 MiB for the 256 cube.
 * - `sky` (lighting): the Ultra sky, 2048×1024 RGBA8 with its generated
 *   mips — ≈ 10.7 MiB, replacing the ordinary 2.7.
 * - `sky-background-cube` (lighting; A22, Fable F3): three draws an
 *   equirectangular `scene.background` through a cube it converts the sky
 *   into, `sky.height` a face. Ultra builds that cube itself, colour only
 *   (`createUltraBackgroundCube`), so the row is `cubeTargetBytes` of it —
 *   6 × 1024² × 4 B with mips, 32 MiB, replacing the ordinary sky's 8 MiB
 *   cube. It was missing from the ledger until the Fable pass.
 * - `far-shadow` (farShadow): R8 colour (minimised) + 32-bit depth,
 *   **5 B/texel** — 45 MiB at 3072² (20 at 2048, which a buffer under
 *   2,000,000 px gets by the same rule as the near map).
 * - `facade-albedo`, `facade-normal`, `facade-orm` (facadeMaps): the Ultra
 *   albedo copy at the ordinary atlas size and the two companion pages, each
 *   with its full chain.
 * - `ground-block-attributes (budget)` (ground, edgeFill or blocks): the
 *   whole §5 attribute budget, because the packing is W6's and the true
 *   figure only exists once a world is built (`TerrainView.ultra.bytes`).
 * - `ground-detail` (ground, while `ULTRA.ground.detail.enabled`): the pre-R1
 *   ground pass's painted RGBA8 maps that the ground GLSL samples
 *   (`ultraDetailMapsSampled`) — broad at 256 always, grass, stone and soil
 *   at 512 only while a fine term reads them — each with its full painted
 *   chain, which `createUltraGroundDetail` allocates once per built view. At
 *   `detail.fine` 0 that is the broad map alone, 349,524 B (Wave 4, R-G:
 *   round-2 item 0 returned the unsampled 4,194,300 B).
 *
 * Transients are not steady allocations and are not listed: the PMREM
 * ping-pong target and the half-float equirect source live only for the
 * build (`ultraBytes().peakSwitch` carries them). The canvas is not
 * Ultra-owned either — High draws to the same MSAA default framebuffer, and
 * Ultra only ever makes it smaller (§2.1).
 *
 * `buffer` is the drawing buffer the rung would draw to. Only the two
 * shadow maps follow it (A22), through the runtime's own rule
 * (`ultraShadowMapSizesFor`, imported, never restated) — or, when `maps` is
 * given, at those edges: the live report passes the maps the runtime holds,
 * which N1's hysteresis can keep full a little under the 2 MP line where the
 * fresh rule would price the small ones. Every other entry is
 * buffer-independent (no post chain, zero per-frame targets, §2.3), and the
 * parameter stays the seam where a reserved T13 half-resolution target would
 * be priced. `tools/render-cost.mjs --ultra` prints the list at 1080p,
 * 2560×1600, the budget-capped Air buffer and a phone at the DPR-2 cap.
 */
export function ultraTargetBytes(
  recipe: UltraRecipe,
  buffer: { width: number; height: number },
  held?: UltraShadowMapSizes,
): readonly TargetReport[] {
  if (!(buffer.width > 0 && buffer.height > 0)) {
    throw new Error(`ultraTargetBytes: a ${buffer.width}×${buffer.height} drawing buffer is not a buffer`);
  }
  const kit = recipe.ultra;
  const out: TargetReport[] = [];
  const maps = held ?? ultraShadowMapSizesFor(buffer.width, buffer.height);

  if (kit.lighting) {
    const near = maps.near;
    out.push({ name: 'near-shadow', width: near, height: near, format: 'RGBA8 + DEPTH32', samples: 0, bytes: near * near * 8 });
    const pmrem = pmremTarget(pmremCubeSize(ULTRA.env.width));
    out.push({ name: 'environment', width: pmrem.width, height: pmrem.height, format: 'RGBA16F (PMREM cube-UV)', samples: 0, bytes: pmrem.bytes });
    out.push({
      name: 'sky',
      width: ULTRA.sky.width,
      height: ULTRA.sky.height,
      format: 'RGBA8 + mips',
      samples: 0,
      bytes: mipChainBytes(ULTRA.sky.width, ULTRA.sky.height, 4),
    });
    const face = ULTRA.sky.height;
    out.push({
      name: 'sky-background-cube',
      width: face,
      height: face,
      format: 'RGBA8 cube ×6 + mips',
      samples: 0,
      bytes: cubeTargetBytes({ width: face, depthBuffer: false, texture: { generateMipmaps: true } }),
    });
  }
  if (kit.farShadow) {
    const far = maps.far;
    out.push({ name: 'far-shadow', width: far, height: far, format: 'R8 + DEPTH32', samples: 0, bytes: far * far * 5 });
  }
  if (kit.facadeMaps) {
    const atlas = FACADE_ATLAS_SIZE;
    const page = ULTRA.facade.mapSize;
    out.push({ name: 'facade-albedo', width: atlas, height: atlas, format: 'RGBA8 sRGB + mips', samples: 0, bytes: mipChainBytes(atlas, atlas, 4) });
    out.push({ name: 'facade-normal', width: page, height: page, format: 'RGBA8 + painted mips', samples: 0, bytes: mipChainBytes(page, page, 4) });
    out.push({ name: 'facade-orm', width: page, height: page, format: 'RGBA8 + painted mips', samples: 0, bytes: mipChainBytes(page, page, 4) });
  }
  if (kit.ground && ULTRA.ground.detail.enabled) {
    // Wave 4 (R-G, round-2 item 0): only the maps the ground GLSL samples are
    // built, so only those are charged — at `detail.fine` 0, the broad map.
    const detail = ULTRA.ground.detail;
    const sampled = ultraDetailMapsSampled(detail);
    const maps = [sampled.grass, sampled.stone, sampled.soil, sampled.broad].filter(Boolean).length;
    const edge = sampled.grass ? detail.grassSize : detail.broadSize;
    out.push({
      name: 'ground-detail',
      width: edge,
      height: edge,
      format: `RGBA8 ×${maps} + painted mips`,
      samples: 0,
      bytes: (sampled.grass ? mipChainBytes(detail.grassSize, detail.grassSize, 4) : 0)
        + (sampled.stone ? mipChainBytes(detail.stoneSize, detail.stoneSize, 4) : 0)
        + (sampled.soil ? mipChainBytes(detail.soilSize, detail.soilSize, 4) : 0)
        + mipChainBytes(detail.broadSize, detail.broadSize, 4),
    });
  }
  if (kit.ground || kit.edgeFill || kit.blocks) {
    out.push({
      name: 'ground-block-attributes (budget)',
      width: 0,
      height: 0,
      format: 'vertex attributes',
      samples: 0,
      bytes: ULTRA_ENVELOPE.attributeBytes,
    });
  }
  return out;
}

/**
 * The byte model a rung is judged and reported on: `steady` is the sum of
 * `ultraTargetBytes`, and `peakSwitch` adds what exists only while the world
 * is being switched on — the PMREM ping-pong target (the same size as the
 * cube-UV one) and the half-float equirect source it filters (8 B/texel at
 * `ULTRA.env.width × height`). The ordinary 2048 near map and 1024 sky are
 * disposed before their Ultra replacements allocate, and one world is built
 * at a time (§5), so neither is counted twice.
 */
export function ultraBytes(
  recipe: UltraRecipe,
  buffer: { width: number; height: number } = ULTRA_JUDGE_BUFFER,
): { steady: number; peakSwitch: number } {
  let steady = 0;
  for (const target of ultraTargetBytes(recipe, buffer)) steady += target.bytes;
  let transient = 0;
  if (recipe.ultra.lighting) {
    transient += pmremTarget(pmremCubeSize(ULTRA.env.width)).bytes;
    transient += ultraEnvironmentSourceBytes();
  }
  return { steady, peakSwitch: steady + transient };
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

/** One envelope axis a rung is over, and by how much. */
export interface UltraBreach {
  readonly axis: UltraEnvelopeAxis;
  readonly value: number;
  readonly ceiling: number;
}

/** A rung as `judgeUltra` priced it — the §6.2 shape plus the working. */
export interface UltraRungVerdict {
  readonly id: UltraRecipeId;
  /** The rung with any override applied — what would be built. */
  readonly recipe: UltraRecipe;
  readonly cost: UltraFrameCost;
  readonly breaches: readonly UltraBreach[];
  /** Steady Ultra-owned bytes, the `bytes` axis. */
  readonly bytes: number;
  /** The largest texture edge the rung allocates — what the capability probe needs. */
  readonly textureEdge: number;
}

/** `judgeUltra`'s answer: the §6.2 shape, with each rung's working. */
export interface UltraJudgement {
  readonly recipe: UltraRecipe | null;
  readonly cost: UltraFrameCost | null;
  readonly refusal: UltraRefusal | null;
  readonly rungs: readonly UltraRungVerdict[];
}

/**
 * Price one rung and list its breaches, in `ULTRA_ENVELOPE_AXES` order.
 *
 * `programs` is never judged here: it is a fact about the compiled scene and
 * is held live (`ultraEnvelope.ts`). `shadowMap` is the near map the rung
 * allocates — 0 when the rung does not own one (a `-lighting` diagnostic
 * draws with High's ordinary rig, which is not Ultra's to judge).
 */
export function judgeUltraRung(plan: LevelPlan, recipe: UltraRecipe): UltraRungVerdict {
  const cost = ultraCost(plan, recipe);
  const targets = ultraTargetBytes(recipe, ULTRA_JUDGE_BUFFER);
  let bytes = 0;
  let textureEdge = 0;
  let shadowMap = 0;
  for (const target of targets) {
    bytes += target.bytes;
    textureEdge = Math.max(textureEdge, target.width, target.height);
    if (target.name === 'near-shadow') shadowMap = target.width;
  }
  const values: Record<UltraEnvelopeAxis, number | null> = {
    soloDraws: cost.solo.drawCalls,
    soloTriangles: cost.solo.triangles,
    propDraws: cost.props.drawCalls,
    propTriangles: cost.props.triangles,
    bytes,
    programs: null,
    shadowMap,
  };
  const breaches: UltraBreach[] = [];
  for (const axis of ULTRA_ENVELOPE_AXES) {
    const value = values[axis];
    const ceiling = ULTRA_ENVELOPE[axis];
    if (value !== null && value > ceiling) breaches.push({ axis, value, ceiling });
  }
  return { id: recipe.id, recipe, cost, breaches, bytes, textureEdge };
}

/**
 * Which rung a world is built with, or `null`: the first rung, richest first,
 * with no breach whose largest texture the device can hold. Pure, and
 * exported so the ladder's rule is tested on its own terms rather than only
 * through whatever the current catalogue happens to make breach.
 */
export function pickUltraRung(
  rungs: readonly Pick<UltraRungVerdict, 'breaches' | 'textureEdge'>[],
  maxTextureSize: number,
): number | null {
  for (let index = 0; index < rungs.length; index += 1) {
    const rung = rungs[index];
    if (rung.breaches.length === 0 && rung.textureEdge <= maxTextureSize) return index;
  }
  return null;
}

/**
 * Admission for Ultra, per world (§5 enforcement layer 1).
 *
 * Every rung of `ULTRA_LADDER` is priced with the override applied — the
 * refused ones too, so the diagnostics panel and the render-cost report can
 * say *why* — and then:
 *
 * 1. **Capability** (session-sticky): no WebGL2, no half-float render
 *    target, or a `MAX_TEXTURE_SIZE` smaller than every rung's largest
 *    target (4096 for the near map) refuses Ultra outright.
 * 2. **Envelope** (world-scoped): the first rung with no breach is built.
 *    If none fits, the refusal names the *last* rung's first breach — the
 *    cheapest rung is the one that finally failed, so its axis is the one
 *    that says what would have to change.
 *
 * Only a rung's own texture needs count: a device that can hold the full
 * rung's 4096 map is never refused because a cheaper rung exists, and a
 * `-lighting` diagnostic that allocates no 4096 map is not refused on a
 * device that cannot.
 */
export function judgeUltra(
  plan: LevelPlan,
  caps: UltraCaps,
  override?: UltraKitOverride | null,
): UltraJudgement {
  const rungs = ULTRA_LADDER.map((rung) => judgeUltraRung(plan, applyKitOverride(rung, override ?? null)));
  const refuse = (refusal: UltraRefusal): UltraJudgement => ({ recipe: null, cost: null, refusal, rungs });

  if (!caps.webgl2) return refuse({ kind: 'capability', missing: 'webgl2' });
  if (!caps.halfFloatRenderable) return refuse({ kind: 'capability', missing: 'half-float-render' });
  const fitting = rungs.filter((rung) => rung.textureEdge <= caps.maxTextureSize);
  if (fitting.length === 0) return refuse({ kind: 'capability', missing: 'max-texture-size' });

  const chosen = pickUltraRung(rungs, caps.maxTextureSize);
  if (chosen !== null) {
    const rung = rungs[chosen];
    return { recipe: rung.recipe, cost: rung.cost, refusal: null, rungs };
  }
  // Every rung the device can hold breaches, so the last of them has a first
  // breach to name.
  const last = fitting[fitting.length - 1];
  const breach = last.breaches[0];
  return refuse({ kind: 'envelope', axis: breach.axis, value: breach.value, ceiling: breach.ceiling });
}
