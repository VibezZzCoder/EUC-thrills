/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHALLENGE, TRACK_DAY } from '../data/tuning.ts';
import type { Checkpoint, LapCourse } from '../level/plan.ts';
import { insideCheckpoint, type RouteReference } from './challenge.ts';

/**
 * The rules of a track day — M23 Phase B2, and the whole of them.
 *
 * **This is `simulation/challenge.ts`'s sibling, not its subclass.** Both are
 * referees: handed a position, a speed and three facts about the last step,
 * once per fixed step, they answer with the events that produced. Neither
 * draws, saves, or knows what a HUD is. What differs is the shape of the
 * course, and it differs in a way no parameter could paper over — a timed run
 * has two ends and a lap has one line — so the two are two files rather than
 * one file with a mode flag through the middle of it.
 *
 * Written out rather than shared, deliberately, and the duplication is
 * bounded: `insideCheckpoint` is imported because a gate volume must mean the
 * same thing in both, and `RouteReference` is imported because a record has to
 * be handed to either without reshaping. Everything else here is a lap's own
 * arithmetic.
 *
 * ## What a lap is
 *
 * Spawn is an **out lap**: the rider rolls to the line at whatever pace they
 * like and none of it is timed, which is what a pit exit looks like. Crossing
 * the line opens lap 1. Crossing it again closes that lap *and opens the next*
 * — the clock never stops between laps, because on a circuit there is nothing
 * to stop it for.
 *
 * **The line always closes the lap, whether or not the lap counts.** That is
 * the one substantive rule this file does not inherit from `challenge.ts`,
 * which seeks exactly one gate at a time and therefore leaves a rider who
 * missed a checkpoint in a run that can never end. On a lap that behaviour
 * would be a trap: the player would cross the line, see nothing happen, and
 * have to work out for themselves that they were three hundred metres back
 * riding a lap the game had stopped counting. Here the line is tested on every
 * step of a lap, so crossing it always puts the rider into a clean next lap;
 * whether the one that just ended *counted* is a separate question, answered
 * below and reported on the event.
 *
 * ## What voids a lap
 *
 * Two things, and both of them are "you did not ride the circuit":
 *
 *   1. **A sector line missed.** Only the next one is testable, exactly as in
 *      a timed run, so a rider who goes around one arrives at the line having
 *      crossed fewer gates than the lap has. No anti-cheat code is needed for
 *      this; it falls out of seeking one gate at a time.
 *   2. **Leaving the legal track envelope**, which is `LevelPlan.lap` — the
 *      lap's own centreline and the corridor width around it. §23.15 asks for
 *      this specifically, and asks for it to be derived from the envelope
 *      rather than from a catalog of the barrier's two gates, because a
 *      catalog describes the venue as it was on the day it was written.
 *
 * The verge is **inside** the envelope and is legal ground: running wide onto
 * the grass is a mistake the surface system already punishes with grip, and a
 * referee that deleted laps for it would be deleting laps for ordinary racing.
 * What the envelope excludes is ground a rider can only reach through a hole
 * in the barrier — the paddock, the infield, the field outside the circuit.
 *
 * **A crash does not void a lap.** It costs the time it costs, which is the
 * whole punishment a track day has ever needed.
 *
 * **And there is deliberately no minimum lap time.** One was drafted, as a
 * backstop against a corrupt record reaching the store, and it is not here
 * because it cannot pay for itself: a lap that reached the line having crossed
 * every sector in order without leaving the envelope *is* a lap of the
 * circuit, so the floor could only ever fire on a legitimate one. The
 * arithmetic is worth recording, because it is exactly the reasoning that makes
 * a floor look safe until it deletes somebody's best lap: the centreline is
 * 930 m, a racing line saves perhaps 60 m of it, and the top speed the drag
 * curve allows — a shade under 23 m/s, derived in `trackLevel.test.ts` from
 * `EUC.maxLeanPitch`, `EUC.leanToAccel` and `EUC.dragCoefficient` rather than
 * stated anywhere — puts the fastest conceivable lap at about 38 seconds. A
 * floor is therefore a number a few seconds under a time somebody will
 * eventually ride.
 *
 * Determinism is a hard requirement, as it is next door: the QA bridge's
 * `advance(n)` must produce the same session every time. No `Date`, no
 * `Math.random`, no wall clock — the clock is the accumulated fixed step
 * handed in by the caller.
 */

/**
 * Where a session is.
 *
 * `outLap` is `challenge.ts`'s `armed` under the name a circuit uses for it,
 * and it is reached again after every quick reset. `ended` is what `finished`
 * is there — but a lap session ends because the player pitted, never because
 * the course ran out.
 */
