/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Mix arithmetic. **This file imports nothing, and that is a requirement.**
 *
 * `docs/PLANS.md` §8.3 and master §15.2 both say it in the same words: the mix
 * arithmetic lives in a module that imports nothing, so it is fully unit
 * testable without an audio context. The reason is not tidiness. Every audio
 * bug that is genuinely hard to find is a *level* bug — a bus applied twice, a
 * duck that never releases, a crossfade that dips through silence in the
 * middle — and none of those are visible in a waveform capture or reproducible
 * in a browser. They are arithmetic, and arithmetic can be asserted.
 *
 * So `clamp` and the one-pole approach are written out here rather than
 * imported from `shared/maths.ts`, which is six lines of duplication paid on
 * purpose to keep the dependency count at zero. `shared/maths.ts` imports
 * nothing either, so the letter of the rule is what is being kept, not its
 * spirit only — but the letter is what a future reader will check.
 *
 * Everything here is a plain function over plain numbers. Nothing in this file
 * knows that a `GainNode` exists.
 */

/**
 * The three buses `docs/PLANS.md` §8.3 names, under one master.
 *
 * `sfx` is the whole ride — motor, wind, tyre, transients. `ui` is warnings
 * and menu sound, kept separate precisely so a player who turns effects down
 * still hears the wheel telling them it is about to give up. `music` has no
 * source at M8; it is carried through the arithmetic so that adding one later
 * is a source connected to a bus that already exists and is already tested,
 * rather than a second pass over every volume calculation in the game.
 */
export type BusId = 'sfx' | 'ui' | 'music';

export const BUS_IDS: readonly BusId[] = ['sfx', 'ui', 'music'];

/** Player-facing volumes, 0..1 each. The M9 options screen writes these. */
export interface BusVolumes {
  readonly master: number;
  readonly sfx: number;
  readonly ui: number;
  readonly music: number;
}

export const FULL_VOLUMES: BusVolumes = Object.freeze({
  master: 1,
  sfx: 1,
  ui: 1,
  music: 1,
});

/**
 * Clamp, with NaN mapped to the low end.
 *
 * `NaN` is guarded and the infinities deliberately are not: an infinity is a
 * value that ran off the end of a range and clamps correctly on its own, while
 * a NaN compares false against everything and would otherwise slip through
 * both branches and poison every gain downstream of it. A single NaN in a
 * Web Audio param is not a quiet failure — it silences the node for the rest
 * of the session.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * A first-order approach with a hard rate ceiling, framerate-independent.
 *
 * Same shape and same reasoning as `shared/maths.ts`, restated here for the
 * zero-import rule above. Audio needs it constantly: every continuous
 * parameter in the game is smoothed on the way to the graph, because a gain or
 * a frequency that steps discontinuously is a click, and a click is the one
 * artefact a listener notices instantly and cannot un-notice.
 */
export function approach(
  current: number,
  target: number,
  responseSeconds: number,
  dt: number,
): number {
  if (dt <= 0) return current;
  if (responseSeconds <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / responseSeconds));
}

/**
 * Map a value from one range to another, clamped at both ends.
 *
 * The workhorse of this whole layer: nearly every audio parameter is "this
 * ride quantity, over this useful span, becomes that acoustic quantity".
 * Clamping rather than extrapolating matters — an unclamped map is how a
 * reverse at -3 m/s ends up asking an oscillator for a negative frequency.
 */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  const t = clamp01((value - inMin) / (inMax - inMin));
  return outMin + (outMax - outMin) * t;
}

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

/**
 * A player volume, 0..1, as a linear gain.
 *
 * **Not the identity, and this is the single most common mixing mistake.**
 * Loudness is roughly logarithmic, so a fader wired straight to a linear gain
 * spends its top half doing almost nothing audible and its bottom tenth
 * dropping off a cliff — the "everything happens at the very bottom of the
 * slider" feel. Squaring approximates the perceptual curve closely enough for
 * a game and, unlike a true dB taper, needs no special case to reach silence:
 * 0 in gives exactly 0 out, and 1 gives exactly 1.
 *
 * A halfway fader lands at 0.25 linear, which is about -12 dB — close to the
 * -10 dB that reads as "half as loud", which is what the player meant.
 */
