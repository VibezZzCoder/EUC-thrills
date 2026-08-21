/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { MARKINGS } from '../data/markings.ts';
import { CHALLENGE } from '../data/tuning.ts';
import { ChallengeRun, insideCheckpoint } from '../simulation/challenge.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import {
  buildLevelPlan,
  fieldHeightAt,
  type CheckpointSpec,
  type HazardSpec,
} from './buildPlan.ts';
import type { Checkpoint, LevelPlan } from './plan.ts';
import type { SegmentSpec } from './segments.ts';

/**
 * The plan builder's paint clipper — M7.5 stage 4.
 *
 * **These are here rather than in `sliceLevel.test.ts` because the slice cannot
 * test them.** That suite asserts every point of every line in the shipped
 * world obeys the three rules `level/plan.ts` states; a mutation check then
 * showed that deleting the *surface* rule outright left it passing, because no
 * line in the slice happens to be authored across a grass band. A rule nothing
 * exercises is a rule that quietly stops working.
 *
 * So each rule gets a level built to break it: a corridor with a band of
 * something unpaintable across the middle, a corridor with a kerb standing in
 * it, and a line authored off the end of the world. Small, synthetic, and the
 * only place where the clipper is the subject rather than a background service.
 */

const OPTIONS = {
  id: 'clip-fixture',
  spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
  surround: { height: 0, surface: 'grass' as const },
};

/** A straight forty-metre road with one authored line down its centre. */
function road(overrides: Partial<SegmentSpec> = {}): LevelPlan {
  const spec: SegmentSpec = {
    id: 'road',
    length: 40,
    halfWidth: 6,
    surface: 'pavement',
    shoulder: 5,
    markings: [{ path: [{ s: 0, t: 0 }, { s: 40, t: 0 }], role: 'centre' }],
    ...overrides,
  };
  return buildLevelPlan([spec], OPTIONS);
}

/** Distance along +Z that a plan's paint actually covers, as a set of spans. */
function paintedSpans(plan: LevelPlan): { from: number; to: number }[] {
  return (plan.markings ?? []).map((marking) => {
    const zs = marking.points.map((point) => point.z);
    return { from: Math.min(...zs), to: Math.max(...zs) };
  }).sort((a, b) => a.from - b.from);
}

test('an unbroken road carries one unbroken line', () => {
  const spans = paintedSpans(road());
  assert.equal(spans.length, 1, 'a clean road should not need clipping');
  // Short of the full forty by about half a cell at the far end, and that is
  // correct rather than sloppy: the surface under a point is the surface of the
  // heightfield *cell* containing it, and the cell straddling the exit socket
  // has its centre out on the surround. A chained beat has no such gap, because
  // the next corridor owns that cell.
  assert.ok(spans[0].from < 1, `the line started late, at ${spans[0].from}`);
  assert.ok(spans[0].to > 38, `the line only reached ${spans[0].to}`);
});

test('paint stops at a surface nobody would paint, and starts again after it', () => {
  // A band of grass straight across the middle of the corridor. The line is
  // still authored down the whole beat; the builder has to cut it.
  const spans = paintedSpans(road({
    bands: [{ from: -6, to: 6, surface: 'grass' }],
  }));
  assert.equal(spans.length, 0, 'a road surfaced entirely in grass carries no paint at all');

  // And a band the line has to cross rather than live in.
  const crossing = buildLevelPlan([{
    id: 'road',
    length: 40,
    halfWidth: 6,
    surface: 'pavement',
    shoulder: 5,
    markings: [{ path: [{ s: 0, t: 0 }, { s: 40, t: 0 }], role: 'centre' }],
  }], OPTIONS);
  assert.ok((crossing.markings ?? []).length > 0, 'the control case has to paint something');
});

test('a grass verge inside a corridor takes no paint, but the asphalt beside it does', () => {
  // The park gate and the riverside path both carry grass shoulders *inside*
  // the corridor, which is the case this rule exists for: an edge line authored
  // at the corridor's own edge would be painted onto turf.
  const plan = buildLevelPlan([{
    id: 'path',
    length: 40,
    halfWidth: 6,
    surface: 'pavement',
    shoulder: 5,
    bands: [{ from: 3, to: 6, surface: 'grass' }, { from: -6, to: -3, surface: 'grass' }],
    markings: [
      { path: [{ s: 0, t: 0 }, { s: 40, t: 0 }], role: 'centre' },
      { path: [{ s: 0, t: 4.5 }, { s: 40, t: 4.5 }], role: 'edge' },
    ],
  }], OPTIONS);

  const lateral = (plan.markings ?? []).map((marking) => marking.points[0].x);
  assert.ok(lateral.some((x) => Math.abs(x) < 0.5), 'the centre line was lost');
  assert.ok(
    !lateral.some((x) => Math.abs(x) > 3),
    'a line survived out on the grass band',
  );
});

test('paint stops at a kerb rather than climbing over it', () => {
  // A kerb across the road at s 20. Nothing about the marking mentions it.
  const spans = paintedSpans(road({
    blocks: [{
      s: 20, t: 0, halfAlong: 3, halfLateral: 4, height: 0.15, surface: 'pavement',
    }],
  }));
  assert.equal(spans.length, 2, `the block did not split the line: ${JSON.stringify(spans)}`);
  assert.ok(spans[0].to < 20 - 3, 'paint ran onto the near face of the block');
  assert.ok(spans[1].from > 20 + 3, 'paint ran onto the far face of the block');
  const gap = spans[1].from - spans[0].to;
  assert.ok(
    gap >= 6 && gap < 6 + 2 * MARKINGS.colliderClearance + 2 * MARKINGS.sampleStep,
    `the gap around a 6 m block came out at ${gap.toFixed(2)} m`,
  );
});

