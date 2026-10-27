/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M47 (docs/PLANS.md §47.3) on the town itself (generated seed `euc`): the
 * three production rosters through the view's own vehicle deal and price.
 * Low draws exactly the living-r1 world; Medium and High only add.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel } from '../level/levels.ts';
import { populationRoster } from '../level/populationDensity.ts';
import { preparePopulationWorld } from '../app/populationWorld.ts';
import { assignVehicleBodies } from './populationVehicles.ts';
import { countPopulation } from './populationPrice.ts';
import { createPopulationView } from './populationView.ts';
import { pricedPopulationRoster } from './pricedPopulation.ts';

const town = preparePopulationWorld(createLevel('generated', 'euc')).population;
const LAYERS = ['base', 'medium', 'high'] as const;
const rosters = LAYERS.map(layer => populationRoster(town, layer));
const vehicle = (kind: string): boolean => kind.endsWith('Vehicle');

test('the town\'s living-r1 vans keep their bodies at every tier; a Medium extra keeps its body at High', () => {
  assert.ok(town.density && town.density.actors.some(actor => actor.kind === 'trafficVehicle'), 'the town has extra traffic');
  // The pre-M47 call: the base roster alone, no density argument.
  const before = assignVehicleBodies(town.actors);
  assert.ok(before.size >= 3);
  const [low, medium, high] = rosters.map(roster => assignVehicleBodies(roster.actors, roster.density?.actors));
  assert.equal(rosters[0], town, 'Low is the prepared base plan itself');
  assert.deepEqual([...low], [...before], 'Low deals exactly the living-r1 bodies');
  for (const bodies of [medium, high]) for (const [id, body] of before) assert.equal(bodies.get(id), body, id);
  const mediumExtras = rosters[1].actors.slice(town.actors.length).filter(actor => vehicle(actor.kind));
  const highExtras = rosters[2].actors.slice(town.actors.length).filter(actor => vehicle(actor.kind));
  assert.ok(mediumExtras.length > 0 && highExtras.length > mediumExtras.length);
  for (const actor of mediumExtras) assert.equal(medium.get(actor.id), high.get(actor.id), actor.id);
  for (const actor of highExtras) assert.ok(high.has(actor.id), `${actor.id} has a body`);
});

test('the town draws the same 44 colour / 10 shadow batches at Low, Medium and High, and the view costs its price', () => {
  for (const [index, roster] of rosters.entries()) {
    const counted = countPopulation(roster);
    assert.equal(counted.colourDraws, 44, LAYERS[index]);
    assert.equal(counted.shadowDraws, 10, LAYERS[index]);
  }
  const [low, medium, high] = rosters.map(countPopulation);
  assert.ok(low.colourTriangles < medium.colourTriangles && medium.colourTriangles < high.colourTriangles, 'more actors, more triangles');
  // The renderer prices High: no tier draws more than it priced.
  assert.equal(pricedPopulationRoster(town), rosters[2]);
  for (const counted of [low, medium]) {
    for (const key of ['colourTriangles', 'shadowTriangles', 'instanceBytes'] as const) assert.ok(counted[key] <= high[key], key);
  }
  const view = createPopulationView(rosters[2]);
  try {
    const actual = view.report();
    assert.equal(actual.drawCalls, high.colourDraws); assert.equal(actual.shadowDrawCalls, high.shadowDraws);
    assert.equal(actual.colourTriangles, high.colourTriangles); assert.equal(actual.shadowTriangles, high.shadowTriangles);
    assert.equal(actual.instanceBytes, high.instanceBytes); assert.equal(actual.geometryBytes, high.geometryBytes);
    assert.equal(actual.actors, rosters[2].actors.length);
  } finally { view.dispose(); }
});
