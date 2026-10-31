/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { NEAR_SOLID } from '../data/tuning.ts';
import { createPose, type EucPose } from '../simulation/EucController.ts';
import { createRidingRig } from './ridingRig.ts';
import { riderLook } from './riderLook.ts';

/**
 * The near-solid channel — 1.4.0 ride fixes. `app/nearSolids.test.ts` pins
 * what the sampler answers; this file pins what the rig draws with it: a rig
 * never told draws the pose exactly, a lift raises the whole rig and keeps
 * the planted boot on the contact's ground, and a body posed into a face —
 * leaning into a wall ahead (the owner's second ride, every world), along
 * one, or parked beside one — is drawn just clear of it by its own measured
 * silhouette, and eased back once the face is gone.
 */

const BANDS = NEAR_SOLID.bandHeights;
const COUNT = NEAR_SOLID.directions;
const STANDOFF = 0.26;
/** The tyre radius plus the centimetre the M17 envelope leaves ahead. */
const AHEAD = 0.26;

/**
 * The probe answers for a flat face in the rig's frame: every point `p` with
 * `p · normal ≥ distance` is solid, up to `top` metres high. The face's own
 * outward normal is handed over in world terms, as `app/nearSolids.ts` does.
 */
function wall(pose: EucPose, normalX: number, normalZ: number, distance: number, top = Number.POSITIVE_INFINITY):
  { faces: Float64Array; normals: Float64Array } {
  const faces = new Float64Array(BANDS.length * COUNT).fill(Number.POSITIVE_INFINITY);
  const normals = new Float64Array(2 * BANDS.length * COUNT);
  const sin = Math.sin(pose.headingY);
  const cos = Math.cos(pose.headingY);
  // Outward from the solid, toward the rider, in world terms.
  const worldX = -(normalX * cos + normalZ * sin);
  const worldZ = -(-normalX * sin + normalZ * cos);
  for (let index = 0; index < COUNT; index += 1) {
    const angle = (2 * Math.PI * index) / COUNT;
    const facing = Math.sin(angle) * normalX + Math.cos(angle) * normalZ;
    if (facing < 1e-6) continue;
    const along = distance / facing;
    if (along > NEAR_SOLID.probeDistance) continue;
    for (let band = 0; band < BANDS.length; band += 1) {
      if (BANDS[band] >= top) continue;
      const entry = band * COUNT + index;
      faces[entry] = along;
      normals[2 * entry] = worldX;
      normals[2 * entry + 1] = worldZ;
    }
  }
  return { faces, normals };
}

function tell(rig: ReturnType<typeof createRidingRig>, near: { faces: Float64Array; normals: Float64Array }, seconds = 0): void {
  rig.setNearSolids(0, near.faces, 0, seconds, near.normals);
}

/** How deep the drawn body (below `top`) stands past that face, metres, measured from the pose's own root. */
function intoFace(rig: ReturnType<typeof createRidingRig>, pose: EucPose, normalX: number, normalZ: number,
  distance: number, top = Number.POSITIVE_INFINITY): number {
  rig.group.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  const sin = Math.sin(pose.headingY);
  const cos = Math.cos(pose.headingY);
  let deepest = Number.NEGATIVE_INFINITY;
  rig.rider.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || mesh.name === 'rider-paddle-mesh') return;
    for (let node: THREE.Object3D | null = mesh; node !== null && node !== rig.rider.root; node = node.parent) {
      if (!node.visible) return;
    }
    const position = mesh.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
      if (point.y - pose.y >= top) continue;
      const dx = point.x - pose.x;
      const dz = point.z - pose.z;
      // World to the rig's frame: +X the rider's left, +Z ahead.
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      deepest = Math.max(deepest, localX * normalX + localZ * normalZ - distance);
    }
  });
  return deepest;
}

test('a rig never told of a solid draws the pose exactly, and so does one told of none', () => {
  const rig = createRidingRig();
  try {
    const pose = createPose();
    pose.x = 3.25; pose.y = 0.4; pose.z = -7.5; pose.headingY = 1.1; pose.restFactor = 1;
    rig.apply(pose);
    assert.deepEqual(rig.group.position.toArray(), [3.25, 0.4, -7.5]);
    tell(rig, wall(pose, 0, 1, Number.POSITIVE_INFINITY));
    rig.apply(pose);
    assert.deepEqual(rig.group.position.toArray(), [3.25, 0.4, -7.5]);
    assert.deepEqual([...rig.nearPush], [0, 0]);
  } finally {
    rig.dispose();
  }
});

test('a lift raises the whole drawn rig and the planted boot stays on the contact ground', () => {
  const rig = createRidingRig();
  try {
    const pose = createPose();
    pose.y = 0.18; pose.restFactor = 1;
    const boot = (): number => {
      rig.group.updateMatrixWorld(true);
      const ankle = rig.rider.root.getObjectByName('rider-ankle-left')!;
      return ankle.getWorldPosition(new THREE.Vector3()).y;
    };
    rig.setNearSolids(0, []);
    rig.apply(pose);
    const flat = boot();
    for (const lift of [0.01, 0.03, 0.06, 0.12, 0.18]) {
      rig.setNearSolids(lift, []);
      rig.apply(pose);
      assert.ok(Math.abs(rig.group.position.y - (0.18 + lift)) < 1e-12, `the root sits at ${rig.group.position.y}`);
      const up = boot() - flat;
      // Within the stopped lift `app/nearSolids.ts` leaves (`restLiftMax`) the
      // boot reaches the contact's ground exactly; past the leg's reach it
      // still reaches down, never riding up with the root.
      if (lift <= NEAR_SOLID.restLiftMax + 0.01) assert.ok(Math.abs(up) < 1e-6, `lift ${lift}: the boot is ${up} m up`);
      else assert.ok(up < lift - 0.02, `lift ${lift}: the boot rode up ${up} m with the root`);
    }
  } finally {
    rig.dispose();
  }
});

