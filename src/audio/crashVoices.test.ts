/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { crashFor, type CrashVoiceId, type SampleBank } from './sink.ts';

/**
 * The six crash recordings, asserted as *files* rather than as wiring.
 *
 * M19 §19.8 is the only place in this project where an owner requirement is
 * about a file's bytes — "the same length as Cool Rider's, a different file,
 * and my voice removed" — and until this spec existed nothing in the repo read
 * a shipped `.wav` at all. So these tests open them.
 *
 * M22 §22.8 added the fourth and, with it, the assertion that should have been
 * here from the start: that they are all *different files*. Every other test in
 * this spec passes on a build where somebody copied one crash over another, and
 * `crashFor` reaching distinct buffers cannot see it either — the buffers would
 * be distinct objects holding identical audio.
 *
 * M23 §23.11 added the fifth, and it is the one this file was always going to
 * be needed for: Maribel rode on Red Rider's crash by an explicit interim from
 * Phase A0 until her own recording existed. A swap like that is invisible
 * everywhere except in the bytes — `lastCrashVoice` would report `maribel`
 * either way — so the different-files test is what proves the interim is
 * actually over.
 *
 * M28 §28.10 added the sixth, and it is the one the different-files test was
 * written *against*: the owner asked for Red Rider's crash — his own wipeout
 * with his own voice removed — as a new file for Wheel in Motion, and a byte
 * copy is exactly what this file refuses. So his is a second render of the
 * same treatment from a different voice-free donor, identical to Red Rider's
 * everywhere except the 0.8 s that was rebuilt, and the sibling test below
 * says both halves of that.
 *
 * M29 §29.12 added the seventh, and a first: a file that is not a crash at
 * all. The Drunkard's crash is composed on Trollina's mechanism from a
 * generated take, so what this file has to prove about it is the Trollina
 * provenance shape — the same length, the same loudness, and *not a slice of
 * any shipped recording*. Beside it ships his stumble, the `stumble` cue's
 * 0.40 s recording, with its own length and level rules.
 *
 * M34 §34.10 added the eighth, and it is the render that had to give up the
 * promise M28's kept. **The donor pool is exhausted at two.** The take is
 * 3.400 s and the rebuilt window is 0.800 s, so the tool's clear-donor rule
 * leaves exactly one legal donor range (1.660-2.600 s), and Red Rider's donor
 * at 2.56 s and Wheel in Motion's at 1.74 s between them cover it — `--avoid`
 * has zero survivors for a third render. So FloWithZo's donor is *named*
 * (`--donor 2.200`) and his file shares material with both siblings. That
 * costs nothing this spec ever asked for: the bar here has always been that
 * the crashes are different files pairwise, which the twenty-eight-pair test
 * measures, and his sibling test below says the rest of it — he differs from
 * Red Rider's, from Wheel in Motion's *and* from the owner's inside the window
 * and is identical to all three outside it.
 *
 * M35 §35.6 added the ninth, and it is the first file in this game that is not
 * one provenance. Outside the window it is the owner's recording sample for
 * sample; inside it, it is a fourth render of the same treatment (donor 2.400,
 * chosen for the headroom a layer needed) **plus one CC0 layer** — 270 ms of a
 * seal barking, from Freesound #450751, mixed in where the owner's *"oh"* was
 * because that is what the owner asked for (q147). So this file has two things
 * to prove that no crash before it did: that the bark is **in** it, and that it
 * is **not too loud in the band the ride bed leaves empty** — the band whose
 * ceiling the last test in this file exists because of. Both are at the bottom,
 * with the chunk-grammar assertion the download's 36 KB of `iXML`/`_PMX`
 * metadata made necessary.
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
const adonisb2 = readWav('crash_adonisb2.wav');
const maribel = readWav('crash_maribel.wav');
const wheelInMotion = readWav('crash_wheel_in_motion.wav');
const drunkard = readWav('crash_drunkard.wav');
const floWithZo = readWav('crash_flo_with_zo.wav');
const sealOnAWheel = readWav('crash_seal_on_a_wheel.wav');
const stumble = readWav('stumble_drunkard.wav');

test('every rider\'s crash is exactly as long as Cool Rider\'s', () => {
  // `audio/director.ts` ducks the mix on one envelope whoever is riding, so a
  // short file lets the duck open while the rider is still tumbling. Every
  // alternate is built against this number and each asserts it itself; this is
  // the assertion that survives someone replacing a file by hand.
  //
  // It is also the number that decided M22's cut. His contributed recording is
  // 6.0 s and this slot is 3.4 s, so most of the ride in front of his fall had
  // to go — see `tools/make-crash-adonisb2.mjs` for which 3.4 s and why.
  assert.equal(coolRider.length, 149_940);
  assert.equal(trollina.length, coolRider.length);
  assert.equal(redRider.length, coolRider.length);
  assert.equal(adonisb2.length, coolRider.length);
  // And it decided M23's cut twice over. Her contributed recording is 6.918 s,
  // her drop starts at 4.010, so the latest straight cut that fits this slot
  // begins at 3.518 — which is why her impact lands at 0.492 s and not at
  // 0.347 s where the owner's does. See `tools/make-crash-maribel.mjs`.
  assert.equal(maribel.length, coolRider.length);
  // And his is the owner's file re-rendered, so its length is the owner's by
  // construction — asserted anyway, because this is the rule that survives a
  // hand-replaced file.
  assert.equal(wheelInMotion.length, coolRider.length);
  // And his is composed onto a length *read* from Cool Rider's file rather
  // than typed (Maribel's rule, `tools/make-crash-drunkard.mjs`) — asserted
  // anyway, for the reason above.
  assert.equal(drunkard.length, coolRider.length);
  // And his is the owner's file re-rendered a third time, so its length is the
  // owner's by construction as well — asserted anyway, same reason (M34).
  assert.equal(floWithZo.length, coolRider.length);
  // And his is the fourth render with a 0.27 s bark added inside the window,
  // which changes samples and not their number — asserted anyway, and here the
  // rule has something real to catch: a mix tool that appended rather than
  // added would lengthen the file and nothing else in this spec would notice
  // (M35).
  assert.equal(sealOnAWheel.length, coolRider.length);
});

test('the nine crashes are nine different recordings', () => {
  // Cheap, and it closes the gap every other test in this file leaves open: a
  // build where one crash was copied over another passes the length rule, the
  // loudness rule, and `crashFor`'s four-buffer check, and ships a rider
  // wearing somebody else's fall. Bytes are the only place that shows.
  //
  // **And it is the bar M34's third render was measured against**, rather than
  // the stronger promise `--avoid` made: with the clear-donor pool exhausted at
  // two, FloWithZo's file necessarily shares material with both siblings, and
  // what this project actually requires of it is exactly what this loop asks —
  // that no two shipped crashes are the same file.
  const files: readonly (readonly [string, Int16Array])[] = [
    ['cool-rider', coolRider], ['trollina', trollina],
    ['red-rider', redRider], ['adonisb2', adonisb2], ['maribel', maribel],
    ['wheel-in-motion', wheelInMotion], ['drunkard', drunkard],
    ['flo-with-zo', floWithZo], ['seal-on-a-wheel', sealOnAWheel],
  ];
  // Thirty-six pairs at nine; the loop is what grows, not a list of names.
  assert.equal((files.length * (files.length - 1)) / 2, 36);
  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      const [nameA, a] = files[i];
      const [nameB, b] = files[j];
      let same = 0;
      for (let k = 0; k < a.length; k += 1) if (a[k] === b[k]) same += 1;
      assert.ok(
        same < a.length,
        `${nameA}'s crash and ${nameB}'s are the same file, sample for sample`,
      );
    }
  }
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

test('Wheel in Motion\'s crash is Red Rider\'s, changed only where the voice was — and changed', () => {
  // **The sibling render, in both directions** (M28 §28.10). The owner asked
  // for "the same crash as Red Rider but a new file", and the file has to be
  // both things at once: outside the voice window it is the owner's recording
  // sample for sample, which means it is *identical to Red Rider's* there;
  // inside the window it is a different voice-free stretch of the same take,
  // which means it *differs* from Red Rider's there — and from the owner's,
  // since the voice is what was taken out. A byte copy fails the second half;
  // a third rider's recording fails the first.
  let first = -1;
  let last = -1;
  let changedFromRed = 0;
  for (let i = 0; i < redRider.length; i += 1) {
    if (redRider[i] !== wheelInMotion[i]) {
      if (first === -1) first = i;
      last = i;
      changedFromRed += 1;
    }
  }
  assert.ok(changedFromRed > 30_000, `only ${changedFromRed} samples differ from Red Rider's — this is his file again`);
  assert.ok(first / RATE >= 0.75, `he differs from Red Rider from ${(first / RATE).toFixed(3)} s, before the voice`);
  assert.ok(last / RATE <= 1.57, `he differs from Red Rider to ${(last / RATE).toFixed(3)} s, after the voice`);

  // And against the owner's: the same window, and the voice not in it. The
  // owner's loudest sample is at 0.347 s, outside the window, and is copied
  // across verbatim — so the rebuilt window may not out-peak it.
  let changedFromOwner = 0;
  let firstOwn = -1;
  let lastOwn = -1;
  for (let i = 0; i < coolRider.length; i += 1) {
    if (coolRider[i] !== wheelInMotion[i]) {
      if (firstOwn === -1) firstOwn = i;
      lastOwn = i;
      changedFromOwner += 1;
    }
  }
  assert.ok(changedFromOwner > 30_000, 'the voice is still in it');
  assert.ok(firstOwn / RATE >= 0.75 && lastOwn / RATE <= 1.57, 'he differs from the owner outside the voice window');
  let windowPeak = 0;
  for (let i = firstOwn; i <= lastOwn; i += 1) windowPeak = Math.max(windowPeak, Math.abs(wheelInMotion[i]));
  let ownerPeak = 0;
  for (let i = 0; i < coolRider.length; i += 1) ownerPeak = Math.max(ownerPeak, Math.abs(coolRider[i]));
  assert.ok(windowPeak <= ownerPeak, 'the rebuilt window peaks above the loudest sample of the owner\'s recording');
});

test('FloWithZo\'s crash is the third render: Red Rider\'s and Wheel in Motion\'s outside one window, and its own inside it', () => {
  // **The sibling test again, against three files instead of one** (M34
  // §34.10). His render is the same treatment from a third donor, so it owes
  // the same two things to each of the two files already shipped *and* to the
  // owner's: outside the voice window it is the owner's recording sample for
  // sample, which makes it identical to both siblings there; inside it, it is
  // a third stretch of the same take, which makes it different from all three.
  //
  // Asserting it against all three is the point, not thoroughness for its own
  // sake. His donor at 2.200 s overlaps both earlier donors by necessity —
  // `--avoid` had no survivors — so the one failure this catches is a render
  // that overlapped *so far* it came back byte-identical to one of them, which
  // is exactly what a naive `--avoid 2.56 --avoid 1.74` would have produced.
  //
  // Measured on the shipped file (2026-09-09): 35,259 samples differ from Red
  // Rider's, 35,263 from Wheel in Motion's and 35,253 from the owner's, every
  // one of them inside 0.760-1.560 s.
  const against = (other: Int16Array, name: string): { first: number; last: number } => {
    let first = -1;
    let last = -1;
    let changed = 0;
    for (let i = 0; i < other.length; i += 1) {
      if (other[i] !== floWithZo[i]) {
        if (first === -1) first = i;
        last = i;
        changed += 1;
      }
    }
    assert.ok(changed > 30_000, `only ${changed} samples differ from ${name}'s — this is that file again`);
    assert.ok(
      first / RATE >= 0.75,
      `he differs from ${name}'s from ${(first / RATE).toFixed(3)} s, before the voice`,
    );
    assert.ok(
      last / RATE <= 1.57,
      `he differs from ${name}'s to ${(last / RATE).toFixed(3)} s, after the voice`,
    );
    return { first, last };
  };

  against(redRider, 'Red Rider');
  against(wheelInMotion, 'Wheel in Motion');
  const { first, last } = against(coolRider, 'the owner');

  // And the owner's loudest sample is at 0.347 s, outside the window and
  // copied across verbatim — so the rebuilt window may not out-peak it.
  let windowPeak = 0;
  for (let i = first; i <= last; i += 1) windowPeak = Math.max(windowPeak, Math.abs(floWithZo[i]));
  let ownerPeak = 0;
  for (let i = 0; i < coolRider.length; i += 1) ownerPeak = Math.max(ownerPeak, Math.abs(coolRider[i]));
  assert.ok(windowPeak <= ownerPeak, 'the rebuilt window peaks above the loudest sample of the owner\'s recording');
});

test('Seal on a Wheel\'s crash is the fourth render: the owner\'s outside one window, his own inside it', () => {
  // **The sibling test against four files** (M35 §35.6) — Red Rider's, Wheel in
  // Motion's, FloWithZo's and the owner's. Same two obligations as the third
  // render's, and one new thing inside the window: his is the first that is not
  // only a different *donor*, it carries a layer that is not the owner's
  // material at all. That layer is what the last two tests in this file are
  // about; this one is still the structural claim — identical to all four
  // outside 0.760-1.560 s, different from all four inside it.
  //
  // Measured on the shipped file (2026-09-10): 35,262 samples differ from Red
  // Rider's, 35,272 from Wheel in Motion's, 35,268 from FloWithZo's and 35,265
  // from the owner's, every one of them inside 0.760-1.560 s. The donor at
  // 2.400 s was chosen for exactly the property asserted at the end of this
  // test: its rebuilt window peaks at 19,748 against the owner's 26,730, which
  // is the 2.6 dB of headroom a bark needed.
  const against = (other: Int16Array, name: string): { first: number; last: number } => {
    let first = -1;
    let last = -1;
    let changed = 0;
    for (let i = 0; i < other.length; i += 1) {
      if (other[i] !== sealOnAWheel[i]) {
        if (first === -1) first = i;
        last = i;
        changed += 1;
      }
    }
    assert.ok(changed > 30_000, `only ${changed} samples differ from ${name}'s — this is that file again`);
    assert.ok(
      first / RATE >= 0.75,
      `he differs from ${name}'s from ${(first / RATE).toFixed(3)} s, before the voice`,
    );
    assert.ok(
      last / RATE <= 1.57,
      `he differs from ${name}'s to ${(last / RATE).toFixed(3)} s, after the voice`,
    );
    return { first, last };
  };

  against(redRider, 'Red Rider');
  against(wheelInMotion, 'Wheel in Motion');
  against(floWithZo, 'FloWithZo');
  const { first, last } = against(coolRider, 'the owner');

  // And the owner's loudest sample is at 0.347 s, outside the window and copied
  // across verbatim — so the rebuilt window, bark and all, may not out-peak it.
  let windowPeak = 0;
  for (let i = first; i <= last; i += 1) windowPeak = Math.max(windowPeak, Math.abs(sealOnAWheel[i]));
  let ownerPeak = 0;
  for (let i = 0; i < coolRider.length; i += 1) ownerPeak = Math.max(ownerPeak, Math.abs(coolRider[i]));
  assert.ok(windowPeak <= ownerPeak, 'the rebuilt window peaks above the loudest sample of the owner\'s recording');
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
  // Adonisb2's is a whole-file comparison and that is legitimate here, unlike
  // Red Rider's: his crash shares no samples with the owner's, so there is no
  // copied-across peak to make the test pass on its own.
  assert.ok(peakBetween(adonisb2) <= peakBetween(coolRider), 'his crash peaks above the owner\'s');
  // Hers is a whole-file comparison for the same reason as his: she shares no
  // samples with the owner's recording, so there is no copied-across peak that
  // could make this pass on its own. Worth having twice over here, because her
  // source *clips* — the drop hits full scale for five samples at 4.139 s of
  // her recording — and the only thing standing between that and a crash
  // louder than every other rider's is the RMS match.
  assert.ok(peakBetween(maribel) <= peakBetween(coolRider), 'her crash peaks above the owner\'s');
  // The Drunkard's is a whole-file comparison on Trollina's terms: composed,
  // sharing no samples with the owner's, and peak-capped by its tool where
  // Cool Rider's peaks. Measured: −7.0 dBFS against his −1.8.
  assert.ok(peakBetween(drunkard) <= peakBetween(coolRider), 'the Drunkard\'s crash peaks above the owner\'s');
  // FloWithZo's is window-scoped for Red Rider's exact reason, and it is worth
  // repeating rather than folding into a loop: his file copies the owner's peak
  // at 0.347 s across verbatim, so a whole-file comparison would be the same
  // sample on both sides and could never fail whatever the tool did to the
  // 0.8 s it actually rewrote. Measured: 25,143 in the window against the
  // owner's 26,730 overall.
  let floFirst = floWithZo.length;
  let floLast = 0;
  for (let i = 0; i < coolRider.length; i += 1) {
    if (coolRider[i] !== floWithZo[i]) { floFirst = Math.min(floFirst, i); floLast = Math.max(floLast, i); }
  }
  assert.ok(floFirst < floLast, 'nothing changed in his render, so there is no window to measure');
  assert.ok(
    peakBetween(floWithZo, floFirst, floLast + 1) <= peakBetween(coolRider),
    'his rewritten window peaks above the loudest sample of the owner\'s recording',
  );
  // And Seal on a Wheel's is window-scoped for the same reason again, with one
  // difference worth having the clause for: his window has something *added* to
  // it that the other three do not, so this is the one place a bark loud enough
  // to out-peak the owner's own recording would show. Measured: 19,889 in the
  // window against the owner's 26,730 overall — the bark at −8 dBFS lifts the
  // base's 19,747 by 142 counts and is still 2.6 dB under the owner's peak.
  let sealFirst = sealOnAWheel.length;
  let sealLast = 0;
  for (let i = 0; i < coolRider.length; i += 1) {
    if (coolRider[i] !== sealOnAWheel[i]) { sealFirst = Math.min(sealFirst, i); sealLast = Math.max(sealLast, i); }
  }
  assert.ok(sealFirst < sealLast, 'nothing changed in his render, so there is no window to measure');
  assert.ok(
    peakBetween(sealOnAWheel, sealFirst, sealLast + 1) <= peakBetween(coolRider),
    'his rewritten window peaks above the loudest sample of the owner\'s recording',
  );
});

test('Adonisb2\'s crash hits inside the first second', () => {
  // **The property his cut can silently lose.** The crash one-shot fires at the
  // moment the rider comes off, and his contributed recording carries 2.2 s of
  // riding before the fall — so a cut taken a little too early is 3.4 s of
  // correct length, correct loudness, and a player watching a wipeout in near
  // silence until the impact arrives after they have stopped sliding.
  //
  // Measured as an onset rather than as a maximum, and his recording is why:
  // **his fall has two impacts and the second is the bigger one.** Asking
  // where the file is loudest would point at 1.95 s and prove nothing. What
  // makes a sound an impact is the rise into it, so this asks for the rise —
  // independently of the tool, on the file as shipped.
  const rms = (from: number, to: number): number => {
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += (adonisb2[i] / 32768) ** 2;
    return Math.sqrt(sum / Math.max(1, to - from));
  };
  const after = Math.round(0.050 * RATE);
  const before = Math.round(0.100 * RATE);
  let best = { at: 0, rise: -Infinity };
  for (let at = after; at <= RATE; at += Math.round(0.010 * RATE)) {
    const rise = 20 * Math.log10(rms(at, at + after) / (rms(Math.max(0, at - before), at) + 1e-18));
    if (rise > best.rise) best = { at, rise };
  }
  assert.ok(
    best.rise >= 10,
    `nothing hits in his first second — the sharpest onset rises ${best.rise.toFixed(1)} dB `
    + `at ${(best.at / RATE).toFixed(3)} s, and a crash makes more than that`,
  );
});

test('none of the four voice-scrubbed renders carries the owner\'s voice band', () => {
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

  const source = midBand(coolRider);
  // The same measurement over every render — M28's sibling file, M34's third
  // and M35's fourth are the same treatment from other donors, and each has to
  // clear this bar on its own rather than inherit Red Rider's result. **That is
  // doubly true from the third on**, whose donors overlap the others': sharing
  // material with a file that passed is not evidence of anything, and this is
  // the measurement that says whether the words are gone. Measured on the
  // shipped files: 0.109, 0.202, 0.166, 0.160.
  //
  // The fourth's number is the interesting one. Its window carries a seal bark
  // that the other three do not, and the bark's energy sits inside this very
  // band — so a reader might expect it to push the correlation up. It does the
  // opposite: uncorrelated material added to both sides of a ratio lands in the
  // denominator alone, so the bark moves this *down* (0.103 with no bark at
  // all, 0.160 at the shipped level). Which is worth knowing precisely because
  // it means this test cannot be the one that notices a bark going missing —
  // the two at the bottom of this file are.
  for (const [name, file] of [
    ['Red Rider', redRider], ['Wheel in Motion', wheelInMotion], ['FloWithZo', floWithZo],
    ['Seal on a Wheel', sealOnAWheel],
  ] as const) {
    let first = file.length;
    let last = 0;
    for (let i = 0; i < coolRider.length; i += 1) {
      if (coolRider[i] !== file[i]) { first = Math.min(first, i); last = Math.max(last, i); }
    }
    // Inside the crossfades both signals are partly the same audio by design,
    // so the measurement is taken over the core, 60 ms clear of each seam.
    const margin = Math.round(0.06 * RATE);
    const from = first + margin;
    const to = last - margin;
    assert.ok(to > from, `${name}'s changed window is too short to measure`);

    const his = midBand(file);
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
      `the speech band of ${name}'s crash still correlates ${correlation.toFixed(3)} with the owner's`,
    );
  }
});

test('her crash carries her voice, and then her wheel beeping on the floor', () => {
  // **The two properties her file can lose silently**, and neither is visible
  // to any other test here.
  //
  // The first is that it is *her*: her recording carries 2.2 s of riding, a
  // lift, and a dropped wheel before she ever makes a sound, so a cut taken a
  // few hundred milliseconds wrong is the correct length, the correct
  // loudness, an impact in the right place — and no rider in it.
  //
  // The second is the owner's own note on the cut he chose: her voice stops
  // ringing at 2.78 s and the slot runs to 3.400, so her own power-off beep
  // fills the gap, "right when it goes silent (not before)", because a real
  // EUC lying on its side goes on beeping. That beep is 2696 Hz, so it is
  // findable by band rather than by level — and *when* it starts is the part
  // that was specified, so that is what this measures.
  const RATE_ = RATE;
  const band = (from: number, to: number, low: number, high: number): number => {
    // One-pole pair, and deliberately crude: every window goes through the
    // identical filter and only their ratio is read.
    const dt = 1 / RATE_;
    const highA = (1 / (2 * Math.PI * low)) / ((1 / (2 * Math.PI * low)) + dt);
    const lowA = dt / ((1 / (2 * Math.PI * high)) + dt);
    let hi = 0;
    let lo = 0;
    let sum = 0;
    // Run from the start so the filter state is settled by the window.
    for (let i = 1; i < to; i += 1) {
      hi = highA * (hi + maribel[i] / 32768 - maribel[i - 1] / 32768);
      lo += lowA * (hi - lo);
      if (i >= from) sum += lo * lo;
    }
    return Math.sqrt(sum / Math.max(1, to - from));
  };
  const at = (seconds: number): number => Math.round(seconds * RATE_);

  // Her voice: the speech band over 1.97-2.69 s must stand clear of the same
  // band in the second before it, which is the wheel rattling on the floor.
  const voice = band(at(1.97), at(2.69), 250, 4000);
  const beforeVoice = band(at(0.90), at(1.60), 250, 4000);
  assert.ok(
    20 * Math.log10(voice / (beforeVoice + 1e-18)) > 6,
    'nothing in her crash between 1.97 s and 2.69 s sounds like a voice — the cut has her '
    + 'wheel in it and none of her',
  );

  // Her beep: a narrow band on 2696 Hz, present after 2.78 s and absent in the
  // 200 ms before it. The second half of that is the owner's "not before".
  const afterSilence = band(at(2.79), at(2.95), 2400, 3000);
  const duringVoice = band(at(2.58), at(2.77), 2400, 3000);
  assert.ok(
    20 * Math.log10(afterSilence / (duringVoice + 1e-18)) > 12,
    'her wheel is not beeping in the tail of her crash',
  );
  assert.ok(
    20 * Math.log10(duringVoice / (afterSilence + 1e-18)) < -12,
    'the beep has crept forward into her yell — the owner asked for it when the crash goes '
    + 'silent and not before',
  );
});

/**
 * The loudest 200 ms between 800 Hz and 1.3 kHz.
 *
 * Two one-poles each way: a broad, sloppy band. Sloppy is fine and cheap,
 * because every file goes through the identical filter and only the ratio
 * between them is read. A crash is a transient, so its loudness in a band is
 * its loudest 200 ms and not its average anywhere.
 *
 * **At module scope rather than inside the test it was written for**, since
 * M35: Seal on a Wheel's crash has a seal bark in it whose dominant
 * third-octave is 800 Hz — the middle of this band — so the file has to be held
 * to the same ceiling Maribel's is, measured by the same arithmetic. Two copies
 * of a filter are two filters. `from`/`to` bound which windows are *read*; the
 * filter always runs from the first sample, so its state is settled wherever
 * the reading starts.
 */
