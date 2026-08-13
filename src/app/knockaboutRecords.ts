/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { SafeStorage } from '../platform/storage.ts';

/**
 * Knockabout's personal bests — M14, §13 q15.
 *
 * **A separate store, and that is the whole reason this file exists.**
 * `records.ts` keys a `RouteRecord` by **level id alone** and decides what beats
 * what with `totalSeconds` — lower wins. A Knockabout best filed there would
 * share a key with the same route's lap time, and `submit` would read a score of
 * 12 as a lap time of twelve seconds: it would "beat" every real lap on that
 * route, evict its ghost, and show up on the time trial's results screen as a
 * personal best nobody set. §13 q15's "a mode-qualified key" is that failure
 * named in advance.
 *
 * **A key namespace rather than a mode suffix on the level id.** The other
 * spelling — `generated-r3-<seed>#knockabout` — would eat the twenty-seven
 * characters of headroom `level/levels.ts` derives against the sixty-four both
 * record stores independently cap a level id at, and the cap is enforced in
 * three separate places plus `simulation/ghost.ts`. A second slot costs
 * nothing and moves no arithmetic.
 *
 * **Higher is better here, and there is no ghost** (§13 q15 again). A ghost is
 * a line through a course against a clock; Knockabout's score is what you did
 * *to* the course, and a replay of somebody hitting things is not a reference
 * you can race. Elapsed is recorded because the results screen shows it, and it
 * counts for nothing — §13 q14.
 */

export interface KnockaboutRecord {
  readonly levelId: string;
  /** Targets struck. The score, and the only thing that decides a record. */
  readonly struck: number;
  /** How many the route carried. Shown as `struck / total`, never compared. */
  readonly total: number;
  /** Seconds the run took. Displayed, and worth nothing — §13 q14. */
  readonly seconds: number;
  /** ISO 8601, written by the caller so this file needs no clock. */
  readonly setAt: string;
}

export interface KnockaboutRecords {
  readonly routes: Readonly<Record<string, KnockaboutRecord>>;
}

export const KNOCKABOUT_RECORDS_KEY = 'knockabout';

const DEFAULT_RECORDS: KnockaboutRecords = Object.freeze({ routes: Object.freeze({}) });

/** `records.ts`'s cap, restated rather than imported, and it must stay equal. */
const MAX_LEVEL_ID_LENGTH = 64;
const MAX_SET_AT_LENGTH = 40;

/**
 * Re-validate whatever came out of storage.
 *
 * Everything here is untrusted: a player can edit `localStorage`, and a build
 * from six months ago can have written a shape this one does not know. A row
 * that does not survive is dropped rather than repaired, and dropping one costs
 * a personal best where accepting one costs a crash on the results screen.
 */
export function coerceKnockaboutRecords(raw: unknown): KnockaboutRecords | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = (raw as { routes?: unknown }).routes;
  if (typeof source !== 'object' || source === null) return null;

  const routes: Record<string, KnockaboutRecord> = {};
  for (const [levelId, value] of Object.entries(source as Record<string, unknown>)) {
    if (levelId.length === 0 || levelId.length > MAX_LEVEL_ID_LENGTH) continue;
    const row = coerceRow(levelId, value);
    if (row !== null) routes[levelId] = row;
  }
  return { routes };
}

function coerceRow(levelId: string, value: unknown): KnockaboutRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<KnockaboutRecord>;
  const { struck, total, seconds, setAt } = row;
  if (!Number.isFinite(struck) || !Number.isFinite(total) || !Number.isFinite(seconds)) return null;
  if (typeof struck !== 'number' || typeof total !== 'number' || typeof seconds !== 'number') {
    return null;
  }
  // A negative score, a score above the total, or a run that took no time are
  // all impossible from this game and all trivially writable by hand.
  if (struck < 0 || total < 0 || struck > total || seconds < 0) return null;
  if (typeof setAt !== 'string' || setAt.length === 0 || setAt.length > MAX_SET_AT_LENGTH) {
    return null;
  }
  return { levelId, struck: Math.round(struck), total: Math.round(total), seconds, setAt };
}

export type KnockaboutListener = (records: KnockaboutRecords) => void;

export class KnockaboutRecordsStore {
  private readonly storage: SafeStorage;
  private readonly listeners = new Set<KnockaboutListener>();
  private records: KnockaboutRecords;
  private lastWriteHeld = true;

  constructor(storage: SafeStorage) {
    this.storage = storage;
    this.records = this.storage.readJson(KNOCKABOUT_RECORDS_KEY, coerceKnockaboutRecords)
      ?? DEFAULT_RECORDS;
  }

  get current(): KnockaboutRecords {
    return this.records;
  }

  /** True while a best set now will still be here after a reload. */
  get persistent(): boolean {
    return this.storage.persistent && this.lastWriteHeld;
  }

  best(levelId: string): KnockaboutRecord | null {
    return this.records.routes[levelId] ?? null;
  }

  /**
   * Offer a run. True when it became the new best.
   *
   * **More targets wins, and a tie is not a record.** The same rule the timed
   * run applies to a hundredth of a second, in the units that make sense here:
   * matching your own score is matching it, and a celebration for matching is a
   * celebration that stops meaning anything. There is deliberately no
   * tie-break on elapsed — §13 q14 makes time worth nothing, and breaking a tie
   * on it would quietly make it worth something.
   */
  submit(record: KnockaboutRecord): boolean {
    if (record.levelId.length === 0 || record.levelId.length > MAX_LEVEL_ID_LENGTH) return false;
    const coerced = coerceRow(record.levelId, record);
    if (coerced === null) return false;

    const existing = this.best(record.levelId);
    if (existing !== null && coerced.struck <= existing.struck) return false;

    this.records = {
      routes: { ...this.records.routes, [record.levelId]: coerced },
    };
    this.lastWriteHeld = this.storage.writeJson(KNOCKABOUT_RECORDS_KEY, this.records);
    this.announce();
    return true;
  }

  clearAll(): void {
    this.records = DEFAULT_RECORDS;
    this.lastWriteHeld = this.storage.writeJson(KNOCKABOUT_RECORDS_KEY, this.records);
    this.announce();
  }

  onChange(listener: KnockaboutListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private announce(): void {
    for (const listener of this.listeners) listener(this.records);
  }
}
