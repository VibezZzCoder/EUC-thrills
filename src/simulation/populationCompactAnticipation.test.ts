/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** UNEXECUTED source proposal: focused behavior controls, not Game/device QA. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose } from './EucController.ts';
import { PopulationSimulation, physicalPopulationHull, type PopulationFootprint } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { PopulationCompactAnticipationHistory, compactAnticipationBlocker, type CompactAnticipationOwner } from './populationCompactAnticipation.ts';
import { routeAnticipation, routeBrakingSpeedCap } from './populationRouteAnticipation.ts';
import { incomingFlat, incomingPlan, incomingCoarse, incomingPose, incomingSignedGap, warmIncoming, INCOMING_DT as DT } from './populationIncomingActorYieldFixture.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION as R, RIDER_OCCUPANCY } from '../data/tuning.ts';
import type { PopulationPath } from '../level/populationPlan.ts';

const fixtureBody = (x: number, z: number): PopulationFootprint => ({ x, z, headingY: 0,
  halfWidthMetres: .2, halfLengthMetres: .2, minY: 0, maxY: 1, velocityX: 0, velocityZ: 0 });
const bodyBounds = (p: PopulationFootprint) => {
  const c = Math.abs(Math.cos(p.headingY)), s = Math.abs(Math.sin(p.headingY));
  return { maxX: p.x + c * p.halfWidthMetres + s * p.halfLengthMetres,
    maxZ: p.z + s * p.halfWidthMetres + c * p.halfLengthMetres };
};
const nativeOwner = (value: EucController, certificates: PopulationPhysicalCertificates, id = 'human-0'): CompactAnticipationOwner => {
  const pose = incomingPose(value);
  return { id, controller: value, serial: value.discontinuitySerial, complete: true,
    components: certificates.components(id, pose, pose, 0, 'placement').map(part => ({ componentId: part.componentId, footprint: part.at(0) })) };
};
function sourcePath(points: readonly (readonly [number, number])[], closed = false): PopulationPath {
  let length = 0;
  return { id: 'source-spans', role: 'traffic', district: 'commercial', closed, serviceShuttle: !closed,
    points: points.map(([x, z], index) => {
      if (index) length += Math.hypot(x - points[index - 1][0], z - points[index - 1][1]);
      const next = points[index + 1] ?? (closed ? points[1] : points[index - 1]);
      const headingY = index + 1 < points.length ? Math.atan2(next[0] - x, next[1] - z)
        : closed ? Math.atan2(points[1][0] - points[0][0], points[1][1] - points[0][1])
        : Math.atan2(x - next[0], z - next[1]);
      return { x, y: 0, z, headingY, distanceMetres: length, surface: 'pavement', sourceSegmentId: 'explicit-source' };
    }), get lengthMetres() { return length; }, clearanceRadiusMetres: 5, connections: [] };
}

test('actual native wheel/human values detach before slot reuse; observation needs completed epoch, controller and serial', () => {
  const native = new EucController(incomingFlat), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose());
  native.reset(undefined, 4);
  const history = new PopulationCompactAnticipationHistory(), first = history.begin([nativeOwner(native, certificates)], 0, DT);
  assert.equal(first.components.length, 2); assert.ok(first.components.every(part => !part.observationValid));
  const frozen = structuredClone(first);
  native.step(DT, NEUTRAL_ACTIONS); const next = nativeOwner(native, certificates);
  assert.deepEqual(first, frozen, 'later loads of the same placement slots cannot move detached input');
  history.seal([next], 1); const observed = history.begin([next], 1, DT);
  assert.ok(observed.components.every(part => part.observationValid));
  assert.ok(observed.components.some(part => part.velocityZ > 0), 'real native displacement supplies observed component velocity');
  history.seal([next], 2);
  native.reset({ position: { x: 30, y: 0, z: 30 }, headingY: 1 });
  const placed = history.begin([nativeOwner(native, certificates)], 2, DT);
  assert.ok(placed.components.every(part => !part.observationValid && part.velocityX === 0 && part.velocityZ === 0));
  assert.ok(placed.components.every(part => part.footprint.x > 20), 'reset immediately supplies current actual occupancy');
  history.seal([nativeOwner(native, certificates)], 3);
  const replacement = new EucController(incomingFlat);
  const replaced = history.begin([nativeOwner(replacement, certificates)], 3, DT);
  assert.ok(replaced.components.every(part => !part.observationValid), 'same owner ID never validates a different native controller');
  history.seal([nativeOwner(replacement, certificates)], 4);
  assert.ok(history.begin([nativeOwner(replacement, certificates)], 8, DT).components.every(part => !part.observationValid));
  history.clear(); assert.equal(history.residentOwnerCount, 0); assert.equal(history.pending, false);
  history.begin([], 0, DT); history.seal([], 1); assert.equal(history.residentOwnerCount, 0);
});

