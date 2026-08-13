/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { MARKINGS, markingWidth, type MarkingPaint, type MarkingRole } from '../data/markings.ts';
import type { PropKind } from '../data/props.ts';
import type { MaterialId } from '../data/surfaces.ts';
import type { SurfaceId, Vec3 } from '../simulation/world.ts';
import type { BoxCollider, SegmentSocket } from './plan.ts';

/**
 * Typed segments with entry and exit sockets — the authoring model.
 *
 * `docs/PLANS.md` §6 asks for the slice's beats to be authored "as typed
 * segments with entry/exit sockets (surface, width, heading, gradient,
 * elevation), not as one hand-placed blob", because a beat that composes
 * cleanly is a beat M12's generator can stitch, and one that does not will have
 * to be re-authored anyway. M4's proving ground is a fixed course and is
 * authored this way regardless: the cost now is nil, and the cost of
 * retrofitting it at M12 is a rewrite.
 *
 * A segment is a **specification**, not geometry. It describes a centreline
 * (straight or a constant-radius arc), an elevation profile, a corridor width,
 * lateral surface bands, and the blocks that stand on it. `buildPlan.ts`
 * rasterises a chain of them into the one heightfield and collider set that
 * `simulation/` and `render/` both read.
 *
 * **Conventions, and they are the world's, not a local invention.** `s` runs
 * along the centreline from the entry socket; `t` runs laterally and is
 * positive toward the rider's **LEFT**, which is +X at a zero heading. Positive
 * `curvature` therefore turns left, exactly as a positive yaw rate does
 * (`data/tuning.ts`). Getting this wrong is the failure `AGENTS.md` warns
 * about, so nothing below eyeballs a direction — every one is derived from
 * `left(h) = (cos h, -sin h)`, checked in `segments.test.ts` against the same
 * two axis facts the controller derives its steering sign from.
 *
 * Nothing here may import three.js (invariant 1).
 */

/** One lateral band of a different surface across the corridor. */
export interface SurfaceBand {
  /** Lateral offsets from the centreline, metres. Positive is the rider's LEFT. */
  from: number;
  to: number;
  surface: SurfaceId;
}

/**
 * Something solid standing on the corridor: a kerb, a wall, a bollard, a
 * plinth.
 *
 * Sharp things are blocks rather than heightfield detail on purpose. A 0.15 m
 * kerb written into a one-metre grid is not a kerb, it is a 1-in-7 ramp — the
 * step is the entire beat (`docs/PLANS.md` §6, beat 3), so it has to be a
 * genuine vertical face. Blocks give that; the heightfield gives slopes.
 */
export interface SegmentBlock {
  /** Distance along the centreline from the entry socket, metres. */
  s: number;
  /** Lateral offset of the block's centre. Positive is the rider's LEFT. */
  t: number;
  /** Half-length along the centreline. */
  halfAlong: number;
  /** Half-width across it. */
  halfLateral: number;
  /** Height of the top face above the corridor surface at `s`, metres. */
  height: number;
  /**
   * How far the block continues below the corridor surface, metres.
   *
   * Defaults to 0.6, which keeps a block grounded on a gentle gradient rather
   * than hovering at its downhill end. It costs nothing: the sampler only ever
   * reads a box's top face.
   */
  depth?: number;
  /** Surface of the top face — what a rider standing on it is riding on. */
  surface: SurfaceId;
  /** Visual material for the whole box. Defaults to the surface's own. */
  appearance?: MaterialId;
}

/**
 * A piece of dressing authored against a segment's own centreline.
 *
 * The same `(s, t)` frame a block uses, for the same reason: a tree authored at
 * "eleven metres left of the road" stays eleven metres left of the road when
 * the road becomes an arc, and a level whose furniture has to be re-solved
 * every time a radius moves is a level nobody dresses twice.
 *
 * **A prop is not an authored block.** This segment-local record carries no
 * collider; after final placement, `buildPlan.ts` may derive one in
 * `plan.solids` from the prop kind. So `t` beyond `halfWidth` is the *normal*
 * case — the verge, shoulder, and surround are where dressing belongs, and a
 * solid prop on the corridor would become an unintended wall.
 */
