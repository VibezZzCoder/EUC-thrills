/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * POP-1 (2026-10-03 environment QA): a CPU cop rides round a living body on his
 * way instead of standing behind it for good, and never rides through it.
 *
 * The production brain and the production controller on a plain road. The
 * controller here has no population port, so the brain alone must keep him
 * off the body: every step is checked for hull overlap.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, SIMULATION } from '../data/tuning.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { CpuRider, type CpuPackInput, type CpuQuarry, type CpuView } from './cpuRider.ts';
import { createPose, EucController } from './EucController.ts';
import { HazardField } from './hazards.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { sweepPopulationHulls, type PopulationFootprint } from './population.ts';
import { populationYieldBody } from './populationYield.ts';
import { RouteSpine } from './routeSpine.ts';
import { SoftBodyField } from './softBodies.ts';

const STEP = 1 / SIMULATION.hz;
function road(length: number, halfWidth: number) {
  const plan = buildLevelPlan({ main: [{ id: 'living-road', length, halfWidth, surface: 'pavement' }] }, {
    id: `cpu-living-road-${length}-${halfWidth}`, spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    checkpoints: [
      { id: 'start', kind: 'start', segment: 'living-road', s: 5, label: 'Start' },
      { id: 'finish', kind: 'finish', segment: 'living-road', s: length - 5, label: 'Finish' },
    ],
  });
  const spine = RouteSpine.fromPlan(plan)!;
  return { plan, spine, at: (s: number) => spine.sample(s, { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 }) };
}
const street = road(200, 6);
/** A long open road for the pace pins: room to reach the wheel's top speed. */
const avenue = road(300, 7);
const at = street.at;
/** A standing person on the road, `s` metres along and `lateral` metres left of the line. */
function person(s: number, lateral = 0, overrides: Partial<PopulationFootprint> = {}, on = street): PopulationFootprint {
  const point = on.at(s);
  return { x: point.x + Math.cos(point.headingY) * lateral, z: point.z - Math.sin(point.headingY) * lateral,
    headingY: point.headingY + Math.PI / 2, minY: 0, maxY: 1.3, halfWidthMetres: 0.42, halfLengthMetres: 0.42,
    velocityX: 0, velocityZ: 0, ...overrides };
}
/** A car on the avenue, `lateral` left of the line, driving `along` m/s with it (negative: oncoming). */
function car(s: number, lateral: number, along: number): PopulationFootprint {
  const point = avenue.at(s);
  return { x: point.x + Math.cos(point.headingY) * lateral, z: point.z - Math.sin(point.headingY) * lateral,
    headingY: point.headingY, minY: 0, maxY: 1.6, halfWidthMetres: 0.95, halfLengthMetres: 2.2,
    velocityX: Math.sin(point.headingY) * along, velocityZ: Math.cos(point.headingY) * along };
}

interface Ride {
  /** Seconds until his line position passed `passS`; null if it never did. */
  readonly passedAt: number | null;
  /** Seconds until he was within 2 m of the quarry; null if never. */
  readonly reachedAt: number | null;
  readonly overlapSteps: number;
  readonly crashes: number;
  /** Longest stand-still (|speed| < 0.2) with the population cap binding, seconds. */
  readonly longestPopulationStand: number;
  readonly trace: string;
}

