/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHALLENGE } from '../data/tuning.ts';
import type { Checkpoint, CheckpointKind } from '../level/plan.ts';

/**
 * The rules of a timed run — M10, and the whole of them.
 *
 * **This file is the referee and nothing else.** It is handed a position, a
 * speed, and three facts about the last step, once per fixed step, and it
 * answers with the events that produced. It draws nothing, saves nothing, and
 * knows nothing about a HUD, a results dialog, or `localStorage`; the ghost is
 * recorded beside it (`simulation/ghost.ts`) and the personal best is stored
 * above it (`app/records.ts`). That split is what lets every rule below be a
 * `node --test` assertion rather than something only a human with a stopwatch
 * can check, and it is why `RouteReference` exists as plain data: the run
 * compares itself against a *number*, not against a store.
 *
 * **The ride does not change while a run is active.** Nothing here reaches
 * `EucController` — a challenge is a state the application is in
 * (`docs/PLANS.md` §10), and a lap set in one session is comparable with one
 * set in another because the machine was identical in both.
 *
 * **Only the next expected checkpoint is testable, and that is the anti-cheat.**
 * A rider who cuts across the park and enters the finish gate early crosses
 * nothing, because the finish is not what the run is looking for. The
 * consequence is that no other module needs a word of anti-cheat logic, and the
 * consequence of *that* is that a wrong-order crossing is silent by
 * construction rather than by a rule someone has to remember: there is no code
 * path in which an out-of-order gate produces an event.
 *
 * **Detection is a point test on the contact patch, once per fixed step, and
 * the volume's thickness is what prevents tunnelling.** No swept test.
 * `CHALLENGE.gateHalfDepth` is sized against the furthest the wheel can travel
 * in one step with an order of magnitude to spare, and `challenge.test.ts`
 * walks a point across a gate at that step distance and at four times it, so
 * the margin is a tested property rather than a paragraph in the tuning table.
 *
 * Determinism is a hard requirement: the QA bridge's `advance(n)` must produce
 * the same run every time. There is no `Date`, no `Math.random`, and no wall
 * clock anywhere below — the clock is the accumulated fixed step handed in by
 * the caller.
 */

/**
 * Where a run is.
 *
 * Four explicit states rather than a pair of booleans (AGENTS.md, "represent
 * … challenges … as explicit states"). `armed` is the one that earns its keep:
 * the player has chosen the time trial but the clock has not started, because
 * the clock starts when the wheel crosses the start gate and not on a
 * countdown. A countdown you sit through on every retry is exactly the kind of
 * thing the owner's standing annoyance rule exists to forbid.
 */
export type RunPhase = 'idle' | 'armed' | 'running' | 'finished';

/**
 * One crossing, as it happened.
 *
 * Everything a HUD or a results screen could want about the moment is computed
 * here, once, rather than being recomputed by each consumer from `splits`. The
 * two deltas answer different questions and both are worth showing: `legDelta`
 * says whether the rider rode *this section* better than the record, which is
 * what tells them the last corner worked, and `totalDelta` says whether they
 * are ahead overall, which is what tells them the run is on.
 */
export interface ChallengeEvent {
  readonly kind: CheckpointKind;
  readonly checkpointId: string;
  readonly routeIndex: number;
  readonly label: string;
  /** Run seconds at the crossing. Zero at the start gate, by definition. */
  readonly elapsed: number;
  /** The leg just completed. Zero at the start gate — no leg preceded it. */
  readonly legSeconds: number;
  /** This leg versus the record's same leg. Null without a comparable record. */
  readonly legDelta: number | null;
  /** Elapsed here versus the record's elapsed here. Null without one. */
  readonly totalDelta: number | null;
}

/**
 * The run, as a value, for anything that draws.
 *
 * **`splits` and `legs` are indexed by route position, including the start.**
 * `splits[0]` is therefore always `0` and `legs[0]` is always `0`, which looks
 * like a wasted entry until the first time someone writes `splits[index - 1]`
 * and is off by one for every level whose start gate is not where they assumed.
 * `plan.ts` states the same reasoning about `CheckpointKind` — the shape that
 * cannot be misindexed beats the shape that is one element shorter. A results
 * screen that does not want a `0:00.00` row simply skips index 0, which it can
 * do because `labels[0]` tells it that row is the start.
 */
