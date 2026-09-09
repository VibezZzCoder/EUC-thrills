/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHASE } from '../data/tuning.ts';

/**
 * The chase's referee — M18 Phase 3.
 *
 * `simulation/challenge.ts`'s counterpart, and built to the same shape for the
 * same reason: **the rules of a mode are arithmetic over a few numbers, and
 * arithmetic belongs where `node --test` can reach it.** Nothing here knows
 * about a renderer, a menu, a HUD or a cop — it is handed four facts per step
 * and answers with a state. `app/Game.ts` decides what the state *means* on
 * screen.
 *
 * Nothing here may import three.js (invariant 1), and nothing here is a player
 * option (invariant 5).
 *
 * ## The four ways a chase ends, and why they are these four
 *
 * **You survive the clock** (§13 q24, the owner's answer). Five minutes, the
 * same on every seed, which is what makes one player's escape comparable with
 * another's. There is no finish line anywhere in this mode, and the route
 * running out under the rider is deliberately *not* an ending.
 *
 * **You crash with the cop on you** (§13 q25, the owner accepting the
 * recommendation). The strike itself is pressure rather than a tag: it lands as
 * the M14 body-knock wobble, and a wobble is something a rider can ride out.
 * What ends the run is the crash that follows one — and only while he is close
 * enough for it to be his doing. A crash alone, on an empty road, costs the
 * recovery and nothing else, exactly as it does in free ride.
 *
 * **You touch him** (M24, Dario's twice-asked and publicly promised "the
 * police should arrest you if you touch the police officer"). Rider-initiated
 * contact is an immediate bust. The attribution is the whole rule: the touch
 * counts only while the *rider* is closing at least `touchBustClosingSpeed`,
 * so the cop gains no new way to score by ramming — a cop who overruns a
 * fleeing, stationary, or passing rider meets no rider-side closing and
 * passes straight through, exactly as before. This deliberately ends the
 * §4.2 head-on ram as a bust: running at him was already answered once with
 * the led swing, and now the body itself answers it.
 *
 * **You leave** (§13 q27, the owner's "not cheatable by going far off road").
 * Riding into the surround and holding throttle for five minutes would beat the
 * mode without riding it, so distance from the route starts a warning and the
 * warning runs out. It is a boundary on *this mode* and nowhere else: go-
 * anywhere is LOCKED and the rest of the game has no edge at all.
 *
 * The stray clock resets the moment the rider is back inside the corridor,
 * which is what makes running wide onto a verge free and camping out there
 * fatal — the difference the owner actually asked for.
 */

export type ChasePhase = 'idle' | 'running' | 'escaped' | 'busted';

/** How soon a refused regroup is demanded again, seconds. */
const TRACKER_RETRY_SECONDS = 2;
/**
 * How far inside the quiet line the cop must come for the quiet clock to
 * reset, metres — the line's hysteresis, on its reset rather than its start
 * (Codex's M31 QA). Inside the return distance's reach by construction, so
 * an accepted regroup always resets it: the return is 50 m and the line 60.
 */
const QUIET_RESET_METRES = 5;

/** What ended a chase. `none` while it is still running or has not started. */
export type ChaseOutcome = 'none' | 'escaped' | 'caught' | 'strayed' | 'touched';

export interface ChaseState {
  readonly phase: ChasePhase;
  /** Seconds left on the clock. Counts down; the number the HUD shows. */
  readonly remaining: number;
  /** Seconds survived so far. The thing a personal best is made of. */
  readonly survived: number;
  readonly outcome: ChaseOutcome;
  /** True while the rider is outside the corridor and the warning is running. */
  readonly straying: boolean;
  /** Seconds of grace left before straying ends the run. Full when inside. */
  readonly strayGrace: number;
  /** Seconds the gap has sat beyond the quiet line — the free-riding clock. */
  readonly quiet: number;
  /** Seconds of regroup respite left after the cop's last crash. */
  readonly respite: number;
}