function ride(options: { startS?: number; bodies: readonly PopulationFootprint[]; quarryS?: number;
  quarryLateral?: number; passS?: number; seconds: number; pack?: 'none' | 'empty'; on?: typeof street }): Ride {
  const { plan, spine, at } = options.on ?? street;
  const sampler = new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, { spawn: plan.spawn, hazards: new HazardField([]),
    softBodies: new SoftBodyField([]) });
  const start = at(options.startS ?? 5);
  controller.reset({ position: { x: start.x, y: 0, z: start.z }, headingY: start.headingY });
  const brain = new CpuRider(spine, plan, sampler);
  const pose = createPose();
  controller.writePose(pose);
  const view: { -readonly [K in keyof CpuView]: CpuView[K] } = { x: pose.x, y: pose.y, z: pose.z,
    headingY: pose.headingY, speed: 0, grounded: true, crashed: false, curbAhead: 0, lateralLimitG: EUC.maxLateralG };
  brain.place(view);
  const quarryAt = options.quarryS === undefined ? null : at(options.quarryS);
  const quarryLateral = options.quarryLateral ?? 0;
  const quarry: CpuQuarry | null = quarryAt === null ? null
    : { x: quarryAt.x + Math.cos(quarryAt.headingY) * quarryLateral, y: 0,
      z: quarryAt.z - Math.sin(quarryAt.headingY) * quarryLateral, speed: 0 };
  const pack: CpuPackInput | undefined = options.pack === 'none' ? undefined
    : { bands: [], followLine: null, livingBodies: options.pack === 'empty' ? [] : options.bodies };
  let passedAt: number | null = null, reachedAt: number | null = null, overlapSteps = 0, crashes = 0;
  let wasCrashed = false, stand = 0, longestPopulationStand = 0;
  const trace: string[] = [];
  for (let step = 0; step < Math.round(options.seconds / STEP); step += 1) {
    controller.writePose(pose);
    view.x = pose.x; view.y = pose.y; view.z = pose.z; view.headingY = pose.headingY; view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6; view.crashed = controller.crashed;
    view.curbAhead = controller.curbHeightAhead; view.lateralLimitG = controller.lateralLimit;
    if (controller.crashed && !wasCrashed) crashes += 1;
    wasCrashed = controller.crashed;
    controller.step(STEP, brain.step(STEP, view, quarry, pack));
    controller.writePose(pose);
    // The bodies move on their own velocity, as the population steps them.
    for (const body of options.bodies as PopulationFootprint[]) {
      (body as { x: number }).x += body.velocityX * STEP;
      (body as { z: number }).z += body.velocityZ * STEP;
    }
    const seconds = (step + 1) * STEP;
    const wheel = populationYieldBody({ x: pose.x, y: pose.y, z: pose.z, headingY: pose.headingY, speed: pose.speed });
    if (options.bodies.some(body => sweepPopulationHulls(wheel, wheel, body, body) !== null)) overlapSteps += 1;
    stand = brain.capReason === 'population' && Math.abs(pose.speed) < 0.2 ? stand + STEP : 0;
    longestPopulationStand = Math.max(longestPopulationStand, stand);
    if (passedAt === null && options.passS !== undefined && brain.routeDistance > options.passS) passedAt = seconds;
    if (reachedAt === null && quarry !== null && Math.hypot(pose.x - quarry.x, pose.z - quarry.z) < 2) reachedAt = seconds;
    trace.push(`${pose.x.toFixed(4)},${pose.z.toFixed(4)},${pose.headingY.toFixed(4)}`);
  }
  return { passedAt, reachedAt, overlapSteps, crashes, longestPopulationStand, trace: trace.join(';') };
}

test('a cop meets a person or a parked van on his line and rides round it', () => {
  const van = { ...person(40), headingY: at(40).headingY, halfWidthMetres: 1.02, halfLengthMetres: 2.4, maxY: 2.8 };
  for (const [name, body] of [['person dead ahead', person(40)], ['person off-centre', person(40, 0.6)],
    ['parked van', van]] as const) {
    const result = ride({ bodies: [body], passS: 47, seconds: 14 });
    assert.ok(result.passedAt !== null && result.passedAt < 8, `${name}: passed at ${result.passedAt}`);
    assert.equal(result.overlapSteps, 0, `${name}: rode into it`);
    assert.equal(result.crashes, 0, name);
    assert.equal(result.longestPopulationStand, 0, `${name}: stood for it`);
  }
});

test('a cop stopped right behind a person backs out and rides round it, never standing there for good', () => {
  for (const lateral of [0, 0.3, -0.3]) {
    const result = ride({ startS: 38.2, bodies: [person(40, lateral)], passS: 47, seconds: 25 });
    assert.ok(result.passedAt !== null && result.passedAt < 15, `lateral ${lateral}: passed at ${result.passedAt}`);
    assert.equal(result.overlapSteps, 0, `lateral ${lateral}: rode into it`);
    assert.ok(result.longestPopulationStand < 5, `lateral ${lateral}: stood ${result.longestPopulationStand.toFixed(2)} s`);
  }
});