export interface SegmentProp {
  /** Distance along the centreline from the entry socket, metres. */
  s: number;
  /** Lateral offset. Positive is the rider's LEFT, as everywhere else. */
  t: number;
  kind: PropKind;
  /** Yaw relative to the corridor's heading at `s`, radians. Default 0. */
  yaw?: number;
  /** Multiplier on the kind's authored size. Default 1. */
  scale?: number;
  /** Metric size, for `building`. See `Prop.size`. */
  size?: Vec3;
  /**
   * Height above the sampled ground, metres. Default 0.
   *
   * For anything standing on something the heightfield does not contain — a
   * finial on a bollard, a crown on a trunk — because both of those are
   * colliders and the ground under a prop is read from the heightfield alone.
   */
  lift?: number;
  /**
   * Whether this prop stands on a collider the level already has.
   *
   * The builder refuses to place dressing inside a rideable corridor. Before
   * M8.6 a rider would pass through it; now most kinds would become unintended
   * walls. This flag is the narrow exception: the crown over a trunk and the
   * finial on a bollard sit on geometry that is already solid.
   */
  onCollider?: boolean;
}

/**
 * A painted line authored against a segment's own centreline.
 *
 * The same `(s, t)` frame blocks and props use, and for the stronger version of
 * the same reason: a centre line is *defined* as `t = 0`, so authoring it in
 * world space would mean re-solving it every time a radius moved, and a road
 * whose paint drifts off its own centreline is worse than a road with none.
 *
 * The path is a list of `(s, t)` points rather than a single offset, so one
 * type covers a lane line down a corridor, a bar across it, and a taper between
 * two offsets. `markingsOf` subdivides each leg finely enough that the world
 * curve underneath is followed rather than chorded.
 */
export interface SegmentMarking {
  /** Points in the segment's own `(s, t)` frame. Two is a straight run. */
  readonly path: readonly { readonly s: number; readonly t: number }[];
  /** Which line this is. Widths live in `data/markings.ts`, not here. */
  readonly role: MarkingRole;
  /** Broken or solid. Solid by default. */
  readonly broken?: boolean;
  /** Road paint or the park's duller paint. Road by default. */
  readonly paint?: MarkingPaint;
}

/**
 * A marking resolved into world XZ, but not yet onto the ground.
 *
 * The Y half is deliberately missing, exactly as it is for `PlacedProp`: paint
 * lies on the *finished* heightfield, which has already blended the corridor
 * into its shoulder and into whatever neighbouring beat crosses it. A line
 * taking its height from the segment that authored it would float where two
 * corridors meet, which on a level that folds this tightly is most junctions.
 */
export interface PlacedMarking {
  readonly points: readonly { readonly x: number; readonly z: number }[];
  readonly width: number;
  readonly dash: number;
  readonly gap: number;
  readonly paint: MarkingPaint;
}

/**
 * A prop placed in world XZ, whose height is still relative to the ground.
 *
 * The intermediate `buildPlan.ts` resolves: the ground under a prop on a verge
 * is the *shoulder*, which has already eased away from the corridor's own
 * height, so a prop cannot take its height from the segment that authored it.
 * It takes it from the finished heightfield, which is the surface the player
 * actually sees.
 */
export interface PlacedProp {
  kind: PropKind;
  x: number;
  z: number;
  rotationY: number;
  scale: number;
  size?: Vec3;
  /** Height above the ground at `(x, z)`, metres. */
  lift: number;
  /** See `SegmentProp.onCollider`. */
  onCollider?: boolean;
  /**
   * The corridor surface this prop was authored against, world metres.
   *
   * Present only on a prop that came from a segment, and only useful to one
   * that stands `onCollider`. Such a prop's `lift` is measured from the thing it
   * stands on — a crown from the base of its trunk, a finial from the foot of
   * its bollard — and that thing is a `SegmentBlock`, which `collidersOf` places
   * against `surfaceHeightAt` and *not* against the heightfield. Outside its own
   * corridor the two are different surfaces: the heightfield out there is the
   * shoulder easing away to the surround.
   *
   * The slice never noticed because its corridors sit close to their own fields.
   * A stitched route does: measured on `sweep-0`, a road running 2.2 m below the
   * ground beside it left every crown on its tree row hanging 1.5 m clear of the
   * trunk it was drawn for. Carrying the block's own reference here is what lets
   * `resolveProp` put the two back on one surface.
   */
  baseY?: number;
}