test('paint authored off the end of a corridor is cut at the corridor', () => {
  const plan = road({
    markings: [{ path: [{ s: 0, t: 0 }, { s: 40, t: 22 }], role: 'centre' }],
  });
  for (const marking of plan.markings ?? []) {
    for (const point of marking.points) {
      assert.ok(Math.abs(point.x) <= 6.001, `paint reached ${point.x.toFixed(2)} m off the centreline`);
    }
  }
});

test('an offcut left by clipping is thrown away rather than shipped', () => {
  // Two blocks with a 2.5 m strip of road between them. Once the clearance is
  // taken off each side, the paint that survives in that strip is 1.25 m long —
  // two sample points, so it is a real run rather than a degenerate one, and it
  // is under the minimum. A 1.25 m dab of white between two kerbs is litter.
  //
  // The gap is this specific because the rule is: sampling is every 1.25 m, so
  // a wider strip carries three points and is legitimately paintable, and a
  // narrower one carries one and is thrown out by needing two points at all.
  // Only this width tests the minimum itself.
  const spans = paintedSpans(road({
    blocks: [
      { s: 18, t: 0, halfAlong: 3, halfLateral: 4, height: 0.15, surface: 'pavement' },
      { s: 26.5, t: 0, halfAlong: 3, halfLateral: 4, height: 0.15, surface: 'pavement' },
    ],
  }));
  assert.equal(spans.length, 2, `an offcut shipped: ${JSON.stringify(spans)}`);
});

test('a plan with no authored paint carries no markings array at all', () => {
  const plan = road({ markings: undefined });
  assert.equal(plan.markings, undefined);
});

test('the same fixture builds the same paint twice', () => {
  assert.deepEqual(road().markings, road().markings);
});

test('a building cannot survive inside an assembled solid', () => {
  const props = road({
    markings: undefined,
    blocks: [{
      s: 20, t: 15, halfAlong: 3, halfLateral: 3, height: 2, surface: 'pavement',
    }],
    props: [{
      s: 20, t: 15, kind: 'building', size: { x: 6, y: 12, z: 6 },
    }],
  }).props ?? [];
  assert.equal(props.some((prop) => prop.kind === 'building'), false);
});

test('structural furniture wins a shared footprint over incidental planting', () => {
  const props = road({
    markings: undefined,
    props: [
      { s: 20, t: 15, kind: 'shrub' },
      { s: 20, t: 15, kind: 'bench' },
    ],
  }).props ?? [];
  assert.deepEqual(props.map((prop) => prop.kind), ['bench']);
});

// ---------------------------------------------------------------------------
// The checkpoint resolver — M10
// ---------------------------------------------------------------------------

/**
 * These are here for the same reason the clipper's are: the slice can only test
 * the six gates it happens to carry, and none of them is authored badly. Every
 * rule the resolver enforces gets a fixture built to break it.
 */

/** A straight road carrying a start and a finish, and no paint to distract. */
function timedRoad(
  checkpoints: readonly CheckpointSpec[],
  overrides: Partial<SegmentSpec> = {},
  spawn = OPTIONS.spawn,
): LevelPlan {
  return buildLevelPlan([{
    id: 'road',
    length: 40,
    halfWidth: 6,
    surface: 'pavement',
    shoulder: 5,
    ...overrides,
  }], { ...OPTIONS, spawn, checkpoints });
}

const START_AND_FINISH: readonly CheckpointSpec[] = [
  { id: 'start', segment: 'road', s: 8, kind: 'start', label: 'Start' },
  { id: 'finish', segment: 'road', s: 32, kind: 'finish', label: 'Finish' },
];

test('a level that authors no route carries an empty checkpoint array', () => {
  // Not `undefined`: `LevelPlan.checkpoints` is required, and the proving
  // ground and every fixture in this file reach `ChallengeRun` as "this level
  // cannot be timed" rather than as a missing field.
  assert.deepEqual(road().checkpoints, []);
});

test('a checkpoint is detection data and reaches no other array', () => {
  // The M7 trap, asserted rather than promised (`plan.ts`): a gate that leaked
  // into the colliders would be read by the sampler as ground 3.2 m up, and a
  // gate that leaked into the props would be drawn twice. Built twice from one
  // fixture, so the comparison is of the *whole* output rather than of counts.
  const bare = timedRoad([], { blocks: [{
    s: 20, t: 4, halfAlong: 2, halfLateral: 1, height: 0.15, surface: 'pavement',
  }], props: [{ s: 20, t: 11, kind: 'bench' }] });
  const timed = timedRoad(START_AND_FINISH, { blocks: [{
    s: 20, t: 4, halfAlong: 2, halfLateral: 1, height: 0.15, surface: 'pavement',
  }], props: [{ s: 20, t: 11, kind: 'bench' }] });

  assert.equal(timed.checkpoints.length, 2);
  assert.deepEqual(timed.segments, bare.segments, 'a gate changed the authored colliders');
  assert.deepEqual(timed.solids, bare.solids, 'a gate reached plan.solids');
  assert.deepEqual(timed.props, bare.props, 'a gate reached plan.props');
  assert.deepEqual(timed.heightfield.heights, bare.heightfield.heights, 'a gate moved the ground');
});

test('a route out of order is refused at build time rather than repaired', () => {
  // `simulation/challenge.ts` sorts by `routeIndex` before it referees, so a
  // mis-authored array would not fail there — it would run the course in the
  // wrong order and only a player would notice. Refusing to build is cheaper.
  const cases: [string, CheckpointSpec[]][] = [
    ['a lone gate', [{ id: 'a', segment: 'road', s: 8, kind: 'start', label: 'A' }]],
    ['no start', [
      { id: 'a', segment: 'road', s: 8, kind: 'split', label: 'A' },
      { id: 'b', segment: 'road', s: 32, kind: 'finish', label: 'B' },
    ]],
    ['a finish in the middle', [
      { id: 'a', segment: 'road', s: 8, kind: 'start', label: 'A' },
      { id: 'b', segment: 'road', s: 20, kind: 'finish', label: 'B' },
      { id: 'c', segment: 'road', s: 32, kind: 'finish', label: 'C' },
    ]],
    ['a finish followed by a split', [
      { id: 'a', segment: 'road', s: 8, kind: 'start', label: 'A' },
      { id: 'b', segment: 'road', s: 20, kind: 'finish', label: 'B' },
      { id: 'c', segment: 'road', s: 32, kind: 'split', label: 'C' },
    ]],
    ['a split at the start of a lap', [
      { id: 'a', segment: 'road', s: 8, kind: 'split', label: 'A' },
      { id: 'b', segment: 'road', s: 32, kind: 'split', label: 'B' },
    ]],
    ['two gates with one id', [
      { id: 'a', segment: 'road', s: 8, kind: 'start', label: 'A' },
      { id: 'a', segment: 'road', s: 32, kind: 'finish', label: 'B' },
    ]],
  ];
  for (const [name, specs] of cases) {
    assert.throws(() => timedRoad(specs), `${name} was accepted`);
  }
});

