/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { createEuclaudeLevel } from '../level/euclaudeLevel.ts';
import { EUCLAUDE_LAUNCH_PADS, QUAY_GAPS } from '../level/euclaudeLines.ts';
import { cityLaunchPads } from '../level/launchPadSites.ts';
import type { LevelPlan } from '../level/plan.ts';
import { buildPopulationPlan } from '../level/populationPlan.ts';
import {
  EucController,
  createPose,
  type EucPose,
  type EucSnapshot,
  type EucTuning,
} from './EucController.ts';
import { LaunchPadField } from './launchPadField.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { RD_PELVIS } from './ragdoll.ts';

/**
 * M44 — a crash begun high in the air falls from where it is
 * (`EUC.crashHighFallMetres`, `EucController.beginCrash` / `stepCrash`).
 *
 * Before it, every crash started on the ground under the rider: the ragdoll
 * was seeded at `groundY` and the first crash step stood the wheel there. In
 * the older worlds that is a drop of a metre or two nobody can see; on
 * EUClaude Heights a short rider meets the far wall 8–11 m over the alley and
 * was on the alley floor 8 ms later. Above the threshold the body is now
 * seeded at the rider, falls undamped until it is within the threshold of its
 * floor, and the wheel falls under gravity, with no recovery until it is down.
 *
 * Two halves. **The fall** on a venue-free fixture (a 10 m deck, a 10 m gap,
 * a 12 m wall), so it holds whatever the venue's dressing does; the venue's
 * own rides are in `level/euclaudeLines.test.ts`. **Parity**: every crash
 * below the threshold — in the air or on the ground, EUClaude's 11 m roll-off
 * included — is bit-identical, pose, ragdoll and snapshot at every step
 * through the crash and the recovery, to the same ride with the threshold at
 * `Infinity`, which is the pre-M44 code path term for term.
 */

const STEP = 1 / SIMULATION.hz;
const THRESHOLD = EUC.crashHighFallMetres;

function input(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/** A paved run: a deck `deck` m high for 40 m, a `gap` m alley, then a 10 m long block `wall` m high. */
function ledgePlan(deck: number, gap: number, wall: number): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'run',
      length: 120,
      halfWidth: 20,
      surface: 'pavement',
      shoulder: 2,
      blocks: [
        { s: 20, t: 0, halfAlong: 20, halfLateral: 40, height: deck, surface: 'pavement' },
        { s: 40 + gap + 5, t: 0, halfAlong: 5, halfLateral: 40, height: wall, surface: 'pavement' },
      ],
    }],
    {
      id: 'ledge',
      spawn: { position: { x: 0, y: 0, z: 5 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 4,
    },
  );
}

/** The crash-ragdoll suite's wall: 1.4 m high across the run at z = 40. */
function wallPlan(): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'wall-run',
      length: 80,
      halfWidth: 30,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{ s: 40, t: 0, halfAlong: 0.5, halfLateral: 300, height: 1.4, surface: 'pavement' }],
    }],
    {
      id: 'wall',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 8,
    },
  );
}

/** The cutout is off: these rides are about the crash they name. */
function controller(plan: LevelPlan, tuning: Partial<EucTuning> = {}): EucController {
  return new EucController(new PlanTerrainSampler(plan), {
    spawn: plan.spawn,
    tuning: { cutoutEnabled: 0, ...tuning },
  });
}

/** The pelvis height in a fresh pose write (the particle block is world space). */
function pelvisY(euc: EucController, pose: EucPose = createPose()): number {
  euc.writePose(pose);
  return pose.ragdoll[RD_PELVIS * 3 + 1];
}

// ---------------------------------------------------------------------------
// The fall
// ---------------------------------------------------------------------------

/** Off the 10 m deck at 14 m/s into the 12 m wall across the 10 m alley, until the crash. */
function crashHigh(tuning: Partial<EucTuning> = {}): { euc: EucController; crash: EucSnapshot } {
  const plan = ledgePlan(10, 10, 12);
  const euc = controller(plan, tuning);
  assert.ok(euc.reset(plan.spawn, 14));
  for (let index = 0; index < 10 * SIMULATION.hz; index += 1) {
    euc.step(STEP, input({ throttle: euc.snapshot().speed < 14 ? 1 : 0 }));
    const snap = euc.snapshot();
    if (snap.crashed) return { euc, crash: snap };
  }
  assert.fail('the flight never met the wall');
}

