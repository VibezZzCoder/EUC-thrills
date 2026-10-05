/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Root-owned native geometry controls; drafting worker has not executed them. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan,GroundSurfacePatch,BoxCollider } from './plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { clippedFieldTriangles } from './streetFronts.ts';
import { hash128 } from './planDigest.ts';
import { PROP_SOLIDS } from '../data/props.ts';
import { POPULATION_AUTHORING as P } from '../data/tuning.ts';
import { buildPopulationPlan } from './populationPlan.ts';
import { withDistrictActivity } from './districtActivity.ts';
import { planRenderCost } from './renderBudget.ts';
import { withDistrictComposition,districtCompositionGroundReason,districtCompositionPlacementReason,districtCompositionGrounding,
 type DistrictCompositionPlan,type DistrictCompositionGround } from './districtComposition.ts';
const rect=(left:number,right:number,near:number,far:number)=>[
 {x:left,y:0,z:near},{x:right,y:0,z:near},{x:right,y:0,z:far},{x:left,y:0,z:far}];
const field={originX:-40,originZ:-30,spacing:1,columns:81,rows:61,heights:new Array<number>(4941).fill(0),
 surfaces:Array.from({length:4800},(_,i):SurfaceId=>{const row=Math.floor(i/80),z=-30+row;return z>=9&&z<15?'pavement':'grass';})};
const patch=(id:string,left:number,right:number,near:number,far:number):GroundSurfacePatch=>({id,surface:'pavement',sourceSurface:'grass',
 triangles:clippedFieldTriangles(field,rect(left,right,near,far),0,{allowedSurfaces:['grass'],maximumHeightDifference:.1,
  maximumGradient:.1,maximumCellsPerPolygon:512})!});
function fixture(park=false,width=28,district:'commercial'|'residential'|'industrial'='commercial'):DistrictCompositionPlan{
 const source:LevelPlan={id:'composition-fixture',heightfield:field,surround:{height:0,surface:'grass'},
 spawn:{position:{x:-35,y:0,z:-25},headingY:0},checkpoints:[],props:[{kind:'building',look:district,scale:1,
  rotationY:0,position:{x:0,y:0,z:-5},size:{x:width,y:6,z:10}}],
 solids:[{centre:{x:0,y:3,z:-5},halfExtents:{x:width/2,y:3,z:5},rotationY:0,surface:'pavement'}],softBodies:[],
 groundSurfacePatches:[patch('front-base-grass',-width/2,width/2,0,2.1),patch('front-access-grass',-1,1,2.1,9)],
 populationPaths:park?[{id:'original-park',role:'pedestrian',district:'park',closed:false,serviceShuttle:false,
  frames:Array.from({length:31},(_,i)=>({x:-15+i,y:0,z:-15,headingY:Math.PI/2,distanceMetres:i,halfWidthMetres:1,sourceSegmentId:'street'}))}]:[],segments:[{id:'street',entry:{position:{x:-30,y:0,z:12},headingY:Math.PI/2,halfWidth:3,gradient:0,surface:'pavement'},
  exit:{position:{x:30,y:0,z:12},headingY:Math.PI/2,halfWidth:3,gradient:0,surface:'pavement'},colliders:[]}]};
 return withDistrictActivity({...source,districtAdjacency:{revision:'district-v1',sourceWorldId:source.id,physicalWorldId:source.id,
  frontages:[{id:'front',propIndex:0,district,role:'commercial-forecourt',streetSegmentId:'street',
   position:{x:0,y:0,z:0},yaw:0,width,reach:9,retainedOpening:false,patchIds:['front-base-grass','front-access-grass']}],
  groups:[],links:[],rejected:[],addedTriangles:0,addedProps:0,addedSolids:0,addedSoftBodies:0}});
}
function actual(){const before=fixture(),after=withDistrictComposition(before),ground=after.districtComposition?.grounds[0],entry=after.districtComposition?.entries[0];
 assert.ok(ground&&entry,JSON.stringify(after.districtComposition));return {before,after,ground,entry};}
const body=(x:number,z:number,y:number,halfX:number,halfZ:number,height:number,yaw=0):BoxCollider=>({centre:{x,y:y+height/2,z},
 halfExtents:{x:halfX,y:height/2,z:halfZ},rotationY:yaw,surface:'wood'});
