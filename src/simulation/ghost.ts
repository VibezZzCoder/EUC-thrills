/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { CHALLENGE } from '../data/tuning.ts';

/**
 * The ghost: recording a run, replaying it, and getting it into `localStorage`
 * without the record being the largest thing the game has ever saved — M10.
 *
 * Three jobs live here, and they are together because they share one wire
 * format and would drift apart if they did not:
 *
 *   1. `GhostRecorder` watches a run and keeps a sample every
 *      `1 / CHALLENGE.ghostSampleHz` seconds of **simulation** clock. Not wall
 *      time — a ghost recorded under the QA bridge's `advance(n)` has to come
 *      out byte-identical to one recorded at 60 fps, or a browser spec can
 *      never assert anything about it.
 *   2. `GhostPlayer` reads one back, interpolating between samples so a carve
 *      recorded at 20 Hz still reads as a carve at 120 Hz.
 *   3. `encodeGhost` / `decodeGhost` are the boundary with saved data.
 *
 * **The size problem is the reason this file has a wire format at all.** A
 * three-minute lap is about 3,600 samples of nine numbers. Written as plain
 * JSON floats that is roughly a megabyte of `"x":-41.83726501464844`, which is
 * a fifth of a typical 5 MB origin quota spent on one replay, and `RecordsStore`
 * would start losing personal bests to `QuotaExceededError`. So every value is
 * quantised to a step far below what the eye can resolve at chase distance and
 * stored as an **integer delta from the previous sample**: successive positions
 * differ by centimetres, so the numbers that actually reach the JSON are two or
 * three characters each. `ghost.test.ts` measures a synthetic three-minute lap
 * and holds the result under 400 KB.
 *
 * **Deltas are taken between the *quantised* values, never between the raw
 * ones.** Quantising a difference accumulates its rounding error along the
 * whole track, so a three-minute ghost would end up metres away from where the
 * player rode; differencing two already-rounded integers is exactly reversible
 * and bounds the error at half a step for every sample independently. The same
 * property is what lets the heading grow without bound: see `headingY` below.
 *
 * `simulation/` may not import `three`, `app/`, `ui/`, `render/`, `platform/`,
 * `audio/`, or `diagnostics/` (AGENTS.md invariants 1 and 5), so this file
 * imports the tuning table and nothing else, and every line of it is reachable
 * from `node --test`. In particular it knows nothing about `SafeStorage`:
 * `app/records.ts` owns where an `EncodedGhost` is written, and this file owns
 * only what one is.
 */

/** One recorded instant. Enough to pose a rig, and no more. */
export interface GhostSample {
  /** Seconds since the run's clock started. Strictly increasing along a track. */
  t: number;
  x: number;
  y: number;
  z: number;
  /**
   * Surface height under the rider at this instant.
   *
   * Recorded rather than an `airborne` boolean because the consumer can derive
   * the boolean from `y - groundY` and the boolean cannot be turned back into
   * a height. It is also what lets the rendered ghost's landing squash and its
   * shadow behave, both of which need the gap and not a flag.
   */
  groundY: number;
  /**
   * Yaw, radians, **unwrapped** — it keeps counting past ±π and grows without
   * bound as the rider circles the block.
   *
   * That is the controller's choice, not this file's, and it is the right one:
   * an unwrapped heading interpolates with a plain lerp, whereas a wrapped one
   * needs every consumer to remember to take the shortest arc, and the one
   * that forgets spins the ghost a full turn on a single frame somewhere near
   * north. `GhostPlayer.sample` therefore lerps it flat, and the delta encoding
   * below is unbothered by the growth because it stores differences.
   */
  headingY: number;
  /** Wheel / lower-body lean, radians. */
  rollAngle: number;
  /** Signed along the heading, m/s. Negative while rolling backwards. */
  speed: number;
  /** 0..1, so the ghost tucks where the player tucked. */
  crouch: number;
}

export interface GhostTrack {
  readonly levelId: string;
  readonly totalSeconds: number;
  readonly samples: readonly GhostSample[];
}

