/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Pure compound contact transaction for articulated occupants.
 *
 * A component is deliberately a compact physical body, not a union of all of
 * its owner's parts.  `intervalEnvelopeMetres` is the caller's proof that an
 * articulated path remains inside the endpoint-linear prism after uniform
 * expansion.  The resolver refines that proof to the existing contact skin;
 * it never promotes a fixed set of intermediate samples to exact CCD.
 */
import { lerp, wrapAngle } from '../shared/maths.ts';
import { AabbRecord, aabbsOverlap, coarseActorMotionWorldAabbAt } from '../shared/occupancyBroadphase.ts';
import type { Aabb } from '../shared/occupancyExpressions.ts';
import { physicalPopulationHull, POPULATION, sweepPopulationHulls,
  type PopulationFootprint, type PopulationHullContact } from './population.ts';

const R = POPULATION;

/** One continuous physical subshape of an owner (wheel, human, carried item…). */
export interface PopulationCompoundTrajectory {
  /** Stable owner identity, used for charge/cooldown collapse. */
  readonly ownerId: string;
  /** Stable subshape identity.  It must be unique within an owner. */
  readonly componentId: string;
  /** Bodies with this owner/group key stop together after any one is hit. */
  readonly stopGroupId: string;
  /** Physical footprint at the absolute fixed-step fraction. */
  at(time: number): PopulationFootprint;
  /**
   * A proven non-negative expansion in metres for this component alone.
   * For every u in [from,to], its real footprint must lie inside the linear
   * interpolation of at(from)/at(to), after each endpoint is expanded by this
   * amount horizontally and vertically.  Returning zero asserts a linear
   * footprint path for that interval.  Suggested sample counts are not a
   * valid bound.
   */
  intervalEnvelopeMetres(from: number, to: number): number;
}

/** Ordinary population actors remain a linear previous/current track. */
export interface PopulationCompoundActorMotion {
  readonly id: string;
  readonly previous: PopulationFootprint;
  readonly current: PopulationFootprint;
  /** Defaults to `actor:${id}`; supplied IDs allow a caller to collapse records. */
  readonly ownerId?: string;
  readonly componentId?: string;
  readonly stopGroupId?: string;
}

/** One earliest physical event for an owner pair; cooldown ownership stays with PopulationSimulation. */
export interface PopulationCompoundHit extends PopulationHullContact {
  readonly timeOfImpact: number;
  readonly actorId: string;
  readonly actorOwnerId: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly actorVelocityX: number;
  readonly actorVelocityZ: number;
  readonly componentVelocityX: number;
  readonly componentVelocityZ: number;
  /** The refinement work bound ran out first: a refusal, never proved touching. */
  readonly conservative?: true;
}

export interface PopulationCompoundContactPolicy {
  /** Legacy endpoint escape remains the default; certified transactions opt in. */
  readonly certifiedInitialOverlap?: 'continuous-proof';
  /** Per-owner refinement work shared by every batch of one fixed step (CP-1). */
  readonly refinement?: Map<string, RefinementWork>;
  /** Owners an actor contact never stops (a crashed body's native fall): actors
   * still stop at the event, these owners keep their whole path (2026-10-04). */
  readonly unstoppableOwnerIds?: ReadonlySet<string>;
}

/** Refinement one owner has spent this fixed step (CP-1): fresh compiled
 * enclosure evaluations, and search nodes, which include remembered ones. */
export interface RefinementWork { fresh: number; nodes: number }
/**
 * The key under which a shared refinement map keeps the whole fixed step's
 * fresh evaluations across every owner (R2C-6, 2026-10-04): the step's cost is
 * bounded, not each owner's, so two seats beside one actor cannot double it.
 */
export const STEP_REFINEMENT_TOTAL = '\u0000step';
/** The whole step's running total in a shared refinement map, created on first use. */
export function stepRefinementTotal(refinement: Map<string, RefinementWork>): RefinementWork {
  let total = refinement.get(STEP_REFINEMENT_TOTAL);
  if (!total) { total = { fresh: 0, nodes: 0 }; refinement.set(STEP_REFINEMENT_TOTAL, total); }
  return total;
}

export interface PopulationCompoundMotionBatch {
  readonly actorFractions: Readonly<Record<string, number>>;
  /** Absolute prefix for each owner/component identity. */
  readonly componentFractions: Readonly<Record<string, number>>;
  /** Absolute prefix for each owner/stop-group identity. */
  readonly stopGroupFractions: Readonly<Record<string, number>>;
  /** One stable earliest event per owner pair, ready for caller-owned cooldown handling. */
  readonly hits: readonly PopulationCompoundHit[];
}

interface Motion {
  readonly kind: 'actor' | 'component';
  readonly id: string;
  readonly ownerId: string;
  readonly componentId: string;
  readonly stopGroupId: string;
  readonly groupKey: string;
  readonly atUnstopped: (time: number) => PopulationFootprint;
  readonly envelope: (from: number, to: number) => number;
  /** Entire original trajectory, including every subsequently held prefix. */
  readonly worldBounds: Aabb | null;
  /** A person or EUC rider turning on the spot, met by riders at its start (`turningInPlace`). */
  readonly turning?: true;
  /** `${ownerId}/${componentId}`, and `${kind}/` before it: formed once, not per comparison. */
  readonly identityKey: string;
  readonly sortKey: string;
  /** An actor's kept exact values (PERF-WHARF), or null when it has none. */
  readonly record: ActorRecord | null;
  /** The last held (zero-velocity) copy stoppedBody formed, and the body it copies. */
  held?: { readonly from: PopulationFootprint; readonly body: PopulationFootprint };
}

/**
 * Person- or rider-sized: a square stand-in for a round body (see
 * `turningInPlace`). A fictional EUC rider's square is its radius, 0.65 m
 * (`POPULATION_AUTHORING.riderRadiusMetres`), as a pedestrian's is 0.42 m;
 * a vehicle's box (1.02 x 2.4 m) is no stand-in and never turns on the spot.
 */
const ROUND_BODY_HALF_METRES = 0.7;
/**
 * A person or a fictional EUC rider turning on the spot (R2C-5, 2026-10-04):
 * the same centre and body, only the heading of its square stand-in changes,
 * so it moves into no rider; the corners that sweep are empty. Riders meet it
 * where it stands, and their own travel into it is still refused, but they
 * never stop its turn: a walker at his shuttle end facing a pinned rider could
 * otherwise never turn and go. A rotation has no closing speed, so it never
 * yields either (`populationWholeStepRefusal`): an EUC rider's turn at its
 * lane end, left out at person size, was refused by a rider against it, and
 * that refused turn refused every move the rider made, reverse included (the
 * riverside pin, browser QA 2026-10-04).
 */
export function turningInPlace(actor: PopulationCompoundActorMotion): boolean {
  const a = actor.previous, b = actor.current;
  // On a grade the hull's prism shifts a few millimetres as its heading turns,
  // and its derived sizes differ in the last bits.
  const near = (first: number, second: number) => Math.abs(first - second) <= TURN_IN_PLACE_METRES;
  return Math.hypot(a.x - b.x, a.z - b.z) <= TURN_IN_PLACE_METRES && a.headingY !== b.headingY
    && near(a.minY, b.minY) && near(a.maxY, b.maxY) && near(a.halfWidthMetres, b.halfWidthMetres) && near(a.halfLengthMetres, b.halfLengthMetres)
    && Math.max(a.halfWidthMetres, a.halfLengthMetres, b.halfWidthMetres, b.halfLengthMetres) <= ROUND_BODY_HALF_METRES;
}
const TURN_IN_PLACE_METRES = 0.01;

