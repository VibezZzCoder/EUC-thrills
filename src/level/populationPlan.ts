/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Plain-data population authoring. No graphics/options imports.
 *
 * Source geometry contract:
 *   buildLevelPlan still owns PlacedSegment[]; emitPopulationPaths samples
 *   centrelineAt/headingAt there. Attach its plain result as the optional
 *   LevelPlan.populationPaths field. The finished plan (including precise
 *   frontage paving) is then passed to buildPopulationPlan. Missing traces
 *   produce an explicit missing-source report, never a socket reconstruction.
 *
 * tests/harness.ts:routePoints reconstructs sockets and adds a bollard detour;
 * that QA driver is deliberately NOT an authoring source for this module.
 */
import { POPULATION_AUTHORING } from '../data/tuning.ts';
import type { BoxCollider, Hazard, LevelPlan, Prop, Target } from './plan.ts';
import { centrelineAt, headingAt, surfaceHeightAt, type PlacedSegment } from './segments.ts';
import { hash128 } from './planDigest.ts';
import { physicalPopulationHull, transformPopulationHull, type PopulationHullPrism } from '../shared/populationHull.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { exactBuildingBody } from './protectedSiteEligibility.ts';
import { rectGrid, rectGridAny, type RectGrid } from './rectGrid.ts';
import { createGroundSample, type SurfaceId, type TerrainSampler, type Vec3 }
  from '../simulation/world.ts';

export type ActorKind = 'walker' | 'jogger' | 'fictionalEuc' | 'social' | 'worker'
  | 'parkedVehicle' | 'serviceVehicle' | 'trafficVehicle';
export type PathRole = 'pedestrian' | 'rider' | 'traffic' | 'service';
export type District = 'commercial' | 'residential' | 'park' | 'industrial';

/** Exact authoring frame, sampled before SegmentSpec is discarded. */
export interface AuthoredPathFrame {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly headingY: number;
  readonly distanceMetres: number;
  readonly sourceSegmentId: string;
  /** Clearance offered by an explicitly authored movement band, not road width. */
  readonly halfWidthMetres: number;
}

/** New optional plain-data LevelPlan field; source policy is authored, not guessed. */
export interface AuthoredPopulationPath {
  readonly id: string;
  readonly role: PathRole;
  readonly district: District;
  readonly frames: readonly AuthoredPathFrame[];
  readonly closed: boolean;
  /** A bounded service shuttle may reverse; ordinary traffic cannot. */
  readonly serviceShuttle: boolean;
}

/** Finished-ground sources are explicit additions, never new riding corridors.
 * Their polygons/patch ids share the original heightfield triangle planes. */
export interface PopulationGroundSource {
  readonly id: string;
  readonly purpose: 'turn-court' | 'driveway' | 'footpath' | 'parking-bay';
  readonly hostSegmentIds: readonly string[];
  readonly sourcePropIndex?: number;
  readonly polygons: readonly (readonly Vec3[])[];
  readonly groundPatchIds: readonly string[];
}
/** A connected, exact finished-footway social site, not an inferred moving lane. */
export interface AuthoredDistrictActivitySite {
  readonly id: string;
  readonly groupId: string;
  readonly district: District;
  readonly sourceId: string;
  readonly sourcePropIndex: number;
  readonly approachFrames: readonly AuthoredPathFrame[];
  readonly positions: readonly [
    { readonly position: Vec3; readonly headingY: number },
    { readonly position: Vec3; readonly headingY: number },
  ];
}

/** Purposeful use of one complete, physically admitted walk. Frontage walks
 * own exact finished triangles; park routes reuse their actual authored trace.
 * The digest rejects later path edits; actor behavior stays in the shared clock. */
export interface AuthoredDistrictActivityWalk {
  readonly id: string;
  readonly pathId: string;
  readonly pathDigest: string;
  readonly district: District;
  readonly kind: 'walker' | 'jogger' | 'worker';
  readonly intent: 'frontage-visit' | 'foot-service' | 'park-exercise';
  readonly owner: 'frontage' | 'authored-path';
  /** A contiguous original trace witness, never a reconstructed park connector. */
  readonly originalPathId?: string;
  readonly originalPathDigest?: string;
  readonly originalFrameRange?: readonly [number,number];
  readonly frontageId?: string;
  readonly sourceId?: string;
  readonly sourcePropIndex?: number;
}

export interface AuthoredParkingBay {
  readonly id: string;
  readonly sourceId: string;
  readonly sourcePropIndex: number;
  readonly position: Vec3;
  readonly headingY: number;
  readonly halfWidthMetres: number;
  readonly halfLengthMetres: number;
  /** Actual radius driveway geometry; stationary support never moves along it. */
  readonly approachFrames?: readonly AuthoredPathFrame[];
}
export interface FinishedFootpathRequest {
  readonly id: string;
  readonly hostSegmentId: string;
  readonly district: District;
  readonly fromS: number;
  readonly toS: number;
  readonly lateralMetres: number;
  readonly halfWidthMetres: number;
}
export interface PopulationCrossing {
  readonly id: string;
  readonly sourceId: string;
  readonly corners: readonly { readonly x: number; readonly z: number }[];
  readonly priority: 'pedestrian';
  readonly pedestrianPathIds: readonly string[];
  readonly vehiclePathIds: readonly string[];
}
export interface LivingWorldGroundReport {
  readonly acceptedTrafficLoops: readonly string[];
  readonly missingTrafficDistricts: readonly District[];
  readonly acceptedParkingBays: readonly string[];
  readonly rejected: readonly { readonly id: string; readonly reason: string;
    readonly span?: number; readonly sourceIds?: readonly string[] }[];
  readonly gaps: readonly string[];
}

/** A point on exact finished ground. No runtime object or graphical transform. */
export interface PathPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly headingY: number;
  readonly distanceMetres: number;
  readonly surface: SurfaceId;
  readonly sourceSegmentId: string;
}

export interface PopulationPath {
  readonly id: string;
  readonly role: PathRole;
  readonly district: District;
  readonly points: readonly PathPoint[];
  readonly lengthMetres: number;
  readonly closed: boolean;
  readonly serviceShuttle: boolean;
  readonly clearanceRadiusMetres: number;
  /** Exact endpoint links; runtime chooses within this finite connected graph. */
  readonly connections: readonly {
    readonly at: 'start' | 'end'; readonly pathId: string; readonly enterAt: 'start' | 'end';
  }[];
}

export interface ActivityAnchor {
  readonly id: string;
  readonly kind: 'social' | 'worker' | 'parking' | 'rest';
  readonly district: District;
  readonly position: Vec3;
  readonly headingY: number;
  readonly pathId: string;
  readonly distanceMetres: number;
  /** Stable original prop index; no invented workshop/bench at this point. */
  readonly sourcePropIndex: number;
  /** An explicit support pair, never a nearest-bench guess on another path. */
  readonly activitySiteId?: string;
}

export interface ActorSpec {
  readonly id: string;
  readonly kind: ActorKind;
  readonly pathId: string;
  readonly anchorId?: string;
  readonly socialGroupId?: string;
  /** Plain authoring identity only; movement/contact use the same actor system. */
  readonly activityWalkId?: string;
  readonly initialDistanceMetres: number;
  readonly direction: 1 | -1;
  readonly movement: 'stationary' | 'shuttle' | 'loop';
  readonly speedMetresPerSecond: number;
  readonly idleSeconds: number;
  readonly appearanceIndex: number;
  /** These physical dimensions MUST NOT change with quality/reduced-motion settings. */
  readonly hull: {
    readonly halfWidthMetres: number; readonly halfLengthMetres: number; readonly heightMetres: number;
  };
}

export interface PopulationPlan {
  readonly schema: 1;
  readonly rulesRevision: 'living-r1';
  readonly sourceWorldId: string;
  readonly installedWorldId: string;
  readonly contentDigest: string;
  readonly paths: readonly PopulationPath[];
  readonly anchors: readonly ActivityAnchor[];
  readonly actors: readonly ActorSpec[];
  /** Accepted path ids only. Vehicles yield to people occupying these cuts. */
  readonly crossings?: readonly PopulationCrossing[];
  readonly report: {
    /** A proved walk is not claimed as occupied without an actual admitted actor. */
    readonly inactiveActivityWalks?: readonly { readonly walkId: string; readonly pathId: string;
      readonly reason: 'no-initial-actor-admitted' }[];
    readonly missingAuthoredPaths: boolean;
    readonly rejected: readonly { readonly pathId: string; readonly reason: RejectionReason }[];
    readonly availableKinds: readonly ActorKind[];
    readonly missingKinds: readonly ActorKind[];
    readonly groundSupplement?: LivingWorldGroundReport;
  };
}

export type RejectionReason = 'invalid-source' | 'missing-segment' | 'narrow-band'
  | 'solid' | 'hazard' | 'spawn' | 'checkpoint' | 'trick' | 'lap' | 'target'
  | 'soft-body' | 'surface' | 'ground' | 'turn' | 'short' | 'open-traffic';


const ALL_KINDS: readonly ActorKind[] = [
  'walker', 'jogger', 'fictionalEuc', 'social', 'worker',
  'parkedVehicle', 'serviceVehicle', 'trafficVehicle',
];
const WALK_SURFACES: ReadonlySet<SurfaceId> = new Set([
  'pavement', 'roughPavement', 'brick', 'grass', 'gravel', 'dirt', 'wood',
]);
const VEHICLE_SURFACES: ReadonlySet<SurfaceId> = new Set(['pavement', 'roughPavement', 'brick']);
const R = POPULATION_AUTHORING;
const finite = (...values: number[]): boolean => {
  for (let index = 0; index < values.length; index += 1) if (!Number.isFinite(values[index])) return false;
  return true;
};
const distance = (a: Point2, b: Point2): number => Math.hypot(b.x - a.x, b.z - a.z);
const angle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
interface Point2 { readonly x: number; readonly z: number }

export interface PopulationPathRequest {
  readonly id: string;
  readonly role: PathRole;
  readonly district: District;
  readonly steps: readonly {
    readonly segmentId: string;
    readonly forward?: boolean;
    /** Positive is left of the ORIGINAL source corridor heading. */
    readonly lateralMetres: number;
    readonly halfWidthMetres: number;
    /** Original absolute stations; reversing changes travel, never this interval. */
    readonly fromS?: number;
    readonly toS?: number;
  }[];
  readonly closed?: boolean;
  readonly serviceShuttle?: boolean;
}

/**
 * Called inside buildLevelPlan, while `placed` is still factual. Requests
 * designate genuine sidewalks/park lanes/service bands/vehicle lanes. They
 * must not be manufactured by treating every broad paved plaza as a road.
 * No inferred chords, Hermite curves, join bridges or U-turns are introduced.
 * A discontinuity is an authoring error requiring an actual supplied path.
 */
export function emitPopulationPaths(
  placed: readonly PlacedSegment[], requests: readonly PopulationPathRequest[],
  spacingMetres: number = R.traceSpacingMetres,
): readonly AuthoredPopulationPath[] {
  if (!finite(spacingMetres) || spacingMetres <= 0 || spacingMetres > R.maximumSourceSpacingMetres) {
    throw new RangeError('Population traces require positive spacing no greater than one metre');
  }
  const byId = new Map(placed.map(segment => [segment.spec.id, segment]));
  const ids = new Set<string>();
  return requests.map(request => {
    if (!request.id || ids.has(request.id) || request.steps.length === 0) {
      throw new Error('Population authoring needs unique nonempty paths and source steps');
    }
    ids.add(request.id);
    const frames: AuthoredPathFrame[] = [];
    let travelled = 0;
    for (const step of request.steps) {
      const source = byId.get(step.segmentId);
      if (!source) throw new Error(`Population path ${request.id} has no source ${step.segmentId}`);
      const { spec, entry } = source;
      const fromS = step.fromS ?? 0, toS = step.toS ?? spec.length;
      if (!finite(spec.length, spec.halfWidth, step.lateralMetres, step.halfWidthMetres, fromS, toS)
        || spec.length <= 0 || step.halfWidthMetres <= 0
        || fromS < 0 || toS > spec.length || toS <= fromS
        || Math.abs(step.lateralMetres) + step.halfWidthMetres > spec.halfWidth + R.epsilon) {
        throw new Error(`Population path ${request.id} lies outside its authored corridor band`);
      }
      const count = Math.max(1, Math.ceil((toS - fromS) / spacingMetres));
      for (let index = 0; index <= count; index += 1) {
        const forward = step.forward !== false;
        const s = fromS + (toS - fromS) * (forward ? index : count - index) / count;
        const point = centrelineAt(entry, spec, s);
        const sourceHeading = headingAt(entry, spec, s);
        const x = point.x + Math.cos(sourceHeading) * step.lateralMetres;
        const z = point.z - Math.sin(sourceHeading) * step.lateralMetres;
        const headingY = angle(sourceHeading + (forward ? 0 : Math.PI));
        const previous = frames[frames.length - 1];
        if (previous) {
          const gap = distance(previous, { x, z });
          if (index === 0) {
            if (gap > R.joinToleranceMetres
              || Math.abs(angle(headingY - previous.headingY)) > R.joinHeadingToleranceRadians) {
              throw new Error(`Population path ${request.id} needs authored join/turn geometry at ${step.segmentId}`);
            }
            continue;
          }
          travelled += gap;
        }
        frames.push({ x, y: surfaceHeightAt(entry, spec, s, step.lateralMetres), z, headingY, distanceMetres: travelled,
          sourceSegmentId: step.segmentId, halfWidthMetres: step.halfWidthMetres });
      }
    }
    if (request.closed && (distance(frames[0], frames[frames.length - 1]) > R.joinToleranceMetres
      || Math.abs(angle(frames[0].headingY - frames[frames.length - 1].headingY)) > R.joinHeadingToleranceRadians)) {
      throw new Error(`Population loop ${request.id} does not close on its authored path`);
    }
    return { id: request.id, role: request.role, district: request.district, frames,
      closed: request.closed === true, serviceShuttle: request.serviceShuttle === true };
  });
}

/** Each content choice hashes its own name; no generator stream is advanced. */
export function populationChoice(worldId: string, domain: string, itemId: string): number {
  return Number.parseInt(hash128(`${worldId}/population/${domain}/${itemId}`).slice(0, 8), 16) / 4294967296;
}

/** Preserve old stored results. A populated physical world receives a new key. */
export function populationWorldId(sourceWorldId: string, hasActors: boolean): string {
  if (!sourceWorldId || sourceWorldId.length > 64) throw new RangeError('Invalid population source world id');
  if (!hasActors) return sourceWorldId;
  const suffix = `~${R.revision}`;
  const result = sourceWorldId.length + suffix.length <= 64
    ? `${sourceWorldId}${suffix}` : `world-${hash128(sourceWorldId)}${suffix}`;
  return result;
}

function segmentDistance(point: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const denominator = dx * dx + dz * dz;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.z - a.z) * dz) / denominator));
  return Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz);
}

function cross(a: Point2, b: Point2, p: Point2): number {
  return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
}
function area(polygon: readonly Point2[]): number {
  // The reduce's exact fold order: ((sum + p.x * next.z) - next.x * p.z).
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p = polygon[i], next = polygon[(i + 1) % polygon.length]; sum = sum + p.x * next.z - next.x * p.z;
  }
  return Math.abs(sum) * 0.5;
}
function insideConvex(point: Point2, polygon: readonly Point2[]): boolean {
  let positive = false, negative = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const value = cross(polygon[i], polygon[(i + 1) % polygon.length], point);
    positive ||= value > R.epsilon; negative ||= value < -R.epsilon;
    // Once both signs exist, later edges cannot restore convex containment.
    if (positive && negative) return false;
  }
  return true;
}
function meetsPolygon(a: Point2, b: Point2, corners: readonly Point2[], radius: number): boolean {
  if (insideConvex(a, corners) || insideConvex(b, corners)) return true;
  for (let i = 0; i < corners.length; i += 1) {
    const c = corners[i], d = corners[(i + 1) % corners.length];
    if (segmentDistance(c, a, b) <= radius || segmentDistance(a, c, d) <= radius
      || segmentDistance(b, c, d) <= radius) return true;
    const abC = cross(a, b, c), abD = cross(a, b, d);
    const cdA = cross(c, d, a), cdB = cross(c, d, b);
    if (abC * abD < 0 && cdA * cdB < 0) return true;
  }
  return false;
}

