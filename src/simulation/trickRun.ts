/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { SIMULATION, TRICK_RUN } from '../data/tuning.ts';
import type { LandingQuality } from './EucController.ts';
import {
  NO_TRICKS,
  TrickObserver,
  clearTrickFacts,
  createTrickFacts,
  type TrickEventKind,
  type TrickFacts,
  type TrickStepInput,
  type TrickTally,
} from './trickEvents.ts';

/**
 * The Trick Run's referee — M38 §38.3/§38.4, and the whole of the scoring.
 *
 * **`trackDay.ts`'s and `knockaboutMatch.ts`'s sibling, not a flag through
 * either.** A track day is judged against a line and a match against another
 * person; a trick run is judged against a clock, and what it counts is what
 * the rider landed. Same discipline as next door: pure arithmetic, a step
 * signature, `node --test` territory, no `three`, no `app/`, no player option
 * (invariants 1 and 5), no `Date`, no `Math.random` — the only clock is the
 * fixed step handed in, counted in steps rather than seconds so a couch of
 * four shares one deadline and `advance(n)` reproduces a run exactly.
 *
 * ## One place decides points
 *
 * §38.4: no scoring formula in `Game`, the HUD, the results card or storage.
 * They display the snapshots this file publishes, and the breakdown on the
 * card is this file's attribution — never `count × value` arithmetic that
 * would ignore landing quality and forfeits. The one number the card must be
 * able to check is that the breakdown adds exactly to the total, and it does
 * by construction: every award adds its parts to the same accumulators it adds
 * its total to.
 *
 * ## The observer detects, the referee banks
 *
 * `TrickObserver` (M36 §36.6) remains the single detector of its three kinds
 * and is not changed in meaning by a point value. It counts a charged hop at
 * the **launch**, because the rider charged it; this file banks it at the
 * **landing**, because §38.3 pays for tricks that land. The two numbers are
 * kept visibly apart: a hop the observer counted and the referee never banked
 * is reported as *forfeited*, not hidden inside either count.
 *
 * "Combo" means this flight's unbanked bundle and nothing longer (§38.3): no
 * chain across landings, no streak multiplier, no manual bank, no meter.
 *
 * ## Flight identity, restated
 *
 * Nothing banks without a takeoff observed **during this run** with a
 * matching `flightIndex`. A rider already in the air when the clock starts
 * lands a flight the run did not open and earns nothing for it; a replayed
 * touchdown, a stale slot, a mismatched identity or a struct full of true
 * flags with no takeoff behind it can bank nothing, because every one of them
 * arrives with no open flight to bank against — and a clean touchdown obeys
 * the same rule as the other awards.
 *
 * ## Record, then sweep, once per fixed step
 *
 * `Game` hands each seat's facts in through `record` after that seat has
 * stepped and its contact/crash outcome is known, then calls `step` exactly
 * once for the room. `step` advances the shared clock, feeds each recorded
 * slot to its observer **once**, banks or forfeits, and only then asks whether
 * the deadline fell on this step — so a touchdown on the final step counts for
 * every seat and nothing after it does. Every slot is cleared on every path:
 * a seat that recorded nothing is not re-read, and last step's touchdown can
 * never bank this step.
 */

/** Where a run is in its life. `ended` is a run with a result in it. */
export type TrickRunPhase = 'idle' | 'running' | 'ended';

/**
 * Every number the referee reads, as a value.
 *
 * A struct rather than a direct read of `TRICK_RUN`, so the headless bench can
 * evaluate an alternate rule object through the **same** referee (§38.3) —
 * never through a second formula — while the shipped run reads the shipped
 * table. Not a player option and never one.
 */
export interface TrickRunRules {
  readonly durationSteps: number;
  readonly cleanLandingPoints: number;
  readonly chargedHopPoints: number;
  readonly spinLandedPoints: number;
  readonly oneFootAirPoints: number;
  readonly multiTrickMinKinds: number;
  readonly multiTrickBonusPoints: number;
  readonly cleanMultiplier: number;
  readonly heavyMultiplier: number;
  readonly wobbleMultiplier: number;
  /**
   * Diminishing repeats (q185). A kind landed again within this many seconds
   * of its last banking is a repeat and pays `repeatDecay` to the power of how
   * many repeats in a row it is, never below `repeatFloor`. Zero seconds turns
   * the rule off.
   */
  readonly repeatWindowSeconds: number;
  readonly repeatDecay: number;
  readonly repeatFloor: number;
  /**
   * Seconds of rest that forget one repeat level. The run of repeats fades
   * rather than resetting, so leaving the window and coming back does not
   * restore full value at once. Zero resets the run on leaving the window.
   */
  readonly repeatFadeSeconds: number;
  /**
   * `1`: trick kinds and the flight bonus bank only on a flight launched from
   * a named zone (`record`'s third argument); `0`: anywhere. The clean-landing
   * award is never gated. Numeric so the revision string stays one shape.
   *
   * The repeat rules above are keyed on that same zone: a flight from the same
   * feature within `repeatWindowSeconds` of the last one that paid is a repeat
   * of the whole flight's value, fading one level per `repeatFadeSeconds`.
   */
  readonly featureLaunchRequired: number;
}

