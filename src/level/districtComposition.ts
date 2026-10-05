/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Whole-place planted edges on genuine source ground. No paving, kerb facade,
 * guessed shop, moving route, or render-owned material/lighting change. */
import { PROP_SOLIDS,PROP_SPREADS,PROP_VERTICAL_SPANS,PROP_FOOTPRINTS,PROP_SIZES } from '../data/props.ts';
import { PART_COSTS,propPartCounts,type PropPartId } from '../data/renderCost.ts';
import { POPULATION_AUTHORING as P } from '../data/tuning.ts';
import type { LevelPlan,Prop,BoxCollider,GroundSurfaceTriangle,Segment } from './plan.ts';
import type { DistrictFrontage } from './districtAdjacency.ts';
import type { District,PopulationGroundSource,PopulationValidationContext,GroundSourceCoverageIndex } from './populationPlan.ts';
import { createPopulationValidationContext,populationFootprintExclusion,surfaceFootprintClear,groundSourceCovers,prepareGroundSourceCoverage } from './populationPlan.ts';
import { clippedFieldTriangles,boxOverlapsPolygonWithin,apartFromConvex,boxReachRectangle,convexExtent,extentsApart,polygonBoxReach,polygonReachRectangle,streetFronts,
 type PlaneRectangle as Extent } from './streetFronts.ts';
import { rectGrid,rectGridAny,type RectGrid } from './rectGrid.ts';
import { environmentSites } from './environmentSites.ts';
import { residentialSites } from './districtSites.ts';
import { exactBuildingBody } from './protectedSiteEligibility.ts';
import { fieldHeightAt,PROP_MAX_GROUND_SLOPE } from './buildPlan.ts';
import { hash128 } from './planDigest.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample,type Vec3,type SurfaceId } from '../simulation/world.ts';

export const DISTRICT_COMPOSITION=Object.freeze({revision:'district-composition-r16' as const,
 maximumZones:96,maximumProps:96,maximumColourTriangles:12000,maximumFrontagesPerDistrict:3,
 maximumParkStops:6,maximumParkSubzones:18,maximumParkAlternativesPerSubzone:48,maximumPlazaAlternativesPerSubzone:138,maximumAlternativesPerZone:5,routeMarginMetres:.75,routeTraceMetres:2,maximumGroundRiseMetres:.12,
 entranceHalfGapMetres:2.6,frontBedNearMetres:2.75,streetInsetMetres:1.45,
 shrubPitchMetres:2.5,maximumBaseBurialShare:.5,plazaOuterNearMetres:10,plazaOuterFarMetres:46,
 plazaOuterInnerMetres:18.3,plazaOuterEdgeMetres:26});
type CompositionKind='shrub'|'broadleafTree'|'conifer'|'fenceBay';
type Frame={readonly position:Vec3;readonly yaw:number};
interface ProposedProp {readonly kind:CompositionKind;readonly position:Vec3;readonly yaw:number;readonly scale:number}
export interface DistrictCompositionGround {
 readonly id:string;readonly district:District;readonly use:'entrance-gardens'|'service-screen'|'park-grove'|'plaza-edge';
 readonly owner:'frontage'|'original-park-path'|'authored-plaza';readonly ownerId:string;readonly ownerDigest:string;
 readonly hostSegmentIds:readonly string[];readonly polygons:readonly (readonly Vec3[])[];
 readonly triangles:readonly GroundSurfaceTriangle[];readonly referenceHeight:number;readonly groundRule:'flat-lawn'|'settled-kit';
 readonly sourceFrameIndex?:number;readonly activityWalkId?:string;
}
export interface DistrictCompositionEntry {readonly zoneId:string;readonly propIndex:number;
 readonly bodyIndex:number;readonly bodyArray:'solids'|'softBodies';readonly prop:Prop;readonly body:BoxCollider;
 readonly footprint:readonly Vec3[];readonly footprintAreaSquareMetres:number;readonly grounding:DistrictCompositionGrounding}
export interface DistrictCompositionGrounding {readonly baseFootprint:readonly Vec3[];readonly lowestHeight:number;readonly highestHeight:number;
 readonly originGroundHeight:number;readonly baseRiseMetres:number;readonly originBurialMetres:number;readonly maximumBaseBurialMetres:number}
export interface DistrictCompositionReport {
 readonly revision:'district-composition-r16';readonly sourceWorldId:string;readonly physicalWorldId:string;
 readonly grounds:readonly DistrictCompositionGround[];readonly entries:readonly DistrictCompositionEntry[];
 readonly rejected:readonly {readonly zoneId:string;readonly reason:string;readonly attempts?:number;readonly attemptReasons?:readonly string[]}[];
 readonly coverage:readonly {readonly district:District;readonly suppliedOwners:number;readonly acceptedOwners:number;
  readonly zoneIds:readonly string[];readonly plantedFootprintSquareMetres:number;readonly managedGroundSquareMetres:number}[];
 readonly cost:{readonly propCount:number;readonly solidCount:number;readonly softBodyCount:number;
  readonly colourTriangles:number;readonly shadowTriangles:number;readonly additionalColourDrawCalls:number;
  readonly additionalShadowDrawCalls:number;readonly partInstances:readonly {readonly id:PropPartId;readonly count:number}[]};
 readonly protectedContentDigest:string;
}
export type DistrictCompositionPlan=LevelPlan&{readonly districtComposition?:DistrictCompositionReport};
const GRASS=new Set<SurfaceId>(['grass']);
const CLIP=Object.freeze({allowedSurfaces:['grass'] as readonly SurfaceId[],maximumHeightDifference:.35,
 maximumGradient:.12,maximumCellsPerPolygon:512});
const finite=(...numbers:number[]):boolean=>numbers.every(Number.isFinite);
const at=(frame:Frame,x:number,z:number):Vec3=>({x:frame.position.x+Math.cos(frame.yaw)*x+Math.sin(frame.yaw)*z,
 y:frame.position.y,z:frame.position.z-Math.sin(frame.yaw)*x+Math.cos(frame.yaw)*z});
const rectangle=(frame:Frame,left:number,right:number,near:number,far:number):Vec3[]=>
 [at(frame,left,near),at(frame,right,near),at(frame,right,far),at(frame,left,far)];
const area=(polygon:readonly Pick<Vec3,'x'|'z'>[]):number=>Math.abs(polygon.reduce((sum,p,i)=>{
 const q=polygon[(i+1)%polygon.length];return sum+p.x*q.z-q.x*p.z;},0))/2;
