/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { EUC, PHYSICS, RAGDOLL_BOOT_GROUND_BOX, RAGDOLL_HAND_GROUND_BOX, RAGDOLL_PARTICLE_RADII, RAGDOLL_TRUNK_WEIGHTS, RIDER_OCCUPANCY, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import { solveRagdollLimb, ragdollLegReachMinimum, ragdollBootGroundSupport, transportRagdollLegPole, type BootBox } from '../shared/ragdollBoot.ts';
import { contactCapsuleOverlapsBox, contactOrientedBoxContact, contactOrientedBoxSupport } from '../shared/ragdollContact.ts';
import { RagdollLimbContact,ragdollJointGroundSupport } from '../shared/ragdollLimbContact.ts';
import { capRagdollFrameRotation, projectRagdollHipDirection } from '../shared/ragdollHip.ts';
import type { GroundSample, ObstacleHit, ObstacleInitialExit, RagdollObstacleQuery, TerrainSampler, Vec3 } from './world.ts';
import { copyGroundSample, createGroundSample } from './world.ts';
import type { SoftBodyField } from './softBodies.ts';

/**
 * The crash-only active ragdoll (M15).
 *
 * `docs/PLANS.md` §15's Option B, built exactly as audited: a verlet particle
 * body that exists *only while the controller is in the `crashing` state*, in
 * plain scalar math with no `three` import (invariant 1), colliding with the
 * world through the same two doors the wheel already uses — `sampleGround`
 * for the ground and the swept `raycastObstacle` for authored solids
 * (invariant 3). There is still no second *gameplay* body: nothing here feeds
 * back into speed, heading, recovery timing, scoring, or any other question
 * the referee asks. The particles are where the rider's limbs visibly are,
 * and that is the entire contract, the same one the scripted separation had.
 *
 * **Deterministic by construction.** Fixed-step verlet with a fixed iteration
 * order and no randomness: two identical crash entries produce bit-identical
 * tumbles, so a frozen `advance(n)` still reaches the same frame every run
 * and the variety players see comes from real entry state — speed, lean,
 * cause, terrain — which no two crashes genuinely share.
 *
 * **Active, not limp.** A weak pull draws each hand in front of its shoulder
 * and each foot below its hip — `EUC_RIDER_MOTION_REFERENCE.md` §16's "arms
 * protect body" — and heavy damping settles the body into a held,
 * folded rest pose well before manual recovery opens. That pull
 * is the difference between funny and creepy, and it is also what keeps the
 * tone non-graphic: the owner's standing answer (2026-08-11) is no blood,
 * and comedy carried by pose rather than by violence.
 *
 * The skeleton is eleven particles — pelvis, chest, head, a hip pair, a
 * shoulder pair, hands and feet — because that is the smallest set that
 * carries a full orientation frame (the hip and shoulder bars) plus the four
 * limb endpoints the render rig's existing two-bone solvers need as targets.
 * Elbows and knees deliberately do not exist here: the rig maps endpoints
 * through bounded, body-relative two-bone chains. Contacts never independently
 * deform the trunk: a trunk contact translates its coherent frame, retaining
 * the contacted particle's impulse as torque in the next Verlet step.
 */

// -- Particle layout ---------------------------------------------------------
// Indices into the flat position arrays, x/y/z interleaved. The order is part
// of the pose contract: `render/ridingRig.ts` reads the same indices.
export const RD_PELVIS = 0;
export const RD_CHEST = 1;
export const RD_HEAD = 2;
export const RD_HIP_L = 3;
export const RD_HIP_R = 4;
export const RD_SHOULDER_L = 5;
export const RD_SHOULDER_R = 6;
export const RD_HAND_L = 7;
export const RD_HAND_R = 8;
export const RD_FOOT_L = 9;
export const RD_FOOT_R = 10;
export const RAGDOLL_PARTICLES = 11;
/** Floats in a ragdoll pose block: eleven particles, three components each. */
export const RAGDOLL_FLOATS = RAGDOLL_PARTICLES * 3;

// -- Skeleton dimensions -----------------------------------------------------
// Derived from the same `RIDER_BLOCKOUT` numbers the render skeleton is built
// from, so the constraint lengths and the rig's bone lengths cannot drift
// apart. `rider.ts` computes the identical hip half-width.
const HIP_HALF = RIDER_BLOCKOUT.torsoWidth * 0.26;
const SHOULDER_HALF = RIDER_BLOCKOUT.shoulderHalfWidth;
const SPINE = RIDER_BLOCKOUT.torsoLength;
/** Chest-to-head-centre: the neck plus roughly half a helmet. */
const NECK = RIDER_BLOCKOUT.neckLength + 0.13;
const ARM_REACH = RIDER_BLOCKOUT.upperArmLength + RIDER_BLOCKOUT.forearmLength;
const LEG_REACH = RIDER_BLOCKOUT.thighLength + RIDER_BLOCKOUT.shinLength;
const ANKLE_Y = WHEEL.pedalHeight + RIDER_BLOCKOUT.ankleAbovePedal;

/** Contact radius per particle, metres. Blockout-scale, not anatomical. */
const RADIUS = new Float64Array(RAGDOLL_PARTICLE_RADII);

/** Independent terminal bounds need one clamp, not iterative relaxation. */
interface RagdollConstraint {
  readonly a: number;
  readonly b: number;
  readonly minimum: number;
  readonly maximum: number;
}

/**
 * The trunk has one frame rather than fourteen redundant distance links.
 * These four chains retain distinct endpoints and a bounded fold. The final
 * render solve also bounds contact-displaced endpoints; contacts have priority
 * over pulling a hand/foot back through the surface it just met.
 */
const CONSTRAINTS: readonly RagdollConstraint[] = [
  { a: RD_SHOULDER_L, b: RD_HAND_L, minimum: ARM_REACH * RIDER_BLOCKOUT.ragdollArmMinReach, maximum: ARM_REACH * RIDER_BLOCKOUT.ragdollMaxReach },
  { a: RD_SHOULDER_R, b: RD_HAND_R, minimum: ARM_REACH * RIDER_BLOCKOUT.ragdollArmMinReach, maximum: ARM_REACH * RIDER_BLOCKOUT.ragdollMaxReach },
  { a: RD_HIP_L, b: RD_FOOT_L, minimum: LEG_REACH * RIDER_BLOCKOUT.ragdollLegMinReach, maximum: LEG_REACH * RIDER_BLOCKOUT.ragdollMaxReach },
  { a: RD_HIP_R, b: RD_FOOT_R, minimum: LEG_REACH * RIDER_BLOCKOUT.ragdollLegMinReach, maximum: LEG_REACH * RIDER_BLOCKOUT.ragdollMaxReach },
];
/** Local rigid-body sites, in particle order. The fit uses mass weights 4/2.5/2 kg. */
const TRUNK_LATERAL = new Float64Array([0, 0, 0, HIP_HALF, -HIP_HALF, SHOULDER_HALF, -SHOULDER_HALF]);
const TRUNK_UP = new Float64Array([0, SPINE, SPINE + NECK, 0, 0, SPINE, SPINE]);
const TRUNK_MASS=RAGDOLL_TRUNK_WEIGHTS.reduce((sum,weight)=>sum+weight,0);
const TRUNK_CENTRE_UP=RAGDOLL_TRUNK_WEIGHTS.reduce((sum,weight,index)=>sum+weight*TRUNK_UP[index],0)/TRUNK_MASS;
const TRUNK_INERTIA_X=RAGDOLL_TRUNK_WEIGHTS.reduce((sum,weight,index)=>sum+weight*(TRUNK_UP[index]-TRUNK_CENTRE_UP)**2,0);
const TRUNK_INERTIA_Y=RAGDOLL_TRUNK_WEIGHTS.reduce((sum,weight,index)=>sum+weight*TRUNK_LATERAL[index]**2,0);
const TRUNK_INERTIA_Z=TRUNK_INERTIA_X+TRUNK_INERTIA_Y;

/**
 * A living body as the rag meets it: an upright oriented prism, heading zero
 * along +Z (a person's or a car's population hull). Structural, so this file
 * imports nothing from the population.
 */
export interface RagContactBody {
  readonly x: number;
  readonly z: number;
  readonly headingY: number;
  readonly halfWidthMetres: number;
  readonly halfLengthMetres: number;
  readonly minY: number;
  readonly maxY: number;
}
/** A person's hull is a square stand-in for a round body, no wider than this (as the population tells them apart). */
const PERSON_HALF_METRES = 0.8;
/** How fast a body come down on someone's head slides off them, m/s. */
const PERSON_SLIDE_METRES_PER_SECOND = 3;
const personSized = (body: RagContactBody): boolean => Math.abs(body.halfWidthMetres - body.halfLengthMetres) <= 1e-6
  && body.halfWidthMetres <= PERSON_HALF_METRES;

/** The tuning slice the ragdoll reads. A subset of `EucTuning`. */
export interface RagdollTuning {
  gravity: number;
  ragdollDamping: number;
  ragdollIterations: number;
  ragdollFriction: number;
  ragdollRestitution: number;
  ragdollCurlGain: number;
  ragdollTuckGain: number;
  ragdollLaunchPop: number;
  ragdollLaunchPopMax: number;
  ragdollLaunchCarry: number;
  ragdollLaunchSide: number;
  ragdollLaunchTumble: number;
  ragdollSoftDamping: number;
  /** The two unscaled launch impulses' floor and the speed they reach full at. */
  crashLaunchFloor: number;
  crashRunOutSpeed: number;
}

/** What `seed` needs to place and launch the body. All plain numbers. */
export interface RagdollSeed {
  x: number;
  y: number;
  z: number;
  headingY: number;
  rollAngle: number;
  riderPitch: number;
  /** How far the hips are below riding height already (crouch), metres. */
  hipDrop: number;
  /** Signed speed along the heading at the moment of the crash, m/s. */
  speed: number;
  cause: 'stepOff' | 'runOut' | 'sideFall' | 'faceplant';
  /** True when the wheel stopped dead against a solid (obstacle cause). */
  intoSolid: boolean;
  /** Which side the rider goes down, +1 rider-left (+X). */
  side: number;
  /** A sideways throw toward `side`, m/s, on top of the cause's own (a body
   * glancing off the person or car it hit, 2026-10-04). Absent: none. */
  glance?: number;
}

function rotateAround(block: Float64Array,b: number,ox: number,oy: number,oz: number,
  ax: number,ay: number,az: number,c: number,s: number): void {
  const x=block[b]-ox,y=block[b+1]-oy,z=block[b+2]-oz,dot=(ax*x+ay*y+az*z)*(1-c);
  block[b]=ox+x*c+(ay*z-az*y)*s+ax*dot;
  block[b+1]=oy+y*c+(az*x-ax*z)*s+ay*dot;
  block[b+2]=oz+z*c+(ax*y-ay*x)*s+az*dot;
}
function supportSphere(box: BootBox): number {
  const x=Math.max(Math.abs(box.minX),Math.abs(box.maxX)),y=Math.max(Math.abs(box.minY),Math.abs(box.maxY)),z=Math.max(Math.abs(box.minZ),Math.abs(box.maxZ));
  return Math.sqrt(x*x+y*y+z*z);
}
const BOOT_SUPPORT_SPHERE=supportSphere(RAGDOLL_BOOT_GROUND_BOX),HAND_SUPPORT_SPHERE=supportSphere(RAGDOLL_HAND_GROUND_BOX);

export class CrashRagdoll {
  /** World-space particle positions, x/y/z interleaved. Read by `writePose`. */
  readonly positions = new Float64Array(RAGDOLL_FLOATS);
  private readonly previous = new Float64Array(RAGDOLL_FLOATS);
  /** Where each particle began the current step: which living-body face it crossed. Scratch. */
  private readonly stepStart = new Float64Array(RAGDOLL_FLOATS);
  private readonly ground: GroundSample = createGroundSample();
  private readonly castOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly castDirection: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly obstacleHit: ObstacleHit = { distance: 0, halfExtentX: 0, halfExtentZ: 0, normal: { x: 0, y: 0, z: 0 }, colliderIndex: -1, inside: false, faceOffset: 0 };
  /** Rebuilt primary inside-origin faces: xyz normal, raw offset, box identity. */
  private readonly initialFaces = new Float64Array(RAGDOLL_PARTICLES * 5);
  private initialFaceMask = 0;
  private readonly initialExit: ObstacleInitialExit = { colliderIndex: -1, normal: { x: 0, y: 0, z: 0 }, faceOffset: 0, slack: RIDER_BLOCKOUT.ragdollStaticSlack };
  /** Orthonormal trunk axes (left, up, forward), copied with native replay state. */
  private readonly frame = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  private readonly stepFrame = new Float64Array(9);
  readonly jointPoles = new Float64Array(12);
  private readonly stepJointPoles = new Float64Array(12);
  private readonly legSolve = new Float64Array(37);
  private legContactsValid = true;
  private readonly trunkGroundHeight = new Float64Array(7);
  private readonly terminalCorrected = new Uint8Array(4);
  private bootHeading = 0;
  private contactSide = 1;
  private lastTrunkNormalX = 0;
  private lastTrunkNormalZ = 0;
  private trunkCorrected = false;
  private staticCorrected = false;
  /** Rebuilt per step; an angularly corrected knee keeps its canonical plane. */
  private hipProjectionMask = 0;
  /** Accepted terminal support makes contact authoritative over airborne curl. */
  private supportedTerminals = 0;
  private candidateSupportedTerminals = 0;

  /** Rebuilt finite-limb contact data. One workspace serves all four chains. */
  private readonly limbContact = new RagdollLimbContact();
  private readonly limbBoxes = new Float64Array(4 * RIDER_BLOCKOUT.ragdollContactBoxCapacity * 9);
  private readonly limbBoxCounts = new Uint8Array(4);
  private readonly limbBoxFulfilled = new Uint8Array(4);
  private readonly limbPlanes = new Float64Array(32);
  private readonly limbSamplePoints = new Float64Array(16);
  private readonly limbProposals = new Float64Array(56);
  private airLimbMask=0;
  private readonly limbContactGround: GroundSample = {...createGroundSample(),base:{height:NaN,normal:{x:NaN,y:NaN,z:NaN}}};
  private readonly limbQuery: RagdollObstacleQuery = {minX:0,maxX:0,minY:0,maxY:0,minZ:0,maxZ:0,
    records:this.limbBoxes,recordOffset:0,capacity:RIDER_BLOCKOUT.ragdollContactBoxCapacity,count:0,overflow:false,fulfilled:false};

  private readonly trunkBoxes=new Int16Array(RIDER_BLOCKOUT.ragdollContactBoxCapacity);
  private trunkBoxCount=0;
  private readonly trunkContact=new Float64Array(7);
  private readonly trunkBreaks=new Float64Array(8);
  private readonly trunkSAT=new Float64Array(12);
  private readonly trunkReaction=new Float64Array(6);
  private readonly trunkSeparations=new Float64Array(RIDER_BLOCKOUT.ragdollContactBoxCapacity*3*5);
  private readonly coreSupportPoint=new Float64Array(3);
  private readonly coreGroundContact=new Float64Array(7);
  private trunkSeparationCount=0;
  private stepTurnLimit=0;

  /** Copy positions AND Verlet history into existing storage, without allocation. */
  copyStateFrom(source: CrashRagdoll): void {
    this.positions.set(source.positions);
    this.previous.set(source.previous);
    this.frame.set(source.frame);
    this.bootHeading = source.bootHeading; this.contactSide = source.contactSide;
    this.jointPoles.set(source.jointPoles);
    this.supportedTerminals = source.supportedTerminals;
    copyGroundSample(source.ground, this.ground);
    Object.assign(this.castOrigin, source.castOrigin);
    Object.assign(this.castDirection, source.castDirection);
  }

  /** Fit the trunk once; all seven trunk points are placed on that same frame. */
  private projectTrunk(maxTurn = Infinity): void {
    const p = this.positions, f = this.frame;
    // Fit rotation from the same mass-weighted sites as translation. A head
    // or shoulder contact must contribute torque rather than only raising
    // the entire trunk while pelvis/chest remain balanced on a ledge.
    const mass = 20, offset = (9 * SPINE + 2 * (SPINE + NECK)) / mass;
    let ux = 0, uy = 0, uz = 0;
    for (let index = RD_PELVIS; index <= RD_SHOULDER_R; index += 1) {
      const weight = (index < RD_HEAD ? 4 : index === RD_HEAD ? 2 : 2.5) * (TRUNK_UP[index] - offset), b = index * 3;
      ux += weight * p[b]; uy += weight * p[b + 1]; uz += weight * p[b + 2];
    }
    let size = Math.sqrt((ux) * (ux) + (uy) * (uy) + (uz) * (uz));
    if (size < 1e-8) { ux = f[3]; uy = f[4]; uz = f[5]; } else { ux /= size; uy /= size; uz /= size; }
    // Both bars contribute. The old links admitted an arbitrary shoulder
    // inversion while the hip frame still looked perfectly valid.
    let lx = (p[9] - p[12]) / HIP_HALF + (p[15] - p[18]) / SHOULDER_HALF;
    let ly = (p[10] - p[13]) / HIP_HALF + (p[16] - p[19]) / SHOULDER_HALF;
    let lz = (p[11] - p[14]) / HIP_HALF + (p[17] - p[20]) / SHOULDER_HALF;
    let along = lx * ux + ly * uy + lz * uz;
    lx -= ux * along; ly -= uy * along; lz -= uz * along;
    size = Math.sqrt((lx) * (lx) + (ly) * (ly) + (lz) * (lz));
    if (size < 1e-8) {
      along = f[0] * ux + f[1] * uy + f[2] * uz;
      lx = f[0] - ux * along; ly = f[1] - uy * along; lz = f[2] - uz * along;
      size = Math.sqrt((lx) * (lx) + (ly) * (ly) + (lz) * (lz));
      if (size < 1e-8) {
        // The least parallel axis has a strictly nonzero perpendicular.
        lx = Math.abs(ux) < Math.abs(uz) ? 1 : 0; ly = 0; lz = lx ? 0 : 1;
        along = lx * ux + lz * uz;
        lx -= ux * along; ly -= uy * along; lz -= uz * along;
        size = Math.sqrt((lx) * (lx) + (ly) * (ly) + (lz) * (lz));
      }
    }
    lx /= size; ly /= size; lz /= size;
    f[0] = lx; f[1] = ly; f[2] = lz; f[3] = ux; f[4] = uy; f[5] = uz;
    f[6] = ly * uz - lz * uy; f[7] = lz * ux - lx * uz; f[8] = lx * uy - ly * ux;
    capRagdollFrameRotation(this.stepFrame,f,maxTurn);
    lx=f[0];ly=f[1];lz=f[2];ux=f[3];uy=f[4];uz=f[5];
    // Preserve the trunk's mass-weighted centre. Head contributes its launch
    // momentum rather than being dragged as a massless marker.
    const x = (4 * (p[0] + p[3]) + 2.5 * (p[9] + p[12] + p[15] + p[18]) + 2 * p[6]) / mass - ux * offset;
    const y = (4 * (p[1] + p[4]) + 2.5 * (p[10] + p[13] + p[16] + p[19]) + 2 * p[7]) / mass - uy * offset;
    const z = (4 * (p[2] + p[5]) + 2.5 * (p[11] + p[14] + p[17] + p[20]) + 2 * p[8]) / mass - uz * offset;
    for (let index = RD_PELVIS; index <= RD_SHOULDER_R; index += 1) { const b = index * 3, lateral = TRUNK_LATERAL[index], up = TRUNK_UP[index];
      p[b] = x + lx * lateral + ux * up; p[b + 1] = y + ly * lateral + uy * up; p[b + 2] = z + lz * lateral + uz * up; }
  }

  /** Raised-leg airborne carriage, before any world contact. A foot above its
   * hip along coherent body-up can curl over the head; low ankles keep their
   * launch carriage. Accepted near-support yields this pose preference. These
   * are angular targets for that phase, not universal anatomical guarantees.
   * Both hip responses accumulate before one mass-centred trunk update. */
  private projectHipAngles(dt: number): number {
    if(this.supportedTerminals!==0)return 0;
    const p=this.positions,v=this.previous,f=this.frame,o=this.legSolve,t=RIDER_BLOCKOUT;
    const leftUp=(p[27]-p[9])*f[3]+(p[28]-p[10])*f[4]+(p[29]-p[11])*f[5];
    const rightUp=(p[30]-p[12])*f[3]+(p[31]-p[13])*f[4]+(p[32]-p[14])*f[5];
    if(Math.max(leftUp,rightUp)<=0)return 0;
    let torqueX=0,torqueY=0,torqueZ=0,maximum=0;
    for(let side=0;side<2;side++) {
      const hip=(RD_HIP_L+side)*3,foot=(RD_FOOT_L+side)*3,at=side*3;
      for(let axis=0;axis<3;axis++)o[6+at+axis]=p[hip+axis];
      solveRagdollLimb(p[hip],p[hip+1],p[hip+2],p[foot],p[foot+1],p[foot+2],f[6],f[8],this.bootHeading,
        t.thighLength,t.shinLength,ragdollLegReachMinimum(t.thighLength,t.shinLength),LEG_REACH-1e-6,
        t.ragdollKneeVerticalBand,o,this.jointPoles,at,false,false,undefined,0,1,0,true);
      const ux=(o[0]-p[hip])/t.thighLength,uy=(o[1]-p[hip+1])/t.thighLength,uz=(o[2]-p[hip+2])/t.thighLength;
      projectRagdollHipDirection(ux*f[0]+uy*f[1]+uz*f[2],ux*f[3]+uy*f[4]+uz*f[5],ux*f[6]+uy*f[7]+uz*f[8],
        t.ragdollHipFlexMax,t.ragdollHipBackMax,t.ragdollHipSplayMax,o,18);
      // Approach the carriage boundary within the canonical angular budget;
      // a contact release must not project a whole folded leg in one tick.
      const angle=Math.min(o[24],t.ragdollLegPoleSpeed*dt);maximum=Math.max(maximum,angle);if(angle<1e-8)continue;
      const ax=o[21]*f[0]+o[22]*f[3]+o[23]*f[6],ay=o[21]*f[1]+o[22]*f[4]+o[23]*f[7],az=o[21]*f[2]+o[22]*f[5]+o[23]*f[8];
      const c=Math.cos(angle),s=Math.sin(angle);
      rotateAround(p,foot,p[hip],p[hip+1],p[hip+2],ax,ay,az,c,s);
      rotateAround(v,foot,v[hip],v[hip+1],v[hip+2],ax,ay,az,c,s);
      this.jointPoles[at]=o[33];this.jointPoles[at+1]=o[34];this.jointPoles[at+2]=o[35];
      rotateAround(this.jointPoles,at,0,0,0,ax,ay,az,c,s);
      this.hipProjectionMask|=1<<side;
      torqueX-=ax*angle*t.ragdollHipTrunkShare*.5;torqueY-=ay*angle*t.ragdollHipTrunkShare*.5;torqueZ-=az*angle*t.ragdollHipTrunkShare*.5;
    }
    if(torqueX*torqueX+torqueY*torqueY+torqueZ*torqueZ>1e-16) {
      this.applyHipTrunkTorque(torqueX,torqueY,torqueZ,dt);
      for(let side=0;side<2;side++) {
        const hip=(RD_HIP_L+side)*3,foot=(RD_FOOT_L+side)*3,at=side*3;
        for(let axis=0;axis<3;axis++)p[foot+axis]+=p[hip+axis]-o[6+at+axis];
      }
    }
    return maximum;
  }

  /** Rotate the coherent trunk once, retaining its weighted centre. The final
   * frame is capped against this step's original frame, so hip feedback cannot
   * silently double the existing body angular budget. */
  private applyHipTrunkTorque(x: number,y: number,z: number,dt: number): void {
    const f=this.frame,start=this.stepFrame,p=this.positions;
    const lx=f[0],ly=f[1],lz=f[2],ux=f[3],uy=f[4],uz=f[5],fx=f[6],fy=f[7],fz=f[8];
    const size=Math.sqrt(x*x+y*y+z*z),angle=Math.min(size,RIDER_BLOCKOUT.ragdollMaxAngularSpeed*dt),ax=x/size,ay=y/size,az=z/size,c=Math.cos(angle),s=Math.sin(angle);
    let dot=ax*ux+ay*uy+az*uz;
    let upX=ux*c+(ay*uz-az*uy)*s+ax*dot*(1-c),upY=uy*c+(az*ux-ax*uz)*s+ay*dot*(1-c),upZ=uz*c+(ax*uy-ay*ux)*s+az*dot*(1-c);
    dot=ax*lx+ay*ly+az*lz;
    let leftX=lx*c+(ay*lz-az*ly)*s+ax*dot*(1-c),leftY=ly*c+(az*lx-ax*lz)*s+ay*dot*(1-c),leftZ=lz*c+(ax*ly-ay*lx)*s+az*dot*(1-c);
    f[0]=leftX;f[1]=leftY;f[2]=leftZ;f[3]=upX;f[4]=upY;f[5]=upZ;
    f[6]=leftY*upZ-leftZ*upY;f[7]=leftZ*upX-leftX*upZ;f[8]=leftX*upY-leftY*upX;
    capRagdollFrameRotation(start,f,RIDER_BLOCKOUT.ragdollMaxAngularSpeed*dt);
    leftX=f[0];leftY=f[1];leftZ=f[2];upX=f[3];upY=f[4];upZ=f[5];
    const forwardX=f[6],forwardY=f[7],forwardZ=f[8];
    // Current sites receive the exchanged angular impulse. Keeping the old
    // Verlet orientation carries that motion into the next fixed step; rotating
    // both buffers cancelled it and left the feet upright against a wall.
    {
      const block=p;
      const cx=(4*(block[0]+block[3])+2*block[6]+2.5*(block[9]+block[12]+block[15]+block[18]))/20;
      const cy=(4*(block[1]+block[4])+2*block[7]+2.5*(block[10]+block[13]+block[16]+block[19]))/20;
      const cz=(4*(block[2]+block[5])+2*block[8]+2.5*(block[11]+block[14]+block[17]+block[20]))/20;
      for(let index=RD_PELVIS;index<=RD_SHOULDER_R;index++) {
        const b=index*3,dx=block[b]-cx,dy=block[b+1]-cy,dz=block[b+2]-cz;
        const localX=dx*lx+dy*ly+dz*lz,localY=dx*ux+dy*uy+dz*uz,localZ=dx*fx+dy*fy+dz*fz;
        block[b]=cx+leftX*localX+upX*localY+forwardX*localZ;
        block[b+1]=cy+leftY*localX+upY*localY+forwardY*localZ;
        block[b+2]=cz+leftZ*localX+upZ*localY+forwardZ*localZ;
      }
    }
  }

  /** A trunk contact translates its whole coherent body; endpoints stay free. */
  private moveContact(index: number, x: number, y: number, z: number): void {
    if (index > RD_SHOULDER_R) { this.terminalCorrected[index-RD_HAND_L]=1; const b = index * 3;
      this.positions[b] += x; this.positions[b + 1] += y; this.positions[b + 2] += z; return; }
    this.trunkCorrected = true;
    for (let part = RD_PELVIS; part <= RD_SHOULDER_R; part += 1) { const b = part * 3;
      this.positions[b] += x; this.positions[b + 1] += y; this.positions[b + 2] += z;
      this.previous[b] += x; this.previous[b + 1] += y; this.previous[b + 2] += z; }
  }

  /** Native contact stop: remove latent Verlet motion without moving a particle. */
  constrainContactVelocity(): void { this.previous.set(this.positions); }

  /** A horizontal contact stop retains the real vertical Verlet fall. */
  constrainHorizontalContactVelocity(): void {
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) { const base = index * 3;
      this.previous[base] = this.positions[base]; this.previous[base + 2] = this.positions[base + 2]; }
  }

  /** Native full-body side constraint. Every world-space particle and its
   * history moves together; vertical and outward/tangential velocity survive.
   * Refuse a proposal across authored solids or uphill ground before mutation. */
  canProjectSideContact(x: number, z: number, sampler: TerrainSampler): boolean {
    const travel = Math.sqrt((x) * (x) + (z) * (z)); if (travel === 0) return true;
    if (!Number.isFinite(travel)) throw new RangeError('Non-finite native rag contact projection');
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3, px = this.positions[base], py = this.positions[base + 1], pz = this.positions[base + 2];
      sampler.sampleGround(px, pz, this.ground); const beforeHeight = this.ground.height;
      sampler.sampleGround(px + x, pz + z, this.ground);
      if (this.ground.height > beforeHeight) return false;
      if (sampler.raycastObstacle) {
        this.castOrigin.x = px; this.castOrigin.y = py; this.castOrigin.z = pz;
        this.castDirection.x = x / travel; this.castDirection.y = 0; this.castDirection.z = z / travel;
        const hit = sampler.raycastObstacle(this.castOrigin, this.castDirection, travel + RADIUS[index], RADIUS[index]);
        if (hit !== null && hit <= travel + RADIUS[index]) return false;
      }
    }
    return true;
  }

  projectSideContact(x: number, z: number, normals: readonly { x: number; z: number }[], sampler: TerrainSampler): boolean {
    if (!this.canProjectSideContact(x, z, sampler)) return false;
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3;
      let vx = this.positions[base] - this.previous[base], vz = this.positions[base + 2] - this.previous[base + 2];
      for (const normal of normals) {
        const inward = vx * normal.x + vz * normal.z;
        if (inward < 0) { vx -= inward * normal.x; vz -= inward * normal.z; }
      }
      this.positions[base] += x; this.positions[base + 2] += z;
      this.previous[base] = this.positions[base] - vx; this.previous[base + 2] = this.positions[base + 2] - vz;
    }
    return true;
  }

  /**
   * Place the skeleton in the riding pose and hand it the crash's momentum.
   *
   * The placement is analytic — the same frame-independent chain
   * `render/ridingRig.ts` documents for `pedalEdgeWorld` — and approximate on
   * purpose: the rig blends from the rendered riding pose into the particle
   * pose over `ragdollBlendSeconds`, so a centimetre of disagreement at the
   * seed is invisible while a scene-graph readback would break the fixed
   * step's independence from the render frame.
   */
  seed(input: RagdollSeed, t: RagdollTuning, dt: number): void {
    this.supportedTerminals=0;
    this.bootHeading = input.headingY; this.contactSide = input.side || 1;
    this.jointPoles.fill(0);
    const pos = this.positions;
    const pitch = input.riderPitch + RIDER_BLOCKOUT.torsoRestPitch;
    const pitchSin = Math.sin(pitch);
    const pitchCos = Math.cos(pitch);
    const hipY = RIDER.hipHeight - input.hipDrop;

    // Local frame: +X rider-left, +Y up, +Z forward, origin at the contact
    // patch. The torso tilts forward by the action pitch; the legs stand on
    // the pedals.
    const local = (index: number, x: number, y: number, z: number): void => {
      // Lean roll about +Z: positive rolls toward +X (rider-left), matching
      // the rig's `-pose.rollAngle` rotation convention.
      const rollSin = Math.sin(input.rollAngle);
      const rollCos = Math.cos(input.rollAngle);
      const leanedX = x * rollCos + y * rollSin;
      const leanedY = y * rollCos - x * rollSin;
      // Heading about +Y: local +X maps to (cos h, -sin h), +Z to (sin h, cos h).
      const headingSin = Math.sin(input.headingY);
      const headingCos = Math.cos(input.headingY);
      const base = index * 3;
      pos[base] = input.x + leanedX * headingCos + z * headingSin;
      pos[base + 1] = input.y + leanedY;
      pos[base + 2] = input.z - leanedX * headingSin + z * headingCos;
    };

    local(RD_PELVIS, 0, hipY, 0);
    local(RD_CHEST, 0, hipY + SPINE * pitchCos, SPINE * pitchSin);
    local(RD_HEAD, 0, hipY + (SPINE + NECK) * pitchCos, (SPINE + NECK) * pitchSin);
    local(RD_HIP_L, HIP_HALF, hipY, 0);
    local(RD_HIP_R, -HIP_HALF, hipY, 0);
    const shoulderY = hipY + SPINE * pitchCos;
    const shoulderZ = SPINE * pitchSin;
    local(RD_SHOULDER_L, SHOULDER_HALF, shoulderY, shoulderZ);
    local(RD_SHOULDER_R, -SHOULDER_HALF, shoulderY, shoulderZ);
    // Hands low and slightly forward — the riding carriage, roughly.
    const handFront = input.intoSolid ? -RIDER_BLOCKOUT.ragdollSolidHandSetback : 0.10;
    local(RD_HAND_L, SHOULDER_HALF + 0.08, shoulderY - 0.35, shoulderZ + handFront);
    local(RD_HAND_R, -(SHOULDER_HALF + 0.08), shoulderY - 0.35, shoulderZ + handFront);
    local(RD_FOOT_L, RIDER_BLOCKOUT.stanceHalfWidth, ANKLE_Y, 0);
    local(RD_FOOT_R, -RIDER_BLOCKOUT.stanceHalfWidth, ANKLE_Y, 0);
    this.projectTrunk();

    // Momentum. Verlet stores velocity as `pos - prev`, so the launch is
    // written by backdating `previous`. Base carry is the ride velocity;
    // the cause shapes what happens on top of it.
    const headingSin = Math.sin(input.headingY);
    const headingCos = Math.cos(input.headingY);
    const forwardX = headingSin;
    const forwardZ = headingCos;
    // Rider-left in world, for the side shove.
    const leftX = headingCos;
    const leftZ = -headingSin;
    const speed = Math.abs(input.speed);
    const direction = input.speed >= 0 ? 1 : -1;
    const pop = Math.min(speed * t.ragdollLaunchPop, t.ragdollLaunchPopMax);
    // **How much of the two speed-blind impulses this crash has earned** — the
    // owner's 2026-08-27 ride (`data/tuning.ts`, `EUC.crashLaunchFloor`). The
    // side shove and the head-over tumble are the only launch terms with no
    // velocity in them, so they were the only ones that read the same at a
    // standstill as at forty. A ramp from the floor at rest to full at
    // `crashRunOutSpeed` leaves every speed-classified side fall exactly as it
    // was — above that speed the ramp is already 1 — and softens only the three
    // crashes that are side falls because of their *cause*.
    //
    // Guarded rather than divided blind: `crashRunOutSpeed` is on the tuning
    // table and a zero would otherwise make this `Infinity` on one step and
    // `NaN` on a crash at rest.
    const launch = t.crashRunOutSpeed > 0
      ? t.crashLaunchFloor
        + (1 - t.crashLaunchFloor) * Math.min(1, Math.max(0, speed / t.crashRunOutSpeed))
      : 1;

    let launchSpeed = 0;
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const upper = index === RD_CHEST || index === RD_HEAD
        || index === RD_SHOULDER_L || index === RD_SHOULDER_R
        || index === RD_HAND_L || index === RD_HAND_R;

      let vForward = speed * direction;
      let vUp = 0;
      let vSide = 0;

      if (input.intoSolid) {
        // The wheel stopped dead; the body did not. The upper body keeps its
        // momentum plus a head-over shove while the feet are checked with the
        // wheel — which is a forward flip, resolved by the constraints.
        vForward = upper
          ? speed * direction * t.ragdollLaunchCarry
            + direction * t.ragdollLaunchTumble * launch
          : speed * direction * 0.2;
        vUp = pop;
      } else if (input.cause === 'faceplant') {
        // The cutout (M20.1). Same head-over shove as the wall flip — the
        // torso outruns the feet and the constraints turn that into forward
        // rotation — but the feet keep over half their speed, because nothing
        // *stopped* them: the wheel merely quit holding the rider up. That
        // difference is what separates "thrown over the bars" from a cutout's
        // pitch-forward-and-plow. No side component and barely any pop: a
        // cutout goes *down*, face first, and slides.
        vForward = upper
          ? speed * direction * t.ragdollLaunchCarry
            + direction * t.ragdollLaunchTumble * launch
          : speed * direction * 0.55;
        vUp = upper ? pop * 0.35 : 0;
      } else if (input.cause === 'sideFall') {
        vForward = speed * direction * 0.8;
        vSide = input.side * t.ragdollLaunchSide * launch * (upper ? 1.3 : 0.8);
        vUp = pop * 0.6;
      } else if (input.cause === 'runOut') {
        vForward = speed * direction;
        vUp = pop * 0.4;
      } else {
        // A step-off keeps its feet; barely any launch at all.
        vForward = speed * direction * 0.9;
      }

      if (input.glance) vSide += input.side * input.glance * launch * (upper ? 1 : 0.5);
      launchSpeed = Math.max(launchSpeed, Math.sqrt((vForward) * (vForward) + (vUp) * (vUp) + (vSide) * (vSide)));

      const base = index * 3;
      this.previous[base] = pos[base] - (forwardX * vForward + leftX * vSide) * dt;
      this.previous[base + 1] = pos[base + 1] - vUp * dt;
      this.previous[base + 2] = pos[base + 2] - (forwardZ * vForward + leftZ * vSide) * dt;
    }
    if (launchSpeed > RIDER_BLOCKOUT.ragdollMaxSpeed) {
      const scale = RIDER_BLOCKOUT.ragdollMaxSpeed / launchSpeed;
      for (let index = 0; index < RAGDOLL_FLOATS; index += 1)
        this.previous[index] = pos[index] - (pos[index] - this.previous[index]) * scale;
    }
    for (let limb = 0; limb < 4; limb += 1) {
      const h = (3 + limb) * 3, f = (limb < 2 ? 9 + limb : 5 + limb) * 3, at = limb * 3;
      const sign = limb < 2 ? 1 : -1;
      this.jointPoles[at] = this.frame[6] * sign; this.jointPoles[at + 1] = this.frame[7] * sign; this.jointPoles[at + 2] = this.frame[8] * sign;
      transportRagdollLegPole(pos[f] - pos[h], pos[f + 1] - pos[h + 1], pos[f + 2] - pos[h + 2],
        input.headingY, RIDER_BLOCKOUT.ragdollKneeVerticalBand, 0, this.jointPoles, at);
    }
  }

  /**
   * One fixed step: integrate, pull the protective curl, satisfy the
   * constraints, and collide with the ground, the authored solids, and any
   * soft foliage the body has flopped into.
   */
  step(
    dt: number,
    crashTime: number,
    wheelX: number,
    wheelZ: number,
    sampler: TerrainSampler,
    soft: SoftBodyField,
    t: RagdollTuning,
    bodies: readonly RagContactBody[] = [],
    headingY = this.bootHeading,
  ): void {
    const pos = this.positions;
    const prev = this.previous;
    this.stepStart.set(pos);
    this.stepFrame.set(this.frame);
    this.stepJointPoles.set(this.jointPoles);this.stepTurnLimit=RIDER_BLOCKOUT.ragdollMaxAngularSpeed*dt;
    this.legContactsValid = true; this.terminalCorrected.fill(0);this.hipProjectionMask=0;
    this.initialFaceMask=0;this.candidateSupportedTerminals=0;this.limbBoxCounts.fill(0);this.limbBoxFulfilled.fill(0);
    this.trunkCorrected = false; this.staticCorrected = false; this.lastTrunkNormalX=0;this.lastTrunkNormalZ=0;

    // -- Integrate -----------------------------------------------------------
    // **The settle-and-hold.** From 1.4 s the damping ramps up hard and the
    // curl eases off, so the body freezes into whatever folded pose the
    // tumble left it in — still, and therefore readable and funny — well
    // before manual recovery opens at 2.5 s. Without it the protective curl
    // is a spring with no rest state and keeps a faint jiggle alive forever,
    // which reads as twitching, and twitching is not the tone.
    const settle = Math.min(1, Math.max(0, (crashTime - 1.4) / 0.7));
    const holdDamping = t.ragdollDamping + settle * 14;
    const damping = Math.max(0, 1 - holdDamping * dt);
    const softDamping = Math.max(0, 1 - (holdDamping + t.ragdollSoftDamping) * dt);
    const curlScale = (1 - settle) * dt * dt;
    const fall = -t.gravity * dt * dt;
    const pelvisBase = RD_PELVIS * 3;
    const frame = this.frame;

    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3;
      const x = pos[base];
      const y = pos[base + 1];
      const z = pos[base + 2];
      // Foliage is a cushion: a particle inside a soft body sheds velocity
      // fast, which is what lets a rider flop *into* a bush and stay there.
      const keep = soft.contains(x, y, z) ? softDamping : damping;

      // Separate carriages on the body's frame. Attracting both hands to the
      // head and both feet to the pelvis collapsed four joints onto two points.
      let ax = 0;
      let ay = fall;
      let az = 0;
      const hand = index === RD_HAND_L || index === RD_HAND_R;
      const foot = index === RD_FOOT_L || index === RD_FOOT_R;
      if (hand || foot) {
        const side = index === RD_HAND_L || index === RD_FOOT_L ? 1 : -1;
        const lateral = side * (hand ? SHOULDER_HALF + RIDER_BLOCKOUT.ragdollHandOut : HIP_HALF + RIDER_BLOCKOUT.ragdollFootOut);
        const up = hand ? SPINE + RIDER_BLOCKOUT.ragdollHandRise : -RIDER_BLOCKOUT.ragdollFootDrop;
        const front = hand ? RIDER_BLOCKOUT.ragdollHandFront : RIDER_BLOCKOUT.ragdollFootFront;
        const gain = (hand ? t.ragdollCurlGain : t.ragdollTuckGain) * curlScale;
        ax += (pos[pelvisBase] + frame[0] * lateral + frame[3] * up + frame[6] * front - x) * gain;
        ay += (pos[pelvisBase + 1] + frame[1] * lateral + frame[4] * up + frame[7] * front - y) * gain;
        az += (pos[pelvisBase + 2] + frame[2] * lateral + frame[5] * up + frame[8] * front - z) * gain;
      }

      // A hard ceiling on per-particle speed. Constraint projection does not
      // conserve energy, and against an unclimbable corner it can *add* some
      // every step; the clamp turns that worst case into a plausible thud
      // instead of a launch. The launch is scaled as one body at the same
      // ceiling, so this guard cannot erase its upper/feet speed difference.
      let vx = (x - prev[base]) * keep + ax;
      let vy = (y - prev[base + 1]) * keep + ay;
      let vz = (z - prev[base + 2]) * keep + az;
      const maxStep = RIDER_BLOCKOUT.ragdollMaxSpeed * dt;
      const squaredSpeed=vx*vx+vy*vy+vz*vz;
      if (squaredSpeed > maxStep*maxStep) {
        const scale = maxStep / Math.sqrt(squaredSpeed);
        vx *= scale;
        vy *= scale;
        vz *= scale;
      }
      pos[base] = x + vx;
      pos[base + 1] = y + vy;
      pos[base + 2] = z + vz;
      prev[base] = x;
      prev[base + 1] = y;
      prev[base + 2] = z;
    }

    // -- Constraints ---------------------------------------------------------
    this.projectTrunk(RIDER_BLOCKOUT.ragdollMaxAngularSpeed * dt);

    for (const constraint of CONSTRAINTS) {
        const aBase = constraint.a * 3;
        const bBase = constraint.b * 3;
        const dx = pos[bBase] - pos[aBase];
        const dy = pos[bBase + 1] - pos[aBase + 1];
        const dz = pos[bBase + 2] - pos[aBase + 2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < 1e-9) {
          pos[bBase] = pos[aBase] - this.frame[3] * constraint.minimum;
          pos[bBase + 1] = pos[aBase + 1] - this.frame[4] * constraint.minimum;
          pos[bBase + 2] = pos[aBase + 2] - this.frame[5] * constraint.minimum;
          continue;
        }
        const contactMinimum=constraint.b>=RD_FOOT_L?ragdollLegReachMinimum(RIDER_BLOCKOUT.thighLength,RIDER_BLOCKOUT.shinLength):RIDER_BLOCKOUT.ragdollArmContactMinReach;
        const minimum=this.supportedTerminals&(1<<(constraint.b-RD_HAND_L))?contactMinimum:constraint.minimum;
        const length = Math.max(minimum, Math.min(constraint.maximum, distance));
        if (length === distance) continue;
        const correction = (distance - length) / distance;
        pos[bBase] -= dx * correction;
        pos[bBase + 1] -= dy * correction;
        pos[bBase + 2] -= dz * correction;
    }

    this.projectHipAngles(dt);


    // -- The wheel -----------------------------------------------------------
    // A body that comes to rest *on* the machine is a body the machine's own
    // mesh hides — the first browser pass ended every wall crash with the
    // rider invisible inside the fallen wheel. The wheel is effectively
    // infinite mass here, so the shove is horizontal-only, applied to the
    // particles, and pushes the body clear rather than the wheel away. The
    // dead-centre fallback direction is a constant, so determinism holds.
    sampler.sampleGround(wheelX, wheelZ, this.ground);
    const wheelTop = this.ground.height + RIDER_BLOCKOUT.ragdollWheelTop;
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3;
      if (pos[base + 1] > wheelTop) continue;
      const dx = pos[base] - wheelX;
      const dz = pos[base + 2] - wheelZ;
      const squared=dx*dx+dz*dz;
      if (squared >= RIDER_BLOCKOUT.ragdollWheelClearance**2) continue;
      const distance = Math.sqrt(squared);
      const pushX = distance < 1e-6 ? 1 : dx / distance;
      const pushZ = distance < 1e-6 ? 0 : dz / distance;
      const out = RIDER_BLOCKOUT.ragdollWheelClearance - distance;
      this.moveContact(index, pushX * out, 0, pushZ * out);
    }

    for (let end = RD_HAND_L; end <= RD_FOOT_R; end += 1) this.repairMaximumReach(end,wheelX,wheelZ,wheelTop);

    // Living responses join the movement that the authored-solid rays see.
    if (bodies.length) this.meetBodies(bodies, dt, t, RD_PELVIS, RD_SHOULDER_R);

    // -- Authored solids -----------------------------------------------------
    // **Every particle answers walls**, and that totality is load-bearing. The
    // first pass cast only the pelvis, chest, and head; against a tall
    // building the *feet* then kept flying forward inside the wall, the leg
    // ropes hauled the hips over the pinned chest, and the constraint solver
    // pole-vaulted the body seven metres into the air (browser capture,
    // 2026-08-11). With all eleven swept against the same boxes the wheel and
    // pedals respect, the forum's "skids halfway through the fence rail"
    // closes and the vault cannot be fed.
    if (sampler.raycastObstacle !== undefined) for (let index = 0; index <= RD_SHOULDER_R; index += 1)
      this.meetStaticParticle(index,sampler,t);

    this.clearWheelTrunk(wheelX,wheelZ,wheelTop);

    // Complete coherent-body contact before committing any limb. Later body
    // translations cannot invalidate an already published ankle or elbow.
    for (let index = 0; index <= RD_SHOULDER_R; index += 1) {
      const base=index*3;
      sampler.sampleGround(pos[base],pos[base+2],this.ground);
      this.trunkGroundHeight[index]=this.ground.height;
      const floor = this.ground.height + RADIUS[index];
      if (pos[base + 1] >= floor) continue;
      // **Shallow penetrations only.** A particle whose "ground" is far above
      // it is not under the ground — it is beside a wall whose *footprint*
      // the height query answers with the roof. The first build snapped a
      // hand grazing a building's face to the top of the building, eighteen
      // metres up, and the arm ropes hauled the whole body after it. Deep
      // overlaps are the wall cast's job; the deepest honest ground
      // penetration is one clamped step plus a radius, well under this.
      if (floor - pos[base + 1] > RIDER_BLOCKOUT.ragdollGroundShallowDepth) continue;

      // Project out, reflect the small normal velocity, and take friction out
      // of the tangential motion by dragging `prev` toward `pos`.
      const verticalVelocity = pos[base + 1] - prev[base + 1];
      this.moveContact(index, 0, floor - pos[base + 1], 0);
      prev[base + 1] = floor + verticalVelocity * t.ragdollRestitution;
      const friction = Math.min(1, t.ragdollFriction * dt);
      prev[base] += (pos[base] - prev[base]) * friction;
      prev[base + 2] += (pos[base + 2] - prev[base + 2]) * friction;
    }

    const coreLift=this.coreGroundLift(sampler);if(coreLift>0){this.moveContact(RD_PELVIS,0,coreLift,0);this.coreGroundContact[4]+=coreLift;this.coreGroundContact[6]-=coreLift;}
    this.solveLimbContacts(dt,headingY,wheelX,wheelZ,wheelTop,sampler,bodies,t);

    if (!this.finalLegsClear() || !this.finalWheelTerminalsClear(wheelX,wheelZ,wheelTop) || ((this.trunkCorrected || this.staticCorrected || this.terminalCorrected[0] || this.terminalCorrected[1] || this.terminalCorrected[2] || this.terminalCorrected[3]) && !this.finalContactsClear(sampler, bodies))) {
      // A rigid body wedged between incompatible faces retains its prior
      // static-clear pose and stops the rejected motion. Current living actors
      // are still the population transaction's admission responsibility.
      // Crash/recovery clocks continue; there is no convergence loop.
      pos.set(this.stepStart); prev.set(this.stepStart); this.frame.set(this.stepFrame); this.jointPoles.set(this.stepJointPoles);
    } else {
      this.supportedTerminals=this.candidateSupportedTerminals;
      this.respondCoreGroundVelocity(t);
      if(bodies.length)this.slideLivingLimbSupport(bodies,dt);
    }
  }

  /** The same native person-top slide, applied once after the final accepted
   * endpoints. Later pose/history writes cannot erase or duplicate it. */
  private slideLivingLimbSupport(bodies:readonly RagContactBody[],dt:number):void {
    const p=this.positions,v=this.previous;
    for(let index=0;index<bodies.length;index++) {
      const body=bodies[index];if(!personSized(body))continue;
      let supported=false;for(let limb=0;limb<4;limb++)if(this.limbProposals[limb*14+12]===index+1)supported=true;
      if(!supported)continue;
      const c=Math.cos(body.headingY),s=Math.sin(body.headingY),dx=p[0]-body.x,dz=p[2]-body.z,lx=c*dx-s*dz,lz=s*dx+c*dz;
      const along=body.halfWidthMetres-Math.abs(lx)<=body.halfLengthMetres-Math.abs(lz),sign=(along?Math.sign(lx):Math.sign(lz))||1;
      const nx=along?c*sign:s*sign,nz=along?-s*sign:c*sign,least=PERSON_SLIDE_METRES_PER_SECOND*dt;
      for(let particle=0;particle<RAGDOLL_PARTICLES;particle++) {
        const b=particle*3,out=(p[b]-v[b])*nx+(p[b+2]-v[b+2])*nz;
        if(out<least){v[b]-=(least-out)*nx;v[b+2]-=(least-out)*nz;}
      }
      return;
    }
  }

  /** Endpoint and joint samples stay separate. A sampler that ignores the
   * caller's optional underlying buffer cannot silently invent flat terrain. */
  private sampleLimbPlane(limb:number,joint:boolean,x:number,z:number,sampler:TerrainSampler):boolean {
    const g=this.limbContactGround,base=g.base!;base.height=NaN;base.normal.x=NaN;base.normal.y=NaN;base.normal.z=NaN;
    sampler.sampleGround(x,z,g);
    const underlying=Number.isFinite(base.height)&&Number.isFinite(base.normal.x)&&Number.isFinite(base.normal.y)&&Number.isFinite(base.normal.z)&&base.normal.y>0;
    const n=underlying?base.normal:g.normal,height=underlying?base.height:g.height;
    const b=limb*8+(joint?4:0),points=limb*4+(joint?2:0),p=this.limbPlanes;
    const offset=n.x*x+n.y*height+n.z*z;
    const changed=Math.abs(p[b]-n.x)+Math.abs(p[b+1]-n.y)+Math.abs(p[b+2]-n.z)+Math.abs(p[b+3]-offset)>1e-8;
    p[b]=n.x;p[b+1]=n.y;p[b+2]=n.z;p[b+3]=offset;
    this.limbSamplePoints[points]=x;this.limbSamplePoints[points+1]=z;
    return changed;
  }
  private prepareLimbQuery(limb:number):RagdollObstacleQuery {
    const leg=limb<2,h=(3+limb)*3,end=(leg?9+limb:5+limb)*3,p=this.positions;
    // Root reach encloses any bounded endpoint release, not just the initial
    // distal position. The response allowance covers the one moved trunk.
    const responseEnvelope=RIDER_BLOCKOUT.ragdollContactResponseMax+2*Math.min(1,this.stepTurnLimit)*(SPINE+NECK+RIDER_BLOCKOUT.ragdollTorsoContactLateral);
    const upper=(leg?LEG_REACH:ARM_REACH)+(leg?BOOT_SUPPORT_SPHERE:HAND_SUPPORT_SPHERE)+responseEnvelope;
    const lower=(leg?RIDER_OCCUPANCY.legRadius:RIDER_OCCUPANCY.armRadius)+(leg?BOOT_SUPPORT_SPHERE:HAND_SUPPORT_SPHERE)+responseEnvelope;
    const q=this.limbQuery;
    q.minX=Math.min(p[h]-upper,p[end]-lower);q.maxX=Math.max(p[h]+upper,p[end]+lower);
    q.minY=Math.min(p[h+1]-upper,p[end+1]-lower);q.maxY=Math.max(p[h+1]+upper,p[end+1]+lower)+RIDER_BLOCKOUT.ragdollGroundShallowDepth;
    q.minZ=Math.min(p[h+2]-upper,p[end+2]-lower);q.maxZ=Math.max(p[h+2]+upper,p[end+2]+lower);
    q.recordOffset=limb*RIDER_BLOCKOUT.ragdollContactBoxCapacity*9;q.count=0;q.overflow=false;q.fulfilled=false;
    return q;
  }
  /** Living prisms join the same finite feature solve, after their existing
   * primary response. A later ankle/wrist release may not re-enter a person. */
  private appendLivingLimbBoxes(query:RagdollObstacleQuery,bodies:readonly RagContactBody[]):void {
    for(let index=0;index<bodies.length;index++) {
      const body=bodies[index],c=Math.cos(body.headingY),s=Math.sin(body.headingY),hx=body.halfWidthMetres,hz=body.halfLengthMetres;
      const x=Math.abs(c)*hx+Math.abs(s)*hz,z=Math.abs(s)*hx+Math.abs(c)*hz;
      if(body.x+x<query.minX||body.x-x>query.maxX||body.z+z<query.minZ||body.z-z>query.maxZ||body.maxY<query.minY||body.minY>query.maxY)continue;
      if(query.count>=query.capacity){query.overflow=true;return;}
      const at=query.recordOffset+query.count++*9,r=query.records;
      r[at]=-index-1;r[at+1]=body.x;r[at+2]=(body.minY+body.maxY)*.5;r[at+3]=body.z;
      r[at+4]=hx;r[at+5]=(body.maxY-body.minY)*.5;r[at+6]=hz;r[at+7]=c;r[at+8]=s;
    }
  }
  /** Exact common core compounds share the canonical coherent frame. */
  private coreContact(span:number,box:number):boolean {
    const p=this.positions,r=this.limbBoxes,t=RIDER_BLOCKOUT;
    if(span===1)return contactCapsuleOverlapsBox(p[3],p[4],p[5],p[6],p[7],p[8],RADIUS[RD_CHEST],r,box,this.trunkBreaks,this.trunkContact);
    const pelvis=span===2;
    return contactOrientedBoxContact(p[0],p[1],p[2],this.frame,0,
      -(pelvis?t.ragdollPelvisContactLateral:t.ragdollTorsoContactLateral),pelvis?t.ragdollPelvisContactLateral:t.ragdollTorsoContactLateral,
      -(pelvis?t.ragdollPelvisContactLower:t.ragdollTorsoContactEnd),pelvis?t.ragdollPelvisContactUpper:SPINE+t.ragdollTorsoContactEnd,
      -(pelvis?t.ragdollPelvisContactBack:t.ragdollTorsoContactDepth),pelvis?t.ragdollPelvisContactFront:t.ragdollTorsoContactDepth,r,box,this.trunkSAT,this.trunkContact);
  }
  private coreSeparation(span:number,nx:number,ny:number,nz:number):number {
    const p=this.positions,t=RIDER_BLOCKOUT;
    if(span===1)return Math.min(nx*p[3]+ny*p[4]+nz*p[5],nx*p[6]+ny*p[7]+nz*p[8])-RADIUS[RD_CHEST];
    const pelvis=span===2,support=contactOrientedBoxSupport(-nx,-ny,-nz,this.frame,0,
      -(pelvis?t.ragdollPelvisContactLateral:t.ragdollTorsoContactLateral),pelvis?t.ragdollPelvisContactLateral:t.ragdollTorsoContactLateral,
      -(pelvis?t.ragdollPelvisContactLower:t.ragdollTorsoContactEnd),pelvis?t.ragdollPelvisContactUpper:SPINE+t.ragdollTorsoContactEnd,
      -(pelvis?t.ragdollPelvisContactBack:t.ragdollTorsoContactDepth),pelvis?t.ragdollPelvisContactFront:t.ragdollTorsoContactDepth);
    return nx*p[0]+ny*p[1]+nz*p[2]-support;
  }
  /** Earn actual finite overlap, not a failed arbitrary support inequality. */
  private collectTrunkContacts():boolean {
    this.trunkBoxCount=0;this.trunkSeparationCount=0;this.trunkReaction.fill(0);
    const r=this.limbBoxes,t=RIDER_BLOCKOUT;let hit=false;
    for(let limb=0;limb<4;limb++)for(let index=0;index<this.limbBoxCounts[limb];index++) {
      const box=(limb*t.ragdollContactBoxCapacity+index)*9,id=r[box];if(id<0)continue;
      let seen=false;for(let old=0;old<this.trunkBoxCount;old++)if(r[this.trunkBoxes[old]]===id)seen=true;if(seen)continue;
      if(this.trunkBoxCount===this.trunkBoxes.length){this.legContactsValid=false;return false;}
      this.trunkBoxes[this.trunkBoxCount++]=box;
      for(let span=0;span<3;span++) {
        if(!this.coreContact(span,box))continue;
        const o=this.trunkContact,nx=o[0],ny=o[1],nz=o[2],c=r[box+7],s=r[box+8];
        const offset=nx*r[box+1]+ny*r[box+2]+nz*r[box+3]+Math.abs(c*nx-s*nz)*r[box+4]+Math.abs(ny)*r[box+5]+Math.abs(s*nx+c*nz)*r[box+6];
        const depth=offset-this.coreSeparation(span,nx,ny,nz);if(depth<=1e-7)continue;
        // Pay only this feature's residual after the coherent translation
        // already proposed. This avoids adding an overlapping compound twice,
        // including a roof requirement dominated by a diagonal corner response.
        // The fixed sweep is not a complete wedge solver: every retained plane
        // must still survive the cap and final independent shape checks.
        const paid=nx*this.trunkReaction[0]+ny*this.trunkReaction[1]+nz*this.trunkReaction[2];
        const amount=Math.max(0,depth+t.ragdollBootSupportSlack-paid);
        const plane=this.trunkSeparationCount++*5;this.trunkSeparations[plane]=nx;this.trunkSeparations[plane+1]=ny;this.trunkSeparations[plane+2]=nz;this.trunkSeparations[plane+3]=offset;this.trunkSeparations[plane+4]=span;
        hit=true;
        this.trunkReaction[0]+=nx*amount;this.trunkReaction[1]+=ny*amount;this.trunkReaction[2]+=nz*amount;
      }
    }
    return hit;
  }
  private finalTrunkShapesClear():boolean {
    const r=this.limbBoxes;
    for(let index=0;index<this.trunkSeparationCount;index++) {
      const q=index*5;
      if(this.coreSeparation(this.trunkSeparations[q+4],this.trunkSeparations[q],this.trunkSeparations[q+1],this.trunkSeparations[q+2])<this.trunkSeparations[q+3]-1e-5)return false;
    }
    for(let index=0;index<this.trunkBoxCount;index++)for(let span=0;span<3;span++) {
      const box=this.trunkBoxes[index];if(!this.coreContact(span,box))continue;
      const o=this.trunkContact,nx=o[0],ny=o[1],nz=o[2],c=r[box+7],s=r[box+8];
      const offset=nx*r[box+1]+ny*r[box+2]+nz*r[box+3]+Math.abs(c*nx-s*nz)*r[box+4]+Math.abs(ny)*r[box+5]+Math.abs(s*nx+c*nz)*r[box+6];
      if(offset-this.coreSeparation(span,nx,ny,nz)>1e-5)return false;
    }
    return true;
  }
  private writeCoreSupportPoint(span:number,nx:number,ny:number,nz:number):void {
    const p=this.positions,o=this.coreSupportPoint,f=this.frame,t=RIDER_BLOCKOUT;
    if(span===1) {
      const a=nx*p[3]+ny*p[4]+nz*p[5]<=nx*p[6]+ny*p[7]+nz*p[8]?3:6;
      o[0]=p[a]-nx*RADIUS[RD_CHEST];o[1]=p[a+1]-ny*RADIUS[RD_CHEST];o[2]=p[a+2]-nz*RADIUS[RD_CHEST];return;
    }
    const pelvis=span===2,left=nx*f[0]+ny*f[1]+nz*f[2],up=nx*f[3]+ny*f[4]+nz*f[5],front=nx*f[6]+ny*f[7]+nz*f[8];
    // A flat support face has no unique extremal corner. Its centre is also
    // a support point and avoids a fictitious always-left contact lever.
    const lower=pelvis?t.ragdollPelvisContactLower:t.ragdollTorsoContactEnd,upper=pelvis?t.ragdollPelvisContactUpper:SPINE+t.ragdollTorsoContactEnd,
      back=pelvis?t.ragdollPelvisContactBack:t.ragdollTorsoContactDepth,ahead=pelvis?t.ragdollPelvisContactFront:t.ragdollTorsoContactDepth;
    const x=Math.abs(left)<1e-8?0:(left>=0?-1:1)*(pelvis?t.ragdollPelvisContactLateral:t.ragdollTorsoContactLateral),
      y=Math.abs(up)<1e-8?(upper-lower)*.5:up>=0?-lower:upper,z=Math.abs(front)<1e-8?(ahead-back)*.5:front>=0?-back:ahead;
    o[0]=p[0]+f[0]*x+f[3]*y+f[6]*z;o[1]=p[1]+f[1]*x+f[4]*y+f[7]*z;o[2]=p[2]+f[2]*x+f[5]*y+f[8]*z;
  }
  /** The shape's actual support point owns its ground sample. Normal changes
   * get at most two actual-XZ resamples; no unbounded terrain-plane search.
   * This samples local terrain support, not a universal curved-surface proof. */
  private coreGroundLift(sampler:TerrainSampler):number {
    const g=this.limbContactGround,base=g.base!,o=this.coreSupportPoint,t=RIDER_BLOCKOUT,contact=this.coreGroundContact;let lift=0;
    contact[6]=-Infinity;
    for(let span=0;span<3;span++) {
      let nx=0,ny=1,nz=0,lastX=Infinity,lastZ=Infinity;
      for(let refinement=0;refinement<=t.ragdollCoreGroundRefinements;refinement++) {
        this.writeCoreSupportPoint(span,nx,ny,nz);
        if(Math.abs(o[0]-lastX)+Math.abs(o[2]-lastZ)<1e-8)break;
        lastX=o[0];lastZ=o[2];base.height=NaN;base.normal.x=NaN;base.normal.y=NaN;base.normal.z=NaN;
        sampler.sampleGround(o[0],o[2],g);
        const fulfilled=Number.isFinite(base.height)&&Number.isFinite(base.normal.x)&&Number.isFinite(base.normal.y)&&Number.isFinite(base.normal.z)&&base.normal.y>0,n=fulfilled?base.normal:g.normal,height=fulfilled?base.height:g.height;
        const need=height+t.ragdollBootSupportSlack-o[1];
        if(need<=t.ragdollGroundShallowDepth)lift=Math.max(lift,need);
        const size=Math.sqrt(n.x*n.x+n.y*n.y+n.z*n.z);if(size<1e-8||n.y<=0)break;
        nx=n.x/size;ny=n.y/size;nz=n.z/size;
        if(need<=t.ragdollGroundShallowDepth&&need>=-t.ragdollBootSupportSlack&&need>contact[6]) {
          contact[0]=nx;contact[1]=ny;contact[2]=nz;contact[3]=o[0];contact[4]=o[1];contact[5]=o[2];contact[6]=need;
        }
      }
    }
    return Math.max(0,lift);
  }
  /** One accepted rigid normal impulse at the verified compound support.
   * Positional separation is not velocity removal. The existing fit's mass
   * and inertia retain tangential carriage and its contact lever's rotation. */
  private respondCoreGroundVelocity(t:RagdollTuning):boolean {
    const contact=this.coreGroundContact,band=RIDER_BLOCKOUT.ragdollBootSupportSlack;
    // Another particle's support can dominate the common core's lift. Its
    // sampled contact is then unloaded and cannot own an airborne impulse.
    if(!Number.isFinite(contact[6])||contact[6]<-band||contact[6]>band)return false;
    const p=this.positions,v=this.previous,f=this.frame,nx=contact[0],ny=contact[1],nz=contact[2];
    let cx=0,cy=0,cz=0,vx=0,vy=0,vz=0;
    for(let index=0;index<7;index++){const b=index*3,w=RAGDOLL_TRUNK_WEIGHTS[index];cx+=w*p[b];cy+=w*p[b+1];cz+=w*p[b+2];vx+=w*(p[b]-v[b]);vy+=w*(p[b+1]-v[b+1]);vz+=w*(p[b+2]-v[b+2]);}
    cx/=TRUNK_MASS;cy/=TRUNK_MASS;cz/=TRUNK_MASS;vx/=TRUNK_MASS;vy/=TRUNK_MASS;vz/=TRUNK_MASS;
    let lx=0,ly=0,lz=0;
    for(let index=0;index<7;index++){const b=index*3,w=RAGDOLL_TRUNK_WEIGHTS[index],x=p[b]-cx,y=p[b+1]-cy,z=p[b+2]-cz,dx=p[b]-v[b]-vx,dy=p[b+1]-v[b+1]-vy,dz=p[b+2]-v[b+2]-vz;lx+=w*(y*dz-z*dy);ly+=w*(z*dx-x*dz);lz+=w*(x*dy-y*dx);}
    const ox=(lx*f[0]+ly*f[1]+lz*f[2])/TRUNK_INERTIA_X,oy=(lx*f[3]+ly*f[4]+lz*f[5])/TRUNK_INERTIA_Y,oz=(lx*f[6]+ly*f[7]+lz*f[8])/TRUNK_INERTIA_Z;
    const rx=contact[3]-cx,ry=contact[4]-cy,rz=contact[5]-cz,ax=ry*nz-rz*ny,ay=rz*nx-rx*nz,az=rx*ny-ry*nx;
    const bx=ax*f[0]+ay*f[1]+az*f[2],by=ax*f[3]+ay*f[4]+az*f[5],bz=ax*f[6]+ay*f[7]+az*f[8];
    const into=vx*nx+vy*ny+vz*nz+ox*bx+oy*by+oz*bz;if(into>=-1e-9)return false;
    const impulse=-(1+t.ragdollRestitution)*into/(1/TRUNK_MASS+bx*bx/TRUNK_INERTIA_X+by*by/TRUNK_INERTIA_Y+bz*bz/TRUNK_INERTIA_Z);
    const dx=bx*impulse/TRUNK_INERTIA_X,dy=by*impulse/TRUNK_INERTIA_Y,dz=bz*impulse/TRUNK_INERTIA_Z,
      wx=f[0]*dx+f[3]*dy+f[6]*dz,wy=f[1]*dx+f[4]*dy+f[7]*dz,wz=f[2]*dx+f[5]*dy+f[8]*dz,linear=impulse/TRUNK_MASS;
    for(let index=0;index<7;index++){const b=index*3,x=p[b]-cx,y=p[b+1]-cy,z=p[b+2]-cz;v[b]-=nx*linear+wy*z-wz*y;v[b+1]-=ny*linear+wz*x-wx*z;v[b+2]-=nz*linear+wx*y-wy*x;}
    return true;
  }

  private storeLimbFailure(limb:number,reaction:Float64Array):false {
    const out=limb*14;this.limbProposals[out+9]=0;for(let i=0;i<4;i++)this.limbProposals[out+10+i]=reaction[i];return false;
  }
  /** A sampled, clear finite-solid envelope plus terminal circumsphere proves
   * clearance without building presentation bases. Near support still uses
   * the exact oriented solve. This cache lives only within this proposal. */
  private writeAirLimbProposal(limb:number,wheelX:number,wheelZ:number,wheelTop:number):boolean {
    const p=this.positions,h=(3+limb)*3,end=(limb<2?9+limb:5+limb)*3,leg=limb<2,t=RIDER_BLOCKOUT;
    const dx=p[end]-p[h],dy=p[end+1]-p[h+1],dz=p[end+2]-p[h+2],reach=dx*dx+dy*dy+dz*dz;
    const minimum=leg?Math.abs(t.thighLength-t.shinLength)+2e-6:t.ragdollArmContactMinReach+1e-6,maximum=(leg?LEG_REACH:ARM_REACH)-2e-6;
    if(reach<minimum*minimum||reach>maximum*maximum)return false;
    const wheelDX=p[end]-wheelX,wheelDZ=p[end+2]-wheelZ;
    if(p[end+1]<=wheelTop&&wheelDX*wheelDX+wheelDZ*wheelDZ<t.ragdollWheelClearance*t.ragdollWheelClearance-1e-7)return false;
    const n=this.limbPlanes,b=limb*8,j=b+4,o=this.legSolve,band=2*t.ragdollBootSupportSlack;
    const jointRadius=ragdollJointGroundSupport(leg);
    const jointGap=n[j]*o[0]+n[j+1]*o[1]+n[j+2]*o[2]-n[j+3]-jointRadius;
    if(jointGap<=band)return false;
    const endpointGap=n[b]*p[end]+n[b+1]*p[end+1]+n[b+2]*p[end+2]-n[b+3],sphere=leg?BOOT_SUPPORT_SPHERE:HAND_SUPPORT_SPHERE;
    const squaredNormal=n[b]*n[b]+n[b+1]*n[b+1]+n[b+2]*n[b+2];
    if(endpointGap<=band||(endpointGap-band)**2<=sphere*sphere*squaredNormal)return false;
    // The gather box permits any bounded release, so a nearby actor can be
    // gathered while wholly outside this actual triangle. Enclosing both
    // bones and the terminal preserves the exact native proposal in that
    // clear case; an overlapping enclosure still needs the finite solve.
    if(this.limbBoxCounts[limb]&&!this.airLimbBoxesClear(limb))return false;
    const out=limb*14;
    for(let i=0;i<3;i++){this.limbProposals[out+i]=o[i];this.limbProposals[out+3+i]=p[end+i];this.limbProposals[out+6+i]=o[33+i];}
    this.limbProposals[out+9]=1;this.limbProposals[out+10]=endpointGap-sphere*Math.sqrt(squaredNormal);this.limbProposals[out+11]=jointGap;this.limbProposals[out+12]=0;this.limbProposals[out+13]=0;
    this.airLimbMask|=1<<limb;return true;
  }
  private airLimbBoxesClear(limb:number):boolean {
    const p=this.positions,o=this.legSolve,h=(3+limb)*3,end=(limb<2?9+limb:5+limb)*3,leg=limb<2,
      radius=(leg?RIDER_OCCUPANCY.legRadius:RIDER_OCCUPANCY.armRadius)+RIDER_BLOCKOUT.ragdollBootSupportSlack,
      terminal=(leg?BOOT_SUPPORT_SPHERE:HAND_SUPPORT_SPHERE)+RIDER_BLOCKOUT.ragdollBootSupportSlack;
    const minX=Math.min(p[h],o[0],p[end])-radius,maxX=Math.max(p[h],o[0],p[end])+radius,
      minY=Math.min(p[h+1],o[1],p[end+1])-radius,maxY=Math.max(p[h+1],o[1],p[end+1])+radius,
      minZ=Math.min(p[h+2],o[2],p[end+2])-radius,maxZ=Math.max(p[h+2],o[2],p[end+2])+radius;
    const records=this.limbBoxes,start=limb*RIDER_BLOCKOUT.ragdollContactBoxCapacity*9;
    for(let index=0;index<this.limbBoxCounts[limb];index++) {
      const at=start+index*9,x=records[at+1],y=records[at+2],z=records[at+3],
        hx=Math.abs(records[at+7])*records[at+4]+Math.abs(records[at+8])*records[at+6],hy=records[at+5],
        hz=Math.abs(records[at+8])*records[at+4]+Math.abs(records[at+7])*records[at+6];
      if(!(maxX<x-hx||minX>x+hx||maxY<y-hy||minY>y+hy||maxZ<z-hz||minZ>z+hz))return false;
      if(!(p[end]+terminal<x-hx||p[end]-terminal>x+hx||p[end+1]+terminal<y-hy||p[end+1]-terminal>y+hy||p[end+2]+terminal<z-hz||p[end+2]-terminal>z+hz))return false;
    }
    return true;
  }
  private storeLimbGroundFailure(limb:number,o:Float64Array):false {
    const b=limb*8,j=b+4,p=this.limbPlanes,out=limb*14,box=limb<2?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    const support=ragdollBootGroundSupport(o,box,p[b],p[b+1],p[b+2],limb<2?24:15)*p[b+1],radius=ragdollJointGroundSupport(limb<2);
    const foot=p[b+3]+support-p[b]*o[3]-p[b+1]*o[4]-p[b+2]*o[5],joint=p[j+3]+radius-p[j]*o[0]-p[j+1]*o[1]-p[j+2]*o[2],at=joint>foot?j:b;
    this.limbProposals[out+9]=0;for(let i=0;i<3;i++)this.limbProposals[out+10+i]=p[at+i];this.limbProposals[out+13]=Math.max(0,foot,joint)+RIDER_BLOCKOUT.ragdollBootSupportSlack;return false;
  }
  private writeContactProposal(limb:number,heading:number,wheelX:number,wheelZ:number,wheelTop:number,sampler:TerrainSampler):boolean {
    if(this.airLimbMask&(1<<limb))return true;
    const h=(3+limb)*3,end=(limb<2?9+limb:5+limb)*3,at=limb*3,p=this.positions,c=this.limbContact,b=limb*8;
    const slot=limb*14;this.limbProposals[slot+9]=0;for(let i=0;i<4;i++)this.limbProposals[slot+10+i]=0;
    const okay=c.solve(p[h],p[h+1],p[h+2],p[end],p[end+1],p[end+2],this.jointPoles[at],this.jointPoles[at+1],this.jointPoles[at+2],
      limb<2,heading,this.frame[6],this.frame[8],this.limbPlanes,b,this.limbPlanes,b+4,
      this.limbBoxes,limb*RIDER_BLOCKOUT.ragdollContactBoxCapacity*9,this.limbBoxCounts[limb],wheelX,wheelZ,wheelTop);
    if(!okay)return this.storeLimbFailure(limb,c.reaction);
    // New XZ has no authority from the old sampled local plane. Query it
    // explicitly. If the answer changes, spend one final bounded math solve.
    let changed=false;const o=c.pose,points=limb*4;
    if(Math.abs(o[3]-this.limbSamplePoints[points])+Math.abs(o[5]-this.limbSamplePoints[points+1])>1e-8)changed=this.sampleLimbPlane(limb,false,o[3],o[5],sampler)||changed;
    if(Math.abs(o[0]-this.limbSamplePoints[points+2])+Math.abs(o[2]-this.limbSamplePoints[points+3])>1e-8)changed=this.sampleLimbPlane(limb,true,o[0],o[2],sampler)||changed;
    if(changed) {
      const fx=o[3],fy=o[4],fz=o[5],px=o[33],py=o[34],pz=o[35];
      if(!c.solve(p[h],p[h+1],p[h+2],fx,fy,fz,px,py,pz,limb<2,heading,this.frame[6],this.frame[8],this.limbPlanes,b,this.limbPlanes,b+4,
        this.limbBoxes,limb*RIDER_BLOCKOUT.ragdollContactBoxCapacity*9,this.limbBoxCounts[limb],wheelX,wheelZ,wheelTop))return this.storeLimbFailure(limb,c.reaction);
      if(Math.abs(o[3]-this.limbSamplePoints[points])+Math.abs(o[5]-this.limbSamplePoints[points+1])>1e-8)this.sampleLimbPlane(limb,false,o[3],o[5],sampler);
      if(Math.abs(o[0]-this.limbSamplePoints[points+2])+Math.abs(o[2]-this.limbSamplePoints[points+3])>1e-8)this.sampleLimbPlane(limb,true,o[0],o[2],sampler);
      if(!this.finalLimbGroundClear(limb,o))return this.storeLimbGroundFailure(limb,o);
    }
    const out=limb*14;for(let i=0;i<6;i++)this.limbProposals[out+i]=o[i];for(let i=0;i<3;i++)this.limbProposals[out+6+i]=o[33+i];this.limbProposals[out+9]=1;
    const box=limb<2?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    const support=ragdollBootGroundSupport(o,box,this.limbPlanes[b],this.limbPlanes[b+1],this.limbPlanes[b+2],limb<2?24:15)*this.limbPlanes[b+1];
    this.limbProposals[out+10]=this.limbPlanes[b]*o[3]+this.limbPlanes[b+1]*o[4]+this.limbPlanes[b+2]*o[5]-this.limbPlanes[b+3]-Math.max(limb<2?RADIUS[RD_FOOT_L]:RADIUS[RD_HAND_L],support);
    const radius=ragdollJointGroundSupport(limb<2);
    this.limbProposals[out+11]=this.limbPlanes[b+4]*o[0]+this.limbPlanes[b+5]*o[1]+this.limbPlanes[b+6]*o[2]-this.limbPlanes[b+7]-radius;
    this.limbProposals[out+12]=c.livingTopSupport()+1;
    return true;
  }
  private finalLimbGroundClear(limb:number,o:Float64Array):boolean {
    const p=this.limbPlanes,b=limb*8,j=b+4,box=limb<2?RAGDOLL_BOOT_GROUND_BOX:RAGDOLL_HAND_GROUND_BOX;
    const support=ragdollBootGroundSupport(o,box,p[b],p[b+1],p[b+2],limb<2?24:15)*p[b+1];
    const radius=ragdollJointGroundSupport(limb<2);
    return p[b]*o[3]+p[b+1]*o[4]+p[b+2]*o[5]>=p[b+3]+support-1e-5&&p[j]*o[0]+p[j+1]*o[1]+p[j+2]*o[2]>=p[j+3]+radius-1e-5;
  }
  /** Local proposals, at most one coherent reaction, then final four commits.
   * Artistic pole transport is performed once; hard contact does not spend or
   * fractionally clamp that guidance budget. */
  private solveLimbContacts(dt:number,heading:number,wheelX:number,wheelZ:number,wheelTop:number,sampler:TerrainSampler,bodies:readonly RagContactBody[],t:RagdollTuning):void {
    const p=this.positions;this.limbProposals.fill(0);this.airLimbMask=0;
    for(let limb=0;limb<4;limb++) {
      const leg=limb<2,end=leg?9+limb:5+limb,b=end*3,h=(3+limb)*3,at=limb*3;
      this.repairMaximumReach(end,wheelX,wheelZ,wheelTop);
      if(bodies.length)this.meetBodies(bodies,dt,t,end,end);
      const q=this.prepareLimbQuery(limb);
      if(sampler.raycastObstacle!==undefined)this.meetStaticParticle(end,sampler,t,q);
      this.appendLivingLimbBoxes(q,bodies);
      this.limbBoxCounts[limb]=q.count;this.limbBoxFulfilled[limb]=q.overflow?2:q.fulfilled?1:0;
      this.repairTerminalWheelContact(end,wheelX,wheelZ,wheelTop,sampler.raycastObstacle?this.obstacleHit.normal:undefined);
      transportRagdollLegPole(p[b]-p[h],p[b+1]-p[h+1],p[b+2]-p[h+2],heading,RIDER_BLOCKOUT.ragdollKneeVerticalBand,
        leg&&(this.hipProjectionMask&(1<<limb))?0:(leg?RIDER_BLOCKOUT.ragdollLegPoleSpeed:RIDER_BLOCKOUT.ragdollArmPoleSpeed)*dt,this.jointPoles,at);
      this.sampleLimbPlane(limb,false,p[b],p[b+2],sampler);
      solveRagdollLimb(p[h],p[h+1],p[h+2],p[b],p[b+1],p[b+2],this.frame[6],this.frame[8],heading,
        leg?RIDER_BLOCKOUT.thighLength:RIDER_BLOCKOUT.upperArmLength,leg?RIDER_BLOCKOUT.shinLength:RIDER_BLOCKOUT.forearmLength,
        leg?ragdollLegReachMinimum(RIDER_BLOCKOUT.thighLength,RIDER_BLOCKOUT.shinLength):RIDER_BLOCKOUT.ragdollArmContactMinReach,
        (leg?LEG_REACH:ARM_REACH)-1e-6,RIDER_BLOCKOUT.ragdollKneeVerticalBand,this.legSolve,this.jointPoles,at,true,false,undefined,0,1,0,true);
      const ground=this.limbContactGround,n=ground.normal;
      const predicted=ground.height-(n.x*(p[h]-p[b])+n.z*(p[h+2]-p[b+2]))/Math.max(1e-6,n.y);
      if(Math.abs(predicted-this.trunkGroundHeight[3+limb])<=RIDER_BLOCKOUT.ragdollGroundPlaneTolerance) {
        const plane=limb*8,points=limb*4;
        for(let i=0;i<4;i++)this.limbPlanes[plane+4+i]=this.limbPlanes[plane+i];
        this.limbSamplePoints[points+2]=this.legSolve[0];this.limbSamplePoints[points+3]=this.legSolve[2];
      } else this.sampleLimbPlane(limb,true,this.legSolve[0],this.legSolve[2],sampler);
      if(sampler.raycastObstacle===undefined||this.limbBoxFulfilled[limb]===1)this.writeAirLimbProposal(limb,wheelX,wheelZ,wheelTop);
    }
    let failed=this.collectTrunkContacts(),tx=this.trunkReaction[0],ty=this.trunkReaction[1],tz=this.trunkReaction[2],rx=0,ry=0,rz=0;
    const cx=(4*(p[0]+p[3])+2*p[6]+2.5*(p[9]+p[12]+p[15]+p[18]))/20,
      cy=(4*(p[1]+p[4])+2*p[7]+2.5*(p[10]+p[13]+p[16]+p[19]))/20,cz=(4*(p[2]+p[5])+2*p[8]+2.5*(p[11]+p[14]+p[17]+p[20]))/20;
    for(let limb=0;limb<4;limb++) {
      const out=limb*14;
      if(this.limbBoxFulfilled[limb]===2) {
        const out=limb*14;this.limbProposals[out+9]=0;for(let i=0;i<4;i++)this.limbProposals[out+10+i]=0;
      }
      if(this.limbBoxFulfilled[limb]===2||!this.writeContactProposal(limb,heading,wheelX,wheelZ,wheelTop,sampler)) {
        failed=true;const nx=this.limbProposals[out+10],ny=this.limbProposals[out+11],nz=this.limbProposals[out+12],depth=this.limbProposals[out+13];
        const h=(3+limb)*3,lx=p[h]-cx,ly=p[h+1]-cy,lz=p[h+2]-cz,
          ax=ly*nz-lz*ny,ay=lz*nx-lx*nz,az=lx*ny-ly*nx,denominator=1+ax*ax+ay*ay+az*az;
        const amount=Math.min(RIDER_BLOCKOUT.ragdollContactResponseMax,depth)/denominator;
        tx+=nx*amount;ty+=ny*amount;tz+=nz*amount;rx+=ax*amount;ry+=ay*amount;rz+=az*amount;
      }
    }
    if(failed&&(tx*tx+ty*ty+tz*tz+rx*rx+ry*ry+rz*rz)>1e-12) {
      const distance=Math.sqrt(tx*tx+ty*ty+tz*tz),scale=distance>RIDER_BLOCKOUT.ragdollContactResponseMax?RIDER_BLOCKOUT.ragdollContactResponseMax/distance:1;
      this.moveContact(RD_PELVIS,tx*scale,ty*scale,tz*scale);
      if(rx*rx+ry*ry+rz*rz>1e-12)this.applyHipTrunkTorque(rx,ry,rz,dt);
      // The rigid response precedes every limb commit. Re-sample the seven
      // moved body sites before its one shallow support correction; a cached
      // plane at the old XZ has no authority after this translation/rotation.
      let lift=0;
      for(let index=0;index<=RD_SHOULDER_R;index++) {
        const b=index*3;sampler.sampleGround(p[b],p[b+2],this.ground);
        this.trunkGroundHeight[index]=this.ground.height;
        const need=this.ground.height+RADIUS[index]-p[b+1];if(need<=RIDER_BLOCKOUT.ragdollGroundShallowDepth)lift=Math.max(lift,need);
      }
      lift=Math.max(lift,this.coreGroundLift(sampler));
      if(lift>0){this.moveContact(RD_PELVIS,0,lift,0);this.coreGroundContact[4]+=lift;this.coreGroundContact[6]-=lift;}
      // Any coherent response changes every root. No initial clear-air
      // certificate or cached basis survives it.
      this.airLimbMask=0;this.limbProposals.fill(0);
      failed=false;
      for(let limb=0;limb<4;limb++) {
        const end=(limb<2?9+limb:5+limb)*3;
        this.sampleLimbPlane(limb,false,p[end],p[end+2],sampler);
        const h=(3+limb)*3,at=limb*3;
        solveRagdollLimb(p[h],p[h+1],p[h+2],p[end],p[end+1],p[end+2],this.frame[6],this.frame[8],heading,
          limb<2?RIDER_BLOCKOUT.thighLength:RIDER_BLOCKOUT.upperArmLength,limb<2?RIDER_BLOCKOUT.shinLength:RIDER_BLOCKOUT.forearmLength,
          limb<2?ragdollLegReachMinimum(RIDER_BLOCKOUT.thighLength,RIDER_BLOCKOUT.shinLength):RIDER_BLOCKOUT.ragdollArmContactMinReach,
          (limb<2?LEG_REACH:ARM_REACH)-1e-6,RIDER_BLOCKOUT.ragdollKneeVerticalBand,this.legSolve,this.jointPoles,at,false,false,undefined,0,1,0,true);
        this.sampleLimbPlane(limb,true,this.legSolve[0],this.legSolve[2],sampler);
        if(this.limbBoxFulfilled[limb]===2) {
        const out=limb*14;this.limbProposals[out+9]=0;for(let i=0;i<4;i++)this.limbProposals[out+10+i]=0;
      }
      if(this.limbBoxFulfilled[limb]===2||!this.writeContactProposal(limb,heading,wheelX,wheelZ,wheelTop,sampler))failed=true;
      }
    }
    if(failed||!this.finalTrunkShapesClear()){this.legContactsValid=false;return;}
    for(let limb=0;limb<4;limb++) {
      const out=limb*14,end=(limb<2?9+limb:5+limb),b=end*3,at=limb*3;
      const x=this.limbProposals[out+3],y=this.limbProposals[out+4],z=this.limbProposals[out+5];
      if(Math.abs(x-p[b])+Math.abs(y-p[b+1])+Math.abs(z-p[b+2])>1e-8) {
        this.terminalCorrected[end-RD_HAND_L]=1;
        // Positional release is not additional launch velocity; retain the
        // existing tangential motion and remove only inward normal motion.
        const plane=limb*8,nx=this.limbPlanes[plane],ny=this.limbPlanes[plane+1],nz=this.limbPlanes[plane+2];
        let vx=p[b]-this.previous[b],vy=p[b+1]-this.previous[b+1],vz=p[b+2]-this.previous[b+2],into=vx*nx+vy*ny+vz*nz;
        if(into<0){vx-=into*(1+t.ragdollRestitution)*nx;vy-=into*(1+t.ragdollRestitution)*ny;vz-=into*(1+t.ragdollRestitution)*nz;}
        this.previous[b]=x-vx;this.previous[b+1]=y-vy;this.previous[b+2]=z-vz;
      }
      p[b]=x;p[b+1]=y;p[b+2]=z;for(let i=0;i<3;i++)this.jointPoles[at+i]=this.limbProposals[out+6+i];
      if(this.limbProposals[out+12]>0||Math.min(this.limbProposals[out+10],this.limbProposals[out+11])<=RIDER_BLOCKOUT.ragdollBootSupportSlack*2)this.candidateSupportedTerminals|=1<<(end-RD_HAND_L);
    }
  }

  /** One of the existing11 sweeps, following the actual three-dimensional path. */
  private meetStaticParticle(index: number,sampler: TerrainSampler,t: RagdollTuning,limb?:RagdollObstacleQuery): void {
    const pos=this.positions,prev=this.previous;
        const requestedNormal=this.obstacleHit.normal!;requestedNormal.x=0;requestedNormal.y=0;requestedNormal.z=0;
        this.obstacleHit.inside=false;this.obstacleHit.colliderIndex=-1;this.obstacleHit.faceOffset=0;
        const base = index * 3;
        const moveX = pos[base] - this.stepStart[base];
        const moveY = pos[base + 1] - this.stepStart[base + 1];
        const moveZ = pos[base + 2] - this.stepStart[base + 2];
        const move = Math.sqrt((moveX) * (moveX) + (moveY) * (moveY) + (moveZ) * (moveZ));
        if (move < 1e-6 && limb===undefined) return;

        this.castOrigin.x = this.stepStart[base];
        this.castOrigin.y = this.stepStart[base + 1];
        this.castOrigin.z = this.stepStart[base + 2];
        this.castDirection.x = move>1e-6?moveX / move:Math.sin(this.bootHeading);
        this.castDirection.y = move>1e-6?moveY / move:0;
        this.castDirection.z = move>1e-6?moveZ / move:Math.cos(this.bootHeading);
        const hit = sampler.raycastObstacle!.call(
          sampler,
          this.castOrigin,
          this.castDirection,
          move + RADIUS[index],
          RADIUS[index],
          undefined,
          this.obstacleHit,
          undefined,
          limb,
        );
        if (hit === null) return;

        // Correct along the face normal, preserving gravity and slide along
        // its tangent. Clamping the whole ray also cancelled vertical motion
        // at a wall and left the coherent body suspended on its edge.
        let vx = pos[base] - prev[base], vy = pos[base + 1] - prev[base + 1], vz = pos[base + 2] - prev[base + 2];
        const normal = this.obstacleHit.normal!;
        if(index<=RD_SHOULDER_R&&normal.x*normal.x+normal.z*normal.z>.5){this.lastTrunkNormalX=normal.x;this.lastTrunkNormalZ=normal.z;}
        const normalAvailable=normal.x*normal.x+normal.y*normal.y+normal.z*normal.z>.5;
        if(normalAvailable) {
          const inside=(this.obstacleHit.inside as boolean)===true&&this.obstacleHit.colliderIndex!==undefined&&this.obstacleHit.colliderIndex>=0&&Number.isFinite(this.obstacleHit.faceOffset);
          if(inside) {const at=index*5;this.initialFaceMask|=1<<index;
            this.initialFaces[at]=normal.x;this.initialFaces[at+1]=normal.y;this.initialFaces[at+2]=normal.z;
            this.initialFaces[at+3]=this.obstacleHit.faceOffset!;this.initialFaces[at+4]=this.obstacleHit.colliderIndex!;}
          const signed = inside ? pos[base]*normal.x+pos[base+1]*normal.y+pos[base+2]*normal.z-this.obstacleHit.faceOffset! : (pos[base] - this.castOrigin.x - this.castDirection.x * hit) * normal.x
            + (pos[base+1] - this.castOrigin.y - this.castDirection.y * hit) * normal.y
            + (pos[base+2] - this.castOrigin.z - this.castDirection.z * hit) * normal.z;
          const outward = Math.max(0,RADIUS[index]+RIDER_BLOCKOUT.ragdollStaticSlack-signed);
          this.moveContact(index,normal.x*outward,normal.y*outward,normal.z*outward);
        } else {
          // Older TerrainSampler doubles provide distance only. Keep their
          // conservative scalar response instead of treating a zero/stale
          // optional normal as a face that needs no position correction.
          const allowed=Math.max(0,hit-RADIUS[index]-RIDER_BLOCKOUT.ragdollStaticSlack);
          this.moveContact(index,this.castOrigin.x+this.castDirection.x*allowed-pos[base],
            this.castOrigin.y+this.castDirection.y*allowed-pos[base+1],this.castOrigin.z+this.castDirection.z*allowed-pos[base+2]);
        }
        if (normal.x * normal.x + normal.y * normal.y + normal.z * normal.z > .5) {
          const into = vx * normal.x + vy * normal.y + vz * normal.z;
          if (into < 0) { vx -= into * (1 + t.ragdollRestitution) * normal.x; vy -= into * (1 + t.ragdollRestitution) * normal.y; vz -= into * (1 + t.ragdollRestitution) * normal.z; }
          prev[base] = pos[base] - vx; prev[base + 1] = pos[base + 1] - vy; prev[base + 2] = pos[base + 2] - vz;
        } else {
          prev[base] = pos[base] + this.castDirection.x * move * t.ragdollRestitution;
          prev[base + 1] = pos[base + 1] + this.castDirection.y * move * t.ragdollRestitution;
          prev[base + 2] = pos[base + 2] + this.castDirection.z * move * t.ragdollRestitution;
        }
        this.staticCorrected = true;
  }

  private legReachable(foot: number): boolean {
    const p = this.positions, h = (foot === RD_FOOT_L ? RD_HIP_L : RD_HIP_R) * 3, f = foot * 3;
    const dx = p[f] - p[h], dy = p[f + 1] - p[h + 1], dz = p[f + 2] - p[h + 2], squared = dx * dx + dy * dy + dz * dz;
    const minimum = ragdollLegReachMinimum(RIDER_BLOCKOUT.thighLength, RIDER_BLOCKOUT.shinLength), maximum = LEG_REACH - 1e-6;
    return squared >= minimum * minimum && squared <= maximum * maximum;
  }
  private finalLegsClear(): boolean {
    return this.legContactsValid && this.legReachable(RD_FOOT_L) && this.legReachable(RD_FOOT_R)
      && this.armReachable(RD_HAND_L) && this.armReachable(RD_HAND_R);
  }
  /** A coherent body trapped against a face slides clear of the fallen wheel.
   * Both signed circle-exit candidates are analytic; final casts certify the
   * selected translation before any pose is published. */
  private clearWheelTrunk(wheelX: number,wheelZ: number,wheelTop: number): void {
    const p=this.positions,radius=RIDER_BLOCKOUT.ragdollWheelClearance;
    let tx=this.lastTrunkNormalZ,tz=-this.lastTrunkNormalX,size=Math.sqrt((tx) * (tx) + (tz) * (tz));
    if(size<1e-8){tx=Math.cos(this.bootHeading);tz=-Math.sin(this.bootHeading);}else{tx/=size;tz/=size;}
    let positive=0,negative=0,touches=false;
    for(let index=0;index<=RD_SHOULDER_R;index+=1){
      const b=index*3;if(p[b+1]>wheelTop)continue;
      const dx=p[b]-wheelX,dz=p[b+2]-wheelZ,squared=dx*dx+dz*dz,dot=dx*tx+dz*tz;
      if(squared<radius*radius-1e-8)touches=true;
      const discriminant=dot*dot+radius*radius-squared;if(discriminant<0)continue;
      const exit=Math.sqrt(discriminant);positive=Math.max(positive,-dot+exit);negative=Math.min(negative,-dot-exit);
    }
    if(!touches)return;
    const left=tx*Math.cos(this.bootHeading)-tz*Math.sin(this.bootHeading);
    const amount=Math.abs(positive)<Math.abs(negative)-1e-8?positive:Math.abs(negative)<Math.abs(positive)-1e-8?negative:
      this.contactSide*left>=0?positive:negative;
    const x=tx*amount,z=tz*amount;this.trunkCorrected=true;this.terminalCorrected.fill(1);
    for(let index=0;index<RAGDOLL_PARTICLES;index+=1){const b=index*3;
      p[b]+=x;p[b+2]+=z;this.previous[b]+=x;this.previous[b+2]+=z;}

  }

  /** A bounded endpoint projection, before its existing world sweep. */
  private repairMaximumReach(end: number, wheelX: number, wheelZ: number, wheelTop: number): void {
    const pos=this.positions;
      const leg = end === RD_FOOT_L || end === RD_FOOT_R;
    const h = (leg ? end - 6 : end - 2) * 3, b = end * 3;
      const maximum = (leg ? LEG_REACH : ARM_REACH) * RIDER_BLOCKOUT.ragdollMaxReach;
      let dy = pos[b + 1] - pos[h + 1]; const dx = pos[b] - pos[h], dz = pos[b + 2] - pos[h + 2];
      const overreach = dx * dx + dy * dy + dz * dz > maximum * maximum;
      const wheelDX = pos[b] - wheelX, wheelDZ = pos[b + 2] - wheelZ;
      const radius = RIDER_BLOCKOUT.ragdollWheelClearance;
      if (!overreach && (pos[b + 1] > wheelTop || wheelDX * wheelDX + wheelDZ * wheelDZ >= radius * radius)) return;
      const horizontal = Math.sqrt((dx) * (dx) + (dz) * (dz));
      if (Math.abs(dy) >= maximum) {
        const scale = maximum / Math.sqrt((horizontal) * (horizontal) + (dy) * (dy)); dy *= scale; pos[b + 1] = pos[h + 1] + dy;
      }
      let reach = Math.sqrt(Math.max(0, maximum * maximum - dy * dy));
      let x = overreach ? pos[h] + (horizontal>1e-9?dx*reach/horizontal:0) : pos[b];
      let z = overreach ? pos[h + 2] + (horizontal>1e-9?dz*reach/horizontal:0) : pos[b + 2];
      if (pos[b + 1] <= wheelTop && Math.sqrt((x - wheelX) * (x - wheelX) + (z - wheelZ) * (z - wheelZ)) < RIDER_BLOCKOUT.ragdollWheelClearance) {
        const hx = pos[h] - wheelX, hz = pos[h + 2] - wheelZ, distance = Math.sqrt((hx) * (hx) + (hz) * (hz));
        const closest = Math.abs(distance - RIDER_BLOCKOUT.ragdollWheelClearance);
        if (closest >= maximum || distance < 1e-9) return;
        if (reach < closest + 1e-6) {
          reach = closest + 1e-6; dy = Math.sign(dy) * Math.sqrt(maximum * maximum - reach * reach);
          pos[b + 1] = pos[h + 1] + dy;
        }
        const cosine = (distance * distance + RIDER_BLOCKOUT.ragdollWheelClearance * RIDER_BLOCKOUT.ragdollWheelClearance - reach * reach) / (2 * distance * RIDER_BLOCKOUT.ragdollWheelClearance);
        const direction = Math.atan2(pos[b + 2] - wheelZ, pos[b] - wheelX), hipDirection = Math.atan2(hz, hx);
        let angle = Math.atan2(Math.sin(direction - hipDirection), Math.cos(direction - hipDirection));
        const limit = Math.acos(Math.max(-1, cosine)); angle = Math.max(-limit, Math.min(limit, angle));
        x = wheelX + RIDER_BLOCKOUT.ragdollWheelClearance * Math.cos(hipDirection + angle); z = wheelZ + RIDER_BLOCKOUT.ragdollWheelClearance * Math.sin(hipDirection + angle);
      }
      pos[b] = x; pos[b + 2] = z; this.terminalCorrected[end-RD_HAND_L]=1;
  }

  /** A primary wall normal can shorten a previously wheel-clear terminal.
   * Leave that face along either analytic circle-exit tangent, retaining its
   * plane. The existing final endpoint sweep checks any other face crossed. */
  private repairTerminalWheelContact(end: number,wheelX: number,wheelZ: number,wheelTop: number,normal?: Vec3): void {
    const p=this.positions,b=end*3,radius=RIDER_BLOCKOUT.ragdollWheelClearance,dx=p[b]-wheelX,dz=p[b+2]-wheelZ,squared=dx*dx+dz*dz;
    if(p[b+1]>wheelTop||squared>=radius*radius-1e-7)return;
    if(!normal||(normal.x*normal.x+normal.z*normal.z)<.5) {this.repairMaximumReach(end,wheelX,wheelZ,wheelTop);return;}
    const tx=normal.z,tz=-normal.x,dot=dx*tx+dz*tz,exit=Math.sqrt(Math.max(0,dot*dot+radius*radius-squared));
    const h=(end>=RD_FOOT_L?end-6:end-2)*3,maximum=(end>=RD_FOOT_L?LEG_REACH:ARM_REACH)-2e-6,dy=p[b+1]-p[h+1];
    let best=Infinity,bestX=0,bestY=0,bestZ=0;
    for(let sign=-1;sign<=1;sign+=2) {
      const amount=-dot+sign*exit,x=p[b]+tx*amount,z=p[b+2]+tz*amount,horizontal=(x-p[h])**2+(z-p[h+2])**2;
      if(horizontal>=maximum*maximum)continue;
      const vertical=Math.sqrt(maximum*maximum-horizontal),y=p[h+1]+Math.max(-vertical,Math.min(vertical,dy)),rise=y-p[b+1],score=amount*amount+rise*rise;
      if(Math.abs(normal.y)>1e-8&&Math.abs(rise)>1e-8)continue;
      if(score<best){best=score;bestX=x;bestY=y;bestZ=z;}
    }
    if(best===Infinity)return;
    this.previous[b]+=bestX-p[b];this.previous[b+1]+=bestY-p[b+1];this.previous[b+2]+=bestZ-p[b+2];
    p[b]=bestX;p[b+1]=bestY;p[b+2]=bestZ;this.terminalCorrected[end-RD_HAND_L]=1;
  }

  /** Later wall/body normal responses must not put a repaired terminal back
   * inside the wheel. Four squared-distance checks spend no world queries. */
  private finalWheelTerminalsClear(wheelX: number,wheelZ: number,wheelTop: number): boolean {
    const p=this.positions,radius=RIDER_BLOCKOUT.ragdollWheelClearance;
    for(let end=RD_HAND_L;end<=RD_FOOT_R;end+=1){
      const b=end*3,dx=p[b]-wheelX,dz=p[b+2]-wheelZ;
      if(p[b+1]<=wheelTop && dx*dx+dz*dz<radius*radius-1e-7)return false;
    }
    return true;
  }

  private armReachable(hand: number): boolean {
    const p=this.positions,h=(hand===RD_HAND_L?RD_SHOULDER_L:RD_SHOULDER_R)*3,f=hand*3;
    const squared=(p[f]-p[h])**2+(p[f+1]-p[h+1])**2+(p[f+2]-p[h+2])**2;
    return squared >= RIDER_BLOCKOUT.ragdollArmContactMinReach**2 && squared <= (ARM_REACH-1e-6)**2;
  }
  /** Corrected tangential motion may enter a second, non-nearest face. */
  private finalParticleStaticClear(index: number,sampler: TerrainSampler,travel: number): boolean {
    let exit: ObstacleInitialExit|undefined;
    if(this.initialFaceMask&(1<<index)) {
      const at=index*5;exit=this.initialExit;exit.normal.x=this.initialFaces[at];exit.normal.y=this.initialFaces[at+1];exit.normal.z=this.initialFaces[at+2];
      exit.faceOffset=this.initialFaces[at+3];exit.colliderIndex=this.initialFaces[at+4];
    }
    const hit=sampler.raycastObstacle!.call(sampler,this.castOrigin,this.castDirection,travel,RADIUS[index],undefined,undefined,exit);
    return hit===null||hit>=travel-1e-7;
  }

  private finalTerminalContactsClear(sampler: TerrainSampler): boolean {
    const pos=this.positions,start=this.stepStart,ray=sampler.raycastObstacle;
    if(ray!==undefined)for(let index=RD_HAND_L;index<=RD_FOOT_R;index+=1) {
      if(!this.terminalCorrected[index-RD_HAND_L])continue;
      const b=index*3,dx=pos[b]-start[b],dy=pos[b+1]-start[b+1],dz=pos[b+2]-start[b+2],travel=Math.sqrt((dx) * (dx) + (dy) * (dy) + (dz) * (dz));
      if(travel<1e-7)continue;
      this.castOrigin.x=start[b];this.castOrigin.y=start[b+1];this.castOrigin.z=start[b+2];
      this.castDirection.x=dx/travel;this.castDirection.y=dy/travel;this.castDirection.z=dz/travel;
      if(!this.finalParticleStaticClear(index,sampler,travel))return false;
    }
    return true;
  }

  /** One bounded final verification catches a translation through an earlier no-hit face. */
  private finalContactsClear(sampler: TerrainSampler, bodies: readonly RagContactBody[]): boolean {
    const pos = this.positions, start = this.stepStart, ray = sampler.raycastObstacle;
    if (this.trunkCorrected && ray !== undefined) {
      for (let index = RD_PELVIS; index <= RD_SHOULDER_R; index += 1) {
        const b = index * 3, dx = pos[b] - start[b], dy = pos[b + 1] - start[b + 1], dz = pos[b + 2] - start[b + 2], travel = Math.sqrt((dx) * (dx) + (dy) * (dy) + (dz) * (dz));
        if (travel < 1e-7) continue;
        this.castOrigin.x = start[b]; this.castOrigin.y = start[b + 1]; this.castOrigin.z = start[b + 2];
        this.castDirection.x = dx / travel; this.castDirection.y = dy / travel; this.castDirection.z = dz / travel;
        if(!this.finalParticleStaticClear(index,sampler,travel))return false;
      }
    }
    if(!this.finalTerminalContactsClear(sampler))return false;
    for (const body of bodies) {
      const sin = Math.sin(body.headingY), cos = Math.cos(body.headingY);
      for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
        const b = index * 3, radius = RADIUS[index], top = body.maxY + radius, halfX = body.halfWidthMetres + radius, halfZ = body.halfLengthMetres + radius;
        if (pos[b + 1] >= top || pos[b + 1] + radius < body.minY) continue;
        const lx = (pos[b] - body.x) * cos - (pos[b + 2] - body.z) * sin, lz = (pos[b] - body.x) * sin + (pos[b + 2] - body.z) * cos;
        if (Math.abs(lx) >= halfX - 1e-7 || Math.abs(lz) >= halfZ - 1e-7) continue;
        const px = (start[b] - body.x) * cos - (start[b + 2] - body.z) * sin, pz = (start[b] - body.x) * sin + (start[b + 2] - body.z) * cos;
        // An actor covering the prior pose is not cleared by pretending that
        // pose was free. Preserve the native entering/exit distinction; the
        // production admission must yield/recertify that current actor.
        if (Math.abs(px) < halfX && Math.abs(pz) < halfZ && start[b + 1] < top) continue;
        return false;
      }
    }
    return true;
  }

  /**
   * People and cars (2026-10-04). Every particle that moved into a living
   * body's prism this step is put back on the face it crossed, its speed into
   * that face given back as the ground's small bounce and its slide along the
   * face kept, less the ground's friction; one that came down onto the top
   * lands on it. So a body that hits someone stops at them and slides or
   * glances off rather than being reflected back the way it came, and none of
   * it passes through them. A particle already inside a body (it came down
   * onto it) is free to leave: only entering is a face.
   */
  private meetBodies(bodies: readonly RagContactBody[], dt: number, t: RagdollTuning, first=RD_PELVIS,last=RD_FOOT_R): void {
    const pos = this.positions, prev = this.previous, start = this.stepStart, keep = 1 - Math.min(1, t.ragdollFriction * dt);
    for (let index = first; index <= last; index += 1) {
      const base = index * 3, radius = RADIUS[index];
      for (const body of bodies) {
        const y = pos[base + 1], top = body.maxY + radius;
        if (y >= top || y + radius < body.minY) continue;
        const sin = Math.sin(body.headingY), cos = Math.cos(body.headingY);
        const halfX = body.halfWidthMetres + radius, halfZ = body.halfLengthMetres + radius;
        const lx = (pos[base] - body.x) * cos - (pos[base + 2] - body.z) * sin;
        const lz = (pos[base] - body.x) * sin + (pos[base + 2] - body.z) * cos;
        if (Math.abs(lx) >= halfX || Math.abs(lz) >= halfZ) continue;
        // From where it began this step: friction and bounces move `prev`.
        const px = (start[base] - body.x) * cos - (start[base + 2] - body.z) * sin;
        const pz = (start[base] - body.x) * sin + (start[base + 2] - body.z) * cos, py = start[base + 1];
        if (Math.abs(px) < halfX && Math.abs(pz) < halfZ && py < top) continue;
        // The face crossed last on the way in: the slab entry times.
        const enter = (from: number, to: number, half: number): number => Math.abs(from) < half || from === to ? -Infinity
          : (Math.sign(from) * half - from) / (to - from);
        const tx = enter(px, lx, halfX), tz = enter(pz, lz, halfZ), ty = py >= top && y < py ? (top - py) / (y - py) : -Infinity;
        let vx = pos[base] - prev[base], vy = pos[base + 1] - prev[base + 1], vz = pos[base + 2] - prev[base + 2];
        if (ty >= tx && ty >= tz) {
          // Down onto the top: the ground's own landing, on the roof.
          this.moveContact(index, 0, top - pos[base + 1], 0);
          prev[base + 1] = top + vy * t.ragdollRestitution;
          if (!personSized(body)) { prev[base] += vx * (1 - keep); prev[base + 2] += vz * (1 - keep); continue; }
          // A person's head and shoulders are no roof (review r3: a bail over
          // a worker lay on him for half a second): it slides off by the
          // nearer side at no less than a slide's pace, never thrown.
          const alongX = halfX - Math.abs(lx) <= halfZ - Math.abs(lz), sign = (alongX ? Math.sign(lx) : Math.sign(lz)) || 1;
          const normalX = alongX ? cos * sign : sin * sign, normalZ = alongX ? -sin * sign : cos * sign;
          const out = vx * normalX + vz * normalZ, least = PERSON_SLIDE_METRES_PER_SECOND * dt;
          if (out < least) { vx += (least - out) * normalX; vz += (least - out) * normalZ; }
          prev[base] = pos[base] - vx; prev[base + 1] = pos[base + 1] - vy; prev[base + 2] = pos[base + 2] - vz;
          continue;
        }
        // The crossed side's outward normal, in world axes.
        const alongX = tx >= tz, sign = alongX ? Math.sign(px) : Math.sign(pz);
        const normalX = alongX ? cos * sign : sin * sign, normalZ = alongX ? -sin * sign : cos * sign;
        const depth = alongX ? halfX - Math.abs(lx) : halfZ - Math.abs(lz);
        this.moveContact(index, normalX * (depth + 1e-4), 0, normalZ * (depth + 1e-4));
        const into = vx * normalX + vz * normalZ;
        if (into < 0) { vx -= into * (1 + t.ragdollRestitution) * normalX; vz -= into * (1 + t.ragdollRestitution) * normalZ; }
        const tangentX = vx - (vx * normalX + vz * normalZ) * normalX, tangentZ = vz - (vx * normalX + vz * normalZ) * normalZ;
        vx -= tangentX * (1 - keep); vz -= tangentZ * (1 - keep);
        prev[base] = pos[base] - vx; prev[base + 1] = pos[base + 1] - vy; prev[base + 2] = pos[base + 2] - vz;
      }
    }
  }
}

/** The `EUC` tuning slice, for callers that construct a ragdoll standalone. */
export function defaultRagdollTuning(): RagdollTuning {
  return {
    gravity: PHYSICS.gravity,
    ragdollDamping: EUC.ragdollDamping,
    ragdollIterations: EUC.ragdollIterations,
    ragdollFriction: EUC.ragdollFriction,
    ragdollRestitution: EUC.ragdollRestitution,
    ragdollCurlGain: EUC.ragdollCurlGain,
    ragdollTuckGain: EUC.ragdollTuckGain,
    ragdollLaunchPop: EUC.ragdollLaunchPop,
    ragdollLaunchPopMax: EUC.ragdollLaunchPopMax,
    ragdollLaunchCarry: EUC.ragdollLaunchCarry,
    ragdollLaunchSide: EUC.ragdollLaunchSide,
    ragdollLaunchTumble: EUC.ragdollLaunchTumble,
    ragdollSoftDamping: EUC.ragdollSoftDamping,
    crashLaunchFloor: EUC.crashLaunchFloor,
    crashRunOutSpeed: EUC.crashRunOutSpeed,
  };
}