/** What the referee is told each step. Plain numbers; it asks for nothing. */
export interface ChaseInput {
  /** How far the rider is from the route spine, metres. */
  readonly offRoute: number;
  /** How far the cop is from the rider, metres. */
  readonly copDistance: number;
  /** Whether the rider is crashed right now. */
  readonly crashed: boolean;
  /**
   * How fast the rider's own motion is closing the gap, m/s — M24.
   *
   * The rider's contribution alone, positive when approaching, and capped by
   * the caller at the rider's own physical speed so a respawn or reset step
   * can never manufacture a ram. Zero when absent-minded callers (tests for
   * the other three endings) have nothing to say about touching.
   */
  readonly riderClosingSpeed?: number;
  /**
   * Whether the cop is crashed right now. A rider riding over a ragdolled
   * officer is not an arrest — there is nobody standing to make one.
   */
  readonly copCrashed?: boolean;
  /**
   * The cop's own speed, m/s, unsigned — the stall clock's whole input (the
   * chase pass). Absent-minded callers leave it out and the clock never runs.
   */
  readonly copSpeed?: number;
}

export class ChaseRun {
  // -- Live tuning, on the pattern every other simulation object uses ---------
  escapeSeconds: number = CHASE.escapeSeconds;
  bustRadiusMetres: number = CHASE.bustRadiusMetres;
  touchBustMetres: number = CHASE.touchBustMetres;
  touchBustClosingSpeed: number = CHASE.touchBustClosingSpeed;
  strayLimitMetres: number = CHASE.strayLimitMetres;
  strayGraceSeconds: number = CHASE.strayGraceSeconds;
  trackerGapMetres: number = CHASE.trackerGapMetres;
  trackerHoldSeconds: number = CHASE.trackerHoldSeconds;
  trackerQuietGapMetres: number = CHASE.trackerQuietGapMetres;
  trackerQuietSeconds: number = CHASE.trackerQuietSeconds;
  trackerRespiteSeconds: number = CHASE.trackerRespiteSeconds;
  trackerStallSeconds: number = CHASE.trackerStallSeconds;
  trackerStallSpeed: number = CHASE.trackerStallSpeed;
  trackerStallGapMetres: number = CHASE.trackerStallGapMetres;

  private phaseValue: ChasePhase = 'idle';
  // Annotated rather than inferred, for the reason every live-tuned field in
  // `simulation/` is: the tuning table is `as const`, so an inferred field
  // would take the *literal* type of today's default and refuse every other
  // value — including the zero this counts down to.
  private remainingSeconds: number = CHASE.escapeSeconds;
  private outcomeValue: ChaseOutcome = 'none';
  private strayedFor = 0;
  /** Seconds the gap has continuously sat beyond the tracker line. */
  private trackedFor = 0;
  /** Seconds the gap has continuously sat beyond the quiet line. */
  private quietFor = 0;
  /** Seconds the cop has continuously gone nowhere, well away from the rider. */
  private stalledFor = 0;
  /** Seconds of respite left since the cop last stood up from a crash. */
  private respiteLeft = 0;
  /** Was the cop crashed on the previous step? The respite arms on his rising. */
  private copWasCrashed = false;
  /** A regroup the referee has decided on and nobody has consumed yet. */
  private trackerDemand = false;
  /**
   * Was the rider crashed on the previous step?
   *
   * The bust is an **edge**, not a level. A crash lasts until the controller
   * respawns the rider a few seconds later, so a level test would re-decide the
   * same crash on every one of those steps — harmless while the answer is the
   * same, and wrong the moment the cop rides past the fallen rider and the
   * distance changes underneath a run that has already ended.
   */
  private wasCrashed = false;

  get state(): ChaseState {
    return {
      phase: this.phaseValue,
      remaining: Math.max(0, this.remainingSeconds),
      survived: Math.max(0, this.escapeSeconds - Math.max(0, this.remainingSeconds)),
      outcome: this.outcomeValue,
      straying: this.strayedFor > 0,
      strayGrace: Math.max(0, this.strayGraceSeconds - this.strayedFor),
      quiet: this.quietFor,
      respite: this.respiteLeft,
    };
  }

