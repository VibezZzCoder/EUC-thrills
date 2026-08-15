/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { AUDIO } from '../data/tuning.ts';
import type { AudioFrame, TransientCue } from './director.ts';
import { NOISE_SECONDS, fillNoise } from './noise.ts';

/**
 * The Web Audio graph. **This file makes no decisions.**
 *
 * Everything about what the game should sound like was settled by
 * `audio/director.ts`, which runs headlessly; this builds the nodes that
 * realise it and does nothing else. The split is the same one
 * `render/chaseCamera.ts` keeps against three.js, for the same reason: the
 * decisions stay testable and the platform layer stays small enough to read
 * in one sitting.
 *
 * **Two graphs, not one.** The ride bed — motor, wind, tyre, and scrape —
 * is permanent: its nodes are built once at arm time and live until disposal,
 * because they are always sounding and starting an oscillator is not free.
 * One-shots are built per cue and torn down on `ended`, because there is no
 * such thing as a landing that is always happening. Transients deliberately
 * bypass the bed's duck gain, so an impact is not attenuated by the duck it
 * itself asked for.
 *
 * Disposal is explicit and complete (AGENTS.md invariant 10): every node this
 * file creates is either held in `permanent` or registered in `voices`, and
 * `dispose` empties both before closing the context.
 */

/** How many one-shots may sound at once. */
const MAX_VOICES = 24;

/** Web Audio cannot ramp to zero exponentially; this is practical silence. */
const SILENT = 0.0001;

export interface SinkCounts {
  /** Permanent graph nodes. Constant after arming — the leak audit reads it. */
  readonly permanentNodes: number;
  /** One-shots currently sounding. */
  readonly voices: number;
  /** One-shots refused because the voice cap was already full. */
  readonly droppedVoices: number;
  /**
   * Crash voices that actually started the owner's *recording* — counted at
   * the `AudioBufferSourceNode`, after the voice cap and after the bank check,
   * so it is zero whenever the synthesized fallback sounded instead. The
   * director-side `played.crash` counter cannot make that distinction (M10
   * QA, F3): it increments identically for the fallback, before the sink is
   * even asked.
   */
  readonly crashSamplePlays: number;
  /**
   * Over-speed beeps that started the *recording* — M20, and it exists for
   * exactly the reason `crashSamplePlays` does. `played.overspeed` on the
   * director side counts the decision to warn and increments identically when
   * the synthesized fallback sounds instead, so it cannot answer "is the
   * player hearing the wheel's own alarm". This can.
   */
  readonly overspeedSamplePlays: number;
  /**
   * Whose recording the last one started (M14.5), or `null` before the first.
   *
   * `crashSamplePlays` counts both riders identically — it is counted at the
   * source node, and both riders have one. So the only way a test can prove
   * that *choosing* a rider changed what is heard is for the sink to say which
   * buffer it reached for, at the moment it reached for it.
   */
  readonly lastCrashVoice: CrashVoiceId | null;
}

/** One motor partial: an oscillator and its own gain, before the shared filter. */
interface Partial {
  readonly osc: OscillatorNode;
  readonly gain: GainNode;
}

/** One tyre slot: a looping noise source split into a texture and a body band. */
interface TyreSlot {
  readonly source: AudioBufferSourceNode;
  readonly band: BiquadFilterNode;
  readonly bandGain: GainNode;
  readonly body: BiquadFilterNode;
  readonly bodyGain: GainNode;
  /** The recorded offroad loop's gain. Exists from construction, at zero. */
  readonly sampleGain: GainNode;
  /** The toko rotation loop's gain. Also eager, also zero until the bank. */
  readonly tokoGain: GainNode;
  /** The loops themselves, created when the sample bank lands. */
  sample: AudioBufferSourceNode | null;
  toko: AudioBufferSourceNode | null;
}

/**
 * The decoded recordings the graph plays instead of synthesis where the owner
 * approved one. Loaded by the engine after arming; every voice has a
 * synthesized fallback until then, so a slow network changes the timbre of the
 * first seconds and nothing else.
 */
