/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { approach, clamp01 } from './mix.ts';
import { fillNoise, NOISE_SECONDS, RENDER_QUANTUM_FRAMES } from './noise.ts';

/** Stable graph branches; changing the number of world emitters adds no nodes. */
export const ENVIRONMENT_AMBIENCE_KINDS = ['cafe', 'workshop', 'park', 'home', 'industrial'] as const;
export type EnvironmentAmbienceKind = typeof ENVIRONMENT_AMBIENCE_KINDS[number];

export interface EnvironmentAmbienceVoice {
  /** Linear peak gain before the shared SFX/master buses. */
  readonly peakGain: number;
  /** Full proximity level ends at this 3D distance from the emitter, metres. */
  readonly nearMetres: number;
  /** Exactly zero target outside this distance, metres. */
  readonly farMetres: number;
  readonly filterType: 'bandpass' | 'lowpass';
  readonly filterHz: number;
  /** Broad, non-ringing noise bands; no sustained oscillator or LFO. */
  readonly filterQ: number;
}

/** Passed from data/tuning.ts by the composition root, never from options. */
export interface EnvironmentAmbienceTuning {
  readonly maximumEmitters: number;
  /** Linear upper bound on the sum, including coincident/coherent sources. */
  readonly maximumTotalGain: number;
  readonly proximityResponseSeconds: number;
  readonly duckAttackSeconds: number;
  readonly duckReleaseSeconds: number;
  /** Retained fraction at priority 1; silence is 0. */
  readonly warningFloor: number;
  readonly sirenFloor: number;
  /** AudioParam glide; the model itself knows no audio clock. */
  readonly parameterGlideSeconds: number;
  readonly noiseSeed: number;
  readonly voices: Readonly<Record<EnvironmentAmbienceKind, EnvironmentAmbienceVoice>>;
}

/** Plain, render/world-owned descriptors. These never enter simulation. */
export interface EnvironmentAmbienceEmitter {
  readonly id: string;
  readonly kind: EnvironmentAmbienceKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Optional authoring attenuation, 0..1; omitted means 1. */
  readonly strength?: number;
}

/** Exactly one listener: the composition root supplies seat 0's presented pose. */
export interface EnvironmentAmbienceInput {
  listenerX: number;
  listenerY: number;
  listenerZ: number;
  /** False at title, pause, hidden tab, halted loop or an abandoned world. */
  running: boolean;
  warningPriority: number;
  sirenPriority: number;
}

export function createEnvironmentAmbienceInput(): EnvironmentAmbienceInput {
  return {
    listenerX: 0, listenerY: 0, listenerZ: 0, running: false,
    warningPriority: 0, sirenPriority: 0,
  };
}

/** Reused each update. Every gain already contains the warning/siren duck. */
export interface EnvironmentAmbienceFrame {
  cafeGain: number;
  workshopGain: number;
  parkGain: number;
  homeGain: number;
  industrialGain: number;
  totalGain: number;
  duckGain: number;
  emitterCount: number;
  activeEmitters: number;
}

interface InstalledEmitter {
  readonly id: string;
  readonly branch: number;
  x: number;
  y: number;
  z: number;
  strength: number;
}

function finiteUnit(value: number): number {
  return Number.isFinite(value) ? clamp01(value) : 0;
}

