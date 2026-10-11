/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FrameRateMeter } from './frameRateMeter.ts';

/**
 * Synthetic clocks only. These are inputs the test chooses, not a measurement
 * of any machine's frame rate (AGENTS invariant 11): the meter is the owner's
 * instrument and its arithmetic is what is verified here.
 */

function tick(meter: FrameRateMeter, startMs: number, stepMs: number, count: number): number {
  let now = startMs;
  for (let i = 0; i < count; i += 1) {
    meter.sample(now);
    now += stepMs;
  }
  return now;
}

test('16.667 ms ticks settle on 60 FPS', () => {
  const meter = new FrameRateMeter();
  tick(meter, 1000, 1000 / 60, 120);
  assert.equal(meter.text, '60 FPS');
});

test('33.3 ms ticks settle on 30 FPS', () => {
  const meter = new FrameRateMeter();
  tick(meter, 0, 33.3, 60);
  assert.equal(meter.text, '30 FPS');
});

test('the text is empty until the first window closes', () => {
  const meter = new FrameRateMeter();
  assert.equal(meter.text, '');
  // 29 intervals of 16.667 ms is 483 ms: the 500 ms window is still open.
  tick(meter, 0, 1000 / 60, 30);
  assert.equal(meter.text, '');
  meter.sample(31 * (1000 / 60));
  assert.notEqual(meter.text, '');
  assert.match(meter.text, /^\d{1,3} FPS$/);
});

test('a 5 s gap restarts the window instead of averaging the stall in', () => {
  const meter = new FrameRateMeter();
  let now = tick(meter, 0, 1000 / 60, 61);
  assert.equal(meter.text, '60 FPS');
  // A hidden tab: the next frame is five seconds later. Averaged in, the next
  // window would read a single-digit figure; restarted, it reads the frames
  // that follow the gap and nothing else.
  now += 5000;
  meter.sample(now);
  assert.equal(meter.text, '60 FPS', 'the gap does not blank or rewrite the readout');
  tick(meter, now + 1000 / 30, 1000 / 30, 20);
  assert.equal(meter.text, '30 FPS');
});

test('a clock that runs backwards is clamped to a restart, never a negative figure', () => {
  const meter = new FrameRateMeter();
  const now = tick(meter, 10_000, 1000 / 60, 40);
  const before = meter.text;
  meter.sample(now - 400);
  assert.equal(meter.text, before, 'a backwards step settles nothing');
  tick(meter, now - 400 + 1000 / 60, 1000 / 60, 40);
  assert.equal(meter.text, '60 FPS');
  assert.ok(!meter.text.includes('-'));
});

test('the text changes at most once per window', () => {
  const meter = new FrameRateMeter();
  let now = 0;
  let changes = 0;
  let last = meter.text;
  // An uneven clock alternating 8 ms and 25 ms frames for three seconds.
  for (let i = 0; i < 400; i += 1) {
    meter.sample(now);
    if (meter.text !== last) {
      changes += 1;
      last = meter.text;
    }
    now += i % 2 === 0 ? 8 : 25;
  }
  const windows = Math.floor(now / 500);
  assert.ok(changes <= windows, `${changes} text changes in ${windows} windows`);
});

test('the figure is clamped to three digits', () => {
  const meter = new FrameRateMeter();
  tick(meter, 0, 0.1, 6000);
  assert.equal(meter.text, '999 FPS');
});

test('reset forgets the text and the open window', () => {
  const meter = new FrameRateMeter();
  tick(meter, 0, 1000 / 60, 61);
  assert.notEqual(meter.text, '');
  meter.reset();
  assert.equal(meter.text, '');
  tick(meter, 50_000, 1000 / 60, 10);
  assert.equal(meter.text, '', 'a reset meter waits for a whole fresh window');
});

test('restartWindow keeps the readout and counts only the frames after it', () => {
  const meter = new FrameRateMeter();
  let now = tick(meter, 0, 1000 / 60, 61);
  assert.equal(meter.text, '60 FPS');
  // A tab hidden for 300 ms (under the gap rule's second) and shown again:
  // the window restarts, the text stays, so the readout never blinks out.
  meter.restartWindow();
  assert.equal(meter.text, '60 FPS', 'restarting the window keeps the settled text');
  now += 300;
  now = tick(meter, now, 1000 / 30, 10);
  assert.equal(meter.text, '60 FPS', 'still the old figure until a fresh window closes');
  tick(meter, now, 1000 / 30, 10);
  assert.equal(meter.text, '30 FPS', 'the hidden 300 ms was never averaged in');
});

test('non-finite timestamps are ignored', () => {
  const meter = new FrameRateMeter();
  meter.sample(Number.NaN);
  meter.sample(Number.POSITIVE_INFINITY);
  tick(meter, 0, 1000 / 60, 61);
  assert.equal(meter.text, '60 FPS');
});
