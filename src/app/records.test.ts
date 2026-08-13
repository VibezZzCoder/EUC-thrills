/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { SafeStorage, STORAGE_PREFIX, type StorageLike } from '../platform/storage.ts';
import { CHALLENGE } from '../data/tuning.ts';
import { GhostRecorder, decodeGhost, encodeGhost, type EncodedGhost } from '../simulation/ghost.ts';
import { MAX_SEED_LENGTH } from '../level/levels.ts';
import {
  DEFAULT_RECORDS,
  RECORDS_KEY,
  RecordsStore,
  coerceRecords,
  isNewRecord,
  type RouteRecord,
} from './records.ts';

/**
 * Records are the one thing in this game a player cannot get back, so almost
 * everything asserted here is about a record *surviving* something: a corrupt
 * neighbour, a hand-edited field, an unreadable ghost, and above all a store
 * that has run out of room.
 *
 * The quota case is not a curiosity. A ghost track is the largest value this
 * game writes, `localStorage` quotas are small and shared across the origin,
 * and no browser warns before refusing. It is exercised here with a store that
 * accepts small writes and rejects large ones, because that is precisely the
 * shape of the real failure — and a store that rejected everything would not
 * catch the bug that matters, which is losing the time along with the ghost.
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

/**
 * A store with a byte budget: the quota failure, modelled honestly.
 *
 * The probe `SafeStorage` writes at construction is two bytes, so this store
 * still reports itself persistent — which is the whole point. A player whose
 * settings save fine and whose ghost does not is the case in the wild.
 */