/**
 * Compact, quantised, JSON-safe. The shape that reaches `localStorage`.
 *
 * `hz` and `total` are not needed to replay the track — every sample carries
 * its own `t` — but they are what `decodeGhost` checks the sample count
 * against, which is how a record whose `n` was edited by hand is caught before
 * anything is allocated for it.
 */
export interface EncodedGhost {
  readonly v: 1;
  readonly level: string;
  readonly hz: number;
  readonly total: number;
  readonly n: number;
  readonly data: readonly number[];
}

// ---------------------------------------------------------------------------
// The wire format
// ---------------------------------------------------------------------------

/**
 * Field order inside one sample's slice of `data`. Nine numbers per sample.
 *
 * Interleaved (all of sample 0, then all of sample 1) rather than field-major,
 * because it is the order the encoder and the decoder both walk in and a
 * mismatch is impossible to introduce silently: the two loops are the same
 * loop written twice.
 */
const FIELD_T = 0;
const FIELD_X = 1;
const FIELD_Y = 2;
const FIELD_Z = 3;
const FIELD_GROUND_Y = 4;
const FIELD_HEADING = 5;
const FIELD_ROLL = 6;
const FIELD_SPEED = 7;
const FIELD_CROUCH = 8;
const FIELDS_PER_SAMPLE = 9;

/**
 * Time quantum, seconds.
 *
 * A millisecond, and it lives here rather than in `src/data/tuning.ts` because
 * it is not a ride value — nothing in the simulation reads it and changing it
 * changes only how many characters a saved replay costs. The tuning table
 * holds what a developer tunes about *riding*; this is the resolution of a
 * serialisation format, in the same category as the results screen's own
 * presentation thresholds. A millisecond is two orders of magnitude finer than
 * the 50 ms sample interval, so it costs three characters per sample and adds
 * no visible error at all.
 */
const TIME_STEP = 0.001;

/**
 * Quantisation step per field, indexed by the `FIELD_*` constants above.
 *
 * Positions and heights take `CHALLENGE.ghostPositionStep` (a centimetre) and
 * angles take `CHALLENGE.ghostAngleStep` (about a third of a degree), as the
 * contract requires. Two fields are not obviously either:
 *
 *   - **`speed`** is a linear quantity in m/s and reuses the position step, so
 *     it is stored to the nearest centimetre per second. The ghost's speed is
 *     only ever read to drive a lean or a wheel spin, neither of which can show
 *     a hundredth of a metre per second.
 *   - **`crouch`** is a dimensionless 0..1 and also reuses the position step,
 *     giving a hundred levels across the whole range. A tuck is a pose blend;
 *     a hundred steps of it is already finer than the animation can express.
 *
 * Neither gets its own tuning constant on purpose. Adding `ghostSpeedStep` and
 * `ghostCrouchStep` to the table would imply someone might tune them against
 * how the game *feels*, and nobody ever will — they are here to make the JSON
 * short and that is the whole of their job.
 */
const FIELD_STEPS: readonly number[] = [
  TIME_STEP,
  CHALLENGE.ghostPositionStep,
  CHALLENGE.ghostPositionStep,
  CHALLENGE.ghostPositionStep,
  CHALLENGE.ghostPositionStep,
  CHALLENGE.ghostAngleStep,
  CHALLENGE.ghostAngleStep,
  CHALLENGE.ghostPositionStep,
  CHALLENGE.ghostPositionStep,
];

/**
 * Magnitude cap on any quantised integer, raw delta or running total.
 *
 * 2^31, which is a bound anyone can reason about in physical terms: at the
 * centimetre step it is ±21,474 km — a fifth of the way round the Earth from
 * the origin, and the slice is 400 m across — and at the angle step it is
 * ±10.7 million radians, about 1.7 million full turns. A rider spinning
 * continuously for the whole 420-second cap accumulates a few thousand
 * radians, so this rejects nothing a run can produce while still refusing a
 * record that has been edited into nonsense.
 *
 * It is applied to the **running total** as well as to each delta, which is
 * what stops a decoded track walking off to 1e300 through a long array of
 * merely-large deltas.
 */
const MAX_QUANTISED = 2 ** 31;

