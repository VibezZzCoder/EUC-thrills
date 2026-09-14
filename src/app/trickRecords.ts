/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { SafeStorage } from '../platform/storage.ts';

/**
 * The Trick Run's personal bests — M38, §38.5.
 *
 * The fourth member of the records family, and a separate store for the reason
 * the other three are separate from each other. `records.ts` keys a
 * `RouteRecord` by level id alone and decides what beats what with
 * `totalSeconds` — *lower* wins. A trick score filed there would share a key
 * with the same venue's lap time, and a score of 42 would be read as a lap time
 * of forty-two seconds: it would "beat" every real lap on that route, evict its
 * ghost, and appear on the time trial's results screen as a personal best
 * nobody set. A mode gets its own key namespace, never a suffix on the level
 * id — the suffix would eat the headroom `level/levels.ts` derives against the
 * sixty-four characters every one of these stores independently caps a level id
 * at. `trickRecords.test.ts` asserts the four key constants differ.
 *
 * **One record per `LevelPlan.id`, and per nothing else** (§38.5). Not per
 * rider, character, speed setting or device: the venue is the course, and the
 * course is what a score is about.
 *
 * **Higher wins, a tie keeps the old row, and nothing breaks a tie.** No
 * elapsed, no crash count, no trick count — exactly the rule Knockabout applies
 * in its own units, and for the same reason: a celebration for matching your
 * own score is a celebration that stops meaning anything.
 *
 * **Comparability is record validity, not a migration framework.** A stored
 * best carries the `durationSteps` and the `rulesRevision` that produced it
 * (`trickRulesRevision` in `simulation/trickRun.ts`, an opaque slash-joined
 * string this file never parses). A best set under other rules is not a worse
 * best — it is a number about a different game, and comparing the two would
 * either invent a record or hide one. So a completed run under the current
 * rules **replaces** a stored best it cannot be compared with, whatever the two
 * scores are, and `comparableBest` hands the composition root the row only when
 * it may legitimately be shown as "previous best". Nothing here migrates,
 * rescales or relabels an old row: it is dropped as a comparison and overwritten
 * as a record.
 *
 * **No ghost, no wallet, no lifetime totals, no run history** (§38.5). One row
 * per venue is the whole of it.
 */

export interface TrickRecord {
  readonly levelId: string;
  /** Banked points. Non-negative safe integer, and higher is better. */
  readonly score: number;
  /** The fixed run length that produced the score, in 120 Hz steps. */
  readonly durationSteps: number;
  /** The scoring rules' identity. Opaque here — compared, never parsed. */
  readonly rulesRevision: string;
  /** ISO 8601, written by the caller so this file needs no clock. */
  readonly setAt: string;
}

export interface TrickRecords {
  readonly routes: Readonly<Record<string, TrickRecord>>;
}

/** Where the record lives inside `SafeStorage`'s namespace. */
export const TRICK_RECORDS_KEY = 'tricks';

/**
 * Route maps are built on a null prototype, for `records.ts`'s reason.
 *
 * `JSON.parse` turns a hand-edited record containing `"__proto__"` into a
 * genuine own property, and copying that key onto a plain `{}` invokes the
 * prototype setter instead: the entry vanishes and the object's prototype is
 * replaced. On a null-prototype object it is an ordinary key, and
 * `best('constructor')` answers `null` rather than handing a function to the
 * results screen. The reserved names are dropped outright as well — no
 * `LevelPlan.id` is ever spelled either of them, so nothing valid is lost and
 * the hostile row does not survive to be read at all.
 */
function emptyRoutes(): Record<string, TrickRecord> {
  return Object.create(null) as Record<string, TrickRecord>;
}

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const DEFAULT_RECORDS: TrickRecords = Object.freeze({ routes: Object.freeze(emptyRoutes()) });

/** `records.ts`'s cap, restated rather than imported, and it must stay equal. */
const MAX_LEVEL_ID_LENGTH = 64;
const MAX_SET_AT_LENGTH = 40;
/**
 * `trickRulesRevision` joins a milestone tag and ten numbers with slashes —
 * comfortably inside this. The cap exists so a hand-edited record cannot put a
 * megabyte of text where a comparison key belongs; it is not a tuning value and
 * deliberately does not live in `data/tuning.ts`.
 */
const MAX_RULES_REVISION_LENGTH = 96;

/**
 * Re-validate whatever came out of storage.
 *
 * Everything here is untrusted: a player can edit `localStorage`, and a build
 * from six months ago can have written a shape this one does not know. A row
 * that does not survive is dropped rather than repaired — dropping one costs a
 * personal best, and accepting one costs a results screen doing arithmetic on a
 * string. Valid rows for other venues are kept.
 */