export interface SampleBank {
  /** The approved offroad tyre loop (dirt and gravel). */
  readonly tyreOffroad: AudioBuffer;
  /** The approved toko rotation loop (the solid surfaces' faint tick). */
  readonly tyreSolid: AudioBuffer;
  /** The approved wind howl loop. */
  readonly windHowl: AudioBuffer;
  /** The owner's own wipeout recording — Cool Rider's crash. */
  readonly crash: AudioBuffer;
  /** Trollina's, and the same length to the sample (M14.5). */
  readonly crashTrollina: AudioBuffer;
  /**
   * Red Rider's (M19) — **required since Phase 4 shipped his file.**
   *
   * It was optional while `tools/make-crash-red-rider.mjs` had not been run,
   * so that his wiring could be proved live before his recording existed. It is
   * required now for the opposite reason: with a fallback in place, forgetting
   * to put this buffer in the bank is silent — he keeps crashing to the owner's
   * voice while `lastCrashVoice` still says `red-rider`, which is the one
   * failure this milestone must not ship. Required, and the compiler is what
   * notices.
   */
  readonly crashRedRider: AudioBuffer;
  /** The chase siren's far wail loop (M18). */
  readonly sirenFar: AudioBuffer;
  /** And its close wail, crossfaded in by range. */
  readonly sirenClose: AudioBuffer;
  /**
   * The max-speed warning beep (M20) — 75 ms, 2565 Hz.
   *
   * **Required, like `crashRedRider` and for the same reason**: there is a
   * synthesized fallback, so forgetting to put this in the bank would be
   * silent — the wheel would go on warning at the wrong timbre while every
   * counter said the system was working. Required, and the compiler notices.
   */
  readonly overspeedBeep: AudioBuffer;
}

/**
 * Which crash recording plays.
 *
 * **Declared here rather than imported from `data/riders.ts`**, and that is the
 * layering rule rather than duplication for its own sake: everything under
 * `audio/` except `samples.ts` runs headlessly under `node --test` with no
 * bundler and no DOM, and it stays that way by owing nothing to `app/`,
 * `data/`, or `ui/`. The composition root maps one to the other, which is the
 * same route `quality` and `speedUnit` already take out of the options store.
 */
export type CrashVoiceId = 'cool-rider' | 'trollina' | 'red-rider';

/**
 * Whose recording plays.
 *
 * A `switch` rather than the ternary this replaces, and the reason is the third
 * rider: a chain of ternaries over a growing union is the shape that silently
 * gives a new rider somebody else's voice, because nothing fails when a case is
 * missing. Here the compiler's exhaustiveness check on `voice` is what fails
 * instead — add a `CrashVoiceId` without a case and this stops compiling.
 *
 * Three riders, three buffers, no fallback left anywhere in the function. That
 * is a Phase 4 change: while Red Rider's file was still to be built this
 * returned Cool Rider's on his behalf, and `lastCrashVoice` reporting
 * `red-rider` regardless is what let a test tell the two states apart.
 */
export function crashFor(voice: CrashVoiceId, bank: SampleBank): AudioBuffer {
  switch (voice) {
    case 'trollina':
      return bank.crashTrollina;
    case 'red-rider':
      return bank.crashRedRider;
    case 'cool-rider':
      return bank.crash;
  }
}

export class WebAudioSink {
  private readonly context: AudioContext;

  /** Everything created once, in creation order, for a complete teardown. */
  private readonly permanent: AudioNode[] = [];
  /** Sources that must be stopped as well as disconnected. */
  private readonly permanentSources: AudioScheduledSourceNode[] = [];
  /** Live one-shots, so a dispose mid-crash does not leave nodes running. */
  private readonly voices = new Set<AudioScheduledSourceNode>();
  private droppedVoices = 0;

  // -- Buses ----------------------------------------------------------------
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly sfxBus: GainNode;
  private readonly uiBus: GainNode;
  /**
   * Declared and connected with no source at M8.
   *
   * `docs/PLANS.md` §8.3 names three buses, and music direction is explicitly
   * not locked (the vision, §20). The bus exists so that the first music
   * source is a connection rather than a second pass over every volume
   * calculation in the game — and so the M9 options screen has three faders to
   * wire, not two and a promise.
   */
  private readonly musicBus: GainNode;
  /** The ride bed, after ducking. Transients deliberately do not pass through. */
  private readonly bed: GainNode;
  private readonly transientTrim: GainNode;

  // -- The permanent ride ---------------------------------------------------
  //
  // **Four oscillators, no LFOs, and nothing detuned.** Every one of them runs
  // at an exact integer multiple of the same fundamental, so the motor is one
  // harmonic series rather than four voices, and there is no amplitude
  // modulation anywhere in the bed. See rules 1 and 4 at the top of the `AUDIO`
  // group for why both of those are constraints rather than preferences.
  private readonly motorDrive: Partial;
  private readonly motorSing: Partial;
  private readonly motorAir: Partial;
  private readonly regen: Partial;
  private readonly motorFilter: BiquadFilterNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  /** The pink-noise wind fallback, silenced when the howl loop arrives. */
  private readonly windNoise: AudioBufferSourceNode;
  private readonly tyre: [TyreSlot, TyreSlot];
  private bank: SampleBank | null = null;
  /** Which playback-rate offset the next crash sample takes. Deterministic. */
  private crashIndex = 0;
  /** Whose crash plays. Set by the engine, which replays it on every arm. */
  private crashVoice: CrashVoiceId = 'cool-rider';
  /** Crash voices that started the recording, not the fallback. See `SinkCounts`. */
  private crashSamplePlays = 0;
  /** Over-speed beeps that started the recording rather than the fallback. */
  private overspeedSamplePlays = 0;
  private lastCrashVoice: CrashVoiceId | null = null;
  private readonly scrapeFilter: BiquadFilterNode;
  private readonly scrapeGain: GainNode;
  private readonly scrapeRingLow: OscillatorNode;
  private readonly scrapeRingGain: GainNode;
  /**
   * The siren's two loop gains (M18). Eager like the tyre's sample gains —
   * they exist from construction at zero so `applyFrame` can always write
   * them; the loops themselves wait for the bank. No synthesized fallback:
   * before the recordings land the chase simply runs without a siren, which
   * is what it did for its whole first day.
   */
  private readonly sirenFarGain: GainNode;
  private readonly sirenCloseGain: GainNode;
  private sirenFar: AudioBufferSourceNode | null = null;
  private sirenClose: AudioBufferSourceNode | null = null;