/**
 * Longest track `decodeGhost` will accept, seconds.
 *
 * The recorder refuses to finish a run past `CHALLENGE.ghostMaxSeconds`, so
 * nothing this game writes can exceed it; the extra second is slack for the
 * quantised clock, not permission.
 */
const MAX_TOTAL_SECONDS = CHALLENGE.ghostMaxSeconds + 1;

/** Sample rates above this are meaningless — the simulation itself is 120 Hz. */
const MAX_SAMPLE_HZ = 240;

/** Absolute ceiling on the sample count, independent of the record's own `hz`. */
const MAX_SAMPLES = Math.ceil(MAX_TOTAL_SECONDS * MAX_SAMPLE_HZ) + 2;

/**
 * Cap on a stored level id, characters.
 *
 * The same reasoning as `app/options.ts`'s 32-character cap on key codes: not
 * paranoia about attackers, but about a corrupt record turning into a results
 * screen that tries to render a megabyte of text as a level name. Real ids are
 * `slice` and `proving`.
 */
const MAX_LEVEL_ID_LENGTH = 64;

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/** Every sample field, so a NaN anywhere in a pose can be rejected as a unit. */
function poseIsFinite(pose: Omit<GhostSample, 't'>): boolean {
  return (
    Number.isFinite(pose.x)
    && Number.isFinite(pose.y)
    && Number.isFinite(pose.z)
    && Number.isFinite(pose.groundY)
    && Number.isFinite(pose.headingY)
    && Number.isFinite(pose.rollAngle)
    && Number.isFinite(pose.speed)
    && Number.isFinite(pose.crouch)
  );
}

export class GhostRecorder {
  /** Seconds between kept samples. */
  private readonly interval: number;
  private readonly maxSeconds: number;
  /** Hard ceiling on the array, so a misbehaving clock cannot grow it forever. */
  private readonly maxSamples: number;

  private samples: GhostSample[] = [];
  /** The run time the next sample is due at. */
  private nextSampleTime = 0;
  /** The last kept sample's time, or -1 before the first. Guards monotonicity. */
  private lastTime = -1;
  private stopped = false;

  /**
   * @param options Overrides for the tuning defaults. Present for tests and for
   *   a future "high-detail replay" that does not exist; the game constructs
   *   this with no arguments and gets `CHALLENGE.ghostSampleHz` /
   *   `.ghostMaxSeconds`. A nonsensical override falls back to the tuned value
   *   rather than producing a recorder that samples every zero seconds.
   */
  constructor(options: { sampleHz?: number; maxSeconds?: number } = {}) {
    const hz = options.sampleHz ?? CHALLENGE.ghostSampleHz;
    const rate = Number.isFinite(hz) && hz > 0 && hz <= MAX_SAMPLE_HZ ? hz : CHALLENGE.ghostSampleHz;
    this.interval = 1 / rate;

    const cap = options.maxSeconds ?? CHALLENGE.ghostMaxSeconds;
    this.maxSeconds = Number.isFinite(cap) && cap > 0 ? cap : CHALLENGE.ghostMaxSeconds;

    this.maxSamples = Math.ceil(this.maxSeconds * rate) + 2;
  }

  reset(): void {
    this.samples = [];
    this.nextSampleTime = 0;
    this.lastTime = -1;
    this.stopped = false;
  }

  /**
   * Once per fixed step, with the run clock. Decides internally whether to keep
   * it.
   *
   * The caller does not get to know the sample rate — it hands over every step
   * and this decides. That keeps the rate a property of the recording and not
   * of whoever wired it up, and it means `advance(n)` under the QA bridge
   * produces the same track as a real ride at any frame rate.
   *
   * Three things are silently ignored rather than thrown on, because a ghost is
   * a luxury and none of them should be able to end a run:
   *
   *   - a non-finite or negative clock;
   *   - a clock that has not moved forward past the last kept sample, which is
   *     what keeps `t` strictly increasing — `GhostPlayer`'s binary search and
   *     `encodeGhost`'s delta chain both depend on that and neither should have
   *     to re-check it every frame;
   *   - a pose with a NaN in it. One poisoned sample would serialise as `null`
   *     and take the whole replay down with it, so the sample is dropped and
   *     the interpolation simply spans the gap.
   */
  record(runSeconds: number, pose: Omit<GhostSample, 't'>): void {
    if (this.stopped) return;
    if (!Number.isFinite(runSeconds) || runSeconds < 0) return;

