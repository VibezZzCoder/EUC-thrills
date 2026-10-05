/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** UNRUN R21 source proposal. Exact frozen-v1 observer outputs, not performance
 * evidence or a substitute for the native continuous contact controls. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import type { PopulationPath } from '../level/populationPlan.ts';
import { POPULATION as R, GROUND_CERTIFICATE as C } from '../data/tuning.ts';
import { physicalPopulationHull } from '../shared/populationHull.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import type { PopulationFootprint } from './population.ts';
import { routeAnticipation, sourceYawSupport, type RouteAnticipationBlocker } from './populationRouteAnticipation.ts';
import { routeAnticipation as frozenV1 } from './populationRouteAnticipation.v1.test-fixture.ts';

type Input = Parameters<typeof routeAnticipation>[0];
const hull = { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 };
const step = 5.5 / 120;
function flatPlan(): LevelPlan {
  return { id: 'r21-exact-output', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, segments: [], checkpoints: [],
    heightfield: { originX: -25, originZ: -25, columns: 51, rows: 51, spacing: 1,
      heights: Array.from({ length: 51 * 51 }, () => 0),
      surfaces: Array.from({ length: 50 * 50 }, () => 'pavement' as const) } };
}
function pathFrom(points: readonly (readonly [number, number])[], closed = false,
  headings?: readonly number[]): PopulationPath {
  let length = 0;
  const frames = points.map(([x, z], index) => {
    if (index) length += Math.hypot(x - points[index - 1][0], z - points[index - 1][1]);
    const next = points[index + 1] ?? (closed ? points[1] : points[index - 1]);
    const headingY = headings?.[index] ?? (index + 1 < points.length ? Math.atan2(next[0] - x, next[1] - z)
      : closed ? Math.atan2(points[1][0] - points[0][0], points[1][1] - points[0][1])
        : Math.atan2(x - next[0], z - next[1]));
    return { x, y: 0, z, headingY, distanceMetres: length, surface: 'pavement' as const, sourceSegmentId: 'real-source' };
  });
  return { id: 'r21-original-spans', role: closed ? 'traffic' : 'service', district: 'industrial',
    closed, serviceShuttle: !closed, lengthMetres: length, clearanceRadiusMetres: 5, connections: [], points: frames };
}
const straight = (yaw = 0) => pathFrom([[0, 0], [Math.sin(yaw) * 12, Math.cos(yaw) * 12]], false, [yaw, yaw]);
const body = (x: number, z: number, headingY = 0, width = .42, length = .42): PopulationFootprint =>
  ({ x, z, headingY, halfWidthMetres: width, halfLengthMetres: length,
    minY: 0, maxY: 1.9, velocityX: 0, velocityZ: 0 });
const blocker = (id: string, from: PopulationFootprint, to = from, pad = .25): RouteAnticipationBlocker => ({ id, from, to, pad });
function input(path: PopulationPath, blockers: readonly RouteAnticipationBlocker[],
  station = 0, direction: 1 | -1 = 1, travel = path.lengthMetres,
  sampler = new PlanTerrainSampler(flatPlan())): Input {
  let span = 0;
  while (span + 1 < path.points.length - 1 && path.points[span + 1].distanceMetres <= station) span++;
  const a = path.points[span], b = path.points[span + 1], t = (station - a.distanceMetres) / (b.distanceMetres - a.distanceMetres);
  const turn = Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY));
  const yaw = a.headingY + turn * t, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
  return { path, distanceMetres: station, direction, travelMetres: travel,
    fullHullAxisBoundMetres: Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres),
    gapMetres: R.vehicleWaitingGapMetres, blockers,
    flatSupport: { sampler, hull, currentHeadingY: yaw, maximumNativeStepTravelMetres: step,
      currentFootprint: physicalPopulationHull(x, 0, z, yaw, 0, 1, 0, hull) } };
}
function equivalent(value: Input) {
  const before = JSON.stringify({ path: value.path, blockers: value.blockers, current: value.flatSupport?.currentFootprint });
  const expected = frozenV1(value), actual = routeAnticipation(value);
  assert.deepEqual(actual, expected, 'all distances, blocker IDs, traversal/certificate counts and reasons remain exact');
  assert.equal(JSON.stringify({ path: value.path, blockers: value.blockers, current: value.flatSupport?.currentFootprint }), before,
    'neither observer mutates its source/actor input');
  return actual;
}

