/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HAZARD_SURFACE_IDS } from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { buildLevelPlan } from './buildPlan.ts';
import { planDigest } from './planDigest.ts';
import { planRenderCost } from './renderBudget.ts';
import { gradientAt, placeGraph, type SegmentBranch, type SegmentSpec } from './segments.ts';
import {
  LEGIBLE_SURFACE_TRANSITIONS,
  LIBRARY_BEATS,
  LIBRARY_CONNECTORS,
  REQUIRED_ROUTE_FLOOR_METRES,
  SEGMENT_LIBRARY,
  SLICE_SPECS,
  canFollow,
  instantiate,
  libraryPiece,
  segmentCost,
  socketMismatches,
  transitionIsLegible,
} from './segmentLibrary.ts';
import { SLICE_BEATS, SLICE_GRAPH, createSliceLevel } from './sliceLevel.ts';

/**
 * The segment library — M12 Phase 1.
 *
 * Three things are proved here, and the first is the milestone gate.
 *
 * **1. The slice did not move.** `docs/PLANS.md` §10 makes deep equality of the
 * emitted `LevelPlan` the hard requirement for this phase, because the
 * hand-authored slice is the known-good reference the whole milestone is judged
 * against and the owner has already published it.
 *
 * **2. The decomposition is faithful.** The library cuts the slice's graph into
 * ten pieces; placing those ten pieces in order has to reproduce the slice's own
 * geometry, segment for segment. That is a far stronger claim than "the specs
 * are the same objects", and it is what makes the generator's placement
 * machinery trustworthy before a single seeded route exists.
 *
 * **3. The metadata is derived, not asserted.** Every socket, length, heading
 * change and cost the library publishes is recomputed here from a real placed
 * or rasterised build.
 */

const SPEC_BY_ID = new Map(SLICE_SPECS.map((spec) => [spec.id, spec]));

// ---------------------------------------------------------------------------
// The Phase 1 gate
// ---------------------------------------------------------------------------

test('the slice still emits the plan the library was extracted from', () => {
  // The digest and its reasoning live in planDigest.test.ts. Repeated here
  // because this is the file whose change would break it, and a test that fails
  // next to the cause is worth two that fail far from it.
  //
  // The library never moved it. Later owner-requested fixes did: the second
  // generated-route ride, the shared-playtest shrub-collision pass, then the
  // M15 soft-foliage rerouting of those same shrub boxes. Every revision is
  // itemised beside its pin in planDigest.test.ts.
  assert.equal(planDigest(createSliceLevel()), '76a2d24495a2a0e333497b2111b1a6af');
});

test('the library points at the slice\'s own specs, not at copies of them', () => {
  // Object identity, deliberately. A structural comparison would pass on a copy
  // that happened to be equal today and would stop passing the first time
  // somebody edited one of the two — which is the failure this phase is gated
  // against.
  for (const piece of SEGMENT_LIBRARY) {
    if (piece.role === 'connector') continue;
    const all = [...piece.main, ...piece.branches.flatMap((branch) => branch.specs)];
    for (const spec of all) {
      assert.equal(spec, SPEC_BY_ID.get(spec.id), `${spec.id} is a copy, not the slice's spec`);
    }
  }
});

test('every segment the slice authors belongs to exactly one piece', () => {
  const seen = new Map<string, string>();
  for (const piece of SEGMENT_LIBRARY) {
    if (piece.role === 'connector') continue;
    for (const spec of [...piece.main, ...piece.branches.flatMap((b) => b.specs)]) {
      const owner = seen.get(spec.id);
      assert.equal(owner, undefined, `${spec.id} is in both ${owner} and ${piece.id}`);
      seen.set(spec.id, piece.id);
    }
  }
  for (const spec of SLICE_SPECS) {
    assert.ok(seen.has(spec.id), `${spec.id} is authored but belongs to no piece`);
  }
  assert.equal(seen.size, SLICE_SPECS.length);
});