    // Past the cap the recording stops for good and `finish` will return null.
    // A run this long is a player who parked in the park, and the alternative
    // is writing a megabyte into a store that may only have five.
    if (runSeconds > this.maxSeconds) {
      this.stopped = true;
      return;
    }

    if (runSeconds < this.nextSampleTime) return;
    if (runSeconds <= this.lastTime) return;
    if (!poseIsFinite(pose)) return;

    if (this.samples.length >= this.maxSamples) {
      this.stopped = true;
      return;
    }

    // Written out longhand rather than spread, so the stored object has exactly
    // the nine fields the encoder walks and no extras a caller happened to hang
    // on its pose object.
    this.samples.push({
      t: runSeconds,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      groundY: pose.groundY,
      headingY: pose.headingY,
      rollAngle: pose.rollAngle,
      speed: pose.speed,
      crouch: pose.crouch,
    });
    this.lastTime = runSeconds;

    // Derived from the clock rather than advanced by one interval, so a clock
    // that jumps a second forward skips the samples it missed instead of
    // keeping every step until it has caught up.
    //
    // **`round`, not `floor`, and that is not a detail.** The run clock is a
    // sum of 1/120 steps, so it lands a hair either side of each 0.05 boundary
    // rather than on it. With `floor`, a sample kept at 0.09999999999999999
    // sets the next due time to 0.1 — a femtosecond away — and the very next
    // step qualifies, so the recorder quietly samples at 21 Hz instead of 20
    // and the saved record is 6% larger than the tuning table says it should
    // be. Rounding says "the sample just kept was nominally index k; the next
    // one due is k+1", which is always at least half an interval ahead however
    // the floats fall.
    this.nextSampleTime = (Math.round(runSeconds / this.interval) + 1) * this.interval;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** True when the run outran `maxSeconds` and recording stopped. */
  get truncated(): boolean {
    return this.stopped;
  }

  /**
   * Null when there is nothing worth keeping (no samples, or truncated).
   *
   * The samples array is **handed over**, not copied: the recorder takes a
   * fresh one, so a later `record` cannot mutate a track already given to the
   * records store, and a three-minute lap does not pay for 3,600 object copies
   * on the frame the player crosses the finish line.
   */
  finish(levelId: string, totalSeconds: number): GhostTrack | null {
    if (this.stopped) return null;
    if (this.samples.length === 0) return null;
    if (typeof levelId !== 'string' || levelId.length === 0) return null;
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return null;

    const samples = this.samples;
    this.samples = [];

    // The run's total is the authority on how long the run was, but it can be a
    // hair behind the last sample when the finish gate is crossed mid-interval,
    // and a total shorter than the track would make the decoder's own
    // plausibility check disagree with a record it just wrote.
    const last = samples[samples.length - 1];
    const total = Math.max(totalSeconds, last.t);

    // A terminal sample at the authoritative finish time (M10 QA, F6). The
    // finish gate is usually crossed *between* kept samples, and
    // `GhostPlayer.sample` deliberately answers false past its last sample —
    // so without this the ghost vanished for the final fraction of a second of
    // the results transition, exactly at the line the whole race was about.
    // The pose is the last kept one, written out longhand like every other
    // sample so the stored object has exactly the nine fields the encoder
    // walks; the freeze is at most one sample interval and reads as the ghost
    // arriving, not as a stall.
    if (total > last.t) {
      samples.push({
        t: total,
        x: last.x,
        y: last.y,
        z: last.z,
        groundY: last.groundY,
        headingY: last.headingY,
        rollAngle: last.rollAngle,
        speed: last.speed,
        crouch: last.crouch,
      });
    }

    return Object.freeze({
      levelId,
      totalSeconds: total,
      samples: Object.freeze(samples) as readonly GhostSample[],
    });
  }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

const NO_SAMPLES: readonly GhostSample[] = Object.freeze([]);

export class GhostPlayer {
  private readonly samples: readonly GhostSample[];
  private readonly total: number;

