/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RENDER_QUANTUM_FRAMES } from './noise.ts';
import {
  ENVIRONMENT_AMBIENCE_KINDS,
  EnvironmentAmbienceGraph,
  EnvironmentAmbienceModel,
  createEnvironmentAmbienceInput,
  type EnvironmentAmbienceEmitter,
  type EnvironmentAmbienceFrame,
  type EnvironmentAmbienceInput,
  type EnvironmentAmbienceTuning,
} from './environmentAmbience.ts';

/** Fixture only; production receives the table in data/tuning.ts. */
const TUNING: EnvironmentAmbienceTuning = {
  maximumEmitters: 12,
  maximumTotalGain: 0.025,
  proximityResponseSeconds: 0.35,
  duckAttackSeconds: 0.035,
  duckReleaseSeconds: 0.65,
  warningFloor: 0.20,
  sirenFloor: 0.45,
  parameterGlideSeconds: 0.018,
  noiseSeed: 0x7a11bc41,
  voices: {
    cafe: { peakGain: 0.011, nearMetres: 3, farMetres: 22, filterType: 'bandpass', filterHz: 480, filterQ: 0.55 },
    workshop: { peakGain: 0.009, nearMetres: 3, farMetres: 20, filterType: 'bandpass', filterHz: 210, filterQ: 0.65 },
    park: { peakGain: 0.006, nearMetres: 8, farMetres: 32, filterType: 'lowpass', filterHz: 800, filterQ: 0.5 },
    home: { peakGain: 0.004, nearMetres: 3, farMetres: 14, filterType: 'bandpass', filterHz: 320, filterQ: 0.45 },
    industrial: { peakGain: 0.010, nearMetres: 5, farMetres: 30, filterType: 'bandpass', filterHz: 135, filterQ: 0.65 },
  },
};
const STEP = 1 / 60;

test('moving only an installed emitter changes actual proximity without adding voices or retaining old-world ids', () => {
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('moving-world', [{ id: 'van', kind: 'industrial', x: 100, y: 0, z: 0, strength: 0.4 }]);
  model.update(10, listening()); assert.equal(model.frame.totalGain, 0);
  assert.equal(model.updateEmitter('van', 0, 0, 0, 0.4), true);
  model.update(10, listening());
  assert.ok(Math.abs(model.frame.industrialGain - TUNING.voices.industrial.peakGain * 0.4) < 1e-9);
  const audible = { ...model.frame };
  assert.equal(model.updateEmitter('van', Number.NaN, 0, 0, 0.4), false);
  assert.equal(model.updateEmitter('absent', 0, 0, 0, 1), false);
  model.update(10, listening());
  assert.ok(Math.abs(model.frame.industrialGain - audible.industrialGain) < 1e-12,
    'the existing gain may finish its smoothing but a refused source update cannot change its target');
  assert.equal(model.frame.activeEmitters, audible.activeEmitters);
  assert.equal(model.frame.emitterCount, 1);
  model.replaceWorld('replacement', []);
  assert.equal(model.updateEmitter('van', 0, 0, 0, 0.4), false);
  assert.equal(model.frame.totalGain, 0);
});

function listening(overrides: Partial<EnvironmentAmbienceInput> = {}): EnvironmentAmbienceInput {
  return Object.assign(createEnvironmentAmbienceInput(), { running: true }, overrides);
}

function run(model: EnvironmentAmbienceModel, input: EnvironmentAmbienceInput, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i += 1) model.update(STEP, input);
}

function roster(count: number): EnvironmentAmbienceEmitter[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `emitter-${String(i).padStart(2, '0')}`,
    kind: ENVIRONMENT_AMBIENCE_KINDS[i % ENVIRONMENT_AMBIENCE_KINDS.length],
    x: 0, y: 0, z: 0,
  }));
}

function frameGains(frame: EnvironmentAmbienceFrame): number[] {
  return [frame.cafeGain, frame.workshopGain, frame.parkGain, frame.homeGain, frame.industrialGain];
}

