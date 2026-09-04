/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, LIVE_TUNABLES } from '../data/tuning.ts';
import { lerp } from '../shared/maths.ts';
import {
  leanBlend,
  riderRollFor,
  settleStep,
  settleTargetFor,
  type LeanTuning,
} from './riderLean.ts';

/**
 * The rider's lean schedule — M30 Phase 3, `docs/PLANS.md` §30.3c.
 *
 * `simulation/riderLean.ts` is the one expression three readers share: the
 * controller's `writePose`, its `snapshot`, and the ghost. This file asserts
 * the schedule itself, so the controller's own tests can be about a *ride*
 * rather than about arithmetic, and so the two anchors are pinned by
 * something other than the code that implements them.
 *
 * The claim that matters most is the first one: **below the low anchor this is
 * the pre-M30 expression to the bit.** Not "close", not "within a tolerance" —
 * `===` over a grid, because the six sober digests (`EucController.test.ts`)
 * hash `riderRoll` at every fixed step and four of the six are still pinned to
 * numbers recorded before this schedule existed. If the low band moved by one
 * ulp anywhere, those pins would move and there would be no way to tell an
 * intended change from an accident.
 */

/** The expression `writePose` and `snapshot` carried from M2 to M30 Phase 3. */
function preM30(rollAngle: number, technicalTurn: number, t: LeanTuning): number {
  return rollAngle * lerp(
    t.riderUpperBodyRollFactor,
    t.technicalTurnUpperBodyRollFactor,
    Math.abs(technicalTurn),
  );
}

const ROLLS = [-0.6435, -0.4, -0.15, -1e-9, 0, 1e-9, 0.15, 0.4, 0.6435, 1.2];
const TECHNICAL = [-1, -0.6, -0.08, 0, 0.08, 0.6, 1];

test('below the low anchor the schedule is the pre-M30 expression, to the bit', () => {
  // Every speed at or under `carveLeanSpeed`, including the anchor itself and
  // every reverse speed — `speed` is signed and a rider backing up is below
  // the anchor by construction, which is why reverse needed no special case.
  const speeds = [-EUC.maxReverseSpeed, -6.7, -3, -0.5, 0, 0.5, 3, 5.999, EUC.carveLeanSpeed];
  let checked = 0;
  for (const speed of speeds) {
    for (const rollAngle of ROLLS) {
      for (const technicalTurn of TECHNICAL) {
        const scheduled = riderRollFor(rollAngle, rollAngle, technicalTurn, speed, EUC);
        assert.equal(
          scheduled,
          preM30(rollAngle, technicalTurn, EUC),
          `speed ${speed}, roll ${rollAngle}, technical ${technicalTurn}`,
        );
        checked += 1;
      }
    }
  }
  assert.equal(checked, speeds.length * ROLLS.length * TECHNICAL.length);
  // And the force lean is genuinely ignored down here: a `riderLean` that has
  // parted company with the wheel (which is Phase 2's business) may not leak
  // into the slow band the owner already approved.
  assert.equal(
    riderRollFor(0.3, 0.9, 0, 4, EUC),
    preM30(0.3, 0, EUC),
    'a saturated wheel below the anchor still poses off the wheel alone',
  );
});

test('at and above the high anchor the upper body takes the tuned share of the lean', () => {
  for (const speed of [EUC.carveLeanFullSpeed, 25, 29, 1e6]) {
    for (const riderLean of ROLLS) {
      assert.equal(
        riderRollFor(0, riderLean, 0, speed, EUC),
        riderLean * EUC.carveLeanShareTop,
        `the wheel's own roll cannot matter at ${speed} m/s`,
      );
      // At the shipped 1.0 the low term is annihilated exactly, so a wheel and
      // a rider that agree land on one line and `ridingRig.ts` writes a pelvis
      // hinge of zero. `lerp`'s endpoint is `from + (to - from)`, which is
      // exact here but is not guaranteed to be for every pair of doubles — see
      // the ulp note in the controller's own one-line test.
      assert.equal(
        riderRollFor(riderLean, riderLean, 0, speed, EUC),
        riderLean * EUC.carveLeanShareTop,
      );
    }
  }
  // A technical turn cannot reach up here either: it is faded out by
  // `technicalTurnFadeSpeed` long before, and the blend has annihilated its
  // term anyway.
  assert.equal(
    riderRollFor(0.5, 0.5, 1, 25, EUC),
    riderRollFor(0.5, 0.5, 0, 25, EUC),
  );
});