interface Pair {
  readonly first: Motion;
  readonly second: Motion;
  /** Population actors still stop each other, but have no rider charge record. */
  readonly actorComponent: boolean;
  readonly key: string;
  /** An actor/actor pair's kept key and first-pass verdict (PERF-WHARF). */
  readonly entry?: PairVerdict;
}

interface Candidate {
  readonly pair: Pair;
  readonly hit: PopulationHullContact;
  readonly time: number;
  readonly conservative?: true;
}

type Swept = { hit: PopulationHullContact; time: number; conservative?: true };

const identity = (ownerId: string, componentId: string): string => `${ownerId}/${componentId}`;
const groupIdentity = (ownerId: string, stopGroupId: string): string => `${ownerId}/${stopGroupId}`;
const ownerPair = (a: string, b: string): string => a < b ? `${a}|${b}` : `${b}|${a}`;
const finite = (...values: number[]): boolean => values.every(Number.isFinite);

/** One immutable resolver epoch repeatedly asks for the same endpoints and
 * stop fractions. Cache the exact arithmetic result, never a sampled curve or
 * an endpoint substituted for a different fraction. */
function memoizeFootprint(at: (time: number) => PopulationFootprint): (time: number) => PopulationFootprint {
  const values = new Map<number, PopulationFootprint>();
  return time => {
    const held = values.get(time);
    if (held !== undefined) return held;
    const value = at(time); values.set(time, value); return value;
  };
}

/** A component's proof is pure for its lifetime, and every actor pair, chronology
 * iteration and whole-step refusal pass asks the same dyadic intervals and
 * endpoints again. Keyed by the component object, so a re-loaded certificate
 * gets a fresh table. */
interface ProofTable { readonly envelopes: Map<number, Map<number, number>>; readonly points: Map<number, PopulationFootprint> }
const envelopeTables = new WeakMap<PopulationCompoundTrajectory, ProofTable>();
function envelopeTable(component: PopulationCompoundTrajectory): ProofTable {
  let table = envelopeTables.get(component);
  if (!table) { table = { envelopes: new Map(), points: new Map() }; envelopeTables.set(component, table); }
  return table;
}
/** Only a fresh compiled evaluation is refinement work; a remembered one is free. */
function readEnvelope(component: PopulationCompoundTrajectory, table: ProofTable, from: number, to: number, work: RefinementWork,
  total?: RefinementWork): number {
  let row = table.envelopes.get(from);
  if (!row) { row = new Map(); table.envelopes.set(from, row); }
  const held = row.get(to);
  if (held !== undefined) return held;
  work.fresh += 1; if (total) total.fresh += 1;
  const value = component.intervalEnvelopeMetres(from, to); row.set(to, value); return value;
}
/** A compiled endpoint costs about a third of an enclosure; a resumed proof re-walks many. */
function readPoint(component: PopulationCompoundTrajectory, table: ProofTable, time: number): PopulationFootprint {
  const held = table.points.get(time);
  if (held !== undefined) return held;
  const value = component.at(time); table.points.set(time, value); return value;
}

/** A caller that rebuilt a component from bit-identical poses may hand it the
 * original's proof table; the enclosure is the same pure function. That holds
 * across fixed steps too, so a held owner's identical retry resumes its proof. */
export function adoptPopulationEnvelopeProof(source: PopulationCompoundTrajectory, target: PopulationCompoundTrajectory): void {
  envelopeTables.set(target, envelopeTable(source));
}

/** A source hull present but malformed (`trajectoryBounds` then returns no box). */
function malformedSource(body: PopulationFootprint): boolean {
  const source = body.sourceHull;
  return !!source && (!source.hull || !finite(source.x, source.y, source.z, source.headingY,
    source.normalX, source.normalY, source.normalZ, source.hull.halfWidthMetres,
    source.hull.halfLengthMetres, source.hull.heightMetres, source.marginMetres ?? 0,
    source.verticalPaddingBelowMetres ?? 0, source.verticalPaddingAboveMetres ?? 0)
    || source.normalY <= 0 || source.hull.halfWidthMetres <= 0 || source.hull.halfLengthMetres <= 0
    || source.hull.heightMetres <= 0 || (source.marginMetres ?? 0) < 0
    || (source.verticalPaddingBelowMetres ?? 0) < 0 || (source.verticalPaddingAboveMetres ?? 0) < 0);
}
/** trajectoryBounds' coarse box, written in place and read at once (M48). */
const TRAJECTORY_BOX = new Float64Array(6);
function trajectoryBounds(first: PopulationFootprint, last: PopulationFootprint, pad = 0): Aabb | null {
  if (malformedSource(first) || malformedSource(last)) return null;
  const box = TRAJECTORY_BOX;
  coarseActorMotionWorldAabbAt(pad === 0 ? first : inflate(first, pad), pad === 0 ? last : inflate(last, pad), box, 0);
  // A malformed optional source hull must still reach the existing validating
  // narrow phase; an invalid bound is never evidence that a pair cannot touch.
  if (!(Number.isFinite(box[0]) && Number.isFinite(box[1]) && Number.isFinite(box[2]) && Number.isFinite(box[3])
    && Number.isFinite(box[4]) && Number.isFinite(box[5]))) return null;
  const skin = R.contactSkinMetres + R.epsilon;
  return new AabbRecord(box[0] - skin, box[1] + skin, box[2] - skin, box[3] + skin, box[4] - skin, box[5] + skin);
}

const possiblePair = (a: Motion, b: Motion): boolean => a.worldBounds === null || b.worldBounds === null
  || aabbsOverlap(a.worldBounds, b.worldBounds);

/**
 * Exact actor values kept across batches (PERF-WHARF, 2026-10-23). A batch's
 * first chronology pass starts every stop at 1 and its cursor at 0, so there an
 * actor/actor pair's verdict (escaped, clear, or its contact and time) is a pure
 * function of the two actors' previous/current footprints alone. The Wharf asks
 * it about ~90 pairs per batch, most between standing social people whose
 * bodies are bit-identical from tick to tick, and a transaction asks it again
 * in every refusal pass. Each actor's endpoint values are compared field by
 * field (Object.is, so -0 and NaN keep their identity) against the last batch
 * that saw its id; a generation names one exact value set, and a pair's verdict
 * is reused only under both generations. Its endpoint bodies and broad-phase
 * box, pure in the same values, are reused with it. Nothing approximate is kept.
 * The record also keeps the actor's identity strings and pair keys, so the
 * maps and sets keyed by them hash one stable string instead of a fresh one.
 */
const BODY_FIELDS = 22;
interface ActorRecord {
  /** The raw identity inputs these strings were formed from. */
  ownerInput: string | undefined; componentInput: string | undefined; stopGroupInput: string | undefined;
  ownerId: string; componentId: string; stopGroupId: string; groupKey: string; identityKey: string; sortKey: string;
  /** Pair keys and first-pass verdicts with each later actor, by its record. */
  readonly pairs: Map<ActorRecord, PairVerdict>;
  /** The kept values describe plain number data; otherwise nothing value-derived is reused. */
  valid: boolean;
  readonly values: Float64Array; flags: number; generation: number; seen: number;
  bounds: Aabb | null; first: PopulationFootprint | undefined; last: PopulationFootprint | undefined;
  /** Previous and current are the same finite values: every t >= 0 mixes to one body (`stillValues`). */
  still: boolean;
}
interface PairVerdict {
  readonly key: string; readonly firstKey: string; readonly secondKey: string;
  first: number; second: number; seen: number;
  /** undefined: the endpoint overlap escape skipped the pair; null: clear. */
  found: Swept | null | undefined;
  /** This pair's latest hull sweeps by their exact input bodies (`SweepMemo`). */
  readonly sweeps: SweepMemo;
}
const actorRecords = new Map<string, ActorRecord>();
/** Every kept-result reuse below (PERF-WHARF) is on; off, each batch recomputes
 * everything as the plain algorithm states it. Exactness tests only. */
