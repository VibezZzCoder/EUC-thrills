/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { MarkingPaint } from '../data/markings.ts';
import type { PropKind } from '../data/props.ts';
import type { MaterialId } from '../data/surfaces.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';

/**
 * LevelPlan — the plain, serializable description of a level.
 *
 * Architecture invariant 2: level/ emits data, never meshes. `simulation/`
 * builds colliders and the surface lookup from a LevelPlan; `render/` builds
 * meshes, materials, and lights from the same LevelPlan. Two consumers of one
 * structure cannot drift.
 *
 * **M4 is where that stopped being a claim.** Until now the renderer built its
 * own placeholder ground from the same constants — the same geometry stated
 * twice, which is the most that can be true before terrain exists. The
 * placeholder is gone: `render/terrain.ts` builds its ground from the
 * heightfield below, `simulation/planSampler.ts` samples that same heightfield,
 * and there is no longer a second copy of the ground anywhere in the codebase.
 *
 * The shape grew at M7 (the ten beats), at M7.5 with renderable `Prop` data,
 * and at M8.6 with separately derived `solids` for the kinds that stop a rider.
 * Simulation never reads a prop mesh description and rendering never draws a
 * collider proxy; both consume their own plain-data view of the same resolved
 * placement. Checkpoints are still M10's and the generation report is still
 * M12's. Nothing here may import three.js.
 */

/**
 * A box collider, in world space, with an optional yaw.
 *
 * **Yaw, not a full rotation.** Kerbs, walls, plinths, and bollards are all
 * upright boxes at some heading; nothing in the slice needs a box tipped onto
 * its corner, and an axis-aligned-plus-yaw test is two extra lines in the
 * sampler where a full orientation is a matrix inverse per query. When a
 * segment lies on an arc its blocks arrive here already yawed, which is what
 * lets a curved beat carry a kerb at all.
 *
 * The box's **top face** is what the rider stands on, so `surface` is the
 * surface of that top face. `appearance` overrides the material `render/` uses
 * for the whole box, because the top of a kerb is pavement and the side of it
 * is concrete, and a wall's top face is not a surface anybody rides.
 */
export interface BoxCollider {
  centre: Vec3;
  halfExtents: Vec3;
  /** Rotation about +Y, radians. Zero is axis-aligned. */
  rotationY: number;
  surface: SurfaceId;
  /** Visual material. Defaults to the surface's own when absent. */
  appearance?: MaterialId;
  /**
   * Does a chase camera behind this box lose sight of the rider? Default true.
   *
   * **Added at M8.6, and only ever false on derived dressing.** Every authored
   * block in a segment — kerbs, walls, plinths, the plaza gateway — is a thing
   * you can hide behind, and the M4 obstruction pull-in was tuned against
   * exactly those. The solids the prop kit now emits are mostly *narrower than
   * the rider*: a lamp post crosses the camera's obstruction ray for a handful
   * of frames, and a camera that obeyed it would slam in at the 0.05 s attack
   * and crawl back out at 0.55 s, dozens of times down a lamp-lined avenue, for
   * an occlusion the player never actually had. `data/props.ts` decides which
   * kinds are wide enough to mean it; a building is, a fence post is not.
   *
   * It changes nothing about what stops a wheel. A non-occluding box is exactly
   * as solid as any other.
   */
  occludes?: boolean;
}

/**
 * The terrain, as a regular grid of height samples with a surface per cell.
 *
 * Heights are per **sample** (`columns * rows`) and surfaces are per **cell**
 * (`(columns - 1) * (rows - 1)`), both row-major with row index varying along
 * +Z. That split is deliberate: a height belongs to a point and is shared by
 * the four cells around it, so slopes are continuous across a cell boundary;
 * a surface belongs to an area, so a pavement-to-grass edge is a clean line
 * along a cell boundary rather than a gradient nobody asked for.
 *
 * **Both consumers read the same triangles.** `render/terrain.ts` splits every
 * cell along its (originX, originZ) → (+1, +1) diagonal, and
 * `simulation/planSampler.ts` interpolates within that same triangle, so the
 * ground the controller rides on is the ground the player sees to the
 * millimetre. Bilinear interpolation would have been marginally smoother and
 * would have disagreed with the mesh everywhere except at the corners — the
 * "rendered and collision geometry need one owner" trap (master §5.4).
 */
