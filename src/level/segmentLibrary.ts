/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { SurfaceId } from '../simulation/world.ts';
import type { SegmentBranch, SegmentGraph, SegmentSpec } from './segments.ts';
import { gradientAt, placeGraph } from './segments.ts';
import { ALLEY_ROUTE, SLICE_BEATS, SLICE_GRAPH } from './sliceLevel.ts';

/**
 * The segment library — M12 Phase 1.
 *
 * `docs/PLANS.md` §6 asked for the slice's ten beats to be authored "as typed
 * segments with entry/exit sockets, not as one hand-placed blob", on the
 * grounds that "a beat that composes cleanly here is a beat the generator can
 * stitch later". M7 did that. This file is the promise being collected: the
 * same beats, indexed, classified, and carrying the metadata stitching needs.
 *
 * ## It catalogues the slice; it does not move it
 *
 * Every spec below is the object `sliceLevel.ts` already authors, reached
 * through the exported `SLICE_GRAPH`. **Not one line of the slice's authoring
 * moved**, and that is deliberate rather than lazy:
 *
 *   - **The Phase 1 gate is deep equality of the emitted `LevelPlan`**
 *     (`docs/PLANS.md` §10). Sharing the specs makes that true by construction
 *     rather than by a careful copy, and `level/planDigest.test.ts` proves it
 *     against a digest taken before this file existed.
 *   - **The slice's numbers are load-bearing for the slice.** `PARK_GATE_LENGTH`
 *     is 59.71861586702758 because that is what closes the loop back into the
 *     plaza; the alley's lengths are derived from the road's radius so the
 *     shortcut rejoins where it must. Lifted into a library as free-standing
 *     content, those numbers stop meaning anything and start looking magic.
 *   - **The library and the level want different things from the same data.**
 *     The level wants geometry that closes; the library wants sockets, a class
 *     and a cost. Two views, not two copies.
 *
 * ## A piece, not a segment, is the unit of stitching
 *
 * The first draft of this file matched sockets segment by segment and was
 * wrong, and the way it was wrong is worth recording because it is a fact about
 * the content rather than about the code. Two of the slice's beats are not
 * chains at all:
 *
 *   - **The fork is a fork.** The alley leaves the wide roughPavement fork
 *     corridor at a quarter of its width. As a socket join that is a 26% step
 *     and illegal; as what it actually is — a branch off the side of a corridor
 *     — it is the whole point of the beat.
 *   - **The kicker is a gap.** Its landing is a branch dropped 1.05 m below the
 *     lip, which is what makes the jump a jump rather than a ramp.
 *
 * And the alley's step run is a *linear* ramp, so it reports a real gradient at
 * both ends and creases against its own neighbours. That crease is the feature.
 *
 * So the library's unit is a **piece**: a small graph with one through line, its
 * own internal branches, and one entry and one exit socket. Sockets are matched
 * between pieces, where the slice's own joins are all clean, and never inside
 * one, where the interesting geometry lives.
 *
 * ## Derived, not written down
 *
 * Master §6.1's rule is applied to everything here that could have been a table:
 * sockets come from `segments.ts`'s own `gradientAt` and from really placing the
 * piece; legible surface transitions are read off the slice's own adjacencies,
 * because a transition the owner rode and accepted is legible and a fresh table
 * would be an agent settling a design question; and the run-length floor is the
 * slice's own required route, because "at least as much level as the one that
 * shipped" is a floor with an argument behind it.
 *
 * Nothing here may import three.js (invariant 1) or reach into `render/`
 * (invariant 5).
 */

/** One end of a piece, in its own frame rather than the world's. */
export interface LibrarySocket {
  readonly surface: SurfaceId;
  /** Rideable half-width at this end, metres. */
  readonly halfWidth: number;
  /**
   * Gradient at this end, radians. Positive climbs along the heading.
   *
   * Zero on every piece, and that is the property that makes them stitchable:
   * an eased elevation profile is flat at both ends, so any two join without a
   * crease (`segments.ts`, `SegmentSpec.linearClimb`). The one linear ramp in
   * the slice is buried *inside* the alley piece, where nothing has to match it.
   */
  readonly gradient: number;
}

/**
 * What a piece is *for*, which decides whether a route may drop it.
 *
 * Master §6.3: required structure has to satisfy the run-length floor on its
 * own, and an optional branch is **dropped, not retried** — spending a whole
 * regeneration on something the design calls optional trades a valid world for
 * a slightly more interesting one.
 */
