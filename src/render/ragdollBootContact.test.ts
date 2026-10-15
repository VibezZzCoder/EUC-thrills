/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { RAGDOLL_BOOT_GROUND_BOX, RAGDOLL_HAND_GROUND_BOX, RIDER_BLOCKOUT, RIDER_OCCUPANCY, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { createSliceLevel, SLICE_GRAPH } from '../level/sliceLevel.ts';
import { centrelineAt, headingAt } from '../level/segments.ts';
import { createPose, EucController, lerpPose } from '../simulation/EucController.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { compileTightRagHumanTemplate } from '../shared/compiledOccupancy.ts';
import { buildRiderOccupancyEnvelope } from '../shared/riderOccupancy.ts';
import { writeRagdollBootFrame } from '../shared/ragdollBoot.ts';
import { createRidingRig } from './ridingRig.ts';
import { RIDER_LOOKS } from './riderLook.ts';

const DT = 1 / SIMULATION.hz;
function worldPosition(rig: ReturnType<typeof createRidingRig>, name: string) {
  return rig.group.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
}
function contactPose() {
  const p = createPose(); p.ragdollBlend = 1; p.crashBlend = 1;
  const hh = RIDER_BLOCKOUT.torsoWidth * .26;
  p.ragdoll.set([0,.14,0, 0,.64,0, 0,.86,0, hh,.14,0, -hh,.14,0,
    .175,.64,0, -.175,.64,0, .275,.7,.15, -.275,.7,.15, .05,.09,.18, -.05,.09,.18]);
  return p;
}
test('a contact-shortened leg reaches its authoritative ankle instead of extending below and through a wall', () => {
  const rig = createRidingRig(), p = contactPose();
  p.headingY = .7; p.groundPitch = .06; p.groundRoll = -.09; p.rollAngle = .35; p.wheelPitch = -.1;
  rig.apply(p); rig.group.updateMatrixWorld(true);
  for (const [side, index] of [['left', 9], ['right', 10]] as const) {
    const target = new THREE.Vector3().fromArray(p.ragdoll, index * 3);
    assert.ok(worldPosition(rig, `rider-ankle-${side}`).distanceTo(target) < 1e-6,
      'the old .390 m render preference displaced a clear physical foot');
    const h = worldPosition(rig, `rider-hip-${side}`), k = worldPosition(rig, `rider-knee-${side}`);
    assert.ok(Math.abs(h.distanceTo(k) - .4) < 1e-6 && Math.abs(k.distanceTo(target) - .38) < 1e-6);
    const flex = k.clone().sub(h).normalize().angleTo(target.clone().sub(k).normalize());
    assert.ok(flex < 2.75, 'the pinned contact fold remains below 158 degrees');
    const frame = new Float64Array(9); writeRagdollBootFrame(p.ragdoll, index === 9 ? 3 : 4, index, p.headingY, RIDER_BLOCKOUT, frame);
    const boot = rig.group.getObjectByName(`rider-boot-${side}`)!, q = boot.getWorldQuaternion(new THREE.Quaternion());
    for (let axis = 0; axis < 3; axis += 1) {
      const v = new THREE.Vector3().setComponent(axis, 1).applyQuaternion(q);
      assert.ok(v.distanceTo(new THREE.Vector3().fromArray(frame, axis * 3)) < 1e-6,
        'complete heading/ground/root/shin transforms must be removed before the shared world boot frame is written');
    }
  }
  rig.dispose();
});
test('the foot support box contains the actual vertices of both boots on every native look', () => {
  const b = RAGDOLL_BOOT_GROUND_BOX, certificate = compileTightRagHumanTemplate(RIDER_OCCUPANCY,createPose()).createSlot();
  const bootRadius=Math.hypot(.1,.075,.15);
  assert.ok(RIDER_BLOCKOUT.thighLength+RIDER_OCCUPANCY.legRadius>=bootRadius, 'the existing upper-bone sphere must contain a whole boot at the origin of a maximum-reach projection');
  for (const look of RIDER_LOOKS) {
    const rig = createRidingRig(look);
    for (const side of ['left','right']) {
      const geometry = (rig.group.getObjectByName(`rider-boot-${side}`) as THREE.Mesh).geometry, vertices = geometry.getAttribute('position');
      for (let i = 0; i < vertices.count; i += 1) {
        assert.ok(vertices.getX(i) >= b.minX && vertices.getX(i) <= b.maxX && vertices.getY(i) >= b.minY && vertices.getY(i) <= b.maxY
          && vertices.getZ(i) >= b.minZ && vertices.getZ(i) <= b.maxZ, `${look.id}/${side}/${i}: a native boot outgrew its physical support`);
      }
    }
    for(const side of ['left','right']) {
      const hand=rig.group.getObjectByName(`rider-hand-${side}`) as THREE.Mesh,vertices=hand.geometry.getAttribute('position'),bound=RAGDOLL_HAND_GROUND_BOX;
      hand.updateMatrix();
      for(let i=0;i<vertices.count;i+=1){const v=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(hand.matrix);v.y+=RIDER_BLOCKOUT.forearmLength;
        assert.ok(v.x>=bound.minX&&v.x<=bound.maxX&&v.y>=bound.minY&&v.y<=bound.maxY&&v.z>=bound.minZ&&v.z<=bound.maxZ,
          `${look.id}/${side}: actual merged hand/can escaped its contact support box`);
      }
    }
    for (const blend of [.1,.5,1]) for (const reach of [0,.184,1]) {
      const p=contactPose();p.ragdollBlend=blend;p.headingY=.8;p.rollAngle=.3;p.wheelPitch=-.1;p.groundPitch=.07;p.groundRoll=-.06;
      for(const [hip,foot,side] of [[3,9,1],[4,10,-1]])p.ragdoll.set([p.ragdoll[hip*3]+side*reach,p.ragdoll[hip*3+1]-.01,p.ragdoll[hip*3+2]+reach*.2],foot*3);
      rig.apply(p);rig.group.updateMatrixWorld(true);certificate.load(p,p);
      const compiled=certificate.at(.5),concrete=buildRiderOccupancyEnvelope(p,RIDER_OCCUPANCY).human;
      for(const side of ['left','right']) {
        const mesh=rig.group.getObjectByName(`rider-boot-${side}`) as THREE.Mesh,vertices=mesh.geometry.getAttribute('position');
        for(let i=0;i<vertices.count;i+=1) {
          const v=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
          for(const bound of [compiled,concrete])assert.ok(v.x>=bound.minX-1e-6&&v.x<=bound.maxX+1e-6&&v.y>=bound.minY-1e-6&&v.y<=bound.maxY+1e-6&&v.z>=bound.minZ-1e-6&&v.z<=bound.maxZ+1e-6,
            `${look.id}/${blend}/${reach}/${side}: actual boot escaped the minimum/maximum fallback certificate`);
        }
      }
    }
    rig.dispose();
  }
});

test('native wall, cutout, stationary and shipped-slope falls retain visible boot clearance through partial handover and settled contact', () => {
  for (const kind of ['wall','cutout','stationary','slope']) {
    let plan = buildLevelPlan([{id:'flat',length:500,halfWidth:30,surface:'pavement',shoulder:2,
      ...(kind === 'wall' ? {blocks:[{s:40,t:0,halfAlong:.5,halfLateral:60,height:1.4,surface:'pavement' as const}]} : {})}],
      {id:'boot-floor',spawn:{position:{x:0,y:0,z:0},headingY:0},surround:{height:0,surface:'pavement'},spacing:4});
    if (kind === 'slope') {
      plan = createSliceLevel(); const segment = plan.segments.find(s => s.id === 'return-climb')!;
      const spec = [...SLICE_GRAPH.main,...(SLICE_GRAPH.branches ?? []).flatMap(b => b.specs)].find(s => s.id === segment.id)!;
      plan = {...plan, spawn:{position:centrelineAt(segment.entry,spec,21),headingY:headingAt(segment.entry,spec,21)}};
    }
    const sampler = new PlanTerrainSampler(plan), controller = new EucController(sampler,{spawn:plan.spawn,tuning:{cutoutEnabled:kind==='cutout'?1:0}});
    if (kind === 'stationary' || kind === 'slope') { for (let i=0;i<120;i+=1) controller.step(DT,NEUTRAL_ACTIONS); assert.equal(controller.hardKnock(1,0),true); }
    else { let i=0; while(!controller.crashed && i++<3000) controller.step(DT,{...NEUTRAL_ACTIONS,throttle:1}); assert.equal(controller.crashed,true); }
    const rig = createRidingRig(), pose = createPose(), previous = createPose(), drawn = createPose(), ground = createGroundSample();
    const native = (controller as unknown as { ragdoll: { finalLegsClear(): boolean } }).ragdoll;
    const predicate=native.finalLegsClear.bind(native); let rejects=0,streak=0,maximumStreak=0,minimumPelvis=Infinity;
    native.finalLegsClear=()=>{const okay=predicate();if(okay)streak=0;else{rejects++;maximumStreak=Math.max(maximumStreak,++streak);}return okay;};
    controller.writePose(previous);
    for (let tick=0;tick<=300;tick+=1) {
      controller.writePose(pose); sampler.sampleGround(pose.ragdoll[0],pose.ragdoll[2],ground);
      minimumPelvis=Math.min(minimumPelvis,pose.ragdoll[1]-ground.height);
      for (const alpha of [.25,.5,.75,1]) {
        lerpPose(previous,pose,alpha,drawn); rig.apply(drawn); rig.group.updateMatrixWorld(true);
        for (const [side,index] of [['left',9],['right',10]] as const) {
          const mesh = rig.group.getObjectByName(`rider-boot-${side}`) as THREE.Mesh, vertices = mesh.geometry.getAttribute('position');
          if (drawn.ragdollBlend === 1) {
            const foot=new THREE.Vector3().fromArray(drawn.ragdoll,index*3),hip=worldPosition(rig,`rider-hip-${side}`),ankle=worldPosition(rig,`rider-ankle-${side}`),reach=hip.distanceTo(foot);
            const expected=foot;
            assert.ok(reach<=.78001, `${kind}/${tick}/${alpha}: a native published leg exceeds its physical triangle`);
            assert.ok(ankle.distanceTo(expected)<2e-5, `${kind}/${tick}/${side}: authoritative target or anatomical ceiling fallback drifted`);
          }
          if(drawn.ragdollBlend===1) {
            const shinUp=new THREE.Vector3(0,1,0).applyQuaternion(rig.group.getObjectByName(`rider-knee-${side}`)!.getWorldQuaternion(new THREE.Quaternion()));
            const bootUp=new THREE.Vector3(0,1,0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
            assert.ok(shinUp.dot(bootUp)>=Math.cos(RIDER_BLOCKOUT.ragdollBootPitchMax)*Math.cos(RIDER_BLOCKOUT.ragdollBootRollMax)-1e-6,'native ankle must not reverse its shin');
          }
          for (let i=0;i<vertices.count;i+=1) {
            const vertex = new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);
            sampler.sampleGround(vertex.x,vertex.z,ground);
            // A wall roof footprint is not the floor beside its face.
            const floor = kind === 'wall' ? 0 : ground.height;
            assert.ok(vertex.y >= floor - .001, `${kind}/${tick}/${alpha}/${side}: visible boot penetrated ${(floor-vertex.y)*1000} mm`);
          }
        }
      }
      controller.writePose(previous); controller.step(DT,NEUTRAL_ACTIONS);
    }
    assert.ok(minimumPelvis<.22, `${kind}: floor-clear rendered boots hid a suspended torso`);
    assert.ok(maximumStreak<4&&rejects<30, `${kind}: repeated contact rejection stranded the native fall (${rejects},streak ${maximumStreak})`);
    assert.equal(controller.snapshot().recoveryReady,true);
    rig.dispose();
  }
});
