/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { PopulationSimulation, type PopulationFootprint } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { commitPopulationPhysicalTransaction, type PopulationPreparedPhysicalSeat } from './populationPhysicalTransaction.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from '../simulation/world.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const world: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null };
const poseOf = (controller: EucController) => { const pose = createPose(); controller.writePose(pose); return pose; };
const body = (pose: ReturnType<typeof createPose>): PopulationFootprint => ({ x: pose.x, z: pose.z, headingY: pose.headingY,
  halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
  minY: pose.y, maxY: pose.y + POPULATION_OCCUPANT.heightMetres, velocityX: Math.sin(pose.headingY) * pose.speed, velocityZ: Math.cos(pose.headingY) * pose.speed });
function plan(z = 1000): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'physical-test', installedWorldId: 'physical-test/living-r1', contentDigest: 'physical-test', anchors: [],
    paths: [{ id: 'walk', role: 'pedestrian', district: 'park', points: [z - 15, z, z + 15].map((value, index) => ({ x: 0, y: 0, z: value, headingY: 0, distanceMetres: index * 15, surface: 'pavement', sourceSegmentId: 'test' })), lengthMetres: 30, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'npc', kind: 'walker', pathId: 'walk', initialDistanceMetres: 15, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: .2, appearanceIndex: 0, hull: { halfWidthMetres: .42, halfLengthMetres: .42, heightMetres: 1.9 } }],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
