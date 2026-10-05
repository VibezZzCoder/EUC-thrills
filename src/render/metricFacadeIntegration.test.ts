/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** SOURCE-ONLY integration controls. UNRUN by the draft author. */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import type { LevelPlan, Prop } from '../level/plan.ts';
import { PART_COSTS, propPartCounts } from '../data/renderCost.ts';
import { LANDMARK_SIZES } from '../data/buildingLooks.ts';
import { PROP_TINT_JITTER } from '../data/props.ts';
import { positionHash01 } from '../shared/maths.ts';
import { buildingSourcePartCounts, buildingSourceRecords } from './buildingSourceRecords.ts';
import { createProps } from './props.ts';
import { createTerrain } from './terrain.ts';
import { BASELINE_PRESENTATION, presentationCost } from './presentation.ts';
import { prepareEnvironmentSupplements, priceEnvironmentSupplements } from './environmentSupplementPrice.ts';
import { metricSourcePrice, metricFacadeDefaultSelection, selectMetricFacadeOwners, metricFacadeRequestFromSearch } from './metricFacadePreparation.ts';
import { createMetricFacade } from './metricFacade.ts';
import { createDistrictExterior } from './districtExterior.ts';
import { createDistrictExteriorAppearance } from './districtExteriorAppearance.ts';
import { createUltraShared } from './ultra/ultraMaterials.ts';
import { ULTRA_FULL, ULTRA_STATIC_LAYER } from './ultra/ultraRecipe.ts';
import { ultraPartTriangles, ultraTargetBytes } from './ultra/ultraCost.ts';
import { ultraCasts } from './ultra/ultraKit.ts';
import { METRIC_PROXY_ATTRIBUTE } from './metricSourceProxy.ts';

function fixture(): LevelPlan {
  const props: Prop[] = [
    { kind:'building',look:'residential',position:{x:0,y:0,z:0},rotationY:0,scale:1,size:{x:42,y:7,z:12} },
    { kind:'building',look:'residential',position:{x:45,y:0,z:0},rotationY:0,scale:1,size:{x:42,y:7,z:12} },
    { kind:'building',look:'clockTower',position:{x:100,y:0,z:0},rotationY:0,scale:1,size:LANDMARK_SIZES.clockTower },
  ];
  return { id:'metric-integration',props,solids:props.map(prop=>({centre:{...prop.position,y:prop.size!.y/2},
    halfExtents:{x:prop.size!.x/2,y:prop.size!.y/2,z:prop.size!.z/2},rotationY:prop.rotationY,surface:'pavement' as const})),
    segments:[],checkpoints:[],spawn:{position:{x:-60,y:0,z:-60},headingY:0},surround:{height:0,surface:'grass'},
    heightfield:{originX:0,originZ:0,spacing:1,columns:2,rows:2,heights:[0,0,0,0],surfaces:['grass']},
    districtAdjacency:{revision:'district-v1',sourceWorldId:'metric-integration',physicalWorldId:'metric-integration',
      frontages:[0,1].map(index=>({id:`existing-front-${index}`,propIndex:index,district:'residential',role:'frontage-lawn',
        streetSegmentId:'source-road',position:{x:props[index].position.x,y:0,z:6},yaw:0,width:42,reach:8,
        retainedOpening:false,patchIds:[]})),links:[],groups:[],rejected:[],addedTriangles:0,addedProps:0,addedSolids:0,addedSoftBodies:0} };
}
const triangles = (part: keyof typeof PART_COSTS): number => PART_COSTS[part].triangles;
const ultraNearCasts = (part: keyof typeof PART_COSTS): boolean => ultraCasts(part, PART_COSTS[part].castsShadow, ULTRA_FULL.ultra);

