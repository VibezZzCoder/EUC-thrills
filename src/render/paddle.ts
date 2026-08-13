/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import * as THREE from 'three';
import { BLOCKOUT_COLOURS, PADDLE } from '../data/tuning.ts';
import { mergeGeometries, shaded } from './blockoutKit.ts';

/**
 * The paddle, as drawn — M14.
 *
 * **One mesh, and it hangs off the rider's own grip.** The plan's budget
 * verdict allows the paddle two draw calls; one casting `THREE.Mesh` is exactly
 * two (colour and shadow), which is what a merged buffer buys. It is
 * deliberately *not* merged into the glove geometry: that would weld it to the
 * hand material, make it undisposable and unhideable on its own, and force the
 * ghost rider to carry a paddle it never swings.
 *
 * **It is a child of the grip group, not of the rider root, and that is the
 * owner's call in geometry.** The paddle stays in the rider's hand through the
 * M15 crash ragdoll — no drop state, no new physics, matching the wheel's own
 * spin-out flourish — and the way to get that for nothing is to attach it to
 * the thing the ragdoll already poses. A paddle on the root would hang in the
 * air beside a tumbling rider.
 *
 * **The shaft is aimed at the simulation's own head position every frame.** The
 * hit test is a swept segment through a point the swing arithmetic computes
 * (`simulation/paddle.ts`), and the surest way to keep the drawn thing and the
 * hit thing from parting company is for the drawn thing to be *pointed at* the
 * hit thing rather than derived from a second, similar-looking calculation.
 * What is left over — the arm not reaching exactly where the swing wanted the
 * grip — moves the head by centimetres against a strike radius of half a metre,
 * and `tests/m14.spec.ts` measures it rather than assuming it.
 *
 * Geometry is authored along **+Z**, so the group's own yaw is the swing angle
 * with no offset to remember: at yaw zero the paddle points the way the rider
 * is facing, exactly as everything else in this project does.
 */

export interface PaddleView {
  readonly group: THREE.Group;
  /**
   * Point the shaft at a world position, and show or hide the whole thing.
   *
   * `headWorld` is the simulation's head centre and `blend` is how committed
   * the arm is to the swing, 0..1. Passing `null` hides the paddle, which is
   * what a rider not carrying one looks like.
   *
   * **At rest it is carried, not aimed**, and that was a real defect the first
   * browser look found: the simulation's idle head sits in the swing plane, out
   * to the rider's right at chest height, so a paddle aimed at it stood
   * permanently horizontal like a lance. Nothing about that is wrong in the
   * simulation — an idle paddle never sweeps and its head position is never
   * queried — it is wrong on screen, which is the only place it exists.
   *
   * `groundY` is the world height of the ground under the rider; the tip is
   * kept above it. The owner's second ride found the carried paddle buried in
   * the grass through a forward carve — the carry hangs the shaft nearly
   * straight down off a grip that a carve crouch drops by most of a metre.
   */
  aim(headWorld: THREE.Vector3 | null, blend: number, groundY: number): void;
  /** Distance from the grip to the centre of the padded face, metres. */
  readonly shaftLength: number;
  dispose(): void;
}

/**
 * How much of `PADDLE.reach` is shaft rather than arm.
 *
 * The swing pivot is the shoulder and the reach is measured from there, but the
 * *hand* is only an arm's length out — so the paddle itself is the remainder.
 * A fraction rather than a metre value because it is the one number here that
 * has to follow `PADDLE.reach` when the owner drags that slider: a fixed shaft
 * against a longer reach would leave the head short of where the hit test says
 * it is, and the gap would grow silently with every centimetre.
 */
const SHAFT_FRACTION = 0.62;

/** Radius of the shaft, metres. A padded handle, not a broom. */
const SHAFT_RADIUS = 0.023;

/** Vertex shades: a dark grip so the pale face is what the eye finds. */
const GRIP_SHADE = 0.42;
const SHAFT_SHADE = 0.72;
const FACE_SHADE = 1.15;

/**
 * How the paddle sits in the hand when nobody is swinging it.
 *
 * Down and a little back, in the grip's own frame — the shaft continues the
 * forearm rather than crossing it, which is how anybody carries a bat. The grip
 * hangs at the rider's side, so "down" here is the rider's own down and it
 * follows them through a lean, a crouch and the crash ragdoll for free.
 */
const CARRY = new THREE.Quaternion().setFromEuler(
  // **Positive about X, and the sign was wrong the first time.** The grip sits
  // on the elbow, whose local −Y runs down the forearm, and `Rx(θ)` sends the
  // shaft's +Z to `(0, −sin θ, cos θ)` — so a *positive* angle carries it down
  // the arm and a negative one stands it up behind the rider's head, which is
  // exactly what the first browser look showed.
  new THREE.Euler(Math.PI * 0.42, 0, -0.18, 'XYZ'),
);

/**
 * How far above the ground the tip must stay, metres.
 *
 * The margin also absorbs what the clamp cannot see: the ground height it is
 * given is sampled under the *rider*, and a leaned-over carry hangs the tip
 * half a metre to the side of that sample, where a slope may differ.
 */
const GROUND_CLEARANCE = 0.08;

// Scratch for the ground clamp — module-level, filled every frame, never held.
const parentQuat = new THREE.Quaternion();
const worldQuat = new THREE.Quaternion();
const liftQuat = new THREE.Quaternion();
const shaftDir = new THREE.Vector3();
const liftedDir = new THREE.Vector3();

