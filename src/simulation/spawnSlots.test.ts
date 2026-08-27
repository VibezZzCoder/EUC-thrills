/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { generateLevel } from '../level/generateRoute.ts';
import { LEVEL_IDS, createLevel } from '../level/levels.ts';
import type { BoxCollider, Heightfield, LevelPlan } from '../level/plan.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import {
  SLOT_LATERAL_METRES,
  SLOT_MIN_SEPARATION_METRES,
  SLOT_STEP_TOLERANCE_METRES,
  spawnSlot,
} from './spawnSlots.ts';
import type { SurfaceId } from './world.ts';
import { createGroundSample } from './world.ts';

/**
 * The second rider's spawn, as a contract rather than a phrase — M25 Phase 2
 * (docs/PLANS.md §25.5, amended by the §25.9 review).
 *
 * Two halves, and the second is the one that makes the first mean anything:
 *
 *   1. **Every world this game can build seats a second rider properly.** All
 *      four `LevelPlan` producers plus a sweep of generated seeds, each
 *      asserted for real separation, real ground, and the same road under both
 *      riders. This is the half that fails the day a fifth producer, a new
 *      segment beat, or a re-tuned generator puts something beside a spawn.
 *   2. **The refusals actually bite.** Hand-built worlds where the slot beside
 *      the spawn is a wall, is grass, or does not exist at all, so the two
 *      passes and the last-resort fallback are each observed doing their job.
 *      A validator that has never refused anything is a validator nobody has
 *      tested — `architecture.test.ts` states the same rule about its own
 *      detectors.
 *
 * Nothing here needs `three` or a DOM: a spawn slot is plan data and ground
 * samples, which is what puts it in the sealed half of the codebase at all.
 */

const sample = createGroundSample();

/**
 * The generated sweep.
 *
 * Twenty-four seeds, spelled the way `level/generatedLevel.test.ts` spells
 * its own so the two sweeps name the same worlds — the validator sweep and
 * the placement sweep should not disagree about which routes exist. Route
 * generation is the expensive part of this file (about a fifth of a second a
 * seed), so it is bounded rather than exhaustive; the contract it proves is
 * "every route the generator makes", and a spread this wide has always been
 * how that claim is made here.
 */
const SWEEP = Array.from({ length: 24 }, (_, index) => `sweep-${index}`);

/** Every shipped world, by the id its own producer is reached through. */
function shippedPlans(): { label: string; plan: LevelPlan }[] {
  return LEVEL_IDS.map((id) => ({ label: id, plan: createLevel(id, 'euc') }));
}

/**
 * Assert seat 1's slot is somewhere two riders can actually set off from.
 *
 * Four claims, and each one is a different way the placement could be wrong:
 * they are not in the same place, the slot is on the authored course, the
 * ground under it is the spawn's ground rather than a step, and both riders
 * are pointed the same way.
 */
function assertSeatedBeside(label: string, plan: LevelPlan): void {
  const terrain = new PlanTerrainSampler(plan);
  const first = plan.spawn;
  const second = spawnSlot(first, 1, terrain);

  const separation = Math.hypot(
    second.position.x - first.position.x,
    second.position.z - first.position.z,
  );
  assert.ok(
    separation >= SLOT_MIN_SEPARATION_METRES,
    `${label}: the second rider was seated ${separation.toFixed(3)} m from the first — `
      + 'the last-resort fallback fired, which no shipped world may need',
  );

  terrain.sampleGround(first.position.x, first.position.z, sample);
  const groundHeight = sample.height;
  const groundSurface = sample.surface;

  terrain.sampleGround(second.position.x, second.position.z, sample);
  assert.equal(sample.offCourse, false, `${label}: the second rider starts off the course`);
  assert.ok(
    Math.abs(sample.height - groundHeight) <= SLOT_STEP_TOLERANCE_METRES,
    `${label}: the second rider starts ${(sample.height - groundHeight).toFixed(3)} m off the `
      + "first rider's ground, which is a step rather than a road",
  );
  assert.equal(
    sample.surface,
    groundSurface,
    `${label}: the second rider starts on ${sample.surface} beside a rider on ${groundSurface}`,
  );
  assert.equal(second.headingY, first.headingY, `${label}: the riders start facing different ways`);
  assert.equal(
    second.position.y,
    sample.height,
    `${label}: the slot's height is not the ground beneath it`,
  );
}