  /** Start a run. The clock is full and nothing has happened yet. */
  arm(): void {
    this.phaseValue = 'running';
    this.remainingSeconds = this.escapeSeconds;
    this.outcomeValue = 'none';
    this.strayedFor = 0;
    this.trackedFor = 0;
    this.quietFor = 0;
    this.stalledFor = 0;
    this.respiteLeft = 0;
    this.copWasCrashed = false;
    this.trackerDemand = false;
    this.wasCrashed = false;
  }

  /** Abandon a run in progress — a quit, or a world swapped underneath it. */
  abandon(): void {
    this.phaseValue = 'idle';
    this.remainingSeconds = this.escapeSeconds;
    this.outcomeValue = 'none';
    this.strayedFor = 0;
    this.trackedFor = 0;
    this.quietFor = 0;
    this.stalledFor = 0;
    this.respiteLeft = 0;
    this.copWasCrashed = false;
    this.trackerDemand = false;
    this.wasCrashed = false;
  }

  /**
   * One fixed step. Returns true on the step the run ends.
   *
   * Order matters and is stated rather than incidental: **the clock is spent
   * first**, so a rider who reaches zero on the same step they crash has
   * escaped. That is the generous reading and it is the right one — the run was
   * over before the crash, and losing on the last step to something that
   * happened after the whistle is the kind of unfairness §18.6 says is removed
   * rather than tuned.
   */
  step(dt: number, input: ChaseInput): boolean {
    if (this.phaseValue !== 'running') return false;

    this.remainingSeconds -= Math.max(0, dt);
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = 0;
      this.phaseValue = 'escaped';
      this.outcomeValue = 'escaped';
      return true;
    }

    // The bust: a crash, on its first step, with the cop close enough for it to
    // be his doing.
    const crashed = input.crashed;
    const justCrashed = crashed && !this.wasCrashed;
    this.wasCrashed = crashed;
    if (justCrashed && input.copDistance <= this.bustRadiusMetres) {
      this.phaseValue = 'busted';
      this.outcomeValue = 'caught';
      return true;
    }

    // The touch — M24. A **level**, not an edge, because contact is not a
    // one-step event the way a crash's first step is: the attribution gates
    // make repeated answers identical while the answer is "no", and the first
    // "yes" ends the run. Two clauses, both load-bearing:
    //   - not while either rider is down (a ragdoll sliding into him is not a
    //     ram, and a ragdolled officer arrests nobody);
    //   - the rider must be closing at ram pace, and that clause alone is the
    //     no-scoring-by-ramming promise: only the rider's own stick can put
    //     ram-pace closing on the rider — a standing rider shows zero, a
    //     fleeing rider shows negative, and a rider *passing* him shows a
    //     radial rate that falls to zero exactly at the closest approach, so
    //     the cop steering into any of them scores nothing.
    // The cop's own closing rate is deliberately NOT compared against the
    // rider's. Requiring the rider to out-close him would decide every mutual
    // head-on by who happened to be faster — and a pursuing cop is always
    // faster than, say, a reversing rider, which would quietly delete the
    // exact ram this rule was promised for. Riding into him is the offence;
    // how fast he was coming the other way is not a defence.
    if (!crashed && input.copCrashed !== true
      && input.copDistance <= this.touchBustMetres
      && (input.riderClosingSpeed ?? 0) >= this.touchBustClosingSpeed) {
      this.phaseValue = 'busted';
      this.outcomeValue = 'touched';
      return true;
    }

    // The boundary. Reset rather than decayed: coming back inside gives the
    // whole grace back, so a rider who overshoots a corner twice in a minute is
    // never punished for the first one.
    if (input.offRoute > this.strayLimitMetres) {
      this.strayedFor += Math.max(0, dt);
      if (this.strayedFor >= this.strayGraceSeconds) {
        this.phaseValue = 'busted';
        this.outcomeValue = 'strayed';
        return true;
      }
    } else {
      this.strayedFor = 0;
    }

