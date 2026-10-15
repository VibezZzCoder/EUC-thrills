/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {RAGDOLL_BOOT_GROUND_BOX,RAGDOLL_HAND_GROUND_BOX,RIDER_BLOCKOUT} from '../data/tuning.ts';
import {RagdollLimbContact} from './ragdollLimbContact.ts';
import {contactCapsuleOverlapsBox,contactOrientedBoxOverlaps,contactOrientedBoxSupport} from './ragdollContact.ts';
const floor=Float64Array.from([0,1,0,0]),empty=new Float64Array(0);
function solve(c:RagdollLimbContact,h:readonly number[],f:readonly number[],pole:readonly number[],leg=true,boxes=empty,ground=floor) {
  return c.solve(h[0],h[1],h[2],f[0],f[1],f[2],pole[0],pole[1],pole[2],leg,0,0,1,ground,0,ground,0,boxes,0,boxes.length/9,100,100,-100);
}
function geometry(c:RagdollLimbContact,h:readonly number[],leg:boolean,boxes=empty) {
  const o=c.pose,upper=leg?.4:.28,lower=leg?.38:.26,box=leg?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
  assert.ok(Math.abs(Math.hypot(o[0]-h[0],o[1]-h[1],o[2]-h[2])-upper)<1e-7);
  assert.ok(Math.abs(Math.hypot(o[3]-o[0],o[4]-o[1],o[5]-o[2])-lower)<1e-7);
  for(let at=0;at<boxes.length;at+=9){assert.equal(contactCapsuleOverlapsBox(h[0],h[1],h[2],o[0],o[1],o[2],leg?.13:.10,boxes,at,new Float64Array(8)),false);
    assert.equal(contactCapsuleOverlapsBox(o[0],o[1],o[2],o[3],o[4],o[5],leg?.13:.10,boxes,at,new Float64Array(8)),false);
    assert.equal(contactOrientedBoxOverlaps(o[3],o[4],o[5],o,leg?24:15,box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ,boxes,at,new Float64Array(12)),false);}
}
test('clear initial triangles reuse their pose and match the forced complete contact path',()=>{
  for(const leg of [true,false])for(const side of [-1,1])for(const front of [-.12,.18]) {
    const fast=new RagdollLimbContact(),slow=new RagdollLimbContact(),h=[side*.1,2,0],f=[side*.22,leg?1.48:1.73,front],pole=[side*.3,.7,.8];
    const a=fast as unknown as {writePose(...args:unknown[]):void},b=slow as unknown as {writePose(...args:unknown[]):void;initialClear():boolean};
    let fastWrites=0,slowWrites=0;const writeA=a.writePose.bind(a),writeB=b.writePose.bind(b);
    a.writePose=(...args)=>{fastWrites++;writeA(...args);};b.writePose=(...args)=>{slowWrites++;writeB(...args);};b.initialClear=()=>false;
    assert.equal(solve(fast,h,f,pole,leg),true);assert.equal(solve(slow,h,f,pole,leg),true);
    assert.equal(fastWrites,1);assert.ok(slowWrites>=2,'the forced old branch reconstructs the zero-angle triangle');
    for(const index of [...Array.from({length:6},(_,i)=>i),...Array.from({length:21},(_,i)=>i+15)])assert.ok(Math.abs(fast.pose[index]-slow.pose[index])<1e-8,'joint/end/terminal/pole '+index);
    geometry(fast,h,leg);
  }
});
test('near ground an enclosing sphere or initial-pose reuse cannot waive exact terminal support',()=>{
  const good=new RagdollLimbContact(),bad=new RagdollLimbContact(),h=[0,.17,0],f=[.31,-.069,.037],pole=[.93,.27,-.26];
  assert.equal(solve(good,h,f,pole),true);geometry(good,h,true);
  (bad as unknown as {initialClear():boolean}).initialClear=()=>true;
  assert.equal(solve(bad,h,f,pole),true);
  const box=RAGDOLL_BOOT_GROUND_BOX,support=contactOrientedBoxSupport(0,-1,0,bad.pose,24,box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ);
  assert.ok(bad.pose[4]<support-.05,'the deliberately unproved early return buries the actual boot');
});
test('proposal-local support reuse is exact and invalidates after endpoint, pole and limb-kind changes',()=>{
  type Cached={terminalSupport(x:number,y:number,z:number):number;invalidateTerminalSupport():void};
  const good=new RagdollLimbContact(),bad=new RagdollLimbContact(),a=good as unknown as Cached,b=bad as unknown as Cached;
  const directions=[[0,-1,0],[0,1,0],[-1,0,0],[1,0,0],[0,0,-1],[0,0,1],[Math.SQRT1_2,-Math.SQRT1_2,0]];
  assert.equal(solve(good,[0,2,0],[.22,1.48,.18],[.3,.7,.8]),true);assert.equal(solve(bad,[0,2,0],[.22,1.48,.18],[.3,.7,.8]),true);
  for(const n of directions)for(let repeat=0;repeat<3;repeat++)assert.equal(a.terminalSupport(n[0],n[1],n[2]),b.terminalSupport(n[0],n[1],n[2]));
  b.invalidateTerminalSupport=()=>{};
  let badDifference=0;
  for(const leg of [true,false]) {
    const h=[0,2,0],f=leg?[-.20,1.55,-.18]:[-.15,1.71,-.12],pole=[-.8,.1,.4];
    assert.equal(solve(good,h,f,pole,leg),true);assert.equal(solve(bad,h,f,pole,leg),true);
    const box=leg?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    for(const n of directions) {
      const expected=contactOrientedBoxSupport(n[0],n[1],n[2],good.pose,leg?24:15,box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ);
      assert.equal(a.terminalSupport(n[0],n[1],n[2]),expected,'the current basis owns every support answer');
      const staleExpected=contactOrientedBoxSupport(n[0],n[1],n[2],bad.pose,leg?24:15,box.minX,box.maxX,box.minY,box.maxY,box.minZ,box.maxZ);
      badDifference=Math.max(badDifference,Math.abs(b.terminalSupport(n[0],n[1],n[2])-staleExpected));
    }
  }
  assert.ok(badDifference>.01,'omitting proposal invalidation must expose a stale support witness');
});
test('a shin meeting a finite wall is resolved even when both endpoint centre casts miss',()=>{
  const c=new RagdollLimbContact(),h=[-.2,1.3,4],f=[-.2,.7,4],boxes=Float64Array.from([0,0,1,4,.05,.5,.5,1,0]);
  assert.equal(solve(c,h,f,[1,0,0],true,boxes),true);geometry(c,h,true,boxes);
  assert.ok(c.pose[0]<=-.18+1e-6,'the pole must change the actual bowed shin');
  assert.ok(c.trials<=RIDER_BLOCKOUT.ragdollContactFaceTrials);
});
test('ground release retains an authoritative ankle and oriented support rather than a render-only min extension',()=>{
  const c=new RagdollLimbContact(),h=[0,.17,0],f=[.31,-.069,.037];
  assert.equal(solve(c,h,f,[.93,.27,-.26]),true);geometry(c,h,true);
  assert.equal(c.released,true);
  const b=RAGDOLL_BOOT_GROUND_BOX,support=contactOrientedBoxSupport(0,-1,0,c.pose,24,b.minX,b.maxX,b.minY,b.maxY,b.minZ,b.maxZ);
  assert.ok(c.pose[4]>=support-1e-6);assert.ok(c.pose[1]>=RIDER_BLOCKOUT.ragdollKneeRadius);
  assert.ok(c.pose[4]-support<.015,'the residual bracket must approach actual support instead of retaining circumsphere hover');
});
test('a roof-earned elbow leaves its wrist constrained by its own ground over the void',()=>{
  const c=new RagdollLimbContact(),h=[0,1.56,-.10],f=[0,1.34,.2],boxes=Float64Array.from([0,0,.7,-.25,5,.7,.25,1,0]);
  assert.equal(solve(c,h,f,[0,1,0],false,boxes),true);geometry(c,h,false,boxes);
  assert.ok(c.pose[1]>=1.5-1e-6,'the actual arm clears the finite roof');
  assert.ok(c.pose[4]<1.4&&c.pose[5]>0,'the roof is not extended beneath the wrist');
});
test('a genuinely blocked local limb returns a finite contact response, never a clamped feasible circle',()=>{
  const c=new RagdollLimbContact(),boxes=Float64Array.from([0,0,1,0,5,1,5,1,0]);
  assert.equal(solve(c,[0,1,0],[0,.6,.1],[0,0,1],false,boxes),false);
  assert.ok(c.reaction.every(Number.isFinite));assert.ok(c.reaction[3]>0);
  assert.ok(c.trials<=RIDER_BLOCKOUT.ragdollContactFaceTrials);
});
