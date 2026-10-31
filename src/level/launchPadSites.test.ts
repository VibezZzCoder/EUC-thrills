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
import { buildLevelPlan } from './buildPlan.ts';
import type { AuthoredLaunchPad, LevelPlan } from './plan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { LaunchPadField } from '../simulation/launchPadField.ts';

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

test('a world without a closed town ring and a spine gets no pads: slice, proving, BelVar, Switchback, Foundry Yard', () => {
  const ids: LevelId[] = ['slice', 'proving', 'track', 'switchback', 'skatepark'];
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

// ---------------------------------------------------------------------------
// M44 — the authored branch (`docs/PLANS.md` §44.1 D5)
// ---------------------------------------------------------------------------

/** The fixture's roof deck: its top over the corridor surface, metres (a §44.1 D4 slab, floating). */
const ROOF_TOP_METRES = 12;
/** How thick the floating deck is, metres: its collider spans only its top metre (a negative `depth`). */
const ROOF_DECK_METRES = 1;
/** Where the deck stands along the fixture street, metres from its start, and its half-size. */
const ROOF_S = 40;
const ROOF_HALF = 6;
/** The surround off the fixture's heightfield, metres: unlike the street, so an off-field pad shows it. */
const SURROUND_METRES = -2;
/** The fixture street's start pose: s = 0 here, heading +Z, so (s, t) = (z − 5, x). */
const START_Z = 5;

/**
 * One straight street and one floating roof deck over it, built with
 * `settleBlocks` off exactly as EUClaude Heights is (§44.1 D4). It fails the
 * finder's city predicate (no street loop, no spine), so any pad it gets is
 * the authored branch's.
 */
function roofFixture(): LevelPlan {
  return buildLevelPlan([{
    id: 'pad-hook-street', length: 80, halfWidth: 8, surface: 'pavement',
    blocks: [{ s: ROOF_S, t: 0, halfAlong: ROOF_HALF, halfLateral: ROOF_HALF, height: ROOF_TOP_METRES,
      depth: -(ROOF_TOP_METRES - ROOF_DECK_METRES), surface: 'pavement', appearance: 'concrete' }],
  }], {
    id: 'pad-hook-fixture', spawn: { position: { x: 0, y: 0, z: START_Z }, headingY: 0 },
    surround: { height: SURROUND_METRES, surface: 'pavement' }, settleBlocks: false,
  });
}

/** A roof pad, a street pad and a pad off the heightfield, deliberately out of any sorted order. */
const AUTHORED: readonly AuthoredLaunchPad[] = Object.freeze([
  Object.freeze({ id: 'roof', x: 0, z: START_Z + ROOF_S, yaw: Math.PI / 2, dropMetres: 0 }),
  Object.freeze({ id: 'a-street', x: 0, z: START_Z + 15, yaw: -0.3, dropMetres: 0.45 }),
  Object.freeze({ id: 'off-field', x: 500, z: -500, yaw: 0, dropMetres: 0 }),
]);

function withPads(plan: LevelPlan, pads: readonly AuthoredLaunchPad[]): LevelPlan {
  return { ...plan, launchPads: pads };
}

test('M44: an authored list resolves into sites in its own order — the entry\'s id, centre, yaw and drop, the radii from LAUNCH_PAD, y from the prepared ground (a roof deck\'s top)', () => {
  const base = roofFixture();
  const plan = withPads(base, AUTHORED);
  const population = buildPopulationPlan(plan, plan.populationPaths);
  const authoredJson = JSON.stringify(AUTHORED);
  const digest = planDigest(plan);
  const runs = launchPadFinderRuns();
  const sites = cityLaunchPads(plan, population);
  assert.equal(launchPadFinderRuns(), runs + 1, 'one resolution per world, counted like a search');
  assert.deepEqual(sites.map((site) => site.id), ['roof', 'a-street', 'off-field'], 'the authored order, unsorted');
  assert.equal(planDigest(plan), digest, 'the plan is not written');
  assert.equal(JSON.stringify(AUTHORED), authoredJson, 'the authored list is not written');
  // The same sampler kind the finder reads, on the same plan.
  const sampler = new PlanTerrainSampler(plan), ground = createGroundSample();
  sites.forEach((site, index) => {
    const pad = AUTHORED[index];
    assert.equal(site.x, pad.x); assert.equal(site.z, pad.z);
    assert.equal(site.yaw, pad.yaw, `${site.id}: the yaw as written, not snapped to π/8`);
    assert.equal(site.dropMetres, pad.dropMetres, `${site.id}: the declared drop`);
    assert.equal(site.triggerRadius, LAUNCH_PAD.triggerRadiusMetres);
    assert.equal(site.footprintRadius, LAUNCH_PAD.footprintRadiusMetres);
    assert.equal(site.y, sampler.sampleGround(pad.x, pad.z, ground).height, `${site.id}: y is the sampled ground`);
    assert.deepEqual(Object.keys(site), ['id', 'x', 'y', 'z', 'yaw', 'triggerRadius', 'footprintRadius', 'dropMetres'],
      'the derived site\'s own key order, so a JSON of either reads alike');
  });
  const [roof, street, off] = sites;
  assert.ok(Math.abs(roof.y - ROOF_TOP_METRES) < 1e-9, `the roof pad stands on the deck's top (${roof.y})`);
  assert.ok(Math.abs(street.y) < 1e-9, `the street pad stands on the street (${street.y})`);
  assert.equal(off.y, SURROUND_METRES, 'off the heightfield the ground is the surround');
  // Frozen like every derived list, and the field the human seats get accepts it.
  assert.ok(Object.isFrozen(sites) && sites.every((site) => Object.isFrozen(site)));
  const field = new LaunchPadField(sites);
  assert.equal(field.count, AUTHORED.length);
  sites.forEach((site, index) => {
    assert.equal(field.at(site.x, site.z), index);
    assert.equal(field.idAt(index), site.id);
    assert.equal(field.dropAt(index), site.dropMetres);
  });
  // The unpadded fixture is the finder's, and the finder refuses it.
  assert.deepEqual(cityLaunchPads(base, buildPopulationPlan(base, base.populationPaths)), [], 'no street loop, no derived pads');
});

test('M44: the authored answer is memoised per plan and population object, and a different population re-resolves alike', () => {
  const plan = withPads(roofFixture(), AUTHORED);
  const population = buildPopulationPlan(plan, plan.populationPaths);
  assert.deepEqual(cityLaunchPads(plan, null), [], 'no population, no pads — the gate comes first for an authored list too');
  const before = launchPadFinderRuns();
  const first = cityLaunchPads(plan, population);
  assert.equal(cityLaunchPads(plan, population), first, 'the same frozen list');
  assert.equal(launchPadFinderRuns(), before + 1, 'a memo hit computes nothing');
  const again = cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths));
  assert.notEqual(again, first);
  assert.deepEqual(again, first, 'the same inputs resolve to the same sites');
  assert.equal(launchPadFinderRuns(), before + 2);
});

