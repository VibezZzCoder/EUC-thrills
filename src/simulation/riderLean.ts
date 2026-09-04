/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { clamp01, lerp } from '../shared/maths.ts';

/**
 * The rider's share of the lean — one expression, every reader (M30 Phase 3,
 * `docs/PLANS.md` §30.3c).
 *
 * `EucController.writePose` and `snapshot` write `riderRoll` through it, the
 * ghost derives its rider roll from its recording through it, and the
 * clearance contracts (`render/riderClearance.test.ts`) bound their sweep by
 * it. The arithmetic lives in one place because copying it is how the ghost
 * and the player drift apart on a tuning change.
 *
 * Three bands, by **absolute** speed — the anchors do not follow the top
 * speed (the third scope answer of §30.3), so 40 mph leans the same on the
 * shipped build and on a `?mph=65` one, and the A/B isolates the top speed:
 *
 *   - **Below `carveLeanSpeed`** (6 m/s, exactly where M16's hard technique
 *     has fully faded): today's expression, to the bit. The upper body keeps
 *     `riderUpperBodyRollFactor` of the wheel's roll, less again inside a
 *     hard technical turn (`technicalTurnUpperBodyRollFactor`). This is the
 *     M16 band the owner approved, and nothing below 6 m/s changes.
 *   - **Between** `carveLeanSpeed` and `carveLeanFullSpeed` (22.25 m/s, the
 *     shipped wheel's flat terminal as the controller reaches it): a linear blend from that share to
 *     the full one, so the lean arrives with the speed rather than at a step.
 *   - **At and above** `carveLeanFullSpeed`: `carveLeanShareTop` of
 *     `riderLean`. 1.0 is the whole of the cornering lean — the pose of the
 *     §30.1 photographs, hips inside — which past the wheel's own bank ceiling
 *     is already a *hang*: the pelvis hinge `ridingRig.ts` writes,
 *     `-(riderRoll − rollAngle)`, is zero only while the wheel is unsaturated
 *     and reaches 9.5° at the 1.05 g top. Above 1.0 the torso rolls further
 *     inside again (q115).
 *
 * `riderLean` is the lean the cornering force asks for, `atan(a / g)`,
 * followed through the same `rollResponseSeconds` the wheel uses so the body
 * and the wheel arrive in the corner together. Below the ordinary ceiling it
 * is the wheel's own `rollAngle` to the bit; **above it (M30 Phase 2, §30.7)
 * the wheel's bank saturates and this does not**, so the rider hangs inside
 * the machine's line — 9.5° at the 1.05 g top on pavement, before this
 * schedule's share multiplies anything.
 *
 * Reverse is untouched: `speed` is signed, a rider backing up is below the
 * first anchor by construction, and the look-behind stance (`DESIGN.md` §6k)
 * keeps its own pose.
 *
 * ---------------------------------------------------------------------------
 *
 * **The settle — M30 Phase 3b, and it is the owner's ride finding** (§30.8,
 * 2026-09-03): *"the characters go V like a motorcycle… from leaning all the
 * way left to all the way right… very stiff, there is no transition… make it:
 * new hard left lean > old left lean > standup > old right lean > new hard
 * right lean."*
 *
 * The schedule above is a pure function of the wheel's state, so at the top of
 * it the rider is a **rigid plank** with the machine: the hinge is zero, and a
 * flick swings the whole body at the wheel's own `rollResponseSeconds`
 * (0.11 s — about 10 rad/s at the start of a full flick). The share is right
 * for a bank that is *held* and wrong for the swing between two banks, which
 * is the pose the shipped build had before M30 (`riderUpperBodyRollFactor`,
 * a fifth of the wheel's roll, with the pelvis articulating).
 *
 * So the schedule gains a second clock of its own: `leanSettle` ∈ [0, 1],
 * driven by **how fast the wheel's bank is changing** rather than by speed.
 * `blend` is multiplied by it, which means the rider slides down the *same*
 * schedule to the slow-band pose while the wheel swings and climbs back to the
 * full share once the bank holds. Two properties are load-bearing:
 *
 *   - `riderRoll` stays **proportional to `rollAngle`** — the low term is a
 *     multiple of it, and the force lean is `atan(a / g)` against the wheel's
 *     `atan(min(a, limit) / g)`, which is a larger multiple of the same sign
 *     and never a smaller one — so the body crosses zero exactly when the
 *     wheel does and can never lean opposite to it, which is what the
 *     clearance contracts and `ridingRig.ts` rely on;
 *   - at `settle === 1` every result is **bit-identical** to the five-argument
 *     schedule, because `blend * 1` is exact. A held carve — every capture
 *     baseline, every settled spec — is untouched.
 *
 * The ramp is **linear**, not exponential, for one reason: it has to reach
 * exactly 1 (one line with the wheel is asserted with `===`, not a tolerance)
 * and exactly 0 (the old pose through a flick is the *whole* ask). An
 * `approach` reaches neither.
 */
