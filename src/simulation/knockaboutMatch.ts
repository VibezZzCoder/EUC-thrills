/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { KNOCKABOUT } from '../data/tuning.ts';

/**
 * The rules of a couch Knockabout match — M26 Phase 4, and the whole of them.
 *
 * **This is `simulation/trackDay.ts`'s sibling, not a flag through
 * `Game.stepKnockabout`.** The project's own rule is that a mode's referee is
 * its own file, and the discipline is the same one: pure arithmetic, a step
 * signature, `node --test` territory, no `three`, no `app/`, no player option
 * (invariants 1 and 5). It differs from the referee it sits beside in one way
 * that no parameter could paper over — a track day is judged against a line and
 * a match is judged against another person — so it is a second file rather than
 * a flag through the first.
 *
 * Until M26 the Knockabout run was the one mode of five whose rules never
 * earned a file: fifteen lines inline in `Game.ts` that counted seconds and
 * ended when the last disc fell. **That mode is untouched.** `Game` picks which
 * referee a run answers to by *seat count*, which is the session shape asking
 * the question rather than a mode flag answering it, and single-player
 * Knockabout — including its records — never reaches this file at all.
 *
 * ## What decides a match
 *
 * **Knockdowns, and only knockdowns** (q76). First to `matchKnockdowns` ends
 * it. There is no clock to run out: §13 q14 made elapsed a number that is shown
 * and counts zero, and q76 kept it that way. The seconds accumulated here are
 * for the card to report, exactly as the single-player card's "Time taken" row
 * is, and nothing reads them to decide anything.
 *
 * **A knockdown is a strike-caused crash, credited to the striker, and this
 * file does not detect one.** It is handed the fact. That is deliberate and it
 * is what keeps the referee honest: whether a swing was committed is the
 * paddle's arithmetic (`simulation/paddle.ts`), whether it put somebody down is
 * the controller's (`EucController.hardKnock`), and who was holding the paddle
 * is a thing only the composition root knows. A referee that reached for any of
 * those three would have to know what a seat is. From M37 the arithmetic that
 * turns one step's recorded paddle hits into that list of facts is
 * `simulation/strikeBatch.ts` — still not this file's business, and still
 * handed in one seat at a time through `knockdown`.
 *
 * **Discs are a side tally with per-seat credit, and they can never win it**
 * (q76). The field stays shared — a disc that falls is gone for both riders,
 * which is what keeps the route worth riding — and whoever knocked it down owns
 * it. Nobody wins a fight by farming scenery.
 *
 * **A step is the unit, and a shared lead is a draw** (q86, answered
 * 2026-08-28). The knockdowns of a step are all handed in before the referee
 * is stepped — `Game.spendRiderStrikes` runs to completion above
 * `stepKnockabout` — so the ending is decided *here*, once, on the tallies
 * that step produced, and never by whichever fact arrived first. Until this
 * was answered `knockdown` ended the match itself, which meant two riders who
 * each reached the target on the same fixed step gave it to the seat the loop
 * happened to visit first, which is always seat 0. The owner's instruction was
 * "whatever is fair, and simple... I don't want a player having unfair
 * advantage", so the highest tally at or above the target wins and a tally
 * shared at the top is **drawn**: `winner` is null and `result()` still
 * returns a card, because a draw is an ending and the screen has to name it.
 *
 * Discs are not the tie-break, and could not be: q76 says they can never win
 * a match, and a draw broken by scenery is scenery winning a fight.
 *
 * **Nothing is stored** (q77). §25.6's couch rule holds: a couch session keeps
 * no records, so there is no store here, no `beatRecord`, and no reference to
 * compare against. The moment still gets a screen, and the screen names the
 * winner.
 *
 * Determinism is a hard requirement, as it is next door: the QA bridge's
 * `advance(n)` must produce the same match every time. No `Date`, no
 * `Math.random`, no wall clock — the clock is the accumulated fixed step handed
 * in by the caller.
 *
 * ## What M37 added, and what it deliberately did not
 *
 * §37.3 is explicit that three and four riders get **stronger tests and three
 * more facts on the existing referee, not a second Knockabout referee**. The
 * facts are:
 *
 * - **Places** (q168/q169). Rank is `1 + the number of riders with more
 *   knockdowns`, so 5/5/3/3 places 1/1/3/3 and a final 6/5/4 has one winner
 *   rather than a draw among everybody who reached five. Seat order may
 *   stabilise a display inside a shared place and may never award an
 *   advantage — which is why the rank is counted rather than sorted, and why
 *   `places` is index-for-index with the seats instead of an order.
 * - **The tied leaders** (q168). A draw names who drew: `winner` stays null
 *   and `tiedLeaders` lists the two, three or four riders who shared the top
 *   tally. A results card that said "you both" at three riders would be
 *   wrong on the screen the owner is reading, so the card is handed the set.
 * - **A countdown phase** (q170). `arm` takes the count's duration, and a
 *   duration above zero holds the room in `countdown` until a fixed-step
 *   clock runs out. **Zero starts `running` on the spot** — the two-player
 *   match's immediate start is its regression contract (§37.1), and every
 *   two-seat caller passes zero.
 *
 * The count's *shape* is the race's, deliberately (§37.4): the same
 * `count`/`go` events with the same fields, so `Game` reuses one room cue and
 * one announcing HUD rather than growing a second countdown vocabulary. Where
 * it differs from `raceRun.ts` is the zero case — a race at zero still passes
 * through `countdown` for one step, because nothing outside it can tell, while
 * a match armed at zero must be `running` before the first step, because
 * `Game.slotSpacing` and the two-seat specs read the phase the instant the
 * referee is armed.
 *
 * What M37 did **not** add is a second way to know a match is over. `phase`,
 * never `winner !== null`, decides completion (§37.3), and the ending is still
 * reported to the caller exactly once — now as `MatchStep.ended` and as the
 * single `ended` event beside it.
 */