test('between the anchors the share climbs linearly, and it is a share of both terms', () => {
  const { carveLeanSpeed: low, carveLeanFullSpeed: high } = EUC;
  for (const at of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const speed = low + (high - low) * at;
    assert.ok(Math.abs(leanBlend(speed, EUC) - at) < 1e-12, `blend at ${speed}`);
    const roll = 0.6435;
    assert.ok(
      Math.abs(
        riderRollFor(roll, roll, 0, speed, EUC)
          - lerp(preM30(roll, 0, EUC), roll * EUC.carveLeanShareTop, at),
      ) < 1e-15,
      `the mid band is the straight line between the two ends at ${speed} m/s`,
    );
  }
  // Monotone in speed, and never below the slow share nor above the full one:
  // the owner's complaint was a rider who leans *less* the faster he goes, and
  // a non-monotone schedule would reintroduce it somewhere in the middle.
  const roll = 0.5;
  let previous = -Infinity;
  for (let speed = 0; speed <= 30; speed += 0.25) {
    const value = riderRollFor(roll, roll, 0, speed, EUC);
    assert.ok(value >= previous - 1e-15, `the share fell back at ${speed} m/s`);
    previous = value;
  }
  assert.ok(
    Math.abs(previous - roll * EUC.carveLeanShareTop) < 1e-15,
    'and it arrives at the full share',
  );
});

test('the low anchor is the speed the low-speed technique has finished fading at', () => {
  // Not a coincidence and not a duplicate constant: the two techniques must
  // never overlap, so the lean starts exactly where M16's hard technical turn
  // has faded to nothing. If one of these moves, the other moves with it or
  // there is a band where the wheel banks under a nearly upright rider *and*
  // the schedule is already asking him to hang off.
  assert.equal(EUC.carveLeanSpeed, EUC.technicalTurnFadeSpeed);
  assert.ok(EUC.carveLeanSpeed < EUC.carveLeanFullSpeed, 'and the span is positive');
});