let reuse = true;
export function setPopulationCompoundReuseForTests(enabled: boolean): void { reuse = enabled; }
let actorGeneration = 0, batchSerial = 0;
/** Entries unseen for this many batches are dropped; a later return is merely recomputed. */
const RECORD_RETENTION_BATCHES = 256;
const optionalNumber = (value: unknown): boolean => value === undefined || value === null || typeof value === 'number';
/** The footprint's flags (bit 0 source hull, 1–3 its optional paddings), or -1 when it is not plain number data. */
function bodyFlags(body: PopulationFootprint): number {
  if (typeof body.x !== 'number' || typeof body.z !== 'number' || typeof body.headingY !== 'number'
    || typeof body.halfWidthMetres !== 'number' || typeof body.halfLengthMetres !== 'number' || typeof body.minY !== 'number'
    || typeof body.maxY !== 'number' || typeof body.velocityX !== 'number' || typeof body.velocityZ !== 'number') return -1;
  const source = body.sourceHull as unknown;
  if (source === undefined || source === null || source === false) return 0;
  if (typeof source !== 'object') return -1;
  const hull = (source as { hull?: unknown }).hull, s = source as NonNullable<PopulationFootprint['sourceHull']>;
  if (typeof hull !== 'object' || hull === null || typeof s.x !== 'number' || typeof s.y !== 'number' || typeof s.z !== 'number'
    || typeof s.headingY !== 'number' || typeof s.normalX !== 'number' || typeof s.normalY !== 'number' || typeof s.normalZ !== 'number'
    || typeof s.hull.halfWidthMetres !== 'number' || typeof s.hull.halfLengthMetres !== 'number' || typeof s.hull.heightMetres !== 'number'
    || !optionalNumber(s.marginMetres) || !optionalNumber(s.verticalPaddingBelowMetres) || !optionalNumber(s.verticalPaddingAboveMetres)) return -1;
  const present = (value: number | undefined) => value !== undefined && value !== null;
  return 1 | (present(s.marginMetres) ? 2 : 0) | (present(s.verticalPaddingBelowMetres) ? 4 : 0) | (present(s.verticalPaddingAboveMetres) ? 8 : 0);
}
function writeBody(values: Float64Array, at: number, body: PopulationFootprint, flags: number): void {
  values[at] = body.x; values[at + 1] = body.z; values[at + 2] = body.headingY; values[at + 3] = body.halfWidthMetres;
  values[at + 4] = body.halfLengthMetres; values[at + 5] = body.minY; values[at + 6] = body.maxY;
  values[at + 7] = body.velocityX; values[at + 8] = body.velocityZ;
  if (!(flags & 1)) return;
  const s = body.sourceHull!;
  values[at + 9] = s.x; values[at + 10] = s.y; values[at + 11] = s.z; values[at + 12] = s.headingY;
  values[at + 13] = s.normalX; values[at + 14] = s.normalY; values[at + 15] = s.normalZ;
  values[at + 16] = s.hull.halfWidthMetres; values[at + 17] = s.hull.halfLengthMetres; values[at + 18] = s.hull.heightMetres;
  values[at + 19] = flags & 2 ? s.marginMetres! : 0; values[at + 20] = flags & 4 ? s.verticalPaddingBelowMetres! : 0;
  values[at + 21] = flags & 8 ? s.verticalPaddingAboveMetres! : 0;
}
function sameBody(values: Float64Array, at: number, body: PopulationFootprint, flags: number): boolean {
  if (!Object.is(values[at], body.x) || !Object.is(values[at + 1], body.z) || !Object.is(values[at + 2], body.headingY)
    || !Object.is(values[at + 3], body.halfWidthMetres) || !Object.is(values[at + 4], body.halfLengthMetres)
    || !Object.is(values[at + 5], body.minY) || !Object.is(values[at + 6], body.maxY)
    || !Object.is(values[at + 7], body.velocityX) || !Object.is(values[at + 8], body.velocityZ)) return false;
  if (!(flags & 1)) return true;
  const s = body.sourceHull!;
  return Object.is(values[at + 9], s.x) && Object.is(values[at + 10], s.y) && Object.is(values[at + 11], s.z)
    && Object.is(values[at + 12], s.headingY) && Object.is(values[at + 13], s.normalX) && Object.is(values[at + 14], s.normalY)
    && Object.is(values[at + 15], s.normalZ) && Object.is(values[at + 16], s.hull.halfWidthMetres)
    && Object.is(values[at + 17], s.hull.halfLengthMetres) && Object.is(values[at + 18], s.hull.heightMetres)
    && (!(flags & 2) || Object.is(values[at + 19], s.marginMetres)) && (!(flags & 4) || Object.is(values[at + 20], s.verticalPaddingBelowMetres))
    && (!(flags & 8) || Object.is(values[at + 21], s.verticalPaddingAboveMetres));
}
/**
 * This batch's record for one actor id: its identity strings, formed exactly
 * as the batch forms them, and its endpoint values with their generation.
 */
function actorRecord(actor: PopulationCompoundActorMotion): ActorRecord {
  let record = actorRecords.get(actor.id);
  if (!record || record.ownerInput !== actor.ownerId || record.componentInput !== actor.componentId || record.stopGroupInput !== actor.stopGroupId) {
    const ownerId = actor.ownerId ?? `actor:${actor.id}`, componentId = actor.componentId ?? actor.id, stopGroupId = actor.stopGroupId ?? componentId;
    const identityKey = identity(ownerId, componentId);
    // New identity strings start a new record: no kept pair or value belongs to them.
    record = { ownerInput: actor.ownerId, componentInput: actor.componentId, stopGroupInput: actor.stopGroupId,
      ownerId, componentId, stopGroupId, groupKey: groupIdentity(ownerId, stopGroupId), identityKey, sortKey: `actor/${identityKey}`,
      pairs: new Map(), valid: false, values: new Float64Array(BODY_FIELDS * 2),
      flags: 0, generation: ++actorGeneration, seen: 0, bounds: null, first: undefined, last: undefined, still: false };
    actorRecords.set(actor.id, record);
  }
  record.seen = batchSerial;
  const before = bodyFlags(actor.previous), after = bodyFlags(actor.current);
  if (before < 0 || after < 0) {
    // Never matched again: the next plain values start a new generation.
    if (record.valid) { record.valid = false; record.generation = ++actorGeneration; }
    return record;
  }
  const flags = before | (after << 4);
  if (!record.valid || record.flags !== flags || !sameBody(record.values, 0, actor.previous, before)
    || !sameBody(record.values, BODY_FIELDS, actor.current, after)) {
    writeBody(record.values, 0, actor.previous, before); writeBody(record.values, BODY_FIELDS, actor.current, after);
    record.flags = flags; record.valid = true; record.generation = ++actorGeneration;
    record.bounds = trajectoryBounds(actor.previous, actor.current); record.first = undefined; record.last = undefined;
    record.still = stillValues(record.values, flags);
  }
  return record;
}
/**
 * A standing actor (PERF-WHARF crash pass, 2026-10-23): its previous and
 * current footprints are the same finite numbers, so mixFootprint is the same
 * body at every t >= 0. Each lerp(v, v, t) is v + (v - v) * t = v + (+0), the
 * heading's wrapAngle(+0) is +0, and the source hull is formed from those same
 * values. A chronology that stops it at a fraction asks that one body again.
 */
