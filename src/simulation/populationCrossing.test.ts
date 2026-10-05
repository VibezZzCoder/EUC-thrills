/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Physical crossing behavior on factual authored priority; no render clock. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { PopulationSimulation, sweepPopulationHulls } from './population.ts';
import type { TerrainSampler } from './world.ts';

const STEP = 0.05;
const flat: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};
function crossingFixture(priority = true, reverseOrder = false): PopulationPlan {
  const paths: PopulationPath[] = [
    { id: 'sidewalk', role: 'pedestrian', district: 'commercial',
      points: [-15, 0, 15].map((x, index) => ({ x, y: 0, z: 0, headingY: Math.PI / 2,
        distanceMetres: index * 15, surface: 'pavement', sourceSegmentId: 'driveway' })),
      lengthMetres: 30, closed: false, serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] },
    { id: 'service', role: 'service', district: 'industrial',
      points: [-20, 0, 20].map((z, index) => ({ x: 0, y: 0, z, headingY: 0,
        distanceMetres: index * 20, surface: 'pavement', sourceSegmentId: 'driveway' })),
      lengthMetres: 40, closed: false, serviceShuttle: true, clearanceRadiusMetres: 3, connections: [] },
  ];
  const actors: ActorSpec[] = [
    { id: 'person', kind: 'walker', pathId: 'sidewalk', initialDistanceMetres: 12,
      direction: 1, movement: 'shuttle', speedMetresPerSecond: 1.5, idleSeconds: 0.2, appearanceIndex: 0,
      hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } },
    { id: 'van', kind: 'serviceVehicle', pathId: 'service', initialDistanceMetres: 11,
      direction: 1, movement: 'shuttle', speedMetresPerSecond: 5, idleSeconds: 0.2, appearanceIndex: 0,
      hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } },
  ];
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'crossing-test',
    installedWorldId: 'crossing-test/living-r1', contentDigest: 'fixture', paths,
    actors: reverseOrder ? [...actors].reverse() : actors, anchors: [],
    ...(priority ? { crossings: [{ id: 'accepted-driveway', sourceId: 'driveway', priority: 'pedestrian' as const,
      corners: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
      pedestrianPathIds: ['sidewalk'], vehiclePathIds: ['service'] }] } : {}),
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}

test('accepted pedestrian priority holds the service van while the person crosses, then releases it', () => {
  const simulation = new PopulationSimulation(crossingFixture(), flat);
  let personCrossed = false, vehicleReleased = false, heldFrames = 0;
  for (let tick = 0; tick < 150; tick++) {
    simulation.step(STEP); simulation.queryContacts([]);
    const poses = simulation.snapshot().actors;
    const person = poses.find(pose => pose.id === 'person')!, van = poses.find(pose => pose.id === 'van')!;
    assert.equal(sweepPopulationHulls(person.footprint, person.footprint, van.footprint, van.footprint), null);
    if (person.x < 2.6) {
      assert.equal(van.z, -9, 'the approaching van yields before entering the crossing');
      heldFrames++;
    } else personCrossed = true;
    if (personCrossed && van.z > -8) vehicleReleased = true;
  }
  assert.ok(heldFrames > 40, 'priority must change actual movement for the crossing duration');
  assert.ok(personCrossed && vehicleReleased, 'neither participant may deadlock after the crossing');
});

test('crossing priority is independent of actor iteration order and absent path ids grant none', () => {
  const a = new PopulationSimulation(crossingFixture(), flat);
  const b = new PopulationSimulation(crossingFixture(true, true), flat);
  const bad = crossingFixture();
  const without = new PopulationSimulation(crossingFixture(false), flat);
  const unmatched = new PopulationSimulation({ ...bad, crossings: bad.crossings!.map(crossing => ({ ...crossing,
    pedestrianPathIds: ['absent-pedestrian'] })) }, flat);
  const positions = (simulation: PopulationSimulation) => simulation.snapshot().actors.map(pose => ({
    id: pose.id, x: pose.x, z: pose.z, speed: pose.speedMetresPerSecond, activity: pose.activity,
  })).sort((left, right) => left.id.localeCompare(right.id));
  for (let tick = 0; tick < 80; tick++) {
    for (const simulation of [a, b, without, unmatched]) {
      simulation.step(STEP); simulation.queryContacts([]);
    }
    assert.deepEqual(positions(a), positions(b));
    assert.deepEqual(positions(unmatched), positions(without));
  }
  assert.notDeepEqual(positions(a), positions(without), 'an authored crossing must materially alter the encounter');
});