export interface ChallengeState {
  readonly phase: RunPhase;
  readonly elapsed: number;
  /** The `routeIndex` being sought. `-1` when the run is not seeking one. */
  readonly nextIndex: number;
  /** That checkpoint's player-facing label. Empty when there is none. */
  readonly nextLabel: string;
  /** Crossings so far, counting the start gate, out of `total`. */
  readonly passed: number;
  /** How many checkpoints the route has, counting the start and the finish. */
  readonly total: number;
  readonly splits: readonly number[];
  readonly legs: readonly number[];
  /**
   * Live delta versus the record, as of the last checkpoint. Null without one.
   *
   * Null at the start gate too, even with a record loaded: both runs are at
   * zero on the line, and a HUD that flashes `+0.00` at the moment the clock
   * starts is telling the player nothing while asking for their eyes.
   */
  readonly deltaToRecord: number | null;
  /**
   * Metres from the contact patch to the centre of the checkpoint being
   * sought. `Infinity` when there is none.
   *
   * **This exists because a missed gate would otherwise be invisible.** Only
   * the next checkpoint is testable, which is what stops a rider cutting the
   * course — but it also means a rider who goes around one is in a run that
   * cannot end, being told to reach a gate they are now two hundred metres
   * past, with nothing on screen admitting it. The alternative fixes were both
   * worse: auto-skipping destroys the split comparability that putting every
   * gate on shared ground exists to protect, and a "Missed: Park gate" scold
   * is a line of text that shouts at a player for exploring, which the owner's
   * standing rule rejects outright.
   *
   * A distance says the same thing without saying anything: it goes *up* when
   * the player is going the wrong way, and the gates are visible markers in
   * the world, so the pair reads as navigation rather than as a correction. It
   * also earns its place on a clean run, where "Park gate 340 m" is the route
   * knowledge the shortcut is supposed to reward.
   *
   * Straight-line, deliberately — distance along the route would need the plan
   * and would be a lie at the fork, where two legal paths have different
   * lengths.
   */
  readonly distanceToNext: number;
}

/**
 * One fixed step's worth of the world, from the caller's point of view.
 *
 * The position is the **contact patch**, not the rider's centre of mass: the
 * gate stands on the ground and the point that must pass through it is the one
 * touching the ground. `landed` is already an edge when it arrives — the
 * controller knows the touchdown frame and this file would only be guessing at
 * it — whereas `crashed` is a level, and is edge-detected below.
 */
export interface ChallengeStepInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Signed along the heading, m/s. Only its magnitude matters here. */
  readonly speed: number;
  /** True on the single step the wheel touched down. */
  readonly landed: boolean;
  /**
   * Whether that touchdown was a clean one. Only read when `landed`.
   *
   * **A verdict, not a number, and that is a correction worth recording.**
   * This was originally specified as a 0..1 score with a threshold applied
   * here, which was wrong twice over: `EucController.landingScore` runs from 0
   * to about 3 rather than 0 to 1, and on that scale a *higher* number is a
   * *worse* landing — the controller's own tiers read `score >= crashScore` for
   * a crash and everything below `heavyScore` as clean. A threshold written
   * here as `score >= 0.75` would therefore have counted almost every landing
   * as clean, including the ones that ended in a crash, and the results screen
   * would have congratulated the player in direct proportion to how badly they
   * had landed.
   *
   * The fix is not a corrected threshold; it is not having a second one at all.
   * `EucController` already decides what "clean" means, as part of deciding
   * what a landing physically costs, and a results screen that re-derived it
   * from a raw score would be free to disagree with the wheel the player just
   * felt. The caller passes the controller's verdict through.
   */
  readonly landingClean: boolean;
  /** True for every step the rider is down, not just the first. */
  readonly crashed: boolean;
}

/**
 * A finished run, frozen.
 *
 * **Scoring is pure elapsed time** (`docs/PLANS.md` §10). Top speed, landings,
 * clean landings, and crashes are on this object because the results screen
 * shows them and they are the story of the run — but not one of them moves the
 * number that decides the record. A landing bonus would make the fast line and
 * the pretty line different lines, and the game would then be about the pretty
 * one whether or not anybody chose that.
 */
export interface ChallengeResult {
  readonly levelId: string;
  readonly totalSeconds: number;
  /** Elapsed at each checkpoint, index-aligned with the route. `[0]` is `0`. */
  readonly splits: readonly number[];
  /** Duration of the leg arriving at each checkpoint. `[0]` is `0`. */
  readonly legs: readonly number[];
  /** Each checkpoint's label, index-aligned with `splits`. */
  readonly labels: readonly string[];
  readonly topSpeed: number;
  readonly landings: number;
  readonly cleanLandings: number;
  readonly crashes: number;
  readonly beatRecord: boolean;
  readonly previousBest: number | null;
}

