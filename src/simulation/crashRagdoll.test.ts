/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import {
  EucController,
  createPose,
  type EucSnapshot,
  type EucTuning,
} from './EucController.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { RAGDOLL_PARTICLES, RD_FOOT_L, RD_FOOT_R, RD_HEAD } from './ragdoll.ts';
import { SoftBodyField } from './softBodies.ts';

/**
 * The M15 crash ragdoll, the wheel flourish, and soft foliage — headlessly.
 *
 * Everything here runs with no browser and no three.js, which is the audit's
 * whole point (`docs/PLANS.md` §15): the particle body lives in `simulation/`
 * as plain arithmetic, so the claims that matter — deterministic, above the
 * ground, out of the walls, settled before recovery, and *absent entirely*
 * when disabled — are checked in milliseconds rather than by watching crashes
 * and forming an impression.
 */

const STEP = 1 / SIMULATION.hz;
const SECONDS = (seconds: number): number => Math.round(seconds * SIMULATION.hz);

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/** A long wall lying across +Z at z = 40, exactly as the M14.5 QA builds it. */
function wallPlan(height = 1.4): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'wall-run',
      length: 80,
      halfWidth: 30,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{
        s: 40, t: 0, halfAlong: 0.5, halfLateral: 300, height, surface: 'pavement',
      }],
    }],
    {
      id: 'wall',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 8,
    },
  );
}

function flatPlan(): LevelPlan {
  return buildLevelPlan(
    [{ id: 'flat', length: 200, halfWidth: 12, surface: 'pavement', shoulder: 1 }],
    {
      id: 'flat-run',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 4,
    },
  );
}

function controller(options: {
  tuning?: Partial<EucTuning>;
  plan?: LevelPlan;
  softBodies?: readonly BoxCollider[];
} = {}): EucController {
  const plan = options.plan ?? wallPlan();
  return new EucController(new PlanTerrainSampler(plan), {
    // **The max-speed cutout is off for this whole file** — M20, and it is the
    // rule about re-deriving a spec rather than patching it. Every test here
    // names the crash it is about, and one of them rides flat out for twelve
    // seconds to prove a *bush* does not manufacture one. Full throttle on flat
    // pavement now reaches the cutout speed at 8.7 s, so that fixture started
    // failing with "foliage manufactured a crash" for a crash the foliage had
    // nothing to do with. Switching the new funnel off here restores what the
    // fixtures were always claiming; `EucController.test.ts` is where the
    // cutout is proved, on its own terms.
    tuning: { wobbleMasterGain: 1, cutoutEnabled: 0, ...(options.tuning ?? {}) },
    spawn: plan.spawn,
    softBodies: new SoftBodyField(options.softBodies ?? []),
  });
}

function rideUntilCrashed(euc: EucController, limitSteps = 1200): EucSnapshot {
  const input = actions({ throttle: 1 });
  for (let i = 0; i < limitSteps; i += 1) {
    if (euc.snapshot().crashed) return euc.snapshot();
    euc.step(STEP, input);
  }
  assert.fail('never crashed');
}

/** The particle block off a fresh pose write. */
function particles(euc: EucController): Float32Array {
  const pose = createPose();
  euc.writePose(pose);
  return pose.ragdoll;
}

// ---------------------------------------------------------------------------
// The reduction: riding, and the disabled switch
// ---------------------------------------------------------------------------

test('a clean ride carries no ragdoll and no flourish in any pose', () => {
  const euc = controller({ plan: flatPlan() });
  const input = actions({ throttle: 1 });
  const pose = createPose();
  for (let i = 0; i < SECONDS(6); i += 1) {
    euc.step(STEP, input);
    euc.writePose(pose);
    assert.equal(pose.ragdollBlend, 0);
    assert.equal(pose.wheelCrashSpin, 0);
    assert.equal(pose.wheelCrashPop, 0);
  }
  assert.equal(euc.snapshot().ragdolling, false);
});

test('with the ragdoll disabled a crash is the scripted M6 separation and nothing else', () => {
  const euc = controller({ tuning: { ragdollEnabled: 0 } });
  const crashed = rideUntilCrashed(euc);
  assert.equal(crashed.crashCause, 'obstacle');
  assert.equal(crashed.ragdolling, false);

  const pose = createPose();
  for (let i = 0; i < SECONDS(1); i += 1) euc.step(STEP, actions());
  euc.writePose(pose);
  assert.equal(pose.ragdollBlend, 0, 'a disabled ragdoll leaked into the pose');
  assert.ok(pose.crashBlend > 0.5, 'the scripted separation stopped running');
  assert.ok(
    Math.abs(pose.crashRoll) > 0.5,
    'an obstacle side fall stopped lying the rider down',
  );
  assert.ok(
    pose.ragdoll.every((value) => value === 0),
    'the particle block moved with the ragdoll disabled',
  );
});

