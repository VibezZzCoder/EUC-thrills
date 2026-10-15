/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {RAGDOLL_BOOT_GROUND_BOX,RAGDOLL_HAND_GROUND_BOX,RIDER_BLOCKOUT} from '../data/tuning.ts';
import {NEUTRAL_ACTIONS} from '../input/actions.ts';
import {buildLevelPlan} from '../level/buildPlan.ts';
import {createProvingGround} from '../level/provingGround.ts';
import {solveRagdollLeg,solveRagdollLimb} from '../shared/ragdollBoot.ts';
import {contactOrientedBoxSupport} from '../shared/ragdollContact.ts';
import {RagdollLimbContact} from '../shared/ragdollLimbContact.ts';
import {EucController} from './EucController.ts';
import {PopulationContactHarness,flatPavement,populationPlanOf,stationaryPerson} from './populationContactHarness.test-support.ts';
import {createGroundSample} from './world.ts';
import {PlanTerrainSampler} from './planSampler.ts';
import {CrashRagdoll,defaultRagdollTuning,RD_HAND_R,RD_SHOULDER_R} from './ragdoll.ts';
import {NO_SOFT_BODIES} from './softBodies.ts';
import type {RagdollObstacleQuery,TerrainSampler} from './world.ts';
const DT=1/120;
test('clear-air proposals preserve canonical motion and are invalidated by a coherent response',()=>{
  type Internal={airLimbMask:number;trunkReaction:Float64Array;writeAirLimbProposal(limb:number):boolean;collectTrunkContacts():boolean;limbContact:{solve(...args:unknown[]):boolean}};
  const fast=new CrashRagdoll(),slow=new CrashRagdoll(),t=defaultRagdollTuning();
  const seed={x:0,y:4,z:0,headingY:.2,rollAngle:.1,riderPitch:.15,hipDrop:0,speed:3,cause:'sideFall' as const,intoSolid:false,side:1};
  fast.seed(seed,t,DT);slow.seed(seed,t,DT);
  const a=fast as unknown as Internal,b=slow as unknown as Internal;b.writeAirLimbProposal=()=>false;
  let calls=0;const solve=a.limbContact.solve.bind(a.limbContact);a.limbContact.solve=(...args)=>{calls++;return solve(...args);};
  for(let tick=0;tick<30;tick++) {
    fast.step(DT,tick*DT,100,100,flatPavement,NO_SOFT_BODIES,t);slow.step(DT,tick*DT,100,100,flatPavement,NO_SOFT_BODIES,t);
    for(let i=0;i<fast.positions.length;i++)assert.ok(Math.abs(fast.positions[i]-slow.positions[i])<1e-7,'physical particle '+i);
    for(let i=0;i<fast.jointPoles.length;i++)assert.ok(Math.abs(fast.jointPoles[i]-slow.jointPoles[i])<1e-7,'canonical pole '+i);
  }
  assert.equal(calls,0,'sampled airborne clearance reuses the existing joint solve');assert.equal(a.airLimbMask,15);
  const collect=a.collectTrunkContacts.bind(a);a.collectTrunkContacts=()=>{collect();a.trunkReaction[0]=.05;return true;};
  fast.step(DT,30*DT,100,100,flatPavement,NO_SOFT_BODIES,t);
  assert.equal(a.airLimbMask,0,'a moved trunk cannot reuse a pre-response limb certificate');assert.equal(calls,4,'the four final proposals use the full contact path');
});
test('an uncleared wheel tangent cannot enter the air cache and the exact released endpoint progresses',()=>{
  const rag=new CrashRagdoll(),t=defaultRagdollTuning();
  rag.seed({x:0,y:1.1,z:0,headingY:0,rollAngle:0,riderPitch:Math.PI/2,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},t,DT);
  type Internal={legSolve:Float64Array;limbPlanes:Float64Array;limbProposals:Float64Array;airLimbMask:number;
    repairTerminalWheelContact(end:number,x:number,z:number,top:number,normal:{x:number;y:number;z:number}):void;
    writeAirLimbProposal(limb:number,x:number,z:number,top:number):boolean;
    writeContactProposal(limb:number,heading:number,x:number,z:number,top:number,sampler:TerrainSampler):boolean};
  const i=rag as unknown as Internal,p=rag.positions,h=RD_SHOULDER_R*3,b=RD_HAND_R*3,wx=p[h],wz=p[h+2],top=p[h+1]-.32;
  p.set([p[h],p[h+1]-.37,p[h+2]+.02],b);rag.jointPoles.set([0,0,1],9);
  const before=p.slice(b,b+3),normalSize=Math.sqrt(1.01);
  i.repairTerminalWheelContact(RD_HAND_R,wx,wz,top,{x:1/normalSize,y:.1/normalSize,z:0});
  assert.deepEqual(p.slice(b,b+3),before,'both primary-face tangents require a forbidden normal rise');
  solveRagdollLimb(p[h],p[h+1],p[h+2],p[b],p[b+1],p[b+2],0,1,0,RIDER_BLOCKOUT.upperArmLength,RIDER_BLOCKOUT.forearmLength,
    RIDER_BLOCKOUT.ragdollArmContactMinReach,RIDER_BLOCKOUT.upperArmLength+RIDER_BLOCKOUT.forearmLength-1e-6,RIDER_BLOCKOUT.ragdollKneeVerticalBand,i.legSolve,rag.jointPoles,9,false,false,undefined,0,1,0,true);
  i.limbPlanes[3*8+1]=i.limbPlanes[3*8+5]=1;
  assert.equal(i.writeAirLimbProposal(3,wx,wz,top),false,'uncleared endpoint must reach the existing exact wheel alternative');
  assert.equal(i.writeAirLimbProposal(3,100,100,top),true,'omitting only the real wheel admits the former bad cached endpoint');
  i.airLimbMask=0;
  assert.equal(i.writeContactProposal(3,0,wx,wz,top,flatPavement),true,'the current finite solver can release this endpoint without a whole-pose hold');
  const out=3*14,dx=i.limbProposals[out+3]-wx,dz=i.limbProposals[out+5]-wz;
  assert.ok(i.limbProposals[out+4]>top||dx*dx+dz*dz>=RIDER_BLOCKOUT.ragdollWheelClearance**2-1e-7);
  assert.ok(Math.hypot(i.limbProposals[out+3]-before[0],i.limbProposals[out+4]-before[1],i.limbProposals[out+5]-before[2])>.1,'a feasible released endpoint must make geometric progress');
  assert.ok(Math.hypot(i.limbProposals[out+3]-p[h],i.limbProposals[out+4]-p[h+1],i.limbProposals[out+5]-p[h+2])<RIDER_BLOCKOUT.upperArmLength+RIDER_BLOCKOUT.forearmLength);
});
test('the gathered finite-box envelope includes the possible post-response ground lift',()=>{
  const rag=new CrashRagdoll();rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},defaultRagdollTuning(),DT);
  const internal=rag as unknown as {stepTurnLimit:number;prepareLimbQuery(limb:number):RagdollObstacleQuery};internal.stepTurnLimit=RIDER_BLOCKOUT.ragdollMaxAngularSpeed*DT;
  const q=internal.prepareLimbQuery(0),ceilingY=q.maxY-RIDER_BLOCKOUT.ragdollGroundShallowDepth*.5;
  const flat=buildLevelPlan([{id:'flat',length:80,halfWidth:30,surface:'pavement',shoulder:2}],{id:'lift-gather',spawn:{position:{x:0,y:0,z:0},headingY:0},surround:{height:0,surface:'pavement'},spacing:4});
  const sampler=new PlanTerrainSampler({...flat,solids:[{centre:{x:0,y:ceilingY,z:0},halfExtents:{x:.4,y:.025,z:.4},rotationY:0,surface:'pavement'}]});
  assert.equal(sampler.raycastObstacle({x:0,y:0,z:0},{x:0,y:0,z:1},.01,0,undefined,undefined,undefined,q),null,'the ordinary endpoint sweep is clear');
  assert.equal(q.count,1,'the later coherent lift must still see this ceiling');
  q.count=0;q.maxY-=RIDER_BLOCKOUT.ragdollGroundShallowDepth;
  sampler.raycastObstacle({x:0,y:0,z:0},{x:0,y:0,z:1},.01,0,undefined,undefined,undefined,q);
  assert.equal(q.count,0,'the old gathered envelope is a concrete negative control');
});
test('every limb failure publishes its own reaction instead of stale success or another limb',()=>{
  type Internal={limbProposals:Float64Array;limbPlanes:Float64Array;limbContact:{pose:Float64Array;reaction:Float64Array;solve(...args:unknown[]):boolean};
    writeContactProposal(limb:number,heading:number,x:number,z:number,top:number,sampler:TerrainSampler):boolean;
    solveLimbContacts(dt:number,heading:number,x:number,z:number,top:number,sampler:TerrainSampler,bodies:typeof NO_SOFT_BODIES,t:ReturnType<typeof defaultRagdollTuning>):void;legContactsValid:boolean};
  for(const failure of ['first','resample','ground','overflow'] as const) {
    const rag=new CrashRagdoll(),t=defaultRagdollTuning();
    rag.seed({x:0,y:4,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},t,DT);
    const i=rag as unknown as Internal,c=i.limbContact;let calls=0;
    i.limbProposals.fill(777);i.limbPlanes[1]=i.limbPlanes[5]=1;
    c.pose[0]=.1;c.pose[1]=.3;c.pose[2]=.2;c.pose[3]=.2;c.pose[4]=.5;c.pose[5]=.3;
    for(const at of [15,24]){c.pose[at]=c.pose[at+4]=c.pose[at+8]=1;}
    c.solve=()=>{calls++;if(failure==='first'||failure==='resample'&&calls===2){c.reaction.set([1,0,0,.025*calls]);return false;}return true;};
    const sampler:TerrainSampler={...flatPavement,sampleGround(x,z,out){flatPavement.sampleGround(x,z,out);out.height=2;return out;},
      raycastObstacle(_o,_d,_m,_r,_ignore,_hit,_exit,query){if(query){query.fulfilled=true;query.overflow=true;}return null;}};
    if(failure==='overflow') {
      i.solveLimbContacts(DT,0,100,100,0,sampler,NO_SOFT_BODIES,t);
      assert.equal(calls,0,'overflow must not consume a previous producer result');
      assert.equal(i.legContactsValid,false);
      for(let limb=0;limb<4;limb++)assert.deepEqual(Array.from(i.limbProposals.slice(limb*14+9,limb*14+14)),[0,0,0,0,0]);
    } else {
      assert.equal(i.writeContactProposal(0,0,100,100,0,sampler),false,failure);
      assert.equal(i.limbProposals[9],0);
      const reaction=Array.from(i.limbProposals.slice(10,14));
      if(failure==='ground'){assert.deepEqual(reaction.slice(0,3),[0,1,0]);assert.ok(reaction[3]>1.5&&reaction[3]<2);}
      else assert.deepEqual(reaction,[1,0,0,.025*(failure==='first'?1:2)]);
    }
  }
});
test('a metadata-ignorant raised/sloped sampler cannot inherit flat underlying ground',()=>{
  const size=Math.sqrt(1+.2*.2+.15*.15),n=[-.2/size,1/size,.15/size],height=(x:number,z:number)=>2+.2*x-.15*z;
  const sampler:TerrainSampler={sampleGround(x,z,out){out.height=height(x,z);out.normal.x=n[0];out.normal.y=n[1];out.normal.z=n[2];out.surface='pavement';out.offCourse=false;return out;},raycast(){return null;}};
  const rag=new CrashRagdoll(),t=defaultRagdollTuning(),o=new Float64Array(37);
  const internal=rag as unknown as {limbContactGround:{base:{height:number;normal:{x:number;y:number;z:number}}};limbPlanes:Float64Array;sampleLimbPlane(limb:number,joint:boolean,x:number,z:number,sampler:TerrainSampler):boolean};
  internal.limbContactGround.base.height=-999;internal.limbContactGround.base.normal={x:0,y:1,z:0};
  internal.sampleLimbPlane(0,false,.4,.7,sampler);
  assert.ok(Math.abs(internal.limbPlanes[3]-2/size)<1e-12,'the sentinel must fall back to the actual raised plane');
  rag.seed({x:0,y:2,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},t,DT);
  for(let tick=0;tick<240;tick++)rag.step(DT,tick*DT,0,0,sampler,NO_SOFT_BODIES,t);
  for(let limb=0;limb<4;limb++) {
    const h=(3+limb)*3,f=(limb<2?9+limb:5+limb)*3,p=rag.positions;
    if(limb<2)solveRagdollLeg(p[h],p[h+1],p[h+2],p[f],p[f+1],p[f+2],0,1,0,RIDER_BLOCKOUT,o,rag.jointPoles,limb*3);
    else solveRagdollLimb(p[h],p[h+1],p[h+2],p[f],p[f+1],p[f+2],0,1,0,.28,.26,.145,.54-1e-6,.025,o,rag.jointPoles,limb*3);
    const b=limb<2?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX,support=contactOrientedBoxSupport(-n[0],-n[1],-n[2],o,limb<2?24:15,b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ);
    assert.ok(n[0]*o[3]+n[1]*o[4]+n[2]*o[5]>=2/size+support-1e-5);
  }
});
test('native walls, mirrored roof edges, gateways and free falls settle without sustained rejected motion',()=>{
  const cases=[['wall',1.4,0,0,1],['roof-left',1.4,.2,.18,1],['roof-right',1.4,-.2,-.18,-1],['tall',18,0,0,1],['tall-left',18,.2,.18,1],['tall-right',18,-.2,-.18,-1],['cutout',0,0,0,1],['rest-left',0,0,0,1],['rest-right',0,0,0,-1],['gateway-left',2,0,0,-1],['gateway-right',2,0,0,1]] as const;
  for(const [name,wallHeight,rotation,heading,side] of cases) {
    let plan=buildLevelPlan([{id:'flat',length:500,halfWidth:30,surface:'pavement',shoulder:2,...(wallHeight?{blocks:[{s:40,t:0,halfAlong:.5,halfLateral:60,height:wallHeight,surface:'pavement' as const}]}:{})}],
      {id:'limb-contact-native',spawn:{position:{x:0,y:0,z:0},headingY:heading},surround:{height:0,surface:'pavement'},spacing:4});
    if(rotation)plan={...plan,segments:plan.segments.map(segment=>({...segment,colliders:segment.colliders.map(box=>({...box,rotationY:box.rotationY+rotation}))}))};
    if(name.startsWith('gateway'))plan={...createProvingGround(),spawn:{position:{x:side*8.8,y:0,z:212},headingY:0}};
    const sampler=new PlanTerrainSampler(plan),controller=new EucController(sampler,{spawn:plan.spawn,tuning:{cutoutEnabled:name==='cutout'?1:0}});
    if(name.startsWith('gateway')){controller.reset(plan.spawn,20.0363);controller.step(DT,NEUTRAL_ACTIONS);}
    if(name.startsWith('rest')){for(let tick=0;tick<120;tick++)controller.step(DT,NEUTRAL_ACTIONS);controller.hardKnock(side,0);}
    else {let tick=0;while(!controller.crashed&&tick++<4000)controller.step(DT,{...NEUTRAL_ACTIONS,throttle:1});assert.ok(controller.crashed,name+' did not reach natural crash');}
    const rag=(controller as unknown as {ragdoll:CrashRagdoll}).ragdoll,frame=(rag as unknown as {frame:Float64Array}).frame;
    let streak=0,longest=0,minPelvis=Infinity,minSupportGap=Infinity,maxRays=0,maxGround=0,inRag=false,rays=0,grounds=0;
    const original=rag.step.bind(rag),ray=sampler.raycastObstacle.bind(sampler),ground=sampler.sampleGround.bind(sampler);
    sampler.raycastObstacle=(...args)=>{if(inRag)rays++;return ray(...args);};sampler.sampleGround=(...args)=>{if(inRag)grounds++;return ground(...args);};
    rag.step=(...args)=>{inRag=true;rays=0;grounds=0;try{original(...args);}finally{inRag=false;}maxRays=Math.max(maxRays,rays);maxGround=Math.max(maxGround,grounds);};
    for(let tick=0;tick<=300;tick++) {
      const before=rag.positions.slice(),priorFrame=frame.slice();controller.step(DT,NEUTRAL_ACTIONS);
      const held=rag.positions.every((v,i)=>v===before[i]);if(held)longest=Math.max(longest,++streak);else streak=0;
      minPelvis=Math.min(minPelvis,rag.positions[1]);const support=createGroundSample();sampler.sampleGround(rag.positions[0],rag.positions[2],support);const internal=rag as unknown as {coreSupportPoint:Float64Array;writeCoreSupportPoint(span:number,x:number,y:number,z:number):void};
      for(let span=0;span<3;span++){internal.writeCoreSupportPoint(span,0,1,0);sampler.sampleGround(internal.coreSupportPoint[0],internal.coreSupportPoint[2],support);minSupportGap=Math.min(minSupportGap,internal.coreSupportPoint[1]-support.height);}let trace=0;for(let i=0;i<9;i++)trace+=frame[i]*priorFrame[i];
      assert.ok(Math.acos(Math.max(-1,Math.min(1,(trace-1)*.5)))<=RIDER_BLOCKOUT.ragdollMaxAngularSpeed*DT+1e-6,name+' exceeded resulting body turn');
    }
    assert.ok(minPelvis>=.14-1e-7&&minSupportGap<.16,name+' remained suspended or went through the floor');
    assert.ok(longest<=2,name+' repeatedly rejected an unsupported pose: '+longest);
    assert.ok(maxRays<=22,name+' exceeded the fixed static-call budget: '+maxRays);
    //63 prior samples + two stages of three core compounds, at most3 samples each.
    assert.ok(maxGround<=81,name+' exceeded the conditional sample budget: '+maxGround);
  }
});

