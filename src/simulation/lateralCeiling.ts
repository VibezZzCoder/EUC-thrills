/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { clamp01, lerp } from '../shared/maths.ts';

/**
 * **The give at speed** — how much lateral acceleration the wheel can hold, in
 * g, as a function of how fast it is going (M30 Phase 2, `docs/PLANS.md`
 * §30.3b).
 *
 * One pure function, three readers: the controller's clamp (`EucController`,
 * every `lateralLimitG` write), the cop's corner allowance
 * (`simulation/cpuRider.ts`) and the tests that measure the radius table. The
 * arithmetic lives in one place for the reason `simulation/riderLean.ts`'
 * does — two copies of a schedule drift apart on the first tuning change.
 *
 * The owner's ask: *"i need the rider to do the hang like u say to corner at
 * higher speeds. i'm trying to satisfy the real racers that play my game
 * now."* A 65 mph wheel on the shipped 0.75 g needs 115 m of radius at full
 * lock, which is not a corner on any route the generator draws; the grip has
 * to rise with the speed or the fast wheel simply cannot turn.
 *
 * Three bands, by **absolute** speed:
 *
 *   - **at and below `carveSpeed`** (9 m/s) — `maxLateralG`, outright. Every
 *     number below the carve speed is what it was: the ordinary clamp binds
 *     from about 4.6 m/s for gentle input, M16's technical-turn bonus sits on
 *     top of it, and both are the band the owner approved. Reverse is here by
 *     construction (`maxReverseSpeed` is 6.7 m/s), which is why the speed is
 *     read as an absolute rather than signed: a rider backing up corners on
 *     exactly the grip he always did.
 *   - **between** — a lerp from `maxLateralG` to `carveGripTopG` across
 *     `((|v| − carveSpeed) / (carveGripFullSpeed − carveSpeed)) ^
 *     carveGripExponent`, so the give arrives with the speed rather than at a
 *     step.
 *   - **at and above `carveGripFullSpeed`** — `carveGripTopG`, returned
 *     outright rather than through the `lerp`, whose `from + (to - from) * 1`
 *     can land one ulp off `to`. The plateau is asserted with `===`.
 *
 * **The anchors are absolute, and that is the third scope answer of §30.3.**
 * They do not follow the top speed, so a 40 mph corner is the same corner on
 * the shipped build and on a `?mph=65` one and the A/B isolates the top speed
 * alone. `simulation/topSpeedPreset.ts` moves `dragCoefficient` and the two
 * power speeds; none of them appears below, and a headless test changes the
 * drag and asserts this function is unmoved at every speed.
 *
 * **What this is not.** It is not the wheel's *bank*: `EucController`
 * saturates `rollAngle` at the ordinary ceiling — `atan(maxLateralG · grip)`,
 * 36.9° on pavement — and lets `riderLean` carry the whole force lean, so the
 * extra grip is spent on a tighter line and a rider hanging inside rather than
 * on a machine leaned past its pedals. And it is not the *route generator's*
 * ceiling: `level/routeValidator.ts` keeps `maxLateralG`, because fairness is
 * judged at the least grip a rider might have (§30.7 item 1).
 */
export interface LateralCeilingTuning {
  /** The ordinary lateral ceiling, in g — what the wheel holds up to `carveSpeed`. */
  readonly maxLateralG: number;
  /** Where the give begins, m/s. The existing yaw-falloff anchor. */
  readonly carveSpeed: number;
  /** The ceiling at and above `carveGripFullSpeed`, in g. */
  readonly carveGripTopG: number;
  /** Shape of the rise between the two anchors, dimensionless. */
  readonly carveGripExponent: number;
  /** Speed where the ceiling reaches `carveGripTopG`, m/s. Absolute. */
  readonly carveGripFullSpeed: number;
}

/**
 * The lateral ceiling in g at a speed, before the surface's grip multiplies
 * it. `speed` may be signed; only its magnitude is read.
 */
export function lateralCeilingG(speed: number, t: LateralCeilingTuning): number {
  const v = Math.abs(speed);
  if (v <= t.carveSpeed) return t.maxLateralG;
  if (v >= t.carveGripFullSpeed) return t.carveGripTopG;
  const span = t.carveGripFullSpeed - t.carveSpeed;
  // Guarded the way `leanBlend`'s span is: two equal anchors would divide by
  // zero, and the step function the constants describe is the honest reading
  // of them. The two early-outs above have already answered every speed
  // outside the band, so this is only reached with a positive span.
  if (!(span > 0)) return t.carveGripTopG;
  const u = clamp01((v - t.carveSpeed) / span);
  // A non-positive exponent is the straight line rather than `u ** 0`, which
  // is 1 for every `u` including zero and would put the whole band at the top
  // of the schedule at a hair over 9 m/s. The F4 slider cannot reach it; a
  // hand-written tuning override can.
  return lerp(t.maxLateralG, t.carveGripTopG, t.carveGripExponent > 0
    ? u ** t.carveGripExponent
    : u);
}
