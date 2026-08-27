/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RENDER_QUANTUM_FRAMES, alignLoopToQuantum, createRandom, fillNoise, lowBandEnergyRatio, rms } from './noise.ts';

const SAMPLE_RATE = 48000;
const LENGTH = SAMPLE_RATE; // one second is plenty to characterise

test('the same seed always produces the same buffer', () => {
  // Determinism is what makes a browser capture of the wind reproducible, and
  // it is the reason `Math.random()` is not used here.
  const a = new Float32Array(1024);
  const b = new Float32Array(1024);
  fillNoise(a, 1234);
  fillNoise(b, 1234);
  assert.deepEqual([...a], [...b]);

  const c = new Float32Array(1024);
  fillNoise(c, 5678);
  assert.notDeepEqual([...a], [...c], 'different seeds must produce different noise');
});

test('a zero seed still generates noise', () => {
  // Zero is a fixed point of xorshift: without the guard the whole buffer is
  // silence, and the wind simply never arrives.
  const buffer = new Float32Array(2048);
  fillNoise(buffer, 0);
  assert.ok(rms(buffer) > 0.1, 'a zero seed produced silence');
});

test('the generator covers the full range without bias', () => {
  const random = createRandom(99);
  let min = Infinity;
  let max = -Infinity;
  let total = 0;
  const count = 200_000;
  for (let i = 0; i < count; i += 1) {
    const value = random();
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  assert.ok(min < -0.99 && max > 0.99, `range was ${min}..${max}`);
  assert.ok(Math.abs(total / count) < 0.01, 'a DC offset would waste headroom on silence');
});

test('every sample is finite and inside the unit range', () => {
  // A single NaN or an out-of-range sample reaches a Web Audio buffer and
  // stays there for the session, with no error anywhere.
  for (const colour of ['white', 'pink'] as const) {
    const buffer = new Float32Array(LENGTH);
    fillNoise(buffer, 7, colour);
    for (let i = 0; i < buffer.length; i += 1) {
      assert.ok(Number.isFinite(buffer[i]), `${colour} sample ${i} was ${buffer[i]}`);
      assert.ok(Math.abs(buffer[i]) <= 1.0000001, `${colour} sample ${i} clipped`);
    }
  }
});

test('both colours are normalised to a usable level', () => {
  // Without normalisation pink comes out of the filter far below white, and
  // the levels in AUDIO would be compensating for the generator rather than
  // describing the mix.
  const white = new Float32Array(LENGTH);
  const pink = new Float32Array(LENGTH);
  fillNoise(white, 11, 'white');
  fillNoise(pink, 11, 'pink');
  assert.ok(rms(white) > 0.2, `white RMS was ${rms(white)}`);
  assert.ok(rms(pink) > 0.1, `pink RMS was ${rms(pink)}`);
});

test('pink noise really is pink', () => {
  const white = new Float32Array(LENGTH);
  const pink = new Float32Array(LENGTH);
  fillNoise(white, 21, 'white');
  fillNoise(pink, 21, 'pink');
  const whiteLow = lowBandEnergyRatio(white, SAMPLE_RATE, 500);
  const pinkLow = lowBandEnergyRatio(pink, SAMPLE_RATE, 500);
  assert.ok(
    pinkLow > whiteLow * 3,
    `pink put ${pinkLow} of its energy below 500 Hz against white's ${whiteLow}`,
  );
});

test('a looping buffer has no seam', () => {
  // The failure this catches is a click once every three seconds, forever,
  // which is very hard to attribute to the wind once anything else is playing.
  const pink = new Float32Array(LENGTH);
  fillNoise(pink, 33, 'pink');

  const level = rms(pink);
  const seamStep = Math.abs(pink[0] - pink[LENGTH - 1]);
  // Compare the wrap-around step against the largest step found anywhere
  // inside the buffer: the loop point must be unremarkable, not merely small.
  let worstInternal = 0;
  for (let i = 1; i < LENGTH; i += 1) {
    const step = Math.abs(pink[i] - pink[i - 1]);
    if (step > worstInternal) worstInternal = step;
  }
  assert.ok(
    seamStep <= worstInternal,
    `the loop point stepped ${seamStep} where the buffer's worst internal step is ${worstInternal}`,
  );
  assert.ok(seamStep < level, `the loop point stepped ${seamStep} against an RMS of ${level}`);
});

test('an empty buffer is handled rather than throwing inside the boot path', () => {
  const empty = new Float32Array(0);
  fillNoise(empty, 1);
  assert.equal(rms(empty), 0);
  assert.equal(lowBandEnergyRatio(empty, SAMPLE_RATE, 500), 0);
});

/**
 * Quantum alignment — the Ubuntu hum fix, provable as arithmetic.
 *
 * The claim in `alignLoopToQuantum`'s comment is that the wrap lands on the
 * join the asset shipped with: the output's final sample is the input's final
 * sample, so the frame that follows it on loop — frame 0 — is the same frame
 * that always followed it.
 */
test('alignLoopToQuantum trims to a whole number of quanta and keeps the seam', () => {
  // 235,200 frames is the wind howl's decoded length at 48 kHz — the real
  // misaligned case (1837.5 quanta).
  const misaligned = new Float32Array(new ArrayBuffer(235200 * 4));
  for (let i = 0; i < misaligned.length; i += 1) misaligned[i] = Math.sin(i / 97) * 0.5;

  const out = alignLoopToQuantum(misaligned);
  assert.equal(out.length % RENDER_QUANTUM_FRAMES, 0, 'a whole number of quanta');
  assert.equal(out.length, 235136, 'the floor multiple, at most 127 frames shorter');
  assert.ok(
    Math.abs(out[out.length - 1] - misaligned[misaligned.length - 1]) < 1e-6,
    'the loop still ends on the sample whose successor was always frame 0',
  );
  // The body before the splice window is untouched.
  for (let i = 0; i < out.length - 64; i += 1) {
    if (out[i] !== misaligned[i]) assert.fail(`body altered at frame ${i}`);
  }
});

test('alignLoopToQuantum leaves aligned and degenerate buffers alone', () => {
  const aligned = new Float32Array(new ArrayBuffer(144000 * 4)); // the pink bed
  assert.equal(alignLoopToQuantum(aligned), aligned, 'the 3 s bed at 48 kHz is already aligned');

  const tiny = new Float32Array(new ArrayBuffer(100 * 4));
  assert.equal(alignLoopToQuantum(tiny), tiny, 'shorter than a quantum: nothing sane to trim');
});
