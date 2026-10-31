/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD } from '../data/tuning.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { cityLaunchPads } from '../level/launchPadSites.ts';
import { createLevel, type LevelId } from '../level/levels.ts';
import { hash128 } from '../level/planDigest.ts';
import type { AuthoredLaunchPad, LevelPlan } from '../level/plan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';

/**
 * M44 — the pad hook over **prepared** worlds (`docs/PLANS.md` §44.1 D5,
 * §44.4). Lives in `src/bench/` because preparing a world is
 * `app/populationWorld.ts`, which `src/architecture.test.ts` forbids every
 * file under `level/` to import; the authored branch's unit checks on raw
 * plans are `src/level/launchPadSites.test.ts`.
 *
 * Two promises:
 *
 *   1. **The derived branch did not move.** Every derived site list of the
 *      M42 finder corpus and the free-ride spec seeds hashes exactly to the
 *      value captured before M44 touched `cityLaunchPads` (the coordinator's
 *      baseline, 2026-10-20: `hash128(JSON.stringify(cityLaunchPads(world.level,
 *      world.population)))` with `world = preparePopulationWorld(createLevel(
 *      'generated', seed))`), six pads each; the four shipped no-pad worlds
 *      still prepare to none. Slow on purpose (each town prepares in a few
 *      seconds) and kept to these thirteen seeds.
 *   2. **World preparation keeps an authored list.** Every stage of
 *      `preparePopulationWorld` spreads the plan it was given, so the very
 *      list a producer wrote reaches `cityLaunchPads` on the prepared plan —
 *      checked by identity on a hand-built world, a generated town and a
 *      re-preparation, and on EUClaude Heights itself, whatever it authors.
 */

/** Pre-M44 derived site-list digests (`hash128` of the list's JSON), each a six-pad list. */
const DERIVED_BASELINE: readonly (readonly [seed: string, digest: string])[] = Object.freeze([
  ['euc', '7bce4db3d910114a868b3f8adc70c7ac'],
  ['route-41', 'ab42c1078cd20221ac8413badb01b6ac'],
  ['sweep-39', '552b38275d044138f8a47fa0ec89c772'],
  ['sweep-15', '232982a722c0ee52cdf2509e3fd80a60'],
  ['euc-7', 'bd97167519a0552f746a261472ddd0a2'],
  ['harbour-spark-42', '911e5f97a9b43f74cbea8e14b7503736'],
  ['jetty-orchard-74', '311dc4a561a6d284d34a9f4417541892'],
  ['copper-gate-55', '3733505ccb9a3719a70e9a41b034e843'],
  ['x67', '8f9793a66fca77ce786a64f36184e235'],
  ['lantern-span-7', '728409a2b1aad17f5ea5a85fa8ec47d5'],
  ['euc-thrills', 'e800fce693b6704673024e17aa1466e1'],
  ['corner', 'd4f5ce08266f934b8f3a6bcde989677b'],
  ['copper-yard-78', 'ee00a35ae8fa67d2c9801cf90d5157c3'],
]);
/** Every pre-M44 town above found the finder's most. */
const DERIVED_PADS = 6;
/** `hash128('[]')`: the pre-M44 answer of every world that is not a town. */
const NO_PADS_DIGEST = '741638a51c08e7e142484b8eab68d9a4';

for (const [seed, digest] of DERIVED_BASELINE) {
  test(`derived pads unchanged: generated "${seed}" prepares to its pre-M44 six-pad list`, () => {
    const world = preparePopulationWorld(createLevel('generated', seed));
    assert.equal(Object.hasOwn(world.level, 'launchPads'), false, 'a town authors no pads: the finder answers');
    const sites = cityLaunchPads(world.level, world.population);
    assert.equal(sites.length, DERIVED_PADS);
    assert.equal(DERIVED_PADS, LAUNCH_PAD.maximumPads, 'the baseline was the finder at its most');
    assert.equal(hash128(JSON.stringify(sites)), digest, `${seed}: the derived site list moved`);
  });
}

test('derived pads unchanged: the five shipped no-pad worlds still prepare to none', () => {
  const ids: LevelId[] = ['slice', 'proving', 'track', 'switchback', 'skatepark'];
  for (const id of ids) {
    const world = preparePopulationWorld(createLevel(id));
    assert.equal(Object.hasOwn(world.level, 'launchPads'), false, id);
    const sites = cityLaunchPads(world.level, world.population);
    assert.equal(hash128(JSON.stringify(sites)), NO_PADS_DIGEST, id);
  }
});

/** Two pads, out of any sorted order, frozen as a producer would write them. */
function samplePads(plan: LevelPlan): readonly AuthoredLaunchPad[] {
  const { x, z } = plan.spawn.position;
  return Object.freeze([
    Object.freeze({ id: 'hook-b', x: x + 3, z: z + 7, yaw: Math.PI / 4, dropMetres: 0 }),
    Object.freeze({ id: 'hook-a', x: x - 3, z: z + 12, yaw: 0, dropMetres: 0.5 }),
  ]);
}

/** Prepare a plan carrying `pads` and check the list arrives untouched, then resolves on the prepared ground. */
function assertKept(label: string, source: LevelPlan, pads: readonly AuthoredLaunchPad[]): void {
  const world = preparePopulationWorld({ ...source, launchPads: pads });
  assert.equal(world.level.launchPads, pads, `${label}: preparation keeps the very list the producer wrote`);
  const again = preparePopulationWorld(world.level);
  assert.equal(again.level.launchPads, pads, `${label}: re-preparing an installed plan keeps it too`);
  const sites = cityLaunchPads(world.level, world.population);
  assert.deepEqual(sites.map((site) => site.id), pads.map((pad) => pad.id), `${label}: resolved in the authored order`);
  const sampler = new PlanTerrainSampler(world.level), ground = createGroundSample();
  sites.forEach((site, index) => {
    assert.equal(site.y, sampler.sampleGround(pads[index].x, pads[index].z, ground).height,
      `${label} ${site.id}: y is the prepared plan's ground`);
  });
}

test('preparation keeps an authored list: the slice, BelVar and Switchback (hand-built worlds)', () => {
  for (const id of ['slice', 'track', 'switchback'] as const) {
    const source = createLevel(id);
    assertKept(id, source, samplePads(source));
  }
});

test('preparation keeps an authored list: a generated town (every district stage runs)', () => {
  const source = createLevel('generated', 'euc');
  assertKept('generated euc', source, samplePads(source));
});

test('preparation keeps an authored list: EUClaude Heights as built, whatever it authors', () => {
  const source = createLevel('euclaude');
  const world = preparePopulationWorld(source);
  assert.equal(Object.hasOwn(world.level, 'launchPads'), Object.hasOwn(source, 'launchPads'),
    'preparation neither drops the key nor invents it');
  assert.equal(world.level.launchPads, source.launchPads, 'the very list the venue wrote');
  const sites = cityLaunchPads(world.level, world.population);
  if (source.launchPads !== undefined) {
    assert.deepEqual(sites.map((site) => site.id), source.launchPads.map((pad) => pad.id), 'every authored pad, in order');
  }
  console.log(JSON.stringify({ pad: 'euclaude', authored: source.launchPads?.length ?? null, sites: sites.length }));
});