function validateTuning(tuning: EnvironmentAmbienceTuning): void {
  if (!Number.isSafeInteger(tuning.maximumEmitters) || tuning.maximumEmitters <= 0) {
    throw new RangeError('Ambience needs a finite positive emitter capacity');
  }
  for (const value of [tuning.maximumTotalGain, tuning.warningFloor, tuning.sirenFloor]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError('Ambience gains must be finite and between 0 and 1');
    }
  }
  for (const value of [
    tuning.proximityResponseSeconds, tuning.duckAttackSeconds,
    tuning.duckReleaseSeconds, tuning.parameterGlideSeconds,
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError('Ambience response times must be finite positive seconds');
    }
  }
  if (!Number.isSafeInteger(tuning.noiseSeed)) throw new RangeError('Ambience noise seed must be an integer');
  for (const kind of ENVIRONMENT_AMBIENCE_KINDS) {
    const voice = tuning.voices[kind];
    if (!voice || !Number.isFinite(voice.peakGain) || voice.peakGain < 0 || voice.peakGain > 1
      || !Number.isFinite(voice.nearMetres) || voice.nearMetres < 0
      || !Number.isFinite(voice.farMetres) || voice.farMetres <= voice.nearMetres
      || !Number.isFinite(voice.filterHz) || voice.filterHz <= 0
      || !Number.isFinite(voice.filterQ) || voice.filterQ < 0 || voice.filterQ > 1
      || (voice.filterType !== 'bandpass' && voice.filterType !== 'lowpass')) {
      throw new RangeError(`Invalid ${kind} ambience voice`);
    }
  }
}

/**
 * A fixed-dt plain-number model. update() allocates nothing, reads no clock,
 * creates no random value and writes neither the world nor the ride. Quiet
 * spectral textures are fixed: distance/priority are the only gain motion.
 */
export class EnvironmentAmbienceModel {
  readonly frame: EnvironmentAmbienceFrame = {
    cafeGain: 0, workshopGain: 0, parkGain: 0, homeGain: 0, industrialGain: 0,
    totalGain: 0, duckGain: 1, emitterCount: 0, activeEmitters: 0,
  };
  private readonly tuning: EnvironmentAmbienceTuning;
  private readonly target = new Float64Array(ENVIRONMENT_AMBIENCE_KINDS.length);
  private readonly proximity = new Float64Array(ENVIRONMENT_AMBIENCE_KINDS.length);
  private emitters: readonly InstalledEmitter[] = [];
  private readonly emitterById = new Map<string, InstalledEmitter>();
  private installedWorldId: string | null = null;

  constructor(tuning: EnvironmentAmbienceTuning) {
    validateTuning(tuning);
    this.tuning = tuning;
  }

  get worldId(): string | null { return this.installedWorldId; }

  /**
   * Called once per installLevel, including reinstalling the same seed/id.
   * Copies/sorts at that boundary; replacement always clears old audible tails.
   * Invalid descriptors refuse before touching the previously installed world.
   */
  replaceWorld(worldId: string, emitters: readonly EnvironmentAmbienceEmitter[]): void {
    if (!worldId || emitters.length > this.tuning.maximumEmitters) {
      throw new RangeError('Ambience world identity/capacity is invalid');
    }
    const next: InstalledEmitter[] = [];
    const ids = new Set<string>();
    for (const emitter of emitters) {
      const branch = ENVIRONMENT_AMBIENCE_KINDS.indexOf(emitter.kind);
      const strength = emitter.strength ?? 1;
      if (!emitter.id || ids.has(emitter.id) || branch < 0
        || !Number.isFinite(emitter.x) || !Number.isFinite(emitter.y) || !Number.isFinite(emitter.z)
        || !Number.isFinite(strength) || strength < 0 || strength > 1) {
        throw new RangeError('Ambience emitter identity/position/strength is invalid');
      }
      ids.add(emitter.id);
      next.push({ id: emitter.id, branch, x: emitter.x, y: emitter.y, z: emitter.z, strength });
    }
    // Locale-independent and input-order-independent accumulation order.
    next.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    this.emitters = next;
    this.emitterById.clear();
    for (const emitter of next) this.emitterById.set(emitter.id, emitter);
    this.installedWorldId = worldId;
    this.frame.emitterCount = next.length;
    this.reset();
  }

