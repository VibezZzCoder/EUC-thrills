/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { deepFreeze } from '../shared/freeze.ts';
import { positionHash01 } from '../shared/maths.ts';
import { BUILDING_FACADE, PROP_SIZES, type PropKind } from './props.ts';
import { MATERIALS, SURFACES } from './surfaces.ts';

/**
 * What the renderer costs, as plain numbers the sealed half can read.
 *
 * **M12 Phase 0** (`docs/PLANS.md` §10). The §9 render budget becomes one of
 * the generator's validation contracts, which means `level/` has to be able to
 * answer "what would this route cost to draw" — and `level/` may not import
 * three.js (invariant 1) or anything under `render/` (invariant 5). So the
 * measurement lives in `render/renderCost.ts`, the *numbers* live here, and
 * `render/renderCost.test.ts` fails if the two ever disagree.
 *
 * **Nothing below is hand-maintained.** Every figure was measured from the real
 * built scene, and the test regenerates the measurement and compares. That is
 * the mitigation `docs/PLANS.md` §12 names for the top render risk: a cost
 * model that drifts from reality is a budget that passes while the frame dies.
 *
 * ## The shape of the model, which is the interesting part
 *
 * Draw calls and triangles scale completely differently here, and the whole
 * render-scaling half of M12 turns on the difference:
 *
 *   - **Triangles are additive.** Every metre of corridor, every collider, and
 *     every prop adds its own. A route twice as long costs about twice as much.
 *   - **Draw calls are a set union, not a sum.** The heightfield is *one* mesh
 *     with one material group per surface *present*; the blocks are one mesh
 *     per material *present*; the props are one `InstancedMesh` per part
 *     *present*; the paint is one mesh for the whole level. Nothing is
 *     per-segment. A route ten times as long that uses the same surfaces,
 *     materials, and prop kinds costs **exactly the same number of draw calls**.
 *
 * So a generated route's draw-call cost is bounded above by the library it
 * draws from, not by its length — `LIBRARY_MAX_DRAW_CALLS` below is that bound,
 * and it is a handful of calls above what the hand-authored slice already
 * spends. Triangles are where a long route actually threatens the budget, and
 * they are what the Phase 2 contract has teeth on.
 */

/** The instanced parts `render/props.ts` builds. One `InstancedMesh` each. */
export type PropPartId =
  | 'trunk'
  | 'crown'
  | 'coniferFoliage'
  | 'shrub'
  | 'lampPost'
  | 'lampHead'
  | 'benchWood'
  | 'benchMetal'
  | 'litterBin'
  | 'bollardCap'
  | 'signPost'
  | 'signPlate'
  | 'fenceBay'
  | 'buildingBody'
  | 'buildingTall'
  | 'buildingCap';

export const PROP_PART_IDS: readonly PropPartId[] = deepFreeze([
  'trunk', 'crown', 'coniferFoliage', 'shrub', 'lampPost', 'lampHead',
  'benchWood', 'benchMetal', 'litterBin', 'bollardCap', 'signPost', 'signPlate',
  'fenceBay', 'buildingBody', 'buildingTall', 'buildingCap',
]);

export interface PartCost {
  /** Colour-pass triangles per instance. */
  readonly triangles: number;
  /**
   * Whether this part is drawn a second time into the shadow cascade.
   *
   * An instanced mesh's bounding sphere spans the world, so the shadow camera
   * never culls one: a casting part is drawn in full every frame, however far
   * its instances are from the cascade. A casting part therefore costs two draw
   * calls and twice its triangles, which is why the flag is part of the cost
   * model rather than a rendering detail.
   */
  readonly castsShadow: boolean;
}

/** Measured from the built kit. `render/renderCost.test.ts` regenerates it. */
export const PART_COSTS: Readonly<Record<PropPartId, PartCost>> = deepFreeze({
  trunk: { triangles: 24, castsShadow: true },
  crown: { triangles: 40, castsShadow: true },
  coniferFoliage: { triangles: 36, castsShadow: true },
  shrub: { triangles: 20, castsShadow: true },
  lampPost: { triangles: 36, castsShadow: true },
  lampHead: { triangles: 12, castsShadow: false },
  benchWood: { triangles: 24, castsShadow: true },
  benchMetal: { triangles: 24, castsShadow: true },
  litterBin: { triangles: 64, castsShadow: true },
  bollardCap: { triangles: 20, castsShadow: false },
  signPost: { triangles: 24, castsShadow: true },
  signPlate: { triangles: 24, castsShadow: false },
  fenceBay: { triangles: 36, castsShadow: true },
  buildingBody: { triangles: 60, castsShadow: false },
  buildingTall: { triangles: 172, castsShadow: false },
  buildingCap: { triangles: 12, castsShadow: false },
});

