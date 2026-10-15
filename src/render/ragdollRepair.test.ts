/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { RIDER, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { createPose } from '../simulation/EucController.ts';
import { RD_CHEST, RD_FOOT_L, RD_FOOT_R, RD_HAND_L, RD_HAND_R, RD_HEAD, RD_HIP_L, RD_HIP_R,
  RD_PELVIS, RD_SHOULDER_L, RD_SHOULDER_R } from '../simulation/ragdoll.ts';
import { compileTightRagHumanTemplate } from '../shared/compiledOccupancy.ts';
import { RIDER_OCCUPANCY } from '../data/tuning.ts';
import { createRidingRig, type RidingRig } from './ridingRig.ts';
import { DRUNKARD_LOOK, RIDER_LOOKS } from './riderLook.ts';
import { createCopRidingRig } from './copRider.ts';

function standing() {
  const p = createPose(); p.crashBlend = 1; p.ragdollBlend = 1;
  const h = RIDER.hipHeight, spine = RIDER_BLOCKOUT.torsoLength, hh = RIDER_BLOCKOUT.torsoWidth * .26, sh = RIDER_BLOCKOUT.shoulderHalfWidth;
  for (const [i, v] of [[RD_PELVIS, [0, h, 0]], [RD_CHEST, [0, h + spine, 0]], [RD_HEAD, [0, h + spine + .22, 0]],
    [RD_HIP_L, [hh, h, 0]], [RD_HIP_R, [-hh, h, 0]], [RD_SHOULDER_L, [sh, h + spine, 0]], [RD_SHOULDER_R, [-sh, h + spine, 0]],
    [RD_HAND_L, [sh + .1, h + .2, .1]], [RD_HAND_R, [-sh - .1, h + .2, .1]], [RD_FOOT_L, [.185, .16, .05]], [RD_FOOT_R, [-.185, .16, .05]]] as const)
    p.ragdoll.set(v, i * 3);
  return p;
}
function position(rig: RidingRig, name: string) { return rig.group.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()); }
function draw(rig: RidingRig, p: ReturnType<typeof createPose>) { rig.apply(p); rig.group.updateMatrixWorld(true); }

test('rag joints publish each final quaternion once instead of notifying Three for intermediate transforms', () => {
  const rig=createRidingRig(),p=standing(),writes=new Map<string,number>();
  for(const side of ['left','right'])for(const joint of ['hip','knee','ankle','shoulder','elbow']) {
    const name=`rider-${joint}-${side}`,q=rig.group.getObjectByName(name)!.quaternion as THREE.Quaternion & {_onChangeCallback():void};
    const notify=q._onChangeCallback.bind(q);q._onChangeCallback=()=>{writes.set(name,(writes.get(name)??0)+1);notify();};
  }
  draw(rig,p);
  for(const [name,count]of writes)assert.equal(count,1,`${name}: an intermediate scene quaternion rebuilt its Euler/matrix`);
  assert.equal(writes.size,10);rig.dispose();
});

test('full-rag target bypass restores every limb on partial and zero-blend reentry', () => {
  const used=createRidingRig(),fresh=createRidingRig(),p=standing();
  p.headingY=.8;p.rollAngle=.35;p.riderPitch=-.2;p.riderTurnTwist=.3;p.wobbleYaw=.2;
  for(let i=0;i<4;i++)draw(used,p);
  for(const blend of [.7,0,.25,1,0]) {
    p.ragdollBlend=blend;p.crashBlend=blend;p.restFactor=0;
    draw(used,p);draw(fresh,p);
    for(const side of ['left','right'])for(const joint of ['hip','knee','ankle','shoulder','elbow']) {
      const name=`rider-${joint}-${side}`,a=used.group.getObjectByName(name)!,b=fresh.group.getObjectByName(name)!;
      assert.ok(a.position.distanceTo(b.position)<1e-10&&a.quaternion.angleTo(b.quaternion)<1e-7,`${name}/${blend}: a bypassed ordinary cache retained a crash transform`);
    }
  }
  used.dispose();fresh.dispose();
});

