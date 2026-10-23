/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createEuclaudeLevel} from './euclaudeLevel.ts';
import {QUAY_LINES,QUAY_GAPS,EUCLAUDE_LAUNCH_PADS} from './euclaudeLines.ts';
import {runoutRide,quayController} from './quayRide.test-support.ts';
import {NEUTRAL_ACTIONS} from '../input/actions.ts';
import {createPose} from '../simulation/EucController.ts';
import {RD_PELVIS} from '../simulation/ragdoll.ts';
const plan=createEuclaudeLevel();
// One compact fixture per line, including the complete post-landing swept path.
for(const line of QUAY_LINES)test(`${line.id}: 0.8 s reaction and coast, natural and fast entry`,()=>{
 // L4 starts against a back wall and is entered through a right-angle side ramp.
 // 25 m/s cannot approach that start on its heading. 12 m/s is an extra injected stress case.
 for(const speed of line.id==='L4'?[0,12]:[0,25])for(const mode of ['reaction','coast'] as const)for(const jump of line.id==='L4'?[true,false]:[true]){
  const r=runoutRide(plan,line,speed,mode,jump,96),label=JSON.stringify({line:line.id,speed,mode,jump});
  assert.ok(!r.crash&&Math.abs(r.speed)<.03&&r.landingTick>=0,label);
  assert.ok(line.id==='L6'?r.end.z>line.stopLimit:r.end[line.stopAxis]<line.stopLimit,label+' stop boundary');
  if(line.id==='L4')assert.ok(r.events.every(e=>e.quality==='clean'),label+' stair landing');
  for(const p of r.trace.filter(p=>p.tick>=r.landingTick)){
   // All six axes are inside this inner-road envelope except L5, which has its
   // own quay lane outside the road. No unchecked roll-through into the ring.
   assert.ok(line.id==='L5'?p.z>74&&p.z<87&&p.x<28:Math.abs(p.x)<91&&Math.abs(p.z)<60,label+' road separation');
   for(const path of plan.populationPaths!)for(let i=1;i<path.frames.length;i++){
    const a=path.frames[i-1],b=path.frames[i];if(Math.abs(p.y-a.y)>3)continue;
    const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    const d=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
    assert.ok(d>(path.role==='traffic'?3.4:1.1),label+' activity '+path.id);
   }
  }
  console.log(JSON.stringify({...r,trace:undefined}));
 }
 if(line.id==='L3'){
  const control=runoutRide({...plan,softBodies:[]},line,25,'coast');
  assert.ok(control.crash||control.end.x>=91,'removing the visible catch must fail the same corridor');
 }
});
for(const gap of QUAY_GAPS)for(const spin of [false,true])test(`${gap.id} 0.8 design short, ${spin?'180':'straight'}: body reaches actual alley and recovers`,()=>{
 const pad=EUCLAUDE_LAUNCH_PADS.find(p=>p.id===gap.padId)!;
 const c=quayController(plan);c.reset({position:{x:-74,y:0,z:pad.z-13},headingY:0},gap.designSpeed*.8);c.setLaunchPadsArmed(true);
 let spun=false,crash=false,bodyDown=false,wheelDown=false,recovered=false,lying=0;const pose=createPose();
 for(let tick=0;tick<15*120;tick++){
  const a=c.snapshot();const hop:boolean=spin&&!spun&&!a.grounded;spun ||=hop;
  c.step(1/120,{...NEUTRAL_ACTIONS,throttle:crash?0:a.speed<gap.designSpeed*.8?1:0,hop});const b=c.snapshot();c.writePose(pose);
  if(b.crashed){crash=true;if(b.position.y<.1)wheelDown=true;const x=pose.ragdoll[RD_PELVIS*3],y=pose.ragdoll[RD_PELVIS*3+1],z=pose.ragdoll[RD_PELVIS*3+2];
   if(y<1.5&&x>-84&&x<-64&&z>gap.lip&&z<gap.landing){bodyDown=true;lying++;}}
  if(crash&&!b.crashed){recovered=true;break;}
 }
 assert.ok(crash,'short fixture must crash');assert.ok(wheelDown,'wheel reached alley');assert.ok(bodyDown&&lying>12,'F3: pelvis lies over the reachable alley floor, not a roof');assert.ok(recovered);
});
