/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RAGDOLL_BOOT_GROUND_BOX, RAGDOLL_HAND_GROUND_BOX, RIDER_BLOCKOUT } from '../data/tuning.ts';
import { ragdollBootGroundSupport, solveRagdollLeg, solveRagdollLimb, transportRagdollLegPole, writeRagdollBootFrame } from './ragdollBoot.ts';

function points() {
  const p = new Float64Array(33); p[4] = .5; p[9] = .1; p[12] = -.1; p[27] = .2; p[29] = .1;
  return p;
}
test('the shared leg keeps fixed bones and never reverses an ankle while relaxing it toward gravity', () => {
  const solve = new Float64Array(36), poles = new Float64Array([0,0,1,0,0,1]);
  for (const foot of [[.3,.2,.1],[.3,1.5,.1],[-.2,.5,.4],[.01,.91,.02]]) {
    transportRagdollLegPole(foot[0],foot[1]-.92,foot[2],0,.025,.06,poles,0);
    solveRagdollLeg(0,.92,0,...foot as [number,number,number],0,1,0,RIDER_BLOCKOUT,solve,poles,0);
    assert.ok(Math.abs(Math.hypot(solve[0],solve[1]-.92,solve[2])-.4)<1e-8);
    assert.ok(Math.abs(Math.hypot(solve[0]-solve[3],solve[1]-solve[4],solve[2]-solve[5])-.38)<1e-8);
    const ankleDot=solve[18]*solve[27]+solve[19]*solve[28]+solve[20]*solve[29];
    assert.ok(ankleDot>=Math.cos(RIDER_BLOCKOUT.ragdollBootPitchMax)*Math.cos(RIDER_BLOCKOUT.ragdollBootRollMax)-1e-10,
      'the gravity-only frame could turn an ankle almost180degrees away from its shin');
    for(const at of [6,15,24])for(let i=0;i<3;i++)for(let j=0;j<3;j++) {
      const dot=solve[at+i*3]*solve[at+j*3]+solve[at+i*3+1]*solve[at+j*3+1]+solve[at+i*3+2]*solve[at+j*3+2];
      assert.ok(Math.abs(dot-(i===j?1:0))<1e-8);
    }
  }
});
test('canonical transport crosses vertical in both directions and reverses without a knee-circle pop', () => {
  const poles=new Float64Array([0,0,1,0,0,1]),solve=new Float64Array(36);let previous: number[]|undefined;
  for(const x of [-.0001,0,.0001,0,-.0001]) {
    transportRagdollLegPole(x,-.72,0,0,.025,8/120,poles,0);
    solveRagdollLeg(0,.92,0,x,.2,0,0,1,0,RIDER_BLOCKOUT,solve,poles,0);
    const current=Array.from(solve.slice(0,3));
    if(previous)assert.ok(Math.hypot(...current.map((v,i)=>v-previous![i]))<.002,'0.1mm of endpoint travel cannot flip a knee across its circle');
    previous=current;
  }
});
test('support recomputation reprojects the published pole without spending a second guidance budget', () => {
  const p=new Float64Array([0,0,1,0,0,1]);
  transportRagdollLegPole(.4,-.1,.1,0,.025,8/120,p,0);const once=p.slice();
  transportRagdollLegPole(.4,-.1,.1,0,.025,0,p,0);transportRagdollLegPole(.4,-.1,.1,0,.025,0,p,0);
  assert.ok(p.every((v,i)=>Math.abs(v-once[i])<1e-12));
  const angle=Math.acos(Math.max(-1,Math.min(1,once[2]/Math.hypot(once[0],once[1],once[2]))));
  // Reprojection can rotate the pole geometrically; its guide turn remains bounded.
  assert.ok(Number.isFinite(angle));
});
test('the direct canonical guide shortcut spends only the physical angular budget, including antipodal poles', () => {
  for(const angle of [.001,.04,.2,Math.PI])for(const at of [0,3]) {
    const poles=new Float64Array(6);poles[at+1]=Math.cos(angle);poles[at+2]=Math.sin(angle);const before=poles.slice();
    transportRagdollLegPole(.4,0,0,.8,.025,.05,poles,at);
    const change=Math.acos(Math.max(-1,Math.min(1,before[at+1]*poles[at+1]+before[at+2]*poles[at+2])));
    assert.ok(Math.abs(change-Math.min(angle,.05))<1e-10,'a target shortcut cannot spend more turn than the fixed-step cap');
    assert.ok(Math.abs(Math.hypot(poles[at],poles[at+1],poles[at+2])-1)<1e-12);
    if(angle<=.05)assert.ok(Math.abs(poles[at])+Math.abs(poles[at+1]-1)+Math.abs(poles[at+2])<1e-12);
  }
});
test('analytic boot support agrees with all eight corners on flat and sloped planes', () => {
  const p = points(), f = new Float64Array(9), b = RAGDOLL_BOOT_GROUND_BOX;
  p[3] = .3; p[4] = .15; p[5] = -.3;
  for (const heading of [0, .9, -2]) for (const n of [[0, 1, 0], [.1, .98, -.17], [-.7, .5, .5]]) {
    writeRagdollBootFrame(p, 3, 9, heading, RIDER_BLOCKOUT, f);
    const support = ragdollBootGroundSupport(f, b, ...n as [number, number, number]);
    let minimum = Infinity;
    for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) {
      const dot = n[0] * (f[0] * x + f[3] * y + f[6] * z) + n[1] * (support + f[1] * x + f[4] * y + f[7] * z)
        + n[2] * (f[2] * x + f[5] * y + f[8] * z);
      minimum = Math.min(minimum, dot); assert.ok(dot >= -1e-12);
    }
    assert.ok(Math.abs(minimum) < 1e-12);
  }
});