function polygonsMeet(a:readonly Vec3[],b:readonly Vec3[]):boolean {
 for(const shape of [a,b])for(let i=0;i<shape.length;i++){
  const p=shape[i],q=shape[(i+1)%shape.length],x=q.z-p.z,z=p.x-q.x;
  const one=a.map(p=>p.x*x+p.z*z),two=b.map(p=>p.x*x+p.z*z);
  if(Math.max(...one)<=Math.min(...two)+P.epsilon||Math.max(...two)<=Math.min(...one)+P.epsilon)return false;
 }return true;
}
/** polygonsMeet with the convex broad phase above. */
function polygonsMeetWithin(a:readonly Vec3[],b:readonly Vec3[],bExtent:Extent|undefined):boolean {
 if(bExtent&&apartFromConvex(a,bExtent))return false;
 return polygonsMeet(a,b);
}
/** All original and already accepted actor bands, social approaches and
 * stationary supports stay reserved. Rejected vehicle bands stay reserved too. */
function actorReservations(plan:LevelPlan):BoxCollider[]|null {
 const boxes:BoxCollider[]=[];
 const add=(frames:readonly {x:number;z:number;halfWidthMetres:number}[]):boolean=>{
  for(let i=1;i<frames.length;i++){
   const a=frames[i-1],b=frames[i],width=Math.max(a.halfWidthMetres,b.halfWidthMetres)+P.vehicleHeightMetres*P.maximumGroundGrade,length=Math.hypot(b.x-a.x,b.z-a.z);
   if(!finite(a.x,a.z,b.x,b.z,width,length)||width<0)return false;
   boxes.push({centre:{x:(a.x+b.x)/2,y:0,z:(a.z+b.z)/2},halfExtents:{x:width+P.staticClearanceMetres,y:1,
    z:length/2+width+P.staticClearanceMetres},rotationY:Math.atan2(b.x-a.x,b.z-a.z),surface:'pavement'});
  }return true;
 };
 for(const path of plan.populationPaths??[])if(!add(path.frames))return null;
 for(const site of plan.populationActivitySites??[]){
  if(!add(site.approachFrames))return null;
  for(const support of site.positions)boxes.push({centre:{...support.position,y:0},
   halfExtents:{x:Math.SQRT2*P.pedestrianRadiusMetres+P.actorHeightMetres*P.maximumGroundGrade+P.staticClearanceMetres,y:1,
    z:Math.SQRT2*P.pedestrianRadiusMetres+P.actorHeightMetres*P.maximumGroundGrade+P.staticClearanceMetres},
   rotationY:support.headingY,surface:'pavement'});
 }return boxes;
}
/** Socket-arc geometry is witnessed at both endpoints. Short chords get a
 * sagitta enclosure; the complete rideable width and additional margin survive.
 * An unresolvable authored arc refuses composition rather than guessing it. */
function routeReservations(segments:readonly Segment[]):BoxCollider[]|null {
 const boxes:BoxCollider[]=[];
 for(const segment of segments){
  const a=segment.entry,b=segment.exit,turn=b.headingY-a.headingY,chord=Math.hypot(b.position.x-a.position.x,b.position.z-a.position.z);
  const sine=Math.sin(turn/2),length=Math.abs(turn)<1e-9?chord:chord*(turn/2)/sine;
  if(!finite(length,turn,a.halfWidth,b.halfWidth)||length<=0||a.halfWidth<0||b.halfWidth<0||Math.abs(turn)>=Math.PI*2-1e-6)return null;
  const curvature=turn/length;
  const point=(s:number):Vec3=>{const h=a.headingY+turn*s;return {x:a.position.x+(Math.abs(turn)<1e-9?Math.sin(h)*length*s:
   (Math.cos(a.headingY)-Math.cos(h))/curvature),y:a.position.y+(b.position.y-a.position.y)*s,
   z:a.position.z+(Math.abs(turn)<1e-9?Math.cos(h)*length*s:(Math.sin(h)-Math.sin(a.headingY))/curvature)};};
  const end=point(1);if(Math.hypot(end.x-b.position.x,end.z-b.position.z)>.03)return null;
  const count=Math.max(1,Math.ceil(length/DISTRICT_COMPOSITION.routeTraceMetres));
  for(let i=1;i<=count;i++){
   const p=point((i-1)/count),q=point(i/count),span=Math.hypot(q.x-p.x,q.z-p.z),bow=span*Math.tan(Math.abs(turn/count)/4)/2;
   const margin=bow+DISTRICT_COMPOSITION.routeMarginMetres;
   boxes.push({centre:{x:(p.x+q.x)/2,y:0,z:(p.z+q.z)/2},halfExtents:{x:Math.max(a.halfWidth,b.halfWidth)+margin,y:1,
    z:span/2+margin},rotationY:Math.atan2(q.x-p.x,q.z-p.z),surface:a.surface});
  }
 }return boxes;
}
function ownerExists(plan:LevelPlan,ground:DistrictCompositionGround):boolean {
 if(ground.owner==='frontage'){
  const front=plan.districtAdjacency?.frontages.find(f=>f.id===ground.ownerId),prop=front&&plan.props?.[front.propIndex];
  return !!front&&front.district===ground.district&&!!prop&&!!exactBuildingBody(plan,prop)
   &&hash128(JSON.stringify(front))===ground.ownerDigest;
 }
 if(ground.owner==='original-park-path'){
  const path=plan.populationPaths?.find(p=>p.id===ground.ownerId);
  const walk=plan.populationActivityWalks?.find(w=>w.id===ground.activityWalkId),range=walk?.originalFrameRange;
  return !!path&&!path.id.startsWith('district-activity/')&&path.role==='pedestrian'&&path.district==='park'
   &&hash128(JSON.stringify(path))===ground.ownerDigest&&!!walk&&walk.originalPathId===path.id
   &&walk.originalPathDigest===ground.ownerDigest&&!!range
   &&ground.sourceFrameIndex!==undefined&&ground.sourceFrameIndex>=range[0]&&ground.sourceFrameIndex<=range[1];
 }
 const host=plan.segments.find(s=>s.id===ground.ownerId);
 return ground.owner==='authored-plaza'&&!!host&&host.id==='plaza'&&host.entry.halfWidth===17&&host.exit.halfWidth===17
  &&host.entry.surface==='brick'&&host.exit.surface==='brick'&&hash128(JSON.stringify(host))===ground.ownerDigest;
}
/** Existing retained doors may be offset. Exact owned paving triangles
 * define the clear entry interval and the street-side limit of each garden. */
type GardenBounds={half:number;leftInner:number;rightInner:number;near:number;far:number};
/** One synchronous composition pass: the precise patches it reads never change
 * within it, so a frontage's pure garden bounds are formed once per patch set. */
