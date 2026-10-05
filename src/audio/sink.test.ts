/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { WebAudioSink, type SampleBank } from './sink.ts';
import type { TransientCue } from './director.ts';
import { ENVIRONMENT_AMBIENCE } from '../data/tuning.ts';
import { EnvironmentAmbienceModel, createEnvironmentAmbienceInput } from './environmentAmbience.ts';

/**
 * The sink's *choice* of what to play, asserted with no browser — M29 Phase 4.
 *
 * Everything the sink does is a call into Web Audio, and until this file
 * nothing headless exercised it: the graph was proved in `tests/m8.spec.ts`
 * where a real context exists. What the stumble cue adds is a decision the
 * browser specs can only witness through a counter — recording or stand-in,
 * and which buffer — and a decision is checkable against a fake. The fake
 * below is deliberately dumb: nodes accept parameter writes and record source
 * choices, connections and teardown. This can prove routing and ownership;
 * it cannot stand in for the browser's actual rendered signal.
 *
 * `outputLevel`, `spectrum` and the loops' timing are not covered here and
 * cannot be: they are the graph, and the graph is the browser's.
 */

/** An `AudioParam` that takes every write and remembers only its value. */
function fakeParam(initial: number): Record<string, unknown> {
  const param = {
    value: initial,
    setValueAtTime(): void {},
    linearRampToValueAtTime(): void {},
    exponentialRampToValueAtTime(): void {},
    setTargetAtTime(value: number): void { param.value = value; },
    cancelScheduledValues(): void {},
  };
  return param;
}

const NODE_METHODS = new Set([
  'connect', 'disconnect', 'start', 'stop', 'getFloatTimeDomainData', 'getFloatFrequencyData',
]);

/**
 * A node whose unknown properties are parameters. `playbackRate` starts at 1
 * as the real one does, so a test can tell "never touched" from "set to 1".
 */
