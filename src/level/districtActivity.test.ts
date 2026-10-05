/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Actual finished footway, activity and relocation contracts. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { LevelPlan, GroundSurfacePatch, BoxCollider } from './plan.ts';
import type { SurfaceId } from '../simulation/world.ts';
import { POPULATION_AUTHORING as P } from '../data/tuning.ts';
import { createSeedStreams } from './seedStreams.ts';
import { clippedFieldTriangles } from './streetFronts.ts';
import { planDigest } from './planDigest.ts';
import { buildPopulationPlan, districtActivityWalkReason, emitPopulationPaths, type AuthoredPopulationPath } from './populationPlan.ts';
import { withDistrictActivity, DISTRICT_ACTIVITY, type DistrictActivityPlan } from './districtActivity.ts';

const FIELD = { originX: -50, originZ: -50, spacing: 1, columns: 101, rows: 101,
  heights: new Array<number>(10201).fill(0), surfaces: new Array<SurfaceId>(10000).fill('grass') };
function rectangle(id: string, left: number, right: number, near: number, far: number): GroundSurfacePatch {
  const a = { x: left, y: 0, z: near }, b = { x: right, y: 0, z: near };
  const c = { x: right, y: 0, z: far }, d = { x: left, y: 0, z: far };
  return { id, surface: 'pavement', sourceSurface: 'grass', triangles: clippedFieldTriangles(FIELD, [a, b, c, d], 0, { allowedSurfaces: ['grass'],
      maximumHeightDifference: 0.1, maximumGradient: 0.1, maximumCellsPerPolygon: 512 })!,
    footprint: { id, origin: { x: (left + right) / 2, y: 0, z: 0 }, yaw: 0,
      width: right - left, near, far } };
}
const body = (x: number, z: number, halfX: number, halfZ: number): BoxCollider => ({
  centre: { x, y: 0.5, z }, halfExtents: { x: halfX, y: 0.5, z: halfZ }, rotationY: 0, surface: 'pavement' });
function fixture(): DistrictActivityPlan {
  const plan: LevelPlan = { id: 'district-v1-fixture',
    spawn: { position: { x: -35, y: 0, z: -35 }, headingY: 0 }, surround: { height: 0, surface: 'grass' },
    heightfield: FIELD,
    segments: [{ id: 'street', entry: { position: { x: -30, y: 0, z: 10 }, headingY: Math.PI / 2,
      halfWidth: 3, surface: 'pavement', gradient: 0 }, exit: { position: { x: 30, y: 0, z: 10 },
      headingY: Math.PI / 2, halfWidth: 3, surface: 'pavement', gradient: 0 }, colliders: [] }],
    checkpoints: [], populationPaths: [],
    props: [{ kind: 'building', look: 'commercial', position: { x: 0, y: 0, z: -5 },
      rotationY: 0, scale: 1, size: { x: 20, y: 6, z: 10 } },
      { kind: 'bench', position: { x: 12.4, y: 0, z: 1.2 }, rotationY: 0, scale: 1 }],
    solids: [{...body(0, -5, 10, 5),centre:{x:0,y:3,z:-5},halfExtents:{x:10,y:3,z:5}}, body(12.4, 1.2, 0.925, 0.23)],
    groundSurfacePatches: [rectangle('front-base-grass', -10, 10, 0, 2.1),
      rectangle('front-access-grass', -1, 1, 2.1, 10), rectangle('rest-grass', 10, 14.8, 0.1, 3.8)] };
  return { ...plan, districtAdjacency: { revision: 'district-v1', sourceWorldId: 'old', physicalWorldId: plan.id,
    frontages: [{ id: 'front', propIndex: 0, district: 'commercial', role: 'commercial-forecourt',
      streetSegmentId: 'street', position: { x: 0, y: 0, z: 0 }, yaw: 0, width: 20, reach: 10,
      retainedOpening: false, patchIds: ['front-base-grass', 'front-access-grass'] }], links: [],
    groups: [{ id: 'rest', district: 'commercial', frontageId: 'front', groundPatchIds: ['rest-grass'], propIndices: [1] }],
    rejected: [], addedTriangles: 6, addedProps: 1, addedSolids: 1, addedSoftBodies: 0 } };
}
function assertRefused(plan: DistrictActivityPlan): void {
  const result = withDistrictActivity(plan); assert.equal(result.id, plan.id);
  assert.equal(result.populationActivitySites?.length ?? 0, 0);
  assert.equal(result.districtActivity?.acceptedSiteIds.length ?? 0, 0);
  assert.ok(result.districtActivity?.rejected.length);
  assert.equal(result.props, plan.props); assert.equal(result.groundSurfacePatches, plan.groundSurfacePatches);
}
function population(source = fixture()) { const plan = withDistrictActivity(source); return { plan,
  population: buildPopulationPlan(plan as LevelPlan, plan.populationPaths) }; }

