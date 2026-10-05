/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Controller-owned whole-step refusal and exact physical/history restoration. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EucController, createPose, type EucDynamicWorld, type EucPreparedStep } from './EucController.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundTrajectory } from './populationCompound.ts';
import type { PopulationFootprint } from './population.ts';
import type { TerrainSampler } from './world.ts';

const DT = 1 / 120;
const flat: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};
const world: EucDynamicWorld = {
  hull: { halfWidthMetres: .1, halfLengthMetres: .1, heightMetres: 2 },
  resolveMotion: () => null,
};
const poseOf = (controller: EucController) => {
  const pose = createPose(); controller.writePose(pose); return pose;
};
const actions = (values: Partial<ActionSnapshot> = {}): ActionSnapshot => ({ ...NEUTRAL_ACTIONS, ...values });
function controller(x = 0, tuning = {}) {
  return new EucController(flat, { spawn: { position: { x, y: 0, z: 0 }, headingY: 0 },
    dynamicWorld: world, tuning });
}
function commitHold(euc: EucController, token: EucPreparedStep): void {
  euc.holdPreparedStep(token); euc.commitPreparedStep(token, false); euc.publishPreparedPlacements(token);
}

test('whole-step hold restores physical pose and clocks without live queries or fractional replay', () => {
  let queries = 0, placements = 0;
  const euc = controller(); euc.reset(undefined, 12);
  euc.setDynamicWorld({ ...world, resolveMotion() { queries += 1; return null; },
    didPlace() { placements += 1; } });
  const before = euc.snapshot(), beforePose = poseOf(euc);
  const token = euc.prepareStep(DT, actions({ throttle: 1, steer: .8, crouch: true }));
  const candidate = createPose(); euc.writePreparedPose(token, candidate);
  assert.notDeepEqual(candidate, beforePose, 'fixture needs a real discarded movement/pose change');
  assert.equal(token.ready, false); assert.equal(token.held, false);
  euc.holdPreparedStep(token); euc.holdPreparedStep(token);
  assert.equal(token.ready, true); assert.equal(token.held, true);
  assert.equal(token.dynamicMotionIntent, null);
  assert.deepEqual(token.resolvedMotionRequests, []);
  assert.deepEqual(token.resolvedPlacementRequests, []);
  const held = createPose(); euc.writePreparedPose(token, held);
  assert.deepEqual(held, beforePose, 'held geometry must be the exact untouched start');
  assert.deepEqual(euc.snapshot(), before, 'the private hold cannot publish live state');
  assert.throws(() => euc.resolvePreparedStep(token, world), /held/);
  euc.commitPreparedStep(token, false); euc.publishPreparedPlacements(token);
  assert.deepEqual(euc.snapshot(), before);
  assert.deepEqual(poseOf(euc), beforePose);
  assert.equal(queries, 0); assert.equal(placements, 0);
  assert.throws(() => euc.publishPreparedPlacements(token), /already published/);
});

test('a held replay drops its provisional impact and never turns a discarded suffix into a crash', () => {
  const euc = controller(); euc.reset(undefined, 12);
  const before = euc.snapshot(), beforePose = poseOf(euc);
  const token = euc.prepareStep(DT, actions({ throttle: 1 }));
  euc.resolvePreparedStep(token, { ...world, resolveMotion: request => request.kind === 'move'
    ? { allowedMoveFraction: 0, normalX: 0, normalZ: -1,
      closingSpeedMetresPerSecond: 100, chargeImpact: true } : null });
  const impactCandidate = createPose(); euc.writePreparedPose(token, impactCandidate);
  assert.ok(impactCandidate.ragdollBlend > 0 || impactCandidate.crashBlend > 0
    || impactCandidate.ragdoll.some(value => value !== 0), 'replay must really enter the crash funnel');
  commitHold(euc, token);
  assert.deepEqual(euc.snapshot(), before); assert.deepEqual(poseOf(euc), beforePose);
  assert.equal(euc.crashed, false); assert.equal(euc.obstacleImpact, 0);
  euc.step(DT, NEUTRAL_ACTIONS);
  assert.equal(euc.crashed, false); assert.equal(euc.obstacleImpact, 0,
    'the next tick cannot resurrect a held provisional impact');
});