test('default selector keeps complete source components, with exact explicit lists and original explicitly bounded behaviour',()=>{
  // Extend only this selector fixture: two unserved original bodies continue
  // the same 42m footprint row; an orphan and unsupported tower stay original.
  const source=fixture(),props:Prop[]=source.props!.map(prop=>({...prop,position:{...prop.position},size:{...prop.size!}}));
  props[2]={...props[2],position:{...props[2].position,x:300}};
  for(const x of [90,135,240])props.push({...props[0],position:{x,y:0,z:0},size:{...props[0].size!}});
  const plan:LevelPlan={...source,props,solids:props.map(prop=>({centre:{...prop.position,y:prop.size!.y/2},
    halfExtents:{x:prop.size!.x/2,y:prop.size!.y/2,z:prop.size!.z/2},rotationY:prop.rotationY,surface:'pavement' as const}))};
  const before=JSON.stringify(plan),report=metricFacadeDefaultSelection(plan),expected=[0,1,3,4];
  assert.deepEqual(report.eligiblePropIndices,[0,1,3,4,5]);assert.deepEqual(report.seedPropIndices,[0,1]);
  assert.deepEqual(report.groups,[{family:'residential',propIndices:expected,seedPropIndices:[0,1],streetSegmentIds:['source-road']}]);
  assert.deepEqual(report.edges,[{fromPropIndex:0,toPropIndex:1,gapMetres:3},
    {fromPropIndex:1,toPropIndex:3,gapMetres:3},{fromPropIndex:3,toPropIndex:4,gapMetres:3}]);
  assert.deepEqual(report.fallbackPropIndices,[]);assert.deepEqual(report.selectedPropIndices,expected);
  assert.deepEqual(selectMetricFacadeOwners(plan),report.selectedPropIndices);
  assert.deepEqual(metricFacadeDefaultSelection({...plan,id:'unrelated-world-name'}),report);
  assert.deepEqual(selectMetricFacadeOwners({...plan,id:'unrelated-world-name'}),expected);
  const bounded=selectMetricFacadeOwners(plan,{maximumStreetOwners:1});assert.deepEqual(bounded,[0,1]);
  const requireComplete=(indices:readonly number[]):void=>assert.deepEqual(indices,expected,'Complete default source component is truncated');
  requireComplete(selectMetricFacadeOwners(plan));
  assert.throws(()=>requireComplete(bounded),/Complete default source component is truncated/,
    'The real explicitly bounded old selection must fail complete default coverage');
  assert.deepEqual(selectMetricFacadeOwners(plan,{propIndices:[1]}),[1]);
  assert.deepEqual(selectMetricFacadeOwners(plan,{propIndices:[4,0]}),[4,0]);
  assert.deepEqual(selectMetricFacadeOwners(plan,{propIndices:[]}),[]);
  assert.throws(()=>selectMetricFacadeOwners(plan,{propIndices:[2]}),/compatible/);
  assert.throws(()=>selectMetricFacadeOwners(plan,{propIndices:[1,1]}),/unique/);
  assert.throws(()=>selectMetricFacadeOwners(plan,{maximumStreetOwners:0}),/maximum must be positive/);
  assert.deepEqual(metricFacadeRequestFromSearch('?metricfacades=0,1'),{propIndices:[0,1]});
  assert.deepEqual(metricFacadeRequestFromSearch('?metricfacades=off'),{propIndices:[]});
  assert.deepEqual(selectMetricFacadeOwners(plan,metricFacadeRequestFromSearch('?metricfacades=off')),[]);
  assert.deepEqual(selectMetricFacadeOwners(plan,metricFacadeRequestFromSearch('')),expected);
  assert.throws(()=>metricFacadeRequestFromSearch('?metricfacades=1.2'),/Invalid diagnostic/);
  assert.equal(JSON.stringify(plan),before);
});

