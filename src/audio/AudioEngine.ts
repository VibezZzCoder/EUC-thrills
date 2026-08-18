/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { AUDIO } from '../data/tuning.ts';
import {
  AudioDirector,
  createRideAudioInput,
  type AudioTuning,
  type CueKind,
  type RideAudioInput,
} from './director.ts';
import { WebAudioSink, type CrashVoiceId, type SampleBank } from './sink.ts';
import { busGain, clamp01, type BusVolumes } from './mix.ts';
import type { SampleUrls } from './samples.ts';
import type { SurfaceId } from '../simulation/world.ts';

/**
 * The audio layer's composition root: context lifecycle, buses, volumes, and
 * the one place the director's decisions meet the browser.
 *
 * **The director runs whether or not there is a context, and that is
 * deliberate.** A browser that has not been touched yet, a tab with no audio
 * device, and a Playwright run all reach this file, and in every one of them
 * the model still has to be right — so the arithmetic advances regardless and
 * only the *sink* is conditional. It means `snapshot()` reports what the game
 * would be playing even in silence, which is what lets a browser spec assert
 * that motor pitch tracks speed without owning a microphone.
 *
 * **The context is created from a real user gesture and from nothing else**
 * (`docs/PLANS.md` §8.3). Constructing an `AudioContext` at boot produces one
 * stuck in `suspended` that Chrome logs a warning about, and every subsequent
 * `resume()` inherits that suspicion. Instead the engine listens for the
 * first pointer, key, or touch and builds everything then — which for this
 * game is the same moment the player first presses W, so nothing is lost.
 * The gesture listeners stay attached until the context has actually been
 * observed `running`, because on iOS — most reliably in a home-screen web
 * app — the gesture that builds the context is not always the gesture the
 * browser lets start it.
 */

/** What the QA bridge, the debug overlay, and the M9 options screen read. */
export interface AudioSnapshot {
  /** False when the browser has no Web Audio at all. */
  readonly supported: boolean;
  /** True once a real user gesture built the graph. */
  readonly armed: boolean;
  /** `running`, `suspended`, `closed`, or `unavailable` before arming. */
  readonly contextState: string;
  readonly muted: boolean;
  readonly volumes: BusVolumes;
  readonly sampleRate: number;
  /** Permanent graph nodes. Constant once samples load; the leak audit reads it. */
  readonly permanentNodes: number;
  /**
   * True once the approved recordings are decoded and installed. Until then
   * every sampled voice plays its synthesized fallback, so this is the flag a
   * spec waits on before measuring the spectrum the samples change.
   */
  readonly samplesLoaded: boolean;
  /** One-shots sounding right now, and how many the voice cap has refused. */
  readonly voices: number;
  readonly droppedVoices: number;
  /**
   * One-shots started since boot, by kind. Deterministic under `advance(n)`.
   *
   * These count the *director's* cues at the moment they are handed to the
   * sink — intent, not proof. `played.crash` in particular increments
   * identically whether the owner's recording or the synthesized fallback
   * sounds; `crashSamplePlays` below is the counter that can tell them apart.
   */
  readonly played: Readonly<Record<CueKind, number>>;
  /** Crash voices that started the owner's recording, counted in the sink. */
  readonly crashSamplePlays: number;
  /**
   * Over-speed beeps that started the shipped recording rather than the
   * synthesized fallback (M20) — `crashSamplePlays`' twin, and it answers the
   * one question `played.overspeed` cannot: is the player hearing the wheel's
   * own alarm, or the stand-in for it?
   */
  readonly overspeedSamplePlays: number;
  /** Whose crash recording started last, or null before the first (M14.5). */
  readonly lastCrashVoice: CrashVoiceId | null;
  /** Whose crash recording the next one will start. */
  readonly crashVoice: CrashVoiceId;