/** Clip by one directed half-plane, retaining either its inside or outside. */
const halfPlaneValues: number[] = [];
function halfPlane(polygon: readonly Point2[], a: Point2, b: Point2, keepInside: boolean): Point2[] {
  const result: Point2[] = [];
  // Each vertex's pure value is computed once and read as both `first` and `last`.
  const values = halfPlaneValues, sign = keepInside ? 1 : -1;
  for (let i = 0; i < polygon.length; i += 1) values[i] = cross(a, b, polygon[i]) * sign;
  for (let i = 0; i < polygon.length; i += 1) {
    const next = (i + 1) % polygon.length;
    const start = polygon[i], end = polygon[next];
    const first = values[i], last = values[next];
    if (first >= -R.epsilon) result.push(start);
    if ((first >= 0) !== (last >= 0)) {
      const t = first / (first - last);
      result.push({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
    }
  }
  return result;
}
function upward(polygon: readonly Point2[]): readonly Point2[] {
  const signed = polygon.reduce((sum, p, i) => {
    const next = polygon[(i + 1) % polygon.length]; return sum + p.x * next.z - next.x * p.z;
  }, 0);
  return signed >= 0 ? polygon : [...polygon].reverse();
}
function intersection(polygon: readonly Point2[], clip: readonly Point2[]): Point2[] {
  let result = [...polygon]; const ordered = upward(clip);
  for (let i = 0; i < ordered.length && result.length; i += 1) {
    result = halfPlane(result, ordered[i], ordered[(i + 1) % ordered.length], true);
  }
  return result;
}
/** Disjoint convex pieces of polygon minus one convex clip, avoiding area double-counting. */
function subtract(polygon: readonly Point2[], clip: readonly Point2[]): Point2[][] {
  return subtractOrdered(polygon, upward(clip));
}
/** subtract with its clip already in upward order. halfPlane(remainder, a, b,
 * false) and halfPlane(remainder, a, b, true) read the same cross values,
 * negated exactly for the outside; one pass forms both identical lists. */
function subtractOrdered(polygon: readonly Point2[], ordered: readonly Point2[]): Point2[][] {
  const out: Point2[][] = []; let remainder: readonly Point2[] = polygon;
  for (let i = 0; i < ordered.length && remainder.length; i += 1) {
    const a = ordered[i], b = ordered[(i + 1) % ordered.length];
    const values = halfPlaneValues, count = remainder.length;
    for (let j = 0; j < count; j += 1) values[j] = cross(a, b, remainder[j]);
    const outside: Point2[] = [], inside: Point2[] = [];
    for (let j = 0; j < count; j += 1) {
      const next = (j + 1) % count, start = remainder[j], end = remainder[next];
      let first = values[j] * -1, last = values[next] * -1;
      if (first >= -R.epsilon) outside.push(start);
      if ((first >= 0) !== (last >= 0)) {
        const t = first / (first - last);
        outside.push({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
      }
      first = values[j] * 1; last = values[next] * 1;
      if (first >= -R.epsilon) inside.push(start);
      if ((first >= 0) !== (last >= 0)) {
        const t = first / (first - last);
        inside.push({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t });
      }
    }
    if (outside.length >= 3 && area(outside) > R.epsilon) out.push(outside);
    remainder = inside;
  }
  return out;
}

function convexHull(points: readonly Point2[]): Point2[] {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const half = (input: readonly Point2[]): Point2[] => {
    const result: Point2[] = [];
    for (const point of input) {
      while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  const lower = half(ordered), upper = half([...ordered].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Reused scratch for the typed monotone chain below (synchronous only). */
const HULL_LIMIT = 256;
const hullX = new Float64Array(HULL_LIMIT), hullZ = new Float64Array(HULL_LIMIT);
const hullOrder = new Int32Array(HULL_LIMIT), hullLower = new Int32Array(HULL_LIMIT + 1);
const hullUpper = new Int32Array(HULL_LIMIT + 1);
const hullBuffer = new Int32Array(HULL_LIMIT);
/** The comparator a.x - b.x || a.z - b.z is positive (finite values). */
function hullGreater(a: number, b: number): boolean {
  const dx = hullX[a] - hullX[b];
  return dx > 0 || (dx === 0 && hullZ[a] - hullZ[b] > 0);
}
/** The stable sorted permutation of the scratch points into hullOrder. When
 * the input is made of consecutive non-decreasing runs of four (each expanded
 * square), a stable bottom-up merge (left element first on ties) produces that
 * same unique permutation with fewer comparisons; otherwise insertion sort. */
function sortHull(count: number): void {
  let runs = count % 4 === 0;
  for (let index = 1; runs && index < count; index += 1) if (index % 4 && hullGreater(index - 1, index)) runs = false;
  if (!runs) {
    for (let index = 0; index < count; index += 1) {
      // Shift only elements that compare greater: equal keys stay in input order.
      let position = index;
      while (position > 0 && hullGreater(hullOrder[position - 1], index)) {
        hullOrder[position] = hullOrder[position - 1]; position -= 1;
      }
      hullOrder[position] = index;
    }
    return;
  }
  let source = hullOrder, target = hullBuffer;
  for (let index = 0; index < count; index += 1) source[index] = index;
  for (let width = 4; width < count; width *= 2) {
    for (let left = 0; left < count; left += 2 * width) {
      const middle = Math.min(left + width, count), right = Math.min(left + 2 * width, count);
      let i = left, j = middle, k = left;
      while (i < middle && j < right) target[k++] = hullGreater(source[i], source[j]) ? source[j++] : source[i++];
      while (i < middle) target[k++] = source[i++];
      while (j < right) target[k++] = source[j++];
    }
    const swap = source; source = target; target = swap;
  }
  if (source !== hullOrder) hullOrder.set(source.subarray(0, count));
}
/** convexHull over the coordinates already in the scratch arrays, for finite
 * values only. sortHull yields exactly the stable Array.prototype.sort
 * permutation for the same comparator (a.x - b.x || a.z - b.z is a consistent
 * total preorder on finite numbers), and the chain evaluates the identical
 * cross() arithmetic in the identical order. */
function typedConvexHull(count: number): Point2[] {
  sortHull(count);
  const turn = (a: number, b: number, p: number): number =>
    (hullX[b] - hullX[a]) * (hullZ[p] - hullZ[a]) - (hullZ[b] - hullZ[a]) * (hullX[p] - hullX[a]);
  let lower = 0;
  for (let rank = 0; rank < count; rank += 1) {
    const point = hullOrder[rank];
    while (lower > 1 && turn(hullLower[lower - 2], hullLower[lower - 1], point) <= 0) lower -= 1;
    hullLower[lower++] = point;
  }
  let upper = 0;
  for (let rank = count - 1; rank >= 0; rank -= 1) {
    const point = hullOrder[rank];
    while (upper > 1 && turn(hullUpper[upper - 2], hullUpper[upper - 1], point) <= 0) upper -= 1;
    hullUpper[upper++] = point;
  }
  const result: Point2[] = [];
  for (let index = 0; index < lower - 1; index += 1) result.push({ x: hullX[hullLower[index]], z: hullZ[hullLower[index]] });
  for (let index = 0; index < upper - 1; index += 1) result.push({ x: hullX[hullUpper[index]], z: hullZ[hullUpper[index]] });
  return result;
}

function expandedPolygon(points: readonly Point2[], margin: number): Point2[] {
  const count = points.length * 4;
  if (count > 0 && count <= HULL_LIMIT) {
    let finiteInput = true, index = 0;
    // Same candidate order and arithmetic as the flatMap below.
    for (const point of points) for (let x = -1; x <= 1; x += 2) for (let z = -1; z <= 1; z += 2) {
      const px = point.x + x * margin, pz = point.z + z * margin;
      hullX[index] = px; hullZ[index] = pz; index += 1;
      if (!Number.isFinite(px) || !Number.isFinite(pz)) finiteInput = false;
    }
    if (finiteInput) return typedConvexHull(count);
  }
  return convexHull(points.flatMap(point => [-1, 1].flatMap(x => [-1, 1].map(z => ({
    x: point.x + x * margin, z: point.z + z * margin,
  })))));
}

/** expandedPolygon(footprintCorners(...), margin), writing the identical
 * corner and expansion arithmetic straight into the hull scratch. */
function footprintPolygon(first: PopulationHullPrism, last: PopulationHullPrism,
  actualFirst: PopulationHullPrism, actualLast: PopulationHullPrism, margin: number): Point2[] {
  const bodies = footprintBodies(first, last, actualFirst, actualLast);
  let index = 0, finiteInput = true;
  for (const body of bodies) {
    const c = Math.cos(body.headingY), s = Math.sin(body.headingY);
    for (let x = -1; x <= 1; x += 2) for (let z = -1; z <= 1; z += 2) {
      const cornerX = body.x + c * x * body.halfWidthMetres + s * z * body.halfLengthMetres;
      const cornerZ = body.z - s * x * body.halfWidthMetres + c * z * body.halfLengthMetres;
      for (let ex = -1; ex <= 1; ex += 2) for (let ez = -1; ez <= 1; ez += 2) {
        const px = cornerX + ex * margin, pz = cornerZ + ez * margin;
        hullX[index] = px; hullZ[index] = pz; index += 1;
        if (!Number.isFinite(px) || !Number.isFinite(pz)) finiteInput = false;
      }
    }
  }
  return finiteInput ? typedConvexHull(index) : expandedPolygon(footprintCorners(first, last, actualFirst, actualLast), margin);
}
function footprintBodies(first: PopulationHullPrism, last: PopulationHullPrism,
  actualFirst: PopulationHullPrism, actualLast: PopulationHullPrism): PopulationHullPrism[] {
  // Object.is keeps signed zeros distinct, so twins are bit-identical inputs.
  const same = (one: PopulationHullPrism, two: PopulationHullPrism): boolean => Object.is(one.x, two.x)
    && Object.is(one.z, two.z) && Object.is(one.headingY, two.headingY)
    && Object.is(one.halfWidthMetres, two.halfWidthMetres) && Object.is(one.halfLengthMetres, two.halfLengthMetres)
    && Number.isFinite(one.x) && Number.isFinite(one.z) && Number.isFinite(one.headingY)
    && Number.isFinite(one.halfWidthMetres) && Number.isFinite(one.halfLengthMetres);
  const bodies = [first, last];
  if (!same(actualFirst, first)) bodies.push(actualFirst);
  if (!same(actualLast, last)) bodies.push(actualLast);
  return bodies;
}
/** [...hullCorners(first), ...hullCorners(last), ...hullCorners(actualFirst),
 * ...hullCorners(actualLast)] for expandedPolygon, omitting an actual pose
 * whose five corner inputs equal its triangle-normal twin. Its sixteen
 * candidates would duplicate the twin's exactly; in Andrew's chain an exact
 * duplicate that sorts beside its twin (equal keys stay adjacent in the stable
 * order) only replaces it with identical coordinates, so the hull's vertex
 * values and order are unchanged. */
function footprintCorners(first: PopulationHullPrism, last: PopulationHullPrism,
  actualFirst: PopulationHullPrism, actualLast: PopulationHullPrism): Point2[] {
  return footprintBodies(first, last, actualFirst, actualLast).flatMap(hullCorners);
}
function hullCorners(body: PopulationHullPrism): Point2[] {
  const c = Math.cos(body.headingY), s = Math.sin(body.headingY);
  const result: Point2[] = [];
  // Same order and arithmetic as [-1, 1].flatMap(x => [-1, 1].map(z => ...)).
  for (let x = -1; x <= 1; x += 2) for (let z = -1; z <= 1; z += 2) result.push({
    x: body.x + c * x * body.halfWidthMetres + s * z * body.halfLengthMetres,
    z: body.z - s * x * body.halfWidthMetres + c * z * body.halfLengthMetres,
  });
  return result;
}

export interface PopulationSpanFootprint {
  readonly polygon: readonly Point2[];
  readonly minY: number;
  readonly maxY: number;
  readonly fromFraction: number;
  readonly toFraction: number;
  readonly fromHull: PopulationHullPrism;
  readonly toHull: PopulationHullPrism;
}

interface PreparedPolygon {
  readonly polygon: readonly Point2[];
  readonly axes: readonly { x: number; z: number; min: number; max: number;
    readonly finiteProjectionCoordinateLimit: number }[];
  /** Coordinate bounds are used only to enclose original-axis projections.
   * They are never an overlap predicate or a replacement SAT envelope. */
  readonly projectionBounds?: SpatialBounds & { readonly magnitude: number };
}
interface PreparedBox extends PreparedPolygon { readonly minY: number; readonly maxY: number }
interface SpatialBounds { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
interface SpatialItem<T> { readonly value: T; readonly order: number; readonly bounds: SpatialBounds }
interface SpatialNode<T> { readonly bounds: SpatialBounds; readonly items?: readonly SpatialItem<T>[];
  readonly left?: SpatialNode<T>; readonly right?: SpatialNode<T> }
/** A call-scoped convex coverage index. It never memoizes an ownership answer. */
export interface GroundSourceCoverageIndex { readonly source: PopulationGroundSource;
  readonly polygons: PopulationGroundSource['polygons']; readonly root?: SpatialNode<readonly Point2[]> }
interface SpanProof { readonly sampler: TerrainSampler; readonly surfaces?: ReadonlySet<SurfaceId>;
  /** The values the original signature stringified, captured at creation;
   * the signature string itself is formed only when a lookup compares it. */
  readonly signatureValues: readonly unknown[]; signature?: string; readonly reason: RejectionReason | null;
  /** The pure footprints this proof computed, kept only when a caller asks. */
  footprints?: readonly PopulationSpanFootprint[] }
interface MovementReservation { readonly pathId?: string; readonly polygon: PreparedPolygon; readonly invalid?: true }
function polygonBounds(polygon: readonly Point2[]): SpatialBounds {
  return { minX: Math.min(...polygon.map(p => p.x)), maxX: Math.max(...polygon.map(p => p.x)),
    minZ: Math.min(...polygon.map(p => p.z)), maxZ: Math.max(...polygon.map(p => p.z)) };
}
function allBounds(): SpatialBounds { return { minX:-Infinity,maxX:Infinity,minZ:-Infinity,maxZ:Infinity }; }
/** Bounds enclose the same epsilon-expanded directed half-planes used by the
 * exact clipper. Tiny, collinear or non-convex boundaries remain unbounded and
 * therefore cannot be pruned. This is a broad phase, never a coverage proof. */
function clipBounds(polygon: readonly Point2[]): SpatialBounds {
  if (polygon.length<3 || polygon.some(p=>!finite(p.x,p.z))) return allBounds();
  const points=upward(polygon), expanded:Point2[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
    const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-b.x,vz=c.z-b.z;
    const determinant=ux*vz-uz*vx;
    if (!(determinant>R.epsilon)) return allBounds();
    // Intersect both outward-shifted lines relative to their shared vertex.
    const x=R.epsilon*(ux-vx)/determinant, z=R.epsilon*(uz-vz)/determinant;
    expanded.push({x:b.x+x,z:b.z+z});
  }
  const bounds=polygonBounds([...points,...expanded]);
  const margin=R.epsilon*(1+Math.max(Math.abs(bounds.minX),Math.abs(bounds.maxX),Math.abs(bounds.minZ),Math.abs(bounds.maxZ)));
  return {minX:bounds.minX-margin,maxX:bounds.maxX+margin,minZ:bounds.minZ-margin,maxZ:bounds.maxZ+margin};
}
/** Legacy SAT may carry unordered vertices. Its actual predicate is the
 * intersection of every min/max projection strip, which encloses the original
 * hull and may be wider. Bound that strip envelope, never just the raw vertices.
 * Keeping all non-parallel line intersections is deliberately conservative;
 * no SAT axis, epsilon, acceptance or rejection is changed by this broad phase. */
function reservationBounds(polygon:PreparedPolygon):SpatialBounds {
  const planes=polygon.axes.flatMap(axis=>[
    {x:axis.x,z:axis.z,limit:axis.max+R.epsilon},
    {x:-axis.x,z:-axis.z,limit:-axis.min+R.epsilon}]);
  if(planes.some(p=>!finite(p.x,p.z,p.limit)))return allBounds();
  const points:Point2[]=[];
  for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++){
    const a=planes[i],b=planes[j],determinant=a.x*b.z-a.z*b.x;
    if(determinant===0)continue;
    if(Math.abs(determinant)<=R.epsilon)return allBounds();
    const x=(a.limit*b.z-a.z*b.limit)/determinant,z=(a.x*b.limit-a.limit*b.x)/determinant;
    if(!finite(x,z))return allBounds();points.push({x,z});
  }
  if(!points.length)return allBounds();
  const bounds=polygonBounds(points),margin=R.epsilon*(1+Math.max(Math.abs(bounds.minX),Math.abs(bounds.maxX),Math.abs(bounds.minZ),Math.abs(bounds.maxZ)));
  return {minX:bounds.minX-margin,maxX:bounds.maxX+margin,minZ:bounds.minZ-margin,maxZ:bounds.maxZ+margin};
}
function boundsMeet(a:SpatialBounds,b:SpatialBounds):boolean {
  return !(a.maxX<b.minX||b.maxX<a.minX||a.maxZ<b.minZ||b.maxZ<a.minZ);
}
function spatialTree<T>(items:readonly SpatialItem<T>[]):SpatialNode<T>|undefined {
  if(!items.length)return undefined;
  const bounds={minX:Math.min(...items.map(i=>i.bounds.minX)),maxX:Math.max(...items.map(i=>i.bounds.maxX)),
    minZ:Math.min(...items.map(i=>i.bounds.minZ)),maxZ:Math.max(...items.map(i=>i.bounds.maxZ))};
  if(items.length<=8)return {bounds,items};
  const xAxis=bounds.maxX-bounds.minX>=bounds.maxZ-bounds.minZ;
  const centre=(i:SpatialItem<T>):number=>xAxis?(i.bounds.minX+i.bounds.maxX)/2:(i.bounds.minZ+i.bounds.maxZ)/2;
  const ordered=[...items].sort((a,b)=>centre(a)-centre(b)||a.order-b.order),half=Math.floor(items.length/2);
  return {bounds,left:spatialTree(ordered.slice(0,half)),right:spatialTree(ordered.slice(half))};
}
function spatialQuery<T>(root:SpatialNode<T>|undefined,bounds:SpatialBounds):readonly SpatialItem<T>[] {
  const result:SpatialItem<T>[]=[];
  const visit=(node:SpatialNode<T>|undefined):void=>{
    if(!node||!boundsMeet(node.bounds,bounds))return;
    if(node.items)for(const item of node.items){if(boundsMeet(item.bounds,bounds))result.push(item);}
    else {visit(node.left);visit(node.right);}
  };
  visit(root);return result.sort((a,b)=>a.order-b.order);
}
/** Boolean reservation queries neither allocate nor sort a candidate list.
 * The exact predicate still decides every visited leaf, and short-circuiting
 * after its first true result changes no boolean answer. Coverage subtraction
 * retains spatialQuery and its required original boundary ordering. */
function spatialAny<T>(root:SpatialNode<T>|undefined,bounds:SpatialBounds,predicate:(value:T)=>boolean):boolean {
  if(!root||!boundsMeet(root.bounds,bounds))return false;
  if(root.items)return root.items.some(item=>boundsMeet(item.bounds,bounds)&&predicate(item.value));
  return spatialAny(root.left,bounds,predicate)||spatialAny(root.right,bounds,predicate);
}
/** Coordinate ranges outside which preparedPolygonsMeet(query, other) or
 * preparedPolygonsMeet(other, query) is provably false for any other polygon
 * with finite vertices. A query axis with z === 0 (or x === 0) projects every
 * finite vertex as fl(x * axis.x) (or fl(z * axis.z)), monotone in x (or z),
 * so the original SAT separates the whole polygon once its coordinate extent
 * lies beyond these limits; the slack dwarfs every rounding error. No axis,
 * epsilon, comparison or projection of the exact predicate is changed.
 * The extremes come from the polygon's own rectangle (see below). */
function alignedSatBoundsOf(polygon: readonly Point2[],
  bounds: PreparedPolygon['projectionBounds'] = finiteProjectionBounds(polygon)): SpatialBounds | undefined {
  // Any non-finite vertex makes every aligned axis's Math.min/max non-finite,
  // so no axis would bound. With finite vertices an aligned axis projects as
  // fl(x * scale) (+/-0), monotone in x, so its extremes are the rectangle's
  // ends times the scale; signed zeros cannot change the derived limits.
  if (!bounds) return undefined;
  let minX = -Infinity, maxX = Infinity, minZ = -Infinity, maxZ = Infinity, bounded = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const first = polygon[index], last = polygon[(index + 1) % polygon.length];
    const x = last.z - first.z, z = first.x - last.x;
    const xAxis = z === 0 && x !== 0, zAxis = x === 0 && z !== 0;
    if (!xAxis && !zAxis) continue;
    const scale = xAxis ? x : z, low = xAxis ? bounds.minX : bounds.minZ, high = xAxis ? bounds.maxX : bounds.maxZ;
    const min = scale > 0 ? low * scale : high * scale, max = scale > 0 ? high * scale : low * scale;
    // alignedSatBounds' arithmetic for this axis, unallocated.
    const one = (min - R.epsilon) / scale, two = (max + R.epsilon) / scale;
    if (!(Number.isFinite(scale) && Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(one) && Number.isFinite(two))) continue;
    const slack = 1e-6 + 1e-9 * (Math.abs(one) + Math.abs(two));
    const lower = Math.min(one, two) - slack, upper = Math.max(one, two) + slack;
    if (xAxis) { minX = Math.max(minX, lower); maxX = Math.min(maxX, upper); }
    else { minZ = Math.max(minZ, lower); maxZ = Math.min(maxZ, upper); }
    bounded = true;
  }
  return bounded ? { minX, maxX, minZ, maxZ } : undefined;
}
export function prepareGroundSourceCoverage(source:PopulationGroundSource):GroundSourceCoverageIndex {
  return {source,polygons:source.polygons,root:spatialTree(source.polygons.map((polygon,order)=>({value:polygon,order,bounds:clipBounds(polygon)})))};
}
function prepareMovementReservations(plan:LevelPlan):readonly MovementReservation[] {
  const result:MovementReservation[]=[];
  for(const path of plan.populationPaths??[]) {
    if(path.id.startsWith('district-activity/'))continue;
    for(let i=1;i<path.frames.length;i++) {
      const a=path.frames[i-1],b=path.frames[i],length=distance(a,b),width=Math.max(a.halfWidthMetres,b.halfWidthMetres);
      if(!finite(length,width)||width<0){result.push({pathId:path.id,polygon:preparedPolygon([]),invalid:true});continue;}
      result.push({pathId:path.id,polygon:preparedPolygon(boxPolygon({centre:{x:(a.x+b.x)/2,y:0,z:(a.z+b.z)/2},
        halfExtents:{x:width+R.staticClearanceMetres,y:1,z:length/2+width+R.staticClearanceMetres},
        rotationY:Math.atan2(b.x-a.x,b.z-a.z),surface:'pavement'},0))});
    }
  }
  for(const source of plan.populationGroundSources??[])if(source.purpose!=='footpath')
    for(const boundary of source.polygons)result.push({polygon:preparedPolygon(boundary)});
  for(const crossing of plan.populationCrossings??[])result.push({polygon:preparedPolygon(crossing.corners)});
  return result;
}
/** Call-scoped preparation for one finished, unchanged plan. It is deliberately
 * not a global plan cache: authoring can replace patches between candidates. */
export interface PopulationValidationContext {
  readonly plan: LevelPlan;
  readonly patchesByCell: ReadonlyMap<number, readonly { surface: SurfaceId; vertices: readonly Vec3[] }[]>;
  readonly patchSurfaces: readonly SurfaceId[];
  /** patchSurfaces without repeats (same membership, first-occurrence order). */
  readonly patchSurfaceKinds?: readonly SurfaceId[];
  readonly boxes: readonly PreparedBox[];
  readonly softBodies: readonly PreparedPolygon[];
  readonly checkpoints: readonly PreparedPolygon[];
  readonly trickZones: readonly PreparedPolygon[];
  readonly validGroundSources: ReadonlyMap<string, PopulationGroundSource>;
  readonly presentSourceIds: ReadonlySet<string>;
  readonly groundSourcesById: ReadonlyMap<string, PopulationGroundSource>;
  readonly sourceCoverage: ReadonlyMap<PopulationGroundSource, GroundSourceCoverageIndex>;
  /** Exact immutable objects consumed by movement authoring, not every footpath append. */
  readonly movementInputs: MovementInputs;
  /** Built on first movement query from this context's verified movement inputs. */
  readonly movementIndex?: () => MovementIndex;
  readonly movementTree?: SpatialNode<MovementReservation>;
  /** Broad phases over the same items; exact predicates still decide. */
  readonly movementGrid?: RectGrid<SpatialItem<MovementReservation>>;
  readonly boxGrid?: RectGrid<PreparedBox>;
  readonly softBodyGrid?: RectGrid<PreparedPolygon>;
  /** Source colliders of boxes/softBodies with every scalar their preparation read. */
  readonly boxInputs?: PreparedBoxInputs;
  readonly softBodyInputs?: PreparedBoxInputs;
  /** Broad phase over this plan's hazards and targets, built on first use. */
  readonly pointObstacles?: () => PointObstacleIndex;
  readonly invalidMovement: readonly MovementReservation[];
  readonly spanProofs: Map<AuthoredPopulationPath, Map<AuthoredPathFrame, Map<AuthoredPathFrame, SpanProof[]>>>;
  readonly inputArrays: readonly unknown[];
}
/** A finite raw coordinate rectangle encloses each original vertex. IEEE
 * multiplication by a fixed finite axis component, then addition, are monotone
 * on this overflow-free range. Its extreme projections therefore enclose the
 * exact floating-point projections used by the original SAT. NaN, infinity,
 * empty polygons and overflow-prone scales disable the filter. */
function finiteProjectionBounds(polygon: readonly Point2[]): PreparedPolygon['projectionBounds'] {
  if (!polygon.length) return undefined;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of polygon) {
    if (!(Number.isFinite(point.x) && Number.isFinite(point.z))) return undefined;
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ,
    magnitude: Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minZ), Math.abs(maxZ)) };
}
/** One edge axis with its exact projection extremes. Folding Math.min/max
 * pairwise from +/-Infinity equals Math.min(...values)/Math.max(...values),
 * including NaN poisoning and signed zeros, without temporary arrays. */
function preparedAxis(polygon: readonly Point2[], index: number): PreparedPolygon['axes'][number] {
  const first = polygon[index], last = polygon[(index + 1) % polygon.length], x = last.z - first.z, z = first.x - last.x;
  let min = Infinity, max = -Infinity;
  for (let other = 0; other < polygon.length; other += 1) {
    const point = polygon[other], value = point.x * x + point.z * z;
    min = Math.min(min, value); max = Math.max(max, value);
  }
  const scale = Math.abs(x) + Math.abs(z);
  return { x, z, min, max,
    // Each product and their sum stay finite. Overflow of 4*scale makes
    // the bound zero, conservatively disabling ordinary nonzero queries.
    finiteProjectionCoordinateLimit: (Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(scale)) ? Number.MAX_VALUE / (4 * scale) : -1 };
}
function preparedPolygon(polygon: readonly Point2[]): PreparedPolygon {
  const axes: PreparedPolygon['axes'][number][] = [];
  for (let index = 0; index < polygon.length; index += 1) axes.push(preparedAxis(polygon, index));
  return { polygon, projectionBounds: finiteProjectionBounds(polygon), axes };
}
function preparedAxisSeparates(axis: PreparedPolygon['axes'][number], other: PreparedPolygon): boolean {
  const bounds = other.projectionBounds;
  if (bounds && bounds.magnitude <= axis.finiteProjectionCoordinateLimit) {
    const min = (axis.x < 0 ? bounds.maxX : bounds.minX) * axis.x
      + (axis.z < 0 ? bounds.maxZ : bounds.minZ) * axis.z;
    const max = (axis.x < 0 ? bounds.minX : bounds.maxX) * axis.x
      + (axis.z < 0 ? bounds.minZ : bounds.maxZ) * axis.z;
    if (max < axis.min - R.epsilon || axis.max < min - R.epsilon) return true;
  }
  let min = Infinity, max = -Infinity;
  for (const point of other.polygon) {
    const projection = point.x * axis.x + point.z * axis.z;
    // Math.min/max poison both original extrema on NaN. A comparison-only
    // loop must preserve that result rather than silently ignoring the value.
    if (Number.isNaN(projection)) return false;
    if (projection < min) min = projection;
    if (projection > max) max = projection;
  }
  return max < axis.min - R.epsilon || axis.max < min - R.epsilon;
}
function preparedPolygonsMeet(one: PreparedPolygon, two: PreparedPolygon): boolean {
  // Same axis order, exact original comparisons and zero-edge behavior.
  // A bounds rejection is just an original-axis rejection proved cheaply;
  // inconclusive bounds still execute the complete original vertex predicate.
  for (const axis of two.axes) if (preparedAxisSeparates(axis, one)) return false;
  for (const axis of one.axes) if (preparedAxisSeparates(axis, two)) return false;
  return true;
}
function prepareGroundPatches(plan: LevelPlan): Pick<PopulationValidationContext, 'patchesByCell' | 'patchSurfaces' | 'patchSurfaceKinds'> {
  const patchesByCell = new Map<number, { surface: SurfaceId; vertices: readonly Vec3[] }[]>();
  for (const patch of plan.groundSurfacePatches ?? []) for (const triangle of patch.triangles) {
    if (patch.sourceSurface !== undefined && patch.sourceSurface !== plan.heightfield.surfaces[triangle.cell]) continue;
    const items = patchesByCell.get(triangle.cell) ?? [];
    items.push({ surface: patch.surface, vertices: triangle.vertices }); patchesByCell.set(triangle.cell, items);
  }
  const patchSurfaces = (plan.groundSurfacePatches ?? []).map(patch => patch.surface);
  return { patchesByCell, patchSurfaces, patchSurfaceKinds: [...new Set(patchSurfaces)] };
}
export function createPopulationValidationContext(plan: LevelPlan,
  previous?: PopulationValidationContext): PopulationValidationContext {
  if(previous)contextFor(previous.plan,previous);
  const sameStatic = previous && plan.segments === previous.plan.segments && plan.solids === previous.plan.solids
    && plan.softBodies === previous.plan.softBodies && plan.checkpoints === previous.plan.checkpoints
    && plan.trickZones === previous.plan.trickZones;
  const sameGround=previous && plan.heightfield===previous.plan.heightfield
    && plan.groundSurfacePatches===previous.plan.groundSurfacePatches;
  const sameSources=previous && plan.segments===previous.plan.segments
    && plan.populationGroundSources===previous.plan.populationGroundSources && sameGround;
  const sameMovement=previous && sameMovementInputs(plan,previous.movementInputs);
  // Equal inputs are interchangeable; only a changed movement set is re-read.
  const movementInputs=sameMovement?previous.movementInputs:movementContextInputs(plan);
  const hosts = new Set(plan.segments.map(segment => segment.id));
  const patchIds = new Set((plan.groundSurfacePatches ?? []).map(patch => patch.id));
  const validGroundSources = sameSources?previous.validGroundSources:new Map((plan.populationGroundSources ?? []).filter(source =>
    groundSourceValidWithIds(source, hosts, patchIds)).map(source => [source.id, source]));
  const groundSourcesById = sameSources ? previous.groundSourcesById : (() => {
    const sources = new Map<string, PopulationGroundSource>();
    for (const source of plan.populationGroundSources ?? []) {
      if (!sources.has(source.id)) sources.set(source.id, source);
    }
    return sources;
  })();
  const sourceCoverage=sameSources?previous.sourceCoverage:new Map((plan.populationGroundSources??[]).map(source=>
    [source,previous?.sourceCoverage.get(source)??prepareGroundSourceCoverage(source)]));
  // Movement reservations are needed only by reserved-lane queries; build them
  // on first use, after re-verifying the creation-time movement inputs.
  const movementIndex=sameMovement&&previous.movementIndex?previous.movementIndex:lazyMovementIndex(plan,movementInputs);
  const boxSources = sameStatic ? undefined : [...plan.segments.flatMap(segment => segment.colliders), ...(plan.solids ?? [])];
  const boxes = sameStatic ? previous.boxes : reusePreparedBoxes(boxSources!, previous?.boxInputs, previous?.boxes,
    box => ({ ...preparedPolygon(boxPolygon(box, 0)),
      minY: box.centre.y - box.halfExtents.y, maxY: box.centre.y + box.halfExtents.y }));
  const softSources = sameStatic ? undefined : plan.softBodies ?? [];
  const softBodies = sameStatic ? previous.softBodies : reusePreparedBoxes(softSources!, previous?.softBodyInputs,
    previous?.softBodies, box => preparedPolygon(boxPolygon(box, 0)));
  return { plan, ...(sameGround?{patchesByCell:previous.patchesByCell,patchSurfaces:previous.patchSurfaces,
    patchSurfaceKinds:previous.patchSurfaceKinds}:prepareGroundPatches(plan)),
    groundSourcesById,sourceCoverage,
    movementInputs, movementIndex,
    get movementTree(){return movementIndex().tree;},
    get movementGrid(){return movementIndex().grid;},
    get invalidMovement(){return movementIndex().invalid;},
    spanProofs:new Map(),inputArrays:contextInputs(plan),
    boxes, boxGrid: sameStatic ? previous.boxGrid : rectGrid(boxes, box => box.projectionBounds),
    softBodies, softBodyGrid: sameStatic ? previous.softBodyGrid : rectGrid(softBodies, box => box.projectionBounds),
    pointObstacles: previous?.pointObstacles && plan.hazards === previous.plan.hazards
      && plan.targets === previous.plan.targets && plan.heightfield === previous.plan.heightfield
      ? previous.pointObstacles : lazyPointObstacles(plan),
    boxInputs: sameStatic ? previous.boxInputs : preparedBoxInputs(boxSources!),
    softBodyInputs: sameStatic ? previous.softBodyInputs : preparedBoxInputs(softSources!),
    checkpoints: sameStatic ? previous.checkpoints : plan.checkpoints.map(checkpoint => preparedPolygon(boxPolygon({
      centre: checkpoint.centre, halfExtents: checkpoint.halfExtents, rotationY: checkpoint.headingY,
      surface: 'pavement' }, R.checkpointClearanceMetres))),
    trickZones: sameStatic ? previous.trickZones : (plan.trickZones ?? [])
      .map(zone => preparedPolygon(expandedPolygon(zone.corners, R.featureClearanceMetres))),
    validGroundSources, presentSourceIds: new Set([...hosts, ...validGroundSources.keys()]) };
}
/** Each collider with the seven scalars its prepared box reads, recorded when
 * the box was prepared. A later context reuses a prepared box only for the same
 * collider whose scalars are all still Object.is-identical, so an in-place edit
 * is always re-prepared; preparation is a pure function of these scalars. */
interface PreparedBoxInputs { readonly boxes: readonly BoxCollider[]; readonly scalars: Float64Array;
  readonly numeric: Uint8Array }
function numericBox(box: BoxCollider): boolean {
  return typeof box.centre.x === 'number' && typeof box.centre.y === 'number' && typeof box.centre.z === 'number'
    && typeof box.halfExtents.x === 'number' && typeof box.halfExtents.y === 'number'
    && typeof box.halfExtents.z === 'number' && typeof box.rotationY === 'number';
}
function boxScalars(box: BoxCollider, into: Float64Array, offset: number): void {
  into[offset] = box.centre.x; into[offset + 1] = box.centre.y; into[offset + 2] = box.centre.z;
  into[offset + 3] = box.halfExtents.x; into[offset + 4] = box.halfExtents.y; into[offset + 5] = box.halfExtents.z;
  into[offset + 6] = box.rotationY;
}
function preparedBoxInputs(boxes: readonly BoxCollider[]): PreparedBoxInputs {
  const scalars = new Float64Array(boxes.length * 7), numeric = new Uint8Array(boxes.length);
  boxes.forEach((box, index) => { numeric[index] = numericBox(box) ? 1 : 0; boxScalars(box, scalars, index * 7); });
  return { boxes, scalars, numeric };
}
function reusePreparedBoxes<T>(boxes: readonly BoxCollider[], inputs: PreparedBoxInputs | undefined,
  prepared: readonly T[] | undefined, prepare: (box: BoxCollider) => T): T[] {
  if (!inputs || !prepared || prepared.length !== inputs.boxes.length) return boxes.map(prepare);
  const previous = new Map<BoxCollider, number>();
  inputs.boxes.forEach((box, index) => { if (!previous.has(box)) previous.set(box, index); });
  const current = new Float64Array(7);
  return boxes.map(box => {
    const index = previous.get(box);
    if (index === undefined || !inputs.numeric[index] || !numericBox(box)) return prepare(box);
    boxScalars(box, current, 0);
    for (let field = 0; field < 7; field += 1) {
      if (!Object.is(current[field], inputs.scalars[index * 7 + field])) return prepare(box);
    }
    return prepared[index];
  });
}
interface MovementIndex { readonly tree?: SpatialNode<MovementReservation>;
  readonly grid: RectGrid<SpatialItem<MovementReservation>>; readonly invalid: readonly MovementReservation[] }
/** The same reservations, tree and invalid list the context used to build
 * eagerly. Contexts are immutable views; a plan whose movement inputs changed
 * in place after the context was created is refused, never silently re-read. */
function lazyMovementIndex(plan:LevelPlan,inputs:MovementInputs):()=>MovementIndex {
  let built:MovementIndex|undefined;
  return ()=>{
    if(built)return built;
    if(!sameMovementInputs(plan,inputs))
      throw new Error('Population validation context was reused after a finished-plan movement edit');
    const movement=prepareMovementReservations(plan);
    const items=movement.filter(item=>!item.invalid)
      .map((value,order)=>({value,order,bounds:reservationBounds(value.polygon)}));
    built={tree:spatialTree(items),grid:rectGrid(items,item=>item.value.polygon.projectionBounds),
      invalid:movement.filter(item=>item.invalid)};
    return built;
  };
}
/** Only these original objects are consumed by prepareMovementReservations.
 * Footpath sources and district-activity paths contribute no reservation.
 * Equality includes identity, order and every scalar consumed by reservation
 * preparation. Nested in-place coordinate edits cannot reuse an old tree. */
/** The original single sequence [path, id, frames, x, z, halfWidth, ...,
 * source, purpose, polygons, polygon, x, z, ..., crossing, corners, x, z, ...]
 * split into its references and its scalars. Every array length is recorded
 * with the references, so the interleaving is fully determined and equality of
 * both parts is exactly equality of the original sequence (=== per element). */
interface MovementInputs { readonly refs: readonly unknown[]; readonly values: readonly unknown[] }
/** Visits the movement inputs in their original order; stops when visit returns false. */
function walkMovementInputs(plan:LevelPlan,visit:(scalar:boolean,item:unknown)=>boolean):boolean {
  let open=true;
  const ref=(item:unknown):boolean=>(open&&=visit(false,item));
  const value=(item:unknown):boolean=>(open&&=visit(true,item));
  for(const path of (plan.populationPaths??[]).filter(path=>!path.id.startsWith('district-activity/'))){
    if(!ref(path)||!ref(path.id)||!ref(path.frames)||!ref(path.frames.length))return false;
    path.frames.forEach(frame=>{if(open){value(frame.x);value(frame.z);value(frame.halfWidthMetres);}});
    if(!open)return false;
  }
  for(const source of (plan.populationGroundSources??[]).filter(source=>source.purpose!=='footpath')){
    if(!ref(source)||!ref(source.purpose)||!ref(source.polygons)||!ref(source.polygons.length))return false;
    source.polygons.forEach(polygon=>{
      if(!open||!ref(polygon)||!ref(polygon.length))return;
      polygon.forEach(point=>{if(open){value(point.x);value(point.z);}});
    });
    if(!open)return false;
  }
  for(const crossing of plan.populationCrossings??[]){
    if(!ref(crossing)||!ref(crossing.corners)||!ref(crossing.corners.length))return false;
    crossing.corners.forEach(point=>{if(open){value(point.x);value(point.z);}});
    if(!open)return false;
  }
  return open;
}
function movementContextInputs(plan:LevelPlan):MovementInputs {
  const refs:unknown[]=[],values:unknown[]=[];
  walkMovementInputs(plan,(scalar,item)=>{(scalar?values:refs).push(item);return true;});
  return {refs,values};
}
/** walkMovementInputs' exact sequence compared element by element against a
 * recorded one, as plain loops (forEach's hole skipping is kept). */
function sameMovementInputs(plan:LevelPlan,inputs:MovementInputs):boolean {
  const refs=inputs.refs,values=inputs.values;
  let r=0,v=0;
  const hole=(array:readonly unknown[],index:number):boolean=>array[index]===undefined&&!(index in array);
  for(const path of (plan.populationPaths??[]).filter(path=>!path.id.startsWith('district-activity/'))){
    const frames=path.frames;
    if(r+4>refs.length||refs[r]!==path||refs[r+1]!==path.id||refs[r+2]!==frames||refs[r+3]!==frames.length)return false;
    r+=4;
    for(let i=0;i<frames.length;i++){
      if(hole(frames,i))continue;
      const frame=frames[i];
      if(v+3>values.length||values[v]!==frame.x||values[v+1]!==frame.z||values[v+2]!==frame.halfWidthMetres)return false;
      v+=3;
    }
  }
  for(const source of (plan.populationGroundSources??[]).filter(source=>source.purpose!=='footpath')){
    const polygons=source.polygons;
    if(r+4>refs.length||refs[r]!==source||refs[r+1]!==source.purpose||refs[r+2]!==polygons||refs[r+3]!==polygons.length)return false;
    r+=4;
    for(let i=0;i<polygons.length;i++){
      if(hole(polygons,i))continue;
      const polygon=polygons[i];
      if(r+2>refs.length||refs[r]!==polygon||refs[r+1]!==polygon.length)return false;
      r+=2;
      for(let j=0;j<polygon.length;j++){
        if(hole(polygon,j))continue;
        const point=polygon[j];
        if(v+2>values.length||values[v]!==point.x||values[v+1]!==point.z)return false;
        v+=2;
      }
    }
  }
  for(const crossing of plan.populationCrossings??[]){
    const corners=crossing.corners;
    if(r+3>refs.length||refs[r]!==crossing||refs[r+1]!==corners||refs[r+2]!==corners.length)return false;
    r+=3;
    for(let i=0;i<corners.length;i++){
      if(hole(corners,i))continue;
      const point=corners[i];
      if(v+2>values.length||values[v]!==point.x||values[v+1]!==point.z)return false;
      v+=2;
    }
  }
  return r===refs.length&&v===values.length;
}
export type PopulationValidationScope = (plan:LevelPlan)=>PopulationValidationContext;
/** One synchronous authoring operation owns one last-context slot. It does not
 * retain a world cache, previous-context chain or successful admission result. */
export function createPopulationValidationScope():PopulationValidationScope {
  let current:PopulationValidationContext|undefined;
  return plan=>{
    if(current?.plan===plan){
      contextFor(plan,current);
      if(!sameMovementInputs(plan,current.movementInputs))
        throw new Error('Population validation scope was reused after a finished-plan movement edit');
      return current;
    }
    current=createPopulationValidationContext(plan,current);return current;
  };
}
function contextInputs(plan:LevelPlan):readonly unknown[] {
  return [plan.segments,plan.solids,plan.softBodies,plan.checkpoints,plan.trickZones,plan.heightfield,
    plan.groundSurfacePatches,plan.populationGroundSources,plan.populationPaths,plan.populationCrossings,
    plan.populationActivitySites,plan.populationActivityWalks,plan.hazards,plan.targets,plan.lap,plan.spawn];
}
/** contextInputs(plan) compared with `inputs` element by element, unallocated. */
function sameContextInputs(plan:LevelPlan,inputs:readonly unknown[]):boolean {
  return plan.segments===inputs[0]&&plan.solids===inputs[1]&&plan.softBodies===inputs[2]
    &&plan.checkpoints===inputs[3]&&plan.trickZones===inputs[4]&&plan.heightfield===inputs[5]
    &&plan.groundSurfacePatches===inputs[6]&&plan.populationGroundSources===inputs[7]
    &&plan.populationPaths===inputs[8]&&plan.populationCrossings===inputs[9]
    &&plan.populationActivitySites===inputs[10]&&plan.populationActivityWalks===inputs[11]
    &&plan.hazards===inputs[12]&&plan.targets===inputs[13]&&plan.lap===inputs[14]&&plan.spawn===inputs[15];
}
function contextFor(plan: LevelPlan, context?: PopulationValidationContext): PopulationValidationContext {
  if (context && context.plan !== plan) throw new Error('Population validation context belongs to a different finished plan');
  if(context&&!sameContextInputs(plan,context.inputArrays))
    throw new Error('Population validation context was reused after a finished-plan edit');
  return context ?? createPopulationValidationContext(plan);
}

/** physicalPopulationHull(x, y, z, headingY, normal, hull) without forming the
 * transform's eight corner objects, which physicalPopulationHullFromTransform
 * never reads: identical validation, arithmetic, extremum order and prism. */
function physicalPopulationHullDirect(x: number, y: number, z: number, headingY: number,
  normalX: number, normalY: number, normalZ: number, hull: ActorSpec['hull']): PopulationHullPrism {
  const velocityX = 0, velocityZ = 0;
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(headingY)
    && Number.isFinite(normalLength) && Number.isFinite(hull.halfWidthMetres)
    && Number.isFinite(hull.halfLengthMetres) && Number.isFinite(hull.heightMetres))
    || normalLength === 0 || normalY <= 0 || hull.halfWidthMetres <= 0
    || hull.halfLengthMetres <= 0 || hull.heightMetres <= 0) {
    throw new RangeError('Population hull requires finite positive dimensions and an upward normal');
  }
  const nx = normalX / normalLength, ny = normalY / normalLength, nz = normalZ / normalLength;
  const denominator = 1 + ny, c = Math.cos(headingY), s = Math.sin(headingY);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let xSide = 0; xSide < 2; xSide += 1) {
    const localX = xSide ? hull.halfWidthMetres : -hull.halfWidthMetres;
    for (let zSide = 0; zSide < 2; zSide += 1) {
      const localZ = zSide ? hull.halfLengthMetres : -hull.halfLengthMetres;
      const yawX = c * localX + s * localZ, yawZ = -s * localX + c * localZ;
      for (let ySide = 0; ySide < 2; ySide += 1) {
        const localY = ySide ? hull.heightMetres : 0;
        const worldX = (1 - nx * nx / denominator) * yawX + nx * localY - nx * nz / denominator * yawZ;
        const worldY = -nx * yawX + ny * localY - nz * yawZ;
        const worldZ = -nx * nz / denominator * yawX + nz * localY + (1 - nz * nz / denominator) * yawZ;
        const projectedX = worldX * c - worldZ * s, projectedZ = worldX * s + worldZ * c;
        minX = Math.min(minX, projectedX); maxX = Math.max(maxX, projectedX);
        minZ = Math.min(minZ, projectedZ); maxZ = Math.max(maxZ, projectedZ);
        minY = Math.min(minY, y + worldY); maxY = Math.max(maxY, y + worldY);
      }
    }
  }
  const centreX = (minX + maxX) * 0.5, centreZ = (minZ + maxZ) * 0.5;
  // physicalPopulationHullFromTransform on that footprint, inlined: its
  // source frame is (x, y, z, headingY, hull) and Math.cos/sin(headingY) are c, s.
  const tiltedX = x + c * centreX + s * centreZ, tiltedZ = z - s * centreX + c * centreZ;
  const tiltedHalfWidth = (maxX - minX) * 0.5, tiltedHalfLength = (maxZ - minZ) * 0.5;
  const dx = tiltedX - x, dz = tiltedZ - z;
  const cx = dx * c - dz * s, cz = dx * s + dz * c;
  const prismMinX = Math.min(cx - tiltedHalfWidth, -hull.halfWidthMetres);
  const prismMaxX = Math.max(cx + tiltedHalfWidth, hull.halfWidthMetres);
  const prismMinZ = Math.min(cz - tiltedHalfLength, -hull.halfLengthMetres);
  const prismMaxZ = Math.max(cz + tiltedHalfLength, hull.halfLengthMetres);
  const midX = (prismMinX + prismMaxX) * 0.5, midZ = (prismMinZ + prismMaxZ) * 0.5;
  // Same keys in the same order as { ...tilted, x, z, halfWidthMetres, ... }.
  return { x: x + c * midX + s * midZ, z: z - s * midX + c * midZ, headingY,
    halfWidthMetres: (prismMaxX - prismMinX) * 0.5, halfLengthMetres: (prismMaxZ - prismMinZ) * 0.5,
    minY: Math.min(y, minY), maxY: Math.max(y + hull.heightMetres, maxY), velocityX, velocityZ,
    sourceHull: { x, y, z, headingY, normalX: nx, normalY: ny, normalZ: nz, hull: { ...hull } } };
}

/** transformPopulationHull(...).lowerCorners alone: the identical validation,
 * arithmetic and corner order, without the upper corners or footprint. */
function lowerHullCorners(x: number, y: number, z: number, headingY: number,
  normalX: number, normalY: number, normalZ: number, hull: ActorSpec['hull']): Vec3[] {
  const normalLength = Math.hypot(normalX, normalY, normalZ);
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(headingY)
    && Number.isFinite(normalLength) && Number.isFinite(hull.halfWidthMetres)
    && Number.isFinite(hull.halfLengthMetres) && Number.isFinite(hull.heightMetres))
    || normalLength === 0 || normalY <= 0 || hull.halfWidthMetres <= 0
    || hull.halfLengthMetres <= 0 || hull.heightMetres <= 0) {
    throw new RangeError('Population hull requires finite positive dimensions and an upward normal');
  }
  const nx = normalX / normalLength, ny = normalY / normalLength, nz = normalZ / normalLength;
  const denominator = 1 + ny, c = Math.cos(headingY), s = Math.sin(headingY);
  const corners: Vec3[] = [];
  const localY = 0;
  for (let xSide = 0; xSide < 2; xSide += 1) {
    const localX = xSide ? hull.halfWidthMetres : -hull.halfWidthMetres;
    for (let zSide = 0; zSide < 2; zSide += 1) {
      const localZ = zSide ? hull.halfLengthMetres : -hull.halfLengthMetres;
      const yawX = c * localX + s * localZ, yawZ = -s * localX + c * localZ;
      const worldX = (1 - nx * nx / denominator) * yawX + nx * localY - nx * nz / denominator * yawZ;
      const worldY = -nx * yawX + ny * localY - nz * yawZ;
      const worldZ = -nx * nz / denominator * yawX + nz * localY + (1 - nz * nz / denominator) * yawZ;
      corners.push({ x: x + worldX, y: y + worldY, z: z + worldZ });
    }
  }
  return corners;
}