export interface Heightfield {
  /** World X of column 0 and world Z of row 0. */
  originX: number;
  originZ: number;
  /** Metres between adjacent samples, on both axes. */
  spacing: number;
  /** Sample counts. Cells are one fewer on each axis. */
  columns: number;
  rows: number;
  /** Row-major sample heights, length `columns * rows`. */
  heights: readonly number[];
  /** Row-major cell surfaces, length `(columns - 1) * (rows - 1)`. */
  surfaces: readonly SurfaceId[];
}

/**
 * Everything outside the heightfield.
 *
 * **This replaces M2's `fallbackHeight` hack with a real answer.** The old
 * sampler returned the spawn height for any point off the plane, which kept a
 * rider upright on an invisible continuation of nothing. Now the world has a
 * genuine outside: a level, uniform field at a stated height and surface, which
 * `render/` draws as an actual plane and `simulation/` samples as actual
 * ground. A rider who leaves the authored course rides onto grass and can ride
 * back, and nothing anywhere has to special-case being off the map.
 *
 * The plan builder guarantees the heightfield's border ring already equals
 * these values, so the join is seamless rather than a step.
 */
export interface Surround {
  height: number;
  surface: SurfaceId;
}

/**
 * One end of a segment: everything a generator needs to decide what may follow.
 *
 * `docs/PLANS.md` §6 names the five: surface, width, heading, gradient,
 * elevation. Elevation is `position.y`, so it is not a separate field.
 */
export interface SegmentSocket {
  position: Vec3;
  /** Heading at this end, radians about +Y. Positive turns toward +X (left). */
  headingY: number;
  surface: SurfaceId;
  /** Rideable half-width at this end, metres. */
  halfWidth: number;
  /** Gradient at this end, radians. Positive climbs in the heading direction. */
  gradient: number;
}

/**
 * A typed level segment: one authored beat with sockets at each end.
 *
 * Authoring as sockets rather than as one monolithic blob is what lets M12's
 * generator stitch the same beats into fresh routes (`docs/PLANS.md` §2.5). A
 * beat that composes cleanly here is a beat the generator can reuse; one that
 * does not would have to be re-authored anyway. M4's proving ground is
 * deliberately built this way even though it is a fixed course, because the
 * cost of doing it now is nil and the cost of retrofitting it at M12 is a
 * rewrite.
 *
 * The segment owns its blocks — kerbs, walls, bollards — so that moving a
 * segment moves everything on it.
 */
export interface Segment {
  id: string;
  entry: SegmentSocket;
  exit: SegmentSocket;
  colliders: BoxCollider[];
}

/**
 * One piece of dressing: a tree, a lamp post, a bench, a distant tower block.
 *
 * **A prop is a mesh. Whether it is also solid is `data/props.ts`'s answer,
 * not this array's** — and until M8.6 the answer was "never", which is the
 * decision the owner overturned by riding through a skyline block on the grass
 * and reporting that the buildings were a projection.
 *
 * The old contract was chosen for a real reason and it is worth recording why
 * it no longer binds. `PlanTerrainSampler` walked every collider linearly on
 * every ground query inside the 120 Hz step, so 95 authored colliders were
 * affordable and 600 were not — making the dressing solid genuinely would have
 * cost the step more than the whole level did. M8.6 replaced the linear walk
 * with a uniform grid, which decoupled per-query cost from the collider count
 * entirely; the objection was to the *data structure*, and the data structure
 * is gone. `plan.solids` below carries what the dressing contributes.
 *
 * A prop still owns none of that itself. It stays plain serializable geometry
 * data — `level/` emits data and never meshes (invariant 2) — and
 * `render/props.ts` remains the only file that knows what a `broadleafTree`
 * looks like, while `level/buildPlan.ts` is the only file that turns one into
 * a collider.
 *
 * Props still belong on **verges, shoulders, and the surround** rather than
 * carpeting a rideable corridor, which `sliceLevel.test.ts` asserts rather
 * than trusts. That rule mattered when it was about visual clutter and matters
 * considerably more now that most of it is solid.
 */
