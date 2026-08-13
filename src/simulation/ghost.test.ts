/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHALLENGE } from '../data/tuning.ts';
import {
  GhostPlayer,
  GhostRecorder,
  createGhostSample,
  decodeGhost,
  encodeGhost,
  type EncodedGhost,
  type GhostSample,
  type GhostTrack,
} from './ghost.ts';

/**
 * The ghost: recording, replay, and the wire format that reaches
 * `localStorage`.
 *
 * Three things here are worth more than the rest and are tested hardest:
 *
 *   1. **The encoded size.** The whole reason the format is quantised deltas is
 *      that a naive one would spend a fifth of the origin quota on one replay
 *      and start costing players their personal bests. A test that does not
 *      measure the bytes is not testing the thing the format exists for, so
 *      `synthesiseLap` below builds a realistic three-minute run and the size
 *      test reports the actual number.
 *   2. **`decodeGhost` under hostile input.** Everything that reaches it has
 *      been through `JSON.parse` on a string a player could have edited. It
 *      must return null and must never throw or produce a NaN in a sample.
 *   3. **The unwrapped heading.** It grows without bound, it is lerped flat,
 *      and the delta encoding has to survive both. Drift here is invisible for
 *      the first thirty seconds and obvious by the end of a lap, which is the
 *      worst kind of bug to find by playing.
 */

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STEP = 1 / 120;

/** A pose with everything at rest, for tests that only care about one field. */
function pose(overrides: Partial<Omit<GhostSample, 't'>> = {}): Omit<GhostSample, 't'> {
  return {
    x: 0,
    y: 0,
    z: 0,
    groundY: 0,
    headingY: 0,
    rollAngle: 0,
    speed: 0,
    crouch: 0,
    ...overrides,
  };
}

/**
 * A plausible lap, driven at the real 120 Hz simulation step.
 *
 * Not a straight line and not noise. The speed wanders between about 6 and
 * 14 m/s, the yaw rate carves at two frequencies over a **sustained turning
 * bias** so the heading accumulates roughly twenty radians over three minutes
 * and therefore unwraps past ±π several times, the ground undulates, the rider
 * hops every eleven seconds and tucks before each hop. That combination is what
 * makes the size measurement mean something: a straight line delta-encodes to
 * almost nothing and would flatter the format enormously.
 */
function synthesiseLap(recorder: GhostRecorder, seconds: number): number {
  let heading = 0;
  let x = 0;
  let z = 0;
  const steps = Math.round(seconds / STEP);

  for (let i = 0; i <= steps; i += 1) {
    const t = i * STEP;
    const speed = 10 + 4 * Math.sin(t * 0.21) + 1.5 * Math.sin(t * 1.7);
    const yawRate = 0.55 * Math.sin(t * 0.37) + 0.25 * Math.sin(t * 2.3) + 0.12;
    heading += yawRate * STEP;
    // Positive yaw turns left and +X is the rider's left, so the heading's
    // forward vector is (sin, cos) in the XZ plane.
    x += Math.sin(heading) * speed * STEP;
    z += Math.cos(heading) * speed * STEP;

    const groundY = 0.4 * Math.sin(x * 0.05) + 0.3 * Math.cos(z * 0.043);
    const phase = t % 11;
    const hop = phase < 0.45 ? Math.sin((phase / 0.45) * Math.PI) * 0.5 : 0;

    recorder.record(t, {
      x,
      y: groundY + 0.28 + hop,
      z,
      groundY,
      headingY: heading,
      rollAngle: -yawRate * 0.42,
      speed,
      crouch: phase > 10.1 ? 0.62 : 0.05 + 0.04 * Math.sin(t * 3),
    });
  }

  return heading;
}

/** A short, hand-checkable track built without the recorder. */
function track(samples: GhostSample[], levelId = 'slice'): GhostTrack {
  return {
    levelId,
    totalSeconds: samples.length === 0 ? 0 : samples[samples.length - 1].t,
    samples,
  };
}

function sampleAt(t: number, overrides: Partial<Omit<GhostSample, 't'>> = {}): GhostSample {
  return { t, ...pose(overrides) };
}

// ---------------------------------------------------------------------------
// GhostRecorder
// ---------------------------------------------------------------------------

