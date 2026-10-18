/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { LOADING } from '../data/tuning.ts';

/**
 * One macrotask boundary: input, the loading cover's text and a paint may run
 * before the boot continues. Not `setTimeout`: background tabs clamp timers
 * to a second, while message events are delivered promptly.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
  });
}

export interface BootSlicer {
  /** How many times the boot actually yielded to the browser. */
  readonly yields: number;
  /** The `driveSteps` slice hook: null under budget, else a yield to the browser. */
  slice(): Promise<void> | null;
  /** Start a fresh budget (after a loading stage has awaited its own paint). */
  restart(): void;
}

/**
 * The boot's time budget (`LOADING.sliceBudgetMs`). A slice costs nothing
 * until that much uninterrupted work has run, so most slices pass straight
 * through. Scheduling only: the step generators never read this clock.
 */
export function createBootSlicer(budgetMs: number = LOADING.sliceBudgetMs,
  now: () => number = () => performance.now(), pause: () => Promise<void> = yieldToBrowser): BootSlicer {
  if (!(budgetMs >= 0)) throw new RangeError('A boot slice budget is a non-negative number of milliseconds');
  let since = now(), yields = 0;
  return {
    get yields() { return yields; },
    slice: () => {
      if (now() - since < budgetMs) return null;
      yields += 1;
      return pause().then(() => { since = now(); });
    },
    restart: () => { since = now(); },
  };
}
