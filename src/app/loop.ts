/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SIMULATION } from '../data/tuning.ts';

/**
 * The fixed-step loop, and the project's single frame owner.
 *
 * Simulation advances in whole steps of `1 / SIMULATION.hz` driven by an
 * accumulator; rendering happens once per frame and is handed an interpolation
 * factor between the two most recent states. Everything time-dependent in the
 * game hangs off this file, so three properties are load-bearing:
 *
 *   1. **The frame boundary is clamped to a non-negative value.** A pending
 *      animation-frame timestamp describes when its frame *began*, and a clock
 *      reset between that moment and callback delivery produces a negative
 *      first frame — which would drive the accumulator backwards
 *      (master starter 5.2). `max(0, now - lastTime)`, tested directly.
 *   2. **Catch-up is bounded.** Beyond `maxStepsPerFrame` the excess time is
 *      dropped rather than chased, because a loop that tries to catch up from
 *      a two-second stall spends the next several frames making the stall
 *      worse.
 *   3. **There is exactly one scheduler running at a time** — either
 *      requestAnimationFrame or the timer fallback, never both.
 *
 * No DOM and no `three` here. The scheduler is injected, so the whole loop is
 * unit-testable under `node --test` with a fake clock, which is the only way
 * to test a negative first frame or a two-second stall deterministically.
 */

/** Everything the loop needs from the host environment. */
export interface LoopScheduler {
  /** Monotonic milliseconds. Must share a clock with the frame timestamps. */
  now(): number;
  requestFrame(callback: (nowMs: number) => void): number;
  cancelFrame(handle: number): void;
  setTimer(callback: () => void, delayMs: number): number;
  clearTimer(handle: number): void;
}

export interface LoopCallbacks {
  /**
   * Runs once per frame before any stepping — viewport polling and other
   * cheap idempotent housekeeping. Not called for synthetic `advance` frames,
   * which must not depend on wall time having passed.
   */
  beforeFrame?(nowMs: number): void;
  /** One fixed simulation step. */
  step(stepSeconds: number): void;
  /**
   * Draw. `alpha` is the fraction of a step elapsed since the last one, for
   * interpolating between the two most recent states. `synthetic` marks a
   * frame drawn on demand by `advance()`.
   */
  render(alpha: number, synthetic: boolean): void;
  /** One timing sample per drawn frame. */
  onFrameSampled?(sample: FrameSample): void;
}

export interface FrameSample {
  /** Milliseconds spent inside `step`, summed over this frame's steps. */
  readonly simMs: number;
  /** Milliseconds spent inside `render`. */
  readonly renderMs: number;
  readonly steps: number;
  /**
   * True for a frame produced by `advance()`.
   *
   * Its timing must stay out of any frame-time window — synthetic frames
   * assemble into a flat, perfect percentile that nobody waited for. Its
   * *state* changes must not (master starter 17.5): the shader programs it
   * compiled are still compiled, and attributing them to the next real frame
   * would misreport that frame's cost.
   */
  readonly synthetic: boolean;
}

export type LoopMode = 'idle' | 'raf' | 'timer' | 'stopped';

export interface LoopStats {
  /** Frames drawn, synthetic ones included. */
  readonly frames: number;
  /** Frames drawn by `advance()`. */
  readonly syntheticFrames: number;
  /** Fixed steps executed, ever. */
  readonly steps: number;
  /** Steps deliberately discarded after hitting the catch-up ceiling. */
  readonly droppedSteps: number;
  readonly stepsLastFrame: number;
  readonly running: boolean;
  readonly mode: LoopMode;
  /** Interpolation factor handed to the most recent render, 0..1. */
  readonly alpha: number;
  /** Unconsumed simulation time, seconds. Always below one step. */
  readonly accumulatorSeconds: number;
  /** True once the first-frame probe gave up on requestAnimationFrame. */
  readonly timerFallback: boolean;
  /**
   * How long the first animation frame took to arrive, milliseconds, or null
   * if it has not arrived. Diagnostic only — never a performance figure.
   */
  readonly firstFrameMs: number | null;
}

/** The real browser scheduler. Built lazily so this module still loads in Node. */
export function createBrowserScheduler(): LoopScheduler {
  return {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (handle) => window.clearTimeout(handle),
  };
}

export class FixedStepLoop {
  readonly stepSeconds: number;

  private readonly scheduler: LoopScheduler;
  private readonly callbacks: LoopCallbacks;

  private maxStepsPerFrame: number = SIMULATION.maxStepsPerFrame;

  private accumulator = 0;
  private lastTimeMs = 0;
  private startedAtMs = 0;
  private alpha = 0;

  private running = true;
  private mode: LoopMode = 'idle';
  private timerFallback = false;
  private firstFrameMs: number | null = null;

