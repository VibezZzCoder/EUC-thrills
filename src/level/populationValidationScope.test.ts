/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Scoped preparation reuse must preserve independent fresh-context geometry. */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { LevelPlan } from './plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { clippedFieldTriangles } from './streetFronts.ts';
import { createPopulationValidationContext, createPopulationValidationScope,
  districtActivityReservedLane, populationPathSpanReason, type PopulationGroundSource,
  type AuthoredPopulationPath } from './populationPlan.ts';
const rect=(left:number,right:number,near:number,far:number)=>[
 {x:left,y:0,z:near},{x:right,y:0,z:near},{x:right,y:0,z:far},{x:left,y:0,z:far}];
const field={originX:-20,originZ:-20,spacing:1,columns:41,rows:41,heights:new Array<number>(1681).fill(0),
 surfaces:new Array<SurfaceId>(1600).fill('pavement')};
const source=(polygons:PopulationGroundSource['polygons']):PopulationGroundSource=>({id:'owned',purpose:'footpath',
 hostSegmentIds:['street'],groundPatchIds:[],polygons});
function fixture():LevelPlan{return {id:'efficiency-control',heightfield:field,surround:{height:0,surface:'grass'},
 spawn:{position:{x:-18,y:0,z:-18},headingY:0},checkpoints:[],props:[],solids:[],softBodies:[],
 segments:[{id:'street',entry:{position:{x:0,y:0,z:-10},headingY:0,surface:'pavement',halfWidth:3,gradient:0},
 exit:{position:{x:0,y:0,z:10},headingY:0,surface:'pavement',halfWidth:3,gradient:0},colliders:[]}],
 populationGroundSources:[source([rect(-5,5,-5,5)])],populationPaths:[]};}
function path():AuthoredPopulationPath{return {id:'walk',district:'commercial',role:'pedestrian',closed:false,serviceShuttle:false,
 frames:[{x:0,y:0,z:0,headingY:0,distanceMetres:0,halfWidthMetres:1,sourceSegmentId:'owned'},
 {x:0,y:0,z:0.5,headingY:0,distanceMetres:0.5,halfWidthMetres:1,sourceSegmentId:'owned'}]};}
