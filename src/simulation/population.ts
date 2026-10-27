/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Shared living-world fixed-step movement, yield and physical contact owner.
 * One instance owns the world's fixed-step clock; presentation only reads it.
 */
import type { ActorKind, ActorSpec, PopulationPath, PopulationPlan } from '../level/populationPlan.ts';
import { clamp, lerp, wrapAngle } from '../shared/maths.ts';
import { createGroundSample, type TerrainSampler } from './world.ts';
import { createPopulationSupportTargetsRecord, populationSupportTargetsInto, type PopulationGroundSupport,
  type PopulationSupportInput } from '../shared/populationSupport.ts';
import { recordType } from '../shared/plainRecord.ts';
import { createPopulationPrismScratch, physicalPopulationHullInto, physicalPopulationPrism, transformPopulationHullLowerInto, type MutablePopulationHullCorner, type PopulationHullSource } from '../shared/populationHull.ts';
import { coarseActorMotionWorldAabbAt } from '../shared/occupancyBroadphase.ts';
export { physicalPopulationHull, transformPopulationHull } from '../shared/populationHull.ts';

import type { PopulationCompoundActorMotion, PopulationCompoundMotionBatch,
  PopulationCompoundTrajectory } from './populationCompound.ts';

import { compactAnticipationBlocker, type PopulationCompactAnticipation } from './populationCompactAnticipation.ts';
import { createRouteBlockerTerms, routeAnticipation, routeBrakingSpeedCap, type RouteAnticipationBlocker,
  type RouteAnticipationResult } from './populationRouteAnticipation.ts';
import { POPULATION, POPULATION_REACTION, POPULATION_TRAFFIC } from '../data/tuning.ts';
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
/** `trimLaneEnds`: the path sampling step, and the shortest path left that is still trimmed; metres. */
const LANE_END_SAMPLE_METRES = 0.25;
const LANE_END_MINIMUM_METRES = 4;
/** `stepAsideForPathmate` checks the routes of loop vehicles within this of the spot, metres. */
const PATHMATE_VEHICLE_REACH_METRES = 30;
/** Farther than this from every rider, a walker has no rider in its way (its look-ahead, both bodies and the gap), metres. */
const SIDESTEP_NEAR_METRES = 6;
/** M47 living-r2: extra growth of the route-scan broad phase's box past the scan's own widest reach, metres (rounding room only). */
const ROUTE_SCAN_BOX_SLACK_METRES = 0.05;
/** M47 living-r2: the bare hull's slack when checking that a squeeze clears the whole route ahead, metres. */
const SQUEEZE_SLACK_METRES = 0.01;
/** M47 living-r2: a step's travel past which a loop vehicle's native hold no longer counts as unbroken, metres. */
const NATIVE_HOLD_PROGRESS_METRES = 0.001;
/** M47 living-r2: `standingHit`'s sampling step along the route and its slack for the step and a modest grade, metres. */
const STANDING_HIT_STEP_METRES = 0.25;
const STANDING_HIT_SLACK_METRES = 0.15;
/** M47 living-r2: how much nearer than where it starts a person already inside the grown body must come to count, metres. */
const STANDING_HIT_NEARER_METRES = 0.01;
/** M47 living-r2: a vehicle whose target without its crossing hold is above this is held by that hold alone (patience), m/s. */
const PATIENCE_READY_METRES_PER_SECOND = 0.05;

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

/**
 * **Immutable once formed.** Every change makes a new pose: nothing writes a
 * pose, its footprint, `sourceHull`, hull, `supportHeights` or support records
 * in place. A fixed step's epoch start shares these objects with the last
 * published snapshot instead of deep-copying them (PERF-POP), so an in-place
 * write would silently move the epoch start too. `populationPerfExactness.test.ts`
 * deep-freezes them while riding to keep it so; public readers still detach.
 */
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
  /**
   * M42: present only while a knock-down plays (activity `'impacted'`), never
   * as an undefined key: every stagger row, and so every digest, is unchanged.
   */
  readonly impactReaction?: 'knockdown';
  /** With `impactReaction`: the fall direction, radians from this actor's own
   * heading (same sense), away from the rider who crashed into them. */
  readonly impactFallYaw?: number;
}

export interface PopulationSnapshot {
  readonly tick: number;
  readonly clockSeconds: number;
  readonly actors: readonly PopulationActorPose[];
}
/**
 * Each published actor's id and detached physical footprint, in snapshot
 * order, with the snapshot's clock: exactly `snapshot()`'s `id`/`footprint`
 * and `clockSeconds`, without copying the rest of every pose (PERF-POP).
 */
export interface PopulationActorFootprintRows {
  readonly clockSeconds: number;
  readonly actors: readonly { readonly id: string; readonly footprint: PopulationFootprint }[];
}

/** Caller-owned presentation storage contains no physical hull or live support record. */
export type PopulationPresentationPose = { -readonly [K in 'id' | 'kind' | 'x' | 'y' | 'z' | 'headingY'
  | 'speedMetresPerSecond' | 'gaitDistanceMetres' | 'wheelTravelMetres' | 'activity'
  | 'activityPhase' | 'activityBlend' | 'backing' | 'groundNormalX' | 'groundNormalY' | 'groundNormalZ']:
  PopulationActorPose[K] } & {
  footSupports?: [MutablePopulationGroundSupport, MutablePopulationGroundSupport];
  tyreSupports?: [MutablePopulationGroundSupport, MutablePopulationGroundSupport,
    MutablePopulationGroundSupport, MutablePopulationGroundSupport];
  /** Copied while the source row carries them, deleted otherwise (the storage is reused). */
  impactReaction?: 'knockdown';
  impactFallYaw?: number;
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
  /** M42: the length of the pause `impactUntil` ends (a stagger's
   * `impactPauseSeconds`, a knock-down's own), which reaction it is, and a
   * knock-down's fall direction from the heading, radians. */
  impactSeconds: number;
  reaction: 'stagger' | 'knockdown';
  fallYaw: number;
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
  /**
   * M47 living-r2: where a shuttle turns round, path distances: 0 and the
   * length but where a path end lies in a loop's lane, there the lane's edge
   * (`trimLaneEnds`; Codex's audit, 2026-10-26: pavements that end in a lane
   * left a walker standing in it, nose to nose with a van). Read only on living-r2.
   */
  shuttleLow: number;
  shuttleHigh: number;
  /** M47 living-r2: the loop vehicle or pathmate it stood aside for (-1: a rider, or none); it comes back once that one and its own path are clear too. */
  asideFor: number;
  pose: PopulationActorPose;
  previousDistance: number;
  stepTravel: number;
  stepGaitStart: number;
  stepWheelStart: number;
  stepStartDirection: 1 | -1;
  stepStartPause: number;
  stepStartTurning: boolean;
  stepStartWorkerLeg: ActorState['workerLeg'];
  /** M48: the spec's hull, detached once; every pose and source frame of this actor shares it (never written). */
  hull: ActorSpec['hull'];
}

/**
 * M48 (PLANS §48): the crowd's per-step records are built by constructors
 * (`recordType`), never object or array literals, so V8 has no allocation site
 * to pretenure them by. In most High sessions it had made them straight in old
 * memory (~28 MB/s, a full collection every ~12 s). Each keeps its former
 * literal's key order, and every footprint and source frame has one of two
 * shapes (with and without the source frame; with and without its margin).
 */
const GroundSupport = recordType<PopulationGroundSupport, [number, number, number, number, number, number]>(
  function (x, y, z, normalX, normalY, normalZ) {
    this.x = x; this.y = y; this.z = z; this.normalX = normalX; this.normalY = normalY; this.normalZ = normalZ;
  });
const HullSource = recordType<PopulationHullSource, [number, number, number, number, number, number, number,
  PopulationHullSource['hull'], number | undefined, number | undefined, number | undefined]>(
  function (x, y, z, headingY, normalX, normalY, normalZ, hull, below, above, margin) {
    this.x = x; this.y = y; this.z = z; this.headingY = headingY;
    this.normalX = normalX; this.normalY = normalY; this.normalZ = normalZ; this.hull = hull;
    if (below !== undefined) this.verticalPaddingBelowMetres = below;
    if (above !== undefined) this.verticalPaddingAboveMetres = above;
    if (margin !== undefined) this.marginMetres = margin;
  });
const LocalHull = recordType<PopulationHullSource['hull'], [number, number, number]>(
  function (halfWidthMetres, halfLengthMetres, heightMetres) {
    this.halfWidthMetres = halfWidthMetres; this.halfLengthMetres = halfLengthMetres; this.heightMetres = heightMetres;
  });
const Footprint = recordType<PopulationFootprint, [number, number, number, number, number, number, number, number, number,
  PopulationHullSource | undefined]>(
  function (x, z, headingY, halfWidthMetres, halfLengthMetres, minY, maxY, velocityX, velocityZ, sourceHull) {
    this.x = x; this.z = z; this.headingY = headingY; this.halfWidthMetres = halfWidthMetres;
    this.halfLengthMetres = halfLengthMetres; this.minY = minY; this.maxY = maxY;
    this.velocityX = velocityX; this.velocityZ = velocityZ;
    if (sourceHull !== undefined) this.sourceHull = sourceHull;
  });
const ActorPose = recordType<PopulationActorPose, [string, ActorKind, number, number, number, number, number, number, number,
  number, number, number, PopulationActivity, number, number, boolean, string, number, 1 | -1, ActorSpec['hull'],
  PopulationFootprint, PopulationActorPose['supportHeights'], PopulationActorPose['footSupports'], PopulationActorPose['tyreSupports'],
  number, number, number, number, number, number | undefined]>(
  function (id, kind, appearanceIndex, x, y, z, headingY, velocityX, velocityZ, speedMetresPerSecond, gaitDistanceMetres,
    wheelTravelMetres, activity, activityPhase, activityBlend, backing, pathId, distanceMetres, direction, hull,
    footprint, supportHeights, footSupports, tyreSupports, groundNormalX, groundNormalY, groundNormalZ, groundPitch, groundRoll,
    impactFallYaw) {
    this.id = id; this.kind = kind; this.appearanceIndex = appearanceIndex; this.x = x; this.y = y; this.z = z;
    this.headingY = headingY; this.velocityX = velocityX; this.velocityZ = velocityZ;
    this.speedMetresPerSecond = speedMetresPerSecond; this.gaitDistanceMetres = gaitDistanceMetres;
    this.wheelTravelMetres = wheelTravelMetres; this.activity = activity; this.activityPhase = activityPhase;
    this.activityBlend = activityBlend; this.backing = backing; this.pathId = pathId; this.distanceMetres = distanceMetres;
    this.direction = direction; this.hull = hull; this.footprint = footprint; this.supportHeights = supportHeights;
    if (footSupports !== undefined) this.footSupports = footSupports;
    if (tyreSupports !== undefined) this.tyreSupports = tyreSupports;
    this.groundNormalX = groundNormalX; this.groundNormalY = groundNormalY; this.groundNormalZ = groundNormalZ;
    this.groundPitch = groundPitch; this.groundRoll = groundRoll;
    // Knocked down: `impactFallYaw` is the fall direction; otherwise both keys are absent.
    if (impactFallYaw !== undefined) { this.impactReaction = 'knockdown'; this.impactFallYaw = impactFallYaw; }
  });
/**
 * `predictBody` for an actor's own footprint (`Footprint`/`HullSource` key
 * order, as every pose and prospective footprint is built); a rider's body
 * keeps `predictBody`, which copies whatever keys and order it came with.
 */
function predictActorBody(body: PopulationFootprint, seconds: number): PopulationFootprint {
  const dx = body.velocityX * seconds, dz = body.velocityZ * seconds, source = body.sourceHull;
  return new Footprint(body.x + dx, body.z + dz, body.headingY, body.halfWidthMetres, body.halfLengthMetres,
    body.minY, body.maxY, body.velocityX, body.velocityZ, source === undefined ? undefined
      : new HullSource(source.x + dx, source.y, source.z + dz, source.headingY, source.normalX, source.normalY, source.normalZ,
        source.hull, source.verticalPaddingBelowMetres, source.verticalPaddingAboveMetres, source.marginMetres));
}

const finite = (...values: number[]): boolean => values.every(Number.isFinite);
/** A motion's padded coarse box: its slot in this step's `BoxArena`, or `NO_BOX`. */
type MotionBounds = number;
const NO_BOX = -1;
/**
 * Step-scoped motion boxes (M47 follow-up, 2026-10-26), six doubles a slot in
 * one typed array: minX, maxX, minY, maxY, minZ, maxZ. `motionBounds` takes a
 * slot per motion and `step` releases them all as it begins. Every bounded
 * motion is formed and read inside one step (forecasts, the look and
 * candidate boxes, the actual motions), so no slot is read after its release.
 * At High these were about 26 fresh boxes per actor per step, each number its
 * own heap box. `data` is replaced when it grows: read it after `take`.
 */
class BoxArena {
  data = new Float64Array(6 * 512);
  private used = 0;
  release(): void { this.used = 0; }
  take(): number {
    if (6 * (this.used + 1) > this.data.length) {
      const grown = new Float64Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }
    return this.used++;
  }
}
interface BoundedMotion {
  readonly from: PopulationFootprint;
  readonly to: PopulationFootprint;
  readonly bounds: MotionBounds;
  nativeFraction?: number;
  nativeTo?: PopulationFootprint;
  /** PERF-POP: mixBody(from, to, 0/1) and mixBody(from, nativeTo, 0/1), formed on a
   * motion's first sweep. Pure in the immutable endpoints, so later sweeps reuse them;
   * the native pair records the `nativeTo` it was formed from (`nativeEndpointsOf`). */
  first?: PopulationFootprint;
  last?: PopulationFootprint;
  nativeFirst?: PopulationFootprint;
  nativeLast?: PopulationFootprint;
  nativeEndpointsOf?: PopulationFootprint;
  /** PERF-WHARF: the actor's persistent slot for these endpoints across steps (`wholeEndpoints`). */
  readonly memo?: EndpointMemo;
}
/**
 * One actor motion's whole endpoints from the step that last formed them, with
 * the very bodies they were formed from (PERF-WHARF, 2026-10-23). mixBody is
 * pure in the values it reads, so a motion whose two bodies carry the same
 * values (`sameMixInput`) has the same endpoints: the Wharf's 68 standing
 * people re-formed theirs, four grade-hull rebuilds each, every step.
 */
/** One actor's last two grown bodies (`PopulationSimulation.grownFor`), slot `next` replaced first. */
interface GrownMemo {
  readonly body: [PopulationFootprint | undefined, PopulationFootprint | undefined];
  readonly margin: [number, number];
  readonly grown: [PopulationFootprint | undefined, PopulationFootprint | undefined];
  next: number;
}
interface EndpointMemo { from?: PopulationFootprint; to?: PopulationFootprint; first?: PopulationFootprint; last?: PopulationFootprint }
/** Every value mixBody can read from one body (either branch), compared exactly. */
function sameMixInput(a: PopulationFootprint, b: PopulationFootprint): boolean {
  if (a === b) return true;
  if (!(Object.is(a.x, b.x) && Object.is(a.z, b.z) && Object.is(a.headingY, b.headingY)
    && Object.is(a.halfWidthMetres, b.halfWidthMetres) && Object.is(a.halfLengthMetres, b.halfLengthMetres)
    && Object.is(a.minY, b.minY) && Object.is(a.maxY, b.maxY) && Object.is(a.velocityX, b.velocityX)
    && Object.is(a.velocityZ, b.velocityZ))) return false;
  const p = a.sourceHull, q = b.sourceHull;
  if (p === undefined || q === undefined) return p === q;
  return Object.is(p.x, q.x) && Object.is(p.y, q.y) && Object.is(p.z, q.z) && Object.is(p.headingY, q.headingY)
    && Object.is(p.normalX, q.normalX) && Object.is(p.normalY, q.normalY) && Object.is(p.normalZ, q.normalZ)
    && Object.is(p.marginMetres, q.marginMetres) && Object.is(p.verticalPaddingBelowMetres, q.verticalPaddingBelowMetres)
    && Object.is(p.verticalPaddingAboveMetres, q.verticalPaddingAboveMetres)
    && Object.is(p.hull.halfWidthMetres, q.hull.halfWidthMetres) && Object.is(p.hull.halfLengthMetres, q.hull.halfLengthMetres)
    && Object.is(p.hull.heightMetres, q.hull.heightMetres);
}
/** The two sweep endpoints of a whole motion, formed once (first, then last: the sweep's own order). */
function wholeEndpoints(motion: BoundedMotion): void {
  if (motion.first !== undefined) return;
  const memo = motion.memo;
  if (memo !== undefined && memo.first !== undefined && sameMixInput(memo.from!, motion.from) && sameMixInput(memo.to!, motion.to)) {
    motion.first = memo.first; motion.last = memo.last; return;
  }
  motion.first = mixBody(motion.from, motion.to, 0); motion.last = mixBody(motion.from, motion.to, 1);
  if (memo !== undefined) { memo.from = motion.from; memo.to = motion.to; memo.first = motion.first; memo.last = motion.last; }
}
/**
 * The same for a blocker's native prefix (from -> nativeTo). Keyed by the very
 * `nativeTo` object, so a prefix re-formed at another horizon's fraction (a
 * reservation swept by a walker and then a vehicle) can never reuse a stale pair.
 */
