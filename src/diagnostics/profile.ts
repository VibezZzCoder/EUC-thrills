/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { DIAGNOSTICS } from '../data/tuning.ts';
import type { FrameSample } from '../app/loop.ts';

/**
 * The measurement window behind `profileBegin()` / `profile()`.
 *
 * What this may report, and what it may not, is a binding rule rather than a
 * style preference (AGENTS.md, "Measuring performance"):
 *
 *   - **Reportable.** Milliseconds spent inside our own `step` and `render`,
 *     as percentiles. These are sampled by us, in our code, around work we
 *     control, and they do not depend on the tab's frame cadence.
 *   - **Not reportable, and not sampled here at all.** Frame interval and
 *     frames per second. An automated or unfocused tab has its own cadence,
 *     an embedded preview pane reports the pane's presentation rate, and a
 *     real GPU makes such a number more tempting rather than more honest.
 *     Those come from a human at a focused window.
 *
 * There is deliberately no field on the report that could be mistaken for one.
 *
 * Synthetic frames — those drawn on demand by `advance()` — have their
 * *timing* excluded, because frames rendered at a fixed step with nobody
 * waiting assemble into a flat, perfect percentile that describes nothing. But
 * they are counted, and the state they changed is not excluded
 * (master starter 17.5): the shader programs a synthetic frame compiled are
 * still compiled, and attributing them to the next real frame would misreport
 * that frame's cost.
 */

export interface ProfileReport {
  /** Real frames whose timings are in the window. */
  readonly sampled: number;
  /** Synthetic frames seen and excluded from timing. */
  readonly syntheticExcluded: number;
  /** True once the ring wrapped, i.e. the window is full. */
  readonly saturated: boolean;
  readonly simMs: Percentiles;
  readonly renderMs: Percentiles;
  readonly steps: number;
}

export interface Percentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly worst: number;
}

const EMPTY_PERCENTILES: Percentiles = Object.freeze({ p50: 0, p95: 0, p99: 0, worst: 0 });

/**
 * Percentile by nearest-rank over an already-sorted slice.
 *
 * Nearest-rank rather than interpolated: with a few hundred samples the
 * difference is under the measurement's own noise, and an interpolated p99
 * invents a millisecond figure that no frame actually took.
 */
function percentile(sorted: Float64Array, count: number, fraction: number): number {
  if (count === 0) return 0;
  const rank = Math.ceil(fraction * count) - 1;
  return sorted[Math.min(count - 1, Math.max(0, rank))];
}

export class FrameProfiler {
  private readonly capacity: number;
  private readonly sim: Float64Array;
  private readonly render: Float64Array;
  private readonly scratch: Float64Array;

  private writeIndex = 0;
  private count = 0;
  private saturated = false;
  private syntheticExcluded = 0;
  private steps = 0;

  constructor(capacity: number = DIAGNOSTICS.sampleWindow) {
    this.capacity = Math.max(1, Math.floor(capacity));
    // Preallocated. A profiler that allocates per frame is measuring itself.
    this.sim = new Float64Array(this.capacity);
    this.render = new Float64Array(this.capacity);
    this.scratch = new Float64Array(this.capacity);
  }

  /** Open a fresh window, discarding everything sampled so far. */
  begin(): void {
    this.writeIndex = 0;
    this.count = 0;
    this.saturated = false;
    this.syntheticExcluded = 0;
    this.steps = 0;
    this.sim.fill(0);
    this.render.fill(0);
  }

  record(sample: FrameSample): void {
    // State accounting covers every frame; the timing window does not.
    this.steps += sample.steps;
    if (sample.synthetic) {
      this.syntheticExcluded += 1;
      return;
    }

    this.sim[this.writeIndex] = sample.simMs;
    this.render[this.writeIndex] = sample.renderMs;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
    else this.saturated = true;
  }

  report(): ProfileReport {
    return {
      sampled: this.count,
      syntheticExcluded: this.syntheticExcluded,
      saturated: this.saturated,
      simMs: this.percentiles(this.sim),
      renderMs: this.percentiles(this.render),
      steps: this.steps,
    };
  }

  private percentiles(source: Float64Array): Percentiles {
    if (this.count === 0) return EMPTY_PERCENTILES;

    // `Float64Array.prototype.sort` sorts the whole array, so a partly filled
    // ring would sort its zeroed tail in with the samples and drag every
    // percentile toward zero. Copy the live prefix into the scratch buffer and
    // sort a subarray view of exactly that length.
    for (let i = 0; i < this.count; i += 1) this.scratch[i] = source[i];
    const live = this.scratch.subarray(0, this.count);
    live.sort();

    return {
      p50: percentile(live, this.count, 0.5),
      p95: percentile(live, this.count, 0.95),
      p99: percentile(live, this.count, 0.99),
      worst: live[this.count - 1],
    };
  }
}