test('M44: a town plan carrying the key is resolved, never searched; an empty list is no pads, never a fallback to the finder', () => {
  const { plan } = generateLevel('euc');
  const population = buildPopulationPlan(plan, plan.populationPaths);
  const derived = cityLaunchPads(plan, population);
  assert.ok(derived.length >= LAUNCH_PAD.minimumPads, 'the raw town finds its own pads');
  const spawn = plan.spawn.position;
  const authored = [{ id: 'only', x: spawn.x, z: spawn.z, yaw: 0, dropMetres: 0 }];
  const resolved = cityLaunchPads(withPads(plan, authored), population);
  assert.deepEqual(resolved.map((site) => site.id), ['only'], 'the authored list replaces the search');
  const runs = launchPadFinderRuns();
  const none = cityLaunchPads(withPads(plan, []), population);
  assert.deepEqual(none, []);
  assert.ok(Object.isFrozen(none));
  assert.equal(launchPadFinderRuns(), runs + 1, 'an empty list is still one resolution');
  // The shipped plan never carries the key, so its own answer stays the search's.
  assert.equal(Object.hasOwn(plan, 'launchPads'), false);
  assert.equal(cityLaunchPads(plan, population), derived);
});

test('M44: radii are LAUNCH_PAD\'s, never the author\'s — extra fields on an entry are ignored', () => {
  const sneaky = { id: 'sneaky', x: 0, z: START_Z + 15, yaw: 0, dropMetres: 0, triggerRadius: 9, footprintRadius: 9, y: 99 };
  const plan = withPads(roofFixture(), [sneaky as AuthoredLaunchPad]);
  const [site] = cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths));
  assert.equal(site.triggerRadius, LAUNCH_PAD.triggerRadiusMetres);
  assert.equal(site.footprintRadius, LAUNCH_PAD.footprintRadiusMetres);
  assert.ok(Math.abs(site.y) < 1e-9, 'y is the ground, not the entry\'s');
});

