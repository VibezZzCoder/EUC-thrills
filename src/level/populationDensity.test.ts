/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** M47 density layer: traffic stations, refusals and roster contracts on a
 * small authored fixture. The generated cities are covered end to end in
 * `app/populationDensityWorld.test.ts`. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION_AUTHORING, POPULATION_DENSITY } from '../data/tuning.ts';
import type { LevelPlan } from './plan.ts';
import { planDigest } from './planDigest.ts';
import { createLevel } from './levels.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { buildPopulationPlan, type AuthoredPopulationPath, type PopulationPlan } from './populationPlan.ts';
import {
  authorPopulationDensity, authorPopulationDensitySteps, populationRoster, populationRosterFromLayers,
  POPULATION_DENSITY_LAYERS, type PopulationDensityLayer,
} from './populationDensity.ts';
import { PREPARATION_SLICE } from '../shared/preparationSteps.ts';

/** A closed counter-clockwise ring of traffic frames: heading -θ, chord distances. */
function ring(id: string, centreX: number, centreZ: number, radius: number): AuthoredPopulationPath {
  const count = Math.ceil(2 * Math.PI * radius / 0.5);
  let travelled = 0;
  const frames = Array.from({ length: count + 1 }, (_, index) => {
    const theta = 2 * Math.PI * index / count;
    return { x: centreX + radius * Math.cos(theta), z: centreZ + radius * Math.sin(theta),
      headingY: Math.atan2(Math.sin(-theta), Math.cos(-theta)) };
  }).map((frame, index, all) => {
    if (index > 0) travelled += Math.hypot(frame.x - all[index - 1].x, frame.z - all[index - 1].z);
    return { ...frame, y: 0, distanceMetres: travelled, sourceSegmentId: 'lane', halfWidthMetres: 3.5 };
  });
  return { id, role: 'traffic', district: 'commercial', closed: true, serviceShuttle: false, frames };
}

