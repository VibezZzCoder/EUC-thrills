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
import { aabbsOverlap, coarseActorMotionWorldAabb } from '../shared/occupancyBroadphase.ts';
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

function trajectoryBounds(first: PopulationFootprint, last: PopulationFootprint, pad = 0): Aabb | null {
  for (const body of [first, last]) {
    const source = body.sourceHull;
    if (source && (!source.hull || !finite(source.x, source.y, source.z, source.headingY,
      source.normalX, source.normalY, source.normalZ, source.hull.halfWidthMetres,
      source.hull.halfLengthMetres, source.hull.heightMetres, source.marginMetres ?? 0,
      source.verticalPaddingBelowMetres ?? 0, source.verticalPaddingAboveMetres ?? 0)
      || source.normalY <= 0 || source.hull.halfWidthMetres <= 0 || source.hull.halfLengthMetres <= 0
      || source.hull.heightMetres <= 0 || (source.marginMetres ?? 0) < 0
      || (source.verticalPaddingBelowMetres ?? 0) < 0 || (source.verticalPaddingAboveMetres ?? 0) < 0)) return null;
  }
  const bounds = coarseActorMotionWorldAabb(pad === 0 ? first : inflate(first, pad), pad === 0 ? last : inflate(last, pad));
  // A malformed optional source hull must still reach the existing validating
  // narrow phase; an invalid bound is never evidence that a pair cannot touch.
  if (!Object.values(bounds).every(Number.isFinite)) return null;
  const skin = R.contactSkinMetres + R.epsilon;
  return { minX: bounds.minX - skin, maxX: bounds.maxX + skin,
    minY: bounds.minY - skin, maxY: bounds.maxY + skin,
    minZ: bounds.minZ - skin, maxZ: bounds.maxZ + skin };
}

const possiblePair = (a: Motion, b: Motion): boolean => a.worldBounds === null || b.worldBounds === null
  || aabbsOverlap(a.worldBounds, b.worldBounds);

