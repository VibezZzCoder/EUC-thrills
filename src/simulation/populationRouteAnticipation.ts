/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Bounded behavior scan of original source spans. No endpoint chord shortcut. */
import type { PopulationPath } from '../level/populationPlan.ts';
import type { PopulationFootprint } from './population.ts';
import { POPULATION as R } from '../data/tuning.ts';
import type { TerrainSampler } from './world.ts';
import { prepareFlatRouteCertificate } from './populationFlatRouteCertificate.ts';
import type { PopulationLocalHull } from '../shared/populationHull.ts';
import { rectangularYawSupport as sourceYawSupport } from '../shared/rectangularYawSupport.ts';
export { rectangularYawSupport as sourceYawSupport } from '../shared/rectangularYawSupport.ts';

export interface RouteAnticipationBlocker {
  readonly id: string;
  readonly from: PopulationFootprint;
  readonly to: PopulationFootprint;
  readonly pad?: number;
}
export interface RouteAnticipationResult {
  readonly availableTravelMetres: number;
  readonly blockedBy: string | null;
  readonly overflow: boolean;
  readonly spanVisits: number;
  readonly blockerTests: number;
  readonly flatSpans?: number;
  readonly unknownSpans?: number;
  readonly certificateFieldCells?: number;
  readonly certificateGridCells?: number;
  readonly certificateColliderReferences?: number;
  readonly certificateHazardReferences?: number;
  readonly certificateOverflows?: number;
  readonly certificateSourceSpans?: number;
  readonly certificateNeighbourVisits?: number;
  readonly nativeChordReserveMetres?: number;
  readonly flatCertificateReason?: string;
}
const worldBounds = (p: PopulationFootprint) => {
  const c = Math.abs(Math.cos(p.headingY)), s = Math.abs(Math.sin(p.headingY));
  const x = c * p.halfWidthMetres + s * p.halfLengthMetres, z = s * p.halfWidthMetres + c * p.halfLengthMetres;
  return { minX: p.x - x, maxX: p.x + x, minZ: p.z - z, maxZ: p.z + z };
};
/** The X slab, then the Z slab, as scalars: no per-test arrays (PERF-R2-2). */
const segmentEntry = (x: number, z: number, dx: number, dz: number,
  minX: number, maxX: number, minZ: number, maxZ: number): number | null => {
  let low = 0, high = 1;
  if (dx === 0) { if (x < minX || x > maxX) return null; } else {
    const a = (minX - x) / dx, b = (maxX - x) / dx;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b)); if (low > high) return null;
  }
  if (dz === 0) { if (z < minZ || z > maxZ) return null; } else {
    const a = (minZ - z) / dz, b = (maxZ - z) / dz;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b)); if (low > high) return null;
  }
  return low;
};

/** atan2 of the fixed world axes (1, 0) and (0, 1), formed once. */
const WORLD_X_PHASE = Math.atan2(0, 1), WORLD_Z_PHASE = Math.atan2(1, 0);
/** Necessary projection intervals over the ENTIRE linear centre/yaw span.
 * Intersection of these supersets can conservatively block, but never proves
 * a collision clear by testing endpoint boxes or the final centre chord alone.
 * Keeping the road's lateral axis avoids world-AABB inflation beside sidewalks. */
interface FlatProjection {
  ux: number; uz: number; phase: number;
  car: number; start: number; delta: number;
}
/** Per-certified-span values only. Four car supports and centre projections
 * serve every blocker in the original axis order, written into the call's own
 * four scratch records; no global/cache ownership. `halfWidth`/`halfLength`
 * are the hull's dimensions plus the native gap and epsilon, summed once. */