export interface Prop {
  kind: PropKind;
  /** The prop's base, on the ground it stands on. */
  position: Vec3;
  /** Rotation about +Y, radians. Zero faces +Z, as everything else does. */
  rotationY: number;
  /** Uniform multiplier on the kind's authored size. 1 is the kit's own size. */
  scale: number;
  /**
   * Metric size in metres, for kinds authored at a size rather than scaled.
   *
   * Only `building` reads it. A block is a box and a box may be stretched
   * without lying; a bench with a stretched leg is the trap master §9.3 names,
   * which is why every other kind is a fixed shape at a uniform scale.
   */
  size?: Vec3;
}

/**
 * One painted line, as a polyline that already lies on the ground.
 *
 * **Render-only, on exactly the same terms as `Prop` above.** No collider, no
 * surface, no ground query: `simulation/planSampler.ts` reads `heightfield`,
 * `surround`, and `segments[].colliders` and cannot see this array. Paint is
 * paint — a rider rides over it and nothing about the ride changes, which is
 * what makes stage 4 of the look pass render-only as a fact about the code
 * rather than as a promise in a document.
 *
 * Points are world-space and carry their own height, because the level builder
 * resolved them against the **finished** heightfield: a line down a crowned road
 * has to sit in the crown, and the corridor that authored it only knows its own
 * cross section, not the shoulder or the neighbouring beat it may cross.
 *
 * The builder also guarantees three things about every point here, so the
 * renderer can draw the array without asking any questions about it:
 *
 *   1. it is inside some rideable corridor,
 *   2. the surface under it is one `PAINTABLE_SURFACES` allows, and
 *   3. it is clear of every collider in the level.
 *
 * A line that would have broken one of them is *clipped* rather than rejected,
 * which is why the boulevard's traffic island breaks the centre line without
 * anybody authoring the break.
 */
export interface Marking {
  /** Consecutive world points, already on the surface plus the paint's lift. */
  points: Vec3[];
  /** Finished width of the line, metres. */
  width: number;
  /** Mark and gap in metres. Both zero for a solid line. */
  dash: number;
  gap: number;
  paint: MarkingPaint;
}

/**
 * What a checkpoint is for, and what the results screen calls each leg.
 *
 * `start` arms the clock, `finish` stops it, and everything between is a split.
 * Stated as a kind rather than inferred from `routeIndex === 0` and
 * `=== length - 1` so a plan with one checkpoint, or none, is describable
 * instead of being an off-by-one waiting to happen.
 */
export type CheckpointKind = 'start' | 'split' | 'finish';

/**
 * A gate across the required route — M10.
 *
 * **A checkpoint is detection data and nothing else.** It is not a collider and
 * it is not a prop: `simulation/` tests a point against the box and `render/`
 * draws a marker beside it, and neither one turns it into geometry the wheel
 * can stand on. That separation is the M7 trap written into the type — the
 * sampler resolves a collider by its top face, so a checkpoint arch built as a
 * collider would read as ground three metres above the road (`docs/PLANS.md`
 * §6, M7 decision 3). A gate the player rides *under* must never be solid.
 *
 * **The volume is a gate across the route, not a region of it.** It is thin
 * along the direction of travel and wide across it, so "passed the checkpoint"
 * means the rider went through a line rather than visited an area — which is
 * what makes a split time mean the same thing on every run. `CHALLENGE`
 * (`src/data/tuning.ts`) derives all three half-extents, including the
 * thickness that stops a rider at top speed tunnelling through in one step.
 *
 * **Every checkpoint sits on ground both routes share** (`docs/PLANS.md` §10,
 * M10). The alley shortcut carries none, so one split table describes both
 * routes and the shortcut shows up as a faster leg rather than as a different
 * course.
 */
