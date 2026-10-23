/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan } from './plan.ts';
import type { AuthoredPopulationPath, AuthoredPathFrame, PopulationGroundSource, PopulationActivity, PopulationCrossing } from './populationPlan.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';

type Point={x:number;z:number};
type District=AuthoredPopulationPath['district'];
/** Exact authored line/arc samples, with chord distance accumulated once.
 * A stadium's rounding-error "side" (z1−z0 = 2r) adds no duplicate sample. */
function rounded(x0:number,x1:number,z0:number,z1:number,r:number,reverse=false):Point[]{
 const p:Point[]=[];
 const line=(a:Point,b:Point)=>{const l=Math.hypot(b.x-a.x,b.z-a.z),n=l>1e-6?Math.ceil(l):0;for(let i=0;i<n;i++)p.push({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n});};
 const arc=(cx:number,cz:number,a:number)=>{const n=Math.ceil(Math.PI*r/2);for(let i=0;i<n;i++){const h=a+Math.PI/2*i/n;p.push({x:cx+r*Math.cos(h),z:cz+r*Math.sin(h)});}};
 line({x:x0+r,z:z0},{x:x1-r,z:z0});arc(x1-r,z0+r,-Math.PI/2);
 line({x:x1,z:z0+r},{x:x1,z:z1-r});arc(x1-r,z1-r,0);
 line({x:x1-r,z:z1},{x:x0+r,z:z1});arc(x0+r,z1-r,Math.PI/2);
 line({x:x0,z:z1-r},{x:x0,z:z0+r});arc(x0+r,z0+r,Math.PI);
 if(reverse)p.reverse();p.push({...p[0]});return p;
}
function segment(a:Point,b:Point):Point[]{const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));return Array.from({length:n+1},(_,i)=>({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}));}
/** Closed 24-gon; vertex k sits at compass heading k·15° (0 = +z, 6 = +x, 12 = −z, 18 = −x). */
function ring(cx:number,cz:number,r:number):Point[]{const p=Array.from({length:24},(_,k)=>({x:cx+r*Math.sin(k*Math.PI/12),z:cz+r*Math.cos(k*Math.PI/12)}));p.push({...p[0]});return p;}
/** The same chord sums the path frames use, so a vertex index is an exact station. */
function along(p:readonly Point[]):number[]{let d=0;return p.map((q,i)=>i?(d+=Math.hypot(q.x-p[i-1].x,q.z-p[i-1].z)):0);}
const shift=(p:readonly Point[],dx:number,dz:number)=>p.map(q=>({x:q.x+dx,z:q.z+dz}));
/** A thin out-and-back loop: +x along lane zA, −x along lane zB (zA < zB). */
const xLoop=(x0:number,x1:number,zA:number,zB:number)=>rounded(x0,x1,zA,zB,(zB-zA)/2);
/** A thin out-and-back loop: +z along lane xB, −z along lane xA (xA < xB). */
const zLoop=(xA:number,xB:number,z0:number,z1:number)=>rounded(xA,xB,z0,z1,(xB-xA)/2);
const rect=(x0:number,x1:number,z0:number,z1:number)=>[{x:x0,y:0,z:z0},{x:x1,y:0,z:z0},{x:x1,y:0,z:z1},{x:x0,y:0,z:z1}];
export function withQuayActivity(plan:LevelPlan):LevelPlan {
 const paths:AuthoredPopulationPath[]=[],sources:PopulationGroundSource[]=[],requests:PopulationActivity['paths'][number][]=[];
 const sampler=new PlanTerrainSampler(plan),g=createGroundSample();
 const add=(id:string,points:Point[],kind:PopulationActivity['paths'][number]['kind'],stations:number[],pace:number,
  o:{closed?:boolean;district?:District;groupId?:string;facings?:number[];direction?:1|-1;heading?:number}={})=>{
  const closed=o.closed??true;let distance=0;const role=kind==='trafficVehicle'?'traffic':kind==='fictionalEuc'?'rider':'pedestrian';
  const frames:AuthoredPathFrame[]=points.map((p,i)=>{if(i)distance+=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);const next=points[i+1]??points[1]??p,prev=points[i-1]??p;
   const dx=i===points.length-1&&!closed?p.x-prev.x:next.x-p.x,dz=i===points.length-1&&!closed?p.z-prev.z:next.z-p.z;
   return {...p,y:sampler.sampleGround(p.x,p.z,g).height,headingY:o.heading??Math.atan2(dx,dz),distanceMetres:distance,sourceSegmentId:`${id}/ground`,halfWidthMetres:role==='traffic'?3:1.3};});
  if(closed)frames[frames.length-1]={...frames[frames.length-1],headingY:frames[0].headingY};
  const pad=role==='traffic'?3:1.5;
  sources.push({id:`${id}/ground`,purpose:'footpath',hostSegmentIds:['quay-centre-0'],polygons:[rect(Math.min(...points.map(p=>p.x))-pad,Math.max(...points.map(p=>p.x))+pad,Math.min(...points.map(p=>p.z))-pad,Math.max(...points.map(p=>p.z))+pad)],groundPatchIds:[]});
  paths.push({id,role,district:o.district??'commercial',frames,closed,serviceShuttle:false});
  // Closed loops wrap a station; an open shuttle keeps it inside its two ends.
  const wrap=(s:number)=>closed?((s%distance)+distance)%distance:s;
  requests.push({pathId:id,kind,pace,direction:o.direction??1,stations:stations.map(wrap),...(o.groupId?{groupId:o.groupId}:{}),...(o.facings?{facings:o.facings}:{})});
 };
 /** One walking party on its own path(s). `beside` are translated copies of the
  * path walked in step (a side-by-side pair or trio); `behind` are extra people
  * on the first path, metres back along the direction of travel. Each path has
  * its own pace, so neighbouring parties drift apart instead of locking into file. */
 const party=(id:string,points:Point[],pace:number,at:number,o:{direction?:1|-1;district?:District;closed?:boolean;beside?:Point[];behind?:number[];kind?:'walker'|'jogger'}={})=>{
  const d=o.direction??1,kind=o.kind??'walker';
  add(id,points,kind,[at,...(o.behind??[]).map(b=>at-d*b)],pace,o);
  (o.beside??[]).forEach((v,i)=>add(`${id}-${i+2}`,shift(points,v.x,v.z),kind,[at],pace,o));
 };
 /** Standing people at ring vertices; spectators face `look`, a pair faces each
  * other, anyone else faces the group centre. Small fixed turns stop mirror poses. */
 const group=(name:string,cx:number,cz:number,at:number[],o:{look?:Point;r?:number;district?:District;points?:Point[];deck?:boolean}={})=>{
  const pts=o.points??ring(cx,cz,o.r??1.4),d=along(pts),pos=at.map(k=>pts[k]);
  const facings=pos.map((p,i)=>{const t=o.look??(at.length===2?pos[1-i]:{x:cx,z:cz});return Math.atan2(t.x-p.x,t.z-p.z)+((i*3)%5-2)*.07;});
  // Nobody travels a stationary support, so on a deck slab its frames keep one
  // heading: the turning allowance for a walker rotating along a curve would
  // otherwise dip the swept prism into the slab it stands on. Each member's
  // actual pose and facing is still admitted exactly where it stands.
  add(`quay-group-${name}`,pts,'social',at.map(k=>d[k]),0,{district:o.district??'commercial',groupId:`quay-group-${name}`,facings,...(o.deck?{heading:0}:{})});
 };
 const X=(x:number,z:number)=>({x,z});
 // ---- Market and café: the two plaza-edge loops feed the zebra crossings. ----
 add('quay-market-out',rounded(-13.1,81.1,-6.1,49.1,4.1),'walker',[110],1.8);
 add('quay-market-in',rounded(-10.9,78.9,-3.9,46.9,1.9,true),'walker',[72],1.8);
 // Café walk crosses both south-road lanes at x50; its return lane is 2.2 m away.
 // One walker: each crossing holds every van on two loops, and a held van is caught up.
 add('quay-cafe-walk',rounded(48.9,51.1,46,80.6,1.1),'walker',[12],1.8);
 // ---- Plaza: small strolls of different shapes, paces and senses, no parade ring. ----
 party('quay-stroll-fountain',rounded(58,67,21.5,29.5,3),1,6);
 party('quay-stroll-cafe',rounded(63.5,76.5,35,40.5,2.75),1.25,10,{direction:-1,behind:[1.8]});
 party('quay-stroll-pocket',rounded(27.5,32.5,-1.5,9.5,2.5),.9,4);
 party('quay-stroll-stalls',zLoop(75.5,77.5,0,21),1.2,30,{direction:-1});
 group('market-a',59.5,32.3,[2,10,17]);
 group('market-b',70.5,31.8,[0,8,16],{r:1.5});
 group('cafe-a',69.5,43.6,[3,11,19],{r:1.3});
 group('cafe-b',29.5,44,[1,9,17],{r:1.3});
 group('plaza-nw',19,4,[3,9]);
 // Bowl watchers stand at least 3 m back from the west coping (x 38) and off the exit run.
 group('bowl-west',33.5,29.5,[3,8,14],{r:1.5,look:X(42,31)});
 group('bowl-south',33,37.5,[3,8],{look:X(42,37.5)});
 group('bowl-exit',57.5,42.8,[15,20],{look:X(49,37)});
 // ---- Park: pad onlookers outside both run lanes, picnics, a concentric track. ----
 group('pads-north-1',28.5,-49.2,[20,1,9],{district:'park',look:X(25,-42)});
 group('pads-north-2',46,-49.2,[23,4,12],{district:'park',look:X(50,-42)});
 group('pads-island',38,-35.5,[9,15,22],{district:'park',look:X(38,-42)});
 group('picnic-west',29,-23.2,[1,9,17],{district:'park',r:1.5});
 group('picnic-east',67.5,-22.8,[2,10,17],{district:'park'});
 // Concentric stadiums about one centre line (z −14.5), lanes 1.3 m apart.
 const track=(x0:number,x1:number,r:number)=>rounded(x0-r,x1+r,-14.5-r,-14.5+r,r);
 party('quay-park-jog',track(27,75,5),2.5,0,{district:'park',kind:'jogger',behind:[70]});
 party('quay-park-jog-back',track(27,75,3.7),2.2,40,{district:'park',kind:'jogger',direction:-1});
 party('quay-park-walk',track(27,75,2.4),1.15,20,{district:'park',behind:[1.7]});
 party('quay-park-amble',track(32,50,1.1),.95,10,{district:'park',direction:-1});
 // ---- North promenade: parties, not a file. Lanes −84.6…−78.1, 1.3 m apart. ----
 const pair=[X(0,1.3)];
 party('quay-north-a',xLoop(-86,-8,-83.3,-79.4),1.2,20,{district:'residential',beside:pair});
 party('quay-north-b',xLoop(-58,58,-84.6,-80.7),1.4,130,{district:'residential',direction:-1});
 party('quay-north-c',xLoop(6,86,-83.3,-79.4),1.05,40,{district:'residential',direction:-1,beside:pair,behind:[1.8]});
 party('quay-north-d',xLoop(64,86,-84.6,-80.7),1.25,8,{district:'residential'});
 group('north',-64,-85.9,[0,6,12,18],{district:'residential',r:1.3});
 // ---- West promenade: lanes x −113.6…−107.1 between the trees and the rider. ----
 const side=[X(1.3,0)];
 party('quay-west-a',zLoop(-113.6,-109.7,-74,6),1.1,30,{district:'residential',beside:side});
 party('quay-west-b',zLoop(-111,-107.1,-40,60),1.35,60,{district:'residential',direction:-1});
 party('quay-west-c',zLoop(-113.6,-109.7,20,80),1.25,50,{district:'residential',direction:-1,beside:side});
 party('quay-west-d',zLoop(-111,-107.1,-76,-46),1,10,{district:'residential'});
 group('west',-115.9,31,[3,9],{district:'residential',r:1.3});
 // ---- Waterfront: shuttle strolls ≥ 4.8 m south of L5's lane (z 78), watchers by its pads. ----
 const water=(x0:number,x1:number,z:number)=>segment(X(x0,z),X(x1,z));
 party('quay-water-a',water(-96,-64,82.8),1.1,8,{closed:false,district:'residential',beside:pair});
 party('quay-water-b',water(-40,-4,82.8),1.3,20,{closed:false,district:'residential',direction:-1});
 party('quay-water-c',water(10,42,82.8),1,20,{closed:false,district:'residential',direction:-1,beside:pair});
 party('quay-water-d',water(58,104,84.1),1.2,15,{closed:false,district:'residential'});
 group('water-pad-1',-58,84.4,[7,12,19],{district:'residential',r:1.5,look:X(-54,78)});
 group('water-pad-2',-24,85.4,[7,12],{district:'residential',r:1.3,look:X(-18,78)});
 group('water-catch',5.5,85.2,[8,13],{district:'residential',r:1.3,look:X(8,78)});
 // ---- West street block: a sidewalk 3 m and 1.7 m off its walls, plus an alley pair. ----
 party('quay-block-out',rounded(-61,-39,-57,27,3),1.15,40,{district:'residential',behind:[1.8]});
 add('quay-block-in',rounded(-59.7,-40.3,-55.7,25.7,1.7),'walker',[20,120],1.3,{district:'residential',direction:-1});
 group('block-alley',-50,-32,[5,11],{district:'residential',r:1.3});
 // ---- Roof decks (y 11): watchers by each gap and the final deck turn. ----
 const roof=(name:string,cx:number,cz:number,at:number[],look:Point,o:{points?:Point[];r?:number}={})=>group(`roof-${name}`,cx,cz,at,{district:'residential',look,deck:true,...o});
 roof('opener-west',-81.5,-13.5,[2,7,14],X(-74,-10));
 roof('opener-east',-66.5,-13.5,[17,22],X(-74,-10));
 roof('finale-west',-81.5,14.5,[3,9],X(-74,19));
 roof('finale-east',-66.5,14.5,[17,23],X(-74,19));
 roof('landing',-80.8,27.5,[3,8,15],X(-74,29));
 // A slim oval keeps this pair 1.7 m from the plant either side and 1.5 m from the parapet.
 const slim=rounded(-44.3,-42.7,53.8,57.2,.8);
 roof('final-south',-43.5,55.5,[slim.findIndex(p=>p.z>=56.4&&p.x<-44),slim.findIndex(p=>p.z<=54.8&&p.x>-43)],X(-46,51),{points:slim});
 roof('final-turn',-60,42.5,[16,21,4],X(-68,44));
 // ---- Riders and traffic. ----
 add('quay-north-rider',segment({x:-80,z:-75.5},{x:80,z:-75.5}),'fictionalEuc',[50],3.8,{closed:false,district:'residential'});
 add('quay-west-rider',segment({x:-105.5,z:-48},{x:-105.5,z:48}),'fictionalEuc',[30],3.8,{closed:false,district:'residential'});
 // Traffic: two inner-lane loops (each half ring plus one centre-avenue leg) and
 // one full outer-lane ring the opposite way, so a rider on the ring meets
 // oncoming vans. Radius 8 at the T-junctions. Both ring lanes turn on radius 16
 // about corner centres 4 m apart on the diagonal: opposite lanes are 5.7 m apart
 // mid-corner instead of the 4 m of concentric 14/18 m corners, where the vans'
 // looks met and stopped each other on every bend. Vans still brake briefly for
 // a turning van's straight-line forecast at corners and the two T-junctions.
 const traffic:Point[]=[];
 const ln=(a:Point,b:Point,out=traffic)=>out.push(...segment(a,b).slice(0,-1));
 const ar=(x:number,z:number,r:number,start:number,end:number,out=traffic)=>{const n=Math.ceil(Math.abs(end-start)*r*2);for(let i=0;i<n;i++){const a=start+(end-start)*i/n;out.push({x:x+r*Math.cos(a),z:z+r*Math.sin(a)});}};
 ln({x:2,z:-58},{x:2,z:58});ar(10,58,8,Math.PI,Math.PI/2);ln({x:10,z:66},{x:80,z:66});ar(80,50,16,Math.PI/2,0);
 ln({x:96,z:50},{x:96,z:-50});ar(80,-50,16,0,-Math.PI/2);ln({x:80,z:-66},{x:10,z:-66});ar(10,-58,8,-Math.PI/2,-Math.PI);traffic.push({...traffic[0]});
 const inner=along(traffic).at(-1)!,innerAt=Array.from({length:4},(_,i)=>inner*(i+.35)/4);
 add('quay-east-traffic',traffic,'trafficVehicle',innerAt,5.5);
 add('quay-west-traffic',traffic.map(p=>({x:-p.x,z:-p.z})),'trafficVehicle',innerAt,5.5);
 const outer:Point[]=[];
 ln({x:84,z:70},{x:-84,z:70},outer);ar(-84,54,16,Math.PI/2,Math.PI,outer);ln({x:-100,z:54},{x:-100,z:-54},outer);ar(-84,-54,16,Math.PI,Math.PI*1.5,outer);
 ln({x:-84,z:-70},{x:84,z:-70},outer);ar(84,-54,16,-Math.PI/2,0,outer);ln({x:100,z:-54},{x:100,z:54},outer);ar(84,54,16,0,Math.PI/2,outer);outer.push({...outer[0]});
 const ringLength=along(outer).at(-1)!;
 add('quay-ring-traffic',outer,'trafficVehicle',Array.from({length:7},(_,i)=>ringLength*(i+.2)/7),6.5);
 const crossings:PopulationCrossing[]=[[-5,'north'],[48,'south']].map(([z,name])=>({id:`quay-cross-${name}`,sourceId:`quay-cross-${name}/ground`,corners:rect(-4.1,4.1,Number(z)-2.4,Number(z)+2.4),priority:'pedestrian',pedestrianPathIds:['quay-market-out','quay-market-in'],vehiclePathIds:['quay-east-traffic','quay-west-traffic']}));
 crossings.push({id:'quay-cross-water',sourceId:'quay-cross-water/ground',corners:rect(47.6,52.4,63.9,72.1),priority:'pedestrian',pedestrianPathIds:['quay-cafe-walk'],vehiclePathIds:['quay-east-traffic','quay-ring-traffic']});
 for(const c of crossings)sources.push({id:c.sourceId,purpose:'street-crossing',hostSegmentIds:['quay-centre-0'],polygons:[c.corners.map(p=>({...p,y:0}))],groundPatchIds:[]});
 return {...plan,populationPaths:paths,populationGroundSources:sources,populationCrossings:crossings,populationActivity:{revision:'authored-cut1-r1',ground:'authored',targets:{people:105,traffic:15,riders:2},paths:requests}};
}