test('actual active native rag footprint keeps height and real parts; incomplete/overflow census requests refusal', () => {
  const native = new EucController(incomingFlat), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose());
  native.reset(undefined, 12); native.hardKnock(3, 0);
  for (let tick = 0; tick < 72; tick++) native.step(DT, NEUTRAL_ACTIONS);
  const owner = nativeOwner(native, certificates), history = new PopulationCompactAnticipationHistory();
  const actual = history.begin([owner], 0, DT);
  assert.ok(incomingPose(native).ragdollBlend > 0); assert.deepEqual(actual.components.map(part => part.componentId).sort(), ['human', 'wheel']);
  for (const part of actual.components) {
    const source = owner.components.find(value => value.componentId === part.componentId)!;
    assert.equal(part.footprint.minY, source.footprint.minY); assert.equal(part.footprint.maxY, source.footprint.maxY);
    assert.equal(part.footprint.velocityX, 0); assert.equal(part.footprint.velocityZ, 0);
    assert.ok(compactAnticipationBlocker(part, R.vehicleLookAheadSeconds).pad >= R.compactAnticipationUncertaintyMetres);
  }
  assert.deepEqual(history.begin([{ ...owner, complete: false, components: [] }], 0, DT).incompleteOwnerIds, ['human-0']);
  const many = Array.from({ length: R.compactAnticipationMaximumComponents / 2 + 1 }, (_, index) => ({ ...owner, id: `owner-${index}` }));
  const overflow = history.begin(many, 0, DT); assert.equal(overflow.components.length, 0); assert.equal(overflow.incompleteOwnerIds.length, many.length);
  assert.equal(history.residentOwnerCount, 0);
});

test('actual source bend blocked while global endpoint chord is clear; clear real arc does not inherit chord blockage', () => {
  const path = sourcePath([[0, 0], [0, 20], [20, 20]]), body = fixtureBody(0, 10);
  const scan = routeAnticipation({ path, distanceMetres: 0, direction: 1, travelMetres: 40,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'actual-arc', from: body, to: body }] });
  assert.equal(scan.blockedBy, 'actual-arc'); assert.ok(scan.availableTravelMetres < 10);
  const chord = sourcePath([[0, 0], [20, 20]]);
  assert.equal(routeAnticipation({ path: chord, distanceMetres: 0, direction: 1, travelMetres: chord.lengthMetres,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'actual-arc', from: body, to: body }] }).blockedBy, null,
    'known-bad endpoint-only shortcut misses the obstructed genuine source leg');
  const diagonal = fixtureBody(10, 10);
  assert.equal(routeAnticipation({ path, distanceMetres: 0, direction: 1, travelMetres: 40,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'chord-only', from: diagonal, to: diagonal }] }).blockedBy, null);
  assert.equal(routeAnticipation({ path: chord, distanceMetres: 0, direction: 1, travelMetres: chord.lengthMetres,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'chord-only', from: diagonal, to: diagonal }] }).blockedBy, 'chord-only');
});

test('real loop wrap and reverse service spans are scanned; dense source work never becomes truncated clear', () => {
  const loop = sourcePath([[0, 0], [0, 20], [20, 20], [20, 0], [0, 0]], true), body = fixtureBody(0, 4);
  const wrapped = routeAnticipation({ path: loop, distanceMetres: 78, direction: 1, travelMetres: 10,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'across-seam', from: body, to: body }] });
  assert.equal(wrapped.blockedBy, 'across-seam'); assert.ok(wrapped.availableTravelMetres > 2 && wrapped.availableTravelMetres < 6);
  const service = sourcePath([[0, 0], [0, 20]]);
  assert.equal(routeAnticipation({ path: service, distanceMetres: 10, direction: -1, travelMetres: 8,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'backing', from: body, to: body }] }).blockedBy, 'backing');
  const dense = sourcePath(Array.from({ length: R.compactAnticipationMaximumSpans + 5 }, (_, index) => [0, index * .01] as const));
  const far = fixtureBody(500, 500), overflow = routeAnticipation({ path: dense, distanceMetres: 0, direction: 1,
    travelMetres: dense.lengthMetres, fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: [{ id: 'far', from: far, to: far }] });
  assert.equal(overflow.overflow, true); assert.equal(overflow.availableTravelMetres, 0);
  assert.equal(overflow.spanVisits, R.compactAnticipationMaximumSpans); assert.ok(overflow.blockerTests <= R.compactAnticipationMaximumBlockerTests);
  const tooMany = Array.from({ length: R.compactAnticipationMaximumBlockerTests + 1 }, (_, index) => ({ id: String(index), from: far, to: far }));
  assert.equal(routeAnticipation({ path: service, distanceMetres: 0, direction: 1, travelMetres: 10,
    fullHullAxisBoundMetres: 1, gapMetres: .1, blockers: tooMany }).overflow, true);
});

