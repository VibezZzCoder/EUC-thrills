/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RIDER_BLOCKOUT } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { BoxCollider } from '../level/plan.ts';
import { createPose, EucController, lerpPose } from './EucController.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { CrashRagdoll, defaultRagdollTuning, RD_CHEST, RD_FOOT_L, RD_FOOT_R, RD_HAND_L, RD_HAND_R,
  RD_HIP_L, RD_HIP_R, RD_PELVIS, RD_SHOULDER_L, RD_SHOULDER_R } from './ragdoll.ts';
import { SoftBodyField } from './softBodies.ts';
import { solveRagdollLimb, ragdollLegReachMinimum } from '../shared/ragdollBoot.ts';
import type { TerrainSampler } from './world.ts';

const DT = 1 / 120, tuning = defaultRagdollTuning(), empty = new SoftBodyField([]);
const flat = buildLevelPlan([{ id: 'flat', length: 160, halfWidth: 30, surface: 'pavement', shoulder: 2 }],
  { id: 'rag-repair', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'pavement' }, spacing: 4 });
const distance = (p: ArrayLike<number>, a: number, b: number) => Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);

test('raised-leg hip preference crosses its threshold with bounded motion and yields to copied/reset support',()=>{
  type Internal={frame:Float64Array;stepFrame:Float64Array;previous:Float64Array;supportedTerminals:number;projectHipAngles(dt:number):number};
  const setup=(up:number)=>{
    const rag=new CrashRagdoll();rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},tuning,DT);
    const internal=rag as unknown as Internal,f=internal.frame,p=rag.positions;
    for(let side=0;side<2;side++){const h=(3+side)*3,b=(9+side)*3;
      for(let axis=0;axis<3;axis++){p[b+axis]=p[h+axis]+f[3+axis]*up-f[6+axis]*.5;rag.jointPoles[side*3+axis]=f[3+axis];}}
    internal.previous.set(p);internal.stepFrame.set(f);return {rag,internal};
  };
  for(const up of [-1e-6,0,1e-6,.1]) {
    const {rag,internal}=setup(up),before=rag.positions.slice(),o=new Float64Array(37),f=internal.frame,h=9,b=27;
    const delta=(before[b]-before[h])*f[3]+(before[b+1]-before[h+1])*f[4]+(before[b+2]-before[h+2])*f[5];
    const angle=internal.projectHipAngles(DT);
    if(delta<=0)assert.equal(angle,0);else assert.ok(angle>0&&angle<=RIDER_BLOCKOUT.ragdollLegPoleSpeed*DT+1e-9);
    for(let side=0;side<2;side++) {
      const hip=(3+side)*3,foot=(9+side)*3;
      const moved=Math.hypot(rag.positions[foot]-before[foot],rag.positions[foot+1]-before[foot+1],rag.positions[foot+2]-before[foot+2]);
      assert.ok(moved<.074,'the threshold cannot project an entire folded leg in one tick');
      assert.ok(Math.abs(distance(rag.positions,3+side,9+side)-distance(before,3+side,9+side))<1e-8,'one hip triangle rotates without changing its reach');
      solveRagdollLimb(...Array.from(rag.positions.slice(hip,hip+3)) as [number,number,number],...Array.from(rag.positions.slice(foot,foot+3)) as [number,number,number],
        f[6],f[8],0,.4,.38,ragdollLegReachMinimum(.4,.38),.78-1e-6,.025,o,rag.jointPoles,side*3,false,false,undefined,0,1,0,true);
      assert.ok(Math.abs(Math.hypot(o[0]-rag.positions[hip],o[1]-rag.positions[hip+1],o[2]-rag.positions[hip+2])-.4)<1e-8);
      assert.ok(Math.abs(Math.hypot(o[0]-o[3],o[1]-o[4],o[2]-o[5])-.38)<1e-8);
    }
  }
  const {rag,internal}=setup(.1);internal.supportedTerminals=1;
  assert.equal(internal.projectHipAngles(DT),0,'a braced hand overrides airborne style');
  const copy=new CrashRagdoll();copy.copyStateFrom(rag);const other=copy as unknown as Internal;
  assert.equal(other.supportedTerminals,1);assert.equal(other.projectHipAngles(DT),0);
  other.supportedTerminals=0;assert.ok(other.projectHipAngles(DT)>0,'omitting the support history changes the actual next pose');
  assert.equal(internal.supportedTerminals,1,'copy ownership cannot alias this state');
  copy.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},tuning,DT);
  assert.equal(other.supportedTerminals,0,'a new crash cannot inherit braced limbs');
});

