/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { WHEEL } from '../data/tuning.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { Heightfield, LevelPlan } from '../level/plan.ts';
import type { SurfaceId, Vec3 } from './world.ts';
import { createGroundSample } from './world.ts';
import { PlanTerrainSampler } from './planSampler.ts';

/**
 * The terrain sampler, tested headlessly.
 *
 * This is the only route `simulation/` has to the world (invariant 3), so
 * everything the controller believes about the ground is downstream of the
 * assertions below. The heightfield fixtures are written by hand wherever the
 * *sampling* is what is under test — a hand-written array states the exact four
 * corner heights an interpolation is being checked against, where a rasterised
 * one would only prove the sampler agrees with the builder.
 */

const sample = createGroundSample();

/** A heightfield from a row-major array of heights, one metre apart. */
function field(rows: number[][], surfaces?: SurfaceId[][]): Heightfield {
  const heights = rows.flat();
  const columns = rows[0].length;
  const cellSurfaces: SurfaceId[] = [];
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      cellSurfaces.push(surfaces?.[row]?.[column] ?? 'pavement');
    }
  }
  return {
    originX: 0,
    originZ: 0,
    spacing: 1,
    columns,
    rows: rows.length,
    heights,
    surfaces: cellSurfaces,
  };
}

function plan(options: {
  heightfield: Heightfield;
  surroundHeight?: number;
  surroundSurface?: SurfaceId;
  colliders?: LevelPlan['segments'][number]['colliders'];
}): LevelPlan {
  const socket = {
    position: { x: 0, y: 0, z: 0 },
    headingY: 0,
    surface: 'pavement' as const,
    halfWidth: 1,
    gradient: 0,
  };
  return {
    id: 'fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: {
      height: options.surroundHeight ?? 0,
      surface: options.surroundSurface ?? 'grass',
    },
    heightfield: options.heightfield,
    segments: [{
      id: 'fixture-segment',
      entry: socket,
      exit: socket,
      colliders: options.colliders ?? [],
    }],
    checkpoints: [],
  };
}

// ---------------------------------------------------------------------------
// Heightfield
// ---------------------------------------------------------------------------

test('a flat field samples flat, with an upward normal, everywhere on it', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[2, 2, 2], [2, 2, 2], [2, 2, 2]]),
  }));

  for (const [x, z] of [[0, 0], [0.5, 0.5], [1.3, 0.2], [2, 2], [1.999, 0.001]]) {
    sampler.sampleGround(x, z, sample);
    assert.equal(sample.height, 2, `height at ${x},${z}`);
    assert.deepEqual(sample.normal, { x: 0, y: 1, z: 0 });
    assert.equal(sample.surface, 'pavement');
    assert.equal(sample.offCourse, false);
  }
});

test('a constant gradient interpolates linearly and reports its own plane normal', () => {
  // Rising one metre per metre along +Z: a 45-degree slope, so the normal must
  // be exactly (0, 1, -1) normalised.
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0, 0], [1, 1, 1], [2, 2, 2]]),
  }));

  sampler.sampleGround(0.5, 0.5, sample);
  assert.ok(Math.abs(sample.height - 0.5) < 1e-9, `height ${sample.height}`);
  assert.ok(Math.abs(sample.normal.x) < 1e-9);
  assert.ok(Math.abs(sample.normal.y - Math.SQRT1_2) < 1e-9, `ny ${sample.normal.y}`);
  assert.ok(Math.abs(sample.normal.z + Math.SQRT1_2) < 1e-9, `nz ${sample.normal.z}`);

  sampler.sampleGround(0.25, 1.75, sample);
  assert.ok(Math.abs(sample.height - 1.75) < 1e-9, `height ${sample.height}`);
});

