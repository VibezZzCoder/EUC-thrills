/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** R21 SOURCE-ONLY / UNRUN. Actual modular-shell, portal and emission controls.
 * Pixel/GL/caster/owner acceptance remains with the root coordinator. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import type { Vec3 } from '../simulation/world.ts';
import { buildMetricFacadePlan, metricFacadeCost, metricSubtractOpening,
  type MetricFacadePlan } from './metricFacadePlan.ts';
import { createMetricFacade } from './metricFacade.ts';
import type { FacadeOpening } from './streetFacadeOpenings.ts';

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const at = (o: Vec3, yaw: number, x: number, y: number, z: number): Vec3 => ({
  x: o.x + Math.cos(yaw) * x + Math.sin(yaw) * z, y: o.y + y,
  z: o.z - Math.sin(yaw) * x + Math.cos(yaw) * z });
const local = (o: Vec3, yaw: number, p: Vec3): Vec3 => ({
  x: Math.cos(yaw) * (p.x - o.x) - Math.sin(yaw) * (p.z - o.z), y: p.y - o.y,
  z: Math.sin(yaw) * (p.x - o.x) + Math.cos(yaw) * (p.z - o.z) });
function contains(polygon: readonly Vec3[], point: Vec3): boolean {
  const n = cross(sub(polygon[1], polygon[0]), sub(polygon[2], polygon[0])), length = Math.hypot(n.x, n.y, n.z);
  if (Math.abs(dot(n, sub(point, polygon[0]))) > 1e-7 * length) return false;
  return polygon.every((a, index) => dot(n, cross(sub(polygon[(index + 1) % polygon.length], a), sub(point, a))) >= -1e-7 * length);
}
function fixture(look: 'residential' | 'commercial' | 'industrial' = 'residential',
  sx = 42, sz = 12, yaw = 0, entryX = 0, position: Vec3 = { x: 7, y: 0.2, z: -11 }): LevelPlan {
  const prop: Prop = { kind: 'building', look, position, rotationY: yaw,
    scale: 1, size: { x: sx, y: look === 'industrial' ? 11.1 : 7, z: sz } };
  return { id: 'architecture-source-fixture', props: [prop], solids: [{ centre: { ...prop.position, y: prop.position.y + prop.size!.y / 2 },
    halfExtents: { x: sx / 2, y: prop.size!.y / 2, z: sz / 2 }, rotationY: yaw, surface: 'pavement' }],
    segments: [], checkpoints: [], spawn: { position: { x: -70, y: 0, z: -70 }, headingY: 0 },
    surround: { height: 0, surface: 'grass' }, heightfield: { originX: -100, originZ: -100,
      spacing: 2.5, columns: 2, rows: 2, heights: [0, 0, 0, 0], surfaces: ['grass'] },
    districtAdjacency: { revision: 'district-v1', sourceWorldId: 'architecture-source-fixture', physicalWorldId: 'architecture-source-fixture',
      frontages: [{ id: 'original-served-entry', propIndex: 0, district: look, role: 'frontage-lawn', streetSegmentId: 'original-road',
        position: at(prop.position, yaw, entryX, 0, sz / 2), yaw, width: sx, reach: 8, retainedOpening: false, patchIds: [] }],
      links: [], groups: [], rejected: [], addedTriangles: 0, addedProps: 0, addedSolids: 0, addedSoftBodies: 0 } };
}
const draft = (level: LevelPlan, batchMetres = 32, protectedOpenings: readonly FacadeOpening[] = []): MetricFacadePlan =>
  buildMetricFacadePlan(level, { propIndices: [0], protectedOpenings, batchMetres });