test('M44: a bad authored list throws, naming the entry — blank or repeated ids, a non-finite centre or yaw, a negative or non-finite drop', () => {
  const good = { id: 'good', x: 0, z: START_Z + 15, yaw: 0, dropMetres: 0 };
  const cases: readonly { readonly why: string; readonly pads: readonly unknown[]; readonly message: RegExp }[] = [
    { why: 'an empty id', pads: [{ ...good, id: '' }], message: /pad 0 needs a non-empty id/ },
    { why: 'a blank id', pads: [{ ...good, id: '   ' }], message: /pad 0 "   " needs a non-empty id/ },
    { why: 'a missing id', pads: [{ x: 0, z: 0, yaw: 0, dropMetres: 0 }], message: /pad 0 needs a non-empty id/ },
    { why: 'a repeated id', pads: [good, { ...good, x: 6 }], message: /pad 1 "good" repeats an earlier pad's id/ },
    { why: 'a NaN x', pads: [{ ...good, x: Number.NaN }], message: /needs a finite centre/ },
    { why: 'an infinite z', pads: [good, { ...good, id: 'far', z: Number.POSITIVE_INFINITY }], message: /pad 1 "far" needs a finite centre/ },
    { why: 'a NaN yaw', pads: [{ ...good, yaw: Number.NaN }], message: /needs a finite yaw/ },
    { why: 'an infinite yaw', pads: [{ ...good, yaw: Number.NEGATIVE_INFINITY }], message: /needs a finite yaw/ },
    { why: 'a negative drop', pads: [{ ...good, dropMetres: -0.01 }], message: /needs a finite drop of at least 0 m/ },
    { why: 'a NaN drop', pads: [{ ...good, dropMetres: Number.NaN }], message: /needs a finite drop/ },
    { why: 'an infinite drop', pads: [{ ...good, dropMetres: Number.POSITIVE_INFINITY }], message: /needs a finite drop/ },
    { why: 'a string drop', pads: [{ ...good, dropMetres: '0' }], message: /needs a finite drop/ },
  ];
  const base = roofFixture();
  for (const { why, pads, message } of cases) {
    const plan = withPads(base, pads as readonly AuthoredLaunchPad[]);
    const population = buildPopulationPlan(plan, plan.populationPaths);
    assert.throws(() => cityLaunchPads(plan, population), (error: unknown) => error instanceof RangeError
      && message.test(error.message), why);
    // Nothing was memoised: the same plan throws again rather than answering.
    assert.throws(() => cityLaunchPads(plan, population), RangeError, `${why}, asked twice`);
  }
  // A zero drop and any finite yaw are fine; so is -0 (it is not below 0).
  const plan = withPads(base, [{ ...good, yaw: 7.5, dropMetres: -0 }]);
  assert.equal(cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths)).length, 1);
});

test('M44: forty authored pads resolve, keep their order and build one field that answers each centre', () => {
  const base = roofFixture();
  // A 2 × 20 grid along the street, 3.5 m apart: footprints never overlap.
  const pads: AuthoredLaunchPad[] = [];
  for (let k = 0; k < 40; k += 1) {
    pads.push({ id: `grid-${39 - k}`, x: (k % 2) * 4 - 2, z: START_Z + 2 + Math.floor(k / 2) * 3.5,
      yaw: (k * Math.PI) / 16, dropMetres: (k % 3) * 0.25 });
  }
  const plan = withPads(base, pads);
  const sites = cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths));
  assert.equal(sites.length, 40);
  assert.deepEqual(sites.map((site) => site.id), pads.map((pad) => pad.id));
  const field = new LaunchPadField(sites);
  assert.equal(field.count, 40);
  sites.forEach((site, index) => assert.equal(field.at(site.x, site.z), index, site.id));
  // Pads under and beside the roof deck read the deck's top; the rest the street.
  const deck = (z: number) => Math.abs(z - (START_Z + ROOF_S)) <= ROOF_HALF;
  for (const site of sites) {
    const expected = deck(site.z) && Math.abs(site.x) <= ROOF_HALF ? ROOF_TOP_METRES : 0;
    assert.ok(Math.abs(site.y - expected) < 1e-9, `${site.id} at z ${site.z}: y ${site.y}, expected ${expected}`);
  }
});

const EIGHT_KEYS = ['id', 'x', 'y', 'z', 'yaw', 'triggerRadius', 'footprintRadius', 'dropMetres'];

