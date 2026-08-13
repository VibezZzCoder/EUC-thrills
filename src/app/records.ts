/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SafeStorage } from '../platform/storage.ts';
import { CHALLENGE } from '../data/tuning.ts';
import { decodeGhost, type EncodedGhost } from '../simulation/ghost.ts';

/**
 * Personal bests and their ghosts — M10's half of the saved record, and the
 * sibling of `app/options.ts`.
 *
 * `options.ts` holds what a player *chooses*; this holds what a player
 * *earned*. They are deliberately two records under two keys rather than one
 * document with two sections, and the reason is size. A settings record is a
 * few hundred bytes and is rewritten every time a slider moves. A ghost track
 * is the largest thing this game will ever save — tens of kilobytes of
 * quantised samples — and it is rewritten only when somebody beats their own
 * time. Merging them would mean every volume nudge rewrites the ghost, and a
 * quota failure on the ghost would take the settings down with it.
 *
 * Three rules shaped everything below, and all three are about *not losing the
 * time*:
 *
 *   1. **A ghost is optional; a time is not.** Every path here can drop the
 *      ghost — a decode failure, a hostile record, a full quota — and every
 *      one of those paths keeps the seconds. Losing a replay costs the player
 *      a race against themselves. Losing a personal best costs them the run,
 *      and they cannot get it back.
 *   2. **A tie is not a record.** Decided here, once, in `isNewRecord`, using
 *      `CHALLENGE.recordEpsilonSeconds`. A run that matches the record to
 *      within a hundredth of a second did not beat it, does not overwrite the
 *      ghost, and does not get a celebration — the tuning table says so beside
 *      the number.
 *   3. **Nothing in this file reads a clock.** `setAt` is passed in by the
 *      caller. `new Date()` here would make every test that touches a record
 *      depend on when it ran, and the whole point of AGENTS.md's headless-first
 *      rule is that this suite is deterministic under `node --test`.
 *
 * The storage layer beneath this already assumes `localStorage` may be absent,
 * may throw, may silently discard, and may hold corrupt bytes
 * (`platform/storage.ts` enumerates all four). This file adds the failure that
 * only shows up once records get big: **a store that works fine for small
 * values and refuses large ones.** That is the quota path, it is the one this
 * feature will actually hit in the wild, and `persist()` below is written for
 * it specifically.
 *
 * Nothing here touches the DOM, so all of it is `node --test` territory.
 */

/**
 * One level's best run.
 *
 * `splits` are cumulative elapsed seconds at each checkpoint, in route order —
 * the same shape `simulation/challenge.ts` produces and the same shape a live
 * run compares itself against, so a stored record can be handed straight back
 * as a `RouteReference` with no reshaping in between.
 */
export interface RouteRecord {
  readonly levelId: string;
  readonly totalSeconds: number;
  readonly splits: readonly number[];
  /** ISO 8601, for the results screen. Written by the caller, never by this file. */
  readonly setAt: string;
  readonly ghost: EncodedGhost | null;
}

/**
 * Every level's best, keyed by level id.
 *
 * A map rather than an array because the results screen and the HUD both ask
 * "what is the best for *this* level", never "list every record"; and because
 * a level that gains checkpoints later (the proving ground has none on purpose)
 * simply appears as a new key with no migration.
 */
export interface ChallengeRecords {
  readonly routes: Readonly<Record<string, RouteRecord>>;
}

/** Where the record lives inside `SafeStorage`'s namespace. */
export const RECORDS_KEY = 'records';

/**
 * Route maps are built on a null prototype, everywhere, without exception.
 *
 * This is not tidiness. `JSON.parse` turns a hand-edited record containing
 * `"__proto__"` into a genuine own property, and copying that key onto a plain
 * `{}` invokes the prototype setter instead: the entry vanishes and the object's
 * prototype is replaced. On a null-prototype object it is an ordinary key that
 * can never match a real level id, so the hostile case degrades to a harmless
 * unused entry. It also means `best('constructor')` answers `null` rather than
 * handing a function to the results screen.
 */