/** Results of populationSpanFootprints by frame objects, each with every
 * scalar input and ground sample that produced it. A later call reuses one
 * only when all of those compare Object.is-equal, so it is exactly what the
 * call would compute (no stale reuse after any edit). Returned footprints are
 * read-only to every consumer. The memos exist only inside an authoring scope
 * (withPopulationAuthoringMemo), so nothing outlives one preparation. */
interface FootprintMemoEntry { readonly role: PathRole; readonly inputs: readonly number[];
  readonly samples: readonly number[]; readonly result: readonly PopulationSpanFootprint[] }
let footprintMemo: WeakMap<object, WeakMap<object, FootprintMemoEntry[]>> | undefined;
/** Runs one synchronous authoring operation with the verified footprint and
 * coverage memos; nested scopes share the outermost one, which is dropped on
 * exit (also on a throw). Results are identical with or without a scope. */
export function withPopulationAuthoringMemo<T>(run: () => T): T {
  if (footprintMemo) return run();
  footprintMemo = new WeakMap(); coverageMemo = new WeakMap();
  try { return run(); } finally { footprintMemo = undefined; coverageMemo = undefined; }
}
function sameScalars(one: readonly number[], two: readonly number[]): boolean {
  if (one.length !== two.length) return false;
  for (let index = 0; index < one.length; index += 1) if (!Object.is(one[index], two[index])) return false;
  return true;
}

