/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R21 SOURCE-ONLY / UNRUN controls adapted from frozen R19 guards. Intended target: src/render/metricFacade.test.ts.
 * Test failure or success is UNVERIFIED until the root stages and runs this file. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { buildMetricFacadePlan, metricFacadeCost, metricFacadeShadowCost, metricExtractionLedger,
  type MetricFacadePlan, type MetricSurface } from './metricFacadePlan.ts';
import { createMetricFacade } from './metricFacade.ts';
import { prepareMetricFacades } from './metricFacadePreparation.ts';
import { ENVIRONMENT_BATCHING } from '../data/tuning.ts';
import { ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { buildMetricFacadePlan as legacyFacadePlan } from './metricFacadeR19Baseline.fixture.ts';
import { inStreetFacadeOpening, type FacadeOpening } from './streetFacadeOpenings.ts';

function fixture(look: 'commercial' | 'residential' | 'industrial' = 'residential', width = 42): LevelPlan {
  const prop: Prop = { kind: 'building', look, position: { x: 0, y: 0, z: 0 }, rotationY: 0, scale: 1,
    size: { x: width, y: look === 'industrial' ? 11.1 : 7, z: 12 } };
  return { id: 'metric-exemplar', props: [prop], solids: [{ centre: { x: 0, y: prop.size!.y / 2, z: 0 },
    halfExtents: { x: width / 2, y: prop.size!.y / 2, z: 6 }, rotationY: 0, surface: 'pavement' }],
    segments: [], checkpoints: [], spawn: { position: { x: -60, y: 0, z: -60 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: { originX: 0, originZ: 0, spacing: 1,
      columns: 2, rows: 2, heights: [0, 0, 0, 0], surfaces: ['grass'] },
    districtAdjacency: { revision: 'district-v1', sourceWorldId: 'metric-exemplar', physicalWorldId: 'metric-exemplar',
      frontages: [{ id: 'existing-walk', propIndex: 0, district: look, role: look === 'industrial' ? 'service-edge' : 'frontage-lawn',
        streetSegmentId: 'existing-road', position: { x: 0, y: 0, z: 6 }, yaw: 0, width, reach: 8,
        retainedOpening: false, patchIds: [] }], links: [], groups: [], rejected: [], addedTriangles: 0,
      addedProps: 0, addedSolids: 0, addedSoftBodies: 0 } };
}
const draft = (level: LevelPlan): MetricFacadePlan => buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings: [] });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Independent point inclusion, using edge normals rather than descriptor rectangle arithmetic. */
function contains(surface: MetricSurface, point: Vec3): boolean {
  if (Math.abs(dot(surface.normal, subtract(point, surface.vertices[0]))) > 1e-7) return false;
  return surface.vertices.every((vertex, index) => dot(surface.normal,
    cross(subtract(surface.vertices[(index + 1) % surface.vertices.length], vertex), subtract(point, vertex))) >= -1e-7);
}
function assertSealedPanes(plan: MetricFacadePlan): void {
  for (const aperture of plan.apertures) {
    for (const u of [0.17, 0.47, 0.83]) for (const v of [0.19, 0.53, 0.81]) {
      const [a, b, , d] = aperture.back;
      const point = { x: a.x + (b.x - a.x) * u + (d.x - a.x) * v,
        y: a.y + (b.y - a.y) * u + (d.y - a.y) * v,
        z: a.z + (b.z - a.z) * u + (d.z - a.z) * v };
      const hits = plan.surfaces.filter(surface => surface.pieceKey === aperture.pieceKey
        && ['closed-pane', 'closed-entry', 'closed-service', 'service-slat', 'pane-frame'].includes(surface.kind)
        && contains(surface, point));
      assert.equal(hits.length, 1, `Opaque pane coverage ${aperture.id} at ${u}/${v}`);
    }
  }
}
/** Independent inward ray against actual polygon planes. Descriptors choose
 * the expected owning depth only; they do not provide coverage. Missing walls,
 * doubled walls and an outer wall left behind a recessed zone all fail. */
function assertWallCoverage(plan: MetricFacadePlan): void {
  for (const face of plan.faces) {
    const outward = { x: Math.sin(face.yaw), y: 0, z: Math.cos(face.yaw) };
    const walls = plan.surfaces.filter(surface => surface.pieceKey === face.pieceKey && surface.kind === 'wall'
      && dot(surface.normal, outward) > 1 - 1e-7);
    const zones = (plan.architecture ?? []).filter(record => record.pieceKey === face.pieceKey
      && record.kind !== 'roof-module' && Math.abs(record.yaw - face.yaw) < 1e-7
      && Math.hypot(record.origin.x - face.origin.x, record.origin.z - face.origin.z) < 1e-7);
    for (let column = 0; column < 73; column++) for (let row = 0; row < 37; row++) {
      const x = -face.width / 2 + face.width * (column + 0.317) / 73;
      const y = face.height * (row + 0.613) / 37;
      const point = { x: face.origin.x + Math.cos(face.yaw) * x, y: face.origin.y + y,
        z: face.origin.z - Math.sin(face.yaw) * x };
      const within = (r: {left:number;right:number;bottom:number;top:number}) => x > r.left && x < r.right && y > r.bottom && y < r.top;
      const aperture = face.apertures.find(within), masked = face.acceptedMaskRects.some(within);
      const zone = zones.find(record => within(record.rect)), expectedDepth = zone ? -zone.recess : 0;
      const hits = walls.flatMap(surface => {
        const denominator = dot(surface.normal, outward); if (Math.abs(denominator) < 1e-9) return [];
        const depth = dot(surface.normal, subtract(surface.vertices[0], point)) / denominator;
        const hit = { x: point.x + outward.x * depth, y: point.y, z: point.z + outward.z * depth };
        return contains(surface, hit) ? [depth] : [];
      });
      assert.equal(hits.length, aperture || masked ? 0 : 1, 'Single owned wall coverage');
      if (!aperture && !masked) assert.ok(Math.abs(hits[0] - expectedDepth) < 1e-7, 'Actual wall owns the zone depth');
    }
  }
}
/** Independent convex intersection with all SIX expanded mask planes.
 * A centroid outside the mask does not excuse a triangle crossing it. */
function assertMaskEmpty(plan: MetricFacadePlan, opening: FacadeOpening): void {
  const c = Math.cos(opening.yaw), sn = Math.sin(opening.yaw);
  const toLocal = (p: Vec3): Vec3 => ({ x: c * (p.x - opening.position.x) - sn * (p.z - opening.position.z),
    y: p.y - opening.position.y, z: sn * (p.x - opening.position.x) + c * (p.z - opening.position.z) });
  for (const surface of plan.surfaces) {
    let polygon = surface.vertices.map(toLocal);
    for (const [axis, limit, low] of [
      ['x', -opening.faceWidth / 2 - 0.02, true], ['x', opening.faceWidth / 2 + 0.02, false],
      ['z', -(opening.depth ?? 0.8), true], ['z', 0.8, false], ['y', -0.05, true], ['y', opening.height!, false]
    ] as const) {
      const next: Vec3[] = [];
      for (let index = 0; index < polygon.length; index++) {
        const a = polygon[index], b = polygon[(index + 1) % polygon.length];
        const da = a[axis] - limit, db = b[axis] - limit, ia = low ? da >= 0 : da <= 0, ib = low ? db >= 0 : db <= 0;
        if (ia) next.push(a);
        if (ia !== ib) { const t = da / (da - db); next.push({ x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }); }
      }
      polygon = next;
    }
    let area = 0;
    for (let index = 1; index < polygon.length - 1; index++) {
      const n = cross(subtract(polygon[index], polygon[0]), subtract(polygon[index + 1], polygon[0]));
      area += Math.hypot(n.x, n.y, n.z) / 2;
    }
    assert.ok(area <= 1e-8, 'Surface covers accepted interior');
  }
}

test('selection and original physical envelope are guarded; whole source remains unchanged and deterministic', () => {
  const level = fixture(), before = JSON.stringify(level), first = draft(level);
  assert.equal(JSON.stringify(level), before); assert.deepEqual(draft(level), first);
  assert.throws(() => buildMetricFacadePlan(level, { propIndices: [], protectedOpenings: [] }), /explicit/);
  assert.throws(() => buildMetricFacadePlan(level, { propIndices: [0, 0], protectedOpenings: [] }), /unique/);
  const bad = { ...level, solids: [{ ...level.solids![0], halfExtents: { ...level.solids![0].halfExtents, x: 20 } }] };
  assert.throws(() => draft(bad), /exact original/);
  assert.throws(() => buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings: [], batchMetres: Infinity }), /finite/);
});