test('all ten beats are pieces, in order, with their own words', () => {
  assert.equal(LIBRARY_BEATS.length, 10);
  for (const [index, piece] of LIBRARY_BEATS.entries()) {
    const authored = SLICE_BEATS[index];
    assert.equal(piece.beat, authored.index);
    assert.equal(piece.name, authored.name);
    assert.equal(piece.teaches, authored.teaches);
  }
});

// ---------------------------------------------------------------------------
// The decomposition reproduces the slice
// ---------------------------------------------------------------------------

/** Place the ten beats in slice order, chaining each onto the last. */
function placeTheBeats(dropOptional = false): ReturnType<typeof placeGraph> {
  let main: readonly SegmentSpec[] = [];
  const branches: SegmentBranch[] = [];
  let attachTo: string | undefined;

  for (const piece of LIBRARY_BEATS) {
    const placed = instantiate(piece, 'slice', { attachTo, dropOptional });
    if (attachTo === undefined) main = placed.main;
    branches.push(...placed.branches);
    for (const optional of placed.optional) branches.push(optional.branch);
    attachTo = placed.exitSegmentId;
  }

  return placeGraph({ main, branches }, { position: { x: 0, y: 0, z: 0 }, headingY: 0 });
}

test('placing the ten pieces in order reproduces the slice, segment for segment', () => {
  // The claim the whole generator rests on: a piece placed by the library's own
  // machinery lands exactly where the hand-authored graph put it. If this drifts
  // by a millimetre, every generated route is built on a different geometry from
  // the one the owner accepted.
  const reference = new Map(
    placeGraph(SLICE_GRAPH, { position: { x: 0, y: 0, z: 0 }, headingY: 0 })
      .map((placed) => [placed.spec.id, placed]),
  );
  const rebuilt = placeTheBeats();

  assert.equal(rebuilt.length, reference.size, 'a segment was lost or duplicated');

  for (const placed of rebuilt) {
    const id = placed.spec.id.replace('@slice', '');
    const original = reference.get(id);
    assert.ok(original !== undefined, `${id} is not a slice segment`);
    assert.deepEqual(placed.entry.position, original.entry.position, `${id} entry position`);
    assert.deepEqual(placed.exit.position, original.exit.position, `${id} exit position`);
    assert.equal(placed.entry.headingY, original.entry.headingY, `${id} entry heading`);
    assert.equal(placed.exit.headingY, original.exit.headingY, `${id} exit heading`);
    assert.equal(placed.entry.halfWidth, original.entry.halfWidth);
    assert.equal(placed.exit.gradient, original.exit.gradient);
  }
});

test('dropping every optional branch still leaves a complete through line', () => {
  // Master §6.3: an optional branch is dropped, not retried, and a run that
  // legitimately drops one must not ship short. The required route has to stand
  // on its own, so it is placed on its own here.
  const full = placeTheBeats();
  const trimmed = placeTheBeats(true);

  assert.ok(trimmed.length < full.length, 'nothing was optional, so nothing was dropped');

  const trimmedIds = new Set(trimmed.map((placed) => placed.spec.id));
  for (const piece of LIBRARY_BEATS) {
    for (const spec of piece.main) {
      assert.ok(trimmedIds.has(`${spec.id}@slice`), `${spec.id} vanished with the optional set`);
    }
  }

  // And the through line is unmoved by the drop: an optional branch that shifted
  // the route would make "dropped" mean "different level".
  const byId = new Map(full.map((placed) => [placed.spec.id, placed]));
  for (const placed of trimmed) {
    assert.deepEqual(placed.exit.position, byId.get(placed.spec.id)?.exit.position, placed.spec.id);
  }
});

// ---------------------------------------------------------------------------
// Derived metadata
// ---------------------------------------------------------------------------