  // -- Shared buffers -------------------------------------------------------
  private readonly whiteBuffer: AudioBuffer;
  private readonly pinkBuffer: AudioBuffer;
  /**
   * Rotates the start offset of each noise burst.
   *
   * Deterministic — it advances by one per cue — but never the same twice in a
   * row, which is what stops six landings in a row from being audibly the same
   * recording played six times. Fixed offsets are the classic tell that a game
   * is synthesising rather than sampling.
   */
  private burstIndex = 0;

  /** Created on first `outputLevel()` or `outputSpectrum()`. See the note there. */
  private analyser: AnalyserNode | null = null;
  // Backed by an explicit `ArrayBuffer` because `getFloatTimeDomainData` will
  // not accept a view that might be over a `SharedArrayBuffer`.
  private analyserData: Float32Array<ArrayBuffer> | null = null;
  private spectrumData: Float32Array<ArrayBuffer> | null = null;

  private disposed = false;

  constructor(context: AudioContext) {
    this.context = context;
    const rate = context.sampleRate;
    const length = Math.max(1, Math.floor(rate * NOISE_SECONDS));

    this.whiteBuffer = context.createBuffer(1, length, rate);
    fillNoise(this.whiteBuffer.getChannelData(0), 0x5eed, 'white');
    this.pinkBuffer = context.createBuffer(1, length, rate);
    fillNoise(this.pinkBuffer.getChannelData(0), 0xc0ffee, 'pink');

    // -- Output chain, built from the destination backwards -----------------
    this.limiter = this.keep(context.createDynamicsCompressor());
    this.limiter.threshold.value = AUDIO.limiterThresholdDb;
    this.limiter.knee.value = AUDIO.limiterKneeDb;
    this.limiter.ratio.value = AUDIO.limiterRatio;
    this.limiter.attack.value = AUDIO.limiterAttackSeconds;
    this.limiter.release.value = AUDIO.limiterReleaseSeconds;
    this.limiter.connect(context.destination);

    this.master = this.keep(context.createGain());
    this.master.gain.value = 1;
    this.master.connect(this.limiter);

    this.sfxBus = this.keep(context.createGain());
    this.uiBus = this.keep(context.createGain());
    this.musicBus = this.keep(context.createGain());
    this.sfxBus.connect(this.master);
    this.uiBus.connect(this.master);
    this.musicBus.connect(this.master);

    this.bed = this.keep(context.createGain());
    this.bed.gain.value = 0;
    this.bed.connect(this.sfxBus);

    this.transientTrim = this.keep(context.createGain());
    this.transientTrim.gain.value = AUDIO.transientTrim;
    this.transientTrim.connect(this.sfxBus);

    // -- Motor: one harmonic series through one filter -----------------------
    //
    // The filter is the expressive part. Its cutoff and its Q are both written
    // every frame — load opens it, braking closes it and lifts the Q into a
    // resonant peak — and between them they carry everything the player is
    // told about how hard the machine is working. The first pass carried that
    // in a modulated sub-octave instead, which is how an engine is built and
    // is exactly what the owner heard when he rode it.
    this.motorFilter = this.keep(context.createBiquadFilter());
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = AUDIO.motorCutoffAtRest;
    this.motorFilter.Q.value = AUDIO.motorFilterQ;
    this.motorFilter.connect(this.bed);

    // Sine fundamental, triangle third, sine sixth. The triangle is the only
    // waveform here with harmonics of its own, and they are weak ones — a
    // sawtooth at a 140 Hz fundamental is two dozen equally-spaced partials,
    // which is a chainsaw.
    this.motorDrive = this.createPartial('sine', AUDIO.motorIdleHz, this.motorFilter);
    this.motorSing = this.createPartial(
      'triangle',
      AUDIO.motorIdleHz * AUDIO.motorSingHarmonic,
      this.motorFilter,
    );
    this.motorAir = this.createPartial(
      'sine',
      AUDIO.motorIdleHz * AUDIO.motorAirHarmonic,
      this.motorFilter,
    );

    // Regen goes *through* the filter rather than around it, because the sweep
    // is the effect: a partial routed past the filter would be a second voice
    // singing an interval, which is what this used to be.
    this.regen = this.createPartial(
      'sine',
      AUDIO.motorIdleHz * AUDIO.regenHarmonic,
      this.motorFilter,
    );

    // -- Wind: pink noise through a bandpass that opens with speed ----------
    this.windFilter = this.keep(context.createBiquadFilter());
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = AUDIO.windCutoffAtRest;
    this.windFilter.Q.value = AUDIO.windQ;
    this.windGain = this.keep(context.createGain());
    this.windGain.gain.value = 0;
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.bed);
    // Held, unlike every other loop: `setSampleBank` stops this one when the
    // approved howl recording takes over the same filter chain.
    this.windNoise = this.createLoop(this.pinkBuffer, this.windFilter);

