/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Bounded behavior scan of original source spans. No endpoint chord shortcut. */
import type { PopulationPath } from '../level/populationPlan.ts';
import type { PopulationFootprint } from './population.ts';
import { POPULATION as R } from '../data/tuning.ts';
import type { TerrainSampler } from './world.ts';
import { flatRouteCertificateScratch, forgetFlatRouteMemos } from './populationFlatRouteCertificate.ts';
import type { PopulationLocalHull } from '../shared/populationHull.ts';
import { rectangularYawSupport as sourceYawSupport } from '../shared/rectangularYawSupport.ts';
export { rectangularYawSupport as sourceYawSupport } from '../shared/rectangularYawSupport.ts';

export interface RouteAnticipationBlocker {
  readonly id: string;
  readonly from: PopulationFootprint;
  readonly to: PopulationFootprint;
  readonly pad?: number;
  /**
   * PERF-WHARF: caller-owned scratch for this very record's body terms,
   * formed by the first scan that reads them and read by every later scan
   * naming the same record (the population's vans share one record per actor
   * a step). Its `from` and `to` never change, so neither do their terms.
   */
  readonly terms?: RouteBlockerTerms;
}
/** `formed` bits: 1 reach (from and to), 2 turn, 4 and 8 world-axis 0 and 1 extents. */
export interface RouteBlockerTerms {
  formed: number; reachX: number; reachZ: number; toReachX: number; toReachZ: number;
  turn: number; extent0: number; extent1: number;
}
export const createRouteBlockerTerms = (): RouteBlockerTerms =>
  ({ formed: 0, reachX: 0, reachZ: 0, toReachX: 0, toReachZ: 0, turn: 0, extent0: 0, extent1: 0 });
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
/**
 * Exact-keyed memo of a scan's pure per-body terms (PERF-WHARF, 2026-10-23).
 * A blocker's world-box half-extents read only its heading and dimensions;
 * its turn and world-axis (0 and 1) yaw extents only its two headings and the
 * larger of each dimension. Every Wharf van's scan in a fixed step names the
 * same actor bodies, and a standing body keeps them from step to step, so the
 * same values were re-formed some 120 times a step. Each slot keeps the very
 * inputs (`Object.is`, so -0 is its own key) beside what the scan formed from
 * them, with the same expression, so a hit returns the same bits and a miss
 * or an overwritten slot simply forms them again. Direct-mapped and bounded.
 */
const TERM_SLOTS = 4096, TERM_MASK = TERM_SLOTS - 1;
/**
 * One value into a running hash (a murmur3 round), by its 1/65536 steps: the
 * hash only picks a slot, and every slot compares its keys exactly, so values
 * that share a step merely share a slot.
 */
const mixTerm = (hash: number, value: number): number => {
  const h = Math.imul(hash ^ ((value * 65536) | 0), 0xcc9e2d51);
  return Math.imul((h << 15) | (h >>> 17), 0x1b873593);
};
/** murmur3's final avalanche, as a slot. */
const mixTermSlot = (hash: number, mask: number): number => {
  let h = hash ^ (hash >>> 16); h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) & mask;
};
const reachKeys = new Float64Array(TERM_SLOTS * 3), reachValues = new Float64Array(TERM_SLOTS * 2);
const reachUsed = new Uint8Array(TERM_SLOTS);
/** worldBounds' half-extents |cos h|w+|sin h|l and |sin h|w+|cos h|l, returned as a slot of `reachValues`. */
function reachSlot(p: PopulationFootprint): number {
  const h = p.headingY, w = p.halfWidthMetres, l = p.halfLengthMetres;
  const slot = mixTermSlot(mixTerm(mixTerm(mixTerm(0x2545f491, h), w), l), TERM_MASK), key = slot * 3;
  if (reachUsed[slot] === 1 && Object.is(reachKeys[key], h) && Object.is(reachKeys[key + 1], w)
    && Object.is(reachKeys[key + 2], l)) return slot;
  const c = Math.abs(Math.cos(h)), s = Math.abs(Math.sin(h));
  reachKeys[key] = h; reachKeys[key + 1] = w; reachKeys[key + 2] = l; reachUsed[slot] = 1;
  reachValues[slot * 2] = c * w + s * l; reachValues[slot * 2 + 1] = s * w + c * l;
  return slot;
}
/** Per slot: from heading, to heading, larger width, larger length; then turn and the two
 * world-axis extents, with `flatFormed` bits 1 (turn), 2 and 4 (axis 0 and 1 extent). */
