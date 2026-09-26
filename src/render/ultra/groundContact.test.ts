/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { SURFACES, materialAppearance } from '../../data/surfaces.ts';
import { CHASE, ULTRA } from '../../data/tuning.ts';
import { generateLevel } from '../../level/generateRoute.ts';
import type { BoxCollider, Hazard, LevelPlan, Prop } from '../../level/plan.ts';
import { createSliceLevel } from '../../level/sliceLevel.ts';
import { createSwitchbackLevel } from '../../level/switchbackLevel.ts';
import { terrainCells } from '../../level/terrainCoverage.ts';
import { createTrackLevel } from '../../level/trackLevel.ts';
import type { SurfaceId } from '../../simulation/world.ts';
import { ENHANCED_PRESENTATION } from '../presentation.ts';
import { createTerrain } from '../terrain.ts';
import {
  ULTRA_CRISP_MATERIALS,
  ULTRA_DRIVABLE_MATERIALS,
  ULTRA_EDGE_RANKS,
  ULTRA_GROUND_ATTRIBUTES,
  contactOcclusion,
  downSunOf,
  drivableCapCells,
  dynamicContactAt,
  edgeCovers,
  edgeRoundedDistance,
  edgeFillFor,
  riderContactOccluders,
  edgeSignedDistance,
  tautString,
  ultraSurfaceAttributes,
  type EdgeFillField,
} from './groundContact.ts';
import {
  edgeCapCells,
  groundDetailKind,
  ULTRA_CONTACT_FLOATS,
  ULTRA_CONTACT_SHADE_FLOATS,
  ULTRA_CONTACT_SLOTS,
  ULTRA_GROUND,
} from './ultraGroundDetail.ts';
import { createUltraShared, ultraGroundMaterial } from './ultraMaterials.ts';
import { ULTRA_FULL, ULTRA_LIT, applyKitOverride } from './ultraRecipe.ts';
import type { UltraRecipe } from './ultraTypes.ts';

/**
 * The Ultra ground's grounding data — M39 T5 (contact AO) and T6 (the
 * fill-only edge field), `docs/M39_ULTRA.md` §4, package W6, with the edge
 * field as revised in the pre-R1 ground pass (§U2 "Pre-R1 ground (G)").
 *
 * What a test can hold here is the geometry of the promises, not the look:
 *
 * - **AO** is darken-only, never below the floor, exactly 1 far from every
 *   occluder, and identical at every vertex that stands on one shared corner —
 *   the property that makes it smooth rather than a one-metre staircase.
 * - **The edge field** only ever adds an outranking surface to a lower one
 *   (a band never loses a cell, so its connectivity and width can only
 *   grow), keeps every filled point within the cap of that surface, leaves
 *   every filled cell a share of itself and of every edge it shares with its
 *   own surface (so no surface loses a cell or a 4-connection), never
 *   touches spill, wood or a hazard, draws a regular staircase as **one
 *   straight line** at 1:1–1:3 and a continuous, near-straight one at every
 *   other slope, and paints exactly the tone of the tile it continues.
 *
 * Whether the straightened kerb reads as a kerb from the chase camera is a
 * browser judgement, and the gauntlet's.
 */

const LETTER: Readonly<Record<string, SurfaceId>> = {
  P: 'pavement',
  R: 'roughPavement',
  B: 'brick',
  G: 'grass',
  V: 'gravel',
  D: 'dirt',
  W: 'wood',
  S: 'spill',
};

/**
 * A flat plan drawn as letters: `rows[0]` is row 0 (the −Z edge), each
 * character one cell. Only the fields the grounding functions read.
 */
function gridPlan(
  rows: readonly string[],
  extras: { hazards?: Hazard[]; props?: Prop[]; colliders?: BoxCollider[]; heights?: (column: number, row: number) => number; spacing?: number } = {},
): LevelPlan {
  const cellColumns = rows[0].length;
  const cellRows = rows.length;
  const surfaces: SurfaceId[] = [];
  for (const line of rows) {
    assert.equal(line.length, cellColumns, 'ragged grid');
    for (const letter of line) surfaces.push(LETTER[letter]);
  }
  const heights: number[] = [];
  for (let row = 0; row <= cellRows; row += 1) {
    for (let column = 0; column <= cellColumns; column += 1) heights.push(extras.heights?.(column, row) ?? 0);
  }
  return {
    id: 'ground-contact-probe',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' },
    heightfield: {
      originX: 0,
      originZ: 0,
      spacing: extras.spacing ?? 1,
      columns: cellColumns + 1,
      rows: cellRows + 1,
      heights,
      surfaces,
    },
    segments: extras.colliders === undefined ? [] : [{ colliders: extras.colliders }],
    checkpoints: [],
    ...(extras.hazards === undefined ? {} : { hazards: extras.hazards }),
    ...(extras.props === undefined ? {} : { props: extras.props }),
  } as unknown as LevelPlan;
}

/** A plan drawn by a predicate: `band(column, row)` → the band surface, else `ground`. */
function shapePlan(columns: number, rows: number, band: (column: number, row: number) => boolean, ground = 'P', high = 'B', spacing = 1): LevelPlan {
  const lines: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    let line = '';
    for (let column = 0; column < columns; column += 1) line += band(column, row) ? high : ground;
    lines.push(line);
  }
  return gridPlan(lines, { spacing });
}

/** Every cell as drawn, grouped by surface, the way `terrainCells` groups them. */
function allCells(plan: LevelPlan): Map<string, number[]> {
  const cells = new Map<string, number[]>();
  plan.heightfield.surfaces.forEach((surface, cell) => {
    const list = cells.get(surface);
    if (list === undefined) cells.set(surface, [cell]);
    else list.push(cell);
  });
  return cells;
}

function rankOf(surface: SurfaceId): number {
  return ULTRA_EDGE_RANKS[SURFACES[surface].material] ?? 0;
}

function outranks(b: SurfaceId, a: SurfaceId): boolean {
  const rb = rankOf(b);
  const ra = rankOf(a);
  return rb > ra || (rb === ra && materialAppearance(SURFACES[b].material).encroach
    > materialAppearance(SURFACES[a].material).encroach);
}

/**
 * Every structural promise of the field, checked on one plan's result:
 * who may fill toward whom, the cap, the share each filled cell keeps, the
 * tone source, and — across every edge between two drawn cells of one
 * surface — a stretch of that edge left open on both sides (4-connectivity).
 */
function assertFieldLaws(plan: LevelPlan, fill: EdgeFillField, drawn: ReadonlySet<number>): { worst: number } {
  const field = plan.heightfield;
  const columns = field.columns - 1;
  const rows = field.rows - 1;
  const surfaceAt = (column: number, row: number): SurfaceId | null => (
    column < 0 || row < 0 || column >= columns || row >= rows ? null : field.surfaces[row * columns + column]
  );
  assert.equal(fill.capCells, edgeCapCells(field.spacing));
  // A12: a fill into a drivable cell keeps to half a cell (and never past the metre cap).
  assert.equal(fill.drivableCapCells, Math.min(fill.capCells, drivableCapCells(field.spacing)));
  let lines = 0;
  let worst = 0;
  const steps = 16;
  for (const [cell, filled] of fill.cells) {
    const row = Math.floor(cell / columns);
    const column = cell - row * columns;
    const own = field.surfaces[cell];
    const cap = ULTRA_DRIVABLE_MATERIALS.has(SURFACES[own].material) ? fill.drivableCapCells : fill.capCells;
    assert.ok(drawn.has(cell), `cell ${cell} is filled but not drawn`);
    assert.ok(filled.lines.length >= 1 && filled.lines.length <= 2, `cell ${cell} carries ${filled.lines.length} lines`);
    for (const line of filled.lines) assert.ok(Math.abs(Math.hypot(line.nx, line.nz) - 1) < 1e-9, 'a line normal is not unit');
    assert.ok(outranks(filled.towards, own), `${filled.towards} does not outrank ${own} at cell ${cell}`);
    assert.ok(rankOf(own) > 0 && rankOf(filled.towards) > 0, 'an unranked surface took part');
    assert.ok(drawn.has(filled.source), 'the fill tone comes from an undrawn cell');
    assert.equal(field.surfaces[filled.source], filled.towards, 'the fill tone comes from another surface');
    const sr = Math.floor(filled.source / columns);
    const sc = filled.source - sr * columns;
    assert.ok(Math.abs(sr - row) <= 2 && Math.abs(sc - column) <= 2 && filled.source !== cell, 'the source is not beside the cell');
    lines += filled.lines.length;

    // The cap, and the share kept, on a grid of the cell's interior.
    let open = 0;
    for (let i = 0; i < steps; i += 1) {
      for (let j = 0; j < steps; j += 1) {
        const u = (i + 0.5) / steps;
        const v = (j + 0.5) / steps;
        if (!edgeCovers(filled, column + u, row + v)) {
          open += 1;
          continue;
        }
        let nearest = Infinity;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (surfaceAt(column + dc, row + dr) !== filled.towards) continue;
            const dx = Math.max(dc - u, 0, u - (dc + 1));
            const dz = Math.max(dr - v, 0, v - (dr + 1));
            nearest = Math.min(nearest, Math.hypot(dx, dz));
          }
        }
        worst = Math.max(worst, nearest);
        assert.ok(nearest <= cap + 1e-6, `a covered point of ${own} cell ${cell} sits ${nearest} of a cell from ${filled.towards}`);
      }
    }
    assert.ok(open >= ULTRA_GROUND.edge.minKeptArea * steps * steps * 0.9, `cell ${cell} keeps only ${open} of ${steps * steps}`);
  }
  assert.equal(lines, fill.lines, 'the report miscounts the lines');
  const pocketTotal = fill.pockets.chain + fill.pockets.chamfer;
  assert.equal(pocketTotal, fill.cells.size);

  // Connectivity: along every edge between two drawn cells of one surface,
  // some stretch is open on both sides.
  const covered = (cell: number, gx: number, gz: number): boolean => {
    const filled = fill.cells.get(cell);
    return filled !== undefined && edgeCovers(filled, gx, gz);
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = row * columns + column;
      if (!drawn.has(cell)) continue;
      for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
        const other = (row + dr) * columns + column + dc;
        if (surfaceAt(column + dc, row + dr) !== field.surfaces[cell] || !drawn.has(other)) continue;
        if (!fill.cells.has(cell) && !fill.cells.has(other)) continue;
        let open = false;
        for (let k = 1; k < 20 && !open; k += 1) {
          const t = k / 20;
          const gx = dc === 1 ? column + 1 : column + t;
          const gz = dc === 1 ? row + t : row + 1;
          if (!covered(cell, gx, gz) && !covered(other, gx, gz)) open = true;
        }
        assert.ok(open, `the edge between cells ${cell} and ${other} of one surface is covered whole`);
      }
    }
  }
  return { worst };
}

