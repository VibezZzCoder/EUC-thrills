/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LOADING, TUNING } from '../data/tuning.ts';
import { createBootSlicer, yieldToBrowser } from './bootSlicer.ts';

test('the slicer yields only once its budget of uninterrupted work has run', async () => {
  let clock = 1000, paused = 0;
  const slicer = createBootSlicer(40, () => clock, () => { paused += 1; return Promise.resolve(); });
  assert.equal(slicer.slice(), null, 'no work yet');
  clock += 39.9;
  assert.equal(slicer.slice(), null, 'under budget');
  clock += 0.1;
  const pause = slicer.slice();
  assert.ok(pause instanceof Promise, 'at the budget it yields');
  assert.equal(slicer.yields, 1);
  assert.equal(paused, 1);
  clock += 5; // the browser ran for a while
  await pause;
  assert.equal(slicer.slice(), null, 'the budget restarts when the pause resolves');
  clock += 41;
  assert.ok(slicer.slice() instanceof Promise);
  assert.equal(slicer.yields, 2);
});

test('restart() starts a fresh budget after a loading stage', () => {
  let clock = 0;
  const slicer = createBootSlicer(40, () => clock, () => Promise.resolve());
  clock = 100;
  slicer.restart();
  assert.equal(slicer.slice(), null);
  clock = 139;
  assert.equal(slicer.slice(), null);
  assert.equal(slicer.yields, 0);
  assert.throws(() => createBootSlicer(-1), RangeError);
});

test('yieldToBrowser resolves on a later macrotask', async () => {
  let microtaskRan = false;
  queueMicrotask(() => { microtaskRan = true; });
  await yieldToBrowser();
  assert.equal(microtaskRan, true);
});

test('the LOADING group is scheduling-only tuning and part of the frozen aggregate', () => {
  assert.equal(TUNING.LOADING, LOADING);
  assert.ok(Object.isFrozen(TUNING.LOADING));
  assert.ok(LOADING.sliceBudgetMs > 0 && LOADING.sliceBudgetMs <= 50, 'a slice budget well under a long task');
  for (const density of [LOADING.propsPerSlice, LOADING.exteriorPropsPerSlice, LOADING.vegetationChecksPerSlice,
    LOADING.fieldRowsPerSlice])
    assert.ok(Number.isSafeInteger(density) && density > 0);
});
