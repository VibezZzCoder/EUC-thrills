/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Shared living-world fixed-step movement, yield and physical contact owner.
 * One instance owns the world's fixed-step clock; presentation only reads it.
 */
import type { ActorKind, ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { clamp, lerp, wrapAngle } from '../shared/maths.ts';
import { createGroundSample, type TerrainSampler } from './world.ts';
import { populationSupportTargets, type PopulationGroundSupport } from '../shared/populationSupport.ts';
import { physicalPopulationHull, physicalPopulationPrism, transformPopulationHullLowerInto, type MutablePopulationHullCorner, type PopulationHullSource } from '../shared/populationHull.ts';
import { coarseActorMotionWorldAabb } from '../shared/occupancyBroadphase.ts';
export { physicalPopulationHull, transformPopulationHull } from '../shared/populationHull.ts';

import type { PopulationCompoundActorMotion, PopulationCompoundMotionBatch,
  PopulationCompoundTrajectory } from './populationCompound.ts';

import { compactAnticipationBlocker, type PopulationCompactAnticipation } from './populationCompactAnticipation.ts';
import { routeAnticipation, routeBrakingSpeedCap, type RouteAnticipationResult } from './populationRouteAnticipation.ts';
import { POPULATION } from '../data/tuning.ts';
export { POPULATION } from '../data/tuning.ts';
const R = POPULATION;
/**
 * Actors each waiting on the next round a loop never clear by waiting (POP-2:
 * pathmates meeting head-on stood nose to nose for the session). After this
 * many seconds one of them turns round as at a path end; `resolveMutualWaits`.
 */
const MUTUAL_WAIT_SECONDS = 1.5;
/** Path left behind an actor for a turn-round to be worth making, metres. */
const MUTUAL_TURN_ROOM_METRES = 0.5;
/** Progress that ends a stall: a waiting look flickers on and off at its edge. */
const MUTUAL_PROGRESS_METRES = 0.3;
/** One turned round this recently goes last, so a loop cannot turn the same actor back and forth, seconds. */
const MUTUAL_RECENT_TURN_SECONDS = 10;
/** `waitingOn` entry for a rider or cop body (R2C-5): a wait nobody else in the loop will resolve. */
const OCCUPANT_WAIT = -2;
/**
 * A rider in the way is plain at a glance: a walker steps aside for one
 * sooner than a pathmate loop turns round, seconds. A rider's push starts this
 * clock (R2C-5 review, 2026-10-04: the 1.2 s impact pause and then a full
 * mutual wait kept a pinned rider there for 2.3-3.3 s).
 */
const OCCUPANT_WAIT_SECONDS = 0.6;
/** The flinch an impact plays out where it stands before a pending step aside may start, seconds. */
const IMPACT_FLINCH_SECONDS = 0.4;
/**
 * A walker or jogger held up by a rider steps off the path (R2C-5,
 * 2026-10-04): far enough to walk past a stopped rider's body if there is
 * room, else far enough to let a moving one by; at this pace, onto ground no
 * more than a kerb's rise from the path's and clear of authored solids. Back
 * onto the path once the rider is clear of it; no room, and it turns round.
 */
const SIDESTEP_OFFSETS_METRES = [1.4, 1.0] as const;
const SIDESTEP_METRES_PER_SECOND = 1.1;
const SIDESTEP_MAXIMUM_RISE_METRES = 0.12;
const SIDESTEP_MINIMUM_NORMAL_Y = 0.94;
/** A rider pressed against a walker counts as in his way when travelling within 45 degrees of his path. */
const SIDESTEP_ALONG_PATH_COSINE = Math.SQRT1_2;
/** A step aside must leave the walker this far off the rider's way ahead, metres: a person and a rider side by side. */
const SIDESTEP_CLEAR_METRES = 0.9;
const SIDESTEP_GIVE_UP_SECONDS = 0.5;
/** Farther than this from every rider, a walker has no rider in its way (its look-ahead, both bodies and the gap), metres. */
const SIDESTEP_NEAR_METRES = 6;

export type PopulationActivity = 'walking' | 'jogging' | 'riding' | 'social' | 'working'
  | 'parked' | 'driving' | 'reversing' | 'waiting' | 'turning' | 'impacted';

/** A physical upright prism. Heading zero points along +Z, positive toward +X. */
export interface PopulationFootprint {
  readonly x: number;
  readonly z: number;
  readonly headingY: number;
  readonly halfWidthMetres: number;
  readonly halfLengthMetres: number;
  /** Absolute world heights, e.g. wheel bottom/top, not ground clearance. */
  readonly minY: number;
  readonly maxY: number;
  readonly velocityX: number;
  readonly velocityZ: number;
  readonly sourceHull?: PopulationHullSource;
}

/**
 * Include every active human and cop on every step. A footprint is physical,
 * never a render mesh, a camera position or an options object. Its height
 * interval must cover the actual rider/wheel part being protected.
 */
export interface PopulationOccupant {
  readonly id: string;
  readonly kind: 'human' | 'cop';
  readonly previous: PopulationFootprint;
  readonly current: PopulationFootprint;
  /** A recovery, reset or regroup must never cast a sweep across the world. */
  readonly teleported?: boolean;
  readonly reset?: boolean;
  /** Crashed and lying down at the start of this step; `recoveryClearance` ignores it. */
  readonly downed?: boolean;
}

/** Caller-owned active spawn/recovery space, on this population's clock. */
export interface PopulationReservation {
  readonly id: string;
  readonly footprint: PopulationFootprint;
  readonly expiresAtClockSeconds?: number;
}

export interface PopulationActorPose {
  readonly id: string;
  readonly kind: ActorKind;
  readonly appearanceIndex: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly headingY: number;
  readonly velocityX: number;
  readonly velocityZ: number;
  /** Signed negative for a service vehicle backing; zero for stationary activity. */
  readonly speedMetresPerSecond: number;
  readonly gaitDistanceMetres: number;
  /** Signed physical roll travel: service backing must unwind its tyre angle. */
  readonly wheelTravelMetres: number;
  readonly activity: PopulationActivity;
  readonly activityPhase: number;
  readonly activityBlend: number;
  readonly backing: boolean;
  readonly pathId: string;
  readonly distanceMetres: number;
  readonly direction: 1 | -1;
  readonly hull: ActorSpec['hull'];
  /** Conservative heading-frame prism around the exact grade-aligned local hull. */
  readonly footprint: PopulationFootprint;
  /** Finished ground at local hull corners: -X/-Z, -X/+Z, +X/-Z, +X/+Z. */
  readonly supportHeights: readonly [number, number, number, number];
  /** Finished ground at the actual sole/tread targets shared with the model. */
  readonly footSupports?: readonly [PopulationGroundSupport, PopulationGroundSupport];
  readonly tyreSupports?: readonly [PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport];
  readonly groundNormalX: number;
  readonly groundNormalY: number;
  readonly groundNormalZ: number;
  /** Render alignment from the same sampler, never a render-side ground query. */
  readonly groundPitch: number;
  readonly groundRoll: number;
}

export interface PopulationSnapshot {
  readonly tick: number;
  readonly clockSeconds: number;
  readonly actors: readonly PopulationActorPose[];
}

/** Caller-owned presentation storage contains no physical hull or live support record. */
export type PopulationPresentationPose = { -readonly [K in 'id' | 'kind' | 'x' | 'y' | 'z' | 'headingY'
  | 'speedMetresPerSecond' | 'gaitDistanceMetres' | 'wheelTravelMetres' | 'activity'
  | 'activityPhase' | 'activityBlend' | 'backing' | 'groundNormalX' | 'groundNormalY' | 'groundNormalZ']:
  PopulationActorPose[K] } & {
  footSupports?: [MutablePopulationGroundSupport, MutablePopulationGroundSupport];
  tyreSupports?: [MutablePopulationGroundSupport, MutablePopulationGroundSupport,
    MutablePopulationGroundSupport, MutablePopulationGroundSupport];
};
type MutablePopulationGroundSupport = { -readonly [K in keyof PopulationGroundSupport]: PopulationGroundSupport[K] };
export interface PopulationPresentationSnapshot {
  tick: number;
  clockSeconds: number;
  actors: PopulationPresentationPose[];
}
export const createPopulationPresentationSnapshot = (): PopulationPresentationSnapshot => ({ tick: 0, clockSeconds: 0, actors: [] });

/** Geometry-only sweep result, with normal from the first hull toward the second. */
export interface PopulationHullContact {
  readonly timeOfImpact: number;
  readonly normalX: number;
  readonly normalZ: number;
  readonly penetrationMetres: number;
  readonly initiallyOverlapping: boolean;
  readonly currentlyOverlapping: boolean;
}

/**
 * Separation is continuous; charge is an entry event. A high-speed sweep must
 * be stopped at impact before the caller publishes its current rider pose.
 */
export interface PopulationContact extends PopulationHullContact {
  readonly componentId?: string;
  readonly componentFootprint?: PopulationFootprint;
  readonly actorId: string;
  readonly actorKind: ActorKind;
  readonly occupantId: string;
  readonly occupantKind: PopulationOccupant['kind'];
  readonly charge: boolean;
  readonly relativeSpeedMetresPerSecond: number;
  readonly closingSpeedMetresPerSecond: number;
  readonly impactX: number;
  readonly impactZ: number;
  /** One minimum rollback, applied atomically inside the fixed step, before interpolation. */
  readonly allowedMoveFraction: number;
  readonly sweepCorrectionX: number;
  readonly sweepCorrectionZ: number;
  /** Rate-limited overlap recovery for a pair which started already merged. */
  readonly separationX: number;
  readonly separationZ: number;
}

export interface PopulationClearance {
  readonly clear: boolean;
  readonly actorIds: readonly string[];
  readonly occupantIds: readonly string[];
  readonly reservationIds: readonly string[];
}

/** Read-only movement gate. Event history is consumed by queryContacts once. */
export interface PopulationMotionPreview extends PopulationHullContact {
  readonly actorId: string;
  readonly allowedMoveFraction: number;
  readonly closingSpeedMetresPerSecond: number;
  readonly chargeImpact: boolean;
}

export interface PopulationActorMotion {
  readonly id: string;
  readonly previous: PopulationFootprint;
  readonly current: PopulationFootprint;
}
/** Immutable issued actor candidates for one uncommitted publication epoch. */
export interface PopulationActorMotionCensus {
  readonly tick: number;
  readonly actors: readonly PopulationActorMotion[];
}

export interface PopulationBatchHit extends PopulationHullContact {
  /** Physical component evidence, present only for compound transactions. */
  readonly componentId?: string;
  readonly componentFootprint?: PopulationFootprint;
  readonly actorId: string;
  readonly occupantId: string;
  readonly actorVelocityX: number;
  readonly actorVelocityZ: number;
  readonly occupantVelocityX: number;
  readonly occupantVelocityZ: number;
}

/** Absolute tick prefixes. A stopped body holds its position for the rest of the tick. */
export interface PopulationMotionBatch {
  readonly actorFractions: Readonly<Record<string, number>>;
  readonly occupantFractions: Readonly<Record<string, number>>;
  readonly hits: readonly PopulationBatchHit[];
}

export interface PopulationPhysicalComponent {
  readonly componentId: string;
  readonly footprint: PopulationFootprint;
}
export type PopulationPhysicalFinalByOwner = Readonly<Record<string, readonly PopulationPhysicalComponent[]>>;
export interface PopulationComponentImpact {
  readonly actorId: string;
  readonly occupantId: string;
  readonly componentId: string;
  readonly footprint: PopulationFootprint;
}
export type PopulationCompoundResolver = (actors: readonly PopulationCompoundActorMotion[],
  components: readonly PopulationCompoundTrajectory[]) => PopulationCompoundMotionBatch;
export interface PopulationCompoundPrepareOptions {
  /** Exact census already used by the native transaction's resolver. */
  readonly actorCensus?: PopulationActorMotionCensus;
  /** Actual owner commit decision, e.g. zero for whole-step refusal. */
  readonly ownerFractions?: Readonly<Record<string, number>>;
  /** Accepted immutable physical endpoints, overriding descriptor stop points. */
  readonly physicalFinalByOwner?: PopulationPhysicalFinalByOwner;
  /** Composition-root proof that the original full actor paths exclude these owners. */
  readonly coarseExcludedOwnerIds?: readonly string[];
}

export interface PopulationPreparedContacts extends PopulationMotionBatch {
  readonly tick: number;
  readonly intents: readonly PopulationOccupant[];
  readonly physicalFinalByOwner?: PopulationPhysicalFinalByOwner;
  readonly componentImpacts?: readonly PopulationComponentImpact[];
}

interface StaticContact { gap: number; normalX: number; normalZ: number }
/** `apart`: seconds since the pair last met. A meeting resumed inside
 * `CONTACT_REARM_SECONDS` is the same meeting (R2C-5, 2026-10-04): a rider
 * pushing into someone alternates held and admitted steps, and recharged the
 * impact pause every cooldown, so the person flinched on a loop. */
interface PairState { cooldown: number; overlapping: boolean; apart: number }
const CONTACT_REARM_SECONDS = 0.25;
interface PreparedPath { path: PopulationPath }
interface ActorState {
  spec: ActorSpec;
  path: PreparedPath;
  distance: number;
  direction: 1 | -1;
  speed: number;
  heading: number;
  gaitDistance: number;
  wheelTravel: number;
  pause: number;
  turning: boolean;
  workerLeg: 'work' | 'outbound' | 'return';
  workerAnchor: number;
  workerTarget: number;
  impactUntil: number;
  waiting: boolean;
  /** Indices of the other actors this step's look-ahead waited on (reused). */
  waitingOn: number[];
  /** The actor this one has stalled behind (-1 none), for how long, and the gait it stalled at. */
  blockedBy: number;
  blockedSeconds: number;
  blockedGait: number;
  /** The clock when a mutual wait last turned this actor round; see `resolveMutualWaits`. */
  turnedAt: number;
  /** Metres off the path to its left (its frame), where it is headed, and at the step's start (`SIDESTEP_*`). */
  aside: number;
  asideTarget: number;
  stepStartAside: number;
  /** Seconds a step aside has made no headway; past `SIDESTEP_GIVE_UP_SECONDS` it is dropped. */
  asideStalled: number;
  pose: PopulationActorPose;
  previousDistance: number;
  stepTravel: number;
  stepGaitStart: number;
  stepWheelStart: number;
  stepStartDirection: 1 | -1;
  stepStartPause: number;
  stepStartTurning: boolean;
  stepStartWorkerLeg: ActorState['workerLeg'];
}

const finite = (...values: number[]): boolean => values.every(Number.isFinite);
type MotionBounds = ReturnType<typeof coarseActorMotionWorldAabb> | null;
interface BoundedMotion {
  readonly from: PopulationFootprint;
  readonly to: PopulationFootprint;
  readonly bounds: MotionBounds;
  nativeFraction?: number;
  nativeTo?: PopulationFootprint;
}
/** Unknown/malformed source frames retain the original narrow-phase behavior.
 * Explicit Number.isFinite chains: these run for every bounded motion per step. */
function boundableFootprint(body: PopulationFootprint): boolean {
  if (!(Number.isFinite(body.x) && Number.isFinite(body.z) && Number.isFinite(body.headingY)
    && Number.isFinite(body.minY) && Number.isFinite(body.maxY) && Number.isFinite(body.halfWidthMetres)
    && Number.isFinite(body.halfLengthMetres) && Number.isFinite(body.velocityX) && Number.isFinite(body.velocityZ))
    || body.maxY <= body.minY || body.halfWidthMetres <= 0 || body.halfLengthMetres <= 0) return false;
  const source = body.sourceHull;
  if (!source) return true;
  if (!source.hull) return false;
  const margin = source.marginMetres ?? 0, below = source.verticalPaddingBelowMetres ?? 0;
  const above = source.verticalPaddingAboveMetres ?? 0, hull = source.hull;
  return Number.isFinite(source.x) && Number.isFinite(source.y) && Number.isFinite(source.z)
    && Number.isFinite(source.headingY) && Number.isFinite(source.normalX) && Number.isFinite(source.normalY)
    && Number.isFinite(source.normalZ) && Number.isFinite(hull.halfWidthMetres) && Number.isFinite(hull.halfLengthMetres)
    && Number.isFinite(hull.heightMetres) && Number.isFinite(margin) && Number.isFinite(below) && Number.isFinite(above)
    && source.normalY > 0 && hull.halfWidthMetres > 0 && hull.halfLengthMetres > 0 && hull.heightMetres > 0
    && margin >= 0 && below >= 0 && above >= 0;
}
function motionBounds(from: PopulationFootprint, to: PopulationFootprint): MotionBounds {
  if (!boundableFootprint(from) || !boundableFootprint(to)) return null;
  // The coarse box is freshly owned here; it is padded in place.
  const bounds = coarseActorMotionWorldAabb(from, to) as { -readonly [K in keyof NonNullable<MotionBounds>]: number };
  const padding = R.contactSkinMetres + R.epsilon;
  if (!(Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minY)
    && Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minZ) && Number.isFinite(bounds.maxZ))) return null;
  bounds.minX = bounds.minX - padding; bounds.maxX = bounds.maxX + padding;
  bounds.minY = bounds.minY - padding; bounds.maxY = bounds.maxY + padding;
  bounds.minZ = bounds.minZ - padding; bounds.maxZ = bounds.maxZ + padding;
  return bounds;
}
function mayMeet(first: MotionBounds, second: MotionBounds): boolean {
  return !first || !second || (first.minX <= second.maxX && first.maxX >= second.minX
    && first.minY <= second.maxY && first.maxY >= second.minY
    && first.minZ <= second.maxZ && first.maxZ >= second.minZ);
}
const boundedMotion = (from: PopulationFootprint, to: PopulationFootprint): BoundedMotion =>
  ({ from, to, bounds: motionBounds(from, to) });
