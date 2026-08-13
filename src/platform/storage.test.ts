/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SafeStorage, STORAGE_PREFIX, type StorageLike } from './storage.ts';

/**
 * Every branch in `storage.ts` is a browser behaviour that is hard to
 * reproduce and easy to get wrong, so each one gets a fake store that
 * misbehaves in exactly one way. This is the only place those failures are
 * ever actually executed — a real browser in a normal window takes the happy
 * path forever.
 */

class MemoryStore implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/** Safari's private mode: a store with a zero quota. */
class ThrowingStore implements StorageLike {
  getItem(): string | null {
    return null;
  }

  setItem(): void {
    throw new Error('QuotaExceededError');
  }

  removeItem(): void {}
}

/** A privacy extension: accepts the write, keeps nothing. */
class DiscardingStore implements StorageLike {
  getItem(): string | null {
    return null;
  }

  setItem(): void {}

  removeItem(): void {}
}

test('a working store persists values and reports itself persistent', () => {
  const store = new MemoryStore();
  const storage = new SafeStorage(store);

  assert.equal(storage.failure, null);
  assert.equal(storage.persistent, true);
  assert.equal(storage.write('options', '{"a":1}'), true);
  assert.equal(storage.read('options'), '{"a":1}');
  // Namespaced and versioned, so a future schema writes elsewhere and a
  // downgrade finds its own record.
  assert.equal(store.values.get(`${STORAGE_PREFIX}options`), '{"a":1}');

  storage.remove('options');
  assert.equal(storage.read('options'), null);
});

test('the probe leaves nothing behind', () => {
  const store = new MemoryStore();
  const storage = new SafeStorage(store);
  assert.equal(storage.persistent, true);
  assert.equal(store.values.size, 0, 'the probe key must be removed again');
});

test('no store at all falls back to memory rather than throwing', () => {
  const storage = new SafeStorage(null);

  assert.equal(storage.failure, 'unavailable');
  assert.equal(storage.persistent, false);
  // The session still keeps the setting — a player in a private window can
  // turn the master volume down and have it hold until they close the tab.
  assert.equal(storage.write('options', 'value'), false);
  assert.equal(storage.read('options'), 'value');
});

test('a store that throws on write is detected at construction', () => {
  const storage = new SafeStorage(new ThrowingStore());

  assert.equal(storage.failure, 'blocked');
  assert.equal(storage.persistent, false);
  assert.equal(storage.write('options', 'value'), false);
  assert.equal(storage.read('options'), 'value');
});

test('a store that silently discards writes is detected too', () => {
  // The failure nothing throws for. Only a read-back can see it, which is why
  // the probe round-trips instead of merely writing.
  const storage = new SafeStorage(new DiscardingStore());

  assert.equal(storage.failure, 'discarded');
  assert.equal(storage.persistent, false);
  assert.equal(storage.write('options', 'value'), false);
  assert.equal(storage.read('options'), 'value');
});

test('a store that starts failing mid-session keeps the session working', () => {
  const store = new MemoryStore();
  const storage = new SafeStorage(store);
  storage.write('options', 'first');

  store.setItem = () => {
    throw new Error('QuotaExceededError');
  };

  assert.equal(storage.write('options', 'second'), false, 'the write did not persist');
  assert.equal(storage.read('options'), 'second', 'but the session has the new value');
  // Deliberately still "persistent": demoting it here would make the settings
  // screen change its mind about what it already told the player.
  assert.equal(storage.persistent, true);
});

test('a store that starts silently discarding mid-session demotes persistence', () => {
  // The boot probe passed, and only later does a privacy extension start
  // accepting writes and keeping nothing (M10 QA, F7). Nothing throws, so the
  // only way to see it is the write's own read-back — and once seen, the
  // store must stop claiming values will survive a reload, or the results
  // screen omits its warning while the newest record exists only in memory.
  const store = new MemoryStore();
  const storage = new SafeStorage(store);
  assert.equal(storage.write('records', 'first'), true);
  assert.equal(storage.persistent, true);

  store.setItem = () => {};

  assert.equal(storage.write('records', 'second'), false, 'the write did not persist');
  assert.equal(storage.read('records'), 'second', 'but the session has the new value');
  assert.equal(storage.persistent, false, 'a discarding store is not persistent');
  // Later writes are not retried against a store known to be lying: memory
  // still keeps the session working and the answer stays honest.
  assert.equal(storage.write('records', 'third'), false);
  assert.equal(storage.read('records'), 'third');
});

test('a corrupt record is dropped rather than failing every boot', () => {
  const store = new MemoryStore();
  const storage = new SafeStorage(store);
  store.setItem(`${STORAGE_PREFIX}options`, '{not json');

  assert.equal(storage.readJson('options', (raw) => raw), null);
  assert.equal(
    store.values.has(`${STORAGE_PREFIX}options`),
    false,
    'an unparseable record must be deleted, not re-read on the next boot',
  );
});

test('a record the reviver rejects is dropped', () => {
  const store = new MemoryStore();
  const storage = new SafeStorage(store);
  storage.writeJson('options', { shake: 'loud' });

  const revive = (raw: unknown): { shake: number } | null => {
    const record = raw as { shake?: unknown };
    return typeof record?.shake === 'number' ? { shake: record.shake } : null;
  };

  assert.equal(storage.readJson('options', revive), null);
  assert.equal(store.values.has(`${STORAGE_PREFIX}options`), false);

  storage.writeJson('options', { shake: 0.5 });
  assert.deepEqual(storage.readJson('options', revive), { shake: 0.5 });
});

test('a value that cannot be serialized fails quietly', () => {
  const storage = new SafeStorage(new MemoryStore());
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;

  assert.equal(storage.writeJson('options', cycle), false);
  assert.equal(storage.read('options'), null);
});