test('every piece socket is what placing the piece actually produces', () => {
  for (const piece of SEGMENT_LIBRARY) {
    const first = piece.main[0];
    assert.equal(piece.entry.surface, first.surface, `${piece.id} entry surface`);
    assert.equal(piece.entry.halfWidth, first.halfWidth, `${piece.id} entry half-width`);
    assert.equal(piece.entry.gradient, gradientAt(first, 0), `${piece.id} entry gradient`);

    const exitSpec = [...piece.main, ...piece.branches.flatMap((b) => b.specs)]
      .find((spec) => spec.id === piece.exitSegment);
    assert.ok(exitSpec !== undefined);
    assert.equal(piece.exit.surface, exitSpec.surface, `${piece.id} exit surface`);
    assert.equal(piece.exit.gradient, gradientAt(exitSpec, exitSpec.length), `${piece.id} exit gradient`);
  }
});

test('every piece joins flat at both ends — which is why they stitch at all', () => {
  // The alley's step run is a linear ramp and does report a real gradient, but
  // it is buried inside the fork piece where nothing has to match it. If a
  // *piece* ever acquires a creased socket, the generator has to match it and
  // this is where that gets noticed.
  for (const piece of SEGMENT_LIBRARY) {
    assert.equal(piece.entry.gradient, 0, `${piece.id} does not join flat`);
    assert.equal(piece.exit.gradient, 0, `${piece.id} does not leave flat`);
  }

  const steps = SPEC_BY_ID.get('alley-steps');
  assert.ok(steps !== undefined);
  assert.equal(steps.linearClimb, true, 'the one authored crease is still the step run');
  assert.notEqual(gradientAt(steps, 0), 0);
});

test('heading change and climb are read off the placed through line', () => {
  for (const piece of SEGMENT_LIBRARY) {
    const placed = placeTheBeatsPiece(piece);
    const exit = placed.find((entry) => entry.spec.id === `${piece.exitSegment}@probe`);
    assert.ok(exit !== undefined, `${piece.id} exit segment`);
    assert.ok(Math.abs(exit.exit.headingY - piece.headingChange) < 1e-9, `${piece.id} heading`);
    assert.ok(Math.abs(exit.exit.position.y - piece.climb) < 1e-9, `${piece.id} climb`);
  }
});

