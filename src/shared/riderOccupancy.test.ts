/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import { buildRiderOccupancy, createRiderOccupancyTrajectory, interpolateRiderOccupancyPose,
  type RiderOccupancyPrism } from './riderOccupancy.ts';

const bounds = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'x', 'y', 'z'] as const;
const finite = (p: RiderOccupancyPrism): void => { assert.ok(bounds.every((key) => Number.isFinite(p[key]))); };

function fallenPose(z: number) {
  const pose = createPose(); pose.ragdollBlend = 1; pose.crashBlend = 1;
  const h = RIDER_OCCUPANCY.hipHeight, a = RIDER_OCCUPANCY.stance;
  const particles = [[0, h, z], [0, h + a.torsoLength, z], [0, h + a.torsoLength + 0.20, z],
    [a.torsoWidth * 0.26, h, z], [-a.torsoWidth * 0.26, h, z],
    [a.shoulderHalfWidth, h + a.torsoLength, z], [-a.shoulderHalfWidth, h + a.torsoLength, z],
    [0.30, 0.85, z + 0.1], [-0.30, 0.85, z + 0.1], [0.18, 0.22, z - 0.1], [-0.18, 0.22, z - 0.1]];
  pose.ragdoll.set(particles.flat()); return pose;
}

test('mounted occupancy ignores inactive ragdoll buffers and does not mutate the pose', () => {
  const pose = createPose(), baseline = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
  pose.ragdoll.fill(Number.NaN);
  const scalars = { ...pose }, ragdoll = pose.ragdoll.slice();
  assert.deepEqual(buildRiderOccupancy(pose, RIDER_OCCUPANCY), baseline);
  assert.deepEqual(pose, scalars); assert.deepEqual(pose.ragdoll, ragdoll);
  finite(baseline.wheel); finite(baseline.human);
  assert.ok(baseline.human.halfWidth < 0.9, 'a standing rider keeps a compact common prism');
  assert.ok(baseline.wheel.halfWidth < 0.4 && baseline.wheel.halfLength < 0.4);
});

test('world centres rotate the signed heading-frame offsets exactly once', () => {
  const pose = createPose(); pose.rollAngle = 0.5; pose.riderRoll = 0.7;
  const local = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
  pose.x = 17; pose.y = 3; pose.z = -12; pose.headingY = Math.PI / 2;
  const world = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
  for (const component of ['wheel', 'human'] as const) {
    const a = local[component], b = world[component];
    for (const key of ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const) assert.equal(a[key], b[key]);
    assert.ok(Math.abs(b.x - (17 + a.centreZ)) < 1e-12);
    assert.ok(Math.abs(b.z - (-12 - a.centreX)) < 1e-12);
    assert.equal(b.baseY, 3 + b.minY); assert.equal(b.topY, 3 + b.maxY);
  }
});

test('wheel and fallen human retain independent compact centres across a 32 metre separation', () => {
  const pose = fallenPose(-32), result = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
  finite(result.wheel); finite(result.human);
  assert.ok(Math.abs(result.wheel.z) < 0.1 && result.wheel.halfLength < 0.4);
  assert.ok(result.human.z < -31 && result.human.halfLength < 1.5);
  assert.ok(result.wheel.z - result.wheel.halfLength > -1 && result.human.z + result.human.halfLength < -30,
    'clear space between the human and wheel is absent from both components');
});

test('continuous descriptor detaches buffers and rebuilds nonlinear bank articulation', () => {
  const from = createPose(), to = createPose();
  from.headingY = 3.12; to.headingY = 3.20;
  from.rollAngle = -0.6; from.riderRoll = -0.8;
  to.rollAngle = 0.6; to.riderRoll = 0.8; to.x = 0.5; to.groundPitch = 0.15;
  const trajectory = createRiderOccupancyTrajectory(from, to, RIDER_OCCUPANCY), middle = trajectory.at(0.5);
  const direct = buildRiderOccupancy(interpolateRiderOccupancyPose(from, to, 0.5), RIDER_OCCUPANCY);
  assert.deepEqual(middle, direct);
  assert.equal(middle.human.headingY, 3.16);
  assert.ok(trajectory.recommendedSubsteps > 1);
  assert.ok(middle.human.halfWidth < (trajectory.from.human.halfWidth + trajectory.to.human.halfWidth) / 2,
    'upright intermediate geometry is rebuilt, not the average of two bank boxes');
  from.ragdoll.fill(1000); to.ragdoll.fill(-1000); from.rollAngle = 2; to.x = 500;
  assert.deepEqual(trajectory.at(0.5), middle);
  assert.deepEqual(trajectory.at(0), trajectory.from); assert.deepEqual(trajectory.at(1), trajectory.to);
});

test('partial ragdoll handover follows the blended root without occupying the future fallen endpoint', () => {
  const pose = fallenPose(-8); pose.ragdollBlend = 0.1;
  const result = buildRiderOccupancy(pose, RIDER_OCCUPANCY);
  assert.ok(result.human.z > -2, 'the root follows the ten-percent handover');
  assert.ok(result.human.minZ > -4, 'raw future particle space is not unioned at a tiny blend');
  pose.ragdollBlend = 1;
  assert.ok(buildRiderOccupancy(pose, RIDER_OCCUPANCY).human.z < -7);
});

test('active ragdoll occupancy requires the complete particle contract', () => {
  const pose = { ...createPose(), ragdollBlend: 1, ragdoll: new Float32Array(3) };
  assert.throws(() => buildRiderOccupancy(pose, RIDER_OCCUPANCY), /eleven world-space/);
});