function coherent(p: ArrayLike<number>): void {
  assert.ok(Math.abs(distance(p, RD_PELVIS, RD_CHEST) - .5) < 1e-7, 'the spine length survives final contacts');
  const up = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
  const hip = [p[9] - p[12], p[10] - p[13], p[11] - p[14]];
  const shoulder = [p[15] - p[18], p[16] - p[19], p[17] - p[20]];
  const dot = (a: number[], b: number[]) => a.reduce((v, x, i) => v + x * b[i], 0);
  assert.ok(Math.abs(dot(up, hip)) < 1e-7, 'the hip bar remains perpendicular to the spine');
  assert.ok(dot(hip, shoulder) / (Math.hypot(...hip) * Math.hypot(...shoulder)) > .999999, 'shoulders cannot invert against the hip bar');
  const head = [p[6] - p[3], p[7] - p[4], p[8] - p[5]];
  assert.ok(dot(up, head) / (Math.hypot(...up) * Math.hypot(...head)) > .999999, 'the neck cannot fold back through the trunk');
}

test('weighted falls keep one trunk frame through ground, wall, corner and living contacts', () => {
  const boxes: readonly BoxCollider[][] = [[], [{ centre: { x: 0, y: 9, z: 1 }, halfExtents: { x: 30, y: 9, z: .2 }, rotationY: 0, surface: 'pavement' }],
    [{ centre: { x: 1, y: 9, z: 0 }, halfExtents: { x: .2, y: 9, z: 30 }, rotationY: 0, surface: 'pavement' },
      { centre: { x: 0, y: 9, z: 1 }, halfExtents: { x: 30, y: 9, z: .2 }, rotationY: 0, surface: 'pavement' }]];
  for (const [caseIndex, solids] of boxes.entries()) for (const cause of ['sideFall', 'faceplant'] as const) {
    const sampler = new PlanTerrainSampler({ ...flat, solids }), rag = new CrashRagdoll();
    rag.seed({ x: 0, y: 0, z: 0, headingY: .3, rollAngle: -.25, riderPitch: .1, hipDrop: .1,
      speed: 14, cause, intoSolid: caseIndex > 0, side: -1 }, tuning, DT);
    const bodies = caseIndex === 0 ? [{ x: 2, z: 2, headingY: .7, halfWidthMetres: .35, halfLengthMetres: .35, minY: 0, maxY: 1.6 }] : [];
    for (let step = 0; step < 300; step += 1) {
      rag.step(DT, step * DT, 0, 0, sampler, empty, tuning, bodies); coherent(rag.positions);
      for (let i = 0; i < 11; i += 1) {
        assert.ok(rag.positions[i * 3 + 1] >= .049, `${caseIndex}/${cause}/${step}/${i}: ground penetration`);
        for (const box of solids) {
          const x = Math.abs(rag.positions[i * 3] - box.centre.x), z = Math.abs(rag.positions[i * 3 + 2] - box.centre.z);
          assert.ok(x >= box.halfExtents.x - 1e-7 || z >= box.halfExtents.z - 1e-7 || rag.positions[i * 3 + 1] >= 18,
            `${caseIndex}/${cause}/${step}/${i}: a later contact put a particle inside a previous solid`);
        }
      }
    }
  }
});

