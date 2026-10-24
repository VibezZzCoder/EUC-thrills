/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * PERF-WHARF exactness for crashes on the Wheelhouse Wharf (2026-10-23). A
 * crashed or airborne owner takes the actor-yield path twice a step (a
 * selection, then its native replay), and that path re-sorted all 122 actors,
 * rebuilt its epoch lists every pass and searched the replay's batch again
 * although it repeats the selection's. `commitPopulationPhysicalTransaction`
 * and `resolvePopulationWholeStepRefusalPreferActorYield` now skip that work.
 *
 * Each claim is pinned side by side against the shipped 1.1.5 text of both
 * functions (`populationPhysicalTransactionReference.test-support.ts`): the
 * production controller rides the real Wharf (prepared as Game installs it)
 * into a moving van and through the market crowd with hops, and a native fall
 * meets an incoming NPC rider that yields and a recovery placement. Every
 * step's whole commit (resolution, batch, hits, components at their ends),
 * rider pose, controller snapshot, population snapshot, actor footprints and
 * reservations must agree by float bits and key order with the reference ride.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createEuclaudeLevel } from '../level/euclaudeLevel.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { POPULATION_OCCUPANT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { createPose, type EucDynamicWorld } from './EucController.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { PopulationContactHarness, HARNESS_DT } from './populationContactHarness.test-support.ts';
import type { PopulationCompoundActorMotion } from './populationCompound.ts';
import { PopulationPhysicalCertificates } from './populationPhysicalCertificates.ts';
import { populationPhysicalReactionAllowed } from './populationPhysicalReactionAdmission.ts';
import { commitPopulationPhysicalTransaction, populationPhysicalBatchCounts, type PopulationPhysicalCommit,
  type PopulationPhysicalTransaction } from './populationPhysicalTransaction.ts';
import { referenceCommitPopulationPhysicalTransaction, referenceResolvePopulationWholeStepRefusalPreferActorYield } from './populationPhysicalTransactionReference.test-support.ts';
import { incomingNativeFixture, incomingCoarse, incomingPose, INCOMING_DT } from './populationIncomingActorYieldFixture.ts';
import { resolvePopulationWholeStepRefusalPreferActorYield, type PopulationPhysicalOwner } from './populationWholeStepRefusal.ts';

type Commit = (input: PopulationPhysicalTransaction) => PopulationPhysicalCommit;
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
/** Float bits, strings, key order and the sign of zero; functions are skipped, components are read at their ends. */
function bits(value: unknown): string {
  const out: string[] = [];
  const walk = (x: unknown): void => {
    if (typeof x === 'number') { f64[0] = x; out.push(`${u32[1].toString(16)}:${u32[0].toString(16)}`); return; }
    if (typeof x === 'string') { out.push(JSON.stringify(x)); return; }
    if (typeof x !== 'object' || x === null) { out.push(String(x)); return; }
    if (x instanceof Map) { out.push('M', String(x.size)); for (const [k, v] of x) { walk(k); walk(v); } return; }
    if (x instanceof Set) { out.push('S', String(x.size)); for (const v of x) walk(v); return; }
    if (ArrayBuffer.isView(x)) { out.push('T'); for (const v of x as unknown as number[]) walk(v); return; }
    if (Array.isArray(x)) { out.push('[', String(x.length)); for (const y of x) walk(y); out.push(']'); return; }
    out.push('{');
    for (const key of Object.keys(x)) {
      const item = (x as Record<string, unknown>)[key];
      if (typeof item === 'function' || key === 'milliseconds') continue;
      out.push(`${key}=`); walk(item);
    }
    const trajectory = x as { at?: unknown; ownerId?: unknown };
    if (typeof trajectory.at === 'function' && typeof trajectory.ownerId === 'string') {
      const at = trajectory.at as (time: number) => unknown; out.push('@'); walk([at(0), at(0.5), at(1)]);
    }
    out.push('}');
  };
  walk(value);
  return createHash('sha1').update(out.join(' ')).digest('hex');
}

const living = preparePopulationWorld(createEuclaudeLevel());
const sampler = new PlanTerrainSampler(living.level);