/**
 * What a run compares itself against. Plain data — no storage, no app import.
 *
 * The options firewall (invariant 5) is not the only boundary this respects:
 * `app/records.ts` owns persistence and hostile-input coercion, and hands the
 * two numbers a referee needs down to it. This file therefore has nothing to
 * say about quota, JSON, or a hand-edited save.
 */
export interface RouteReference {
  readonly totalSeconds: number;
  /** Elapsed at each checkpoint of the recorded run, `[0] === 0`. */
  readonly splits: readonly number[];
}

/**
 * The empty result of a step that produced nothing.
 *
 * Shared and frozen because the overwhelmingly common case is "no event", 120
 * times a second for three minutes — a fresh `[]` per step is twenty thousand
 * dead arrays per lap for the collector to sweep, in the one loop in the game
 * that must not stutter.
 */
const NO_EVENTS: readonly ChallengeEvent[] = Object.freeze([]);

/**
 * Is this point inside the checkpoint's volume?
 *
 * **The yaw convention is copied from `simulation/planSampler.ts`, not
 * re-derived.** A `Checkpoint` box is yaw-aligned exactly as a `BoxCollider`
 * is, and the sampler already tests a point against one of those; a second
 * convention for the same shape in the same codebase is a bug that only shows
 * up as gates rotated ninety degrees, with a test written from the same
 * mistake agreeing with it. So the transform below is character-for-character
 * the sampler's: a yaw of `h` maps local +Z onto the world heading and local
 * +X onto the rider's left (+X is the rider's LEFT — AGENTS.md, world
 * conventions), and the inverse used here is that matrix's transpose.
 *
 * The consequence, spelled out because it is the thing that is easy to get
 * backwards: `halfExtents.x` is the gate's half-**width** across the route and
 * `halfExtents.z` is its half-**thickness** along the direction of travel.
 *
 * Bounds are inclusive, matching the sampler, so a point exactly on a face is
 * inside. Exported because `level/`'s tests check their authored gates against
 * the same predicate the simulation will use, which is the only way that check
 * proves anything.
 *
 * The two transcendentals are computed per call rather than cached: a run tests
 * exactly one checkpoint per fixed step (only the next one is testable), so
 * this is two `Math.cos`-class operations per step against a level's worth of
 * bookkeeping to avoid them. The sampler caches because it tests thirty boxes.
 */
export function insideCheckpoint(cp: Checkpoint, x: number, y: number, z: number): boolean {
  // Height first: it is the cheapest rejection and the one that is true most
  // often for a rider who is simply somewhere else in the level.
  if (Math.abs(y - cp.centre.y) > cp.halfExtents.y) return false;

  const dx = x - cp.centre.x;
  const dz = z - cp.centre.z;
  const cos = Math.cos(cp.headingY);
  const sin = Math.sin(cp.headingY);
  const localX = cos * dx - sin * dz;
  if (Math.abs(localX) > cp.halfExtents.x) return false;
  const localZ = sin * dx + cos * dz;
  return Math.abs(localZ) <= cp.halfExtents.z;
}

/**
 * One timed run over one level's checkpoints.
 *
 * Constructed once per level rather than once per attempt: `restart()` is the
 * retry path and it keeps the reference, because the thing a player does after
 * a bad lap is press `R` and immediately want to know whether they are up on
 * the record again.
 */
export class ChallengeRun {
  private readonly levelId: string;

  /**
   * The route, in `routeIndex` order.
   *
   * Sorted from a copy of what was handed in. `level/buildPlan.ts` already
   * asserts its authored order, so this normally changes nothing — but the
   * order is the entire mechanism by which out-of-order crossings are ignored,
   * and a referee that trusted array order would silently invert the course if
   * a future producer (the M12 generator) ever emitted its gates unsorted.
   */
  private readonly checkpoints: readonly Checkpoint[];

  private readonly available_: boolean;

  private reference: RouteReference | null = null;
  /**
   * Whether the reference's splits line up with this route's checkpoints.
   *
   * A record set before a gate was moved, added, or removed still holds a
   * meaningful total — it is a lap of this level — but its split table
   * describes a different set of places. Comparing leg by leg against it would
   * produce deltas that are pure fiction, so split comparison switches off and
   * the total survives. Losing the deltas is a much smaller failure than
   * telling the player they are eight seconds up when they are not.
   */
  private referenceAligned = false;

