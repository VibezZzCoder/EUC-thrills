/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { planDigest } from '../level/planDigest.ts';
import { POPULATION_AUTHORING } from '../data/tuning.ts';
import { preparePopulationWorld } from './populationWorld.ts';

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
