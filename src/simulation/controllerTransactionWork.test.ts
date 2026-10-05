/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The prepared-step bookkeeping a living world pays per rider per fixed step
 * (RP-4/CP-5, 2026-10-03). The configuration compare reads about two hundred
 * dictionary fields, so it runs where a candidate is born and at commit; the
 * token, owner and revision checks still guard every call.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DRUNK_STYLE } from '../data/rideStyles.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { EucController, createPose, defaultSurfaceResponses, type EucDynamicWorld, type EucPose } from './EucController.ts';
import type { GroundSample, TerrainSampler } from './world.ts';

const flat: TerrainSampler = {
  sampleGround(_x: number, _z: number, out: GroundSample): GroundSample {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast: () => null,
};
const CLEAR: EucDynamicWorld = { hull: { halfWidthMetres: 0.25, halfLengthMetres: 0.3, heightMetres: 1.7 }, resolveMotion: () => null };

function countingCompares(work: () => void): number {
  const proto = EucController.prototype as unknown as { sameStepConfiguration: (other: EucController) => boolean };
  const original = proto.sameStepConfiguration;
  let calls = 0;
  // Every argument is forwarded: the birth check's epoch flag is part of what runs.
  proto.sameStepConfiguration = function (this: EucController, ...args: [EucController]) { calls += 1; return original.apply(this, args); };
  try { work(); } finally { proto.sameStepConfiguration = original; }
  return calls;
}

test('one prepared transaction compares its configuration at birth and at commit only', () => {
  const rider = new EucController(flat, { dynamicWorld: CLEAR, tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } });
  rider.reset(undefined, 4);
  const pose = createPose(), actions = { ...NEUTRAL_ACTIONS, throttle: 0.5 };
  const calls = countingCompares(() => {
    const token = rider.prepareStep(1 / 120, actions);
    rider.writePreparedPose(token, pose);
    rider.resolvePreparedStep(token, CLEAR);
    rider.writePreparedPose(token, pose);
    rider.resolvePreparedStep(token, CLEAR);
    rider.commitPreparedStep(token);
  });
  assert.equal(calls, 2);
});
// Direct-mutation refusal at commit stays pinned in controllerTransaction.test.ts.

/**
 * PERF-R2-1 (2026-10-04): within a configuration epoch a scratch controller's
 * copy of the ~200-key configuration only reads, and the candidate's birth
 * trusts the epoch. A later transaction writes none of the scratch's fields and
 * reads the live tuning twice, once at the copy and once at commit, where
 * BASE3 wrote it all and read it three times.
 */
test('a later prepared transaction writes no configuration and reads it at the copy and at commit only', () => {
  const rider = new EucController(flat, { dynamicWorld: CLEAR, tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } });
  rider.reset(undefined, 4);
  const actions = { ...NEUTRAL_ACTIONS, throttle: 0.5 };
  const cycle = () => { const token = rider.prepareStep(1 / 120, actions); rider.resolvePreparedStep(token, CLEAR); rider.commitPreparedStep(token); };
  cycle();
  // Object.keys/values and Object.assign enumerate through ownKeys; the values are untouched.
  let enumerations = 0, writes = 0;
  const record = rider as unknown as { tuning: object; workingController: { tuning: object };
    sameStepConfiguration(other: unknown): boolean };
  record.tuning = new Proxy(record.tuning, { ownKeys(target) { enumerations += 1; return Reflect.ownKeys(target); } });
  const scratch = record.workingController;
  scratch.tuning = new Proxy(scratch.tuning, {
    set(target, key, value) { writes += 1; return Reflect.set(target, key, value); },
    deleteProperty(target, key) { writes += 1; return Reflect.deleteProperty(target, key); },
  });
  assert.ok(record.sameStepConfiguration(scratch));
  const perFullCompare = enumerations; enumerations = 0;
  assert.ok(perFullCompare > 0);
  for (let step = 0; step < 3; step += 1) cycle();
  assert.equal(writes, 0, 'an unchanged configuration is not copied again');
  assert.equal(enumerations, 3 * 2 * perFullCompare, 'one compare at the copy and one at commit; none where the candidate is born');
});

function samePose(a: EucPose, b: EucPose): boolean {
  for (const key of Object.keys(b) as (keyof EucPose)[]) {
    if (key === 'ragdoll') { if (a.ragdoll.some((value, index) => !Object.is(value, b.ragdoll[index]))) return false; }
    else if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

test('every configuration setter, on any controller sharing a record, reaches the next prepared candidate', () => {
  const STEP = 1 / 120, actions = { ...NEUTRAL_ACTIONS, throttle: 0.6, steer: 0.3 };
  const setters: Array<(rider: EucController, other: EucController) => void> = [
    (rider) => rider.setTuning({ leanToAccel: rider.tuning.leanToAccel * 2 }),
    (rider) => rider.setSurfaceResponse('pavement', { rollingResistance: rider.surfaces.pavement.rollingResistance * 8 }),
    (rider) => rider.setRideStyle(DRUNK_STYLE),
    // A surface record shared at construction, changed through the OTHER controller.
    (_rider, other) => other.setSurfaceResponse('pavement', { rollingResistance: other.surfaces.pavement.rollingResistance * 8 }),
  ];
  for (const [index, set] of setters.entries()) {
    const shared = index === 3 ? { surfaces: defaultSurfaceResponses() } : {};
    const make = () => { const value = new EucController(flat, { dynamicWorld: CLEAR, ...shared,
      tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } }); value.reset(undefined, 4); return value; };
    const prepared = make(), native = make(), unchanged = new EucController(flat, { dynamicWorld: CLEAR,
      tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } }), other = make();
    unchanged.reset(undefined, 4);
    const ride = (steps: number) => { for (let step = 0; step < steps; step += 1) {
      const token = prepared.prepareStep(STEP, actions); prepared.resolvePreparedStep(token, CLEAR); prepared.commitPreparedStep(token);
      native.step(STEP, actions); unchanged.step(STEP, actions);
    } };
    ride(30);
    set(prepared, other); if (index < 3) set(native, other);
    ride(90);
    const a = createPose(), b = createPose(), c = createPose();
    prepared.writePose(a); native.writePose(b); unchanged.writePose(c);
    assert.ok(samePose(a, b), `setter ${index}: the prepared candidate rides the new configuration exactly`);
    assert.ok(!samePose(b, c), `setter ${index}: the control proves the change matters`);
  }
});