const prepare = (id: string, controller: EucController, dt: number, port = world, actions = NEUTRAL_ACTIONS): PopulationPreparedPhysicalSeat => {
  const token = controller.prepareStep(dt, actions), pose = createPose(); controller.writePreparedPose(token, pose);
  return { id, kind: 'human', controller, token, pose, world: port };
};
test('the complete clear transaction matches native evolution and coarse exclusion binds no slots', () => {
  const direct = new EucController(flat, { dynamicWorld: world }), controller = new EucController(flat, { dynamicWorld: world });
  for (const value of [direct, controller]) value.reset(undefined, 12);
  const beforePose = poseOf(controller), before = new Map([['owner', { pose: beforePose, serial: controller.discontinuitySerial }]]);
  const actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: .6, crouch: true };
  const population = new PopulationSimulation(plan(), flat); population.step(DT, [{ id: 'owner', kind: 'human', previous: body(beforePose), current: body(beforePose) }]);
  const seat = prepare('owner', controller, DT, world, actions), certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, beforePose);
  direct.step(DT, actions);
  const result = commitPopulationPhysicalTransaction({ population, certificates, seats: [seat], preparedSeats: [seat], before, dt: DT, reservations: [], bodyFromPose: body });
  assert.deepEqual(controller.snapshot(), direct.snapshot()); assert.deepEqual(poseOf(controller), poseOf(direct));
  assert.deepEqual(result.contacts, []); assert.deepEqual(result.resolution.refusedOwnerIds, []); assert.equal(certificates.allocatedSlotCount, 0);
  assert.equal(population.clockSeconds, DT); assert.throws(() => population.actorMotions(), /committed/);
});
test('an actual native moving human contact holds the whole controller while the NPC epoch still advances', () => {
  const controller = new EucController(flat, { dynamicWorld: world }); controller.reset(undefined, 12);
  const beforePose = poseOf(controller), beforeState = controller.snapshot(), dt = .05, seat = prepare('owner', controller, dt);
  controller.resolvePreparedStep(seat.token, world); controller.writePreparedPose(seat.token, seat.pose);
  const first = buildRiderOccupancyEnvelope(beforePose, RIDER_CONTACT).human, last = buildRiderOccupancyEnvelope(seat.pose, RIDER_CONTACT).human;
  const front = (p: typeof first) => p.z + Math.abs(Math.sin(p.headingY)) * p.halfWidth + Math.abs(Math.cos(p.headingY)) * p.halfLength;
  const travel = front(last) - front(first); assert.ok(travel > .3, 'fixture needs real native forward protrusion');
  const population = new PopulationSimulation(plan(front(first) + .42 + travel / 2), flat);
  population.step(dt, [{ id: 'owner', kind: 'human', previous: body(beforePose), current: body(beforePose) }]);
  const certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, beforePose);
  const held = certificates.components('owner', beforePose, beforePose, 0, 'held');
  assert.ok(held.every(component => population.recoveryClearance(component.at(0), [], [], 0).clear), 'actual start shapes must be separated');
  assert.ok(certificates.components('owner', seat.pose, seat.pose, 0, 'placement').some(component => !population.recoveryClearance(component.at(0), [], [], 0).clear), 'actual complete candidate must protrude into the NPC');
  const result = commitPopulationPhysicalTransaction({ population, certificates, seats: [seat], preparedSeats: [seat], before: new Map([['owner', { pose: beforePose, serial: controller.discontinuitySerial }]]), dt, reservations: [], bodyFromPose: body });
  assert.deepEqual(result.resolution.refusedOwnerIds, ['owner']); assert.equal(seat.token.held, true);
  assert.deepEqual(poseOf(controller), beforePose); assert.deepEqual(controller.snapshot(), beforeState);
  assert.equal(controller.obstacleImpact, 0); assert.equal(controller.tookOff, false); assert.equal(population.clockSeconds, dt);
  assert.equal(result.resolution.ownerFractions.owner, 0); assert.ok(result.resolution.passes <= 2);
});
test('every controller and actor commit precedes a successful recovery placement callback', () => {
  const recovery = new EucController(flat, { dynamicWorld: world, tuning: { crashRecoverEarliestSeconds: .01, crashRecoverAutoSeconds: .02 } });
  const other = new EucController(flat, { dynamicWorld: world, spawn: { position: { x: 10, y: 0, z: 0 }, headingY: 0 } }); other.reset(undefined, 8);
  assert.equal(recovery.hardKnock(8, 0), true);
  const before = new Map([['recovery', { pose: poseOf(recovery), serial: recovery.discontinuitySerial }], ['other', { pose: poseOf(other), serial: other.discontinuitySerial }]]);
  const population = new PopulationSimulation(plan(), flat), dt = .03; population.step(dt, [...before].map(([id, value]) => ({ id, kind: 'human', previous: body(value.pose), current: body(value.pose) })));
  const notes: string[] = []; let seats: PopulationPreparedPhysicalSeat[] = [];
  const port: EucDynamicWorld = { ...world, canPlace: () => true, didPlace: request => {
    notes.push(request.reason); for (const seat of seats) assert.deepEqual(poseOf(seat.controller as EucController), seat.pose, 'all private controllers must be sealed first');
    assert.throws(() => population.actorMotions(), /committed/, 'the actor epoch must also be sealed before a callback');
  } };
  recovery.setDynamicWorld(port);
  seats = [prepare('recovery', recovery, dt, port), prepare('other', other, dt)];
  assert.ok(seats[0].token.placementRequests.some(request => request.reason === 'recover'), 'fixture must actually recover');
  const result = commitPopulationPhysicalTransaction({ population, certificates: new PopulationPhysicalCertificates(RIDER_CONTACT, before.get('recovery')!.pose), seats, preparedSeats: seats, before, dt, reservations: [], bodyFromPose: body });
  assert.deepEqual(notes, ['recover']); assert.deepEqual(result.resolution.refusedOwnerIds, []);
  assert.equal(recovery.discontinuitySerial, before.get('recovery')!.serial + 1); assert.equal(recovery.crashed, false);
});
test('missing, stale, duplicated or mismatched prepared starts reject before any private replay or publication', () => {
  const controller = new EucController(flat, { dynamicWorld: world }), other = new EucController(flat, { dynamicWorld: world });
  const beforePose = poseOf(controller), seat = prepare('owner', controller, DT), population = new PopulationSimulation(plan(), flat);
  population.step(DT, [{ id: 'owner', kind: 'human', previous: body(beforePose), current: body(beforePose) }]);
  const before = new Map([['owner', { pose: beforePose, serial: controller.discontinuitySerial }]]);
  const input = { population, certificates: new PopulationPhysicalCertificates(RIDER_CONTACT, beforePose), seats: [seat], preparedSeats: [seat], before, dt: DT, reservations: [], bodyFromPose: body };
  const snapshot = controller.snapshot();
  assert.throws(() => commitPopulationPhysicalTransaction({ ...input, before: new Map() }), /start snapshot/);
  assert.throws(() => commitPopulationPhysicalTransaction({ ...input, before: new Map([['owner', { pose: beforePose, serial: controller.discontinuitySerial + 1 }]]) }), /start snapshot/);
  assert.throws(() => commitPopulationPhysicalTransaction({ ...input, preparedSeats: [seat, seat] }), /distinct prepared/);
  assert.throws(() => commitPopulationPhysicalTransaction({ ...input, seats: [{ ...seat, controller: other }] }), /visible physical/);
  assert.throws(() => commitPopulationPhysicalTransaction({ ...input, seats: [{ ...seat, kind: 'cop' }] }), /visible physical/);
  assert.equal(seat.token.ready, false); assert.equal(seat.token.held, false);
  assert.deepEqual(controller.snapshot(), snapshot); assert.deepEqual(poseOf(controller), beforePose);
  assert.doesNotThrow(() => population.actorMotions(), 'malformed transaction must not seal the actor epoch');
});