export function volumeToGain(volume: number): number {
  const v = clamp01(volume);
  return v * v;
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

export function gainToDb(gain: number): number {
  // -120 dB stands in for silence. `log10(0)` is -Infinity, which propagates
  // into every sum it touches and turns one muted voice into a silent mix.
  return gain <= 1e-6 ? -120 : 20 * Math.log10(gain);
}

/**
 * The gain a bus should carry, given the player's volumes and the mute.
 *
 * The only place master and bus multiply. Every voice asks for its bus gain
 * here rather than reading `volumes.master` itself, which is what stops the
 * classic double-application bug where the master ends up squared on one path
 * and not on another.
 */
export function busGain(volumes: BusVolumes, bus: BusId, muted = false): number {
  if (muted) return 0;
  return volumeToGain(volumes.master) * volumeToGain(volumes[bus]);
}

// ---------------------------------------------------------------------------
// Crossfade
// ---------------------------------------------------------------------------

/** The two gains of a crossfade at position `t`, 0 = fully "from". */
export interface CrossfadePair {
  readonly from: number;
  readonly to: number;
}

/**
 * Equal-**power** crossfade, not equal-amplitude.
 *
 * Two uncorrelated noise sources — which is exactly what the tyre voices are —
 * sum in power, not in amplitude. A linear crossfade between them therefore
 * dips about 3 dB in the middle, and the tyre audibly ducks every single time
 * the rider crosses from pavement onto grass. Sine/cosine keeps `from² + to²`
 * at 1 throughout, so the transition is level.
 *
 * The slice has ten beats and a lot of surface boundaries; this is heard on
 * nearly every one of them.
 */
export function equalPowerCrossfade(t: number): CrossfadePair {
  const clamped = clamp01(t);
  const angle = clamped * Math.PI * 0.5;
  return { from: Math.cos(angle), to: Math.sin(angle) };
}

// ---------------------------------------------------------------------------
// Ducking — the arithmetic behind "is the right thing the loudest thing?"
// ---------------------------------------------------------------------------

/**
 * A duck request: how hard to push the ride bed down, and for how long.
 *
 * M8's exit question has two halves and this is the second one. A wheel that
 * sounds alive is a synthesis problem; *the right thing being the loudest
 * thing* is a mixing problem, and mixing problems are solved by deciding what
 * loses, not by making the important thing louder. Turning a warning up until
 * it beats a full-throttle motor gives a warning that is painful when the
 * wheel is quiet. Ducking the motor gives one that is exactly as loud as it
 * needs to be at any speed.
 */
export interface DuckRequest {
  /** How far down to push, 0..1. 1 would be silence; nothing asks for that. */
  readonly depth: number;
  /** Seconds to reach it. Short — a duck you can hear arriving is a swell. */
  readonly attackSeconds: number;
  /** Seconds to come back. Long — a fast release pumps audibly. */
  readonly releaseSeconds: number;
}

/**
 * Step a duck envelope toward a demand.
 *
 * Asymmetric on purpose, and it is the asymmetry that makes it inaudible as a
 * process: ducking *down* has to be quick enough that the warning's first beep
 * is already clear, and coming back up has to be slow enough that a stream of
 * beeps does not make the motor breathe in the gaps between them.
 *
 * `demand` is the deepest duck any active source is asking for, so overlapping
 * requests take the maximum rather than accumulating — two warnings at once
 * must not silence the wheel.
 */
export function stepDuck(
  current: number,
  demand: number,
  attackSeconds: number,
  releaseSeconds: number,
  dt: number,
): number {
  const target = clamp01(demand);
  const seconds = target > current ? attackSeconds : releaseSeconds;
  return clamp01(approach(current, target, seconds, dt));
}

/** A duck level, 0..1, as the gain multiplier it applies to the ride bed. */
export function duckToGain(duck: number): number {
  return 1 - clamp01(duck);
}

// ---------------------------------------------------------------------------
// Pitch
// ---------------------------------------------------------------------------

/** Frequency ratio for a detune in cents. 1200 cents is an octave. */
export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}

/** Frequency ratio for an interval in semitones. */
export function semitonesToRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/**
 * Rotational frequency of a wheel of radius `radius` rolling at `speed`, Hz.
 *
 * The one piece of physics in the mix layer, and it is here rather than in the
 * director because it is arithmetic with a single correct answer that a test
 * can state exactly. Speed is taken as a magnitude: a wheel rolling backwards
 * makes the same noise as one rolling forwards.
 */
export function rollingHz(speed: number, radius: number): number {
  if (radius <= 0) return 0;
  return Math.abs(speed) / (2 * Math.PI * radius);
}

/**
 * Sum of independent voices' powers, as an amplitude.
 *
 * For headroom estimation only — the real graph sums amplitudes and the phases
 * are unrelated, so `sqrt(Σ g²)` is the honest expectation of the result while
 * `Σ g` is the pathological worst case that never occurs. The engine uses this
 * to decide the bed's static trim so that a limiter is a safety net rather
 * than a component of the sound.
 */
export function powerSum(gains: readonly number[]): number {
  let total = 0;
  for (const gain of gains) total += gain * gain;
  return Math.sqrt(total);
}