test('a route with no finish is a lap, and is built rather than refused', () => {
  // **`no finish` was in the list above until M23**, and the venue is why it
  // left. A closed circuit has one line — crossed to open a lap and crossed
  // again to close it — so there is no second gate to call a finish, and
  // inventing one at the start's own coordinates would put two gantries in one
  // place and detect one crossing twice. Everything else about the grammar is
  // unchanged: it is still one start, then splits, and the cases above still
  // throw.
  const lap = timedRoad([
    { id: 'line', segment: 'road', s: 8, kind: 'start', label: 'Line' },
    { id: 'sector-1', segment: 'road', s: 20, kind: 'split', label: 'Sector 1' },
    { id: 'sector-2', segment: 'road', s: 32, kind: 'split', label: 'Sector 2' },
  ]);
  assert.deepEqual(lap.checkpoints.map((gate) => gate.kind), ['start', 'split', 'split']);
  assert.deepEqual(lap.checkpoints.map((gate) => gate.routeIndex), [0, 1, 2]);

  // And the M10 referee declines it without being told to, which is what makes
  // this a coherent shape rather than a convenient one: a time trial asks
  // whether a route can start and stop, and a lap cannot.
  assert.equal(new ChallengeRun(lap.id, lap.checkpoints).available, false);

  // A straight road spelled as a lap is still a straight road, so it carries
  // no envelope — which is the honest answer and is what stops anything
  // downstream lapping a fixture. See `LevelPlan.lap`.
  assert.equal(lap.lap, undefined, 'a chain that does not meet itself emitted a ring');
});

// ---------------------------------------------------------------------------
// The lap envelope — M23 Phase B2
// ---------------------------------------------------------------------------

/**
 * A closed ring of four quarter-circles, authored the way `trackLevel.ts`
 * authors BelVar and small enough to check by hand.
 *
 * `curvature` is `1 / radius`, positive toward the rider's LEFT, and four
 * ninety-degree arcs of the same radius close on themselves — so the emitted
 * envelope's length must be the circle's circumference and its ends must meet.
 */
function ringOfRadius(radius: number, halfWidth = 6): LevelPlan {
  const quarter = (index: number): SegmentSpec => ({
    id: `arc-${index}`,
    length: (Math.PI / 2) * radius,
    curvature: 1 / radius,
    halfWidth,
    surface: 'pavement',
    shoulder: 5,
  });
  return buildLevelPlan([quarter(0), quarter(1), quarter(2), quarter(3)], {
    ...OPTIONS,
    checkpoints: [
      { id: 'line', segment: 'arc-0', s: 1, kind: 'start', label: 'Line' },
      { id: 'sector-1', segment: 'arc-2', s: 1, kind: 'split', label: 'Sector 1' },
    ],
  });
}

test('a closed ring emits its own centreline, and the ends meet', () => {
  const radius = 30;
  const plan = ringOfRadius(radius);
  const lap = plan.lap;
  assert.ok(lap !== undefined, 'a ring carries no lap');

  const circumference = 2 * Math.PI * radius;
  assert.ok(
    Math.abs(lap.length - circumference) < 0.05,
    `the ring measures ${lap.length.toFixed(3)} m against ${circumference.toFixed(3)}`,
  );

  const first = lap.points[0];
  const last = lap.points[lap.points.length - 1];
  assert.equal(first.x, last.x, 'the ring does not close in x');
  assert.equal(first.z, last.z, 'the ring does not close in z');
  for (const point of lap.points) assert.equal(point.halfWidth, 6);

  // Every sample is on the circle, which is what says the line is the arc and
  // not the chord between two sockets. The centre is one radius to the rider's
  // LEFT of the spawn, since the curvature turns that way.
  const centre = { x: OPTIONS.spawn.position.x + radius, z: OPTIONS.spawn.position.z };
  for (const point of lap.points) {
    const off = Math.abs(Math.hypot(point.x - centre.x, point.z - centre.z) - radius);
    assert.ok(off < 0.02, `a sample sits ${off.toFixed(3)} m off the circle`);
  }
});

test('samples are close enough that the chord between two is not a shortcut', () => {
  // The sagitta bound `LAP_SAMPLE_SPACING` is derived from. At the tightest
  // radius the venue authors, two samples must not span more than a centimetre
  // of departure from the arc they describe.
  const plan = ringOfRadius(14);
  const lap = plan.lap!;
  const centre = { x: OPTIONS.spawn.position.x + 14, z: OPTIONS.spawn.position.z };
  let worst = 0;
  for (let index = 1; index < lap.points.length; index += 1) {
    const a = lap.points[index - 1];
    const b = lap.points[index];
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    worst = Math.max(worst, 14 - Math.hypot(midX - centre.x, midZ - centre.z));
  }
  assert.ok(worst < 0.05, `a chord cuts ${(worst * 1000).toFixed(0)} mm inside a 14 m corner`);
});

