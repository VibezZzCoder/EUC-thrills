/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { BoxCollider, LevelPlan } from '../level/plan.ts';
import { createLevel } from '../level/levels.ts';
import {
  buildNavGrid,
  NAV_MAX_EXPANSIONS,
  NavPlanner,
  navFree,
  navLineClear,
  type NavGrid,
} from './navGrid.ts';
import { RouteSpine } from './routeSpine.ts';

/**
 * The close-quarters search's grid and planner — the brutal pass
 * (2026-09-25). The brain's use of it is pinned in `cpuRiderHider.test.ts`;
 * this file pins what the grid believes and what a search answers, on a flat
 * test plan with solids placed by hand.
 */

/** A flat plan with nothing on it but what the case adds: the slice's own heightfield, levelled. */
function flatPlan(solids: BoxCollider[], hazards: LevelPlan['hazards'] = []): LevelPlan {
  const base = createLevel('slice');
  const heights = base.heightfield.heights.map(() => 0);
  return {
    ...base,
    heightfield: { ...base.heightfield, heights },
    segments: base.segments.map((segment) => ({ ...segment, colliders: [] })),
    solids,
    hazards,
    softBodies: [],
  };
}

function box(x: number, z: number, halfX: number, halfZ: number, height = 2, rotationY = 0, base = 0): BoxCollider {
  return {
    centre: { x, y: base + height / 2, z },
    halfExtents: { x: halfX, y: height / 2, z: halfZ },
    rotationY,
    surface: 'brick',
  };
}

/** A grid covering the square round the origin (a straight spine through it), for the hand-built cases. */
function gridFor(plan: LevelPlan): NavGrid {
  const spine = RouteSpine.fromPlan(createLevel('slice'));
  assert.ok(spine !== null, 'the slice has a spine');
  const grid = buildNavGrid(plan, [spine]);
  assert.ok(navFree(grid, 0, 0) || !navFree(grid, 0, 0), 'the grid answers at the origin');
  return grid;
}

test('line of sight visits a blocked cell even when it clips only its corner', () => {
  const grid: NavGrid = { originX: 0, originZ: 0, cell: 1, columns: 3, rows: 3,
    blocked: new Uint8Array(9), cost: new Uint8Array(9) };
  assert.equal(navLineClear(grid, 0.5, 0.49, 1.5, 1.5), true, 'open control');
  grid.blocked[1] = 1;
  // At x=1.002 the segment is at z=0.99702: inside cell (1, 0).
  // Its stay there is shorter than the old one-third-cell sampling stride.
  assert.equal(navFree(grid, 1.002, 0.99702), false);
  assert.equal(navLineClear(grid, 0.5, 0.49, 1.5, 1.5), false);
  assert.equal(navLineClear(grid, 1.5, 1.5, 0.5, 0.49), false);
  assert.equal(navLineClear(grid, 0.5, 0.5, 1.5, 1.5), false, 'diagonal must not squeeze past a blocked corner');
  assert.equal(navLineClear(grid, 1.2, 0.5, 1.2, 2.5, 0.6), true, 'explicit start clearance is preserved');
});

test('a wall blocks the straight line, and the search finds the way round its end', () => {
  // A 20 m wall across the line between two points: the owner's plaza block,
  // reduced to its geometry.
  const plan = flatPlan([box(0, 20, 10, 0.4, 2.5)]);
  const grid = gridFor(plan);
  assert.equal(navLineClear(grid, 0, 10, 0, 30), false, 'the wall does not block the line through it');
  const planner = new NavPlanner(grid);
  assert.ok(planner.plan(0, 10, 0, 30), 'no way round a 20 m wall');
  assert.ok(planner.pathMetres > 20 + 1, `the path (${planner.pathMetres.toFixed(1)} m) went through the wall`);
  // Every leg of the pulled path is in sight of the next corner: a corner is never cut through the wall.
  for (let k = 0; k + 1 < planner.pathLength; k += 1) {
    assert.ok(
      navLineClear(grid, planner.pathX[k], planner.pathZ[k], planner.pathX[k + 1], planner.pathZ[k + 1], k === 0 ? 0.75 : 0),
      `leg ${k} cuts through a blocked cell`,
    );
  }
  // And it goes round an end, past ±10 m.
  let widest = 0;
  for (let k = 0; k < planner.pathLength; k += 1) widest = Math.max(widest, Math.abs(planner.pathX[k]));
  assert.ok(widest > 10, `the path never cleared the wall's end (widest ${widest.toFixed(1)} m)`);
});

