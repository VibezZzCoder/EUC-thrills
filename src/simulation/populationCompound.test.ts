/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolvePopulationCompoundMotionBatch, type PopulationCompoundTrajectory } from './populationCompound.ts';
import { physicalPopulationHull, type PopulationFootprint } from './population.ts';

const body = (x: number, z = 0, velocityX = 0, velocityZ = 0, minY = 0, maxY = 2): PopulationFootprint => ({
  x, z, headingY: 0, minY, maxY, halfWidthMetres: .1, halfLengthMetres: .1, velocityX, velocityZ,
});
const linear = (ownerId: string, componentId: string, stopGroupId: string,
  from: PopulationFootprint, to = from): PopulationCompoundTrajectory => ({
  ownerId, componentId, stopGroupId,
  at: (time) => ({ ...from, x: from.x + (to.x - from.x) * time, z: from.z + (to.z - from.z) * time,
    headingY: from.headingY + (to.headingY - from.headingY) * time,
    minY: from.minY + (to.minY - from.minY) * time, maxY: from.maxY + (to.maxY - from.maxY) * time,
    velocityX: from.velocityX + (to.velocityX - from.velocityX) * time,
    velocityZ: from.velocityZ + (to.velocityZ - from.velocityZ) * time }),
  intervalEnvelopeMetres: () => 0,
});

test('a mounted stationary wheel shares a stop with its leaning human, which alone reaches the actor', () => {
  const wheel = linear('rider', 'wheel', 'mounted', body(-5));
  const human = linear('rider', 'human', 'mounted', body(-1, 0, 2), body(1, 0, 2));
  const result = resolvePopulationCompoundMotionBatch([{ id: 'worker', previous: body(0), current: body(0) }], [wheel, human]);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].componentId, 'human');
  assert.ok(result.actorFractions.worker < 1);
  assert.equal(result.componentFractions['rider/wheel'], result.componentFractions['rider/human'], 'mounted parts stop as one body');
});

test('fallen components retain compact independent groups and do not bridge the empty space between wheel and human', () => {
  const result = resolvePopulationCompoundMotionBatch([{ id: 'between', previous: body(0), current: body(0) }], [
    linear('rider', 'wheel', 'fallen-wheel', body(-5)),
    linear('rider', 'human', 'fallen-human', body(5)),
  ]);
  assert.deepEqual(result.hits, []);
  assert.equal(result.actorFractions.between, 1);
});

test('whole-trajectory broadphase skips distant evaluations but still validates their enclosure', () => {
  let calls = 0;
  const far = { ...linear('rider', 'human', 'mounted', body(1000)), at: (time: number) => {
    calls++; return body(1000 + time, 0, 1);
  } };
  const actors = Array.from({ length: 30 }, (_, i) => ({ id: `actor-${i}`, previous: body(i * 4), current: body(i * 4 + .2) }));
  const result = resolvePopulationCompoundMotionBatch(actors, [far]);
  assert.deepEqual(result.hits, []); assert.ok(Object.values(result.actorFractions).every(fraction => fraction === 1));
  assert.equal(calls, 2, 'rejected complete trajectories need only their validated original endpoints');
  assert.throws(() => resolvePopulationCompoundMotionBatch(actors, [{ ...far, intervalEnvelopeMetres: () => NaN }]), /finite and non-negative/);
});

test('a conservative curved enclosure keeps a mid-path hit even when both endpoints are distant', () => {
  const curve: PopulationCompoundTrajectory = { ownerId: 'rider', componentId: 'human', stopGroupId: 'mounted',
    at: time => body(3 * Math.cos(2 * Math.PI * time), 0, -6 * Math.PI * Math.sin(2 * Math.PI * time)),
    intervalEnvelopeMetres: (from, to) => 3 * (2 * Math.PI * (to - from)) ** 2 / 8 };
  const result = resolvePopulationCompoundMotionBatch([{ id: 'worker', previous: body(0), current: body(0) }], [curve]);
  assert.equal(result.hits.length, 1); assert.ok(result.hits[0].timeOfImpact > 0 && result.hits[0].timeOfImpact < .5);
});

test('whole-trajectory rejection retains validation of a distant malformed exact source frame', () => {
  const source = physicalPopulationHull(1000, 0, 0, 0, 0, 1, 0,
    { halfWidthMetres: .3, halfLengthMetres: .3, heightMetres: 1.8 });
  const malformed = { ...source, sourceHull: { ...source.sourceHull!, normalX: 0, normalY: 0, normalZ: 0 } };
  assert.throws(() => resolvePopulationCompoundMotionBatch([
    { id: 'malformed', previous: malformed, current: malformed },
    { id: 'near', previous: body(0), current: body(0) },
  ], []), /upward normal/);
});

