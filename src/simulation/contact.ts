/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CONTACT } from '../data/tuning.ts';

/** One body's ground-plane state at the contact seam. */
export interface ContactBody {
  readonly x: number;
  readonly z: number;
  readonly velocityX: number;
  readonly velocityZ: number;
}

/** The live-tunable quantities one contact resolution reads. */
export interface ContactTuning {
  readonly radiusMetres: number;
  readonly cooldownSeconds: number;
  readonly separationSpeed: number;
  readonly speedCost: number;
}

/** What one body receives from a symmetric contact. */
export interface ContactBump {
  readonly pushX: number;
  readonly pushZ: number;
  readonly speedCost: number;
}

/** Equal costs for the two bodies, named only by call order. */
export interface ContactCharge {
  readonly first: ContactBump;
  readonly second: ContactBump;
}

/**
 * One step's answer for an overlapping pair.
 *
 * **Two things on different clocks, and conflating them was the original
 * error.** The *charge* — a wobble and a speed shed — is an event, and §26.3's
 * cooldown exists so a merged pair is not punished continuously. The
 * *separation* is not an event at all: it is the answer to "these two are in
 * the same place", which stays true every step until it is not, and gating it
 * behind the same cooldown left two riders free to sit inside one another for
 * 0.40 s at a time. So `charge` is null while the cooldown holds and
 * `pushMetres` never is.
 */
export interface ContactResult {
  /** Unit axis from `first` toward `second`, in the ground plane. */
  readonly axisX: number;
  readonly axisZ: number;
  /** How far **each** body should move apart this step, metres. */
  readonly pushMetres: number;
  /** The wobble and speed shed, or null while the cooldown holds. */
  readonly charge: ContactCharge | null;
}

/**
 * Stateful edge detector for one unordered pair of bodies.
 *
 * A pair pays on entry and then not again until the cooldown has run out,
 * whether they stayed merged for it or came apart and met again. The caller
 * owns pair identity; this class knows no actor names, modes, or seats.
 */
export class ContactPair {
  private cooldownRemaining = 0;

  /**
   * Whether the pair was already overlapping when it was last asked.
   *
   * **The charge is an edge, and it took the owner's ride to find out that it
   * has to be.** §26.3 wrote the rule as *overlap this step and not the last,
   * **or** overlap after the cooldown expired* — a re-charge that was safe only
   * because the old velocity impulse flung the pair apart before the second one
   * could land. A positional separation holds equilibrium instead: two riders
   * leaning into each other settle at exactly the radius and stay there, and
   * the second clause then delivered a fresh `softKnock` every 0.40 s into a
   * wobble that had not finished decaying. **Measured: both riders on the
   * ground after about three seconds of leaning together** — a bump that
   * crashes you, which is precisely what q72 forbids.
   *
   * So the two clauses are ANDed rather than ORed. Contact must be *entered* to
   * be charged, **and** the cooldown must have run out.
   *
   * **The second half of that sentence was a lie for a day** (fixed 2026-08-27,
   * found by the Codex QA pass). `step` erased the timer the moment the pair
   * came apart, and the separation above *deliberately overshoots the
   * boundary* so that a contact can end — so every contact ended by clearing
   * the very timer that was supposed to bound it. §26.3's table asks
   * `cooldownSeconds` to "exceed the time separation takes to clear the
   * overlap, **or the edge re-arms inside the same collision**"; erasing it on
   * separation guaranteed the thing the constant was written to prevent, and
   * left a live F4 slider that no value of could change any behaviour at all —
   * 0 s, 0.40 s and 999 s all gave four charges in 0.067 s.
   *
   * What it cost, measured through two real controllers: a **slow** head-on
   * nudge, 2.4–3.5 m/s closing, was charged four times inside 67 ms and put
   * both riders on the ground, while a 17 m/s ram was charged once and put
   * nobody down. The gentlest contact in the game was the only one that
   * crashed you — the owner reported it as "flies out even at very slow speed
   * … as if they were colliding at very high speed", and it is q72 again,
   * arriving by a different road than the one this comment already describes.
   *
   * So an ordinary separation now decays the timer and never zeroes it. A
   * sustained lean is one shove; a pair jittering across the boundary is also
   * one shove, because 67 ms of jitter is one collision however many times the
   * distance crossed the radius. Backing off and coming at somebody again
   * still costs, because a real second approach cannot be done inside 0.40 s:
   * clearing a 0.80 m radius and returning takes far longer than that at any
   * speed a rider can turn around in. Only `clear` zeroes it, and only because
   * a discontinuity is not a separation.
   */
  private overlapping = false;