/**
 * The visual boundary under a band above: for each sampled x, the lowest z
 * at which the ground reads as the band (a band cell, or a covered point).
 */
function boundaryUnder(plan: LevelPlan, fill: EdgeFillField, band: SurfaceId, x: number): number {
  const field = plan.heightfield;
  const columns = field.columns - 1;
  const column = Math.floor(x);
  for (let z = 0; z < field.rows - 1; z += 0.002) {
    const cell = Math.floor(z) * columns + column;
    if (field.surfaces[cell] === band) return z;
    const filled = fill.cells.get(cell);
    if (filled !== undefined && edgeCovers(filled, x, z)) return z;
  }
  return field.rows - 1;
}

/** Least-squares line through the sampled boundary, and the worst deviation from it. */
function straightness(xs: readonly number[], zs: readonly number[]): { slope: number; deviation: number; jump: number } {
  const n = xs.length;
  let sx = 0;
  let sz = 0;
  let sxx = 0;
  let sxz = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sz += zs[i];
    sxx += xs[i] * xs[i];
    sxz += xs[i] * zs[i];
  }
  const slope = (n * sxz - sx * sz) / (n * sxx - sx * sx);
  const intercept = (sz - slope * sx) / n;
  let deviation = 0;
  let jump = 0;
  for (let i = 0; i < n; i += 1) {
    deviation = Math.max(deviation, Math.abs(zs[i] - intercept - slope * xs[i]));
    if (i > 0) jump = Math.max(jump, Math.abs(zs[i] - zs[i - 1]));
  }
  return { slope, deviation, jump };
}

// ---------------------------------------------------------------------------
// Contact AO
// ---------------------------------------------------------------------------

function building(x: number, z: number, sizeX: number, sizeZ: number, height: number, rotationY = 0): Prop {
  return {
    kind: 'building',
    position: { x, y: 0, z },
    rotationY,
    scale: 1,
    size: { x: sizeX, y: height, z: sizeZ },
  };
}

test('contact AO darkens only, never below the floor, and is exactly 1 beyond every band', () => {
  const plan = gridPlan(Array.from({ length: 60 }, () => 'P'.repeat(60)), {
    props: [
      building(20, 20, 10, 8, 18, 0.3),
      { kind: 'broadleafTree', position: { x: 40, y: 0, z: 40 }, rotationY: 0, scale: 1 },
      { kind: 'broadleafTree', position: { x: 50, y: 0, z: 25 }, rotationY: 0, scale: 1.5 },
      { kind: 'fenceBay', position: { x: 45, y: 0, z: 10 }, rotationY: 1.1, scale: 1 },
    ],
    colliders: [{
      centre: { x: 10, y: 0.6, z: 48 },
      halfExtents: { x: 0.2, y: 0.6, z: 5 },
      rotationY: 0,
      surface: 'pavement',
      appearance: 'stone',
    }],
  });
  const ao = contactOcclusion(plan);
  let darkened = 0;
  for (let x = 0; x <= 60; x += 0.5) {
    for (let z = 0; z <= 60; z += 0.5) {
      for (const footprint of [0, 1]) {
        const value = ao(x, z, footprint);
        assert.ok(value >= ULTRA.contact.floor - 1e-12 && value <= 1, `AO ${value} out of range at (${x}, ${z})`);
        if (value < 1) darkened += 1;
      }
    }
  }
  assert.ok(darkened > 0, 'nothing darkened at all');
  // Far from everything: exactly one, not merely close to it.
  assert.equal(ao(55, 55), 1);
  assert.equal(ao(55, 55, 1), 1);
  assert.equal(ao(2, 30, 1), 1);
  // Against the building's face: its own strength, applied once.
  const face = ao(20 + Math.cos(0.3) * 5.001, 20 - Math.sin(0.3) * 5.001);
  assert.ok(Math.abs(face - (1 - ULTRA.contact.building.strength)) < 1e-3, `the wall's foot reads ${face}`);
  // Just beyond the building's band, nothing.
  assert.equal(ao(20 + Math.cos(0.3) * (5 + ULTRA.contact.building.band + 0.01), 20 - Math.sin(0.3) * (5 + ULTRA.contact.building.band + 0.01)), 1);
  // Under the tree the trunk and the canopy stack, and the floor holds.
  assert.ok(ao(40, 40.35) < ao(40, 42.2), 'the canopy does not deepen toward the trunk');
  assert.ok(ao(40, 40.3) >= ULTRA.contact.floor);
  // The canopy is a disc, not a cone: past the trunk's own band and still
  // inside the inner half of the spread, the sky is occluded at full canopy
  // strength; beyond the spread, not at all. (The larger tree, so the trunk's
  // band and the disc's full-strength core do not overlap.)
  const trunkReach = 0.3 * 1.5 + ULTRA.contact.trunk.band;
  const inside = ULTRA.contact.crown.band * 1.5 * 0.5 - 0.01;
  assert.ok(inside > trunkReach, 'the probe sits inside the trunk band');
  assert.ok(Math.abs(ao(50 + inside, 25) - (1 - ULTRA.contact.crown.strength)) < 1e-9, `the canopy reads ${ao(50 + inside, 25)} half-way out`);
  assert.equal(ao(50 + ULTRA.contact.crown.band * 1.5 + 0.01, 25), 1);
  // Deterministic, and one question gets one answer however it is reached.
  const again = contactOcclusion(plan);
  for (const [x, z] of [[24, 17], [40.2, 41], [45, 10.5], [10.3, 47]] as const) {
    assert.equal(again(x, z, 1), ao(x, z, 1));
    assert.equal(ao(x, z), ao(x, z));
  }
});