    // The super tracker's clocks — M20.2, the owner's "the mode is about the
    // tension, not freeriding", and the chase pass's pressure director
    // (`data/tuning.ts`, `trackerQuietGapMetres`). Arithmetic only: this
    // referee decides *when*, and `app/Game.ts` decides what a regroup *is*.
    //
    // Three clocks, any of which demands: the gap blown out beyond the
    // tracker line for the hold (M20.2); the gap sat beyond the *quiet* line
    // — the siren's far edge — for the quiet seconds, which is the
    // free-riding clock; and the cop going nowhere for the stall seconds
    // while well away from the rider, which is a cop stuck on something the
    // gap rule cannot see. Each resets the moment its condition lifts, so a
    // rider who flirts with a line is never punished for the first approach.
    // A crashed rider accumulates nothing — regrouping the cop onto somebody
    // who is down would hand the bust radius a rider who cannot ride.
    //
    // **And a crash the rider led him into buys a respite.** While the cop is
    // down and for `trackerRespiteSeconds` after he stands up, every clock is
    // held at zero: the crash itself plus the respite is the breathing room a
    // clever line earns, and it is what keeps the tracker from erasing every
    // success with a teleport.
    const step = Math.max(0, dt);
    const copCrashed = input.copCrashed === true;
    if (this.copWasCrashed && !copCrashed) this.respiteLeft = this.trackerRespiteSeconds;
    this.copWasCrashed = copCrashed;
    this.respiteLeft = Math.max(0, this.respiteLeft - step);
    const held = crashed || copCrashed || this.respiteLeft > 0;

    if (!held && input.copDistance > this.trackerGapMetres) {
      this.trackedFor += step;
    } else {
      this.trackedFor = 0;
    }
    // **The quiet line's hysteresis is on its reset, not its start** (Codex's
    // M31 QA). The line is the siren's far edge exactly, so a cop beyond it is
    // one the player cannot hear; a cop a few metres inside it is at a few
    // per cent of point-blank, which is not the siren coming back, so the
    // clock *holds* there rather than resetting — a cop hovering across the
    // line never resets it, and the band the first cut left between the
    // siren's edge and the quiet line (60 to 70 m, where a cop could sit
    // unheard for ever) is gone. Properly back in earshot, `QUIET_RESET_METRES`
    // inside the line, gives the whole clock back.
    if (held || input.copDistance <= this.trackerQuietGapMetres - QUIET_RESET_METRES) {
      this.quietFor = 0;
    } else if (input.copDistance > this.trackerQuietGapMetres) {
      this.quietFor += step;
    }
    if (!held && input.copSpeed !== undefined
      && Math.abs(input.copSpeed) < this.trackerStallSpeed
      && input.copDistance > this.trackerStallGapMetres) {
      this.stalledFor += step;
    } else {
      this.stalledFor = 0;
    }

    // A demand the composition root could not act on — a candidate refused
    // for a clamped route end or a folded route — is asked again after
    // `TRACKER_RETRY_SECONDS` rather than after a whole hold: the clocks are
    // wound back by the retry, not to zero. An accepted regroup closes the
    // gap and every clock resets on its own.
    if (this.trackedFor >= this.trackerHoldSeconds
      || this.quietFor >= this.trackerQuietSeconds
      || this.stalledFor >= this.trackerStallSeconds) {
      this.trackedFor = Math.max(0, Math.min(this.trackedFor, this.trackerHoldSeconds) - TRACKER_RETRY_SECONDS);
      this.quietFor = Math.max(0, Math.min(this.quietFor, this.trackerQuietSeconds) - TRACKER_RETRY_SECONDS);
      this.stalledFor = Math.max(0, Math.min(this.stalledFor, this.trackerStallSeconds) - TRACKER_RETRY_SECONDS);
      this.trackerDemand = true;
    }

    return false;
  }

  /**
   * Consume the pending regroup demand, if the step above raised one.
   *
   * Edge-triggered and consumed on read, like the crash edge: the demand is an
   * instruction to act once, and a level would re-relocate the cop on every
   * step of a gap that stays weird for a frame or two after the move. If the
   * caller cannot act on it (the cop is mid-crash, say), dropping it is safe —
   * the timer starts again from zero and demands again one hold later.
   */
  takeTrackerDemand(): boolean {
    const demanded = this.trackerDemand;
    this.trackerDemand = false;
    return demanded;
  }
}