// ---------------------------------------------------------------------------
// The ragdoll itself
// ---------------------------------------------------------------------------

test('a wall crash hands the body to the ragdoll and blends fully in', () => {
  const euc = controller();
  const crashed = rideUntilCrashed(euc);
  assert.equal(crashed.crashCause, 'obstacle');
  assert.equal(crashed.ragdolling, true);

  const before = particles(euc).slice();
  for (let i = 0; i < SECONDS(0.5); i += 1) euc.step(STEP, actions());
  const pose = createPose();
  euc.writePose(pose);
  assert.equal(pose.ragdollBlend, 1, 'the blend never reached the particles');
  const after = pose.ragdoll;
  let moved = 0;
  for (let i = 0; i < after.length; i += 1) moved += Math.abs(after[i] - before[i]);
  assert.ok(moved > 0.5, `the particles barely moved (${moved.toFixed(3)} m summed)`);
});

test('no particle ever goes below the ground', () => {
  const euc = controller();
  rideUntilCrashed(euc);
  for (let i = 0; i < SECONDS(2); i += 1) {
    euc.step(STEP, actions());
    const block = particles(euc);
    for (let p = 0; p < RAGDOLL_PARTICLES; p += 1) {
      assert.ok(
        block[p * 3 + 1] > -1e-3,
        `particle ${p} sank to y=${block[p * 3 + 1]} on flat ground`,
      );
    }
  }
});

test('every particle passes over the wall or stops at it — never through it', () => {
  // The forum defect this closes: "the rider skids half-way through it and
  // gets stuck". The wall spans z 39.5..40.5 up to y 1.4; the pelvis, chest,
  // and head are swept against the same authored boxes the wheel respects,
  // so a body below the top thuds against the face — while one flung higher
  // sails legitimately *over* it, which is the forum's "flip over the
  // rail/barricade" wish happening for free out of the launch itself.
  const euc = controller();
  rideUntilCrashed(euc);
  for (let i = 0; i < SECONDS(2.4); i += 1) {
    euc.step(STEP, actions());
    const block = particles(euc);
    for (let p = 0; p < RAGDOLL_PARTICLES; p += 1) {
      const y = block[p * 3 + 1];
      const z = block[p * 3 + 2];
      const insideWall = z > 39.5 + 1e-3 && z < 40.5 - 1e-3 && y < 1.4 - 1e-3;
      assert.ok(
        !insideWall,
        `particle ${p} is inside the wall at y=${y.toFixed(2)}, z=${z.toFixed(2)}`,
      );
    }
  }
});

test('a building-height wall cannot be mistaken for ground and roof-snap the body', () => {
  // `PlanTerrainSampler.sampleGround` answers the top of a collider footprint.
  // A grazing limb must be resolved by the wall sweep, not teleported to that
  // roof and allowed to tow the rest of the body after it.
  const euc = controller({ plan: wallPlan(18) });
  rideUntilCrashed(euc);
  let highest = 0;
  for (let i = 0; i < SECONDS(2); i += 1) {
    euc.step(STEP, actions());
    const block = particles(euc);
    for (let p = 0; p < RAGDOLL_PARTICLES; p += 1) {
      highest = Math.max(highest, block[p * 3 + 1]);
      const y = block[p * 3 + 1];
      const z = block[p * 3 + 2];
      const insideWall = z > 39.5 + 1e-3 && z < 40.5 - 1e-3 && y < 18 - 1e-3;
      assert.ok(!insideWall, `particle ${p} entered the building at y=${y}, z=${z}`);
    }
  }
  assert.ok(highest < 5, `a particle snapped toward the 18 m roof (peak y=${highest})`);
});

test('the settled body stays visibly clear of the fallen wheel', () => {
  const euc = controller();
  rideUntilCrashed(euc);
  for (let i = 0; i < SECONDS(2.3); i += 1) euc.step(STEP, actions());
  const state = euc.snapshot();
  const block = particles(euc);
  for (let p = 0; p < RAGDOLL_PARTICLES; p += 1) {
    if (block[p * 3 + 1] > 0.9) continue;
    const distance = Math.hypot(
      block[p * 3] - state.position.x,
      block[p * 3 + 2] - state.position.z,
    );
    assert.ok(distance >= 0.40, `particle ${p} settled inside the wheel at ${distance} m`);
  }
});

