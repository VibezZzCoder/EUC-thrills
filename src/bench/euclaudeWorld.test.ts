/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createEuclaudeLevel} from '../level/euclaudeLevel.ts';
import {preparePopulationWorld} from '../app/populationWorld.ts';
import {QUAY_LINES} from '../level/euclaudeLines.ts';
import {naturalRide} from '../level/quayRide.test-support.ts';
const source=createEuclaudeLevel(),world=preparePopulationWorld(source);
const pathOf=(id:string)=>world.population.paths.find(p=>p.id===id)!;
const startOf=(a:(typeof world.population.actors)[number])=>{const pts=pathOf(a.pathId).points;let i=1;while(i<pts.length-1&&pts[i].distanceMetres<a.initialDistanceMetres)i++;
 const p=pts[i-1],q=pts[i],t=(a.initialDistanceMetres-p.distanceMetres)/(q.distanceMetres-p.distanceMetres||1);return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t,z:p.z+(q.z-p.z)*t};};
test('prepared venue admits the exact Cut 1 census, three connected crossings, and one pace per path',()=>{
 const p=world.population;assert.deepEqual(p.report.rejected,[]);assert.equal(p.actors.length,122);
 assert.deepEqual(Object.fromEntries(['walker','jogger','social','trafficVehicle','fictionalEuc'].map(k=>[k,p.actors.filter(a=>a.kind===k).length])),{walker:34,jogger:3,social:68,trafficVehicle:15,fictionalEuc:2});
 assert.equal(p.crossings?.length,3);for(const c of p.crossings??[])assert.ok(c.pedestrianPathIds.length&&c.vehiclePathIds.length);
 for(const path of p.paths)assert.ok(new Set(p.actors.filter(a=>a.pathId===path.id).map(a=>a.speedMetresPerSecond)).size<=1);
 assert.equal(world.level.recordWorldId,'euclaude-r2');
 assert.deepEqual(preparePopulationWorld(createEuclaudeLevel()),world);
});
test('prepared crowd: small parties, nobody on the bowl rim, onlookers at every stunt area',()=>{
 const p=world.population,people=p.actors.filter(a=>a.kind==='walker'||a.kind==='jogger'||a.kind==='social');
 // One pace per path and no passing: a path with many walkers is a single file for ever.
 for(const path of p.paths)if(path.role==='pedestrian')assert.ok(p.actors.filter(a=>a.pathId===path.id&&a.kind!=='social').length<=3,path.id);
 // Bowl copings at x 38 / 46 (z 21.6–43.6) and z 43.6: every walk and person 1.5 m back.
 const rim=(q:{x:number;z:number})=>Math.hypot(Math.max(36.5-q.x,0,q.x-47.5),Math.max(20.1-q.z,0,q.z-45.1))===0;
 for(const path of p.paths)if(path.role==='pedestrian')for(const q of path.points)assert.ok(!rim(q),`${path.id} at ${q.x},${q.z}`);
 // Roof deck spectator spots (y 11), the park pads, the waterfront by L5 and the landing bowl.
 const near=(x:number,z:number,r:number,deck:boolean)=>people.some(a=>{const s=startOf(a);return (s.y>10.5)===deck&&Math.hypot(s.x-x,s.z-z)<r;});
 for(const [x,z] of [[-81.5,-13.5],[-66.5,-13.5],[-81.5,14.5],[-66.5,14.5],[-81.5,28],[-44,56.5],[-60,42.5]])assert.ok(near(x,z,2.5,true),`roof ${x},${z}`);
 for(const [x,z] of [[28,-49],[46,-49],[38,-35.5],[-58,84],[-24,85],[34,30]])assert.ok(near(x,z,2.5,false),`onlookers ${x},${z}`);
});
test('prepared traffic: three loops spaced at start, the outer ring listed at every crossing it passes',()=>{
 const p=world.population,cars=p.actors.filter(a=>a.kind==='trafficVehicle');
 assert.deepEqual(Object.fromEntries(['quay-east-traffic','quay-west-traffic','quay-ring-traffic'].map(id=>[id,cars.filter(a=>a.pathId===`${id}/clear-0`).length])),
  {'quay-east-traffic':4,'quay-west-traffic':4,'quay-ring-traffic':7});
 for(const path of p.paths.filter(q=>q.role==='traffic')){const at=cars.filter(a=>a.pathId===path.id).map(a=>a.initialDistanceMetres).sort((a,b)=>a-b);
  at.forEach((d,i)=>assert.ok(((at[(i+1)%at.length]-d+path.lengthMetres)%path.lengthMetres||path.lengthMetres)>=40,path.id));}
 for(const c of p.crossings??[]){const xs=c.corners.map(q=>q.x),zs=c.corners.map(q=>q.z);
  for(const path of p.paths.filter(q=>q.role==='traffic'))if(path.points.some(q=>q.x>=Math.min(...xs)&&q.x<=Math.max(...xs)&&q.z>=Math.min(...zs)&&q.z<=Math.max(...zs)))
   assert.ok(c.vehiclePathIds.includes(path.id),`${c.id} omits ${path.id}`);}
});
for(const line of QUAY_LINES)test(`prepared ${line.id}: natural full throttle does not reach an activity span or the ring road`,()=>{
 const r=naturalRide(world.level,line);assert.equal(r.end.crashed,false);assert.equal(r.lands,line.landings);
 const radius=line.id==='L1'?0:1.2;
 for(const t of r.trace){if(t.y>4)continue;
  for(const path of world.population.paths)for(const p of path.points)assert.ok(Math.hypot(t.x-p.x,t.z-p.z)>radius+path.clearanceRadiusMetres,`${line.id} meets ${path.id} at ${t.x},${t.z}`);
 }
});
// Since the QA fix round the catches are pass-through planting (§45.10): a held
// throttle rides through them like any city street, so only the island edge and
// automatic recovery are promised here, not clearance from paths or roads.
for(const line of QUAY_LINES)test(`prepared ${line.id}: NEVER release throttle; stays on the island and recovers`,()=>{
 const r=naturalRide(world.level,line,0,false);assert.ok(r.trace.some(t=>t.crashed),'a terminal crash must be exercised');assert.equal(r.end.crashed,false,'automatic recovery');
 assert.ok(r.lands>=line.landings);
 for(const t of r.trace){const pts:{x:number;y:number;z:number}[]=[t];for(let i=0;i<t.body.length;i+=3)pts.push({x:t.body[i],y:t.body[i+1],z:t.body[i+2]});
  for(const q of pts)assert.ok(Math.abs(q.x)+.4<120&&Math.abs(q.z)+.4<90,`${line.id} leaves the island at ${q.x},${q.z}`);
 }
});