const voiceBandPeak = (samples: Int16Array, from = 0, to = samples.length): number => {
  const dt = 1 / RATE;
  const highA = (1 / (2 * Math.PI * 800)) / ((1 / (2 * Math.PI * 800)) + dt);
  const lowA = dt / ((1 / (2 * Math.PI * 1300)) + dt);
  const out = new Float64Array(samples.length);
  let h1 = 0;
  let h2 = 0;
  let l1 = 0;
  let l2 = 0;
  let prev = 0;
  for (let i = 1; i < samples.length; i += 1) {
    h1 = highA * (h1 + samples[i] / 32768 - samples[i - 1] / 32768);
    h2 = highA * (h2 + h1 - prev);
    prev = h1;
    l1 += lowA * (h2 - l1);
    l2 += lowA * (l1 - l2);
    out[i] = l2;
  }
  const window = Math.round(0.200 * RATE);
  const hop = Math.round(0.050 * RATE);
  let worst = -Infinity;
  for (let at = from; at + window <= Math.min(to, out.length); at += hop) {
    let sum = 0;
    for (let k = 0; k < window; k += 1) sum += out[at + k] ** 2;
    worst = Math.max(worst, 20 * Math.log10(Math.sqrt(sum / window) + 1e-18));
  }
  return worst;
};

