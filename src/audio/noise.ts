/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/**
 * Noise generation. Imports nothing, allocates once, and never touches an
 * audio context — so the wind, the seven tyre voices, and the scrape are all
 * testable as arrays of numbers.
 *
 * Three properties matter and none of them are obvious from listening:
 *
 *   1. **It has to be deterministic.** The same seed gives the same buffer, so
 *      two runs of the same browser spec hear the same thing and a capture is
 *      reproducible. `Math.random()` here would be the audio twin of the
 *      wall-clock timer the loop spent M1 removing.
 *   2. **It has to loop without a seam.** A noise buffer plays on repeat for
 *      the whole session. White noise loops for free — a discontinuity between
 *      two independent samples is just another independent sample — but pink
 *      noise carries low-frequency content across the boundary, and a step in
 *      that is a click once a second, forever. The crossfade below removes it.
 *   3. **Wind wants pink, not white.** White noise has equal energy per hertz,
 *      so half of it lives in the top octave and it hisses. Pink has equal
 *      energy per octave, which is what moving air actually sounds like.
 */

/** How long a looping buffer should be, seconds. */
export const NOISE_SECONDS = 3;

/**
 * A small deterministic generator — xorshift32.
 *
 * Chosen over an LCG because the low bits of an LCG are famously poor, and the
 * low bits are exactly what a fractional conversion to -1..1 keeps.
 */
export function createRandom(seed: number): () => number {
  // A zero state is a fixed point of xorshift; any non-zero seed will do.
  let state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // >>> 0 to unsigned, then to [-1, 1).
    return ((state >>> 0) / 0x80000000) - 1;
  };
}

/**
 * Pink-noise filter state. Six one-pole sections plus a feed-forward term.
 *
 * The coefficients are Paul Kellet's well-known public-domain approximation
 * (musicdsp.org), which tracks a true -3 dB/octave slope to within about
 * 0.05 dB across the audio band at a fraction of the cost of a proper
 * filter bank. Recorded here because this project records the provenance of
 * everything it did not derive itself, even when — as here — it is an
 * algorithm rather than an asset and carries no licence obligation.
 */
interface PinkState {
  b0: number; b1: number; b2: number; b3: number; b4: number; b5: number; b6: number;
}