test('released finite-wall support follows boot rotation; its omitted refresh reproduces native suspension',()=>{
  const internal=RagdollLimbContact.prototype as unknown as {refreshStaticEndSupport():void},refresh=internal.refreshStaticEndSupport;
  const run=(enabled:boolean)=>{
    const plan={...createProvingGround(),spawn:{position:{x:-8.8,y:0,z:212},headingY:0}},sampler=new PlanTerrainSampler(plan),controller=new EucController(sampler,{spawn:plan.spawn,tuning:{cutoutEnabled:0}});
    if(!enabled)internal.refreshStaticEndSupport=()=>{};
    try {
      controller.reset(plan.spawn,20.0363);controller.step(DT,NEUTRAL_ACTIONS);let tick=0;
      while(!controller.crashed&&tick++<4000)controller.step(DT,{...NEUTRAL_ACTIONS,throttle:1});assert.ok(controller.crashed);
      let longest=0,streak=0,minSupport=Infinity;
      const rag=(controller as unknown as {ragdoll:CrashRagdoll}).ragdoll;
      for(tick=0;tick<=300;tick++){const p=rag.positions,before=p.slice();controller.step(DT,NEUTRAL_ACTIONS);
        if(p.every((value,index)=>value===before[index]))longest=Math.max(longest,++streak);else streak=0;
        const g=createGroundSample(),body=rag as unknown as {coreSupportPoint:Float64Array;writeCoreSupportPoint(span:number,x:number,y:number,z:number):void};
        for(let span=0;span<3;span++){body.writeCoreSupportPoint(span,0,1,0);sampler.sampleGround(body.coreSupportPoint[0],body.coreSupportPoint[2],g);minSupport=Math.min(minSupport,body.coreSupportPoint[1]-g.height);}}
      return {longest,minSupport};
    } finally {internal.refreshStaticEndSupport=refresh;}
  };
  const good=run(true),bad=run(false);
  assert.ok(good.longest<=2&&good.minSupport<.16,JSON.stringify(good));
  assert.ok(bad.longest>=50&&bad.minSupport>.5,'the old boot face support must expose the exact native unsupported hang');
});