test('the recorder keeps one sample per interval, not one per step', () => {
  const recorder = new GhostRecorder({ sampleHz: 20 });
  for (let i = 0; i <= 120; i += 1) recorder.record(i * STEP, pose({ x: i }));

  // One second of 120 Hz steps at 20 Hz is twenty intervals plus the sample at
  // zero. The exact count can be one either way depending on how the clock's
  // floats land on the interval boundaries, and that is fine — every sample
  // carries its own time, so nothing downstream assumes a fixed spacing.
  assert.ok(
    recorder.sampleCount >= 20 && recorder.sampleCount <= 22,
    `kept ${recorder.sampleCount} samples for one second at 20 Hz`,
  );

  const kept = recorder.finish('slice', 1);
  assert.notEqual(kept, null);
  assert.equal(kept?.samples[0].t, 0, 'the first step is always kept');
});

test('the sample rate holds over a long run and does not creep', (t) => {
  // A regression guard with a real cost behind it. The run clock is a sum of
  // 1/120 steps, so it lands a hair either side of each 0.05 boundary; a
  // scheduler that floors instead of rounding samples at 21 Hz rather than 20
  // and every saved record is 6% larger than the tuning table says. That is
  // invisible in a one-second test and plainly wrong over a lap.
  const recorder = new GhostRecorder();
  synthesiseLap(recorder, 180);
  const rate = recorder.sampleCount / 180;
  t.diagnostic(`${recorder.sampleCount} samples over 180 s → ${rate.toFixed(3)} Hz`);
  assert.ok(
    Math.abs(rate - CHALLENGE.ghostSampleHz) < 0.05,
    `sampled at ${rate} Hz against a tuned ${CHALLENGE.ghostSampleHz} Hz`,
  );
});

test('the recorder is driven by the clock it is given, not by call count', () => {
  // The QA bridge's `advance(n)` and a real ride at 60 fps hand over different
  // numbers of calls for the same run. Only the clock may decide.
  const dense = new GhostRecorder({ sampleHz: 20 });
  for (let i = 0; i <= 240; i += 1) dense.record(i * (1 / 240), pose({ x: i }));
  const sparse = new GhostRecorder({ sampleHz: 20 });
  for (let i = 0; i <= 60; i += 1) sparse.record(i * (1 / 60), pose({ x: i * 4 }));

  const a = dense.finish('slice', 1);
  const b = sparse.finish('slice', 1);
  assert.notEqual(a, null);
  assert.notEqual(b, null);
  assert.equal(a?.samples.length, b?.samples.length);
});

test('a clock that goes backwards or stands still is ignored', () => {
  // Strictly increasing `t` is what `GhostPlayer`'s binary search and the delta
  // chain both rest on, so it is enforced at the only place it can enter.
  const recorder = new GhostRecorder({ sampleHz: 10 });
  recorder.record(0, pose({ x: 1 }));
  recorder.record(0, pose({ x: 2 }));
  recorder.record(-5, pose({ x: 3 }));
  recorder.record(0.2, pose({ x: 4 }));
  recorder.record(0.1, pose({ x: 5 }));
  recorder.record(0.4, pose({ x: 6 }));

  const kept = recorder.finish('slice', 0.4);
  assert.notEqual(kept, null);
  const times = kept?.samples.map((s) => s.t) ?? [];
  for (let i = 1; i < times.length; i += 1) {
    assert.ok(times[i] > times[i - 1], `sample ${i} at ${times[i]} follows ${times[i - 1]}`);
  }
  assert.deepEqual(kept?.samples.map((s) => s.x), [1, 4, 6]);
});

test('a non-finite clock or a poisoned pose is dropped, not recorded', () => {
  const recorder = new GhostRecorder({ sampleHz: 10 });
  recorder.record(0, pose({ x: 1 }));
  recorder.record(Number.NaN, pose({ x: 2 }));
  recorder.record(Number.POSITIVE_INFINITY, pose({ x: 3 }));
  recorder.record(0.1, pose({ x: Number.NaN }));
  recorder.record(0.2, pose({ headingY: Number.POSITIVE_INFINITY }));
  recorder.record(0.3, pose({ x: 9 }));

  const kept = recorder.finish('slice', 0.3);
  assert.notEqual(kept, null);
  for (const sample of kept?.samples ?? []) {
    for (const value of Object.values(sample)) {
      assert.ok(Number.isFinite(value), `a recorded field was ${value}`);
    }
  }
  assert.deepEqual(kept?.samples.map((s) => s.x), [1, 9]);
});

test('a run past the cap truncates and yields no track at all', () => {
  const recorder = new GhostRecorder({ sampleHz: 10, maxSeconds: 1 });
  for (let i = 0; i <= 300; i += 1) recorder.record(i * 0.01, pose({ x: i }));
  assert.equal(recorder.truncated, true);
  assert.equal(recorder.finish('slice', 3), null, 'a truncated run keeps no ghost');
  // …and the run itself is unaffected: losing the ghost must be much smaller
  // than losing the time, which is why this returns null rather than throwing.
});