test('the sampler reads the same triangle the renderer draws, on both sides of the diagonal', () => {
  // The cell corners are deliberately non-planar, which is the only case where
  // "which triangle" is a question with two answers. This is the assertion that
  // keeps the ridden ground and the drawn ground from disagreeing anywhere
  // except at the corners (master §5.4).
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 2]]),
  }));

  // Below the (0,0)-(1,1) diagonal: the (h00, h10, h11) triangle, which is
  // h = 0 + 0*u + 2*v.
  sampler.sampleGround(0.75, 0.25, sample);
  assert.ok(Math.abs(sample.height - 0.5) < 1e-9, `below-diagonal height ${sample.height}`);
  // Above it: the (h00, h01, h11) triangle, which is h = 0 + 2*u + 0*v.
  sampler.sampleGround(0.25, 0.75, sample);
  assert.ok(Math.abs(sample.height - 0.5) < 1e-9, `above-diagonal height ${sample.height}`);

  // On the diagonal itself the two triangles agree, which is what makes the
  // surface continuous rather than merely piecewise.
  sampler.sampleGround(0.5 - 1e-7, 0.5, sample);
  const left = sample.height;
  sampler.sampleGround(0.5 + 1e-7, 0.5, sample);
  assert.ok(Math.abs(left - sample.height) < 1e-5, 'the split is discontinuous');
});

test('a cell carries its own surface, and the boundary is a clean line', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field(
      [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      [['pavement', 'grass'], ['gravel', 'dirt']],
    ),
  }));

  const surfaceAt = (x: number, z: number): SurfaceId => {
    sampler.sampleGround(x, z, sample);
    return sample.surface;
  };

  assert.equal(surfaceAt(0.5, 0.5), 'pavement');
  assert.equal(surfaceAt(1.5, 0.5), 'grass');
  assert.equal(surfaceAt(0.5, 1.5), 'gravel');
  assert.equal(surfaceAt(1.5, 1.5), 'dirt');
  // Crisp: one side of x = 1 is pavement and the other is grass, with nothing
  // in between.
  assert.equal(surfaceAt(0.999, 0.5), 'pavement');
  assert.equal(surfaceAt(1.001, 0.5), 'grass');
});

test('off the field is the surround — real ground, and it says so', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[3, 3], [3, 3]]),
    surroundHeight: -1,
    surroundSurface: 'grass',
  }));

  for (const [x, z] of [[-5, 0], [50, 0], [0, -0.001], [0.5, 900]]) {
    sampler.sampleGround(x, z, sample);
    assert.equal(sample.height, -1, `height at ${x},${z}`);
    assert.equal(sample.surface, 'grass');
    assert.equal(sample.offCourse, true);
    assert.deepEqual(sample.normal, { x: 0, y: 1, z: 0 });
  }

  // And on it, the surround flag is off — a rider on the course must be
  // distinguishable from one who is not.
  sampler.sampleGround(0.5, 0.5, sample);
  assert.equal(sample.offCourse, false);
});

// ---------------------------------------------------------------------------
// Colliders
// ---------------------------------------------------------------------------

test('the highest collider under a point wins, and carries its own surface', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
    colliders: [
      {
        centre: { x: 0.5, y: 0, z: 0.5 },
        halfExtents: { x: 0.4, y: 0.1, z: 0.4 },
        rotationY: 0,
        surface: 'brick',
      },
      {
        centre: { x: 0.5, y: 0, z: 0.5 },
        halfExtents: { x: 0.2, y: 0.3, z: 0.2 },
        rotationY: 0,
        surface: 'wood',
      },
    ],
  }));

  sampler.sampleGround(0.5, 0.5, sample);
  assert.ok(Math.abs(sample.height - 0.3) < 1e-9, `height ${sample.height}`);
  assert.equal(sample.surface, 'wood');
  assert.deepEqual(sample.normal, { x: 0, y: 1, z: 0 }, 'a box top is always level');

  // Outside the tall one but inside the wide one.
  sampler.sampleGround(0.85, 0.5, sample);
  assert.ok(Math.abs(sample.height - 0.1) < 1e-9);
  assert.equal(sample.surface, 'brick');

  // Outside both: back to the terrain, and back to the terrain's surface.
  sampler.sampleGround(0.05, 0.5, sample);
  assert.equal(sample.height, 0);
  assert.equal(sample.surface, 'pavement');
});

test('a yawed collider is tested in its own frame, not its bounding box', () => {
  // A long thin block at 45 degrees. Its axis-aligned bounding box contains the
  // second point below; the block itself does not, and the difference is a kerb
  // a rider bounces off two metres before reaching it.
  const flat = new Array(5).fill(0);
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([flat, flat, flat, flat, flat]),
    colliders: [{
      centre: { x: 2, y: 0, z: 2 },
      halfExtents: { x: 0.25, y: 0.2, z: 2 },
      rotationY: Math.PI / 4,
      surface: 'brick',
    }],
  }));

  // On the block's own long axis, which a 45-degree yaw points along +X+Z.
  sampler.sampleGround(3, 3, sample);
  assert.ok(Math.abs(sample.height - 0.2) < 1e-9, `on-axis height ${sample.height}`);

  // Inside the axis-aligned bounding box, well outside the block.
  sampler.sampleGround(3.2, 0.9, sample);
  assert.equal(sample.height, 0, 'the bounding box was tested instead of the box');
});

