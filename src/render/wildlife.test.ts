/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import * as THREE from 'three';
import type { LevelPlan } from '../level/plan.ts';
import { PROP_SIZES } from '../data/props.ts';
import { WILDLIFE as W } from '../data/tuning.ts';
import { squirrelSites, squirrelState, updateSquirrel } from './wildlifePlan.ts';
import { createSquirrels, countSquirrels } from './squirrels.ts';
function fixture(): LevelPlan {
  return { id:'wildlife-test',props:[{kind:'broadleafTree',position:{x:10,y:0,z:10},rotationY:0,scale:1}],
    segments:[],checkpoints:[],spawn:{position:{x:0,y:0,z:0},headingY:0},surround:{height:0,surface:'grass'},
    heightfield:{originX:0,originZ:0,columns:31,rows:31,spacing:1,heights:new Array(31*31).fill(0),surfaces:new Array(30*30).fill('grass')} };
}
test('independent admission is deterministic and read-only, refuses paving, gates and pads',()=>{
  const p=fixture(), before=JSON.stringify(p), sites=squirrelSites(p);
  assert.equal(sites.length,1); assert.deepEqual(sites,squirrelSites(p)); assert.equal(JSON.stringify(p),before);
  p.heightfield.surfaces = p.heightfield.surfaces.map(()=>'pavement'); assert.equal(squirrelSites(p).length,0);
  p.heightfield.surfaces = p.heightfield.surfaces.map(()=>'grass'); assert.equal(squirrelSites(p,[{x:10,z:10,radius:5}]).length,0);
  p.checkpoints.push({id:'blocked',routeIndex:0,kind:'start',label:'Gate',centre:{x:10,y:1,z:10},halfExtents:{x:5,y:1,z:5},headingY:0});
  assert.equal(squirrelSites(p).length,0);
});
test('close rider, four-way trap and placed rider never render a ground-level overlap; clear return',()=>{
  const site=squirrelSites(fixture())[0], s=squirrelState(site);
  const rider={...site.home}; updateSquirrel(site,s,0,0,[rider]); assert.ok(s.hidden);
  const riders=[site.home,site.refuge,{...site.refuge,x:site.refuge.x+1},{...site.refuge,z:site.refuge.z-1}];
  for(let i=1;i<=300;i++) {
    updateSquirrel(site,s,i/60,1/60,riders);
    assert.ok(s.hidden || s.y>=W.climbMetres);
    assert.ok(s.progress>=0&&s.progress<=1); assert.ok(s.climb>=0&&s.climb<=W.climbMetres);
  }
  assert.equal(s.climb,W.climbMetres);
  // A jumping/teleported wheel beside a climber is also suppressed.
  updateSquirrel(site,s,6,1/60,[{x:s.x,y:s.y,z:s.z}]); assert.ok(s.hidden);
  for(let i=0;i<1200;i++) updateSquirrel(site,s,12+i/60,1/60,[]);
  assert.equal(s.hidden,false); assert.equal(s.climb,0);
});
test('a late collision course completes its escape without changing rider input',()=>{
  const site=squirrelSites(fixture())[0], s=squirrelState(site), r={x:site.home.x+3,y:0,z:site.home.z,headingY:-Math.PI/2,speed:8};
  const before=JSON.stringify(r);
  updateSquirrel(site,s,0,1/60,[r]);assert.ok(s.escaping);assert.ok(s.running);assert.ok(!s.hidden);
  // A committed escape completes even when the rider stops/turns immediately.
  for(let i=1;i<120;i++)updateSquirrel(site,s,i/60,1/60,[{...r,speed:0}]);
  assert.equal(s.progress,1);assert.equal(s.climb,W.climbMetres);assert.equal(s.hidden,false);assert.equal(JSON.stringify(r),before);
});
test('standing, harmless passing, departing and airborne riders do not cause a distant escape',()=>{
  const site=squirrelSites(fixture())[0];
  for(const r of [
    {x:site.home.x+8,y:0,z:site.home.z,headingY:-Math.PI/2,speed:8},
    {x:site.home.x+2,y:0,z:site.home.z,headingY:-Math.PI/2,speed:0},
    {x:site.home.x+2,y:0,z:site.home.z-2,headingY:0,speed:8},
    {x:site.home.x+2,y:0,z:site.home.z,headingY:Math.PI/2,speed:8},
    {x:site.home.x+2,y:3,z:site.home.z,headingY:-Math.PI/2,speed:8},
  ]){const state=squirrelState(site);updateSquirrel(site,state,0,1/60,[r]);assert.equal(state.escaping,false);assert.equal(state.hidden,false);assert.equal(state.climb,0);}
});
test('fast, reverse and any of four approaching riders trigger only a short collision path',()=>{
  const site=squirrelSites(fixture())[0];
  for(const speed of [2,6,28,-6]){
    const s=squirrelState(site),yaw=speed<0?Math.PI/2:-Math.PI/2;
    const range=Math.min(W.maximumAlertMetres-.01,Math.abs(speed)*W.escapeLeadSeconds+.5);
    updateSquirrel(site,s,0,1/120,[{x:site.home.x+range,y:0,z:site.home.z,headingY:yaw,speed}]);assert.ok(s.escaping,String(speed));assert.ok(!s.hidden);
  }
  const s=squirrelState(site),benign={x:site.home.x+3,y:0,z:site.home.z,headingY:0,speed:8};
  updateSquirrel(site,s,0,1/120,[benign,benign,benign,{...benign,headingY:-Math.PI/2}]);assert.ok(s.escaping);
});
test('actual travel wins over a spinning/wobbling heading and a placement has no invented velocity',()=>{
  const site=squirrelSites(fixture())[0],r={x:site.home.x+3,y:.4,z:site.home.z,headingY:Math.PI/2,speed:8};
  const incoming=squirrelState(site);updateSquirrel(site,incoming,0,1/120,[{...r,velocityX:-8,velocityZ:0}]);assert.ok(incoming.escaping);
  const departing=squirrelState(site);updateSquirrel(site,departing,0,1/120,[{...r,headingY:-Math.PI/2,velocityX:8,velocityZ:0}]);assert.ok(!departing.escaping);
  const placed=squirrelState(site);updateSquirrel(site,placed,0,0,[{...r,velocityX:0,velocityZ:0}]);assert.ok(!placed.escaping);
});
test('actual shared geometry and instance allocation match price; pane order and teardown',()=>{
  const sites=squirrelSites(fixture()), view=createSquirrels(sites), price=countSquirrels(sites);
  const mesh=view.group.children[0] as THREE.InstancedMesh;
  assert.equal(mesh.geometry.index!.count/3*mesh.count,price.colourTriangles);
  assert.equal(Object.entries(mesh.geometry.attributes).filter(([name])=>name!=='wildlifeState').map(([,a])=>a).reduce((n,a)=>n+a.array.byteLength,mesh.geometry.index!.array.byteLength),price.geometryBytes);
  assert.equal(mesh.instanceMatrix.array.byteLength+mesh.geometry.getAttribute('wildlifeState').array.byteLength,price.instanceBytes);
  assert.equal(mesh.castShadow,false); assert.equal(mesh.layers.mask,1);
  const camera=new THREE.PerspectiveCamera(60,1,.1,200), site=sites[0];
  camera.position.set(site.home.x,1,site.home.z+3);camera.lookAt(site.home.x,.2,site.home.z);camera.updateMatrixWorld();
  view.prepareView(camera,1);assert.equal(mesh.count,1);view.restoreView();
  camera.position.set(1000,1,1000);camera.updateMatrixWorld();view.prepareView(camera,4);assert.equal(mesh.count,0);view.restoreView();assert.equal(mesh.count,1);
  view.update(1,false,[site.home]);view.prepareView(camera,1);assert.equal(mesh.count,0);view.restoreView();
  let geometry=0,material=0;mesh.geometry.addEventListener('dispose',()=>geometry++);
  (mesh.material as THREE.Material).addEventListener('dispose',()=>material++);view.dispose();view.dispose();
  assert.equal(geometry,1);assert.equal(material,1);assert.equal(view.group.children.length,0);
});
test('worlds without eligible trunks allocate nothing',()=>{
  const p=fixture();p.props=[];const view=createSquirrels(squirrelSites(p));assert.equal(view.group.children.length,0);assert.equal(view.report().geometryBytes,0);view.dispose();
});

