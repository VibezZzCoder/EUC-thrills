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
  | 'buildingLow'
  | 'buildingTall'
  | 'buildingCap'
  | 'tyreStack'
  | 'gantrySpan';

export const PROP_PART_IDS: readonly PropPartId[] = deepFreeze([
  'trunk', 'crown', 'coniferFoliage', 'shrub', 'lampPost', 'lampHead',
  'benchWood', 'benchMetal', 'litterBin', 'bollardCap', 'signPost', 'signPlate',
  'fenceBay', 'buildingBody', 'buildingLow', 'buildingTall', 'buildingCap',
  'tyreStack', 'gantrySpan',
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
  buildingLow: { triangles: 28, castsShadow: false },
  buildingTall: { triangles: 172, castsShadow: false },
  buildingCap: { triangles: 12, castsShadow: false },
  tyreStack: { triangles: 128, castsShadow: true },
  // 984 rather than B1's 552 because the banner reads BELVAR CIRCUIT rather
  // than BELVAR: a stroke becomes one box per segment, and the venue's full
  // name is 65 segments where its first word was 29. One instance in the
  // world, so it is 432 triangles on the frame and no draw call at all.
  gantrySpan: { triangles: 984, castsShadow: true },
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
  tyreStack: ['tyreStack'],
  gantrySpan: ['gantrySpan'],
});

/** The default a building falls back to when it carries no metric size. */
const DEFAULT_BUILDING_SIZE = { x: 12, y: 18, z: 12 } as const;

/**
 * Which facade a box of this height wears.
 *
 * Three ways rather than two: a body under `lowRiseHeight` cannot carry
 * `lowFloors` bands without them falling under `minFloorHeight`, which is the
 * defect BelVar's paddock sheds shipped with.
 */
function facadeFor(height: number): PropPartId {
  if (height >= BUILDING_FACADE.highRiseHeight) return 'buildingTall';
  return height >= BUILDING_FACADE.lowRiseHeight ? 'buildingBody' : 'buildingLow';
}

/**
 * Which facade a *setback tower* wears — deliberately still the old two.
 *
 * A short tower is suppressed rather than given the low-rise facade, because
 * the suppression is a statement about roof features and not about band
 * heights: letting five-metre towers appear now that a facade fits them would
 * change every skyline in the city as a side effect of fixing a paddock.
 */
