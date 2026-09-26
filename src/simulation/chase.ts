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
 *
 * ## One referee for the whole room — M39 Part P (§39.6b.3, §39.6b.3b)
 *
 * `ChaseRoom` below is the same four endings written once for **N outlaws
 * and M pursuers** (M27's rule: an N-way surface is born at its real N). The
 * cop slot is either a CPU pack — Officer Dorkins as the `tail` plus
 * `patrol`s, `roomSize − outlaws` of them (q207) — or one human cop with no
 * director at all. The solo face is the one-outlaw case of the same referee,
 * and `ChaseRun` survives as its thin one-outlaw, one-cop wrapper (A-2 in
 * `docs/M39_CHASE.md`) so every shipped case in `chase.test.ts` still pins
 * the solo chase byte for byte.
 *
 * The room keeps the shape of the pure referees it sits beside
 * (`raceRun.ts`, `knockaboutMatch.ts`): it is handed one pose set's facts
 * after every seat and every pursuer has stepped, it detects nothing, and
 * each step runs **record → decide → deal/demand**. It never learns what a
 * post, a camera or a brain is; `copPack.ts` and `app/Game.ts` do.
 */

export type ChasePhase = 'idle' | 'running' | 'escaped' | 'busted';

/**
 * How soon a refused regroup is demanded again, seconds. One since the
 * brutal pass (2 before it): a refused return is a spot that failed a
 * judge, a pane or a fold *this* step, and the rider has moved on a
 * wheel's length of road by the next — two seconds of it was silence
 * given away for nothing.
 */
const TRACKER_RETRY_SECONDS = 1;
/**
 * How long after a patrol was sent ahead of an outlaw (`intercept`) the
 * quiet clock may send him again, seconds — the brutal pass. A roadblock is
 * placed out of view on the rider's line; moving it again before he could
 * reach it would be a cop hopping about unseen, not a roadblock.
 */
const INTERCEPT_HOLD_SECONDS = 10;
/**
 * How far inside the quiet line the cop must come for the quiet clock to
 * reset, metres — the line's hysteresis, on its reset rather than its start
 * (Codex's M31 QA). Inside the return distance's reach by construction, so
 * an accepted regroup always resets it: the return is 50 m and the line 60.
 */
const QUIET_RESET_METRES = 5;
/**
 * How long a landed swing keeps its claim on the crash that follows it,
 * seconds (A-7, §39.6b.3b "caught names the striker"). A hard knock crashes
 * on the strike's own step; a soft knock's wobble can take a few dozen steps
 * to put him down. Both belong to the swing's owner — q222's "who busted
 * them" — and a second is longer than any knock's wobble takes to land while
 * far shorter than a cop's `swingCooldownSeconds` plus a fresh approach, so
 * the credit can never outlive the swing it came from. A rule-shape window,
 * not a tunable (rule 1 of the contract).
 */
const STRIKE_CREDIT_SECONDS = 1.0;
/**
 * How much ground a waking patrol may lose on the best range he has reached
 * since his wake or deal before his gap clock runs anyway, metres (A-4). A
 * patrol woken 800 m away must be allowed to ride in — without this hold the
 * gap clock would post-return him three seconds after every wake and the
 * director's second siren would never arrive — but a patrol who cannot close
 * at all must not ride for ever either.
 */
const WAKE_SLACK_METRES = 20;

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

// ---------------------------------------------------------------------------
// The room's vocabulary — docs/M39_CHASE.md §2a.1
// ---------------------------------------------------------------------------

/**
 * An outlaw's standing in the room. `gaveUp` is his own R in a couch chase
 * (q225): a teleport out from under a cop is the one escape the mode cannot
 * allow, so it is his bust, credited to nobody.
 */
export type OutlawStatus = 'standing' | 'caught' | 'touched' | 'strayed' | 'escaped' | 'gaveUp';
export type PursuerKind = 'cpu' | 'human';
/** Where a pursuer begins and returns (§39.6b.3). A human pursuer is spec'd as 'tail': he takes the tail's place at the start and has no director. */
export type PursuerRole = 'tail' | 'patrol';
/** F3 and the bench. 'waking' = a woken patrol not yet engaged (A-4). A human pursuer reads 'chasing'. */
export type PursuerPhase = 'parked' | 'waking' | 'chasing';
export type ChaseDemandKind = 'tail-return' | 'patrol-wake' | 'post-return' | 'intercept' | 're-deal';
export type ChaseDemandCause = 'proximity' | 'quiet' | 'gap' | 'stall' | 'deal' | 'idle';
export type ChaseRoomPhase = 'idle' | 'countdown' | 'running' | 'ended';

export interface ChaseRoomSpec {
  /** Human outlaws, 1..CHASE.roomSize − 1. Outlaw index k is NOT a seat index; Game keeps the map. */
  readonly outlaws: number;
  /**
   * The cop slot. CPU: 1..(roomSize − outlaws) entries, pursuer 0 the tail and the rest
   * patrols. Human: exactly one entry { kind: 'human', role: 'tail' }. `arm` throws on anything else.
   */
  readonly pursuers: readonly { readonly kind: PursuerKind; readonly role: PursuerRole }[];
}

export interface ChaseArmOptions {
  /** The bell, seconds: CHASE.escapeSeconds solo, CHASE.couchEscapeSeconds in a couch (q217). Fixed for the round. */
  readonly bellSeconds: number;
  /** 0 = running at arm with no count events (the solo chase today); a couch passes KNOCKABOUT.countdownSeconds (q223). */
  readonly countdownSeconds?: number;
  /** [pursuer][outlaw] straight-line metres at the start, for the opening deal. Absent: the fallback deal (A-6). */
  readonly startDistances?: readonly (readonly number[])[];
}

/** One outlaw's facts this step. Index-for-index with ChaseRoomSpec's outlaws. */
export interface OutlawFacts {
  /** Metres from the route: `StreetLoops.offRoute` over the canonical answer, exactly as Game computes it today. */
  readonly offRoute: number;
  readonly crashed: boolean;
  /**
   * Edge: his R in a couch chase (q225). Game feeds it from a per-seat latch set where the seat's R is read and
   * cleared by stepChase after the room has read it (the `seatResetThisStep` pattern), because seat 0's R returns
   * from Game.step at the worldReset branch before stepCop/stepChase run (the M27 audit's seam). Never set solo. Absent = false.
   */
  readonly gaveUp?: boolean;
  /** This step moved him by a reset or respawn: his two-body facts (touch) are void this step (M23's rule). */
  readonly teleported?: boolean;
}

/** One pursuer's facts this step. Index-for-index with ChaseRoomSpec's pursuers. */
export interface PursuerFacts {
  readonly crashed: boolean;
  /** A CPU patrol standing at his post (Game flips it on a wake and on an accepted post return). Always false for the tail and a human. */
  readonly parked: boolean;
  /** m/s, unsigned: the stall clock's input. `Infinity` means "unknown, never stalls" (the wrapper's absent copSpeed). */
  readonly speed: number;
  /** This step placed him (spawn, tail return, post return): his bust and touch facts are void this step. */
  readonly teleported?: boolean;
  /**
   * Paddle wound up or active: while true his deal cannot change (q221 (3)). Exactly
   * `paddle.phase === 'windup' || paddle.phase === 'active'` — not `swinging`, which includes 'recover'.
   */
  readonly paddleArmed?: boolean;
  /** Straight-line metres (x/z) to each outlaw, index-for-index. */
  readonly distance: readonly number[];
  /**
   * Each outlaw's own closing speed against THIS cop, m/s: the rider's contribution alone, capped at
   * the rider's own speed. This is today's `riderClosingSpeed` computed per pair (the touch rule, M24).
   */
  readonly outlawClosing: readonly number[];
}

export interface ChaseRoomInput {
  readonly outlaws: readonly OutlawFacts[];
  readonly pursuers: readonly PursuerFacts[];
}

export interface ChaseDemand {
  readonly kind: ChaseDemandKind;
  /** The cop it names. Every demand names one (§39.6b.3: "a demand names the cop"). */
  readonly pursuer: number;
  /** The outlaw it is about: the quarry to return behind, the outlaw a wake is sent to, the new deal. */
  readonly outlaw: number;
  readonly cause: ChaseDemandCause;
}

export interface OutlawState {
  readonly status: OutlawStatus;
  /** Room-clock seconds at which he stopped standing; the bell for 'escaped'; null while standing. */
  readonly endedAt: number | null;
  /** Pursuer credited: caught → the striker or the nearest standing cop in the radius; touched → the cop touched; otherwise −1. */
  readonly by: number;
  /** Seconds standing: endedAt ?? elapsed. */
  readonly survived: number;
  readonly straying: boolean;
  readonly strayGrace: number;
  /** The director's quiet clock for him (§39.6b.3b: per outlaw), wound back by retries. */
  readonly quiet: number;
  /** Seconds since any standing cop was inside his quiet reset line. Never wound back; the lone cop's rotation key (A-3). */
  readonly unpressured: number;
  /** Nearest standing cop (parked included), −1 none, and the range: per-seat copGap, copClose, the stray arrow. */
  readonly nearestCop: number;
  readonly nearestCopMetres: number;
  /** 1-based shared place (q86): 0 while the round runs; set at the end. */
  readonly place: number;
}

export interface PursuerState {
  readonly kind: PursuerKind;
  readonly role: PursuerRole;
  readonly phase: PursuerPhase;
  /** Dealt outlaw, −1 for none (a human pursuer is never dealt). */
  readonly quarry: number;
  /** Seconds the current deal has held. */
  readonly dealtFor: number;
  /** Director clocks (CPU only; 0 for a human): tracker gap hold, stall, respite. */
  readonly gap: number;
  readonly stall: number;
  readonly respite: number;
  /** Outlaws credited to him (caught + touched). */
  readonly busts: number;
  /** Nearest standing outlaw and range: the human cop's bearing readout (q220), F3. */
  readonly nearestOutlaw: number;
  readonly nearestOutlawMetres: number;
}

export interface ChaseRoomResult {
  readonly seconds: number;
  readonly bellSeconds: number;
  /** Every outlaw down before the bell (the cop's win, q217). Equivalent to escaped === 0. */
  readonly swept: boolean;
  /** Outlaws standing at the bell. */
  readonly escaped: number;
  readonly outlaws: readonly { readonly status: OutlawStatus; readonly survived: number; readonly by: number; readonly place: number }[];
  readonly pursuers: readonly { readonly kind: PursuerKind; readonly busts: number }[];
}

export interface ChaseRoomState {
  readonly phase: ChaseRoomPhase;
  readonly countdown: number;
  /** Seconds since GO. */
  readonly elapsed: number;
  /** bell − elapsed, floored at 0. */
  readonly remaining: number;
  readonly bellSeconds: number;
  /** True while elapsed < copHoldSeconds after GO (q224): Game freezes every pursuer's intent, and the director's clocks are held. */
  readonly pursuersHeld: boolean;
  readonly standing: number;
  readonly outlaws: readonly OutlawState[];
  readonly pursuers: readonly PursuerState[];
  /** The siren's one input (§2a.5). Infinity when nobody is standing on either side or the round is not running. */
  readonly sirenRangeMetres: number;
  readonly result: ChaseRoomResult | null;
}

export interface ChaseEvent {
  readonly kind: 'count' | 'go' | 'out' | 'ended';
  /** The outlaw on 'out'; −1 for the room's events. */
  readonly outlaw: number;
  /** The credited pursuer on 'out', else −1. */
  readonly pursuer: number;
  /** His ending on 'out'; 'standing' otherwise. */
  readonly status: OutlawStatus;
  /** The count digit on 'count'; the outlaws still standing (escaped) on 'ended'. */
  readonly value: number;
  readonly seconds: number;
}

export interface ChaseRoomStep {
  /** True on the step the round ended, once. */
  readonly ended: boolean;
  readonly events: readonly ChaseEvent[];
}

/** A demand slot the room reuses step after step (rule 4: nothing allocated at 120 Hz). */
interface DemandSlot {
  kind: ChaseDemandKind;
  pursuer: number;
  outlaw: number;
  cause: ChaseDemandCause;
}

const NO_EVENTS: readonly ChaseEvent[] = Object.freeze([]);
/** "Nothing happened": the frozen answer for every quiet step (`knockaboutMatch.ts`'s pattern). */
const QUIET_STEP: ChaseRoomStep = Object.freeze({ ended: false, events: NO_EVENTS });
const NO_DEMANDS: readonly ChaseDemand[] = Object.freeze([]);

const CPU_TAIL = Object.freeze({ kind: 'cpu' as PursuerKind, role: 'tail' as PursuerRole });
const CPU_PATROL = Object.freeze({ kind: 'cpu' as PursuerKind, role: 'patrol' as PursuerRole });
const HUMAN_TAIL = Object.freeze({ kind: 'human' as PursuerKind, role: 'tail' as PursuerRole });

/**
 * The rule's arithmetic (§39.6b.3b, q207): `roomSize − outlaws` CPU cops when
 * the slot is CPU — one human against three, two against two, three against
 * one — and none beside a human cop, because the CPU never fills anything but
 * the cop slot and a human cop *is* the slot.
 */
export function cpuPackSize(outlaws: number, humanCop: boolean, roomSize: number = CHASE.roomSize): number {
  if (humanCop) return 0;
  return Math.max(0, roomSize - outlaws);
}

/**
 * The spec for a room: a human cop is one `{ human, tail }` entry; a CPU slot
 * is the tail first and patrols after it, `cpuCount` of them in all
 * (defaulting to the rule's pack size — `?cops=` passes its own count, and
 * `arm` is the one place that says whether a count is legal).
 */
export function roomSpec(outlaws: number, humanCop: boolean, cpuCount?: number): ChaseRoomSpec {
  if (humanCop) return Object.freeze({ outlaws, pursuers: Object.freeze([HUMAN_TAIL]) });
  const count = cpuCount ?? cpuPackSize(outlaws, false);
  const pursuers: { readonly kind: PursuerKind; readonly role: PursuerRole }[] = [];
  for (let index = 0; index < count; index += 1) pursuers.push(index === 0 ? CPU_TAIL : CPU_PATROL);
  return Object.freeze({ outlaws, pursuers: Object.freeze(pursuers) });
}

/**
 * The siren's one input (§39.6b.3b "Sound, HUD, card, records", §2a.5): the
 * room's nearest **riding** cop to its nearest **standing** outlaw, whoever
 * holds the slot. Min over standing outlaws × pursuers that are neither
 * crashed nor parked; Infinity when either side is empty.
 *
 * It is one room-wide number on purpose. §21.9's trap was a siren fed the
 * cop's *own* gap — a cop who hears himself — and a reduction over every
 * pair can never be that: no pursuer's distance to his own quarry is ever
 * the input unless it happens to be the room's shortest pair. A parked
 * patrol is asleep and silent (R-19): he joins the reduction on the step he
 * wakes, so a wake range tuned below the siren line never plays the bed for a
 * cop standing at his post.
 */
export function nearestStandingPair(input: ChaseRoomInput, outlawStanding: readonly boolean[]): number {
  let best = Infinity;
  const pursuers = input.pursuers;
  const outlaws = Math.min(outlawStanding.length, input.outlaws.length);
  for (let p = 0; p < pursuers.length; p += 1) {
    const facts = pursuers[p];
    if (facts.crashed || facts.parked) continue;
    for (let k = 0; k < outlaws; k += 1) {
      if (!outlawStanding[k]) continue;
      const metres = facts.distance[k];
      if (metres < best) best = metres;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// ChaseRoom — the referee for N outlaws and M pursuers (§2a.2–§2a.5)
// ---------------------------------------------------------------------------

/**
 * The chase's referee over a whole room — M39 Part P (§39.6b.3 "The
 * endings", §39.6b.3b "The referee", "The deal").
 *
 * **One step, in order** (§2a.3): the bell first, so a crash on the final
 * step is still an escape; then each standing outlaw's endings — caught,
 * touched, gave up, strayed — on one pose set; then the round's end; then the
 * deal and the director's clocks and demands; placements are swept when the
 * round ends. Outlaws are independent within a step, so index order changes
 * nothing, and outlaws who go down on the same step share a place (q86).
 *
 * **The deal** (q221) is the room's, never a brain's: every CPU pursuer
 * always has a quarry, read by Game through `quarryOf` each step. **The
 * director** (§39.6b.3) runs per CPU pursuer — his own gap, stall and
 * respite clocks, keyed on his quarry — plus a quiet clock per outlaw (no
 * standing cop inside *his* siren line). A human pursuer carries no clocks,
 * receives no demands and is never dealt: he chooses his own quarry.
 *
 * Nothing the player configures reaches it except through `arm` and `step`
 * (invariant 5); its tunables are live fields on the `ChaseRun` pattern,
 * seeded from `CHASE` and written by `Game.applyTuning`.
 */
export class ChaseRoom {
  // -- Live tuning, on the ChaseRun pattern: annotated `: number` because the
  // tuning table is `as const`, and an inferred field would take the literal.
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
  patrolWakeMetres: number = CHASE.patrolWakeMetres;
  /** The brutal pass: a parked patrol this far from his quarry for this long is sent ahead of him. */
  roadblockIdleMetres: number = CHASE.patrolReturnMetres;
  roadblockIdleSeconds: number = CHASE.roadblockIdleSeconds;
  dealHoldSeconds: number = CHASE.dealHoldSeconds;
  copHoldSeconds: number = CHASE.copHoldSeconds;
  /** The deal's close-pursuit hold (q221 (3)): CHASE.pursuitNearMetres. */
  pursuitNearMetres: number = CHASE.pursuitNearMetres;

  private phaseValue: ChaseRoomPhase = 'idle';
  private outlawCount = 0;
  private pursuerCount = 0;
  /** CPU pursuers in the room: |C| in §2a.4. One is the "lone cop" of q221. */
  private cpuCount = 0;
  /** The CPU tail's index (always 0 when the slot is CPU); −1 beside a human cop. */
  private tailIndex = -1;
  private kinds: PursuerKind[] = [];
  private roles: PursuerRole[] = [];
  private bell = 0;
  /** Counts down; decremented exactly as the shipped `ChaseRun` did, so the wrapper ends on the same step. */
  private remainingSeconds = 0;
  /** q224's hold, snapshotted at arm like the bell: a round keeps the start it began with. */
  private holdSeconds = 0;
  private countdownRemaining = 0;
  private countdownShown = -1;
  private siren = Infinity;
  private standingCount = 0;
  private resultValue: ChaseRoomResult | null = null;

  // -- Per outlaw ---------------------------------------------------------
  private status: OutlawStatus[] = [];
  /** Room-clock seconds he stopped standing; meaningless while he stands. */
  private endedAt: number[] = [];
  private creditedTo: number[] = [];
  /** The bust is an edge, not a level (M18): was he crashed on the previous step? */
  private outlawWasCrashed: boolean[] = [];
  /** This step's crash fact: "the quarry is crashed" holds his cop's clocks. */
  private outlawCrashed: boolean[] = [];
  private strayedFor: number[] = [];
  private quietFor: number[] = [];
  private unpressuredFor: number[] = [];
  private nearestCop: number[] = [];
  private nearestCopRange: number[] = [];
  private places: number[] = [];
  private standingFlags: boolean[] = [];
  /** The last landed swing on him (A-7): who, and how long ago. −1 = none in the window. */
  private strikeBy: number[] = [];
  private strikeAge: number[] = [];

  // -- Per pursuer ----------------------------------------------------------
  private quarry: number[] = [];
  private dealtFor: number[] = [];
  private gapFor: number[] = [];
  private stallFor: number[] = [];
  private respiteLeft: number[] = [];
  private pursuerWasCrashed: boolean[] = [];
  private pursuerCrashed: boolean[] = [];
  private parkedNow: boolean[] = [];
  /**
   * A wake demand has been raised and the patrol still reads parked: Game
   * flips `parked` when it acts on the wake, so this only spans the steps
   * between the demand and the flip, and stops the room asking twice.
   */
  private wakePending: boolean[] = [];
  /** A-4: a patrol is `waking` until he first comes inside the tracker line of his quarry. */
  private engaged: boolean[] = [];
  /** A-4: the best range to his quarry since his wake or deal. */
  private bestRange: number[] = [];
  /**
   * This step set a new best range to his quarry (strictly nearer than any
   * since his wake or deal): the patrol is on his way. Holds his quarry's quiet
   * clock while he is still waking (QA r1, `wakeClosing`).
   */
  private closing: boolean[] = [];
  /**
   * Seconds of his quarry's quiet clock this waking patrol may still hold by
   * closing: one quiet spell per wake or deal (QA r1). Bounds the hold, so a
   * patrol creeping in from far away cannot keep the rider in silence for
   * ever; once it is spent he hands the clock on like one who stopped closing.
   */
  private closingHold: number[] = [];
  private bustCount: number[] = [];
  private nearestOutlaw: number[] = [];
  private nearestOutlawRange: number[] = [];
  /** A pursuer named by one return or wake this step is not named by a second (§2a.4). */
  private named: boolean[] = [];
  /** Seconds since pursuer p was last sent ahead (`intercept`); Infinity for never. */
  private sentAgo: number[] = [];
  /** Seconds a parked patrol has stood further than `roadblockIdleMetres` from his quarry. */
  private idleFor: number[] = [];

  // -- Demands: a reusable pool, handed out by `takeDemands` ------------------
  private readonly demandPool: DemandSlot[] = [];
  private demandCount = 0;
  private readonly demandsOut: ChaseDemand[] = [];

  // -- Allocation-free accessors ---------------------------------------------

  get phase(): ChaseRoomPhase {
    return this.phaseValue;
  }

  /** What Game hands brain p as `CpuQuarry` this step; −1 → a null quarry (and always −1 for a human). */
  quarryOf(pursuer: number): number {
    return this.quarry[pursuer] ?? -1;
  }

  statusOf(outlaw: number): OutlawStatus {
    return this.status[outlaw] ?? 'standing';
  }

  /** Seat k's nearest standing cop, metres (parked included): `copGap`, `copClose`, the chase lane. */
  nearestCopMetres(outlaw: number): number {
    return this.nearestCopRange[outlaw] ?? Infinity;
  }

  /** The room's siren input (§2a.5). Infinity unless the round is running. */
  get sirenRangeMetres(): number {
    return this.phaseValue === 'running' ? this.siren : Infinity;
  }

  get pursuersHeld(): boolean {
    return this.phaseValue === 'running' && this.elapsedSeconds() < this.holdSeconds;
  }

  /** Seconds left on the bell (the wrapper's `remaining`). The bell itself before GO. */
  get remaining(): number {
    if (this.phaseValue === 'idle') return this.bell;
    return Math.max(0, this.remainingSeconds);
  }

  /** Seconds since GO. */
  get elapsed(): number {
    return this.elapsedSeconds();
  }

  /** Seconds outlaw k has spent beyond the stray line (the warning is on while > 0). */
  strayClockOf(outlaw: number): number {
    return this.strayedFor[outlaw] ?? 0;
  }

  /** Outlaw k's quiet clock. */
  quietOf(outlaw: number): number {
    return this.quietFor[outlaw] ?? 0;
  }

  /** Pursuer p's respite, seconds left. */
  respiteOf(pursuer: number): number {
    return this.respiteLeft[pursuer] ?? 0;
  }

  /** The pursuer credited with outlaw k's ending, −1 for none. */
  creditOf(outlaw: number): number {
    return this.creditedTo[outlaw] ?? -1;
  }

  get state(): ChaseRoomState {
    const running = this.phaseValue === 'running' || this.phaseValue === 'ended';
    const elapsed = this.elapsedSeconds();
    const outlaws: OutlawState[] = [];
    for (let k = 0; k < this.outlawCount; k += 1) {
      const standing = this.status[k] === 'standing';
      outlaws.push({
        status: this.status[k],
        endedAt: standing ? null : this.endedAt[k],
        by: this.creditedTo[k],
        survived: standing ? elapsed : this.endedAt[k],
        straying: this.strayedFor[k] > 0,
        strayGrace: Math.max(0, this.strayGraceSeconds - this.strayedFor[k]),
        quiet: this.quietFor[k],
        unpressured: this.unpressuredFor[k],
        nearestCop: this.nearestCop[k],
        nearestCopMetres: this.nearestCopRange[k],
        place: this.places[k],
      });
    }
    const pursuers: PursuerState[] = [];
    for (let p = 0; p < this.pursuerCount; p += 1) {
      const cpu = this.kinds[p] === 'cpu';
      pursuers.push({
        kind: this.kinds[p],
        role: this.roles[p],
        phase: this.pursuerPhase(p),
        quarry: this.quarry[p],
        dealtFor: cpu ? this.dealtFor[p] : 0,
        gap: cpu ? this.gapFor[p] : 0,
        stall: cpu ? this.stallFor[p] : 0,
        respite: cpu ? this.respiteLeft[p] : 0,
        busts: this.bustCount[p],
        nearestOutlaw: this.nearestOutlaw[p],
        nearestOutlawMetres: this.nearestOutlawRange[p],
      });
    }
    return {
      phase: this.phaseValue,
      countdown: this.phaseValue === 'countdown' ? this.countdownRemaining : 0,
      elapsed,
      remaining: running ? Math.max(0, this.remainingSeconds) : this.bell,
      bellSeconds: this.bell,
      pursuersHeld: this.pursuersHeld,
      standing: this.standingCount,
      outlaws,
      pursuers,
      sirenRangeMetres: this.sirenRangeMetres,
      result: this.resultValue,
    };
  }

  // -- The round ----------------------------------------------------------------

  /**
   * Start a round. Validates the room — `1 ≤ outlaws ≤ roomSize − 1`, and the
   * slot either one or more CPU cops (pursuer 0 the tail, the rest patrols)
   * with `outlaws + cops ≤ roomSize`, or exactly one human cop — and throws
   * on anything else, because an illegal room is a composition-root bug and
   * not a thing to referee quietly. Deals the opening quarries (D0).
   */
  arm(spec: ChaseRoomSpec, options: ChaseArmOptions): void {
    const roomSize = CHASE.roomSize;
    const outlaws = spec.outlaws;
    if (!Number.isInteger(outlaws) || outlaws < 1 || outlaws > roomSize - 1) {
      throw new Error(`ChaseRoom: ${outlaws} outlaws is not a room (1..${roomSize - 1})`);
    }
    const pursuers = spec.pursuers;
    if (pursuers.length < 1) throw new Error('ChaseRoom: the cop slot is empty');
    const human = pursuers.some((entry) => entry.kind === 'human');
    if (human) {
      if (pursuers.length !== 1 || pursuers[0].role !== 'tail') {
        throw new Error('ChaseRoom: a human cop holds the slot alone, in the tail’s place');
      }
    } else {
      if (outlaws + pursuers.length > roomSize) {
        throw new Error(`ChaseRoom: ${outlaws} outlaws and ${pursuers.length} CPU cops overfill a room of ${roomSize}`);
      }
      for (let p = 0; p < pursuers.length; p += 1) {
        if (pursuers[p].kind !== 'cpu' || pursuers[p].role !== (p === 0 ? 'tail' : 'patrol')) {
          throw new Error('ChaseRoom: a CPU pack is the tail first and patrols after it');
        }
      }
    }
    const bell = options.bellSeconds;
    if (!Number.isFinite(bell) || bell < 0) throw new Error(`ChaseRoom: a bell of ${bell} s is not a bell`);

    this.outlawCount = outlaws;
    this.pursuerCount = pursuers.length;
    this.cpuCount = human ? 0 : pursuers.length;
    this.tailIndex = human ? -1 : 0;
    this.kinds = pursuers.map((entry) => entry.kind);
    this.roles = pursuers.map((entry) => entry.role);
    this.bell = bell;
    this.holdSeconds = Number.isFinite(this.copHoldSeconds) ? Math.max(0, this.copHoldSeconds) : 0;
    this.resetRound();

    // D0 — the opening deal, in pursuer order by D1's forced rule (A-6).
    const start = options.startDistances;
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu') continue;
      const row = start !== undefined && start[p] !== undefined && start[p].length >= outlaws ? start[p] : null;
      this.quarry[p] = row === null ? p % outlaws : this.forcedTarget(p, row);
    }

    const count = options.countdownSeconds;
    const held = count !== undefined && Number.isFinite(count) ? Math.max(0, count) : 0;
    if (held > 0) {
      this.phaseValue = 'countdown';
      this.countdownRemaining = held;
      this.countdownShown = -1;
    } else {
      this.phaseValue = 'running';
    }
  }

  /** Back to idle: a quit, or a world swapped underneath the round. Clears everything, demands included. */
  abandon(): void {
    this.phaseValue = 'idle';
    this.resetRound();
  }

  /**
   * A landed swing of pursuer p on outlaw k this step, handed in before
   * `step` like `KnockaboutMatch.knockdown`. It ends nothing by itself — the
   * strike is pressure, and the crash that follows it is the bust (§13 q25) —
   * but it names who gets the credit when that crash lands inside
   * `STRIKE_CREDIT_SECONDS` (A-7).
   */
  recordStrike(pursuer: number, outlaw: number): void {
    if (this.phaseValue !== 'running') return;
    if (!(pursuer >= 0 && pursuer < this.pursuerCount && outlaw >= 0 && outlaw < this.outlawCount)) return;
    if (this.status[outlaw] !== 'standing') return;
    this.strikeBy[outlaw] = pursuer;
    this.strikeAge[outlaw] = 0;
  }

  /**
   * The demands this step raised, consumed on read — edge-triggered, like
   * the shipped `takeTrackerDemand`. The array and its entries are reused:
   * read them before the next `step`. A frozen empty array when none.
   */
  takeDemands(): readonly ChaseDemand[] {
    if (this.demandCount === 0) return NO_DEMANDS;
    const out = this.demandsOut;
    out.length = 0;
    for (let index = 0; index < this.demandCount; index += 1) out.push(this.demandPool[index]);
    this.demandCount = 0;
    return out;
  }

  /**
   * One fixed step over one pose set. Returns the frozen quiet answer when
   * nothing happened, which is nearly every step.
   *
   * **The bell is spent first**, exactly as the solo referee always spent its
   * clock first: a rider who reaches zero on the step he crashes has escaped,
   * because the round was over before the crash (§18.6's unfairness removed
   * rather than tuned). That holds for the last standing outlaw too — a bell
   * and a sweep on the same step is an escape, never a bust.
   */
  step(dt: number, input: ChaseRoomInput): ChaseRoomStep {
    if (this.phaseValue === 'idle' || this.phaseValue === 'ended') return QUIET_STEP;
    const stepSeconds = Math.max(0, dt);
    if (this.phaseValue === 'countdown') return this.stepCountdown(stepSeconds);
    if (input.outlaws.length < this.outlawCount || input.pursuers.length < this.pursuerCount) {
      throw new Error('ChaseRoom: a step’s facts do not cover the room');
    }
    this.demandCount = 0;

    // Record the pursuers' levels. A patrol reads parked only from Game's own
    // flag; a wake the room raised is spent once Game has flipped it.
    for (let p = 0; p < this.pursuerCount; p += 1) {
      const facts = input.pursuers[p];
      this.pursuerCrashed[p] = facts.crashed;
      const parked = this.kinds[p] === 'cpu' && this.roles[p] === 'patrol' && facts.parked === true;
      this.parkedNow[p] = parked;
      if (!parked) this.wakePending[p] = false;
      this.named[p] = false;
    }

    // 1. The bell first.
    this.remainingSeconds -= stepSeconds;
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = 0;
      this.recordNearestCops(input);
      this.siren = nearestStandingPair(input, this.standingFlags);
      this.recordNearestOutlaws(input);
      for (let k = 0; k < this.outlawCount; k += 1) {
        if (this.status[k] !== 'standing') continue;
        this.status[k] = 'escaped';
        this.endedAt[k] = this.bell;
        this.creditedTo[k] = -1;
        this.standingFlags[k] = false;
      }
      return this.finish(null, this.bell);
    }
    const now = this.bell - this.remainingSeconds;

    // 2. Record each standing outlaw's crash edge against this pose set.
    let edges = 0;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing') continue;
      const crashed = input.outlaws[k].crashed;
      if (crashed && !this.outlawWasCrashed[k]) edges |= 1 << k;
      this.outlawWasCrashed[k] = crashed;
      this.outlawCrashed[k] = crashed;
    }
    this.recordNearestCops(input);

    // 3. Decide, per standing outlaw: caught, touched, gave up, strayed.
    let events: ChaseEvent[] | null = null;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing') continue;
      const facts = input.outlaws[k];

      // Caught: the crash's own edge, with any standing cop inside the bust
      // radius (A-1: a ragdolled cop arrests nobody). The credit is the
      // striker's when his landed swing preceded the crash inside the window
      // (A-7), otherwise the nearest standing cop in the radius.
      if ((edges & (1 << k)) !== 0) {
        const nearest = this.nearestTwoBody(input, k, this.bustRadiusMetres, -Infinity);
        if (nearest >= 0) {
          const striker = this.strikeBy[k];
          const credited = striker >= 0 && this.strikeAge[k] <= STRIKE_CREDIT_SECONDS && !this.pursuerCrashed[striker]
            ? striker
            : nearest;
          events = this.endOutlaw(k, 'caught', credited, now, events);
          continue;
        }
      }

      // Touched — M24, per cop. A level, and only the outlaw's own closing
      // against THAT cop counts: a cop steered into a passing rider meets no
      // rider-side closing and scores nothing, however many cops there are.
      if (!facts.crashed && facts.teleported !== true) {
        const touched = this.nearestTwoBody(input, k, this.touchBustMetres, this.touchBustClosingSpeed);
        if (touched >= 0) {
          events = this.endOutlaw(k, 'touched', touched, now, events);
          continue;
        }
      }

      // Gave up — his R in a couch chase (q225), credited to nobody.
      if (facts.gaveUp === true) {
        events = this.endOutlaw(k, 'gaveUp', -1, now, events);
        continue;
      }

      // Strayed — the boundary, reset rather than decayed (§13 q27).
      if (facts.offRoute > this.strayLimitMetres) {
        this.strayedFor[k] += stepSeconds;
        if (this.strayedFor[k] >= this.strayGraceSeconds) {
          events = this.endOutlaw(k, 'strayed', -1, now, events);
          continue;
        }
      } else {
        this.strayedFor[k] = 0;
      }
    }

    // The strike window ages by the step it has just been judged on.
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.strikeBy[k] < 0) continue;
      this.strikeAge[k] += stepSeconds;
      if (this.strikeAge[k] > STRIKE_CREDIT_SECONDS) this.strikeBy[k] = -1;
    }

    this.siren = nearestStandingPair(input, this.standingFlags);
    this.recordNearestOutlaws(input);

    // 4. The round ends when the last standing outlaw goes down.
    if (this.standingCount === 0) return this.finish(events, now);

    // 5. The deal, then the director's clocks and demands.
    this.direct(stepSeconds, input);

    return events === null ? QUIET_STEP : Object.freeze({ ended: false, events: Object.freeze(events) });
  }

  // -- The deal and the director (§2a.4) ----------------------------------------

  private direct(stepSeconds: number, input: ChaseRoomInput): void {
    const held = this.pursuersHeld;

    // Per-cop respite (§39.6b.3: a baited crash holds that cop's clocks and his
    // alone), the deal's age, and a waking patrol's engagement (A-4).
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu') continue;
      this.sentAgo[p] += stepSeconds;
      const crashed = this.pursuerCrashed[p];
      if (this.pursuerWasCrashed[p] && !crashed) this.respiteLeft[p] = this.trackerRespiteSeconds;
      this.pursuerWasCrashed[p] = crashed;
      this.respiteLeft[p] = Math.max(0, this.respiteLeft[p] - stepSeconds);
      if (this.quarry[p] >= 0) this.dealtFor[p] += stepSeconds;
      if (this.parkedNow[p]) {
        this.engaged[p] = false;
        this.bestRange[p] = Infinity;
        this.closing[p] = false;
        this.gapFor[p] = 0;
        this.stallFor[p] = 0;
        const quarry = this.quarry[p];
        const far = quarry >= 0 && input.pursuers[p].distance[quarry] > this.roadblockIdleMetres;
        this.idleFor[p] = far && !held ? this.idleFor[p] + stepSeconds : 0;
      } else if (this.quarry[p] >= 0) {
        this.idleFor[p] = 0;
        const range = input.pursuers[p].distance[this.quarry[p]];
        if (range <= this.trackerGapMetres) this.engaged[p] = true;
        // Strictly a new best, never A-4's "not losing 20 m": a patrol trailing
        // at a constant range is not on his way, and must not hold the quiet
        // clock the free-riding rule runs on.
        this.closing[p] = range < this.bestRange[p];
        if (range < this.bestRange[p]) this.bestRange[p] = range;
      } else {
        this.closing[p] = false;
      }
    }

    // D1 — forced re-deal: the quarry went down for good. Even inside a hold.
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu') continue;
      const current = this.quarry[p];
      if (current >= 0 && this.status[current] === 'standing') continue;
      this.dealTo(p, this.forcedTarget(p, input.pursuers[p].distance), 'deal');
    }

    // D2 — coverage (q221 (1)): an unchased outlaw takes the nearest surplus
    // cop whose deal may change.
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing' || this.isChased(k, -1)) continue;
      let pick = -1;
      let pickRange = Infinity;
      for (let p = 0; p < this.pursuerCount; p += 1) {
        if (this.kinds[p] !== 'cpu') continue;
        const current = this.quarry[p];
        if (current < 0 || !this.isChased(current, p) || !this.mayChange(p, input)) continue;
        const range = input.pursuers[p].distance[k];
        if (pick < 0 || range < pickRange) {
          pick = p;
          pickRange = range;
        }
      }
      if (pick >= 0) this.dealTo(pick, k, 'deal');
    }

    // The quiet clock, per outlaw (§39.6b.3b): no standing cop inside HIS
    // siren line. Held while he is down, while the pursuers are held, and
    // while nobody could answer it (with one cop: exactly the shipped `held`).
    // And it does not count while the patrol woken for him is still riding in
    // and closing (QA r1): the answer is on its way, and a clock that kept
    // counting would ask A-3's next question two seconds after the wake — the
    // other patrol, then Dorkins regrouped behind him — so the rider would
    // watch Dorkins reappear rather than hear the second siren arrive
    // (§39.6b.3 "Waking"). The hold is one quiet spell per wake at most
    // (`closingHold`), and a patrol who stops closing hands the clock back.
    const answerable = this.quietAnswerable();
    const resetLine = this.trackerQuietGapMetres - QUIET_RESET_METRES;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing') continue;
      const near = this.nearestCopRange[k];
      const pressed = near <= resetLine;
      const down = this.outlawCrashed[k];
      if (pressed) this.unpressuredFor[k] = 0;
      else if (!down) this.unpressuredFor[k] += stepSeconds;
      if (held || down || !answerable || pressed) {
        this.quietFor[k] = 0;
      } else if (near > this.trackerQuietGapMetres) {
        const riding = this.wakeClosing(k);
        if (riding >= 0) this.closingHold[riding] = Math.max(0, this.closingHold[riding] - stepSeconds);
        else this.quietFor[k] += stepSeconds;
      }
    }

    if (held) {
      // q224: the pursuers are frozen, so every clock is held at zero and
      // nothing is demanded; the deal above still covers the room.
      for (let p = 0; p < this.pursuerCount; p += 1) {
        this.gapFor[p] = 0;
        this.stallFor[p] = 0;
      }
      return;
    }

    // Per CPU pursuer: the gap and stall clocks, keyed on his quarry.
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu' || this.parkedNow[p]) continue;
      const facts = input.pursuers[p];
      const current = this.quarry[p];
      const heldClock = this.pursuerCrashed[p] || this.respiteLeft[p] > 0 || current < 0 || this.outlawCrashed[current];
      const range = current >= 0 ? facts.distance[current] : Infinity;
      const counts = this.roles[p] === 'tail' || this.engaged[p] || range > this.bestRange[p] + WAKE_SLACK_METRES;
      if (!heldClock && range > this.trackerGapMetres && counts) this.gapFor[p] += stepSeconds;
      else this.gapFor[p] = 0;
      if (!heldClock && Math.abs(facts.speed) < this.trackerStallSpeed && range > this.trackerStallGapMetres) {
        this.stallFor[p] += stepSeconds;
      } else {
        this.stallFor[p] = 0;
      }
    }

    // Demands: pursuers first, ascending.
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu') continue;
      if (this.parkedNow[p]) {
        // The proximity wake (§39.6b.3 "Waking"): an outlaw inside the wake
        // range of a standing, parked patrol — heard as it happens, because the
        // range is the siren's onset.
        if (this.pursuerCrashed[p] || this.wakePending[p]) continue;
        const target = this.wakeTarget(input.pursuers[p].distance);
        if (target >= 0) {
          this.wake(p, target, 'proximity');
          continue;
        }
        // **A patrol does not wait at a post the rider is nowhere near** (the
        // brutal pass): parked out of reach of his quarry for a spell, he is
        // sent ahead of him — the roadblock on his road, out of view.
        const quarry = this.quarry[p];
        if (quarry >= 0 && this.idleFor[p] >= this.roadblockIdleSeconds
          && this.sentAgo[p] >= INTERCEPT_HOLD_SECONDS && !this.named[p]) {
          this.idleFor[p] = 0;
          this.raise('intercept', p, -1, 'idle', quarry);
        }
        continue;
      }
      if (this.named[p]) continue;
      const current = this.quarry[p];
      if (current < 0) continue;
      if (this.gapFor[p] >= this.trackerHoldSeconds) {
        // The tracker's first answer is a nearer unchased outlaw (q221 (4));
        // the return behind his quarry is its second.
        const other = this.gapAlternative(p, input);
        if (other >= 0) {
          this.dealTo(p, other, 'gap');
          this.named[p] = true;
          this.windBack(p, other);
        } else {
          this.raise(this.returnKind(p), p, current, 'gap');
        }
      } else if (this.stallFor[p] >= this.trackerStallSeconds) {
        // A stall never re-deals: a cop stuck on something is stuck whoever he chases.
        this.raise(this.returnKind(p), p, current, 'stall');
      }
    }

    // Then outlaws, ascending: the quiet clock's answers — **both at once
    // since the brutal pass**. A-3 answered one at a time, the nearest parked
    // patrol first: woken a third of the ring away, he rode in for a whole
    // quiet spell before the tail was asked, which is the owner's "it took a
    // while of riding in silence before i ran into the next cop". Now the
    // tail is put back behind him (the siren, at once) and a patrol is sent
    // ahead of him, out of view, to stand on his line (the roadblock he rides
    // into), in the same step.
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing' || this.quietFor[k] < this.trackerQuietSeconds) continue;
      let answered = false;
      const tail = this.tailIndex;
      if (tail >= 0 && !this.named[tail] && !this.pursuerCrashed[tail]) {
        // 1. The tail is dealt him: the shipped regroup exactly.
        if (this.quarry[tail] === k) {
          this.raise('tail-return', tail, k, 'quiet');
          answered = true;
        } else if (this.hasLostQuarry(tail, input) && this.mayChange(tail, input)) {
          // The tail has lost his own quarry (R-9): re-deal him, hold
          // permitting, and return him. A tail pressing somebody else is never
          // pulled off him by a stranger's quiet clock.
          this.dealTo(tail, k, 'quiet');
          this.raise('tail-return', tail, k, 'quiet');
          answered = true;
        }
      }
      // 2. A patrol sent ahead of him: parked, or pressing nobody.
      const patrol = this.interceptorFor(input, k);
      if (patrol >= 0) {
        this.dealTo(patrol, k, 'quiet');
        this.engaged[patrol] = false;
        this.bestRange[patrol] = Infinity;
        // k's clock is wound back once per ask, however many answer it.
        this.raise('intercept', patrol, answered ? -1 : k, 'quiet', k);
        answered = true;
      }
      // 3. Nobody can answer: ask again after the retry.
      if (!answered) this.windBack(-1, k);
    }
  }

  /**
   * The patrol to send ahead of outlaw k (the brutal pass), or −1: a CPU
   * patrol, standing, not named this step, not sent anywhere in the last
   * `INTERCEPT_HOLD_SECONDS`, and either parked or pressing nobody (his own
   * quarry out of earshot, deal hold permitting). The nearest to k wins.
   */
  private interceptorFor(input: ChaseRoomInput, k: number): number {
    let pick = -1;
    let pickRange = Infinity;
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu' || this.roles[p] !== 'patrol') continue;
      if (this.pursuerCrashed[p] || this.named[p] || this.wakePending[p]) continue;
      if (this.sentAgo[p] < INTERCEPT_HOLD_SECONDS) continue;
      if (!this.parkedNow[p] && !(this.hasLostQuarry(p, input) && this.mayChange(p, input))) continue;
      const range = input.pursuers[p].distance[k];
      if (pick < 0 || range < pickRange) {
        pick = p;
        pickRange = range;
      }
    }
    return pick;
  }

  /** Is anybody able to answer a quiet clock? A parked standing patrol, or the CPU tail up with no respite. */
  private quietAnswerable(): boolean {
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu') continue;
      if (this.parkedNow[p] && !this.pursuerCrashed[p]) return true;
      if (p === this.tailIndex && !this.pursuerCrashed[p] && this.respiteLeft[p] <= 0) return true;
    }
    return false;
  }

  /**
   * The patrol on his way to outlaw k, or −1 — a standing CPU patrol,
   * unparked and still waking (A-4: not yet inside the tracker line), dealt k,
   * who set a new best range to him this step and has hold left
   * (`closingHold`). With one cop there is no patrol, so the shipped quiet
   * clock is untouched.
   */
  private wakeClosing(k: number): number {
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (this.kinds[p] !== 'cpu' || this.roles[p] !== 'patrol') continue;
      if (this.parkedNow[p] || this.pursuerCrashed[p] || this.engaged[p]) continue;
      if (this.quarry[p] === k && this.closing[p] && this.closingHold[p] > 0) return p;
    }
    return -1;
  }

  /** `mayChange(p)` (§2a.4, q221 (3)): parked, or held long enough, paddle not armed, and not in close pursuit. */
  private mayChange(p: number, input: ChaseRoomInput): boolean {
    if (this.parkedNow[p]) return true;
    const current = this.quarry[p];
    if (current < 0) return true;
    const facts = input.pursuers[p];
    return this.dealtFor[p] >= this.dealHoldSeconds
      && facts.paddleArmed !== true
      && facts.distance[current] > this.pursuitNearMetres;
  }

  /** Is outlaw k dealt to any CPU pursuer other than `except`? */
  private isChased(k: number, except: number): boolean {
    for (let p = 0; p < this.pursuerCount; p += 1) {
      if (p !== except && this.kinds[p] === 'cpu' && this.quarry[p] === k) return true;
    }
    return false;
  }

  /**
   * D1's forced target (and D0's with start distances): an unchased standing
   * outlaw if one exists — for a lone cop the one unpressured longest (q221:
   * the pressure rotates, nobody free-rides), otherwise the nearest — else the
   * nearest standing outlaw (doubling up, q221 (2)). Ties break to the nearer,
   * then the lower index. −1 only when nobody stands.
   */
  private forcedTarget(p: number, distance: readonly number[]): number {
    const lone = this.cpuCount === 1;
    let pick = -1;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing' || this.isChased(k, p)) continue;
      if (pick < 0 || this.better(k, pick, distance, lone)) pick = k;
    }
    if (pick >= 0) return pick;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing') continue;
      if (pick < 0 || distance[k] < distance[pick]) pick = k;
    }
    return pick;
  }

  /** Candidate order: a lone cop prefers the longest unpressured, then the nearer; a pack, the nearer. Lower index wins ties by iteration order. */
  private better(k: number, pick: number, distance: readonly number[], lone: boolean): boolean {
    if (lone) {
      const a = this.unpressuredFor[k];
      const b = this.unpressuredFor[pick];
      if (a !== b) return a > b;
    }
    return distance[k] < distance[pick];
  }

  /**
   * The gap clock's first answer (q221 (4)): an unchased outlaw other than his
   * quarry, hold permitting — a lone cop takes the one unpressured longest, a
   * pack cop the nearest, and only if nearer than the quarry he has lost.
   */
  private gapAlternative(p: number, input: ChaseRoomInput): number {
    if (!this.mayChange(p, input)) return -1;
    const distance = input.pursuers[p].distance;
    const current = this.quarry[p];
    const lone = this.cpuCount === 1;
    let pick = -1;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (k === current || this.status[k] !== 'standing' || this.isChased(k, p)) continue;
      if (!lone && !(distance[k] < distance[current])) continue;
      if (pick < 0 || this.better(k, pick, distance, lone)) pick = k;
    }
    return pick;
  }

  /**
   * R-9's "lost his own quarry": none, out of earshot of him too, or his gap
   * clock already running — and, since the brutal pass, **not while he is
   * closing on him**. With the quiet spell at seconds rather than twelve, a
   * tail still riding in on his quarry from beyond the siren line read as
   * lost and was dealt a stranger across the town (the bench's 2v2 hider,
   * 2026-09-25): a cop setting a new best range to his quarry is on his way.
   */
  private hasLostQuarry(p: number, input: ChaseRoomInput): boolean {
    const current = this.quarry[p];
    if (current < 0) return true;
    if (this.gapFor[p] > 0) return true;
    return input.pursuers[p].distance[current] > this.trackerQuietGapMetres && !this.closing[p];
  }

  /** The nearest standing outlaw inside the wake range (copPack's `wakeTarget`, §2b.3, restated so this module imports nothing new). */
  private wakeTarget(distance: readonly number[]): number {
    let pick = -1;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing' || !(distance[k] <= this.patrolWakeMetres)) continue;
      if (pick < 0 || distance[k] < distance[pick]) pick = k;
    }
    return pick;
  }

  /**
   * A patrol never takes the tail's return behind the rider (q206): his
   * return is to stand ahead of him — since the brutal pass a roadblock on
   * the rider's own line, out of view (`intercept`; the composition root
   * falls back to a fixed post when no spot ahead qualifies).
   */
  private returnKind(p: number): ChaseDemandKind {
    return this.roles[p] === 'tail' ? 'tail-return' : 'intercept';
  }

  /**
   * Wake patrol p toward outlaw k: dealt k (a parked cop may always change),
   * `waking` until he engages. A quiet-cause wake is an answer Game always
   * acts on, never a refused demand, so k's quiet clock starts a whole spell
   * afresh rather than the retry's wind-back (QA r1): the woken patrol has
   * that spell of not-closing time, on top of up to one more spell of steps
   * on which he closes (`wakeClosing`, `closingHold`), before A-3 asks its
   * next question.
   */
  private wake(p: number, k: number, cause: ChaseDemandCause): void {
    this.dealTo(p, k, cause);
    this.engaged[p] = false;
    this.bestRange[p] = Infinity;
    this.closing[p] = false;
    this.closingHold[p] = this.trackerQuietSeconds;
    this.wakePending[p] = true;
    this.raise('patrol-wake', p, k, cause);
    if (cause === 'quiet') this.quietFor[k] = 0;
  }

  /**
   * Change p's deal. Every change resets his deal age, his gap and stall
   * clocks and his engagement (A-4), and reports a `re-deal` when he had a
   * quarry before — Game ignores it (the new quarry is read from `quarryOf`);
   * F3 and the bench count it.
   */
  private dealTo(p: number, k: number, cause: ChaseDemandCause): void {
    const old = this.quarry[p];
    if (old === k) return;
    this.quarry[p] = k;
    this.dealtFor[p] = 0;
    this.gapFor[p] = 0;
    this.stallFor[p] = 0;
    this.engaged[p] = this.roles[p] === 'tail';
    this.bestRange[p] = Infinity;
    this.closing[p] = false;
    this.closingHold[p] = this.trackerQuietSeconds;
    if (old >= 0 && k >= 0) this.push('re-deal', p, k, cause);
  }

  /**
   * Raise a return or wake that names p, and wind the (p, k) clocks back by
   * the retry. `about` is the outlaw the demand names when it differs from
   * the clock wound (−1 winds p's alone: a second answer to one quiet ask).
   */
  private raise(kind: ChaseDemandKind, p: number, k: number, cause: ChaseDemandCause, about = k): void {
    this.push(kind, p, about, cause);
    this.named[p] = true;
    if (kind === 'intercept') this.sentAgo[p] = 0;
    this.windBack(p, k);
  }

  /**
   * A demand the composition root could not act on — a candidate refused for a
   * clamped route end, a fold, a pane that frames it — is asked again after
   * `TRACKER_RETRY_SECONDS` rather than after a whole hold: every demand
   * involving (p, k) winds back p's gap and stall and k's quiet by the retry,
   * which is the shipped "one demand winds all three clocks" per pair.
   */
  private windBack(p: number, k: number): void {
    if (p >= 0) {
      this.gapFor[p] = Math.max(0, Math.min(this.gapFor[p], this.trackerHoldSeconds) - TRACKER_RETRY_SECONDS);
      this.stallFor[p] = Math.max(0, Math.min(this.stallFor[p], this.trackerStallSeconds) - TRACKER_RETRY_SECONDS);
    }
    if (k >= 0) {
      this.quietFor[k] = Math.max(0, Math.min(this.quietFor[k], this.trackerQuietSeconds) - TRACKER_RETRY_SECONDS);
    }
  }

  private push(kind: ChaseDemandKind, p: number, k: number, cause: ChaseDemandCause): void {
    let slot = this.demandPool[this.demandCount];
    if (slot === undefined) {
      slot = { kind, pursuer: p, outlaw: k, cause };
      this.demandPool.push(slot);
    } else {
      slot.kind = kind;
      slot.pursuer = p;
      slot.outlaw = k;
      slot.cause = cause;
    }
    this.demandCount += 1;
  }

  // -- Facts and endings ------------------------------------------------------------

  /**
   * The nearest pursuer who can make a two-body ending on outlaw k: standing,
   * not placed this step (M23's rule), inside `radius`, and — for the touch —
   * met by the outlaw's own closing of at least `closing` against him. −1 none.
   */
  private nearestTwoBody(input: ChaseRoomInput, k: number, radius: number, closing: number): number {
    let pick = -1;
    let pickRange = Infinity;
    for (let p = 0; p < this.pursuerCount; p += 1) {
      const facts = input.pursuers[p];
      if (facts.crashed || facts.teleported === true) continue;
      const range = facts.distance[k];
      if (!(range <= radius)) continue;
      if (closing !== -Infinity && !((facts.outlawClosing[k] ?? 0) >= closing)) continue;
      if (pick < 0 || range < pickRange) {
        pick = p;
        pickRange = range;
      }
    }
    return pick;
  }

  /** Each standing outlaw's nearest standing cop, parked included: per-seat `copGap`, `copClose`, the quiet clock. */
  private recordNearestCops(input: ChaseRoomInput): void {
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] !== 'standing') continue;
      let pick = -1;
      let pickRange = Infinity;
      for (let p = 0; p < this.pursuerCount; p += 1) {
        const facts = input.pursuers[p];
        if (facts.crashed) continue;
        const range = facts.distance[k];
        if (range < pickRange) {
          pick = p;
          pickRange = range;
        }
      }
      this.nearestCop[k] = pick;
      this.nearestCopRange[k] = pickRange;
    }
  }

  /** Each pursuer's nearest standing outlaw: the human cop's bearing readout (q220) and F3. */
  private recordNearestOutlaws(input: ChaseRoomInput): void {
    for (let p = 0; p < this.pursuerCount; p += 1) {
      const distance = input.pursuers[p].distance;
      let pick = -1;
      let pickRange = Infinity;
      for (let k = 0; k < this.outlawCount; k += 1) {
        if (this.status[k] !== 'standing') continue;
        if (distance[k] < pickRange) {
          pick = k;
          pickRange = distance[k];
        }
      }
      this.nearestOutlaw[p] = pick;
      this.nearestOutlawRange[p] = pickRange;
    }
  }

  private endOutlaw(k: number, status: OutlawStatus, by: number, now: number, events: ChaseEvent[] | null): ChaseEvent[] {
    this.status[k] = status;
    this.endedAt[k] = now;
    this.creditedTo[k] = by;
    this.standingFlags[k] = false;
    this.standingCount -= 1;
    this.strikeBy[k] = -1;
    if (by >= 0) this.bustCount[by] += 1;
    const list = events ?? [];
    list.push(Object.freeze({ kind: 'out' as const, outlaw: k, pursuer: by, status, value: 0, seconds: now }));
    return list;
  }

  /**
   * The round is over: sweep the placements (q86 — by time standing, the
   * escaped sharing first, a shared place for a shared second, no tie-break
   * invented), freeze the result, and announce it.
   */
  private finish(events: ChaseEvent[] | null, now: number): ChaseRoomStep {
    this.phaseValue = 'ended';
    let escaped = 0;
    for (let k = 0; k < this.outlawCount; k += 1) {
      if (this.status[k] === 'escaped') escaped += 1;
      let ahead = 0;
      for (let j = 0; j < this.outlawCount; j += 1) {
        if (this.endedAt[j] > this.endedAt[k]) ahead += 1;
      }
      this.places[k] = 1 + ahead;
    }
    this.standingCount = 0;
    const outlaws = [];
    for (let k = 0; k < this.outlawCount; k += 1) {
      outlaws.push(Object.freeze({
        status: this.status[k],
        survived: this.endedAt[k],
        by: this.creditedTo[k],
        place: this.places[k],
      }));
    }
    const pursuers = [];
    for (let p = 0; p < this.pursuerCount; p += 1) {
      pursuers.push(Object.freeze({ kind: this.kinds[p], busts: this.bustCount[p] }));
    }
    this.resultValue = Object.freeze({
      seconds: now,
      bellSeconds: this.bell,
      swept: escaped === 0,
      escaped,
      outlaws: Object.freeze(outlaws),
      pursuers: Object.freeze(pursuers),
    });
    const list = events ?? [];
    list.push(Object.freeze({ kind: 'ended' as const, outlaw: -1, pursuer: -1, status: 'standing' as const, value: escaped, seconds: now }));
    return Object.freeze({ ended: true, events: Object.freeze(list) });
  }

  /**
   * The held room — `knockaboutMatch.ts`'s and `raceRun.ts`'s countdown
   * verbatim (q223): "3" is shown for the whole of the third second, GO
   * replaces "1", and GO flips the phase here and nowhere else. No clock runs
   * and nothing is decided while it counts.
   */
  private stepCountdown(stepSeconds: number): ChaseRoomStep {
    this.countdownRemaining = Math.max(0, this.countdownRemaining - stepSeconds);
    const shown = Math.ceil(this.countdownRemaining);
    let events: ChaseEvent[] | null = null;
    if (shown > 0 && shown !== this.countdownShown) {
      this.countdownShown = shown;
      events = [{ kind: 'count', outlaw: -1, pursuer: -1, status: 'standing', value: shown, seconds: 0 }];
    }
    if (this.countdownRemaining > 0) {
      return events === null ? QUIET_STEP : Object.freeze({ ended: false, events: Object.freeze(events) });
    }
    this.phaseValue = 'running';
    this.countdownShown = 0;
    const released = events ?? [];
    released.push({ kind: 'go', outlaw: -1, pursuer: -1, status: 'standing', value: 0, seconds: 0 });
    return Object.freeze({ ended: false, events: Object.freeze(released) });
  }

  private pursuerPhase(p: number): PursuerPhase {
    if (this.parkedNow[p]) return 'parked';
    if (this.kinds[p] === 'cpu' && this.roles[p] === 'patrol' && !this.engaged[p]) return 'waking';
    return 'chasing';
  }

  private elapsedSeconds(): number {
    if (this.phaseValue !== 'running' && this.phaseValue !== 'ended') return 0;
    return this.bell - Math.max(0, this.remainingSeconds);
  }

  /** Every per-round fact back to the start of a round; the spec and the bell survive. */
  private resetRound(): void {
    const n = this.outlawCount;
    const m = this.pursuerCount;
    this.remainingSeconds = this.bell;
    this.countdownRemaining = 0;
    this.countdownShown = -1;
    this.siren = Infinity;
    this.standingCount = n;
    this.resultValue = null;
    this.demandCount = 0;
    this.status = new Array<OutlawStatus>(n).fill('standing');
    this.endedAt = new Array<number>(n).fill(0);
    this.creditedTo = new Array<number>(n).fill(-1);
    this.outlawWasCrashed = new Array<boolean>(n).fill(false);
    this.outlawCrashed = new Array<boolean>(n).fill(false);
    this.strayedFor = new Array<number>(n).fill(0);
    this.quietFor = new Array<number>(n).fill(0);
    this.unpressuredFor = new Array<number>(n).fill(0);
    this.nearestCop = new Array<number>(n).fill(-1);
    this.nearestCopRange = new Array<number>(n).fill(Infinity);
    this.places = new Array<number>(n).fill(0);
    this.standingFlags = new Array<boolean>(n).fill(true);
    this.strikeBy = new Array<number>(n).fill(-1);
    this.strikeAge = new Array<number>(n).fill(0);
    this.quarry = new Array<number>(m).fill(-1);
    this.dealtFor = new Array<number>(m).fill(0);
    this.gapFor = new Array<number>(m).fill(0);
    this.stallFor = new Array<number>(m).fill(0);
    this.respiteLeft = new Array<number>(m).fill(0);
    this.pursuerWasCrashed = new Array<boolean>(m).fill(false);
    this.pursuerCrashed = new Array<boolean>(m).fill(false);
    this.parkedNow = new Array<boolean>(m).fill(false);
    this.wakePending = new Array<boolean>(m).fill(false);
    this.engaged = this.roles.map((role) => role === 'tail');
    this.bestRange = new Array<number>(m).fill(Infinity);
    this.closing = new Array<boolean>(m).fill(false);
    this.closingHold = new Array<number>(m).fill(0);
    this.bustCount = new Array<number>(m).fill(0);
    this.nearestOutlaw = new Array<number>(m).fill(-1);
    this.nearestOutlawRange = new Array<number>(m).fill(Infinity);
    this.named = new Array<boolean>(m).fill(false);
    this.sentAgo = new Array<number>(m).fill(Infinity);
    this.idleFor = new Array<number>(m).fill(0);
  }
}