test('the protective pose retains separate hands and open legs instead of collapsing to head and pelvis', () => {
  const sampler: TerrainSampler = { sampleGround(_x, _z, out) { out.height = -100; out.normal.x = 0; out.normal.y = 1; out.normal.z = 0; out.surface = 'pavement'; out.offCourse = false; return out; }, raycast() { return null; } };
  const rag = new CrashRagdoll();
  rag.seed({ x: 0, y: 0, z: 0, headingY: 0, rollAngle: 0, riderPitch: 0, hipDrop: 0,
    speed: 0, cause: 'sideFall', intoSolid: false, side: 1 }, tuning, DT);
  for (let step = 0; step < 180; step += 1) {
    rag.step(DT, step * DT, 0, 0, sampler, empty, tuning);
    for (const [origin, end] of [[RD_HIP_L, RD_FOOT_L], [RD_HIP_R, RD_FOOT_R]]) assert.ok(distance(rag.positions, origin, end) >= .389, 'the protective leg is not a closed curl');
    for (const [origin, end] of [[RD_SHOULDER_L, RD_HAND_L], [RD_SHOULDER_R, RD_HAND_R]]) assert.ok(distance(rag.positions, origin, end) >= .225, 'the protective arm keeps an open fold');
  }
  assert.ok(distance(rag.positions, RD_HAND_L, RD_HAND_R) > .3, 'protective hands occupy their own sides');
});

test('the coherent projection does not multiply terrain and obstacle queries', () => {
  let grounds = 0, rays = 0;
  const sampler: TerrainSampler = { sampleGround(_x, _z, out) { grounds += 1; out.height = 0; return out; }, raycast() { return null; }, raycastObstacle() { rays += 1; return null; } };
  const rag = new CrashRagdoll();
  rag.seed({ x: 0, y: 0, z: 0, headingY: 0, rollAngle: 0, riderPitch: 0, hipDrop: 0,
    speed: 8, cause: 'sideFall', intoSolid: false, side: 1 }, tuning, DT);
  rag.step(DT, 0, 0, 0, sampler, empty, tuning);
  // Twelve particle/limb samples plus one actual flat support sample for
  // each of the three common core compounds; no normal refinement needed.
  assert.equal(grounds, 15); assert.ok(rays <= 15);
});

test('a newly armed external crash never interpolates inactive or previous-crash particle history', () => {
  const controller = new EucController(new PlanTerrainSampler(flat), { spawn: flat.spawn }), before = createPose(), after = createPose(), draw = createPose();
  controller.writePose(before);
  before.ragdoll.fill(-1000);
  assert.equal(controller.hardKnock(1, 0), true);
  controller.step(DT, NEUTRAL_ACTIONS); controller.writePose(after);
  for (const alpha of [.01, .5, .99]) {
    lerpPose(before, after, alpha, draw);
    assert.deepEqual(draw.ragdoll, after.ragdoll, 'an inactive particle block has no interpolation authority');
  }
  assert.ok(after.ragdollBlend > 0 && after.ragdollBlend < 1);
  assert.equal(RIDER_BLOCKOUT.torsoLength, .5);
});