function towerFacadeFor(height: number): PropPartId {
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
  const facade = towerFacadeFor(towerHeight);
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
 *   - **Wheel in Motion's hip dome (2026-09-03, after the Drunkard's
 *     release): the quad reserve 136,620 → 137,244 triangles, the split
 *     reserve and every draw call unmoved.** The owner checked the rest of
 *     the roster for the Drunkard's leg gap and found it on the other rider
 *     whose trousers are not black; his thighs now close in the same 60 mm
 *     dome and his seat's hem is 30 mm lower. Four rings on each thigh and
 *     one on the seat; he is in the worst four looks, so the quad reserve
 *     carries it, and not in the worst pair, so the split does not.
 *   - **The Drunkard after the owner's first ride and Codex's QA
 *     (2026-09-03): the quad reserve 134,044 → 136,620 and the split
 *     reserve 85,698 → 88,274 triangles, zero draw calls on all three.**
 *     His face extra now casts (the skull is in it, and a non-casting face
 *     was a ghost with a hat floating over a neck), so the ghost draws its
 *     2,432 triangles once per scene; his thighs close in a hip dome and
 *     his seat's hem is 30 mm lower (the leg gap in tight corners); the
 *     pint over the pack is gone (the head's arc owned it) and the pack
 *     closes with a 16 mm lid. On his own he is 21 meshes / 39 calls
 *     (Cool Rider: 24 / 40) — the one call is the face's shadow pass.
 *   - **The Drunkard's look — M29 Phase 2 (2026-09-03): the quad reserve
 *     123,068 → 126,286 triangles at the build, 128,164 after gauntlet
 *     round 1 (bigger cans on brackets, a full brim, a longer outboard tube
 *     route, the vessel above the pack, the grin as four seated lofts),
 *     132,372 after round 2 and 134,044 after round 3 (the geometric foam
 *     cap, the can rings, the ear conchas, the derived grip); the split
 *     reserve 78,482 → 85,698 as the worst pair's composition changed; zero
 *     draw calls at every step; the single reserve unmoved.** The
 *     seventh rider is 21 meshes / 38 calls / 21,024 triangles on his own
 *     (19,802 before the round; Cool Rider: 24 / 40 / 10,896) — two casting
 *     extras (the hat kit: two cans, two swept tubes and the peak; the pack
 *     with its hose and valve) and one non-casting face extra in place of
 *     the shoulder, sleeve, elbow-pad and visor groups, his whole print on
 *     one sheet (`render/drunkardAtlas.ts`) and every colour on his legs
 *     and hands as paint. He is not the worst look on any axis alone
 *     (Maribel holds triangles), and not in the worst pair; he is in the
 *     worst four, which is where the tubes' triangles land — once per
 *     seat, as §27.5's arithmetic says.
 *   - **Maribel's look and her wheel — M23 Phase A1b/A2 (2026-08-18): 33,648 →
 *     36,112 triangles, zero draw calls.** The one look on the roster whose
 *     mesh-parity target the owner waived outright — *"break the graphics
 *     budget… Her looking good is priority one"* — and the interesting result
 *     is how little of that permission the frame needed. Everything her
 *     redesign added went onto the free axes: her printed chest, her leg
 *     script, her knee devices, her visor gradient and her wheel's badge are
 *     **one texture** shared by two materials that were already being drawn,
 *     and a texture is not a mesh; her sixteen-piece head of loose hair is one
 *     merged buffer in the slot the ponytail's single buffer occupied; and the
 *     rest is `RiderLook.density`, which buys sections rather than parts. So a
 *     waiver written for draw calls was spent entirely on triangles, and the
 *     rider is **still one mesh and one call fewer than Cool Rider**. Her
 *     machine is 11 meshes and 18 calls, level with the standard wheel and
 *     with both machines before it.
 *   - **Adonisb2's machine — M22 Phase 2 (2026-08-17): 32,032 → 33,648
 *     triangles, zero draw calls.** The third `MachineLook`: his blocky
 *     off-road wheel. It is **11 meshes and 18 draw calls, identical to the
 *     standard wheel and to Red Rider's**, at 6,244 triangles against the
 *     standard's 3,776 — the saddle merged into the shell mesh, the whole
 *     angry-eye plate and every accent as patches in the one trim mesh, both
 *     cream lamps in the one headlight mesh, and the livery as vertex paint.
 *     Roughly a quarter of the growth is the one thing on this machine that
 *     is deliberately geometry rather than paint: 54 tyre lugs merged into
 *     the tyre's own mesh, because a knobby tyre's whole read is its broken
 *     silhouette and paint on a shared-vertex loft blurs between columns
 *     (`docs/PLANS.md` §22.7). The reserve counts his machine twice — the rig
 *     and the Time-trial ghost each build one — which is why 2,428 triangles
 *     of machine move the frame by more than 2,428.
 *   - **Red Rider's machine — M19 Phase 3 (2026-08-14): 29,672 → 31,756
 *     triangles, zero draw calls.** The second `MachineLook`
 *     (`render/machineLook.ts`): his customized red wheel, built the way the
 *     plan budgeted it — livery as vertex paint (free), the saddle merged
 *     into the shell mesh in the carry handle's place, and the cowl, corner
 *     guards and nameplates as patches in the one trim mesh the accent
 *     strips already paid for. His machine is 11 meshes and 18 calls,
 *     identical to the standard wheel, at 5,860 total triangles against its
 *     3,776 — and the Phase 2 axis refactor that made a second machine
 *     possible moved *nothing* (the reserve regenerated to the same 29,672
 *     it started the day at, which was the point of doing it separately).
 *   - **The harness continuity QA pass (2026-08-14): 29,132 → 29,672
 *     triangles, zero draw calls.** The chest rig re-authored as continuous
 *     load paths — see the CHANGELOG entry of the same day.
 *   - **Red Rider's accessory pass (2026-08-14): 28,058 → 29,132 triangles,
 *     zero draw calls.** The owner's review of the first build was that it was
 *     "still a loose interpretation" and that every accessory in the reference
 *     had to be represented. All of it went onto the free axes, and the rider
 *     reserve moved because he is now the worst *look* on the triangle axis
 *     (17,508 against Cool Rider's 14,672) while remaining equal to him on
 *     calls: an off-centre action camera and its mount, a second pouch, the
 *     diagonal bandolier, vest flanks and two hanging strap tails merged into
 *     the one harness mesh; a shoulder cap into the yoke; full forearm and
 *     shin plates with their straps into the elbow and knee groups, which
 *     mount on the forearm and shin profiles and had been carrying a single
 *     small pad each; three uneven sleeve stripes; chin vents; a wider
 *     wrapping visor. His thigh graphic, red knuckles, guard accent channel
 *     and boot panel lines are vertex paint (`RiderLook.paint`, which gained a
 *     `hand` hook and a `side` argument for this). **He is still 35 meshes and
 *     58 draw calls — identical to Cool Rider.**
 *
 *     It peaked at 29,188 mid-pass and came back down: the owner's second
 *     screenshot caught a pale buckle plate, a helmet pivot boss and a chest
 *     strap the bandolier made redundant, and all three were cut.
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
  triangles: 53_274,
});

