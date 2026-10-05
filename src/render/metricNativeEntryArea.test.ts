/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R21 SOURCE-ONLY / UNRUN. Complete native-ground area qualification controls.
 * No nine-trace result is admitted as a two-dimensional proof. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan, Prop, GroundSurfacePatch, GroundSurfaceTriangle } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { createGroundSample } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { fieldHeightAt } from '../level/buildPlan.ts';
import { existingEntryWalkBottom } from './metricArchitecture.ts';
import { nativeEntrySurfaceAt, nativeEntryWalkArea } from './metricNativeEntryArea.ts';
import { buildMetricFacadePlan } from './metricFacadePlan.ts';

function ground(surface: 'grass' | 'pavement' = 'pavement', spacing = 0.5): LevelPlan {
  const columns = Math.round(24 / spacing) + 1, rows = Math.round(20 / spacing) + 1;
  return { id: 'native-area-fixture', segments: [], checkpoints: [], props: [], solids: [],
    spawn: { position: { x: -10, y: 0, z: -9 }, headingY: 0 }, surround: { height: 0, surface: 'grass' },
    heightfield: { originX: -12, originZ: -10, spacing, columns, rows,
      heights: Array(columns * rows).fill(0), surfaces: Array((columns - 1) * (rows - 1)).fill(surface) } };
}
const origin = { x: 0, y: 0, z: 0 };
const qualified = (plan: LevelPlan): number | null => existingEntryWalkBottom(plan, origin, 0, 6, 0, 0.54);
/** Independent exact source triangle fixture; every emitted complete cell
 * contains both native triangles with their original vertex supports. */
function completeCellPatch(plan: LevelPlan, surface: GroundSurfacePatch['surface'] = 'brick',
  sourceSurface: GroundSurfacePatch['sourceSurface'] = 'grass'): GroundSurfacePatch {
  const f = plan.heightfield, triangles: GroundSurfaceTriangle[] = [];
  // Intentionally includes the complete neighbour cells around the strip.
  for (let row = 18; row <= 23; row++) for (let column = 20; column <= 39; column++) {
    const at = (u: number, v: number): Vec3 => ({ x: f.originX + (column + u) * f.spacing,
      z: f.originZ + (row + v) * f.spacing, y: f.heights[(row + v) * f.columns + column + u] });
    const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1), cell = row * (f.columns - 1) + column;
    triangles.push({ cell, vertices: [a, d, b] }, { cell, vertices: [a, c, d] });
  }
  return { id: 'complete-native-cell-paving', surface, sourceSurface, triangles };
}
/** Fixture clipping is independent of the area qualifier. Every emitted
 * fragment stays inside ONE native triangle with its original support plane. */
