/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { RACE } from '../data/tuning.ts';
import type { Checkpoint, LapCourse } from '../level/plan.ts';
import { insideCheckpoint } from './challenge.ts';
import { LapEnvelope } from './trackDay.ts';

/**
 * The race referee — M27 Phase 2 (`docs/PLANS.md` §27.3–§27.4).
 *
 * `trackDay.ts`'s and `knockaboutMatch.ts`'s third sibling, on the terms
 * `AGENTS.md` states once: **a mode's referee is its own file, and `Game`
 * picks it by seat count.** Pure arithmetic, a step signature, node-testable,
 * no `three` and no DOM. A solo Track Day still steps `TrackDayRun`; a
 * multi-seat one steps this.
 *
 * **What it takes from each sibling, and what it refuses to take.**
 *
 * From `TrackDayRun`, the lap rules verbatim (§23.15, restated by §27.3): the
 * line always ends the lap, a lap that reached no sector line restarts instead
 * of closing, the verge is inside the legal envelope, and there is no minimum
 * lap time. They are not re-derived here — they are the same rules, applied
 * per rider against the same `LapEnvelope`, because a lap must mean one thing
 * whether one person or four are riding it.
 *
 * From `KnockaboutMatch`, the **record/decide split** (q86): facts are
 * recorded as the seats step, the outcome is decided after every seat has
 * stepped, and a shared top is a **draw** rather than a tie-break somebody
 * invented. Two riders closing their final lap on one fixed step share the
 * position, and the card says so.
 *
 * What it refuses to take is a *flag through* either of them. `TrackDayRun`
 * stays solo-shaped on purpose — one rider, one reference, `arm()`
 * snapshotting the record the card compares against — and a race has no
 * records at all (q92), no ghost (q93), and a clock that starts for the whole
 * room at once rather than at each rider's own line crossing.
 *
 * **One shared clock, per-rider laps.** The race clock runs from GO for
 * everybody; each rider's lap timing is arithmetic on that one clock, so
 * `advance(n)` reproduces a whole race byte for byte and two riders' times are
 * always directly comparable. No `Date`, no `Math.random`, no wall clock.
 */

/** Where a race is in its life. Everything downstream gates on this. */
export type RacePhase = 'idle' | 'countdown' | 'running' | 'ended';

/**
 * Why a rider's current lap cannot count.
 *
 * `trackDay.ts`'s two, plus the one a race adds. **A reset is its own kind
 * rather than borrowed from `off-course`**, because the two are answered
 * differently by the card and by the player: running wide through a hole in
 * the barrier is a mistake, and pressing `R` is a decision. Both cost the lap.
 *
 * `missed-sector` is assigned at the line, exactly where `TrackDayRun.closeLap`
 * assigns it: a lap that found *some* gates but not all of them. The 2026-08-31
 * QA pass caught this referee declaring the kind and never writing it, which
 * let a rider who doubled back to the line re-bank a lap a few dozen metres
 * long — on the circuit, past no gate, and counted.
 */
export type RaceVoid = 'missed-sector' | 'off-course' | 'reset';

/** Something worth a cue, a lane update or a card. Facts, never sentences. */
export interface RaceEvent {
  readonly kind: 'count' | 'go' | 'lap' | 'finish';
  /** Which seat, or -1 for the room's own events (`count`, `go`). */
  readonly seat: number;
  /** The number a countdown is showing, or the lap that just closed. */
  readonly value: number;
  /** The race clock when it happened. Zero for everything before GO. */
  readonly seconds: number;
}