export function createPaddle(): PaddleView {
  const group = new THREE.Group();
  group.name = 'rider-paddle';

  const shaftLength = PADDLE.reach * SHAFT_FRACTION;
  const faceRadius = PADDLE.headRadius;
  const parts: THREE.BufferGeometry[] = [];

  // The grip: a short, slightly fatter section at the hand end.
  const gripLength = Math.min(0.14, shaftLength * 0.35);
  const grip = new THREE.CylinderGeometry(SHAFT_RADIUS * 1.25, SHAFT_RADIUS * 1.1, gripLength, 8);
  grip.rotateX(Math.PI / 2);
  grip.translate(0, 0, gripLength / 2);
  parts.push(shaded(grip, GRIP_SHADE));

  // The shaft, running from the grip out to the face.
  const shaftSpan = shaftLength - gripLength;
  const shaft = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS * 1.1, shaftSpan, 8);
  shaft.rotateX(Math.PI / 2);
  shaft.translate(0, 0, gripLength + shaftSpan / 2);
  parts.push(shaded(shaft, SHAFT_SHADE));

  // The padded face: a flat disc across the swing, so the thing the player aims
  // reads as a face rather than as the end of a stick. Its axis is the rider's
  // vertical, which is what makes a horizontal sweep present the flat of it.
  const face = new THREE.CylinderGeometry(faceRadius, faceRadius, 0.055, 18);
  face.translate(0, 0, shaftLength);
  parts.push(shaded(face, FACE_SHADE));

  // A rim at a darker shade, so the face has an edge at chase distance rather
  // than fading into a bright blob against a bright sky.
  const rim = new THREE.TorusGeometry(faceRadius, 0.016, 6, 20);
  rim.translate(0, 0, shaftLength);
  parts.push(shaded(rim, SHAFT_SHADE));

  const geometry = mergeGeometries(parts);
  const material = new THREE.MeshStandardMaterial({
    color: BLOCKOUT_COLOURS.paddle,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rider-paddle-mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.visible = false;

  return {
    group,
    shaftLength,

    aim(headWorld: THREE.Vector3 | null, blend: number, groundY: number): void {
      if (headWorld === null) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const committed = blend < 0 ? 0 : blend > 1 ? 1 : blend;
      // **The world matrix has to be refreshed first.** `Object3D.lookAt` reads
      // this object's own world position and the parent's world rotation, and
      // at this point in the render frame the rig has just been posed and
      // nothing has rendered since — so both are one frame stale. Aiming
      // against them points the paddle at where the hand *was*, which is a
      // lag nobody would attribute to a missing matrix update.
      group.updateWorldMatrix(true, false);
      // Authored along +Z, and `lookAt` points a non-camera object's +Z at its
      // target, so aiming is one call with no offset to remember. It also
      // divides out the parent's rotation itself, which is what keeps this
      // correct while the grip is being thrown around by the crash ragdoll.
      group.lookAt(headWorld);
      // Then slerped back toward the carried pose by however little of the
      // swing is under way. `blend` eases in and out of the cycle, so the
      // paddle rises out of the carry and settles back into it rather than
      // snapping between the two — and at rest it is exactly carried.
      if (committed < 1) group.quaternion.slerp(CARRY, 1 - committed);

      // **And never through the ground.** The carry hangs the shaft nearly
      // straight down, and a forward carve crouches the grip most of a metre
      // lower — the owner's second ride found the tip ploughing the grass
      // through every leaned turn. A steeper carry angle only moves the crouch
      // depth at which it recurs, so the fix is a clamp: if the tip would dip
      // below the ground, the shaft is pitched up in its own vertical plane —
      // grip fixed, heading kept — until it clears. During a committed swing
      // the tip is at the simulation's head, a chest-high point the clamp
      // never touches, so the drawn paddle and the swept paddle still agree
      // (`tests/m14.spec.ts` measures that gap with the phase active).
      const parent = group.parent;
      if (parent === null) return;
      parentQuat.setFromRotationMatrix(parent.matrixWorld);
      worldQuat.multiplyQuaternions(parentQuat, group.quaternion);
      shaftDir.set(0, 0, 1).applyQuaternion(worldQuat);
      // Tip = grip + dir * length, plus the face's own extent past the shaft.
      // The full radius, not a sliver of it: the face is a disc whose radial
      // edge hangs *below* the tip point whenever the shaft is pitched, and
      // the first look at this clamp had the rim still combing the grass.
      const tipLength = shaftLength + faceRadius;
      const gripY = group.matrixWorld.elements[13];
      const minDirY = (groundY + GROUND_CLEARANCE - gripY) / tipLength;
      if (shaftDir.y >= minDirY || minDirY >= 1) return;
      const horizontal = Math.hypot(shaftDir.x, shaftDir.z);
      if (horizontal < 1e-4) return;
      const scale = Math.sqrt(1 - minDirY * minDirY) / horizontal;
      liftedDir.set(shaftDir.x * scale, minDirY, shaftDir.z * scale);
      liftQuat.setFromUnitVectors(shaftDir, liftedDir);
      worldQuat.premultiply(liftQuat);
      group.quaternion.copy(parentQuat.invert()).multiply(worldQuat);
    },

    dispose(): void {
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
}