type GardenMemo=Map<DistrictFrontage,{readonly patches:LevelPlan['groundSurfacePatches'];readonly bounds:GardenBounds}>;
function frontageGardenBoundsIn(plan:LevelPlan,front:DistrictFrontage,memo:GardenMemo|undefined):GardenBounds {
 const known=memo?.get(front);
 if(known&&known.patches===plan.groundSurfacePatches)return {...known.bounds};
 const bounds=frontageGardenBounds(plan,front);
 memo?.set(front,{patches:plan.groundSurfacePatches,bounds:{...bounds}});
 return bounds;
}
function frontageGardenBounds(plan:LevelPlan,front:DistrictFrontage):GardenBounds {
 const half=front.width/2-.8,near=DISTRICT_COMPOSITION.frontBedNearMetres;
 let leftInner=-DISTRICT_COMPOSITION.entranceHalfGapMetres,rightInner:number=DISTRICT_COMPOSITION.entranceHalfGapMetres,
  far=Math.min(16,front.reach-DISTRICT_COMPOSITION.streetInsetMetres);
 const lawn=rectangle({position:front.position,yaw:front.yaw},-half,half,near,far),lawnExtent=convexExtent(lawn);
 for(const patch of plan.groundSurfacePatches??[]){
  if(!patch.triangles.length||!patch.triangles.some(t=>polygonsMeetWithin(t.vertices,lawn,lawnExtent)))continue;
  const points=patch.triangles.flatMap(t=>t.vertices).map(p=>{const dx=p.x-front.position.x,dz=p.z-front.position.z;
   return {x:Math.cos(front.yaw)*dx-Math.sin(front.yaw)*dz,z:Math.sin(front.yaw)*dx+Math.cos(front.yaw)*dz};});
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  // Retained shop/home fronts intentionally have no adjacency patchIds.
  // Project every exact finished patch, but only reserve actual intersections
  // with this source-front lawn; unrelated pavement cannot borrow ownership.
  if(maxZ<near||minZ>far||maxX<=-half||minX>=half)continue;
  if(minX<=-half&&maxX>=half&&minZ>2.1+P.epsilon){far=Math.min(far,minZ-.6);continue;}
  if(maxX-minX<=front.width*.75&&minZ<=2.1+P.epsilon){leftInner=Math.min(leftInner,minX-.75);rightInner=Math.max(rightInner,maxX+.75);}
 }
 return {half,leftInner,rightInner,near,far};
}
function sourceDomainCovers(plan:LevelPlan,ground:DistrictCompositionGround,memo?:GardenMemo):boolean {
 const contains=(frame:Frame,left:number,right:number,near:number,far:number,polygon:readonly Vec3[]):boolean=>polygon.every(p=>{
  const dx=p.x-frame.position.x,dz=p.z-frame.position.z,x=Math.cos(frame.yaw)*dx-Math.sin(frame.yaw)*dz,
   z=Math.sin(frame.yaw)*dx+Math.cos(frame.yaw)*dz;
  return finite(x,z)&&x>=left-P.epsilon&&x<=right+P.epsilon&&z>=near-P.epsilon&&z<=far+P.epsilon;
 });
 if(ground.owner==='frontage'){
  const front=plan.districtAdjacency?.frontages.find(f=>f.id===ground.ownerId);if(!front||Math.abs(ground.referenceHeight-front.position.y)>P.epsilon)return false;
  const frame={position:front.position,yaw:front.yaw},{half,leftInner,rightInner,near,far}=frontageGardenBoundsIn(plan,front,memo);
  return ground.polygons.every(p=>contains(frame,-half,leftInner,near,far,p)||contains(frame,rightInner,half,near,far,p));
 }
 if(ground.owner==='original-park-path'){
  const path=plan.populationPaths?.find(p=>p.id===ground.ownerId),index=ground.sourceFrameIndex;
  if(!path||index===undefined||!Number.isSafeInteger(index)||!path.frames[index])return false;
  const p=path.frames[index];if(Math.abs(ground.referenceHeight-p.y)>P.epsilon)return false;
  const frame={position:{x:p.x,y:p.y,z:p.z},yaw:p.headingY};
  return ground.polygons.every(polygon=>[-1,1].some(side=>{
   const site={position:at(frame,side*(p.halfWidthMetres+6.5),0),yaw:frame.yaw};return contains(site,-3.5,3.5,-6.2,6.2,polygon);
  }));
 }
 const host=plan.segments.find(s=>s.id===ground.ownerId);if(!host||Math.abs(ground.referenceHeight-host.entry.position.y)>P.epsilon)return false;
 const frame={position:host.entry.position,yaw:host.entry.headingY};
 // The authored plaza has a nine metre shoulder (sliceLevel PLAZA), not
 // only the former three metre test strip. Exact original grass, all route
 // reservations and original furnishings still decide which shoulder fits.
 return ground.polygons.every(p=>contains(frame,-DISTRICT_COMPOSITION.plazaOuterEdgeMetres,-DISTRICT_COMPOSITION.plazaOuterInnerMetres,
  DISTRICT_COMPOSITION.plazaOuterNearMetres,DISTRICT_COMPOSITION.plazaOuterFarMetres,p)||contains(frame,
  DISTRICT_COMPOSITION.plazaOuterInnerMetres,DISTRICT_COMPOSITION.plazaOuterEdgeMetres,
  DISTRICT_COMPOSITION.plazaOuterNearMetres,DISTRICT_COMPOSITION.plazaOuterFarMetres,p));
}
/** Exact original planting triangles, independent of the street-paving
 * factory's 12% walkable-plane rule. The existing kit already permits settled
 * foliage on banks up to PROP_MAX_GROUND_SLOPE; no actor or ground is widened. */