test('an actual completed rest place gets two facing social people and a factual facade walk', t => {
  const source = fixture(), before = JSON.stringify(source), result = population(source);
  t.diagnostic(JSON.stringify({ activity: result.plan.districtActivity }));
  assert.equal(result.plan.populationActivitySites?.length, 1, JSON.stringify(result.plan.districtActivity));
  const socials = result.population.actors.filter(actor => actor.kind === 'social');
  assert.equal(socials.length, 2); assert.equal(socials[0].socialGroupId, socials[1].socialGroupId);
  assert.ok(result.population.actors.some(actor => actor.kind === 'walker'));
  const sites = result.plan.populationActivitySites!;
  assert.ok(Math.cos(sites[0].positions[0].headingY - Math.PI / 2) > 0.999);
  assert.ok(Math.cos(sites[0].positions[1].headingY + Math.PI / 2) > 0.999);
  assert.equal(JSON.stringify(source), before);
  assert.equal(result.plan.heightfield, source.heightfield);
  assert.deepEqual(result.plan.props!.slice(0,source.props!.length),source.props);
  assert.deepEqual(result.plan.solids!.slice(0,source.solids!.length),source.solids); assert.equal(result.plan.groundSurfacePatches, source.groundSurfacePatches);
  assert.notEqual(result.plan.id, source.id); assert.notEqual(result.population.installedWorldId, source.id);
  assert.equal(result.plan.populationActivityChoiceWorldId, source.id);
  assert.equal(withDistrictActivity(result.plan), result.plan);
  assert.deepEqual(buildPopulationPlan(result.plan as LevelPlan, result.plan.populationPaths), result.population);
  assert.ok(result.population.actors.length <= P.maximumPeople);
});

test('bench on an isolated pad cannot borrow a grass connection or a retained opening', () => {
  const source = fixture();
  const absent = { ...source, groundSurfacePatches: source.groundSurfacePatches?.filter(patch => patch.id !== 'front-base-grass') };
  assertRefused(absent);
  const retained = { ...source, districtAdjacency: { ...source.districtAdjacency!,
    frontages: source.districtAdjacency!.frontages.map(front => ({ ...front, retainedOpening: true, patchIds: [] })) } };
  assertRefused(retained);
});

test('thin precise-footway gap and hidden blocker between trace stations refuse the full site', () => {
  const source = fixture(), base = source.groundSurfacePatches![0];
  const split = (gapMetres: number): DistrictActivityPlan => ({ ...source, groundSurfacePatches: [
    rectangle(base.id, -10, 4.25-gapMetres/2, 0, 2.1),
    rectangle('front-base-right-grass', 4.25+gapMetres/2, 10, 0, 2.1), ...source.groundSurfacePatches!.slice(1)],
    districtAdjacency: { ...source.districtAdjacency!, frontages: source.districtAdjacency!.frontages.map(front => ({
      ...front, patchIds: [base.id,'front-base-right-grass','front-access-grass'] })) } });
  assert.ok(withDistrictActivity(split(0)).populationActivitySites?.length,
    'two explicitly owned adjacent fragments prove the repaired half is not rejected merely as unowned');
  assertRefused(split(0.002)); // Exactly a two-millimetre uncovered owned-footway gap.
  const blocked = { ...source, solids: [...source.solids!, body(4.25, 1.2, 0.001, 0.10)] };
  assertRefused(blocked); // A centre-only/probe-only path would miss this sliver.
});

