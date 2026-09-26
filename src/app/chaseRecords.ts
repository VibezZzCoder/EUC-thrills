/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHASE } from '../data/tuning.ts';
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
 * **Bests are kept per force since M39 Part P** (`docs/PLANS.md` §39.6b.3
 * "Records", q208, A-8). The solo chase became one rider against three cops,
 * and a time survived against one Dorkins is not a time survived against
 * three: compared, the old one-cop bests would either stand forever over the
 * harder runs or be evicted by them. So the force a run was ridden against is
 * part of what a best *is*. Force-1 rows stay exactly where M18 put them
 * (`routes`, the shape a pre-Part-P build reads and writes), and forces 2..3
 * live in a new `forces` map beside it, keyed by the force's decimal string
 * and then by level id — so the key namespace is unchanged, nothing is
 * suffixed onto a level id, and an old save loads with every row it had.
 * **Where a row is filed is its force, never its own field (R-8)**: a
 * hand-edited `force` cannot move a row between forces, and a row without one
 * is not an error. The store knows nothing about couches — "a couch chase
 * files nothing" is `Game.couchSession`'s call, asked before `submit`.
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
  /**
   * The cop count the run was ridden against — M39 Part P (q208).
   *
   * Absent reads as 1: every pre-Part-P row is a one-cop best. On a row the
   * store hands back it is always present, set from where the row is filed
   * (R-8); on a row offered to `submit` it says where to file it.
   */
  readonly force?: number;
}

export interface ChaseRecords {
  /** Force-1 rows, keyed by level id: the M18 shape, left untouched on disk. */
  readonly routes: Readonly<Record<string, ChaseRecord>>;
  /**
   * Rows for forces 2..`CHASE.roomSize − 1`, keyed by the force's decimal
   * string, then the level id — M39 Part P (A-8). Absent in old saves, and
   * absent while no such row exists, so a save that has only ever held
   * one-cop bests is written in exactly the M18 shape.
   */
  readonly forces?: Readonly<Record<string, Readonly<Record<string, ChaseRecord>>>>;
}

export const CHASE_RECORDS_KEY = 'chase';

const DEFAULT_RECORDS: ChaseRecords = Object.freeze({ routes: Object.freeze({}) });

/**
 * The largest cop count a best can be filed under: the whole cop slot's pack
 * at one human (`CHASE.roomSize − 1`, three). Derived rather than written, for
 * the reason `roomSize` is the rule's one constant (q207).
 */
const MAX_FORCE = CHASE.roomSize - 1;

/**
 * Is `force` a cop count a best can be filed under? An integer in
 * 1..`MAX_FORCE`; anything else is a run nobody could have ridden.
 */
export function isChaseForce(force: unknown): force is number {
  return typeof force === 'number' && Number.isInteger(force) && force >= 1 && force <= MAX_FORCE;
}

/**
 * The `forces` key a force-2+ row is filed under, or null for a key that names
 * no filable force. `'1'` is refused on purpose: `routes` is force 1's only
 * home, so a second one could only disagree with it. The decimal string must
 * be the canonical one (`'2'`, not `'02'` or `'2.0'`), so a key round-trips.
 */
function forceOfKey(key: string): number | null {
  const force = Number(key);
  if (!isChaseForce(force) || force === 1 || String(force) !== key) return null;
  return force;
}

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

  const routes = coerceTable(source, 1);

  // **A malformed `forces` field is dropped, not repaired** — and it never
  // takes the one-cop bests down with it: those were valid before Part P
  // existed and stay valid whatever a newer build (or a hand edit) wrote
  // beside them.
  const forcesSource = (raw as { forces?: unknown }).forces;
  if (typeof forcesSource !== 'object' || forcesSource === null || Array.isArray(forcesSource)) {
    return { routes };
  }
  const forces: Record<string, Record<string, ChaseRecord>> = {};
  for (const [key, table] of Object.entries(forcesSource as Record<string, unknown>)) {
    const force = forceOfKey(key);
    if (force === null || typeof table !== 'object' || table === null) continue;
    const rows = coerceTable(table, force);
    if (Object.keys(rows).length > 0) forces[key] = rows;
  }
  return Object.keys(forces).length > 0 ? { routes, forces } : { routes };
}

