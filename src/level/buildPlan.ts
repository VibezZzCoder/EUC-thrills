/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import { MARKINGS, PAINTABLE_SURFACES } from '../data/markings.ts';
import { CHALLENGE, HAZARD, TARGET } from '../data/tuning.ts';
import {
  BUILDING_CLEARANCE,
  BUILDING_MAX_JOIN_FRACTION,
  PROP_FOOTPRINTS,
  PROP_SOLIDS,
  PROP_SPREADS,
  PROP_VERTICAL_SPANS,
  REFUSE_BURIED_BUILDINGS,
} from '../data/props.ts';
import type { PropKind } from '../data/props.ts';
import type { MaterialId } from '../data/surfaces.ts';
import type {
  BoxCollider,
  Checkpoint,
  CheckpointKind,
  Hazard,
  HazardKind,
  Heightfield,
  LapCourse,
  LapPoint,
  LevelPlan,
  Marking,
  Prop,
  Segment,
  Surround,
  Target,
} from './plan.ts';
import {
  DEFAULT_SHOULDER,
  centrelineAt,
  collidersOf,
  forwardOf,
  headingAt,
  leftOf,
  markingsOf,
  placeGraph,
  propsOf,
  querySegment,
  surfaceAtLateral,
  type PlacedMarking,
  type PlacedProp,
  type PlacedSegment,
  type SegmentGraph,
  type SegmentSpec,
} from './segments.ts';

/**
 * Rasterise a chain of typed segments into one `LevelPlan`.
 *
 * This is the single producer invariant 2 has been describing since M0 and that
 * M4 finally makes real. Everything downstream — the controller's ground, the
 * camera's obstruction probe, the rendered mesh, the materials — reads the
 * output of this function and nothing else. There is no second copy of the
 * ground anywhere, which is what makes "the ground you ride on is the ground
 * you see" a structural property rather than a promise.
 *
 * It is also, deliberately, the shape M12 needs. A generator that picks specs
 * with a seed instead of reading them from an array calls exactly this. The
 * work here is authoring-agnostic on purpose.
 *
 * Nothing in this file may import three.js (invariant 1).
 */

export interface BuildOptions {
  readonly id: string;
  readonly spawn: { position: Vec3; headingY: number };
  readonly surround: Surround;
  /**
   * Metres between heightfield samples.
   *
   * One metre is chosen against the wheel, not against a triangle budget: the
   * tyre is half a metre across, so a cell is about two contact patches, and
   * the gradient the controller reads never changes under the wheel faster than
   * the wheel could have noticed. Halving it would quadruple the mesh to
   * describe slopes that are already piecewise-planar.
   */
  readonly spacing?: number;
  /**
   * Dressing authored in world XZ rather than against a segment.
   *
   * The skyline is the reason it exists: a ring of blocks on the horizon
   * belongs to the *level*, not to whichever beat happens to point at it, and
   * hanging it off a segment would move it whenever that segment moved. Their
   * heights are resolved against the finished heightfield exactly as a
   * segment's own props are, so a block on the surround stands on the surround.
   */
  readonly props?: readonly PlacedProp[];
  /**
   * The timed route, as gates authored against segments — M10.
   *
   * Absent on a level that cannot be timed, which is the proving ground and
   * every fixture a unit test builds. See `resolveCheckpoints`.
   */
  readonly checkpoints?: readonly CheckpointSpec[];
  /**
   * Albedo this level paints an existing material with. See `LevelPlan.palette`.
   *
   * Passed through untouched: the builder has no opinion about colour, and an
   * override that changed anything the builder reasons about — a surface's
   * encroachment, a collider's height — would not be a palette.
   */
  readonly palette?: Readonly<Partial<Record<MaterialId, number>>>;
  /**
   * What is lying in the road, authored against segments — M13 Phase 1.
   *
   * Absent on every world that ships today, and that is a decision rather than
   * an omission: §13 q9 puts hazards in **generated routes only**, so the slice,
   * the proving ground and every fixture in the unit suites carry none. See
   * `resolveHazards`, and `LevelPlan.hazards` for why an empty array must never
   * be emitted in place of an absent one.
   */
  readonly hazards?: readonly HazardSpec[];
  /**
   * Scatter diagnostic hazards every N metres of every segment — M13 Phase 2.
   *
   * **Phase 2's owner gate cannot be performed without this, and that is why it
   * exists.** The gate asks whether a pothole reads as a hole at 20 m and at
   * 40 m on the handset; the answer decides where `EUC.hazardCrashSpeed` sits.
   * But hazards reach a world only through `hazards` above, Phase 3 is what
   * teaches the generator to author them, and until then **no world in the
   * game contains one** — so the thing the gate is about is invisible in every
   * world the owner can open.
   *
   * `?wobbleprobe=` is the precedent, one phase earlier and for the same
   * reason: Phase 0's redesigned wobble had no trigger until Phase 1 built one,
   * so a diagnostic supplied the impulse. This supplies the content.
   *
   * It goes through `hazards` rather than around it — the same resolution, the
   * same five refusals, the same spill overpaint — so what the owner rides is
   * the real feature and not a preview of it. Absent by default, which is what
   * keeps §13 q9 true of every world a player can reach and leaves the pinned
   * plan digests untouched.
   */
  readonly hazardProbeMetres?: number;
  /**
   * Knockabout targets, authored against a segment — M14.
   *
   * Absent on every world but a generated one (§13 q12) and on every fixture,
   * and absent rather than empty for `LevelPlan.targets`'s reason: the two
   * spellings mean different things and only one of them leaves the pinned
   * plan digests alone.
   */
  readonly targets?: readonly TargetSpec[];
  /**
   * Scatter diagnostic targets every N metres of every segment — M14 phase 2.
   *
   * **`?hazardprobe=`'s exact terms**, and it exists for exactly the same
   * reason one phase earlier did: phase 2's owner gate asks whether a target
   * reads as something to hit far enough ahead to set the line up for it, and
   * until phase 3 teaches the generator to place one, **no world in the game
   * contains a target at all**. The thing the gate is about would be invisible
   * in every world the owner can open.
   *
   * It goes through `targets` rather than around it — the same resolution, the
   * same refusals, the same clearance — so what the owner rides is the feature
   * and not a preview of it. It replaces the authored set rather than joining
   * it, for the reason `withProbeHazards` records: two authors on one road is a
   * world no rule describes.
   */
  readonly targetProbeMetres?: number;
  /**
   * Settle every prop onto the lowest ground its own base touches, and refuse
   * the ones whose ground is too steep to stand on. Off by default.
   *
   * **Opt-in, and the default is load-bearing.** The hand-authored slice's
   * dressing was placed by hand against ground the author could see, and its
   * emitted `LevelPlan` is pinned byte-for-byte
   * (`src/level/planDigest.test.ts`) because it is the reference the whole of
   * M12 is judged against. Turning this on for everybody would move it.
   *
   * **A generator needs it, and the owner's first ride of a generated route is
   * why.** He reported trees detached from the ground and lamp posts
   * submerged, and both are the same defect: a prop is a rigid object placed at
   * *one* sampled height, so on a bank half of it floats and half of it buries.
   * The hand-authored level has the problem too and largely dodges it, because
   * a person placing a tree does not choose the middle of an embankment. A
   * scatter has no such judgement, so the rule has to be in the builder.
   *
   * Two halves, and both are needed:
   *
   *   1. **Settle.** A prop stands on the *lowest* ground under its base, not
   *      the ground under its origin. Buried reads as natural — a trunk into a
   *      bank, a bench leg in the turf — and floating never does. It uses
   *      `PROP_FOOTPRINTS`, the part that actually touches, so a lamp post
   *      settles by its post and a bench by its whole length.
   *   2. **Refuse.** Past a slope, settling stops helping and starts sinking
   *      the prop out of sight, so the prop is dropped instead. The ceiling is
   *      `PROP_MAX_GROUND_SLOPE` and comes from the slice.
   */
  readonly settleProps?: boolean;
  /**
   * Carry every authored block down to the ground it stands over. Off by default.
   *
   * **The same defect as `settleProps`, one layer down, and it is the one the
   * owner photographed on his second ride.** A `SegmentBlock` is authored in its
   * corridor's frame, so `collidersOf` puts its top `height` above the corridor
   * *surface* — which is right, because that is what the block is measured
   * against. Its base then goes `depth` (0.6 m) below the same surface, and that
   * is only right while the ground under the block is the corridor.
   *
   * It stops being right the moment a block sits **outside** its own corridor,
   * which most of them do: a street tree stands at t 12.5 on a nine-metre road,
   * a frontage at t 13.5. The heightfield out there is the shoulder easing down
   * to the surround, so on a route running above its field the ground falls away
   * under the block and the block stays where the corridor put it. Measured on
   * the seeds the owner rode: tree trunks hanging 2.6 m in the air with their
   * crowns still sitting on top of them — "floating tree parts" — and 8 × 34 m
   * stone frontages 4.3 m off the ground, which is the "half floating bricklike
   * structure on side of road".
   *
   * **Down only, never up.** The top face is the authored surface — what a rider
   * mounts, lands on, or is stopped by — and moving it would change the ride. A
   * foundation is invisible: it is below the ground it reaches for.
   *
   * Opt-in for the same reason `settleProps` is: the hand-authored levels' plans
   * are pinned, and their author could see what they were placing.
   */
  readonly settleBlocks?: boolean;
  /**
   * How far a **building** must stand back from every rideable corridor, metres.
   * Absent leaves `PROP_CORRIDOR_CLEARANCE` to do the whole job.
   *
   * **A separate rule because it answers a separate question.** The half-metre
   * corridor clearance is about *riding*: it stops a rider meeting a tree on
   * the road. A twenty-metre block half a metre off the kerb is perfectly
   * rideable and reads as a wall growing out of the pavement — the owner's
   * first ride of a generated route reported exactly that, and the
   * hand-authored slice has one at 1.9 m, so it is not a generator-only
   * problem, only a generator-scale one.
   *
   * A generator passes the corridor's own shoulder here: the shoulder is the
   * ground that blends a road into the field around it, so a building inside it
   * is standing on the embankment. That makes the distance derived rather than
   * chosen. The hand-authored levels leave it absent, because their skylines
   * were placed by somebody looking at them and their plans are pinned.
   */
  readonly buildingStandBack?: number;
}

/**
 * How steep the ground under a prop's own base may be before it is refused.
 *
 * **Derived from the accepted level, like every other bound in M12.** Measured
 * across the slice's 781 props: 11% of them stand on ground steeper than 30°
 * and the steepest is a shrub at 60°, which is a shrub half-buried in a bank
 * and looks like one. A generated route with the same scatter density puts up
 * to 44% of its dressing past 30°, including lamp posts at 67°, and that is
 * what the owner saw.
 *
 * Thirty-five degrees is a little above where the slice's *readable* kinds sit
 * and well below its shrubs. It is a single number rather than a per-kind table
 * on purpose: a table fitted to the slice's worst case per kind would licence a
 * generator to produce that worst case everywhere, which is precisely the
 * difference between a level somebody placed and a level somebody scattered.
 */
export const PROP_MAX_GROUND_SLOPE = Math.PI * 35 / 180;

