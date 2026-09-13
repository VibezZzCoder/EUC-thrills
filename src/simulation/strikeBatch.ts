/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * One fixed step's paddle hits, resolved once — M37 Phase 1 (`docs/PLANS.md`
 * §37.3, and q173's answer of 2026-09-13).
 *
 * `knockaboutMatch.ts`'s neighbour and nothing like it. The referee counts
 * knockdowns; **this file works out whose they are**, which is the arithmetic
 * a two-rider couch never needed: with two seats every strike was aimed at the
 * other one, the first caller's `hardKnock` succeeded, the second was refused
 * because the victim was already down, and the loop order that produced that
 * was seat order. At three and four riders that same code is a rule saying
 * *lower seat indices score first* — which is the rule §37.3 exists to refuse.
 *
 * Pure arithmetic and handed facts, like every file beside it: no `three`, no
 * `app/`, no DOM, no `Date`, no `Math.random`, no controller and no paddle.
 * It is handed what a paddle already worked out and what a controller already
 * knows, and it hands back a plan. Applying the plan is the composition root's
 * job (invariants 1 and 5).
 *
 * ## The rules, in the order they are applied
 *
 * **Record, then resolve** (§37.3). Every candidate hit of the step is
 * recorded against one consistent set of poses and eligibility facts, and
 * nothing is spent until every seat has stepped. A crash applied inside the
 * seat loop would make a victim's already-recorded return swing vanish
 * depending on who was visited first, which is the same defect q86 fixed in
 * the referee one milestone earlier.
 *
 * A recorded hit is **refused** — it does nothing at all — when:
 *
 * | Refusal | Why |
 * |---|---|
 * | `self` | A paddle cannot reach its own rider, and a batch that let it would credit a seat for its own crash. |
 * | `bad-swing` | The swing id is a `NaN` or an infinity, so the hit has no identity: it can be neither deduplicated against nor ordered beside another hit from the same paddle. `Paddle.swingCount` is an integer counter and cannot produce one, so this is a guard rather than a rule — but what it guards against is `resolveVictim`'s walk never terminating (a `NaN` advances past no swing, so the same entry is chosen for ever) and a `-Infinity` being accepted and then silently never walked. A frozen fixed step is a worse failure than a wrong number, which is why the check is here and not left to the caller. |
 * | `no-attacker` / `no-victim` | The seat is not in this bout, or its chair is empty. Empty chairs never fight. |
 * | `attacker-reset` / `victim-reset` | Either end teleported this step (§37.3's teleport hygiene). **Per participant**, so an unrelated exchange between two seats that did not move still stands — the old two-seat code voided the whole batch, which was honest only while every strike was aimed at the one other rider. |
 * | `victim-down` | Already crashed or crashing. A rider on the floor cannot be farmed, and does not even take a shove. |
 * | `duplicate` | The same attacker × swing × victim twice. First wins; the same swing may still reach *another* victim (q171). |
 *
 * An attacker who is **down** is deliberately not on that list. Their swing was
 * recorded before anybody's crash was applied, and §37.3 is explicit that a
 * paddle crash spent earlier in the same batch must not cancel the victim's
 * already-recorded return swing — q173's worked example turns on exactly that.
 * `down` gates a seat as a *victim* and never as an attacker.
 *
 * What survives is **eligible**, and an eligible victim is resolved once:
 *
 * - **Inside the recovery window** (q79, and `EucController.hardKnock`'s own
 *   refusal), nobody is credited and **every hit on them becomes a shove**.
 *   The rider who just got up is briefly untouchable; they are not
 *   untouchable and also scored against.
 * - Otherwise every **distinct attacker with a committed hit** on that victim
 *   is credited — q173's shared credit — **if the victim actually goes down**,
 *   which only the controller can answer and the caller therefore gates on.
 *   Uncommitted attackers are shoves and never credit.
 * - The physical crash is applied **once**, in a direction that no seat order
 *   can move: the normalised sum of the credited attackers' head travel,
 *   summed in ascending seat order so the floating-point result is identical
 *   under every permutation of the recorded batch. A degenerate sum — two
 *   paddles arriving from exactly opposite sides — falls back to pushing the
 *   victim **backward along their own heading**, which is a fact about the
 *   victim and about nobody else.
 *
 * **The order claim is over well-formed batches** — one record per attacker ×
 * swing × victim, which is the only shape `Game` can produce. The duplicate
 * refusal keeps the *first* hit recorded under a key, so a batch that recorded
 * one key twice with *different* facts — committed in one copy and not in the
 * other — would resolve differently under a permutation, and the test below
 * pins both halves of that rather than leaving the exception implied. It is
 * not reachable: one `Paddle.step` per attacker per tick, and `committed` and
 * `headTravelX`/`Z` belong to the swing the id names.
 *
 * Why not "whichever paddle landed first": `PaddleHit.t` is the nearest point
 * along **one** sweep, not a cross-paddle impact clock (`simulation/paddle.ts`).
 * Any "first" rule built on it would quietly become a seat-order rule, which
 * is the thing being removed. q173 records the owner's decision and this file
 * implements exactly it.
 *
 * ## What the caller must feed in, and what it must do with the answer
 *
 * The predicates are named here rather than described, because a paraphrase
 * of `hardKnock`'s refusal that drifts from it is a batch that credits a
 * knockdown the controller then refuses:
 *
 * | Fact | The expression `Game` must hand in |
 * |---|---|
 * | `present` | The seat exists in this bout and holds a rider (`index < seats.length`). |
 * | `down` | `seat.controller.crashed` — the getter over the private `crashing`, which is the first half of `EucController.hardKnock`'s refusal. |
 * | `immune` | `invulnerableTimer > 0`, the second half of that same refusal; today the only public reader is `controller.snapshot().invulnerable > 0`. If Phase 3 wants it without a snapshot, add a getter over the *same field* beside `crashed` — never a re-derivation from `crashTime` or a recovery constant. |
 * | `reset` | This seat teleported or was reset **this step** — M37's own per-seat latch, *not* `seatResetThisStep`, which `raceInputs` already consumes (§37.3: "do not steal the race's consumed reset flags as a second reader"). |
 * | `headingY` | The victim's heading in radians, `EucController`'s own convention: forward at heading φ is `(sin φ, cos φ)`. Only the degenerate fallback reads it. |
 *
 * And a recorded hit carries what the paddle already decided: `swing` is
 * `Paddle.swingCount` (monotonic, never reset — which is what makes it a
 * usable identity), `committed` is `Paddle.committed` read at the moment the
 * hit landed, and `travelX`/`travelZ` are `Paddle.headTravelX`/`headTravelZ`,
 * the two arguments `hardKnock` takes.
 *
 * **Applying a `StrikeOutcome`, in this order:**
 *
 * 1. If `crashDirection` is non-null, call `hardKnock(crashDirection.x,
 *    crashDirection.z)` on the victim — **once**.
 * 2. If that returned `true`, call `match.knockdown(attacker)` for **every**
 *    seat in `credited` (q173's shared credit; the referee counts them all,
 *    and `knockdown` is a recorder).
 * 3. Call `softKnock(CHASE.strikeSpeedCost)` on the victim once per seat in
 *    `shoves` — **after** the hard knock, so a shove that arrived beside a
 *    crash is the no-op `softKnock` already makes it.
 *
 * `credited` and `shoves` are disjoint and each lists a seat at most once, so
 * step 3 is a loop over seats rather than over hits.
 *
 * The direction's magnitude is irrelevant to the controller — `hardKnock`
 * reads only the sign of the travel's lateral projection — but it is
 * normalised anyway, because a vector whose length depended on how many
 * paddles arrived would be a physical quantity nobody chose.
 */

/** One recorded candidate hit. Facts from the paddle, nothing judged yet. */
export interface RecordedStrike {
  readonly attacker: number;
  readonly victim: number;
  /** `Paddle.swingCount`, the swing's identity. Monotonic and never reset. */
  readonly swing: number;
  /** `Paddle.committed` when the hit landed. Uncommitted hits shove. */
  readonly committed: boolean;
  /** `Paddle.headTravelX` — the head's ground-plane travel this step. */
  readonly travelX: number;
  /** `Paddle.headTravelZ`. */
  readonly travelZ: number;
}

/** One seat's eligibility facts for this step. See the table in the header. */
export interface StrikeParticipant {
  readonly present: boolean;
  /** Crashed or crashing — `hardKnock`'s first refusal. */
  readonly down: boolean;
  /** Inside the recovery window — `hardKnock`'s second refusal (q79). */
  readonly immune: boolean;
  /** Teleported or reset this step (§37.3's per-participant hygiene). */
  readonly reset: boolean;
  /** Radians. Forward is `(sin φ, cos φ)`; only the fallback reads it. */
  readonly headingY: number;
}

/** A unit vector in the ground plane — `hardKnock`'s two arguments. */
export interface StrikeDirection {
  readonly x: number;
  readonly z: number;
}

/** What happens to one victim this step. The caller's whole instruction. */
export interface StrikeOutcome {
  readonly victim: number;
  /**
   * The one hard knock to apply, or null when nothing eligible was committed
   * at them (every hit was a shove, or they are inside the recovery window).
   */
  readonly crashDirection: StrikeDirection | null;
  /**
   * The seats to credit **if the hard knock lands**, ascending — q173.
   *
   * Empty whenever `crashDirection` is null. Never credited on the caller's
   * own authority: the controller decides whether the victim went down.
   */
  readonly credited: readonly number[];
  /** The seats whose hit is a shove, ascending. Disjoint from `credited`. */
  readonly shoves: readonly number[];
}

/** Why one recorded hit did nothing. For tests, QA and nothing else. */
export type StrikeRefusal =
  | 'self'
  | 'bad-swing'
  | 'no-attacker'
  | 'no-victim'
  | 'attacker-reset'
  | 'victim-reset'
  | 'victim-down'
  | 'duplicate';

export interface RefusedStrike {
  readonly attacker: number;
  readonly victim: number;
  readonly swing: number;
  readonly reason: StrikeRefusal;
}

/** One step's whole plan. */
export interface StrikeResolution {
  /** One entry per victim with at least one accepted hit, ascending seat. */
  readonly victims: readonly StrikeOutcome[];
  /**
   * Every hit that did nothing, **in the order it was recorded**.
   *
   * Recorded order rather than seat order because this is a diagnostic: it
   * answers "what did the batch see" for a QA pass reading a log. Nothing in
   * the outcome depends on it, which is what the permutation tests pin.
   */
  readonly refused: readonly RefusedStrike[];
  /**
   * How many hits the bounded scratch could not take — §37.3's "no silent
   * overflow". Always zero in a batch `Game` can legitimately produce.
   */
  readonly overflowed: number;
}

const NO_VICTIMS: readonly StrikeOutcome[] = Object.freeze([]);
const NO_REFUSALS: readonly RefusedStrike[] = Object.freeze([]);
const NO_SEATS: readonly number[] = Object.freeze([]);

/** The resolution of a step in which nobody swung, which is nearly all of them. */
const NOTHING_HAPPENED: StrikeResolution = Object.freeze({
  victims: NO_VICTIMS,
  refused: NO_REFUSALS,
  overflowed: 0,
});

/**
 * How short a summed travel vector has to be before it has no direction in it.
 *
 * **A numerical guard, not a tunable** — it exists to keep a division by a
 * length out of the code and has no effect a player could ever perceive: the
 * controller reads the *sign* of the lateral projection, so anything longer
 * than this rounds to the same crash side whatever its length. Two paddles
 * arriving from exactly opposite sides is the case it catches, and a metre of
 * head travel is a large number beside a micrometre.
 */
const DEGENERATE_TRAVEL_METRES = 1e-6;

/**
 * The couch's width, restated.
 *
 * `app/couch.ts` owns `COUCH_SEATS`, and `simulation/` may not import `app/`
 * (invariant 5, enforced by `src/architecture.test.ts`). So the default is
 * written here and the composition root passes its own constant in, which is
 * the arrangement that cannot drift: the day the couch widens, the caller
 * hands in the new number and this file does not have to be found.
 */
const DEFAULT_SEATS = 4;

/**
 * One step's recorded hits and the arithmetic that resolves them.
 *
 * **Bounded scratch, owned once.** At four seats there are twelve directed
 * pairs and `Game` steps each attacker's paddle exactly once per tick, so
 * twelve is the worst legitimate step and the pool is exactly that big. The
 * buffer it replaces held four entries — one per *attacker* — and dropped the
 * overflow with no error at all (§37.2); here a thirteenth hit is refused out
 * loud, through `record`'s return and through `overflowed`.
 *
 * Parallel arrays rather than objects because this is filled in place every
 * tick of every couch match, and the project has already removed one
 * per-step `slice()` from this path for that reason.
 */
export class StrikeBatch {
  /** The widest room this batch can resolve. */
  readonly seats: number;
  /** Directed pairs at that width — `seats × (seats − 1)`. */
  readonly capacity: number;

  private readonly attackerOf: number[];
  private readonly victimOf: number[];
  private readonly swingOf: number[];
  private readonly committedOf: boolean[];
  private readonly travelXOf: number[];
  private readonly travelZOf: number[];
  private readonly acceptedAt: boolean[];
  private size = 0;
  private overflow = 0;

  constructor(seats: number = DEFAULT_SEATS) {
    if (!Number.isInteger(seats) || seats < 2) {
      throw new RangeError(`a strike batch needs at least two seats, not ${seats}`);
    }
    this.seats = seats;
    this.capacity = seats * (seats - 1);
    this.attackerOf = new Array<number>(this.capacity).fill(-1);
    this.victimOf = new Array<number>(this.capacity).fill(-1);
    this.swingOf = new Array<number>(this.capacity).fill(-1);
    this.committedOf = new Array<boolean>(this.capacity).fill(false);
    this.travelXOf = new Array<number>(this.capacity).fill(0);
    this.travelZOf = new Array<number>(this.capacity).fill(0);
    this.acceptedAt = new Array<boolean>(this.capacity).fill(false);
  }

  /** How many hits are waiting to be resolved. */
  get recorded(): number {
    return this.size;
  }

  /** How many were refused for want of room since the last `clear`. */
  get overflowed(): number {
    return this.overflow;
  }

  /**
   * Empty the batch.
   *
   * Called unconditionally at the top of the spend, **above every early
   * return** — the one property of the buffer it replaces that was already
   * right, and the reason a mode switch mid-step cannot leave a stale hit to
   * be spent on the next one.
   */
  clear(): void {
    this.size = 0;
    this.overflow = 0;
  }

  /**
   * Take one candidate hit. Returns false only when the pool is full.
   *
   * Nothing is judged here: eligibility is a fact about the whole step and
   * the step is not over. A false return is a bug in the caller worth saying
   * out loud — it means more than `capacity` directed hits were recorded,
   * which needs either a wider room or a paddle stepped twice.
   */
  record(
    attacker: number,
    victim: number,
    swing: number,
    committed: boolean,
    travelX: number,
    travelZ: number,
  ): boolean {
    if (this.size >= this.capacity) {
      this.overflow += 1;
      return false;
    }
    const at = this.size;
    this.attackerOf[at] = attacker;
    this.victimOf[at] = victim;
    this.swingOf[at] = swing;
    this.committedOf[at] = committed;
    this.travelXOf[at] = travelX;
    this.travelZOf[at] = travelZ;
    this.size = at + 1;
    return true;
  }

  /**
   * Resolve the whole batch against this step's participant facts.
   *
   * `participants` is index-for-index with the seats. Everything the result
   * names is in ascending seat order, and the sums that decide a crash
   * direction are accumulated in that same order, so the answer is identical
   * however the hits were recorded — which is the whole claim §37.3 makes and
   * the one the permutation tests hold it to.
   *
   * Allocates on a step where something landed and not otherwise: a step with
   * no hits returns one shared frozen object. Paddle hits are rare events in
   * a tick, unlike the recording above them, so the simple shape was taken
   * over a second pool of result objects.
   */
  resolve(participants: readonly StrikeParticipant[]): StrikeResolution {
    if (this.size === 0 && this.overflow === 0) return NOTHING_HAPPENED;

    const refused: RefusedStrike[] = [];
    for (let at = 0; at < this.size; at += 1) {
      const reason = this.refusalFor(at, participants);
      this.acceptedAt[at] = reason === null;
      if (reason !== null) {
        refused.push(Object.freeze({
          attacker: this.attackerOf[at],
          victim: this.victimOf[at],
          swing: this.swingOf[at],
          reason,
        }));
      }
    }

    const victims: StrikeOutcome[] = [];
    for (let victim = 0; victim < participants.length; victim += 1) {
      const outcome = this.resolveVictim(victim, participants);
      if (outcome !== null) victims.push(outcome);
    }

    return Object.freeze({
      victims: victims.length === 0 ? NO_VICTIMS : Object.freeze(victims),
      refused: refused.length === 0 ? NO_REFUSALS : Object.freeze(refused),
      overflowed: this.overflow,
    });
  }

  /**
   * Why this hit does nothing, or null.
   *
   * The order of the tests is the order of the table in the header, and it is
   * the order a reader would ask them in: is it even a pair, does the swing
   * have an identity, are both ends in the bout, did either end move, is the
   * victim already down, and only then is it a repeat. A hit with two problems
   * is reported under the first, which is a diagnostic's choice and changes no
   * outcome.
   *
   * The swing test comes early because everything below it uses the id as an
   * identity: the duplicate scan compares swings, and `nextHitOn` walks them in
   * order. A `NaN` satisfies neither comparison, and the walk it produces does
   * not terminate — so a malformed id is refused before anything reads it.
   */
  private refusalFor(at: number, participants: readonly StrikeParticipant[]): StrikeRefusal | null {
    const attacker = this.attackerOf[at];
    const victim = this.victimOf[at];
    if (attacker === victim) return 'self';
    if (!Number.isFinite(this.swingOf[at])) return 'bad-swing';
    if (!fighting(attacker, participants)) return 'no-attacker';
    if (!fighting(victim, participants)) return 'no-victim';
    if (participants[attacker].reset) return 'attacker-reset';
    if (participants[victim].reset) return 'victim-reset';
    if (participants[victim].down) return 'victim-down';
    for (let earlier = 0; earlier < at; earlier += 1) {
      if (!this.acceptedAt[earlier]) continue;
      if (this.attackerOf[earlier] !== attacker) continue;
      if (this.victimOf[earlier] !== victim) continue;
      if (this.swingOf[earlier] !== this.swingOf[at]) continue;
      return 'duplicate';
    }
    return null;
  }

  /**
   * What this step does to one victim, or null when nothing reached them.
   *
   * The attacker loop runs over seats rather than over recorded hits, which
   * is what makes the travel sum bit-identical under a permutation: floating
   * addition is not associative, so "sum the credited travels" is only a
   * deterministic instruction once the order is named.
   */
  private resolveVictim(
    victim: number,
    participants: readonly StrikeParticipant[],
  ): StrikeOutcome | null {
    const facts = participants[victim];
    let reached = false;
    const credited: number[] = [];
    const shoves: number[] = [];
    let sumX = 0;
    let sumZ = 0;

    for (let attacker = 0; attacker < participants.length; attacker += 1) {
      let hits = false;
      let committedHits = false;
      // Ascending swing, for the sum's sake, and chosen by scan rather than
      // collected into an array: one `Paddle.step` per attacker per tick means
      // one swing per attacker per batch, so this loop finds at most one hit
      // today. It is written for the order rather than for the count, because
      // an order that only holds by coincidence is not an order — and without
      // allocating, because the scan is over at most twelve entries.
      let previousSwing = Number.NEGATIVE_INFINITY;
      for (;;) {
        const at = this.nextHitOn(attacker, victim, previousSwing);
        if (at === -1) break;
        previousSwing = this.swingOf[at];
        hits = true;
        if (facts.immune || !this.committedOf[at]) continue;
        committedHits = true;
        sumX += this.travelXOf[at];
        sumZ += this.travelZOf[at];
      }
      if (!hits) continue;
      reached = true;
      if (committedHits) credited.push(attacker);
      else shoves.push(attacker);
    }

    if (!reached) return null;

    let crashDirection: StrikeDirection | null = null;
    if (credited.length > 0) {
      const length = Math.hypot(sumX, sumZ);
      crashDirection = length > DEGENERATE_TRAVEL_METRES
        ? Object.freeze({ x: sumX / length, z: sumZ / length })
        // Two paddles from exactly opposite sides cancel, and the victim is
        // still owed a fall. Backward along their own heading is the one
        // direction in the problem that belongs to nobody else (q173).
        : Object.freeze({ x: -Math.sin(facts.headingY), z: -Math.cos(facts.headingY) });
    }

    return Object.freeze({
      victim,
      crashDirection,
      credited: credited.length === 0 ? NO_SEATS : Object.freeze(credited),
      shoves: shoves.length === 0 ? NO_SEATS : Object.freeze(shoves),
    });
  }

  /**
   * This attacker's next accepted hit on this victim past `afterSwing`, or -1.
   *
   * Two accepted hits on one directed pair cannot share a swing id — that is
   * what the duplicate refusal guarantees — and every accepted swing is finite,
   * which is what the `bad-swing` refusal guarantees. Between them, "the lowest
   * swing above the last one" walks them all exactly once and then stops.
   */
  private nextHitOn(attacker: number, victim: number, afterSwing: number): number {
    let chosen = -1;
    for (let at = 0; at < this.size; at += 1) {
      if (!this.acceptedAt[at]) continue;
      if (this.attackerOf[at] !== attacker || this.victimOf[at] !== victim) continue;
      const swing = this.swingOf[at];
      if (swing <= afterSwing) continue;
      if (chosen === -1 || swing < this.swingOf[chosen]) chosen = at;
    }
    return chosen;
  }
}

/** Is this seat index a rider in this bout at all? */
function fighting(seat: number, participants: readonly StrikeParticipant[]): boolean {
  if (!Number.isInteger(seat) || seat < 0 || seat >= participants.length) return false;
  return participants[seat].present;
}