/** One rider's standing, recomputed after every seat has stepped. */
export interface RaceRider {
  readonly seat: number;
  /** The lap being ridden, 1-based. Zero until the rider's first line. */
  readonly lap: number;
  /** Laps that counted. A cut lap is ridden and not counted (see `step`). */
  readonly lapsCompleted: number;
  readonly lastLapSeconds: number | null;
  readonly bestLapSeconds: number | null;
  readonly finished: boolean;
  /** The race clock when they crossed for the last time, or null. */
  readonly finishSeconds: number | null;
  /** 1-based, and **shared** when two riders are level (q86's draw shape). */
  readonly position: number;
  /**
   * Seconds behind the leader's finish, or null while nobody has finished.
   *
   * **Live for a rider still out**: once the leader is home this counts up,
   * and the rider's own crossing freezes it at exactly the number it was
   * showing — which is what lets the HUD's gap row be continuous rather than
   * blank until the very moment it stops mattering (QA repair, 2026-08-31).
   */
  readonly gapSeconds: number | null;
  /** Laps and metres, folded into one number so standings can sort on it. */
  readonly progressMetres: number;
  readonly onCourse: boolean;
  readonly voided: RaceVoid | null;
}

export interface RaceState {
  readonly phase: RacePhase;
  readonly laps: number;
  /** Seconds left of the countdown; zero in every other phase. */
  readonly countdown: number;
  /** The shared race clock, from GO. */
  readonly elapsed: number;
  readonly riders: readonly RaceRider[];
  readonly leaderFinished: boolean;
  /** The seat that won, null for a draw *or* for a race still running. */
  readonly winner: number | null;
}

/** What one seat did this step. Positions, not verdicts. */
export interface RaceRiderInput {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** True on any step this seat teleported — §27.3's `R`, and the void. */
  readonly reset: boolean;
}

/** The card. Nothing here is stored anywhere (q92); it is read once. */
export interface RaceFinish {
  readonly seat: number;
  readonly position: number;
  readonly finished: boolean;
  readonly seconds: number | null;
  readonly gapSeconds: number | null;
  readonly bestLapSeconds: number | null;
  readonly lapsCompleted: number;
}

export interface RaceResult {
  readonly laps: number;
  readonly seconds: number;
  readonly winner: number | null;
  readonly order: readonly RaceFinish[];
}

const NO_EVENTS: readonly RaceEvent[] = Object.freeze([]);
const NO_RIDERS: readonly RaceRider[] = Object.freeze([]);

/**
 * One rider's book. Everything per-seat lives here so the referee's own
 * fields are only ever about the room.
 */
interface RiderBook {
  lap: number;
  lapsCompleted: number;
  lapStart: number;
  next: number;
  insideStart: boolean;
  voided: RaceVoid | null;
  onCourse: boolean;
  lastLap: number | null;
  bestLap: number | null;
  finished: boolean;
  finishSeconds: number | null;
  progress: number;
  position: number;
  /** True while the step being resolved saw this rider cross the start line. */
  crossedLine: boolean;
}

export class RaceRun {
  /** F4-tunable, and pushed by `Game.applyTuning` exactly as the match's are. */
  laps: number = RACE.laps;
  countdownSeconds: number = RACE.countdownSeconds;
  finishGraceSeconds: number = RACE.finishGraceSeconds;

  private readonly lines: readonly Checkpoint[];
  private readonly envelope: LapEnvelope | null;
  /**
   * How far along the envelope's walk the start line sits.
   *
   * The walk begins at the ring's own first sample, and on BelVar the line is
   * about 68 m further on — so raw `progressAt` is distance from an authoring
   * accident rather than from the lap. Measured once here and subtracted in
   * `writeProgress`, or every rider's progress would drop by a whole lap for
   * the stretch between the ring's seam and the line, inverting the standings
   * once per lap (QA repair, 2026-08-31).
   */
  private readonly lineOffset: number;
  private readonly available_: boolean;

  private phaseValue: RacePhase = 'idle';
  private countdownRemaining = 0;
  private countdownShown = -1;
  private elapsedSeconds = 0;
  private leaderFinishedAt: number | null = null;
  private winnerSeat: number | null = null;
  private readonly riders: RiderBook[] = [];
  private ended: RaceResult | null = null;