test('a rotated wedge, living body and sloped ground retain final clearance together', () => {
  const solids: BoxCollider[] = [
    { centre: { x: .8, y: 9, z: 0 }, halfExtents: { x: .15, y: 9, z: 30 }, rotationY: .6, surface: 'pavement' },
    { centre: { x: 0, y: 9, z: .8 }, halfExtents: { x: 30, y: 9, z: .15 }, rotationY: -.6, surface: 'pavement' },
  ];
  const field = flat.heightfield, heights = field.heights.map((_value, index) =>
    .12 * (field.originX + index % field.columns * field.spacing) + .08 * (field.originZ + Math.floor(index / field.columns) * field.spacing));
  const sampler = new PlanTerrainSampler({ ...flat, solids, heightfield: { ...field, heights } });
  const bodies = [{ x: .3, z: .55, headingY: .4, halfWidthMetres: .18, halfLengthMetres: .18, minY: 0, maxY: 1.6 }];
  for (const headingY of [.1, .7, 1.3]) for (const side of [-1, 1]) {
    const a = new CrashRagdoll(), b = new CrashRagdoll();
    const seed = { x: 0, y: 0, z: -.3, headingY, rollAngle: -.1, riderPitch: .15, hipDrop: .1,
      speed: 9, cause: 'sideFall' as const, intoSolid: true, side };
    a.seed(seed, tuning, DT); b.seed(seed, tuning, DT);
    for (let step = 0; step < 300; step += 1) {
      a.step(DT, step * DT, 0, -.3, sampler, empty, tuning, bodies);
      b.step(DT, step * DT, 0, -.3, sampler, empty, tuning, bodies);
      assert.deepEqual(a.positions, b.positions, 'a wedged contact remains deterministic'); coherent(a.positions);
      for (let index = 0; index < 11; index += 1) {
        const x = a.positions[index * 3], y = a.positions[index * 3 + 1], z = a.positions[index * 3 + 2];
        assert.ok(y >= .12 * x + .08 * z + .049, `${headingY}/${side}/${step}/${index}: later horizontal contact invalidated sloped ground`);
        for (const box of solids) {
          const lx = (x - box.centre.x) * Math.cos(box.rotationY) - (z - box.centre.z) * Math.sin(box.rotationY);
          const lz = (x - box.centre.x) * Math.sin(box.rotationY) + (z - box.centre.z) * Math.cos(box.rotationY);
          assert.ok(Math.abs(lx) >= box.halfExtents.x - 1e-7 || Math.abs(lz) >= box.halfExtents.z - 1e-7 || y >= 18,
            `${headingY}/${side}/${step}/${index}: rotated solid penetration`);
        }
        for (const body of bodies) {
          const lx = (x - body.x) * Math.cos(body.headingY) - (z - body.z) * Math.sin(body.headingY);
          const lz = (x - body.x) * Math.sin(body.headingY) + (z - body.z) * Math.cos(body.headingY);
          assert.ok(Math.abs(lx) >= body.halfWidthMetres - 1e-7 || Math.abs(lz) >= body.halfLengthMetres - 1e-7 || y >= body.maxY,
            `${headingY}/${side}/${step}/${index}: later contact invalidated a living face`);
        }
      }
    }
    const before = a.positions.slice(); a.step(DT, 2.5, 0, -.3, sampler, empty, tuning, bodies);
    assert.ok(a.positions.every((value, index) => Math.abs(value - before[index]) < .02), 'a wedged fall settles before recovery');
  }
});

test('native replay copies the coherent frame while contact scratch is rebuilt for the next step', () => {
  const sampler = new PlanTerrainSampler(flat), a = new CrashRagdoll(), b = new CrashRagdoll();
  a.seed({ x: 0, y: 0, z: 0, headingY: .7, rollAngle: .4, riderPitch: -.1, hipDrop: .1,
    speed: 8, cause: 'sideFall', intoSolid: false, side: 1 }, tuning, DT);
  b.seed({ x: 8, y: 0, z: 10, headingY: -.7, rollAngle: -.4, riderPitch: .1, hipDrop: 0,
    speed: 0, cause: 'stepOff', intoSolid: false, side: -1 }, tuning, DT);
  for (let step = 0; step < 80; step += 1) a.step(DT, step * DT, 0, 0, sampler, empty, tuning);
  b.copyStateFrom(a);
  for (let step = 80; step < 100; step += 1) {
    a.step(DT, step * DT, 0, 0, sampler, empty, tuning); b.step(DT, step * DT, 0, 0, sampler, empty, tuning);
    assert.deepEqual(a.positions, b.positions);
  }
});

