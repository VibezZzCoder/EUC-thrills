/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PART_COSTS } from '../data/renderCost.ts';
import { PROP_BUDGET, PROP_SIZES } from '../data/props.ts';
import { MATERIALS } from '../data/surfaces.ts';
import { CHALLENGE, TERRAIN } from '../data/tuning.ts';
import { ChallengeRun } from '../simulation/challenge.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { RaceRun } from '../simulation/raceRun.ts';
import { RouteSpine } from '../simulation/routeSpine.ts';
import { raceGridSlot, spawnSlot } from '../simulation/spawnSlots.ts';
import { TrackDayRun } from '../simulation/trackDay.ts';
import { createGroundSample } from '../simulation/world.ts';
import { createLevel, type LevelId } from './levels.ts';
import { fieldHeightAt } from './buildPlan.ts';
import { canonicalPlanString, planDigest } from './planDigest.ts';
import type { LevelPlan } from './plan.ts';
import {
  planRenderCost,
  withinQuadRenderBudget,
  withinRenderBudget,
  withinSplitRenderBudget,
} from './renderBudget.ts';
import {
  SKATEPARK_BLOCKS,
  SKATEPARK_CLUSTERS,
  SKATEPARK_FIELD,
  SKATEPARK_KICKERS,
  SKATEPARK_PALETTE,
  SKATEPARK_PLAN_ID,
  SKATEPARK_RIDING,
  SKATEPARK_SPAWN,
  SKATEPARK_TRICK_ZONES,
  SKATEPARK_WALL,
  SKATEPARK_WEAR,
  createSkateparkLevel,
} from './skateparkLevel.ts';
import { copingRunTriangles, drawnHeight, yardSceneryTriangles } from './yardScenery.ts';
import { terrainCells } from './terrainCoverage.ts';
import { trickZoneAt, validTrickZones, type TrickZone } from './trickZones.ts';

const plan = createSkateparkLevel();
const field = plan.heightfield;
/**
 * The yard scenery mesh after critic pass 2: pipes, skirts, bands and grout,
 * lip stripes, crest lines, joints, stains, paint, toe plates and masts.
 */
const YARD_SCENERY_TRIANGLES = 9_380;
const sampler = new PlanTerrainSampler(plan);
const probe = createGroundSample();
const groundAt = (x: number, z: number) => {
  sampler.sampleGround(x, z, probe);
  return { height: probe.height, surface: probe.surface, offCourse: probe.offCourse };
};

// ---------------------------------------------------------------------------
// 1 — the other worlds did not move
// ---------------------------------------------------------------------------

/** `planDigest(createLevel(id))` before 1.4.0's first edit (`docs/PLANS.md` §51.1). */
const BASELINE_DIGESTS: Readonly<Record<Exclude<LevelId, 'generated' | 'skatepark'>, string>> = {
  slice: 'afad43aea2a90a63f655d3a1534e090f',
  track: '34ca476ee0439c927fa91a4963bae06b',
  switchback: '8181221d39881d6505e6bb0e16eedd2c',
  euclaude: 'ebb61737ca3356ce2eb26cac9fb253c2',
  proving: '6f5e47adbe23beb05dbc717ca89cc672',
};

test('the five shipped worlds are byte-identical, and none carries a skatepark key', () => {
  // **The new keys are optional and absent elsewhere, and `planDigest` omits
  // an absent key**, so the proof that 1.4.0 changed nobody else is these five
  // digests, measured before the first edit. A producer that emitted
  // `transition: {}` or `recovery: undefined` would move its own digest here.
  for (const [id, digest] of Object.entries(BASELINE_DIGESTS) as [keyof typeof BASELINE_DIGESTS, string][]) {
    const other = createLevel(id);
    assert.equal(planDigest(other), digest, id);
    assert.equal('transition' in other.heightfield, false, `${id} carries transition cells`);
    assert.equal('recovery' in other, false, `${id} carries a recovery policy`);
    assert.equal('copings' in other, false, `${id} carries copings`);
    assert.equal('yardWear' in other, false, `${id} carries yard wear`);
    const text = canonicalPlanString(other);
    for (const key of ['"transition"', '"recovery"', '"copings"', '"yardWear"']) {
      assert.equal(text.includes(key), false, `${id}'s canonical plan spells ${key}`);
    }
  }
});

test('an absent key is not a present one: each new key moves the digest only where it is written', () => {
  const without = (key: 'recovery' | 'copings' | 'yardWear'): LevelPlan => {
    const copy: Partial<LevelPlan> = { ...plan };
    delete copy[key];
    return copy as LevelPlan;
  };
  const digest = planDigest(plan);
  assert.notEqual(planDigest(without('recovery')), digest);
  assert.notEqual(planDigest(without('copings')), digest);
  assert.notEqual(planDigest(without('yardWear')), digest);
  const { transition: _cells, ...bare } = field;
  assert.notEqual(planDigest({ ...plan, heightfield: bare }), digest);
  // And deleting one is the same plan as never having written it.
  assert.equal(planDigest(without('recovery')), planDigest({ ...without('recovery') }));
});

/**
 * `planDigest(createLevel('skatepark'))` for release 1.4.0 (`docs/PLANS.md`
 * §51.7.3; QA C1). Moved from 750a8652… by QA round 1's trick-zone repairs
 * (TR-1 berm arc past the lip, TR-2 east wall clipped to the coping, TR-3
 * seams shared). A later move needs a recorded reason; once released, a
 * change to geometry or trick zones also needs a new plan id, since records
 * are keyed on it.
 */
const YARD_DIGEST = '1951de6a8cb1d88f218e7dc5b80f61b3';