function stillValues(values: Float64Array, flags: number): boolean {
  if ((flags & 15) !== flags >> 4) return false;
  const used = flags & 1 ? BODY_FIELDS : 9;
  for (let index = 0; index < used; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value) || !Object.is(value, values[BODY_FIELDS + index])) return false;
  }
  return true;
}
/** The pair's kept key and verdict slot, created with the key the batch would form. */
function pairEntry(first: ActorRecord, second: ActorRecord): PairVerdict {
  let entry = first.pairs.get(second);
  if (!entry || entry.firstKey !== first.identityKey || entry.secondKey !== second.identityKey) {
    entry = { key: `${first.identityKey}|${second.identityKey}`, firstKey: first.identityKey, secondKey: second.identityKey,
      first: -1, second: -1, seen: 0, found: undefined, sweeps: [] };
    first.pairs.set(second, entry);
  }
  entry.seen = batchSerial;
  return entry;
}
/**
 * Every i < j index pair possiblePair admits, in the all-pairs loop's (i, j)
 * order, as i * n + j: a sweep over sorted minX visits only pairs whose x
 * intervals overlap, the first clause aabbsOverlap tests (PERF-WHARF). A
 * motion without bounds meets every other, as possiblePair says.
 */
function possibleActorPairs(motions: readonly Motion[]): ArrayLike<number> & Iterable<number> {
  // The same box objects in the same order (a transaction's later passes over
  // one census) are the same values: the last answer stands (PERF-WHARF crash pass).
  if (reuse && motions.length === lastPairBoxes.length && motions.every((motion, index) => motion.worldBounds !== null
    && motion.worldBounds === lastPairBoxes[index])) return lastPairCodes;
  const answer = freshActorPairs(motions);
  lastPairBoxes = motions.map(motion => motion.worldBounds); lastPairCodes = answer;
  return answer;
}
let lastPairBoxes: readonly (Aabb | null)[] = [], lastPairCodes: ArrayLike<number> & Iterable<number> = [];
function freshActorPairs(motions: readonly Motion[]): ArrayLike<number> & Iterable<number> {
  const count = motions.length, found: number[] = [];
  if (!reuse) {
    for (let index = 0; index < count; index += 1) for (let other = index + 1; other < count; other += 1) found.push(index * count + other);
    return found;
  }
  // Any non-decreasing minX order finds the same pairs. Start from the last
  // batch's order, nearly sorted when the same actors barely moved, and
  // insertion-sort it.
  const order: number[] = [], placed = new Uint8Array(count);
  for (const index of sweepOrder) if (index < count && !placed[index] && motions[index].worldBounds !== null) { placed[index] = 1; order.push(index); }
  for (let index = 0; index < count; index += 1) if (!placed[index] && motions[index].worldBounds !== null) order.push(index);
  for (let at = 1; at < order.length; at += 1) {
    const index = order[at], minX = motions[index].worldBounds!.minX;
    let to = at;
    while (to > 0 && motions[order[to - 1]].worldBounds!.minX > minX) { order[to] = order[to - 1]; to -= 1; }
    order[to] = index;
  }
  sweepOrder = order;
  for (let at = 0; at < order.length; at += 1) {
    const index = order[at], box = motions[index].worldBounds!;
    for (let next = at + 1; next < order.length; next += 1) {
      const other = order[next], otherBox = motions[other].worldBounds!;
      if (otherBox.minX > box.maxX) break;
      if (aabbsOverlap(box, otherBox)) found.push(index < other ? index * count + other : other * count + index);
    }
  }
  for (let index = 0; index < count; index += 1) {
    if (motions[index].worldBounds !== null) continue;
    for (let other = 0; other < count; other += 1) {
      if (other !== index && !(motions[other].worldBounds === null && other < index)) found.push(index < other ? index * count + other : other * count + index);
    }
  }
  // Codes are below count^2: the typed array's own numeric sort while they fit.
  return count <= 46340 ? Int32Array.from(found).sort() : found.sort((a, b) => a - b);
}
let sweepOrder: readonly number[] = [];

/**
 * Sort in place by `localeCompare` of each item's key, as the batch always has.
 * A stable sort's permutation depends only on its comparator's answers, so a
 * key sequence equal to the last one's reuses that permutation (PERF-WHARF).
 */
interface SortMemo { keys: readonly string[]; order: readonly number[] }
function sortByKey<T>(items: T[], keyOf: (item: T) => string, memo: SortMemo): SortMemo {
  const keys = items.map(keyOf);
  let order = memo.order;
  if (!reuse || keys.length !== memo.keys.length || keys.some((key, index) => key !== memo.keys[index])) {
    order = keys.map((_, index) => index).sort((a, b) => keys[a].localeCompare(keys[b]));
  }
  const source = items.slice();
  for (let index = 0; index < order.length; index += 1) items[index] = source[order[index]];
  return { keys, order };
}
let motionOrder: SortMemo = { keys: [], order: [] }, pairOrder: SortMemo = { keys: [], order: [] };
function pruneRecords(): void {
  if (batchSerial % RECORD_RETENTION_BATCHES !== 0) return;
  const oldest = batchSerial - RECORD_RETENTION_BATCHES;
  for (const [key, record] of actorRecords) {
    if (record.seen < oldest) { actorRecords.delete(key); continue; }
    for (const [other, entry] of record.pairs) if (entry.seen < oldest || other.seen < oldest) record.pairs.delete(other);
  }
}

function assertFootprint(body: PopulationFootprint): void {
  // `finite` spelled out: no rest array per footprint (PERF-WHARF).
  if (!(Number.isFinite(body.x) && Number.isFinite(body.z) && Number.isFinite(body.headingY) && Number.isFinite(body.minY)
    && Number.isFinite(body.maxY) && Number.isFinite(body.halfWidthMetres) && Number.isFinite(body.halfLengthMetres)
    && Number.isFinite(body.velocityX) && Number.isFinite(body.velocityZ)) || body.maxY <= body.minY
    || body.halfWidthMetres <= 0 || body.halfLengthMetres <= 0) {
    throw new RangeError('Population compound contact needs finite positive physical prisms');
  }
}

