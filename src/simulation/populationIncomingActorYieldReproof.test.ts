/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPose, EucController, type EucDynamicWorld, type EucPose } from './EucController.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { POPULATION_OCCUPANT, RIDER_CONTACT } from '../data/tuning.ts';
import { PopulationSimulation } from './population.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { commitPopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import type { PopulationCompoundTrajectory } from './populationCompound.ts';
import { INCOMING_DT as DT, incomingFlat as flat, incomingPose as poseOf, incomingCoarse as coarse, incomingSignedGap as gap,
  incomingNativeFixture, incomingPlan, incomingCrash, warmIncoming } from './populationIncomingActorYieldFixture.ts';

/** Controlled contract stress, NOT another actual rider shape or shipping traffic
 * acceptance. A tiny exact affine test component is exposed after the FIRST
 * actual native replay, forcing a second actor choice. The real human/cop still
 * execute their source native equations, clocks, state and placement journals.
 * Production certificate modules and the two authoritative rider parts are
 * never changed. This forcing component exists solely in this test object. */
function laterYieldStress(reverse: boolean) {
  const f = incomingNativeFixture(), later = incomingPlan(100, 40),
    laterPath = { ...later.paths[0], id: 'later/path' }, laterSpec = { ...later.actors[0], id: 'later', pathId: laterPath.id };
  f.population = new PopulationSimulation({ ...f.plan, paths: [...f.plan.paths, laterPath], actors: [...f.plan.actors, laterSpec] }, flat); warmIncoming(f.population);
  const copOptions = { spawn: { position: { x: -20, y: 0, z: 0 }, headingY: 0 }, tuning: { crashRecoverEarliestSeconds: .001, crashRecoverAutoSeconds: .002 } };
  const cop = new EucController(flat, copOptions), nativeCop = new EucController(flat, copOptions), nativeHuman = incomingCrash();
  for (const value of [cop, nativeCop]) assert.equal(value.hardKnock(3, 0), true);
  const beforeCop = poseOf(cop), copBeforeState = cop.snapshot(), humanBeforeState = f.value.snapshot(), initialSerial = cop.discontinuitySerial, notes: unknown[] = [];
  const port: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null, ragObstacleBodies: () => f.population.snapshot().actors.map(a => a.footprint), canPlace: () => true };
  f.value.setDynamicWorld(port);
  cop.setDynamicWorld({ ...port, didPlace: request => {
    assert.throws(() => f.population.actorMotions(), /committed/, 'NPC epoch must already be sealed when the surviving journal publishes');
    assert.deepEqual(poseOf(f.value), poseOf(nativeHuman), 'human native state is sealed before callback');
    assert.deepEqual(cop.snapshot(), nativeCop.snapshot(), 'cop native state is sealed before callback');
    notes.push({ reason: request.reason, serial: cop.discontinuitySerial, clock: f.population.clockSeconds });
  } });
  f.token = f.value.prepareStep(DT, NEUTRAL_ACTIONS);
  const humanSeat = { id: 'owner', kind: 'human' as const, controller: f.value, pose: createPose(), token: f.token, world: port },
    copSeat = { id: 'cop-0', kind: 'cop' as const, controller: cop, pose: createPose(), token: cop.prepareStep(DT, NEUTRAL_ACTIONS),
      world: { ...port, didPlace: (request: Parameters<NonNullable<EucDynamicWorld['didPlace']>>[0]) => {
        assert.throws(() => f.population.actorMotions(), /committed/); assert.deepEqual(poseOf(f.value), poseOf(nativeHuman));
        assert.deepEqual(cop.snapshot(), nativeCop.snapshot()); notes.push({ reason: request.reason, serial: cop.discontinuitySerial, clock: f.population.clockSeconds });
      } } };
  assert.equal(copSeat.token.placementRequests.filter(request => request.reason === 'recover').length, 1, 'neutral native cop must genuinely recover in this original dt');
  const seats = reverse ? [copSeat, humanSeat] : [humanSeat, copSeat];
  f.population.step(DT, [{ id: 'owner', kind: 'human', previous: coarse(f.before), current: coarse(f.before) },
    { id: 'cop-0', kind: 'cop', previous: coarse(beforeCop), current: coarse(beforeCop) }]);
  const originalActors = f.population.actorMotions(), lastActor = originalActors.find(actor => actor.id === 'later')!,
    travel = lastActor.previous.x - lastActor.current.x, halfSize = .02,
    endX = lastActor.previous.x - lastActor.previous.halfLengthMetres - travel / 2 - halfSize, startX = endX - .1;
  assert.ok(travel > .025, 'second actor must have a real public native candidate, not private velocity injection');
  const forcing: PopulationCompoundTrajectory = { ownerId: 'owner', componentId: 'reproof-test-only', stopGroupId: 'physical',
    at: time => ({ x: startX + (endX - startX) * time, z: lastActor.previous.z, headingY: 0, halfWidthMetres: halfSize,
      halfLengthMetres: halfSize, minY: lastActor.previous.minY, maxY: lastActor.previous.maxY,
      velocityX: (endX - startX) / DT, velocityZ: 0 }), intervalEnvelopeMetres: () => 0 };
  assert.ok(gap(forcing.at(0), lastActor.previous) > .1); assert.ok(gap(forcing.at(1), lastActor.previous) > .01);
  assert.ok(gap(forcing.at(1), lastActor.current) < -.01, 'exact affine forcing path must intersect only the original second-actor suffix');
  const calls: Array<{ owner: string; pass: number; held: string[]; clock: number }> = []; let humanReplays = 0;
  for (const seat of seats) {
    const sourceResolve = seat.controller.resolvePreparedStep.bind(seat.controller);
    seat.controller.resolvePreparedStep = (token, world) => {
      const beforePose = seat.id === 'owner' ? f.before : beforeCop, beforeState = seat.id === 'owner' ? humanBeforeState : copBeforeState;
      assert.deepEqual(poseOf(seat.controller), beforePose, 'each actual source replay starts from the same untouched public pose');
      assert.deepEqual(seat.controller.snapshot(), beforeState, 'no prior replay advances live native clocks/Verlet/state');
      assert.doesNotThrow(() => f.population.actorMotions(), 'shared epoch stays open throughout all native reproofs');
      const queried = world!.ragObstacleBodies!(), held = originalActors.filter((actor, i) => queried[i].x === actor.previous.x && queried[i].z === actor.previous.z).map(actor => actor.id);
      calls.push({ owner: seat.id, pass: Math.floor(calls.length / seats.length) + 1, held, clock: f.population.clockSeconds });
      if (seat.id === 'owner') humanReplays += 1;
      sourceResolve(token, world);
      assert.deepEqual(poseOf(seat.controller), beforePose); assert.deepEqual(seat.controller.snapshot(), beforeState);
      assert.equal(notes.length, 0, 'discarded private replay may not publish its native recovery callback');
    };
  }
  const certificates = new PopulationPhysicalCertificates(RIDER_CONTACT, f.before), sourceOwner = certificates.owner.bind(certificates);
  certificates.owner = (...args) => {
    const owner = sourceOwner(...args);
    if (args[0] !== 'owner' || humanReplays === 0) return owner;
    assert.equal(owner.admitted, true);
    return { ...owner, movingComponents: () => [...owner.movingComponents(), forcing],
      heldComponents: () => [...owner.heldComponents(), { ...forcing, at: () => ({ ...forcing.at(0), velocityX: 0, velocityZ: 0 }) }] };
  };
  nativeHuman.step(DT, NEUTRAL_ACTIONS); nativeCop.step(DT, NEUTRAL_ACTIONS);
  const result = commitPopulationPhysicalTransaction({ population: f.population, certificates, seats, preparedSeats: seats,
    before: new Map<string, { pose: EucPose; serial: number }>([['owner', { pose: f.before, serial: f.value.discontinuitySerial }], ['cop-0', { pose: beforeCop, serial: initialSerial }]]),
    dt: DT, reservations: [], bodyFromPose: coarse, preferActorYieldOwnerIds: ['owner'] });
  assert.equal(result.motionReproofPasses, 2, 'second actor must be discovered AFTER actual first native replay');
  assert.deepEqual(calls.filter(call => call.pass === 1).map(call => call.held), [['incoming'], ['incoming']]);
  assert.deepEqual(calls.filter(call => call.pass === 2).map(call => call.held), [['incoming', 'later'], ['incoming', 'later']]);
  for (const id of ['owner', 'cop-0']) assert.equal(calls.filter(call => call.owner === id).length, 2, 'ALL native humans/cops replay every newly selected actor start');
  assert.ok(calls.every(call => call.clock === calls[0].clock), 'NPC shared clock advances once, not once per replay');
  assert.deepEqual(result.resolution.yieldedActorIds, ['incoming', 'later']); assert.deepEqual(result.resolution.refusedOwnerIds, []);
  assert.deepEqual(poseOf(f.value), poseOf(nativeHuman)); assert.deepEqual(f.value.snapshot(), nativeHuman.snapshot());
  assert.deepEqual(poseOf(cop), poseOf(nativeCop)); assert.deepEqual(cop.snapshot(), nativeCop.snapshot());
  assert.equal(cop.discontinuitySerial, initialSerial + 1); assert.equal(notes.length, 1); assert.equal((notes[0] as { reason: string }).reason, 'recover');
  assert.deepEqual(result.contacts, []); assert.deepEqual(result.contactResponses, []); assert.equal(f.population.snapshot().actors.some(a => a.activity === 'impacted'), false);
  for (const actor of f.population.snapshot().actors) { const original = originalActors.find(a => a.id === actor.id)!;
    assert.equal(actor.x, original.previous.x); assert.equal(actor.z, original.previous.z); assert.equal(result.resolution.batch.actorFractions[actor.id], 0); }
  return { calls, batch: result.resolution.batch, fractions: result.resolution.ownerFractions, notes, human: poseOf(f.value), cop: poseOf(cop), passes: result.motionReproofPasses };
}
test('controlled second-yield contract forces later native replay, preserves all original human/cop dt and discards earlier recovery journals in either seat order', () => {
  const forward = laterYieldStress(false), reversed = laterYieldStress(true);
  assert.deepEqual({ ...forward, calls: undefined }, { ...reversed, calls: undefined }, 'explicit native state, surviving journal and batch decisions cannot depend on seat order');
  console.log(JSON.stringify({ incomingNative: 'v3-controlled-later-yield-contract', passes: forward.passes, calls: forward.calls, reverseCalls: reversed.calls, notes: forward.notes,
    testOnlyComponent: 'reproof-test-only exact affine zero-residual component; not authoritative rider shape or another shipping recovery witness' }));
});