const sortId = (a: { id: string }, b: { id: string }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const vehicle = (kind: ActorKind): boolean => kind === 'parkedVehicle'
  || kind === 'serviceVehicle' || kind === 'trafficVehicle';
/** People small enough to turn on the spot through a rider touching them (R2C-5). */
const turnsThroughRiders = (kind: ActorKind): boolean => kind === 'walker' || kind === 'jogger';
const fract = (value: number): number => value - Math.floor(value);
/**
 * A body's support along an axis. Its heading frame is {cos, -sin}, {sin, cos}
 * (the SAT axes below); callers pass that cosine/sine instead of allocating it,
 * and the products and sums are the same in the same order.
 */
const supportAt = (c: number, s: number, halfWidth: number, halfLength: number, axisX: number, axisZ: number): number =>
  Math.abs(c * axisX + -s * axisZ) * halfWidth + Math.abs(s * axisX + c * axisZ) * halfLength;
/** mixBody(a, b, t).headingY without rebuilding the hull: the same expression on the same inputs. */
function mixedHeading(a: PopulationFootprint, b: PopulationFootprint, t: number): number {
  if (a.sourceHull && b.sourceHull) return a.sourceHull.headingY + wrapAngle(b.sourceHull.headingY - a.sourceHull.headingY) * t;
  return a.headingY + wrapAngle(b.headingY - a.headingY) * t;
}
const grow = (body: PopulationFootprint, margin: number): PopulationFootprint => ({
  ...body, halfWidthMetres: body.halfWidthMetres + margin,
  halfLengthMetres: body.halfLengthMetres + margin,
  ...(body.sourceHull ? { sourceHull: { ...body.sourceHull,
    marginMetres: (body.sourceHull.marginMetres ?? 0) + margin } } : {}),
});

function orientationTravel(a: PopulationFootprint, b: PopulationFootprint): number {
  let angle = Math.abs(wrapAngle(b.headingY - a.headingY));
  if (a.sourceHull && b.sourceHull) {
    const first = a.sourceHull, last = b.sourceHull;
    angle += Math.acos(clamp(first.normalX * last.normalX + first.normalY * last.normalY
      + first.normalZ * last.normalZ, -1, 1));
  }
  return angle;
}
function rotationRadius(body: PopulationFootprint): number {
  return body.sourceHull ? Math.hypot(body.sourceHull.hull.halfWidthMetres,
    body.sourceHull.hull.halfLengthMetres, body.sourceHull.hull.heightMetres)
    + (body.sourceHull.marginMetres ?? 0) : Math.hypot(body.halfWidthMetres, body.halfLengthMetres);
}
function predictBody(body: PopulationFootprint, seconds: number): PopulationFootprint {
  const dx = body.velocityX * seconds, dz = body.velocityZ * seconds;
  return { ...body, x: body.x + dx, z: body.z + dz,
    ...(body.sourceHull ? { sourceHull: { ...body.sourceHull,
      x: body.sourceHull.x + dx, z: body.sourceHull.z + dz } } : {}) };
}

function assertFootprint(body: PopulationFootprint): void {
  if (!finite(body.x, body.z, body.headingY, body.minY, body.maxY,
    body.halfWidthMetres, body.halfLengthMetres, body.velocityX, body.velocityZ)
    || body.maxY <= body.minY || body.halfWidthMetres <= 0 || body.halfLengthMetres <= 0) {
    throw new RangeError('Population footprint must be a finite positive physical prism');
  }
}

function mixBody(a: PopulationFootprint, b: PopulationFootprint, t: number): PopulationFootprint {
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
    // The padded body and its grow(margin), built as one object: the same
    // fields, sums and key order without the intermediate copies (PERF-R2-2).
    const source = mixed.sourceHull!;
    return { ...mixed, minY: mixed.minY - below, maxY: mixed.maxY + above,
      halfWidthMetres: mixed.halfWidthMetres + margin, halfLengthMetres: mixed.halfLengthMetres + margin,
      sourceHull: { ...source, verticalPaddingBelowMetres: below, verticalPaddingAboveMetres: above,
        marginMetres: (source.marginMetres ?? 0) + margin } };
  }
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t),
    headingY: a.headingY + wrapAngle(b.headingY - a.headingY) * t,
    halfWidthMetres: lerp(a.halfWidthMetres, b.halfWidthMetres, t),
    halfLengthMetres: lerp(a.halfLengthMetres, b.halfLengthMetres, t),
    minY: lerp(a.minY, b.minY, t), maxY: lerp(a.maxY, b.maxY, t),
    velocityX: lerp(a.velocityX, b.velocityX, t), velocityZ: lerp(a.velocityZ, b.velocityZ, t) };
}

/** Exact horizontal OBB SAT. Bounding radii never decide contact. */
function staticContact(first: PopulationFootprint, second: PopulationFootprint): StaticContact | null {
  if (first.maxY < second.minY - R.epsilon || second.maxY < first.minY - R.epsilon) return null;
  let gap = -Infinity, normalX = 1, normalZ = 0;
  const c1 = Math.cos(first.headingY), s1 = Math.sin(first.headingY);
  const c2 = Math.cos(second.headingY), s2 = Math.sin(second.headingY);
  // The first body's two frame axes, then the second's.
  for (let index = 0; index < 4; index += 1) {
    const c = index < 2 ? c1 : c2, s = index < 2 ? s1 : s2, along = (index & 1) === 1;
    const axisX = along ? s : c, axisZ = along ? c : -s;
    const projection = (second.x - first.x) * axisX + (second.z - first.z) * axisZ;
    const nextGap = Math.abs(projection) - supportAt(c1, s1, first.halfWidthMetres, first.halfLengthMetres, axisX, axisZ)
      - supportAt(c2, s2, second.halfWidthMetres, second.halfLengthMetres, axisX, axisZ);
    if (nextGap > gap) {
      const relative = (second.velocityX - first.velocityX) * axisX
        + (second.velocityZ - first.velocityZ) * axisZ;
      const sign = Math.abs(projection) > R.epsilon ? Math.sign(projection) : relative > 0 ? -1 : 1;
      gap = nextGap; normalX = axisX * sign + 0; normalZ = axisZ * sign + 0;
    }
  }
  return { gap, normalX, normalZ };
}

interface Window { enter: number; exit: number }
/** Intersect with the continuous linear inequality first + delta*t <= 0. */
function restrictWindow(window: Window, first: number, last: number): boolean {
  const delta = last - first;
  if (Math.abs(delta) <= R.epsilon) return first <= R.epsilon;
  const crossing = -first / delta;
  if (delta < 0) window.enter = Math.max(window.enter, crossing);
  else window.exit = Math.min(window.exit, crossing);
  return window.enter <= window.exit + R.epsilon;
}

/**
 * Exact swept SAT at fixed yaw. For rotating intervals it is a conservative
 * pruning bound at mid yaw, grown only by the proven corner travel on that
 * interval. Recursive refinement reduces that growth to contactSkinMetres.
 */
function linearWindow(a0: PopulationFootprint, a1: PopulationFootprint,
  b0: PopulationFootprint, b1: PopulationFootprint, rotationBound: boolean): Window | null {
  // Only the mid-yaw is read from each mid body, so it is mixed alone.
  const aMidHeading = mixedHeading(a0, a1, 0.5), bMidHeading = mixedHeading(b0, b1, 0.5);
  const aAngle = orientationTravel(a0, a1), bAngle = orientationTravel(b0, b1);
  // Source hulls also tilt and recenter. A whole corner-travel bound covers
  // both the support change and nonlinear centre shift between the endpoints.
  const aPad = rotationBound ? Math.max(rotationRadius(a0), rotationRadius(a1)) * aAngle * (a0.sourceHull ? 1 : 0.5) : 0;
  const bPad = rotationBound ? Math.max(rotationRadius(b0), rotationRadius(b1)) * bAngle * (b0.sourceHull ? 1 : 0.5) : 0;
  const window: Window = { enter: 0, exit: 1 };
  const ca = Math.cos(aMidHeading), sa = Math.sin(aMidHeading), cb = Math.cos(bMidHeading), sb = Math.sin(bMidHeading);
  for (let index = 0; index < 4; index += 1) {
    const c = index < 2 ? ca : cb, s = index < 2 ? sa : sb, along = (index & 1) === 1;
    const axisX = along ? s : c, axisZ = along ? c : -s;
    const start = (b0.x - a0.x) * axisX + (b0.z - a0.z) * axisZ;
    const end = (b1.x - a1.x) * axisX + (b1.z - a1.z) * axisZ;
    // Width/length may interpolate as the caller changes pose. Mid-yaw is
    // fixed here; radius then varies linearly, keeping the slab exact.
    const startRadius = supportAt(ca, sa, a0.halfWidthMetres, a0.halfLengthMetres, axisX, axisZ)
      + supportAt(cb, sb, b0.halfWidthMetres, b0.halfLengthMetres, axisX, axisZ) + aPad + bPad;
    const endRadius = supportAt(ca, sa, a1.halfWidthMetres, a1.halfLengthMetres, axisX, axisZ)
      + supportAt(cb, sb, b1.halfWidthMetres, b1.halfLengthMetres, axisX, axisZ) + aPad + bPad;
    if (!restrictWindow(window, start - startRadius, end - endRadius)
      || !restrictWindow(window, -start - startRadius, -end - endRadius)) return null;
  }
  const verticalPad = aPad + bPad;
  if (!restrictWindow(window, b0.minY - a0.maxY - verticalPad, b1.minY - a1.maxY - verticalPad)
    || !restrictWindow(window, a0.minY - b0.maxY - verticalPad, a1.minY - b1.maxY - verticalPad)) return null;
  return window.exit < 0 || window.enter > 1 ? null
    : { enter: clamp(window.enter, 0, 1), exit: clamp(window.exit, 0, 1) };
}

/**
 * Continuous moving/rotating oriented-prism sweep, including linear height
 * intervals. No high-speed endpoint-only test and no vehicle collision circle.
 * Rotational contact is conservative only within the millimetre contact skin.
 */
export function sweepPopulationHulls(a0: PopulationFootprint, a1: PopulationFootprint,
  b0: PopulationFootprint, b1: PopulationFootprint): PopulationHullContact | null {
  const start = staticContact(a0, b0);
  const initiallyOverlapping = start !== null && start.gap < -R.epsilon;
  // A recursive child's endpoint is exactly its parent's endpoint or the same
  // original-track midpoint. Carry those values rather than rebuilding hulls.
  const firstA = mixBody(a0, a1, 0), lastA = mixBody(a0, a1, 1);
  const firstB = mixBody(b0, b1, 0), lastB = mixBody(b0, b1, 1);
  function search(low: number, high: number, depth: number, firstA: PopulationFootprint,
    lastA: PopulationFootprint, firstB: PopulationFootprint, lastB: PopulationFootprint): number | null {
    const angleA = orientationTravel(firstA, lastA), angleB = orientationTravel(firstB, lastB);
    const rotating = angleA > R.epsilon || angleB > R.epsilon;
    const window = linearWindow(firstA, lastA, firstB, lastB, rotating);
    if (!window) return null;
    const angularTravel = rotationRadius(firstA) * angleA + rotationRadius(firstB) * angleB;
    if (!rotating || (angularTravel <= R.contactSkinMetres
      && angleA + angleB <= R.sweepAngularToleranceRadians)
      || depth >= R.sweepMaximumSubdivisionDepth) {
      return lerp(low, high, window.enter);
    }
    const mid = (low + high) * 0.5;
    const middleA = mixBody(a0, a1, mid), middleB = mixBody(b0, b1, mid);
    return search(low, mid, depth + 1, firstA, middleA, firstB, middleB)
      ?? search(mid, high, depth + 1, middleA, lastA, middleB, lastB);
  }
  const time = search(0, 1, 0, firstA, lastA, firstB, lastB);
  if (time === null) return null;
  const firstImpact = time === 0 ? firstA : time === 1 ? lastA : mixBody(a0, a1, time);
  const secondImpact = time === 0 ? firstB : time === 1 ? lastB : mixBody(b0, b1, time);
  const atImpact = staticContact({ ...firstImpact, minY: firstImpact.minY - R.contactSkinMetres,
    maxY: firstImpact.maxY + R.contactSkinMetres }, secondImpact);
  if (!atImpact) return null;
  const end = staticContact(a1, b1);
  const currentlyOverlapping = end !== null && end.gap <= R.epsilon;
  const normal = initiallyOverlapping && currentlyOverlapping ? end! : atImpact;
  return { timeOfImpact: time, normalX: normal.normalX, normalZ: normal.normalZ,
    penetrationMetres: end ? Math.max(0, -end.gap) : 0, initiallyOverlapping, currentlyOverlapping };
}