  constructor(track: GhostTrack | null) {
    this.samples = track === null ? NO_SAMPLES : track.samples;
    this.total = track === null ? 0 : track.totalSeconds;
  }

  get totalSeconds(): number {
    return this.total;
  }

  get hasTrack(): boolean {
    return this.samples.length > 0;
  }

  /**
   * Interpolated sample at a run time, written into `out`.
   *
   * Returns false before the first sample and after the last, which is how a
   * caller knows to hide the ghost rather than freeze it at the finish line.
   * **That is a player-facing decision, not a defensive one.** A ghost clamped
   * to its last sample stands motionless on the finish line for as long as the
   * player is still riding toward it — a rider who is losing gets to watch the
   * thing that beat them idle there, which is the annoyance rule almost
   * literally. Off is better than frozen.
   *
   * Writes into `out` rather than returning an object because this runs once
   * per rendered frame and the alternative is a garbage collection every few
   * hundred frames, in a loop whose whole job is to be smooth.
   *
   * A binary search rather than a remembered cursor: 3,600 samples is twelve
   * comparisons, which is nothing next to a stateful cursor that has to be
   * right when the player restarts, scrubs, or rewinds, and wrong in a way that
   * only shows up as a ghost jumping.
   */
  sample(runSeconds: number, out: GhostSample): boolean {
    const samples = this.samples;
    const count = samples.length;
    if (count === 0) return false;
    if (!Number.isFinite(runSeconds)) return false;

    const first = samples[0];
    const last = samples[count - 1];
    if (runSeconds < first.t || runSeconds > last.t) return false;

    if (count === 1) {
      copySample(first, out);
      return true;
    }

    // Largest index whose time is at or before `runSeconds`, kept one short of
    // the end so `high` is always a real successor.
    let low = 0;
    let high = count - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (samples[mid].t <= runSeconds) low = mid;
      else high = mid;
    }

    const a = samples[low];
    const b = samples[high];
    const span = b.t - a.t;
    // A track built by hand rather than by the recorder could repeat a time.
    // Falling back to the earlier sample is cheaper than dividing by zero and
    // filling the pose with NaN.
    const u = span > 0 ? (runSeconds - a.t) / span : 0;