/** The field uses constant triangle normals. Split every crossed cell/diagonal,
 * then use that actual normal, not a global maximum grade on every flat path.
 * Physical hulls conservatively include grade-aligned and plumb actors alike. */
export function populationSpanFootprints(plan: LevelPlan, sampler: TerrainSampler,
  a: Pick<AuthoredPathFrame, 'x' | 'z' | 'headingY'>,
  b: Pick<AuthoredPathFrame, 'x' | 'z' | 'headingY'>, role: PathRole): readonly PopulationSpanFootprint[] {
  const length = distance(a, b);
  if (!(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.headingY)
    && Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.headingY)) || length <= R.epsilon) return [];
  const cuts = new Set([0, 1]);
  const divisions = Math.max(1, Math.ceil(length / R.groundProbeSpacingMetres));
  for (let index = 1; index < divisions; index += 1) cuts.add(index / divisions);
  const field = plan.heightfield;
  for (const [from, to, origin] of [[a.x, b.x, field.originX], [a.z, b.z, field.originZ],
    [a.x - a.z, b.x - b.z, field.originX - field.originZ]]) {
    if (Math.abs(to - from) <= R.epsilon) continue;
    const first = Math.ceil((Math.min(from, to) - origin) / field.spacing);
    const last = Math.floor((Math.max(from, to) - origin) / field.spacing);
    for (let line = first; line <= last; line += 1) {
      const fraction = (origin + line * field.spacing - from) / (to - from);
      if (fraction > R.epsilon && fraction < 1 - R.epsilon) cuts.add(fraction);
    }
  }
  const stations = [...cuts].sort((x, y) => x - y);
  const hull = actorHull(role === 'traffic' ? 'trafficVehicle' : role === 'service' ? 'serviceVehicle'
    : role === 'rider' ? 'fictionalEuc' : 'walker');
  const yaw = angle(b.headingY - a.headingY);
  const sample = createGroundSample();
  // sampleGround is a pure query and physicalPopulationHull a pure function, so
  // one sample per station and one actual-normal hull per station (a shared
  // station ends one piece and starts the next) give the identical values, and
  // hulls are still formed in the original order: first, last, actual pair.
  interface Station { readonly fraction: number; readonly height: number;
    readonly normalX: number; readonly normalY: number; readonly normalZ: number; hull?: PopulationHullPrism }
  interface Piece { readonly from: number; readonly to: number;
    readonly nx: number; readonly ny: number; readonly nz: number; readonly start: Station; readonly end: Station }
  const station = (fraction: number): Station => {
    sampler.sampleGround(a.x + (b.x - a.x) * fraction, a.z + (b.z - a.z) * fraction, sample);
    return { fraction, height: sample.height, normalX: sample.normal.x, normalY: sample.normal.y, normalZ: sample.normal.z };
  };
  // Phase 1: every ground sample the original loop takes, in its order, up to
  // its first invalid piece normal (where it returned []).
  const pieces: Piece[] = [], samples: number[] = [];
  let previous: Station | undefined, invalid = false;
  for (let index = 1; index < stations.length; index += 1) {
    const from = stations[index - 1], to = stations[index];
    if (to - from <= R.epsilon) continue;
    const middle = (from + to) / 2;
    sampler.sampleGround(a.x + (b.x - a.x) * middle, a.z + (b.z - a.z) * middle, sample);
    const { x: nx, y: ny, z: nz } = sample.normal, height = sample.height;
    if (!(Number.isFinite(height) && Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)) || ny <= 0) { invalid = true; break; }
    const start = previous?.fraction === from ? previous : station(from), end = station(to);
    pieces.push({ from, to, nx, ny, nz, start, end }); previous = end;
    samples.push(from, to, height, nx, ny, nz, start.height, start.normalX, start.normalY, start.normalZ,
      end.height, end.normalX, end.normalY, end.normalZ);
  }
  // The hulls depend only on these inputs and samples; an identical earlier
  // computation for the same frame objects therefore produced this result.
  const inputs = [a.x, a.z, a.headingY, b.x, b.z, b.headingY, field.originX, field.originZ, field.spacing];
  if (!invalid) {
    const memo = footprintMemo?.get(a)?.get(b);
    if (memo) for (const entry of memo) if (entry.role === role && sameScalars(entry.inputs, inputs)
      && sameScalars(entry.samples, samples)) return entry.result;
  }
  // Phase 2: the original hull arithmetic for each recorded piece.
  const result: PopulationSpanFootprint[] = [];
  for (const { from, to, nx, ny, nz, start, end } of pieces) {
    const at = (ground: Station, triangleNormal: boolean): PopulationHullPrism => {
      const fraction = ground.fraction;
      const x = a.x + (b.x - a.x) * fraction, z = a.z + (b.z - a.z) * fraction;
      return physicalPopulationHullDirect(x, ground.height, z, a.headingY + yaw * fraction,
        triangleNormal ? nx : ground.normalX, triangleNormal ? ny : ground.normalY,
        triangleNormal ? nz : ground.normalZ, hull);
    };
    const first = at(start, true), last = at(end, true);
    // A grid corner's exact sampler tie can choose a different neighbouring
    // triangle. Include that factual endpoint pose too, including a stopped actor.
    const actualFirst = start.hull ?? at(start, false);
    const actualLast = at(end, false);
    end.hull = actualLast;
    const turn = Math.abs(yaw * (to - from));
    const cornerRadius = Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres);
    // Flat rotations have an exact circular sagitta bound. A graded prism's
    // recentering/extents also change with yaw: bound that change using only
    // this triangle's actual grade and dimensions. A straight flat sweep pays zero.
    const gradeReach = hull.heightMetres * Math.hypot(nx, nz);
    const angularMargin = Math.hypot(nx, nz) <= R.epsilon
      ? cornerRadius * (1 - Math.cos(turn / 2))
      : 4 * (cornerRadius + gradeReach) * turn;
    result.push({ polygon: footprintPolygon(first, last, actualFirst, actualLast,
      R.staticClearanceMetres + angularMargin),
      minY: Math.min(first.minY, last.minY, actualFirst.minY, actualLast.minY) - angularMargin,
      maxY: Math.max(first.maxY, last.maxY, actualFirst.maxY, actualLast.maxY) + angularMargin,
      fromFraction: from, toFraction: to, fromHull: actualFirst, toHull: actualLast });
  }
  if (invalid) return [];
  if (footprintMemo && typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    let byLast = footprintMemo.get(a);
    if (!byLast) { byLast = new WeakMap(); footprintMemo.set(a, byLast); }
    const entries = byLast.get(b) ?? [];
    entries.push({ role, inputs, samples, result });
    if (entries.length > 4) entries.shift();
    byLast.set(b, entries);
  }
  return result;
}

/**
 * Exact surface coverage over source triangles and ordered precise patches.
 * Bad source cells can become eligible only where allowed patch triangles
 * cover the entire footprint. This catches thin gaps/micro-patches between
 * ground probes, and uses the sampler's original-surface gate and last-wins
 * patch order. The clipping is conservative in footprint, not in surface truth.
 */
export function surfaceFootprintClear(plan: LevelPlan, polygon: readonly Point2[], allowed: ReadonlySet<SurfaceId>,
  prepared?: PopulationValidationContext): boolean {
  const field = plan.heightfield;
  // Pairwise Math.min/max folds equal the spread forms (NaN and signed zeros).
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const fieldMaxX = field.originX + (field.columns - 1) * field.spacing;
  const fieldMaxZ = field.originZ + (field.rows - 1) * field.spacing;
  if (minX < field.originX || minZ < field.originZ || maxX > fieldMaxX || maxZ > fieldMaxZ) return false;
  const firstX = Math.max(0, Math.floor((minX - field.originX) / field.spacing));
  const lastX = Math.min(field.columns - 2, Math.floor((maxX - field.originX) / field.spacing));
  const firstZ = Math.max(0, Math.floor((minZ - field.originZ) / field.spacing));
  const lastZ = Math.min(field.rows - 2, Math.floor((maxZ - field.originZ) / field.spacing));
  // A standalone coverage query prepares only surfaces, and only if an
  // original cell actually needs ordered patch clipping.
  if (prepared) contextFor(plan, prepared);
  // every() over the distinct surfaces is the same membership test.
  const allPatchesAllowed = (prepared?.patchSurfaceKinds ?? prepared?.patchSurfaces
    ?? (plan.groundSurfacePatches ?? []).map(patch => patch.surface)).every(surface => allowed.has(surface));
  let standalone: ReturnType<typeof prepareGroundPatches> | undefined;
  for (let row = firstZ; row <= lastZ; row += 1) for (let column = firstX; column <= lastX; column += 1) {
    const cell = row * (field.columns - 1) + column;
    const source = field.surfaces[cell];
    // An allowed source cannot become disallowed if every possible override
    // is allowed too. No patch triangles need scanning in that common case.
    if (allowed.has(source) && allPatchesAllowed) continue;
    const patches = (prepared ?? (standalone ??= prepareGroundPatches(plan))).patchesByCell.get(cell) ?? [];
    // Likewise per cell: with an allowed source and only allowed overrides in
    // this cell, neither failure below can occur, so the clipping is skipped.
    if (allowed.has(source) && patches.every(patch => allowed.has(patch.surface))) continue;
    const x = field.originX + column * field.spacing, z = field.originZ + row * field.spacing;
    const a = { x, z }, b = { x: x + field.spacing, z }, c = { x, z: z + field.spacing };
    const d = { x: x + field.spacing, z: z + field.spacing };
    for (const triangle of [[a, b, d], [a, d, c]]) {
      const clipped = intersection(polygon, triangle);
      if (clipped.length < 3 || area(clipped) <= R.epsilon) continue;
      let remaining: Point2[][] = [clipped];
      // Last applicable patch wins, as in PlanTerrainSampler.applyGroundPatches.
      for (let index = patches.length - 1; index >= 0 && remaining.length; index -= 1) {
        const patch = patches[index]; const next: Point2[][] = [];
        for (const piece of remaining) {
          const hit = intersection(piece, patch.vertices);
          if (hit.length >= 3 && area(hit) > R.epsilon && !allowed.has(patch.surface)) return false;
          next.push(...subtract(piece, patch.vertices));
        }
        remaining = next;
      }
      if (remaining.length && !allowed.has(source)) return false;
    }
  }
  return true;
}