export type LapPhase = 'idle' | 'outLap' | 'running' | 'ended';

/** Why a lap will not count. Null while it still will. */
export type LapVoid = 'missed-sector' | 'off-course';

/** One lap, as it finished. */
export interface LapResult {
  /** Which lap of the session this was, counting from one. */
  readonly lap: number;
  readonly seconds: number;
  /**
   * Elapsed at each line crossed, **including both ends of the lap**.
   *
   * `[0]` is `0` at the start/finish line that opened the lap and the last
   * entry is the lap time at the line that closed it, so the array is one
   * longer than the circuit has gates and the legs between consecutive entries
   * are the sectors. Index zero is kept for the reason `challenge.ts` keeps
   * its own: the shape that cannot be misindexed beats the shape that is one
   * element shorter.
   *
   * A voided lap still carries whatever it crossed, so the HUD and the results
   * card can be honest about a lap that was going well until it was not.
   */
  readonly splits: readonly number[];
  /** Duration of the sector arriving at each entry of `splits`. `[0]` is `0`. */
  readonly legs: readonly number[];
  /** Whether it counted: every sector, in order, without leaving the track. */
  readonly counted: boolean;
  readonly voided: LapVoid | null;
  /** Whether a counting lap beat the stored record. Always false when voided. */
  readonly beatRecord: boolean;
}

/**
 * One crossing, as it happened.
 *
 * `challenge.ts`'s `ChallengeEvent` with a lap's vocabulary: `kind` says
 * whether a sector line or the start/finish line was crossed, and `lap` is
 * present on exactly the second of those.
 */
export interface TrackDayEvent {
  /**
   * `open` is a lap beginning, `sector` a sector line crossed, `lap` a lap
   * ending — and a lap that ends emits both, in that order, because on a
   * circuit those are one crossing.
   *
   * **`open` exists because something outside this file records the lap.** The
   * ghost recorder is fed the lap clock and keeps a sample only when the clock
   * has moved *forward*, so a lap that begins without saying so would leave the
   * recorder holding the previous lap's samples and silently discarding every
   * one of the new lap's — a stored ghost of a lap nobody rode. That failure is
   * invisible until somebody watches the replay.
   */
  readonly kind: 'sector' | 'lap' | 'open';
  readonly checkpointId: string;
  readonly routeIndex: number;
  readonly label: string;
  /** Lap seconds at the crossing. The lap time itself on a `lap` event. */
  readonly elapsed: number;
  /** The sector just completed. */
  readonly legSeconds: number;
  /** That sector versus the record's same sector. Null without a comparable one. */
  readonly legDelta: number | null;
  /** Elapsed here versus the record's elapsed here. Null without one. */
  readonly totalDelta: number | null;
  /** The lap that just closed, on a `lap` event and never otherwise. */
  readonly lap: LapResult | null;
}

/** The session, as a value, for anything that draws. */
export interface TrackDayState {
  readonly phase: LapPhase;
  /** The lap being ridden, counting from one. Zero on the out lap. */
  readonly lap: number;
  /** Seconds into the current lap. Zero outside one. */
  readonly elapsed: number;
  /** Whether the lap in progress will still count. */
  readonly valid: boolean;
  readonly voided: LapVoid | null;
  /** Whether the contact patch is inside the legal envelope right now. */
  readonly onCourse: boolean;
  /** The `routeIndex` being sought. `-1` when the session is not seeking one. */
  readonly nextIndex: number;
  /** That line's player-facing label. Empty when there is none. */
  readonly nextLabel: string;
  /** Metres to the centre of the line being sought. `Infinity` when none. */
  readonly distanceToNext: number;
  /** Lines crossed on the lap in progress, counting the one that opened it. */
  readonly crossed: number;
  /** How many lines the circuit has. */
  readonly lines: number;
  /** Crossings on the lap in progress, `[0] === 0`. */
  readonly splits: readonly number[];
  /** The last lap that **counted**. A void lap does not replace it. */
  readonly lastLapSeconds: number | null;
  /** Best counting lap **this session**. Null until one is set. */
  readonly bestLapSeconds: number | null;
  /** The stored best being chased, which the ghost is a recording of. */
  readonly recordSeconds: number | null;
  readonly lapsCounted: number;
  /**
   * Laps that closed at the line, counted or not.
   *
   * A lap that never reached the first sector line does not close — it starts
   * again (see `step`) — so it is not here either. That is the honest reading:
   * a lap abandoned before its first sector is a lap you did not ride, and a
   * results card that said otherwise would be counting the times a rider
   * shuffled over the line.
   */
  readonly lapsRidden: number;
}

