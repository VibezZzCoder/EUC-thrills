/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { PropKind } from '../data/props.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import {
  buildLevelPlan,
  fieldHeightAt,
  resolveTargets,
  type CheckpointSpec,
  type HazardSpec,
  type TargetSpec,
} from './buildPlan.ts';
import type { BoxCollider, HazardKind, LevelPlan } from './plan.ts';
import { withinRenderBudget } from './renderBudget.ts';
import {
  BANK_REACH,
  BANK_SLOPE_CEILING,
  HAZARD_RULES,
  ROUTE_CLEARANCE,
  ROUTE_ELEVATION_BAND,
  SHOULDER_SLOPE_CEILING,
  colliderGrid,
  hazardBlockRadius,
  hazardLaneThrough,
  hazardPoint,
  hazardRulesFor,
  hazardSightBlocked,
  hazardSpacingRefusal,
  rideabilityAt,
  TARGET_RULES,
  targetRulesFor,
  targetSpacingRefusal,
  targetStandRefusal,
  hazardZoneRefusal,
  routeProfile,
  validateRoute,
  type HazardRules,
  type Rideability,
  type RouteJump,
  type RouteLayout,
  type RouteShortcut,
  type RouteVerdict,
  type TargetRules,
} from './routeValidator.ts';
import {
  DEFAULT_SHOULDER,
  centrelineAt,
  collidersOf,
  facingRoute,
  leftOf,
  placeGraph,
  querySegment,
  surfaceAtLateral,
  type PlacedSegment,
  type SegmentBranch,
  type SegmentProp,
  type SegmentSpec,
} from './segments.ts';
import {
  LIBRARY_BEATS,
  LIBRARY_CONNECTORS,
  REQUIRED_ROUTE_FLOOR_METRES,
  canFollow,
  instantiate,
  segmentCost,
  type LibraryPiece,
  type OptionalBranch,
} from './segmentLibrary.ts';
import { RENDER_BUDGET } from '../data/renderCost.ts';
import { HAZARD, TARGET } from '../data/tuning.ts';
import {
  SEED_DOMAINS,
  attemptSeed,
  createSeedStreams,
  seedLabel,
  type RandomStream,
  type SeedDomain,
  type SeedSet,
} from './seedStreams.ts';
import { createSliceLevel, SLICE_CHECKPOINTS, SLICE_GRAPH } from './sliceLevel.ts';

/**
 * The seeded route generator — M12 Phase 2.
 *
 * Seeded socket-matching stitching of the M7 beats, under master §6 in full.
 * The shape of it, and why each part is the way it is:
 *
 * **Beats, not noise** (`docs/PLANS.md` §2.5, STRONGLY PREFERRED). Every metre
 * of route the player rides was authored, tuned, and accepted by the owner. The
 * generator chooses an *order* and the neutral joins between; it never invents
 * geometry, because authored fun composes and noise does not.
 *
 * **Retry, never repair** (master §6.4). A route that fails validation is drawn
 * again from a fresh attempt of the route stream. Nothing is patched, trimmed,
 * or nudged into legality — that is how a generator accumulates a hundred
 * special cases and still ships a world the player cannot leave. The one thing
 * that *is* dropped rather than retried is an optional branch, which master
 * §6.3 asks for by name: spending a whole regeneration on something the design
 * calls optional trades a valid world for a slightly more interesting one.
 *
 * **A filter during construction is not a repair.** At each step the generator
 * considers only pieces that can legally follow, and only those that do not
 * collide with what is already down. That is choosing, not fixing. When nothing
 * is left to choose, the attempt fails and the next one starts from scratch.
 *
 * **The fallback is the slice, and it validates itself** (master §6.4). If every
 * attempt fails, the emitted world is the hand-authored level — put through the
 * same validator rather than grandfathered, which is what keeps the validator
 * from drifting into a set of opinions the accepted level would fail.
 *
 * **Five named streams, five separable questions.** `route` decides the order of
 * pieces and which optional branches are kept; `terrain` decides how much each
 * neutral join rises or falls; `surfaces` decides the verge bands along a join;
 * `dressing` places furniture; `hazards` decides what is lying in the road
 * (M13 Phase 3). All four of the passes after `route` run *after* the route
 * exists, which is what makes their independence structural rather than
 * incidental — by the time they draw, the geometry is decided.
 *
 * **None of the four can move one metre of the world**, which is the guarantee
 * master §2.5 asks for and it holds absolutely. Two of them are not otherwise
 * cosmetic, and both exceptions are worth stating rather than discovering:
 *
 *   - `terrain` is the ground, so a route that was legal over flat joins can be
 *     illegal over hills. When that happens it is a rejection and a retry, not
 *     a repair, and the new attempt is a different route.
 *   - `surfaces` decides grip, and a hazard is a claim about grip — so on a
 *     minority of seeds a verge band narrows the rideable road enough that a
 *     hazard stops fitting. Measured at two seeds in twenty-four. It runs one
 *     way only: no hazard draw can move a band, a prop, a metre of route or a
 *     metre of terrain.
 *
 * `generatedLevel.test.ts` states each guarantee exactly as it holds rather
 * than as it would be nicer to claim.
 *
 * **Point to point, not a lap.** The slice is a lap, but it does not close
 * through a socket — `return-plaza` overlaps the plaza's own corridor for its
 * last twenty metres. Forcing a generated route to close would be a constraint
 * on a closed path rather than a stitching rule, and satisfying it by nudging
 * would be exactly the repair master §6.4 forbids. Whether generated routes
 * should be laps is a design question and it is **surfaced, not settled**.
 *
 * Nothing here may import three.js (invariant 1).
 */

// ---------------------------------------------------------------------------
// Knobs, each with an argument behind it
// ---------------------------------------------------------------------------

const GENERATION = {
  /**
   * How many routes may be drawn before the fallback is emitted.
   *
   * Master §6.4: every retry must end in a validated result or an explicit
   * failure, never in a deterministic default that was never checked. Twelve is
   * enough that a legitimately awkward seed still finds a world — the measured
   * sweep in `generatedLevel.test.ts` reports how many attempts are actually
   * spent — and few enough that a pathological one fails inside the boot budget
   * rather than hanging on the loading screen.
   */
  maxAttempts: 12,
  /**
   * How many pieces one route may contain before the attempt is abandoned.
   *
   * A backstop against a library gap turning into an endless corridor of
   * connectors. The floor is about a thousand metres and the shortest piece is
   * a thirty-six metre join, so forty is generous.
   */
  maxPieces: 40,
  /**
   * Weight multiplier for a beat that has not been used yet.
   *
   * The valid-but-joyless risk (`docs/PLANS.md` §12) is the one this milestone
   * is gated on, and the cheapest thing that fights it is variety: a route made
   * of one beat five times is valid and is not a place. Strongly preferring an
   * unseen beat makes a full route contain most of the ten.
   */
  unusedBeatWeight: 6,
  /** Weight for a beat already used once. Repeats are allowed, not encouraged. */
  usedBeatWeight: 1,
  /** Weight for a neutral join when a beat would also fit. */
  connectorWeight: 1.4,
  /**
   * How many times one beat may appear in a route.
   *
   * Twice, not once: a route that can never revisit a beat is a route the
   * generator runs out of library for, and riding the curb run again later at a
   * different speed on a different heading is a legitimately different moment.
   * Three times is a corridor with a beat stuck in it.
   */
  maxBeatUses: 2,
  /**
   * Chance an optional branch is kept, before geometry gets a say.
   *
   * Not one: a route where every pocket and shortcut is present every time has
   * no texture between seeds, and the pockets are meant to be a discovery.
   */
  optionalKeepChance: 0.7,
  /** Gates on the timed route, matching the slice's six. */
  checkpointCount: SLICE_CHECKPOINTS.length,
} as const;

/**
 * How much of the render budget a route may spend before it is refused.
 *
 * The contract itself is `withinRenderBudget` on the finished plan, and it is
 * the one that decides. This is the **pre-screen**: the summed per-piece cost
 * from Phase 0's table, checked while the route is still being laid, so an
 * obviously over-budget route is abandoned before a quarter of a million
 * heightfield samples are rasterised for it. The isolated rows over-estimate by
 * about a quarter because beats that cross share ground, so the pre-screen is
 * generous on purpose — a false rejection here would throw away a route the
 * real contract would have passed.
 */
const PRESCREEN_TRIANGLE_CEILING = RENDER_BUDGET.maxTriangles * 1.25;

/**
 * The step the wheel can lever itself onto, shared with the validator.
 *
 * Two corridors that overlap at more than this have a cliff between them, and
 * the construction filter uses exactly the number the seam contract will judge
 * it by — otherwise the generator would happily lay routes its own validator
 * rejects, and every seed would burn twelve attempts.
 */
const MAX_STEP = ROUTE_CLEARANCE.maxStepUp;

// ---------------------------------------------------------------------------
// Laying a route
// ---------------------------------------------------------------------------

interface LaidPiece {
  readonly piece: LibraryPiece;
  readonly instance: string;
  readonly exitSegmentId: string;
  readonly throughIds: readonly string[];
  readonly optionalIds: readonly string[];
  readonly shortcuts: readonly RouteShortcut[];
  readonly jumps: readonly RouteJump[];
}

/** A piece the generator has decided to try, with everything placing it needs. */
interface Candidate {
  readonly piece: LibraryPiece;
  readonly instance: string;
  readonly segments: readonly PlacedSegment[];
  readonly main: SegmentSpec[];
  readonly branches: SegmentBranch[];
  readonly exitSegmentId: string;
  readonly throughIds: readonly string[];
  readonly optional: readonly OptionalBranch[];
}

