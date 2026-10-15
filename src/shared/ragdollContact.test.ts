/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {contactCapsuleOverlapsBox,contactOrientedBoxContact,contactSegmentOverlapsBox,nearestContactCircle,nearestContactSphere,pointMeetsContactPlanes} from './ragdollContact.ts';
const planes=(...values:number[])=>Float64Array.from(values),out=new Float64Array(4);
test('a clear oriented core corner cannot earn contact from one failed directional inequality',()=>{
  const box=planes(0,0,0,0,1,1,1,1,0),basis=planes(Math.SQRT1_2,Math.SQRT1_2,0,-Math.SQRT1_2,Math.SQRT1_2,0,0,0,1),scratch=new Float64Array(12),hit=new Float64Array(7);
  // The circumcircle/diagonal inequality overlaps this corner, but the thin
  // finite rectangle has a valid separating axis and must stay untouched.
  assert.equal(contactOrientedBoxContact(1.2,1.2,0,basis,0,-.2,.2,-.05,.05,-.1,.1,box,0,scratch,hit),false);
  assert.equal(contactOrientedBoxContact(1.1,1.1,0,basis,0,-.2,.2,-.05,.05,-.1,.1,box,0,scratch,hit),true);
  const moved=[1.1+hit[0]*(hit[3]+1e-5),1.1+hit[1]*(hit[3]+1e-5),hit[2]*(hit[3]+1e-5)];
  assert.equal(contactOrientedBoxContact(moved[0],moved[1],moved[2],basis,0,-.2,.2,-.05,.05,-.1,.1,box,0,scratch,hit),false,'the reported response is a valid convex separation');
});
test('expanded capsule slabs do not earn a hard contact at a known-clear corner',()=>{
  const box=planes(0,0,0,0,1,1,1,1,0),scratch=new Float64Array(8);
  assert.equal(contactSegmentOverlapsBox(1.12,1.12,-.5,1.12,1.12,.5,.13,box,0),true);
  assert.equal(contactCapsuleOverlapsBox(1.12,1.12,-.5,1.12,1.12,.5,.13,box,0,scratch),false);
  assert.equal(contactCapsuleOverlapsBox(1.08,1.08,-.5,1.08,1.08,.5,.13,box,0,scratch),true);
  assert.equal(contactCapsuleOverlapsBox(-2,0,0,2,0,0,.13,box,0,scratch),true,'interior intervals are tested, not only endpoints');
});
test('contact circle intersects independent allowed arcs and reports genuinely impossible geometry',()=>{
  const p=planes(0,1,0,.5,1,0,0,.3);
  assert.equal(nearestContactCircle(0,0,0,0,0,1,1,1,0,0,p,2,out),true);
  assert.ok(pointMeetsContactPlanes(...Array.from(out.slice(0,3)) as [number,number,number],p,2));
  assert.ok(Math.abs(out[0]-Math.sqrt(.75))<1e-8&&Math.abs(out[1]-.5)<1e-8);
  assert.equal(nearestContactCircle(0,0,0,0,0,1,1,1,0,0,planes(0,1,0,1.01),1,out),false,'the old clamped requirement would claim a pole exists');
  assert.equal(nearestContactCircle(0,0,0,0,0,1,1,1,0,0,planes(0,1,0,.8,1,0,0,.8),2,out),false,'individually feasible arcs can have an empty intersection');
});
test('sphere contact preserves radius and chooses the nearest feasible plane-pair point',()=>{
  const p=planes(1,0,0,.6,0,1,0,.6);
  assert.equal(nearestContactSphere(0,0,0,1,0,0,1,p,2,out),true);
  assert.ok(Math.abs(out[0]-.6)<1e-8&&Math.abs(out[1]-.6)<1e-8&&Math.abs(out[2]-Math.sqrt(.28))<1e-8);
  assert.ok(Math.abs(Math.hypot(...out.slice(0,3))-1)<1e-8);
  assert.equal(nearestContactSphere(0,0,0,1,0,0,1,planes(1,0,0,.8,0,1,0,.8),2,out),false);
});
test('tangent and parallel plane degenerations remain finite without inventing feasibility',()=>{
  assert.equal(nearestContactSphere(0,0,0,1,0,-1,0,planes(0,1,0,1,0,1,0,.5),2,out),true);
  assert.deepEqual(Array.from(out.slice(0,3)),[0,1,0]);
  assert.equal(nearestContactSphere(0,0,0,1,0,-1,0,planes(0,1,0,.6,0,-1,0,.6),2,out),false);
  assert.equal(nearestContactCircle(0,0,0,0,0,1,0,1,0,0,planes(0,1,0,.1),1,out),false);
});

test('a finite wall catches a bowed shin with clear endpoints, and oriented support avoids sphere-created boot gaps',async()=>{
  const {contactSegmentOverlapsBox,contactOrientedBoxSupport,contactOrientedBoxOverlaps}=await import('./ragdollContact.ts');
  const box=Float64Array.from([0,0,1,4,.05,.5,.5,1,0]),basis=Float64Array.from([1,0,0,0,1,0,0,0,1]),scratch=new Float64Array(12);
  assert.equal(contactSegmentOverlapsBox(-.2,1.3,4,.0497,1,4,.13,box,0),true);
  assert.equal(contactSegmentOverlapsBox(-.2,.7,3.9,-.2,.7,4,0,box,0),false,'both endpoint centre sweeps can miss the actual shin');
  assert.equal(contactOrientedBoxSupport(0,0,1,basis,0,-.1,.1,-.075,.06,-.145,.15),.15);
  assert.equal(contactOrientedBoxOverlaps(.16,1,4,basis,0,-.1,.1,-.075,.06,-.145,.15,box,0,scratch),false);
  assert.equal(contactOrientedBoxOverlaps(.14,1,4,basis,0,-.1,.1,-.075,.06,-.145,.15,box,0,scratch),true);
  assert.equal(contactOrientedBoxOverlaps(0,2,4,basis,0,-.1,.1,-.075,.06,-.145,.15,box,0,scratch),false,'an infinite front plane cannot turn a boot above the finite roof into penetration');
});

test('the middle of a core span touching a roof/front corner earns a small valid diagonal separation',()=>{
  const box=planes(0,0,0,0,1,1,1,1,0),hit=new Float64Array(7),breaks=new Float64Array(8);
  assert.equal(contactCapsuleOverlapsBox(.8,1.2,0,1.2,.8,0,.14,box,0,breaks,hit),true);
  assert.ok(Math.abs(hit[0]-Math.SQRT1_2)<1e-8&&Math.abs(hit[1]-Math.SQRT1_2)<1e-8);
  assert.ok(Math.abs(hit[3]-.14)<1e-8,'an axis face alone would manufacture a .34m correction');
  const offset=Math.abs(hit[0])+Math.abs(hit[1])+Math.abs(hit[2]);
  for(const p of [[.8,1.2,0],[1.2,.8,0]])assert.ok(hit[0]*(p[0]+hit[0]*hit[3])+hit[1]*(p[1]+hit[1]*hit[3])>=offset+.14-1e-8);
});
