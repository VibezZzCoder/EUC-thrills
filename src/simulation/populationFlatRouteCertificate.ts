/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Bounded observer proof for native flat source frames and fixed-dt mixers.
 * No clock writes, native pose substitution, world mutation or result cache. */
import type { PopulationPath } from '../level/populationPlan.ts';
import type { PopulationLocalHull } from '../shared/populationHull.ts';
import type { PopulationFootprint } from './population.ts';
import type { TerrainSampler, GroundSupportWindowResult } from './world.ts';
import { POPULATION as R } from '../data/tuning.ts';
import { rectangularYawSupport as extent } from '../shared/rectangularYawSupport.ts';

export interface FlatSourceSpan {
  readonly from: Readonly<{ x: number; z: number }>;
  readonly to: Readonly<{ x: number; z: number }>;
  readonly referenceYaw: number;
  readonly nativeYawLow: number;
  readonly nativeYawHigh: number;
}
export interface FlatRouteCertificate {
  readonly status: 'complete' | 'unknown' | 'work-cap';
  readonly reason: string;
  readonly spans: readonly FlatSourceSpan[];
  readonly nativeChordReserveMetres: number;
  readonly fieldCells: number; readonly gridCells: number;
  readonly colliderReferences: number; readonly hazardReferences: number;
  readonly certificateOverflows: number;
  readonly neighbourVisits: number;
  readonly sourceSpanVisits: number;
}
interface RawSpan {
  readonly from: Readonly<{ x: number; z: number }>;
  readonly to: Readonly<{ x: number; z: number }>;
  readonly begin: number; readonly end: number;
  readonly lowYaw: number; readonly highYaw: number; readonly referenceYaw: number;
  readonly metricScale: number;
}
const wrap = (h: number) => Math.atan2(Math.sin(h), Math.cos(h));
export function prepareFlatRouteCertificate(input: {
  readonly path: PopulationPath; readonly distanceMetres: number; readonly direction: 1 | -1;
  readonly travelMetres: number; readonly maximumNativeStepTravelMetres: number;
  readonly sampler: TerrainSampler; readonly hull: PopulationLocalHull;
  readonly currentFootprint: PopulationFootprint; readonly currentHeadingY: number;
}): FlatRouteCertificate {
  let fieldCells = 0, gridCells = 0, colliderReferences = 0, hazardReferences = 0,
    certificateOverflows = 0, neighbourVisits = 0, sourceSpanVisits = 0;
  const finish = (status: FlatRouteCertificate['status'], reason: string, spans: readonly FlatSourceSpan[] = [],
    nativeChordReserveMetres = 0): FlatRouteCertificate => Object.freeze({ status, reason,
      spans: Object.freeze([...spans]), nativeChordReserveMetres, fieldCells, gridCells,
      colliderReferences, hazardReferences, certificateOverflows, neighbourVisits, sourceSpanVisits });
  const certify = input.sampler.certifyFlatSupportWindow;
  if (!certify) return finish('unknown', 'missing-source-capability');
  const { path, direction, hull, maximumNativeStepTravelMetres: step } = input;
  // Native pathPoint clamps/modulos by lengthMetres, but legacy admission also
  // tolerates slightly nonexact first/last station values. This capability
  // cannot call an omitted extrapolated endpoint band flat. Preserve native
  // admission and report UNKNOWN instead of widening that source scope here.
  if (path.points[0]?.distanceMetres !== 0 || path.points[path.points.length - 1]?.distanceMetres !== path.lengthMetres)
    return finish('unknown', 'nonexact-native-source-endpoints');
  if (!(Number.isFinite(input.distanceMetres) && Number.isFinite(input.travelMetres) && Number.isFinite(step)
    && Number.isFinite(input.currentHeadingY) && Number.isFinite(hull.halfWidthMetres)
    && Number.isFinite(hull.halfLengthMetres) && Number.isFinite(hull.heightMetres))
    || step <= 0 || input.travelMetres < step || (direction !== 1 && direction !== -1)
    || hull.halfWidthMetres <= 0 || hull.halfLengthMetres <= 0 || hull.heightMetres <= 0)
    return finish('unknown', 'invalid-native-observer');
  const raw: RawSpan[] = [];
  let distance = input.distanceMetres, travelled = 0, priorYaw = input.currentHeadingY;
  let low = 0, high = path.points.length - 1;
  while (high - low > 1) { const middle = (low + high) >>> 1;
    if (path.points[middle].distanceMetres <= distance) low = middle; else high = middle; }
  let span = low;
  if (direction === -1 && distance === path.points[span].distanceMetres && span > 0) span--;
  // One extra real-step interval supplies endpoint headings/planes when a
  // native epoch straddles the end of the logical lookahead. Never extrapolate.
  const contextTravel = input.travelMetres + step;
  while (travelled < contextTravel) {
    if (raw.length >= R.compactAnticipationMaximumSpans) return finish('work-cap', 'native-source-context-cap');
    const a = path.points[span], b = path.points[span + 1], length = b.distanceMetres - a.distanceMetres;
    if (!(length > 0)) return finish('unknown', 'invalid-source-span');
    const remaining = direction === 1 ? b.distanceMetres - distance : distance - a.distanceMetres;
    const travel = Math.min(contextTravel - travelled, Math.max(0, remaining));
    const at = (station: number) => { const t = (station - a.distanceMetres) / length;
      return Object.freeze({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); };
    const sourceYaw = wrap(b.headingY - a.headingY);
    const first = a.headingY + sourceYaw * (distance - a.distanceMetres) / length;
    const startYaw = priorYaw + wrap(first - priorYaw);
    const endYaw = startYaw + sourceYaw * direction * travel / length;
    const lowYaw = Math.min(startYaw, endYaw, raw.length === 0 ? input.currentHeadingY : priorYaw);
    const highYaw = Math.max(startYaw, endYaw, raw.length === 0 ? input.currentHeadingY : priorYaw);
    raw.push({ from: at(distance), to: at(distance + direction * travel), begin: travelled, end: travelled + travel,
      lowYaw, highYaw, referenceYaw: startYaw, metricScale: Math.hypot(b.x - a.x, b.z - a.z) / length });
    sourceSpanVisits++;
    priorYaw = endYaw; travelled += travel; distance += direction * travel;
    if (travelled >= contextTravel) break;
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
  if (!raw.length) return finish('unknown', 'empty-native-source-context');
  const source = input.currentFootprint.sourceHull, current = input.currentFootprint, origin = raw[0].from;
  if (!source || source.x !== origin.x || source.z !== origin.z || source.normalX !== 0
    || source.normalY !== 1 || source.normalZ !== 0 || source.headingY !== input.currentHeadingY
    || current.headingY !== source.headingY || source.hull.halfWidthMetres !== hull.halfWidthMetres
    || source.hull.halfLengthMetres !== hull.halfLengthMetres || source.hull.heightMetres !== hull.heightMetres
    || (source.marginMetres ?? 0) !== 0 || (source.verticalPaddingBelowMetres ?? 0) !== 0
    || (source.verticalPaddingAboveMetres ?? 0) !== 0)
    return finish('unknown', 'actual-native-origin-not-source-flat');
  const c = Math.cos(source.headingY), s = Math.sin(source.headingY);
  const cx = (current.x - source.x) * c - (current.z - source.z) * s;
  const cz = (current.x - source.x) * s + (current.z - source.z) * c;
  if (!Number.isFinite(source.y) || !(Number.isFinite(cx) && Number.isFinite(cz) && Number.isFinite(current.halfWidthMetres)
    && Number.isFinite(current.halfLengthMetres) && Number.isFinite(current.minY) && Number.isFinite(current.maxY))
    || current.halfWidthMetres <= 0 || current.halfLengthMetres <= 0 || current.maxY <= current.minY
    || Math.abs(cx) + current.halfWidthMetres > hull.halfWidthMetres + R.epsilon
    || Math.abs(cz) + current.halfLengthMetres > hull.halfLengthMetres + R.epsilon
    || current.minY < source.y - R.epsilon || current.maxY > source.y + hull.heightMetres + R.epsilon)
    return finish('unknown', 'actual-native-origin-not-enclosed');
  // Any point on a native endpoint-linear chord is within half the chord's
  // length of an endpoint. Original source travel <=step bounds that length by
  // step*largest true XZ/source-distance scale. This does NOT assume curvature,
  // normal endpoints, a rendered road or a fake substep. Seam displacement is
  // included separately by the existing closed-position source tolerance.
  // Math.max over the list, folded in order: the same maximum (NaN and ±0 included).
  let metricScale = -Infinity;
  for (let index = 0; index < raw.length; index++) metricScale = Math.max(metricScale, raw[index].metricScale);
  const chord = step * metricScale / 2;
  const bridge = chord + (path.closed ? R.closedPositionToleranceMetres : 0) + R.epsilon;
  const prepared: FlatSourceSpan[] = [];
  // raw has <=64 elements. Sliding source-distance endpoints plus monotone yaw
  // deques visit each source frame once per bound, O(n) with <=2n enqueues.
  let left = 0, right = 0;
  const minimum: number[] = [], maximum: number[] = [];
  let minimumHead = 0, maximumHead = 0;
  for (let index = 0; index < raw.length; index++) {
    const piece = raw[index];
    while (right < raw.length && raw[right].begin <= piece.end + step) {
      neighbourVisits++;
      while (minimum.length > minimumHead && raw[minimum[minimum.length - 1]].lowYaw >= raw[right].lowYaw) minimum.pop();
      while (maximum.length > maximumHead && raw[maximum[maximum.length - 1]].highYaw <= raw[right].highYaw) maximum.pop();
      minimum.push(right); maximum.push(right); right++;
    }
    while (left < raw.length && raw[left].end < piece.begin - step) {
      if (minimum[minimumHead] === left) minimumHead++;
      if (maximum[maximumHead] === left) maximumHead++; left++;
    }
    const nativeYawLow = raw[minimum[minimumHead]].lowYaw, nativeYawHigh = raw[maximum[maximumHead]].highYaw;
    const reachX = extent(hull.halfWidthMetres + R.epsilon, hull.halfLengthMetres + R.epsilon, nativeYawLow, nativeYawHigh);
    const reachZ = extent(hull.halfLengthMetres + R.epsilon, hull.halfWidthMetres + R.epsilon, nativeYawLow, nativeYawHigh);
    const bounds = {
      minX: Math.min(piece.from.x, piece.to.x) - reachX - bridge, maxX: Math.max(piece.from.x, piece.to.x) + reachX + bridge,
      minZ: Math.min(piece.from.z, piece.to.z) - reachZ - bridge, maxZ: Math.max(piece.from.z, piece.to.z) + reachZ + bridge };
    const proof: GroundSupportWindowResult = certify.call(input.sampler, bounds);
    fieldCells += proof.fieldCells; gridCells += proof.gridCells; colliderReferences += proof.colliderReferences; hazardReferences += proof.hazardReferences;
    certificateOverflows += proof.status === 'overflow' ? 1 : 0;
    if (proof.status !== 'flat' || proof.height !== source.y || proof.bounds.minX !== bounds.minX
      || proof.bounds.maxX !== bounds.maxX || proof.bounds.minZ !== bounds.minZ || proof.bounds.maxZ !== bounds.maxZ)
      return finish('unknown', proof.reason, [], chord);
    prepared.push(Object.freeze({ from: piece.from, to: piece.to, referenceYaw: piece.referenceYaw, nativeYawLow, nativeYawHigh }));
  }
  return finish('complete', 'entire-native-source-context-flat', prepared, chord);
}
