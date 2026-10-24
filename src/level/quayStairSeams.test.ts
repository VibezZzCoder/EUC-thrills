/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createEuclaudeLevel} from './euclaudeLevel.ts';
import {quayBox} from './quayQuarter.ts';
import {copingSolid} from './quayScenery.ts';
import {quayController} from './quayRide.test-support.ts';
import {PlanTerrainSampler} from '../simulation/planSampler.ts';
import {createGroundSample} from '../simulation/world.ts';
import {NEUTRAL_ACTIONS} from '../input/actions.ts';
import type {BoxCollider,LevelPlan} from './plan.ts';
/**
 * The grand stair's seams (2026-10-23). The owner's iPhone ride found a 0.25 m
 * slot between the deck and its rear wall (z −0.25…0) that dropped him to y0
 * and held him; Codex's audit found the same family at the stair cheeks
 * (x 37.85…38, 46…46.15) and between the deck's east guard and the return
 * ramp's wall (x 49.5…49.8). Each ride below is the production controller on
 * the shipped plan, and each has a control that puts the old box back and must
 * fail the same ride, so a pass is the closure rather than a quiet probe.
 */
const plan=createEuclaudeLevel();
const same=(a:BoxCollider,b:BoxCollider)=>(['x','y','z'] as const).every(k=>Math.abs(a.centre[k]-b.centre[k])<1e-9&&Math.abs(a.halfExtents[k]-b.halfExtents[k])<1e-9);
/** The plan with each [now, before] box swapped back, and each `gone` box removed, for the failing controls. */
function before(swaps:[BoxCollider,BoxCollider][],gone:BoxCollider[]=[]):LevelPlan{
 let found=0,removed=0;
 const segments=plan.segments.map(s=>({...s,colliders:s.colliders.filter(c=>{const hit=gone.some(g=>same(c,g));if(hit)removed++;return !hit;}).map(c=>{const hit=swaps.find(([now])=>same(c,now));if(!hit)return c;found++;return {...c,centre:{...hit[1].centre},halfExtents:{...hit[1].halfExtents}};})}));
 assert.equal(found,swaps.length,'every swapped box is in the plan');assert.equal(removed,gone.length,'every removed box is in the plan');
 return {...plan,segments};
}
function ride(p:LevelPlan,x:number,z:number,heading:number,speed:number,ticks:number,throttle=1){
 const c=quayController(p);c.reset({position:{x,y:0,z},headingY:heading},speed);
 const trace:{x:number;y:number;z:number;crashed:boolean}[]=[];
 for(let t=0;t<ticks;t++){c.step(1/120,{...NEUTRAL_ACTIONS,throttle});const s=c.snapshot();trace.push({...s.position,crashed:s.crashed});}
 return {trace,end:c.snapshot()};
}
const ground=(p:LevelPlan,x:number,z:number)=>new PlanTerrainSampler(p).sampleGround(x,z,createGroundSample()).height;