test('her voice does not own the band the ride bed leaves empty', () => {
  // **The owner played the shipped cut and said it was "a bit too loud... like
  // a studio recording kinda, instead of as something that just happened"** —
  // and the three level rules already in this file all passed it. RMS matched
  // Cool Rider's to 0.01 dB. BS.1770 integrated loudness was 0.18 LU away. The
  // peak-sample rule had it 1.25 dB *quieter*. Every one of them was answering
  // a different question from the one his ear asked.
  //
  // Loudness in a mix is not a total, it is what happens in the band being
  // listened to. Her recording is a shout close-miked in a lift, so its energy
  // is packed into 300 Hz-1.3 kHz rather than spread over ten octaves like a
  // crash recorded outdoors — 7 to 17 dB darker than the others above 1.6 kHz
  // and several dB louder in the middle. And the game's ride bed is rumble,
  // tyre tick and wind, so that band is exactly where nothing else is playing.
  //
  // **This is deliberately an assertion about her file and not a rule for all
  // of them.** Measured across the four that shipped before her, each exceeds
  // the ceiling of the other three by up to 11 dB somewhere — Trollina at
  // 126 Hz, Adonisb2 at 2540 Hz — in files the owner has accepted. A rule the
  // accepted set fails is a wrong rule. What is specific to hers is *where*,
  // and the fix was to set her voice 5 dB under the rest of her own take so
  // the impact leads the file the way it does in every other rider's.
  const ceiling = Math.max(
    voiceBandPeak(coolRider),
    voiceBandPeak(trollina),
    voiceBandPeak(redRider),
    voiceBandPeak(adonisb2),
  );
  const hers = voiceBandPeak(maribel);
  // The build the owner rejected measured +1.8 dB over this ceiling; the one
  // that replaced it measures 3.2 dB under. Zero is the line, and there is
  // real margin on the right side of it.
  assert.ok(
    hers <= ceiling,
    `her crash reaches ${hers.toFixed(2)} dB between 800 Hz and 1.3 kHz, over the `
    + `${ceiling.toFixed(2)} dB that is the loudest any accepted crash reaches there. In a mix `
    + 'whose bed is rumble, tyre tick and wind, that band is unmasked — she will sound louder '
    + 'than every other rider however well the averages match',
  );
});