test('footpath-only source and activity-path appends reuse the exact original movement tree',()=>{
 const plan=fixture(),original=path();plan.populationPaths=[original];
 const before=createPopulationValidationContext(plan);
 const extra=source([rect(5,7,5,7)]),checked={...plan,populationGroundSources:[...plan.populationGroundSources!,{...extra,id:'extra'}],
  populationPaths:[...plan.populationPaths!,{...original,id:'district-activity/new-walk'}]};
 const after=createPopulationValidationContext(checked,before);
 assert.ok(before.movementTree);assert.equal(after.movementTree,before.movementTree);
 assert.equal(after.invalidMovement,before.invalidMovement);assert.equal(after.boxes,before.boxes);
 assert.notEqual(after.spanProofs,before.spanProofs);
 assert.equal(after.validGroundSources.get('extra'),checked.populationGroundSources[1]);
 for(const x of [-5,-1,0,1,5])for(const z of [-3,0,.25,3,6]){
  const q=rect(x-.1,x+.1,z-.1,z+.1);
  assert.equal(districtActivityReservedLane(checked,q,undefined,undefined,after),districtActivityReservedLane(checked,q,undefined,undefined,createPopulationValidationContext(checked)));
 }
});
test('a real original-path append rebuilds movement and refuses the known-bad stale-clear control',()=>{
 const plan=fixture(),before=createPopulationValidationContext(plan),q=rect(9.9,10.1,.1,.3);
 assert.equal(districtActivityReservedLane(plan,q,undefined,undefined,before),false);
 const added={...path(),id:'actual-traffic',role:'traffic' as const,frames:path().frames.map(f=>({...f,x:10}))};
 const changed={...plan,populationPaths:[added]},after=createPopulationValidationContext(changed,before);
 assert.notEqual(after.movementTree,before.movementTree);
 const actual=districtActivityReservedLane(changed,q,undefined,undefined,after);
 assert.equal(actual,true);assert.equal(actual,districtActivityReservedLane(changed,q,undefined,undefined,createPopulationValidationContext(changed)));
 // A shortcut that retained the old clear answer would fail this predicate.
 assert.notEqual(actual,districtActivityReservedLane(plan,q,undefined,undefined,before));
});
test('turn courts and thin crossings rebuild movement after exact source metadata changes',()=>{
 const plan=fixture(),before=createPopulationValidationContext(plan),q=rect(5.9,6.1,5.9,6.1);
 assert.equal(districtActivityReservedLane(plan,q,undefined,undefined,before),false);
 const court={...source([rect(5,7,5,7)]),id:'court',purpose:'turn-court' as const};
 const changed={...plan,populationGroundSources:[...plan.populationGroundSources!,court]};
 const courtContext=createPopulationValidationContext(changed,before);
 assert.notEqual(courtContext.movementTree,before.movementTree);
 assert.equal(districtActivityReservedLane(changed,q,undefined,undefined,courtContext),districtActivityReservedLane(changed,q,undefined,undefined,createPopulationValidationContext(changed)));
 assert.equal(districtActivityReservedLane(changed,q,undefined,undefined,courtContext),true);
 const crossed={...plan,populationCrossings:[{id:'thin',sourceId:'owned',priority:'pedestrian' as const,
  pedestrianPathIds:[],vehiclePathIds:[],corners:rect(5.999,6.001,5,7)}]};
 const crossingContext=createPopulationValidationContext(crossed,before);
 assert.notEqual(crossingContext.movementTree,before.movementTree);
 assert.equal(districtActivityReservedLane(crossed,q,undefined,undefined,crossingContext),true);
 assert.equal(districtActivityReservedLane(crossed,q,undefined,undefined,crossingContext),districtActivityReservedLane(crossed,q,undefined,undefined,createPopulationValidationContext(crossed)));
});
test('nested original-frame coordinate edits cannot reuse a snapshot of old reservations',()=>{
 const plan=fixture(),walk=path();plan.populationPaths=[walk];const before=createPopulationValidationContext(plan);
 const q=rect(9.9,10.1,.1,.3);assert.equal(districtActivityReservedLane(plan,q,undefined,undefined,before),false);
 for(const frame of walk.frames)(frame as {x:number}).x=10;
 const changed={...plan},after=createPopulationValidationContext(changed,before);
 assert.notEqual(after.movementTree,before.movementTree);
 assert.equal(districtActivityReservedLane(changed,q,undefined,undefined,after),true);
 assert.equal(districtActivityReservedLane(changed,q,undefined,undefined,after),districtActivityReservedLane(changed,q,undefined,undefined,createPopulationValidationContext(changed)));
});
test('nested source and crossing coordinates invalidate movement even with unchanged array references',()=>{
 for(const kind of ['source','crossing'] as const){
  const plan=fixture(),polygon=rect(-1,1,-1,1);
  if(kind==='source')plan.populationGroundSources=[{...source([polygon]),purpose:'turn-court'}];
  else plan.populationCrossings=[{id:'crossing',sourceId:'owned',priority:'pedestrian',pedestrianPathIds:[],vehiclePathIds:[],corners:polygon}];
  const before=createPopulationValidationContext(plan),q=rect(9.9,10.1,-.1,.1);
  assert.equal(districtActivityReservedLane(plan,q,undefined,undefined,before),false);
  for(const point of polygon)point.x+=10;
  const changed={...plan},after=createPopulationValidationContext(changed,before);
  assert.notEqual(after.movementTree,before.movementTree);
  assert.equal(districtActivityReservedLane(changed,q,undefined,undefined,after),true);
  assert.equal(districtActivityReservedLane(changed,q,undefined,undefined,after),districtActivityReservedLane(changed,q,undefined,undefined,createPopulationValidationContext(changed)));
 }
});
test('static and precise-ground edits rebuild only their own context data and retain exact truth',()=>{
 const plan=fixture(),walk=path();plan.populationPaths=[walk];const before=createPopulationValidationContext(plan);
 const changed={...plan,solids:[{centre:{x:0,y:.8,z:.25},halfExtents:{x:.7,y:.8,z:.01},rotationY:.4,surface:'wood' as const}]};
 const after=createPopulationValidationContext(changed,before);
 assert.equal(after.movementTree,before.movementTree);assert.notEqual(after.boxes,before.boxes);
 assert.equal(populationPathSpanReason(changed,new PlanTerrainSampler(changed),walk.frames[0],walk.frames[1],walk,after),'solid');
 assert.throws(()=>populationPathSpanReason(changed,new PlanTerrainSampler(changed),walk.frames[0],walk.frames[1],walk,before),/different finished plan/);
 const revised={...plan,groundSurfacePatches:[{id:'bad-surface',surface:'spill' as const,triangles:clippedFieldTriangles(field,rect(-1,1,-1,1),0)!}]};
 const revisedContext=createPopulationValidationContext(revised,before);
 assert.equal(revisedContext.movementTree,before.movementTree);
 assert.notEqual(revisedContext.patchesByCell,before.patchesByCell);
 assert.equal(populationPathSpanReason(revised,new PlanTerrainSampler(revised),walk.frames[0],walk.frames[1],walk,revisedContext),'surface');
});
test('one-slot validation scopes preserve same-plan identity, reject stale edits and do not cross-scope cache',()=>{
 const plan=fixture();plan.populationPaths=[path()];const scope=createPopulationValidationScope(),first=scope(plan);
 assert.equal(scope(plan),first);assert.notEqual(createPopulationValidationScope()(plan),first);
 const other={...plan,id:'other'};const second=scope(other);assert.notEqual(second,first);
 const returned=scope(plan);assert.notEqual(returned,first);assert.equal(returned.movementTree,first.movementTree);
 plan.solids=[{centre:{x:10,y:.8,z:10},halfExtents:{x:1,y:.8,z:1},rotationY:0,surface:'wood'}];
 assert.throws(()=>scope(plan),/finished-plan edit/);
});
test('same-plan nested movement edits are rejected by a scope before it returns stale reservations',()=>{
 const plan=fixture(),walk=path();plan.populationPaths=[walk];const scope=createPopulationValidationScope();scope(plan);
 (walk.frames[1] as {halfWidthMetres:number}).halfWidthMetres=10;
 assert.throws(()=>scope(plan),/finished-plan movement edit/);
});
