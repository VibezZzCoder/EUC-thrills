/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * POP-2 / POP-5 (2026-10-03 environment QA): living actors never wait on each
 * other, or on a body stopped behind them, for the rest of a session.
 *
 * Flat fixtures with the real `PopulationSimulation` at the game's fixed step.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { POPULATION_OCCUPANT, SIMULATION } from '../data/tuning.ts';
import { PopulationSimulation, sweepPopulationHulls, type PopulationFootprint,
  type PopulationOccupant } from './population.ts';
import type { TerrainSampler } from './world.ts';

const STEP = 1 / SIMULATION.hz;
const flat: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};
function path(length: number): PopulationPath {
  return { id: 'walk', role: 'pedestrian', district: 'park', closed: false, serviceShuttle: false,
    points: Array.from({ length: length + 1 }, (_, z) => ({ x: 0, y: 0, z, headingY: 0, distanceMetres: z,
      surface: 'pavement' as const, sourceSegmentId: 'walk/source' })),
    lengthMetres: length, clearanceRadiusMetres: 3, connections: [] };
}
function walker(id: string, at: number, direction: 1 | -1, overrides: Partial<ActorSpec> = {}): ActorSpec {
  return { id, kind: 'walker', pathId: 'walk', initialDistanceMetres: at, direction, movement: 'shuttle',
    speedMetresPerSecond: 1.4, idleSeconds: 1, appearanceIndex: 0,
    hull: { halfWidthMetres: 0.32, halfLengthMetres: 0.28, heightMetres: 1.75 }, ...overrides };
}
function plan(length: number, actors: readonly ActorSpec[]): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'mutual-wait', installedWorldId: 'mutual-wait/living-r1',
    contentDigest: 'mutual-wait', paths: [path(length)], actors, anchors: [],
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
/** A rider's coarse occupancy box standing still at `z` on the walk's line. */
function standing(z: number): PopulationOccupant {
  const body: PopulationFootprint = { x: 0, z, headingY: 0, minY: 0, maxY: POPULATION_OCCUPANT.heightMetres,
    halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
    velocityX: 0, velocityZ: 0 };
  return { id: 'human-0', kind: 'human', previous: body, current: body };
}

/** Longest continuous 'waiting' per actor, the distance each covered, and any hull overlap. */
function census(simulation: PopulationSimulation, seconds: number) {
  const longest = new Map<string, number>(), run = new Map<string, number>(), moved = new Map<string, number>();
  let overlaps = 0;
  let previous = simulation.snapshot().actors;
  for (let step = 0; step < Math.round(seconds / STEP); step += 1) {
    simulation.step(STEP);
    const actors = simulation.snapshot().actors;
    actors.forEach((pose, index) => {
      const waited = pose.activity === 'waiting' ? (run.get(pose.id) ?? 0) + STEP : 0;
      run.set(pose.id, waited);
      longest.set(pose.id, Math.max(longest.get(pose.id) ?? 0, waited));
      moved.set(pose.id, (moved.get(pose.id) ?? 0) + Math.hypot(pose.x - previous[index].x, pose.z - previous[index].z));
    });
    for (let i = 0; i < actors.length; i += 1) for (let j = i + 1; j < actors.length; j += 1) {
      if (sweepPopulationHulls(actors[i].footprint, actors[i].footprint, actors[j].footprint, actors[j].footprint)) overlaps += 1;
    }
    previous = actors;
  }
  return { longest, moved, overlaps };
}

test('a walker walks away from a body stopped just behind it, and still waits for one ahead (POP-5)', () => {
  for (const behind of [1.0, 1.05, 1.2]) {
    const simulation = new PopulationSimulation(plan(40, [walker('w', 20, 1)]), flat);
    for (let step = 0; step < Math.round(4 / STEP); step += 1) simulation.step(STEP, [standing(20 - behind)]);
    const pose = simulation.snapshot().actors[0];
    assert.ok(pose.z > 24, `a body ${behind} m behind froze the walker at z=${pose.z.toFixed(2)} (${pose.activity})`);
  }
  // 2026-10-04 (R2C-5): a body ahead is still waited for, now for a bounded
  // time: a rider who does not move is then stepped round (round 3), or with
  // no room beside the walk, walked away from as a pathmate is.
  for (const room of [true, false]) {
    const sampler: TerrainSampler = room ? flat : { ...flat, sampleGround(x, z, out) { flat.sampleGround(x, z, out); out.offCourse = Math.abs(x) > 0.6; return out; } };
    const ahead = new PopulationSimulation(plan(40, [walker('w', 20, 1)]), sampler), blocker = standing(21.4).current;
    for (let step = 0; step < Math.round(0.4 / STEP); step += 1) ahead.step(STEP, [standing(21.4)]);
    assert.equal(ahead.snapshot().actors[0].z, 20, 'a body ahead is still waited for');
    assert.equal(ahead.snapshot().actors[0].activity, 'waiting');
    for (let step = 0; step < Math.round(6 / STEP); step += 1) {
      ahead.step(STEP, [standing(21.4)]); const body = ahead.snapshot().actors[0].footprint;
      assert.equal(sweepPopulationHulls(body, body, blocker, blocker), null, 'never into the body');
    }
    const pose = ahead.snapshot().actors[0];
    if (room) assert.ok(pose.z > 23, `and after the bounded wait it steps round the body (z=${pose.z.toFixed(2)}, x=${pose.x.toFixed(2)})`);
    else { assert.equal(pose.direction, -1, 'and with no room it turns round'); assert.ok(pose.z < 19.5, 'and walks away'); }
  }
});