  /** Move only an installed source. This allocates no node, voice or descriptor. */
  updateEmitter(id: string, x: number, y: number, z: number, strength: number): boolean {
    const emitter = this.emitterById.get(id);
    if (!emitter || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)
      || !Number.isFinite(strength) || strength < 0 || strength > 1) return false;
    emitter.x = x; emitter.y = y; emitter.z = z; emitter.strength = strength;
    return true;
  }

  /** Silence and clear smoothing without losing the installed emitter roster. */
  reset(): void {
    this.target.fill(0);
    this.proximity.fill(0);
    this.frame.duckGain = 1;
    this.frame.activeEmitters = 0;
    this.writeGains(0);
  }

  clearWorld(): void {
    this.emitters = [];
    this.emitterById.clear();
    this.installedWorldId = null;
    this.frame.emitterCount = 0;
    this.reset();
  }

  update(dt: number, input: EnvironmentAmbienceInput): EnvironmentAmbienceFrame {
    if (!input.running || !Number.isFinite(input.listenerX)
      || !Number.isFinite(input.listenerY) || !Number.isFinite(input.listenerZ)) {
      this.reset();
      return this.frame;
    }
    if (!Number.isFinite(dt) || dt <= 0) return this.frame;

    this.target.fill(0);
    let active = 0;
    for (let i = 0; i < this.emitters.length; i += 1) {
      const emitter = this.emitters[i];
      const kind = ENVIRONMENT_AMBIENCE_KINDS[emitter.branch];
      const voice = this.tuning.voices[kind];
      const distance = Math.hypot(
        emitter.x - input.listenerX, emitter.y - input.listenerY, emitter.z - input.listenerZ,
      );
      if (distance >= voice.farMetres || emitter.strength === 0) continue;
      active += 1;
      const t = clamp01((distance - voice.nearMetres) / (voice.farMetres - voice.nearMetres));
      const fade = 1 - t * t * (3 - 2 * t);
      this.target[emitter.branch] += fade * voice.peakGain * emitter.strength;
    }
    this.frame.activeEmitters = active;
    let sum = 0;
    for (let i = 0; i < this.target.length; i += 1) {
      this.target[i] = Math.min(this.target[i], this.tuning.voices[ENVIRONMENT_AMBIENCE_KINDS[i]].peakGain);
      sum += this.target[i];
    }
    const trim = sum > this.tuning.maximumTotalGain ? this.tuning.maximumTotalGain / sum : 1;
    for (let i = 0; i < this.target.length; i += 1) {
      this.proximity[i] = approach(
        this.proximity[i], this.target[i] * trim, this.tuning.proximityResponseSeconds, dt,
      );
    }
    const duck = (1 - finiteUnit(input.warningPriority) * (1 - this.tuning.warningFloor))
      * (1 - finiteUnit(input.sirenPriority) * (1 - this.tuning.sirenFloor));
    this.frame.duckGain = approach(
      this.frame.duckGain, duck,
      duck < this.frame.duckGain ? this.tuning.duckAttackSeconds : this.tuning.duckReleaseSeconds, dt,
    );
    this.writeGains(this.frame.duckGain);
    return this.frame;
  }

  private writeGains(duck: number): void {
    const frame = this.frame;
    frame.cafeGain = this.proximity[0] * duck;
    frame.workshopGain = this.proximity[1] * duck;
    frame.parkGain = this.proximity[2] * duck;
    frame.homeGain = this.proximity[3] * duck;
    frame.industrialGain = this.proximity[4] * duck;
    frame.totalGain = frame.cafeGain + frame.workshopGain + frame.parkGain + frame.homeGain + frame.industrialGain;
  }
}

/**
 * Optional sink-owned graph. Construct only after the existing gesture arm and
 * connect to its existing SFX bus. No context, timers, events, panners or scene
 * nodes are owned here. One aligned noise source feeds five static broad bands;
 * no voices suggest intelligible speech and no oscillator/LFO beats or pulses.
 * It owns 12 permanent nodes and one source, independently of emitter count.
 */