test('reset clears the samples and the truncation flag', () => {
  const recorder = new GhostRecorder({ sampleHz: 10, maxSeconds: 0.5 });
  for (let i = 0; i <= 200; i += 1) recorder.record(i * 0.01, pose({ x: i }));
  assert.equal(recorder.truncated, true);

  recorder.reset();
  assert.equal(recorder.truncated, false);
  assert.equal(recorder.sampleCount, 0);

  recorder.record(0, pose({ x: 7 }));
  const kept = recorder.finish('slice', 0.1);
  // Two samples: the one recorded, plus the terminal pose finish() synthesizes
  // at the authoritative total so the ghost exists all the way to the line.
  assert.equal(kept?.samples.length, 2);
  assert.equal(kept?.samples[0].x, 7);
});

test('finish refuses a run it cannot describe', () => {
  const empty = new GhostRecorder();
  assert.equal(empty.finish('slice', 12), null, 'no samples, no track');

  const recorder = new GhostRecorder({ sampleHz: 10 });
  recorder.record(0, pose());
  assert.equal(recorder.finish('', 12), null, 'a blank level id is not a level');

  const another = new GhostRecorder({ sampleHz: 10 });
  another.record(0, pose());
  assert.equal(another.finish('slice', Number.NaN), null);
});

test('finish hands the samples over, so later recording cannot mutate the track', () => {
  // `RecordsStore` holds the returned track while the player rides again. If
  // the recorder kept writing into the same array, a personal best's ghost
  // would grow a second run's worth of samples on the end.
  const recorder = new GhostRecorder({ sampleHz: 10 });
  recorder.record(0, pose({ x: 1 }));
  recorder.record(0.1, pose({ x: 2 }));
  const kept = recorder.finish('slice', 0.1);
  const lengthAtFinish = kept?.samples.length ?? 0;

  recorder.reset();
  for (let i = 0; i <= 20; i += 1) recorder.record(i * 0.1, pose({ x: 100 + i }));
  assert.equal(kept?.samples.length, lengthAtFinish);
  assert.equal(kept?.samples[0].x, 1);
});

test('the ghost still has a pose at the exact finish time', () => {
  // The finish gate is usually crossed *between* kept samples, and the player
  // deliberately answers false past its last sample rather than freezing on
  // the line. Without a terminal sample at the authoritative total, the ghost
  // vanished for the final fraction of a second of the results transition
  // (M10 QA, F6).
  const recorder = new GhostRecorder({ sampleHz: 10 });
  recorder.record(0, pose({ x: 1 }));
  recorder.record(0.1, pose({ x: 2, speed: 8 }));
  const kept = recorder.finish('slice', 0.147);
  assert.notEqual(kept, null);
  assert.equal(kept?.totalSeconds, 0.147);

  const player = new GhostPlayer(kept);
  const out = createGhostSample();
  assert.equal(player.sample(kept?.totalSeconds ?? 0, out), true,
    'a pose exists at the authoritative finish time');
  assert.equal(out.x, 2, 'the terminal pose holds the last recorded sample');

  // And the synthesized sample survives the wire format, so a saved record
  // replays to the line too.
  const decoded = decodeGhost(encodeGhost(kept as GhostTrack));
  assert.notEqual(decoded, null);
  const replay = new GhostPlayer(decoded);
  assert.equal(replay.sample(decoded?.totalSeconds ?? 0, out), true);
});

test('finish never reports a total shorter than the track it describes', () => {
  // The finish gate is crossed mid-interval, so the run clock can land a hair
  // behind the last sample. A total shorter than the track would make the
  // decoder's own plausibility check disagree with a record it just wrote.
  const recorder = new GhostRecorder({ sampleHz: 10 });
  recorder.record(0, pose());
  recorder.record(0.5, pose());
  const kept = recorder.finish('slice', 0.4);
  assert.equal(kept?.totalSeconds, 0.5);
});

test('a nonsensical constructor override falls back to the tuned values', () => {
  for (const sampleHz of [0, -20, Number.NaN, Number.POSITIVE_INFINITY, 100_000]) {
    const recorder = new GhostRecorder({ sampleHz });
    for (let i = 0; i <= 120; i += 1) recorder.record(i * STEP, pose());
    assert.ok(
      recorder.sampleCount > 0 && recorder.sampleCount <= 24,
      `sampleHz ${sampleHz} produced ${recorder.sampleCount} samples in a second`,
    );
  }
});

// ---------------------------------------------------------------------------
// GhostPlayer
// ---------------------------------------------------------------------------