// ---------------------------------------------------------------------------
// Seal on a Wheel — M35 §35.6: the bark is in it, it is not too loud, and the
// file carries nothing the download brought with it
// ---------------------------------------------------------------------------

test('his crash has the seal in it, it is not too loud in that band, and the file is audio only', () => {
  // **Three things no crash before his could fail**, because no crash before
  // his had a third party's recording in it.
  //
  // *The chunk grammar.* The seal download is 468,852 bytes of which 36,852 are
  // `LIST`/`bext`/`iXML`/`_PMX` metadata — Adobe Premiere residue from an
  // unrelated video, naming two real people in plain text. `tokenHits()` over
  // those bytes returns nothing, because the names are not on the private-token
  // list, so **the export guard would not refuse them**: this is the same shape
  // as the hole Codex found in the PNG pipeline on 2026-09-01, which produced
  // `render/pngStrict.ts` ("a substring scan cannot see compressed text and a
  // chunk walk that stops at IEND cannot see a trailer"). The pipeline already
  // does the right thing — every tool writes a bare 44-byte header, so
  // re-rendering strips the metadata by construction — and this is the
  // assertion that says a `cp` of a download never quietly replaces a render.
  // Folded in here as one assertion rather than made a module: a WAV whose
  // chunks are `fmt ` and `data` and nothing else is a one-line grammar.
  const chunksOf = (name: string): readonly string[] => {
    const buffer = readFileSync(join(AUDIO, name));
    const chunks: string[] = [];
    let offset = 12;
    while (offset + 8 <= buffer.length) {
      chunks.push(buffer.toString('ascii', offset, offset + 4));
      offset += 8 + buffer.readUInt32LE(offset + 4) + (buffer.readUInt32LE(offset + 4) % 2);
    }
    return chunks;
  };
  assert.deepEqual(
    chunksOf('crash_seal_on_a_wheel.wav'),
    ['fmt ', 'data'],
    'his crash carries a chunk that is not audio — a download reached the shipped file',
  );

  // *The bark is there.* A level flag is one character from silence, and a
  // missing bark is the one failure every other test in this file passes
  // happily: the length rule, the pairwise rule, the window rule and the
  // voice-band rule are all satisfied by the base render, which is this file
  // with no seal in it whatsoever.
  //
  // **What it is measured against is the other three renders**, not the 200 ms
  // before it. That was tried first and cannot tell the two states apart: the
  // crash's own mid band rises through the bark's span anyway, so a barkless
  // file reads +5.7 dB over the 200 ms before it and the shipped one +7.8.
  // Red Rider's, Wheel in Motion's and FloWithZo's files *are* this crash
  // rebuilt in this window with no bark in it, and the owner's is the same
  // 0.8 s with his voice still in it — so the loudest of the four is the honest
  // floor. Measured over 500-1200 Hz across 0.930-1.000 s, the bark's burst:
  // Wheel in Motion −35.54, FloWithZo −39.00, Red Rider −40.34, the owner
  // −40.68, and his file **−22.55, 13.0 dB clear of the loudest of them** (it read
  // −28.15 at the first cut's −14 dBFS; the owner asked for 6 dB more). The
  // base with no bark reads −37.30, which is 1.8 dB *under* the floor and fails.
  const bandDb = (samples: Int16Array, from: number, to: number, low: number, high: number): number => {
    const dt = 1 / RATE;
    const highA = (1 / (2 * Math.PI * low)) / ((1 / (2 * Math.PI * low)) + dt);
    const lowA = dt / ((1 / (2 * Math.PI * high)) + dt);
    let hi = 0;
    let lo = 0;
    let sum = 0;
    // From the start, so the filter state is settled by the time the window opens.
    for (let i = 1; i < to; i += 1) {
      hi = highA * (hi + samples[i] / 32768 - samples[i - 1] / 32768);
      lo += lowA * (hi - lo);
      if (i >= from) sum += lo * lo;
    }
    return 20 * Math.log10(Math.sqrt(sum / Math.max(1, to - from)) + 1e-18);
  };
  const burstFrom = Math.round(0.930 * RATE);
  const burstTo = Math.round(1.000 * RATE);
  const burst = (file: Int16Array): number => bandDb(file, burstFrom, burstTo, 500, 1200);
  const barkless = Math.max(burst(redRider), burst(wheelInMotion), burst(floWithZo), burst(coolRider));
  const his = burst(sealOnAWheel);
  assert.ok(
    his - barkless >= 2,
    `his crash reads ${his.toFixed(2)} dB between 500 Hz and 1.2 kHz where the bark should be, `
    + `against the ${barkless.toFixed(2)} dB of the loudest render with no bark in it — there is `
    + 'no seal in this file, which is the whole reason it is a separate file at all',
  );

  // *And it is not too loud in the band the ride bed leaves empty.* The test
  // above this one exists because the owner's ear rejected a crash that every
  // level rule passed, and the band it rejected it in — 800 Hz to 1.3 kHz — is
  // exactly where a seal bark's energy sits. So his file is held to the same
  // ceiling hers is, by the same function.
  //
  // Two readings, and the difference between them is worth stating. The
  // whole-file one comes out *equal* to the ceiling to the hundredth (−27.95),
  // because the loudest 200 ms of this band in the owner's recording is at
  // 0.25 s, outside the rebuilt window, and all four renders copy it verbatim —
  // so that comparison is not slack, it is a threshold that only a bark loud
  // enough to out-read the impact could cross. The legible margin is the second
  // reading, over the bark's own 270 ms: **−30.33 dB, 2.4 dB under the ceiling**
  // at the shipped −8 dBFS (the first cut at −14 read −33.93, about a decibel under
  // the loudest thing the owner's own voice did in that band; the bark now sits
  // a little above that voice, which is the point of the raise).
  const ceiling = Math.max(
    voiceBandPeak(coolRider),
    voiceBandPeak(trollina),
    voiceBandPeak(redRider),
    voiceBandPeak(adonisb2),
  );
  const whole = voiceBandPeak(sealOnAWheel);
  assert.ok(
    whole <= ceiling,
    `his crash reaches ${whole.toFixed(2)} dB between 800 Hz and 1.3 kHz, over the `
    + `${ceiling.toFixed(2)} dB that is the loudest any accepted crash reaches there`,
  );
  const barkStretch = voiceBandPeak(sealOnAWheel, Math.round(0.900 * RATE), Math.round(1.170 * RATE));
  assert.ok(
    barkStretch <= ceiling,
    `the bark itself reaches ${barkStretch.toFixed(2)} dB in that band, over the `
    + `${ceiling.toFixed(2)} dB ceiling — in a mix whose bed is rumble, tyre tick and wind it `
    + 'will read as a sound effect stuck on top of his crash rather than as part of it',
  );
});