  private phase_: RunPhase = 'idle';
  private elapsed = 0;
  private next = 0;

  private readonly splits: number[] = [];
  private readonly legs: number[] = [];
  private lastSplit = 0;
  private deltaToRecord: number | null = null;

  /**
   * Where the wheel was on the most recent step, for `distanceToNext`.
   *
   * Held rather than passed into `state` because `state` is read from the
   * render frame, which does not have a step's input and must not be handed a
   * position that disagrees with the one detection used. Three numbers rather
   * than a vector object, for the same reason the rest of this file avoids
   * allocation in the step path.
   */
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  /** False until the first step, so a distance is never reported from (0,0,0). */
  private positioned = false;

  private topSpeed = 0;
  private landings = 0;
  private cleanLandings = 0;
  private crashes = 0;
  /** Previous step's `crashed`, so a crash is counted once and not per step. */
  private wasCrashed = false;

  /**
   * Built once when the finish is crossed and handed out unchanged after that.
   *
   * The results screen and the record store both read it, and a run that is
   * over cannot change, so rebuilding it per call would be allocation in
   * exchange for the chance of the two of them disagreeing.
   */
  private finished: ChallengeResult | null = null;

  constructor(levelId: string, checkpoints: readonly Checkpoint[]) {
    this.levelId = levelId;
    this.checkpoints = Object.freeze(
      [...checkpoints].sort((a, b) => a.routeIndex - b.routeIndex),
    );
    // **A level is timeable only if it can start and stop.** Stated as a
    // property of the route's ends rather than as "contains a start somewhere",
    // because a plan whose finish sits in the middle of the order is not a
    // course with an odd gate — it is a course whose clock would stop halfway
    // and leave the rider gated on a checkpoint they can never reach. The
    // proving ground carries no checkpoints at all and lands here as `false`,
    // which is how the title screen knows not to offer it a time trial.
    const count = this.checkpoints.length;
    this.available_ = count >= 2
      && this.checkpoints[0].kind === 'start'
      && this.checkpoints[count - 1].kind === 'finish';
  }

  /** Whether this level can be timed at all. False with no start or no finish. */
  get available(): boolean {
    return this.available_;
  }

  /**
   * The run as a value.
   *
   * A fresh object per call, read once per drawn frame, on the same terms
   * `ui/hudModel.ts` argues for its own view object: it is a small plain value
   * the DOM layer diffs against what it last wrote, and sixty of them a second
   * costs nothing next to what it replaces. `splits` and `legs` are exposed as
   * the live arrays rather than copies — they are `readonly number[]` to every
   * consumer, they grow six times in three minutes, and copying two arrays per
   * frame to defend against a cast nobody is writing would be the expensive
   * half of this method.
   */
  get state(): ChallengeState {
    const seeking = this.phase_ === 'armed' || this.phase_ === 'running';
    const target = seeking ? this.checkpoints[this.next] : undefined;
    return {
      phase: this.phase_,
      elapsed: this.elapsed,
      nextIndex: target ? target.routeIndex : -1,
      nextLabel: target ? target.label : '',
      passed: this.splits.length,
      total: this.checkpoints.length,
      splits: this.splits,
      legs: this.legs,
      deltaToRecord: this.deltaToRecord,
      distanceToNext: target && this.positioned
        ? Math.hypot(
          this.lastX - target.centre.x,
          this.lastY - target.centre.y,
          this.lastZ - target.centre.z,
        )
        : Infinity,
    };
  }

  /**
   * Point the run at a record to compare against, or at nothing.
   *
   * Accepted at any phase, including mid-run: the app loads the record when the
   * challenge starts, and a run whose record is cleared from the settings
   * screen should stop showing deltas rather than keep comparing against a time
   * that no longer exists.
   */
  setReference(reference: RouteReference | null): void {
    // A reference whose total is not a real number is not a reference. It can
    // only arrive that way through a save file, and `app/records.ts` already
    // treats those as hostile — this is the cheap second gate that keeps a NaN
    // from turning every delta on the HUD into `NaN` if one ever slips.
    if (reference === null || !Number.isFinite(reference.totalSeconds)) {
      this.reference = null;
      this.referenceAligned = false;
      this.deltaToRecord = null;
      return;
    }
    this.reference = reference;
    // The same invariant `app/records.ts:coerceSplits` enforces on a saved
    // table, restated here because a reference can also arrive live (a retry
    // reuses the previous run's result) and the two paths must agree: index
    // zero is the start gate at exactly zero, the last split is the finish
    // crossing and therefore exactly the total, and the sequence never runs
    // backwards. A table that fails any of these produces leg deltas that are
    // confidently wrong, which is worse than showing none.
    const splits = reference.splits;
    this.referenceAligned = splits.length === this.checkpoints.length
      && splits.every((value) => Number.isFinite(value))
      && splits.every((value, index) => index === 0 || value >= splits[index - 1])
      && splits[0] === 0
      && splits[splits.length - 1] === reference.totalSeconds;
    if (!this.referenceAligned) this.deltaToRecord = null;
  }