test('a player with no track answers no to everything', () => {
  const player = new GhostPlayer(null);
  const out = createGhostSample();
  assert.equal(player.hasTrack, false);
  assert.equal(player.totalSeconds, 0);
  assert.equal(player.sample(0, out), false);
  assert.equal(player.sample(1, out), false);
});

test('the player does not extrapolate at either end', () => {
  // This is the reason the caller can hide the ghost rather than leave it
  // standing on the finish line while a losing rider is still on their way to
  // it — which would be the annoyance rule, almost literally.
  const player = new GhostPlayer(track([
    sampleAt(1, { x: 10 }),
    sampleAt(2, { x: 20 }),
    sampleAt(3, { x: 30 }),
  ]));
  const out = createGhostSample();

  assert.equal(player.sample(0.999, out), false, 'before the first sample');
  assert.equal(player.sample(3.001, out), false, 'after the last sample');
  assert.equal(player.sample(Number.NaN, out), false);
  assert.equal(player.sample(Number.POSITIVE_INFINITY, out), false);

  assert.equal(player.sample(1, out), true, 'exactly the first sample');
  assert.equal(out.x, 10);
  assert.equal(player.sample(3, out), true, 'exactly the last sample');
  assert.equal(out.x, 30);
});

test('the player interpolates every field between the bracketing samples', () => {
  const player = new GhostPlayer(track([
    sampleAt(0, { x: 0, y: 1, z: 2, groundY: 0.5, headingY: 1, rollAngle: -0.2, speed: 4, crouch: 0 }),
    sampleAt(1, { x: 10, y: 3, z: 6, groundY: 1.5, headingY: 2, rollAngle: 0.2, speed: 8, crouch: 1 }),
  ]));
  const out = createGhostSample();
  assert.equal(player.sample(0.25, out), true);
  assert.equal(out.t, 0.25);
  assert.equal(out.x, 2.5);
  assert.equal(out.y, 1.5);
  assert.equal(out.z, 3);
  assert.equal(out.groundY, 0.75);
  assert.equal(out.headingY, 1.25);
  assert.ok(Math.abs(out.rollAngle - -0.1) < 1e-12);
  assert.equal(out.speed, 5);
  assert.equal(out.crouch, 0.25);
});

test('the heading lerps flat and never takes a shortest arc', () => {
  // The controller keeps the heading unwrapped on purpose. Two samples four
  // radians apart are a rider mid-spin; a shortest-arc interpolation would
  // render them turning the other way, and one that wrapped at ±π would spin
  // the ghost a full turn on a single frame somewhere near north.
  const cases: readonly [number, number, number][] = [
    [3.0, 3.4, 3.2],            // straight through +π
    [-3.0, -3.4, -3.2],         // straight through −π
    [6.0, 6.4, 6.2],            // past a full turn, still counting
    [0.2, 4.2, 2.2],            // four radians apart: the long way is the truth
    [120.0, 120.6, 120.3],      // a rider who has been circling the block
  ];
  const out = createGhostSample();
  for (const [from, to, expected] of cases) {
    const player = new GhostPlayer(track([
      sampleAt(0, { headingY: from }),
      sampleAt(1, { headingY: to }),
    ]));
    assert.equal(player.sample(0.5, out), true);
    assert.ok(
      Math.abs(out.headingY - expected) < 1e-9,
      `lerp ${from} → ${to} gave ${out.headingY}, expected ${expected}`,
    );
  }
});

test('the player finds the right bracket anywhere in a long track', () => {
  const samples: GhostSample[] = [];
  for (let i = 0; i < 2000; i += 1) samples.push(sampleAt(i * 0.05, { x: i }));
  const player = new GhostPlayer(track(samples));
  const out = createGhostSample();

  for (let i = 0; i < 1999; i += 1) {
    assert.equal(player.sample(i * 0.05 + 0.025, out), true);
    assert.ok(
      Math.abs(out.x - (i + 0.5)) < 1e-9,
      `midway through segment ${i} the player read x=${out.x}`,
    );
  }
});

test('a one-sample track is replayable at its single instant and nowhere else', () => {
  const player = new GhostPlayer(track([sampleAt(2, { x: 5 })]));
  const out = createGhostSample();
  assert.equal(player.hasTrack, true);
  assert.equal(player.sample(1.9, out), false);
  assert.equal(player.sample(2.1, out), false);
  assert.equal(player.sample(2, out), true);
  assert.equal(out.x, 5);
});