test('living top slide survives release exactly once, changes actual motion and meets the unchanged deadline',()=>{
  const terrain:TerrainSampler={...flatPavement,sampleGround(x,z,value){flatPavement.sampleGround(x,z,value);if(x<0)value.height=3;return value;},raycastObstacle(origin,direction,maximum){if(origin.x<0||origin.y>=3||direction.x>=0)return null;const distance=-origin.x/direction.x;return distance<=maximum?distance:null;}};
  const run=(slide:boolean)=>{
    const harness=new PopulationContactHarness(populationPlanOf([stationaryPerson('worker-0',1,0,'worker')]),{position:{x:-12,y:3,z:0},headingY:Math.PI/2},terrain);
    const internal=CrashRagdoll.prototype as unknown as {slideLivingLimbSupport(bodies:unknown[],dt:number):void};
    let calls=0,steps=0;const original=internal.slideLivingLimbSupport,step=CrashRagdoll.prototype.step,digest=createHash('sha256');
    internal.slideLivingLimbSupport=function(...args){calls++;if(slide)original.apply(this,args);};
    CrashRagdoll.prototype.step=function(...args){steps++;const before=calls;step.apply(this,args);assert.ok(calls-before<=1,'a stage cannot apply the person slide twice');};
    let crash=-1,slid=-1,streak=0,longest=0,minPelvis=Infinity;
    try {for(let tick=0;tick<1500&&!(crash>=0&&!harness.controller.crashed);tick++) {
      const before=harness.pose(),speed=harness.controller.snapshot().speed;
      harness.step({...NEUTRAL_ACTIONS,throttle:harness.controller.crashed?0:speed<1.2?1:speed>1.8?-.3:.05});
      const p=harness.pose();if(crash<0&&harness.controller.crashed)crash=tick;
      digest.update(new Uint8Array(p.ragdoll.buffer));
      if(!harness.controller.crashed)continue;
      if(slid<0&&p.ragdoll[1]<1.7)slid=tick;
      minPelvis=Math.min(minPelvis,p.ragdoll[1]);
      if(before.ragdoll.every((v,i)=>v===p.ragdoll[i]))longest=Math.max(longest,++streak);else streak=0;
    }
    } finally {internal.slideLivingLimbSupport=original;CrashRagdoll.prototype.step=step;}
    assert.ok(steps>0&&calls>0);return {delay:slid<0?Infinity:(slid-crash)*DT,longest,minPelvis,digest:digest.digest('hex')};
  };
  const good=run(true),missing=run(false);
  assert.ok(good.delay<1.2&&good.minPelvis<.30&&good.longest<=2,JSON.stringify(good));
  assert.notEqual(good.digest,missing.digest,'removing accepted slide must change subsequent physical motion');
});