    // -- Tyre: two crossfaded slots, each a texture band and a body band ----
    //
    // Pink noise and filters only. White noise made grass read as a loud hiss
    // even after its model gain came down; pink retains the surface texture
    // while moving its sustained energy under the ear-sensitive hiss band.
    // There was a tread LFO here modulating both band
    // gains at the wheel's rotation rate; it is gone, and nothing has replaced
    // it, because the tyre is the voice that plays continuously for minutes and
    // amplitude modulation on a continuous voice is a wasp (rule 4).
    this.tyre = [this.createTyreSlot(), this.createTyreSlot()];

    // -- Pedal scrape: sharp filtered noise plus one restrained ring --------
    this.scrapeFilter = this.keep(context.createBiquadFilter());
    this.scrapeFilter.type = 'bandpass';
    this.scrapeFilter.frequency.value = AUDIO.scrapeCentreHz;
    this.scrapeFilter.Q.value = AUDIO.scrapeQ;
    this.scrapeGain = this.keep(context.createGain());
    this.scrapeGain.gain.value = 0;
    this.scrapeFilter.connect(this.scrapeGain);
    this.scrapeGain.connect(this.bed);
    this.createLoop(this.whiteBuffer, this.scrapeFilter);

    this.scrapeRingGain = this.keep(context.createGain());
    this.scrapeRingGain.gain.value = 0;
    this.scrapeRingGain.connect(this.bed);
    this.scrapeRingLow = this.keep(context.createOscillator());
    this.scrapeRingLow.type = 'sine';
    this.scrapeRingLow.frequency.value = AUDIO.scrapeRingHz;
    this.scrapeRingLow.connect(this.scrapeRingGain);
    this.startSource(this.scrapeRingLow);