function volume(polygons: readonly (readonly Vec3[])[]): number {
  let result = 0;
  for (const polygon of polygons) for (let index = 1; index < polygon.length - 1; index++)
    result += dot(polygon[0], cross(polygon[index], polygon[index + 1])) / 6;
  return result;
}
function polygonArea(polygon: readonly Vec3[]): number {
  let result = 0;
  for (let index = 1; index < polygon.length - 1; index++) {
    const n = cross(sub(polygon[index], polygon[0]), sub(polygon[index + 1], polygon[0]));
    result += Math.hypot(n.x, n.y, n.z) / 2;
  }
  return result;
}
/** Split every collinear boundary at ALL emitted vertices. Chunk and frame
 * T junctions are accepted; missing faces, internal duplicate caps and reversed
 * winding fail. Rounded welding only matches the actual 1e-7 geometry contract. */
function assertClosed(polygons: readonly (readonly Vec3[])[], expectedVolume: number): void {
  const key = (p: Vec3): string => [p.x, p.y, p.z].map(value => Math.round(value * 1e7)).join(',');
  const vertices = [...new Map(polygons.flat().map(p => [key(p), p])).values()];
  const directed = new Map<string, number>();
  for (const polygon of polygons) for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length], d = sub(b, a), length = dot(d, d);
    assert.ok(length > 1e-14, 'No zero boundary edge');
    const cuts = vertices.map(p => ({ p, t: dot(sub(p, a), d) / length }))
      .filter(({ p, t }) => t >= -1e-8 && t <= 1 + 1e-8
        && Math.hypot(p.x - a.x - t * d.x, p.y - a.y - t * d.y, p.z - a.z - t * d.z) < 1e-7)
      .sort((first, last) => first.t - last.t);
    for (let cut = 1; cut < cuts.length; cut++) {
      const first = key(cuts[cut - 1].p), last = key(cuts[cut].p); if (first === last) continue;
      const edge = `${first}>${last}`; directed.set(edge, (directed.get(edge) ?? 0) + 1);
    }
  }
  for (const [edge, count] of directed) {
    const [a, b] = edge.split('>'); assert.equal(count, 1, 'Every directed edge is owned once');
    assert.equal(directed.get(`${b}>${a}`), 1, 'Every directed edge has its opposite twin');
  }
  assert.ok(Math.abs(volume(polygons) - expectedVolume) < Math.max(1e-6, Math.abs(expectedVolume) * 1e-9),
    'Sealed shell has the intended signed metric volume');
}