function fakeNode(kind: string, teardown?: Record<string, unknown>[]): Record<string, unknown> {
  const connections: Record<string, unknown>[] = [];
  const own: Record<string, unknown> = { kind, connections, disconnects: 0, starts: 0, stops: 0 };
  let node: Record<string, unknown>;
  own.connect = (target: Record<string, unknown>): void => { connections.push(target); };
  own.disconnect = (): void => {
    own.disconnects = Number(own.disconnects) + 1;
    teardown?.push(node);
  };
  own.start = (): void => { own.starts = Number(own.starts) + 1; };
  own.stop = (): void => { own.stops = Number(own.stops) + 1; };
  node = new Proxy(own, {
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
  return node;
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
  nodes: Record<string, unknown>[];
  teardown: Record<string, unknown>[];
}

function fakeContext(): FakeContext {
  const sources: Record<string, unknown>[] = [];
  const nodes: Record<string, unknown>[] = [];
  const teardown: Record<string, unknown>[] = [];
  const makeNode = (kind: string): Record<string, unknown> => {
    const node = fakeNode(kind, teardown);
    nodes.push(node);
    return node;
  };
  // A low rate keeps the sink's two three-second noise buffers small; nothing
  // here reads a frequency, so the number is arbitrary.
  const context = {
    sampleRate: 8000,
    currentTime: 0,
    state: 'running',
    destination: fakeNode('destination'),
    createBuffer: (channels: number, length: number, rate: number) => fakeBuffer(channels, length, rate),
    createGain: () => makeNode('gain'),
    createBiquadFilter: () => makeNode('filter'),
    createDynamicsCompressor: () => makeNode('compressor'),
    createAnalyser: () => makeNode('analyser'),
    createOscillator: () => {
      const node = makeNode('oscillator');
      sources.push(node);
      return node;
    },
    createBufferSource: () => {
      const node = makeNode('bufferSource');
      sources.push(node);
      return node;
    },
  };
  return { context: context as unknown as AudioContext, sources, nodes, teardown };
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
    crashFloWithZo: buffer(),
    crashSealOnAWheel: buffer(),
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

test('a crash in FloWithZo\'s voice reaches his buffer and reports his name', () => {
  // `crashFor`'s eighth arm, seen from the sink (M34 §34.10). His seat carried
  // `'red-rider'` for three phases by a declared interim in the data, and the
  // failure that outlives such an interim is silent everywhere else: the
  // resolver still handing back Red Rider's buffer while `lastCrashVoice`
  // reports his name. So the choice and the buffer are read together, and the
  // interim's own buffer is named as the thing it must not be.
  const { context, sources } = fakeContext();
  const sink = new WebAudioSink(context);
  const bank = fakeBank(context);
  sink.setSampleBank(bank);
  const permanent = sources.length;

  sink.play({ ...stumbleCue(), kind: 'crash', voice: 'flo-with-zo', gain: 0.8 });

  const launched = sources.slice(permanent);
  assert.equal(launched.length, 1);
  assert.equal(launched[0].buffer, bank.crashFloWithZo, 'his crash reached somebody else\'s buffer');
  assert.notEqual(launched[0].buffer, bank.crashRedRider, 'the interim is still in the resolver');
  assert.equal(sink.counts.lastCrashVoice, 'flo-with-zo');
  assert.equal(sink.counts.crashSamplePlays, 1);
  assert.equal(sink.counts.stumbleSamplePlays, 0);
  sink.dispose();
});

test('a crash in Seal on a Wheel\'s voice reaches his buffer and reports his name', () => {
  // `crashFor`'s ninth arm, seen from the sink (M35 §35.6). The fifth walk down
  // the same path: his seat carried `'red-rider'` for three phases by a
  // declared interim in the data, and the failure that outlives such an interim
  // is silent everywhere else — the resolver still handing back Red Rider's
  // buffer while `lastCrashVoice` reports his name. Here it would be
  // particularly quiet: Red Rider's file *is* this same crash, so the wrong
  // buffer plays something that sounds almost right and has no seal in it.
  const { context, sources } = fakeContext();
  const sink = new WebAudioSink(context);
  const bank = fakeBank(context);
  sink.setSampleBank(bank);
  const permanent = sources.length;

  sink.play({ ...stumbleCue(), kind: 'crash', voice: 'seal-on-a-wheel', gain: 0.8 });

  const launched = sources.slice(permanent);
  assert.equal(launched.length, 1);
  assert.equal(launched[0].buffer, bank.crashSealOnAWheel, 'his crash reached somebody else\'s buffer');
  assert.notEqual(launched[0].buffer, bank.crashRedRider, 'the interim is still in the resolver');
  assert.equal(sink.counts.lastCrashVoice, 'seal-on-a-wheel');
  assert.equal(sink.counts.crashSamplePlays, 1);
  assert.equal(sink.counts.stumbleSamplePlays, 0);
  sink.dispose();
});

test('the fixed ambience graph connects through SFX/master, consumes no transient voices and tears down first', () => {
  const { context, nodes, sources, teardown } = fakeContext();
  const sink = new WebAudioSink(context);
  const graph = nodes.slice(-12);
  const connections = (node: Record<string, unknown>): Record<string, unknown>[] =>
    node.connections as Record<string, unknown>[];
  const sfx = connections(graph[0])[0];
  const master = connections(sfx)[0];
  const limiter = connections(master)[0];
  assert.equal(graph.length, 12);
  assert.equal(graph[0].kind, 'gain');
  assert.equal(sfx.kind, 'gain');
  assert.equal(limiter.kind, 'compressor');
  assert.equal(connections(limiter)[0], context.destination);
  const buses = nodes.filter(node => connections(node)[0] === master);
  assert.equal(buses.length, 3, 'ambience may not create another volume/master path');
  assert.equal(buses[0], sfx, 'ambience bypassed the existing SFX bus');
  sink.setBusGains(0, 0.4, 0.7);
  assert.equal((sfx.gain as { value: number }).value, 0, 'SFX/master zero must silence ambience');
  assert.equal((buses[1].gain as { value: number }).value, 0.4);
  assert.equal((buses[2].gain as { value: number }).value, 0.7);
  assert.equal(sink.counts.ambienceNodes, 12);
  assert.equal(sink.counts.ambienceSources, 1);
  assert.ok(sink.counts.ambienceBufferBytes > 0);
  assert.equal(sink.counts.permanentNodes, nodes.length);
  const source = graph.find(node => node.kind === 'bufferSource');
  assert.ok(source);
  assert.equal(source.starts, 1);
  assert.equal(source.loop, true);
  assert.equal(connections(source).length, 5);
  const model = new EnvironmentAmbienceModel(ENVIRONMENT_AMBIENCE);
  model.replaceWorld('world', [{ id: 'cafe', kind: 'cafe', x: 0, y: 0, z: 0 }]);
  const input = createEnvironmentAmbienceInput();
  input.running = true;
  const nodeCount = nodes.length;
  const sourceCount = sources.length;
  for (let i = 0; i < 600; i += 1) sink.applyAmbienceFrame(model.update(1 / 60, input));
  assert.equal(nodes.length, nodeCount, 'frame updates created nodes');
  assert.equal(sources.length, sourceCount, 'frame updates created sources');
  assert.equal(sink.counts.voices, 0, 'ambience consumed the warning/transient budget');
  assert.equal(sink.counts.droppedVoices, 0);
  input.running = false;
  sink.applyAmbienceFrame(model.update(0, input));
  for (const node of graph.filter(node => node.kind === 'gain').slice(1)) {
    assert.equal((node.gain as { value: number }).value, 0, 'pause failed to request silence');
  }
  sink.dispose();
  sink.dispose();
  assert.deepEqual(teardown.slice(0, 12), graph, 'host buses were disposed before ambience');
  for (const node of graph) assert.equal(node.disconnects, 1);
  assert.equal(source.stops, 1);
  assert.equal(source.buffer, null);
  assert.equal(source.onended, null);
  assert.equal(sink.counts.permanentNodes, 0);
  assert.equal(sink.counts.ambienceNodes, 0);
  assert.equal(sink.counts.ambienceSources, 0);
  assert.equal(sink.counts.ambienceBufferBytes, 0);
});
