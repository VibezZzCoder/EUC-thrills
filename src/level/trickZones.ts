/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Trick zones — the ground a scoring flight is allowed to launch from.
 *
 * `docs/PLANS.md` §38.10 q189 is the owner's answer to the measurement that
 * broke every cadence rule the trick bench tried: a rider standing still
 * produces charged hops, 180s and one-foot airs at the same rate a rider
 * *riding* does, and the park's own feature spacing docks the rider harder
 * than it docks the stander. No clock can separate them. The fact that can is
 * **where the flight launched** — so Trick Run banks trick points only on
 * flights that left one of Switchback Park's nine features.
 *
 * This module is the level half of that: a plain convex polygon in world XZ
 * per feature, carried on `LevelPlan.trickZones`, and one lookup. It is pure
 * data and pure arithmetic — no three.js (invariant 1), nothing from the
 * presentation half (invariant 5), and no mesh, collider or signage anywhere
 * near it. A venue that emits no zones is a venue with no trick geometry, and
 * `trickZoneAt` answers `null` for every point on it.
 *
 * **Convex, and asserted rather than assumed.** The containment test below is
 * the half-plane test, which is the cheapest correct answer for a convex
 * polygon and silently the *wrong* answer for a concave one — so
 * `validTrickZones` exists to keep a producer honest, and a venue's own test
 * runs it over the zones it emits. A feature's zone is a rectangle in its
 * corridor's `(s, t)` frame on a straight corridor, which maps to a
 * parallelogram in world XZ; nothing here depends on that, but it is why the
 * convexity bound is affordable to demand.
 */

/** A point in the world's XZ plane. Y is nobody's business here. */
export interface TrickZoneCorner {
  readonly x: number;
  readonly z: number;
}

/**
 * One named patch of ground a scoring flight may launch from.
 *
 * `corners` is a convex polygon with at least three of them, wound
 * consistently — either way round, since the test below reads the sign it
 * finds rather than one it insists on.
 */
export interface TrickZone {
  /** Stable, and on this venue it is the `SWITCHBACK_FEATURES` key. */
  readonly id: string;
  readonly corners: readonly TrickZoneCorner[];
}

/**
 * How far outside a polygon a point may lie and still count as on its edge.
 *
 * The half-plane test's cross product carries the units of *area*, and a zone
 * edge here is metres long, so this is a square millimetre of slack — far
 * below anything a rider can occupy and far above the rounding a corner
 * recomputed through two trig calls picks up. It exists so that "inclusive
 * edges" is true of a point built from the same arithmetic that built the
 * corner, rather than true only of points safely inside.
 */
const EDGE_EPSILON = 1e-9;

/** Twice the signed area of the triangle `a → b → p`, in the XZ plane. */
function cross(
  a: TrickZoneCorner,
  b: TrickZoneCorner,
  px: number,
  pz: number,
): number {
  return (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x);
}

/**
 * Whether a convex polygon contains a point, edges included.
 *
 * Every edge of a convex polygon puts the whole shape on one side of itself,
 * so a point is inside when it is never strictly on the outside of any of
 * them. The winding decides which side "outside" is, and it is read off the
 * polygon rather than required of it: a caller with a clockwise zone and a
 * caller with an anticlockwise one get the same answer.
 */
function containsPoint(zone: TrickZone, x: number, z: number): boolean {
  const corners = zone.corners;
  if (corners.length < 3) return false;
  // **A point that is not a point is inside nothing** (QA, M38 Phase 5). Every
  // comparison against NaN is false, so a non-finite coordinate would walk
  // every edge without once being ruled *outside* and fall out of this
  // function as `true` — the gate failing OPEN, and on whichever zone the scan
  // reached first. `validTrickZones` demands finite corners for the same
  // reason; this is the other half of it, on the half the caller supplies.
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;

  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const value = cross(corners[index], corners[(index + 1) % corners.length], x, z);
    if (value > EDGE_EPSILON) {
      if (sign < 0) return false;
      sign = 1;
    } else if (value < -EDGE_EPSILON) {
      if (sign > 0) return false;
      sign = -1;
    }
  }
  return true;
}

/**
 * The id of the first zone containing `(x, z)`, or `null`.
 *
 * **First, not nearest, and the venue owes it non-overlap.** Zones are
 * authored one per feature on corridors that do not share ground, and
 * `switchbackLevel.test.ts` measures that no two of them overlap — so "first"
 * and "the one" are the same answer, and this stays a linear scan of nine
 * rectangles rather than a spatial index nobody needs.
 *
 * `undefined` zones are the ordinary case: four of the five worlds that emit a
 * `LevelPlan` carry no trick geometry at all.
 */
export function trickZoneAt(
  zones: readonly TrickZone[] | undefined,
  x: number,
  z: number,
): string | null {
  if (zones === undefined) return null;
  for (const zone of zones) {
    if (containsPoint(zone, x, z)) return zone.id;
  }
  return null;
}

/**
 * Whether a set of zones is well formed: named, unique, finite and convex.
 *
 * A producer's own test calls this; nothing at runtime does, because a venue
 * that fails it is a build error rather than a condition to handle. Degenerate
 * shapes are rejected along with concave ones — a repeated corner or three
 * collinear points give a zero cross product, which the half-plane test would
 * happily swallow and which means the author meant something they did not
 * write.
 */
export function validTrickZones(zones: readonly TrickZone[]): boolean {
  const seen = new Set<string>();
  for (const zone of zones) {
    if (typeof zone.id !== 'string' || zone.id.length === 0) return false;
    if (seen.has(zone.id)) return false;
    seen.add(zone.id);

    const corners = zone.corners;
    if (corners.length < 3) return false;
    for (const corner of corners) {
      if (!Number.isFinite(corner.x) || !Number.isFinite(corner.z)) return false;
    }

    // Strictly convex: every turn the same way, and none of them zero.
    let sign = 0;
    for (let index = 0; index < corners.length; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % corners.length];
      const c = corners[(index + 2) % corners.length];
      const turn = cross(a, b, c.x, c.z);
      if (turn === 0) return false;
      const here = turn > 0 ? 1 : -1;
      if (sign === 0) sign = here;
      else if (sign !== here) return false;
    }
  }
  return true;
}