/**
 * A direct field write no setter announces, made between steps, is copied at
 * the next prepare as it was before the epoch: no refusal, no stale controller
 * (review of PERF-R2-1, 2026-10-04). One made inside a transaction is refused
 * at commit, as controllerTransaction.test.ts pins.
 */
test('a direct configuration write between steps reaches the next prepared candidate without a refusal', () => {
  const STEP = 1 / 120, actions = { ...NEUTRAL_ACTIONS, throttle: 0.6, steer: 0.3 };
  const writes: Array<(rider: EucController) => void> = [
    (rider) => { rider.tuning.leanToAccel *= 2; },
    (rider) => { rider.surfaces.pavement.rollingResistance *= 8; },
    // A retained style record, dressed through the setter, then changed in place.
    (rider) => { (rider.rideStyle as { weaveHeading: number }).weaveHeading += 0.5; },
  ];
  for (const [index, write] of writes.entries()) {
    const make = () => { const value = new EucController(flat, { dynamicWorld: CLEAR,
      tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } }); value.reset(undefined, 4);
      if (index === 2) value.setRideStyle({ ...DRUNK_STYLE });
      return value; };
    const prepared = make(), native = make(), unchanged = make();
    let refusals = 0;
    const ride = (steps: number) => { for (let step = 0; step < steps; step += 1) {
      const token = prepared.prepareStep(STEP, actions); prepared.resolvePreparedStep(token, CLEAR);
      try { prepared.commitPreparedStep(token); } catch { refusals += 1; }
      native.step(STEP, actions); unchanged.step(STEP, actions);
    } };
    ride(30);
    write(prepared); write(native);
    ride(90);
    assert.equal(refusals, 0, `write ${index}: no prepared step is refused`);
    const a = createPose(), b = createPose(), c = createPose();
    prepared.writePose(a); native.writePose(b); unchanged.writePose(c);
    assert.ok(samePose(a, b), `write ${index}: the prepared candidate rides the written configuration exactly`);
    assert.ok(!samePose(b, c), `write ${index}: the control proves the write matters`);
  }
});

/**
 * The reaction and settlement guards compare every field, as before the epoch
 * (review of PERF-R2-1, 2026-10-04). Their world queries run between the
 * scratch's copy and the guard; a query that writes the configuration is
 * refused, and the next query rides the configuration it finds.
 */
test('a reaction or settlement query that writes the configuration is refused', () => {
  let write: (() => void) | null = null;
  const world: EucDynamicWorld = { ...CLEAR, canReact: () => { write?.(); write = null; return true; } };
  const rider = new EucController(flat, { dynamicWorld: world, tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } });
  rider.reset(undefined, 4);
  rider.step(1 / 120, { ...NEUTRAL_ACTIONS, throttle: 0.5 });
  const gravity = rider.tuning.gravity;
  rider.bump(0.1, 0.2, 0);
  write = () => { rider.tuning.gravity = gravity * 2; };
  assert.throws(() => rider.bump(0.1, 0.2, 0), /must not mutate its controller/);
  rider.bump(0.1, 0.2, 0);
  const settle = (rider as unknown as { advanceNativeContactFall(record: object): boolean }).advanceNativeContactFall.bind(rider);
  const record = { dt: 1 / 120, actions: { ...NEUTRAL_ACTIONS, throttle: 0.5 }, notifications: [], resolvedPlacementRequests: [] };
  write = () => { rider.surfaces.pavement.grip *= 0.5; };
  assert.throws(() => settle(record), /Settlement query mutated its controller/);
  assert.equal(settle(record), true);
});

test('the commit compare reads values in key order only when both orders match', () => {
  const run = (mutate: (tuning: Record<string, unknown>) => void) => {
    const rider = new EucController(flat, { dynamicWorld: CLEAR, tuning: { cutoutEnabled: 0, wobbleMasterGain: 0 } });
    rider.reset(undefined, 4);
    const token = rider.prepareStep(1 / 120, { ...NEUTRAL_ACTIONS, throttle: 0.5 }); rider.resolvePreparedStep(token, CLEAR);
    mutate(rider.tuning as unknown as Record<string, unknown>);
    rider.commitPreparedStep(token);
  };
  // The same fields and values in another order are the same configuration.
  run((tuning) => { const value = tuning.gravity; delete tuning.gravity; tuning.gravity = value; });
  // One field swapped for another keeps the count, and is refused.
  assert.throws(() => run((tuning) => { const value = tuning.gravity; delete tuning.gravity; tuning.gravityAlias = value; }), /stale/);
  // A changed value in matching order is refused.
  assert.throws(() => run((tuning) => { tuning.gravity = 8; }), /stale/);
});