  /**
   * Player chose the time trial. The clock does not start until the start gate.
   *
   * A no-op on a level with no route, so the caller cannot arm a run that can
   * never finish. `available` is the question to ask before offering the mode;
   * this is the backstop that keeps a mistake in that check from stranding the
   * player in a timed state with no way to stop the clock.
   */
  arm(): void {
    if (!this.available_) return;
    this.clear();
    this.phase_ = 'armed';
  }

  /** Back to `idle`. Quitting to the title, or leaving the challenge. */
  abandon(): void {
    this.clear();
    this.phase_ = 'idle';
  }

  /**
   * `R` during a run: back to `armed`, clock zeroed, nothing kept.
   *
   * **This is also the anti-exploit**, and it is the reason quick reset is not
   * simply left alone during a challenge. The slice's route is a loop that
   * closes back into the plaza, so the reset spawn is a short roll from the
   * finish; a reset that kept the clock running would teleport a rider who is
   * two minutes in to within seconds of the line. Zeroing costs the player a
   * lap they were probably abandoning anyway and closes that hole completely.
   *
   * The reference survives, because the next thing that happens is another
   * attempt at the same record.
   *
   * A no-op while `idle`, so that free ride's own quick reset — the same `R`,
   * pressed by a player who never entered the time trial — cannot arm a run
   * nobody asked for.
   */
  restart(): void {
    if (this.phase_ === 'idle') return;
    this.clear();
    this.phase_ = 'armed';
  }

  /**
   * One fixed step.
   *
   * The clock advances **before** detection, because the position handed in is
   * where the wheel ended this step: crediting the crossing with the time it
   * took to get there is what makes a finish time the time of the lap rather
   * than the time of the lap minus one step.
   *
   * At most one crossing is reported per step, and that is not a limitation
   * worth removing — the closest two gates on the slice are tens of metres
   * apart and the wheel covers an eighth of a metre in a step.
   */
  step(stepSeconds: number, input: ChallengeStepInput): readonly ChallengeEvent[] {
    // Recorded for every phase that seeks a gate, including `armed` — a player
    // who has chosen the time trial and is riding *away* from the start line
    // needs the distance most of all, because nothing has begun and no other
    // cue exists to tell them so.
    this.lastX = input.x;
    this.lastY = input.y;
    this.lastZ = input.z;
    this.positioned = true;

    if (this.phase_ === 'armed') {
      // **The clock does not run here.** The player rolls out of the plaza
      // toward the line at whatever pace they like, and none of it is timed.
      // No statistics accumulate either: a crash on the way to the start is not
      // part of the run that has not begun.
      const start = this.checkpoints[this.next];
      if (!insideCheckpoint(start, input.x, input.y, input.z)) return NO_EVENTS;
      this.phase_ = 'running';
      this.elapsed = 0;
      this.wasCrashed = input.crashed;
      return [this.cross(start, 0)];
    }

    if (this.phase_ !== 'running') return NO_EVENTS;

    this.elapsed += stepSeconds;

    const magnitude = Math.abs(input.speed);
    if (magnitude > this.topSpeed) this.topSpeed = magnitude;

    if (input.landed) {
      this.landings += 1;
      if (input.landingClean) this.cleanLandings += 1;
    }

    // A crash is a state the rider stays in for as long as it takes to get
    // back up, so the count is of *transitions into* it. Counting the raw flag
    // would report a single spill as two hundred crashes.
    if (input.crashed && !this.wasCrashed) this.crashes += 1;
    this.wasCrashed = input.crashed;

    const target = this.checkpoints[this.next];
    if (!insideCheckpoint(target, input.x, input.y, input.z)) return NO_EVENTS;

    const event = this.cross(target, this.elapsed);
    if (target.kind === 'finish') this.finish();
    return [event];
  }