/** Two loops on flat pavement: `loop-a` (r 30 m, about 188 m) and `loop-b` (r 10 m, about 63 m), both compact (`compactLoopMetres`). */
function fixture(rings = [ring('loop-a', 0, 0, 30), ring('loop-b', -60, 60, 10)]): { plan: LevelPlan; base: PopulationPlan } {
  const plan: LevelPlan = { id: 'density-fixture', spawn: { position: { x: -80, y: 0, z: -80 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: {
      originX: -100, originZ: -100, spacing: 1, columns: 201, rows: 201,
      heights: new Array<number>(201 * 201).fill(0),
      surfaces: new Array<SurfaceId>(200 * 200).fill('pavement'),
    }, segments: [{ id: 'lane', entry: { position: { x: 0, y: 0, z: -90 }, headingY: 0,
      halfWidth: 9, surface: 'pavement', gradient: 0 }, exit: { position: { x: 0, y: 0, z: 90 },
      headingY: 0, halfWidth: 9, surface: 'pavement', gradient: 0 }, colliders: [] }], checkpoints: [] };
  return { plan, base: buildPopulationPlan(plan, rings) };
}

/** Two loops past `compactLoopMetres` (r 40 m, about 251 m), where only the spacing rule decides. */
const wideFixture = () => fixture([ring('loop-a', 0, -55, 40), ring('loop-b', 0, 50, 40)]);

const traffic = (layer: string, maximumTrafficVehicles: number): PopulationDensityLayer =>
  ({ layer, maximumPeople: 0, maximumTrafficVehicles });

test('the fixture starts from one living-r1 vehicle at 0.3 of each loop', () => {
  const { base } = fixture();
  const loops = base.paths.filter(path => path.role === 'traffic' && path.closed);
  assert.deepEqual(loops.map(path => path.id), ['loop-a/clear-0', 'loop-b/clear-0']);
  assert.deepEqual(base.actors.map(actor => [actor.pathId, actor.initialDistanceMetres]),
    loops.map(path => [path.id, path.lengthMetres * 0.3]));
});

test('extra traffic takes dyadic stations from the base station, never inside the headway, until the loop is out of them', () => {
  // One long loop (r 40 m, about 251 m, past `compactLoopMetres`): halves,
  // quarters and eighths (31 m apart) fit; sixteenths (16 m) never do.
  const { plan, base } = fixture([ring('loop-long', 0, 0, 40)]);
  const [path] = base.paths.filter(item => item.role === 'traffic');
  assert.ok(path.lengthMetres >= POPULATION_DENSITY.compactLoopMetres);
  const density = authorPopulationDensity(plan, base, [traffic('all', 100)]);
  const station = (offset: number) => path.lengthMetres * ((0.3 + offset) % 1);
  assert.deepEqual(density.actors.map(actor => actor.initialDistanceMetres),
    [1 / 2, 1 / 4, 3 / 4, 1 / 8, 3 / 8, 5 / 8, 7 / 8].map(station));
  const stations = [...base.actors, ...density.actors].map(actor => actor.initialDistanceMetres);
  for (const one of stations) for (const two of stations) {
    if (one === two) continue;
    const gap = Math.abs(one - two) % path.lengthMetres;
    assert.ok(Math.min(gap, path.lengthMetres - gap) >= POPULATION_DENSITY.minimumTrafficHeadwayMetres,
      `${one} and ${two} are inside the headway`);
  }
  for (const actor of density.actors) {
    assert.equal(actor.kind, 'trafficVehicle'); assert.equal(actor.movement, 'loop'); assert.equal(actor.direction, 1);
    assert.equal(actor.layer, 'all');
  }
});

test('a compact loop takes no more than compactLoopMaximumVehicles, its base vehicle included; the rest go by largest spacing', () => {
  const { plan, base } = fixture();
  const [a, b] = base.paths.filter(path => path.role === 'traffic');
  for (const path of [a, b]) assert.ok(path.lengthMetres < POPULATION_DENSITY.compactLoopMetres);
  const density = authorPopulationDensity(plan, base, [traffic('all', 100)]);
  // loop-a's L/2 (94 m) first, then loop-b's (31 m); both are then full.
  assert.equal(POPULATION_DENSITY.compactLoopMaximumVehicles, 2);
  assert.deepEqual(density.actors.map(actor => actor.pathId), [a.id, b.id]);
  assert.deepEqual(density.actors.map(actor => actor.initialDistanceMetres),
    [a.lengthMetres * 0.8, b.lengthMetres * 0.8]);
});

test('layers are cumulative totals; each later layer only appends, and a lone layer equals its prefix', () => {
  const { plan, base } = wideFixture(), before = planDigest(plan);
  const layered = authorPopulationDensity(plan, base, [traffic('four', 4), traffic('five', 5), traffic('same', 5),
    traffic('six', 6), traffic('lower', 3)]);
  assert.deepEqual(layered.actors.map(actor => actor.layer), ['four', 'four', 'five', 'six']);
  const four = authorPopulationDensity(plan, base, [traffic('four', 4)]);
  assert.deepEqual(four.actors, layered.actors.slice(0, 2));
  const again = authorPopulationDensity(plan, base, [traffic('four', 4), traffic('five', 5), traffic('same', 5),
    traffic('six', 6), traffic('lower', 3)]);
  assert.equal(JSON.stringify(again), JSON.stringify(layered), 'bit for bit');
  assert.equal(planDigest(plan), before, 'authoring never writes its plan');
  // A layer that admitted nothing has no place in the appearance order.
  assert.throws(() => populationRosterFromLayers(base, layered, 'same'), RangeError);
  const toFive = populationRosterFromLayers(base, layered, 'five');
  assert.equal(toFive.actors.length, base.actors.length + 3);
  assert.equal(toFive.densityLayer, 'five');
  assert.equal(populationRosterFromLayers(base, layered, 'five'), toFive, 'memoised');
  assert.deepEqual(populationRosterFromLayers(base, layered, 'six').actors.slice(0, toFive.actors.length), toFive.actors);
});

test('the sliced authoring yields only slices and returns exactly the synchronous layer', () => {
  const { plan, base } = fixture();
  const steps = authorPopulationDensitySteps(plan, base, [traffic('all', 100)]);
  let slices = 0, step = steps.next();
  for (; !step.done; step = steps.next()) { assert.equal(step.value, PREPARATION_SLICE); slices += 1; }
  assert.ok(slices > 1, `expected several slices, saw ${slices}`);
  assert.deepStrictEqual(step.value, authorPopulationDensity(plan, base, [traffic('all', 100)]));
});

test('a roster shares the base plan, appends plain extras up to its layer and is memoised', () => {
  const { plan, base } = wideFixture();
  assert.equal(populationRoster(base, 'high'), base, 'no density: every layer is the base plan');
  const density = authorPopulationDensity(plan, base, [traffic('medium', 3), traffic('high', 5)]);
  const plan2: PopulationPlan = { ...base, density };
  assert.equal(populationRoster(plan2, 'base'), plan2);
  const medium = populationRoster(plan2, 'medium'), high = populationRoster(plan2, 'high');
  assert.equal(populationRoster(plan2, 'medium'), medium);
  assert.equal(populationRoster(plan2, 'high'), high);
  assert.equal(medium.actors.length, base.actors.length + 1);
  assert.equal(high.actors.length, base.actors.length + 3);
  assert.deepEqual(high.actors.slice(0, medium.actors.length), medium.actors);
  assert.deepEqual(medium.actors.slice(0, base.actors.length), base.actors);
  for (const roster of [medium, high]) {
    assert.equal(roster.paths, base.paths); assert.equal(roster.anchors, base.anchors);
    assert.equal(roster.crossings, base.crossings); assert.equal(roster.report, base.report);
    assert.equal(roster.density, density); assert.equal(roster.vehicleFollowing, 'living-r2');
    assert.equal(roster.installedWorldId, base.installedWorldId);
    assert.notEqual(roster.contentDigest, base.contentDigest);
    assert.ok(roster.actors.every(actor => !('layer' in actor)), 'roster actors are plain ActorSpec objects');
  }
  assert.notEqual(medium.contentDigest, high.contentDigest);
  assert.equal(medium.densityLayer, 'medium'); assert.equal(high.densityLayer, 'high');
  assert.equal(plan2.vehicleFollowing, undefined, 'the base plan keeps the living-r1 vehicle rules');
  // A roster handed back resolves to its base plan.
  assert.equal(populationRoster(medium, 'high'), high);
  assert.equal(populationRoster(high, 'base'), plan2);
  assert.throws(() => populationRoster(structuredClone(medium), 'high'), /base population plan/);
});

test('the production layers come from POPULATION_DENSITY, in order', () => {
  assert.deepEqual(POPULATION_DENSITY_LAYERS.map(layer => layer.layer), ['medium', 'high']);
  for (const layer of POPULATION_DENSITY_LAYERS) {
    const caps = POPULATION_DENSITY[layer.layer as 'medium' | 'high'];
    assert.equal(layer.maximumPeople, caps.maximumPeople);
    assert.equal(layer.maximumTrafficVehicles, caps.maximumTrafficVehicles);
  }
  assert.ok(POPULATION_DENSITY.socialGroupSpacingMetres >= POPULATION_AUTHORING.socialSpacingMetres);
  assert.ok(POPULATION_DENSITY.socialGroupMinimumSize >= 2
    && POPULATION_DENSITY.socialGroupMaximumSize >= POPULATION_DENSITY.socialGroupMinimumSize);
  assert.ok(POPULATION_DENSITY.high.maximumPeople >= POPULATION_DENSITY.medium.maximumPeople);
  assert.ok(POPULATION_DENSITY.high.maximumTrafficVehicles >= POPULATION_DENSITY.medium.maximumTrafficVehicles);
});

test('authored activity rosters, foreign plans and malformed layers are refused', () => {
  const wharf = createLevel('euclaude');
  const roster = buildPopulationPlan(wharf, wharf.populationPaths);
  assert.ok(roster.actors.length > 0);
  assert.throws(() => authorPopulationDensity(wharf, roster, POPULATION_DENSITY_LAYERS), RangeError);
  const { plan, base } = fixture();
  assert.throws(() => authorPopulationDensity({ ...plan, id: 'another-world' }, base, POPULATION_DENSITY_LAYERS),
    /built for/);
  for (const layers of [[traffic('x', 2), traffic('x', 3)], [traffic('', 2)], [traffic('x', -1)], [traffic('x', 1.5)]]) {
    assert.throws(() => authorPopulationDensity(plan, base, layers), RangeError);
  }
});