class BoundedStore implements StorageLike {
  readonly values = new Map<string, string>();
  rejected = 0;

  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (value.length > this.limit) {
      this.rejected += 1;
      throw new Error('QuotaExceededError');
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

/** Safari's private mode: nothing at all may be written. */
class ThrowingStore implements StorageLike {
  getItem(): string | null {
    return null;
  }

  setItem(): void {
    throw new Error('QuotaExceededError');
  }

  removeItem(): void {}
}

/**
 * A real ghost, built through the recorder so it is self-consistent with
 * whatever the encoder expects rather than hand-assembled here.
 *
 * A minute of riding at the recorder's own rate is enough to be far larger than
 * everything else in the record put together, which is what the quota tests
 * below need it for.
 */
function makeGhost(levelId: string, seconds: number): EncodedGhost {
  const recorder = new GhostRecorder();
  const step = 1 / 120;
  const steps = Math.round(seconds / step);
  for (let i = 0; i <= steps; i += 1) {
    const t = i * step;
    recorder.record(t, {
      x: t * 8,
      y: 0.35,
      z: Math.sin(t * 0.4) * 12,
      groundY: 0,
      headingY: t * 0.05,
      rollAngle: Math.sin(t) * 0.2,
      speed: 8,
      crouch: 0.1,
    });
  }
  const track = recorder.finish(levelId, seconds);
  assert.ok(track !== null, 'the fixture needs a recordable track');
  return encodeGhost(track);
}

function record(patch: Partial<RouteRecord> = {}): RouteRecord {
  return {
    levelId: 'slice',
    totalSeconds: 120,
    // Shaped like a real table: index 0 is the start gate at exactly zero and
    // the last split is the finish crossing, which is the total. `coerceSplits`
    // pins both endpoints, so a fixture that ignored them would silently lose
    // its splits on every round-trip below.
    splits: [0, 20, 45, 70, 95, 120],
    // A fixed instant. Nothing in `records.ts` reads a clock, so nothing here
    // needs one either, and the whole suite is reproducible.
    setAt: '2026-08-05T10:15:00.000Z',
    ghost: null,
    ...patch,
  };
}

function storedRecords(store: MemoryStore | BoundedStore): unknown {
  const text = store.values.get(`${STORAGE_PREFIX}${RECORDS_KEY}`);
  return text === undefined ? null : JSON.parse(text);
}

// -- The record rule ---------------------------------------------------------

test('the first run is always a record, and a tie never is', () => {
  assert.equal(isNewRecord(90, null), true, 'nothing to beat');
  assert.equal(isNewRecord(90, 90), false, 'a tie is not a record');
  assert.equal(isNewRecord(90.001, 90), false, 'slower is not a record');
});

test('beating the record by less than the epsilon does not count', () => {
  const epsilon = CHALLENGE.recordEpsilonSeconds;
  assert.equal(isNewRecord(90 - epsilon * 0.5, 90), false);
  assert.equal(isNewRecord(90 - epsilon, 90), false, 'exactly the epsilon is still a tie');
  assert.equal(isNewRecord(90 - epsilon * 2, 90), true);
});

test('a nonsense time is never a record', () => {
  assert.equal(isNewRecord(Number.NaN, null), false);
  assert.equal(isNewRecord(Number.POSITIVE_INFINITY, null), false);
  assert.equal(isNewRecord(0, null), false);
  assert.equal(isNewRecord(-5, null), false);
});

// -- Coercion ----------------------------------------------------------------

test('the default record is empty and immutable', () => {
  assert.equal(Object.keys(DEFAULT_RECORDS.routes).length, 0);
  assert.equal(Object.isFrozen(DEFAULT_RECORDS), true);
  assert.equal(Object.isFrozen(DEFAULT_RECORDS.routes), true);
});

test('a record that is not a record at all degrades to empty', () => {
  for (const raw of [null, undefined, 'corrupt', 7, [1, 2, 3], {}, { routes: 5 }, { routes: null }]) {
    assert.equal(Object.keys(coerceRecords(raw).routes).length, 0, `for ${JSON.stringify(raw)}`);
  }
});

test('a well-formed record survives, and unknown fields are dropped', () => {
  const records = coerceRecords({
    routes: {
      slice: {
        levelId: 'slice',
        totalSeconds: 184.25,
        splits: [0, 30, 61.5, 99, 140, 184.25],
        setAt: '2026-08-05T10:15:00.000Z',
        ghost: null,
        medal: 'gold',
      },
    },
    somethingFromANewerBuild: true,
  });

  const slice = records.routes.slice;
  assert.ok(slice !== undefined);
  assert.equal(slice.totalSeconds, 184.25);
  assert.deepEqual([...slice.splits], [0, 30, 61.5, 99, 140, 184.25]);
  assert.equal(slice.setAt, '2026-08-05T10:15:00.000Z');
  assert.equal('medal' in slice, false, 'unknown fields are dropped');
  assert.equal('somethingFromANewerBuild' in records, false);
});

test('the map key wins over the record\'s own levelId', () => {
  // A hand-edited record must not be able to claim it belongs to a level other
  // than the one everything looks it up by.
  const records = coerceRecords({
    routes: { slice: { levelId: 'proving', totalSeconds: 100 } },
  });
  assert.equal(records.routes.slice?.levelId, 'slice');
});

test('an entry with no usable time is dropped, and its neighbours are not', () => {
  const records = coerceRecords({
    routes: {
      broken: { totalSeconds: 'fast' },
      nan: { totalSeconds: Number.NaN },
      zero: { totalSeconds: 0 },
      negative: { totalSeconds: -12 },
      missing: {},
      notAnObject: 'nope',
      slice: { totalSeconds: 90 },
    },
  });

  assert.deepEqual(Object.keys(records.routes), ['slice']);
  assert.equal(records.routes.slice?.totalSeconds, 90);
});

test('an absurd level key is ignored', () => {
  const records = coerceRecords({
    routes: { ['x'.repeat(500)]: { totalSeconds: 90 }, slice: { totalSeconds: 90 } },
  });
  assert.deepEqual(Object.keys(records.routes), ['slice']);
});

test('a hostile __proto__ key cannot pollute anything', () => {
  // `JSON.parse` makes this a genuine own property, and copying it onto a plain
  // object would invoke the prototype setter instead of storing an entry.
  const records = coerceRecords(JSON.parse('{"routes":{"__proto__":{"totalSeconds":1}}}'));
  assert.equal(Object.getPrototypeOf(records.routes), null);
  assert.equal(({} as Record<string, unknown>).totalSeconds, undefined);

  const store = new RecordsStore(new SafeStorage(new MemoryStore()));
  assert.equal(store.best('constructor'), null, 'inherited members are not records');
  assert.equal(store.best('toString'), null);
});

test('a broken split table is discarded whole, and the time stands', () => {
  const bad = [
    ['not an array', 'splits' as unknown],
    ['a string entry', [0, '20', 120]],
    ['a non-finite entry', [0, Number.NaN, 120]],
    ['a negative entry', [-1, 10, 120]],
    ['out of order', [0, 10, 8, 120]],
    ['past the finish', [0, 10, 30, 121]],
    // The endpoint invariants (M10 QA, F5): index 0 is the start gate at
    // exactly zero, and the last split is the finish crossing — the total.
    ['not starting at the line', [10, 10, 120]],
    ['ending short of the finish', [0, 10, 110]],
    ['only a start gate', [0]],
    ['absurdly long', Array.from({ length: 200 }, (_, i) => i)],
  ] as const;

  for (const [why, splits] of bad) {
    const records = coerceRecords({ routes: { slice: { totalSeconds: 120, splits } } });
    const slice = records.routes.slice;
    assert.ok(slice !== undefined, `the time must survive: ${why}`);
    assert.equal(slice.totalSeconds, 120, why);
    assert.equal(slice.splits.length, 0, `splits are all-or-nothing: ${why}`);
  }

  // A repeated intermediate split is legitimate — two gates crossed in the
  // same hundredth — as long as the table starts at zero and ends on the total.
  const ok = coerceRecords({ routes: { slice: { totalSeconds: 120, splits: [0, 10, 10, 120] } } });
  assert.deepEqual([...(ok.routes.slice?.splits ?? [])], [0, 10, 10, 120]);
});

test('an unusable date becomes empty rather than losing the record', () => {
  for (const setAt of [undefined, 7, 'yesterday', '2026-13-45', 'x'.repeat(200)]) {
    const records = coerceRecords({ routes: { slice: { totalSeconds: 90, setAt } } });
    assert.equal(records.routes.slice?.setAt, '', `for ${String(setAt)}`);
    assert.equal(records.routes.slice?.totalSeconds, 90);
  }

  const offset = coerceRecords({
    routes: { slice: { totalSeconds: 90, setAt: '2026-08-05T10:15:00+02:00' } },
  });
  assert.equal(offset.routes.slice?.setAt, '2026-08-05T10:15:00+02:00');
});

// -- Ghosts ------------------------------------------------------------------

test('a real ghost round-trips through the record', () => {
  const ghost = makeGhost('slice', 6);
  const records = coerceRecords({
    routes: { slice: { totalSeconds: 6, ghost } },
  });

  const stored = records.routes.slice?.ghost;
  assert.ok(stored !== null && stored !== undefined, 'a decodable ghost is kept');
  assert.equal(stored.v, 1);
  assert.equal(stored.level, 'slice');
  assert.equal(stored.n, ghost.n);
  assert.deepEqual([...stored.data], [...ghost.data]);
});

test('a ghost that cannot be decoded never takes the time with it', () => {
  const good = makeGhost('slice', 4);
  const broken: unknown[] = [
    'a ghost',
    null,
    { ...good, v: 2 },
    { ...good, data: 'compressed' },
    { ...good, data: [...good.data.slice(0, 3), null] },
    { ...good, n: -1 },
    { ...good, hz: 0 },
    { ...good, total: Number.NaN },
    // Truncated mid-record, the shape a tab killed during a save leaves behind.
    { ...good, data: good.data.slice(0, Math.max(1, Math.floor(good.data.length / 2)) - 1) },
  ];

  for (const ghost of broken) {
    const records = coerceRecords({ routes: { slice: { totalSeconds: 4, ghost } } });
    const slice = records.routes.slice;
    assert.ok(slice !== undefined, 'the record survives its ghost');
    assert.equal(slice.totalSeconds, 4);
    assert.equal(slice.ghost, null, `unreadable ghosts are dropped: ${JSON.stringify(ghost)?.slice(0, 60)}`);
  }
});

test('a ghost recorded on another level is refused', () => {
  // Otherwise a translucent rider glides through this level's buildings.
  const ghost = makeGhost('proving', 4);
  const records = coerceRecords({ routes: { slice: { totalSeconds: 4, ghost } } });
  assert.equal(records.routes.slice?.totalSeconds, 4);
  assert.equal(records.routes.slice?.ghost, null);
});

// -- The store ---------------------------------------------------------------

test('a submitted record is kept, announced, and reloads', () => {
  const store = new MemoryStore();
  const records = new RecordsStore(new SafeStorage(store));

  const seen: (number | null)[] = [];
  records.onChange((next) => seen.push(next.routes.slice?.totalSeconds ?? null));

  assert.equal(records.best('slice'), null);
  assert.equal(records.submit(record({
    totalSeconds: 184.25,
    splits: [0, 30, 61.5, 99, 140, 184.25],
  })), true);
  assert.equal(records.best('slice')?.totalSeconds, 184.25);
  assert.deepEqual(seen, [184.25]);

  // A fresh store over the same browser store is what a reload looks like.
  const reloaded = new RecordsStore(new SafeStorage(store));
  assert.equal(reloaded.best('slice')?.totalSeconds, 184.25);
  assert.deepEqual([...(reloaded.best('slice')?.splits ?? [])], [0, 30, 61.5, 99, 140, 184.25]);
  assert.equal(reloaded.best('slice')?.setAt, '2026-08-05T10:15:00.000Z');
});

test('only a faster run replaces the record, and a tie leaves it alone', () => {
  const records = new RecordsStore(new SafeStorage(new MemoryStore()));
  assert.equal(records.submit(record({ totalSeconds: 100, setAt: '2026-08-05T10:00:00.000Z' })), true);

  assert.equal(records.submit(record({ totalSeconds: 101 })), false, 'slower');
  assert.equal(records.submit(record({ totalSeconds: 100 })), false, 'a tie');
  assert.equal(
    records.submit(record({ totalSeconds: 100 - CHALLENGE.recordEpsilonSeconds * 0.5 })),
    false,
    'inside the epsilon',
  );
  assert.equal(
    records.best('slice')?.setAt,
    '2026-08-05T10:00:00.000Z',
    'a rejected run must not overwrite anything, not even the date',
  );

  assert.equal(records.submit(record({ totalSeconds: 98, setAt: '2026-08-05T11:00:00.000Z' })), true);
  assert.equal(records.best('slice')?.totalSeconds, 98);
  assert.equal(records.best('slice')?.setAt, '2026-08-05T11:00:00.000Z');
});

test('a rejected run keeps the old ghost, not merely the old time', () => {
  const records = new RecordsStore(new SafeStorage(new MemoryStore()));
  const first = makeGhost('slice', 4);
  records.submit(record({ totalSeconds: 100, ghost: first }));

  records.submit(record({ totalSeconds: 100, ghost: makeGhost('slice', 5) }));
  assert.deepEqual(
    [...(records.best('slice')?.ghost?.data ?? [])],
    [...first.data],
    'the replay the player races is the run they remember',
  );
});

test('an unusable submission is refused rather than stored', () => {
  const records = new RecordsStore(new SafeStorage(new MemoryStore()));

  assert.equal(records.submit(record({ levelId: '' })), false);
  assert.equal(records.submit(record({ levelId: 'x'.repeat(500) })), false);
  assert.equal(records.submit(record({ totalSeconds: Number.NaN })), false);
  assert.equal(records.submit(record({ totalSeconds: 0 })), false);
  assert.equal(Object.keys(records.current.routes).length, 0);

  // A NaN best would make every later comparison false and quietly end the
  // player's ability to set a record at all.
  assert.equal(records.submit(record({ totalSeconds: 90 })), true);
  assert.equal(records.submit(record({ totalSeconds: 80 })), true);
});

test('records for different levels do not disturb each other', () => {
  const records = new RecordsStore(new SafeStorage(new MemoryStore()));
  records.submit(record({ levelId: 'slice', totalSeconds: 180, splits: [0, 90, 180] }));
  records.submit(record({ levelId: 'proving', totalSeconds: 40, splits: [] }));

  assert.equal(records.best('slice')?.totalSeconds, 180);
  assert.equal(records.best('proving')?.totalSeconds, 40);

  records.clearLevel('slice');
  assert.equal(records.best('slice'), null);
  assert.equal(records.best('proving')?.totalSeconds, 40);
});

test('clearing empties the record and frees the key', () => {
  const store = new MemoryStore();
  const records = new RecordsStore(new SafeStorage(store));
  records.submit(record({ totalSeconds: 90 }));

  let announced = 0;
  records.onChange(() => { announced += 1; });

  records.clearLevel('missing');
  assert.equal(announced, 0, 'clearing a level with no record announces nothing');

  records.clearAll();
  assert.equal(announced, 1);
  assert.equal(records.best('slice'), null);
  // Clearing is what a player reaches for when the store is full, so it must
  // give space back rather than leave an empty record behind.
  assert.equal(store.values.has(`${STORAGE_PREFIX}${RECORDS_KEY}`), false);

  records.clearAll();
  assert.equal(announced, 1, 'clearing an empty record is a no-op');

  // And the emptiness survives a reload rather than the old record coming back.
  assert.equal(new RecordsStore(new SafeStorage(store)).best('slice'), null);
});

test('listeners can be removed, and dispose removes all of them', () => {
  const records = new RecordsStore(new SafeStorage(new MemoryStore()));
  let a = 0;
  let b = 0;
  const off = records.onChange(() => { a += 1; });
  records.onChange(() => { b += 1; });

  records.submit(record({ totalSeconds: 100 }));
  off();
  records.submit(record({ totalSeconds: 90 }));
  records.dispose();
  records.submit(record({ totalSeconds: 80 }));

  assert.equal(a, 1);
  assert.equal(b, 2);
});

test('a corrupt saved record does not stop the game starting', () => {
  const store = new MemoryStore();
  store.setItem(`${STORAGE_PREFIX}${RECORDS_KEY}`, '{"routes":{"slice":');
  const records = new RecordsStore(new SafeStorage(store));

  assert.equal(records.best('slice'), null);
  assert.equal(records.submit(record({ totalSeconds: 90 })), true);
  assert.equal(records.best('slice')?.totalSeconds, 90);
});

// -- The quota path ----------------------------------------------------------

test('a ghost too large to store loses the ghost, never the time', () => {
  const ghost = makeGhost('slice', 60);
  const full = JSON.stringify({ routes: { slice: { ...record(), ghost } } });
  // Room for the record, not for the ghost. This is the real shape of the
  // failure: the store is not broken, the value is simply too big.
  const store = new BoundedStore(Math.floor(full.length / 4));
  const storage = new SafeStorage(store);
  assert.equal(storage.persistent, true, 'a quota-limited store still saves small values');

  const records = new RecordsStore(storage);
  const announced: (EncodedGhost | null)[] = [];
  records.onChange((next) => announced.push(next.routes.slice?.ghost ?? null));

  assert.equal(records.submit(record({ ghost })), true);
  assert.equal(store.rejected, 1, 'exactly one oversized write was attempted');

  assert.equal(records.best('slice')?.totalSeconds, 120, 'the time is still the record');
  assert.equal(records.best('slice')?.ghost, null, 'the ghost was shed to make room');
  assert.deepEqual([...(records.best('slice')?.splits ?? [])], [0, 20, 45, 70, 95, 120]);
  assert.deepEqual(announced, [null], 'listeners are told the truth, after the retry settled');
  assert.equal(records.persistent, true, 'the lean retry landed, so nothing is memory-only');

  // And the time is genuinely on disk, not merely in memory.
  const saved = storedRecords(store) as { routes: { slice: RouteRecord } } | null;
  assert.ok(saved !== null);
  assert.equal(saved.routes.slice.totalSeconds, 120);
  assert.equal(saved.routes.slice.ghost, null);

  const reloaded = new RecordsStore(new SafeStorage(store));
  assert.equal(reloaded.best('slice')?.totalSeconds, 120);
  assert.equal(reloaded.best('slice')?.ghost, null);
});

test('quota evicts the oldest ghost and never its personal best', () => {
  const ids = ['generated-route-a', 'generated-route-b', 'generated-route-c'] as const;
  const times = [120, 110, 100] as const;
  const dates = [
    '2026-08-05T10:00:00.000Z',
    '2026-08-05T11:00:00.000Z',
    '2026-08-05T12:00:00.000Z',
  ] as const;
  const candidates = ids.map((levelId, index) => record({
    levelId,
    totalSeconds: times[index],
    splits: [0, times[index]],
    setAt: dates[index],
    ghost: makeGhost(levelId, 4),
  }));

  // Exactly enough room for three times and the two newest ghosts. The first
  // two submissions fit; the third has to recycle one replay to land.
  const expected = {
    routes: {
      [ids[0]]: { ...candidates[0], ghost: null },
      [ids[1]]: candidates[1],
      [ids[2]]: candidates[2],
    },
  };
  const store = new BoundedStore(JSON.stringify(expected).length);
  const records = new RecordsStore(new SafeStorage(store));
  for (const candidate of candidates) assert.equal(records.submit(candidate), true);

  assert.equal(store.rejected, 1, 'only the full three-ghost write should exceed quota');
  assert.equal(records.best(ids[0])?.totalSeconds, times[0]);
  assert.equal(records.best(ids[0])?.ghost, null, 'the oldest replay was recycled');
  assert.ok(records.best(ids[1])?.ghost !== null, 'the newer replay survives');
  assert.ok(records.best(ids[2])?.ghost !== null, 'the new replay survives');
  assert.equal(records.persistent, true);

  const reloaded = new RecordsStore(new SafeStorage(store));
  for (const [index, levelId] of ids.entries()) {
    assert.equal(reloaded.best(levelId)?.totalSeconds, times[index], `${levelId} lost its time`);
  }
  assert.equal(reloaded.best(ids[0])?.ghost, null);
  assert.ok(reloaded.best(ids[1])?.ghost !== null);
  assert.ok(reloaded.best(ids[2])?.ghost !== null);
});

test('a record that fails even the lean retry demotes persistence honestly', () => {
  // The boot probe is two bytes and passes; every real record write exceeds
  // the budget, so both the full write and the ghost-shedding retry fail. The
  // newest best then exists only in memory, and `persistent` must say so even
  // though the storage layer's general capability looks fine (M10 QA, F7).
  const store = new BoundedStore(4);
  const storage = new SafeStorage(store);
  assert.equal(storage.persistent, true, 'the boot probe passed');

  const records = new RecordsStore(storage);
  assert.equal(records.persistent, true, 'nothing has failed yet');
  assert.equal(records.submit(record({ ghost: makeGhost('slice', 4) })), true);
  assert.equal(records.best('slice')?.totalSeconds, 120, 'the session keeps the run');
  assert.equal(records.persistent, false, 'the newest record is memory-only');

  // A store that recovers — room freed by the player clearing site data
  // elsewhere — promotes the answer back on the next successful write.
  const roomy = new RecordsStore(new SafeStorage(new MemoryStore()));
  assert.equal(roomy.submit(record({ totalSeconds: 90 })), true);
  assert.equal(roomy.persistent, true);
});

test('a store that silently discards a later record write is reported', () => {
  // The probe passes at boot; a privacy extension then starts accepting
  // writes and keeping nothing. Nothing throws — only the write's own
  // read-back can see it (M10 QA, F7).
  const store = new MemoryStore();
  const storage = new SafeStorage(store);
  const records = new RecordsStore(storage);

  store.setItem = () => {};

  assert.equal(records.submit(record({ totalSeconds: 90 })), true);
  assert.equal(records.best('slice')?.totalSeconds, 90, 'the session keeps the run');
  assert.equal(records.persistent, false, 'a discarding store is not persistent');
});

test('a store that refuses everything still keeps the run for this session', () => {
  const storage = new SafeStorage(new ThrowingStore());
  const records = new RecordsStore(storage);
  const ghost = makeGhost('slice', 4);

  assert.equal(records.persistent, false, 'the UI has something honest to say');
  assert.equal(records.submit(record({ totalSeconds: 120, ghost })), true);
  assert.equal(records.best('slice')?.totalSeconds, 120);
  // Shedding the ghost bought nothing here, so it stays and the player can
  // still race it for the rest of the session.
  assert.ok(records.best('slice')?.ghost !== null);

  // A second, faster run still behaves like a record.
  assert.equal(records.submit(record({ totalSeconds: 110 })), true);
  assert.equal(records.best('slice')?.totalSeconds, 110);
});

test('a store that starts refusing mid-session does not lose the earlier record', () => {
  const store = new MemoryStore();
  const records = new RecordsStore(new SafeStorage(store));
  records.submit(record({ totalSeconds: 120 }));

  store.setItem = () => {
    throw new Error('QuotaExceededError');
  };

  assert.equal(records.submit(record({ totalSeconds: 100 })), true);
  assert.equal(records.best('slice')?.totalSeconds, 100, 'the session has the new best');
  // The previous record is what is still on disk, which is the correct outcome:
  // a write that failed must not delete what a write that succeeded put there.
  const saved = storedRecords(store) as { routes: { slice: RouteRecord } } | null;
  assert.equal(saved?.routes.slice.totalSeconds, 120);
});

test('the record rule agrees with the one the results screen is built from', async () => {
  // **The cross-layer test, and the reason it lives in this file.**
  //
  // `simulation/challenge.ts` computes `ChallengeResult.beatRecord` and this
  // module computes `isNewRecord`, and they cannot share code: the layer seal
  // in `src/architecture.test.ts` forbids `simulation/` from importing `app/`.
  // Written independently, they disagreed at exactly one input — an
  // improvement of precisely `recordEpsilonSeconds`, where the run was
  // celebrated as a record and then not kept. The player would have seen "New
  // record" and found their old best still there next session.
  //
  // Duplicated logic across a deliberate boundary needs a test that can see
  // both sides. This file can import both, so this is where it goes: it sweeps
  // the interesting neighbourhood of the epsilon and demands the two answers
  // are identical at every point, so a future edit to either predicate fails
  // here rather than in front of somebody who just set a personal best.
  const { ChallengeRun } = await import('../simulation/challenge.ts');
  const { CHALLENGE: tuning } = await import('../data/tuning.ts');

  const STEP = 1 / 120;
  /** Two gates on a straight course along +Z, at the real tuned dimensions. */
  const checkpoints = [0, 240].map((z, index) => ({
    id: `cp-${index}`,
    centre: { x: 0, y: tuning.gateHalfHeight, z },
    halfExtents: { x: 6, y: tuning.gateHalfHeight, z: tuning.gateHalfDepth },
    headingY: 0,
    routeIndex: index,
    kind: index === 0 ? ('start' as const) : ('finish' as const),
    label: index === 0 ? 'Start' : 'Finish',
  }));

  /** Roll a point from the start gate to past the finish. Returns the lap time. */
  const driveThrough = (run: InstanceType<typeof ChallengeRun>): number => {
    run.arm();
    for (let z = -2; z < 244; z += 10 * STEP) {
      run.step(STEP, { x: 0, y: 0, z, speed: 10, landed: false, landingClean: false, crashed: false });
    }
    return run.result()?.totalSeconds ?? Number.NaN;
  };

  const epsilon = CHALLENGE.recordEpsilonSeconds;
  const lap = driveThrough(new ChallengeRun('slice', checkpoints));
  assert.ok(Number.isFinite(lap), 'the reference lap finished');

  for (const improvement of [
    -epsilon, -epsilon / 2, 0, epsilon / 2, epsilon, epsilon * 1.5, epsilon * 2, 5,
  ]) {
    const previousBest = lap + improvement;
    // Both answers come from the real code paths rather than from a restated
    // formula, which is the only version of this test worth having.
    const compared = new ChallengeRun('slice', checkpoints);
    compared.setReference({ totalSeconds: previousBest, splits: [] });
    const total = driveThrough(compared);
    const result = compared.result();
    assert.ok(result, 'the compared run finished');

    assert.equal(
      result.beatRecord,
      isNewRecord(total, previousBest),
      `the two layers disagree at an improvement of ${improvement}s`,
    );
  }
});

test('the store never asks what time it is', async () => {
  // `new Date()` here would make every record test depend on when it ran, and
  // would put wall time inside a milestone whose whole point is a deterministic
  // clock. Cheaper to assert than to rediscover.
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./records.ts', import.meta.url), 'utf8');
  const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.equal(/new Date\b|Date\.now\b|performance\.now\b/.test(code), false);
});

// ---------------------------------------------------------------------------
// A seed is a level id — M12 Phase 4
// ---------------------------------------------------------------------------

/**
 * The longest level id a seed can produce, spelled the way the game spells it.
 *
 * `generateRoute.ts` builds `generated-r3-<seed>`; the thirteen characters of
 * prefix are part of the constraint and are written out rather than imported,
 * because the failure these tests exist to catch is precisely somebody changing
 * one half of it without the other. M13 Phase 3 lengthened the prefix by three
 * when it put a content revision in the name, which is exactly the change this
 * spelling is here to make visible rather than silent.
 *
 * **This is where the seed length cap comes from.** `MAX_SEED_LENGTH` is not a
 * design preference — it is derived from `MAX_LEVEL_ID_LENGTH` above, and the
 * two caps that enforce it live in this file and in `simulation/ghost.ts`,
 * which may not import each other. A seed long enough to breach either one
 * produces a personal best that is silently never saved, or a ghost that
 * encodes and then refuses to decode.
 */
const LONGEST_LEVEL_ID = `generated-r3-${'w'.repeat(MAX_SEED_LENGTH)}`;

test('the longest seed a player can type still saves a personal best', () => {
  const records = new RecordsStore(new SafeStorage(null));
  const candidate: RouteRecord = {
    levelId: LONGEST_LEVEL_ID,
    totalSeconds: 92.5,
    splits: [0, 40, 92.5],
    setAt: '2026-08-08T10:15:00.000Z',
    ghost: null,
  };
  assert.equal(records.submit(candidate), true, `${LONGEST_LEVEL_ID.length} characters was refused`);
  assert.equal(records.best(LONGEST_LEVEL_ID)?.totalSeconds, 92.5);
});

test('the longest seed a player can type still keeps its ghost', () => {
  const recorder = new GhostRecorder();
  for (let step = 0; step < 40; step += 1) {
    recorder.record(step * 0.05, {
      x: step, y: 0, z: step * 0.5, groundY: 0, headingY: 0, rollAngle: 0, speed: 8, crouch: 0,
    });
  }
  const track = recorder.finish(LONGEST_LEVEL_ID, 2);
  assert.ok(track !== null);
  const encoded = encodeGhost(track);
  assert.ok(decodeGhost(encoded) !== null, 'the ghost encoded but would not decode');

  const stored = coerceRecords({
    routes: {
      [LONGEST_LEVEL_ID]: {
        levelId: LONGEST_LEVEL_ID,
        totalSeconds: 2,
        splits: [0, 2],
        setAt: '2026-08-08T10:15:00.000Z',
        ghost: encoded,
      },
    },
  });
  assert.ok(stored.routes[LONGEST_LEVEL_ID]?.ghost != null, 'the store dropped the ghost');
});

test('two seeds are two sets of records, and neither can race the other', () => {
  // **This is the whole of "personal bests and ghosts keyed by seed", and it
  // needed no new schema.** A generated plan's id already carries its seed
  // (`generated-<seed>`), `Game` already files a best under `levelPlan.id`, and
  // `coerceGhost` already refuses a ghost whose own level does not match the
  // key. The keying has therefore held since Phase 2 — by construction, not
  // because anybody arranged it. Asserted here because a property nobody built
  // is a property nobody is watching.
  const records = new RecordsStore(new SafeStorage(null));
  const ghostFor = (levelId: string): EncodedGhost => {
    const recorder = new GhostRecorder();
    for (let step = 0; step < 20; step += 1) {
      recorder.record(step * 0.05, {
        x: step, y: 0, z: 0, groundY: 0, headingY: 0, rollAngle: 0, speed: 6, crouch: 0,
      });
    }
    const track = recorder.finish(levelId, 1);
    assert.ok(track !== null);
    return encodeGhost(track);
  };

  const first = 'generated-ember-quay';
  const second = 'generated-slate-ridge';
  records.submit({
    levelId: first, totalSeconds: 60, splits: [0, 60],
    setAt: '2026-08-08T10:00:00.000Z', ghost: ghostFor(first),
  });
  records.submit({
    levelId: second, totalSeconds: 90, splits: [0, 90],
    setAt: '2026-08-08T10:05:00.000Z', ghost: ghostFor(second),
  });

  assert.equal(records.best(first)?.totalSeconds, 60);
  assert.equal(records.best(second)?.totalSeconds, 90);
  assert.equal(records.best(second)?.ghost?.level, second);
  // A slower time on a different seed is not a failed attempt at the first
  // seed's record, and does not replace it.
  assert.equal(records.best(first)?.ghost?.level, first);

  // And a ghost recorded on one seed cannot be filed under another: a
  // translucent rider gliding through a different route's buildings is a bug
  // report, not a race.
  const smuggled = coerceRecords({
    routes: {
      [second]: {
        levelId: second, totalSeconds: 90, splits: [0, 90], setAt: '', ghost: ghostFor(first),
      },
    },
  });
  assert.equal(smuggled.routes[second]?.ghost, null);
});