test('A9: the rider and cop occluders — player first, fading with height, darken-only, soft to the rim', () => {
  const config = ULTRA.contact.riders;
  const F = ULTRA_CONTACT_FLOATS;
  const plan = gridPlan(['PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP', 'PPPPPPPP'], { heights: () => 0.5 });
  const out = new Float32Array(4 * F);
  const rider = { wheel: { x: 3, y: 0.5, z: 2 }, pelvis: { x: 3.2, y: 1.5, z: 2.1 } };
  // Without a sun direction both pools are round: (x, z, r, s) then (axis, r, 0).
  assert.equal(riderContactOccluders(plan, [rider], out), 2);
  assert.deepEqual([...out.slice(0, 2 * F)].map((v) => Math.round(v * 1e5) / 1e5), [
    3, 2, config.wheel.radius, config.wheel.strength, 1, 0, config.wheel.radius, config.wheel.sunShare,
    3.2, 2.1, config.body.radius, config.body.strength, 1, 0, config.body.radius, config.body.sunShare,
  ].map((v) => Math.round(Math.fround(v) * 1e5) / 1e5));
  // The cop takes the next two slots. The cap is the rider and the whole pack
  // of M39 Part P (two slots each for `CHASE.roomSize` bodies): three riders
  // take six, four fill every slot, and a fifth body finds none.
  const cop = { wheel: { x: 6, y: 0.5, z: 4 }, pelvis: null };
  assert.equal(riderContactOccluders(plan, [rider, cop], out), 3);
  assert.equal(out[2 * F], 6);
  const full = new Float32Array(ULTRA_CONTACT_SLOTS * F);
  assert.equal(ULTRA_CONTACT_SLOTS, 2 * CHASE.roomSize);
  assert.equal(riderContactOccluders(plan, [rider, rider, rider], full), 6);
  assert.equal(riderContactOccluders(plan, Array.from({ length: CHASE.roomSize }, () => rider), full), ULTRA_CONTACT_SLOTS);
  assert.equal(riderContactOccluders(plan, Array.from({ length: CHASE.roomSize + 1 }, () => rider), full), ULTRA_CONTACT_SLOTS);
  // A hop fades both; a jump beyond the fade removes them; the fade is continuous (no pop).
  const at = (lift: number): number[] => {
    const packed = new Float32Array(4 * F);
    const count = riderContactOccluders(plan, [{ wheel: { x: 3, y: 0.5 + lift, z: 2 }, pelvis: { x: 3, y: 1.5 + lift, z: 2 } }], packed);
    return count === 0 ? [0, 0] : [packed[3], count > 1 ? packed[F + 3] : 0];
  };
  assert.deepEqual(at(config.liftFade[1] + 0.01), [0, 0]);
  let last = at(0);
  for (let lift = 0.02; lift <= config.liftFade[1] + 0.05; lift += 0.02) {
    const now = at(lift);
    assert.ok(now[0] <= last[0] + 1e-7 && last[0] - now[0] < 0.08, `the wheel pool pops at a ${lift} m hop`);
    last = now;
  }
  // A ragdoll's pelvis in flight lets go of the body pool alone.
  const flying = new Float32Array(4 * F);
  assert.equal(riderContactOccluders(plan, [{ wheel: { x: 3, y: 0.5, z: 2 }, pelvis: { x: 5, y: 0.5 + config.bodyLiftFade[1] + 0.1, z: 2 } }], flying), 1);
  // Non-finite rigs are skipped, never written.
  assert.equal(riderContactOccluders(plan, [{ wheel: { x: Number.NaN, y: 0, z: 0 }, pelvis: null }], new Float32Array(4 * F)), 0);

  // The product, in static shade (A28: the shade shapes): 1 at and beyond every rim, darkest at the centre,
  // never under the floor.
  const packed = new Float32Array(4 * F);
  const shapes = new Float32Array(4 * ULTRA_CONTACT_SHADE_FLOATS);
  const count = riderContactOccluders(plan, [rider], packed, null, shapes);
  const reach = Math.max(config.body.radius, config.body.shade.radius, config.wheel.radius);
  assert.equal(dynamicContactAt(packed, count, 3 + reach + 0.3, 2, 1, shapes), 1);
  assert.equal(dynamicContactAt(packed, count, 3 + reach + 0.3, 2, 0, shapes), 1);
  assert.equal(dynamicContactAt(packed, 0, 3, 2, 1, shapes), 1);
  const centre = dynamicContactAt(packed, count, 3, 2, 1, shapes);
  assert.ok(centre < 0.7 && centre >= config.floor, `centre ${centre}`);
  let previous = centre;
  for (let d = 0.05; d <= reach + 0.2; d += 0.05) {
    const value = dynamicContactAt(packed, count, 3 - d, 2, 1, shapes);
    assert.ok(value >= previous - 1e-9 && value <= 1, `the pool is not monotone at ${d} m`);
    // Soft to the rim: no step between samples 5 cm apart.
    assert.ok(value - previous < 0.12, `the pool steps ${value - previous} at ${d} m`);
    previous = value;
  }
  const crowd = new Float32Array(4 * F);
  const crowdShapes = new Float32Array(4 * ULTRA_CONTACT_SHADE_FLOATS);
  const many = riderContactOccluders(plan, [rider, rider], crowd, null, crowdShapes);
  assert.equal(dynamicContactAt(crowd, many, 3, 2, 1, crowdShapes), config.floor, 'four stacked occluders clamp at the floor');
});

test('A15: the body pool is the rider\'s shade — stretched along the sun\'s azimuth, offset down-sun; the wheel stays round', () => {
  const config = ULTRA.contact.riders;
  const body = config.body;
  const F = ULTRA_CONTACT_FLOATS;
  assert.ok(body.stretch >= 1.6 && body.stretch <= 2, `stretch ${body.stretch} outside round 2's 1.6–2×`);
  assert.ok(body.across <= 1 && body.downSunMetres > 0);
  const plan = gridPlan(Array.from({ length: 12 }, () => 'P'.repeat(12)), { heights: () => 0 });
  // The sun in the north-east, 55° up: its shadow points south-west.
  const elevation = (55 * Math.PI) / 180;
  const sun = { x: Math.cos(elevation) * Math.SQRT1_2, y: Math.sin(elevation), z: Math.cos(elevation) * Math.SQRT1_2 };
  const down = downSunOf(sun)!;
  assert.ok(Math.abs(down.x + Math.SQRT1_2) < 1e-9 && Math.abs(down.z + Math.SQRT1_2) < 1e-9, 'down-sun is not away from the sun');
  assert.equal(downSunOf({ x: 0, y: 1, z: 0 }), null, 'a zenith sun has no azimuth');
  assert.equal(downSunOf({ x: 0, y: 0, z: 0 }), null);
  // Fable F7: the per-frame caller hands in one direction to fill — the same object comes back, nothing allocates.
  const scratch = { x: 0, z: 0 };
  assert.equal(downSunOf(sun, scratch), scratch);
  assert.deepEqual(scratch, { x: down.x, z: down.z });
  assert.equal(downSunOf({ x: 0, y: 1, z: 0 }, scratch), null, 'a zenith sun still has no azimuth with a scratch');
  const rider = { wheel: { x: 6, y: 0, z: 6 }, pelvis: { x: 6, y: 1, z: 6 } };
  const packed = new Float32Array(4 * F);
  const count = riderContactOccluders(plan, [rider], packed, down);
  assert.equal(count, 2);
  // The wheel's is round whatever the sun.
  assert.equal(packed[2], packed[6]);
  // The body's: centred down-sun, its long axis along the shadow.
  assert.ok(Math.abs(packed[F] - (6 + down.x * body.downSunMetres)) < 1e-5);
  assert.ok(Math.abs(packed[F + 1] - (6 + down.z * body.downSunMetres)) < 1e-5);
  assert.ok(Math.abs(packed[F + 2] - body.radius * body.stretch) < 1e-5);
  assert.ok(Math.abs(packed[F + 6] - body.radius * body.across) < 1e-5);
  // Read as a shape (the sun shape, so outside static shade): the pool reaches further down-sun than up-sun or across.
  const bodyOnly = packed.slice(F, 2 * F);
  const reach = (dx: number, dz: number): number => {
    let edge = 0;
    for (let d = 0; d < 5; d += 0.01) if (dynamicContactAt(bodyOnly, 1, 6 + dx * d, 6 + dz * d, 0) < 1) edge = d;
    return edge;
  };
  const downReach = reach(down.x, down.z);
  const upReach = reach(-down.x, -down.z);
  const acrossReach = reach(-down.z, down.x);
  assert.ok(downReach > upReach + 0.5, `down-sun ${downReach} m against up-sun ${upReach} m`);
  assert.ok(downReach > 1.5 * acrossReach, `down-sun ${downReach} m against across ${acrossReach} m`);
  // A20 (final wave, P-GR; round-3 item 1b): longer and narrower — a streak out from under the rider along
  // the sun's azimuth, as his shadow runs in sun, not a pool round him (5/5 round-3 critics: "a blob").
  assert.ok(downReach >= 2.5 && upReach <= 1 && acrossReach <= 0.6, `reach down ${downReach}, up ${upReach}, across ${acrossReach} m`);
  // Denser: the body pool's centre and the wheel's contact core both darken more in shade than Wave 4's
  // (0.3 and 0.5), while in sun each keeps no more than Wave 4's share of it (0.06 and 0.075).
  assert.ok(body.strength > 0.3 && config.wheel.strength > 0.5);
  assert.ok(body.strength * body.sunShare <= 0.06 + 1e-9 && config.wheel.strength * config.wheel.sunShare <= 0.075 + 1e-9);
  // Outside static shade each pool keeps only its sunShare (the rider's cast shadow grounds him there);
  // in static shade the streak is gone (A28: there is no sun there to stretch it).
  const centreX = 6 + down.x * body.downSunMetres;
  const centreZ = 6 + down.z * body.downSunMetres;
  const inShade = dynamicContactAt(bodyOnly, 1, centreX, centreZ, 1);
  const inSun = dynamicContactAt(bodyOnly, 1, centreX, centreZ, 0);
  assert.equal(inShade, 1, `the streak in static shade ${inShade}`);
  assert.ok(Math.abs(inSun - (1 - body.strength * body.sunShare)) < 1e-6, `sun pool ${inSun}`);
  assert.ok(config.wheel.sunShare > 0 && config.wheel.sunShare <= 1 && body.sunShare > 0 && body.sunShare < 1);
  // Still soft to the rim along the long axis, and never under the floor.
  let previous = dynamicContactAt(bodyOnly, 1, 6 + down.x * body.downSunMetres, 6 + down.z * body.downSunMetres, 0);
  assert.ok(previous >= config.floor);
  for (let d = 0.05; d < downReach + 0.2; d += 0.05) {
    const value = dynamicContactAt(bodyOnly, 1, 6 + down.x * (body.downSunMetres + d), 6 + down.z * (body.downSunMetres + d), 0);
    assert.ok(value >= previous - 1e-9 && value - previous < 0.12, `the long axis steps at ${d} m`);
    previous = value;
  }
});