test('authored movement bands reserve their full width even if later rejected as traffic', () => {
  const source = fixture();
  const lane: AuthoredPopulationPath = { id: 'reserved-future', role: 'traffic', district: 'commercial',
    closed: false, serviceShuttle: false, frames: [
      { x: 4.2, y: 0, z: 1.5, headingY: 0, distanceMetres: 0, sourceSegmentId: 'street', halfWidthMetres: 1 },
      { x: 4.2, y: 0, z: 2, headingY: 0, distanceMetres: 0.5, sourceSegmentId: 'street', halfWidthMetres: 1 }] };
  const reserved = { ...source, populationPaths: [lane] };
  assertRefused(reserved);
});

test('tampered owned triangle provenance or moved bench is revalidated at population construction', () => {
  const prepared = withDistrictActivity(fixture()); assert.ok(prepared.populationActivitySites?.length, JSON.stringify(prepared.districtActivity));
  const moved = { ...prepared, props: prepared.props!.map((prop, index) => index === 1
    ? { ...prop, position: { ...prop.position, x: 40 } } : prop) };
  assert.equal(buildPopulationPlan(moved as LevelPlan, moved.populationPaths).actors.some(actor => actor.kind === 'social'), false);
  const forged = { ...prepared, populationGroundSources: prepared.populationGroundSources!.map(source => ({
    ...source, polygons: [ [{ x: -45, y: 0, z: -45 }, { x: 45, y: 0, z: -45 },
      { x: 45, y: 0, z: 45 }, { x: -45, y: 0, z: 45 }] ] })) };
  assert.equal(buildPopulationPlan(forged as LevelPlan, forged.populationPaths).actors.some(actor => actor.kind === 'social'), false);
});

test('no geometry mutation or consumed generator stream is hidden by the new physical identity', () => {
  const source = fixture(), digest = planDigest(source), streams = createSeedStreams('district-life');
  const before = Object.fromEntries(Object.entries(streams).map(([name, value]) => [name, value.draws]));
  assert.deepEqual(withDistrictActivity(source), withDistrictActivity(source));
  assert.equal(planDigest(source), digest);
  assert.deepEqual(Object.fromEntries(Object.entries(streams).map(([name, value]) => [name, value.draws])), before);
});


function rotatedFixture(yaw: number): DistrictActivityPlan {
  const source = fixture(), c = Math.cos(yaw), sn = Math.sin(yaw);
  const rotate = <T extends { x: number; y: number; z: number }>(point: T): T => ({ ...point,
    x: c * point.x + sn * point.z, z: c * point.z - sn * point.x });
  const patches = source.groundSurfacePatches!.map(patch => {
    const f = patch.footprint!;
    const corners = [[-f.width/2,f.near],[f.width/2,f.near],[f.width/2,f.far],[-f.width/2,f.far]]
      .map(([x,z]) => rotate({ x: x + f.origin.x, y: 0, z }));
    return { ...patch, footprint: { ...f, origin: rotate(f.origin), yaw },
      triangles: clippedFieldTriangles(FIELD, corners, 0, { allowedSurfaces: ['grass'],
        maximumHeightDifference: 0.1, maximumGradient: 0.1, maximumCellsPerPolygon: 512 })! };
  });
  const solids = source.solids!.map((box,index) => index === 1
    ? { ...box, centre: rotate({ ...box.centre, y: 0.43 }), halfExtents: { ...box.halfExtents, y: 0.43 },
      rotationY: yaw, surface: 'wood' as const, occludes: false }
    : { ...box, centre: rotate(box.centre), rotationY: box.rotationY + yaw });
  return { ...source, id: 'rotated-real-group', props: source.props!.map(prop => ({ ...prop,
    position: rotate(prop.position), rotationY: prop.rotationY + yaw })), solids, groundSurfacePatches: patches,
    segments: source.segments.map(segment => ({ ...segment, entry: { ...segment.entry,
      position: rotate(segment.entry.position), headingY: segment.entry.headingY + yaw },
      exit: { ...segment.exit, position: rotate(segment.exit.position), headingY: segment.exit.headingY + yaw } })),
    districtAdjacency: { ...source.districtAdjacency!, frontages: source.districtAdjacency!.frontages.map(front => ({
      ...front, position: rotate(front.position), yaw: front.yaw + yaw })) } };
}