/**
 * Chronological physical transaction. Re-search after every stop: shortening
 * an endpoint and sweeping it over a whole tick changes the body's speed and
 * can manufacture a collision on a discarded suffix. These trajectories keep
 * their original time parameter, then hold at their absolute stop time.
 */
export function resolvePopulationMotionBatch(actors: readonly PopulationActorMotion[],
  occupants: readonly PopulationOccupant[]): PopulationMotionBatch {
  type Motion = PopulationActorMotion & { type: 'actor' | 'occupant'; stop: number; distance: number };
  const motions: Motion[] = [
    ...actors.map(value => ({ ...value, type: 'actor' as const })),
    ...occupants.filter(value => !value.teleported && !value.reset)
      .map(value => ({ ...value, type: 'occupant' as const })),
  ].map(value => ({ ...value, stop: 1,
    distance: Math.hypot(value.current.x - value.previous.x, value.current.z - value.previous.z)
      + rotationRadius(value.previous) * orientationTravel(value.previous, value.current) }));
  motions.sort((a,b) => `${a.type}/${a.id}`.localeCompare(`${b.type}/${b.id}`));
  const identities = new Set<string>();
  for (const value of motions) {
    assertFootprint(value.previous); assertFootprint(value.current);
    const key = `${value.type}/${value.id}`;
    if (!value.id || identities.has(key)) throw new Error('Physical transaction needs distinct bodies');
    identities.add(key);
  }
  const at = (motion: Motion, time: number): PopulationFootprint => {
    const body = mixBody(motion.previous, motion.current, Math.min(time, motion.stop));
    return time > motion.stop + R.epsilon ? { ...body, velocityX: 0, velocityZ: 0 } : body;
  };
  const pairs: { a: Motion; b: Motion; key: string }[] = [];
  for (let i=0;i<motions.length;i++) for (let j=i+1;j<motions.length;j++) {
    const a=motions[i],b=motions[j];
    if (a.type === 'occupant' && b.type === 'occupant') continue;
    pairs.push({a,b,key:`${a.type}/${a.id}|${b.type}/${b.id}`});
  }
  const visited = new Set<string>(), hits: PopulationBatchHit[] = [];
  let cursor=0;
  // Each accepted event consumes a pair, including stationary initial
  // overlaps. Moving participants can stop only once; no iterative pushes.
  for(let iteration=0;iteration<pairs.length;iteration++) {
    let earliest=Infinity;
    const candidates: { pair: typeof pairs[number]; hit: PopulationHullContact; time: number }[]=[];
    for(const pair of pairs) {
      if(visited.has(pair.key)) continue;
      const {a,b}=pair;
      const start=staticContact(a.previous,b.previous);
      const end=staticContact(at(a,1),at(b,1));
      // Keep the existing overlap escape contract. A departing body must be
      // allowed to separate rather than be arrested inside the old overlap.
      if(start && start.gap < -R.epsilon && (end?.gap ?? Infinity)>start.gap+R.epsilon) continue;
      const breaks=[cursor,...[a.stop,b.stop].filter(t=>t>cursor+R.epsilon&&t<1-R.epsilon),1]
        .sort((x,y)=>x-y);
      let found: {hit: PopulationHullContact;time:number}|undefined;
      for(let k=0;k<breaks.length-1;k++) {
        const low=breaks[k],high=breaks[k+1];
        if(high<=low+R.epsilon)continue;
        const hit=sweepPopulationHulls(at(a,low),at(a,high),at(b,low),at(b,high));
        if(hit){found={hit,time:lerp(low,high,hit.timeOfImpact)};break;}
      }
      if(!found)continue;
      if(found.time<earliest-R.epsilon){earliest=found.time;candidates.length=0;}
      if(found.time<=earliest+R.epsilon)candidates.push({pair,...found});
    }
    if(!Number.isFinite(earliest))break;
    // All simultaneous contacts read the same pre-stop velocities. Stable
    // pair ordering makes connected ties independent of caller/seat order.
    const freeze=new Map<Motion,number>();
    for(const {pair,hit,time} of candidates) {
      const {a,b}=pair; visited.add(pair.key);
      if(a.type!==b.type) {
        const actor=a.type==='actor'?a:b,person=a.type==='occupant'?a:b;
        const actorAt=at(actor,time),personAt=at(person,time);
        const sign=a.type==='actor'?1:-1;
        const original=staticContact(actor.previous,person.previous);
        hits.push({...hit,timeOfImpact:time,normalX:hit.normalX*sign,normalZ:hit.normalZ*sign,
          initiallyOverlapping:original!==null&&original.gap < -R.epsilon,
          actorId:actor.id,occupantId:person.id,
          actorVelocityX:actorAt.velocityX,actorVelocityZ:actorAt.velocityZ,
          occupantVelocityX:personAt.velocityX,occupantVelocityZ:personAt.velocityZ});
      }
      for(const motion of [a,b]) {
        if(motion.distance<=R.epsilon||motion.stop<=cursor+R.epsilon)continue;
        const stop=Math.max(cursor,time-R.contactSkinMetres/Math.max(motion.distance,R.contactSkinMetres));
        freeze.set(motion,Math.min(freeze.get(motion)??motion.stop,stop));
      }
    }
    for(const [motion,stop]of freeze)motion.stop=Math.min(motion.stop,stop);
    cursor=earliest;
    if(cursor>=1-R.epsilon)break;
  }
  const actorFractions:Record<string,number>={},occupantFractions:Record<string,number>={};
  for(const motion of motions)(motion.type==='actor'?actorFractions:occupantFractions)[motion.id]=motion.stop;
  return {actorFractions,occupantFractions,hits};
}

function pathPoint(path: PopulationPath, along: number): { x: number; z: number; headingY: number } {
  const distance = clamp(along, 0, path.lengthMetres);
  let low = 0, high = path.points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (path.points[mid].distanceMetres <= distance) low = mid; else high = mid;
  }
  const a = path.points[low], b = path.points[high];
  const t = b.distanceMetres > a.distanceMetres ? (distance - a.distanceMetres)
    / (b.distanceMetres - a.distanceMetres) : 0;
  return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t),
    headingY: a.headingY + wrapAngle(b.headingY - a.headingY) * t };
}

function actorFootprint(pose: PopulationActorPose): PopulationFootprint {
  return { ...pose.footprint };
}

/** Deep detached plain footprint; callbacks and published rows own no live hull. */
function detachedFootprint(body: PopulationFootprint): PopulationFootprint {
  return { ...body, ...(body.sourceHull ? { sourceHull: { ...body.sourceHull,
    hull: { ...body.sourceHull.hull } } } : {}) };
}

const copyPose = (pose: PopulationActorPose): PopulationActorPose => ({ ...pose, hull: { ...pose.hull },
  footprint: { ...pose.footprint, ...(pose.footprint.sourceHull
    ? { sourceHull: { ...pose.footprint.sourceHull, hull: { ...pose.footprint.sourceHull.hull } } } : {}) },
  supportHeights: [...pose.supportHeights],
  ...(pose.footSupports ? { footSupports: pose.footSupports.map(value => ({ ...value })) as
    [PopulationGroundSupport, PopulationGroundSupport] } : {}),
  ...(pose.tyreSupports ? { tyreSupports: pose.tyreSupports.map(value => ({ ...value })) as
    [PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport] } : {}) });
/** One endpoint-linear physical/presentation pose; source hulls rebuild through the same mixer as CCD. */
export function mixActorPose(before: PopulationActorPose, pose: PopulationActorPose, t: number): PopulationActorPose {
  const support = (a: PopulationGroundSupport, b: PopulationGroundSupport): PopulationGroundSupport => ({
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
    normalX: lerp(a.normalX, b.normalX, t), normalY: lerp(a.normalY, b.normalY, t),
    normalZ: lerp(a.normalZ, b.normalZ, t) });
  const x = lerp(before.x, pose.x, t), y = lerp(before.y, pose.y, t), z = lerp(before.z, pose.z, t);
  const headingY = before.headingY + wrapAngle(pose.headingY - before.headingY) * t;
  const footprint = mixBody(before.footprint, pose.footprint, t);
  // A prior bounded prefix normal has already been normalized by the hull
  // transform. A second raw pose-normal blend can then carry a different
  // grade than CCD. Partial physical poses take the accepted source frame.
  const rawX = lerp(before.groundNormalX, pose.groundNormalX, t);
  const rawY = lerp(before.groundNormalY, pose.groundNormalY, t);
  const rawZ = lerp(before.groundNormalZ, pose.groundNormalZ, t);
  const source = footprint.sourceHull;
  const frame = t > 0 && t < 1 && source
    && (source.normalX !== rawX || source.normalY !== rawY || source.normalZ !== rawZ) ? source : undefined;
  const nx = frame?.normalX ?? rawX, ny = frame?.normalY ?? rawY, nz = frame?.normalZ ?? rawZ;
  const sin = Math.sin(headingY), cos = Math.cos(headingY);
  return { ...copyPose(pose), x, y, z, headingY,
    velocityX: lerp(before.velocityX, pose.velocityX, t), velocityZ: lerp(before.velocityZ, pose.velocityZ, t),
    speedMetresPerSecond: lerp(before.speedMetresPerSecond, pose.speedMetresPerSecond, t),
    gaitDistanceMetres: lerp(before.gaitDistanceMetres, pose.gaitDistanceMetres, t),
    wheelTravelMetres: lerp(before.wheelTravelMetres, pose.wheelTravelMetres, t),
    activityPhase: pose.activityPhase,
    activityBlend: lerp(before.activityBlend, pose.activityBlend, t),
    footprint,
    supportHeights: before.supportHeights.map((height, j) => lerp(height, pose.supportHeights[j], t)) as [number, number, number, number],
    ...(pose.footSupports && before.footSupports ? { footSupports: pose.footSupports.map((value, j) =>
      support(before.footSupports![j], value)) as [PopulationGroundSupport, PopulationGroundSupport] } : {}),
    ...(pose.tyreSupports && before.tyreSupports ? { tyreSupports: pose.tyreSupports.map((value, j) =>
      support(before.tyreSupports![j], value)) as [PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport] } : {}),
    groundNormalX: nx, groundNormalY: ny, groundNormalZ: nz,
    groundPitch: frame ? Math.atan2(-(nx * sin + nz * cos), ny) : lerp(before.groundPitch, pose.groundPitch, t),
    groundRoll: frame ? Math.atan2(-(nx * cos - nz * sin), ny) : lerp(before.groundRoll, pose.groundRoll, t) };
}

const copySnapshot = (snapshot: PopulationSnapshot): PopulationSnapshot => ({
  tick: snapshot.tick, clockSeconds: snapshot.clockSeconds, actors: snapshot.actors.map(copyPose),
});
function writePresentationSupports(input: readonly PopulationGroundSupport[] | undefined,
  output: MutablePopulationGroundSupport[] | undefined): MutablePopulationGroundSupport[] | undefined {
  if (!input) return undefined;
  const supports = output ?? [];
  supports.length = input.length;
  for (let index = 0; index < input.length; index += 1) {
    const source = input[index], target = supports[index] ?? (supports[index] = {
      x: 0, y: 0, z: 0, normalX: 0, normalY: 1, normalZ: 0,
    });
    target.x = source.x; target.y = source.y; target.z = source.z;
    target.normalX = source.normalX; target.normalY = source.normalY; target.normalZ = source.normalZ;
  }
  return supports;
}
function writePresentationSnapshot(input: PopulationSnapshot, output: PopulationPresentationSnapshot): void {
  output.tick = input.tick; output.clockSeconds = input.clockSeconds;
  output.actors.length = input.actors.length;
  for (let index = 0; index < input.actors.length; index += 1) {
    const source = input.actors[index], target = output.actors[index] ?? (output.actors[index] = {
      id: source.id, kind: source.kind, x: 0, y: 0, z: 0, headingY: 0,
      speedMetresPerSecond: 0, gaitDistanceMetres: 0, wheelTravelMetres: 0,
      activity: 'waiting', activityPhase: 0, activityBlend: 0, backing: false,
      groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0,
    });
    target.id = source.id; target.kind = source.kind;
    target.x = source.x; target.y = source.y; target.z = source.z; target.headingY = source.headingY;
    target.speedMetresPerSecond = source.speedMetresPerSecond;
    target.gaitDistanceMetres = source.gaitDistanceMetres; target.wheelTravelMetres = source.wheelTravelMetres;
    target.activity = source.activity; target.activityPhase = source.activityPhase;
    target.activityBlend = source.activityBlend; target.backing = source.backing;
    target.groundNormalX = source.groundNormalX; target.groundNormalY = source.groundNormalY;
    target.groundNormalZ = source.groundNormalZ;
    target.footSupports = writePresentationSupports(source.footSupports, target.footSupports) as PopulationPresentationPose['footSupports'];
    target.tyreSupports = writePresentationSupports(source.tyreSupports, target.tyreSupports) as PopulationPresentationPose['tyreSupports'];
  }
}
const copyContacts = (contacts: readonly PopulationContact[]): readonly PopulationContact[] => contacts.map(value => ({ ...value,
  ...(value.componentFootprint ? { componentFootprint: detachedFootprint(value.componentFootprint) } : {}) }));

/** Activity is independent of an already sealed physical/support footprint. */
function actorActivity(state: ActorState, clock: number, signedSpeed: number): Pick<PopulationActorPose,
  'activity' | 'activityPhase' | 'activityBlend'> {
  const { spec } = state;
  const impacted = state.impactUntil > clock;
  const activity: PopulationActivity = impacted ? 'impacted'
    : spec.kind === 'social' ? 'social' : spec.kind === 'parkedVehicle' ? 'parked'
      : spec.kind === 'worker' && state.workerLeg === 'work' ? 'working'
        : state.turning && state.pause <= 0 ? 'turning'
          : state.pause > 0 || state.waiting || Math.abs(signedSpeed) <= R.epsilon ? 'waiting'
            : spec.kind === 'jogger' ? 'jogging' : spec.kind === 'fictionalEuc' ? 'riding'
              : vehicle(spec.kind) ? state.direction === -1 ? 'reversing' : 'driving' : 'walking';
  const activityPhase = activity === 'working' || activity === 'waiting'
    ? spec.idleSeconds > 0 ? clamp(1 - state.pause / spec.idleSeconds, 0, 1) : 0
    : activity === 'social' ? fract(clock / Math.max(spec.idleSeconds, R.maximumStepSeconds))
      : activity === 'impacted' ? clamp(1 - (state.impactUntil - clock) / R.impactPauseSeconds, 0, 1)
        : fract(state.gaitDistance);
  return { activity, activityPhase, activityBlend: spec.kind === 'social' || activity === 'working' ? 1
    : spec.speedMetresPerSecond > 0 ? clamp(Math.abs(signedSpeed) / spec.speedMetresPerSecond, 0, 1) : 0 };
}