test('the rear rail slot is closed: riding off the deck backwards meets the wall at deck height',()=>{
 // Deck up to the coping's lip at z −0.18, then the coping's solid top (1.48) over the old slot.
 for(let x=35.05;x<50;x+=.5)for(const [z,y] of [[-.249,1.48],[-.19,1.48],[-.17,1.2],[-.001,1.2]])assert.ok(Math.abs(ground(plan,x,z)-y)<1e-9,`ground under ${x.toFixed(2)},${z}`);
 // Codex's repro: x42, z0.02, heading π, 1 m/s, throttle held 600 ticks; once ended at y0, blocked.
 for(const [x,heading,speed] of [[42,Math.PI,1],[35.5,Math.PI,1],[49.7,Math.PI,1],[42,Math.PI,4],[40,Math.PI-.6,2]] as const){
  const r=ride(plan,x,heading===Math.PI?.02:2,heading,speed,600),label=JSON.stringify({x,heading,speed});
  // Along the wall the wheel stays at deck height: no slot to drop into, and the coping's
  // solid makes the step onto the masonry 0.28 m, over the 0.216 m step-up (2026-10-23).
  // (The diagonal ride slides along the wall and off the open ramp-top edge past x 50.)
  const along=r.trace.filter(p=>p.x<50);
  assert.ok(along.length>0&&along.every(p=>Math.abs(p.y-1.2)<1e-6&&p.z>-.18),label+' stays on the deck, short of the coping');
  if(x!==40)assert.ok(Math.abs(r.end.position.y-1.2)<1e-6&&r.end.blocked,label);
 }
 // A hop is how a rider gets up there: it lands on the coping's drawn top.
 const hop=(()=>{const c=quayController(plan);c.reset({position:{x:42,y:0,z:1.5},headingY:Math.PI},2);
  for(let t=0;t<600;t++)c.step(1/120,{...NEUTRAL_ACTIONS,throttle:1,hop:t===20});return c.snapshot().position;})();
 assert.ok(Math.abs(hop.y-1.48)<1e-6,`hop lands on the coping top, y ${hop.y}`);
 // Backing into the wall, and the deck's north-west corner where the west guard now closes on it.
 assert.ok(ride(plan,42,.4,0,0,600,-1).trace.every(p=>Math.abs(p.y-1.2)<1e-6&&p.z>-.18),'reversing into the wall');
 assert.ok(ride(plan,35.6,-.12,-Math.PI/2,0,600).trace.every(p=>p.y>1.2-1e-6&&p.x>34.5),'the corner holds the rider on the deck');
 // Control: the old deck and connector edges at z0, with a render-only coping, reproduce the drop that cannot climb out.
 const old=before([[quayBox(35,49,-.25,12,1.2),quayBox(35,49,0,12,1.2)],[quayBox(49,54,-.25,1,1.2),quayBox(42,54,0,1,1.2)]],[copingSolid(quayBox(35,50,-.75,-.25,1.4,0,'brick'))]);
 const control=ride(old,42,.02,Math.PI,1,600);
 assert.ok(control.end.position.y<.01&&control.end.blocked&&!control.end.crashed,'control: the old slot drops and holds the rider');
});

test('the stair cheeks have no slot: treads meet the cheeks, as the drawn cheek walls do',()=>{
 for(let i=0;i<11;i++){const z=12.4+i*.8,top=(11-i)*.1;
  for(const x of[37.925,46.075])assert.ok(Math.abs(ground(plan,x,z)-top)<1e-9,`tread under ${x},${z}`);}
 for(const [x,cx,side] of [[37.925,38.3,-1],[46.075,45.7,1]] as const){
  // Off the deck exactly into the old slot: the rider rolls down the edge treads, never below them.
  const r=ride(plan,x,11.5,0,1,240);
  for(const p of r.trace)if(p.z>12.05&&p.z<20.75)assert.ok(p.y>(11-Math.floor((p.z-12)/.8))*.1-.02,`side ${side} below the tread at z ${p.z.toFixed(2)}: y ${p.y.toFixed(3)}`);
  // Into the cheek from a tread: it stops at the cheek on that tread.
  const into=ride(plan,cx,12.4,side*Math.PI/2,0,600);
  assert.ok(into.trace.every(p=>p.y>1.1-1e-6)&&Math.abs(into.end.position.x-cx)<.4&&into.end.blocked,`side ${side} into the cheek`);
 }
 // Control: the old 8 m treads leave both slots open to the plaza floor.
 const old=before(Array.from({length:11},(_,i)=>[quayBox(37.55,46.45,12+i*.8,12+(i+1)*.8,(11-i)*.1),quayBox(38,46,12+i*.8,12+(i+1)*.8,(11-i)*.1)] as [BoxCollider,BoxCollider]));
 assert.ok(ride(old,37.925,11.5,0,1,240).trace.some(p=>p.z>12.05&&p.z<18&&p.y<.05),'control: the old west slot drops the wheel to y0');
});

test('the deck guard meets the return ramp wall: no channel between them',()=>{
 for(let z=1.05;z<12;z+=.5)assert.ok(Math.abs(ground(plan,49.65,z)-2.8)<1e-9,`guard under 49.65,${z}`);
 // From the ramp-top connector along +z, and from the plaza along −z: the guard's ends stop both.
 const top=ride(plan,49.65,.5,0,1,600),plaza=ride(plan,49.65,14,Math.PI,0,600);
 assert.ok(top.trace.every(p=>p.z<1&&p.y>1.2-1e-6),'the connector rider stays on the connector');
 assert.ok(plaza.trace.every(p=>p.z>12-1e-6),'the plaza rider meets the guard face');
 // Control: the old 0.5 m guard leaves the 0.3 m channel, which the connector rider drops into.
 const old=before([[quayBox(49,49.8,1,12,2.8,0,'brick'),quayBox(49,49.5,1,12,2.8,0,'brick')]]);
 assert.ok(ride(old,49.65,.5,0,1,600).trace.some(p=>p.z>2&&p.y<1),'control: the old channel takes the rider');
});
