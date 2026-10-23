/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';import {strict as assert} from 'node:assert';
import * as THREE from 'three';
import {createEuclaudeLevel} from '../level/euclaudeLevel.ts';
import {riverScenery} from './riverScenery.ts';
import {buildQuayScenery} from '../level/quayScenery.ts';
import {PlanTerrainSampler} from '../simulation/planSampler.ts';
import {createTerrain} from './terrain.ts';
import {buildingSourceRecords} from './buildingSourceRecords.ts';
import {CAMERA,LIGHTING} from '../data/tuning.ts';
import {HARBOUR,HARBOUR_COLOURS,harbourSceneryTriangles} from '../level/harbourScenery.ts';
const plan=createEuclaudeLevel();
test('roof gap paint stays on the actual deck instead of disappearing beneath it',()=>{
 // Since 2026-10-22 the roof cues are the Quay scenery's ground layer, not plan paint.
 assert.equal(plan.markings!.filter(m=>m.points[0].y>10.9).length,0,'no roof paint left in the plan markings');
 const g=buildQuayScenery(plan)!.ground.positions,spec=plan.quayScenery!;let raised=0;
 const decks=[[-84,-64,-27,-11],[-84,-64,-7,17],[-84,-64,25,39],[-84,-24,39,59]];
 for(let i=0;i<g.length;i+=3){
  const x=g[i],y=g[i+1],z=g[i+2];if(y<5||spec.beds.some(b=>b.y>0&&x>b.x0-.4&&x<b.x1+.4&&z>b.z0-.4&&z<b.z1+.4))continue;
  assert.ok(y>11.005&&y<11.03,`roof paint at y ${y}`);
  assert.ok(decks.some(([x0,x1,z0,z1])=>x>=x0&&x<=x1&&z>=z0&&z<=z1),`roof paint off the deck at ${x},${z}`);raised++;
 }
 assert.ok(raised>100);
});
test('the boxes drawn as railing stay solid and occluding, and draw no block',()=>{
 const boxes=plan.segments.flatMap(s=>s.colliders),hidden=boxes.filter(b=>b.drawn===false);
 assert.ok(hidden.length>200&&hidden.every(b=>b.occludes===undefined),'undrawn boxes keep the camera ray');
 const sampler=new PlanTerrainSampler(plan);
 // The island edge still stops a ray at the masonry face, 1.4 m tall, and at the guard rail.
 assert.ok(Math.abs(sampler.raycast({x:110,y:1,z:0},{x:1,y:0,z:0},20)!-8)<1e-9);
 assert.ok(Math.abs(sampler.raycast({x:-74,y:12.4,z:0},{x:-1,y:0,z:0},20)!-9.75)<1e-9,'roof parapet face');
 const view=createTerrain({...plan,props:[],markings:[],hazards:[]});
 assert.equal(view.blockTriangles,(boxes.length-hidden.length)*12,'one twelve-triangle block per drawn box, none for the railings');
 view.dispose();
});
test('the harbour is one priced, opaque, non-casting mesh that the far plane never cuts',()=>{
 const r=plan.riverScenery!,mesh=riverScenery(plan)!,g=mesh.geometry,index=g.index!;
 const triangles=index.count/3;assert.equal(triangles,harbourSceneryTriangles(r),'the budget prices exactly what is built');
 assert.ok(triangles>1500&&triangles<=4000,`${triangles} triangles against the ~4,000 phone allowance`);
 assert.equal(Array.isArray(mesh.material),false);const material=mesh.material as THREE.MeshStandardMaterial;
 assert.equal(material.transparent,false);assert.equal(material.vertexColors,true);assert.equal(mesh.castShadow,false);
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color');
 const foam=new THREE.Color(HARBOUR_COLOURS.foam),open=new THREE.Color(HARBOUR_COLOURS.openWater);
 let waterReach=0,farthest=-1,foamAtWall=0,tallNearSouth=0,bridgeNorth=0;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),off=Math.max(Math.abs(x)-r.halfWidth,Math.abs(z)-r.halfDepth);
  assert.ok(off>=-1e-6,`vertex ${i} stands on the ridden island`);
  if(Math.abs(y-HARBOUR.waterY)<1e-6&&n.getY(i)>.9999){
   if(off<1e-6&&Math.abs(c.getX(i)-foam.r)<1e-6&&Math.abs(c.getZ(i)-foam.b)<1e-6)foamAtWall++;
   if(off>waterReach){waterReach=off;farthest=i;}
   continue;
  }
  // From any island camera a solid vertex stays short of the far plane, so the fog softens it and the clip never cuts it.
  assert.ok(Math.hypot(Math.abs(x)+r.halfWidth,Math.abs(z)+r.halfDepth,y)<=CAMERA.far-15,`vertex ${i} (${x.toFixed(0)}, ${z.toFixed(0)}) can reach the far plane`);
  if(z>r.halfDepth&&z<r.halfDepth+100&&y>24)tallNearSouth++;
  if(Math.abs(x)<=r.bridgeWidth!/2&&y>3)bridgeNorth=Math.min(bridgeNorth,z);
 }
 assert.ok(waterReach>=LIGHTING.fogFar,'open water runs past the haze from every wall');
 assert.ok(Math.abs(c.getZ(farthest)-open.b)<1e-6&&Math.abs(c.getX(farthest)-open.r)<1e-6,'deep open water at the far edge');
 assert.ok(foamAtWall>=8,'a foam line rings the wall foot');
 assert.ok(tallNearSouth>0,'the lighthouse stands off the south wall as the skyline anchor');
 assert.ok(bridgeNorth< -r.halfDepth-100,'the bridge deck runs out to the north shore');
 // The water sits above the surround field and well under the guard wall top, so the chase eye reads it over the wall.
 const wallTop=Math.max(...plan.segments.flatMap(s=>s.colliders).filter(b=>b.appearance==='concrete'&&Math.abs(Math.abs(b.centre.x)-(r.halfWidth-1))<1e-6).map(b=>b.centre.y+b.halfExtents.y));
 assert.ok(HARBOUR.waterY>plan.surround.height+.2&&HARBOUR.waterY<wallTop-1,`water y ${HARBOUR.waterY} against wall top ${wallTop}`);
 // Every face is wound the way its normal points: nothing turns inside out under back-face culling.
 const a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let t=0;t<index.count;t+=3){
  const [i,j,k]=[index.getX(t),index.getX(t+1),index.getX(t+2)];
  a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,j).sub(a);d.fromBufferAttribute(p,k).sub(a);normal.fromBufferAttribute(n,i);
  assert.ok(b.cross(d).dot(normal)>0,`triangle ${t/3} is wound against its normal`);
 }
 const again=riverScenery(plan)!;assert.deepEqual(Array.from(again.geometry.getAttribute('position').array),Array.from(p.array),'deterministic');
 for(const m of [mesh,again]){m.geometry.dispose();(m.material as THREE.Material).dispose();}
 assert.equal(riverScenery({...plan,riverScenery:undefined}),null);
});

test('warehouse facade caps remain below the y11 riding slab',()=>{
 // The four deck warehouses are the venue's only untagged blocks; the west street block stands in the open.
 for(const p of (plan.props??[]).filter(p=>p.kind==='building'&&p.look===undefined&&p.position.x< -20&&p.position.z<70&&p.position.z> -70))
  for(const part of buildingSourceRecords(p))assert.ok(p.position.y+part.y+part.sy<=11,`${part.part} protrudes through riding deck`);
});

test('terrain teardown owns the optional river resources',()=>{
 const view=createTerrain({...plan,props:[],markings:[],hazards:[]});
 let found=0,disposedGeometry=0,disposedMaterial=0;
 view.group.traverse(o=>{if(o instanceof THREE.Mesh && o.name==='river-and-far-banks'){found++;o.geometry.addEventListener('dispose',()=>disposedGeometry++);(o.material as THREE.Material).addEventListener('dispose',()=>disposedMaterial++);}});
 assert.equal(found,1);view.dispose();assert.equal(disposedGeometry,1);assert.equal(disposedMaterial,1);
});