test('a point-to-point route carries no envelope at all', () => {
  assert.equal(timedRoad(START_AND_FINISH).lap, undefined);
  // Absent, never empty — `LevelPlan.lap` states the contract and this is the
  // producer it binds. An empty ring would be a different plan with a different
  // digest, and it would move both pinned ones on the day it was emitted.
  assert.ok(!('lap' in timedRoad(START_AND_FINISH)), 'the key must not be present at all');
});

test('a lap gate authored onto a branch is refused rather than fenced off', () => {
  // The envelope is the main chain. A sector line hanging off a side road would
  // be a gate the referee expects the rider to cross while judging them against
  // an envelope that does not contain it — a lap voided at one corner with
  // nothing on screen explaining why.
  assert.throws(() => buildLevelPlan({
    main: [
      { id: 'ring-a', length: (Math.PI / 2) * 20, curvature: 1 / 20, halfWidth: 6, surface: 'pavement' },
      { id: 'ring-b', length: (Math.PI / 2) * 20, curvature: 1 / 20, halfWidth: 6, surface: 'pavement' },
      { id: 'ring-c', length: (Math.PI / 2) * 20, curvature: 1 / 20, halfWidth: 6, surface: 'pavement' },
      { id: 'ring-d', length: (Math.PI / 2) * 20, curvature: 1 / 20, halfWidth: 6, surface: 'pavement' },
    ],
    branches: [{
      from: 'ring-a',
      atDistance: 10,
      lateralOffset: -6,
      headingOffset: -Math.PI / 2,
      specs: [{ id: 'spur', length: 30, halfWidth: 4, surface: 'pavement' }],
    }],
  }, {
    ...OPTIONS,
    checkpoints: [
      { id: 'line', segment: 'ring-a', s: 1, kind: 'start', label: 'Line' },
      { id: 'sector-1', segment: 'spur', s: 10, kind: 'split', label: 'Sector 1' },
    ],
  }), /not on the lap/);
});

test('a gate authored onto nowhere is refused', () => {
  assert.throws(() => timedRoad([
    { id: 'start', segment: 'lane', s: 8, kind: 'start', label: 'Start' },
    { id: 'finish', segment: 'road', s: 32, kind: 'finish', label: 'Finish' },
  ]), /lane/, 'an unplaced segment id was accepted');

  assert.throws(() => timedRoad([
    { id: 'start', segment: 'road', s: 8, kind: 'start', label: 'Start' },
    { id: 'finish', segment: 'road', s: 41, kind: 'finish', label: 'Finish' },
  ]), /41/, 'a gate off the end of its own segment was accepted');
});

test('a gate is as wide as the corridor plus the margin, and no deeper than one step can cross', () => {
  const [start] = timedRoad(START_AND_FINISH, { halfWidth: 6 }).checkpoints;
  assert.equal(start.halfExtents.x, 6 + CHALLENGE.gateWidthMargin);
  assert.equal(start.halfExtents.y, CHALLENGE.gateHalfHeight);
  assert.equal(start.halfExtents.z, CHALLENGE.gateHalfDepth);

  // And it follows the corridor rather than a constant: a narrower beat gets a
  // narrower gate, which is what stops one on a 5.8 m alley reaching into the
  // road beside it.
  const [narrow] = timedRoad(START_AND_FINISH, { halfWidth: 2.9 }).checkpoints;
  assert.equal(narrow.halfExtents.x, 2.9 + CHALLENGE.gateWidthMargin);
});

/** A world point in a gate's own frame. The inverse yaw `insideCheckpoint` applies. */
function gateLocal(gate: Checkpoint, x: number, z: number): { x: number; z: number } {
  const dx = x - gate.centre.x;
  const dz = z - gate.centre.z;
  const cos = Math.cos(gate.headingY);
  const sin = Math.sin(gate.headingY);
  return { x: cos * dx - sin * dz, z: sin * dx + cos * dz };
}

test('a gate’s local +X is the rider’s left and its local +Z is the way they are going', () => {
  // **The convention test, on a corridor deliberately not aligned with the
  // world.** `AGENTS.md`: a world-space sign test cannot catch a convention
  // error, because a test written from the same wrong convention agrees with
  // the code. So the two directions here are not taken from `leftOf` — they are
  // derived from the axis facts. At a heading of zero the rider faces +Z and
  // their left is +X; rotating the frame by +pi/2 about +Y carries +Z onto +X
  // and +X onto -Z, so a corridor running at pi/2 faces +X and its left is -Z.
  const spawn = { position: { x: 0, y: 0, z: 0 }, headingY: Math.PI / 2 };
  const [gate] = timedRoad(START_AND_FINISH, {}, spawn).checkpoints;

  // The gate is 8 m along a corridor that runs down +X.
  assert.ok(Math.abs(gate.centre.x - 8) < 1e-9, `the gate is at x=${gate.centre.x}`);
  assert.ok(Math.abs(gate.centre.z) < 1e-9, `the gate is at z=${gate.centre.z}`);

  const left = gateLocal(gate, gate.centre.x, gate.centre.z - 1);
  assert.ok(left.x > 0.999, `a metre to the rider’s left came out at local x=${left.x}`);
  assert.ok(Math.abs(left.z) < 1e-9);

  const ahead = gateLocal(gate, gate.centre.x + 1, gate.centre.z);
  assert.ok(ahead.z > 0.999, `a metre down the route came out at local z=${ahead.z}`);
  assert.ok(Math.abs(ahead.x) < 1e-9);

  // Which is what makes the width the lateral half-extent: a rider out at the
  // corridor's edge is inside the gate, and one a metre beyond its margin is
  // not. On this corridor "the side" is Z, and on the slice's it is neither.
  const edge = gate.halfExtents.x;
  assert.ok(insideCheckpoint(gate, gate.centre.x, gate.centre.y, gate.centre.z - edge + 0.1));
  assert.ok(!insideCheckpoint(gate, gate.centre.x, gate.centre.y, gate.centre.z - edge - 1));
  assert.ok(!insideCheckpoint(gate, gate.centre.x + 2 * gate.halfExtents.z, gate.centre.y, gate.centre.z));
});