test('a rotated real group re-admits only our added bench and its actual collider inside the original pad', t => {
  const source = rotatedFixture(0.525092288038702), result = population(source);
  t.diagnostic(JSON.stringify({ activity: result.plan.districtActivity, roster: result.population.actors }));
  assert.equal(result.plan.populationActivitySites?.length, 1, JSON.stringify(result.plan.districtActivity));
  assert.equal(result.population.actors.filter(actor => actor.kind === 'social').length, 2);
  assert.ok(result.population.actors.some(actor => actor.kind === 'walker'));
  const moves = result.plan.districtActivity?.relocations ?? [];
  assert.equal(moves.length, 1); assert.equal(moves[0].propIndex, 1); assert.equal(moves[0].solidIndex, 1);
  assert.deepEqual(result.plan.props![0], source.props![0]); assert.deepEqual(result.plan.solids![0], source.solids![0]);
  assert.deepEqual(result.plan.props![1].position, moves[0].to);
  assert.equal(result.plan.solids![1].centre.x, moves[0].to.x); assert.equal(result.plan.solids![1].centre.z, moves[0].to.z);
  assert.ok(Math.hypot(moves[0].to.x-moves[0].from.x,moves[0].to.z-moves[0].from.z) > 0.14);
  assert.equal(result.plan.groundSurfacePatches, source.groundSurfacePatches);
  assert.equal(JSON.stringify(source.props), JSON.stringify(rotatedFixture(0.525092288038702).props));
});

test('an original source bench is never relocated by a forged group ownership claim', () => {
  const source = rotatedFixture(0.525092288038702);
  const protectedSource = { ...source, districtAdjacency: { ...source.districtAdjacency!, addedProps: 0, addedSolids: 0 } };
  const result = withDistrictActivity(protectedSource);
  assert.deepEqual(result.props!.slice(0,protectedSource.props!.length),protectedSource.props);
  assert.deepEqual(result.solids!.slice(0,protectedSource.solids!.length),protectedSource.solids);
  assert.equal(result.districtActivity?.relocations?.length ?? 0, 0);
});


