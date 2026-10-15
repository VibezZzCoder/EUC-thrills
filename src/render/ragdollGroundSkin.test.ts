/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import * as THREE from 'three';
import {NEUTRAL_ACTIONS} from '../input/actions.ts';
import {createProvingGround} from '../level/provingGround.ts';
import {createPose,EucController,lerpPose} from '../simulation/EucController.ts';
import {PlanTerrainSampler} from '../simulation/planSampler.ts';
import {createRidingRig} from './ridingRig.ts';
import {RIDER_LOOKS} from './riderLook.ts';
const DT=1/120;
function visible(part:THREE.Object3D):boolean {for(let node:THREE.Object3D|null=part;node;node=node.parent)if(!node.visible)return false;return true;}
test('actual mirrored gateway thigh/knee skin and localized pelvis garment clear ground and the finite gateway',()=>{
  for(const id of ['wyldist','seal-on-a-wheel'])for(const side of [-1,1]) {
    const plan={...createProvingGround(),spawn:{position:{x:side*8.8,y:0,z:212},headingY:0}},sampler=new PlanTerrainSampler(plan),controller=new EucController(sampler,{spawn:plan.spawn,tuning:{cutoutEnabled:0}});
    controller.reset(plan.spawn,20.0363);controller.step(DT,NEUTRAL_ACTIONS);let onset=0;
    while(!controller.crashed&&onset++<4000)controller.step(DT,{...NEUTRAL_ACTIONS,throttle:1});assert.ok(controller.crashed);
    const rig=createRidingRig(RIDER_LOOKS.find(look=>look.id===id)!),previous=createPose(),current=createPose(),drawn=createPose(),point=new THREE.Vector3();
    const ticks=new Set([0,6,12,18,24,30,72,78,84,96,102,120,138,144,150,180,240,300]);let checked=0;
    controller.writePose(previous);
    try {
      for(let tick=0;tick<=300;tick++) {
        controller.writePose(current);
        if(ticks.has(tick))for(const alpha of [.25,.5,.75,1]) {
          lerpPose(previous,current,alpha,drawn);rig.apply(drawn);rig.group.updateMatrixWorld(true);
          rig.group.traverse(part=>{
            if(!(part instanceof THREE.Mesh)||!visible(part))return;
            const parent=part.parent?.name??'',selected=id==='wyldist'?parent.startsWith('rider-hip-')||parent.startsWith('rider-knee-'):part.name==='rider-seal-garment';
            if(!selected)return;
            const vertices=part.geometry.getAttribute('position');
            for(let vertex=0;vertex<vertices.count;vertex++) {
              point.fromBufferAttribute(vertices,vertex).applyMatrix4(part.matrixWorld);checked++;
              assert.ok(point.y>=-1e-5,`${id}/${side}/${tick}/${alpha}/${parent}/${vertex}: actual skin below ground ${point.y}`);
              if(id==='seal-on-a-wheel') {
                const inside=Math.abs(point.x-side*8.8)<7.2-1e-5&&point.y>-.6+1e-5&&point.y<2-1e-5&&Math.abs(point.z-218)<2.5-1e-5;
                assert.equal(inside,false,`${id}/${side}/${tick}/${alpha}/${vertex}: lower garment inside finite gateway`);
              }
            }
          });
        }
        controller.writePose(previous);controller.step(DT,NEUTRAL_ACTIONS);
      }
    } finally {rig.dispose();}
    assert.ok(checked>1000,'the actual opaque native geometry must be exercised');
  }
});