function nativeEndpoints(motion: BoundedMotion): void {
  if (motion.nativeEndpointsOf !== motion.nativeTo) {
    motion.nativeFirst = mixBody(motion.from, motion.nativeTo!, 0); motion.nativeLast = mixBody(motion.from, motion.nativeTo!, 1);
    motion.nativeEndpointsOf = motion.nativeTo;
  }
}
/** A caller-local endpoint pair (one actor iteration's own look or candidate). */
interface SweepTrack { readonly from: PopulationFootprint; readonly to: PopulationFootprint; first?: PopulationFootprint; last?: PopulationFootprint }
function trackEndpoints(track: SweepTrack): void {
  if (track.first === undefined) { track.first = mixBody(track.from, track.to, 0); track.last = mixBody(track.from, track.to, 1); }
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
function motionBounds(from: PopulationFootprint, to: PopulationFootprint, boxes: BoxArena): MotionBounds {
  // A stationary motion validates its one body once (a pure predicate).
  if (!boundableFootprint(from) || (to !== from && !boundableFootprint(to))) return NO_BOX;
  // The coarse box is this step's own slot (`BoxArena`); it is padded in place.
  const slot = boxes.take(), box = boxes.data, at = 6 * slot;
  coarseActorMotionWorldAabbAt(from, to, box, at);
  const padding = R.contactSkinMetres + R.epsilon;
  if (!(Number.isFinite(box[at]) && Number.isFinite(box[at + 1]) && Number.isFinite(box[at + 2])
    && Number.isFinite(box[at + 3]) && Number.isFinite(box[at + 4]) && Number.isFinite(box[at + 5]))) return NO_BOX;
  box[at] = box[at] - padding; box[at + 1] = box[at + 1] + padding;
  box[at + 2] = box[at + 2] - padding; box[at + 3] = box[at + 3] + padding;
  box[at + 4] = box[at + 4] - padding; box[at + 5] = box[at + 5] + padding;
  return slot;
}
/** Whether two motions' boxes overlap; a motion with no box meets everything. */
function mayMeet(boxes: BoxArena, first: MotionBounds, second: MotionBounds): boolean {
  if (first === NO_BOX || second === NO_BOX) return true;
  const box = boxes.data, a = 6 * first, b = 6 * second;
  return box[a] <= box[b + 1] && box[a + 1] >= box[b]
    && box[a + 2] <= box[b + 3] && box[a + 3] >= box[b + 2]
    && box[a + 4] <= box[b + 5] && box[a + 5] >= box[b + 4];
}
/** M48: every bounded motion has one shape: the fields formed later start undefined (they are only ever compared to undefined). */
const Motion = recordType<BoundedMotion, [PopulationFootprint, PopulationFootprint, MotionBounds, EndpointMemo | undefined]>(
  function (from, to, bounds, memo) {
    this.from = from; this.to = to; this.bounds = bounds; this.nativeFraction = undefined; this.nativeTo = undefined;
    this.first = undefined; this.last = undefined; this.nativeFirst = undefined; this.nativeLast = undefined;
    this.nativeEndpointsOf = undefined; this.memo = memo;
  });
const boundedMotion = (from: PopulationFootprint, to: PopulationFootprint, boxes: BoxArena, memo?: EndpointMemo): BoundedMotion =>
  new Motion(from, to, motionBounds(from, to, boxes), memo);
/** One actor's committed motion in `step`'s contact pass: bare, and grown by its waiting gap. */
interface ActualMotion {
  readonly original: BoundedMotion; readonly grown: BoundedMotion;
  readonly turnsInPlace: boolean; readonly sidestep: boolean; readonly slidesPast: boolean;
}
const ActualMotion = recordType<ActualMotion, [BoundedMotion, BoundedMotion, boolean, boolean, boolean]>(
  function (original, grown, turnsInPlace, sidestep, slidesPast) {
    this.original = original; this.grown = grown; this.turnsInPlace = turnsInPlace; this.sidestep = sidestep; this.slidesPast = slidesPast;
  });
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
/** M48: `grow` for an actor's own footprint (`Footprint`/`HullSource` key order), built by constructors. */
function growActor(body: PopulationFootprint, margin: number): PopulationFootprint {
  const source = body.sourceHull;
  return new Footprint(body.x, body.z, body.headingY, body.halfWidthMetres + margin, body.halfLengthMetres + margin,
    body.minY, body.maxY, body.velocityX, body.velocityZ, source === undefined ? undefined
      : new HullSource(source.x, source.y, source.z, source.headingY, source.normalX, source.normalY, source.normalZ,
        source.hull, source.verticalPaddingBelowMetres, source.verticalPaddingAboveMetres, (source.marginMetres ?? 0) + margin));
}

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
/**
 * True when `body` lies wholly behind `own`'s rear bumper along the heading it
 * travels (`travelY`), with a small tolerance (Quay traffic, 2026-10-21).
 *
 * A vehicle's forward route can never meet such a body, and the body behind
 * owns that meeting in its own route scan. Counting it held a stopped leader
 * still under its own follower's padded box, and the two waited on each other
 * for good: every Quay van loop froze nose to tail within minutes. Native
 * contact, which still sweeps every blocker, is unchanged.
 *
 * The caller passes sin/cos of `travelY` (fx, fz) and of the body's heading
 * (bx, bz): formed once per vehicle and once per body a step (PERF-WHARF),
 * where every vehicle formed all four for every pair.
 */
function whollyBehindAlong(own: PopulationFootprint, fx: number, fz: number, body: PopulationFootprint, bx: number, bz: number): boolean {
  const along = (body.x - own.x) * fx + (body.z - own.z) * fz;
  const reach = Math.abs(body.halfLengthMetres * (bx * fx + bz * fz)) + Math.abs(body.halfWidthMetres * (bz * fx - bx * fz));
  return along + reach < -own.halfLengthMetres - 0.05;
}

/**
 * M47 living-r2 broad phase for a route-scan row that may turn or carry a pad
 * (a rider's compact part, a reservation): whether its centres' box, grown by
 * its whole rotation radius and its pad, can meet the scan's box. The scan's
 * own yaw extents never exceed that radius. A non-finite row is kept (the scan refuses it).
 */
function turningRowMayReach(row: RouteAnticipationBlocker, box: ScanBox): boolean {
  const from = row.from, to = row.to;
  const radius = Math.hypot(Math.max(from.halfWidthMetres, to.halfWidthMetres), Math.max(from.halfLengthMetres, to.halfLengthMetres)) + (row.pad ?? 0);
  return !(Math.min(from.x, to.x) - radius > box.maxX || Math.max(from.x, to.x) + radius < box.minX
    || Math.min(from.z, to.z) - radius > box.maxZ || Math.max(from.z, to.z) + radius < box.minZ);
}

/** The source path's own heading at `distance`, turned round for reverse travel. */
function travelHeading(path: PopulationPath, distance: number, direction: 1 | -1): number {
  let low = 0, high = path.points.length - 1;
  while (high - low > 1) { const middle = (low + high) >>> 1; if (path.points[middle].distanceMetres <= distance) low = middle; else high = middle; }
  const a = path.points[low], b = path.points[Math.min(low + 1, path.points.length - 1)];
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  return direction === 1 ? heading : heading + Math.PI;
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

/** mixBody's plumb prism, written in place: read at once and never kept. */
const MIX_PRISM = createPopulationPrismScratch();
function mixBody(a: PopulationFootprint, b: PopulationFootprint, t: number): PopulationFootprint {
  if (a.sourceHull && b.sourceHull) {
    const first = a.sourceHull, last = b.sourceHull;
    const x = lerp(first.x, last.x, t), y = lerp(first.y, last.y, t), z = lerp(first.z, last.z, t);
    const headingY = first.headingY + wrapAngle(last.headingY - first.headingY) * t;
    const hull = new LocalHull(lerp(first.hull.halfWidthMetres, last.hull.halfWidthMetres, t),
      lerp(first.hull.halfLengthMetres, last.hull.halfLengthMetres, t), lerp(first.hull.heightMetres, last.hull.heightMetres, t));
    const mixed = physicalPopulationHullInto(x, y, z, headingY,
      lerp(first.normalX, last.normalX, t), lerp(first.normalY, last.normalY, t), lerp(first.normalZ, last.normalZ, t),
      hull, lerp(a.velocityX, b.velocityX, t), lerp(a.velocityZ, b.velocityZ, t), null, MIX_PRISM);
    const margin = lerp(first.marginMetres ?? 0, last.marginMetres ?? 0, t);
    const below = lerp(first.verticalPaddingBelowMetres ?? 0, last.verticalPaddingBelowMetres ?? 0, t);
    const above = lerp(first.verticalPaddingAboveMetres ?? 0, last.verticalPaddingAboveMetres ?? 0, t);
    // The padded body and its grow(margin), built as one object: the same
    // fields, sums and key order without the intermediate copies (PERF-R2-2).
    // M47 follow-up: and without the hull's prism, source frame and hull copy
    // (the fresh `hull` above is the frame's own). A fresh frame has no
    // margin, so its grow is `0 + margin`, as `(undefined ?? 0) + margin` was.
    // M48: the same values and key order, built by `Footprint`/`HullSource`.
    return new Footprint(mixed.x, mixed.z, mixed.headingY, mixed.halfWidthMetres + margin, mixed.halfLengthMetres + margin,
      mixed.minY - below, mixed.maxY + above, mixed.velocityX, mixed.velocityZ,
      new HullSource(x, y, z, headingY, mixed.normalX, mixed.normalY, mixed.normalZ, hull, below, above, 0 + margin));
  }
  return new Footprint(lerp(a.x, b.x, t), lerp(a.z, b.z, t), a.headingY + wrapAngle(b.headingY - a.headingY) * t,
    lerp(a.halfWidthMetres, b.halfWidthMetres, t), lerp(a.halfLengthMetres, b.halfLengthMetres, t),
    lerp(a.minY, b.minY, t), lerp(a.maxY, b.maxY, t), lerp(a.velocityX, b.velocityX, t), lerp(a.velocityZ, b.velocityZ, t), undefined);
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
  // A recursive child's endpoint is exactly its parent's endpoint or the same
  // original-track midpoint. Carry those values rather than rebuilding hulls.
  // A body held for the whole interval (the same object at both ends, as every
  // static start/end test passes it) mixes to one value at any t >= 0: each
  // lerp(v, v, t) is v + (+0) and wrapAngle(+0) is +0, and a non-finite field
  // throws at t = 0 or is NaN at both. Its end is its start (PERF-WHARF, 2026-10-23).
  const firstA = mixBody(a0, a1, 0), lastA = a1 === a0 ? firstA : mixBody(a0, a1, 1);
  const firstB = mixBody(b0, b1, 0), lastB = b1 === b0 ? firstB : mixBody(b0, b1, 1);
  return sweepHullsWithEndpoints(a0, a1, b0, b1, firstA, lastA, firstB, lastB);
}
/** sweepPopulationHulls with its four mixBody endpoints supplied by a caller that formed them once. */
function sweepHullsWithEndpoints(a0: PopulationFootprint, a1: PopulationFootprint,
  b0: PopulationFootprint, b1: PopulationFootprint, firstA: PopulationFootprint, lastA: PopulationFootprint,
  firstB: PopulationFootprint, lastB: PopulationFootprint): PopulationHullContact | null {
  const start = staticContact(a0, b0);
  const initiallyOverlapping = start !== null && start.gap < -R.epsilon;
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
    // M42: a knock-down's channels exist only while one plays; reused storage drops them after.
    if (source.impactReaction !== undefined) {
      target.impactReaction = source.impactReaction; target.impactFallYaw = source.impactFallYaw ?? 0;
    } else if ('impactReaction' in target || 'impactFallYaw' in target) {
      delete target.impactReaction; delete target.impactFallYaw;
    }
  }
}
const copyContacts = (contacts: readonly PopulationContact[]): readonly PopulationContact[] => contacts.map(value => ({ ...value,
  ...(value.componentFootprint ? { componentFootprint: detachedFootprint(value.componentFootprint) } : {}) }));

/** The activity name alone; `direction` is the frame's own (a forecast's start direction). */
function activityKind(state: ActorState, clock: number, signedSpeed: number, direction: 1 | -1): PopulationActivity {
  const { spec } = state;
  const impacted = state.impactUntil > clock;
  return impacted ? 'impacted'
    : spec.kind === 'social' ? 'social' : spec.kind === 'parkedVehicle' ? 'parked'
      : spec.kind === 'worker' && state.workerLeg === 'work' ? 'working'
        : state.turning && state.pause <= 0 ? 'turning'
          : state.pause > 0 || state.waiting || Math.abs(signedSpeed) <= R.epsilon ? 'waiting'
            : spec.kind === 'jogger' ? 'jogging' : spec.kind === 'fictionalEuc' ? 'riding'
              : vehicle(spec.kind) ? direction === -1 ? 'reversing' : 'driving' : 'walking';
}
/** Activity is independent of an already sealed physical/support footprint. */
function actorActivity(state: ActorState, clock: number, signedSpeed: number): Pick<PopulationActorPose,
  'activity' | 'activityPhase' | 'activityBlend'> {
  const { spec } = state;
  const activity = activityKind(state, clock, signedSpeed, state.direction);
  const activityPhase = activity === 'working' || activity === 'waiting'
    ? spec.idleSeconds > 0 ? clamp(1 - state.pause / spec.idleSeconds, 0, 1) : 0
    : activity === 'social' ? fract(clock / Math.max(spec.idleSeconds, R.maximumStepSeconds))
      : activity === 'impacted' ? clamp(1 - (state.impactUntil - clock) / state.impactSeconds, 0, 1)
        : fract(state.gaitDistance);
  return { activity, activityPhase, activityBlend: spec.kind === 'social' || activity === 'working' ? 1
    : spec.speedMetresPerSecond > 0 ? clamp(Math.abs(signedSpeed) / spec.speedMetresPerSecond, 0, 1) : 0 };
}

/** M42: who can be knocked down — people on foot; NPC wheel riders and vehicles keep the stagger. */
const knockdownKind = (kind: ActorKind): boolean => kind === 'walker' || kind === 'jogger' || kind === 'worker' || kind === 'social';
/** M42: a knock-down is playing (it holds the person still for all of it). */
const knockedDown = (state: ActorState, clock: number): boolean => state.reaction === 'knockdown' && state.impactUntil > clock;
/**
 * M42: a row carries the knock-down's channels exactly while one plays and
 * never otherwise, not even as undefined keys. Without one this returns the
 * same row, so a stagger's rows are bit-identical to before.
 */
function withImpactReaction(pose: PopulationActorPose, state: ActorState, clock: number): PopulationActorPose {
  if (knockedDown(state, clock)) return { ...pose, impactReaction: 'knockdown', impactFallYaw: state.fallYaw };
  if (!('impactReaction' in pose) && !('impactFallYaw' in pose)) return pose;
  const { impactReaction: _reaction, impactFallYaw: _fallYaw, ...rest } = pose;
  return rest;
}

/**
 * One forecast's boxed actor motions in X order (PERF-WHARF, 2026-10-23):
 * their box minima sorted, the widest box, and how many have a box at all
 * (the boxless sort last). `XOrder` is the actor's storage kept between steps
 * per horizon, so the insertion sort starts from last step's nearly right order.
 */
interface XOrder { readonly order: number[]; readonly key: Float64Array; readonly minX: Float64Array }
interface ForecastXIndex { readonly order: readonly number[]; readonly minX: Float64Array; readonly width: number; readonly boxed: number }
function forecastXIndex(actors: readonly BoundedMotion[], store: XOrder, boxes: BoxArena): ForecastXIndex {
  const { order, key, minX } = store, box = boxes.data;
  let width = 0, boxed = 0;
  for (let other = 0; other < actors.length; other += 1) {
    const bounds = actors[other].bounds;
    if (bounds === NO_BOX) { key[other] = Infinity; continue; }
    key[other] = box[6 * bounds]; boxed += 1; width = Math.max(width, box[6 * bounds + 1] - box[6 * bounds]);
  }
  for (let at = 1; at < order.length; at += 1) {
    const value = order[at], k = key[value];
    let to = at - 1;
    while (to >= 0 && key[order[to]] > k) { order[to + 1] = order[to]; to -= 1; }
    order[to + 1] = value;
  }
  for (let at = 0; at < boxed; at += 1) minX[at] = key[order[at]];
  return { order, minX, width, boxed };
}
/**
 * The other actors (never `index`) whose blocker mayMeet could accept against
 * `query`, ascending: the order the full loop visited them in, so who is waited
 * on is recorded in the same order. Every one left out is one mayMeet refuses:
 * its box starts right of the query's end, or starts so far left that even the
 * widest box (padded well past any rounding) ends before the query begins. A
 * held actor's stationary blocker and a boxless motion are always included,
 * as is everyone when the query itself has no box (mayMeet accepts all then).
 * The callers still ask mayMeet of each, so this only skips sure refusals.
 */
function actorCandidates(forecast: { actors: readonly BoundedMotion[]; xStore: XOrder; xIndex?: ForecastXIndex }, query: MotionBounds,
  index: number, held: Float64Array, stamp: number, heldCandidates: readonly number[], out: number[], boxes: BoxArena): number[] {
  out.length = 0;
  const actors = forecast.actors;
  if (query === NO_BOX) { for (let other = 0; other < actors.length; other += 1) if (other !== index) out.push(other); return out; }
  const xIndex = forecast.xIndex ??= forecastXIndex(actors, forecast.xStore, boxes);
  const { order, minX, width, boxed } = xIndex;
  const queryMinX = boxes.data[6 * query], queryMaxX = boxes.data[6 * query + 1];
  const lower = queryMinX - width - 1e-6 * (1 + Math.abs(queryMinX) + width), upper = queryMaxX;
  let low = 0, high = boxed;
  while (low < high) { const middle = (low + high) >>> 1; if (minX[middle] < lower) low = middle + 1; else high = middle; }
  for (let at = low; at < boxed && minX[at] <= upper; at += 1) {
    const other = order[at];
    if (other !== index && held[other] !== stamp) out.push(other);
  }
  for (let at = boxed; at < order.length; at += 1) { const other = order[at]; if (other !== index && held[other] !== stamp) out.push(other); }
  for (const other of heldCandidates) if (held[other] === stamp) out.push(other);
  // Ascending (a short list, nearly in order already only by chance).
  for (let at = 1; at < out.length; at += 1) {
    const value = out[at];
    let to = at - 1;
    while (to >= 0 && out[to] > value) { out[to + 1] = out[to]; to -= 1; }
    out[to + 1] = value;
  }
  return out;
}

/** A crossing's corner extents, fixed once per plan instead of per priority query. */
interface CrossingExtent { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
/**
 * M47 living-r2: one run of a closed loop where a vehicle's body overlaps one
 * pedestrian-priority crossing polygon, as centre path distances: the run
 * starts at `entry` (in [0, length of the loop)) and lasts `length`, across
 * the seam if it must. Each polygon keeps its own runs (`zonesFor`).
 */
interface CrossingZone { readonly entry: number; readonly length: number }
/**
 * M47 living-r2: one arm of a loop's neck (`POPULATION_TRAFFIC.neck*`), a run
 * of centre distances like a crossing zone. Arms of one neck conflict with
 * each other; an `exclusive` arm also conflicts with itself (one vehicle at a time).
 */
interface LoopArm extends CrossingZone { readonly neck: number; readonly exclusive: boolean }
/** The world box a living-r2 route scan's swept car can reach (`routeScanBox`), reused per vehicle. */
interface ScanBox { minX: number; maxX: number; minZ: number; maxZ: number }
/** wrap(value) into [0, length). */
const wrapDistance = (value: number, length: number): number => ((value % length) + length) % length;
/**
 * M47 living-r2 IDM-style following (`POPULATION_TRAFFIC`): the speed one step
 * of a(v, s, Δv) leaves, never below zero. `gap` is the bumper gap along the
 * loop, `closing` the speed at which it shrinks. No gap left is a stop.
 */
function followingSpeedCap(speed: number, freeSpeed: number, gap: number, closing: number, dt: number): number {
  if (!(gap > 0) || !(freeSpeed > 0)) return 0;
  const a = POPULATION_TRAFFIC.accelerationMetresPerSecondSquared, b = POPULATION_TRAFFIC.comfortableBrakingMetresPerSecondSquared;
  const desired = POPULATION_TRAFFIC.standstillGapMetres
    + Math.max(0, speed * POPULATION_TRAFFIC.headwaySeconds + speed * closing / (2 * Math.sqrt(a * b)));
  const ratio = desired / gap;
  const acceleration = a * (1 - (speed / freeSpeed) ** POPULATION_TRAFFIC.accelerationExponent - ratio * ratio);
  // IDM's last metre at walking pace brakes too gently and ends ~0.2 m inside
  // s0: no faster than it could stop at b in what is left of the gap past s0.
  const left = Math.max(0, gap - POPULATION_TRAFFIC.standstillGapMetres);
  return Math.max(0, Math.min(speed + acceleration * dt, Math.sqrt((b * dt) ** 2 + 2 * b * left) - b * dt));
}
/** The SAT gap between two flat oriented boxes (centre, heading, half width, half length): negative when they overlap. */
function flatBoxGap(ax: number, az: number, ah: number, aw: number, al: number,
  bx: number, bz: number, bh: number, bw: number, bl: number): number {
  const ca = Math.cos(ah), sa = Math.sin(ah), cb = Math.cos(bh), sb = Math.sin(bh);
  let gap = -Infinity;
  for (let index = 0; index < 4; index += 1) {
    const c = index < 2 ? ca : cb, s = index < 2 ? sa : sb, along = (index & 1) === 1;
    const axisX = along ? s : c, axisZ = along ? c : -s;
    gap = Math.max(gap, Math.abs((bx - ax) * axisX + (bz - az) * axisZ)
      - supportAt(ca, sa, aw, al, axisX, axisZ) - supportAt(cb, sb, bw, bl, axisX, axisZ));
  }
  return gap;
}
/** Whether an oriented box (centre, heading frame, half extents) overlaps a polygon: SAT, conservative for a concave one. */
function boxOverlapsPolygon(x: number, z: number, heading: number, halfWidth: number, halfLength: number,
  corners: readonly { readonly x: number; readonly z: number }[]): boolean {
  const c = Math.cos(heading), s = Math.sin(heading);
  const test = (axisX: number, axisZ: number): boolean => {
    const centre = x * axisX + z * axisZ;
    const reach = Math.abs(c * axisX - s * axisZ) * halfWidth + Math.abs(s * axisX + c * axisZ) * halfLength;
    let low = Infinity, high = -Infinity;
    for (const corner of corners) { const d = corner.x * axisX + corner.z * axisZ; low = Math.min(low, d); high = Math.max(high, d); }
    return centre + reach >= low && centre - reach <= high;
  };
  if (!test(c, -s) || !test(s, c)) return false;
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index], b = corners[(index + 1) % corners.length];
    const ex = b.x - a.x, ez = b.z - a.z;
    if ((ex !== 0 || ez !== 0) && !test(-ez, ex)) return false;
  }
  return true;
}
/** Conservative broad phase is appropriate for yielding, never contact. */
function touchesCrossingWithin(extent: CrossingExtent, body: PopulationFootprint, radius: number): boolean {
  return body.x >= extent.minX - radius && body.x <= extent.maxX + radius
    && body.z >= extent.minZ - radius && body.z <= extent.maxZ + radius;
}
/**
 * One priority lookahead per actor and epoch. The forecast reads only the
 * epoch's start pose, the clock and these live fields; speed is passed in.
 */