function assertWholeWalk(result: ReturnType<typeof population>, district: 'commercial'|'industrial'|'park') {
  const walk=result.plan.populationActivityWalks?.find(walk=>walk.district===district);
  assert.ok(walk,JSON.stringify(result.plan.districtActivity));
  assert.equal(districtActivityWalkReason(result.plan,walk),null);
  const actor=result.population.actors.find(actor=>actor.activityWalkId===walk.id);
  assert.ok(actor,`claimed ${district} walk must have an actual actor`);
  const path=result.population.paths.find(path=>path.id===actor.pathId)!;
  assert.ok(path.lengthMetres>=P.minimumWalkMetres);
  assert.equal(actor.movement,'shuttle');
  assert.equal(actor.kind,walk.kind);
  return {walk,actor,path};
}
test('whole commercial base walk has visitors and finite proved threshold furnishings, even without any rest group',()=>{
  const source=fixture(),noRest={...source,districtAdjacency:{...source.districtAdjacency!,groups:[]}};
  const result=population(noRest),{walk,path}=assertWholeWalk(result,'commercial');
  assert.equal(result.plan.populationActivitySites?.length??0,0);
  assert.equal(path.lengthMetres,20-2*DISTRICT_ACTIVITY.walkEndpointMarginMetres);
  assert.equal(walk.intent,'frontage-visit');
  const ledger=result.plan.districtActivity!.furnishings!;
  assert.ok(ledger.length>0,'count-only walking cannot satisfy the threshold construction control');
  assert.ok(ledger.length<=DISTRICT_ACTIVITY.maximumFurnishings);
  for(const entry of ledger){
    assert.deepEqual(result.plan.props![entry.propIndex],entry.prop);
    assert.deepEqual(result.plan.solids![entry.solidIndex],entry.solid);
    assert.equal(entry.solid.centre.x,entry.prop.position.x);
    assert.equal(entry.solid.centre.z,entry.prop.position.z);
    assert.ok(entry.groundPatchIds.every(id=>source.groundSurfacePatches!.some(patch=>patch.id===id)));
  }
  const cost=result.plan.districtActivity!.furnishingCost!;
  assert.equal(cost.propCount,ledger.length);assert.equal(cost.solidCount,ledger.length);
  assert.ok(cost.colourTriangles>0);assert.ok(cost.colourTriangles<=16*64);
  assert.equal(cost.shadowTriangles,cost.colourTriangles);
  assert.deepEqual(result.plan.groundSurfacePatches,source.groundSurfacePatches);
});
test('industrial completed frontage receives actual foot-service work without a fabricated vehicle route',()=>{
  const source=fixture(),industrial={...source,
    props:source.props!.map((prop,index)=>index===0?{...prop,look:'industrial' as const}:prop),
    groundSurfacePatches:source.groundSurfacePatches!.map(patch=>patch.id==='front-access-grass'
      ?{...patch,id:'front-service-apron-grass'}:patch),
    districtAdjacency:{...source.districtAdjacency!,groups:[],frontages:source.districtAdjacency!.frontages.map(front=>
      ({...front,district:'industrial' as const,role:'service-edge' as const,patchIds:['front-base-grass','front-service-apron-grass']}))}};
  const result=population(industrial),{actor,walk}=assertWholeWalk(result,'industrial');
  assert.equal(actor.kind,'worker');assert.equal(walk.intent,'foot-service');
  assert.equal(result.population.actors.some(actor=>actor.kind==='serviceVehicle'||actor.kind==='trafficVehicle'),false);
  assert.equal(result.plan.populationPaths!.some(path=>path.role==='traffic'||path.role==='service'),false);
});
test('actual rotated turn blocker refuses the bench approach while a separate entire base walk remains legitimate',()=>{
  const yaw=0.525092288038702,source=rotatedFixture(yaw),c=Math.cos(yaw),sn=Math.sin(yaw);
  const blocked={...source,solids:[...source.solids!,{...body(0,0,.05,.05),
    centre:{x:c*10.7+sn*1.8,y:.5,z:c*1.8-sn*10.7},rotationY:yaw}]};
  const result=population(blocked);
  assert.equal(result.plan.populationActivitySites?.length??0,0);
  assert.ok(result.plan.districtActivity!.rejected.some(item=>item.reason.includes('approach-solid')));
  assertWholeWalk(result,'commercial');
  assert.deepEqual(result.plan.solids!.slice(0,blocked.solids.length),blocked.solids);
});
test('whole-footway claims reject an actual two-millimetre unowned gap and preserve the zero-gap positive',()=>{
  const source=fixture(),front=source.districtAdjacency!.frontages[0];
  const split=(gap:number):DistrictActivityPlan=>({...source,
    groundSurfacePatches:[rectangle('front-base-grass',-10,1-gap/2,0,2.1),
      rectangle('front-base-second-grass',1+gap/2,10,0,2.1),...source.groundSurfacePatches!.slice(1)],
    districtAdjacency:{...source.districtAdjacency!,groups:[],frontages:[{...front,
      patchIds:['front-base-grass','front-base-second-grass','front-access-grass']}]}});
  assertWholeWalk(population(split(0)),'commercial');
  const refused=population(split(.002));
  assert.equal(refused.plan.populationActivityWalks?.length??0,0);
  assert.equal(refused.population.actors.some(actor=>actor.activityWalkId),false);
  assert.equal(refused.plan.id,split(.002).id);
});
test('full vehicle lane and driveway court cannot be borrowed by whole-footway people or furnishings',()=>{
  const source=fixture(),lane:AuthoredPopulationPath={id:'reserved-original-vehicle',role:'traffic',district:'commercial',
    closed:false,serviceShuttle:false,frames:[
      {x:0,y:0,z:0,headingY:0,distanceMetres:0,sourceSegmentId:'street',halfWidthMetres:1.1},
      {x:0,y:0,z:3,headingY:0,distanceMetres:3,sourceSegmentId:'street',halfWidthMetres:1.1}]};
  const result=population({...source,populationPaths:[lane],districtAdjacency:{...source.districtAdjacency!,groups:[]}});
  assert.equal(result.plan.populationActivityWalks?.length??0,0);
  assert.equal(result.plan.districtActivity!.furnishings?.length??0,0);
  const court={id:'reserved-court',purpose:'driveway' as const,hostSegmentIds:['street'],groundPatchIds:[],
    polygons:[[{x:-.1,y:0,z:0},{x:.1,y:0,z:0},{x:.1,y:0,z:3},{x:-.1,y:0,z:3}]]};
  assert.equal(population({...source,populationGroundSources:[court],districtAdjacency:{...source.districtAdjacency!,groups:[]}})
    .plan.populationActivityWalks?.length??0,0);
});
test('path edits and forged ground ownership cannot become anonymous fallback walkers',()=>{
  const prepared=population({...fixture(),districtAdjacency:{...fixture().districtAdjacency!,groups:[]}});
  const walk=prepared.plan.populationActivityWalks![0];assert.ok(walk);
  const forged={...prepared.plan,populationGroundSources:prepared.plan.populationGroundSources!.map(source=>source.id===walk.sourceId
    ?{...source,polygons:[[{x:-45,y:0,z:-45},{x:45,y:0,z:-45},{x:45,y:0,z:45},{x:-45,y:0,z:45}]]}:source)};
  assert.equal(districtActivityWalkReason(forged,walk),'invalid-source');
  assert.equal(buildPopulationPlan(forged,forged.populationPaths).actors.some(actor=>actor.pathId.startsWith(walk.pathId)),false);
  const edited={...prepared.plan,populationPaths:prepared.plan.populationPaths!.map(path=>path.id===walk.pathId
    ?{...path,frames:path.frames.map((frame,index)=>index===4?{...frame,z:frame.z+.01}:frame)}:path)};
  assert.equal(districtActivityWalkReason(edited,walk),'invalid-source');
  assert.equal(buildPopulationPlan(edited,edited.populationPaths).actors.some(actor=>actor.pathId.startsWith(walk.pathId)),false);
});
function parkFixture():DistrictActivityPlan{
  const source=fixture(),entry={position:{x:27,y:0,z:-30},headingY:0,halfWidth:2,surface:'pavement' as const,gradient:0};
  const exit={...entry,position:{x:27,y:0,z:0}};
  const spec={id:'actual-park',length:30,halfWidth:2,surface:'pavement' as const};
  const paths=emitPopulationPaths([{spec,entry,exit,minX:25,maxX:29,minZ:-30,maxZ:0}],
    [{id:'original-park-walk',role:'pedestrian',district:'park',steps:[{segmentId:spec.id,lateralMetres:-.7,halfWidthMetres:.9,fromS:1,toS:29}]}]);
  const surfaces=[...FIELD.surfaces];
  for(let z=20;z<50;z++)for(let x=75;x<79;x++)surfaces[z*100+x]='pavement';
  return {...source,id:'park-without-fronts',heightfield:{...FIELD,surfaces},props:[],solids:[],groundSurfacePatches:[],
    populationPaths:paths,segments:[{id:spec.id,entry,exit,colliders:[]}],districtAdjacency:{...source.districtAdjacency!,frontages:[],groups:[]}};
}
test('park exercise uses a genuine original authored maintained path without adding paving, loops or furniture',()=>{
  const source=parkFixture(),result=population(source),{walk,actor}=assertWholeWalk(result,'park');
  assert.equal(walk.owner,'authored-path');assert.equal(actor.kind,'jogger');
  assert.equal(walk.intent,'park-exercise');
  assert.deepEqual(result.plan.populationPaths,source.populationPaths);
  assert.deepEqual(result.plan.groundSurfacePatches,source.groundSurfacePatches);
  assert.deepEqual(result.plan.props,source.props);assert.deepEqual(result.plan.solids,source.solids);
  const partlyBlocked={...source,solids:[body(26.3,-15,.2,.1)]},partial=population(partlyBlocked);
  const section=assertWholeWalk(partial,'park');
  assert.notEqual(section.walk.pathId,source.populationPaths![0].id);
  assert.equal(section.walk.originalPathId,source.populationPaths![0].id);
  assert.ok(section.walk.originalFrameRange);
  assert.ok(section.path.lengthMetres<28);
  assert.deepEqual(partial.plan.populationPaths![0],source.populationPaths![0]);
  assert.deepEqual(partial.plan.groundSurfacePatches,source.groundSurfacePatches);
  const blocked={...source,solids:[-25,-19,-13,-7].map(z=>body(26.3,z,.2,.1))},refused=population(blocked);
  assert.equal(refused.plan.populationActivityWalks?.length??0,0);
  assert.equal(refused.population.actors.some(actor=>actor.activityWalkId),false);
});