function clippedPlantingTriangles(plan:LevelPlan,polygon:readonly Vec3[]):GroundSurfaceTriangle[]|null {
 const field=plan.heightfield;if(polygon.length<3||polygon.length>16||polygon.some(p=>!finite(p.x,p.y,p.z)))return null;
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],c=polygon[(i+2)%polygon.length];
  if((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x)<=P.epsilon)return null;}
 const minX=Math.min(...polygon.map(p=>p.x)),maxX=Math.max(...polygon.map(p=>p.x)),minZ=Math.min(...polygon.map(p=>p.z)),maxZ=Math.max(...polygon.map(p=>p.z));
 if(minX<field.originX||minZ<field.originZ||maxX>field.originX+(field.columns-1)*field.spacing||maxZ>field.originZ+(field.rows-1)*field.spacing)return null;
 const firstX=Math.floor((minX-field.originX)/field.spacing),lastX=Math.min(field.columns-2,Math.floor((maxX-field.originX)/field.spacing)),
  firstZ=Math.floor((minZ-field.originZ)/field.spacing),lastZ=Math.min(field.rows-2,Math.floor((maxZ-field.originZ)/field.spacing));
 if((lastX-firstX+1)*(lastZ-firstZ+1)>CLIP.maximumCellsPerPolygon)return null;
 const clipped=(input:readonly Vec3[]):Vec3[]=>{
  let output=[...input];
  for(let i=0;i<polygon.length;i++){
   const a=polygon[i],b=polygon[(i+1)%polygon.length],prior=output;output=[];if(!prior.length)break;
   const distance=(p:Vec3)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
   for(let j=0;j<prior.length;j++){
    const from=prior[j],to=prior[(j+1)%prior.length],d0=distance(from),d1=distance(to),inside0=d0>=0,inside1=d1>=0;
    if(inside0)output.push(from);
    if(inside0!==inside1){const t=d0/(d0-d1);output.push({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t});}
   }
  }
  return output;
 };
 const result:GroundSurfaceTriangle[]=[];
 for(let row=firstZ;row<=lastZ;row++)for(let column=firstX;column<=lastX;column++){
  const sample=row*field.columns+column,cell=row*(field.columns-1)+column,x=field.originX+column*field.spacing,z=field.originZ+row*field.spacing;
  const a={x,y:field.heights[sample],z},b={x:x+field.spacing,y:field.heights[sample+1],z},
   c={x,y:field.heights[sample+field.columns],z:z+field.spacing},d={x:x+field.spacing,y:field.heights[sample+field.columns+1],z:z+field.spacing};
  for(const source of [[a,d,b],[a,c,d]]){
   const points=clipped(source);if(points.length<3)continue;
   const ux=source[1].x-source[0].x,uy=source[1].y-source[0].y,uz=source[1].z-source[0].z,
    vx=source[2].x-source[0].x,vy=source[2].y-source[0].y,vz=source[2].z-source[0].z,
    nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
   for(let i=1;i<points.length-1;i++){
    const vertices=[points[0],points[i],points[i+1]]as const;
    if(area(vertices)<=P.epsilon)continue;
    if(field.surfaces[cell]!=='grass'||vertices.some(p=>!finite(p.y))||ny<=0||Math.hypot(nx,nz)/ny>Math.tan(PROP_MAX_GROUND_SLOPE))return null;
    result.push({cell,vertices});
   }
  }
 }
 return result.length?result:null;
}
/** Exact source soil under the actual kit ground-contact base. The canopy
 * spread still owns/clears soil separately; it cannot lower a tree's root. */
export function districtCompositionGrounding(plan:LevelPlan,prop:Prop):DistrictCompositionGrounding|null {
 const base=PROP_FOOTPRINTS[prop.kind];
 let polygon:Vec3[];
 if(base.shape==='circle'){
  const radius=base.radius*prop.scale/Math.cos(Math.PI/12);if(!(radius>0))return null;
  polygon=Array.from({length:12},(_,i)=>({x:prop.position.x+Math.cos(i*Math.PI/6)*radius,
   y:prop.position.y,z:prop.position.z+Math.sin(i*Math.PI/6)*radius}));
 }else polygon=rectangle({position:prop.position,yaw:prop.rotationY},-base.halfX*prop.scale,base.halfX*prop.scale,-base.halfZ*prop.scale,base.halfZ*prop.scale);
 const triangles=clippedPlantingTriangles(plan,polygon);if(!triangles)return null;
 const heights=triangles.flatMap(t=>t.vertices.map(p=>p.y)),lowestHeight=Math.min(...heights),highestHeight=Math.max(...heights),
  originGroundHeight=fieldHeightAt(plan.heightfield,plan.surround,prop.position.x,prop.position.z),baseRiseMetres=highestHeight-lowestHeight;
 const basalHeight=prop.kind==='broadleafTree'?PROP_SIZES.broadleafTree.trunkHeight
  :prop.kind==='conifer'?PROP_SIZES.conifer.tiers[0].height:PROP_VERTICAL_SPANS[prop.kind].top;
 const maximumBaseBurialMetres=basalHeight*prop.scale*DISTRICT_COMPOSITION.maximumBaseBurialShare;
 if(baseRiseMetres>maximumBaseBurialMetres+P.epsilon)return null;
 return {baseFootprint:polygon,lowestHeight,highestHeight,originGroundHeight,baseRiseMetres,
  originBurialMetres:originGroundHeight-lowestHeight,maximumBaseBurialMetres};
}
function sourceFor(ground:DistrictCompositionGround):PopulationGroundSource{return {id:ground.id,purpose:'footpath',
 hostSegmentIds:ground.hostSegmentIds,groundPatchIds:[],polygons:ground.triangles.map(t=>t.vertices)};}
/** Reconstruct exact triangles to reject forged/moved/stale ground ownership.
 * This source is a planting record, never a newly manufactured actor footway. */
export function districtCompositionGroundReason(plan:LevelPlan,ground:DistrictCompositionGround,
 context:PopulationValidationContext=createPopulationValidationContext(plan),gardens?:GardenMemo):string|null {
 if(!finite(ground.referenceHeight)||ground.polygons.some(polygon=>polygon.some(p=>!finite(p.x,p.y,p.z)||Math.abs(p.y-ground.referenceHeight)>P.epsilon)))return 'owner';
 if(ground.groundRule!==(ground.owner==='original-park-path'?'settled-kit':'flat-lawn'))return 'ground-policy';
 if(!ownerExists(plan,ground)||!sourceDomainCovers(plan,ground,gardens)||!ground.polygons.length||ground.hostSegmentIds.some(id=>!plan.segments.some(s=>s.id===id)))return 'owner';
 const triangles:GroundSurfaceTriangle[]=[];
 for(const polygon of ground.polygons){
  if(!surfaceFootprintClear(plan,polygon,GRASS,context))return 'actual-grass';
  const clipped=ground.groundRule==='settled-kit'?clippedPlantingTriangles(plan,polygon):clippedFieldTriangles(plan.heightfield,polygon,ground.referenceHeight,CLIP);
  if(!clipped?.length)return 'source-plane';triangles.push(...clipped);
 }
 if(JSON.stringify(triangles)!==JSON.stringify(ground.triangles))return 'exact-triangle-owner';
 const heights=triangles.flatMap(t=>t.vertices.map(p=>p.y));
 if(ground.groundRule==='flat-lawn'&&Math.max(...heights)-Math.min(...heights)>DISTRICT_COMPOSITION.maximumGroundRiseMetres)return 'ground-rise';
 return null;
}
function propFootprint(prop:Prop,margin:number):Vec3[]{const spread=PROP_SPREADS[prop.kind];
 if(spread.shape==='circle'){
  // Circumscribed twelve-sided support encloses the actual full circular
  // spread without pretending its rotated square corners are vegetation.
  const radius=(spread.radius*prop.scale+margin)/Math.cos(Math.PI/12);
  return Array.from({length:12},(_,i)=>({x:prop.position.x+Math.cos(i*Math.PI/6)*radius,
   y:prop.position.y,z:prop.position.z+Math.sin(i*Math.PI/6)*radius}));
 }
 const x=spread.halfX*(prop.size?.x??1)*prop.scale+margin,z=spread.halfZ*(prop.size?.z??1)*prop.scale+margin;
 return rectangle({position:prop.position,yaw:prop.rotationY},-x,x,-z,z);
}
/** True only when propFootprint(other,0) is provably a robust convex cycle
 * (a 12-gon of radius at least 1 mm, or a rectangle with both half sides at
 * least 1 mm, whose rounding is many orders below its turns) lying inside a
 * disk whose rectangle is disjoint from the convex query's: polygonsMeet is
 * then false without building the footprint. */