export type LibraryRole =
  /** On the critical route. A route without these is not a route. */
  | 'required'
  /** A pocket that leaves the route and does not come back. Droppable. */
  | 'optional'
  /**
   * A neutral join: straight, bend, or grade, with no set piece on it.
   *
   * The one category of content M12 authors rather than inherits, and
   * `docs/PLANS.md` §10 names it as in scope ("the M7 beats plus the neutral
   * connectors stitching requires"). A connector carries no blocks, no dressing
   * and no paint of its own, because a connector that carried a feature would
   * *be* a new set piece — and new set pieces are the owner's to open.
   *
   * **Hazards are exempt from that clause, by owner decision** (2026-08-09,
   * `docs/PLANS.md` §13 q10, felt on the M13 exit ride). A spill or pothole is
   * weather over the ground, not a feature of it: it belongs to the route's
   * hazard pass and its four contracts, not to the segment, and the same
   * connector renders featureless under any other seed. `placeHazards`
   * therefore does not read segment roles, and about one hazard in nine lands
   * on a connector — measured 39 of 337 across 48 seeds.
   */
  | 'connector';

export interface SegmentCost {
  /** Heightfield cells this draws when it is the only thing in the world. */
  readonly cells: number;
  readonly colliders: number;
  readonly props: number;
  readonly markingQuads: number;
  /** Triangles including the shadow pass, excluding per-level fixed overhead. */
  readonly triangles: number;
}

const ZERO_COST: SegmentCost = {
  cells: 0, colliders: 0, props: 0, markingQuads: 0, triangles: 0,
};

function addCost(a: SegmentCost, b: SegmentCost): SegmentCost {
  return {
    cells: a.cells + b.cells,
    colliders: a.colliders + b.colliders,
    props: a.props + b.props,
    markingQuads: a.markingQuads + b.markingQuads,
    triangles: a.triangles + b.triangles,
  };
}

// ---------------------------------------------------------------------------
// Measured cost, per authored segment
// ---------------------------------------------------------------------------

/**
 * Phase 0's per-segment render cost, each built as the only thing in the world.
 *
 * **Generated, not authored.** `node tools/render-cost.mjs` prints the table and
 * `src/level/segmentLibrary.test.ts` regenerates every row from a real
 * rasterised build and fails on any disagreement — the mitigation
 * `docs/PLANS.md` §12 names for the cost model drifting from reality. It is
 * checked in rather than computed at module load because rasterising fifty
 * isolated levels costs the better part of a tenth of a second, and the ≤3 s
 * boot budget has better uses for it.
 *
 * These drive the generator's cheap **pre-screen**. The contract itself is
 * `withinRenderBudget` on the emitted plan, which is exact; summing these rows
 * over-estimates by about a quarter, because beats that cross share ground.
 */