test('the lean share at speed is on F4 within the range the clearance contracts sweep', () => {
  // Registered, because `Game.applyTuning` reads it by string path and a
  // missing entry *throws at boot*. `data/liveTuning.test.ts` greps for that;
  // this asserts the range, which is a decision rather than a wiring fact.
  const slider = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.carveLeanShareTop');
  assert.ok(slider, 'EUC.carveLeanShareTop is on the tuning panel');
  assert.equal(slider.min, 0.5, 'half a line is the floor');
  // **1.00 — the shipped value — since M30 Phase 2's QA.** The wheel's bank
  // saturates and the rider hangs inside it, which brings the Drunkard's can
  // 16 mm nearer his thigh before this share multiplies anything; another 12 mm
  // went the day the ridden sweep gained the sway oscillator's *phase* as an
  // axis. The can is now carried 8 mm outboard to hold the floor at all
  // (q114's lever, at last), and what that buys is the shipped share and not a
  // step past it: measured as ridden across the `?mph=` window with the phase
  // swept, 41.9 mm at 1.00 against a 40 mm floor and 39.8 mm at 1.01
  // (`render/riderClearanceRidden.test.ts`). §30.3d's rule — a maximum the
  // contracts cannot clear is lowered, never the other way round — applied for
  // the third time in this milestone.
  assert.equal(slider.max, 1, 'the ceiling is what the ridden clearance contract clears');
  assert.ok(
    slider.min <= EUC.carveLeanShareTop && EUC.carveLeanShareTop <= slider.max,
    `the shipped ${EUC.carveLeanShareTop} is inside the slider`,
  );
  // The two *speeds* are deliberately not on the panel: they are absolute
  // rather than a share of the top speed, so M30's A/B isolates the top speed
  // and a `?mph=65` build leans at 40 mph exactly as the shipped one does.
  for (const path of ['EUC.carveLeanSpeed', 'EUC.carveLeanFullSpeed']) {
    assert.equal(
      LIVE_TUNABLES.find((entry) => entry.path === path),
      undefined,
      `${path} is an anchor, not a knob`,
    );
  }

  // **The top of the slider still hangs the rider inside the machine**, and
  // since M30 Phase 2 that is true at 1.0 rather than only above it: the wheel
  // saturates at `atan(maxLateralG)` and `riderLean` carries the whole
  // cornering force, so the whole *share* of a force lean at the grip top is
  // already past the bank. q115's upward half is what the slider's maximum used
  // to buy and no longer does (that phase's QA lowered it onto the shipped
  // value); the hang itself is the schedule's, not the slider's.
  const bank = Math.atan(EUC.maxLateralG);
  const hungLean = Math.atan(EUC.carveGripTopG);
  assert.ok(
    Math.abs(riderRollFor(bank, hungLean, 0, 25, { ...EUC, carveLeanShareTop: slider.max }))
      > Math.abs(bank),
    'the top of the slider hangs the rider inside the machine',
  );
});

test('the schedule at the speeds a real full-lock carve actually settles at', () => {
  // Not an assertion so much as the record of what the ride does, printed so
  // the numbers in `docs/PLANS.md` §30.3c can be checked against the build
  // rather than against the plan. 20.58 m/s is the Phase 0 capture's measured
  // full-lock settling speed; the controller's own test measures the rest.
  const measured = [
    ['full-lock settling speed (Phase 0 capture)', 20.58],
    ['the pavement terminal the wheel actually reaches', 22.2523],
    ['the high anchor', EUC.carveLeanFullSpeed],
  ] as const;
  for (const [label, speed] of measured) {
    const blend = leanBlend(speed, EUC);
    const share = lerp(EUC.riderUpperBodyRollFactor, EUC.carveLeanShareTop, blend);
    console.log(
      `  ${label}: ${speed} m/s -> blend ${blend.toFixed(4)}, share ${share.toFixed(4)}`,
    );
  }
  assert.ok(
    Math.abs(leanBlend(20.58, EUC) - 0.8972) < 5e-4,
    'the Phase 0 full-lock carve sits 0.90 of the way up the schedule',
  );
  // **The high anchor is the terminal the wheel reaches, not the analytic
  // one.** §30.2 fact 1's 22.316 m/s is the terminal before the wheel's own
  // losses; the controller's asymptote on flat pavement is 22.2523 (the
  // `straight` sober digest's pin), and an anchor at 22.3 left a flat-out
  // ride 0.9971 of the way up the schedule — a hinge of 0.06°, one line for
  // every purpose but `===`, and never the line itself in ordinary play. The
  // anchor is 22.25 so that the flat terminal *is* the full share.
  assert.equal(leanBlend(22.2523, EUC), 1, 'the flat terminal reaches the full share');
  assert.ok(leanBlend(22.24, EUC) < 1, 'and a hundredth under it does not');
  assert.ok(EUC.carveLeanFullSpeed <= 22.2523, 'the anchor never rises above what the wheel reaches');
});

// ---------------------------------------------------------------------------
// The settle — M30 Phase 3b, `docs/PLANS.md` §30.8
// ---------------------------------------------------------------------------