interface LaidRoute {
  readonly graph: { main: SegmentSpec[]; branches: SegmentBranch[] };
  readonly placed: readonly PlacedSegment[];
  readonly pieces: readonly LaidPiece[];
  readonly throughIds: readonly string[];
  readonly optionalIds: readonly string[];
  readonly jumps: readonly RouteJump[];
  readonly shortcuts: readonly RouteShortcut[];
  readonly adjacency: Map<string, Set<string>>;
  readonly pieceOf: Map<string, string>;
  readonly requiredLength: number;
  /**
   * The gates, decided here rather than in `generateLevel` — M13 Phase 3.
   *
   * They were always a pure function of the finished route, and the hazard pass
   * needs them: a gate is one of the four places a hazard may not go, and the
   * rule is about distance along the required route, which nobody but this
   * function knows before the plan is built. Computed once and handed to both,
   * so a hazard cannot be placed clear of a gate that then moves.
   */
  readonly checkpoints: readonly CheckpointSpec[];
  readonly hazards: readonly HazardSpec[];
}

const SPAWN = { position: { x: 0, y: 0, z: 0 } as Vec3, headingY: 0 };

/**
 * Would this new segment leave a face beside an existing one?
 *
 * The construction half of two contracts, checked while the route is being laid
 * so an attempt that cannot work is abandoned early rather than after a
 * quarter-million samples have been rasterised for it:
 *
 *   - **A crossing at a step.** Two corridors sharing ground but disagreeing
 *     about its height put a ledge across a corridor somebody rides.
 *   - **A bank no shoulder could make.** Two corridors that miss each other in
 *     plan can still run a tenth of a metre apart and four metres different in
 *     height, and the ground between them is then a wall. The owner's first ride
 *     of a generated route is where that turned up.
 *
 * Choosing between candidates that pass is construction; it is not repair.
 */