test('source yaw interior maximum covers recombined prism corners that endpoint yaw bounds miss', () => {
  const source = sourcePath([[0, 0], [0, .01]]);
  const path: PopulationPath = { ...source, points: source.points.map((point, index) => ({ ...point, headingY: index ? 1.4 : .2 })) };
  const body = fixtureBody(1.43, 0), endpointOnly = Math.max(Math.abs(Math.cos(.2)) + Math.abs(Math.sin(.2)),
    Math.abs(Math.cos(1.4)) + Math.abs(Math.sin(1.4)));
  assert.ok(body.x - body.halfWidthMetres > endpointOnly, 'known-bad endpoint support maximum would call this clear');
  assert.ok(body.x - body.halfWidthMetres < Math.SQRT2, 'the actual source yaw passes the interior prism maximum');
  assert.equal(routeAnticipation({ path, distanceMetres: 0, direction: 1, travelMetres: .01,
    fullHullAxisBoundMetres: 1, gapMetres: 0, blockers: [{ id: 'interior-yaw', from: body, to: body }] }).blockedBy, 'interior-yaw');
});

test('full car radius encloses actual tilted/roof-shifted native hull; braking cap includes original dt', () => {
  const hull = incomingPlan(0, 0, 'trafficVehicle').actors[0].hull, radius = Math.SQRT2 * Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres);
  let bareCornerRadiusInsufficient = false;
  for (const x of [-3, -.3, 0, .3, 3]) for (const z of [-3, -.3, 0, .3, 3]) {
    const body = physicalPopulationHull(0, 0, 0, .7, x, 1, z, hull), c = Math.cos(body.headingY), s = Math.sin(body.headingY);
    for (const localX of [-body.halfWidthMetres, body.halfWidthMetres])
      for (const localZ of [-body.halfLengthMetres, body.halfLengthMetres]) {
        const reach = Math.hypot(body.x + c * localX + s * localZ, body.z - s * localX + c * localZ);
        assert.ok(reach <= radius + 1e-12, 'actual recombined native heading-prism corners remain inside the grade-independent bound');
        bareCornerRadiusInsufficient ||= reach > radius / Math.SQRT2 + 1e-9;
      }
  }
  assert.equal(bareCornerRadiusInsufficient, true, 'known-bad bare model corner radius fails the actual recombined native prism');
  const travel = 6, cap = routeBrakingSpeedCap(travel, DT);
  assert.ok(Math.abs(cap * cap / (2 * R.vehicleBrakingMetresPerSecondSquared) + cap * DT - travel) < 1e-12);
  assert.equal(routeBrakingSpeedCap(0, DT), 0);
});