// ---------------------------------------------------------------------------
// Raycasting
// ---------------------------------------------------------------------------

test('a downward ray reports the distance to the terrain it meets', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
  }));

  const hit = sampler.raycast({ x: 0.5, y: 5, z: 0.5 }, { x: 0, y: -1, z: 0 }, 10);
  assert.ok(hit !== null && Math.abs(hit - 5) < 0.02, `hit at ${hit}`);
});

test('a ray direction need not be normalised', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
  }));

  const hit = sampler.raycast({ x: 0.5, y: 2, z: 0.5 }, { x: 0, y: -7, z: 0 }, 10);
  assert.ok(hit !== null && Math.abs(hit - 2) < 0.02, `hit at ${hit}`);
});

test('a ray that meets nothing, or nothing in range, returns null', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
  }));

  assert.equal(sampler.raycast({ x: 0.5, y: 2, z: 0.5 }, { x: 0, y: 1, z: 0 }, 10), null);
  assert.equal(sampler.raycast({ x: 0.5, y: 20, z: 0.5 }, { x: 0, y: -1, z: 0 }, 5), null);
  assert.equal(sampler.raycast({ x: 0.5, y: 2, z: 0.5 }, { x: 0, y: 0, z: 0 }, 10), null);
});

test('a non-finite distance is refused rather than marched forever', () => {
  // `Math.max` and `Math.floor` are not input validation — a non-finite count
  // reaching an unbounded loop is the class of bug that froze the tab once
  // already (`docs/LESSONS_LEARNED.md`).
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
  }));

  assert.equal(
    sampler.raycast({ x: 0.5, y: 2, z: 0.5 }, { x: 0, y: -1, z: 0 }, Infinity),
    null,
  );
  assert.equal(sampler.raycast({ x: 0.5, y: 2, z: 0.5 }, { x: 0, y: -1, z: 0 }, NaN), null);
});

test('a ray that starts inside geometry reports zero, not the far face', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
    colliders: [{
      centre: { x: 0.5, y: 1, z: 0.5 },
      halfExtents: { x: 1, y: 1, z: 1 },
      rotationY: 0,
      surface: 'pavement',
    }],
  }));

  assert.equal(sampler.raycast({ x: 0.5, y: 1, z: 0.5 }, { x: 0, y: 0, z: 1 }, 10), 0);
  // Below the terrain counts too: a feeler that has been swallowed has found
  // something, and reporting the exit point would say it was ahead rather than
  // around.
  assert.equal(sampler.raycast({ x: 0.5, y: -1, z: 0.5 }, { x: 0, y: 0, z: 1 }, 10), 0);
});

test('the nearest of several hits is the one reported', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0], [0, 0]]),
    colliders: [
      {
        centre: { x: 0.5, y: 1, z: 0.5 },
        halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
        rotationY: 0,
        surface: 'pavement',
      },
      {
        centre: { x: 0.5, y: 3, z: 0.5 },
        halfExtents: { x: 0.2, y: 0.2, z: 0.2 },
        rotationY: 0,
        surface: 'pavement',
      },
    ],
  }));

  const hit = sampler.raycast({ x: 0.5, y: 6, z: 0.5 }, { x: 0, y: -1, z: 0 }, 10);
  assert.ok(hit !== null && Math.abs(hit - 2.8) < 1e-6, `hit at ${hit}`);
});

test('a ray skimming above a rise is not stopped by it; one into the rise is', () => {
  // The camera's obstruction probe, in miniature: it runs from the rider's hip
  // up to the camera, and the whole question is whether the ground behind them
  // gets in the way. A false positive here is a camera that hugs the rider on
  // every hill; a false negative is a camera inside a hillside.
  const rows: number[][] = [];
  for (let row = 0; row < 12; row += 1) {
    rows.push(new Array(12).fill(row < 6 ? 0 : (row - 6) * 0.2));
  }
  const sampler = new PlanTerrainSampler(plan({ heightfield: field(rows) }));

  // From above the flat half, over the rise, staying well clear of it.
  const clear = sampler.raycast({ x: 5, y: 3, z: 2 }, { x: 0, y: 0, z: 1 }, 9);
  assert.equal(clear, null, 'a ray three metres up was stopped by a 1.0 m rise');

  // The same ray, low enough to meet it.
  const blocked = sampler.raycast({ x: 5, y: 0.4, z: 2 }, { x: 0, y: 0, z: 1 }, 9);
  assert.ok(blocked !== null, 'a ray at 0.4 m passed through a 1.0 m rise');
  assert.ok(blocked > 3 && blocked < 9, `met the rise at ${blocked}`);
});

