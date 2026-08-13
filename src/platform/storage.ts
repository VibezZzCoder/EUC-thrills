/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Failure-safe saved data — `docs/PLANS.md` §3.6, and the first file under
 * `src/platform/`.
 *
 * Everything M9 lets a player change has to survive a reload: options, key
 * bindings, and the flags that stop the first-ride prompts from appearing on
 * the hundredth ride. M10's personal bests and ghost recording land on the
 * same mechanism, which is why it arrives a milestone before they need it
 * rather than alongside them.
 *
 * **The whole point of this file is that `localStorage` is not a thing you may
 * assume works.** Four distinct failures are live in shipping browsers today,
 * and only the last of them is the one people remember:
 *
 *   1. *Reading the property throws.* In a third-party frame with storage
 *      blocked, `window.localStorage` is not an empty store — the getter
 *      itself raises a `SecurityError`. A feature probe written as
 *      `if (window.localStorage)` throws before it can answer.
 *   2. *Writing throws.* Safari's private mode has historically offered a
 *      store with a zero quota, so `setItem` raises `QuotaExceededError` on
 *      the first byte. Firefox in private windows and iOS content blockers
 *      have their own variants.
 *   3. *Writing silently does nothing.* Some privacy extensions accept the
 *      write and discard it. Nothing throws; the value is simply not there on
 *      the next read.
 *   4. *The value is corrupt.* A half-written record, a downgrade to an older
 *      build, or a player editing it by hand. `JSON.parse` on any of those
 *      throws, and an unguarded parse at boot is a game that will not start.
 *
 * All four are handled the same way: **the game keeps running with the value
 * it has.** Saving is a convenience, never a precondition. When the store is
 * unusable this falls back to an in-memory map, so a player in a private
 * window can still change a setting and have it hold for that session — which
 * is materially better than a settings screen that silently refuses changes.
 *
 * Nothing here knows what a game option is. It moves strings, and
 * `app/options.ts` owns their meaning.
 */

/**
 * The slice of the Web Storage API this file uses.
 *
 * Declared rather than imported from the DOM lib so a `node --test` unit test
 * can hand in a store that throws on demand — every branch above is reachable
 * headlessly, which is the only way any of them are ever actually exercised.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Why persistence is unavailable, or `null` while it works.
 *
 * Surfaced so the settings screen can say "this browser will not let the game
 * save settings" rather than leaving the player to discover it after a reload.
 * A silent failure here is worse than a visible one: the player's mental model
 * becomes "this game forgets my settings", which is a bug report nobody can
 * act on.
 */
export type StorageFailure = 'unavailable' | 'blocked' | 'discarded';

/**
 * Key prefix, with the schema version in it.
 *
 * The version is part of the key rather than a field inside the value on
 * purpose: a future schema change writes to a new key and the old one is
 * simply never read, so a downgrade to a previous build finds its own data
 * intact instead of choking on a newer record it cannot understand. The cost
 * is a few orphaned keys, which is nothing.
 */
export const STORAGE_PREFIX = 'euc-thrills.v1.';

/** The sentinel the probe writes. Removed immediately; never read by anything. */
const PROBE_KEY = `${STORAGE_PREFIX}probe`;

/**
 * Reach the browser's store without letting its getter take the boot down.
 *
 * Separate from the probe below because these are two different failures:
 * this one is "there is no store to talk to", and the probe's is "there is a
 * store and it will not keep anything".
 */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    const store = (globalThis as { localStorage?: StorageLike }).localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

export class SafeStorage {
  /** `null` while saving works. See `StorageFailure`. */
  readonly failure: StorageFailure | null;

  private readonly store: StorageLike | null;

  /**
   * Session-lifetime fallback, used whenever `store` is null or has failed.
   *
   * It is also written through to on the way to a working store, so a read
   * never has to go back to a store that may have discarded the write. That
   * makes an option applied in the settings screen behave identically in every
   * one of the four failure modes, which is what keeps the UI free of "did it
   * save?" branching.
   */
  private readonly memory = new Map<string, string>();

  constructor(source: StorageLike | null = browserStorage()) {
    if (source === null) {
      this.store = null;
      this.failure = 'unavailable';
      return;
    }

    // Round-trip a sentinel. A store that throws on write is caught here; a
    // store that accepts the write and drops it is caught by reading it back,
    // which is the only way to see failure 3 at all.
    let failure: StorageFailure | null = null;
    try {
      source.setItem(PROBE_KEY, 'ok');
      if (source.getItem(PROBE_KEY) !== 'ok') failure = 'discarded';
      source.removeItem(PROBE_KEY);
    } catch {
      failure = 'blocked';
    }

    this.failure = failure;
    this.store = failure === null ? source : null;
  }

