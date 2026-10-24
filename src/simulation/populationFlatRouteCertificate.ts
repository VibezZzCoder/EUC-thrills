/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Bounded observer proof for native flat source frames and fixed-dt mixers.
 * No clock writes, native pose substitution, world mutation or certificate
 * cache. The plan sampler's own window proofs are memoized by their exact
 * bounds (PERF-WHARF, below): a pure answer of an immutable sampler. */
import type { PopulationPath } from '../level/populationPlan.ts';
import type { PopulationLocalHull } from '../shared/populationHull.ts';
import type { PopulationFootprint } from './population.ts';
import type { TerrainSampler, GroundSupportWindowResult } from './world.ts';
import { POPULATION as R } from '../data/tuning.ts';
import { rectangularYawSupport as extent } from '../shared/rectangularYawSupport.ts';
import { PlanTerrainSampler } from './planSampler.ts';

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
const wrap = (h: number) => Math.atan2(Math.sin(h), Math.cos(h));

/**
 * PERF-WHARF (2026-10-23): a `PlanTerrainSampler`'s window proof is a pure
 * function of the window. Its field, collider grid and hazards are fixed at
 * construction (nothing rewrites a level's heights or colliders after it is
 * sampled) and each call owns its ephemeral sets. On the Wharf some 85% of the
 * ~210 windows certified per fixed step were certified the step before: a
 * van's middle spans are whole source spans, so their windows repeat until the
 * van passes them. Each sampler keeps a direct-mapped table of its frozen
 * results keyed by the four bounds exactly (`Object.is`, so -0 is its own key);
 * a hit returns the very result object the same window produced. Only the
 * class's own method on an instance of exactly that class is memoized; any
 * other sampler (a test double, a subclass, an override) is asked every time.
 */
const PROOF_SLOTS = 4096, PROOF_MASK = PROOF_SLOTS - 1;
interface ProofTable { readonly keys: Float64Array; readonly proofs: (GroundSupportWindowResult | undefined)[] }
let proofTables = new WeakMap<object, ProofTable>(), proofTableGeneration = 0, proofTablesOf = 0;
const planCertify = PlanTerrainSampler.prototype.certifyFlatSupportWindow;
/**
 * One value into a running hash (a murmur3 round), by its 1/65536 steps: the
 * hash only picks a slot, and every slot compares its keys exactly, so values
 * that share a step merely share a slot.
 */
const mixProof = (hash: number, value: number): number => {
  const h = Math.imul(hash ^ ((value * 65536) | 0), 0xcc9e2d51);
  return Math.imul((h << 15) | (h >>> 17), 0x1b873593);
};
/** murmur3's final avalanche, as a slot. */
const mixProofSlot = (hash: number, mask: number): number => {
  let h = hash ^ (hash >>> 16); h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) & mask;
};
function proofTableOf(sampler: TerrainSampler, certify: unknown): ProofTable | undefined {
  if (certify !== planCertify || Object.getPrototypeOf(sampler) !== PlanTerrainSampler.prototype) return undefined;
  if (proofTablesOf !== proofTableGeneration) { proofTables = new WeakMap(); proofTablesOf = proofTableGeneration; }
  let table = proofTables.get(sampler);
  if (table === undefined) proofTables.set(sampler, table = { keys: new Float64Array(PROOF_SLOTS * 4), proofs: [] });
  return table;
}
function certifyWindow(sampler: TerrainSampler, certify: NonNullable<TerrainSampler['certifyFlatSupportWindow']>,
  table: ProofTable | undefined, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): GroundSupportWindowResult {
  // Any other sampler gets its own fresh window, as it always did (it may keep it).
  if (table === undefined) return certify.call(sampler, { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ, maxZ: bounds.maxZ });
  const slot = mixProofSlot(mixProof(mixProof(mixProof(mixProof(0x3c6ef372, bounds.minX), bounds.maxX), bounds.minZ), bounds.maxZ), PROOF_MASK);
  const key = slot * 4, keys = table.keys, known = table.proofs[slot];
  if (known !== undefined && Object.is(keys[key], bounds.minX) && Object.is(keys[key + 1], bounds.maxX)
    && Object.is(keys[key + 2], bounds.minZ) && Object.is(keys[key + 3], bounds.maxZ)) return known;
  const proof = certify.call(sampler, bounds);
  keys[key] = bounds.minX; keys[key + 1] = bounds.maxX; keys[key + 2] = bounds.minZ; keys[key + 3] = bounds.maxZ;
  table.proofs[slot] = proof;
  return proof;
}
/**
 * The hull's world reach over a native yaw interval (PERF-WHARF): the two
 * extents read only the hull's half dimensions and the interval, which a van's
 * middle spans keep from step to step; kept per exact key beside the values
 * formed from it, by the same expressions in the same order.
 */