function createPinkState(): PinkState {
  return { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
}

function pinkStep(state: PinkState, white: number): number {
  state.b0 = 0.99886 * state.b0 + white * 0.0555179;
  state.b1 = 0.99332 * state.b1 + white * 0.0750759;
  state.b2 = 0.96900 * state.b2 + white * 0.1538520;
  state.b3 = 0.86650 * state.b3 + white * 0.3104856;
  state.b4 = 0.55000 * state.b4 + white * 0.5329522;
  state.b5 = -0.7616 * state.b5 - white * 0.0168980;
  const pink = state.b0 + state.b1 + state.b2 + state.b3 + state.b4 + state.b5
    + state.b6 + white * 0.5362;
  state.b6 = white * 0.115926;
  return pink * 0.11;
}

export type NoiseColour = 'white' | 'pink';

/**
 * Fill `target` with a seamlessly looping noise buffer.
 *
 * The seam is removed by generating a little more than is needed and folding
 * the overrun back over the head: sample 0 of the result *is* sample L of the
 * raw stream, and sample L-1 is sample L-1, so the two are adjacent in the
 * original and the loop point is continuous by construction rather than by
 * being quiet enough to get away with.
 */
export function fillNoise(
  target: Float32Array,
  seed: number,
  colour: NoiseColour = 'white',
): void {
  const length = target.length;
  if (length === 0) return;

  // An eighth of the buffer, capped: long enough to hide the fold in pink
  // noise's slowest content, short enough that most of the buffer is untouched.
  const fade = Math.min(2048, Math.max(1, Math.floor(length / 8)));
  const random = createRandom(seed);
  const pink = createPinkState();

  // One allocation, at boot, for one buffer. The alternative is a second pass
  // of the generator, which would not produce the same samples.
  const raw = new Float32Array(length + fade);
  for (let i = 0; i < raw.length; i += 1) {
    const white = random();
    raw[i] = colour === 'pink' ? pinkStep(pink, white) : white;
  }

  for (let i = 0; i < length; i += 1) target[i] = raw[i];
  for (let i = 0; i < fade; i += 1) {
    const t = i / fade;
    target[i] = raw[length + i] * (1 - t) + raw[i] * t;
  }

  normalise(target);
}

/**
 * The Web Audio render quantum. Fixed at 128 by the spec this game runs
 * against; `AudioContext.renderQuantumSize` may some day make it negotiable,
 * at which point the sink should read it from the context instead.
 */
export const RENDER_QUANTUM_FRAMES = 128;

/**
 * Trim a looping buffer to an exact whole number of render quanta, splicing
 * the seam so the wrap stays continuous — the fix for the Ubuntu hum.
 *
 * **Measured, not theorised.** On the owner's Ubuntu Chrome the wind loop
 * degenerated at its first wrap into a harmonic comb whose fundamental was
 * exactly 375 Hz — 48 000 / 128, the render-quantum repetition rate — i.e.
 * the source got stuck replaying a single quantum forever. The three looping
 * sources that never did this shared one property the wind lacked: the pink
 * bed's 144 000 frames divide by 128 exactly, and the tyre pair play through
 * the rate-interpolation path (their pitch tracks the wheel). The wind was
 * the one loop that wrapped *mid-quantum* on the rate-1.0 fast path. Whether
 * the underlying Chromium fault is precisely that alignment or the decoded
 * buffer's provenance, both die here: the data is copied to a fresh buffer
 * whose length divides by the quantum.
 *
 * The trim discards at most 127 frames (2.6 ms of a multi-second loop). The
 * seam survives because the last `fade` frames are crossfaded toward the
 * *original* tail — the samples that always led back into frame 0 — so the
 * wrap lands on the same join the asset shipped with.
 */
export function alignLoopToQuantum(
  data: Float32Array<ArrayBuffer>,
  quantum: number = RENDER_QUANTUM_FRAMES,
  fade = 64,
): Float32Array<ArrayBuffer> {
  const length = data.length;
  const aligned = Math.floor(length / quantum) * quantum;
  if (aligned === length || aligned === 0 || aligned <= fade) return data;

  const out = new Float32Array(new ArrayBuffer(aligned * 4));
  out.set(data.subarray(0, aligned));
  for (let i = 0; i < fade; i += 1) {
    // `t` reaches 1 on the final frame, so the loop's last sample IS the
    // asset's last sample — the one whose successor was always frame 0.
    const t = (i + 1) / fade;
    out[aligned - fade + i] = out[aligned - fade + i] * (1 - t) + data[length - fade + i] * t;
  }
  return out;
}

/**
 * Scale to a peak of 1.
 *
 * Pink noise comes out of the filter well below full scale and white comes out
 * near it, so without this the wind would be about 20 dB quieter than the tyre
 * for reasons that have nothing to do with either of their levels — and the
 * levels in `AUDIO` would then be compensating for the generator rather than
 * describing the mix.
 */
function normalise(target: Float32Array): void {
  let peak = 0;
  for (let i = 0; i < target.length; i += 1) {
    const magnitude = Math.abs(target[i]);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak <= 1e-9) return;
  const scale = 1 / peak;
  for (let i = 0; i < target.length; i += 1) target[i] *= scale;
}

/** Root mean square of a buffer. For tests and for level sanity checks. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < samples.length; i += 1) total += samples[i] * samples[i];
  return Math.sqrt(total / samples.length);
}

/**
 * How much of a buffer's energy sits below roughly `cutoffHz`, 0..1.
 *
 * A one-pole lowpass and an energy ratio — enough to tell pink from white
 * without an FFT, which is the only question a test here needs to ask.
 */
export function lowBandEnergyRatio(
  samples: Float32Array,
  sampleRate: number,
  cutoffHz: number,
): number {
  if (samples.length === 0) return 0;
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let low = 0;
  let lowEnergy = 0;
  let totalEnergy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    low += alpha * (samples[i] - low);
    lowEnergy += low * low;
    totalEnergy += samples[i] * samples[i];
  }
  return totalEnergy <= 0 ? 0 : lowEnergy / totalEnergy;
}