const flatKeys = new Float64Array(TERM_SLOTS * 4), flatValues = new Float64Array(TERM_SLOTS * 3);
const flatFormed = new Uint8Array(TERM_SLOTS), flatUsed = new Uint8Array(TERM_SLOTS);
function flatSlot(fromHeading: number, toHeading: number, width: number, length: number): number {
  const slot = mixTermSlot(mixTerm(mixTerm(mixTerm(mixTerm(0x6a09e667, fromHeading), toHeading), width), length), TERM_MASK);
  const key = slot * 4;
  if (flatUsed[slot] === 1 && Object.is(flatKeys[key], fromHeading) && Object.is(flatKeys[key + 1], toHeading)
    && Object.is(flatKeys[key + 2], width) && Object.is(flatKeys[key + 3], length)) return slot;
  flatKeys[key] = fromHeading; flatKeys[key + 1] = toHeading; flatKeys[key + 2] = width; flatKeys[key + 3] = length;
  flatUsed[slot] = 1; flatFormed[slot] = 0;
  return slot;
}
/** A blocker's memo slot with its turn, atan2(sin(b - a), cos(b - a)) of its two headings, formed. */
function blockerSlot(a: PopulationFootprint, b: PopulationFootprint): number {
  const slot = flatSlot(a.headingY, b.headingY, Math.max(a.halfWidthMetres, b.halfWidthMetres),
    Math.max(a.halfLengthMetres, b.halfLengthMetres));
  if ((flatFormed[slot] & 1) === 0) {
    flatValues[slot * 3] = Math.atan2(Math.sin(b.headingY - a.headingY), Math.cos(b.headingY - a.headingY));
    flatFormed[slot] |= 1;
  }
  return slot;
}

/** Forget every memoized scan term (PERF-WHARF): no result changes, only how
 * often the same values are formed; a test that counts that work calls it. */
export function forgetRouteAnticipationMemos(): void {
  reachUsed.fill(0); flatUsed.fill(0); spanUsed.fill(0);
  forgetFlatRouteMemos();
}

/**
 * One call's sorted blocker rows, as scalars in reused storage (PERF-WHARF):
 * the former per-call box objects, their two world-bound objects each and a
 * fresh 16-slot array per tested blocker were most of a Wharf scan's own cost.
 * Nothing here outlives a call: every row is rewritten before it is read, and
 * `flatFormed` is cleared per row, so a call reads exactly what it formed.
 */