/**
 * The same reserve for one pass of a **desktop split frame** — M25 Phase 3,
 * Contract 2 (`docs/PLANS.md` §25.4).
 *
 * Everything `NON_LEVEL_RESERVE` above holds, plus a whole second rider and a
 * whole second machine: a split screen is two seats, and the two rigs are both
 * in the one scene, so both are drawn in both passes. The particle pools, the
 * checkpoint gates and three's background pass are shared and counted once,
 * because that is what the scene actually holds.
 *
 * **Per pass. `SPLIT_PASSES` is what makes it a frame** — see
 * `withinSplitRenderBudget`. Measured over unordered distinct pairs of
 * playable riders (q68 forbids a repeat), each wearing the worse of the ghost
 * and cop slots, per-axis worst — the same discipline as the single-player
 * reserve one object up.
 *
 * Regenerated by `node tools/render-cost.mjs --write`, and asserted equal to a
 * fresh `measureSplitNonLevelScene` by `render/renderCost.test.ts`.
 *
 * **The two numbers below sit on consecutive lines and nothing may come
 * between them**, for exactly the reason spelled out above `NON_LEVEL_RESERVE`:
 * the regenerator finds them with one pattern that spells the whole object
 * out, and a comment inside the braces makes the tool throw.
 */
export const SPLIT_NON_LEVEL_RESERVE = deepFreeze({
  drawCalls: 148,
  triangles: 88_274,
});

/**
 * The same reserve for one pass of a **four-seat quadrant frame** — M27
 * Phase 0, the scope-lock measurement (`docs/PLANS.md` §27.5–§27.6).
 *
 * Everything `SPLIT_NON_LEVEL_RESERVE` above holds, plus a third and a fourth
 * whole rider and machine; the gates, the particle pools and the background
 * still shared and still counted once. Measured over unordered distinct
 * **four-subsets** of the playable roster — five of them today — each wearing
 * the worse of the ghost and cop slots, per-axis worst: the split reserve's
 * own discipline at four rigs (`measureQuadNonLevelScene`).
 *
 * **It became a contract at M27 Phase 1**, when the owner's scope lock opened
 * on q98 = (a) — four seats everywhere, no per-world cap. `RENDER_BUDGET_QUAD`
 * below is the ceiling it bounds and `withinQuadRenderBudget` is the verdict;
 * Contracts 1 and 2 are untouched by either, and both still regenerate byte
 * for byte.
 *
 * Regenerated by `node tools/render-cost.mjs --write`, and asserted equal to a
 * fresh `measureQuadNonLevelScene` by `render/renderCost.test.ts`.
 *
 * **The two numbers below sit on consecutive lines and nothing may come
 * between them**, for exactly the reason spelled out above
 * `NON_LEVEL_RESERVE`: the regenerator finds them with one pattern that spells
 * the whole object out, and a comment inside the braces makes the tool throw.
 */