function propSpreadApart(other:Prop,query:Extent):boolean {
 const spread=PROP_SPREADS[other.kind];let reach:number;
 if(spread.shape==='circle'){
  const radius=(spread.radius*other.scale+0)/Math.cos(Math.PI/12);
  if(!(Math.abs(radius)>=1e-3))return false;reach=Math.abs(radius);
 }else{
  const x=spread.halfX*(other.size?.x??1)*other.scale+0,z=spread.halfZ*(other.size?.z??1)*other.scale+0;
  if(!(Math.abs(x)>=1e-3&&Math.abs(z)>=1e-3))return false;reach=Math.hypot(x,z);
 }
 const cx=other.position.x,cz=other.position.z;if(!finite(cx,cz,reach))return false;
 const pad=reach*(1+1e-9)+1e-9*(1+Math.abs(cx)+Math.abs(cz));
 return extentsApart({minX:cx-pad,maxX:cx+pad,minZ:cz-pad,maxZ:cz+pad},query);
}
export function districtCompositionPlacementReason(plan:LevelPlan,ground:DistrictCompositionGround,prop:Prop,
 context:PopulationValidationContext=createPopulationValidationContext(plan),reservations?:readonly BoxCollider[],
 sampler:PlanTerrainSampler=new PlanTerrainSampler(plan),
 owned?:{readonly source:PopulationGroundSource;readonly index:GroundSourceCoverageIndex},
 bandIndex?:RectGrid<BoxCollider>):string|null {
 if(!['shrub','broadleafTree','conifer','fenceBay'].includes(prop.kind)||!finite(prop.position.x,prop.position.y,prop.position.z,prop.scale,prop.rotationY)
  ||prop.scale<=0||prop.scale>1.1)return 'prop';
 const polygon=propFootprint(prop,P.staticClearanceMetres),shape=PROP_SOLIDS[prop.kind];if(!shape)return 'body';
 const source=owned?.source??sourceFor(ground);if(!groundSourceCovers(source,polygon,owned?.index))return 'unowned-footprint';
 if(!surfaceFootprintClear(plan,polygon,GRASS,context))return 'actual-grass';
 const actors=reservations?undefined:actorReservations(plan),routes=reservations?undefined:routeReservations(plan.segments);
 if(!reservations&&(!actors||!routes))return 'unresolved-original-movement';
 const bands=reservations??[...actors!,...routes!];
 const polygonReach=polygonBoxReach(polygon),polygonExtent=convexExtent(polygon);
 const bandHit=(box:BoxCollider):boolean=>boxOverlapsPolygonWithin(box,polygon,polygonReach);
 // A caller-built grid over exactly these bands omits only boxes the broad
 // phase proves separated; "any band" does not depend on order.
 if(bandIndex&&bandIndex.values===bands&&polygonReach?rectGridAny(bandIndex,polygonReachRectangle(polygonReach),bandHit)
  :bands.some(bandHit))return 'movement-band';
 if((plan.populationGroundSources??[]).some(s=>s.purpose!=='footpath'&&s.polygons.some(p=>polygonsMeetWithin(p,polygon,polygonExtent)))
  ||(plan.populationCrossings??[]).some(c=>polygonsMeetWithin(c.corners.map(p=>({...p,y:0})),polygon,polygonExtent)))return 'vehicle-court-or-crossing';
 const minY=prop.position.y+PROP_VERTICAL_SPANS[prop.kind].bottom*prop.scale,maxY=prop.position.y+PROP_VERTICAL_SPANS[prop.kind].top*prop.scale;
 const hull={x:prop.position.x,z:prop.position.z,headingY:prop.rotationY,halfWidthMetres:shape.halfX*prop.scale,
  halfLengthMetres:shape.halfZ*prop.scale,minY,maxY,velocityX:0,velocityZ:0};
 const excluded=populationFootprintExclusion(plan,{polygon,minY,maxY,fromFraction:0,toFraction:1,fromHull:hull,toHull:hull},context);
 if(excluded)return excluded;
 if((plan.props??[]).some(other=>!(polygonExtent&&propSpreadApart(other,polygonExtent))
  &&polygonsMeet(propFootprint(other,0),polygon)))return 'existing-prop-spread';
 const sample=createGroundSample();
 if(ground.groundRule==='settled-kit'){
  const support=districtCompositionGrounding(plan,prop);if(!support||Math.abs(support.lowestHeight-prop.position.y)>P.epsilon)return 'actual-support';
  // The ground-contact base owns the vertical footing. Full crown/foliage
  // coverage, exact grass, movement, collisions and selector spread remain the
  // same guards above, rather than pretending a crown is a pedestrian floor.
  sampler.sampleGround(prop.position.x,prop.position.z,sample);
  if(sample.offCourse||sample.surface!=='grass'||!finite(sample.height,sample.normal.y)
   ||sample.normal.y<Math.cos(PROP_MAX_GROUND_SLOPE))return 'actual-support';
 }else for(const point of [prop.position,...polygon]){
  sampler.sampleGround(point.x,point.z,sample);
  if(sample.offCourse||!finite(sample.height,sample.normal.y)||sample.surface!=='grass'
   ||sample.normal.y<1/Math.sqrt(1+P.maximumGroundGrade**2)||Math.abs(sample.height-prop.position.y)>P.maximumStepMetres)return 'actual-support';
 }
 return null;
}
interface Proposal {readonly ground:DistrictCompositionGround;readonly props:readonly ProposedProp[]}
interface ProposalFamily {readonly id:string;readonly district:District;readonly owner:DistrictCompositionGround['owner'];
 readonly ownerId:string;readonly alternatives:readonly Proposal[]}
function ground(plan:LevelPlan,frame:Frame,id:string,district:District,use:DistrictCompositionGround['use'],
 owner:DistrictCompositionGround['owner'],ownerId:string,ownerDigest:string,hostSegmentIds:readonly string[],polygons:readonly Vec3[][]):DistrictCompositionGround|null {
 const triangles:GroundSurfaceTriangle[]=[];
 const groundRule=owner==='original-park-path'?'settled-kit' as const:'flat-lawn' as const;
 for(const polygon of polygons){const source=groundRule==='settled-kit'?clippedPlantingTriangles(plan,polygon):clippedFieldTriangles(plan.heightfield,polygon,frame.position.y,CLIP);if(!source?.length)return null;triangles.push(...source);}
 return {id,district,use,owner,ownerId,ownerDigest,hostSegmentIds,polygons,triangles,referenceHeight:frame.position.y,groundRule};
}
/** A planting subzone owns exactly the complete expanded spreads it contains,
 * including the tiny enclosure margin. Empty lawn between otherwise legal
 * plants need not be relabelled as one large managed garden. */
