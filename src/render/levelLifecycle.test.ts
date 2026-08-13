/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { generateLevel } from '../level/generateRoute.ts';
import { createSliceLevel } from '../level/sliceLevel.ts';
import type { LevelPlan } from '../level/plan.ts';
import { createTerrain } from './terrain.ts';

/**
 * Regeneration is a lifecycle event — M12 Phase 3.
 *
 * `docs/PLANS.md` §10, Phase 3: *"Regeneration is the new lifecycle event, so
 * invariant 10 grows a test: N sequential generations plateau GPU objects — a
 * generator that leaks a world per seed fails regardless of how cheap each
 * world is."*
 *
 * Invariant 10 has been checked since M1 across advancing, resizing, resetting
 * and restarting, and every one of those measurements is taken on a world that
 * was built once. A generator makes the *world* disposable, which is a fault
 * class none of those tests can reach: a build path that forgets one
 * `removeFromParent` is invisible while there is only ever one level, and
 * leaks an entire heightfield the moment there are two.
 *
 * **This half runs headlessly and asks about the scene graph**; the GPU
 * counters it cannot see — `renderer.info.memory`, compiled programs, the
 * buffers behind an `InstancedMesh` — are asserted against a real
 * `WebGLRenderer` in `tests/m12.spec.ts`. Both are needed and neither
 * substitutes for the other: a leaked group is invisible to `info.memory`
 * while its geometry is disposed, and a leaked instance buffer is invisible to
 * the scene graph while its group is removed.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** Enough seeds that a per-world leak is unmistakable, few enough to run always. */
const SEEDS = ['sweep-0', 'sweep-1', 'sweep-2', 'sweep-3', 'sweep-4', 'sweep-5'];

interface SceneCensus {
  readonly objects: number;
  readonly meshes: number;
  readonly geometries: number;
  readonly materials: number;
}

/**
 * Everything reachable from the scene root, and every distinct resource it
 * still refers to.
 *
 * Distinct rather than total: the renderer shares one material across the
 * heightfield's groups, and counting references would report sharing as growth.
 */
function census(scene: THREE.Object3D): SceneCensus {
  let objects = 0;
  let meshes = 0;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    objects += 1;
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    meshes += 1;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
    }
  });
  return { objects, meshes, geometries: geometries.size, materials: materials.size };
}

test('a scene that has built and thrown away six worlds is the scene it started as', () => {
  const scene = new THREE.Scene();
  const empty = census(scene);
  assert.equal(empty.objects, 1, 'the fixture starts with the scene root and nothing else');

  const after: SceneCensus[] = [];
  for (const seed of SEEDS) {
    const view = createTerrain(generateLevel(seed).plan);
    scene.add(view.group);
    // The world is genuinely present in between, or the teardown proves nothing.
    assert.ok(census(scene).meshes > 4, `${seed} built almost nothing`);
    view.dispose();
    after.push(census(scene));
  }

  for (const [index, sample] of after.entries()) {
    assert.deepEqual(
      sample,
      empty,
      `after ${index + 1} generation(s) the scene still holds `
        + `${sample.objects - empty.objects} object(s), `
        + `${sample.meshes - empty.meshes} mesh(es) and `
        + `${sample.geometries - empty.geometries} geometr(ies) from a world that was `
        + 'thrown away. A generator that leaks a world per seed fails regardless of '
        + 'how cheap each world is.',
    );
  }
});

test('the sixth world costs what the first world costs', () => {
  // The other half of a plateau: a scene that empties correctly could still be
  // paying more to build the sixth world than the first — a per-build cache
  // that never resets, for instance. One seed, built six times, must produce
  // the same census every time.
  const scene = new THREE.Scene();
  const plan = generateLevel('sweep-0').plan;

  const built: SceneCensus[] = [];
  for (let round = 0; round < 6; round += 1) {
    const view = createTerrain(plan);
    scene.add(view.group);
    built.push(census(scene));
    view.dispose();
  }

  for (const sample of built) assert.deepEqual(sample, built[0]);
});

test('a world is disposed even when the next one is a different shape', () => {
  // Levels differ in which surfaces, block materials and prop parts they use,
  // and the renderer builds one mesh per *present* kind — so the teardown that
  // matters is the one where the outgoing world owns meshes the incoming one
  // does not. The slice, the proving-ground-free generator and a generated
  // route are three different shapes; alternating them exercises that.
  const scene = new THREE.Scene();
  const plans: LevelPlan[] = [
    createSliceLevel(),
    generateLevel('sweep-7').plan,
    createSliceLevel(),
    generateLevel('sweep-8').plan,
  ];

  const empty = census(scene);
  for (const plan of plans) {
    const view = createTerrain(plan);
    scene.add(view.group);
    view.dispose();
    assert.deepEqual(census(scene), empty);
  }
});