/**
 * A checkpoint authored against a segment, not against world coordinates.
 *
 * The same argument `SegmentBlock` and `SegmentProp` make, and the strongest
 * case for it: a gate is *defined* as "across the corridor, here", so the one
 * thing an author knows about it is which beat carries it and how far along.
 * Written in world XZ it would have to be re-solved by hand every time a radius
 * or a length moved, and a start line that has drifted six metres off the road
 * is a start line the player rides past.
 *
 * `s` is metres along that segment's centreline from its entry socket, exactly
 * as everywhere else in this authoring model. `id` is stable and player-invisible
 * — the record store and the ghost never key off it, but a split in a log names
 * itself with it. `label` is the player-facing words.
 */
export interface CheckpointSpec {
  readonly id: string;
  /** Which placed segment carries it. */
  readonly segment: string;
  /** Distance along that segment's centreline, metres. */
  readonly s: number;
  readonly kind: CheckpointKind;
  readonly label: string;
}

/**
 * A hazard authored against a segment, not against world coordinates — M13.
 *
 * `CheckpointSpec`'s argument a second time, and it survives one real
 * difference. A gate is *defined* as "across the corridor, here", so `s` alone
 * locates it and the corridor supplies the rest. A spill or a hole is defined
 * as "in the road, **there**", and where in the road is the whole of what makes
 * it worth riding around: a puddle in the gutter is a line to stay off, and the
 * same puddle on the centreline is a line the rider has to pick a side of. So a
 * hazard carries a lateral offset as well, and `t` is the field Phase 3's
 * generator will search over when it has to guarantee an avoidable line at the
 * speed the approach actually produces.
 *
 * Written in world XZ instead, that offset would have to be re-solved by hand
 * every time a length, a radius or a curvature moved, and a spill that has
 * drifted three metres is a spill in the verge — invisible from the road and
 * hazardous to nobody.
 *
 * `s` is metres along that segment's centreline from its entry socket and `t`
 * is metres from that centreline, exactly as everywhere else in this authoring
 * model. `id` is stable and player-invisible; nothing keys a record or a ghost
 * off it, but the drawn marker and the simulation's contact record key off it
 * to mean the same object, which is why `resolveHazards` refuses a duplicate.
 */
export interface HazardSpec {
  readonly id: string;
  /** Which placed segment carries it. */
  readonly segment: string;
  /** Distance along that segment's centreline, metres. */
  readonly s: number;
  /** Lateral offset from that centreline, metres. Positive is the rider's LEFT. */
  readonly t: number;
  readonly kind: HazardKind;
  /** Footprint radius, metres. Finite and above zero. */
  readonly radius: number;
}

/**
 * A Knockabout target authored against a segment — M14.
 *
 * `HazardSpec`'s argument again, with one field fewer and one field more. There
 * is no `kind` because there is only one thing to hit and no `radius` because
 * every target is the size `TARGET.discRadius` says — a target is a *fixture*,
 * not a footprint, and the whole reason the family costs one draw call is that
 * every one of them is the same rigid object.
 *
 * **`t` is the stand's foot, and the arm always cantilevers toward the
 * centreline.** The stand goes on the verge and the pad reaches back in over
 * the road (§13 q19), so which way the arm points is `-sign(t)` and is never a
 * field anybody can set inconsistently. Carrying it separately would be one
 * more thing to get backwards, and getting it backwards puts the pad in the
 * hedge — which no clearance rule would catch, because nothing here is a
 * collider and nothing about it can be crashed into.
 */
export interface TargetSpec {
  readonly id: string;
  /** Which placed segment carries it. */
  readonly segment: string;
  /** Distance along that segment's centreline, metres. */
  readonly s: number;
  /**
   * Lateral offset of the **stand's foot** from that centreline, metres.
   * Positive is the rider's LEFT, exactly as `HazardSpec.t` is.
   */
  readonly t: number;
}

/**
 * Metres between heightfield samples when a caller names none.
 *
 * **Exported since M13 Phase 3**, because the spill overpaint rasterises a
 * circle onto this grid and the route contracts have to charge for the cells it
 * selects rather than for the circle it was authored as. A duplicated `1` in
 * `routeValidator.ts` would be a number that could drift by a milestone and take
 * a fairness rule with it.
 */
export const DEFAULT_SPACING = 1;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function ease01(u: number): number {
  return u * u * (3 - 2 * u);
}

/**
 * Which segment owns a world point, and how far outside its corridor it is.
 *
 * Nearest-corridor wins; a tie inside two corridors goes to whichever is more
 * central, which is the answer that keeps a join from developing a seam down
 * the middle of the route.
 */
function bestSegmentAt(
  placed: readonly PlacedSegment[],
  x: number,
  z: number,
): { segment: PlacedSegment; outside: number; t: number; height: number } | null {
  let best: { segment: PlacedSegment; outside: number; t: number; height: number } | null = null;

  for (const segment of placed) {
    const query = querySegment(segment, x, z);
    if (query === null) continue;

    if (
      best === null
      || query.outside < best.outside
      || (query.outside === best.outside && Math.abs(query.t) < Math.abs(best.t))
    ) {
      best = { segment, outside: query.outside, t: query.t, height: query.height };
    }
  }

  return best;
}

/**
 * A plain chain is a graph with no branches, and saying so here keeps every
 * existing caller — and every future single-line generator route — from having
 * to wrap itself in an object to say "no fork".
 */
function asGraph(input: readonly SegmentSpec[] | SegmentGraph): SegmentGraph {
  return Array.isArray(input) ? { main: input as readonly SegmentSpec[] } : input as SegmentGraph;
}