test('a direct pursuit goes round a person between the cop and a parked rider', () => {
  const result = ride({ bodies: [person(55)], quarryS: 60, seconds: 15 });
  assert.ok(result.reachedAt !== null && result.reachedAt < 8, `reached the rider at ${result.reachedAt}`);
  assert.equal(result.overlapSteps, 0, 'rode into the person on the way');
  assert.ok(result.longestPopulationStand < 5);
});

test('with no living body the brain rides exactly as it does with no pack input at all', () => {
  for (const options of [{ passS: 47 }, { quarryS: 60 }]) {
    const none = ride({ ...options, bodies: [], seconds: 10, pack: 'none' });
    const empty = ride({ ...options, bodies: [], seconds: 10, pack: 'empty' });
    assert.equal(empty.trace, none.trace);
  }
});

// The QA's review of the first cut (2026-10-03): a detour from the nearest
// body alone aimed the cop into the second of a social pair standing 1.4 m
// apart, and he never got past it. A cluster is gone round as one thing.
test('a direct pursuit goes round a social pair or a group of three between the cop and a parked rider', () => {
  const pair = (s: number, lateral: number) => [person(s, lateral - 0.7), person(s, lateral + 0.7)];
  for (const [name, bodies] of [['pair dead ahead', pair(55, 0)], ['pair 0.5 m left', pair(55, 0.5)],
    ['pair 0.5 m right', pair(55, -0.5)], ['pair end on', [person(54.3), person(55.7)]],
    ['three across', [...pair(55, 0), person(55, 2.1)]]] as const) {
    const result = ride({ bodies, quarryS: 60, seconds: 20 });
    assert.ok(result.reachedAt !== null && result.reachedAt < 8, `${name}: reached the rider at ${result.reachedAt}`);
    assert.equal(result.overlapSteps, 0, `${name}: rode into them`);
    assert.equal(result.longestPopulationStand, 0, `${name}: stood for them`);
  }
});

// The QA's pace finding on the first cut: a body was filed anywhere within the
// furniture's clearance of his line and treated as a standing post, so a
// person a metre and a half off it, or a car in the next lane, braked a cop
// doing 20 m/s to 7-10 for something his wheel was never going to touch.
test('a body beside his line that his wheel clears costs a cop nothing: the ride is the one on an empty road', () => {
  const empty = ride({ on: avenue, bodies: [], passS: 150, seconds: 9 });
  for (const [name, body] of [['person 1.3 m off', person(90, 1.3, { halfWidthMetres: 0.32, halfLengthMetres: 0.28 }, avenue)],
    ['person 1.6 m off', person(90, -1.6, { halfWidthMetres: 0.32, halfLengthMetres: 0.28 }, avenue)],
    ['oncoming car in the next lane', car(134, 2.0, -8)], ['car ahead in the next lane', car(46, -2.0, 8)]] as const) {
    assert.equal(ride({ on: avenue, bodies: [body], passS: 150, seconds: 9 }).trace, empty.trace, name);
  }
});

test('a person or a walker on his line costs a cop under a second at speed, never a stand', () => {
  const empty = ride({ on: avenue, bodies: [], passS: 150, seconds: 14 });
  assert.ok(empty.passedAt !== null);
  const walker = (s: number, along: number) => ({ ...person(s, 0, { halfWidthMetres: 0.32, halfLengthMetres: 0.28 }, avenue),
    headingY: avenue.at(s).headingY, velocityX: Math.sin(avenue.at(s).headingY) * along,
    velocityZ: Math.cos(avenue.at(s).headingY) * along });
  for (const [name, body] of [['standing on the line', person(90, 0, { halfWidthMetres: 0.32, halfLengthMetres: 0.28 }, avenue)],
    ['walking his way', walker(60, 1.4)], ['walking at him', walker(110, -1.4)]] as const) {
    const result = ride({ on: avenue, bodies: [body], passS: 150, seconds: 14 });
    assert.ok(result.passedAt !== null && result.passedAt < empty.passedAt + 1,
      `${name}: passed at ${result.passedAt} against ${empty.passedAt} on an empty road`);
    assert.equal(result.overlapSteps, 0, `${name}: rode into them`);
    assert.equal(result.longestPopulationStand, 0, name);
  }
});