test('the tumble is settled before manual recovery opens', () => {
  const euc = controller();
  rideUntilCrashed(euc);
  // 2.3 s of neutral input — still inside the crash (auto recovery is 3.6 s).
  for (let i = 0; i < SECONDS(2.3); i += 1) euc.step(STEP, actions());
  const before = particles(euc).slice();
  euc.step(STEP, actions());
  const after = particles(euc);
  let moved = 0;
  for (let i = 0; i < after.length; i += 1) moved += Math.abs(after[i] - before[i]);
  assert.ok(
    moved < 0.05,
    `the body is still moving ${moved.toFixed(4)} m/step at 2.3 s — not settled`,
  );
  assert.equal(euc.snapshot().crashed, true, 'settling must not mean recovered');
});

test('the cutout is a faceplant: over the front, not backwards or sideways', () => {
  // The owner's night note on the published M20.1 build: routed through the
  // side fall, the cutout read as *"he kinda falls back… looks like he got
  // shot"* — and a real cutout is the one crash whose direction physics
  // dictates. Ride flat pavement at full throttle until the wheel gives up
  // (the only crash a flat empty run can produce with the funnel on), then
  // watch the body: it must plow FORWARD past the wheel, head leading the
  // feet, with next to no sideways throw.
  const euc = controller({ plan: flatPlan(), tuning: { cutoutEnabled: 1 } });
  const lost = rideUntilCrashed(euc, SECONDS(15));
  assert.equal(lost.crashCause, 'cutout', 'the flat run must crash by cutout');
  assert.equal(lost.crashMotion, 'faceplant');
  const crashZ = lost.position.z;

  // Early in the tumble — the readable moment the owner is reacting to.
  for (let i = 0; i < SECONDS(0.4); i += 1) euc.step(STEP, actions());
  let block = particles(euc);
  const headZ = block[RD_HEAD * 3 + 2];
  const headX = block[RD_HEAD * 3];
  const feetZ = (block[RD_FOOT_L * 3 + 2] + block[RD_FOOT_R * 3 + 2]) / 2;
  assert.ok(
    headZ > crashZ + 1,
    `the body must go forward of the cutout point (head ${headZ.toFixed(2)}, crash ${crashZ.toFixed(2)})`,
  );
  assert.ok(
    headZ > feetZ + 0.15,
    `over the FRONT: head (${headZ.toFixed(2)}) must lead the feet (${feetZ.toFixed(2)})`,
  );
  assert.ok(
    Math.abs(headX) < 1.5,
    `a cutout is not a side fall — head drifted ${headX.toFixed(2)} m sideways`,
  );

  // And it ends face-down on the deck, not standing and not backwards.
  for (let i = 0; i < SECONDS(1.8); i += 1) euc.step(STEP, actions());
  block = particles(euc);
  assert.ok(
    block[RD_HEAD * 3 + 1] < 0.75,
    `the head must finish on the deck, got y ${block[RD_HEAD * 3 + 1].toFixed(2)}`,
  );
  assert.ok(
    block[RD_HEAD * 3 + 2] > crashZ,
    'the settled body lies ahead of where the wheel cut, never behind it',
  );
});

test('two identical crashes produce bit-identical tumbles', () => {
  const first = controller();
  const second = controller();
  const input = actions({ throttle: 1 });
  for (let i = 0; i < 500; i += 1) {
    first.step(STEP, input);
    second.step(STEP, input);
  }
  assert.equal(first.snapshot().crashed, true, 'the fixture never reached the wall');
  for (let i = 0; i < SECONDS(2); i += 1) {
    first.step(STEP, actions());
    second.step(STEP, actions());
    assert.deepEqual(
      particles(first),
      particles(second),
      `the tumbles diverged at step ${i}`,
    );
  }
});

