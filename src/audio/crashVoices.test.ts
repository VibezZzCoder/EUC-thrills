/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { crashFor, type CrashVoiceId, type SampleBank } from './sink.ts';

/**
 * The three crash recordings, asserted as *files* rather than as wiring.
 *
 * M19 §19.8 is the only place in this project where an owner requirement is
 * about a file's bytes — "the same length as Cool Rider's, a different file,
 * and my voice removed" — and until this spec existed nothing in the repo read
 * a shipped `.wav` at all. So these tests open them.
 */

const AUDIO = join(import.meta.dirname, '..', '..', 'assets', 'live', 'audio');
const RATE = 44100;

/** The samples of a mono 16-bit PCM WAV, with the chunk walk the format needs. */
function readWav(name: string): Int16Array {
  const buffer = readFileSync(join(AUDIO, name));
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'data') {
      const samples = new Int16Array(Math.floor(size / 2));
      for (let i = 0; i < samples.length; i += 1) samples[i] = buffer.readInt16LE(body + i * 2);
      return samples;
    }
    offset = body + size + (size % 2);
  }
  throw new Error(`${name}: no data chunk`);
}

const coolRider = readWav('crash_wipeout.wav');
const trollina = readWav('crash_trollina.wav');
const redRider = readWav('crash_red_rider.wav');

test('every rider\'s crash is exactly as long as Cool Rider\'s', () => {
  // `audio/director.ts` ducks the mix on one envelope whoever is riding, so a
  // short file lets the duck open while the rider is still tumbling. Both
  // alternates are built against this number and both assert it themselves;
  // this is the assertion that survives someone replacing a file by hand.
  assert.equal(coolRider.length, 149_940);
  assert.equal(trollina.length, coolRider.length);
  assert.equal(redRider.length, coolRider.length);
});

test('Red Rider\'s crash is the owner\'s recording, changed only where the voice was', () => {
  // The owner's note is the spec: his voice is between 0.8 s and 1.5 s, and it
  // is the *only* thing that may differ. Rather than trust the tool's window
  // constants, this measures the changed region out of the two files and
  // checks where it lands — so a widened window, a drifted crossfade or a
  // second pass over the wrong stretch all fail here.
  let first = -1;
  let last = -1;
  let changed = 0;
  for (let i = 0; i < coolRider.length; i += 1) {
    if (coolRider[i] !== redRider[i]) {
      if (first === -1) first = i;
      last = i;
      changed += 1;
    }
  }

  assert.ok(changed > 0, 'his crash is byte-identical to the owner\'s — the voice is still in it');
  assert.ok(
    first / RATE >= 0.75,
    `the change starts at ${(first / RATE).toFixed(3)} s, before the voice does`,
  );
  assert.ok(
    last / RATE <= 1.57,
    `the change runs to ${(last / RATE).toFixed(3)} s, past where the voice ends`,
  );
  // A window that substitutes almost nothing would pass the bounds above while
  // leaving the words in. 0.7 s of a 44.1 kHz file is ~30,000 samples, and the
  // substituted band is dense, so anything under this is a broken run.
  assert.ok(changed > 30_000, `only ${changed} samples differ — the substitution did not run`);
});

const peakBetween = (samples: Int16Array, from = 0, to = samples.length): number => {
  let worst = 0;
  for (let i = from; i < to; i += 1) worst = Math.max(worst, Math.abs(samples[i]));
  return worst;
};

test('no crash recording is louder than the one it replaces', () => {
  // Swapping rider must not change how loud a crash is. Trollina's tool gets
  // there by RMS-matching a different performance; Red Rider's gets there by
  // being the same recording, with the substituted window capped at the
  // source's own peak.
  //
  // **His half is measured over the changed window, not the whole file**, and
  // that is the difference between an assertion and a formality: the owner's
  // loudest sample is at 0.347 s, outside the window, and his file copies it
  // verbatim — so a whole-file comparison is the same sample on both sides and
  // could never fail whatever the tool did to the part it actually rewrote.
  let first = redRider.length;
  let last = 0;
  for (let i = 0; i < coolRider.length; i += 1) {
    if (coolRider[i] !== redRider[i]) { first = Math.min(first, i); last = Math.max(last, i); }
  }
  assert.ok(first < last, 'nothing changed, so there is no window to measure');
  assert.ok(
    peakBetween(redRider, first, last + 1) <= peakBetween(coolRider),
    'the rewritten window peaks above the loudest sample of the owner\'s recording',
  );
  assert.ok(peakBetween(trollina) <= peakBetween(coolRider) * 1.05, 'her crash peaks above his');
});