/**
 * The owner rode Phase 3 and found the half of a lean a speed schedule cannot
 * see: *"the characters go V like a motorcycle… from leaning all the way left
 * to all the way right… very stiff… there is no transition."*
 *
 * `leanSettle` is the answer and it is a second clock, driven by the wheel's
 * roll **rate**. These tests own its arithmetic — the target curve, the linear
 * ramp, and the one property everything else rests on: **at settle 1 nothing
 * moved**, to the bit, which is what keeps every held carve, every capture
 * baseline and four of the six sober digests exactly where they were.
 */

const STEP = 1 / 120;

test('the settle target is one on a held bank and zero through a swing', () => {
  // The gate, at its own two anchors and either side of them. `carveLeanHoldRate`
  // is *inclusive*: a settled full-lock carve still creeps at 2.5e-3 rad/s and a
  // stick is never perfectly still, so "held" has to include a little movement
  // or the body would never reach the line at all.
  assert.equal(settleTargetFor(0, EUC), 1, 'a wheel that is not moving is holding');
  assert.equal(settleTargetFor(EUC.carveLeanHoldRate, EUC), 1, 'and so is one at the hold rate');
  assert.equal(settleTargetFor(-EUC.carveLeanHoldRate, EUC), 1, 'either way round');
  assert.equal(settleTargetFor(EUC.carveLeanSwingRate, EUC), 0, 'the swing rate is the old pose');
  assert.equal(settleTargetFor(-EUC.carveLeanSwingRate, EUC), 0);
  assert.equal(settleTargetFor(-50, EUC), 0, 'and nothing faster can go below zero');
  // Linear between, and symmetric in the sign of the rate: a flick left and a
  // flick right are the same transition.
  const mid = (EUC.carveLeanHoldRate + EUC.carveLeanSwingRate) / 2;
  assert.ok(Math.abs(settleTargetFor(mid, EUC) - 0.5) < 1e-15, 'half way is half');
  assert.equal(settleTargetFor(mid, EUC), settleTargetFor(-mid, EUC));
  // Monotone down, which is what makes "faster swing, less lean" a rule rather
  // than a shape that happens to hold at three points.
  let previous = 1;
  for (let rate = 0; rate <= 10; rate += 0.05) {
    const value = settleTargetFor(rate, EUC);
    assert.ok(value <= previous + 1e-15, `the target rose at ${rate} rad/s`);
    previous = value;
  }
  // A degenerate span is guarded exactly as `leanBlend`'s is — two equal rates
  // are a step function, never a NaN in the pose.
  const degenerate = { ...EUC, carveLeanHoldRate: 2, carveLeanSwingRate: 2 };
  assert.equal(settleTargetFor(1.99, degenerate), 1);
  assert.equal(settleTargetFor(2, degenerate), 0);
});