function meetsBadly(
  fresh: PlacedSegment,
  existing: readonly PlacedSegment[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  for (const other of existing) {
    if (other.spec.id === fresh.spec.id) continue;
    if (adjacency.get(fresh.spec.id)?.has(other.spec.id) === true) continue;
    if (fresh.maxX < other.minX - BANK_REACH || other.maxX < fresh.minX - BANK_REACH) continue;
    if (fresh.maxZ < other.minZ - BANK_REACH || other.maxZ < fresh.minZ - BANK_REACH) continue;

    const steps = Math.max(4, Math.ceil(fresh.spec.length / 3));
    for (let step = 0; step <= steps; step += 1) {
      const s = (fresh.spec.length * step) / steps;
      const centre = centrelineAt(fresh.entry, fresh.spec, s);
      const heading = fresh.entry.headingY + (fresh.spec.curvature ?? 0) * s;
      const left = leftOf(heading);
      for (const lateral of [0, -fresh.spec.halfWidth, fresh.spec.halfWidth]) {
        const x = centre.x + left.x * lateral;
        const z = centre.z + left.z * lateral;
        const here = querySegment(fresh, x, z);
        const there = querySegment(other, x, z);
        if (here === null || there === null) continue;
        if (there.outside > BANK_REACH) continue;

        const drop = Math.abs(here.height - there.height);
        if (here.outside === 0 && there.outside === 0) {
          if (drop > MAX_STEP) return true;
          continue;
        }
        if (Math.atan(drop / Math.max(there.outside, 0.5)) > BANK_SLOPE_CEILING) return true;
      }
    }
  }
  return false;
}

/**
 * The terrain stream's one job: how much each neutral join rises or falls.
 *
 * The grades are not invented here. Each connector family in the library
 * already authors flat and graded members, and this reads the climbs off them —
 * so a family's grade set is a property of the library rather than a number in
 * the generator, and adding a steeper join is a library edit.
 *
 * **A climb moves the world only in Y.** It changes neither the curvature nor
 * the length of a corridor, so the plan-view route is untouched by every draw
 * this stream makes. That is what makes `terrain` genuinely separable from
 * `route`: one seed asks *where does this go*, the other asks *over what*. The
 * profile stays eased, so both sockets report a zero gradient however steep the
 * middle is, and a graded join still composes with anything.
 */
const FAMILY_GRADES: ReadonlyMap<string, readonly number[]> = (() => {
  const table = new Map<string, number[]>();
  for (const piece of LIBRARY_CONNECTORS) {
    const family = piece.main[0].id.split('-').slice(0, 2).join('-');
    const climbs = table.get(family) ?? [];
    const climb = piece.main[0].climb ?? 0;
    if (!climbs.includes(climb)) climbs.push(climb);
    table.set(family, climbs);
  }
  // Sorted, so what a seed draws from does not depend on declaration order.
  for (const climbs of table.values()) climbs.sort((a, b) => a - b);
  return table;
})();

/**
 * The connectors the *route* stream may choose between.
 *
 * The flat member of every shape, and nothing else: elevation is the terrain
 * domain's decision, and a route stream that could pick `link-road-fall`
 * directly would be making it. Derived by keeping the flat members rather than
 * by listing the graded ones, so adding a steeper variant cannot quietly hand
 * elevation back to the wrong stream.
 */
const CONNECTOR_POOL: readonly LibraryPiece[] = LIBRARY_CONNECTORS
  .filter((piece) => (piece.main[0].climb ?? 0) === 0);

/**
 * The surfaces stream's one job: what the verge of a neutral join is made of.
 *
 * A band is a lateral strip of a different surface across the corridor
 * (`SegmentSpec.bands`), so it changes what the edge of the road is and never
 * where the road goes. The choices are the ones the slice already makes — a
 * grass shoulder on a park path, a gravel apron beside a road — so the surfaces
 * stream cannot invent a transition the level has never shown.
 */
function vergeBands(
  spec: SegmentSpec,
  draw: () => number,
): readonly { from: number; to: number; surface: SurfaceId }[] | undefined {
  const wanted = draw();
  const width = draw();
  if (wanted < 0.3) return undefined;
  const outer = spec.halfWidth;
  const inner = outer * (0.62 + width * 0.26);
  // Only the shoulders the slice already lays: grass beside a park path, and a
  // gravel apron beside a road. The surfaces stream may choose between them and
  // may choose neither; it may not invent a surface the level has never shown.
  const surface: SurfaceId = spec.surface === 'dirt' || spec.surface === 'gravel'
    ? 'grass'
    : (wanted < 0.65 ? 'grass' : 'gravel');
  return [
    { from: inner, to: outer, surface },
    { from: -outer, to: -inner, surface },
  ];
}

/**
 * The dressing stream's one job: furniture on the verge of a neutral join.
 *
 * A connector is neutral in the library and stays neutral there — this dresses
 * the *instance*. Kinds are chosen by what the corridor is made of, which is
 * how the slice dresses its own beats: lamps and benches beside pavement, trees
 * and shrubs beside dirt and gravel. Everything lands outside the rideable
 * corridor, and `buildPlan.ts` refuses anything that does not, so a mistake
 * here costs a missing tree rather than an invisible wall.
 */
function vergeDressing(
  spec: SegmentSpec,
  draw: () => number,
): SegmentProp[] {
  const paved = spec.surface === 'pavement' || spec.surface === 'roughPavement';
  const kinds: readonly PropKind[] = paved
    ? ['lampPost', 'broadleafTree', 'bench', 'litterBin', 'shrub']
    : ['conifer', 'broadleafTree', 'shrub', 'shrub'];

  /**
   * Which way a thing faces on the verge.
   *
   * `facingRoute` for anything with a front — a bench, a lamp head, a sign —
   * because a bench turned along the road is a bench nobody could sit on and
   * looks it. Anything radially symmetric is spun by the stream instead, so a
   * verge reads as planting rather than as a row of clones. The first draft
   * gave everything a yaw of 0 or π, which is side-on to the route for all of
   * them; the owner saw it on his first ride.
   */
  const facing = (kind: PropKind, t: number, spin: number): number => (
    kind === 'bench' || kind === 'lampPost' || kind === 'signpost'
      ? facingRoute(t)
      : spin * Math.PI * 2
  );

  const props: SegmentProp[] = [];
  const spacing = paved ? 14 : 11;
  for (let s = spacing * 0.5; s < spec.length; s += spacing) {
    for (const side of [1, -1]) {
      if (draw() > 0.62) continue;
      const kind = kinds[Math.floor(draw() * kinds.length) % kinds.length];
      // Just off the corridor edge, and the narrowness is the point.
      //
      // The shoulder eases the corridor down to the surround over seven metres,
      // so a prop five metres out is most of the way down a bank — which on a
      // route standing five metres above its field is a lamp post sunk to its
      // shoulders when seen from the road. That is one of the two defects the
      // owner reported from his first ride. Within about two and a half metres
      // the ease has barely begun (a tenth of the drop at 1.4 m), so the verge
      // still sits at road level and still reads as a verge.
      const t = side * (spec.halfWidth + 1.2 + draw() * 1.4);
      props.push({
        s: s + (draw() - 0.5) * spacing * 0.6,
        t,
        kind,
        yaw: facing(kind, t, draw()),
        scale: 0.85 + draw() * 0.4,
      });
    }
  }
  return props;
}

/** Every connector spec in a laid graph, wherever it sits. */
function connectorSpecs(graph: { main: SegmentSpec[]; branches: SegmentBranch[] }): {
  replace: (next: SegmentSpec) => void; spec: SegmentSpec;
}[] {
  const out: { replace: (next: SegmentSpec) => void; spec: SegmentSpec }[] = [];
  const visit = (list: SegmentSpec[]): void => {
    for (let index = 0; index < list.length; index += 1) {
      const spec = list[index];
      if (!spec.id.startsWith('link-')) continue;
      out.push({ spec, replace: (next) => { list[index] = next; } });
    }
  };
  visit(graph.main);
  for (const branch of graph.branches) visit(branch.specs as SegmentSpec[]);
  return out;
}

/**
 * The terrain pass: how much each neutral join rises or falls.
 *
 * Every connector gets a grade, bends included — a bend that climbs is the same
 * bend in plan view. Beats are never touched: a beat's elevation is the owner's
 * and is part of what the beat teaches.
 *
 * **It is not a free draw, and the owner's first ride is why.** The beats carry
 * their own climbs — the return climb rises five metres, the park gate drops
 * two and a half — and a route that happens to string several risers together
 * ends up perched a dozen metres above the surround. Every shoulder is then an
 * embankment, every prop beside the route is standing on a bank, and the kerb
 * at a corridor's edge overhangs a drop. Measured on the seed he rode: 13.2 m
 * above the surround, against the hand-authored slice's 6.7 m below it.
 *
 * So the pass draws with a **pull toward the surround**: the further the route
 * has strayed by the time it reaches a join, the more the grades that come back
 * are weighted. It is still the terrain seed's decision — two seeds give two
 * different elevation profiles — and it is still a choice rather than a repair,
 * because it is made while the world is being built and not to a finished one
 * that failed. `ROUTE_ELEVATION_BAND` is the contract that actually decides.
 */
function applyGrades(
  graph: { main: SegmentSpec[]; branches: SegmentBranch[] },
  terrain: RandomStream,
  surround: number,
): void {
  const connectors = connectorSpecs(graph);
  for (const entry of connectors) {
    const family = entry.spec.id.split('@')[0].split('-').slice(0, 2).join('-');
    const grades = FAMILY_GRADES.get(family);
    if (grades === undefined || grades.length === 0) continue;

    // Where the route has got to by this join. Re-placed each time, because the
    // grade chosen for one connector moves everything after it.
    const placed = placeGraph(graph, SPAWN);
    const here = placed.find((segment) => segment.spec.id === entry.spec.id);
    const drift = (here?.entry.position.y ?? 0) - surround;

    const chosen = terrain.weighted([...grades], (climb) => {
      // A grade that shortens the distance back to the surround is preferred in
      // proportion to how far out the route already is; at the surround itself
      // every grade weighs the same and the seed chooses freely.
      const after = Math.abs(drift + climb);
      const now = Math.abs(drift);
      const pull = Math.max(0, now - ROUTE_ELEVATION_BAND * 0.4) / ROUTE_ELEVATION_BAND;
      return 1 + pull * 6 * (after < now ? 1 : 0);
    });

    // Only the elevation profile moves. The id keeps its instance suffix, so
    // every branch root and through-line reference still resolves.
    entry.replace({ ...entry.spec, climb: chosen });
  }
}

/**
 * Optional branches the finished terrain has left standing on a wall.
 *
 * **This has to run after the terrain pass, and the first draft's bug was that
 * it did not.** Branches are checked for fit while the route is being laid, and
 * at that point every neutral join is still flat; the terrain pass then gives
 * them grades and everything downstream moves in Y. A pocket that sat at ground
 * level when it was accepted can end up four metres up by the time the world is
 * finished — which is how an alley ledge authored with *no* shoulder at all came
 * out perched on an 82° face.
 *
 * Dropping rather than retrying is master §6.3 by name: the route itself is
 * untouched and only content the design calls optional goes. A branch whose
 * parent has just been dropped goes with it, or `placeGraph` is asked to root
 * one on a segment nobody placed.
 */
function dropWalledBranches(
  graph: { main: SegmentSpec[]; branches: SegmentBranch[] },
  optional: readonly { branch: SegmentBranch; ids: readonly string[] }[],
  optionalIds: string[],
  surround: number,
): void {
  const dropped = new Set<string>();

  for (let pass = 0; pass < optional.length + 1; pass += 1) {
    const placed = placeGraph(graph, SPAWN);
    const present = new Set(placed.map((segment) => segment.spec.id));
    let removed = false;

    for (const entry of optional) {
      if (graph.branches.indexOf(entry.branch) < 0) continue;
      const orphaned = !present.has(entry.branch.from);
      const walled = !orphaned && placed.some((segment) => {
        if (!entry.ids.includes(segment.spec.id)) return false;
        const shoulder = segment.spec.shoulder ?? DEFAULT_SHOULDER;
        return [segment.entry, segment.exit].some((socket) => Math.atan(
          Math.abs(socket.position.y - surround) / Math.max(shoulder, 0.5),
        ) > SHOULDER_SLOPE_CEILING);
      });
      if (!orphaned && !walled) continue;

      graph.branches.splice(graph.branches.indexOf(entry.branch), 1);
      for (const id of entry.ids) {
        dropped.add(id);
        const at = optionalIds.indexOf(id);
        if (at >= 0) optionalIds.splice(at, 1);
      }
      removed = true;
    }

    if (!removed) break;
  }
}

/** The surfaces pass: what the verge of each neutral join is made of. */
function applyVergeBands(
  graph: { main: SegmentSpec[]; branches: SegmentBranch[] },
  surfaces: RandomStream,
): void {
  for (const entry of connectorSpecs(graph)) {
    const bands = vergeBands(entry.spec, () => surfaces.next());
    entry.replace(bands === undefined
      ? entry.spec
      : { ...entry.spec, bands });
  }
}

/** The dressing pass: furniture on the verge of each neutral join. */
function applyVergeDressing(
  graph: { main: SegmentSpec[]; branches: SegmentBranch[] },
  dressing: RandomStream,
): void {
  for (const entry of connectorSpecs(graph)) {
    const props = vergeDressing(entry.spec, () => dressing.next());
    entry.replace(props.length === 0 ? entry.spec : { ...entry.spec, props });
  }
}

// ---------------------------------------------------------------------------
// What the generator puts in the road — M13 Phase 3
// ---------------------------------------------------------------------------

/**
 * Ground a hazard may sit on.
 *
 * Hard surfaces only, and the reason is the fiction rather than the physics. A
 * pothole is broken asphalt: the mesh is crushed aggregate around a dark pit
 * (`render/hazards.ts`), and the same shape on a gravel spur or a dirt trail is
 * a rut, which is a different thing that this game does not model. A spill is
 * liquid *lying* on a surface, and a puddle on grass is a bog. Brick is in
 * because the plaza is brick and a broken paver is exactly a pothole; wood is
 * out because the boardwalk is planks and a hole in planks is a hole through.
 */
const HAZARD_SURFACES: ReadonlySet<SurfaceId> = new Set<SurfaceId>([
  'pavement', 'roughPavement', 'brick',
]);

/**
 * How likely a hazard is at each eligible station, and how the kinds divide.
 *
 * The chance is **anchored on the wobble model and scaled by a taste**, and the
 * split matters — it is `HazardRules.chancePerStation` and it is stated there.
 * The *anchor* is M13's derivation on the shipped wheel: a station is
 * `HAZARD_RULES.profileStep` metres of road, so a per-station chance of
 * `profileStep / separationMetres` makes the average wait beyond the fairness
 * floor equal to one more separation, and a rider meets a hazard about every
 * two recovery distances — twelve or so on a route of eleven hundred metres.
 * That half follows the wobble model, and evaluating it on the default instance
 * is what keeps a default build byte-identical.
 *
 * The *scaling* with the wheel is not derived from anything: a faster wheel is
 * given a denser road on purpose (`HAZARD.densityTopSpeedExponent` carries the
 * decision and its reason), because the reason to ride faster is the thrill and
 * an emptier road is the opposite of one. The fairness floor beside it does not
 * move with that taste, so what a fast route actually carries is the taste's
 * offer minus whatever the floor and the four contracts below refuse.
 *
 * The kind weights are the other editorial choice here, and they say the same
 * thing §13 q8 does: **the wipeout is the rare one**. Two of the three kinds are
 * recoverable and carry the mechanic; a deep hole ends a run, and a route that
 * ends runs every eighty metres is not a route anybody rides twice.
 */
const HAZARD_PLACEMENT = {
  /**
   * **The rules' own number, read rather than recomputed** — M30. It was
   * `profileStep / separationMetres` over the *live* rules until the density
   * was decoupled from the fairness floor; that expression made a faster wheel
   * empty the road, which is the one thing the switch must not do.
   */
  chancePerStation(rules: HazardRules): number {
    return rules.chancePerStation;
  },
  weights: {
    potholeShallow: 0.45,
    spill: 0.35,
    potholeDeep: 0.20,
  } as Readonly<Record<HazardKind, number>>,
} as const;

/** The authored footprint of each kind, from the one table both passes read. */
function hazardRadius(kind: HazardKind): number {
  if (kind === 'potholeDeep') return HAZARD.deepRadius;
  if (kind === 'spill') return HAZARD.spillRadius;
  return HAZARD.shallowRadius;
}

/** One kind, by weight, from a single draw in [0, 1). */
function hazardKindFrom(roll: number): HazardKind {
  const kinds: readonly HazardKind[] = ['potholeShallow', 'spill', 'potholeDeep'];
  let total = 0;
  for (const kind of kinds) total += HAZARD_PLACEMENT.weights[kind];
  let target = roll * total;
  for (const kind of kinds) {
    target -= HAZARD_PLACEMENT.weights[kind];
    if (target < 0) return kind;
  }
  return kinds[kinds.length - 1];
}

/**
 * The hazard pass: spills and holes in the road the generator laid.
 *
 * **Constructive, and that is the whole design.** It places only where every
 * one of the four route contracts already holds, using the contracts' own
 * functions — so the contracts are post-conditions that should never fire and a
 * firing one names a bug here. The alternative shape, placing freely and
 * letting the validator reject, is wrong for a reason specific to this
 * generator: `attemptSeed` renumbers the **route** domain alone, so a rejection
 * redraws the whole world. Throwing away a route that satisfied eleven
 * contracts because a puddle landed on a socket would be spending a
 * regeneration on content, which is the trade master §6.3 refuses for optional
 * branches and refuses harder here — a hazard is not even optional content, it
 * is dressing with a rule.
 *
 * **It runs last, after every pass that can move or reskin the world, and it is
 * not fully independent of the surfaces stream. Measured: two seeds in
 * twenty-four.** The footprint itself is safe by construction — a verge band
 * begins no nearer the centreline than `HAZARD_RULES.lateralFraction` of the
 * half width, which is read off `vergeBands` for exactly this reason, and a
 * footprint reaches strictly less than that — so no draw the surfaces stream
 * makes can change what a hazard is *sitting on*. What it can change is whether
 * the hazard fits at all, because the avoidable line has to be a line the rider
 * can actually take, and a grass verge is not one. Lay grass down the shoulder
 * of a narrow join and the rideable road either side of a wide spill stops
 * being wide enough, so the station is refused.
 *
 * That is a real coupling and it is recorded rather than argued away. It is
 * narrow — **the route, the terrain and the dressing are byte-identical across
 * a surfaces reroll**, which is the guarantee master §2.5 actually asks for and
 * it still holds absolutely — and it is the right way round: a hazard is a
 * claim about grip, and grip is what the surfaces stream decides. The
 * alternative was to measure the avoidable line without regard to what it is
 * made of, which certifies a lane of grass beside a spill and makes the
 * contract's whole promise false. `generatedLevel.test.ts` states the invariant
 * as it holds rather than as it would be tidier to claim.
 *
 * Every station spends the same four draws whether or not it places anything,
 * so how far the stream has advanced is a function of the route's length and
 * nothing else — which is what makes "why did this seed put a hole here" a
 * question with a short answer.
 */
function placeHazards(
  placed: readonly PlacedSegment[],
  throughIds: readonly string[],
  checkpoints: readonly CheckpointSpec[],
  jumps: readonly RouteJump[],
  hazards: RandomStream,
  rules: HazardRules,
): HazardSpec[] {
  const profile = routeProfile(placed, throughIds);
  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));
  const solids = colliderGrid(placed.flatMap((segment) => collidersOf(segment)));

  // Gates, located exactly — the generator knows the `(segment, s)` it authored
  // them at, where the contract can only find the nearest sampled station. The
  // slack below is what keeps that difference from ever mattering.
  const gateDistances: number[] = [];
  let startDistance = 0;
  for (const gate of checkpoints) {
    const start = profile.startOf.get(gate.segment);
    if (start === undefined) continue;
    gateDistances.push(start + gate.s);
    if (gate.kind === 'start') startDistance = start + gate.s;
  }

  const specs: HazardSpec[] = [];
  const placements: { id: string; distance: number }[] = [];
  const minGap = ROUTE_CLEARANCE.minGap + rules.laneSlack;

  for (const station of profile.stations) {
    const wanted = hazards.next();
    const which = hazards.next();
    const side = hazards.next();
    const across = hazards.next();
    if (wanted >= HAZARD_PLACEMENT.chancePerStation(rules)) continue;

    const carrier = byId.get(station.segmentId);
    if (carrier === undefined) continue;

    // -- What kind, and does it fit the road at all? ------------------------
    const kind = hazardKindFrom(which);
    const room = rules.lateralFraction * carrier.spec.halfWidth;
    let radius = hazardRadius(kind);
    if (kind === 'spill') {
      // A spill shrinks to fit and a pothole does not — `HAZARD.minSpillRadius`
      // carries the argument. The raster margin is subtracted because what has
      // to fit inside the road is the cells the overpaint will select, not the
      // circle they were selected by.
      radius = Math.min(radius, room - rules.rasterMargin);
      if (radius < HAZARD.minSpillRadius) continue;
    }
    const block = hazardBlockRadius(kind, radius);
    // **`>= 0`, not `> 0`**, and the difference is a whole feature. A shrunken
    // spill has `block` exactly equal to `room` by construction, so a strict
    // test rejected every spill the clamp had just fitted — the shrink branch
    // ran, produced a legal radius, and the next line threw it away. The result
    // was that spills only ever placed at their full authored size, on roads
    // wide enough to take one whole, and `minSpillRadius` was unreachable
    // arithmetic. A footprint that exactly fills the band it is allowed is
    // legal; it simply has to sit on the centreline.
    const span = room - block;
    if (span < 0) continue;

    const t = (side < 0.5 ? -1 : 1) * span * across;
    const spec: HazardSpec = {
      id: `hazard-${station.segmentId}-${station.s.toFixed(0)}`,
      segment: station.segmentId,
      s: station.s,
      t,
      kind,
      radius,
    };

    // -- The four contracts, in cheapest-first order ------------------------
    if (hazardSpacingRefusal(
      [...placements, { id: spec.id, distance: station.distance }],
      rules,
    ) !== null) {
      continue;
    }
    if (hazardZoneRefusal(spec, carrier, {
      throughIds,
      jumps,
      gateDistances,
      startDistance,
      distance: station.distance,
      // One profile step, so a gate the contract can only locate to within half
      // a step can never look nearer to it than it looked here.
      slack: rules.profileStep,
    }) !== null) {
      continue;
    }
    if (!HAZARD_SURFACES.has(surfaceAtLateral(carrier.spec, t))
      || !HAZARD_SURFACES.has(surfaceAtLateral(carrier.spec, t - block))
      || !HAZARD_SURFACES.has(surfaceAtLateral(carrier.spec, t + block))) {
      continue;
    }

    const point = hazardPoint(carrier, station.s, t);
    // Every hazard already on this segment is a blocker too: two that each
    // leave a lane can close the road between them, and the contract measures
    // them together, so the pass has to as well.
    const lane = hazardLaneThrough(
      carrier,
      [...specs
        .filter((other) => other.segment === spec.segment)
        .map((other) => {
          const at = hazardPoint(carrier, other.s, other.t);
          return {
            s: other.s,
            x: at.x,
            z: at.z,
            radius: hazardBlockRadius(other.kind, other.radius),
          };
        }),
      { s: station.s, x: point.x, z: point.z, radius: block }],
      solids,
    );
    if (lane.narrowest < minGap) continue;

    if (hazardSightBlocked(profile, station.distance, point) !== null) continue;

    specs.push(spec);
    placements.push({ id: spec.id, distance: station.distance });
  }

  return specs;
}