// ---------------------------------------------------------------------------
// Every world the game can build
// ---------------------------------------------------------------------------

test('seat 0 is the plan’s own spawn, untouched', () => {
  for (const { label, plan } of shippedPlans()) {
    const terrain = new PlanTerrainSampler(plan);
    assert.equal(
      spawnSlot(plan.spawn, 0, terrain),
      plan.spawn,
      `${label}: seat 0 was moved, and no phase of M25 is allowed to move it`,
    );
  }
});

test('all four LevelPlan producers seat a second rider beside the first', () => {
  const plans = shippedPlans();
  // The producer count is part of the claim: a fifth producer must arrive
  // here rather than quietly ride on four worths of evidence.
  assert.equal(plans.length, 4, 'the producer list moved; the sweep below no longer covers it');
  for (const { label, plan } of plans) assertSeatedBeside(label, plan);
});

test('every generated route in the sweep seats a second rider beside the first', () => {
  for (const seed of SWEEP) {
    assertSeatedBeside(`generated ${seed}`, generateLevel(seed).plan);
  }
});

test('the second rider is seated on the road, not merely near it', () => {
  // The strong form of the claim above, stated once on the world every player
  // starts in: the slot is exactly one lateral offset out, which is what
  // "beside" is supposed to mean before any fallback has been reached.
  const plan = createLevel('slice', 'euc');
  const second = spawnSlot(plan.spawn, 1, new PlanTerrainSampler(plan));
  const separation = Math.hypot(
    second.position.x - plan.spawn.position.x,
    second.position.z - plan.spawn.position.z,
  );
  assert.ok(
    Math.abs(separation - SLOT_LATERAL_METRES) < 1e-9,
    `the slice seated the second rider ${separation.toFixed(3)} m out rather than beside`,
  );
});

test('a third and fourth rider get their own slots, on alternating sides', () => {
  // Stage 1 never asks for these. The generality is asserted because a
  // function that quietly returned one slot to everybody would be a poor
  // thing to discover on the day a mode wants four riders.
  const plan = createLevel('proving', 'euc');
  const terrain = new PlanTerrainSampler(plan);
  const slots = [1, 2, 3, 4].map((index) => spawnSlot(plan.spawn, index, terrain));
  const lateral = slots.map((slot) => slot.position.x - plan.spawn.position.x);

  assert.ok(lateral[0] < 0, 'seat 1 should sit to the leading rider’s right');
  assert.ok(lateral[1] > 0, 'seat 2 should sit to the leading rider’s left');
  assert.ok(
    Math.abs(lateral[2]) > Math.abs(lateral[0]) + 1e-9,
    'seat 3 should sit further out than seat 1',
  );
  for (let a = 0; a < slots.length; a += 1) {
    for (let b = a + 1; b < slots.length; b += 1) {
      const gap = Math.hypot(
        slots[a].position.x - slots[b].position.x,
        slots[a].position.z - slots[b].position.z,
      );
      assert.ok(gap >= SLOT_MIN_SEPARATION_METRES, `seats ${a + 1} and ${b + 1} overlap`);
    }
  }
});

// ---------------------------------------------------------------------------
// The refusals, on worlds built to trigger them
// ---------------------------------------------------------------------------

/** A flat square of ground `half` metres each way from the origin, one metre a cell. */
function flatField(half: number, surfaces?: (column: number, row: number) => SurfaceId): Heightfield {
  const columns = half * 2 + 1;
  const cells: SurfaceId[] = [];
  for (let row = 0; row < columns - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      cells.push(surfaces?.(column, row) ?? 'pavement');
    }
  }
  return {
    originX: -half,
    originZ: -half,
    spacing: 1,
    columns,
    rows: columns,
    heights: new Array(columns * columns).fill(0),
    surfaces: cells,
  };
}