test('Red Rider\'s crash does not carry the owner\'s voice band', () => {
  // **The assertion that carries §19.8's actual requirement.**
  //
  // The location test above proves *where* bytes changed; it would pass just as
  // happily on a file that had merely been made 1 dB quieter across the window
  // with every word still in it. This one asks what came out. The speech band
  // of the rewritten window must not line up with the speech band of the
  // owner's recording — if the words were still there, in place, it would.
  //
  // The filter here is deliberately *not* the tool's. A one-pole pair is a
  // couple of lines and distorts phase, which does not matter in the slightest
  // when both signals go through the identical filter and the only question is
  // whether they correlate. An independent measurement is worth more than a
  // shared one: this fails even if the tool's own arithmetic is wrong.
  const midBand = (samples: Int16Array): Float64Array => {
    const dt = 1 / RATE;
    const highRc = 1 / (2 * Math.PI * 200);
    const lowRc = 1 / (2 * Math.PI * 4000);
    const highA = highRc / (highRc + dt);
    const lowA = dt / (lowRc + dt);
    const out = new Float64Array(samples.length);
    let high = 0;
    let low = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const x = samples[i] / 32768;
      high = i === 0 ? 0 : highA * (high + x - samples[i - 1] / 32768);
      low += lowA * (high - low);
      out[i] = low;
    }
    return out;
  };

  let first = redRider.length;
  let last = 0;
  for (let i = 0; i < coolRider.length; i += 1) {
    if (coolRider[i] !== redRider[i]) { first = Math.min(first, i); last = Math.max(last, i); }
  }
  // Inside the crossfades both signals are partly the same audio by design, so
  // the measurement is taken over the core, 60 ms clear of each seam.
  const margin = Math.round(0.06 * RATE);
  const from = first + margin;
  const to = last - margin;
  assert.ok(to > from, 'the changed window is too short to measure');

  const source = midBand(coolRider);
  const his = midBand(redRider);
  let dot = 0;
  let a = 0;
  let b = 0;
  for (let i = from; i < to; i += 1) {
    dot += source[i] * his[i];
    a += source[i] ** 2;
    b += his[i] ** 2;
  }
  const correlation = dot / (Math.sqrt(a * b) + 1e-18);
  assert.ok(
    Math.abs(correlation) < 0.25,
    `the speech band of his crash still correlates ${correlation.toFixed(3)} with the owner's`,
  );
});

test('the three voices reach three different buffers', () => {
  // §19.8's headless evidence. `crashFor` carried a fallback while his file was
  // being built, and the failure it could hide — his voice quietly resolving to
  // the owner's — is invisible to `lastCrashVoice`, which reports the *choice*
  // rather than the buffer.
  const bank = {
    tyreOffroad: 'tyre-offroad',
    tyreSolid: 'tyre-solid',
    windHowl: 'wind',
    crash: 'cool-rider-buffer',
    crashTrollina: 'trollina-buffer',
    crashRedRider: 'red-rider-buffer',
    sirenFar: 'siren-far',
    sirenClose: 'siren-close',
  } as unknown as SampleBank;

  const voices: CrashVoiceId[] = ['cool-rider', 'trollina', 'red-rider'];
  const reached = voices.map((voice) => crashFor(voice, bank));
  assert.deepEqual(reached, ['cool-rider-buffer', 'trollina-buffer', 'red-rider-buffer']);
  assert.equal(new Set(reached).size, 3);
});