/** A crossing's corner extents, fixed once per plan instead of per priority query. */
interface CrossingExtent { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
/** Conservative broad phase is appropriate for yielding, never contact. */
function touchesCrossing(extent: CrossingExtent, body: PopulationFootprint): boolean {
  const radius = Math.hypot(body.halfWidthMetres, body.halfLengthMetres);
  return body.x >= extent.minX - radius && body.x <= extent.maxX + radius
    && body.z >= extent.minZ - radius && body.z <= extent.maxZ + radius;
}
const startState = (state: ActorState, pose: PopulationActorPose): ActorState => ({ ...state,
  distance: pose.distanceMetres, direction: pose.direction, heading: pose.headingY,
  gaitDistance: pose.gaitDistanceMetres, wheelTravel: pose.wheelTravelMetres });
/**
 * One priority lookahead per actor and epoch. The forecast reads only the
 * epoch's start pose, the clock and these live fields; speed is passed in.
 */
interface LookaheadMemo {
  readonly epoch: PopulationSnapshot; readonly start: PopulationActorPose; readonly clock: number;
  readonly seconds: number; readonly direction: 1 | -1; readonly workerLeg: ActorState['workerLeg'];
  readonly pause: number; readonly turning: boolean; readonly waiting: boolean; readonly impactUntil: number;
  readonly footprint: PopulationFootprint;
}

export class PopulationSimulation {
  private readonly plan: PopulationPlan;
  private readonly sampler: TerrainSampler;
  private readonly paths: ReadonlyMap<string, PreparedPath>;
  private readonly ground = createGroundSample();
  private states: ActorState[] = [];
  private pairs = new Map<string, Map<string, PairState>>();
  /** Pedestrian path -> vehicle path -> accepted crossings, in plan order. */
  private readonly crossingIndex = new Map<string, Map<string, CrossingExtent[]>>();
  /** previous.actors keeps states order; ids are validated unique. */
  private readonly stateIndex = new Map<string, number>();
  private lookaheads: (LookaheadMemo | undefined)[] = [];
  /** Route-scan blocker ids, formed once per world rather than per vehicle per step. */
  private actorBlockerIds: readonly string[] = [];
  private readonly lowerCorners: readonly MutablePopulationHullCorner[] = [
    { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  private tick = 0;
  private clock = 0;
  private stepDt = 0;
  private previous: PopulationSnapshot = { tick: 0, clockSeconds: 0, actors: [] };
  private current: PopulationSnapshot = { tick: 0, clockSeconds: 0, actors: [] };
  private issuedActorCensus: { snapshot: PopulationSnapshot; census: PopulationActorMotionCensus } | null = null;
  private contactsTick = -1;
  private contacts: readonly PopulationContact[] = [];
  private anticipationRows: readonly (RouteAnticipationResult & { readonly actorId: string; readonly targetSpeedMetresPerSecond: number; readonly incomplete: boolean })[] = [];
  /** Latest fixed-step behavior work; reading it advances no simulation clock. */
  anticipationState() { return this.anticipationRows.map(row => ({ ...row })); }

  constructor(plan: PopulationPlan, sampler: TerrainSampler) {
    // Own plain copies: subsequent author/caller mutations cannot move a live world.
    this.plan = structuredClone(plan);
    this.sampler = sampler;
    if (this.plan.schema !== 1) throw new Error('Unsupported population schema');
    const paths = new Map<string, PreparedPath>();
    for (const path of this.plan.paths) {
      if (!path.id || paths.has(path.id) || path.points.length < 2
        || !finite(path.lengthMetres) || path.lengthMetres <= 0
        || Math.abs(path.points[0].distanceMetres) > R.epsilon
        || Math.abs(path.points[path.points.length - 1].distanceMetres - path.lengthMetres) > R.closedPositionToleranceMetres) {
        throw new Error('Population requires unique validated paths with complete distance frames');
      }
      for (let i = 0; i < path.points.length; i += 1) {
        const point = path.points[i];
        if (!finite(point.x, point.y, point.z, point.headingY, point.distanceMetres)
          || (i > 0 && point.distanceMetres <= path.points[i - 1].distanceMetres)) {
          throw new Error(`Invalid population path frame: ${path.id}`);
        }
      }
      if (path.closed) {
        const first = path.points[0], last = path.points[path.points.length - 1];
        if (Math.hypot(last.x - first.x, last.z - first.z) > R.closedPositionToleranceMetres
          || Math.abs(wrapAngle(last.headingY - first.headingY)) > R.closedHeadingToleranceRadians) {
          throw new Error(`A population loop must genuinely close: ${path.id}`);
        }
      }
      paths.set(path.id, { path });
    }
    this.paths = paths;
    for (const crossing of this.plan.crossings ?? []) {
      if (crossing.priority !== 'pedestrian') continue;
      const xs = crossing.corners.map(value => value.x), zs = crossing.corners.map(value => value.z);
      const extent = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
      for (const pedestrianPathId of crossing.pedestrianPathIds) {
        let byVehicle = this.crossingIndex.get(pedestrianPathId);
        if (!byVehicle) this.crossingIndex.set(pedestrianPathId, byVehicle = new Map());
        for (const vehiclePathId of crossing.vehiclePathIds) {
          let list = byVehicle.get(vehiclePathId);
          if (!list) byVehicle.set(vehiclePathId, list = []);
          // A repeated path id named the crossing once in the original filter.
          if (list[list.length - 1] !== extent) list.push(extent);
        }
      }
    }
    const ids = new Set<string>();
    for (const spec of this.plan.actors) {
      const path = paths.get(spec.pathId)?.path;
      if (!spec.id || ids.has(spec.id) || !path || !finite(spec.initialDistanceMetres,
        spec.speedMetresPerSecond, spec.idleSeconds, spec.hull.halfWidthMetres,
        spec.hull.halfLengthMetres, spec.hull.heightMetres)
        || spec.initialDistanceMetres < 0 || spec.initialDistanceMetres > path.lengthMetres
        || spec.speedMetresPerSecond < 0 || spec.idleSeconds < 0
        || spec.hull.halfWidthMetres <= 0 || spec.hull.halfLengthMetres <= 0 || spec.hull.heightMetres <= 0
        || (spec.direction !== 1 && spec.direction !== -1)
        || (spec.movement === 'loop' && !path.closed)
        || (spec.kind === 'trafficVehicle' && (spec.movement !== 'loop' || !path.closed || spec.direction !== 1))
        || (spec.kind === 'serviceVehicle' && spec.movement === 'shuttle' && !path.serviceShuttle)
        || (vehicle(spec.kind) && spec.movement === 'loop' && spec.direction !== 1)
        || (spec.kind === 'parkedVehicle' && spec.movement !== 'stationary')) {
        throw new Error(`Invalid population actor/path movement: ${spec.id}`);
      }
      ids.add(spec.id);
    }
    this.reset();
  }

  /** World restart resets the shared phase, contact edges and every physical actor. */
  reset(): void {
    this.tick = 0; this.clock = 0; this.stepDt = 0;
    this.contactsTick = -1; this.contacts = []; this.pairs.clear(); this.anticipationRows = [];
    this.states = [...this.plan.actors].sort(sortId).map(spec => {
      const path = this.paths.get(spec.pathId)!;
      const anchor = this.plan.anchors.find(value => value.id === spec.anchorId);
      const workerAnchor = anchor?.distanceMetres ?? spec.initialDistanceMetres;
      const workerTarget = clamp(workerAnchor + spec.direction * R.workerExcursionMetres, 0, path.path.lengthMetres);
      const state: ActorState = { spec, path, distance: spec.initialDistanceMetres,
        direction: spec.direction, speed: 0,
        heading: pathPoint(path.path, spec.initialDistanceMetres).headingY
          + (!vehicle(spec.kind) && spec.direction === -1 ? Math.PI : 0),
        gaitDistance: 0, wheelTravel: 0, pause: spec.kind === 'worker' ? spec.idleSeconds : 0,
        turning: false, workerLeg: 'work', workerAnchor, workerTarget,
        impactUntil: 0, waiting: false, waitingOn: [], blockedBy: -1, blockedSeconds: 0, blockedGait: 0, turnedAt: -Infinity,
        aside: 0, asideTarget: 0, stepStartAside: 0, asideStalled: 0, pose: {} as PopulationActorPose,
        previousDistance: spec.initialDistanceMetres, stepTravel: 0, stepGaitStart: 0,
        stepWheelStart: 0, stepStartDirection: spec.direction, stepStartPause: 0,
        stepStartTurning: false, stepStartWorkerLeg: 'work' };
      state.pose = this.makePose(state, 0, 0); return state;
    });
    this.stateIndex.clear(); this.lookaheads = [];
    this.states.forEach((state, index) => this.stateIndex.set(state.spec.id, index));
    this.actorBlockerIds = this.states.map(state => `actor:${state.spec.id}`);
    this.publish(); this.previous = copySnapshot(this.current);
  }

  /** Reading or interpolation never advances a clock or mutates a physical pose. */
  snapshot(): PopulationSnapshot { return copySnapshot(this.current); }
  previousSnapshot(): PopulationSnapshot { return copySnapshot(this.previous); }
  /** Physical query callers need detached bodies, not render/route/activity data. */
  actorFootprints(): readonly PopulationFootprint[] {
    return this.current.actors.map(actor => detachedFootprint(actor.footprint));
  }
  /** Write detached render-only endpoints into storage owned by the caller. */
  writePresentationEndpoints(previous: PopulationPresentationSnapshot, current: PopulationPresentationSnapshot): void {
    if (previous === current || previous.actors === current.actors) throw new RangeError('Population presentation endpoints need distinct caller storage');
    writePresentationSnapshot(this.previous, previous); writePresentationSnapshot(this.current, current);
  }
  get clockSeconds(): number { return this.clock; }
  /** Existing shared native epoch index; reading allocates no pose snapshot. */
  get tickIndex(): number { return this.tick; }
  interpolate(alpha: number): PopulationSnapshot {
    const t = clamp(Number.isFinite(alpha) ? alpha : 0, 0, 1);
    return { tick: this.current.tick, clockSeconds: lerp(this.previous.clockSeconds, this.current.clockSeconds, t),
      actors: this.current.actors.map((pose, i) => mixActorPose(this.previous.actors[i], pose, t)) };
  }

  private publish(): void {
    this.current = { tick: this.tick, clockSeconds: this.clock, actors: this.states.map(state => state.pose) };
  }

  private makePose(state: ActorState, velocityX: number, velocityZ: number,
    signedSpeed: number = state.speed * (vehicle(state.spec.kind) ? state.direction : 1)): PopulationActorPose {
    const onPath = pathPoint(state.path.path, state.distance);
    const point = state.aside === 0 ? onPath : { ...onPath, x: onPath.x + Math.cos(onPath.headingY) * state.aside,
      z: onPath.z - Math.sin(onPath.headingY) * state.aside };
    const ground = this.sampler.sampleGround(point.x, point.z, this.ground);
    if (!(Number.isFinite(ground.height) && Number.isFinite(ground.normal.x) && Number.isFinite(ground.normal.y)
      && Number.isFinite(ground.normal.z)) || ground.normal.y <= 0) {
      throw new Error(`Population actor lost valid finished ground: ${state.spec.id}`);
    }
    const { spec } = state;
    const { activity, activityPhase, activityBlend } = actorActivity(state, this.clock, signedSpeed);
    const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
    const normalX = ground.normal.x, normalY = ground.normal.y, normalZ = ground.normal.z;
    const y = ground.height;
    // The transform's lower corners land in owned scratch; only the prism is kept.
    const corners = this.lowerCorners;
    let footprint = physicalPopulationPrism(transformPopulationHullLowerInto(point.x, y, point.z, state.heading,
      normalX, normalY, normalZ, spec.hull, velocityX, velocityZ, corners));
    // Actual support ground is sampled at the horizontal location of each
    // grade-aligned lower corner, not inferred from a renderer tangent plane.
    const supportHeights = [] as number[];
    for (const corner of corners) {
        const supportGround = this.sampler.sampleGround(corner.x, corner.z, this.ground);
        if (!Number.isFinite(supportGround.height)) throw new Error(`Invalid population support ground: ${spec.id}`);
        supportHeights.push(supportGround.height);
    }
    const targets = populationSupportTargets({ kind: spec.kind, appearanceIndex: spec.appearanceIndex,
      x: point.x, y, z: point.z, headingY: state.heading, hull: spec.hull,
      speedMetresPerSecond: signedSpeed, gaitDistanceMetres: state.gaitDistance, activity,
      groundNormalX: normalX, groundNormalY: normalY, groundNormalZ: normalZ });
    const sampleSupport = (target: { x: number; y: number; z: number; contact: 'ground' | 'pedal' }): PopulationGroundSupport => {
      if (target.contact === 'pedal') return { x: target.x, y: target.y, z: target.z,
        normalX, normalY, normalZ };
      const sample = this.sampler.sampleGround(target.x, target.z, this.ground);
      if (!(Number.isFinite(sample.height) && Number.isFinite(sample.normal.x) && Number.isFinite(sample.normal.y)
        && Number.isFinite(sample.normal.z)) || sample.normal.y <= 0)
        throw new Error(`Population support lost finished ground: ${spec.id}`);
      return { x: target.x, y: sample.height, z: target.z,
        normalX: sample.normal.x, normalY: sample.normal.y, normalZ: sample.normal.z };
    };
    const footSupports = targets.feet?.map(sampleSupport) as [PopulationGroundSupport, PopulationGroundSupport] | undefined;
    const tyreSupports = targets.tyres?.map(sampleSupport) as
      [PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport] | undefined;
    // Math.min/max over the same values, folded pairwise (both are order-free, -0 and NaN included).
    let minY = footprint.minY, maxY = footprint.maxY;
    if (footSupports) for (const value of footSupports) minY = Math.min(minY, value.y);
    if (tyreSupports) for (let index = 0; index < tyreSupports.length; index += 1) {
      minY = Math.min(minY, tyreSupports[index].y);
      maxY = Math.max(maxY, tyreSupports[index].y + 2 * targets.tyres![index].radiusMetres);
    }
    footprint = { ...footprint, minY, maxY, sourceHull: { ...footprint.sourceHull!,
      verticalPaddingBelowMetres: footprint.minY - minY,
      verticalPaddingAboveMetres: maxY - footprint.maxY } };
    return { id: spec.id, kind: spec.kind, appearanceIndex: spec.appearanceIndex,
      x: point.x, y, z: point.z, headingY: state.heading,
      velocityX: velocityX + 0, velocityZ: velocityZ + 0,
      speedMetresPerSecond: signedSpeed + 0, gaitDistanceMetres: state.gaitDistance,
      wheelTravelMetres: state.wheelTravel,
      activity, activityPhase, activityBlend,
      backing: vehicle(spec.kind) && signedSpeed < 0, pathId: spec.pathId,
      distanceMetres: state.distance, direction: state.direction, hull: { ...spec.hull },
      footprint, supportHeights: supportHeights as [number, number, number, number],
      ...(footSupports ? { footSupports } : {}), ...(tyreSupports ? { tyreSupports } : {}),
      groundNormalX: normalX, groundNormalY: normalY, groundNormalZ: normalZ,
      groundPitch: Math.atan2(-(normalX * sin + normalZ * cos), normalY),
      groundRoll: Math.atan2(-(normalX * cos - normalZ * sin), normalY) };
  }

  private along(state: ActorState, signedTravel: number): number {
    const length = state.path.path.lengthMetres;
    if (state.spec.movement === 'loop') return ((state.distance + signedTravel) % length + length) % length;
    if (state.spec.kind === 'worker') {
      const destination = state.workerLeg === 'outbound' ? state.workerTarget : state.workerAnchor;
      return state.direction === 1 ? Math.min(state.distance + signedTravel, destination)
        : Math.max(state.distance + signedTravel, destination);
    }
    return clamp(state.distance + signedTravel, 0, length);
  }

  private prospective(state: ActorState, travel: number): PopulationFootprint {
    const distance = this.along(state, travel), point = pathPoint(state.path.path, distance);
    // Forecast and committed poses use the same actual sole/tread targets.
    // Centre-only grade hulls omit support padding on curved ground.
    const candidate: ActorState = { ...state, distance,
      heading: point.headingY + (!vehicle(state.spec.kind) && state.direction === -1 ? Math.PI : 0),
      gaitDistance: state.gaitDistance + Math.abs(travel),
      wheelTravel: state.wheelTravel + (vehicle(state.spec.kind) ? travel : Math.abs(travel)) };
    return this.makePose(candidate, 0, 0, Math.abs(travel) <= R.epsilon ? 0
      : state.spec.speedMetresPerSecond * (vehicle(state.spec.kind) ? state.direction : 1)).footprint;
  }

  /** Only authored, accepted crossings grant pedestrians priority. */
  private pedestrianPriority(person:ActorState,traffic:ActorState):boolean {
    if(vehicle(person.spec.kind)||!vehicle(traffic.spec.kind))return false;
    // Most of the O(N^2) callers name a pair with no shared crossing at all.
    const crossings=this.crossingIndex.get(person.spec.pathId)?.get(traffic.spec.pathId);
    if(crossings===undefined)return false;
    const personStart=this.previousActor(person.spec.id)??person.pose;
    const trafficStart=this.previousActor(traffic.spec.id)??traffic.pose;
    const personFrom=personStart.footprint,personTo=this.lookahead(person,personStart,R.humanLookAheadSeconds);
    const trafficFrom=trafficStart.footprint,trafficTo=this.lookahead(traffic,trafficStart,R.vehicleLookAheadSeconds);
    for(const crossing of crossings)if((touchesCrossing(crossing,personFrom)||touchesCrossing(crossing,personTo))
      &&!touchesCrossing(crossing,trafficFrom)&&touchesCrossing(crossing,trafficTo))return true;
    return false;
  }

  /** The actor's own look ahead is the priority forecast whenever its live
   * state still holds the epoch's start, as it does until its own move. */
  private ownLookahead(state: ActorState, index: number, seconds: number): PopulationFootprint {
    const start = this.previous.actors[index];
    if (start !== undefined && start.id === state.spec.id && Object.is(state.distance, start.distanceMetres)
      && state.direction === start.direction && Object.is(state.heading, start.headingY)
      && Object.is(state.gaitDistance, start.gaitDistanceMetres) && Object.is(state.wheelTravel, start.wheelTravelMetres))
      return this.lookahead(state, start, seconds);
    return this.prospective(state, state.direction * state.spec.speedMetresPerSecond * seconds);
  }

  /** This epoch's start pose for an actor id; the index replaces a linear find. */
  private previousActor(id: string): PopulationActorPose | undefined {
    const index = this.stateIndex.get(id), pose = index === undefined ? undefined : this.previous.actors[index];
    return pose !== undefined && pose.id === id ? pose : this.previous.actors.find(value => value.id === id);
  }

  /**
   * The priority forecast from the epoch's start pose. The O(N^2) callers ask
   * for the same actor repeatedly; nothing it reads changes between them unless
   * one of the keyed live fields does, so a changed field simply recomputes.
   */
  private lookahead(state: ActorState, start: PopulationActorPose, seconds: number): PopulationFootprint {
    const index = this.stateIndex.get(state.spec.id);
    const memo = index === undefined || this.states[index] !== state ? undefined : this.lookaheads[index];
    if (memo !== undefined && memo.epoch === this.previous && memo.start === start && memo.clock === this.clock
      && memo.seconds === seconds && memo.direction === state.direction && memo.workerLeg === state.workerLeg
      && Object.is(memo.pause, state.pause) && memo.turning === state.turning && memo.waiting === state.waiting
      && Object.is(memo.impactUntil, state.impactUntil)) return memo.footprint;
    const footprint = this.prospective(startState(state, start), state.direction * state.spec.speedMetresPerSecond * seconds);
    if (index !== undefined && this.states[index] === state) this.lookaheads[index] = { epoch: this.previous, start,
      clock: this.clock, seconds, direction: state.direction, workerLeg: state.workerLeg, pause: state.pause,
      turning: state.turning, waiting: state.waiting, impactUntil: state.impactUntil, footprint };
    return footprint;
  }

  private validateOccupants(occupants: readonly PopulationOccupant[]): readonly PopulationOccupant[] {
    const ids = new Set<string>();
    for (const occupant of occupants) {
      if (!occupant.id || ids.has(occupant.id) || (occupant.kind !== 'human' && occupant.kind !== 'cop')) {
        throw new Error('Population occupants need distinct physical identities');
      }
      assertFootprint(occupant.previous); assertFootprint(occupant.current); ids.add(occupant.id);
    }
    return [...occupants].sort(sortId);
  }

  private activeReservations(reservations: readonly PopulationReservation[]): readonly PopulationReservation[] {
    const ids = new Set<string>();
    for (const item of reservations) {
      if (!item.id || ids.has(item.id) || (item.expiresAtClockSeconds !== undefined
        && !Number.isFinite(item.expiresAtClockSeconds))) throw new Error('Invalid population reservation');
      assertFootprint(item.footprint); ids.add(item.id);
    }
    return [...reservations].filter(item => item.expiresAtClockSeconds === undefined
      || item.expiresAtClockSeconds >= this.clock).sort(sortId);
  }

  /**
   * Call once per simulation tick, before advancing riders. Occupants describe
   * their latest physical state; all may be stopped. No pane/tier work occurs.
   */
  step(dt: number, occupants: readonly PopulationOccupant[] = [],
    reservations: readonly PopulationReservation[] = [], anticipation?: PopulationCompactAnticipation): void {
    if (!Number.isFinite(dt) || dt < 0 || dt > R.maximumStepSeconds) {
      throw new RangeError('Population expects a bounded positive fixed step');
    }
    if (dt === 0) return;
    const people = this.validateOccupants(occupants);
    const reserved = this.activeReservations(reservations);
    if (anticipation) {
      const ids = new Set<string>();
      for (const part of anticipation.components) {
        const key = `${part.ownerId}/${part.componentId}`;
        if (!part.ownerId || (part.componentId !== 'wheel' && part.componentId !== 'human') || ids.has(key)
          || !finite(part.velocityX, part.velocityZ, part.expansionMetresPerSecond) || part.expansionMetresPerSecond < 0)
          throw new RangeError('Population requires distinct finite compact anticipation components');
        assertFootprint(part.footprint); ids.add(key);
      }
      // A caller must name every coarse/native owner with both detached parts,
      // or explicitly mark it incomplete. An optional input is not permission
      // to silently omit a real owner from the behavioral census.
      for (const person of people) if (!anticipation.incompleteOwnerIds.includes(person.id)
        && (!ids.has(`${person.id}/wheel`) || !ids.has(`${person.id}/human`)))
        throw new RangeError('Compact anticipation omitted an active native owner');
    }
    const anticipationRows: Array<RouteAnticipationResult & { actorId: string; targetSpeedMetresPerSecond: number; incomplete: boolean }> = [];
    this.anticipationRows = anticipationRows;
    const actorBlockers = this.current.actors.map(actorFootprint);
    const stationaryActors = actorBlockers.map(body => boundedMotion(body, body));
    const reservationBlockers = reserved.map(item => boundedMotion(item.footprint, item.footprint));
    const forecasts = new Map<number, { people: BoundedMotion[]; actors: BoundedMotion[] }>();
    const forecastFor = (seconds: number) => {
      let forecast = forecasts.get(seconds);
      if (!forecast) {
        forecast = { people: people.map(person => boundedMotion(person.current, predictBody(person.current, seconds))),
          actors: actorBlockers.map(body => boundedMotion(body, predictBody(body, seconds))) };
        forecasts.set(seconds, forecast);
      }
      return forecast;
    };
    this.previous = copySnapshot(this.current);
    // An omitted contact query is a discontinuity, not a perpetual old edge.
    if (this.contactsTick !== this.tick) for (const pairs of this.pairs.values()) {
      for (const pair of pairs.values()) pair.overlapping = false;
    }
    for (const [occupantId, pairs] of this.pairs) {
      const occupant = people.find(value => value.id === occupantId);
      if (!occupant || occupant.teleported || occupant.reset) { this.pairs.delete(occupantId); continue; }
      for (const pair of pairs.values()) pair.cooldown = Math.max(0, pair.cooldown - dt);
    }
    this.tick += 1; this.clock += dt; this.stepDt = dt;
    this.contacts = [];
    for (let index = 0; index < this.states.length; index += 1) {
      const state = this.states[index], before = state.pose;
      state.previousDistance = state.distance; state.stepTravel = 0; state.stepGaitStart = state.gaitDistance;
      state.stepWheelStart = state.wheelTravel; state.stepStartDirection = state.direction;
      state.stepStartPause = state.pause; state.stepStartTurning = state.turning;
      // A step aside that something else stops for good is dropped, so the
      // walker can still turn or walk on (never pinned mid-step).
      state.asideStalled = state.aside !== state.asideTarget && state.aside === state.stepStartAside ? state.asideStalled + dt : 0;
      if (state.asideStalled > SIDESTEP_GIVE_UP_SECONDS) { state.asideTarget = state.aside; state.asideStalled = 0; }
      state.stepStartWorkerLeg = state.workerLeg; state.stepStartAside = state.aside;
      state.waiting = false; state.waitingOn.length = 0;
      const { spec } = state;
      // A pending step aside for a rider goes ahead once the flinch has played.
      const flinching = state.impactUntil > this.clock && (state.aside === state.asideTarget
        || state.impactUntil - this.clock > R.impactPauseSeconds - IMPACT_FLINCH_SECONDS);
      if (spec.movement === 'stationary' || flinching) {
        state.speed = 0; this.refreshActorActivity(state, 0); continue;
      }
      if (state.pause > 0) {
        state.pause = Math.max(0, state.pause - dt); state.speed = 0;
        this.refreshActorActivity(state, 0); continue;
      }
      // Stood aside for a rider: back onto the path once it is clear of them,
      // and a step to either side is walked before anything else.
      if (state.aside !== 0 && state.asideTarget === state.aside && this.pathClearOfPeople(state, people)) state.asideTarget = 0;
      if (state.aside !== state.asideTarget) {
        const step = clamp(state.asideTarget - state.aside, -SIDESTEP_METRES_PER_SECOND * dt, SIDESTEP_METRES_PER_SECOND * dt);
        state.aside = Math.abs(state.asideTarget - state.aside - step) <= R.epsilon ? state.asideTarget : state.aside + step;
        state.gaitDistance += Math.abs(step); state.speed = Math.abs(step) / dt;
        const updated = this.makePose(state, 0, 0, state.speed);
        state.pose = { ...updated, velocityX: (updated.x - before.x) / dt, velocityZ: (updated.z - before.z) / dt,
          footprint: { ...updated.footprint, velocityX: (updated.footprint.x - before.footprint.x) / dt,
            velocityZ: (updated.footprint.z - before.footprint.z) / dt } };
        continue;
      }
      if (spec.kind === 'worker' && state.workerLeg === 'work') {
        state.workerLeg = 'outbound';
        state.direction = state.workerTarget >= state.workerAnchor ? 1 : -1;
        state.turning = true;
      }
      if (state.turning) {
        const target = pathPoint(state.path.path, state.distance).headingY
          + (!vehicle(spec.kind) && state.direction === -1 ? Math.PI : 0);
        const angle = wrapAngle(target - state.heading);
        state.heading += clamp(angle, -R.endpointTurnRadiansPerSecond * dt, R.endpointTurnRadiansPerSecond * dt);
        state.speed = 0;
        if (Math.abs(wrapAngle(target - state.heading)) <= R.endpointTurnToleranceRadians) state.turning = false;
        state.pose = this.makePose(state, 0, 0, 0); continue;
      }
      const isVehicle = vehicle(spec.kind);
      const horizon = isVehicle ? R.vehicleLookAheadSeconds : R.humanLookAheadSeconds;
      const gap = isVehicle ? R.vehicleWaitingGapMetres : R.humanWaitingGapMetres;
      const from = actorFootprint(before);
      const forecast = forecastFor(horizon);
      const blockers: BoundedMotion[] = [...forecast.people, ...reservationBlockers];
      for (let other = 0; other < actorBlockers.length; other += 1) if (other !== index) blockers.push(
        // The waiting vehicle's hypothetical future must not deadlock the
        // pedestrian who has priority. Its actual body still blocks this step.
        this.pedestrianPriority(state,this.states[other]) ? stationaryActors[other] : forecast.actors[other]);
      const look = isVehicle && anticipation ? null : this.ownLookahead(state, index, horizon);
      const grownFrom = grow(from, gap), grownLook = look === null ? null : grow(look, gap);
      const lookBounds = grownLook === null ? null : motionBounds(grownFrom, grownLook);
      const priorityHold=isVehicle&&this.states.some(other=>this.pedestrianPriority(other,state));
      // A blocker the look starts inside and leaves (its gap grows) is not
      // waited on: the fraction loop's and constrain()'s departing-overlap
      // rule, so a walker walks away from a body stopped just behind it (POP-5).
      // Actor blockers are recorded for the mutual-wait resolution.
      let needsWait = priorityHold;
      if (grownLook !== null) {
        const waitsOn = (to: PopulationFootprint, blockerFrom: PopulationFootprint, blockerTo: PopulationFootprint): boolean => {
          const hit = sweepPopulationHulls(grownFrom, to, blockerFrom, blockerTo);
          return hit !== null && !(hit.initiallyOverlapping && (staticContact(to, blockerTo)?.gap ?? Infinity)
            > (staticContact(grownFrom, blockerFrom)?.gap ?? Infinity) + R.epsilon);
        };
        const firstActor = forecast.people.length + reservationBlockers.length;
        for (let k = 0; k < blockers.length; k += 1) {
          const blocker = blockers[k];
          if (!mayMeet(lookBounds, blocker.bounds) || !waitsOn(grownLook, blocker.from, blocker.to)) continue;
          needsWait = true;
          if (k >= firstActor) state.waitingOn.push(k - firstActor < index ? k - firstActor : k - firstActor + 1);
          else if (k < forecast.people.length && !state.waitingOn.includes(OCCUPANT_WAIT)) state.waitingOn.push(OCCUPANT_WAIT);
        }
        // **And on a rider's compact parts, where the caller supplied them.**
        // A leaning rider's body reaches past his coarse box, and the contact
        // transaction admits by the parts: waiting on the box alone, a walker
        // stepped into the side of a passing cop and the two held each other
        // still for good (the chaseprobe pin, 2026-10-03).
        if (!needsWait && !isVehicle && anticipation) {
          for (const part of anticipation.components) {
            const near = compactAnticipationBlocker(part, horizon);
            const partFrom = grow(near.from, near.pad), partTo = grow(near.to, near.pad);
            if (!mayMeet(lookBounds, motionBounds(partFrom, partTo)) || !waitsOn(grownLook, partFrom, partTo)) continue;
            needsWait = true; state.waitingOn.push(OCCUPANT_WAIT);
            break;
          }
        }
      }
      if (isVehicle && anticipation) {
        const forecastSeconds = Math.max(horizon, state.speed / R.vehicleBrakingMetresPerSecondSquared + dt);
        const pathTravel = Math.max(spec.speedMetresPerSecond * forecastSeconds,
          state.speed * state.speed / (2 * R.vehicleBrakingMetresPerSecondSquared) + state.speed * dt + gap);
        const routeBlockers = anticipation.components.map(part => compactAnticipationBlocker(part, forecastSeconds));
        reserved.forEach(item => routeBlockers.push({ id: `reservation:${item.id}`, from: item.footprint, to: item.footprint, pad: 0 }));
        for (let other = 0; other < actorBlockers.length; other += 1) if (other !== index) {
          const body = actorBlockers[other];
          routeBlockers.push({ id: this.actorBlockerIds[other],
            from: body, to: this.pedestrianPriority(state, this.states[other]) ? body : predictBody(body, forecastSeconds), pad: 0 });
        }
        const incomplete = anticipation.incompleteOwnerIds.length > 0 || anticipation.components.length > R.compactAnticipationMaximumComponents;
        const scan: RouteAnticipationResult = incomplete
          ? { availableTravelMetres: 0, blockedBy: 'incomplete-compact-census', overflow: false, spanVisits: 0, blockerTests: 0 }
          : routeAnticipation({ path: state.path.path, distanceMetres: state.distance, direction: state.direction,
            travelMetres: pathTravel, fullHullAxisBoundMetres: Math.hypot(spec.hull.halfWidthMetres, spec.hull.halfLengthMetres, spec.hull.heightMetres),
            gapMetres: gap, blockers: routeBlockers,
            flatSupport: { sampler: this.sampler, hull: spec.hull, currentHeadingY: state.heading,
              currentFootprint: detachedFootprint(state.pose.footprint),
              maximumNativeStepTravelMetres: Math.max(spec.speedMetresPerSecond, state.speed) * dt } });
        const target = priorityHold || incomplete || scan.overflow ? 0
          : scan.blockedBy === null ? spec.speedMetresPerSecond
          : Math.min(spec.speedMetresPerSecond, routeBrakingSpeedCap(scan.availableTravelMetres, dt));
        needsWait = target < spec.speedMetresPerSecond;
        anticipationRows.push({ ...scan, actorId: spec.id, targetSpeedMetresPerSecond: target, incomplete });
        if (scan.blockedBy?.startsWith('actor:')) {
          const other = this.states.findIndex(value => value.spec.id === scan.blockedBy!.slice(6));
          if (other >= 0) state.waitingOn.push(other);
        }
        state.speed = state.speed > target ? Math.max(target, state.speed - R.vehicleBrakingMetresPerSecondSquared * dt)
          : Math.min(target, state.speed + R.vehicleAccelerationMetresPerSecondSquared * dt);
      } else {
        const rate = needsWait ? isVehicle ? R.vehicleBrakingMetresPerSecondSquared : R.humanBrakingMetresPerSecondSquared
          : isVehicle ? R.vehicleAccelerationMetresPerSecondSquared : R.humanAccelerationMetresPerSecondSquared;
        state.speed = needsWait ? Math.max(0, state.speed - rate * dt)
          : Math.min(spec.speedMetresPerSecond, state.speed + rate * dt);
      }
      const wanted = state.direction * state.speed * dt;
      const prospective = this.prospective(state, wanted);
      const grownProspective = grow(prospective, gap), prospectiveBounds = motionBounds(grownFrom, grownProspective);
      const nativeFraction = Math.min(1, dt / horizon);
      let fraction = 1;
      for (const blocker of blockers) {
        if (!mayMeet(prospectiveBounds, blocker.bounds)) continue;
        if (blocker.nativeFraction !== nativeFraction || !blocker.nativeTo) {
          blocker.nativeFraction = nativeFraction; blocker.nativeTo = mixBody(blocker.from, blocker.to, nativeFraction);
        }
        const next = blocker.nativeTo;
        const hit = sweepPopulationHulls(grownFrom, grownProspective, blocker.from, next);
        if (hit) {
          // A merged blocker moving away may be allowed to leave, but we do
          // not walk deeper into it while waiting for that to happen.
          const startGap = staticContact(grownFrom, blocker.from)?.gap ?? Infinity;
          const endGap = staticContact(grownProspective, next)?.gap ?? Infinity;
          if (hit.initiallyOverlapping && endGap > startGap + R.epsilon) continue;
          fraction = Math.min(fraction, Math.max(0, hit.timeOfImpact - R.contactSkinMetres
            / Math.max(Math.abs(wanted), R.contactSkinMetres)));
        }
      }
      const travel = wanted * fraction;
      const nextDistance = this.along(state, travel);
      const actualTravel = spec.movement === 'loop' ? travel : nextDistance - state.distance;
      state.distance = nextDistance; state.stepTravel = actualTravel;
      state.gaitDistance += Math.abs(actualTravel);
      state.wheelTravel += isVehicle ? actualTravel : Math.abs(actualTravel);
      state.speed = Math.abs(actualTravel) / dt;
      const point = pathPoint(state.path.path, state.distance);
      if (Math.abs(actualTravel) > R.epsilon) state.heading += wrapAngle(point.headingY
        + (!isVehicle && state.direction === -1 ? Math.PI : 0) - state.heading);
      state.waiting = needsWait && state.speed <= R.epsilon;
      const motionDirection = state.direction;
      if (spec.kind === 'worker') {
        const destination = state.workerLeg === 'outbound' ? state.workerTarget : state.workerAnchor;
        if (Math.abs(state.distance - destination) <= R.epsilon) {
          if (state.workerLeg === 'outbound') {
            state.workerLeg = 'return'; state.direction = state.direction === 1 ? -1 : 1; state.turning = true;
          } else { state.workerLeg = 'work'; state.pause = spec.idleSeconds; }
          state.speed = 0;
        }
      } else if (spec.movement === 'shuttle' && ((state.distance <= R.epsilon && state.direction === -1)
        || (state.distance >= state.path.path.lengthMetres - R.epsilon && state.direction === 1))) {
        // Only an arrival turns: one already facing back in, held at the end
        // by someone in its way, flipped back to the end every step (POP-2).
        state.direction = state.direction === 1 ? -1 : 1;
        state.pause = spec.idleSeconds; state.turning = !isVehicle; state.speed = 0;
      }
      const updated = this.makePose(state, 0, 0, Math.abs(actualTravel) / dt * (isVehicle ? motionDirection : 1));
      state.pose = { ...updated, velocityX: (updated.x - before.x) / dt,
        velocityZ: (updated.z - before.z) / dt,
        footprint: { ...updated.footprint, velocityX: (updated.footprint.x - before.footprint.x) / dt,
          velocityZ: (updated.footprint.z - before.footprint.z) / dt } };
    }
    // Resolve actual simultaneous AI trajectories after prediction. Previous
    // velocities alone cannot prevent two newly accelerating actors meeting
    // at a crossing; rotating a stopped actor also has a physical swept hull.
    const fractions = this.states.map(() => 1);
    const actualMotions = this.states.map((state, index) => {
      const from = actorFootprint(this.previous.actors[index]), to = actorFootprint(state.pose);
      // A turn on the spot keeps its own body's clearance: the waiting gap is
      // for walking up to someone, and grown by it a walker stopped in front of
      // a rider could never turn round and leave (R2C-5, 2026-10-04).
      const turningOnly = state.speed === 0 && state.stepTravel === 0 && from.headingY !== to.headingY;
      const gap = turningOnly ? 0 : vehicle(state.spec.kind) ? R.vehicleWaitingGapMetres : R.humanWaitingGapMetres;
      return { original: boundedMotion(from, to), grown: boundedMotion(grow(from, gap), grow(to, gap)),
        turnsInPlace: turningOnly && turnsThroughRiders(state.spec.kind), sidestep: state.aside !== state.stepStartAside };
    });
    const nativeMotions = people.map(person => boundedMotion(person.current, predictBody(person.current, dt)));
    // A step aside answers where a rider is, not where he pushes: his travel
    // into the walker is refused anyway, and stopped it every step (R2C-5).
    const standingBodies = people.map(person => boundedMotion(person.current, person.current));
    const constrain = (index: number, first: BoundedMotion, second: BoundedMotion, slides = false): void => {
      if (!mayMeet(first.bounds, second.bounds)) return;
      const a0 = first.from, a1 = first.to, b0 = second.from, b1 = second.to;
      const hit = sweepPopulationHulls(a0, a1, b0, b1);
      if (!hit) return;
      const startGap = staticContact(a0, b0)?.gap ?? Infinity;
      const endGap = staticContact(a1, b1)?.gap ?? Infinity;
      // A step aside within a rider's waiting gap slides along it: no closer (R2C-5).
      if (hit.initiallyOverlapping && (endGap > startGap + R.epsilon || (slides && endGap >= startGap - R.epsilon))) return;
      const distance = Math.hypot(a1.x - a0.x, a1.z - a0.z)
        + Math.hypot(a0.halfWidthMetres, a0.halfLengthMetres) * Math.abs(wrapAngle(a1.headingY - a0.headingY));
      fractions[index] = Math.min(fractions[index], Math.max(0, hit.timeOfImpact
        - R.contactSkinMetres / Math.max(distance, R.contactSkinMetres)));
    };
    for (let i = 0; i < this.states.length; i += 1) {
      const first = actualMotions[i];
      // A walker or jogger turning on the spot moves into no rider: only the
      // corners of their square stand-in sweep, and those are empty. A rider
      // stopped against a walker at his shuttle end refused that turn, so
      // neither could ever leave (R2C-5, 2026-10-04). The rider's own motion
      // is still refused. Wider actors keep the constraint (`turnSweepClear`).
      if (!first.turnsInPlace) for (const person of first.sidestep ? standingBodies : nativeMotions) constrain(i, first.grown, person, first.sidestep);
      for (const item of reservationBlockers) constrain(i, first.grown, item);
      for (let j = i + 1; j < this.states.length; j += 1) {
        const second = actualMotions[j];
        constrain(i, first.grown, second.original);
        constrain(j, second.grown, first.original);
      }
    }
    fractions.forEach((fraction, index) => {
      if (fraction < 1) { this.stopAtFraction(this.states[index], fraction); this.states[index].waiting = true;
        this.refreshActorActivity(this.states[index], 0); }
    });
    this.resolveMutualWaits(dt, people);
    this.publish();
  }

  /**
   * POP-2: actors whose look-aheads wait on each other — pathmates met
   * head-on, a jogger behind a walker who has just turned at the path end, a
   * walker, its pathmate and a car each waiting on the next — would stand
   * for the session. Once every actor round such a loop has stalled for
   * `MUTUAL_WAIT_SECONDS`, one of them turns round exactly as at a path end:
   * the highest id with path behind it, one this resolution has not just
   * turned first — else a walker turned away from a car turns back into it
   * off the pathmate behind him, for ever. Vehicles and stationary actors
   * never turn; a worker turns by switching its leg. Deterministic: ids and
   * fixed-step time only.
   *
   * **A rider or cop in the way is such a wait on its own** (R2C-5,
   * 2026-10-04): a stopped rider does not move for a walker, so a walker or
   * jogger stalled on a rider's body for `OCCUPANT_WAIT_SECONDS` (a push
   * counts from the push) steps off the path (`stepAside`), or with no room
   * beside it turns round after `MUTUAL_WAIT_SECONDS`; the pair stood ~2 m
   * apart for as long as the player held still.
   */
  private resolveMutualWaits(dt: number, people: readonly PopulationOccupant[] = []): void {
    const states = this.states;
    for (const state of states) {
      // A stall, not a step: two looks meeting at their very edge alternate
      // wait/creep every step, so it lasts until real progress is made.
      const stalled = state.gaitDistance - state.blockedGait <= MUTUAL_PROGRESS_METRES;
      if (state.waitingOn.length > 0) {
        const partner = state.waitingOn.includes(state.blockedBy) ? state.blockedBy : state.waitingOn[0];
        if (partner === state.blockedBy && stalled) state.blockedSeconds += dt;
        else { state.blockedBy = partner; state.blockedSeconds = 0; state.blockedGait = state.gaitDistance; }
      } else if (state.blockedBy !== -1 && stalled && (!state.turning || state.blockedBy === OCCUPANT_WAIT) && state.pause <= 0) {
        // A rider's push keeps its clock through the pause and any turn at the path end.
        state.blockedSeconds += dt;
      } else if (state.turning && state.pause <= 0 && (state.spec.kind === 'walker' || state.spec.kind === 'jogger')
        && people.length > 0 && this.occupantInTheWay(state, people)) {
        // Turning at a path end to face a rider in the way: the wait starts with the turn.
        state.blockedBy = OCCUPANT_WAIT; state.blockedSeconds = 0; state.blockedGait = state.gaitDistance;
      } else { state.blockedBy = -1; state.blockedSeconds = 0; }
    }
    const turnRound = (turner: ActorState, loop: readonly number[]): void => {
      turner.turnedAt = this.clock;
      if (turner.spec.kind === 'worker') turner.workerLeg = turner.workerLeg === 'outbound' ? 'return' : 'outbound';
      turner.direction = turner.direction === 1 ? -1 : 1; turner.turning = true; turner.speed = 0;
      for (const index of loop) { states[index].blockedBy = -1; states[index].blockedSeconds = 0; }
      turner.pose = { ...turner.pose, direction: turner.direction }; this.refreshActorActivity(turner, 0);
    };
    for (let i = 0; i < states.length; i += 1) {
      if (states[i].blockedBy === OCCUPANT_WAIT) {
        // Off the path to let the rider by first; else back the way it came.
        // Only for a rider still against it or across its way: one that has
        // gone needs nobody to move. Walkers and joggers only, as documented
        // above: every other kind only waits, as before R2C-5. A fictional
        // EUC rider turned round here off a rider against it froze mid-turn
        // and pinned him, throttle, reverse and neutral all dead (the
        // riverside pin, 2026-10-04; see `turningInPlace` for its turns).
        const kind = states[i].spec.kind;
        if ((kind !== 'walker' && kind !== 'jogger') || states[i].spec.movement === 'stationary'
          || states[i].blockedSeconds < OCCUPANT_WAIT_SECONDS || !this.occupantInTheWay(states[i], people)) continue;
        // Turning back is the bigger decision: it waits the full mutual wait.
        if (this.stepAside(states[i], people)) { states[i].blockedBy = -1; states[i].blockedSeconds = 0; }
        else if (states[i].blockedSeconds >= MUTUAL_WAIT_SECONDS && states[i].impactUntil <= this.clock
          && this.turnRoom(states[i]) > MUTUAL_TURN_ROOM_METRES && this.turnSweepClear(states[i], people)) turnRound(states[i], [i]);
        continue;
      }
      if (states[i].blockedSeconds < MUTUAL_WAIT_SECONDS) continue;
      // Who waits on whom, followed round: a loop back to i is a deadlock,
      // handled once, from its lowest index.
      const loop = [i];
      let next = states[i].blockedBy;
      while (next > i && !loop.includes(next) && states[next].blockedSeconds >= MUTUAL_WAIT_SECONDS) {
        loop.push(next); next = states[next].blockedBy;
      }
      if (next !== i || loop.length < 2) continue;
      const recent = (index: number): number => this.clock - states[index].turnedAt < MUTUAL_RECENT_TURN_SECONDS ? 1 : 0;
      const turner = loop.sort((a, b) => recent(a) - recent(b) || b - a).map(index => states[index])
        .find(state => this.turnRoom(state) > MUTUAL_TURN_ROOM_METRES && this.turnSweepClear(state, people));
      if (!turner) continue;
      turnRound(turner, loop);
    }
  }

  /**
   * Choose a side to stand on for a rider in the way (R2C-5, 2026-10-04): the
   * side away from the nearest rider, else the other; the wider offset first.
   * Walkers and joggers only, from the path, onto walkable ground clear of
   * authored solids; the step itself still answers to every body on the way.
   */
  private stepAside(state: ActorState, people: readonly PopulationOccupant[]): boolean {
    // Mid-turn at a path end it steps aside first and finishes the turn after.
    if ((state.spec.kind !== 'walker' && state.spec.kind !== 'jogger') || state.aside !== 0 || state.asideTarget !== 0
      || state.pause > 0) return false;
    const point = pathPoint(state.path.path, state.distance), lateralX = Math.cos(point.headingY), lateralZ = -Math.sin(point.headingY);
    let nearest: PopulationOccupant | undefined, best = Infinity;
    for (const person of people) {
      const distance = Math.hypot(person.current.x - point.x, person.current.z - point.z);
      if (distance < best) { best = distance; nearest = person; }
    }
    const away = nearest ? ((nearest.current.x - point.x) * lateralX + (nearest.current.z - point.z) * lateralZ <= 0 ? 1 : -1) : 1;
    // Clear of the rider's way ahead, never just further along it, and never
    // closer to his body: a rider crossing the path at an angle pushed the
    // walker again where it stepped, and is left by turning back instead.
    const offTheWay = (side: number, offset: number): boolean => people.every(person => {
      const body = person.current, forwardX = Math.sin(body.headingY), forwardZ = Math.cos(body.headingY);
      const x = point.x + lateralX * side * offset - body.x, z = point.z + lateralZ * side * offset - body.z;
      return Math.hypot(x, z) >= Math.hypot(point.x - body.x, point.z - body.z)
        && (x * forwardX + z * forwardZ < 0 || Math.abs(x * forwardZ - z * forwardX) >= SIDESTEP_CLEAR_METRES);
    });
    for (const offset of SIDESTEP_OFFSETS_METRES) for (const side of [away, -away]) {
      if (!offTheWay(side, offset)) continue;
      if (!this.sidestepClear(state, point, lateralX * side, lateralZ * side, offset)) continue;
      state.asideTarget = side * offset; return true;
    }
    return false;
  }

  private sidestepClear(state: ActorState, point: { x: number; z: number }, directionX: number, directionZ: number, offset: number): boolean {
    const here = this.sampler.sampleGround(point.x, point.z, this.ground), height = here.height, offCourse = here.offCourse;
    const reach = offset + state.spec.hull.halfWidthMetres;
    for (const along of [offset * 0.5, offset, reach]) {
      const there = this.sampler.sampleGround(point.x + directionX * along, point.z + directionZ * along, this.ground);
      if (!(Math.abs(there.height - height) <= SIDESTEP_MAXIMUM_RISE_METRES && there.normal.y >= SIDESTEP_MINIMUM_NORMAL_Y
        && there.offCourse === offCourse)) return false;
    }
    const raycastObstacle = this.sampler.raycastObstacle;
    return raycastObstacle === undefined || raycastObstacle.call(this.sampler, { x: point.x, y: height + SIDESTEP_MAXIMUM_RISE_METRES + 0.05, z: point.z },
      { x: directionX, y: 0, z: directionZ }, reach, state.spec.hull.halfLengthMetres) === null;
  }

  /**
   * A rider across this actor's path ahead, or pressed against it while
   * travelling along its path (from behind or head-on). One crossing it is
   * left by walking on: a step aside runs along his line, ahead of him.
   */
  private occupantInTheWay(state: ActorState, people: readonly PopulationOccupant[]): boolean {
    // Nobody within a few metres is nobody in the way: no path sweep is paid for them.
    const here = state.pose.footprint;
    if (!people.some(person => Math.hypot(person.current.x - here.x, person.current.z - here.z) < SIDESTEP_NEAR_METRES)) return false;
    const body = grow(actorFootprint(state.pose), R.humanWaitingGapMetres), heading = pathPoint(state.path.path, state.distance).headingY;
    return !this.pathClearOfPeople(state, people) || people.some(person => (staticContact(body, person.current)?.gap ?? Infinity) <= 0
      && Math.abs(Math.cos(person.current.headingY - heading)) >= SIDESTEP_ALONG_PATH_COSINE);
  }

  /** Whether its own path, from beside this actor to its look-ahead, is clear of every rider's body by the waiting gap. */
  private pathClearOfPeople(state: ActorState, people: readonly PopulationOccupant[]): boolean {
    const onPath = { ...state, aside: 0 }, from = grow(this.makePose(onPath, 0, 0, 0).footprint, R.humanWaitingGapMetres);
    const to = grow(this.prospective(onPath, state.direction * state.spec.speedMetresPerSecond * R.humanLookAheadSeconds), R.humanWaitingGapMetres);
    return people.every(person => sweepPopulationHulls(from, to, person.current, person.current) === null);
  }

  /**
   * Whether this actor may begin turning round on the spot beside the riders
   * now. Walkers and joggers turn through a rider pressed against them
   * (R2C-5). Anything wider waits until no rider stands inside its turning
   * circle: an NPC wheel's square sweeps 0.27 m past its face, so turned
   * round against a rider it froze mid-turn and refused his reverse too
   * (2026-10-04, browser m7 long-ride pin).
   */
  private turnSweepClear(state: ActorState, people: readonly PopulationOccupant[]): boolean {
    if (turnsThroughRiders(state.spec.kind)) return true;
    const hull = state.spec.hull;
    const reach = Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres) + R.contactSkinMetres;
    const circle = grow(actorFootprint(state.pose), reach - Math.min(hull.halfWidthMetres, hull.halfLengthMetres));
    return people.every(person => (staticContact(circle, person.current)?.gap ?? Infinity) > 0);
  }

  /** Path an actor would have once turned round, metres; 0 for one that never turns. */
  private turnRoom(state: ActorState): number {
    const { spec } = state;
    if (vehicle(spec.kind) || spec.movement === 'stationary' || state.pause > 0 || state.turning) return 0;
    if (spec.movement === 'loop') return Infinity;
    if (spec.kind === 'worker') {
      if (state.workerLeg === 'work') return 0;
      return Math.abs(state.distance - (state.workerLeg === 'outbound' ? state.workerAnchor : state.workerTarget));
    }
    return state.direction === 1 ? state.distance : state.path.path.lengthMetres - state.distance;
  }

  private refreshActorActivity(state: ActorState, signedSpeed = state.pose.speedMetresPerSecond): void {
    const pose = state.pose;
    state.pose = { ...pose, ...(signedSpeed === 0 ? { velocityX: 0, velocityZ: 0,
      speedMetresPerSecond: 0, backing: false,
      footprint: { ...pose.footprint, velocityX: 0, velocityZ: 0 } } : {}),
      ...actorActivity(state, this.clock, signedSpeed) };
  }

  private stopAtFraction(state: ActorState, fraction: number): void {
    const before = this.previousActor(state.spec.id)!;
    // Fraction is relative to the current already bounded original candidate.
    // Route/history counters stay on their authored distance frame; the body
    // remains on the exact endpoint-linear CCD/render trajectory.
    const candidate = state.pose;
    const held = fraction === 1 ? copyPose(candidate) : mixActorPose(before, candidate, fraction);
    const length = state.path.path.lengthMetres;
    const distance = state.previousDistance + state.stepTravel * fraction;
    state.distance = state.spec.movement === 'loop' ? ((distance % length) + length) % length : clamp(distance, 0, length);
    state.gaitDistance = state.stepGaitStart + Math.abs(state.stepTravel) * fraction;
    state.wheelTravel = state.stepWheelStart + (state.wheelTravel - state.stepWheelStart) * fraction;
    state.heading = held.headingY;
    state.direction = state.stepStartDirection; state.pause = state.stepStartPause;
    state.turning = state.stepStartTurning; state.workerLeg = state.stepStartWorkerLeg;
    state.aside = state.stepStartAside + (state.aside - state.stepStartAside) * fraction;
    state.stepTravel *= fraction; state.speed = 0;
    state.pose = { ...held, velocityX: 0, velocityZ: 0, speedMetresPerSecond: 0, backing: false,
      distanceMetres: state.distance, direction: state.direction, gaitDistanceMetres: state.gaitDistance,
      wheelTravelMetres: state.wheelTravel,
      footprint: { ...held.footprint, velocityX: 0, velocityZ: 0 },
      ...actorActivity(state, this.clock, 0) };
  }

  /**
   * Controller movement calls this before committing contact/travel facts.
   * It changes neither actor travel nor pair edges, so repeated probes cannot
   * award repeated impacts or advance the shared clock.
   */
  previewMotion(occupant: PopulationOccupant, stationaryActors = false): PopulationMotionPreview | null {
    this.validateOccupants([occupant]);
    if (occupant.reset || occupant.teleported) return null;
    let earliest: PopulationMotionPreview | null = null;
    for (let index = 0; index < this.states.length; index += 1) {
      const state = this.states[index];
      const last = actorFootprint(state.pose);
      const first = stationaryActors ? last : actorFootprint(this.previous.actors[index]);
      const hit = sweepPopulationHulls(first, last, occupant.previous, occupant.current);
      if (!hit) continue;
      const firstGap = staticContact(first, occupant.previous)?.gap ?? Infinity;
      const lastGap = staticContact(last, occupant.current)?.gap ?? Infinity;
      // An existing overlap must be allowed to escape. Recovery clearance
      // prevents new ones; an escaping pair is not a fresh impact.
      if (hit.initiallyOverlapping && lastGap > firstGap + R.epsilon) continue;
      const travel = Math.hypot(occupant.current.x - occupant.previous.x,
        occupant.current.z - occupant.previous.z);
      const skinFraction = R.contactSkinMetres / Math.max(travel, R.contactSkinMetres);
      const pair = this.pairs.get(occupant.id)?.get(state.spec.id);
      const relativeX = occupant.current.velocityX - last.velocityX;
      const relativeZ = occupant.current.velocityZ - last.velocityZ;
      const result: PopulationMotionPreview = { ...hit, actorId: state.spec.id,
        allowedMoveFraction: Math.max(0, hit.timeOfImpact - skinFraction),
        closingSpeedMetresPerSecond: Math.max(0,
          -(relativeX * hit.normalX + relativeZ * hit.normalZ)),
        chargeImpact: !hit.initiallyOverlapping && !(pair?.overlapping ?? false)
          && (pair?.cooldown ?? 0) <= 0 };
      if (!earliest || result.timeOfImpact < earliest.timeOfImpact) earliest = result;
    }
    return earliest;
  }

  /**
   * Call exactly once after rider/controller movement, before referees and pose
   * publication. Repeat reads within a tick return copies of the same answer.
   * Supplying only the pane's rider would violate the one-world contract.
   */
  prepareContacts(intents: readonly PopulationOccupant[]): PopulationPreparedContacts {
    if (this.contactsTick === this.tick) throw new Error('Population contacts already committed for this tick');
    const people=this.validateOccupants(intents);
    const motions=this.states.map((state,index)=>({id:state.spec.id,
      previous:actorFootprint(this.previous.actors[index]),current:actorFootprint(state.pose)}));
    return {...resolvePopulationMotionBatch(motions,people),tick:this.tick,
      intents:people.map(value=>({...value,previous:{...value.previous},current:{...value.current}}))};
  }

  /** This tick's contacts are published, so its actor motion is final (snapshot bodies). */
  get contactsCommitted(): boolean { return this.contactsTick === this.tick; }

  /** Original uncommitted actor candidates, detached from live state and hull storage. */
  actorMotions(): readonly PopulationActorMotion[] {
    if (this.contactsTick === this.tick) throw new Error('Population actor motion tick is already committed');
    return this.states.map((state, index) => ({ id: state.spec.id,
      previous: detachedFootprint(actorFootprint(this.previous.actors[index])),
      current: detachedFootprint(actorFootprint(state.pose)) }));
  }

  /** Keep public actorMotions detached; this explicitly immutable port allows
   * one complete transaction to reuse its original candidates without copying. */
  actorMotionCensus(): PopulationActorMotionCensus {
    if (this.contactsTick === this.tick) throw new Error('Population actor motion tick is already committed');
    if (this.issuedActorCensus?.snapshot === this.current) return this.issuedActorCensus.census;
    const actors = this.actorMotions();
    for (const actor of actors) {
      for (const body of [actor.previous, actor.current]) {
        if (body.sourceHull) { Object.freeze(body.sourceHull.hull); Object.freeze(body.sourceHull); }
        Object.freeze(body);
      }
      Object.freeze(actor);
    }
    const census = Object.freeze({ tick: this.tick, actors: Object.freeze(actors) });
    this.issuedActorCensus = { snapshot: this.current, census };
    return census;
  }

  /**
   * Adapt one final compound batch without publishing actor stops or cooldowns.
   * The callback is composition-root supplied: this module has no runtime
   * import of populationCompound, which itself imports the hull sweep here.
   */
  prepareCompoundContacts(intents: readonly PopulationOccupant[],
    components: readonly PopulationCompoundTrajectory[], resolver: PopulationCompoundResolver,
    options: PopulationCompoundPrepareOptions = {}): PopulationPreparedContacts {
    if (this.contactsTick === this.tick) throw new Error('Population contacts already committed for this tick');
    const people = this.validateOccupants(intents), peopleById = new Map(people.map(value => [value.id, value]));
    const excluded = new Set<string>();
    for (const id of options.coarseExcludedOwnerIds ?? []) {
      if (!id || !peopleById.has(id) || excluded.has(id)) {
        throw new Error('Coarse exclusions need distinct known owner identities');
      }
      excluded.add(id);
    }
    const componentByKey = new Map<string, PopulationCompoundTrajectory>();
    const key = (ownerId: string, componentId: string): string => `${ownerId}/${componentId}`;
    for (const component of components) {
      const identity = key(component.ownerId, component.componentId);
      if (!peopleById.has(component.ownerId) || !component.componentId || !component.stopGroupId
        || componentByKey.has(identity)) throw new Error('Compound preparation needs distinct known owner/component identities');
      if (excluded.has(component.ownerId)) throw new Error('A coarse-excluded owner cannot supply physical components');
      componentByKey.set(identity, component);
    }
    const continuous = components.filter(value => {
      const owner = peopleById.get(value.ownerId)!; return !owner.teleported && !owner.reset;
    });
    const census = options.actorCensus;
    const issued = this.issuedActorCensus;
    if (census && (!issued || issued.census !== census || issued.snapshot !== this.current
      || census.tick !== this.tick)) throw new Error('Stale or foreign population actor motion census');
    const actors = census?.actors ?? this.actorMotions(), actorIds = new Set(actors.map(value => value.id));
    const batch = resolver(actors, continuous);
    const fraction = (value: number): number => {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError('Compound fractions must lie in [0,1]');
      return value;
    };
    const actorFractions: Record<string, number> = {};
    for (const [id, value] of Object.entries(batch.actorFractions)) {
      if (!actorIds.has(id)) throw new Error('Compound preparation returned an unknown actor');
      actorFractions[id] = fraction(value);
    }
    for (const actor of actors) actorFractions[actor.id] ??= 1;
    const physicalFinalByOwner: Record<string, readonly PopulationPhysicalComponent[]> = Object.create(null);
    const occupantFractions: Record<string, number> = Object.create(null);
    for (const person of people) {
      const owned = components.filter(value => value.ownerId === person.id);
      const supplied = options.physicalFinalByOwner?.[person.id];
      const accepted = supplied ?? owned.map(component => {
        const stop = fraction(batch.componentFractions[key(person.id, component.componentId)] ?? 1);
        return { componentId: component.componentId, footprint: component.at(stop) };
      });
      if (!person.teleported && !person.reset && !excluded.has(person.id) && accepted.length === 0) {
        throw new Error('Every continuous physical owner needs accepted components');
      }
      const seen = new Set<string>();
      physicalFinalByOwner[person.id] = accepted.map(value => {
        if (!value.componentId || seen.has(value.componentId)
          || !componentByKey.has(key(person.id, value.componentId))) throw new Error('Invalid accepted physical component identity');
        assertFootprint(value.footprint); seen.add(value.componentId);
        return { componentId: value.componentId, footprint: detachedFootprint(value.footprint) };
      });
      if (seen.size !== owned.length) throw new Error('Accepted physical endpoints must include the complete owner component set');
      const stops = owned.map(component => fraction(batch.componentFractions[key(person.id, component.componentId)] ?? 1));
      occupantFractions[person.id] = fraction(options.ownerFractions?.[person.id] ?? Math.min(1, ...stops));
    }
    for (const id of Object.keys(options.physicalFinalByOwner ?? {})) {
      if (!peopleById.has(id)) throw new Error('Accepted physical endpoint has an unknown owner');
    }
    for (const id of Object.keys(options.ownerFractions ?? {})) {
      if (!peopleById.has(id)) throw new Error('Owner fraction has an unknown owner');
    }
    const sorted = [...batch.hits];
    for (const hit of sorted) {
      if (excluded.has(hit.ownerId)) throw new Error('A coarse-excluded owner cannot produce a physical hit');
      if (!actorIds.has(hit.actorId) || !peopleById.has(hit.ownerId)
        || !componentByKey.has(key(hit.ownerId, hit.componentId))) throw new Error('Compound hit has an unknown physical identity');
      const person = peopleById.get(hit.ownerId)!;
      if (person.teleported || person.reset) throw new Error('Discontinuous placement cannot produce a compound sweep hit');
      if (![hit.timeOfImpact, hit.normalX, hit.normalZ, hit.penetrationMetres,
        hit.actorVelocityX, hit.actorVelocityZ, hit.componentVelocityX, hit.componentVelocityZ].every(Number.isFinite)
        || hit.timeOfImpact < 0 || hit.timeOfImpact > 1 || hit.penetrationMetres < 0) {
        throw new RangeError('Compound hit needs finite physical evidence');
      }
    }
    sorted.sort((a, b) => a.timeOfImpact - b.timeOfImpact || a.actorId.localeCompare(b.actorId)
      || a.ownerId.localeCompare(b.ownerId) || a.componentId.localeCompare(b.componentId));
    const pairs = new Set<string>(), hits: PopulationBatchHit[] = [], componentImpacts: PopulationComponentImpact[] = [];
    for (const hit of sorted) {
      const pair = JSON.stringify([hit.actorId, hit.ownerId]);
      if (pairs.has(pair)) continue;
      pairs.add(pair);
      const footprint = componentByKey.get(key(hit.ownerId, hit.componentId))!.at(hit.timeOfImpact);
      assertFootprint(footprint);
      const impact = detachedFootprint(footprint);
      hits.push({ timeOfImpact: hit.timeOfImpact, normalX: hit.normalX, normalZ: hit.normalZ,
        penetrationMetres: hit.penetrationMetres, initiallyOverlapping: hit.initiallyOverlapping,
        currentlyOverlapping: hit.currentlyOverlapping, actorId: hit.actorId, occupantId: hit.ownerId,
        actorVelocityX: hit.actorVelocityX, actorVelocityZ: hit.actorVelocityZ,
        occupantVelocityX: hit.componentVelocityX, occupantVelocityZ: hit.componentVelocityZ,
        componentId: hit.componentId, componentFootprint: impact });
      componentImpacts.push({ actorId: hit.actorId, occupantId: hit.ownerId,
        componentId: hit.componentId, footprint: detachedFootprint(impact) });
    }
    return { tick: this.tick, actorFractions, occupantFractions, hits, physicalFinalByOwner, componentImpacts,
      intents: people.map(value => ({ ...value, previous: detachedFootprint(value.previous),
        current: detachedFootprint(value.current) })) };
  }

  /** Pure controller response from the selected global transaction. */
  preparedMotion(prepared: PopulationPreparedContacts,id:string): PopulationMotionPreview|null {
    if(prepared.tick!==this.tick)throw new Error('Stale population contact transaction');
    const hit=prepared.hits.filter(value=>value.occupantId===id)
      .sort((a,b)=>a.timeOfImpact-b.timeOfImpact||a.actorId.localeCompare(b.actorId))[0];
    if(!hit)return null;
    const pair=this.pairs.get(id)?.get(hit.actorId);
    const relativeX=hit.occupantVelocityX-hit.actorVelocityX;
    const relativeZ=hit.occupantVelocityZ-hit.actorVelocityZ;
    return {...hit,allowedMoveFraction:prepared.occupantFractions[id]??1,
      closingSpeedMetresPerSecond:Math.max(0,-(relativeX*hit.normalX+relativeZ*hit.normalZ)),
      chargeImpact:!hit.initiallyOverlapping&&!(pair?.overlapping??false)&&(pair?.cooldown??0)<=0};
  }

  /** Current candidate's stopped actor bodies for a pure precommit placement query. */
  actorBodiesAtFractions(actorFractions: Readonly<Record<string, number>>): readonly PopulationActorMotion[] {
    return this.states.map((state, index) => {
      const fraction = actorFractions[state.spec.id] ?? 1;
      if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
        throw new RangeError('Actor stop fractions must lie in [0,1]');
      }
      const copy = { ...state }; this.stopAtFraction(copy, fraction);
      return { id: state.spec.id, previous: detachedFootprint(actorFootprint(this.previous.actors[index])),
        current: detachedFootprint(copy.pose.footprint) };
    });
  }