test('actual roof modules seal with outward winding, keep section volume and fit the source triangular prism', () => {
  for (const [sx, sz, yaw, entryX] of [[42, 12, 0, 0], [42, 12, 0.71, 7.2], [12, 42, -0.37, 0], [10, 12, 1.11, -2]] as const) {
    // A huge chunk pitch still cuts at world zero. Keep this exact
    // preclip triangle-count fixture wholly inside ONE positive chunk.
    const level = fixture('residential', sx, sz, yaw, entryX, { x: 107, y: 0.2, z: 111 }),
      before = JSON.stringify(level), descriptor = draft(level, 1e6);
    assert.equal(JSON.stringify(level), before, 'Complete source plan stays unchanged');
    const roof = descriptor.replacements.find(item => item.replacement === 'residential-roof')!; assert.ok(roof);
    const prop = level.props![0], origin = at(prop.position, prop.rotationY, roof.source.x, roof.source.y, roof.source.z);
    const roofYaw = prop.rotationY + roof.source.yaw;
    const modules = descriptor.architecture!.filter(item => item.pieceKey === roof.key && item.kind === 'roof-module');
    assert.ok(modules.length >= 1); const ordered = [...modules].sort((a, b) => a.rect.left - b.rect.left);
    assert.ok(Math.abs(ordered[0].rect.left + roof.source.sz / 2) < 1e-7);
    assert.ok(Math.abs(ordered.at(-1)!.rect.right - roof.source.sz / 2) < 1e-7);
    for (let index = 1; index < ordered.length; index++) assert.ok(Math.abs(ordered[index - 1].rect.right - ordered[index].rect.left) < 1e-7);
    assert.ok(ordered.every(item => item.rect.right > item.rect.left && item.rect.top > 0 && item.rect.top <= roof.source.sy));
    // Deliberate R21 visual-spec amendment: source peak remains the strict
    // prism upper bound; every module, including served/single, is domestic.
    assert.ok(ordered.every((item, index) => item.rect.top <= 2.55 + (index % 2) * .35),
      'No original-peak exception may raise a domestic section');
    const surfaces = descriptor.surfaces.filter(item => item.pieceKey === roof.key), polygons = surfaces.map(item => item.vertices);
    assert.equal(new Set(surfaces.map(item => item.batchKey)).size, 1, 'Preclip count fixture has exactly one roof finish/chunk');
    assert.ok(polygons.flat().every(p => p.x > 0 && p.x < 1e6 && p.z > 0 && p.z < 1e6),
      'No zero or other world-chunk plane intersects the exact-count fixture');
    assert.equal(surfaces.some(item => item.kind === 'roof-joint'), false);
    for (const p of polygons.flat()) {
      const q = local(origin, roofYaw, p);
      assert.ok(Math.abs(q.x) <= roof.source.sx / 2 + 1e-7 && Math.abs(q.z) <= roof.source.sz / 2 + 1e-7);
      assert.ok(q.y >= -1e-7 && q.y <= roof.source.sy * (1 - Math.abs(q.x) / (roof.source.sx / 2)) + 1e-7,
        'Vertex is inside the ORIGINAL triangular roof prism');
    }
    for (const section of ordered) for (const fraction of [-0.37, 0.31]) {
      const x = roof.source.sx * fraction, z = (section.rect.left + section.rect.right) / 2;
      const point = at(origin, roofYaw, x, section.rect.top * (1 - Math.abs(x) / (roof.source.sx / 2)), z);
      assert.equal(surfaces.filter(surface => surface.kind === 'roof' && contains(surface.vertices, point)).length, 1,
        'Actual emitted slopes own each section rise and eave span');
    }
    const changes = ordered.slice(1).filter((item, index) => item.rect.top !== ordered[index].rect.top).length;
    assert.equal(surfaces.reduce((sum, item) => sum + item.vertices.length - 2, 0), 6 * ordered.length + 2 * changes + 2,
      'Only external step wedges and outer end caps exist before chunk/mask splitting');
    const expectedVolume = ordered.reduce((sum, item) => sum + roof.source.sx * item.rect.top * (item.rect.right - item.rect.left) / 2, 0);
    assertClosed(polygons, expectedVolume);
    assert.throws(() => assertClosed(polygons.slice(1), expectedVolume), /opposite twin|owned once|signed metric volume/,
      'Known missing slope must fail roof closure');
    assert.throws(() => assertClosed([polygons[0], ...polygons], expectedVolume), /owned once/, 'Known duplicate slope must fail ownership');
    assert.throws(() => assertClosed([polygons[0].slice().reverse(), ...polygons.slice(1)], expectedVolume), /owned once|opposite twin/,
      'Known reversed slope must fail winding');
    assert.throws(() => assertClosed(polygons.map(polygon => polygon.slice().reverse()), expectedVolume), /signed metric volume/,
      'A consistently inward shell passes edge parity and must still fail signed volume');
  }
});

/** A source record can fit the prism and still make one immense centre.
 * Independently test all emitted slope vertices as well as module metadata. */