test('A28: in static shade the pool is a compact contact under the wheel and feet, blending to the sun shape without a pop', () => {
  const config = ULTRA.contact.riders;
  const body = config.body;
  const compact = body.shade;
  const F = ULTRA_CONTACT_FLOATS;
  const S = ULTRA_CONTACT_SHADE_FLOATS;
  const plan = gridPlan(Array.from({ length: 12 }, () => 'P'.repeat(12)), { heights: () => 0 });
  const elevation = (55 * Math.PI) / 180;
  const down = downSunOf({ x: Math.cos(elevation) * Math.SQRT1_2, y: Math.sin(elevation), z: Math.cos(elevation) * Math.SQRT1_2 })!;
  // A lean: the pelvis stands 0.2 m ahead of the wheel.
  const rider = { wheel: { x: 6, y: 0, z: 6 }, pelvis: { x: 6.2, y: 1, z: 6 } };
  const packed = new Float32Array(4 * F);
  const shapes = new Float32Array(4 * S);
  const count = riderContactOccluders(plan, [rider], packed, down, shapes);
  assert.equal(count, 2);
  // The sun shapes are exactly what they were without a shade array (the runtime test's layout).
  const sunOnly = new Float32Array(4 * F);
  riderContactOccluders(plan, [rider], sunOnly, down);
  assert.deepEqual([...packed], [...sunOnly]);
  // The wheel's shade shape is its own round core; the body's is compact, round, between wheel and pelvis.
  assert.deepEqual([...shapes.slice(0, S)].map((v) => Math.round(v * 1e5) / 1e5),
    [6, 6, config.wheel.radius, config.wheel.strength].map((v) => Math.round(Math.fround(v) * 1e5) / 1e5));
  assert.ok(Math.abs(shapes[S] - (6 + 0.2 * compact.towardPelvis)) < 1e-5 && Math.abs(shapes[S + 1] - 6) < 1e-5);
  assert.ok(Math.abs(shapes[S + 2] - compact.radius) < 1e-5 && Math.abs(shapes[S + 3] - compact.strength) < 1e-6);
  assert.ok(compact.radius <= 1 && compact.radius < body.radius * body.stretch, 'the shade pool is not compact');
  assert.ok(compact.towardPelvis >= 0 && compact.towardPelvis <= 1);

  // In full static shade: nothing reaches down-sun past the compact pool, and it is darkest under the wheel.
  const at = (x: number, z: number, shade: number): number => dynamicContactAt(packed, count, x, z, shade, shapes);
  const reachIn = (dx: number, dz: number, shade: number): number => {
    let edge = 0;
    for (let d = 0; d < 5; d += 0.01) if (at(6 + dx * d, 6 + dz * d, shade) < 1) edge = d;
    return edge;
  };
  const shadeDown = reachIn(down.x, down.z, 1);
  const shadeUp = reachIn(-down.x, -down.z, 1);
  const shadeAcross = reachIn(-down.z, down.x, 1);
  assert.ok(shadeDown <= compact.radius + 0.25, `in shade the pool still runs ${shadeDown} m down-sun`);
  assert.ok(Math.abs(shadeDown - shadeUp) < 0.3 && Math.abs(shadeDown - shadeAcross) < 0.3,
    `in shade the pool is not round: down ${shadeDown}, up ${shadeUp}, across ${shadeAcross} m`);
  const under = at(6, 6, 1);
  assert.ok(under < 0.6 && under >= config.floor, `under the wheel ${under}`);
  assert.ok(at(6 + down.x * 1.5, 6 + down.z * 1.5, 1) === 1, 'a down-sun streak survives in shade');
  // In sun: exactly the sun shapes at their sunShare, the streak's reach kept.
  assert.ok(reachIn(down.x, down.z, 0) >= 2.5, 'the sun shape lost its reach');
  assert.ok(Math.abs(at(6 + down.x * body.downSunMetres, 6 + down.z * body.downSunMetres, 0)
    - dynamicContactAt(packed, count, 6 + down.x * body.downSunMetres, 6 + down.z * body.downSunMetres, 0)) < 1e-9);
  // No pop: stepping the static shade 0 → 1 in 2 % steps (a rider rolling through a shade edge a metre wide
  // at about 8 m/s moves the shade under him by less per frame) moves no ground point by more than a few hundredths.
  for (const [dx, dz] of [[0, 0], [0.3, 0], [down.x, down.z], [-down.z * 0.5, down.x * 0.5], [down.x * 2, down.z * 2]] as const) {
    let last = at(6 + dx, 6 + dz, 0);
    for (let shade = 0.02; shade <= 1.0001; shade += 0.02) {
      const now = at(6 + dx, 6 + dz, Math.min(shade, 1));
      assert.ok(Math.abs(now - last) < 0.03, `the pool pops by ${Math.abs(now - last)} at shade ${shade} (${dx}, ${dz})`);
      last = now;
    }
  }
  // Both shapes fade with the wheel's height like the sun ones: a hop dims them, a jump removes them.
  const hop = new Float32Array(4 * S);
  riderContactOccluders(plan, [{ wheel: { x: 6, y: config.liftFade[1] + 0.01, z: 6 }, pelvis: { x: 6, y: 1 + config.liftFade[1], z: 6 } }], new Float32Array(4 * F), down, hop);
  assert.ok(hop.every((v) => v === 0), 'a rider in the air leaves a shade pool');
});

test('A28: the ground reads each slot\'s two shapes — the sun one off static shade, the shade one in it — from shared uniforms', () => {
  const context = { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 };
  const lib = THREE.ShaderLib.standard;
  const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(lib.uniforms) };
  ultraGroundMaterial(materialAppearance('pavement'), 'pavement', context)
    .onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  const text = shader.fragmentShader;
  // One vec4 a slot, shared by reference (one write a frame reaches every ground material).
  assert.equal(text.split(`uniform vec4 ultraContactShade[ ${ULTRA_CONTACT_SLOTS} ];`).length - 1, 1);
  assert.equal(shader.uniforms.ultraContactShade, context.shared.uniforms.ultraContactShade);
  assert.equal((context.shared.uniforms.ultraContactShade.value as THREE.Vector4[]).length, ULTRA_CONTACT_SLOTS);
  assert.equal(ULTRA_CONTACT_SHADE_FLOATS, 4);
  // The weights: the sun shape by sunShare off static shade, the compact one by the static shade.
  const body = text.slice(text.indexOf('float ultraDynamicContact('), text.indexOf('return max( ultraOcc,'));
  assert.ok(body.includes('ultraOcc *= 1.0 - ultraC.w * ultraE.w * ( 1.0 - ultraShadeHere ) * ultraK * ultraK;'));
  assert.ok(body.includes('ultraOcc *= 1.0 - ultraS.w * ultraShadeHere * ultraKs * ultraKs;'));
  assert.ok(!body.includes('mix( ultraE.w, 1.0, ultraShadeHere )'), 'the whole sun shape still darkens in static shade');
  assert.ok(!/[^\x00-\x7f]/.test(text), 'non-ASCII in the ground shader');
});

test('an occluder grounds only the ground it stands on', () => {
  // A building on a shelf six metres above the ground beside it: the shelf's
  // foot darkens, the valley floor under the band does not.
  const plan = gridPlan(Array.from({ length: 40 }, () => 'P'.repeat(40)), {
    heights: (column) => (column >= 20 ? 6 : 0),
    props: [{ ...building(26, 20, 8, 8, 12), position: { x: 26, y: 6, z: 20 } }],
  });
  const ao = contactOcclusion(plan);
  assert.ok(ao(21.5, 20) < 1, 'the shelf beside the building is not grounded');
  assert.equal(ao(19.5, 20), 1, 'the valley floor six metres down was grounded by a wall it cannot touch');
});

test('a wall grounds as far as it stands tall, so a kerb reaches centimetres and a frontage its full band', () => {
  const kerb: BoxCollider = {
    centre: { x: 10, y: 0.075, z: 10 },
    halfExtents: { x: 0.15, y: 0.075, z: 5 },
    rotationY: 0,
    surface: 'pavement',
    appearance: 'concrete',
  };
  const wall: BoxCollider = { ...kerb, centre: { x: 30, y: 1.5, z: 10 }, halfExtents: { x: 0.2, y: 1.5, z: 5 }, appearance: 'stone' };
  const plan = gridPlan(Array.from({ length: 20 }, () => 'P'.repeat(40)), { colliders: [kerb, wall] });
  const ao = contactOcclusion(plan);
  assert.equal(ao(10.15 + ULTRA.contact.wall.bandHeightShare * 0.15 + 0.01, 10), 1, 'a kerb reached past its own height');
  assert.ok(ao(10.16, 10) < 1, 'a kerb grounds nothing at its own foot');
  assert.ok(ao(30.2 + ULTRA.contact.wall.bandMax - 0.05, 10) < 1, 'the frontage wall stops short of its band');
  assert.equal(ao(30.2 + ULTRA.contact.wall.bandMax + 0.01, 10), 1);
});