// ---------------------------------------------------------------------------
// ChaseRun — the shipped solo referee, now a one-outlaw, one-cop room (§2a.6)
// ---------------------------------------------------------------------------

/** The solo room: one outlaw, Officer Dorkins as the tail and nobody else — today's chase. */
const SOLO_SPEC: ChaseRoomSpec = roomSpec(1, false, 1);

/** The wrapper's facts, written in place each step (rule 4: nothing allocated at 120 Hz). */
interface SoloOutlawFacts {
  offRoute: number;
  crashed: boolean;
}
interface SoloPursuerFacts {
  crashed: boolean;
  parked: boolean;
  speed: number;
  distance: number[];
  outlawClosing: number[];
}

/**
 * The shipped solo referee, kept verbatim in its API (A-2) and delegating
 * every rule to a private one-outlaw, one-tail `ChaseRoom`, so the solo face
 * is the one-outlaw case of the same referee (§39.6b.3 "Written once for N
 * outlaws") and every shipped case in `chase.test.ts` still pins it.
 *
 * The one behaviour this changes on purpose is A-1: a crash edge beside a
 * *ragdolled* Dorkins is no longer a bust, because a ragdolled officer
 * arrests nobody (§39.6b.3: "any standing cop") — the touch rule already said
 * so, and now the crash rule agrees with it.
 */
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

  private readonly room = new ChaseRoom();
  /** A regroup the referee has decided on and nobody has consumed yet. */
  private trackerDemand = false;
  private readonly outlawFacts: SoloOutlawFacts = { offRoute: 0, crashed: false };
  private readonly pursuerFacts: SoloPursuerFacts = {
    crashed: false,
    parked: false,
    speed: Infinity,
    distance: [0],
    outlawClosing: [0],
  };
  private readonly input: ChaseRoomInput = { outlaws: [this.outlawFacts], pursuers: [this.pursuerFacts] };

  get state(): ChaseState {
    const room = this.room;
    const phase = room.phase;
    const remaining = phase === 'idle' ? this.escapeSeconds : room.remaining;
    let mapped: ChasePhase = 'idle';
    let outcome: ChaseOutcome = 'none';
    if (phase === 'running') mapped = 'running';
    else if (phase === 'ended') {
      const status = room.statusOf(0);
      mapped = status === 'escaped' ? 'escaped' : 'busted';
      // `gaveUp` is a couch-only ending (q225) and is never set solo.
      outcome = status === 'standing' || status === 'gaveUp' ? 'none' : status;
    }
    const strayedFor = phase === 'idle' ? 0 : room.strayClockOf(0);
    return {
      phase: mapped,
      remaining: Math.max(0, remaining),
      survived: Math.max(0, this.escapeSeconds - Math.max(0, remaining)),
      outcome,
      straying: strayedFor > 0,
      strayGrace: Math.max(0, this.strayGraceSeconds - strayedFor),
      quiet: phase === 'idle' ? 0 : room.quietOf(0),
      respite: phase === 'idle' ? 0 : room.respiteOf(0),
    };
  }

  /** Start a run. The clock is full and nothing has happened yet. */
  arm(): void {
    this.push();
    // The shipped referee never refused a clock; a nonsense one ends on the
    // first step as it always would have, rather than throwing mid-menu.
    const bell = Number.isFinite(this.escapeSeconds) ? Math.max(0, this.escapeSeconds) : CHASE.escapeSeconds;
    this.room.arm(SOLO_SPEC, { bellSeconds: bell, countdownSeconds: 0 });
    this.trackerDemand = false;
  }

  /** Abandon a run in progress — a quit, or a world swapped underneath it. */
  abandon(): void {
    this.room.abandon();
    this.trackerDemand = false;
  }

  /**
   * One fixed step. Returns true on the step the run ends.
   *
   * Order matters and is stated rather than incidental: **the clock is spent
   * first**, so a rider who reaches zero on the same step they crash has
   * escaped. That is the generous reading and it is the right one — the run was
   * over before the crash, and losing on the last step to something that
   * happened after the whistle is the kind of unfairness §18.6 says is removed
   * rather than tuned. The room keeps that order (§2a.3).
   */
  step(dt: number, input: ChaseInput): boolean {
    if (this.room.phase !== 'running') return false;
    this.push();
    this.outlawFacts.offRoute = input.offRoute;
    this.outlawFacts.crashed = input.crashed;
    const cop = this.pursuerFacts;
    cop.crashed = input.copCrashed === true;
    // Every pre-§31 caller omits `copSpeed`: an unknown speed never stalls.
    cop.speed = input.copSpeed ?? Infinity;
    cop.distance[0] = input.copDistance;
    // Every pre-M24 caller omits the closing: absent reads as "nobody is closing".
    cop.outlawClosing[0] = input.riderClosingSpeed ?? 0;
    const result = this.room.step(dt, this.input);
    // The room's demands are this step's; the solo API latches a regroup until
    // it is consumed, as it always has.
    const demands = this.room.takeDemands();
    for (let index = 0; index < demands.length; index += 1) {
      if (demands[index].kind === 'tail-return') this.trackerDemand = true;
    }
    return result.ended;
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

  /** The live fields onto the room, before every step: F4 moves them mid-run as it always could. */
  private push(): void {
    const room = this.room;
    room.bustRadiusMetres = this.bustRadiusMetres;
    room.touchBustMetres = this.touchBustMetres;
    room.touchBustClosingSpeed = this.touchBustClosingSpeed;
    room.strayLimitMetres = this.strayLimitMetres;
    room.strayGraceSeconds = this.strayGraceSeconds;
    room.trackerGapMetres = this.trackerGapMetres;
    room.trackerHoldSeconds = this.trackerHoldSeconds;
    room.trackerQuietGapMetres = this.trackerQuietGapMetres;
    room.trackerQuietSeconds = this.trackerQuietSeconds;
    room.trackerRespiteSeconds = this.trackerRespiteSeconds;
    room.trackerStallSeconds = this.trackerStallSeconds;
    room.trackerStallSpeed = this.trackerStallSpeed;
    room.trackerStallGapMetres = this.trackerStallGapMetres;
    // The solo chase has no start hold: the 20 m is the head start, as it always was.
    room.copHoldSeconds = 0;
  }
}