  preparedActorBodies(prepared:PopulationPreparedContacts):readonly PopulationActorMotion[]{
    if(prepared.tick!==this.tick)throw new Error('Stale population contact transaction');
    return this.actorBodiesAtFractions(prepared.actorFractions);
  }

  preparedStandoff(prepared:PopulationPreparedContacts,occupant:PopulationOccupant):PopulationMotionPreview|null{
    let earliest:PopulationMotionPreview|null=null;
    for(const actor of this.preparedActorBodies(prepared)){
      const hit=sweepPopulationHulls(actor.current,actor.current,occupant.previous,occupant.current);
      if(!hit)continue;
      const start=staticContact(actor.current,occupant.previous),end=staticContact(actor.current,occupant.current);
      if(hit.initiallyOverlapping&&(end?.gap??Infinity)>(start?.gap??Infinity)+R.epsilon)continue;
      const travel=Math.hypot(occupant.current.x-occupant.previous.x,occupant.current.z-occupant.previous.z);
      const value:PopulationMotionPreview={...hit,actorId:actor.id,
        allowedMoveFraction:Math.max(0,hit.timeOfImpact-R.contactSkinMetres/Math.max(travel,R.contactSkinMetres)),
        closingSpeedMetresPerSecond:0,chargeImpact:false};
      if(!earliest||value.timeOfImpact<earliest.timeOfImpact)earliest=value;
    }
    return earliest;
  }

