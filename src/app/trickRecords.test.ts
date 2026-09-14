/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SafeStorage, type StorageLike } from '../platform/storage.ts';
import { SHIPPED_TRICK_RULES, trickRulesRevision } from '../simulation/trickRun.ts';
import { CHASE_RECORDS_KEY } from './chaseRecords.ts';
import { KNOCKABOUT_RECORDS_KEY } from './knockaboutRecords.ts';
import { RECORDS_KEY } from './records.ts';
import {
  TRICK_RECORDS_KEY,
  TrickRecordsStore,
  coerceTrickRecords,
  type TrickRecord,
} from './trickRecords.ts';

/**
 * The Trick Run's personal bests — M38, §38.5.
 *
 * Three claims are worth testing and none of them is "it saves a number".
 * First, that higher wins and a tie is not a record, with nothing breaking a
 * tie. Second, that a best set under other rules or another duration is not
 * offered as a comparison and does not block a new one — record validity,
 * stated once here so the composition root never has to restate it. Third,
 * that this is a *separate* key namespace, so a score can never be read as a
 * lap time by a store whose ordering runs the other way.
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

/** The real revision string, to prove the store treats it as opaque text. */
const REVISION = trickRulesRevision(SHIPPED_TRICK_RULES);
const DURATION = SHIPPED_TRICK_RULES.durationSteps;
const LEVEL = 'switchback-r3';

function record(over: Partial<TrickRecord> = {}): TrickRecord {
  return {
    levelId: LEVEL,
    score: 120,
    durationSteps: DURATION,
    rulesRevision: REVISION,
    setAt: '2026-09-13T00:00:00.000Z',
    ...over,
  };
}

test('the revision the referee produces is an ordinary bounded string here', () => {
  assert.ok(REVISION.startsWith('m38'), REVISION);
  assert.ok(REVISION.length > 0 && REVISION.length <= 96, `revision length ${REVISION.length}`);
  assert.ok(Number.isSafeInteger(DURATION) && DURATION > 0);
});

test('a first completed run is always a record', () => {
  const store = new TrickRecordsStore(fakeStorage());
  assert.equal(store.submit(record()), true);
  assert.equal(store.best(LEVEL)?.score, 120);
  assert.equal(store.comparableBest(LEVEL, DURATION, REVISION)?.score, 120);
});

test('a higher score replaces, a tie keeps the old row, and lower loses', () => {
  const store = new TrickRecordsStore(fakeStorage());
  store.submit(record({ score: 120, setAt: '2026-09-13T00:00:00.000Z' }));

  assert.equal(store.submit(record({ score: 119 })), false, 'a worse run was called a record');
  assert.equal(store.submit(record({ score: 120 })), false, 'a tie was called a record');
  assert.equal(
    store.best(LEVEL)?.setAt,
    '2026-09-13T00:00:00.000Z',
    'a tie overwrote the row it did not beat',
  );
  assert.equal(store.submit(record({ score: 121 })), true);
  assert.equal(store.best(LEVEL)?.score, 121);
});

test('nothing breaks a tie — there is no field a tie-break could read', () => {
  // §38.5: no time, crash-count or trick-count tie-break. The record carries no
  // such field at all, which is the strongest form of that promise, so the only
  // thing left to assert is that a same-score run never wins.
  const store = new TrickRecordsStore(fakeStorage());
  store.submit(record({ score: 80 }));
  assert.equal(store.submit(record({ score: 80, setAt: '2026-09-14T00:00:00.000Z' })), false);
  assert.deepEqual(Object.keys(record()).sort(), [
    'durationSteps', 'levelId', 'rulesRevision', 'score', 'setAt',
  ]);
});

test('a best under other rules is not a comparison, and a new run replaces it', () => {
  // Record validity rather than migration: the old number is about a different
  // game, so it is neither shown beside this run nor allowed to block it — even
  // when it is the larger number.
  const store = new TrickRecordsStore(fakeStorage());
  store.submit(record({ score: 9_000, rulesRevision: 'm38/old-and-generous' }));

  assert.equal(store.comparableBest(LEVEL, DURATION, REVISION), null, 'unlike rules were compared');
  assert.equal(store.best(LEVEL)?.score, 9_000, 'the row is still there, just not comparable');

  assert.equal(store.submit(record({ score: 12 })), true, 'a live run could not displace it');
  assert.equal(store.best(LEVEL)?.score, 12);
  assert.equal(store.comparableBest(LEVEL, DURATION, REVISION)?.score, 12);
});