export const QUAD_NON_LEVEL_RESERVE = deepFreeze({
  drawCalls: 268,
  triangles: 137_244,
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
  /**
   * **Raised from 150 to 160 by the owner on 2026-08-19** — M23 Phase A1d.
   *
   * The number had stood since M7 and A1c ran into it head-on: the frame was
   * sitting at exactly 150 (88 reserved, 62 for the worst level), so the
   * parity waiver the owner had already granted Maribel was unspendable and
   * her build had to pay for everything in triangles and paint instead. His
   * instruction on the A1c ride settles it — *"I don't know… increase budget.
   * Make it better."*
   *
   * Ten calls, not an open cheque. What it actually buys is one casting mesh
   * on one character (her aero hump, which is why the ceiling moved at all)
   * and nine calls of headroom for the looks after her, so the next character
   * work is a design argument rather than a budget one. Triangles were not
   * touched: 400 k was never the binding constraint.
   */
  maxDrawCalls: 160,
  /**
   * **Raised from 400 k to 460 k by the owner on 2026-08-19** — M23 Phase A1d,
   * the same instruction that moved the draw-call ceiling.
   *
   * His words on the A1c ride were *"She needs more poligons… increase budget.
   * Make it better."*, and the polygons went where he named them: her figure's
   * ring count, a hand that is a hand, hair that is a mass rather than ropes.
   * The measured cost is **+36,770 triangles on the worst reserve**, which
   * took the densest known route from 78.9% of the old ceiling to 88.1% — past
   * the 80% line `level/generatedLevel.test.ts` holds as the point where
   * scaling work would be needed.
   *
   * Sixty thousand rather than a round doubling, and triangles rather than
   * draw calls, because the two axes are not alike. A draw call is CPU work
   * per frame and is what this project has always been scarce on; triangles at
   * this order of magnitude are trivial for any GPU the game targets — the
   * densest route is now 353 k, which an M1 or a recent iPhone chews through
   * far below its limit. The new ceiling puts that route at 76.6% and restores
   * the margin the 80% rule exists to protect.
   */
  maxTriangles: 460_000,
});

/**
 * How many passes a desktop split frame draws — M25 Phase 3.
 *
 * Named once rather than a `2` multiplied in at each site, and **here rather
 * than beside the measurement** because `level/renderBudget.ts` needs it and
 * that layer may not import anything that touches three.js (invariant 1).
 *
 * A split frame is two full renders of the same scene through two cameras,
 * each with its own shadow-map render, so a split frame's cost is the *sum* of
 * its passes (`docs/PLANS.md` §25.4).
 */
export const SPLIT_PASSES = 2;

/**
 * The most passes a **grid** frame draws — M27 Phase 1 (§27.5).
 *
 * **`SPLIT_PASSES` stopped being one number and became a fact per frame
 * shape.** Two seats are halves and cost two passes; three or four are a 2x2
 * grid (`shared/paneGrid.ts`) and cost three or four. So a *ceiling* needs the
 * worst of them, which is this, while a *verdict* about a particular session
 * takes the seat count — a three-seat frame is three passes judged against
 * Contract 3, not against two-thirds of it.
 *
 * Four rather than "the seat count" here for `SPLIT_PASSES`' own reason: this
 * lives beside the pinned ceilings because `level/renderBudget.ts` needs it
 * and that layer may not import anything that touches three.js (invariant 1),
 * where the real seat count lives.
 */
export const QUAD_PASSES = 4;

/**
 * **Contract 2** — the ceiling for a desktop split-screen frame, M25 Phase 3.
 *
 * A second, higher, **desktop-split-only** ceiling. The owner's direction on
 * 2026-08-21 was explicit: the split mode gets its own much higher budget and
 * the phone contract is never touched. So this is not an exemption from
 * `RENDER_BUDGET` above — it is a second contract, pinned the same way, in the
 * same file, regenerated by the same tool and asserted in the same test.
 * Every single-player frame is still governed by `RENDER_BUDGET`, one pass,
 * 160 calls, 460 k triangles, and nothing here relaxes that.
 *
 * **Chosen by measurement, not by ballpark.** §25.4 offered "roughly 420 calls
 * and 0.9 M triangles" as an estimate and said in the same breath that it was
 * an estimate rather than a conclusion. The measurement, from
 * `node tools/render-cost.mjs`:
 *
 *   - one pass of the worst shipped level: **193 calls / 280,518 triangles**
 *     (45 for the slice, plus a split reserve of 148 / 76,412 — the
 *     single-player reserve plus a whole second rider and machine, which is
 *     **+60 calls and +23,138 triangles**);
 *   - the frame, both passes: **386 calls / 561,036 triangles**.
 */