    // -- Siren: two recorded loops crossfaded by the director (M18) ---------
    //
    // Into the bed, deliberately: the siren is part of the ride, so the pause
    // fade, the ducking, and the crash duck all handle it without knowing it
    // exists — a crash with the cop on you ducks his siren along with the
    // motor, which is right, because at that moment the crash is the thing
    // worth hearing.
    this.sirenFarGain = this.keep(context.createGain());
    this.sirenFarGain.gain.value = 0;
    this.sirenFarGain.connect(this.bed);
    this.sirenCloseGain = this.keep(context.createGain());
    this.sirenCloseGain.gain.value = 0;
    this.sirenCloseGain.connect(this.bed);
  }

  get counts(): SinkCounts {
    return {
      permanentNodes: this.permanent.length,
      voices: this.voices.size,
      droppedVoices: this.droppedVoices,
      crashSamplePlays: this.crashSamplePlays,
      overspeedSamplePlays: this.overspeedSamplePlays,
      lastCrashVoice: this.lastCrashVoice,
    };
  }

  get samplesLoaded(): boolean {
    return this.bank !== null;
  }

  /**
   * Install the decoded recordings. Once, shortly after arming.
   *
   * Eight changes to the permanent graph, all additive except one: each tyre
   * slot grows a looping offroad source *and* a looping toko source feeding
   * the gains it was built with, and the wind's pink-noise fallback is
   * stopped in favour of the howl loop through an asset-trim gain into the
   * same filter — so the speed sweep the filter carries applies to the
   * recording exactly as it did to the noise. The siren's two loops (M18)
   * start into the gains built at construction. The crash buffer is kept for
   * `play` to voice. `permanentNodes` rises by eight and then holds, which
   * the leak audit accounts for by measuring after this lands.
   */
  setSampleBank(bank: SampleBank): void {
    if (this.disposed || this.bank !== null) return;
    this.bank = bank;
    for (let index = 0; index < 2; index += 1) {
      const slot = this.tyre[index];
      const source = this.keep(this.context.createBufferSource());
      source.buffer = bank.tyreOffroad;
      source.loop = true;
      // Half the loop apart, so the two slots never play the same instant of
      // the recording in unison during a dirt-to-gravel crossfade.
      source.connect(slot.sampleGain);
      this.permanentSources.push(source);
      source.start(0, index === 0 ? 0 : bank.tyreOffroad.duration / 2);
      slot.sample = source;

      // The toko loop, likewise — the half-loop offset lands the two slots on
      // opposite tick phases, so a pavement-to-brick crossfade does not
      // double every tap for a fifth of a second.
      const toko = this.keep(this.context.createBufferSource());
      toko.buffer = bank.tyreSolid;
      toko.loop = true;
      toko.connect(slot.tokoGain);
      this.permanentSources.push(toko);
      toko.start(0, index === 0 ? 0 : bank.tyreSolid.duration / 2);
      slot.toko = toko;
    }
    this.windNoise.stop();
    this.windNoise.disconnect();
    // Through an asset trim, so `windLevel` keeps meaning what it meant when
    // it was tuned against pink noise — the recording is RMS-matched about
    // 7 dB below the noise it replaces. See `AUDIO.windSampleTrim`.
    const windTrim = this.keep(this.context.createGain());
    windTrim.gain.value = AUDIO.windSampleTrim;
    windTrim.connect(this.windFilter);
    this.createLoop(bank.windHowl, windTrim);

    // The siren's loops (M18), into the gains built at construction. No
    // start offset between them: they crossfade rather than sum, and each
    // recording's own sweep phase is its identity.
    this.sirenFar = this.createLoop(bank.sirenFar, this.sirenFarGain);
    this.sirenClose = this.createLoop(bank.sirenClose, this.sirenCloseGain);
  }

  /** Bus gains, already through the volume curve. See `mix.busGain`. */
  setBusGains(sfx: number, ui: number, music: number): void {
    if (this.disposed) return;
    const now = this.context.currentTime;
    this.glide(this.sfxBus.gain, sfx, now);
    this.glide(this.uiBus.gain, ui, now);
    this.glide(this.musicBus.gain, music, now);
  }

  /**
   * Push one frame of the director's decisions into the graph.
   *
   * Every write is a glide rather than an assignment. A parameter that only
   * updates on the render frame and is written directly is a staircase, and a
   * staircase in a gain is a buzz — the one artefact a listener notices
   * instantly and can never un-notice.
   */
  applyFrame(frame: AudioFrame): void {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const bed = frame.bedGain;

    this.glide(this.bed.gain, bed, now);

    this.glide(this.motorDrive.osc.frequency, frame.motorHz, now);
    this.glide(this.motorDrive.gain.gain, frame.motorDriveGain, now);
    this.glide(this.motorSing.osc.frequency, frame.motorSingHz, now);
    this.glide(this.motorSing.gain.gain, frame.motorSingGain, now);
    this.glide(this.motorAir.osc.frequency, frame.motorAirHz, now);
    this.glide(this.motorAir.gain.gain, frame.motorAirGain, now);
    this.glide(this.regen.osc.frequency, frame.regenHz, now);
    this.glide(this.regen.gain.gain, frame.regenGain, now);
    this.glide(this.motorFilter.frequency, frame.motorCutoffHz, now);
    this.glide(this.motorFilter.Q, frame.motorQ, now);

    this.glide(this.windGain.gain, frame.windGain, now);
    this.glide(this.windFilter.frequency, frame.windCutoffHz, now);

    for (let index = 0; index < 2; index += 1) {
      const slot = this.tyre[index];
      const target = frame.tyre[index];
      this.glide(slot.bandGain.gain, target.gain, now);
      this.glide(slot.band.frequency, target.centreHz, now);
      this.glide(slot.band.Q, target.q, now);
      this.glide(slot.bodyGain.gain, target.gain * target.lowGain, now);
      this.glide(slot.body.frequency, target.lowHz, now);
      this.glide(slot.sampleGain.gain, target.sampleGain, now);
      if (slot.sample) this.glide(slot.sample.playbackRate, target.sampleRate, now);
      this.glide(slot.tokoGain.gain, target.tokoGain, now);
      if (slot.toko) this.glide(slot.toko.playbackRate, target.tokoRate, now);
    }

    this.glide(this.scrapeGain.gain, frame.scrapeGain, now);
    this.glide(this.scrapeFilter.frequency, frame.scrapeCentreHz, now);
    this.glide(this.scrapeRingGain.gain, frame.scrapeRingGain, now);
    this.glide(this.scrapeRingLow.frequency, frame.scrapeRingHz, now);

    this.glide(this.sirenFarGain.gain, frame.sirenFarGain, now);
    this.glide(this.sirenCloseGain.gain, frame.sirenCloseGain, now);
    if (this.sirenFar) this.glide(this.sirenFar.playbackRate, frame.sirenRate, now);
    if (this.sirenClose) this.glide(this.sirenClose.playbackRate, frame.sirenRate, now);
  }

  /**
   * Realise one one-shot.
   *
   * Nodes are created here and destroyed on `ended`, rather than pooled. A
   * pool would save an allocation on an event that happens a few times a
   * second at most, and would cost a scheduling problem — a pooled voice
   * reused before its release has finished is a click, and knowing when that
   * is safe means duplicating the envelope's own timing in a second place.
   */
  play(cue: TransientCue): void {
    if (this.disposed) return;
    if (this.voices.size >= MAX_VOICES) {
      this.droppedVoices += 1;
      return;
    }
    const at = this.context.currentTime + Math.max(0, cue.delaySeconds);
    const destination = cue.bus === 'ui' ? this.uiBus : this.transientTrim;

    // A crash is a recording once the bank is loaded — the owner's own wipeout
    // for Cool Rider, Trollina's cartoon one for her, and that same wipeout
    // with the owner's voice scrubbed out of it for Red Rider — and the
    // synthesized thump-and-burst below remains the fallback before it. **All
    // three buffers are loaded up front and the choice is made here**, at the
    // last possible moment: the bank is once-only by construction
    // (`setSampleBank` refuses a second) and `decodeAudioData` detaches its
    // input, so a design that fetched a rider's crash when the player picked
    // them would have to relax three separate guards to save 600 KB against an
    // 8 MiB budget.
    if (cue.kind === 'crash' && this.bank) {
      const buffer = crashFor(this.crashVoice, this.bank);
      this.lastCrashVoice = this.crashVoice;
      this.playCrashSample(buffer, cue, at, destination);
      return;
    }

    // The over-speed warning is a recording too, on the crash's exact terms —
    // M20. **No rate rotation and no variation of any kind**, unlike the crash
    // above: the whole message of this cue is its *rate of repetition*, and a
    // pitch that wandered from beep to beep would be a second variable moving
    // underneath the one the player is being asked to read. It is also the one
    // sound in the game that plays nine times a second, which is the worst
    // possible place for a detune.
    if (cue.kind === 'overspeed' && this.bank) {
      this.playSampleOnce(this.bank.overspeedBeep, cue, at, destination);
      this.overspeedSamplePlays += 1;
      return;
    }

    if (cue.toneSeconds > 0 && cue.toneHz > 0) this.playTone(cue, at, destination);
    if (cue.thumpSeconds > 0 && cue.thumpFromHz > 0) this.playThump(cue, at, destination);
    if (cue.noiseSeconds > 0 && cue.noiseHz > 0) this.playBurst(cue, at, destination);
  }

  /** Choose whose crash the next one is. Cheap, and safe at any time. */
  setCrashVoice(voice: CrashVoiceId): void {
    if (!this.disposed) this.crashVoice = voice;
  }

  /**
   * RMS of what is actually leaving the master bus, right now.
   *
   * **Durable tooling, not a debug leftover** (master §16.1), and the only
   * measurement in this project that can distinguish "the model is right" from
   * "the game is making a sound". Every other piece of audio evidence is
   * upstream of the graph: a director frame proves what *should* be playing,
   * and a node count proves the graph exists, but a single missing `connect`
   * would satisfy both while the game sits in silence.
   *
   * The analyser is created on first use and tapped off the limiter's output
   * rather than inserted into the chain, so a player who never asks pays
   * nothing and the signal path is identical either way.
   *
   * It reads the audio clock, not the simulation clock — the two are
   * independent, so a caller has to let real milliseconds pass after changing
   * the mix before the number means anything.
   */
  outputLevel(): number {
    if (this.disposed) return 0;
    const analyser = this.tapAnalyser();
    const data = this.analyserData;
    if (!analyser || !data) return 0;
    analyser.getFloatTimeDomainData(data);
    let total = 0;
    for (let i = 0; i < data.length; i += 1) total += data[i] * data[i];
    return Math.sqrt(total / data.length);
  }

  /**
   * The magnitude spectrum of the master bus, in dBFS per bin.
   *
   * **The arcade rule, made measurable.** Rules 1, 2 and 4 of the `AUDIO`
   * group are all statements about the *shape* of the spectrum — nothing beats,
   * nothing sustained sits above 1.5 kHz, nothing pulses — and none of them can
   * be checked from a director frame, because a frame says what should be
   * playing and not what the graph made of it. The first pass shipped a
   * carrier 66 dB clear of its neighbours while every headless test passed.
   *
   * Same analyser as `outputLevel`, tapped off the limiter's output and
   * created on first use, so a player who never asks pays nothing. Reads the
   * audio clock: let real milliseconds pass after changing the mix before
   * trusting it.
   */
  outputSpectrum(): { readonly binHz: number; readonly db: Float32Array } | null {
    if (this.disposed) return null;
    const analyser = this.tapAnalyser();
    const data = this.spectrumData;
    if (!analyser || !data) return null;
    analyser.getFloatFrequencyData(data);
    return { binHz: this.context.sampleRate / analyser.fftSize, db: data };
  }

  private tapAnalyser(): AnalyserNode | null {
    if (this.disposed) return null;
    if (!this.analyser) {
      const analyser = this.keep(this.context.createAnalyser());
      analyser.fftSize = 2048;
      // Averaged over a few blocks: a single block of a 22 Hz fundamental is
      // less than one cycle, and the question being asked here is about
      // sustained content rather than about any one instant.
      analyser.smoothingTimeConstant = 0.6;
      // Off the *limiter*, not the master (M10 QA, F3): the limiter is the
      // last node before the destination, so this is the only tap that
      // measures what actually reaches the speakers. A pre-limiter tap
      // overstates any level the limiter is pulling down, which is precisely
      // the loud-crash case the level rung exists to vouch for.
      this.limiter.connect(analyser);
      this.analyser = analyser;
      this.analyserData = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.spectrumData = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    }
    return this.analyser;
  }

  /** Silence every one-shot at once. Quick reset, and the pause before it. */
  stopAllVoices(): void {
    for (const voice of [...this.voices]) {
      try {
        voice.stop();
      } catch {
        // Already stopped: `ended` has fired or is about to, and the handler
        // below is what actually removes it from the set.
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAllVoices();
    this.voices.clear();
    for (const source of this.permanentSources) {
      try {
        source.stop();
      } catch {
        // A source that never started, or a context already closing.
      }
      source.onended = null;
    }
    for (const node of this.permanent) node.disconnect();
    this.permanent.length = 0;
    this.permanentSources.length = 0;
    this.analyser = null;
    this.analyserData = null;
    this.spectrumData = null;
  }

  // -------------------------------------------------------------------------
  // Construction helpers
  // -------------------------------------------------------------------------

  /** Register a permanent node so `dispose` can reach it. */
  private keep<T extends AudioNode>(node: T): T {
    this.permanent.push(node);
    return node;
  }

  private startSource<T extends AudioScheduledSourceNode>(source: T): T {
    this.permanentSources.push(source);
    source.start();
    return source;
  }

  private createPartial(
    type: OscillatorType,
    hz: number,
    destination: AudioNode,
  ): Partial {
    const osc = this.keep(this.context.createOscillator());
    osc.type = type;
    osc.frequency.value = hz;
    const gain = this.keep(this.context.createGain());
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(destination);
    this.startSource(osc);
    return { osc, gain };
  }

  private createLoop(buffer: AudioBuffer, destination: AudioNode): AudioBufferSourceNode {
    const source = this.keep(this.context.createBufferSource());
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    this.startSource(source);
    return source;
  }

  private createTyreSlot(): TyreSlot {
    const context = this.context;
    const band = this.keep(context.createBiquadFilter());
    band.type = 'bandpass';
    band.frequency.value = 1000;
    band.Q.value = 1;
    const bandGain = this.keep(context.createGain());
    bandGain.gain.value = 0;
    band.connect(bandGain);
    bandGain.connect(this.bed);

    const body = this.keep(context.createBiquadFilter());
    body.type = 'lowpass';
    body.frequency.value = 200;
    body.Q.value = 0.7;
    const bodyGain = this.keep(context.createGain());
    bodyGain.gain.value = 0;
    body.connect(bodyGain);
    bodyGain.connect(this.bed);

    // One source feeding both bands, so the texture and the body are the same
    // noise heard two ways rather than two unrelated hisses that beat together.
    const source = this.keep(context.createBufferSource());
    source.buffer = this.pinkBuffer;
    source.loop = true;
    source.connect(band);
    source.connect(body);
    this.startSource(source);

    // The recorded layer's gain exists from construction so `applyFrame` can
    // always write it; the loop itself waits for the bank.
    const sampleGain = this.keep(context.createGain());
    sampleGain.gain.value = 0;
    sampleGain.connect(this.bed);

    const tokoGain = this.keep(context.createGain());
    tokoGain.gain.value = 0;
    tokoGain.connect(this.bed);

    return { source, band, bandGain, body, bodyGain, sampleGain, tokoGain, sample: null, toko: null };
  }

  // -------------------------------------------------------------------------
  // One-shot synthesis
  // -------------------------------------------------------------------------

  private playCrashSample(
    buffer: AudioBuffer,
    cue: TransientCue,
    at: number,
    destination: AudioNode,
  ): void {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = buffer;
    // Deterministic rate rotation — native, then a shade up, then a shade
    // down — so back-to-back crashes are not audibly the same take. Small,
    // because the recording's beeps are pitched.
    const offset = this.crashIndex % 3 === 0 ? 0 : this.crashIndex % 3 === 1 ? 1 : -1;
    this.crashIndex += 1;
    const rate = 1 + AUDIO.crashSampleRateSpread * offset;
    source.playbackRate.value = rate;

    const gain = context.createGain();
    const level = cue.gain * AUDIO.crashSampleTrim;
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.008);

    source.connect(gain);
    gain.connect(destination);
    // The recording carries its own fade-out (make-loop's --oneshot), so it
    // ends itself; the stop is the register's teardown moment, just past it.
    this.launch(source, at, at + buffer.duration / rate + 0.05, [gain]);
    this.crashSamplePlays += 1;
  }

  /**
   * A recording, once, at its own rate — M20.
   *
   * `playCrashSample`'s plain sibling, and separate rather than a flag on it
   * because everything interesting in that method is the crash's: the rate
   * rotation, the trim constant, and the counter a spec reads to tell a real
   * take from the synthesized fallback. What is left here is the part that is
   * genuinely generic — a buffer, an attack, and a teardown — and keeping the
   * two apart is what stops the over-speed beep from silently acquiring the
   * crash's detune the next time somebody tunes it.
   */
  private playSampleOnce(
    buffer: AudioBuffer,
    cue: TransientCue,
    at: number,
    destination: AudioNode,
  ): void {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = buffer;

    const gain = context.createGain();
    gain.gain.setValueAtTime(SILENT, at);
    // 3 ms rather than the crash's 8: the recording's own attack is 10 ms and
    // measured off the reference, and a slower ramp on top of it would round
    // the one part of this sound that says "now".
    gain.gain.linearRampToValueAtTime(cue.gain, at + 0.003);

    source.connect(gain);
    gain.connect(destination);
    this.launch(source, at, at + buffer.duration + 0.03, [gain]);
  }

  private playTone(cue: TransientCue, at: number, destination: AudioNode): void {
    const context = this.context;
    const osc = context.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(cue.toneHz, at);

    // A raw square at 1.5 kHz is all fizz above the fourth harmonic. The
    // lowpass keeps the piezo character a real wheel has and loses the rest.
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = AUDIO.beepCutoffHz;

    const gain = context.createGain();
    const end = at + cue.toneSeconds;
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.linearRampToValueAtTime(cue.gain, at + AUDIO.beepAttackSeconds);
    gain.gain.setValueAtTime(cue.gain, end);
    gain.gain.exponentialRampToValueAtTime(SILENT, end + AUDIO.beepReleaseSeconds);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    this.launch(osc, at, end + AUDIO.beepReleaseSeconds, [filter, gain]);
  }

  private playThump(cue: TransientCue, at: number, destination: AudioNode): void {
    const context = this.context;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(cue.thumpFromHz, at);
    // Exponential rather than linear: pitch is perceived logarithmically, so a
    // linear sweep spends most of its time in the bottom few hertz and sounds
    // like a drop rather than a hit.
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(SILENT, cue.thumpToHz),
      at + cue.thumpSeconds,
    );

    const gain = context.createGain();
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.linearRampToValueAtTime(cue.gain, at + 0.004);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + cue.thumpSeconds);

    osc.connect(gain);
    gain.connect(destination);
    this.launch(osc, at, at + cue.thumpSeconds, [gain]);
  }

  private playBurst(cue: TransientCue, at: number, destination: AudioNode): void {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = this.whiteBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cue.noiseHz;
    filter.Q.value = cue.noiseQ;

    const gain = context.createGain();
    gain.gain.setValueAtTime(SILENT, at);
    gain.gain.linearRampToValueAtTime(cue.gain, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(SILENT, at + cue.noiseSeconds);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    // Deterministic but never twice in a row: six landings in a row must not
    // be audibly the same recording six times.
    this.burstIndex += 1;
    const duration = this.whiteBuffer.duration;
    const offset = (this.burstIndex * 0.317) % Math.max(0.001, duration - cue.noiseSeconds);
    this.launchAt(source, at, offset, at + cue.noiseSeconds, [filter, gain]);
  }

  private launch(
    source: AudioScheduledSourceNode,
    at: number,
    stopAt: number,
    downstream: AudioNode[],
  ): void {
    this.register(source, downstream);
    source.start(at);
    source.stop(stopAt);
  }

  private launchAt(
    source: AudioBufferSourceNode,
    at: number,
    offset: number,
    stopAt: number,
    downstream: AudioNode[],
  ): void {
    this.register(source, downstream);
    source.start(at, offset);
    source.stop(stopAt);
  }

  /**
   * Hold a one-shot until it ends, then take its whole chain down.
   *
   * The `ended` handler is the disposal path for every node a cue creates
   * (AGENTS.md invariant 10). Without it a five-minute ride leaves a few
   * thousand orphaned filters attached to the bus, and the symptom is a slow
   * rise in audio-thread cost that looks like anything but a leak.
   */
  private register(source: AudioScheduledSourceNode, downstream: AudioNode[]): void {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      for (const node of downstream) node.disconnect();
      source.onended = null;
    };
  }

  /** Write a parameter as a glide. See the note on `applyFrame`. */
  private glide(param: AudioParam, value: number, now: number): void {
    // A NaN written to an AudioParam silences that node for the rest of the
    // session with no error anywhere, so it is refused at the boundary as well
    // as being ruled out upstream.
    if (!Number.isFinite(value)) return;
    param.setTargetAtTime(value, now, AUDIO.paramGlideSeconds);
  }
}