test('actual owner166 dimensions and large/single domestic roofs refuse the old elevated-centre exception', () => {
  const inputs = [
    // Exact retained R21 generated source owner166. This is a fresh native
    // fixture using that source shape/transform, not a mutation of its world.
    { sx: 35, sz: 13.089420333039016, sy: 6.060148198157549, yaw: 2.619487390431898,
      position: { x: 592.7562524633375, y: 0, z: 204.10320744369167 } },
    { sx: 28, sz: 28, sy: 7, yaw: .31, position: { x: 107, y: .2, z: 111 } },
    { sx: 8, sz: 8, sy: 7, yaw: -.49, position: { x: 107, y: .2, z: 111 } },
    { sx: 42, sz: 4, sy: 7, yaw: .61, position: { x: 107, y: .2, z: 111 } },
  ];
  const bounded = (rises: readonly number[], sourcePeak: number): boolean => rises.length > 0
    && rises.every((rise, index) => Number.isFinite(rise) && rise > 0 && rise <= sourcePeak
      && rise <= 2.55 + (index % 2) * .35);
  for (const input of inputs) {
    const level = fixture('residential', input.sx, input.sz, input.yaw, 0, input.position), prop = level.props![0];
    prop.size!.y = input.sy;
    level.solids![0].halfExtents.y = input.sy / 2;
    level.solids![0].centre.y = input.position.y + input.sy / 2;
    const before = JSON.stringify(level), descriptor = draft(level, 1e6);
    assert.equal(JSON.stringify(level), before, 'Original fixture body/plan remains byte-exact through render drafting');
    const roof = descriptor.replacements.find(item => item.replacement === 'residential-roof')!;
    const origin = at(prop.position, prop.rotationY, roof.source.x, roof.source.y, roof.source.z), yaw = prop.rotationY + roof.source.yaw;
    const ordered = descriptor.architecture!.filter(item => item.pieceKey === roof.key && item.kind === 'roof-module')
      .sort((a, b) => a.rect.left - b.rect.left);
    const rises = ordered.map(item => item.rect.top);
    assert.ok(bounded(rises, roof.source.sy));
    assert.equal(ordered.length === 1, Math.max(input.sx, input.sz) < 12);
    const surfaces = descriptor.surfaces.filter(item => item.pieceKey === roof.key), polygons = surfaces.map(item => item.vertices);
    for (const p of polygons.flat()) {
      const q = local(origin, yaw, p);
      assert.ok(q.y <= 2.9 + 1e-7, 'ACTUAL emitted roof vertices obey the universal domestic ceiling');
      assert.ok(q.y >= -1e-7 && q.y <= roof.source.sy * (1 - Math.abs(q.x) / (roof.source.sx / 2)) + 1e-7,
        'Every vertex still lies in the unchanged source triangular prism');
    }
    const expectedVolume = ordered.reduce((sum, item) => sum + roof.source.sx * item.rect.top * (item.rect.right - item.rect.left) / 2, 0);
    assertClosed(polygons, expectedVolume);
    const raised = [...rises], primary = Math.floor(raised.length / 2); raised[primary] = roof.source.sy;
    if (roof.source.sy > 2.9) assert.equal(bounded(raised, roof.source.sy), false,
      'The former full-source-peak section fits the source prism but MUST fail domestic height');
    const oversized = [...rises]; oversized[0] = 2.900001;
    assert.equal(bounded(oversized, roof.source.sy), false, 'A roof section above its local domestic limit refuses');
    assert.equal(bounded([0], roof.source.sy), false); assert.equal(bounded([NaN], roof.source.sy), false);
  }
});

test('chunk and six-plane mask partitions conserve the actual roof polygons', () => {
  const level = fixture('residential', 42, 12, 0.61, 5), uncut = draft(level, 1e6);
  const roof = uncut.replacements.find(item => item.replacement === 'residential-roof')!;
  const prop = level.props![0], opening: FacadeOpening = { position: at(prop.position, prop.rotationY, 0, 5.8, 6),
    yaw: prop.rotationY + 0.11, faceWidth: 7.1, height: 5.4, depth: 3.4 };
  const rootPolygons = uncut.surfaces.filter(item => item.pieceKey === roof.key).map(item => item.vertices);
  const expected = rootPolygons.flatMap(polygon => metricSubtractOpening(polygon, opening));
  const masked = draft(level, 7, [opening]).surfaces.filter(item => item.pieceKey === roof.key).map(item => item.vertices);
  assert.ok(Math.abs(expected.reduce((sum, p) => sum + polygonArea(p), 0) - masked.reduce((sum, p) => sum + polygonArea(p), 0)) < 1e-6);
  assert.ok(Math.abs(volume(expected) - volume(masked)) < 1e-6, 'Chunk splitting conserves clipped section volume');
  const chunked = draft(level, 7).surfaces.filter(item => item.pieceKey === roof.key).map(item => item.vertices);
  assertClosed(chunked, volume(rootPolygons));
});

