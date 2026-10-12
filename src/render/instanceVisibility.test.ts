/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { compactVisibleInstances } from './instanceVisibility.ts';

test('in-place pane selection keeps matrices, colours and writer slots together without allocations', () => {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
  const slots = Array.from({ length: 4 }, (_, index) => ({ index, visibleForView: false, id: index }));
  for (const s of slots) {
    mesh.setMatrixAt(s.index, new THREE.Matrix4().makeTranslation(s.id * 10, 0, 0));
    mesh.setColorAt(s.index, new THREE.Color().setRGB(s.id / 4, 0, 0));
  }
  const matrixArray = mesh.instanceMatrix.array, colourArray = mesh.instanceColor!.array;
  const matrix = new THREE.Matrix4(), colour = new THREE.Color();
  const check = (ids: number[]) => {
    for (const s of slots) s.visibleForView = ids.includes(s.id);
    compactVisibleInstances(mesh, slots);
    assert.equal(mesh.count, ids.length);
    assert.deepEqual(slots.slice(0, mesh.count).map(s => s.id).sort(), [...ids].sort());
    for (const s of slots) {
      mesh.getMatrixAt(s.index, matrix); mesh.getColorAt(s.index, colour);
      assert.equal(matrix.elements[12], s.id * 10); assert.equal(colour.r, s.id / 4);
    }
    assert.strictEqual(mesh.instanceMatrix.array, matrixArray); assert.strictEqual(mesh.instanceColor!.array, colourArray);
    mesh.count = slots.length;
  };
  // Other panes, the empty pane, and reappearance cannot inherit a prior prefix.
  check([1, 3]); check([0, 2]); check([]); check([0, 1, 2, 3]);
  const writer = slots.find(s => s.id === 2)!;
  mesh.setMatrixAt(writer.index, matrix.makeTranslation(777, 0, 0));
  for (const s of slots) s.visibleForView = s.id === 2;
  compactVisibleInstances(mesh, slots); mesh.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 777);
  mesh.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});