function flatProjections(fromX: number, fromZ: number, toX: number, toZ: number,
  yawLow: number, yawHigh: number, referenceYaw: number, halfWidth: number, halfLength: number,
  out: readonly FlatProjection[]): void {
  const c = Math.cos(referenceYaw), s = Math.sin(referenceYaw);
  for (let axis = 0; axis < 4; axis++) {
    const ux = axis === 0 ? 1 : axis === 1 ? 0 : axis === 2 ? c : s;
    const uz = axis === 0 ? 0 : axis === 1 ? 1 : axis === 2 ? -s : c;
    const phase = axis === 0 ? WORLD_X_PHASE : axis === 1 ? WORLD_Z_PHASE : Math.atan2(uz, ux), projection = out[axis];
    // Native grow() increases BOTH local dimensions. Scalar world-axis gap
    // padding alone misses interior turning support by gap*(sqrt(2)-1).
    projection.car = sourceYawSupport(halfWidth, halfLength, yawLow + phase, yawHigh + phase);
    projection.ux = ux; projection.uz = uz; projection.phase = phase;
    projection.start = fromX * ux + fromZ * uz; projection.delta = (toX - fromX) * ux + (toZ - fromZ) * uz;
  }
}

/**
 * One blocker's span-independent flat terms within one call (PERF-R2-2,
 * 2026-10-04): its turn, its padding and, per axis, the centre interval
 * already widened by its yaw extent and padding, keyed by that axis's exact
 * (ux, uz). Axes 0 and 1 never change; axes 2 and 3 change only with the
 * span's reference yaw. Every value is the same expression on the same
 * inputs the per-span evaluation used, so a hit returns its exact bits.
 */
interface FlatBlockerTerms { readonly turn: number; readonly padding: number; known: number; readonly axes: Float64Array }

function flatEntry(projections: readonly FlatProjection[], blocker: RouteAnticipationBlocker,
  terms: FlatBlockerTerms): number | null {
  let low = 0, high = 1;
  const a = blocker.from, b = blocker.to, axes = terms.axes;
  for (let axis = 0; axis < 4; axis++) {
    const { ux, uz, phase, car, start, delta } = projections[axis], slot = axis * 4;
    if ((terms.known & (1 << axis)) === 0 || !Object.is(axes[slot], ux) || !Object.is(axes[slot + 1], uz)) {
      const first = a.headingY + phase, last = first + terms.turn;
      const extent = sourceYawSupport(Math.max(a.halfWidthMetres, b.halfWidthMetres),
        Math.max(a.halfLengthMetres, b.halfLengthMetres), Math.min(first, last), Math.max(first, last));
      const firstCentre = a.x * ux + a.z * uz, lastCentre = b.x * ux + b.z * uz;
      axes[slot] = ux; axes[slot + 1] = uz;
      axes[slot + 2] = Math.min(firstCentre, lastCentre) - extent - terms.padding;
      axes[slot + 3] = Math.max(firstCentre, lastCentre) + extent + terms.padding;
      terms.known |= 1 << axis;
    }
    // (centre - extent - padding) - car, left to right as before.
    const minimum = axes[slot + 2] - car;
    const maximum = axes[slot + 3] + car;
    if (delta === 0) { if (start < minimum || start > maximum) return null; continue; }
    const t0 = (minimum - start) / delta, t1 = (maximum - start) / delta;
    low = Math.max(low, Math.min(t0, t1)); high = Math.min(high, Math.max(t0, t1));
    if (low > high) return null;
  }
  return low;
}

/** Each native heading-frame axis is bounded by the local 3-D corner radius.
 * Retain these two bounds separately, then bound |cos h|+|sin h| over the exact
 * source yaw interval. A straight axis-aligned source span needs no sqrt(2)
 * factor; a diagonal/turn interval includes it only where its yaw reaches the
 * maximum. Future source span heights have no interval API: ignore future Y
 * rather than guessing clear from endpoint ground samples.
 * This can conservatively stop for an adjacent/elevated body. Actual native
 * contact, current footprint heights and path/ground support remain unchanged. */