/**
 * How often the target pass tries at all, per station.
 *
 * Low, and the density contract is what actually bounds the result — this only
 * has to be generous enough that the contract, rather than the dice, is the
 * thing deciding. The stations a route offers scale with its length, so a rate
 * per station is a rate per metre.
 */
const TARGET_CHANCE_PER_STATION = 0.09;

/**
 * The target pass: things to swing at, on the verges of the world just built.
 *
 * **Constructive, and after everything**, on `placeHazards`'s terms with one
 * genuine difference: this runs on the **finished `LevelPlan`** rather than on
 * the laid route. It has to. The clearance a stand needs is clearance from the
 * *dressing* — and `plan.solids` and `plan.softBodies` are derived inside
 * `buildLevelPlan` from props placed after the route was laid, so a pass
 * running before the plan exists cannot see a single tree, bin or shrub.
 *
 * **The shrubs are the reason this is stated rather than assumed.** M15 moved
 * all 196 of them out of `plan.solids` into `plan.softBodies`, so the obvious
 * "no collider overlap" predicate silently stopped covering bushes — and a
 * stand planted inside one renders wrong, plays wrong, and fires no contract at
 * all, because nothing about a target is a collider and nothing about a soft
 * body is either. `standClear` below reads both arrays and the props' own
 * footprints, and `docs/PLANS.md` lists this as the sixth silent failure.
 *
 * Targets are purely additive to a finished plan — they paint no heightfield
 * cell, move nothing, and are read by nothing else — which is what makes
 * placing them here cost one pass rather than a second whole build.
 *
 * Every station spends the same three draws whether or not it places anything,
 * so how far the stream has advanced is a function of the route's length and
 * nothing else.
 */
