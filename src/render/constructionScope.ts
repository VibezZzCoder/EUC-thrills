/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * One synchronous world construction, as a reuse boundary for pure CPU work.
 *
 * A world build asks the same pure questions of one immutable plan many times
 * (site queries from pricing, admission and the terrain build; identical
 * vegetation form recipes for every authored canopy). Inside an open scope
 * those answers may be computed once and reused; outside it every call
 * computes afresh exactly as before. When the outermost scope ends every
 * registered cache is emptied, so nothing outlives the build and nothing can
 * answer for a later world. No GPU, DOM, timer or listener is involved.
 *
 * The returned `end` is idempotent; callers end the scope in a `finally`.
 */
let depth = 0;
const resets = new Set<() => void>();

export function beginConstructionScope(): () => void {
  depth += 1;
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    depth -= 1;
    if (depth === 0) for (const reset of resets) reset();
  };
}

/** `beginConstructionScope` around one synchronous build. */
export function withConstructionScope<T>(build: () => T): T {
  const end = beginConstructionScope();
  try { return build(); } finally { end(); }
}

export function constructionScopeOpen(): boolean {
  return depth > 0;
}

/** Register a cache to be emptied when the outermost scope ends. */
export function onConstructionScopeEnd(reset: () => void): void {
  resets.add(reset);
}

/**
 * A pure one-argument source query answered once per argument object while a
 * scope is open, and computed afresh outside one. Only for queries whose
 * result callers treat as read-only and whose argument is not mutated during
 * the build.
 */
export function scopedQuery<A extends object, R>(query: (argument: A) => R): (argument: A) => R {
  let answers = new WeakMap<A, R>();
  onConstructionScopeEnd(() => { answers = new WeakMap(); });
  return (argument) => {
    if (depth === 0) return query(argument);
    if (answers.has(argument)) return answers.get(argument) as R;
    const answer = query(argument);
    answers.set(argument, answer);
    return answer;
  };
}
