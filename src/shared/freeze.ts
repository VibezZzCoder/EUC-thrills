/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Deep freeze, shared by the two data tables.
 *
 * `as const` is a compile-time assertion and nothing more — it does not stop a
 * runtime write. Freezing is what makes "reset to default" mean something
 * exact: `data/liveTuning.ts` layers overrides on top of frozen defaults and
 * never mutates them, so dropping an override always lands back on the same
 * number.
 *
 * It lives here rather than in `data/tuning.ts` because `data/surfaces.ts`
 * needs it too and `tuning.ts` imports `surfaces.ts` — putting it in either
 * table would make the pair circular. Imports nothing, so it is safe from any
 * layer including the sealed ones (AGENTS.md invariant 1).
 */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