test('the plan is its own: id, revision, a stable build', () => {
  assert.equal(plan.id, SKATEPARK_PLAN_ID);
  assert.equal(plan.id, 'foundry-yard-r1');
  assert.equal(planDigest(plan), YARD_DIGEST);
  assert.equal(planDigest(createLevel('skatepark')), planDigest(plan));
  // Hand-built: the seed and the `?mph=` wheel are not inputs.
  assert.equal(planDigest(createLevel('skatepark', 'another-seed', undefined, undefined, 90)), planDigest(plan));
  assert.deepEqual(plan.recovery, { speed: 'rest' });
});

// ---------------------------------------------------------------------------
// 2 — modes: a start line, no lap, no race
// ---------------------------------------------------------------------------

test('one start checkpoint and no lap: Trick Run only, never a timed route', () => {
  assert.equal(plan.checkpoints.length, 1);
  const [start] = plan.checkpoints;
  assert.equal(start.id, 'start');
  assert.equal(start.kind, 'start');
  assert.equal(start.routeIndex, 0);
  assert.deepEqual({ x: start.centre.x, z: start.centre.z }, { x: 116, z: 124 });
  assert.equal(start.headingY, Math.PI / 2);
  assert.deepEqual(start.halfExtents, { x: 3, y: 2, z: 0.5 });
  assert.equal(start.centre.y, start.halfExtents.y, 'the gate stands on the floor');
  assert.equal(plan.lap, undefined);
  assert.equal('lap' in plan, false);
  assert.equal(plan.targets, undefined);
  assert.equal(plan.hazards, undefined);
  assert.equal(plan.launchPads, undefined);

  assert.equal(new ChallengeRun(plan.id, plan.checkpoints).available, false);
  assert.equal(new TrackDayRun(plan.id, plan.checkpoints, plan.lap ?? null).available, false);
  assert.equal(new RaceRun(plan.checkpoints, plan.lap ?? null).available, false);
  assert.equal(RouteSpine.fromPlan(plan), null);
});

test('the solo start is 18 m behind the line on the flat run-up lane', () => {
  const [start] = plan.checkpoints;
  const x = start.centre.x - Math.sin(start.headingY) * CHALLENGE.startRunupMetres;
  const z = start.centre.z - Math.cos(start.headingY) * CHALLENGE.startRunupMetres;
  assert.ok(Math.abs(x - 98) < 1e-9 && Math.abs(z - 124) < 1e-9, `solo start at ${x}, ${z}`);
  // The run-up lane x 94–116, z 121–127 is flat floor: no block, no shaped cell.
  for (let lx = 94; lx <= 116; lx += 0.5) {
    for (let lz = 121; lz <= 127; lz += 0.5) {
      const here = groundAt(lx, lz);
      assert.equal(here.height, 0, `the run-up is not flat at ${lx}, ${lz}`);
      assert.equal(here.offCourse, false);
      assert.equal(trickZoneAt(plan.trickZones, lx, lz), null, `a zone reaches the run-up at ${lx}, ${lz}`);
    }
  }
  // Ten metres of floor behind the rider before the west plinth (the chase lens is 6 m).
  assert.ok(x - SKATEPARK_RIDING.minX >= 10);
});

