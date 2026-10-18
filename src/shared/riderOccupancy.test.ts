/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DRUNK_STYLE, SOBER_STYLE } from '../data/rideStyles.ts';
import { RIDER_CONTACT, RIDER_OCCUPANCY } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EucController, createPose } from '../simulation/EucController.ts';
import type { TerrainSampler } from '../simulation/world.ts';
import { buildRiderOccupancy, buildRiderOccupancyEnvelope, buildRiderWheelOccupancy, createRiderOccupancyTrajectory,
  interpolateRiderOccupancyPose, type RiderOccupancyPose, type RiderOccupancyPrism } from './riderOccupancy.ts';

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

// ---------------------------------------------------------------------------
// The wheel-only build (perf-actions 2026-10-17, item "controller" A). Three
// side-contact consumers read only the wheel prism; `buildRiderWheelOccupancy`
// runs only the wheel's statements, so it must be bit-identical to both full
// builds' `.wheel` for every pose (NaN, -0 and infinities included) and throw
// exactly where they throw.
// ---------------------------------------------------------------------------

const flatGround: TerrainSampler = { sampleGround(_x, _z, out) { out.height = 0; out.normal.x = out.normal.z = 0; out.normal.y = 1;
  out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
const STEP = 1 / 120;
const snap = (value: EucController): RiderOccupancyPose => { const pose = createPose(); value.writePose(pose); return pose; };

/** Recorded rides and crashes, plus synthetic extremes, as plain detached poses. */
function wheelCorpus(): { label: string; pose: RiderOccupancyPose }[] {
  const out: { label: string; pose: RiderOccupancyPose }[] = [{ label: 'createPose', pose: createPose() }];
  for (const [label, style] of [['sober', SOBER_STYLE], ['drunk', DRUNK_STYLE]] as const) {
    const ride = new EucController(flatGround, { tuning: { cutoutEnabled: 0, wobbleMasterGain: 1 } });
    ride.setRideStyle(style); ride.reset(undefined, 6);
    for (let i = 0; i < 360; i += 1) {
      const steer = Math.sin(i / 37), crouch = i % 90 > 70, hop = i === 200;
      ride.step(STEP, { ...NEUTRAL_ACTIONS, throttle: i < 240 ? 1 : -0.4, steer, crouch, hop, hopHeld: crouch });
      if (i % 10 === 0) out.push({ label: `${label} ride ${i}`, pose: snap(ride) });
    }
    assert.equal(ride.hardKnock(3, 1), true);
    for (let i = 0; i < 900 && ride.crashed; i += 1) {
      if (i % 10 === 0) out.push({ label: `${label} crash ${i}`, pose: snap(ride) });
      ride.step(STEP, NEUTRAL_ACTIONS);
    }
    out.push({ label: `${label} recovered`, pose: snap(ride) });
  }
  const air = { ...createPose(), y: 0.8, airBlend: 1, airHeight: 0.8, crouch: 0.6, wheelPitch: 0.3, rollAngle: -0.4 };
  out.push({ label: 'airborne', pose: air });
  const fallen = out.find((entry) => entry.label === 'sober crash 120')!.pose;
  assert.equal(fallen.ragdollBlend, 1, 'the corpus holds a full-rag pose');
  out.push({ label: 'NaN crouch', pose: { ...fallen, crouch: Number.NaN, riderPitch: Number.NaN } });
  out.push({ label: 'NaN rag particle', pose: { ...fallen, ragdoll: Float32Array.from(fallen.ragdoll, (v, i) => i === 4 ? Number.NaN : v) } });
  out.push({ label: '+Infinity spin', pose: { ...fallen, wheelCrashSpin: Number.POSITIVE_INFINITY } });
  out.push({ label: '-Infinity spin', pose: { ...createPose(), wheelCrashSpin: Number.NEGATIVE_INFINITY } });
  out.push({ label: '-0 everywhere', pose: { ...createPose(), x: -0, z: -0, headingY: -0, groundPitch: -0, groundRoll: -0,
    wheelPitch: -0, rollAngle: -0, wobbleYaw: -0, wobbleRoll: -0, styleYaw: -0, styleRoll: -0, wheelCrashSpin: -0,
    wheelCrashLean: -0, wheelCrashPop: -0, suspensionOffset: -0, restFactor: -0 } });
  out.push({ label: 'NaN blend', pose: { ...createPose(), ragdollBlend: Number.NaN } });
  return out;
}

function sameBits(actual: RiderOccupancyPrism, expected: RiderOccupancyPrism, label: string): void {
  assert.deepStrictEqual(Object.keys(actual), Object.keys(expected), `${label}: key order`);
  for (const key of Object.keys(expected) as (keyof RiderOccupancyPrism)[])
    assert.ok(Object.is(actual[key], expected[key]), `${label}: ${key} ${String(actual[key])} vs ${String(expected[key])}`);
}

test('the wheel-only build is bit-identical to both full builds\' wheel over rides, crashes and extremes', () => {
  const corpus = wheelCorpus();
  assert.ok(corpus.length > 150, `a broad corpus (${corpus.length} poses)`);
  for (const [name, k] of [['occupancy', RIDER_OCCUPANCY], ['contact', RIDER_CONTACT]] as const) {
    for (const { label, pose } of corpus) {
      const wheel = buildRiderWheelOccupancy(pose, k);
      sameBits(wheel, buildRiderOccupancy(pose, k).wheel, `${name}/${label} vs buildRiderOccupancy`);
      sameBits(wheel, buildRiderOccupancyEnvelope(pose, k).wheel, `${name}/${label} vs buildRiderOccupancyEnvelope`);
    }
  }
});

test('the wheel-only build reads the wheel\'s inputs and no human input, and throws where the full build throws', () => {
  const fallen = wheelCorpus().find((entry) => entry.label === 'sober crash 120')!.pose;
  const k = RIDER_CONTACT, before = buildRiderWheelOccupancy(fallen, k);
  // Not vacuous: a 1e-9 relative change of a wheel input moves the prism.
  const spun = buildRiderWheelOccupancy({ ...fallen, wheelCrashSpin: fallen.wheelCrashSpin * (1 + 1e-9) + 1e-12 }, k);
  assert.ok((Object.keys(before) as (keyof RiderOccupancyPrism)[]).some((key) => !Object.is(spun[key], before[key])), 'wheelCrashSpin reaches the wheel');
  // Human-only inputs move the human and leave the wheel to the bit.
  const moved = { ...fallen, crouch: fallen.crouch + 0.3, riderPitch: fallen.riderPitch - 0.2,
    ragdoll: Float32Array.from(fallen.ragdoll, (v, i) => i === 0 ? v + 0.25 : v) };
  assert.notDeepStrictEqual(buildRiderOccupancy(moved, k).human, buildRiderOccupancy(fallen, k).human, 'the perturbation is real for the human');
  sameBits(buildRiderWheelOccupancy(moved, k), before, 'human-only perturbation');
  // The one pose-dependent refusal, with the same message.
  const short = { ...createPose(), ragdollBlend: 0.4, ragdoll: new Float32Array(30) };
  const message = (run: () => unknown): string => { try { run(); } catch (error) { return (error as Error).message; } return 'no throw'; };
  assert.equal(message(() => buildRiderWheelOccupancy(short, k)), message(() => buildRiderOccupancyEnvelope(short, k)));
  assert.match(message(() => buildRiderWheelOccupancy(short, k)), /eleven world-space ragdoll particles/);
  assert.equal(message(() => buildRiderWheelOccupancy({ ...short, ragdollBlend: 0 }, k)), 'no throw', 'an inactive short buffer is fine, as before');
});

// ---------------------------------------------------------------------------
// Pinned against the pre-change builder (perf-actions 2026-10-17 polish). The
// tests above compare the wheel-only build with today's full builds, and both
// now run the one shared `wheelOccupancy` — so an edit inside it would move
// all three together and pass. These prisms were recorded from the frozen
// baseline tree's `buildRiderOccupancyEnvelope(pose, k).wheel`
// (`test-results/perf-actions-2026-10-17/baseline-src/shared/riderOccupancy.ts`,
// recorder `test-results/perf-actions-2026-10-17/polish/wheel-pins.ts`), on
// these exact poses, and are held to the bit. RIDER_OCCUPANCY and RIDER_CONTACT
// share the wheel's own coefficients, so one row serves both; if they ever part,
// re-record per set from the baseline tree, never from the current one.
// ---------------------------------------------------------------------------

const WHEEL_KEYS = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'component', 'centreX', 'centreY', 'centreZ',
  'x', 'y', 'z', 'headingY', 'halfWidth', 'halfHeight', 'halfLength', 'baseY', 'topY'] as const;
const WHEEL_NUMBERS = WHEEL_KEYS.filter((key) => key !== 'component') as Exclude<(typeof WHEEL_KEYS)[number], 'component'>[];

/** Recorded on the baseline tree, in `WHEEL_NUMBERS` order. */
const BASELINE_WHEEL: Readonly<Record<string, readonly number[]>> = {
  'mounted at rest': [-0.27, 0.27, -0.02, 0.67, -0.31, 0.32, 0, 0.325, 0.0050000000000000044, 0, 0.325,
    0.0050000000000000044, 0, 0.27, 0.34500000000000003, 0.315, -0.02, 0.67],
  'carving, banked and wobbling': [-0.18685171357533203, 0.5799274419009406, -0.10282854302467992, 0.7463529511551458,
    -0.32403922194551404, 0.4471806363503602, 0.19653786416280428, 0.3217622040652329, 0.06157070720242308,
    12.434116942710999, 0.721762204065233, -31.445134586368837, 2.2, 0.3833895777381363, 0.42459074708991285,
    0.3856099291479371, 0.2971714569753201, 1.1463529511551458],
  'crashed, full ragdoll': [-0.7374073460729995, 0.2231063626188067, -0.42465424916804584, 0.4738007389439778,
    -0.8181181758463859, 0.09760862077702073, -0.2571504917270964, 0.024573244887965973, -0.3602547775346826,
    -7.295580756433886, 0.22457324488796598, 17.607415419314627, -1.1, 0.4802568543459031, 0.4492274940560118,
    0.4578633983117033, -0.22465424916804583, 0.6738007389439777],
  'ragdoll handover at 0.4': [-0.33467274742033304, 0.6162203599345497, -0.000026041498470470714, 0.7791336282241276,
    -0.36957347749196423, 0.5496076835396414, 0.14077380625710834, 0.3895537933628285, 0.09001710302383858,
    0.16436177355338805, 0.3895537933628285, -0.03009237045004974, 0.75, 0.4754465536774414, 0.38957983486129905,
    0.4595905805158028, -0.000026041498470470714, 0.7791336282241276],
  'signed zeros': [-0.27, 0.27, -0.02, 0.67, -0.31, 0.32, 0, 0.325, 0.0050000000000000044, 0, 0.325,
    0.0050000000000000044, -0, 0.27, 0.34500000000000003, 0.315, -0.02, 0.67],
};

/** The recorded poses — keep in step with the recorder, or re-record. */
function pinnedWheelPoses(): [string, RiderOccupancyPose][] {
  return [
    ['mounted at rest', createPose()],
    ['carving, banked and wobbling', { ...createPose(), x: 12.5, y: 0.4, z: -31.25, headingY: 2.2, groundPitch: 0.06,
      groundRoll: -0.04, wheelPitch: 0.11, rollAngle: 0.52, riderRoll: 0.61, suspensionOffset: -0.018, restFactor: 0.25,
      wobbleYaw: 0.035, wobbleRoll: -0.045, styleYaw: 0.02, styleRoll: 0.05 }],
    ['crashed, full ragdoll', Object.assign(fallenPose(-3), { x: -7.5, y: 0.2, z: 18, headingY: -1.1, wheelPitch: -0.3,
      rollAngle: -0.9, wheelCrashSpin: 1.7, wheelCrashLean: 1.2, wheelCrashPop: 0.14, suspensionOffset: 0.02 })],
    ['ragdoll handover at 0.4', Object.assign(fallenPose(-8), { ragdollBlend: 0.4, crashBlend: 0.7, headingY: 0.75,
      wheelCrashSpin: -0.6, wheelCrashLean: 0.45, wheelCrashPop: 0.05, groundPitch: -0.03 })],
    ['signed zeros', { ...createPose(), x: -0, z: -0, headingY: -0, groundPitch: -0, groundRoll: -0, wheelPitch: -0,
      rollAngle: -0, wobbleYaw: -0, wobbleRoll: -0, styleYaw: -0, styleRoll: -0, wheelCrashSpin: -0, wheelCrashLean: -0,
      wheelCrashPop: -0, suspensionOffset: -0, restFactor: -0 }],
  ];
}

test('the wheel-only build returns the wheel prisms recorded from the pre-change builder, to the bit', () => {
  const poses = pinnedWheelPoses();
  assert.deepStrictEqual(poses.map(([label]) => label), Object.keys(BASELINE_WHEEL));
  const crashed = poses.find(([label]) => label === 'crashed, full ragdoll')![1];
  assert.ok(crashed.ragdollBlend === 1 && crashed.crashBlend === 1, 'the pins include a full-rag crash');
  for (const [label, pose] of poses) {
    const recorded = BASELINE_WHEEL[label];
    assert.equal(recorded.length, WHEEL_NUMBERS.length, `${label}: the recorded row`);
    for (const [name, k] of [['occupancy', RIDER_OCCUPANCY], ['contact', RIDER_CONTACT]] as const) {
      const wheel = buildRiderWheelOccupancy(pose, k);
      assert.deepStrictEqual(Object.keys(wheel), [...WHEEL_KEYS], `${label}/${name}: key order`);
      assert.equal(wheel.component, 'wheel');
      WHEEL_NUMBERS.forEach((key, index) => assert.ok(Object.is(wheel[key], recorded[index]),
        `${label}/${name}: ${key} ${String(wheel[key])} vs recorded ${String(recorded[index])}`));
    }
  }
  // Not vacuous: the pinned poses reach different wheels, signed zero included.
  assert.notDeepStrictEqual(BASELINE_WHEEL['crashed, full ragdoll'], BASELINE_WHEEL['mounted at rest']);
  assert.ok(Object.is(buildRiderWheelOccupancy(poses[4][1], RIDER_CONTACT).headingY, -0));
});