/**
 * Where a match is in its life. `ended` is a match with a result in it.
 *
 * `countdown` is M37's (q170) and is a *held* match: the clock has not
 * started, knockdowns and discs are refused, and the room is frozen by the
 * composition root reading this phase — the race's arrangement exactly.
 */
export type MatchPhase = 'idle' | 'countdown' | 'running' | 'ended';

/** One seat's tally. Both halves are shown in every pane (q80, q169). */
export interface MatchScore {
  readonly knockdowns: number;
  readonly discs: number;
}

/**
 * Something the room should hear or read — M37 (§37.4).
 *
 * **`RaceEvent`'s fields, on purpose.** §37.4 asks for the race's 3-2-1-GO
 * convention rather than a new one, and the cheapest way to keep two
 * countdowns identical is to give them one shape: `Game.handleRaceEvent`'s
 * counterpart can dispatch the same cue from the same three fields. Facts,
 * never sentences.
 */
export interface MatchEvent {
  readonly kind: 'count' | 'go' | 'ended';
  /**
   * Which seat, or -1 for the room's own events.
   *
   * `count` and `go` are always the room's. `ended` carries **the winner, or
   * -1 for a draw** — and a draw is the room's event in the only sense that
   * matters to a cue. Who drew is `MatchResult.tiedLeaders`; an event is not
   * the place to read a standing off.
   */
  readonly seat: number;
  /** The number the count is showing, or the winning tally on `ended`. */
  readonly value: number;
  /** The match clock when it happened. Zero for everything before GO. */
  readonly seconds: number;
}

/**
 * One fixed step's outcome — M37.
 *
 * The ending kept its own field rather than becoming "look for an `ended`
 * event", because `Game.stepKnockabout` asks exactly one question of this
 * referee and a scan is a worse way to answer it than a boolean. Both are
 * true exactly once: the phase is the latch.
 */
export interface MatchStep {
  /** True on the step the match ended, and once. */
  readonly ended: boolean;
  /** Everything worth a cue this step, in the order it happened. */
  readonly events: readonly MatchEvent[];
}

/** What a match looks like from outside, read once per drawn frame. */
export interface MatchState {
  readonly phase: MatchPhase;
  /** How many seats are fighting. Zero while idle. */
  readonly seats: number;
  /** Knockdowns needed to win, so the HUD can say "3 of 5" without guessing. */
  readonly target: number;
  /** Seconds left of the count; zero in every other phase (`RaceState`'s). */
  readonly countdown: number;
  /** Simulation seconds this match has lasted. Shown; decides nothing. */
  readonly elapsed: number;
  readonly scores: readonly MatchScore[];
  /**
   * Every seat's place, index-for-index, 1-based and **shared** — M37 (q169).
   *
   * `1 + the number of riders with more knockdowns`: 5/5/3/3 is 1/1/3/3, and
   * the seat a tally was handed over in cannot move it.
   */
  readonly places: readonly number[];
  /**
   * The seats holding the current maximum, ascending — M37.
   *
   * Every seat while nobody has scored, which is honest rather than awkward:
   * at 0/0/0 nobody is behind. The HUD decides whether a leader is worth
   * marking; this is arithmetic, not a presentation rule.
   */
  readonly leaders: readonly number[];
  /**
   * The seat that won, or null.
   *
   * Null means two different things and `phase` is what separates them: while
   * `running` it is *nobody yet*, and once `ended` it is **a draw** (q86).
   * Nothing may read this field to decide whether a match is over — `phase`
   * and `step`'s return are the two ways to know that.
   */
  readonly winner: number | null;
}

