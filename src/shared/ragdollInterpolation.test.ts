/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { createPose, lerpPose } from '../simulation/EucController.ts';
import { CrashRagdoll, defaultRagdollTuning } from '../simulation/ragdoll.ts';
import { compileTightRagHumanTemplate } from './compiledOccupancy.ts';
import { boundRagFrameRanges } from './ragFrameRanges.ts';
import { buildRagHumanTemplateDAG } from './ragHumanTemplate.ts';
import { RagQuaternionFields } from './ragQuaternionFields.ts';
import { buildRiderOccupancyEnvelope, createRiderOccupancyTrajectory, interpolateRiderOccupancyPose } from './riderOccupancy.ts';

function active() {
  const p = createPose(), body = new CrashRagdoll();
  body.seed({ x: 4, y: .4, z: 9, headingY: .5, rollAngle: .2, riderPitch: .1, hipDrop: .15,
    speed: 8, cause: 'sideFall', intoSolid: false, side: -1 }, defaultRagdollTuning(), 1 / 120);
  p.x = 4; p.y = .4; p.z = 9; p.headingY = .5; p.ragdollBlend = .3; p.crashBlend = .2; p.ragdoll.set(body.positions);
  return p;
}
const BOUNDS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const;

test('entry and recovery share one particle authority across draw, concrete, compiled and quaternion paths', () => {
  const template = compileTightRagHumanTemplate(RIDER_OCCUPANCY, createPose()), actual = template.createSlot(), expected = template.createSlot();
  for (const poisoned of [new Float32Array(33), new Float32Array(33).fill(-1000), new Float32Array(33).fill(NaN), new Float32Array(2)]) {
    for (const recovery of [false, true]) {
      const live = active(), inactive = createPose(); inactive.ragdoll = poisoned;
      const first = recovery ? live : inactive, last = recovery ? inactive : live;
      const safeInactive = { ...inactive, ragdoll: live.ragdoll }, safeFirst = recovery ? live : safeInactive, safeLast = recovery ? safeInactive : live;
      const input = { previous: first, current: last, coefficients: RIDER_OCCUPANCY }, safeInput = { previous: safeFirst, current: safeLast, coefficients: RIDER_OCCUPANCY };
      assert.doesNotThrow(() => buildRagHumanTemplateDAG(input));
      assert.deepEqual(boundRagFrameRanges(input), boundRagFrameRanges(safeInput));
      const fields = new RagQuaternionFields(input), safeFields = new RagQuaternionFields(safeInput);
      actual.load(first, last); expected.load(safeFirst, safeLast);
      const trajectory = createRiderOccupancyTrajectory(first, last, RIDER_OCCUPANCY);
      for (const alpha of [0, .01, .5, .99, 1]) {
        const draw = createPose(); lerpPose(first, last, alpha, draw);
        const concrete = interpolateRiderOccupancyPose(first, last, alpha);
        if (draw.ragdollBlend > 0) assert.deepEqual(Array.from(draw.ragdoll), Array.from(concrete.ragdoll));
        assert.deepEqual(Array.from(trajectory.poseAt(alpha).ragdoll), Array.from(live.ragdoll));
        for (const kind of ['frame', 'root'] as const) for (let index = 0; index < 4; index += 1)
          assert.deepEqual(fields.range(kind, index, alpha, alpha), safeFields.range(kind, index, alpha, alpha));
        const point = actual.at(alpha), control = expected.at(alpha), native = buildRiderOccupancyEnvelope(concrete, RIDER_OCCUPANCY).human;
        for (const key of BOUNDS) {
          assert.ok(Math.abs(point[key] - control[key]) < 1e-7, 'an inactive block changed the compiled body');
          assert.ok(key.startsWith('min') ? point[key] <= native[key] + 1e-7 : point[key] >= native[key] - 1e-7, 'the compiled body contains the drawn/concrete handover');
        }
      }
      assert.equal(actual.intervalEnvelopeMetres(0, 1), expected.intervalEnvelopeMetres(0, 1));
    }
  }
});

test('both active endpoints retain the previous numerical interpolation', () => {
  const first = active(), last = active(); last.ragdollBlend = .7;
  for (let index = 0; index < last.ragdoll.length; index += 1) last.ragdoll[index] += (index % 3 - 1) * .04;
  for (const alpha of [.01, .5, .99]) {
    const draw = createPose(); lerpPose(first, last, alpha, draw);
    const old = Float32Array.from(first.ragdoll, (value, index) => value + (last.ragdoll[index] - value) * alpha);
    assert.deepEqual(draw.ragdoll, old);
    const concrete = interpolateRiderOccupancyPose(first, last, alpha);
    assert.deepEqual(Array.from(concrete.ragdoll), Array.from(first.ragdoll, (value, index) => value + (last.ragdoll[index] - value) * alpha));
  }
});