const MEASURED_COST: Readonly<Record<string, SegmentCost>> = {
  'plaza': { cells: 2560, colliders: 15, props: 38, markingQuads: 7, triangles: 8694 },
  'boulevard-north': { cells: 3008, colliders: 3, props: 19, markingQuads: 121, triangles: 7790 },
  'boulevard-bend': { cells: 3144, colliders: 6, props: 18, markingQuads: 125, triangles: 7942 },
  'curb-run': { cells: 3080, colliders: 6, props: 41, markingQuads: 144, triangles: 9348 },
  'fork': { cells: 768, colliders: 1, props: 3, markingQuads: 16, triangles: 1844 },
  'road-lead': { cells: 1440, colliders: 1, props: 8, markingQuads: 71, triangles: 3518 },
  'road-corner-a': { cells: 2640, colliders: 4, props: 15, markingQuads: 103, triangles: 6538 },
  'road-cross': { cells: 1440, colliders: 1, props: 6, markingQuads: 48, triangles: 3328 },
  'road-corner-b': { cells: 2640, colliders: 4, props: 13, markingQuads: 103, triangles: 6426 },
  'road-in': { cells: 2304, colliders: 1, props: 25, markingQuads: 99, triangles: 6506 },
  'park-gate': { cells: 3520, colliders: 8, props: 34, markingQuads: 25, triangles: 9834 },
  'riverside': { cells: 3696, colliders: 5, props: 68, markingQuads: 31, triangles: 12098 },
  'ford-in': { cells: 1152, colliders: 3, props: 9, markingQuads: 0, triangles: 2832 },
  'ford-out': { cells: 1152, colliders: 0, props: 9, markingQuads: 0, triangles: 2728 },
  'riverside-lower': { cells: 3200, colliders: 4, props: 43, markingQuads: 0, triangles: 9472 },
  'gravel-spur': { cells: 3280, colliders: 1, props: 11, markingQuads: 0, triangles: 7248 },
  'trailhead': { cells: 3216, colliders: 8, props: 26, markingQuads: 0, triangles: 8240 },
  'berm': { cells: 1648, colliders: 0, props: 13, markingQuads: 0, triangles: 4040 },
  'kicker-run': { cells: 1152, colliders: 1, props: 9, markingQuads: 0, triangles: 2848 },
  'kicker-land': { cells: 960, colliders: 1, props: 9, markingQuads: 0, triangles: 2464 },
  'return-climb': { cells: 2112, colliders: 1, props: 8, markingQuads: 78, triangles: 5128 },
  'return-plaza': { cells: 1344, colliders: 0, props: 10, markingQuads: 77, triangles: 3790 },
  'chicken-lead': { cells: 256, colliders: 0, props: 0, markingQuads: 0, triangles: 512 },
  'chicken-in': { cells: 448, colliders: 0, props: 2, markingQuads: 0, triangles: 1040 },
  'chicken-out': { cells: 448, colliders: 0, props: 5, markingQuads: 0, triangles: 1160 },
  'alley-mouth': { cells: 672, colliders: 3, props: 3, markingQuads: 0, triangles: 1536 },
  'alley-upper': { cells: 448, colliders: 2, props: 0, markingQuads: 0, triangles: 944 },
  'alley-steps': { cells: 322, colliders: 5, props: 0, markingQuads: 0, triangles: 764 },
  'alley-run': { cells: 560, colliders: 2, props: 0, markingQuads: 0, triangles: 1168 },
  'alley-dog': { cells: 672, colliders: 3, props: 3, markingQuads: 0, triangles: 1536 },
  'alley-exit': { cells: 256, colliders: 1, props: 3, markingQuads: 0, triangles: 700 },
  'alley-ledge': { cells: 256, colliders: 1, props: 3, markingQuads: 0, triangles: 832 },
  'drain-run': { cells: 1545, colliders: 0, props: 36, markingQuads: 0, triangles: 5490 },
  'terrace': { cells: 1792, colliders: 6, props: 25, markingQuads: 0, triangles: 5836 },
  'link-road-straight': { cells: 1728, colliders: 0, props: 0, markingQuads: 0, triangles: 3456 },
  'link-road-bend-left': { cells: 1968, colliders: 0, props: 0, markingQuads: 0, triangles: 3936 },
  'link-road-bend-right': { cells: 1904, colliders: 0, props: 0, markingQuads: 0, triangles: 3808 },
  'link-road-rise': { cells: 2016, colliders: 0, props: 0, markingQuads: 0, triangles: 4032 },
  'link-road-fall': { cells: 2016, colliders: 0, props: 0, markingQuads: 0, triangles: 4032 },
  'link-path-straight': { cells: 1152, colliders: 0, props: 0, markingQuads: 0, triangles: 2304 },
  'link-path-bend-left': { cells: 1088, colliders: 0, props: 0, markingQuads: 0, triangles: 2176 },
  'link-path-bend-right': { cells: 960, colliders: 0, props: 0, markingQuads: 0, triangles: 1920 },
  'link-path-fall': { cells: 2128, colliders: 0, props: 0, markingQuads: 0, triangles: 4256 },
  'link-trail-straight': { cells: 640, colliders: 0, props: 0, markingQuads: 0, triangles: 1280 },
  'link-trail-bend-left': { cells: 768, colliders: 0, props: 0, markingQuads: 0, triangles: 1536 },
  'link-trail-bend-right': { cells: 896, colliders: 0, props: 0, markingQuads: 0, triangles: 1792 },
  'link-gravel-straight': { cells: 960, colliders: 0, props: 0, markingQuads: 0, triangles: 1920 },
  'link-rough-straight': { cells: 768, colliders: 0, props: 0, markingQuads: 0, triangles: 1536 },
  'link-rough-rise': { cells: 1664, colliders: 0, props: 0, markingQuads: 0, triangles: 3328 },
};

export function segmentCost(id: string): SegmentCost {
  const cost = MEASURED_COST[id];
  if (cost === undefined) {
    throw new Error(
      `no measured render cost for "${id}". Run node tools/render-cost.mjs and add `
      + 'the row, or the generator cannot pre-screen a route containing it.',
    );
  }
  return cost;
}

// ---------------------------------------------------------------------------
// Neutral connectors
// ---------------------------------------------------------------------------