test('whole-step hold cancels accepted recovery notifications and serial changes before publication', () => {
  const notes: string[] = [];
  const euc = controller(0, { crashRecoverEarliestSeconds: .01, crashRecoverAutoSeconds: .02 });
  euc.setDynamicWorld({ ...world, canPlace: () => true,
    didPlace: request => { notes.push(request.reason); } });
  assert.equal(euc.hardKnock(8, 0), true);
  const before = euc.snapshot(), beforePose = poseOf(euc), serial = euc.discontinuitySerial;
  const token = euc.prepareStep(.03, NEUTRAL_ACTIONS);
  assert.ok(token.placementRequests.some(value => value.reason === 'recover'), 'fixture must attempt recovery');
  euc.resolvePreparedStep(token, { ...world, canPlace: () => true,
    didPlace: request => { notes.push(request.reason); } });
  assert.equal(token.discontinuitySerial, serial + 1, 'private replay must accept a provisional recovery');
  assert.equal(notes.length, 0, 'prepared notification is still private');
  commitHold(euc, token);
  assert.deepEqual(euc.snapshot(), before); assert.deepEqual(poseOf(euc), beforePose);
  assert.equal(euc.discontinuitySerial, serial); assert.deepEqual(notes, []);
});

test('a held token retains durable placement retry state without reporting its discarded recovery as accepted', () => {
  let allow = false;
  const notes: string[] = [];
  const euc = controller(0, { crashRecoverEarliestSeconds: .01, crashRecoverAutoSeconds: .02 });
  euc.setDynamicWorld({ ...world, canPlace: () => allow,
    didPlace: request => { notes.push(request.reason); } });
  assert.equal(euc.hardKnock(8, 0), true);
  euc.step(.03, NEUTRAL_ACTIONS);
  assert.equal(euc.placementBlocked, true, 'fixture must retain a refused live recovery');
  const before = euc.snapshot(), beforePose = poseOf(euc), serial = euc.discontinuitySerial;
  allow = true;
  const token = euc.prepareStep(.03, NEUTRAL_ACTIONS);
  assert.equal(token.placementBlocked, false, 'neutral provisional recovery clears its private retry flag');
  assert.equal(token.discontinuitySerial, serial + 1);
  commitHold(euc, token);
  assert.equal(token.held, true); assert.equal(token.placementBlocked, true);
  assert.equal(euc.placementBlocked, true, 'the start retry remains durable, rather than becoming a new hold event');
  assert.equal(euc.discontinuitySerial, serial); assert.deepEqual(notes, []);
  assert.deepEqual(euc.snapshot(), before); assert.deepEqual(poseOf(euc), beforePose);
  euc.step(.03, NEUTRAL_ACTIONS);
  assert.equal(euc.crashed, false); assert.equal(euc.placementBlocked, false);
  assert.equal(euc.discontinuitySerial, serial + 1); assert.deepEqual(notes, ['recover']);
});

test('held active rag preserves both world particles and Verlet history for the next clear tick', () => {
  const held = controller(0, { crashRecoverEarliestSeconds: 99, crashRecoverAutoSeconds: 99 });
  const untouched = controller(0, { crashRecoverEarliestSeconds: 99, crashRecoverAutoSeconds: 99 });
  for (const value of [held, untouched]) {
    value.reset(undefined, 14); assert.equal(value.hardKnock(8, 1), true);
    for (let index = 0; index < 8; index += 1) value.step(DT, NEUTRAL_ACTIONS);
  }
  const before = poseOf(untouched);
  assert.ok(before.ragdollBlend > 0, 'fixture must have active rag physical state');
  const token = held.prepareStep(.12, actions({ throttle: 1, steer: 1 }));
  commitHold(held, token);
  assert.deepEqual(poseOf(held), before); assert.deepEqual(held.snapshot(), untouched.snapshot());
  held.step(DT, NEUTRAL_ACTIONS); untouched.step(DT, NEUTRAL_ACTIONS);
  assert.deepEqual(poseOf(held), poseOf(untouched), 'matching resumed particles proves no discarded Verlet history');
  assert.deepEqual(held.snapshot(), untouched.snapshot(), 'crash and recovery clocks resume from the held start');
});