test('exact frozen-v1 results across rotating blocker and native yaw interior extrema', () => {
  // Different local dimensions make endpoint yaw pruning demonstrably unsafe.
  const turnBody = body(3.2, 5, 0, .2, 2), turned = { ...turnBody, headingY: Math.PI / 2 };
  assert.ok(sourceYawSupport(.2, 2, 0, Math.PI / 2) > 2,
    'known-bad endpoint-only support omits the genuine interior maximum');
  const peak = Math.atan2(hull.halfLengthMetres + R.vehicleWaitingGapMetres,
    hull.halfWidthMetres + R.vehicleWaitingGapMetres);
  const rotations = [0, .2, Math.PI / 4, peak, Math.PI / 2, Math.PI - .01, -Math.PI + .01];
  for (const first of rotations) for (const last of rotations) {
    const path = pathFrom([[0, 0], [0, 12]], false, [first, last]);
    const rows = [blocker('rotating', { ...turnBody, headingY: first }, { ...turned, headingY: last }),
      blocker('far', body(16, 16)), blocker('near', body(1.6, 8, last, .2, .9))];
    const result = equivalent(input(path, rows));
    assert.equal(result.flatSpans, 1); assert.equal(result.flatCertificateReason, 'entire-native-source-context-flat');
    assert.deepEqual(equivalent(input(path, [...rows].reverse())), result, 'native blocker ordering stays ID deterministic');
  }
});

test('four world/road axes preserve narrow sidewalk clearance, exact overlap and ID ties', () => {
  for (const yaw of [0, .37, Math.PI / 4, Math.PI / 2, -Math.PI / 3]) {
    const path = straight(yaw), along = 5;
    const sidewalk = body(Math.sin(yaw) * along + Math.cos(yaw) * 3,
      Math.cos(yaw) * along - Math.sin(yaw) * 3, yaw);
    assert.equal(equivalent(input(path, [blocker('sidewalk', sidewalk)])).blockedBy, null);
    const origin = body(0, 0, yaw);
    const blocked = equivalent(input(path, [blocker('z-owner', origin), blocker('a-owner', origin)]));
    assert.equal(blocked.blockedBy, 'a-owner'); assert.equal(blocked.availableTravelMetres, 0);
    assert.equal(blocked.blockerTests, 2, 'near early-axis entry never omits a later blocker');
  }
});

test('genuine bent source, loop seam and reverse retain full original traversal', () => {
  const bent = pathFrom([[0, 0], [0, 8], [8, 8]]), arc = body(0, 5);
  assert.equal(equivalent(input(bent, [blocker('real-arc', arc)])).blockedBy, 'real-arc');
  assert.equal(equivalent(input(pathFrom([[0, 0], [8, 8]]), [blocker('real-arc', arc)])).blockedBy, null,
    'known-bad global chord would clear the actual bend obstruction');
  const loop = pathFrom([[0, 0], [0, 8], [8, 8], [8, 0], [0, 0]], true);
  const wrapped = equivalent(input(loop, [blocker('after-seam', body(0, 6))], 31.5, 1, 4));
  assert.equal(wrapped.blockedBy, 'after-seam'); assert.ok(wrapped.spanVisits >= 2);
  const reverse = equivalent(input(straight(), [blocker('service-return', body(0, 3))], 10, -1, 8));
  assert.equal(reverse.blockedBy, 'service-return'); assert.equal(reverse.flatSpans, 1);
});

test('actual off-source/tilted current hull and missing terrain capability keep exact unknown fallback', () => {
  const path = straight(), rows = [blocker('adjacent', body(3, 5)), blocker('far', body(15, 15))], base = input(path, rows);
  for (const currentFootprint of [physicalPopulationHull(.5, 0, 0, 0, 0, 1, 0, hull),
    physicalPopulationHull(0, 0, 0, 0, -.1, 1, 0, hull)]) {
    const result = equivalent({ ...base, flatSupport: { ...base.flatSupport!, currentFootprint } });
    assert.equal(result.flatSpans, 0); assert.equal(result.flatCertificateReason, 'actual-native-origin-not-source-flat');
    assert.equal(result.blockedBy, 'adjacent');
  }
  const sampler = new PlanTerrainSampler(flatPlan());
  const missing = equivalent({ ...base, flatSupport: { ...base.flatSupport!,
    sampler: { sampleGround: sampler.sampleGround.bind(sampler), raycast: () => null } } });
  assert.equal(missing.flatCertificateReason, 'missing-source-capability'); assert.equal(missing.flatSpans, 0);
  assert.equal(missing.blockedBy, 'adjacent');
  const old = equivalent({ ...base, flatSupport: undefined });
  assert.equal(old.flatCertificateReason, 'not-requested'); assert.equal(old.flatSpans, 0);
});