/**
 * Which parts each kind lands in, for every kind whose answer is a constant.
 *
 * `building` is absent because its answer is not a constant — see
 * `propPartCounts`. Everything else is one instance of each listed part.
 */
export const SIMPLE_PROP_PARTS: Readonly<Partial<Record<PropKind, readonly PropPartId[]>>> = deepFreeze({
  broadleafTree: ['trunk', 'crown'],
  treeCanopy: ['crown'],
  conifer: ['coniferFoliage'],
  shrub: ['shrub'],
  lampPost: ['lampPost', 'lampHead'],
  bench: ['benchWood', 'benchMetal'],
  litterBin: ['litterBin'],
  bollardCap: ['bollardCap'],
  signpost: ['signPost', 'signPlate'],
  fenceBay: ['fenceBay'],
});

/** The default a building falls back to when it carries no metric size. */
const DEFAULT_BUILDING_SIZE = { x: 12, y: 18, z: 12 } as const;

/** Which facade a box of this height wears. */
function facadeFor(height: number): PropPartId {
  return height >= BUILDING_FACADE.highRiseHeight ? 'buildingTall' : 'buildingBody';
}

/**
 * Whether a building carries its setback tower, and which facade the tower wears.
 *
 * **The one prop whose cost is not a constant.** The tower is decided by a hash
 * of the block's own position — a skyline is only interesting because no two of
 * its blocks are the same shape — and then suppressed when the shared facade
 * would turn its bands into sub-human stripes. Both halves are reproduced here
 * rather than approximated, because a budget that guessed would either reject
 * valid routes or pass over-budget ones, and the whole point of Phase 0 is that
 * the model came from measurement.
 *
 * `render/props.ts` remains the only file that *emits* the tower. This predicts
 * it, and `render/renderCost.test.ts` asserts the prediction matches the
 * instance counts the built scene actually contains, prop for prop.
 */
export function buildingTowerPart(
  size: { readonly x: number; readonly y: number; readonly z: number },
  x: number,
  z: number,
): PropPartId | null {
  if (positionHash01(x, z, 9) <= 0.55) return null;
  const towerHeight = size.y * PROP_SIZES.building.towerHeightFraction;
  const facade = facadeFor(towerHeight);
  const floors = facade === 'buildingTall' ? BUILDING_FACADE.highFloors : BUILDING_FACADE.lowFloors;
  if (towerHeight / floors < BUILDING_FACADE.minFloorHeight) return null;
  return facade;
}

