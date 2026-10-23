/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createEuclaudeLevel} from './euclaudeLevel.ts';
import {PlanTerrainSampler} from '../simulation/planSampler.ts';
import {createGroundSample} from '../simulation/world.ts';
import {spawnSlot} from '../simulation/spawnSlots.ts';
import {planRenderCost} from './renderBudget.ts';
import {buildPopulationPlan} from './populationPlan.ts';
import {LAUNCH_PAD_ROLL_RADIUS,launchPadSkirtRun} from '../simulation/launchPadField.ts';
import {LAUNCH_PAD} from '../data/tuning.ts';
const plan=createEuclaudeLevel(),sampler=new PlanTerrainSampler(plan);
test('revision 2 has six pads, calm four-seat spawn and selected three-step pocket',()=>{
 assert.equal(plan.id,'euclaude-r2');assert.equal(plan.launchPads?.length,6);
 for(let i=0;i<4;i++){const s=spawnSlot(plan.spawn,i,sampler);assert.ok(s.position.x>=59&&s.position.x<=71);assert.ok(Math.abs(sampler.sampleGround(s.position.x,s.position.z,createGroundSample()).height)<.01);}
 for(const [z,y] of [[12.3,.15],[12.9,.3],[13.5,.45]])assert.ok(Math.abs(sampler.sampleGround(24,z,createGroundSample()).height-y)<.001);
});
test('road height and pad reach stay clear around the complete circuit and centre street',()=>{
 const reach=(LAUNCH_PAD.triggerRadiusMetres+launchPadSkirtRun()+LAUNCH_PAD_ROLL_RADIUS)/Math.cos(Math.PI/8);
 const points:{x:number;z:number}[]=[];
 for(let z=-51;z<=51;z++)for(const x of[-100,-96,-2,2,96,100])points.push({x,z});
 for(let x=-81;x<=81;x++)for(const z of[-70,-66,66,70])points.push({x,z});
 for(const cx of[-82,82])for(const cz of[-52,52])for(const r of[12.4,14,16,18,19.6])for(let i=0;i<=30;i++){
  const a=i*Math.PI/60;points.push({x:cx+Math.sign(cx)*r*Math.cos(a),z:cz+Math.sign(cz)*r*Math.sin(a)});
 }
 const auditPads=(pads:NonNullable<typeof plan.launchPads>)=>{for(const p of points)for(const pad of pads)assert.ok(Math.hypot(p.x-pad.x,p.z-pad.z)>reach+.4,'pad intrudes into road');};
 auditPads(plan.launchPads!);
 for(const p of points){assert.ok(Math.abs(sampler.sampleGround(p.x,p.z,createGroundSample()).height)<.01,JSON.stringify(p));
  for(const pad of plan.launchPads??[])assert.ok(Math.hypot(p.x-pad.x,p.z-pad.z)>reach+.4,'pad intrudes into road');}
 assert.throws(()=>auditPads([{...plan.launchPads![0],x:0,z:0}]),/pad intrudes/);
});
test('exact Cut 1 admission and measured render inventory',()=>{
 const p=buildPopulationPlan(plan,plan.populationPaths);assert.deepEqual(p.report.rejected,[]);assert.ok(p.report.activityAdmission?.every(r=>r.requested===r.admitted));assert.equal(p.actors.length,122);
 const cost=planRenderCost(plan);assert.ok(Number.isFinite(cost.triangles)&&cost.triangles>0);console.log('Quay baseline inventory',JSON.stringify(cost));
});