export function routeAnticipation(input: {
  readonly path: PopulationPath; readonly distanceMetres: number; readonly direction: 1 | -1;
  readonly travelMetres: number; readonly fullHullAxisBoundMetres: number; readonly gapMetres: number;
  readonly blockers: readonly RouteAnticipationBlocker[];
  /** Exact native dimensions/current heading. This optional capability never
   * substitutes a ground sample or narrows the unknown-grade fallback. */
  readonly flatSupport?: Readonly<{ sampler: TerrainSampler; hull: PopulationLocalHull;
    currentHeadingY: number; currentFootprint: PopulationFootprint; maximumNativeStepTravelMetres: number }>;
}): RouteAnticipationResult {
  const { path, direction, travelMetres, blockers } = input;
  if (!(Number.isFinite(input.distanceMetres) && Number.isFinite(travelMetres)
    && Number.isFinite(input.fullHullAxisBoundMetres) && Number.isFinite(input.gapMetres))
    || travelMetres < 0 || input.fullHullAxisBoundMetres <= 0 || input.gapMetres < 0
    || (direction !== 1 && direction !== -1) || input.distanceMetres < 0 || input.distanceMetres > path.lengthMetres)
    throw new RangeError('Route anticipation requires a finite original source interval');
  const result = (available: number, blockedBy: string | null, overflow = false): RouteAnticipationResult =>
    ({ availableTravelMetres: available, blockedBy, overflow, spanVisits: visits, blockerTests: tests,
      flatSpans, unknownSpans, certificateFieldCells, certificateGridCells, certificateColliderReferences,
      certificateHazardReferences, certificateOverflows, certificateSourceSpans, certificateNeighbourVisits,
      nativeChordReserveMetres, flatCertificateReason });
  let visits = 0, tests = 0;
  let flatSpans = 0, unknownSpans = 0, certificateFieldCells = 0, certificateGridCells = 0,
    certificateColliderReferences = 0, certificateHazardReferences = 0, certificateOverflows = 0;
  let currentBridgeRadius = 0;
  let certificateSourceSpans = 0, certificateNeighbourVisits = 0, nativeChordReserveMetres = 0,
    flatCertificateReason = 'not-requested';
  if (input.flatSupport && !(Number.isFinite(input.flatSupport.currentHeadingY)
    && Number.isFinite(input.flatSupport.hull.halfWidthMetres) && Number.isFinite(input.flatSupport.hull.halfLengthMetres)
    && Number.isFinite(input.flatSupport.hull.heightMetres)))
    throw new RangeError('Invalid native flat-support observer');
  if (blockers.length === 0 || travelMetres === 0) return result(travelMetres, null);
  if (blockers.length > R.compactAnticipationMaximumBlockerTests) return result(0, 'work-cap', true);
  const flatRoute = input.flatSupport ? prepareFlatRouteCertificate({ path, distanceMetres: input.distanceMetres, direction,
    travelMetres, ...input.flatSupport }) : undefined;
  if (flatRoute) {
    certificateFieldCells = flatRoute.fieldCells; certificateGridCells = flatRoute.gridCells;
    certificateColliderReferences = flatRoute.colliderReferences; certificateHazardReferences = flatRoute.hazardReferences;
    certificateOverflows = flatRoute.certificateOverflows;
    certificateSourceSpans = flatRoute.sourceSpanVisits; certificateNeighbourVisits = flatRoute.neighbourVisits;
    nativeChordReserveMetres = flatRoute.nativeChordReserveMetres; flatCertificateReason = flatRoute.reason;
    if (flatRoute.status === 'work-cap') return result(0, flatRoute.reason, true);
  }
  const boxes = [...blockers].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(blocker => {
    const a = worldBounds(blocker.from), b = worldBounds(blocker.to);
    const pad = blocker.pad ?? 0;
    if (!Number.isFinite(pad) || pad < 0 || !(Number.isFinite(a.minX) && Number.isFinite(a.maxX) && Number.isFinite(a.minZ)
      && Number.isFinite(a.maxZ) && Number.isFinite(b.minX) && Number.isFinite(b.maxX) && Number.isFinite(b.minZ) && Number.isFinite(b.maxZ)))
      throw new RangeError('Invalid route anticipation blocker');
    const radius = (input.flatSupport ? 0 : input.gapMetres) + pad + (path.closed ? R.closedPositionToleranceMetres : 0);
    return { id: blocker.id, blocker, radius, minX: Math.min(a.minX, b.minX) - radius, maxX: Math.max(a.maxX, b.maxX) + radius,
      minZ: Math.min(a.minZ, b.minZ) - radius, maxZ: Math.max(a.maxZ, b.maxZ) + radius, flat: null as FlatBlockerTerms | null };
  });
  // The call's four flat projection records, and the hull's padded dimensions
  // as flatProjections summed them for every span.
  let projectionScratch: FlatProjection[] | null = null, flatHalfWidth = 0, flatHalfLength = 0, seamTurn = 0;
  let distance = input.distanceMetres, travelled = 0;
  let low = 0, high = path.points.length - 1;
  while (high - low > 1) { const middle = (low + high) >>> 1;
    if (path.points[middle].distanceMetres <= distance) low = middle; else high = middle; }
  let span = low;
  if (direction === -1 && distance === path.points[span].distanceMetres && span > 0) span--;
  while (travelled < travelMetres) {
    if (visits >= R.compactAnticipationMaximumSpans) return result(0, 'work-cap', true);
    visits++;
    const a = path.points[span], b = path.points[span + 1], length = b.distanceMetres - a.distanceMetres;
    if (!(length > 0)) return result(0, 'source-span', true);
    const remaining = direction === 1 ? b.distanceMetres - distance : distance - a.distanceMetres;
    const travel = Math.min(travelMetres - travelled, Math.max(0, remaining));
    const fromT = (distance - a.distanceMetres) / length, toT = (distance + direction * travel - a.distanceMetres) / length;
    const fromX = a.x + (b.x - a.x) * fromT, fromZ = a.z + (b.z - a.z) * fromT;
    const toX = a.x + (b.x - a.x) * toT, toZ = a.z + (b.z - a.z) * toT;
    const deltaYaw = Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY));
    const firstYaw = a.headingY + deltaYaw * (distance - a.distanceMetres) / length;
    const lastYaw = a.headingY + deltaYaw * (distance + direction * travel - a.distanceMetres) / length;
    const loYaw = Math.min(firstYaw, lastYaw), hiYaw = Math.max(firstYaw, lastYaw);
    // Read only without flat support, so only formed then.
    let yawScale = 0;
    if (!input.flatSupport) {
      const peak = Math.PI / 4 + Math.ceil((loYaw - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2);
      yawScale = peak <= hiYaw ? Math.SQRT2 : Math.max(Math.abs(Math.cos(firstYaw)) + Math.abs(Math.sin(firstYaw)),
        Math.abs(Math.cos(lastYaw)) + Math.abs(Math.sin(lastYaw)));
    }
    // The seam turn reads the path alone: formed on the first visit, kept.
    if (visits === 1) seamTurn = path.closed ? Math.abs(Math.atan2(Math.sin(path.points[0].headingY - path.points[path.points.length - 1].headingY),
      Math.cos(path.points[0].headingY - path.points[path.points.length - 1].headingY))) : 0;
    // Native moving cars set heading to the exact source yaw. Include the real
    // current heading bridge too, plus closed-source seam yaw/position, instead
    // of assuming that an observer's start is always aligned to the source.
    const startYaw = visits === 1 && input.flatSupport ? firstYaw + Math.atan2(
      Math.sin(input.flatSupport.currentHeadingY - firstYaw), Math.cos(input.flatSupport.currentHeadingY - firstYaw)) : firstYaw;
    const flatLow = Math.min(loYaw, startYaw) - seamTurn, flatHigh = Math.max(hiYaw, startYaw) + seamTurn;
    if (visits === 1 && input.flatSupport) {
      const current = input.flatSupport.currentFootprint;
      if (!(Number.isFinite(current.x) && Number.isFinite(current.z) && Number.isFinite(current.headingY)
        && Number.isFinite(current.halfWidthMetres) && Number.isFinite(current.halfLengthMetres)
        && Number.isFinite(current.minY) && Number.isFinite(current.maxY)) || current.halfWidthMetres <= 0
        || current.halfLengthMetres <= 0 || current.maxY <= current.minY)
        throw new RangeError('Invalid actual native current footprint');
      currentBridgeRadius = Math.hypot(current.halfWidthMetres, current.halfLengthMetres)
        + Math.hypot(current.x - fromX, current.z - fromZ);
    }
    // When native contact held an endpoint-linear off-route/tilted pose, include
    // its ACTUAL current prism and source-to-current bridge in unknown support.
    // Never silently replace it by a nominal source-distance pose.
    const carBound = Math.max(input.fullHullAxisBoundMetres * (input.flatSupport
      ? sourceYawSupport(1, 1, flatLow, flatHigh) : yawScale) + input.fullHullAxisBoundMetres * Math.SQRT2 * seamTurn,
      currentBridgeRadius) + (input.flatSupport ? Math.SQRT2 * input.gapMetres : 0);
    const certifiedSpan = flatRoute?.status === 'complete' ? flatRoute.spans[visits - 1] : undefined;
    const certified = certifiedSpan !== undefined;
    let projections: FlatProjection[] | null = null;
    if (certified && input.flatSupport) {
      if (projectionScratch === null) {
        projectionScratch = [0, 1, 2, 3].map(() => ({ ux: 0, uz: 0, phase: 0, car: 0, start: 0, delta: 0 }));
        flatHalfWidth = input.flatSupport.hull.halfWidthMetres + input.gapMetres + R.epsilon;
        flatHalfLength = input.flatSupport.hull.halfLengthMetres + input.gapMetres + R.epsilon;
      }
      flatProjections(fromX, fromZ, toX, toZ, certifiedSpan!.nativeYawLow, certifiedSpan!.nativeYawHigh,
        certifiedSpan!.referenceYaw, flatHalfWidth, flatHalfLength, projectionScratch);
      projections = projectionScratch;
    }
    if (certified) flatSpans++; else unknownSpans++;
    let entry = Infinity, blockedBy: string | null = null;
    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index];
      if (tests >= R.compactAnticipationMaximumBlockerTests) return result(0, 'work-cap', true);
      tests++;
      let hit: number | null;
      if (projections) {
        if (box.flat === null) {
          const a = box.blocker.from, b = box.blocker.to;
          box.flat = { turn: Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY)),
            padding: box.radius + R.epsilon + flatRoute!.nativeChordReserveMetres, known: 0, axes: new Float64Array(16) };
        }
        hit = flatEntry(projections, box.blocker, box.flat);
      } else hit = segmentEntry(fromX, fromZ, toX - fromX, toZ - fromZ,
        box.minX - carBound, box.maxX + carBound, box.minZ - carBound, box.maxZ + carBound);
      if (hit !== null && hit < entry) { entry = hit; blockedBy = box.id; }
    }
    if (blockedBy !== null) return result(travelled + travel * entry, blockedBy);
    travelled += travel; distance += direction * travel;
    if (travelled >= travelMetres) break;
    if (direction === 1) {
      if (span + 1 < path.points.length - 1) span++;
      else if (path.closed) { span = 0; distance = 0; }
      else break;
    } else {
      if (span > 0) span--;
      else if (path.closed) { span = path.points.length - 2; distance = path.lengthMetres; }
      else break;
    }
  }
  // A shuttle's endpoint is owned by its existing reversal/idle code. The
  // scan grants no new movement past it or onto another path.
  return result(travelMetres, null);
}

/** v²/(2b) + v*originalDt <= available route travel. Full hull/gap are already
 * included in the route scan. This asks for braking; it never snaps velocity. */
export function routeBrakingSpeedCap(availableTravelMetres: number, dt: number): number {
  if (!Number.isFinite(availableTravelMetres) || availableTravelMetres < 0 || !Number.isFinite(dt) || dt <= 0)
    throw new RangeError('Invalid route braking distance');
  const b = R.vehicleBrakingMetresPerSecondSquared;
  return Math.max(0, Math.sqrt((b * dt) ** 2 + 2 * b * availableTravelMetres) - b * dt);
}
