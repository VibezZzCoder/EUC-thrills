/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { EUC, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { copyPose, createPose, type EucPose } from '../simulation/EucController.ts';
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
import { riderRollFor } from '../simulation/riderLean.ts';
import { createBlockoutEUC } from './euc.ts';
import { createPlaceholderRider, createStanceInput } from './rider.ts';
import { COOL_RIDER_LOOK, DRUNKARD_LOOK } from './riderLook.ts';
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

// ---------------------------------------------------------------------------
// M29 — the ride style reaches the rig, and only the rider with a table
// ---------------------------------------------------------------------------

test("the style moves the Drunkard's body and leaves Cool Rider's exactly where it was", () => {
  // Phase 1's own proof, stated as pose deltas: **a rider who weaves in Cool
  // Rider's clothes is the cheapest possible evidence that the style is keyed
  // to the seat and not to the geometry** (`docs/PLANS.md` §29.9). The same
  // four channels are written into two rigs that differ only by a look, and
  // the joints the sway owns move on one and are bit-identical on the other —
  // because `look.motion ?? MOTION_STILL` makes every one of those terms a
  // product of two zeros for everybody else (safeguard S5).
  //
  // The two hundred pose assertions above this line are the other half of the
  // claim, and they are asserted the way they always were: by still passing.
  const drunk = createRidingRig(DRUNKARD_LOOK);
  const cool = createRidingRig(COOL_RIDER_LOOK);
  const motion = DRUNKARD_LOOK.motion!;

  // One ordinary riding pose, carrying a carve so the counter-roll the
  // over-lean forgets a share of is actually on the pelvis.
  const still = createPose();
  still.speed = 12;
  still.rollAngle = 0.25;
  still.riderRoll = 0.2;

  const styled = createPose();
  copyPose(still, styled);
  styled.styleSway = 1;
  styled.styleYaw = 0.05;
  styled.styleRoll = 0.05;
  styled.styleStumble = 1;

  const read = (rig: ReturnType<typeof createRidingRig>, pose: EucPose) => {
    rig.apply(pose);
    rig.group.updateMatrixWorld(true);
    const left = rig.group.getObjectByName('rider-hand-left')!;
    const right = rig.group.getObjectByName('rider-hand-right')!;
    return {
      pelvisRoll: rig.rider.pelvis.rotation.z,
      neckTilt: rig.rider.neck.rotation.z,
      machineYaw: rig.euc.group.rotation.y,
      machineRoll: rig.euc.group.rotation.z,
      handSpread: left.getWorldPosition(new THREE.Vector3())
        .distanceTo(right.getWorldPosition(new THREE.Vector3())),
    };
  };

  const drunkStill = read(drunk, still);
  const drunkStyled = read(drunk, styled);
  const coolStill = read(cool, still);
  const coolStyled = read(cool, styled);

  // The pelvis: the sway rolls it into the weave, negative toward +X, which is
  // the rider's left and the side a positive sway is turning toward. Nothing
  // else on this axis moves between the two poses, so the difference is the
  // table's own amplitude exactly.
  assert.ok(
    Math.abs((drunkStyled.pelvisRoll - drunkStill.pelvisRoll) + motion.swayPelvisRoll) < 1e-9,
    `the sway rolled his pelvis by ${drunkStyled.pelvisRoll - drunkStill.pelvisRoll}`
      + ` instead of ${-motion.swayPelvisRoll}`,
  );
  // The head tilts with it. `wobbleSway` is zero in this pose, so the stagger's
  // loll contributes nothing and the tilt is the sway's alone.
  assert.ok(
    Math.abs(drunkStyled.neckTilt + motion.swayHeadTilt) < 1e-9,
    `the sway tilted his head by ${drunkStyled.neckTilt} instead of ${-motion.swayHeadTilt}`,
  );
  assert.ok(Math.abs(drunkStill.neckTilt) < 1e-9, 'and a still pose leaves the head level');

  // Cool Rider: a double zero on both joints. Not "small" — identical, because
  // the terms are multiplications by a table of zeros rather than a branch.
  assert.equal(coolStyled.pelvisRoll, coolStill.pelvisRoll, "the sway reached Cool Rider's pelvis");
  assert.equal(coolStyled.neckTilt, coolStill.neckTilt, "the sway reached Cool Rider's head");
  // `=== 0` rather than `assert.equal`: this axis is a product of the still
  // table, so it lands on a negative zero, and the render layer has no reason
  // to normalise one — the controller does that for the channels a *digest*
  // hashes, and a rendered rotation of -0 is the same rotation.
  assert.ok(coolStyled.neckTilt === 0, `Cool Rider's head tilted by ${coolStyled.neckTilt}`);

  // The stumble is the *controller's*, keyed to the seat, so the machine's yaw
  // and roll take it on either rig — a sober seat simply never sends one.
  for (const [label, styledRead, stillRead] of [
    ['the Drunkard', drunkStyled, drunkStill],
    ['Cool Rider', coolStyled, coolStill],
  ] as const) {
    assert.ok(
      Math.abs(styledRead.machineYaw - styled.styleYaw) < 1e-9,
      `${label}: the machine yawed ${styledRead.machineYaw} for a ${styled.styleYaw} stumble`,
    );
    assert.ok(Math.abs(stillRead.machineYaw) < 1e-9, `${label}: a still pose yawed the machine`);
    assert.ok(
      Math.abs((styledRead.machineRoll - stillRead.machineRoll) + styled.styleRoll) < 1e-9,
      `${label}: the machine rolled ${styledRead.machineRoll - stillRead.machineRoll}`
        + ` for a ${styled.styleRoll} stumble`,
    );
  }

  // And the stumble borrows the bracing stance: its envelope arrives as a
  // wobble *fight* with none of a wobble's energy, so the arms come out on
  // both rigs — wider on his, by the stagger's multiplier.
  const drunkOpening = drunkStyled.handSpread - drunkStill.handSpread;
  const coolOpening = coolStyled.handSpread - coolStill.handSpread;
  assert.ok(coolOpening > 0.01, `the borrowed brace opened Cool Rider's arms by only ${coolOpening} m`);
  assert.ok(
    drunkOpening > coolOpening,
    `the stagger opened his arms by ${drunkOpening} m against Cool Rider's ${coolOpening} m`,
  );

  drunk.dispose();
  cool.dispose();
});

// ---------------------------------------------------------------------------
// M30 Phase 3 — the lean schedule, at the pelvis (`docs/PLANS.md` §30.3c)
// ---------------------------------------------------------------------------

test('the lean schedule arrives at the pelvis, and the over-lean composes with it', () => {
  // The rig's half of item 3. `riderRoll` reaches `ridingRig.ts` **already
  // scheduled** — the rig spends the difference `-(riderRoll - rollAngle)` and
  // never re-derives it — so the whole of the change here is that the
  // difference it is handed shrinks with speed and reaches zero at the top.
  //
  // The Drunkard is the interesting rider because his `motion.overLean` of
  // 0.25 forgets a quarter of that counter-roll (M29 S5). It **composes**
  // rather than fighting the schedule: a quarter of a shrinking number, which
  // at the top of the schedule is a quarter of nothing, so at speed he
  // converges with everybody else and the joke costs the pose nothing.
  const drunk = createRidingRig(DRUNKARD_LOOK);
  const sober = createRidingRig(COOL_RIDER_LOOK);
  const motion = DRUNKARD_LOOK.motion!;
  assert.equal(motion.overLean, 0.25, 'the share of the counter-roll he forgets');

  // A real carve at the pavement grip ceiling, posed through the controller's
  // own schedule rather than by hand — a hard-coded `riderRoll` here would be
  // this file agreeing with a number instead of with the simulation.
  const rollAngle = Math.atan(EUC.maxLateralG);
  const pose = (speed: number): EucPose => {
    const target = createPose();
    target.speed = speed;
    target.rollAngle = rollAngle;
    // `riderLean` is given the wheel's own roll here, which is the pose of an
    // *unsaturated* corner — the two are equal to the bit below the ordinary
    // ceiling, and this file is about the Drunkard's `overLean` share of the
    // hinge rather than about how large the hinge gets. The controller asserts
    // the saturated case (M30 Phase 2, `EucController.test.ts`).
    target.riderRoll = riderRollFor(rollAngle, rollAngle, 0, speed, EUC);
    return target;
  };
  const hinge = (rig: ReturnType<typeof createRidingRig>, target: EucPose): number => {
    rig.apply(target);
    return rig.rider.pelvis.rotation.z;
  };

  // **At the top of the schedule: one line, and nobody counter-rolls.** At the
  // shipped `carveLeanShareTop` of 1.0 the rider takes the whole of the lean,
  // so the difference is zero and 0.75 of zero is zero — the Drunkard's hinge
  // is the sober rider's exactly, which is the "he converges" claim.
  const committed = pose(EUC.carveLeanFullSpeed + 2);
  assert.equal(committed.riderRoll, rollAngle, 'the scheduled pose is one line with the wheel');
  assert.ok(Math.abs(hinge(sober, committed)) < 1e-15, 'the sober pelvis hinge is zero');
  assert.ok(Math.abs(hinge(drunk, committed)) < 1e-15, 'and so is his');

  // **In the mid band: his hinge is 0.75 of the sober rider's**, on the same
  // pose, because that is the whole of what `overLean` does.
  const midSpeed = (EUC.carveLeanSpeed + EUC.carveLeanFullSpeed) / 2;
  const mid = pose(midSpeed);
  const soberMid = hinge(sober, mid);
  const drunkMid = hinge(drunk, mid);
  assert.ok(
    Math.abs(soberMid + (mid.riderRoll - rollAngle)) < 1e-12,
    `the sober hinge is the difference the schedule handed it: ${soberMid}`,
  );
  assert.ok(Math.abs(soberMid) > 0.1, `and it is a real counter-roll at ${midSpeed} m/s: ${soberMid}`);
  assert.ok(
    Math.abs(drunkMid - soberMid * (1 - motion.overLean)) < 1e-12,
    `he counter-rolls ${drunkMid} where the sober rider counter-rolls ${soberMid}`,
  );

  // And the slow band is untouched: the counter-roll down here is what M16
  // shipped, and it is the largest of the three because the share is smallest.
  const slow = pose(EUC.carveLeanSpeed - 1);
  const soberSlow = hinge(sober, slow);
  assert.ok(
    Math.abs(soberSlow + rollAngle * (EUC.riderUpperBodyRollFactor - 1)) < 1e-12,
    'the slow band counter-rolls the pre-M30 amount',
  );
  assert.ok(
    Math.abs(soberSlow) > Math.abs(soberMid) && Math.abs(soberMid) > 1e-12,
    'and the counter-roll shrinks monotonically as the schedule climbs',
  );

  drunk.dispose();
  sober.dispose();
});