const reachKeys = new Float64Array(PROOF_SLOTS * 4), reachValues = new Float64Array(PROOF_SLOTS * 2);
const reachUsed = new Uint8Array(PROOF_SLOTS);
function hullReach(halfWidth: number, halfLength: number, low: number, high: number): number {
  const slot = mixProofSlot(mixProof(mixProof(mixProof(mixProof(0x9b05688c, halfWidth), halfLength), low), high), PROOF_MASK), key = slot * 4;
  if (reachUsed[slot] === 1 && Object.is(reachKeys[key], halfWidth) && Object.is(reachKeys[key + 1], halfLength)
    && Object.is(reachKeys[key + 2], low) && Object.is(reachKeys[key + 3], high)) return slot;
  reachUsed[slot] = 0;
  reachValues[slot * 2] = extent(halfWidth + R.epsilon, halfLength + R.epsilon, low, high);
  reachValues[slot * 2 + 1] = extent(halfLength + R.epsilon, halfWidth + R.epsilon, low, high);
  reachKeys[key] = halfWidth; reachKeys[key + 1] = halfLength; reachKeys[key + 2] = low; reachKeys[key + 3] = high;
  reachUsed[slot] = 1;
  return slot;
}
/** Forget every memoized reach and window proof: they change no result, only
 * how often the same values are formed (a test counting that work calls it). */
export function forgetFlatRouteMemos(): void {
  reachUsed.fill(0);
  proofTableGeneration += 1;
}
type FlatRouteInput = Readonly<{
  path: PopulationPath; distanceMetres: number; direction: 1 | -1;
  travelMetres: number; maximumNativeStepTravelMetres: number;
  sampler: TerrainSampler; hull: PopulationLocalHull;
  currentFootprint: PopulationFootprint; currentHeadingY: number;
}>;
/**
 * One certificate in reused scalar storage (PERF-WHARF, 2026-10-23): the
 * route scan reads a certificate's counts, reason, reserve and per-span yaw
 * bounds and nothing else, and forming the frozen points, raw records, span
 * records and arrays below for every van every step was most of this file's
 * own cost. `prepareFlatRouteCertificate` forms its frozen result from the same
 * storage, value for value. Every field is rewritten by each call before it is
 * read; nothing outlives the next call.
 */
export interface FlatRouteScratch {
  status: FlatRouteCertificate['status']; reason: string; spanCount: number; nativeChordReserveMetres: number;
  fieldCells: number; gridCells: number; colliderReferences: number; hazardReferences: number;
  certificateOverflows: number; neighbourVisits: number; sourceSpanVisits: number;
  /** Per prepared span (`spanCount` of them): its points, reference yaw and native yaw bounds. */
  readonly fromX: Float64Array; readonly fromZ: Float64Array; readonly toX: Float64Array; readonly toZ: Float64Array;
  readonly referenceYaw: Float64Array; readonly nativeYawLow: Float64Array; readonly nativeYawHigh: Float64Array;
}
const SPAN_CAPACITY = R.compactAnticipationMaximumSpans;
const scratch: FlatRouteScratch = { status: 'unknown', reason: '', spanCount: 0, nativeChordReserveMetres: 0,
  fieldCells: 0, gridCells: 0, colliderReferences: 0, hazardReferences: 0, certificateOverflows: 0, neighbourVisits: 0, sourceSpanVisits: 0,
  fromX: new Float64Array(SPAN_CAPACITY), fromZ: new Float64Array(SPAN_CAPACITY), toX: new Float64Array(SPAN_CAPACITY),
  toZ: new Float64Array(SPAN_CAPACITY), referenceYaw: new Float64Array(SPAN_CAPACITY),
  nativeYawLow: new Float64Array(SPAN_CAPACITY), nativeYawHigh: new Float64Array(SPAN_CAPACITY) };
