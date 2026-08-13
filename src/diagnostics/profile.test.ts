/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FrameProfiler } from './profile.ts';

function sample(simMs: number, renderMs: number, synthetic = false, steps = 1) {
  return { simMs, renderMs, steps, synthetic };
}

test('percentiles describe only the frames actually recorded', () => {
  const profiler = new FrameProfiler(100);
  for (let i = 1; i <= 10; i += 1) profiler.record(sample(i, i * 2));

  const report = profiler.report();
  assert.equal(report.sampled, 10);
  // A partly filled ring must not sort its zeroed tail in with the samples;
  // that drags every percentile toward zero and makes the frame look free.
  assert.equal(report.simMs.p50, 5);
  assert.equal(report.simMs.worst, 10);
  assert.equal(report.renderMs.worst, 20);
});

test('a synthetic frame is excluded from timing but not from state accounting', () => {
  const profiler = new FrameProfiler(100);
  profiler.record(sample(4, 4));
  profiler.record(sample(999, 999, true, 240));

  const report = profiler.report();
  assert.equal(report.sampled, 1, 'frames nobody waited for are not a frame time');
  assert.equal(report.syntheticExcluded, 1);
  assert.equal(report.simMs.worst, 4);
  // Excluding an unsampled render's timing must not exclude the state it
  // changed (master starter 17.5), so its steps still count.
  assert.equal(report.steps, 241);
});

test('the window wraps and keeps only the most recent frames', () => {
  const profiler = new FrameProfiler(4);
  for (const value of [1, 1, 1, 1, 9, 9, 9, 9]) profiler.record(sample(value, value));

  const report = profiler.report();
  assert.equal(report.sampled, 4);
  assert.equal(report.saturated, true);
  assert.equal(report.simMs.p50, 9);
});

test('begin discards the previous window entirely', () => {
  const profiler = new FrameProfiler(8);
  profiler.record(sample(50, 50));
  profiler.record(sample(1, 1, true, 5));

  profiler.begin();

  const report = profiler.report();
  assert.equal(report.sampled, 0);
  assert.equal(report.syntheticExcluded, 0);
  assert.equal(report.steps, 0);
  assert.equal(report.simMs.worst, 0);
});

test('an empty window reports zeroes rather than NaN', () => {
  const report = new FrameProfiler(8).report();
  assert.equal(report.simMs.p50, 0);
  assert.equal(report.simMs.p99, 0);
  assert.equal(report.renderMs.worst, 0);
});

test('the report carries nothing that could be mistaken for a frame rate', () => {
  const report = new FrameProfiler(8).report();
  // Binding rule, not a preference (AGENTS.md, "Measuring performance"): frame
  // interval and FPS come from a human at a focused window, so there is
  // deliberately no field here anyone could quote as one.
  const forbidden = /fps|frameinterval|framems|frametime|hz/i;
  for (const key of Object.keys(report)) {
    assert.ok(!forbidden.test(key), `"${key}" reads like a frame-rate figure`);
  }
});