test('industrial groups and nearby legacy offices upgrade complete exact bodies without inventing shops',()=>{
  const source=fixture();
  const building=(x:number,look?:Prop['look']):Prop=>({kind:'building',look,position:{x,y:0,z:0},rotationY:0,scale:1,size:{x:20,y:10,z:20}});
  const props:Prop[]=[building(0,'industrial'),building(30,'industrial'),building(60),building(90),building(400),
    {...source.props![2],position:{x:20,y:0,z:40}},building(65)];
  const solids=props.slice(0,6).map(prop=>({centre:{...prop.position,y:prop.size!.y/2},
    halfExtents:{x:prop.size!.x/2,y:prop.size!.y/2,z:prop.size!.z/2},rotationY:prop.rotationY,surface:'pavement' as const}));
  const plan:LevelPlan={...source,props,solids,spawn:{position:{x:0,y:0,z:-20},headingY:0},districtAdjacency:{...source.districtAdjacency!,
    frontages:[{...source.districtAdjacency!.frontages[0],propIndex:0,district:'industrial',role:'service-edge',width:20,position:{x:0,y:0,z:10}}]}};
  const before=JSON.stringify(plan),result=metricFacadeDefaultSelection(plan);
  assert.deepEqual(result.selectedPropIndices,[0,1,2,3]);
  assert.equal(result.groups.find(group=>group.family==='industrial')!.propIndices.length,2);
  assert.equal(result.groups.find(group=>group.family==='untagged')!.propIndices.length,2);
  assert.ok(!result.selectedPropIndices.includes(4),'Distant unserved office is not an arbitrary citywide seed');
  assert.ok(!result.eligiblePropIndices.includes(5),'Landmark art never becomes a commercial facade');
  assert.ok(!result.eligiblePropIndices.includes(6),'Missing exact collider refuses the render shell');
  assert.deepEqual(selectMetricFacadeOwners(plan,{propIndices:[]}),[]);
  assert.deepEqual(metricFacadeDefaultSelection({...plan,id:'different-name'}),result);
  assert.equal(JSON.stringify(plan),before,'No shop/entry/collider/path/identity is added');
});

test('actual building emitter records and plan part counts agree independently of replacement descriptors',()=>{
  const plan=fixture(),source=buildingSourcePartCounts(plan),baseline=new Map<keyof typeof PART_COSTS,number>();
  for(const prop of plan.props??[])propPartCounts(prop,baseline);
  for(const [part,count] of source)assert.equal(count,baseline.get(part),part);
  const legacy:Prop={kind:'building',position:{x:13,y:0,z:7},rotationY:0.27,scale:1,size:{x:14,y:38,z:20}};
  const records=buildingSourceRecords(legacy),legacyPlan={...plan,props:[legacy]};
  const view=createProps(legacyPlan);
  try{
    assert.equal(view.instances,records.length);
    assert.equal(records.find(piece=>piece.part==='buildingCap')!.jitter,
      1+(positionHash01(legacy.position.x,legacy.position.z,7)*2-1)*PROP_TINT_JITTER.structure,
      'Original untagged cap keeps salt-7 structure jitter');
    for(const record of records)assert.ok(view.group.children.some(mesh=>mesh.name===`level-props-${record.part}`));
  }finally{view.dispose();}
});

test('ordinary source extraction uses actual emitted part counts and retains exact original physical payload',()=>{
  const plan=fixture(),before=JSON.stringify(plan),prepared=prepareEnvironmentSupplements(plan,null,{propIndices:[0,1]});
  const original=createProps(plan),replacement=createProps(plan,BASELINE_PRESENTATION,undefined,{metricFacades:prepared.metric});
  try{
    const delta=metricSourcePrice(prepared.metric,false,triangles);
    assert.equal(replacement.triangles,original.triangles+delta.colourTriangleDelta);
    assert.equal(replacement.drawCalls,original.drawCalls+delta.colourDrawDelta);
    assert.equal(replacement.shadowTriangles,original.shadowTriangles);
    assert.equal(replacement.metricSource!.removedColourPieces,prepared.metric.descriptors!.replacements.length);
    assert.equal(replacement.metricSource!.proxyFlagBytes,0);
    assert.equal(replacement.metricSource!.proxyColourPieces,0);assert.equal(replacement.metricSource!.proxyColourTriangles,0);
    assert.equal(JSON.stringify(plan),before);
  }finally{replacement.dispose();original.dispose();prepared.metric.dispose();}
});