test('a real complete frontage receives paired gardens and preserves its actual purposeful walk/people',()=>{
 const {before,after,ground}=actual(),old=buildPopulationPlan(before,before.populationPaths),next=buildPopulationPlan(after,after.populationPaths);
 assert.ok(old.actors.some(actor=>actor.activityWalkId));
 assert.deepEqual(next.paths,old.paths);assert.deepEqual(next.actors,old.actors);assert.deepEqual(next.anchors,old.anchors);
 assert.deepEqual(after.populationActivityWalks,before.populationActivityWalks);assert.deepEqual(after.populationGroundSources,before.populationGroundSources);
 assert.deepEqual(after.props?.slice(0,before.props?.length),before.props);assert.deepEqual(after.solids?.slice(0,before.solids?.length),before.solids);
 assert.deepEqual(after.heightfield,before.heightfield);assert.deepEqual(after.groundSurfacePatches,before.groundSurfacePatches);
 assert.equal(ground.polygons.length,1);assert.ok(after.districtComposition!.grounds.length>=4);assert.ok(after.districtComposition!.entries.length>=4);
 assert.equal(districtCompositionGroundReason(before,ground),null);
 assert.ok(after.districtComposition!.entries.some(entry=>entry.prop.position.x<0));assert.ok(after.districtComposition!.entries.some(entry=>entry.prop.position.x>0));
});
test('every reachable added plant owns its exact source triangles and physical kit body',()=>{
 const {before,after}=actual();
 for(const entry of after.districtComposition!.entries){
  const prop=after.props![entry.propIndex],collider=after[entry.bodyArray]![entry.bodyIndex],shape=PROP_SOLIDS[prop.kind]!;
  assert.deepEqual(prop,entry.prop);assert.deepEqual(collider,entry.body);
  assert.equal(collider.centre.y,prop.position.y+shape.height*prop.scale/2);
  assert.equal(collider.halfExtents.x,shape.halfX*prop.scale);assert.equal(collider.halfExtents.z,shape.halfZ*prop.scale);
 }
 assert.equal(after.districtComposition!.cost.propCount,after.districtComposition!.entries.length);
 const old=planRenderCost(before),next=planRenderCost(after),cost=after.districtComposition!.cost;
 assert.equal(next.colourTriangles-old.colourTriangles,cost.colourTriangles);assert.equal(next.shadowTriangles-old.shadowTriangles,cost.shadowTriangles);
 assert.equal(next.colourDrawCalls-old.colourDrawCalls,cost.additionalColourDrawCalls);
});
test('a two millimetre unowned ground strip rejects a spread that crosses it',()=>{
 const {before,ground,entry}=actual(),x=entry.prop.position.x;
 const points=ground.polygons[0],left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x)),
  near=Math.min(...points.map(p=>p.z)),far=Math.max(...points.map(p=>p.z));
 const polygons=[rect(left,x-.001,near,far),rect(x+.001,right,near,far)];
 const gap:DistrictCompositionGround={...ground,polygons,triangles:polygons.flatMap(p=>clippedFieldTriangles(field,p,0,{allowedSurfaces:['grass'],
  maximumHeightDifference:.1,maximumGradient:.1,maximumCellsPerPolygon:512})!)};
 assert.equal(districtCompositionGroundReason(before,gap),null);
 assert.equal(districtCompositionPlacementReason(before,gap,entry.prop),'unowned-footprint');
});
test('forged source triangles cannot claim grass from an unrelated part of the field',()=>{
 const {before,ground}=actual(),forged={...ground,triangles:ground.triangles.map(t=>({...t,vertices:t.vertices.map(v=>({...v,x:v.x+1})) as unknown as typeof t.vertices}))};
 assert.equal(districtCompositionGroundReason(before,forged),'exact-triangle-owner');
});
test('a rotated thin actual blocker rejects planting before installation',()=>{
 const {before,ground,entry}=actual(),p=entry.prop.position;
 const blocked={...before,solids:[...(before.solids??[]),body(p.x,p.z,0,.01,1.5,1.4,Math.PI/3)]};
 assert.equal(districtCompositionPlacementReason(blocked,ground,entry.prop),'solid');
});
test('an original rejected vehicle lane cannot be borrowed for a garden',()=>{
 const {before,ground,entry}=actual(),p=entry.prop.position;
 const blocked={...before,populationPaths:[...(before.populationPaths??[]),{id:'original-open-traffic',role:'traffic' as const,district:'commercial' as const,
  closed:false,serviceShuttle:false,frames:[{x:p.x,y:0,z:p.z-2,headingY:0,distanceMetres:0,halfWidthMetres:2,sourceSegmentId:'street'},
   {x:p.x,y:0,z:p.z+2,headingY:0,distanceMetres:4,halfWidthMetres:2,sourceSegmentId:'street'}]}]};
 assert.equal(districtCompositionPlacementReason(blocked,ground,entry.prop),'movement-band');
});
test('a thin crossing, hazard, and unsupported vertical prop cannot pass by empty controls',()=>{
 const {before,ground,entry}=actual(),p=entry.prop.position;
 const crossing={...before,populationCrossings:[{id:'thin',sourceId:'source',priority:'pedestrian' as const,pedestrianPathIds:[],vehiclePathIds:[],
  corners:rect(p.x-.001,p.x+.001,p.z-2,p.z+2)}]};
 assert.equal(districtCompositionPlacementReason(crossing,ground,entry.prop),'vehicle-court-or-crossing');
 const hazard={...before,hazards:[{id:'spill',kind:'spill' as const,centre:p,radius:.1}]};
 assert.equal(districtCompositionPlacementReason(hazard,ground,entry.prop),'hazard');
 assert.equal(districtCompositionPlacementReason(before,ground,{...entry.prop,position:{...p,y:2}}),'actual-support');
});
test('the original route width, checkpoint and source object remain protected',()=>{
 const {before,ground,entry}=actual(),p=entry.prop.position;
 const route={...before,segments:before.segments.map(s=>({...s,entry:{...s.entry,halfWidth:8},exit:{...s.exit,halfWidth:8}}))};
 assert.equal(districtCompositionPlacementReason(route,ground,entry.prop),'movement-band');
 const checkpoint={...before,checkpoints:[{id:'cp',kind:'split' as const,routeIndex:0,label:'checkpoint',centre:p,halfExtents:{x:.01,y:1,z:1},headingY:Math.PI/3}]};
 assert.equal(districtCompositionPlacementReason(checkpoint,ground,entry.prop),'checkpoint');
 const shrub={...before,props:[...(before.props??[]),entry.prop]};
 assert.equal(districtCompositionPlacementReason(shrub,ground,entry.prop),'existing-prop-spread');
});
test('existing source props and coherent physical identity survive repeat preparation',()=>{
 const {before,after}=actual(),repeated=withDistrictComposition(after);
 assert.equal(repeated,after);assert.equal(repeated.id,after.id);assert.notEqual(after.id,before.id);
 assert.equal(after.populationActivityChoiceWorldId,before.populationActivityChoiceWorldId);
 assert.equal(after.districtComposition!.protectedContentDigest,hash128(JSON.stringify({props:before.props,solids:before.solids,softBodies:before.softBodies,
  segments:before.segments,groundSurfacePatches:before.groundSurfacePatches,populationPaths:before.populationPaths,
  populationActivitySites:before.populationActivitySites,populationActivityWalks:before.populationActivityWalks,
  populationGroundSources:before.populationGroundSources,populationCrossings:before.populationCrossings})));
});

