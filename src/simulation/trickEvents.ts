/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { TRICKS } from '../data/tuning.ts';
import type { LandingQuality } from './EucController.ts';

/**
 * What the rider actually landed — M36 §36.6, and nothing more than that.
 *
 * **An observer, not a referee and not a scorer.** `trackDay.ts` and
 * `raceRun.ts` decide whether a lap counted; this decides whether a trick
 * happened, and it deliberately cannot decide anything else: it has no clock
 * of its own, no venue, no seat identity, no options and no points. Hand it
 * one plain struct per fixed step per rider and it answers with the events
 * that produced. §36.6's own words for what it must never grow: no unbounded
 * event log, no analytics, no persistence key, no progression hook.
 *
 * ## Why the facts arrive as a struct rather than as a controller
 *
 * Because two of them are not the controller's. The one-foot air is the
 * *pose's* qualification (§36.5, `app/oneFootPose.ts`) and lives a layer up,
 * and the reset flag is the composition root's — a rider is put somewhere by
 * `Game`, never by the wheel. A class that reached for `EucController` would
 * therefore still need both handed to it, and would have bought a dependency
 * for nothing. The struct is also the whole of the test surface: every rule
 * below is provable by feeding steps, including the ones no ride can produce.
 *
 * ## Flight identity, and why every credit hangs off it
 *
 * A flight opens on the controller's **takeoff edge** and carries the
 * controller's `flightIndex` as its name. Nothing is credited without an open
 * flight, which is the single mechanism behind §36.6's hardest requirement:
 * *a reset, a respawn or a teleport cannot look like a launch, a landing or a
 * completion.* A teleport raises no takeoff edge, so it opens nothing; the
 * pending flight it interrupts is discarded and earns nothing; and a fact
 * struct that claims a hop or a completion with no takeoff behind it is
 * ignored rather than believed.
 *
 * The name is checked as well as taken. If the facts ever arrive carrying a
 * different `flightIndex` from the open flight's, the open flight is
 * discarded before anything else is read — a landing cannot be credited from
 * facts that belong to a flight it did not fly.
 *
 * ## The four events, and the one that is not counted here
 *
 * | Event | Credited |
 * |---|---|
 * | Charged hop | once, on the launch edge of a **hop** (never a ledge drop), when the charge that launch captured was full |
 * | 180 landed | once per flight, at touchdown, when the spin owner said the sweep **completed** in that flight and the flight did not end in a crash |
 * | One-foot air | once per flight, at touchdown, when the pose reached its measured qualification in that flight and the flight did not end in a crash |
 * | Clean landing | **not here.** §36.6: reuse the existing count rather than counting the same touchdown in two places. `tally.cleanLandings` is always zero and the owner fills it in |
 *
 * A spin and a one-foot may both be credited on one flight, because they are
 * different events; neither is credited twice while its fact stays true, and
 * a released-and-re-held pose is still one flight's one air.
 *
 * Determinism is a hard requirement, as it is in both referees: no `Date`, no
 * `Math.random`, no wall clock. The only clock is the fixed step handed in,
 * and it is spent on a diagnostic rather than on a rule.
 */

/** The three events §36.6 counts. `clean-landing` is deliberately absent. */
export type TrickEventKind = 'charged-hop' | 'spin-landed' | 'one-foot-air';

/** One credit, as it happened. Facts, never sentences and never points. */
export interface TrickEvent {
  readonly kind: TrickEventKind;
  /** The flight it belongs to — the controller's `flightIndex`. */
  readonly flight: number;
}

/**
 * One fixed step's worth of one rider, as the composition root reads it.
 *
 * Every field is a plain scalar and every one of them is somebody else's
 * fact: the first seven come from `EucController`'s single-step getters,
 * `oneFootQualified` from `app/oneFootPose.ts`, and `reset` from `Game`'s own
 * seat loop. Nothing here is derived twice.
 */
export interface TrickStepInput {
  /**
   * The controller's flight identity — `+1` at every takeoff and never reset,
   * which is exactly why neither `hops` nor `landings` could be used for it.
   */
  readonly flightIndex: number;
  /** True on the single step the wheel left the ground, hop or ledge alike. */
  readonly tookOff: boolean;
  /**
   * True on the single step a **hop** launched.
   *
   * The narrower of the two edges, and the charged hop's whole gate: riding
   * off a ledge raises `tookOff` and not this.
   */
  readonly hopped: boolean;
  /**
   * The crouch charge that launch spent, 0..1.
   *
   * **Read only when `hopped`.** `EucController.lastHopCharge` survives its
   * launch and is cleared only by a reset, a crash or a respawn, so on a
   * ledge launch it is a stale number from a hop taken a hundred metres back.
   */
  readonly hopCharge: number;
  /** The spin owner's explicit completion fact: the sweep reached zero. */
  readonly spinCompleted: boolean;
  /** The pose reached its measured visible qualification in this flight. */
  readonly oneFootQualified: boolean;
  /** True on the single step the wheel touched down. */
  readonly touchedDown: boolean;
  /** The controller's own verdict on that touchdown. Only read when `touchedDown`. */
  readonly landingQuality: LandingQuality;
  /** True for every step the rider is down, not just the first. */
  readonly crashed: boolean;
  /** True on any step this rider was *put* somewhere: `R`, a respawn, a teleport. */
  readonly reset: boolean;
}