test('the threshold sits well between every older airborne crash (1.13 m measured) and EUClaude\'s lowest wall hit (8.06 m)', () => {
  assert.equal(THRESHOLD, 3.0);
  assert.ok(THRESHOLD > 1.13 + 1.5 && THRESHOLD < 8.06 - 4, 'the recorded measurements in tuning.ts');
});

test('a crash 7.6 m up falls from there: the body seeded at the rider, the wheel down in sub-half-metre steps, then lying as any crash does', () => {
  const { euc, crash } = crashHigh();
  const pose = createPose();
  assert.equal(crash.crashCause, 'obstacle');
  assert.equal(crash.grounded, false, 'the crash began in the air');
  assert.ok(crash.airHeight > THRESHOLD + 3, `crash at ${crash.airHeight.toFixed(2)} m over the alley`);
  assert.ok(crash.verticalVelocity < 0, 'the flight was coming down when it met the wall');
  // The body starts where the rider is: hips over the wheel, not the alley floor.
  const seed = pelvisY(euc, pose);
  assert.ok(seed - crash.position.y > 0.5 && seed - crash.position.y < 1.0,
    `pelvis seeded ${(seed - crash.position.y).toFixed(3)} m over the wheel at ${crash.position.y.toFixed(2)} m`);

  // The wheel falls from its flight's own vertical speed under gravity: the
  // landing time is the ballistic one, to within the integrator's two steps.
  const g = euc.tuning.gravity;
  const vy = crash.verticalVelocity;
  const ballistic = (vy + Math.sqrt(vy * vy + 2 * g * crash.airHeight)) / g;
  let y = crash.position.y, steps = 0, maxDrop = 0, landedAt = -1;
  let bodyDownAt = -1, recoveredAt = -1;
  for (let index = 1; index <= 5 * SIMULATION.hz; index += 1) {
    euc.step(STEP, input());
    const snap = euc.snapshot();
    if (!snap.crashed) { recoveredAt = index * STEP; break; }
    steps = index;
    const drop = y - snap.position.y;
    assert.ok(drop >= 0, `step ${index}: the wheel rose ${(-drop).toFixed(4)} m`);
    maxDrop = Math.max(maxDrop, drop);
    y = snap.position.y;
    if (landedAt < 0) {
      if (snap.airHeight > 0) {
        assert.equal(snap.grounded, false, `step ${index}: grounded in the air`);
        assert.equal(snap.recoveryReady, false, `step ${index}: recovery offered mid-fall`);
      } else {
        landedAt = index * STEP;
      }
    } else {
      // Down: it lies there exactly as a crash begun on the ground does.
      assert.equal(snap.airHeight, 0, `step ${index}: the wheel left the floor again`);
      assert.equal(snap.grounded, true);
    }
    if (bodyDownAt < 0 && pelvisY(euc, pose) < 1.0) bodyDownAt = index * STEP;
  }
  assert.ok(maxDrop <= 0.5, `largest single-step drop ${maxDrop.toFixed(3)} m`);
  assert.ok(landedAt > 0.4, `the wheel reached the floor after ${landedAt.toFixed(3)} s, not in one step`);
  assert.ok(Math.abs(landedAt - ballistic) <= 2 * STEP, `landed at ${landedAt.toFixed(4)} s, ballistic ${ballistic.toFixed(4)} s`);
  assert.ok(landedAt < EUC.crashRecoverEarliestSeconds, 'down before any recovery opens');
  // The body falls too (undamped above the threshold) and is down before the recovery.
  assert.ok(bodyDownAt > landedAt - 0.2 && bodyDownAt < EUC.crashRecoverEarliestSeconds,
    `pelvis under 1 m at ${bodyDownAt.toFixed(3)} s`);
  // The recovery is the ordinary one: automatic at its own time, onto the deck it rode.
  assert.ok(Math.abs(recoveredAt - EUC.crashRecoverAutoSeconds) <= STEP, `recovered at ${recoveredAt.toFixed(3)} s (${steps} crash steps)`);
  const back = euc.snapshot();
  assert.equal(back.crashed, false);
  assert.ok(Math.abs(back.position.y - 10) < 1e-9, `restored on the deck, y ${back.position.y}`);
});