test('the obstacle-only ray sees authored boxes and deliberately ignores terrain', () => {
  const rows: number[][] = [];
  for (let row = 0; row < 12; row += 1) {
    rows.push(new Array(12).fill(row < 6 ? 0 : (row - 6) * 0.2));
  }
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field(rows),
    colliders: [{
      centre: { x: 5, y: 0.5, z: 9 },
      halfExtents: { x: 1, y: 0.5, z: 0.25 },
      rotationY: 0,
      surface: 'pavement',
    }],
  }));

  // The ordinary ray meets the rising field first. Wheel-radius clearance
  // must not: a steep but authored bank remains rideable terrain.
  const ordinary = sampler.raycast({ x: 5, y: 0.4, z: 2 }, { x: 0, y: 0, z: 1 }, 10);
  assert.ok(ordinary !== null && ordinary < 7);

  const obstacle = sampler.raycastObstacle(
    { x: 5, y: 0.4, z: 2 },
    { x: 0, y: 0, z: 1 },
    10,
  );
  assert.ok(obstacle !== null && Math.abs(obstacle - 6.75) < 1e-6, `box hit at ${obstacle}`);
});

test('an obstacle cast can sweep the machine width past a narrow post', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    colliders: [{
      centre: { x: 0.20, y: 2.3, z: 10 },
      halfExtents: { x: 0.075, y: 2.3, z: 0.075 },
      rotationY: 0,
      surface: 'pavement',
      occludes: false,
    }],
  }));
  const origin = { x: 0, y: 0.3, z: 0 };
  const direction = { x: 0, y: 0, z: 1 };

  // The old centre ray misses by 125 mm. A tyre-only answer would therefore
  // make contact depend on whether the player happened to aim at the post's
  // tiny authored box.
  assert.equal(sampler.raycastObstacle(origin, direction, 20), null);
  assert.equal(sampler.raycastObstacle(origin, direction, 20, 0.12), null);

  // Half the 0.52 m pedal span reaches it, in the same single query. The hit
  // distance stays the box's front face because width expands cross-track,
  // never along the direction of travel.
  const swept = sampler.raycastObstacle(origin, direction, 20, WHEEL.pedalSpan / 2);
  assert.ok(swept !== null && Math.abs(swept - 9.925) < 1e-6, `swept hit at ${swept}`);
});

test('the post sweep does not widen a route-edge wall', () => {
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    colliders: [{
      centre: { x: 0.40, y: 1, z: 10 },
      halfExtents: { x: 2, y: 1, z: 0.10 },
      rotationY: Math.PI / 2,
      surface: 'pavement',
    }],
  }));
  const origin = { x: 0, y: 0.3, z: 0 };
  const direction = { x: 0, y: 0, z: 1 };

  assert.equal(sampler.raycastObstacle(origin, direction, 20), null);
  assert.equal(
    sampler.raycastObstacle(origin, direction, 20, WHEEL.pedalSpan / 2),
    null,
    'a broad wall inherited the narrow-post envelope',
  );
});

// ---------------------------------------------------------------------------
// Against a built plan
// ---------------------------------------------------------------------------

test('a built plan and its sampler agree about where the ground is', () => {
  const built = buildLevelPlan(
    [{ id: 'ramp', length: 40, climb: 4, linearClimb: true, halfWidth: 6, surface: 'dirt' }],
    {
      id: 'built',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
      spacing: 1,
    },
  );
  const sampler = new PlanTerrainSampler(built);

  // Halfway up a linear ramp is half the climb, on the surface it was painted.
  sampler.sampleGround(0, 20, sample);
  assert.ok(Math.abs(sample.height - 2) < 0.05, `mid-ramp height ${sample.height}`);
  assert.equal(sample.surface, 'dirt');
  const onCourse = sample.height;
  // The gradient is 4 in 40, so the normal leans back by about atan(0.1).
  assert.ok(Math.abs(sample.normal.z + 0.0995) < 0.02, `normal z ${sample.normal.z}`);

  // Off to the side, past the shoulder, is surround at surround height.
  sampler.sampleGround(40, 20, sample);
  assert.equal(sample.surface, 'grass');
  assert.ok(sample.height < onCourse, 'the embankment must come back down');
});