/** One authored beat. */
export interface SegmentSpec {
  id: string;
  /** Centreline length, metres. */
  length: number;
  /**
   * Signed curvature, 1/m. Zero is straight; positive turns toward the rider's
   * LEFT. The turn radius is `1 / |curvature|`.
   */
  curvature?: number;
  /** Elevation change from the entry socket to the exit socket, metres. */
  climb?: number;
  /**
   * Whether the climb is eased (default) or linear.
   *
   * **Eased profiles are why these beats stitch to anything.** A smoothstep
   * elevation is flat at both ends, so every socket reports a zero gradient and
   * any two segments join without a crease — which is precisely the property
   * M12's generator needs when it lays a route it did not author. A linear
   * ramp reports its true gradient at both ends and must be matched by whatever
   * follows it. The proving ground uses eased throughout; the flag exists so
   * the choice is visible rather than assumed.
   */
  linearClimb?: boolean;
  /** Rideable half-width, metres. */
  halfWidth: number;
  /**
   * How far the corridor edge sits BELOW the centreline, metres.
   *
   * `docs/PLANS.md` §6 beat 2 asks for a crowned road, and a road's crown is
   * the reason water leaves it — so it is a property of the corridor's cross
   * section, not something to fake with two segments. Quadratic in
   * `|t| / halfWidth`, which is what a real crown is, so the fall is gentle
   * near the centre and steepest at the gutter.
   *
   * A **negative** value raises the edges instead and hollows the corridor into
   * a channel, which is exactly the drainage swale §6 names as an off-route
   * pocket. One number, both shapes.
   */
  crown?: number;
  /**
   * Lateral tilt of the corridor, radians. Positive raises the rider's LEFT.
   *
   * §6 beat 8's "one bermed left-hander". A berm is a banked corner, and
   * banking is what lets a rider carry speed through it without spending the
   * whole lateral budget on grip — so it has to be in the ground, where the
   * controller's slope term and the sampled normal both read it, rather than
   * drawn on.
   *
   * Composes with `crown`: the crown is symmetric about the centreline and this
   * is antisymmetric, so a banked road with a crown is the sum of the two.
   */
  crossSlope?: number;
  /** The surface of the corridor outside any band. */
  surface: SurfaceId;
  bands?: readonly SurfaceBand[];
  blocks?: readonly SegmentBlock[];
  /** Dressing input. Solid kinds derive separate `LevelPlan.solids` after placement. */
  props?: readonly SegmentProp[];
  /** Render-only road paint. No collider, no surface, no ground query. */
  markings?: readonly SegmentMarking[];
  /**
   * Lateral distance over which the corridor blends down to the surround, m.
   *
   * Without it an elevated beat ends in a cliff at its own edge. With it the
   * embankment is rideable, which turns "the course" into "the course plus
   * everywhere around it" — which is the go-anywhere fantasy the vision LOCKS.
   */
  shoulder?: number;
}

/**
 * A branch: a chain of specs that leaves an already-placed segment.
 *
 * **`placeChain` alone cannot author a fork**, and §6 beat 4 is a fork — a safe
 * sweeping right and a narrow alley shortcut that rejoin at the park gate. Nor
 * can it author an off-route pocket, which by definition leaves the route and
 * does not come back. A branch is the smallest addition that expresses both: a
 * root taken from a parent's centreline, four offsets that place the first
 * socket relative to it, and then the ordinary chain.
 *
 * It is deliberately *not* a rejoin mechanism. Where two branches meet again is
 * a property of the geometry, and `sliceLevel.test.ts` measures it rather than
 * the builder forcing it — a forced rejoin would hide exactly the authoring
 * error M12's generator has to be able to detect.
 */
