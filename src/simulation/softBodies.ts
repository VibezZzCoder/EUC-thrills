/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { BoxCollider } from '../level/plan.ts';

/**
 * Soft foliage volumes — the M15 answer to "a collision with a bush now
 * reacts like a boulder" (`references/PublicFeedback/FEEDBACK-TRIAGE.md` §3).
 *
 * A shrub's dense body used to be emitted into `plan.solids`, which gave it
 * the same wall behaviour as a concrete barrier: the M12-era fix for
 * ride-through-shrubs overcorrected, and the forum said so. From M15 the
 * shrub boxes arrive here instead — `level/buildPlan.ts` routes any prop
 * solid marked `soft` into `plan.softBodies` — so the sampler's obstacle
 * casts never see them and nothing can crash against one. What a soft body
 * does instead is *drag*: the controller sheds speed heavily while the wheel
 * is inside one and charges one wobble on entry because the owner classifies
 * bushes as soft hazards, and the crash ragdoll's
 * particles lose velocity fast inside one, which is what lets a crashing
 * rider flop into a bush and stay there, torso poking out.
 *
 * Built and handed over exactly as `HazardField` is (M13's rule): authored
 * volumes are their own kind of thing, they arrive from the composition root
 * at `Game.installLevel`, and they never travel through `GroundSample`. The
 * class is import-free of `three` and query-only, so every headless test can
 * construct one from plain boxes.
 */

/** A soft box with its query arithmetic done once. */
interface PreparedSoftBody {
  readonly x: number;
  readonly z: number;
  readonly minY: number;
  readonly maxY: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly cos: number;
  readonly sin: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export class SoftBodyField {
  private readonly bodies: readonly PreparedSoftBody[];

  constructor(bodies: readonly BoxCollider[] = []) {
    this.bodies = bodies.map((body) => {
      const cos = Math.cos(body.rotationY);
      const sin = Math.sin(body.rotationY);
      // Conservative world-aligned bounds around the rotated box.
      const reachX = Math.abs(body.halfExtents.x * cos) + Math.abs(body.halfExtents.z * sin);
      const reachZ = Math.abs(body.halfExtents.x * sin) + Math.abs(body.halfExtents.z * cos);
      return {
        x: body.centre.x,
        z: body.centre.z,
        minY: body.centre.y - body.halfExtents.y,
        maxY: body.centre.y + body.halfExtents.y,
        halfX: body.halfExtents.x,
        halfZ: body.halfExtents.z,
        cos,
        sin,
        minX: body.centre.x - reachX,
        maxX: body.centre.x + reachX,
        minZ: body.centre.z - reachZ,
        maxZ: body.centre.z + reachZ,
      };
    });
  }

  get empty(): boolean {
    return this.bodies.length === 0;
  }

  /**
   * Is this point inside a soft body?
   *
   * A linear scan, and deliberately so: a plan carries dozens of shrubs at
   * most, the bounds check rejects nearly all of them in two comparisons,
   * and the wheel asks once per step — the same shape of loop `HazardField`
   * runs. A grid would be more code guarding less time.
   */
  contains(x: number, y: number, z: number): boolean {
    for (const body of this.bodies) {
      if (x < body.minX || x > body.maxX || z < body.minZ || z > body.maxZ) continue;
      if (y < body.minY || y > body.maxY) continue;
      const dx = x - body.x;
      const dz = z - body.z;
      // Into the box's own frame, against its true half-extents.
      const localX = dx * body.cos - dz * body.sin;
      const localZ = dx * body.sin + dz * body.cos;
      if (Math.abs(localX) <= body.halfX && Math.abs(localZ) <= body.halfZ) return true;
    }
    return false;
  }
}

/** The shared empty field, so "no soft bodies" costs no allocation. */
export const NO_SOFT_BODIES = new SoftBodyField();