function clearanceFor(role: PathRole): { radius: number; height: number; allowed: ReadonlySet<SurfaceId> } {
  if (role === 'traffic' || role === 'service') return {
    radius: Math.hypot(R.vehicleHalfWidthMetres, R.vehicleHalfLengthMetres), height: R.vehicleHeightMetres,
    allowed: VEHICLE_SURFACES,
  };
  // Actor hulls are oriented rectangles. Their corners must fit the validated
  // band throughout turns; validating only one half-extent admits wall clips.
  const halfExtent = role === 'rider' ? R.riderRadiusMetres : R.pedestrianRadiusMetres;
  return { radius: Math.hypot(halfExtent, halfExtent),
    height: R.actorHeightMetres, allowed: WALK_SURFACES };
}

function polygonsMeet(a: readonly Point2[], b: readonly Point2[]): boolean {
  for (const polygon of [a, b]) for (let index = 0; index < polygon.length; index += 1) {
    const first = polygon[index], last = polygon[(index + 1) % polygon.length];
    const axisX = last.z - first.z, axisZ = first.x - last.x;
    const project = (points: readonly Point2[]) => points.map(point => point.x * axisX + point.z * axisZ);
    const one = project(a), two = project(b);
    if (Math.max(...one) < Math.min(...two) - R.epsilon || Math.max(...two) < Math.min(...one) - R.epsilon) return false;
  }
  return true;
}

function boxPolygon(box: BoxCollider, margin: number): readonly Point2[] {
  return hullCorners({ x: box.centre.x, z: box.centre.z, headingY: box.rotationY,
    halfWidthMetres: box.halfExtents.x + margin, halfLengthMetres: box.halfExtents.z + margin,
    minY: 0, maxY: 0, velocityX: 0, velocityZ: 0 });
}

/** One query polygon's finite coordinate rectangle plus the indices of its
 * exactly axis-aligned edges lying on that rectangle (if any). Only used to
 * find witnesses early; every answer is still the original predicate's. */
interface FootprintExtent {
  readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number;
  readonly magnitude: number; readonly edges: readonly number[];
  /** Set when the vertical (horizontal) edges on the rectangle's two extreme
   * sides run in opposite directions: the clearance beyond which they are the
   * two opposite-signed insideConvex witnesses for every finite point. */
  readonly xWitnessGap?: number; readonly zWitnessGap?: number;
}
function footprintExtent(polygon: readonly Point2[],
  bounds: PreparedPolygon['projectionBounds']): FootprintExtent | undefined {
  if (!bounds) return undefined;
  const edges: number[] = [];
  let left = 0, right = 0, bottom = 0, top = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((a.x === b.x && (a.x === bounds.minX || a.x === bounds.maxX))
      || (a.z === b.z && (a.z === bounds.minZ || a.z === bounds.maxZ))) edges.push(i);
    // b.x - a.x is exactly zero here, so this edge's cross value for a point p
    // is -fl((b.z - a.z) * fl(p.x - a.x)): sign and magnitude follow directly.
    if (a.x === b.x && a.z !== b.z) {
      if (a.x === bounds.minX && !left) left = b.z - a.z;
      if (a.x === bounds.maxX && !right) right = b.z - a.z;
    }
    if (a.z === b.z && a.x !== b.x) {
      if (a.z === bounds.minZ && !bottom) bottom = b.x - a.x;
      if (a.z === bounds.maxZ && !top) top = b.x - a.x;
    }
  }
  const gap = (one: number, two: number): number | undefined =>
    one !== 0 && two !== 0 && Number.isFinite(one) && Number.isFinite(two) && Math.sign(one) !== Math.sign(two)
      ? 2 * R.epsilon / Math.min(Math.abs(one), Math.abs(two)) : undefined;
  const xWitnessGap = gap(left, right), zWitnessGap = gap(bottom, top);
  return { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ,
    magnitude: bounds.magnitude, edges,
    ...(xWitnessGap !== undefined && Number.isFinite(xWitnessGap) ? { xWitnessGap } : {}),
    ...(zWitnessGap !== undefined && Number.isFinite(zWitnessGap) ? { zWitnessGap } : {}) };
}
/** insideConvex is false exactly when some edge value exceeds epsilon and some
 * edge value is below -epsilon. For a finite point beyond a witnessed extreme
 * side, the two opposite extreme edges give |dz|*|p.x - edge.x| (or the z
 * analogue) of opposite signs, each above twice epsilon. Otherwise the extreme
 * axis-aligned edges usually supply both witnesses at once; any value they give
 * is the loop's own value for that edge, so the answer is unchanged. */
function insideConvexWithin(point: Point2, polygon: readonly Point2[], extent: FootprintExtent | undefined): boolean {
  if (extent && Number.isFinite(point.x) && Number.isFinite(point.z)) {
    const xGap = extent.xWitnessGap, zGap = extent.zWitnessGap;
    if (xGap !== undefined && (point.x < extent.minX - xGap || point.x > extent.maxX + xGap)) return false;
    if (zGap !== undefined && (point.z < extent.minZ - zGap || point.z > extent.maxZ + zGap)) return false;
  }
  if (extent && extent.edges.length > 1 && (point.x < extent.minX || point.x > extent.maxX
    || point.z < extent.minZ || point.z > extent.maxZ)) {
    let positive = false, negative = false;
    for (const i of extent.edges) {
      const value = cross(polygon[i], polygon[(i + 1) % polygon.length], point);
      positive ||= value > R.epsilon; negative ||= value < -R.epsilon;
      if (positive && negative) return false;
    }
  }
  return insideConvex(point, polygon);
}
function touchesPoint(polygon: readonly Point2[], point: Point2, radius: number,
  extent?: FootprintExtent): boolean {
  if (insideConvexWithin(point, polygon, extent)) return true;
  // Every edge lies inside the polygon's finite coordinate rectangle, so each
  // computed segment distance exceeds the radius once the point lies beyond it.
  if (extent && pointBeyondExtent(extent, point.x, point.x, point.z, point.z, radius)) return false;
  return polygon.some((a, index) =>
    segmentDistance(point, a, polygon[(index + 1) % polygon.length]) <= radius);
}
/** True only when the coordinate rectangle [fromX,toX]x[fromZ,toZ] lies more
 * than `radius` (plus a margin dwarfing every rounding error of
 * segmentDistance) outside the finite polygon rectangle on one axis. */
function pointBeyondExtent(extent: FootprintExtent,
  fromX: number, toX: number, fromZ: number, toZ: number, radius: number): boolean {
  if (!(Number.isFinite(fromX) && Number.isFinite(toX) && Number.isFinite(fromZ) && Number.isFinite(toZ) && Number.isFinite(radius))) return false;
  const gap = radius + 1e-6 * (1 + extent.magnitude + Math.abs(fromX) + Math.abs(toX) + Math.abs(fromZ) + Math.abs(toZ));
  return toX < extent.minX - gap || fromX > extent.maxX + gap || toZ < extent.minZ - gap || fromZ > extent.maxZ + gap;
}
/** meetsPolygon with an exact broad phase. Containment is always decided by
 * the original insideConvex. A segment beyond the polygon rectangle by more
 * than the radius has every distance test false, so only the original
 * proper-crossing products remain; a zero-length XZ segment has zero products. */
function meetsPolygonWithin(a: Point2, b: Point2, corners: readonly Point2[], radius: number,
  extent: FootprintExtent | undefined): boolean {
  if (!extent || !pointBeyondExtent(extent, Math.min(a.x, b.x), Math.max(a.x, b.x),
    Math.min(a.z, b.z), Math.max(a.z, b.z), radius)) return meetsPolygon(a, b, corners, radius);
  if (insideConvexWithin(a, corners, extent) || insideConvexWithin(b, corners, extent)) return true;
  if (a.x === b.x && a.z === b.z || corners.length === 0) return false;
  // Every corner lies in the finite rectangle. cross(a, b, c) differs from the
  // affine dx*(c.z-a.z) - dz*(c.x-a.x) by at most 5u*M, and that affine
  // function is extremal at rectangle corners; when all four corners agree in
  // sign beyond 1e-12*M, every corner's abC has that sign, so no abC*abD < 0.
  const dx = b.x - a.x, dz = b.z - a.z;
  const reachX = Math.max(Math.abs(extent.minX - a.x), Math.abs(extent.maxX - a.x));
  const reachZ = Math.max(Math.abs(extent.minZ - a.z), Math.abs(extent.maxZ - a.z));
  const bound = 1e-12 * (Math.abs(dx) * reachZ + Math.abs(dz) * reachX);
  let above = 0, below = 0;
  for (const x of [extent.minX, extent.maxX]) for (const z of [extent.minZ, extent.maxZ]) {
    const value = dx * (z - a.z) - dz * (x - a.x);
    if (value > bound) above += 1; else if (value < -bound) below += 1;
  }
  if (above === 4 || below === 4) return false;
  // cross(a, b, corner) is pure, so each corner's value is computed once and
  // reused as abC/abD of its two edges; cdA/cdB are only needed when abC*abD<0.
  const first = cross(a, b, corners[0]);
  let previous = first;
  for (let i = 0; i < corners.length; i += 1) {
    const c = corners[i], d = corners[(i + 1) % corners.length];
    const abC = previous, abD = i + 1 < corners.length ? cross(a, b, d) : first;
    previous = abD;
    if (abC * abD < 0 && cross(c, d, a) * cross(c, d, b) < 0) return true;
  }
  return false;
}

function exclusion(plan: LevelPlan, footprint: PopulationSpanFootprint,
  prepared?: PopulationValidationContext): RejectionReason | null {
  const polygon = footprint.polygon;
  const context = contextFor(plan, prepared);
  // Keep the original SAT tolerance, including tiny/degenerate authored boxes.
  // Preparation removes repeated geometry work without changing that predicate.
  // Each category answers only "does any item meet", so grid broad phases that
  // skip only provably separated items cannot change the returned reason.
  // The pure query preparation is formed only when some item needs the SAT.
  // preparedPolygonsMeet(query, other) tests other's axes against the query's
  // vertices and bounds first; the query's own axes are prepared only when an
  // item survives all of its own axes, in the same order with the same values.
  const bounds = finiteProjectionBounds(polygon), shape: PreparedPolygon = { polygon, projectionBounds: bounds, axes: [] };
  let queryAxes: PreparedPolygon['axes'] | undefined;
  const meets = (other: PreparedPolygon): boolean => {
    for (const axis of other.axes) if (preparedAxisSeparates(axis, shape)) return false;
    queryAxes ??= preparedPolygon(polygon).axes;
    for (const axis of queryAxes) if (preparedAxisSeparates(axis, other)) return false;
    return true;
  };
  const aligned = alignedSatBoundsOf(polygon, bounds), extent = footprintExtent(polygon, bounds);
  const solid = (box: PreparedBox): boolean =>
    !(box.maxY <= footprint.minY + R.epsilon || box.minY >= footprint.maxY) && meets(box);
  if (aligned && context.boxGrid ? rectGridAny(context.boxGrid, aligned, solid) : context.boxes.some(solid)) return 'solid';
  if (aligned && context.softBodyGrid ? rectGridAny(context.softBodyGrid, aligned, meets)
    : context.softBodies.some(meets)) return 'soft-body';
  const points = extent && extent.xWitnessGap !== undefined && extent.zWitnessGap !== undefined
    ? context.pointObstacles?.() : undefined;
  if (hazardTouched(plan, polygon, extent, points)) return 'hazard';
  if (touchesPoint(polygon, plan.spawn.position, R.spawnClearanceMetres, extent)) return 'spawn';
  for (const checkpoint of context.checkpoints) if (meets(checkpoint)) return 'checkpoint';
  for (const zone of context.trickZones) if (meets(zone)) return 'trick';
  const lap = plan.lap?.points ?? [];
  for (let index = 1; index < lap.length; index += 1) {
    const c = lap[index - 1], d = lap[index];
    const reach = Math.max(c.halfWidth, d.halfWidth) + R.lapClearanceMetres;
    if (meetsPolygonWithin(c, d, polygon, reach, extent)) return 'lap';
  }
  if (targetMet(plan, polygon, extent, points)) return 'target';
  return null;
}

/** Exact-safe broad phase for exclusion's hazard and target loops, prepared
 * from the context's plan like its prepared boxes. A hazard or target whose
 * reach rectangle misses the query rectangle by the distance margin, and (for
 * targets) whose infinite base-centre line misses every cell around the query,
 * has every original test false for a footprint with both insideConvex
 * witness gaps: its endpoints lie beyond those gaps, every segment distance
 * exceeds its radius, and the crossing certificate holds. Others still run the
 * exact predicates, and "any" does not depend on order. */
interface PointObstacleIndex {
  readonly hazards: LevelPlan['hazards']; readonly targets: LevelPlan['targets'];
  readonly hazardGrid: RectGrid<number>; readonly hazardReach: number; readonly hazardMagnitude: number;
  readonly targetGrid: RectGrid<number>; readonly targetReach: number; readonly targetMagnitude: number;
  /** Targets whose line could cross the cell; undefined disables line pruning. */
  readonly lines?: { readonly originX: number; readonly originZ: number; readonly cell: number;
    readonly columns: number; readonly rows: number; readonly cells: readonly (readonly number[] | undefined)[] };
  readonly unboundedLines: readonly number[];
  readonly stamps: Uint32Array; stamp: number;
}
function lazyPointObstacles(plan: LevelPlan): () => PointObstacleIndex {
  let built: PointObstacleIndex | undefined;
  return () => built ??= pointObstacleIndex(plan);
}
function pointObstacleIndex(plan: LevelPlan): PointObstacleIndex {
  const hazards = plan.hazards ?? [], targets = plan.targets ?? [];
  let hazardReach = Infinity, hazardMagnitude = 0, targetReach = Infinity, targetMagnitude = 0;
  const hazardGrid = rectGrid(hazards.map((_, index) => index), index => {
    const hazard = hazards[index], reach = hazard.radius + R.hazardClearanceMetres;
    const x = hazard.centre.x, z = hazard.centre.z;
    if (!finite(x, z, reach) || reach < 0) return undefined;
    hazardReach = Math.min(hazardReach, reach); hazardMagnitude = Math.max(hazardMagnitude, Math.abs(x), Math.abs(z));
    return { minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach };
  });
  const targetGrid = rectGrid(targets.map((_, index) => index), index => {
    const target = targets[index], a = target.base, b = target.centre, reach = target.radius + R.targetClearanceMetres;
    if (!finite(a.x, a.z, b.x, b.z, reach) || reach < 0) return undefined;
    targetReach = Math.min(targetReach, reach);
    targetMagnitude = Math.max(targetMagnitude, Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z));
    return { minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach,
      minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach };
  });
  const field = plan.heightfield, cell = 8, pad = 32;
  const originX = field.originX - pad, originZ = field.originZ - pad;
  const columns = Math.ceil(((field.columns - 1) * field.spacing + 2 * pad) / cell) + 1;
  const rows = Math.ceil(((field.rows - 1) * field.spacing + 2 * pad) / cell) + 1;
  const unboundedLines: number[] = [];
  let lines: PointObstacleIndex['lines'];
  if (finite(originX, originZ, columns, rows) && columns > 2 && rows > 2 && columns * rows <= 1 << 18) {
    const cells: (number[] | undefined)[] = new Array(columns * rows);
    const maxX = originX + columns * cell, maxZ = originZ + rows * cell;
    targets.forEach((target, index) => {
      const a = target.base, b = target.centre;
      if (!finite(a.x, a.z, b.x, b.z)) { unboundedLines.push(index); return; }
      // meetsPolygonWithin never crosses a zero-length XZ segment.
      if (a.x === b.x && a.z === b.z) return;
      const dx = b.x - a.x, dz = b.z - a.z;
      const reachX = Math.max(Math.abs(originX - a.x), Math.abs(maxX - a.x));
      const reachZ = Math.max(Math.abs(originZ - a.z), Math.abs(maxZ - a.z));
      // Rounding of dx*(z-a.z) - dz*(x-a.x) anywhere in the region, plus the
      // certificate's own 1e-12 bound, is far below this threshold.
      const threshold = 1e-11 * (1 + Math.abs(dx) * reachZ + Math.abs(dz) * reachX);
      // Register (a superset of) every cell meeting the band |F| <= threshold,
      // F(x,z) = dx*(z-a.z) - dz*(x-a.x): an unregistered cell then has one
      // strict sign beyond the threshold on all of it, and since the line
      // cannot cross a block of cells without meeting a registered one, every
      // corner of a query rectangle inside such cells passes the certificate.
      // One spare column on each side absorbs the rounding of these bounds.
      const register = (row: number, from: number, to: number): void => {
        const first = Math.max(0, from), last = Math.min(columns - 1, to);
        for (let column = first; column <= last; column += 1) (cells[row * columns + column] ??= []).push(index);
      };
      for (let row = 0; row < rows; row += 1) {
        const z0 = originZ + row * cell, z1 = z0 + cell;
        if (dz === 0) {
          const half = threshold / Math.abs(dx);
          if (!finite(half) || (a.z + half >= z0 - cell && a.z - half <= z1 + cell)) register(row, 0, columns - 1);
          continue;
        }
        const crossing0 = a.x + dx * (z0 - a.z) / dz, crossing1 = a.x + dx * (z1 - a.z) / dz;
        const half = threshold / Math.abs(dz);
        const low = Math.min(crossing0, crossing1) - half, high = Math.max(crossing0, crossing1) + half;
        if (!finite(low, high)) { register(row, 0, columns - 1); continue; }
        if (high < originX - cell || low > maxX + cell) continue;
        register(row, Math.floor((low - originX) / cell) - 1, Math.floor((high - originX) / cell) + 1);
      }
    });
    lines = { originX, originZ, cell, columns, rows, cells };
  }
  return { hazards: plan.hazards, targets: plan.targets, hazardGrid, hazardReach, hazardMagnitude,
    targetGrid, targetReach, targetMagnitude, lines, unboundedLines, stamps: new Uint32Array(targets.length), stamp: 0 };
}
function hazardTouched(plan: LevelPlan, polygon: readonly Point2[], extent: FootprintExtent | undefined,
  points: PointObstacleIndex | undefined): boolean {
  const hazards = plan.hazards ?? [];
  const touches = (hazard: Hazard): boolean => touchesPoint(polygon, hazard.centre,
    hazard.radius + R.hazardClearanceMetres, extent);
  if (points && extent && points.hazards === plan.hazards) {
    // Twice pointBeyondExtent's own margin for any hazard coordinate.
    const pad = 2e-6 * (1 + extent.magnitude + 4 * points.hazardMagnitude);
    if (points.hazardReach + pad > Math.max(extent.xWitnessGap!, extent.zWitnessGap!)) {
      return rectGridAny(points.hazardGrid, { minX: extent.minX - pad, maxX: extent.maxX + pad,
        minZ: extent.minZ - pad, maxZ: extent.maxZ + pad }, index => touches(hazards[index]));
    }
  }
  return hazards.some(touches);
}
function targetMet(plan: LevelPlan, polygon: readonly Point2[], extent: FootprintExtent | undefined,
  points: PointObstacleIndex | undefined): boolean {
  const targets = plan.targets ?? [];
  const meets = (target: Target): boolean => meetsPolygonWithin(target.base, target.centre, polygon,
    target.radius + R.targetClearanceMetres, extent);
  const lines = points?.lines;
  if (points && lines && extent && points.targets === plan.targets) {
    // Twice pointBeyondExtent's own margin for any target coordinate.
    const pad = 2e-6 * (1 + extent.magnitude + 4 * points.targetMagnitude);
    const column = (x: number): number => Math.floor((x - lines.originX) / lines.cell);
    const row = (z: number): number => Math.floor((z - lines.originZ) / lines.cell);
    // One extra cell on every side absorbs the floor() rounding at cell edges.
    const c0 = column(extent.minX) - 1, c1 = column(extent.maxX) + 1;
    const r0 = row(extent.minZ) - 1, r1 = row(extent.maxZ) + 1;
    if (points.targetReach + pad > Math.max(extent.xWitnessGap!, extent.zWitnessGap!)
      && c0 >= 0 && r0 >= 0 && c1 < lines.columns && r1 < lines.rows) {
      if (points.stamp >= 0xffffffff) { points.stamps.fill(0); points.stamp = 0; }
      const stamp = ++points.stamp, stamps = points.stamps;
      const once = (index: number): boolean => {
        if (stamps[index] === stamp) return false;
        stamps[index] = stamp; return meets(targets[index]);
      };
      if (points.unboundedLines.some(once)) return true;
      if (rectGridAny(points.targetGrid, { minX: extent.minX - pad, maxX: extent.maxX + pad,
        minZ: extent.minZ - pad, maxZ: extent.maxZ + pad }, once)) return true;
      for (let r = r0; r <= r1; r += 1) for (let c = c0; c <= c1; c += 1) {
        const listed = lines.cells[r * lines.columns + c];
        if (listed) for (const index of listed) if (once(index)) return true;
      }
      return false;
    }
  }
  return targets.some(meets);
}

