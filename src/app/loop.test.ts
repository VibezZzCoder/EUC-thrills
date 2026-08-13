/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FixedStepLoop, type FrameSample, type LoopScheduler } from './loop.ts';
import { SIMULATION } from '../data/tuning.ts';

/**
 * The loop, tested against a fake clock.
 *
 * Every property worth having here is a property about *time*: a negative
 * frame boundary, a two-second stall, a first animation frame that never
 * arrives. None of those can be produced on demand in a real browser, and all
 * of them are trivial with an injected scheduler — which is why the scheduler
 * is injected.
 */

class FakeScheduler implements LoopScheduler {
  time = 0;

  private frameCallback: ((nowMs: number) => void) | null = null;
  private frameHandle = 0;
  private nextFrameHandle = 1;

  private readonly timers = new Map<number, { callback(): void; dueAt: number }>();
  private nextTimerHandle = 1;

  now(): number {
    return this.time;
  }

  requestFrame(callback: (nowMs: number) => void): number {
    this.frameCallback = callback;
    this.frameHandle = this.nextFrameHandle;
    this.nextFrameHandle += 1;
    return this.frameHandle;
  }

  cancelFrame(handle: number): void {
    if (handle === this.frameHandle) {
      this.frameCallback = null;
      this.frameHandle = 0;
    }
  }

  setTimer(callback: () => void, delayMs: number): number {
    const handle = this.nextTimerHandle;
    this.nextTimerHandle += 1;
    this.timers.set(handle, { callback, dueAt: this.time + delayMs });
    return handle;
  }

  clearTimer(handle: number): void {
    this.timers.delete(handle);
  }

  // ---- test controls ----

  get framePending(): boolean {
    return this.frameCallback !== null;
  }

  get pendingTimers(): number {
    return this.timers.size;
  }

  /** Deliver the pending animation frame with the given timestamp. */
  deliverFrame(atMs: number = this.time): boolean {
    const callback = this.frameCallback;
    if (!callback) return false;
    this.frameCallback = null;
    this.time = Math.max(this.time, atMs);
    callback(atMs);
    return true;
  }

  /**
   * Dequeue a frame callback without running it.
   *
   * This models the browser having already queued the callback for delivery:
   * cancelAnimationFrame can no longer retract it, but JavaScript has not run
   * it yet.
   */
  dequeueFrame(): ((nowMs: number) => void) | null {
    const callback = this.frameCallback;
    this.frameCallback = null;
    this.frameHandle = 0;
    return callback;
  }

  /** Advance the clock, firing due timers in order. */
  runUntil(targetMs: number): void {
    for (;;) {
      let nextHandle = -1;
      let nextDue = Infinity;
      for (const [handle, timer] of this.timers) {
        if (timer.dueAt < nextDue) {
          nextDue = timer.dueAt;
          nextHandle = handle;
        }
      }
      if (nextHandle === -1 || nextDue > targetMs) break;
      const timer = this.timers.get(nextHandle);
      this.timers.delete(nextHandle);
      this.time = nextDue;
      timer?.callback();
    }
    this.time = Math.max(this.time, targetMs);
  }
}

interface Harness {
  loop: FixedStepLoop;
  scheduler: FakeScheduler;
  steps: number[];
  renders: number[];
  samples: FrameSample[];
}

function harness(): Harness {
  const scheduler = new FakeScheduler();
  const steps: number[] = [];
  const renders: number[] = [];
  const samples: FrameSample[] = [];
  const loop = new FixedStepLoop(
    {
      step: (stepSeconds) => steps.push(stepSeconds),
      render: (alpha) => renders.push(alpha),
      onFrameSampled: (sample) => samples.push(sample),
    },
    scheduler,
  );
  return { loop, scheduler, steps, renders, samples };
}

test('a step is exactly 1 / SIMULATION.hz seconds', () => {
  const { loop } = harness();
  assert.equal(loop.stepSeconds, 1 / SIMULATION.hz);
});

test('whole steps are consumed and the remainder becomes the interpolation alpha', () => {
  const { loop, scheduler, steps, renders } = harness();
  loop.start();
  scheduler.deliverFrame(0);

  // 20 ms is two whole steps at 120 Hz plus 3.33 ms, which is 0.4 of a step.
  scheduler.deliverFrame(20);

  assert.equal(steps.length, 2);
  assert.equal(steps[0], 1 / SIMULATION.hz);
  assert.ok(
    Math.abs(renders[renders.length - 1] - 0.4) < 1e-9,
    `expected alpha 0.4, got ${renders[renders.length - 1]}`,
  );
});