function placeTargets(
  plan: LevelPlan,
  placed: readonly PlacedSegment[],
  throughIds: readonly string[],
  targets: RandomStream,
  rules: TargetRules,
): TargetSpec[] {
  const profile = routeProfile(placed, throughIds);
  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));
  const groundAt = (x: number, z: number): number =>
    fieldHeightAt(plan.heightfield, plan.surround, x, z);

  // Everything a foot has to stand clear of. Colliders and solids stop a wheel;
  // soft bodies do not stop anything, which is exactly why they need saying —
  // a bush is invisible to every existing clearance rule in this file.
  const obstacles: BoxCollider[] = [];
  for (const segment of plan.segments) obstacles.push(...segment.colliders);
  obstacles.push(...(plan.solids ?? []));
  obstacles.push(...(plan.softBodies ?? []));

  const standClear = (x: number, z: number): boolean => {
    for (const box of obstacles) {
      const reach = Math.hypot(box.halfExtents.x, box.halfExtents.z) + TARGET.standClearance;
      const dx = x - box.centre.x;
      const dz = z - box.centre.z;
      if (dx * dx + dz * dz > reach * reach) continue;
      // Into the box's own frame, against its true half-extents plus the
      // clearance the stand's foot wants around itself.
      const cos = Math.cos(box.rotationY);
      const sin = Math.sin(box.rotationY);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      if (Math.abs(localX) <= box.halfExtents.x + TARGET.standClearance
        && Math.abs(localZ) <= box.halfExtents.z + TARGET.standClearance) return false;
    }
    return true;
  };

  const gateDistances: number[] = [];
  for (const gate of plan.checkpoints) {
    let best = Infinity;
    let at = 0;
    for (const station of profile.stations) {
      const distance = Math.hypot(station.x - gate.centre.x, station.z - gate.centre.z);
      if (distance >= best) continue;
      best = distance;
      at = station.distance;
    }
    if (best < Infinity) gateDistances.push(at);
  }

  let requiredLength = 0;
  for (const id of throughIds) requiredLength += byId.get(id)?.spec.length ?? 0;

  const specs: TargetSpec[] = [];
  const placements: { id: string; distance: number }[] = [];

  for (const station of profile.stations) {
    const wanted = targets.next();
    const side = targets.next();
    const reach = targets.next();
    if (wanted >= TARGET_CHANCE_PER_STATION) continue;

    const carrier = byId.get(station.segmentId);
    if (carrier === undefined) continue;

    // The foot goes just outside the corridor, a little further out on some
    // stations than others so a route does not read as a fence.
    const standoff = rules.vergeStandoff * (1 + reach * 0.6);
    const t = (side < 0.5 ? -1 : 1) * (carrier.spec.halfWidth + standoff);
    const spec: TargetSpec = {
      id: `target-${station.segmentId}-${station.s.toFixed(0)}`,
      segment: station.segmentId,
      s: station.s,
      t,
    };

    // -- The contracts' own predicates, in cheapest-first order -------------
    if (station.s < rules.socketClearMetres
      || carrier.spec.length - station.s < rules.socketClearMetres) continue;

    let nearGate = false;
    for (const gate of gateDistances) {
      if (Math.abs(station.distance - gate) < rules.gateClearMetres) nearGate = true;
    }
    if (nearGate) continue;

    if (targetSpacingRefusal(
      [...placements, { id: spec.id, distance: station.distance }],
      requiredLength,
      rules,
    ) !== null) continue;

    if (targetStandRefusal(carrier, station.s, t, groundAt) !== null) continue;

    const foot = hazardPoint(carrier, station.s, t);
    if (!standClear(foot.x, foot.z)) continue;

    specs.push(spec);
    placements.push({ id: spec.id, distance: station.distance });
  }

  return specs;
}

/** One attempt at a route, and why it failed if it did. */
interface LayResult {
  readonly route: LaidRoute | null;
  readonly reason: string;
}

function layRoute(
  streams: ReturnType<typeof createSeedStreams>,
  hazardRules: HazardRules,
): LayResult {
  const route = streams.route;
  const terrain = streams.terrain;
  const surfaces = streams.surfaces;
  const dressing = streams.dressing;

  const graph: { main: SegmentSpec[]; branches: SegmentBranch[] } = { main: [], branches: [] };
  const adjacency = new Map<string, Set<string>>();
  const pieceOf = new Map<string, string>();
  const pieces: LaidPiece[] = [];
  const throughIds: string[] = [];
  const optionalIds: string[] = [];
  const jumps: RouteJump[] = [];
  const shortcuts: RouteShortcut[] = [];
  const beatUses = new Map<string, number>();
  /** Every optional branch actually laid, so the terrain pass can revisit them. */
  const optionalLaid: { branch: SegmentBranch; ids: readonly string[] }[] = [];

  let placed: PlacedSegment[] = [];
  let requiredLength = 0;
  let triangles = 0;
  let current: LibraryPiece | null = null;
  /**
   * The last *beat*, which is not the last piece.
   *
   * A neutral join between two boulevards does not stop them being two
   * boulevards in a row, and forty metres of blank road between them arguably
   * makes it read worse rather than better. So the no-repeat rule is tracked
   * against the beats a rider would name, not against the pieces the generator
   * happened to place.
   */
  let lastBeat: string | null = null;
  let attachTo: string | undefined;

  const link = (a: string, b: string): void => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };

  for (let step = 0; step < GENERATION.maxPieces; step += 1) {
    // -- Choose ------------------------------------------------------------
    // A local binding, because `current` is reassigned at the end of the loop
    // and a closure over it would not narrow.
    const from: LibraryPiece | null = current;
    const beats: LibraryPiece[] = LIBRARY_BEATS.filter((piece) => {
      // The first piece has nothing to match, so the only requirement is
      // somewhere wide enough to find the throttle in before the level asks
      // for anything — the same argument the plaza makes in the slice.
      if (from === null) return piece.entry.halfWidth >= 7;
      if (!canFollow(from, piece)) return false;
      // A beat immediately after itself is the single most obvious way for a
      // stitched route to read as a corridor rather than a place, and it is
      // free to refuse.
      if (piece.id === lastBeat) return false;
      return (beatUses.get(piece.id) ?? 0) < GENERATION.maxBeatUses;
    });
    const connectors: LibraryPiece[] = from === null
      ? []
      : CONNECTOR_POOL.filter((piece) => canFollow(from, piece));

    if (beats.length === 0 && connectors.length === 0) {
      return {
        route: null,
        reason: `nothing in the library can follow ${from?.id ?? 'the start'} — a library `
          + 'gap rather than an unlucky seed',
      };
    }

    const wantBeat = beats.length > 0 && (
      connectors.length === 0
      || route.next() > GENERATION.connectorWeight / (GENERATION.connectorWeight + 3)
    );
    const pool = wantBeat ? beats : connectors;

    // Try candidates in a seeded order until one fits. Choosing among what is
    // legal is construction; it is not repair.
    //
    // The order is drawn by weight without replacement rather than shuffled
    // flat, because two of the weights carry real design intent:
    //
    //   - **An unused beat is strongly preferred.** A route made of one beat
    //     five times is valid and is not a place, and variety is the cheapest
    //     thing that fights the valid-but-joyless risk `docs/PLANS.md` §12
    //     gates this milestone on.
    //   - **The opening piece is weighted by how much room it gives.** §6's
    //     beat 1 is a wide brick square on purpose — "a rider gets a wide brick
    //     square to find the throttle in before the level asks for anything" —
    //     and a route that opens on a curb run starts the player on a hop
    //     lesson. Weighted by the square of the entry width, so the plaza wins
    //     most of the time and the other wide beats still get a turn.
    const weightOf = (piece: LibraryPiece): number => {
      if (from === null) return piece.entry.halfWidth ** 2;
      if (piece.role === 'connector') return GENERATION.connectorWeight;
      const uses = beatUses.get(piece.id) ?? 0;
      return uses === 0 ? GENERATION.unusedBeatWeight : GENERATION.usedBeatWeight / uses;
    };

    const remaining = [...pool];
    const shuffled: LibraryPiece[] = [];
    while (remaining.length > 0) {
      const picked = route.weighted(remaining, weightOf);
      shuffled.push(picked);
      remaining.splice(remaining.indexOf(picked), 1);
    }

    let chosen: Candidate | null = null;

    for (const candidate of shuffled) {
      const instance = `${step}`;
      const relaid = instantiate(candidate, instance, { attachTo, dropOptional: true });
      const main = [...relaid.main];
      const branches = [...relaid.branches];

      const trial = {
        main: graph.main.length === 0 ? main : graph.main,
        branches: graph.main.length === 0 ? [...graph.branches, ...branches]
          : [...graph.branches, ...branches],
      };
      const trialPlaced = placeGraph(trial, SPAWN);
      const fresh = trialPlaced.filter(
        (segment) => !placed.some((old) => old.spec.id === segment.spec.id),
      );

      // Provisional adjacency, so the crossing check does not report the seam
      // this piece was just attached by.
      const provisional = new Map<string, Set<string>>();
      for (const [id, set] of adjacency) provisional.set(id, new Set(set));
      const linkProvisional = (a: string, b: string): void => {
        if (!provisional.has(a)) provisional.set(a, new Set());
        if (!provisional.has(b)) provisional.set(b, new Set());
        provisional.get(a)!.add(b);
        provisional.get(b)!.add(a);
      };
      const ids = fresh.map((segment) => segment.spec.id);
      for (let index = 1; index < ids.length; index += 1) linkProvisional(ids[index - 1], ids[index]);
      for (const id of ids) if (attachTo !== undefined) linkProvisional(attachTo, id);

      const collides = fresh.some((segment) => meetsBadly(
        segment,
        trialPlaced.filter((other) => other.spec.id !== segment.spec.id),
        provisional,
      ));
      if (collides) continue;

      chosen = {
        piece: candidate,
        instance,
        segments: fresh,
        main,
        branches,
        exitSegmentId: relaid.exitSegmentId,
        throughIds: relaid.throughIds,
        optional: instantiate(candidate, instance, { attachTo }).optional,
      };
      break;
    }

    if (chosen === null) {
      // Nothing legal fits here. If the route is already long enough, stop;
      // otherwise the attempt has run out of room and is abandoned whole.
      if (requiredLength >= REQUIRED_ROUTE_FLOOR_METRES) break;
      return {
        route: null,
        reason: `the route boxed itself in after ${pieces.length} pieces and `
          + `${requiredLength.toFixed(0)} m: every legal continuation from `
          + `${current?.name ?? 'the start'} would cross ground already laid`,
      };
    }

    // -- Commit ------------------------------------------------------------
    if (graph.main.length === 0) graph.main = chosen.main;
    graph.branches.push(...chosen.branches);

    const freshIds = chosen.segments.map((segment) => segment.spec.id);
    for (let index = 1; index < freshIds.length; index += 1) link(freshIds[index - 1], freshIds[index]);
    if (attachTo !== undefined) for (const id of freshIds) link(attachTo, id);

    placed = placeGraph(graph, SPAWN);
    for (const id of chosen.throughIds) {
      throughIds.push(id);
      requiredLength += placed.find((segment) => segment.spec.id === id)?.spec.length ?? 0;
      triangles += segmentCost(id.split('@')[0]).triangles;
    }

    // The kicker's landing is a through branch, and it is the one jump the
    // library carries. Named from the piece rather than guessed from geometry.
    if (chosen.piece.id === 'kicker') {
      jumps.push({
        name: `the kicker (${chosen.instance})`,
        lipId: `kicker-run@${chosen.instance}`,
        landingId: `kicker-land@${chosen.instance}`,
      });
    }

    // -- Optional branches: dropped, never retried (master §6.3) -----------
    for (const optional of chosen.optional) {
      if (route.next() > GENERATION.optionalKeepChance) continue;
      // A branch off a branch — the alley-only ledge hangs off the alley, not
      // off the route the alley leaves. Dropping the alley has to drop the
      // ledge with it, or `placeGraph` is asked to root a branch on a segment
      // nobody placed. Found by a forty-seed sweep, which is what sweeps are for.
      if (!placed.some((segment) => segment.spec.id === optional.branch.from)) continue;
      const trial = { main: graph.main, branches: [...graph.branches, optional.branch] };
      const trialPlaced = placeGraph(trial, SPAWN);
      const fresh = trialPlaced.filter((segment) => optional.ids.includes(segment.spec.id));
      const provisional = new Map<string, Set<string>>();
      for (const [id, set] of adjacency) provisional.set(id, new Set(set));
      const ids = [optional.branch.from, ...optional.ids];
      for (let index = 1; index < ids.length; index += 1) {
        if (!provisional.has(ids[index - 1])) provisional.set(ids[index - 1], new Set());
        if (!provisional.has(ids[index])) provisional.set(ids[index], new Set());
        provisional.get(ids[index - 1])!.add(ids[index]);
        provisional.get(ids[index])!.add(ids[index - 1]);
      }
      const collides = fresh.some((segment) => meetsBadly(
        segment,
        trialPlaced.filter((other) => other.spec.id !== segment.spec.id),
        provisional,
      ));
      if (collides) continue;

      // And a pocket whose own shoulder cannot reach the surround is dropped
      // rather than retried (master §6.3). The alley is authored with a
      // two-metre shoulder and its ledge with none at all, because in the slice
      // they sit at the level of the ground beside them; where the route has
      // climbed five metres they would stand on a wall.
      const walled = fresh.some((segment) => {
        const shoulder = segment.spec.shoulder ?? DEFAULT_SHOULDER;
        return [segment.entry, segment.exit].some((socket) => Math.atan(
          Math.abs(socket.position.y - SPAWN.position.y) / Math.max(shoulder, 0.5),
        ) > SHOULDER_SLOPE_CEILING);
      });
      if (walled) continue;

      graph.branches.push(optional.branch);
      optionalLaid.push({ branch: optional.branch, ids: optional.ids });
      placed = trialPlaced;
      optionalIds.push(...optional.ids);
      for (let index = 1; index < ids.length; index += 1) link(ids[index - 1], ids[index]);
      for (const id of optional.ids) triangles += segmentCost(id.split('@')[0]).triangles;

      // The alley is the library's one shortcut, and a shortcut has to come
      // back — which is what `checkReconnect` then proves rather than assumes.
      if (optional.name === 'alley shortcut') {
        shortcuts.push({
          name: `alley (${chosen.instance})`,
          fromId: optional.branch.from,
          exitId: optional.ids[optional.ids.length - 1],
          rejoinId: chosen.exitSegmentId,
        });
      }
    }

    for (const segment of placed) {
      if (!pieceOf.has(segment.spec.id)) pieceOf.set(segment.spec.id, `${chosen.piece.id}@${chosen.instance}`);
    }
    pieces.push({
      piece: chosen.piece,
      instance: chosen.instance,
      exitSegmentId: chosen.exitSegmentId,
      throughIds: chosen.throughIds,
      optionalIds: chosen.optional.flatMap((entry) => entry.ids),
      shortcuts: [],
      jumps: [],
    });
    if (chosen.piece.beat !== null) {
      beatUses.set(chosen.piece.id, (beatUses.get(chosen.piece.id) ?? 0) + 1);
      lastBeat = chosen.piece.id;
    }
    attachTo = chosen.exitSegmentId;
    current = chosen.piece;

    if (triangles > PRESCREEN_TRIANGLE_CEILING) {
      return {
        route: null,
        reason: `the pre-screen put the route past ${PRESCREEN_TRIANGLE_CEILING.toFixed(0)} `
          + 'triangles before it was even rasterised',
      };
    }
    if (requiredLength >= REQUIRED_ROUTE_FLOOR_METRES && chosen.piece.beat !== null) break;
  }

  if (requiredLength < REQUIRED_ROUTE_FLOOR_METRES) {
    return {
      route: null,
      reason: `the route reached the ${GENERATION.maxPieces}-piece ceiling at only `
        + `${requiredLength.toFixed(0)} m, short of the `
        + `${REQUIRED_ROUTE_FLOOR_METRES.toFixed(0)} m floor`,
    };
  }

  // -- The three passes that run after the route exists ---------------------
  //
  // **Order matters, and so does the fact that they run here rather than inside
  // the search.** The first draft applied them to every candidate the search
  // *tried*, which meant the cosmetic streams were consumed by routes that were
  // then thrown away — so a dressing reroll could shift which candidate a later
  // draw landed on. Running them over the finished route makes the independence
  // structural instead of incidental: `surfaces` and `dressing` cannot alter one
  // metre of geometry because by the time they draw, the geometry is decided.
  //
  // `terrain` is different and the difference is worth stating. It is not a
  // cosmetic domain — it is the ground — so it *does* change the world, and a
  // route that was legal flat can be illegal on hills. That is a rejection and
  // a retry, not a repair.
  applyGrades(graph, terrain, SPAWN.position.y);
  dropWalledBranches(graph, optionalLaid, optionalIds, SPAWN.position.y);
  applyVergeBands(graph, surfaces);
  applyVergeDressing(graph, dressing);
  placed = placeGraph(graph, SPAWN);

  // **The hazard pass runs last, on the finished world** (M13 Phase 3). It is
  // the only pass that has to see the ground exactly as the player will meet
  // it: a sight line is drawn over the elevation the terrain stream chose, and
  // a hazard on a branch the walled-branch drop has just removed would be a
  // hole in a piece of road nobody placed. It reads no draw any earlier pass
  // made — see `placeHazards` for why running after the verge bands does not
  // make it a function of the surfaces seed.
  const checkpoints = routeCheckpoints(placed, throughIds);
  const hazardSpecs = placeHazards(
    placed,
    throughIds,
    checkpoints,
    jumps,
    streams.hazards,
    hazardRules,
  );

  return {
    reason: '',
    route: {
      graph,
      placed,
      pieces,
      throughIds,
      optionalIds,
      jumps,
      shortcuts,
      adjacency,
      pieceOf,
      requiredLength,
      checkpoints,
      hazards: hazardSpecs,
    },
  };
}