test('long residential wall gains repeated room openings on both floors, without stretching a door or pane', () => {
  const long = draft(fixture()), short = draft(fixture('residential', 10));
  const front = long.faces.find(face => face.side === 0)!;
  assert.equal(long.apertures.filter(a => a.kind === 'entry').length, 1);
  const entry = long.apertures.find(a => a.kind === 'entry')!;
  assert.ok(Math.abs(entry.top - entry.bottom - 2.12) < 1e-8);
  assert.ok(Math.abs(entry.right - entry.left - 1.08) < 1e-8);
  assert.ok(front.apertures.filter(a => a.kind === 'window').length >= 24);
  assert.ok(long.apertures.filter(a => a.kind === 'window').length > short.apertures.filter(a => a.kind === 'window').length * 2);
  for (const aperture of long.apertures.filter(a => a.kind === 'window' && (a.wallDepth ?? 0) === 0)) {
    assert.ok(aperture.right - aperture.left <= 1.25000001);
    assert.ok(aperture.top - aperture.bottom <= 1.40000001);
    assert.ok(aperture.recess > 0.10 && aperture.recess < 0.25);
  }
  const upperX = front.apertures.filter(a => a.floor === 1).map(a => (a.left + a.right) / 2);
  for (const aperture of front.apertures.filter(a => a.kind === 'window' && a.floor === 0 && (a.wallDepth ?? 0) === 0))
    assert.ok(upperX.some(x => Math.abs(x - (aperture.left + aperture.right) / 2) < 1e-8));
});

