/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import type { LevelPlan, Segment, SegmentSocket } from '../level/plan.ts';

/**
 * The route as one continuous line — M18.
 *
 * **This is what a CPU rider follows instead of pathfinding**, and it is the
 * answer to the question the owner asked while M18 was being built: does
 * teaching a brain to ride the procedural routes need a hand-built course
 * instead? It does not, because a generated route is not a maze. `level/`
 * emits every beat with an **entry and an exit socket** — a position, a
 * heading, a gradient and a rideable half-width at each end — so the through
 * line already exists as data and only has to be put in order. What follows is
 * ordering and interpolation; there is no search at ride time and nothing here
 * runs inside the fixed step except `locate` and `sample`.
 *
 * Nothing here may import three.js (AGENTS.md invariant 1). It reads
 * `LevelPlan` straight from `level/plan.ts` for the reason `challenge.ts` reads
 * `Checkpoint` and `targets.ts` reads `Target`: the authored geometry and the
 * geometry the simulation reasons about must be one object.
 *
 * ## How the order is found
 *
 * Sockets, not segments, are the graph. Two segment ends that sit within
 * `TIGHT_JOIN` of each other are the same joint — that is what stitching *is* —
 * and a route is then a walk through that graph. Which walk is decided by the
 * **checkpoints**, because `level/generateRoute.ts` puts all six of them on the
 * required through line by construction and says so at length; so the spine is
 * the shortest walk that visits the segment under each checkpoint in
 * `routeIndex` order. That gives the main road rather than a lap of the
 * optional branches, without this file having to know which segments are
 * optional — information the emitted plan deliberately does not carry.
 *
 * **A jump is a hole in that graph and is bridged on purpose.** The kicker's
 * landing is a branch *below* the lip rather than a socket join
 * (`docs/PLANS.md` §10), so the two beats are metres apart with nothing between
 * them. A graph of tight joins alone would find no path across it and the whole
 * spine would fail on any route containing a kicker. So a second, dearer class
 * of link joins two ends that are within `GAP_JOIN` **and pointing the same
 * way**; Dijkstra takes it only when there is nothing tighter, which is exactly
 * when it is a jump.
 *
 * ## Why the line is interpolated rather than joined corner to corner
 *
 * A segment on an arc reports two sockets and no middle, so a spine made of
 * chords would cut every corner — and a cop aiming at a chord rides onto the
 * verge on precisely the bends where the chase is worth watching. Both ends
 * carry a *heading*, which with the two positions is a Hermite curve, and a
 * cubic Hermite whose tangents are scaled by the chord length reproduces a
 * constant-radius arc to well under the width of the road. The samples are
 * ~`SAMPLE_SPACING` apart, so a kilometre of route is a few hundred points and
 * every query below is arithmetic over a small flat array.
 *
 * ## What it deliberately does not do
 *
 * It does not know about hazards, riders, modes or scores; it is a line with a
 * width. It carries no `y` opinion beyond the sockets' own heights — the ground
 * is `TerrainSampler`'s answer and always was (invariant 3), and a brain that
 * asked this file how high the road is would be asking the wrong object.
 */

/** Two segment ends this close are the same joint, metres. */
const TIGHT_JOIN = 1.25;
/** The furthest a jump may be bridged, metres. */
const GAP_JOIN = 26;
/** How closely two ends must agree in heading to be bridged as a jump, radians. */
const GAP_HEADING_TOLERANCE = 1.0;
/** Target spacing between spine samples, metres. */
const SAMPLE_SPACING = 3.5;

/** One point on the line, filled into a caller's object. Allocates nothing. */
export interface SpineSample {
  x: number;
  y: number;
  z: number;
  /** Direction of travel here, radians about +Y. */
  headingY: number;
  /** Rideable half-width here, metres. */
  halfWidth: number;
  /** Distance from the start of the route, metres. */
  distance: number;
}

