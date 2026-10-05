/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose, EucController, type EucDynamicWorld } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EUC, POPULATION_OCCUPANT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { resolvePopulationWholeStepRefusal, resolvePopulationWholeStepRefusalPreferActorYield } from './populationWholeStepRefusal.ts';
import { INCOMING_DT as DT, incomingFlat as flat, incomingPose as poseOf, incomingCoarse as coarse, incomingPart as part,
  incomingSignedGap as gap, incomingBodyGap as bodyGap, incomingNativeFixture, incomingPlan, warmIncoming } from './populationIncomingActorYieldFixture.ts';
import { PopulationSimulation } from './population.ts';
function inputFor(f: ReturnType<typeof incomingNativeFixture>, preferred: boolean, notes: unknown[] = [],
  certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, f.before)) {
  const port: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null,
    ragObstacleBodies: () => f.population.snapshot().actors.map(actor => actor.footprint),
    canReact: request => populationPhysicalReactionAllowed({ ownerId: 'owner', request, population: f.population, certificates, occupants: [], reservations: [] }),
    canPlace: request => certificates.components('owner', request.occupancyPose, request.occupancyPose, 0, 'placement')
      .every(component => f.population.recoveryClearance(component.at(0), [], []).clear),
    didPlace: request => { assert.throws(() => f.population.actorMotions(), /committed/); notes.push({ reason: request.reason, clock: f.population.clockSeconds }); } };
  f.value.setDynamicWorld(port);
  f.token = f.value.prepareStep(DT, NEUTRAL_ACTIONS);
  const seat = { id: 'owner', kind: 'human' as const, controller: f.value, pose: createPose(), token: f.token, world: port };
  return { population: f.population, certificates, seats: [seat], preparedSeats: [seat], before: new Map([['owner', { pose: f.before, serial: f.value.discontinuitySerial }]]),
    dt: DT, reservations: [], bodyFromPose: coarse, ...(preferred ? { preferActorYieldOwnerIds: ['owner'] } : {}) };
}
test('shipping fictionalEuc really moves into mandatory partial native human; exact held actor start admits the same full native dt', () => {
  const f = incomingNativeFixture(), actorBefore = f.population.snapshot().actors[0]; f.population.step(DT, f.occupants);
  const actors = f.population.actorMotions(), actor = actors[0], proof = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, f.before), owner = proof.owner('owner', f.before, f.neutral, DT, actors);
  assert.equal(actorBefore.kind, 'fictionalEuc'); assert.ok(actor.previous.x - actor.current.x > .025, 'native acceleration/planner must really expose incoming contact');
  assert.ok(Object.values(buildRiderOccupancyEnvelope(f.before, RIDER_OCCUPANCY)).every(p => gap(part(p), actor.previous) > 0));
  assert.ok(Object.values(buildRiderOccupancyEnvelope(f.neutral, RIDER_OCCUPANCY)).some(p => gap(part(p), actor.current) < 0), 'actual shipping actor endpoint must intersect genuine full native fall');
  assert.ok(Object.values(buildRiderOccupancyEnvelope(f.neutral, RIDER_OCCUPANCY)).every(p => gap(part(p), actor.previous) > .005), 'actual held start must leave this complete native endpoint clear');
  assert.deepEqual(resolvePopulationWholeStepRefusal(actors, [owner]).refusedOwnerIds, ['owner'], 'prior whole-owner policy really discards this same full native dt');
  const chosen = resolvePopulationWholeStepRefusalPreferActorYield(actors, [owner]); assert.deepEqual(chosen.refusedOwnerIds, []); assert.deepEqual(chosen.yieldedActorIds, ['incoming']);
  const input = inputFor(f, true), result = commitPopulationPhysicalTransaction(input), after = f.population.snapshot().actors[0];
  assert.deepEqual(result.resolution.yieldedActorIds, ['incoming']); assert.deepEqual(result.resolution.refusedOwnerIds, []); assert.equal(result.resolution.ownerFractions.owner, 1);
  assert.equal(result.resolution.batch.actorFractions.incoming, 0); assert.equal(after.x, actorBefore.x); assert.equal(after.z, actorBefore.z);
  assert.equal(after.distanceMetres, actorBefore.distanceMetres); assert.equal(after.gaitDistanceMetres, actorBefore.gaitDistanceMetres); assert.equal(after.wheelTravelMetres, actorBefore.wheelTravelMetres);
  assert.equal(after.speedMetresPerSecond, 0); assert.deepEqual(result.contacts, []); assert.deepEqual(result.contactResponses, []);
  assert.deepEqual(poseOf(f.value), f.neutral, 'no constraint displacement when exact held start admits the unprotected full native body');
  assert.ok(Math.abs(f.value.snapshot().crashTime - .1 - DT) < 1e-12); assert.equal(f.value.obstacleImpact, 0);
  assert.ok((result.motionReproofPasses ?? 0) >= 1); assert.throws(() => f.population.actorMotions(), /committed/);
  for (const component of result.resolution.components) assert.ok(gap(component.at(1), after.footprint) >= 0);
  console.log(JSON.stringify({ incomingNative: 'first-partial-full-dt', movement: actor.previous.x - actor.current.x, result: { yielded: result.resolution.yieldedActorIds,
    refused: result.resolution.refusedOwnerIds, passes: result.motionReproofPasses }, crashClock: f.value.snapshot().crashTime, npcClock: f.population.clockSeconds }));
});
test('same shipping incoming NPC permits full native fall and exactly one prospective recovery without discarded impact/history', () => {
  const f = incomingNativeFixture(), notes: unknown[] = [], serial = f.value.discontinuitySerial, initialClock = f.population.clockSeconds;
  let input = inputFor(f, true, notes), ticks = 0, yields = 0, maximumCrash = .1, minimumPelvis = f.before.ragdoll[1], minimumGap = Infinity;
  const rows: unknown[] = [];
  for (; ticks < 440 && f.value.crashed; ticks += 1) {
    const previous = ticks ? poseOf(f.value) : f.before;
    // 2026-10-03 (CP-1): one certificates instance for the whole ride, as Game
    // keeps; a held step's identical retry resumes its kept proof only under it.
    if (ticks) { f.before = previous; input = inputFor(f, true, notes, input.certificates); }
    f.population.step(DT, [{ id: 'owner', kind: 'human', previous: coarse(previous), current: coarse(previous) }]);
    const result = commitPopulationPhysicalTransaction({ ...input, contactResponse: 'yield' }), actual = poseOf(f.value), actor = f.population.snapshot().actors[0];
    yields += (result.resolution.yieldedActorIds ?? []).length; maximumCrash = Math.max(maximumCrash, f.value.snapshot().crashTime);
    if (f.value.crashed) minimumPelvis = Math.min(minimumPelvis, actual.ragdoll[1]);
    // 2026-10-04: a crashed body is never held; its particles and wheel meet the
    // actor natively and its garment envelope may brush it. The body never enters.
    const gaps = f.value.crashed ? [bodyGap(actual, actor.footprint)]
      : Object.values(buildRiderOccupancyEnvelope(actual, RIDER_OCCUPANCY)).map(p => gap(part(p), actor.footprint));
    minimumGap = Math.min(minimumGap, ...gaps);
    assert.ok(gaps.every(value => value >= -1e-6), `accepted actual body intrusion at tick ${ticks}: ${gaps}`);
    assert.equal(actor.activity === 'impacted', false, 'discarded actor suffix cannot charge an impact pause');
    assert.deepEqual(result.contacts, []); assert.ok((result.motionReproofPasses ?? 1) <= f.population.snapshot().actors.length + 1);
    if (ticks < 2 || ticks % 100 === 0 || !f.value.crashed) rows.push({ tick: ticks, crashClock: f.value.snapshot().crashTime, gaps, yielded: result.resolution.yieldedActorIds, refused: result.resolution.refusedOwnerIds });
  }
  console.log(JSON.stringify({ incomingNative: 'complete-fall', yields, ticks, minimumGap, maximumCrash, minimumPelvis, notes, rows }));
  assert.ok(yields > 0); assert.equal(f.value.crashed, false); assert.ok(maximumCrash >= EUC.crashRecoverAutoSeconds - 2 * DT);
  assert.ok(minimumPelvis < .7); assert.equal(f.value.discontinuitySerial, serial + 1); assert.equal(notes.length, 1); assert.equal((notes[0] as { reason: string }).reason, 'recover');
  assert.ok(Math.abs(f.population.clockSeconds - initialClock - ticks * DT) < 1e-10);
});
test('shipping-car native lookahead safety remains intact; distant preferred path preserves native clear-space state exactly', () => {
  const value = new EucController(flat), direct = new EucController(flat), population = new PopulationSimulation(incomingPlan(1000, 0, 'trafficVehicle'), flat);
  warmIncoming(population); for (const rider of [value, direct]) rider.reset(undefined, 12);
  const previous = poseOf(value), port: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null, ragObstacleBodies: () => population.snapshot().actors.map(a => a.footprint) };
  value.setDynamicWorld(port); direct.setDynamicWorld(port); const actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: .6, crouch: true };
  const token = value.prepareStep(DT, actions), seat = { id: 'owner', kind: 'human' as const, controller: value, pose: createPose(), token, world: port };
  population.step(DT, [{ id: 'owner', kind: 'human', previous: coarse(previous), current: coarse(previous) }]); direct.step(DT, actions);
  const result = commitPopulationPhysicalTransaction({ population, certificates: new PopulationPhysicalCertificates(RIDER_OCCUPANCY, previous), seats: [seat], preparedSeats: [seat],
    before: new Map([['owner', { pose: previous, serial: value.discontinuitySerial }]]), dt: DT, reservations: [], bodyFromPose: coarse, preferActorYieldOwnerIds: ['owner'] });
  assert.deepEqual(value.snapshot(), direct.snapshot()); assert.deepEqual(poseOf(value), poseOf(direct)); assert.deepEqual(result.resolution.yieldedActorIds, []);
  assert.deepEqual(result.contacts, []); assert.deepEqual(result.contactResponses, []); assert.equal(population.snapshot().actors[0].kind, 'trafficVehicle');
});
test('ready/replayed prepared tokens cannot fabricate neutral actor intent or seal the NPC epoch', () => {
  const f = incomingNativeFixture(), input = inputFor(f, true); f.population.step(DT, f.occupants);
  f.value.resolvePreparedStep(f.token, input.preparedSeats[0].world);
  const before = poseOf(f.value), clock = f.population.clockSeconds;
  assert.throws(() => commitPopulationPhysicalTransaction(input), /untouched neutral/);
  assert.deepEqual(poseOf(f.value), before); assert.equal(f.population.clockSeconds, clock); assert.doesNotThrow(() => f.population.actorMotions());
});
test('actor choice replays every prepared cop from its untouched native start and seals all owners before placement journals', () => {
  const f = incomingNativeFixture(), input = inputFor(f, true), cop = new EucController(flat, { spawn: { position: { x: -20, y: 0, z: 0 }, headingY: 0 } }),
    nativeCop = new EucController(flat, { spawn: { position: { x: -20, y: 0, z: 0 }, headingY: 0 } });
  const beforeCop = poseOf(cop), actions = { ...NEUTRAL_ACTIONS, throttle: 1, steer: .4 }, copPort: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null };
  cop.setDynamicWorld(copPort); nativeCop.setDynamicWorld(copPort);
  const copSeat = { id: 'cop-0', kind: 'cop' as const, controller: cop, pose: createPose(), token: cop.prepareStep(DT, actions), world: copPort };
  let copResolutions = 0; const resolve = cop.resolvePreparedStep.bind(cop);
  cop.resolvePreparedStep = (...args) => { copResolutions += 1; assert.doesNotThrow(() => f.population.actorMotions(), 'epoch stays open through every native cop replay'); resolve(...args); };
  f.population.step(DT, [...f.occupants, { id: 'cop-0', kind: 'cop', previous: coarse(beforeCop), current: coarse(beforeCop) }]); nativeCop.step(DT, actions);
  const result = commitPopulationPhysicalTransaction({ ...input, seats: [...input.seats, copSeat], preparedSeats: [...input.preparedSeats, copSeat],
    before: new Map([...input.before, ['cop-0', { pose: beforeCop, serial: cop.discontinuitySerial }]]) });
  assert.equal(copResolutions, result.motionReproofPasses); assert.ok(copResolutions >= 1); assert.deepEqual(cop.snapshot(), nativeCop.snapshot());
  assert.deepEqual(poseOf(cop), poseOf(nativeCop)); assert.equal(result.resolution.ownerFractions['cop-0'], 1); assert.deepEqual(result.resolution.yieldedActorIds, ['incoming']);
  assert.deepEqual(result.contacts, []); assert.throws(() => f.population.actorMotions(), /committed/);
});
test('actor ordering preserves explicit batch decisions and exact component point/interval contracts', () => {
  const f = incomingNativeFixture(); f.population.step(DT, f.occupants);
  const [actor] = f.population.actorMotions(), far = { ...actor, id: 'far', previous: { ...actor.previous, x: 100 }, current: { ...actor.current, x: 99 } },
    proof = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, f.before), owner = proof.owner('owner', f.before, f.neutral, DT, [actor, far]);
  const first = resolvePopulationWholeStepRefusalPreferActorYield([actor, far], [owner]), second = resolvePopulationWholeStepRefusalPreferActorYield([far, actor], [owner]);
  const metadata = (r: typeof first) => ({ batch: r.batch, yielded: r.yieldedActorIds, refused: r.refusedOwnerIds, ownerFractions: r.ownerFractions, reasons: r.refusalReasons, passes: r.passes });
  assert.deepEqual(metadata(first), metadata(second));
  for (let i = 0; i < first.components.length; i += 1) {
    for (const time of [0, .25, .5, .75, 1]) assert.deepEqual(first.components[i].at(time), second.components[i].at(time));
    for (const [lo, hi] of [[0, 1], [.1, .2], [.4, .6]]) assert.equal(first.components[i].intervalEnvelopeMetres(lo, hi), second.components[i].intervalEnvelopeMetres(lo, hi));
  }
});
test('whole-start actor yield never bypasses prospective placement rejection or genuine stationary endpoint intrusion from a clear native start', () => {
  const f = incomingNativeFixture(); f.population.step(DT, f.occupants); const actors = f.population.actorMotions(),
    proof = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, f.before), owner = proof.owner('owner', f.before, f.neutral, DT, actors);
  let queries = 0;
  const placement = resolvePopulationWholeStepRefusalPreferActorYield(actors, [{ ...owner, placementAllowed: () => { queries += 1; return false; } }]);
  assert.ok(queries > 0); assert.deepEqual(placement.refusedOwnerIds, ['owner']); assert.equal(placement.refusalReasons.owner, 'placement');
  const sourceBefore = buildRiderOccupancyEnvelope(f.before, RIDER_OCCUPANCY), sourceEnd = buildRiderOccupancyEnvelope(f.neutral, RIDER_OCCUPANCY),
    face = sourceBefore.human.x + sourceBefore.human.halfWidth + f.growth / 2;
  const authored = incomingPlan(face + actors[0].previous.halfLengthMetres, sourceBefore.human.z),
    stationaryPopulation = new PopulationSimulation({ ...authored, actors: authored.actors.map(actor => ({ ...actor, movement: 'stationary' as const, speedMetresPerSecond: 0 })) }, flat);
  stationaryPopulation.step(DT, f.occupants); const stationary = stationaryPopulation.actorMotions(), stationaryBody = stationary[0].previous;
  const beforeGaps = Object.values(sourceBefore).map(p => gap(part(p), stationaryBody)), afterGaps = Object.values(sourceEnd).map(p => gap(part(p), stationaryBody));
  assert.ok(beforeGaps.every(value => value > .02), `all actual native start parts must be strictly clear: ${beforeGaps}`);
  assert.ok(afterGaps.some(value => value < -.02), `genuine full native endpoint must intrude: ${afterGaps}`);
  assert.equal(stationary[0].previous.x, stationary[0].current.x); assert.equal(stationaryBody.velocityX, 0); assert.equal(stationaryBody.velocityZ, 0);
  assert.equal(stationaryBody.sourceHull?.x, stationaryBody.x, 'actor source transform and outer flat footprint must name the SAME actual stationary body');
  const stationaryOwner = proof.owner('owner', f.before, f.neutral, DT, stationary);
  const blocked = resolvePopulationWholeStepRefusalPreferActorYield(stationary, [stationaryOwner]); assert.deepEqual(blocked.yieldedActorIds, []); assert.deepEqual(blocked.refusedOwnerIds, ['owner']);
  assert.equal(blocked.refusalReasons.owner, 'contact');
  console.log(JSON.stringify({ incomingNative: 'v3-clear-start-stationary-negative', beforeGaps, afterGaps,
    sourceX: stationaryBody.sourceHull?.x, footprintX: stationaryBody.x, refused: blocked.refusedOwnerIds, yielded: blocked.yieldedActorIds }));
});