test('industrial service shutters and clerestory cadence read from the building without a van or worker', () => {
  const plan = draft(fixture('industrial'));
  assert.ok(plan.apertures.some(a => a.kind === 'service' && a.right - a.left >= 3.1 && a.top - a.bottom >= 2.9));
  assert.ok(plan.apertures.some(a => a.kind === 'window' && a.floor >= 1 && a.top - a.bottom <= 1.10000001));
  assert.ok(plan.surfaces.some(surface => surface.kind === 'service-slat'));
  assert.equal(plan.apertures.filter(a => a.kind === 'entry').length, 1);
});

test('complete outer-wall coverage is single-owner, with no wall behind a room opening', () => {
  const plan = draft(fixture());
  assertWallCoverage(plan);
  assert.throws(() => assertWallCoverage({ ...plan, surfaces: plan.surfaces.filter(s => s.kind !== 'wall') }),
    /Single owned wall coverage/, 'Known missing wall control must fail');
  const seam = plan.architecture!.find(record => record.kind === 'wall-seam')!;
  assert.ok(seam, 'A real recess supplies an independent zone-depth negative');
  const c = Math.cos(seam.yaw), sn = Math.sin(seam.yaw), depth = (p: Vec3) => sn * (p.x - seam.origin.x) + c * (p.z - seam.origin.z);
  const missingBack = plan.surfaces.filter(surface => !(surface.kind === 'wall' && surface.pieceKey === seam.pieceKey
    && surface.vertices.every(p => Math.abs(depth(p) + seam.recess) < 1e-7)));
  assert.throws(() => assertWallCoverage({ ...plan, surfaces: missingBack }), /Single owned wall coverage/,
    'Known missing recessed wall cannot be hidden by an outer-plane-only check');
  const r = seam.rect, point = (x: number, y: number): Vec3 => ({ x: seam.origin.x + c * x, y: seam.origin.y + y, z: seam.origin.z - sn * x });
  const retainedOuter: MetricSurface = { propIndex: seam.propIndex, pieceKey: seam.pieceKey, kind: 'wall', finish: 'masonry', batchKey: 'masonry/0,0',
    normal: { x: sn, y: 0, z: c }, vertices: [point(r.left, r.bottom), point(r.right, r.bottom), point(r.right, r.top), point(r.left, r.top)] };
  assert.throws(() => assertWallCoverage({ ...plan, surfaces: [...plan.surfaces, retainedOuter] }), /Single owned wall coverage/,
    'Known outer wall left in front of an inset recess must fail ownership');
  assertSealedPanes(plan);
  const bad = { ...plan, surfaces: plan.surfaces.filter(surface => surface.kind !== 'closed-pane') };
  assert.throws(() => assertSealedPanes(bad), /Opaque pane coverage/, 'Known missing-glass control must fail');
});

