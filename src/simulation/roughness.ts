/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Surface roughness, as a field over the ground rather than over time.
 *
 * **The choice of "over position" is the whole design.** A time-based
 * perturbation would shake a parked wheel, would differ between two rides over
 * the same ground, and would make `advance(n)` reach a different suspension
 * state every run — so a frozen screenshot of it would mean nothing. A spatial
 * field gives all three for free: a stopped wheel is still, the same patch of
 * gravel always feels the same, and the excitation frequency is
 * `speed / wavelength`, which is why riding faster over the same ground works
 * the suspension harder without a single speed term appearing below.
 *
 * It is deliberately not noise. Two sine waves at incommensurate wavelengths
 * and oblique headings produce a field with no visible grain at riding speed,
 * cost four transcendentals, allocate nothing, need no seed, and are exactly
 * reproducible in a headless test. A value-noise lattice would be more
 * characterful and would buy nothing the suspension can tell apart, because a
 * second-order spring is a low-pass filter and hears only the fundamental.
 *
 * Imports nothing, so it is reachable from `simulation/` without touching
 * invariant 1 and testable with no browser.
 */

const TAU = Math.PI * 2;

/**
 * Oblique directions for the two components.
 *
 * Oblique on purpose: axis-aligned waves would make riding due north feel
 * different from riding north-east for a reason nothing in the game explains,
 * and would make a straight run along +Z sample one wave at a constant phase.
 */
const PRIMARY_X = 0.63;
const PRIMARY_Z = 0.78;
const SECONDARY_X = -0.81;
const SECONDARY_Z = 0.59;

/** The second component's wavelength, as a fraction of the first. Irrational-ish. */
const SECONDARY_SCALE = 0.37;
const SECONDARY_PHASE = 1.7;

/** The two weights sum to one, so the result is bounded by the amplitude exactly. */
const PRIMARY_WEIGHT = 0.62;
const SECONDARY_WEIGHT = 0.38;

/**
 * Vertical displacement of the surface texture at a world point, metres.
 *
 * Bounded to `[-amplitude, +amplitude]`. Zero amplitude or a non-positive
 * wavelength returns exactly zero, so a perfectly smooth surface costs one
 * comparison rather than four sines.
 */
export function roughnessAt(
  x: number,
  z: number,
  amplitude: number,
  wavelength: number,
): number {
  if (amplitude <= 0 || wavelength <= 0) return 0;

  const primary = ((x * PRIMARY_X + z * PRIMARY_Z) / wavelength) * TAU;
  const secondary = ((x * SECONDARY_X + z * SECONDARY_Z) / (wavelength * SECONDARY_SCALE)) * TAU
    + SECONDARY_PHASE;

  return amplitude * (
    PRIMARY_WEIGHT * Math.sin(primary) + SECONDARY_WEIGHT * Math.sin(secondary)
  );
}
