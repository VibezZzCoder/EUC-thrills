/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Quay Quarter, §45. Plain authored geometry; every raised space is solid below. */
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { createGroundSample } from '../simulation/world.ts';
import { buildLevelPlanSteps } from './buildPlan.ts';
import { PREPARATION_SLICE, runSteps, type Steps } from '../shared/preparationSteps.ts';
import type { AuthoredLaunchPad, BoxCollider, LevelPlan, Marking } from './plan.ts';
import type { SegmentBranch, SegmentSpec } from './segments.ts';
import { quayDressing } from './quayDressing.ts';
import { PROP_SOLIDS } from '../data/props.ts';
import { copingSolid, type QuayRailing, type QuayRect, type QuayScenerySpec } from './quayScenery.ts';
import { LAUNCH_PAD } from '../data/tuning.ts';
import { LAUNCH_PAD_ROLL_RADIUS, launchPadSkirtRun } from '../simulation/launchPadField.ts';

export const QUAY_CATCH_GARDENS=[[-77,-71,33,56,11],[22,26,27,44.5,0],[65,90,-44,-40,0],
  [40,44,25,43.2,0],[-1,26,76,80,0],[-32,-28,-58,-27,0]] as const;
/** Stall counters line the spawn's market lane, x 58.2–72.2, clear of every walk. */
export const QUAY_STALL_COLUMNS=[[56.6,58.2],[72.2,73.8]] as const;
export const QUAY_STALL_ROWS=[2.5,6.5,10.5,14.5] as const;
/** Rooftop plant, deck edges only: [x0,x1,z0,z1,height,appearance]. */
export const QUAY_ROOF_UNITS=[
 [-82.4,-80.8,-25.6,-24,1.1,'concrete'],[-82.4,-80.8,-22.6,-21,1.1,'concrete'],[-67.2,-65.4,-25.2,-23,1.4,'concrete'],[-66.6,-65.6,-19.5,-18.5,1.6,'concrete'],
 [-82.4,-80.8,-3.4,-1.8,1.1,'concrete'],[-82.6,-80.6,3,6,.45,'concrete'],[-67.2,-65.6,-4.2,-2.4,1.1,'concrete'],
 [-67.2,-65.6,29.4,31,1.1,'concrete'],[-67.2,-65.6,32.2,33.8,1.1,'concrete'],
 [-82.8,-79.8,54.6,57.6,2.8,'concrete'],[-62.6,-61,56.6,58.2,1.1,'concrete'],[-59.6,-58,56.6,58.2,1.1,'concrete'],[-47.6,-46,56.6,58.2,1.1,'concrete'],[-41,-38,55.6,58.2,.45,'concrete'],
] as const;
export const QUAY_SPAWN={position:{x:65,y:0,z:10},headingY:0};
export const QUAY_PAD_INSET= (LAUNCH_PAD.triggerRadiusMetres+launchPadSkirtRun()+LAUNCH_PAD_ROLL_RADIUS)/Math.cos(Math.PI/8)+.5;
export const QUAY_PADS: readonly AuthoredLaunchPad[]=[
  {id:'quay-roof-1',x:-74,z:-11-QUAY_PAD_INSET,yaw:0,dropMetres:0,holdSafeMetres:40},
  {id:'quay-roof-2',x:-74,z:17-QUAY_PAD_INSET,yaw:0,dropMetres:0,holdSafeMetres:14},
  {id:'quay-park-1',x:24,z:-42,yaw:Math.PI/2,dropMetres:0},
  {id:'quay-park-2',x:52,z:-42,yaw:Math.PI/2,dropMetres:0},
  {id:'quay-water-1',x:-54,z:78,yaw:Math.PI/2,dropMetres:0},
  {id:'quay-water-2',x:-18,z:78,yaw:Math.PI/2,dropMetres:0},
];
export function quayBox(x0:number,x1:number,z0:number,z1:number,top:number,bottom=0,appearance:BoxCollider['appearance']='concrete'):BoxCollider {
 return {centre:{x:(x0+x1)/2,y:(top+bottom)/2,z:(z0+z1)/2},halfExtents:{x:(x1-x0)/2,y:(top-bottom)/2,z:(z1-z0)/2},rotationY:0,surface:'pavement',appearance};
}
export function createQuayGeometry(guards=false, dressed=false):LevelPlan {
 return runSteps(createQuayGeometrySteps(guards,dressed));
}
/** `createQuayGeometry` as slices: the plan builder's own passes, then one per finishing pass. */
export function* createQuayGeometrySteps(guards=false, dressed=false):Steps<LevelPlan> {
 const main:SegmentSpec[]=[];
 for(const [i,length] of [104,164,104,164].entries()) {
  main.push({id:`quay-ring-${i}`,length,halfWidth:4,shoulder:.1,surface:'pavement',markings:[{role:'centre',path:[{s:.5,t:0},{s:length-.5,t:0}],broken:true}]});
  main.push({id:`quay-corner-${i}`,length:Math.PI*8,curvature:1/16,halfWidth:4,shoulder:.1,surface:'pavement'});
 }
 const branches:SegmentBranch[]=[{from:'quay-ring-3',atDistance:82,headingOffset:Math.PI/2,specs:[{id:'quay-centre-0',length:136,halfWidth:4,shoulder:.05,surface:'pavement'}]}];
 const branch=(id:string,x:number,z:number,h:number,specs:Partial<SegmentSpec>[],y=0)=>branches.push({from:'quay-centre-0',atDistance:z+68,lateralOffset:x,headingOffset:h,elevationOffset:y,specs:specs.map((s,i)=>({id:`${id}-${i}`,length:1,halfWidth:4,shoulder:.05,surface:'pavement',...s}))});
 branch('quay-up',-74,-57,0,[{length:30,halfWidth:4,climb:10.97,linearClimb:true}]);
 branch('quay-down',-28,39,Math.PI,[{length:39,halfWidth:4,climb:-10.97,linearClimb:true}],10.97);
 branch('quay-short-up',32,9.3,0,[{length:4.5,halfWidth:2,climb:.45,linearClimb:true}]);
 branch('quay-short-down',32,21.8,0,[{length:4.5,halfWidth:2,climb:-.45,linearClimb:true}],.45);
 branch('quay-grand-return',52,28,Math.PI,[{length:27,halfWidth:2,climb:1.2,linearClimb:true}]);
 branch('quay-grand-landing',42,21.6,0,[{length:12,halfWidth:4,climb:-2.4,linearClimb:true},{length:8,halfWidth:4},{length:2,halfWidth:4,climb:2.4,linearClimb:true}]);
 branch('quay-grand-exit',42,37,Math.PI/2,[{length:10,halfWidth:2,climb:2.4,linearClimb:true}],-2.4);
 branch('quay-kick',-30,0,Math.PI,[{length:6,halfWidth:2,climb:.6,linearClimb:true}]);
 const p=yield* buildLevelPlanSteps({main,branches},{id:'euclaude-r2',spawn:{position:{x:-98,y:0,z:-52},headingY:0},surround:{height:0,surface:'pavement'},spacing:1,fieldMargin:15,settleBlocks:false,...(dressed?{props:quayDressing()}:{})});
 const boxes:BoxCollider[]=[quayBox(-84,-64,-27,-11,11,dressed?10:0),quayBox(-84,-64,-7,17,11,dressed?10:0),quayBox(-84,-64,25,39,11,dressed?10:0),quayBox(-84,-24,39,59,11,dressed?10:0),
 quayBox(21,27,12,12.6,.15),quayBox(21,27,12.6,13.2,.3),quayBox(21,34,13.2,21.8,.45),quayBox(21,27,21.8,22.4,.3),quayBox(21,27,22.4,23,.15),
 // The grand stair deck and the ramp-top connector run back to the rear wall's
 // face at z −0.25: a 0.25 m slot there dropped a rider to y0 and held him (2026-10-23).
 // The connector starts at the deck's edge, so the two tops never share a plane.
 quayBox(35,49,-.25,12,1.2),quayBox(49,54,-.25,1,1.2),quayBox(-32,-28,-7,-6,.6)];
 // Treads run under both cheeks to their outer faces, as the drawn cheek walls
 // stand from the ground: no 0.15 m slot beside the stair (2026-10-23).
 for(let i=0;i<11;i++)boxes.push(quayBox(37.55,46.45,12+i*.8,12+(i+1)*.8,(11-i)*.1));
 // The island edge and the roof parapets are drawn as see-through railings
 // (`quayScenery.ts`, 2026-10-22): the same boxes in the same order, solid and
 // camera-occluding as ever, only not drawn as blocks.
 const unseen=(b:BoxCollider):BoxCollider=>({...b,drawn:false});
 const railings:QuayRailing[]=[];
 if(guards){
  // Two-metre physical edge: 1.4 m masonry and a top rail at 2 m.
  boxes.push(...[quayBox(-120,-118,-90,90,1.4),quayBox(118,120,-90,90,1.4),quayBox(-118,118,-90,-88,1.4),quayBox(-118,118,88,90,1.4)].map(unseen));
  boxes.push(...[quayBox(-119.1,-118.9,-90,90,2,1.82,'metal'),quayBox(118.9,119.1,-90,90,2,1.82,'metal'),quayBox(-119,119,-89.1,-88.9,2,1.82,'metal'),quayBox(-119,119,88.9,89.1,2,1.82,'metal')].map(unseen));
  for(let x=-116;x<=116;x+=4)for(const z of[-89,89])boxes.push(unseen(quayBox(x-.08,x+.08,z-.08,z+.08,2,1.4,'metal')));
  for(let z=-86;z<=86;z+=4)for(const x of[-119,119])boxes.push(unseen(quayBox(x-.08,x+.08,z-.08,z+.08,2,1.4,'metal')));
  // Harbour railing on the masonry's riding face: a granite plinth over the
  // whole footprint, rails at 0.78 and 1.08, the handrail at the masonry's
  // 1.4 m top and a guard rail at the 2 m top.
  const edge=[.78,1.08,1.4,2];
  for(const s of[-1,1]){
   railings.push({x0:118*s,z0:-88,x1:118*s,z1:88,nx:s,nz:0,plinth:{x0:s>0?118:-120,x1:s>0?120:-118,z0:-90,z1:90,top:.5},base:0,rails:edge,look:'harbour'});
   railings.push({x0:-118,z0:88*s,x1:118,z1:88*s,nx:0,nz:s,plinth:{x0:-118,x1:118,z0:s>0?88:-90,z1:s>0?90:-88,top:.5},base:0,rails:edge,look:'harbour'});
  }
  // Roof railings on each parapet's deck face, on a 0.3 m brick upstand; top rail at the parapet's 12.6 m.
  const roof=[.72,1.14,1.6],run=(x0:number,z0:number,x1:number,z1:number,nx:number,nz:number,p:QuayRect)=>railings.push({x0,z0,x1,z1,nx,nz,plinth:{...p,top:11.3},base:11,rails:roof,look:'roof'});
  for(const [z0,z1] of [[-27,-11],[-7,17]]){run(-83.75,z0,-83.75,z1,-1,0,{x0:-84.25,x1:-83.75,z0,z1});run(-64.25,z0,-64.25,z1,1,0,{x0:-64.25,x1:-63.75,z0,z1});}
  // The finale's west side is one run; its inner corner closes on D's south side.
  run(-83.75,25,-83.75,58.75,-1,0,{x0:-84.25,x1:-83.75,z0:25,z1:59.25});
  run(-64.25,25,-64.25,39.25,1,0,{x0:-64.25,x1:-63.75,z0:25,z1:39.25});
  run(-64.25,39.25,-32,39.25,0,-1,{x0:-63.75,x1:-32,z0:38.75,z1:39.25});
  run(-24.25,39,-24.25,58.75,1,0,{x0:-24.25,x1:-23.75,z0:39,z1:59.25});
  run(-83.75,58.75,-24.25,58.75,0,1,{x0:-83.75,x1:-24.25,z0:58.75,z1:59.25});
  // The raised stair deck and return ramp cannot be attacked as a sideways launcher.
  // The west guard closes on the rear wall; the east one meets the return ramp's
  // wall at x 49.8, closing the 0.3 m channel between them (2026-10-23).
  boxes.push(quayBox(34.5,35,-.25,12,2.8,0,'brick'),quayBox(49,49.8,1,12,2.8,0,'brick'));
  // Open rear railing keeps the entry chase view clear; deck face still blocks a straight approach.
  // Its coping is solid too, so the deck's step onto it is 0.28 m, not a climbable 0.2 (2026-10-23).
  const rear=quayBox(35,50,-.75,-.25,1.4,0,'brick');
  boxes.push(rear,copingSolid(rear),quayBox(35,50,-.58,-.42,2.8,2.64,'metal'));
  for(const x of[35,38,41,44,47,50])boxes.push(quayBox(x-.08,x+.08,-.58,-.42,2.8,1.4,'metal'));
  for(let i=0;i<27;i++)for(const x of[50,54])boxes.push(quayBox(x-.2,x+.2,27-i,28-i,1.2*(i+1)/27+1.6));
  for(const [z0,z1] of [[-27,-11],[-7,17],[25,39]])for(const x of[-84,-64])boxes.push(unseen(quayBox(x-.25,x+.25,z0,z1,12.6,11,'brick')));
  boxes.push(...[quayBox(-84.25,-83.75,39,59,12.6,11,'brick'),quayBox(-24.25,-23.75,39,59,12.6,11,'brick'),quayBox(-84,-24,58.75,59.25,12.6,11,'brick')].map(unseen));
  boxes.push(unseen(quayBox(-64,-32,38.75,39.25,12.6,11,'brick')));
  // Continuous side walls follow each slope in one-metre coping steps.
  for(let i=0;i<30;i++)for(const x of[-78,-70])boxes.push(quayBox(x-.25,x+.25,-57+i,-56+i,10.97*(i+1)/30+1.6));
  for(let i=0;i<39;i++)for(const x of[-32,-24])boxes.push(quayBox(x-.25,x+.25,38-i,39-i,10.97*(39-i)/39+1.6));
  // Solid furniture that reads solid: market stall counters and rooftop plant.
  for(const [x0,x1] of QUAY_STALL_COLUMNS)for(const z of QUAY_STALL_ROWS)boxes.push(quayBox(x0,x1,z-1.2,z+1.2,1,0,'wood'));
  for(const [x0,x1,z0,z1,h,a] of QUAY_ROOF_UNITS)boxes.push(quayBox(x0,x1,z0,z1,11+h,11,a));
 }
 yield PREPARATION_SLICE;
 // Low, pass-through catch gardens use the existing shrub drag, never solid blocks.
 // The foliage bodies keep the dense 1.7 × 1.4 m grid; what is drawn is the
 // planted bed in `quayScenery.ts` (edging, mulch, drifts), covering their union.
 const catchBodies:BoxCollider[]=[],beds:QuayScenerySpec['beds'][number][]=[];
 const shrub=PROP_SOLIDS.shrub!,catchGround=new PlanTerrainSampler(p),catchSample=createGroundSample();
 for(const [x0,x1,z0,z1,y] of QUAY_CATCH_GARDENS){
  let xLast=x0,zLast=z0;
  for(let x=x0;x<=x1;x+=1.7)for(let z=z0;z<=z1;z+=1.4){
   const gy=y||Math.min(...[-1,1].flatMap(a=>[-1,1].map(b=>catchGround.sampleGround(x+a*shrub.halfX,z+b*shrub.halfZ,catchSample).height)));
   catchBodies.push({centre:{x,y:gy+shrub.height/2,z},halfExtents:{x:shrub.halfX,y:shrub.height/2,z:shrub.halfZ},rotationY:0,surface:shrub.surface});
   xLast=x;zLast=z;
  }
  beds.push({x0:x0-shrub.halfX,x1:xLast+shrub.halfX,z0:z0-shrub.halfZ,z1:zLast+shrub.halfZ,y});
 }
 yield PREPARATION_SLICE;
 const markings:Marking[]=[...(p.markings??[])];
 const stripe=(x0:number,z0:number,x1:number,z1:number,y:number,width=.6,paint:Marking['paint']='road')=>markings.push({points:[{x:x0,y:y+.015,z:z0},{x:x1,y:y+.015,z:z1}],width,dash:0,gap:0,paint,...(y>0?{elevation:'authored' as const}:{})});
 // Roof paint is the scenery's (`roofPaint` below); the red band on each landing deck's face stays a block.
 for(const landing of [-7,25])boxes.push(quayBox(-83.5,-64.5,landing-.025,landing+.025,10.7,9.7,'signalRed'));
 for(let i=0;i<12;i++){const z=12+i*.8,y=(12-i)*.1;stripe(38,z-.08,46,z-.08,y,.16);if(guards&&i<11)for(const x of[37.7,46.3])boxes.push(quayBox(x-.15,x+.15,z,z+.8,y+.8,Math.max(0,y-.1),'stone'));}
 for(const [x0,x1,z,y] of [[35,49,11.7,1.2],[-32,-28,-6.8,.6]]){stripe(x0,z,x1,z,y,.35);}
 for(const z of [-5,48])for(let x=-4;x<4;x+=1.2)stripe(x,z-2,x,z+2,0,.6);
 for(let z=64;z<72;z+=1.2)stripe(48,z,52,z,0,.6);
 for(const [x,z,h,y] of [[-74,-59,0,0],[42,2,0,1.2],[24,4,0,0],[18,-42,Math.PI/2,0],[-76,78,Math.PI/2,0],[-30,4,Math.PI,10.97*4/39]]){
  const fx=Math.sin(h),fz=Math.cos(h),lx=Math.cos(h),lz=-Math.sin(h);
  stripe(x-lx-fx,z-lz-fz,x+fx,z+fz,y,.28);stripe(x+lx-fx,z+lz-fz,x+fx,z+fz,y,.28);
 }
 for(const [x,z,h,y] of [[28,36,Math.PI/2,0],[47,37,Math.PI/2,-1.2],[86,-38,0,0],[20,81,0,0],[-34,-53,-Math.PI/2,0],[52,30,Math.PI,0],[52,16,Math.PI,1.2*12/27],[78,-30,-Math.PI/2,0],[42,-30,-Math.PI/2,0],[8,85.5,-Math.PI/2,0],[-52,85.5,-Math.PI/2,0],[-44,-61,-Math.PI/2,0]]){
  const fx=Math.sin(h),fz=Math.cos(h),lx=Math.cos(h),lz=-Math.sin(h);stripe(x-lx-fx,z-lz-fz,x+fx,z+fz,y,.25);stripe(x+lx-fx,z+lz-fz,x+fx,z+fz,y,.25);
 }
 // The avenue's broken centre line, open at both crossings.
 for(const [z0,z1] of [[-62,-9],[-1,44],[52,62]])markings.push({points:[{x:0,y:.015,z:z0},{x:0,y:.015,z:z1}],width:.15,dash:3,gap:4.5,paint:'road'});
 // Painted edges follow the landing bowl; the east ramp is the clear return.
 for(const x of[38,46])for(let z=22;z<41;z++)stripe(x,z,x,z+1,0,.2);
 stripe(46,37,50,37,0,.5);
 // Six-metre park air lane and four-metre return use pavement, with grass islands between.
 const field=p.heightfield;
 const surfaces=field.surfaces.map((surface,i)=>{const x=field.originX+(i%(field.columns-1)+.5)*field.spacing;
  const z=field.originZ+(Math.floor(i/(field.columns-1))+.5)*field.spacing;
  if(x>=11&&x<=93&&((z>=-45&&z<=-39)||(z>=-32&&z<=-28)))return 'pavement' as const;
  if(x>=16&&x<=86&&z>=-52&&z<=-10)return 'grass' as const;
  if(x>=38&&x<=46&&z>=12&&z<=45)return 'pavement' as const;
  if(x>=16&&x<=86&&z>=-5&&z<=50)return 'brick' as const;
  return surface;});
 const quayScenery:QuayScenerySpec={revision:'quay-scenery-r2',beds,railings,
  // Run-up lanes frame each pad and lead to the takeoff band, a 2.2 m coated strip down their middle;
  // each landing has a white edge and an outlined box 3.5 m deep beyond it.
  ...(guards?{roofPaint:{y:11,x0:-83.75,x1:-64.25,laneX:-74,laneHalf:3.25,stripHalf:1.1,
   gaps:[{from:-26.6,pad:QUAY_PADS[0].z-3.05,lip:-11,landing:-7,zone:-7+4.2},{from:-.4,pad:QUAY_PADS[1].z-3.05,lip:17,landing:25,zone:25+4.2}],
   route:[[-68,32.2],[-68,43],[-64,51],[-32,51],[-28,47],[-28,39.4]].map(([x,z])=>({x,z})),routeHalf:1.2}}:{}),
  stalls:QUAY_STALL_COLUMNS.flatMap(([x0,x1],c)=>QUAY_STALL_ROWS.map(z=>({x0,x1,z0:z-1.2,z1:z+1.2,facing:c===0?1 as const:-1 as const}))),
  ring:{halfX:98,halfZ:68,radius:16,halfWidth:4},avenue:{halfWidth:4,halfLength:68},
  kerbGaps:[{x0:-4.3,x1:4.3,z0:-66,z1:-61.5},{x0:-4.3,x1:4.3,z0:61.5,z1:66},{x0:-4.8,x1:4.8,z0:-7.4,z1:-2.6},{x0:-4.8,x1:4.8,z0:45.6,z1:50.4},{x0:47.6,x1:52.4,z0:60,z1:76}],
  // Shopfronts on the plaza: the south row's north faces and the east row's west faces.
  awnings:[...[[16,26],[28,38],[40,46],[56,66],[68,78],[80,88]].map(([a,b])=>({x0:a+.5,z0:53,x1:b-.5,z1:53,nx:0,nz:-1})),
   ...[[-6,2],[4,12],[14,22],[28,36],[40,48]].map(([a,b])=>({x0:85,z0:a+.5,x1:85,z1:b-.5,nx:-1,nz:0})),{x0:-44,z0:-27,x1:-44,z1:-9,nx:1,nz:0}],
  // Paving runs up to each pad's 3 m dome foot.
  paveHoles:QUAY_PADS.map(pad=>({x:pad.x,z:pad.z,radius:3.3}))};
 // A harbour palette for this venue only: darker asphalt so paving and kerbs read, warmer stone and brick.
 const palette={pavement:0x5f6369,concrete:0xa9a49a,stone:0xa39a8b,brick:0x9a5e48,grass:0x4d7a3c};
 return {...p,palette,quayScenery,props:[...(p.props??[])],softBodies:[...(p.softBodies??[]),...catchBodies],markings,heightfield:{...field,surfaces},spawn:QUAY_SPAWN,riverScenery:{halfWidth:120,halfDepth:90,waterWidth:40,bridgeWidth:8},launchPads:QUAY_PADS,segments:p.segments.map((s,i)=>i===0?{...s,colliders:[...s.colliders,...boxes]}:s)};
}