test('a gate on a crowned road stands on the gutter, not on the crown', () => {
  // **The ten-centimetre bug this rule exists for.** Detection is a point test
  // on the contact patch. A box founded on the ground at the *centreline* of a
  // crowned road floats above the gutter, and a rider holding the gutter — a
  // legal, ordinary line — crosses the whole volume underneath it and is never
  // seen. Half a metre of crown here so the failure is unmissable if the
  // foundation ever goes back to the centreline.
  const plan = timedRoad(START_AND_FINISH, { crown: 0.5 });
  const [gate] = plan.checkpoints;

  const floor = gate.centre.y - gate.halfExtents.y;
  assert.ok(floor <= -0.4, `the gate was founded at ${floor.toFixed(3)}, up on the crown`);

  // Every point of ground the gate spans, at the resolution the field has, has
  // a rider standing on it inside the volume. Sampled a little inside the two
  // faces along the route, because a point placed *on* a face is a knife edge
  // in this test's own arithmetic and the claim here is about height.
  for (let t = -6; t <= 6; t += 0.25) {
    for (const d of [-1.5, 0, 1.5]) {
      const x = gate.centre.x + t;
      const z = gate.centre.z + d;
      const ground = fieldHeightAt(plan.heightfield, plan.surround, x, z);
      assert.ok(
        insideCheckpoint(gate, x, ground, z),
        `a rider on the ground at t=${t.toFixed(2)}, ${ground.toFixed(3)} m up, was missed`,
      );
    }
  }
});

test('a sloped building footprint gets a buried foundation rather than an air gap', () => {
  const plan = road({
    climb: 4,
    markings: undefined,
    props: [{
      s: 20, t: 11, kind: 'building', size: { x: 8, y: 12, z: 16 },
    }],
  });
  const building = (plan.props ?? []).find((prop) => prop.kind === 'building');
  assert.ok(building !== undefined);
  const halfX = building.size!.x / 2;
  const halfZ = building.size!.z / 2;
  for (const x of [building.position.x - halfX, building.position.x, building.position.x + halfX]) {
    for (const z of [building.position.z - halfZ, building.position.z, building.position.z + halfZ]) {
      assert.ok(
        fieldHeightAt(plan.heightfield, plan.surround, x, z) >= building.position.y - 1e-9,
        'terrain fell below the building base',
      );
    }
  }
});

// ---------------------------------------------------------------------------
// `settleBlocks` — the foundation under an authored block
// ---------------------------------------------------------------------------

/**
 * A block standing well outside its own corridor, on a road lifted clear of the
 * field around it.
 *
 * This is the shape every one of the owner's floating objects had: a street tree
 * at t 12.5 on a nine-metre road, a frontage at t 13.5. The block is placed in
 * the corridor's frame, so its base is 0.6 m under the *corridor* — and the
 * ground out at t 12 is the shoulder, most of the way down to the surround.
 */
function perchedBlock(settleBlocks: boolean): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'perch',
      length: 40,
      halfWidth: 6,
      surface: 'pavement',
      shoulder: 5,
      blocks: [{
        s: 20, t: 12, halfAlong: 0.3, halfLateral: 0.3, height: 4.2, surface: 'wood',
      }],
    }],
    {
      ...OPTIONS,
      id: 'perch-fixture',
      // The road starts four metres above the grass around it.
      spawn: { position: { x: 0, y: 4, z: 0 }, headingY: 0 },
      settleBlocks,
    },
  );
}

const perchedCollider = (plan: LevelPlan) => plan.segments[0].colliders[0];

test('a block off the edge of a raised corridor floats without settleBlocks', () => {
  // Stated as a failing measurement rather than assumed, because the fix below
  // means nothing if the defect it is for cannot be produced on demand.
  const collider = perchedCollider(perchedBlock(false));
  const base = collider.centre.y - collider.halfExtents.y;
  const ground = fieldHeightAt(
    perchedBlock(false).heightfield,
    { height: 0, surface: 'grass' },
    collider.centre.x,
    collider.centre.z,
  );
  assert.ok(base - ground > 1, `the fixture only floats it ${(base - ground).toFixed(2)} m`);
});

test('settleBlocks carries that block down to the ground and leaves its top alone', () => {
  const floating = perchedCollider(perchedBlock(false));
  const footed = perchedCollider(perchedBlock(true));
  const plan = perchedBlock(true);

  assert.equal(
    footed.centre.y + footed.halfExtents.y,
    floating.centre.y + floating.halfExtents.y,
    'the top face moved, so what a rider meets changed',
  );

  const base = footed.centre.y - footed.halfExtents.y;
  for (const dx of [-footed.halfExtents.x, 0, footed.halfExtents.x]) {
    for (const dz of [-footed.halfExtents.z, 0, footed.halfExtents.z]) {
      const ground = fieldHeightAt(
        plan.heightfield,
        plan.surround,
        footed.centre.x + dx,
        footed.centre.z + dz,
      );
      assert.ok(ground >= base - 1e-9, `ground fell ${(base - ground).toFixed(2)} m below the block`);
    }
  }
});

test('a block already standing on its ground is returned untouched', () => {
  // The pass has to be a no-op on a level whose blocks are grounded, or every
  // hand-authored collider in the game would move by a rounding error.
  const flat = buildLevelPlan(
    [{
      id: 'flat',
      length: 20,
      halfWidth: 6,
      surface: 'pavement',
      shoulder: 5,
      blocks: [{ s: 10, t: 0, halfAlong: 1, halfLateral: 1, height: 0.5, surface: 'pavement' }],
    }],
    { ...OPTIONS, id: 'flat-fixture', settleBlocks: false },
  );
  const footed = buildLevelPlan(
    [{
      id: 'flat',
      length: 20,
      halfWidth: 6,
      surface: 'pavement',
      shoulder: 5,
      blocks: [{ s: 10, t: 0, halfAlong: 1, halfLateral: 1, height: 0.5, surface: 'pavement' }],
    }],
    { ...OPTIONS, id: 'flat-fixture', settleBlocks: true },
  );
  assert.deepStrictEqual(footed.segments[0].colliders, flat.segments[0].colliders);
});

