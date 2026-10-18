/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PREPARATION_SLICE, driveSteps, runSteps, type Steps } from '../shared/preparationSteps.ts';
import { createLevel, createLevelSteps, requestRoute, requestRouteSteps, type LevelId } from './levels.ts';
import { populationAuthoringMemoOpen } from './populationPlan.ts';
import type { LevelPlan } from './plan.ts';

/**
 * 2026-10-17 audit §3, Phase C ("Building your course"): route generation and
 * the venue builders are step generators. A slice is label-free, the boot
 * alone suspends at it, and every other caller drains it synchronously. These
 * tests pin suspension invariance, slice density, and the authoring-memo scope
 * across slices; parity with the frozen baseline is the loading harness's job.
 */
function drain<T>(steps: Steps<T>): { value: T; slices: number } {
  let slices = 0;
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return { value: step.value, slices };
    assert.equal(step.value, PREPARATION_SLICE, 'a course step yields only label-free slices');
    slices += 1;
  }
}
/** A real macrotask every `every` slices, as the boot's budget would yield. */
const macrotask = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
function everyNth(every: number): () => Promise<void> | null {
  let count = 0;
  return () => ((count += 1) % every === 0 ? macrotask() : null);
}

test('each venue drained as slices is the world the synchronous builder returns', () => {
  const minimum: Record<Exclude<LevelId, 'generated'>, number> = { slice: 10, track: 10, switchback: 10, proving: 0 };
  for (const id of Object.keys(minimum) as (keyof typeof minimum)[]) {
    const sync = createLevel(id);
    const { value, slices } = drain(createLevelSteps(id));
    assert.deepEqual(value, sync, id);
    assert.equal(JSON.stringify(value), JSON.stringify(sync), `${id}: key order is identity`);
    assert.ok(slices >= minimum[id], `${id}: ${slices} slices; the build cannot silently become one task again`);
  }
});

test('a generated route driven with real yields equals the synchronous route', async () => {
  const sync = requestRoute('euc');
  assert.ok(sync.ok);
  const driven = await driveSteps(requestRouteSteps('euc'), { slice: everyNth(8) });
  assert.deepEqual(driven, sync);
  assert.equal(JSON.stringify(driven), JSON.stringify(sync));
  const { slices } = drain(requestRouteSteps('euc'));
  assert.ok(slices >= 100, `${slices} slices on the default city`);
  assert.equal(populationAuthoringMemoOpen(), false);
  // The two non-route outcomes keep their shapes.
  assert.deepEqual(runSteps(requestRouteSteps('   ')), requestRoute('   '));
  assert.deepEqual(runSteps(requestRouteSteps('   ')), { ok: false, seed: '', refusal: 'blank' });
});

test('an abandoned course build closes the authoring memo; the next build is unaffected', async () => {
  const solo = requestRoute('route-41');
  // Step until the traffic-loop validation holds the memo open across a slice.
  const steps = requestRouteSteps('route-41');
  let step = steps.next();
  while (!step.done && !populationAuthoringMemoOpen()) step = steps.next();
  assert.equal(step.done, false, 'positive control: the memo is open at a slice inside the course build');
  assert.equal(populationAuthoringMemoOpen(), true);
  steps.return(undefined as never);
  assert.equal(populationAuthoringMemoOpen(), false, 'return() runs the scope finally');
  // The async drain closes it too when a slice hook fails mid-scope.
  let seen = 0;
  await assert.rejects(driveSteps(requestRouteSteps('route-41'), {
    slice: () => (populationAuthoringMemoOpen() && (seen += 1) > 3 ? Promise.reject(new Error('cover closed')) : null),
  }), /cover closed/);
  assert.equal(populationAuthoringMemoOpen(), false);
  assert.deepEqual(requestRoute('route-41'), solo);
});

test('two course builds interleaved slice by slice equal their solo results', () => {
  const soloA = requestRoute('euc'), soloB = createLevel('switchback');
  const a = requestRouteSteps('euc'), b: Steps<LevelPlan> = createLevelSteps('switchback');
  let ra = a.next(), rb = b.next();
  while (!ra.done || !rb.done) { if (!ra.done) ra = a.next(); if (!rb.done) rb = b.next(); }
  assert.deepEqual(ra.value, soloA);
  assert.equal(JSON.stringify(rb.value), JSON.stringify(soloB));
  assert.equal(populationAuthoringMemoOpen(), false);
});