function emptyRoutes(): Record<string, RouteRecord> {
  return Object.create(null) as Record<string, RouteRecord>;
}

export const DEFAULT_RECORDS: ChallengeRecords = Object.freeze({
  routes: Object.freeze(emptyRoutes()),
});

/** Shared empty split table, so a record without one allocates nothing. */
const NO_SPLITS: readonly number[] = Object.freeze([]);

/**
 * Validation caps for the hostile-record path.
 *
 * These are not tuning values and deliberately do not live in
 * `data/tuning.ts`: no ride or presentation decision depends on them, and
 * nobody will ever want to adjust one. They exist for the same reason
 * `options.ts` caps a key code at 32 characters — a corrupt record must not
 * turn into a results screen trying to render a megabyte of text, or a split
 * table with ten thousand rows in it.
 */
const MAX_LEVEL_ID_LENGTH = 64;
const MAX_SPLITS = 64;
const MAX_SET_AT_LENGTH = 40;

/**
 * ISO 8601 instants only, and only the shape `toISOString()` produces plus the
 * offset form.
 *
 * Matched with a pattern rather than parsed, because parsing a date string is
 * implementation-defined for anything off the ISO path and this is a display
 * string — the results screen formats it, nothing computes with it. A value
 * that fails is replaced with an empty string rather than rejecting the record:
 * a personal best with an unknown date is still a personal best.
 */
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * The single definition of "this run beat the record".
 *
 * Exported because two halves of M10 have to agree about it and they cannot
 * share code: `simulation/challenge.ts` reports `beatRecord` on its result and
 * may not import anything from `app/` (AGENTS.md invariant 5). If the results
 * heading and the store ever disagree, a player sees "New record" over a time
 * that was not saved, which reads as the game losing their run. Whoever wires
 * the results screen should take its heading from what `submit` returned, and
 * treat this function as the definition.
 *
 * Strictly less than the record minus the epsilon, so **a tie is not a
 * record** and neither is a run that is faster by less than
 * `CHALLENGE.recordEpsilonSeconds`. Keeping the old record on a near-tie also
 * keeps the old *ghost*, which is the behaviour the player wants: the replay
 * they race against should be the run they remember, not the one that happened
 * to be a thousandth quicker.
 */
export function isNewRecord(candidateSeconds: number, recordSeconds: number | null): boolean {
  if (!Number.isFinite(candidateSeconds) || candidateSeconds <= 0) return false;
  if (recordSeconds === null || !Number.isFinite(recordSeconds)) return true;
  return candidateSeconds < recordSeconds - CHALLENGE.recordEpsilonSeconds;
}

/**
 * Coerce anything at all into a valid `ChallengeRecords`.
 *
 * Written to the same standard as `options.ts:coerceOptions` and for the same
 * reasons — a record from a newer build, a player editing `localStorage` by
 * hand, or a tab killed mid-save. It never returns null and it never throws:
 * one unreadable level's record must not cost the player the others.
 *
 * The difference from the options path is what a *partial* failure does here.
 * Options degrade field by field to their defaults, because a default volume is
 * a sensible volume. There is no sensible default for a lap time, so a record
 * whose time is not a usable number is dropped whole, while everything that is
 * merely decoration around a usable time — the split table, the date, the
 * ghost — degrades on its own and leaves the time standing.
 */
export function coerceRecords(raw: unknown): ChallengeRecords {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const source = (typeof record.routes === 'object' && record.routes !== null
    ? record.routes
    : {}) as Record<string, unknown>;

  const routes = emptyRoutes();
  for (const [levelId, entry] of Object.entries(source)) {
    if (levelId.length === 0 || levelId.length > MAX_LEVEL_ID_LENGTH) continue;
    const coerced = coerceRoute(levelId, entry);
    if (coerced !== null) routes[levelId] = coerced;
  }

  return Object.freeze({ routes: Object.freeze(routes) });
}

