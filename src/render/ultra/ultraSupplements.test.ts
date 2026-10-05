/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { createStreetPavingMaterial } from '../streetPavingMaterial.ts';
import { createUltraShared } from './ultraMaterials.ts';
import { UltraSupplements } from './ultraSupplements.ts';
import { ULTRA_FULL } from './ultraRecipe.ts';
import { releaseEnvironmentPrograms } from './ultraRuntime.ts';
import type { UltraBuildContext } from './ultraTypes.ts';

function context(): UltraBuildContext {
  return { recipe: ULTRA_FULL, shared: createUltraShared(), maxAnisotropy: 1 };
}

test('runtime program release and overlay exit give each clone one disposal owner', () => {
  const scene = new THREE.Group(), root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const ordinary = new THREE.MeshStandardMaterial(), persistent = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geometry, ordinary); root.add(mesh);
  scene.add(root, new THREE.Mesh(geometry, persistent));
  const overlay = new UltraSupplements(); overlay.setRoots([root]); overlay.sync(context());
  const clone = mesh.material;
  let cloneCalls = 0, ordinaryCalls = 0, persistentCalls = 0;
  clone.addEventListener('dispose', () => cloneCalls++);
  ordinary.addEventListener('dispose', () => ordinaryCalls++);
  persistent.addEventListener('dispose', () => persistentCalls++);
  assert.equal(releaseEnvironmentPrograms(scene, null, overlay.programOwnerRoots()), 1);
  assert.equal(cloneCalls, 0); assert.equal(persistentCalls, 1);
  overlay.sync(null); overlay.dispose();
  assert.equal(cloneCalls, 1); assert.equal(ordinaryCalls, 0); assert.equal(mesh.material, ordinary);
  // The old unguarded traversal is a real negative control for duplicate release.
  overlay.setRoots([root]); overlay.sync(context());
  const badClone = mesh.material; let badCalls = 0;
  badClone.addEventListener('dispose', () => badCalls++);
  releaseEnvironmentPrograms(scene, null); overlay.sync(null);
  assert.equal(badCalls, 2);
  overlay.dispose(); geometry.dispose(); ordinary.dispose(); persistent.dispose();
});

test('supplement borrows one world response and preserves ordinary material/geometry owners', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshStandardMaterial({color: 0x7f8667, roughness: 0.71});
  const a = new THREE.Mesh(geometry, material), b = new THREE.Mesh(geometry, material);
  root.add(a, b);
  const overlay = new UltraSupplements(), world = context();
  overlay.setRoots([root]); overlay.sync(null);
  assert.equal(a.material, material);
  overlay.sync(world);
  const enriched = a.material;
  assert.notEqual(enriched, material);
  assert.equal(b.material, enriched);
  assert.equal(a.geometry, geometry);
  assert.equal(overlay.materialOwners(), 1);
  assert.equal(enriched.color.getHex(), material.color.getHex());
  assert.equal(enriched.roughness, material.roughness);
  overlay.sync(world);
  assert.equal(a.material, enriched, 'same-context frames allocate no replacement');
  let disposed = 0, originalDisposed = 0;
  enriched.addEventListener('dispose', () => disposed++);
  material.addEventListener('dispose', () => originalDisposed++);
  overlay.sync(null); overlay.dispose();
  assert.equal(a.material, material); assert.equal(b.material, material);
  assert.equal(disposed, 1); assert.equal(originalDisposed, 0);
  material.dispose(); geometry.dispose();
});

test('paving chains its metre-scale shader with existing Ultra neutral fill and stone shade lift', () => {
  const root = new THREE.Group(), geometry = new THREE.PlaneGeometry();
  const material = createStreetPavingMaterial(), mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'street-life-paving'; root.add(mesh);
  const overlay = new UltraSupplements(), world = context();
  const global = JSON.stringify(THREE.ShaderChunk);
  overlay.setRoots([root]); overlay.sync(world);
  const source = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    uniforms: {} as Record<string, THREE.IUniform> };
  mesh.material.onBeforeCompile(source as Parameters<THREE.Material['onBeforeCompile']>[0], {} as THREE.WebGLRenderer);
  assert.equal(source.vertexShader.split('attribute vec2 streetPavingLocal;').length - 1, 1);
  assert.ok(source.fragmentShader.includes('ultraFillSaturation'));
  assert.ok(source.fragmentShader.includes('ultraLiftSurfaceShare'));
  assert.ok(source.fragmentShader.includes('pavingBorderDistance'));
  const defines = mesh.material.defines ?? {};
  assert.ok('ULTRA_SHADE_LIFT' in defines);
  assert.ok(!('ULTRA_AO' in defines), 'no absent terrain AO attribute');
  assert.ok(!('ULTRA_DETAIL' in defines), 'no supplementary maps');
  assert.equal(source.uniforms.ultraFarMap, world.shared.uniforms.ultraFarMap);
  assert.ok(source.uniforms.ultraFarMap.value instanceof THREE.Texture, 'sampler always bound');
  assert.equal(JSON.stringify(THREE.ShaderChunk), global);
  overlay.dispose(); assert.equal(mesh.material, material);
  geometry.dispose(); material.dispose();
});

test('world replacement releases clones exactly once and retains borrowed texture ownership', () => {
  const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, opacity: 0.16, depthWrite: false });
  const geometry = new THREE.PlaneGeometry(), mesh = new THREE.Mesh(geometry, material), root = new THREE.Group();
  root.add(mesh); const overlay = new UltraSupplements();
  overlay.setRoots([root]); overlay.sync(context());
  const clone = mesh.material;
  assert.equal(clone.map, texture); assert.equal(clone.transparent, true);
  assert.equal(clone.opacity, 0.16); assert.equal(clone.depthWrite, false);
  let clones = 0, textures = 0;
  clone.addEventListener('dispose', () => clones++); texture.addEventListener('dispose', () => textures++);
  overlay.setRoots([]); overlay.dispose();
  assert.equal(mesh.material, material); assert.equal(clones, 1); assert.equal(textures, 0);
  material.dispose(); texture.dispose(); geometry.dispose();
});