// ---------------------------------------------------------------------------
// The broadphase (M8.6)
// ---------------------------------------------------------------------------

/**
 * The grid is an *acceleration structure*, so the only interesting property is
 * that it changes no answer. These tests build a field of colliders spread far
 * enough apart to span many cells, then check the sampler against a brute-force
 * walk written out longhand — the implementation the grid replaced.
 *
 * Deterministic pseudo-random placement, never `Math.random`: a broadphase bug
 * that reproduces one run in fifty is a broadphase bug nobody can bisect.
 */
function scatteredColliders(count: number): LevelPlan['segments'][number]['colliders'] {
  const colliders: LevelPlan['segments'][number]['colliders'] = [];
  let seed = 1;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let index = 0; index < count; index += 1) {
    colliders.push({
      centre: { x: next() * 400 - 200, y: next() * 3, z: next() * 400 - 200 },
      halfExtents: { x: 0.2 + next() * 6, y: 0.3 + next() * 20, z: 0.2 + next() * 6 },
      rotationY: next() * Math.PI * 2,
      surface: 'pavement',
      ...(next() > 0.7 ? { occludes: false } : {}),
    });
  }
  return colliders;
}

/** The pre-M8.6 answer: every collider, in its own frame, longhand. */
function bruteHeight(
  colliders: LevelPlan['segments'][number]['colliders'],
  x: number,
  z: number,
  base: number,
): number {
  let height = base;
  for (const collider of colliders) {
    const dx = x - collider.centre.x;
    const dz = z - collider.centre.z;
    const cos = Math.cos(collider.rotationY);
    const sin = Math.sin(collider.rotationY);
    if (Math.abs(cos * dx - sin * dz) > collider.halfExtents.x) continue;
    if (Math.abs(sin * dx + cos * dz) > collider.halfExtents.z) continue;
    const top = collider.centre.y + collider.halfExtents.y;
    if (top > height) height = top;
  }
  return height;
}

/** Exact pre-grid box walk for proving that candidate gathering drops nothing. */
function bruteRayBox(
  collider: LevelPlan['segments'][number]['colliders'][number],
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
): number | null {
  const cos = Math.cos(collider.rotationY);
  const sin = Math.sin(collider.rotationY);
  const rx = origin.x - collider.centre.x;
  const rz = origin.z - collider.centre.z;
  const starts = [
    cos * rx - sin * rz,
    origin.y - collider.centre.y,
    sin * rx + cos * rz,
  ];
  const deltas = [
    cos * direction.x - sin * direction.z,
    direction.y,
    sin * direction.x + cos * direction.z,
  ];
  const extents = [
    collider.halfExtents.x,
    collider.halfExtents.y,
    collider.halfExtents.z,
  ];
  let enter = 0;
  let exit = maxDistance;
  for (let axis = 0; axis < 3; axis += 1) {
    const start = starts[axis];
    const delta = deltas[axis];
    const half = extents[axis];
    if (delta === 0) {
      if (start < -half || start > half) return null;
      continue;
    }
    let near = (-half - start) / delta;
    let far = (half - start) / delta;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  return enter;
}

test('the grid changes no ground answer, over hundreds of colliders', () => {
  const colliders = scatteredColliders(400);
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    colliders,
  }));

  let inside = 0;
  for (let index = 0; index < 4000; index += 1) {
    // A deterministic lattice over the whole scattered area *and* well outside
    // it, so the clamped border cells are exercised rather than assumed.
    const x = ((index * 37) % 501) - 250;
    const z = ((index * 91) % 503) - 250;
    sampler.sampleGround(x, z, sample);
    const expected = bruteHeight(colliders, x, z, x >= 0 && x <= 2 && z >= 0 && z <= 2 ? 0 : 0);
    if (expected > 0) inside += 1;
    assert.equal(sample.height, expected, `ground at ${x},${z}`);
  }
  assert.ok(inside > 100, `only ${inside} of 4000 probes landed on a collider — a weak test`);
});