test('one listener has smooth finite distance fades, including height, and an exact silent exterior target', () => {
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('cafe-course', [{ id: 'cafe-a', kind: 'cafe', x: 0, y: 0, z: 0 }]);
  const levels: number[] = [];
  for (const distance of [0, 3, 8, 14, 21, 22, 25]) {
    model.reset();
    model.update(100, listening({ listenerZ: distance }));
    levels.push(model.frame.cafeGain);
  }
  assert.equal(levels[0], TUNING.voices.cafe.peakGain);
  assert.equal(levels[0], levels[1]);
  for (let i = 2; i < 6; i += 1) assert.ok(levels[i] < levels[i - 1]);
  assert.equal(levels[5], 0);
  assert.equal(levels[6], 0);
  model.reset();
  model.update(100, listening({ listenerY: 14 }));
  assert.equal(model.frame.cafeGain, levels[3], 'the listener is 3D, not XZ-only');
  model.reset();
  const frame = model.frame;
  model.update(STEP, listening());
  assert.equal(frame, model.frame, 'the frame is reused rather than allocated per update');
  assert.ok(frame.cafeGain > 0 && frame.cafeGain < levels[0], 'entering range ramps instead of stepping');
  model.update(STEP, listening({ listenerZ: 30 }));
  assert.ok(frame.cafeGain > 0, 'leaving range releases smoothly');
  assert.equal(frame.activeEmitters, 0);
});

test('warnings and sirens duck the ambience with a fast attack and slower release', () => {
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('mixed-course', roster(5));
  const input = listening();
  run(model, input, 4);
  const ordinary = model.frame.totalGain;
  input.warningPriority = 1;
  model.update(STEP, input);
  assert.ok(model.frame.duckGain < 1 && model.frame.duckGain > TUNING.warningFloor);
  run(model, input, 1);
  assert.ok(Math.abs(model.frame.totalGain / ordinary - TUNING.warningFloor) < 1e-4);
  input.sirenPriority = 1;
  run(model, input, 1);
  assert.ok(Math.abs(model.frame.duckGain - TUNING.warningFloor * TUNING.sirenFloor) < 1e-6);
  input.warningPriority = 0;
  input.sirenPriority = 0;
  const ducked = model.frame.duckGain;
  model.update(STEP, input);
  assert.ok(model.frame.duckGain > ducked && model.frame.duckGain < 0.2, 'release cannot jump to full level');
  run(model, input, 5);
  assert.ok(model.frame.duckGain > 0.999);
  model.update(STEP, listening({ warningPriority: Number.NaN, sirenPriority: Number.POSITIVE_INFINITY }));
  for (const gain of frameGains(model.frame)) assert.ok(Number.isFinite(gain));
});

test('coincident emitters cannot stack beyond either a branch or the aggregate quiet cap', () => {
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('maximum-course', roster(TUNING.maximumEmitters));
  const input = listening();
  run(model, input, 6);
  assert.ok(Math.abs(model.frame.totalGain - TUNING.maximumTotalGain) < 1e-8);
  assert.equal(model.frame.activeEmitters, TUNING.maximumEmitters);
  const gains = frameGains(model.frame);
  for (let i = 0; i < gains.length; i += 1) {
    assert.ok(gains[i] >= 0 && gains[i] <= TUNING.voices[ENVIRONMENT_AMBIENCE_KINDS[i]].peakGain);
  }
  for (let i = 0; i < 180; i += 1) {
    input.listenerX = i % 2 ? 100 : 0;
    model.update(STEP, input);
    assert.ok(model.frame.totalGain <= TUNING.maximumTotalGain + 1e-15);
  }
  assert.throws(() => model.replaceWorld('too-many', roster(TUNING.maximumEmitters + 1)), RangeError);
  assert.equal(model.worldId, 'maximum-course', 'a refused world must preserve the installed one');
});

test('pause and invalid listener positions silence at dt zero; reinstalling the same id clears old tails', () => {
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('same-world', roster(5));
  model.update(10, listening());
  assert.ok(model.frame.totalGain > 0);
  model.update(0, listening({ running: false }));
  assert.equal(model.frame.totalGain, 0);
  model.update(STEP, listening());
  assert.ok(model.frame.totalGain > 0 && model.frame.totalGain < TUNING.maximumTotalGain);
  model.replaceWorld('same-world', [{ id: 'distant-home', kind: 'home', x: 200, y: 0, z: 200 }]);
  assert.equal(model.frame.totalGain, 0);
  assert.equal(model.frame.emitterCount, 1);
  model.update(STEP, listening());
  assert.equal(model.frame.totalGain, 0);
  model.replaceWorld('near-world', roster(1));
  model.update(10, listening());
  model.update(0, listening({ listenerX: Number.NaN }));
  assert.equal(model.frame.totalGain, 0);
  model.update(10, listening());
  const previous = { ...model.frame };
  for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    model.update(dt, listening());
    assert.deepEqual(model.frame, previous);
  }
  model.clearWorld();
  assert.equal(model.worldId, null);
  assert.equal(model.frame.emitterCount, 0);
  assert.equal(model.frame.totalGain, 0);
});