test('spawn and every couch seat stand on level floor, outside every zone', () => {
  assert.deepEqual(plan.spawn, { position: { x: 100, y: 0, z: 124 }, headingY: Math.PI / 2 });
  assert.deepEqual(plan.spawn, { position: { ...SKATEPARK_SPAWN.position }, headingY: SKATEPARK_SPAWN.headingY });
  const [start] = plan.checkpoints;
  const grid = [0, 1, 2, 3].map((index) => raceGridSlot(start, index, sampler));
  const expected = [[112.8, 122.4], [112.8, 125.6], [109.6, 122.4], [109.6, 125.6]];
  const seen = grid.map((slot) => [slot.position.x, slot.position.z]
    .map((value) => Math.round(value * 100) / 100)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(seen, [...expected].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  const seats = [0, 1, 2, 3].map((index) => spawnSlot(plan.spawn, index, sampler));
  for (const slot of [...grid, ...seats, { position: plan.spawn.position }, { position: start.centre }]) {
    const { x, z } = slot.position;
    assert.equal(groundAt(x, z).height, 0, `${x}, ${z} is not on the floor`);
    assert.equal(trickZoneAt(plan.trickZones, x, z), null, `${x}, ${z} stands in a zone`);
  }
});

// ---------------------------------------------------------------------------
// 3 — the zones
// ---------------------------------------------------------------------------

/** Separating-axis overlap of two convex polygons (touching is not overlapping). */
function overlaps(a: TrickZone, b: TrickZone): boolean {
  for (const shape of [a, b]) {
    const corners = shape.corners;
    for (let index = 0; index < corners.length; index += 1) {
      const p = corners[index];
      const q = corners[(index + 1) % corners.length];
      const nx = -(q.z - p.z);
      const nz = q.x - p.x;
      const project = (zone: TrickZone) => zone.corners.map((c) => c.x * nx + c.z * nz);
      const pa = project(a);
      const pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

test('seventeen zones, one per feature: valid, convex and disjoint', () => {
  const zones = plan.trickZones ?? [];
  assert.equal(zones, SKATEPARK_TRICK_ZONES);
  assert.equal(zones.length, 17);
  assert.ok(validTrickZones(zones), 'a zone is degenerate, concave, unnamed or repeated');
  assert.deepEqual(zones.map((zone) => zone.id).sort(), [
    'bowl', 'euro-gap', 'hip-pyramid', 'kicker-k1', 'kicker-k2', 'ledge-l1', 'ledge-l2', 'manual-1',
    'manual-2', 'mini', 'planter-line', 'qp-east-mid', 'qp-east-north', 'qp-east-south', 'snake-berm',
    'snake-rollers', 'stair-deck',
  ]);
  for (let i = 0; i < zones.length; i += 1) {
    for (let j = i + 1; j < zones.length; j += 1) {
      assert.equal(overlaps(zones[i], zones[j]), false, `${zones[i].id} overlaps ${zones[j].id}`);
    }
  }
  // Inside the riding area, every one.
  for (const zone of zones) {
    for (const corner of zone.corners) {
      assert.ok(corner.x >= SKATEPARK_RIDING.minX && corner.x <= SKATEPARK_RIDING.maxX, `${zone.id} leaves the yard`);
      assert.ok(corner.z >= SKATEPARK_RIDING.minZ && corner.z <= SKATEPARK_RIDING.maxZ, `${zone.id} leaves the yard`);
    }
  }
  // Zones cost nothing: the plan without them prices the same.
  const { trickZones: _zones, ...bare } = plan;
  assert.deepEqual(planRenderCost(bare as LevelPlan), planRenderCost(plan));
});

test('QA round 1: the east wall is zoned seam to seam and coping-deep, the berm wall past its lip', () => {
  const zones = plan.trickZones ?? [];
  // TR-3: no off-feature seam on the continuous wall face.
  for (let z = 96.75; z <= 148.25 + 1e-9; z += 0.05) {
    assert.notEqual(trickZoneAt(zones, 162.4, z), null, `the east wall's face at z ${z.toFixed(2)} is off-feature`);
  }
  // TR-2: the level deck past the coping (x 162.5) is not inside a section, so
  // nobody stands in a band; the coping line itself is.
  for (const z of [104, 113.75, 124, 131.75, 140]) {
    assert.equal(trickZoneAt(zones, 162.505, z), null, `deck at z ${z} stands in a zone`);
    assert.notEqual(trickZoneAt(zones, 162.5, z), null, `the coping at z ${z} is off-feature`);
    assert.equal(sampler.sampleGround(162.6, z, probe).normal.y, 1, 'the strip past the coping is level deck');
    assert.equal(sampler.transitionAt(162.6, z), false, 'the strip past the coping is unflagged');
  }
  // TR-1: the berm's outer lip, r = bermRadius + halfWidth round (142, 152.25),
  // and a few centimetres past it — where a come-back air's launch latches —
  // are on the berm's zone around the whole quarter.
  for (let degrees = 0; degrees <= 90; degrees += 2.5) {
    const angle = (degrees * Math.PI) / 180;
    for (const radius of [9.25, 9.35, 9.5, 9.65]) {
      const x = 142 + radius * Math.cos(angle);
      const z = 152.25 + radius * Math.sin(angle);
      assert.equal(trickZoneAt(zones, x, z), 'snake-berm', `berm lip at ${degrees}°, r ${radius} is off-feature`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4 — the ground
// ---------------------------------------------------------------------------

const SQUARES = [
  '11,12', '11,13', '12,12', '12,13', '12,19', '12,20', '13,19', '13,20', '14,12', '14,13', '14,17',
  '14,19', '14,20', '15,12', '15,13', '15,15', '15,19', '15,20', '16,12', '16,13', '16,17', '16,19',
  '16,20', '17,19', '17,20', '18,18', '18,19', '18,20', '20,12', '20,13', '20,14', '20,15', '20,16',
  '20,17', '20,18',
];

function squareOf(x: number, z: number): string {
  return `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
}

test('the field is the rectangle §51.4.1 draws, at 0.25 m', () => {
  assert.equal(field.originX, SKATEPARK_FIELD.originX);
  assert.equal(field.originZ, SKATEPARK_FIELD.originZ);
  assert.equal(field.spacing, 0.25);
  assert.equal(field.columns, 385);
  assert.equal(field.rows, 353);
  assert.deepEqual(plan.surround, { height: 0, surface: 'pavement' });
  assert.ok(field.surfaces.every((surface) => surface === 'pavement'), 'one surface bucket');
  assert.equal(field.traction, undefined);
});

test('the floor is exactly 0 everywhere but the 35 shaped squares', () => {
  const shaped = new Set(SQUARES);
  let lowest = 0;
  let highest = 0;
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns; column += 1) {
      const x = field.originX + column * field.spacing;
      const z = field.originZ + row * field.spacing;
      const h = field.heights[row * field.columns + column];
      lowest = Math.min(lowest, h);
      highest = Math.max(highest, h);
      if (h === 0) {
        assert.ok(Object.is(h, 0), `a negative zero at ${x}, ${z}`);
        continue;
      }
      // A nonzero sample must sit strictly inside a shaped square, with its
      // quarter-metre neighbours too (`terrainCoverage` marks the patch
      // beyond each neighbour), so no lattice line carries one.
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25], [0, 0]]) {
        assert.ok(shaped.has(squareOf(x + dx, z + dz)), `${x}, ${z} (${h}) reaches square ${squareOf(x + dx, z + dz)}`);
      }
    }
  }
  assert.equal(highest, SKATEPARK_WALL.height, 'the quarter-pipe deck');
  assert.equal(lowest, -SKATEPARK_WALL.height, 'the bowl and mini floors');
  // The border ring is the surround (`buildPlan` demands it of a ground function).
  for (let column = 0; column < field.columns; column += 1) {
    assert.equal(field.heights[column], 0);
    assert.equal(field.heights[(field.rows - 1) * field.columns + column], 0);
  }
});

test('T75: one wall profile — R 2.0 behind a 0.6 m foot, 1.49 m, 2.23 m in plan, 66° drawn', () => {
  assert.equal(SKATEPARK_WALL.height, 1.49);
  assert.ok(Math.abs(SKATEPARK_WALL.run - 2.23) < 0.01, `run ${SKATEPARK_WALL.run}`);
  // The last drawn chord, lip on a grid node.
  const chord = Math.atan2(SKATEPARK_WALL.height - SKATEPARK_WALL.rise(SKATEPARK_WALL.run - 0.25), 0.25) * 180 / Math.PI;
  assert.ok(chord > 65 && chord < 67.5, `last chord ${chord.toFixed(1)}°`);
  // On the real plan: QP-E's last face cell ends on the coping node at 1.49.
  const at = (x: number, z: number) => field.heights[Math.round((z - field.originZ) / 0.25) * field.columns
    + Math.round((x - field.originX) / 0.25)];
  assert.equal(at(162.5, 124), 1.49);
  assert.equal(at(160.25, 124), 0);
  assert.equal(at(167.5, 124), 1.49);
  assert.equal(at(167.75, 124), 0, 'the deck ends under the plinth');
  assert.equal(at(97, 105), -1.49, 'the mini floor');
  assert.equal(at(104, 158), -1.49, 'the bowl floor');
});

test('no block is buried by the field: the ground under every riding block sits below its top', () => {
  // The other way round would be a sliver of bank standing proud of a stair
  // tread, which the sampler would answer instead of the tread.
  for (const { collider } of SKATEPARK_BLOCKS) {
    const top = collider.centre.y + collider.halfExtents.y;
    const x0 = collider.centre.x - collider.halfExtents.x;
    const z0 = collider.centre.z - collider.halfExtents.z;
    for (let i = 0; i <= 40; i += 1) {
      for (let j = 0; j <= 40; j += 1) {
        const x = x0 + (2 * collider.halfExtents.x * i) / 40;
        const z = z0 + (2 * collider.halfExtents.z * j) / 40;
        const under = fieldHeightAt(field, plan.surround, x, z);
        assert.ok(under <= top - 0.01, `the field stands ${(under - top).toFixed(3)} m proud of a block at ${x.toFixed(2)}, ${z.toFixed(2)}`);
        assert.equal(groundAt(x, z).height >= top - 1e-9 || i === 0 || j === 0 || i === 40 || j === 40, true);
      }
    }
  }
});

test('the drawn ground: 35 squares, pinned', () => {
  const cost = planRenderCost(plan);
  const cells = terrainCells(plan);
  const squares = new Set<string>();
  const columns = field.columns - 1;
  for (const list of cells.bySurface.values()) {
    for (const cell of list) {
      const x = field.originX + (cell % columns) * field.spacing;
      const z = field.originZ + Math.floor(cell / columns) * field.spacing;
      squares.add(squareOf(x, z));
      // Every drawn cell inside one 256 m tile.
      assert.ok(x >= 0 && x + field.spacing <= 256 && z >= 0 && z + field.spacing <= 256);
    }
  }
  assert.deepEqual([...squares].sort(), [...SQUARES].sort());
  assert.equal(SQUARES.length, 35);
  assert.deepEqual([...cells.bySurface.keys()], ['pavement']);
  assert.equal(cost.cellsDrawn, 35 * 1024);
  assert.equal(cost.fieldPatches, 17_257);
  // Each cluster draws inside the squares it declares.
  const declared = new Set<string>();
  for (const cluster of SKATEPARK_CLUSTERS) {
    const [x0, x1, z0, z1] = cluster.squares;
    for (let sx = x0; sx <= x1; sx += 1) for (let sz = z0; sz <= z1; sz += 1) declared.add(`${sx},${sz}`);
  }
  for (const square of squares) assert.ok(declared.has(square), square);
});

test('transition cells: every face, the floor under every narrow block, the euro pit — and nothing else', () => {
  const cells = field.transition ?? {};
  const columns = field.columns - 1;
  const flagged = new Set(Object.keys(cells).map(Number));
  assert.ok(Object.values(cells).every((value) => value === true));
  const level = (cell: number): boolean => {
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    const h = (c: number, r: number) => field.heights[r * field.columns + c];
    const values = [h(column, row), h(column + 1, row), h(column, row + 1), h(column + 1, row + 1)];
    return Math.max(...values) - Math.min(...values) <= 1e-9;
  };
  const centre = (cell: number) => ({
    x: field.originX + ((cell % columns) + 0.5) * field.spacing,
    z: field.originZ + (Math.floor(cell / columns) + 0.5) * field.spacing,
  });
  const narrow = SKATEPARK_BLOCKS.filter((block) => block.narrow).map((block) => block.collider);
  const underNarrow = (x: number, z: number): boolean => narrow.some((box) =>
    Math.abs(x - box.centre.x) < box.halfExtents.x + field.spacing / 2
    && Math.abs(z - box.centre.z) < box.halfExtents.z + field.spacing / 2);
  const inPit = (x: number, z: number): boolean => x > 127 && x < 128.5 && z > 96.25 && z < 102.75;
  let sloped = 0;
  for (let cell = 0; cell < field.surfaces.length; cell += 1) {
    const { x, z } = centre(cell);
    if (!level(cell)) {
      sloped += 1;
      assert.ok(flagged.has(cell), `a shaped cell at ${x}, ${z} is not flagged`);
    } else if (flagged.has(cell)) {
      assert.ok(underNarrow(x, z) || inPit(x, z), `a level cell at ${x}, ${z} is flagged`);
    }
  }
  // The census, pinned: sloped cells plus the level floor under ledges,
  // pads, planters, treads, the cheek, the lip blocks and the pit. (12,798 /
  // 13,904 before the gates stage widened the mini to 11.5 m and eased the
  // bowl roll-out's sides.)
  assert.equal(sloped, 12_981);
  assert.equal(flagged.size, 14_087);
  // Places a recovery may land stay unflagged: the stair deck, the QP-E deck, the bowl and mini floors, the plaza.
  const cellAt = (x: number, z: number) => Math.floor((z - field.originZ) / 0.25) * columns + Math.floor((x - field.originX) / 0.25);
  for (const [x, z] of [[122.1, 102.1], [165.1, 124.1], [104.1, 158.1], [97.1, 105.1], [120.1, 130.1]]) {
    assert.equal(flagged.has(cellAt(x, z)), false, `${x}, ${z} is flagged`);
  }
  for (const [x, z] of [[148.1, 101.4], [108.1, 118.4], [143.1, 117.1], [103.1, 139.1], [130.1, 165.4], [127.6, 99.1]]) {
    assert.equal(flagged.has(cellAt(x, z)), true, `${x}, ${z} is not flagged`);
  }
});

// ---------------------------------------------------------------------------
// 5 — the fence, the backdrop, the dressing
// ---------------------------------------------------------------------------

const segmentColliders = plan.segments.flatMap((segment) => segment.colliders);

test('the perimeter: a brick plinth all round, raised on the decks, and an undrawn see-through guard', () => {
  const plinth = segmentColliders.filter((box) => box.appearance === 'brick' && box.drawn !== false
    && (box.centre.x < SKATEPARK_RIDING.minX || box.centre.x > SKATEPARK_RIDING.maxX
      || box.centre.z < SKATEPARK_RIDING.minZ || box.centre.z > SKATEPARK_RIDING.maxZ));
  const guard = segmentColliders.filter((box) => box.drawn === false);
  assert.equal(plinth.length, 8);
  assert.equal(guard.length, 8);
  for (const box of guard) assert.equal(box.occludes, false, 'the guard pulls the chase camera in');
  const tops = (boxes: typeof plinth) => boxes.map((box) => +(box.centre.y + box.halfExtents.y).toFixed(4)).sort();
  assert.deepEqual([...new Set(tops(plinth))], [1, 1.9, 2.49]);
  assert.deepEqual([...new Set(tops(guard))], [2.4, 2.9, 3.49]);
  // Every guard box stands on its own plinth box.
  for (const box of guard) {
    const under = plinth.find((p) => p.centre.x === box.centre.x && p.centre.z === box.centre.z);
    assert.ok(under !== undefined);
    assert.equal(+(box.centre.y - box.halfExtents.y).toFixed(6), +(under.centre.y + under.halfExtents.y).toFixed(6));
  }
  // Closed: walking the inner faces, every point has a plinth behind it.
  const behind = (x: number, z: number) => plinth.some((box) => Math.abs(x - box.centre.x) <= box.halfExtents.x + 1e-9
    && Math.abs(z - box.centre.z) <= box.halfExtents.z + 1e-9);
  const r = SKATEPARK_RIDING;
  for (let x = r.minX - 0.25; x <= r.maxX + 0.25; x += 0.25) {
    assert.ok(behind(x, r.minZ - 0.1) && behind(x, r.maxZ + 0.1), `a gap in the fence at x ${x}`);
  }
  for (let z = r.minZ - 0.25; z <= r.maxZ + 0.25; z += 0.25) {
    assert.ok(behind(r.minX - 0.1, z) && behind(r.maxX + 0.1, z), `a gap in the fence at z ${z}`);
  }
  // Deck + 1.0 / guard deck + 2.0 beside the two raised decks (D22).
  assert.equal(groundAt(r.maxX + 0.2, 124).height, 3.49);
  assert.equal(groundAt(r.maxX + 0.2, 160).height, 2.4);
  assert.equal(groundAt(122, r.minZ - 0.4).height, 2.9);
  assert.equal(groundAt(164, r.minZ - 0.4).height, 3.49);
  assert.equal(groundAt(100, r.maxZ + 0.4).height, 2.4);
});

test('128 fence bays stand on the plinth top, whole bays only', () => {
  const bays = (plan.props ?? []).filter((prop) => prop.kind === 'fenceBay');
  assert.equal(bays.length, 128);
  const plinth = segmentColliders.filter((box) => box.appearance === 'brick' && box.drawn !== false);
  for (const bay of bays) {
    const under = plinth.filter((box) => Math.abs(bay.position.x - box.centre.x) <= box.halfExtents.x
      && Math.abs(bay.position.z - box.centre.z) <= box.halfExtents.z);
    assert.equal(under.length, 1, `bay at ${bay.position.x}, ${bay.position.z}`);
    const top = under[0].centre.y + under[0].halfExtents.y;
    assert.ok(Math.abs(bay.position.y - top) < 1e-9, `a bay floats or sinks at ${bay.position.x}, ${bay.position.z}`);
  }
  // No bay straddles two plinth heights: each one's ends sit on its own box.
  for (const bay of bays) {
    const along = Math.abs(Math.sin(bay.rotationY)) > 0.5 ? 'x' : 'z';
    for (const end of [-1, 1]) {
      const x = bay.position.x + (along === 'x' ? end * (PROP_SIZES.fenceBay.length / 2 - 0.05) : 0);
      const z = bay.position.z + (along === 'z' ? end * (PROP_SIZES.fenceBay.length / 2 - 0.05) : 0);
      const tops = plinth.filter((box) => Math.abs(x - box.centre.x) <= box.halfExtents.x
        && Math.abs(z - box.centre.z) <= box.halfExtents.z).map((box) => box.centre.y + box.halfExtents.y);
      assert.ok(tops.some((top) => Math.abs(top - bay.position.y) < 1e-9), `a bay end overhangs at ${x}, ${z}`);
    }
  }
});

test('the backdrop: twelve buildings, 7 or 13 m, at least 8 m outside the plinth', () => {
  const buildings = (plan.props ?? []).filter((prop) => prop.kind === 'building');
  assert.equal(buildings.length, 12);
  const outer = { minX: 87.5, maxX: 168.5, minZ: 95.75, maxZ: 168.5 };
  for (const b of buildings) {
    const size = b.size;
    assert.ok(size !== undefined);
    assert.ok(size.y === 7 || size.y === 13, `a ${size.y} m building`);
    const quarter = Math.abs(Math.sin(b.rotationY)) > 0.5;
    const hx = (quarter ? size.z : size.x) / 2;
    const hz = (quarter ? size.x : size.z) / 2;
    const [x0, x1, z0, z1] = [b.position.x - hx, b.position.x + hx, b.position.z - hz, b.position.z + hz];
    const clear = Math.max(outer.minX - x1, x0 - outer.maxX, outer.minZ - z1, z0 - outer.maxZ);
    assert.ok(clear >= 8 - 1e-9, `a building ${clear.toFixed(2)} m from the plinth`);
    assert.ok(x0 >= 0 && x1 < 256 && z0 >= 0 && z1 < 256, 'a building leaves the tile');
  }
  // The solids they become are the only occluders outside the fence.
  assert.equal((plan.solids ?? []).filter((solid) => solid.occludes !== false).length, 12);
});

test('dressing: eight lamps outside, four benches and two bins on the west deck, nothing in a lane or zone', () => {
  const props = plan.props ?? [];
  const count = (kind: string) => props.filter((prop) => prop.kind === kind).length;
  assert.equal(count('lampPost'), 8);
  assert.equal(count('bench'), 4);
  assert.equal(count('litterBin'), 2);
  assert.equal(props.length, 128 + 12 + 8 + 4 + 2);
  for (const prop of props) {
    if (prop.kind === 'lampPost') {
      const inside = prop.position.x > 87.5 && prop.position.x < 168.5 && prop.position.z > 95.75 && prop.position.z < 168.5;
      assert.equal(inside, false, 'a lamp inside the yard');
    }
    if (prop.kind === 'bench' || prop.kind === 'litterBin') {
      assert.ok(prop.position.x >= 88 && prop.position.x <= 90 && prop.position.z >= 128 && prop.position.z <= 148);
      assert.equal(trickZoneAt(plan.trickZones, prop.position.x, prop.position.z), null);
    }
  }
  assert.equal(plan.softBodies, undefined, 'no soft bodies on the tops');
  assert.equal(plan.markings, undefined);
});

test('every block and prop is inside one 256 m tile', () => {
  for (const box of segmentColliders) {
    assert.ok(box.centre.x - box.halfExtents.x >= 0 && box.centre.x + box.halfExtents.x < 256);
    assert.ok(box.centre.z - box.halfExtents.z >= 0 && box.centre.z + box.halfExtents.z < 256);
  }
  for (const prop of plan.props ?? []) {
    assert.ok(prop.position.x >= 0 && prop.position.x < 256 && prop.position.z >= 0 && prop.position.z < 256);
  }
  // And the field itself, and within the surround backstop.
  assert.ok(field.originX >= 0 && field.originX + (field.columns - 1) * field.spacing <= 256);
  assert.ok(field.originZ >= 0 && field.originZ + (field.rows - 1) * field.spacing <= 256);
  assert.ok(256 < TERRAIN.surroundBackstopHalfExtent);
});

test('blocks use only existing materials, and the palette is a legal retint', () => {
  const materials = new Set(segmentColliders.map((box) => box.appearance));
  assert.deepEqual([...materials].sort(), ['brick', 'concrete', 'metal']);
  assert.ok(segmentColliders.every((box) => box.surface === 'pavement'));
  assert.deepEqual(plan.palette, SKATEPARK_PALETTE);
  const luminance = (hex: number) => {
    const linear = [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff].map((c) => (c / 255) ** 2.2);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  for (const [id, albedo] of Object.entries(SKATEPARK_PALETTE) as [string, number][]) {
    assert.ok(id in MATERIALS, `the palette invents ${id}`);
    assert.ok(luminance(albedo) > 0.03 && luminance(albedo) < 0.6, `${id} at ${luminance(albedo).toFixed(3)}`);
  }
  // Light concrete floor, lighter than it was; blocks still read over it.
  assert.ok(luminance(SKATEPARK_PALETTE.pavement!) > luminance(MATERIALS.pavement.albedo));
  assert.ok(luminance(SKATEPARK_PALETTE.concrete!) > 1.6 * luminance(SKATEPARK_PALETTE.pavement!));
});

test('copings are render data only: on the lips, never a collider', () => {
  const copings = plan.copings;
  assert.ok(copings !== undefined);
  assert.equal(copings.radius, 0.03);
  // Five walls' pipes, the two kickers' steel edges, three poured snake lips
  // (critic pass 1, A2/A3/T3) and the pyramid's four poured crest lines
  // (critic pass 2, K2).
  assert.equal(copings.runs.length, 14);
  assert.equal(copings.runs.filter((run) => run.style === 'edge').length, 7);
  // Pool coping on the quarter-pipe, the mini, the bowl and the berm (K3);
  // a lip stripe only on the two kickers (K1).
  assert.equal(copings.runs.filter((run) => run.style !== 'edge' && run.band !== undefined).length, 5);
  assert.equal(copings.runs.filter((run) => run.cap !== undefined).length, 2);
  let length = 0;
  for (const run of copings.runs) {
    assert.ok(run.points.length >= 2);
    if (run.style === 'edge') {
      // A poured lip is the field's own lip: the snake's on the floor at 0,
      // the pyramid's on its 0.60 top (a few centimetres under, where an arc
      // point falls between samples), never a raised line.
      for (const point of run.points) {
        assert.ok(point.y === 0 || point.y === 0.6, `a poured lip at ${point.y}`);
        const h = groundAt(point.x, point.z).height;
        assert.ok(h <= point.y && h > point.y - 0.1, `a poured lip at ${point.x}, ${point.z} stands at ${h}`);
      }
      continue;
    }
    for (let i = 1; i < run.points.length; i += 1) {
      const a = run.points[i - 1];
      const b = run.points[i];
      length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    for (const point of run.points) {
      // The pipe's top within 0..0.02 m of the deck beside it: the floor, a
      // kicker's 0.30 lip, or the quarter-pipe's deck.
      const deck = point.y > 1 ? SKATEPARK_WALL.height : point.y > 0.2 ? 0.3 : 0;
      const top = point.y + copings.radius;
      assert.ok(top >= deck && top <= deck + 0.02, `a coping top at ${top} over a ${deck} deck`);
    }
  }
  assert.ok(length > 120 && length < 230, `${length.toFixed(1)} m of coping`);
  // No drawn collider is metal: the kicker lips are concrete under a steel
  // edge (the 'metal' bucket rendered them near-black), and the guards are
  // undrawn.
  const metal = segmentColliders.filter((box) => box.appearance === 'metal' && box.drawn !== false);
  assert.equal(metal.length, 0);
});

test('the yard scenery helper draws where the terrain draws', () => {
  // `drawnHeight` is the pure copy of the sampler's cell split that the
  // coping skirt and the poured-lip bands stand on (critic pass 1, T2).
  for (let i = 0; i < 400; i += 1) {
    const x = 92 + ((i * 37) % 397) * 0.19, z = 98 + ((i * 53) % 389) * 0.17;
    const expected = groundAt(x, z).height;
    const sampled = drawnHeight(field, x, z);
    // Away from blocks, which the sampler answers with their tops.
    if (Math.abs(expected - sampled) > 1e-9) {
      assert.ok(segmentColliders.some((box) => Math.abs(x - box.centre.x) <= box.halfExtents.x + 1e-6
        && Math.abs(z - box.centre.z) <= box.halfExtents.z + 1e-6), `${x}, ${z}: ${sampled} drawn, ${expected} ridden`);
    }
  }
});

test('yard wear is render data only: patches over the faces, panels on the plinth and the blocks\' sides', () => {
  assert.equal(plan.yardWear, SKATEPARK_WEAR);
  const wear = SKATEPARK_WEAR;
  assert.ok(wear.faceShade > 0.6 && wear.faceShade < 1);
  assert.ok(wear.lipGrime > 0 && wear.lipGrime < 0.6 && wear.scuff > 0 && wear.scuff < 0.3);
  for (const patch of wear.patches) {
    assert.ok(patch.x0 < patch.x1 && patch.z0 < patch.z1);
    assert.ok(patch.x0 >= SKATEPARK_FIELD.originX && patch.x1 <= SKATEPARK_FIELD.maxX);
    assert.ok(patch.z0 >= SKATEPARK_FIELD.originZ && patch.z1 <= SKATEPARK_FIELD.maxZ);
    assert.ok(patch.strength > 0 && patch.strength <= 0.6, `a patch at ${patch.strength}`);
  }
  // Each panel stands on the inner face of a 1.0 m brick plinth box, inside
  // its length and under its top, with the plaza's floor at 0 in front: never
  // behind a deck, a bank, a raised run or a riding block. Critic pass 2
  // (R3): a 'concrete' panel stands instead on a riding block's side, over
  // floor at 0 — never on a ride surface.
  const brick = segmentColliders.filter((box) => box.appearance === 'brick' && box.drawn !== false);
  const sides = SKATEPARK_BLOCKS.map((block) => block.collider).filter((box) => box.appearance === 'concrete');
  for (const panel of wear.murals) {
    const alongX = panel.normal === 'z+' || panel.normal === 'z-';
    const sign = panel.normal.endsWith('+') ? 1 : -1;
    const half = panel.width / 2;
    const host = (panel.ground === 'concrete' ? sides : brick).find((box) => {
      const { centre: c, halfExtents: e } = box;
      const face = alongX ? c.z + sign * e.z : c.x + sign * e.x;
      const at = alongX ? panel.z : panel.x;
      const along = alongX ? [c.x - e.x, c.x + e.x] : [c.z - e.z, c.z + e.z];
      const centre = alongX ? panel.x : panel.z;
      return Math.abs(face - at) < 1e-9 && centre - half >= along[0] && centre + half <= along[1];
    });
    assert.ok(host !== undefined, `the panel at ${panel.x}, ${panel.z} is on no plinth or block face`);
    const top = host.centre.y + host.halfExtents.y;
    assert.ok(panel.bottom > 0 && panel.bottom + panel.height <= top - 0.04);
    if (panel.ground === 'concrete') {
      // On a block's side: the floor (within a millimetre) right in front of all of it.
      for (let t = -half; t <= half + 1e-9; t += 0.25) {
        const x = alongX ? panel.x + t : panel.x + sign * 0.3;
        const z = alongX ? panel.z + sign * 0.3 : panel.z + t;
        assert.ok(Math.abs(groundAt(x, z).height) < 1e-3, `the floor in front of the block side at ${x}, ${z}`);
      }
      continue;
    }
    // The floor or a deck stands level right in front, under the panel's
    // foot: a panel on a raised run is over the stair deck or the
    // quarter-pipe's deck (critic pass 1, R3), never over a bank or a face.
    const deck = groundAt(alongX ? panel.x : panel.x + sign * 0.3, alongX ? panel.z + sign * 0.3 : panel.z).height;
    assert.ok(deck === 0 || top > 1, `the panel at ${panel.x}, ${panel.z} on a raised run over the floor`);
    assert.ok(panel.bottom >= deck + 0.04, `the panel at ${panel.x}, ${panel.z} reaches its deck`);
    for (let t = -half; t <= half + 1e-9; t += 0.25) {
      for (const out of [0.3, 1.5]) {
        const x = alongX ? panel.x + t : panel.x + sign * out;
        const z = alongX ? panel.z + sign * out : panel.z + t;
        assert.ok(Math.abs(groundAt(x, z).height - deck) < 1e-9, `the deck in front of the panel at ${x}, ${z}`);
      }
    }
  }
  // Priced as drawn: the pipes are the sleeve and caps `copingRunTriangles`
  // counts; the whole mesh (pipes, skirts, bands, floor, paint) is pinned,
  // and render/renderCost.test.ts proves the price is the measured mesh.
  let pipes = 0;
  for (const run of plan.copings!.runs) if (run.style !== 'edge') pipes += copingRunTriangles(run.points.length);
  assert.ok(yardSceneryTriangles(plan) > pipes);
  assert.equal(yardSceneryTriangles(plan), YARD_SCENERY_TRIANGLES);
});

test('critic pass 2: dark outlines, painted kicker faces, crisp backdrop windows', () => {
  // R2: an outline is always black or slate; chalk only ever fills.
  const dark = new Set([0x2a2a2e, 0x2e3a50]);
  for (const piece of [...SKATEPARK_WEAR.murals, ...(SKATEPARK_WEAR.faceMurals ?? [])]) {
    assert.ok(dark.has(piece.outline), `a piece (seed ${piece.seed}) outlined in ${piece.outline.toString(16)}`);
  }
  // K1/F3/R5: each kicker's ride face is solid paint as geometry, its tapers
  // a dark wash, a steel plate at its toe within 0.1 m of the foot.
  const solid = (SKATEPARK_WEAR.faceMurals ?? []).filter((face) => face.solid !== undefined);
  assert.equal(solid.length, 2);
  for (const k of Object.values(SKATEPARK_KICKERS)) {
    assert.ok(solid.some((face) => face.from > k.minZ && face.to < k.maxZ && face.from - k.minZ <= 0.1 + 1e-9));
    const plate = (SKATEPARK_WEAR.plates ?? []).find((p) => p.z0 === k.minZ && p.z1 === k.maxZ);
    assert.ok(plate !== undefined && plate.x1 - k.foot <= 0.1 + 1e-9 && plate.x1 > k.foot);
    assert.ok(plate.thickness > 0 && plate.thickness < 0.02);
  }
  assert.ok(SKATEPARK_WEAR.patches.filter((patch) => patch.wash === true).length === 4);
  // R1/F7: no backdrop block wears the magnified 'industrial' atlas face; the
  // foundry hall keeps its stacks.
  const buildings = (plan.props ?? []).filter((prop) => prop.kind === 'building');
  assert.equal(buildings.filter((prop) => prop.look === 'industrial').length, 0);
  assert.equal(buildings.filter((prop) => prop.look === 'chimneys').length, 1);
  // R7: the masts stand outside the plinth's outer faces and every building.
  for (const mast of SKATEPARK_WEAR.masts ?? []) {
    assert.ok(mast.x < SKATEPARK_RIDING.minX - 2 || mast.x > SKATEPARK_RIDING.maxX + 2
      || mast.z < SKATEPARK_RIDING.minZ - 2 || mast.z > SKATEPARK_RIDING.maxZ + 2);
    for (const prop of buildings) {
      const quarter = Math.abs(Math.sin(prop.rotationY)) > 0.5;
      const hx = (quarter ? prop.size!.z : prop.size!.x) / 2, hz = (quarter ? prop.size!.x : prop.size!.z) / 2;
      assert.ok(Math.abs(mast.x - prop.position.x) > hx + 0.5 || Math.abs(mast.z - prop.position.z) > hz + 0.5,
        `a mast in a building at ${mast.x}, ${mast.z}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 6 — population and the record key
// ---------------------------------------------------------------------------

test('zero population, authored: no path, no actor to install', () => {
  // The authored branch of world preparation with an empty roster installs no
  // actor, so the world keeps its own id and its record key is the plan id —
  // proved where preparation lives (`app/recordWorldId.test.ts`), since
  // `level/` may not reach into `app/` (the options firewall).
  assert.deepEqual(plan.populationActivity, {
    revision: 'authored-cut1-r1', ground: 'authored', targets: { people: 0, traffic: 0, riders: 0 }, paths: [],
  });
  assert.equal(plan.populationPaths, undefined);
  assert.equal(plan.populationGroundSources, undefined);
  assert.equal(plan.populationCrossings, undefined);
  assert.equal(plan.populationFootpathRequests, undefined);
  assert.equal(plan.recordWorldId, undefined, 'the key is derived, never pinned by the producer');
});

// ---------------------------------------------------------------------------
// 7 — the frame
// ---------------------------------------------------------------------------

test('the yard fits every frame contract, and the prop family fits its own', () => {
  assert.equal(withinRenderBudget(plan).ok, true);
  assert.equal(withinSplitRenderBudget(plan).ok, true);
  assert.equal(withinQuadRenderBudget(plan).ok, true);
  const cost = planRenderCost(plan);
  // §51.6.1's working target, inside the enforced ceilings — and pinned:
  // 15 colour calls for ground, field, backstop, blocks, props and paint, one
  // for the coping pipe and plinth panels (C6), 7 shadow calls. Critic pass 1
  // retired the 'metal' block bucket (the kicker lips are concrete now: −1
  // colour, −1 shadow) and grew the scenery mesh to 8,516 triangles; critic
  // pass 2 to 9,380, and swapped the backdrop's 'industrial' faces for the
  // window grid at no triangle or call (R1).
  assert.deepEqual([cost.colourDrawCalls, cost.shadowDrawCalls, cost.colourTriangles, cost.shadowTriangles],
    [16, 7, 121_948, 5_528]);
  assert.ok(cost.drawCalls <= 55 && cost.triangles <= 300_000,
    `the yard costs ${cost.drawCalls} calls and ${cost.triangles} triangles`);
  let propCalls = 0;
  let propTriangles = 0;
  for (const [part, instances] of cost.partInstances) {
    assert.ok(part in PART_COSTS, `an unpriced part "${part}"`);
    const price = PART_COSTS[part];
    propCalls += price.castsShadow ? 2 : 1;
    propTriangles += instances * price.triangles * (price.castsShadow ? 2 : 1);
  }
  assert.ok(propCalls <= PROP_BUDGET.maxDrawCalls, `${propCalls} prop draw calls`);
  assert.ok(propTriangles <= PROP_BUDGET.maxTriangles, `${propTriangles} prop triangles`);
  assert.deepEqual([...cost.surfaces], ['pavement']);
  assert.ok(cost.cellsDrawn > 0, `measured: ${field.columns}x${field.rows} samples at ${field.spacing} m, `
    + `${cost.cellsDrawn} cells drawn, ${cost.drawCalls} calls (${cost.colourDrawCalls} colour + `
    + `${cost.shadowDrawCalls} shadow), ${cost.triangles} triangles`);
});
