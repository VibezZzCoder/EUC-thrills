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
 * those three would have to know what a seat is.
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
 */

/** Where a match is in its life. `ended` is a match with a winner in it. */
export type MatchPhase = 'idle' | 'running' | 'ended';

/** One seat's tally. Both halves are shown in both halves of the screen (q80). */
export interface MatchScore {
  readonly knockdowns: number;
  readonly discs: number;
}

/** What a match looks like from outside, read once per drawn frame. */
export interface MatchState {
  readonly phase: MatchPhase;
  /** How many seats are fighting. Zero while idle. */
  readonly seats: number;
  /** Knockdowns needed to win, so the HUD can say "3 of 5" without guessing. */
  readonly target: number;
  /** Simulation seconds this match has lasted. Shown; decides nothing. */
  readonly elapsed: number;
  readonly scores: readonly MatchScore[];
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
  readonly target: number;
  readonly seconds: number;
  readonly scores: readonly MatchScore[];
  /** The seat that won, or null for a draw (q86). A card always has one card. */
  readonly winner: number | null;
}

const NO_SCORES: readonly MatchScore[] = Object.freeze([]);

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

  get state(): MatchState {
    return {
      phase: this.phaseValue,
      seats: this.knockdownsBy.length,
      target: this.matchKnockdowns,
      elapsed: this.elapsedSeconds,
      scores: this.phaseValue === 'idle' ? NO_SCORES : this.scores(),
      winner: this.winnerSeat,
    };
  }

  /**
   * Start a match between `seats` riders.
   *
   * The seat count is handed in rather than assumed, so the day a four-player
   * couch is measured (§26.7 says it has not been) this file is already
   * counting the right number of tallies.
   */
  arm(seats: number): void {
    this.clear();
    if (!(seats >= 2)) return;
    for (let seat = 0; seat < seats; seat += 1) {
      this.knockdownsBy.push(0);
      this.discsBy.push(0);
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
   * Refused unless a match is running, so a knockdown handed in after the
   * ending step — the results delay is three seconds long and the paddles are
   * still in their hands — cannot score. Refused for a seat this match does
   * not have, because a silently-grown tally is a scoreboard that disagrees
   * with the screen.
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
   * One fixed step. True on the step the match ended, and once.
   *
   * **This is where a match ends** (q86). The tallies are read after every
   * knockdown of the step has been handed in, so the answer is a property of
   * the step rather than of the order the facts arrived in: the highest tally
   * at or above the target takes it, and a tally shared at the top is a draw.
   * Two seats can only tie at the top by tying exactly, since nothing here
   * looks past the knockdowns — which is q76 holding under a rule it never
   * anticipated.
   *
   * `once` needs no latch any more: the phase is the latch, and every call
   * after the ending one leaves at the first line.
   *
   * The clock advances only while the match is running *and is not ending*, so
   * the step that decides it does not age it — the same rule the lap referee
   * applies to a lap that closes mid-step, and the reason the check comes
   * before the addition rather than after it.
   */
  step(stepSeconds: number): boolean {
    if (this.phaseValue !== 'running') return false;

    let best = 0;
    for (const knockdowns of this.knockdownsBy) best = Math.max(best, knockdowns);
    if (best < this.matchKnockdowns) {
      this.elapsedSeconds += Math.max(0, stepSeconds);
      return false;
    }

    // A seat can gain more than one knockdown in a step the day a four-player
    // couch is measured (§26.7), so "who is at the top" is asked rather than
    // assumed to be everybody who reached the target.
    let leader = -1;
    let shared = false;
    for (let seat = 0; seat < this.knockdownsBy.length; seat += 1) {
      if (this.knockdownsBy[seat] !== best) continue;
      if (leader === -1) leader = seat;
      else shared = true;
    }
    this.winnerSeat = shared ? null : leader;
    this.phaseValue = 'ended';
    return true;
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
      target: this.matchKnockdowns,
      seconds: this.elapsedSeconds,
      scores: this.scores(),
      winner: this.winnerSeat,
    });
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
  }
}