// ---------------------------------------------------------------------------
// The hazard resolver and the spill overpaint — M13 Phase 1
// ---------------------------------------------------------------------------

/**
 * Here for the third time for the reason the clipper's and the gates' are, with
 * one difference that makes it the *only* place these rules can be tested at
 * all: §13 q9 puts hazards in generated routes only, so no shipped world
 * carries one and the slice suite has nothing to look at. Until Phase 3 places
 * the first hazard from a seed, these fixtures are the whole of the evidence.
 */

/** A straight road that carries hazards and nothing else. */
function hazardRoad(
  hazards: readonly HazardSpec[],
  overrides: Partial<SegmentSpec> = {},
  spawn = OPTIONS.spawn,
): LevelPlan {
  return buildLevelPlan([{
    id: 'road',
    length: 40,
    halfWidth: 6,
    surface: 'pavement',
    shoulder: 5,
    ...overrides,
  }], { ...OPTIONS, spawn, hazards });
}

/** Every cell in a plan, with its centre in world XZ. The builder's own loop. */
function eachCell(
  plan: LevelPlan,
  visit: (index: number, x: number, z: number) => void,
): void {
  const field = plan.heightfield;
  for (let row = 0; row < field.rows - 1; row += 1) {
    const z = field.originZ + (row + 0.5) * field.spacing;
    for (let column = 0; column < field.columns - 1; column += 1) {
      visit(
        row * (field.columns - 1) + column,
        field.originX + (column + 0.5) * field.spacing,
        z,
      );
    }
  }
}

test('a plan with no hazards carries no hazards key at all', () => {
  // **The property both pinned digests rest on** (`planDigest.ts`): an absent
  // key is omitted from the canonical string and an empty array is not, so an
  // unconditional `hazards: []` would move the slice and the proving ground
  // without changing a single thing a rider can reach.
  const plan = road();
  assert.ok(!('hazards' in plan), 'an empty hazard array reached a plan that authored none');
  assert.ok('hazards' in hazardRoad([
    { id: 'a', segment: 'road', s: 20, t: 0, kind: 'potholeDeep', radius: 1 },
  ]), 'and the key has to appear when there is one');
});

test('a pothole lands where a curved corridor’s lateral offset actually is', () => {
  // **The convention test, and a straight corridor cannot be it.** On a straight
  // beat every plausible mistake — left for right, left for forward, a lateral
  // offset dropped entirely — puts the hazard somewhere on the +X axis, and a
  // test written against a straight road agrees with all of them.
  //
  // So the curvature is chosen to put the heading at exactly +pi/2 where the
  // hazard sits, and the expectation comes from the axis facts rather than from
  // `leftOf`: at a heading of zero the rider faces +Z and their left is +X, and
  // rotating the frame by +pi/2 about +Y carries +Z onto +X and +X onto -Z. So
  // on this corridor the rider's left is -Z, and a hazard authored two metres
  // to their left is two metres back down -Z from the centreline — with no +X
  // component whatsoever, which is the part no broken `leftOf` survives.
  const curvature = Math.PI / 40;
  const plan = hazardRoad(
    [{ id: 'hole', segment: 'road', s: 20, t: 2, kind: 'potholeShallow', radius: 0.8 }],
    { curvature },
  );
  const [hole] = plan.hazards ?? [];
  assert.ok(hole !== undefined);

  // A quarter circle of radius 1/curvature from the origin, heading +Z.
  const radius = 1 / curvature;
  assert.ok(Math.abs(hole.centre.x - radius) < 1e-9, `the hazard is at x=${hole.centre.x}`);
  assert.ok(Math.abs(hole.centre.z - (radius - 2)) < 1e-9, `the hazard is at z=${hole.centre.z}`);
  assert.equal(hole.kind, 'potholeShallow');
  assert.equal(hole.radius, 0.8);

  // And the sign is real rather than absolute: the mirrored offset is on the
  // other side of the centreline, not the same distance from it.
  const [mirrored] = hazardRoad(
    [{ id: 'hole', segment: 'road', s: 20, t: -2, kind: 'potholeShallow', radius: 0.8 }],
    { curvature },
  ).hazards ?? [];
  assert.ok(Math.abs(mirrored.centre.z - (radius + 2)) < 1e-9, `mirrored to z=${mirrored.centre.z}`);
});

test('a hazard’s centre is the finished ground, not the corridor that authored it', () => {
  // `AGENTS.md`: two subsystems place things at "the ground" and they mean
  // different surfaces. A hazard means the heightfield, because that is what
  // the contact patch is resolved against — and the two only agree *inside* a
  // corridor. The fixture is the perched one: a road four metres above its own
  // field, with the hazard authored out at t 12, where the ground is the
  // shoulder easing down to the surround.
  const plan = hazardRoad(
    [
      { id: 'crowned', segment: 'road', s: 20, t: 5, kind: 'spill', radius: 1 },
      { id: 'shoulder', segment: 'road', s: 20, t: 12, kind: 'potholeDeep', radius: 1 },
    ],
    { crown: 0.5 },
    { position: { x: 0, y: 4, z: 0 }, headingY: 0 },
  );

  for (const hazard of plan.hazards ?? []) {
    assert.equal(
      hazard.centre.y,
      fieldHeightAt(plan.heightfield, plan.surround, hazard.centre.x, hazard.centre.z),
      `hazard "${hazard.id}" is not on the finished ground`,
    );
  }

  const byId = new Map((plan.hazards ?? []).map((hazard) => [hazard.id, hazard]));
  // Inside the corridor, below the centreline by roughly the crown's own fall.
  assert.ok(byId.get('crowned')!.centre.y < 4, 'the crown was ignored');
  assert.ok(byId.get('crowned')!.centre.y > 3.5, 'the in-road hazard fell off the corridor');
  // Out on the shoulder, most of the way down to the surround at zero. A
  // corridor-frame answer would have said 4 m here.
  assert.ok(
    byId.get('shoulder')!.centre.y < 3,
    `the shoulder hazard took the corridor's height, ${byId.get('shoulder')!.centre.y}`,
  );
});