// ---------------------------------------------------------------------------
// Dressing the world around the route
// ---------------------------------------------------------------------------

/**
 * How far a building has to stand back from anything rideable, metres.
 *
 * **`buildPlan.ts` already refuses a prop standing *in* a corridor, and that is
 * not the same question.** Its half-metre is a rideability rule: it stops a
 * rider meeting a tree on the road. A twenty-metre block half a metre off the
 * kerb is perfectly rideable and reads as a wall growing out of the pavement,
 * which is what the owner saw on his first ride of a generated route — and the
 * hand-authored slice has one at 1.9 m, so it is not a generator-only problem,
 * only a generator-scale one.
 *
 * A corridor's shoulder is the ground that blends it into the field around it,
 * so a building inside the shoulder is standing on the embankment. Clearing the
 * shoulder is therefore the derived answer rather than a chosen distance: it is
 * exactly the width of the ground that belongs to the road.
 */
const BUILDING_STAND_BACK = DEFAULT_SHOULDER;

/** How far outside every corridor a point stands. Infinity when nothing is near. */
function corridorStandoff(placed: readonly PlacedSegment[], x: number, z: number): number {
  let worst = Infinity;
  for (const segment of placed) {
    const query = querySegment(segment, x, z);
    if (query === null) continue;
    const clear = query.outside - (segment.spec.shoulder ?? DEFAULT_SHOULDER);
    if (clear < worst) worst = clear;
  }
  return worst;
}

/**
 * A ring of blocks on the horizon, and scattered planting in between.
 *
 * Level-wide dressing rather than a beat's own: it belongs to the world and not
 * to whichever piece happens to point at it, which is exactly the argument
 * `buildPlan.ts`'s `props` option was added for. Both are drawn from the
 * `dressing` stream alone, so rerolling it changes the scenery and not one
 * metre of the route.
 *
 * `buildPlan.ts` refuses anything that would stand in a rideable corridor and,
 * for a generated level, anything standing on ground too steep to stand on — so
 * the scatter can be generous and let the builder do the filtering. A prop that
 * lands badly costs a missing tree, never an invisible wall.
 *
 * **Buildings are the exception and are filtered here**, because the builder's
 * rule is about riding and this one is about looking: see
 * `BUILDING_STAND_BACK`.
 */