export interface SegmentBranch {
  /** The id of the segment this leaves from. Placed before this branch. */
  readonly from: string;
  /**
   * Distance along the parent's centreline where it leaves, metres.
   * Defaults to the parent's full length — that is, its exit socket.
   */
  readonly atDistance?: number;
  /** Lateral offset from that point, metres. Positive is the rider's LEFT. */
  readonly lateralOffset?: number;
  /** Vertical offset from that point, metres. Positive is up. */
  readonly elevationOffset?: number;
  /** Heading change applied at the root, radians. Positive turns left. */
  readonly headingOffset?: number;
  readonly specs: readonly SegmentSpec[];
}

/**
 * A route with forks: one main chain plus any number of branches.
 *
 * Branches are resolved in order and may hang off earlier branches as well as
 * off the main chain, which is what lets the alley-only ledge hang off the
 * alley rather than off the route the alley leaves.
 */
export interface SegmentGraph {
  readonly main: readonly SegmentSpec[];
  readonly branches?: readonly SegmentBranch[];
}

/** A spec placed in the world, with both sockets resolved. */
export interface PlacedSegment {
  readonly spec: SegmentSpec;
  readonly entry: SegmentSocket;
  readonly exit: SegmentSocket;
  /** World-space bounds including the shoulder, for a cheap rasteriser reject. */
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** What a segment says about one world point. */
export interface SegmentQuery {
  /** Distance along the centreline, clamped to [0, length]. */
  s: number;
  /** Lateral offset, positive toward the rider's LEFT. */
  t: number;
  /**
   * Distance outside the corridor, metres: zero inside it, and a rounded cap
   * beyond either end so a first or last segment finishes in a curve rather
   * than a wall.
   */
  outside: number;
  /** Corridor surface height at `s`. */
  height: number;
}

export const DEFAULT_SHOULDER = 7;
const DEFAULT_BLOCK_DEPTH = 0.6;

/**
 * How far a crown or a bank takes to arrive, metres along the centreline.
 *
 * **A cross section that switches on at a socket is a kerb, and the controller
 * is right to call it one.** A step is told from a slope by whether the surface
 * the wheel is already on predicts the rise (`EucController.advance`), and a
 * flat corridor predicts nothing about a crowned one — so a 0.10 m crown
 * appearing between two adjacent samples at the gutter is a 0.10 m step,
 * mounted at a real speed cost, at the edge of a road that visibly does not
 * have a kerb there.
 *
 * Blended over six metres it is 0.017 m per metre, which is under half of
 * `TERRAIN.curbThreshold` per step at any speed the wheel can reach. Short
 * segments get a third of their length instead, so a six-metre beat is not all
 * ramp.
 */
const LATERAL_BLEND = 6;

/** Unit forward vector for a heading, in the XZ plane. */
export function forwardOf(headingY: number): { x: number; z: number } {
  return { x: Math.sin(headingY), z: Math.cos(headingY) };
}

/**
 * Unit LEFT vector for a heading, in the XZ plane.
 *
 * A positive yaw about +Y turns +Z toward +X, so ninety degrees of positive
 * yaw from the heading is the rider's left. At a zero heading that is +X,
 * which is what `data/tuning.ts` says the rider's left is.
 */
export function leftOf(headingY: number): { x: number; z: number } {
  return { x: Math.cos(headingY), z: -Math.sin(headingY) };
}

/**
 * Yaw, relative to a corridor, that turns a prop to face the route.
 *
 * A prop's local +Z is its front, exactly as the world's +Z is the rider's. A
 * quarter turn of *negative* yaw points +Z at −X, which is the rider's right
 * (`AGENTS.md`), so something standing on the corridor's left faces the route
 * at −π/2. Derived from the axis facts rather than eyeballed, like everything
 * else in this file.
 *
 * **It lives here from M12, having been private to `sliceLevel.ts`.** The
 * generator dresses its neutral joins too, and its first attempt hard-coded a
 * facing that turned every bench side-on to the road — which the owner spotted
 * on his first ride. A rule about which way a thing faces belongs beside the
 * axis facts it is derived from, with one owner and two authors.
 */
export function facingRoute(t: number): number {
  return t > 0 ? -Math.PI / 2 : Math.PI / 2;
}

/** Signed angle from `a` to `b` about +Y, radians in (-pi, pi]. */
function signedAngleXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(az * bx - ax * bz, ax * bx + az * bz);
}

