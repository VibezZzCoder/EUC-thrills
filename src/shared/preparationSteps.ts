/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Deterministic boundaries inside one world preparation (2026-10-17 audit §3).
 *
 * A long preparation (street life, the renderer's first construction group)
 * is written once, as a generator that yields `PREPARATION_SLICE` at loop and
 * statement boundaries and returns exactly what the synchronous function
 * returned. A slice carries no label and is **never a loading checkpoint**:
 * the nine visible boot steps are unchanged, and a driver that yields to the
 * browser at a slice changes when work runs, never what it computes.
 *
 * Drained by `runSteps`, a step generator IS the original function: world
 * swaps, the QA bridge and every test keep calling the synchronous names,
 * which run the very same body without suspending. Only the browser boot
 * (`Game.create`) drives the generators asynchronously, with `driveSteps`.
 *
 * Rules for a step body: statements keep their order; a slice sits only at a
 * statement boundary; a body never reads a clock (slice density is
 * structural, the time budget lives in the driver); scoped module state that
 * spans a slice opens and closes in `try … finally`; cleanup-on-error becomes
 * finally-with-flag so an abandoned generator also cleans up.
 */
export const PREPARATION_SLICE: unique symbol = Symbol('preparation slice');
export type PreparationSlice = typeof PREPARATION_SLICE;
export type Steps<T> = Generator<PreparationSlice, T, void>;

/** Drained synchronously, a step generator is the original function. */
export function runSteps<T>(steps: Generator<PreparationSlice, T, void>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

export interface StepHooks<L> {
  /** At a slice: null = keep going; a promise = wait for it (yield to the browser) first. */
  slice(): Promise<void> | null;
  /** A labelled stage. Only `GameRenderer.levelBuildSteps` yields labels. */
  stage?(label: L): Promise<void>;
}

/**
 * The asynchronous drain. On any early exit (a rejected slice or stage hook)
 * it closes the generator with `return()`, so every scope's `finally` — the
 * authoring memo, the construction scope, owner cleanup — runs. A failure
 * thrown by the generator itself has already closed it and propagates as is.
 */
export async function driveSteps<T, L = never>(steps: Generator<PreparationSlice | L, T, void>,
  hooks: StepHooks<L>): Promise<T> {
  try {
    for (let step = steps.next(); ; step = steps.next()) {
      if (step.done) return step.value;
      if (step.value === PREPARATION_SLICE) {
        const pause = hooks.slice();
        if (pause !== null) await pause;
        continue;
      }
      if (!hooks.stage) throw new Error('A preparation step yielded a stage label where only slices are allowed');
      await hooks.stage(step.value as L);
    }
  } catch (error) {
    // A hook failed with the generator suspended: close it so its scopes'
    // finally blocks run. The generator's own throw closed it already, and
    // return() on a closed generator does nothing.
    try { steps.return(undefined as never); } catch { /* the original failure wins */ }
    throw error;
  }
}