function groundPoint(frame: AuthoredPathFrame, sampler: TerrainSampler): PathPoint | null {
  const out = sampler.sampleGround(frame.x, frame.z, createGroundSample());
  if (!(Number.isFinite(out.height) && Number.isFinite(out.normal.x) && Number.isFinite(out.normal.y)
    && Number.isFinite(out.normal.z)) || out.offCourse
    || Math.abs(out.height - frame.y) > R.maximumGroundReferenceDifferenceMetres) return null;
  return { x: frame.x, y: out.height, z: frame.z, headingY: frame.headingY,
    distanceMetres: frame.distanceMetres, surface: out.surface, sourceSegmentId: frame.sourceSegmentId };
}

function spanReason(plan: LevelPlan, sampler: TerrainSampler, a: PathPoint, b: PathPoint,
  source: AuthoredPopulationPath, fromBand: number, toBand: number,
  prepared: PopulationValidationContext, requiredSurfaces?: ReadonlySet<SurfaceId>,
  keep?: { footprints?: readonly PopulationSpanFootprint[] },
  frames?: readonly [AuthoredPathFrame, AuthoredPathFrame]): RejectionReason | null {
  const allowed = requiredSurfaces ?? clearanceFor(source.role).allowed;
  const length = distance(a, b);
  if (length < R.epsilon) return 'invalid-source';
  if (Math.abs(b.y - a.y) / length > R.maximumGroundGrade) return 'ground';
  if ((source.role === 'traffic' || source.role === 'service')
    && Math.abs(angle(b.headingY - a.headingY)) / length > 1 / R.minimumVehicleTurnRadiusMetres) return 'turn';
  // groundPoint copied x, z and headingY from the frames, so the frames give the
  // identical footprints while serving as stable keys for the verified memo.
  const footprints = populationSpanFootprints(plan, sampler, frames?.[0] ?? a, frames?.[1] ?? b, source.role);
  if (keep) keep.footprints = footprints;
  if (footprints.length === 0) return 'ground';
  const ground = createGroundSample();
  let lastCentre = a.y;
  // A station shared by consecutive footprints was just fully checked and
  // passed; repeating it reproduces the identical pure samples, hull and a
  // zero centre step. Only its footprint-specific band test can differ.
  let passedStation = NaN;
  const hull = actorHull(source.role === 'traffic' ? 'trafficVehicle' : source.role === 'service' ? 'serviceVehicle'
    : source.role === 'rider' ? 'fictionalEuc' : 'walker');
  for (const footprint of footprints) {
    const excluded = exclusion(plan, footprint, prepared);
    if (excluded) return excluded;
    if (a.sourceSegmentId === b.sourceSegmentId) {
      const groundSource = prepared.groundSourcesById.get(a.sourceSegmentId);
      if (groundSource && !footprintCovered(groundSource, footprint.polygon,
        prepared.sourceCoverage.get(groundSource), prepared)) return 'narrow-band';
    }
    if (!surfaceFootprintClear(plan, footprint.polygon, allowed, prepared)) return 'surface';
    for (const t of [footprint.fromFraction, footprint.toFraction]) {
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const heading = a.headingY + angle(b.headingY - a.headingY) * t;
      if (t === passedStation) {
        const band = fromBand + (toBand - fromBand) * t;
        const leftX = Math.cos(heading), leftZ = -Math.sin(heading);
        if (footprint.polygon.some(point => Math.abs((point.x - x) * leftX + (point.z - z) * leftZ)
          > band + R.epsilon)) return 'narrow-band';
        continue;
      }
      sampler.sampleGround(x, z, ground);
      if (!(Number.isFinite(ground.height) && Number.isFinite(ground.normal.x)
        && Number.isFinite(ground.normal.y) && Number.isFinite(ground.normal.z))
        || ground.offCourse || !allowed.has(ground.surface)) return 'surface';
      if (ground.normal.y < 1 / Math.sqrt(1 + R.maximumGroundGrade ** 2)) return 'ground';
      const centre = ground.height;
      const band = fromBand + (toBand - fromBand) * t;
      const leftX = Math.cos(heading), leftZ = -Math.sin(heading);
      if (footprint.polygon.some(point => Math.abs((point.x - x) * leftX + (point.z - z) * leftZ)
        > band + R.epsilon)) return 'narrow-band';
      const support = lowerHullCorners(x, centre, z, heading, ground.normal.x, ground.normal.y, ground.normal.z, hull);
      for (const corner of support) {
        sampler.sampleGround(corner.x, corner.z, ground);
        if (!(Number.isFinite(ground.height) && Number.isFinite(ground.normal.y)) || ground.offCourse
          || !allowed.has(ground.surface)) return 'surface';
        const reach = Math.hypot(corner.x - x, corner.z - z);
        if (reach > R.epsilon && Math.abs(ground.height - centre) / reach > R.maximumCrossGrade) return 'ground';
        if (Math.abs(ground.height - corner.y) > R.maximumStepMetres) return 'ground';
      }
      if (Math.abs(centre - lastCentre) > R.maximumStepMetres) return 'ground';
      lastCentre = centre;
      passedStation = t;
    }
  }
  return null;
}

/** Same authoritative predicates, exposed for bounded supplemental diagnostics. */
export function populationPathSpanReason(plan: LevelPlan, sampler: TerrainSampler,
  a: AuthoredPathFrame, b: AuthoredPathFrame, source: AuthoredPopulationPath,
  prepared?: PopulationValidationContext, requiredSurfaces?: ReadonlySet<SurfaceId>): RejectionReason | null {
  return spanProof(plan,sampler,a,b,source,prepared,requiredSurfaces,false).reason;
}
/** populationPathSpanReason's cached proof; with keepFootprints a newly
 * computed proof also retains the span's pure footprints (populationSpanFootprints
 * of these frames' x, z and heading with source.role, plan and sampler). */
function spanProof(plan: LevelPlan, sampler: TerrainSampler,
  a: AuthoredPathFrame, b: AuthoredPathFrame, source: AuthoredPopulationPath,
  prepared: PopulationValidationContext | undefined, requiredSurfaces: ReadonlySet<SurfaceId> | undefined,
  keepFootprints: boolean): SpanProof {
  const context=contextFor(plan,prepared);
  const byFirst=context.spanProofs.get(source)??new Map<AuthoredPathFrame,Map<AuthoredPathFrame,SpanProof[]>>();
  context.spanProofs.set(source,byFirst);
  const byLast=byFirst.get(a)??new Map<AuthoredPathFrame,SpanProof[]>();byFirst.set(a,byLast);
  const proofs=byLast.get(b)??[];byLast.set(b,proofs);
  const signatureValues=[source.role,a.x,a.y,a.z,a.headingY,a.distanceMetres,a.sourceSegmentId,a.halfWidthMetres,
    b.x,b.y,b.z,b.headingY,b.distanceMetres,b.sourceSegmentId,b.halfWidthMetres,requiredSurfaces?[...requiredSurfaces]:undefined];
  // Same lookup: a stored proof matches on sampler, surface set and the
  // stringified creation-time values; nothing is stringified with no candidate.
  if(proofs.length){
    const signature=JSON.stringify(signatureValues);
    const existing=proofs.find(proof=>proof.sampler===sampler&&proof.surfaces===requiredSurfaces
      &&(proof.signature??=JSON.stringify(proof.signatureValues))===signature);
    if(existing)return existing;
  }
  const first = groundPoint(a, sampler), last = groundPoint(b, sampler);
  const keep: { footprints?: readonly PopulationSpanFootprint[] } | undefined = keepFootprints ? {} : undefined;
  const reason=first && last ? spanReason(plan, sampler, first, last, source,
    a.halfWidthMetres, b.halfWidthMetres, context, requiredSurfaces, keep, [a, b]) : 'ground';
  const proof:SpanProof={sampler,surfaces:requiredSurfaces,signatureValues,reason,
    ...(keep?.footprints?{footprints:keep.footprints}:{})};
  proofs.push(proof);return proof;
}
export function populationFootprintExclusion(plan: LevelPlan,
  footprint: PopulationSpanFootprint, prepared?: PopulationValidationContext): RejectionReason | null {
  return exclusion(plan, footprint, prepared);
}

/** groundSourceCovers for a footprint polygon (immutable output of
 * populationSpanFootprints), remembered per coverage index. An index's results
 * are kept only while every coordinate of its source polygons still equals the
 * snapshot taken with them (re-checked once per validation context, which like
 * every prepared context datum assumes an unedited plan while it is in use), so
 * a result is reused only for identical inputs. */
interface CoverageMemo { readonly values: readonly number[]; readonly results: WeakMap<readonly Point2[], boolean>;
  readonly checked: WeakSet<PopulationValidationContext> }
let coverageMemo: WeakMap<GroundSourceCoverageIndex, CoverageMemo> | undefined;
function coverageValues(index: GroundSourceCoverageIndex): number[] {
  const values: number[] = [index.polygons.length];
  for (const polygon of index.polygons) {
    values.push(polygon.length);
    for (const point of polygon) values.push(point.x, point.z);
  }
  return values;
}
function footprintCovered(source: PopulationGroundSource, polygon: readonly Point2[],
  index: GroundSourceCoverageIndex | undefined, context: PopulationValidationContext): boolean {
  if (!coverageMemo || !index || index.source !== source || index.polygons !== source.polygons) {
    return groundSourceCovers(source, polygon, index);
  }
  let memo = coverageMemo.get(index);
  if (!memo || !memo.checked.has(context)) {
    const values = coverageValues(index);
    if (!memo || !sameScalars(memo.values, values)) {
      memo = { values, results: new WeakMap(), checked: new WeakSet() }; coverageMemo.set(index, memo);
    }
    memo.checked.add(context);
  }
  const known = memo.results.get(polygon);
  if (known !== undefined) return known;
  const covered = groundSourceCovers(source, polygon, index);
  memo.results.set(polygon, covered);
  return covered;
}
export function groundSourceCovers(source: PopulationGroundSource, polygon: readonly Point2[],
  prepared:GroundSourceCoverageIndex=prepareGroundSourceCoverage(source)): boolean {
  if(prepared.source!==source||prepared.polygons!==source.polygons)throw new Error('Ground coverage index belongs to another source');
  let remaining: Point2[][] = [[...polygon]];
  // Original order and exact subtraction survive. Only boundaries whose
  // epsilon-expanded half-plane intersection cannot meet the query are absent.
  for (const item of spatialQuery(prepared.root,polygonBounds(polygon))) {
    // upward(item.value) is pure; one ordering serves every remaining piece.
    const ordered=upward(item.value);
    remaining=remaining.flatMap(piece=>subtractOrdered(piece,ordered));
    if(!remaining.length)return true;
  }
  return remaining.every(piece => piece.length < 3 || area(piece) <= R.epsilon);
}
function validGroundSource(plan: LevelPlan, source: PopulationGroundSource): boolean {
  const hosts = new Set(plan.segments.map(segment => segment.id));
  const patches = new Set((plan.groundSurfacePatches ?? []).map(patch => patch.id));
  return groundSourceValidWithIds(source, hosts, patches);
}
function groundSourceValidWithIds(source: PopulationGroundSource, hosts: ReadonlySet<string>,
  patches: ReadonlySet<string>): boolean {
  return !!source.id && source.hostSegmentIds.length > 0 && source.hostSegmentIds.every(id => hosts.has(id))
    && source.polygons.length > 0 && source.polygons.every(polygon => polygon.length >= 3
      && polygon.every(point => finite(point.x, point.y, point.z)) && area(polygon) > R.epsilon)
    && source.groundPatchIds.every(id => patches.has(id));
}

/** Entire original movement bands remain reserved for purposeful additions,
 * including rejected traffic. Our already proved footway paths may share the
 * pedestrian runtime; they do not turn into a second vehicle reservation. */
export function districtActivityReservedLane(plan: LevelPlan, polygon: readonly Point2[], ownPathId?: string,
  originalPathId?: string, prepared?:PopulationValidationContext): boolean {
  const context=contextFor(plan,prepared), skip=(item:MovementReservation):boolean=>
    item.pathId!==undefined&&(item.pathId===ownPathId||item.pathId===originalPathId);
  if(context.invalidMovement.some(item=>!skip(item)))return true;
  const bounds=clipBounds(polygon),aligned=alignedSatBoundsOf(polygon);
  let query:PreparedPolygon|undefined;
  // Same tree candidate rule (item bounds meeting the clip bounds), skip and
  // SAT; the grid only omits items the query's own aligned axes separate.
  if(aligned&&context.movementGrid)return rectGridAny(context.movementGrid,aligned,item=>
    boundsMeet(item.bounds,bounds)&&!skip(item.value)&&preparedPolygonsMeet(item.value.polygon,query??=preparedPolygon(polygon)));
  return spatialAny(context.movementTree,bounds,item=>
    !skip(item)&&preparedPolygonsMeet(item.polygon,query??=preparedPolygon(polygon)));
}

/** Re-prove the complete trace, exact frontage source and reservations at the
 * population seam. A blocked middle cannot be clipped into claimed coverage. */
export function districtActivityWalkReason(plan: LevelPlan, walk: AuthoredDistrictActivityWalk,
  sampler: TerrainSampler = new PlanTerrainSampler(plan),
  context: PopulationValidationContext = createPopulationValidationContext(plan)): RejectionReason | null {
  contextFor(plan, context);
  const path = plan.populationPaths?.find(item => item.id === walk.pathId);
  if (!walk.id || !path || path.role !== 'pedestrian' || path.district !== walk.district
    || path.closed || path.serviceShuttle || path.frames.length < 2
    || walk.pathDigest !== hash128(JSON.stringify(path))
    || !['walker','jogger','worker'].includes(walk.kind)
    || (walk.intent === 'foot-service' ? walk.district !== 'industrial' || walk.kind !== 'worker'
      : walk.intent === 'park-exercise' ? walk.district !== 'park' || walk.kind === 'worker'
        : walk.intent !== 'frontage-visit' || walk.kind !== 'walker')) return 'invalid-source';
  if (walk.owner === 'frontage') {
    const front = plan.districtAdjacency?.frontages.find(item => item.id === walk.frontageId);
    const prop = walk.sourcePropIndex === undefined ? undefined : plan.props?.[walk.sourcePropIndex];
    const source = plan.populationGroundSources?.find(item => item.id === walk.sourceId);
    const patches = (front?.patchIds ?? []).map(id => plan.groundSurfacePatches?.find(patch => patch.id === id));
    const polygons = patches.flatMap(patch => patch?.triangles.map(triangle => triangle.vertices) ?? []);
    if (!front || front.district !== walk.district || front.propIndex !== walk.sourcePropIndex
      || !prop || prop.kind !== 'building' || !exactBuildingBody(plan, prop)
      || !front.patchIds.some(id => id.includes('-base-'))
      || !front.patchIds.some(id => id.includes('-access-') || id.includes('-service-apron-'))
      || !source || source.purpose !== 'footpath' || source.sourcePropIndex !== front.propIndex
      || context.validGroundSources.get(source.id)!==source || patches.some(patch => !patch)
      || JSON.stringify(source.groundPatchIds) !== JSON.stringify(front.patchIds)
      || JSON.stringify(source.polygons) !== JSON.stringify(polygons)
      || source.hostSegmentIds.length !== 1 || source.hostSegmentIds[0] !== front.streetSegmentId
      || path.frames.some(frame => frame.sourceSegmentId !== source.id)) return 'invalid-source';
  } else {
    const original=plan.populationPaths?.find(item=>item.id===walk.originalPathId);
    const range=walk.originalFrameRange;
    if (walk.owner !== 'authored-path' || walk.intent !== 'park-exercise'
      || walk.frontageId !== undefined || walk.sourceId !== undefined || walk.sourcePropIndex !== undefined
      || !original || original.id.startsWith('district-activity/') || original.role!=='pedestrian' || original.district!=='park'
      || walk.originalPathDigest!==hash128(JSON.stringify(original))
      || !range || !Number.isSafeInteger(range[0]) || !Number.isSafeInteger(range[1])
      || range[0]<0 || range[1]>=original.frames.length || range[1]<=range[0]) return 'invalid-source';
    const start=original.frames[range[0]].distanceMetres;
    const exact=original.frames.slice(range[0],range[1]+1).map(frame=>({...frame,distanceMetres:frame.distanceMetres-start}));
    if (JSON.stringify(exact)!==JSON.stringify(path.frames)
      || path.frames.some(frame => {
        const source = context.validGroundSources.get(frame.sourceSegmentId);
        return source ? source.purpose !== 'footpath' : !plan.segments.some(segment => segment.id === frame.sourceSegmentId);
      })) return 'invalid-source';
  }
  if (path.frames.at(-1)!.distanceMetres - path.frames[0].distanceMetres < R.minimumWalkMetres) return 'short';
  for (let index = 1; index < path.frames.length; index += 1) {
    const a = path.frames[index - 1], b = path.frames[index];
    if (!(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z) && Number.isFinite(a.headingY)
      && Number.isFinite(a.distanceMetres) && Number.isFinite(a.halfWidthMetres)
      && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z) && Number.isFinite(b.headingY)
      && Number.isFinite(b.distanceMetres) && Number.isFinite(b.halfWidthMetres))
      || !context.presentSourceIds.has(a.sourceSegmentId) || !context.presentSourceIds.has(b.sourceSegmentId)
      || a.halfWidthMetres < clearanceFor('pedestrian').radius + R.staticClearanceMetres
      || b.halfWidthMetres < clearanceFor('pedestrian').radius + R.staticClearanceMetres
      || b.distanceMetres <= a.distanceMetres || distance(a,b) > R.maximumSourceSpacingMetres + R.epsilon
      || Math.abs(b.distanceMetres-a.distanceMetres-distance(a,b)) > R.epsilon) return 'invalid-source';
    const proof = spanProof(plan,sampler,a,b,path,context,undefined,true);
    if (proof.reason) return proof.reason;
    // path.role is 'pedestrian' here, so a kept proof footprint list is exactly
    // populationSpanFootprints(plan, sampler, a, b, 'pedestrian').
    for (const footprint of proof.footprints ?? populationSpanFootprints(plan,sampler,a,b,'pedestrian'))
      if (districtActivityReservedLane(plan,footprint.polygon,path.id,walk.originalPathId,context)) return 'narrow-band';
  }
  return null;
}

