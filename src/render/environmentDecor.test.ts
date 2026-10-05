/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { createEnvironmentDecor, withEnvironmentDecorCost } from './environmentDecor.ts';
import { selectPresentation } from './presentation.ts';
import { DEPOT_SIGN } from '../data/environment.ts';
import { paintDepotSign } from './environmentSignPaint.ts';

function fixture(angle = 0): LevelPlan {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (x: number, y: number, z: number) => ({ x: c * x + s * z, y, z: -s * x + c * z });
  const socket = (x: number) => ({ position: rotate(x, 0, 52), headingY: Math.PI / 2 + angle,
    halfWidth: 4, gradient: 0, surface: 'pavement' as const });
  return {
    id: 'industrial-render-fixture', spawn: { position: rotate(0, 0, 52), headingY: angle },
    surround: { height: 0, surface: 'grass' }, checkpoints: [],
    heightfield: { originX: -80, originZ: -80, spacing: 2, columns: 81, rows: 81,
      heights: Array.from({ length: 81 * 81 }, () => 0),
      surfaces: Array.from({ length: 80 * 80 }, () => 'pavement' as const) },
    segments: [{ id: 'industrial-street', entry: socket(-60), exit: socket(60), colliders: [] }],
    props: [{ kind: 'building', look: 'industrial', scale: 1, position: rotate(0, 0, 25),
      rotationY: angle, size: { x: 18, y: 8, z: 20 } }],
    solids: [{ centre: rotate(0, 4, 25), halfExtents: { x: 9, y: 4, z: 10 },
      rotationY: angle, surface: 'pavement', occludes: true }],
  };
}

test('all transformed exemplar geometry stays within its original protected host, apart from an elevated lip', () => {
  for (const angle of [0, 0.71, -1.28]) {
    const plan = fixture(angle), before = JSON.stringify(plan), decor = createEnvironmentDecor(plan);
    assert.equal(decor.sites.length, 1);
    const site = decor.sites[0];
    assert.deepEqual(decor.openings, [{ position: site.position, yaw: site.yaw, faceWidth: site.faceWidth, height: 4.3, depth: 1.2 }]);
    const inverse = new THREE.Matrix4().makeRotationY(site.yaw)
      .setPosition(site.position.x, site.position.y, site.position.z).invert();
    const point = new THREE.Vector3();
    let vertices = 0;
    const capFace: THREE.Vector3[] = [];
    decor.group.updateMatrixWorld(true);
    decor.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
        assert.ok(Math.abs(point.x) <= site.faceWidth / 2 + 0.00002, `${object.name}: side footprint`);
        assert.ok(point.z >= -site.roomDepth - 0.00002 && point.z <= DEPOT_SIGN.projection + 0.051, `${object.name}: bounded room/sign depth`);
        assert.ok(point.y >= -0.00002 && point.y <= site.building.size!.y + 0.00002, `${object.name}: original host height`);
        assert.ok(point.y <= site.height + 0.10, `${object.name}: bounded header overlap`);
        if (point.z > 0.00002) assert.ok(point.y >= 3.05, `${object.name}: a projecting detail must clear riders`);
        if (point.z > 0.061) assert.ok(point.y >= DEPOT_SIGN.bottom - 0.021, `${object.name}: the depot blade is elevated`);
        if (point.z > 0.04 && point.y > 3.5) capFace.push(point.clone());
        vertices++;
      }
    });
    assert.ok(vertices > 3000, 'empty or minimal geometry cannot establish a finished exemplar');
    // A cap needs continuous coverage on both sides of the clipped host edge;
    // stopping on that edge again would pass the footprint test but leave a
    // grazing-view hairline. Require a real front return, not a flat decal.
    assert.ok(Math.min(...capFace.map(p => p.y)) <= site.height - 0.10);
    assert.ok(Math.max(...capFace.map(p => p.y)) >= site.height + 0.05);
    assert.ok(Math.min(...capFace.map(p => p.x)) <= -site.faceWidth / 2 + 0.00002);
    assert.ok(Math.max(...capFace.map(p => p.x)) >= site.faceWidth / 2 - 0.00002);
    assert.equal(JSON.stringify(plan), before);
    assert.equal(decor.objects.filter(object => object.kind === 'delivery-van').length, 1);
    assert.equal(decor.objects.filter(object => object.kind === 'bicycle').length, 2);
    decor.dispose();
  }
});