/** One actor's last look-ahead and its keys; M48: one record per actor, rewritten in place. */
interface LookaheadMemo {
  epoch: PopulationSnapshot; start: PopulationActorPose; clock: number;
  seconds: number; direction: 1 | -1; workerLeg: ActorState['workerLeg'];
  pause: number; turning: boolean; waiting: boolean; impactUntil: number;
  footprint: PopulationFootprint;
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
  /**
   * M47 follow-up (2026-10-26): each actor's last two `grow` results, keyed by
   * the very body and the margin (`grownFor`). Footprints are never written
   * in place, so a grown body is a pure function of that pair: one step's
   * grown end pose is the next step's grown start, asked for twice more.
   */
  private grown: GrownMemo[] = [];
  private readonly boxes = new BoxArena();
  /** Route-scan blocker ids, formed once per world rather than per vehicle per step. */
  private actorBlockerIds: readonly string[] = [];
  /** One actor iteration's blocker list (PERF-POP); never read after the iteration. */
  /**
   * The plan's pedestrian-priority pairs, fixed at reset (PERF-WHARF): per
   * pedestrian, the vehicles on a path sharing one of its crossings, and per
   * vehicle, those pedestrians, in index order. `pedestrianPriority` answers
   * false for every other pair before reading anything, so only these are asked.
   * `priorityHeld[other] === priorityStamp` marks one actor iteration's answers.
   */
  private priorityVehicles: readonly (readonly number[])[] = [];
  private priorityPedestrians: readonly (readonly number[])[] = [];
  private priorityHeld = new Float64Array(0);
  private priorityStamp = 0;
  /** One actor iteration's look and candidate move's possible actor blockers (`actorCandidates`). */
  private readonly lookCandidates: number[] = [];
  private readonly nativeCandidates: number[] = [];
  /** The vehicles' route-scan id order and the part/reservation ids it was sorted with (`routeOrderFor`). */
  private routeOrder: readonly number[] = [];
  private routeOrderIds: readonly string[] = [];
  /** Per role (the step's actual motions, its forecasts per horizon) and actor index: last step's endpoints. */
  private endpointMemos = new Map<string, EndpointMemo[]>();
  /** Per forecast horizon, the movers' candidate X order kept between steps (`forecastXIndex`). */
  private xOrders = new Map<number, XOrder>();
  private xOrderFor(seconds: number): XOrder {
    let store = this.xOrders.get(seconds);
    if (store === undefined) {
      const count = this.states.length;
      this.xOrders.set(seconds, store = { order: Array.from({ length: count }, (_, index) => index),
        key: new Float64Array(count), minX: new Float64Array(count) });
    }
    return store;
  }
  private endpointMemoRow(role: string): EndpointMemo[] {
    let memos = this.endpointMemos.get(role);
    if (memos === undefined) this.endpointMemos.set(role, memos = []);
    return memos;
  }
  /** The actor-pair sweep's X order (a permutation kept between steps) and each motion's X extent. */
  private pairOrder: number[] = [];
  private pairLow = new Float64Array(0);
  private pairHigh = new Float64Array(0);
  /** One vehicle's route-scan blocker list (PERF-WHARF); the scan reads it and keeps nothing. */
  private readonly routeBlockerScratch: RouteAnticipationBlocker[] = [];
  /**
   * M47: the plan's living-r2 vehicle rules (`POPULATION_TRAFFIC`), on only for
   * a plan with `vehicleFollowing: 'living-r2'`. Every field below this one is
   * formed and read only then; a living-r1 plan keeps the living-r1 rules bit
   * for bit (the exactness pins: Wharf, town, world, step budget).
   */
  private readonly following: boolean;
  /** Per state: its closed loop's index among the loops carrying traffic vehicles, else -1. */
  private loopId = new Int32Array(0);
  /** Per loop: its traffic vehicles' state indices, ascending. */
  private loopMembers: readonly (readonly number[])[] = [];
  /** Per state: the crossing zones its own body meets on its loop (traffic vehicles only). */
  private crossingZones: readonly (readonly CrossingZone[] | undefined)[] = [];
  /** Zones per loop and hull, formed once per world. */
  private readonly zoneMemo = new Map<string, readonly CrossingZone[]>();
  /** Per state: its loop's neck arms for its own hull (traffic vehicles only); per loop and hull, formed once. */
  private loopArms: readonly (readonly LoopArm[] | undefined)[] = [];
  private readonly armMemo = new Map<string, readonly LoopArm[]>();
  /** Per state: the arms it holds, the arm it waits for (-1 none), since when, and whether only others held it back. */
  private armsHeld: number[][] = [];
  private armWaiting = new Int32Array(0);
  private armWaitingSince = new Float64Array(0);
  private armWaitingReady = new Uint8Array(0);
  /** Per state: the standing actors no pose of its own round its loop can meet (`standingClear`). */
  private standingClear: readonly (ReadonlySet<number> | undefined)[] = [];
  private readonly standingMemo = new Map<string, ReadonlySet<number>>();
  /**
   * Per state (traffic vehicles): seconds held on end by pedestrian priority
   * alone, and the crossings it has claimed by its patience (empty: none).
   */
  private holdSeconds = new Float64Array(0);
  private patience: CrossingExtent[][] = [];
  /** Per state: at its last step its pedestrian priority alone held it (1), so people wait for its claim. */
  private patienceReady = new Uint8Array(0);
  /** Vehicle path -> every accepted crossing extent on it, and pedestrian path -> vehicle path -> the same extents as a set. */
  private readonly vehicleCrossings = new Map<string, readonly CrossingExtent[]>();
  private readonly crossingSets = new Map<string, Map<string, ReadonlySet<CrossingExtent>>>();
  /** Each accepted crossing extent's own polygon: a person is on a crossing by its polygon (`onCrossing`). */
  private readonly crossingCorners = new Map<CrossingExtent, readonly { readonly x: number; readonly z: number }[]>();
  /**
   * Per vehicle: the crossings its priority look-ahead enters this step (its
   * look-ahead touches, its body does not), the tick and direction they were
   * formed for. Only those can grant anyone priority over it (`priorityOver`).
   */
  private entering: CrossingExtent[][] = [];
  private enteringTick = new Float64Array(0);
  private enteringDirection = new Int8Array(0);
  /** Per vehicle, four numbers: the world box (minX, maxX, minZ, maxZ) round its `entering` crossings. */
  private enteringBox = new Float64Array(0);
  /** Per path: its seam turn and its largest XZ-per-path-metre scale, for the scan's broad phase. */
  private readonly pathScanTerms = new Map<string, { readonly seamTurn: number; readonly metric: number }>();
  private readonly scanBox: ScanBox = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  /** One vehicle's standing and pinned people for `standingHit` (reused), and the travel the last hit left. */
  private readonly standingScratch: number[] = [];
  private readonly pinnedScratch: number[] = [];
  private standingHitTravel = 0;
  /** Per state (loop vehicles): the person native contact held its move against this step (-1 none), and since when it has been that one. */
  private nativeBlocker = new Int32Array(0);
  private nativeHeldBy = new Int32Array(0);
  private nativeHeldSeconds = new Float64Array(0);
  private readonly lowerCorners: readonly MutablePopulationHullCorner[] = [
    { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  /**
   * M47 follow-up (2026-10-26): makePose's and prospectiveFrom's plumb prism,
   * support input and support targets, written in place and read at once. A
   * kept footprint, support or pose is always a fresh record built from them.
   */
  private readonly prism = createPopulationPrismScratch();
  private readonly supportInput: { -readonly [K in keyof PopulationSupportInput]: PopulationSupportInput[K] } = {
    kind: '', appearanceIndex: 0, x: 0, y: 0, z: 0, headingY: 0, speedMetresPerSecond: 0, gaitDistanceMetres: 0,
    activity: '', groundNormalX: 0, groundNormalY: 1, groundNormalZ: 0, hull: { halfWidthMetres: 1, halfLengthMetres: 1, heightMetres: 1 } };
  private readonly supportTargets = createPopulationSupportTargetsRecord();
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
    this.following = this.plan.vehicleFollowing === 'living-r2';
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
      if (this.following) this.crossingCorners.set(extent, crossing.corners);
      if (this.following) for (const vehiclePathId of crossing.vehiclePathIds) {
        const list = (this.vehicleCrossings.get(vehiclePathId) ?? []) as CrossingExtent[];
        if (!list.includes(extent)) list.push(extent);
        this.vehicleCrossings.set(vehiclePathId, list);
      }
    }
    if (this.following) for (const [pedestrianPathId, byVehicle] of this.crossingIndex) {
      const sets = new Map<string, ReadonlySet<CrossingExtent>>();
      for (const [vehiclePathId, list] of byVehicle) sets.set(vehiclePathId, new Set(list));
      this.crossingSets.set(pedestrianPathId, sets);
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
        impactUntil: 0, impactSeconds: R.impactPauseSeconds, reaction: 'stagger', fallYaw: 0,
        waiting: false, waitingOn: [], blockedBy: -1, blockedSeconds: 0, blockedGait: 0, turnedAt: -Infinity,
        aside: 0, asideTarget: 0, stepStartAside: 0, asideStalled: 0, asideFor: -1, shuttleLow: 0, shuttleHigh: 0, pose: {} as PopulationActorPose,
        previousDistance: spec.initialDistanceMetres, stepTravel: 0, stepGaitStart: 0,
        stepWheelStart: 0, stepStartDirection: spec.direction, stepStartPause: 0,
        stepStartTurning: false, stepStartWorkerLeg: 'work', hull: { ...spec.hull } };
      state.pose = this.makePose(state, 0, 0); return state;
    });
    this.stateIndex.clear(); this.lookaheads = []; this.grown = [];
    this.states.forEach((state, index) => this.stateIndex.set(state.spec.id, index));
    this.actorBlockerIds = this.states.map(state => `actor:${state.spec.id}`);
    const shareCrossing = (person: ActorState, traffic: ActorState): boolean => !vehicle(person.spec.kind) && vehicle(traffic.spec.kind)
      && this.crossingIndex.get(person.spec.pathId)?.has(traffic.spec.pathId) === true;
    this.priorityVehicles = this.states.map((person, index) => this.states.flatMap((traffic, other) =>
      other !== index && shareCrossing(person, traffic) ? [other] : []));
    this.priorityPedestrians = this.states.map((traffic, index) => this.states.flatMap((person, other) =>
      other !== index && shareCrossing(person, traffic) ? [other] : []));
    this.priorityHeld = new Float64Array(this.states.length); this.priorityStamp = 0;
    this.pairOrder = this.states.map((_, index) => index); this.endpointMemos.clear();
    this.routeOrder = []; this.routeOrderIds = []; this.xOrders.clear();
    this.pairLow = new Float64Array(this.states.length); this.pairHigh = new Float64Array(this.states.length);
    if (this.following) this.resetTraffic();
    this.publish(); this.previous = copySnapshot(this.current);
  }

  /**
   * `shuttleLow` / `shuttleHigh` for the living-r2 roster: a walker's or jogger's path end
   * is moved back along the path, in `LANE_END_SAMPLE_METRES` steps, until
   * its body (grown by the waiting gap and `STANDING_HIT_SLACK_METRES`) is
   * clear of every loop's lane (the loop's centreline, its widest vehicle's
   * half width and the loop's waiting gap). A path left shorter than
   * `LANE_END_MINIMUM_METRES` keeps its ends.
   */
  private trimLaneEnds(): void {
    const lanes = this.loopMembers.map(members => {
      const path = this.states[members[0]].path.path;
      const halfWidth = Math.max(...members.map(index => this.states[index].spec.hull.halfWidthMetres));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const point of path.points) {
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
      }
      return { points: path.points, reach: halfWidth + POPULATION_TRAFFIC.waitingGapMetres, minX, maxX, minZ, maxZ };
    });
    const inLane = (x: number, z: number, radius: number): boolean => lanes.some(lane => {
      const reach = lane.reach + radius;
      if (x < lane.minX - reach || x > lane.maxX + reach || z < lane.minZ - reach || z > lane.maxZ + reach) return false;
      for (let index = 1; index < lane.points.length; index += 1) {
        const a = lane.points[index - 1], b = lane.points[index], dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz;
        const t = squared > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / squared, 0, 1) : 0;
        if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < reach) return true;
      }
      return false;
    });
    for (const state of this.states) {
      const { spec } = state, length = state.path.path.lengthMetres;
      state.shuttleLow = 0; state.shuttleHigh = length;
      if ((spec.kind !== 'walker' && spec.kind !== 'jogger') || spec.movement !== 'shuttle') continue;
      const radius = Math.hypot(spec.hull.halfWidthMetres, spec.hull.halfLengthMetres) + R.humanWaitingGapMetres + STANDING_HIT_SLACK_METRES;
      const clearFrom = (start: number, step: number): number => {
        for (let along = start; along >= 0 && along <= length; along += step) {
          const point = pathPoint(state.path.path, along);
          if (!inLane(point.x, point.z, radius)) return along;
        }
        return start;
      };
      const low = clearFrom(0, LANE_END_SAMPLE_METRES), high = clearFrom(length, -LANE_END_SAMPLE_METRES);
      if (high - low < LANE_END_MINIMUM_METRES) continue;
      state.shuttleLow = low; state.shuttleHigh = high;
    }
  }

  /**
   * M47 living-r2: each closed loop's traffic vehicles (state indices,
   * ascending), each one's crossing zones and the per-step priority storage.
   * Formed only for a plan with `vehicleFollowing`; nothing else reads them.
   */
  private resetTraffic(): void {
    const count = this.states.length, loops = new Map<string, number[]>();
    this.loopId = new Int32Array(count).fill(-1);
    const zones: (readonly CrossingZone[] | undefined)[] = [], arms: (readonly LoopArm[] | undefined)[] = [];
    const clear: (ReadonlySet<number> | undefined)[] = [];
    this.states.forEach((state, index) => {
      const { spec } = state;
      if (spec.kind !== 'trafficVehicle' || spec.movement !== 'loop' || !state.path.path.closed) return;
      let members = loops.get(spec.pathId);
      if (!members) loops.set(spec.pathId, members = []);
      members.push(index);
      zones[index] = this.zonesFor(state.path.path, spec.hull);
      arms[index] = this.armsFor(state.path.path, spec.hull);
      clear[index] = this.standingClearOf(state.path.path, spec.hull);
    });
    this.loopMembers = [...loops.values()];
    this.loopMembers.forEach((members, loop) => { for (const index of members) this.loopId[index] = loop; });
    this.crossingZones = zones; this.loopArms = arms; this.standingClear = clear;
    this.armsHeld = this.states.map(() => []);
    this.armWaiting = new Int32Array(count).fill(-1); this.armWaitingSince = new Float64Array(count);
    this.armWaitingReady = new Uint8Array(count);
    this.holdSeconds = new Float64Array(count); this.patience = this.states.map(() => []); this.patienceReady = new Uint8Array(count);
    this.nativeBlocker = new Int32Array(count).fill(-1); this.nativeHeldBy = new Int32Array(count).fill(-1);
    this.nativeHeldSeconds = new Float64Array(count);
    this.entering = this.states.map(() => []);
    this.enteringTick = new Float64Array(count).fill(-1); this.enteringDirection = new Int8Array(count);
    this.enteringBox = new Float64Array(count * 4);
    this.trimLaneEnds();
    for (const state of this.states) if (vehicle(state.spec.kind) && !this.pathScanTerms.has(state.spec.pathId)) {
      const points = state.path.path.points, first = points[0], last = points[points.length - 1];
      let metric = 0;
      for (let index = 1; index < points.length; index += 1) {
        const a = points[index - 1], b = points[index];
        metric = Math.max(metric, Math.hypot(b.x - a.x, b.z - a.z) / (b.distanceMetres - a.distanceMetres));
      }
      this.pathScanTerms.set(state.spec.pathId, { metric,
        seamTurn: state.path.path.closed ? Math.abs(wrapAngle(first.headingY - last.headingY)) : 0 });
    }
  }

  /**
   * The centre runs of a closed loop where a vehicle of this hull overlaps each
   * pedestrian-priority crossing polygon on it, per polygon (a run through the
   * seam is one), each grown by one sample step at both ends. Sampled every
   * `crossingZoneSampleMetres` at the loop's own pose; a polygon whose box the
   * body cannot reach is not tested. Not merged across polygons: the town's
   * chained pads made 30-78 m zones, and behind a slow leader a van waited
   * before the whole chain (copper-drift's longest stand 39 s, 33 s per polygon).
   */
  private zonesFor(path: PopulationPath, hull: ActorSpec['hull']): readonly CrossingZone[] {
    const key = `${path.id}\n${hull.halfWidthMetres}\n${hull.halfLengthMetres}`, known = this.zoneMemo.get(key);
    if (known) return known;
    const polygons = (this.plan.crossings ?? []).filter(crossing => crossing.priority === 'pedestrian'
      && crossing.vehiclePathIds.includes(path.id)).map(crossing => {
      const xs = crossing.corners.map(value => value.x), zs = crossing.corners.map(value => value.z);
      return { corners: crossing.corners, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
    });
    const length = path.lengthMetres, step = POPULATION_TRAFFIC.crossingZoneSampleMetres;
    const reach = Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres);
    const samples = Math.ceil(length / step), zones: CrossingZone[] = [];
    for (const polygon of polygons) {
      const runs: [number, number][] = [];
      let start = -1, previous = -1;
      for (let sample = 0; sample <= samples; sample += 1) {
        const along = Math.min(sample * step, length), point = pathPoint(path, along);
        const touches = point.x >= polygon.minX - reach && point.x <= polygon.maxX + reach
          && point.z >= polygon.minZ - reach && point.z <= polygon.maxZ + reach
          && boxOverlapsPolygon(point.x, point.z, point.headingY, hull.halfWidthMetres, hull.halfLengthMetres, polygon.corners);
        if (touches && start < 0) start = along;
        if (touches) previous = along;
        if ((!touches || sample === samples) && start >= 0) { runs.push([start - step, previous + step]); start = -1; }
      }
      if (runs.length > 1 && runs[0][0] <= 0 && runs[runs.length - 1][1] >= length) {
        const first = runs.shift()!;
        runs[runs.length - 1][1] = length + first[1];
      }
      for (const [from, to] of runs) zones.push(to - from >= length ? { entry: 0, length } : { entry: wrapDistance(from, length), length: to - from });
    }
    this.zoneMemo.set(key, zones);
    return zones;
  }

  /**
   * A closed loop's necks for a vehicle of this hull (`POPULATION_TRAFFIC.neck*`):
   * every pair of sampled poses at least `neckSeparationMetres` apart along the
   * loop whose bodies, one grown by the waiting gap and the slack and the other
   * by the slack, overlap. The poses in such pairs form runs; each run, grown by
   * one sample and the pad and merged with any it then overlaps (across the
   * seam too), is an arm. Arms linked by a pair are one neck; an arm linked to
   * itself is exclusive. Flat boxes at the loop's own pose: the slack covers
   * the sampling and a modest grade.
   */
  private armsFor(path: PopulationPath, hull: ActorSpec['hull']): readonly LoopArm[] {
    const key = `${path.id}\n${hull.halfWidthMetres}\n${hull.halfLengthMetres}`, known = this.armMemo.get(key);
    if (known) return known;
    const T = POPULATION_TRAFFIC, length = path.lengthMetres, step = T.neckSampleMetres;
    const count = Math.max(1, Math.floor(length / step));
    const xs = new Float64Array(count), zs = new Float64Array(count), hs = new Float64Array(count);
    for (let index = 0; index < count; index += 1) {
      const point = pathPoint(path, index * step);
      xs[index] = point.x; zs[index] = point.z; hs[index] = point.headingY;
    }
    const gap = T.waitingGapMetres, slack = T.neckSlackMetres;
    const grownWidth = hull.halfWidthMetres + gap + slack, grownLength = hull.halfLengthMetres + gap + slack;
    const plainWidth = hull.halfWidthMetres + slack, plainLength = hull.halfLengthMetres + slack;
    const reach = Math.hypot(grownWidth, grownLength) + Math.hypot(plainWidth, plainLength);
    const marked = new Uint8Array(count), pairs: number[] = [];
    for (let first = 0; first < count; first += 1) for (let second = first + 1; second < count; second += 1) {
      const apart = (second - first) * step;
      if (Math.min(apart, length - apart) < T.neckSeparationMetres) continue;
      const dx = xs[second] - xs[first], dz = zs[second] - zs[first];
      if (dx * dx + dz * dz > reach * reach) continue;
      if (flatBoxGap(xs[first], zs[first], hs[first], grownWidth, grownLength, xs[second], zs[second], hs[second], plainWidth, plainLength) < 0
        || flatBoxGap(xs[first], zs[first], hs[first], plainWidth, plainLength, xs[second], zs[second], hs[second], grownWidth, grownLength) < 0) {
        marked[first] = 1; marked[second] = 1; pairs.push(first, second);
      }
    }
    if (pairs.length === 0) { this.armMemo.set(key, []); return []; }
    const pad = step + T.neckArmPadMetres, merged: [number, number][] = [];
    for (let index = 0; index < count; index += 1) {
      if (marked[index] === 0) continue;
      let last = index;
      while (last + 1 < count && marked[last + 1] === 1) last += 1;
      const from = index * step - pad, to = last * step + pad, previous = merged[merged.length - 1];
      if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to); else merged.push([from, to]);
      index = last;
    }
    // Across the seam: the first run carries on from the last.
    while (merged.length > 1 && merged[0][0] + length <= merged[merged.length - 1][1]) {
      const first = merged.shift()!, last = merged[merged.length - 1];
      last[1] = Math.max(last[1], first[1] + length);
    }
    const armOf = (sample: number): number => {
      const along = sample * step;
      for (let arm = 0; arm < merged.length; arm += 1) {
        if (wrapDistance(along - merged[arm][0], length) <= merged[arm][1] - merged[arm][0]) return arm;
      }
      return 0;
    };
    const parent = merged.map((_, arm) => arm), exclusive = merged.map(() => false);
    const root = (arm: number): number => { while (parent[arm] !== arm) arm = parent[arm] = parent[parent[arm]]; return arm; };
    for (let at = 0; at < pairs.length; at += 2) {
      const a = armOf(pairs[at]), b = armOf(pairs[at + 1]);
      if (a === b) exclusive[a] = true; else parent[root(a)] = root(b);
    }
    const necks = new Map<number, number>();
    const arms: LoopArm[] = merged.map(([from, to], arm) => {
      const neck = necks.get(root(arm)) ?? necks.size;
      necks.set(root(arm), neck);
      return to - from >= length ? { entry: 0, length, neck, exclusive: true }
        : { entry: wrapDistance(from, length), length: to - from, neck, exclusive: exclusive[arm] };
    });
    this.armMemo.set(key, arms);
    return arms;
  }

  /**
   * The standing actors (stationary movement: they never leave their pose) that
   * a vehicle of this hull on this loop can never meet: its actual body at every
   * sampled pose round the loop, grown by the waiting gap and
   * `standingClearanceSlackMetres`, clears theirs. Those are no route-scan
   * blocker for it (`POPULATION_TRAFFIC.standingClearance*`). Ground the
   * sampler refuses clears nobody.
   */
  private standingClearOf(path: PopulationPath, hull: ActorSpec['hull']): ReadonlySet<number> {
    const key = `${path.id}\n${hull.halfWidthMetres}\n${hull.halfLengthMetres}\n${hull.heightMetres}`, known = this.standingMemo.get(key);
    if (known) return known;
    const standing = this.states.flatMap((state, index) => state.spec.movement === 'stationary' ? [index] : []);
    const met = new Set<number>(), grow = POPULATION_TRAFFIC.waitingGapMetres + POPULATION_TRAFFIC.standingClearanceSlackMetres;
    const step = POPULATION_TRAFFIC.standingClearanceSampleMetres, samples = Math.ceil(path.lengthMetres / step);
    let valid = standing.length > 0;
    for (let sample = 0; valid && sample <= samples; sample += 1) {
      const point = pathPoint(path, Math.min(sample * step, path.lengthMetres));
      const ground = this.sampler.sampleGround(point.x, point.z, this.ground);
      if (!(Number.isFinite(ground.height) && Number.isFinite(ground.normal.x) && Number.isFinite(ground.normal.y)
        && Number.isFinite(ground.normal.z)) || ground.normal.y <= 0) { valid = false; break; }
      const body = physicalPopulationPrism(transformPopulationHullLowerInto(point.x, ground.height, point.z, point.headingY,
        ground.normal.x, ground.normal.y, ground.normal.z, hull, 0, 0, this.lowerCorners));
      const width = body.halfWidthMetres + grow, length = body.halfLengthMetres + grow, reach = Math.hypot(width, length);
      for (const index of standing) {
        if (met.has(index)) continue;
        const other = this.states[index].pose.footprint;
        if (Math.hypot(other.x - body.x, other.z - body.z) > reach + Math.hypot(other.halfWidthMetres, other.halfLengthMetres)) continue;
        if (!(flatBoxGap(body.x, body.z, body.headingY, width, length, other.x, other.z, other.headingY,
          other.halfWidthMetres, other.halfLengthMetres) > 0)) met.add(index);
      }
    }
    const clear: ReadonlySet<number> = new Set(valid ? standing.filter(index => !met.has(index)) : []);
    this.standingMemo.set(key, clear);
    return clear;
  }

  /** Reading or interpolation never advances a clock or mutates a physical pose. */
  snapshot(): PopulationSnapshot { return copySnapshot(this.current); }
  previousSnapshot(): PopulationSnapshot { return copySnapshot(this.previous); }
  /** Physical query callers need detached bodies, not render/route/activity data. */
  actorFootprints(): readonly PopulationFootprint[] {
    return this.current.actors.map(actor => detachedFootprint(actor.footprint));
  }
  /** `snapshot()` read for its ids, footprints and clock alone (physical reaction admission). */
  actorFootprintRows(): PopulationActorFootprintRows {
    return { clockSeconds: this.current.clockSeconds,
      actors: this.current.actors.map(actor => ({ id: actor.id, footprint: detachedFootprint(actor.footprint) })) };
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
    signedSpeed: number = state.speed * (vehicle(state.spec.kind) ? state.direction : 1),
    before?: PopulationActorPose, dt = 0): PopulationActorPose {
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
    // The transform's lower corners and its prism land in owned scratch; the
    // footprint below is the one record kept.
    const corners = this.lowerCorners;
    const prism = physicalPopulationHullInto(point.x, y, point.z, state.heading,
      normalX, normalY, normalZ, spec.hull, velocityX, velocityZ, corners, this.prism);
    // Actual support ground is sampled at the horizontal location of each
    // grade-aligned lower corner, not inferred from a renderer tangent plane.
    // M48: Array.of, not an array literal (no allocation site; see `recordType`); the corners in the same order.
    const supportHeights = Array.of(this.cornerHeight(corners[0], spec.id), this.cornerHeight(corners[1], spec.id),
      this.cornerHeight(corners[2], spec.id), this.cornerHeight(corners[3], spec.id));
    const targets = populationSupportTargetsInto(this.supportFor(spec, point.x, y, point.z, state.heading,
      signedSpeed, state.gaitDistance, activity, normalX, normalY, normalZ), this.supportTargets);
    const sampleSupport = (target: { x: number; y: number; z: number; contact: 'ground' | 'pedal' }): PopulationGroundSupport => {
      if (target.contact === 'pedal') return new GroundSupport(target.x, target.y, target.z, normalX, normalY, normalZ);
      const sample = this.sampler.sampleGround(target.x, target.z, this.ground);
      if (!(Number.isFinite(sample.height) && Number.isFinite(sample.normal.x) && Number.isFinite(sample.normal.y)
        && Number.isFinite(sample.normal.z)) || sample.normal.y <= 0)
        throw new Error(`Population support lost finished ground: ${spec.id}`);
      return new GroundSupport(target.x, sample.height, target.z, sample.normal.x, sample.normal.y, sample.normal.z);
    };
    const footSupports = targets.feet?.map(sampleSupport) as [PopulationGroundSupport, PopulationGroundSupport] | undefined;
    const tyreSupports = targets.tyres?.map(sampleSupport) as
      [PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport, PopulationGroundSupport] | undefined;
    // Math.min/max over the same values, folded pairwise (both are order-free, -0 and NaN included).
    let minY = prism.minY, maxY = prism.maxY;
    if (footSupports) for (const value of footSupports) minY = Math.min(minY, value.y);
    if (tyreSupports) for (let index = 0; index < tyreSupports.length; index += 1) {
      minY = Math.min(minY, tyreSupports[index].y);
      maxY = Math.max(maxY, tyreSupports[index].y + 2 * targets.tyres![index].radiusMetres);
    }
    // PERF-POP: a committed move's velocities are the step's displacement, written
    // here into the same keys the former outer spreads overwrote (order unchanged).
    // M47 follow-up: one record, in physicalPopulationPrism's key order, from the scratch prism.
    // M48: the records are built by constructors in the former literals' key
    // order (`recordType`), and the hull is the actor's one detached copy.
    const footprint = new Footprint(prism.x, prism.z, prism.headingY, prism.halfWidthMetres, prism.halfLengthMetres, minY, maxY,
      before === undefined ? prism.velocityX : (prism.x - before.footprint.x) / dt,
      before === undefined ? prism.velocityZ : (prism.z - before.footprint.z) / dt,
      new HullSource(point.x, y, point.z, state.heading, prism.normalX, prism.normalY, prism.normalZ, state.hull,
        prism.minY - minY, maxY - prism.maxY, undefined));
    return new ActorPose(spec.id, spec.kind, spec.appearanceIndex, point.x, y, point.z, state.heading,
      before === undefined ? velocityX + 0 : (point.x - before.x) / dt,
      before === undefined ? velocityZ + 0 : (point.z - before.z) / dt,
      signedSpeed + 0, state.gaitDistance, state.wheelTravel, activity, activityPhase, activityBlend,
      vehicle(spec.kind) && signedSpeed < 0, spec.pathId, state.distance, state.direction, state.hull,
      footprint, supportHeights as [number, number, number, number], footSupports, tyreSupports,
      normalX, normalY, normalZ, Math.atan2(-(normalX * sin + normalZ * cos), normalY),
      Math.atan2(-(normalX * cos - normalZ * sin), normalY), knockedDown(state, this.clock) ? state.fallYaw : undefined);
  }

  private along(state: ActorState, signedTravel: number): number {
    return this.alongFrom(state, state.distance, state.direction, signedTravel);
  }
  /** `along` from an explicit frame (a forecast's epoch-start distance and direction). */
  private alongFrom(state: ActorState, from: number, direction: 1 | -1, signedTravel: number): number {
    const length = state.path.path.lengthMetres;
    if (state.spec.movement === 'loop') return ((from + signedTravel) % length + length) % length;
    if (state.spec.kind === 'worker') {
      const destination = state.workerLeg === 'outbound' ? state.workerTarget : state.workerAnchor;
      return direction === 1 ? Math.min(from + signedTravel, destination)
        : Math.max(from + signedTravel, destination);
    }
    if (!this.following) return clamp(from + signedTravel, 0, length);
    // A lane-trimmed end is never walked back into; one who starts past it walks out.
    return clamp(from + signedTravel, Math.min(state.shuttleLow, from), Math.max(state.shuttleHigh, from));
  }

  private prospective(state: ActorState, travel: number): PopulationFootprint {
    return this.prospectiveFrom(state, state.distance, state.direction, state.gaitDistance, travel);
  }
  /**
   * PERF-POP: makePose({ ...state, distance, direction, heading, gaitDistance, wheelTravel }).footprint,
   * built without the candidate state, the pose or its support records. Forecast and
   * committed poses use the same actual sole/tread targets (centre-only grade hulls
   * omit support padding on curved ground). The ground is sampled at the same points
   * in the same order and refused by the same checks; only unread values are not kept.
   */
  private prospectiveFrom(state: ActorState, from: number, direction: 1 | -1, gaitFrom: number, travel: number): PopulationFootprint {
    const distance = this.alongFrom(state, from, direction, travel), onPath = pathPoint(state.path.path, distance);
    const { spec } = state, isVehicle = vehicle(spec.kind);
    const heading = onPath.headingY + (!isVehicle && direction === -1 ? Math.PI : 0);
    const gaitDistance = gaitFrom + Math.abs(travel);
    const signedSpeed = Math.abs(travel) <= R.epsilon ? 0 : spec.speedMetresPerSecond * (isVehicle ? direction : 1);
    const pointX = state.aside === 0 ? onPath.x : onPath.x + Math.cos(onPath.headingY) * state.aside;
    const pointZ = state.aside === 0 ? onPath.z : onPath.z - Math.sin(onPath.headingY) * state.aside;
    const ground = this.sampler.sampleGround(pointX, pointZ, this.ground);
    if (!(Number.isFinite(ground.height) && Number.isFinite(ground.normal.x) && Number.isFinite(ground.normal.y)
      && Number.isFinite(ground.normal.z)) || ground.normal.y <= 0) {
      throw new Error(`Population actor lost valid finished ground: ${spec.id}`);
    }
    const activity = activityKind(state, this.clock, signedSpeed, direction);
    const normalX = ground.normal.x, normalY = ground.normal.y, normalZ = ground.normal.z;
    const y = ground.height;
    const corners = this.lowerCorners;
    const prism = physicalPopulationHullInto(pointX, y, pointZ, heading,
      normalX, normalY, normalZ, spec.hull, 0, 0, corners, this.prism);
    // The corner support samples are refused exactly as makePose refuses them; a
    // footprint never reads their heights.
    for (const corner of corners) {
      const supportGround = this.sampler.sampleGround(corner.x, corner.z, this.ground);
      if (!Number.isFinite(supportGround.height)) throw new Error(`Invalid population support ground: ${spec.id}`);
    }
    const targets = populationSupportTargetsInto(this.supportFor(spec, pointX, y, pointZ, heading,
      signedSpeed, gaitDistance, activity, normalX, normalY, normalZ), this.supportTargets);
    let minY = prism.minY, maxY = prism.maxY;
    const feet = targets.feet, tyres = targets.tyres;
    if (feet) for (let index = 0; index < feet.length; index += 1) minY = Math.min(minY, this.supportHeight(feet[index], spec.id));
    if (tyres) for (let index = 0; index < tyres.length; index += 1) {
      const height = this.supportHeight(tyres[index], spec.id);
      minY = Math.min(minY, height);
      maxY = Math.max(maxY, height + 2 * tyres[index].radiusMetres);
    }
    return new Footprint(prism.x, prism.z, prism.headingY, prism.halfWidthMetres, prism.halfLengthMetres, minY, maxY,
      prism.velocityX, prism.velocityZ, new HullSource(pointX, y, pointZ, heading, prism.normalX, prism.normalY, prism.normalZ,
        state.hull, prism.minY - minY, maxY - prism.maxY, undefined));
  }
  /** The support targets' input, written into its scratch (the fields the simulation names, nothing seated). */
  private supportFor(spec: ActorSpec, x: number, y: number, z: number, headingY: number, speedMetresPerSecond: number,
    gaitDistanceMetres: number, activity: string, groundNormalX: number, groundNormalY: number, groundNormalZ: number): PopulationSupportInput {
    const input = this.supportInput;
    input.kind = spec.kind; input.appearanceIndex = spec.appearanceIndex; input.x = x; input.y = y; input.z = z;
    input.headingY = headingY; input.hull = spec.hull; input.speedMetresPerSecond = speedMetresPerSecond;
    input.gaitDistanceMetres = gaitDistanceMetres; input.activity = activity;
    input.groundNormalX = groundNormalX; input.groundNormalY = groundNormalY; input.groundNormalZ = groundNormalZ;
    return input;
  }
  /** The finished ground's height at a lower hull corner, with its refusal. */
  private cornerHeight(corner: MutablePopulationHullCorner, id: string): number {
    const supportGround = this.sampler.sampleGround(corner.x, corner.z, this.ground);
    if (!Number.isFinite(supportGround.height)) throw new Error(`Invalid population support ground: ${id}`);
    return supportGround.height;
  }
  /** makePose's sampleSupport(target).y, with its refusal. */
  private supportHeight(target: { x: number; y: number; z: number; contact: 'ground' | 'pedal' }, id: string): number {
    if (target.contact === 'pedal') return target.y;
    const sample = this.sampler.sampleGround(target.x, target.z, this.ground);
    if (!(Number.isFinite(sample.height) && Number.isFinite(sample.normal.x) && Number.isFinite(sample.normal.y)
      && Number.isFinite(sample.normal.z)) || sample.normal.y <= 0)
      throw new Error(`Population support lost finished ground: ${id}`);
    return sample.height;
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
    // PERF-POP: each body's radius once, and the vehicle's entering test first. These
    // are pure order-free predicates over the same values; the lookaheads above run first, as before.
    const personFromRadius=Math.hypot(personFrom.halfWidthMetres,personFrom.halfLengthMetres);
    const personToRadius=Math.hypot(personTo.halfWidthMetres,personTo.halfLengthMetres);
    const trafficFromRadius=Math.hypot(trafficFrom.halfWidthMetres,trafficFrom.halfLengthMetres);
    const trafficToRadius=Math.hypot(trafficTo.halfWidthMetres,trafficTo.halfLengthMetres);
    for(const crossing of crossings)if(touchesCrossingWithin(crossing,trafficTo,trafficToRadius)
      &&!touchesCrossingWithin(crossing,trafficFrom,trafficFromRadius)
      &&(touchesCrossingWithin(crossing,personFrom,personFromRadius)||touchesCrossingWithin(crossing,personTo,personToRadius)))return true;
    return false;
  }

  /**
   * M47 living-r2 pedestrian priority: `pedestrianPriority`'s rule, asked for
   * less and refined. A crossing grants priority only where the vehicle's
   * look-ahead touches it and its body does not, and that set is the vehicle's
   * alone (`enteringCrossings`): on the town every crossing lists every
   * pedestrian path, so the per-pair walk over all of them was most of a dense
   * step. The person's look-ahead is formed only when its body does not decide.
   * Refined: a person is on a crossing by its polygon (`onCrossing`); someone
   * waiting for this very vehicle holds nothing over it; and a crossing the
   * vehicle has claimed by its patience answers only to people crossing it now.
   */
  private priorityOver(person: number, traffic: number): boolean {
    const personState = this.states[person], trafficState = this.states[traffic];
    if (vehicle(personState.spec.kind) || !vehicle(trafficState.spec.kind)) return false;
    // Someone waiting for this very vehicle holds nothing over it: it is in
    // their way already, and each waiting on the other stood for good.
    if (personState.blockedBy === traffic || personState.waitingOn.includes(traffic)) return false;
    const crossings = this.crossingSets.get(personState.spec.pathId)?.get(trafficState.spec.pathId);
    if (crossings === undefined) return false;
    const entering = this.enteringCrossings(traffic);
    if (entering.length === 0) return false;
    const personStart = this.previousActor(personState.spec.id) ?? personState.pose;
    const personFrom = personStart.footprint;
    // Broad phase: `onCrossing` needs a body's centre within its radius of a
    // crossing's box, and the look-ahead's centre is never farther from the
    // start's than its travel along the path, the step-aside offsets and the
    // body's own size (a turn swings an off-centre hull). A person beyond that
    // from every crossing the vehicle enters can be granted nothing.
    const box = this.enteringBox, at = traffic * 4;
    const reach = 3 * Math.hypot(personFrom.halfWidthMetres, personFrom.halfLengthMetres)
      + Math.abs(personState.spec.speedMetresPerSecond) * R.humanLookAheadSeconds
      + Math.abs(personState.aside) + Math.abs(personState.stepStartAside) + Math.abs(personState.asideTarget) + 1;
    if (personFrom.x < box[at] - reach || personFrom.x > box[at + 1] + reach
      || personFrom.z < box[at + 2] - reach || personFrom.z > box[at + 3] + reach) return false;
    let personTo: PopulationFootprint | undefined;
    const claim = this.patience[traffic];
    // People standing (a pause at a path end, a turn, a wait) are not crossing.
    const crossingNow = Math.abs(personStart.speedMetresPerSecond) > R.epsilon
      && (personStart.activity === 'walking' || personStart.activity === 'jogging' || personStart.activity === 'riding');
    for (const crossing of entering) {
      if (!crossings.has(crossing)) continue;
      // A crossing the vehicle has claimed by its patience answers only to people already crossing it.
      const claimed = claim.length > 0 && claim.includes(crossing);
      if (this.onCrossing(crossing, personFrom) && (!claimed || crossingNow)) return true;
      if (claimed) continue;
      if (personTo === undefined) {
        personTo = this.lookahead(personState, personStart, R.humanLookAheadSeconds);
      }
      if (this.onCrossing(crossing, personTo)) return true;
    }
    return false;
  }
  /**
   * M47 living-r2: a person's body (or look-ahead) is on a crossing when it
   * overlaps the crossing's own polygon. The extent-plus-radius test a vehicle
   * keeps is a square round a diagonal pad: walkers going along the pavement
   * beside it held vans as if they were crossing.
   */
  private onCrossing(crossing: CrossingExtent, body: PopulationFootprint): boolean {
    const radius = Math.hypot(body.halfWidthMetres, body.halfLengthMetres);
    if (!touchesCrossingWithin(crossing, body, radius)) return false;
    const corners = this.crossingCorners.get(crossing);
    return corners === undefined || boxOverlapsPolygon(body.x, body.z, body.headingY, body.halfWidthMetres, body.halfLengthMetres, corners);
  }
  /**
   * The crossings a vehicle's priority look-ahead enters this step. Its body is
   * the step's start; its look-ahead's place reads only that start, the path
   * and the live direction (a vehicle never steps aside), so it is formed once
   * per step and direction and every pair reads the same list.
   */
  private enteringCrossings(index: number): readonly CrossingExtent[] {
    const state = this.states[index];
    if (this.enteringTick[index] === this.tick && this.enteringDirection[index] === state.direction) return this.entering[index];
    const out = this.entering[index];
    out.length = 0;
    const all = this.vehicleCrossings.get(state.spec.pathId);
    if (all !== undefined) {
      const start = this.previousActor(state.spec.id) ?? state.pose;
      const from = start.footprint, to = this.lookahead(state, start, R.vehicleLookAheadSeconds);
      const fromRadius = Math.hypot(from.halfWidthMetres, from.halfLengthMetres), toRadius = Math.hypot(to.halfWidthMetres, to.halfLengthMetres);
      for (const crossing of all) if (touchesCrossingWithin(crossing, to, toRadius) && !touchesCrossingWithin(crossing, from, fromRadius)) out.push(crossing);
    }
    const box = this.enteringBox, at = index * 4;
    box[at] = Infinity; box[at + 1] = -Infinity; box[at + 2] = Infinity; box[at + 3] = -Infinity;
    for (const crossing of out) {
      box[at] = Math.min(box[at], crossing.minX); box[at + 1] = Math.max(box[at + 1], crossing.maxX);
      box[at + 2] = Math.min(box[at + 2], crossing.minZ); box[at + 3] = Math.max(box[at + 3], crossing.maxZ);
    }
    this.enteringTick[index] = this.tick; this.enteringDirection[index] = state.direction;
    return out;
  }

  /**
   * M47 living-r2 route-scan broad phase: a world box every blocker the scan
   * could stop for must meet. It walks the very source spans `routeAnticipation`
   * visits (same distance, direction and travel, same arithmetic), so the swept
   * centre stays inside the box of their endpoints, then grows it by more than
   * the scan's widest car support on any span: the flat spans' padded hull
   * support and chord reserve, and the unknown spans' full-hull axis bound with
   * the seam turn, the actual-pose bridge and the gap. A blocker whose own
   * world box misses it is one every span refuses on a world axis. Null where
   * the walk itself would overflow the scan's work cap (the scan then decides).
   */
  private routeScanBox(state: ActorState, travel: number, gap: number, dt: number): ScanBox | null {
    const path = state.path.path, points = path.points, direction = state.direction;
    const box = this.scanBox;
    box.minX = Infinity; box.maxX = -Infinity; box.minZ = Infinity; box.maxZ = -Infinity;
    let distance = state.distance, travelled = 0, visits = 0, firstX = NaN, firstZ = NaN;
    let low = 0, high = points.length - 1;
    while (high - low > 1) { const middle = (low + high) >>> 1; if (points[middle].distanceMetres <= distance) low = middle; else high = middle; }
    let span = low;
    if (direction === -1 && distance === points[span].distanceMetres && span > 0) span--;
    while (travelled < travel) {
      if (visits >= R.compactAnticipationMaximumSpans) return null;
      visits++;
      const a = points[span], b = points[span + 1], length = b.distanceMetres - a.distanceMetres;
      if (!(length > 0)) return null;
      const remaining = direction === 1 ? b.distanceMetres - distance : distance - a.distanceMetres;
      const along = Math.min(travel - travelled, Math.max(0, remaining));
      const fromT = (distance - a.distanceMetres) / length, toT = (distance + direction * along - a.distanceMetres) / length;
      const fromX = a.x + (b.x - a.x) * fromT, fromZ = a.z + (b.z - a.z) * fromT;
      const toX = a.x + (b.x - a.x) * toT, toZ = a.z + (b.z - a.z) * toT;
      if (visits === 1) { firstX = fromX; firstZ = fromZ; }
      box.minX = Math.min(box.minX, fromX, toX); box.maxX = Math.max(box.maxX, fromX, toX);
      box.minZ = Math.min(box.minZ, fromZ, toZ); box.maxZ = Math.max(box.maxZ, fromZ, toZ);
      travelled += along; distance += direction * along;
      if (travelled >= travel) break;
      if (direction === 1) {
        if (span + 1 < points.length - 1) span++;
        else if (path.closed) { span = 0; distance = 0; }
        else break;
      } else {
        if (span > 0) span--;
        else if (path.closed) { span = points.length - 2; distance = path.lengthMetres; }
        else break;
      }
    }
    if (visits === 0) return box;
    const hull = state.spec.hull, terms = this.pathScanTerms.get(state.spec.pathId)!, current = state.pose.footprint;
    const fullHull = Math.hypot(hull.halfWidthMetres, hull.halfLengthMetres, hull.heightMetres);
    const bridge = Math.hypot(current.halfWidthMetres, current.halfLengthMetres) + Math.hypot(current.x - firstX, current.z - firstZ);
    const flat = Math.hypot(hull.halfWidthMetres + gap, hull.halfLengthMetres + gap)
      + Math.max(state.spec.speedMetresPerSecond, state.speed) * dt * terms.metric / 2;
    const unknown = Math.max(fullHull * Math.SQRT2 * (1 + terms.seamTurn), bridge) + Math.SQRT2 * gap;
    const margin = Math.max(flat, unknown) + (path.closed ? R.closedPositionToleranceMetres : 0) + ROUTE_SCAN_BOX_SLACK_METRES;
    if (!(Number.isFinite(margin) && Number.isFinite(box.minX) && Number.isFinite(box.maxX)
      && Number.isFinite(box.minZ) && Number.isFinite(box.maxZ))) return null;
    box.minX -= margin; box.maxX += margin; box.minZ -= margin; box.maxZ += margin;
    return box;
  }

  /**
   * M47 living-r2: the cap a closed loop's traffic puts on this vehicle's
   * target speed (`POPULATION_TRAFFIC`), Infinity for none, and the vehicle it
   * then waits on in `trafficWaitsOn` (-1 none). Three rules, the least cap wins:
   * - **Following.** The leader is the nearest of its loop's other vehicles
   *   ahead along the loop at the step's start, never a live state (a lower
   *   index has already moved); within `followingRangeMetres` the IDM law caps it.
   * - **Crossing zones.** Behind a slow leader, a vehicle outside every zone
   *   that could not clear the next one stops short of its entry; one already
   *   inside a zone follows on.
   * - **Necks** (`neckCap`).
   */
  private trafficCap(index: number, state: ActorState, dt: number, deciding: boolean): number {
    this.trafficWaitsOn = -1;
    const loop = this.loopId[index];
    if (loop < 0) return Infinity;
    const members = this.loopMembers[loop];
    if (members.length < 2) return Infinity;
    const start = this.previous.actors, length = state.path.path.lengthMetres, self = start[index].distanceMetres;
    let leader = -1, ahead = Infinity;
    for (const other of members) {
      if (other === index) continue;
      let along = wrapDistance(start[other].distanceMetres - self, length);
      // Two at one distance: the higher index is the one ahead.
      if (along === 0 && other < index) along = length;
      if (along < ahead) { ahead = along; leader = other; }
    }
    const ownHalf = state.spec.hull.halfLengthMetres, leaderHalf = this.states[leader].spec.hull.halfLengthMetres;
    const speed = state.speed, free = state.spec.speedMetresPerSecond, leaderSpeed = Math.abs(start[leader].speedMetresPerSecond);
    // How far its centre could go behind the leader were the leader to stand where it is.
    const room = ahead - leaderHalf - POPULATION_TRAFFIC.standstillGapMetres - ownHalf;
    let cap = Infinity, crossingHeld = false;
    const gap = ahead - ownHalf - leaderHalf;
    if (gap <= POPULATION_TRAFFIC.followingRangeMetres) {
      cap = followingSpeedCap(speed, free, gap, speed - leaderSpeed, dt);
      this.trafficWaitsOn = leader;
      const zones = this.crossingZones[index];
      if (zones !== undefined && zones.length > 0 && leaderSpeed < POPULATION_TRAFFIC.slowLeaderMetresPerSecond) {
        let entry = Infinity, exit = 0, inside = false;
        for (const zone of zones) {
          const into = wrapDistance(self - zone.entry, length);
          if (into <= zone.length) { inside = true; break; }
          const toEntry = length - into;
          if (toEntry < entry) { entry = toEntry; exit = toEntry + zone.length; }
        }
        if (!inside && entry < ahead && room < exit + POPULATION_TRAFFIC.crossingStopMarginMetres) {
          // A standing obstacle whose standstill gap ends where the centre must stop.
          crossingHeld = true;
          cap = Math.min(cap, followingSpeedCap(speed, free,
            entry - POPULATION_TRAFFIC.crossingStopMarginMetres + POPULATION_TRAFFIC.standstillGapMetres, speed, dt));
        }
      }
    }
    const arms = this.loopArms[index];
    if (arms !== undefined && arms.length > 0) {
      const neck = this.neckCap(index, state, dt, self, length, arms, members, room, deciding && !crossingHeld);
      if (neck < cap) { cap = neck; this.trafficWaitsOn = this.neckWaitsOn; }
    }
    return cap;
  }
  private trafficWaitsOn = -1;
  private neckWaitsOn = -1;

  /**
   * M47 living-r2: after a step, how long native contact has held each loop
   * vehicle's own move against one and the same person (`nativeBlocker`): a
   * move it got through, or no such hold, starts the count again. The vehicle
   * waits on that person, so a wait round the two is seen (`resolveMutualWaits`).
   */
  private noteNativeHolds(dt: number): void {
    for (const members of this.loopMembers) for (const index of members) {
      const by = this.nativeBlocker[index], state = this.states[index];
      if (by < 0 || Math.abs(state.stepTravel) > NATIVE_HOLD_PROGRESS_METRES) { this.nativeHeldBy[index] = -1; this.nativeHeldSeconds[index] = 0; continue; }
      if (this.nativeHeldBy[index] === by) this.nativeHeldSeconds[index] += dt;
      else { this.nativeHeldBy[index] = by; this.nativeHeldSeconds[index] = dt; }
      if (!state.waitingOn.includes(by)) state.waitingOn.push(by);
    }
  }
  /**
   * M47 living-r2: whether its own path, from beside it to its look-ahead, is
   * clear of every other actor's body by its waiting gap: one stood aside for
   * a vehicle steps back only into an empty path (a pathmate behind it held
   * the step back and it held the pathmate, for good).
   */
  private pathClearOfActors(state: ActorState, index: number): boolean {
    const onPath = { ...state, aside: 0 }, from = grow(this.makePose(onPath, 0, 0, 0).footprint, R.humanWaitingGapMetres);
    const to = grow(this.prospective(onPath, state.direction * state.spec.speedMetresPerSecond * R.humanLookAheadSeconds), R.humanWaitingGapMetres);
    for (let other = 0; other < this.states.length; other += 1) {
      if (other === index) continue;
      const body = this.states[other].pose.footprint;
      if (Math.hypot(body.x - from.x, body.z - from.z) > SIDESTEP_NEAR_METRES + Math.hypot(body.halfWidthMetres, body.halfLengthMetres)) continue;
      if (sweepPopulationHulls(from, to, body, body) !== null) return false;
    }
    return true;
  }
  /**
   * M47 living-r2: `stepAside` for a loop vehicle rather than a rider. The
   * side away from the vehicle first, the wider offset first (the rider's
   * offsets, then `POPULATION_TRAFFIC.pinnedWalkerWiderOffsetsMetres`), onto ground
   * `sidestepClear` accepts, and only to a spot the vehicle's own route ahead
   * clears (`routeMeets`): a van is long, so "farther from its centre and off
   * its centreline", the rider's test, refused every step aside in front of one
   * at an angle.
   */
  private stepAsideFor(state: ActorState, vehicleIndex: number): boolean {
    // A step aside dropped part way (`SIDESTEP_GIVE_UP_SECONDS`) stands settled off the path, and may go again.
    if ((state.spec.kind !== 'walker' && state.spec.kind !== 'jogger') || state.aside !== state.asideTarget
      || state.pause > 0) return false;
    const point = pathPoint(state.path.path, state.distance), lateralX = Math.cos(point.headingY), lateralZ = -Math.sin(point.headingY);
    const van = this.states[vehicleIndex].pose.footprint, body = state.pose.footprint;
    const grownVan = grow(van, POPULATION_TRAFFIC.waitingGapMetres + STANDING_HIT_SLACK_METRES);
    const away = (van.x - point.x) * lateralX + (van.z - point.z) * lateralZ <= 0 ? 1 : -1;
    for (const offset of [...SIDESTEP_OFFSETS_METRES, ...POPULATION_TRAFFIC.pinnedWalkerWiderOffsetsMetres]) for (const side of [away, -away]) {
      const there = { ...body, x: point.x + lateralX * side * offset, z: point.z + lateralZ * side * offset };
      if (this.routeMeets(vehicleIndex, there)) continue;
      // Not past the vehicle's body within its gap: such a step stalls on it, is
      // dropped and is tried again for good. From inside the gap, only out of it.
      const hit = sweepPopulationHulls(body, there, grownVan, grownVan);
      if (hit !== null && (!hit.initiallyOverlapping || sweepPopulationHulls(there, there, grownVan, grownVan) !== null)) continue;
      if (!this.sidestepClear(state, point, lateralX * side, lateralZ * side, offset)) continue;
      state.asideTarget = side * offset; return true;
    }
    return false;
  }
  /**
   * Whether a loop vehicle's body, grown by its waiting gap and
   * `STANDING_HIT_SLACK_METRES`, meets `body` anywhere along its route from
   * where it stands to a full look-ahead of free-road travel past its length.
   */
  private routeMeets(vehicleIndex: number, body: PopulationFootprint): boolean {
    const state = this.states[vehicleIndex];
    const reach = state.spec.speedMetresPerSecond * R.vehicleLookAheadSeconds + 2 * state.spec.hull.halfLengthMetres;
    return this.standingHitOf(state, [body], reach, POPULATION_TRAFFIC.waitingGapMetres, STANDING_HIT_SLACK_METRES, false) >= 0;
  }
  /**
   * M47 living-r2: a walker or jogger held at its path's end by someone
   * walking up to it who stands in a loop vehicle's way steps off the path to
   * let them by (the rider's offsets),
   * to a spot clear of the other's body and walk ahead, onto ground
   * `sidestepClear` accepts and out of every nearby loop vehicle's route; it
   * comes back once its path is clear (`asideFor`). Codex's audit, seed
   * `m47-audit-02` High at 1/120 s: two walkers met at a pavement's end
   * beside a lane, the one in the lane turning between them and a van for good.
   */
  private stepAsideForPathmate(state: ActorState, other: number): boolean {
    if ((state.spec.kind !== 'walker' && state.spec.kind !== 'jogger') || state.aside !== state.asideTarget
      || state.pause > 0) return false;
    const mate = this.states[other], onPath = { ...mate, aside: 0 };
    // Only for one held in a loop vehicle's way: pathmates elsewhere settle it among themselves.
    const inVehicleWay = (spot: PopulationFootprint): boolean => this.loopMembers.some(members => members.some(vehicleIndex => {
      const van = this.states[vehicleIndex].pose.footprint;
      return Math.hypot(van.x - spot.x, van.z - spot.z) < PATHMATE_VEHICLE_REACH_METRES && this.routeMeets(vehicleIndex, spot);
    }));
    if (!inVehicleWay(mate.pose.footprint)) return false;
    const mateFrom = grow(mate.pose.footprint, R.humanWaitingGapMetres);
    const mateTo = grow(this.prospective(onPath, mate.direction * mate.spec.speedMetresPerSecond * R.humanLookAheadSeconds), R.humanWaitingGapMetres);
    const point = pathPoint(state.path.path, state.distance), lateralX = Math.cos(point.headingY), lateralZ = -Math.sin(point.headingY);
    const body = state.pose.footprint;
    for (const offset of SIDESTEP_OFFSETS_METRES) for (const side of [1, -1]) {
      const there = { ...body, x: point.x + lateralX * side * offset, z: point.z + lateralZ * side * offset };
      if (sweepPopulationHulls(there, there, mateFrom, mateTo) !== null) continue;
      if (!this.sidestepClear(state, point, lateralX * side, lateralZ * side, offset)) continue;
      if (inVehicleWay(there)) continue;
      state.asideTarget = side * offset; return true;
    }
    return false;
  }
  /** A vehicle's own body as a standing occupant, for the step-aside rules written for riders. */
  private vehicleAsOccupant(index: number): PopulationOccupant {
    const body = this.states[index].pose.footprint;
    return { id: this.actorBlockerIds[index], kind: 'cop', previous: body, current: body };
  }
  /** Someone this loop vehicle may squeeze past hull to hull at a walk: pinned against it, or holding its own move for the mutual wait. */
  private pinnedAgainst(other: number, vehicleIndex: number, people: readonly PopulationOccupant[]): boolean {
    return (this.nativeHeldBy[vehicleIndex] === other && this.nativeHeldSeconds[vehicleIndex] >= MUTUAL_WAIT_SECONDS)
      || this.waitsForGood(other, vehicleIndex, people);
  }

  /**
   * M47 living-r2: the route scan for people standing still, by the hull
   * itself rather than the scan's world boxes (on ground the certificate
   * cannot call flat those widen to several metres, and a person standing on
   * the pavement beside the lane held the van). The vehicle's body, grown by
   * the waiting gap and `STANDING_HIT_SLACK_METRES`, at its own pose every
   * `STANDING_HIT_STEP_METRES` along the next `reach` of its route: the first
   * person it would meet (one already inside that grown body counts only where
   * it would come nearer), else -1. The travel left before it is in `standingHitTravel`.
   */
  private standingHit(state: ActorState, standing: readonly number[], bodies: readonly PopulationFootprint[], reach: number,
    gap: number, slack: number): number {
    const at = this.standingHitOf(state, standing.map(index => bodies[index]), reach, gap, slack, true);
    return at < 0 ? -1 : standing[at];
  }
  /**
   * `standingHit` over bodies themselves: the index of the first one met, else
   * -1. `departing`: one already inside the grown body counts only where it
   * would come nearer; else any meeting counts.
   */
  private standingHitOf(state: ActorState, bodies: readonly PopulationFootprint[], reach: number, gap: number, slack: number,
    departing: boolean): number {
    const path = state.path.path, own = state.pose.footprint;
    const width = Math.max(state.spec.hull.halfWidthMetres, own.halfWidthMetres) + gap + slack;
    const length = Math.max(state.spec.hull.halfLengthMetres, own.halfLengthMetres) + gap + slack;
    const radius = Math.hypot(width, length);
    const start = new Array<number>(bodies.length);
    for (let travel = 0; ; travel += STANDING_HIT_STEP_METRES) {
      const along = Math.min(travel, reach), point = pathPoint(path, this.alongFrom(state, state.distance, state.direction, state.direction * along));
      for (let at = 0; at < bodies.length; at += 1) {
        const body = bodies[at];
        if (Math.hypot(body.x - point.x, body.z - point.z) > radius + Math.hypot(body.halfWidthMetres, body.halfLengthMetres)) {
          if (travel === 0) start[at] = Infinity;
          continue;
        }
        const clearance = flatBoxGap(point.x, point.z, point.headingY, width, length, body.x, body.z, body.headingY,
          body.halfWidthMetres, body.halfLengthMetres);
        if (travel === 0 && departing) { start[at] = clearance; continue; }
        if (clearance < 0 && (!departing || clearance < Math.min(0, start[at]) - STANDING_HIT_NEARER_METRES)) {
          this.standingHitTravel = Math.max(0, along - STANDING_HIT_STEP_METRES);
          return at;
        }
      }
      if (along >= reach) return -1;
    }
  }

  /**
   * M47 living-r2: a person pinned against this very vehicle: stalled on it for
   * the mutual wait and unable to turn round (a path end at its back, a rider
   * in its turn), or stalled on it again just after a turn. Each waited on the
   * other for good (a walker back at the end of a pavement that ends beside the
   * lane, the van stopped beside them). The vehicle squeezes past them hull to
   * hull at a walk when its whole route ahead clears them so, else they step
   * aside for it as for a rider (`resolveMutualWaits`).
   */
  private waitsForGood(other: number, vehicleIndex: number, people: readonly PopulationOccupant[]): boolean {
    const person = this.states[other];
    if (vehicle(person.spec.kind) || person.blockedBy !== vehicleIndex) return false;
    // Turned round lately and stalled on the vehicle again: the other way is
    // shut too (a pathmate at the path end), and turning back only flips them
    // between the two for good.
    if (this.clock - person.turnedAt < MUTUAL_RECENT_TURN_SECONDS && person.blockedSeconds >= OCCUPANT_WAIT_SECONDS) return true;
    return person.blockedSeconds >= MUTUAL_WAIT_SECONDS
      && !(this.turnRoom(person) > MUTUAL_TURN_ROOM_METRES && this.turnSweepClear(person, people));
  }

  /**
   * M47 living-r2 patience at a crossing (`holdPatienceSeconds`). `held`: its
   * pedestrian priority held it this step; `free`: the target it would have had
   * without that hold. Only a hold that alone stops it counts; once it has
   * lasted the patience, the crossings it is entering are its claim.
   */
  private notePatience(index: number, held: boolean, free: number, dt: number): void {
    const ready = held && free > PATIENCE_READY_METRES_PER_SECOND;
    this.patienceReady[index] = ready ? 1 : 0;
    if (!ready) { if (!held) this.holdSeconds[index] = 0; return; }
    this.holdSeconds[index] += dt;
    // Every crossing it enters while it has run out of patience joins the claim (its look-ahead creeps on with it).
    if (this.holdSeconds[index] < POPULATION_TRAFFIC.holdPatienceSeconds) return;
    const claim = this.patience[index];
    for (const crossing of this.enteringCrossings(index)) if (!claim.includes(crossing)) claim.push(crossing);
  }
  /** A claim ends once the vehicle has driven through: neither its body nor its priority look-ahead touches any claimed crossing. */
  private releasePatience(index: number, state: ActorState): void {
    const claim = this.patience[index];
    if (claim.length === 0) return;
    const start = this.previousActor(state.spec.id) ?? state.pose;
    const from = start.footprint, to = this.lookahead(state, start, R.vehicleLookAheadSeconds);
    const fromRadius = Math.hypot(from.halfWidthMetres, from.halfLengthMetres), toRadius = Math.hypot(to.halfWidthMetres, to.halfLengthMetres);
    if (claim.some(crossing => touchesCrossingWithin(crossing, from, fromRadius) || touchesCrossingWithin(crossing, to, toRadius))) return;
    claim.length = 0; this.holdSeconds[index] = 0;
  }
  /**
   * Whether this person must wait for a vehicle's patience claim: its body is
   * on none of the claimed crossings it shares with the vehicle, its look-ahead
   * touches one, and the vehicle would go but for people on it. The first such
   * vehicle in index order, else -1.
   */
  private yieldsToPatience(index: number, state: ActorState, from: PopulationFootprint, look: PopulationFootprint): number {
    const byVehicle = this.crossingSets.get(state.spec.pathId);
    if (byVehicle === undefined) return -1;
    for (const other of this.priorityVehicles[index]) {
      const claim = this.patience[other];
      if (claim.length === 0 || this.patienceReady[other] === 0) continue;
      const shared = byVehicle.get(this.states[other].spec.pathId);
      if (shared === undefined || claim.some(crossing => shared.has(crossing) && this.onCrossing(crossing, from))) continue;
      if (claim.some(crossing => shared.has(crossing) && this.onCrossing(crossing, look))) return other;
    }
    return -1;
  }

  /**
   * M47 living-r2: necks, taken in turn. Arms passed are let go; an arm the
   * vehicle is already in is its own. Before the next arm, within its decision
   * distance of the stop line (the arm's entry less the margin, or the entry of
   * a crossing zone that line falls in, when the vehicle is not in one yet),
   * it takes the arm if no other vehicle holds a conflicting arm, no vehicle
   * ready to go has waited longer for one, and it has room behind its leader
   * to clear the arm were the leader to stop now; else it stops at the line
   * and waits there, the first to wait going first. Deterministic: state
   * order, fixed-step clock.
   */
  private neckCap(index: number, state: ActorState, dt: number, self: number, length: number,
    arms: readonly LoopArm[], members: readonly number[], room: number, deciding: boolean): number {
    this.neckWaitsOn = -1;
    const T = POPULATION_TRAFFIC, held = this.armsHeld[index];
    // The next arm it does not hold (one it has slipped into unheld comes
    // first, decided where it stands), and how far it is committed: the far
    // end of every arm it holds, which it must drive out of before it can wait.
    let next = -1, toEntry = Infinity, holding = -Infinity;
    for (let arm = 0; arm < arms.length; arm += 1) {
      const into = wrapDistance(self - arms[arm].entry, length), inside = into <= arms[arm].length;
      const mine = held.indexOf(arm);
      if (mine >= 0) {
        // Taken ahead of its entry or in it, it is still the vehicle's; once passed it is let go.
        if (!inside && length - into > (length - arms[arm].length) / 2) { held.splice(mine, 1); continue; }
        holding = Math.max(holding, inside ? arms[arm].length - into : length - into + arms[arm].length);
        continue;
      }
      const before = inside ? -into : length - into;
      if (before < toEntry) { toEntry = before; next = arm; }
    }
    if (next < 0) { this.armWaiting[index] = -1; return Infinity; }
    // Held back by something else it takes nothing new, lets go of what it
    // has taken but not entered, and keeps its place in any wait; unless it
    // could no longer stop short of the arm braking hard, when it decides now.
    const speed = state.speed;
    const committed = toEntry - T.crossingStopMarginMetres <= speed * speed / (2 * R.vehicleBrakingMetresPerSecondSquared) + speed * dt;
    if (!deciding && !committed) {
      for (let at = held.length - 1; at >= 0; at -= 1) {
        const into = wrapDistance(self - arms[held[at]].entry, length);
        if (into > arms[held[at]].length) held.splice(at, 1);
      }
      // It could not go if let: no one defers to it meanwhile.
      this.armWaitingReady[index] = 0;
      return Infinity;
    }
    const arm = arms[next];
    let stop = toEntry < 0 ? 0 : toEntry - T.crossingStopMarginMetres;
    // Outside every crossing zone, a line inside one moves back to that zone's
    // entry, unless that is behind the vehicle or inside an arm it holds.
    const zones = this.crossingZones[index];
    if (toEntry >= 0 && zones !== undefined && !zones.some(zone => wrapDistance(self - zone.entry, length) <= zone.length)) {
      for (const zone of zones) {
        const toZone = wrapDistance(zone.entry - self, length);
        if (toZone <= stop && stop <= toZone + zone.length) {
          const shifted = toZone - T.crossingStopMarginMetres;
          if (shifted >= Math.max(0, holding)) stop = shifted;
          break;
        }
      }
    }
    // It cannot wait short of an arm it holds: this one is decided past it.
    if (stop < holding) return Infinity;
    if (stop > speed * speed / (2 * T.comfortableBrakingMetresPerSecondSquared) + T.crossingStopMarginMetres + T.neckDecisionMetres) {
      return Infinity;
    }
    const conflicts = (other: number): boolean => other !== next || arm.exclusive;
    // A holder is one that has taken a conflicting arm or stands in one (it may have rolled in, held by something else).
    let holder = -1;
    const start = this.previous.actors;
    for (const other of members) {
      if (other === index) continue;
      for (const theirs of this.armsHeld[other]) if (arms[theirs].neck === arm.neck && conflicts(theirs)) { holder = other; break; }
      if (holder >= 0) break;
      const at = start[other].distanceMetres;
      for (let theirs = 0; theirs < arms.length; theirs += 1) {
        if (arms[theirs].neck === arm.neck && conflicts(theirs) && wrapDistance(at - arms[theirs].entry, length) <= arms[theirs].length) { holder = other; break; }
      }
      if (holder >= 0) break;
    }
    const roomy = room >= toEntry + arm.length + T.crossingStopMarginMetres;
    const since = this.armWaiting[index] === next ? this.armWaitingSince[index] : this.clock;
    let earlier = -1;
    if (holder < 0) for (const other of members) {
      const theirs = this.armWaiting[other];
      if (other === index || theirs < 0 || this.armWaitingReady[other] === 0 || arms[theirs].neck !== arm.neck || !conflicts(theirs)) continue;
      const otherSince = this.armWaitingSince[other];
      if (otherSince < since || (otherSince === since && other < index)) { earlier = other; break; }
    }
    if (holder < 0 && earlier < 0 && roomy) {
      held.push(next); this.armWaiting[index] = -1;
      return Infinity;
    }
    if (this.armWaiting[index] !== next) { this.armWaiting[index] = next; this.armWaitingSince[index] = this.clock; }
    // Ready: only another vehicle holds it back, so it goes the moment that one has passed.
    this.armWaitingReady[index] = roomy ? 1 : 0;
    this.neckWaitsOn = holder >= 0 ? holder : earlier;
    return followingSpeedCap(speed, state.spec.speedMetresPerSecond, stop + T.standstillGapMetres, speed, dt);
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

  /** grow(body, margin) for actor `index`, reusing either of its last two (`grown`). */
  private grownFor(index: number, body: PopulationFootprint, margin: number): PopulationFootprint {
    const memo = this.grown[index] ??= { body: [undefined, undefined], margin: [0, 0], grown: [undefined, undefined], next: 0 };
    for (let slot = 0; slot < 2; slot += 1) {
      if (memo.body[slot] === body && Object.is(memo.margin[slot], margin)) return memo.grown[slot]!;
    }
    const grown = growActor(body, margin), slot = memo.next;
    memo.body[slot] = body; memo.margin[slot] = margin; memo.grown[slot] = grown; memo.next = 1 - slot;
    return grown;
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
    // startState(state, start) then prospective: the start frame is passed, not copied.
    const footprint = this.prospectiveFrom(state, start.distanceMetres, start.direction, start.gaitDistanceMetres,
      state.direction * state.spec.speedMetresPerSecond * seconds);
    if (index !== undefined && this.states[index] === state) {
      if (memo === undefined) this.lookaheads[index] = { epoch: this.previous, start,
        clock: this.clock, seconds, direction: state.direction, workerLeg: state.workerLeg, pause: state.pause,
        turning: state.turning, waiting: state.waiting, impactUntil: state.impactUntil, footprint };
      else {
        memo.epoch = this.previous; memo.start = start; memo.clock = this.clock; memo.seconds = seconds;
        memo.direction = state.direction; memo.workerLeg = state.workerLeg; memo.pause = state.pause;
        memo.turning = state.turning; memo.waiting = state.waiting; memo.impactUntil = state.impactUntil; memo.footprint = footprint;
      }
    }
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
    // This step's motion boxes: last step's are released (`BoxArena`).
    const boxes = this.boxes;
    boxes.release();
    const anticipationRows: Array<RouteAnticipationResult & { actorId: string; targetSpeedMetresPerSecond: number; incomplete: boolean }> = [];
    this.anticipationRows = anticipationRows;
    // The epoch start's own footprints: every reader below only reads them, and
    // published footprints are never written in place (PERF-WHARF: no copies).
    const actorBlockers = this.current.actors.map(pose => pose.footprint);
    // Formed on first use (a pedestrian-priority pair): one pure object per actor per step, as before.
    const stationaryActors: (BoundedMotion | undefined)[] = [], stationaryMemos = this.endpointMemoRow('stationary');
    const stationaryActor = (other: number): BoundedMotion =>
      stationaryActors[other] ??= boundedMotion(actorBlockers[other], actorBlockers[other], boxes, stationaryMemos[other] ??= {});
    const reservationBlockers = reserved.map(item => boundedMotion(item.footprint, item.footprint, boxes));
    // PERF-POP: each compact part's padded blocker is a pure function of the part and
    // the horizon, so it is formed once per step: for walkers at the one human
    // horizon (indexed by part), for vehicles per forecast horizon.
    const humanParts: (BoundedMotion | undefined)[] = [];
    const humanPart = (index: number): BoundedMotion => humanParts[index] ??= (() => {
      const near = compactAnticipationBlocker(anticipation!.components[index], R.humanLookAheadSeconds);
      const partFrom = grow(near.from, near.pad), partTo = grow(near.to, near.pad);
      return new Motion(partFrom, partTo, motionBounds(partFrom, partTo, boxes), undefined);
    })();
    const vehicleParts = new Map<number, RouteAnticipationBlocker[]>();
    // PERF-WHARF: per step, the vehicles' shared route-scan rows (see the vehicle branch below).
    let routeReservations: RouteAnticipationBlocker[] | undefined, routeOrder: readonly number[] | undefined;
    let routeHeadingSin: Float64Array | undefined, routeHeadingCos: Float64Array | undefined;
    const routeActorRows = new Map<number, (RouteAnticipationBlocker | undefined)[]>();
    /** The stable id order of [parts, reservations, every actor]; each scan's blockers are a subsequence of it. */
    const routeOrderFor = (parts: readonly RouteAnticipationBlocker[]): readonly number[] => {
      if (routeOrder !== undefined) return routeOrder;
      const reservations = routeReservations = reserved.map(item => ({ id: `reservation:${item.id}`, from: item.footprint, to: item.footprint, pad: 0,
        terms: createRouteBlockerTerms() }));
      const ids = this.actorBlockerIds, partCount = parts.length, rowCount = partCount + reservations.length;
      const idOf = (slot: number): string => slot < partCount ? parts[slot].id : slot < rowCount ? reservations[slot - partCount].id : ids[slot - rowCount];
      // The actor ids are the world's; a step naming the same part and
      // reservation ids, in the same places, has last step's order.
      const known = this.routeOrderIds;
      let same = known.length === rowCount && this.routeOrder.length === rowCount + actorBlockers.length;
      for (let slot = 0; same && slot < rowCount; slot += 1) same = known[slot] === idOf(slot);
      if (same) { routeHeadings(); return routeOrder = this.routeOrder; }
      const order = Array.from({ length: rowCount + actorBlockers.length }, (_, slot) => slot);
      order.sort((first, second) => { const a = idOf(first), b = idOf(second); return a < b ? -1 : a > b ? 1 : 0; });
      this.routeOrder = order; this.routeOrderIds = Array.from({ length: rowCount }, (_, slot) => idOf(slot));
      routeHeadings();
      return routeOrder = order;
    };
    const routeHeadings = (): void => {
      routeHeadingSin = new Float64Array(actorBlockers.length); routeHeadingCos = new Float64Array(actorBlockers.length);
      for (let other = 0; other < actorBlockers.length; other += 1) {
        routeHeadingSin[other] = Math.sin(actorBlockers[other].headingY); routeHeadingCos[other] = Math.cos(actorBlockers[other].headingY);
      }
    };
    const forecasts = new Map<number, { people: BoundedMotion[]; actors: BoundedMotion[]; xStore: XOrder; xIndex?: ForecastXIndex }>();
    const forecastFor = (seconds: number) => {
      let forecast = forecasts.get(seconds);
      if (!forecast) {
        const forecastMemos = this.endpointMemoRow(`forecast:${seconds}`);
        forecast = { people: people.map(person => boundedMotion(person.current, predictBody(person.current, seconds), boxes)),
          actors: actorBlockers.map((body, other) => boundedMotion(body, predictActorBody(body, seconds), boxes, forecastMemos[other] ??= {})),
          xStore: this.xOrderFor(seconds) };
        forecasts.set(seconds, forecast);
      }
      return forecast;
    };
    // PERF-POP: published poses are never written in place (every change forms a
    // new pose; see PopulationActorPose), so the epoch start shares them rather
    // than deep-copying all of them. The snapshot record itself is still fresh,
    // so the lookahead memo's `epoch === this.previous` identity stays unique to
    // this step exactly as the former copy's was, even after a step that threw.
    this.previous = { tick: this.current.tick, clockSeconds: this.current.clockSeconds, actors: this.current.actors };
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
      // walker can still turn or walk on (never pinned mid-step). A knock-down
      // is not something else stopping it (M42): the clock pauses while they
      // sit, and a step aside begun before the fall goes ahead once they are
      // up, as a stagger's does after its flinch. Dropped, it left a CPU cop
      // held against a person who could then only turn round into him.
      state.asideStalled = knockedDown(state, this.clock) ? state.asideStalled
        : state.aside !== state.asideTarget && state.aside === state.stepStartAside ? state.asideStalled + dt : 0;
      if (state.asideStalled > SIDESTEP_GIVE_UP_SECONDS) { state.asideTarget = state.aside; state.asideStalled = 0; }
      state.stepStartWorkerLeg = state.workerLeg; state.stepStartAside = state.aside;
      state.waiting = false; state.waitingOn.length = 0;
      const { spec } = state;
      // A pending step aside for a rider goes ahead once the flinch has played.
      // A knock-down holds the person where they sat for all of it (M42).
      const flinching = state.impactUntil > this.clock && (state.reaction === 'knockdown' || state.aside === state.asideTarget
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
      if (state.aside !== 0 && state.asideTarget === state.aside && this.pathClearOfPeople(state, people)
        && (state.asideFor < 0 || (this.pathClearOfPeople(state, [this.vehicleAsOccupant(state.asideFor)]) && this.pathClearOfActors(state, index)))) state.asideTarget = 0;
      if (state.asideFor >= 0 && state.aside === 0 && state.asideTarget === 0) state.asideFor = -1;
      if (state.aside !== state.asideTarget) {
        const step = clamp(state.asideTarget - state.aside, -SIDESTEP_METRES_PER_SECOND * dt, SIDESTEP_METRES_PER_SECOND * dt);
        state.aside = Math.abs(state.asideTarget - state.aside - step) <= R.epsilon ? state.asideTarget : state.aside + step;
        state.gaitDistance += Math.abs(step); state.speed = Math.abs(step) / dt;
        state.pose = this.makePose(state, 0, 0, state.speed, before, dt);
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
      // M47 living-r2: loop traffic keeps its own, smaller waiting gap (`POPULATION_TRAFFIC.waitingGapMetres`).
      const gap = isVehicle ? (this.following && this.loopId[index] >= 0 ? POPULATION_TRAFFIC.waitingGapMetres : R.vehicleWaitingGapMetres) : R.humanWaitingGapMetres;
      const from = before.footprint;
      const forecast = forecastFor(horizon);
      // The blockers, in their former list's order: the people's forecasts, the
      // reservations, then every other actor (PERF-WHARF: read in place, no list).
      // A vehicle never has pedestrian priority over anyone, and a pair with no
      // shared crossing has none either: pedestrianPriority answers both false
      // before any forecast, so they are not asked (PERF-POP). The pairs that do
      // share one are fixed by the plan, listed once at reset, and asked here in
      // the same order. The waiting vehicle's hypothetical future must not
      // deadlock the pedestrian who has priority: its actual body still blocks this step.
      const held = this.priorityHeld, stamp = this.priorityStamp += 1;
      const candidates = this.priorityVehicles[index];
      let heldCount = 0;
      for (let c = 0; c < candidates.length; c += 1) {
        const other = candidates[c];
        if (this.following ? this.priorityOver(index, other) : this.pedestrianPriority(state, this.states[other])) {
          stationaryActor(other); held[other] = stamp; heldCount += 1;
        }
      }
      const actorBlocker = (other: number): BoundedMotion => heldCount > 0 && held[other] === stamp ? stationaryActor(other) : forecast.actors[other];
      const look = isVehicle && anticipation ? null : this.ownLookahead(state, index, horizon);
      const grownFrom = this.grownFor(index, from, gap), grownLook = look === null ? null : growActor(look, gap);
      const lookBounds = grownLook === null ? NO_BOX : motionBounds(grownFrom, grownLook, boxes);
      // this.states.some(other => this.pedestrianPriority(other, state)): only the
      // pedestrians sharing a crossing with this vehicle can answer true (PERF-WHARF).
      let priorityHold = false;
      // M47 living-r2: a patience claim it has driven through ends before its priority is asked.
      if (isVehicle && this.following && this.loopId[index] >= 0) this.releasePatience(index, state);
      // Living-r2: who holds it is who it waits on (the one it already waited
      // on first, so the stall's clock runs on), so a wait round people and
      // vehicles is seen and resolved (`resolveMutualWaits`).
      if (isVehicle && this.following && state.blockedBy >= 0 && this.priorityPedestrians[index].includes(state.blockedBy)
        && this.priorityOver(state.blockedBy, index)) { priorityHold = true; state.waitingOn.push(state.blockedBy); }
      if (isVehicle && !priorityHold) for (const other of this.priorityPedestrians[index]) {
        if (this.following ? this.priorityOver(other, index) : this.pedestrianPriority(this.states[other], state)) {
          priorityHold = true; if (this.following) state.waitingOn.push(other); break;
        }
      }
      // A blocker the look starts inside and leaves (its gap grows) is not
      // waited on: the fraction loop's and constrain()'s departing-overlap
      // rule, so a walker walks away from a body stopped just behind it (POP-5).
      // Actor blockers are recorded for the mutual-wait resolution.
      let needsWait = priorityHold;
      if (grownLook !== null) {
        // The look's sweep is always (grownFrom -> grownLook); its two endpoints,
        // and each blocker's, are formed once and shared by every sweep (PERF-POP).
        const lookTrack: SweepTrack = { from: grownFrom, to: grownLook };
        const waitsOn = (blocker: BoundedMotion): boolean => {
          trackEndpoints(lookTrack); wholeEndpoints(blocker);
          const hit = sweepHullsWithEndpoints(grownFrom, grownLook, blocker.from, blocker.to,
            lookTrack.first!, lookTrack.last!, blocker.first!, blocker.last!);
          return hit !== null && !(hit.initiallyOverlapping && (staticContact(grownLook, blocker.to)?.gap ?? Infinity)
            > (staticContact(grownFrom, blocker.from)?.gap ?? Infinity) + R.epsilon);
        };
        for (const blocker of forecast.people) {
          if (!mayMeet(boxes, lookBounds, blocker.bounds) || !waitsOn(blocker)) continue;
          needsWait = true;
          if (!state.waitingOn.includes(OCCUPANT_WAIT)) state.waitingOn.push(OCCUPANT_WAIT);
        }
        for (const blocker of reservationBlockers) if (mayMeet(boxes, lookBounds, blocker.bounds) && waitsOn(blocker)) needsWait = true;
        // Only the others mayMeet could accept, in index order (PERF-WHARF, `actorCandidates`).
        const lookCandidates = actorCandidates(forecast, lookBounds, index, held, stamp, candidates, this.lookCandidates, boxes);
        for (let c = 0; c < lookCandidates.length; c += 1) {
          const other = lookCandidates[c], blocker = actorBlocker(other);
          if (!mayMeet(boxes, lookBounds, blocker.bounds) || !waitsOn(blocker)) continue;
          needsWait = true; state.waitingOn.push(other);
        }
        // **And on a rider's compact parts, where the caller supplied them.**
        // A leaning rider's body reaches past his coarse box, and the contact
        // transaction admits by the parts: waiting on the box alone, a walker
        // stepped into the side of a passing cop and the two held each other
        // still for good (the chaseprobe pin, 2026-10-03).
        if (!needsWait && !isVehicle && anticipation) {
          for (let partIndex = 0; partIndex < anticipation.components.length; partIndex += 1) {
            // A non-vehicle's horizon is always the human look-ahead, so the part index alone keys its padded blocker.
            const part = humanPart(partIndex);
            if (!mayMeet(boxes, lookBounds, part.bounds) || !waitsOn(part)) continue;
            needsWait = true; state.waitingOn.push(OCCUPANT_WAIT);
            break;
          }
        }
        // M47 living-r2: a person not yet on a crossing a patient vehicle has claimed waits for it.
        if (this.following && !isVehicle && look !== null) {
          const claimant = this.yieldsToPatience(index, state, from, look);
          if (claimant >= 0) { needsWait = true; state.waitingOn.push(claimant); }
        }
      }
      if (isVehicle && anticipation) {
        const forecastSeconds = Math.max(horizon, state.speed / R.vehicleBrakingMetresPerSecondSquared + dt);
        const pathTravel = Math.max(spec.speedMetresPerSecond * forecastSeconds,
          state.speed * state.speed / (2 * R.vehicleBrakingMetresPerSecondSquared) + state.speed * dt + gap);
        let parts = vehicleParts.get(forecastSeconds);
        if (parts === undefined) vehicleParts.set(forecastSeconds, parts = anticipation.components.map(part =>
          ({ ...compactAnticipationBlocker(part, forecastSeconds), terms: createRouteBlockerTerms() })));
        // PERF-WHARF: the scan's blockers are built already in its own stable id
        // order (parts, reservations, then the other actors, by one sort a step),
        // and each blocker record, reservation row and forecast body is formed
        // once a step per horizon and shared by every vehicle: the scan reads
        // them and keeps none. The same set, the same values, the same order.
        const routeOrder = routeOrderFor(parts);
        let actorRows = routeActorRows.get(forecastSeconds);
        if (actorRows === undefined) routeActorRows.set(forecastSeconds, actorRows = []);
        const routeBlockers = this.routeBlockerScratch;
        routeBlockers.length = 0;
        const own = actorBlockers[index], travelY = travelHeading(state.path.path, state.distance, state.direction);
        const travelSin = Math.sin(travelY), travelCos = Math.cos(travelY);
        const headingSin = routeHeadingSin!, headingCos = routeHeadingCos!, partCount = parts.length;
        // M47 living-r2: the scan's broad phase (`routeScanBox`); this loop's own
        // traffic left to the following rule (path distance, not boxes); standing
        // bodies its loop can never meet left out (`standingClearOf`); people
        // standing still judged by the hull itself (`standingHit`).
        const box = this.following ? this.routeScanBox(state, pathTravel, gap, dt) : null;
        const loop = this.following ? this.loopId[index] : -1, standing = loop >= 0 ? this.standingClear[index] : undefined;
        const standingPeople = this.standingScratch, pinnedPeople = this.pinnedScratch;
        standingPeople.length = 0; pinnedPeople.length = 0;
        let squeezing = false;
        for (let entry = 0; entry < routeOrder.length; entry += 1) {
          const slot = routeOrder[entry];
          if (slot < partCount + routeReservations!.length) {
            const row = slot < partCount ? parts[slot] : routeReservations![slot - partCount];
            if (box === null || turningRowMayReach(row, box)) routeBlockers.push(row);
            continue;
          }
          const other = slot - partCount - routeReservations!.length;
          if (other === index || (loop >= 0 && (this.loopId[other] === loop || standing!.has(other)))) continue;
          if (loop >= 0 && this.pinnedAgainst(other, index, people)) { pinnedPeople.push(other); continue; }
          const body = actorBlockers[other];
          if (whollyBehindAlong(own, travelSin, travelCos, body, headingSin[other], headingCos[other])) continue;
          if (box !== null) {
            // Its forecast keeps its heading and size: its box is its body's, swept by its velocity.
            const c = Math.abs(headingCos[other]), s = Math.abs(headingSin[other]);
            const reachX = c * body.halfWidthMetres + s * body.halfLengthMetres, reachZ = s * body.halfWidthMetres + c * body.halfLengthMetres;
            const toX = body.x + body.velocityX * forecastSeconds, toZ = body.z + body.velocityZ * forecastSeconds;
            if (Math.min(body.x, toX) - reachX > box.maxX || Math.max(body.x, toX) + reachX < box.minX
              || Math.min(body.z, toZ) - reachZ > box.maxZ || Math.max(body.z, toZ) + reachZ < box.minZ) continue;
          }
          // Living-r2: a person standing still is judged by the hull itself along the route (`standingHit`).
          if (loop >= 0 && body.velocityX === 0 && body.velocityZ === 0 && !vehicle(this.states[other].spec.kind)) {
            standingPeople.push(other); continue;
          }
          // pedestrianPriority(vehicle, ...) is false before any forecast: a vehicle never has it (PERF-POP).
          // At the look-ahead horizon itself the forecast already holds predictActorBody(body, horizon).
          routeBlockers.push(actorRows[other] ??= { id: this.actorBlockerIds[other], from: body,
            to: Object.is(forecastSeconds, horizon) ? forecast.actors[other].to : predictActorBody(body, forecastSeconds), pad: 0,
            terms: createRouteBlockerTerms() });
        }
        const incomplete = anticipation.incompleteOwnerIds.length > 0 || anticipation.components.length > R.compactAnticipationMaximumComponents;
        let scan: RouteAnticipationResult = incomplete
          ? { availableTravelMetres: 0, blockedBy: 'incomplete-compact-census', overflow: false, spanVisits: 0, blockerTests: 0 }
          : routeAnticipation({ path: state.path.path, distanceMetres: state.distance, direction: state.direction,
            travelMetres: pathTravel, fullHullAxisBoundMetres: Math.hypot(spec.hull.halfWidthMetres, spec.hull.halfLengthMetres, spec.hull.heightMetres),
            gapMetres: gap, blockers: routeBlockers,
            // The scan only reads the current footprint, which is never written in place (PERF-WHARF).
            flatSupport: { sampler: this.sampler, hull: spec.hull, currentHeadingY: state.heading,
              currentFootprint: state.pose.footprint,
              maximumNativeStepTravelMetres: Math.max(spec.speedMetresPerSecond, state.speed) * dt } });
        // Someone pinned against it is squeezed past hull to hull only if the
        // whole route ahead clears them so; else they are an ordinary stop.
        if (pinnedPeople.length > 0 && !incomplete && !scan.overflow) {
          if (this.standingHit(state, pinnedPeople, actorBlockers, pathTravel, 0, SQUEEZE_SLACK_METRES) >= 0) standingPeople.push(...pinnedPeople);
          else squeezing = true;
        }
        if (standingPeople.length > 0 && !incomplete && !scan.overflow) {
          const reach = scan.blockedBy === null ? pathTravel : scan.availableTravelMetres;
          const hit = this.standingHit(state, standingPeople, actorBlockers, reach, gap, STANDING_HIT_SLACK_METRES);
          if (hit >= 0) { scan = { ...scan, availableTravelMetres: this.standingHitTravel, blockedBy: this.actorBlockerIds[hit] }; squeezing = false; }
        }
        let scanTarget = incomplete || scan.overflow ? 0
          : scan.blockedBy === null ? spec.speedMetresPerSecond
          : Math.min(spec.speedMetresPerSecond, routeBrakingSpeedCap(scan.availableTravelMetres, dt));
        // Squeezing past someone pinned against it, hull to hull: at a walk.
        if (squeezing) scanTarget = Math.min(scanTarget, POPULATION_TRAFFIC.squeezeMetresPerSecond);
        let target = priorityHold ? 0 : scanTarget;
        // M47 living-r2: its loop's traffic, by path distance; a cap, never a push.
        let waitsOnTraffic = -1;
        if (loop >= 0) {
          const cap = this.trafficCap(index, state, dt, target > 0);
          if (cap < target) { target = cap; waitsOnTraffic = this.trafficWaitsOn; }
          this.notePatience(index, priorityHold, Math.min(scanTarget, cap), dt);
        }
        needsWait = target < spec.speedMetresPerSecond;
        anticipationRows.push({ ...scan, actorId: spec.id, targetSpeedMetresPerSecond: target, incomplete });
        if (waitsOnTraffic >= 0) state.waitingOn.push(waitsOnTraffic);
        else if (scan.blockedBy?.startsWith('actor:')) {
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
      const grownProspective = growActor(prospective, gap), prospectiveBounds = motionBounds(grownFrom, grownProspective, boxes);
      const nativeFraction = Math.min(1, dt / horizon);
      // M47 living-r2: loop traffic slides along a body already inside its
      // waiting gap, getting no closer (a person standing beside the van held
      // it for good: driving on parallel to them never widened the gap).
      const slidesPast = this.following && this.loopId[index] >= 0;
      if (slidesPast) this.nativeBlocker[index] = -1;
      let fraction = 1;
      const candidateTrack: SweepTrack = { from: grownFrom, to: grownProspective };
      let pinnedTrack: SweepTrack | undefined;
      // Every blocker in the former list's order (Math.min over the same values: order-free anyway).
      // The others: only those mayMeet could accept (PERF-WHARF, `actorCandidates`).
      const nativeCandidates = actorCandidates(forecast, prospectiveBounds, index, held, stamp, candidates, this.nativeCandidates, boxes);
      const blockerCount = forecast.people.length + reservationBlockers.length + nativeCandidates.length;
      for (let k = 0; k < blockerCount; k += 1) {
        const other = k - forecast.people.length - reservationBlockers.length;
        const blocker = other < 0 ? k < forecast.people.length ? forecast.people[k] : reservationBlockers[k - forecast.people.length]
          : actorBlocker(nativeCandidates[other]);
        if (!mayMeet(boxes, prospectiveBounds, blocker.bounds)) continue;
        if (blocker.nativeFraction !== nativeFraction || !blocker.nativeTo) {
          blocker.nativeFraction = nativeFraction; blocker.nativeTo = mixBody(blocker.from, blocker.to, nativeFraction);
        }
        const next = blocker.nativeTo;
        // M47 living-r2: someone pinned against this vehicle for good
        // (`waitsForGood`) is passed hull to hull, without the waiting gap,
        // at a walk: a van's tail swinging out of a turn, or a lane brushing
        // the end of a pavement, kept it a hand short of them for the session.
        const pinned = slidesPast && other >= 0 && this.pinnedAgainst(nativeCandidates[other], index, people);
        const track = pinned ? (pinnedTrack ??= { from, to: prospective }) : candidateTrack;
        trackEndpoints(track); nativeEndpoints(blocker);
        const hit = sweepHullsWithEndpoints(track.from, track.to, blocker.from, next,
          track.first!, track.last!, blocker.nativeFirst!, blocker.nativeLast!);
        if (hit) {
          // A merged blocker moving away may be allowed to leave, but we do
          // not walk deeper into it while waiting for that to happen.
          const startGap = staticContact(track.from, blocker.from)?.gap ?? Infinity;
          const endGap = staticContact(track.to, next)?.gap ?? Infinity;
          if (hit.initiallyOverlapping && (endGap > startGap + R.epsilon
            || (slidesPast && endGap >= startGap - R.epsilon))) continue;
          const stop = Math.max(0, hit.timeOfImpact - R.contactSkinMetres / Math.max(Math.abs(wanted), R.contactSkinMetres));
          if (slidesPast && other >= 0 && stop < fraction && !vehicle(this.states[nativeCandidates[other]].spec.kind)) this.nativeBlocker[index] = nativeCandidates[other];
          fraction = Math.min(fraction, stop);
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
      } else if (spec.movement === 'shuttle' && ((state.distance <= this.shuttleLow(state) + R.epsilon && state.direction === -1)
        || (state.distance >= this.shuttleHigh(state) - R.epsilon && state.direction === 1))) {
        // Only an arrival turns: one already facing back in, held at the end
        // by someone in its way, flipped back to the end every step (POP-2).
        state.direction = state.direction === 1 ? -1 : 1;
        state.pause = spec.idleSeconds; state.turning = !isVehicle; state.speed = 0;
      }
      state.pose = this.makePose(state, 0, 0, Math.abs(actualTravel) / dt * (isVehicle ? motionDirection : 1), before, dt);
    }
    // Resolve actual simultaneous AI trajectories after prediction. Previous
    // velocities alone cannot prevent two newly accelerating actors meeting
    // at a crossing; rotating a stopped actor also has a physical swept hull.
    const fractions = this.states.map(() => 1);
    const originalMemos = this.endpointMemoRow('original'), grownMemos = this.endpointMemoRow('grown');
    const actualMotions = this.states.map((state, index) => {
      // The published footprints themselves: never written in place (PERF-POP).
      const from = this.previous.actors[index].footprint, to = state.pose.footprint;
      // A turn on the spot keeps its own body's clearance: the waiting gap is
      // for walking up to someone, and grown by it a walker stopped in front of
      // a rider could never turn round and leave (R2C-5, 2026-10-04).
      const turningOnly = state.speed === 0 && state.stepTravel === 0 && from.headingY !== to.headingY;
      const gap = turningOnly ? 0 : vehicle(state.spec.kind) ? (this.following && this.loopId[index] >= 0 ? POPULATION_TRAFFIC.waitingGapMetres
        : R.vehicleWaitingGapMetres) : R.humanWaitingGapMetres;
      return new ActualMotion(boundedMotion(from, to, boxes, originalMemos[index] ??= {}),
        boundedMotion(this.grownFor(index, from, gap), this.grownFor(index, to, gap), boxes, grownMemos[index] ??= {}),
        turningOnly && turnsThroughRiders(state.spec.kind), state.aside !== state.stepStartAside,
        this.following && this.loopId[index] >= 0);
    });
    // M47 living-r2: the person a loop vehicle's own move answers to (`nativeBlocker`), else -1.
    const heldBy = (self: number, other: number): number => actualMotions[self].slidesPast && !vehicle(this.states[other].spec.kind) ? other : -1;
    // M47 living-r2: a loop vehicle passes someone pinned against it hull to hull (see the native step).
    const grownAgainst = (self: number, other: number): BoundedMotion => {
      const motion = actualMotions[self];
      if (!motion.slidesPast || !this.pinnedAgainst(other, self, people)) return motion.grown;
      return motion.original;
    };
    const nativeMotions = people.map(person => boundedMotion(person.current, predictBody(person.current, dt), boxes));
    // A step aside answers where a rider is, not where he pushes: his travel
    // into the walker is refused anyway, and stopped it every step (R2C-5).
    const standingBodies = people.map(person => boundedMotion(person.current, person.current, boxes));
    const constrain = (index: number, first: BoundedMotion, second: BoundedMotion, slides = false, other = -1): void => {
      if (!mayMeet(boxes, first.bounds, second.bounds)) return;
      const a0 = first.from, a1 = first.to, b0 = second.from, b1 = second.to;
      wholeEndpoints(first); wholeEndpoints(second);
      const hit = sweepHullsWithEndpoints(a0, a1, b0, b1, first.first!, first.last!, second.first!, second.last!);
      if (!hit) return;
      const startGap = staticContact(a0, b0)?.gap ?? Infinity;
      const endGap = staticContact(a1, b1)?.gap ?? Infinity;
      // A step aside within a rider's waiting gap slides along it: no closer (R2C-5).
      if (hit.initiallyOverlapping && (endGap > startGap + R.epsilon || (slides && endGap >= startGap - R.epsilon))) return;
      const distance = Math.hypot(a1.x - a0.x, a1.z - a0.z)
        + Math.hypot(a0.halfWidthMetres, a0.halfLengthMetres) * Math.abs(wrapAngle(a1.headingY - a0.headingY));
      const stop = Math.max(0, hit.timeOfImpact - R.contactSkinMetres / Math.max(distance, R.contactSkinMetres));
      if (other >= 0 && stop < fractions[index]) this.nativeBlocker[index] = other;
      fractions[index] = Math.min(fractions[index], stop);
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
    }
    // Every actor pair, i < j: constrain(i, i grown, j original) and
    // constrain(j, j grown, i original). PERF-WHARF: a pair whose two motions'
    // X extents (the grown and original boxes together) do not overlap is one
    // mayMeet refuses both ways, so it is not visited; every pair it could
    // accept is, both calls in their former direction. Their fractions are
    // Math.min over the same values, which is order-free; nothing else is
    // written but each motion's pure endpoint cache. Comparisons only, no sums.
    const count = this.states.length, order = this.pairOrder, low = this.pairLow, high = this.pairHigh;
    let unbounded = 0;
    for (let i = 0; i < count; i += 1) {
      const grown = actualMotions[i].grown.bounds, original = actualMotions[i].original.bounds;
      // A motion with no box (non-finite or malformed) meets everything: mayMeet answers true.
      if (grown === NO_BOX || original === NO_BOX) { low[i] = -Infinity; high[i] = -Infinity; unbounded += 1; continue; }
      const box = boxes.data;
      low[i] = Math.min(box[6 * grown], box[6 * original]); high[i] = Math.max(box[6 * grown + 1], box[6 * original + 1]);
    }
    // M47 living-r2: a walker or jogger turning on the spot turns through a
    // loop vehicle as through a rider (only the corners of its square stand-in
    // sweep): turned round against a van squeezing past, it froze mid-turn and
    // its sweeping corners held the van, for good.
    const turnsThrough = (self: number, other: number): boolean => actualMotions[self].turnsInPlace && actualMotions[other].slidesPast;
    const pair = (a: number, b: number): void => {
      const i = a < b ? a : b, j = a < b ? b : a;
      if (!turnsThrough(i, j)) constrain(i, grownAgainst(i, j), actualMotions[j].original, actualMotions[i].slidesPast, heldBy(i, j));
      if (!turnsThrough(j, i)) constrain(j, grownAgainst(j, i), actualMotions[i].original, actualMotions[j].slidesPast, heldBy(j, i));
    };
    if (unbounded > 0) for (let a = 0; a < count; a += 1) if (low[a] === -Infinity) {
      for (let b = 0; b < count; b += 1) if (b !== a && (low[b] !== -Infinity || b > a)) pair(a, b);
    }
    // The permutation is kept from step to step, so this insertion sort is nearly free.
    for (let index = 1; index < count; index += 1) {
      const value = order[index], key = low[value];
      let at = index - 1;
      while (at >= 0 && low[order[at]] > key) { order[at + 1] = order[at]; at -= 1; }
      order[at + 1] = value;
    }
    // Boxless motions sort first; from a boxed one, every later one starts no further left.
    for (let p = 0; p < count; p += 1) {
      const a = order[p], reach = high[a];
      if (low[a] === -Infinity) continue;
      for (let q = p + 1; q < count && low[order[q]] <= reach; q += 1) pair(a, order[q]);
    }
    fractions.forEach((fraction, index) => {
      if (fraction < 1) { this.stopAtFraction(this.states[index], fraction); this.states[index].waiting = true;
        this.refreshActorActivity(this.states[index], 0); }
    });
    if (this.following) this.noteNativeHolds(dt);
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
      // Knocked down (M42): nothing is decided mid-reaction — no step aside,
      // no turn round — and the wait counts afresh once they are up.
      if (knockedDown(states[i], this.clock)) { states[i].blockedSeconds = 0; continue; }
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
      // M47 living-r2: a walker or jogger pinned against a loop vehicle for
      // good (`waitsForGood`: a path end or a fresh turn at its back) steps off
      // the path to let it by, as for a rider, when the van cannot squeeze past.
      // One kept waiting on a loop vehicle for `giveWaySeconds` gives way the
      // same way, else turns round: a van can stand for them while it waits on
      // someone else (Codex's audit, seed `m47-audit-03` High: a walker stood
      // in front of the head van waiting for it, the van waited on another
      // walker at the crossing ahead, and its queue stood 70 s).
      if (this.following && states[i].aside === states[i].asideTarget) {
        const by = states[i].blockedBy, kind = states[i].spec.kind;
        if (by >= 0 && (kind === 'walker' || kind === 'jogger') && this.loopId[by] >= 0) {
          const forGood = this.waitsForGood(i, by, people);
          const givesWay = forGood || states[i].blockedSeconds >= POPULATION_TRAFFIC.giveWaySeconds;
          if (givesWay && this.stepAsideFor(states[i], by)) {
            states[i].asideFor = by; states[i].blockedBy = -1; states[i].blockedSeconds = 0; continue;
          }
          if (givesWay && !forGood && states[i].impactUntil <= this.clock
            && this.turnRoom(states[i]) > MUTUAL_TURN_ROOM_METRES && this.turnSweepClear(states[i], people)) {
            turnRound(states[i], [i]); continue;
          }
        }
        if (by >= 0 && (kind === 'walker' || kind === 'jogger') && !vehicle(states[by].spec.kind)
          && states[i].blockedSeconds >= MUTUAL_WAIT_SECONDS && this.turnRoom(states[i]) <= MUTUAL_TURN_ROOM_METRES
          && states[i].pause === 0 && !states[i].turning && this.stepAsideForPathmate(states[i], by)) {
          states[i].asideFor = by; states[i].blockedBy = -1; states[i].blockedSeconds = 0; continue;
        }
      }
      if (states[i].blockedSeconds < MUTUAL_WAIT_SECONDS) continue;
      // M47 living-r2: someone standing for good across its way is a path end
      // (a standing group on a walk): it turns round there as at one.
      const partner = states[i].blockedBy;
      if (this.following && partner >= 0 && states[partner].spec.movement === 'stationary') {
        if (this.turnRoom(states[i]) > MUTUAL_TURN_ROOM_METRES && this.turnSweepClear(states[i], people)) turnRound(states[i], [i]);
        continue;
      }
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
    if (!this.following) return state.direction === 1 ? state.distance : state.path.path.lengthMetres - state.distance;
    return Math.max(0, state.direction === 1 ? state.distance - state.shuttleLow : state.shuttleHigh - state.distance);
  }
  /** Where a shuttle turns round at its start and end (the state's lane-trimmed ends on living-r2, else 0 and the length). */
  private shuttleLow(state: ActorState): number { return this.following ? state.shuttleLow : 0; }
  private shuttleHigh(state: ActorState): number { return this.following ? state.shuttleHigh : state.path.path.lengthMetres; }

  private refreshActorActivity(state: ActorState, signedSpeed = state.pose.speedMetresPerSecond): void {
    const pose = state.pose;
    state.pose = withImpactReaction({ ...pose, ...(signedSpeed === 0 ? { velocityX: 0, velocityZ: 0,
      speedMetresPerSecond: 0, backing: false,
      footprint: { ...pose.footprint, velocityX: 0, velocityZ: 0 } } : {}),
      ...actorActivity(state, this.clock, signedSpeed) }, state, this.clock);
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
    state.pose = withImpactReaction({ ...held, velocityX: 0, velocityZ: 0, speedMetresPerSecond: 0, backing: false,
      distanceMetres: state.distance, direction: state.direction, gaitDistanceMetres: state.gaitDistance,
      wheelTravelMetres: state.wheelTravel,
      footprint: { ...held.footprint, velocityX: 0, velocityZ: 0 },
      ...actorActivity(state, this.clock, 0) }, state, this.clock);
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
      previous: detachedFootprint(this.previous.actors[index].footprint),
      current: detachedFootprint(state.pose.footprint) }));
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
      return { id: state.spec.id, previous: detachedFootprint(this.previous.actors[index].footprint),
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
        // A charge never shortens, lengthens or downgrades a knock-down that
        // plays (M42): it gets up on its own clock. Otherwise it is the
        // stagger, and max() is today's value exactly (an older pause always ends sooner).
        if(charge){pair.cooldown=R.contactCooldownSeconds;
          if(!knockedDown(state,this.clock)){state.impactSeconds=R.impactPauseSeconds;state.reaction='stagger';
            state.impactUntil=Math.max(state.impactUntil,this.clock+R.impactPauseSeconds);}
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

  /**
   * M42: a human rider crashed into this person in this fixed step — the
   * physical transaction's upright-to-crashed edge, never a contact's speed —
   * so they sit down hard and get back up over
   * `POPULATION_REACTION.knockdownPauseSeconds`, staying put throughout
   * (still `'impacted'`, so whatever skips an impacted person skips them).
   * Walkers, joggers, workers and social people only; anyone else, an unknown
   * id or a second call while one plays is ignored. `normalX/Z` points from the
   * person toward the rider; they fall the other way. Fixed-step facts only:
   * the footprint, supports and velocity this step are untouched.
   */
  knockDown(actorId: string, normalX: number, normalZ: number): void {
    const index = this.stateIndex.get(actorId), state = index === undefined ? undefined : this.states[index];
    if (state === undefined || state.spec.id !== actorId || !knockdownKind(state.spec.kind)
      || knockedDown(state, this.clock) || !finite(normalX, normalZ) || (normalX === 0 && normalZ === 0)) return;
    state.reaction = 'knockdown';
    state.impactSeconds = POPULATION_REACTION.knockdownPauseSeconds;
    state.impactUntil = this.clock + state.impactSeconds;
    state.fallYaw = wrapAngle(Math.atan2(-normalX, -normalZ) - state.pose.headingY);
    // A wait counted before the fall decides nothing after it.
    state.blockedSeconds = 0; state.blockedGait = state.gaitDistance;
    this.refreshActorActivity(state);
    this.publish();
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