/** A finished match, frozen. The card's whole input. */
export interface MatchResult {
  /** How many riders fought it, so a card never counts its own rows. */
  readonly seats: number;
  readonly target: number;
  readonly seconds: number;
  readonly scores: readonly MatchScore[];
  /** Every seat's place, index-for-index and shared (q169). */
  readonly places: readonly number[];
  /**
   * The riders who shared the top tally, ascending — **empty when there is a
   * winner** (q168, M37).
   *
   * The card is headed by the winner or by "Match drawn", and a three-way
   * draw has to name three riders: "you both" is wrong on a screen with three
   * rows in it. Empty and `winner` non-null are the same fact said twice on
   * purpose — the card reads one field and never has to invert the other.
   */
  readonly tiedLeaders: readonly number[];
  /** The seat that won, or null for a draw (q86). A card always has one card. */
  readonly winner: number | null;
}

const NO_SCORES: readonly MatchScore[] = Object.freeze([]);
const NO_SEATS: readonly number[] = Object.freeze([]);
const NO_EVENTS: readonly MatchEvent[] = Object.freeze([]);

/**
 * The return of a step where nothing happened, which is nearly all of them.
 *
 * One frozen object rather than a fresh pair of allocations 120 times a
 * second, on `raceRun.ts`'s `NO_EVENTS` argument. It is shared, so it is
 * frozen, and a caller that held on to it would be holding on to a fact about
 * a step that is over — which is true of every return here.
 */
const QUIET_STEP: MatchStep = Object.freeze({ ended: false, events: NO_EVENTS });

export class KnockaboutMatch {
  // -- Live tuning, on the pattern every other simulation object uses --------
  //
  // A public annotated field rather than a read through the tuning table, and
  // annotated `: number` rather than inferred because the table is `as const` —
  // an inferred field would take the *literal* type of today's default and
  // refuse every value F4 could write into it. `ChaseRun` states this at length.
  matchKnockdowns: number = KNOCKABOUT.matchKnockdowns;

  private phaseValue: MatchPhase = 'idle';
  private readonly knockdownsBy: number[] = [];
  private readonly discsBy: number[] = [];
  private elapsedSeconds = 0;
  private winnerSeat: number | null = null;
  private tiedLeaderSeats: readonly number[] = NO_SEATS;
  private countdownRemaining = 0;
  private countdownShown = -1;

  /**
   * The phase alone, without building the rest of the card.
   *
   * `state` is the whole room — the scores, the places (which count riders
   * against riders) and the leaders — and three of its four readers only ever
   * wanted this one word: the fixed step asks "is there a match at all" every
   * tick, and `Game.slotSpacing` asks "is it idle". Building four arrays to
   * answer a string comparison is the same shape as the per-step `slice()`
   * this project already took off the strike path, so the cheap question has
   * its own door. The two are the same field and the tests hold them equal.
   */
  get phase(): MatchPhase {
    return this.phaseValue;
  }

  get state(): MatchState {
    const idle = this.phaseValue === 'idle';
    return {
      phase: this.phaseValue,
      seats: this.knockdownsBy.length,
      target: this.matchKnockdowns,
      countdown: this.phaseValue === 'countdown' ? this.countdownRemaining : 0,
      elapsed: this.elapsedSeconds,
      scores: idle ? NO_SCORES : this.scores(),
      places: idle ? NO_SEATS : this.places(),
      leaders: idle ? NO_SEATS : this.leaders(this.best()),
      winner: this.winnerSeat,
    };
  }