  // -- The model, reported whether or not anything is audible ---------------
  readonly bedGain: number;
  readonly duck: number;
  readonly motorHz: number;
  readonly motorGain: number;
  /**
   * The motor filter, which is where load and braking are actually heard.
   *
   * Reported because it is not inferable from anything else in this struct: a
   * wheel at 6 m/s dragging itself up the climb and one coasting at 6 m/s have
   * the same pitch and nearly the same gain, and the cutoff is the number that
   * tells them apart. Q above the resting value means regen braking.
   */
  readonly motorCutoffHz: number;
  readonly motorQ: number;
  readonly regenGain: number;
  readonly windGain: number;
  /** Both tyre slots summed — what the surface is actually contributing. */
  readonly tyreGain: number;
  /**
   * The `tyreAudio` id of the surface the wheel is on. Empty before the first.
   *
   * The voice the tyre is *on*, not the loudest slot: for the 0.2 s of a
   * crossfade the outgoing voice is still the louder one, and a standing wheel
   * has two silent slots and no louder one at all.
   */
  readonly tyreVoice: string;
  readonly scrapeGain: number;
  /**
   * Both siren loops summed (M18) — what the chase is contributing, on the
   * same "how loud, not how made" argument as `tyreGain`. Zero outside a
   * live pursuit, and reported whether or not anything is armed, which is
   * what lets a spec prove the siren follows the cop without a microphone.
   */
  readonly sirenGain: number;
  /** The shared Doppler rate. 1 when nobody is closing on anybody. */
  readonly sirenRate: number;
}

/**
 * `touchend` and `click` are not redundancy. WebKit's user-activation rules
 * for audio are stricter in a home-screen web app (`Add to Home Screen`,
 * standalone mode) than in the Safari tab the same page was tested in: a
 * `resume()` issued during `pointerdown`/`touchstart` can be refused there,
 * while the *end* of the same tap qualifies. Listening to both ends of the
 * gesture costs nothing — `arm()` is idempotent and the listeners retire once
 * the context is actually heard running.
 */
const GESTURES: readonly string[] = ['pointerdown', 'keydown', 'touchstart', 'touchend', 'click'];

/** Ceiling on the sub-steps one `update` may run. See the note in `update`. */
const MAX_MODEL_CHUNKS = 600;

type AudioContextConstructor = new () => AudioContext;

