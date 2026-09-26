/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Ultra collider blocks (T9) — M39 (`docs/M39_ULTRA.md` §4, §5, package W6).
 *
 * Ultra blocks gain vertical-face base AO and plank courses on wood faces at
 * least `ULTRA.blocks.minFaceHeight` tall, and keep the enhanced stone
 * coursing. Tops and lip edges are never touched and BelVar's barrier
 * vertices stay byte-identical (attributes are added, never positions).
 *
 * This file is to the Ultra blocks what `render/wallCourses.ts` is to the
 * enhanced ones: the one statement of how a face divides, read by the builder
 * (`render/terrain.ts`, `appendBox`'s Ultra options) and by the price
 * (`ultraColliderTriangles`, which `ultraCost` (W7) sums before a world is
 * admitted). Two consumers, one rule, so the model equals the built scene by
 * construction rather than by two descriptions agreeing.
 *
 * **How a vertical face divides on an Ultra world** (`ultraFaceDivision`), in
 * order:
 *
 *   1. **`concrete` and `signalRed` never re-tessellate.** They are the kerbs
 *      and BelVar's barrier (`DESIGN.md` §7l), whose positions are pinned
 *      byte-identical; they take the base AO as an attribute across their one
 *      quad.
 *   2. **Wood at least `minFaceHeight` tall takes plank courses**: rows of
 *      about `plankCourse`, each a flat tone within ±`plankTone`, so a deck
 *      side or a ramp face reads as boards rather than as a painted box.
 *   3. **A coursed stone face keeps the enhanced bond exactly** — same rows,
 *      stones and tones (`wallCourses.ts`).
 *   4. **Any other face tall enough gets one split** at `baseAoMetres`, so the
 *      base AO ramps over the bottom 0.6 m as the spec states rather than over
 *      the whole face — a four-metre gantry leg would otherwise wear a
 *      four-metre gradient.
 *   5. Everything else stays one quad.
 *
 * Every new vertex lies on the face it divides (the division is a set of
 * fractions of that face), so the drawn block is still exactly the collider
 * box — `wallCourses.test.ts` walks every vertex against the boxes.
 */
import type * as THREE from 'three';
import type { MaterialId } from '../../data/surfaces.ts';
import { ULTRA } from '../../data/tuning.ts';
import type { BoxCollider } from '../../level/plan.ts';
import { positionHash01 } from '../../shared/maths.ts';
import { colliderTriangles, isCoursed, wallFaceGrid, wallFaceQuads, type WallFaceGrid } from '../wallCourses.ts';
import { ultraShadeLiftDeclarationsGlsl, ultraShadeLiftGlsl } from './ultraGroundDetail.ts';
import type { UltraKit } from './ultraTypes.ts';

/** Materials whose block geometry Ultra never re-tessellates (kerbs, BelVar's barrier). */
export const ULTRA_BLOCK_FIXED_GEOMETRY: readonly MaterialId[] = Object.freeze(['concrete', 'signalRed'] as MaterialId[]);

/**
 * A face shorter than this share above `baseAoMetres` keeps its single quad:
 * a split just under its top would draw a sliver, and a ramp over the whole of
 * a face this short is already within a quarter of the 0.6 m the spec asks
 * for.
 */
const SPLIT_MIN_SHARE = 1.25;

/**
 * Hash seed base for the plank tones. Clear of every seed in use
 * (`wallCourses.ts` 7100+, the level dressing's single digits, the foliage
 * kit's 431); the row is added so two courses of one face are independent.
 */
const PLANK_SEED = 2900;

/** How one vertical face of an Ultra block divides. Fractions are of the face's own height. */
export type UltraFaceDivision =
  | { readonly kind: 'single' }
  | { readonly kind: 'coursed'; readonly grid: WallFaceGrid }
  | { readonly kind: 'planks'; readonly rows: number }
  | { readonly kind: 'split'; readonly at: number };

const SINGLE: UltraFaceDivision = Object.freeze({ kind: 'single' });

/**
 * The division of one vertical face `faceWidth` metres wide, on a world whose
 * kit builds Ultra blocks (the caller checks `kit.blocks`). Every vertical face
 * of a box shares the box's height; the width decides only whether a stone
 * face is wide enough to course (`wallFaceGrid`).
 */
export function ultraFaceDivision(collider: BoxCollider, material: MaterialId, faceWidth: number): UltraFaceDivision {
  const height = collider.halfExtents.y * 2;
  if (ULTRA_BLOCK_FIXED_GEOMETRY.includes(material)) return SINGLE;
  if (material === 'wood' && height >= ULTRA.blocks.minFaceHeight) {
    return { kind: 'planks', rows: Math.max(1, Math.round(height / ULTRA.blocks.plankCourse)) };
  }
  if (isCoursed(collider, material)) {
    const grid = wallFaceGrid(faceWidth, height);
    if (grid.rows !== 1 || grid.columns !== 1) return { kind: 'coursed', grid };
  }
  if (height >= ULTRA.blocks.minFaceHeight && height >= ULTRA.blocks.baseAoMetres * SPLIT_MIN_SHARE) {
    return { kind: 'split', at: ULTRA.blocks.baseAoMetres / height };
  }
  return SINGLE;
}

/** Colour-pass triangles one face of that division draws. */
function faceTriangles(division: UltraFaceDivision): number {
  switch (division.kind) {
    case 'single': return 2;
    case 'coursed': return 2 * wallFaceQuads(division.grid);
    case 'planks': return 2 * division.rows;
    case 'split': return 4;
  }
}

/**
 * Colour-pass triangles one collider draws on an Ultra world — the enhanced
 * price (`colliderTriangles`) unless the kit builds Ultra blocks, and then the
 * top and underside (two each, never divided) plus each of the four vertical
 * faces as `ultraFaceDivision` divides it. The faces whose normal is ±X run
 * along the box's Z extent and the ±Z faces along its X extent, which is the
 * pairing `appendBox` draws them in.
 */
export function ultraColliderTriangles(collider: BoxCollider, material: MaterialId, kit: UltraKit): number {
  if (!kit.blocks) return colliderTriangles(collider, material);
  const alongZ = faceTriangles(ultraFaceDivision(collider, material, collider.halfExtents.z * 2));
  const alongX = faceTriangles(ultraFaceDivision(collider, material, collider.halfExtents.x * 2));
  return 2 * 2 + 2 * alongZ + 2 * alongX;
}

/**
 * The base AO of a point on a vertical face `faceHeight` metres tall,
 * `heightAboveBase` metres above the box's underside: `mix(floor, 1,
 * smoothstep(0, baseAoMetres, h))`, or 1 on a face shorter than
 * `minFaceHeight` (a kerb keeps the exact value the kerb-contrast contract
 * asserts). Written into `ultraAo` at every block vertex and interpolated
 * between them, which is why the faces that may be divided are divided at
 * `baseAoMetres`.
 *
 * The datum is the box's underside, which is where every authored block meets
 * the ground; a block sunk into a slope loses the part of the ramp that is
 * under it, which is the part nobody sees.
 */
export function blockBaseAo(heightAboveBase: number, faceHeight: number): number {
  if (faceHeight < ULTRA.blocks.minFaceHeight) return 1;
  const t = Math.min(1, Math.max(0, heightAboveBase / ULTRA.blocks.baseAoMetres));
  const smooth = t * t * (3 - 2 * t);
  return ULTRA.blocks.baseAoFloor + (1 - ULTRA.blocks.baseAoFloor) * smooth;
}

/**
 * The flat tone of one plank course, from the face it belongs to and its row.
 *
 * Keyed on the face's own midpoint in world XZ so two faces of one deck, and
 * two decks, do not share a rhythm, and a rebuild of the same plan paints the
 * same boards (an integer hash, `positionHash01`; no `Math.random`).
 */
export function plankTone(faceX: number, faceZ: number, row: number): number {
  return 1 + ULTRA.blocks.plankTone * (positionHash01(faceX, faceZ, PLANK_SEED + row) * 2 - 1);
}

// ---------------------------------------------------------------------------
// The block response (Wave 3, R-G: gauntlet round 1 items 1 and 7)
// ---------------------------------------------------------------------------

/** A GLSL float literal. */
function glslFloat(value: number): string {
  const text = String(Math.round(value * 1e7) / 1e7);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
}

/** The anchors the block patch needs, in the program text after the shared patch has run. */
export const ULTRA_BLOCK_ANCHORS = Object.freeze({
  fragmentDeclarations: '#include <dithering_pars_fragment>',
  fragmentLight: '#include <aomap_fragment>',
} as const);

/**
 * The block family's own response, after `#include <aomap_fragment>`.
 *
 * - **Vertical faces** take `ULTRA.shade.blockSideFill` of the environment's
 *   diffuse fill and `blockSideSpec` of its sky sheen. The painted sky's bright horizon and the β-lifted bounce
 *   had raised the shaded faces of steps, kickers and bollards (Switchback's
 *   kicker 30 → 58) until an obstacle merged into the ground in front of it
 *   — what the readability hawk named four times in round 1.
 * - **Tops** are ground-like: a smaller sky-sheen share than the ground's
 *   (`blockTopSpec`, so a step's smoother deck wood at a grazing view does not
 *   glow off the trail it stands on) and the ground's static-shade lift (so a
 *   kerb top in a canyon keeps its ratio to the lifted road beside it).
 *
 * Geometry is untouched: tops, lips and BelVar's barrier vertices are the
 * ordinary builder's.
 */
function blockLight(): string {
  const s = ULTRA.shade;
  return /* glsl */ `
	{
		vec3 ultraBlockN = transformNormalByInverseViewMatrix( nonPerturbedNormal, viewMatrix );
		float ultraBlockSide = 1.0 - smoothstep( 0.3, 0.7, abs( ultraBlockN.y ) );
		float ultraBlockTop = smoothstep( ${glslFloat(s.upFacing[0])}, ${glslFloat(s.upFacing[1])}, ultraBlockN.y );
		reflectedLight.indirectDiffuse *= mix( 1.0, ${glslFloat(s.blockSideFill)}, ultraBlockSide );
		reflectedLight.indirectSpecular *= mix( 1.0, ${glslFloat(s.blockSideSpec)}, ultraBlockSide ) * mix( 1.0, ${glslFloat(s.blockTopSpec)}, ultraBlockTop );
	}
${ultraShadeLiftGlsl(s.upFacing)}
`;
}

const BLOCK_DECLARATIONS = /* glsl */ `
// ---- M39 Ultra blocks (render/ultra/ultraBlocks.ts) ----
${ultraShadeLiftDeclarationsGlsl()}
`;

function replaceOnce(source: string, anchor: string, replacement: string, where: string): string {
  const at = source.indexOf(anchor);
  if (at < 0) throw new Error(`Ultra block patch anchor missing from ${where}: ${anchor}`);
  return source.slice(0, at) + replacement + source.slice(at + anchor.length);
}

/** The block fragment patch, applied after the shared Ultra patch. */
export function patchUltraBlockFragment(source: string): string {
  const a = ULTRA_BLOCK_ANCHORS;
  let out = replaceOnce(source, a.fragmentDeclarations, `${BLOCK_DECLARATIONS}\n${a.fragmentDeclarations}`, 'the block fragment shader');
  out = replaceOnce(out, a.fragmentLight, `${a.fragmentLight}\n${blockLight()}`, 'the block fragment shader');
  return out;
}

/**
 * Install the block response on a block material that already carries the
 * shared Ultra patch (`ultraBlockMaterial`, under `kit.lighting`): chain its
 * `onBeforeCompile`. The text depends on nothing but the table, so the block
 * family's one program key stays honest.
 */
export function installUltraBlockPatch(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const shared = material.onBeforeCompile;
  // A define of its own, so the family key (`m39-ultra-block-…`) plus three's
  // define fold tells a responding block program from a plain one.
  material.defines = { ...(material.defines ?? {}), ULTRA_BLOCK_RESPONSE: '' };
  material.userData.ultraBlockResponse = true;
  material.onBeforeCompile = (shader, renderer): void => {
    shared.call(material, shader, renderer);
    shader.fragmentShader = patchUltraBlockFragment(shader.fragmentShader);
  };
  return material;
}