test('a valid grass plane outside the actual frontage domain cannot borrow its ownership',()=>{
 const {before,ground}=actual(),polygons=[rect(25,29,0,4)];
 const moved={...ground,polygons,triangles:polygons.flatMap(p=>clippedFieldTriangles(field,p,0,{allowedSurfaces:['grass'],
  maximumHeightDifference:.1,maximumGradient:.1,maximumCellsPerPolygon:512})!)};
 assert.ok(moved.triangles.length);assert.equal(districtCompositionGroundReason(before,moved),'owner');
});

test('mixed park groves require the original authored path and its admitted range witness',()=>{
 const before=fixture(true),walk=before.populationActivityWalks?.find(w=>w.originalPathId==='original-park');
 assert.ok(walk,JSON.stringify(before.districtActivity));
 const after=withDistrictComposition(before),groves=after.districtComposition!.grounds.filter(g=>g.use==='park-grove');
 assert.ok(groves.length,JSON.stringify(after.districtComposition));
 assert.ok(after.districtComposition!.entries.some(entry=>entry.prop.kind==='broadleafTree'));
 assert.ok(after.districtComposition!.entries.some(entry=>entry.prop.kind==='conifer'));
 for(const ground of groves){assert.equal(ground.activityWalkId,walk.id);assert.equal(districtCompositionGroundReason(before,ground),null);
  assert.equal(districtCompositionGroundReason({...before,populationActivityWalks:[]},ground),'owner');}
 assert.deepEqual(buildPopulationPlan(after,after.populationPaths).actors,buildPopulationPlan(before,before.populationPaths).actors);
});
test('outer plaza planting uses existing grass while the complete 34 metre riding square stays exact',()=>{
 const plazaField={originX:-35,originZ:-10,spacing:1,columns:71,rows:76,heights:new Array<number>(5396).fill(0),
  surfaces:Array.from({length:5250},(_,i):SurfaceId=>{const x=-35+i%70;return x>=-17&&x<17?'brick':'grass';})};
 const source:LevelPlan={id:'actual-plaza-fixture',heightfield:plazaField,surround:{height:0,surface:'grass'},
  spawn:{position:{x:0,y:0,z:0},headingY:0},checkpoints:[],props:[],solids:[],softBodies:[],segments:[{id:'plaza',
   entry:{position:{x:0,y:0,z:0},headingY:0,halfWidth:17,gradient:0,surface:'brick'},
   exit:{position:{x:0,y:0,z:54},headingY:0,halfWidth:17,gradient:0,surface:'brick'},colliders:[]}]};
 const after=withDistrictComposition(source),grounds=after.districtComposition!.grounds;
 assert.equal(grounds.length,12);assert.equal(after.districtComposition!.entries.length,12);
 assert.deepEqual(after.heightfield,source.heightfield);assert.deepEqual(after.segments,source.segments);
 for(const ground of grounds){assert.equal(ground.use,'plaza-edge');assert.equal(districtCompositionGroundReason(source,ground),null);}
 for(const entry of after.districtComposition!.entries)assert.ok(entry.footprint.every(p=>Math.abs(p.x)>17.75));
});


