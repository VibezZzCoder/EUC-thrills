/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld, type EucPhysicalReactionRequest } from './EucController.ts';
import { EucController as NativeController } from './EucController.ts';
import { PopulationSimulation } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { ContactPair } from '../simulation/contact.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { RIDER_CONTACT } from '../data/tuning.ts';
import { rideStyleFor } from '../data/riders.ts';
import { buildRiderOccupancyEnvelope, type RiderOccupancyPose } from '../shared/riderOccupancy.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const slope: TerrainSampler = { sampleGround(x, _z, out) { out.height = x * .03; out.normal.x = -.03 / Math.hypot(1, .03); out.normal.y = 1 / Math.hypot(1, .03); out.normal.z = 0; out.surface = 'roughPavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (controller: { writePose(out: ReturnType<typeof createPose>): void }) => { const pose = createPose(); controller.writePose(pose); return pose; };
const kinds = ['separate', 'bump', 'softKnock', 'hardKnock'] as const;
function react(controller: Pick<EucController, 'separate' | 'bump' | 'softKnock' | 'hardKnock'>, kind: typeof kinds[number]) {
  switch (kind) { case 'separate': return controller.separate(.012, -.004); case 'bump': return controller.bump(.35, -.4, 2); case 'softKnock': return controller.softKnock(2); case 'hardKnock': return controller.hardKnock(3, -2); }
}
function posed(controller: EucController | NativeController) {
  controller.reset(undefined, 14); controller.setRideStyle(rideStyleFor('drunkard'));
  for (let i = 0; i < 24; i += 1) controller.step(DT, { ...NEUTRAL_ACTIONS, throttle: .4, steer: .6, crouch: i < 8 });
}
const physicalEqual = (physical: RiderOccupancyPose, pose: RiderOccupancyPose) => {
  for (const key of Object.keys(physical) as (keyof RiderOccupancyPose)[]) {
    if (key === 'ragdoll') assert.deepEqual(Array.from(physical.ragdoll), Array.from(pose.ragdoll));
    else assert.equal(physical[key], pose[key], key);
  }
};
function population(kind: 'walker' | 'parkedVehicle', x: number, z = 0) {
  const plan: PopulationPlan = { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'reactions', installedWorldId: 'reactions/living-r1', contentDigest: 'reactions', anchors: [],
    paths: [{ id: 'path', role: kind === 'walker' ? 'pedestrian' : 'traffic', district: 'park', points: [-1, 1].map((dz, i) => ({ x, y: 0, z: z + dz, headingY: 0, distanceMetres: i * 2, surface: 'pavement', sourceSegmentId: 'fixture' })), lengthMetres: 2, closed: false, serviceShuttle: false, clearanceRadiusMetres: 5, connections: [] }],
    actors: [{ id: 'npc', kind, pathId: 'path', initialDistanceMetres: 1, direction: 1, movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: kind === 'walker' ? { halfWidthMetres: .28, halfLengthMetres: .28, heightMetres: 1.9 } : { halfWidthMetres: .9, halfLengthMetres: 2, heightMetres: 1.5 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
  return new PopulationSimulation(plan, flat);
}
const emptyWorld = (canReact: EucDynamicWorld['canReact'], notes: string[] = []): EucDynamicWorld => ({ hull: { halfWidthMetres: .3, halfLengthMetres: .3, heightMetres: 2 }, resolveMotion: () => null, canPlace: () => true, didPlace: request => notes.push(request.reason), canReact });

test('clear atomic reactions preserve native state, return, event, serial and next-step parity for all four entry points', () => {
  for (const sampler of [flat, slope]) for (const kind of kinds) {
    const notes: string[] = [], requests: EucPhysicalReactionRequest[] = [], native = new NativeController(sampler), guarded = new EucController(sampler);
    const far = population('walker', 500), cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
    posed(native); posed(guarded); const before = poseOf(native);
    guarded.setDynamicWorld(emptyWorld(request => { requests.push(request); return populationPhysicalReactionAllowed({ ownerId: 'human-0', request, population: far, certificates: cache, occupants: [], reservations: [] }); }, notes));
    const serial = guarded.discontinuitySerial;
    assert.equal(react(guarded, kind), react(native, kind)); assert.equal(requests.length, 1, 'nested bump -> softKnock is one atomic preview');
    physicalEqual(requests[0].previous, before); physicalEqual(requests[0].proposed, poseOf(native));
    assert.deepEqual(guarded.snapshot(), native.snapshot()); assert.deepEqual(poseOf(guarded), poseOf(native)); assert.equal(guarded.discontinuitySerial, serial); assert.equal(notes.length, 0); assert.equal(cache.allocatedSlotCount, 0, 'far actual NPCs need no compiled contact slot');
    assert.deepEqual([guarded.tookOff, guarded.touchedDown, guarded.hopped, guarded.obstacleImpact], [native.tookOff, native.touchedDown, native.hopped, native.obstacleImpact]);
    for (let i = 0; i < 8; i += 1) { guarded.step(DT, NEUTRAL_ACTIONS); native.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(guarded.snapshot(), native.snapshot()); assert.deepEqual(poseOf(guarded), poseOf(native)); }
  }
});
test('refused native reactions keep full state, owned particles, Verlet future, pending token and journals untouched', () => {
  for (const kind of kinds) {
    const notes: string[] = [], requests: EucPhysicalReactionRequest[] = [], guarded = new EucController(flat), untouched = new EucController(flat);
    posed(guarded); posed(untouched); guarded.setDynamicWorld(emptyWorld(request => { requests.push(request); return false; }, notes));
    const before = poseOf(guarded), state = guarded.snapshot(), serial = guarded.discontinuitySerial, token = guarded.prepareStep(DT, NEUTRAL_ACTIONS);
    const result = react(guarded, kind); assert.equal(result, kind === 'hardKnock' ? false : undefined);
    assert.equal(requests.length, 1); assert.ok(Object.isFrozen(requests[0]) && Object.isFrozen(requests[0].previous) && Object.isFrozen(requests[0].proposed));
    assert.ok(Object.isFrozen(requests[0].previous.ragdoll) && Object.isFrozen(requests[0].proposed.ragdoll));
    assert.throws(() => { (requests[0].proposed as unknown as { x: number }).x = 99; }, TypeError);
    assert.deepEqual(poseOf(guarded), before); assert.deepEqual(guarded.snapshot(), state); assert.equal(guarded.discontinuitySerial, serial); assert.equal(notes.length, 0); assert.equal(token.ready, false);
    guarded.resolvePreparedStep(token); guarded.commitPreparedStep(token); untouched.step(DT, NEUTRAL_ACTIONS);
    assert.deepEqual(poseOf(guarded), poseOf(untouched)); assert.deepEqual(guarded.snapshot(), untouched.snapshot());
    // Hard-knock private scratch seeded a ragdoll; a later admitted live crash
    // must still produce the same owned particles and Verlet evolution.
    guarded.setDynamicWorld(undefined); assert.equal(guarded.hardKnock(3, -2), untouched.hardKnock(3, -2));
    for (let i = 0; i < 10; i += 1) { guarded.step(DT, NEUTRAL_ACTIONS); untouched.step(DT, NEUTRAL_ACTIONS); assert.deepEqual(poseOf(guarded), poseOf(untouched)); assert.deepEqual(guarded.snapshot(), untouched.snapshot()); }
  }
});
for (const kind of ['walker', 'parkedVehicle'] as const) test(`an actual bounded couch push into the current ${kind} is refused while the unguarded native push strictly overlaps`, () => {
  const contact = new ContactPair().step(DT, { x: 0, z: 0, velocityX: 0, velocityZ: 0 }, { x: -.3, z: 0, velocityX: 0, velocityZ: 0 });
  assert.ok(contact && contact.pushMetres > 0); const push = -contact.axisX * contact.pushMetres;
  assert.ok(push > 0 && push <= .02, 'use the real fixed-step capped couch push');
  const guarded = new EucController(flat), unguarded = new NativeController(flat), before = poseOf(guarded), human = buildRiderOccupancyEnvelope(before, RIDER_CONTACT).human;
  const actor = population(kind, 0).snapshot().actors[0].footprint, npc = population(kind, human.x + human.halfWidth + actor.halfWidthMetres + push / 2, human.z);
  npc.step(DT, []); npc.queryContacts([]); const actorBefore = npc.snapshot(), cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  assert.equal(npc.recoveryClearance({ x: human.x, z: human.z, headingY: human.headingY, halfWidthMetres: human.halfWidth, halfLengthMetres: human.halfLength, minY: human.baseY, maxY: human.topY, velocityX: 0, velocityZ: 0 }, [], [], 0).clear, true);
  let admitted: boolean | undefined; const notes: string[] = [];
  guarded.setDynamicWorld(emptyWorld(request => admitted = populationPhysicalReactionAllowed({ ownerId: 'human-0', request, population: npc, certificates: cache, occupants: [], reservations: [] }), notes));
  const state = guarded.snapshot(), serial = guarded.discontinuitySerial;
  guarded.separate(push, 0); unguarded.separate(push, 0);
  assert.equal(admitted, false); assert.deepEqual(poseOf(guarded), before); assert.deepEqual(guarded.snapshot(), state); assert.equal(guarded.discontinuitySerial, serial); assert.equal(notes.length, 0); assert.deepEqual(npc.snapshot(), actorBefore);
  const bad = buildRiderOccupancyEnvelope(poseOf(unguarded), RIDER_CONTACT).human;
  assert.equal(npc.recoveryClearance({ x: bad.x, z: bad.z, headingY: bad.headingY, halfWidthMetres: bad.halfWidth, halfLengthMetres: bad.halfLength, minY: bad.baseY, maxY: bad.topY, velocityX: 0, velocityZ: 0 }, [], [], 0).clear, false, 'known-bad native separation must place the actual human inside the NPC');
});
test('reaction admission sweeps other compact occupants and live reservations, ignoring only self and expired records', () => {
  const controller = new EucController(flat), before = poseOf(controller), proposed = { ...before, x: before.x + .012 }, human = buildRiderOccupancyEnvelope(before, RIDER_CONTACT).human;
  const request = { kind: 'separate' as const, previous: before, proposed }, npc = population('walker', 500), cache = new PopulationPhysicalCertificates(RIDER_CONTACT, createPose());
  const otherPose = { ...before, x: before.x + human.halfWidth * 2 + .006 };
  const input = { ownerId: 'human-0', request, population: npc, certificates: cache, occupants: [], reservations: [] };
  assert.equal(populationPhysicalReactionAllowed(input), true);
  assert.equal(populationPhysicalReactionAllowed({ ...input, occupants: [{ id: 'human-1', pose: otherPose }] }), false);
  const blocker = { x: human.x + human.halfWidth + .1 + .006, z: human.z, headingY: 0, halfWidthMetres: .1, halfLengthMetres: .1, minY: human.baseY, maxY: human.topY, velocityX: 0, velocityZ: 0 };
  assert.equal(populationPhysicalReactionAllowed({ ...input, reservations: [{ id: 'other/human', footprint: blocker }] }), false);
  assert.equal(populationPhysicalReactionAllowed({ ...input, reservations: [{ id: 'human-0/human', footprint: blocker }] }), true);
  assert.equal(populationPhysicalReactionAllowed({ ...input, reservations: [{ id: 'other/human', footprint: blocker, expiresAtClockSeconds: -1 }] }), true);
});