test('a later actor re-queries the held fallen human rather than its discarded suffix', () => {
  const fallen = linear('rider', 'human', 'fallen-human', body(0, 0, 4), body(4, 0, 4));
  const actors = [
    { id: 'early', previous: body(-3, 0, 10), current: body(7, 0, 10) },
    { id: 'later', previous: body(1.86, -10, 0, 13), current: body(1.86, 3, 0, 13) },
  ];
  const result = resolvePopulationCompoundMotionBatch(actors, [fallen]);
  assert.deepEqual(result.hits.map(hit => hit.actorId), ['early', 'later']);
  assert.ok(result.hits[1].timeOfImpact > result.hits[0].timeOfImpact);
  assert.equal(result.hits[0].componentVelocityX, 4, 'the first collision reads live motion');
  assert.equal(result.hits[1].componentVelocityX, 0, 'the later hit sees a held body');
  assert.equal(result.hits[1].componentVelocityZ, 0, 'the held suffix has no stale trajectory velocity');
});

test('same-owner actor and component are ignored even when their footprints overlap', () => {
  const result = resolvePopulationCompoundMotionBatch([
    { id: 'rider-wheel', ownerId: 'rider', previous: body(0), current: body(0) },
  ], [linear('rider', 'human', 'mounted', body(0))]);
  assert.deepEqual(result.hits, []);
  assert.equal(result.actorFractions['rider-wheel'], 1);
});

test('simultaneous contacts snapshot pre-stop velocity and retain a stable order', () => {
  const component = linear('rider', 'human', 'mounted', body(0));
  const actors = [
    { id: 'left', previous: body(-3, 0, 6), current: body(3, 0, 6) },
    { id: 'right', previous: body(3, 0, -6), current: body(-3, 0, -6) },
  ];
  const first = resolvePopulationCompoundMotionBatch(actors, [component]);
  const second = resolvePopulationCompoundMotionBatch([...actors].reverse(), [component]);
  assert.deepEqual(first, second);
  assert.equal(first.hits.length, 2);
  assert.deepEqual(first.hits.map(hit => hit.actorId), ['left', 'right']);
  assert.ok(first.hits.every(hit => Math.abs(hit.actorVelocityX) === 6), 'tie records velocities before either stop applies');
});

test('actor-to-actor stops remain in the one chronology without rider charge records', () => {
  const result = resolvePopulationCompoundMotionBatch([
    { id: 'a', previous: body(-2, 0, 4), current: body(2, 0, 4) },
    { id: 'b', previous: body(2, 0, -4), current: body(-2, 0, -4) },
  ], []);
  assert.ok(result.actorFractions.a < 1 && result.actorFractions.b < 1);
  assert.deepEqual(result.hits, []);
});

test('owner-pair output collapses simultaneous subshape contacts to the stable earliest record', () => {
  const parts = [
    linear('rider', 'human', 'mounted', body(0)),
    linear('rider', 'wheel', 'mounted', body(0)),
  ];
  const result = resolvePopulationCompoundMotionBatch([{ id: 'worker', previous: body(-3, 0, 6), current: body(3, 0, 6) }], parts);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].componentId, 'human');
});

test('a proven shrinking interval enclosure catches an interior vertical arc whose endpoints are clear', () => {
  const arc = (bound: (from: number, to: number) => number): PopulationCompoundTrajectory => ({
    ownerId: 'rider', componentId: 'human', stopGroupId: 'fallen-human',
    at: (time) => {
      const floor = 3 - 8 * time * (1 - time);
      return body(0, 0, 0, 0, floor, floor + 1);
    },
    intervalEnvelopeMetres: bound,
  });
  const actor = [{ id: 'worker', previous: body(0, 0, 0, 0, 0, 2), current: body(0, 0, 0, 0, 0, 2) }];
  const exact = resolvePopulationCompoundMotionBatch(actor, [arc((from, to) => 2 * (to - from) ** 2)]);
  assert.equal(exact.hits.length, 1);
  const knownBadUnderbound = resolvePopulationCompoundMotionBatch(actor, [arc(() => 0)]);
  assert.deepEqual(knownBadUnderbound.hits, [], 'negative control: a caller that falsely asserts a linear path misses the interior hit');
});