test('a narrow precise paving fragment and a thin foreign solid refuse all forage corridors',()=>{
  const p=fixture();
  p.groundSurfacePatches=[{id:'narrow-refusal',surface:'brick',triangles:[{cell:310,vertices:[{x:10,y:0,z:10},{x:10.02,y:0,z:10},{x:10,y:0,z:10.02}]}]}];
  assert.equal(squirrelSites(p).length,0);
  p.groundSurfacePatches=[];
  p.solids=[{centre:{x:10.2,y:.5,z:10},halfExtents:{x:.01,y:.5,z:.01},rotationY:.6,surface:'wood'}];
  assert.equal(squirrelSites(p).length,0);
});

test('wildlife never selects a poorer existing recipe; runtime cost adds exactly one colour pass per pane',async()=>{
  const {prepareEnvironmentSupplements}=await import('./environmentSupplementPrice.ts');
  const {selectPresentation}=await import('./presentation.ts');
  const {withSquirrelCost}=await import('./squirrels.ts');
  const p=fixture(), prepared=prepareEnvironmentSupplements(p);
  try{
    const base=selectPresentation(p,null,{...prepared,squirrels:[]}), populated=selectPresentation(p,null,prepared);
    assert.deepEqual(populated,base);
    const cost=withSquirrelCost(base.cost,prepared.squirrels),price=countSquirrels(prepared.squirrels);
    for(const [shape,panes] of [['solo',1],['split',2],['quad',4]] as const){
      assert.equal(cost.frame[shape].drawCalls-base.cost.frame[shape].drawCalls,price.colourDraws*panes);
      assert.equal(cost.frame[shape].triangles-base.cost.frame[shape].triangles,price.colourTriangles*panes);
    }
    assert.equal(cost.shadowTriangles,base.cost.shadowTriangles);
  }finally{prepared.dispose();}
});
test('real generated worlds and authored venues retain every plan byte after wildlife admission',async()=>{
  const {generateLevel}=await import('../level/generateRoute.ts');
  const {createSliceLevel}=await import('../level/sliceLevel.ts');
  const {createTrackLevel}=await import('../level/trackLevel.ts');
  const {createSwitchbackLevel}=await import('../level/switchbackLevel.ts');
  const {createProvingGround}=await import('../level/provingGround.ts');
  for(const p of [generateLevel('euc').plan,generateLevel('squirrels').plan,createSliceLevel(),createTrackLevel(),createSwitchbackLevel(),createProvingGround()]){
    const before=JSON.stringify(p),sites=squirrelSites(p);assert.equal(JSON.stringify(p),before,p.id);
    assert.ok(sites.length<=W.maximumSquirrels);assert.deepEqual(squirrelSites(p),sites);
  }
});
test('euc encounters start beside the opening ride and every home faces away from the route to refuge',async()=>{
  const {generateLevel}=await import('../level/generateRoute.ts');
  const {RouteSpine,createSpineLocation}=await import('../simulation/routeSpine.ts');
  const p=generateLevel('euc').plan,route=RouteSpine.fromPlan(p)!,sites=squirrelSites(p),at=createSpineLocation();
  assert.equal(sites.length,W.maximumSquirrels);
  route.locate(sites[0].home.x,sites[0].home.z,-1,at);assert.ok(at.distance<W.earlyEncounterMetres);
  assert.ok(at.distance>=W.minimumEarlyEncounterMetres);
  assert.ok(Math.hypot(sites[0].home.x-p.spawn.position.x,sites[0].home.z-p.spawn.position.z)<W.earlyEncounterMetres);
  for(const site of sites){
    route.locate(site.home.x,site.home.z,-1,at);const homeOffset=at.offRoute;
    assert.ok(at.offRoute-at.halfWidth<=W.encounterVergeMetres+.01);
    route.locate(site.refuge.x,site.refuge.z,-1,at);assert.ok(at.offRoute>homeOffset,'escape goes into grass, not toward the ride');
  }
});
test('gentle grassy grades retain cached contact alignment; steep ground stays excluded',()=>{
  const p=fixture();p.heightfield.heights=p.heightfield.heights.map((_,i)=>(i%31)*.02);
  const sites=squirrelSites(p);assert.equal(sites.length,1);const site=sites[0],state=squirrelState(site);
  updateSquirrel(site,state,0,1/60,[{x:site.home.x+3,y:site.home.y,z:site.home.z,velocityX:-8,velocityZ:0}]);
  assert.ok(state.escaping);assert.ok(Math.abs(state.y-state.x*.02)<1e-6);
  assert.ok(Math.abs(state.groundNormal.x/state.groundNormal.y+.02)<1e-6);
  p.heightfield.heights=p.heightfield.heights.map((_,i)=>(i%31)*.2);assert.equal(squirrelSites(p).length,0);
});
test('a shallow terrain crease shortens the dodge before a cached plane can float across it',()=>{
  const p=fixture();p.heightfield.heights=p.heightfield.heights.map((_,i)=>Math.abs((i%31)-7)*.03);
  const sites=squirrelSites(p);assert.equal(sites.length,1);assert.ok(sites[0].dodgeMetres<W.dodgeMetres);
});
test('a forage-position escape bows into the admitted shoulder without a lateral teleport',()=>{
  const site=squirrelSites(fixture())[0],s=squirrelState(site);
  updateSquirrel(site,s,(Math.PI/2-site.phase)/.17,1,[]);assert.ok(s.progress>0);
  const before={x:s.x,z:s.z};updateSquirrel(site,s,10,0,[{x:s.x+2,y:s.y,z:s.z,velocityX:-8,velocityZ:0}]);
  assert.ok(s.escaping);assert.equal(s.x,before.x);assert.equal(s.z,before.z);
  const dx=site.refuge.x-site.home.x,dz=site.refuge.z-site.home.z,d=Math.hypot(dx,dz);let maximum=0;
  for(let i=0;i<120;i++){updateSquirrel(site,s,10+i/120,1/120,[]);const side=Math.abs(((s.x-site.home.x)*dz-(s.z-site.home.z)*dx)/d);maximum=Math.max(maximum,side);
    assert.ok(side<=W.dodgeMetres+1e-9);}
  assert.ok(maximum>W.dodgeMetres*.8);assert.equal(s.progress,1);assert.equal(s.climb,W.climbMetres);
});
test('animated ground-body envelope plus dodge fits the admitted grass capsule',async()=>{
  const {createSquirrelGeometry}=await import('./squirrelModel.ts');const g=createSquirrelGeometry();
  try{const p=g.getAttribute('position'),j=g.getAttribute('wildlifeJoint');let radius=0,height=0;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),joint=j.getX(i);height=Math.max(height,Math.abs(y)+.073);
      if(joint<5.5){const extra=joint<1.5?.030:.045+.022;radius=Math.max(radius,Math.hypot(x,Math.abs(z)+extra));}
      else{
        // Bound the complete tail-rotation interval analytically, including
        // interior extrema, independently of gait phase/time sampling.
        const dy=y-.118,dz=z+.100,critical=Math.atan2(dy,dz);
        const angles=[-.45,0,...[-2,-1,0,1,2].map(k=>critical+k*Math.PI).filter(a=>a>=-.45&&a<=0)];
        for(const a of angles)radius=Math.max(radius,Math.hypot(Math.abs(x)+.006,-.100+Math.sin(a)*dy+Math.cos(a)*dz));
      }
    }
    const tilted=radius+height*Math.sin(W.maximumGroundSlopeRadians);
    assert.ok(tilted+W.dodgeMetres<W.groundMarginMetres);
    assert.ok(tilted+W.groundMarginMetres>W.groundMarginMetres,'a shoulder-sized dodge must fail the same bound');
  }finally{g.dispose();}
});