export interface Checkpoint {
  id: string;
  /**
   * Box centre, world space. `centre.y` is one half-height above the surface,
   * so the box stands on the ground rather than being buried in it.
   */
  centre: Vec3;
  halfExtents: Vec3;
  /**
   * Heading the rider faces going through it, radians about +Y.
   *
   * The box is yaw-aligned to this, exactly as a `BoxCollider` is, because a
   * gate across a corner is not axis-aligned to anything. It is also what
   * `render/` points the marker along, so a gate cannot be drawn facing a
   * different way from the volume that detects it.
   */
  headingY: number;
  /** Order along the required route. Free ride ignores this. */
  routeIndex: number;
  kind: CheckpointKind;
  /** What the HUD and the results screen call this leg. Player-facing words. */
  label: string;
}

/**
 * What kind of trouble a hazard is — M13.
 *
 * Three kinds because the owner named three outcomes at §13 q8: a liquid spill
 * and a shallow pothole start a wobble, and a deep pothole is a wipeout. The
 * depth class is stated as a kind rather than carried as a metre value because
 * nothing downstream wants to interpolate on it — the simulation branches, the
 * renderer picks a mesh family, and a hole that is 0.14 m deep would be neither
 * a readable shape nor a fair rule.
 */
export type HazardKind = 'spill' | 'potholeShallow' | 'potholeDeep';

/**
 * Something in the road worth avoiding — M13.
 *
 * **A hazard is detection and render data, never a collider.** This is the M7
 * trap for the third time and in its worst form yet: the sampler resolves a
 * collider by its *top face*, so a pothole built as one would not be a recess
 * at all — it would be a slab of ground at the height of the road, and the one
 * feature in the game whose entire point is that the surface drops away would
 * be the one feature that cannot. `simulation/hazards.ts` tests a point against
 * the footprint and `render/` draws the rim beside it, and neither turns it
 * into geometry the wheel stands on.
 *
 * **The footprint is a circle, so there is no yaw here.** A checkpoint needs
 * one because a gate is a wall across a corridor and a wall has a direction; a
 * puddle and a hole are rotationally symmetric, which makes the containment
 * test two multiplies and no transform, and makes "which way is this pothole
 * facing" a question nobody can ask wrongly.
 *
 * **A spill reaches the simulation as ground, not as a hazard.** Its build
 * paints `heightfield.surfaces` inside this footprint with the `spill` surface,
 * and from there grip, rolling resistance, wobble injection, tyre voice and
 * particles are all the existing surface system's answer (`data/surfaces.ts`).
 * The record survives into the plan because `EucController.updateSafePosition`
 * must refuse to record a safe position inside one, and because one hazard
 * authoring stream must remain inspectable as data. The renderer draws the wet
 * cells from the heightfield, not a second sheen mesh. Only the potholes are
 * discrete contact events.
 */
export interface Hazard {
  id: string;
  kind: HazardKind;
  /**
   * Footprint centre on the finished ground, world space.
   *
   * `centre.y` is the surface height at the centre — the road level the hazard
   * interrupts, not the bottom of the recess. What a deep pothole's floor is at
   * is `render/`'s business and nothing the simulation asks.
   */
  centre: Vec3;
  /** Footprint radius, metres. */
  radius: number;
}