  /**
   * Start a match between `seats` riders, optionally held for a count first.
   *
   * The seat count is handed in rather than assumed, which is what let M37
   * widen the room without widening this file: two, three and four all arm the
   * same way and the tallies below are however many were asked for.
   *
   * **`countdownSeconds` above zero holds the room** in `countdown` until a
   * fixed-step clock runs out (q170), and zero — every two-seat caller, and
   * the setting that switches the count off at any N — starts `running` on
   * the spot. This is the one place the two shapes differ from `RaceRun.arm`,
   * which always passes through `countdown`: a race's grid is held by a phase
   * nothing else reads on the arming tick, while `Game.slotSpacing` and the
   * two-seat specs read a match's phase the instant it is armed, and the
   * immediate two-player start is a regression contract (§37.1).
   *
   * The duration is a parameter rather than a field read from `KNOCKABOUT`
   * because *which rooms count down* is a composition-root decision (N=3/4
   * only): a referee that read the constant itself would have to know how many
   * seats make a couch, which is precisely the knowledge this file does not
   * have.
   */
  arm(seats: number, countdownSeconds: number = 0): void {
    this.clear();
    // A whole number of chairs, on `knockdown` and `disc`'s own test and
    // `StrikeBatch`'s: `arm(3.5)` used to build a **four**-seat room, because
    // `seat < 3.5` runs four times, and `arm(Infinity)` used to push tallies
    // until the heap gave out. Neither is reachable from `Game` (the seat count
    // is a counted array's length), which is exactly why the guard is cheap.
    if (!Number.isInteger(seats) || seats < 2) return;
    for (let seat = 0; seat < seats; seat += 1) {
      this.knockdownsBy.push(0);
      this.discsBy.push(0);
    }
    const held = Number.isFinite(countdownSeconds) ? Math.max(0, countdownSeconds) : 0;
    if (held > 0) {
      this.phaseValue = 'countdown';
      this.countdownRemaining = held;
      this.countdownShown = -1;
      return;
    }
    this.phaseValue = 'running';
  }

  /** Back to `idle`. Leaving the mode, quitting to the title, a world swap. */
  abandon(): void {
    this.clear();
  }

