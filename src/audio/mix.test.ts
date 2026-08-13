/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  BUS_IDS,
  FULL_VOLUMES,
  approach,
  busGain,
  centsToRatio,
  clamp01,
  dbToGain,
  duckToGain,
  equalPowerCrossfade,
  gainToDb,
  mapRange,
  powerSum,
  rollingHz,
  semitonesToRatio,
  stepDuck,
  volumeToGain,
  type BusVolumes,
} from './mix.ts';

/**
 * The mix arithmetic, asserted without an audio context.
 *
 * This is the whole reason `mix.ts` imports nothing (`docs/PLANS.md` §8.3,
 * master §15.2). Every one of the failures below is inaudible as a *cause* —
 * a listener hears "the tyre ducks on every kerb" and has no way to get from
 * there to a linear crossfade — but each is a one-line assertion here.
 */

test('a volume of zero is silent and a volume of one is unity', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(1), 1);
});

test('the volume curve is perceptual, not linear', () => {
  // A halfway fader must land near -12 dB, not at -6. The linear identity is
  // the mistake this curve exists to avoid: it spends its top half doing
  // nothing audible and its bottom tenth falling off a cliff.
  const half = gainToDb(volumeToGain(0.5));
  assert.ok(half < -10 && half > -14, `halfway fader landed at ${half} dB`);
  // Monotonic throughout, or a slider would move a value backwards somewhere.
  let previous = -1;
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const gain = volumeToGain(v);
    assert.ok(gain > previous, `volume ${v} did not increase the gain`);
    previous = gain;
  }
});

test('volumes out of range and non-finite values cannot produce a gain out of range', () => {
  for (const value of [-1, 2, NaN, Infinity, -Infinity]) {
    const gain = volumeToGain(value);
    assert.ok(gain >= 0 && gain <= 1, `volume ${value} produced gain ${gain}`);
  }
});

test('dB and gain round-trip', () => {
  for (const db of [-40, -12, -6, 0]) {
    assert.ok(Math.abs(gainToDb(dbToGain(db)) - db) < 1e-9);
  }
  // Silence is a floor rather than -Infinity, which would poison every sum.
  assert.equal(gainToDb(0), -120);
  assert.ok(Number.isFinite(gainToDb(0)));
});

test('the master multiplies every bus exactly once', () => {
  const volumes: BusVolumes = { master: 0.5, sfx: 0.5, ui: 1, music: 0.25 };
  for (const bus of BUS_IDS) {
    assert.equal(
      busGain(volumes, bus),
      volumeToGain(volumes.master) * volumeToGain(volumes[bus]),
      `${bus} did not apply master exactly once`,
    );
  }
  assert.equal(busGain(FULL_VOLUMES, 'sfx'), 1);
});

test('mute silences every bus regardless of the volumes', () => {
  for (const bus of BUS_IDS) {
    assert.equal(busGain(FULL_VOLUMES, bus, true), 0);
  }
});

test('the crossfade holds power constant, so a surface change does not dip', () => {
  // The failure this catches is a 3 dB dip in the middle of every transition
  // between two uncorrelated noise sources — which is what the tyre voices are,
  // and the slice crosses surfaces constantly.
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const { from, to } = equalPowerCrossfade(t);
    const power = from * from + to * to;
    assert.ok(Math.abs(power - 1) < 1e-9, `power was ${power} at t=${t}`);
  }
  assert.equal(equalPowerCrossfade(0).from, 1);
  assert.ok(Math.abs(equalPowerCrossfade(1).to - 1) < 1e-12);
  // A linear crossfade would fail exactly here, which is why the check exists.
  const middle = equalPowerCrossfade(0.5);
  assert.ok(middle.from > 0.7 && middle.to > 0.7);
});