test('pathmates meeting head-on part instead of standing nose to nose (POP-2)', () => {
  const fixture = plan(30, [walker('a', 3, 1), walker('b', 27, -1)]);
  const first = new PopulationSimulation(fixture, flat);
  const { longest, moved, overlaps } = census(first, 120);
  for (const id of ['a', 'b']) {
    assert.ok(longest.get(id)! < 10, `${id} waited ${longest.get(id)!.toFixed(1)} s on end`);
    assert.ok(moved.get(id)! > 60, `${id} covered only ${moved.get(id)!.toFixed(1)} m in two minutes`);
  }
  assert.equal(overlaps, 0, 'parting never passes one body through another');
  const second = new PopulationSimulation(fixture, flat);
  census(second, 120);
  assert.deepEqual(second.snapshot(), first.snapshot(), 'the resolution is deterministic');
});

test('a jogger behind a walker who turns at the path end is not locked there (POP-2)', () => {
  for (const actors of [
    [walker('j', 2, 1, { kind: 'jogger', speedMetresPerSecond: 2.8 }), walker('w', 8, 1)],
    [walker('a', 3, 1), walker('b', 12, 1)],
  ]) {
    const { longest, moved, overlaps } = census(new PopulationSimulation(plan(30, actors), flat), 120);
    for (const { id } of actors) {
      assert.ok(longest.get(id)! < 10, `${id} waited ${longest.get(id)!.toFixed(1)} s on end`);
      assert.ok(moved.get(id)! > 60, `${id} covered only ${moved.get(id)!.toFixed(1)} m in two minutes`);
    }
    assert.equal(overlaps, 0);
  }
});

// The chaseprobe pin (2026-10-03): a cop leaning through a turn reaches past
// his coarse occupancy box, and the contact transaction admits by his compact
// parts. A walker that waited on the box alone stepped into his side, and the
// two held each other still for the rest of the run.
test('a walker waits on a rider’s leaning body, not only on his coarse box', () => {
  const coarse: PopulationFootprint = { x: 1.25, z: 25, headingY: 0, minY: 0, maxY: POPULATION_OCCUPANT.heightMetres,
    halfWidthMetres: POPULATION_OCCUPANT.halfWidthMetres, halfLengthMetres: POPULATION_OCCUPANT.halfLengthMetres,
    velocityX: 0, velocityZ: 0 };
  const cop: PopulationOccupant = { id: 'cop-0', kind: 'cop', previous: coarse, current: coarse };
  // Measured in the pin: the body part 0.39 m ahead of the wheel and 0.22 m toward the walk.
  const human: PopulationFootprint = { ...coarse, x: 1.03, z: 25.39, minY: 0.04, maxY: 2.12,
    halfWidthMetres: 0.73, halfLengthMetres: 0.78 };
  const wheel: PopulationFootprint = { ...coarse, maxY: 0.9, halfWidthMetres: 0.2, halfLengthMetres: 0.45 };
  const part = (componentId: string, footprint: PopulationFootprint) => ({ ownerId: cop.id, componentId, footprint,
    observationValid: true, velocityX: 0, velocityZ: 0, expansionMetresPerSecond: 0 });
  const anticipation = { components: [part('wheel', wheel), part('human', human)], incompleteOwnerIds: [] };
  const run = (withParts: boolean) => {
    const simulation = new PopulationSimulation(plan(40, [walker('w', 20, 1)]), flat);
    let touched = 0;
    for (let step = 0; step < Math.round(6 / STEP); step += 1) {
      simulation.step(STEP, [cop], [], withParts ? anticipation : undefined);
      const body = simulation.snapshot().actors[0].footprint;
      if (sweepPopulationHulls(body, body, human, human)) touched += 1;
    }
    return { z: simulation.snapshot().actors[0].z, touched };
  };
  // The fixture: the coarse box alone leaves the walker its walk, through the body.
  const boxOnly = run(false);
  assert.ok(boxOnly.z > 27 && boxOnly.touched > 0, `the box alone: z=${boxOnly.z.toFixed(2)}, touched ${boxOnly.touched}`);
  const parts = run(true);
  assert.equal(parts.touched, 0, 'walked into the leaning body');
  assert.ok(parts.z < 25, `walked on past the cop to z=${parts.z.toFixed(2)}`);
});

test('an NPC wheel waits for a rider in its lane, never turning through him (2026-10-04)', () => {
  // Browser m7 long ride: an NPC wheel rider turned round while the player
  // touched it, its square swept into him, and it froze mid-turn with his
  // reverse refused. Only walkers and joggers step aside or turn round for a
  // rider; an NPC wheel waits, touching him or not, as before R2C-5.
  const wheel = walker('npc', 20, 1, { kind: 'fictionalEuc', speedMetresPerSecond: 3.8,
    hull: { halfWidthMetres: 0.65, halfLengthMetres: 0.65, heightMetres: 2.1 } });
  for (const gap of [0.02, 0.9]) {
    const simulation = new PopulationSimulation(plan(40, [wheel]), flat);
    const rider = standing(20 + 0.65 + POPULATION_OCCUPANT.halfLengthMetres + gap);
    for (let step = 0; step < Math.round(8 / STEP); step += 1) {
      simulation.step(STEP, [rider]);
      const pose = simulation.snapshot().actors[0];
      assert.equal(pose.direction, 1, `${gap} m: turned round for the rider (${pose.activity})`);
      assert.equal(sweepPopulationHulls(pose.footprint, pose.footprint, rider.current, rider.current), null, 'never into the rider');
    }
  }
});
