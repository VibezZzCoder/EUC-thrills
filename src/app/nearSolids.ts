/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { NEAR_SOLID, TERRAIN, WHEEL } from '../data/tuning.ts';
import type { EucPose } from '../simulation/EucController.ts';
import { createGroundSample, type GroundSample, type ObstacleHit, type TerrainSampler, type Vec3 } from '../simulation/world.ts';

/**
 * What the drawn rider has to be kept out of — 1.4.0 ride fixes
 * (`NEAR_SOLID` in `data/tuning.ts` holds the why and the numbers).
 *
 * **Presentation only.** Asked once per drawn frame per seat of the
 * *interpolated* pose, handed to `RidingRig.setNearSolids` before
 * `rig.apply`, and read by nothing else: no controller, pose field, digest,
 * recording or seed record sees it, so every ride on every world is
 * bit-identical with or without it. The sampler is the simulation's own
 * (invariant 3 is about the simulation asking the renderer; this is the view
 * asking the level a question about the picture).
 *
 * Two answers. `lift` raises the drawn wheel and rider until the tyre circle
 * clears the nearest climbable step edge along the heading, which is what a
 * tyre does rolling up over a nose; `faces` are the distances to an authored
 * solid in `NEAR_SOLID.directions` directions around the rider at each of
 * `NEAR_SOLID.bandHeights`, which the rig compares with its own posed body
 * and turns into a push of the drawn rider just clear of every face — at any
 * speed, from any side, on every world (the owner's second ride: a rider
 * pressing or leaning into a wall stood in it everywhere).
 */
export interface NearSolids {
  /** Vertical clearance the drawn rig needs over a step's nose, metres (≥ 0). */
  lift: number;
  /**
   * Where the drawn contact stands along the heading from the pose's, metres
   * (+ forward). Zero but at rest: a stopped rider whose tyre would sit on a
   * nose is drawn rolled off it, so his planted boot can reach the tread.
   */
  along: number;
  /**
   * Distance to a solid from the drawn root at each band height in each
   * direction, metres; Infinity for none. Entry `band * directions + i`;
   * direction `i` is `2πi / directions` round from straight ahead toward the
   * rider's left — in the rig's own frame `(sin θ, cos θ)` as `(x, z)`, +X
   * the rider's left, +Z ahead (`faceDirection`).
   */
  readonly faces: Float64Array;
  /**
   * The outward normal of the face each probe hit, world `(x, z)` pairs,
   * unit length on the ground plane; `(0, 0)` where nothing was hit. The rig
   * keeps the body behind the face itself rather than behind a plane square
   * to the probe, so a wall ahead pushes straight back.
   */
  readonly normals: Float64Array;
}

/** Direction `index` of the face probes in the rig's frame, written to `out` as `[x, z]`. */
export function faceDirection(index: number, out: [number, number]): [number, number] {
  const angle = (2 * Math.PI * index) / NEAR_SOLID.directions;
  out[0] = Math.sin(angle);
  out[1] = Math.cos(angle);
  return out;
}

export function createNearSolids(): NearSolids {
  const entries = NEAR_SOLID.bandHeights.length * NEAR_SOLID.directions;
  return {
    lift: 0,
    along: 0,
    faces: new Float64Array(entries).fill(Number.POSITIVE_INFINITY),
    normals: new Float64Array(2 * entries),
  };
}

/** Clear an answer to "nothing near": no lift, no face anywhere. */
export function clearNearSolids(out: NearSolids): NearSolids {
  out.lift = 0;
  out.along = 0;
  out.faces.fill(Number.POSITIVE_INFINITY);
  out.normals.fill(0);
  return out;
}

const TYRE_RADIUS = WHEEL.tyreDiameter / 2;
/** The controller's own step-up ceiling, derived the same way (`EucController`). */
const MAX_STEP_UP = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;

const scratchSample = createGroundSample();
const rollSample = createGroundSample();
const origin: Vec3 = { x: 0, y: 0, z: 0 };
const direction: Vec3 = { x: 0, y: 0, z: 0 };
const heights = new Float64Array(2 * NEAR_SOLID.liftSamplesPerSide + 1);
const local: [number, number] = [0, 0];
const hitNormal: Vec3 = { x: 0, y: 0, z: 0 };
const hit: ObstacleHit = { distance: 0, halfExtentX: 0, halfExtentZ: 0, normal: hitNormal };