  /**
   * Forget the edge, because this pair is no longer being resolved.
   *
   * **A stateful detector's rules are only true while somebody is calling
   * it.** `step` decays the cooldown on every step it is given, merged or not,
   * so a pair that has genuinely finished with each other is clear within
   * `cooldownSeconds` — but a caller that stops calling never delivers those
   * steps, and the pair wakes up still holding a cooldown from a meeting that
   * is over. The symptom is the *first* bump of the next session silently
   * going missing, which no assertion about the session itself can see.
   *
   * This is the one place a cooldown is zeroed rather than run down, and that
   * is the distinction the method is for: coming apart is part of a collision,
   * whereas being teleported, sent home or switched off is not.
   *
   * The caller owns when that happens, because the caller is what knows the
   * pair stopped existing: contact switched off, a rider teleported, a guest
   * sent home. Cheaper than the branch that would decide it here, and it keeps
   * this class free of any opinion about seats or sessions.
   */
  clear(): void {
    this.cooldownRemaining = 0;
    this.overlapping = false;
  }

  /**
   * Treat the pair as already overlapping without charging it — a recovery
   * placed one body inside the other (1.4.0 QA COUCH-4). Being set down is a
   * discontinuity, not an entry: the pair still separates every step, and
   * pays only if it comes apart and meets again.
   */
  adoptOverlap(): void {
    this.overlapping = true;
  }

  step(
    dt: number,
    first: ContactBody,
    second: ContactBody,
    tuning: ContactTuning = CONTACT,
  ): ContactResult | null {
    const deltaX = second.x - first.x;
    const deltaZ = second.z - first.z;
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;

    if (distanceSquared > tuning.radiusMetres * tuning.radiusMetres) {
      // **A separation ends the overlap; it does not end the cooldown.** This
      // line used to set the timer to zero, which made `cooldownSeconds` a
      // constant no value of which could change anything: measured at 0 s,
      // 0.40 s and 999 s, a pair chattering across the boundary took **four
      // charges in 0.067 s** in all three. See `overlapping` for what that
      // cost the owner.
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
      this.overlapping = false;
      return null;
    }
    const entered = !this.overlapping;
    this.overlapping = true;

    const distance = Math.sqrt(distanceSquared);
    const relativeX = first.velocityX - second.velocityX;
    const relativeZ = first.velocityZ - second.velocityZ;
    const relativeSpeed = Math.hypot(relativeX, relativeZ);
    const axisX = distance > 0
      ? deltaX / distance
      : relativeSpeed > 0
        ? relativeX / relativeSpeed
        : 1;
    const axisZ = distance > 0
      ? deltaZ / distance
      : relativeSpeed > 0
        ? relativeZ / relativeSpeed
        : 0;
    // **The `+ 0` terms normalise negative zero, and they are load-bearing.**
    // A zero axis component arrives here as either `0` or `-0` depending on
    // which branch above produced it, negating one gives the other, and
    // `Object.is(-0, 0)` is false — so without these the two halves of a
    // symmetric result can differ in a way no arithmetic can see but every
    // strict comparison can. This file's own asserts are strict (`import
    // { strict as assert }` aliases `deepEqual` to `deepStrictEqual`), and
    // removing them fails `contact.test.ts` immediately. Adding zero is the
    // one operation that maps `-0` to `0` and leaves every other value alone.
    const pushX = axisX * tuning.separationSpeed + 0;
    const pushZ = axisZ * tuning.separationSpeed + 0;

    // **The separation, every step, and it is a distance rather than a
    // velocity.** `separationSpeed` is the rate the pair comes apart at, so one
    // step's worth is `rate × dt`, bounded by the overlap so that a deeply
    // merged pair is eased apart rather than teleported by a large slider
    // value.
    //
    // **Bounded by the whole overlap and not by half of it, so the pair clears
    // the boundary instead of resting on it.** Half is the arithmetically
    // tidy answer — two bodies each closing half the gap meet exactly at
    // touching — and exactly touching is the one distance at which a pair is
    // still `<=` the radius forever: they would go on being a live contact,
    // re-charged every cooldown, for as long as two players stood near each
    // other. Overshooting is what ends the contact, and it is bounded by one
    // step's rate — a centimetre at the stock value — because the final step is
    // the only one the overlap is smaller than the rate.
    const overlap = tuning.radiusMetres - distance;
    const pushMetres = Math.max(0, Math.min(tuning.separationSpeed * dt, overlap));

    // The charge is the half that is an event: it needs an *entry* and a clear
    // cooldown, not either one — and the cooldown has to have survived the
    // separation to be worth asking about. See `overlapping` for both, and for
    // what each one cost before it was true.
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    let charge: ContactCharge | null = null;
    if (entered && this.cooldownRemaining <= 0) {
      this.cooldownRemaining = tuning.cooldownSeconds;
      charge = {
        first: { pushX: -pushX + 0, pushZ: -pushZ + 0, speedCost: tuning.speedCost },
        second: { pushX, pushZ, speedCost: tuning.speedCost },
      };
    }

    return { axisX, axisZ, pushMetres, charge };
  }
}

