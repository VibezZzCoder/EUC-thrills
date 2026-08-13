/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { SafeStorage } from '../platform/storage.ts';

/**
 * The chase's personal bests — M18.
 *
 * `knockaboutRecords.ts`'s sibling, built the same way and for the same reason
 * it is not `records.ts`: a `RouteRecord` is keyed by level id alone and beaten
 * by a *lower* `totalSeconds`, so a chase best filed there would be read as a
 * lap time, would "beat" every real lap on that route, would evict its ghost,
 * and would appear on the time trial's results screen as a personal best nobody
 * set. A mode gets its own key namespace, not a suffix on the level id — the
 * suffix would eat the headroom `level/levels.ts` derives against the
 * sixty-four characters both stores independently cap a level id at.
 *
 * **What beats what is two-tiered, and that is the mode's shape rather than a
 * scoring flourish.** Escaping is the win (§13 q24), so an escape beats any
 * amount of survival that ended in a bust however long it lasted; between two
 * runs of the same kind, longer survival wins. Without the first tier a player
 * who escaped in five minutes and then died at 4:59 would see "new record", and
 * the number the mode is actually about would be the one that moved.
 *
 * **No ghost.** The same answer Knockabout gives: a ghost is a line through a
 * course against a clock, and a replay of somebody being chased is not a
 * reference anybody can race — the thing that made the run was where the cop
 * was, and the cop is not in the recording.
 */

export interface ChaseRecord {
  readonly levelId: string;
  /** Seconds survived. Capped at the escape time by the run that made it. */
  readonly seconds: number;
  /** Whether the run ended in an escape rather than a bust. Beats anything. */
  readonly escaped: boolean;
  /** ISO 8601, written by the caller so this file needs no clock. */
  readonly setAt: string;
}

export interface ChaseRecords {
  readonly routes: Readonly<Record<string, ChaseRecord>>;
}

export const CHASE_RECORDS_KEY = 'chase';

const DEFAULT_RECORDS: ChaseRecords = Object.freeze({ routes: Object.freeze({}) });

/** `records.ts`'s cap, restated rather than imported, and it must stay equal. */
const MAX_LEVEL_ID_LENGTH = 64;
const MAX_SET_AT_LENGTH = 40;
/** No chase can last a day. A stored row claiming to is a hand-edited one. */
const MAX_SECONDS = 86_400;

/**
 * Re-validate whatever came out of storage.
 *
 * Everything here is untrusted: a player can edit `localStorage`, and a build
 * from six months ago can have written a shape this one does not know. A row
 * that does not survive is dropped rather than repaired.
 */
export function coerceChaseRecords(raw: unknown): ChaseRecords | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = (raw as { routes?: unknown }).routes;
  if (typeof source !== 'object' || source === null) return null;

  const routes: Record<string, ChaseRecord> = {};
  for (const [levelId, value] of Object.entries(source as Record<string, unknown>)) {
    if (levelId.length === 0 || levelId.length > MAX_LEVEL_ID_LENGTH) continue;
    const row = coerceRow(levelId, value);
    if (row !== null) routes[levelId] = row;
  }
  return { routes };
}

function coerceRow(levelId: string, value: unknown): ChaseRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<ChaseRecord>;
  const { seconds, escaped, setAt } = row;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds > MAX_SECONDS) return null;
  if (typeof escaped !== 'boolean') return null;
  if (typeof setAt !== 'string' || setAt.length === 0 || setAt.length > MAX_SET_AT_LENGTH) {
    return null;
  }
  return { levelId, seconds, escaped, setAt };
}

export type ChaseListener = (records: ChaseRecords) => void;

export class ChaseRecordsStore {
  private readonly storage: SafeStorage;
  private readonly listeners = new Set<ChaseListener>();
  private records: ChaseRecords;
  private lastWriteHeld = true;

  constructor(storage: SafeStorage) {
    this.storage = storage;
    this.records = this.storage.readJson(CHASE_RECORDS_KEY, coerceChaseRecords) ?? DEFAULT_RECORDS;
  }

  get current(): ChaseRecords {
    return this.records;
  }

  /** True while a best set now will still be here after a reload. */
  get persistent(): boolean {
    return this.storage.persistent && this.lastWriteHeld;
  }

  best(levelId: string): ChaseRecord | null {
    return this.records.routes[levelId] ?? null;
  }

  /**
   * Offer a run. True when it became the new best.
   *
   * Escaping outranks surviving; otherwise longer wins, and a tie is not a
   * record — the same rule the other two stores apply, in the units this mode
   * is measured in.
   */
  submit(record: ChaseRecord): boolean {
    if (record.levelId.length === 0 || record.levelId.length > MAX_LEVEL_ID_LENGTH) return false;
    const coerced = coerceRow(record.levelId, record);
    if (coerced === null) return false;

    const existing = this.best(record.levelId);
    if (existing !== null) {
      if (existing.escaped && !coerced.escaped) return false;
      if (existing.escaped === coerced.escaped && coerced.seconds <= existing.seconds) return false;
    }

    this.records = { routes: { ...this.records.routes, [record.levelId]: coerced } };
    this.lastWriteHeld = this.storage.writeJson(CHASE_RECORDS_KEY, this.records);
    this.announce();
    return true;
  }

  clearAll(): void {
    this.records = DEFAULT_RECORDS;
    this.lastWriteHeld = this.storage.writeJson(CHASE_RECORDS_KEY, this.records);
    this.announce();
  }

  onChange(listener: ChaseListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private announce(): void {
    for (const listener of this.listeners) listener(this.records);
  }
}
