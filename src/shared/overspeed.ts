/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * How fast the over-speed warning repeats — M20.
 *
 * **One function because there are two consumers and they must not disagree.**
 * `audio/director.ts` schedules the beeps from it and `ui/hudModel.ts` paces the
 * on-screen glyph from it, because the owner asked for the warning to survive a
 * player riding with the sound off. If the glyph flashed on its own schedule,
 * the two cues would drift apart within a second of riding and the screen would
 * be describing a different wheel from the one the player can hear.
 *
 * It lives in `shared/` under the rule AGENTS.md states for this folder: a
 * module with no imports whose whole content is arithmetic. The two periods are
 * parameters rather than reads of `data/tuning.ts` for exactly that reason —
 * both callers already hold the constants, and taking them here would make this
 * file the third place the tuning table is read.
 */

/**
 * The beep period at an over-speed factor, seconds.
 *
 * **Geometric between the two, not linear**, and the difference is the whole
 * feel of the thing. Linear in period spends the first two thirds of the speed
 * range sounding nearly identical and then collapses in the last mile per hour,
 * so a rider learns nothing from it until it is too late to act. Geometric
 * makes every equal step of speed a fixed *ratio* faster, which is what the
 * wheel running out of room actually feels like, and it is what lets a rider
 * hold a steady speed just under the edge and recognise the rate they are
 * holding — the "riding the beeps" the owner named when he asked for this.
 *
 * `factor` is clamped, so a caller may hand over a raw ratio without checking
 * it; below 0 and above 1 both return the endpoint rather than an extrapolated
 * period, and an extrapolated one at the top would be a beep faster than the
 * beep is long.
 */
export function overspeedBeepPeriod(
  factor: number,
  slowestSeconds: number,
  fastestSeconds: number,
): number {
  const t = factor < 0 ? 0 : factor > 1 ? 1 : factor;
  // Guarded rather than assumed: both endpoints are live-tunable, and a zero or
  // a negative one would make the logarithm below `-Infinity` and the period
  // `NaN` — which as a beep interval is a beep that never stops.
  const slowest = slowestSeconds > 0 ? slowestSeconds : 1;
  const fastest = fastestSeconds > 0 ? fastestSeconds : slowest;
  return slowest * (fastest / slowest) ** t;
}

/**
 * How loud the warning reads, as three named steps.
 *
 * The HUD needs a class and the mix needs nothing, so this is presentation
 * only — but it is here rather than in `ui/` so that the thresholds are stated
 * once beside the period they belong with. They are thirds of the ramp, which
 * is arbitrary in the way a colour is arbitrary and deliberate in that the top
 * step lines up with the range where the beeps are already unmistakable: by the
 * time the glyph is red the player has had two thirds of the ramp of warning.
 */
export type OverspeedLevel = 'none' | 'notice' | 'warn' | 'critical';

export function overspeedLevel(factor: number): OverspeedLevel {
  if (factor <= 0) return 'none';
  if (factor >= 0.78) return 'critical';
  if (factor >= 0.42) return 'warn';
  return 'notice';
}
