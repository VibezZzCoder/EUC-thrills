/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ProtectedActivity, type ProtectedActivityPose, type ProtectedActivityTuning } from './protectedActivity.ts';

/** Fixture only; production visual values belong to the street-life table. */
const TUNING: ProtectedActivityTuning = {
  travelMetres: 0.6,
  walkSeconds: 2.6,
  turnSeconds: 0.6,
  idleSeconds: 1.4,
  strideCyclesPerLeg: 2,
};
const REST: ProtectedActivityPose = { offsetX: 0, yaw: 0, stride: 0, armSwing: 0, walking: 0, service: 0 };

function snapshot(activity: ProtectedActivity, seconds: number, reducedMotion = false): ProtectedActivityPose {
  return { ...activity.sample(seconds, reducedMotion) };
}

function withinContract(pose: ProtectedActivityPose): boolean {
  return Object.values(pose).every(Number.isFinite)
    && Math.abs(pose.offsetX) <= TUNING.travelMetres * 0.5 + 1e-10
    && Math.abs(pose.yaw) <= Math.PI * 0.5 + 1e-10
    && Math.abs(pose.stride) <= 1 + 1e-10
    && Math.abs(pose.armSwing) <= 1 + 1e-10
    && pose.walking >= 0 && pose.walking <= 1 + 1e-10
    && pose.service >= 0 && pose.service <= 1 + 1e-10
    && Math.abs(pose.stride + pose.armSwing) < 1e-10;
}

function continuous(a: ProtectedActivityPose, b: ProtectedActivityPose): boolean {
  return Math.abs(a.offsetX - b.offsetX) < 1e-7
    && Math.abs(a.yaw - b.yaw) < 1e-7
    && Math.abs(a.stride - b.stride) < 1e-7
    && Math.abs(a.armSwing - b.armSwing) < 1e-7
    && Math.abs(a.walking - b.walking) < 1e-7
    && Math.abs(a.service - b.service) < 1e-7;
}

test('the short loop is finite and bounded over multiple periods, reusing one pose', () => {
  const activity = new ProtectedActivity(TUNING);
  const shared = activity.pose;
  assert.equal(activity.periodSeconds, 2 * (TUNING.walkSeconds + 2 * TUNING.turnSeconds + TUNING.idleSeconds));
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  let sawWalking = false;
  let sawEndpointIdle = false;
  for (let i = 0; i <= 8000; i += 1) {
    const pose = activity.sample(i * activity.periodSeconds / 2000, false);
    assert.equal(pose, shared);
    assert.ok(withinContract(pose), `contract failed at sample ${i}`);
    lowest = Math.min(lowest, pose.offsetX);
    highest = Math.max(highest, pose.offsetX);
    sawWalking ||= pose.walking > 0.5;
    sawEndpointIdle ||= pose.walking === 0 && pose.yaw === 0 && Math.abs(pose.offsetX) > 0.25;
  }
  assert.equal(lowest, -TUNING.travelMetres * 0.5);
  assert.equal(highest, TUNING.travelMetres * 0.5);
  assert.ok(sawWalking && sawEndpointIdle, 'a frozen decoration cannot satisfy the activity contract');
  // Negative controls: an oversized path, a non-finite field, and same-side
  // foot/arm swings each must fail the bounds/alternation predicate.
  assert.equal(withinContract({ ...REST, offsetX: 0.7 }), false);
  assert.equal(withinContract({ ...REST, yaw: Number.NaN }), false);
  assert.equal(withinContract({ ...REST, stride: 0.4, armSwing: 0.4 }), false);
});

test('both turns, arrivals, idles and the cycle wrap are continuous with eased stops', () => {
  const activity = new ProtectedActivity(TUNING);
  const leg = activity.periodSeconds * 0.5;
  const boundaries = [
    TUNING.turnSeconds,
    TUNING.turnSeconds + TUNING.walkSeconds,
    2 * TUNING.turnSeconds + TUNING.walkSeconds,
    leg,
    leg + TUNING.turnSeconds,
    leg + TUNING.turnSeconds + TUNING.walkSeconds,
    leg + 2 * TUNING.turnSeconds + TUNING.walkSeconds,
    activity.periodSeconds,
  ];
  const epsilon = 1e-5;
  for (const boundary of boundaries) {
    const before = snapshot(activity, boundary - epsilon);
    const after = snapshot(activity, boundary + epsilon);
    assert.ok(continuous(before, after), `discontinuity at ${boundary}`);
    assert.equal(continuous(before, { ...after, offsetX: after.offsetX + 0.05 }), false,
      'the continuity check must reject a known five-centimetre teleport');
  }
  const arrival = TUNING.turnSeconds + TUNING.walkSeconds;
  const nearArrival = snapshot(activity, arrival - epsilon);
  const atArrival = snapshot(activity, arrival);
  assert.ok(Math.abs(nearArrival.offsetX - atArrival.offsetX) / epsilon < 1e-6,
    'the translation must settle before the arrival turn');
  assert.ok(nearArrival.walking < 1e-7);
  assert.equal(atArrival.stride, 0);
});