test('on a built Ultra world every vertex on one shared corner carries the same AO, inside [floor, 1]', () => {
  const plan = createSliceLevel();
  const context = { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 };
  const view = createTerrain(plan, ULTRA_FULL, context);
  try {
    const mesh = view.group.children.find((child) => child.name === 'level-heightfield') as THREE.Mesh;
    const position = mesh.geometry.getAttribute('position');
    const ao = mesh.geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.ao);
    assert.ok(ao !== undefined, 'the Ultra heightfield has no AO');
    assert.equal(ao.count, position.count);
    const byCorner = new Map<string, number>();
    let darkened = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const raw = (ao.array as Uint8Array)[vertex];
      assert.ok(raw / 255 >= ULTRA.contact.floor, 'a stored AO fell below the floor');
      if (raw < 255) darkened += 1;
      const key = `${position.getX(vertex)},${position.getZ(vertex)}`;
      const seen = byCorner.get(key);
      if (seen === undefined) byCorner.set(key, raw);
      else assert.equal(raw, seen, `two vertices on the corner ${key} disagree`);
    }
    assert.ok(darkened > position.count * 0.02, 'the slice is barely grounded');
    assert.ok(darkened < position.count * 0.6, 'the slice is grounded everywhere, which is a tint, not contact');

    // The field carries AO too, and only AO.
    const field = view.group.children.find((child) => child.name === 'level-field') as THREE.Mesh;
    assert.ok(field.geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.ao) !== undefined);
    assert.equal(field.geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.edge), undefined);
  } finally {
    view.dispose();
  }
});

// ---------------------------------------------------------------------------
// The edge field
// ---------------------------------------------------------------------------

test('the taut string is straight between the gates it touches, and inside every gate', () => {
  // Free gates: one straight line from end to end.
  const free = tautString([0, 1, 2, 3, 4], [0, -9, -9, -9, 4], [0, 9, 9, 9, 4]);
  assert.deepEqual(free, [0, 1, 2, 3, 4]);
  // A gate that pushes up bends the path over it, and the path stays straight either side.
  const bent = tautString([0, 1, 2, 3, 4], [0, -9, 3, -9, 0], [0, 9, 9, 9, 0]);
  assert.deepEqual(bent, [0, 1.5, 3, 1.5, 0]);
  // One that pushes down bends it under.
  const under = tautString([0, 1, 2, 3, 4], [0, -9, -9, -9, 4], [0, 9, 0, 9, 4]);
  assert.deepEqual(under, [0, 0, 0, 2, 4]);
  // Random gates: always inside.
  for (let seed = 1; seed < 40; seed += 1) {
    const x: number[] = [];
    const lo: number[] = [];
    const hi: number[] = [];
    let at = 0;
    for (let k = 0; k < 30; k += 1) {
      at += 0.25 + ((seed * 7919 + k * 104729) % 100) / 100;
      const centre = Math.sin(k * 0.7 + seed) * 2;
      const half = ((seed * 31 + k * 17) % 50) / 50;
      x.push(at);
      lo.push(centre - half);
      hi.push(centre + half);
    }
    lo[0] = hi[0] = (lo[0] + hi[0]) / 2;
    lo[29] = hi[29] = (lo[29] + hi[29]) / 2;
    const z = tautString(x, lo, hi);
    for (let k = 0; k < 30; k += 1) assert.ok(z[k] >= lo[k] - 1e-9 && z[k] <= hi[k] + 1e-9, `gate ${k} of seed ${seed}`);
  }
});

test('a regular staircase at 1:1, 1:2 and 1:3 draws one straight line through the band\'s corners', () => {
  for (const n of [1, 2, 3]) {
    // Brick above the digital line z = x/n + 3, turf below (non-drivable, so
    // the ¾ cap applies; a drivable lower surface is the half-cell test below).
    const plan = shapePlan(48, 48, (column, row) => row >= Math.floor(column / n) + 3, 'G');
    const fill = edgeFillFor(plan, allCells(plan));
    assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = 6; x <= Math.min(40, 3 * n * 12); x += 0.05) {
      xs.push(x);
      zs.push(boundaryUnder(plan, fill, 'brick', x));
    }
    const line = straightness(xs, zs);
    assert.ok(Math.abs(line.slope - 1 / n) < 2e-3, `1:${n} leans ${line.slope}`);
    assert.ok(line.deviation < 0.01, `1:${n} strays ${line.deviation} of a cell from straight`);
    // …and it is the tight line: through the band's convex corners, the
    // bottom-right corners of each run's last band cell (x = kn, z = k + 2).
    for (let i = 0; i < xs.length; i += 1) assert.ok(Math.abs(zs[i] - (xs[i] / n + 2)) < 0.01, `1:${n} at x ${xs[i]}: ${zs[i]}`);
  }
});

test('a shallow staircase keeps to the cap with a kneed ramp, continuous and near-straight', () => {
  for (const n of [4, 5, 9]) {
    const plan = shapePlan(64, 30, (column, row) => row >= Math.floor(column / n) + 3, 'G');
    const fill = edgeFillFor(plan, allCells(plan));
    const { worst } = assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
    assert.ok(worst <= ULTRA_GROUND.edge.capCells + 1e-6);
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = 8; x <= 56; x += 0.05) {
      xs.push(x);
      zs.push(boundaryUnder(plan, fill, 'brick', x));
    }
    const line = straightness(xs, zs);
    const m = ULTRA_GROUND.edge.capCells;
    // The knee: the staircase's unit jog becomes a (1 − cap − cap/n)-cell
    // bump spread over cap of a cell — no vertical step anywhere.
    const bump = 1 - m - m / n;
    assert.ok(line.deviation <= bump + 0.02, `1:${n} strays ${line.deviation} (bump ${bump})`);
    assert.ok(line.jump < 0.05, `1:${n} jumps ${line.jump} of a cell between samples 0.05 apart`);
    assert.ok(Math.abs(line.slope - 1 / n) < 5e-3, `1:${n} leans ${line.slope}`);
  }
});

test('an irregular digital line comes out one near-straight line, not a zig-zag of steps', () => {
  // Runs of 2 and 3 (2:5), 2-3 with the odd 1 (5:12), and 3:4 (runs of 1 and 2 near 45°).
  for (const [p, q, tolerance] of [[2, 5, 0.1], [3, 7, 0.13], [5, 12, 0.16], [2, 3, 0.06], [3, 4, 0.12]] as const) {
    const plan = shapePlan(64, 70, (column, row) => row >= Math.floor((p * column) / q) + 3, 'G');
    const fill = edgeFillFor(plan, allCells(plan));
    assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
    const xs: number[] = [];
    const zs: number[] = [];
    for (let x = 8; x <= 56; x += 0.05) {
      xs.push(x);
      zs.push(boundaryUnder(plan, fill, 'brick', x));
    }
    const line = straightness(xs, zs);
    assert.ok(Math.abs(line.slope - p / q) < 5e-3, `${p}:${q} leans ${line.slope}`);
    // The unstraightened staircase strays half a cell with one-cell jumps.
    assert.ok(line.deviation < tolerance, `${p}:${q} strays ${line.deviation} of a cell`);
    assert.ok(line.jump < 0.06, `${p}:${q} jumps ${line.jump}`);
  }
});

test('every orientation straightens alike: a band below, left or right of the road', () => {
  const base = (column: number, row: number): boolean => row >= Math.floor(column / 2) + 3;
  const size = 40;
  const variants: [string, (column: number, row: number) => boolean][] = [
    ['above', base],
    ['below', (column, row) => base(column, size - 1 - row)],
    ['right', (column, row) => base(row, column)],
    ['left', (column, row) => base(row, size - 1 - column)],
  ];
  const counts: number[] = [];
  for (const [name, band] of variants) {
    for (const ground of ['G', 'P']) {
      const plan = shapePlan(size, size, band, ground);
      const fill = edgeFillFor(plan, allCells(plan));
      assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
      assert.ok(fill.pockets.chain > 10, `${name}/${ground}: no chain straightened the staircase`);
      if (ground === 'G') counts.push(fill.cells.size);
    }
  }
  assert.ok(counts.every((count) => count === counts[0]), `the four orientations fill ${counts.join('/')} cells`);
});

test('a stair-stepped band is filled on both sides, and only ever toward itself', () => {
  const plan = gridPlan([
    'BBPPPPPPPP',
    'GBBPPPPPPP',
    'GGBBPPPPPP',
    'GGGBBPPPPP',
    'GGGGBBPPPP',
    'GGGGGBBPPP',
    'GGGGGGBBPP',
    'GGGGGGGBBP',
  ]);
  const fill = edgeFillFor(plan, allCells(plan));
  assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
  let road = 0;
  let turf = 0;
  for (const [cell, filled] of fill.cells) {
    assert.notEqual(plan.heightfield.surfaces[cell], 'brick', 'a band cell took a fill');
    assert.equal(filled.towards, 'brick');
    if (plan.heightfield.surfaces[cell] === 'pavement') road += 1;
    if (plan.heightfield.surfaces[cell] === 'grass') turf += 1;
  }
  assert.ok(road >= 5 && turf >= 5, `road ${road}, turf ${turf}: both sides of the band were not straightened`);
});

