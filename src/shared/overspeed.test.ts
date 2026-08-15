/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUDIO, EUC } from '../data/tuning.ts';
import { overspeedBeepPeriod, overspeedLevel } from './overspeed.ts';

/**
 * The over-speed warning's arithmetic — M20.
 *
 * Small enough to look obvious and worth pinning anyway, because **this is the
 * one thing the owner specified numerically — and then revised by ear.** His
 * sketch: *"if player holds steady at 30 mph then thats 1 beep every 2
 * seconds, then it keeps increasing with speed until it is like very fast
 * beeps shortly before the cut out"*. After riding that build he moved both
 * numbers: the first beep to *"no earlier than 40mph"*, and the intervals to
 * *"the same intervals real euc beeps"* — which is why the endpoints asserted
 * below are measurements of the reference video's alarm cadence rather than
 * round numbers. The *shape* (a ramp a rider can read) is unchanged.
 */

const period = (factor: number): number => overspeedBeepPeriod(
  factor,
  AUDIO.overspeedSlowestPeriodSeconds,
  AUDIO.overspeedFastestPeriodSeconds,
);

test('both ends of the ramp are intervals the real alarm actually produces', () => {
  // Measured off the reference video by gating its 2565 Hz tone: the slowest
  // structured cadence sits around 0.9–1.1 s and the rapid alarm at
  // 0.125–0.165 s. The endpoints must stay inside those bands or the game is
  // back to inventing intervals, which is what the owner asked away.
  assert.ok(
    period(0) >= 0.9 && period(0) <= 1.1,
    `the bottom of the ramp is ${period(0)}s — outside the real alarm's slowest cadence`,
  );
  assert.ok(
    period(1) >= 0.125 && period(1) <= 0.165,
    `the top of the ramp is ${period(1)}s — outside the real alarm's rapid cadence`,
  );
  // The beep is 75 ms long. A period shorter than the sound is a drone with a
  // gap in it rather than a stream of beeps, and it is the failure the fastest
  // period was chosen against.
  assert.ok(
    period(1) > AUDIO.overspeedBeepSeconds,
    'the fastest beeps must still be shorter than the gap between them',
  );
});

test('the rate rises without a single flat spot on the way', () => {
  // Monotonic, and asserted across the whole ramp rather than at its ends,
  // because a rider reads *change* in this cue. A stretch where the rate held
  // still would read as the danger holding still, at the exact speeds where it
  // is not.
  let previous = Infinity;
  for (let step = 0; step <= 40; step += 1) {
    const value = period(step / 40);
    assert.ok(value < previous, `the period stopped falling at factor ${step / 40}`);
    previous = value;
  }
});

test('it is geometric, so equal steps of speed are equal ratios of rate', () => {
  // The design claim: every equal step up the band multiplies the rate by the
  // same amount. That is what makes a held speed recognisable by its rhythm —
  // the "riding the beeps" the owner named — where a linear ramp would sound
  // unchanged for two thirds of the band and then collapse.
  const ratio = (a: number, b: number): number => period(a) / period(b);
  const first = ratio(0, 0.25);
  for (const [a, b] of [[0.25, 0.5], [0.5, 0.75], [0.75, 1]] as const) {
    assert.ok(
      Math.abs(ratio(a, b) - first) < 1e-9,
      `the ${a}..${b} quarter speeds up by ${ratio(a, b)}, not ${first}`,
    );
  }
});

test('a factor outside the band returns an endpoint rather than extrapolating', () => {
  // The controller clamps, so these are unreachable in play. They are pinned
  // because an extrapolated period above 1 would be *shorter than the beep*,
  // and the caller that eventually hands over a raw ratio should not have to
  // know that.
  assert.equal(period(-3), period(0));
  assert.equal(period(9), period(1));
});

test('a nonsense tuning cannot produce a period of NaN or zero', () => {
  // Both endpoints are on F4. A zero or a negative one would make the
  // logarithm behind this `-Infinity` and the period `NaN`, which as a beep
  // interval means a beep that never stops — the worst possible failure for a
  // sound that already plays nine times a second.
  for (const [slowest, fastest] of [[0, 0.1], [2, 0], [-1, -1], [0, 0]] as const) {
    for (const factor of [0, 0.5, 1]) {
      const value = overspeedBeepPeriod(factor, slowest, fastest);
      assert.ok(Number.isFinite(value) && value > 0, `${slowest}/${fastest} at ${factor} gave ${value}`);
    }
  }
});

test('the three glyph steps split the ramp and none of them is the whole of it', () => {
  assert.equal(overspeedLevel(0), 'none');
  assert.equal(overspeedLevel(0.1), 'notice');
  assert.equal(overspeedLevel(0.5), 'warn');
  assert.equal(overspeedLevel(1), 'critical');
  // The top step must arrive with room to act on it. At the shipped shares the
  // last 22% of the band is about a mile and a half per hour, which is a second
  // or so of full throttle — enough to see the glyph turn red and lift off.
  assert.ok(overspeedLevel(0.77) !== 'critical' && overspeedLevel(0.79) === 'critical');
});

test('the first beep lands no earlier than the owner\'s 40 mph', () => {
  // The share is calibrated against the wheel rather than written as a speed
  // (M16's lesson), so this is the test that says what the share currently
  // *means*. If the ride's top speed moves, this figure moves with it by
  // design — and if the share is ever edited by hand, this is what notices.
  // "No earlier than 40mph" is the owner's own inequality after riding the
  // 30 mph build, so the floor is hard and the ceiling is just tidiness.
  const top = Math.sqrt((EUC.leanToAccel * Math.sin(EUC.maxLeanPitch)) / EUC.dragCoefficient);
  const firstBeepMph = top * EUC.overspeedBeepShare * 2.236936;
  assert.ok(
    firstBeepMph >= 40 && firstBeepMph < 41,
    `the beeps start at ${firstBeepMph.toFixed(1)} mph, and the owner asked for no earlier than 40`,
  );
});