export function createSpineSample(): SpineSample {
  return { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
}

/** Where a point in the world sits relative to the line. */
export interface SpineLocation {
  /** Distance along the route of the nearest point on the line, metres. */
  distance: number;
  /**
   * How far the point is from the line, metres. Unsigned.
   *
   * Unsigned because every consumer so far asks "how far off the road is this"
   * — the stray rule, the swerve room, the cop's own line error — and a sign
   * would be one more convention to get backwards. The signed version is
   * `lateralOffset` below, which states its own convention.
   */
  offRoute: number;
  /** Rideable half-width at that point, metres. */
  halfWidth: number;
}

export function createSpineLocation(): SpineLocation {
  return { distance: 0, offRoute: 0, halfWidth: 0 };
}

interface SpinePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly halfWidth: number;
  /** Cumulative distance from the start. */
  readonly distance: number;
}

/** Shortest signed difference between two angles, radians. */
function wrapAngle(radians: number): number {
  let value = radians;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

/** One end of a segment, as the graph sees it. */
interface EndNode {
  readonly segment: number;
  /** True for the entry socket. */
  readonly entry: boolean;
  readonly x: number;
  readonly z: number;
  /** Heading pointing *along the route* out of this end. */
  readonly outward: number;
}

function endNodes(segments: readonly Segment[]): EndNode[] {
  const nodes: EndNode[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    nodes.push({
      segment: index,
      entry: true,
      x: segment.entry.position.x,
      z: segment.entry.position.z,
      // The entry socket faces *into* the segment, so leaving the route through
      // it means travelling the other way.
      outward: segment.entry.headingY + Math.PI,
    });
    nodes.push({
      segment: index,
      entry: false,
      x: segment.exit.position.x,
      z: segment.exit.position.z,
      outward: segment.exit.headingY,
    });
  }
  return nodes;
}

/**
 * Which segments neighbour which, and at what cost to cross the joint.
 *
 * The cost of a tight join is zero because a stitched seam is not a distance
 * anybody travels; the cost of a bridged jump is its own length, which is what
 * keeps Dijkstra from preferring a flight over a road.
 */
interface Neighbour {
  readonly segment: number;
  /** Which end of the neighbour the route arrives at. */
  readonly enteringAtEntry: boolean;
  readonly cost: number;
}

function neighboursOf(nodes: readonly EndNode[]): Neighbour[][] {
  // Indexed by node, so "leaving segment S through end E" has its own list.
  const out: Neighbour[][] = nodes.map(() => []);

  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = 0; b < nodes.length; b += 1) {
      if (a === b) continue;
      const from = nodes[a];
      const to = nodes[b];
      if (from.segment === to.segment) continue;

      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const gap = Math.sqrt(dx * dx + dz * dz);
      if (gap > GAP_JOIN) continue;

      if (gap > TIGHT_JOIN) {
        // A bridged jump, and the heading test is what makes it safe. A
        // hairpin's two legs pass within metres of each other pointing in
        // opposite directions, and without this they would be welded into a
        // shortcut that skips half the route. `outward` points *out* of the
        // route at each end, so arriving through `to` means travelling the
        // other way down it.
        const arriving = to.outward + Math.PI;
        if (Math.abs(wrapAngle(arriving - from.outward)) > GAP_HEADING_TOLERANCE) continue;
      }

      // The segment's own length is added by the search rather than here: it is
      // a property of the segment being entered, not of the joint.
      out[a].push({
        segment: to.segment,
        enteringAtEntry: to.entry,
        cost: gap <= TIGHT_JOIN ? 0 : gap,
      });
    }
  }

  return out;
}

function segmentLength(segment: Segment): number {
  const dx = segment.exit.position.x - segment.entry.position.x;
  const dz = segment.exit.position.z - segment.entry.position.z;
  const chord = Math.sqrt(dx * dx + dz * dz);
  // An arc is longer than its chord. The correction is exact for a circular arc
  // turning by θ: length = chord · (θ/2) / sin(θ/2).
  const turn = Math.abs(wrapAngle(segment.exit.headingY - segment.entry.headingY));
  if (turn < 1e-4) return chord;
  const half = turn / 2;
  return chord * (half / Math.sin(half));
}

/** A traversal: which segment, and which way round. */
interface Step {
  readonly segment: number;
  /** True when the route runs entry → exit. */
  readonly forward: boolean;
}