/** The counted events. Four numbers, no total, and nothing called a score. */
export interface TrickTally {
  /**
   * **Always zero from an observer** — §36.6's one-place rule. The owner
   * (`TrackDayRun`, a race's `RiderBook`) counts touchdowns already and fills
   * this in from its own count when it publishes a tally.
   */
  readonly cleanLandings: number;
  readonly chargedHops: number;
  readonly spinsLanded: number;
  readonly oneFootAirs: number;
}

/** A tally that has counted nothing. Shared and frozen; it is the common case. */
export const NO_TRICKS: TrickTally = Object.freeze({
  cleanLandings: 0,
  chargedHops: 0,
  spinsLanded: 0,
  oneFootAirs: 0,
});

/**
 * The last flight, as it finished — §36.6's bounded diagnostics.
 *
 * It retains the charge, the air, the completed spin, the qualification, the
 * landing tier and why the flight ended, and it **awards nothing**: a partial
 * charge is readable here and is not a charged hop, a crashed 180 is readable
 * here and is not a landed one. One flight is kept, never a log.
 */
export interface TrickFlight {
  readonly id: number;
  /** The charge a hop launch captured, or zero for a ledge launch. */
  readonly charge: number;
  readonly airSeconds: number;
  readonly spinCompleted: boolean;
  readonly oneFoot: boolean;
  readonly landing: LandingQuality;
  /** `discarded` is the reset/respawn/teleport, which credits nothing. */
  readonly ended: 'landed' | 'crashed' | 'discarded';
}

/** Shared and frozen: the overwhelming majority of steps credit nothing. */
const NO_EVENTS: readonly TrickEvent[] = Object.freeze([]);

/**
 * A mutable `TrickStepInput`, for a caller that keeps one slot per seat.
 *
 * `app/Game.ts` writes these 120 times a second for as long as anybody is
 * riding, so the struct is filled in place exactly as the race's own input
 * pool is.
 */
export type TrickFacts = { -readonly [K in keyof TrickStepInput]: TrickStepInput[K] };

/** A slot that says nothing happened. */
export function createTrickFacts(): TrickFacts {
  return {
    flightIndex: 0,
    tookOff: false,
    hopped: false,
    hopCharge: 0,
    spinCompleted: false,
    oneFootQualified: false,
    touchedDown: false,
    landingQuality: 'none',
    crashed: false,
    reset: false,
  };
}

/**
 * Put a slot back to "nothing happened", keeping the flight it names.
 *
 * The reset path's writer. A seat that teleports integrates no step, so
 * without this its slot would still be holding the previous step's edges —
 * and a stale touchdown handed to an observer on the step after a respawn is
 * precisely the fabrication §36.6 forbids.
 */
export function clearTrickFacts(facts: TrickFacts): void {
  facts.tookOff = false;
  facts.hopped = false;
  facts.hopCharge = 0;
  facts.spinCompleted = false;
  facts.oneFootQualified = false;
  facts.touchedDown = false;
  facts.landingQuality = 'none';
  facts.crashed = false;
  facts.reset = false;
}

/**
 * One rider's trick events, accumulated.
 *
 * Owned by whoever owns the session the events belong to — `TrackDayRun` has
 * one for its afternoon, a race's `RiderBook` has one each — so the lifecycle
 * rules (what a quick reset keeps, what a new session clears, what a pause
 * freezes) are written once, where they already are, rather than duplicated
 * here under different names.
 */
export class TrickObserver {
  private open = false;
  private id = -1;
  private charge = 0;
  private airSeconds = 0;
  private spun = false;
  private footed = false;

  private chargedHops = 0;
  private spinsLanded = 0;
  private oneFootAirs = 0;

  private last: TrickFlight | null = null;

  /** Whether a flight is in the air right now. Nothing can be credited without one. */
  get flightOpen(): boolean {
    return this.open;
  }

  /**
   * The counted events, as a value. `cleanLandings` is always zero — see
   * `TrickTally`. A fresh object per call; read once a frame, never in the
   * step.
   */
  get tally(): TrickTally {
    if (this.chargedHops === 0 && this.spinsLanded === 0 && this.oneFootAirs === 0) {
      return NO_TRICKS;
    }
    return {
      cleanLandings: 0,
      chargedHops: this.chargedHops,
      spinsLanded: this.spinsLanded,
      oneFootAirs: this.oneFootAirs,
    };
  }