export const RENDER_BUDGET_SPLIT = deepFreeze({
  /**
   * **434 is the number that actually binds, and 460 is it rounded up.**
   *
   * The measured frame is 386, but a ceiling written against the slice would
   * be a ceiling that a generated route could walk through. The bound that
   * holds for *every* world the library can build is the same set-union
   * argument Contract 1 rests on, doubled with the passes:
   * `(LIBRARY_MAX_DRAW_CALLS + SPLIT_NON_LEVEL_RESERVE.drawCalls) * SPLIT_PASSES`
   * = (69 + 148) x 2 = **434**.
   *
   * Twenty-six calls of headroom rather than Contract 1's three, and the
   * reason is arithmetic rather than generosity: **every new character costs
   * twice here**, once in each pass. The nine calls the owner's M23 raise left
   * for the characters after Maribel are eighteen calls in a split frame, and
   * a ceiling with less slack than that would make the next rider a Contract 2
   * problem before it was a design one.
   */
  maxDrawCalls: 460,
  /**
   * The measured frame is 561,036, and this is not written against it.
   *
   * `level/generatedLevel.test.ts` holds routes to 80% of Contract 1's
   * triangle ceiling — 368,000 — as the point past which scaling work would be
   * needed. A split session can be started on a generated world, so the number
   * that has to fit is the one at that line:
   * `(368,000 + 76,412) x 2` = **888,824**.
   *
   * A million, rounded up from there, leaves 11% for the next character's
   * geometry to land in twice. Triangles were never the binding axis on this
   * project — a draw call is per-frame CPU work and this is where the scarcity
   * has always been — so the round number is the honest one here.
   */
  maxTriangles: 1_000_000,
});

/**
 * **Contract 3** — the ceiling for a desktop **grid** frame, M27 Phase 1.
 *
 * A third ceiling on Contract 2's exact terms (§27.5): not an exemption from
 * either of the two above, but its own contract, in the same file, regenerated
 * by the same tool, asserted in the same test. Every single-player frame is
 * still `RENDER_BUDGET`, one pass, 160 calls, 460 k triangles; every two-seat
 * frame is still `RENDER_BUDGET_SPLIT`; and **neither moved a byte to make
 * room for this one.**
 *
 * It governs three and four seats — the shapes `paneGridFor` cuts into a 2x2
 * grid. A three-seat frame is three passes judged here rather than against
 * two-and-a-half contracts, because what makes a frame this kind of frame is
 * the grid, not the number of people in it.
 *
 * **Chosen by measurement, not by ballpark.** §27.2 offered "near 1,350 calls
 * and 1.96 M triangles" as extension arithmetic and said in the same breath it
 * was an estimate. Phase 0 measured it, from `node tools/render-cost.mjs`:
 *
 *   - the four-rig reserve: **268 calls / 115,382 triangles** per pass
 *     (§27.2's ~268 / ~122,700 — the calls exact, the triangles 6% kind);
 *   - BelVar, the venue a couch race is for, four passes: **1,220 calls /
 *     1,140,504 triangles**;
 *   - the generated worst case, four passes: **1,348 / 1,933,528**.
 *
 * The owner then answered q98 **(a): four seats everywhere, no per-world seat
 * cap** — so the number that has to fit is the *heavier* of those two, and the
 * lighter one is not a second ceiling. That decision is why this contract is
 * written against the generated worst case and not against BelVar.
 */
export const RENDER_BUDGET_QUAD = deepFreeze({
  /**
   * **1,348 is the number that actually binds, and 1,400 is it rounded up.**
   *
   * The same set-union argument Contracts 1 and 2 rest on, at four passes:
   * `(LIBRARY_MAX_DRAW_CALLS + QUAD_NON_LEVEL_RESERVE.drawCalls) * QUAD_PASSES`
   * = (69 + 268) x 4 = **1,348**. A ceiling written against the measured
   * BelVar frame instead would be one a generated route walks straight
   * through, which is q98 (a) taken back by arithmetic.
   *
   * Fifty-two calls of headroom, and the number is derived rather than
   * generous: **every new character costs four times here**, once per pass.
   * Contract 2 left 26 calls against a character's 18 — room for 1.44 of
   * them — and a quad character costs 36, so the same margin is 52. Less than
   * that and the next rider is a Contract 3 problem before it is a design one,
   * which is the trap Contract 2's own note names.
   */
  maxDrawCalls: 1_400,
  /**
   * The measured frame is 1,933,528, and this is not written against it.
   *
   * `level/generatedLevel.test.ts` holds routes to 80% of Contract 1's
   * triangle ceiling — 368,000 — as the point past which scaling work would be
   * needed, and q98 (a) means a four-seat session can be started on exactly
   * such a world. So the number that has to fit is the one at that line:
   * `(368,000 + 115,382) x 4` = **1,933,528**.
   *
   * 2.2 M keeps Contract 2's own margin rather than a rounder number:
   * a character costs 23,138 triangles a pass, Contract 2 left room for 2.4 of
   * them, and 2.4 x 92,552 is 222,125 — which lands here. Triangles have never
   * been the binding axis on this project; the discipline is that the margin
   * is *stated* rather than eyeballed.
   */
  maxTriangles: 2_200_000,
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
