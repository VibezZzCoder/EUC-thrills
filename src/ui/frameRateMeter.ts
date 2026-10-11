/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The player-facing frame-rate counter's arithmetic (M42, `docs/PLANS.md`
 * §42.2i). Pure and DOM-free, so it is node-testable on synthetic clocks.
 *
 * **This is the owner's instrument, not a diagnostic.** AGENTS invariant 11
 * forbids an agent reporting a frame-interval or FPS figure; the owner asked
 * for a counter players can switch on, so — like `tools/perf-window.js` — it
 * is built and verified structurally and never read by an agent. It lives
 * here rather than in `diagnostics/profile.ts`, whose contract is that its
 * report carries no field that could be mistaken for an FPS figure, and its
 * value never enters the profiler, the F3 overlay or the QA snapshot.
 *
 * Fed from `Game.beforeFrame`, which runs once per **real** frame and never
 * for `advance()`, so a synthetic step cannot count. It counts frame
 * intervals over a window (500 ms by default) and settles the text once per
 * window: a figure that changes twice a second is readable, and the DOM write
 * behind it is bounded. A gap longer than `gapResetMs` (a hidden tab, a
 * loading hitch) or a clock that runs backwards restarts the window instead
 * of averaging the stall into the next figure.
 */
export class FrameRateMeter {
  private readonly windowMs: number;
  private readonly gapResetMs: number;
  /** Start of the open window, ms; NaN until the first sample. */
  private windowStartMs = Number.NaN;
  /** The previous sample, ms; NaN until the first sample. */
  private lastMs = Number.NaN;
  /** Frame intervals counted inside the open window. */
  private intervals = 0;
  private settled = '';

  constructor(windowMs = 500, gapResetMs = 1000) {
    this.windowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 500;
    this.gapResetMs = Number.isFinite(gapResetMs) && gapResetMs > 0 ? gapResetMs : 1000;
  }

  /** One real frame at `nowMs` (the rAF timestamp). */
  sample(nowMs: number): void {
    if (!Number.isFinite(nowMs)) return;
    if (Number.isNaN(this.lastMs)) {
      this.restart(nowMs);
      return;
    }
    const step = nowMs - this.lastMs;
    // A clock that ran backwards, or a stall long enough to be a hidden tab or
    // a loading hitch: restart the window here. The settled text stays, so
    // the readout does not blink; the next figure counts only fresh frames.
    if (step < 0 || step > this.gapResetMs) {
      this.restart(nowMs);
      return;
    }
    this.lastMs = nowMs;
    this.intervals += 1;
    const elapsed = nowMs - this.windowStartMs;
    if (elapsed < this.windowMs) return;
    const perSecond = (this.intervals * 1000) / elapsed;
    const rounded = Math.round(perSecond);
    const clamped = rounded < 0 ? 0 : rounded > 999 ? 999 : rounded;
    this.settled = `${clamped} FPS`;
    this.windowStartMs = nowMs;
    this.intervals = 0;
  }

  /** Forget everything, text included (the option toggled). */
  reset(): void {
    this.restartWindow();
    this.settled = '';
  }

  /**
   * Start counting afresh from the next sample but **keep the settled text**
   * (the tab came back): the readout stays up, unchanged, until a whole fresh
   * window closes. Clearing it here blinked the readout out for half a second
   * on every return, and in the touch pill the pill and the cue lane under it
   * jumped with it.
   */
  restartWindow(): void {
    this.windowStartMs = Number.NaN;
    this.lastMs = Number.NaN;
    this.intervals = 0;
  }

  /** `''` until the first window closes, then `NN FPS`. */
  get text(): string {
    return this.settled;
  }

  private restart(nowMs: number): void {
    this.windowStartMs = nowMs;
    this.lastMs = nowMs;
    this.intervals = 0;
  }
}