test('accepted opening volumes remain empty on every new surface, including yawed masks and short cap intersections', () => {
  const level = fixture(), opening = { position: { x: 0, y: 0, z: 6 }, yaw: 0.03, faceWidth: 7.1, height: 3.4, depth: 0.8 };
  const before = JSON.stringify(level);
  const plan = buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings: [opening] });
  assert.equal(JSON.stringify(level), before);
  assertMaskEmpty(plan, opening); assertWallCoverage(plan); assertSealedPanes(plan);
  const badSurface: MetricSurface = { propIndex: 0, pieceKey: '0/0', kind: 'wall', finish: 'masonry',
    batchKey: 'masonry/0,0', normal: { x: 0, y: 0, z: 1 }, vertices: [
      { x: -1, y: 0.5, z: 6 }, { x: 1, y: 0.5, z: 6 }, { x: 1, y: 2.5, z: 6 }, { x: -1, y: 2.5, z: 6 }] };
  assert.throws(() => assertMaskEmpty({ ...plan, surfaces: [...plan.surfaces, badSurface] }, opening),
    /Surface covers accepted interior/, 'Known covered-window plane must fail the actual mask coverage predicate');
  assert.equal(inStreetFacadeOpening(opening, { x: 0, y: 1.5, z: 6 }), true, 'Known covered mask point must be rejected');
});

test('roof preserves original envelope and source extraction is exactly once', () => {
  const plan = draft(fixture()), roof = plan.replacements.find(record => record.replacement === 'residential-roof')!;
  const surfaces = plan.surfaces.filter(surface => surface.pieceKey === roof.key);
  assert.equal(surfaces.some(surface => surface.kind === 'roof-joint'), false, 'Decorative roof stripe is replaced by real modular sections');
  assert.ok((plan.architecture ?? []).filter(record => record.pieceKey === roof.key && record.kind === 'roof-module').length > 1, 'Long source has multiple real roof sections');
  const source = roof.source;
  for (const vertex of surfaces.flatMap(surface => surface.vertices)) {
    const x = vertex.x * Math.cos(source.yaw) - vertex.z * Math.sin(source.yaw);
    const z = vertex.x * Math.sin(source.yaw) + vertex.z * Math.cos(source.yaw);
    assert.ok(Math.abs(x) <= source.sx / 2 + 1e-7 && Math.abs(z) <= source.sz / 2 + 1e-7);
    assert.ok(vertex.y >= source.y - 1e-7 && vertex.y <= source.y + source.sy + 1e-7);
  }
  const ledger = metricExtractionLedger(plan);
  assert.throws(() => ledger.assertComplete(), /expected records/);
  for (const record of plan.replacements) assert.equal(ledger.consume(record.propIndex, record.pieceIndex, record.source), true);
  ledger.assertComplete();
  assert.throws(() => ledger.consume(roof.propIndex, roof.pieceIndex, roof.source), /twice/);
  const changed = metricExtractionLedger(plan);
  assert.throws(() => changed.consume(roof.propIndex, roof.pieceIndex, { ...roof.source, sx: roof.source.sx + 0.1 }), /drifted/);
});

