/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import {
  RD_CHEST,
  RD_FOOT_L,
  RD_FOOT_R,
  RD_HAND_L,
  RD_HAND_R,
  RD_HEAD,
  RD_HIP_L,
  RD_HIP_R,
  RD_PELVIS,
  RD_SHOULDER_L,
  RD_SHOULDER_R,
} from '../simulation/ragdoll.ts';
import { createBlockoutEUC } from './euc.ts';
import { createPlaceholderRider, createStanceInput } from './rider.ts';
import { createRidingRig } from './ridingRig.ts';

test('the stopped pedal-side boot follows the complete machine roll', () => {
  const scene = new THREE.Group();
  const euc = createBlockoutEUC();
  const rider = createPlaceholderRider();
  scene.add(euc.group, rider.root);

  const stance = createStanceInput();
  stance.restFactor = 1;
  stance.pedalRoll = RIDER_BLOCKOUT.restWheelLean;
  euc.group.rotation.z = stance.pedalRoll;
  rider.applyStanceReaction(stance);
  scene.updateMatrixWorld(true);

  const rightPedal = scene.getObjectByName('euc-pedal-right');
  const rightKnee = scene.getObjectByName('rider-knee-right');
  const rightAnkle = scene.getObjectByName('rider-ankle-right');
  const leftAnkle = scene.getObjectByName('rider-ankle-left');
  assert.ok(rightPedal && rightKnee && rightAnkle && leftAnkle, 'the rest-contact joints exist');

  const pedalPosition = rightPedal.getWorldPosition(new THREE.Vector3());
  const pedalUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
    rightPedal.getWorldQuaternion(new THREE.Quaternion()),
  );
  const expectedAnkle = pedalPosition.addScaledVector(pedalUp, RIDER_BLOCKOUT.ankleAbovePedal);
  const actualAnkle = rightAnkle.getWorldPosition(new THREE.Vector3());
  assert.ok(
    actualAnkle.distanceTo(expectedAnkle) < 1e-6,
    `right ankle missed its tilted pedal by ${actualAnkle.distanceTo(expectedAnkle)} m`,
  );
  const kneePosition = rightKnee.getWorldPosition(new THREE.Vector3());
  const padOuterFace = WHEEL.shellWidth / 2 + WHEEL.padThickness;
  assert.ok(
    kneePosition.x < -padOuterFace,
    `right knee at ${kneePosition.x} m still crosses the ${-padOuterFace} m pad edge`,
  );

  const grounded = leftAnkle.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(grounded.x - RIDER_BLOCKOUT.restFootOutboard) < 1e-6);
  assert.ok(Math.abs(grounded.y - RIDER_BLOCKOUT.ankleAbovePedal) < 1e-6);
  assert.ok(Math.abs(grounded.z + RIDER_BLOCKOUT.restFootBack) < 1e-6);

  rider.dispose();
  euc.dispose();
});

test('each exposed pedal has geometry joining its tread to the shell skirt', () => {
  const euc = createBlockoutEUC();
  for (const side of ['left', 'right'] as const) {
    const pedal = euc.group.getObjectByName(`euc-pedal-${side}`);
    assert.ok(pedal instanceof THREE.Mesh, `${side} pedal exists`);
    pedal.geometry.computeBoundingBox();
    const bounds = pedal.geometry.boundingBox!;
    const requiredRise = WHEEL.tyreDiameter / 2 - WHEEL.pedalHeight;
    assert.ok(
      bounds.max.y >= requiredRise - 1e-6,
      `${side} pedal stops ${requiredRise - bounds.max.y} m short of the shell`,
    );
  }
  euc.dispose();
});