test('a smooth hand target crossing the elbow pole does not flip the elbow circle', () => {
  const rig = createRidingRig(), p = standing(); draw(rig, p);
  const shoulder = position(rig, 'rider-shoulder-left'), elbows: THREE.Vector3[] = [], gaps: number[] = [];
  for (const dx of [-.0001, 0, .0001]) {
    const target = shoulder.clone().add(new THREE.Vector3(dx, 0, -.3)); p.ragdoll.set(target.toArray(), RD_HAND_L * 3);
    draw(rig, p); elbows.push(position(rig, 'rider-elbow-left'));
    const wrist = new THREE.Vector3(0, -.26, 0).applyMatrix4(rig.group.getObjectByName('rider-elbow-left')!.matrixWorld);
    gaps.push(wrist.distanceTo(target));
  }
  const displacement = elbows[0].distanceTo(elbows[2]);
  assert.ok(displacement < .002, `0.2 mm of hand travel moved the elbow ${displacement} m across its circle`);
  assert.ok(gaps.every(gap => gap < 1e-6), 'a stable elbow still reaches the hand endpoint');
  rig.dispose();
});

test('the full rag frame owns shoulders and released boots instead of inheriting the old machine pose', () => {
  const rig = createRidingRig(), p = standing();
  p.rollAngle = -.35; p.riderRoll = .4; p.riderTurnTwist = .3; p.riderPitch = -.1;
  p.wobbleYaw = .8; p.wobbleRoll = -.5; p.wheelCrashLean = 1.2;
  draw(rig, p);
  for (const [index, name] of [[RD_SHOULDER_L, 'rider-shoulder-left'], [RD_SHOULDER_R, 'rider-shoulder-right']] as const)
    assert.ok(position(rig, name).distanceTo(new THREE.Vector3().fromArray(p.ragdoll, index * 3)) < 1e-6, 'the visible shoulder is the trunk origin the arm targets used');
  for (const side of ['left', 'right']) {
    const ankle = rig.group.getObjectByName(`rider-ankle-${side}`)!;
    assert.ok(ankle.quaternion.toArray().every(Number.isFinite), 'released ankle uses a finite free boot frame');
    const bootUp = new THREE.Vector3(0, 1, 0).applyQuaternion(ankle.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(bootUp.y > .9, 'a released sole follows gravity rather than the machine bank');
  }
  rig.dispose();
});

test('contact-displaced endpoints retain fixed bone lengths and anatomical contact folds, with certified boot containment', () => {
  const rig = createRidingRig(), p = standing(), certificate = compileTightRagHumanTemplate(RIDER_OCCUPANCY, p).createSlot();
  for (const reach of [0, 1e-10, .001, .1, .25, 2]) {
    p.ragdoll.set([.175, 1.42 - reach, 0], RD_HAND_L * 3);
    p.ragdoll.set([RIDER_BLOCKOUT.torsoWidth * .26, .92 - reach, 0], RD_FOOT_L * 3);
    draw(rig, p); certificate.load(p, p); const bound = certificate.at(.5);
    for (const [origin, middle, end, upper, lower, ceiling] of [
      ['rider-shoulder-left', 'rider-elbow-left', 'rider-grip-left', .28, .26, 2.62],
      ['rider-hip-left', 'rider-knee-left', 'rider-ankle-left', .40, .38, Math.PI],
    ] as const) {
      const a = position(rig, origin), b = position(rig, middle), c = end === 'rider-grip-left'
        ? new THREE.Vector3(0, -lower, 0).applyMatrix4(rig.group.getObjectByName(middle)!.matrixWorld) : position(rig, end);
      assert.ok(Math.abs(a.distanceTo(b) - upper) < 1e-6); assert.ok(Math.abs(b.distanceTo(c) - lower) < 1e-6);
      assert.ok(b.clone().sub(a).normalize().angleTo(c.clone().sub(b).normalize()) <= ceiling, 'a contact target cannot close a joint beyond its crash limit');
    }
    const boot = rig.group.getObjectByName('rider-boot-left') as THREE.Mesh;
    const vertices = boot.geometry.getAttribute('position');
    for (let index = 0; index < vertices.count; index += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(boot.matrixWorld);
      assert.ok(vertex.x >= bound.minX - 1e-6 && vertex.x <= bound.maxX + 1e-6
        && vertex.y >= bound.minY - 1e-6 && vertex.y <= bound.maxY + 1e-6 && vertex.z >= bound.minZ - 1e-6 && vertex.z <= bound.maxZ + 1e-6,
      'the interval certificate includes a released, bounded boot');
    }
  }
  rig.dispose();
});

test('crash pole history is per rig and clears on recovery before a second crash', () => {
  const used = createRidingRig(), fresh = createRidingRig(), first = standing();
  for (let i = 0; i < 40; i += 1) {
    first.ragdoll.set([.2 + .2 * Math.cos(i * .13), 1.1 + .1 * Math.sin(i * .13), .1 * Math.sin(i * .2)], RD_HAND_L * 3);
    draw(used, first);
  }
  draw(used, createPose()); draw(fresh, createPose());
  const second = standing(); draw(used, second); draw(fresh, second);
  for (const side of ['left', 'right']) for (const joint of ['hip', 'knee', 'ankle', 'shoulder', 'elbow']) {
    const name = `rider-${joint}-${side}`;
    assert.ok(position(used, name).distanceTo(position(fresh, name)) < 1e-7, `${name}: a previous crash leaked into this rig's new entry`);
    assert.ok(used.group.getObjectByName(name)!.quaternion.angleTo(fresh.group.getObjectByName(name)!.quaternion) < 1e-7);
  }
  used.dispose(); fresh.dispose();
});

test('coincident hands keep their anatomical contact floor and feet keep only the unequal-bone triangle for every native rider', () => {
  const certificate = compileTightRagHumanTemplate(RIDER_OCCUPANCY, createPose()).createSlot();
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look), p = standing();
    for (const epsilon of [0, 1e-10]) {
      for (const [index, side] of [[RD_HAND_L, 1], [RD_HAND_R, -1]] as const)
        p.ragdoll.set([side * .175, 1.42 - epsilon, 0], index * 3);
      for (const [index, side] of [[RD_FOOT_L, 1], [RD_FOOT_R, -1]] as const)
        p.ragdoll.set([side * RIDER_BLOCKOUT.torsoWidth * .26, .92 - epsilon, 0], index * 3);
      draw(rig, p); certificate.load(p, p); const bound = certificate.at(.5);
      for (const side of ['left', 'right']) {
        const shoulder = position(rig, `rider-shoulder-${side}`), elbow = rig.group.getObjectByName(`rider-elbow-${side}`)!;
        const wrist = new THREE.Vector3(0, -.26, 0).applyMatrix4(elbow.matrixWorld);
        assert.ok(Math.abs(shoulder.distanceTo(wrist) - RIDER_BLOCKOUT.ragdollArmContactMinReach) < 1e-6, `${look.id}/${side}: coincident hand chose a long reach`);
        assert.ok(Math.abs(position(rig, `rider-hip-${side}`).distanceTo(position(rig, `rider-ankle-${side}`)) - .020001) < 1e-6,
          `${look.id}/${side}: coincident foot chose a long reach`);
      }
      // The Drunkard's carried can is a real lower-axis extension; the new
      // minimum endpoint sphere must contain it as well as his glove.
      for (const name of ['rider-boot-left', 'rider-boot-right', 'rider-hand-left', 'rider-hand-right']) {
        const mesh = rig.group.getObjectByName(name);
        assert.ok(mesh instanceof THREE.Mesh, `${look.id}/${name}: native part exists`);
        const vertices = mesh.geometry.getAttribute('position');
        for (let index = 0; index < vertices.count; index += 1) {
          const vertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(mesh.matrixWorld);
          assert.ok(vertex.x >= bound.minX - 1e-6 && vertex.x <= bound.maxX + 1e-6 && vertex.y >= bound.minY - 1e-6 && vertex.y <= bound.maxY + 1e-6
            && vertex.z >= bound.minZ - 1e-6 && vertex.z <= bound.maxZ + 1e-6, `${look.id}/${name}: certificate missed a minimum-reach prop`);
        }
      }
    }
    rig.dispose();
  }
});

