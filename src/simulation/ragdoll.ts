/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { EUC, PHYSICS, RIDER, RIDER_BLOCKOUT, WHEEL } from '../data/tuning.ts';
import type { GroundSample, TerrainSampler, Vec3 } from './world.ts';
import { createGroundSample } from './world.ts';
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
 * **Active, not limp.** A weak pull draws the hands toward the head and the
 * feet toward the pelvis — `EUC_RIDER_MOTION_REFERENCE.md` §16's "arms
 * protect body" — and heavy damping settles the body into a held,
 * contorted-but-comic rest pose well before manual recovery opens. That pull
 * is the difference between funny and creepy, and it is also what keeps the
 * tone non-graphic: the owner's standing answer (2026-08-11) is no blood,
 * and comedy carried by pose rather than by violence.
 *
 * The skeleton is eleven particles — pelvis, chest, head, a hip pair, a
 * shoulder pair, hands and feet — because that is the smallest set that
 * carries a full orientation frame (the hip and shoulder bars) plus the four
 * limb endpoints the render rig's existing two-bone solvers need as targets.
 * Elbows and knees deliberately do not exist here: the rig solves them
 * anatomically, so no joint can ever bend backwards no matter what the
 * particles do, which closes the "broken marionette" failure mode by
 * construction rather than by joint-limit tuning.
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

/**
 * Inverse-mass weights. A constraint moves each endpoint by its share of
 * `w / (wA + wB)`, so the torso drags the hands around rather than the hands
 * steering the torso — which is most of what makes the motion read as a body.
 */
const INV_MASS = new Float64Array([
  1 / 4, // pelvis
  1 / 4, // chest
  1 / 2, // head
  1 / 2.5, 1 / 2.5, // hips
  1 / 2.5, 1 / 2.5, // shoulders
  1, 1, // hands
  1 / 1.5, 1 / 1.5, // feet
]);

/** Contact radius per particle, metres. Blockout-scale, not anatomical. */
const RADIUS = new Float64Array([
  0.14, 0.14, 0.12,
  0.10, 0.10,
  0.10, 0.10,
  0.05, 0.05,
  0.07, 0.07,
]);

/** A distance constraint. `kind` 0 is rigid, 1 is rope (max), 2 is min. */
interface RagdollConstraint {
  readonly a: number;
  readonly b: number;
  readonly length: number;
  readonly kind: 0 | 1 | 2;
  readonly stiffness: number;
}

const brace = (a: number, b: number): number => Math.hypot(a, b);

/**
 * The constraint set, in a fixed order (determinism). The torso is a braced
 * box, the head hangs on a stiff neck with two soft stays, and the limbs are
 * ropes — free to fold, never to stretch.
 */