test('a prior tick hop edge cannot be republished by an exact physical hold', () => {
  const euc = controller();
  for (let tick = 0; tick <= Math.ceil(euc.tuning.hopChargeSeconds / DT); tick += 1) {
    euc.step(DT, actions({ crouch: true }));
  }
  const launchBudget = Math.ceil(euc.tuning.hopCompressSeconds / DT) + 2;
  for (let tick = 0; tick <= launchBudget && !euc.tookOff; tick += 1) {
    euc.step(DT, tick === 0 ? actions({ hop: true }) : NEUTRAL_ACTIONS);
  }
  assert.equal(euc.tookOff, true); assert.equal(euc.hopped, true);
  assert.equal(euc.lastHopCharge, 1, 'fixture must reach the charged native launch after its compression dwell');
  const beforePose = poseOf(euc), before = euc.snapshot(), flight = euc.flightIndex;
  const token = euc.prepareStep(DT, NEUTRAL_ACTIONS); commitHold(euc, token);
  assert.deepEqual(poseOf(euc), beforePose); assert.deepEqual(euc.snapshot(), before);
  assert.equal(euc.flightIndex, flight); assert.equal(euc.tookOff, false);
  assert.equal(euc.hopped, false); assert.equal(euc.touchedDown, false);
});

test('a prior accepted impact is not replayed while its physical crash pose is held', () => {
  const euc = controller(); euc.reset(undefined, 12);
  euc.setDynamicWorld({ ...world, resolveMotion: request => request.kind === 'move'
    ? { allowedMoveFraction: 0, normalX: 0, normalZ: -1,
      closingSpeedMetresPerSecond: 100, chargeImpact: true } : null });
  euc.step(DT, NEUTRAL_ACTIONS);
  assert.ok(euc.obstacleImpact > 0, 'fixture must really accept a prior impact');
  const beforePose = poseOf(euc), before = euc.snapshot();
  const token = euc.prepareStep(DT, NEUTRAL_ACTIONS); commitHold(euc, token);
  assert.deepEqual(poseOf(euc), beforePose, 'clearing an old event must not alter physical geometry');
  assert.deepEqual(euc.snapshot(), { ...before, collisionImpact: 0 });
  assert.equal(euc.obstacleImpact, 0, 'the old accepted event must not fire twice');
});

test('the hold API preserves prepared-token ownership and stale/consumed refusal', () => {
  const first = controller(), other = controller();
  const foreign = first.prepareStep(DT, NEUTRAL_ACTIONS);
  assert.throws(() => other.holdPreparedStep(foreign), /foreign/);
  first.setTuning({ wallScrubDecel: first.tuning.wallScrubDecel });
  assert.throws(() => first.holdPreparedStep(foreign), /stale/);
  const consumed = first.prepareStep(DT, NEUTRAL_ACTIONS); commitHold(first, consumed);
  assert.throws(() => first.holdPreparedStep(consumed), /committed/);
});

test('clear-world prepared steps retain exact direct-step behavior across channels and crash recovery', () => {
  const recovery = { crashRecoverEarliestSeconds: .1, crashRecoverAutoSeconds: .16 };
  const prepared = controller(0, recovery), direct = controller(0, recovery);
  let sawCrash = false, sawRecovery = false;
  for (const value of [prepared, direct]) value.reset(undefined, 10);
  for (let index = 0; index < 80; index += 1) {
    if (index === 30) for (const value of [prepared, direct]) value.hardKnock(7, 1);
    const input = actions({ throttle: index % 9 < 5 ? 1 : -.5, steer: Math.sin(index * .17),
      crouch: index % 7 === 0, hop: index === 2 });
    direct.step(DT, input);
    const token = prepared.prepareStep(DT, input); prepared.resolvePreparedStep(token, world);
    assert.equal(token.held, false); prepared.commitPreparedStep(token, false); prepared.publishPreparedPlacements(token);
    assert.deepEqual(poseOf(prepared), poseOf(direct), `clear pose differs at tick ${index}`);
    assert.deepEqual(prepared.snapshot(), direct.snapshot(), `clear state differs at tick ${index}`);
    if (prepared.crashed) sawCrash = true;
    if (sawCrash && !prepared.crashed) sawRecovery = true;
  }
  assert.equal(sawCrash, true, 'fixture must exercise a crash');
  assert.equal(sawRecovery, true, 'fixture must exercise accepted recovery');
});