function rectanglePatch(plan: LevelPlan, left: number, right: number, bottom: number, top: number,
  surface: GroundSurfacePatch['surface'], sourceSurface: GroundSurfacePatch['sourceSurface'] = 'grass'): GroundSurfacePatch {
  const f = plan.heightfield, triangles: GroundSurfaceTriangle[] = [];
  const clip = (polygon: readonly Vec3[], axis: 'x' | 'z', limit: number, low: boolean): Vec3[] => {
    const result: Vec3[] = [];
    for (let index = 0; index < polygon.length; index++) {
      const a = polygon[index], b = polygon[(index + 1) % polygon.length], da = a[axis] - limit, db = b[axis] - limit;
      const insideA = low ? da >= 0 : da <= 0, insideB = low ? db >= 0 : db <= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = da / (da - db); result.push({ x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    return result.filter((p, index) => { const previous = result[(index + result.length - 1) % result.length];
      return p.x !== previous.x || p.z !== previous.z; });
  };
  const firstColumn = Math.max(0, Math.floor((left - f.originX) / f.spacing));
  const lastColumn = Math.min(f.columns - 2, Math.floor((right - f.originX) / f.spacing));
  const firstRow = Math.max(0, Math.floor((bottom - f.originZ) / f.spacing));
  const lastRow = Math.min(f.rows - 2, Math.floor((top - f.originZ) / f.spacing));
  for (let row = firstRow; row <= lastRow; row++) for (let column = firstColumn; column <= lastColumn; column++) {
    const at = (u: number, v: number): Vec3 => { const x = f.originX + (column + u) * f.spacing,
      z = f.originZ + (row + v) * f.spacing; return { x, z, y: fieldHeightAt(f, plan.surround, x, z) }; };
    const a = at(0, 0), b = at(1, 0), c = at(0, 1), d = at(1, 1);
    for (const native of [[a, d, b], [a, c, d]]) {
      let polygon: readonly Vec3[] = native;
      for (const [axis, limit, low] of [['x', left, true], ['x', right, false], ['z', bottom, true], ['z', top, false]] as const)
        polygon = clip(polygon, axis, limit, low);
      for (let index = 1; index < polygon.length - 1; index++) {
        const vertices = [polygon[0], polygon[index], polygon[index + 1]] as const;
        const area = (vertices[1].x - vertices[0].x) * (vertices[2].z - vertices[0].z)
          - (vertices[1].z - vertices[0].z) * (vertices[2].x - vertices[0].x);
        if (Math.abs(area) > 1e-12) triangles.push({ cell: row * (f.columns - 1) + column, vertices });
      }
    }
  }
  return { id: 'precise-native-rectangle', surface, sourceSurface, triangles };
}

test('complete raw native paving supports rotated and nonunit-spacing source strips without plan mutation', () => {
  for (const spacing of [0.5, 1.25, 2.5]) for (const yaw of [0, 0.63, -0.91]) {
    const plan = ground('pavement', spacing), before = JSON.stringify(plan);
    const result = nativeEntryWalkArea(plan, { x: 1, y: 0, z: 1 }, yaw, 6, 0, 0.54);
    assert.ok(result, `Whole area qualifies at spacing=${spacing}, yaw=${yaw}`);
    assert.ok(Math.abs(result.area - 7.08 * 0.55) < 1e-7); assert.equal(result.bottom, 0);
    assert.ok(result.regions > 1 && result.nativeCells > 1);
    const sampler = new PlanTerrainSampler(plan), sample = createGroundSample();
    for (const point of result.partitionVertices) {
      sampler.sampleGround(point.x, point.z, sample);
      assert.equal(nativeEntrySurfaceAt(plan, point), sample.surface);
      assert.ok(Math.abs(point.y - sample.height) < 1e-8);
    }
    assert.equal(JSON.stringify(plan), before);
  }
});

test('complete native triangle paving over grass qualifies only with exact source guards and entire cell coverage', () => {
  const plan = ground('grass'), pavement = completeCellPatch(plan);
  const covered = { ...plan, groundSurfacePatches: [pavement] }, before = JSON.stringify(covered);
  const result = nativeEntryWalkArea(covered, origin, 0, 6, 0, 0.54);
  assert.ok(result); assert.equal(result.bottom, 0); assert.equal(qualified(covered), 0);
  assert.equal(result.surfaceQualification, 'complete-native-triangles');
  assert.ok(Math.abs(result.area - 7.08 * 0.55) < 1e-7);
  const sampler = new PlanTerrainSampler(covered), sample = createGroundSample();
  for (const point of result.partitionVertices) {
    sampler.sampleGround(point.x, point.z, sample);
    assert.equal(nativeEntrySurfaceAt(covered, point), sample.surface);
    assert.equal(sample.surface, 'brick'); assert.ok(Math.abs(point.y - sample.height) < 1e-8);
  }
  assert.equal(JSON.stringify(covered), before);
  assert.equal(qualified(plan), null, 'Same source with the paving absent refuses');
  assert.equal(qualified({ ...plan, groundSurfacePatches: [{ ...pavement, sourceSurface: 'gravel' }] }), null,
    'A guard may not treat a previous patch result as the original source');
  const narrow = rectanglePatch(plan, 0, 6, 0.62, 0.63, 'pavement', 'grass');
  assert.equal(qualified({ ...plan, groundSurfacePatches: [narrow] }), null, 'A connected narrow line is not the complete walk area');
  const lostCell = Math.floor((0.5 - plan.heightfield.originZ) / plan.heightfield.spacing) * (plan.heightfield.columns - 1)
    + Math.floor((2.5 - plan.heightfield.originX) / plan.heightfield.spacing);
  assert.equal(pavement.triangles.filter(triangle => triangle.cell === lostCell).length, 2);
  const missingCell = { ...plan, groundSurfacePatches: [{ ...pavement,
    triangles: pavement.triangles.filter(triangle => triangle.cell !== lostCell) }] };
  new PlanTerrainSampler(missingCell).sampleGround(2.75, 0.75, sample); assert.equal(sample.surface, 'grass');
  assert.equal(qualified(missingCell), null, 'A missing complete native cell is a real unpaved region, not an area-sum allowance');
  let removed = false;
  const missingHalf = { ...plan, groundSurfacePatches: [{ ...pavement,
    triangles: pavement.triangles.filter(triangle => {
      if (triangle.cell === lostCell && !removed) { removed = true; return false; } return true;
    }) }] };
  assert.ok(removed);
  new PlanTerrainSampler(missingHalf).sampleGround(2.9, 0.6, sample); assert.equal(sample.surface, 'grass');
  assert.equal(qualified(missingHalf), null, 'One native triangle cannot prove its missing half of the cell');
  const highHeights = [...plan.heightfield.heights];
  const highColumn = Math.round((4 - plan.heightfield.originX) / plan.heightfield.spacing);
  const highRow = Math.round((0.5 - plan.heightfield.originZ) / plan.heightfield.spacing);
  highHeights[highRow * plan.heightfield.columns + highColumn] = 0.121;
  const high = { ...plan, heightfield: { ...plan.heightfield, heights: highHeights } };
  assert.equal(qualified({ ...high, groundSurfacePatches: [completeCellPatch(high)] }), null,
    'Complete surface coverage never bypasses the native support-height maximum');
});

test('original clipped-rectangle numerical failure stays conservatively refused rather than snapping away a possible sliver', () => {
  const plan = ground('grass'), pavement = rectanglePatch(plan, -0.8, 6.8, 0.2, 1.1, 'brick', 'grass');
  const covered = { ...plan, groundSurfacePatches: [pavement] }, before = JSON.stringify(covered);
  // Exact original v1/v2 positive fixture retained as the ambiguous-input
  // negative. Root failures remain historical evidence; no epsilon is widened.
  assert.equal(qualified(covered), null, 'The original collapsed intersection still has no complete representable partition proof');
  assert.equal(JSON.stringify(covered), before);
});

test('a hostile narrow dirt island defeats complete-cell paving under actual original-source/cell priority', () => {
  const plan = ground('grass'), pavement = completeCellPatch(plan);
  const dirt = rectanglePatch(plan, 2.03, 2.09, 0.449, 0.451, 'dirt', 'grass');
  const withIsland = { ...plan, groundSurfacePatches: [pavement, dirt] }, before = JSON.stringify(withIsland);
  for (const depth of [0.35, 0.625, 0.90]) for (const target of [5.46, 6, 6.54])
    for (let step = 0; step <= 400; step++) assert.equal(nativeEntrySurfaceAt(withIsland,
      { x: target * step / 400, y: 0, z: depth }), 'brick');
  const sampler = new PlanTerrainSampler(withIsland), sample = createGroundSample();
  sampler.sampleGround(2.06, 0.45, sample); assert.equal(sample.surface, 'dirt');
  assert.equal(nativeEntrySurfaceAt(withIsland, { x: 2.06, y: 0, z: 0.45 }), 'dirt');
  assert.equal(qualified(withIsland), null, 'A real between-trace dirt region refuses the shortcut and the entry');
  assert.equal(qualified({ ...plan, groundSurfacePatches: [pavement] }), 0, 'Removing the actual hostile write restores complete paving');
  assert.equal(JSON.stringify(withIsland), before);
});

test('a dirt island between all nine legacy traces rejects the full two-dimensional area', () => {
  const plan = ground('pavement'), island = rectanglePatch(plan, 2.03, 2.09, 0.449, 0.451, 'dirt', 'pavement');
  const withIsland = { ...plan, groundSurfacePatches: [island] };
  // Every point on the old nine lines is paved; those lines are not a proof.
  for (const depth of [0.35, 0.625, 0.90]) for (const target of [5.46, 6, 6.54])
    for (let step = 0; step <= 400; step++) assert.equal(nativeEntrySurfaceAt(withIsland,
      { x: target * step / 400, y: 0, z: depth }), 'pavement');
  assert.equal(nativeEntrySurfaceAt(withIsland, { x: 2.06, y: 0, z: 0.45 }), 'dirt');
  assert.equal(qualified(withIsland), null, 'The actual between-trace region refuses');
  assert.equal(qualified(plan), 0, 'Removing the known-bad island restores the proven native area');
});

test('touching-cell priority and original-source guard order match actual PlanTerrainSampler', () => {
  const plan = ground('pavement', 1), current = rectanglePatch(plan, 0, 1, 0, 1, 'brick', 'pavement');
  const neighbour = rectanglePatch(plan, -1, 0, 0, 1, 'dirt', 'pavement');
  // Global patch order conflicts with cell order intentionally. Neighbour
  // priority is later at the exact grid edge, even when its patch came first.
  const ordered = { ...plan, groundSurfacePatches: [neighbour, current] }, sampler = new PlanTerrainSampler(ordered), sample = createGroundSample();
  for (const x of [-1e-8, 0, 0.5e-9, 2e-9, 1e-8]) for (const z of [0, 0.3, 0.5, 1]) {
    const point = { x, y: 0, z }; sampler.sampleGround(x, z, sample);
    assert.equal(nativeEntrySurfaceAt(ordered, point), sample.surface, `Exact touching priority ${x}/${z}`);
  }
  assert.equal(nativeEntrySurfaceAt(ordered, { x: 0, y: 0, z: 0.3 }), 'dirt');
  const guards = { ...plan, groundSurfacePatches: [current, { ...current, surface: 'dirt' as const, sourceSurface: 'brick' as const }] };
  assert.equal(nativeEntrySurfaceAt(guards, { x: 0.3, y: 0, z: 0.3 }), 'brick', 'Second guard checks original pavement, not first patch brick');
});

test('height extrema, off-field, malformed fragments and bounded-work uncertainty refuse instead of falling back to traces', () => {
  const plan = ground('pavement'), f = plan.heightfield;
  const heights = [...f.heights], column = Math.round((4 - f.originX) / f.spacing), row = Math.round((0.5 - f.originZ) / f.spacing);
  heights[row * f.columns + column] = 0.121;
  assert.equal(qualified({ ...plan, heightfield: { ...f, heights } }), null, 'A native support peak between traces exceeds the bound');
  assert.equal(qualified({ ...plan, heightfield: { ...f, heights: f.heights.map(() => 0.119) } }), 0.119);
  for (const bad of [{ ...f, spacing: 0 }, { ...f, spacing: Infinity }, { ...f, columns: 1 },
    { ...f, heights: [0] }, { ...f, surfaces: [] }, { ...f, originX: NaN },
    { ...f, heights: f.heights.map(() => NaN) }]) assert.equal(qualified({ ...plan, heightfield: bad }), null);
  assert.equal(nativeEntryWalkArea(plan, { x: 100, y: 0, z: 100 }, 0, 6, 0, 0.54), null);
  assert.equal(nativeEntryWalkArea(plan, origin, NaN, 6, 0, 0.54), null);
  assert.equal(nativeEntryWalkArea(plan, origin, 0, Infinity, 0, 0.54), null);
  assert.equal(nativeEntryWalkArea(plan, origin, 0, 6, 0, 0), null);
  const patch = rectanglePatch(plan, 2, 3, 0.4, 0.8, 'brick', 'pavement'), first = patch.triangles[0];
  assert.ok(first);
  const wrongHeight = { ...patch, triangles: [{ ...first, vertices: first.vertices.map(p => ({ ...p, y: 1 })) as unknown as GroundSurfaceTriangle['vertices'] }] };
  assert.equal(qualified({ ...plan, groundSurfacePatches: [wrongHeight] }), null, 'Unknown off-plane fragment refuses');
  const many = { ...patch, triangles: Array(65537).fill(first) };
  assert.equal(qualified({ ...plan, groundSurfacePatches: [many] }), null, 'Work cap refuses; it does not switch to a sampling ladder');
});

test('secondary entries remain unadmitted on any failing area while the original served human entry stays unchanged', () => {
  const raw = ground('grass'), prop: Prop = { kind: 'building' as const, look: 'residential', position: { x: 0, y: 0, z: -6 },
    rotationY: 0, scale: 1, size: { x: 42, y: 7, z: 12 } };
  const plan: LevelPlan = { ...raw, props: [prop], solids: [{ centre: { x: 0, y: 3.5, z: -6 },
    halfExtents: { x: 21, y: 3.5, z: 6 }, rotationY: 0, surface: 'pavement' }],
    districtAdjacency: { revision: 'district-v1', sourceWorldId: raw.id, physicalWorldId: raw.id,
      frontages: [{ id: 'original-entry', propIndex: 0, district: 'residential', role: 'frontage-lawn',
        streetSegmentId: 'original-road', position: origin, yaw: 0, width: 42, reach: 8, retainedOpening: false, patchIds: [] }],
      links: [], groups: [], rejected: [], addedTriangles: 0, addedProps: 0, addedSolids: 0, addedSoftBodies: 0 } };
  const before = JSON.stringify(plan), descriptor = buildMetricFacadePlan(plan, { propIndices: [0], protectedOpenings: [] });
  assert.equal(descriptor.architecture!.filter(item => item.kind === 'walk-entry').length, 0);
  const entries = descriptor.apertures.filter(item => item.kind === 'entry'); assert.equal(entries.length, 1);
  assert.ok(Math.abs(entries[0].right - entries[0].left - 1.08) < 1e-8 && Math.abs(entries[0].top - entries[0].bottom - 2.12) < 1e-8);
  assert.equal(JSON.stringify(plan), before);
});