export class EnvironmentAmbienceGraph {
  private readonly context: AudioContext;
  private readonly tuning: EnvironmentAmbienceTuning;
  private readonly nodes: AudioNode[] = [];
  private readonly gains: GainNode[] = [];
  private readonly previous = new Float64Array(ENVIRONMENT_AMBIENCE_KINDS.length);
  private readonly incoming = new Float64Array(ENVIRONMENT_AMBIENCE_KINDS.length);
  private source: AudioBufferSourceNode | null = null;
  private started = false;
  private disposed = false;
  private allocatedBufferBytes = 0;

  constructor(context: AudioContext, sfxBus: AudioNode, tuning: EnvironmentAmbienceTuning) {
    validateTuning(tuning);
    this.context = context;
    this.tuning = tuning;
    this.previous.fill(Number.NaN);
    try {
      const output = this.keep(context.createGain());
      output.gain.value = 1;
      output.connect(sfxBus);
      const source = this.keep(context.createBufferSource());
      this.source = source;
      const length = Math.max(RENDER_QUANTUM_FRAMES,
        Math.floor(context.sampleRate * NOISE_SECONDS / RENDER_QUANTUM_FRAMES) * RENDER_QUANTUM_FRAMES);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      fillNoise(buffer.getChannelData(0), tuning.noiseSeed, 'pink');
      this.allocatedBufferBytes = length * Float32Array.BYTES_PER_ELEMENT;
      source.buffer = buffer;
      source.loop = true;
      for (const kind of ENVIRONMENT_AMBIENCE_KINDS) {
        const voice = tuning.voices[kind];
        const filter = this.keep(context.createBiquadFilter());
        filter.type = voice.filterType;
        filter.frequency.value = Math.min(voice.filterHz, context.sampleRate / 2);
        filter.Q.value = voice.filterQ;
        const gain = this.keep(context.createGain());
        gain.gain.value = 0;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(output);
        this.gains.push(gain);
      }
      source.start();
      this.started = true;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get permanentNodes(): number { return this.nodes.length; }
  get permanentSources(): number { return this.started && !this.disposed ? 1 : 0; }
  get bufferBytes(): number { return this.allocatedBufferBytes; }

  /** Audio-clock ramps only; neither this method nor the model allocates. */
  applyFrame(frame: EnvironmentAmbienceFrame): void {
    if (this.disposed || this.context.state === 'closed') return;
    this.incoming[0] = frame.cafeGain;
    this.incoming[1] = frame.workshopGain;
    this.incoming[2] = frame.parkGain;
    this.incoming[3] = frame.homeGain;
    this.incoming[4] = frame.industrialGain;
    let sum = 0;
    for (let i = 0; i < this.incoming.length; i += 1) {
      const value = this.incoming[i];
      this.incoming[i] = Number.isFinite(value)
        ? Math.min(Math.max(0, value), this.tuning.voices[ENVIRONMENT_AMBIENCE_KINDS[i]].peakGain) : 0;
      sum += this.incoming[i];
    }
    const trim = sum > this.tuning.maximumTotalGain ? this.tuning.maximumTotalGain / sum : 1;
    const now = this.context.currentTime;
    for (let i = 0; i < this.gains.length; i += 1) {
      const target = this.incoming[i] * trim;
      if (target === this.previous[i]) continue;
      this.previous[i] = target;
      this.gains[i].gain.setTargetAtTime(target, now, this.tuning.parameterGlideSeconds);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const source = this.source;
    if (source) {
      if (this.started) {
        try { source.stop(); } catch { /* Context may already be closing. */ }
      }
      source.onended = null;
      source.buffer = null;
    }
    for (const node of this.nodes) node.disconnect();
    this.nodes.length = 0;
    this.gains.length = 0;
    this.source = null;
    this.started = false;
    this.allocatedBufferBytes = 0;
  }

  private keep<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }
}
