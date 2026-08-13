/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SafeStorage, type StorageLike } from '../platform/storage.ts';
import {
  KNOCKABOUT_RECORDS_KEY,
  KnockaboutRecordsStore,
  coerceKnockaboutRecords,
} from './knockaboutRecords.ts';

/**
 * Knockabout's own store — M14, §13 q15.
 *
 * The claim worth testing is not that it saves a number. It is that it is a
 * *separate* store with a *different* ordering: `records.ts` decides a record
 * with `totalSeconds` and lower wins, and a score filed there would read as a
 * lap time, beat every real lap on the route, and evict its ghost.
 */

/** An in-memory store, so this can be exercised without a browser. */
function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key: string): string | null => data.get(key) ?? null,
    removeItem: (key: string): void => {
      data.delete(key);
    },
    setItem: (key: string, value: string): void => {
      data.set(key, value);
    },
  };
}

function store(): { store: KnockaboutRecordsStore; storage: SafeStorage } {
  const storage = new SafeStorage(memoryStorage());
  return { store: new KnockaboutRecordsStore(storage), storage };
}

const RUN = {
  levelId: 'generated-r3-ember-quay',
  struck: 9,
  total: 14,
  seconds: 61.5,
  setAt: '2026-08-12T10:00:00.000Z',
};

test('more targets is a better run, and a tie is not a record', () => {
  const { store: records } = store();
  assert.equal(records.submit(RUN), true, 'the first run is always a record');
  assert.equal(records.best(RUN.levelId)?.struck, 9);

  assert.equal(records.submit({ ...RUN, struck: 8 }), false, 'fewer is not better');
  assert.equal(records.submit({ ...RUN, struck: 9 }), false, 'a tie is not a record');
  assert.equal(records.submit({ ...RUN, struck: 10 }), true, 'more is better');
  assert.equal(records.best(RUN.levelId)?.struck, 10);
});

test('a faster run with the same score is not a record — time is worth nothing', () => {
  // §13 q14. Elapsed is shown and counts zero, and breaking a tie on it would
  // quietly make it count for something — which is the whole of what the owner
  // decided not to have.
  const { store: records } = store();
  records.submit(RUN);
  assert.equal(records.submit({ ...RUN, seconds: 1 }), false);
  assert.equal(records.best(RUN.levelId)?.seconds, RUN.seconds);
});

test('each route keeps its own best', () => {
  const { store: records } = store();
  records.submit(RUN);
  records.submit({ ...RUN, levelId: 'generated-r3-copper-gate', struck: 2, total: 5 });
  assert.equal(records.best(RUN.levelId)?.struck, 9);
  assert.equal(records.best('generated-r3-copper-gate')?.struck, 2);
  assert.equal(records.best('generated-r3-nowhere'), null);
});

test('it does not share a slot with the timed run’s records', () => {
  // The failure this whole file exists to prevent, asserted at the storage
  // layer where it would actually have happened.
  const { store: records, storage } = store();
  records.submit(RUN);
  assert.notEqual(KNOCKABOUT_RECORDS_KEY, 'records');
  assert.notEqual(storage.readJson(KNOCKABOUT_RECORDS_KEY, coerceKnockaboutRecords), null);
  assert.equal(storage.readJson('records', (raw) => raw), null, 'it wrote into the timed slot');
});

test('a best survives a reload', () => {
  const storage = new SafeStorage(memoryStorage());
  new KnockaboutRecordsStore(storage).submit(RUN);
  assert.equal(new KnockaboutRecordsStore(storage).best(RUN.levelId)?.struck, 9);
});

test('a hand-edited row is dropped rather than repaired', () => {
  // `localStorage` is editable and a build from six months ago can have written
  // a shape this one does not know. Dropping a row costs a personal best;
  // accepting one costs a crash on the results screen.
  const impossible = [
    { struck: 20, total: 5, seconds: 10, setAt: RUN.setAt },
    { struck: -1, total: 5, seconds: 10, setAt: RUN.setAt },
    { struck: 1, total: 5, seconds: -10, setAt: RUN.setAt },
    { struck: 'lots', total: 5, seconds: 10, setAt: RUN.setAt },
    { struck: 1, total: 5, seconds: 10 },
    { struck: 1, total: 5, seconds: 10, setAt: '' },
  ];
  for (const row of impossible) {
    const coerced = coerceKnockaboutRecords({ routes: { 'generated-r3-x': row } });
    assert.deepEqual(coerced, { routes: {} }, JSON.stringify(row));
  }

  assert.equal(coerceKnockaboutRecords(null), null);
  assert.equal(coerceKnockaboutRecords({}), null);
  assert.deepEqual(
    coerceKnockaboutRecords({ routes: { [`${'w'.repeat(65)}`]: { ...RUN } } }),
    { routes: {} },
    'a level id past the sixty-four-character cap is dropped',
  );
});

test('clearing forgets every route', () => {
  const { store: records } = store();
  records.submit(RUN);
  records.submit({ ...RUN, levelId: 'generated-r3-copper-gate' });
  records.clearAll();
  assert.deepEqual(records.current.routes, {});
});

test('a listener hears a new best and hears a clear', () => {
  const { store: records } = store();
  const seen: number[] = [];
  const stop = records.onChange((current) => seen.push(Object.keys(current.routes).length));
  records.submit(RUN);
  records.submit({ ...RUN, struck: 3 });
  records.clearAll();
  stop();
  records.submit({ ...RUN, struck: 12 });
  assert.deepEqual(seen, [1, 0], 'a refused run announces nothing, and a stopped listener is stopped');
});