function minimumLength(role: PathRole): number {
  return role === 'traffic' ? R.minimumTrafficMetres : role === 'rider' ? R.minimumRideMetres : R.minimumWalkMetres;
}

function pathsFromSource(plan: LevelPlan, source: AuthoredPopulationPath, sampler: TerrainSampler,
  rejected: { pathId: string; reason: RejectionReason }[], prepared: PopulationValidationContext): PopulationPath[] {
  const present = prepared.presentSourceIds;
  const { radius } = clearanceFor(source.role);
  if (!source.id || source.frames.length < 2 || source.frames.some((frame, index) =>
    !(Number.isFinite(frame.x) && Number.isFinite(frame.y) && Number.isFinite(frame.z)
      && Number.isFinite(frame.headingY) && Number.isFinite(frame.distanceMetres) && Number.isFinite(frame.halfWidthMetres))
      || frame.halfWidthMetres < radius + R.staticClearanceMetres
      || (index > 0 && (frame.distanceMetres <= source.frames[index - 1].distanceMetres
        || distance(frame, source.frames[index - 1]) > R.maximumSourceSpacingMetres + R.epsilon
        || Math.abs(frame.distanceMetres - source.frames[index - 1].distanceMetres
          - distance(frame, source.frames[index - 1])) > R.epsilon)))) {
    rejected.push({ pathId: source.id, reason: 'invalid-source' }); return [];
  }
  if (source.frames.some(frame => !present.has(frame.sourceSegmentId))) {
    rejected.push({ pathId: source.id, reason: 'missing-segment' }); return [];
  }
  if (source.closed && (distance(source.frames[0], source.frames[source.frames.length - 1]) > R.joinToleranceMetres
    || Math.abs(angle(source.frames[0].headingY - source.frames[source.frames.length - 1].headingY))
      > R.joinHeadingToleranceRadians)) {
    rejected.push({ pathId: source.id, reason: 'invalid-source' }); return [];
  }
  if (source.role === 'traffic' && !source.closed) {
    rejected.push({ pathId: source.id, reason: 'open-traffic' }); return [];
  }
  const points = source.frames.map(frame => groundPoint(frame, sampler));
  const chunks: PathPoint[][] = []; let current: PathPoint[] = [];
  let failed = false;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index];
    const reason = a && b ? populationPathSpanReason(plan, sampler, source.frames[index-1],source.frames[index],source,prepared) : 'ground';
    if (reason || !a || !b) {
      failed = true; rejected.push({ pathId: source.id, reason: reason ?? 'ground' });
      if (current.length > 1) chunks.push(current); current = []; continue;
    }
    if (current.length === 0) current.push(a); current.push(b);
  }
  if (current.length > 1) chunks.push(current);
  // A broken vehicle loop is not transformed into traffic that reverses at a gate.
  if (source.closed && failed && (source.role === 'traffic' || source.role === 'service')) return [];
  return chunks.flatMap((chunk, index) => {
    const start = chunk[0].distanceMetres;
    const length = chunk[chunk.length - 1].distanceMetres - start;
    if (length < minimumLength(source.role)
      || (source.role === 'service' && !source.closed && length > R.maximumServiceShuttleMetres)) {
      rejected.push({ pathId: source.id, reason: 'short' }); return [];
    }
    return [{ id: `${source.id}/clear-${index}`, role: source.role, district: source.district,
      points: chunk.map(point => ({ ...point, distanceMetres: point.distanceMetres - start })),
      lengthMetres: length, closed: source.closed && !failed,
      serviceShuttle: source.serviceShuttle, clearanceRadiusMetres: radius, connections: [] }];
  });
}

function connectedPaths(paths: readonly PopulationPath[]): PopulationPath[] {
  return paths.map(path => {
    const connections: { at: 'start' | 'end'; pathId: string; enterAt: 'start' | 'end' }[] = [];
    if (path.role !== 'traffic' && path.role !== 'service') for (const other of paths) {
      if (other.id === path.id || other.role !== path.role || other.district !== path.district) continue;
      for (const at of ['start', 'end'] as const) for (const enterAt of ['start', 'end'] as const) {
        const a = path.points[at === 'start' ? 0 : path.points.length - 1];
        const b = other.points[enterAt === 'start' ? 0 : other.points.length - 1];
        if (distance(a, b) <= R.joinToleranceMetres && Math.abs(a.y - b.y) <= R.joinToleranceMetres) {
          connections.push({ at, pathId: other.id, enterAt });
        }
      }
    }
    return { ...path, connections };
  });
}

function atDistance(path: PopulationPath, along: number): PathPoint {
  let index = 1;
  while (index < path.points.length - 1 && path.points[index].distanceMetres < along) index += 1;
  const a = path.points[index - 1], b = path.points[index];
  const t = Math.max(0, Math.min(1, (along - a.distanceMetres) / (b.distanceMetres - a.distanceMetres)));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
    headingY: a.headingY + angle(b.headingY - a.headingY) * t, distanceMetres: along,
    surface: a.surface, sourceSegmentId: a.sourceSegmentId };
}

function propMatches(prop: Prop, kind: ActivityAnchor['kind'], district: District): boolean {
  if (kind === 'social') return prop.kind === 'bench';
  if (kind === 'worker' || kind === 'parking') return district === 'industrial'
    && prop.kind === 'building' && prop.look === 'industrial';
  return prop.kind === 'bench' || (prop.kind === 'building' && prop.look === district);
}

function anchorsFromPaths(plan: LevelPlan, paths: readonly PopulationPath[]): ActivityAnchor[] {
  const anchors: ActivityAnchor[] = [];
  for (const path of paths) {
    if (path.role === 'rider' || path.role === 'traffic') continue;
    const kinds: ActivityAnchor['kind'][] = path.role === 'service' ? path.serviceShuttle ? ['worker'] : []
      : path.district === 'industrial' ? ['worker', 'rest'] : ['social', 'rest'];
    // Every point lies in this rectangle. A prop farther from it than the
    // anchor distance (plus its body's half-diagonal) gives no gap <= that
    // distance at any point, so its inner loop would change nothing.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const point of path.points) {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    const unreachable = (prop: Prop): boolean => {
      const x = prop.position.x, z = prop.position.z;
      const body = prop.kind === 'building' && prop.size
        ? Math.hypot(prop.size.x * prop.scale / 2, prop.size.z * prop.scale / 2) : 0;
      const outsideX = Math.max(0, minX - x, x - maxX), outsideZ = Math.max(0, minZ - z, z - maxZ);
      const lower = Math.hypot(outsideX, outsideZ) - body
        - 1e-6 * (1 + Math.abs(x) + Math.abs(z) + Math.abs(minX) + Math.abs(maxX) + Math.abs(minZ) + Math.abs(maxZ) + body);
      return lower > R.anchorMaximumPropDistanceMetres;
    };
    for (const kind of kinds) {
      let best: { point: PathPoint; propIndex: number; distance: number } | undefined;
      for (let propIndex = 0; propIndex < (plan.props?.length ?? 0); propIndex += 1) {
        const prop = plan.props![propIndex]; if (!propMatches(prop, kind, path.district)) continue;
        if (unreachable(prop)) continue;
        for (const point of path.points) {
          // Do not place stationary activity directly on a shuttle turnaround.
          const endpointMargin = path.role === 'service' && path.serviceShuttle
            ? Math.min(R.actorSpacingMetres / 2, path.lengthMetres / 4) : R.actorSpacingMetres / 2;
          if (point.distanceMetres < endpointMargin
            || point.distanceMetres > path.lengthMetres - endpointMargin) continue;
          let gap = distance(prop.position, point);
          if (prop.kind === 'building' && prop.size) {
            const c = Math.cos(prop.rotationY), s = Math.sin(prop.rotationY);
            const dx = point.x - prop.position.x, dz = point.z - prop.position.z;
            gap = Math.hypot(Math.max(0, Math.abs(c * dx - s * dz) - prop.size.x * prop.scale / 2),
              Math.max(0, Math.abs(s * dx + c * dz) - prop.size.z * prop.scale / 2));
          }
          if (gap <= R.anchorMaximumPropDistanceMetres && (!best || gap < best.distance)) {
            best = { point, propIndex, distance: gap };
          }
        }
      }
      if (best) anchors.push({ id: `${path.id}/${kind}`, kind, district: path.district,
        position: { x: best.point.x, y: best.point.y, z: best.point.z }, headingY: best.point.headingY,
        pathId: path.id, distanceMetres: best.point.distanceMetres, sourcePropIndex: best.propIndex });
    }
  }
  return anchors;
}

/** A stationary bay is a real rectangle, independent of every moving lane. */
export function parkingBayReason(plan: LevelPlan, bay: AuthoredParkingBay,
  sampler: TerrainSampler = new PlanTerrainSampler(plan),
  context: PopulationValidationContext = createPopulationValidationContext(plan)): RejectionReason | null {
  contextFor(plan, context);
  const source = plan.populationGroundSources?.find(item => item.id === bay.sourceId);
  const prop = plan.props?.[bay.sourcePropIndex];
  if (!bay.id || !source || source.purpose !== 'parking-bay' || !validGroundSource(plan, source)
    || source.sourcePropIndex !== bay.sourcePropIndex || !prop || prop.kind !== 'building'
    || prop.look !== 'industrial' || !prop.size || !exactBuildingBody(plan, prop)
    || !finite(bay.position.x, bay.position.y, bay.position.z,
      bay.headingY, bay.halfWidthMetres, bay.halfLengthMetres) || bay.halfWidthMetres <= 0 || bay.halfLengthMetres <= 0) return 'invalid-source';
  const ground = sampler.sampleGround(bay.position.x, bay.position.z, createGroundSample());
  const pc = Math.cos(prop.rotationY), ps = Math.sin(prop.rotationY);
  const dx = bay.position.x - prop.position.x, dz = bay.position.z - prop.position.z;
  if (Math.hypot(Math.max(0, Math.abs(pc * dx - ps * dz) - prop.size.x * prop.scale / 2),
    Math.max(0, Math.abs(ps * dx + pc * dz) - prop.size.z * prop.scale / 2)) > R.anchorMaximumPropDistanceMetres) return 'invalid-source';
  if (ground.offCourse || !VEHICLE_SURFACES.has(ground.surface)
    || !(Number.isFinite(ground.height) && Number.isFinite(ground.normal.x) && Number.isFinite(ground.normal.y) && Number.isFinite(ground.normal.z))
    || Math.abs(ground.height - bay.position.y) > R.maximumGroundReferenceDifferenceMetres
    || ground.normal.y < 1 / Math.sqrt(1 + R.maximumGroundGrade ** 2)) return 'ground';
  const hull = actorHull('parkedVehicle');
  const body = physicalPopulationHull(bay.position.x, ground.height, bay.position.z, bay.headingY,
    ground.normal.x, ground.normal.y, ground.normal.z, hull);
  const polygon = expandedPolygon(hullCorners(body), R.staticClearanceMetres);
  const c = Math.cos(bay.headingY), s = Math.sin(bay.headingY);
  if (polygon.some(point => Math.abs(c * (point.x - bay.position.x) - s * (point.z - bay.position.z)) > bay.halfWidthMetres
    || Math.abs(s * (point.x - bay.position.x) + c * (point.z - bay.position.z)) > bay.halfLengthMetres)
    || !groundSourceCovers(source, polygon,context.sourceCoverage.get(source))) return 'narrow-band';
  const footprint: PopulationSpanFootprint = { polygon, minY: body.minY, maxY: body.maxY,
    fromFraction: 0, toFraction: 1, fromHull: body, toHull: body };
  const excluded = exclusion(plan, footprint, context);
  if (excluded) return excluded;
  if (!surfaceFootprintClear(plan, polygon, VEHICLE_SURFACES, context)) return 'surface';
  for (const corner of transformPopulationHull(bay.position.x, ground.height, bay.position.z,
    bay.headingY, ground.normal.x, ground.normal.y, ground.normal.z, hull).lowerCorners) {
    const support = sampler.sampleGround(corner.x, corner.z, createGroundSample());
    if (support.offCourse || !VEHICLE_SURFACES.has(support.surface)
      || Math.abs(support.height - corner.y) > R.maximumStepMetres) return 'ground';
  }
  if (bay.approachFrames) {
    const frames = bay.approachFrames, last = frames.at(-1);
    if (frames.length < 2 || !last || distance(last, bay.position) > R.joinToleranceMetres
      || Math.abs(angle(last.headingY - bay.headingY)) > R.joinHeadingToleranceRadians) return 'invalid-source';
    const present = new Set((plan.populationGroundSources ?? []).filter(item => item.purpose === 'driveway'
      && validGroundSource(plan, item)).map(item => item.id));
    const approach: AuthoredPopulationPath = { id: `${bay.id}/approach`, role: 'service', district: 'industrial',
      frames, closed: false, serviceShuttle: false };
    for (let index = 1; index < frames.length; index += 1) {
      const a = frames[index - 1], b = frames[index];
      if (!present.has(a.sourceSegmentId) || !present.has(b.sourceSegmentId)
        || !finite(a.x, a.y, a.z, a.headingY, a.distanceMetres, b.x, b.y, b.z, b.headingY, b.distanceMetres)
        || b.distanceMetres <= a.distanceMetres || distance(a, b) > R.maximumSourceSpacingMetres + R.epsilon) return 'invalid-source';
      const reason = populationPathSpanReason(plan, sampler, a, b, approach, context);
      if (reason) return reason;
    }
  }
  return null;
}

function parkingSupport(plan: LevelPlan, sampler: TerrainSampler,
  rejected: { pathId: string; reason: RejectionReason }[], context: PopulationValidationContext):
  { paths: PopulationPath[]; anchors: ActivityAnchor[] } {
  const paths: PopulationPath[] = [], anchors: ActivityAnchor[] = [];
  const ids = new Set<string>();
  for (const bay of plan.populationParkingBays ?? []) {
    const reason = ids.has(bay.id) ? 'invalid-source' : parkingBayReason(plan, bay, sampler, context);
    ids.add(bay.id);
    if (reason) { rejected.push({ pathId: bay.id, reason }); continue; }
    // A one-metre orientation axis carries the stationary pose. It is not an
    // approach, shuttle, or fabricated eight-metre driving path.
    const points = [-0.5, 0.5].map((offset, index): PathPoint => {
      const x = bay.position.x + Math.sin(bay.headingY) * offset;
      const z = bay.position.z + Math.cos(bay.headingY) * offset;
      const ground = sampler.sampleGround(x, z, createGroundSample());
      return { x, y: ground.height, z, headingY: bay.headingY, distanceMetres: index,
        sourceSegmentId: bay.sourceId, surface: ground.surface };
    });
    const id = `${bay.id}/stationary-axis`;
    paths.push({ id, role: 'service', district: 'industrial', points, lengthMetres: 1,
      closed: false, serviceShuttle: false, clearanceRadiusMetres: Math.hypot(R.vehicleHalfWidthMetres,
        R.vehicleHalfLengthMetres), connections: [] });
    anchors.push({ id: `${bay.id}/parking`, kind: 'parking', district: 'industrial',
      position: { ...bay.position }, headingY: bay.headingY, pathId: id,
      distanceMetres: 0.5, sourcePropIndex: bay.sourcePropIndex });
  }
  return { paths, anchors };
}

/** Revalidate actual bench ownership, exact patch provenance and the whole
 * approach before accepting stationary supports. The support axis is only a
 * pose carrier; it never pretends to be an eight-metre walking corridor. */
function districtSocialSupport(plan: LevelPlan, sampler: TerrainSampler,
  rejected: { pathId: string; reason: RejectionReason }[], context: PopulationValidationContext):
  { paths: PopulationPath[]; anchors: ActivityAnchor[] } {
  const paths: PopulationPath[] = [], anchors: ActivityAnchor[] = [];
  const ids = new Set<string>();
  for (const site of plan.populationActivitySites ?? []) {
    const source = plan.populationGroundSources?.find(item => item.id === site.sourceId);
    const group = plan.districtAdjacency?.groups.find(item => item.id === site.groupId);
    const front = plan.districtAdjacency?.frontages.find(item => item.id === group?.frontageId);
    const bench = plan.props?.[site.sourcePropIndex];
    const patchIds = [...(front?.patchIds ?? []), ...(group?.groundPatchIds ?? [])];
    const patches = patchIds.map(id => plan.groundSurfacePatches?.find(patch => patch.id === id));
    const actualPolygons = patches.flatMap(patch => patch?.triangles.map(triangle => triangle.vertices) ?? []);
    let reason: RejectionReason | null = !site.id || ids.has(site.id) || !source || !group || !front
      || group.district !== site.district || !group.propIndices.includes(site.sourcePropIndex)
      || !bench || bench.kind !== 'bench' || source.purpose !== 'footpath'
      || source.sourcePropIndex !== site.sourcePropIndex || !validGroundSource(plan, source)
      || patches.some(patch => !patch) || JSON.stringify(source.groundPatchIds) !== JSON.stringify(patchIds)
      || JSON.stringify(source.polygons) !== JSON.stringify(actualPolygons)
      || source.hostSegmentIds.length !== 1 || source.hostSegmentIds[0] !== front.streetSegmentId
      || site.positions.length !== 2 || site.approachFrames.length < 2 ? 'invalid-source' : null;
    ids.add(site.id);
    const approach: AuthoredPopulationPath = { id: site.id, role: 'pedestrian', district: site.district,
      frames: site.approachFrames, closed: false, serviceShuttle: false };
    if (!reason) for (let index = 1; index < site.approachFrames.length; index += 1) {
      const a = site.approachFrames[index - 1], b = site.approachFrames[index];
      if (!finite(a.x, a.y, a.z, a.headingY, a.distanceMetres, a.halfWidthMetres,
        b.x, b.y, b.z, b.headingY, b.distanceMetres, b.halfWidthMetres)
        || a.sourceSegmentId !== site.sourceId || b.sourceSegmentId !== site.sourceId
        || a.halfWidthMetres < clearanceFor('pedestrian').radius + R.staticClearanceMetres
        || b.halfWidthMetres < clearanceFor('pedestrian').radius + R.staticClearanceMetres
        || b.distanceMetres <= a.distanceMetres || distance(a, b) > R.maximumSourceSpacingMetres + R.epsilon
        || Math.abs(b.distanceMetres - a.distanceMetres - distance(a, b)) > R.epsilon) { reason = 'invalid-source'; break; }
      reason = populationPathSpanReason(plan, sampler, a, b, approach, context);
      if (reason) break;
    }
    const supported: { point: PathPoint; headingY: number }[] = [];
    if (!reason) for (const target of site.positions) {
      if (!finite(target.position.x, target.position.y, target.position.z, target.headingY)
        || !bench || distance(target.position, bench.position) > R.socialSpacingMetres * 2) { reason = 'invalid-source'; break; }
      const frame = { ...target.position, headingY: target.headingY, distanceMetres: 0,
        sourceSegmentId: site.sourceId, halfWidthMetres: clearanceFor('pedestrian').radius + R.staticClearanceMetres };
      const other = { ...frame, x: frame.x + Math.sin(frame.headingY) * 0.01,
        z: frame.z + Math.cos(frame.headingY) * 0.01, distanceMetres: 0.01 };
      reason = populationPathSpanReason(plan, sampler, frame, other, approach, context);
      const point = groundPoint(frame, sampler);
      if (reason || !point) { reason ??= 'ground'; break; }
      supported.push({ point, headingY: target.headingY });
    }
    if (!reason && (distance(supported[0].point, supported[1].point) < R.socialSpacingMetres - R.epsilon
      || distance(supported[0].point, supported[1].point) > R.socialSpacingMetres + R.epsilon)) reason = 'invalid-source';
    if (reason) { rejected.push({ pathId: site.id, reason }); continue; }
    for (let index = 0; index < supported.length; index += 1) {
      const { point, headingY } = supported[index], id = `${site.id}/stationary-${index}`;
      const points = [-0.01, 0.01].map((offset, end): PathPoint => ({ ...point,
        x: point.x + Math.sin(headingY) * offset, z: point.z + Math.cos(headingY) * offset,
        distanceMetres: end * 0.02 }));
      paths.push({ id, role: 'pedestrian', district: site.district, points, lengthMetres: 0.02,
        closed: false, serviceShuttle: false, clearanceRadiusMetres: clearanceFor('pedestrian').radius, connections: [] });
      anchors.push({ id: `${id}/social`, kind: 'social', district: site.district,
        position: { x: point.x, y: point.y, z: point.z }, headingY, pathId: id,
        distanceMetres: 0.01, sourcePropIndex: site.sourcePropIndex, activitySiteId: site.id });
    }
  }
  return { paths, anchors };
}