function ease01(u: number): number {
  return u * u * (3 - 2 * u);
}

function easeSlope01(u: number): number {
  return 6 * u * (1 - u);
}

/** Height above the entry socket at distance `s` along the centreline. */
export function climbAt(spec: SegmentSpec, s: number): number {
  const climb = spec.climb ?? 0;
  if (climb === 0) return 0;
  const u = spec.length > 0 ? Math.min(1, Math.max(0, s / spec.length)) : 0;
  return climb * (spec.linearClimb === true ? u : ease01(u));
}

/** Gradient in radians at distance `s`. Positive climbs along the heading. */
export function gradientAt(spec: SegmentSpec, s: number): number {
  const climb = spec.climb ?? 0;
  if (climb === 0 || spec.length <= 0) return 0;
  const u = Math.min(1, Math.max(0, s / spec.length));
  const perMetre = spec.linearClimb === true
    ? climb / spec.length
    : (climb / spec.length) * easeSlope01(u);
  // A descent's eased ends produce negative zero, which compares equal to zero
  // and is not deep-equal to it — so a socket-continuity check between a flat
  // beat and a descending one fails on a value nobody can see.
  return perMetre === 0 ? 0 : Math.atan(perMetre);
}

/**
 * How far the corridor's cross section is expressed at distance `s`, 0..1.
 *
 * Zero at both sockets, one through the middle. See `LATERAL_BLEND`.
 */
function lateralBlendAt(spec: SegmentSpec, s: number): number {
  if (spec.length <= 0) return 0;
  const blend = Math.min(LATERAL_BLEND, spec.length / 3);
  if (blend <= 0) return 1;
  const from = Math.min(1, Math.max(0, s / blend));
  const to = Math.min(1, Math.max(0, (spec.length - s) / blend));
  return ease01(Math.min(from, to));
}

/**
 * The corridor's cross section at `(s, t)`: height relative to the centreline.
 *
 * Both terms are clamped to the rideable half-width, so the shoulder starts
 * from the corridor's own edge height rather than continuing a bank out into
 * the surround — an embankment that kept banking would eventually stand up.
 */
export function lateralProfile(spec: SegmentSpec, s: number, t: number): number {
  const crown = spec.crown ?? 0;
  const crossSlope = spec.crossSlope ?? 0;
  if (crown === 0 && crossSlope === 0) return 0;

  const halfWidth = spec.halfWidth;
  const clamped = halfWidth > 0 ? Math.min(halfWidth, Math.max(-halfWidth, t)) : 0;
  const u = halfWidth > 0 ? clamped / halfWidth : 0;
  const profile = (-crown * u * u + Math.tan(crossSlope) * clamped) * lateralBlendAt(spec, s);
  // The same negative-zero guard `gradientAt` carries, and for the same reason:
  // `-0` compares equal to `0` and is not deep-equal to it, so a socket at a
  // crowned segment's own end would fail a continuity check on a value nobody
  // can see.
  return profile === 0 ? 0 : profile;
}

/**
 * The rideable surface height at `(s, t)`, in world space.
 *
 * The one function that answers "how high is the ground here" for a segment.
 * The rasteriser, the block placement, and every test read it, so a corridor
 * cannot be crowned for the renderer and flat for the colliders standing on it.
 */
export function surfaceHeightAt(
  entry: SegmentSocket,
  spec: SegmentSpec,
  s: number,
  t: number,
): number {
  return entry.position.y + climbAt(spec, s) + lateralProfile(spec, s, t);
}

/** Heading at distance `s`. */
export function headingAt(entry: SegmentSocket, spec: SegmentSpec, s: number): number {
  return entry.headingY + (spec.curvature ?? 0) * s;
}