test('the ramp is linear and lands on exactly one and exactly zero', () => {
  // **Linear, not `approach`.** One line with the wheel is asserted with `===`
  // and the old pose through a flick is the whole ask, so the ramp has to
  // *arrive* at both ends rather than converge on them.
  const rise = STEP / EUC.carveLeanSettleIn;
  const fall = STEP / EUC.carveLeanSettleOut;

  // Up: equal steps all the way, then the last one lands on 1 and stays.
  let settle = 0;
  let steps = 0;
  const climb: number[] = [];
  while (settle < 1) {
    const next = settleStep(settle, 0, STEP, EUC);
    climb.push(next - settle);
    settle = next;
    steps += 1;
    assert.ok(steps < 1000, 'the ramp never arrived');
  }
  assert.equal(settle, 1, 'exactly one, not one minus an epsilon');
  assert.equal(settleStep(settle, 0, STEP, EUC), 1, 'and it stays there');
  assert.equal(steps, Math.ceil(1 / rise), `${steps} steps of ${rise}`);
  for (const step of climb.slice(0, -1)) {
    assert.ok(Math.abs(step - rise) < 1e-15, 'every step but the last is the same size');
  }
  assert.ok(climb[climb.length - 1]! <= rise + 1e-15, 'and the last one only ever short');
  // The time it takes is the constant, to within the step that lands on it.
  assert.ok(
    Math.abs(steps * STEP - EUC.carveLeanSettleIn) <= STEP,
    `${(steps * STEP).toFixed(4)} s against carveLeanSettleIn ${EUC.carveLeanSettleIn}`,
  );

  // Down: the same, at the settle-out rate, which is the faster of the two.
  settle = 1;
  steps = 0;
  while (settle > 0) {
    settle = settleStep(settle, 99, STEP, EUC);
    steps += 1;
    assert.ok(steps < 1000, 'the ramp never arrived');
  }
  assert.equal(settle, 0, 'exactly zero: the old pose, not nearly the old pose');
  assert.equal(settleStep(settle, 99, STEP, EUC), 0);
  assert.equal(steps, Math.ceil(1 / fall));
  assert.ok(
    EUC.carveLeanSettleOut < EUC.carveLeanSettleIn,
    'the body leaves the lean faster than it takes it, which is the mechanism',
  );
  // Never outside the range, whatever it is handed.
  for (const from of [0, 0.3, 1]) {
    for (const rate of [0, 0.5, 1.7, 3, 40]) {
      const value = settleStep(from, rate, STEP, EUC);
      assert.ok(value >= 0 && value <= 1, `settle left the range at ${from} / ${rate}`);
    }
  }
});

test('a settle of one is the schedule to the bit, everywhere', () => {
  // **The claim the whole change rests on.** `blend * 1` is exact for every
  // double, so the five-argument call and the six-argument one with the
  // default have to agree bit for bit — a held carve, a capture baseline and
  // four of the six sober digests all say so.
  const speeds = [-6.7, 0, 3, EUC.carveLeanSpeed, 7, 12, 20.58, EUC.carveLeanFullSpeed, 25, 1e6];
  let checked = 0;
  for (const speed of speeds) {
    for (const rollAngle of ROLLS) {
      for (const technicalTurn of TECHNICAL) {
        const five = riderRollFor(rollAngle, rollAngle, technicalTurn, speed, EUC);
        assert.equal(riderRollFor(rollAngle, rollAngle, technicalTurn, speed, EUC, 1), five);
        // And the default argument is that same 1.
        assert.equal(five, riderRollFor(rollAngle, rollAngle, technicalTurn, speed, EUC));
        checked += 1;
      }
    }
  }
  assert.equal(checked, speeds.length * ROLLS.length * TECHNICAL.length);
});

test('a settle of zero is the low-speed pose, at any speed', () => {
  // The other end, and it is the owner's sentence: *"the old leans in
  // between"*. At settle 0 the blend is annihilated and what is left is the
  // pre-M30 expression — the M16 pose he approved, with the pelvis hinge back.
  for (const speed of [7, 20.58, EUC.carveLeanFullSpeed, 29, 1e6]) {
    for (const rollAngle of ROLLS) {
      for (const technicalTurn of TECHNICAL) {
        assert.equal(
          riderRollFor(rollAngle, rollAngle, technicalTurn, speed, EUC, 0),
          preM30(rollAngle, technicalTurn, EUC),
          `settle 0 at ${speed} m/s must pose off the wheel alone`,
        );
      }
    }
  }
  // And in between it is the same straight line the speed blend draws, so the
  // body only ever slides *down* the schedule it is already on — it can never
  // lean the other way from the wheel, which is what `ridingRig.ts` and the
  // clearance contracts rely on.
  const roll = 0.6435;
  for (const settle of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const scheduled = riderRollFor(roll, roll, 0, 25, EUC, settle);
    assert.ok(
      Math.abs(scheduled - lerp(preM30(roll, 0, EUC), roll * EUC.carveLeanShareTop, settle)) < 1e-15,
      `settle ${settle} is the same line the speed blend walks`,
    );
    assert.equal(Math.sign(scheduled), Math.sign(roll), 'and always into the turn');
    assert.ok(Math.abs(scheduled) <= Math.abs(roll) + 1e-15, 'never past the wheel at share 1');
  }
  // Monotone in the settle, which is the transition being a transition.
  let previous = -Infinity;
  for (let settle = 0; settle <= 1; settle += 0.01) {
    const value = riderRollFor(roll, roll, 0, 25, EUC, settle);
    assert.ok(value >= previous - 1e-15, `the share fell back at settle ${settle}`);
    previous = value;
  }
});