export function buildLevelPlan(
  input: readonly SegmentSpec[] | SegmentGraph,
  options: BuildOptions,
): LevelPlan {
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const graph = asGraph(input);
  const placed = placeGraph(graph, options.spawn);
  if (placed.length === 0) throw new Error('a level plan needs at least one segment');
  // `placeGraph` lays the main chain first, in riding order, and appends each
  // branch after it. That ordering is what makes "the lap" nameable below
  // without the plan carrying a second copy of which corridors are the circuit.
  const mainChain = placed.slice(0, graph.main.length);

  // -- Bounds -------------------------------------------------------------
  // Padded by two extra cells beyond every segment's own shoulder so the
  // outermost ring of samples is guaranteed to be pure surround. That is not
  // cosmetic: the renderer skips all-surround cells to avoid drawing geometry
  // coplanar with the surround plane, and the sampler answers surround for
  // anything off the grid — the two only agree if the grid's edge already *is*
  // the surround.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const segment of placed) {
    if (segment.minX < minX) minX = segment.minX;
    if (segment.maxX > maxX) maxX = segment.maxX;
    if (segment.minZ < minZ) minZ = segment.minZ;
    if (segment.maxZ > maxZ) maxZ = segment.maxZ;
  }
  const pad = spacing * 2;
  const originX = Math.floor((minX - pad) / spacing) * spacing;
  const originZ = Math.floor((minZ - pad) / spacing) * spacing;
  const columns = Math.ceil((maxX + pad - originX) / spacing) + 1;
  const rows = Math.ceil((maxZ + pad - originZ) / spacing) + 1;

  // -- Sample heights -----------------------------------------------------
  const heights = new Array<number>(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    const z = originZ + row * spacing;
    for (let column = 0; column < columns; column += 1) {
      const x = originX + column * spacing;
      const best = bestSegmentAt(placed, x, z);

      if (best === null) {
        heights[row * columns + column] = options.surround.height;
        continue;
      }

      const shoulder = best.segment.spec.shoulder ?? DEFAULT_SHOULDER;
      // Inside the corridor the segment's own height; beyond it, eased down to
      // the surround across the shoulder, which turns every embankment into
      // something a rider can climb rather than a wall they bounce off.
      const weight = shoulder > 0 ? 1 - ease01(clamp01(best.outside / shoulder)) : 0;
      heights[row * columns + column] = options.surround.height
        + (best.height - options.surround.height) * weight;
    }
  }

  // -- Cell surfaces ------------------------------------------------------
  // Sampled at the cell centre, and crisp rather than blended: a surface is a
  // property of an area, and a pavement-to-grass boundary the player can see is
  // worth more than one that fades. Only the corridor itself carries its
  // surface; the shoulder is surround, so a grass verge falls out of the
  // geometry instead of being painted on separately.
  const cellColumns = columns - 1;
  const cellRows = rows - 1;
  const surfaces = new Array<SurfaceId>(cellColumns * cellRows);
  for (let row = 0; row < cellRows; row += 1) {
    const z = originZ + (row + 0.5) * spacing;
    for (let column = 0; column < cellColumns; column += 1) {
      const x = originX + (column + 0.5) * spacing;
      const best = bestSegmentAt(placed, x, z);
      surfaces[row * cellColumns + column] = best !== null && best.outside === 0
        ? surfaceAtLateral(best.segment.spec, best.t)
        : options.surround.surface;
    }
  }

  // -- Spill footprints ---------------------------------------------------
  // **A spill is its cells.** `plan.ts` states the split and this is the half
  // that carries it: grip, rolling resistance, wobble injection, tyre voice and
  // particles are all `data/surfaces.ts` answering for the cell under the
  // contact patch, so painting here is the entire ride response, and the record
  // `resolveHazards` emits below only feeds the drawn sheen and
  // `EucController.updateSafePosition`'s refusal to save a position inside one.
  // Only the potholes reach the simulation as discrete contact events.
  //
  // Crisp, by the cell's own centre, on the argument the block above already
  // makes — a surface belongs to an area, and a boundary the player can see is
  // worth more than one that fades. Blending would additionally give the
  // renderer and the sampler two different answers to "am I on the spill".
  //
  // Each footprint walks its own cells and not the grid. The slice's field is
  // 96,571 cells and a generated route's is the same order, so a per-hazard
  // sweep would spend millions of tests at build time to rediscover that the
  // answer is `surround` almost everywhere.
  //
  // **A footprint that covers no cell centre is refused.** A circle placed
  // anywhere lies within `spacing·√2/2` of some cell centre, so a radius above
  // that always paints and below it the result depends on where the circle
  // falls between four centres. Rounding a small spill up would put slippery
  // ground where the player can see none; accepting it would do the opposite,
  // emitting render data for a hazard with no grip, tyre voice, or wobble.
  // Refusal keeps those two truth layers together and gives the generator a
  // concrete retry reason instead of a harmless-looking puddle.
  //
  // One knock-on worth knowing rather than discovering: `spill` is not in
  // `PAINTABLE_SURFACES`, so a line crossing a spill is clipped by the same
  // rule that clips one crossing a grass band. Phase 3 owns whether a generator
  // should keep spills off painted lines.
  const hazardSpecs = withProbeHazards(
    placed,
    options.hazards,
    options.hazardProbeMetres,
    spacing,
  );
  const spills = hazardSpecs.filter((spec) => spec.kind === 'spill');
  if (spills.length > 0) {
    const carriers = new Map(placed.map((segment) => [segment.spec.id, segment]));
    for (const spec of spills) {
      const carrier = carriers.get(spec.segment);
      // Anything unresolvable is left alone here and refused by name in
      // `resolveHazards` below. Skipping is deferral, not acceptance: no plan
      // containing one of these specs is ever returned.
      if (carrier === undefined) continue;
      if (!Number.isFinite(spec.s) || spec.s < 0 || spec.s > carrier.spec.length) continue;
      if (!Number.isFinite(spec.t)) continue;
      if (!Number.isFinite(spec.radius) || spec.radius <= 0) continue;

      const centre = segmentPoint(carrier, spec.s, spec.t);
      // Cell (column, row) has its centre at `originX + (column + 0.5) * spacing`,
      // which is the loop above verbatim. Solving that for the cells whose
      // centres fall inside the footprint's bounding box makes the bounds exact,
      // so the walk is the footprint's own square and nothing wider.
      const firstColumn = Math.max(0, Math.ceil((centre.x - spec.radius - originX) / spacing - 0.5));
      const lastColumn = Math.min(
        cellColumns - 1,
        Math.floor((centre.x + spec.radius - originX) / spacing - 0.5),
      );
      const firstRow = Math.max(0, Math.ceil((centre.z - spec.radius - originZ) / spacing - 0.5));
      const lastRow = Math.min(
        cellRows - 1,
        Math.floor((centre.z + spec.radius - originZ) / spacing - 0.5),
      );
      const radiusSquared = spec.radius * spec.radius;
      let coveredCells = 0;

      for (let row = firstRow; row <= lastRow; row += 1) {
        const dz = originZ + (row + 0.5) * spacing - centre.z;
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const dx = originX + (column + 0.5) * spacing - centre.x;
          if (dx * dx + dz * dz > radiusSquared) continue;
          coveredCells += 1;
          surfaces[row * cellColumns + column] = 'spill';
        }
      }
      // A sheen that reaches `plan.hazards` but paints no cell has no grip,
      // tyre voice, rolling resistance, or wobble response. Refuse that data
      // here rather than letting Phase 2 draw a harmless-looking hazard.
      if (coveredCells === 0) {
        throw new Error(
          `spill hazard "${spec.id}" covers no heightfield cell at ${spacing} m spacing`,
        );
      }
    }
  }

  const heightfield: Heightfield = {
    originX,
    originZ,
    spacing,
    columns,
    rows,
    heights,
    surfaces,
  };

  const segments: Segment[] = placed.map((segment) => ({
    id: segment.spec.id,
    entry: segment.entry,
    exit: segment.exit,
    colliders: collidersOf(segment).map(
      (collider) => (options.settleBlocks === true
        ? footedCollider(heightfield, options.surround, collider)
        : collider),
    ),
  }));

  // -- Props --------------------------------------------------------------
  // Resolved last, because a prop stands on the *finished* ground: a tree on a
  // verge is on the shoulder, which has already eased away from the corridor
  // that authored it, and a skyline block is on the surround. The prop array is
  // render input; after placement is final, the solid kinds separately derive
  // `plan.solids` below for simulation. Neither consumer reads the other's
  // representation.
  const segmentProps = placed.flatMap(propsOf);
  const routeAuthored = new Set(segmentProps);
  const colliders = segments.flatMap((segment) => segment.colliders);
  const offCorridor: PlacedProp[] = [
    ...segmentProps,
    ...(options.props ?? []),
  ].filter((prop) => prop.onCollider === true || !standsOnCorridor(
    placed,
    prop,
    prop.kind === 'building' ? (options.buildingStandBack ?? PROP_CORRIDOR_CLEARANCE) : undefined,
  ));

  // A folded route can put one beat's dressing inside another beat's wall.
  // Resolve against the assembled collider set, in three dimensions, after
  // ground height is known. Shrubs around narrow tree trunks are intentional
  // underplanting; every other visible mesh yields to the solid.
  const offSolids = offCorridor.filter((prop) => prop.onCollider === true
    || !standsInCollider(heightfield, options.surround, colliders, prop));

  // **Buildings first, and against each other.** A block whose centre is buried
  // in another block is one fused shape with a seam through it, and the slice
  // produces them the same way it produced props inside corridors: two
  // frontages authored 26 m apart along a 34 m arc stand under 7 m apart at the
  // 25 m offset they are actually placed at. Abutting is left alone.
  const buildings: PlacedProp[] = [];
  for (const prop of offSolids) {
    if (prop.kind !== 'building') continue;
    if (REFUSE_BURIED_BUILDINGS && buildings.some((kept) => (
      buried(kept, prop)
      || (routeAuthored.has(kept) && routeAuthored.has(prop)
        && buildingJoinFraction(kept, prop) > BUILDING_MAX_JOIN_FRACTION)
    ))) continue;
    buildings.push(prop);
  }

  // Then nothing grows out of a wall. A building wins over anything else that
  // wants the same ground, because the building cannot move and the tree can.
  const outsideBuildings = offSolids.filter((prop) => prop.kind === 'building'
    ? buildings.includes(prop)
    : prop.onCollider === true || !standsInBuilding(buildings, prop, BUILDING_CLEARANCE));
  // Then, for a generator, the ground itself gets a veto. A prop is a rigid
  // object placed at one sampled height, so on a bank half of it floats and
  // half of it buries — the defect the owner reported on his first ride of a
  // generated route as "trees detached from the ground" and "light poles
  // submerged". `settleProps` sinks what it can and refuses the rest. Off for
  // the hand-authored levels, whose dressing was placed by somebody looking at
  // it; see `BuildOptions.settleProps`.
  const settle = options.settleProps === true;
  const onStandableGround = !settle ? outsideBuildings : outsideBuildings.filter((prop) => (
    prop.onCollider === true
    || prop.kind === 'building'
    || baseGround(heightfield, options.surround, prop).slope <= PROP_MAX_GROUND_SLOPE
  ));

  const authored = resolveStructuralConflicts(heightfield, options.surround, onStandableGround);
  const props: Prop[] = authored.map(
    (prop) => resolveProp(heightfield, options.surround, prop, settle),
  );

  // -- Solids -------------------------------------------------------------
  // What the dressing contributes to the simulation (M8.6). Derived from the
  // *resolved* props rather than from the authored ones, so a collider is
  // where its mesh ended up: a block's base was pulled down to the lowest
  // ground under it, a tree's to the finished shoulder it stands on, and a
  // collider placed from the authored position would float or bury.
  //
  // Everything that decides a prop's fate has already run. A prop culled for
  // standing in a corridor, inside another building, or buried in a wall never
  // reaches this loop, so a solid cannot exist without the mesh that justifies
  // it.
  const solids: BoxCollider[] = [];
  // Foliage is not structure (M15): a soft kind's box goes to
  // `plan.softBodies`, where it drags on the wheel instead of stopping it.
  // The sampler never sees these, so a bush can no longer manufacture an
  // obstacle crash — the forum's "reacts like a boulder", ended by routing.
  const softBodies: BoxCollider[] = [];
  for (let index = 0; index < props.length; index += 1) {
    const prop = props[index];
    // A planter shrub authored on an existing wall is already physical through
    // that wall, and its foliage sits on top of it where no wheel can reach —
    // it contributes neither a solid nor a soft body.
    if (prop.kind === 'shrub' && authored[index].onCollider === true) continue;
    const solid = solidOf(prop);
    if (solid === null) continue;
    if (PROP_SOLIDS[prop.kind]?.soft === true) softBodies.push(solid);
    else solids.push(solid);
  }

  // -- Markings -----------------------------------------------------------
  // Resolved last for the same reason props are, and clipped against the
  // assembled level rather than against the segment that authored them.
  const markings: Marking[] = [];
  for (const segment of placed) {
    for (const authored of markingsOf(segment)) {
      markings.push(...clipMarking(placed, colliders, heightfield, options.surround, authored));
    }
  }

  // -- Checkpoints --------------------------------------------------------
  // Resolved last for the third time and for the third version of the same
  // reason: a gate stands on the *finished* ground, which is the ground the
  // rider's contact patch will be tested against. It contributes to no other
  // array here — not `segments[].colliders`, not `solids`, not `props` — and
  // `plan.ts` states why: a gate the rider passes under, built as a collider,
  // reads as ground three metres up.
  const checkpoints = resolveCheckpoints(placed, heightfield, options.surround, options.checkpoints);

  // -- Hazards ------------------------------------------------------------
  // Resolved last for the fourth time and for the same reason a gate is: a
  // hazard sits on the *finished* ground, which is the ground the contact patch
  // is tested against. The spills among them painted their cells before the
  // heightfield was assembled, because a surface has to exist before the field
  // is frozen; what this adds is the record `render/` draws pothole rims from
  // and `EucController.updateSafePosition` reads for every kind (`plan.ts`).
  const hazards = resolveHazards(placed, heightfield, options.surround, hazardSpecs);

  // -- Targets --------------------------------------------------------------
  // Resolved last for the fifth time and for the fifth identical reason: a
  // stand's foot is planted on the *finished* ground, which is the ground the
  // renderer draws and the ground the contact patch is tested against. Both of
  // M12's placement defect classes were a subsystem meaning the other of the
  // two surfaces this project calls "the ground", and the way past that is to
  // resolve against the heightfield here, after it exists, and to say so.
  const targets = resolveTargets(
    placed,
    heightfield,
    options.surround,
    withProbeTargets(placed, options.targets, options.targetProbeMetres),
  );

  // -- The lap ------------------------------------------------------------
  // After the gates, because it is the gates' spelling that says whether this
  // route is a lap at all, and from `placed` rather than from `segments`
  // because the emitted `Segment` keeps only its two sockets — the arc between
  // them, which is the whole shape of a corner, exists only here.
  const lap = lapCourse(mainChain, options.checkpoints);

  return {
    id: options.id,
    spawn: { position: { ...options.spawn.position }, headingY: options.spawn.headingY },
    surround: { ...options.surround },
    heightfield,
    segments,
    checkpoints,
    ...(hazards.length === 0 ? {} : { hazards }),
    // Absent, never empty — `LevelPlan.targets` states the contract and this is
    // the producer it binds. `targets: []` is a different plan with a different
    // digest, and it would move both pinned ones on the day it was emitted.
    ...(targets.length === 0 ? {} : { targets }),
    ...(props.length === 0 ? {} : { props }),
    ...(solids.length === 0 ? {} : { solids }),
    ...(softBodies.length === 0 ? {} : { softBodies }),
    ...(markings.length === 0 ? {} : { markings }),
    // Absent unless the route is a lap, on `LevelPlan.targets`'s contract: a
    // plan with no key is a world that is not a circuit, so the slice, the
    // proving ground, every generated route and every fixture leave both
    // pinned digests exactly where they were.
    ...(lap === null ? {} : { lap }),
    ...(options.palette === undefined ? {} : { palette: { ...options.palette } }),
  };
}

/**
 * How far apart the lap centreline is sampled, metres.
 *
 * **Derived from the tightest corner the game can author, not chosen.** The
 * consumer measures a point against the chord between two samples, so the
 * error is the sagitta `R(1 - cos(spacing / 2R))`. BelVar's hairpin is R14,
 * where two metres of spacing is 36 mm — three orders of magnitude inside the
 * ten-metre half-width the chord is compared against, and still under a
 * centimetre at any radius above 50 m. Halving it would double a 465-point
 * array to describe a difference nothing can measure.
 */
