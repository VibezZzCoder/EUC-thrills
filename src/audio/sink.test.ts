/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { WebAudioSink, type SampleBank } from './sink.ts';
import type { TransientCue } from './director.ts';

/**
 * The sink's *choice* of what to play, asserted with no browser — M29 Phase 4.
 *
 * Everything the sink does is a call into Web Audio, and until this file
 * nothing headless exercised it: the graph was proved in `tests/m8.spec.ts`
 * where a real context exists. What the stumble cue adds is a decision the
 * browser specs can only witness through a counter — recording or stand-in,
 * and which buffer — and a decision is checkable against a fake. The fake
 * below is deliberately dumb: every node is a bag of parameters that accept
 * any write, every method is a no-op, and the only things it records are
 * *which* sources were created and what buffer each was handed. That is the
 * whole surface the tests below read.
 *
 * `outputLevel`, `spectrum` and the loops' timing are not covered here and
 * cannot be: they are the graph, and the graph is the browser's.
 */

/** An `AudioParam` that takes every write and remembers only its value. */
function fakeParam(initial: number): Record<string, unknown> {
  return {
    value: initial,
    setValueAtTime(): void {},
    linearRampToValueAtTime(): void {},
    exponentialRampToValueAtTime(): void {},
    setTargetAtTime(): void {},
    cancelScheduledValues(): void {},
  };
}

const NODE_METHODS = new Set([
  'connect', 'disconnect', 'start', 'stop', 'getFloatTimeDomainData', 'getFloatFrequencyData',
]);

/**
 * A node whose unknown properties are parameters. `playbackRate` starts at 1
 * as the real one does, so a test can tell "never touched" from "set to 1".
 */
function fakeNode(kind: string): Record<string, unknown> {
  const own: Record<string, unknown> = { kind };
  return new Proxy(own, {
    get(target, key) {
      if (typeof key !== 'string') return undefined;
      if (key in target) return target[key];
      if (NODE_METHODS.has(key)) return () => undefined;
      const param = fakeParam(key === 'playbackRate' ? 1 : 0);
      target[key] = param;
      return param;
    },
    set(target, key, value) {
      if (typeof key === 'string') target[key] = value;
      return true;
    },
  });
}

interface FakeBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData(channel: number): Float32Array<ArrayBuffer>;
  copyToChannel(data: Float32Array, channel: number): void;
}

function fakeBuffer(channels: number, length: number, rate: number): FakeBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(new ArrayBuffer(length * 4)));
  return {
    numberOfChannels: channels,
    length,
    sampleRate: rate,
    duration: length / rate,
    getChannelData: (channel) => data[channel],
    copyToChannel: (source, channel) => data[channel].set(source),
  };
}

interface FakeContext {
  context: AudioContext;
  /** Every source node created, in order, so a test can see what was launched. */
  sources: Record<string, unknown>[];
}

function fakeContext(): FakeContext {
  const sources: Record<string, unknown>[] = [];
  // A low rate keeps the sink's two three-second noise buffers small; nothing
  // here reads a frequency, so the number is arbitrary.
  const context = {
    sampleRate: 8000,
    currentTime: 0,
    state: 'running',
    destination: fakeNode('destination'),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(channels, length, rate),
    createGain: () => fakeNode('gain'),
    createBiquadFilter: () => fakeNode('filter'),
    createDynamicsCompressor: () => fakeNode('compressor'),
    createAnalyser: () => fakeNode('analyser'),
    createOscillator: () => {
      const node = fakeNode('oscillator');
      sources.push(node);
      return node;
    },
    createBufferSource: () => {
      const node = fakeNode('bufferSource');
      sources.push(node);
      return node;
    },
  };
  return { context: context as unknown as AudioContext, sources };
}

/** A bank of distinct buffers, 128-frame aligned so `alignLoop` returns them as they are. */
function fakeBank(context: AudioContext): SampleBank {
  const buffer = () => context.createBuffer(1, 1024, context.sampleRate);
  return {
    tyreOffroad: buffer(),
    tyreSolid: buffer(),
    windHowl: buffer(),
    crash: buffer(),
    crashTrollina: buffer(),
    crashRedRider: buffer(),
    crashAdonisb2: buffer(),
    crashMaribel: buffer(),
    crashWheelInMotion: buffer(),
    crashDrunkard: buffer(),
    stumbleDrunkard: buffer(),
    sirenFar: buffer(),
    sirenClose: buffer(),
    overspeedBeep: buffer(),
  };
}