test('served portal replaces the owning wall plane and contains closed human entries, sidelights and transom', () => {
  for (const family of ['commercial', 'residential'] as const) {
    const level = fixture(family, 42, 12, 0.47, 5), before = JSON.stringify(level), descriptor = draft(level);
    const portal = descriptor.architecture!.find(item => item.kind === 'served-portal')!; assert.ok(portal);
    const face = descriptor.faces.find(item => item.pieceKey === portal.pieceKey && Math.abs(item.yaw - portal.yaw) < 1e-7)!;
    const aperture = face.apertures.find(item => item.kind === 'entry')!; assert.ok(aperture);
    assert.ok(Math.abs(aperture.right - aperture.left - 1.08) < 1e-8 && Math.abs(aperture.top - aperture.bottom - 2.12) < 1e-8);
    assert.equal(aperture.wallDepth, -portal.recess, 'The closed door belongs to the real inset back');
    assert.ok(Math.abs((aperture.left + aperture.right) / 2 - 5) < 1e-7, 'The actual source served entry anchors the portal');
    assert.ok(portal.rect.top >= aperture.top + 0.25 && portal.rect.right - portal.rect.left > aperture.right - aperture.left);
    assert.ok(face.apertures.some(item => item.kind === 'window' && item.bottom > aperture.top && item.wallDepth === -portal.recess), 'Transom clears door');
    if (family === 'commercial') {
      for (const side of [-1, 1]) assert.ok(face.apertures.some(item => item.kind === 'window' && item.wallDepth === -portal.recess
        && item.bottom < aperture.top && side * ((item.left + item.right) / 2 - 5) > 0.6), 'Both real sidelights exist');
      assert.ok(Math.abs(portal.rect.right - portal.rect.left - 3.3) < 1e-8);
    }
    for (const item of face.apertures.filter(item => item.wallDepth === -portal.recess)) {
      assert.ok(item.left > portal.rect.left && item.right < portal.rect.right && item.bottom >= portal.rect.bottom && item.top < portal.rect.top);
      for (const p of [...item.mouth, ...item.back]) {
        const q = local(face.origin, face.yaw, p);
        assert.ok(q.z <= 0 && q.z >= -portal.recess - item.recess - 1e-7, 'All portal detail is contained inside source body');
      }
    }
    const within = (p: Vec3): boolean => { const q = local(face.origin, face.yaw, p);
      return q.x >= portal.rect.left - 1e-7 && q.x <= portal.rect.right + 1e-7
        && q.y >= portal.rect.bottom - 1e-7 && q.y <= portal.rect.top + 1e-7 && q.z >= -portal.recess - 0.1800001 && q.z <= 1e-7; };
    const polygons = descriptor.surfaces.filter(item => item.pieceKey === portal.pieceKey
      && item.vertices.every(within) && ['wall', 'structural-return', 'reveal', 'closed-entry', 'closed-pane', 'pane-frame'].includes(item.kind))
      .map(item => item.vertices);
    const r = portal.rect, mouth = [at(face.origin, face.yaw, r.left, r.top, 0), at(face.origin, face.yaw, r.right, r.top, 0),
      at(face.origin, face.yaw, r.right, r.bottom, 0), at(face.origin, face.yaw, r.left, r.bottom, 0)];
    const own = face.apertures.filter(item => item.wallDepth === -portal.recess);
    const expected = -(r.right - r.left) * (r.top - r.bottom) * portal.recess
      - own.reduce((sum, item) => sum + (item.right - item.left) * (item.top - item.bottom) * item.recess, 0);
    assertClosed([mouth, ...polygons], expected);
    assert.equal(JSON.stringify(level), before, 'No physical hole, paving, rider or source-plan write');
  }
});

