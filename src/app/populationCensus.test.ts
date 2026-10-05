/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * POP-2 census (2026-10-03 environment QA): ten minutes of the curated city
 * with nobody riding. Before the repair seven of its 28 actors stood frozen
 * for the session — both crossing walkers in two districts and the park's
 * jogger and walker met head-on, and the warehouse van waited on its worker
 * from the first tick.
 *
 * The world is prepared exactly as `Game` installs it and stepped with the
 * empty compact-anticipation census `Game` hands the population when moving
 * vehicles exist and no rider is placed. The step is 1/60 s rather than the
 * game's 1/120 to halve the cost; BASE2 freezes the same actors at either rate.
 *
 * The bounds are what the repaired city does, with room: a person never
 * waits 12 s on end (the longest is a jogger's 8.4 s, queued behind a walker
 * pausing and turning at the end of their shared path). A vehicle may yield
 * for up to 30 s: an authored pedestrian-priority crossing holds the
 * entry-neighbourhood car 12.2 s early on, and the side-street car waits
 * 19.4 s while two walkers walk to, turn at and leave the end of a sidewalk
 * inside its route — yields that end, both present before the repair. A
 * deadlock lasts the rest of the session.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createLevel } from '../level/levels.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { PopulationSimulation } from '../simulation/population.ts';
import { preparePopulationWorld } from './populationWorld.ts';

const STEP = 1 / 60;
const SECONDS = 600;
const LONGEST_PERSON_WAIT_SECONDS = 12;
const LONGEST_VEHICLE_WAIT_SECONDS = 30;

test('ten minutes of the euc city with no riders: every moving actor keeps moving', { timeout: 900_000 }, () => {
  const living = preparePopulationWorld(createLevel('generated', 'euc'));
  const moving = new Set(living.population.actors.filter(actor => actor.movement !== 'stationary').map(actor => actor.id));
  const vehicles = new Set(living.population.actors.filter(actor => actor.kind === 'serviceVehicle'
    || actor.kind === 'trafficVehicle').map(actor => actor.id));
  assert.ok(moving.size >= 20, 'the census needs the city\'s moving roster');
  const simulation = new PopulationSimulation(living.population, new PlanTerrainSampler(living.level));
  const anticipation = { components: [], incompleteOwnerIds: [] };
  const run = new Map<string, number>(), longest = new Map<string, number>(), moved = new Map<string, number>();
  let previous = simulation.snapshot().actors;
  for (let step = 0; step < Math.round(SECONDS / STEP); step += 1) {
    simulation.step(STEP, [], [], anticipation);
    const actors = simulation.snapshot().actors;
    actors.forEach((pose, index) => {
      if (!moving.has(pose.id)) return;
      const waited = pose.activity === 'waiting' ? (run.get(pose.id) ?? 0) + STEP : 0;
      run.set(pose.id, waited);
      longest.set(pose.id, Math.max(longest.get(pose.id) ?? 0, waited));
      moved.set(pose.id, (moved.get(pose.id) ?? 0) + Math.hypot(pose.x - previous[index].x, pose.z - previous[index].z));
    });
    previous = actors;
  }
  const frozen = [...longest].filter(([id, seconds]) => seconds
    > (vehicles.has(id) ? LONGEST_VEHICLE_WAIT_SECONDS : LONGEST_PERSON_WAIT_SECONDS))
    .map(([id, seconds]) => `${id} waited ${seconds.toFixed(1)} s`);
  assert.deepEqual(frozen, [], 'no moving actor stands waiting on and on');
  const still = [...moving].filter(id => (moved.get(id) ?? 0) < 40).map(id => `${id} moved ${(moved.get(id) ?? 0).toFixed(1)} m`);
  assert.deepEqual(still, [], 'every moving actor covers ground, the warehouse van included');
});
