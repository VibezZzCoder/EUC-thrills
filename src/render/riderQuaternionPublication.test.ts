/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import * as THREE from 'three';
import {NEUTRAL_ACTIONS} from '../input/actions.ts';
import {buildLevelPlan} from '../level/buildPlan.ts';
import {EucController,createPose,copyPose,lerpPose,type EucPose} from '../simulation/EucController.ts';
import {PlanTerrainSampler} from '../simulation/planSampler.ts';
import {createRidingRig,type RidingRig} from './ridingRig.ts';
import {COOL_RIDER_LOOK,MARIBEL_LOOK} from './riderLook.ts';

/** The control restores only the previous live-quaternion publication chains.
 * It shares every current pose/geometry/IK rule, so source drift cannot silently
 * compare against a different crash solver or look. */
async function previousPublicationFactory():Promise<typeof createRidingRig> {
  const tag='?previous-quaternion-publication-control',rigURL=new URL('./ridingRig.ts'+tag,import.meta.url).href,
    riderURL=new URL('./rider.ts'+tag,import.meta.url).href;
  let replaced=false;
  const hooks=registerHooks({
    resolve(specifier,context,nextResolve){return nextResolve(context.parentURL===rigURL&&specifier==='./rider.ts'?specifier+tag:specifier,context);},
    load(url,context,nextLoad){
      const result=nextLoad(url,context);if(url!==riderURL)return result;
      let source=typeof result.source==='string'?result.source:Buffer.from(result.source as Uint8Array).toString();
      const ankle='SOLVE_INVERSE.copy(reactionUpper).multiply(reactionLower).invert()\n          .multiply(pedalReactionQuaternion);\n        leg.ankle.quaternion.copy(SOLVE_INVERSE);';
      const hair='HAIR_INVERSE.copy(neck.quaternion).invert().multiply(HAIR_TARGET);';
      const finish='if (rag > 0) HAIR_INVERSE.slerp(HAIR_REST.identity(), rag);\n        hairSway.quaternion.copy(HAIR_INVERSE);';
      for(const fragment of [ankle,hair,finish])assert.equal(source.split(fragment).length,2,'publication control must bind exactly one current source site');
      source=source.replace(ankle,'leg.ankle.quaternion.copy(reactionUpper).multiply(reactionLower).invert()\n          .multiply(pedalReactionQuaternion);')
        .replace(hair,'HAIR_INVERSE.copy(neck.quaternion).invert();\n        hairSway.quaternion.copy(HAIR_INVERSE).multiply(HAIR_TARGET);')
        .replace(finish,'if (rag > 0) hairSway.quaternion.slerp(HAIR_REST.identity(), rag);');
      replaced=true;return {...result,source};
    },
  });
  try {const factory=(await import(rigURL)).createRidingRig as typeof createRidingRig;assert.equal(replaced,true);return factory;}
  finally {hooks.deregister();}
}