  /**
   * Built once per level beside `TrackDayRun`, and refusing the same worlds.
   *
   * A race needs a lap, which is `LevelPlan.lap` — emitted only where a
   * producer closes a circuit (§27.9: teaching the generator to author laps is
   * its own milestone). The checkpoint list is sorted rather than trusted, for
   * `TrackDayRun`'s reason: array order is a producer's business.
   */
  constructor(checkpoints: readonly Checkpoint[], course: LapCourse | null) {
    this.lines = Object.freeze([...checkpoints].sort((a, b) => a.routeIndex - b.routeIndex));
    this.envelope = course === null ? null : new LapEnvelope(course);
    const count = this.lines.length;
    this.lineOffset = this.envelope === null || count === 0
      ? 0
      : this.envelope.progressAt(this.lines[0].centre.x, this.lines[0].centre.z);
    this.available_ = count >= 2
      && this.lines[0].kind === 'start'
      && this.lines[count - 1].kind !== 'finish'
      && this.envelope !== null;
  }

  get available(): boolean {
    return this.available_;
  }

  get lapMetres(): number {
    return this.envelope === null ? 0 : this.envelope.length;
  }

  get state(): RaceState {
    return {
      phase: this.phaseValue,
      laps: this.laps,
      countdown: this.phaseValue === 'countdown' ? this.countdownRemaining : 0,
      elapsed: this.elapsedSeconds,
      riders: this.phaseValue === 'idle' ? NO_RIDERS : this.standings(),
      leaderFinished: this.leaderFinishedAt !== null,
      winner: this.winnerSeat,
    };
  }

  /**
   * Start a race for `seats` riders, held on the grid until the countdown
   * releases them.
   *
   * The seat count is handed in rather than assumed — `KnockaboutMatch.arm`'s
   * rule, and the reason a race was born N-way rather than re-walked when the
   * couch widened. Two is the minimum: one rider on a circuit is a Track Day,
   * and this file has no opinion about that mode.
   *
   * **The countdown always runs, even at zero.** `RACE.countdownSeconds = 0`
   * is an instant start rather than a different code path: the first step
   * emits `go` and the race is running. One shape means the tunable is
   * testable by moving it, which is the whole of M26's lesson about a knob
   * nobody varied.
   */
  arm(seats: number): void {
    this.clear();
    if (!this.available_) return;
    if (!(seats >= 2)) return;
    for (let seat = 0; seat < seats; seat += 1) this.riders.push(freshBook());
    this.phaseValue = 'countdown';
    this.countdownRemaining = Math.max(0, this.countdownSeconds);
    this.countdownShown = -1;
  }

  /** Forget the race. The mode switch's exit, and `KnockaboutMatch`'s. */
  abandon(): void {
    this.clear();
  }

  /**
   * One fixed step of the whole room — **called once, after every seat has
   * stepped**, and never inside the seat loop.
   *
   * M23's rule, restated by §27.3 and paid for twice already: a fact about
   * more than one rider cannot honestly be resolved until all of them have
   * moved, or the answer depends on loop order. Here that fact is the
   * standings, and the specific defect it prevents is two riders closing their
   * final lap on one step giving the win to whichever seat was visited first.
   * So the crossings are **recorded** as the seats are walked below and the
   * outcome is **decided** afterwards, in `decide`.
   *
   * `inputs` is index-for-index with the seats this race was armed for. A
   * shorter list leaves the missing riders untouched rather than throwing:
   * the caller is a fixed-step loop and a race is not worth a crash.
   */
  step(stepSeconds: number, inputs: readonly RaceRiderInput[]): readonly RaceEvent[] {
    if (this.phaseValue === 'idle' || this.phaseValue === 'ended') return NO_EVENTS;
    const events: RaceEvent[] = [];

    if (this.phaseValue === 'countdown') {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - Math.max(0, stepSeconds));
      // The number on screen is the ceiling of what is left, so "3" is shown
      // for the whole of the third second and "GO" replaces "1" rather than
      // following a silent zero.
      const shown = Math.ceil(this.countdownRemaining);
      if (shown > 0 && shown !== this.countdownShown) {
        this.countdownShown = shown;
        events.push({ kind: 'count', seat: -1, value: shown, seconds: 0 });
      }
      if (this.countdownRemaining > 0) return events.length === 0 ? NO_EVENTS : events;

      this.phaseValue = 'running';
      this.countdownShown = 0;
      // **Everybody is on lap 1 at GO, and nobody has crossed anything.** The
      // grid is behind the line, so the first crossing comes a moment later
      // with no sector found — and the no-sector rule turns that into a
      // *restart*, which is exactly the out-lap a standing start needs. The
      // rule was already right; a race does not get its own version of it.
      for (const book of this.riders) {
        book.lap = 1;
        book.lapStart = 0;
        book.next = 1;
        book.insideStart = false;
        book.voided = null;
      }
      events.push({ kind: 'go', seat: -1, value: 0, seconds: 0 });
      return events;
    }