/** Mirrors PopulationSimulation's public linear actor semantics, including grade-aligned source hulls. */
function mixFootprint(a: PopulationFootprint, b: PopulationFootprint, t: number): PopulationFootprint {
  if (a.sourceHull && b.sourceHull) {
    const first = a.sourceHull, last = b.sourceHull;
    const mixed = physicalPopulationHull(lerp(first.x, last.x, t), lerp(first.y, last.y, t), lerp(first.z, last.z, t),
      first.headingY + wrapAngle(last.headingY - first.headingY) * t,
      lerp(first.normalX, last.normalX, t), lerp(first.normalY, last.normalY, t), lerp(first.normalZ, last.normalZ, t),
      { halfWidthMetres: lerp(first.hull.halfWidthMetres, last.hull.halfWidthMetres, t),
        halfLengthMetres: lerp(first.hull.halfLengthMetres, last.hull.halfLengthMetres, t),
        heightMetres: lerp(first.hull.heightMetres, last.hull.heightMetres, t) },
      lerp(a.velocityX, b.velocityX, t), lerp(a.velocityZ, b.velocityZ, t));
    const margin = lerp(first.marginMetres ?? 0, last.marginMetres ?? 0, t);
    const below = lerp(first.verticalPaddingBelowMetres ?? 0, last.verticalPaddingBelowMetres ?? 0, t);
    const above = lerp(first.verticalPaddingAboveMetres ?? 0, last.verticalPaddingAboveMetres ?? 0, t);
    return inflate({ ...mixed, minY: mixed.minY - below, maxY: mixed.maxY + above,
      sourceHull: { ...mixed.sourceHull!, verticalPaddingBelowMetres: below,
        verticalPaddingAboveMetres: above } }, margin);
  }
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t),
    headingY: a.headingY + wrapAngle(b.headingY - a.headingY) * t,
    halfWidthMetres: lerp(a.halfWidthMetres, b.halfWidthMetres, t),
    halfLengthMetres: lerp(a.halfLengthMetres, b.halfLengthMetres, t),
    minY: lerp(a.minY, b.minY, t), maxY: lerp(a.maxY, b.maxY, t),
    velocityX: lerp(a.velocityX, b.velocityX, t), velocityZ: lerp(a.velocityZ, b.velocityZ, t) };
}

/** Uniform expansion preserves the optional exact source hull as a conservative margin. */
function inflate(body: PopulationFootprint, metres: number): PopulationFootprint {
  return { ...body, halfWidthMetres: body.halfWidthMetres + metres,
    halfLengthMetres: body.halfLengthMetres + metres, minY: body.minY - metres, maxY: body.maxY + metres,
    ...(body.sourceHull ? { sourceHull: { ...body.sourceHull,
      marginMetres: (body.sourceHull.marginMetres ?? 0) + metres } } : {}) };
}

/** memoizeFootprint, whose exact 0 and 1 endpoints are also kept on the actor's record. */
function recordedFootprint(record: ActorRecord, actor: PopulationCompoundActorMotion): (time: number) => PopulationFootprint {
  const values = new Map<number, PopulationFootprint>();
  return time => {
    const held = values.get(time);
    if (held !== undefined) return held;
    let value: PopulationFootprint;
    if (record.still && time >= 0 && !Object.is(time, -0)) {
      // One body for every t >= 0 (`stillValues`): formed once, at the first t asked.
      value = record.first ??= mixFootprint(actor.previous, actor.current, time);
      record.last = value;
    } else if (Object.is(time, 0) && record.first !== undefined) value = record.first;
    else if (time === 1 && record.last !== undefined) value = record.last;
    else {
      value = mixFootprint(actor.previous, actor.current, time);
      if (Object.is(time, 0)) record.first = value; else if (time === 1) record.last = value;
    }
    values.set(time, value); return value;
  };
}

function stoppedBody(motion: Motion, groupStops: ReadonlyMap<string, number>, time: number): PopulationFootprint {
  const stop = groupStops.get(motion.groupKey)!;
  const body = motion.atUnstopped(Math.min(time, stop));
  if (!(time > stop + R.epsilon)) return body;
  // The held copy of one body is one object, so a sweep memo can know it again.
  const held = motion.held;
  if (reuse && held !== undefined && held.from === body) return held.body;
  const copy = { ...body, velocityX: 0, velocityZ: 0 };
  motion.held = { from: body, body: copy };
  return copy;
}

/**
 * An actor pair's recent hull sweeps, keyed by the exact body objects and pads
 * they were formed from (PERF-WHARF crash pass, 2026-10-23). The bodies are
 * this module's own mixed or held footprints, never mutated, so the same
 * objects are the same values and the sweep is the same pure result. A crash
 * stops actors at fractions and re-walks every unvisited pair at each later
 * cursor; a standing pair's bodies (`stillValues`) and every start body are
 * then the objects already swept, in this pass or a kept one.
 */
type SweepMemo = { a0: PopulationFootprint; a1: PopulationFootprint; b0: PopulationFootprint; b1: PopulationFootprint;
  aPad: number; bPad: number; inflated: boolean; result: PopulationHullContact | null }[];
const SWEEP_MEMO_ENTRIES = 6;
type Sweeper = (a0: PopulationFootprint, a1: PopulationFootprint, b0: PopulationFootprint, b1: PopulationFootprint,
  aPad: number, bPad: number, inflated: boolean) => PopulationHullContact | null;
/** The batch's own sweep: inflated by the pads when asked, exactly as written before. */
const directSweep: Sweeper = (a0, a1, b0, b1, aPad, bPad, inflated) => inflated
  ? sweepPopulationHulls(inflate(a0, aPad), inflate(a1, aPad), inflate(b0, bPad), inflate(b1, bPad))
  : sweepPopulationHulls(a0, a1, b0, b1);
/**
 * inflate(body, +0) changes no value the hull sweep reads unless maxY or a half
 * extent is -0 (x + 0 is then +0): minY - 0 keeps -0, and the source hull's
 * margin is only ever read as `?? 0` and added to a positive or lerped +0
 * value. Such a zero-pad sweep is the raw sweep of the same bodies.
 */
const zeroInflationExact = (body: PopulationFootprint): boolean => !Object.is(body.maxY, -0)
  && !Object.is(body.halfWidthMetres, -0) && !Object.is(body.halfLengthMetres, -0);
function memoSweeper(memo: SweepMemo): Sweeper {
  return (a0, a1, b0, b1, aPad, bPad, inflated) => {
    if (inflated && Object.is(aPad, 0) && Object.is(bPad, 0) && zeroInflationExact(a0) && zeroInflationExact(a1)
      && zeroInflationExact(b0) && zeroInflationExact(b1)) inflated = false;
    for (const entry of memo) if (entry.a0 === a0 && entry.a1 === a1 && entry.b0 === b0 && entry.b1 === b1 && entry.inflated === inflated
      && Object.is(entry.aPad, aPad) && Object.is(entry.bPad, bPad)) return entry.result;
    const result = directSweep(a0, a1, b0, b1, aPad, bPad, inflated);
    if (memo.length >= SWEEP_MEMO_ENTRIES) memo.shift();
    memo.push({ a0, a1, b0, b1, aPad, bPad, inflated, result });
    return result;
  };
}

/**
 * Searches a curved interval only under its supplied enclosure proof.  A
 * coarse enclosure may prune or over-predict, but cannot become an exact
 * contact: it must refine below contactSkinMetres before an event is accepted.
 *
 * The refinement is bounded (CP-1, 2026-10-03). A tumbling rag's enclosure
 * grows roughly linearly with the interval, at 0.5-50 m per fixed step for
 * 7-90 mm of real motion, so proving a millimetre gap took thousands of
 * evaluations and multi-second steps. Past `sweepRefinementBudget` fresh
 * enclosure evaluations or `sweepRefinementNodeBudget` search nodes for this
 * owner (per batch, unless the caller shares one fixed step's work), the
 * earliest still-unproved time is reported as a conservative contact: the
 * owner is refused and held, never admitted, so no overlap follows. A caller
 * that keeps the proof table can resume the identical proof next step.
 */