test('genuine narrow residential lawns receive paired planting while the unchanged short-walk policy remains explicit',()=>{
 const before=fixture(false,11.2,'residential'),old=buildPopulationPlan(before,before.populationPaths);
 assert.equal(P.minimumWalkMetres,8,'original walking minimum is never lowered for this planting fixture');
 assert.ok(before.districtActivity?.rejectedWalks?.some(item=>item.reason==='short-base-walk'),
  'this narrow source lawn legitimately has no R15 visit walk under the original eight metre policy');
 assert.equal(before.populationActivityWalks?.filter(walk=>walk.district==='residential').length??0,0);
 assert.equal(old.actors.filter(actor=>actor.activityWalkId).length,0,
  'planting cannot misdescribe a refused visit walk as resident life');
 const after=withDistrictComposition(before),entries=after.districtComposition!.entries;
 assert.ok(entries.length>=2,JSON.stringify(after.districtComposition));
 assert.ok(entries.some(e=>e.prop.position.x<0)&&entries.some(e=>e.prop.position.x>0));
 for(const entry of entries)assert.ok(entry.footprint.every(p=>Math.abs(p.x)>=2.6));
 assert.deepEqual(buildPopulationPlan(after,after.populationPaths).actors,old.actors);
});
test('one blocked planting subzone cannot discard other source-valid beds on that owner',()=>{
 const {before,after,entry}=actual(),p=entry.prop.position;
 const blocked={...before,solids:[...(before.solids??[]),body(p.x,p.z,0,1.6,1.6,1.5)]};
 const result=withDistrictComposition(blocked),report=result.districtComposition!;
 assert.ok(after.districtComposition!.entries.length>=4,'nonempty known good owner');
 assert.ok(report.entries.length>0&&report.entries.length<after.districtComposition!.entries.length,JSON.stringify(report));
 assert.ok(report.rejected.some(r=>r.attempts&&r.attemptReasons?.some(reason=>reason==='shrub:solid')));
 for(const ground of report.grounds)assert.equal(districtCompositionGroundReason(blocked,ground),null);
 assert.deepEqual(result.populationActivityWalks,before.populationActivityWalks);
});
test('retained offset industrial entries reserve the exact personnel/apron axis with empty adjacency patch ids',()=>{
 const basic=fixture(false,18,'industrial');
 const before:DistrictCompositionPlan={...basic,populationPaths:[],populationActivityWalks:[],populationGroundSources:[],districtActivity:undefined,
  groundSurfacePatches:[patch('actual-personnel',4.75,6.25,-.04,9),patch('actual-loading-apron',-1.2,3.2,-.04,9)],
  districtAdjacency:{...basic.districtAdjacency!,frontages:basic.districtAdjacency!.frontages.map(front=>({...front,retainedOpening:true,patchIds:[]}))}};
 const after=withDistrictComposition(before),entries=after.districtComposition!.entries;
 assert.ok(entries.length>0,JSON.stringify(after.districtComposition));
 for(const ground of after.districtComposition!.grounds)assert.equal(districtCompositionGroundReason(before,ground),null);
 for(const entry of entries)assert.ok(entry.footprint.every(p=>p.x<-1.95),'complete loading and personnel surfaces remain clear');
 assert.deepEqual(after.groundSurfacePatches,before.groundSurfacePatches);
});
test('precise pavement inside a large lawn refuses its exact footprint without erasing independent grass subzones',()=>{
 const {before,entry}=actual(),p=entry.prop.position;
 const paved={...before,groundSurfacePatches:[...(before.groundSurfacePatches??[]),patch('thin-actual-paving',p.x-.02,p.x+.02,p.z-1.5,p.z+1.5)]};
 const after=withDistrictComposition(paved),report=after.districtComposition!;
 assert.ok(report.entries.length>0,JSON.stringify(report));
 for(const ground of report.grounds)assert.equal(districtCompositionGroundReason(paved,ground),null);
 assert.ok(report.entries.every(e=>districtCompositionPlacementReason(paved,report.grounds.find(g=>g.id===e.zoneId)!,e.prop)===null));
 assert.deepEqual(after.groundSurfacePatches,paved.groundSurfacePatches);
});