function actorHull(kind: ActorKind): ActorSpec['hull'] {
  if (kind === 'parkedVehicle' || kind === 'serviceVehicle' || kind === 'trafficVehicle') return {
    halfWidthMetres: R.vehicleHalfWidthMetres, halfLengthMetres: R.vehicleHalfLengthMetres, heightMetres: R.vehicleHeightMetres,
  };
  const radius = kind === 'fictionalEuc' ? R.riderRadiusMetres : R.pedestrianRadiusMetres;
  return { halfWidthMetres: radius, halfLengthMetres: radius, heightMetres: R.actorHeightMetres };
}

function actorsFromPaths(plan: LevelPlan, paths: readonly PopulationPath[], anchors: readonly ActivityAnchor[],
  sampler: TerrainSampler, context: PopulationValidationContext,
  activityWalks: readonly AuthoredDistrictActivityWalk[] = []): ActorSpec[] {
  const worldId = plan.populationActivityChoiceWorldId ?? plan.id;
  const actors: ActorSpec[] = []; const parkedReservations: { pathId: string; distanceMetres: number }[] = [];
  const positions: { position: Vec3; kind: ActorKind; body: PopulationHullPrism; socialGroupId?: string }[] = [];
  const isPerson = (kind: ActorKind): boolean => kind === 'walker' || kind === 'jogger' || kind === 'social' || kind === 'worker';
  const add = (kind: ActorKind, path: PopulationPath, along: number, anchor?: ActivityAnchor,
    socialGroupId?: string, activityWalkId?: string): boolean => {
    const point = atDistance(path, along);
    const ground = sampler.sampleGround(point.x, point.z, createGroundSample());
    const hull = actorHull(kind);
    const body = physicalPopulationHull(point.x, ground.height, point.z, point.headingY,
      ground.normal.x, ground.normal.y, ground.normal.z, hull);
    const polygon = expandedPolygon(hullCorners(body), R.staticClearanceMetres);
    // Validate the exact initial interpolated physical pose as well as its
    // surrounding path sweep; the real spawn exclusion covers the full prism.
    if (exclusion(plan, { polygon, minY: body.minY, maxY: body.maxY, fromFraction: 0, toFraction: 1,
      fromHull: body, toHull: body }, context)) return false;
    if (positions.some(item => {
      if (body.minY < item.body.maxY && body.maxY > item.body.minY
        && polygonsMeet(polygon, expandedPolygon(hullCorners(item.body), R.staticClearanceMetres))) return true;
      // Keep people spread out, while a genuine adjacent worker/service lane
      // is judged by physical hulls instead of an arbitrary universal 10 m gap.
      return isPerson(kind) && isPerson(item.kind) && distance(item.position, point)
        < (socialGroupId !== undefined && item.socialGroupId === socialGroupId
          ? R.socialSpacingMetres - R.epsilon : R.actorSpacingMetres);
    })) return false;
    const moving = kind !== 'social' && kind !== 'parkedVehicle';
    const speed = kind === 'walker' || kind === 'worker' ? R.walkSpeedMetresPerSecond
      : kind === 'jogger' ? R.jogSpeedMetresPerSecond : kind === 'fictionalEuc' ? R.eucSpeedMetresPerSecond
        : kind === 'serviceVehicle' ? R.serviceSpeedMetresPerSecond : kind === 'trafficVehicle' ? R.trafficSpeedMetresPerSecond : 0;
    const id = `${path.id}/${kind}/${Math.round(along * 1000)}`;
    actors.push({ id, kind, pathId: path.id, ...(anchor ? { anchorId: anchor.id } : {}),
      ...(socialGroupId ? { socialGroupId } : {}),
      ...(activityWalkId ? { activityWalkId } : {}),
      initialDistanceMetres: along, direction: anchor?.activitySiteId || path.role === 'traffic' || path.role === 'service' ? 1
        : populationChoice(worldId, 'direction', id) < 0.5 ? 1 : -1,
      movement: moving ? path.closed ? 'loop' : 'shuttle' : 'stationary', speedMetresPerSecond: speed,
      idleSeconds: R.idleSeconds, appearanceIndex: Math.floor(populationChoice(worldId, 'appearance', id) * 8), hull });
    positions.push({ position: { x: point.x, y: point.y, z: point.z }, kind, body,
      ...(socialGroupId ? { socialGroupId } : {}) }); return true;
  };
  // Stationary vehicle reservation first. Never spawn a service shuttle through its own parked van.
  for (const anchor of anchors.filter(item => item.kind === 'parking').slice(0, R.maximumParkedVehicles)) {
    const path = paths.find(item => item.id === anchor.pathId)!;
    if (add('parkedVehicle', path, anchor.distanceMetres, anchor)) parkedReservations.push(anchor);
  }
  let people = 0, riders = 0, service = 0, traffic = 0;
  // Representative activity before bulk filling: ids cannot let a long list
  // of commercial sidewalks consume the entire shared people budget.
  const districts: readonly District[] = ['park', 'residential', 'industrial', 'commercial'];
  // Populate completed places before generic far-path filling, within the
  // existing people cap. Each pair is atomic and has its own actual facing.
  const activitySites = [...new Set(anchors.flatMap(anchor => anchor.activitySiteId ? [anchor.activitySiteId] : []))];
  for (const siteId of activitySites) {
    const pair = anchors.filter(anchor => anchor.activitySiteId === siteId);
    if (pair.length !== 2 || people + 2 > R.maximumPeople) continue;
    const before = actors.length;
    if (pair.every(anchor => {
      const path = paths.find(item => item.id === anchor.pathId);
      return !!path && add('social', path, anchor.distanceMetres, anchor, siteId);
    })) people += 2;
    else { actors.length = before; positions.length = before; }
  }
  const stationarySupports = new Set(anchors.filter(anchor => anchor.activitySiteId).map(anchor => anchor.pathId));
  // Spread existing capacity across finished districts before distant bulk
  // filling. Each admitted route receives one actor first; only long routes
  // receive a second at a distinct third. Existing actor appearance/direction
  // hashes retain the canonical pre-activity world id.
  const purposeful = activityWalks.flatMap(walk => {
    const path = paths.find(item => item.id === `${walk.pathId}/clear-0`);
    return path ? [{ walk, path }] : [];
  });
  for (const { walk, path } of purposeful) {
    const stations = path.lengthMetres >= R.actorSpacingMetres * 2
      ? [path.lengthMetres/3,path.lengthMetres*2/3] : [path.lengthMetres/2];
    for (const along of stations) if (people < R.maximumPeople
      && add(walk.kind,path,along,undefined,undefined,walk.id)) { people += 1; break; }
  }
  // Keep every already-admitted legacy primary station before trying any
  // fallback. Only the new hashed physical walk policy enables this pass;
  // prepared older worlds retain their actor/records policy unchanged.
  if (plan.districtActivity?.walkRevision === R.activityWalkPolicyRevision) {
    for (const { walk, path } of purposeful) {
      if (people >= R.maximumPeople) break;
      if (actors.some(actor => actor.activityWalkId === walk.id)) continue;
      const legacyStations = path.lengthMetres >= R.actorSpacingMetres * 2
        ? [path.lengthMetres / 3, path.lengthMetres * 2 / 3] : [path.lengthMetres / 2];
      // Coarse-to-fine dyadic stations give a finite deterministic search.
      // Each candidate still goes through the exact original add() prism,
      // static exclusions, person spacing and actor-cap admission above.
      let admitted = false;
      for (let divisions = 2; divisions <= R.activityFallbackStationDivisions && !admitted; divisions *= 2) {
        for (let index = 1; index < divisions; index += 2) {
          const along = path.lengthMetres * index / divisions;
          if (legacyStations.some(station => Math.abs(station - along) <= R.epsilon)) continue;
          if (add(walk.kind, path, along, undefined, undefined, walk.id)) {
            people += 1; admitted = true; break;
          }
        }
      }
      // Endpoints are also authored stations; neither invents a connector.
      if (!admitted) for (const along of [0, path.lengthMetres]) {
        if (add(walk.kind, path, along, undefined, undefined, walk.id)) { people += 1; break; }
      }
    }
  }
  for (const { walk, path } of purposeful) {
    if (path.lengthMetres < R.actorSpacingMetres * 3 || people >= R.maximumPeople) continue;
    const first = actors.find(actor => actor.activityWalkId === walk.id);
    if (!first) continue;
    const along = first.initialDistanceMetres < path.lengthMetres/2 ? path.lengthMetres*2/3 : path.lengthMetres/3;
    if (add(walk.kind,path,along,undefined,undefined,walk.id)) people += 1;
  }

  // One moving approach at each accepted place where the real base walk is
  // long enough. Short groups keep a stationary pair rather than fake motion.
  for (const siteId of activitySites) {
    const path = paths.find(item => item.id.startsWith(`${siteId}/facade-walk/clear-`));
    if (path && people < R.maximumPeople && add('walker', path, path.lengthMetres / 2, undefined, siteId)) people += 1;
  }

  for (const district of districts) {
    for (const kind of ['worker', 'social'] as const) {
      for (const anchor of anchors.filter(item => !item.activitySiteId && item.district === district && item.kind === kind)) {
        const path = paths.find(item => item.id === anchor.pathId)!;
        if (path.role !== 'pedestrian') continue;
        if (kind === 'worker') {
          if (people < R.maximumPeople && add('worker', path, anchor.distanceMetres, anchor)) { people += 1; break; }
        } else {
          const companion = anchor.distanceMetres + R.socialSpacingMetres;
          if (people + 2 > R.maximumPeople || companion >= path.lengthMetres - R.socialSpacingMetres) continue;
          const before = actors.length;
          if (add('social', path, anchor.distanceMetres, anchor, anchor.id)
            && add('social', path, companion, anchor, anchor.id)) { people += 2; break; }
          // A real social pair is atomic; do not leave a lone failed companion.
          actors.length = before; positions.length = before;
        }
      }
    }
  }

  const slots = (path: PopulationPath): readonly number[] => {
    if (path.lengthMetres <= R.actorSpacingMetres * 2) return [path.lengthMetres / 2];
    const result: number[] = [];
    for (let along = R.actorSpacingMetres; along < path.lengthMetres - R.actorSpacingMetres;
      along += R.actorSpacingMetres * 3) result.push(along);
    return result;
  };
  const queues = districts.map(district => paths.filter(path => path.role === 'pedestrian' && path.district === district && !stationarySupports.has(path.id))
    .flatMap(path => slots(path).map((along, index) => ({ path, along,
      kind: (district === 'park' && (index === 1 || (index > 1
        && populationChoice(worldId, 'roster', `${path.id}/${along}`) < 0.4)) ? 'jogger' : 'walker') as 'walker' | 'jogger' }))));
  // One walking presence per supported district, then the park's distinct jogger.
  for (const queue of queues) for (let index = 0; index < queue.length; index += 1) {
    const candidate = queue[index];
    if (candidate.kind !== 'walker' || people >= R.maximumPeople) continue;
    if (add(candidate.kind, candidate.path, candidate.along)) { people += 1; queue.splice(index, 1); break; }
  }
  for (let index = 0; index < queues[0].length && people < R.maximumPeople; index += 1) {
    const candidate = queues[0][index];
    if (candidate.kind === 'jogger' && add('jogger', candidate.path, candidate.along)) {
      people += 1; queues[0].splice(index, 1); break;
    }
  }

  for (const district of districts) for (const path of paths.filter(item => item.district === district)) {
    if (path.role === 'rider' && riders < R.maximumRiders) {
      if (add('fictionalEuc', path, path.lengthMetres * 0.35)) riders += 1;
    } else if (path.role === 'service' && (path.closed || path.serviceShuttle) && service < R.maximumServiceVehicles
      && !parkedReservations.some(reservation => reservation.pathId === path.id)) {
      const workplace = anchors.find(anchor => anchor.pathId === path.id && anchor.kind === 'worker');
      if (workplace && add('serviceVehicle', path, path.lengthMetres * 0.5, workplace)) service += 1;
    } else if (path.role === 'traffic' && path.closed && traffic < R.maximumTrafficVehicles) {
      if (add('trafficVehicle', path, path.lengthMetres * 0.3)) traffic += 1;
    }
  }
  while (people < R.maximumPeople && queues.some(queue => queue.length > 0)) {
    for (const queue of queues) {
      const candidate = queue.shift();
      if (candidate && people < R.maximumPeople && add(candidate.kind, candidate.path, candidate.along)) people += 1;
    }
  }
  return actors;
}

function acceptedGroundReport(plan: LevelPlan, paths: readonly PopulationPath[],
  actors: readonly ActorSpec[]): LivingWorldGroundReport | undefined {
  const report = plan.populationGroundReport;
  if (!report) return undefined;
  const traffic = paths.filter(path => path.role === 'traffic' && path.closed && path.id.startsWith('living-ground/'));
  const districts = (['commercial', 'residential'] as const)
    .filter(district => plan.segments.some(segment => segment.id === `city-${district}-cross`));
  const missing = districts.filter(district => !traffic.some(path => path.district === district));
  const bays = (plan.populationParkingBays ?? []).filter(bay => actors.some(actor => actor.kind === 'parkedVehicle'
    && actor.pathId === `${bay.id}/stationary-axis`)).map(bay => bay.id);
  const warehouse = (plan.props ?? []).some(prop => prop.kind === 'building' && prop.look === 'industrial');
  return { ...report, acceptedTrafficLoops: traffic.map(path => path.id), missingTrafficDistricts: missing,
    acceptedParkingBays: bays, gaps: [
      ...report.gaps.filter(gap => !gap.startsWith('No feasible complete vehicle loop')
        && !gap.startsWith('No safe standalone warehouse parking')),
      ...(missing.length ? ['No feasible complete vehicle loop in the listed districts; this remains unfinished.'] : []),
      ...(warehouse && !bays.length ? ['No safe standalone warehouse parking bay and radius driveway accepted.'] : []),
    ] };
}

/**
 * Pure authoring: original arrays are read only, no terrain/collider writes,
 * retries, stream draws, timers, meshes, audio, DOM or persistence. A caller
 * supplying a sampler must supply its finished-plan sampler, never a renderer.
 */
export function buildPopulationPlan(
  plan: LevelPlan, authoredPaths: readonly AuthoredPopulationPath[] | undefined,
  sampler: TerrainSampler = new PlanTerrainSampler(plan),
  context: PopulationValidationContext = createPopulationValidationContext(plan),
): PopulationPlan {
  return withPopulationAuthoringMemo(() => buildPopulationPlanIn(plan, authoredPaths, sampler, context));
}
function buildPopulationPlanIn(
  plan: LevelPlan, authoredPaths: readonly AuthoredPopulationPath[] | undefined,
  sampler: TerrainSampler, context: PopulationValidationContext,
): PopulationPlan {
  contextFor(plan, context);
  const rejected: { pathId: string; reason: RejectionReason }[] = [];
  const activityWalks = (plan.populationActivityWalks ?? []).filter(walk => {
    const reason = districtActivityWalkReason(plan,walk,sampler,context);
    if (reason) { rejected.push({ pathId: walk.id, reason }); return false; }
    return true;
  });
  const unique = new Set<string>();
  const movingPaths = connectedPaths((authoredPaths ?? []).flatMap(source => {
    if (source.id.startsWith('district-activity/walk/') && !activityWalks.some(walk => walk.pathId === source.id)) {
      rejected.push({ pathId: source.id, reason: 'invalid-source' }); return [];
    }
    if (unique.has(source.id)) { rejected.push({ pathId: source.id, reason: 'invalid-source' }); return []; }
    unique.add(source.id); return pathsFromSource(plan, source, sampler, rejected, context);
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const parking = parkingSupport(plan, sampler, rejected, context);
  const social = districtSocialSupport(plan, sampler, rejected, context);
  const paths = [...movingPaths, ...parking.paths, ...social.paths];
  const ownedActivityWalks = new Set((plan.populationActivitySites ?? []).map(site => `${site.id}/facade-walk`));
  const ordinaryAnchorPaths = movingPaths.filter(path => ![...ownedActivityWalks].some(id => path.id.startsWith(`${id}/clear-`)));
  const anchors = [...anchorsFromPaths(plan, ordinaryAnchorPaths), ...parking.anchors, ...social.anchors];
  const admittedWalks = activityWalks.filter(walk => paths.some(path =>
    path.id === `${walk.pathId}/clear-0` && path.lengthMetres >= R.minimumWalkMetres));
  const actors = actorsFromPaths(plan, paths, anchors, sampler, context, admittedWalks);
  const inactiveActivityWalks = plan.districtActivity?.walkRevision === R.activityWalkPolicyRevision
    ? admittedWalks.filter(walk => !actors.some(actor => actor.activityWalkId === walk.id)).map(walk => ({
      walkId: walk.id, pathId: walk.pathId, reason: 'no-initial-actor-admitted' as const })) : [];
  const groundSupplement = acceptedGroundReport(plan, paths, actors);
  const availableKinds = ALL_KINDS.filter(kind => actors.some(actor => actor.kind === kind));
  const acceptedIds = (ids: readonly string[], vehicle: boolean): string[] => paths.filter(path =>
    (vehicle ? path.role === 'traffic' || path.role === 'service' : path.role === 'pedestrian')
    && ids.some(id => path.id === id || path.id.startsWith(`${id}/clear-`))).map(path => path.id);
  const crossings = (plan.populationCrossings ?? []).flatMap(crossing => {
    const source = plan.populationGroundSources?.find(item => item.id === crossing.sourceId);
    if (!source || source.purpose !== 'driveway' || !validGroundSource(plan, source)
      || crossing.priority !== 'pedestrian' || crossing.corners.length < 3
      || crossing.corners.some(point => !(Number.isFinite(point.x) && Number.isFinite(point.z)))) return [];
    const vehiclePathIds = acceptedIds(crossing.vehiclePathIds, true);
    return vehiclePathIds.length ? [{ ...crossing, vehiclePathIds,
      pedestrianPathIds: acceptedIds(crossing.pedestrianPathIds, false) }] : [];
  });
  const contentDigest = hash128(JSON.stringify({ revision: R.revision, paths, anchors, actors, crossings }));
  const deduped = [...new Map(rejected.map(item => [`${item.pathId}/${item.reason}`, item])).values()];
  return { schema: 1, rulesRevision: R.revision, sourceWorldId: plan.id,
    installedWorldId: populationWorldId(plan.id, actors.length > 0), contentDigest, paths, anchors, actors,
    ...(crossings.length ? { crossings } : {}),
    report: { ...(inactiveActivityWalks.length ? { inactiveActivityWalks } : {}),
      missingAuthoredPaths: authoredPaths === undefined && !plan.populationParkingBays?.length, rejected: deduped,
      availableKinds, missingKinds: ALL_KINDS.filter(kind => !availableKinds.includes(kind)),
      ...(groundSupplement ? { groundSupplement } : {}) } };
}