    this.elapsedSeconds += Math.max(0, stepSeconds);
    for (const book of this.riders) book.crossedLine = false;
    for (let seat = 0; seat < this.riders.length; seat += 1) {
      const input = inputs[seat];
      if (input === undefined) continue;
      this.recordRider(seat, input, events);
    }
    const hadLeader = this.leaderFinishedAt !== null;
    this.decide();

    // **The flag reaches a rider who crossed on the leader's own step** —
    // QA repair, 2026-08-31. `leaderFinishedAt` is written by `decide`, after
    // every seat has recorded, so a trailer whose line crossing shared the
    // leader's step was recorded *before* the race knew it had a leader — and
    // without this sweep they would open another lap and ride a whole extra
    // one before the finish branch could see them, while a zero-grace race
    // sat running. The rule stays q89's, just made true of the simultaneous
    // case too: once the leader has finished, the line is the flag.
    if (!hadLeader && this.leaderFinishedAt !== null) {
      let flagged = false;
      for (let seat = 0; seat < this.riders.length; seat += 1) {
        const book = this.riders[seat];
        if (!book.crossedLine || book.finished) continue;
        book.finished = true;
        book.finishSeconds = this.elapsedSeconds;
        events.push({ kind: 'finish', seat, value: book.lapsCompleted, seconds: this.elapsedSeconds });
        flagged = true;
      }
      // The sweep changed who is finished, so the standings — and possibly
      // the race itself — have to be decided again from the books as they now
      // stand. `decide` is written to be re-entered: it recomputes positions
      // from scratch and the winner latch only fires once.
      if (flagged) this.decide();
    }
    return events.length === 0 ? NO_EVENTS : events;
  }

  /** The card, once the race has ended. Frozen; a later race cannot rewrite it. */
  result(): RaceResult | null {
    return this.ended;
  }

  /**
   * One rider's crossings, recorded. **Decides nothing** — not who is winning,
   * not whether the race is over, not even whether this rider has won.
   *
   * Every lap rule here is `trackDay.ts`'s, applied to one book:
   *
   *   - the envelope is consulted once a step and `voided` is **sticky** for
   *     the rest of the lap, because a rider who came back onto the circuit
   *     rode the part they missed on the grass;
   *   - only the *next* sector line is testable, which is what makes cutting
   *     the course worthless without a word of anti-cheat logic anywhere;
   *   - the line always ends the lap, and a lap that reached no sector line
   *     **restarts** rather than closing.
   *
   * The one rule a race adds is that a voided lap **does not count toward the
   * distance**. In a Track Day a cut lap is ridden and not recorded, which
   * costs a time; in a race, letting it count would make cutting the course
   * the fastest way round — the anti-cheat that was free for a clock has to be
   * spent for a distance.
   */
  private recordRider(seat: number, input: RaceRiderInput, events: RaceEvent[]): void {
    const book = this.riders[seat];
    // A finished rider keeps riding under a banner (q97) and is timed by
    // nothing: their clock stopped at the line and their position is locked.
    if (book.finished) return;

    // **`R` costs the lap, and that is the whole of its punishment** (§27.3,
    // closing §21.10 q43 for the couch). The reset teleports to the level
    // spawn; the no-sector rule does the rest, because a rider who reappears
    // mid-circuit will cross the line with sectors missing.
    if (input.reset) {
      book.voided = 'reset';
      // The latch is about a volume this rider is no longer in.
      book.insideStart = false;
    }

    book.onCourse = this.envelope === null || this.envelope.contains(input.x, input.z);
    if (!book.onCourse && book.voided === null) book.voided = 'off-course';
    this.writeProgress(book, input.x, input.z);

    if (book.next < this.lines.length) {
      const target = this.lines[book.next];
      if (insideCheckpoint(target, input.x, input.y, input.z)) book.next += 1;
    }

    const line = this.lines[0];
    if (!insideCheckpoint(line, input.x, input.y, input.z)) {
      book.insideStart = false;
      return;
    }
    if (book.insideStart) return;
    book.insideStart = true;

    book.crossedLine = true;
    if (book.next <= 1 && this.leaderFinishedAt === null) {
      // The standing start's out-lap, and the rider lining themselves up, and
      // the once-in-a-blue-moon lap that went round the outside of both
      // sector gates. One rule, three cases, none of them a closed lap.
      this.openLap(book, false);
      return;
    }

    // Every sector line found, in order, means `next` walked the whole array —
    // `TrackDayRun.closeLap`'s own test, applied before anything is banked.
    // The no-sector restart above catches a lap that found *nothing*; this
    // catches the lap that found some gates and skipped others, which on this
    // circuit includes a rider who doubles back to the line. Declared and
    // never assigned until the 2026-08-31 QA pass caught it.
    if (book.voided === null && book.next > 1 && book.next < this.lines.length) {
      book.voided = 'missed-sector';
    }

    const seconds = this.elapsedSeconds - book.lapStart;
    if (book.voided === null && book.next > 1) {
      book.lapsCompleted += 1;
      book.lastLap = seconds;
      if (book.bestLap === null || seconds < book.bestLap) book.bestLap = seconds;
      events.push({ kind: 'lap', seat, value: book.lapsCompleted, seconds });
    }

    // **The leader's finish ends the race; everybody else finishes at their
    // next line crossing** (q89) — the lap they are on ends at the line
    // whatever kind of lap it was. A crossing off a *voided* lap still ends
    // their race: the void's whole punishment is that the lap did not count,
    // and `compareBooks` classifies on laps that counted before it looks at
    // anything else — never at the flag — so the resetter is behind everybody
    // who banked more, whether or not they are home yet.
    if (book.lapsCompleted >= this.laps || this.leaderFinishedAt !== null) {
      book.finished = true;
      book.finishSeconds = this.elapsedSeconds;
      events.push({ kind: 'finish', seat, value: book.lapsCompleted, seconds: this.elapsedSeconds });
      return;
    }
    this.openLap(book, true);
    // The bank moved the distance and the open moved the sector cursor, so the
    // progress written at the top of this method — computed against the lap
    // count as it stood *before* the line — is a whole lap stale. Recomputed
    // against the fresh book: the gate has depth, so the crossing lands a few
    // metres short of the line's own centre, and with `next` reset the signed
    // clamp reads those metres as *just short of the line* on the new lap —
    // continuous, instead of a lap-sized spike (QA repair, 2026-08-31).
    this.writeProgress(book, input.x, input.z);
  }

  /** Open a lap at the line, or begin the one already open again. */
  private openLap(book: RiderBook, advance: boolean): void {
    if (advance) book.lap += 1;
    book.lapStart = this.elapsedSeconds;
    book.next = 1;
    book.voided = null;
  }

  /**
   * Laps banked plus metres ridden *from the start line*, folded into one
   * number the standings can sort on.
   *
   * Measured from the line rather than from the envelope's own first sample —
   * see `lineOffset`. A voided lap's metres evaporate here at the line, which
   * is the "a voided lap does not count toward the distance" rule expressed as
   * arithmetic rather than as a special case.
   */
  private writeProgress(book: RiderBook, x: number, z: number): void {
    if (this.envelope === null) return;
    const length = this.envelope.length;
    const fromLine = (this.envelope.progressAt(x, z) - this.lineOffset + length) % length;
    // **Signed behind the line.** A rider whose current lap has found no
    // sector yet and who reads as almost a whole lap along is *behind* the
    // line — the grid before GO, the out-lap's first metres, a rider
    // reversing over it — not one crossing away from banking. Unsigned, the
    // grid's standings invert at GO: the back row reads a lap ahead of
    // whoever crossed first, until everybody has. The sector test is what
    // makes the halves unambiguous — a rider genuinely near the end of a lap
    // has found a gate, and `next` says so.
    const signed = book.next <= 1 && fromLine > length / 2 ? fromLine - length : fromLine;
    book.progress = book.lapsCompleted * length + signed;
  }

  /**
   * The room's answer, computed once per step from every rider's book.
   *
   * **Where the record/decide split pays for itself.** Nothing above knows
   * whether anybody has won; this is the only place that looks at all of them
   * at once, which is why a simultaneous finish is a draw here rather than a
   * race won by whichever seat the loop reached first.
   *
   * The race ends when everybody has finished, or — if `finishGraceSeconds` is
   * anything other than the zero it ships at — when the grace runs out after
   * the leader. Riders still out at that point are classified by progress,
   * which is what makes the cap a cap rather than a design argument (§27.3).
   */
  private decide(): void {
    const order = this.sorted();
    let position = 0;
    for (let index = 0; index < order.length; index += 1) {
      if (index === 0 || compareBooks(order[index - 1], order[index]) !== 0) position = index + 1;
      order[index].position = position;
    }

    if (this.leaderFinishedAt === null) {
      let earliest: number | null = null;
      for (const book of this.riders) {
        if (book.finishSeconds === null) continue;
        earliest = earliest === null ? book.finishSeconds : Math.min(earliest, book.finishSeconds);
      }
      if (earliest !== null) {
        this.leaderFinishedAt = earliest;
        // A shared top is a draw, and the null is the draw rather than a race
        // still running — `phase` is what tells those two apart, exactly as
        // `MatchState.winner` documents.
        const leaders = this.riders.filter((book) => book.position === 1);
        this.winnerSeat = leaders.length === 1 ? this.riders.indexOf(leaders[0]) : null;
      }
    }

    const everybodyIn = this.riders.every((book) => book.finished);
    const graceSpent = this.leaderFinishedAt !== null
      && this.finishGraceSeconds > 0
      && this.elapsedSeconds >= this.leaderFinishedAt + this.finishGraceSeconds;
    if (!everybodyIn && !graceSpent) return;

    this.phaseValue = 'ended';
    this.ended = Object.freeze({
      laps: this.laps,
      seconds: this.elapsedSeconds,
      winner: this.winnerSeat,
      order: Object.freeze(this.sorted().map((book) => Object.freeze({
        seat: this.riders.indexOf(book),
        position: book.position,
        finished: book.finished,
        seconds: book.finishSeconds,
        gapSeconds: this.gapFor(book),
        bestLapSeconds: book.bestLap,
        lapsCompleted: book.lapsCompleted,
      }))),
    });
  }

  /** The books in finishing order — finished by time, then the rest by distance. */
  private sorted(): RiderBook[] {
    return [...this.riders].sort(compareBooks);
  }

  /** Seconds behind the leader's finish — see `RaceRider.gapSeconds`. */
  private gapFor(book: RiderBook): number | null {
    if (this.leaderFinishedAt === null) return null;
    if (book.finishSeconds !== null) return book.finishSeconds - this.leaderFinishedAt;
    // Still riding: at least this far behind, and counting. Their own crossing
    // freezes it — `finishSeconds` is written as `elapsedSeconds`, so the two
    // branches agree to the step and the number never jumps.
    return this.elapsedSeconds - this.leaderFinishedAt;
  }

  /** The public view of every book, in seat order. */
  private standings(): readonly RaceRider[] {
    return Object.freeze(this.riders.map((book, seat) => Object.freeze({
      seat,
      lap: book.lap,
      lapsCompleted: book.lapsCompleted,
      lastLapSeconds: book.lastLap,
      bestLapSeconds: book.bestLap,
      finished: book.finished,
      finishSeconds: book.finishSeconds,
      position: book.position,
      gapSeconds: this.gapFor(book),
      progressMetres: book.progress,
      onCourse: book.onCourse,
      voided: book.voided,
    })));
  }

  private clear(): void {
    this.phaseValue = 'idle';
    this.riders.length = 0;
    this.countdownRemaining = 0;
    this.countdownShown = -1;
    this.elapsedSeconds = 0;
    this.leaderFinishedAt = null;
    this.winnerSeat = null;
    this.ended = null;
  }
}