function assertFootprint(body: PopulationFootprint): void {
  if (!finite(body.x, body.z, body.headingY, body.minY, body.maxY, body.halfWidthMetres,
    body.halfLengthMetres, body.velocityX, body.velocityZ) || body.maxY <= body.minY
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

function stoppedBody(motion: Motion, groupStops: ReadonlyMap<string, number>, time: number): PopulationFootprint {
  const stop = groupStops.get(motion.groupKey)!;
  const body = motion.atUnstopped(Math.min(time, stop));
  return time > stop + R.epsilon ? { ...body, velocityX: 0, velocityZ: 0 } : body;
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
  from: number, to: number, work: RefinementWork = { fresh: 0, nodes: 0 }, total?: RefinementWork): Swept | null {
  const stopA = groupStops.get(a.groupKey)!, stopB = groupStops.get(b.groupKey)!;
  // A curve that becomes held inside an interval cannot use the original
  // interval's enclosure against a rescaled endpoint.  Split at that exact
  // state transition; the held suffix has a zero envelope by construction.
  for (const stop of [stopA, stopB]) {
    if (stop > from + R.epsilon && stop < to - R.epsilon) {
      return sweepContinuous(a, b, groupStops, from, stop, work, total) ?? sweepContinuous(a, b, groupStops, stop, to, work, total);
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
    if (!finite(aPad, bPad) || aPad < 0 || bPad < 0) throw new RangeError('Compound interval envelope must be finite and non-negative');
    const possible = sweepPopulationHulls(inflate(stoppedBody(a, groupStops, low), aPad),
      inflate(stoppedBody(a, groupStops, high), aPad), inflate(stoppedBody(b, groupStops, low), bPad),
      inflate(stoppedBody(b, groupStops, high), bPad));
    if (!possible) return null;
    if (Math.max(aPad, bPad) <= R.contactSkinMetres) {
      return { hit: possible, time: lerp(low, high, possible.timeOfImpact) };
    }
    // Within the sweep's resolution the interval's own linear sweep decides,
    // a witnessed contact or a clear interval (R2C-6): never a held proof.
    if (Math.max(aPad, bPad) <= R.sweepResolutionMetres) {
      const linear = sweepPopulationHulls(stoppedBody(a, groupStops, low), stoppedBody(a, groupStops, high),
        stoppedBody(b, groupStops, low), stoppedBody(b, groupStops, high));
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
      return sweepPopulationHulls(endA, endA, endB, endB) ? { hit: possible, time: low }
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
    const motion: Motion = { kind: 'actor', id: actor.id, ownerId, componentId, stopGroupId,
      groupKey: groupIdentity(ownerId, stopGroupId), atUnstopped: memoizeFootprint(time => mixFootprint(actor.previous, actor.current, time)),
      envelope: () => 0, worldBounds: trajectoryBounds(actor.previous, actor.current) };
    motions.push(motion);
    if (turningInPlace(actor)) {
      const still = { ...actor.previous, velocityX: 0, velocityZ: 0 };
      standing.set(motion, { ...motion, atUnstopped: () => still, worldBounds: trajectoryBounds(still, still), turning: true });
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
    motions.push({ kind: 'component', id: component.componentId, ownerId: component.ownerId,
      componentId: component.componentId, stopGroupId: component.stopGroupId,
      groupKey: groupIdentity(component.ownerId, component.stopGroupId), atUnstopped: time => readPoint(component, table, time),
      envelope, worldBounds: trajectoryBounds(first, last, pad) });
  }
  motions.sort((a, b) => `${a.kind}/${identity(a.ownerId, a.componentId)}`.localeCompare(`${b.kind}/${identity(b.ownerId, b.componentId)}`));
  const componentKeys = new Set<string>(), actorIds = new Set<string>();
  for (const motion of motions) {
    const key = identity(motion.ownerId, motion.componentId);
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
  for (let index = 0; index < actorMotions.length; index += 1) for (let other = index + 1; other < actorMotions.length; other += 1) {
    const first = actorMotions[index], second = actorMotions[other];
    if (first.ownerId !== second.ownerId && possiblePair(first, second)) pairs.push({ first, second, actorComponent: false,
      key: `${identity(first.ownerId, first.componentId)}|${identity(second.ownerId, second.componentId)}` });
  }
  for (const actor of actorMotions) for (const component of componentMotions) {
    const first = standing.get(actor) ?? actor;
    if (actor.ownerId !== component.ownerId && possiblePair(first, component)) pairs.push({ first, second: component, actorComponent: true,
      key: `${identity(actor.ownerId, actor.componentId)}|${identity(component.ownerId, component.componentId)}` });
  }
  pairs.sort((a, b) => a.key.localeCompare(b.key));
  const visited = new Set<string>(), earliestByOwnerPair = new Map<string, PopulationCompoundHit>();
  let cursor = 0;
  for (let iteration = 0; iteration < pairs.length; iteration += 1) {
    let earliest = Infinity;
    const candidates: Candidate[] = [];
    for (const pair of pairs) {
      if (visited.has(pair.key)) continue;
      const start = sweepPopulationHulls(stoppedBody(pair.first, groupStops, 0), stoppedBody(pair.first, groupStops, 0),
        stoppedBody(pair.second, groupStops, 0), stoppedBody(pair.second, groupStops, 0));
      const end = sweepPopulationHulls(stoppedBody(pair.first, groupStops, 1), stoppedBody(pair.first, groupStops, 1),
        stoppedBody(pair.second, groupStops, 1), stoppedBody(pair.second, groupStops, 1));
      // Preserve the existing overlap-escape rule: do not arrest a pair that
      // began merged and has reduced that merge by the end of this transaction.
      // Nor one that only slides along its touching face with rigid support,
      // which the fixed-axis proof shows never deepens (R2C-5, 2026-10-04): a
      // walker stepping aside from a rider held against his back.
      const certified = pair.actorComponent && policy.certifiedInitialOverlap === 'continuous-proof';
      if (start?.initiallyOverlapping && (((!end || end.penetrationMetres < start.penetrationMetres - R.epsilon)
        && (!certified || continuousNonWorseningEscape(pair, groupStops) || directlyAwayEscape(pair, groupStops)))
        || (certified && continuousNonWorseningEscape(pair, groupStops)))) continue;
      const breaks = [cursor, ...[groupStops.get(pair.first.groupKey)!, groupStops.get(pair.second.groupKey)!]
        .filter(value => value > cursor + R.epsilon && value < 1 - R.epsilon), 1].sort((a, b) => a - b);
      let found: Swept | null = null;
      for (let index = 0; index < breaks.length - 1; index += 1) {
        if (breaks[index + 1] <= breaks[index] + R.epsilon) continue;
        found = sweepContinuous(pair.first, pair.second, groupStops, breaks[index], breaks[index + 1], workFor(pair.second.ownerId), total);
        if (found) break;
      }
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
  return { actorFractions, componentFractions, stopGroupFractions,
    hits: [...earliestByOwnerPair.values()].sort((a, b) => a.timeOfImpact - b.timeOfImpact
      || ownerPair(a.actorOwnerId, a.ownerId).localeCompare(ownerPair(b.actorOwnerId, b.ownerId))) };
}