/**
 * One entry. Null when there is no usable time in it.
 *
 * **The map key wins over the record's own `levelId`.** They are redundant on
 * purpose — the field is what lets a `RouteRecord` travel on its own, to the
 * results screen or into `submit` — and redundancy invites disagreement. If a
 * hand-edited record files the slice's time under the proving ground's key, the
 * key is the one everything else looks the record up by, so the key is the one
 * that must be true.
 */
function coerceRoute(levelId: string, raw: unknown): RouteRecord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const totalSeconds = record.totalSeconds;
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    // A non-finite best is worse than no best at all: every later comparison
    // against NaN is false, so the player could never set a record again and
    // nothing would explain why.
    return null;
  }

  return Object.freeze({
    levelId,
    totalSeconds,
    splits: coerceSplits(record.splits, totalSeconds),
    setAt: typeof record.setAt === 'string'
      && record.setAt.length <= MAX_SET_AT_LENGTH
      && ISO_8601.test(record.setAt)
      ? record.setAt
      : '',
    ghost: coerceGhost(record.ghost, levelId),
  });
}

/**
 * A split table, or the empty one.
 *
 * **All or nothing, deliberately.** Splits are cumulative, so they only mean
 * anything as a sequence: a table with one bad entry does not produce one wrong
 * leg delta, it produces two, and the player has no way to know which numbers
 * to distrust. No table at all is honest — the HUD simply shows no delta.
 *
 * The monotonic check is what catches a plausible-looking but scrambled record,
 * and the `totalSeconds` bound catches a table from a longer run pasted onto a
 * shorter one.
 *
 * The endpoints are pinned too (M10 QA, F5): `challenge.ts` defines index zero
 * as the start gate, whose split is zero by construction, and the final split
 * is the finish crossing, which *is* the run's total. A table that starts
 * anywhere else or ends short is not a differently-shaped record — it is a
 * scrambled one, and comparing a live run's legs against it prints deltas the
 * player has no way to know are lies. Both values compare exactly, not within
 * an epsilon, because the game writes them from the same numbers it stores and
 * JSON round-trips a double bit-for-bit.
 */
function coerceSplits(raw: unknown, totalSeconds: number): readonly number[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SPLITS) return NO_SPLITS;
  if (raw[0] !== 0 || raw[raw.length - 1] !== totalSeconds) return NO_SPLITS;

  const splits: number[] = [];
  let previous = 0;
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return NO_SPLITS;
    if (value < previous || value > totalSeconds) return NO_SPLITS;
    splits.push(value);
    previous = value;
  }
  return Object.freeze(splits);
}

/**
 * A stored ghost, or null.
 *
 * Two passes, and both are load-bearing. The first walks the fields this file
 * has to copy, which is what lets a `Record<string, unknown>` become an
 * `EncodedGhost` honestly rather than by assertion. The second hands the whole
 * thing to `decodeGhost`, which owns what a *usable* track is — its version,
 * its sample count, its stride, its plausible size. Duplicating that knowledge
 * here would let the two drift, and the direction the drift goes is a record
 * this file happily stores and the ghost player then cannot read.
 *
 * That is also why the check runs on the way *in* as well as on the way out:
 * **the store never keeps a ghost it could not load back.** A ghost that fails
 * is simply absent; it never takes the time with it.
 *
 * The level match is the other half. A ghost recorded on another course would
 * otherwise play back through this one's geometry, and a translucent rider
 * gliding through buildings is a bug report, not a race.
 */
function coerceGhost(raw: unknown, levelId: string): EncodedGhost | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  if (record.v !== 1) return null;
  if (record.level !== levelId) return null;
  const hz = record.hz;
  const total = record.total;
  const n = record.n;
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0) return null;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
  if (!Array.isArray(record.data)) return null;

  const data: number[] = [];
  for (const value of record.data) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    data.push(value);
  }

  if (decodeGhost(record) === null) return null;

  return Object.freeze({
    v: 1 as const,
    level: levelId,
    hz,
    total,
    n,
    data: Object.freeze(data),
  });
}