for (const id of ['cool-rider', 'trollina'] as const) {
  test(`${id}: leaning into a wall ahead, the drawn body stops at it (the owner's second ride)`, () => {
    const rig = createRidingRig(riderLook(id));
    try {
      const pose = createPose();
      pose.x = 12; pose.z = -4; pose.headingY = 0.7;
      for (const lean of [0, 0.15, 0.25, 0.35]) {
        pose.wheelPitch = lean;
        // The control: nothing told, and a forward lean puts the head and
        // hands through the face the wheel is held a tyre radius off.
        rig.setNearSolids(0, []);
        rig.apply(pose);
        const before = intoFace(rig, pose, 0, 1, AHEAD);
        if (lean === 0.35) assert.ok(before > 0.2, `the control lost the defect: ${before.toFixed(3)} m`);
        tell(rig, wall(pose, 0, 1, AHEAD));
        rig.apply(pose);
        const after = intoFace(rig, pose, 0, 1, AHEAD);
        assert.ok(after <= 0.003, `lean ${lean}: ${after.toFixed(4)} m into the wall ahead`);
        // Pushed straight back, never sideways, for a face square ahead.
        const [pushX, pushZ] = rig.nearPush;
        const back = -(pushX * Math.sin(pose.headingY) + pushZ * Math.cos(pose.headingY));
        const across = pushX * Math.cos(pose.headingY) - pushZ * Math.sin(pose.headingY);
        assert.ok(back >= -1e-9 && Math.abs(across) < 0.01, `lean ${lean}: pushed ${back} back, ${across} across`);
      }
    } finally {
      rig.dispose();
    }
  });

  test(`${id}: a wall met at an angle between two probes is still kept out`, () => {
    const rig = createRidingRig(riderLook(id));
    try {
      const pose = createPose();
      pose.wheelPitch = 0.3;
      for (const degrees of [15, -40, 75]) {
        const angle = (degrees * Math.PI) / 180;
        const normalX = Math.sin(angle);
        const normalZ = Math.cos(angle);
        tell(rig, wall(pose, normalX, normalZ, STANDOFF));
        rig.apply(pose);
        const depth = intoFace(rig, pose, normalX, normalZ, STANDOFF);
        // The face's own normal: as tight as square on.
        assert.ok(depth <= 0.003, `${degrees}°: ${depth.toFixed(4)} m into the face`);
      }
    } finally {
      rig.dispose();
    }
  });

  test(`${id}: riding or parked beside the deck's face, the body below its top stays out, the shoulders may pass over`, () => {
    const rig = createRidingRig(riderLook(id));
    try {
      const pose = createPose();
      for (const rest of [0, 0.5, 1]) {
        pose.restFactor = rest;
        for (const side of [1, -1] as const) {
          rig.setNearSolids(0, []);
          rig.apply(pose);
          const control = intoFace(rig, pose, side, 0, STANDOFF, 0.9);
          tell(rig, wall(pose, side, 0, STANDOFF, 0.9));
          rig.apply(pose);
          const depth = intoFace(rig, pose, side, 0, STANDOFF, 0.9);
          assert.ok(depth <= 0.003, `rest ${rest}, ${side > 0 ? 'left' : 'right'}: ${depth.toFixed(4)} m into the face (control ${control.toFixed(3)})`);
          if (rest === 1 && side === 1) assert.ok(control > 0.1, 'the parked control no longer reproduces the first ride\'s defect');
        }
      }
    } finally {
      rig.dispose();
    }
  });
}

test('the push eases back once the face is gone, and a hard reset or a crash snaps it', () => {
  const rig = createRidingRig();
  try {
    const pose = createPose();
    pose.wheelPitch = 0.35;
    const size = (): number => Math.hypot(rig.nearPush[0], rig.nearPush[1]);
    tell(rig, wall(pose, 0, 1, AHEAD), 1 / 60);
    rig.apply(pose);
    const held = size();
    assert.ok(held > 0.2, `the lean was pushed ${held} m`);
    // The wall ends: one frame later most of the push is still there…
    rig.setNearSolids(0, [], 0, 1 / 60);
    rig.apply(pose);
    const next = size();
    assert.ok(next < held && next > 0.6 * held, `one frame after the wall ended the push is ${next} of ${held}`);
    // …and a second later it is gone.
    for (let frame = 0; frame < 60; frame += 1) {
      rig.setNearSolids(0, [], 0, 1 / 60);
      rig.apply(pose);
    }
    assert.ok(size() < 0.001, `a second on, still pushed ${size()} m`);
    // A hard reset (no time) snaps.
    tell(rig, wall(pose, 0, 1, AHEAD), 1 / 60);
    rig.apply(pose);
    rig.setNearSolids(0, []);
    rig.apply(pose);
    assert.equal(size(), 0);
    // A crash is drawn where the pose says, face or not.
    pose.crashBlend = 0.5;
    tell(rig, wall(pose, 0, 1, AHEAD), 1 / 60);
    rig.apply(pose);
    assert.equal(size(), 0);
    assert.deepEqual(rig.group.position.toArray(), [pose.x, pose.y, pose.z]);
  } finally {
    rig.dispose();
  }
});