/** A prop, as much of one as this model needs to see. */
export interface CostableProp {
  readonly kind: PropKind;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly size?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * Exactly which instanced parts one prop contributes, and how many of each.
 *
 * The counts, summed over a plan's props, are the instance counts the built
 * scene contains — which is the claim `render/renderCost.test.ts` checks
 * against the real slice rather than trusting.
 */
export function propPartCounts(
  prop: CostableProp,
  into: Map<PropPartId, number> = new Map(),
): Map<PropPartId, number> {
  const add = (part: PropPartId): void => {
    into.set(part, (into.get(part) ?? 0) + 1);
  };

  const simple = SIMPLE_PROP_PARTS[prop.kind];
  if (simple !== undefined) {
    for (const part of simple) add(part);
    return into;
  }

  const size = prop.size ?? DEFAULT_BUILDING_SIZE;
  add(facadeFor(size.y));
  add('buildingCap');
  const tower = buildingTowerPart(size, prop.position.x, prop.position.z);
  if (tower !== null) add(tower);
  return into;
}

/**
 * The geometry the level itself contributes, per unit of it.
 *
 * Each of these was read off the built scene rather than off the source: a
 * kerb is twelve triangles because a box is twelve triangles, and a heightfield
 * cell is two because `render/terrain.ts` splits every cell along the diagonal
 * `simulation/planSampler.ts` interpolates within.
 */
export const LEVEL_GEOMETRY_COST = deepFreeze({
  /** One box collider, drawn merged into its material's mesh. */
  trianglesPerCollider: 12,
  /** One drawn heightfield cell. */
  trianglesPerTerrainCell: 2,
  /** One drawn patch of the coarse surround field. */
  trianglesPerFieldPatch: 2,
  /** The rider-following backstop plane under the world: one mesh, one quad. */
  backstopDrawCalls: 1,
  backstopTriangles: 2,
  /** The coarse surround field: one mesh whatever its size. */
  fieldDrawCalls: 1,
  /** All the road paint in the level, in one mesh. Zero when there is none. */
  markingDrawCalls: 1,
  /**
   * The hazard family, in two meshes: all the crushed asphalt in one and all
   * the standing water in the other. Each is zero when the level holds nothing
   * of that kind — the hand-authored slice and proving ground do not, while
   * generated routes have carried hazards since M13 Phase 3.
   *
   * Two rather than one because roughness is the one material property a vertex
   * colour cannot carry, and water that is not smooth is a stain
   * (`render/hazards.ts`). The pothole pools and the spill puddles share the
   * second call rather than taking one each.
   */
  hazardGroundDrawCalls: 1,
  hazardWaterDrawCalls: 1,
  /**
   * Triangles per drawn pothole, whatever its radius.
   *
   * A constant because `POTHOLE.radialSegments` is: one fan of `n` plus three
   * bands of `2n` is `7n`, and the ring count deliberately does not follow the
   * footprint. Measured off the built mesh in `render/renderCost.test.ts` like
   * everything else here, so a change to the profile's ring list fails a test
   * rather than drifting the budget.
   */
  trianglesPerPothole: 112,
  /**
   * Triangles for the standing water in one *deep* pothole: a fan of
   * `POTHOLE.radialSegments` plus one band out to its meniscus, so `3n`. A
   * shallow pothole stays a dry break and costs none of these.
   */
  trianglesPerPotholePool: 48,
  /**
   * Triangles for one spill's puddle: a fan of `PUDDLE.radialSegments` plus one
   * band per ring gap out to the fringe, so `5n`.
   *
   * A spill's *grip* is still its heightfield cells and is already counted per
   * cell; this is only the drawn water lying on them.
   */
  trianglesPerSpillPuddle: 120,
  /**
   * Draw calls for the whole Knockabout target family — M14.
   *
   * **One, however many targets a route carries**, because every stand is the
   * same rigid object and the family is one `InstancedMesh`. That is what makes
   * target *count* a pacing question rather than a frame question, and it is
   * the half of the plan's budget verdict this constant is holding up: the
   * family gets two of the six calls the frame had spare, and the paddle gets
   * the other two.
   *
   * The family does not cast, for `render/hazards.ts`'s reason and one of its
   * own: a shadow is the second draw call the budget does not have, and a
   * shadow would argue the stand is architecture the wheel could hit. It is not
   * a collider and never becomes one (`level/plan.ts`).
   */
  targetDrawCalls: 1,
  /**
   * Triangles per drawn target, whatever the route does with it.
   *
   * Constant because the stand is: a post, an arm, a pad and a rim, at fixed
   * segment counts. Measured off the built mesh in `render/renderCost.test.ts`
   * like everything else here, so a change to the shape fails a test instead of
   * drifting the budget.
   */
  trianglesPerTarget: 384,
  /**
   * Triangles per painted ribbon quad.
   *
   * A ribbon is a strip of quads, two triangles each, and `markings.ts` emits
   * one quad per interval between consecutive sampled points of a run. A dashed
   * line emits them only inside its dashes. The generator predicts a run's cost
   * from the plan's own emitted polylines rather than re-deriving the dash
   * walk, so this is the multiplier and `level/renderBudget.ts` supplies the
   * count.
   */
  trianglesPerMarkingQuad: 2,
});

/**
 * What the rest of the frame costs, measured in the most expensive state the
 * player can reach: a timed run with the gates up and a saved ghost on course.
 *
 * The rider rig, the ghost, the checkpoint gates, both particle fields, and
 * three's own background pass. Free ride costs materially less because the
 * ghost and the gates both start hidden and an invisible subtree draws nothing
 * — but a budget is written against the expensive state, not the cheap one.
 *
 * Regenerated by `node tools/render-cost.mjs --write`, and asserted equal to a
 * fresh `measureNonLevelScene` by `render/renderCost.test.ts`.
 *
 * **The two numbers below sit on consecutive lines and nothing may come between
 * them.** The regenerator finds them with a single pattern that spells the
 * whole object out, so a comment between the fields makes
 * `node tools/render-cost.mjs --write` throw `could not locate
 * NON_LEVEL_RESERVE` — which is how the M14 pass found this: a comment recording
 * the M14.5 triangle growth had been left inside the object and the tool had
 * been unusable ever since. Notes about what moved and why belong here, above
 * `deepFreeze`.
 *
 * What has moved, most recent first:
 *
 *   - **The Dorkins visual pass (2026-08-13): 26,150 → 28,058 triangles, zero
 *     draw calls.** The owner's second look at the cop, built entirely on the
 *     free axes: clear glasses with pupils, a nose, ears, chin straps, a nape
 *     of hair and a smirk merged into the one face mesh; a two-row chequer,
 *     badge, mic, cord and belt pouches merged into the one markings mesh;
 *     shorts, knee pads, socks and sneakers as vertex paint on the limb
 *     meshes (`RiderLook.paint`); the headlamp as vertex paint on his own
 *     shell copy. The cop stays at 26 calls, still exactly at the library
 *     ceiling.
 *   - **M18 adversarial QA (2026-08-13): 87 → 88 draw calls, 25,704 →
 *     26,150 triangles.** Officer Dorkins gained one merged skin-and-features
 *     face beneath an open bicycle helmet; the original full-face helmet had
 *     his glasses and moustache painted onto its shell. The cop is now 26
 *     calls, exactly at the library-derived ceiling recorded in `AGENTS.md`.
 *   - **M14 (2026-08-12): 83 → 85 draw calls.** The paddle. One casting mesh on
 *     the rider's grip is a colour call and a shadow call, which is exactly the
 *     two the M14 budget verdict allowed it. Triangles grew by the merged
 *     shaft, face and rim.
 *   - **The second Trollina look pass (2026-08-10): 21,342 → 23,836
 *     triangles.** Her fuller hair, face and cap sleeves grew the worst-look
 *     triangle reserve; draw calls did not move.
 */
export const NON_LEVEL_RESERVE = deepFreeze({
  drawCalls: 88,
  triangles: 28_058,
});

/**
 * The §9 ceilings, as machine-readable numbers.
 *
 * `docs/PLANS.md` §9 and `AGENTS.md` are the authority; this is the copy the
 * validator compares against, and `render/renderCost.test.ts` asserts the two
 * still agree with the documents by naming them here.
 *
 * **Frame interval and FPS are deliberately absent.** No agent reports them
 * (`AGENTS.md`), and a contract that cannot be evaluated headlessly has no
 * business inside a generator.
 */
export const RENDER_BUDGET = deepFreeze({
  maxDrawCalls: 150,
  maxTriangles: 400_000,
});

/**
 * The most draw calls any level built from the whole library can cost.
 *
 * Every surface the game has, every block material, every prop part, the paint,
 * the field, and the backstop — each counted once, and twice for the parts that
 * cast. It is the ceiling a *route* cannot exceed **however long it grows**,
 * which is the structural reason draw calls are not the scaling risk that
 * triangles are: the only way a generated route can add a draw call is by
 * reaching for a kind of thing the level did not already contain, and the
 * library is finite.
 *
 * **Derived, not written down.** A hand-typed ceiling would be wrong the first
 * time a surface or a prop part is added, and wrong in the dangerous direction.
 */
export const LIBRARY_MAX_DRAW_CALLS = (() => {
  let colour = Object.keys(SURFACES).length
    + Object.keys(MATERIALS).length
    + PROP_PART_IDS.length
    + LEVEL_GEOMETRY_COST.markingDrawCalls
    + LEVEL_GEOMETRY_COST.hazardGroundDrawCalls
    + LEVEL_GEOMETRY_COST.hazardWaterDrawCalls
    + LEVEL_GEOMETRY_COST.targetDrawCalls
    + LEVEL_GEOMETRY_COST.fieldDrawCalls
    + LEVEL_GEOMETRY_COST.backstopDrawCalls;
  // Every merged block mesh casts; a prop part casts if its own table says so.
  // Both hazard meshes and the M14 target family are deliberately absent from
  // this half: none of the three casts, so they are the cheapest things the
  // library can add.
  let shadow = Object.keys(MATERIALS).length;
  for (const part of PROP_PART_IDS) if (PART_COSTS[part].castsShadow) shadow += 1;
  return colour + shadow;
})();