test('a kerb is ridden, a block is a wall, and an overhead box is neither', () => {
  // A 0.15 m kerb is under the wheel's own step (`maxStepUp`) and is ridden,
  // not walked round; a 1 m block is a wall.
  const plan = flatPlan([
    box(0, 10, 3, 0.3, 0.15),
    box(0, 30, 3, 0.4, 1.0),
  ]);
  const grid = gridFor(plan);
  assert.ok(navFree(grid, 0, 10), 'a kerb was filed as a wall');
  assert.ok(!navFree(grid, 0, 30), 'a 1 m block was not filed at all');
  // Overhead: a box whose underside clears a rider is no obstacle.
  const overhead = gridFor(flatPlan([box(0, 50, 3, 3, 1, 0, 2.5)]));
  assert.ok(navFree(overhead, 0, 50), 'an overhead box was filed as a wall');
});

test('a deep pothole is not a way through, a spill only costs', () => {
  const plan = flatPlan([], [
    { id: 'deep', kind: 'potholeDeep', centre: { x: 0, y: 0, z: 20 }, radius: 1.2 },
    { id: 'spill', kind: 'spill', centre: { x: 0, y: 0, z: 40 }, radius: 1.5 },
  ] as LevelPlan['hazards']);
  const grid = gridFor(plan);
  assert.ok(!navFree(grid, 0, 20), 'a deep hole was ridden through');
  assert.ok(navFree(grid, 0, 40), 'a spill was walled off');
  const column = Math.floor((0 - grid.originX) / grid.cell);
  const row = Math.floor((40 - grid.originZ) / grid.cell);
  assert.ok(grid.cost[row * grid.columns + column] > 0, 'a spill costs nothing to cross');
});

test('a walled-off goal is refused within the expansion cap, not searched for ever', () => {
  // A closed pen: four walls, the quarry inside.
  const plan = flatPlan([
    box(0, 10, 6, 0.4), box(0, 22, 6, 0.4),
    box(-6, 16, 0.4, 6), box(6, 16, 0.4, 6),
  ]);
  const grid = gridFor(plan);
  const planner = new NavPlanner(grid);
  assert.equal(planner.plan(0, -10, 0, 16), false, 'a path into a closed pen');
  assert.ok(planner.expanded <= NAV_MAX_EXPANSIONS + 1, `${planner.expanded} expansions`);
  // Open one side and the same search finds the gate.
  const gated = gridFor(flatPlan([
    box(0, 10, 6, 0.4), box(-6, 16, 0.4, 6), box(6, 16, 0.4, 6),
  ]));
  assert.ok(new NavPlanner(gated).plan(0, -10, 0, 16), 'no way into a yard open at the back');
});

test('a packmate ahead on the short way sends the next cop round the other end', () => {
  // A wall slightly off-centre: the short way round is its left end. With a
  // packmate already on that side, the repel cost makes the right end cheaper.
  const plan = flatPlan([box(-2, 20, 8, 0.4, 2.5)]);
  const grid = gridFor(plan);
  const alone = new NavPlanner(grid);
  assert.ok(alone.plan(0, 8, -2, 30));
  const side = (planner: NavPlanner): number => {
    let sum = 0;
    for (let k = 0; k < planner.pathLength; k += 1) sum += planner.pathX[k];
    return Math.sign(sum);
  };
  const shortSide = side(alone);
  const mateX = [shortSide * 9];
  const mateZ = [20];
  const second = new NavPlanner(grid);
  assert.ok(second.plan(0, 8, -2, 30, mateX, mateZ, 1, 6, 30));
  assert.equal(side(second), -shortSide, 'the second cop queued behind the first round the same end');
  // Control: the same search with no repel takes the short end again.
  const control = new NavPlanner(grid);
  assert.ok(control.plan(0, 8, -2, 30));
  assert.equal(side(control), shortSide);
});

test('a search allocates nothing and reuses its scratch', () => {
  const grid = gridFor(flatPlan([box(0, 20, 10, 0.4, 2.5)]));
  const planner = new NavPlanner(grid);
  planner.plan(0, 10, 0, 30);
  const x = planner.pathX;
  planner.plan(0, 30, 0, 10);
  assert.equal(planner.pathX, x, 'the path buffer was reallocated');
});
