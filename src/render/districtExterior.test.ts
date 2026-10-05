/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { createDistrictExterior, districtExteriorCoverGeometry, type DistrictExteriorAppearance } from './districtExterior.ts';
import type { LevelPlan, Prop, BoxCollider } from '../level/plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { LANDMARK_SIZES } from '../data/buildingLooks.ts';

function fixture(): LevelPlan {
  const building: Prop = { kind: 'building', look: 'residential', position: { x: 18, y: 0, z: 24 },
    rotationY: 0, scale: 1, size: { x: 12, y: 7, z: 16 } };
  const body: BoxCollider = { centre: { x: 18, y: 3.5, z: 24 }, halfExtents: { x: 6, y: 3.5, z: 8 },
    rotationY: 0, surface: 'pavement' };
  return { id: 'exterior-resource-control', props: [building], solids: [body], checkpoints: [],
    segments: [], spawn: { position: { x: -60, y: 0, z: -60 }, headingY: 0 }, surround: { height: 0, surface: 'grass' },
    heightfield: { originX: -80, originZ: -80, spacing: 1, columns: 161, rows: 161,
      heights: new Array<number>(161 * 161).fill(0), surfaces: new Array<SurfaceId>(160 * 160).fill('grass') } };
}
function appearance(): DistrictExteriorAppearance {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  return { materials: { masonry: material, frame: material, roofEdge: material, planting: material,
    entry: material, glazing: material },
    colourFor: () => [0.3, 0.4, 0.5] };
}

test('real batch triangles, vertex colours and richer draw counts agree with the report', () => {
  const supplied = appearance(), view = createDistrictExterior(fixture(), supplied);
  try {
    const ordinary = view.report();
    assert.ok(ordinary.buildings > 0 && ordinary.sharedParts > 0 && ordinary.richParts > 0);
    assert.ok(ordinary.drawCalls <= 5); assert.equal(ordinary.materialOwners, 0);
    assert.equal(ordinary.textureBytes, 0); assert.equal(ordinary.shadowDrawCalls, 0);
    let triangles = 0;
    for (const object of view.group.children) {
      assert.ok(object instanceof THREE.InstancedMesh);
      const geometry = object.geometry;
      assert.ok(geometry.hasAttribute('normal') && geometry.hasAttribute('color'));
      assert.equal(geometry.hasAttribute('uv'), false, 'borrowed appearances cannot sample an unfolded atlas');
      assert.equal(object.castShadow, false); assert.equal(object.material, supplied.materials[object.name.includes('/frame/') ? 'frame' : 'masonry']);
      if (object.visible) triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3 * object.count;
      assert.ok(object.instanceColor);
      assert.ok(Math.abs(object.instanceColor.getX(0) - 0.3) < 1e-6);
    }
    assert.equal(ordinary.colourTriangles, triangles);
    view.setDetail(true); const rich = view.report();
    assert.ok(rich.colourTriangles > ordinary.colourTriangles);
    assert.equal(rich.geometryBytes, ordinary.geometryBytes); assert.equal(rich.instanceBytes, ordinary.instanceBytes);
    view.setDetail(false); assert.deepEqual(view.report(), ordinary, 'tier demotion restores shared work without rebuilding source');
  } finally { view.dispose(); supplied.materials.masonry.dispose(); }
});

test('untagged coverage reports neutral source and lookout braces stay mounted on the rotated original shaft', () => {
  const base = fixture(), supplied = appearance(), legacy: Prop = { ...base.props![0], look: undefined };
  const neutral = createDistrictExterior({ ...base, props: [legacy] }, supplied);
  try {
    assert.equal(neutral.report().byLook.untagged, 1); assert.equal(neutral.report().byLook.commercial, undefined);
    assert.equal(neutral.sites[0].building, legacy); assert.ok(neutral.report().drawCalls <= 5);
  } finally { neutral.dispose(); }
  const yaw = Math.PI / 7, size = LANDMARK_SIZES.lookout;
  const lookout: Prop = { ...base.props![0], look: 'lookout', rotationY: yaw, size };
  const plan = { ...base, props: [lookout], solids: [{ ...base.solids![0], rotationY: yaw,
    centre: { ...lookout.position, y: size.y / 2 }, halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 } }] };
  const view = createDistrictExterior(plan, supplied);
  try {
    const parts = view.sites.flatMap(site => site.parts).filter(part => !part.rich && part.finish === 'frame');
    const mesh = view.group.children.find(object => object.name.includes('/shared/frame/box/')) as THREE.InstancedMesh;
    assert.ok(mesh); assert.equal(mesh.count, parts.length);
    const matrix = new THREE.Matrix4(), point = new THREE.Vector3(); let mounted = 0;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]; if (part.shape !== 'beam' || part.kind !== 'shaft-brace') continue;
      assert.ok(part.faceYaw !== undefined); mesh.getMatrixAt(index, matrix);
      const normal = new THREE.Vector3(Math.sin(part.faceYaw), 0, Math.cos(part.faceYaw));
      let outside = -Infinity;
      for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
        point.set(x, y, z).applyMatrix4(matrix);
        outside = Math.max(outside, normal.x * (point.x - lookout.position.x)
          + normal.z * (point.z - lookout.position.z) - size.x / 2);
        assert.ok(point.y >= -1e-5 && point.y <= size.y + 1e-5, 'brace stays within the actual shaft height');
      }
      assert.ok(outside > 0.001 && outside <= 0.00201, 'square beam section keeps only 2 mm original-face separation');
      mounted++;
    }
    assert.equal(mounted, 32);
    const report = view.report(); assert.ok(report.drawCalls <= 5); assert.equal(report.geometryOwners, 1);
    assert.equal(report.colourTriangles, report.sharedParts * 12, 'boxes and wall braces share the same actual 12-triangle owner');
    view.setDetail(true);
    assert.equal(view.report().instanceBytes, report.instanceBytes); assert.equal(view.report().geometryBytes, report.geometryBytes);
  } finally { view.dispose(); supplied.materials.masonry.dispose(); }
});