const LAP_SAMPLE_SPACING = 2;

/**
 * How far a lap's two ends may miss each other and still be one ring, metres.
 *
 * `simulation/routeSpine.ts` calls 1.25 m the distance at which two segment
 * ends are the same joint, and this is the same statement about the same
 * geometry: below it the chain met itself and the remainder is arithmetic;
 * above it the author was not drawing a circuit.
 */
const LAP_CLOSE_TOLERANCE = 1.25;

/**
 * The lap as a closed line, or null when the route is not one.
 *
 * **The circuit is the main chain**, which is a fact about how a lap is
 * authored rather than an assumption: a closed route's gates are on the ring,
 * `placeGraph` lays the ring first, and the paddock — the one branch BelVar
 * carries — is deliberately *not* part of the racing surface. Asserting that
 * every gate stands on a main-chain corridor is what keeps the two statements
 * from drifting; a lap whose sector gate had been authored on a branch would
 * produce an envelope the referee then judged the rider against, and the
 * symptom would be a valid lap voided at one corner with nothing on screen
 * explaining it.
 *
 * The ring is closed explicitly by repeating the first point, so a consumer
 * walking spans always has one across the start/finish seam. Without it the
 * few metres either side of the line would read as the end of an open line,
 * which is the one place on the circuit where every lap is decided.
 */
function lapCourse(
  mainChain: readonly PlacedSegment[],
  specs: readonly CheckpointSpec[] | undefined,
): LapCourse | null {
  if (specs === undefined || specs.length < 2) return null;
  // The lap spelling `assertRouteOrder` accepts: a start, splits, and no
  // finish. A point-to-point route has two ends and is not a ring.
  if (specs[specs.length - 1].kind === 'finish') return null;

  const ring = new Set(mainChain.map((segment) => segment.spec.id));
  for (const spec of specs) {
    if (ring.has(spec.segment)) continue;
    throw new Error(
      `lap checkpoint "${spec.id}" is authored on "${spec.segment}", which is not on the lap`,
    );
  }

  const points: LapPoint[] = [];
  let length = 0;
  const push = (x: number, z: number, halfWidth: number): void => {
    const previous = points[points.length - 1];
    if (previous !== undefined) {
      const step = Math.hypot(x - previous.x, z - previous.z);
      // Two samples in the same place would be a zero-length span, which is a
      // division by zero in every point-to-span test that walks this array.
      // Corridor joints produce one at every seam by construction.
      if (step < 1e-6) return;
      length += step;
    }
    points.push({ x, z, halfWidth });
  };

  for (const segment of mainChain) {
    const spec = segment.spec;
    const divisions = Math.max(1, Math.ceil(spec.length / LAP_SAMPLE_SPACING));
    for (let division = 0; division <= divisions; division += 1) {
      const centre = centrelineAt(segment.entry, spec, (division / divisions) * spec.length);
      push(centre.x, centre.z, spec.halfWidth);
    }
  }

  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const gap = Math.hypot(last.x - first.x, last.z - first.z);
  // **A chain that does not meet itself is not a circuit, and that is answered
  // here rather than thrown about.** `assertRouteOrder` accepts `start, split…`
  // as the spelling of a lap, and a spelling is all it is: a straight road with
  // no finish gate is a legal plan and a great many unit fixtures are exactly
  // that. Refusing to emit an envelope for one is the honest answer — nothing
  // downstream is then able to lap it, which is correct — and a venue that
  // *meant* to be a ring says so in its own test rather than relying on a
  // builder to guess.
  //
  // The tolerance is `placeChain`'s stitching slack rather than zero, because
  // the loop closes by solving a linear system (`trackLevel.ts`) and lands
  // within floating point of exact rather than exactly on it.
  if (gap > LAP_CLOSE_TOLERANCE) return null;
  length += gap;
  points.push({ x: first.x, z: first.z, halfWidth: first.halfWidth });

  return { points, length };
}

/**
 * The collider a resolved prop contributes, or null if the kind is already
 * represented by authored geometry.
 *
 * **The box matches the mesh because both are built from the same numbers.**
 * `render/props.ts` composes a prop as `position × yaw × prop.scale`, and a
 * building then scales a unit box by its own metric `size` inside that; this
 * multiplies through in exactly the same order, so a collider cannot drift
 * from the thing the player is looking at without `data/props.ts` changing
 * underneath both of them.
 *
 * The box stands *on* the prop's base, which is where every kind's mesh
 * starts, so its centre is half its height above `prop.position`.
 */
function solidOf(prop: Prop): BoxCollider | null {
  const solid = PROP_SOLIDS[prop.kind];
  if (solid === null) return null;

  // Only `building` is authored at a metric size; every other kind is a fixed
  // shape at a uniform scale, and reads 1 here. The fallback mirrors
  // `render/props.ts`, so a block with no size gets the same box as its mesh.
  const size = prop.kind === 'building'
    ? prop.size ?? { x: 12, y: 18, z: 12 }
    : { x: 1, y: 1, z: 1 };
  const halfX = solid.halfX * prop.scale * size.x;
  const halfZ = solid.halfZ * prop.scale * size.z;
  const height = solid.height * prop.scale * size.y;

  return {
    centre: { x: prop.position.x, y: prop.position.y + height / 2, z: prop.position.z },
    halfExtents: { x: halfX, y: height / 2, z: halfZ },
    rotationY: prop.rotationY,
    surface: solid.surface,
    ...(solid.occludes ? {} : { occludes: false }),
  };
}

/**
 * Turn authored gates into world volumes, or throw trying.
 *
 * **Everything a checkpoint is comes from the segment it was authored on**, so
 * a beat that moves takes its gate with it and there is no second copy of the
 * route's geometry to drift. The heading is the corridor's heading at `s`, the
 * width is the corridor's own half-width plus `CHALLENGE.gateWidthMargin`, and
 * the thickness and height are the two `CHALLENGE` numbers that exist to stop a
 * rider at top speed tunnelling through and to catch one crossing mid-hop.
 *
 * **The order is asserted rather than assumed.** A route is `start`, then any
 * number of `split`s, then `finish`; `routeIndex` is the position in the
 * authored array. `simulation/challenge.ts` re-sorts by `routeIndex` before it
 * referees anything, which means a mis-authored array would not fail there — it
 * would quietly run the course in the wrong order, and the first person to
 * notice would be a player whose finish line stopped working. It is much
 * cheaper to refuse to build the level.
 *
 * The gate box is yaw-aligned exactly as a `BoxCollider` is: local +X is the
 * corridor's LEFT and local +Z runs along the route (see `collidersOf` and
 * `withinCollider`), so `halfExtents.x` is the width across the corridor and
 * `.z` is the half-thickness along it. `insideCheckpoint` applies the same
 * inverse yaw, which is the only reason the two agree.
 */
function resolveCheckpoints(
  placed: readonly PlacedSegment[],
  field: Heightfield,
  surround: Surround,
  specs: readonly CheckpointSpec[] | undefined,
): Checkpoint[] {
  if (specs === undefined || specs.length === 0) return [];
  assertRouteOrder(specs);

  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));

  return specs.map((spec, routeIndex) => {
    const carrier = byId.get(spec.segment);
    if (carrier === undefined) {
      throw new Error(
        `checkpoint "${spec.id}" is authored on segment "${spec.segment}", which the graph never places`,
      );
    }
    if (!Number.isFinite(spec.s) || spec.s < 0 || spec.s > carrier.spec.length) {
      throw new Error(
        `checkpoint "${spec.id}" sits at s=${spec.s} on "${spec.segment}", which is ${carrier.spec.length} m long`,
      );
    }

    const headingY = headingAt(carrier.entry, carrier.spec, spec.s);
    const centre = centrelineAt(carrier.entry, carrier.spec, spec.s);
    const halfExtents: Vec3 = {
      x: carrier.spec.halfWidth + CHALLENGE.gateWidthMargin,
      y: CHALLENGE.gateHalfHeight,
      z: CHALLENGE.gateHalfDepth,
    };

    return {
      id: spec.id,
      centre: {
        x: centre.x,
        y: gateFloor(field, surround, centre.x, centre.z, headingY, carrier.spec.halfWidth)
          + CHALLENGE.gateHalfHeight,
        z: centre.z,
      },
      halfExtents,
      headingY,
      routeIndex,
      kind: spec.kind,
      label: spec.label,
    };
  });
}

/**
 * A route is one `start`, then splits, and then either one `finish` or nothing.
 *
 * **The second spelling is a lap, and it arrived with M23's circuit.** A point
 * to-point course has two ends and names them; a closed circuit has one line,
 * crossed to open a lap and crossed again to close that lap and open the next.
 * Writing the lap as `start, split, split…` rather than inventing a `finish`
 * at the start's own coordinates is what keeps one gantry where the player
 * sees one gantry: two `Checkpoint`s at identical centres would draw twice,
 * detect one crossing twice, and give the results screen a leg of zero
 * seconds.
 *
 * **Nothing downstream needed changing, which is the evidence that the shape
 * is coherent rather than convenient.** `ChallengeRun.available` already asks
 * whether a route can *start and stop* — it requires the last gate to be a
 * finish — so a lap is reported un-timeable by the M10 referee on its own
 * terms, with no branch anywhere on which level is loaded. The referee that
 * can read a lap is `docs/PLANS.md` §23.15's.
 *
 * Ids are unique in both spellings, because a split in a log names itself.
 */
function assertRouteOrder(specs: readonly CheckpointSpec[]): void {
  if (specs.length < 2) {
    throw new Error('a timed route needs at least a start and a finish');
  }
  const lap = specs[specs.length - 1].kind !== 'finish';
  const seen = new Set<string>();
  specs.forEach((spec, index) => {
    if (seen.has(spec.id)) throw new Error(`duplicate checkpoint id "${spec.id}"`);
    seen.add(spec.id);
    const expected: CheckpointKind = index === 0
      ? 'start'
      : index === specs.length - 1 && !lap ? 'finish' : 'split';
    if (spec.kind !== expected) {
      throw new Error(
        `checkpoint "${spec.id}" is a ${spec.kind} at route index ${index}, where a ${expected} belongs`,
      );
    }
  });
}

/**
 * The height the gate's underside sits at: the LOWEST finished ground the gate
 * spans, not the ground under its centre.
 *
 * **This is a real bug and not a nicety.** Detection is a point test on the
 * contact patch, and a box whose bottom face is exactly the ground at the
 * centreline has no room underneath it: on a crowned road the gutter is 0.08 m
 * lower, on the park gate's descent the far edge of the gate is 0.10 m lower,
 * and a rider riding either of those crosses the whole volume *below* it and is
 * never seen. That is a run silently voided by ten centimetres, on a legal line
 * the level encourages (§6 beat 6) — the annoyance rule, in geometry.
 *
 * So the box is founded the way `lowestGroundUnderBuilding` founds a block on a
 * slope, and for the same reason: a horizontal box over ground that is not
 * horizontal has to reach the lowest of it. The cost is that the gate's top is
 * a few centimetres lower over the crown, which nothing measures.
 *
 * The span measured is the **corridor**, not the corridor plus the width
 * margin. The margin exists to catch a rider who has cut onto the shoulder, and
 * a shoulder eases toward the surround — on a corridor raised well above it,
 * that is ground far below the road, and founding the gate down there would
 * drag its roof down with it. Corridor ground is what a rider on the route is
 * standing on, so corridor ground is what the box stands on.
 *
 * Swept in the **gate's own frame**, not over its bounding rectangle in world
 * XZ. The difference is not academic: the park gate's box lies at 30° to the
 * axes, its bounding rectangle reaches nine metres up a corridor that is
 * falling at one in eighteen, and founding the gate on the lowest corner of
 * *that* would sink it half a metre into the road. A gate is a box; the ground
 * it stands on is the ground under the box.
 */
