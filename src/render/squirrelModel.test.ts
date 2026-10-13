/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {test} from 'node:test';
import * as THREE from 'three';
import {strict as assert} from 'node:assert';
import {createSquirrelGeometry,SQUIRREL_MODEL_PRICE,type SquirrelPartRange} from './squirrelModel.ts';

test('reference reconstruction stays inside the accepted candidate geometry budget',()=>{
  const g=createSquirrelGeometry();
  try{
    assert.ok(SQUIRREL_MODEL_PRICE.triangles<=1228);
    assert.ok(SQUIRREL_MODEL_PRICE.geometryBytes<=36408);
    assert.equal(g.index!.count/3,SQUIRREL_MODEL_PRICE.triangles);
    assert.equal(Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,g.index!.array.byteLength),SQUIRREL_MODEL_PRICE.geometryBytes);
    assert.equal(g.getAttribute('uv'),undefined);
  }finally{g.dispose();}
});

test('every semantic shell is closed, outward, finite, and accounted exactly once',()=>{
  const g=createSquirrelGeometry(),p=g.getAttribute('position'),joint=g.getAttribute('wildlifeJoint'),indices=g.index!;
  const parts=g.userData.squirrelParts as SquirrelPartRange[];
  try{
    assert.equal(new Set(parts.map(v=>v.name)).size,parts.length);
    let end=0;
    for(const part of parts){
      assert.equal(part.start,end);end+=part.count;
      const edges=new Map<string,number>();let volume=0;
      for(let at=part.start;at<end;at+=3){
        const ids=[indices.getX(at),indices.getX(at+1),indices.getX(at+2)];
        for(const id of ids){assert.equal(joint.getX(id),part.joint);for(const value of [p.getX(id),p.getY(id),p.getZ(id)])assert.ok(Number.isFinite(value));}
        for(let i=0;i<3;i++){const key=`${ids[i]},${ids[(i+1)%3]}`;edges.set(key,(edges.get(key)??0)+1);}
        const [a,b,c]=ids;volume+=(p.getX(a)*(p.getY(b)*p.getZ(c)-p.getZ(b)*p.getY(c))+p.getY(a)*(p.getZ(b)*p.getX(c)-p.getX(b)*p.getZ(c))+p.getZ(a)*(p.getX(b)*p.getY(c)-p.getY(b)*p.getX(c)))/6;
      }
      for(const [key,count] of edges){assert.equal(count,1,`${part.name}: duplicated directed edge`);assert.equal(edges.get(key.split(',').reverse().join(',')),1,`${part.name}: open or flipped edge`);}
      assert.ok(volume>1e-12,`${part.name}: outward positive volume (${volume})`);
    }
    assert.equal(end,indices.count);
    const normal=g.getAttribute('normal');for(let i=0;i<normal.count;i++)assert.ok(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))>.99);
  }finally{g.dispose();}
});

test('tail root occupies the rear pelvis above the belly rather than an underside stalk',()=>{
  const g=createSquirrelGeometry(),p=g.getAttribute('position'),indices=g.index!;
  try{
    const parts=g.userData.squirrelParts as SquirrelPartRange[];
    const centre=(name:string,sectors:number)=>{
      const part=parts.find(v=>v.name===name)!;
      const ids=[...new Set(Array.from({length:part.count},(_,i)=>indices.getX(part.start+i)))].sort((a,b)=>a-b).slice(0,sectors);
      return {y:ids.reduce((n,id)=>n+p.getY(id),0)/sectors,z:ids.reduce((n,id)=>n+p.getZ(id),0)/sectors};
    };
    const host=centre('body',12),root=centre('tail',8);
    const rearPelvis=(at:{y:number;z:number})=>at.y>=host.y-.03&&at.y<=host.y+.04&&Math.abs(at.z-host.z)<=.02+1e-6;
    assert.ok(rearPelvis(root),'root must bury into the rear pelvis');
    assert.ok(root.z<-.075,'tail emerges behind both haunches');
    assert.equal(rearPelvis({y:.055,z:-.085}),false,'the rejected underside attachment must fail');
    const tail=parts.find(v=>v.name==='tail')!;
    const ids=[...new Set(Array.from({length:tail.count},(_,i)=>indices.getX(tail.start+i)))].sort((a,b)=>a-b);
    // A correct invisible socket alone passed while the exposed plume hung
    // below the pelvis. Require the first visible rows to leave backward/up.
    let previous=root;
    for(let row=1;row<4;row++){
      const ring=ids.slice(row*8,(row+1)*8),at={y:ring.reduce((n,id)=>n+p.getY(id),0)/8,z:ring.reduce((n,id)=>n+p.getZ(id),0)/8};
      assert.ok(at.y>=previous.y,'visible tail must not dip toward the belly');
      assert.ok(at.z<previous.z,'first visible tail continues behind the rump');
      assert.ok(Math.min(...ring.map(id=>p.getY(id)))> .060,'no underside spike');previous=at;
    }
  }finally{g.dispose();}
});

/** Independent segment/triangle check complements winding and ray parity.
 * Neighbouring triangles share an edge by construction; only other surfaces
 * crossing strictly inside an edge are defects. Coplanar overlap is not scored. */
function crossingPairs(g:THREE.BufferGeometry,start:number,count:number):number {
  const p=g.getAttribute('position'),index=g.index!,triangles=[];
  for(let i=start;i<start+count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],v=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id));triangles.push({ids,v,box:new THREE.Box3().setFromPoints(v)});}
  const ray=new THREE.Ray(),hit=new THREE.Vector3(),direction=new THREE.Vector3();let crossings=0;
  for(let i=0;i<triangles.length;i++)for(let j=i+1;j<triangles.length;j++){
    const a=triangles[i],b=triangles[j];if(a.ids.some(id=>b.ids.includes(id))||!a.box.intersectsBox(b.box))continue;
    let crossed=false;
    for(const [source,target] of [[a,b],[b,a]])for(let edge=0;edge<3;edge++){
      const from=source.v[edge],to=source.v[(edge+1)%3],length=from.distanceTo(to);
      ray.set(from,direction.subVectors(to,from).normalize());
      if(ray.intersectTriangle(target.v[0],target.v[1],target.v[2],false,hit)){
        const distance=from.distanceTo(hit);if(distance>1e-7&&distance<length-1e-7)crossed=true;
      }
    }
    if(crossed)crossings++;
  }
  return crossings;
}
test('closed shells have no non-neighbour surface crossings; detector rejects a known crossing',()=>{
 const g=createSquirrelGeometry(),bad=new THREE.BufferGeometry();
 try{
  bad.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,.2,.2,-1,.2,.2,1,.8,.2,0],3));bad.setIndex([0,1,2,3,4,5]);
  assert.equal(crossingPairs(bad,0,6),1,'known crossing must be detected');
  for(const part of g.userData.squirrelParts as SquirrelPartRange[])assert.equal(crossingPairs(g,part.start,part.count),0,part.name);
 }finally{g.dispose();bad.dispose();}
});
