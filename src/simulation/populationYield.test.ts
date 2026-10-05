/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { CpuRider, type CpuView } from './cpuRider.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import type { PopulationFootprint } from './population.ts';
import { populationYieldBody, populationYieldSpeed } from './populationYield.ts';
import { RouteSpine } from './routeSpine.ts';

const view: CpuView = { x: 0, y: 0, z: 0, headingY: 0, speed: 8,
  grounded: true, crashed: false, curbAhead: 0, lateralLimitG: 0.8 };
const body = populationYieldBody(view);
const van = (x = 0, z = 7): PopulationFootprint => ({ x, z, headingY: 0,
  minY: 0, maxY: 2.8, halfWidthMetres: 1.02, halfLengthMetres: 2.4,
  velocityX: 0, velocityZ: 0 });

test('living-body braking uses oriented hulls and leaves a genuine long-van side lane clear', () => {
  const ahead = populationYieldSpeed(body, 8, 0, [van()], 7);
  assert.ok(ahead !== null && ahead < 8);
  assert.equal(populationYieldSpeed(body, 8, 0, [van(2.5)], 7), null);
  assert.ok(2.5 < Math.hypot(1.02, 2.4) + body.halfWidthMetres,
    'a circular blocker is the known-bad side-lane predicate');
  assert.equal(populationYieldSpeed(body, 8, 0, [{ ...van(), minY: 3, maxY: 5.8 }], 7), null);
  assert.equal(populationYieldSpeed(body, 8, 0, [], 7), null);
});

test('a crossing actor constrains pace before entering the wheel line and a clear departure does not', () => {
  const crossing = { ...van(-3, 5), halfWidthMetres: 0.4, halfLengthMetres: 0.4,
    maxY: 1.9, velocityX: 3 };
  assert.ok(populationYieldSpeed(body, 8, 0, [crossing], 7) !== null);
  assert.equal(populationYieldSpeed(body, 8, 0, [{ ...crossing, velocityX: -3 }], 7), null);
});

// 2026-10-03 (POP-1): the wait is bounded. This pinned 1,200 ticks of waiting
// without end (throttle at most 0.2); a cop waiting on a walker or a car that
// waits on him never moved again. Now a standing body is also a post he
// steers round, so from close behind one he creeps out (first test), and a
// stand the population cap does hold is bounded by a back-out (second test) —
// never a hop or a spin. The fixed view never moves, so each test reads the
// brain's requests alone.
const yieldRoad = () => {
  const plan = buildLevelPlan({ main: [{ id: 'real-cpu-road', length: 200, halfWidth: 10, surface: 'pavement' }] }, {
    id: 'cpu-living-yield', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    checkpoints: [
      { id: 'start', kind: 'start', segment: 'real-cpu-road', s: 5, label: 'Start' },
      { id: 'finish', kind: 'finish', segment: 'real-cpu-road', s: 195, label: 'Finish' },
    ],
  });
  const spine = RouteSpine.fromPlan(plan); assert.ok(spine);
  return new CpuRider(spine, plan, new PlanTerrainSampler(plan));
};

test('the production brain stopped close behind a standing person creeps out round it at a crawl, never at it', () => {
  const brain = yieldRoad();
  const stopped = { ...view, speed: 0 };
  const standing = { ...van(0, 1.8), halfWidthMetres: 0.45, halfLengthMetres: 0.45, maxY: 1.9 };
  const pack = { bands: [], followLine: null, livingBodies: [standing] };
  let creeping = 0;
  for (let tick = 0; tick < 1200; tick += 1) {
    const input = brain.step(1 / 120, stopped, null, pack);
    assert.equal(input.hop, false);
    // Whatever binds is the body's: its cap or the swerve round it, at a crawl.
    assert.ok(brain.capReason === 'population' || brain.capReason === 'swerve', brain.capReason);
    assert.ok(brain.capSpeed <= 1 + 1e-9, `asked for ${brain.capSpeed} m/s beside a person`);
    if (input.throttle > 0.05) {
      creeping += 1;
      // Forward only while aiming off the person: well to one side, steered that way.
      const aim = brain.aimPoint;
      assert.ok(Math.abs(aim.x) > standing.halfWidthMetres + 0.65, `aimed at x=${aim.x.toFixed(2)}`);
      assert.ok(Math.sign(input.steer) === -Math.sign(aim.x) && Math.abs(input.steer) > 0.3, `steer ${input.steer}`);
    }
  }
  assert.ok(creeping > 0, 'he never moved off');
});

test('the production brain held by a body on its line backs out after a bounded stand, twice, then hands the wait to the stuck ladder, never hopping', () => {
  const brain = yieldRoad();
  const stopped = { ...view, speed: 0 };
  // Walking across his line right in front of him: the speed cap's, never a post.
  const crossing = { ...van(-0.6, 1.5), halfWidthMetres: 0.35, halfLengthMetres: 0.35, maxY: 1.9, velocityX: 1 };
  const pack = { bands: [], followLine: null, livingBodies: [crossing] };
  // The view never moves, so every stand is held to its bound. A stand ends
  // in a creeping back-out (a part throttle) or the ladder's reverse (full).
  let firstBackOut = -1, standTicks = 0, backOuts = 0, ladders = 0;
  for (let tick = 0; tick < 2400; tick += 1) {
    const input = brain.step(1 / 120, stopped, null, pack);
    assert.equal(input.hop, false);
    assert.equal(brain.capReason, 'population');
    if (tick < 168) assert.ok(Math.abs(input.throttle) < 1e-9, `tick ${tick}: ${input.throttle}; the first 1.4 s are a stand`);
    if (Math.abs(input.throttle) < 1e-9) { standTicks += 1; continue; }
    if (input.throttle < 0 && standTicks >= 168) {
      if (input.throttle > -0.9) { backOuts += 1; if (firstBackOut < 0) firstBackOut = tick; } else ladders += 1;
    }
    standTicks = 0;
  }
  assert.ok(firstBackOut >= 168 && firstBackOut <= 240, `the wait ended at tick ${firstBackOut}, not by 2 s`);
  assert.equal(backOuts, 2, 'the first back-out and one round the other side');
  assert.ok(ladders > 0, 'the third stand at the spot is the stuck ladder\'s');
  // Released mid-wait (a stand after the second back-out), he rides on.
  const waiting = yieldRoad();
  for (let tick = 0; tick < 1200; tick += 1) waiting.step(1 / 120, stopped, null, pack);
  const released = waiting.step(1 / 120, stopped, null, { ...pack, livingBodies: [] });
  assert.ok(released.throttle > 0.2);
  assert.notEqual(waiting.capReason, 'population');
});