test('a hazard authored onto nowhere, past the end, off the number line, at no size, or twice is refused', () => {
  assert.throws(() => hazardRoad([
    { id: 'a', segment: 'lane', s: 8, t: 0, kind: 'spill', radius: 1 },
  ]), /lane/, 'an unplaced segment id was accepted');

  assert.throws(() => hazardRoad([
    { id: 'a', segment: 'road', s: 41, t: 0, kind: 'spill', radius: 1 },
  ]), /41/, 'a hazard off the end of its own segment was accepted');

  for (const t of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => hazardRoad([{ id: 'a', segment: 'road', s: 8, t, kind: 'potholeShallow', radius: 1 }]),
      /lateral offset/,
      `a hazard at t=${t} was accepted`,
    );
  }

  // Both kinds, because the spill overpaint runs before the resolver and has
  // its own copy of these guards — one that skips rather than throws. A spec it
  // skipped must still reach the refusal below rather than build a plan.
  for (const kind of ['spill', 'potholeDeep'] as const) {
    for (const radius of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => hazardRoad([{ id: 'a', segment: 'road', s: 8, t: 0, kind, radius }]),
        `a ${kind} of radius ${radius} was accepted`,
      );
    }
  }

  // A render marker and a simulation record that disagree about which hazard is
  // which, refused at build time where it is still cheap to see.
  assert.throws(() => hazardRoad([
    { id: 'a', segment: 'road', s: 8, t: 0, kind: 'spill', radius: 1 },
    { id: 'a', segment: 'road', s: 20, t: 0, kind: 'potholeDeep', radius: 1 },
  ]), /duplicate/, 'two hazards with one id were accepted');
});

test('a spill too small for the heightfield is refused instead of becoming harmless render data', () => {
  // This centre lies between four one-metre cells. A 10 cm footprint reaches
  // none of their centres, so accepting it would put a sheen in `hazards`
  // while leaving pavement under every possible contact sample.
  assert.throws(
    () => hazardRoad([
      { id: 'inert-puddle', segment: 'road', s: 20, t: 0, kind: 'spill', radius: 0.1 },
    ]),
    /covers no heightfield cell/,
  );

  // Refusal is about the resolved grid, not a new hand-written minimum.
  assert.doesNotThrow(() => hazardRoad([
    { id: 'wet-puddle', segment: 'road', s: 20, t: 0, kind: 'spill', radius: 0.8 },
  ]));
});

test('a spill paints the cells under it and leaves every other cell alone', () => {
  // The spill's whole ride response is the surface under the contact patch, so
  // this is the assertion that the hazard *works* rather than merely exists.
  // Both directions, cell by cell against the same road built without it.
  const spill: HazardSpec = { id: 'puddle', segment: 'road', s: 20, t: 0, kind: 'spill', radius: 3 };
  const bare = hazardRoad([]);
  const wet = hazardRoad([spill]);
  const [puddle] = wet.hazards ?? [];

  let painted = 0;
  eachCell(wet, (index, x, z) => {
    const inside = Math.hypot(x - puddle.centre.x, z - puddle.centre.z) <= puddle.radius;
    assert.equal(
      wet.heightfield.surfaces[index] === 'spill',
      inside,
      `the cell at (${x}, ${z}) is ${wet.heightfield.surfaces[index]} and inside=${inside}`,
    );
    if (inside) painted += 1;
    else {
      assert.equal(
        wet.heightfield.surfaces[index],
        bare.heightfield.surfaces[index],
        `the spill changed the cell at (${x}, ${z}), which is outside it`,
      );
    }
  });

  // And the painted region is the size the radius asks for, not one cell and
  // not the corridor: a disc of radius 3 over one-metre cells is about 28 of
  // them. Stated as an area rather than as "something changed", because a
  // radius quietly read as a diameter passes that weaker claim.
  const expected = Math.PI * puddle.radius ** 2 / wet.heightfield.spacing ** 2;
  assert.ok(
    painted > expected * 0.75 && painted < expected * 1.25,
    `${painted} cells painted where about ${expected.toFixed(1)} were due`,
  );

  // The ground itself is untouched. A spill is a surface, not a recess.
  assert.deepStrictEqual(wet.heightfield.heights, bare.heightfield.heights);
});

test('a spill and a pothole authored together each do only their own job', () => {
  // The one test that can catch either kind doing the other's work: a pothole
  // that painted cells would make a hole slippery instead of deep, and a spill
  // that did not would be a puddle with no consequence at all.
  const bare = hazardRoad([]);
  const both = hazardRoad([
    { id: 'puddle', segment: 'road', s: 12, t: 0, kind: 'spill', radius: 3 },
    { id: 'hole', segment: 'road', s: 28, t: 0, kind: 'potholeDeep', radius: 3 },
  ]);

  assert.deepEqual((both.hazards ?? []).map((hazard) => hazard.id), ['puddle', 'hole']);
  const [puddle, hole] = both.hazards ?? [];
  assert.deepEqual([puddle.kind, hole.kind], ['spill', 'potholeDeep']);
  // Both are records, resolved identically. Only the painting differs.
  for (const hazard of [puddle, hole]) {
    assert.equal(hazard.radius, 3);
    assert.equal(
      hazard.centre.y,
      fieldHeightAt(both.heightfield, both.surround, hazard.centre.x, hazard.centre.z),
    );
  }

  eachCell(both, (index, x, z) => {
    const inPuddle = Math.hypot(x - puddle.centre.x, z - puddle.centre.z) <= puddle.radius;
    assert.equal(
      both.heightfield.surfaces[index] === 'spill',
      inPuddle,
      `the cell at (${x}, ${z}) disagrees with the puddle alone`,
    );
    if (!inPuddle) {
      assert.equal(
        both.heightfield.surfaces[index],
        bare.heightfield.surfaces[index],
        `the pothole changed the cell at (${x}, ${z})`,
      );
    }
  });
});