function bedPolygons(frame:Frame,specs:readonly ProposedProp[]):Vec3[][] {
 return specs.map(spec=>{
  const footprint=propFootprint({kind:spec.kind,position:spec.position,rotationY:spec.yaw,scale:spec.scale},P.staticClearanceMetres);
  const points=footprint.map(p=>{const dx=p.x-frame.position.x,dz=p.z-frame.position.z;return {
   x:Math.cos(frame.yaw)*dx-Math.sin(frame.yaw)*dz,z:Math.sin(frame.yaw)*dx+Math.cos(frame.yaw)*dz};});
  return rectangle(frame,Math.min(...points.map(p=>p.x))-.005,Math.max(...points.map(p=>p.x))+.005,
   Math.min(...points.map(p=>p.z))-.005,Math.max(...points.map(p=>p.z))+.005);
 });
}
const clamp=(value:number,low:number,high:number):number=>Math.max(low,Math.min(high,value));
/** Front ownership is still the actual entrance lawn and the full 2.6 m clear
 * entry gap. Independent small subzones retain legal planting on the other
 * side when one paving edge, original tree or furnishing refuses a bed. */
function frontageProposals(plan:LevelPlan,front:DistrictFrontage,gardens?:GardenMemo):ProposalFamily[] {
 const result:ProposalFamily[]=[],{half,leftInner,rightInner,near,far}=frontageGardenBoundsIn(plan,front,gardens);
 if(!finite(half,leftInner,rightInner,near,far)||far<=near)return result;
 const frame={position:front.position,yaw:front.yaw},digest=hash128(JSON.stringify(front));
 for(const side of [-1,1]){
  const left=side<0?-half:rightInner,right=side<0?leftInner:half,width=right-left,depth=far-near;
  // These metric envelopes enclose the largest shrub choice; no new radius or
  // actor/route clearance is reduced to accommodate narrow residential lawns.
  const scale=.74,radius=(PROP_SPREADS.shrub.shape==='circle'?PROP_SPREADS.shrub.radius*scale+P.staticClearanceMetres:Infinity)/Math.cos(Math.PI/12)+.015;
  if(width<2*radius||depth<2*radius)continue;
  const columns=Math.min(3,Math.max(1,Math.floor((width-2*radius)/DISTRICT_COMPOSITION.shrubPitchMetres)+1));
  const rows=Math.min(3,Math.max(1,Math.floor((depth-2*radius)/DISTRICT_COMPOSITION.shrubPitchMetres)+1));
  let ordinal=0;
  for(let row=0;row<rows&&ordinal<3;row++)for(let column=0;column<columns&&ordinal<3;column++,ordinal++){
   const id=`composition/${front.id}/garden/${side}/${ordinal}`,x=columns===1?(left+right)/2:left+radius+(width-2*radius)*column/(columns-1),
    z=rows===1?(near+far)/2:near+radius+(depth-2*radius)*row/(rows-1),alternatives:Proposal[]=[];
   // The same front side and planting rank survive every alternative. This is
   // a finite source-ground search, never a relocation of accepted objects.
   const deltas=[[0,0],[.25,.30],[-.25,.30],[0,.60],[0,-.35]] as const;
   for(const [dx,dz]of deltas){
    const position=at(frame,clamp(x+side*dx,left+radius,right-radius),clamp(z+dz,near+radius,far-radius));
    const specs:ProposedProp[]=[{kind:'shrub',position,yaw:front.yaw+(ordinal%2?.2:-.2),scale}];
    const owned=ground(plan,frame,id,front.district,front.district==='industrial'?'service-screen':'entrance-gardens',
     'frontage',front.id,digest,[front.streetSegmentId],bedPolygons(frame,specs));
    if(owned&&!alternatives.some(p=>JSON.stringify(p.props)===JSON.stringify(specs)))alternatives.push({ground:owned,props:specs});
   }
   result.push({id,district:front.district,owner:'frontage',ownerId:front.id,alternatives});
  }
  // An optional physical threshold owns its own subzone. A rejected fence no
  // longer discards safe foliage or the source-connected people's activity.
  if((front.district==='industrial'||front.district==='residential')&&width>=3.7&&depth>=3.0){
   const id=`composition/${front.id}/threshold/${side}`,alternatives:Proposal[]=[];
   for(const fraction of [.2,.5,.8]){
    const specs:ProposedProp[]=[{kind:'fenceBay',position:at(frame,(left+right)/2,near+.30+(depth-.6)*fraction),yaw:front.yaw+Math.PI/2,scale:.9}];
    const owned=ground(plan,frame,id,front.district,front.district==='industrial'?'service-screen':'entrance-gardens',
     'frontage',front.id,digest,[front.streetSegmentId],bedPolygons(frame,specs));
    if(owned)alternatives.push({ground:owned,props:specs});
   }
   result.push({id,district:front.district,owner:'frontage',ownerId:front.id,alternatives});
  }
 }
 return result;
}
/** Existing park canopy/furniture is retained. Each of six source-path stops
 * offers one tree and two independent understory beds; refusing its tree cannot
 * erase otherwise legal grass beds. Every finite alternative remains on a
 * genuine interior frame of the same original admitted half-span and in the
 * unchanged source-path lateral domain. No spread/body/actor guard is waived. */