test('gentle and hard low-speed turns use different body mechanics', () => {
  const rider = createPlaceholderRider();
  const stance = createStanceInput();

  // Type 1: a gentle analog turn rotates hips and shoulders toward the line.
  stance.turnTwist = -0.12;
  stance.lookYaw = -0.18;
  rider.applyStanceReaction(stance);
  assert.equal(rider.pelvis.rotation.y, stance.turnTwist);
  assert.equal(rider.neck.rotation.y, stance.lookYaw);

  // Type 2: hard low-speed right turn. The torso faces forward while the
  // wheel/lower body commit; the OUTSIDE (left) leg bends and the inside
  // (right) leg stays long, matching the supplied real-rider observation.
  stance.turnTwist = 0;
  stance.lookYaw = -0.18;
  stance.rollAngle = -0.62;
  stance.technicalTurn = -1;
  rider.applyStanceReaction(stance);
  const leftHip = rider.root.getObjectByName('rider-hip-left');
  const rightHip = rider.root.getObjectByName('rider-hip-right');
  const leftKnee = rider.root.getObjectByName('rider-knee-left');
  const rightKnee = rider.root.getObjectByName('rider-knee-right');
  const leftAnkle = rider.root.getObjectByName('rider-ankle-left');
  const rightAnkle = rider.root.getObjectByName('rider-ankle-right');
  assert.ok(leftHip && rightHip && leftKnee && rightKnee && leftAnkle && rightAnkle);
  assert.equal(rider.pelvis.rotation.y, 0, 'hard technique keeps the torso forward');
  assert.ok(
    leftHip.position.y < rightHip.position.y - 0.05,
    `outside hip ${leftHip.position.y} should sit below inside ${rightHip.position.y}`,
  );
  rider.root.updateMatrixWorld(true);
  const kneeFlex = (hip: THREE.Object3D, knee: THREE.Object3D, ankle: THREE.Object3D) => {
    const thigh = hip.getWorldPosition(new THREE.Vector3())
      .sub(knee.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const shin = ankle.getWorldPosition(new THREE.Vector3())
      .sub(knee.getWorldPosition(new THREE.Vector3()))
      .normalize();
    return Math.PI - Math.acos(THREE.MathUtils.clamp(thigh.dot(shin), -1, 1));
  };
  assert.ok(
    kneeFlex(leftHip, leftKnee, leftAnkle) > kneeFlex(rightHip, rightKnee, rightAnkle) + 0.08,
    'outside knee is visibly more flexed than the inside knee',
  );

  rider.dispose();
});

test('the look behind twists the chest and head above boots that stay planted', () => {
  const rider = createPlaceholderRider();
  const stance = createStanceInput();

  // The neutral riding baseline the reverse offsets are measured against.
  rider.applyStanceReaction(stance);
  rider.root.updateMatrixWorld(true);
  const leftAnkle = rider.root.getObjectByName('rider-ankle-left')!;
  const rightAnkle = rider.root.getObjectByName('rider-ankle-right')!;
  const leftHand = rider.root.getObjectByName('rider-hand-left')!;
  const rightHand = rider.root.getObjectByName('rider-hand-right')!;
  const neutralLeftAnkle = leftAnkle.getWorldPosition(new THREE.Vector3());
  const neutralRightAnkle = rightAnkle.getWorldPosition(new THREE.Vector3());
  const neutralHandSpread = leftHand.getWorldPosition(new THREE.Vector3())
    .distanceTo(rightHand.getWorldPosition(new THREE.Vector3()));
  const neutralHip = rider.pelvis.position.y;
  assert.equal(rider.pelvis.rotation.y, 0, 'forward riding carries no chest twist');
  assert.equal(rider.neck.rotation.y, 0, 'and no head yaw');

  // The full look behind. The chest opens toward the left shoulder, the head
  // turns over it, the arms come wider, the hips drop — and both boots stay
  // exactly on their pedals, because the twist is entirely above the hips.
  stance.reverse = 1;
  rider.applyStanceReaction(stance);
  rider.root.updateMatrixWorld(true);

  assert.ok(
    Math.abs(rider.pelvis.rotation.y - RIDER_BLOCKOUT.reverseTorsoTwist) < 1e-9,
    `chest twist is ${rider.pelvis.rotation.y}, not ${RIDER_BLOCKOUT.reverseTorsoTwist}`,
  );
  assert.ok(
    Math.abs(rider.neck.rotation.y - RIDER_BLOCKOUT.reverseHeadYaw) < 1e-9,
    `head yaw is ${rider.neck.rotation.y}, not ${RIDER_BLOCKOUT.reverseHeadYaw}`,
  );
  assert.ok(
    Math.abs(neutralHip - rider.pelvis.position.y - RIDER_BLOCKOUT.reverseSquat) < 1e-9,
    'the knees flex by exactly the reverse squat',
  );
  const reverseHandSpread = leftHand.getWorldPosition(new THREE.Vector3())
    .distanceTo(rightHand.getWorldPosition(new THREE.Vector3()));
  assert.ok(
    reverseHandSpread > neutralHandSpread + RIDER_BLOCKOUT.reverseArmSplay,
    `hands spread ${reverseHandSpread} m, from ${neutralHandSpread} m`,
  );
  assert.ok(
    leftAnkle.getWorldPosition(new THREE.Vector3()).distanceTo(neutralLeftAnkle) < 1e-6,
    'the left boot never left its pedal',
  );
  assert.ok(
    rightAnkle.getWorldPosition(new THREE.Vector3()).distanceTo(neutralRightAnkle) < 1e-6,
    'the right boot never left its pedal',
  );

  // While reversing, the head look crossfades to the shoulder check instead of
  // adding the steer glance on top — full lock cannot stack into an owl pose.
  stance.lookYaw = 0.42;
  rider.applyStanceReaction(stance);
  assert.ok(
    Math.abs(rider.neck.rotation.y - RIDER_BLOCKOUT.reverseHeadYaw) < 1e-9,
    'a full-lock steer does not add to the completed shoulder check',
  );
  stance.lookYaw = 0;

  // The rest stance and a crash both suppress the look: a rider standing
  // beside the wheel is not checking behind a wheel they are not on.
  stance.restFactor = 1;
  rider.applyStanceReaction(stance);
  assert.equal(rider.pelvis.rotation.y, 0, 'the rest stance suppresses the twist');
  stance.restFactor = 0;
  stance.crash = 1;
  rider.applyStanceReaction(stance);
  assert.equal(rider.pelvis.rotation.y, 0, 'a crash suppresses the twist');

  rider.dispose();
});

test('the rig hands the reverse blend over and drops the lead shoulder', () => {
  const rig = createRidingRig();
  const pose = createPose();

  rig.apply(pose);
  const neutralRoll = rig.rider.pelvis.rotation.z;

  pose.reverseBlend = 1;
  rig.apply(pose);
  assert.ok(
    Math.abs(rig.rider.pelvis.rotation.y - RIDER_BLOCKOUT.reverseTorsoTwist) < 1e-9,
    'the stance received the blend',
  );
  // A positive rotation about +Z raises the +X (left) side, so the lead
  // shoulder dropping is a NEGATIVE change — the sign a world-space reading of
  // "drops slightly" cannot check by itself.
  assert.ok(
    Math.abs((neutralRoll - rig.rider.pelvis.rotation.z) - RIDER_BLOCKOUT.reverseShoulderRoll)
      < 1e-9,
    `lead shoulder moved by ${neutralRoll - rig.rider.pelvis.rotation.z}`,
  );

  rig.dispose();
});

test('rest and crash suppress the rig-owned reverse shoulder drop too', () => {
  const rig = createRidingRig();
  const pose = createPose();
  pose.reverseBlend = 1;

  // The stance solver suppresses the chest, head, arms, and knees. The rig
  // owns pelvis roll separately, so prove it spends the same effective blend
  // through both transitions instead of leaving one reverse component behind.
  pose.restFactor = 0.5;
  rig.apply(pose);
  assert.ok(
    Math.abs(rig.rider.pelvis.rotation.z + RIDER_BLOCKOUT.reverseShoulderRoll * 0.5) < 1e-9,
    `half-rest shoulder roll is ${rig.rider.pelvis.rotation.z}`,
  );

  pose.restFactor = 0;
  pose.crashBlend = 0.5;
  rig.apply(pose);
  assert.ok(
    Math.abs(rig.rider.pelvis.rotation.z + RIDER_BLOCKOUT.reverseShoulderRoll * 0.5) < 1e-9,
    `half-crash shoulder roll is ${rig.rider.pelvis.rotation.z}`,
  );

  pose.crashBlend = 1;
  rig.apply(pose);
  assert.ok(
    Math.abs(rig.rider.pelvis.rotation.z) < 1e-9,
    'the completed crash clears the shoulder drop',
  );
  assert.equal(rig.rider.pelvis.rotation.y, 0, 'and the stance solver clears the chest twist');

  rig.dispose();
});

test('the grounded boot sole has a rounded outline rather than four box corners', () => {
  const rider = createPlaceholderRider();
  const boot = rider.root.getObjectByName('rider-boot-left');
  assert.ok(boot instanceof THREE.Mesh, 'the named left boot exists');
  const positions = boot.geometry.getAttribute('position');
  let lowest = Infinity;
  for (let i = 0; i < positions.count; i += 1) lowest = Math.min(lowest, positions.getY(i));

  const outline = new Set<string>();
  for (let i = 0; i < positions.count; i += 1) {
    if (Math.abs(positions.getY(i) - lowest) < 1e-6) {
      outline.add(`${positions.getX(i).toFixed(6)},${positions.getZ(i).toFixed(6)}`);
    }
  }
  assert.ok(outline.size >= 12, `sole bottom has only ${outline.size} outline points`);
  rider.dispose();
});

test('a full ragdoll blend puts the pelvis and both boots on their particles', () => {
  // The M15 mapping contract, end to end through the real rig: world-space
  // particles arrive on the pose, the rig re-frames them through the same
  // transform chain it just applied, and the existing two-bone solvers land
  // the ankles on the foot particles exactly — which is what makes the
  // ragdoll anatomically unbreakable by construction.
  const rig = createRidingRig();
  const pose = createPose();
  pose.x = 3;
  pose.y = 0;
  pose.z = 5;
  pose.headingY = 0.7;
  pose.crashBlend = 1;
  pose.ragdollBlend = 1;

  // A standing body two metres ahead of the wheel, authored in the heading
  // frame and rotated into world space exactly as the simulation seeds it.
  const cos = Math.cos(pose.headingY);
  const sin = Math.sin(pose.headingY);
  const world = (index: number, x: number, y: number, z: number): void => {
    pose.ragdoll[index * 3] = pose.x + x * cos + z * sin;
    pose.ragdoll[index * 3 + 1] = y;
    pose.ragdoll[index * 3 + 2] = pose.z - x * sin + z * cos;
  };
  const ahead = 2;
  world(RD_PELVIS, 0, 0.92, ahead);
  world(RD_CHEST, 0, 1.42, ahead);
  world(RD_HEAD, 0, 1.64, ahead);
  world(RD_HIP_L, 0.088, 0.92, ahead);
  world(RD_HIP_R, -0.088, 0.92, ahead);
  world(RD_SHOULDER_L, 0.175, 1.42, ahead);
  world(RD_SHOULDER_R, -0.175, 1.42, ahead);
  world(RD_HAND_L, 0.3, 0.95, ahead + 0.1);
  world(RD_HAND_R, -0.3, 0.95, ahead + 0.1);
  world(RD_FOOT_L, 0.185, 0.16, ahead + 0.05);
  world(RD_FOOT_R, -0.185, 0.16, ahead + 0.05);

  rig.apply(pose);
  rig.group.updateMatrixWorld(true);

  const measured = new THREE.Vector3();
  const expect = (index: number, object: THREE.Object3D, tolerance: number): void => {
    object.getWorldPosition(measured);
    const dx = measured.x - pose.ragdoll[index * 3];
    const dy = measured.y - pose.ragdoll[index * 3 + 1];
    const dz = measured.z - pose.ragdoll[index * 3 + 2];
    const distance = Math.hypot(dx, dy, dz);
    assert.ok(
      distance < tolerance,
      `${object.name} missed its particle by ${distance.toFixed(4)} m`,
    );
  };

  expect(RD_PELVIS, rig.rider.pelvis, 1e-3);
  const ankleLeft = rig.group.getObjectByName('rider-ankle-left');
  const ankleRight = rig.group.getObjectByName('rider-ankle-right');
  assert.ok(ankleLeft && ankleRight, 'both ankles exist');
  expect(RD_FOOT_L, ankleLeft, 1e-3);
  expect(RD_FOOT_R, ankleRight, 1e-3);

  // And the wheel flourish reaches the machine: the whole EUC child lifts by
  // the pop and carries the spin on its machine-only yaw.
  pose.wheelCrashPop = 0.4;
  pose.wheelCrashSpin = 1.1;
  rig.apply(pose);
  assert.equal(rig.euc.group.position.y, 0.4);
  assert.ok(Math.abs(rig.euc.group.rotation.y - 1.1) < 1e-9);

  rig.dispose();
});