    out.t = runSeconds;
    out.x = a.x + (b.x - a.x) * u;
    out.y = a.y + (b.y - a.y) * u;
    out.z = a.z + (b.z - a.z) * u;
    out.groundY = a.groundY + (b.groundY - a.groundY) * u;
    // **A plain lerp, deliberately.** The heading is unwrapped (see
    // `GhostSample.headingY`), so 3.0 → 3.4 passes through 3.2 and not through
    // the far side of the circle. Taking a shortest-arc here would be actively
    // wrong: two samples 4 radians apart are a rider mid-spin, and the "short
    // way round" would render them turning the other way.
    out.headingY = a.headingY + (b.headingY - a.headingY) * u;
    out.rollAngle = a.rollAngle + (b.rollAngle - a.rollAngle) * u;
    out.speed = a.speed + (b.speed - a.speed) * u;
    out.crouch = a.crouch + (b.crouch - a.crouch) * u;
    return true;
  }
}

/** A zeroed sample, for a caller that needs an `out` buffer. */
export function createGhostSample(): GhostSample {
  return { t: 0, x: 0, y: 0, z: 0, groundY: 0, headingY: 0, rollAngle: 0, speed: 0, crouch: 0 };
}

function copySample(from: GhostSample, to: GhostSample): void {
  to.t = from.t;
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.groundY = from.groundY;
  to.headingY = from.headingY;
  to.rollAngle = from.rollAngle;
  to.speed = from.speed;
  to.crouch = from.crouch;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * One value to its quantised integer, clamped into the range the decoder will
 * accept.
 *
 * The clamp is not defensive clutter — it is what makes `encode → decode` total.
 * Without it a hand-built track holding a position of 1e12 would encode to an
 * integer the decoder rejects, and the game would write a record it cannot read
 * back. `previous` is returned for a non-finite input so the ghost holds its
 * last pose for that sample rather than teleporting or serialising as `null`.
 */
function quantise(value: number, step: number, previous: number): number {
  if (!Number.isFinite(value)) return previous;
  const q = Math.round(value / step);
  if (q > MAX_QUANTISED) return MAX_QUANTISED;
  if (q < -MAX_QUANTISED) return -MAX_QUANTISED;
  return q;
}

export function encodeGhost(track: GhostTrack): EncodedGhost {
  const samples = track.samples;
  const count = samples.length;
  const data: number[] = new Array(count * FIELDS_PER_SAMPLE);

  // The running quantised value per field. The first sample therefore encodes
  // as its own absolute quantised value, and every later one as a difference.
  const accumulator = new Float64Array(FIELDS_PER_SAMPLE);
  // Scratch for one sample's raw values, reused, so the loop allocates nothing.
  const raw = new Float64Array(FIELDS_PER_SAMPLE);

  for (let i = 0, offset = 0; i < count; i += 1, offset += FIELDS_PER_SAMPLE) {
    const sample = samples[i];
    raw[FIELD_T] = sample.t;
    raw[FIELD_X] = sample.x;
    raw[FIELD_Y] = sample.y;
    raw[FIELD_Z] = sample.z;
    raw[FIELD_GROUND_Y] = sample.groundY;
    raw[FIELD_HEADING] = sample.headingY;
    raw[FIELD_ROLL] = sample.rollAngle;
    raw[FIELD_SPEED] = sample.speed;
    raw[FIELD_CROUCH] = sample.crouch;

    for (let field = 0; field < FIELDS_PER_SAMPLE; field += 1) {
      const previous = accumulator[field];
      const q = quantise(raw[field], FIELD_STEPS[field], previous);
      data[offset + field] = q - previous;
      accumulator[field] = q;
    }
  }

  return Object.freeze({
    v: 1 as const,
    level: track.levelId,
    hz: derivedHz(samples),
    // Three decimals because that is `TIME_STEP`: the track's own clock has no
    // more resolution than this, so the extra fourteen characters a raw double
    // would spend here say nothing.
    total: roundTo(Math.max(0, track.totalSeconds), 3),
    n: count,
    data,
  });
}

/**
 * The record's nominal sample rate, derived from the samples themselves.
 *
 * `GhostTrack` does not carry the rate — nothing replaying it needs one,
 * because every sample states its own time. It is recomputed here purely so
 * `decodeGhost` has something to check `n` against, and so a human reading a
 * saved record can tell at a glance what it is.
 *
 * **Rounded up, not to nearest**, and that detail matters: the decoder's
 * plausibility test is `n <= ceil(total × hz) + 2`, so an `hz` rounded *down*
 * would tighten that bound, and on a long run the tightening exceeds the slack
 * and the decoder starts rejecting records this very function wrote. Rounding
 * up can only ever loosen it.
 */
function derivedHz(samples: readonly GhostSample[]): number {
  const count = samples.length;
  if (count < 2) return CHALLENGE.ghostSampleHz;
  const span = samples[count - 1].t - samples[0].t;
  if (!(span > 0)) return CHALLENGE.ghostSampleHz;
  const hz = (count - 1) / span;
  if (!Number.isFinite(hz) || hz <= 0) return CHALLENGE.ghostSampleHz;
  return Math.min(MAX_SAMPLE_HZ, Math.ceil(hz * 100) / 100);
}

/**
 * Round to a number of decimal places, so a float does not spend seventeen
 * characters in the JSON saying something the format resolves to three.
 *
 * Dividing by a power of ten rather than multiplying by a step, because
 * `Math.round(v / 0.001) * 0.001` reintroduces exactly the long tail it was
 * meant to remove.
 */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/**
 * Null for anything unparseable, wrong-version, or implausibly large.
 *
 * **Every field is treated as hostile**, exactly as `app/options.ts`'s
 * `coerceOptions` is, and for the same three reasons: a record written by a
 * newer build and read by an older one, a player editing `localStorage` by
 * hand, and a half-written value from a tab killed mid-save. The difference is
 * the failure mode. Options degrade to their defaults because a player who
 * loses their volume settings has lost something small; a half-decoded ghost
 * has no meaningful default, so this returns null and `app/records.ts` keeps
 * the *time* with `ghost: null`. Losing a replay is much smaller than losing a
 * personal best.
 *
 * The order of the checks is load-bearing. Everything cheap and scalar is
 * settled first, then `data.length` is required to equal `n * 9` **before**
 * anything is allocated — so an `n` of a billion is rejected by a comparison
 * rather than by `new Array(1e9)`. Nothing here throws and nothing here can
 * produce a NaN in a sample: every element must pass `Number.isInteger`, which
 * is false for NaN, both infinities, `"5"`, and `null` alike.
 */
export function decodeGhost(raw: unknown): GhostTrack | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  // Version first. A future v2 is a different shape and must not be read
  // field-by-field on the hope that some of it still fits.
  if (record.v !== 1) return null;

  const level = record.level;
  if (typeof level !== 'string') return null;
  if (level.length === 0 || level.length > MAX_LEVEL_ID_LENGTH) return null;

  const hz = record.hz;
  if (typeof hz !== 'number' || !Number.isFinite(hz) || hz <= 0 || hz > MAX_SAMPLE_HZ) return null;

  const total = record.total;
  if (typeof total !== 'number' || !Number.isFinite(total)) return null;
  if (total < 0 || total > MAX_TOTAL_SECONDS) return null;

  const count = record.n;
  if (typeof count !== 'number' || !Number.isInteger(count)) return null;
  if (count < 1 || count > MAX_SAMPLES) return null;

  const data = record.data;
  if (!Array.isArray(data)) return null;
  // The truncation check, and the one that makes the allocation below safe.
  if (data.length !== count * FIELDS_PER_SAMPLE) return null;

  // Plausibility: a run of `total` seconds sampled at `hz` cannot hold more
  // than this many samples, whatever the record claims. Two of slack for the
  // endpoints and for the quantised clock.
  if (count > Math.ceil(total * hz) + 2) return null;

  const samples: GhostSample[] = new Array(count);
  const accumulator = new Float64Array(FIELDS_PER_SAMPLE);
  let previousTime = -Infinity;

  for (let i = 0, offset = 0; i < count; i += 1, offset += FIELDS_PER_SAMPLE) {
    for (let field = 0; field < FIELDS_PER_SAMPLE; field += 1) {
      const delta = data[offset + field];
      if (typeof delta !== 'number' || !Number.isInteger(delta)) return null;
      if (delta < -MAX_QUANTISED || delta > MAX_QUANTISED) return null;
      const next = accumulator[field] + delta;
      // Bounding the running total as well as the delta is what stops a long
      // array of merely-large deltas walking the track off to 1e300.
      if (next < -MAX_QUANTISED || next > MAX_QUANTISED) return null;
      accumulator[field] = next;
    }

    const t = accumulator[FIELD_T] * TIME_STEP;
    // Strictly increasing, non-negative, and inside the cap. The binary search
    // in `GhostPlayer` assumes an ordered track, and checking it here once is
    // the reason it never has to. Written as `!(t > previousTime)` so a NaN
    // that somehow survived the integer checks would also fail.
    if (!(t > previousTime)) return null;
    if (t < 0 || t > MAX_TOTAL_SECONDS) return null;
    previousTime = t;

    samples[i] = {
      t,
      x: accumulator[FIELD_X] * CHALLENGE.ghostPositionStep,
      y: accumulator[FIELD_Y] * CHALLENGE.ghostPositionStep,
      z: accumulator[FIELD_Z] * CHALLENGE.ghostPositionStep,
      groundY: accumulator[FIELD_GROUND_Y] * CHALLENGE.ghostPositionStep,
      headingY: accumulator[FIELD_HEADING] * CHALLENGE.ghostAngleStep,
      rollAngle: accumulator[FIELD_ROLL] * CHALLENGE.ghostAngleStep,
      speed: accumulator[FIELD_SPEED] * CHALLENGE.ghostPositionStep,
      crouch: accumulator[FIELD_CROUCH] * CHALLENGE.ghostPositionStep,
    };
  }

  return Object.freeze({
    levelId: level,
    totalSeconds: Math.max(total, previousTime),
    samples: Object.freeze(samples) as readonly GhostSample[],
  });
}