test('the duck attacks faster than it releases', () => {
  const dt = 1 / 60;
  let fast = 0;
  let slow = 1;
  // Attack: from silence to a demand of 0.5, in 30 ms.
  for (let i = 0; i < 3; i += 1) fast = stepDuck(fast, 0.5, 0.03, 0.3, dt);
  // Release: from 0.5 back to nothing, over the same three frames.
  slow = 0.5;
  for (let i = 0; i < 3; i += 1) slow = stepDuck(slow, 0, 0.03, 0.3, dt);
  assert.ok(fast > 0.3, `duck reached only ${fast} in 50 ms — too slow to clear a beep`);
  assert.ok(slow > 0.35, `duck released to ${slow} in 50 ms — that fast is audible pumping`);
});

test('the duck cannot leave the unit range even with an absurd demand', () => {
  // A demand of 5 is a caller bug; the honest response is a full duck rather
  // than a bed gain that goes negative and inverts the phase of the whole mix.
  let duck = 0;
  for (let i = 0; i < 200; i += 1) duck = stepDuck(duck, 5, 0.03, 0.3, 1 / 60);
  assert.ok(duck <= 1 && duck > 0.999, `duck settled at ${duck}`);
  assert.ok(duckToGain(duck) >= 0);
  assert.equal(duckToGain(0), 1);
  assert.equal(duckToGain(2), 0);
});

test('a wheel rolling backwards makes the same noise as one rolling forwards', () => {
  assert.equal(rollingHz(-8, 0.25), rollingHz(8, 0.25));
  assert.equal(rollingHz(5, 0), 0);
});

test('the rolling frequency is the wheel circumference, not something near it', () => {
  // 0.5 m tyre at 15 m/s: 15 / (pi * 0.5) revolutions a second.
  const hz = rollingHz(15, 0.25);
  assert.ok(Math.abs(hz - 15 / (Math.PI * 0.5)) < 1e-12);
  assert.ok(hz > 9.5 && hz < 9.6, `top-speed rotation was ${hz} Hz`);
});

test('detune ratios are the musical ones', () => {
  assert.ok(Math.abs(centsToRatio(1200) - 2) < 1e-12);
  assert.equal(centsToRatio(0), 1);
  assert.ok(Math.abs(semitonesToRatio(12) - 2) < 1e-12);
  // A fifth, which is the interval the regen voice sits at.
  assert.ok(Math.abs(semitonesToRatio(7) - 1.4983) < 1e-3);
});

test('mapRange clamps at both ends rather than extrapolating', () => {
  assert.equal(mapRange(-5, 0, 10, 100, 200), 100);
  assert.equal(mapRange(50, 0, 10, 100, 200), 200);
  assert.equal(mapRange(5, 0, 10, 100, 200), 150);
  // A degenerate span must not divide by zero into a NaN that spreads through
  // the whole frame.
  assert.equal(mapRange(5, 3, 3, 100, 200), 100);
});

test('approach is framerate-independent', () => {
  // The same trajectory reached in one big step and in many small ones. The
  // `current += (target - current) * k` form fails this, and silently changes
  // its own time constant whenever SIMULATION.hz moves.
  const coarse = approach(0, 1, 0.2, 0.1);
  let fine = 0;
  for (let i = 0; i < 10; i += 1) fine = approach(fine, 1, 0.2, 0.01);
  assert.ok(Math.abs(coarse - fine) < 1e-12);
  assert.equal(approach(0.3, 1, 0.2, 0), 0.3);
  assert.equal(approach(0.3, 1, 0, 0.016), 1);
});

test('the power sum is the honest expectation, not the worst case', () => {
  assert.equal(powerSum([]), 0);
  assert.ok(Math.abs(powerSum([0.6, 0.8]) - 1) < 1e-12);
  // Four equal uncorrelated voices sum to twice one of them, not four times.
  assert.ok(Math.abs(powerSum([0.5, 0.5, 0.5, 0.5]) - 1) < 1e-12);
});

test('clamp01 rejects the values that reach it from a bad divide', () => {
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(Infinity), 1);
  assert.equal(clamp01(-Infinity), 0);
});