test('a best over another duration is not a comparison either', () => {
  const store = new TrickRecordsStore(fakeStorage());
  store.submit(record({ score: 5_000, durationSteps: DURATION * 3 }));

  assert.equal(store.comparableBest(LEVEL, DURATION, REVISION), null);
  assert.equal(store.comparableBest(LEVEL, DURATION * 3, REVISION)?.score, 5_000);
  assert.equal(store.submit(record({ score: 30 })), true);
  assert.equal(store.best(LEVEL)?.durationSteps, DURATION);
});

test('each venue keeps its own record, and an unknown one has none', () => {
  const store = new TrickRecordsStore(fakeStorage());
  store.submit(record({ levelId: 'switchback-r3', score: 100 }));
  store.submit(record({ levelId: 'generated-r3-copper-gate', score: 7 }));
  assert.equal(store.best('switchback-r3')?.score, 100);
  assert.equal(store.best('generated-r3-copper-gate')?.score, 7);
  assert.equal(store.best('generated-r3-nowhere'), null);
  assert.equal(store.comparableBest('generated-r3-nowhere', DURATION, REVISION), null);
});

test('a valid unrelated venue row survives a neighbour being dropped', () => {
  const coerced = coerceTrickRecords({
    routes: {
      good: record(),
      fractional: record({ score: 12.5 }),
    },
  });
  assert.notEqual(coerced, null);
  assert.deepEqual(Object.keys(coerced!.routes), ['good']);
});

test('a hand-edited store is dropped row by row rather than trusted', () => {
  const bad: Record<string, unknown> = {
    fractional: record({ score: 12.5 }),
    negative: record({ score: -1 }),
    notANumber: { ...record(), score: Number.NaN },
    infinite: { ...record(), score: Number.POSITIVE_INFINITY },
    unsafe: { ...record(), score: Number.MAX_SAFE_INTEGER + 2 },
    numericString: { ...record(), score: '120' },
    zeroDuration: record({ durationSteps: 0 }),
    negativeDuration: record({ durationSteps: -3_600 }),
    fractionalDuration: record({ durationSteps: 12.5 }),
    noRevision: { levelId: LEVEL, score: 1, durationSteps: DURATION, setAt: record().setAt },
    emptyRevision: record({ rulesRevision: '' }),
    hugeRevision: record({ rulesRevision: 'm38/'.padEnd(200, 'x') }),
    noScore: { levelId: LEVEL, durationSteps: DURATION, rulesRevision: REVISION, setAt: '2026' },
    noSetAt: { levelId: LEVEL, score: 1, durationSteps: DURATION, rulesRevision: REVISION },
    emptySetAt: record({ setAt: '' }),
    hugeSetAt: record({ setAt: 'x'.repeat(41) }),
    notAnObject: 'a record',
    nullRow: null,
    anArray: [1, 2, 3],
  };
  for (const [name, row] of Object.entries(bad)) {
    const coerced = coerceTrickRecords({ routes: { [LEVEL]: row } });
    assert.notEqual(coerced, null, name);
    assert.deepEqual(Object.keys(coerced!.routes), [], name);
  }

  assert.deepEqual(
    Object.keys(coerceTrickRecords({ routes: { ['x'.repeat(65)]: record() } })!.routes),
    [],
    'a level id past the sixty-four-character cap is dropped',
  );
});

test('rubbish in place of a record store is rejected whole', () => {
  assert.equal(coerceTrickRecords(null), null);
  assert.equal(coerceTrickRecords(42), null);
  assert.equal(coerceTrickRecords('tricks'), null);
  assert.equal(coerceTrickRecords({}), null);
  assert.equal(coerceTrickRecords({ routes: 'none' }), null);
  assert.equal(coerceTrickRecords({ routes: null }), null);
});

test('corrupt JSON in the slot leaves an empty store rather than a dead boot', () => {
  const raw = memoryStorage();
  raw.setItem(`euc-thrills.v1.${TRICK_RECORDS_KEY}`, '{"routes":{"switchback-r3":');
  const store = new TrickRecordsStore(new SafeStorage(raw));
  assert.equal(store.best(LEVEL), null);
  assert.equal(store.submit(record()), true, 'the store refused to work after a corrupt read');
});

