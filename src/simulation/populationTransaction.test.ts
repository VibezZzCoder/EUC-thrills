/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {resolvePopulationMotionBatch,type PopulationFootprint,type PopulationOccupant} from './population.ts';
import {EucController,type EucDynamicWorld} from './EucController.ts';
import {NEUTRAL_ACTIONS} from '../input/actions.ts';
import type {TerrainSampler} from './world.ts';

const body=(x:number,z=0,velocityX=0,velocityZ=0):PopulationFootprint=>({x,z,headingY:0,
  minY:0,maxY:2,halfWidthMetres:.1,halfLengthMetres:.1,velocityX,velocityZ});
const human=(id:string,from:PopulationFootprint,to=from,kind:'human'|'cop'='human'):PopulationOccupant=>
  ({id,kind,previous:from,current:to});

test('chronological batch removes an NPC suffix before a later cop can consume it',()=>{
  const actor={id:'walker',previous:body(0,0,4),current:body(4,0,4)};
  const early=human('human',body(1)),late=human('cop',body(3),undefined,'cop');
  const result=resolvePopulationMotionBatch([actor],[late,early]);
  assert.deepEqual(result.hits.map(value=>value.occupantId),['human']);
  assert.ok(result.actorFractions.walker<.21);
  assert.equal(result.occupantFractions.cop,1);
  assert.deepEqual(resolvePopulationMotionBatch([actor],[early,late]),result,'seat order cannot change the transaction');
});

test('a later moving cop can actually hit the NPC held at its earlier stop',()=>{
  const actor={id:'walker',previous:body(0,0,4),current:body(4,0,4)};
  const early=human('human',body(1));
  const cop=human('cop',body(.798,-3,0,4),body(.798,1,0,4),'cop');
  const result=resolvePopulationMotionBatch([actor],[early,cop]);
  assert.deepEqual(result.hits.map(value=>value.occupantId),['human','cop']);
  assert.ok(result.hits[1].timeOfImpact>.6);
  assert.equal(result.hits[1].actorVelocityX,0,'held means stopped, not a slower rescaled trajectory');
  assert.ok(result.occupantFractions.cop<.76);
});

test('simultaneous connected contacts freeze all participants from one immutable epoch',()=>{
  const actors=[{id:'a',previous:body(-1,0,2),current:body(1,0,2)},
    {id:'b',previous:body(1,0,-2),current:body(-1,0,-2)}];
  const occupant=human('middle',body(0));
  const result=resolvePopulationMotionBatch(actors,[occupant]);
  assert.deepEqual(result.hits.map(value=>value.actorId),['a','b']);
  assert.equal(result.actorFractions.a,result.actorFractions.b);
  assert.deepEqual(resolvePopulationMotionBatch([...actors].reverse(),[occupant]),result);
});

test('discontinuous and vertically clear bodies never create a population impact',()=>{
  const actors=[{id:'a',previous:body(0),current:body(0)}];
  const teleport={...human('teleport',body(-10),body(10)),teleported:true};
  const airborne=human('air', {...body(-10),minY:3,maxY:5},{...body(10),minY:3,maxY:5});
  assert.deepEqual(resolvePopulationMotionBatch(actors,[teleport,airborne]).hits,[]);
});

test('a body separating from an existing overlap can escape',()=>{
  const actors=[{id:'a',previous:body(0),current:body(0)}];
  const leaving=human('leave',body(.1),body(4,0,4));
  const result=resolvePopulationMotionBatch(actors,[leaving]);
  assert.deepEqual(result.hits,[]);assert.equal(result.occupantFractions.leave,1);
});

test('the global transaction prevents a cop controller charging on discarded NPC motion',()=>{
  const flat:TerrainSampler={sampleGround(_x,_z,out){out.height=0;out.normal.x=0;out.normal.y=1;out.normal.z=0;
    out.surface='pavement';out.offCourse=false;return out;},raycast(){return null;}};
  const world:EucDynamicWorld={hull:{halfWidthMetres:.1,halfLengthMetres:.1,heightMetres:2},resolveMotion:()=>null};
  const controllers=[1,3].map(x=>new EucController(flat,{spawn:{position:{x,y:0,z:0},headingY:0},dynamicWorld:world}));
  const before=controllers.map(controller=>controller.snapshot());
  const tokens=controllers.map(controller=>controller.prepareStep(1/120,NEUTRAL_ACTIONS));
  const ids=['early-human','late-cop'];
  const occupants=tokens.map((token,index)=>{
    const motion=token.dynamicMotionIntent!;assert.ok(motion);
    return human(ids[index],motion.previous,motion.proposed,index?'cop':'human');
  });
  const batch=resolvePopulationMotionBatch([{id:'npc',previous:body(0,0,480),current:body(4,0,480)}],occupants);
  assert.deepEqual(batch.hits.map(hit=>hit.occupantId),['early-human']);
  controllers.forEach((controller,index)=>controller.resolvePreparedStep(tokens[index],{...world,resolveMotion:()=>{
    const hit=batch.hits.find(hit=>hit.occupantId===ids[index]);
    return hit?{allowedMoveFraction:batch.occupantFractions[ids[index]],normalX:hit.normalX,normalZ:hit.normalZ,
      closingSpeedMetresPerSecond:480,chargeImpact:true}:null;
  }}));
  assert.deepEqual(controllers.map(controller=>controller.snapshot()),before,'not one live controller commits during resolution');
  controllers.forEach((controller,index)=>controller.commitPreparedStep(tokens[index],false));
  controllers.forEach((controller,index)=>controller.publishPreparedPlacements(tokens[index]));
  assert.equal(controllers[0].crashed,true,'the actual first high-speed impact is real');
  assert.equal(controllers[1].crashed,false,'no crash/impact is manufactured for the unreachable suffix');
  assert.equal(controllers[1].obstacleImpact,0);
});