test('world descriptor order and caller mutation cannot change the copied model; no wall-clock drift or LFO exists', () => {
  const a = new EnvironmentAmbienceModel(TUNING);
  const b = new EnvironmentAmbienceModel(TUNING);
  const emitters = roster(12).map((emitter, i) => ({ ...emitter, x: i * 1.2, strength: (i + 1) / 12 }));
  a.replaceWorld('world', emitters);
  b.replaceWorld('world', [...emitters].reverse());
  emitters[0].x = 10000;
  emitters.reverse();
  for (let i = 0; i < 240; i += 1) {
    const input = listening({ listenerX: Math.sin(i / 50) * 8, warningPriority: i > 180 ? 1 : 0 });
    assert.deepEqual(a.update(STEP, input), b.update(STEP, input));
  }
  a.replaceWorld('steady-cafe', roster(1));
  a.update(100, listening());
  const steady = { ...a.frame };
  for (let i = 0; i < 600; i += 1) assert.deepEqual(a.update(STEP, listening()), steady);
});

test('malformed world data refuses before replacing the current world', () => {
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('good', roster(1));
  for (const bad of [
    [{ id: '', kind: 'cafe', x: 0, y: 0, z: 0 }],
    [{ id: 'bad', kind: 'cafe', x: 0, y: Number.NaN, z: 0 }],
    [{ id: 'bad', kind: 'cafe', x: 0, y: 0, z: 0, strength: 2 }],
    [roster(1)[0], roster(1)[0]],
  ] as EnvironmentAmbienceEmitter[][]) {
    assert.throws(() => model.replaceWorld('bad', bad), RangeError);
    assert.equal(model.worldId, 'good');
  }
  assert.throws(() => new EnvironmentAmbienceModel({ ...TUNING, duckAttackSeconds: 0 }), RangeError);
  assert.throws(() => new EnvironmentAmbienceModel({ ...TUNING, maximumEmitters: Number.POSITIVE_INFINITY }), RangeError);
});

interface TargetCall { value: number; time: number; seconds: number; }
class FakeParam {
  value = 0;
  readonly targets: TargetCall[] = [];
  setTargetAtTime(value: number, time: number, seconds: number): void {
    this.targets.push({ value, time, seconds });
    this.value = value;
  }
}
class FakeNode {
  readonly kind: string;
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly connections: FakeNode[] = [];
  type: string = '';
  buffer: AudioBuffer | null = null;
  loop = false;
  starts = 0;
  stops = 0;
  disconnects = 0;
  onended: (() => void) | null = null;
  constructor(kind: string) { this.kind = kind; }
  connect(node: FakeNode): void { this.connections.push(node); }
  disconnect(): void { this.disconnects += 1; }
  start(): void { this.starts += 1; }
  stop(): void { this.stops += 1; }
}

function fakeAudio(sampleRate: number) {
  const nodes: FakeNode[] = [];
  const buffers: Float32Array<ArrayBuffer>[] = [];
  const destination = new FakeNode('existing-sfx-bus');
  const makeNode = (kind: string): FakeNode => {
    const node = new FakeNode(kind);
    nodes.push(node);
    return node;
  };
  const context = {
    sampleRate, currentTime: 4, state: 'running',
    createGain: () => makeNode('gain'),
    createBiquadFilter: () => makeNode('filter'),
    createBufferSource: () => makeNode('source'),
    createBuffer: (channels: number, length: number, rate: number) => {
      assert.equal(channels, 1);
      assert.equal(rate, sampleRate);
      const data = new Float32Array(new ArrayBuffer(length * Float32Array.BYTES_PER_ELEMENT));
      buffers.push(data);
      return { length, sampleRate: rate, getChannelData: () => data } as unknown as AudioBuffer;
    },
  } as unknown as AudioContext;
  return { context, destination: destination as unknown as AudioNode, destinationNode: destination, nodes, buffers };
}