/**
 * Dijkstra from one traversal state to any traversal that *ends* on `goal`.
 *
 * The state is (segment, direction), not just the segment: arriving at a beat
 * from its exit and from its entry are different situations and mixing them
 * produces a spine that doubles back on itself.
 */
function walkTo(
  segments: readonly Segment[],
  neighbours: readonly Neighbour[][],
  from: Step,
  goal: number,
): Step[] | null {
  const stateCount = segments.length * 2;
  const stateOf = (step: Step): number => step.segment * 2 + (step.forward ? 0 : 1);
  const best = new Float64Array(stateCount).fill(Infinity);
  const cameFrom = new Int32Array(stateCount).fill(-1);
  const visited = new Uint8Array(stateCount);

  const start = stateOf(from);
  best[start] = 0;

  for (;;) {
    let current = -1;
    let currentCost = Infinity;
    for (let state = 0; state < stateCount; state += 1) {
      if (visited[state] === 1 || best[state] >= currentCost) continue;
      current = state;
      currentCost = best[state];
    }
    if (current < 0) break;
    visited[current] = 1;

    const segment = current >> 1;
    const forward = (current & 1) === 0;
    if (segment === goal) {
      const path: Step[] = [];
      for (let state = current; state >= 0; state = cameFrom[state]) {
        path.push({ segment: state >> 1, forward: (state & 1) === 0 });
      }
      path.reverse();
      return path;
    }

    // Leaving through the far end of however this segment is being ridden.
    const leavingNode = segment * 2 + (forward ? 1 : 0);
    for (const neighbour of neighbours[leavingNode]) {
      // Arriving at a neighbour's entry means riding it forward.
      const next = neighbour.segment * 2 + (neighbour.enteringAtEntry ? 0 : 1);
      const cost = currentCost + neighbour.cost + segmentLength(segments[neighbour.segment]);
      if (cost >= best[next]) continue;
      best[next] = cost;
      cameFrom[next] = current;
    }
  }

  return null;
}

/** Distance from a point to a segment in plan, and where along it that landed. */
function pointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { t: number; distance: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSquared))
    : 0;
  const nx = px - (ax + dx * t);
  const nz = pz - (az + dz * t);
  return { t, distance: Math.sqrt(nx * nx + nz * nz) };
}

export class RouteSpine {
  private readonly points: readonly SpinePoint[];

  private constructor(points: readonly SpinePoint[]) {
    this.points = points;
  }

  /** Total length of the line, metres. */
  get length(): number {
    return this.points.length === 0 ? 0 : this.points[this.points.length - 1].distance;
  }

  /** How many samples the line is made of. Diagnostics and tests. */
  get sampleCount(): number {
    return this.points.length;
  }