test('actual polygons stop at chunk bounds, allocated prices are exact, and only selected roof hulls cast near/static far', () => {
  for (const look of ['commercial', 'residential'] as const) {
    const level = fixture(look, 80), plan = draft(level), expected = metricFacadeCost(plan);
    const roofKeys = new Set(plan.replacements.filter(record => record.replacement === 'residential-roof').map(record => record.key));
    const roofSurfaces = plan.surfaces.filter(surface => roofKeys.has(surface.pieceKey));
    const roofBatches = new Set(roofSurfaces.map(surface => surface.batchKey));
    for (const surface of plan.surfaces) {
      assert.equal(surface.roofCaster, roofKeys.has(surface.pieceKey), 'Only selected original roof records own casting');
      for (const axis of ['x', 'z'] as const)
        assert.ok(Math.max(...surface.vertices.map(p => p[axis])) - Math.min(...surface.vertices.map(p => p[axis])) <= plan.batchMetres + 1e-7);
    }
    assert.equal(roofKeys.size > 0, look === 'residential');
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const appearance = { materials: { masonry: material, frame: material, roofEdge: material, entry: material, glazing: material },
      colourFor: () => [0.3, 0.4, 0.5] as const };
    const view = createMetricFacade(level, plan, appearance);
    let byteCount = 0, triangleCount = 0, shadowTriangles = 0, shadowDraws = 0, disposals = 0, borrowedDisposals = 0;
    material.addEventListener('dispose', () => borrowedDisposals++);
    const ownership: { key: string; cast: boolean; far: boolean }[] = [];
    for (const object of view.group.children) {
      assert.ok(object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh));
      const key = object.name.replace('metric-facade/', ''), roofCaster = roofBatches.has(key);
      assert.equal(object.castShadow, roofCaster); assert.equal(object.layers.isEnabled(ULTRA_STATIC_LAYER), roofCaster);
      ownership.push({ key, cast: object.castShadow, far: object.layers.isEnabled(ULTRA_STATIC_LAYER) });
      assert.equal(object.geometry.hasAttribute('uv'), false);
      const triangles = object.geometry.getAttribute('position').count / 3;
      triangleCount += triangles;
      if (object.castShadow) { shadowDraws++; shadowTriangles += triangles; }
      byteCount += (Object.values(object.geometry.attributes) as THREE.BufferAttribute[]).reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
      object.geometry.addEventListener('dispose', () => disposals++);
    }
    const requireRoofOwnership = (records: typeof ownership): void => {
      assert.equal(records.length, expected.drawCalls);
      for (const record of records) {
        assert.equal(record.cast, roofBatches.has(record.key), 'Metric roof near owner differs');
        assert.equal(record.far, roofBatches.has(record.key), 'Metric roof static-far owner differs');
      }
    };
    requireRoofOwnership(ownership);
    if (roofBatches.size) {
      assert.throws(() => requireRoofOwnership(ownership.map(record => ({ ...record, cast: false, far: false }))), /Metric roof near owner differs/,
        'The archived all-false metric caster state must fail actual selected roof ownership');
      assert.throws(() => requireRoofOwnership(ownership.map(record => ({ ...record, far: false }))), /Metric roof static-far owner differs/);
    }
    assert.equal(triangleCount, expected.colourTriangles); assert.equal(byteCount, expected.geometryBytes);
    assert.equal(shadowDraws, roofBatches.size);
    assert.equal(shadowTriangles, roofSurfaces.reduce((sum, surface) => sum + surface.vertices.length - 2, 0));
    assert.deepEqual(metricFacadeShadowCost(plan), { shadowDrawCalls: shadowDraws, shadowTriangles });
    assert.equal(view.report().shadowDrawCalls, shadowDraws); assert.equal(view.report().shadowTriangles, shadowTriangles);
    assert.equal(view.report().drawCalls, expected.drawCalls); assert.equal(view.report().geometryOwners, expected.geometryOwners);
    view.dispose(); view.dispose(); assert.equal(disposals, expected.geometryOwners); assert.equal(borrowedDisposals, 0);
    assert.equal(view.report().geometryBytes, 0); assert.equal(view.report().drawCalls, 0);
    assert.equal(view.report().shadowDrawCalls, 0); assert.equal(view.report().shadowTriangles, 0);
    material.dispose();
  }
});


test('industrial final surfaces, apertures and extraction identities equal the frozen R19 kit', () => {
  for (const width of [10, 42, 80]) {
    const level = fixture('industrial', width), before = JSON.stringify(level), current = draft(level);
    const legacy = legacyFacadePlan(level, { propIndices: [0], protectedOpenings: [] });
    assert.equal(JSON.stringify(level), before);
    assert.ok(current.surfaces.every(surface => surface.roofCaster === false), 'Industrial body geometry gains no roof caster');
    assert.deepEqual(current.surfaces.map(({ roofCaster: _roofCaster, ...surface }) => surface), legacy.surfaces,
      'Only explicit non-casting owner metadata is new; industrial final polygons are unchanged');
    assert.deepEqual(current.apertures.map(({ wallDepth: _wallDepth, ...rest }) => rest), legacy.apertures,
      'Industrial service/entry metric geometry is unchanged');
    assert.deepEqual(current.replacements, legacy.replacements, 'Same source piece identities');
    assert.deepEqual(metricFacadeCost(current), metricFacadeCost(legacy));
  }
});