/** One force's rows, each re-validated and given the force it is filed under (R-8). */
function coerceTable(source: object, force: number): Record<string, ChaseRecord> {
  const rows: Record<string, ChaseRecord> = {};
  for (const [levelId, value] of Object.entries(source as Record<string, unknown>)) {
    if (levelId.length === 0 || levelId.length > MAX_LEVEL_ID_LENGTH) continue;
    const row = coerceRow(levelId, value, force);
    if (row !== null) rows[levelId] = row;
  }
  return rows;
}

/**
 * One row, re-validated. `force` is the force the row is *filed* under, never
 * the one it claims: the stored field is ignored on purpose (R-8), so a row
 * under `forces['3']` whose field says 2 reads as a three-cop best, and a
 * one-cop row from before Part P, which has no field at all, reads as 1.
 */
function coerceRow(levelId: string, value: unknown, force: number): ChaseRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<ChaseRecord>;
  const { seconds, escaped, setAt } = row;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds > MAX_SECONDS) return null;
  if (typeof escaped !== 'boolean') return null;
  if (typeof setAt !== 'string' || setAt.length === 0 || setAt.length > MAX_SET_AT_LENGTH) {
    return null;
  }
  return { levelId, seconds, escaped, setAt, force };
}

/**
 * What goes to disk: the in-memory records with every force-1 row back in its
 * M18 shape — M39 Part P (A-8).
 *
 * In memory every row carries its force, because a caller holding a row
 * should not have to know where it came from. On disk a `routes` row's force
 * is its address and nothing else, so it is written **without** the field:
 * an old row is rewritten byte for byte, and a pre-Part-P build reading this
 * save sees exactly the rows it would have written itself. A `forces` row
 * keeps its field, which is redundant with its key and harmless, and makes a
 * hand-read save say what it holds.
 */
function toDisk(records: ChaseRecords): ChaseRecords {
  const routes: Record<string, ChaseRecord> = {};
  for (const [levelId, row] of Object.entries(records.routes)) {
    routes[levelId] = {
      levelId: row.levelId,
      seconds: row.seconds,
      escaped: row.escaped,
      setAt: row.setAt,
    };
  }
  return records.forces === undefined ? { routes } : { routes, forces: records.forces };
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

  /**
   * The best on `levelId` against `force` cops, or null.
   *
   * `force` defaults to 1, so every M18 caller still reads the one-cop best
   * it always did; the solo chase since Part P reads `best(levelId, 3)`
   * (`cpuPackSize(1, false)`). A force nobody can ride answers null.
   */
  best(levelId: string, force = 1): ChaseRecord | null {
    if (!isChaseForce(force)) return null;
    if (force === 1) return this.records.routes[levelId] ?? null;
    return this.records.forces?.[String(force)]?.[levelId] ?? null;
  }

  /**
   * Offer a run. True when it became the new best.
   *
   * Escaping outranks surviving; otherwise longer wins, and a tie is not a
   * record — the same rule the other two stores apply, in the units this mode
   * is measured in. **Compared within the run's own force only** (q208): it
   * is filed under `record.force ?? 1`, so a three-cop run neither evicts nor
   * is measured against a one-cop best. A force outside 1..`roomSize − 1`, or
   * a non-integer, is refused with nothing written.
   */
  submit(record: ChaseRecord): boolean {
    if (record.levelId.length === 0 || record.levelId.length > MAX_LEVEL_ID_LENGTH) return false;
    const force = record.force ?? 1;
    if (!isChaseForce(force)) return false;
    const coerced = coerceRow(record.levelId, record, force);
    if (coerced === null) return false;

    const existing = this.best(record.levelId, force);
    if (existing !== null) {
      if (existing.escaped && !coerced.escaped) return false;
      if (existing.escaped === coerced.escaped && coerced.seconds <= existing.seconds) return false;
    }

    if (force === 1) {
      this.records = this.records.forces === undefined
        ? { routes: { ...this.records.routes, [record.levelId]: coerced } }
        : { routes: { ...this.records.routes, [record.levelId]: coerced }, forces: this.records.forces };
    } else {
      const key = String(force);
      const forces = this.records.forces ?? {};
      this.records = {
        routes: this.records.routes,
        forces: { ...forces, [key]: { ...(forces[key] ?? {}), [record.levelId]: coerced } },
      };
    }
    this.lastWriteHeld = this.storage.writeJson(CHASE_RECORDS_KEY, toDisk(this.records));
    this.announce();
    return true;
  }

  /** Forget every chase best, every force's — and nothing outside the `chase` key. */
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
