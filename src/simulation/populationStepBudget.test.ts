/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The living world's fixed step is paid 120 times a second on every tier, so
 * its work is pinned as counts (RP-1/RP-2, 2026-10-03). The crossing fixture
 * is dense on purpose: every walker shares crossings with every vehicle, the
 * case whose pedestrian-priority forecasts used to be recomputed per pair.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { PopulationSimulation, type PopulationOccupant } from './population.ts';
import type { TerrainSampler } from './world.ts';

const STEP = 1 / 120;
function counted(): { sampler: TerrainSampler; calls: () => number } {
  let calls = 0;
  return { calls: () => calls, sampler: {
    sampleGround(x, z, out) {
      calls += 1;
      out.height = 0.02 * Math.sin(x * 0.3) + 0.015 * Math.cos(z * 0.2);
      const nx = -0.006 * Math.cos(x * 0.3), nz = 0.003 * Math.sin(z * 0.2), length = Math.hypot(nx, 1, nz);
      out.normal.x = nx / length; out.normal.y = 1 / length; out.normal.z = nz / length;
      out.surface = 'pavement'; out.offCourse = false; return out;
    },
    raycast() { return null; },
  } };
}
const line = (id: string, role: PopulationPath['role'], from: [number, number], to: [number, number]): PopulationPath => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]), heading = Math.atan2(to[0] - from[0], to[1] - from[1]);
  return { id, role, district: 'commercial', lengthMetres: length, closed: false, serviceShuttle: role === 'service',
    clearanceRadiusMetres: 3, connections: [],
    points: [0, 0.5, 1].map((t, index) => ({ x: from[0] + (to[0] - from[0]) * t, y: 0, z: from[1] + (to[1] - from[1]) * t,
      headingY: heading, distanceMetres: length * [0, 0.5, 1][index], surface: 'pavement', sourceSegmentId: 'driveway' })) };
};
const walker = (id: string, pathId: string, at: number, direction: 1 | -1): ActorSpec => ({ id, kind: 'walker', pathId,
  initialDistanceMetres: at, direction, movement: 'shuttle', speedMetresPerSecond: 1.4, idleSeconds: 0.3, appearanceIndex: 0,
  hull: { halfWidthMetres: 0.42, halfLengthMetres: 0.42, heightMetres: 1.9 } });
const van = (id: string, pathId: string, at: number): ActorSpec => ({ id, kind: 'serviceVehicle', pathId,
  initialDistanceMetres: at, direction: 1, movement: 'shuttle', speedMetresPerSecond: 5, idleSeconds: 0.4, appearanceIndex: 0,
  hull: { halfWidthMetres: 1.02, halfLengthMetres: 2.4, heightMetres: 2.8 } });
const square = (x: number, z: number) => [{ x: x - 2.5, z: z - 2.5 }, { x: x + 2.5, z: z - 2.5 },
  { x: x + 2.5, z: z + 2.5 }, { x: x - 2.5, z: z + 2.5 }];