test('the nine voices reach nine different buffers', () => {
  // §19.8's headless evidence, grown by one in §22.8, again in §29.12 and
  // again in §34.10. `crashFor` carried a fallback while Red Rider's file was
  // being built, and the failure it could hide — a voice quietly resolving to
  // somebody else's — is invisible to `lastCrashVoice`, which reports the
  // *choice* rather than the buffer. The Drunkard rode on `'red-rider'` by a
  // declared interim in the data for three phases, FloWithZo for three more,
  // Seal on a Wheel for three more again, and this is where the end of each is
  // visible. **His is the one where the wrong buffer is hardest to hear**: Red
  // Rider's file is this same crash from another donor, so the interim
  // surviving would play something that sounds nearly right and has no seal in
  // it at all.
  const bank = {
    tyreOffroad: 'tyre-offroad',
    tyreSolid: 'tyre-solid',
    windHowl: 'wind',
    crash: 'cool-rider-buffer',
    crashTrollina: 'trollina-buffer',
    crashRedRider: 'red-rider-buffer',
    crashAdonisb2: 'adonisb2-buffer',
    crashMaribel: 'maribel-buffer',
    crashWheelInMotion: 'wheel-in-motion-buffer',
    crashFloWithZo: 'flo-with-zo-buffer',
    crashSealOnAWheel: 'seal-on-a-wheel-buffer',
    crashDrunkard: 'drunkard-buffer',
    stumbleDrunkard: 'stumble-buffer',
    sirenFar: 'siren-far',
    sirenClose: 'siren-close',
  } as unknown as SampleBank;

  const voices: CrashVoiceId[] = [
    'cool-rider', 'trollina', 'red-rider', 'adonisb2', 'maribel', 'wheel-in-motion', 'drunkard',
    'flo-with-zo', 'seal-on-a-wheel',
  ];
  const reached = voices.map((voice) => crashFor(voice, bank));
  assert.deepEqual(
    reached,
    [
      'cool-rider-buffer', 'trollina-buffer', 'red-rider-buffer',
      'adonisb2-buffer', 'maribel-buffer', 'wheel-in-motion-buffer', 'drunkard-buffer',
      'flo-with-zo-buffer', 'seal-on-a-wheel-buffer',
    ],
  );
  assert.equal(new Set(reached).size, 9);
});