/** The raw source context, per span: travelled begin/end, yaw bounds and metric scale. */
const rawBegin = new Float64Array(SPAN_CAPACITY), rawEnd = new Float64Array(SPAN_CAPACITY);
const rawLowYaw = new Float64Array(SPAN_CAPACITY), rawHighYaw = new Float64Array(SPAN_CAPACITY), rawMetric = new Float64Array(SPAN_CAPACITY);
/** The two monotone yaw deques (each holds at most every raw index once). */
const minimumDeque = new Int32Array(SPAN_CAPACITY), maximumDeque = new Int32Array(SPAN_CAPACITY);
/** The bounds handed to a sampler that is asked; it copies what it keeps. */
const windowBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

/** The certificate, exactly as `prepareFlatRouteCertificate` forms it, in the shared scratch. */
export function flatRouteCertificateScratch(input: FlatRouteInput): FlatRouteScratch {
  const out = scratch;
  out.fieldCells = 0; out.gridCells = 0; out.colliderReferences = 0; out.hazardReferences = 0;
  out.certificateOverflows = 0; out.neighbourVisits = 0; out.sourceSpanVisits = 0;
  const finish = (status: FlatRouteCertificate['status'], reason: string, spanCount = 0, nativeChordReserveMetres = 0): FlatRouteScratch => {
    out.status = status; out.reason = reason; out.spanCount = spanCount; out.nativeChordReserveMetres = nativeChordReserveMetres;
    return out;
  };
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
  const fromX = out.fromX, fromZ = out.fromZ, toX = out.toX, toZ = out.toZ;
  let raw = 0;
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
    if (raw >= R.compactAnticipationMaximumSpans) return finish('work-cap', 'native-source-context-cap');
    const a = path.points[span], b = path.points[span + 1], length = b.distanceMetres - a.distanceMetres;
    if (!(length > 0)) return finish('unknown', 'invalid-source-span');
    const remaining = direction === 1 ? b.distanceMetres - distance : distance - a.distanceMetres;
    const travel = Math.min(contextTravel - travelled, Math.max(0, remaining));
    const sourceYaw = wrap(b.headingY - a.headingY);
    const first = a.headingY + sourceYaw * (distance - a.distanceMetres) / length;
    const startYaw = priorYaw + wrap(first - priorYaw);
    const endYaw = startYaw + sourceYaw * direction * travel / length;
    const lowYaw = Math.min(startYaw, endYaw, raw === 0 ? input.currentHeadingY : priorYaw);
    const highYaw = Math.max(startYaw, endYaw, raw === 0 ? input.currentHeadingY : priorYaw);
    // The span's two source points: (station - a) / length along a -> b.
    const fromT = (distance - a.distanceMetres) / length, toT = (distance + direction * travel - a.distanceMetres) / length;
    fromX[raw] = a.x + (b.x - a.x) * fromT; fromZ[raw] = a.z + (b.z - a.z) * fromT;
    toX[raw] = a.x + (b.x - a.x) * toT; toZ[raw] = a.z + (b.z - a.z) * toT;
    rawBegin[raw] = travelled; rawEnd[raw] = travelled + travel; rawLowYaw[raw] = lowYaw; rawHighYaw[raw] = highYaw;
    out.referenceYaw[raw] = startYaw; rawMetric[raw] = Math.hypot(b.x - a.x, b.z - a.z) / length;
    raw++;
    out.sourceSpanVisits++;
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
  if (raw === 0) return finish('unknown', 'empty-native-source-context');
  const source = input.currentFootprint.sourceHull, current = input.currentFootprint;
  if (!source || source.x !== fromX[0] || source.z !== fromZ[0] || source.normalX !== 0
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
  for (let index = 0; index < raw; index++) metricScale = Math.max(metricScale, rawMetric[index]);
  const chord = step * metricScale / 2;
  const bridge = chord + (path.closed ? R.closedPositionToleranceMetres : 0) + R.epsilon;
  const proofs = proofTableOf(input.sampler, certify);
  // raw has <=64 elements. Sliding source-distance endpoints plus monotone yaw
  // deques visit each source frame once per bound, O(n) with <=2n enqueues.
  let left = 0, right = 0;
  const minimum = minimumDeque, maximum = maximumDeque;
  let minimumHead = 0, maximumHead = 0, minimumLength = 0, maximumLength = 0;
  let haveLast = false, lastLow = 0, lastHigh = 0, reachX = 0, reachZ = 0;
  for (let index = 0; index < raw; index++) {
    while (right < raw && rawBegin[right] <= rawEnd[index] + step) {
      out.neighbourVisits++;
      while (minimumLength > minimumHead && rawLowYaw[minimum[minimumLength - 1]] >= rawLowYaw[right]) minimumLength--;
      while (maximumLength > maximumHead && rawHighYaw[maximum[maximumLength - 1]] <= rawHighYaw[right]) maximumLength--;
      minimum[minimumLength++] = right; maximum[maximumLength++] = right; right++;
    }
    while (left < raw && rawEnd[left] < rawBegin[index] - step) {
      if (minimum[minimumHead] === left) minimumHead++;
      if (maximum[maximumHead] === left) maximumHead++; left++;
    }
    const nativeYawLow = rawLowYaw[minimum[minimumHead]], nativeYawHigh = rawHighYaw[maximum[maximumHead]];
    // A straight run's spans share one yaw interval: the last span's reach is kept at hand.
    if (!(haveLast && Object.is(nativeYawLow, lastLow) && Object.is(nativeYawHigh, lastHigh))) {
      const reachSlot = hullReach(hull.halfWidthMetres, hull.halfLengthMetres, nativeYawLow, nativeYawHigh);
      reachX = reachValues[reachSlot * 2]; reachZ = reachValues[reachSlot * 2 + 1];
      lastLow = nativeYawLow; lastHigh = nativeYawHigh; haveLast = true;
    }
    const bounds = windowBounds;
    bounds.minX = Math.min(fromX[index], toX[index]) - reachX - bridge; bounds.maxX = Math.max(fromX[index], toX[index]) + reachX + bridge;
    bounds.minZ = Math.min(fromZ[index], toZ[index]) - reachZ - bridge; bounds.maxZ = Math.max(fromZ[index], toZ[index]) + reachZ + bridge;
    const proof: GroundSupportWindowResult = certifyWindow(input.sampler, certify, proofs, bounds);
    out.fieldCells += proof.fieldCells; out.gridCells += proof.gridCells;
    out.colliderReferences += proof.colliderReferences; out.hazardReferences += proof.hazardReferences;
    out.certificateOverflows += proof.status === 'overflow' ? 1 : 0;
    if (proof.status !== 'flat' || proof.height !== source.y || proof.bounds.minX !== bounds.minX
      || proof.bounds.maxX !== bounds.maxX || proof.bounds.minZ !== bounds.minZ || proof.bounds.maxZ !== bounds.maxZ)
      return finish('unknown', proof.reason, 0, chord);
    out.nativeYawLow[index] = nativeYawLow; out.nativeYawHigh[index] = nativeYawHigh;
  }
  return finish('complete', 'entire-native-source-context-flat', raw, chord);
}

export function prepareFlatRouteCertificate(input: FlatRouteInput): FlatRouteCertificate {
  const out = flatRouteCertificateScratch(input), spans: FlatSourceSpan[] = [];
  for (let index = 0; index < out.spanCount; index++) spans.push(Object.freeze({
    from: Object.freeze({ x: out.fromX[index], z: out.fromZ[index] }), to: Object.freeze({ x: out.toX[index], z: out.toZ[index] }),
    referenceYaw: out.referenceYaw[index], nativeYawLow: out.nativeYawLow[index], nativeYawHigh: out.nativeYawHigh[index] }));
  return Object.freeze({ status: out.status, reason: out.reason, spans: Object.freeze(spans),
    nativeChordReserveMetres: out.nativeChordReserveMetres, fieldCells: out.fieldCells, gridCells: out.gridCells,
    colliderReferences: out.colliderReferences, hazardReferences: out.hazardReferences,
    certificateOverflows: out.certificateOverflows, neighbourVisits: out.neighbourVisits, sourceSpanVisits: out.sourceSpanVisits });
}