/** `PopulationContactHarness.step` with the transaction passed in: Game's fixed-step order for one seat. */
function stepWith(harness: PopulationContactHarness, commit: Commit, actions: ActionSnapshot) {
  const inner = harness as unknown as { port(): EucDynamicWorld; epochOpen: boolean }, dt = HARNESS_DT;
  const pose = harness.pose(), body = harness.bodyFromPose(pose), serial = harness.controller.discontinuitySerial;
  inner.epochOpen = true;
  harness.reservations = harness.reservations.filter(value => value.expiresAtClockSeconds === undefined
    || value.expiresAtClockSeconds >= harness.population.clockSeconds);
  harness.population.step(dt, [{ id: harness.id, kind: harness.kind, previous: body, current: body }], harness.reservations);
  const token = harness.controller.prepareStep(dt, actions), prepared = createPose();
  harness.controller.writePreparedPose(token, prepared);
  const seat = { id: harness.id, kind: harness.kind, controller: harness.controller };
  const result = commit({ population: harness.population, certificates: harness.certificates,
    seats: [{ ...seat, pose }], preparedSeats: [{ ...seat, pose: prepared, token, world: inner.port() }],
    before: new Map([[harness.id, { pose, serial }]]), dt, reservations: harness.reservations, contactResponse: 'yield',
    preferActorYieldOwnerIds: harness.controller.crashed || !harness.controller.isGrounded ? [harness.id] : [],
    bodyFromPose: value => harness.bodyFromPose(value) });
  inner.epochOpen = false;
  harness.contacts = result.contacts;
  return { commit: result, held: token.held, impact: harness.controller.obstacleImpact };
}

interface Tally { crashed: number; crashedWithHits: number; preferred: number; contacts: number; held: number }
/** One ride's per-step digests: the reference ride runs first, then the live one replays the same script. */
function ride(commit: Commit, spawn: () => PopulationContactHarness, ticks: number, actions: (tick: number) => ActionSnapshot) {
  const harness = spawn(), digests: string[] = [], tally: Tally = { crashed: 0, crashedWithHits: 0, preferred: 0, contacts: 0, held: 0 };
  for (let tick = 0; tick < ticks; tick += 1) {
    const step = stepWith(harness, commit, actions(tick));
    if (harness.controller.crashed) { tally.crashed += 1; if (step.commit.resolution.batch.hits.length) tally.crashedWithHits += 1; }
    if (step.commit.motionReproofPasses !== undefined) tally.preferred += 1;
    tally.contacts += step.commit.contacts.length; tally.held += step.held ? 1 : 0;
    digests.push(bits([step, harness.pose(), harness.controller.snapshot(), harness.population.snapshot(), harness.population.actorFootprints(),
      harness.reservations]));
  }
  return { digests, tally };
}
function sideBySide(name: string, spawn: () => PopulationContactHarness, ticks: number, actions: (tick: number) => ActionSnapshot) {
  const reference = ride(referenceCommitPopulationPhysicalTransaction, spawn, ticks, actions);
  const before = { ...populationPhysicalBatchCounts };
  const live = ride(commitPopulationPhysicalTransaction, spawn, ticks, actions);
  const reused = populationPhysicalBatchCounts.reused - before.reused, searched = populationPhysicalBatchCounts.searched - before.searched;
  const at = reference.digests.findIndex((digest, index) => digest !== live.digests[index]);
  assert.equal(at, -1, `${name}: the live transaction left the 1.1.5 reference at step ${at}`);
  assert.deepEqual(live.tally, reference.tally);
  console.log(JSON.stringify({ ride: name, ticks, ...live.tally, reused, searched }));
  return { ...live.tally, reused, searched };
}
const spawnOn = (x: number, y: number, z: number, headingY: number) => () =>
  new PopulationContactHarness(living.population, { position: { x, y, z }, headingY }, sampler);

test('a crash into a moving Wharf van commits bit-identically to the 1.1.5 transaction, step for step', () => {
  // The van's place after a 240-step warm-up, as `scratchpad/crash` set it up: 12 m ahead of it, facing it.
  const probe = spawnOn(65, 0.05, 10, 0)();
  for (let tick = 0; tick < 240; tick += 1) probe.step(NEUTRAL_ACTIONS);
  const vans = probe.population.snapshot().actors.filter(actor => living.population.actors.find(spec => spec.id === actor.id)?.kind === 'trafficVehicle');
  const van = vans[0], ahead = { x: Math.sin(van.headingY) * 12, z: Math.cos(van.headingY) * 12 };
  const spawn = spawnOn(van.x + ahead.x, van.y + 0.05, van.z + ahead.z, van.headingY + Math.PI);
  const result = sideBySide('van crash', spawn, 240 + 660, tick => tick < 240 ? NEUTRAL_ACTIONS : { ...NEUTRAL_ACTIONS, throttle: tick < 640 ? 1 : 0 });
  assert.ok(result.crashed > 300 && result.crashedWithHits > 100, `the ride must crash beside actors: ${JSON.stringify(result)}`);
  assert.ok(result.preferred > 300 && result.reused > 200, `the replay's repeated batch must be answered: ${JSON.stringify(result)}`);
  assert.ok(result.searched > result.preferred, 'batches that are no repeat still search');
});