function parkProposals(plan:LevelPlan):ProposalFamily[]{const result:ProposalFamily[]=[];
 const used=new Set<string>();let stops=0;
 for(const witness of plan.populationActivityWalks??[]){
  if(!witness.originalPathId||!witness.originalFrameRange||used.has(witness.originalPathId))continue;
  const path=plan.populationPaths?.find(p=>p.id===witness.originalPathId);
  if(!path||path.role!=='pedestrian'||path.district!=='park'||path.id.startsWith('district-activity/')||path.frames.length<2)continue;
  used.add(path.id);if(used.size>DISTRICT_COMPOSITION.maximumFrontagesPerDistrict)break;
  const [from,to]=witness.originalFrameRange,digest=hash128(JSON.stringify(path));
  for(const ordinal of [0,1]){
   if(stops>=DISTRICT_COMPOSITION.maximumParkStops)break;stops++;
   for(const rank of [0,1,2]){
   const treeKind:CompositionKind=ordinal%2?'conifer':'broadleafTree',kind:CompositionKind=rank===0?treeKind:'shrub',
    id=`composition/park/${path.id}/stop/${ordinal}/bed/${rank}`,alternatives:Proposal[]=[],seen=new Set<string>();
   // Eight interior stations, both sides and three fitting lateral centres:
   // at most 48 alternatives for this independent bed. The same path and
   // original admitted range witness every candidate; no generator RNG runs.
   const stations=Array.from({length:8},(_,index)=>(ordinal===0?.07:.55)+.38*(index+.5)/8);
   const anchor=ordinal===0?.25:.75;
   stations.sort((a,b)=>Math.abs(a-anchor)-Math.abs(b-anchor)||a-b);
   for(const fraction of stations){
    const index=from+Math.floor((to-from)*fraction),p=path.frames[index];if(!p)continue;
    const frame={position:{x:p.x,y:p.y,z:p.z},yaw:p.headingY};
    for(const side of rank%2?[-1,1]:[1,-1])for(const lateral of rank===0?[6.5,8.1,4.9]:rank===1?[4.5,6.5,8.5]:[8.5,6.5,4.5]){
     const position=at(frame,side*(p.halfWidthMetres+lateral),0),key=JSON.stringify([index,position]);
     if(seen.has(key))continue;seen.add(key);
     const specs:ProposedProp[]=[{kind,position,yaw:frame.yaw+(rank===1?-.3:rank===2?.4:0),scale:rank===0?(kind==='broadleafTree'?.64:.70):.74}];
     const owned=ground(plan,frame,id,'park','park-grove','original-park-path',path.id,digest,
      plan.populationGroundSources?.find(s=>s.id===p.sourceSegmentId)?.hostSegmentIds??[p.sourceSegmentId],bedPolygons(frame,specs));
     if(owned)alternatives.push({ground:{...owned,sourceFrameIndex:index,activityWalkId:witness.id},props:specs});
    }
   }
   result.push({id,district:'park',owner:'original-park-path',ownerId:path.id,
    alternatives:alternatives.slice(0,DISTRICT_COMPOSITION.maximumParkAlternativesPerSubzone)});
   }
  }
 }
 return result;
}
/** Six independent stations per side frame the authored square on its genuine
 * nine metre outer shoulder. Bounded source-grid alternatives can find a grass
 * gap around existing benches, trees, access branches and the checkpoint.
 * Borrowing roadside grass beyond this exact original plaza domain refuses. */
function plazaProposals(plan:LevelPlan):ProposalFamily[]{const host=plan.segments.find(s=>s.id==='plaza');
 if(!host||host.entry.halfWidth!==17||host.exit.halfWidth!==17||host.entry.surface!=='brick'||host.exit.surface!=='brick'
  ||Math.abs(host.entry.headingY-host.exit.headingY)>P.epsilon)return [];
 const frame={position:host.entry.position,yaw:host.entry.headingY},result:ProposalFamily[]=[];
 const stations=Array.from({length:23},(_,index)=>11+1.5*index);
 for(const side of [-1,1])for(const [ordinal,anchor]of [12,18,24,30,36,42].entries()){
  const id=`composition/plaza/${side}/station/${ordinal}`,alternatives:Proposal[]=[];
  const sites=stations.flatMap(z=>[19.65,21.85,22.80,24.00,24.70,25.00].map(x=>({x,z})));
  sites.sort((a,b)=>Math.abs(a.z-anchor)-Math.abs(b.z-anchor)||a.x-b.x||a.z-b.z);
  for(const site of sites.slice(0,DISTRICT_COMPOSITION.maximumPlazaAlternativesPerSubzone)){
   const specs:ProposedProp[]=[{kind:'shrub',position:at(frame,side*site.x,site.z),yaw:frame.yaw+(ordinal%2?.3:-.2),scale:.72}];
   const owned=ground(plan,frame,id,'commercial','plaza-edge','authored-plaza',host.id,
    hash128(JSON.stringify(host)),[host.id],bedPolygons(frame,specs));
   if(owned)alternatives.push({ground:owned,props:specs});
  }
  result.push({id,district:'commercial',owner:'authored-plaza',ownerId:host.id,alternatives});
 }
 return result;
}
function cost(source:LevelPlan,entries:readonly DistrictCompositionEntry[]):DistrictCompositionReport['cost']{
 const old=new Map<PropPartId,number>(),added=new Map<PropPartId,number>();
 for(const prop of source.props??[])propPartCounts(prop,old);for(const entry of entries)propPartCounts(entry.prop,added);
 let colourTriangles=0,shadowTriangles=0,additionalColourDrawCalls=0,additionalShadowDrawCalls=0;
 for(const [id,count]of added){const part=PART_COSTS[id];colourTriangles+=part.triangles*count;
  if(part.castsShadow)shadowTriangles+=part.triangles*count;
  if(!old.has(id)){additionalColourDrawCalls++;if(part.castsShadow)additionalShadowDrawCalls++;}}
 return {propCount:entries.length,solidCount:entries.filter(e=>e.bodyArray==='solids').length,
  softBodyCount:entries.filter(e=>e.bodyArray==='softBodies').length,colourTriangles,shadowTriangles,
  additionalColourDrawCalls,additionalShadowDrawCalls,partInstances:[...added].map(([id,count])=>({id,count}))};
}
/** Install once after actual activity authoring. Additive kit instances share
 * the existing renderer owners and physical grid; ground and actor data stay exact. */
