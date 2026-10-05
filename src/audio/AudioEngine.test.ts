/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AudioEngine, parseLatencyHint } from './AudioEngine.ts';
import { ENVIRONMENT_AMBIENCE } from '../data/tuning.ts';
import type { EnvironmentAmbienceEmitter } from './environmentAmbience.ts';

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
    crashRedRider: '', crashAdonisb2: '', crashMaribel: '', crashWheelInMotion: '',
    crashFloWithZo: '', crashSealOnAWheel: '', crashDrunkard: '', stumbleDrunkard: '',
    sirenFar: '', sirenClose: '', overspeedBeep: '',
  });
  assert.equal(engine.snapshot().samplesLoaded, false);
  engine.dispose();
});

const AMBIENCE_EMITTERS: readonly EnvironmentAmbienceEmitter[] = [
  { id: 'cafe', kind: 'cafe', x: 0, y: 0, z: 0 },
  { id: 'bay', kind: 'industrial', x: 0, y: 0, z: 0 },
];

test('ambience defaults to silence, uses the frozen bounds and reports no invented unarmed resources', () => {
  assert.equal(ENVIRONMENT_AMBIENCE.maximumEmitters, 28, 'twelve premises plus sixteen outdoor sources, on the same fixed graph');
  assert.equal(ENVIRONMENT_AMBIENCE.maximumTotalGain, 0.025);
  assert.equal(Object.keys(ENVIRONMENT_AMBIENCE.voices).length, 5);
  assert.ok(Object.isFrozen(ENVIRONMENT_AMBIENCE.voices.cafe));
  const engine = new AudioEngine(null);
  engine.update(1);
  assert.equal(engine.snapshot().ambience.totalGain, 0);
  engine.replaceAmbienceWorld('world', AMBIENCE_EMITTERS);
  engine.update(1);
  assert.equal(engine.snapshot().ambience.totalGain, 0, 'a world alone must not open the listener');
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(1);
  const snapshot = engine.snapshot().ambience;
  assert.ok(snapshot.totalGain > 0 && snapshot.totalGain <= ENVIRONMENT_AMBIENCE.maximumTotalGain);
  assert.equal(snapshot.worldId, 'world');
  assert.equal(snapshot.listenerSeat, 0);
  assert.equal(snapshot.emitterCount, 2);
  assert.equal(snapshot.activeEmitters, 2);
  assert.equal(snapshot.permanentNodes, 0);
  assert.equal(snapshot.permanentSources, 0);
  assert.equal(snapshot.bufferBytes, 0);
  engine.update(1);
  assert.ok(engine.snapshot().ambience.totalGain > snapshot.totalGain, 'snapshot may not alias the live frame');
  engine.dispose();
});

test('ambience is silent at idle dt zero, hidden/reset/world replacement, and only the refreshed listener resumes it', () => {
  const engine = new AudioEngine(null);
  engine.replaceAmbienceWorld('world', AMBIENCE_EMITTERS);
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(1);
  engine.input.idle = true;
  engine.update(0);
  assert.equal(engine.snapshot().ambience.totalGain, 0);
  engine.input.idle = false;
  engine.update(0.1);
  assert.ok(engine.snapshot().ambience.totalGain > 0);
  engine.setSuspended(true);
  assert.equal(engine.snapshot().ambience.totalGain, 0);
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(1);
  assert.equal(engine.snapshot().ambience.totalGain, 0, 'hidden gate wins over requested running');
  engine.setSuspended(false);
  engine.update(0.1);
  assert.ok(engine.snapshot().ambience.totalGain > 0);
  engine.resetRider(1);
  assert.ok(engine.snapshot().ambience.totalGain > 0, 'a guest reset does not move seat 0');
  engine.resetRider(0);
  assert.equal(engine.snapshot().ambience.totalGain, 0);
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(0.1);
  engine.reset();
  engine.update(1);
  assert.equal(engine.snapshot().ambience.totalGain, 0, 'reset needs a refreshed listener');
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(0.1);
  assert.ok(engine.snapshot().ambience.totalGain > 0);
  engine.replaceAmbienceWorld('world', [{ id: 'away', kind: 'home', x: 100, y: 0, z: 0 }]);
  assert.equal(engine.snapshot().ambience.totalGain, 0, 'reinstalling the same id clears old tails');
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(1);
  assert.equal(engine.snapshot().ambience.totalGain, 0);
  assert.throws(() => engine.replaceAmbienceWorld('bad', Array.from({ length: ENVIRONMENT_AMBIENCE.maximumEmitters + 1 }, (_, i) => ({
    id: `bad-${i}`, kind: 'cafe', x: 0, y: 0, z: 0,
  }))), RangeError);
  assert.equal(engine.snapshot().ambience.worldId, 'world');
  engine.clearAmbienceWorld();
  assert.equal(engine.snapshot().ambience.worldId, null);
  assert.equal(engine.snapshot().ambience.emitterCount, 0);
  engine.dispose();
});