  /** Publish actor stops and pair edges only after every controller is ready. */
  commitContacts(prepared: PopulationPreparedContacts,
    occupants: readonly PopulationOccupant[]):readonly PopulationContact[] {
    if(prepared.tick!==this.tick||this.contactsTick===this.tick)throw new Error('Stale or consumed population contact transaction');
    const people=this.validateOccupants(occupants),contacts:PopulationContact[]=[];
    for(const state of this.states){
      const fraction=prepared.actorFractions[state.spec.id]??1;
      if(fraction<1)this.stopAtFraction(state,fraction);
    }
    for(const person of people){
      if(person.teleported||person.reset){this.pairs.delete(person.id);continue;}
      let pairMap=this.pairs.get(person.id);
      if(!pairMap){pairMap=new Map();this.pairs.set(person.id,pairMap);}
      for(const state of this.states){
        let pair=pairMap.get(state.spec.id);
        if(!pair){pair={cooldown:0,overlapping:false,apart:0};pairMap.set(state.spec.id,pair);}
        const raw=prepared.hits.find(value=>value.actorId===state.spec.id&&value.occupantId===person.id);
        if(!raw){pair.apart+=this.stepDt;pair.overlapping&&=pair.apart<CONTACT_REARM_SECONDS-R.epsilon;continue;}
        pair.apart=0;
        const accepted = prepared.physicalFinalByOwner?.[person.id];
        const actorBody = actorFootprint(state.pose);
        const end = accepted ? accepted.map(value => staticContact(actorBody, value.footprint))
          .filter((value): value is StaticContact => value !== null)
          .sort((a, b) => a.gap - b.gap)[0] ?? null : staticContact(actorBody, person.current);
        const overlapping=end!==null&&end.gap<=R.epsilon;
        const charge=!pair.overlapping&&pair.cooldown<=0;
        pair.overlapping=true;
        if(charge){pair.cooldown=R.contactCooldownSeconds;state.impactUntil=this.clock+R.impactPauseSeconds;
          // A rider's push is a rider in the way: its wait runs through the pause (R2C-5).
          if(state.blockedBy!==OCCUPANT_WAIT){state.blockedBy=OCCUPANT_WAIT;state.blockedSeconds=0;}
          state.blockedGait=state.gaitDistance;}
        const relativeX=raw.occupantVelocityX-raw.actorVelocityX,relativeZ=raw.occupantVelocityZ-raw.actorVelocityZ;
        const intent=prepared.intents.find(value=>value.id===person.id)??person;
        const impact = raw.componentFootprint
          ?? prepared.componentImpacts?.find(value => value.actorId === raw.actorId && value.occupantId === person.id
            && value.componentId === raw.componentId)?.footprint
          ?? mixBody(intent.previous,intent.current,raw.timeOfImpact);
        const finalImpactBody = accepted?.find(value => value.componentId === raw.componentId)?.footprint ?? person.current;
        const separation=overlapping?Math.min(R.separationMetresPerSecond*this.stepDt,
          Math.max(0,-end!.gap)+R.contactSkinMetres):0;
        contacts.push({...raw,actorKind:state.spec.kind,occupantKind:person.kind,charge,
          currentlyOverlapping:overlapping,penetrationMetres:end?Math.max(0,-end.gap):0,
          relativeSpeedMetresPerSecond:Math.hypot(relativeX,relativeZ),
          closingSpeedMetresPerSecond:Math.max(0,-(relativeX*raw.normalX+relativeZ*raw.normalZ)),
          impactX:impact.x+raw.normalX*R.contactSkinMetres,impactZ:impact.z+raw.normalZ*R.contactSkinMetres,
          allowedMoveFraction:prepared.occupantFractions[person.id]??1,
          // Diagnostic displacement only. The game commits the integrator's
          // prepared prefix; it never applies an x/z rollback from this row.
          sweepCorrectionX:!raw.initiallyOverlapping&&raw.timeOfImpact<1
            ?impact.x+raw.normalX*R.contactSkinMetres-finalImpactBody.x:0,
          sweepCorrectionZ:!raw.initiallyOverlapping&&raw.timeOfImpact<1
            ?impact.z+raw.normalZ*R.contactSkinMetres-finalImpactBody.z:0,
          separationX:raw.initiallyOverlapping?raw.normalX*separation:0,
          separationZ:raw.initiallyOverlapping?raw.normalZ*separation:0});
      }
    }
    for(const[id]of this.pairs)if(!people.some(person=>person.id===id))this.pairs.delete(id);
    for(const state of this.states)if(state.impactUntil>this.clock)
      this.refreshActorActivity(state);
    this.publish();this.contacts=contacts;this.contactsTick=this.tick;
    return copyContacts(contacts);
  }