function denseCrossings(): PopulationPlan {
  const paths = [line('walk-a', 'pedestrian', [-30, 0], [30, 0]), line('walk-b', 'pedestrian', [-30, 12], [30, 12]),
    line('van-x', 'service', [-6, -30], [-6, 40]), line('van-y', 'service', [8, -30], [8, 40])];
  const actors = [walker('w1', 'walk-a', 10, 1), walker('w2', 'walk-a', 30, -1), walker('w3', 'walk-a', 45, 1),
    walker('w4', 'walk-b', 15, 1), walker('w5', 'walk-b', 36, -1), walker('w6', 'walk-b', 50, -1),
    van('v1', 'van-x', 12), van('v2', 'van-y', 20)];
  const crossings = [[-6, 0], [8, 0], [-6, 12], [8, 12]].map(([x, z], index) => ({ id: `crossing-${index}`,
    sourceId: 'driveway', priority: 'pedestrian' as const, corners: square(x, z),
    pedestrianPathIds: [z === 0 ? 'walk-a' : 'walk-b'], vehiclePathIds: [x < 0 ? 'van-x' : 'van-y'] }));
  return { schema: 1, rulesRevision: 'living-r1', sourceWorldId: 'budget-test', installedWorldId: 'budget-test/living-r1',
    contentDigest: 'fixture', paths, actors, anchors: [], crossings,
    report: { missingAuthoredPaths: false, rejected: [], availableKinds: [], missingKinds: [] } };
}
/** A rider who rides the second sidewalk head-on into its walkers and across a van lane. */
function rider(tick: number, previous: PopulationOccupant['current'] | undefined): PopulationOccupant {
  const x = -28 + tick * 4 / 120, body = { x, z: 12, headingY: Math.PI / 2, minY: 0, maxY: 1.9,
    halfWidthMetres: 0.35, halfLengthMetres: 0.55, velocityX: 4, velocityZ: 0 };
  return { id: 'human-0', kind: 'human', previous: previous ?? body, current: body };
}
function digest(value: unknown): string {
  // FNV-1a over every float's bits and every string: a bit-identity fingerprint.
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer); let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ n, 16777619) >>> 0; };
  const walk = (x: unknown): void => {
    if (typeof x === 'number') { f64[0] = x; mix(u32[0]); mix(u32[1]); return; }
    if (typeof x === 'string') { for (let i = 0; i < x.length; i++) mix(x.charCodeAt(i)); return; }
    if (typeof x === 'boolean' || x === null || x === undefined) { mix(x === true ? 3 : x === false ? 4 : x === null ? 1 : 2); return; }
    if (Array.isArray(x)) { mix(9); for (const y of x) walk(y); return; }
    for (const key of Object.keys(x as object).sort()) { walk(key); walk((x as Record<string, unknown>)[key]); }
  };
  walk(value); return h.toString(16);
}

test('pedestrian priority forecasts are computed once per actor state, not once per actor pair', () => {
  const { sampler, calls } = counted();
  const simulation = new PopulationSimulation(denseCrossings(), sampler);
  let body: PopulationOccupant['current'] | undefined, worst = 0;
  for (let tick = 0; tick < 600; tick += 1) {
    const occupant = rider(tick, body); body = occupant.current;
    const before = calls();
    simulation.step(STEP, [occupant]);
    worst = Math.max(worst, calls() - before);
    simulation.queryContacts([occupant]);
  }
  // Eight moving actors: an own forecast, a move candidate and a final pose
  // each (about eight ground samples apiece), plus a priority forecast per
  // participant per actor-state change: 196 on the busiest step. The per-pair
  // recomputation this replaced needed 564.
  assert.ok(worst <= 300, `ground samples in one population step: ${worst}`);
});

test('the bounded step reaches the identical world: poses, activity, contacts and anticipation rows', () => {
  const simulation = new PopulationSimulation(denseCrossings(), counted().sampler);
  const rows: unknown[] = [];
  let body: PopulationOccupant['current'] | undefined;
  for (let tick = 0; tick < 900; tick += 1) {
    const occupant = rider(tick, body); body = occupant.current;
    simulation.step(STEP, [occupant], tick % 300 < 20 ? [{ id: 'human-0/wheel', footprint: occupant.current }] : []);
    rows.push(simulation.snapshot(), simulation.queryContacts([occupant]), simulation.anticipationState());
  }
  // Recorded from the pre-optimisation step (2026-10-03): the budget above must
  // reach this exact world. A deliberate behaviour change re-records it.
  // Re-recorded 2026-10-04 (R2C-5): walkers stalled on the rider now step
  // aside (or, with no room, turn round) after the bounded wait, a turn on the
  // spot clears with its own body and is never stopped by a rider, and a
  // pushing rider's meeting does not recharge the impact pause.
  // Re-recorded 2026-10-04 (R2C-5, review r3): a rider in the way is stepped
  // round after 0.6 s, not the full 1.5 s mutual wait (first divergence: w4
  // starts its step aside at tick 501 instead of waiting on).
  assert.equal(digest(rows), GOLDEN);
});
const GOLDEN = '268a61ae';