const CONSTRAINTS: readonly RagdollConstraint[] = [
  // The pelvic triangle.
  { a: RD_PELVIS, b: RD_HIP_L, length: HIP_HALF, kind: 0, stiffness: 1 },
  { a: RD_PELVIS, b: RD_HIP_R, length: HIP_HALF, kind: 0, stiffness: 1 },
  { a: RD_HIP_L, b: RD_HIP_R, length: 2 * HIP_HALF, kind: 0, stiffness: 1 },
  // The spine and the shoulder girdle.
  { a: RD_PELVIS, b: RD_CHEST, length: SPINE, kind: 0, stiffness: 1 },
  { a: RD_CHEST, b: RD_SHOULDER_L, length: SHOULDER_HALF, kind: 0, stiffness: 1 },
  { a: RD_CHEST, b: RD_SHOULDER_R, length: SHOULDER_HALF, kind: 0, stiffness: 1 },
  { a: RD_SHOULDER_L, b: RD_SHOULDER_R, length: 2 * SHOULDER_HALF, kind: 0, stiffness: 1 },
  // Torso volume braces, slightly soft so the trunk can twist a little.
  { a: RD_CHEST, b: RD_HIP_L, length: brace(SPINE, HIP_HALF), kind: 0, stiffness: 0.85 },
  { a: RD_CHEST, b: RD_HIP_R, length: brace(SPINE, HIP_HALF), kind: 0, stiffness: 0.85 },
  { a: RD_PELVIS, b: RD_SHOULDER_L, length: brace(SPINE, SHOULDER_HALF), kind: 0, stiffness: 0.85 },
  { a: RD_PELVIS, b: RD_SHOULDER_R, length: brace(SPINE, SHOULDER_HALF), kind: 0, stiffness: 0.85 },
  // The neck, and two soft stays that let the head loll without detaching.
  { a: RD_CHEST, b: RD_HEAD, length: NECK, kind: 0, stiffness: 1 },
  { a: RD_HEAD, b: RD_SHOULDER_L, length: brace(NECK, SHOULDER_HALF), kind: 0, stiffness: 0.4 },
  { a: RD_HEAD, b: RD_SHOULDER_R, length: brace(NECK, SHOULDER_HALF), kind: 0, stiffness: 0.4 },
  // Limbs as ropes: reach is a ceiling, folding is free.
  { a: RD_SHOULDER_L, b: RD_HAND_L, length: ARM_REACH, kind: 1, stiffness: 1 },
  { a: RD_SHOULDER_R, b: RD_HAND_R, length: ARM_REACH, kind: 1, stiffness: 1 },
  { a: RD_HIP_L, b: RD_FOOT_L, length: LEG_REACH, kind: 1, stiffness: 1 },
  { a: RD_HIP_R, b: RD_FOOT_R, length: LEG_REACH, kind: 1, stiffness: 1 },
  // Hands stay out of the torso; feet stay out of each other.
  { a: RD_HAND_L, b: RD_PELVIS, length: 0.18, kind: 2, stiffness: 0.8 },
  { a: RD_HAND_R, b: RD_PELVIS, length: 0.18, kind: 2, stiffness: 0.8 },
  { a: RD_FOOT_L, b: RD_FOOT_R, length: 0.12, kind: 2, stiffness: 0.8 },
];

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
  cause: 'stepOff' | 'runOut' | 'sideFall';
  /** True when the wheel stopped dead against a solid (obstacle cause). */
  intoSolid: boolean;
  /** Which side the rider goes down, +1 rider-left (+X). */
  side: number;
}