test('the cap is ½ cell … ¾ cell, and never more than ¾ of a metre', () => {
  assert.equal(edgeCapCells(1), 0.75);
  assert.equal(edgeCapCells(1.5), 0.5);
  assert.ok(edgeCapCells(2) <= 0.375 + 1e-12);
  // Switchback's 1.5 m cells: the same staircase keeps to half a cell.
  const plan = shapePlan(40, 30, (column, row) => row >= Math.floor(column / 3) + 3, 'D', 'G', 1.5);
  const fill = edgeFillFor(plan, allCells(plan));
  const { worst } = assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
  assert.equal(fill.capCells, 0.5);
  assert.ok(worst <= 0.5 + 1e-6 && worst > 0.4, `worst ${worst}`);
});

test('A12: a fill into a drivable cell keeps to half a cell — the ridden edge reads true', () => {
  assert.equal(drivableCapCells(1), 0.5);
  assert.equal(drivableCapCells(1.5), 0.5);
  assert.ok(drivableCapCells(2) <= 0.375 + 1e-12);
  for (const material of ['pavement', 'roughPavement', 'dirt'] as const) assert.ok(ULTRA_DRIVABLE_MATERIALS.has(material));
  for (const material of ['grass', 'gravel', 'brick', 'concrete', 'wood'] as const) assert.ok(!ULTRA_DRIVABLE_MATERIALS.has(material));
  // Every drivable surface is also crisp (no §4c blend), and so are the gravel verges.
  for (const material of ULTRA_DRIVABLE_MATERIALS) assert.ok(ULTRA_CRISP_MATERIALS.has(material));
  assert.ok(ULTRA_CRISP_MATERIALS.has('gravel') && !ULTRA_CRISP_MATERIALS.has('grass'));
  // Brick over the road at 1:1 is still one exact line (it needs n/(n+1) = ½) …
  const exact = shapePlan(40, 40, (column, row) => row >= column + 3);
  const exactFill = edgeFillFor(exact, allCells(exact));
  assertFieldLaws(exact, exactFill, new Set(exact.heightfield.surfaces.map((_, cell) => cell)));
  const xs: number[] = [];
  const zs: number[] = [];
  for (let x = 6; x <= 30; x += 0.05) {
    xs.push(x);
    zs.push(boundaryUnder(exact, exactFill, 'brick', x));
  }
  assert.ok(straightness(xs, zs).deviation < 0.01, 'the 1:1 kerb over the road is not one line');
  // … and at 1:2 and 1:3 it keeps to ½ with a kneed ramp: no covered point past half a cell,
  // continuous, and no further off straight than the knee's bump.
  for (const [ground, band] of [['P', 'B'], ['R', 'B'], ['D', 'G'], ['D', 'B'], ['P', 'G']] as const) {
    for (const n of [2, 3]) {
      const plan = shapePlan(64, 40, (column, row) => row >= Math.floor(column / n) + 3, ground, band);
      const fill = edgeFillFor(plan, allCells(plan));
      const { worst } = assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
      assert.ok(fill.cells.size > 10, `${band} over ${ground} at 1:${n}: nothing filled`);
      assert.ok(worst <= 0.5 + 1e-6, `${band} over ${ground} at 1:${n}: a covered point ${worst} of a cell into the ridden surface`);
      const bx: number[] = [];
      const bz: number[] = [];
      for (let x = 8; x <= 56; x += 0.05) {
        bx.push(x);
        bz.push(boundaryUnder(plan, fill, LETTER[band], x));
      }
      const line = straightness(bx, bz);
      // A18 lifts each knee by the rounding's dip, so the ramp's steep run is a little
      // steeper than 1:1 (1.28 at 1:2); still a ramp, never a step.
      assert.ok(line.jump < 0.075, `${band} over ${ground} at 1:${n} jumps ${line.jump}`);
      assert.ok(line.deviation <= 1 - 0.5 - 0.5 / n + 0.02, `${band} over ${ground} at 1:${n} strays ${line.deviation}`);
    }
  }
  // Between two non-drivable surfaces, and on a gravel verge, the ¾ cap still holds, and is used.
  for (const [ground, band] of [['G', 'B'], ['V', 'G']] as const) {
    const turf = shapePlan(64, 40, (column, row) => row >= Math.floor(column / 3) + 3, ground, band);
    const turfFill = edgeFillFor(turf, allCells(turf));
    const { worst } = assertFieldLaws(turf, turfFill, new Set(turf.heightfield.surfaces.map((_, cell) => cell)));
    assert.ok(worst > 0.6 && worst <= 0.75 + 1e-6, `${band} over ${ground} reaches ${worst}`);
  }
});

test('A18: a drivable knee is drawn rounded — tangent-continuous, inside the ½ cap — and nothing else is', () => {
  const k = ULTRA_GROUND.edge.kneeRoundCells;
  assert.ok(k > 0 && k <= ULTRA_GROUND.edge.drivableCapCells, `kneeRoundCells ${k}`);
  // The smooth maximum: never below the hard one, equal once the lines part by k.
  assert.equal(edgeRoundedDistance(0.3, 0.3 + k), 0.3 + k);
  assert.ok(Math.abs(edgeRoundedDistance(0.2, 0.2) - (0.2 + k / 4)) < 1e-12);
  for (let a = -1; a <= 1; a += 0.1) for (let b = -1; b <= 1; b += 0.1) assert.ok(edgeRoundedDistance(a, b) >= Math.max(a, b) - 1e-12);
  const slopeJump = (xs: readonly number[], zs: readonly number[], keep: (x: number) => boolean): number => {
    let worst = 0;
    for (let i = 2; i < xs.length; i += 1) {
      if (!keep(xs[i - 1])) continue;
      const s1 = (zs[i - 1] - zs[i - 2]) / (xs[i - 1] - xs[i - 2]);
      const s2 = (zs[i] - zs[i - 1]) / (xs[i] - xs[i - 1]);
      worst = Math.max(worst, Math.abs(s2 - s1));
    }
    return worst;
  };
  for (const [ground, band] of [['P', 'B'], ['D', 'G']] as const) {
    for (const n of [2, 3]) {
      const plan = shapePlan(64, 40, (column, row) => row >= Math.floor(column / n) + 3, ground, band);
      const fill = edgeFillFor(plan, allCells(plan));
      // The laws (the ½ cap on every covered point) hold with the rounding drawn.
      const { worst } = assertFieldLaws(plan, fill, new Set(plan.heightfield.surfaces.map((_, cell) => cell)));
      assert.ok(worst <= 0.5 + 1e-6);
      const rounded = [...fill.cells.values()].filter((cell) => cell.round === true);
      assert.ok(rounded.length > 5, `${band} over ${ground} at 1:${n}: ${rounded.length} rounded knees`);
      for (const cell of rounded) assert.ok(cell.mode === 'union' && cell.lines.length === 2);
      // Kinked, the same field turns by the knee's whole angle between two samples; rounded, by far less.
      const kinked: EdgeFillField = { ...fill, cells: new Map([...fill.cells].map(([at, cell]) => [at, { ...cell, round: false }])) };
      const columns = plan.heightfield.columns - 1;
      const roundColumns = new Set([...fill.cells].filter(([, cell]) => cell.round === true).map(([at]) => at % columns));
      // Inside a knee's column, clear of its edges (where the band's own corners turn, unrounded).
      const inRound = (x: number): boolean => roundColumns.has(Math.floor(x)) && x - Math.floor(x) > 0.08 && x - Math.floor(x) < 0.92;
      const xs: number[] = [];
      const soft: number[] = [];
      const hard: number[] = [];
      for (let x = 8; x <= 56; x += 0.02) {
        xs.push(x);
        soft.push(boundaryUnder(plan, fill, LETTER[band], x));
        hard.push(boundaryUnder(plan, kinked, LETTER[band], x));
      }
      const softJump = slopeJump(xs, soft, inRound);
      const hardJump = slopeJump(xs, hard, inRound);
      assert.ok(softJump < 0.5 * hardJump, `${band} over ${ground} at 1:${n}: the knee still turns ${softJump} (kinked ${hardJump})`);
      assert.ok(straightness(xs, soft).jump < 0.06, 'the rounded boundary jumps');
    }
  }
  // Between non-drivable surfaces (the ¾ cap) nothing is rounded.
  const turf = shapePlan(64, 40, (column, row) => row >= Math.floor(column / 5) + 3, 'G', 'B');
  assert.equal([...edgeFillFor(turf, allCells(turf)).cells.values()].filter((cell) => cell.round === true).length, 0);
});