/** A fixture world: flat ground at the origin, facing +Z, plus whatever blocks it. */
function fixture(heightfield: Heightfield, colliders: BoxCollider[] = []): LevelPlan {
  const socket = {
    position: { x: 0, y: 0, z: 0 },
    headingY: 0,
    surface: 'pavement' as const,
    halfWidth: 1,
    gradient: 0,
  };
  return {
    id: 'spawn-slot-fixture',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield,
    segments: [{ id: 'fixture-segment', entry: socket, exit: socket, colliders }],
    checkpoints: [],
  };
}

/** An upright wall two metres tall, centred where it will block a slot. */
function wallAt(x: number, halfX: number): BoxCollider {
  return {
    centre: { x, y: 1, z: 0 },
    halfExtents: { x: halfX, y: 1, z: 8 },
    rotationY: 0,
    surface: 'pavement',
  };
}

test('a wall in the first slot pushes the second rider to the other side', () => {
  // The preferred slot for seat 1 is the leading rider's right, which at a
  // zero heading is -X. Standing a wall there must move them, not bury them.
  const plan = fixture(flatField(10), [wallAt(-SLOT_LATERAL_METRES, 1)]);
  const slot = spawnSlot(plan.spawn, 1, new PlanTerrainSampler(plan));
  assert.ok(
    Math.abs(slot.position.x - SLOT_LATERAL_METRES) < 1e-9,
    `the wall did not move the second rider: they were seated at x=${slot.position.x}`,
  );
  assert.equal(slot.position.y, 0, 'the second rider was seated on top of the wall');
});

test('walls on both sides push the second rider to the staggered slot behind', () => {
  const plan = fixture(flatField(10), [
    wallAt(-SLOT_LATERAL_METRES, 1),
    wallAt(SLOT_LATERAL_METRES, 1),
  ]);
  const slot = spawnSlot(plan.spawn, 1, new PlanTerrainSampler(plan));
  // Behind is -Z at a zero heading, and the only candidate the walls leave is
  // the one straight back: both staggered lateral slots are inside the same
  // walls, which run the length of the fixture.
  assert.ok(Math.abs(slot.position.x) < 1e-9, `expected the centre line, got x=${slot.position.x}`);
  assert.ok(slot.position.z < -1, `expected a slot behind the spawn, got z=${slot.position.z}`);
  assert.equal(slot.position.y, 0, 'the second rider was seated on top of a wall');
});

test('a slot on the wrong surface loses to one on the right surface', () => {
  // The strict pass. Cell (column, row) covers x in [column - 10, +1] and z
  // likewise, so the cell holding x = -1.6 is column 8 and the one holding
  // x = +1.6 is column 11; both sit on row 10, which is z in [0, 1].
  const plan = fixture(flatField(10, (column, row) => (
    column === 8 && row === 10 ? 'grass' : 'pavement'
  )));
  const slot = spawnSlot(plan.spawn, 1, new PlanTerrainSampler(plan));
  assert.ok(
    Math.abs(slot.position.x - SLOT_LATERAL_METRES) < 1e-9,
    `the grass slot was taken anyway: x=${slot.position.x}`,
  );
});

test('when no slot shares the surface, the lenient pass still seats the rider', () => {
  // Same fixture, with the road one cell wide: every candidate is on grass, so
  // the strict pass refuses them all and the second pass takes the preferred
  // one rather than stacking the riders.
  const plan = fixture(flatField(10, (column, row) => (
    column === 10 && row === 10 ? 'pavement' : 'grass'
  )));
  const slot = spawnSlot(plan.spawn, 1, new PlanTerrainSampler(plan));
  assert.ok(
    Math.abs(slot.position.x + SLOT_LATERAL_METRES) < 1e-9,
    `expected the preferred slot on the lenient pass, got x=${slot.position.x}`,
  );
});

test('a world with nowhere to stand hands back the spawn rather than refusing', () => {
  // One square metre of authored ground: every candidate is off the course.
  // The rider is seated anyway, because a game that would not seat a second
  // player is worse than one that seats them merged — and because
  // `SLOT_MIN_SEPARATION_METRES` is where the sweeps above hold that to
  // account for every world anybody can actually ride.
  const plan = fixture(flatField(1));
  const slot = spawnSlot(plan.spawn, 1, new PlanTerrainSampler(plan));
  assert.equal(slot, plan.spawn, 'the last resort should be the plan’s own spawn, verbatim');
});