export class CrashRagdoll {
  /** World-space particle positions, x/y/z interleaved. Read by `writePose`. */
  readonly positions = new Float64Array(RAGDOLL_FLOATS);
  private readonly previous = new Float64Array(RAGDOLL_FLOATS);
  private readonly ground: GroundSample = createGroundSample();
  private readonly castOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly castDirection: Vec3 = { x: 0, y: 0, z: 0 };

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
    local(RD_HAND_L, SHOULDER_HALF + 0.08, shoulderY - 0.35, shoulderZ + 0.10);
    local(RD_HAND_R, -(SHOULDER_HALF + 0.08), shoulderY - 0.35, shoulderZ + 0.10);
    local(RD_FOOT_L, RIDER_BLOCKOUT.stanceHalfWidth, ANKLE_Y, 0);
    local(RD_FOOT_R, -RIDER_BLOCKOUT.stanceHalfWidth, ANKLE_Y, 0);

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
          ? speed * direction * t.ragdollLaunchCarry + direction * t.ragdollLaunchTumble
          : speed * direction * 0.2;
        vUp = pop;
      } else if (input.cause === 'sideFall') {
        vForward = speed * direction * 0.8;
        vSide = input.side * t.ragdollLaunchSide * (upper ? 1.3 : 0.8);
        vUp = pop * 0.6;
      } else if (input.cause === 'runOut') {
        vForward = speed * direction;
        vUp = pop * 0.4;
      } else {
        // A step-off keeps its feet; barely any launch at all.
        vForward = speed * direction * 0.9;
      }

      const base = index * 3;
      this.previous[base] = pos[base] - (forwardX * vForward + leftX * vSide) * dt;
      this.previous[base + 1] = pos[base + 1] - vUp * dt;
      this.previous[base + 2] = pos[base + 2] - (forwardZ * vForward + leftZ * vSide) * dt;
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
  ): void {
    const pos = this.positions;
    const prev = this.previous;

    // -- Integrate -----------------------------------------------------------
    // **The settle-and-hold.** From 1.4 s the damping ramps up hard and the
    // curl eases off, so the body freezes into whatever contorted pose the
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
    const headBase = RD_HEAD * 3;
    const pelvisBase = RD_PELVIS * 3;

    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3;
      const x = pos[base];
      const y = pos[base + 1];
      const z = pos[base + 2];
      // Foliage is a cushion: a particle inside a soft body sheds velocity
      // fast, which is what lets a rider flop *into* a bush and stay there.
      const keep = soft.contains(x, y, z) ? softDamping : damping;

      // The protective curl: hands accelerate toward the head, feet gently
      // toward the pelvis. §16's "arms protect body", as an acceleration
      // rather than a pose, so it shapes the tumble instead of fighting it.
      let ax = 0;
      let ay = fall;
      let az = 0;
      if (index === RD_HAND_L || index === RD_HAND_R) {
        ax += (pos[headBase] - x) * t.ragdollCurlGain * curlScale;
        ay += (pos[headBase + 1] - y) * t.ragdollCurlGain * curlScale;
        az += (pos[headBase + 2] - z) * t.ragdollCurlGain * curlScale;
      } else if (index === RD_FOOT_L || index === RD_FOOT_R) {
        ax += (pos[pelvisBase] - x) * t.ragdollTuckGain * curlScale;
        ay += (pos[pelvisBase + 1] - y) * t.ragdollTuckGain * curlScale;
        az += (pos[pelvisBase + 2] - z) * t.ragdollTuckGain * curlScale;
      }

      // A hard ceiling on per-particle speed. Constraint projection does not
      // conserve energy, and against an unclimbable corner it can *add* some
      // every step; the clamp turns that worst case into a plausible thud
      // instead of a launch. 15 m/s is just over the wheel's own top speed,
      // so no honest tumble ever meets it.
      let vx = (x - prev[base]) * keep + ax;
      let vy = (y - prev[base + 1]) * keep + ay;
      let vz = (z - prev[base + 2]) * keep + az;
      const stepSpeed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const maxStep = 15 * dt;
      if (stepSpeed > maxStep) {
        const scale = maxStep / stepSpeed;
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
    const iterations = Math.max(1, Math.round(t.ragdollIterations));
    for (let pass = 0; pass < iterations; pass += 1) {
      for (const constraint of CONSTRAINTS) {
        const aBase = constraint.a * 3;
        const bBase = constraint.b * 3;
        const dx = pos[bBase] - pos[aBase];
        const dy = pos[bBase + 1] - pos[aBase + 1];
        const dz = pos[bBase + 2] - pos[aBase + 2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance < 1e-9) continue;
        if (constraint.kind === 1 && distance <= constraint.length) continue;
        if (constraint.kind === 2 && distance >= constraint.length) continue;

        const wA = INV_MASS[constraint.a];
        const wB = INV_MASS[constraint.b];
        const correction = (distance - constraint.length) / distance
          * constraint.stiffness / (wA + wB);
        pos[aBase] += dx * correction * wA;
        pos[aBase + 1] += dy * correction * wA;
        pos[aBase + 2] += dz * correction * wA;
        pos[bBase] -= dx * correction * wB;
        pos[bBase + 1] -= dy * correction * wB;
        pos[bBase + 2] -= dz * correction * wB;
      }
    }

    // -- The wheel -----------------------------------------------------------
    // A body that comes to rest *on* the machine is a body the machine's own
    // mesh hides — the first browser pass ended every wall crash with the
    // rider invisible inside the fallen wheel. The wheel is effectively
    // infinite mass here, so the shove is horizontal-only, applied to the
    // particles, and pushes the body clear rather than the wheel away. The
    // dead-centre fallback direction is a constant, so determinism holds.
    sampler.sampleGround(wheelX, wheelZ, this.ground);
    const wheelTop = this.ground.height + 0.9;
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3;
      if (pos[base + 1] > wheelTop) continue;
      const dx = pos[base] - wheelX;
      const dz = pos[base + 2] - wheelZ;
      const distance = Math.hypot(dx, dz);
      if (distance >= 0.42) continue;
      const pushX = distance < 1e-6 ? 1 : dx / distance;
      const pushZ = distance < 1e-6 ? 0 : dz / distance;
      const out = (0.42 - distance) * 0.5;
      pos[base] += pushX * out;
      pos[base + 2] += pushZ * out;
    }

    // -- Ground --------------------------------------------------------------
    for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
      const base = index * 3;
      sampler.sampleGround(pos[base], pos[base + 2], this.ground);
      const floor = this.ground.height + RADIUS[index];
      if (pos[base + 1] >= floor) continue;
      // **Shallow penetrations only.** A particle whose "ground" is far above
      // it is not under the ground — it is beside a wall whose *footprint*
      // the height query answers with the roof. The first build snapped a
      // hand grazing a building's face to the top of the building, eighteen
      // metres up, and the arm ropes hauled the whole body after it. Deep
      // overlaps are the wall cast's job below; the deepest honest ground
      // penetration is one clamped step plus a radius, well under this.
      if (floor - pos[base + 1] > 0.35) continue;

      // Project out, reflect the small normal velocity, and take friction out
      // of the tangential motion by dragging `prev` toward `pos`.
      const verticalVelocity = pos[base + 1] - prev[base + 1];
      pos[base + 1] = floor;
      prev[base + 1] = floor + verticalVelocity * t.ragdollRestitution;
      const friction = Math.min(1, t.ragdollFriction * dt);
      prev[base] += (pos[base] - prev[base]) * friction;
      prev[base + 2] += (pos[base + 2] - prev[base + 2]) * friction;
    }

    // -- Authored solids -----------------------------------------------------
    // **Every particle answers walls**, and that totality is load-bearing. The
    // first pass cast only the pelvis, chest, and head; against a tall
    // building the *feet* then kept flying forward inside the wall, the leg
    // ropes hauled the hips over the pinned chest, and the constraint solver
    // pole-vaulted the body seven metres into the air (browser capture,
    // 2026-08-11). With all eleven swept against the same boxes the wheel and
    // pedals respect, the forum's "skids halfway through the fence rail"
    // closes and the vault cannot be fed.
    const raycastObstacle = sampler.raycastObstacle;
    if (raycastObstacle !== undefined) {
      for (let index = 0; index < RAGDOLL_PARTICLES; index += 1) {
        const base = index * 3;
        const moveX = pos[base] - prev[base];
        const moveZ = pos[base + 2] - prev[base + 2];
        const move = Math.hypot(moveX, moveZ);
        if (move < 1e-6) continue;

        this.castOrigin.x = prev[base];
        this.castOrigin.y = prev[base + 1];
        this.castOrigin.z = prev[base + 2];
        this.castDirection.x = moveX / move;
        this.castDirection.y = 0;
        this.castDirection.z = moveZ / move;
        const hit = raycastObstacle.call(
          sampler,
          this.castOrigin,
          this.castDirection,
          move + RADIUS[index],
          RADIUS[index],
        );
        if (hit === null) continue;

        // Clamp at the face and give back a fraction of the approach as a
        // bounce along the cast direction — the hit carries no normal, and at
        // blockout fidelity the ray is an honest enough stand-in for one.
        // The extra centimetre keeps the particle strictly outside the box
        // footprint, so the ground query above can never read its roof.
        const allowed = Math.max(0, hit - RADIUS[index] - 0.01);
        pos[base] = this.castOrigin.x + this.castDirection.x * allowed;
        pos[base + 2] = this.castOrigin.z + this.castDirection.z * allowed;
        prev[base] = pos[base] + this.castDirection.x * move * t.ragdollRestitution;
        prev[base + 2] = pos[base + 2] + this.castDirection.z * move * t.ragdollRestitution;
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
  };
}