test('captured genuine rag human can obstruct a car lane missed by the old root prism; brake and restart keep real path/clock/travel', () => {
  const native = new EucController(incomingFlat), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose());
  native.reset({ position: { x: 0, y: 0, z: 0 }, headingY: Math.PI / 2 }, 12); native.hardKnock(0, 3);
  let owner = nativeOwner(native, certificates), coarse = incomingCoarse(incomingPose(native));
  let human = owner.components.find(part => part.componentId === 'human')!.footprint;
  // Search only a bounded sequence of actual native steps, never written poses.
  for (let tick = 0; tick < 128 && bodyBounds(human).maxZ <= bodyBounds(coarse).maxZ + 2 * R.vehicleWaitingGapMetres + .02; tick++) {
    native.step(DT, NEUTRAL_ACTIONS); owner = nativeOwner(native, certificates);
    coarse = incomingCoarse(incomingPose(native)); human = owner.components.find(part => part.componentId === 'human')!.footprint;
  }
  assert.ok(bodyBounds(human).maxZ > bodyBounds(coarse).maxZ + 2 * R.vehicleWaitingGapMetres + .02, 'fixture must expose genuine native human occupancy outside the old prism');
  const measured = new PopulationSimulation(incomingPlan(100, 0, 'trafficVehicle'), incomingFlat); for (let pass = 0; pass < 3; pass++) warmIncoming(measured);
  const initial = measured.snapshot().actors[0], laneZ = (bodyBounds(human).maxZ + bodyBounds(coarse).maxZ) / 2 + initial.hull.halfWidthMetres;
  const plan = incomingPlan(bodyBounds(human).maxX + 8 + initial.hull.halfLengthMetres + initial.distanceMetres, laneZ, 'trafficVehicle');
  const old = new PopulationSimulation(plan, incomingFlat), actual = new PopulationSimulation(plan, incomingFlat);
  for (let pass = 0; pass < 3; pass++) { warmIncoming(old); warmIncoming(actual); }
  const history = new PopulationCompactAnticipationHistory(), tick = actual.tickIndex, clock = actual.clockSeconds;
  const people = [{ id: owner.id, kind: 'human' as const, previous: coarse, current: coarse }];
  let oldMinimum = Infinity, newMinimum = Infinity;
  for (let step = 0; step < 300; step++) {
    // This behavior-unit instrument reuses one captured native source pose. It
    // makes no claim about advancing a Game rag trajectory or native recovery.
    old.step(DT, people); old.queryContacts(people);
    actual.step(DT, people, [], history.begin([owner], actual.tickIndex, DT)); actual.queryContacts(people);
    oldMinimum = Math.min(oldMinimum, incomingSignedGap(human, old.snapshot().actors[0].footprint));
    newMinimum = Math.min(newMinimum, incomingSignedGap(human, actual.snapshot().actors[0].footprint));
    assert.ok(incomingSignedGap(coarse, old.snapshot().actors[0].footprint) > 0);
  }
  assert.ok(oldMinimum < 0, 'known-bad coarse-only anticipation physically crosses the captured actual human');
  assert.ok(newMinimum > 0); assert.ok(actual.snapshot().actors[0].speedMetresPerSecond < initial.speedMetresPerSecond);
  assert.equal(actual.tickIndex, tick + 300); assert.ok(Math.abs(actual.clockSeconds - clock - 300 * DT) < 1e-9);
  const stopped = actual.snapshot().actors[0];
  assert.ok(Math.abs(stopped.distanceMetres - initial.distanceMetres - stopped.wheelTravelMetres + initial.wheelTravelMetres) < 1e-8);
  native.reset({ position: { x: 200, y: 0, z: 200 }, headingY: 0 }); owner = nativeOwner(native, certificates);
  coarse = incomingCoarse(incomingPose(native));
  for (let step = 0; step < 120; step++) {
    const owners = [{ id: owner.id, kind: 'human' as const, previous: coarse, current: coarse, teleported: true }];
    actual.step(DT, owners, [], history.begin([owner], actual.tickIndex, DT)); actual.queryContacts(owners);
  }
  const restarted = actual.snapshot().actors[0]; assert.ok(restarted.speedMetresPerSecond > stopped.speedMetresPerSecond);
  assert.ok(restarted.distanceMetres > stopped.distanceMetres); assert.equal(restarted.direction, 1); assert.equal(restarted.pathId, stopped.pathId);
});

test('far-clear optional input keeps original actor bytes, one clock, and owner input order; omitted native owner refuses', () => {
  const plan = incomingPlan(100, 0, 'trafficVehicle'), old = new PopulationSimulation(plan, incomingFlat), next = new PopulationSimulation(plan, incomingFlat);
  for (let tick = 0; tick < 100; tick++) {
    old.step(DT); next.step(DT, [], [], { components: [], incompleteOwnerIds: [] });
    old.queryContacts([]); next.queryContacts([]); assert.deepEqual(next.snapshot(), old.snapshot());
  }
  const native = new EucController(incomingFlat), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, createPose());
  native.reset({ position: { x: 500, y: 0, z: 500 }, headingY: 0 });
  const second = new EucController(incomingFlat); second.reset({ position: { x: 600, y: 0, z: 600 }, headingY: 0 });
  const owners = [nativeOwner(native, certificates, 'human-0'), nativeOwner(second, certificates, 'cop-0')];
  const historyA = new PopulationCompactAnticipationHistory(), historyB = new PopulationCompactAnticipationHistory();
  assert.deepEqual(historyA.begin(owners, 0, DT), historyB.begin([...owners].reverse(), 0, DT));
  const pose = incomingPose(native), coarse = incomingCoarse(pose);
  assert.throws(() => next.step(DT, [{ id: 'human-0', kind: 'human', previous: coarse, current: coarse }], [], { components: [], incompleteOwnerIds: [] }), /omitted/);
});