test('a lone cell and a one-cell diagonal path are never swallowed', () => {
  const island = gridPlan(['GGG', 'GPG', 'GGG']);
  assert.equal(edgeFillFor(island, allCells(island)).cells.size, 0);
  // A one-cell pavement path between two brick bands on a diagonal would be
  // covered from both sides; it is left alone.
  const path = gridPlan([
    'PBBBBBBB',
    'BPBBBBBB',
    'BBPBBBBB',
    'BBBPBBBB',
    'BBBBPBBB',
    'BBBBBPBB',
    'BBBBBBPB',
    'BBBBBBBP',
  ]);
  const fill = edgeFillFor(path, allCells(path));
  assertFieldLaws(path, fill, new Set(path.heightfield.surfaces.map((_, cell) => cell)));
  assert.equal(fill.cells.size, 0, 'a one-cell diagonal path was drawn lopsided');
});

test('spill, wood and every cell a hazard is drawn over never take part', () => {
  const wood = gridPlan(['BBPP', 'WBBP', 'WWBB']);
  for (const [cell] of edgeFillFor(wood, allCells(wood)).cells) {
    assert.notEqual(wood.heightfield.surfaces[cell], 'wood');
  }
  const spill = gridPlan(['BBSSSS', 'PBBSSS', 'PPBBSS', 'PPPBBS']);
  const spillFill = edgeFillFor(spill, allCells(spill));
  for (const [cell] of spillFill.cells) assert.notEqual(spill.heightfield.surfaces[cell], 'spill');
  // A pothole across a long staircase: nothing within its drawn reach fills.
  const band = (column: number, row: number): boolean => row >= Math.floor(column / 2) + 2;
  const pothole: Hazard = { id: 'p', kind: 'potholeDeep', centre: { x: 12.5, y: 0, z: 7.5 }, radius: 0.8 };
  const plain = shapePlan(30, 20, band);
  const holed = { ...plain, hazards: [pothole] } as LevelPlan;
  const plainFill = edgeFillFor(plain, allCells(plain));
  const holedFill = edgeFillFor(holed, allCells(holed));
  assertFieldLaws(holed, holedFill, new Set(holed.heightfield.surfaces.map((_, cell) => cell)));
  assert.ok(holedFill.cells.size < plainFill.cells.size, 'the hazard excluded nothing');
  const columns = 30;
  for (const [cell] of holedFill.cells) {
    const row = Math.floor(cell / columns);
    const column = cell - row * columns;
    const dx = Math.max(column - pothole.centre.x, 0, pothole.centre.x - (column + 1));
    const dz = Math.max(row - pothole.centre.z, 0, pothole.centre.z - (row + 1));
    assert.ok(Math.hypot(dx, dz) >= pothole.radius, `cell ${cell} under the pothole was filled`);
  }
});

test('ties break on encroach, and equal surfaces never fill each other', () => {
  // Grass (encroach 1.0) outranks gravel (0.65) at equal rank.
  const turf = shapePlan(20, 14, (column, row) => row >= Math.floor(column / 2) + 2, 'V', 'G');
  const turfFill = edgeFillFor(turf, allCells(turf));
  assert.ok(turfFill.cells.size > 0);
  for (const [cell, filled] of turfFill.cells) {
    assert.equal(turf.heightfield.surfaces[cell], 'gravel');
    assert.equal(filled.towards, 'grass');
  }
  // Pavement never fills anything: it outranks nothing.
  const road = shapePlan(20, 14, (column, row) => row >= Math.floor(column / 2) + 2, 'R', 'P');
  for (const [cell] of edgeFillFor(road, allCells(road)).cells) {
    assert.equal(road.heightfield.surfaces[cell], 'pavement', 'rough pavement was filled by smooth');
  }
  // Brick next to brick: nothing.
  const same = shapePlan(20, 14, (column, row) => row >= Math.floor(column / 2) + 2, 'B', 'B');
  assert.equal(edgeFillFor(same, allCells(same)).cells.size, 0);
});

test('on the shipped town, slice and Switchback every fill obeys the laws', () => {
  for (const plan of [createSliceLevel(), generateLevel('euc').plan, createSwitchbackLevel()]) {
    const { bySurface } = terrainCells(plan);
    const drawn = new Set<number>();
    for (const list of bySurface.values()) for (const cell of list) drawn.add(cell);
    const fill = edgeFillFor(plan, bySurface);
    assert.ok(fill.cells.size > 300, `${plan.id}: only ${fill.cells.size} cells filled`);
    assert.ok(fill.pockets.chain > fill.pockets.chamfer * 10, `${plan.id}: the chains straightened too little`);
    assert.ok(fill.dropped < fill.cells.size * 0.02, `${plan.id}: ${fill.dropped} conflicted cells`);
    const { worst } = assertFieldLaws(plan, fill, drawn);
    assert.ok(worst <= edgeCapCells(plan.heightfield.spacing) + 1e-6);
  }
});

test('the filled region takes its source tile\'s exact tone, and the attributes carry the lines exactly', () => {
  const plan = generateLevel('euc').plan;
  const context = { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 };
  const view = createTerrain(plan, ULTRA_FULL, context);
  try {
    const mesh = view.group.children.find((child) => child.name === 'level-heightfield') as THREE.Mesh;
    const materials = mesh.material as THREE.MeshStandardMaterial[];
    const geometry = mesh.geometry;
    const colour = geometry.getAttribute('color');
    const edge = geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.edge);
    const tone = geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.fillTint);
    const kind = geometry.getAttribute(ULTRA_GROUND_ATTRIBUTES.fillKind);
    const position = geometry.getAttribute('position');
    const index = geometry.index!.array;
    assert.ok(edge !== undefined && tone !== undefined && kind !== undefined);

    // Which vertex starts each drawn cell, and which material draws it.
    const field = plan.heightfield;
    const columns = field.columns - 1;
    const first = new Map<number, number>();
    const materialOf = new Map<number, THREE.MeshStandardMaterial>();
    for (const group of geometry.groups) {
      for (let i = group.start; i < group.start + group.count; i += 6) {
        const a = index[i];
        const column = Math.round((position.getX(a) - field.originX) / field.spacing);
        const row = Math.round((position.getZ(a) - field.originZ) / field.spacing);
        first.set(row * columns + column, a);
        materialOf.set(row * columns + column, materials[group.materialIndex!]);
      }
    }
    const fill = edgeFillFor(plan, terrainCells(plan).bySurface);
    assert.equal(view.ultra?.filledCells, fill.cells.size);
    assert.equal(view.ultra?.fillLines, fill.lines);
    const encode = (linear: number): number => 255 * (linear <= 0.0031308
      ? linear * 12.92
      : 1.055 * linear ** (1 / 2.4) - 0.055);
    let checked = 0;
    for (const [cell, filled] of fill.cells) {
      const a = first.get(cell)!;
      const source = first.get(filled.source)!;
      const own = materialOf.get(cell)!.color;
      const theirs = materialOf.get(filled.source)!.color;
      const row = Math.floor(cell / columns);
      const column = cell - row * columns;
      const expectedKind = groundDetailKind(SURFACES[filled.towards].material) + (filled.mode === 'intersection' && filled.lines.length > 1 ? 8 : 0)
        + (filled.round === true ? 16 : 0);
      for (let vertex = a; vertex < a + 4; vertex += 1) {
        for (const [channel, get] of [['r', 'getX'], ['g', 'getY'], ['b', 'getZ']] as const) {
          // The patch multiplies the tone onto `material × vColor`.
          const filledColour = own[channel] * colour[get](vertex) * tone[get](vertex);
          const target = theirs[channel] * colour[get](source);
          assert.ok(Math.abs(encode(filledColour) - encode(target)) <= 1,
            `cell ${cell} ${channel}: ${encode(filledColour).toFixed(2)} vs ${encode(target).toFixed(2)}`);
        }
        // a, b, c, d = (0,0), (1,0), (0,1), (1,1): the signed distances, to half precision.
        const k = vertex - a;
        const gx = column + (k & 1);
        const gz = row + (k >> 1);
        for (let line = 0; line < 2; line += 1) {
          const stored = line === 0 ? edge.getX(vertex) : edge.getY(vertex);
          const expected = line < filled.lines.length ? edgeSignedDistance(filled.lines[line], gx, gz) : ULTRA_GROUND.edge.sentinel;
          assert.ok(Math.abs(stored - expected) <= Math.max(2e-3, Math.abs(expected) * 1e-3), `cell ${cell} line ${line}: ${stored} vs ${expected}`);
        }
        assert.equal(kind.getX(vertex), expectedKind);
      }
      checked += 1;
    }
    assert.ok(checked > 1000, `only ${checked} filled cells checked`);
    // An unfilled vertex draws nothing: both lines far outside, a unit tone, no kind.
    let unfilled = -1;
    for (const [cell, a] of first) if (!fill.cells.has(cell)) { unfilled = a; break; }
    assert.equal(edge.getX(unfilled), ULTRA_GROUND.edge.sentinel);
    assert.equal(edge.getY(unfilled), ULTRA_GROUND.edge.sentinel);
    assert.equal(tone.getX(unfilled), 1);
    assert.equal(kind.getX(unfilled), 0);
  } finally {
    view.dispose();
  }
});

