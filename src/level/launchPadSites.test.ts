/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LAUNCH_PAD } from '../data/tuning.ts';
import {
  cityLaunchPads, launchPadClearRadius, launchPadDecorClearance, launchPadFinderRuns,
  launchPadMissedCornerBendRadius, launchPadMissedCornerRay, launchPadReachRadius,
} from './launchPadSites.ts';
import { createLevel, type LevelId } from './levels.ts';
import { buildPopulationPlan } from './populationPlan.ts';
import { planDigest } from './planDigest.ts';
import { generateLevel } from './generateRoute.ts';

/**
 * M42 — the launch-pad finder, level-side (`docs/PLANS.md` §42.2b, §42.3a).
 *
 * The corpus over **prepared** worlds lives in `src/bench/launchPadSites.test.ts`:
 * preparing a world is `app/populationWorld.ts`, and `src/architecture.test.ts`
 * seals every file under `level/` — tests included — against `app/` imports.
 * This file keeps what a raw plan can answer: the gate, the memo, purity and
 * the derived numbers.
 */

test('the derived numbers are sums of LAUNCH_PAD, never typed', () => {
  assert.ok(Math.abs(launchPadReachRadius() - 21.4) < 1e-12, 'the flight cap plus the trigger');
  assert.ok(Math.abs(launchPadClearRadius() - 22.4) < 1e-12);
  assert.equal(launchPadMissedCornerRay(), 42);
  assert.equal(launchPadDecorClearance(), 4);
  const bend = launchPadMissedCornerBendRadius();
  assert.ok(bend > 110 && bend < 130, `≈ 120 m at the shipped top speed, got ${bend.toFixed(1)}`);
});

test('a world without a closed town ring and a spine gets no pads: slice, proving, BelVar, Switchback', () => {
  const ids: LevelId[] = ['slice', 'proving', 'track', 'switchback'];
  for (const id of ids) {
    const plan = createLevel(id);
    const runs = launchPadFinderRuns();
    const sites = cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths));
    assert.deepEqual(sites, [], id);
    assert.ok(Object.isFrozen(sites));
    assert.equal(launchPadFinderRuns(), runs + 1, `${id}: one computation`);
  }
});

test('no population, no pads; and the answer is memoised per plan and population object', () => {
  const { plan } = generateLevel('euc');
  assert.deepEqual(cityLaunchPads(plan, null), []);
  const population = buildPopulationPlan(plan, plan.populationPaths);
  const before = launchPadFinderRuns();
  const first = cityLaunchPads(plan, population);
  assert.equal(launchPadFinderRuns(), before + 1);
  const again = cityLaunchPads(plan, population);
  assert.equal(again, first, 'the same frozen list');
  assert.equal(launchPadFinderRuns(), before + 1, 'a memo hit computes nothing');
  // A different population for the same plan recomputes; a copy of the plan is a different plan.
  const other = buildPopulationPlan(plan, plan.populationPaths);
  const recomputed = cityLaunchPads(plan, other);
  assert.equal(launchPadFinderRuns(), before + 2);
  assert.deepEqual(recomputed, first, 'the same inputs find the same sites');
  assert.deepEqual(cityLaunchPads({ ...plan }, population), first);
  assert.equal(launchPadFinderRuns(), before + 3);
  assert.ok(Object.isFrozen(first) && first.every((site) => Object.isFrozen(site)));
});

test('the finder never mutates the plan or the population (raw generated world)', () => {
  const { plan } = generateLevel('route-41');
  const population = buildPopulationPlan(plan, plan.populationPaths);
  const digest = planDigest(plan);
  const content = population.contentDigest;
  const json = JSON.stringify(population);
  const sites = cityLaunchPads(plan, population);
  assert.equal(planDigest(plan), digest);
  assert.equal(population.contentDigest, content);
  assert.equal(JSON.stringify(population), json);
  assert.ok(sites.length >= 1);
  for (const site of sites) {
    assert.match(site.id, /^pad-\d+-\d+$/);
    assert.equal(site.triggerRadius, LAUNCH_PAD.triggerRadiusMetres);
    assert.equal(site.footprintRadius, LAUNCH_PAD.footprintRadiusMetres);
    assert.ok(site.dropMetres >= 0);
    const eighths = site.yaw / (Math.PI / 8);
    assert.ok(Math.abs(eighths - Math.round(eighths)) < 1e-9, `${site.id} yaw is a multiple of π/8`);
    assert.ok(site.yaw > -Math.PI - 1e-12 && site.yaw <= Math.PI + 1e-12);
  }
});

test('no pad module reads a seed stream, a random source or a clock (the finder and the field)', () => {
  // The finder runs after generation, so no generation report could show a
  // draw it made: this scan is the guard. Comments are stripped first.
  for (const file of ['./launchPadSites.ts', '../simulation/launchPadField.ts']) {
    const code = readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const forbidden of [/seedStreams/, /createSeedStreams/, /\brng\b/i, /Math\.random/, /\bDate\b/,
      /performance\./, /\bcrypto\b/, /recordWorldIdOf/]) {
      assert.doesNotMatch(code, forbidden, `${file} must not use ${forbidden}`);
    }
  }
});