/**
 * One fixed step's worth of the world.
 *
 * `challenge.ts`'s `ChallengeStepInput` field for field, and identical in
 * meaning — including that the position is the **contact patch** rather than
 * the centre of mass, and that `landed` arrives as an edge while `crashed`
 * arrives as a level and is edge-detected here.
 */
export interface TrackDayStepInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Signed along the heading, m/s. Only its magnitude matters here. */
  readonly speed: number;
  /** True on the single step the wheel touched down. */
  readonly landed: boolean;
  /** The controller's own verdict on that touchdown. Only read when `landed`. */
  readonly landingClean: boolean;
  /** True for every step the rider is down, not just the first. */
  readonly crashed: boolean;
}

/**
 * A finished session, frozen.
 *
 * **The record is the best lap** (§23.6), so `bestLapSeconds` is the number
 * that reaches `app/records.ts` and everything else here is the story of the
 * afternoon. `bestSectorLegs` is the other half of what a track day tells you:
 * a rider who has never put all three sectors together in one lap can see
 * exactly how much is on the table.
 */
export interface TrackDaySessionResult {
  readonly levelId: string;
  /** Null on a session that never completed a counting lap. */
  readonly bestLapSeconds: number | null;
  /** That lap's crossings, `[0] === 0` and the last entry the lap time. */
  readonly bestLapSplits: readonly number[];
  /** Best time for each sector across the session. `[0]` is `0`; `NaN` for a sector never completed. */
  readonly bestSectorLegs: readonly number[];
  /** Every sector's best added up, or null while one has never been set. */
  readonly idealLapSeconds: number | null;
  /** Each line's label, index-aligned with `bestLapSplits`. */
  readonly labels: readonly string[];
  readonly lapsCounted: number;
  readonly lapsRidden: number;
  readonly topSpeed: number;
  readonly landings: number;
  readonly cleanLandings: number;
  readonly crashes: number;
  readonly beatRecord: boolean;
  readonly previousBest: number | null;
}

/**
 * The empty result of a step that produced nothing.
 *
 * Shared and frozen for `challenge.ts`'s reason: this is the overwhelmingly
 * common case, 120 times a second for as long as the player keeps riding, in
 * the one loop in the game that must not stutter.
 */
const NO_EVENTS: readonly TrackDayEvent[] = Object.freeze([]);

/**
 * The legal track envelope, indexed for the step.
 *
 * A closed polyline with a half-width, and one question asked of it: is this
 * point within that width of the line anywhere. **A boolean rather than a
 * distance**, because that is what the rule needs and because a boolean can be
 * answered with an exact rejection — a span whose bounding box, grown by its
 * own half-width and the margin, does not contain the point cannot possibly
 * satisfy it. Almost every span rejects in four comparisons, so a 476-point
 * ring costs about two thousand comparisons a step rather than a square root
 * per span.
 *
 * No cursor, no remembered index, no window. `simulation/ghost.ts` argues the
 * same case for its binary search: a stateful accelerator has to be right when
 * the player resets, respawns, or is put back on the line by a retry, and is
 * wrong in a way that only ever shows up as a lap voided for no reason. The
 * circuit never crosses itself, so the whole-ring answer is unambiguous.
 */
export class LapEnvelope {
  private readonly x: Float64Array;
  private readonly z: Float64Array;
  private readonly reach: Float64Array;
  private readonly minX: Float64Array;
  private readonly maxX: Float64Array;
  private readonly minZ: Float64Array;
  private readonly maxZ: Float64Array;
  private readonly spans: number;
  /**
   * Arc length from the ring's first point to the start of each span, metres.
   *
   * **Added at M27 Phase 2, and it is referee work rather than new geometry**
   * (§27.4 says so in as many words): a race orders riders who are all
   * mid-lap, and "who is further round" is a question no boolean can answer.
   * The ring was already here and already sampled at a fixed 2 m by
   * `buildLevelPlan`; this is the running total nobody had needed yet.
   *
   * One entry per span plus a final total, so `distance[span + 1]` is always
   * readable and the last entry is the lap length as walked rather than as
   * declared — which is also the assertion that the two agree.
   */
  private readonly distance: Float64Array;

  readonly length: number;