  /**
   * True when a later write reached the store and was silently dropped —
   * failure 3 arriving *after* the boot probe passed, which a privacy
   * extension switched on mid-session can produce. Tracked separately from
   * `failure`, which is a boot-time verdict.
   */
  private degraded = false;

  /**
   * True while values written here will still be there after a reload.
   *
   * Demoted when a write is later discovered to be silently discarded (M10
   * QA, F7): a store that accepts a write and drops it is not persistent,
   * however its boot probe went, and continuing to answer "yes" here is what
   * let the results screen omit its warning while the newest record existed
   * only in memory. A write that merely *throws* does not demote — that is
   * the quota path, it is usually about one oversized value, and the caller
   * sees the false return per write.
   */
  get persistent(): boolean {
    return this.store !== null && !this.degraded;
  }

  /**
   * Memory first, then the browser's store.
   *
   * That order is load-bearing rather than an optimization. A store that
   * accepted writes at boot and starts refusing them later — a quota reached,
   * an extension switched on — still holds the *previous* value, so consulting
   * it first would hand back a setting the player has already changed and make
   * the settings screen appear to revert itself. Every successful write goes
   * through memory too, so memory is never staler than the store.
   *
   * It also means a second tab's writes do not reach a session that has
   * already written the same key, which is the right answer: two tabs editing
   * one settings record is last-writer-wins however it is resolved, and the
   * tab the player is actually looking at should win.
   */
  read(name: string): string | null {
    const key = STORAGE_PREFIX + name;
    const remembered = this.memory.get(key);
    if (remembered !== undefined) return remembered;
    if (this.store === null) return null;
    try {
      return this.store.getItem(key);
    } catch {
      // A store that worked at boot and fails now. Demoting `persistent` here
      // would make the settings screen change its mind about what it already
      // told the player, so it stays as it was and the read simply misses.
      return null;
    }
  }

  /**
   * Returns whether the value verifiably reached the browser's store, not
   * merely memory.
   *
   * Verifiably: the value is read straight back and compared, because the
   * boot probe only proves the store worked *then*. A store that starts
   * silently discarding mid-session (failure 3, arriving late) is undetectable
   * any other way — `setItem` returns normally and the value is simply not
   * there next boot. Writes are rare (a slider settling, a record landing), so
   * the extra read costs nothing that matters, and a failed readback demotes
   * `persistent` so the UI stops promising what the store no longer does.
   */
  write(name: string, value: string): boolean {
    const key = STORAGE_PREFIX + name;
    this.memory.set(key, value);
    if (this.store === null || this.degraded) return false;
    try {
      this.store.setItem(key, value);
      if (this.store.getItem(key) !== value) {
        this.degraded = true;
        return false;
      }
      return true;
    } catch {
      // Quota, or a store that has started refusing. The value is already in
      // memory, so the session keeps the setting.
      return false;
    }
  }

  remove(name: string): void {
    const key = STORAGE_PREFIX + name;
    this.memory.delete(key);
    if (this.store === null) return;
    try {
      this.store.removeItem(key);
    } catch {
      // Nothing to do and nothing worth telling the player.
    }
  }

  /**
   * Read a saved record, or `null` for absent, unparseable, or rejected.
   *
   * The `revive` callback is where the caller states what a valid record looks
   * like, and it is not optional. A parse that returns `any` straight into the
   * options model is how a hand-edited or downgraded record puts a string in a
   * volume field and silences the game with no error anywhere — so the shape
   * is checked at the boundary, once, by the module that knows the shape.
   *
   * A record that fails to revive is deleted rather than left to fail on every
   * subsequent boot.
   */
  readJson<T>(name: string, revive: (raw: unknown) => T | null): T | null {
    const text = this.read(name);
    if (text === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.remove(name);
      return null;
    }

    const revived = revive(parsed);
    if (revived === null) this.remove(name);
    return revived;
  }

  /** Serialize and save. False means it did not reach the browser's store. */
  writeJson(name: string, value: unknown): boolean {
    let text: string;
    try {
      text = JSON.stringify(value);
    } catch {
      // A cycle or a BigInt — a programming error rather than a storage one,
      // but it must not take the game down on the frame a player moved a
      // slider.
      return false;
    }
    return this.write(name, text);
  }
}