function heightAt(sampler: TerrainSampler, x: number, z: number, sample: GroundSample): number {
  return sampler.sampleGround(x, z, sample).height;
}

/**
 * How far the drawn tyre has to rise to clear every climbable step edge it
 * overlaps, metres — the tyre's circle in the vertical plane of the heading,
 * contact patch at `(x, y, z)`.
 *
 * The ground is sampled across the tyre's diameter; a jump between two
 * neighbouring samples taller than `TERRAIN.curbThreshold` is a step, and the
 * bracket is halved until the edge is placed to a fraction of a millimetre.
 * Each edge's top corner then asks for the circle's centre to stand at
 * `top + √(r² − s²)`, `s` being the corner's distance along the heading.
 * Smooth ground never makes a jump that tall over 25 mm, so slopes, banks and
 * transitions answer 0; a face taller than the controller's step-up is a wall,
 * not a nose, and answers 0 as well (the standoff and the cast own walls).
 *
 * Exported for the node pins; allocation-free.
 */
export function tyreStepLift(
  sampler: TerrainSampler,
  x: number,
  y: number,
  z: number,
  forwardX: number,
  forwardZ: number,
): number {
  const perSide = NEAR_SOLID.liftSamplesPerSide;
  const spacing = TYRE_RADIUS / perSide;
  for (let index = 0; index <= 2 * perSide; index += 1) {
    const s = (index - perSide) * spacing;
    heights[index] = heightAt(sampler, x + forwardX * s, z + forwardZ * s, scratchSample);
  }
  let centre = y + TYRE_RADIUS;
  const needed = centre;
  for (let index = 0; index < 2 * perSide; index += 1) {
    const a = heights[index];
    const b = heights[index + 1];
    if (Math.abs(b - a) <= TERRAIN.curbThreshold) continue;
    // Bisect toward the jump: `near` keeps the low side's height, `far` the
    // high side's, and their positions close in on the riser between them.
    let lowS = (index - perSide) * spacing;
    let highS = lowS + spacing;
    let low = a;
    let high = b;
    if (a > b) {
      [lowS, highS] = [highS, lowS];
      [low, high] = [high, low];
    }
    for (let halving = 0; halving < NEAR_SOLID.edgeBisections; halving += 1) {
      const midS = (lowS + highS) / 2;
      const mid = heightAt(sampler, x + forwardX * midS, z + forwardZ * midS, scratchSample);
      if (Math.abs(mid - low) <= Math.abs(high - mid)) {
        lowS = midS;
        low = mid;
      } else {
        highS = midS;
        high = mid;
      }
    }
    // A jump that does not survive the bracket closing is a slope, not a step.
    if (high - low <= TERRAIN.curbThreshold) continue;
    const rise = high - y;
    if (rise <= 0 || rise > MAX_STEP_UP + 1e-6) continue;
    // The corner is the high side's last point before the riser.
    const s = Math.abs(highS);
    if (s >= TYRE_RADIUS) continue;
    centre = Math.max(centre, high + Math.sqrt(TYRE_RADIUS * TYRE_RADIUS - s * s));
  }
  return Math.min(MAX_STEP_UP, Math.max(0, centre - needed));
}

/**
 * The shortest roll along the heading, either way and at most a tyre radius,
 * that leaves a stopped tyre no more than `NEAR_SOLID.restLiftMax` of lift
 * while it is still on the ground it stopped on; 0 if no such roll exists.
 */