  constructor(course: LapCourse, margin: number = TRACK_DAY.offCourseMarginMetres) {
    const points = course.points;
    const spans = Math.max(0, points.length - 1);
    this.spans = spans;
    this.length = course.length;
    this.x = new Float64Array(points.length);
    this.z = new Float64Array(points.length);
    this.reach = new Float64Array(spans);
    this.minX = new Float64Array(spans);
    this.maxX = new Float64Array(spans);
    this.minZ = new Float64Array(spans);
    this.maxZ = new Float64Array(spans);

    for (let index = 0; index < points.length; index += 1) {
      this.x[index] = points[index].x;
      this.z[index] = points[index].z;
    }
    this.distance = new Float64Array(spans + 1);
    for (let span = 0; span < spans; span += 1) {
      // The wider of the two ends, so a span between corridors of different
      // widths is never narrower than either of them thinks it is.
      const reach = Math.max(points[span].halfWidth, points[span + 1].halfWidth) + margin;
      this.reach[span] = reach;
      this.minX[span] = Math.min(this.x[span], this.x[span + 1]) - reach;
      this.maxX[span] = Math.max(this.x[span], this.x[span + 1]) + reach;
      this.minZ[span] = Math.min(this.z[span], this.z[span + 1]) - reach;
      this.maxZ[span] = Math.max(this.z[span], this.z[span + 1]) + reach;
      this.distance[span + 1] = this.distance[span] + Math.hypot(
        this.x[span + 1] - this.x[span],
        this.z[span + 1] - this.z[span],
      );
    }
  }

  /**
   * How far round the lap this point is, metres from the line — M27 Phase 2.
   *
   * The nearest point on the centreline, and the arc length to it. This is
   * what orders two riders who have both closed the same number of laps and
   * are somewhere out on the circuit, which is the standings question for all
   * but the last second of a race.
   *
   * **A full scan, on `contains`' argument rather than in spite of it.** No
   * cursor, no remembered span, no window: a stateful accelerator has to be
   * right when a rider resets, respawns, or is put back on the line, and is
   * wrong in a way that only shows up as a standings order nobody can explain.
   * The circuit never crosses itself, so the whole-ring answer is unambiguous,
   * and the arithmetic is the same shape the boolean already pays for.
   *
   * A point off the circuit still answers — the nearest place on the line to
   * where they are, which is the honest reading of "how far round is somebody
   * standing in the gravel". Whether that lap counts is `voided`'s question,
   * not this one's.
   */
  progressAt(x: number, z: number): number {
    let bestSquared = Infinity;
    let best = 0;
    for (let span = 0; span < this.spans; span += 1) {
      const ax = this.x[span];
      const az = this.z[span];
      const dx = this.x[span + 1] - ax;
      const dz = this.z[span + 1] - az;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0
        ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSquared))
        : 0;
      const nx = x - (ax + dx * t);
      const nz = z - (az + dz * t);
      const squared = nx * nx + nz * nz;
      if (squared >= bestSquared) continue;
      bestSquared = squared;
      best = this.distance[span] + t * (this.distance[span + 1] - this.distance[span]);
    }
    return best;
  }

  /**
   * The ring's length as walked, which is what `progressAt` counts along.
   *
   * `length` above is the course's own declared figure and the two agree to
   * within a rounding error; this is the one a progress number is a fraction
   * of, exposed so a test can say so rather than assume it.
   */
  get walkedLength(): number {
    return this.spans === 0 ? 0 : this.distance[this.spans];
  }

  /** Whether the point is on the circuit, verge included. */
  contains(x: number, z: number): boolean {
    for (let span = 0; span < this.spans; span += 1) {
      if (x < this.minX[span] || x > this.maxX[span]) continue;
      if (z < this.minZ[span] || z > this.maxZ[span]) continue;

      const ax = this.x[span];
      const az = this.z[span];
      const dx = this.x[span + 1] - ax;
      const dz = this.z[span + 1] - az;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 0
        ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSquared))
        : 0;
      const nx = x - (ax + dx * t);
      const nz = z - (az + dz * t);
      const reach = this.reach[span];
      if (nx * nx + nz * nz <= reach * reach) return true;
    }
    return false;
  }
}

/**
 * One track day on one circuit.
 *
 * Constructed once per level, like `ChallengeRun`, and `restart()` is the
 * quick-reset path: it keeps the session's best lap, because the thing a rider
 * does after spinning it into the gravel is press `R` and go again, and losing
 * the lap they set ten minutes ago would be the game punishing them twice.
 */
export class TrackDayRun {
  private readonly levelId: string;

  /**
   * The circuit's lines, in `routeIndex` order, the start/finish first.
   *
   * Sorted from a copy of what was handed in, for `ChallengeRun`'s reason: the
   * order is the entire mechanism by which an out-of-order crossing is
   * ignored, and a referee that trusted array order would silently invert the
   * circuit if a future producer ever emitted its gates unsorted.
   */
  private readonly lines: readonly Checkpoint[];

  private readonly envelope: LapEnvelope | null;
  private readonly available_: boolean;