function gateFloor(
  field: Heightfield,
  surround: Surround,
  x: number,
  z: number,
  headingY: number,
  halfWidth: number,
): number {
  const left = leftOf(headingY);
  const forward = forwardOf(headingY);
  const halfDepth = CHALLENGE.gateHalfDepth;
  // A quarter of a cell. The field is planar *within* a cell, so the lowest
  // ground under the box is at a cell boundary it crosses and a sweep this fine
  // passes within an eighth of a cell of every one of them — a tenth of a
  // millimetre of slack on the slice's six gates, against the eight centimetres
  // this function exists to recover, and below what any consumer of the number
  // can express (the ghost saves position to the centimetre). Whole cells
  // cannot be read instead: the box is yawed, so its edges rarely land on one.
  const step = field.spacing / 4;
  const across = Math.max(2, Math.ceil((halfWidth * 2) / step));
  const along = Math.max(2, Math.ceil((halfDepth * 2) / step));

  let lowest = Infinity;
  for (let column = 0; column <= across; column += 1) {
    const t = -halfWidth + (halfWidth * 2 * column) / across;
    for (let row = 0; row <= along; row += 1) {
      const d = -halfDepth + (halfDepth * 2 * row) / along;
      lowest = Math.min(lowest, fieldHeightAt(
        field,
        surround,
        x + left.x * t + forward.x * d,
        z + left.z * t + forward.z * d,
      ));
    }
  }
  return lowest;
}

/**
 * The world XZ of a point authored as `(segment, s, t)`.
 *
 * The composition `propsOf` performs to place a prop and `resolveCheckpoints`
 * performs to place a gate, named once because M13 gave it two callers inside
 * one build that must not be able to disagree with each other.
 * The spill overpaint decides which heightfield cells are wet and
 * `resolveHazards` records where the hazard *is*; two copies of this arithmetic
 * could drift by a term and leave a puddle whose sheen and whose grip were in
 * different places, which is the one defect a player would read as the game
 * lying to them.
 */
function segmentPoint(carrier: PlacedSegment, s: number, t: number): { x: number; z: number } {
  const centre = centrelineAt(carrier.entry, carrier.spec, s);
  const left = leftOf(headingAt(carrier.entry, carrier.spec, s));
  return { x: centre.x + left.x * t, z: centre.z + left.z * t };
}

/**
 * Turn authored hazards into world footprints, or throw trying — M13.
 *
 * `resolveCheckpoints`' contract, one clause lighter and one clause heavier.
 * Everything a hazard is still comes from the segment it was authored on, so a
 * beat that moves takes its potholes with it and there is no second copy of
 * where they are. What goes is the **order**: a route is a sequence and
 * `routeIndex` is a position in it, while hazards are a set that
 * `simulation/hazards.ts` tests the rider against in full every step, so
 * `assertRouteOrder` has nothing here to assert but its id check. That one
 * survives on its own merits: the id is the only handle a drawn rim (Phase 2)
 * and a simulation contact record have on each other, so two hazards sharing
 * one is a marker and an event disagreeing about which hole the rider went
 * into — and the disagreement would be silent in both directions.
 *
 * What is heavier is `radius`. A gate takes all three half-extents from
 * `CHALLENGE` and cannot be authored at no size; a footprint is authored, and a
 * zero, negative or non-finite one is a hazard that exists in the plan, is
 * drawn, and can never be hit.
 *
 * **`centre.y` is the finished ground** at the footprint's centre — the road
 * level the hazard interrupts, not the floor of the recess (`plan.ts`,
 * `Hazard`). Read off the heightfield rather than off the corridor's own cross
 * section, and `AGENTS.md` requires saying which of the two this means: the
 * heightfield, because the two are one surface only *inside* a corridor and a
 * hazard's `t` can put it on the shoulder, where they are metres apart on a
 * stitched route. It is also the surface the contact patch is resolved against,
 * so it is the surface a hazard has to agree with.
 *
 * This function does not paint. The spill overpaint ran before the heightfield
 * was assembled; the one thing that must never differ between the two is where
 * the footprint is, which is why both go through `segmentPoint`.
 */
function resolveHazards(
  placed: readonly PlacedSegment[],
  field: Heightfield,
  surround: Surround,
  specs: readonly HazardSpec[] | undefined,
): Hazard[] {
  if (specs === undefined || specs.length === 0) return [];
  assertUniqueHazardIds(specs);

  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));

  return specs.map((spec) => {
    const carrier = byId.get(spec.segment);
    if (carrier === undefined) {
      throw new Error(
        `hazard "${spec.id}" is authored on segment "${spec.segment}", which the graph never places`,
      );
    }
    if (!Number.isFinite(spec.s) || spec.s < 0 || spec.s > carrier.spec.length) {
      throw new Error(
        `hazard "${spec.id}" sits at s=${spec.s} on "${spec.segment}", which is ${carrier.spec.length} m long`,
      );
    }
    if (!Number.isFinite(spec.t)) {
      throw new Error(
        `hazard "${spec.id}" has a non-finite lateral offset t=${spec.t}`,
      );
    }
    if (!Number.isFinite(spec.radius) || spec.radius <= 0) {
      throw new Error(
        `hazard "${spec.id}" has a radius of ${spec.radius} m, which no rider can ever be inside`,
      );
    }

    const point = segmentPoint(carrier, spec.s, spec.t);
    return {
      id: spec.id,
      kind: spec.kind,
      centre: {
        x: point.x,
        y: fieldHeightAt(field, surround, point.x, point.z),
        z: point.z,
      },
      radius: spec.radius,
    };
  });
}

/**
 * The authored hazards, plus the diagnostic scatter when one was asked for.
 *
 * **A pure function of the placed graph and one number**, so a probe ride is as
 * reproducible as any other world and two people comparing notes about the same
 * `?hazardprobe=` cadence are looking at the same holes.
 *
 * Three properties are deliberate rather than incidental:
 *
 *   - **It emits every kind**, cycling shallow → deep → spill, because the gate
 *     is partly about telling them apart. A probe that placed one kind would
 *     answer "can I see it" and leave "can I see *which*" untested, and the
 *     second question is the one the crash speed depends on.
 *   - **It alternates sides rather than sitting on the centreline**, at a
 *     fraction of the corridor's own half width, so the ride still has a line
 *     through and the owner is judging readability rather than an obstacle
 *     course. `docs/PLANS.md` §13 q9's "nothing may be annoying" applies to a
 *     diagnostic too — one nobody is willing to ride is one nobody rides.
 *   - **It never places at s = 0**, where a hazard would sit on a socket and be
 *     shared visually between two beats.
 *
 * Radii are the sizes Phase 3 is expected to work in: a pothole around the
 * wheel's own footprint, a spill wide enough to be a stretch of road rather
 * than a puddle to thread. The spill's is also comfortably above the
 * `spacing·√2/2` floor below which a footprint can miss every cell centre.
 */
function withProbeHazards(
  placed: readonly PlacedSegment[],
  authored: readonly HazardSpec[] | undefined,
  metres: number | undefined,
  spacing: number,
): readonly HazardSpec[] {
  if (metres === undefined || !Number.isFinite(metres) || metres <= 0) return authored ?? [];

  const kinds: HazardKind[] = ['potholeShallow', 'potholeDeep', 'spill'];
  // Read from the table rather than restated, since M13 Phase 3. The gate this
  // diagnostic exists for is only meaningful if the owner is looking at the
  // sizes the generator actually places (`data/tuning.ts`, `HAZARD`).
  const radii: Readonly<Record<HazardKind, number>> = {
    potholeShallow: HAZARD.shallowRadius,
    potholeDeep: HAZARD.deepRadius,
    spill: HAZARD.spillRadius,
  };

  const probe: HazardSpec[] = [];
  let index = 0;
  for (const segment of placed) {
    const { halfWidth } = segment.spec;
    // Both sockets belong to the join, not to either segment's interior. The
    // first sample is already one cadence past the entry; keep the same strict
    // separation at the exit. `<=` put a probe exactly on every exit whose
    // length was divisible by the cadence (the 60 m gravel spur at the owner's
    // `?hazardprobe=30` setting was the shipped example).
    for (let s = metres; s < segment.spec.length; s += metres) {
      const kind = kinds[index % kinds.length];
      const side = index % 2 === 0 ? 1 : -1;
      index += 1;

      // **A footprint that fits on one side of the centreline**, leaving an
      // actual dry lane after the spill is rasterised to metre-scale cells.
      // A cell selected by its centre occupies area outside the mathematical
      // circle, so geometric clearance alone is not enough. One full cell is a
      // deliberately conservative raster margin; it exceeds the half-diagonal
      // by which any selected square can approach the centreline. A narrow beat
      // shrinks the footprint rather than spilling over — and a beat too narrow
      // to hold even a small one is skipped, which also keeps the radius above
      // the `spacing·sqrt(2)/2` floor below which a spill covers no cell centre
      // and is refused outright.
      const centreClearance = PROBE_CENTRE_CLEAR + spacing;
      const room = (halfWidth - centreClearance) / 2;
      if (room < PROBE_MIN_RADIUS) continue;
      const radius = Math.min(radii[kind], room);

      probe.push({
        id: `probe-${segment.spec.id}-${index}`,
        segment: segment.spec.id,
        s,
        t: side * (radius + centreClearance),
        kind,
        radius,
      });
    }
  }

  // **The probe replaces, it does not join in** — changed at M13 Phase 3, when
  // the generator became an author of hazards in its own right. Concatenating
  // gave a probed generated route two authors: the generator's dozen, placed
  // under four contracts, plus a scatter every N metres that answers to none of
  // them — landing on jump lips, inside checkpoint gates and at a fifth of the
  // separation the wobble model says a rider needs. That is not the world the
  // owner's readability gate is about and it is not a world any rule describes.
  // One author at a time: with `?hazardprobe=` the diagnostic owns the road.
  return probe;
}

/**
 * How much genuinely rideable lane the diagnostic preserves at the
 * centreline after allowing separately for the heightfield cell raster,
 * metres.
 *
 * Small on purpose: the hazards have to sit in the line a rider is actually
 * taking, or the gate becomes "can I see a hole in the gutter" — which is a
 * different and much easier question than the one the crash speed rests on.
 */
const PROBE_CENTRE_CLEAR = 0.35;