let rowCapacity = 0;
const rowOrder: number[] = [];
let rowMinX = new Float64Array(0), rowMaxX = new Float64Array(0), rowMinZ = new Float64Array(0), rowMaxZ = new Float64Array(0);
let rowRadius = new Float64Array(0), rowTurn = new Float64Array(0), rowPadding = new Float64Array(0), rowAxes = new Float64Array(0);
let rowFlatFormed = new Uint8Array(0), rowKnown = new Uint8Array(0), rowSlot = new Int32Array(0);
/** Each row's caller-owned terms record, if its blocker carries one. */
const rowBlockerTerms: (RouteBlockerTerms | undefined)[] = [];
function reserveRows(count: number): void {
  if (count <= rowCapacity) return;
  const capacity = Math.max(count, rowCapacity * 2, 64);
  rowMinX = new Float64Array(capacity); rowMaxX = new Float64Array(capacity);
  rowMinZ = new Float64Array(capacity); rowMaxZ = new Float64Array(capacity);
  rowRadius = new Float64Array(capacity); rowTurn = new Float64Array(capacity); rowPadding = new Float64Array(capacity);
  rowAxes = new Float64Array(capacity * 16); rowFlatFormed = new Uint8Array(capacity); rowKnown = new Uint8Array(capacity);
  rowSlot = new Int32Array(capacity);
  rowCapacity = capacity;
}
/** The blockers being sorted; the comparator reads their ids (the former copy's sort, by index: same stable order). */
let sortedBlockers: readonly RouteAnticipationBlocker[] = [];
const byBlockerId = (first: number, second: number): number => {
  const a = sortedBlockers[first].id, b = sortedBlockers[second].id;
  return a < b ? -1 : a > b ? 1 : 0;
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
/** The four projection records every call rewrites before reading (PERF-WHARF). */
const PROJECTION_SCRATCH: readonly FlatProjection[] = [0, 1, 2, 3].map(() => ({ ux: 0, uz: 0, phase: 0, car: 0, start: 0, delta: 0 }));
/**
 * A span's axis terms read only its reference yaw, its native yaw bounds and
 * the padded hull (PERF-WHARF): the cosine and sine, the road axes' phases
 * and the four car supports. A van's middle spans keep all five from step to
 * step, so they are kept per exact key (`Object.is`) beside what was formed
 * from them, by the same expressions in the same order; a miss forms them.
 */
const spanKeys = new Float64Array(TERM_SLOTS * 5), spanValues = new Float64Array(TERM_SLOTS * 8);
const spanUsed = new Uint8Array(TERM_SLOTS);
/** Per-certified-span values only. Four car supports and centre projections
 * serve every blocker in the original axis order, written into the call's own
 * four scratch records. `halfWidth`/`halfLength` are the hull's dimensions plus
 * the native gap and epsilon, summed once. */
function flatProjections(fromX: number, fromZ: number, toX: number, toZ: number,
  yawLow: number, yawHigh: number, referenceYaw: number, halfWidth: number, halfLength: number,
  out: readonly FlatProjection[]): void {
  const slot = mixTermSlot(mixTerm(mixTerm(mixTerm(mixTerm(mixTerm(0x510e527f, referenceYaw), yawLow), yawHigh), halfWidth), halfLength), TERM_MASK);
  const key = slot * 5, value = slot * 8;
  if (!(spanUsed[slot] === 1 && Object.is(spanKeys[key], referenceYaw) && Object.is(spanKeys[key + 1], yawLow)
    && Object.is(spanKeys[key + 2], yawHigh) && Object.is(spanKeys[key + 3], halfWidth) && Object.is(spanKeys[key + 4], halfLength))) {
    spanUsed[slot] = 0;
    const c = Math.cos(referenceYaw), s = Math.sin(referenceYaw);
    spanValues[value] = c; spanValues[value + 1] = s;
    for (let axis = 0; axis < 4; axis++) {
      const ux = axis === 0 ? 1 : axis === 1 ? 0 : axis === 2 ? c : s;
      const uz = axis === 0 ? 0 : axis === 1 ? 1 : axis === 2 ? -s : c;
      const phase = axis === 0 ? WORLD_X_PHASE : axis === 1 ? WORLD_Z_PHASE : Math.atan2(uz, ux);
      if (axis >= 2) spanValues[value + axis] = phase;
      // Native grow() increases BOTH local dimensions. Scalar world-axis gap
      // padding alone misses interior turning support by gap*(sqrt(2)-1).
      spanValues[value + 4 + axis] = sourceYawSupport(halfWidth, halfLength, yawLow + phase, yawHigh + phase);
    }
    spanKeys[key] = referenceYaw; spanKeys[key + 1] = yawLow; spanKeys[key + 2] = yawHigh;
    spanKeys[key + 3] = halfWidth; spanKeys[key + 4] = halfLength; spanUsed[slot] = 1;
  }
  const c = spanValues[value], s = spanValues[value + 1];
  for (let axis = 0; axis < 4; axis++) {
    const ux = axis === 0 ? 1 : axis === 1 ? 0 : axis === 2 ? c : s;
    const uz = axis === 0 ? 0 : axis === 1 ? 1 : axis === 2 ? -s : c;
    const phase = axis === 0 ? WORLD_X_PHASE : axis === 1 ? WORLD_Z_PHASE : spanValues[value + axis], projection = out[axis];
    projection.car = spanValues[value + 4 + axis];
    projection.ux = ux; projection.uz = uz; projection.phase = phase;
    projection.start = fromX * ux + fromZ * uz; projection.delta = (toX - fromX) * ux + (toZ - fromZ) * uz;
  }
}

/** One axis's yaw extent of a blocker over its whole turn: the scan's own expression. */
function axisExtent(a: PopulationFootprint, b: PopulationFootprint, phase: number, turn: number): number {
  const first = a.headingY + phase, last = first + turn;
  return sourceYawSupport(Math.max(a.halfWidthMetres, b.halfWidthMetres),
    Math.max(a.halfLengthMetres, b.halfLengthMetres), Math.min(first, last), Math.max(first, last));
}
/** The same for world axis 0 or 1, whose phase is a constant: kept in the blocker's memo slot. */
function worldAxisExtent(a: PopulationFootprint, b: PopulationFootprint, axis: number, phase: number, turn: number, row: number): number {
  const terms = rowBlockerTerms[row], own = axis === 0 ? 4 : 8;
  if (terms !== undefined && (terms.formed & own) !== 0) return axis === 0 ? terms.extent0 : terms.extent1;
  const extent = memoWorldAxisExtent(a, b, axis, phase, turn, row);
  if (terms !== undefined) { if (axis === 0) terms.extent0 = extent; else terms.extent1 = extent; terms.formed |= own; }
  return extent;
}
function memoWorldAxisExtent(a: PopulationFootprint, b: PopulationFootprint, axis: number, phase: number, turn: number, row: number): number {
  // The row's own slot, unless another row has taken it since (then found again).
  const width = Math.max(a.halfWidthMetres, b.halfWidthMetres), length = Math.max(a.halfLengthMetres, b.halfLengthMetres);
  let slot = rowSlot[row];
  const key = slot * 4;
  if (!(flatUsed[slot] === 1 && Object.is(flatKeys[key], a.headingY) && Object.is(flatKeys[key + 1], b.headingY)
    && Object.is(flatKeys[key + 2], width) && Object.is(flatKeys[key + 3], length))) slot = flatSlot(a.headingY, b.headingY, width, length);
  const bit = axis === 0 ? 2 : 4;
  if ((flatFormed[slot] & bit) === 0) { flatValues[slot * 3 + 1 + axis] = axisExtent(a, b, phase, turn); flatFormed[slot] |= bit; }
  return flatValues[slot * 3 + 1 + axis];
}

/**
 * One blocker's span-independent flat terms within one call (PERF-R2-2,
 * 2026-10-04): its turn, its padding and, per axis, the centre interval
 * already widened by its yaw extent and padding, keyed by that axis's exact
 * (ux, uz). Axes 0 and 1 never change; axes 2 and 3 change only with the
 * span's reference yaw. Every value is the same expression on the same
 * inputs the per-span evaluation used, so a hit returns its exact bits.
 * From PERF-WHARF they live in the call's row storage (`rowTurn`,
 * `rowPadding`, `rowKnown` and sixteen `rowAxes` slots from `row * 16`).
 */
/** A row's centre interval on one axis, widened by its yaw extent and padding. */
function formAxis(a: PopulationFootprint, b: PopulationFootprint, row: number, axis: number,
  ux: number, uz: number, phase: number): void {
  const extent = axis < 2 ? worldAxisExtent(a, b, axis, phase, rowTurn[row], row) : axisExtent(a, b, phase, rowTurn[row]);
  const firstCentre = a.x * ux + a.z * uz, lastCentre = b.x * ux + b.z * uz;
  const padding = rowPadding[row], axes = rowAxes, slot = row * 16 + axis * 4;
  axes[slot] = ux; axes[slot + 1] = uz;
  axes[slot + 2] = Math.min(firstCentre, lastCentre) - extent - padding;
  axes[slot + 3] = Math.max(firstCentre, lastCentre) + extent + padding;
  rowKnown[row] |= 1 << axis;
}
function flatEntry(projections: readonly FlatProjection[], blocker: RouteAnticipationBlocker, row: number): number | null {
  let low = 0, high = 1;
  const a = blocker.from, b = blocker.to, axes = rowAxes, base = row * 16;
  for (let axis = 0; axis < 4; axis++) {
    const { ux, uz, phase, car, start, delta } = projections[axis], slot = base + axis * 4;
    if ((rowKnown[row] & (1 << axis)) === 0 || !Object.is(axes[slot], ux) || !Object.is(axes[slot + 1], uz))
      formAxis(a, b, row, axis, ux, uz, phase);
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
  // The certificate in its shared scalar storage (PERF-WHARF): this call reads it
  // whole before anything else can form another.
  const flatRoute = input.flatSupport ? flatRouteCertificateScratch({ path, distanceMetres: input.distanceMetres, direction,
    travelMetres, ...input.flatSupport }) : undefined;
  if (flatRoute) {
    certificateFieldCells = flatRoute.fieldCells; certificateGridCells = flatRoute.gridCells;
    certificateColliderReferences = flatRoute.colliderReferences; certificateHazardReferences = flatRoute.hazardReferences;
    certificateOverflows = flatRoute.certificateOverflows;
    certificateSourceSpans = flatRoute.sourceSpanVisits; certificateNeighbourVisits = flatRoute.neighbourVisits;
    nativeChordReserveMetres = flatRoute.nativeChordReserveMetres; flatCertificateReason = flatRoute.reason;
    if (flatRoute.status === 'work-cap') return result(0, flatRoute.reason, true);
  }
  const certifiedSpans = flatRoute?.status === 'complete' ? flatRoute.spanCount : 0;
  // The blockers in id order (a stable index sort: the former sorted copy's
  // order), each row's padded world box formed exactly as before.
  const count = blockers.length;
  reserveRows(count);
  const order = rowOrder;
  order.length = count;
  for (let index = 0; index < count; index++) order[index] = index;
  // Input already in id order (the population's own scans build it so) is its
  // own stable sort: the identity. Anything else is sorted as before.
  let inOrder = true;
  for (let index = 1; index < count; index++) if (blockers[index - 1].id > blockers[index].id) { inOrder = false; break; }
  if (!inOrder) {
    sortedBlockers = blockers;
    try { order.sort(byBlockerId); } finally { sortedBlockers = []; }
  }
  for (let row = 0; row < count; row++) {
    const blocker = blockers[order[row]], from = blocker.from, to = blocker.to, terms = blocker.terms;
    rowBlockerTerms[row] = terms;
    let fromReachX: number, fromReachZ: number, toReachX: number, toReachZ: number;
    if (terms !== undefined && (terms.formed & 1) !== 0) {
      fromReachX = terms.reachX; fromReachZ = terms.reachZ; toReachX = terms.toReachX; toReachZ = terms.toReachZ;
    } else {
      const fromSlot = reachSlot(from) * 2;
      fromReachX = reachValues[fromSlot]; fromReachZ = reachValues[fromSlot + 1];
      // A `to` with the same heading and dimensions has the same half-extents (a forecast moves only x/z).
      const toSlot = Object.is(to.headingY, from.headingY) && Object.is(to.halfWidthMetres, from.halfWidthMetres)
        && Object.is(to.halfLengthMetres, from.halfLengthMetres) ? -1 : reachSlot(to) * 2;
      toReachX = toSlot < 0 ? fromReachX : reachValues[toSlot]; toReachZ = toSlot < 0 ? fromReachZ : reachValues[toSlot + 1];
      if (terms !== undefined) {
        terms.reachX = fromReachX; terms.reachZ = fromReachZ; terms.toReachX = toReachX; terms.toReachZ = toReachZ; terms.formed |= 1;
      }
    }
    const aMinX = from.x - fromReachX, aMaxX = from.x + fromReachX, aMinZ = from.z - fromReachZ, aMaxZ = from.z + fromReachZ;
    const bMinX = to.x - toReachX, bMaxX = to.x + toReachX, bMinZ = to.z - toReachZ, bMaxZ = to.z + toReachZ;
    const pad = blocker.pad ?? 0;
    if (!Number.isFinite(pad) || pad < 0 || !(Number.isFinite(aMinX) && Number.isFinite(aMaxX) && Number.isFinite(aMinZ)
      && Number.isFinite(aMaxZ) && Number.isFinite(bMinX) && Number.isFinite(bMaxX) && Number.isFinite(bMinZ) && Number.isFinite(bMaxZ)))
      throw new RangeError('Invalid route anticipation blocker');
    const radius = (input.flatSupport ? 0 : input.gapMetres) + pad + (path.closed ? R.closedPositionToleranceMetres : 0);
    rowRadius[row] = radius;
    rowMinX[row] = Math.min(aMinX, bMinX) - radius; rowMaxX[row] = Math.max(aMaxX, bMaxX) + radius;
    rowMinZ[row] = Math.min(aMinZ, bMinZ) - radius; rowMaxZ[row] = Math.max(aMaxZ, bMaxZ) + radius;
    rowFlatFormed[row] = 0;
  }
  // The call's four flat projection records, and the hull's padded dimensions
  // as flatProjections summed them for every span.
  let projectionScratch: readonly FlatProjection[] | null = null, flatHalfWidth = 0, flatHalfLength = 0, seamTurn = 0;
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
    const certified = visits - 1 < certifiedSpans;
    let projections: readonly FlatProjection[] | null = null;
    if (certified && input.flatSupport) {
      if (projectionScratch === null) {
        projectionScratch = PROJECTION_SCRATCH;
        flatHalfWidth = input.flatSupport.hull.halfWidthMetres + input.gapMetres + R.epsilon;
        flatHalfLength = input.flatSupport.hull.halfLengthMetres + input.gapMetres + R.epsilon;
      }
      flatProjections(fromX, fromZ, toX, toZ, flatRoute!.nativeYawLow[visits - 1], flatRoute!.nativeYawHigh[visits - 1],
        flatRoute!.referenceYaw[visits - 1], flatHalfWidth, flatHalfLength, projectionScratch);
      projections = projectionScratch;
    }
    if (certified) flatSpans++; else unknownSpans++;
    let entry = Infinity, blockedBy: string | null = null;
    for (let row = 0; row < count; row++) {
      if (tests >= R.compactAnticipationMaximumBlockerTests) return result(0, 'work-cap', true);
      tests++;
      const blocker = blockers[order[row]];
      let hit: number | null;
      if (projections) {
        if (rowFlatFormed[row] === 0) {
          const terms = rowBlockerTerms[row];
          if (terms !== undefined && (terms.formed & 2) !== 0) { rowTurn[row] = terms.turn; rowSlot[row] = 0; }
          else {
            const slot = rowSlot[row] = blockerSlot(blocker.from, blocker.to);
            rowTurn[row] = flatValues[slot * 3];
            if (terms !== undefined) { terms.turn = rowTurn[row]; terms.formed |= 2; }
          }
          rowPadding[row] = rowRadius[row] + R.epsilon + flatRoute!.nativeChordReserveMetres;
          rowKnown[row] = 0; rowFlatFormed[row] = 1;
        }
        // World axis 0 first, inline (PERF-WHARF): flatEntry's own first slab on
        // its own terms. A row it rejects is flatEntry's null; any other row is
        // evaluated by flatEntry whole, axis 0 again included. Most rows end here.
        const x = projections[0];
        if ((rowKnown[row] & 1) === 0) formAxis(blocker.from, blocker.to, row, 0, x.ux, x.uz, x.phase);
        const minimum = rowAxes[row * 16 + 2] - x.car, maximum = rowAxes[row * 16 + 3] + x.car;
        let rejected: boolean;
        if (x.delta === 0) rejected = x.start < minimum || x.start > maximum;
        else {
          const t0 = (minimum - x.start) / x.delta, t1 = (maximum - x.start) / x.delta;
          rejected = Math.max(0, Math.min(t0, t1)) > Math.min(1, Math.max(t0, t1));
        }
        hit = rejected ? null : flatEntry(projections, blocker, row);
      } else hit = segmentEntry(fromX, fromZ, toX - fromX, toZ - fromZ,
        rowMinX[row] - carBound, rowMaxX[row] + carBound, rowMinZ[row] - carBound, rowMaxZ[row] + carBound);
      if (hit !== null && hit < entry) { entry = hit; blockedBy = blocker.id; }
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