test('a negative frame boundary cannot move the accumulator backwards', () => {
  const { loop, scheduler, steps } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  scheduler.deliverFrame(10);

  const afterForwardFrame = loop.stats().accumulatorSeconds;
  assert.equal(steps.length, 1);

  // A pending frame's timestamp describes when that frame began, so a clock
  // reset between then and delivery produces a negative delta. Without the
  // max(0, ...) clamp this subtracts from the accumulator.
  scheduler.deliverFrame(4);

  assert.equal(steps.length, 1, 'a negative delta must not produce or undo a step');
  assert.equal(loop.stats().accumulatorSeconds, afterForwardFrame);
  assert.ok(loop.stats().accumulatorSeconds >= 0);
});

test('catch-up is bounded and the excess is dropped rather than chased', () => {
  const { loop, scheduler, steps } = harness();
  loop.setMaxStepsPerFrame(5);
  loop.start();
  scheduler.deliverFrame(0);

  // A one-second stall is 120 steps' worth of owed time.
  scheduler.deliverFrame(1000);

  const stats = loop.stats();
  assert.equal(steps.length, 5, 'must not run more than the catch-up ceiling');
  assert.equal(stats.droppedSteps, 115);
  assert.ok(
    stats.accumulatorSeconds < loop.stepSeconds,
    'the accumulator must be left below one step, or the next frame spirals',
  );
});

test('freezing stops simulation while rendering continues', () => {
  const { loop, scheduler, steps, renders } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  const stepsBefore = steps.length;
  const rendersBefore = renders.length;

  loop.setRunning(false);
  scheduler.deliverFrame(100);
  scheduler.deliverFrame(200);

  assert.equal(steps.length, stepsBefore, 'a frozen loop must not step');
  assert.equal(renders.length, rendersBefore + 2, 'a frozen loop must keep rendering');
});

test('resuming does not replay the frozen interval as simulation time', () => {
  const { loop, scheduler, steps } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  loop.setRunning(false);

  scheduler.time = 5000;
  scheduler.deliverFrame(5000);

  loop.setRunning(true);
  const stepsAtResume = steps.length;

  scheduler.time = 5010;
  scheduler.deliverFrame(5010);

  assert.equal(
    steps.length - stepsAtResume,
    1,
    'five frozen seconds must not become 600 catch-up steps on resume',
  );
});

test('advance runs exactly N steps, forces a render, and marks it synthetic', () => {
  const { loop, scheduler, steps, renders, samples } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  loop.setRunning(false);

  const stepsBefore = steps.length;
  const rendersBefore = renders.length;
  loop.advance(240);

  assert.equal(steps.length - stepsBefore, 240);
  assert.equal(renders.length - rendersBefore, 1, 'stepping without drawing yields stale screenshots');
  // Renderers interpolate `lerp(previous, current, alpha)`, so the newest
  // state is at 1. Drawing a synthetic frame at 0 shows step 239 of 240 — a
  // whole step of staleness in the one frame whose entire purpose is to be
  // the exact state a spec asked for.
  assert.equal(renders[renders.length - 1], 1, 'a synthetic frame shows the state it was asked for');
  assert.equal(loop.stats().alpha, 1);

  const sample = samples[samples.length - 1];
  assert.equal(sample.synthetic, true);
  assert.equal(sample.steps, 240);
  assert.equal(loop.stats().syntheticFrames, 1);
});

test('advance does not also replay its steps as elapsed wall time', () => {
  const { loop, scheduler, steps } = harness();
  loop.start();
  scheduler.deliverFrame(0);

  scheduler.time = 500;
  loop.advance(10);
  const after = steps.length;

  // The next real frame must see the time since `advance`, not since the last
  // animation frame — otherwise every advance is paid for twice. Ten
  // milliseconds is one step; the half-second since the last frame would be
  // five, the catch-up ceiling.
  scheduler.deliverFrame(510);
  assert.equal(steps.length - after, 1);
});

test('a first animation frame that arrives cancels the probe and keeps RAF', () => {
  const { loop, scheduler } = harness();
  loop.start();
  assert.equal(scheduler.pendingTimers, 1, 'the probe should be armed');

  scheduler.deliverFrame(12);

  const stats = loop.stats();
  assert.equal(stats.mode, 'raf');
  assert.equal(stats.timerFallback, false);
  assert.equal(stats.firstFrameMs, 12);
  assert.equal(scheduler.pendingTimers, 0, 'the probe must be disarmed once a frame arrives');
});

test('a first animation frame that never arrives falls back to one timer chain', () => {
  const { loop, scheduler, renders } = harness();
  loop.start();

  // The browser exposes requestAnimationFrame and never calls back. The canvas
  // stays black and the debug overlay is frozen with it.
  scheduler.runUntil(SIMULATION.firstFrameProbeMs);

  const stats = loop.stats();
  assert.equal(stats.mode, 'timer');
  assert.equal(stats.timerFallback, true);
  assert.equal(scheduler.framePending, false, 'the abandoned RAF request must be cancelled');
  assert.equal(scheduler.pendingTimers, 1, 'exactly one scheduler owns the loop');

  const rendersBefore = renders.length;
  scheduler.runUntil(SIMULATION.firstFrameProbeMs + SIMULATION.fallbackIntervalMs * 3);
  assert.ok(renders.length > rendersBefore, 'the timer chain must actually drive frames');
  assert.equal(scheduler.pendingTimers, 1, 'the chain must never queue two timers at once');
});