/**
 * Something on the verge to swing a paddle at — M14, the Knockabout mode.
 *
 * **Modelled on `Hazard`, deliberately not on `Checkpoint`.** The scope sentence
 * for this milestone said targets would arrive "via the checkpoint-volume
 * machinery", and half of that machinery is the right answer while half of it is
 * a trap. What transfers is the *authoring* half — a plain optional key resolved
 * by `buildPlan` against the finished heightfield, the absent-not-empty idiom,
 * and one instanced marker family. What does not transfer is the *detection*
 * half: `simulation/challenge.ts` tests a point — the wheel's contact patch —
 * against one expected volume, and a target reusing that would score when the
 * wheel drove through its ground footprint whether or not anybody swung, which
 * makes the swing decoration. A target is struck by a **swept segment test on
 * the paddle head** (`simulation/paddle.ts`) and by nothing else.
 *
 * **A target is detection and render data, never a collider.** This is the M7
 * trap for the fourth time and in its worst form yet. The sampler resolves a
 * collider by its top face, so a target volume that ever reached `plan.solids`
 * would be a slab of ground at strike height that a rider lands on — and unlike
 * a gate the player rides under or a pothole whose whole point is that the
 * ground drops away, a target is *supposed to look solid*, so the pressure to
 * make it one is real. It is not one. The wheel rides straight through the stand
 * and nothing about the ride changes.
 *
 * **Two points, no heading, and that is what keeps the drawn thing and the hit
 * thing from disagreeing.** `base` is where the stand's foot meets the ground on
 * the verge; `centre` is the strike disc, cantilevered in over the road. The
 * renderer derives the arm's direction and length from `centre - base`, so there
 * is no separate heading anybody can set inconsistently, and the simulation
 * reads `centre` and `radius` alone — a sphere. Which side of the road the
 * target stands on is a fact about those two points rather than a sign somebody
 * has to get right.
 *
 * **Both heights come off the ground under the *foot*, and that is a decision
 * rather than an oversight.** `base.y` is `buildPlan`'s `fieldHeightAt` there —
 * the finished heightfield, said out loud, because M12's two placement defect
 * classes were both a subsystem meaning the other of the two surfaces this
 * project calls "the ground" (AGENTS.md, "two subsystems place things at the
 * ground"). `centre.y` is then that height plus the strike height, so the stand
 * is one rigid object: a post of a known length with a pad on the end of it.
 *
 * The alternative — resolving the disc against the road it hangs over and the
 * foot against the verge it stands on — is more faithful to a crowned road and
 * makes the stand a *different shape* at every station, which costs the render
 * budget the whole reason a target family is affordable. One rigid shape is one
 * `InstancedMesh` and two draw calls; a per-station shape is a merged mesh
 * rebuilt whenever anything moves. What makes the rigid version honest is a
 * placement contract rather than an assumption: `placeTargets` refuses a stand
 * whose foot is more than a kerb's height off the road beside it, so the pad is
 * always within the swing's vertical reach and the post never floats.
 */
export interface Target {
  id: string;
  /**
   * Strike-disc centre, world space, at strike height above the road under it.
   *
   * This is the whole of what the simulation knows about a target: a sphere of
   * `radius` at this point. `render/` draws a disc here and the post and arm
   * that hold it up.
   */
  centre: Vec3;
  /** Strike-disc radius, metres. The hittable sphere, not the drawn plate. */
  radius: number;
  /**
   * Where the stand's foot meets the ground, world space, on the verge.
   *
   * `base.y` is the surface height under the foot. The horizontal vector from
   * here to `centre` is the cantilever: the renderer draws a post up from this
   * point and an arm across it, and its length is how far the pad reaches in
   * over the road.
   */
  base: Vec3;
}