// A circular-radius fixture passed while paws floated off a six-sided face.
test('rotated tree refuge tracks the actual polygon face and tapered bark',()=>{
  for(const rotation of [0,.17,1.01]){
    const p=fixture();p.props![0].rotationY=rotation;const site=squirrelSites(p)[0],tree=p.props![0],shape=PROP_SIZES.broadleafTree;
    const step=Math.PI*2/shape.trunkSides,heading=Math.atan2(site.refuge.x-tree.position.x,site.refuge.z-tree.position.z);
    const face=(heading-rotation-step/2)/step;
    assert.ok(Math.abs(face-Math.round(face))<1e-10);
    assert.ok(Math.abs(Math.hypot(site.refuge.x-tree.position.x,site.refuge.z-tree.position.z)-.29-shape.trunkRadiusBase*Math.cos(step/2))<1e-10);
    const state=squirrelState(site);updateSquirrel(site,state,5,5,[{...site.home,x:site.home.x+3,headingY:-Math.PI/2,speed:8}]);
    const expected=(shape.trunkRadiusBase-(shape.trunkRadiusBase-shape.trunkRadiusTop)*(W.climbMetres+.20)/shape.trunkHeight)*Math.cos(step/2);
    assert.ok(Math.abs(Math.hypot(state.x-tree.position.x,state.z-tree.position.z)-.29-expected)<1e-10);
  }
});
