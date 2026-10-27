/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * M47 living-r2 traffic rules on small fixture loops (`POPULATION_TRAFFIC`,
 * `vehicleFollowing: 'living-r2'`): following a leader by path distance, the
 * crossing a vehicle cannot clear, a loop that crosses itself (a neck), and a
 * lone vehicle that the rules leave exactly as the living-r1 rules drive it.
 * The dense generated towns are `app/populationDenseCensus.test.ts`.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { POPULATION_TRAFFIC } from '../data/tuning.ts';
import { PopulationSimulation, sweepPopulationHulls, type PopulationActorPose } from './population.ts';
import type { TerrainSampler } from './world.ts';

const STEP = 1 / 60;
const S0 = POPULATION_TRAFFIC.standstillGapMetres;
const HULL = { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 };
const flat: TerrainSampler = {
  sampleGround(_x, _z, out) {
    out.height = 0; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0;
    out.surface = 'pavement'; out.offCourse = false; return out;
  },
  raycast() { return null; },
};
/** A closed path through `count` samples of `at(t)`, t in [0, 1), distances measured along it. */
function closedPath(id: string, count: number, at: (t: number) => { x: number; z: number }): PopulationPath {
  const raw = Array.from({ length: count + 1 }, (_, index) => at(index === count ? 0 : index / count));
  let distance = 0;
  const points = raw.map((point, index) => {
    if (index > 0) distance += Math.hypot(point.x - raw[index - 1].x, point.z - raw[index - 1].z);
    const next = raw[index === count ? 1 : index + 1];
    return { x: point.x, y: 0, z: point.z, headingY: Math.atan2(next.x - point.x, next.z - point.z),
      distanceMetres: distance, surface: 'pavement' as const, sourceSegmentId: `${id}/source` };
  });
  // The seam's heading is the first point's, unwrapped to stay continuous.
  const last = points[points.length - 1];
  points[points.length - 1] = { ...last, headingY: points[0].headingY + 2 * Math.PI * Math.round((last.headingY - points[0].headingY) / (2 * Math.PI)) };
  return { id, role: 'traffic', district: 'commercial', points, lengthMetres: distance, closed: true,
    serviceShuttle: false, clearanceRadiusMetres: 3, connections: [] };
}
const RADIUS = 40;
const ring = (): PopulationPath => closedPath('ring', 512, t => ({ x: Math.sin(t * 2 * Math.PI) * RADIUS, z: Math.cos(t * 2 * Math.PI) * RADIUS }));
/** The ring's own pose at a distance (its points are dense enough to read straight off). */
function ringPoint(path: PopulationPath, along: number): { x: number; z: number; headingY: number } {
  const point = path.points.reduce((best, value) => Math.abs(value.distanceMetres - along) < Math.abs(best.distanceMetres - along) ? value : best);
  return { x: point.x, z: point.z, headingY: point.headingY };
}
function car(id: string, pathId: string, at: number): ActorSpec {
  return { id, kind: 'trafficVehicle', pathId, initialDistanceMetres: at, direction: 1, movement: 'loop',
    speedMetresPerSecond: 5.5, idleSeconds: 0, appearanceIndex: 0, hull: { ...HULL } };
}
/** A parked van standing in the ring's lane at `at`, on its own two-point service stub: something a vehicle must stop for. */
function blockage(path: PopulationPath, at: number): { path: PopulationPath; actor: ActorSpec } {
  const point = ringPoint(path, at), dx = Math.sin(point.headingY), dz = Math.cos(point.headingY);
  const stub: PopulationPath = { id: 'stub', role: 'service', district: 'industrial', closed: false, serviceShuttle: true,
    clearanceRadiusMetres: 3, connections: [], lengthMetres: 2,
    points: [-1, 1].map((offset, index) => ({ x: point.x + dx * offset, y: 0, z: point.z + dz * offset, headingY: point.headingY,
      distanceMetres: index * 2, surface: 'pavement' as const, sourceSegmentId: 'stub/source' })) };
  return { path: stub, actor: { id: 'parked', kind: 'parkedVehicle', pathId: 'stub', initialDistanceMetres: 1, direction: 1,
    movement: 'stationary', speedMetresPerSecond: 0, idleSeconds: 0, appearanceIndex: 0, hull: { ...HULL } } };
}
function plan(paths: readonly PopulationPath[], actors: readonly ActorSpec[], following: boolean,
  crossings?: PopulationPlan['crossings']): PopulationPlan {
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'following-test', installedWorldId: 'following-test/living-r1',
    contentDigest: 'fixture', paths, actors, anchors: [], ...(crossings ? { crossings } : {}),
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] },
    ...(following ? { vehicleFollowing: 'living-r2' as const } : {}) };
}
const empty = { components: [], incompleteOwnerIds: [] };
const pose = (simulation: PopulationSimulation, id: string): PopulationActorPose => simulation.snapshot().actors.find(value => value.id === id)!;
/** Bumper gap from `follower` to `leader` along a loop of `length`. */
const bumperGap = (follower: PopulationActorPose, leader: PopulationActorPose, length: number): number =>
  ((leader.distanceMetres - follower.distanceMetres) % length + length) % length - 2 * HULL.halfLengthMetres;