// RL-4 (2026-10-03): a coarser draw-batch pitch over the accepted 32 m split
// regroups the same polygons, so every polygon and triangle stays.
test('256 m draw batches regroup the exact 32 m polygons, keep casters apart and place every vertex', () => {
  const level = fixture('residential', 300);
  const chunked = buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings: [] });
  const grouped = buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings: [],
    batchMetres: 256, chunkMetres: ENVIRONMENT_BATCHING.metricFacadeChunkMetres });
  assert.equal(chunked.batchMetres, ENVIRONMENT_BATCHING.metricFacadeChunkMetres, 'unchanged default pitch');
  assert.equal(grouped.batchMetres, 256);
  assert.equal(grouped.chunkMetres, ENVIRONMENT_BATCHING.metricFacadeChunkMetres);
  assert.deepEqual(grouped.surfaces.map(surface => [surface.propIndex, surface.pieceKey, surface.kind, surface.finish, surface.vertices, surface.normal, surface.roofCaster]),
    chunked.surfaces.map(surface => [surface.propIndex, surface.pieceKey, surface.kind, surface.finish, surface.vertices, surface.normal, surface.roofCaster]),
    'the same split polygons in the same order');
  const before = metricFacadeCost(chunked), after = metricFacadeCost(grouped);
  assert.equal(after.colourTriangles, before.colourTriangles); assert.equal(after.geometryBytes, before.geometryBytes);
  assert.ok(after.drawCalls < before.drawCalls, `${after.drawCalls} batches for ${before.drawCalls}`);
  assert.equal(metricFacadeShadowCost(grouped).shadowTriangles, metricFacadeShadowCost(chunked).shadowTriangles);
  for (const surface of grouped.surfaces) {
    const finish = surface.batchKey.split('/')[0];
    assert.equal(surface.batchKey.endsWith('/roof-caster'), surface.roofCaster === true, 'casters stay in their own batches');
    assert.equal(finish, surface.finish);
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const appearance = { materials: { masonry: material, frame: material, roofEdge: material, entry: material, glazing: material },
    colourFor: () => [0.3, 0.4, 0.5] as const };
  const view = createMetricFacade(level, grouped, appearance);
  try {
    assert.equal(view.group.children.length, after.drawCalls);
    // Every allocated vertex, offset back to the world, is a descriptor vertex
    // inside its own 256 m cell: ±128 m keeps Float32 well under a millimetre.
    for (const object of view.group.children as THREE.Mesh[]) {
      const position = object.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        assert.ok(Math.abs(position.getX(i)) <= grouped.batchMetres / 2 + 1e-3 && Math.abs(position.getZ(i)) <= grouped.batchMetres / 2 + 1e-3);
      }
    }
    const world = (view.group.children as THREE.Mesh[]).flatMap(object => {
      const position = object.geometry.getAttribute('position');
      return Array.from({ length: position.count }, (_, i) => [position.getX(i) + object.position.x, position.getY(i), position.getZ(i) + object.position.z]);
    });
    const expected = grouped.surfaces.flatMap(surface => surface.vertices.slice(1, -1).flatMap((_, k) =>
      [surface.vertices[0], surface.vertices[k + 1], surface.vertices[k + 2]].map(v => [v.x, v.y, v.z])));
    assert.equal(world.length, expected.length);
    const sort = (list: number[][]): number[][] => list.map(v => v.map(n => Math.round(n * 1e3) / 1e3 + 0)).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    assert.deepEqual(sort(world), sort(expected));
  } finally { view.dispose(); material.dispose(); }
  assert.throws(() => buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings: [], batchMetres: 100, chunkMetres: 32 }), /whole batch cells/);
});

// 2026-10-04, owner decision: 256 m batches over the accepted 32 m polygon
// split. Same polygons and triangles, far fewer facade draws; batch origins
// move, so isolated edge pixels may round differently at High and Ultra.
test('the prepared default facades draw 256 m batches of the accepted 32 m split', () => {
  assert.equal(ENVIRONMENT_BATCHING.metricFacadeBatchMetres, 256);
  assert.equal(ENVIRONMENT_BATCHING.metricFacadeChunkMetres, 32);
  const prepared = prepareMetricFacades(fixture('residential', 80), { propIndices: [0] });
  try {
    assert.equal(prepared.descriptors!.batchMetres, ENVIRONMENT_BATCHING.metricFacadeBatchMetres);
    assert.equal(prepared.descriptors!.chunkMetres, ENVIRONMENT_BATCHING.metricFacadeChunkMetres);
    assert.equal(prepared.price!.drawCalls, metricFacadeCost(prepared.descriptors!).drawCalls);
  } finally { prepared.dispose(); }
});