  /**
   * Build the line for a plan, or return null if it has no route to follow.
   *
   * **Null is a real answer and callers must honour it.** A plan with fewer
   * than two checkpoints has no stated through line — the proving ground is
   * exactly that, and so is every unit-test fixture — and guessing one from
   * segment order would be a guess that reads as a working chase until the day
   * it silently follows a branch. The chase mode refuses such a world at its
   * entrance, which is `docs/PLANS.md` §13 q26's rule already.
   */
  static fromPlan(plan: LevelPlan): RouteSpine | null {
    const segments = plan.segments;
    if (segments.length === 0) return null;
    const gates = [...plan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
    if (gates.length < 2) return null;
    // This spine is deliberately open and clamps at both ends. A circuit's
    // `start, split, split...` spelling states a lap, not a through line: if it
    // is accepted here, the walk ends at the last sector and silently builds a
    // truncated chase route (713 m on BelVar's 930 m lap). A looping spine is
    // real future work and Track Day does not use one, so refuse the shape at
    // the boundary instead of making a cop that can only ride part of it.
    if (gates[0].kind !== 'start' || gates[gates.length - 1].kind !== 'finish') return null;

    const nodes = endNodes(segments);
    const neighbours = neighboursOf(nodes);

    // Which segment each gate stands on. A checkpoint is a gate *across* the
    // route, so the nearest segment chord is the one it belongs to.
    const gateSegments: number[] = [];
    for (const gate of gates) {
      let bestIndex = -1;
      let bestDistance = Infinity;
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const { distance } = pointToSegment(
          gate.centre.x, gate.centre.z,
          segment.entry.position.x, segment.entry.position.z,
          segment.exit.position.x, segment.exit.position.z,
        );
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        bestIndex = index;
      }
      if (bestIndex < 0) return null;
      if (gateSegments[gateSegments.length - 1] !== bestIndex) gateSegments.push(bestIndex);
    }

    // Where the route starts: the segment end nearest the spawn, ridden away
    // from it. The spawn is on the route by construction in both producers.
    let startNode = -1;
    let startDistance = Infinity;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const dx = node.x - plan.spawn.position.x;
      const dz = node.z - plan.spawn.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance >= startDistance) continue;
      startDistance = distance;
      startNode = index;
    }
    if (startNode < 0) return null;

    const first: Step = {
      segment: nodes[startNode].segment,
      forward: nodes[startNode].entry,
    };

    const route: Step[] = [first];
    for (const goal of gateSegments) {
      const here = route[route.length - 1];
      if (here.segment === goal) continue;
      const leg = walkTo(segments, neighbours, here, goal);
      // A route whose gates cannot be joined up is a route this file will not
      // guess at. Refusing is what makes the null case above meaningful.
      if (leg === null) return null;
      route.push(...leg.slice(1));
    }

    return new RouteSpine(samplePoints(segments, route));
  }

  /**
   * The point `distance` along the line, written into `out`.
   *
   * Clamped at both ends rather than wrapping: a generated route is
   * point-to-point (§13 q6), so past the end there is no more route and the
   * honest answer is the last point rather than the first.
   */
  sample(distance: number, out: SpineSample): SpineSample {
    const points = this.points;
    if (points.length === 0) {
      out.x = 0; out.y = 0; out.z = 0;
      out.headingY = 0; out.halfWidth = 0; out.distance = 0;
      return out;
    }

    const target = Math.min(Math.max(distance, 0), this.length);
    let index = 0;
    // Linear from the front. A route is a few hundred points and this runs
    // twice per step; a binary search would be faster and would also be the
    // third index this file maintains.
    while (index < points.length - 2 && points[index + 1].distance < target) index += 1;

    const a = points[index];
    const b = points[Math.min(index + 1, points.length - 1)];
    const span = b.distance - a.distance;
    const t = span > 1e-6 ? (target - a.distance) / span : 0;

    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.halfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * t;
    out.distance = target;
    // Heading from the sampled span rather than carried per point: it is then
    // the direction the line actually goes between these two points, which is
    // what anything following it needs, and it cannot disagree with them.
    out.headingY = Math.atan2(b.x - a.x, b.z - a.z);
    return out;
  }

  /**
   * Where a world point sits on the line.
   *
   * `near` is the distance along the line to search around, or a negative
   * number for a search of the whole route. **The window is not an
   * optimisation** — it is what stops a route that crosses itself from
   * teleporting a follower onto the other road at the crossing, which on a
   * generated route with a fork is a real geometry rather than a hypothetical.
   * The full search is used once, to find where a rider starts.
   */
  locate(x: number, z: number, near: number, out: SpineLocation): SpineLocation {
    const points = this.points;
    if (points.length < 2) {
      out.distance = 0;
      out.offRoute = 0;
      out.halfWidth = 0;
      return out;
    }

    const windowed = near >= 0;
    const from = windowed ? near - LOCATE_WINDOW : 0;
    const to = windowed ? near + LOCATE_WINDOW : this.length;

    let bestDistance = 0;
    let bestOff = Infinity;
    let bestHalfWidth = points[0].halfWidth;

    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (b.distance < from || a.distance > to) continue;
      const hit = pointToSegment(x, z, a.x, a.z, b.x, b.z);
      if (hit.distance >= bestOff) continue;
      bestOff = hit.distance;
      bestDistance = a.distance + (b.distance - a.distance) * hit.t;
      bestHalfWidth = a.halfWidth + (b.halfWidth - a.halfWidth) * hit.t;
    }

    if (bestOff === Infinity) {
      // The window fell off the end of the route — which happens the moment a
      // rider passes the last point. Answer from the end rather than reporting
      // nothing, because "off the end" is a place, not an error.
      const last = points[points.length - 1];
      const dx = x - last.x;
      const dz = z - last.z;
      out.distance = last.distance;
      out.offRoute = Math.sqrt(dx * dx + dz * dz);
      out.halfWidth = last.halfWidth;
      return out;
    }

    out.distance = bestDistance;
    out.offRoute = bestOff;
    out.halfWidth = bestHalfWidth;
    return out;
  }

  /**
   * How sharply the line turns between two distances, radians per metre.
   *
   * Signed, but nothing reads the sign yet: the cop slows for a corner and does
   * not care which way it bends. Taken over a span rather than at a point
   * because a sampled polyline's pointwise curvature is noise.
   */
  curvature(from: number, to: number, a: SpineSample, b: SpineSample): number {
    const span = Math.abs(to - from);
    if (span < 1e-3) return 0;
    this.sample(from, a);
    this.sample(to, b);
    return wrapAngle(b.headingY - a.headingY) / span;
  }
}