test('later nonflat support invalidates the whole forecast; chord reserve remains exact', () => {
  const plan = flatPlan(); plan.heightfield.heights = plan.heightfield.heights.map((value, index) => index === 36 * 51 + 25 ? .5 : value);
  const path = pathFrom([[0, 0], [0, 6], [0, 12]]);
  const result = equivalent(input(path, [blocker('near-sidewalk', body(3, 2))], 0, 1, 12, new PlanTerrainSampler(plan)));
  assert.equal(result.flatSpans, 0); assert.equal(result.flatCertificateReason, 'nonflat-source-triangle');
  assert.equal(result.blockedBy, 'near-sidewalk', 'no per-first-span-only narrowing');
  const nextYaw = pathFrom([[0, 0], [0, 1], [1, 1]], false, [0, .1, Math.PI / 2]), base = input(nextYaw, [blocker('far', body(15, 15))]);
  const crossing = equivalent({ ...base, flatSupport: { ...base.flatSupport!, maximumNativeStepTravelMetres: 1.5 } });
  assert.equal(crossing.flatSpans, 2); assert.equal(crossing.nativeChordReserveMetres, .75);
});

test('source context, blocker-test and field work caps refuse identical whole inputs', () => {
  const far = blocker('far', body(500, 500));
  const dense = pathFrom(Array.from({ length: R.compactAnticipationMaximumSpans + 5 }, (_, index) => [0, index * .01] as const));
  const capped = equivalent(input(dense, [far]));
  assert.equal(capped.overflow, true); assert.equal(capped.availableTravelMetres, 0);
  assert.equal(capped.flatCertificateReason, 'native-source-context-cap');
  const many = Array.from({ length: R.compactAnticipationMaximumBlockerTests + 1 }, (_, index) => ({ ...far, id: `far-${index}` }));
  const early = equivalent(input(straight(), many));
  assert.equal(early.blockedBy, 'work-cap'); assert.equal(early.spanVisits, 0); assert.equal(early.blockerTests, 0);
  const three = pathFrom([[0, 0], [0, 4], [0, 8], [0, 12]]);
  const during = equivalent(input(three, many.slice(0, R.compactAnticipationMaximumBlockerTests / 2)));
  assert.equal(during.overflow, true); assert.equal(during.blockerTests, R.compactAnticipationMaximumBlockerTests);
  assert.equal(during.availableTravelMetres, 0);
  const large = pathFrom([[-15, -15], [15, 15]]);
  const field = equivalent(input(large, [blocker('side', body(0, 3))]));
  assert.equal(field.flatSpans, 0); assert.ok(field.certificateFieldCells! <= C.maximumFieldCells);
  assert.equal(field.flatCertificateReason, 'field-cell-cap');
});

test('empty/zero travel and malformed input preserve result or RangeError behavior', () => {
  assert.equal(equivalent(input(straight(), [])).availableTravelMetres, 12);
  assert.equal(equivalent(input(straight(), [blocker('origin', body(0, 0))], 0, 1, 0)).availableTravelMetres, 0);
  const base = input(straight(), [blocker('far', body(20, 20))]);
  for (const value of [{ ...base, distanceMetres: NaN }, { ...base, travelMetres: -1 },
    { ...base, blockers: [blocker('bad-pad', body(0, 0), body(0, 0), -1)] },
    { ...base, flatSupport: { ...base.flatSupport!, currentHeadingY: NaN } }]) {
    assert.throws(() => frozenV1(value), RangeError); assert.throws(() => routeAnticipation(value), RangeError);
  }
});

test('a blocker\'s flat terms are formed once per scan, not once per certified span (PERF-R2-2)', () => {
  // Every Math.atan2 the scan makes: per span (source yaw, axis phases, supports)
  // and per blocker (its turn and yaw extents). Extra blockers must cost the
  // same on a 4-span and a 16-span straight road; results stay exact (above).
  const atan2 = Math.atan2;
  const count = (spans: number, blockers: number) => {
    const path = pathFrom(Array.from({ length: spans + 1 }, (_, index) => [0, index - 10] as const));
    const rows = Array.from({ length: blockers }, (_, index) => blocker(`side-${index}`, body(8, index * 3 - 9, .3 * index)));
    let calls = 0;
    Math.atan2 = (y, x) => { calls += 1; return atan2(y, x); };
    let result;
    try { result = routeAnticipation(input(path, rows)); } finally { Math.atan2 = atan2; }
    assert.equal(result.flatSpans, spans, result.flatCertificateReason); assert.equal(result.blockedBy, null);
    return calls;
  };
  const extraShort = count(4, 6) - count(4, 1), extraLong = count(16, 6) - count(16, 1);
  assert.ok(extraShort > 0);
  assert.equal(extraLong, extraShort, 'five more blockers add the same work however many spans the scan certifies');
});