  private reference: RouteReference | null = null;
  /** Whether the reference's splits describe this circuit's lines. */
  private referenceAligned = false;
  /**
   * The record that was standing when the session was armed.
   *
   * **Not `reference.totalSeconds`, and the difference is the whole reason this
   * field exists.** A lap that beats the record replaces the reference on the
   * spot, because the next lap should be measured against the one just set —
   * so by the time the session ends the reference *is* this afternoon's best,
   * and a results card reading it back would compare a record with itself and
   * print "0:03.05 against a best of 0:03.05" with no delta. `app/Game.ts`
   * takes the same precaution with the split table for the same reason, and
   * `challenge.ts` records the version of this bug that shipped.
   */
  private sessionPreviousBest: number | null = null;

  private phase_: LapPhase = 'idle';
  private lapNumber = 0;
  private elapsed = 0;
  private next = 0;
  private voided_: LapVoid | null = null;
  private onCourse_ = true;
  /**
   * True while the contact patch is inside the start/finish volume.
   *
   * **The latch is what stops one crossing being two.** The volume is 3.6 m
   * thick and a rider crossing it at walking pace is inside it for a second
   * and a half; without this, a lap would close, the next would open, and the
   * very next step would close *that* one at a lap time of one step. It is
   * cleared by leaving the volume rather than by a timer, so a rider who stops
   * dead on the line and rolls backwards and forwards across it still gets
   * exactly one lap out of it.
   */
  private insideStart = false;

  private readonly splits: number[] = [];
  private readonly legs: number[] = [];
  private lastSplit = 0;

  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  /** False until the first step, so a distance is never reported from (0,0,0). */
  private positioned = false;

  private lastLap: number | null = null;
  private bestLap: number | null = null;
  private bestLapSplits: readonly number[] = [];
  private bestLegs: number[] = [];
  private lapsCounted = 0;
  private lapsRidden = 0;

  private topSpeed = 0;
  private landings = 0;
  private cleanLandings = 0;
  private crashes = 0;
  /** Previous step's `crashed`, so a spill is counted once and not per step. */
  private wasCrashed = false;

  private ended: TrackDaySessionResult | null = null;

  constructor(levelId: string, checkpoints: readonly Checkpoint[], course: LapCourse | null) {
    this.levelId = levelId;
    this.lines = Object.freeze([...checkpoints].sort((a, b) => a.routeIndex - b.routeIndex));
    this.envelope = course === null ? null : new LapEnvelope(course);

    // **A circuit is a route that starts and never stops**, which is the exact
    // negative of `ChallengeRun.available`'s question — and stating it that way
    // rather than as "is this the track" is what keeps the mode's entrance free
    // of any branch on which level is loaded. The envelope is required too: a
    // lap the referee cannot judge is a lap it would have to count blind, and
    // counting a cut lap is worse than declining the venue.
    const count = this.lines.length;
    this.available_ = count >= 2
      && this.lines[0].kind === 'start'
      && this.lines[count - 1].kind !== 'finish'
      && this.envelope !== null;
    this.bestLegs = new Array<number>(count + 1).fill(Number.NaN);
    this.bestLegs[0] = 0;
  }

  /** Whether this level can be lapped at all. False on every point-to-point route. */
  get available(): boolean {
    return this.available_;
  }

  /** Lap length along the centreline, metres. Zero on a level with no lap. */
  get lapMetres(): number {
    return this.envelope === null ? 0 : this.envelope.length;
  }

  /** The session as a value. A fresh object per call, read once per drawn frame. */
  get state(): TrackDayState {
    const seeking = this.phase_ === 'outLap' || this.phase_ === 'running';
    const target = seeking ? this.lines[this.next % this.lines.length] : undefined;
    return {
      phase: this.phase_,
      lap: this.lapNumber,
      elapsed: this.elapsed,
      valid: this.voided_ === null,
      voided: this.voided_,
      onCourse: this.onCourse_,
      nextIndex: target ? target.routeIndex : -1,
      nextLabel: target ? target.label : '',
      distanceToNext: target && this.positioned
        ? Math.hypot(
          this.lastX - target.centre.x,
          this.lastY - target.centre.y,
          this.lastZ - target.centre.z,
        )
        : Infinity,
      crossed: this.splits.length,
      lines: this.lines.length,
      splits: this.splits,
      lastLapSeconds: this.lastLap,
      bestLapSeconds: this.bestLap,
      recordSeconds: this.reference === null ? null : this.reference.totalSeconds,
      lapsCounted: this.lapsCounted,
      lapsRidden: this.lapsRidden,
    };
  }