/** The shipped rules — `TRICK_RUN` as the referee reads it. */
export const SHIPPED_TRICK_RULES: TrickRunRules = Object.freeze({
  durationSteps: TRICK_RUN.durationSteps,
  cleanLandingPoints: TRICK_RUN.cleanLandingPoints,
  chargedHopPoints: TRICK_RUN.chargedHopPoints,
  spinLandedPoints: TRICK_RUN.spinLandedPoints,
  oneFootAirPoints: TRICK_RUN.oneFootAirPoints,
  multiTrickMinKinds: TRICK_RUN.multiTrickMinKinds,
  multiTrickBonusPoints: TRICK_RUN.multiTrickBonusPoints,
  cleanMultiplier: TRICK_RUN.cleanMultiplier,
  heavyMultiplier: TRICK_RUN.heavyMultiplier,
  wobbleMultiplier: TRICK_RUN.wobbleMultiplier,
  repeatWindowSeconds: TRICK_RUN.repeatWindowSeconds,
  repeatDecay: TRICK_RUN.repeatDecay,
  repeatFloor: TRICK_RUN.repeatFloor,
  repeatFadeSeconds: TRICK_RUN.repeatFadeSeconds,
  featureLaunchRequired: TRICK_RUN.featureLaunchRequired,
});

/**
 * Whether a rule object is one the referee can run.
 *
 * Points are non-negative safe integers because the total is one; the
 * duration is a positive step count; multipliers are finite and not negative
 * (a negative multiplier would let a landing *cost* points, which §38.3 never
 * allows — a crash costs the pending flight and nothing banked).
 */