/** Centreline point at distance `s`, in world space. */
export function centrelineAt(entry: SegmentSocket, spec: SegmentSpec, s: number): Vec3 {
  const k = spec.curvature ?? 0;
  const h0 = entry.headingY;
  const y = entry.position.y + climbAt(spec, s);

  if (k === 0) {
    const forward = forwardOf(h0);
    return {
      x: entry.position.x + forward.x * s,
      y,
      z: entry.position.z + forward.z * s,
    };
  }

  const h = h0 + k * s;
  return {
    x: entry.position.x + (Math.cos(h0) - Math.cos(h)) / k,
    y,
    z: entry.position.z + (Math.sin(h) - Math.sin(h0)) / k,
  };
}

/**
 * Place a chain of specs, each starting where the previous one ended.
 *
 * This is the whole of "stitching" at M4, and it is deliberately the same
 * operation a generator performs: take an exit socket, take a spec, produce an
 * entry socket that equals it. The difference at M12 is only *which* spec gets
 * chosen, which is why the socket continuity test below is worth having now.
 */
export function placeChain(
  specs: readonly SegmentSpec[],
  start: { position: Vec3; headingY: number },
): PlacedSegment[] {
  const placed: PlacedSegment[] = [];
  let cursor: Vec3 = { ...start.position };
  let heading = start.headingY;

  for (const spec of specs) {
    const entry: SegmentSocket = {
      position: { ...cursor },
      headingY: heading,
      surface: spec.surface,
      halfWidth: spec.halfWidth,
      gradient: gradientAt(spec, 0),
    };
    const exitPosition = centrelineAt(entry, spec, spec.length);
    const exit: SegmentSocket = {
      position: exitPosition,
      headingY: headingAt(entry, spec, spec.length),
      surface: spec.surface,
      halfWidth: spec.halfWidth,
      gradient: gradientAt(spec, spec.length),
    };

    placed.push({ spec, entry, exit, ...boundsOf(entry, spec) });
    cursor = { ...exitPosition };
    heading = exit.headingY;
  }

  return placed;
}

/**
 * Place a graph: the main chain, then every branch, in order.
 *
 * A branch's root is taken from its parent's centreline at `atDistance`, moved
 * sideways, up or down, and turned — in that order, and the lateral offset uses
 * the parent's heading at that point rather than the branch's own, because it
 * describes where on the parent the branch leaves rather than where it goes.
 *
 * Every branch may see every segment placed before it, so a branch off a branch
 * works and a branch off something later does not. That asymmetry is deliberate:
 * a forward reference has no unique answer, and failing loudly here is cheaper
 * than a level whose geometry depends on array order nobody wrote down.
 */
export function placeGraph(
  graph: SegmentGraph,
  start: { position: Vec3; headingY: number },
): PlacedSegment[] {
  const placed = placeChain(graph.main, start);
  const byId = new Map<string, PlacedSegment>();
  for (const segment of placed) {
    if (byId.has(segment.spec.id)) throw new Error(`duplicate segment id "${segment.spec.id}"`);
    byId.set(segment.spec.id, segment);
  }

  for (const branch of graph.branches ?? []) {
    const parent = byId.get(branch.from);
    if (parent === undefined) {
      throw new Error(`branch from unknown or not-yet-placed segment "${branch.from}"`);
    }

    const along = Math.min(parent.spec.length, Math.max(0, branch.atDistance ?? parent.spec.length));
    const lateral = branch.lateralOffset ?? 0;
    const heading = headingAt(parent.entry, parent.spec, along);
    const point = centrelineAt(parent.entry, parent.spec, along);
    const left = leftOf(heading);

    const root = {
      position: {
        x: point.x + left.x * lateral,
        // The parent's own cross section, so a branch leaving a crowned road
        // starts at the gutter rather than at the crown.
        y: surfaceHeightAt(parent.entry, parent.spec, along, lateral)
          + (branch.elevationOffset ?? 0),
        z: point.z + left.z * lateral,
      },
      headingY: heading + (branch.headingOffset ?? 0),
    };

    for (const segment of placeChain(branch.specs, root)) {
      if (byId.has(segment.spec.id)) {
        throw new Error(`duplicate segment id "${segment.spec.id}"`);
      }
      byId.set(segment.spec.id, segment);
      placed.push(segment);
    }
  }

  return placed;
}