test('M44 D15: a safe-point hold is carried onto the site only when the entry writes it, and the field holds with it', () => {
  const pads: readonly AuthoredLaunchPad[] = Object.freeze([
    Object.freeze({ id: 'roof', x: 0, z: START_Z + ROOF_S, yaw: 0, dropMetres: 0, holdSafeMetres: 12.5 }),
    Object.freeze({ id: 'street', x: 0, z: START_Z + 15, yaw: 0, dropMetres: 0 }),
    Object.freeze({ id: 'zero', x: 0, z: START_Z + 60, yaw: 0, dropMetres: 0, holdSafeMetres: 0 }),
  ]);
  const json = JSON.stringify(pads);
  const plan = withPads(roofFixture(), pads);
  const sites = cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths));
  assert.equal(JSON.stringify(pads), json, 'the authored list is not written');
  const [roof, street, zero] = sites;
  assert.equal(roof.holdSafeMetres, 12.5, 'the hold as written');
  assert.deepEqual(Object.keys(roof), [...EIGHT_KEYS, 'holdSafeMetres'], 'appended after the derived site\'s own keys');
  assert.equal(Object.hasOwn(street, 'holdSafeMetres'), false, 'no hold written, no key on the site');
  assert.deepEqual(Object.keys(street), EIGHT_KEYS);
  assert.equal(zero.holdSafeMetres, 0, 'a written zero is carried (and holds nothing)');
  assert.ok(Object.isFrozen(roof));
  // The field built from the sites holds on the roof deck, within the radius and the band only.
  const field = new LaunchPadField(sites);
  assert.equal(field.maxHoldSafeMetres, 12.5);
  assert.ok(Math.abs(roof.y - ROOF_TOP_METRES) < 1e-9);
  assert.equal(field.holdsSafePoint(roof.x, roof.z, roof.y), true, 'the roof pad\'s own deck');
  assert.equal(field.holdsSafePoint(roof.x + 12, roof.z, roof.y), true);
  assert.equal(field.holdsSafePoint(roof.x + 13, roof.z, roof.y), false, 'outside the radius');
  assert.equal(field.holdsSafePoint(roof.x, roof.z, 0), false, 'the street under it is out of the band');
  assert.equal(field.holdsSafePoint(street.x, street.z, street.y), false, 'the street pad holds nothing');
  assert.equal(field.holdsSafePoint(zero.x, zero.z, zero.y), false, 'nor the zero hold');
});

test('M44 D15: a bad hold throws, naming the entry — negative, NaN, infinite or not a number', () => {
  const good = { id: 'good', x: 0, z: START_Z + 15, yaw: 0, dropMetres: 0 };
  const base = roofFixture();
  for (const [why, hold] of [['negative', -0.01], ['NaN', Number.NaN], ['infinite', Number.POSITIVE_INFINITY],
    ['a string', '4'], ['null', null]] as const) {
    const plan = withPads(base, [good, { ...good, id: 'bad', z: START_Z + 30, holdSafeMetres: hold }] as unknown as AuthoredLaunchPad[]);
    const population = buildPopulationPlan(plan, plan.populationPaths);
    assert.throws(() => cityLaunchPads(plan, population), (error: unknown) => error instanceof RangeError
      && /pad 1 "bad" needs a finite safe-point hold of at least 0 m/.test(error.message), why);
  }
  // -0 is not below 0; an explicitly undefined hold is no hold.
  const fine = withPads(base, [{ ...good, holdSafeMetres: -0 }, { ...good, id: 'unset', z: START_Z + 30, holdSafeMetres: undefined }]);
  const sites = cityLaunchPads(fine, buildPopulationPlan(fine, fine.populationPaths));
  assert.equal(sites.length, 2);
  assert.equal(Object.hasOwn(sites[1], 'holdSafeMetres'), false);
});

test('M44 D15: derived sites never carry a hold — the key is absent, so their JSON (the pinned corpus) is unchanged', () => {
  const { plan } = generateLevel('route-41');
  const sites = cityLaunchPads(plan, buildPopulationPlan(plan, plan.populationPaths));
  assert.ok(sites.length >= LAUNCH_PAD.minimumPads);
  for (const site of sites) {
    assert.equal(Object.hasOwn(site, 'holdSafeMetres'), false, site.id);
    assert.deepEqual(Object.keys(site), EIGHT_KEYS, `${site.id}: the derived site's keys`);
  }
  assert.equal(new LaunchPadField(sites).maxHoldSafeMetres, 0, 'a derived field holds nothing');
});
