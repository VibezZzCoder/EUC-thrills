/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { planDigest } from '../level/planDigest.ts';
import { POPULATION_AUTHORING } from '../data/tuning.ts';
import { preparePopulationWorld, preparePopulationWorldSteps } from './populationWorld.ts';
import { createLevel, requestRoute } from '../level/levels.ts';
import { populationAuthoringMemoOpen } from '../level/populationPlan.ts';
import { driveSteps } from '../shared/preparationSteps.ts';
import { yieldToBrowser } from './bootSlicer.ts';

function world(): LevelPlan {
  return { id: 'population-identity-control',
    spawn: { position: { x: -25, y: 0, z: -25 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: { originX: -30, originZ: -30, spacing: 1, columns: 81, rows: 81,
      heights: new Array<number>(81 * 81).fill(0),
      surfaces: new Array<SurfaceId>(80 * 80).fill('pavement') },
    segments: [{ id: 'actual-walk',
      entry: { position: { x: 0, y: 0, z: 0 }, headingY: 0, halfWidth: 5, surface: 'pavement', gradient: 0 },
      exit: { position: { x: 0, y: 0, z: 40 }, headingY: 0, halfWidth: 5, surface: 'pavement', gradient: 0 },
      colliders: [] }], checkpoints: [] };
}

test('empty diagnostic worlds retain record identity and cannot acquire inferred actors', () => {
  const source = world(), before = planDigest(source);
  const prepared = preparePopulationWorld(source);
  assert.equal(prepared.level.id, source.id);
  assert.equal(prepared.population.sourceWorldId, source.id);
  assert.equal(prepared.population.actors.length, 0);
  assert.equal(prepared.population.report.missingAuthoredPaths, true);
  assert.equal(planDigest(source), before);
});

test('actual physical population changes installed identity before consumers without mutating source ground', () => {
  const source: LevelPlan = { ...world(), populationPaths: [{
    id: 'actual-park-walk', role: 'pedestrian', district: 'park', closed: false, serviceShuttle: false,
    frames: Array.from({ length: 81 }, (_, index) => ({
      x: 0, y: 0, z: index * 0.5, headingY: 0, distanceMetres: index * 0.5,
      sourceSegmentId: 'actual-walk', halfWidthMetres: 2,
    })),
  }] };
  const before = planDigest(source), one = preparePopulationWorld(source), two = preparePopulationWorld(source);
  assert.ok(one.population.actors.length > 0, 'a genuinely authored positive control must populate');
  assert.notEqual(one.level.id, source.id);
  assert.equal(one.level.id, one.population.installedWorldId);
  assert.equal(one.level.districtActivity?.sourceWorldId, source.id);
  assert.equal(one.level.districtActivity?.walkRevision, POPULATION_AUTHORING.activityWalkPolicyRevision);
  assert.equal(one.level.populationActivityChoiceWorldId, source.id);
  assert.equal(one.population.sourceWorldId, one.level.districtActivity?.physicalWorldId);
  assert.notEqual(one.population.sourceWorldId, source.id,
    'a newly authored purposeful walking policy has its own physical records key');
  assert.equal(one.level.populationSourceWorldId, one.population.sourceWorldId);
  assert.deepEqual(one, two);
  assert.equal(one.level.heightfield, source.heightfield);
  assert.equal(one.level.solids, source.solids);
  assert.equal(one.level.spawn, source.spawn);
  assert.equal(planDigest(source), before);
});

test('installed park walking worlds without frontage finishing preserve identity, actors and owned ground on preparation', () => {
  const source: LevelPlan = { ...world(), id: 'authored~living-r1', populationPaths: [{
    id: 'actual-park-walk', role: 'pedestrian', district: 'park', closed: false, serviceShuttle: false,
    frames: Array.from({ length: 81 }, (_, index) => ({
      x: 0, y: 0, z: index * 0.5, headingY: 0, distanceMetres: index * 0.5,
      sourceSegmentId: 'actual-walk', halfWidthMetres: 2,
    })),
  }] };
  const one = preparePopulationWorld(source), two = preparePopulationWorld(one.level);
  assert.equal(one.level.districtAdjacency, undefined, 'exercise the no-district installation path');
  assert.ok(one.population.actors.length > 0);
  assert.notEqual(one.level.id, source.id, 'a suffix in an authored id is not proof of prior installation');
  assert.equal(two.level.id, one.level.id);
  assert.equal(one.level.districtActivity?.sourceWorldId, source.id);
  assert.equal(one.level.populationActivityChoiceWorldId, source.id);
  assert.equal(two.level.populationSourceWorldId, one.population.sourceWorldId);
  assert.deepEqual(two.population, one.population);
  assert.equal(two.level.heightfield, one.level.heightfield);
  assert.equal(two.level.groundSurfacePatches, one.level.groundSurfacePatches);
  assert.equal(two.level.props, one.level.props);
  assert.equal(two.level.solids, one.level.solids);
  assert.deepEqual(two.level.populationGroundReport, two.population.report.groundSupplement);
});

// --- 2026-10-17 audit §3: the boot drives the same preparation in slices ----
// Exactness against the frozen pre-slicing source is the loading harness's
// job (test-results/perf-actions-2026-10-17/harness/loading/run.mjs). These
// pin what must hold in-repo: suspension changes nothing, only label-free
// slices are yielded, the density cannot collapse back to one task, and an
// abandoned preparation closes its authoring memo.
function walkingWorld(): LevelPlan {
  return { ...world(), populationPaths: [{
    id: 'actual-park-walk', role: 'pedestrian', district: 'park', closed: false, serviceShuttle: false,
    frames: Array.from({ length: 81 }, (_, index) => ({
      x: 0, y: 0, z: index * 0.5, headingY: 0, distanceMetres: index * 0.5,
      sourceSegmentId: 'actual-walk', halfWidthMetres: 2,
    })),
  }] };
}

test('the boot\'s sliced preparation, driven with real yields, equals the synchronous one', async () => {
  const generated = requestRoute('euc');
  assert.ok(generated.ok, 'the default seed generates');
  for (const [name, make] of [['fixture', () => world()], ['walking fixture', walkingWorld],
    ['switchback', () => createLevel('switchback')], ['slice', () => createLevel('slice')],
    ['generated euc', () => generated.plan]] as const) {
    const source = make(), before = planDigest(source);
    const sync = preparePopulationWorld(source);
    let slices = 0;
    // No stage hook: driveSteps refuses any label, so this also proves the
    // population steps yield only the label-free slice token.
    const driven = await driveSteps(preparePopulationWorldSteps(source), {
      // Every 64th slice really yields to the event loop, as the boot does.
      slice: () => (++slices % 64 === 0 ? yieldToBrowser() : null),
    });
    assert.deepStrictEqual(driven, sync, `${name}: same prepared world`);
    assert.equal(JSON.stringify(driven), JSON.stringify(sync), `${name}: same key order`);
    assert.equal(planDigest(source), before, `${name}: the source plan is never written`);
    assert.equal(populationAuthoringMemoOpen(), false, `${name}: no memo scope outlives a preparation`);
    // About 1,300 on this city today; the floor catches a conversion collapsing back to a few tasks.
    if (name === 'generated euc') assert.ok(slices >= 200, `expected hundreds of slices, saw ${slices}`);
  }
});

test('an abandoned preparation closes its authoring memo; interleaved preparations equal their solo results', () => {
  const abandoned = preparePopulationWorldSteps(createLevel('slice'));
  assert.equal(populationAuthoringMemoOpen(), false, 'a generator does nothing until driven');
  for (let index = 0; index < 5; index += 1) assert.equal(abandoned.next().done, false);
  assert.equal(populationAuthoringMemoOpen(), true, 'the memo is open while the preparation is suspended');
  abandoned.return(undefined as never);
  assert.equal(populationAuthoringMemoOpen(), false, 'return() runs the scope\'s finally');

  const solo = [preparePopulationWorld(createLevel('slice')), preparePopulationWorld(walkingWorld())];
  const a = preparePopulationWorldSteps(createLevel('slice')), b = preparePopulationWorldSteps(walkingWorld());
  let ra = a.next(), rb = b.next();
  while (!ra.done || !rb.done) { if (!ra.done) ra = a.next(); if (!rb.done) rb = b.next(); }
  assert.deepStrictEqual(ra.value, solo[0]);
  assert.deepStrictEqual(rb.value, solo[1]);
  assert.equal(JSON.stringify([ra.value, rb.value]), JSON.stringify(solo));
  assert.equal(populationAuthoringMemoOpen(), false);
});