test('actual warnings and the existing siren envelope duck ambience without reviving the silent ladder', () => {
  const engine = new AudioEngine(null);
  engine.replaceAmbienceWorld('world', AMBIENCE_EMITTERS);
  engine.setAmbienceListener(0, 0, 0, true);
  engine.update(2);
  engine.input.powerStage = 'tiltBack';
  engine.update(1);
  assert.equal(engine.snapshot().played.beep, 0);
  assert.equal(engine.snapshot().ambience.duckGain, 1, 'a silenced ladder is not an ambience warning');
  engine.input.overspeed = 0.6;
  engine.update(0.1);
  assert.ok(engine.snapshot().played.overspeed > 0);
  assert.ok(engine.snapshot().ambience.duckGain < 0.4, 'the emitted warning earns fast priority');
  engine.input.overspeed = 0;
  engine.input.powerStage = 'normal';
  engine.update(5);
  assert.ok(engine.snapshot().ambience.duckGain > 0.999);
  engine.input.copRangeMetres = 8;
  engine.update(5);
  assert.ok(engine.snapshot().sirenGain > 0);
  assert.ok(Math.abs(engine.snapshot().ambience.duckGain - ENVIRONMENT_AMBIENCE.sirenFloor) < 1e-3);
  engine.dispose();
});

test('the ambience seam does not alter any existing ride/cue output and shares the bounded update clock', () => {
  const ordinary = new AudioEngine(null);
  const environment = new AudioEngine(null);
  const batched = new AudioEngine(null);
  for (const engine of [environment, batched]) {
    engine.replaceAmbienceWorld('world', AMBIENCE_EMITTERS);
    engine.setAmbienceListener(0, 0, 0, true);
  }
  for (let i = 0; i < 240; i += 1) {
    for (const engine of [ordinary, environment]) {
      engine.input.speed = i / 12;
      engine.input.throttle = 0.5;
      engine.input.overspeed = i > 150 ? 0.7 : 0;
      engine.input.copRangeMetres = i > 100 ? 25 : Number.POSITIVE_INFINITY;
      if (i === 80) engine.hop(0.5);
      if (i === 120) engine.landing(0.4, 'gravel');
      engine.update(1 / 60);
    }
    assert.deepEqual(environment.director.frame, ordinary.director.frame);
    assert.deepEqual(environment.snapshot().played, ordinary.snapshot().played);
  }
  environment.reset();
  environment.input.overspeed = 0;
  environment.input.copRangeMetres = Number.POSITIVE_INFINITY;
  environment.setAmbienceListener(0, 0, 0, true);
  for (let i = 0; i < 120; i += 1) environment.update(1 / 60);
  batched.update(2);
  const a = environment.snapshot().ambience;
  const b = batched.snapshot().ambience;
  for (const field of ['cafeGain', 'industrialGain', 'totalGain', 'duckGain'] as const) {
    assert.ok(Math.abs(a[field] - b[field]) < 1e-12, `${field} depends on frame batching`);
  }
  assert.equal(a.activeEmitters, b.activeEmitters);
  assert.equal(a.emitterCount, b.emitterCount);
  for (const engine of [ordinary, environment, batched]) engine.dispose();
});
