/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Genuine authored/warmed incoming car, native full fall and recovery.
 * The historical known-bad stage is preserved in excluded evidence. No body
 * pose, NPC speed, controller clock or recovery placement is injected. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as controller from './EucController.ts';
import * as population from './population.ts';
import * as certificate from './populationPhysicalCertificates.ts';
import * as reaction from './populationPhysicalReactionAdmission.ts';
import * as transaction from './populationPhysicalTransaction.ts';
import * as fixture from './populationIncomingActorYieldFixture.ts';
import * as occupancy from '../shared/riderOccupancy.ts';
import * as tuning from '../data/tuning.ts';
import * as action from '../input/actions.ts';
const proposed = { controller, population, certificate, reaction, transaction, fixture, occupancy, tuning, action };
function run(api: any, options: { reverse?: boolean; denyReaction?: boolean; denyRecovery?: boolean } = {}) {
  const { controller: C, population: P, certificate: F, reaction: R, transaction: T, fixture: A, occupancy: O, tuning: N, action: I } = api;
  const dt = 1 / 120, phaseTicks = 72, pose = (value: any) => { const p = C.createPose(); value.writePose(p); return p; };
  const human = new C.EucController(A.incomingFlat), native = new C.EucController(A.incomingFlat);
  const cop = new C.EucController(A.incomingFlat, { spawn: { position: options.denyRecovery ? { x: 0, y: 0, z: 0 } : { x: -40, y: 0, z: -40 }, headingY: 0 } });
  for (const value of [human, native]) {
    assert.equal(value.reset(undefined, 12), true); assert.equal(value.hardKnock(3, 0), true);
    for (let tick = 0; tick < phaseTicks; tick++) value.step(dt, I.NEUTRAL_ACTIONS);
  }
  const first = pose(human), firstParts = O.buildRiderOccupancyEnvelope(first, N.RIDER_CONTACT);
  assert.equal(first.ragdollBlend, 1); assert.deepEqual(first, pose(native));
  native.step(dt, I.NEUTRAL_ACTIONS); const neutral = pose(native), nextParts = O.buildRiderOccupancyEnvelope(neutral, N.RIDER_CONTACT);
  const warm = (value: any) => { for (let pass = 0; pass < 3; pass++) A.warmIncoming(value); };
  const measured = new P.PopulationSimulation(A.incomingPlan(100, firstParts.human.z, 'trafficVehicle'), A.incomingFlat); warm(measured);
  const car = measured.snapshot().actors[0], face = Math.max(firstParts.human.x + firstParts.human.halfWidth,
    nextParts.human.x + nextParts.human.halfWidth) + car.speedMetresPerSecond * dt / 4;
  const plan = A.incomingPlan(face + car.hull.halfLengthMetres + car.distanceMetres, firstParts.human.z, 'trafficVehicle');
  const population = new P.PopulationSimulation(plan, A.incomingFlat); warm(population);
  const clock = population.clockSeconds, initialTick = population.snapshot().tick, serial = human.discontinuitySerial;
  const certificates = new F.PopulationPhysicalCertificates(N.RIDER_CONTACT, C.createPose());
  let reservations: any[] = [];
  const notes: any[] = [], rows: any[] = [], lateQueries: any[] = [], ids = ['human-0', 'cop-0'];
  const values = [human, cop], ownerPoses = () => values.map((value, i) => ({ id: ids[i], pose: pose(value) }));
  const port = (id: string) => ({ hull: N.POPULATION_OCCUPANT, resolveMotion: () => null,
    ragObstacleBodies: () => population.snapshot().actors.map((actor: any) => actor.footprint),
    canReact: (request: any) => {
      const allowed = !options.denyReaction && R.populationPhysicalReactionAllowed({ ownerId: id, request, population, certificates,
        occupants: ownerPoses(), reservations });
      if (lateQueries.length < 12) lateQueries.push({ kind: request.kind, allowed, tick: population.snapshot().tick,
        beforeClock: human.snapshot().crashTime });
      return allowed;
    },
    canPlace: (request: any) => {
      if (options.denyRecovery && request.reason === 'recover') return false;
      const other = ownerPoses().filter(value => value.id !== id).flatMap(value => certificates.components(value.id,
        value.pose, value.pose, 0, 'placement').map((component: any) => { const body = component.at(0);
          return { id: `${value.id}/${component.componentId}`, kind: value.id === 'human-0' ? 'human' : 'cop', previous: body, current: body }; }));
      return certificates.components(id, request.occupancyPose, request.occupancyPose, 0, 'placement')
        .every((component: any) => population.recoveryClearance(component.at(0), other,
          reservations.filter(value => !value.id.startsWith(`${id}/`))).clear);
    },
    didPlace: (request: any) => {
      assert.throws(() => population.actorMotions(), /committed/, 'NPC clock/state seals before native placement publication');
      notes.push({ id, reason: request.reason, serial: human.discontinuitySerial });
      reservations = reservations.filter(value => !value.id.startsWith(`${id}/`));
      for (const component of certificates.components(id, request.occupancyPose, request.occupancyPose, 0, 'placement'))
        reservations.push({ id: `${id}/${component.componentId}`, footprint: component.at(0),
          expiresAtClockSeconds: population.clockSeconds + N.POPULATION.placementReservationSeconds });
    } });
  const ports = ids.map(port); values.forEach((value, i) => value.setDynamicWorld(ports[i]));
  let minimumGap = Infinity, maximumCrash = human.snapshot().crashTime, held = 0, ticks = 0;
  let firstWitness: any = null, changedFallPoses = 0, deniedExactStarts = 0, stationaryEpochs = 0;
  for (; ticks < 440 && human.crashed; ticks++) {
    const before = values.map(pose), beforeStates = values.map(value => value.snapshot());
    reservations = reservations.filter(value => value.expiresAtClockSeconds >= population.clockSeconds);
    population.step(dt, ids.map((id, i) => ({ id, kind: i === 0 ? 'human' : 'cop', previous: A.incomingCoarse(before[i]), current: A.incomingCoarse(before[i]) })), reservations);
    const actors = population.actorMotions();
    if (!ticks) firstWitness = { movement: actors[0].previous.x - actors[0].current.x,
      startGaps: Object.values(firstParts).map((part: any) => A.incomingSignedGap(A.incomingPart(part), actors[0].previous)),
      incomingGaps: Object.values(firstParts).map((part: any) => A.incomingSignedGap(A.incomingPart(part), actors[0].current)) };
    const seats = ids.map((id, i) => ({ id, kind: i === 0 ? 'human' : 'cop', controller: values[i],
      pose: C.createPose(), token: values[i].prepareStep(dt, I.NEUTRAL_ACTIONS), world: ports[i] }));
    const ordered = options.reverse ? [...seats].reverse() : seats;
    const result = T.commitPopulationPhysicalTransaction({ population, certificates, seats: ordered, preparedSeats: ordered,
      before: new Map(ids.map((id, i) => [id, { pose: before[i], serial: values[i].discontinuitySerial }])),
      dt, reservations, bodyFromPose: A.incomingCoarse, preferActorYieldOwnerIds: ['human-0'], contactResponse: 'yield' });
    const actual = pose(human), actor = population.snapshot().actors[0];
    // 2026-10-04 (R2C-7): the exact first-dt pin restored. A crashed body is
    // never held, so its first step beside the yielded car is the full native dt.
    if (!ticks) assert.deepEqual(actual, neutral, 'actual whole-car start hold preserves the same full native first dt');
    assert.equal(result.contacts.length, 0); assert.notEqual(actor.activity, 'impacted');
    if (result.resolution.yieldedActorIds.includes('incoming')) {
      held++;
      for (const key of ['x', 'z', 'headingY'] as const) assert.equal(actor[key], actors[0].previous[key]);
      assert.equal(actor.speedMetresPerSecond, 0);
    }
    // 2026-10-04: the falling body's particles and wheel never enter the car;
    // its garment envelope may brush it. A recovered rider is clear whole.
    const gaps = human.crashed ? [A.incomingBodyGap(actual, actor.footprint)] : Object.values(O.buildRiderOccupancyEnvelope(actual, N.RIDER_CONTACT))
      .map((part: any) => A.incomingSignedGap(A.incomingPart(part), actor.footprint));
    minimumGap = Math.min(minimumGap, ...gaps); assert.ok(gaps.every(gap => gap >= -1e-6));
    maximumCrash = Math.max(maximumCrash, human.snapshot().crashTime);
    if (actual.ragdoll.some((value: number, i: number) => value !== before[0].ragdoll[i])) changedFallPoses++;
    const response = result.contactResponses.find((value: any) => value.ownerId === 'human-0');
    if (response && !response.admitted) {
      deniedExactStarts++;
      assert.deepEqual(actual, before[0]); assert.deepEqual(human.snapshot(), beforeStates[0], 'denied retries advance no live native state/clock');
    }
    if (ticks < 12 || ticks % 100 === 0 || !human.crashed || result.resolution.refusalReasons['human-0'] === 'placement') rows.push({ tick: ticks, refusal: result.resolution.refusalReasons['human-0'] ?? null,
      crashClock: human.snapshot().crashTime, response: response ?? null, gaps });
    assert.ok(Math.abs(population.clockSeconds - clock - (ticks + 1) * dt) < 1e-10);
    assert.equal(population.snapshot().tick, initialTick + ticks + 1);
    assert.throws(() => population.actorMotions(), /committed/);
    stationaryEpochs = human.crashed && JSON.stringify(actual) === JSON.stringify(before[0])
      && JSON.stringify(human.snapshot()) === JSON.stringify(beforeStates[0]) ? stationaryEpochs + 1 : 0;
    if (stationaryEpochs >= 5) { ticks++; break; } // A persistent old trap is already proved by root's frozen 440-step FAIL.
  }
  return { phaseTicks, plan, firstWitness, minimumGap, maximumCrash, held, ticks, changedFallPoses, deniedExactStarts, stationaryEpochs,
    crashed: human.crashed, serialDelta: human.discontinuitySerial - serial, actual: pose(human), cop: pose(cop), notes,
    reservations: reservations.map(value => value.id).sort(), elapsed: population.clockSeconds - clock, rows, lateQueries };
}
test('a genuine incoming car holds its exact native start while the full fall reaches one clear recovery', () => {
  const good = run(proposed);
  assert.equal(good.phaseTicks, 72); assert.equal(good.plan.actors[0].kind, 'trafficVehicle');
  assert.ok(good.firstWitness.movement > .02);
  assert.ok(good.firstWitness.startGaps.every((value: number) => value > .002));
  assert.ok(good.firstWitness.incomingGaps.some((value: number) => value < -.002));
  assert.ok(good.held > 0); assert.ok(good.minimumGap >= 0);
  assert.equal(good.crashed, false);
  assert.ok(good.maximumCrash >= tuning.EUC.crashRecoverAutoSeconds - 2 / 120);
  assert.ok(good.changedFallPoses > 1); assert.equal(good.serialDelta, 1);
  assert.equal(good.notes.length, 1); assert.equal(good.notes[0].reason, 'recover');
  assert.ok(good.reservations.includes('human-0/wheel') && good.reservations.includes('human-0/human'));
});
// 2026-10-04 (R2C-1/R2C-3): a falling body asks no late reaction, so hostile
// denial can no longer hold it; it still cannot invent a recovery placement.
test('hostile late-reaction denial cannot hold a falling body, nor invent a recovery placement', () => {
  const value = run(proposed, { denyReaction: true }), clean = run(proposed);
  assert.equal(value.crashed, false); assert.equal(value.serialDelta, 1); assert.equal(value.notes.length, 1); assert.equal(value.notes[0].reason, 'recover');
  assert.deepEqual(value.actual, clean.actual, 'the same native fall and checked recovery as with admission');
  assert.equal(value.deniedExactStarts, 0); assert.ok(value.changedFallPoses > 1);
});
test('denied actual recovery destinations remain denied with no callback, serial or reservation minted', () => {
  const value = run(proposed, { denyRecovery: true });
  assert.equal(value.crashed, true); assert.equal(value.serialDelta, 0); assert.deepEqual(value.notes, []);
  assert.deepEqual(value.reservations, []);
  assert.equal(value.cop.x, 0); assert.equal(value.cop.z, 0);
  assert.ok(value.maximumCrash >= proposed.tuning.EUC.crashRecoverAutoSeconds - 2 / 120);
  assert.ok(value.rows.some((row: any) => row.refusal === 'placement'), 'Actual native cop occupancy rejects the recovery endpoint in the whole transaction');
});