test('Ultra omits selected original roofs while exact body/fallback buckets retain their casters and complete proxy arrays',()=>{
  // One selected roof proves an unselected residential fallback. Selecting both
  // removes both residential roofs while the original landmark roofs remain;
  // this retained roof bucket must have no colour-proxy attribute.
  for(const selected of [[0],[0,1]]){
    const plan=fixture(),before=JSON.stringify(plan),prepared=prepareEnvironmentSupplements(plan,null,{propIndices:selected});
    const original=createProps(plan,ULTRA_FULL,{recipe:ULTRA_FULL,shared:createUltraShared(),maxAnisotropy:1});
    const replacement=createProps(plan,ULTRA_FULL,{recipe:ULTRA_FULL,shared:createUltraShared(),maxAnisotropy:1},{metricFacades:prepared.metric});
    try{
      const sourceRecords=(plan.props??[]).flatMap((prop,propIndex)=>buildingSourceRecords(prop).map((piece,pieceIndex)=>({propIndex,pieceIndex,piece})));
      const selectedRoofRecords=sourceRecords.filter(record=>selected.includes(record.propIndex)&&record.piece.part==='roofGable');
      const roofKeys=new Set(selectedRoofRecords.map(record=>`${record.propIndex}/${record.pieceIndex}`));
      assert.deepEqual(prepared.metric.descriptors!.replacements.filter(record=>record.replacement==='residential-roof').map(record=>record.key),[...roofKeys]);
      const removed=selectedRoofRecords.length,delta=metricSourcePrice(prepared.metric,true,part=>ultraPartTriangles(part,ULTRA_FULL),ultraNearCasts);
      assert.equal(replacement.instances,original.instances-removed);
      assert.equal(replacement.drawCalls,original.drawCalls+delta.colourDrawDelta);
      assert.equal(replacement.triangles,original.triangles+delta.colourTriangleDelta);
      assert.equal(replacement.shadowTriangles,original.shadowTriangles+delta.shadowTriangleDelta);
      assert.equal(replacement.shadowDrawCalls,original.shadowDrawCalls+delta.shadowDrawDelta);
      const requireSourceRoofCount=(view:typeof original):void=>{
        const roof=view.group.children.find(mesh=>mesh.name==='level-props-roofGable') as THREE.InstancedMesh|undefined;
        assert.equal(roof?.count??0,sourceRecords.filter(record=>record.piece.part==='roofGable').length-removed,
          'Selected original roof submissions remain');
      };
      requireSourceRoofCount(replacement);
      assert.throws(()=>requireSourceRoofCount(original),/Selected original roof submissions remain/,
        'The archived all-original-roofs state must fail selected roof omission');
      let flagBytes=0,positiveFlags=0;const flagArrays=new Set<ArrayBufferLike>();
      for(const child of replacement.group.children){
        const mesh=child as THREE.InstancedMesh,old=original.group.children.find(node=>node.name===mesh.name) as THREE.InstancedMesh;
        assert.ok(old);
        const part=mesh.name.replace('level-props-','') as keyof typeof PART_COSTS;
        const kept=sourceRecords.filter(record=>record.piece.part===part&&!roofKeys.has(`${record.propIndex}/${record.pieceIndex}`));
        assert.equal(mesh.count,kept.length);
        if(part==='roofGable'){
          const oldRecords=sourceRecords.filter(record=>record.piece.part==='roofGable');
          const slots=oldRecords.flatMap((record,index)=>roofKeys.has(`${record.propIndex}/${record.pieceIndex}`)?[]:[index]);
          const matrix=Array.from(old.instanceMatrix.array),colour=Array.from(old.instanceColor!.array);
          assert.deepEqual(Array.from(mesh.instanceMatrix.array),slots.flatMap(index=>matrix.slice(index*16,index*16+16)));
          assert.deepEqual(Array.from(mesh.instanceColor!.array),slots.flatMap(index=>colour.slice(index*3,index*3+3)));
        }else{
          assert.deepEqual(mesh.instanceMatrix.array,old.instanceMatrix.array);
          assert.deepEqual(mesh.instanceColor?.array,old.instanceColor?.array);
        }
        assert.equal(mesh.castShadow,old.castShadow);assert.equal(mesh.layers.mask,old.layers.mask);
        assert.equal(mesh.layers.isEnabled(ULTRA_STATIC_LAYER),old.layers.isEnabled(ULTRA_STATIC_LAYER));
        assert.equal(!!mesh.customDepthMaterial,!!old.customDepthMaterial);
        for(const [name,attribute]of Object.entries(old.geometry.attributes))assert.deepEqual(mesh.geometry.getAttribute(name).array,attribute.array,name);
        const flags=mesh.geometry.getAttribute(METRIC_PROXY_ATTRIBUTE);
        const expectedFlags=kept.map(record=>Number(selected.includes(record.propIndex)));
        assert.equal(!!flags,expectedFlags.includes(1),'Only retained selected body kinds own proxy arrays');
        if(flags){
          assert.equal(flags.count,mesh.count);assert.equal(flags.array.BYTES_PER_ELEMENT,1);
          assert.equal(flags.normalized,true);assert.ok(flags.array instanceof Uint8Array);
          assert.deepEqual(Array.from(flags.array),expectedFlags.map(flag=>flag*255),'Raw normalized byte flags follow retained native source record order');
          assert.deepEqual(expectedFlags.map((_,index)=>flags.getX(index)),expectedFlags,'Normalized flags retain exact selected source semantics');
          assert.equal(flagArrays.has(flags.array.buffer),false);flagArrays.add(flags.array.buffer);
          flagBytes+=flags.array.byteLength;
          for(let index=0;index<flags.count;index++){const flag=flags.getX(index);assert.ok(flag===0||flag===1);positiveFlags+=Number(flag===1);}
          assert.ok((mesh.material as THREE.MeshStandardMaterial).customProgramCacheKey().includes('metric-source-proxy-v1'));
          assert.equal((mesh.customDepthMaterial?.customProgramCacheKey()??'').includes('metric-source-proxy-v1'),false);
        }
      }
      assert.equal(flagBytes,delta.proxyBytes);assert.equal(replacement.metricSource!.proxyFlagBytes,flagBytes);
      assert.equal(replacement.metricSource!.proxyColourTriangles,delta.discardedColourTriangles);
      assert.equal(replacement.metricSource!.removedColourPieces,removed);
      assert.equal(replacement.metricSource!.proxyColourPieces,prepared.metric.descriptors!.replacements.length-removed);
      assert.equal(positiveFlags,prepared.metric.descriptors!.replacements.length-removed);
      assert.equal(replacement.bytes-original.bytes,flagBytes,'PropsView.bytes owns texture/slot/proxy rows, not source instance arrays');
      const instanceBytes=(view:typeof original):number=>view.group.children.reduce((sum,child)=>{
        const mesh=child as THREE.InstancedMesh;
        return sum+mesh.instanceMatrix.array.byteLength+(mesh.instanceColor?.array.byteLength??0);
      },0);
      assert.equal(instanceBytes(replacement),instanceBytes(original)-removed*(16+3)*Float32Array.BYTES_PER_ELEMENT);
      assert.equal(JSON.stringify(plan),before);
    }finally{replacement.dispose();original.dispose();prepared.dispose();}
  }
});

