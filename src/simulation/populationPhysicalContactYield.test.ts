/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld } from './EucController.ts';
import { PopulationSimulation, sweepPopulationHulls, type PopulationFootprint } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { POPULATION, POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import type { PopulationPlan } from '../level/populationPlan.ts';
import type { TerrainSampler } from './world.ts';
const DT = 1 / 120;
const flat: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const poseOf = (controller: EucController) => { const pose = createPose(); controller.writePose(pose); return pose; };
const body = (pose: ReturnType<typeof createPose>): PopulationFootprint => ({ x: pose.x, z: pose.z, headingY: pose.headingY,
  halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
  minY: pose.y, maxY: pose.y + POPULATION_OCCUPANT.heightMetres, velocityX: Math.sin(pose.headingY) * pose.speed, velocityZ: Math.cos(pose.headingY) * pose.speed });
function signedSeparation(first: PopulationFootprint, second: PopulationFootprint) {
  const axes = (heading: number) => [{ x: Math.cos(heading), z: -Math.sin(heading) }, { x: Math.sin(heading), z: Math.cos(heading) }];
  const support = (body: PopulationFootprint, axis: { x: number; z: number }) => { const [x, z] = axes(body.headingY);
    return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidthMetres + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLengthMetres; };
  const planar = Math.max(...[...axes(first.headingY), ...axes(second.headingY)].map(axis =>
    Math.abs((second.x - first.x) * axis.x + (second.z - first.z) * axis.z) - support(first, axis) - support(second, axis)));
  const vertical = Math.max(first.minY - second.maxY, second.minY - first.maxY);
  return { planar, vertical, separating: Math.max(planar, vertical) };
}
function plan(z: number, moving = false): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'yield', installedWorldId: 'yield/living-r1', contentDigest: 'yield', anchors: [],
    paths: [{ id: 'actor-path', role: moving ? 'pedestrian' : 'traffic', district: 'commercial', points: [z - 10, z, z + 10].map((value, index) => ({ x: 0, y: 0, z: value, headingY: 0, distanceMetres: index * 10, surface: 'pavement', sourceSegmentId: 'native-yield-fixture' })), lengthMetres: 20, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] }],
    actors: [{ id: 'actor', kind: moving ? 'walker' : 'parkedVehicle', pathId: 'actor-path', initialDistanceMetres: 10, direction: moving ? -1 : 1,
      movement: moving ? 'shuttle' : 'stationary', speedMetresPerSecond: moving ? 16 : 0, idleSeconds: 1, appearanceIndex: 0,
      hull: moving ? { halfWidthMetres: .28, halfLengthMetres: .28, heightMetres: 1.9 } : { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } }], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