export function coerceTrickRecords(raw: unknown): TrickRecords | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = (raw as { routes?: unknown }).routes;
  if (typeof source !== 'object' || source === null) return null;

  const routes = emptyRoutes();
  for (const [levelId, value] of Object.entries(source as Record<string, unknown>)) {
    if (levelId.length === 0 || levelId.length > MAX_LEVEL_ID_LENGTH) continue;
    if (RESERVED_KEYS.has(levelId)) continue;
    const row = coerceRow(levelId, value);
    if (row !== null) routes[levelId] = row;
  }
  return { routes };
}

function coerceRow(levelId: string, value: unknown): TrickRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<TrickRecord>;
  const { score, durationSteps, rulesRevision, setAt } = row;

  // Safe integers only. A fractional score cannot come out of the referee —
  // every award is rounded once, at the landing — and `Number.isSafeInteger`
  // refuses NaN, Infinity and a numeric string in the same breath.
  if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0) return null;
  if (typeof durationSteps !== 'number') return null;
  if (!Number.isSafeInteger(durationSteps) || durationSteps <= 0) return null;

  if (typeof rulesRevision !== 'string') return null;
  if (rulesRevision.length === 0 || rulesRevision.length > MAX_RULES_REVISION_LENGTH) return null;
  if (typeof setAt !== 'string' || setAt.length === 0 || setAt.length > MAX_SET_AT_LENGTH) {
    return null;
  }

  return { levelId, score, durationSteps, rulesRevision, setAt };
}

/**
 * The single definition of "these two numbers are about the same game".
 *
 * Same venue, same duration, same rules identity. Nothing else — not the rider,
 * not the device, not the speed setting, none of which §38.5 files a record by.
 */
function comparable(record: TrickRecord, durationSteps: number, rulesRevision: string): boolean {
  return record.durationSteps === durationSteps && record.rulesRevision === rulesRevision;
}

export type TrickListener = (records: TrickRecords) => void;

export class TrickRecordsStore {
  private readonly storage: SafeStorage;
  private readonly listeners = new Set<TrickListener>();
  private records: TrickRecords;
  private lastWriteHeld = true;

  constructor(storage: SafeStorage) {
    this.storage = storage;
    this.records = this.storage.readJson(TRICK_RECORDS_KEY, coerceTrickRecords) ?? DEFAULT_RECORDS;
  }

  get current(): TrickRecords {
    return this.records;
  }

  /** True while a best set now will still be here after a reload. */
  get persistent(): boolean {
    return this.storage.persistent && this.lastWriteHeld;
  }

  /** The stored row for a venue, whatever rules it was set under, or `null`. */
  best(levelId: string): TrickRecord | null {
    return this.records.routes[levelId] ?? null;
  }

  /**
   * The stored row only when it may be shown beside a run of these rules.
   *
   * The composition root asks this rather than `best` so it never compares
   * unlike runs: a row from another duration or another revision is not a
   * previous best for today's run, and presenting it as one would invent a "new
   * personal best" or hide a real one.
   */
  comparableBest(
    levelId: string,
    durationSteps: number,
    rulesRevision: string,
  ): TrickRecord | null {
    const existing = this.best(levelId);
    if (existing === null) return null;
    return comparable(existing, durationSteps, rulesRevision) ? existing : null;
  }

  /**
   * Offer a completed run. True when it became the new best.
   *
   * Only the composition root's one filing decision reaches here (§38.5): a
   * completed, full-duration, solo, eligible run. This file does not know what
   * any of those words mean and must not learn.
   *
   * A strictly higher score replaces a *comparable* best; a tie keeps the old
   * row and answers false. A stored best that is **not** comparable is replaced
   * outright — see the file comment: that is record validity, not migration.
   */
  submit(record: TrickRecord): boolean {
    if (record.levelId.length === 0 || record.levelId.length > MAX_LEVEL_ID_LENGTH) return false;
    if (RESERVED_KEYS.has(record.levelId)) return false;
    const coerced = coerceRow(record.levelId, record);
    if (coerced === null) return false;

    const existing = this.best(record.levelId);
    if (existing !== null && comparable(existing, coerced.durationSteps, coerced.rulesRevision)) {
      if (coerced.score <= existing.score) return false;
    }

    const routes = emptyRoutes();
    Object.assign(routes, this.records.routes);
    routes[record.levelId] = coerced;
    this.records = { routes };
    this.lastWriteHeld = this.storage.writeJson(TRICK_RECORDS_KEY, this.records);
    this.announce();
    return true;
  }

  clearAll(): void {
    this.records = DEFAULT_RECORDS;
    this.lastWriteHeld = this.storage.writeJson(TRICK_RECORDS_KEY, this.records);
    this.announce();
  }

  onChange(listener: TrickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private announce(): void {
    for (const listener of this.listeners) listener(this.records);
  }
}