/**
 * The corridor a connector of each family inherits.
 *
 * Taken from the beats it has to join rather than invented: the road family is
 * the boulevard's own crown and the road's 8.5 m half-width, the path family is
 * the riverside's, the trail family is the trailhead's, and the rough family is
 * the return climb's. A connector whose cross section disagreed with the beat it
 * joins would put a step at the socket, and the controller would be right to
 * call it a kerb (`segments.ts`, `LATERAL_BLEND`).
 */
const CONNECTOR_FAMILIES = {
  road: { surface: 'pavement', halfWidth: 8.5, crown: 0.08, shoulder: 7 },
  path: { surface: 'pavement', halfWidth: 5.4, shoulder: 11 },
  trail: { surface: 'dirt', halfWidth: 4.6, shoulder: 10 },
  gravel: { surface: 'gravel', halfWidth: 6.5, shoulder: 10 },
  rough: { surface: 'roughPavement', halfWidth: 7, shoulder: 7 },
} as const;

/**
 * The bend radius a connector turns at.
 *
 * The slice's own road corners are 34 m; 40 m is wider, so a connector never
 * asks for a tighter line than a beat the owner has already ridden at speed.
 * Tightness is what the beats are for.
 */
const LINK_RADIUS = { road: 40, path: 32, trail: 26 } as const;

function link(
  id: string,
  family: keyof typeof CONNECTOR_FAMILIES,
  length: number,
  extra: Partial<SegmentSpec> = {},
): SegmentSpec {
  return { id, length, ...CONNECTOR_FAMILIES[family], ...extra };
}

/**
 * Neutral joins, and nothing else.
 *
 * No blocks, no dressing, no markings. A connector exists so the generator can
 * change heading or elevation between two beats without inventing a set piece,
 * and the moment one carries a feature it *is* a set piece. Elevation is eased
 * rather than linear, so both sockets stay flat and a connector composes with
 * anything of its own family.
 */
const CONNECTOR_SPECS: readonly SegmentSpec[] = [
  link('link-road-straight', 'road', 40),
  link('link-road-bend-left', 'road', 40, { curvature: 1 / LINK_RADIUS.road }),
  link('link-road-bend-right', 'road', 40, { curvature: -1 / LINK_RADIUS.road }),
  link('link-road-rise', 'road', 40, { climb: 2.4 }),
  link('link-road-fall', 'road', 40, { climb: -2.4 }),
  link('link-path-straight', 'path', 40),
  link('link-path-bend-left', 'path', 40, { curvature: 1 / LINK_RADIUS.path }),
  link('link-path-bend-right', 'path', 40, { curvature: -1 / LINK_RADIUS.path }),
  link('link-path-fall', 'path', 40, { climb: -1.8 }),
  link('link-trail-straight', 'trail', 36),
  link('link-trail-bend-left', 'trail', 36, { curvature: 1 / LINK_RADIUS.trail }),
  link('link-trail-bend-right', 'trail', 36, { curvature: -1 / LINK_RADIUS.trail }),
  link('link-gravel-straight', 'gravel', 36),
  link('link-rough-straight', 'rough', 36),
  link('link-rough-rise', 'rough', 36, { climb: 2.0 }),
];

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * A branch inside a piece — a second line off its own through line.
 *
 * The same four offsets `SegmentBranch` carries, plus what the branch is *for*.
 * A `through` branch is part of the critical route and carries the piece's exit
 * socket; the kicker's landing is one, because the drop over the gap is a
 * branch and not a chain link. An `optional` branch is a shortcut, a chicken
 * line, or a pocket, and a generator drops it rather than retrying (master
 * §6.3).
 */
export interface PieceBranch {
  /** Which spec inside this piece it leaves from. */
  readonly from: string;
  readonly atDistance?: number;
  readonly lateralOffset?: number;
  readonly elevationOffset?: number;
  readonly headingOffset?: number;
  readonly specs: readonly SegmentSpec[];
  readonly kind: 'through' | 'optional';
  /** A player-facing-ish name for a report. Never shown in the game. */
  readonly name: string;
}

