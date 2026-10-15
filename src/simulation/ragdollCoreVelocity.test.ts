/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {RAGDOLL_TRUNK_WEIGHTS,RIDER,RIDER_BLOCKOUT} from '../data/tuning.ts';
import {CrashRagdoll,defaultRagdollTuning} from './ragdoll.ts';
import {flatPavement} from './populationContactHarness.test-support.ts';
import {NO_SOFT_BODIES} from './softBodies.ts';
import type {TerrainSampler} from './world.ts';
const DT=1/120;
type Internal={previous:Float64Array;coreGroundContact:Float64Array;trunkReaction:Float64Array;coreGroundLift(sampler:TerrainSampler):number;collectTrunkContacts():boolean;solveLimbContacts(dt:number,heading:number,wx:number,wz:number,top:number,sampler:TerrainSampler,bodies:typeof NO_SOFT_BODIES,t:ReturnType<typeof defaultRagdollTuning>):void;moveContact(index:number,x:number,y:number,z:number):void;respondCoreGroundVelocity(t:ReturnType<typeof defaultRagdollTuning>):boolean;finalLegsClear():boolean};
function measure(rag:CrashRagdoll) {
  const i=rag as unknown as Internal,p=rag.positions,v=i.previous,w=RAGDOLL_TRUNK_WEIGHTS;
  const centre=[0,0,0],velocity=[0,0,0];let mass=0,energy=0;
  for(let j=0;j<7;j++){mass+=w[j];for(let k=0;k<3;k++){centre[k]+=w[j]*p[j*3+k];velocity[k]+=w[j]*(p[j*3+k]-v[j*3+k]);}}
  for(let k=0;k<3;k++){centre[k]/=mass;velocity[k]/=mass;}
  let xx=0,yy=0,zz=0,xy=0,xz=0,yz=0,lx=0,ly=0,lz=0;
  for(let j=0;j<7;j++) {
    const at=j*3,x=p[at]-centre[0],y=p[at+1]-centre[1],z=p[at+2]-centre[2],dx=p[at]-v[at],dy=p[at+1]-v[at+1],dz=p[at+2]-v[at+2];
    xx+=w[j]*(y*y+z*z);yy+=w[j]*(x*x+z*z);zz+=w[j]*(x*x+y*y);xy-=w[j]*x*y;xz-=w[j]*x*z;yz-=w[j]*y*z;
    lx+=w[j]*(y*dz-z*dy);ly+=w[j]*(z*dx-x*dz);lz+=w[j]*(x*dy-y*dx);energy+=w[j]*(dx*dx+dy*dy+dz*dz)*.5;
  }
  const a=yy*zz-yz*yz,b=xz*yz-xy*zz,c=xy*yz-xz*yy,d=xx*zz-xz*xz,e=xy*xz-xx*yz,f=xx*yy-xy*xy,det=xx*a+xy*b+xz*c;
  const ox=(a*lx+b*ly+c*lz)/det,oy=(b*lx+d*ly+e*lz)/det,oz=(c*lx+e*ly+f*lz)/det,
    rx=i.coreGroundContact[3]-centre[0],ry=i.coreGroundContact[4]-centre[1],rz=i.coreGroundContact[5]-centre[2];
  const contactVelocity=[velocity[0]+oy*rz-oz*ry,velocity[1]+oz*rx-ox*rz,velocity[2]+ox*ry-oy*rx];
  const normalVelocity=contactVelocity[0]*i.coreGroundContact[0]+contactVelocity[1]*i.coreGroundContact[1]+contactVelocity[2]*i.coreGroundContact[2];
  return {centre,velocity,energy,normalVelocity};
}
function fixture(sampler:TerrainSampler=flatPavement) {
  const rag=new CrashRagdoll(),t=defaultRagdollTuning(),i=rag as unknown as Internal;
  rag.seed({x:0,y:.2-RIDER.hipHeight,z:0,headingY:.3,rollAngle:.2,riderPitch:.4,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},t,DT);
  const lift=i.coreGroundLift(sampler);assert.ok(lift>0);i.moveContact(0,0,lift,0);i.coreGroundContact[4]+=lift;i.coreGroundContact[6]-=lift;
  const centre=measure(rag).centre;
  for(let j=0;j<7;j++){const at=j*3,p=rag.positions,x=p[at]-centre[0],y=p[at+1]-centre[1],z=p[at+2]-centre[2];
    i.previous[at]=p[at]-(.003-.0005*z-.0007*y);i.previous[at+1]=p[at+1]-(-.006+.0007*x-.001*z);i.previous[at+2]=p[at+2]-(.0015+.001*y+.0005*x);}
  return {rag,t,i};
}
test('accepted compound contact removes inward rigid velocity while preserving COM tangent and bounded energy',()=>{
  const {rag,t,i}=fixture(),before=measure(rag),particles=rag.positions.slice();
  assert.ok(before.normalVelocity<-.004,'positional separation alone retains the inward velocity');
  assert.equal(i.respondCoreGroundVelocity(t),true);const after=measure(rag);
  assert.ok(Math.abs(after.normalVelocity+t.ragdollRestitution*before.normalVelocity)<1e-10);
  assert.ok(Math.abs(after.velocity[0]-before.velocity[0])<1e-12&&Math.abs(after.velocity[2]-before.velocity[2])<1e-12,'no tangential impulse is introduced');
  assert.ok(after.energy<=before.energy+1e-12&&Number.isFinite(after.energy));assert.deepEqual(rag.positions,particles,'velocity response cannot translate the accepted pose');
  const history=i.previous.slice();assert.equal(i.respondCoreGroundVelocity(t),false,'outward contact cannot receive another impulse');assert.deepEqual(i.previous,history);
});
test('omitting compound velocity response is an independent retained-inward-motion control',()=>{
  const good=fixture(),bad=fixture();good.i.respondCoreGroundVelocity(good.t);
  assert.ok(measure(good.rag).normalVelocity>=0);assert.ok(measure(bad.rag).normalVelocity<-.004);
});
test('a verified sloped contact preserves COM motion tangent to its actual normal',()=>{
  const size=Math.sqrt(1+.15*.15+.1*.1),sampler:TerrainSampler={...flatPavement,sampleGround(x,z,out){flatPavement.sampleGround(x,z,out);out.height=.15*x-.1*z;out.normal.x=-.15/size;out.normal.y=1/size;out.normal.z=.1/size;return out;}};
  const {rag,t,i}=fixture(sampler),before=measure(rag);assert.equal(i.respondCoreGroundVelocity(t),true);const after=measure(rag),n=i.coreGroundContact;
  const x=after.velocity[0]-before.velocity[0],y=after.velocity[1]-before.velocity[1],z=after.velocity[2]-before.velocity[2];
  assert.ok(Math.hypot(y*n[2]-z*n[1],z*n[0]-x*n[2],x*n[1]-y*n[0])<1e-12);
  assert.ok(Math.abs(after.normalVelocity+t.ragdollRestitution*before.normalVelocity)<1e-10&&after.energy<=before.energy+1e-12);
});
test('the native accepted path responds at most once and a rejected pose never responds',()=>{
  for(const reject of [false,true]) {
    const {rag,t,i}=fixture();let calls=0;const response=i.respondCoreGroundVelocity.bind(i);i.respondCoreGroundVelocity=(value)=>{calls++;return response(value);};
    if(reject)i.finalLegsClear=()=>false;
    rag.step(DT,0,100,100,flatPavement,NO_SOFT_BODIES,t);
    assert.equal(calls,reject?0:1,'only the fully accepted final pose can own its normal impulse');
    if(reject)assert.deepEqual(i.previous,rag.positions,'rollback retains its native stopped history');
  }
});
test('particle-dominated coherent lift unloads the core before its normal impulse',()=>{
  const {rag,t,i}=fixture(),p=rag.positions,headX=p[6],headZ=p[8],headFloor=p[7]+.12+.04;
  let raisedParticleSamples=0;
  const sampler:TerrainSampler={...flatPavement,sampleGround(x,z,out){
    flatPavement.sampleGround(x,z,out);
    if(Math.hypot(x-headX,z-headZ)<.05){out.height=headFloor;raisedParticleSamples++;}
    return out;
  }};
  const collect=i.collectTrunkContacts.bind(i);
  i.collectTrunkContacts=()=>{collect();i.trunkReaction[0]=.01;return true;};
  i.solveLimbContacts(DT,.3,100,100,1,sampler,NO_SOFT_BODIES,t);
  assert.ok(raisedParticleSamples>0,'the production moved-particle sample must encounter its distinct support');
  assert.ok(i.coreGroundContact[6]<-.02,'the larger particle lift must update the actual core signed gap');
  assert.ok(Math.abs(i.coreGroundContact[6]-(RIDER_BLOCKOUT.ragdollBootSupportSlack-i.coreGroundContact[4]))<1e-10,'flat support is checked at its lifted actual point');
  const history=i.previous.slice();assert.equal(i.respondCoreGroundVelocity(t),false,'an unloaded core cannot remove airborne momentum');assert.deepEqual(i.previous,history);
  // Retaining the pre-lift need is the exact former bug: it still presents an
  // active support although the measured point has left the plane.
  i.coreGroundContact[6]=0;assert.equal(i.respondCoreGroundVelocity(t),true,'stale-gap control applies the erroneous airborne impulse');
});