/**
 * The narrowest corridor the diagnostic will place anything in, as the radius
 * that would fit beside the centreline in it, metres.
 *
 * **A bound on the room, not on the footprint.** A shallow pothole is authored
 * smaller than this and still places; what this stops is a *shrunken* spill,
 * and it is set above `DEFAULT_SPACING · √2 / 2` ≈ 0.71 — the radius below
 * which a circle can fall between four cell centres and paint none of them — so
 * a probed spill can never trip the refusal that exists for authored ones.
 */
const PROBE_MIN_RADIUS = 0.8;

/** Hazards have no order, so uniqueness is all `assertRouteOrder` leaves here. */
/**
 * Turn authored target specs into world-space stands — M14.
 *
 * Every refusal here is `resolveHazards`'s, for the same reason: a spec that
 * names a segment the graph never placed, or sits past the end of the one it
 * does name, is an authoring mistake and the honest answer is to say which one
 * rather than to drop it quietly and leave a route one target short of what
 * somebody wrote.
 *
 * The two heights come off **one** ground sample, under the foot, and
 * `plan.ts` argues why: it makes the stand a single rigid object, which is what
 * an instanced family costs one draw call for. What keeps that honest is a
 * placement contract rather than an assumption — `placeTargets` refuses a foot
 * more than a kerb's height off the road beside it.
 */
export function resolveTargets(
  placed: readonly PlacedSegment[],
  field: Heightfield,
  surround: Surround,
  specs: readonly TargetSpec[] | undefined,
): Target[] {
  if (specs === undefined || specs.length === 0) return [];
  assertUniqueTargetIds(specs);

  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));

  return specs.map((spec) => {
    const carrier = byId.get(spec.segment);
    if (carrier === undefined) {
      throw new Error(
        `target "${spec.id}" is authored on segment "${spec.segment}", which the graph never places`,
      );
    }
    if (!Number.isFinite(spec.s) || spec.s < 0 || spec.s > carrier.spec.length) {
      throw new Error(
        `target "${spec.id}" sits at s=${spec.s} on "${spec.segment}", which is ${carrier.spec.length} m long`,
      );
    }
    if (!Number.isFinite(spec.t) || spec.t === 0) {
      throw new Error(
        `target "${spec.id}" has a lateral offset of ${spec.t}; a stand on the `
          + 'centreline has no verge to stand on and no side to reach in from',
      );
    }

    const foot = segmentPoint(carrier, spec.s, spec.t);
    const groundY = fieldHeightAt(field, surround, foot.x, foot.z);
    // The arm reaches back toward the centreline, always. `-sign(t)` and never
    // a field: see `TargetSpec`.
    const inward = spec.t > 0 ? -1 : 1;
    const pad = segmentPoint(carrier, spec.s, spec.t + inward * TARGET.cantilever);

    return {
      id: spec.id,
      centre: { x: pad.x, y: groundY + TARGET.strikeHeight, z: pad.z },
      radius: TARGET.discRadius,
      base: { x: foot.x, y: groundY, z: foot.z },
    };
  });
}

/**
 * The diagnostic scatter — M14 phase 2, on `withProbeHazards`'s exact terms.
 *
 * **It replaces the authored set rather than joining it**, for the reason that
 * one records at length: two authors on one road is a world no rule describes,
 * and the owner's gate is meant to be about the world the generator will build.
 * With `?targetprobe=` the diagnostic owns the verge.
 */
function withProbeTargets(
  placed: readonly PlacedSegment[],
  authored: readonly TargetSpec[] | undefined,
  metres: number | undefined,
): readonly TargetSpec[] {
  if (metres === undefined || !Number.isFinite(metres) || metres <= 0) return authored ?? [];

  const probe: TargetSpec[] = [];
  let index = 0;
  for (const segment of placed) {
    const { halfWidth } = segment.spec;
    // The foot stands outside the rideable half-width, so the probe puts a
    // stand where the generator would: on the verge, never in the road. A beat
    // too narrow to leave the pad clear of the centre lane is skipped rather
    // than shrunk — unlike a spill, a target is a fixed shape and a shrunken
    // one is not the thing the readability gate is about.
    const foot = halfWidth + PROBE_TARGET_VERGE;
    if (foot - TARGET.cantilever < PROBE_CENTRE_CLEAR) continue;
    // Both sockets belong to the join rather than to either segment's interior,
    // exactly as the hazard scatter has it.
    for (let s = metres; s < segment.spec.length; s += metres) {
      index += 1;
      // Alternating sides, so the owner's gate ride meets the swing from both
      // and a right-handed swing is tested against a target it has to reach
      // across for as well as one that comes to it.
      const side = index % 2 === 0 ? 1 : -1;
      probe.push({
        id: `target-probe-${segment.spec.id}-${index}`,
        segment: segment.spec.id,
        s,
        t: side * foot,
      });
    }
  }
  return probe;
}

/**
 * How far outside the rideable half-width the diagnostic plants a foot, metres.
 *
 * Just past the kerb line: far enough that the stand is plainly on the verge,
 * near enough that the pad's own cantilever brings it back within a swing of a
 * line the rider would take anyway.
 */
const PROBE_TARGET_VERGE = 0.55;

function assertUniqueTargetIds(specs: readonly TargetSpec[]): void {
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) throw new Error(`duplicate target id "${spec.id}"`);
    seen.add(spec.id);
  }
}

function assertUniqueHazardIds(specs: readonly HazardSpec[]): void {
  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) throw new Error(`duplicate hazard id "${spec.id}"`);
    seen.add(spec.id);
  }
}

/**
 * Cut a painted line down to the parts of it that may exist.
 *
 * **Clipped, not rejected**, and the difference is what makes the paint
 * authorable at all. A centre line is written once as "the whole of this beat
 * at `t = 0`"; what it then has to survive is a traffic island sitting in the
 * middle of the road, a corridor that narrows under it, a grass band inside the
 * corridor's own width, and — because the slice folds 1,347 m of route into
 * 269 x 359 m — whatever else happens to cross it. Every one of those wants the
 * line to *stop and start again*, not to disappear, and the author cannot be
 * asked to know where they all are.
 *
 * The boulevard's island is the case worth naming: nobody authored a break in
 * the centre line there, and there is one, because the island is a collider and
 * paint does not go on colliders.
 */
function clipMarking(
  placed: readonly PlacedSegment[],
  colliders: readonly BoxCollider[],
  field: Heightfield,
  surround: Surround,
  marking: PlacedMarking,
): Marking[] {
  const runs: Marking[] = [];
  let current: Vec3[] = [];

  const flush = (): void => {
    if (current.length >= 2 && polylineLength(current) >= MARKINGS.minRunLength) {
      runs.push({
        points: current,
        width: marking.width,
        dash: marking.dash,
        gap: marking.gap,
        paint: marking.paint,
      });
    }
    current = [];
  };

  for (let index = 0; index < marking.points.length; index += 1) {
    const point = marking.points[index];
    const before = marking.points[Math.max(0, index - 1)];
    const after = marking.points[Math.min(marking.points.length - 1, index + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const length = Math.hypot(dx, dz);
    const normalX = length > 1e-9 ? dz / length : 0;
    const normalZ = length > 1e-9 ? -dx / length : 0;
    const halfWidth = marking.width / 2;
    const ribbonIsPaintable = [-halfWidth, 0, halfWidth].every((offset) => paintable(
      placed,
      colliders,
      field,
      surround,
      point.x + normalX * offset,
      point.z + normalZ * offset,
    ));
    if (!ribbonIsPaintable) {
      flush();
      continue;
    }
    current.push({
      x: point.x,
      y: fieldHeightAt(field, surround, point.x, point.z) + MARKINGS.lift,
      z: point.z,
    });
  }
  flush();

  return runs;
}

/** Whether one point on a line may be painted. The three rules from `plan.ts`. */
function paintable(
  placed: readonly PlacedSegment[],
  colliders: readonly BoxCollider[],
  field: Heightfield,
  surround: Surround,
  x: number,
  z: number,
): boolean {
  let onCorridor = false;
  for (const segment of placed) {
    const query = querySegment(segment, x, z);
    if (query !== null && query.outside === 0) { onCorridor = true; break; }
  }
  if (!onCorridor) return false;

  if (!PAINTABLE_SURFACES.includes(surfaceAt(field, surround, x, z))) return false;

  for (const collider of colliders) {
    if (withinCollider(collider, x, z, MARKINGS.colliderClearance)) return false;
  }
  return true;
}

/** Whether a world point is inside a yawed collider's footprint, plus a margin. */
function withinCollider(
  collider: BoxCollider,
  x: number,
  z: number,
  margin: number,
): boolean {
  const dx = x - collider.centre.x;
  const dz = z - collider.centre.z;
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);
  // The inverse of the yaw `render/terrain.ts` and `collidersOf` apply: local
  // +X is the corridor's left and local +Z runs along it.
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  return Math.abs(localX) <= collider.halfExtents.x + margin
    && Math.abs(localZ) <= collider.halfExtents.z + margin;
}

/** The surface of the heightfield cell containing a world point. */
function surfaceAt(field: Heightfield, surround: Surround, x: number, z: number): SurfaceId {
  const column = Math.floor((x - field.originX) / field.spacing);
  const row = Math.floor((z - field.originZ) / field.spacing);
  if (column < 0 || row < 0 || column >= field.columns - 1 || row >= field.rows - 1) {
    return surround.surface;
  }
  return field.surfaces[row * (field.columns - 1) + column];
}

/** Ground-plane length of a polyline, metres. */
function polylineLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].z - points[index - 1].z,
    );
  }
  return total;
}

/**
 * How much clear ground a prop leaves beyond a corridor's edge, metres.
 *
 * Half a metre rather than zero: a bin balanced exactly on the white line is a
 * bin the rider still goes through, and the tyre is half a metre across.
 */
export const PROP_CORRIDOR_CLEARANCE = 0.5;

/**
 * Whether a prop would stand where somebody could ride.
 *
 * **The builder enforces this rather than trusting the author, and it is the
 * one rule props have.** It mattered when a prop carried no collider — a rider
 * met a tree on the road by passing through it, which was worse than no tree —
 * and it matters more now that most kinds are solid (M8.6), because the same
 * tree is a wall across a lane. Authoring it by hand is not enough either: the
 * slice folds 1,347 m of
 * route into 269 × 359 m, so the terrace runs beside the plaza and the alley's
 * dogleg runs beside the road it rejoins, and a verge on one beat is the middle
 * of another. Sixty-five props landed in a corridor that way on the first pass,
 * every one of them authored at a sensible offset from the beat it belonged to.
 *
 * A prop with a `size` is tested at its footprint's corners as well as at its
 * centre, because a twenty-metre block clears a road by its centre easily and
 * still stands in it.
 */