  /**
   * Point the session at the record to chase, or at nothing.
   *
   * Accepted at any phase, including mid-lap, and it is *called* mid-session:
   * a lap that becomes the new record replaces the reference immediately, so
   * the very next lap is measured against the time the player just set rather
   * than against the one they beat.
   */
  setReference(reference: RouteReference | null): void {
    if (reference === null || !Number.isFinite(reference.totalSeconds)) {
      this.reference = null;
      this.referenceAligned = false;
      return;
    }
    this.reference = reference;
    // The same invariant `app/records.ts:coerceSplits` enforces, restated here
    // because a reference also arrives live (a new best replaces it mid
    // session) and the two paths must agree. A lap's table is one longer than
    // the circuit has lines: both ends of the lap are in it.
    const splits = reference.splits;
    this.referenceAligned = splits.length === this.lines.length + 1
      && splits.every((value) => Number.isFinite(value))
      && splits.every((value, index) => index === 0 || value >= splits[index - 1])
      && splits[0] === 0
      && splits[splits.length - 1] === reference.totalSeconds;
  }

  /** Player chose Track Day. The clock does not start until the line. */
  arm(): void {
    if (!this.available_) return;
    this.clearSession();
    // Captured here rather than read at the end: this is the number the player
    // arrived with, and it is what "Best" on the results card means.
    this.sessionPreviousBest = this.reference === null ? null : this.reference.totalSeconds;
    this.phase_ = 'outLap';
  }

  /** Back to `idle`. Quitting to the title, or leaving the mode. */
  abandon(): void {
    this.clearSession();
    this.phase_ = 'idle';
  }

  /**
   * `R` during a session: back to the out lap, the lap in progress thrown away.
   *
   * **Throwing the lap away is the anti-exploit and not a courtesy.** The quick
   * reset puts the rider on the start line's own run-up, so a lap that kept its
   * clock would let a rider nine hundred metres in teleport to eighteen metres
   * short of the line and close it. Everything the session has earned survives
   * — the best lap, the sector bests, the count — because a spin is not a
   * reason to lose the afternoon.
   *
   * A no-op while `idle`, so free ride's own quick reset cannot start a session
   * nobody asked for.
   */
  restart(): void {
    if (this.phase_ === 'idle' || this.phase_ === 'ended') return;
    this.clearLap();
    this.lapNumber = 0;
    this.phase_ = 'outLap';
  }

  /**
   * The player pitted. Close the session and freeze what it was.
   *
   * **The lap in progress is discarded rather than timed to here**, which is
   * what pitting means: a lap you did not finish is not a lap. Returns the
   * result so the caller does not have to ask twice, and is idempotent so a
   * double-tap on End session cannot rebuild the card from a session that has
   * already been cleared.
   */
  end(): TrackDaySessionResult | null {
    if (this.phase_ === 'ended') return this.ended;
    if (this.phase_ !== 'outLap' && this.phase_ !== 'running') return null;

    const previousBest = this.sessionPreviousBest;
    const best = this.bestLap;
    let ideal: number | null = 0;
    for (let index = 1; index < this.bestLegs.length; index += 1) {
      if (!Number.isFinite(this.bestLegs[index])) { ideal = null; break; }
      ideal += this.bestLegs[index];
    }

    this.phase_ = 'ended';
    this.elapsed = 0;
    this.ended = Object.freeze({
      levelId: this.levelId,
      bestLapSeconds: best,
      bestLapSplits: Object.freeze([...this.bestLapSplits]),
      bestSectorLegs: Object.freeze([...this.bestLegs]),
      idealLapSeconds: ideal,
      // Both ends of the lap are the start/finish line, so its label is the
      // first and the last. Nothing here invents a word: every label on the
      // card is one `level/` authored (`AGENTS.md`, the screen owns the words).
      labels: Object.freeze([...this.lines.map((line) => line.label), this.lines[0].label]),
      lapsCounted: this.lapsCounted,
      lapsRidden: this.lapsRidden,
      topSpeed: this.topSpeed,
      landings: this.landings,
      cleanLandings: this.cleanLandings,
      crashes: this.crashes,
      // **Written in the identical algebraic form to `app/records.ts`'s
      // `isNewRecord`, not merely the same comparison.** `challenge.ts` records
      // at length why: the two were once written independently, disagreed at an
      // improvement of exactly the epsilon, and showed the player a new record
      // over a time the store then refused to save. `simulation/` may not
      // import `app/`, so the predicate is transcribed and must stay one.
      beatRecord: best !== null
        && (previousBest === null || best < previousBest - CHALLENGE.recordEpsilonSeconds),
      previousBest,
    });
    return this.ended;
  }

  /** The finished session, or null unless `phase === 'ended'`. */
  result(): TrackDaySessionResult | null {
    return this.ended;
  }