function nativeFrames():{phase:string;pose:EucPose}[] {
  const plan=buildLevelPlan([{id:'flat',length:1000,halfWidth:50,surface:'pavement',shoulder:2}],
    {id:'quaternion-publication-native',spawn:{position:{x:0,y:0,z:0},headingY:0},surround:{height:0,surface:'pavement'},spacing:4}),
    c=new EucController(new PlanTerrainSampler(plan),{spawn:plan.spawn,tuning:{cutoutEnabled:0}}),frames:{phase:string;pose:EucPose}[]=[];
  const add=(phase:string)=>{const pose=createPose();c.writePose(pose);frames.push({phase,pose});};
  c.reset(plan.spawn,8);add('ordinary');
  for(let tick=0;tick<36;tick++){c.step(1/120,{...NEUTRAL_ACTIONS,throttle:.3,steer:Math.sin(tick/7)*.4,crouch:tick<5});if(tick%6===0)add('ordinary');}
  const fall=(side:number)=>{
    assert.equal(c.hardKnock(side,0),true);add('onset');
    const previous=createPose(),current=createPose();
    for(let tick=1;tick<=20;tick++) {
      c.writePose(previous);c.step(1/120,NEUTRAL_ACTIONS);c.writePose(current);
      if(![1,4,8,12,16,20].includes(tick))continue;
      for(const alpha of [.25,.5,1]){const pose=createPose();lerpPose(previous,current,alpha,pose);frames.push({phase:pose.ragdollBlend===1?'full':'partial',pose});}
    }
  };
  fall(3);
  for(let tick=0;tick<600&&c.crashed;tick++)c.step(1/120,{...NEUTRAL_ACTIONS,throttle:1});
  assert.equal(c.crashed,false,'actual recovery must be part of the publication comparison');add('recovery');
  for(let tick=0;tick<240&&c.snapshot().invulnerable>0;tick++)c.step(1/120,NEUTRAL_ACTIONS);
  add('ordinary');fall(-3);
  const repeat=createPose();copyPose(frames[frames.length-1].pose,repeat);frames.push({phase:'repeat-full',pose:repeat});
  return frames;
}
function snapshot(rig:RidingRig) {
  const values:{name:string;position:number[];quaternion:number[];matrix:number[]}[]=[];
  rig.group.updateMatrixWorld(true);
  rig.group.traverse(node=>values.push({name:node.name,position:node.position.toArray(),quaternion:node.quaternion.toArray(),matrix:node.matrixWorld.elements.slice()}));
  return values;
}
function resources(rig:RidingRig) {
  let objects=0,meshes=0;const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  rig.group.traverse(node=>{objects++;if(!(node instanceof THREE.Mesh))return;meshes++;geometries.add(node.geometry);
    for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});
  return {objects,meshes,geometries:geometries.size,materials:materials.size,textures:textures.size};
}
function countPublications(rig:RidingRig) {
  const counts=new Map<string,number>();
  for(const name of ['rider-ankle-left','rider-ankle-right','rider-hair-sway']) {
    const node=rig.group.getObjectByName(name);if(!node)continue;
    const q=node.quaternion as THREE.Quaternion&{_onChangeCallback():void},callback=q._onChangeCallback.bind(q);
    q._onChangeCallback=()=>{counts.set(name,(counts.get(name)??0)+1);callback();};
  }
  return counts;
}

test('native ordinary/crash/recovery/reentry transforms are exact while ankle/hair publication removes intermediate callbacks',async()=>{
  const previous=await previousPublicationFactory(),frames=nativeFrames();
  assert.ok(frames.some(frame=>frame.phase==='ordinary')&&frames.some(frame=>frame.phase==='partial')&&frames.some(frame=>frame.phase==='full')&&frames.some(frame=>frame.phase==='recovery'));
  let ankleSavings=0,hairSavings=0;
  for(const look of [COOL_RIDER_LOOK,MARIBEL_LOOK]) {
    const actual=createRidingRig(look),control=previous(look),a=countPublications(actual),b=countPublications(control);
    try {
      assert.deepEqual(resources(actual),resources(control));
      for(const {phase,pose} of frames) {
        a.clear();b.clear();actual.apply(pose);control.apply(pose);
        assert.deepEqual(snapshot(actual),snapshot(control),look.id+'/'+phase+': final local quaternions and full world transforms must retain every component');
        for(const name of ['rider-ankle-left','rider-ankle-right']) {
          const old=b.get(name)??0,next=a.get(name)??0;
          assert.equal(next,old===0?0:1,name+'/'+phase+': publish the final quaternion once');
          if(old===4){assert.equal(next,1);ankleSavings+=old-next;}else assert.equal(next,old,'rag publication was already once');
        }
        if(look===MARIBEL_LOOK){assert.equal(a.get('rider-hair-sway'),1);assert.ok(b.get('rider-hair-sway')!>=2);hairSavings+=b.get('rider-hair-sway')!-1;}
      }
      assert.deepEqual(resources(actual),resources(control));
    } finally {actual.dispose();control.dispose();}
  }
  assert.ok(ankleSavings>=6,'actual ordinary solves must qualify the previous four-callback negative control');
  assert.ok(hairSavings>0,'actual ordinary/partial/full hair solves must qualify the previous live chain control');
});