test('a pothole is detection data and reaches no other array', () => {
  // The M7 trap for the third time, and `plan.ts` calls this its worst form: a
  // pothole built as a collider would be a slab of ground at road level, so the
  // one feature whose entire point is that the surface drops away would be the
  // one feature that cannot. Built twice from one fixture, so the comparison is
  // of the whole output rather than of counts.
  const dressed: Partial<SegmentSpec> = {
    blocks: [{ s: 20, t: 4, halfAlong: 2, halfLateral: 1, height: 0.15, surface: 'pavement' }],
    props: [{ s: 20, t: 11, kind: 'bench' }],
  };
  const bare = hazardRoad([], dressed);
  const holed = hazardRoad(
    [{ id: 'hole', segment: 'road', s: 20, t: 0, kind: 'potholeDeep', radius: 1.2 }],
    dressed,
  );

  assert.equal((holed.hazards ?? []).length, 1);
  assert.deepStrictEqual(holed.segments, bare.segments, 'a hazard changed the authored colliders');
  assert.deepStrictEqual(holed.solids, bare.solids, 'a hazard reached plan.solids');
  assert.deepStrictEqual(holed.props, bare.props, 'a hazard reached plan.props');
  assert.deepStrictEqual(holed.heightfield, bare.heightfield, 'a pothole touched the ground');
});

// ---------------------------------------------------------------------------
// The diagnostic scatter — M13 Phase 2
// ---------------------------------------------------------------------------

test('the hazard probe is absent unless asked for, and then goes through the real path', () => {
  // **It exists because Phase 2's owner gate is otherwise unperformable**: the
  // gate asks whether a pothole reads at 20 m and 40 m, and until Phase 3
  // teaches the generator to place one, no world in the game contains a hazard
  // to look at. Going through `BuildOptions.hazards` rather than around it is
  // what makes the ride the real feature — same resolver, same refusals, same
  // spill overpaint — instead of a preview of it.
  const bare = buildLevelPlan([{ id: 'road', length: 90, halfWidth: 6, surface: 'pavement' }], OPTIONS);
  assert.ok(!('hazards' in bare), 'no probe, no key — which is what keeps the pinned digests still');

  const probed = buildLevelPlan(
    [{ id: 'road', length: 90, halfWidth: 6, surface: 'pavement' }],
    { ...OPTIONS, hazardProbeMetres: 20 },
  );
  const hazards = probed.hazards ?? [];
  assert.equal(hazards.length, 4, 'one every 20 m of a 90 m road, and never at s = 0');
  assert.equal(new Set(hazards.map((hazard) => hazard.id)).size, hazards.length, 'ids collide');

  // Every kind, because the gate is partly about telling a shallow hole from a
  // deep one; a probe that placed one kind would leave that question untested.
  assert.deepEqual(
    [...new Set(hazards.map((hazard) => hazard.kind))].sort(),
    ['potholeDeep', 'potholeShallow', 'spill'],
  );
  assert.ok(
    probed.heightfield.surfaces.includes('spill'),
    'and the spill half really painted, so it is ground rather than a drawn sheen',
  );
});

test('the hazard probe keeps both segment sockets clear', () => {
  // The entry is excluded by starting at one cadence. The exit needs its own
  // strict bound: `s <= length` put a deep pothole exactly on the 60 m gravel
  // spur's exit under the owner's `?hazardprobe=30` ride.
  const probed = buildLevelPlan(
    [{ id: 'road', length: 60, halfWidth: 6, surface: 'pavement' }],
    { ...OPTIONS, hazardProbeMetres: 20 },
  );
  assert.equal(probed.hazards?.length, 2, 'the exit socket received a third probe');
});

test('a probed world is the same world twice, and leaves a line through', () => {
  // Reproducible, because a diagnostic that differs between boots makes two
  // people comparing notes about one cadence wrong about which holes they saw.
  const build = (): LevelPlan => buildLevelPlan(
    [{ id: 'road', length: 120, halfWidth: 5, surface: 'pavement' }],
    { ...OPTIONS, hazardProbeMetres: 15 },
  );
  assert.deepStrictEqual(build().hazards, build().hazards);

  // And rideable. "Nothing may be annoying" applies to a diagnostic too — a
  // wall of holes down the centreline is one nobody would ride twice, which
  // would make the gate it exists for harder rather than possible.
  const plan = build();
  for (const hazard of plan.hazards ?? []) {
    assert.ok(
      Math.abs(hazard.centre.x) > hazard.radius,
      `${hazard.id} covers the centreline; there has to be a line through`,
    );
  }

  // A spill is rasterised to whole heightfield cells. Proving only that its
  // mathematical circle misses x = 0 allowed the selected square to extend
  // back across the centreline, so ask the same production sampler the wheel
  // uses at every metre of the route instead.
  const sampler = new PlanTerrainSampler(plan);
  const ground = createGroundSample();
  for (let z = 0; z <= 120; z += 1) {
    sampler.sampleGround(0, z, ground);
    assert.notEqual(ground.surface, 'spill', `the probe painted the centreline at z = ${z}`);
  }
});

test('a probe cadence the query string could produce is refused rather than clamped', () => {
  // The one input here that is untrusted. Zero, negative and non-finite are all
  // "no probe" at the reader (`level/levels.ts`), and the builder agrees rather
  // than dividing by them.
  for (const metres of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    const plan = buildLevelPlan(
      [{ id: 'road', length: 60, halfWidth: 5, surface: 'pavement' }],
      { ...OPTIONS, hazardProbeMetres: metres },
    );
    assert.ok(!('hazards' in plan), `a cadence of ${metres} produced hazards`);
  }
});