function exposedNativeIncoming() {
  let selected: { controller: EucController; side: number; exposure: number } | undefined;
  // Select an ACTUAL source-owned grounded carve pose, never a synthetic
  // cross-product or pose-field overwrite. The native speed-shed is also real.
  for (const speed of [8, 12, 20]) for (const steer of [-1, 1]) for (const ticks of [30, 60, 90, 120]) {
    const controller = new EucController(flat); controller.reset(undefined, speed);
    for (let tick = 0; tick < ticks; tick += 1) controller.step(DT, { ...NEUTRAL_ACTIONS, steer });
    controller.shedSpeed(Math.abs(poseOf(controller).speed));
    if (controller.crashed || controller.groundClearance > 1e-6) continue;
    const human = buildRiderOccupancyEnvelope(poseOf(controller), RIDER_CONTACT).human;
    for (const side of [-1, 1]) {
      const support = side > 0 ? human.maxX : -human.minX;
      const exposure = support - POPULATION_OCCUPANT.halfWidthMetres - POPULATION.humanWaitingGapMetres;
      if (!selected || exposure > selected.exposure) selected = { controller, side, exposure };
    }
  }
  assert.ok(selected && selected.exposure > .02, 'incoming fixture must expose a genuine native human beyond legacy predictive spacing');
  const pose = poseOf(selected.controller), human = buildRiderOccupancyEnvelope(pose, RIDER_CONTACT).human;
  const nx = Math.cos(pose.headingY) * selected.side, nz = -Math.sin(pose.headingY) * selected.side;
  const x = human.x + nx * (human.halfWidth + .28 + .03), z = human.z + nz * (human.halfWidth + .28 + .03);
  const value = plan(0, true), headingY = Math.atan2(-nx, -nz);
  const path = { ...value.paths[0], points: [10, 0, -10].map((offset, index) => ({ x: x + nx * offset, y: 0, z: z + nz * offset,
    headingY, distanceMetres: index * 10, surface: 'pavement' as const, sourceSegmentId: 'actual-native-mounted-exposure' })) };
  const populationPlan: PopulationPlan = { ...value, paths: [path], actors: [{ ...value.actors[0], direction: 1 }] };
  return { controller: selected.controller, populationPlan };
}
function fixture(withYield: boolean, z?: number, speed = 12, moving = false) {
  const exposed = moving ? exposedNativeIncoming() : undefined;
  const controller = exposed?.controller ?? new EucController(flat); if (!exposed) controller.reset(undefined, speed);
  const prototype = poseOf(controller), front = buildRiderOccupancyEnvelope(prototype, RIDER_CONTACT).human;
  const population = new PopulationSimulation(exposed?.populationPlan ?? plan(z ?? front.z + front.halfLength + 2.4 + .3, moving), flat), certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, prototype);
  const port: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null, canPlace: () => true,
    canReact: request => populationPhysicalReactionAllowed({ ownerId: 'owner', request, population, certificates, occupants: [], reservations: [] }) };
  controller.setDynamicWorld(port);
  const step = (actions: ActionSnapshot) => {
    const previous = poseOf(controller), before = new Map([['owner', { pose: previous, serial: controller.discontinuitySerial }]]);
    if (moving) {
      const hostile = population as unknown as { states: Array<{ speed: number }> }; hostile.states[0].speed = 16;
      population.step(DT, [{ id: 'owner', kind: 'human', previous: body(previous), current: body(previous) }]); // retain actual identity and native predictive yielding/cooldown policy.
    } else population.step(DT, [{ id: 'owner', kind: 'human', previous: body(previous), current: body(previous) }]);
    const token = controller.prepareStep(DT, actions), pose = createPose(); controller.writePreparedPose(token, pose);
    const seat = { id: 'owner', kind: 'human' as const, controller, token, pose, world: port };
    return commitPopulationPhysicalTransaction({ population, certificates, seats: [seat], preparedSeats: [seat], before, dt: DT,
      reservations: [], bodyFromPose: body, ...(withYield ? { contactResponse: 'yield' as const } : {}) });
  };
  return { controller, population, certificates, step };
}
test('clear native evolution is byte-identical and never opens a contact response', () => {
  const value = fixture(true, 1000), native = new EucController(flat); native.reset(undefined, 12);
  const actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: .5 };
  for (let i = 0; i < 30; i += 1) { native.step(DT, actions); const result = value.step(actions); assert.deepEqual(result.contactResponses, []); }
  assert.deepEqual(poseOf(value.controller), poseOf(native)); assert.deepEqual(value.controller.snapshot(), native.snapshot()); assert.equal(value.certificates.allocatedSlotCount, 0);
});
test('actual parked-car contact yields native speed and releases through brake/turn-away; the exact-start-only control freezes those inputs', () => {
  // 2026-10-03 (POP-3): a human rider now meets a car at 12 m/s as a wall, with
  // the native obstacle crash. The yield/release contract holds below that
  // speed, so this fixture rides in at 3 m/s (under EUC.obstacleCrashSpeed).
  const guarded = fixture(true, undefined, 3), locked = fixture(false, undefined, 3); let yielded = false, refused = false;
  for (let i = 0; i < 30; i += 1) {
    const result = guarded.step(NEUTRAL_ACTIONS); locked.step(NEUTRAL_ACTIONS);
    refused ||= result.resolution.refusedOwnerIds.includes('owner'); yielded ||= result.contactResponses.some(response => response.admitted);
  }
  assert.equal(refused, true, 'fixture must reach an actual compact human/wheel parked-vehicle contact'); assert.equal(yielded, true);
  assert.equal(poseOf(guarded.controller).speed, 0); assert.ok(poseOf(locked.controller).speed > 2, 'known-bad hold must retain real incoming speed');
  const first = poseOf(guarded.controller), badFirst = poseOf(locked.controller);
  const input = { ...NEUTRAL_ACTIONS, throttle: -1, steer: 1 }; let advanced = false, reversed = false;
  for (let i = 0; i < 400; i += 1) { const result = guarded.step(input); advanced ||= result.contactResponses.some(item => item.inputAdvanced); locked.step(input);
    reversed ||= guarded.controller.snapshot().reversing; }
  assert.equal(advanced, true, 'the actual native reverse/brake timer must advance under an admitted full-dt response');
  const last = poseOf(guarded.controller);
  assert.ok(Math.hypot(last.x - first.x, last.z - first.z) > .2, 'brake/reverse and turn-away must release a real player from the parked body');
  assert.ok(Math.abs(last.headingY - first.headingY) > .05, 'the existing stopped solid-contact steering context must take effect');
  const badLast = poseOf(locked.controller), goodDistance = Math.hypot(last.x - first.x, last.z - first.z),
    badDistance = Math.hypot(badLast.x - badFirst.x, badLast.z - badFirst.z), goodTurn = Math.abs(last.headingY - first.headingY), badTurn = Math.abs(badLast.headingY - badFirst.headingY);
  assert.ok(badDistance <= .2, 'the actual exact-start-only control must fail the SAME >0.2 m parked release predicate');
  assert.ok(badTurn <= .05, 'the actual exact-start-only control must fail the SAME >0.05 rad turn-away predicate');
  assert.equal(locked.controller.snapshot().reversing, false, 'the held bad control cannot reach the real native reverse gate');
  // 2026-10-04 (VIS-CRASH-1): with the contact core the released rider's
  // reverse circle comes round into the car again and ends there, so the gate
  // is asserted as engaged during the release rather than on its last step.
  assert.equal(reversed, true, 'the repaired native reverse gate must actually engage');
  console.log(JSON.stringify({ witness: 'parked-400-actual-positive-and-negative', good: { displacementMetres: goodDistance, headingChangeRadians: goodTurn,
    speed: last.speed, reversing: guarded.controller.snapshot().reversing, reverseHoldSeconds: (guarded.controller as unknown as { reverseHold: number }).reverseHold,
    populationClockSeconds: guarded.population.clockSeconds }, bad: { displacementMetres: badDistance, headingChangeRadians: badTurn,
    speed: badLast.speed, reversing: locked.controller.snapshot().reversing, reverseHoldSeconds: (locked.controller as unknown as { reverseHold: number }).reverseHold,
    populationClockSeconds: locked.population.clockSeconds } }));
  assert.equal(guarded.controller.obstacleImpact, 0, 'the hold/yield policy cannot charge an unreachable discarded impact'); assert.equal(guarded.population.clockSeconds, locked.population.clockSeconds);
});
// 2026-10-04 (R2C-5): an actor walking into a rider now yields first (held at
// its start for the step) instead of refusing the rider, so it stops short of
// the body: no charged pair edge and no contact response remain to pin.
test('incoming actual native NPC motion still stops short of the held components and fabricates no rider impact', () => {
  const value = fixture(true, 2, 0, true); let stopped = false, response = false, charges = 0;
  for (let i = 0; i < 30; i += 1) {
    const result = value.step(NEUTRAL_ACTIONS); charges += result.contacts.filter(contact => contact.charge).length;
    stopped ||= Object.values(result.resolution.batch.actorFractions).some(fraction => fraction < 1);
    response ||= result.contactResponses.some(item => item.admitted);
    assert.equal(value.controller.obstacleImpact, 0); assert.equal(poseOf(value.controller).speed, 0);
  }
  assert.equal(stopped, true, 'the moving NPC must actually be stopped by the physical body'); assert.equal(response, false, 'the rider is not refused');
  assert.equal(charges, 0, 'a yielding NPC charges no impact');
  const actor = value.population.snapshot().actors[0], human = buildRiderOccupancyEnvelope(poseOf(value.controller), RIDER_CONTACT).human;
  const humanBody: PopulationFootprint = { x: human.x, z: human.z, headingY: human.headingY, minY: human.baseY, maxY: human.topY, halfWidthMetres: human.halfWidth, halfLengthMetres: human.halfLength, velocityX: 0, velocityZ: 0 };
  const envelope = buildRiderOccupancyEnvelope(poseOf(value.controller), RIDER_CONTACT);
  const finalGaps = [envelope.human, envelope.wheel].map(part => signedSeparation({ x: part.x, z: part.z, headingY: part.headingY,
    halfWidthMetres: part.halfWidth, halfLengthMetres: part.halfLength, minY: part.baseY, maxY: part.topY, velocityX: 0, velocityZ: 0 }, actor.footprint));
  console.log(JSON.stringify({ witness: 'incoming-native-component-final-separation', finalGaps, nativeSweep: sweepPopulationHulls(humanBody, humanBody, actor.footprint, actor.footprint) }));
  assert.ok(finalGaps.every(item => item.separating >= 0), 'both actual native components must have a nonnegative signed separating gap; a boundary skin event is not penetration');
});
test('a refused contact response preserves native speed, exact physical pose and an already-resolved token', () => {
  const controller = new EucController(flat); controller.reset(undefined, 12);
  controller.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null, canReact: () => false });
  const before = poseOf(controller), state = controller.snapshot(), token = controller.prepareStep(DT, NEUTRAL_ACTIONS); controller.resolvePreparedStep(token);
  const pending = createPose(); controller.writePreparedPose(token, pending);
  assert.equal(controller.yieldPhysicalContact(), false); assert.deepEqual(poseOf(controller), before); assert.deepEqual(controller.snapshot(), state); assert.equal(token.ready, true);
  const after = createPose(); controller.writePreparedPose(token, after); assert.deepEqual(after, pending);
});