  /** The last flight that ended, or null. Diagnostics; it awards nothing. */
  get lastFlight(): TrickFlight | null {
    return this.last;
  }

  /**
   * One fixed step.
   *
   * The order below is the whole of the anti-fabrication argument and is
   * worth reading as one: a reset is answered *first* and returns, so a step
   * that teleported a rider can never also launch, complete or land one; the
   * flight's name is checked next; only then can a takeoff open a flight, and
   * only an open flight can latch a fact or bank a credit.
   */
  step(stepSeconds: number, input: TrickStepInput): readonly TrickEvent[] {
    // **A teleport is not a step of riding.** Everything else on the struct is
    // ignored on this step rather than weighed against the flag, because the
    // alternative is a rule that says which fabrications are allowed.
    if (input.reset) {
      this.discardFlight();
      return NO_EVENTS;
    }

    // Facts from another flight cannot land this one. Unreachable while the
    // caller feeds one rider once a step, which is exactly why it is cheap to
    // be certain of.
    if (this.open && input.flightIndex !== this.id) this.discardFlight();

    let events: TrickEvent[] | null = null;

    if (input.tookOff) {
      // A flight still open at a takeoff never landed — it was interrupted by
      // something the observer was not told about. It earns nothing.
      if (this.open) this.discardFlight();
      this.open = true;
      this.id = input.flightIndex;
      this.charge = input.hopped ? input.hopCharge : 0;
      this.airSeconds = 0;
      this.spun = false;
      this.footed = false;
      // **The charged hop is banked at the launch, not at the landing.** It is
      // a thing the rider did with the crouch, and a rider who charges a hop
      // fully and then bins the landing charged it fully. The full-charge
      // test is `TRICKS.chargedHopMinCharge`, and a partial charge is kept on
      // the flight diagnostic instead of being rounded up (§36.6).
      if (input.hopped && input.hopCharge >= TRICKS.chargedHopMinCharge) {
        this.chargedHops += 1;
        events = [{ kind: 'charged-hop', flight: this.id }];
      }
    }

    if (!this.open) return events ?? NO_EVENTS;

    this.airSeconds += Math.max(0, stepSeconds);
    // Latched rather than read at the touchdown, because neither fact is
    // guaranteed to survive to it: a completion is a fact about a sweep that
    // finished somewhere in the middle of the flight, and a qualification is a
    // fact about a pose that may have been released and re-held since.
    if (input.spinCompleted) this.spun = true;
    if (input.oneFootQualified) this.footed = true;

    if (input.touchedDown) {
      // **One test for "the flight ended without a crash", from two facts.**
      // The tier is the controller's verdict on the touchdown and the level is
      // whether the rider is down; a landing scored `crash` and a rider who
      // was already crashing are the same answer to a player.
      const survived = !input.crashed && input.landingQuality !== 'crash';
      if (survived && this.spun) {
        this.spinsLanded += 1;
        (events ??= []).push({ kind: 'spin-landed', flight: this.id });
      }
      if (survived && this.footed) {
        this.oneFootAirs += 1;
        (events ??= []).push({ kind: 'one-foot-air', flight: this.id });
      }
      this.close(input.landingQuality, survived ? 'landed' : 'crashed');
      return events ?? NO_EVENTS;
    }

    // A crash taken in the air ends the flight where it is. The controller
    // stops stepping while it is crashing, so no touchdown is coming.
    if (input.crashed) this.close('crash', 'crashed');

    return events ?? NO_EVENTS;
  }

  /**
   * The pending flight is thrown away, earning nothing. Totals survive.
   *
   * §36.6's quick reset, respawn and teleport, and the door the session
   * lifecycles reach for: `TrackDayRun.restart` keeps the afternoon and loses
   * the flight, exactly as it keeps the best lap and loses the lap.
   */
  discardFlight(): void {
    if (!this.open) return;
    this.close('none', 'discarded');
  }

  /** Everything a new session, venue, mode or seat must not inherit. */
  clear(): void {
    this.open = false;
    this.id = -1;
    this.charge = 0;
    this.airSeconds = 0;
    this.spun = false;
    this.footed = false;
    this.chargedHops = 0;
    this.spinsLanded = 0;
    this.oneFootAirs = 0;
    this.last = null;
  }

  private close(landing: LandingQuality, ended: TrickFlight['ended']): void {
    this.last = Object.freeze({
      id: this.id,
      charge: this.charge,
      airSeconds: this.airSeconds,
      spinCompleted: this.spun,
      oneFoot: this.footed,
      landing,
      ended,
    });
    this.open = false;
  }
}