/** The cue `AudioDirector.stumble` produces, minus the director. */
function stumbleCue(): TransientCue {
  return {
    kind: 'stumble',
    bus: 'sfx',
    gain: 0.3,
    delaySeconds: 0,
    thumpFromHz: 150,
    thumpToHz: 60,
    thumpSeconds: 0.08,
    noiseHz: 0,
    noiseQ: 1,
    noiseSeconds: 0,
    toneHz: 2100,
    toneSeconds: 0.05,
    voice: null,
  };
}

test('before the bank lands a stumble is the stand-in, and the recording counter says so', () => {
  // The failure this catches: the counter incrementing for the fallback — the
  // exact defect `crashSamplePlays` exists to rule out (M10 QA, F3), which
  // would let a build with the file missing from the bank pass the browser
  // spec that asks whether the cans knocked.
  const { context, sources } = fakeContext();
  const sink = new WebAudioSink(context);
  const permanent = sources.length;

  sink.play(stumbleCue());

  assert.equal(sink.counts.stumbleSamplePlays, 0, 'the stand-in was counted as the recording');
  // The stand-in is two voices — the knock (a falling oscillator) and the
  // clink (a tone), both oscillators, no buffer source — and they are live.
  const launched = sources.slice(permanent);
  assert.equal(launched.length, 2, 'the stand-in did not launch a knock and a clink');
  assert.ok(launched.every((node) => node.kind === 'oscillator'));
  assert.equal(sink.counts.voices, 2);
  sink.dispose();
});

test('with the bank a stumble is the recording, once, at its own rate, and it is counted', () => {
  // The failure this catches: the kind falling through to synthesis with the
  // bank present (a missing arm in `play`), or reaching for the wrong buffer,
  // or borrowing the crash's rate rotation — the hic is a pitched word and a
  // detune would make a different joke each time.
  const { context, sources } = fakeContext();
  const sink = new WebAudioSink(context);
  const bank = fakeBank(context);
  sink.setSampleBank(bank);
  const permanent = sources.length;

  sink.play(stumbleCue());

  const launched = sources.slice(permanent);
  assert.equal(launched.length, 1, 'the recording is one source, not a stand-in beside it');
  assert.equal(launched[0].kind, 'bufferSource');
  assert.equal(launched[0].buffer, bank.stumbleDrunkard, 'the wrong buffer was played');
  assert.equal((launched[0].playbackRate as { value: number }).value, 1, 'the stumble inherited the crash\'s detune');
  assert.equal(sink.counts.stumbleSamplePlays, 1);
  assert.equal(sink.counts.crashSamplePlays, 0, 'a stumble was counted as a crash');
  assert.equal(sink.counts.overspeedSamplePlays, 0);

  sink.play(stumbleCue());
  assert.equal(sink.counts.stumbleSamplePlays, 2, 'the counter is not per play');
  sink.dispose();
});

test('a crash in the Drunkard\'s voice reaches his buffer and reports his name', () => {
  // `crashFor`'s seventh arm, seen from the sink: the interim where he crashed
  // as Red Rider ended in the data, and this is the one place the choice and
  // the buffer are read together.
  const { context, sources } = fakeContext();
  const sink = new WebAudioSink(context);
  const bank = fakeBank(context);
  sink.setSampleBank(bank);
  const permanent = sources.length;

  sink.play({ ...stumbleCue(), kind: 'crash', voice: 'drunkard', gain: 0.8 });

  const launched = sources.slice(permanent);
  assert.equal(launched.length, 1);
  assert.equal(launched[0].buffer, bank.crashDrunkard, 'his crash reached somebody else\'s buffer');
  assert.notEqual(launched[0].buffer, bank.crashRedRider, 'the interim is still in the resolver');
  assert.equal(sink.counts.lastCrashVoice, 'drunkard');
  assert.equal(sink.counts.crashSamplePlays, 1);
  assert.equal(sink.counts.stumbleSamplePlays, 0);
  sink.dispose();
});