/** A copy of `records` with one route replaced. */
function withRoute(
  records: ChallengeRecords,
  levelId: string,
  record: RouteRecord,
): ChallengeRecords {
  const routes = emptyRoutes();
  for (const [id, existing] of Object.entries(records.routes)) routes[id] = existing;
  routes[levelId] = record;
  return Object.freeze({ routes: Object.freeze(routes) });
}

/** Ghost-bearing route ids, oldest record first and stable at equal dates. */
function ghostEvictionOrder(records: ChallengeRecords): readonly string[] {
  return Object.values(records.routes)
    .filter((record) => record.ghost !== null)
    .sort((a, b) => {
      const aTime = Date.parse(a.setAt);
      const bTime = Date.parse(b.setAt);
      const aOldest = Number.isFinite(aTime) ? aTime : Number.NEGATIVE_INFINITY;
      const bOldest = Number.isFinite(bTime) ? bTime : Number.NEGATIVE_INFINITY;
      return aOldest - bOldest || a.levelId.localeCompare(b.levelId);
    })
    .map((record) => record.levelId);
}

/** Preserve a route's earned result while releasing its optional replay. */
function withoutGhost(records: ChallengeRecords, levelId: string): ChallengeRecords {
  const existing = records.routes[levelId];
  if (existing === undefined || existing.ghost === null) return records;
  return withRoute(records, levelId, Object.freeze({ ...existing, ghost: null }));
}

function routeCount(records: ChallengeRecords): number {
  return Object.keys(records.routes).length;
}

export type RecordsListener = (records: ChallengeRecords) => void;

/**
 * The live records, their persistence, and their change notification.
 *
 * Notification rather than polling, matching `OptionsStore` — the title screen
 * and the results screen read a best when it changes, and nothing in the frame
 * loop asks a question whose answer changes once a lap at most.
 */
export class RecordsStore {
  private readonly storage: SafeStorage;
  private readonly listeners = new Set<RecordsListener>();
  private records: ChallengeRecords;
  /**
   * False once a record failed to reach the store even after every optional
   * ghost was offered oldest-first. At that point the newest best exists only
   * in memory, whatever the storage layer's general capability says.
   */
  private lastWriteHeld = true;

  constructor(storage: SafeStorage) {
    this.storage = storage;
    this.records = this.storage.readJson(RECORDS_KEY, coerceRecords) ?? DEFAULT_RECORDS;
  }

  get current(): ChallengeRecords {
    return this.records;
  }

  /**
   * True while records set now will still be here after a reload.
   *
   * Two answers folded into one, and both are needed (M10 QA, F7). The
   * storage layer's `persistent` covers the general capability, including a
   * store discovered mid-session to be silently discarding writes. The
   * `lastWriteHeld` half covers this store's own quota path: a first write
   * failing on an oversized ghost does not mean saving is broken — the lean
   * retry usually lands — but when even the retry fails, the newest record is
   * memory-only and the results screen must say so rather than staying quiet
   * because the boot probe once passed.
   */
  get persistent(): boolean {
    return this.storage.persistent && this.lastWriteHeld;
  }

  best(levelId: string): RouteRecord | null {
    return this.records.routes[levelId] ?? null;
  }

