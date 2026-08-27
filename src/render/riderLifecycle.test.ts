/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { CHARACTER_IDS } from '../data/riders.ts';
import { machineForCharacter } from '../data/machines.ts';
import { machineLook } from './machineLook.ts';
import { riderLook } from './riderLook.ts';
import { createRidingRig } from './ridingRig.ts';

/**
 * A rider is a lifecycle event — M25 Phase 2.
 *
 * `docs/PLANS.md` §25.5, Phase 2: seat 1 "becomes creatable and disposable at
 * runtime", and the gate asks that "spawn/dispose ×3 plateaus resources". A
 * rig has been disposable since M14.5 made the player able to be somebody
 * else, but every measurement of that path replaces one rig with another —
 * the count never has to come back *down*, which is exactly the fault a
 * second rider introduces.
 *
 * **This half runs headlessly and asks about the scene graph**; the GPU
 * counters it cannot see — `renderer.info.memory`, compiled programs — are
 * asserted against a real `WebGLRenderer` in `tests/m25.spec.ts`. Both are
 * needed and neither substitutes for the other, which is the argument
 * `render/levelLifecycle.test.ts` makes at length for worlds and which is the
 * same argument one object graph along: a leaked group is invisible to
 * `info.memory` while its geometry is disposed, and a leaked buffer is
 * invisible to the scene graph while its group is removed.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

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
 * Distinct rather than total, for `levelLifecycle.test.ts`'s reason: a rig
 * shares one material across several parts, and counting references would
 * report sharing as growth.
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

/** A second rider, built the way `Game.spawnSecondRider` builds one. */
function seatRider(scene: THREE.Scene, character: (typeof CHARACTER_IDS)[number]) {
  const rig = createRidingRig(riderLook(character), machineLook(machineForCharacter(character)));
  scene.add(rig.group);
  return rig;
}

test('a scene that has seated and dismissed a second rider six times is the scene it started as', () => {
  const scene = new THREE.Scene();
  const empty = census(scene);
  assert.equal(empty.objects, 1, 'the fixture starts with the scene root and nothing else');

  const after: SceneCensus[] = [];
  for (let round = 0; round < 6; round += 1) {
    // A different character each round, because the roster is where the
    // geometry differs: a leak that only shows on one look would hide behind
    // six repeats of the same one.
    const character = CHARACTER_IDS[round % CHARACTER_IDS.length];
    const rig = seatRider(scene, character);
    // The rider is genuinely present in between, or the teardown proves
    // nothing. A full rig is dozens of meshes; four is a floor, not a claim.
    assert.ok(census(scene).meshes > 4, `${character} built almost nothing`);
    // `Game.despawnSecondRider`'s order, which is `installCharacter`'s:
    // detach, then free. `dispose` detaches its own group too, and the rule is
    // what the plateau depends on rather than either call on its own.
    scene.remove(rig.group);
    rig.dispose();
    after.push(census(scene));
  }

  for (const [index, sample] of after.entries()) {
    assert.deepEqual(
      sample,
      empty,
      `after seating ${index + 1} rider(s) the scene still holds `
        + `${sample.objects - empty.objects} object(s), `
        + `${sample.meshes - empty.meshes} mesh(es) and `
        + `${sample.geometries - empty.geometries} geometr(ies) from a rider who `
        + 'left. A second player who costs the scene something every time they sit '
        + 'down is a mode that degrades over an evening of couch play.',
    );
  }
});

test('the sixth rider costs what the first rider costs', () => {
  // The other half of a plateau: a scene that empties correctly could still be
  // building something more expensive every time. Same character throughout,
  // because this is a question about repetition rather than about the roster.
  const scene = new THREE.Scene();
  const seated: SceneCensus[] = [];
  for (let round = 0; round < 6; round += 1) {
    const rig = seatRider(scene, CHARACTER_IDS[0]);
    seated.push(census(scene));
    scene.remove(rig.group);
    rig.dispose();
  }

  for (const [index, sample] of seated.entries()) {
    assert.deepEqual(
      sample,
      seated[0],
      `the rider seated on round ${index + 1} is not the rider seated on round 1`,
    );
  }
});

test('two riders in one scene cost two riders, and neither takes the other with them', () => {
  // The shape a couch session actually holds: both rigs live at once, and
  // dismissing the second must leave the first exactly as it was. Sharing —
  // a cached geometry, a module-level material — would show up here as the
  // second rider costing less than the first, or as the first losing
  // something when the second left.
  const scene = new THREE.Scene();
  const first = seatRider(scene, CHARACTER_IDS[0]);
  const alone = census(scene);

  const second = seatRider(scene, CHARACTER_IDS[1]);
  const together = census(scene);
  assert.ok(
    together.meshes > alone.meshes,
    'the second rider added no meshes, so nothing was really seated',
  );

  scene.remove(second.group);
  second.dispose();
  assert.deepEqual(
    census(scene),
    alone,
    'dismissing the second rider did not leave the first rider’s scene alone',
  );

  scene.remove(first.group);
  first.dispose();
  assert.equal(census(scene).objects, 1, 'the scene did not empty');
});
