/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { partitionIndexedGeometry } from './spatialGeometry.ts';

function sourceGeometry(wideIndex = false): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -130, 0, -2, -126, 0.4, -2, -128, 0.1, 2,
    126, 1, -2, 130, 1.3, -2, 128, 1.1, 2,
    -2, 2, 0, 66, 2.8, 2, 62, 2.3, 4,
    1_000_000, 1_000_000, 1_000_000, // Unreferenced source storage must not widen a tile.
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(
    Array.from({ length: 30 }, (_, at) => at % 3 === 1 ? 1 : at * 0.001), 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    Array.from({ length: 30 }, (_, at) => 0.1 + at * 0.01), 3));
  geometry.setAttribute('packedHalf', new THREE.Float16BufferAttribute(
    Uint16Array.from({ length: 20 }, (_, at) => 0x3000 + at), 2));
  geometry.setAttribute('packedByte', new THREE.Uint8BufferAttribute(
    Uint8Array.from({ length: 10 }, (_, at) => at * 17), 1, true));
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  geometry.setIndex(wideIndex ? new THREE.Uint32BufferAttribute(indices, 1)
    : new THREE.Uint16BufferAttribute(indices, 1));
  geometry.addGroup(0, 6, 4); geometry.addGroup(6, 3, 9);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function triangles(geometries: readonly THREE.BufferGeometry[]): string[] {
  const signatures: string[] = [];
  for (const geometry of geometries) {
    const index = geometry.index!;
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
    for (const group of groups) for (let at = group.start; at < group.start + group.count; at += 3) {
      signatures.push(`${group.materialIndex}:${index.getX(at)},${index.getX(at + 1)},${index.getX(at + 2)}`);
    }
  }
  return signatures.sort();
}

for (const wideIndex of [false, true]) test(`spatial indices preserve exact material/winding and packed source attributes (${wideIndex ? 32 : 16}-bit)`, () => {
  const source = sourceGeometry(wideIndex), originalTriangles = triangles([source]);
  const originalAttributes = Object.fromEntries(Object.entries(source.attributes).map(([name, attribute]) => {
    assert.ok(attribute instanceof THREE.BufferAttribute);
    return [name, Array.from(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength))];
  }));
  const { geometries, report } = partitionIndexedGeometry(source, 64);
  try {
    assert.equal(geometries.length, 3);
    assert.deepEqual(triangles(geometries), originalTriangles);
    assert.equal(report.triangles, 3);
    assert.equal(report.sourceDrawGroups, 2);
    assert.equal(report.drawGroups, 3);
    assert.equal(report.indexBytes, source.index!.array.byteLength);
    assert.equal(geometries.reduce((sum, geometry) => sum + geometry.index!.array.byteLength, 0), report.indexBytes);
    const attributes = new Set<THREE.BufferAttribute>();
    for (const geometry of geometries) {
      assert.equal(geometry.index!.array.constructor, source.index!.array.constructor, 'source index width survives a small tile');
      for (const [name, attribute] of Object.entries(geometry.attributes)) {
        assert.equal(attribute, source.getAttribute(name), `${name} remains the exact shared owner`);
        assert.ok(attribute instanceof THREE.BufferAttribute);
        attributes.add(attribute);
        assert.deepEqual(Array.from(new Uint8Array(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength)),
          originalAttributes[name], `${name} raw storage, including half-float and normalized bytes, did not move`);
      }
    }
    assert.equal(report.attributeBytes, [...attributes].reduce((sum, attribute) => sum + attribute.array.byteLength, 0));
    assert.deepEqual(triangles([source]), originalTriangles, 'partitioning never rewrites source indices/groups');

    // Known-bad controls make omissions, winding and material loss observable.
    assert.notDeepEqual(triangles(geometries.slice(1)), originalTriangles);
    const first = geometries[0], a = first.index!.getX(0), b = first.index!.getX(1);
    first.index!.setX(0, b); first.index!.setX(1, a);
    assert.notDeepEqual(triangles(geometries), originalTriangles);
    first.index!.setX(0, a); first.index!.setX(1, b);
    const material = first.groups[0].materialIndex;
    first.groups[0].materialIndex = 99;
    assert.notDeepEqual(triangles(geometries), originalTriangles);
    first.groups[0].materialIndex = material;
  } finally { for (const geometry of geometries) geometry.dispose(); source.dispose(); }
});

test('local tile bounds cover crossing triangles and exclude unreferenced shared storage', () => {
  const source = sourceGeometry(), { geometries } = partitionIndexedGeometry(source, 64);
  try {
    for (const geometry of geometries) {
      assert.ok(geometry.boundingBox && geometry.boundingSphere);
      const expected = new THREE.Box3(), point = new THREE.Vector3();
      for (const vertex of geometry.index!.array) expected.expandByPoint(point.fromBufferAttribute(geometry.getAttribute('position'), vertex));
      assert.deepEqual(geometry.boundingBox, expected);
      assert.ok(geometry.boundingSphere.radius < 100, 'a million-metre unused vertex cannot disable tile culling');
      for (const vertex of geometry.index!.array) {
        point.fromBufferAttribute(geometry.getAttribute('position'), vertex);
        assert.ok(point.distanceTo(geometry.boundingSphere.center) <= geometry.boundingSphere.radius + 1e-10);
      }
    }
    const crossing = geometries.find(geometry => geometry.index!.getX(0) === 6)!;
    assert.equal(crossing.boundingBox!.min.x, -2);
    assert.equal(crossing.boundingBox!.max.x, 66, 'centroid assignment retains the complete crossing triangle');
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(-128, 50, 0); camera.up.set(0, 0, -1); camera.lookAt(-128, 0, 0);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const visible = geometries.map(geometry => {
      const mesh = new THREE.Mesh(geometry); mesh.updateMatrixWorld(true);
      return frustum.intersectsObject(mesh);
    });
    assert.deepEqual(visible, [true, false, false], 'a tight camera excludes distant tiles with the same shared attributes');
  } finally { for (const geometry of geometries) geometry.dispose(); source.dispose(); }
});

test('disabled partition preserves factory identity and malformed sources refuse', () => {
  const source = sourceGeometry();
  try {
    assert.equal(partitionIndexedGeometry(source, Infinity).geometries[0], source);
    for (const metres of [0, -1, NaN, -Infinity]) assert.throws(() => partitionIndexedGeometry(source, metres), RangeError);
    source.setDrawRange(3, 6);
    assert.throws(() => partitionIndexedGeometry(source, 64), /complete source draw range/);
    source.setDrawRange(0, Infinity); source.groups[1].start = 3;
    assert.throws(() => partitionIndexedGeometry(source, 64), /non-overlapping triangle groups/);
    source.groups[1].start = 6; source.index!.setX(8, 20);
    assert.throws(() => partitionIndexedGeometry(source, 64), /exceeds its positions/);
  } finally { source.dispose(); }
});