  /**
   * Somebody was put down, and this seat did it.
   *
   * **It records and it never decides** (q86). Every knockdown of a step is
   * handed in before `step` is called, so a tally is the only thing this
   * method touches and the ending is worked out once, from all of them. It
   * ended the match itself until 2026-08-28, and that is precisely what made
   * two riders reaching the target together a win for whichever seat the
   * caller's loop visited first.
   *
   * **More than one in a step is ordinary at three and four riders** (q171,
   * and q173's shared credit): one swing that downs two riders is two, and one
   * victim reached by two committed paddles credits both attackers. Nothing
   * here needs to know which of those happened — they are calls.
   *
   * Refused unless a match is running, so a knockdown handed in after the
   * ending step — the results delay is three seconds long and the paddles are
   * still in their hands — cannot score, and neither can one handed in during
   * the count, where nobody is meant to be able to swing at all. Refused for a
   * seat this match does not have, because a silently-grown tally is a
   * scoreboard that disagrees with the screen.
   */
  knockdown(seat: number): void {
    if (this.phaseValue !== 'running') return;
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.knockdownsBy.length) return;
    this.knockdownsBy[seat] += 1;
  }

  /** This seat knocked a disc down. A side tally; it can never end a match. */
  disc(seat: number): void {
    if (this.phaseValue !== 'running') return;
    if (!Number.isInteger(seat) || seat < 0 || seat >= this.discsBy.length) return;
    this.discsBy[seat] += 1;
  }

  /**
   * One fixed step — the count while there is one, then the match.
   *
   * **This is where a match ends** (q86). The tallies are read after every
   * knockdown of the step has been handed in, so the answer is a property of
   * the step rather than of the order the facts arrived in: the highest tally
   * at or above the target takes it, and a tally shared at the top is a draw
   * among exactly the riders who share it (q168). Nothing here looks past the
   * knockdowns — which is q76 holding under a rule it never anticipated.
   *
   * `ended` needs no latch: the phase is the latch, and every call after the
   * ending one leaves at the first line.
   *
   * The clock advances only while the match is running *and is not ending*, so
   * the step that decides it does not age it — the same rule the lap referee
   * applies to a lap that closes mid-step, and the reason the check comes
   * before the addition rather than after it. The count does not age it
   * either: elapsed is the fight's length and the fight has not started.
   */
  step(stepSeconds: number): MatchStep {
    if (this.phaseValue === 'idle' || this.phaseValue === 'ended') return QUIET_STEP;

    if (this.phaseValue === 'countdown') return this.stepCountdown(stepSeconds);

    const best = this.best();
    if (best < this.matchKnockdowns) {
      this.elapsedSeconds += Math.max(0, stepSeconds);
      return QUIET_STEP;
    }

    // A seat can gain more than one knockdown in a step — two victims of one
    // swing (q171), or a shared victim crediting two attackers (q173) — so
    // "who is at the top" is asked rather than assumed to be everybody who
    // reached the target. A final 6/5/4 has one winner.
    const leaders = this.leaders(best);
    this.winnerSeat = leaders.length === 1 ? leaders[0] : null;
    this.tiedLeaderSeats = leaders.length === 1 ? NO_SEATS : leaders;
    this.phaseValue = 'ended';
    return Object.freeze({
      ended: true,
      events: Object.freeze([{
        kind: 'ended' as const,
        seat: this.winnerSeat ?? -1,
        value: best,
        seconds: this.elapsedSeconds,
      }]),
    });
  }

  /**
   * The finished match, or null. Frozen, and copied out of the live tallies.
   *
   * **`ended` is the whole test** (q86). It used to demand a winner as well,
   * which was a redundant guard while a match could not end without one and
   * would have silently swallowed the draw the moment one could — `finishMatch`
   * stores what this returns, and a null there is a results screen showing the
   * previous mode's card.
   */
  result(): MatchResult | null {
    if (this.phaseValue !== 'ended') return null;
    return Object.freeze({
      seats: this.knockdownsBy.length,
      target: this.matchKnockdowns,
      seconds: this.elapsedSeconds,
      scores: this.scores(),
      places: this.places(),
      tiedLeaders: this.tiedLeaderSeats,
      winner: this.winnerSeat,
    });
  }

  /**
   * The held room — M37 (q170), and `RaceRun.step`'s countdown branch verbatim
   * in everything a player can perceive.
   *
   * The number on screen is the ceiling of what is left, so "3" is shown for
   * the whole of the third second and "GO" replaces "1" rather than following
   * a silent zero. GO flips the phase here and nowhere else, which is what
   * makes "clear every seat's queued one-shots at GO" a single door for the
   * composition root to stand in.
   */
  private stepCountdown(stepSeconds: number): MatchStep {
    this.countdownRemaining = Math.max(0, this.countdownRemaining - Math.max(0, stepSeconds));
    const shown = Math.ceil(this.countdownRemaining);
    let events: MatchEvent[] | null = null;
    if (shown > 0 && shown !== this.countdownShown) {
      this.countdownShown = shown;
      events = [{ kind: 'count', seat: -1, value: shown, seconds: 0 }];
    }
    if (this.countdownRemaining > 0) {
      return events === null ? QUIET_STEP : Object.freeze({ ended: false, events: Object.freeze(events) });
    }

    this.phaseValue = 'running';
    this.countdownShown = 0;
    const released = events ?? [];
    released.push({ kind: 'go', seat: -1, value: 0, seconds: 0 });
    return Object.freeze({ ended: false, events: Object.freeze(released) });
  }

  /** The highest tally on the board. Zero while nobody has scored. */
  private best(): number {
    let best = 0;
    for (const knockdowns of this.knockdownsBy) best = Math.max(best, knockdowns);
    return best;
  }

  /**
   * Who is on `best`, ascending.
   *
   * Ascending because a set has to come out in *some* order and seat order is
   * the one order that is not a claim: it is used to list the tied leaders on
   * a card, never to pick one of them.
   */
  private leaders(best: number): readonly number[] {
    const leaders: number[] = [];
    for (let seat = 0; seat < this.knockdownsBy.length; seat += 1) {
      if (this.knockdownsBy[seat] === best) leaders.push(seat);
    }
    return Object.freeze(leaders);
  }

  /**
   * Every seat's place — q169's `1 + the number of riders with more`.
   *
   * Counted rather than sorted, which is the whole of the fairness claim: a
   * sort needs a comparator, a comparator needs a tie-break, and the only
   * tie-break available here would be the seat index. 5/5/3/3 is 1/1/3/3 and
   * no seat is advantaged by the number it happens to hold.
   */
  private places(): readonly number[] {
    const places: number[] = [];
    for (let seat = 0; seat < this.knockdownsBy.length; seat += 1) {
      let ahead = 0;
      for (const knockdowns of this.knockdownsBy) {
        if (knockdowns > this.knockdownsBy[seat]) ahead += 1;
      }
      places.push(1 + ahead);
    }
    return Object.freeze(places);
  }

  private scores(): readonly MatchScore[] {
    return Object.freeze(this.knockdownsBy.map((knockdowns, seat) => Object.freeze({
      knockdowns,
      discs: this.discsBy[seat],
    })));
  }

  private clear(): void {
    this.phaseValue = 'idle';
    this.knockdownsBy.length = 0;
    this.discsBy.length = 0;
    this.elapsedSeconds = 0;
    this.winnerSeat = null;
    this.tiedLeaderSeats = NO_SEATS;
    this.countdownRemaining = 0;
    this.countdownShown = -1;
  }
}