  private frameHandle = 0;
  private timerHandle = 0;
  private probeHandle = 0;

  private frames = 0;
  private syntheticFrames = 0;
  private steps = 0;
  private droppedSteps = 0;
  private stepsLastFrame = 0;

  constructor(callbacks: LoopCallbacks, scheduler: LoopScheduler) {
    this.callbacks = callbacks;
    this.scheduler = scheduler;
    this.stepSeconds = 1 / SIMULATION.hz;
  }

  /**
   * Start the loop on requestAnimationFrame, and arm the first-frame probe.
   *
   * A browser can expose `requestAnimationFrame` and never deliver the first
   * callback. The DOM renders, the canvas stays black, and the debug overlay
   * is frozen too — because it is drawn by the loop that never started. If the
   * probe expires first, the RAF request is cancelled and one timer chain
   * takes over as the sole owner (master starter 12).
   */
  start(): void {
    if (this.mode !== 'idle') return;
    this.mode = 'raf';
    this.startedAtMs = this.scheduler.now();
    this.lastTimeMs = this.startedAtMs;
    this.accumulator = 0;
    this.frameHandle = this.scheduler.requestFrame(this.onAnimationFrame);
    this.probeHandle = this.scheduler.setTimer(
      this.onProbeExpired,
      SIMULATION.firstFrameProbeMs,
    );
  }