test('the market crowd ridden with hops commits bit-identically to the 1.1.5 transaction', () => {
  const path = living.population.paths.find(value => value.id === 'quay-market-in/clear-0');
  assert.ok(path, 'the Wharf lost its market lane');
  const index = Math.max(1, path.points.findIndex(point => point.distanceMetres >= 200)), a = path.points[index - 1], b = path.points[index];
  const heading = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI;
  const result = sideBySide('market hops', spawnOn(a.x, a.y + 0.05, a.z, heading), 900, tick => {
    const phase = tick % 700;
    return { ...NEUTRAL_ACTIONS, throttle: phase < 380 ? 0.7 : phase < 480 ? 0 : phase < 560 ? -0.4 : 0.3,
      steer: 0.6 * Math.sin(tick * 0.013), hop: tick % 450 === 200 };
  });
  assert.ok(result.preferred > 0, `the ride must leave the ground: ${JSON.stringify(result)}`);
});

test('a native fall with an incoming NPC that yields, and its recovery placement, commit bit-identically to 1.1.5', () => {
  const fall = (commit: Commit) => {
    const f = incomingNativeFixture(), certificates = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, f.before), digests: string[] = [];
    let yields = 0, placements = 0;
    for (let tick = 0; tick < 440 && f.value.crashed; tick += 1) {
      const previous = tick ? incomingPose(f.value) : f.before;
      const port: EucDynamicWorld = { hull: POPULATION_OCCUPANT, resolveMotion: () => null,
        ragObstacleBodies: () => f.population.snapshot().actors.map(actor => actor.footprint),
        canReact: request => populationPhysicalReactionAllowed({ ownerId: 'owner', request, population: f.population, certificates, occupants: [], reservations: [] }),
        canPlace: request => certificates.components('owner', request.occupancyPose, request.occupancyPose, 0, 'placement')
          .every(component => f.population.recoveryClearance(component.at(0), [], []).clear),
        didPlace: () => { placements += 1; } };
      f.value.setDynamicWorld(port);
      f.population.step(INCOMING_DT, [{ id: 'owner', kind: 'human', previous: incomingCoarse(previous), current: incomingCoarse(previous) }]);
      const token = f.value.prepareStep(INCOMING_DT, NEUTRAL_ACTIONS), seat = { id: 'owner', kind: 'human' as const, controller: f.value, pose: createPose(), token, world: port };
      const result = commit({ population: f.population, certificates, seats: [seat], preparedSeats: [seat],
        before: new Map([['owner', { pose: previous, serial: f.value.discontinuitySerial }]]), dt: INCOMING_DT, reservations: [],
        bodyFromPose: incomingCoarse, preferActorYieldOwnerIds: ['owner'], contactResponse: 'yield' });
      yields += (result.resolution.yieldedActorIds ?? []).length;
      digests.push(bits([result, incomingPose(f.value), f.value.snapshot(), f.population.snapshot()]));
    }
    return { digests, yields, placements };
  };
  const reference = fall(referenceCommitPopulationPhysicalTransaction), live = fall(commitPopulationPhysicalTransaction);
  const at = reference.digests.findIndex((digest, index) => digest !== live.digests[index]);
  assert.equal(at, -1, `the fall left the 1.1.5 reference at step ${at}`);
  assert.equal(live.digests.length, reference.digests.length);
  assert.deepEqual({ yields: live.yields, placements: live.placements }, { yields: reference.yields, placements: reference.placements });
  assert.ok(live.yields > 0 && live.placements > 0, `the fall must yield the NPC and recover: ${JSON.stringify({ yields: live.yields, placements: live.placements })}`);
});