test('prepared metric work enters each 1/2/4-view price once; original relief is filtered before real allocation',()=>{
  const plan=fixture(),off=prepareEnvironmentSupplements(plan,null,{propIndices:[]}),on=prepareEnvironmentSupplements(plan,null,{propIndices:[0,1]});
  const appearance=createDistrictExteriorAppearance();
  const facade=createMetricFacade(plan,on.metric.descriptors!,appearance);
  const exterior=createDistrictExterior(plan,appearance,on.exterior);
  try{
    assert.ok(on.exterior.filter(site=>[0,1].includes(site.propIndex)).every(site=>site.parts.every(part=>part.shape==='cover')));
    const p0=priceEnvironmentSupplements(off,'ordinary',false,triangles),p1=priceEnvironmentSupplements(on,'ordinary',false,triangles);
    assert.equal(p1.metricCommonBytes,facade.report().geometryBytes);
    assert.equal(exterior.report().colourTriangles,on.exterior.flatMap(site=>site.parts).filter(part=>!part.rich)
      .reduce((sum,part)=>sum+(part.shape==='cover'?32:12),0));
    const c0=presentationCost(plan,BASELINE_PRESENTATION,null,off),c1=presentationCost(plan,BASELINE_PRESENTATION,null,on);
    const triangleDelta=p1.colourTriangles+p1.shadowTriangles-p0.colourTriangles-p0.shadowTriangles,drawDelta=p1.colourDraws+p1.shadowDraws-p0.colourDraws-p0.shadowDraws;
    for(const [mode,views]of [['solo',1],['split',2],['quad',4]]as const){
      assert.equal(c1.frame[mode].triangles-c0.frame[mode].triangles,triangleDelta*views);
      assert.equal(c1.frame[mode].drawCalls-c0.frame[mode].drawCalls,drawDelta*views);
    }
    const roofDraws=facade.group.children.filter(child=>(child as THREE.Mesh).castShadow);
    const actualRoofTriangles=roofDraws.reduce((sum,child)=>sum+(child as THREE.Mesh).geometry.getAttribute('position').count/3,0);
    assert.equal(p1.shadowDraws-p0.shadowDraws,roofDraws.length);
    assert.equal(p1.shadowTriangles-p0.shadowTriangles,actualRoofTriangles);
    const policy={nearCasts:ultraNearCasts,buildings:true,farShadow:true};
    const ultra=priceEnvironmentSupplements(on,'ultra',true,part=>ultraPartTriangles(part,ULTRA_FULL),policy);
    const ultraOff=priceEnvironmentSupplements(off,'ultra',true,part=>ultraPartTriangles(part,ULTRA_FULL),policy);
    const source=metricSourcePrice(on.metric,true,part=>ultraPartTriangles(part,ULTRA_FULL),ultraNearCasts);
    assert.equal(ultra.shadowDraws-ultraOff.shadowDraws,roofDraws.length+source.shadowDrawDelta);
    assert.equal(ultra.shadowTriangles-ultraOff.shadowTriangles,actualRoofTriangles+source.shadowTriangleDelta);
    assert.equal(ultra.farShadowDraws-ultraOff.farShadowDraws,roofDraws.length+source.shadowDrawDelta);
    assert.equal(ultra.farShadowTriangles-ultraOff.farShadowTriangles,actualRoofTriangles+source.shadowTriangleDelta);
    assert.equal(ultra.metricProxyBytes,source.proxyBytes);
    assert.equal(ultra.capSlotBytes,ultraOff.capSlotBytes);assert.equal(ultra.capFarExtraTriangles,ultraOff.capFarExtraTriangles);
    const targets=ultraTargetBytes(ULTRA_FULL,{width:1280,height:720},undefined,null,ultra);
    assert.equal(targets.filter(target=>target.name==='metric-source-proxy-flags').length,1);
    assert.equal(targets.find(target=>target.name==='metric-source-proxy-flags')!.bytes,ultra.metricProxyBytes);
    assert.equal(targets.filter(target=>target.name==='metric-shared-facade-common').length,1);
    assert.equal(targets.find(target=>target.name==='metric-shared-facade-common')!.bytes,facade.report().geometryBytes);
    const complete=targets.filter(target=>['metric-shared-facade-common','shared-environment-supplements'].includes(target.name)).reduce((sum,t)=>sum+t.bytes,0);
    assert.equal(complete,ultra.resourceBytes,'Common polygons cannot also be charged in the other supplement row');
  }finally{facade.dispose();exterior.dispose();appearance.dispose();on.metric.dispose();off.metric.dispose();}
  assert.throws(()=>facade.descriptors,/Disposed metric facade/);
});