export interface LeanTuning {
  /** Upper-body share of the wheel's roll below `carveLeanSpeed`. */
  readonly riderUpperBodyRollFactor: number;
  /** The same share inside a full hard low-speed technical turn. */
  readonly technicalTurnUpperBodyRollFactor: number;
  /** Speed where the lean begins to follow the wheel, m/s. */
  readonly carveLeanSpeed: number;
  /** Speed where the share reaches `carveLeanShareTop`, m/s. */
  readonly carveLeanFullSpeed: number;
  /** The share of `riderLean` the upper body takes at full commitment. */
  readonly carveLeanShareTop: number;
  /** Wheel roll rate at or below which the bank counts as held, rad/s. */
  readonly carveLeanHoldRate: number;
  /** Wheel roll rate at and above which the body is fully back at the old pose, rad/s. */
  readonly carveLeanSwingRate: number;
  /** Seconds from the old pose to the full lean once the bank holds. */
  readonly carveLeanSettleIn: number;
  /** Seconds from the full lean back to the old pose when the wheel swings. */
  readonly carveLeanSettleOut: number;
}

/**
 * How far up the schedule a speed is, 0..1. Zero at and below
 * `carveLeanSpeed` (and for every reverse speed, which is negative), one at
 * and above `carveLeanFullSpeed`, linear between.
 */
export function leanBlend(speed: number, t: LeanTuning): number {
  const span = t.carveLeanFullSpeed - t.carveLeanSpeed;
  if (!(span > 0)) return speed >= t.carveLeanFullSpeed ? 1 : 0;
  return clamp01((speed - t.carveLeanSpeed) / span);
}

/**
 * How settled the *bank* is, 0..1, from the wheel's own roll rate (M30 Phase
 * 3b). One at and below `carveLeanHoldRate` — a held bank, stick jitter
 * included — zero at and above `carveLeanSwingRate`, linear between.
 *
 * The span is guarded the way `leanBlend`'s is: two equal rates would divide
 * by zero, so a non-positive span becomes the step function the two constants
 * describe rather than a NaN in the pose.
 */
export function settleTargetFor(rollRate: number, t: LeanTuning): number {
  const rate = Math.abs(rollRate);
  const span = t.carveLeanSwingRate - t.carveLeanHoldRate;
  if (!(span > 0)) return rate >= t.carveLeanSwingRate ? 0 : 1;
  return 1 - clamp01((rate - t.carveLeanHoldRate) / span);
}

/**
 * One step of the settle, given the wheel's roll rate over that step.
 *
 * **Linear, and asymmetric.** Rising takes `carveLeanSettleIn` seconds to
 * cross the whole range and falling `carveLeanSettleOut`, so the body drops to
 * the old pose about six times faster than it comes back — the settle-out has
 * to be finished *before* the wheel crosses upright, or the body's angle goes
 * non-monotonic on the far side of a flick (a shrinking share against a
 * growing bank). Measured on the production controller at 0.06 s: the settle
 * reaches zero two ticks before the wheel crosses zero on the tightest flick
 * swept, and every flick in the sweep is monotonic on both sides.
 *
 * A rate is passed in rather than two roll angles because the ghost's clock is
 * its recording's, not the simulation's (`render/ghostRider.ts`).
 */
export function settleStep(
  settle: number,
  rollRate: number,
  dt: number,
  t: LeanTuning,
): number {
  const target = settleTargetFor(rollRate, t);
  const delta = target - settle;
  const rise = dt / t.carveLeanSettleIn;
  const fall = dt / t.carveLeanSettleOut;
  // Clamped by the *remaining* difference at both ends, so the ramp lands on
  // the target exactly rather than stepping past it and back — which is how it
  // reaches exactly 1 and exactly 0 instead of merely approaching them.
  if (delta > rise) return settle + rise;
  if (delta < -fall) return settle - fall;
  return target;
}

/**
 * The upper body's roll for a wheel roll, a force lean, a technique blend, a
 * speed and a settle. Signed like `rollAngle` (toward +X, the rider's left).
 *
 * Below the first anchor the result is the pre-M30 expression evaluated in
 * the same order with the same operations — the low band is byte-identical,
 * which the sober digests hold and a test asserts at the anchor itself.
 *
 * `settle` defaults to 1, the held bank, and at that value every result is
 * bit-identical to the five-argument call this had before M30 Phase 3b:
 * `blend * 1` is exact for every double, so the `blend >= 1` early-out and the
 * `lerp` below are reached with the same number they were reached with before.
 */
export function riderRollFor(
  rollAngle: number,
  riderLean: number,
  technicalTurn: number,
  speed: number,
  t: LeanTuning,
  settle = 1,
): number {
  const low = rollAngle * lerp(
    t.riderUpperBodyRollFactor,
    t.technicalTurnUpperBodyRollFactor,
    Math.abs(technicalTurn),
  );
  // The settle scales the *schedule*, not the result: at 0 the rider is back
  // at the slow-band pose the owner approved at M16 — through the swing of a
  // flick, which is the whole of Phase 3b — and at 1 nothing about the held
  // carve has moved.
  const blend = leanBlend(speed, t) * settle;
  if (blend <= 0) return low;
  // The top end returned exactly, not through `lerp`: `a + (b - a) * 1` can
  // land one ulp off `b`, and "one line" at share 1.0 is a hinge of zero,
  // which a spec asserts with `===` rather than a tolerance.
  if (blend >= 1) return riderLean * t.carveLeanShareTop;
  return lerp(low, riderLean * t.carveLeanShareTop, blend);
}