test('park planting settles on exact bank soil using its true kit base while path grades and actors remain exact',()=>{
 const base=fixture(true),bank:DistrictCompositionPlan={...base,heightfield:{...field,heights:field.heights.map((_,index)=>{
  const z=field.originZ+Math.floor(index/field.columns);return z<-16?(-16-z)*.22:0;})}};
 const old=buildPopulationPlan(bank,bank.populationPaths);assert.ok(old.actors.some(actor=>actor.activityWalkId));
 const after=withDistrictComposition(bank),report=after.districtComposition!,groves=report.grounds.filter(g=>g.use==='park-grove');
 assert.ok(groves.length>0,JSON.stringify(report));
 const planted=report.entries.filter(e=>groves.some(g=>g.id===e.zoneId));
 assert.ok(planted.some(e=>e.grounding.baseRiseMetres>0&&e.grounding.originBurialMetres>0));
 for(const entry of planted){
  assert.equal(entry.prop.position.y,entry.grounding.lowestHeight);
  assert.deepEqual(entry.grounding,districtCompositionGrounding(bank,entry.prop));
  assert.ok(entry.grounding.baseRiseMetres<=entry.grounding.maximumBaseBurialMetres);
 }
 assert.deepEqual(buildPopulationPlan(after,after.populationPaths).actors,old.actors);
 assert.deepEqual(after.heightfield,bank.heightfield);assert.deepEqual(after.populationPaths,bank.populationPaths);
});
test('planting-specific soil cannot admit over-steep banks or shrubs buried above their basal-height limit',()=>{
 const base=fixture(true),heights=(grade:number)=>field.heights.map((_,index)=>{
  const z=field.originZ+Math.floor(index/field.columns);return z<-16?(-16-z)*grade:0;});
 const bank:DistrictCompositionPlan={...base,heightfield:{...field,heights:heights(.22)}};
 const after=withDistrictComposition(bank),shrub=after.districtComposition!.entries.find(e=>e.prop.kind==='shrub'
  &&after.districtComposition!.grounds.some(g=>g.id===e.zoneId&&g.use==='park-grove'));assert.ok(shrub);
 const ground=after.districtComposition!.grounds.find(g=>g.id===shrub.zoneId);
 assert.ok(ground,'genuine nonempty known good bank control');
 assert.ok(districtCompositionGrounding(bank,shrub.prop));
 const buried={...bank,heightfield:{...field,heights:heights(.60)}};
 assert.equal(districtCompositionGrounding(buried,shrub.prop),null,'grade below kit ceiling still refuses a buried shrub');
 const steep={...bank,heightfield:{...field,heights:heights(.80)}};
 assert.equal(districtCompositionGroundReason(steep,ground),'source-plane');
 assert.equal(districtCompositionGroundReason(bank,{...ground,groundRule:'flat-lawn'}),'ground-policy');
});