function standsOnCorridor(
  placed: readonly PlacedSegment[],
  prop: PlacedProp,
  clearance: number = PROP_CORRIDOR_CLEARANCE,
): boolean {
  const points: [number, number][] = [[prop.x, prop.z]];
  const footprint = PROP_FOOTPRINTS[prop.kind];

  if (footprint.shape === 'circle') {
    const radius = footprint.radius * prop.scale;
    // Sixteen points keep a broad conifer from cutting the corner between four
    // compass samples. This runs only while a level is built, never in a step.
    for (let index = 0; index < 16 && radius > 0; index += 1) {
      const angle = (index / 16) * Math.PI * 2;
      points.push([
        prop.x + Math.cos(angle) * radius,
        prop.z + Math.sin(angle) * radius,
      ]);
    }
  } else {
    const cos = Math.cos(prop.rotationY);
    const sin = Math.sin(prop.rotationY);
    const halfX = (prop.size?.x ?? footprint.halfX * 2) * prop.scale / 2;
    const halfZ = (prop.size?.z ?? footprint.halfZ * 2) * prop.scale / 2;
    // Corners plus edge midpoints. A long fence can cross a curved corridor
    // through its middle while its origin and endpoints remain outside it.
    for (const [dx, dz] of [
      [-halfX, -halfZ], [0, -halfZ], [halfX, -halfZ],
      [-halfX, 0], [halfX, 0],
      [-halfX, halfZ], [0, halfZ], [halfX, halfZ],
    ] as const) {
      points.push([prop.x + cos * dx + sin * dz, prop.z - sin * dx + cos * dz]);
    }
  }

  for (const [x, z] of points) {
    for (const segment of placed) {
      const query = querySegment(segment, x, z);
      if (query !== null && query.outside < clearance) return true;
    }
  }
  return false;
}

/**
 * Whether either building's centre lies inside the other's footprint.
 *
 * Mutual on purpose: the test runs in placement order, and taking only one
 * direction would keep whichever happened to be authored first even when it is
 * the one standing in the middle of the other.
 */
function buried(a: PlacedProp, b: PlacedProp): boolean {
  const centreInside = (box: PlacedProp, point: PlacedProp): boolean => {
    const cos = Math.cos(box.rotationY);
    const sin = Math.sin(box.rotationY);
    const dx = point.x - box.x;
    const dz = point.z - box.z;
    return Math.abs(cos * dx - sin * dz) <= (box.size?.x ?? 12) / 2 * box.scale
      && Math.abs(sin * dx + cos * dz) <= (box.size?.z ?? 12) / 2 * box.scale;
  };
  return centreInside(a, b) || centreInside(b, a);
}

type WorldFootprint =
  | { readonly shape: 'circle'; readonly x: number; readonly z: number; readonly radius: number }
  | {
      readonly shape: 'box';
      readonly x: number;
      readonly z: number;
      readonly rotationY: number;
      readonly halfX: number;
      readonly halfZ: number;
    };

function worldFootprint(prop: PlacedProp, spread = true): WorldFootprint {
  const footprint = (spread ? PROP_SPREADS : PROP_FOOTPRINTS)[prop.kind];
  if (footprint.shape === 'circle') {
    return {
      shape: 'circle',
      x: prop.x,
      z: prop.z,
      radius: footprint.radius * prop.scale,
    };
  }
  return {
    shape: 'box',
    x: prop.x,
    z: prop.z,
    rotationY: prop.rotationY,
    halfX: (prop.size?.x ?? footprint.halfX * 2) * prop.scale / 2,
    halfZ: (prop.size?.z ?? footprint.halfZ * 2) * prop.scale / 2,
  };
}

function colliderFootprint(collider: BoxCollider): Extract<WorldFootprint, { shape: 'box' }> {
  return {
    shape: 'box',
    x: collider.centre.x,
    z: collider.centre.z,
    rotationY: collider.rotationY,
    halfX: collider.halfExtents.x,
    halfZ: collider.halfExtents.z,
  };
}

/** Minimum separating-axis penetration; zero means the boxes do not overlap. */
function boxOverlapDepth(
  a: Extract<WorldFootprint, { shape: 'box' }>,
  b: Extract<WorldFootprint, { shape: 'box' }>,
): number {
  const axes = [
    [Math.cos(a.rotationY), -Math.sin(a.rotationY)],
    [Math.sin(a.rotationY), Math.cos(a.rotationY)],
    [Math.cos(b.rotationY), -Math.sin(b.rotationY)],
    [Math.sin(b.rotationY), Math.cos(b.rotationY)],
  ] as const;
  let depth = Infinity;
  for (const [axisX, axisZ] of axes) {
    const distance = Math.abs((b.x - a.x) * axisX + (b.z - a.z) * axisZ);
    const radiusA = a.halfX * Math.abs(Math.cos(a.rotationY) * axisX - Math.sin(a.rotationY) * axisZ)
      + a.halfZ * Math.abs(Math.sin(a.rotationY) * axisX + Math.cos(a.rotationY) * axisZ);
    const radiusB = b.halfX * Math.abs(Math.cos(b.rotationY) * axisX - Math.sin(b.rotationY) * axisZ)
      + b.halfZ * Math.abs(Math.sin(b.rotationY) * axisX + Math.cos(b.rotationY) * axisZ);
    const overlap = radiusA + radiusB - distance;
    if (overlap <= 1e-9) return 0;
    depth = Math.min(depth, overlap);
  }
  return depth;
}

function circleHitsBox(
  circle: Extract<WorldFootprint, { shape: 'circle' }>,
  box: Extract<WorldFootprint, { shape: 'box' }>,
): boolean {
  const dx = circle.x - box.x;
  const dz = circle.z - box.z;
  const cos = Math.cos(box.rotationY);
  const sin = Math.sin(box.rotationY);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  const nearestX = Math.min(box.halfX, Math.max(-box.halfX, localX));
  const nearestZ = Math.min(box.halfZ, Math.max(-box.halfZ, localZ));
  return Math.hypot(localX - nearestX, localZ - nearestZ) < circle.radius - 1e-9;
}

function footprintsOverlap(a: WorldFootprint, b: WorldFootprint): boolean {
  if (a.shape === 'circle' && b.shape === 'circle') {
    return Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius - 1e-9;
  }
  if (a.shape === 'circle') return circleHitsBox(a, b as Extract<WorldFootprint, { shape: 'box' }>);
  if (b.shape === 'circle') return circleHitsBox(b, a);
  return boxOverlapDepth(a, b) > 0;
}

/** Deep authored joins are fused blocks; shallow joins still read as one city block. */
function buildingJoinFraction(a: PlacedProp, b: PlacedProp): number {
  const boxA = worldFootprint(a, false) as Extract<WorldFootprint, { shape: 'box' }>;
  const boxB = worldFootprint(b, false) as Extract<WorldFootprint, { shape: 'box' }>;
  const narrowestSide = Math.min(
    boxA.halfX * 2,
    boxA.halfZ * 2,
    boxB.halfX * 2,
    boxB.halfZ * 2,
  );
  return narrowestSide > 0 ? boxOverlapDepth(boxA, boxB) / narrowestSide : 0;
}

function propVerticalRange(
  field: Heightfield,
  surround: Surround,
  prop: PlacedProp,
): { readonly bottom: number; readonly top: number } {
  const base = fieldHeightAt(field, surround, prop.x, prop.z) + prop.lift;
  const span = PROP_VERTICAL_SPANS[prop.kind];
  return { bottom: base + span.bottom * prop.scale, top: base + span.top * prop.scale };
}

function standsInCollider(
  field: Heightfield,
  surround: Surround,
  colliders: readonly BoxCollider[],
  prop: PlacedProp,
): boolean {
  const footprint = worldFootprint(prop);
  const vertical = propVerticalRange(field, surround, prop);
  for (const collider of colliders) {
    // A shrub growing around a narrow authored tree trunk is ordinary
    // underplanting. It is the sole intentional mesh intersection here.
    if (
      prop.kind === 'shrub'
      && collider.appearance === 'wood'
      && collider.halfExtents.x <= 0.35
      && collider.halfExtents.z <= 0.35
    ) continue;
    const bottom = collider.centre.y - collider.halfExtents.y;
    const top = collider.centre.y + collider.halfExtents.y;
    if (Math.min(vertical.top, top) - Math.max(vertical.bottom, bottom) <= 0.02) continue;
    if (footprintsOverlap(footprint, colliderFootprint(collider))) return true;
  }
  return false;
}

function structuralPriority(kind: PropKind): number {
  if (kind === 'signpost') return 5;
  if (kind === 'lampPost') return 4;
  if (kind === 'bench') return 3;
  if (kind === 'litterBin') return 2;
  if (kind === 'fenceBay') return 1;
  return 0;
}

function propsIntersect(
  field: Heightfield,
  surround: Surround,
  a: PlacedProp,
  b: PlacedProp,
): boolean {
  if (a.kind === 'fenceBay' && b.kind === 'fenceBay') return false;
  const verticalA = propVerticalRange(field, surround, a);
  const verticalB = propVerticalRange(field, surround, b);
  if (Math.min(verticalA.top, verticalB.top) - Math.max(verticalA.bottom, verticalB.bottom) <= 0.02) {
    return false;
  }
  return footprintsOverlap(worldFootprint(a), worldFootprint(b));
}

/** Structural furniture and route signs win over incidental foliage and clutter. */
function resolveStructuralConflicts(
  field: Heightfield,
  surround: Surround,
  props: readonly PlacedProp[],
): PlacedProp[] {
  const fixed = props.filter((prop) => prop.kind === 'building' || prop.onCollider === true);
  const candidates = props
    .filter((prop) => prop.kind !== 'building' && prop.onCollider !== true)
    .map((prop, index) => ({ prop, index }))
    .sort((a, b) => structuralPriority(b.prop.kind) - structuralPriority(a.prop.kind)
      || a.index - b.index);
  const kept = new Set<PlacedProp>(fixed);
  const structural: PlacedProp[] = [];
  for (const { prop } of candidates) {
    if (structural.some((other) => propsIntersect(field, surround, prop, other))) continue;
    kept.add(prop);
    if (structuralPriority(prop.kind) > 0) structural.push(prop);
  }
  return props.filter((prop) => kept.has(prop));
}

/**
 * Give a collider a foundation down to the lowest ground it stands over.
 *
 * The mirror of `lowestGroundUnderBuilding` for authored blocks, and the same
 * arithmetic: find the lowest ground under the footprint, hold the **top face
 * exactly where it was**, and grow the box downward to reach it. A block that
 * already reaches its ground is returned untouched, so a level whose blocks are
 * all grounded is unchanged by this pass.
 *
 * Sampled on the finished heightfield rather than solved against the corridor,
 * because the ground under a block is not necessarily its own corridor's — a
 * frontage at t 13.5 stands on the shoulder, and a tree beside a junction can
 * stand on the *other* road. The heightfield is the one place that has already
 * resolved all of that.
 *
 * See `BuildOptions.settleBlocks` for what this is for.
 */
function footedCollider(
  field: Heightfield,
  surround: Surround,
  collider: BoxCollider,
): BoxCollider {
  const base = collider.centre.y - collider.halfExtents.y;
  const top = collider.centre.y + collider.halfExtents.y;
  const step = field.spacing / 2;
  const columns = Math.max(2, Math.ceil((collider.halfExtents.x * 2) / step));
  const rows = Math.max(2, Math.ceil((collider.halfExtents.z * 2) / step));
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);

  let lowest = base;
  for (let column = 0; column <= columns; column += 1) {
    const localX = -collider.halfExtents.x + (collider.halfExtents.x * 2 * column) / columns;
    for (let row = 0; row <= rows; row += 1) {
      const localZ = -collider.halfExtents.z + (collider.halfExtents.z * 2 * row) / rows;
      const height = fieldHeightAt(
        field,
        surround,
        collider.centre.x + cos * localX + sin * localZ,
        collider.centre.z - sin * localX + cos * localZ,
      );
      if (height < lowest) lowest = height;
    }
  }

  if (lowest >= base) return collider;
  return {
    ...collider,
    centre: { ...collider.centre, y: (top + lowest) / 2 },
    halfExtents: { ...collider.halfExtents, y: (top - lowest) / 2 },
  };
}