test('graph uses one quantum-aligned deterministic loop and 12 permanent nodes into only the supplied SFX bus', () => {
  for (const rate of [11025, 48000]) {
    const audio = fakeAudio(rate);
    const graph = new EnvironmentAmbienceGraph(audio.context, audio.destination, TUNING);
    assert.equal(graph.permanentNodes, 12);
    assert.equal(graph.permanentSources, 1);
    assert.equal(audio.nodes.length, 12);
    assert.equal(audio.buffers.length, 1);
    assert.equal(audio.buffers[0].length % RENDER_QUANTUM_FRAMES, 0);
    assert.equal(graph.bufferBytes, audio.buffers[0].byteLength);
    assert.equal(audio.nodes[0].connections[0], audio.destinationNode);
    const sources = audio.nodes.filter((node) => node.kind === 'source');
    assert.equal(sources.length, 1);
    assert.equal(sources[0].starts, 1);
    assert.equal(sources[0].loop, true);
    assert.equal(sources[0].connections.length, ENVIRONMENT_AMBIENCE_KINDS.length);
    const filters = audio.nodes.filter((node) => node.kind === 'filter');
    for (let i = 0; i < filters.length; i += 1) {
      const voice = TUNING.voices[ENVIRONMENT_AMBIENCE_KINDS[i]];
      assert.equal(filters[i].type, voice.filterType);
      assert.equal(filters[i].frequency.value, voice.filterHz);
      assert.equal(filters[i].Q.value, voice.filterQ);
      assert.equal(filters[i].connections[0].gain.value, 0);
    }
    const other = fakeAudio(rate);
    const repeat = new EnvironmentAmbienceGraph(other.context, other.destination, TUNING);
    assert.deepEqual(audio.buffers[0], other.buffers[0]);
    repeat.dispose();
    graph.dispose();
  }
});

test('graph glides finite capped gains, skips unchanged targets and silences through the same ramps', () => {
  const audio = fakeAudio(48000);
  const graph = new EnvironmentAmbienceGraph(audio.context, audio.destination, TUNING);
  const model = new EnvironmentAmbienceModel(TUNING);
  model.replaceWorld('world', roster(12));
  model.update(100, listening());
  const branchGains = audio.nodes.filter((node) => node.kind === 'gain').slice(1);
  graph.applyFrame(model.frame);
  let total = 0;
  for (let i = 0; i < branchGains.length; i += 1) {
    const target = branchGains[i].gain.targets[0];
    assert.ok(Number.isFinite(target.value));
    assert.equal(target.time, audio.context.currentTime);
    assert.equal(target.seconds, TUNING.parameterGlideSeconds);
    total += target.value;
  }
  assert.ok(Math.abs(total - TUNING.maximumTotalGain) < 1e-15);
  for (let i = 0; i < 600; i += 1) graph.applyFrame(model.frame);
  assert.equal(audio.nodes.length, 12, 'updates never create nodes');
  for (const gain of branchGains) assert.equal(gain.gain.targets.length, 1, 'unchanged gains never queue extra events');
  graph.applyFrame({ ...model.frame, cafeGain: Number.NaN, workshopGain: Number.POSITIVE_INFINITY,
    parkGain: -1, homeGain: 100, industrialGain: 100 });
  total = 0;
  for (const gain of branchGains) {
    assert.ok(Number.isFinite(gain.gain.value) && gain.gain.value >= 0);
    total += gain.gain.value;
  }
  assert.ok(total <= TUNING.maximumTotalGain + 1e-15);
  model.update(0, listening({ running: false }));
  graph.applyFrame(model.frame);
  for (const gain of branchGains) assert.equal(gain.gain.value, 0);
  graph.dispose();
});

test('graph disposal releases every owned node/source exactly once and never disconnects the host bus', () => {
  for (let generation = 0; generation < 5; generation += 1) {
    const audio = fakeAudio(8000);
    const graph = new EnvironmentAmbienceGraph(audio.context, audio.destination, TUNING);
    graph.dispose();
    graph.dispose();
    assert.equal(graph.permanentNodes, 0);
    assert.equal(graph.permanentSources, 0);
    assert.equal(graph.bufferBytes, 0);
    for (const node of audio.nodes) {
      assert.equal(node.disconnects, 1);
      if (node.kind === 'source') {
        assert.equal(node.stops, 1);
        assert.equal(node.buffer, null);
        assert.equal(node.onended, null);
      }
    }
    assert.equal(audio.destinationNode.disconnects, 0);
    const before = audio.nodes.reduce((sum, node) => sum + node.gain.targets.length, 0);
    graph.applyFrame(new EnvironmentAmbienceModel(TUNING).frame);
    assert.equal(audio.nodes.reduce((sum, node) => sum + node.gain.targets.length, 0), before);
  }
});
