/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { BoxCollider } from '../level/plan.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import type { ObstacleHit, ObstacleInitialExit, RagdollObstacleQuery, Vec3 } from './world.ts';

const flat = buildLevelPlan([{ id: 'flat', length: 80, halfWidth: 30, surface: 'pavement', shoulder: 2 }],
  { id: 'normal-probe', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'pavement' }, spacing: 4 });
const box = (z: number, rotationY = 0): BoxCollider => ({ centre: { x: 0, y: 1, z }, halfExtents: { x: 2, y: 1, z: .5 }, rotationY, surface: 'pavement' });
const output = (): ObstacleHit => ({ distance: 0, halfExtentX: 0, halfExtentZ: 0, normal: { x: 9, y: 9, z: 9 } });

test('optional normals preserve distance and nearest selection, including rotated and parallel rays', () => {
  for (const angle of [0, .6]) {
    const sampler = new PlanTerrainSampler({ ...flat, solids: [box(8, -.3), box(4, angle)] }), out = output();
    const origin = { x: -Math.sin(angle) * 4, y: 1, z: 4 - Math.cos(angle) * 4 }, direction = { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
    const plain = sampler.raycastObstacle(origin, direction, 20), annotated = sampler.raycastObstacle(origin, direction, 20, 0, undefined, out);
    assert.equal(annotated, plain); assert.ok(annotated !== null);
    assert.ok(Math.abs(out.normal!.x + Math.sin(angle)) < 1e-9 && Math.abs(out.normal!.z + Math.cos(angle)) < 1e-9 && out.normal!.y === 0,
      'the metadata names the nearest entering face');
    assert.equal(out.distance, plain);
  }
});

test('inside-origin normals retain zero distance and misses leave the caller buffer alone', () => {
  const sampler = new PlanTerrainSampler({ ...flat, solids: [box(4, .4)] }), out = output();
  const origin = { x: 0, y: 1, z: 4 }, direction = { x: 0, y: 0, z: 1 };
  assert.equal(sampler.raycastObstacle(origin, direction, 10), 0);
  assert.equal(sampler.raycastObstacle(origin, direction, 10, 0, undefined, out), 0);
  assert.ok(Math.abs(Math.hypot(out.normal!.x, out.normal!.y, out.normal!.z) - 1) < 1e-9);
  const previous = { ...out.normal! };
  assert.equal(sampler.raycastObstacle({ x: 20, y: 1, z: 0 }, direction, 10, 0, undefined, out), null);
  assert.deepEqual(out.normal, previous);
});

function face(sampler: PlanTerrainSampler,origin: Vec3,direction: Vec3): ObstacleInitialExit {
  const out: ObstacleHit={...output(),inside:false,colliderIndex:-1,faceOffset:0};
  assert.equal(sampler.raycastObstacle(origin,direction,2,0,undefined,out),0);
  assert.equal(out.inside,true);
  return {colliderIndex:out.colliderIndex!,normal:{...out.normal!},faceOffset:out.faceOffset!,slack:.01};
}
function finalExit(sampler: PlanTerrainSampler,origin: Vec3,end: Vec3,certificate: ObstacleInitialExit,radius=.1) {
  const direction={x:end.x-origin.x,y:end.y-origin.y,z:end.z-origin.z};
  return sampler.raycastObstacle(origin,direction,Math.hypot(direction.x,direction.y,direction.z),radius,undefined,undefined,certificate);
}

test('earned initial overlap permits only a full-radius outward exit of the recorded face',()=>{
  for(const angle of [0,.6]) {
    const sampler=new PlanTerrainSampler({...flat,solids:[box(4,angle)]});
    const origin={x:-.2*Math.sin(angle),y:1,z:4-.2*Math.cos(angle)},direction={x:-Math.sin(angle),y:0,z:-Math.cos(angle)};
    const certificate=face(sampler,origin,direction);
    assert.ok(Math.abs(certificate.faceOffset-(-4*Math.cos(angle)+.5))<1e-9);
    const at=(distance:number)=>({x:origin.x+direction.x*distance,y:1,z:origin.z+direction.z*distance});
    assert.equal(finalExit(sampler,origin,at(.45),certificate),null);
    for(const distance of [.1,.3,.35])assert.notEqual(finalExit(sampler,origin,at(distance),certificate),null,'centre clearance is insufficient when radius remains in the box');
    assert.notEqual(finalExit(sampler,origin,at(-1),certificate),null,'leaving the opposite face cannot spend this certificate');
    assert.equal(sampler.raycastObstacle(origin,direction,.45,.1),0,'missing primary metadata preserves the strict ordinary ray');
    assert.notEqual(finalExit(sampler,origin,at(.45),{...certificate,faceOffset:certificate.faceOffset+.1}),null);
  }
});

test('initial exit checks other colliders in both the overlapped prefix and clear suffix, with full3-axis radius',()=>{
  const origin={x:0,y:1,z:3.8},end={x:0,y:1,z:3.25},direction={x:0,y:0,z:-1};
  const original=new PlanTerrainSampler({...flat,solids:[box(4)]}),certificate=face(original,origin,direction);
  assert.equal(finalExit(original,origin,end,certificate),null);
  const other=(x:number,y:number,z:number):BoxCollider=>({centre:{x,y,z},halfExtents:{x:.025,y:.025,z:.025},rotationY:0,surface:'pavement'});
  for(const obstacle of [other(0,1,3.75),other(0,1,3.3),other(.12,1,3.3),other(0,1.12,3.3)]) {
    const sampler=new PlanTerrainSampler({...flat,solids:[box(4),obstacle]});
    assert.notEqual(finalExit(sampler,origin,end,certificate),null,'a second collider cannot hide behind the initially nearest hit');
  }
});

test('roof and side certificates require their own outward face; zero-distance boundary is not inside',()=>{
  const sampler=new PlanTerrainSampler({...flat,solids:[box(4)]});
  for(const [origin,direction,end] of [
    [{x:0,y:1.9,z:4},{x:0,y:1,z:0},{x:0,y:2.2,z:4}],
    [{x:1.9,y:1,z:4},{x:1,y:0,z:0},{x:2.2,y:1,z:4}],
  ] as const)assert.equal(finalExit(sampler,origin,end,face(sampler,origin,direction)),null);
  const origin={x:0,y:1,z:3.5},direction={x:0,y:0,z:-1},out:ObstacleHit={...output(),inside:false,colliderIndex:-1,faceOffset:0};
  assert.equal(sampler.raycastObstacle(origin,direction,1,0,undefined,out),0);assert.equal(out.inside,false);
  assert.notEqual(finalExit(sampler,origin,{x:0,y:1,z:3.2},{colliderIndex:0,normal:out.normal!,faceOffset:out.faceOffset!,slack:.01}),null);
});

test('rag limb collection finds a shin box missed by endpoint centre casts and reports bounded overflow',()=>{
  const obstacle:BoxCollider={centre:{x:0,y:1,z:4},halfExtents:{x:.05,y:.5,z:.5},rotationY:0,surface:'pavement'},sampler=new PlanTerrainSampler({...flat,solids:[obstacle]});
  const query:RagdollObstacleQuery={minX:-.6,maxX:.2,minY:.6,maxY:1.7,minZ:3.5,maxZ:4.5,records:new Float64Array(18),recordOffset:0,capacity:2,count:0,overflow:false,fulfilled:false};
  const origin={x:-.2,y:.7,z:3.9},direction={x:0,y:0,z:1};
  assert.equal(sampler.raycastObstacle(origin,direction,.1),null);
  assert.equal(sampler.raycastObstacle(origin,direction,.1,0,undefined,undefined,undefined,query),null,'candidate gathering cannot change the ordinary centre-ray result');
  assert.equal(query.fulfilled,true);assert.equal(query.count,1);assert.equal(query.overflow,false);assert.deepEqual(Array.from(query.records.slice(1,7)),[0,1,4,.05,.5,.5]);
  query.capacity=0;
  assert.equal(sampler.raycastObstacle(origin,direction,.1,0,undefined,undefined,undefined,query),null);
  assert.equal(query.count,0);assert.equal(query.overflow,true,'a capacity limit cannot silently turn the omitted finite box into free space');
});

test('requested underlying terrain keeps a roof finite and leaves the ordinary ground winner unchanged',()=>{
  const sampler=new PlanTerrainSampler({...flat,solids:[box(4)]}),ordinary={height:0,normal:{x:0,y:1,z:0},surface:'pavement' as const,offCourse:false};
  const annotated={...ordinary,normal:{...ordinary.normal},base:{height:NaN,normal:{x:0,y:0,z:0}}};
  sampler.sampleGround(0,4,ordinary);sampler.sampleGround(0,4,annotated);
  assert.equal(ordinary.height,2);assert.equal(annotated.height,ordinary.height);assert.deepEqual(annotated.normal,ordinary.normal);assert.equal(annotated.base.height,0);
});
