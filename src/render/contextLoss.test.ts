/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  collectLostContextHoldings,
  releaseForLostContext,
  type ThreeBookkeeping,
} from './contextLoss.ts';

/**
 * The context-loss release (A28 follow-up, CL; `contextLoss.ts`).
 *
 * three has no GL context under `node --test`, so the listeners three hangs
 * on what it sets up are stood in for by `listen`: a listener that counts and
 * then removes itself, exactly as each of three's `onTextureDispose`,
 * `onGeometryDispose`, `onRenderTargetDispose`, `onInstancedMeshDispose` and
 * `onMaterialDispose` does. Whether the real listeners run at the loss, and
 * whether any later path still deletes a dead handle, is the browser's
 * question: `tests/m39-ultra.spec.ts` journey 16.
 */

type Disposable = THREE.EventDispatcher<{ dispose: object }>;

/** Count `dispose` events on `target`, removing itself after the first — three's own pattern. */
function listen(target: object, fired: Map<object, number>): void {
  const dispatcher = target as Disposable;
  const once = (): void => {
    fired.set(target, (fired.get(target) ?? 0) + 1);
    dispatcher.removeEventListener('dispose', once);
  };
  dispatcher.addEventListener('dispose', once);
}

/** Count *every* `dispose` event on `target` (a listener that stays). */
function count(target: object, events: Map<object, number>): void {
  (target as Disposable).addEventListener('dispose', () => {
    events.set(target, (events.get(target) ?? 0) + 1);
  });
}

/** A fake `renderer.properties`: a record per object, `uniforms` for a compiled material. */
function bookkeeping(records: Map<object, unknown>): ThreeBookkeeping & { gets: object[]; hasCalls: number } {
  const gets: object[] = [];
  const book = {
    gets,
    hasCalls: 0,
    has(object: unknown): boolean {
      book.hasCalls += 1;
      return records.has(object as object);
    },
    get(object: unknown): unknown {
      gets.push(object as object);
      return records.get(object as object);
    },
  };
  return book;
}

function texture(name: string): THREE.DataTexture {
  const made = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  made.name = name;
  return made;
}

/** One of everything the renderer's scene can hold that three sets up on the GPU. */
function world() {
  const scene = new THREE.Scene();
  const map = texture('map');
  const normal = texture('normal');
  const standard = new THREE.MeshStandardMaterial({ map, normalMap: normal });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(box, standard);
  const depthMaterial = new THREE.MeshDepthMaterial();
  mesh.customDepthMaterial = depthMaterial;
  scene.add(mesh);

  // Hidden objects are still set up if they were ever drawn (the ghost, the cop, a dropped mesh).
  const hidden = new THREE.Group();
  hidden.visible = false;
  const hiddenGeometry = new THREE.PlaneGeometry(1, 1);
  const hiddenMaterial = new THREE.MeshBasicMaterial();
  hidden.add(new THREE.Mesh(hiddenGeometry, hiddenMaterial));
  scene.add(hidden);

  // An instanced mesh with two materials and a morph texture that must survive.
  const instancedGeometry = new THREE.BoxGeometry(1, 1, 1);
  const first = new THREE.MeshLambertMaterial();
  const second = new THREE.MeshLambertMaterial();
  const instanced = new THREE.InstancedMesh(instancedGeometry, [first, second], 3);
  const morph = texture('morph');
  instanced.morphTexture = morph;
  scene.add(instanced);

  // A ShaderMaterial's own uniforms, one of them an array of textures.
  const shaderTexture = texture('shader');
  const arrayA = texture('array-a');
  const arrayB = texture('array-b');
  const shader = new THREE.ShaderMaterial({
    uniforms: {
      one: { value: shaderTexture },
      many: { value: [arrayA, arrayB] },
      plain: { value: new THREE.Vector3() },
    },
  });
  const points = new THREE.Points(new THREE.BufferGeometry(), shader);
  scene.add(points);

  // An `onBeforeCompile` patch's texture lives only in the compiled uniforms.
  const patched = new THREE.MeshStandardMaterial();
  const injected = texture('injected');
  const patchedMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 2), patched);
  scene.add(patchedMesh);
  // And a material three never compiled: no record, so it is not read.
  const uncompiled = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 4, 2), uncompiled));

  // A light's shadow map: a target with a depth texture.
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const shadowMap = new THREE.WebGLRenderTarget(4, 4);
  shadowMap.depthTexture = new THREE.DepthTexture(4, 4);
  sun.shadow.map = shadowMap;
  scene.add(sun);

  // The sky on the background; a target's texture on the environment.
  const sky = texture('sky');
  sky.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = sky;
  const environmentTarget = new THREE.WebGLRenderTarget(4, 4);
  scene.environment = environmentTarget.texture;

  // Off the scene: what the renderer hands in as an extra.
  const offScene = texture('ultra-sky');

  const records = new Map<object, unknown>([
    [patched, { uniforms: { injected: { value: injected }, plain: { value: 3 } } }],
    [standard, { uniforms: { map: { value: map } } }],
  ]);

  return {
    scene, map, normal, standard, box, mesh, depthMaterial, hiddenGeometry, hiddenMaterial,
    instancedGeometry, first, second, instanced, morph, shaderTexture, arrayA, arrayB, shader,
    points, patched, injected, uncompiled, sun, shadowMap, sky, environmentTarget, offScene, records,
  };
}