test('a follower closes on a stopped leader smoothly and stands the standstill gap behind it', () => {
  const road = ring(), stop = blockage(road, 95);
  const simulation = new PopulationSimulation(plan([road, stop.path], [car('follower', 'ring', 0), car('leader', 'ring', 60), stop.actor], true), flat);
  let braking = false, previousSpeed = 0, rises = 0, smallest = Infinity;
  for (let step = 0; step < 60 / STEP; step += 1) {
    simulation.step(STEP, [], [], empty);
    const follower = pose(simulation, 'follower'), leader = pose(simulation, 'leader');
    const gap = bumperGap(follower, leader, road.lengthMetres);
    smallest = Math.min(smallest, gap);
    // Once it brakes for the standing leader it never speeds up again: no stop-and-go.
    if (leader.speedMetresPerSecond === 0 && follower.speedMetresPerSecond < previousSpeed - 1e-9) braking = true;
    if (braking && follower.speedMetresPerSecond > previousSpeed + 1e-6) rises += 1;
    assert.ok(previousSpeed - follower.speedMetresPerSecond <= 2.5 * STEP + 1e-9, `braked harder than the vans can at ${(step * STEP).toFixed(2)} s`);
    previousSpeed = follower.speedMetresPerSecond;
  }
  const follower = pose(simulation, 'follower'), leader = pose(simulation, 'leader');
  assert.equal(leader.speedMetresPerSecond, 0, 'the fixture leader stands at the parked van');
  assert.ok(braking, 'the follower braked for it');
  assert.equal(rises, 0, 'and never sped up again while closing');
  assert.ok(follower.speedMetresPerSecond < 0.05, `the follower stood still (${follower.speedMetresPerSecond} m/s)`);
  const gap = bumperGap(follower, leader, road.lengthMetres);
  assert.ok(smallest >= S0 - 0.05, `it never came nearer than the standstill gap (${smallest.toFixed(3)} m)`);
  assert.ok(gap <= S0 + 0.5, `it closed up to the standstill gap (${gap.toFixed(3)} m)`);
});

test('three close vehicles on one loop settle at the following law\'s own gaps and never stop, touch or come within the standstill gap', () => {
  const road = ring();
  const simulation = new PopulationSimulation(plan([road], [car('a', 'ring', 0), car('b', 'ring', 9), car('c', 'ring', 18)], true), flat);
  let smallest = Infinity;
  for (let step = 0; step < 90 / STEP; step += 1) {
    simulation.step(STEP, [], [], empty);
    const poses = ['a', 'b', 'c'].map(id => pose(simulation, id));
    for (let k = 0; k < 3; k += 1) {
      const ahead = poses.map(other => other === poses[k] ? Infinity : bumperGap(poses[k], other, road.lengthMetres));
      smallest = Math.min(smallest, Math.min(...ahead));
      for (let j = k + 1; j < 3; j += 1) {
        assert.equal(sweepPopulationHulls(poses[k].footprint, poses[k].footprint, poses[j].footprint, poses[j].footprint), null, 'two vans overlap');
      }
      if (step * STEP > 5) assert.ok(poses[k].speedMetresPerSecond > 0.5, `${poses[k].id} stopped at ${(step * STEP).toFixed(1)} s`);
    }
  }
  assert.ok(smallest >= S0 - 0.05, `standstill gap kept (${smallest.toFixed(3)} m)`);
  // The two that follow sit at the law's steady gap for their speed: s*(v) / sqrt(1 - (v/v0)^4).
  // (The living-r1 rules leave them about half of it: 13 m where the law keeps 25 m.)
  const [a, b, c] = ['a', 'b', 'c'].map(id => pose(simulation, id));
  for (const [follower, leader] of [[a, b], [b, c]] as const) {
    const v = follower.speedMetresPerSecond, steady = (S0 + v * POPULATION_TRAFFIC.headwaySeconds) / Math.sqrt(1 - (v / 5.5) ** 4);
    const gap = bumperGap(follower, leader, road.lengthMetres);
    assert.ok(Math.abs(gap - steady) < 0.15 * steady, `${follower.id} follows at ${gap.toFixed(1)} m, the law's ${steady.toFixed(1)} m at ${v.toFixed(2)} m/s`);
  }
  for (const value of [a, b, c]) assert.ok(value.wheelTravelMetres > 300, `each van covers ground (${value.wheelTravelMetres.toFixed(0)} m)`);
});

test('a lone vehicle on its loop drives exactly as under the living-r1 rules', () => {
  const road = ring();
  const actors = [car('alone', 'ring', 30)];
  const r2 = new PopulationSimulation(plan([road], actors, true), flat), r1 = new PopulationSimulation(plan([road], actors, false), flat);
  for (let step = 0; step < 30 / STEP; step += 1) {
    r2.step(STEP, [], [], empty); r1.step(STEP, [], [], empty);
    assert.deepEqual(r2.snapshot(), r1.snapshot(), `step ${step}`);
    assert.deepEqual(r2.anticipationState(), r1.anticipationState(), `step ${step} anticipation`);
  }
});

