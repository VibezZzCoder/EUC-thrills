/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { installGrassDistanceCell } from './grassDistance.ts';
import { ENVIRONMENT_VEGETATION, VEGETATION_TIER_DETAIL } from '../data/tuning.ts';

test('only a fully shader-faded cell skips submission; counts and uploads survive alternating cameras', () => {
  const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshStandardMaterial();
  geometry.clearGroups();
  const mesh = new THREE.InstancedMesh(geometry, material, 3), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const renderer = {} as THREE.WebGLRenderer;
  const drawGroup = new THREE.Group();
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(12, 0, 0));
  mesh.setMatrixAt(2, new THREE.Matrix4().makeTranslation(14, 0, 0));
  mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += ENVIRONMENT_VEGETATION.windMetres * 3;
  mesh.position.set(5, 0, 2); mesh.scale.setScalar(2); scene.add(mesh); scene.updateMatrixWorld(true);
  const centre = mesh.boundingSphere!.center.clone().applyMatrix4(mesh.matrixWorld);
  const radius = mesh.boundingSphere!.radius * 2, active = mesh.count;
  const bytes = mesh.instanceMatrix.array.slice(), version = mesh.instanceMatrix.version;
  const release = installGrassDistanceCell(mesh);
  const draw = (distance: number, expected: number) => {
    camera.position.copy(centre).add(new THREE.Vector3(distance, 0, 0)); camera.updateMatrixWorld(true);
    mesh.onBeforeRender(renderer, scene, camera, geometry, material, drawGroup);
    assert.equal(mesh.count, expected);
    mesh.onAfterRender(renderer, scene, camera, geometry, material, drawGroup);
    assert.equal(mesh.count, active, 'one pane must never leave a later pane or raycast with an empty population');
  };
  try {
    draw(ENVIRONMENT_VEGETATION.fadeEndMetres + radius + 0.01, 0);
    draw(ENVIRONMENT_VEGETATION.fadeEndMetres + radius - 0.01, active);
    draw(0, active);
    draw(ENVIRONMENT_VEGETATION.fadeEndMetres + radius + 1, 0);
    assert.deepEqual(mesh.instanceMatrix.array, bytes); assert.equal(mesh.instanceMatrix.version, version);
    release(); release(); assert.equal(mesh.count, active);
  } finally { release(); mesh.dispose(); geometry.dispose(); material.dispose(); }
});

test('a grass shadow caster cannot silently inherit colour-camera rejection', () => {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 1); mesh.computeBoundingSphere(); mesh.castShadow = true;
  try { assert.throws(() => installGrassDistanceCell(mesh), /no caster/); }
  finally { mesh.dispose(); geometry.dispose(); material.dispose(); }
});

// RL-1 (2026-10-03): a reduced tier's shorter fade skips cells sooner, read
// from the owning renderer at draw time; High keeps the accepted 100 m.
test('the cell skip follows the owning renderer\'s current fade end', () => {
  const geometry = new THREE.BoxGeometry(1, 2, 1), material = new THREE.MeshStandardMaterial();
  geometry.clearGroups();
  const mesh = new THREE.InstancedMesh(geometry, material, 2), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const renderer = {} as THREE.WebGLRenderer, drawGroup = new THREE.Group();
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(3, 0, 0));
  mesh.computeBoundingSphere(); scene.add(mesh); scene.updateMatrixWorld(true);
  const centre = mesh.boundingSphere!.center.clone(), radius = mesh.boundingSphere!.radius;
  let tier: 'low' | 'medium' | 'high' = 'high';
  const release = installGrassDistanceCell(mesh, () => VEGETATION_TIER_DETAIL[tier]);
  const drawn = (distance: number): number => {
    camera.position.copy(centre).add(new THREE.Vector3(0, 0, distance)); camera.updateMatrixWorld(true);
    mesh.onBeforeRender(renderer, scene, camera, geometry, material, drawGroup);
    const count = mesh.count;
    mesh.onAfterRender(renderer, scene, camera, geometry, material, drawGroup);
    assert.equal(mesh.count, 2);
    return count;
  };
  try {
    const between = (VEGETATION_TIER_DETAIL.low.grassFadeEndMetres + ENVIRONMENT_VEGETATION.fadeEndMetres) / 2 + radius;
    assert.equal(VEGETATION_TIER_DETAIL.high.grassFadeEndMetres, ENVIRONMENT_VEGETATION.fadeEndMetres);
    assert.equal(drawn(between), 2, 'High draws inside its accepted fade');
    tier = 'low'; assert.equal(drawn(between), 0, 'Low skips a cell its shorter fade has collapsed');
    assert.equal(drawn(VEGETATION_TIER_DETAIL.low.grassFadeEndMetres + radius - 0.01), 2);
    tier = 'medium'; assert.equal(drawn(VEGETATION_TIER_DETAIL.medium.grassFadeEndMetres + radius + 0.01), 0);
    tier = 'high'; assert.equal(drawn(between), 2);
  } finally { release(); mesh.dispose(); geometry.dispose(); material.dispose(); }
});
