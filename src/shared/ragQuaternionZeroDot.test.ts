/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { RagQuaternionFields } from './ragQuaternionFields.ts';
import { boundRagFrameRanges } from './ragFrameRanges.ts';
import { buildRiderOccupancyEnvelope, interpolateRiderOccupancyPose, type RiderOccupancyPose } from './riderOccupancy.ts';
import { PopulationPhysicalCertificates } from '../simulation/populationPhysicalCertificates.ts';
import { zeroDotPose } from './ragQuaternionZeroDotFixture.ts';
const actor = { x: 0, z: 0, headingY: 0, halfWidthMetres: 10, halfLengthMetres: 10, minY: -10, maxY: 10, velocityX: 0, velocityZ: 0 };
const continuous = (before: RiderOccupancyPose, after: RiderOccupancyPose) => new RagQuaternionFields({ previous: before, current: after, coefficients: RIDER_OCCUPANCY });

// 2026-10-04 (R2C-1/CR-1): the owner verdict this pinned is retired. A rag's
// moving human is now the straight sweep between its exact ends, which needs
// no frame certificate, so this discontinuity no longer holds a falling body.
test('native exact-zero partial slerp across opposite basis branches is physically discontinuous; the owner no longer holds it for conditioning', () => {
  const before = zeroDotPose(-.01), after = zeroDotPose(.01), input = { previous: before, current: after, coefficients: RIDER_OCCUPANCY }, frame = boundRagFrameRanges(input), fields = continuous(before, after);
  assert.equal(frame.normalizedFrameCertified, true); assert.ok(frame.quaternionBranches.length >= 2);
  for (const branch of frame.quaternionBranches) assert.ok(branch[3].lo === 0 && branch[3].hi === 0, 'identity mounted quaternion has exact zero dot with EVERY native branch, including signed zero');
  assert.equal(fields.rotationChartsCertified, true, 'root w and frame y/z remain nonzero, so charts alone miss this physical source tie');
  assert.equal(fields.continuousRotationFieldsCertified, false);
  const left = .5 - 1e-6, right = .5 + 1e-6;
  assert.ok(Math.abs(fields.range('root', 1, left, left).lo - fields.range('root', 1, right, right).lo) > .9, 'native shortest-arc tie preserves physically opposite partial roots');
  const a = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, left), RIDER_OCCUPANCY).human,
    b = buildRiderOccupancyEnvelope(interpolateRiderOccupancyPose(before, after, right), RIDER_OCCUPANCY).human;
  assert.ok(Math.max(Math.abs(a.minX - b.minX), Math.abs(a.maxX - b.maxX)) > .1, 'authoritative native physical body, not only representative quaternion, must jump');
  const owner = new PopulationPhysicalCertificates(RIDER_OCCUPANCY, before).owner('exact-zero-tie', before, after, 1 / 120,
    [{ id: 'actual-blocker', previous: actor, current: actor }]);
  assert.equal(owner.admitted, true); assert.equal(owner.requiresConditioningHold, false);
  console.log(JSON.stringify({ diagnostic: 'native-exact-zero-basis-tie-v8', branchCount: frame.quaternionBranches.length, rootBefore: [0, 1, 2, 3].map(i => fields.range('root', i, left, left).lo),
    rootAfter: [0, 1, 2, 3].map(i => fields.range('root', i, right, right).lo), humanBefore: { minX: a.minX, maxX: a.maxX }, humanAfter: { minX: b.minX, maxX: b.maxX } }));
});

test('single stable exact-zero basis tie remains eligible; full-rag opposite representatives are the same continuous physical frame', () => {
  const fixed = zeroDotPose(.01); assert.equal(continuous(fixed, fixed).continuousRotationFieldsCertified, true, 'no basis branch switch exists in a stationary native exact-zero source tie');
  const before = zeroDotPose(-.01, 1), after = zeroDotPose(.01, 1), fields = continuous(before, after);
  assert.equal(fields.rotationChartsCertified, true); assert.equal(fields.continuousRotationFieldsCertified, true, 'full source q/-q rotation needs no partial slerp exception');
  for (let i = 0; i < 4; i += 1) {
    const range = fields.range('root', i, .5 - 1e-6, .5 + 1e-6); assert.ok(range.hi - range.lo < 1e-5);
  }
});