test('the actor-yield refusal matches 1.1.5 for unsorted, re-ordered and grouped actors, seeds and refusals, exceptions included', () => {
  const footprint = (x: number, z = 0) => ({ x, z, headingY: 0, halfWidthMetres: 0.3, halfLengthMetres: 0.3, minY: 0, maxY: 2, velocityX: 0, velocityZ: 0 });
  const owner = (ownerId: string, first: number, last: number, extra: Partial<PopulationPhysicalOwner> = {}): PopulationPhysicalOwner => ({ ownerId, admitted: true,
    movingComponents: () => [{ ownerId, componentId: 'wheel', stopGroupId: 'physical', at: time => footprint(first + (last - first) * time), intervalEnvelopeMetres: () => 0 }],
    heldComponents: () => [{ ownerId, componentId: 'wheel', stopGroupId: 'physical', at: () => footprint(first), intervalEnvelopeMetres: () => 0 }], ...extra });
  const walker = (id: string, from: number, to: number, extra: Partial<PopulationCompoundActorMotion> = {}): PopulationCompoundActorMotion =>
    ({ id, previous: footprint(from), current: { ...footprint(to), velocityX: (to - from) * 120 }, ...extra });
  // Two pairs walk into riders (one pair as a stop group), one turns in place, one walks away, one stands.
  const actors: PopulationCompoundActorMotion[] = [
    walker('m-walker', 6, 4.6), walker('b-pair/1', -6, -4.6, { ownerId: 'pair', stopGroupId: 'pair' }), walker('a-pair/2', -7, -5.6, { ownerId: 'pair', stopGroupId: 'pair' }),
    { id: 'z-turner', previous: footprint(2.2), current: { ...footprint(2.2), headingY: 0.4 } }, walker('c-away', 3, 4), walker('k-still', 20, 20),
  ];
  const owners = [owner('rider-b', 3.6, 4.2), owner('rider-a', -3.6, -4.2), owner('rider-c', 2.6, 2.8)];
  const cases: [string, readonly PopulationCompoundActorMotion[], readonly PopulationPhysicalOwner[], ReadonlySet<string> | undefined, ReadonlySet<string> | undefined][] = [
    ['as given', actors, owners, undefined, undefined],
    ['reversed', [...actors].reverse(), owners, undefined, undefined],
    ['as given again', actors, owners, undefined, undefined],
    ['eligible one owner', actors, owners, new Set(), new Set(['rider-a'])],
    ['seeded', actors, owners, new Set(['k-still']), undefined],
    ['refusing placement', actors, [...owners, owner('rider-d', 19.5, 19.6, { placementAllowed: () => false })], undefined, undefined],
    ['conditioning hold', actors, [owner('rider-e', 5.5, 5, { requiresConditioningHold: true }), ...owners], undefined, undefined],
    ['sorted', [...actors].sort((a, b) => a.id.localeCompare(b.id)), owners, undefined, undefined],
  ];
  let yielded = 0;
  for (const [name, list, ownerList, seed, eligible] of cases) {
    const reference = referenceResolvePopulationWholeStepRefusalPreferActorYield(list, ownerList, seed, eligible, new Map());
    const live = resolvePopulationWholeStepRefusalPreferActorYield(list, ownerList, seed, eligible, new Map());
    assert.equal(bits(live), bits(reference), name);
    yielded += live.yieldedActorIds.length;
  }
  assert.ok(yielded >= 6, `the cases must yield actors, a stop group included: ${yielded}`);
  // Exceptions: an unknown seed, duplicate actor ids and duplicate owners throw the same errors.
  const thrown = (run: () => unknown) => { try { run(); return 'returned'; } catch (error) { return `${(error as Error).constructor.name}: ${(error as Error).message}`; } };
  for (const [name, list, ownerList, seed] of [['unknown seed', actors, owners, new Set(['nobody'])], ['duplicate actor', [...actors, walker('m-walker', 9, 9)], owners, undefined],
    ['duplicate owner', actors, [...owners, owner('rider-a', 30, 31)], undefined]] as const) {
    const reference = thrown(() => referenceResolvePopulationWholeStepRefusalPreferActorYield(list, ownerList, seed, undefined, new Map()));
    assert.notEqual(reference, 'returned', name);
    assert.equal(thrown(() => resolvePopulationWholeStepRefusalPreferActorYield(list, ownerList, seed, undefined, new Map())), reference, name);
  }
  // Negative controls: the digest sees one ulp, key order and the sign of zero.
  const sample = footprint(1.25);
  assert.notEqual(bits({ ...sample, x: 1.2500000000000002 }), bits(sample));
  const { x, ...rest } = sample;
  assert.notEqual(bits({ ...rest, x }), bits(sample), 'key order counts');
  assert.notEqual(bits({ ...sample, velocityX: -0 }), bits(sample), '-0 counts');
});