/** Conservative world bounds for a placed segment, including its shoulder. */
function boundsOf(
  entry: SegmentSocket,
  spec: SegmentSpec,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const margin = spec.halfWidth + (spec.shoulder ?? DEFAULT_SHOULDER);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  // Sampling the centreline rather than solving the arc's extrema: an arc of
  // less than a full turn is smooth, twenty-four samples bound it to within a
  // few centimetres, and this runs once per segment at build time.
  const samples = 24;
  for (let i = 0; i <= samples; i += 1) {
    const point = centrelineAt(entry, spec, (spec.length * i) / samples);
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }

  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minZ: minZ - margin,
    maxZ: maxZ + margin,
  };
}

/**
 * Where a world point sits relative to a placed segment.
 *
 * Returns `null` when the point is outside the segment's bounds, which is the
 * cheap reject that keeps rasterising a quarter of a million samples against
 * nine segments to a few milliseconds at boot.
 */
export function querySegment(placed: PlacedSegment, x: number, z: number): SegmentQuery | null {
  if (x < placed.minX || x > placed.maxX || z < placed.minZ || z > placed.maxZ) return null;

  const { spec, entry } = placed;
  const k = spec.curvature ?? 0;

  let s: number;
  let t: number;

  if (k === 0) {
    const dx = x - entry.position.x;
    const dz = z - entry.position.z;
    const forward = forwardOf(entry.headingY);
    const left = leftOf(entry.headingY);
    s = dx * forward.x + dz * forward.z;
    t = dx * left.x + dz * left.z;
  } else {
    // The arc's centre sits one radius to the LEFT of the entry for a
    // left-hand turn, and one radius to the right for a right-hand one — which
    // `1 / k` expresses with its own sign, so there is no branch here.
    const left = leftOf(entry.headingY);
    const centreX = entry.position.x + left.x / k;
    const centreZ = entry.position.z + left.z / k;

    const vx = x - centreX;
    const vz = z - centreZ;
    const radius = Math.hypot(vx, vz);

    const v0x = entry.position.x - centreX;
    const v0z = entry.position.z - centreZ;
    s = signedAngleXZ(v0x, v0z, vx, vz) / k;
    t = Math.sign(k) * (1 / Math.abs(k) - radius);
  }

  const clampedS = Math.min(spec.length, Math.max(0, s));
  const lateralOut = Math.max(0, Math.abs(t) - spec.halfWidth);
  const alongOut = Math.max(0, -s, s - spec.length);

  return {
    s: clampedS,
    t,
    // A rounded cap rather than a square one: a first or last segment then
    // finishes in a curve instead of ending in a cliff face across its width.
    outside: Math.hypot(lateralOut, alongOut),
    height: surfaceHeightAt(entry, spec, clampedS, t),
  };
}

/** Which surface a lateral offset lands on, honouring the bands. */
export function surfaceAtLateral(spec: SegmentSpec, t: number): SurfaceId {
  const bands = spec.bands;
  if (bands !== undefined) {
    for (const band of bands) {
      const low = Math.min(band.from, band.to);
      const high = Math.max(band.from, band.to);
      if (t >= low && t < high) return band.surface;
    }
  }
  return spec.surface;
}

/**
 * Turn a segment's props into world-space placements.
 *
 * The XZ half of `collidersOf`, and deliberately not the Y half: a prop's
 * height comes from the finished heightfield rather than from the corridor,
 * because most props stand off the corridor entirely. See `PlacedProp`.
 */
export function propsOf(placed: PlacedSegment): PlacedProp[] {
  const { spec, entry } = placed;
  const props = spec.props ?? [];
  const out: PlacedProp[] = [];

  for (const prop of props) {
    const heading = headingAt(entry, spec, prop.s);
    const centre = centrelineAt(entry, spec, prop.s);
    const left = leftOf(heading);

    out.push({
      kind: prop.kind,
      x: centre.x + left.x * prop.t,
      z: centre.z + left.z * prop.t,
      rotationY: heading + (prop.yaw ?? 0),
      scale: prop.scale ?? 1,
      ...(prop.size === undefined ? {} : { size: { ...prop.size } }),
      lift: prop.lift ?? 0,
      ...(prop.onCollider === true
        ? {
          onCollider: true,
          // The same reference `collidersOf` places this prop's block against.
          baseY: surfaceHeightAt(entry, spec, prop.s, prop.t),
        }
        : {}),
    });
  }

  return out;
}