test('partial handover covers both bounded hands and the merged carried can, while a paddle stays attached for rider and cop', () => {
  const coefficients = { ...RIDER_OCCUPANCY, torso: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
    headLollExpansion: 0, armRadius: .01, handRadius: .01, legRadius: .01,
    carriage: { minSplay: -.01, maxSplay: .16, minRise: -.01, maxRise: .12 } };
  const certificate = compileTightRagHumanTemplate(coefficients, createPose()).createSlot(), rig = createRidingRig(DRUNKARD_LOOK), cop = createCopRidingRig();
  for (const blend of [.1, .5, 1]) {
    const p = standing(); p.ragdollBlend = blend;
    p.ragdoll.set([.275, 1.42, 0], RD_HAND_L * 3); p.ragdoll.set([-.275, 1.42, 0], RD_HAND_R * 3);
    draw(rig, p); certificate.load(p, p); const bound = certificate.at(.5);
    for (const side of ['left', 'right']) {
      const hand = rig.group.getObjectByName(`rider-hand-${side}`) as THREE.Mesh, vertices = hand.geometry.getAttribute('position');
      for (let index = 0; index < vertices.count; index += 1) {
        const vertex = new THREE.Vector3().fromBufferAttribute(vertices, index).applyMatrix4(hand.matrixWorld);
        assert.ok(vertex.x >= bound.minX - 1e-6 && vertex.x <= bound.maxX + 1e-6 && vertex.y >= bound.minY - 1e-6 && vertex.y <= bound.maxY + 1e-6
          && vertex.z >= bound.minZ - 1e-6 && vertex.z <= bound.maxZ + 1e-6, `blend ${blend}/${side}: hand/can fell outside a narrow carry certificate`);
      }
    }
    for (const holder of [rig, cop]) {
      holder.applySwing(new THREE.Vector3(-1, 1.3, .2), 0, 0); draw(holder, p);
      const paddle = holder.group.getObjectByName('rider-paddle')!, grip = holder.group.getObjectByName('rider-grip-right')!;
      assert.equal(paddle.parent, grip); assert.equal(paddle.visible, true);
      assert.ok(paddle.getWorldPosition(new THREE.Vector3()).distanceTo(grip.getWorldPosition(new THREE.Vector3())) < 1e-7);
      assert.ok(paddle.quaternion.toArray().every(Number.isFinite));
    }
  }
  rig.dispose(); cop.dispose();
});