test('final verification catches a later correction through a previously unhit static face', () => {
  const solids: BoxCollider[] = [
    { centre: { x: .95, y: .95, z: 0 }, halfExtents: { x: .12, y: .95, z: 10 }, rotationY: .5, surface: 'pavement' },
    { centre: { x: 0, y: .95, z: .66 }, halfExtents: { x: 10, y: .95, z: .12 }, rotationY: -.42, surface: 'pavement' },
  ];
  const run = (disableGuard: boolean) => {
    const sampler = new PlanTerrainSampler({ ...flat, solids }), rag = new CrashRagdoll(); let rays = 0, maximumRays = 0;
    const ray = sampler.raycastObstacle.bind(sampler);
    sampler.raycastObstacle = (...args) => { rays += 1; return ray(...args); };
    rag.seed({ x: 0, y: 0, z: -.3, headingY: .47, rollAngle: 0, riderPitch: .05, hipDrop: 0,
      speed: 9, cause: 'sideFall', intoSolid: true, side: -1 }, tuning, DT);
    // A failing control removes only the bounded final predicate. The real
    // integration, contact queries, shape solve and responses still execute.
    if (disableGuard) (rag as unknown as { finalContactsClear(): boolean }).finalContactsClear = () => true;
    for (let step = 0; step < 300; step += 1) {
      rays = 0; rag.step(DT, step * DT, 0, -.3, sampler, empty, tuning); maximumRays = Math.max(maximumRays, rays);
      for (let index = 0; index < 7; index += 1) for (const box of solids) {
        const x = rag.positions[index * 3] - box.centre.x, z = rag.positions[index * 3 + 2] - box.centre.z;
        const lx = x * Math.cos(box.rotationY) - z * Math.sin(box.rotationY), lz = x * Math.sin(box.rotationY) + z * Math.cos(box.rotationY);
        if (Math.abs(lx) < box.halfExtents.x - 1e-7 && Math.abs(lz) < box.halfExtents.z - 1e-7 && rag.positions[index * 3 + 1] < 1.9)
          return { entered: true, maximumRays };
      }
    }
    return { entered: false, maximumRays };
  };
  const production = run(false);
  assert.equal(production.entered, false);
  assert.ok(production.maximumRays <= 22, 'final verification is one bounded seven-trunk/four-corrected-endpoint sweep');
  // The native wedge remains a trajectory tripwire. Its old failing-control
  // receipt is preserved; changing hip momentum can avoid that exact route.
  // This current witness drives the real later shoulder response into an
  // earlier unhit wall, with valid reach and one coherent trunk throughout.
  for(const side of [-1,1]) {
    const sampler=new PlanTerrainSampler({...flat,solids:[
      {centre:{x:side*.5,y:1.5,z:0},halfExtents:{x:.1,y:1.5,z:10},rotationY:0,surface:'pavement'},
      {centre:{x:0,y:1.5,z:.45},halfExtents:{x:10,y:1.5,z:.1},rotationY:0,surface:'pavement'},
    ]}),rag=new CrashRagdoll();
    rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:.1,speed:0,cause:'sideFall',intoSolid:false,side},tuning,DT);
    const internal=rag as unknown as {previous:Float64Array;stepStart:Float64Array;meetStaticParticle(index:number,sampler:TerrainSampler,t:typeof tuning):void;finalLegsClear():boolean;finalContactsClear(sampler:TerrainSampler,bodies:readonly never[]):boolean};
    internal.stepStart.set(rag.positions);internal.previous.set(rag.positions);
    for(let index=0;index<7;index++){rag.positions[index*3]+=side*.6;rag.positions[index*3+2]+=.38;}
    internal.meetStaticParticle(side>0?RD_SHOULDER_L:RD_SHOULDER_R,sampler,tuning);
    coherent(rag.positions);assert.equal(internal.finalLegsClear(),true);
    assert.ok(rag.positions[2]>.35&&rag.positions[2]<.55,'the actual normal-only response entered the second finite wall');
    assert.equal(internal.finalContactsClear(sampler,[]),false);
    internal.finalContactsClear=()=>true;
    assert.equal(internal.finalContactsClear(sampler,[]),true,'removing only the final predicate admits the real invalid contact composition');
  }
});