test('travel faces its direction and alternates feet/arms; turns and endpoint rest are stationary', () => {
  const activity = new ProtectedActivity(TUNING);
  const leg = activity.periodSeconds * 0.5;
  for (const [start, expectedHeading] of [[0, Math.PI * 0.5], [leg, -Math.PI * 0.5]]) {
    let sawLeft = false;
    let sawRight = false;
    for (let i = 1; i < 200; i += 1) {
      const seconds = start + TUNING.turnSeconds + TUNING.walkSeconds * i / 200;
      const pose = snapshot(activity, seconds);
      assert.equal(pose.yaw, expectedHeading);
      assert.equal(pose.armSwing, -pose.stride);
      sawLeft ||= pose.stride > 0.25;
      sawRight ||= pose.stride < -0.25;
      const future = snapshot(activity, seconds + 1e-5);
      assert.equal(Math.sign(future.offsetX - pose.offsetX), Math.sign(expectedHeading));
    }
    assert.ok(sawLeft && sawRight, 'each leg must contain both alternating foot phases');
    const beforeTurn = snapshot(activity, start);
    const turning = snapshot(activity, start + TUNING.turnSeconds * 0.5);
    assert.equal(turning.offsetX, beforeTurn.offsetX);
    assert.ok(Math.abs(turning.yaw) > 0 && Math.abs(turning.yaw) < Math.abs(expectedHeading));
    assert.equal(turning.walking, 0);
    assert.equal(turning.stride, 0);
    const idle = snapshot(activity, start + leg - TUNING.idleSeconds * 0.5);
    assert.equal(idle.walking, 0);
    assert.equal(idle.yaw, 0);
    assert.equal(idle.armSwing, 0);
    assert.ok(Math.abs(idle.service - 1) < 1e-12, 'counter-facing idle must contain a visible service reach');
    assert.equal(turning.service, 0);
  }
});

test('reduced motion is one centered resting pose at every time and cannot retain a gait or endpoint offset', () => {
  const activity = new ProtectedActivity(TUNING);
  for (const seconds of [0, 0.3, 1.4, 3.5, 5.2, 7.8, 10.4, 200]) {
    activity.sample(seconds, false);
    assert.deepEqual(activity.sample(seconds, true), REST);
  }
  const moving = snapshot(activity, 1.4);
  assert.notDeepEqual(moving, REST, 'ordinary movement is the known-bad control for fixed rest');
  assert.ok(Math.abs(moving.offsetX) > 0 || moving.walking > 0);
});

test('shared-clock samples are deterministic regardless of pane count, call order or prior reduced-motion samples', () => {
  const first = new ProtectedActivity(TUNING);
  const second = new ProtectedActivity(TUNING);
  for (const seconds of [2.1, 8.7, 1.2, 73.3, 0, 41.8, 3.1]) {
    const expected = snapshot(first, seconds);
    for (const unrelatedTime of [0.2, 100, 4, 22]) second.sample(unrelatedTime, false);
    second.sample(seconds, true);
    assert.deepEqual(snapshot(second, seconds), expected);
    for (let pane = 0; pane < 4; pane += 1) assert.deepEqual(snapshot(second, seconds), expected);
    const repeated = snapshot(first, seconds + first.periodSeconds * 3);
    for (const key of Object.keys(expected) as (keyof ProtectedActivityPose)[]) {
      assert.ok(Math.abs(repeated[key] - expected[key]) < 1e-12, `periodic ${key} drifted`);
    }
  }
  // An agent advancing the activity once per pane would violate this check.
  const shared = snapshot(first, 2.1);
  const wrongPerPaneClock = snapshot(second, 2.1 + 4 / 60);
  assert.notDeepEqual(wrongPerPaneClock, shared);
});

test('copied configuration stays stable and zero travel is fixed rest', () => {
  const mutable = { ...TUNING };
  const activity = new ProtectedActivity(mutable);
  const before = snapshot(activity, 2.1);
  mutable.travelMetres = 20;
  mutable.walkSeconds = 0.1;
  mutable.turnSeconds = 2;
  mutable.strideCyclesPerLeg = 8;
  assert.deepEqual(snapshot(activity, 2.1), before);
  const still = new ProtectedActivity({ ...TUNING, travelMetres: 0 });
  for (const seconds of [0, 0.5, 3, 8, 100]) assert.deepEqual(still.sample(seconds, false), REST);
});

test('malformed times rest safely and malformed tuning refuses instead of poisoning transforms', () => {
  const activity = new ProtectedActivity(TUNING);
  for (const seconds of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    activity.sample(2.1, false);
    assert.deepEqual(activity.sample(seconds, false), REST);
  }
  for (const invalid of [
    { travelMetres: -1 }, { travelMetres: Number.NaN },
    { walkSeconds: 0 }, { turnSeconds: 0 }, { idleSeconds: -1 },
    { strideCyclesPerLeg: 0 }, { strideCyclesPerLeg: 1.5 },
    { walkSeconds: Number.MAX_VALUE, idleSeconds: Number.MAX_VALUE },
  ]) assert.throws(() => new ProtectedActivity({ ...TUNING, ...invalid }), RangeError);
});
