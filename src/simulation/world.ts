/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * The contract by which simulation reaches the world.
 *
 * Architecture invariant 3, made concrete: simulation asks a `TerrainSampler`
 * about the world and never asks the renderer. The renderer answers no gameplay
 * question. Both are built from the same `LevelPlan`, so they cannot drift —
 * and at M4 that stopped being an aspiration, because the renderer's own copy
 * of the ground is gone and there is exactly one description of it left.
 *
 * Nothing here may import three.js — see AGENTS.md invariant 1, enforced by
 * `src/architecture.test.ts`. That restriction is what allows the entire EUC
 * controller to be unit-tested headlessly with no browser.
 */

/**
 * Ground materials the rider can be on.
 *
 * The seven the vertical slice needs (`docs/PLANS.md` §4.3), plus M13's spill.
 * Their properties live in `data/surfaces.ts`; this union is only the set of
 * names, and it is here rather than there because `level/` and `simulation/`
 * both speak it and neither should have to import a table to name a surface.
 *
 * **The seven and the spill are not the same kind of thing**, and
 * `data/surfaces.ts` splits them into `TERRAIN_SURFACE_IDS` and
 * `HAZARD_SURFACE_IDS` so the difference is data rather than lore. The seven
 * are the palette a level is *built* from: a segment declares one, a verge band
 * chooses one, and every level is required to use all of them somewhere. The
 * spill is painted only inside a hazard's footprint, appears in generated
 * routes alone (§13 q9), and is the only ground in the game that feeds the
 * wobble oscillator.
 */
export type SurfaceId =
  | 'pavement'
  | 'roughPavement'
  | 'brick'
  | 'grass'
  | 'gravel'
  | 'dirt'
  | 'wood'
  | 'spill';

/** A plain 3-vector. Deliberately not three.js's Vector3. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * What a downward probe found beneath a point.
 *
 * **Mutable, and filled in place by the sampler.** The controller probes twice
 * every step — once under the contact patch and once at the kerb feeler — which
 * at 120 Hz would be 240 short-lived objects a second plus 240 normals inside
 * them. That is precisely the shape of garbage the pose interpolation and the
 * camera's probe vectors are already preallocated to avoid, and there is no
 * reason for the ground to be the one exception.
 */
export interface GroundSample {
  /** World height of the ground at the queried point. */
  height: number;
  /** Unit surface normal at that point. */
  normal: Vec3;
  surface: SurfaceId;
  /**
   * True when the point is off the authored heightfield, on the surround.
   *
   * Not an error and not a fallback: the surround is real ground with a real
   * surface (`level/plan.ts`). Reported because the debug overlay is more
   * useful when it can say "you have left the course" than when it silently
   * reports grass.
   */
  offCourse: boolean;
}

/** Mutable metadata for the authored box an obstacle cast met. */
export interface ObstacleHit {
  distance: number;
  /** Collider half-extents in its own horizontal frame, metres. */
  halfExtentX: number;
  halfExtentZ: number;
}

/** A sample object a caller owns and hands to the sampler to fill. */
export function createGroundSample(): GroundSample {
  return {
    height: 0,
    normal: { x: 0, y: 1, z: 0 },
    surface: 'pavement',
    offCourse: false,
  };
}

/** Copy one sample into another. Allocation-free, like everything it serves. */
export function copyGroundSample(from: GroundSample, to: GroundSample): void {
  to.height = from.height;
  to.normal.x = from.normal.x;
  to.normal.y = from.normal.y;
  to.normal.z = from.normal.z;
  to.surface = from.surface;
  to.offCourse = from.offCourse;
}

/**
 * Simulation's only window onto the world.
 *
 * A test double implementing this interface is what lets the controller be
 * tuned and regression-tested without a renderer, a canvas, or a browser — and
 * it is also how the chase camera's obstruction pull-in was proven at M3
 * before any level had geometry to fire it.
 */
export interface TerrainSampler {
  /**
   * Ground directly below a world position, written into `out`.
   *
   * Returns `out` as a convenience so a caller can chain, but the object is the
   * caller's and is reused; nothing may hold on to it across a step.
   */
  sampleGround(x: number, z: number, out: GroundSample): GroundSample;
  /**
   * Distance along a ray until it meets solid geometry, or null if it does not
   * within `maxDistance`. Used by the kerb feeler and by camera obstruction.
   */
  raycast(origin: Vec3, direction: Vec3, maxDistance: number): number | null;
  /**
   * Distance to authored solid geometry only, excluding the heightfield.
   *
   * Optional so small headless terrain doubles stay small. The production
   * `PlanTerrainSampler` provides it for wheel-radius clearance: a surface ray
   * cannot distinguish a steep but rideable bank from a vertical obstacle.
   */
  raycastObstacle?(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    /** Half-width of a line segment swept sideways with the ray, in metres. */
    sweepHalfWidth?: number,
    /** Optional world-space axis of that segment; defaults perpendicular to the ray. */
    sweepLateral?: Vec3,
    /** Optional allocation-free metadata output for the nearest hit. */
    out?: ObstacleHit,
  ): number | null;
}