  /** The finished run, or null unless `phase === 'finished'`. */
  result(): ChallengeResult | null {
    return this.finished;
  }

  /**
   * Record a crossing and describe it.
   *
   * The single place a split is written, which is why the deltas are computed
   * here rather than by each caller: `state.deltaToRecord` and the event's
   * `totalDelta` are the same number by construction, and cannot drift into
   * being the same number by coincidence.
   */
  private cross(cp: Checkpoint, elapsed: number): ChallengeEvent {
    const index = this.next;
    const legSeconds = index === 0 ? 0 : elapsed - this.lastSplit;

    this.splits.push(elapsed);
    this.legs.push(legSeconds);
    this.lastSplit = elapsed;
    this.next += 1;

    let legDelta: number | null = null;
    let totalDelta: number | null = null;
    // Index 0 is the start line, where both runs are at zero by definition.
    // A delta there is arithmetically correct and informationally empty, and
    // the HUD would spend the first seconds of the run displaying it.
    if (index > 0 && this.reference !== null && this.referenceAligned) {
      const splits = this.reference.splits;
      totalDelta = elapsed - splits[index];
      legDelta = legSeconds - (splits[index] - splits[index - 1]);
      this.deltaToRecord = totalDelta;
    }

    return {
      kind: cp.kind,
      checkpointId: cp.id,
      routeIndex: cp.routeIndex,
      label: cp.label,
      elapsed,
      legSeconds,
      legDelta,
      totalDelta,
    };
  }

  /** Close the run and freeze what it was. */
  private finish(): void {
    this.phase_ = 'finished';
    const previousBest = this.reference !== null ? this.reference.totalSeconds : null;
    this.finished = Object.freeze({
      levelId: this.levelId,
      totalSeconds: this.elapsed,
      splits: Object.freeze([...this.splits]),
      legs: Object.freeze([...this.legs]),
      labels: Object.freeze(this.checkpoints.map((cp) => cp.label)),
      topSpeed: this.topSpeed,
      landings: this.landings,
      cleanLandings: this.cleanLandings,
      crashes: this.crashes,
      // **A tie is not a record, and this predicate is shared law.**
      // `app/records.ts:submit` decides what is *kept* using the same epsilon
      // from the same constant, and the two must agree exactly or the results
      // screen celebrates a record the store then quietly refuses to save.
      // First run beats nothing and is therefore always a record.
      // **Written in the identical algebraic form to
      // `app/records.ts:isNewRecord`, not merely the same comparison.**
      // These two predicates were written independently and disagreed at
      // precisely one input — an improvement of exactly the epsilon — where
      // this file said "record" and the store said "not a record". The player
      // would have seen *New record* over a time that was then silently not
      // saved, which reads as the game losing their run and is the worst
      // failure this feature has. The store owns the definition because the
      // store is what the next session actually finds; this file follows it,
      // and the layer boundary is why the predicate is duplicated rather than
      // imported (`simulation/` may not reach `app/`).
      //
      // Fixing the comparison direction alone was **not** enough, and the
      // cross-layer test in `app/records.test.ts` caught the rest immediately:
      // `previousBest - elapsed > epsilon` and `elapsed < previousBest -
      // epsilon` are the same statement in algebra and different statements in
      // floating point. Subtracting the epsilon from the record rounds
      // differently from subtracting the elapsed time from the record, so the
      // two forms disagreed on the very input the direction fix was meant to
      // settle. The expression below is a character-for-character transcription
      // of `isNewRecord`'s, and it has to stay one.
      //
      // The composition root additionally takes the results heading from what
      // `submit()` returned rather than from this flag, so a future drift here
      // costs a wrong `ChallengeResult` field and never a wrong celebration.
      beatRecord: previousBest === null
        || this.elapsed < previousBest - CHALLENGE.recordEpsilonSeconds,
      previousBest,
    });
  }

  /** Everything a new attempt must not inherit. The reference is not one. */
  private clear(): void {
    this.elapsed = 0;
    this.next = 0;
    this.splits.length = 0;
    this.legs.length = 0;
    this.lastSplit = 0;
    this.deltaToRecord = null;
    this.topSpeed = 0;
    this.landings = 0;
    this.cleanLandings = 0;
    this.crashes = 0;
    this.wasCrashed = false;
    this.finished = null;
  }
}