test('a held-token recovery advances native force/reverse/time once while its native update sites constrain only held stance tilt/glance', () => {
  const guarded = new EucController(flat), native = new EucController(flat); guarded.reset(undefined, 0); native.reset(undefined, 0);
  const queries: string[] = []; guarded.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null, canReact: request => { queries.push(request.kind); return true; } });
  const input = { ...NEUTRAL_ACTIONS, throttle: -1, steer: 1 };
  const token = guarded.prepareStep(DT, input); guarded.holdPreparedStep(token); guarded.commitPreparedStep(token, false);
  const response = guarded.respondToHeldPhysicalContact(token);
  native.yieldPhysicalContact(); native.step(DT, { ...input, steer: 0 });
  assert.deepEqual(response, { admitted: true, inputAdvanced: true }); assert.deepEqual(queries, ['contactYield', 'contactInput']);
  const nativePose = poseOf(native); assert.ok(nativePose.reverseBlend > 0, 'the unconstrained source must actually request a look-behind change');
  assert.equal(poseOf(guarded).reverseBlend, 0, 'the contact constraint must hold the real existing glance at its native update site');
  const expectedPose = { ...nativePose, reverseBlend: 0 }, expectedState = { ...native.snapshot(), reverseBlend: 0 };
  assert.deepEqual(poseOf(guarded), expectedPose); assert.deepEqual(guarded.snapshot(), expectedState);
  assert.equal((guarded as unknown as { reverseHold: number }).reverseHold, DT, 'native reverse timer must consume one complete held dt');
  assert.equal((guarded as unknown as { leanPitch: number }).leanPitch, (native as unknown as { leanPitch: number }).leanPitch, 'native force lean must integrate unchanged under the pose constraint');
  assert.throws(() => guarded.respondToHeldPhysicalContact(token), /exactly once/); guarded.publishPreparedPlacements(token);
});
test('a denied braking response leaves only the admitted zero-time stop and cannot advance clocks or publish discarded placement', () => {
  const guarded = new EucController(flat), native = new EucController(flat); guarded.reset(undefined, 0); native.reset(undefined, 0);
  const notes: unknown[] = []; guarded.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    didPlace: request => notes.push(request), canReact: request => request.kind === 'contactYield' });
  const token = guarded.prepareStep(DT, { ...NEUTRAL_ACTIONS, throttle: -1, steer: 1 }); guarded.holdPreparedStep(token); guarded.commitPreparedStep(token, false);
  assert.deepEqual(guarded.respondToHeldPhysicalContact(token), { admitted: true, inputAdvanced: false }); native.yieldPhysicalContact();
  assert.deepEqual(poseOf(guarded), poseOf(native)); assert.deepEqual(guarded.snapshot(), native.snapshot());
  assert.equal((guarded as unknown as { reverseHold: number }).reverseHold, 0); guarded.publishPreparedPlacements(token); assert.equal(notes.length, 0);
});