test('recovery timing is untouched by the ragdoll existing', () => {
  const euc = controller();
  rideUntilCrashed(euc);
  // Riding input before the earliest gate does nothing.
  for (let i = 0; i < SECONDS(2.0); i += 1) euc.step(STEP, actions({ throttle: 1 }));
  assert.equal(euc.snapshot().crashed, true, 'input recovered before the 2.5 s gate');
  // Past the gate the same input recovers promptly.
  for (let i = 0; i < SECONDS(0.8); i += 1) euc.step(STEP, actions({ throttle: 1 }));
  assert.equal(euc.snapshot().crashed, false, 'the rider never came back');
  const pose = createPose();
  euc.writePose(pose);
  assert.equal(pose.ragdollBlend, 0, 'the ragdoll outlived the recovery');
});

// ---------------------------------------------------------------------------
// The wheel flourish
// ---------------------------------------------------------------------------

test('a fast wall crash bounces and spins the wheel out; a slow one keeps the quiet fall', () => {
  const fast = controller();
  rideUntilCrashed(fast);
  let popped = 0;
  let spun = 0;
  const pose = createPose();
  for (let i = 0; i < SECONDS(1.5); i += 1) {
    fast.step(STEP, actions());
    fast.writePose(pose);
    popped = Math.max(popped, pose.wheelCrashPop);
    spun = Math.max(spun, Math.abs(pose.wheelCrashSpin));
  }
  assert.ok(popped > 0.05, `the wheel never left the ground (peak ${popped.toFixed(3)} m)`);
  assert.ok(spun > 0.5, `the wheel never spun out (peak ${spun.toFixed(3)} rad)`);

  // Under the flourish threshold: a wheel whose drag caps it near 4 m/s,
  // driven flat-out into the same wall, with the obstacle gate lowered so the
  // slow hit still crashes.
  const slow = controller({ tuning: { obstacleCrashSpeed: 1.2, dragCoefficient: 0.3 } });
  const slowCrashed = rideUntilCrashed(slow, 4000);
  assert.equal(slowCrashed.crashCause, 'obstacle');
  assert.ok(Math.abs(slowCrashed.speed) < 5, `the "slow" crash arrived at ${slowCrashed.speed} m/s`);
  for (let i = 0; i < SECONDS(1); i += 1) {
    slow.step(STEP, actions());
    slow.writePose(pose);
    assert.equal(pose.wheelCrashPop, 0, 'a slow crash still bounced the wheel');
    assert.equal(pose.wheelCrashSpin, 0, 'a slow crash still spun the wheel out');
  }
});

// ---------------------------------------------------------------------------
// Soft foliage
// ---------------------------------------------------------------------------

/** A hedge-sized soft box straight ahead of the spawn. */
function hedge(z: number): BoxCollider {
  return {
    centre: { x: 0, y: 0.55, z },
    halfExtents: { x: 3, y: 0.6, z: 1.2 },
    rotationY: 0,
    surface: 'grass',
  };
}

test('a bush is a soft hazard: drag and wobble, never a direct crash or wall', () => {
  const euc = controller({ plan: flatPlan(), softBodies: [hedge(60)] });
  const input = actions({ throttle: 1 });

  let entrySpeed = 0;
  let exitSpeed = 0;
  let sawWobble = false;
  for (let i = 0; i < SECONDS(12); i += 1) {
    euc.step(STEP, input);
    const state = euc.snapshot();
    if (state.inFoliage) {
      if (entrySpeed === 0) entrySpeed = state.speed;
      exitSpeed = state.speed;
      if (state.wobbleEnergy > 0) sawWobble = true;
    }
  }
  const finished = euc.snapshot();
  assert.equal(finished.crashes, 0, 'foliage manufactured a crash');
  assert.ok(finished.position.z > 62, `the bush stopped the wheel at z=${finished.position.z}`);
  assert.ok(entrySpeed > 10, `the fixture only reached ${entrySpeed} m/s`);
  assert.ok(
    exitSpeed < entrySpeed - 1,
    `the bush cost ${(entrySpeed - exitSpeed).toFixed(2)} m/s — no real drag`,
  );
  assert.ok(sawWobble, 'the soft foliage hazard injected no wobble');
});

test('a soft body is never a recorded safe position', () => {
  // Deep enough that the rider spends real time inside: three hedges in a
  // row. The safe position must lag behind the foliage, not sit inside it.
  const euc = controller({
    plan: flatPlan(),
    softBodies: [hedge(60), hedge(62.5), hedge(65)],
  });
  const input = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(8); i += 1) {
    euc.step(STEP, input);
    const state = euc.snapshot();
    assert.ok(
      state.safePosition.z < 58.9,
      `the safe position advanced to z=${state.safePosition.z} — inside or past the hedges`,
    );
    if (state.position.z > 66) break;
  }
});