test('a hostile key cannot pollute anything', () => {
  // `JSON.parse` makes `__proto__` a genuine own property, and copying it onto
  // a plain object would invoke the prototype setter instead of storing an
  // entry — replacing the map's prototype and losing the row silently.
  // Built as text rather than as an object literal on purpose: `__proto__:` in
  // a literal sets the prototype, so the hostile key would never survive to be
  // written. Only `JSON.parse` makes it an own property.
  const row = JSON.stringify(record());
  const text = `{"routes":{"__proto__":${row},"constructor":${row},"${LEVEL}":${row}}}`;
  const coerced = coerceTrickRecords(JSON.parse(text));
  assert.notEqual(coerced, null);
  assert.equal(Object.getPrototypeOf(coerced!.routes), null);
  assert.deepEqual(Object.keys(coerced!.routes), [LEVEL]);
  assert.equal(({} as Record<string, unknown>).score, undefined);

  const store = new TrickRecordsStore(fakeStorage());
  assert.equal(store.best('constructor'), null, 'an inherited member was read as a record');
  assert.equal(store.best('toString'), null);
  assert.equal(store.submit(record({ levelId: '__proto__' })), false);

  store.submit(record());
  assert.equal(Object.getPrototypeOf(store.current.routes), null, 'submit rebuilt a plain map');
});

test('a best survives a reload', () => {
  const storage = new SafeStorage(memoryStorage());
  new TrickRecordsStore(storage).submit(record({ score: 240 }));
  assert.equal(new TrickRecordsStore(storage).best(LEVEL)?.score, 240);
});

test('a browser that cannot save still keeps the session’s best, and says so', () => {
  // §38.5: an in-memory best is usable this session and must not be presented
  // as saved for the next visit.
  const store = new TrickRecordsStore(fakeStorage(false));
  assert.equal(store.persistent, false);
  assert.equal(store.submit(record({ score: 50 })), true);
  assert.equal(store.best(LEVEL)?.score, 50);
  assert.equal(store.comparableBest(LEVEL, DURATION, REVISION)?.score, 50);
  assert.equal(store.persistent, false);
});

test('clearing forgets every venue and announces it', () => {
  const store = new TrickRecordsStore(fakeStorage());
  store.submit(record({ levelId: 'switchback-r3' }));
  store.submit(record({ levelId: 'generated-r3-beta' }));
  let heard = 0;
  store.onChange(() => {
    heard += 1;
  });
  store.clearAll();
  assert.equal(heard, 1);
  assert.deepEqual(Object.keys(store.current.routes), []);
  assert.equal(store.best('switchback-r3'), null);
  assert.equal(store.best('generated-r3-beta'), null);
});

test('a listener hears a new best and a stopped listener is stopped', () => {
  const store = new TrickRecordsStore(fakeStorage());
  const seen: number[] = [];
  const stop = store.onChange((current) => seen.push(Object.keys(current.routes).length));
  store.submit(record({ score: 10 }));
  store.submit(record({ score: 5 }));
  store.clearAll();
  stop();
  store.submit(record({ score: 99 }));
  assert.deepEqual(seen, [1, 0], 'a refused run announced, or a stopped listener still heard');
});

test('it does not share a slot with any other mode’s records', () => {
  // The failure this whole file exists to prevent: `records.ts` is ordered by
  // *lower* seconds, so a score of 42 filed there would read as a forty-two
  // second lap, beat every real lap on the venue and evict its ghost.
  const keys = [TRICK_RECORDS_KEY, RECORDS_KEY, CHASE_RECORDS_KEY, KNOCKABOUT_RECORDS_KEY];
  assert.equal(new Set(keys).size, keys.length, `two stores share a namespace: ${keys.join()}`);
  assert.notEqual(TRICK_RECORDS_KEY, RECORDS_KEY);

  const storage = fakeStorage();
  new TrickRecordsStore(storage).submit(record());
  assert.notEqual(storage.readJson(TRICK_RECORDS_KEY, coerceTrickRecords), null);
  for (const key of [RECORDS_KEY, CHASE_RECORDS_KEY, KNOCKABOUT_RECORDS_KEY]) {
    assert.equal(storage.readJson(key, (raw) => raw), null, `it wrote into the ${key} slot`);
  }
});
