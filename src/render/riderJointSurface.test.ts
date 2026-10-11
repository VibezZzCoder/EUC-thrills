/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { createPlaceholderRider, createStanceInput } from './rider.ts';
import { WYLDIST_LOOK } from './wyldistLook.ts';

function seamError(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  let worst = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const side of ['left', 'right']) for (const [upperName, lowerName, rows] of [
    ['hip', 'knee', WYLDIST_LOOK.profiles.shin.length],
    ['shoulder', 'elbow', WYLDIST_LOOK.profiles.forearm.length],
  ] as const) {
    const upper = root.getObjectByName(`rider-${upperName}-${side}`)!;
    const lower = root.getObjectByName(`rider-${lowerName}-${side}`)!;
    const upperMesh = upper.children.find(o => (o as THREE.Mesh).isMesh) as THREE.Mesh;
    const lowerMesh = lower.children.find(o => (o as THREE.Mesh).isMesh) as THREE.Mesh;
    const p = upperMesh.geometry.getAttribute('position'), q = lowerMesh.geometry.getAttribute('position');
    const n = WYLDIST_LOOK.density!.limb!;
    for (let i = 0; i < n; i++) {
      a.fromBufferAttribute(p, i).applyMatrix4(upperMesh.matrixWorld);
      b.fromBufferAttribute(q, (rows - 1) * n + i).applyMatrix4(lowerMesh.matrixWorld);
      worst = Math.max(worst, a.distanceTo(b));
    }
  }
  return worst;
}

test('Wyldist elbow and knee surfaces remain welded through composed riding poses', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const stance = createStanceInput();
    for (const roll of [-.7, -.25, 0, .25, .7]) for (const crouch of [0, .4, 1])
    for (const pitch of [-.65, 0, .55]) for (const crash of [0, 1]) {
      Object.assign(stance, { rollAngle: roll, riderPitch: pitch,
        torsoPitch: pitch + .08, crouch, crash, technicalTurn: roll, lookYaw: .7 });
      rider.pelvis.rotation.z = -roll * .66;
      rider.applyStanceReaction(stance);
      assert.ok(seamError(rider.root) < 1e-6, `visible seam separated at ${roll}/${crouch}/${pitch}/${crash}`);
    }
    // A detached lower limb must fail the same world-space predicate.
    const knee = rider.root.getObjectByName('rider-knee-left')!;
    knee.position.y -= .008;
    assert.ok(seamError(rider.root) > .0079, 'guard failed to detect an 8 mm detached knee');
  } finally { rider.dispose(); }
});

test('welded surfaces return exactly to a previously drawn pose without accumulating drift', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  try {
    const stance = createStanceInput();
    rider.applyStanceReaction(stance);
    const buffers = (): number[][] => {
      const result: number[][] = [];
      rider.root.traverse(o => { const g = (o as THREE.Mesh).geometry;
        if (g) result.push(Array.from(g.getAttribute('position').array)); });
      return result;
    };
    const before = buffers();
    for (let i = 0; i < 25; i++) rider.applyStanceReaction({ ...stance,
      rollAngle: .7, crouch: 1, riderPitch: .5 });
    rider.applyStanceReaction(stance);
    assert.deepEqual(buffers(), before);
  } finally { rider.dispose(); }
});

test('shirt folds remain local through composed poses and cannot stretch towards a knee', () => {
  const rider = createPlaceholderRider(WYLDIST_LOOK);
  const reference = createPlaceholderRider({ ...WYLDIST_LOOK, drapedHem: false });
  const torsoOf = (pelvis: THREE.Object3D): THREE.Mesh => pelvis.children.find(child => {
    const mesh = child as THREE.Mesh;
    return mesh.isMesh && mesh.castShadow && (mesh.material as THREE.MeshStandardMaterial).map;
  }) as THREE.Mesh;
  try {
    const positions = torsoOf(rider.pelvis).geometry.getAttribute('position');
    const rest = torsoOf(reference.pelvis).geometry.getAttribute('position');
    // Side rows are common to both builds; the reference alone has a bottom cap.
    const count = WYLDIST_LOOK.profiles.torso.length * (WYLDIST_LOOK.density!.torso! + 1);
    const point = new THREE.Vector3(), base = new THREE.Vector3();
    const displacement = (): number => {
      let maximum = 0;
      for (let i = 0; i < count; i++) {
        point.fromBufferAttribute(positions, i); base.fromBufferAttribute(rest, i);
        const distance = point.distanceTo(base);
        if (base.y > .22) assert.ok(distance < 1e-7, 'drape altered the upper shirt or chest');
        maximum = Math.max(maximum, distance);
      }
      return maximum;
    };
    let moved = 0;
    const stance = createStanceInput();
    for (const roll of [-.7, 0, .7]) for (const crouch of [0, .4, 1])
    for (const pitch of [-.65, 0, .55]) {
      rider.pelvis.rotation.z = -roll * .66;
      rider.applyStanceReaction({ ...stance, rollAngle: roll, crouch,
        riderPitch: pitch, torsoPitch: pitch + .08, technicalTurn: roll });
      const distance = displacement();
      assert.ok(distance <= .090001, `shirt stretched ${distance} m away from its rest surface`);
      moved = Math.max(moved, distance);
    }
    assert.ok(moved > .003, 'the sweep must actually exercise a cloth correction');
    positions.setY(0, rest.getY(0) - .15);
    assert.ok(displacement() > .149, 'the guard missed a shirt stretched towards the knee');
  } finally { rider.dispose(); reference.dispose(); }
});