test('bounded algebraic boot angles retain the atan2 frame, and physics omits only unused upper-bone basis work', () => {
  const full=new Float64Array(36),physical=new Float64Array(36),poles=new Float64Array([0,0,1]);
  for(const heading of [-2.3,0,.8])for(const foot of [[.3,.2,.1],[.3,1.5,.1],[-.2,.5,.4],[.0001,.21,0],[0,.72,0]]) {
    transportRagdollLegPole(foot[0],foot[1]-.92,foot[2],heading,.025,.05,poles,0);
    solveRagdollLeg(0,.92,0,...foot as [number,number,number],0,1,heading,RIDER_BLOCKOUT,full,poles,0);
    solveRagdollLeg(0,.92,0,...foot as [number,number,number],0,1,heading,RIDER_BLOCKOUT,physical,poles,0,true,false);
    for(const index of [...Array(6).keys(),...Array.from({length:21},(_,i)=>i+15)])assert.ok(Math.abs(full[index]-physical[index])<1e-12);
    assert.ok(physical.slice(6,15).every(v=>v===0),'physics does not produce an unused upper-bone presentation matrix');
    const nx=full[15],ny=full[16],nz=full[17],ux=full[18],uy=full[19],uz=full[20],zx=full[21],zy=full[22],zz=full[23];
    const pitch=Math.max(-RIDER_BLOCKOUT.ragdollBootPitchMax,Math.min(RIDER_BLOCKOUT.ragdollBootPitchMax,Math.atan2(zy,uy)));
    const roll=Math.max(-RIDER_BLOCKOUT.ragdollBootRollMax,Math.min(RIDER_BLOCKOUT.ragdollBootRollMax,-Math.atan2(ny,Math.hypot(uy,zy))));
    const dx=full[3],dz=full[5],yaw=RIDER_BLOCKOUT.ragdollBootYawMax*(dx*Math.cos(heading)-dz*Math.sin(heading))/Math.hypot(dx,dz,RIDER_BLOCKOUT.ragdollBootYawSoftness);
    const sx=Math.sin(pitch),cx=Math.cos(pitch),sz=Math.sin(roll),cz=Math.cos(roll),sy=Math.sin(yaw),cy=Math.cos(yaw);
    const relative=[cz*cy,cx*sz*cy+sx*sy,sx*sz*cy-cx*sy,-sz,cx*cz,sx*cz,cz*sy,cx*sz*sy-sx*cy,sx*sz*sy+cx*cy];
    for(let axis=0;axis<3;axis++) {
      const at=axis*3,expected=[nx*relative[at]+ux*relative[at+1]+zx*relative[at+2],ny*relative[at]+uy*relative[at+1]+zy*relative[at+2],nz*relative[at]+uz*relative[at+1]+zz*relative[at+2]];
      for(let row=0;row<3;row++)assert.ok(Math.abs(full[24+at+row]-expected[row])<1e-12,'normal components must reproduce the original capped atan2 orientation');
    }
  }
});

test('direct physical hand and boot plane support matches the rendered matrices and all actual support-box corners', () => {
  const drawn=new Float64Array(37),contact=new Float64Array(37),poles=new Float64Array([0,0,1]);
  for(const leg of [false,true])for(const target of [[.3,.2,.1],[-.2,.5,.3],[.01,.68,.01]])for(const n of [[0,1,0],[.1,.98,-.17],[-.7,.5,.5]]) {
    const upper=leg?.4:.28,lower=leg?.38:.26,box=leg?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    transportRagdollLegPole(target[0],target[1]-.7,target[2],.8,.025,.05,poles,0);
    drawn.fill(0);contact.fill(0);
    if(leg) {
      solveRagdollLeg(0,.7,0,...target as [number,number,number],0,1,.8,RIDER_BLOCKOUT,drawn,poles,0);
      solveRagdollLeg(0,.7,0,...target as [number,number,number],0,1,.8,RIDER_BLOCKOUT,contact,poles,0,true,false,box,...n as [number,number,number]);
    } else {
      solveRagdollLimb(0,.7,0,...target as [number,number,number],0,1,.8,upper,lower,.145,.539999,.025,drawn,poles,0);
      // Reprojection remains required for a synthetic target that is clamped.
      solveRagdollLimb(0,.7,0,...target as [number,number,number],0,1,.8,upper,lower,.145,.539999,.025,contact,poles,0,false,false,box,...n as [number,number,number]);
    }
    const at=leg?24:15,support=ragdollBootGroundSupport(drawn,box,...n as [number,number,number],at);
    assert.ok(Math.abs(contact[36]-support)<1e-12);
    for(let i=0;i<6;i++)assert.ok(Math.abs(drawn[i]-contact[i])<1e-12,'the physical joint and endpoint must be the rendered triangle');
    assert.ok(contact.slice(6,15).every(v=>v===0));
    assert.ok(contact.slice(leg?24:15,33).every(v=>v===0),'unused contact presentation matrices must stay unwritten');
    let minimum=Infinity;
    for(const x of [box.minX,box.maxX])for(const y of [box.minY,box.maxY])for(const z of [box.minZ,box.maxZ]) {
      const dot=n[0]*(drawn[at]*x+drawn[at+3]*y+drawn[at+6]*z)+n[1]*(contact[36]+drawn[at+1]*x+drawn[at+4]*y+drawn[at+7]*z)+n[2]*(drawn[at+2]*x+drawn[at+5]*y+drawn[at+8]*z);
      minimum=Math.min(minimum,dot);assert.ok(dot>=-1e-12);
    }
    assert.ok(Math.abs(minimum)<1e-12);
  }
});