// ---------------------------------------------------------------------------
// The Drunkard — M29 §29.12: the Trollina provenance shape, and the stumble
// ---------------------------------------------------------------------------

/** Normalised cross-correlation of two files at lag zero, over the shorter. */
const correlation = (a: Int16Array, b: Int16Array): number => {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return dot / (Math.sqrt(aa * bb) + 1e-18);
};

const rmsDb = (samples: Int16Array): number => {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += (samples[i] / 32768) ** 2;
  return 20 * Math.log10(Math.sqrt(sum / samples.length) + 1e-18);
};

test('the Drunkard\'s crash is a composition, not a slice of any shipped recording', () => {
  // **The Trollina provenance shape, asserted on the bytes.** His file is
  // generated-plus-synthesized and stands outside the CC BY 4.0 claim; the
  // failure this catches is the opposite build — somebody shipping a
  // re-levelled copy of a real rider's recording under his name, which would
  // pass the length rule, the loudness rule and the seven-buffers rule while
  // putting a real person's fall (or the owner's voice) in a parody's mouth.
  // A copy, or a copy with a different gain, correlates near 1 at lag zero;
  // two unrelated 3.4 s files correlate near 0. The tool printed |r| ≤ 0.025
  // against every shipped crash when the file was authored (2026-09-02:
  // −0.014, 0.004, −0.017, −0.006, 0.019, −0.016), and 0.05 is twice the
  // worst of those with room for a re-render to move it.
  const others: readonly (readonly [string, Int16Array])[] = [
    ['Cool Rider', coolRider], ['Trollina', trollina], ['Red Rider', redRider],
    ['Adonisb2', adonisb2], ['Maribel', maribel], ['Wheel in Motion', wheelInMotion],
    // The eighth crash shipped after this test was written, so it is measured
    // here rather than assumed to inherit its siblings' result (M34). It is a
    // render of the owner's recording, so it carries the same near-zero
    // correlation with a composed file the other renders do: −0.017.
    ['FloWithZo', floWithZo],
    // And the ninth, which is a render of the owner's recording *plus* a CC0
    // seal bark — a third source in the comparison and still nothing to do with
    // a composed cartoon wipeout: −0.013 (M35).
    ['Seal on a Wheel', sealOnAWheel],
  ];
  for (const [name, file] of others) {
    const r = correlation(drunkard, file);
    assert.ok(
      Math.abs(r) < 0.05,
      `the Drunkard's crash correlates ${r.toFixed(4)} with ${name}'s — it is a slice of it`,
    );
  }
});