export interface LibraryPiece {
  readonly id: string;
  /** The M7 beat this is, or null for a pocket or a connector. */
  readonly beat: number | null;
  readonly name: string;
  /** What the beat teaches, in `docs/PLANS.md` §6's words. */
  readonly teaches: string;
  readonly role: LibraryRole;
  readonly main: readonly SegmentSpec[];
  readonly branches: readonly PieceBranch[];
  /** The spec whose exit socket the next piece attaches to. */
  readonly exitSegment: string;
  readonly entry: LibrarySocket;
  readonly exit: LibrarySocket;
  /** Through-line length, metres — what this contributes to the run-length floor. */
  readonly length: number;
  /** Through-line heading change, radians. Positive turns toward the rider's LEFT. */
  readonly headingChange: number;
  /** Through-line elevation change, metres, branch offsets included. */
  readonly climb: number;
  /** Every segment in the piece, optional branches included. */
  readonly cost: SegmentCost;
  /** The through line alone, which is what a dropped-branch route costs. */
  readonly throughCost: SegmentCost;
}

const SLICE_SPEC_BY_ID = new Map<string, SegmentSpec>();
for (const spec of SLICE_GRAPH.main) SLICE_SPEC_BY_ID.set(spec.id, spec);
for (const branch of SLICE_GRAPH.branches ?? []) {
  for (const spec of branch.specs) SLICE_SPEC_BY_ID.set(spec.id, spec);
}

/** Every spec the slice authors, in graph order. */
export const SLICE_SPECS: readonly SegmentSpec[] = [
  ...SLICE_GRAPH.main,
  ...(SLICE_GRAPH.branches ?? []).flatMap((branch) => branch.specs),
];

function spec(id: string): SegmentSpec {
  const found = SLICE_SPEC_BY_ID.get(id);
  if (found === undefined) throw new Error(`the slice does not author a segment "${id}"`);
  return found;
}

function specs(...ids: readonly string[]): SegmentSpec[] {
  return ids.map(spec);
}

/**
 * How the slice's graph is cut into pieces.
 *
 * A decision, not a naming convention — the same argument `SLICE_BEATS` makes
 * about beats and segments. The offsets on every branch are copied from
 * `SLICE_GRAPH`'s own, because a piece that placed its alley somewhere else
 * would not be the beat the owner accepted.
 */
interface PieceSpec {
  readonly id: string;
  readonly beat: number | null;
  readonly role: LibraryRole;
  readonly main: readonly SegmentSpec[];
  readonly branches?: readonly PieceBranch[];
  readonly exitSegment?: string;
}

const PIECE_SPECS: readonly PieceSpec[] = [
  {
    id: 'plaza',
    beat: 1,
    role: 'required',
    main: specs('plaza'),
    branches: [{
      // §6's "a low wall to ride", 24 m into the square and turned hard left.
      from: 'plaza', atDistance: 24, lateralOffset: 21, headingOffset: 1.35,
      specs: specs('terrace'), kind: 'optional', name: 'low walls to ride',
    }],
  },
  {
    id: 'boulevard',
    beat: 2,
    role: 'required',
    main: specs('boulevard-north', 'boulevard-bend'),
    branches: [{
      from: 'boulevard-north', atDistance: 6, lateralOffset: 34, elevationOffset: -1,
      headingOffset: 0.06,
      specs: specs('drain-run'), kind: 'optional', name: 'drainage channel',
    }],
  },
  { id: 'curb-run', beat: 3, role: 'required', main: specs('curb-run') },
  {
    id: 'fork',
    beat: 4,
    role: 'required',
    // The safe way round is the through line; the alley is the shortcut, and it
    // leaves the fork's exit at a quarter of its width — which is a branch off
    // a corridor and emphatically not a socket join.
    main: specs('fork', 'road-lead', 'road-corner-a', 'road-cross', 'road-corner-b', 'road-in'),
    branches: [
      {
        from: 'fork',
        specs: specs(...ALLEY_ROUTE),
        kind: 'optional',
        name: 'alley shortcut',
      },
      {
        from: 'alley-upper', atDistance: 14, lateralOffset: 6.6, elevationOffset: 0.55,
        headingOffset: 0.1,
        specs: specs('alley-ledge'), kind: 'optional', name: 'alley-only ledge',
      },
    ],
  },
  { id: 'park-gate', beat: 5, role: 'required', main: specs('park-gate') },
  {
    id: 'riverside',
    beat: 6,
    role: 'required',
    main: specs('riverside', 'ford-in', 'ford-out', 'riverside-lower'),
  },
  { id: 'gravel-spur', beat: 7, role: 'required', main: specs('gravel-spur') },
  { id: 'trailhead', beat: 8, role: 'required', main: specs('trailhead', 'berm') },
  {
    id: 'kicker',
    beat: 9,
    role: 'required',
    main: specs('kicker-run'),
    branches: [
      {
        // The gap. A 1.05 m drop off the lip, expressed as a branch because a
        // chain link cannot leave the ground.
        from: 'kicker-run', elevationOffset: -1.05,
        specs: specs('kicker-land'), kind: 'through', name: 'the landing',
      },
      {
        from: 'kicker-run', atDistance: 0, lateralOffset: 13,
        specs: specs('chicken-lead', 'chicken-in', 'chicken-out'),
        kind: 'optional', name: 'chicken line',
      },
    ],
    exitSegment: 'kicker-land',
  },
  {
    id: 'return',
    beat: 10,
    role: 'required',
    main: specs('return-climb', 'return-plaza'),
  },
  ...CONNECTOR_SPECS.map((connector): PieceSpec => ({
    id: connector.id,
    beat: null,
    role: 'connector',
    main: [connector],
  })),
];