/**
 * What a seat's controller offers the contact pass — `EucController`'s own
 * doors, named here so the pass can be driven headless by the very code the
 * game runs.
 */
export interface ContactRider {
  /** In a skatepark come-back air (1.4.0); false on every other world. */
  readonly inComeBackAir: boolean;
  /** Bumped by every reset and recovery placement. */
  readonly discontinuitySerial: number;
  separate(deltaX: number, deltaZ: number): void;
  bump(pushX: number, pushZ: number, speedCost: number): void;
}

/**
 * Every unordered pair of up to `capacity` seats, plus the two per-seat rules
 * a pair cannot see — the couch's contact pass (M27, repaired 1.4.0 QA).
 *
 * **A charge is capped per rider, not only per pair** (QA COUCH-1). Each pair
 * keeps its own edge and cooldown, so with three or four seats one rider took
 * a `softKnock` from two or three pairs inside one step — 0.35 wobble each
 * against a crash at 1.0 — and a bump crashed them, which q72 forbids. A seat
 * now takes at most one charge per `cooldownSeconds`, whichever pair delivers
 * it; the separation still runs every step for every pair. The gate only
 * applies while three or more seats take part: with two there is one pair,
 * whose own cooldown already is the seat's, so a two-seat room is exactly
 * what it was.
 *
 * **A come-back air is outside contact** (QA COUCH-3). Contact is planar, and a
 * come-back air hangs over the coping above whoever climbs the face beneath
 * it: the separation slid the airborne rider over the deck. The pair is not
 * resolved while either seat is in one, and so (this file's rule) forgets
 * its history. Inert off the skatepark: nothing else sets the flag.
 *
 * **A recovery set down inside another rider is not a collision** (QA
 * COUCH-4), on a plan whose recoveries restart at rest — where followers on
 * one line walk back to the same clear point. The pair is adopted as already
 * overlapping, so the placement itself charges nobody; it still separates.
 */