  /**
   * Offer a finished run. Returns whether it became the level's record.
   *
   * **The return value is about the time, not about the disk.** A run that beat
   * the record and then failed to persist still returns true, because from the
   * player's side it *is* the new best — it is on the results screen, the HUD
   * compares against it, and the ghost races them for the rest of the session.
   * A caller that needs to warn about persistence asks `persistent`, which
   * answers the question the player would actually ask.
   *
   * The submitted record is re-validated exactly as a stored one is. It arrives
   * from our own code, so this is not distrust of the caller; it is the
   * guarantee that whatever ends up in memory is the same shape that would come
   * back from storage, so a bug cannot hide until the next boot.
   */
  submit(record: RouteRecord): boolean {
    const levelId = record.levelId;
    if (typeof levelId !== 'string' || levelId.length === 0) return false;
    if (levelId.length > MAX_LEVEL_ID_LENGTH) return false;

    const previous = this.best(levelId);
    if (!isNewRecord(record.totalSeconds, previous === null ? null : previous.totalSeconds)) {
      return false;
    }

    const kept = coerceRoute(levelId, record);
    // `isNewRecord` already rejected a non-finite or non-positive time, so the
    // only way to arrive here is a record that coerces. Guarding anyway, since
    // a null would otherwise mean silently discarding a run the caller was told
    // was kept.
    if (kept === null) return false;

    this.records = withRoute(this.records, levelId, kept);
    this.persist();
    this.announce();
    return true;
  }

  clearLevel(levelId: string): void {
    if (this.best(levelId) === null) return;

    const routes = emptyRoutes();
    for (const [id, existing] of Object.entries(this.records.routes)) {
      if (id !== levelId) routes[id] = existing;
    }
    this.records = Object.freeze({ routes: Object.freeze(routes) });

    // An empty record is removed rather than written as `{"routes":{}}`. The
    // bytes are trivial; the point is that clearing is the one action a player
    // takes *because* the store is full, so it must free space rather than
    // consume a little more.
    if (routeCount(this.records) === 0) this.storage.remove(RECORDS_KEY);
    else this.storage.writeJson(RECORDS_KEY, this.records);

    this.announce();
  }

  clearAll(): void {
    if (routeCount(this.records) === 0) return;
    this.records = DEFAULT_RECORDS;
    this.storage.remove(RECORDS_KEY);
    this.announce();
  }

  onChange(listener: RecordsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  /**
   * Write the record out, shedding the ghost if that is what it takes.
   *
   * **This is the path this feature will actually hit.** A ghost track is by a
   * wide margin the largest thing the game saves, and `localStorage` quotas are
   * small, shared across the whole origin, and reached without warning. The
   * naive version — one `writeJson`, ignore the boolean — loses the personal
   * best and the replay together, on the exact run the player most wanted to
   * keep, and does it silently.
   *
   * So the failure is treated as what it almost always is: *too big*, not
   * *broken*. Ghosts are optional and personal-best times are not. On failure,
   * the store removes the oldest ghost, tries again, and continues oldest-first
   * until the write fits. The just-finished run normally has the newest date,
   * so it keeps the replay without making the player manage storage; every
   * route keeps its time, splits, and date.
   *
   * Two things this deliberately does **not** do:
   *
   *   - It never evicts a personal-best result. Automatic cleanup stops at the
   *     replay field; the number the player earned survives.
   *   - It does not keep an eviction in memory when its write fails too.
   *     Dropping a ghost bought nothing at that point, and the in-memory replay
   *     still works for the rest of the session. The newest result simply will
   *     not survive the reload — and `persistent` is how the UI says so.
   */
  private persist(): void {
    if (this.storage.writeJson(RECORDS_KEY, this.records)) {
      this.lastWriteHeld = true;
      return;
    }

    let leanRecords = this.records;
    for (const routeId of ghostEvictionOrder(this.records)) {
      leanRecords = withoutGhost(leanRecords, routeId);
      if (this.storage.writeJson(RECORDS_KEY, leanRecords)) {
        this.records = leanRecords;
        this.lastWriteHeld = true;
        return;
      }
    }
    this.lastWriteHeld = false;
  }

  /**
   * Announced after persistence has settled, never before.
   *
   * A listener that reads `current` during the notification therefore sees the
   * record as it will be on the next boot — including a ghost the quota path
   * had to drop. Announcing first would show the results screen a replay button
   * for a ghost that is no longer there.
   */
  private announce(): void {
    for (const listener of this.listeners) listener(this.records);
  }
}
