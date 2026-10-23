/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createEuclaudeLevel} from './euclaudeLevel.ts';
import {buildPopulationPlan} from './populationPlan.ts';
import {POPULATION_AUTHORING} from '../data/tuning.ts';
const plan=createEuclaudeLevel(),policy=plan.populationActivity!;
test('Cut 1 rejects duplicate pace paths and mismatched requested census',()=>{
 assert.throws(()=>buildPopulationPlan({...plan,populationActivity:{...policy,paths:[...policy.paths,policy.paths[0]]}},plan.populationPaths),/One valid pace/);
 assert.throws(()=>buildPopulationPlan({...plan,populationActivity:{...policy,targets:{...policy.targets,people:policy.targets.people-1}}},plan.populationPaths),/target mismatch/);
});
test('every complete walking, crossing and traffic span clears the actual spawn exclusion',()=>{
 const s=plan.spawn.position;
 for(const path of plan.populationPaths!)for(let i=1;i<path.frames.length;i++){
  const a=path.frames[i-1],b=path.frames[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((s.x-a.x)*dx+(s.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  const radius=path.role==='traffic'?3:POPULATION_AUTHORING.pedestrianRadiusMetres;
  assert.ok(Math.hypot(s.x-a.x-t*dx,s.z-a.z-t*dz)>POPULATION_AUTHORING.spawnClearanceMetres+radius,`${path.id} span ${i}`);
 }
 for(const c of plan.populationCrossings!)for(const p of c.corners)assert.ok(Math.hypot(s.x-p.x,s.z-p.z)>9);
});
test('an excluded closed span refuses its whole path and explicitly reports underfill',()=>{
 const first=plan.populationPaths![0],bad={...first,frames:first.frames.map((p,i)=>i===8?{...p,...plan.spawn.position}:p)};
 const p=buildPopulationPlan({...plan,populationPaths:[bad,...plan.populationPaths!.slice(1)]},[bad,...plan.populationPaths!.slice(1)]);
 assert.ok(!p.paths.some(p=>p.id.startsWith(first.id+'/')));
 assert.ok(p.report.activityAdmission!.some(r=>r.pathId===first.id&&r.admitted===0&&r.requested===1));
});