  /**
   * One fixed step.
   *
   * The clock advances **before** detection, for `challenge.ts`'s reason: the
   * position handed in is where the wheel ended this step, so crediting the
   * crossing with the time it took to get there is what makes a lap time the
   * time of the lap rather than the time of the lap minus one step.
   *
   * At most two crossings can be reported in one step — a sector and then the
   * line — and in practice never are: the closest two lines on the circuit are
   * three hundred metres apart and the wheel covers an eighth of a metre in a
   * step.
   */
  step(stepSeconds: number, input: TrackDayStepInput): readonly TrackDayEvent[] {
    this.lastX = input.x;
    this.lastY = input.y;
    this.lastZ = input.z;
    this.positioned = true;

    if (this.phase_ !== 'outLap' && this.phase_ !== 'running') return NO_EVENTS;

    const line = this.lines[0];
    const atLine = insideCheckpoint(line, input.x, input.y, input.z);

    if (this.phase_ === 'outLap') {
      // **Nothing is timed and nothing is counted here.** A rider who takes the
      // long way round to the line, or falls off on the way to it, is not on a
      // lap — and the envelope is not consulted either, because the pit lane of
      // a track day is by definition not the racing surface.
      this.onCourse_ = true;
      if (!atLine) { this.insideStart = false; return NO_EVENTS; }
      // Entering the volume from outside opens the first lap; sitting inside it
      // already does not, which is the case a reset onto the line produces.
      if (this.insideStart) return NO_EVENTS;
      this.insideStart = true;
      return [this.openLap(input.crashed, true)];
    }

    this.elapsed += stepSeconds;

    const magnitude = Math.abs(input.speed);
    if (magnitude > this.topSpeed) this.topSpeed = magnitude;

    if (input.landed) {
      this.landings += 1;
      if (input.landingClean) this.cleanLandings += 1;
    }

    // A crash is a state the rider stays in until they are back up, so the
    // count is of *transitions into* it. Counting the raw flag would report one
    // spill as two hundred crashes.
    if (input.crashed && !this.wasCrashed) this.crashes += 1;
    this.wasCrashed = input.crashed;

    // The envelope, once per step. `voided_` is sticky for the rest of the lap:
    // a rider who came back onto the circuit rode the part they missed on the
    // grass, and re-entering does not un-ride it.
    this.onCourse_ = this.envelope === null || this.envelope.contains(input.x, input.z);
    if (!this.onCourse_ && this.voided_ === null) this.voided_ = 'off-course';

    const events: TrackDayEvent[] = [];

    // The next sector line, if the lap still has one to find. Only the next one
    // is testable, which is what makes going around one worthless without a
    // word of anti-cheat logic anywhere.
    if (this.next < this.lines.length) {
      const target = this.lines[this.next];
      if (insideCheckpoint(target, input.x, input.y, input.z)) {
        events.push(this.cross(target, 'sector', this.elapsed));
      }
    }

    if (!atLine) {
      this.insideStart = false;
      return events.length === 0 ? NO_EVENTS : events;
    }
    if (this.insideStart) return events.length === 0 ? NO_EVENTS : events;
    this.insideStart = true;

    // **A lap that has crossed no sector line does not close; it starts
    // again.** The rider is at the line having been at the line, which happens
    // two ways and both want the same answer: rolling back over the line and
    // forward again — a rider lining themselves up — and the once-in-a-blue-moon
    // lap that went round the outside of *both* sector gates. Closing here
    // would mint a two-second lap on the counter for the first, and for the
    // second would leave the rider timing a lap and a half. Restarting the
    // clock is what a rider crossing the line expects to see anyway.
    if (this.next <= 1) {
      events.push(this.openLap(input.crashed, false));
      return events;
    }

    events.push(this.closeLap());
    events.push(this.openLap(input.crashed, true));
    return events;
  }

  /**
   * Open a lap at the line, or begin the one already open again.
   *
   * `advance` is the difference between a new lap and a restarted one, and it
   * is only ever false for the crossing described above: a lap that restarts
   * keeps its number, because from the rider's side it is still the lap they
   * were on.
   */
  private openLap(crashed: boolean, advance: boolean): TrackDayEvent {
    this.clearLap();
    this.phase_ = 'running';
    if (advance) this.lapNumber += 1;
    this.wasCrashed = crashed;
    this.splits.push(0);
    this.legs.push(0);
    this.next = 1;
    return {
      kind: 'open',
      checkpointId: this.lines[0].id,
      routeIndex: this.lines[0].routeIndex,
      label: this.lines[0].label,
      elapsed: 0,
      legSeconds: 0,
      legDelta: null,
      totalDelta: null,
      lap: null,
    };
  }