test('terrain consumes the same prepared extraction owner and CPU cache expires explicitly after final disposal',()=>{
  const plan=fixture(),off=prepareEnvironmentSupplements(plan,null,{propIndices:[]}),on=prepareEnvironmentSupplements(plan,null,{propIndices:[0,1]});
  const original=createTerrain(plan,BASELINE_PRESENTATION,undefined,{sharedSurface:true,environmentSupplements:off});
  const replacement=createTerrain(plan,BASELINE_PRESENTATION,undefined,{sharedSurface:true,environmentSupplements:on});
  try{
    const delta=metricSourcePrice(on.metric,false,triangles);
    assert.equal(replacement.triangles-original.triangles,delta.colourTriangleDelta);
    assert.equal(replacement.metricSource!.removedColourPieces,on.metric.descriptors!.replacements.length);
  }finally{replacement.dispose();original.dispose();on.metric.dispose();off.metric.dispose();}
  assert.equal(on.metric.disposed,true);assert.equal(on.metric.sourceCounts.size,0);assert.equal(on.metric.removedCounts.size,0);
  assert.throws(()=>on.metric.descriptors,/Disposed metric/);assert.throws(()=>on.metric.price,/Disposed metric/);
  assert.throws(()=>priceEnvironmentSupplements(on,'ordinary',false,triangles),/source owner mismatch/);
  on.metric.dispose();
});