/**
 * Turn a segment's markings into world-space polylines.
 *
 * Subdivided in the `(s, t)` frame rather than between the authored endpoints,
 * which is the whole reason the frame exists: a straight line at `t = 0` down a
 * 95 m-radius boulevard is a *curve* in the world, and interpolating between
 * its two authored ends would chord straight across the bend and paint the
 * centre line onto the verge at the apex.
 *
 * `step` is in metres, and the leg is measured in the `(s, t)` plane — which
 * differs from true arc length by the factor `1 - curvature * t`, at most 9% on
 * the tightest painted arc at the widest painted offset. That only ever makes
 * the subdivision finer than asked for, so it is left alone rather than solved.
 */
export function markingsOf(
  placed: PlacedSegment,
  step: number = MARKINGS.sampleStep,
): PlacedMarking[] {
  const { spec, entry } = placed;
  const markings = spec.markings ?? [];
  const out: PlacedMarking[] = [];

  const toWorld = (s: number, t: number): { x: number; z: number } => {
    const heading = headingAt(entry, spec, s);
    const centre = centrelineAt(entry, spec, s);
    const left = leftOf(heading);
    return { x: centre.x + left.x * t, z: centre.z + left.z * t };
  };

  for (const marking of markings) {
    if (marking.path.length < 2) continue;
    const points: { x: number; z: number }[] = [toWorld(marking.path[0].s, marking.path[0].t)];

    for (let leg = 1; leg < marking.path.length; leg += 1) {
      const from = marking.path[leg - 1];
      const to = marking.path[leg];
      const span = Math.hypot(to.s - from.s, to.t - from.t);
      const divisions = Math.max(1, Math.ceil(span / step));
      for (let index = 1; index <= divisions; index += 1) {
        const u = index / divisions;
        points.push(toWorld(from.s + (to.s - from.s) * u, from.t + (to.t - from.t) * u));
      }
    }

    out.push({
      points,
      width: markingWidth(marking.role),
      dash: marking.broken === true ? MARKINGS.dashLength : 0,
      gap: marking.broken === true ? MARKINGS.dashGap : 0,
      paint: marking.paint ?? 'road',
    });
  }

  return out;
}

/** Turn a segment's blocks into world-space colliders. */
export function collidersOf(placed: PlacedSegment): BoxCollider[] {
  const { spec, entry } = placed;
  const blocks = spec.blocks ?? [];
  const colliders: BoxCollider[] = [];

  for (const block of blocks) {
    const heading = headingAt(entry, spec, block.s);
    const centre = centrelineAt(entry, spec, block.s);
    const left = leftOf(heading);
    const depth = block.depth ?? DEFAULT_BLOCK_DEPTH;

    // The corridor's own cross section at the block's lateral offset, not the
    // centreline's height: a kerb on a crowned road sits in the gutter, and a
    // bollard on a berm stands on the bank.
    const groundY = surfaceHeightAt(entry, spec, block.s, block.t);

    colliders.push({
      centre: {
        x: centre.x + left.x * block.t,
        // Top face at `height` above the corridor, bottom `depth` below it.
        y: groundY + (block.height - depth) / 2,
        z: centre.z + left.z * block.t,
      },
      halfExtents: {
        // Local +X is the corridor's left and local +Z is along it, because a
        // yaw of `heading` maps them onto exactly that pair (see `leftOf`).
        x: block.halfLateral,
        y: (block.height + depth) / 2,
        z: block.halfAlong,
      },
      rotationY: heading,
      surface: block.surface,
      ...(block.appearance === undefined ? {} : { appearance: block.appearance }),
    });
  }

  return colliders;
}