  /**
   * The line was crossed with a lap in progress: close it, judge it, open the
   * next one.
   *
   * This describes the lap that ended and changes nothing about what comes
   * next; `step` pairs it with an `open` immediately afterwards, because on a
   * circuit there is no moment between the two and a caller must not be able to
   * observe one.
   */
  private closeLap(): TrackDayEvent {
    const seconds = this.elapsed;
    // Every sector line found, in order, means `next` walked the whole array.
    if (this.voided_ === null && this.next < this.lines.length) this.voided_ = 'missed-sector';

    const legSeconds = seconds - this.lastSplit;
    const index = this.lines.length;
    this.splits.push(seconds);
    this.legs.push(legSeconds);

    let legDelta: number | null = null;
    let totalDelta: number | null = null;
    if (this.reference !== null && this.referenceAligned) {
      const splits = this.reference.splits;
      totalDelta = seconds - splits[index];
      legDelta = legSeconds - (splits[index] - splits[index - 1]);
    }

    const counted = this.voided_ === null;
    const beatRecord = counted
      && (this.reference === null
        || !Number.isFinite(this.reference.totalSeconds)
        || seconds < this.reference.totalSeconds - CHALLENGE.recordEpsilonSeconds);

    const lap: LapResult = Object.freeze({
      lap: this.lapNumber,
      seconds,
      splits: Object.freeze([...this.splits]),
      legs: Object.freeze([...this.legs]),
      counted,
      voided: this.voided_,
      beatRecord,
    });

    this.lapsRidden += 1;
    // **A void lap does not wipe the last good one.** The HUD shows this
    // permanently, and a rider who binned a lap should still be able to read
    // the one before it rather than watching the row go blank.
    if (counted) this.lastLap = seconds;
    if (counted) {
      this.lapsCounted += 1;
      // **Sector bests come only from counting laps.** A sector ridden
      // brilliantly on a lap that cut the next corner is a sector time nobody
      // could reproduce legally, and an ideal lap built from one is a target
      // that does not exist.
      for (let leg = 1; leg < this.legs.length; leg += 1) {
        const value = this.legs[leg];
        if (!Number.isFinite(this.bestLegs[leg]) || value < this.bestLegs[leg]) {
          this.bestLegs[leg] = value;
        }
      }
      if (this.bestLap === null || seconds < this.bestLap) {
        this.bestLap = seconds;
        this.bestLapSplits = lap.splits;
      }
    }

    const event: TrackDayEvent = {
      kind: 'lap',
      checkpointId: this.lines[0].id,
      routeIndex: this.lines[0].routeIndex,
      label: this.lines[0].label,
      elapsed: seconds,
      legSeconds,
      legDelta,
      totalDelta,
      lap,
    };

    return event;
  }

  /** Record a sector crossing and describe it. */
  private cross(line: Checkpoint, kind: 'sector' | 'lap', elapsed: number): TrackDayEvent {
    const index = this.next;
    const legSeconds = elapsed - this.lastSplit;

    this.splits.push(elapsed);
    this.legs.push(legSeconds);
    this.lastSplit = elapsed;
    this.next += 1;

    let legDelta: number | null = null;
    let totalDelta: number | null = null;
    if (this.reference !== null && this.referenceAligned) {
      const splits = this.reference.splits;
      totalDelta = elapsed - splits[index];
      legDelta = legSeconds - (splits[index] - splits[index - 1]);
    }

    return {
      kind,
      checkpointId: line.id,
      routeIndex: line.routeIndex,
      label: line.label,
      elapsed,
      legSeconds,
      legDelta,
      totalDelta,
      lap: null,
    };
  }

  /** Everything a new lap must not inherit. The session's own totals are not. */
  private clearLap(): void {
    this.elapsed = 0;
    this.next = 0;
    this.splits.length = 0;
    this.legs.length = 0;
    this.lastSplit = 0;
    this.voided_ = null;
    this.onCourse_ = true;
  }

  /** Everything a new session must not inherit. The reference is not one. */
  private clearSession(): void {
    this.clearLap();
    this.lapNumber = 0;
    this.insideStart = false;
    this.lastLap = null;
    this.bestLap = null;
    this.bestLapSplits = [];
    this.bestLegs = new Array<number>(this.lines.length + 1).fill(Number.NaN);
    this.bestLegs[0] = 0;
    this.lapsCounted = 0;
    this.lapsRidden = 0;
    this.topSpeed = 0;
    this.landings = 0;
    this.cleanLandings = 0;
    this.crashes = 0;
    this.wasCrashed = false;
    this.ended = null;
  }
}