function worldDressing(
  placed: readonly PlacedSegment[],
  draw: () => number,
): { x: number; z: number; rotationY: number; scale: number; lift: number;
  kind: PropKind; size?: Vec3 }[] {
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const segment of placed) {
    minX = Math.min(minX, segment.minX); maxX = Math.max(maxX, segment.maxX);
    minZ = Math.min(minZ, segment.minZ); maxZ = Math.max(maxZ, segment.maxZ);
  }
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;
  const radiusX = (maxX - minX) / 2 + 90;
  const radiusZ = (maxZ - minZ) / 2 + 90;

  const props: ReturnType<typeof worldDressing> = [];

  // The skyline. Scaled to the route's own bounds so a long route is not ringed
  // by towers standing in the middle of it — and any block that still lands too
  // near the road is pushed outward rather than dropped, because a gap in a
  // skyline is as visible as a tower on the pavement.
  const blocks = 72;
  for (let index = 0; index < blocks; index += 1) {
    const angle = (index / blocks) * Math.PI * 2 + draw() * 0.06;
    const height = 14 + draw() * 46;
    const width = 10 + draw() * 16;
    const depth = width * (0.7 + draw() * 0.6);
    const rotationY = draw() * Math.PI;
    const reach = Math.hypot(width, depth) / 2;

    let placedIt = false;
    for (let push = 0; push < 6 && !placedIt; push += 1) {
      const spread = 1 + draw() * 0.55 + push * 0.22;
      const x = centreX + Math.cos(angle) * radiusX * spread;
      const z = centreZ + Math.sin(angle) * radiusZ * spread;
      if (corridorStandoff(placed, x, z) - reach < BUILDING_STAND_BACK) continue;
      props.push({
        kind: 'building', x, z, rotationY, scale: 1, lift: 0,
        size: { x: width, y: height, z: depth },
      });
      placedIt = true;
    }
  }

  // Planting between the route and the skyline, on a jittered grid so it reads
  // as open ground rather than as an orchard.
  const cell = 26;
  for (let x = minX - 40; x < maxX + 40; x += cell) {
    for (let z = minZ - 40; z < maxZ + 40; z += cell) {
      if (draw() > 0.4) continue;
      const kind: PropKind = draw() > 0.55 ? 'conifer' : (draw() > 0.4 ? 'broadleafTree' : 'shrub');
      props.push({
        kind,
        x: x + draw() * cell,
        z: z + draw() * cell,
        rotationY: draw() * Math.PI * 2,
        scale: 0.8 + draw() * 0.5,
        lift: 0,
      });
    }
  }

  return props;
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

/**
 * Six gates along the through line, evenly spaced by distance.
 *
 * Deliberately deterministic rather than seeded: where a gate goes is a
 * consequence of the route, and a second random choice on top of it would make
 * two builds of one seed differ for no reason a player could see. Every gate
 * sits on the required route, so a run is timed over ground both lines share —
 * the rule `SLICE_CHECKPOINTS` states at length and for the same reason.
 */
