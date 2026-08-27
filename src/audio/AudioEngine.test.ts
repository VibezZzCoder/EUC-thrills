/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AudioEngine, parseLatencyHint } from './AudioEngine.ts';

/**
 * The engine's headless surface — M25 polish.
 *
 * The engine itself only comes alive in a browser (a context needs a gesture),
 * so what is provable here is the boundary: what the `?audiolatency=`
 * parameter is allowed to mean, and that an unarmed engine tells the truth
 * about latencies it cannot know yet. The wiring — that the hint actually
 * changes the buffer the browser grants — is a browser fact, asserted in
 * `tests/m8.spec.ts` where a real context exists.
 */

test('parseLatencyHint accepts the API vocabulary and honest numbers, nothing else', () => {
  assert.equal(parseLatencyHint('interactive'), 'interactive');
  assert.equal(parseLatencyHint('balanced'), 'balanced');
  assert.equal(parseLatencyHint('playback'), 'playback');
  assert.equal(parseLatencyHint('0.08'), 0.08, 'seconds pass through');
  assert.equal(parseLatencyHint('2'), 0.5, 'clamped: beyond half a second is a typo');

  // Everything below means "say nothing to the constructor" — which is what a
  // player who never heard of the parameter must get.
  assert.equal(parseLatencyHint(null), null);
  assert.equal(parseLatencyHint(''), null);
  assert.equal(parseLatencyHint('Playback'), null, 'the API vocabulary is case-sensitive');
  assert.equal(parseLatencyHint('fast'), null);
  assert.equal(parseLatencyHint('0'), null, 'zero is not a latency request');
  assert.equal(parseLatencyHint('-1'), null);
  assert.equal(parseLatencyHint('NaN'), null);
});

test('an unarmed engine reports null latencies rather than inventing them', () => {
  const engine = new AudioEngine(null);
  const snap = engine.snapshot();
  assert.equal(snap.armed, false);
  assert.equal(snap.baseLatency, null);
  assert.equal(snap.outputLatency, null);
  // And the setter before any context is a stored intent, not a throw.
  engine.setLatencyHint('playback');
  engine.dispose();
});

test('setSamplesDisabled is reported, and refuses the fetch it may have raced', () => {
  const engine = new AudioEngine(null);
  assert.equal(engine.snapshot().samplesDisabled, false);
  engine.setSamplesDisabled();
  assert.equal(engine.snapshot().samplesDisabled, true);
  // Calling the URL setter afterwards must be a no-op rather than a throw —
  // boot order puts the fetch before the query parse on some paths.
  engine.setSampleUrls({
    tyreOffroad: '', tyreSolid: '', windHowl: '', crash: '', crashTrollina: '',
    crashRedRider: '', crashAdonisb2: '', crashMaribel: '', sirenFar: '',
    sirenClose: '', overspeedBeep: '',
  });
  assert.equal(engine.snapshot().samplesLoaded, false);
  engine.dispose();
});