test('native reverse may exit and re-enter through real throttle timing after a constrained held-contact response', () => {
  const controller = new EucController(flat); controller.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null, canReact: () => true });
  const brake = { ...NEUTRAL_ACTIONS, throttle: -1, steer: 1 };
  const heldTick = () => { const token = controller.prepareStep(DT, brake); controller.holdPreparedStep(token); controller.commitPreparedStep(token, false);
    assert.equal(controller.respondToHeldPhysicalContact(token).inputAdvanced, true); controller.publishPreparedPlacements(token); };
  for (let tick = 0; tick < 50; tick += 1) heldTick();
  assert.equal(controller.snapshot().reversing, true, 'the actual native confirmation dwell must engage reverse without a reset');
  for (let tick = 0; tick < 100; tick += 1) controller.step(DT, { ...NEUTRAL_ACTIONS, throttle: 1 });
  assert.equal(controller.snapshot().reversing, false, 'ordinary forward throttle must leave reverse through the native gate');
  assert.ok(poseOf(controller).speed > 0); controller.yieldPhysicalContact();
  for (let tick = 0; tick < 50; tick += 1) heldTick();
  assert.equal(controller.snapshot().reversing, true, 'a second native brake dwell must engage reverse again instead of leaving a stale release token');
});
test('a crashed owner advances exactly one admitted native fall without consuming the mounted release policy', () => {
  const controller = new EucController(flat), native = new EucController(flat);
  assert.equal(controller.hardKnock(3, 0), true); assert.equal(native.hardKnock(3, 0), true);
  const queries: string[] = [];
  controller.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    canReact: request => { queries.push(request.kind); return true; } });
  const actions = { ...NEUTRAL_ACTIONS, throttle: -1, steer: 1 };
  const token = controller.prepareStep(DT, actions); controller.holdPreparedStep(token); controller.commitPreparedStep(token, false);
  const beforeTime = (controller as unknown as { crashTime: number }).crashTime;
  assert.deepEqual(controller.respondToHeldPhysicalContact(token), { admitted: true, inputAdvanced: true });
  native.step(DT, actions);
  assert.deepEqual(queries, ['contactClock'], 'the full native fall asks its own admission, never a mounted stop or braking retry');
  assert.equal((controller as unknown as { crashTime: number }).crashTime, beforeTime + DT);
  assert.deepEqual(poseOf(controller), poseOf(native)); assert.deepEqual(controller.snapshot(), native.snapshot());
  assert.throws(() => controller.respondToHeldPhysicalContact(token), /exactly once/); controller.publishPreparedPlacements(token);
});


