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
const segmentEntry = (x: number, z: number, dx: number, dz: number,
  box: { minX: number; maxX: number; minZ: number; maxZ: number }): number | null => {
  let low = 0, high = 1;
  for (const [start, delta, minimum, maximum] of [[x, dx, box.minX, box.maxX], [z, dz, box.minZ, box.maxZ]]) {
    if (delta === 0) { if (start < minimum || start > maximum) return null; continue; }
    const a = (minimum - start) / delta, b = (maximum - start) / delta;
    low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b)); if (low > high) return null;
  }
  return low;
};

/** Necessary projection intervals over the ENTIRE linear centre/yaw span.
 * Intersection of these supersets can conservatively block, but never proves
 * a collision clear by testing endpoint boxes or the final centre chord alone.
 * Keeping the road's lateral axis avoids world-AABB inflation beside sidewalks. */
function flatEntry(from: { x: number; z: number }, to: { x: number; z: number },
  yawLow: number, yawHigh: number, referenceYaw: number, hull: PopulationLocalHull,
  blocker: RouteAnticipationBlocker, padding: number, nativeGap: number): number | null {
  let low = 0, high = 1;
  const axes = [[1, 0], [0, 1], [Math.cos(referenceYaw), -Math.sin(referenceYaw)],
    [Math.sin(referenceYaw), Math.cos(referenceYaw)]] as const;
  for (const [ux, uz] of axes) {
    const phase = Math.atan2(uz, ux);
    // Native grow() increases BOTH local dimensions. Scalar world-axis gap
    // padding alone misses interior turning support by gap*(sqrt(2)-1).
    const car = sourceYawSupport(hull.halfWidthMetres + nativeGap + R.epsilon, hull.halfLengthMetres + nativeGap + R.epsilon,
      yawLow + phase, yawHigh + phase);
    const a = blocker.from, b = blocker.to;
    const turn = Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY));
    const first = a.headingY + phase, last = first + turn;
    const extent = sourceYawSupport(Math.max(a.halfWidthMetres, b.halfWidthMetres),
      Math.max(a.halfLengthMetres, b.halfLengthMetres), Math.min(first, last), Math.max(first, last));
    const firstCentre = a.x * ux + a.z * uz, lastCentre = b.x * ux + b.z * uz;
    const minimum = Math.min(firstCentre, lastCentre) - extent - padding - car;
    const maximum = Math.max(firstCentre, lastCentre) + extent + padding + car;
    const start = from.x * ux + from.z * uz, delta = (to.x - from.x) * ux + (to.z - from.z) * uz;
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
  if (![input.distanceMetres, travelMetres, input.fullHullAxisBoundMetres, input.gapMetres].every(Number.isFinite)
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
  if (input.flatSupport && ![input.flatSupport.currentHeadingY, input.flatSupport.hull.halfWidthMetres,
    input.flatSupport.hull.halfLengthMetres, input.flatSupport.hull.heightMetres].every(Number.isFinite))
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
    if (!Number.isFinite(pad) || pad < 0 || ![a.minX, a.maxX, a.minZ, a.maxZ, b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite))
      throw new RangeError('Invalid route anticipation blocker');
    const radius = (input.flatSupport ? 0 : input.gapMetres) + pad + (path.closed ? R.closedPositionToleranceMetres : 0);
    return { id: blocker.id, blocker, radius, minX: Math.min(a.minX, b.minX) - radius, maxX: Math.max(a.maxX, b.maxX) + radius,
      minZ: Math.min(a.minZ, b.minZ) - radius, maxZ: Math.max(a.maxZ, b.maxZ) + radius };
  });
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
    const at = (station: number) => { const t = (station - a.distanceMetres) / length;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; };
    const from = at(distance), to = at(distance + direction * travel);
    const deltaYaw = Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY));
    const firstYaw = a.headingY + deltaYaw * (distance - a.distanceMetres) / length;
    const lastYaw = a.headingY + deltaYaw * (distance + direction * travel - a.distanceMetres) / length;
    const loYaw = Math.min(firstYaw, lastYaw), hiYaw = Math.max(firstYaw, lastYaw);
    const peak = Math.PI / 4 + Math.ceil((loYaw - Math.PI / 4) / (Math.PI / 2)) * (Math.PI / 2);
    const yawScale = peak <= hiYaw ? Math.SQRT2 : Math.max(Math.abs(Math.cos(firstYaw)) + Math.abs(Math.sin(firstYaw)),
      Math.abs(Math.cos(lastYaw)) + Math.abs(Math.sin(lastYaw)));
    const seamTurn = path.closed ? Math.abs(Math.atan2(Math.sin(path.points[0].headingY - path.points[path.points.length - 1].headingY),
      Math.cos(path.points[0].headingY - path.points[path.points.length - 1].headingY))) : 0;
    // Native moving cars set heading to the exact source yaw. Include the real
    // current heading bridge too, plus closed-source seam yaw/position, instead
    // of assuming that an observer's start is always aligned to the source.
    const startYaw = visits === 1 && input.flatSupport ? firstYaw + Math.atan2(
      Math.sin(input.flatSupport.currentHeadingY - firstYaw), Math.cos(input.flatSupport.currentHeadingY - firstYaw)) : firstYaw;
    const flatLow = Math.min(loYaw, startYaw) - seamTurn, flatHigh = Math.max(hiYaw, startYaw) + seamTurn;
    if (visits === 1 && input.flatSupport) {
      const current = input.flatSupport.currentFootprint;
      if (![current.x, current.z, current.headingY, current.halfWidthMetres, current.halfLengthMetres,
        current.minY, current.maxY].every(Number.isFinite) || current.halfWidthMetres <= 0
        || current.halfLengthMetres <= 0 || current.maxY <= current.minY)
        throw new RangeError('Invalid actual native current footprint');
      currentBridgeRadius = Math.hypot(current.halfWidthMetres, current.halfLengthMetres)
        + Math.hypot(current.x - from.x, current.z - from.z);
    }
    // When native contact held an endpoint-linear off-route/tilted pose, include
    // its ACTUAL current prism and source-to-current bridge in unknown support.
    // Never silently replace it by a nominal source-distance pose.
    const carBound = Math.max(input.fullHullAxisBoundMetres * (input.flatSupport
      ? sourceYawSupport(1, 1, flatLow, flatHigh) : yawScale) + input.fullHullAxisBoundMetres * Math.SQRT2 * seamTurn,
      currentBridgeRadius) + (input.flatSupport ? Math.SQRT2 * input.gapMetres : 0);
    const certifiedSpan = flatRoute?.status === 'complete' ? flatRoute.spans[visits - 1] : undefined;
    const certified = certifiedSpan !== undefined;
    if (certified) flatSpans++; else unknownSpans++;
    let entry = Infinity, blockedBy: string | null = null;
    for (const box of boxes) {
      if (tests >= R.compactAnticipationMaximumBlockerTests) return result(0, 'work-cap', true);
      tests++;
      const hit = certified && input.flatSupport
        ? flatEntry(from, to, certifiedSpan!.nativeYawLow, certifiedSpan!.nativeYawHigh, certifiedSpan!.referenceYaw,
          input.flatSupport.hull, box.blocker, box.radius + R.epsilon + flatRoute!.nativeChordReserveMetres, input.gapMetres)
        : segmentEntry(from.x, from.z, to.x - from.x, to.z - from.z, {
        minX: box.minX - carBound, maxX: box.maxX + carBound, minZ: box.minZ - carBound, maxZ: box.maxZ + carBound });
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