test('a queued RAF callback cannot restart RAF after the timer fallback takes ownership', () => {
  const { loop, scheduler, renders } = harness();
  loop.start();

  // The browser dequeues the callback just before the probe expires. At that
  // point cancelAnimationFrame is too late to stop its eventual delivery.
  const staleFrame = scheduler.dequeueFrame();
  assert.ok(staleFrame, 'the initial RAF callback should have been queued');
  scheduler.runUntil(SIMULATION.firstFrameProbeMs);
  const rendersAtFallback = renders.length;

  staleFrame(SIMULATION.firstFrameProbeMs + 1);

  assert.equal(loop.stats().mode, 'timer');
  assert.equal(scheduler.framePending, false, 'a stale callback must not start a second RAF chain');
  assert.equal(scheduler.pendingTimers, 1, 'the timer chain must remain the only owner');
  assert.equal(renders.length, rendersAtFallback, 'the stale callback must not draw');
});

test('the fallback does not hand the dead interval to the accumulator', () => {
  const { loop, scheduler, steps } = harness();
  loop.start();
  scheduler.runUntil(SIMULATION.firstFrameProbeMs);

  // The probe window elapsed with nothing drawn. That is not simulation time.
  assert.equal(steps.length, 0);

  scheduler.runUntil(SIMULATION.firstFrameProbeMs + SIMULATION.fallbackIntervalMs);
  assert.ok(steps.length <= 3, `expected a normal frame's worth of steps, got ${steps.length}`);
});

test('dispose stops both schedulers', () => {
  const { loop, scheduler, renders } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  loop.dispose();

  assert.equal(scheduler.framePending, false);
  assert.equal(scheduler.pendingTimers, 0);

  const rendersBefore = renders.length;
  scheduler.runUntil(10_000);
  assert.equal(renders.length, rendersBefore, 'nothing may draw after disposal');
});

test('resetTime discards accumulated time without stepping', () => {
  const { loop, scheduler, steps } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  scheduler.deliverFrame(5);
  assert.ok(loop.stats().accumulatorSeconds > 0);

  const before = steps.length;
  loop.resetTime();
  assert.equal(loop.stats().accumulatorSeconds, 0);
  assert.equal(steps.length, before);
});

test('advance rejects a non-finite step count instead of hanging the tab', () => {
  const { loop, scheduler, steps, renders } = harness();
  loop.start();
  scheduler.deliverFrame(0);
  loop.setRunning(false);

  const stepsBefore = steps.length;

  // Infinity is the dangerous one: floor and max both pass it through, and
  // the step loop's `i < Infinity` never terminates — the QA bridge would
  // freeze the whole tab with no error. NaN merely stepped zero times, but
  // both should be refused for the same reason: a non-finite count is a
  // harness bug, and the answer to a harness bug is a no-op, not a guess.
  loop.advance(Number.POSITIVE_INFINITY);
  loop.advance(Number.NaN);
  loop.advance(-25);

  assert.equal(steps.length, stepsBefore, 'a non-finite or negative count must step zero times');
  assert.ok(renders.length > 0);
});

test('a step that resets the clock never renders a frame backwards', () => {
  // **The regression guard for a one-frame backwards pop.**
  //
  // A `step` callback may call `resetTime()` — every application state that
  // resets input does, through `Game.enterState`, and M10's transition to the
  // results screen is taken from inside the step. That zeroes the accumulator
  // mid-loop; the `while` body then subtracts one more step and leaves it at
  // −1/120, and `alpha` came out at exactly −1. The render frame extrapolated
  // the rider and the camera a whole step *backwards* — about a quarter of a
  // metre at speed, landing on the frame the player crosses the finish line.
  //
  // No browser spec could see it: `advance()` forces `alpha = 1`.
  const scheduler = new FakeScheduler();
  const alphas: number[] = [];
  let resetOnNextStep = false;

  const loop: FixedStepLoop = new FixedStepLoop(
    {
      step: () => {
        if (!resetOnNextStep) return;
        resetOnNextStep = false;
        loop.resetTime();
      },
      render: (alpha) => alphas.push(alpha),
    },
    scheduler,
  );

  loop.start();
  scheduler.deliverFrame(0);
  scheduler.deliverFrame(20);
  resetOnNextStep = true;
  scheduler.deliverFrame(40);
  scheduler.deliverFrame(60);

  for (const alpha of alphas) {
    assert.ok(alpha >= 0 && alpha <= 1, `alpha left the unit interval: ${alpha}`);
  }
  loop.dispose();
});