test('explicit lifecycle reset handles a skipped recovery draw and cadence changes keep the pole continuous', () => {
  const coarse = createRidingRig(), fine = createRidingRig();
  let coarseElbow = new THREE.Vector3(), fineElbow = new THREE.Vector3();
  for (let tick = 0; tick <= 60; tick += 1) {
    const p = standing(), angle = tick * .012;
    p.ragdoll.set([.175 + .12 * Math.sin(angle), 1.25 + .08 * Math.sin(angle * .8), -.3 * Math.cos(angle)], RD_HAND_L * 3);
    draw(coarse, p);
    for (let sub = 0; sub < 4; sub += 1) {
      const at = Math.max(0, tick - 1 + (sub + 1) / 4), angle = at * .012, interpolated = standing();
      interpolated.ragdoll.set([.175 + .12 * Math.sin(angle), 1.25 + .08 * Math.sin(angle * .8), -.3 * Math.cos(angle)], RD_HAND_L * 3);
      draw(fine, interpolated);
    }
    coarseElbow = position(coarse, 'rider-elbow-left'); fineElbow = position(fine, 'rider-elbow-left');
    assert.ok(coarseElbow.distanceTo(fineElbow) < .003, 'normal draw subdivision cannot substantially change the elbow');
  }
  // No zero-rag pose is drawn between the two crash identities.
  coarse.resetCrashPose(); fine.resetCrashPose();
  const next = standing(); draw(coarse, next); draw(fine, next);
  assert.ok(position(coarse, 'rider-elbow-left').distanceTo(position(fine, 'rider-elbow-left')) < 1e-7);
  coarse.dispose(); fine.dispose();
});