export interface LevelPlan {
  id: string;
  /** Where a new or recovering rider starts. */
  spawn: { position: Vec3; headingY: number };
  surround: Surround;
  heightfield: Heightfield;
  segments: Segment[];
  checkpoints: Checkpoint[];
  /**
   * In-road hazards. Absent on a plan that carries none — M13.
   *
   * Optional for the same reason `props` is, and the absence is the normal
   * case by owner decision rather than by accident: §13 q9 puts hazards in
   * **generated routes only**, so the slice, the proving ground and every
   * unit-test fixture carry none and the pinned plan digests never see this
   * key at all (`level/planDigest.ts` omits absent keys).
   */
  hazards?: Hazard[];
  /**
   * Knockabout targets. Absent on a plan that carries none — M14.
   *
   * **Absent, never empty, and this key is where that idiom is written down as
   * the contract every later producer follows.** `level/planDigest.ts` omits an
   * absent key and spells a present one, so `targets: []` and no `targets` at
   * all are different plans with different digests — which is exactly the
   * reading that is wanted, because the two mean different things. A plan with
   * no key is a world the target pass never ran on; a plan with an empty array
   * is a world it ran on and placed nothing in, and §13 q21 makes that second
   * thing legal and refused at the entrance rather than a world to throw away.
   * Producers that place nothing must therefore omit the key, and a consumer
   * reads `plan.targets ?? []`.
   *
   * By §13 q12 targets are **generated routes only**, so the slice, the proving
   * ground and every unit-test fixture carry none and both pinned plan digests
   * never see this key at all.
   */
  targets?: Target[];
  /**
   * Render-only dressing. Absent on a plan that carries none.
   *
   * **Optional on purpose.** The proving ground is a measuring instrument
   * rather than a place (`level/levels.ts`), and every plan a unit test builds
   * is a fixture — none of them want dressing, and a required array would make
   * all of them say so. A consumer that reads `plan.props ?? []` cannot tell a
   * plan without props from a plan with none, which is the correct reading.
   */
  props?: Prop[];
  /**
   * Colliders the dressing contributes. Absent on a plan that carries none.
   *
   * **Separate from `segments[].colliders` on purpose, and the separation is
   * load-bearing in both directions.** A segment's colliders are *authored*
   * level geometry: they move with the beat that owns them, `render/terrain.ts`
   * draws them as boxes, and paint is clipped against them. These are
   * *derived* — one per solid prop, from `data/props.ts`, placed exactly where
   * the prop's own mesh is. The renderer must not draw them, because
   * `render/props.ts` already drew a tree there and a grey box around its trunk
   * would be the same geometry stated twice (master §5.4, the trap invariant 2
   * exists to prevent). Keeping them in their own array is what makes that a
   * fact about the types rather than a rule somebody has to remember.
   *
   * `simulation/planSampler.ts` reads both and cannot tell them apart, which is
   * the correct reading: a wall is a wall.
   */
  solids?: BoxCollider[];
  /**
   * Soft foliage volumes — shrub dense bodies (M15). Absent on a plan that
   * carries none.
   *
   * The same derived boxes `solids` would have carried for shrubs before
   * M15, in their own array because they are a different *kind* of thing: a
   * wall stops a wheel and a bush drags on one. `simulation/planSampler.ts`
   * never reads these — nothing here can be hit, raycast, or crashed
   * against — and `render/` never draws them, because `render/props.ts`
   * already drew the shrub. They travel to the controller as a
   * `SoftBodyField` handed over at `Game.installLevel`, the trigger-volume
   * door hazards and checkpoints already use.
   */
  softBodies?: BoxCollider[];
  /**
   * Render-only road paint. Absent on a plan that carries none.
   *
   * Optional for the same reason `props` is: the proving ground is an
   * instrument rather than a place, and no unit-test fixture wants lines
   * painted down it.
   */
  markings?: Marking[];
}

/** Sample index for a heightfield column and row. Row-major. */
export function sampleIndex(field: Heightfield, column: number, row: number): number {
  return row * field.columns + column;
}

/** Cell index for a heightfield column and row. Row-major, one fewer of each. */
export function cellIndex(field: Heightfield, column: number, row: number): number {
  return row * (field.columns - 1) + column;
}

/** Total cells. `surfaces` has exactly this length. */
export function cellCount(field: Heightfield): number {
  return (field.columns - 1) * (field.rows - 1);
}