function sweepContinuous(a: Motion, b: Motion, groupStops: ReadonlyMap<string, number>,
  from: number, to: number, work: RefinementWork = { fresh: 0, nodes: 0 }, total?: RefinementWork, sweep: Sweeper = directSweep): Swept | null {
  const stopA = groupStops.get(a.groupKey)!, stopB = groupStops.get(b.groupKey)!;
  // A curve that becomes held inside an interval cannot use the original
  // interval's enclosure against a rescaled endpoint.  Split at that exact
  // state transition; the held suffix has a zero envelope by construction.
  for (const stop of [stopA, stopB]) {
    if (stop > from + R.epsilon && stop < to - R.epsilon) {
      return sweepContinuous(a, b, groupStops, from, stop, work, total, sweep) ?? sweepContinuous(a, b, groupStops, stop, to, work, total, sweep);
    }
  }
  const envelope = (motion: Motion): number => {
    const stop = groupStops.get(motion.groupKey)!;
    return from >= stop - R.epsilon ? 0 : motion.envelope(from, Math.min(to, stop));
  };
  const search = (low: number, high: number, depth: number): Swept | null => {
    // Component certificates describe raw physical heading interpolation.
    // The hull sweep's existing shortest-wrap semantics are equivalent only
    // below pi. Split the chronology before using that sweep, independently
    // of residual size (a rotating fixed-size prism can certify zero pad).
    const headingSpansRawArc = (motion: Motion): boolean => motion.kind === 'component'
      && Math.abs(stoppedBody(motion, groupStops, high).headingY - stoppedBody(motion, groupStops, low).headingY) >= Math.PI;
    if (headingSpansRawArc(a) || headingSpansRawArc(b)) {
      if (depth >= R.sweepMaximumSubdivisionDepth) throw new RangeError('Compound raw heading span exceeded subdivision depth');
      const middle = (low + high) * .5;
      return search(low, middle, depth + 1) ?? search(middle, high, depth + 1);
    }
    const aPad = low >= stopA - R.epsilon ? 0 : a.envelope(low, Math.min(high, stopA));
    const bPad = low >= stopB - R.epsilon ? 0 : b.envelope(low, Math.min(high, stopB));
    if (!(Number.isFinite(aPad) && Number.isFinite(bPad)) || aPad < 0 || bPad < 0) throw new RangeError('Compound interval envelope must be finite and non-negative');
    const possible = sweep(stoppedBody(a, groupStops, low), stoppedBody(a, groupStops, high),
      stoppedBody(b, groupStops, low), stoppedBody(b, groupStops, high), aPad, bPad, true);
    if (!possible) return null;
    if (Math.max(aPad, bPad) <= R.contactSkinMetres) {
      return { hit: possible, time: lerp(low, high, possible.timeOfImpact) };
    }
    // Within the sweep's resolution the interval's own linear sweep decides,
    // a witnessed contact or a clear interval (R2C-6): never a held proof.
    if (Math.max(aPad, bPad) <= R.sweepResolutionMetres) {
      const linear = sweep(stoppedBody(a, groupStops, low), stoppedBody(a, groupStops, high),
        stoppedBody(b, groupStops, low), stoppedBody(b, groupStops, high), 0, 0, false);
      return linear ? { hit: linear, time: lerp(low, high, linear.timeOfImpact) } : null;
    }
    // Every earlier subinterval is already proved clear (time-ordered search),
    // so `low` is the earliest time this enclosure can still touch. An exact
    // overlap at the interval's end witnesses a real contact in [low, to];
    // only an unwitnessed refusal is merely conservative evidence.
    work.nodes += 1;
    if (depth >= R.sweepMaximumSubdivisionDepth || work.fresh > R.sweepRefinementBudget
      || work.nodes > R.sweepRefinementNodeBudget || (total !== undefined && total.fresh > R.stepTotalRefinementBudget)) {
      const endA = stoppedBody(a, groupStops, to), endB = stoppedBody(b, groupStops, to);
      return sweep(endA, endA, endB, endB, 0, 0, false) ? { hit: possible, time: low }
        : { hit: possible, time: low, conservative: true };
    }
    const middle = (low + high) * 0.5;
    return search(low, middle, depth + 1) ?? search(middle, high, depth + 1);
  };
  // Evaluate once so malformed bounds fail even when a broad-phase miss would
  // otherwise hide a caller's invalid descriptor.
  const aPad = envelope(a), bPad = envelope(b);
  if (!finite(aPad, bPad) || aPad < 0 || bPad < 0) throw new RangeError('Compound interval envelope must be finite and non-negative');
  return search(from, to, 0);
}

/** Endpoint-linear actor support is constant only under a fixed source frame. */
function rigidActorSupport(first: PopulationFootprint, last: PopulationFootprint): boolean {
  if (first.headingY !== last.headingY || first.halfWidthMetres !== last.halfWidthMetres || first.halfLengthMetres !== last.halfLengthMetres
    || first.minY !== last.minY || first.maxY !== last.maxY) return false;
  if (!first.sourceHull && !last.sourceHull) return true;
  if (!first.sourceHull || !last.sourceHull) return false;
  const a = first.sourceHull, b = last.sourceHull;
  return a.headingY === b.headingY && a.normalX === b.normalX && a.normalY === b.normalY && a.normalZ === b.normalZ
    && a.hull.halfWidthMetres === b.hull.halfWidthMetres && a.hull.halfLengthMetres === b.hull.halfLengthMetres
    && a.hull.heightMetres === b.hull.heightMetres && (a.marginMetres ?? 0) === (b.marginMetres ?? 0)
    && (a.verticalPaddingBelowMetres ?? 0) === (b.verticalPaddingBelowMetres ?? 0)
    && (a.verticalPaddingAboveMetres ?? 0) === (b.verticalPaddingAboveMetres ?? 0);
}
/**
 * A fixed-support SAT axis proves overlap cannot deepen for the entire path.
 * Certified components must supply an exact zero enclosure residual; a held
 * native component does so by construction. No midpoint or endpoint-only
 * articulated escape is promoted to this proof. Grade-varying actor support
 * and all vertical travel decline this deliberately flat escape exception.
 */
function continuousNonWorseningEscape(pair: Pair, groupStops: ReadonlyMap<string, number>): boolean {
  const a = pair.first.atUnstopped(0), b = pair.second.atUnstopped(0), endA = pair.first.atUnstopped(1), endB = pair.second.atUnstopped(1);
  const rigid = (motion: Motion, first: PopulationFootprint, last: PopulationFootprint) => rigidActorSupport(first, last)
    && (motion.kind === 'actor' || motion.envelope(0, 1) === 0);
  if (!rigid(pair.first, a, endA) || !rigid(pair.second, b, endB)) return false;
  const axes = (body: PopulationFootprint) => [{ x: Math.cos(body.headingY), z: -Math.sin(body.headingY) }, { x: Math.sin(body.headingY), z: Math.cos(body.headingY) }];
  const support = (body: PopulationFootprint, axis: { x: number; z: number }) => {
    const [x, z] = axes(body); return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidthMetres
      + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLengthMetres;
  };
  let gap = -Infinity, projection = 0, normal = { x: 1, z: 0 };
  for (const axis of [...axes(a), ...axes(b)]) {
    const p = (b.x - a.x) * axis.x + (b.z - a.z) * axis.z, candidate = Math.abs(p) - support(a, axis) - support(b, axis);
    if (candidate > gap) { gap = candidate; projection = p; normal = axis; }
  }
  if (gap > 0) return false;
  const stopA = groupStops.get(pair.first.groupKey)!, stopB = groupStops.get(pair.second.groupKey)!;
  const projectionAt = (time: number) => projection
    + ((endB.x - b.x) * normal.x + (endB.z - b.z) * normal.z) * Math.min(time, stopB)
    - ((endA.x - a.x) * normal.x + (endA.z - a.z) * normal.z) * Math.min(time, stopA);
  // A prior chronological stop changes relative velocity. Prove each exact
  // prefix/suffix separately, using the certificate's affine outer prism.
  const breaks = [...new Set([0, stopA, stopB, 1])].sort((first, last) => first - last);
  return breaks.slice(0, -1).every((time, index) => {
    const first = projectionAt(time), last = projectionAt(breaks[index + 1]); return first * (last - first) >= 0;
  });
}

