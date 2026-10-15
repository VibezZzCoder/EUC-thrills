/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {RIDER_BLOCKOUT as tuning} from '../data/tuning.ts';
import {projectRagdollHipDirection} from './ragdollHip.ts';
const limits=[tuning.ragdollHipFlexMax,tuning.ragdollHipBackMax,tuning.ragdollHipSplayMax] as const;
function project(x:number,y:number,z:number) {const out=new Float64Array(7);projectRagdollHipDirection(x,y,z,...limits,out);return out;}
function rotate(v:readonly number[],o:Float64Array) {
  const [x,y,z]=v,[ax,ay,az]=o.slice(3,6),c=Math.cos(o[6]),s=Math.sin(o[6]),dot=(ax*x+ay*y+az*z)*(1-c);
  return [x*c+(ay*z-az*y)*s+ax*dot,y*c+(az*x-ax*z)*s+ay*dot,z*c+(ax*y-ay*x)*s+az*dot];
}
test('hip carriage projection preserves unit length and lands on explicit forward/back/splay targets',()=>{
  let violated=0;
  for(let pitch=-Math.PI;pitch<=Math.PI;pitch+=.19)for(const lateral of [-1,-.8,-.3,0,.3,.8,1]) {
    const sagittal=Math.sqrt(1-lateral*lateral),input=[lateral,-Math.cos(pitch)*sagittal,Math.sin(pitch)*sagittal],o=project(...input as [number,number,number]);
    const angle=Math.atan2(o[2],-o[1]);
    assert.ok(angle>=-limits[1]-1e-8&&angle<=limits[0]+1e-8);
    assert.ok(Math.abs(o[0])<=Math.sin(limits[2])+1e-8);assert.ok(Math.abs(Math.hypot(...o.slice(0,3))-1)<1e-8);
    const actual=rotate(input,o);for(let axis=0;axis<3;axis++)assert.ok(Math.abs(actual[axis]-o[axis])<1e-8);
    if(Math.abs(lateral)>Math.sin(limits[2])||Math.abs(lateral)<1&& (pitch < -limits[1]||pitch>limits[0]))violated++;
  }
  assert.ok(violated>100,'the untouched input directions must fail this target predicate');
});
test('upward chart crossings and true antipodes remain finite and deterministic',()=>{
  const first=project(0,1,-1e-9),last=project(0,1,1e-9);
  assert.ok(Math.hypot(first[0]-last[0],first[1]-last[1],first[2]-last[2])<1e-8,'an upward crossing cannot flip to the backward chart');
  const o=new Float64Array(7);projectRagdollHipDirection(0,1,0,0,0,0,o);
  assert.equal(o[6],Math.PI);assert.ok(o.every(Number.isFinite));assert.deepEqual(rotate([0,1,0],o).map(v=>Math.round(v)),[0,-1,0]);
});

test('the complete trunk rotation cap catches diagonal-axis motion missed by per-axis chord limits',async()=>{
  const {capRagdollFrameRotation}=await import('./ragdollHip.ts'),start=Float64Array.from([1,0,0,0,1,0,0,0,1]);
  for(const angle of [.1,1,Math.PI]) {
    const axis=[1/Math.sqrt(2),1/Math.sqrt(2),0],goal=new Float64Array(9),o=Float64Array.from([0,0,0,...axis,angle]);
    for(let b=0;b<9;b+=3)goal.set(rotate(Array.from(start.slice(b,b+3)),o),b);
    const oldMaximumChord=Math.max(Math.hypot(...Array.from(goal.slice(0,3),(v,i)=>v-start[i])),Math.hypot(...Array.from(goal.slice(3,6),(v,i)=>v-start[3+i])));
    if(angle===.1)assert.ok(oldMaximumChord<.08,'this is the concrete old-cap counterexample');
    capRagdollFrameRotation(start,goal,.08);
    const trace=goal[0]+goal[4]+goal[8];assert.ok(Math.abs(Math.acos(Math.max(-1,Math.min(1,(trace-1)*.5)))-.08)<1e-8);
    assert.ok(goal.every(Number.isFinite));
  }
});