function restingRoll(sampler: TerrainSampler, pose: EucPose, forwardX: number, forwardZ: number): number {
  const settles = (along: number): boolean => {
    const x = pose.x + forwardX * along;
    const z = pose.z + forwardZ * along;
    return Math.abs(heightAt(sampler, x, z, rollSample) - pose.y) <= TERRAIN.curbThreshold
      && tyreStepLift(sampler, x, pose.y, z, forwardX, forwardZ) <= NEAR_SOLID.restLiftMax;
  };
  let best = 0;
  const spacing = TYRE_RADIUS / NEAR_SOLID.liftSamplesPerSide;
  for (const direction of [-1, 1]) {
    // Outward in the lift's own spacing to the first roll that settles (the
    // far end may already be off the tread), then halve back toward it.
    let high = 0;
    for (let step = 1; step <= NEAR_SOLID.liftSamplesPerSide; step += 1) {
      if (settles(direction * step * spacing)) {
        high = step * spacing;
        break;
      }
    }
    if (high === 0) continue;
    let low = high - spacing;
    for (let halving = 0; halving < NEAR_SOLID.edgeBisections + 2; halving += 1) {
      const mid = (low + high) / 2;
      if (settles(direction * mid)) high = mid;
      else low = mid;
    }
    if (best === 0 || high < Math.abs(best)) best = direction * high;
  }
  return best;
}

/**
 * Fill `out` for one drawn pose. A rider in the air, crashing or tumbling is
 * drawn exactly where the pose says (all clear). On the ground the face
 * probes run every frame — 48 short obstacle casts, a few microseconds — so
 * the rig can keep a rider who is riding, leaning or parked out of a face.
 */
export function measureNearSolids(sampler: TerrainSampler, pose: EucPose, out: NearSolids): NearSolids {
  clearNearSolids(out);
  if (pose.airHeight > 1e-4 || pose.crashBlend > 0 || pose.ragdollBlend > 0) return out;
  const forwardX = Math.sin(pose.headingY);
  const forwardZ = Math.cos(pose.headingY);
  if (Math.abs(pose.groundPitch) < NEAR_SOLID.flatGroundTilt && Math.abs(pose.groundRoll) < NEAR_SOLID.flatGroundTilt) {
    out.lift = tyreStepLift(sampler, pose.x, pose.y, pose.z, forwardX, forwardZ);
    if (out.lift > NEAR_SOLID.restLiftMax && pose.restFactor > 0) {
      const roll = restingRoll(sampler, pose, forwardX, forwardZ);
      if (roll !== 0) {
        out.along = roll * Math.min(1, pose.restFactor / NEAR_SOLID.restGateFull);
        out.lift = tyreStepLift(sampler, pose.x + forwardX * out.along, pose.y, pose.z + forwardZ * out.along,
          forwardX, forwardZ);
      }
    }
  }
  if (sampler.raycastObstacle === undefined) return out;
  // From the drawn root (the pose, rolled `along` the heading), the point the
  // rig measures its body from.
  const rootX = pose.x + forwardX * out.along;
  const rootZ = pose.z + forwardZ * out.along;
  const bands = NEAR_SOLID.bandHeights;
  const count = NEAR_SOLID.directions;
  const cos = forwardZ;
  const sin = forwardX;
  for (let index = 0; index < count; index += 1) {
    faceDirection(index, local);
    // The rig's frame turned by the heading: +Z ahead is (sin h, cos h), +X
    // the rider's left is (cos h, −sin h).
    direction.x = local[0] * cos + local[1] * sin;
    direction.y = 0;
    direction.z = -local[0] * sin + local[1] * cos;
    for (let band = 0; band < bands.length; band += 1) {
      origin.x = rootX;
      origin.y = pose.y + out.lift + bands[band];
      origin.z = rootZ;
      const entry = band * count + index;
      const distance = sampler.raycastObstacle(origin, direction, NEAR_SOLID.probeDistance, 0, undefined, hit);
      if (distance === null) continue;
      out.faces[entry] = distance;
      // A face that is not upright (a slab's top or underside met edge-on) is
      // answered square to the probe, as is a sampler that left it unset.
      const across = Math.hypot(hitNormal.x, hitNormal.z);
      if (across > 0.5) {
        out.normals[2 * entry] = hitNormal.x / across;
        out.normals[2 * entry + 1] = hitNormal.z / across;
      } else {
        out.normals[2 * entry] = -direction.x;
        out.normals[2 * entry + 1] = -direction.z;
      }
      hitNormal.x = 0;
      hitNormal.y = 0;
      hitNormal.z = 0;
    }
  }
  return out;
}
