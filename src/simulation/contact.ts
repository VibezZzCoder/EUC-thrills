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
 * A continuously merged pair pays on entry, then at most once per cooldown.
 * Leaving the overlap clears the edge immediately, so the next overlap is a
 * new contact. The caller owns pair identity; this class knows no actor names,
 * modes, or seats.
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
   * be charged, and the cooldown still bounds a pair jittering across the
   * boundary faster than it can be charged for. A sustained lean is one shove,
   * not a machine gun; ramming somebody repeatedly still costs once per
   * approach, because each approach is a real edge.
   */
  private overlapping = false;

  /**
   * Forget the edge, because this pair is no longer being resolved.
   *
   * **A stateful detector's rules are only true while somebody is calling
   * it.** `step` clears the cooldown the moment the pair separates, so the next
   * overlap is a new contact — but a caller that stops calling never delivers
   * that separation, and the pair wakes up still holding a cooldown from a
   * meeting that is over. The symptom is the *first* bump of the next session
   * silently going missing, which no assertion about the session itself can
   * see.
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
      this.cooldownRemaining = 0;
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
    // cooldown, not either one. See `overlapping` for what the owner's ride
    // proved about the `or`.
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