test('a hand-built track with a repeated time does not produce NaN', () => {
  // The recorder and the decoder both guarantee strictly increasing times, so
  // this can only arrive from a hand-built track — but dividing by a zero span
  // would fill the rendered pose with NaN, which is a silent invisible ghost.
  const player = new GhostPlayer(track([
    sampleAt(0, { x: 1 }),
    sampleAt(1, { x: 2 }),
    sampleAt(1, { x: 3 }),
    sampleAt(2, { x: 4 }),
  ]));
  const out = createGhostSample();
  assert.equal(player.sample(1, out), true);
  for (const value of Object.values(out)) assert.ok(Number.isFinite(value));
});

test('sampling writes into the caller’s buffer and allocates nothing', () => {
  const player = new GhostPlayer(track([sampleAt(0, { x: 0 }), sampleAt(1, { x: 10 })]));
  const out = createGhostSample();
  const identity = out;
  player.sample(0.5, out);
  assert.equal(out, identity);
  assert.equal(out.x, 5);
  player.sample(0.75, out);
  assert.equal(out, identity);
  assert.equal(out.x, 7.5);
});

// ---------------------------------------------------------------------------
// The wire format
// ---------------------------------------------------------------------------

test('encode → decode returns every sample within one quantisation step', () => {
  const recorder = new GhostRecorder();
  synthesiseLap(recorder, 45);
  const original = recorder.finish('slice', 45);
  assert.notEqual(original, null);
  if (original === null) return;

  const decoded = decodeGhost(encodeGhost(original));
  assert.notEqual(decoded, null);
  if (decoded === null) return;

  assert.equal(decoded.levelId, 'slice');
  assert.equal(decoded.samples.length, original.samples.length);

  const position = CHALLENGE.ghostPositionStep;
  const angle = CHALLENGE.ghostAngleStep;
  let worstPosition = 0;
  let worstAngle = 0;

  for (let i = 0; i < original.samples.length; i += 1) {
    const a = original.samples[i];
    const b = decoded.samples[i];
    assert.ok(Math.abs(b.t - a.t) <= 0.001, `sample ${i} time drifted to ${b.t - a.t}`);
    for (const field of ['x', 'y', 'z', 'groundY', 'speed', 'crouch'] as const) {
      const error = Math.abs(b[field] - a[field]);
      worstPosition = Math.max(worstPosition, error);
      assert.ok(error <= position, `sample ${i} ${field} off by ${error}`);
    }
    for (const field of ['headingY', 'rollAngle'] as const) {
      const error = Math.abs(b[field] - a[field]);
      worstAngle = Math.max(worstAngle, error);
      assert.ok(error <= angle, `sample ${i} ${field} off by ${error}`);
    }
  }

  // Half a step is what a correct round-trip costs. Anything approaching a
  // whole step means the deltas are being taken between raw values and the
  // rounding is accumulating along the track.
  assert.ok(worstPosition <= position / 2 + 1e-9, `worst position error ${worstPosition}`);
  assert.ok(worstAngle <= angle / 2 + 1e-9, `worst angle error ${worstAngle}`);
});

test('an unwrapped heading that grows for a whole lap does not drift', (t) => {
  const recorder = new GhostRecorder();
  const finalHeading = synthesiseLap(recorder, 180);
  const original = recorder.finish('slice', 180);
  assert.notEqual(original, null);
  if (original === null) return;

  t.diagnostic(
    `heading after three minutes: ${finalHeading.toFixed(2)} rad `
    + `(${(finalHeading / (Math.PI * 2)).toFixed(2)} turns), quantised to `
    + `${Math.round(finalHeading / CHALLENGE.ghostAngleStep)}`,
  );
  assert.ok(
    Math.abs(finalHeading) > Math.PI * 4,
    'the fixture must actually unwrap past ±π several times or this proves nothing',
  );

  const decoded = decodeGhost(encodeGhost(original));
  assert.notEqual(decoded, null);
  if (decoded === null) return;

  // The error must be flat across the track, not growing. Comparing the first
  // tenth against the last tenth is what catches an accumulating delta scheme,
  // which passes a short round-trip test and fails a lap.
  const count = decoded.samples.length;
  const window = Math.floor(count / 10);
  const worstIn = (from: number, to: number): number => {
    let worst = 0;
    for (let i = from; i < to; i += 1) {
      worst = Math.max(worst, Math.abs(decoded.samples[i].headingY - original.samples[i].headingY));
    }
    return worst;
  };
  const early = worstIn(0, window);
  const late = worstIn(count - window, count);
  t.diagnostic(`worst heading error: first tenth ${early}, last tenth ${late}`);
  assert.ok(late <= CHALLENGE.ghostAngleStep / 2 + 1e-9, `the tail drifted to ${late}`);
  assert.ok(early <= CHALLENGE.ghostAngleStep / 2 + 1e-9);
});