// ---------------------------------------------------------------------------
// Building the library
// ---------------------------------------------------------------------------

const BEAT_OF = new Map<number, { name: string; teaches: string }>();
for (const beat of SLICE_BEATS) BEAT_OF.set(beat.index, { name: beat.name, teaches: beat.teaches });

/** The graph a piece places, as `placeGraph` wants it. */
function graphOf(piece: PieceSpec, dropOptional = false): SegmentGraph {
  const branches = (piece.branches ?? [])
    .filter((branch) => !dropOptional || branch.kind === 'through')
    .map((branch): SegmentBranch => ({
      from: branch.from,
      ...(branch.atDistance === undefined ? {} : { atDistance: branch.atDistance }),
      ...(branch.lateralOffset === undefined ? {} : { lateralOffset: branch.lateralOffset }),
      ...(branch.elevationOffset === undefined ? {} : { elevationOffset: branch.elevationOffset }),
      ...(branch.headingOffset === undefined ? {} : { headingOffset: branch.headingOffset }),
      specs: branch.specs,
    }));
  return { main: piece.main, ...(branches.length > 0 ? { branches } : {}) };
}

function buildPiece(piece: PieceSpec): LibraryPiece {
  const exitSegment = piece.exitSegment ?? piece.main[piece.main.length - 1].id;

  // Placed for real from the origin, so the sockets, length, heading change and
  // climb below are what the builder produces rather than what a sum of
  // authored fields claims. A branch's elevation offset is invisible to a sum.
  const placed = placeGraph(graphOf(piece), { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  const first = placed[0];
  const last = placed.find((candidate) => candidate.spec.id === exitSegment);
  if (last === undefined) throw new Error(`piece "${piece.id}" has no segment "${exitSegment}"`);

  let cost = ZERO_COST;
  let throughCost = ZERO_COST;
  const throughIds = new Set<string>([
    ...piece.main.map((entry) => entry.id),
    ...(piece.branches ?? [])
      .filter((branch) => branch.kind === 'through')
      .flatMap((branch) => branch.specs.map((entry) => entry.id)),
  ]);
  for (const segment of placed) {
    const each = segmentCost(segment.spec.id);
    cost = addCost(cost, each);
    if (throughIds.has(segment.spec.id)) throughCost = addCost(throughCost, each);
  }

  // The through line's own length, which is what the run-length floor counts.
  let length = 0;
  for (const segment of placed) if (throughIds.has(segment.spec.id)) length += segment.spec.length;

  const beat = piece.beat === null ? null : BEAT_OF.get(piece.beat);
  return {
    id: piece.id,
    beat: piece.beat,
    name: beat?.name ?? piece.id,
    teaches: beat?.teaches ?? (piece.role === 'connector' ? 'a neutral join' : 'curiosity off the route'),
    role: piece.role,
    main: piece.main,
    branches: piece.branches ?? [],
    exitSegment,
    entry: {
      surface: first.entry.surface,
      halfWidth: first.entry.halfWidth,
      gradient: gradientAt(first.spec, 0),
    },
    exit: {
      surface: last.exit.surface,
      halfWidth: last.exit.halfWidth,
      gradient: gradientAt(last.spec, last.spec.length),
    },
    length,
    headingChange: last.exit.headingY,
    climb: last.exit.position.y,
    cost,
    throughCost,
  };
}

/** Every piece the generator may place. */
export const SEGMENT_LIBRARY: readonly LibraryPiece[] = PIECE_SPECS.map(buildPiece);

const BY_ID = new Map(SEGMENT_LIBRARY.map((piece) => [piece.id, piece]));

export function libraryPiece(id: string): LibraryPiece {
  const piece = BY_ID.get(id);
  if (piece === undefined) throw new Error(`unknown library piece "${id}"`);
  return piece;
}

/** The ten M7 beats, in order, as the pieces that carry them. */
export const LIBRARY_BEATS: readonly LibraryPiece[] = SEGMENT_LIBRARY
  .filter((piece) => piece.beat !== null)
  .sort((a, b) => (a.beat ?? 0) - (b.beat ?? 0));

export const LIBRARY_CONNECTORS: readonly LibraryPiece[] = SEGMENT_LIBRARY
  .filter((piece) => piece.role === 'connector');

/**
 * A placeable copy of a piece under a fresh id prefix.
 *
 * `placeGraph` refuses a duplicate id, so a route that uses the same beat twice
 * needs two sets of specs. Only the ids change: the arrays inside a spec are
 * authored, never written by the builder, and deep-cloning thirty segments of
 * dressing at every generation attempt would cost real time for no benefit.
 *
 * `attachTo` chains the piece onto an already-placed segment. A branch with no
 * offsets, rooted at a parent's exit, *is* a chain link — `placeGraph` resolves
 * its position, heading and height from the parent's exit socket exactly — so
 * one mechanism covers both the first piece and every piece after it.
 */
export interface OptionalBranch {
  readonly name: string;
  readonly branch: SegmentBranch;
  /** Ids this branch contributes, in order. */
  readonly ids: readonly string[];
}

export interface PlacedPiece {
  readonly piece: LibraryPiece;
  readonly instance: string;
  readonly main: readonly SegmentSpec[];
  /** The through line's branches — the ones a dropped-optional build keeps. */
  readonly branches: readonly SegmentBranch[];
  /**
   * The optional branches, separately, so a caller can add them one at a time
   * and **drop** the ones that will not fit rather than retrying the route
   * (master §6.3).
   */
  readonly optional: readonly OptionalBranch[];
  /** The world-facing id of the segment the next piece attaches to. */
  readonly exitSegmentId: string;
  /** Ids of the through line, in order. */
  readonly throughIds: readonly string[];
}

export function instantiate(
  piece: LibraryPiece,
  instance: string,
  options: { readonly attachTo?: string; readonly dropOptional?: boolean } = {},
): PlacedPiece {
  const rename = (id: string): string => `${id}@${instance}`;
  const main = piece.main.map((entry) => ({ ...entry, id: rename(entry.id) }));

  const asBranch = (branch: PieceBranch): SegmentBranch => ({
    from: rename(branch.from),
    ...(branch.atDistance === undefined ? {} : { atDistance: branch.atDistance }),
    ...(branch.lateralOffset === undefined ? {} : { lateralOffset: branch.lateralOffset }),
    ...(branch.elevationOffset === undefined ? {} : { elevationOffset: branch.elevationOffset }),
    ...(branch.headingOffset === undefined ? {} : { headingOffset: branch.headingOffset }),
    specs: branch.specs.map((entry) => ({ ...entry, id: rename(entry.id) })),
  });

  const branches: SegmentBranch[] = [];
  if (options.attachTo !== undefined) {
    // The chain link, expressed as a zero-offset branch off the previous
    // piece's exit. Everything else in this function is the same for the first
    // piece and the fiftieth.
    branches.push({ from: options.attachTo, specs: main });
  }
  for (const branch of piece.branches) {
    if (branch.kind === 'through') branches.push(asBranch(branch));
  }

  const optional: OptionalBranch[] = options.dropOptional === true ? [] : piece.branches
    .filter((branch) => branch.kind === 'optional')
    .map((branch) => ({
      name: branch.name,
      branch: asBranch(branch),
      ids: branch.specs.map((entry) => rename(entry.id)),
    }));

  const throughIds = [
    ...piece.main.map((entry) => rename(entry.id)),
    ...piece.branches
      .filter((branch) => branch.kind === 'through')
      .flatMap((branch) => branch.specs.map((entry) => rename(entry.id))),
  ];

  return {
    piece,
    instance,
    main: options.attachTo === undefined ? main : [],
    branches,
    optional,
    exitSegmentId: rename(piece.exitSegment),
    throughIds,
  };
}

// ---------------------------------------------------------------------------
// Stitching metadata
// ---------------------------------------------------------------------------

/**
 * Which surface may follow which, read off the slice's own joins.
 *
 * Master §6 requires "surface transitions that are legible rather than
 * arbitrary". The most defensible reading of legible is **a transition the
 * shipped level already makes**: the owner rode brick into pavement, pavement
 * into gravel, and gravel into dirt, and accepted them. Writing a fresh table
 * would be an agent deciding which surfaces look right next to each other,
 * which is a design decision and not one that was delegated.
 *
 * Identity is always legible — a surface may continue into itself.
 */
export const LEGIBLE_SURFACE_TRANSITIONS: ReadonlyMap<SurfaceId, ReadonlySet<SurfaceId>> = (() => {
  const table = new Map<SurfaceId, Set<SurfaceId>>();
  const allow = (from: SurfaceId, to: SurfaceId): void => {
    let set = table.get(from);
    if (set === undefined) {
      set = new Set<SurfaceId>();
      table.set(from, set);
    }
    set.add(to);
  };

  const chains: (readonly SegmentSpec[])[] = [SLICE_GRAPH.main];
  for (const branch of SLICE_GRAPH.branches ?? []) {
    const parent = SLICE_SPEC_BY_ID.get(branch.from);
    if (parent !== undefined) chains.push([parent, ...branch.specs]);
  }
  for (const chain of chains) {
    for (let index = 1; index < chain.length; index += 1) {
      allow(chain[index - 1].surface, chain[index].surface);
    }
  }

  for (const entry of [...SLICE_SPECS, ...CONNECTOR_SPECS]) allow(entry.surface, entry.surface);

  return table;
})();

export function transitionIsLegible(from: SurfaceId, to: SurfaceId): boolean {
  return LEGIBLE_SURFACE_TRANSITIONS.get(from)?.has(to) === true;
}

/**
 * How far two sockets may disagree and still be one join.
 *
 * **Half-width** is a ratio rather than a distance, because "the corridor
 * halves" reads the same whether it happens at nine metres or at three. A half
 * sits just under the tightest step the slice itself makes between two beats —
 * the plaza's 17 m square into the boulevard's 9 m road, a 53% step — so the
 * rule admits every join the owner has ridden and nothing looser.
 * `segmentLibrary.test.ts` pins that margin, so a beat re-widened past it fails
 * here rather than in a generated route nobody could explain.
 *
 * **Gradient** has to be near-exact. A crease at a socket is a step, and a step
 * is what the controller reads as a kerb (`segments.ts`, `LATERAL_BLEND`). One
 * degree is below `TERRAIN.curbThreshold` at any speed the wheel reaches.
 */
export const SOCKET_TOLERANCE = {
  minHalfWidthRatio: 0.5,
  maxGradientDelta: Math.PI / 180,
} as const;

/**
 * Why `after` may not follow `before`. Empty means it may.
 *
 * The reasons are worded for a human reading a generation report, because that
 * is who has to decide whether a library gap is a bug or a missing connector.
 */
export function socketMismatches(before: LibrarySocket, after: LibrarySocket): string[] {
  const out: string[] = [];

  if (!transitionIsLegible(before.surface, after.surface)) {
    out.push(`${before.surface} into ${after.surface} is a transition the slice never makes`);
  }

  const ratio = Math.min(before.halfWidth, after.halfWidth)
    / Math.max(before.halfWidth, after.halfWidth);
  if (ratio < SOCKET_TOLERANCE.minHalfWidthRatio) {
    out.push(
      `${before.halfWidth} m into ${after.halfWidth} m half-width is a `
      + `${(ratio * 100).toFixed(0)}% step, past the `
      + `${(SOCKET_TOLERANCE.minHalfWidthRatio * 100).toFixed(0)}% floor`,
    );
  }

  const crease = Math.abs(before.gradient - after.gradient);
  if (crease > SOCKET_TOLERANCE.maxGradientDelta) {
    out.push(
      `a ${(crease * 180 / Math.PI).toFixed(1)}° crease at the socket, which the `
      + 'controller reads as a step rather than a slope',
    );
  }

  return out;
}

/** Whether `after` may follow `before`. */
export function canFollow(before: LibraryPiece, after: LibraryPiece): boolean {
  return socketMismatches(before.exit, after.entry).length === 0;
}

// ---------------------------------------------------------------------------
// The floor the required route has to meet on its own
// ---------------------------------------------------------------------------

/**
 * The slice's own required route, in metres of centreline.
 *
 * Master §6.3: "A required lower bound must be satisfied by required structure
 * alone." This is that bound, and it is derived rather than chosen — a
 * generated route shorter than the level the owner accepted is a route that
 * shipped less game, however valid it is. Optional branches add variety *above*
 * it, which is why they can be dropped without the run falling short.
 *
 * Connectors do not count. A route padded with neutral joins would meet the
 * floor without containing any of the game.
 */
export const REQUIRED_ROUTE_FLOOR_METRES = LIBRARY_BEATS
  .reduce((total, piece) => total + piece.length, 0);