function routeCheckpoints(
  placed: readonly PlacedSegment[],
  throughIds: readonly string[],
): CheckpointSpec[] {
  const byId = new Map(placed.map((segment) => [segment.spec.id, segment]));
  const legs: { id: string; from: number; length: number }[] = [];
  let total = 0;
  for (const id of throughIds) {
    const segment = byId.get(id);
    if (segment === undefined) continue;
    legs.push({ id, from: total, length: segment.spec.length });
    total += segment.spec.length;
  }
  if (legs.length === 0 || total <= 0) return [];

  const count = Math.min(GENERATION.checkpointCount, legs.length);
  const out: CheckpointSpec[] = [];
  for (let index = 0; index < count; index += 1) {
    // Inset from both ends so the first gate is not on the spawn and the last
    // is not on the final metre of the world.
    const distance = total * (0.04 + (0.92 * index) / Math.max(1, count - 1));
    const leg = legs.find((entry) => distance < entry.from + entry.length) ?? legs[legs.length - 1];
    // Never on a seam: a gate on a socket is a gate whose volume straddles two
    // corridors that may disagree about their heading.
    const s = Math.min(leg.length - 4, Math.max(4, distance - leg.from));
    out.push({
      id: index === 0 ? 'start' : index === count - 1 ? 'finish' : `split-${index}`,
      segment: leg.id,
      s,
      kind: index === 0 ? 'start' : index === count - 1 ? 'finish' : 'split',
      label: index === 0 ? 'Start' : index === count - 1 ? 'Finish' : `Split ${index}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

export interface GenerationReport {
  readonly seed: string;
  /** How many routes were drawn. One means the first attempt validated. */
  readonly attempts: number;
  /** Why each rejected attempt was rejected, in order. */
  /**
   * Why each discarded layout was discarded.
   *
   * `contracts` was added at M14 beside `reasons`, and it is the field a survey
   * actually wants: a detail string starts with whatever the failing thing was
   * *called* — usually a segment id — so counting first words across a sweep
   * produces a histogram of beat names rather than of rules. What is worth
   * reading is which contract turned a layout away and how often, because a
   * contract that never fires is either unreachable or misspelled and the two
   * are indistinguishable from the output side.
   */
  readonly rejections: readonly {
    readonly attempt: number;
    readonly reasons: readonly string[];
    readonly contracts: readonly string[];
  }[];
  /** True when every attempt failed and the hand-authored slice was emitted. */
  readonly usedFallback: boolean;
  readonly verdict: RouteVerdict;
  /** The beats the emitted route contains, in riding order. */
  readonly beats: readonly string[];
  readonly requiredLength: number;
  readonly optionalSegments: number;
  readonly drawCallsPredicted: number;
  readonly trianglesPredicted: number;
  /**
   * How many values each stream drew.
   *
   * The evidence that a pass was actually reached. A domain reported as zero is
   * a domain whose seed cannot matter, which is exactly the kind of silent
   * no-op that makes a four-stream design look right and behave like one
   * stream — and it is how the first draft's `terrain` and `surfaces` passes
   * were caught doing nothing.
   */
  readonly draws: Readonly<Record<SeedDomain, number>>;
}

export interface GeneratedLevel {
  readonly plan: LevelPlan;
  readonly layout: RouteLayout;
  readonly report: GenerationReport;
}

/**
 * What a generated level is called, and why the name has a revision in it.
 *
 * **The owner's decision of 2026-08-08** (`docs/PLANS.md` §13, under q9): when
 * M13 puts hazards into generated routes, the existing times and ghosts for a
 * seed are *retired cleanly* rather than silently compared against a course
 * that no longer exists. A personal best is filed under the plan's id
 * (`app/records.ts`) and a ghost is refused when its recorded level disagrees
 * (`simulation/ghost.ts`), so a revision in the id is the whole of the
 * migration: pre-M13 records for a seed simply stop matching, and no code has
 * to know they ever existed.
 *
 * **`r2` because revision one was the unmarked spelling.** M12 shipped
 * `generated-<seed>`, so there is no way to mark it retrospectively and no
 * reason to — a name only has to distinguish, and this one does.
 *
 * **`r3` from M14 (§13 q16), and it was already overdue when this milestone
 * spent it.** The owner's answer to q16 was to revise the id when targets
 * arrived, against the recommendation not to, on the grounds that a route which
 * now carries things to hit is not the route a Fresh-route best was set on. Two
 * changes are folded into this one revision:
 *
 *   1. **M16's top speed**, which already changed what every seed builds
 *      without anybody revising the prefix. `HAZARD_RULES.separationMetres` is
 *      derived from how far the wheel travels while a wobble decays, so raising
 *      the top speed widened the required gap from about 43 m to about 63 m and
 *      the generator now fits roughly a third fewer hazards into the same
 *      route. Records filed under `r2` since 2026-08-11 were therefore already
 *      semantically stale, and this cleans them up as well.
 *   2. **M14's targets**, which is the change q16 was actually about.
 *
 * The mapping from seed to id stays injective, which matters more than it
 * looks: because every generated level carries the prefix, a seed a player
 * happens to type as `r3-something` produces `generated-r3-r3-something` and
 * cannot collide with anybody else's world. Thirteen characters of prefix plus
 * `MAX_SEED_LENGTH` leaves twenty-seven of headroom under the sixty-four both
 * record stores independently cap a level id at.
 */
export const GENERATED_LEVEL_PREFIX = 'generated-r3-';

/**
 * The hand-authored slice, described as a route so the validator can judge it.
 *
 * Master §6.4: "a fallback is also an emitted world" and must validate itself
 * rather than be grandfathered. Every id, jump and shortcut below is read off
 * the slice's own graph.
 */
export function sliceRouteLayout(): RouteLayout {
  const plan = createSliceLevel();
  const placed = placeGraph(SLICE_GRAPH, { position: { x: 0, y: 0, z: 0 }, headingY: 0 });

  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  for (let index = 1; index < SLICE_GRAPH.main.length; index += 1) {
    link(SLICE_GRAPH.main[index - 1].id, SLICE_GRAPH.main[index].id);
  }
  for (const branch of SLICE_GRAPH.branches ?? []) {
    const ids = [branch.from, ...branch.specs.map((spec) => spec.id)];
    for (let index = 1; index < ids.length; index += 1) link(ids[index - 1], ids[index]);
  }

  const optionalIds = [
    'alley-mouth', 'alley-upper', 'alley-steps', 'alley-run', 'alley-dog', 'alley-exit',
    'alley-ledge', 'chicken-lead', 'chicken-in', 'chicken-out', 'drain-run', 'terrace',
  ];
  const optional = new Set(optionalIds);
  const throughIds = placed
    .map((segment) => segment.spec.id)
    .filter((id) => !optional.has(id));

  return {
    plan,
    placed,
    throughIds,
    optionalIds,
    jumps: [{ name: 'the kicker', lipId: 'kicker-run', landingId: 'kicker-land' }],
    shortcuts: [{
      name: 'the alley', fromId: 'fork', exitId: 'alley-exit', rejoinId: 'road-in',
    }],
    adjacency,
    pieceOf: SLICE_PIECE_OF,
  };
}

/**
 * Which of the ten beats each of the slice's segments belongs to.
 *
 * Read off the library's own decomposition rather than restated, so the
 * fallback is judged by exactly the piece boundaries a generated route is.
 */
const SLICE_PIECE_OF: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const piece of LIBRARY_BEATS) {
    for (const spec of [...piece.main, ...piece.branches.flatMap((branch) => branch.specs)]) {
      map.set(spec.id, piece.id);
    }
  }
  return map;
})();

/**
 * Build a level from a seed.
 *
 * Deterministic: the same seed produces a deep-equal `LevelPlan` on every run,
 * in a browser and under `node --test` alike. That is not a nicety — a ghost is
 * only comparable against the same ground, so a seed that meant two different
 * places would quietly invalidate every personal best in the game.
 *
 * **`topSpeedMph` is M30 Phase 1's fourth argument** and it sits beside the two
 * probe cadences for the same reason they do: it is a diagnostic the session
 * holds (`?mph=`, `Game.topSpeedMph`), never level identity, and it has to
 * reach the world because the world is settled before the first frame. What it
 * changes is the *spacing* and the *density*, which are two different questions
 * and are answered separately. Hazard and target separation are times paid in
 * metres, so a faster wheel is given a wider fairness floor; the hazard density
 * is a taste anchored on the shipped wheel and scaled **up** with the top speed
 * (`HAZARD.densityTopSpeedExponent`), so a 65 route meets more holes rather
 * than fewer — measured over sixty seeds, 5.07 per route at 50 against 6.98 at
 * 65, and 80 % more of them per minute of riding. And its jumps are judged
 * against the run-up a 65 mph wheel actually builds.
 *
 * **It is the same road either way.** The hazards stream spends the same four
 * draws at every station whether or not one lands and the targets stream the
 * same three, and neither runs until the geometry is decided — so the segments,
 * the heightfield, the dressing and the checkpoints are byte-identical between
 * a 50 and a 65 build of one seed, and only the set of holes and stands differs.
 * `topSpeedRoutes.test.ts` asserts that over a seed sweep.
 */
export function generateLevel(
  seed: string | SeedSet,
  hazardProbeMetres?: number,
  targetProbeMetres?: number,
  topSpeedMph?: number,
): GeneratedLevel {
  const label = seedLabel(seed);
  const rejections: { attempt: number; reasons: string[]; contracts: string[] }[] = [];
  // One wheel per build, read once: the placement passes and the contracts that
  // are their post-conditions must not be able to disagree about which wheel
  // this route is for. `undefined` is the frozen table's own instance, so a
  // default build is byte-identical to the one before M30 Phase 1.
  const rideability: Rideability = rideabilityAt(topSpeedMph);
  const hazardRules = topSpeedMph === undefined ? HAZARD_RULES : hazardRulesFor(rideability);
  const targetRules = topSpeedMph === undefined ? TARGET_RULES : targetRulesFor(rideability);

  for (let attempt = 0; attempt < GENERATION.maxAttempts; attempt += 1) {
    const streams = createSeedStreams(attemptSeed(seed, attempt));
    const attempted = layRoute(streams, hazardRules);
    const laid = attempted.route;
    if (laid === null) {
      rejections.push({ attempt, reasons: [attempted.reason], contracts: ['layout'] });
      continue;
    }

    const plan = buildLevelPlan(laid.graph, {
      id: `${GENERATED_LEVEL_PREFIX}${label}`,
      spawn: SPAWN,
      // Grass at the route's own start height, exactly as the slice does it, so
      // riding off the course is a climb onto a meadow rather than a fall off
      // the world. Go-anywhere is LOCKED.
      surround: { height: 0, surface: 'grass' },
      props: worldDressing(laid.placed, () => streams.dressing.next())
        .map((prop) => ({ ...prop })),
      checkpoints: laid.checkpoints,
      // What the generator put in the road — M13 Phase 3. Placed on the laid
      // route above, where every rule about them can still be evaluated against
      // the corridor they sit in; resolved to world footprints here, on the
      // finished ground, exactly as the checkpoints beside them are.
      ...(laid.hazards.length === 0 ? {} : { hazards: laid.hazards }),
      // Absent under the diagnostic, which owns the road when it is on — see
      // `withProbeHazards`. The route, the terrain and the dressing are
      // byte-identical either way, so a probe ride is the same world with a
      // different set of holes in it rather than a different world.
      // A scatter has none of the judgement a person placing a tree has, so the
      // builder settles every prop onto the lowest ground its base touches and
      // refuses the ones standing on a bank. See `BuildOptions.settleProps`.
      settleProps: true,
      // And every authored block reaches the ground it stands over. A beat's
      // blocks are placed in its corridor's frame, and most of them stand
      // *outside* that corridor — street trees at t 12.5 on a nine-metre road,
      // frontages at t 13.5 — where the ground is the shoulder easing away to
      // the field. Stitched onto a route that runs above its own field, the
      // ground falls out from under them: measured on the seeds the owner rode,
      // tree trunks 2.6 m in the air with their crowns still on top of them, and
      // 8 × 34 m frontages 4.3 m up. See `BuildOptions.settleBlocks`.
      settleBlocks: true,
      // And a block stands back by the width of the ground that belongs to the
      // road, so it reads as a building behind a verge rather than a wall on
      // the pavement. It covers the beats' own authored skylines too, which the
      // generator cannot see: a beat's block beside its *own* road is the look
      // the owner accepted, and the same block beside a different piece's road
      // is the generator's doing.
      buildingStandBack: BUILDING_STAND_BACK,
      // M13 Phase 2's diagnostic, absent unless `?hazardprobe=` asked for it.
      // **Inside the retry loop deliberately**: a probe route is validated like
      // any other, so if the scatter ever did make a route unrideable the
      // generator would reject it and say so rather than handing the owner a
      // world the contracts never saw. Phase 3 is what makes hazards a
      // *placement* decision with contracts of their own.
      ...(hazardProbeMetres === undefined ? {} : { hazardProbeMetres }),
      // M14 phase 2's diagnostic, on the same terms and inside the same retry
      // loop for the same reason.
      ...(targetProbeMetres === undefined ? {} : { targetProbeMetres }),
    });

    // -- Targets — M14 ----------------------------------------------------
    //
    // **After the plan, not before it**, which is the one place this pass
    // differs from `placeHazards` and the difference is forced: a stand's
    // clearance is clearance from the *dressing*, and the dressing does not
    // exist until `buildLevelPlan` has derived it. Targets are purely additive
    // to a finished plan — they paint no cell and nothing else reads them — so
    // attaching them costs one spread rather than a second whole build.
    //
    // Skipped entirely under `?targetprobe=`, on the terms `withProbeHazards`
    // records: the diagnostic owns the verge while it is on, and a world with
    // two authors is a world no rule describes.
    const targetSpecs = targetProbeMetres === undefined
      ? placeTargets(plan, laid.placed, laid.throughIds, streams.targets, targetRules)
      : [];
    const resolvedTargets = targetSpecs.length === 0
      ? []
      : resolveTargets(laid.placed, plan.heightfield, plan.surround, targetSpecs);
    const planWithTargets: LevelPlan = resolvedTargets.length === 0
      ? plan
      // Absent, never empty — `LevelPlan.targets` states the contract.
      : { ...plan, targets: resolvedTargets };

    const layout: RouteLayout = {
      plan: planWithTargets,
      placed: laid.placed,
      throughIds: laid.throughIds,
      optionalIds: laid.optionalIds,
      jumps: laid.jumps,
      shortcuts: laid.shortcuts,
      // The contracts judge exactly what the plan carries. Under the diagnostic
      // the plan carries the probe's scatter instead of these, and a route
      // measured against placements it does not contain would fail every seed
      // and hand the owner the slice — which would destroy the one switch the
      // Phase 2 gate is ridden through.
      ...(hazardProbeMetres === undefined ? { hazards: laid.hazards } : {}),
      // Same rule for targets: under the diagnostic the plan carries the
      // scatter instead of these, and a route measured against placements it
      // does not contain would fail every seed.
      ...(targetSpecs.length === 0 ? {} : { targets: targetSpecs }),
      adjacency: laid.adjacency,
      pieceOf: laid.pieceOf,
    };
    const verdict = validateRoute(layout, rideability);
    if (!verdict.valid) {
      rejections.push({
        attempt,
        reasons: verdict.failures.map((failure) => failure.detail),
        contracts: verdict.failures.map((failure) => failure.contract),
      });
      continue;
    }

    const cost = withinBudgetNumbers(layout);
    return {
      plan: planWithTargets,
      layout,
      report: {
        seed: label,
        draws: drawCounts(streams),
        attempts: attempt + 1,
        rejections,
        usedFallback: false,
        verdict,
        beats: laid.pieces
          .filter((entry) => entry.piece.beat !== null)
          .map((entry) => entry.piece.name),
        requiredLength: verdict.requiredLength,
        optionalSegments: laid.optionalIds.length,
        drawCallsPredicted: cost.drawCalls,
        trianglesPredicted: cost.triangles,
      },
    };
  }

  // -- The fallback, validated rather than grandfathered --------------------
  // **The fallback is judged by the wheel that asked for the route too.** It is
  // an emitted world (master §6.4), so a session riding at 65 that falls back to
  // the slice is riding the slice at 65 and the verdict has to say so.
  const layout = sliceRouteLayout();
  const verdict = validateRoute(layout, rideability);
  const cost = withinBudgetNumbers(layout);
  return {
    plan: layout.plan,
    layout,
    report: {
      seed: label,
      draws: drawCounts(createSeedStreams(seed)),
      attempts: GENERATION.maxAttempts,
      rejections,
      usedFallback: true,
      verdict,
      beats: LIBRARY_BEATS.map((piece) => piece.name),
      requiredLength: verdict.requiredLength,
      optionalSegments: layout.optionalIds.length,
      drawCallsPredicted: cost.drawCalls,
      trianglesPredicted: cost.triangles,
    },
  };
}

function drawCounts(streams: ReturnType<typeof createSeedStreams>): Record<SeedDomain, number> {
  const counts = {} as Record<SeedDomain, number>;
  for (const domain of SEED_DOMAINS) counts[domain] = streams[domain].draws;
  return counts;
}

function withinBudgetNumbers(layout: RouteLayout): { drawCalls: number; triangles: number } {
  return withinRenderBudget(layout.plan).frame;
}