export function withDistrictComposition(source:DistrictCompositionPlan):DistrictCompositionPlan {
 if(source.districtComposition)return source;
 const rejected:{zoneId:string;reason:string;attempts?:number;attemptReasons?:readonly string[]}[]=[],grounds:DistrictCompositionGround[]=[],entries:DistrictCompositionEntry[]=[];
 const actors=actorReservations(source),routes=routeReservations(source.segments),reservations=actors&&routes?[...actors,...routes]:null;
 const bandIndex=reservations?rectGrid(reservations,boxReachRectangle):undefined;
 const frontages=source.districtAdjacency?.frontages??[],selected=new Map<District,readonly DistrictFrontage[]>();
 const gardens:GardenMemo=new Map();
 for(const district of ['commercial','industrial','residential','park']as const){
  // Places that already contain a genuine purposeful walk get first chance at
  // coherent framing. Equal ranks retain their original frontage order.
  const active=new Set((source.populationActivityWalks??[]).flatMap(w=>w.frontageId?[w.frontageId]:[]));
  selected.set(district,frontages.filter(f=>f.district===district).map((front,index)=>({front,index}))
   .sort((a,b)=>Number(active.has(b.front.id))-Number(active.has(a.front.id))||a.index-b.index)
   .slice(0,DISTRICT_COMPOSITION.maximumFrontagesPerDistrict).map(item=>item.front));
 }
 const proposals:ProposalFamily[]=[];
 // Round-robin source owners, then independent beds on each selected owner.
 for(let ordinal=0;ordinal<DISTRICT_COMPOSITION.maximumFrontagesPerDistrict;ordinal++)for(const district of ['commercial','industrial','residential','park']as const){
  const front=selected.get(district)?.[ordinal];if(!front)continue;
  const beds=frontageProposals(source,front,gardens);if(beds.length)proposals.push(...beds);
  else rejected.push({zoneId:`composition/${front.id}`,reason:'no-bounded-source-garden',attempts:0});
 }
 proposals.push(...parkProposals(source),...plazaProposals(source));
 let working=source;
 const supportSampler=new PlanTerrainSampler(source);
 let workingContext=createPopulationValidationContext(source);
 const ownerSnapshot=[streetFronts(source),environmentSites(source),residentialSites(source)].map(v=>JSON.stringify(v));
 for(const family of proposals){
  const failures:string[]=[];let accepted=false;
  if(!reservations){rejected.push({zoneId:family.id,reason:'unresolved-original-movement',attempts:0});continue;}
  if(!family.alternatives.length){rejected.push({zoneId:family.id,reason:'no-source-valid-subzone',attempts:0});continue;}
  for(const proposal of family.alternatives){
   const id=proposal.ground.id;
   if(grounds.length>=DISTRICT_COMPOSITION.maximumZones||entries.length+proposal.props.length>DISTRICT_COMPOSITION.maximumProps
    ||proposal.ground.use==='park-grove'&&grounds.filter(g=>g.use==='park-grove').length>=DISTRICT_COMPOSITION.maximumParkSubzones){failures.push('finite-count-envelope');break;}
   const context=workingContext,groundReason=districtCompositionGroundReason(working,proposal.ground,context,gardens);
   if(groundReason){failures.push(groundReason);continue;}
   if(proposal.ground.polygons.some((polygon,index)=>proposal.ground.polygons.slice(index+1).some(other=>polygonsMeet(polygon,other)))
    ||grounds.some(old=>old.polygons.some(polygon=>proposal.ground.polygons.some(other=>polygonsMeet(polygon,other))))){
    failures.push('managed-subzone-overlap');continue;}
   const added:DistrictCompositionEntry[]=[];let trial=working,trialContext=context,failure:string|null=null;
   const ownedSource=sourceFor(proposal.ground),owned={source:ownedSource,index:prepareGroundSourceCoverage(ownedSource)};
   for(const spec of proposal.props){
    const centreY=fieldHeightAt(trial.heightfield,trial.surround,spec.position.x,spec.position.z);
    const original:Prop={kind:spec.kind,position:{...spec.position,y:centreY},rotationY:spec.yaw,scale:spec.scale};
    const grounding=districtCompositionGrounding(trial,original);
    if(!grounding){failure=`${spec.kind}:base-burial-or-grade`;break;}
    const y=grounding.lowestHeight,prop:Prop={...original,position:{...original.position,y}};
    const grounded={...grounding,baseFootprint:grounding.baseFootprint.map(p=>({...p,y}))};
    const reason=districtCompositionPlacementReason(trial,proposal.ground,prop,trialContext,reservations,supportSampler,owned,bandIndex);
    if(reason){failure=`${spec.kind}:${reason}`;break;}
    const shape=PROP_SOLIDS[spec.kind]!,body:BoxCollider={centre:{x:prop.position.x,y:y+shape.height*prop.scale/2,z:prop.position.z},
     halfExtents:{x:shape.halfX*prop.scale,y:shape.height*prop.scale/2,z:shape.halfZ*prop.scale},rotationY:prop.rotationY,
     surface:shape.surface,...(shape.occludes?{}:{occludes:false})};
    const bodyArray=shape.soft?'softBodies':'solids',polygon=propFootprint(prop,P.staticClearanceMetres);
    added.push({zoneId:id,propIndex:trial.props?.length??0,bodyIndex:trial[bodyArray]?.length??0,bodyArray,prop,body,
     footprint:polygon,footprintAreaSquareMetres:area(polygon),grounding:grounded});
    trial={...trial,props:[...(trial.props??[]),prop],solids:[...(trial.solids??[]),...(shape.soft?[]:[body])],
     softBodies:[...(trial.softBodies??[]),...(shape.soft?[body]:[])]};
    trialContext=createPopulationValidationContext(trial,trialContext);
   }
   if(failure){failures.push(failure);continue;}
   if([streetFronts(trial),environmentSites(trial),residentialSites(trial)].some((v,i)=>JSON.stringify(v)!==ownerSnapshot[i])){
    failures.push('protected-opening');continue;}
   if(cost(source,[...entries,...added]).colourTriangles>DISTRICT_COMPOSITION.maximumColourTriangles){failures.push('finite-triangle-envelope');break;}
   grounds.push(proposal.ground);entries.push(...added);working=trial;workingContext=trialContext;accepted=true;break;
  }
  if(!accepted)rejected.push({zoneId:family.id,reason:failures.at(-1)??'no-source-valid-subzone',attempts:failures.length,attemptReasons:failures});
 }
 const protectedContentDigest=hash128(JSON.stringify({props:source.props,solids:source.solids,softBodies:source.softBodies,
  segments:source.segments,groundSurfacePatches:source.groundSurfacePatches,populationPaths:source.populationPaths,
  populationActivitySites:source.populationActivitySites,populationActivityWalks:source.populationActivityWalks,
  populationGroundSources:source.populationGroundSources,populationCrossings:source.populationCrossings}));
 const physicalWorldId=entries.length?`composition-r16-${hash128(JSON.stringify([source.id,grounds,entries]))}`:source.id;
 const coverage=(['commercial','industrial','residential','park']as const).map(district=>{
  const supplied=proposals.filter(p=>p.district===district),accepted=grounds.filter(g=>g.district===district);
  const suppliedIds=new Set((selected.get(district)??[]).map(f=>`frontage/${f.id}`));
  for(const proposal of supplied)suppliedIds.add(`${proposal.owner}/${proposal.ownerId}`);
  if(district==='park')for(const walk of source.populationActivityWalks??[])if(walk.originalPathId)suppliedIds.add(`original-park-path/${walk.originalPathId}`);
  if(district==='commercial'&&source.segments.some(s=>s.id==='plaza'&&s.entry.halfWidth===17&&s.entry.surface==='brick'))suppliedIds.add('authored-plaza/plaza');
  return {district,suppliedOwners:suppliedIds.size,
   acceptedOwners:new Set(accepted.map(g=>`${g.owner}/${g.ownerId}`)).size,zoneIds:accepted.map(g=>g.id),
   plantedFootprintSquareMetres:entries.filter(e=>accepted.some(g=>g.id===e.zoneId)).reduce((sum,e)=>sum+e.footprintAreaSquareMetres,0),
   managedGroundSquareMetres:accepted.reduce((sum,g)=>sum+g.polygons.reduce((sum,p)=>sum+area(p),0),0)};
 });
 return {...working,id:physicalWorldId,populationActivityChoiceWorldId:source.populationActivityChoiceWorldId??source.id,
  districtComposition:{revision:DISTRICT_COMPOSITION.revision,sourceWorldId:source.id,physicalWorldId,grounds,entries,rejected,coverage,
   cost:cost(source,entries),protectedContentDigest}};
}