test('view disposal releases each geometry and instance owner once while borrowed appearances survive', () => {
  const supplied = appearance(), view = createDistrictExterior(fixture(), supplied), parent = new THREE.Group();
  parent.add(view.group);
  const geometries = new Set<THREE.BufferGeometry>(), meshes = new Set<THREE.InstancedMesh>();
  view.group.traverse(object => { if (object instanceof THREE.InstancedMesh) { geometries.add(object.geometry); meshes.add(object); } });
  let geometryDisposals = 0, instanceDisposals = 0, materialDisposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => { geometryDisposals++; });
  for (const mesh of meshes) mesh.addEventListener('dispose', () => { instanceDisposals++; });
  supplied.materials.masonry.addEventListener('dispose', () => { materialDisposals++; });
  view.dispose(); view.dispose(); view.setDetail(true);
  assert.equal(view.group.parent, null); assert.equal(view.group.children.length, 0);
  assert.equal(geometryDisposals, geometries.size); assert.equal(instanceDisposals, meshes.size); assert.equal(materialDisposals, 0);
  assert.equal(view.report().drawCalls, 0); assert.equal(view.report().geometryBytes, 0);
  assert.equal(view.report().instanceBytes, 0); assert.equal(view.report().disposed, true);
  supplied.materials.masonry.dispose();
});

test('empty worlds allocate no owned geometry and bad appearance input fails explicitly', () => {
  const supplied = appearance(), view = createDistrictExterior({ ...fixture(), props: [], solids: [] }, supplied);
  assert.equal(view.report().geometryOwners, 0); assert.equal(view.report().drawCalls, 0); view.dispose();
  assert.throws(() => createDistrictExterior(fixture(), { ...supplied, colourFor: () => [NaN, 0, 0] }), /linear RGB/);
  assert.throws(() => createDistrictExterior(fixture(), { ...supplied, spatialBatchMetres: 0 }), /positive/);
  supplied.materials.masonry.dispose();
});

test('ground-cover lobes are closed outward shells, with a flipped-face negative control', () => {
  const geometry = districtExteriorCoverGeometry();
  const inspect = (): { closed: boolean; volume: number } => {
    const positions = geometry.getAttribute('position'), edges = new Map<string, number>();
    let volume = 0;
    for (let index = 0; index < positions.count; index += 3) {
      const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, index + offset));
      volume += vertices[0].dot(vertices[1].clone().cross(vertices[2])) / 6;
      const keys = vertices.map(vertex => `${vertex.x},${vertex.y},${vertex.z}`);
      for (let corner = 0; corner < 3; corner += 1) {
        const edge = `${keys[corner]}|${keys[(corner + 1) % 3]}`; edges.set(edge, (edges.get(edge) ?? 0) + 1);
      }
    }
    return { closed: [...edges].every(([edge, count]) => {
      const [from, to] = edge.split('|'); return count === 1 && edges.get(`${to}|${from}`) === 1;
    }), volume };
  };
  try {
    const correct = inspect(); assert.equal(correct.closed, true); assert.ok(correct.volume > 0);
    const positions = geometry.getAttribute('position');
    const one = new THREE.Vector3().fromBufferAttribute(positions, 1), two = new THREE.Vector3().fromBufferAttribute(positions, 2);
    positions.setXYZ(1, two.x, two.y, two.z); positions.setXYZ(2, one.x, one.y, one.z);
    assert.equal(inspect().closed, false, 'a missing outward face fails directed-edge parity');
  } finally { geometry.dispose(); }
});