test('normal-only terminal slide is recertified against a second static face', () => {
  for(const side of [-1,1]) {
    const solids: BoxCollider[]=[
      {centre:{x:side*.38,y:1.5,z:0},halfExtents:{x:.1,y:1.5,z:10},rotationY:0,surface:'pavement'},
      {centre:{x:0,y:1.5,z:.45},halfExtents:{x:10,y:1.5,z:.1},rotationY:0,surface:'pavement'},
    ];
    const sampler=new PlanTerrainSampler({...flat,solids}),rag=new CrashRagdoll(),end=side>0?RD_HAND_L:RD_HAND_R,b=end*3;
    rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side},tuning,DT);
    const internal=rag as unknown as {previous:Float64Array;stepStart:Float64Array;meetStaticParticle(index:number,sampler:TerrainSampler,t:typeof tuning):void;finalTerminalContactsClear(sampler:TerrainSampler):boolean;finalContactsClear(sampler:TerrainSampler,bodies:readonly never[]):boolean};
    rag.positions.set([side*.2,1.2,.2],b);internal.stepStart.set(rag.positions);internal.previous.set(rag.positions);
    rag.positions.set([side*.4,1.2,.42],b);internal.meetStaticParticle(end,sampler,tuning);
    assert.ok(Math.abs(rag.positions[b])<.28&&rag.positions[b+2]>.35,'the real primary normal response clears one face and enters the other');
    assert.equal(internal.finalTerminalContactsClear(sampler),false,'a corrected wrist must not be published inside the second face');
    assert.equal(internal.finalContactsClear(sampler,[]),false);
    internal.finalTerminalContactsClear=()=>true;
    assert.equal(internal.finalContactsClear(sampler,[]),true,'removing only the endpoint guard admits the real second-face penetration');
  }
});

test('descending a roof edge uses the full3D endpoint sweep instead of tunnelling below it', () => {
  const sampler=new PlanTerrainSampler({...flat,solids:[{centre:{x:0,y:.4,z:0},halfExtents:{x:.5,y:.1,z:.5},rotationY:0,surface:'pavement'}]}),rag=new CrashRagdoll();
  rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},tuning,DT);
  const internal=rag as unknown as {previous:Float64Array;stepStart:Float64Array;meetStaticParticle(index:number,sampler:TerrainSampler,t:typeof tuning):void};
  rag.positions.set([.185,.9,0],RD_FOOT_L*3);internal.stepStart.set(rag.positions);internal.previous.set(rag.positions);
  rag.positions.set([.185,.2,0],RD_FOOT_L*3);internal.meetStaticParticle(RD_FOOT_L,sampler,tuning);
  assert.ok(rag.positions[RD_FOOT_L*3+1]>=.57,'pure vertical descent must stop above the low obstacle roof');
});

test('exactly vertical overextended hands and feet remain finite after physical reach repair', () => {
  const rag=new CrashRagdoll();rag.seed({x:0,y:0,z:0,headingY:.8,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},tuning,DT);
  const internal=rag as unknown as {repairMaximumReach(end:number,x:number,z:number,top:number):void};
  for(const [origin,end,reach] of [[RD_SHOULDER_L,RD_HAND_L,.54],[RD_SHOULDER_R,RD_HAND_R,.54],[RD_HIP_L,RD_FOOT_L,.78],[RD_HIP_R,RD_FOOT_R,.78]])for(const direction of [-1,1]) {
    const h=origin*3,f=end*3;rag.positions.set([rag.positions[h],rag.positions[h+1]+direction*2,rag.positions[h+2]],f);
    internal.repairMaximumReach(end,100,100,-100);
    assert.ok(rag.positions.every(Number.isFinite),'zero horizontal length cannot divide the endpoint intoNaN');
    assert.ok(distance(rag.positions,origin,end)<=reach*RIDER_BLOCKOUT.ragdollMaxReach+1e-9);
  }
});

