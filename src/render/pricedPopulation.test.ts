/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ActorKind, ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import { populationRoster, type PopulationDensityActor } from '../level/populationDensity.ts';
import { populationRosterAdmitted, pricedPopulationRoster, PRICED_POPULATION_LAYER } from './pricedPopulation.ts';

/**
 * M47 (docs/PLANS.md §47.3): `Renderer.setLevel` prices the High roster of the
 * prepared plan it is handed; `Renderer.setPopulation` draws any roster of
 * that same prepared plan and refuses everything else. The Renderer itself
 * needs WebGL, so its rule lives in `pricedPopulation.ts` and is held here.
 */

function actor(id: string, kind: ActorKind = 'walker'): ActorSpec {
  return { id, kind, pathId: 'path', initialDistanceMetres: 0, direction: 1, movement: 'loop',
    speedMetresPerSecond: 1.1, idleSeconds: 3, appearanceIndex: 0,
    hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } };
}
function prepared(id: string, density = true): PopulationPlan {
  const extras: PopulationDensityActor[] = [{ ...actor(`${id}-m0`), layer: 'medium' },
    { ...actor(`${id}-m1`, 'trafficVehicle'), layer: 'medium' }, { ...actor(`${id}-h0`), layer: 'high' }];
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: id, installedWorldId: `${id}~living-r1`,
    contentDigest: `${id}-digest`, paths: [], anchors: [], actors: [actor(`${id}-0`), actor(`${id}-1`, 'parkedVehicle')],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] },
    ...(density ? { density: { revision: 'living-r2' as const, actors: extras, digest: `${id}-density` } } : {}) };
}

test('the renderer prices the High roster, whichever roster of the plan it is handed', () => {
  assert.equal(PRICED_POPULATION_LAYER, 'high');
  const plan = prepared('town'), high = populationRoster(plan, 'high');
  assert.equal(pricedPopulationRoster(plan), high);
  assert.equal(pricedPopulationRoster(populationRoster(plan, 'medium')), high, 'a roster resolves to its base first');
  assert.equal(pricedPopulationRoster(high), high);
  assert.equal(pricedPopulationRoster(null), null);
  assert.deepEqual(high.actors.map(value => value.id), ['town-0', 'town-1', 'town-m0', 'town-m1', 'town-h0']);
  // A plan without a density layer (every hand-built venue) prices and draws itself.
  const venue = prepared('venue', false);
  assert.equal(pricedPopulationRoster(venue), venue);
});

test('setPopulation accepts the priced roster and every roster of the same prepared plan', () => {
  const plan = prepared('town'), priced = pricedPopulationRoster(plan);
  for (const layer of ['base', 'medium', 'high'] as const) {
    assert.ok(populationRosterAdmitted(priced, populationRoster(plan, layer)), layer);
  }
  assert.ok(populationRosterAdmitted(priced, plan), 'the prepared plan itself is the Low roster');
  assert.equal(populationRoster(plan, 'base'), plan);
  assert.ok(populationRosterAdmitted(null, null), 'no population priced, none drawn');
});

test('setPopulation refuses another world, a second preparation, an uncounted actor or a missing roster', () => {
  const plan = prepared('town'), priced = pricedPopulationRoster(plan);
  assert.equal(populationRosterAdmitted(priced, pricedPopulationRoster(prepared('other'))), false, 'another world');
  // The same content prepared twice is two worlds: its paths are another array.
  assert.equal(populationRosterAdmitted(priced, populationRoster(prepared('town'), 'base')), false, 'a second preparation');
  // Shares the paths but holds an actor the price never counted.
  const extra: PopulationPlan = { ...plan, actors: [...plan.actors, actor('town-uncounted')] };
  assert.equal(populationRosterAdmitted(priced, extra), false, 'an uncounted actor');
  assert.equal(populationRosterAdmitted(priced, null), false, 'a priced population cannot be dropped');
  assert.equal(populationRosterAdmitted(null, plan), false, 'nothing was priced for it');
  // A sub-roster sharing the paths whose every actor was counted is a roster of this plan.
  assert.ok(populationRosterAdmitted(priced, { ...plan, actors: plan.actors.slice(0, 1) }));
});
