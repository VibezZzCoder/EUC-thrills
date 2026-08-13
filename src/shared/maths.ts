/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Pure scalar maths shared across layers.
 *
 * Imports nothing, so it is usable from `simulation/` without touching
 * architecture invariant 1, and testable with no browser. Anything that needs
 * a Vector3 belongs in `render/`; anything that needs a LevelPlan belongs in
 * `simulation/`.
 */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Move `current` toward `target` with a first-order response and a hard rate
 * ceiling.
 *
 * The exponential term is framerate-independent — `1 - exp(-dt / tau)` gives
 * the same trajectory at any step size, unlike the `current += (target -
 * current) * k` form, which silently changes its time constant whenever the
 * step rate does. The simulation is fixed-step, so that would not bite today;
 * it bites the first time someone changes `SIMULATION.hz` and cannot explain
 * why the wheel feels different.
 *
 * `maxRate` then caps the per-second change. The two shape different halves of
 * the same motion: the time constant governs the settle, the rate limit
 * governs the onset.
 *
 * @param responseSeconds Time constant. Zero or less snaps to the target.
 * @param maxRate         Units per second. `Infinity` disables the limit.
 */
export function approach(
  current: number,
  target: number,
  responseSeconds: number,
  maxRate: number,
  dt: number,
): number {
  if (dt <= 0) return current;
  const blend = responseSeconds > 0 ? 1 - Math.exp(-dt / responseSeconds) : 1;
  const maxDelta = maxRate * dt;
  const delta = clamp((target - current) * blend, -maxDelta, maxDelta);
  return current + delta;
}

/**
 * Wrap an angle into (-pi, pi].
 *
 * For display and for comparing two headings. Simulation state deliberately
 * does *not* wrap its heading: an unwrapped angle interpolates linearly
 * between two frames, and a wrapped one produces a full-speed spin every time
 * it crosses the seam.
 */
export function wrapAngle(radians: number): number {
  const wrapped = (radians + Math.PI) % (Math.PI * 2);
  return (wrapped <= 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
}

/** Zero when `value` is zero, so it never produces a phantom direction. */
export function sign(value: number): number {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

/**
 * A deterministic value in [0, 1) from a world position and a salt.
 *
 * The same rule as the terrain's mottle and M5's particles (`DESIGN.md` §4
 * rule 3): an integer hash, never `Math.random`. A world that differs between
 * boots makes every visual regression capture meaningless. Positions are
 * quantised to the centimetre first so a float that round-trips differently
 * cannot change a tree's colour.
 *
 * **It lives here from M12 Phase 0**, having been private to `render/props.ts`.
 * The skyline's setback tower is decided by this hash, so the tower is part of
 * a building's render cost — and `data/renderCost.ts` has to be able to predict
 * that cost without importing the renderer. One owner, two consumers, rather
 * than a second copy of a hash that would drift silently and be visible only as
 * a budget that quietly stopped matching the world.
 */
export function positionHash01(x: number, z: number, salt: number): number {
  let h = (Math.round(x * 100) * 374761393
    + Math.round(z * 100) * 668265263
    + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