test('a vehicle that could not clear a crossing behind a standing leader stops short of it, and drives over it with room', () => {
  const road = ring();
  // A pad across the lane about 50 m round; the leader stands just past it, too close for the follower to clear it.
  const centre = ringPoint(road, 50), cx = Math.sin(centre.headingY), cz = Math.cos(centre.headingY), lx = cz, lz = -cx;
  const corners = [[-2, -4], [2, -4], [2, 4], [-2, 4]].map(([along, across]) => ({ x: centre.x + cx * along + lx * across, z: centre.z + cz * along + lz * across }));
  const pavement: PopulationPath = { id: 'pavement', role: 'pedestrian', district: 'commercial', closed: false, serviceShuttle: false,
    clearanceRadiusMetres: 3, connections: [], lengthMetres: 20, points: [-10, 10].map((offset, index) => ({
      x: centre.x + lx * offset, y: 0, z: centre.z + lz * offset, headingY: Math.atan2(lx, lz), distanceMetres: index * 20,
      surface: 'pavement' as const, sourceSegmentId: 'pavement/source' })) };
  // The pad as a body: 2 m either way along the lane, 4 m across it.
  const pad = { x: centre.x, z: centre.z, headingY: centre.headingY, halfWidthMetres: 4, halfLengthMetres: 2, minY: 0, maxY: 3, velocityX: 0, velocityZ: 0 };
  const crossings = [{ id: 'pad', sourceId: 'pad', priority: 'pedestrian' as const, corners, pedestrianPathIds: ['pavement'], vehiclePathIds: ['ring'] }];
  const run = (leaderStop: number | null) => {
    const extra = leaderStop === null ? null : blockage(road, leaderStop);
    const actors = [car('follower', 'ring', 0), car('leader', 'ring', 40), ...(extra ? [extra.actor] : [])];
    const paths = [road, pavement, ...(extra ? [extra.path] : [])];
    const simulation = new PopulationSimulation(plan(paths, actors, true, crossings), flat);
    let overPad = 0;
    for (let step = 0; step < 60 / STEP; step += 1) {
      simulation.step(STEP, [], [], empty);
      const follower = pose(simulation, 'follower'), body = follower.footprint;
      // Standing still with any part of its body on the pad.
      if (follower.speedMetresPerSecond < 0.05 && sweepPopulationHulls(body, body, pad, pad) !== null) overPad += 1;
    }
    return { follower: pose(simulation, 'follower'), leader: pose(simulation, 'leader'), overPad };
  };
  // The parked van at 66 m holds the leader a few metres past the pad's far edge (52 m): no room for the follower beyond it.
  const held = run(66);
  assert.equal(held.leader.speedMetresPerSecond, 0);
  assert.ok(held.follower.speedMetresPerSecond < 0.05, 'the follower stands');
  assert.equal(held.overPad, 0, 'never standing on the pad');
  assert.ok(held.follower.distanceMetres < 50 - 2 - HULL.halfLengthMetres, `it stood short of the pad (centre at ${held.follower.distanceMetres.toFixed(2)} m)`);
  // With the leader far beyond it, the follower drives over the pad on its way round.
  const free = run(null);
  assert.ok(free.follower.wheelTravelMetres > 150, `it drove on over the pad (${free.follower.wheelTravelMetres.toFixed(0)} m)`);
});

test('two vehicles on a loop that crosses itself take the crossing in turn and never touch', () => {
  // A figure of eight: the loop passes through its own middle at right angles.
  const SIZE = 36;
  const eight = closedPath('eight', 720, t => ({ x: SIZE * Math.sin(t * 2 * Math.PI), z: SIZE / 2 * Math.sin(t * 4 * Math.PI) }));
  const half = eight.lengthMetres / 2;
  // Both 12 m short of the middle on its two passes: they would arrive together.
  const actors = [car('one', 'eight', eight.lengthMetres - 12), car('two', 'eight', half - 12)];
  const simulation = new PopulationSimulation(plan([eight], actors, true), flat);
  // Both start from rest; once under way, the one second to the crossing gives way.
  let slowest = Infinity;
  for (let step = 0; step < 120 / STEP; step += 1) {
    simulation.step(STEP, [], [], empty);
    const one = pose(simulation, 'one'), two = pose(simulation, 'two');
    assert.equal(sweepPopulationHulls(one.footprint, one.footprint, two.footprint, two.footprint), null, `the two vans overlap at ${(step * STEP).toFixed(2)} s`);
    if (step * STEP > 3) slowest = Math.min(slowest, one.speedMetresPerSecond, two.speedMetresPerSecond);
  }
  assert.ok(slowest < 0.5, `one of them gave way to the other at the crossing (slowest ${slowest.toFixed(2)} m/s)`);
  for (const id of ['one', 'two']) assert.ok(pose(simulation, id).wheelTravelMetres > 400, `${id} kept going round (${pose(simulation, id).wheelTravelMetres.toFixed(0)} m)`);
});