  queryContacts(occupants:readonly PopulationOccupant[],
    motionIntents:readonly PopulationOccupant[]=[]):readonly PopulationContact[]{
    if(this.contactsTick===this.tick)return copyContacts(this.contacts);
    const intended=new Map(this.validateOccupants(motionIntents).map(value=>[value.id,value]));
    const prepared=this.prepareContacts(this.validateOccupants(occupants).map(value=>intended.get(value.id)??value));
    return this.commitContacts(prepared,occupants);
  }

  /** Recovery candidates must pass this and the caller's static terrain/hazard checks. */
  recoveryClearance(footprint: PopulationFootprint, occupants: readonly PopulationOccupant[] = [],
    reservations: readonly PopulationReservation[] = [], marginMetres: number = R.recoveryMarginMetres,
    actorBodies?:readonly PopulationActorMotion[]): PopulationClearance {
    assertFootprint(footprint);
    if (!Number.isFinite(marginMetres) || marginMetres < 0) throw new RangeError('Invalid recovery margin');
    const query = grow(footprint, marginMetres);
    const touches = (body: PopulationFootprint): boolean => {
      const contact = staticContact(query, body); return contact !== null && contact.gap <= R.epsilon;
    };
    const actorIds = actorBodies?actorBodies.filter(value=>touches(value.current)).map(value=>value.id)
      :this.current.actors.filter(actor => touches(actorFootprint(actor))).map(actor => actor.id);
    // A downed rider or cop never holds another body's recovery (RP-7,
    // 2026-10-03): two riders who crash together lie across each other's
    // safe points, and each refusing the other held both down for good.
    // Mounted occupants, NPC actors and reservations still refuse.
    const occupantIds = this.validateOccupants(occupants)
      .filter(person => person.downed !== true && touches(person.current)).map(person => person.id);
    const reservationIds = this.activeReservations(reservations).filter(item => touches(item.footprint)).map(item => item.id);
    return { clear: actorIds.length + occupantIds.length + reservationIds.length === 0,
      actorIds, occupantIds, reservationIds };
  }
}

export function createPopulationSimulation(plan: PopulationPlan, sampler: TerrainSampler): PopulationSimulation {
  return new PopulationSimulation(plan, sampler);
}
