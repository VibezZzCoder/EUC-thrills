/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M48 (PLANS §48): constructors for short-lived plain records. Imports nothing.
 *
 * V8 keeps pretenuring feedback per object or array literal (its allocation
 * site): when it sees most of a site's objects survive a young collection, it
 * creates that site's objects straight in old memory. In most High sessions it
 * decided so for the crowd's per-step records, ~28 MB/s that died within a step
 * or two, and old memory filled every ~12 s. An object built by `new` on an
 * ordinary function has no allocation site, so there is nothing to pretenure.
 *
 * The record keeps `Object.prototype` (deep-equality readers compare
 * prototypes, so it stays a plain object to every reader), and `init` assigns
 * the fields in the former literal's key order. An optional key is assigned
 * only when present, so it is never an own `undefined`.
 */
export type RecordFields<T> = { -readonly [K in keyof T]: T[K] };
export function recordType<T, A extends unknown[]>(init: (this: RecordFields<T>, ...args: A) => void): new (...args: A) => T {
  init.prototype = Object.prototype;
  return init as unknown as new (...args: A) => T;
}