function resolveAudioContext(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export class AudioEngine {
  readonly director = new AudioDirector();
  /** Filled in place by the composition root each render frame. */
  readonly input: RideAudioInput = createRideAudioInput();

  private readonly target: Window | null;
  private context: AudioContext | null = null;
  private sink: WebAudioSink | null = null;
  private listening = false;
  private disposed = false;
  /**
   * True while the page has deliberately parked the context (hidden tab).
   * The recovery paths below must not fight that decision: an `interrupted`
   * or `suspended` state is only a fault when nobody asked for it.
   */
  private wantSuspended = false;

  private volumes: BusVolumes = DEFAULT_VOLUMES;
  private muted = false;

  /** Raw sample bytes, fetched at boot; decoded once a context exists. */
  private sampleData: Record<keyof SampleUrls, ArrayBuffer> | null = null;
  private samplesRequested = false;
  private decodeStarted = false;
  /** Whose crash plays. Survives an arm, a suspend, and a context loss. */
  private crashVoice: CrashVoiceId = 'cool-rider';

  private readonly played: Record<CueKind, number> = {
    hop: 0,
    landing: 0,
    curb: 0,
    crash: 0,
    recover: 0,
    beep: 0,
    swing: 0,
    hit: 0,
    overspeed: 0,
  };

  constructor(target: Window | null = typeof window === 'undefined' ? null : window) {
    this.target = target;
    this.listenForGesture();
  }

  get supported(): boolean {
    return resolveAudioContext() !== null;
  }

  get armed(): boolean {
    return this.sink !== null;
  }

  /**
   * Build the graph and start the context. **Call only from a user gesture.**
   *
   * Public as well as automatic, because the M9 options screen will want an
   * explicit "sound on" control and because a browser spec needs to arm audio
   * at a moment it chooses rather than whenever its first synthetic key
   * happens to land.
   *
   * Idempotent, and safe to call when the browser has no Web Audio: the game
   * is playable in silence, and a thrown constructor here would take the whole
   * ride down with it.
   */
  arm(): void {
    if (this.disposed || this.sink !== null) return;
    const Constructor = resolveAudioContext();
    if (!Constructor) return;

    try {
      const context = this.context ?? new Constructor();
      this.context = context;
      this.sink = new WebAudioSink(context);
      this.applyVolumes();
      // **Replayed, not assumed.** The sink does not exist until the first user
      // gesture, so a rider chosen on a menu before the player ever touched the
      // canvas would otherwise be silently dropped — the same reason
      // `applyVolumes` is here rather than only on the setter.
      this.sink.setCrashVoice(this.crashVoice);
      // Watch the context's own lifecycle, because iOS can take a running
      // context away without asking — see `onStateChange`. Same handler
      // reference every time, so a retried arm cannot double-register.
      context.addEventListener('statechange', this.onStateChange);
      // A context built inside a gesture usually starts running already; one
      // built just before the gesture landed does not, and the resume is what
      // covers the difference. An autoplay refusal is a policy decision, not
      // a fault — and the gesture listeners stay attached until the context is
      // actually heard running, so the next gesture retries. Removing them
      // here used to be safe in every tested browser, and is exactly what left
      // an iOS home-screen web app permanently silent: standalone WebKit can
      // refuse this first resume, and there was no listener left to try again.
      this.kick();
    } catch {
      // A context the browser refuses to construct at all. Stay silent and
      // keep playing; `supported` and `snapshot().armed` report the truth.
      this.sink = null;
      return;
    }
    this.installSamples();
  }

  /**
   * Drive the context toward `running`, unless the page deliberately parked
   * it. Safe to call at any time, from any state, any number of times.
   *
   * Every state other than `running` and `closed` is treated as resumable.
   * That wording is deliberate: iOS reports the non-standard `'interrupted'`
   * state (home-screen launch, ring/lock, an app switch), which a check
   * written as `state === 'suspended'` silently never matches — and TypeScript
   * cannot even name it, which is why the comparison is negative.
   */
  private kick(): void {
    const context = this.context;
    if (!context || this.disposed || this.wantSuspended) return;
    if (context.state === 'closed') return;
    if (context.state === 'running') {
      this.stopListeningForGesture();
      return;
    }
    void context.resume().then(
      () => {
        if (!this.disposed && context.state === 'running') this.stopListeningForGesture();
      },
      () => undefined,
    );
  }

  /**
   * The context's state moved on its own. Chrome never does this outside of
   * our own calls; iOS does it whenever the OS reclaims the audio session —
   * and in a home-screen web app that includes the moments after launch and
   * after every return from the app switcher. Try to come straight back, and
   * re-attach the gesture listeners so that if the silent resume is refused,
   * the player's next tap finishes the job instead of nothing ever doing so.
   */
  private readonly onStateChange = (): void => {
    const context = this.context;
    if (!context || this.disposed) return;
    if (context.state === 'running') {
      this.stopListeningForGesture();
      return;
    }
    if (context.state === 'closed' || this.wantSuspended) return;
    void context.resume().catch(() => undefined);
    this.listenForGesture();
  };

  /**
   * Point the engine at the shipped recordings. Called once by the
   * composition root; the URLs come in as strings so this module never sees
   * bundler syntax (see `audio/samples.ts`).
   *
   * Fetching starts immediately — bytes need no AudioContext — and decoding
   * waits for the arm gesture, so by the time the player can hear anything
   * the recordings are usually already installed. Every failure path lands on
   * the synthesized fallbacks with `snapshot().samplesLoaded` reporting false;
   * a missing file changes the timbre, never the ride.
   */
  setSampleUrls(urls: SampleUrls): void {
    if (this.disposed || this.samplesRequested) return;
    this.samplesRequested = true;
    void (async () => {
      try {
        const [
          tyreOffroad, tyreSolid, windHowl, crash, crashTrollina, crashRedRider, crashAdonisb2,
          sirenFar, sirenClose, overspeedBeep,
        ] = await Promise.all([
          fetch(urls.tyreOffroad).then((response) => response.arrayBuffer()),
          fetch(urls.tyreSolid).then((response) => response.arrayBuffer()),
          fetch(urls.windHowl).then((response) => response.arrayBuffer()),
          fetch(urls.crash).then((response) => response.arrayBuffer()),
          fetch(urls.crashTrollina).then((response) => response.arrayBuffer()),
          fetch(urls.crashRedRider).then((response) => response.arrayBuffer()),
          fetch(urls.crashAdonisb2).then((response) => response.arrayBuffer()),
          fetch(urls.sirenFar).then((response) => response.arrayBuffer()),
          fetch(urls.sirenClose).then((response) => response.arrayBuffer()),
          fetch(urls.overspeedBeep).then((response) => response.arrayBuffer()),
        ]);
        if (this.disposed) return;
        this.sampleData = {
          tyreOffroad, tyreSolid, windHowl, crash, crashTrollina, crashRedRider, crashAdonisb2,
          sirenFar, sirenClose, overspeedBeep,
        };
        this.installSamples();
      } catch {
        // Network refusal: ride on synthesized fallbacks, report the truth.
      }
    })();
  }

  private installSamples(): void {
    const context = this.context;
    const data = this.sampleData;
    if (!context || !this.sink || !data || this.decodeStarted || this.disposed) return;
    this.decodeStarted = true;
    void (async () => {
      try {
        // decodeAudioData detaches its input buffer, so decoding is once-only
        // by nature — `decodeStarted` makes that explicit rather than relying
        // on a second call failing.
        const [
          tyreOffroad, tyreSolid, windHowl, crash, crashTrollina, crashRedRider, crashAdonisb2,
          sirenFar, sirenClose, overspeedBeep,
        ] = await Promise.all([
          context.decodeAudioData(data.tyreOffroad),
          context.decodeAudioData(data.tyreSolid),
          context.decodeAudioData(data.windHowl),
          context.decodeAudioData(data.crash),
          context.decodeAudioData(data.crashTrollina),
          context.decodeAudioData(data.crashRedRider),
          context.decodeAudioData(data.crashAdonisb2),
          context.decodeAudioData(data.sirenFar),
          context.decodeAudioData(data.sirenClose),
          context.decodeAudioData(data.overspeedBeep),
        ]);
        if (this.disposed) return;
        const bank: SampleBank = {
          tyreOffroad, tyreSolid, windHowl, crash, crashTrollina, crashRedRider, crashAdonisb2,
          sirenFar, sirenClose, overspeedBeep,
        };
        this.sink?.setSampleBank(bank);
      } catch {
        // An undecodable file is a build defect; the spec that asserts
        // `samplesLoaded` is what surfaces it. The ride continues either way.
      } finally {
        this.sampleData = null;
      }
    })();
  }

  /** Player volumes, 0..1. Partial: the options screen moves one at a time. */
  setVolumes(volumes: Partial<BusVolumes>): void {
    this.volumes = {
      master: clamp01(volumes.master ?? this.volumes.master),
      sfx: clamp01(volumes.sfx ?? this.volumes.sfx),
      ui: clamp01(volumes.ui ?? this.volumes.ui),
      music: clamp01(volumes.music ?? this.volumes.music),
    };
    this.applyVolumes();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolumes();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Developer tuning, pushed on change exactly as the controller's is. */
  setTuning(tuning: Partial<AudioTuning>): void {
    this.director.setTuning(tuning);
  }

  // -------------------------------------------------------------------------
  // The ride
  // -------------------------------------------------------------------------

  /**
   * Advance the model and push it at the graph.
   *
   * Called once per render frame from `app/Game.ts`, not once per fixed step:
   * the ear cannot hear 120 Hz parameter updates, and the sink glides between
   * them anyway. Events are the other half and arrive from inside the fixed
   * step, so `advance(n)` reaches the same sounds every run.
   */
  update(dt: number): void {
    if (this.disposed) return;

    // Chunked, so that what the game sounds like does not depend on how many
    // steps the caller happened to batch into one drawn frame. See
    // `AUDIO.modelStepSeconds`. The graph is written once at the end: the
    // sub-steps are there to advance the *model* correctly, and writing every
    // intermediate value to the same `currentTime` would only queue automation
    // events that immediately supersede each other.
    let remaining = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    // A guard, not a policy: `advance(120000)` is a QA typo, and grinding
    // through two thousand sub-steps to honour it helps nobody.
    let chunks = 0;
    do {
      const step = Math.min(remaining, AUDIO.modelStepSeconds);
      remaining -= step;
      chunks += 1;
      this.director.update(step, this.input);
      for (let index = 0; index < this.director.cueCount; index += 1) {
        const cue = this.director.cues[index];
        this.played[cue.kind] += 1;
        // Played at the moment the frame is drawn rather than at the model
        // time it belongs to. Only a batched `advance` can separate the two,
        // and the honest choice there is "now" — scheduling a sound that has
        // already happened into the future would be worse.
        this.sink?.play(cue);
      }
      // Drained, so the ring is free for the next sub-step — and, crucially,
      // for the cues the fixed step queues before the next drawn frame.
      this.director.clearCues();
    } while (remaining > 1e-9 && chunks < MAX_MODEL_CHUNKS);

    this.sink?.applyFrame(this.director.frame);
  }

  hop(charge: number): void {
    this.director.hop(charge);
  }

  landing(impactFraction: number, surface: SurfaceId): void {
    this.director.landing(impactFraction, surface);
  }

  impact(speed: number): void {
    this.director.impact(speed);
  }

  crash(speed: number): void {
    this.director.crash(speed);
  }

  /** The paddle went through the air (M14). A miss is silence after this. */
  swing(): void {
    this.director.swing();
  }

  /** The paddle connected (M14). */
  hit(): void {
    this.director.hit();
  }

  /**
   * Whose crash one-shot plays (M14.5).
   *
   * A plain string across the boundary, exactly as `quality` and `speedUnit`
   * cross it — never an options record (`AGENTS.md` invariant 5). Held on the
   * engine as well as pushed at the sink, because the sink is built on the
   * first gesture and this can be set long before one.
   */
  setCrashVoice(voice: CrashVoiceId): void {
    this.crashVoice = voice;
    this.sink?.setCrashVoice(voice);
  }

  /**
   * Quick reset, and anything else that discards the ride.
   *
   * The one-shots are stopped as well as the bed collapsed: a landing thump
   * still decaying over a rider who is now at the spawn is the audible twin of
   * the smeared rig `Game.syncPoses` exists to prevent.
   */
  reset(): void {
    this.director.reset();
    this.sink?.stopAllVoices();
  }

  /**
   * Give the audio thread back while the tab is hidden.
   *
   * Separate from the director's `idle` fade, which is what covers pause: that
   * one keeps the graph running and merely silent, so resuming is instant.
   * This actually stops the context, which is right when nobody is looking at
   * the page and wrong when they are simply paused for a moment.
   */
  setSuspended(suspended: boolean): void {
    // Recorded before touching the context, so the `statechange` this call
    // provokes finds the flag already set and does not fight the decision.
    this.wantSuspended = suspended;
    const context = this.context;
    if (!context || this.disposed) return;
    if (suspended) {
      if (context.state === 'running') void context.suspend().catch(() => undefined);
      return;
    }
    if (context.state === 'closed' || context.state === 'running') return;
    // Not `=== 'suspended'`: a hidden home-screen web app comes back from iOS
    // as `'interrupted'`, and that state has to resume here too. If the
    // gestureless resume is refused, the re-attached listeners let the
    // player's next tap restore the sound.
    void context.resume().catch(() => undefined);
    this.listenForGesture();
  }

  /**
   * RMS of the real output, for QA. Zero when nothing has been armed.
   *
   * Deliberately not on `snapshot()`: it reads the audio clock rather than the
   * simulation clock, so a caller has to let real milliseconds pass for it to
   * mean anything, and burying that in a field everything else reads per frame
   * would invite exactly the wrong assumption about it.
   */
  outputLevel(): number {
    return this.sink?.outputLevel() ?? 0;
  }

  /**
   * The output's magnitude spectrum, for QA. Null when nothing has been armed.
   *
   * The measurement that keeps the arcade rules honest — see the note on
   * `WebAudioSink.outputSpectrum`. Same audio-clock caveat as `outputLevel`.
   */
  outputSpectrum(): { readonly binHz: number; readonly db: Float32Array } | null {
    return this.sink?.outputSpectrum() ?? null;
  }

  snapshot(): AudioSnapshot {
    const frame = this.director.frame;
    const counts = this.sink?.counts;
    const [slotA, slotB] = frame.tyre;
    return {
      supported: this.supported,
      armed: this.armed,
      contextState: this.context?.state ?? 'unavailable',
      muted: this.muted,
      volumes: this.volumes,
      sampleRate: this.context?.sampleRate ?? 0,
      permanentNodes: counts?.permanentNodes ?? 0,
      samplesLoaded: this.sink?.samplesLoaded ?? false,
      voices: counts?.voices ?? 0,
      droppedVoices: counts?.droppedVoices ?? 0,
      played: { ...this.played },
      crashSamplePlays: counts?.crashSamplePlays ?? 0,
      overspeedSamplePlays: counts?.overspeedSamplePlays ?? 0,
      lastCrashVoice: counts?.lastCrashVoice ?? null,
      crashVoice: this.crashVoice,
      bedGain: frame.bedGain,
      duck: frame.duck,
      motorHz: frame.motorHz,
      motorGain: frame.motorDriveGain,
      motorCutoffHz: frame.motorCutoffHz,
      motorQ: frame.motorQ,
      regenGain: frame.regenGain,
      windGain: frame.windGain,
      // All three construction paths of both slots: a voice's level is split
      // between synthesis, the offroad recording, and the toko loop, and this
      // field answers "what is the surface contributing", not "how it is
      // being made".
      tyreGain: slotA.gain + slotA.sampleGain + slotA.tokoGain
        + slotB.gain + slotB.sampleGain + slotB.tokoGain,
      tyreVoice: frame.tyre[frame.tyreActive].voiceId,
      scrapeGain: frame.scrapeGain,
      sirenGain: frame.sirenFarGain + frame.sirenCloseGain,
      sirenRate: frame.sirenRate,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopListeningForGesture();
    this.sink?.dispose();
    this.sink = null;
    const context = this.context;
    this.context = null;
    // `close()` releases the audio device and every node with it. Rejections
    // are ignored: a context already closed by a page teardown is not a fault.
    if (context) {
      context.removeEventListener('statechange', this.onStateChange);
      if (context.state !== 'closed') void context.close().catch(() => undefined);
    }
  }

  // -------------------------------------------------------------------------

  private applyVolumes(): void {
    if (!this.sink) return;
    this.sink.setBusGains(
      busGain(this.volumes, 'sfx', this.muted),
      busGain(this.volumes, 'ui', this.muted),
      busGain(this.volumes, 'music', this.muted),
    );
  }

  private listenForGesture(): void {
    if (!this.target || this.listening) return;
    this.listening = true;
    for (const event of GESTURES) {
      // Capture, so a handler that stops propagation cannot leave the game
      // permanently silent. Not `once`, because the listeners are removed
      // together in `stopListeningForGesture` and three independent `once`
      // registrations would leave two of them attached forever.
      this.target.addEventListener(event, this.onGesture, { capture: true, passive: true });
    }
  }

  private stopListeningForGesture(): void {
    if (!this.target || !this.listening) return;
    this.listening = false;
    for (const event of GESTURES) {
      this.target.removeEventListener(event, this.onGesture, { capture: true });
    }
  }

  private readonly onGesture = (): void => {
    this.arm();
    // Arming is once; resuming may take several tries. On iOS standalone the
    // first gesture regularly builds the graph and still leaves the context
    // refused, so every subsequent gesture keeps kicking until it runs.
    this.kick();
  };
}

/**
 * Starting volumes, and what the M9 options screen resets to.
 *
 * Master sits at unity because the headroom is taken in `AUDIO.bedTrim`
 * instead — one place rather than two, so a player who drags master to the top
 * gets the mix that was actually balanced rather than a clipped one.
 */
export const DEFAULT_VOLUMES: BusVolumes = Object.freeze({
  master: 1,
  sfx: 1,
  ui: 1,
  // No source at M8. Stated rather than left at unity so the first music
  // added arrives under the ride instead of over it.
  music: 0.7,
});