test('a three-minute lap encodes to well under 400 KB', (t) => {
  const recorder = new GhostRecorder();
  synthesiseLap(recorder, 180);
  const lap = recorder.finish('slice', 180);
  assert.notEqual(lap, null);
  if (lap === null) return;

  const encoded = encodeGhost(lap);
  const json = JSON.stringify(encoded);
  const bytes = Buffer.byteLength(json, 'utf8');

  t.diagnostic(
    `three-minute lap: ${lap.samples.length} samples, ${bytes} bytes `
    + `(${(bytes / 1024).toFixed(1)} KB, ${(bytes / lap.samples.length).toFixed(1)} B/sample)`,
  );

  // The budget. A typical origin quota is about 5 MB and this is the largest
  // single thing the game ever writes, so a replay that costs a tenth of it is
  // the point at which `RecordsStore` starts losing personal bests to
  // `QuotaExceededError`.
  assert.ok(bytes < 400 * 1024, `encoded to ${bytes} bytes`);

  // And it must still be a real three-minute lap, not a fixture that recorded
  // four samples and passed on a technicality.
  assert.ok(lap.samples.length > 3000, `only ${lap.samples.length} samples`);
});

test('the encoded record is JSON-safe: no NaN, no Infinity, no holes', () => {
  const recorder = new GhostRecorder();
  synthesiseLap(recorder, 20);
  const lap = recorder.finish('slice', 20);
  assert.notEqual(lap, null);
  if (lap === null) return;

  const encoded = encodeGhost(lap);
  assert.equal(encoded.v, 1);
  assert.equal(encoded.n, lap.samples.length);
  assert.equal(encoded.data.length, encoded.n * 9);
  for (const value of encoded.data) {
    assert.ok(Number.isInteger(value), `data held ${value}`);
  }
  // `JSON.stringify` turns a NaN into `null`, which is exactly the silent
  // corruption the decoder is written to catch. Prove it never has to.
  assert.equal(JSON.stringify(encoded).includes('null'), false);
});

test('encoding survives a hand-built track holding values it should never see', () => {
  // Not defensive clutter: without the clamp and the non-finite fallback,
  // encoding a poisoned track would write a record the decoder rejects, and the
  // game would save a personal best whose ghost it cannot read back.
  const encoded = encodeGhost(track([
    sampleAt(0, { x: 1 }),
    sampleAt(1, { x: Number.NaN, headingY: Number.POSITIVE_INFINITY }),
    sampleAt(2, { x: 1e30, y: -1e30 }),
  ]));
  for (const value of encoded.data) assert.ok(Number.isInteger(value));
  const decoded = decodeGhost(encoded);
  assert.notEqual(decoded, null);
  for (const sample of decoded?.samples ?? []) {
    for (const value of Object.values(sample)) assert.ok(Number.isFinite(value));
  }
});

test('decoding is idempotent: a decoded track re-encodes to the same record', () => {
  const recorder = new GhostRecorder();
  synthesiseLap(recorder, 15);
  const lap = recorder.finish('slice', 15);
  assert.notEqual(lap, null);
  if (lap === null) return;

  const once = encodeGhost(lap);
  const twice = encodeGhost(decodeGhost(once) as GhostTrack);
  assert.deepEqual(twice.data, once.data, 'a second pass must be a fixed point');
  assert.equal(twice.n, once.n);
});

test('a decoded track replays with the same shape the recorder captured', () => {
  const recorder = new GhostRecorder();
  synthesiseLap(recorder, 30);
  const lap = recorder.finish('slice', 30);
  assert.notEqual(lap, null);
  if (lap === null) return;

  const live = new GhostPlayer(lap);
  const saved = new GhostPlayer(decodeGhost(encodeGhost(lap)));
  const a = createGhostSample();
  const b = createGhostSample();

  // Sampled off the recording grid on purpose: this is the interpolation the
  // player actually sees, not the stored samples.
  for (let t = 0.017; t < 29; t += 0.31) {
    assert.equal(live.sample(t, a), saved.sample(t, b));
    assert.ok(Math.abs(a.x - b.x) < CHALLENGE.ghostPositionStep);
    assert.ok(Math.abs(a.z - b.z) < CHALLENGE.ghostPositionStep);
    assert.ok(Math.abs(a.headingY - b.headingY) < CHALLENGE.ghostAngleStep);
  }
});

// ---------------------------------------------------------------------------
// decodeGhost under hostile input
// ---------------------------------------------------------------------------

/** A small, valid record to mutate. Rebuilt per test so nothing leaks between them. */
function validRecord(): EncodedGhost {
  const recorder = new GhostRecorder({ sampleHz: 20 });
  synthesiseLap(recorder, 3);
  const lap = recorder.finish('slice', 3);
  assert.notEqual(lap, null);
  return encodeGhost(lap as GhostTrack);
}