function lowestGroundUnderBuilding(
  field: Heightfield,
  surround: Surround,
  prop: PlacedProp,
): number {
  const size = prop.size ?? { x: 12, y: 18, z: 12 };
  const halfX = size.x * prop.scale / 2;
  const halfZ = size.z * prop.scale / 2;
  const step = field.spacing / 2;
  const columns = Math.max(2, Math.ceil((halfX * 2) / step));
  const rows = Math.max(2, Math.ceil((halfZ * 2) / step));
  const cos = Math.cos(prop.rotationY);
  const sin = Math.sin(prop.rotationY);
  let lowest = fieldHeightAt(field, surround, prop.x, prop.z) + prop.lift;
  for (let column = 0; column <= columns; column += 1) {
    const localX = -halfX + (halfX * 2 * column) / columns;
    for (let row = 0; row <= rows; row += 1) {
      const localZ = -halfZ + (halfZ * 2 * row) / rows;
      const x = prop.x + cos * localX + sin * localZ;
      const z = prop.z - sin * localX + cos * localZ;
      lowest = Math.min(lowest, fieldHeightAt(field, surround, x, z) + prop.lift);
    }
  }
  return lowest;
}

/**
 * The ground under a prop's own base: the lowest it touches, and how steep it is.
 *
 * `PROP_FOOTPRINTS` rather than `PROP_SPREADS`, because this is about what the
 * prop *stands on*. A broadleaf tree stands on its trunk, not on the four-metre
 * crown over the rider's head, so a tree beside a bank settles by a few
 * centimetres and not by a metre.
 */
function baseGround(
  field: Heightfield,
  surround: Surround,
  prop: PlacedProp,
): { lowest: number; slope: number } {
  const footprint = PROP_FOOTPRINTS[prop.kind];
  const reach = footprint.shape === 'circle'
    ? footprint.radius * prop.scale
    : Math.max(footprint.halfX, footprint.halfZ) * prop.scale;
  const centre = fieldHeightAt(field, surround, prop.x, prop.z);
  if (reach <= 0) return { lowest: centre, slope: 0 };

  let lowest = centre;
  let highest = centre;
  const cos = Math.cos(prop.rotationY);
  const sin = Math.sin(prop.rotationY);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const localX = Math.cos(angle) * reach;
    const localZ = Math.sin(angle) * reach;
    const height = fieldHeightAt(
      field,
      surround,
      prop.x + cos * localX + sin * localZ,
      prop.z - sin * localX + cos * localZ,
    );
    if (height < lowest) lowest = height;
    if (height > highest) highest = height;
  }

  return { lowest, slope: Math.atan((highest - lowest) / (2 * reach)) };
}

function resolveProp(
  field: Heightfield,
  surround: Surround,
  prop: PlacedProp,
  settle = false,
): Prop {
  const centreY = fieldHeightAt(field, surround, prop.x, prop.z) + prop.lift;
  if (prop.kind !== 'building') {
    // Settled props stand on the lowest ground their base touches, so a prop on
    // a slope buries rather than floats.
    //
    // A prop authored onto an existing collider takes a different answer rather
    // than no answer. Settling it to the ground would drop a tree's crown to the
    // turf beside its own trunk — but reading the *heightfield* under it is
    // wrong too, because the block it stands on was placed against the corridor
    // surface and those are two different surfaces outside the corridor. On
    // `sweep-0` that put a whole tree row's crowns 1.5 m above their trunks. See
    // `PlacedProp.baseY`, which is the block's own reference.
    const y = !settle || prop.onCollider === true
      ? (settle && prop.baseY !== undefined ? prop.baseY + prop.lift : centreY)
      : baseGround(field, surround, prop).lowest + prop.lift;
    return {
      kind: prop.kind,
      position: { x: prop.x, y, z: prop.z },
      rotationY: prop.rotationY,
      scale: prop.scale,
      ...(prop.size === undefined ? {} : { size: { ...prop.size } }),
    };
  }

  // A horizontal block on a slope needs a foundation. Lower the base to the
  // lowest ground under its footprint and add the same world-space amount to
  // its body so the roofline stays exactly where the author put it.
  const baseY = lowestGroundUnderBuilding(field, surround, prop);
  const size = prop.size ?? { x: 12, y: 18, z: 12 };
  return {
    kind: prop.kind,
    position: { x: prop.x, y: baseY, z: prop.z },
    rotationY: prop.rotationY,
    scale: prop.scale,
    size: {
      ...size,
      y: size.y + (centreY - baseY) / prop.scale,
    },
  };
}

/**
 * Whether a prop would stand inside a building.
 *
 * **A second guard rather than a wider first one, because it asks a different
 * question.** `standsOnCorridor` above protects the *ride*, so it reads
 * `PROP_FOOTPRINTS` — the part of a prop a rider could hit — and for a street
 * tree that is honestly the trunk, because the crown is four metres over their
 * head. A building is twelve to sixty metres tall, so the crown is exactly what
 * overlaps it, and this reads `PROP_SPREADS` instead: the widest each kind gets
 * at any height. The owner's 2026-08-03 ride photographed the consequence of
 * having only the first — foliage growing out of a wall.
 *
 * Exact rather than sampled. The corridor guard samples its footprint's
 * perimeter because a corridor is a curve and there is nothing to solve
 * against; a building is an oriented box, so a circle can be tested by its
 * closest point and a box by the separating axis theorem, and neither can slip
 * between two samples.
 */
function standsInBuilding(
  buildings: readonly PlacedProp[],
  prop: PlacedProp,
  margin: number,
): boolean {
  const spread = PROP_SPREADS[prop.kind];

  for (const building of buildings) {
    if (building === prop) continue;
    // Floored rather than clamped to zero: a negative margin larger than the
    // block would otherwise turn the test inside out.
    const halfX = Math.max(0.1, (building.size?.x ?? 12) / 2 * building.scale + margin);
    const halfZ = Math.max(0.1, (building.size?.z ?? 12) / 2 * building.scale + margin);
    const cos = Math.cos(building.rotationY);
    const sin = Math.sin(building.rotationY);
    // Into the building's own frame, the inverse of the yaw `collidersOf` and
    // `render/props.ts` apply.
    const dx = prop.x - building.x;
    const dz = prop.z - building.z;
    const localX = cos * dx - sin * dz;
    const localZ = sin * dx + cos * dz;

    if (spread.shape === 'circle') {
      const radius = spread.radius * prop.scale;
      // Closest point on the box to the circle's centre, in the box's frame.
      const nearestX = Math.min(halfX, Math.max(-halfX, localX));
      const nearestZ = Math.min(halfZ, Math.max(-halfZ, localZ));
      if (Math.hypot(localX - nearestX, localZ - nearestZ) <= radius) return true;
      continue;
    }

    // Two oriented boxes: separating-axis test on the four face normals. Their
    // relative yaw is all that matters, since both are upright.
    const propHalfX = (prop.size?.x ?? spread.halfX * 2) * prop.scale / 2;
    const propHalfZ = (prop.size?.z ?? spread.halfZ * 2) * prop.scale / 2;
    const relative = prop.rotationY - building.rotationY;
    const cosR = Math.cos(relative);
    const sinR = Math.sin(relative);
    // Absolute values for the *extents* — a projected half-width is a length —
    // and the signed pair for the *rotation*. Using the absolute pair for both
    // is the easy slip, and it produces a test that is right for the first
    // quadrant and quietly wrong everywhere else.
    const rc = Math.abs(cosR);
    const rs = Math.abs(sinR);

    // The prop's extent projected onto the building's axes, and vice versa.
    const propOnX = propHalfX * rc + propHalfZ * rs;
    const propOnZ = propHalfX * rs + propHalfZ * rc;
    if (Math.abs(localX) > halfX + propOnX) continue;
    if (Math.abs(localZ) > halfZ + propOnZ) continue;

    const buildingOnX = halfX * rc + halfZ * rs;
    const buildingOnZ = halfX * rs + halfZ * rc;
    const inPropX = cosR * localX - sinR * localZ;
    const inPropZ = sinR * localX + cosR * localZ;
    if (Math.abs(inPropX) > propHalfX + buildingOnX) continue;
    if (Math.abs(inPropZ) > propHalfZ + buildingOnZ) continue;
    return true;
  }

  return false;
}

/**
 * Ground height at a world point, read off the finished heightfield.
 *
 * **The third reading of the same array, and it splits the same diagonal.**
 * `render/terrain.ts` draws every cell from (column, row) to (column+1, row+1)
 * and `simulation/planSampler.ts` interpolates inside that same triangle; a
 * prop placed by bilinear interpolation would float a centimetre on one
 * diagonal and sink on the other against ground the player can see it standing
 * on. Off the field is the surround, which is real ground rather than a
 * fallback.
 *
 * It is a local copy rather than an import from `simulation/`, because the
 * dependency runs the other way: `simulation/` reads what `level/` emits.
 */
export function fieldHeightAt(field: Heightfield, surround: Surround, x: number, z: number): number {
  const maxX = field.originX + (field.columns - 1) * field.spacing;
  const maxZ = field.originZ + (field.rows - 1) * field.spacing;
  if (x < field.originX || x > maxX || z < field.originZ || z > maxZ) return surround.height;

  const fx = (x - field.originX) / field.spacing;
  const fz = (z - field.originZ) / field.spacing;
  const column = Math.min(field.columns - 2, Math.max(0, Math.floor(fx)));
  const row = Math.min(field.rows - 2, Math.max(0, Math.floor(fz)));
  const u = fx - column;
  const v = fz - row;

  const base = row * field.columns + column;
  const h00 = field.heights[base];
  const h11 = field.heights[base + field.columns + 1];
  if (v < u) {
    const h10 = field.heights[base + 1];
    return h00 + (h10 - h00) * u + (h11 - h10) * v;
  }
  const h01 = field.heights[base + field.columns];
  return h00 + (h11 - h01) * u + (h01 - h00) * v;
}

/**
 * Every **authored** collider in the plan, flattened.
 *
 * Segment blocks only — kerbs, walls, plinths, bollards. `render/terrain.ts`
 * draws exactly this set, and paint is clipped against exactly this set, so it
 * deliberately excludes `plan.solids`: the dressing's colliders already have
 * meshes of their own from `render/props.ts`, and paint under a tree is fine.
 */
export function planColliders(plan: LevelPlan): BoxCollider[] {
  return plan.segments.flatMap((segment) => segment.colliders);
}

/**
 * Every collider the simulation is stopped by — authored blocks and dressing.
 *
 * The sampler's view, and the only one that answers "what is solid here".
 */
export function planSolids(plan: LevelPlan): BoxCollider[] {
  return [...planColliders(plan), ...(plan.solids ?? [])];
}
