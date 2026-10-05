/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { POPULATION_AMBIENCE as T } from '../data/tuning.ts';
import type { ActorSpec, PopulationPlan } from '../level/populationPlan.ts';
import type { PopulationRenderSnapshot } from '../render/populationView.ts';
import { populationAudioEmitters, updatePopulationAudio } from './populationAudio.ts';

function fixture(): PopulationPlan {
  const actors: ActorSpec[] = Array.from({ length: 30 }, (_, index) => ({
    id: `person-${String(index).padStart(2, '0')}`, kind: 'walker', pathId: 'walk',
    initialDistanceMetres: 0, direction: 1, movement: 'shuttle', speedMetresPerSecond: 1,
    idleSeconds: 0, appearanceIndex: 0, hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } }));
  actors.push({ ...actors[0], id: 'quiet-parked', kind: 'parkedVehicle', movement: 'stationary' },
    { ...actors[0], id: 'moving-van', kind: 'trafficVehicle', movement: 'loop' });
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'world', installedWorldId: 'world/living',
    contentDigest: 'fixture', paths: [{ id: 'walk', role: 'pedestrian', district: 'commercial',
      points: [{ x: 0, y: 0, z: 0, headingY: 0, distanceMetres: 0, surface: 'pavement', sourceSegmentId: 'street' }],
      lengthMetres: 0, closed: false, serviceShuttle: false, clearanceRadiusMetres: 2, connections: [] }],
    actors, anchors: [], report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}

test('outdoor beds are bounded, prioritize real moving vehicles, and omit silent parked vehicles', () => {
  const plan = fixture(), emitters = populationAudioEmitters(plan);
  assert.equal(emitters.length, T.maximumEmitters);
  assert.equal(emitters[0].id, 'population-audio/moving-van');
  assert.equal(emitters[0].kind, 'industrial');
  assert.ok(!emitters.some(emitter => emitter.id.includes('quiet-parked')));
  assert.ok(emitters.every(emitter => emitter.strength === 0));
  assert.deepEqual(populationAudioEmitters({ ...plan, actors: [...plan.actors].reverse() }), emitters);
});

test('one frame supplies the same interpolated actor source and signed backing speed magnitude', () => {
  const pose = { id: 'van', kind: 'serviceVehicle' as const, x: 8, y: 1, z: 4, headingY: 0,
    speedMetresPerSecond: -4, gaitDistanceMetres: 0, activity: 'backing', activityPhase: 0,
    activityBlend: 1, backing: true };
  const previous: PopulationRenderSnapshot = { tick: 1, clockSeconds: 1, actors: [{ ...pose, x: 0, y: 0, z: 0 }] };
  const current: PopulationRenderSnapshot = { tick: 2, clockSeconds: 2, actors: [pose] };
  const calls: unknown[][] = [];
  updatePopulationAudio({ updateAmbienceEmitter(...args) { calls.push(args); return true; } }, previous, current, 0.25);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].slice(0, 4), ['population-audio/van', 2, T.sourceHeightMetres + 0.25, 1]);
  assert.ok(Math.abs(Number(calls[0][4]) - 0.4) < 1e-12);
  assert.equal(current.actors[0], pose);
});