/** Mutate one field of a valid record and hand back a plain object. */
function withField(field: string, value: unknown): Record<string, unknown> {
  return { ...validRecord(), [field]: value };
}

test('the fixture this section mutates is itself valid', () => {
  assert.notEqual(decodeGhost(validRecord()), null);
  // The audit has to be able to fail, or every assertion below is vacuous.
});

test('decode rejects anything that is not a record', () => {
  for (const raw of [
    null,
    undefined,
    0,
    1,
    Number.NaN,
    '',
    '{"v":1}',
    true,
    [],
    [1, 2, 3],
    () => 1,
    Symbol('x'),
  ]) {
    assert.equal(decodeGhost(raw), null, `accepted ${String(raw)}`);
  }
  assert.equal(decodeGhost({}), null);
});

test('decode rejects a wrong or missing version', () => {
  for (const v of [undefined, 0, 2, '1', null, Number.NaN, 1.5, true]) {
    assert.equal(decodeGhost(withField('v', v)), null, `accepted v=${String(v)}`);
  }
});

test('decode rejects a level id that is missing, blank, or absurd', () => {
  for (const level of [undefined, null, '', 42, {}, [], 'x'.repeat(65)]) {
    assert.equal(decodeGhost(withField('level', level)), null, `accepted level=${String(level)}`);
  }
  // A long-but-sane id is fine — this is a length cap, not an allow-list.
  assert.notEqual(decodeGhost(withField('level', 'x'.repeat(64))), null);
});

test('decode rejects an impossible sample rate', () => {
  for (const hz of [undefined, null, 0, -20, Number.NaN, Number.POSITIVE_INFINITY, 1000, '20']) {
    assert.equal(decodeGhost(withField('hz', hz)), null, `accepted hz=${String(hz)}`);
  }
});

test('decode rejects an impossible total', () => {
  for (const total of [
    undefined,
    null,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    CHALLENGE.ghostMaxSeconds + 60,
    '3',
  ]) {
    assert.equal(decodeGhost(withField('total', total)), null, `accepted total=${String(total)}`);
  }
});

test('decode rejects an `n` that disagrees with the data it came with', () => {
  const record = validRecord();
  const honest = record.n;
  for (const n of [honest - 1, honest + 1, 0, -5, 1.5, '60', null, undefined]) {
    assert.equal(decodeGhost({ ...record, n }), null, `accepted n=${String(n)}`);
  }
});

test('decode rejects an implausibly huge `n` without allocating for it', () => {
  // The check that matters is `data.length === n * 9`, and it comes before the
  // sample array is created — so a record claiming a billion samples costs one
  // comparison rather than eight gigabytes.
  const started = Date.now();
  for (const n of [1e9, 1e12, Number.MAX_SAFE_INTEGER, 2 ** 40]) {
    assert.equal(decodeGhost(withField('n', n)), null, `accepted n=${n}`);
  }
  // A record whose data really is that long cannot exist, but a record whose
  // `n` merely claims it must also be refused by the absolute cap.
  assert.equal(decodeGhost({ v: 1, level: 'slice', hz: 20, total: 100, n: 1e9, data: [] }), null);
  assert.ok(Date.now() - started < 2000, 'the huge-n path must be cheap');
});

test('decode rejects a truncated, over-long, or non-array data block', () => {
  const record = validRecord();
  const short = record.data.slice(0, record.data.length - 9);
  const shorter = record.data.slice(0, record.data.length - 1);
  const longer = [...record.data, 0];
  for (const data of [short, shorter, longer, [], null, undefined, {}, 'data']) {
    assert.equal(decodeGhost({ ...record, data }), null, 'accepted a bad data block');
  }
  // Truncated *with* a matching `n` is the honest half-write, and it must still
  // decode — the record is short, not corrupt.
  assert.notEqual(
    decodeGhost({ ...record, n: record.n - 1, data: short }),
    null,
  );
});

test('decode rejects a data block holding anything that is not an integer', () => {
  for (const poison of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1.5,
    '12',
    null,
    undefined,
    {},
    [],
    true,
  ]) {
    const record = validRecord();
    const data = [...record.data];
    data[Math.floor(data.length / 2)] = poison as number;
    assert.equal(decodeGhost({ ...record, data }), null, `accepted ${String(poison)} in data`);
  }
});