/** One piece, placed alone from the origin. */
function placeTheBeatsPiece(piece: (typeof SEGMENT_LIBRARY)[number]): ReturnType<typeof placeGraph> {
  const placed = instantiate(piece, 'probe');
  return placeGraph(
    { main: placed.main, branches: [...placed.branches] },
    { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
  );
}

test('the kicker\'s gap is a branch, and its landing carries the exit socket', () => {
  // Recorded because the first draft of this library treated every beat as a
  // chain, and the kicker is the beat that proves it is not one: the landing is
  // 1.05 m below the lip, which a chain link cannot express.
  const kicker = libraryPiece('kicker');
  assert.equal(kicker.exitSegment, 'kicker-land');
  const gap = kicker.branches.find((branch) => branch.kind === 'through');
  assert.ok(gap !== undefined, 'the gap is gone');
  assert.equal(gap.elevationOffset, -1.05);

  // The run climbs 1.05 m to the lip and the landing starts 1.05 m below it, so
  // the piece comes out at the height it went in — the jump is a rise and a
  // drop, not a net descent. Stated because "the landing is below the lip" and
  // "the landing is below the approach" are easy to confuse, and only the first
  // one is true.
  assert.equal(libraryPiece('kicker').main[0].climb, 1.05);
  assert.ok(Math.abs(kicker.climb) < 1e-9, 'the kicker is level end to end');
});

test('the fork carries the alley as an optional branch, not as a socket join', () => {
  const fork = libraryPiece('fork');
  const alley = fork.branches.find((branch) => branch.name === 'alley shortcut');
  assert.ok(alley !== undefined);
  assert.equal(alley.kind, 'optional');
  assert.equal(alley.from, 'fork');
  // 11 m of fork into a 2.9 m alley would be an illegal *socket* join, and it is
  // a perfectly good branch. That difference is why the piece exists.
  assert.ok(socketMismatches(
    { surface: 'roughPavement', halfWidth: 11, gradient: 0 },
    { surface: 'roughPavement', halfWidth: 2.9, gradient: 0 },
  ).length > 0);
});

test('the measured cost table is what a real isolated build produces', () => {
  // The Phase 0 mitigation, applied to the library: `docs/PLANS.md` §12 asks for
  // the table to be regenerated from a real build rather than hand-maintained.
  const all = [
    ...SLICE_SPECS,
    ...LIBRARY_CONNECTORS.flatMap((piece) => piece.main),
  ];
  for (const spec of all) {
    const plan = buildLevelPlan([spec], {
      id: `isolated-${spec.id}`,
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
    });
    const cost = planRenderCost(plan);
    // The per-level fixed overhead — one backstop, one surround field — is
    // excluded so the rows add up across a route.
    const triangles = cost.triangles - cost.fieldPatches * 2 - 2;
    const recorded = segmentCost(spec.id);

    assert.equal(recorded.cells, cost.cellsDrawn, `${spec.id} ground cells`);
    assert.equal(recorded.triangles, triangles, `${spec.id} triangles`);
    assert.equal(recorded.markingQuads, cost.markingQuads, `${spec.id} paint quads`);
    assert.equal(recorded.props, (plan.props ?? []).length, `${spec.id} props`);
    assert.equal(recorded.colliders, (spec.blocks ?? []).length, `${spec.id} colliders`);
  }
});

test('a piece costs its parts, and its through line costs less than the whole', () => {
  for (const piece of SEGMENT_LIBRARY) {
    const all = [...piece.main, ...piece.branches.flatMap((b) => b.specs)];
    const sum = all.reduce((total, spec) => total + segmentCost(spec.id).triangles, 0);
    assert.equal(piece.cost.triangles, sum, `${piece.id} whole cost`);
    assert.ok(piece.throughCost.triangles <= piece.cost.triangles, `${piece.id} through cost`);
    const hasOptional = piece.branches.some((branch) => branch.kind === 'optional');
    assert.equal(
      piece.throughCost.triangles < piece.cost.triangles,
      hasOptional,
      `${piece.id}: a piece with an optional branch must cost more than its through line`,
    );
  }
});

test('the run-length floor is the slice\'s own required route', () => {
  const sum = LIBRARY_BEATS.reduce((total, piece) => total + piece.length, 0);
  assert.equal(REQUIRED_ROUTE_FLOOR_METRES, sum);
  assert.ok(REQUIRED_ROUTE_FLOOR_METRES > 1000, 'the slice is about three minutes of riding');

  // Optional branches and connectors are excluded by construction: the floor
  // sums the beats' through lines only.
  for (const piece of LIBRARY_CONNECTORS) {
    assert.equal(piece.beat, null, 'a connector must never count toward the floor');
  }
});

// ---------------------------------------------------------------------------
// Stitching
// ---------------------------------------------------------------------------

test('every join the slice itself makes between two beats is a legal join', () => {
  // The strongest available check on the socket rules: the level the owner
  // accepted has to be stitchable by them. A rule that rejected one of the
  // slice's own joins would be a rule that had invented a constraint.
  for (let index = 1; index < LIBRARY_BEATS.length; index += 1) {
    const before = LIBRARY_BEATS[index - 1];
    const after = LIBRARY_BEATS[index];
    assert.deepEqual(
      socketMismatches(before.exit, after.entry),
      [],
      `${before.id} into ${after.id} is a join the shipped slice makes`,
    );
  }
});

test('the tightest join the slice makes is the one the width floor is set just under', () => {
  let tightest = 1;
  let where = '';
  for (let index = 1; index < LIBRARY_BEATS.length; index += 1) {
    const before = LIBRARY_BEATS[index - 1];
    const after = LIBRARY_BEATS[index];
    const ratio = Math.min(before.exit.halfWidth, after.entry.halfWidth)
      / Math.max(before.exit.halfWidth, after.entry.halfWidth);
    if (ratio < tightest) {
      tightest = ratio;
      where = `${before.id} into ${after.id}`;
    }
  }
  assert.equal(where, 'plaza into boulevard');
  assert.ok(tightest > 0.5 && tightest < 0.54, `${tightest.toFixed(3)} at ${where}`);
});

test('the slice does not close its loop through a socket, and that is recorded', () => {
  // Worth stating plainly, because it decides what shape a *generated* route
  // can be. The slice is a lap, but the lap does not close by matching sockets:
  // `return-plaza` runs its last twenty metres *inside* the plaza's own
  // corridor, and the two overlap. As a socket join, 7 m of roughPavement into
  // a 17 m brick square is a 41% step and illegal.
  //
  // So a generated route that had to come home would need the same overlap,
  // which is a geometric constraint on a closed path rather than a stitching
  // rule — and forcing one would fight master §6.4's retry-never-repair. M12
  // Phase 2 generates point-to-point routes for that reason. Whether generated
  // routes should be laps is the owner's call and is surfaced, not settled.
  assert.equal(canFollow(libraryPiece('return'), libraryPiece('plaza')), false);
  const reasons = socketMismatches(libraryPiece('return').exit, libraryPiece('plaza').entry);
  assert.equal(reasons.length, 1);
  assert.ok(reasons[0].includes('half-width'));
  assert.ok(transitionIsLegible('roughPavement', 'brick'), 'the surfaces themselves are fine');
});

test('the legible-transition table came off the slice and includes identity', () => {
  assert.ok(transitionIsLegible('brick', 'pavement'), 'plaza into boulevard');
  assert.ok(transitionIsLegible('pavement', 'gravel'), 'riverside into gravel spur');
  assert.ok(transitionIsLegible('gravel', 'dirt'), 'gravel spur into trailhead');
  assert.ok(transitionIsLegible('dirt', 'roughPavement'), 'kicker landing into return climb');
  assert.ok(transitionIsLegible('roughPavement', 'brick'), 'return plaza into the square');

  for (const surface of LEGIBLE_SURFACE_TRANSITIONS.keys()) {
    assert.ok(transitionIsLegible(surface, surface), `${surface} must continue into itself`);
  }

  // And it is a real constraint rather than a table that permits everything.
  assert.equal(transitionIsLegible('brick', 'dirt'), false, 'the slice never lays brick onto dirt');
  assert.equal(transitionIsLegible('gravel', 'brick'), false);
});

test('no piece, no connector and no verge band can declare a hazard surface', () => {
  // **M13 Phase 1, and it belongs here rather than in `data/surfaces.test.ts`**
  // because the claim is about the library's contents, not about the table's:
  // the data test can prove the split partitions the ids, but only this file
  // knows what a spec is allowed to say, and a test that fails beside the line
  // somebody just edited is worth two that fail a directory away.
  //
  // A hazard surface is painted inside a `Hazard` footprint and nowhere else
  // (`data/surfaces.ts`, `HAZARD_SURFACE_IDS`). A spec's `surface` and its
  // `bands` are the other two ways ground gets a surface, and both run the whole
  // length of a corridor — so one hazard id in either would not be a cosmetic
  // slip. It would paint tens of metres of road with the table's only non-zero
  // `wobbleInjection`, and the milestone's central promise, that wobble only
  // ever comes from something the rider could see and avoid, would be gone with
  // nothing failing: `routeValidator.checkSurfaces` and the transition rules
  // below would all pass, because they ask whether a surface is *legible* next
  // to its neighbour and a spill next to pavement reads fine.
  const hazards = new Set<SurfaceId>(HAZARD_SURFACE_IDS);
  const specs = [
    ...SLICE_SPECS,
    ...SEGMENT_LIBRARY.flatMap((piece) => [
      ...piece.main,
      ...piece.branches.flatMap((branch) => branch.specs),
    ]),
  ];
  assert.ok(specs.length > SLICE_SPECS.length, 'the sweep must reach the connectors too');

  for (const spec of specs) {
    assert.ok(
      !hazards.has(spec.surface),
      `${spec.id} is a corridor of ${spec.surface}, which only a hazard footprint may paint`,
    );
    for (const band of spec.bands ?? []) {
      assert.ok(
        !hazards.has(band.surface),
        `${spec.id} has a ${band.surface} verge band — a hazard is a circle, not a stripe`,
      );
    }
  }

  // The socket vocabulary and the transition table are both read off those
  // specs, so this is the one check that has to hold for either to be sound.
  for (const piece of SEGMENT_LIBRARY) {
    for (const socket of [piece.entry, piece.exit]) {
      assert.ok(!hazards.has(socket.surface), `${piece.id} offers a ${socket.surface} socket`);
    }
  }
  for (const [from, tos] of LEGIBLE_SURFACE_TRANSITIONS) {
    assert.ok(!hazards.has(from), `${from} is a legible transition source`);
    for (const to of tos) assert.ok(!hazards.has(to), `${from} into ${to} is a legible transition`);
  }
});

test('a mismatch is reported with a reason a human can act on', () => {
  const reasons = socketMismatches(
    { surface: 'brick', halfWidth: 17, gradient: 0 },
    { surface: 'dirt', halfWidth: 2.9, gradient: 0.4 },
  );
  assert.equal(reasons.length, 3);
  assert.ok(reasons.some((reason) => reason.includes('transition the slice never makes')));
  assert.ok(reasons.some((reason) => reason.includes('half-width')));
  assert.ok(reasons.some((reason) => reason.includes('crease')));
});

test('the connectors are neutral: no blocks, no dressing, no paint', () => {
  assert.ok(LIBRARY_CONNECTORS.length >= 10, 'too few joins to change direction with');
  for (const piece of LIBRARY_CONNECTORS) {
    assert.equal(piece.branches.length, 0, `${piece.id} has a branch and is not a join`);
    for (const spec of piece.main) {
      assert.equal(spec.blocks, undefined, `${piece.id} carries a block`);
      assert.equal(spec.props, undefined, `${piece.id} carries dressing`);
      assert.equal(spec.markings, undefined, `${piece.id} carries paint`);
    }
    assert.equal(piece.cost.colliders, 0);
    assert.equal(piece.cost.props, 0);
    assert.equal(piece.cost.markingQuads, 0);
  }
});

test('every connector can follow at least one beat and be followed by one', () => {
  // A connector nothing can reach is dead library. This is what makes the
  // connector set a bridge rather than a list of shapes.
  for (const link of LIBRARY_CONNECTORS) {
    assert.ok(LIBRARY_BEATS.some((beat) => canFollow(beat, link)), `nothing reaches ${link.id}`);
    assert.ok(LIBRARY_BEATS.some((beat) => canFollow(link, beat)), `${link.id} leads nowhere`);
  }
});

test('instantiate renames every id and remaps every branch root', () => {
  const fork = libraryPiece('fork');
  const placed = instantiate(fork, '3');

  for (const spec of placed.main) assert.match(spec.id, /@3$/);
  for (const branch of [...placed.branches, ...placed.optional.map((o) => o.branch)]) {
    assert.match(branch.from, /@3$/);
    for (const spec of branch.specs) assert.match(spec.id, /@3$/);
  }
  assert.equal(placed.exitSegmentId, 'road-in@3');

  // Two instances of one piece place together without the duplicate-id refusal.
  const a = instantiate(fork, 'a');
  const b = instantiate(fork, 'b', { attachTo: a.exitSegmentId });
  const graph = { main: a.main, branches: [...a.branches, ...b.branches] };
  assert.equal(
    placeGraph(graph, { position: { x: 0, y: 0, z: 0 }, headingY: 0 }).length,
    a.main.length + a.branches.flatMap((br) => br.specs).length
      + b.branches.flatMap((br) => br.specs).length,
  );

  // The optional branches come back separately, so a caller can drop one
  // without retrying the route (master §6.3).
  assert.ok(placed.optional.length >= 2, 'the fork has an alley and a ledge');
  assert.deepEqual(
    instantiate(fork, '3', { dropOptional: true }).optional,
    [],
  );
});