test('retained dense small planting can refuse every new tree without deleting source-valid independent park understory',()=>{
 const source=fixture(true),shape=PROP_SOLIDS.shrub!,scale=.4;
 const originals=Array.from({length:15},(_,index)=>-21+index*3).flatMap(x=>[-26,-23,-20].map(z=>({
  kind:'shrub' as const,position:{x,y:0,z},rotationY:0,scale})));
 const planted:DistrictCompositionPlan={...source,props:[...(source.props??[]),...originals],softBodies:[...(source.softBodies??[]),
  ...originals.map(prop=>({centre:{x:prop.position.x,y:shape.height*scale/2,z:prop.position.z},
   halfExtents:{x:shape.halfX*scale,y:shape.height*scale/2,z:shape.halfZ*scale},rotationY:0,surface:shape.surface,occludes:false}))]};
 const before=buildPopulationPlan(planted,planted.populationPaths),after=withDistrictComposition(planted),report=after.districtComposition!;
 const park=report.entries.filter(e=>report.grounds.some(g=>g.id===e.zoneId&&g.owner==='original-park-path'));
 assert.ok(park.length>0,JSON.stringify(report));
 assert.ok(park.every(e=>e.prop.kind==='shrub'),'a refused tree is not replaced with a false tree claim');
 assert.ok(report.rejected.filter(r=>r.zoneId.includes('/park/')).every(r=>(r.attempts??0)<=48));
 assert.ok(report.rejected.some(r=>r.zoneId.includes('/park/')&&r.zoneId.endsWith('/bed/0')
  &&r.attemptReasons?.some(reason=>reason.endsWith(':existing-prop-spread')||reason.endsWith(':soft-body'))));
 assert.deepEqual(after.props?.slice(0,planted.props?.length),planted.props);
 assert.deepEqual(after.softBodies?.slice(0,planted.softBodies?.length),planted.softBodies);
 assert.deepEqual(buildPopulationPlan(after,after.populationPaths).actors,before.actors);
 for(const entry of park){
  const ground=report.grounds.find(g=>g.id===entry.zoneId)!;
  assert.equal(districtCompositionGroundReason(planted,ground),null);
  assert.equal(districtCompositionPlacementReason({...planted,props:[...(planted.props??[]),entry.prop]},ground,entry.prop),'existing-prop-spread');
 }
});

test('expanded authored plaza shoulder never borrows grass beyond its original nine metre outer reach',()=>{
 const plazaField={originX:-40,originZ:-10,spacing:1,columns:81,rows:76,heights:new Array<number>(6156).fill(0),
  surfaces:Array.from({length:6000},(_,i):SurfaceId=>{const x=-40+i%80;return x>=-17&&x<17?'brick':'grass';})};
 const source:LevelPlan={id:'original-plaza-shoulder',heightfield:plazaField,surround:{height:0,surface:'grass'},
  spawn:{position:{x:0,y:0,z:0},headingY:0},checkpoints:[],props:[],solids:[],softBodies:[],segments:[{id:'plaza',
   entry:{position:{x:0,y:0,z:0},headingY:0,halfWidth:17,gradient:0,surface:'brick'},
   exit:{position:{x:0,y:0,z:54},headingY:0,halfWidth:17,gradient:0,surface:'brick'},colliders:[]}]};
 const after=withDistrictComposition(source),ground=after.districtComposition!.grounds.find(g=>g.owner==='authored-plaza');assert.ok(ground);
 const polygons=[rect(26.1,28.1,12,14)],triangles=polygons.flatMap(p=>clippedFieldTriangles(plazaField,p,0,{allowedSurfaces:['grass'],
  maximumHeightDifference:.1,maximumGradient:.1,maximumCellsPerPolygon:512})!);
 assert.ok(triangles.length,'the negative control is genuine clear grass');
 assert.equal(districtCompositionGroundReason(source,{...ground,polygons,triangles}),'owner');
 assert.ok(after.districtComposition!.grounds.filter(g=>g.owner==='authored-plaza').length>=6);
 assert.deepEqual(after.heightfield,source.heightfield);assert.deepEqual(after.segments,source.segments);
});