test('decode rejects a delta, or a running total, beyond the plausible range', () => {
  const cap = 2 ** 31;

  const single = validRecord();
  const oversized = [...single.data];
  oversized[1] = cap + 1;
  assert.equal(decodeGhost({ ...single, data: oversized }), null, 'a single absurd delta');

  // Each delta legal on its own, but they walk the track off the planet.
  // Three samples at 1 ms apart, x stepping by the cap each time.
  const walking = {
    v: 1,
    level: 'slice',
    hz: 20,
    total: 1,
    n: 3,
    data: [
      0, cap, 0, 0, 0, 0, 0, 0, 0,
      1, cap, 0, 0, 0, 0, 0, 0, 0,
      1, cap, 0, 0, 0, 0, 0, 0, 0,
    ],
  };
  assert.equal(decodeGhost(walking), null, 'an accumulating walk past the cap');
});

test('decode rejects a track whose times are not strictly increasing', () => {
  const base = { v: 1, level: 'slice', hz: 20, total: 1 };
  const zeros = new Array(8).fill(0) as number[];
  const frame = (dt: number): number[] => [dt, ...zeros];

  assert.notEqual(
    decodeGhost({ ...base, n: 3, data: [...frame(0), ...frame(50), ...frame(50)] }),
    null,
    'the honest version must decode, or this test proves nothing',
  );
  assert.equal(
    decodeGhost({ ...base, n: 3, data: [...frame(0), ...frame(50), ...frame(0)] }),
    null,
    'a repeated time',
  );
  assert.equal(
    decodeGhost({ ...base, n: 3, data: [...frame(0), ...frame(50), ...frame(-20)] }),
    null,
    'time running backwards',
  );
  assert.equal(
    decodeGhost({ ...base, n: 2, data: [...frame(-1), ...frame(50)] }),
    null,
    'a negative first time',
  );
});

test('decode rejects a sample count the duration cannot support', () => {
  // Ten samples claiming to span a hundredth of a second at 20 Hz. The record
  // is internally consistent and still a lie; catching it here is what keeps a
  // hand-edited record from reaching the player as a ghost that teleports.
  const zeros = new Array(8).fill(0) as number[];
  const data: number[] = [];
  for (let i = 0; i < 40; i += 1) data.push(i === 0 ? 0 : 1, ...zeros);
  assert.equal(
    decodeGhost({ v: 1, level: 'slice', hz: 20, total: 0.04, n: 40, data }),
    null,
  );
});

test('decode never throws and never yields a NaN, whatever it is handed', () => {
  // The blunt instrument. Every field of a valid record replaced by every kind
  // of hostile value, plus a scatter of poisoned data elements. The contract is
  // not that any particular one is rejected — it is that none of them throws
  // and none of them produces a sample the renderer would turn into a ghost at
  // coordinate NaN, which draws nothing and reports nothing.
  const hostile: readonly unknown[] = [
    undefined, null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
    0, -1, 1e300, -1e300, 0.5, '', 'slice', '1', true, false, {}, [], [1],
    Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 2 ** 53,
  ];
  const template = validRecord();
  const fields = ['v', 'level', 'hz', 'total', 'n', 'data', 'extra'];

  for (const field of fields) {
    for (const value of hostile) {
      const decoded = decodeGhost({ ...template, [field]: value });
      if (decoded === null) continue;
      assertTrackIsSane(decoded);
    }
  }

  for (let index = 0; index < template.data.length; index += 37) {
    for (const value of hostile) {
      const data = [...template.data];
      data[index] = value as number;
      const decoded = decodeGhost({ ...template, data });
      if (decoded === null) continue;
      assertTrackIsSane(decoded);
    }
  }

  // Objects with awkward shapes, which must be answered rather than crashed on.
  assert.equal(decodeGhost(Object.create(null) as unknown), null);
  assert.equal(decodeGhost(new Map()), null);
  assert.equal(decodeGhost(new Date()), null);
});

function assertTrackIsSane(decoded: GhostTrack): void {
  assert.equal(typeof decoded.levelId, 'string');
  assert.ok(Number.isFinite(decoded.totalSeconds));
  let previous = -Infinity;
  for (const sample of decoded.samples) {
    for (const [name, value] of Object.entries(sample)) {
      assert.ok(Number.isFinite(value), `decoded ${name} as ${value}`);
    }
    assert.ok(sample.t > previous, 'decoded track must be strictly ordered');
    previous = sample.t;
  }
  // And whatever survived must be replayable without producing a NaN pose.
  const player = new GhostPlayer(decoded);
  const out = createGhostSample();
  if (decoded.samples.length > 0) {
    const mid = (decoded.samples[0].t + decoded.samples[decoded.samples.length - 1].t) / 2;
    if (player.sample(mid, out)) {
      for (const value of Object.values(out)) assert.ok(Number.isFinite(value));
    }
  }
}