  /**
   * Freeze or resume simulation. Rendering continues either way, which is what
   * makes frame-accurate capture of a transient possible: freeze, `advance` to
   * the exact step you want to look at, then screenshot (master starter 16.1).
   */
  setRunning(running: boolean): void {
    if (this.running === running) return;
    this.running = running;
    // Resuming must not replay the frozen interval as elapsed simulation time.
    if (running) this.resetTime();
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Forget accumulated time and re-anchor the clock.
   *
   * Called on resume, visibility change, blur, restart, and menu return. The
   * caller is responsible for clearing held input at the same moments
   * (master starter 8.2) — the loop does not own input.
   */
  resetTime(): void {
    this.lastTimeMs = this.scheduler.now();
    this.accumulator = 0;
  }

  /** Live-tunable catch-up ceiling. Values below one step would stall the sim. */
  setMaxStepsPerFrame(steps: number): void {
    this.maxStepsPerFrame = Math.max(1, Math.floor(steps));
  }

  /**
   * Run exactly `steps` fixed steps through the real update path, then draw.
   *
   * The QA bridge's primary tool. Stepping without forcing a render silently
   * produces stale screenshots, so the draw is not optional. The accumulator
   * and the clock are re-anchored so the injected steps are not also replayed
   * as elapsed wall time on the next real frame.
   *
   * **The draw is at `alpha = 1`, not 0.** Under the interpolation convention
   * every renderer here uses — `lerp(previousState, currentState, alpha)` —
   * zero draws the state *before* the most recent step, which is the
   * conventional one-step display latency and exactly right during play. It is
   * exactly wrong for `advance()`, whose entire purpose is to reach a named
   * state and photograph it: at zero, `advance(240)` draws step 239. That is
   * invisible while the only stepped quantity is a slow camera orbit, and it
   * is about 9 cm of rider at cruising speed. One is a rounding error and the
   * other is a screenshot assertion that quietly does not contain the effect
   * it names.
   */
  advance(steps: number): void {
    if (this.mode === 'stopped') return;
    // A non-finite count must be rejected before the arithmetic: floor and
    // max both pass Infinity straight through, and `i < Infinity` is an
    // infinite loop that hangs the tab with no error and no way back.
    const count = Number.isFinite(steps) ? Math.max(0, Math.floor(steps)) : 0;

    const simStart = this.scheduler.now();
    for (let i = 0; i < count; i += 1) this.callbacks.step(this.stepSeconds);
    const simMs = this.scheduler.now() - simStart;

    this.steps += count;
    this.stepsLastFrame = count;
    this.accumulator = 0;
    this.alpha = 1;
    this.lastTimeMs = this.scheduler.now();

    const renderStart = this.scheduler.now();
    this.callbacks.render(1, true);
    const renderMs = this.scheduler.now() - renderStart;

    this.frames += 1;
    this.syntheticFrames += 1;
    this.callbacks.onFrameSampled?.({ simMs, renderMs, steps: count, synthetic: true });
  }

  stats(): LoopStats {
    return {
      frames: this.frames,
      syntheticFrames: this.syntheticFrames,
      steps: this.steps,
      droppedSteps: this.droppedSteps,
      stepsLastFrame: this.stepsLastFrame,
      running: this.running,
      mode: this.mode,
      alpha: this.alpha,
      accumulatorSeconds: this.accumulator,
      timerFallback: this.timerFallback,
      firstFrameMs: this.firstFrameMs,
    };
  }

  dispose(): void {
    this.mode = 'stopped';
    if (this.frameHandle) this.scheduler.cancelFrame(this.frameHandle);
    if (this.timerHandle) this.scheduler.clearTimer(this.timerHandle);
    if (this.probeHandle) this.scheduler.clearTimer(this.probeHandle);
    this.frameHandle = 0;
    this.timerHandle = 0;
    this.probeHandle = 0;
  }

  private readonly onAnimationFrame = (nowMs: number): void => {
    // Cancelling an animation-frame request is best-effort once the browser has
    // already queued its callback. If that stale callback arrives after the
    // first-frame probe switched ownership to the timer chain, it must not
    // schedule a new RAF chain alongside the timer. Mode is the authority;
    // the callback merely belongs to it while RAF still owns the loop.
    if (this.mode !== 'raf') return;
    if (this.probeHandle) {
      this.scheduler.clearTimer(this.probeHandle);
      this.probeHandle = 0;
      this.firstFrameMs = Math.max(0, nowMs - this.startedAtMs);
    }
    // Re-request before running the frame, so a throw inside the frame does not
    // silently end the loop.
    this.frameHandle = this.scheduler.requestFrame(this.onAnimationFrame);
    this.runFrame(nowMs);
  };

  private readonly onProbeExpired = (): void => {
    this.probeHandle = 0;
    if (this.mode !== 'raf') return;

    if (this.frameHandle) this.scheduler.cancelFrame(this.frameHandle);
    this.frameHandle = 0;
    this.mode = 'timer';
    this.timerFallback = true;
    // The clock has been running while nothing was delivered; do not hand that
    // interval to the accumulator as simulation time.
    this.resetTime();
    this.scheduleTimer();
  };

  private readonly onTimerTick = (): void => {
    this.timerHandle = 0;
    if (this.mode !== 'timer') return;
    this.scheduleTimer();
    this.runFrame(this.scheduler.now());
  };

  private scheduleTimer(): void {
    this.timerHandle = this.scheduler.setTimer(
      this.onTimerTick,
      SIMULATION.fallbackIntervalMs,
    );
  }

  private runFrame(nowMs: number): void {
    // See property 1 at the top of this file. This clamp is the whole reason
    // a negative frame boundary cannot move the accumulator backwards.
    const deltaSeconds = Math.max(0, nowMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = nowMs;

    this.callbacks.beforeFrame?.(nowMs);

    let steps = 0;
    let simMs = 0;

    if (this.running) {
      this.accumulator += deltaSeconds;

      const simStart = this.scheduler.now();
      while (this.accumulator >= this.stepSeconds && steps < this.maxStepsPerFrame) {
        this.callbacks.step(this.stepSeconds);
        this.accumulator -= this.stepSeconds;
        steps += 1;
      }
      simMs = this.scheduler.now() - simStart;

      // Hit the ceiling with whole steps still owed: drop them. Chasing them
      // over the following frames is what turns one stall into a spiral. The
      // sub-step remainder is kept so interpolation does not jump.
      if (this.accumulator >= this.stepSeconds) {
        const dropped = Math.floor(this.accumulator / this.stepSeconds);
        this.droppedSteps += dropped;
        this.accumulator -= dropped * this.stepSeconds;
      }

      // **The accumulator can be negative here, and the clamp is not defensive
      // padding.**
      //
      // A `step` callback is allowed to call `resetTime()` — every application
      // state that resets input does, through `Game.enterState` — and that
      // zeroes the accumulator from *inside* the loop above. Control then
      // returns to the `while` body, which subtracts one more step and leaves
      // −1/120. The catch-up branch only clamps positives, so `alpha` came out
      // at exactly −1: one frame rendered a whole step *backwards*, roughly a
      // quarter of a metre of the rider and the camera popping the wrong way
      // at speed.
      //
      // Live since M9, when pausing first took this path, and invisible in the
      // suite because `advance()` forces `alpha = 1`. M10 is what made it
      // matter: the transition to the results screen happens inside the step,
      // so the backwards frame landed on the finish line — the one frame
      // `CHALLENGE.resultsDelaySeconds` exists to protect.
      if (this.accumulator < 0) this.accumulator = 0;
      this.alpha = this.accumulator / this.stepSeconds;
    }

    this.steps += steps;
    this.stepsLastFrame = steps;
    this.frames += 1;

    const renderStart = this.scheduler.now();
    this.callbacks.render(this.alpha, false);
    const renderMs = this.scheduler.now() - renderStart;

    this.callbacks.onFrameSampled?.({ simMs, renderMs, steps, synthetic: false });
  }
}