test('the settle constants are on the table, and its two knobs are on F4', () => {
  // The four are `data/tuning.ts`' (invariant 4) and three of them are on the
  // panel, because a transition is a taste and his ride is what judges it
  // (q123). `carveLeanHoldRate` is deliberately absent, exactly as the two
  // speed anchors are: it is the gate's floor rather than its shape.
  assert.equal(EUC.carveLeanHoldRate, 0.5);
  assert.equal(EUC.carveLeanSwingRate, 3.0);
  assert.equal(EUC.carveLeanSettleIn, 0.35);
  assert.equal(EUC.carveLeanSettleOut, 0.06);
  assert.ok(
    EUC.carveLeanHoldRate < EUC.carveLeanSwingRate,
    'the gate has a positive span, so the ramp is a ramp',
  );
  assert.ok(
    EUC.carveLeanSettleOut < EUC.carveLeanSettleIn,
    'and the body drops out of the lean faster than it climbs back in',
  );

  const panel = new Map(LIVE_TUNABLES.map((entry) => [entry.path, entry]));
  const expected = [
    ['EUC.carveLeanSettleIn', 'Lean settle-in (s)', 0.05, 1.0, 0.01, EUC.carveLeanSettleIn],
    ['EUC.carveLeanSettleOut', 'Lean settle-out (s)', 0.02, 0.3, 0.01, EUC.carveLeanSettleOut],
    ['EUC.carveLeanSwingRate', 'Lean swing rate', 1, 8, 0.1, EUC.carveLeanSwingRate],
  ] as const;
  for (const [path, label, min, max, step, shipped] of expected) {
    const entry = panel.get(path);
    assert.ok(entry, `${path} is not on the tuning panel`);
    assert.equal(entry.label, label);
    assert.equal(entry.group, 'Ride — carve');
    assert.equal(entry.min, min, `${path} minimum`);
    assert.equal(entry.max, max, `${path} maximum`);
    assert.equal(entry.step, step, `${path} step`);
    assert.ok(min <= shipped && shipped <= max, `the shipped ${shipped} is inside the ${path} slider`);
  }
  assert.equal(
    panel.get('EUC.carveLeanHoldRate'),
    undefined,
    'the hold rate is the gate\'s floor, not a knob',
  );
  // A tunable is only testable by moving it (AGENTS.md, M26): the slider's own
  // ends have to be distinguishable poses, not decoration.
  const slow = { ...EUC, carveLeanSettleOut: 0.3 };
  const quick = { ...EUC, carveLeanSettleOut: 0.02 };
  assert.ok(
    settleStep(1, 99, STEP, slow) > settleStep(1, 99, STEP, quick),
    'a longer settle-out holds more of the lean into the swing',
  );
  const lazy = { ...EUC, carveLeanSettleIn: 1.0 };
  assert.ok(
    settleStep(0, 0, STEP, lazy) < settleStep(0, 0, STEP, EUC),
    'and a longer settle-in comes back later',
  );
  const twitchy = { ...EUC, carveLeanSwingRate: 8 };
  assert.ok(
    settleTargetFor(3, twitchy) > settleTargetFor(3, EUC),
    'a higher swing rate keeps the full lean through a faster flick',
  );
});