test('the Drunkard\'s crash is as loud as Cool Rider\'s, and no louder at the peak', () => {
  // Trollina's rule, stated for him: RMS-matched so swapping rider cannot
  // change how loud a crash is, and peak-capped where Cool Rider's peaks
  // rather than peak-matched (peak-matched, hers played 4.3 dB louder). The
  // tool reads both numbers off `crash_wipeout.wav` rather than typing them,
  // so the bound here is ±1 dB against the same file — a replaced file that
  // was normalised by hand to full scale fails by 20 dB. Measured: −22.33
  // against −22.33 dBFS.
  assert.ok(
    Math.abs(rmsDb(drunkard) - rmsDb(coolRider)) <= 1,
    `his crash is ${rmsDb(drunkard).toFixed(2)} dBFS RMS against Cool Rider's ${rmsDb(coolRider).toFixed(2)}`,
  );
  assert.ok(peakBetween(drunkard) <= peakBetween(coolRider), 'his crash peaks above the owner\'s');
});

test('the stumble is 0.40 s at −6 dBFS, and its cans are not cut out of the crash', () => {
  // The `stumble` cue's recording (q112). Its length is the one number the
  // sink's teardown timing and `AUDIO.stumbleLevel` were both set against —
  // a stumble that ran a second would ring into the next weave — and its
  // level is peak-normalised to −6 dBFS because no shipped one-shot is its
  // sibling to match. Half a dB either side is a re-render moving nothing;
  // a hand-replaced file at full scale fails.
  assert.equal(stumble.length, 17_640, 'the stumble is not 0.40 s at 44.1 kHz');
  const peakDb = 20 * Math.log10(peakBetween(stumble) / 32768);
  assert.ok(peakDb >= -6.5 && peakDb <= -5.5, `the stumble peaks at ${peakDb.toFixed(2)} dBFS, not −6`);

  // And it is its own render, not a window of the crash. The hic *is* the
  // same beat of the same take by design (the manifest says so — measured, the
  // whole file correlates 0.84 with the crash's hic at 2.86 s), so the claim
  // is made on the cans: the first 0.10 s — both clanks, before the hic
  // enters — equals no 4,410-sample window of the crash sample for sample.
  // The crash's own can pair sits at 1.30 s under the OOF at a different
  // level, and its best correlation with this window is 0.17; a cut-out
  // window would be 1.0 and exactly equal.
  const window = 4_410;
  const cans = stumble.subarray(0, window);
  let equalWindows = 0;
  for (let lag = 0; lag + window <= drunkard.length; lag += 1) {
    let k = 0;
    while (k < window && drunkard[lag + k] === cans[k]) k += 1;
    if (k === window) equalWindows += 1;
  }
  assert.equal(equalWindows, 0, 'the stumble\'s cans are a window cut straight out of the crash');
});
