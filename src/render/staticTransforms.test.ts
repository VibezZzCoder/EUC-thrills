/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { freezeStaticTransforms } from './staticTransforms.ts';

test('attached static transforms retain their exact world matrices and an excluded branch still follows the rider', () => {
  const scene = new THREE.Scene(), group = new THREE.Group(), child = new THREE.Object3D(), backstop = new THREE.Object3D();
  group.position.set(3, 2, -4); group.rotation.y = .7; child.position.set(5, 1, 2);
  backstop.position.set(2, -1, 6); group.add(child, backstop); scene.add(group);
  scene.updateMatrixWorld(true); const expected = child.matrixWorld.elements.slice();
  let staticLocalWrites = 0;
  const original = child.updateMatrix.bind(child); child.updateMatrix = () => { staticLocalWrites++; original(); };
  freezeStaticTransforms(group, object => object === backstop);
  const capturedWrites = staticLocalWrites;
  backstop.position.x = 11;
  for (let pane = 0; pane < 4; pane++) scene.updateMatrixWorld(true);
  assert.deepEqual(child.matrixWorld.elements, expected);
  assert.equal(staticLocalWrites, capturedWrites, 'static local transforms must not be recomposed per pane');
  assert.equal(child.matrixWorldAutoUpdate, false);
  assert.equal(backstop.matrixWorldAutoUpdate, true); assert.equal(backstop.matrixAutoUpdate, true);
  const expectedBackstop = new THREE.Matrix4().multiplyMatrices(group.matrixWorld, new THREE.Matrix4().makeTranslation(11, -1, 6));
  assert.deepEqual(backstop.matrixWorld.elements, expectedBackstop.elements);
});