test('reachable hands and feet displaced by a coherent wheel slide are repaired and finally certified', () => {
  const rag=new CrashRagdoll();rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},tuning,DT);
  const internal=rag as unknown as {repairMaximumReach(end:number,x:number,z:number,top:number):void;finalWheelTerminalsClear(x:number,z:number,top:number):boolean};
  rag.positions.fill(10);
  for(const [origin,end,side] of [[RD_SHOULDER_L,RD_HAND_L,1],[RD_SHOULDER_R,RD_HAND_R,-1],[RD_HIP_L,RD_FOOT_L,1],[RD_HIP_R,RD_FOOT_R,-1]]) {
    rag.positions.set([side*.5,.6,0],origin*3);rag.positions.set([side*.07,.3,0],end*3);
  }
  assert.equal(internal.finalWheelTerminalsClear(0,0,.9),false,'reachable anatomy alone admits a terminal inside the fallen wheel');
  for(const [origin,end,maximum] of [[RD_SHOULDER_L,RD_HAND_L,.54],[RD_SHOULDER_R,RD_HAND_R,.54],[RD_HIP_L,RD_FOOT_L,.78],[RD_HIP_R,RD_FOOT_R,.78]]) {
    internal.repairMaximumReach(end,0,0,.9);
    const f=end*3;assert.ok(Math.hypot(rag.positions[f],rag.positions[f+2])>=RIDER_BLOCKOUT.ragdollWheelClearance-1e-8);
    assert.ok(distance(rag.positions,origin,end)<=maximum*RIDER_BLOCKOUT.ragdollMaxReach+1e-8);
    assert.equal(rag.positions[f+1],.3,'the feasible circle repair preserves contact height');
  }
  assert.equal(internal.finalWheelTerminalsClear(0,0,.9),true);
  rag.positions[RD_FOOT_R*3]=-.08;
  assert.equal(internal.finalWheelTerminalsClear(0,0,.9),false,'a later static/body response must be refused if it reenters the wheel');
});

test('private native copies skip only two inactive rag owners, retaining blend-zero onset and active rollback', () => {
  const a=new EucController(new PlanTerrainSampler(flat),{spawn:flat.spawn}),b=new EucController(new PlanTerrainSampler(flat),{spawn:flat.spawn});
  const target=b as unknown as {ragdoll:{copyStateFrom(source:unknown):void}};
  const copy=target.ragdoll.copyStateFrom.bind(target.ragdoll);let copies=0;
  target.ragdoll.copyStateFrom=(source)=>{copies++;copy(source);};
  b.copyMutableStateFrom(a);assert.equal(copies,0);
  assert.equal(a.hardKnock(1,0),true);const p=createPose();a.writePose(p);assert.equal(p.ragdollBlend,0);
  b.copyMutableStateFrom(a);assert.equal(copies,1,'the seeded onset owns history even before its first positive blend');
  const after=createPose();b.writePose(after);assert.deepEqual(after.ragdoll,p.ragdoll);assert.deepEqual(after.ragdollJointPoles,p.ragdollJointPoles);
  a.reset();b.copyMutableStateFrom(a);assert.equal(copies,2,'active destination rollback must copy the inactive source state');
  b.copyMutableStateFrom(a);assert.equal(copies,2);
});


test('a distance-only sampler retains its positional response and cannot inherit a stale normal', () => {
  const sampler=new PlanTerrainSampler({...flat,solids:[{centre:{x:0,y:.4,z:0},halfExtents:{x:.5,y:.1,z:.5},rotationY:0,surface:'pavement'}]}),ray=sampler.raycastObstacle.bind(sampler),rag=new CrashRagdoll();
  sampler.raycastObstacle=(origin,direction,maximum,width,lateral)=>ray(origin,direction,maximum,width,lateral);
  rag.seed({x:0,y:0,z:0,headingY:0,rollAngle:0,riderPitch:0,hipDrop:0,speed:0,cause:'sideFall',intoSolid:false,side:1},tuning,DT);
  const internal=rag as unknown as {stepStart:Float64Array;previous:Float64Array;obstacleHit:{normal:{x:number;y:number;z:number}};meetStaticParticle(index:number,sampler:TerrainSampler,t:typeof tuning):void};
  rag.positions.set([.185,.9,0],RD_FOOT_L*3);internal.stepStart.set(rag.positions);internal.previous.set(rag.positions);
  internal.obstacleHit.normal.x=1;internal.obstacleHit.normal.y=internal.obstacleHit.normal.z=0;
  rag.positions.set([.185,.2,0],RD_FOOT_L*3);internal.meetStaticParticle(RD_FOOT_L,sampler,tuning);
  assert.ok(rag.positions[RD_FOOT_L*3+1]>=.57);assert.equal(rag.positions[RD_FOOT_L*3],.185);
});