test('the same crash with the threshold at Infinity is the old teleport: body on the alley floor, wheel snapped down on the first step', () => {
  // The control: what the high fall replaced, measured on the same fixture.
  const { euc, crash } = crashHigh({ crashHighFallMetres: Infinity });
  assert.ok(crash.airHeight > THRESHOLD + 3);
  assert.ok(pelvisY(euc) - (crash.position.y - crash.airHeight) < 1.0, 'seeded at the floor');
  euc.step(STEP, input());
  assert.equal(euc.snapshot().airHeight, 0, 'the wheel stood on the floor one step later');
});

test('no recovery while the wheel is still falling: with the recovery clocks cut to 0.1 / 0.2 s, it waits for the wheel to land', () => {
  const { euc, crash } = crashHigh({ crashRecoverEarliestSeconds: 0.1, crashRecoverAutoSeconds: 0.2 });
  const g = euc.tuning.gravity, vy = crash.verticalVelocity;
  const ballistic = (vy + Math.sqrt(vy * vy + 2 * g * crash.airHeight)) / g;
  assert.ok(ballistic > 0.5, `a ${ballistic.toFixed(2)} s fall against a 0.2 s recovery`);
  let recoveredAt = -1;
  for (let index = 1; index <= 3 * SIMULATION.hz; index += 1) {
    euc.step(STEP, input({ throttle: 1 }));
    const snap = euc.snapshot();
    if (!snap.crashed) { recoveredAt = index * STEP; break; }
    assert.ok(snap.airHeight > 0, `step ${index}: down at ${(index * STEP).toFixed(3)} s and still not recovered`);
  }
  // Restored on the very step the wheel reaches the floor, which is when both clocks have long run out.
  assert.ok(Math.abs(recoveredAt - ballistic) <= 2 * STEP, `recovered at ${recoveredAt.toFixed(3)} s, landing due at ${ballistic.toFixed(3)} s`);
});

test('a quick reset in the middle of the fall ends it: the rider stands at the spawn and nothing keeps falling', () => {
  const { euc } = crashHigh();
  for (let index = 0; index < 20; index += 1) euc.step(STEP, input());
  assert.ok(euc.snapshot().crashed && euc.snapshot().airHeight > 1, 'mid-fall');
  assert.ok(euc.reset());
  for (let index = 0; index < 60; index += 1) {
    euc.step(STEP, input());
    const snap = euc.snapshot();
    assert.equal(snap.crashed, false);
    assert.equal(snap.airHeight, 0, `step ${index}: falling after the reset`);
    assert.ok(Math.abs(snap.position.y - 10) < 1e-9, 'on the deck at the spawn');
  }
});

// ---------------------------------------------------------------------------
// Parity: below the threshold, and on the ground, nothing moved
// ---------------------------------------------------------------------------

const BITS = new DataView(new ArrayBuffer(8));
function bits(value: number): string {
  BITS.setFloat64(0, value, true);
  return BITS.getBigUint64(0, true).toString(16);
}

/** Every field of a pose, numbers by their exact bits, the particle blocks element by element. */
function poseSignature(euc: EucController, pose: EucPose): string {
  euc.writePose(pose);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(pose)) {
    if (typeof value === 'number') parts.push(`${key}=${bits(value)}`);
    else if (value instanceof Float32Array) parts.push(`${key}=${Array.from(value, bits).join(',')}`);
    else parts.push(`${key}=${String(value)}`);
  }
  return parts.join(' ');
}

interface TwinRun {
  /** The first crashing snapshot of the default-tuned ride. */
  readonly crash: EucSnapshot | null;
  readonly crashes: number;
  readonly recoveries: number;
  readonly steps: number;
}

/**
 * Ride two controllers — the shipped threshold and `Infinity` — through the
 * same script and require the same pose (every field and particle, to the
 * bit) and the same snapshot after every step.
 */