test('a lost context sends dispose once to every geometry, texture, target, instanced mesh and material three can hold', () => {
  const w = world();
  const fired = new Map<object, number>();
  const expected: object[] = [
    w.map, w.normal, w.standard, w.box, w.depthMaterial, w.hiddenGeometry, w.hiddenMaterial,
    w.instancedGeometry, w.first, w.second, w.instanced, w.morph, w.shaderTexture, w.arrayA, w.arrayB,
    w.shader, w.points.geometry, w.patched, w.injected, w.uncompiled, w.shadowMap,
    w.shadowMap.texture, w.shadowMap.depthTexture as THREE.DepthTexture, w.sky, w.environmentTarget,
    w.environmentTarget.texture, w.offScene,
  ];
  for (const each of expected) listen(each, fired);

  const book = bookkeeping(w.records);
  const counts = releaseForLostContext([w.scene], [w.offScene], book);

  for (const each of expected) {
    const name = (each as { name?: string }).name || (each as { type?: string }).type || 'object';
    assert.equal(fired.get(each), 1, `${name} was not released exactly once`);
  }
  assert.deepEqual(counts, {
    geometries: 6,
    // map, normal, morph, shader, array-a, array-b, injected, sky, ultra-sky, and the two targets' three textures
    textures: 12,
    targets: 2,
    materials: 8,
    instanced: 1,
  });
});

test('the release changes no field and takes nothing off the scene: the next frame draws what the last one did', () => {
  const w = world();
  const children = w.scene.children.slice();
  releaseForLostContext([w.scene], [w.offScene], bookkeeping(w.records));
  assert.deepEqual(w.scene.children, children);
  assert.equal(w.scene.background, w.sky);
  assert.equal(w.scene.environment, w.environmentTarget.texture);
  assert.equal(w.sun.shadow.map, w.shadowMap, 'the shadow map was dropped: three would build a new one');
  assert.ok(w.shadowMap.depthTexture !== null);
  assert.equal(w.instanced.morphTexture, w.morph, 'the instanced mesh lost its morph texture');
  assert.equal(w.standard.map, w.map);
  assert.equal(w.standard.normalMap, w.normal);
  assert.equal(w.mesh.customDepthMaterial, w.depthMaterial);
  assert.equal(w.mesh.geometry, w.box);
  assert.equal(w.mesh.material, w.standard);
  assert.equal(w.scene.children[1].visible, false, 'a hidden group was shown');
});

test('three\'s bookkeeping is read, never written: `has` before every `get`, and only compiled materials are read', () => {
  const w = world();
  const book = bookkeeping(w.records);
  collectLostContextHoldings([w.scene], [], book);
  assert.deepEqual(new Set(book.gets), new Set([w.patched, w.standard]));
  assert.ok(book.hasCalls >= 8, 'every material was asked about');
  // With no bookkeeping, the patch's texture is out of reach — which is why the renderer passes its own.
  const blind = collectLostContextHoldings([w.scene], [], null);
  assert.equal(blind.textures.has(w.injected), false);
  assert.equal(collectLostContextHoldings([w.scene], [], book).textures.has(w.injected), true);
});

test('a second loss sends the same events, and a listener three removed at the first does not run again', () => {
  const w = world();
  const fired = new Map<object, number>();
  const events = new Map<object, number>();
  for (const each of [w.box, w.map, w.shadowMap, w.instanced, w.standard]) {
    listen(each, fired);
    count(each, events);
  }
  releaseForLostContext([w.scene], [], bookkeeping(w.records));
  releaseForLostContext([w.scene], [], bookkeeping(w.records));
  for (const each of [w.box, w.map, w.shadowMap, w.instanced, w.standard]) {
    assert.equal(fired.get(each), 1, 'a self-removing listener ran twice');
    assert.equal(events.get(each), 2, 'the second loss did not release again');
  }
});

test('a render target is reached from any of its textures, and a target from a uniform', () => {
  const target = new THREE.WebGLRenderTarget(2, 2, { count: 2 });
  target.depthTexture = new THREE.DepthTexture(2, 2);
  const material = new THREE.ShaderMaterial({ uniforms: { far: { value: target.depthTexture } } });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  const held = collectLostContextHoldings([scene], [], null);
  assert.ok(held.targets.has(target), 'a depth texture did not lead to its target');
  for (const each of target.textures) assert.ok(held.textures.has(each), 'a target did not lead to all its textures');
  const direct = collectLostContextHoldings([new THREE.Scene()], [target], null);
  assert.ok(direct.targets.has(target) && direct.textures.has(target.depthTexture as THREE.DepthTexture));
});

test('nothing that is not three\'s is walked into or sent an event', () => {
  const material = new THREE.MeshBasicMaterial();
  const stranger = { isTexture: false, dispose: (): never => { throw new Error('a stranger was disposed'); } };
  material.userData.texture = texture('user-data');
  material.userData.held = { texture: texture('user-data-held') };
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  (mesh as unknown as { stranger: unknown }).stranger = stranger;
  scene.add(mesh);
  const held = collectLostContextHoldings([scene], [stranger, null, undefined, 3, 'sky'], null);
  assert.equal(held.textures.size, 0, 'userData was walked into');
  assert.doesNotThrow(() => releaseForLostContext([scene], [stranger], null));
});