/**
 * A rider already merged with an actor whose own body leaves it (R2C-5,
 * 2026-10-04): the continuous fixed-axis escape below without its rigid-support
 * requirement, so a braking or reversing rider whose lean changes on the way
 * out may still back off. The bodies must separate along the start's tightest
 * axis over every chronological prefix, and the caller has seen the end less
 * deep. An endpoint-improving departure, not a proof the pose never digs in.
 */
function directlyAwayEscape(pair: Pair, groupStops: ReadonlyMap<string, number>): boolean {
  const a = pair.first.atUnstopped(0), b = pair.second.atUnstopped(0), endA = pair.first.atUnstopped(1), endB = pair.second.atUnstopped(1);
  const axes = (body: PopulationFootprint) => [{ x: Math.cos(body.headingY), z: -Math.sin(body.headingY) }, { x: Math.sin(body.headingY), z: Math.cos(body.headingY) }];
  const support = (body: PopulationFootprint, axis: { x: number; z: number }) => {
    const [x, z] = axes(body); return Math.abs(x.x * axis.x + x.z * axis.z) * body.halfWidthMetres
      + Math.abs(z.x * axis.x + z.z * axis.z) * body.halfLengthMetres;
  };
  let gap = -Infinity, projection = 0, normal = { x: 1, z: 0 };
  for (const axis of [...axes(a), ...axes(b)]) {
    const p = (b.x - a.x) * axis.x + (b.z - a.z) * axis.z, candidate = Math.abs(p) - support(a, axis) - support(b, axis);
    if (candidate > gap) { gap = candidate; projection = p; normal = axis; }
  }
  if (projection === 0) return false;
  const stopA = groupStops.get(pair.first.groupKey)!, stopB = groupStops.get(pair.second.groupKey)!;
  const projectionAt = (time: number) => projection
    + ((endB.x - b.x) * normal.x + (endB.z - b.z) * normal.z) * Math.min(time, stopB)
    - ((endA.x - a.x) * normal.x + (endA.z - a.z) * normal.z) * Math.min(time, stopA);
  const breaks = [...new Set([0, stopA, stopB, 1])].sort((first, last) => first - last);
  return Math.abs(projectionAt(1)) > Math.abs(projection) + R.epsilon && breaks.slice(0, -1).every((time, index) => {
    const first = projectionAt(time), last = projectionAt(breaks[index + 1]); return first * (last - first) >= 0;
  });
}

/**
 * Resolve ordinary linear actors and compact continuous components together.
 * Actors retain their existing actor-to-actor stop behavior, but only an
 * actor/component event produces a rider-facing cooldown/charge record.
 * Group stops are global and chronological, so later candidates re-query the
 * actual held footprint rather than a shortened endpoint trajectory.
 */