/** How far either side of the last known position `locate` searches, metres. */
const LOCATE_WINDOW = 45;

/**
 * Turn an ordered traversal into the sampled line.
 *
 * The Hermite is the whole of the geometry: two positions, two tangents scaled
 * by the chord, and a cubic. Its one approximation is that a beat whose sockets
 * disagree by more than a right angle bows slightly more than the arc the
 * generator laid — which no beat in the library does, and which would cost
 * centimetres on a road metres wide if one did.
 */
function samplePoints(segments: readonly Segment[], route: readonly Step[]): SpinePoint[] {
  const points: SpinePoint[] = [];
  let travelled = 0;

  const push = (x: number, y: number, z: number, halfWidth: number): void => {
    const previous = points[points.length - 1];
    if (previous !== undefined) {
      const dx = x - previous.x;
      const dz = z - previous.z;
      const step = Math.sqrt(dx * dx + dz * dz);
      // Two samples in the same place would make a zero-length span the
      // heading is read from, and `atan2(0, 0)` is a heading of nothing.
      if (step < 1e-3) return;
      travelled += step;
    }
    points.push({ x, y, z, halfWidth, distance: travelled });
  };

  for (const step of route) {
    const segment = segments[step.segment];
    const from: SegmentSocket = step.forward ? segment.entry : segment.exit;
    const to: SegmentSocket = step.forward ? segment.exit : segment.entry;
    // Both tangents point the way the route is travelled. The socket that is
    // being *left* through already does when the segment is ridden backwards,
    // which is why the flip is on the pair rather than on one of them.
    const fromHeading = step.forward ? from.headingY : from.headingY + Math.PI;
    const toHeading = step.forward ? to.headingY : to.headingY + Math.PI;

    const dx = to.position.x - from.position.x;
    const dz = to.position.z - from.position.z;
    const chord = Math.sqrt(dx * dx + dz * dz);
    const divisions = Math.max(2, Math.ceil(chord / SAMPLE_SPACING));

    const t0x = Math.sin(fromHeading) * chord;
    const t0z = Math.cos(fromHeading) * chord;
    const t1x = Math.sin(toHeading) * chord;
    const t1z = Math.cos(toHeading) * chord;

    for (let division = 0; division <= divisions; division += 1) {
      const t = division / divisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;

      push(
        h00 * from.position.x + h10 * t0x + h01 * to.position.x + h11 * t1x,
        // Height is linear between the sockets. The ground is the sampler's
        // answer and this is only ever a reference height (invariant 3).
        from.position.y + (to.position.y - from.position.y) * t,
        h00 * from.position.z + h10 * t0z + h01 * to.position.z + h11 * t1z,
        from.halfWidth + (to.halfWidth - from.halfWidth) * t,
      );
    }
  }

  return points;
}