test('held outgoing native reverse retains admitted velocity and consumes exactly one full dt', () => {
  const guarded = new EucController(flat), native = new EucController(flat);
  const brake = { ...NEUTRAL_ACTIONS, throttle: -1 };
  for (let tick = 0; tick < 75; tick += 1) { guarded.step(DT, brake); native.step(DT, brake); }
  assert.equal(guarded.snapshot().reversing, true); assert.ok(poseOf(guarded).speed < -.1, 'actual native reverse must already carry outgoing velocity');
  const queries: string[] = []; guarded.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    canReact: request => { queries.push(request.kind); return true; } });
  const token = guarded.prepareStep(DT, brake); guarded.holdPreparedStep(token); guarded.commitPreparedStep(token, false);
  const reverseBlend = poseOf(native).reverseBlend, pitch = (native as unknown as { riderPitch: number }).riderPitch;
  assert.deepEqual(guarded.respondToHeldPhysicalContact(token), { admitted: true, inputAdvanced: true });
  native.step(DT, brake);
  const expectedPose = { ...poseOf(native), reverseBlend, riderPitch: pitch }, expectedState = { ...native.snapshot(), reverseBlend, riderPitch: pitch };
  assert.deepEqual(poseOf(guarded), expectedPose); assert.deepEqual(guarded.snapshot(), expectedState);
  assert.deepEqual(queries, ['contactInput'], 'an admitted outgoing step must not zero velocity first'); guarded.publishPreparedPlacements(token);
});
test('refused outgoing reverse cannot advance scratch clocks, then an admitted zero-speed retry advances once', () => {
  const guarded = new EucController(flat), native = new EucController(flat), brake = { ...NEUTRAL_ACTIONS, throttle: -1 };
  for (let tick = 0; tick < 75; tick += 1) { guarded.step(DT, brake); native.step(DT, brake); }
  const queries: string[] = []; let attempts = 0;
  guarded.setDynamicWorld({ hull: POPULATION_OCCUPANT, resolveMotion: () => null, canReact: request => {
    queries.push(request.kind); return request.kind !== 'contactInput' || ++attempts > 1;
  } });
  const token = guarded.prepareStep(DT, brake); guarded.holdPreparedStep(token); guarded.commitPreparedStep(token, false);
  const reverseBlend = poseOf(native).reverseBlend, pitch = (native as unknown as { riderPitch: number }).riderPitch;
  assert.deepEqual(guarded.respondToHeldPhysicalContact(token), { admitted: true, inputAdvanced: true });
  native.yieldPhysicalContact(); native.step(DT, brake);
  assert.deepEqual(poseOf(guarded), { ...poseOf(native), reverseBlend, riderPitch: pitch });
  assert.deepEqual(guarded.snapshot(), { ...native.snapshot(), reverseBlend, riderPitch: pitch });
  assert.deepEqual(queries, ['contactInput', 'contactYield', 'contactInput']); guarded.publishPreparedPlacements(token);
});