test('a coherent mid-torso crossing is rejected even when both old particle cores clear the roof/front corner',()=>{
  type Internal={limbBoxes:Float64Array;limbBoxCounts:Uint8Array;trunkReaction:Float64Array;collectTrunkContacts():boolean;finalTrunkShapesClear():boolean;moveContact(index:number,x:number,y:number,z:number):void};
  const rag=new CrashRagdoll(),t=defaultRagdollTuning();
  rag.seed({x:0,y:.23,z:.9,headingY:0,rollAngle:0,riderPitch:Math.PI*2/3-RIDER_BLOCKOUT.torsoRestPitch,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},t,DT);
  const internal=rag as unknown as Internal;
  internal.limbBoxes.set([0,0,0,0,.5,1,1,1,0]);internal.limbBoxCounts[0]=1;
  const p=rag.positions;
  assert.ok(p[1]>=1+.14&&p[5]>=1+.14,'the two old particle cores individually clear different faces');
  assert.equal(internal.collectTrunkContacts(),true,'their connecting core still crosses the finite corner');
  assert.equal(internal.finalTrunkShapesClear(),false,'omitting the shared-core predicate admits the known-bad pose');
  const response=internal.trunkReaction;
  assert.ok(Math.hypot(response[0],response[1],response[2])<.15,'the corner normal avoids a large manufactured all-face lift');
  internal.moveContact(0,response[0],response[1],response[2]);
  assert.equal(internal.finalTrunkShapesClear(),true,'every retained separation holds after the coherent response');
});