export function resolvePopulationCompoundMotionBatch(actors: readonly PopulationCompoundActorMotion[],
  components: readonly PopulationCompoundTrajectory[], policy: PopulationCompoundContactPolicy = {}): PopulationCompoundMotionBatch {
  // One refinement budget per component owner: every pair it is in shares it,
  // and a caller may share its fresh evaluations across the batches of one
  // fixed step. Search nodes are per batch: every pass re-walks remembered work.
  const refinement = policy.refinement ?? new Map<string, RefinementWork>();
  batchSerial += 1;
  for (const work of refinement.values()) work.nodes = 0;
  const total = stepRefinementTotal(refinement), unstoppable = policy.unstoppableOwnerIds;
  const workFor = (ownerId: string): RefinementWork => {
    let work = refinement.get(ownerId); if (!work) { work = { fresh: 0, nodes: 0 }; refinement.set(ownerId, work); } return work;
  };
  const motions: Motion[] = [], standing = new Map<Motion, Motion>();
  for (const actor of actors) {
    const ownerId = actor.ownerId ?? `actor:${actor.id}`;
    const componentId = actor.componentId ?? actor.id;
    const stopGroupId = actor.stopGroupId ?? componentId;
    if (!actor.id || !ownerId || !componentId || !stopGroupId) throw new Error('Compound transaction needs stable actor identities');
    assertFootprint(actor.previous); assertFootprint(actor.current);
    const kept = actorRecord(actor), record = reuse && kept.valid ? kept : null;
    const motion: Motion = { kind: 'actor', id: actor.id, ownerId: kept.ownerId, componentId: kept.componentId, stopGroupId: kept.stopGroupId,
      groupKey: kept.groupKey, atUnstopped: record ? recordedFootprint(record, actor)
        : memoizeFootprint(time => mixFootprint(actor.previous, actor.current, time)),
      envelope: () => 0, worldBounds: record ? record.bounds : trajectoryBounds(actor.previous, actor.current),
      identityKey: kept.identityKey, sortKey: kept.sortKey, record: kept };
    motions.push(motion);
    if (turningInPlace(actor)) {
      const still = { ...actor.previous, velocityX: 0, velocityZ: 0 };
      standing.set(motion, { ...motion, atUnstopped: () => still, worldBounds: trajectoryBounds(still, still), turning: true, record: null });
    }
  }
  for (const component of components) {
    if (!component.ownerId || !component.componentId || !component.stopGroupId) throw new Error('Compound transaction needs stable component identities');
    const table = envelopeTable(component), work = workFor(component.ownerId);
    const first = readPoint(component, table, 0), last = readPoint(component, table, 1);
    assertFootprint(first); assertFootprint(last);
    // Validate the whole enclosure even for a rejected pair. The complete
    // proof encloses any later stopped prefix, so it remains conservative as
    // chronological contacts change groupStops.
    const envelope = (from: number, to: number): number => readEnvelope(component, table, from, to, work, total), pad = envelope(0, 1);
    if (!Number.isFinite(pad) || pad < 0) throw new RangeError('Compound interval envelope must be finite and non-negative');
    const identityKey = identity(component.ownerId, component.componentId);
    motions.push({ kind: 'component', id: component.componentId, ownerId: component.ownerId,
      componentId: component.componentId, stopGroupId: component.stopGroupId,
      groupKey: groupIdentity(component.ownerId, component.stopGroupId), atUnstopped: time => readPoint(component, table, time),
      envelope, worldBounds: trajectoryBounds(first, last, pad), identityKey, sortKey: `component/${identityKey}`, record: null });
  }
  motionOrder = sortByKey(motions, motion => motion.sortKey, motionOrder);
  const componentKeys = new Set<string>(), actorIds = new Set<string>();
  for (const motion of motions) {
    const key = motion.identityKey;
    if (componentKeys.has(key)) throw new Error('Compound transaction needs distinct owner/component identities');
    componentKeys.add(key);
    if (motion.kind === 'actor') {
      if (actorIds.has(motion.id)) throw new Error('Compound transaction needs distinct actor IDs');
      actorIds.add(motion.id);
    }
  }
  const groupStops = new Map<string, number>();
  for (const motion of motions) groupStops.set(motion.groupKey, 1);
  const actorMotions = motions.filter(value => value.kind === 'actor');
  const componentMotions = motions.filter(value => value.kind === 'component');
  const pairs: Pair[] = [];
  for (const code of possibleActorPairs(actorMotions)) {
    const first = actorMotions[Math.floor(code / actorMotions.length)], second = actorMotions[code % actorMotions.length];
    if (first.ownerId !== second.ownerId && possiblePair(first, second)) {
      if (!reuse) { pairs.push({ first, second, actorComponent: false, key: `${first.identityKey}|${second.identityKey}` }); continue; }
      const entry = pairEntry(first.record!, second.record!);
      pairs.push({ first, second, actorComponent: false, key: entry.key, entry });
    }
  }
  for (const actor of actorMotions) for (const component of componentMotions) {
    const first = standing.get(actor) ?? actor;
    if (actor.ownerId !== component.ownerId && possiblePair(first, component)) pairs.push({ first, second: component, actorComponent: true,
      key: `${actor.identityKey}|${component.identityKey}` });
  }
  pairOrder = sortByKey(pairs, pair => pair.key, pairOrder);
  const visited = new Set<string>(), earliestByOwnerPair = new Map<string, PopulationCompoundHit>();
  let cursor = 0;
  /** One pair's earliest event under the current stops and cursor; undefined when the overlap escape skips it. */
  const evaluate = (pair: Pair): Swept | null | undefined => {
    // An actor pair's sweeps go through its kept memo; at t = 0 and t = 1 each
    // stoppedBody call returns one remembered object, so it is asked once.
    const sweep = pair.entry ? memoSweeper(pair.entry.sweeps) : directSweep;
    const firstStart = stoppedBody(pair.first, groupStops, 0), secondStart = stoppedBody(pair.second, groupStops, 0);
    const start = sweep(firstStart, firstStart, secondStart, secondStart, 0, 0, false);
    // Only an initial overlap reads the end sweep. Two actors' end bodies are
    // valid mixed hulls by construction, so their sweep cannot throw and is
    // formed only when read (PERF-WHARF); a component's is always formed.
    const firstEnd = stoppedBody(pair.first, groupStops, 1), secondEnd = stoppedBody(pair.second, groupStops, 1);
    const end = pair.actorComponent || start?.initiallyOverlapping ? sweep(firstEnd, firstEnd, secondEnd, secondEnd, 0, 0, false) : null;
    // Preserve the existing overlap-escape rule: do not arrest a pair that
    // began merged and has reduced that merge by the end of this transaction.
    // Nor one that only slides along its touching face with rigid support,
    // which the fixed-axis proof shows never deepens (R2C-5, 2026-10-04): a
    // walker stepping aside from a rider held against his back.
    const certified = pair.actorComponent && policy.certifiedInitialOverlap === 'continuous-proof';
    if (start?.initiallyOverlapping && (((!end || end.penetrationMetres < start.penetrationMetres - R.epsilon)
      && (!certified || continuousNonWorseningEscape(pair, groupStops) || directlyAwayEscape(pair, groupStops)))
      || (certified && continuousNonWorseningEscape(pair, groupStops)))) return undefined;
    // [cursor, the stops strictly inside (cursor, 1) in ascending order, 1]:
    // the sorted break list, without its filter and comparator sort (PERF-WHARF).
    const stopA = groupStops.get(pair.first.groupKey)!, stopB = groupStops.get(pair.second.groupKey)!;
    const hasA = stopA > cursor + R.epsilon && stopA < 1 - R.epsilon, hasB = stopB > cursor + R.epsilon && stopB < 1 - R.epsilon;
    const breaks = [cursor];
    if (hasA && hasB) { if (stopB < stopA) breaks.push(stopB, stopA); else breaks.push(stopA, stopB); }
    else if (hasA) breaks.push(stopA); else if (hasB) breaks.push(stopB);
    breaks.push(1);
    let found: Swept | null = null;
    for (let index = 0; index < breaks.length - 1; index += 1) {
      if (breaks[index + 1] <= breaks[index] + R.epsilon) continue;
      found = sweepContinuous(pair.first, pair.second, groupStops, breaks[index], breaks[index + 1], workFor(pair.second.ownerId), total, sweep);
      if (found) break;
    }
    return found;
  };
  for (let iteration = 0; iteration < pairs.length; iteration += 1) {
    let earliest = Infinity;
    const candidates: Candidate[] = [];
    for (const pair of pairs) {
      if (visited.has(pair.key)) continue;
      let found: Swept | null | undefined;
      const first = pair.first.record, second = pair.second.record, verdict = pair.entry;
      // The first pass's actor/actor verdict depends on the two actors alone
      // (every stop is 1, the cursor 0): reuse it under both exact generations.
      if (iteration === 0 && verdict !== undefined && first!.valid && second!.valid) {
        if (verdict.first === first!.generation && verdict.second === second!.generation) {
          found = verdict.found;
          // Its single [0, 1] interval opened this owner's refinement record.
          if (found !== undefined) workFor(pair.second.ownerId);
        } else {
          found = evaluate(pair);
          verdict.first = first!.generation; verdict.second = second!.generation; verdict.found = found;
        }
      } else found = evaluate(pair);
      if (!found) continue;
      if (found.time < earliest - R.epsilon) { earliest = found.time; candidates.length = 0; }
      if (found.time <= earliest + R.epsilon) candidates.push({ pair, ...found });
    }
    if (!Number.isFinite(earliest)) break;
    // All ties observe one immutable pre-stop epoch.  Applying a first tied
    // stop before reading its neighbour would incorrectly erase that second
    // collision's velocity and make the result dependent on pair ordering.
    const freezes = new Map<string, number>();
    for (const candidate of candidates) {
      visited.add(candidate.pair.key);
      const { first, second } = candidate.pair;
      if (candidate.pair.actorComponent) {
        const actorAt = stoppedBody(first, groupStops, candidate.time);
        const componentAt = stoppedBody(second, groupStops, candidate.time);
        const hit: PopulationCompoundHit = { ...candidate.hit, timeOfImpact: candidate.time,
          actorId: first.id, actorOwnerId: first.ownerId, ownerId: second.ownerId, componentId: second.componentId,
          actorVelocityX: actorAt.velocityX, actorVelocityZ: actorAt.velocityZ,
          componentVelocityX: componentAt.velocityX, componentVelocityZ: componentAt.velocityZ,
          ...(candidate.conservative ? { conservative: true as const } : {}) };
        const collapseKey = ownerPair(first.ownerId, second.ownerId);
        if (!earliestByOwnerPair.has(collapseKey)) earliestByOwnerPair.set(collapseKey, hit);
      }
      for (const motion of [first, second]) if (motion.kind === 'actor' ? motion.turning !== true : !unstoppable?.has(motion.ownerId)) freezes.set(motion.groupKey,
        Math.min(freezes.get(motion.groupKey) ?? 1, candidate.time));
    }
    for (const [groupKey, stop] of freezes) groupStops.set(groupKey, Math.min(groupStops.get(groupKey)!, stop));
    cursor = earliest;
    if (cursor >= 1 - R.epsilon) break;
  }
  const actorFractions: Record<string, number> = {}, componentFractions: Record<string, number> = {}, stopGroupFractions: Record<string, number> = {};
  for (const motion of motions) {
    const stop = groupStops.get(motion.groupKey)!;
    if (motion.kind === 'actor') actorFractions[motion.id] = stop;
    else componentFractions[identity(motion.ownerId, motion.componentId)] = stop;
  }
  for (const [key, stop] of groupStops) stopGroupFractions[key] = stop;
  pruneRecords();
  return { actorFractions, componentFractions, stopGroupFractions,
    hits: [...earliestByOwnerPair.values()].sort((a, b) => a.timeOfImpact - b.timeOfImpact
      || ownerPair(a.actorOwnerId, a.ownerId).localeCompare(ownerPair(b.actorOwnerId, b.ownerId))) };
}