/** Split every collinear boundary edge at the other emitted vertices before
 * checking directed twins. This catches a missing return or flipped pane and
 * accepts the intentional T junctions introduced by a real frame partition. */
function assertClosedCavity(polygons: readonly (readonly {x:number;y:number;z:number}[])[], expectedVolume: number): void {
  const key=(p:{x:number;y:number;z:number})=>[p.x,p.y,p.z].map(value=>Math.round(value*1e7)).join(',');
  const vertices=[...new Map(polygons.flat().map(point=>[key(point),point])).values()];
  const directed=new Map<string,number>();let volume=0;
  for(const polygon of polygons){
    const a=polygon[0];
    for(let index=1;index<polygon.length-1;index++){
      const b=polygon[index],c=polygon[index+1];
      volume+=(a.x*(b.y*c.z-b.z*c.y)+a.y*(b.z*c.x-b.x*c.z)+a.z*(b.x*c.y-b.y*c.x))/6;
    }
    for(let index=0;index<polygon.length;index++){
      const a=polygon[index],b=polygon[(index+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
      assert.ok(length>1e-14,'No zero boundary edges');
      const cuts=vertices.map(point=>({point,t:((point.x-a.x)*dx+(point.y-a.y)*dy+(point.z-a.z)*dz)/length}))
        .filter(({point,t})=>t>=-1e-8&&t<=1+1e-8&&Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy,point.z-a.z-t*dz)<1e-7)
        .sort((first,last)=>first.t-last.t);
      for(let cut=1;cut<cuts.length;cut++){
        const first=key(cuts[cut-1].point),last=key(cuts[cut].point);if(first===last)continue;
        const edge=`${first}>${last}`;directed.set(edge,(directed.get(edge)??0)+1);
      }
    }
  }
  for(const [edge,count]of directed){const [a,b]=edge.split('>');assert.equal(count,1,'Each cavity edge walks once');
    assert.equal(directed.get(`${b}>${a}`),1,'Each cavity edge has its opposite twin');}
  assert.ok(Math.abs(volume-expectedVolume)<1e-6,'The cavity keeps inward air-boundary winding and its metric volume');
}

test('real pane/frame/return emission forms a closed metric cavity with a known missing-return negative control',()=>{
  const plan=fixture(),prepared=prepareEnvironmentSupplements(plan,null,{propIndices:[0]});
  try{
    const descriptor=prepared.metric.descriptors!,aperture=descriptor.apertures.find(item=>item.kind==='window')!;
    assert.ok(aperture);const [a,b,,d]=aperture.mouth,width=aperture.right-aperture.left,height=aperture.top-aperture.bottom;
    const tx=(b.x-a.x)/width,tz=(b.z-a.z)/width,nx=-tz,nz=tx;
    const inside=(p:{x:number;y:number;z:number})=>{
      const x=(p.x-a.x)*tx+(p.z-a.z)*tz,z=(p.x-a.x)*nx+(p.z-a.z)*nz,y=p.y-a.y;
      return x>=-1e-7&&x<=width+1e-7&&y>=-1e-7&&y<=height+1e-7&&z>=-aperture.recess-1e-7&&z<=1e-7;
    };
    const surfaces=descriptor.surfaces.filter(surface=>surface.pieceKey===aperture.pieceKey
      &&['reveal','closed-pane','pane-frame'].includes(surface.kind)&&surface.vertices.every(inside));
    const mouth=[...aperture.mouth].reverse(),polygons=[mouth,...surfaces.map(surface=>surface.vertices)];
    const expected=-width*height*aperture.recess;
    assertClosedCavity(polygons,expected);
    const omitted=surfaces.findIndex(surface=>surface.kind==='reveal');assert.ok(omitted>=0);
    assert.throws(()=>assertClosedCavity([mouth,...surfaces.filter((_,index)=>index!==omitted).map(surface=>surface.vertices)],expected),/opposite twin/);
    assert.ok(d.y>a.y,'Metric window height exists independently of frame appearance');
  }finally{prepared.metric.dispose();}
});