/** A rider who has not started. */
function freshBook(): RiderBook {
  return {
    lap: 0,
    lapsCompleted: 0,
    lapStart: 0,
    next: 0,
    insideStart: false,
    voided: null,
    onCourse: true,
    lastLap: null,
    bestLap: null,
    finished: false,
    finishSeconds: null,
    progress: 0,
    position: 1,
    crossedLine: false,
  };
}

/**
 * Who is ahead — and **zero for level**, which is what makes a shared position
 * expressible rather than a rounding accident.
 *
 * **Laps that counted, then the clock for two who are home, then the road.**
 * The flag is deliberately *not* a sort key. The first repair put laps ahead
 * of the clock but left both behind `finished`, and that gate is where the
 * places came unstuck: a rider waved home off a voided lap is finished with
 * nothing, so it lifted them over the honest rider still out on a lap they had
 * actually banked, and dropped them again the moment that rider crossed. A
 * place that moves after the flag has fallen is the one thing q97 forbids —
 * "clock stopped, position locked" (second QA pass, 2026-08-31).
 *
 * Laps first fixes the reported case. Settling the *equal-laps* tie by
 * distance rather than by the flag is what makes the lock hold, and it is not
 * a technicality: a rider level on laps and still out is by construction
 * further down the road — they banked that lap earlier and have been riding
 * since — so the flag would rank them behind somebody they are ahead of, and
 * hand the place over the moment they crossed. Distance says it once and never
 * changes its mind, because `recordRider` freezes a finished rider's progress
 * where they crossed. Two riders who are both home are the one pair distance
 * cannot separate — they stopped a few metres apart at the same line — so
 * their shared clock decides. A draw is equal laps *and* an equal clock.
 *
 * **The trade this takes, knowingly:** when a finite `finishGraceSeconds`
 * expires, a rider left out on the circuit is a Did-not-finish who can still
 * be classified above a finisher on equal laps, because they were ahead on the
 * road when the race was stopped. That is how a race stopped at a flag is read
 * everywhere else, the row says "Did not finish" in its own words, and it is
 * unreachable at the shipped grace of 0, where the race waits for every rider
 * to complete the lap they are on (q89). The alternative buys a tidier card by
 * putting the pane's position back on the move, which is the defect above.
 */
function compareBooks(a: RiderBook, b: RiderBook): number {
  if (a.lapsCompleted !== b.lapsCompleted) return b.lapsCompleted - a.lapsCompleted;
  if (a.finished && b.finished) {
    const first = a.finishSeconds ?? 0;
    const second = b.finishSeconds ?? 0;
    return first === second ? 0 : first - second;
  }
  return b.progress - a.progress;
}