test('every actual mesh, triangle and allocation is counted, with opaque finishes and no added shadows', () => {
  const decor = createEnvironmentDecor(fixture());
  let calls = 0, triangles = 0, bytes = 0;
  const materials = new Set<THREE.Material>();
  decor.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry = object.geometry;
    calls++;
    triangles += geometry.index!.count / 3;
    bytes += geometry.index!.array.byteLength;
    for (const attribute of Object.values(geometry.attributes)) {
      bytes += attribute.array.byteLength;
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${object.name}: finite attribute`);
    }
    assert.equal(object.castShadow, false);
    assert.equal(object.receiveShadow, false);
    const material = object.material as THREE.MeshStandardMaterial;
    materials.add(material);
    assert.equal(material.transparent, false);
    if (object.name === 'environment-industrial-depot-sign') {
      assert.equal(material.map?.name, 'original-environment-depot-sign');
      const uv = geometry.getAttribute('uv');
      for (const value of uv.array) assert.ok(value >= 0 && value <= 1, 'sign samples its single owned page');
    } else assert.equal(material.map, null);
  });
  const report = decor.report();
  assert.equal(calls, 8);
  assert.equal(report.ventilationFans, 1);
  assert.equal(report.drawCalls, calls);
  assert.equal(report.colourTriangles, triangles);
  assert.equal(report.geometryBytes, bytes);
  assert.equal(report.materialOwners, materials.size);
  assert.equal(report.vehicles, 1);
  assert.equal(report.bicycles, 2);
  assert.equal(report.people, 0);
  assert.equal(report.instanceBytes + report.shadowDrawCalls, 0);
  assert.equal(report.textureBytes, Math.ceil(DEPOT_SIGN.atlasWidth * DEPOT_SIGN.atlasHeight * 4 * 4 / 3));
  assert.ok(triangles > 2000 && triangles < 10_000, 'bounded actual work, not an admission repricing');
  const original = selectPresentation(fixture()).cost;
  const added = withEnvironmentDecorCost(original, report);
  for (const [shape, views] of [['solo', 1], ['split', 2], ['quad', 4]] as const) {
    assert.equal(added.frame[shape].drawCalls - original.frame[shape].drawCalls, calls * views);
    assert.equal(added.frame[shape].triangles - original.frame[shape].triangles, triangles * views);
  }
  assert.equal(added.shadowTriangles, original.shadowTriangles);
  decor.dispose();
});

test('static furnishings share unchanged geometry through clocks, panes and reduced motion', () => {
  const decor = createEnvironmentDecor(fixture());
  const initial = decor.group.children.map(object => [...(object as THREE.Mesh).geometry.getAttribute('position').array]);
  for (const seconds of [0, 1.7, 1.7, 20, Number.NaN]) {
    decor.update(seconds, false);
    decor.update(seconds, true);
  }
  assert.deepEqual(decor.group.children.map(object => [...(object as THREE.Mesh).geometry.getAttribute('position').array]), initial);
  assert.equal(decor.report().motion, 'ventilation');
  decor.dispose();
  decor.update(30, false);
});

test('teardown disposes each unique owner once, and unsuitable worlds allocate nothing', () => {
  const scene = new THREE.Scene();
  for (let generation = 0; generation < 3; generation++) {
    const decor = createEnvironmentDecor(fixture());
    scene.add(decor.group);
    const disposed = new Map<object, number>();
    decor.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      disposed.set(object.geometry, 0);
      object.geometry.addEventListener('dispose', () => disposed.set(object.geometry, disposed.get(object.geometry)! + 1));
      const material = object.material as THREE.Material;
      if (!disposed.has(material)) {
        disposed.set(material, 0);
        material.addEventListener('dispose', () => disposed.set(material, disposed.get(material)! + 1));
      }
      if ((material as THREE.MeshStandardMaterial).map) {
        const texture = (material as THREE.MeshStandardMaterial).map!;
        disposed.set(texture, 0);
        texture.addEventListener('dispose', () => disposed.set(texture, disposed.get(texture)! + 1));
      }
    });
    decor.dispose();
    decor.dispose();
    assert.equal(scene.children.length, 0);
    for (const count of disposed.values()) assert.equal(count, 1);
  }
  const empty = createEnvironmentDecor({ ...fixture(), props: [] });
  assert.equal(empty.group.children.length, 0);
  assert.deepEqual(empty.openings, []);
  assert.deepEqual(empty.emitters, []);
  assert.equal(empty.report().drawCalls + empty.report().geometryBytes + empty.report().materialOwners, 0);
  empty.dispose();
});

test('depot wayfinding is deterministic opaque path-painted art', () => {
  const first = paintDepotSign(), second = paintDepotSign();
  assert.deepEqual(first, second);
  assert.equal(first.length, DEPOT_SIGN.atlasWidth * DEPOT_SIGN.atlasHeight * 4);
  for (let index = 3; index < first.length; index += 4) assert.equal(first[index], 255);
  const tones = new Set<number>();
  for (let index = 0; index < first.length; index += 4) tones.add(first[index]);
  assert.ok(tones.size > 10, 'the sign must contain antialiased graphic coverage');
});


test('protected fan uses one periodic world-clock transform and a same-time reduced-motion rest', () => {
  const plan = fixture(0.71), decor = createEnvironmentDecor(plan);
  const fan = decor.group.getObjectByName('environment-industrial-ventilation-fan') as THREE.Mesh;
  assert.ok(fan instanceof THREE.Mesh);
  const initial = fan.matrix.toArray();
  const positions = Array.from(fan.geometry.getAttribute('position').array);
  decor.update(3, false);
  const turned = fan.matrix.toArray();
  assert.notDeepEqual(turned, initial);
  decor.update(3, false);
  assert.deepEqual(fan.matrix.toArray(), turned, 'a second pane must not advance the fan');
  decor.update(15, false);
  assert.deepEqual(fan.matrix.toArray(), turned, 'the twelve-second clock wraps exactly');
  decor.update(15, true);
  assert.deepEqual(fan.matrix.toArray(), initial, 'changing reduced flag at unchanged time restores rest');
  decor.update(20, true);
  assert.deepEqual(fan.matrix.toArray(), initial);
  assert.deepEqual(Array.from(fan.geometry.getAttribute('position').array), positions);
  const host = plan.solids![0];
  const inverseHost = new THREE.Matrix4().makeRotationY(host.rotationY)
    .setPosition(host.centre.x, host.centre.y, host.centre.z).invert();
  const point = new THREE.Vector3(), actual = fan.geometry.getAttribute('position');
  const site = decor.sites[0];
  const inverseRoom = new THREE.Matrix4().makeRotationY(site.yaw)
    .setPosition(site.position.x, site.position.y, site.position.z).invert();
  const clearance = () => {
    decor.group.updateMatrixWorld(true);
    let minimum = Infinity;
    for (let vertex = 0; vertex < actual.count; vertex++) {
      point.fromBufferAttribute(actual, vertex).applyMatrix4(fan.matrixWorld).applyMatrix4(inverseHost);
      minimum = Math.min(minimum, host.halfExtents.x - Math.abs(point.x),
        host.halfExtents.y - Math.abs(point.y), host.halfExtents.z - Math.abs(point.z));
    }
    return minimum;
  };
  for (let step = 0; step <= 12 * 120; step++) {
    decor.update(step / 120, false);
    assert.ok(clearance() >= 0.025, 'actual turning blades leave their original protecting OBB');
    for (let vertex = 0; vertex < actual.count; vertex++) {
      point.fromBufferAttribute(actual, vertex).applyMatrix4(fan.matrixWorld).applyMatrix4(inverseRoom);
      assert.ok(point.y <= 3.16 - 0.025 && point.y >= 2.05 + 0.025,
        'actual rotor intersects the room ceiling or stored cupboards');
    }
  }
  // The same predicate must reject actual geometry moved outside that body.
  fan.matrix.premultiply(new THREE.Matrix4().makeTranslation(30, 0, 0));
  fan.matrixWorldNeedsUpdate = true;
  assert.ok(clearance() < 0.025, 'fan protection predicate accepted the known-bad transform');
  decor.dispose();
});