const body = (x: number, z = 0, velocityX = 0): PopulationFootprint => ({ x, z, headingY: 0,
  halfWidthMetres: .1, halfLengthMetres: .1, minY: 0, maxY: 2, velocityX, velocityZ: 0 });
/** Pure proof of the monotone refusal algorithm; production descriptors use certified AST fields. */
function settledOrder(order: readonly string[]) {
  const controls = new Map([['early', controller(1)], ['late', controller(3)]]);
  const starts = new Map([...controls].map(([id, value]) => [id, poseOf(value)]));
  const tokens = new Map([...controls].map(([id, value]) => [id, value.prepareStep(DT, NEUTRAL_ACTIONS)]));
  const actor = [{ id: 'npc', previous: body(0, 0, 480), current: body(4, 0, 480) }];
  const refused = new Set<string>(); let passes = 0;
  const descriptor = (id: string): PopulationCompoundTrajectory => {
    const motion = tokens.get(id)!.dynamicMotionIntent!;
    const first = { ...motion.previous }, last = { ...motion.proposed }, held = refused.has(id);
    return { ownerId: id, componentId: 'wheel', stopGroupId: 'mounted',
      at: time => held ? { ...first, velocityX: 0, velocityZ: 0 }
        : { ...first, x: first.x + (last.x - first.x) * time,
          z: first.z + (last.z - first.z) * time,
          minY: first.minY + (last.minY - first.minY) * time,
          maxY: first.maxY + (last.maxY - first.maxY) * time,
          headingY: first.headingY + (last.headingY - first.headingY) * time },
      intervalEnvelopeMetres: () => 0 };
  };
  let batch = resolvePopulationCompoundMotionBatch(actor, order.map(descriptor));
  while (true) {
    passes += 1;
    const additions = batch.hits.map(value => value.ownerId).filter(id => !refused.has(id));
    if (additions.length === 0) break;
    for (const id of additions) refused.add(id);
    assert.ok(passes <= controls.size, 'every continuing pass must add a previously unrefused owner');
    batch = resolvePopulationCompoundMotionBatch(actor, order.map(descriptor));
  }
  assert.ok(passes <= controls.size + 1, 'one final stable pass is bounded by owner count');
  for (const id of order) {
    const value = controls.get(id)!, token = tokens.get(id)!;
    if (refused.has(id)) value.holdPreparedStep(token); else value.resolvePreparedStep(token, world);
  }
  for (const id of order) controls.get(id)!.commitPreparedStep(tokens.get(id)!, false);
  for (const id of order) controls.get(id)!.publishPreparedPlacements(tokens.get(id)!);
  assert.deepEqual(poseOf(controls.get('early')!), starts.get('early'));
  assert.equal(controls.get('late')!.crashed, false); assert.equal(controls.get('late')!.obstacleImpact, 0);
  return { refused: [...refused].sort(), passes, batch,
    poses: ['early', 'late'].map(id => poseOf(controls.get(id)!)),
    states: ['early', 'late'].map(id => controls.get(id)!.snapshot()) };
}

test('monotone whole-step refusal reruns chronology from starts and is independent of owner order', () => {
  const settled = settledOrder(['early', 'late']);
  assert.deepEqual(settled.refused, ['early']);
  assert.deepEqual(settled.batch.hits.map(value => value.ownerId), ['early'],
    'an actor held at the start-shape hit cannot charge the discarded late suffix');
  assert.equal(settled.batch.hits[0].componentVelocityX, 0);
  assert.ok(settled.batch.actorFractions.npc < .21);
  assert.deepEqual(settledOrder(['late', 'early']), settled);
});