test('actual PNC buffers independently witness batch price and disposal across repeat builds and partial failure', () => {
  const level = fixture('commercial', 80, 12, 0.31, -7), before = JSON.stringify(level), descriptor = draft(level);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true }); let borrowedDisposals = 0;
  material.addEventListener('dispose', () => borrowedDisposals++);
  const materials = { masonry: material, frame: material, roofEdge: material, entry: material, glazing: material };
  const expected = metricFacadeCost(descriptor), ownedCounts: number[] = [];
  try {
    for (let repeat = 0; repeat < 3; repeat++) {
      const view = createMetricFacade(level, descriptor, { materials, colourFor: () => [0.3, 0.4, 0.5] });
      const geometryOwners = new Set<THREE.BufferGeometry>(); let triangles = 0, bytes = 0, disposals = 0;
      for (const child of view.group.children) {
        assert.ok(child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh));
        const mesh = child as THREE.Mesh, geometry = mesh.geometry;
        assert.equal(geometry.index, null); assert.deepEqual(Object.keys(geometry.attributes).sort(), ['color', 'normal', 'position']);
        assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, true); assert.equal(mesh.material, material);
        assert.equal(mesh.customDepthMaterial, undefined); assert.equal(mesh.customDistanceMaterial, undefined);
        assert.equal(geometryOwners.has(geometry), false, 'One buffer owner per nonempty finish/chunk'); geometryOwners.add(geometry);
        const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), colour = geometry.getAttribute('color');
        assert.equal(position.count, normal.count); assert.equal(position.count, colour.count);
        for (const attribute of [position, normal, colour]) {
          assert.ok(attribute.array instanceof Float32Array); assert.equal(attribute.itemSize, 3);
          assert.ok(Array.from(attribute.array).every(Number.isFinite)); bytes += attribute.array.byteLength;
        }
        triangles += position.count / 3; geometry.addEventListener('dispose', () => disposals++);
      }
      assert.equal(bytes, triangles * 108); assert.equal(bytes, expected.geometryBytes);
      assert.equal(triangles, expected.colourTriangles); assert.equal(geometryOwners.size, expected.geometryOwners);
      assert.equal(view.group.children.length, expected.drawCalls);
      assert.equal(view.report().shadowTriangles, 0); assert.equal(view.report().shadowDrawCalls, 0);
      ownedCounts.push(geometryOwners.size); view.dispose(); view.dispose();
      assert.equal(disposals, geometryOwners.size); assert.equal(view.group.children.length, 0);
      for (const field of ['drawCalls', 'colourTriangles', 'geometryBytes', 'geometryOwners', 'borrowedMaterials'] as const) assert.equal(view.report()[field], 0);
      assert.throws(() => view.descriptors, /Disposed metric facade/);
    }
    assert.equal(new Set(ownedCounts).size, 1, 'Identical repeated builds plateau by actual owner count');
    const firstKey = descriptor.surfaces[0].batchKey, firstBatchSurfaces = descriptor.surfaces.filter(item => item.batchKey === firstKey).length;
    const originalDispose = THREE.BufferGeometry.prototype.dispose, disposed = new Set<THREE.BufferGeometry>(); let visits = 0;
    THREE.BufferGeometry.prototype.dispose = function () { disposed.add(this); return originalDispose.call(this); };
    try {
      assert.throws(() => createMetricFacade(level, descriptor, { materials, colourFor: () => {
        if (++visits > firstBatchSurfaces) throw new Error('Known second-batch allocation failure'); return [0.3, 0.4, 0.5];
      } }), /Known second-batch allocation failure/);
      assert.equal(disposed.size, 1, 'The first allocated buffer owner releases on the next-batch failure');
    } finally { THREE.BufferGeometry.prototype.dispose = originalDispose; }
    assert.equal(borrowedDisposals, 0); assert.equal(JSON.stringify(level), before);
  } finally { material.dispose(); }
});