export function validTrickRules(rules: TrickRunRules): boolean {
  const points = [
    rules.cleanLandingPoints, rules.chargedHopPoints, rules.spinLandedPoints,
    rules.oneFootAirPoints, rules.multiTrickBonusPoints,
  ];
  return Number.isSafeInteger(rules.durationSteps) && rules.durationSteps > 0
    && points.every((value) => Number.isSafeInteger(value) && value >= 0)
    && Number.isSafeInteger(rules.multiTrickMinKinds) && rules.multiTrickMinKinds >= 1
    && [rules.cleanMultiplier, rules.heavyMultiplier, rules.wobbleMultiplier]
      .every((value) => Number.isFinite(value) && value >= 0)
    && Number.isFinite(rules.repeatWindowSeconds) && rules.repeatWindowSeconds >= 0
    && Number.isFinite(rules.repeatFadeSeconds) && rules.repeatFadeSeconds >= 0
    && (rules.featureLaunchRequired === 0 || rules.featureLaunchRequired === 1)
    && [rules.repeatDecay, rules.repeatFloor]
      .every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

/**
 * The rules' identity, for the record store — §38.5's `rulesRevision`.
 *
 * Derived from every value rather than hand-numbered, so a changed point value
 * or duration **cannot** be filed against a best set under the old ones: the
 * store compares like with like or not at all. The prefix names the milestone
 * that established the first revision; the rest is the whole table, in a
 * fixed order. Bounded — one number per rule — and never parsed back.
 */
export function trickRulesRevision(rules: TrickRunRules): string {
  return [
    // `m38b`: the per-feature repeat clocks of 2026-09-14. A best filed under
    // the per-trick clocks (`m38`) is not comparable and is replaced.
    'm38b',
    rules.durationSteps,
    rules.cleanLandingPoints,
    rules.chargedHopPoints,
    rules.spinLandedPoints,
    rules.oneFootAirPoints,
    rules.multiTrickMinKinds,
    rules.multiTrickBonusPoints,
    rules.cleanMultiplier,
    rules.heavyMultiplier,
    rules.wobbleMultiplier,
    rules.repeatWindowSeconds,
    rules.repeatDecay,
    rules.repeatFloor,
    rules.repeatFadeSeconds,
    rules.featureLaunchRequired,
  ].join('/');
}

/** A touchdown tier that banks. `crash` forfeits and `none` decides nothing. */
export type BankingLanding = Extract<LandingQuality, 'clean' | 'heavy' | 'wobble'>;

/**
 * One flight's banked points, as they were decided.
 *
 * Facts rather than sentences: the HUD's one-line cue and the card's breakdown
 * read `kinds` and `landing` and choose the words (`AGENTS.md`: the screen
 * owns the words). `points` is `trickPoints + cleanPoints`, and `trickPoints`
 * is `round((basePoints + bonusPoints) × multiplier)` — rounded once, half up,
 * as `Math.round` rounds.
 */
export interface TrickAward {
  readonly seat: number;
  readonly flight: number;
  /** Distinct kinds, in the fixed order charged hop, 180, one-foot air. Empty for a plain landing. */
  readonly kinds: readonly TrickEventKind[];
  readonly landing: BankingLanding;
  readonly basePoints: number;
  readonly bonusPoints: number;
  readonly multiplier: number;
  readonly trickPoints: number;
  readonly cleanPoints: number;
  readonly points: number;
  /** True when a diminishing repeat of this flight's feature took some of its value (q185). */
  readonly repeated: boolean;
  /**
   * The feature the flight launched from, or null (q189). With the gate on, a
   * null here beside a non-empty `kinds` is a flight that landed tricks off
   * the features and was paid the landing alone.
   */
  readonly zone: string | null;
}

/**
 * Where a book's total came from. **Adds exactly to `total`**, always.
 *
 * `qualityAdjustment` is the signed difference the landing multipliers and
 * the single rounding made to the trick subtotals — positive for clean
 * landings, negative for wobbles — so the card can show base values per kind
 * and still have a column that sums. `chargedHopsForfeited` is the count the
 * observer took at launch that never banked; it is not points and it is not
 * in the sum, it is the honesty §38.3 asks for.
 */
export interface TrickBreakdown {
  readonly cleanLandingPoints: number;
  readonly chargedHopPoints: number;
  readonly spinPoints: number;
  readonly oneFootPoints: number;
  readonly bonusPoints: number;
  readonly qualityAdjustment: number;
  /**
   * The signed (never positive) difference diminishing repeats made — q185,
   * keyed per launch feature. Applied to the whole flight after the landing
   * multiplier and the clean-landing award, and part of the exact sum like
   * every other row.
   */
  readonly repeatAdjustment: number;
  readonly total: number;
  readonly chargedHopsForfeited: number;
  /** Flights that banked less than full value because of a repeat. */
  readonly repeatedFlights: number;
  /** Flights that landed tricks off any feature and were paid nothing for them (q189). */
  readonly offZoneFlights: number;
}

/** One seat's run, as a value. Read once per drawn frame; frozen on the card. */
export interface TrickBookState {
  readonly seat: number;
  /** Banked integer points. Never includes anything pending. */
  readonly score: number;
  /** The observer's counts with this book's own clean landings in them. */
  readonly tally: TrickTally;
  readonly crashes: number;
  /** Flights this run opened, landed or not. */
  readonly flights: number;
  /** True while a flight this run opened is in the air. */
  readonly flightOpen: boolean;
  /**
   * The kind already latched on the open flight — only a charged hop can be
   * known before the touchdown — so a HUD may say *pending*. Not banked.
   */
  readonly pending: readonly TrickEventKind[];
  /** The unmultiplied base of `pending`. Explicitly not part of `score`. */
  readonly pendingPoints: number;
  readonly lastAward: TrickAward | null;
  /** The run step on which `lastAward` banked, or -1. The cue's clock. */
  readonly lastAwardStep: number;
  /** The open flight's launch feature, or null. Diagnostic; banks nothing. */
  readonly openZone: string | null;
  readonly breakdown: TrickBreakdown;
}

/** The run, as a value. */
export interface TrickRunState {
  readonly phase: TrickRunPhase;
  readonly seats: number;
  readonly durationSteps: number;
  readonly elapsedSteps: number;
  readonly remainingSteps: number;
  /** `remainingSteps` at the fixed rate, for the HUD. Decides nothing. */
  readonly remainingSeconds: number;
  readonly books: readonly TrickBookState[];
}

/** One fixed step's outcome. `ended` is true exactly once; the phase is the latch. */
export interface TrickRunStep {
  readonly ended: boolean;
  /** Every award banked this step, in seat order. */
  readonly awards: readonly TrickAward[];
  /** Seats whose pending flight was forfeited by a crash this step, in seat order. */
  readonly forfeits: readonly number[];
}

/**
 * A finished run, frozen. The card's whole input, and the store's.
 *
 * `completed` is whether the full fixed duration ran (§38.3): only a completed
 * run is a comparable attempt, and an early end from pause produces an
 * explicitly unfinished card with no personal-best submission. That decision
 * is the composition root's; this field is the fact it reads.
 */
export interface TrickRunResult {
  readonly rulesRevision: string;
  readonly durationSteps: number;
  readonly elapsedSteps: number;
  readonly completed: boolean;
  readonly seats: number;
  readonly books: readonly TrickBookState[];
}

const NO_KINDS: readonly TrickEventKind[] = Object.freeze([]);
const NO_AWARDS: readonly TrickAward[] = Object.freeze([]);
const NO_SEATS: readonly number[] = Object.freeze([]);
const QUIET_STEP: TrickRunStep = Object.freeze({ ended: false, awards: NO_AWARDS, forfeits: NO_SEATS });
const PENDING_CHARGED: readonly TrickEventKind[] = Object.freeze(['charged-hop']);

/** One seat's book. Mutable, private, and never handed out. */
interface Book {
  readonly seat: number;
  readonly observer: TrickObserver;
  /** This step's recorded facts. Read once by `step`, then cleared. */
  readonly slot: TrickFacts;
  recorded: boolean;
  /** The flight this run opened and has not closed, or -1. */
  openFlight: number;
  /** The feature the open flight launched from, or null. */
  openZone: string | null;
  /** The zone handed in with this step's facts; read only on a takeoff. */
  recordedZone: string | null;
  /** The observer's launch credit on the open flight, awaiting its landing. */
  pendingCharged: boolean;
  flights: number;
  cleanLandings: number;
  crashes: number;
  wasCrashed: boolean;
  score: number;
  cleanLandingPoints: number;
  chargedHopPoints: number;
  spinPoints: number;
  oneFootPoints: number;
  bonusPoints: number;
  qualityAdjustment: number;
  repeatAdjustment: number;
  chargedHopsForfeited: number;
  repeatedFlights: number;
  offZoneFlights: number;
  /**
   * One repeat clock per launch feature (and one for off the features): the
   * run step it last paid on and how many repeats in a row it has paid.
   * Bounded by the plan's zone count plus one; `MAX_ZONE_CLOCKS` is the
   * guard against a plan that lies.
   */
  readonly zoneClocks: Map<string, ZoneClock>;
  lastAward: TrickAward | null;
  lastAwardStep: number;
}

interface ZoneClock {
  last: number;
  run: number;
}

/**
 * The repeat clock a flight from nowhere in particular is kept on.
 *
 * **It cannot collide with a feature's**, and that is arithmetic rather than a
 * convention a venue has to know about: a zone's clock is keyed `zoneClockKey`,
 * which prefixes the id, so a producer that named a feature `off-feature` would
 * keep its own clock and would not dock the next flat-ground landing (QA, M38).
 */
const OFF_FEATURE_CLOCK = 'off-feature';

/** A named feature's clock key — namespaced away from `OFF_FEATURE_CLOCK`. */
function zoneClockKey(zone: string): string {
  return `feature:${zone}`;
}
/** More clocks than any plan has zones; the oldest is dropped past it. */
const MAX_ZONE_CLOCKS = 32;

function freshBook(seat: number): Book {
  return {
    seat,
    observer: new TrickObserver(),
    slot: createTrickFacts(),
    recorded: false,
    openFlight: -1,
    openZone: null,
    recordedZone: null,
    pendingCharged: false,
    flights: 0,
    cleanLandings: 0,
    crashes: 0,
    wasCrashed: false,
    score: 0,
    cleanLandingPoints: 0,
    chargedHopPoints: 0,
    spinPoints: 0,
    oneFootPoints: 0,
    bonusPoints: 0,
    qualityAdjustment: 0,
    repeatAdjustment: 0,
    chargedHopsForfeited: 0,
    repeatedFlights: 0,
    offZoneFlights: 0,
    zoneClocks: new Map<string, ZoneClock>(),
    lastAward: null,
    lastAwardStep: -1,
  };
}

export class TrickRun {
  private readonly rules: TrickRunRules;
  private readonly revision: string;
  /** `repeatWindowSeconds` on the fixed clock. Zero disables the rule. */
  private readonly repeatWindowSteps: number;
  /** `repeatFadeSeconds` on the fixed clock. Zero resets on leaving the window. */
  private readonly repeatFadeSteps: number;
  private phaseValue: TrickRunPhase = 'idle';
  private books: Book[] = [];
  private elapsed = 0;
  private ended: TrickRunResult | null = null;

  /**
   * Invalid rules are refused at construction rather than discovered on the
   * first landing: a referee that could be built with a NaN duration would
   * be a run that never ends.
   */
  constructor(rules: TrickRunRules = SHIPPED_TRICK_RULES) {
    if (!validTrickRules(rules)) throw new Error('TrickRun: invalid rules.');
    this.rules = rules;
    this.revision = trickRulesRevision(rules);
    this.repeatWindowSteps = Math.round(rules.repeatWindowSeconds * SIMULATION.hz);
    this.repeatFadeSteps = Math.round(rules.repeatFadeSeconds * SIMULATION.hz);
  }

  get phase(): TrickRunPhase {
    return this.phaseValue;
  }

  /** The identity of the rules this referee runs — what a saved best must match. */
  get rulesRevision(): string {
    return this.revision;
  }

  get durationSteps(): number {
    return this.rules.durationSteps;
  }

  /** The run as a value. A fresh object per call, read once per drawn frame. */
  get state(): TrickRunState {
    const remaining = this.phaseValue === 'running'
      ? Math.max(0, this.rules.durationSteps - this.elapsed)
      : 0;
    return {
      phase: this.phaseValue,
      seats: this.books.length,
      durationSteps: this.rules.durationSteps,
      elapsedSteps: this.elapsed,
      remainingSteps: remaining,
      remainingSeconds: remaining / SIMULATION.hz,
      books: this.books.map((book) => this.bookState(book)),
    };
  }

  /** One seat's book as a value, or null for a seat the run does not have. */
  book(seat: number): TrickBookState | null {
    const book = this.books[seat];
    return book === undefined ? null : this.bookState(book);
  }

  /**
   * Start a run for `seats` riders. Every seat's points, observer, flight,
   * crash count, cue and the shared clock are reset — §38.3's Retry is this.
   *
   * Scoring starts on the first `step` after arming: the run is `running`
   * before the first playable fixed step, so every seat scores from the same
   * one. A seat count that is not a positive integer arms nothing.
   */
  arm(seats: number): void {
    if (!Number.isInteger(seats) || seats < 1) return;
    this.books = [];
    for (let seat = 0; seat < seats; seat += 1) this.books.push(freshBook(seat));
    this.elapsed = 0;
    this.ended = null;
    this.phaseValue = 'running';
  }

  /** Back to `idle`. Leaving the mode, the venue, the title. Nothing is filed. */
  abandon(): void {
    this.books = [];
    this.elapsed = 0;
    this.ended = null;
    this.phaseValue = 'idle';
  }

  /**
   * One seat's facts for the step about to be swept.
   *
   * Copied into the seat's own slot, so the caller's pool can be reused and
   * so nothing here holds a reference into `Game`. Recording twice in one
   * step keeps the later facts and still feeds the observer once. Ignored
   * outside `running` and for a seat the run does not have.
   *
   * `launchZone` is the feature the wheel's contact patch was on as it left
   * the ground (q189) — read only on the step `input.tookOff` is true, and
   * null everywhere off the features. The referee never computes it: the
   * composition root reads the level's zones, so this file knows no venue.
   */
  record(seat: number, input: TrickStepInput, launchZone: string | null = null): void {
    if (this.phaseValue !== 'running') return;
    const book = this.books[seat];
    if (book === undefined) return;
    book.recordedZone = launchZone;
    const slot = book.slot;
    slot.flightIndex = input.flightIndex;
    slot.tookOff = input.tookOff;
    slot.hopped = input.hopped;
    slot.hopCharge = input.hopCharge;
    slot.spinCompleted = input.spinCompleted;
    slot.oneFootQualified = input.oneFootQualified;
    slot.touchedDown = input.touchedDown;
    slot.landingQuality = input.landingQuality;
    slot.crashed = input.crashed;
    slot.reset = input.reset;
    book.recorded = true;
  }

  /**
   * One fixed step for the room: sweep every recorded seat, then the clock.
   *
   * The clock counts this step first, so a run of `durationSteps` sweeps
   * exactly that many steps. Each recorded slot is fed to its observer once
   * and banked or forfeited on the spot, in seat order; then, if this was the
   * final step, every still-open flight is discarded (it did not land inside
   * the run) and the result is frozen. Nothing banks after that: `record`
   * refuses outside `running` and this method leaves at the first line.
   */
  step(stepSeconds: number): TrickRunStep {
    if (this.phaseValue !== 'running') return QUIET_STEP;
    this.elapsed += 1;

    let awards: TrickAward[] | null = null;
    let forfeits: number[] | null = null;
    for (const book of this.books) {
      if (!book.recorded) continue;
      book.recorded = false;
      const outcome = this.sweep(book, stepSeconds);
      // Every path clears the slot: a slot that kept a touchdown would hand
      // it to the observer again if a later step recorded nothing — which is
      // the fabrication §36.6 forbids, restated for a run.
      clearTrickFacts(book.slot);
      if (outcome === null) continue;
      if (outcome === 'forfeit') (forfeits ??= []).push(book.seat);
      else (awards ??= []).push(outcome);
    }

    const ended = this.elapsed >= this.rules.durationSteps;
    if (ended) this.finish(true);

    if (!ended && awards === null && forfeits === null) return QUIET_STEP;
    return Object.freeze({
      ended,
      awards: awards === null ? NO_AWARDS : Object.freeze(awards),
      forfeits: forfeits === null ? NO_SEATS : Object.freeze(forfeits),
    });
  }

  /**
   * End the run early — §38.3's *End run* from pause. The card is explicitly
   * unfinished (`completed: false`); pending flights earn nothing. Idempotent,
   * and null while idle so a double-tap cannot mint a card from nothing.
   */
  end(): TrickRunResult | null {
    if (this.phaseValue === 'ended') return this.ended;
    if (this.phaseValue !== 'running') return null;
    this.finish(false);
    return this.ended;
  }

  /** The finished run, or null unless `phase === 'ended'`. */
  result(): TrickRunResult | null {
    return this.ended;
  }

  /**
   * One recorded slot through its observer, and the referee's decision on it.
   *
   * Returns the award banked, `'forfeit'` for a flight this run opened that
   * ended in a crash, or null when nothing changed the total. The order is
   * the observer's own anti-fabrication order restated for banking: a reset
   * is answered first and discards; identity is checked before a takeoff can
   * open; only an open flight can bank, and the touchdown closes it whatever
   * it decided.
   */
  private sweep(book: Book, stepSeconds: number): TrickAward | 'forfeit' | null {
    const facts = book.slot;
    const events = book.observer.step(stepSeconds, facts);

    // A crash is a state the rider stays in; the card counts transitions into
    // it, wherever they happen — a spill on the flat is still a crash.
    if (facts.crashed && !book.wasCrashed) book.crashes += 1;
    book.wasCrashed = facts.crashed;

    // A teleport, a quick reset or a respawn is not a step of riding: the
    // pending flight is thrown away and earns nothing, and it is **not** a
    // crash — the count above saw `crashed` false on a reset slot.
    if (facts.reset) {
      this.discard(book);
      return null;
    }

    if (book.openFlight >= 0 && facts.flightIndex !== book.openFlight) this.discard(book);

    if (facts.tookOff) {
      if (book.openFlight >= 0) this.discard(book);
      book.openFlight = facts.flightIndex;
      book.openZone = book.recordedZone;
      book.flights += 1;
      // The observer's launch credit, held against this flight's landing.
      book.pendingCharged = events.some((event) => event.kind === 'charged-hop');
    }

    // No flight this run opened: a touchdown here belongs to a flight from
    // before the clock, or to a struct that claims a landing with no takeoff
    // behind it. Either way, nothing to bank against.
    if (book.openFlight < 0) return null;

    if (facts.touchedDown) {
      const landing = facts.landingQuality;
      const survived = !facts.crashed && landing !== 'crash';
      if (!survived) return this.forfeit(book);
      if (landing !== 'clean' && landing !== 'heavy' && landing !== 'wobble') {
        // `none` on a touchdown is not a decision the controller makes; if it
        // ever arrived, no landing decision means no banking (§38.3).
        this.discard(book);
        return null;
      }
      return this.bank(book, landing, events);
    }

    // A crash taken in the air ends the flight where it is (the observer has
    // already closed it); the pending points go with it.
    if (facts.crashed) return this.forfeit(book);

    return null;
  }

  /**
   * The open flight landed and survived: decide its points, once.
   *
   * Three layers, in this order: the kinds' base values and the flight bonus
   * (only on a flight launched from a feature, q189); the landing multiplier
   * and the single rounding (§38.3) with the clean-landing award outside
   * them; then the diminishing repeat of the **feature** the flight launched
   * from (q185, per feature since 2026-09-14), taken from the whole flight so
   * the card's two adjustment rows each say exactly what they took.
   */
  private bank(
    book: Book,
    landing: BankingLanding,
    events: readonly { readonly kind: TrickEventKind }[],
  ): TrickAward | null {
    const rules = this.rules;
    const flight = book.openFlight;
    const zone = book.openZone;
    book.openFlight = -1;
    book.openZone = null;
    const onFeature = rules.featureLaunchRequired === 0 || zone !== null;

    const kinds: TrickEventKind[] = [];
    let spun = false;
    let footed = false;
    for (const event of events) {
      if (event.kind === 'spin-landed') spun = true;
      else if (event.kind === 'one-foot-air') footed = true;
    }
    if (book.pendingCharged) kinds.push('charged-hop');
    book.pendingCharged = false;
    if (spun) kinds.push('spin-landed');
    if (footed) kinds.push('one-foot-air');
    if (!onFeature && kinds.length > 0) book.offZoneFlights += 1;

    let base = 0;
    if (onFeature) {
      if (kinds.includes('charged-hop')) {
        base += rules.chargedHopPoints;
        book.chargedHopPoints += rules.chargedHopPoints;
      }
      if (spun) {
        base += rules.spinLandedPoints;
        book.spinPoints += rules.spinLandedPoints;
      }
      if (footed) {
        base += rules.oneFootAirPoints;
        book.oneFootPoints += rules.oneFootAirPoints;
      }
    }
    const bonus = onFeature && kinds.length >= rules.multiTrickMinKinds ? rules.multiTrickBonusPoints : 0;
    book.bonusPoints += bonus;

    const multiplier = landing === 'clean'
      ? rules.cleanMultiplier
      : landing === 'heavy' ? rules.heavyMultiplier : rules.wobbleMultiplier;
    // Rounded once, after the flight subtotal (§38.3). The clean-landing
    // award is outside the multiplier and outside this rounding.
    const trickPointsFull = Math.round((base + bonus) * multiplier);
    book.qualityAdjustment += trickPointsFull - (base + bonus);

    let cleanPointsFull = 0;
    if (landing === 'clean') {
      book.cleanLandings += 1;
      cleanPointsFull = rules.cleanLandingPoints;
      book.cleanLandingPoints += cleanPointsFull;
    }

    // The feature's repeat clock, read before it is moved. A flight worth
    // nothing (a heavy landing with no tricks) neither pays nor loads the
    // clock: there is nothing to dock and no attempt to remember.
    const full = trickPointsFull + cleanPointsFull;
    const clockKey = zone === null ? OFF_FEATURE_CLOCK : zoneClockKey(zone);
    const factor = full > 0 ? this.repeatFactor(book, clockKey) : 1;
    const repeated = factor < 1;
    const points = Math.round(full * factor);
    // The docking is shared across the flight's rows in the card's arithmetic
    // by one signed row; the split between tricks and landing on the award is
    // proportional, rounded so the two add to `points`.
    const trickPoints = full === 0 ? 0 : Math.round(points * (trickPointsFull / full));
    const cleanPoints = points - trickPoints;
    book.repeatAdjustment += points - full;
    if (repeated) book.repeatedFlights += 1;
    if (full > 0) this.markRepeat(book, clockKey);

    book.score += points;
    // An award is reported when it paid, when a repeat took from it, or when
    // tricks were landed off the features — every case the screen must name.
    if (points === 0 && !repeated && (onFeature || kinds.length === 0)) return null;

    const award: TrickAward = Object.freeze({
      seat: book.seat,
      flight,
      kinds: kinds.length === 0 ? NO_KINDS : Object.freeze(kinds),
      landing,
      basePoints: base,
      bonusPoints: bonus,
      multiplier,
      trickPoints,
      cleanPoints,
      points,
      repeated,
      zone,
    });
    book.lastAward = award;
    book.lastAwardStep = this.elapsed;
    return award;
  }

  /**
   * What a flight from this feature is worth right now, 0..1 — q185's
   * diminishing repeat, keyed per launch feature.
   *
   * The feature's run of repeats is read after fading (`fadedRun`); a landing
   * inside the window is one more repeat on top of it, a landing outside the
   * window pays whatever residual the fade has left. Full value only when the
   * faded run is zero and the window has passed. Reading the factor does not
   * move the clock; `markRepeat` does, after the flight is paid.
   */
  private repeatFactor(book: Book, key: string): number {
    if (this.repeatWindowSteps <= 0) return 1;
    const clock = book.zoneClocks.get(key);
    if (clock === undefined) return 1;
    const gap = this.elapsed - clock.last;
    const run = this.fadedRun(clock, gap);
    const exponent = gap <= this.repeatWindowSteps ? run + 1 : run;
    if (exponent === 0) return 1;
    return Math.max(this.rules.repeatFloor, this.rules.repeatDecay ** exponent);
  }

  /**
   * This feature paid now. Inside the window the run grows by one; outside
   * it the faded residual is kept as it is. The map is bounded: past
   * `MAX_ZONE_CLOCKS` the **least recently paid** clock is dropped, which only
   * a plan naming more zones than the park has could ever reach.
   *
   * Recency is the eviction order rather than first insertion (QA, M38): a
   * `Map` keeps insertion order and mutating a clock in place does not move
   * it, so an evicting plan would have dropped the clock of the feature being
   * camped on — the one entry the rule exists to keep — and handed the camper
   * full value back. Re-inserting on every payment makes the first key the
   * oldest *use*, so the guard against a plan that lies cannot fail open.
   */
  private markRepeat(book: Book, key: string): void {
    if (this.repeatWindowSteps <= 0) return;
    const clock = book.zoneClocks.get(key);
    if (clock === undefined) {
      if (book.zoneClocks.size >= MAX_ZONE_CLOCKS) {
        const oldest = book.zoneClocks.keys().next().value;
        if (oldest !== undefined) book.zoneClocks.delete(oldest);
      }
      book.zoneClocks.set(key, { last: this.elapsed, run: 0 });
      return;
    }
    const gap = this.elapsed - clock.last;
    const run = this.fadedRun(clock, gap);
    clock.run = gap <= this.repeatWindowSteps ? run + 1 : run;
    clock.last = this.elapsed;
    // Moved to the back of the eviction queue: this clock was just used.
    book.zoneClocks.delete(key);
    book.zoneClocks.set(key, clock);
  }

  /**
   * The feature's run of repeats after `gap` steps of rest: one level
   * forgotten per `repeatFadeSteps`, or — with no fade configured —
   * everything forgotten once the window has passed.
   */
  private fadedRun(clock: ZoneClock, gap: number): number {
    if (this.repeatFadeSteps <= 0) return gap <= this.repeatWindowSteps ? clock.run : 0;
    return Math.max(0, clock.run - Math.floor(gap / this.repeatFadeSteps));
  }


  /** The open flight ended in a crash: its pending bundle is lost, banked points are not. */
  private forfeit(book: Book): 'forfeit' {
    this.discard(book);
    return 'forfeit';
  }

  /** Close the open flight earning nothing. A counted launch that never banked is said so. */
  private discard(book: Book): void {
    if (book.openFlight < 0) return;
    if (book.pendingCharged) book.chargedHopsForfeited += 1;
    book.pendingCharged = false;
    book.openFlight = -1;
    book.openZone = null;
  }

  /** Freeze the card. Open flights did not land inside the run and earn nothing. */
  private finish(completed: boolean): void {
    for (const book of this.books) {
      this.discard(book);
      book.observer.discardFlight();
      book.recorded = false;
      book.recordedZone = null;
      clearTrickFacts(book.slot);
    }
    this.phaseValue = 'ended';
    this.ended = Object.freeze({
      rulesRevision: this.revision,
      durationSteps: this.rules.durationSteps,
      elapsedSteps: this.elapsed,
      completed,
      seats: this.books.length,
      books: Object.freeze(this.books.map((book) => this.bookState(book))),
    });
  }

  private bookState(book: Book): TrickBookState {
    const tally = book.observer.tally;
    const pendingShown = book.openFlight >= 0 && book.pendingCharged
      && (this.rules.featureLaunchRequired === 0 || book.openZone !== null);
    const tricks: TrickTally = book.cleanLandings === 0 && tally === NO_TRICKS
      ? NO_TRICKS
      : Object.freeze({ ...tally, cleanLandings: book.cleanLandings });
    return Object.freeze({
      seat: book.seat,
      score: book.score,
      tally: tricks,
      crashes: book.crashes,
      flights: book.flights,
      flightOpen: book.openFlight >= 0,
      // A charged hop is pending only where it could bank: with the gate on,
      // a flight launched off the features promises nothing (q189).
      pending: pendingShown ? PENDING_CHARGED : NO_KINDS,
      pendingPoints: pendingShown ? this.rules.chargedHopPoints : 0,
      lastAward: book.lastAward,
      lastAwardStep: book.lastAwardStep,
      openZone: book.openFlight >= 0 ? book.openZone : null,
      breakdown: Object.freeze({
        cleanLandingPoints: book.cleanLandingPoints,
        chargedHopPoints: book.chargedHopPoints,
        spinPoints: book.spinPoints,
        oneFootPoints: book.oneFootPoints,
        bonusPoints: book.bonusPoints,
        qualityAdjustment: book.qualityAdjustment,
        repeatAdjustment: book.repeatAdjustment,
        total: book.score,
        chargedHopsForfeited: book.chargedHopsForfeited,
        repeatedFlights: book.repeatedFlights,
        offZoneFlights: book.offZoneFlights,
      }),
    });
  }
}