export class ContactRoom {
  private readonly pairs = new Map<number, ContactPair>();
  private readonly chargeRemaining: number[];
  private readonly serials: number[];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.chargeRemaining = new Array<number>(capacity).fill(0);
    this.serials = new Array<number>(capacity).fill(Number.NaN);
  }

  /**
   * The `ContactPair` that belongs to one unordered pair of seats, created on
   * demand and kept for the session. The key is symmetric by construction, so
   * (1, 3) and (3, 1) are one pair with one cooldown.
   */
  pairFor(first: number, second: number): ContactPair {
    const key = this.key(first, second);
    let pair = this.pairs.get(key);
    if (pair === undefined) {
      pair = new ContactPair();
      this.pairs.set(key, pair);
    }
    return pair;
  }

  /** Forget one pair's history, if it has any. */
  clearPair(first: number, second: number): void {
    this.pairs.get(this.key(first, second))?.clear();
  }

  /** Forget every pair's history and every seat's charge clock — the discontinuity door. */
  clear(): void {
    for (const pair of this.pairs.values()) pair.clear();
    this.chargeRemaining.fill(0);
  }

  /** Forget one seat's pairs and charge clock (a despawn). */
  clearSeat(index: number): void {
    for (let other = 0; other < this.capacity; other += 1) {
      if (other !== index) this.clearPair(index, other);
    }
    this.chargeRemaining[index] = 0;
  }

  /**
   * A step some seats teleported on (a respawn, `R`): forget those seats'
   * pairs and charge clocks, and only theirs (1.4.0, QA R2-COUCH1-CLEAR). The
   * caller skips `step` for it, as ever. A whole `clear` here also zeroed the
   * pair cooldown and charge clock of two riders who had not moved and were
   * still leaning on each other, so their overlap was a fresh entry on the
   * next step: a third seat pressing `R` a few times a second charged them
   * again on every press and wobble-crashed them (q72). With two seats the
   * one pair holds the resetting seat, so this is `clear` exactly.
   */
  forgetResets(reset: readonly boolean[]): void {
    for (let index = 0; index < this.capacity && index < reset.length; index += 1) {
      if (reset[index]) this.clearSeat(index);
    }
  }

  /**
   * Resolve one step for the first `bodies.length` seats. `excluded` names a
   * seat outside contact this step (a couch chase's cop); `placementsAtRest`
   * is the plan's `restartsAtRest`.
   */
  step(
    dt: number,
    bodies: readonly ContactBody[],
    riders: readonly ContactRider[],
    tuning: ContactTuning,
    excluded: ((seat: number) => boolean) | null,
    placementsAtRest: boolean,
  ): void {
    const seats = Math.min(bodies.length, riders.length, this.capacity);
    let taking = 0;
    for (let index = 0; index < seats; index += 1) {
      if (excluded === null || !excluded(index)) taking += 1;
      this.chargeRemaining[index] = Math.max(0, this.chargeRemaining[index] - dt);
    }
    const gated = taking >= 3;
    const radiusSquared = tuning.radiusMetres * tuning.radiusMetres;
    for (let index = 0; index < seats; index += 1) {
      const serial = riders[index].discontinuitySerial;
      if (placementsAtRest && serial !== this.serials[index]) {
        for (let other = 0; other < seats; other += 1) {
          if (other === index) continue;
          const deltaX = bodies[other].x - bodies[index].x;
          const deltaZ = bodies[other].z - bodies[index].z;
          if (deltaX * deltaX + deltaZ * deltaZ <= radiusSquared) this.pairFor(index, other).adoptOverlap();
        }
      }
      this.serials[index] = serial;
    }

    // **Every unordered pair, and the pushes accumulate** — M27 Phase 1. Three
    // riders meeting at a corner are three pairs, and each one is entitled to
    // its own separation. `separate` and `bump` are additive nudges, so two
    // pairs pushing one rider add up the way two shoves would.
    for (let first = 0; first < seats; first += 1) {
      for (let second = first + 1; second < seats; second += 1) {
        if (excluded !== null && (excluded(first) || excluded(second))) {
          this.clearPair(first, second);
          continue;
        }
        if (riders[first].inComeBackAir || riders[second].inComeBackAir) {
          this.clearPair(first, second);
          continue;
        }
        const contact = this.pairFor(first, second).step(dt, bodies[first], bodies[second], tuning);
        if (contact === null) continue;
        // The separation first, and every step; the charge is the event.
        riders[first].separate(-contact.axisX * contact.pushMetres, -contact.axisZ * contact.pushMetres);
        riders[second].separate(contact.axisX * contact.pushMetres, contact.axisZ * contact.pushMetres);
        const charge = contact.charge;
        if (charge === null) continue;
        if (this.admit(first, tuning.cooldownSeconds, gated)) {
          riders[first].bump(charge.first.pushX, charge.first.pushZ, charge.first.speedCost);
        }
        if (this.admit(second, tuning.cooldownSeconds, gated)) {
          riders[second].bump(charge.second.pushX, charge.second.pushZ, charge.second.speedCost);
        }
      }
    }
  }

  /** Whether `seat` may take a charge now; arms its clock when it does. */
  private admit(seat: number, cooldownSeconds: number, gated: boolean): boolean {
    if (gated && this.chargeRemaining[seat] > 0) return false;
    this.chargeRemaining[seat] = cooldownSeconds;
    return true;
  }

  private key(first: number, second: number): number {
    return Math.min(first, second) * this.capacity + Math.max(first, second);
  }
}