function rideTwins(
  make: (tuning: Partial<EucTuning>) => EucController,
  script: (snap: EucSnapshot) => Partial<ActionSnapshot>,
  seconds: number,
): TwinRun {
  const shipped = make({});
  const before = make({ crashHighFallMetres: Infinity });
  const poseA = createPose(), poseB = createPose();
  let crash: EucSnapshot | null = null, recoveries = 0, wasCrashed = false;
  const steps = Math.round(seconds * SIMULATION.hz);
  for (let index = 0; index < steps; index += 1) {
    const held = input(script(shipped.snapshot()));
    shipped.step(STEP, held);
    before.step(STEP, held);
    const snapA = shipped.snapshot(), snapB = before.snapshot();
    assert.equal(JSON.stringify(snapA), JSON.stringify(snapB), `step ${index}: the snapshot moved`);
    assert.equal(poseSignature(shipped, poseA), poseSignature(before, poseB), `step ${index}: the pose moved`);
    if (snapA.crashed && crash === null) crash = snapA;
    if (wasCrashed && !snapA.crashed) recoveries += 1;
    wasCrashed = snapA.crashed;
  }
  return { crash, crashes: shipped.snapshot().crashes, recoveries, steps };
}

test('parity: a hop into a wall — an airborne crash 0.45 m up — is bit-identical through the crash and the recovery', () => {
  const plan = wallPlan();
  let hopped = false;
  const run = rideTwins((tuning) => controller(plan, tuning), (snap) => {
    const hop = !hopped && snap.position.z >= 32;
    if (hop) hopped = true;
    return { throttle: 1, hop };
  }, 9);
  assert.ok(run.crash, 'it crashed');
  assert.equal(run.crash.crashCause, 'obstacle');
  assert.equal(run.crash.grounded, false, 'in the air');
  assert.ok(run.crash.airHeight > 0.2 && run.crash.airHeight < THRESHOLD, `${run.crash.airHeight.toFixed(3)} m up`);
  assert.ok(run.recoveries >= 1, 'and recovered');
});

test('parity: off a 2.5 m ledge into a wall — an airborne crash 2.2 m up, just under the threshold — is bit-identical', () => {
  const plan = ledgePlan(2.5, 3, 5);
  const run = rideTwins((tuning) => {
    const euc = controller(plan, tuning);
    assert.ok(euc.reset(plan.spawn, 12));
    return euc;
  }, (snap) => ({ throttle: snap.speed < 12 ? 1 : 0 }), 8);
  assert.ok(run.crash, 'it crashed');
  assert.equal(run.crash.crashCause, 'obstacle');
  assert.equal(run.crash.grounded, false, 'in the air');
  assert.ok(run.crash.airHeight > 1.5 && run.crash.airHeight < THRESHOLD, `${run.crash.airHeight.toFixed(3)} m up`);
  assert.ok(run.recoveries >= 1, 'and recovered');
});

test('parity: a grounded wall crash at speed, its recovery and the held throttle after it, are bit-identical', () => {
  const plan = wallPlan();
  const run = rideTwins((tuning) => controller(plan, tuning), () => ({ throttle: 1 }), 14);
  assert.ok(run.crash, 'it crashed');
  assert.equal(run.crash.crashCause, 'obstacle');
  assert.equal(run.crash.grounded, true, 'on the ground');
  assert.ok(run.recoveries >= 1, `${run.crashes} crashes, ${run.recoveries} recoveries`);
});

test('parity: EUClaude\'s slow roll off a takeoff roof — an 11 m fall that crashes on landing — begins on the ground and is bit-identical', () => {
  const plan = createEuclaudeLevel();
  const sampler = new PlanTerrainSampler(plan);
  const pads = new LaunchPadField(cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths)));
  for (const gap of QUAY_GAPS.slice(0,1)) {
    const pad = EUCLAUDE_LAUNCH_PADS.find((one) => one.id === gap.padId);
    assert.ok(pad);
    // Beside the pad, as the euclaudeLines roll-off test starts it: the pad is missed.
    const off = { x: pad.x + 1 * 6, z: pad.z - 0 * 6 };
    const run = rideTwins((tuning) => {
      const euc = new EucController(sampler, { launchPads: pads, tuning });
      assert.ok(euc.reset({ position: { x: off.x, y: 0, z: off.z }, headingY: 0 }, 2));
      euc.setLaunchPadsArmed(true);
      return euc;
    }, (snap) => ({ throttle: snap.speed < 2.02 ? 1 : 0 }), 9);
    assert.ok(run.crash, `${gap.id}: it crashed`);
    assert.equal(run.crash.crashCause, 'landing', `${gap.id}: the alley floor is the crash`);
    assert.equal(run.crash.grounded, true, `${gap.id}: a landing crash begins on the ground`);
    assert.ok(run.recoveries >= 1, `${gap.id}: and recovered`);
  }
});