test('A12: on an Ultra world a ridden or verge cell takes no §4c blend; every other tone is the ordinary one', () => {
  const plan = createSliceLevel();
  const heightfieldColours = (recipe: UltraRecipe | typeof ENHANCED_PRESENTATION): Float32Array => {
    const view = recipe === ENHANCED_PRESENTATION
      ? createTerrain(plan, ENHANCED_PRESENTATION)
      : createTerrain(plan, recipe, { recipe: recipe as UltraRecipe, shared: createUltraShared(), maxAnisotropy: 1 });
    try {
      const mesh = view.group.children.find((child) => child.name === 'level-heightfield') as THREE.Mesh;
      return Float32Array.from(mesh.geometry.getAttribute('color').array as ArrayLike<number>);
    } finally {
      view.dispose();
    }
  };
  const ordinary = heightfieldColours(ENHANCED_PRESENTATION);
  const ultra = heightfieldColours(ULTRA_FULL);
  const noField = heightfieldColours(applyKitOverride(ULTRA_FULL, { edgeFill: false }));
  assert.deepEqual([...noField], [...ordinary], 'with no edge field the Ultra tones are the ordinary ones');
  // Vertices in draw order: the surfaces' cells in `terrainCells` order, four each.
  let vertex = 0;
  let changed = 0;
  let drivableCells = 0;
  for (const [surface, cells] of terrainCells(plan).bySurface) {
    const drivable = ULTRA_CRISP_MATERIALS.has(SURFACES[surface as SurfaceId].material);
    for (let k = 0; k < cells.length; k += 1) {
      let differs = false;
      for (let c = 0; c < 12; c += 1) if (ultra[vertex * 3 + c] !== ordinary[vertex * 3 + c]) differs = true;
      if (drivable) {
        drivableCells += 1;
        if (differs) changed += 1;
      } else {
        assert.ok(!differs, `a ${surface} cell's tone moved`);
      }
      vertex += 4;
    }
  }
  assert.ok(changed > 50, `only ${changed} ridden boundary cells lost the blend`);
  assert.ok(changed < drivableCells * 0.2, `${changed} of ${drivableCells} ridden cells changed: more than the boundaries`);
});

// ---------------------------------------------------------------------------
// The attribute contract
// ---------------------------------------------------------------------------

test('each family carries exactly the attributes the kit says, and an ordinary world none', () => {
  const plan = createTrackLevel();
  const cases: readonly UltraRecipe[] = [
    ULTRA_FULL,
    ULTRA_LIT,
    applyKitOverride(ULTRA_FULL, { edgeFill: false }),
    applyKitOverride(ULTRA_FULL, { ground: false }),
    applyKitOverride(ULTRA_FULL, { blocks: false, ground: false, edgeFill: false }),
  ];
  const ultraNames = Object.values(ULTRA_GROUND_ATTRIBUTES) as string[];
  const carried = (mesh: THREE.Mesh): string[] => Object.keys(mesh.geometry.attributes).filter((name) => ultraNames.includes(name)).sort();
  for (const recipe of cases) {
    const view = createTerrain(plan, recipe, { recipe, shared: createUltraShared(), maxAnisotropy: 1 });
    try {
      const heightfield = view.group.children.find((child) => child.name === 'level-heightfield') as THREE.Mesh;
      const field = view.group.children.find((child) => child.name === 'level-field') as THREE.Mesh;
      assert.deepEqual(carried(heightfield), [...ultraSurfaceAttributes(recipe.ultra, 'heightfield')].sort());
      assert.deepEqual(carried(field), [...ultraSurfaceAttributes(recipe.ultra, 'field')].sort());
      for (const child of view.group.children) {
        if (!child.name.startsWith('level-blocks-')) continue;
        assert.deepEqual(carried(child as THREE.Mesh), [...ultraSurfaceAttributes(recipe.ultra, 'blocks')].sort());
      }
      assert.equal(view.recipe, recipe.id);
      assert.ok(view.ultra !== null && view.ultra.attributeBytes + view.ultra.detailBytes <= view.ultra.bytes);
      // The ground's detail maps come with the ground treatment, and only with it.
      assert.equal(view.ultra.detailBytes > 0, recipe.ultra.ground && ULTRA_GROUND.detail.enabled);
    } finally {
      view.dispose();
    }
  }
  const ordinary = createTerrain(plan, ENHANCED_PRESENTATION);
  try {
    assert.equal(ordinary.ultra, null);
    ordinary.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true) return;
      assert.deepEqual(carried(mesh), [], `${mesh.name} carries an Ultra attribute on an ordinary world`);
      assert.equal(mesh.layers.isEnabled(5), false, `${mesh.name} joined the far-shadow layer on an ordinary world`);
    });
  } finally {
    ordinary.dispose();
  }
});

test('an Ultra recipe without its context, or with a disagreeing one, is refused', () => {
  const plan = createTrackLevel();
  assert.throws(() => createTerrain(plan, ULTRA_FULL), /UltraBuildContext/);
  const other = applyKitOverride(ULTRA_FULL, { edgeFill: false });
  assert.throws(
    () => createTerrain(plan, ULTRA_FULL, { recipe: other, shared: createUltraShared(), maxAnisotropy: 1 }),
    /edgeFill/,
  );
});

test('the town\'s Ultra ground and block attributes fit the 8 MiB line, and the detail maps the ground pass\'s', () => {
  const plan = generateLevel('euc').plan;
  const view = createTerrain(plan, ULTRA_FULL, { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 });
  try {
    assert.ok(view.ultra !== null);
    assert.ok(view.ultra.attributeBytes <= 8 * 1024 * 1024, `${view.ultra.attributeBytes} bytes`);
    assert.ok(view.ultra.attributeBytes > 1024 * 1024, 'the town carries almost nothing, so something was skipped');
    // The pre-R1 ground pass's own additions (detail maps + the attribute
    // bytes it added over T5/T6's ten a vertex) stay far inside its 24 MiB.
    assert.ok(view.ultra.detailBytes > 0 && view.ultra.detailBytes <= 8 * 1024 * 1024, `${view.ultra.detailBytes} detail bytes`);
    // The field, the heightfield and the blocks all spoke.
    let counted = 0;
    view.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh !== true || !mesh.name.startsWith('level-')) return;
      for (const name of Object.values(ULTRA_GROUND_ATTRIBUTES)) {
        const attribute = mesh.geometry.getAttribute(name);
        if (attribute !== undefined) counted += (attribute.array as ArrayLike<number> & { byteLength: number }).byteLength;
      }
    });
    assert.equal(counted, view.ultra.attributeBytes, 'the report and the built attributes disagree');
  } finally {
    view.dispose();
  }
});

test('smoothed slopes: only turf is smoothed — every vertex touching the road, the trail or a deck keeps its ordinary normal to the bit', () => {
  const plan = createSwitchbackLevel();
  const ultra = createTerrain(plan, ULTRA_FULL, { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 });
  const ordinary = createTerrain(plan, ENHANCED_PRESENTATION);
  try {
    const a = (ultra.group.children.find((child) => child.name === 'level-heightfield') as THREE.Mesh).geometry;
    const b = (ordinary.group.children.find((child) => child.name === 'level-heightfield') as THREE.Mesh).geometry;
    // Geometry untouched: positions and indices identical.
    assert.deepEqual(a.getAttribute('position').array, b.getAttribute('position').array);
    assert.deepEqual(a.index!.array, b.index!.array);
    const normalA = a.getAttribute('normal');
    const normalB = b.getAttribute('normal');
    const field = plan.heightfield;
    const columns = field.columns - 1;
    const position = a.getAttribute('position');
    const smoothed = new Set(['grass']);
    const touchesKept = (sampleColumn: number, sampleRow: number): boolean => {
      for (const [dc, dr] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const c = sampleColumn + dc;
        const r = sampleRow + dr;
        if (c < 0 || r < 0 || c >= columns || r >= field.rows - 1) continue;
        if (!smoothed.has(field.surfaces[r * columns + c])) return true;
      }
      return false;
    };
    let held = 0;
    let moved = 0;
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const column = Math.round((position.getX(vertex) - field.originX) / field.spacing);
      const row = Math.round((position.getZ(vertex) - field.originZ) / field.spacing);
      const same = normalA.getX(vertex) === normalB.getX(vertex) && normalA.getY(vertex) === normalB.getY(vertex)
        && normalA.getZ(vertex) === normalB.getZ(vertex);
      const length = Math.hypot(normalA.getX(vertex), normalA.getY(vertex), normalA.getZ(vertex));
      assert.ok(Math.abs(length - 1) < 1e-5, 'a smoothed normal is not unit');
      if (touchesKept(column, row)) {
        assert.ok(same, `vertex ${vertex} touching the road, the trail or a deck moved`);
        held += 1;
      } else if (Math.abs(normalA.getX(vertex) - normalB.getX(vertex)) + Math.abs(normalA.getY(vertex) - normalB.getY(vertex))
        + Math.abs(normalA.getZ(vertex) - normalB.getZ(vertex)) > 1e-6) {
        moved += 1;
      }
    }
    assert.ok(held > 1000 && moved > 1000, `held ${held}, moved ${moved}`);
    assert.ok(Math.abs((ultra.ultra?.smoothedNormals ?? 0) - moved) <= moved * 0.01, `report ${ultra.ultra?.smoothedNormals} vs ${moved}`);
  } finally {
    ultra.dispose();
    ordinary.dispose();
  }
});