test('the grid changes no ray answer, and a ray still finds the nearest hit', () => {
  const colliders = scatteredColliders(400);
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    colliders,
  }));

  let hits = 0;
  for (let index = 0; index < 2000; index += 1) {
    const origin = {
      x: ((index * 53) % 401) - 200,
      y: 1 + ((index * 7) % 5),
      z: ((index * 149) % 397) - 200,
    };
    const angle = (index / 2000) * Math.PI * 2;
    const direction = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
    const distance = 30;

    // Longhand nearest over every box, exactly as `raycastObstacle` used to.
    // This is exhaustive for every ray: checking only that a reported hit is
    // real cannot detect the more dangerous failure, a nearer candidate (or the
    // only candidate) being dropped by the broadphase.
    let expected: number | null = null;
    for (const collider of colliders) {
      const hit = bruteRayBox(collider, origin, direction, distance);
      if (hit !== null && (expected === null || hit < expected)) expected = hit;
    }
    const actual = sampler.raycastObstacle(origin, direction, distance);
    assert.ok(
      actual === null
        ? expected === null
        : expected !== null && Math.abs(actual - expected) < 1e-12,
      `ray ${index}: grid ${String(actual)}, brute force ${String(expected)}`,
    );

    // The cheap invariant, on every ray: a hit is a real hit. Marching to the
    // reported distance minus a hair must still be outside everything, and the
    // reported distance itself must be inside something — which is exactly what
    // a broadphase that dropped a candidate, or reported a far cell's box as
    // nearer than a near cell's, would fail.
    const hit = sampler.raycastObstacle(origin, direction, distance);
    if (hit === null) continue;
    hits += 1;
    const at = (t: number): boolean => bruteHeight(
      colliders,
      origin.x + direction.x * t,
      origin.z + direction.z * t,
      -1,
    ) >= origin.y;
    assert.ok(at(hit + 1e-4) || at(hit - 1e-4), `the hit at ${hit} is not on a box`);
  }
  assert.ok(hits > 200, `only ${hits} of 2000 rays hit anything — a weak test`);
});

test('a non-occluding box stops a wheel and does not pull the camera in', () => {
  // The M8.6 split, at its narrowest. Both boxes are solid; only one of them is
  // something the rider can hide behind.
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
    colliders: [{
      centre: { x: 10, y: 1, z: 0 },
      halfExtents: { x: 0.5, y: 1, z: 0.5 },
      rotationY: 0,
      surface: 'pavement',
      occludes: false,
    }],
  }));

  const origin = { x: 0, y: 1, z: 0 };
  const direction = { x: 1, y: 0, z: 0 };
  // The wheel meets it.
  assert.ok(Math.abs((sampler.raycastObstacle(origin, direction, 20) ?? -1) - 9.5) < 1e-6);
  // The ground under it is its top face.
  sampler.sampleGround(10, 0, sample);
  assert.equal(sample.height, 2);
  // The camera does not.
  assert.equal(sampler.raycast(origin, direction, 20), null);
});

test('an occluding box, and an absent flag, both pull the camera in', () => {
  for (const occludes of [true, undefined]) {
    const sampler = new PlanTerrainSampler(plan({
      heightfield: field([[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
      colliders: [{
        centre: { x: 10, y: 1, z: 0 },
        halfExtents: { x: 0.5, y: 1, z: 0.5 },
        rotationY: 0,
        surface: 'pavement',
        ...(occludes === undefined ? {} : { occludes }),
      }],
    }));
    const hit = sampler.raycast({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 20);
    assert.ok(
      hit !== null && Math.abs(hit - 9.5) < 1e-6,
      `occludes: ${String(occludes)} did not obstruct`,
    );
  }
});

test('an empty plan still answers every query', () => {
  // The grid is built from the union of collider bounds, and there is no union
  // of nothing. One empty cell is the answer, and it must not be a branch on
  // every read.
  const sampler = new PlanTerrainSampler(plan({
    heightfield: field([[1, 1, 1], [1, 1, 1], [1, 1, 1]]),
  }));
  assert.equal(sampler.colliderCount, 0);
  sampler.sampleGround(1, 1, sample);
  assert.equal(sample.height, 1);
  assert.equal(sampler.raycastObstacle({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 10), null);
  assert.equal(sampler.raycast({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 }, 10), 4);
});
