/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ChaseRecordsStore, coerceChaseRecords, type ChaseRecord } from './chaseRecords.ts';
import { SafeStorage, type StorageLike } from '../platform/storage.ts';

/**
 * The chase's personal bests — M18.
 *
 * Two things are worth testing here and they are both about *trust*: the
 * two-tier comparison, which is the mode's own shape, and the coercion, which
 * is the only thing standing between a hand-edited `localStorage` and a results
 * screen doing arithmetic on a string.
 */

/**
 * An in-memory store, so this can be exercised without a browser.
 *
 * `refuse` is the private-window case: `SafeStorage` is failure-safe by
 * contract, so a browser that will not keep anything must still let the session
 * hold its own best and must say that it will not survive a reload.
 */
function memoryStorage(refuse = false): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key: string): string | null => data.get(key) ?? null,
    removeItem: (key: string): void => {
      data.delete(key);
    },
    setItem: (key: string, value: string): void => {
      if (refuse) throw new Error('storage is full');
      data.set(key, value);
    },
  };
}

function fakeStorage(persistent = true): SafeStorage {
  return new SafeStorage(memoryStorage(!persistent));
}

function record(over: Partial<ChaseRecord> = {}): ChaseRecord {
  return {
    levelId: 'generated-r3-euc-1',
    seconds: 100,
    escaped: false,
    setAt: '2026-08-13T00:00:00.000Z',
    ...over,
  };
}

test('a first run is always a record', () => {
  const store = new ChaseRecordsStore(fakeStorage());
  assert.equal(store.submit(record()), true);
  assert.equal(store.best('generated-r3-euc-1')?.seconds, 100);
});

test('longer survival wins, and matching is not beating', () => {
  const store = new ChaseRecordsStore(fakeStorage());
  store.submit(record({ seconds: 100 }));
  assert.equal(store.submit(record({ seconds: 99.9 })), false);
  assert.equal(store.submit(record({ seconds: 100 })), false, 'a tie was called a record');
  assert.equal(store.submit(record({ seconds: 100.01 })), true);
});

test('an escape beats any survival, and a survival never beats an escape', () => {
  // The mode's whole shape (§13 q24): the win is getting away, not lasting
  // long. Without this a player who escaped and then died at 4:59 would be
  // congratulated for the death.
  const store = new ChaseRecordsStore(fakeStorage());
  store.submit(record({ seconds: 299, escaped: false }));
  assert.equal(store.submit(record({ seconds: 300, escaped: true })), true);
  assert.equal(store.best('generated-r3-euc-1')?.escaped, true);

  assert.equal(
    store.submit(record({ seconds: 299.99, escaped: false })),
    false,
    'a bust replaced an escape',
  );
});

test('each route keeps its own best', () => {
  const store = new ChaseRecordsStore(fakeStorage());
  store.submit(record({ levelId: 'generated-r3-alpha', seconds: 200 }));
  store.submit(record({ levelId: 'generated-r3-beta', seconds: 20 }));
  assert.equal(store.best('generated-r3-alpha')?.seconds, 200);
  assert.equal(store.best('generated-r3-beta')?.seconds, 20);
  assert.equal(store.best('generated-r3-gamma'), null);
});

test('a hand-edited store is dropped row by row rather than trusted', () => {
  const coerced = coerceChaseRecords({
    routes: {
      good: { seconds: 12, escaped: false, setAt: '2026-08-13T00:00:00.000Z' },
      negative: { seconds: -1, escaped: false, setAt: '2026-08-13T00:00:00.000Z' },
      absurd: { seconds: 1e12, escaped: true, setAt: '2026-08-13T00:00:00.000Z' },
      notBoolean: { seconds: 12, escaped: 'yes', setAt: '2026-08-13T00:00:00.000Z' },
      noDate: { seconds: 12, escaped: true },
      notANumber: { seconds: 'ages', escaped: true, setAt: '2026-08-13T00:00:00.000Z' },
    },
  });

  assert.notEqual(coerced, null);
  assert.deepEqual(Object.keys(coerced!.routes), ['good']);
});

test('rubbish in place of a record store is rejected whole', () => {
  assert.equal(coerceChaseRecords(null), null);
  assert.equal(coerceChaseRecords(42), null);
  assert.equal(coerceChaseRecords({}), null);
  assert.equal(coerceChaseRecords({ routes: 'none' }), null);
});

test('a browser that cannot save still keeps the session’s best, and says so', () => {
  // The same failure-safe contract the other two stores hold: a private window
  // must not lose the run the player is looking at, and must not claim the run
  // will be there tomorrow.
  const store = new ChaseRecordsStore(fakeStorage(false));
  assert.equal(store.submit(record({ seconds: 50 })), true);
  assert.equal(store.best('generated-r3-euc-1')?.seconds, 50);
  assert.equal(store.persistent, false);
});

test('clearing forgets every route', () => {
  const store = new ChaseRecordsStore(fakeStorage());
  store.submit(record({ levelId: 'generated-r3-alpha' }));
  store.submit(record({ levelId: 'generated-r3-beta' }));
  store.clearAll();
  assert.equal(store.best('generated-r3-alpha'), null);
  assert.equal(store.best('generated-r3-beta'), null);
});
