/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { driveSteps, PREPARATION_SLICE, runSteps, type PreparationSlice, type Steps } from './preparationSteps.ts';

function* counted(log: string[], slices = 3): Steps<number> {
  try {
    for (let index = 0; index < slices; index += 1) {
      log.push(`work-${index}`);
      yield PREPARATION_SLICE;
    }
    log.push('done');
    return 42;
  } finally { log.push('finally'); }
}

test('runSteps drains a step generator to its value, running every statement once in order', () => {
  const log: string[] = [];
  assert.equal(runSteps(counted(log)), 42);
  assert.deepEqual(log, ['work-0', 'work-1', 'work-2', 'done', 'finally']);
  assert.equal(runSteps((function* (): Steps<string> { return 'no slices'; })()), 'no slices');
});

test('driveSteps asks the slice hook once per slice and awaits only the promises it returns', async () => {
  const log: string[] = [];
  let asked = 0, waited = 0;
  const value = await driveSteps(counted(log, 4), {
    slice: () => {
      asked += 1;
      log.push(`slice-${asked}`);
      return asked % 2 === 0 ? Promise.resolve().then(() => { waited += 1; }) : null;
    },
  });
  assert.equal(value, 42);
  assert.equal(asked, 4);
  assert.equal(waited, 2);
  assert.deepEqual(log, ['work-0', 'slice-1', 'work-1', 'slice-2', 'work-2', 'slice-3', 'work-3', 'slice-4', 'done', 'finally']);
});

test('labels reach only the stage hook; a label without one is refused and the generator is closed', async () => {
  function* staged(log: string[]): Generator<PreparationSlice | string, string, void> {
    try {
      yield 'first stage';
      log.push('a');
      yield PREPARATION_SLICE;
      yield 'second stage';
      log.push('b');
      return 'built';
    } finally { log.push('finally'); }
  }
  const log: string[] = [], stages: string[] = [];
  let slices = 0;
  const built = await driveSteps(staged(log), {
    slice: () => { slices += 1; return null; },
    stage: async (label) => { stages.push(label); },
  });
  assert.equal(built, 'built');
  assert.deepEqual(stages, ['first stage', 'second stage'], 'a slice is never a stage');
  assert.equal(slices, 1);

  const refused: string[] = [];
  await assert.rejects(driveSteps(staged(refused) as Generator<PreparationSlice, string, void>, { slice: () => null }),
    /stage label where only slices are allowed/);
  assert.deepEqual(refused, ['finally'], 'the refused generator was closed');
});

test('a rejected hook closes the suspended generator so its finally runs (abandonment)', async () => {
  const log: string[] = [];
  let asked = 0;
  await assert.rejects(driveSteps(counted(log, 5), {
    slice: () => (++asked === 2 ? Promise.reject(new Error('boot cancelled')) : null),
  }), /boot cancelled/);
  assert.deepEqual(log, ['work-0', 'work-1', 'finally'], 'no further work, but the scope closed');

  function* stagedScope(events: string[]): Generator<PreparationSlice | string, void, void> {
    try { yield 'stage'; events.push('after'); } finally { events.push('closed'); }
  }
  const events: string[] = [];
  await assert.rejects(driveSteps(stagedScope(events), { slice: () => null,
    stage: async () => { throw new Error('stage failed'); } }), /stage failed/);
  assert.deepEqual(events, ['closed']);
});

test("the generator's own failure propagates unchanged through both drains", async () => {
  const failure = new Error('builder failed');
  function* failing(log: string[]): Steps<number> {
    try { yield PREPARATION_SLICE; throw failure; } finally { log.push('finally'); }
  }
  const sync: string[] = [];
  assert.throws(() => runSteps(failing(sync)), (error) => error === failure);
  assert.deepEqual(sync, ['finally']);
  const driven: string[] = [];
  await assert.rejects(driveSteps(failing(driven), { slice: () => null }), (error) => error === failure);
  assert.deepEqual(driven, ['finally']);
});

test('the slice token carries no label and is a unique symbol', () => {
  assert.equal(typeof PREPARATION_SLICE, 'symbol');
  assert.notEqual(PREPARATION_SLICE, Symbol('preparation slice'));
});
