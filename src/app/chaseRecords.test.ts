/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  CHASE_RECORDS_KEY,
  ChaseRecordsStore,
  coerceChaseRecords,
  isChaseForce,
  type ChaseRecord,
} from './chaseRecords.ts';
import { SafeStorage, STORAGE_PREFIX, type StorageLike } from '../platform/storage.ts';
import { CHASE } from '../data/tuning.ts';

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
function memoryStorage(refuse = false, data = new Map<string, string>()): StorageLike {
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

// ---------------------------------------------------------------------------
// Bests per force — M39 Part P (docs/PLANS.md §39.6b.3 "Records", q208, A-8, R-8)
// ---------------------------------------------------------------------------

/** The raw storage key the chase store writes, `SafeStorage`'s prefix included. */
const RAW_KEY = STORAGE_PREFIX + CHASE_RECORDS_KEY;

/** A storage whose raw strings the test can read and seed, and a store on it. */
function sharedStorage(): { data: Map<string, string>; open: () => ChaseRecordsStore } {
  const data = new Map<string, string>();
  return { data, open: () => new ChaseRecordsStore(new SafeStorage(memoryStorage(false, data))) };
}

const ROUTE = 'generated-r3-euc-1';
/** A one-cop best exactly as an M18 build wrote it: no `force` field anywhere. */
const OLD_SAVE = JSON.stringify({
  routes: { [ROUTE]: { levelId: ROUTE, seconds: 300, escaped: true, setAt: '2026-08-13T00:00:00.000Z' } },
});

test('the forces a best can be filed under are the whole numbers 1..roomSize − 1', () => {
  // The pack at one human is `roomSize − 1` (q207's three), and no chase is
  // ridden against more cops than that or against a fraction of one.
  assert.equal(CHASE.roomSize - 1, 3);
  for (const force of [1, 2, 3]) assert.equal(isChaseForce(force), true, `${force} refused`);
  for (const force of [0, 4, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null, undefined]) {
    assert.equal(isChaseForce(force), false, `${String(force)} accepted`);
  }
});

test('an old one-cop row survives, reads as force 1, and is not the three-cop best', () => {
  const { data, open } = sharedStorage();
  data.set(RAW_KEY, OLD_SAVE);
  const store = open();
  const old = store.best(ROUTE);
  assert.equal(old?.seconds, 300, 'a pre-Part-P best was lost on load');
  assert.equal(old?.force, 1, 'a row without a force did not read as the one-cop best');
  assert.equal(store.best(ROUTE, 1), old, 'best(level, 1) is not best(level)');
  // q208: an escape against one Dorkins is not an escape against three.
  assert.equal(store.best(ROUTE, 3), null, 'the one-cop escape was offered as the three-cop best');
  assert.equal(store.best(ROUTE, 2), null);
});

test('a three-cop best neither evicts nor is compared with the one-cop best', () => {
  const { data, open } = sharedStorage();
  data.set(RAW_KEY, OLD_SAVE);
  const store = open();
  // A bust at 40 s is nowhere near the old 5:00 escape — and is still a
  // record, because against three cops nothing has been set yet.
  assert.equal(store.submit(record({ seconds: 40, escaped: false, force: 3 })), true);
  assert.equal(store.best(ROUTE, 3)?.seconds, 40);
  assert.equal(store.best(ROUTE, 3)?.force, 3);
  assert.equal(store.best(ROUTE, 1)?.seconds, 300, 'the three-cop run evicted the one-cop best');
  assert.equal(store.best(ROUTE, 1)?.escaped, true);
  // And within a force the two-tier rule still holds.
  assert.equal(store.submit(record({ seconds: 39, escaped: false, force: 3 })), false);
  assert.equal(store.submit(record({ seconds: 20, escaped: true, force: 3 })), true);
  // A one-cop run is compared with the one-cop best only.
  assert.equal(store.submit(record({ seconds: 299, escaped: true, force: 1 })), false);
  assert.equal(store.best(ROUTE, 3)?.seconds, 20);
});

test('both forces round-trip, and the one-cop row is rewritten in its M18 shape', () => {
  const { data, open } = sharedStorage();
  data.set(RAW_KEY, OLD_SAVE);
  const first = open();
  assert.equal(first.submit(record({ seconds: 120, force: 3 })), true);
  assert.equal(first.submit(record({ levelId: 'generated-r3-beta', seconds: 60, force: 2 })), true);

  const reloaded = open();
  assert.deepEqual(reloaded.best(ROUTE, 1), { ...JSON.parse(OLD_SAVE).routes[ROUTE], force: 1 });
  assert.equal(reloaded.best(ROUTE, 3)?.seconds, 120);
  assert.equal(reloaded.best('generated-r3-beta', 2)?.seconds, 60);
  assert.equal(reloaded.best('generated-r3-beta', 3), null);

  // A-8: the old row is written back byte for byte — no `force` field is
  // grafted onto `routes`, so a pre-Part-P build reads exactly what it wrote.
  const disk = JSON.parse(data.get(RAW_KEY)!);
  assert.deepEqual(disk.routes, JSON.parse(OLD_SAVE).routes);
  assert.deepEqual(Object.keys(disk.forces).sort(), ['2', '3']);
});

test('a save that only ever held one-cop bests is written in exactly the M18 shape', () => {
  const { data, open } = sharedStorage();
  const store = open();
  store.submit(record({ seconds: 100 }));
  const disk = JSON.parse(data.get(RAW_KEY)!);
  assert.deepEqual(Object.keys(disk), ['routes'], 'an empty forces map was written beside the M18 rows');
  assert.equal('force' in disk.routes[ROUTE], false);
});

test('where a row is filed is its force, never its own field', () => {
  // R-8: a `forces['3']` row without a field is a three-cop best, and one whose
  // field says 2 is still a three-cop best; a `routes` row claiming 3 is force 1.
  const coerced = coerceChaseRecords({
    routes: { [ROUTE]: { seconds: 10, escaped: false, setAt: '2026-09-23T00:00:00.000Z', force: 3 } },
    forces: {
      3: {
        [ROUTE]: { seconds: 30, escaped: false, setAt: '2026-09-23T00:00:00.000Z' },
        'generated-r3-beta': { seconds: 31, escaped: false, setAt: '2026-09-23T00:00:00.000Z', force: 2 },
      },
    },
  });
  assert.equal(coerced?.routes[ROUTE]?.force, 1);
  assert.equal(coerced?.forces?.['3']?.[ROUTE]?.force, 3);
  assert.equal(coerced?.forces?.['3']?.['generated-r3-beta']?.force, 3);
  assert.equal(coerced?.forces?.['2'], undefined, 'a row moved itself by its own field');

  // And through a reload.
  const { data, open } = sharedStorage();
  data.set(RAW_KEY, JSON.stringify({
    routes: {},
    forces: { 3: { [ROUTE]: { seconds: 30, escaped: false, setAt: '2026-09-23T00:00:00.000Z', force: 2 } } },
  }));
  const store = open();
  assert.equal(store.best(ROUTE, 3)?.seconds, 30);
  assert.equal(store.best(ROUTE, 3)?.force, 3);
  assert.equal(store.best(ROUTE, 2), null);
});

test('a malformed forces field is dropped, not repaired, and never takes the one-cop rows with it', () => {
  const good = { seconds: 12, escaped: false, setAt: '2026-09-23T00:00:00.000Z' };
  for (const forces of ['three', 42, null, [good], true]) {
    const coerced = coerceChaseRecords({ routes: { [ROUTE]: good }, forces });
    assert.notEqual(coerced, null, `${JSON.stringify(forces)} took the whole store down`);
    assert.equal(coerced!.routes[ROUTE]?.seconds, 12);
    assert.equal(coerced!.forces, undefined, `${JSON.stringify(forces)} was repaired into a forces map`);
  }
  // '1' is dropped because `routes` is force 1's only home; '4' is a room no
  // rule allows; '2.5', '02' and '' are not the decimal string of a force.
  const coerced = coerceChaseRecords({
    routes: {},
    forces: {
      1: { [ROUTE]: good },
      4: { [ROUTE]: good },
      2.5: { [ROUTE]: good },
      '02': { [ROUTE]: good },
      '': { [ROUTE]: good },
      0: { [ROUTE]: good },
      2: 'not a table',
      3: { [ROUTE]: good, bad: { seconds: -1, escaped: false, setAt: 'x' } },
    },
  });
  assert.deepEqual(Object.keys(coerced!.forces ?? {}), ['3']);
  assert.deepEqual(Object.keys(coerced!.forces!['3']), [ROUTE]);
  assert.deepEqual(coerced!.routes, {}, 'a dropped force-1 key leaked into routes');
});

test('the store never takes a row with a force outside 1..3 or a non-integer', () => {
  const { data, open } = sharedStorage();
  const store = open();
  for (const force of [0, 4, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(store.submit(record({ force })), false, `force ${force} was filed`);
  }
  assert.equal(data.has(RAW_KEY), false, 'a refused run still wrote to storage');
  assert.equal(store.best(ROUTE), null);
  // And an impossible force is simply not a best anybody holds.
  assert.equal(store.best(ROUTE, 4), null);
  assert.equal(store.best(ROUTE, 2.5), null);
});

test('the level-id cap and the key namespace hold for every force', () => {
  const { data, open } = sharedStorage();
  const store = open();
  const tooLong = 'x'.repeat(65);
  assert.equal(store.submit(record({ levelId: tooLong, force: 3 })), false);
  assert.equal(store.submit(record({ levelId: 'x'.repeat(64), force: 3 })), true);
  // One key, `chase`, and nothing suffixed onto a level id.
  assert.deepEqual([...data.keys()], [RAW_KEY]);
  const disk = JSON.parse(data.get(RAW_KEY)!);
  assert.deepEqual(Object.keys(disk.forces['3']), ['x'.repeat(64)]);
});

test('clearing forgets every force, and nothing outside the chase key', () => {
  const { data, open } = sharedStorage();
  data.set(`${STORAGE_PREFIX}records`, '{"unrelated":true}');
  const store = open();
  store.submit(record({ force: 1 }));
  store.submit(record({ force: 2 }));
  store.submit(record({ force: 3 }));
  store.clearAll();
  for (const force of [1, 2, 3]) assert.equal(store.best(ROUTE, force), null);
  assert.equal(data.get(`${STORAGE_PREFIX}records`), '{"unrelated":true}', 'clearing the chase touched another save');
});
