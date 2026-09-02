/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { AUDIO, WHEEL, type TyreVoice } from '../data/tuning.ts';
import { surfaceProperties } from '../data/surfaces.ts';
import type { SurfaceId } from '../simulation/world.ts';
import type { PowerStage } from '../simulation/EucController.ts';
import {
  approach,
  clamp,
  clamp01,
  duckToGain,
  equalPowerCrossfade,
  lerp,
  mapRange,
  rollingHz,
  stepDuck,
} from './mix.ts';
import { overspeedBeepPeriod } from '../shared/overspeed.ts';

/**
 * The audio director: what the game should sound like, as plain numbers.
 *
 * **Nothing in this file knows Web Audio exists.** That split is the whole
 * architecture of the audio layer, and it is the same one `render/chaseCamera.ts`
 * uses against three.js: the decisions live in a module that runs under
 * `node --test`, and the platform module downstream only obeys. Which means the
 * questions M8 is actually judged on — does the motor's pitch track the wheel,
 * does the tyre change with the surface, does a warning win — are asserted as
 * arithmetic rather than inferred from a spectrogram nobody can diff.
 *
 * The director is stateful, because most of what makes audio sound deliberate
 * is state: a crossfade in progress, a duck releasing, where the beep pattern
 * is in its cycle. All of it is scalar and all of it is driven by `dt`, so a
 * test steps it exactly as the fixed loop does and a browser reaches the same
 * state deterministically through `advance(n)`.
 *
 * Two outputs per update:
 *
 *   - `frame` — every continuous parameter, filled in place into one
 *     preallocated object. Read by the sink each render frame.
 *   - `cues` — the one-shots that started during this update, in a
 *     preallocated ring. Drained by the engine, never allocated per event.
 */

/** What the game hands the director. Filled in place; never allocated. */
export interface RideAudioInput {
  /** Signed speed along the heading, m/s. Negative is reverse. */
  speed: number;
  /** Player throttle demand, -1..1. Positive drives, negative brakes. */
  throttle: number;
  /** The power ladder's load scalar. 1.0 is tilt-back. */
  load: number;
  /**
   * Which rung of the ladder is lit. Drives the beep pattern.
   *
   * **The worst rung among the riders who are *upright*, and excluding the
   * downed ones is the caller's job** (M25 Phase 5). This used to be one
   * rider's rung and the gate below refused to beep while `crashed` was set;
   * with two riders that flag is seat 0's, so the player lying on the ground
   * silenced the guest's tilt-back. The rule did not go away — it moved to
   * where it can be asked per seat (`app/riderMix.ts`), and a caller that
   * hands over a downed rider's rung will be beeped at for them.
   */
  powerStage: PowerStage;
  /**
   * How near the max-speed cutout the wheel is, 0..1 — M20.
   *
   * `EucController.overspeed`, handed over raw. **Not derived here from
   * `speed`**, and that is the point rather than laziness: the cutout is a
   * simulation rule with its own thresholds and its own live tuning, and a
   * director that recomputed the ratio from a speed would be a second opinion
   * about when the wheel is in trouble — audibly wrong the first time anybody
   * drags the drag coefficient on F4. Zero when the feature is switched off,
   * which is what silences the whole system in one place.
   *
   * The nearest *upright* rider's, on `powerStage`'s contract exactly.
   */
  overspeed: number;
  surface: SurfaceId;
  /** True while the tyre is on the ground. */
  grounded: boolean;
  /** Vertical speed of the sprung mass, m/s — the suspension actually working. */
  suspensionSpeed: number;
  /** Pedal-strike overlap past clearance, radians. Sign is irrelevant here. */
  scrape: number;
  /**
   * True while the rider **the continuous bed follows** is off the wheel.
   *
   * Seat 0's, and since M25 Phase 5's QA repair that is the whole of what it
   * does: it dips the bed and nothing else. Whether a rider's kerb strikes are
   * suppressed, and when their recovery chirp fires, are per-rider questions
   * answered by `crash` / `recovered` and `RiderBook`.
   */
  crashed: boolean;
  /**
   * How far away the pursuing cop is, metres — the siren's whole input (M18).
   *
   * `Infinity` whenever there is no live pursuit: no chase mode, the run
   * already ended, the probe with no rules. The director does not know what a
   * chase *is* — it is handed a distance and shapes a voice from it, exactly
   * as it is handed a speed and shapes the motor. An ended chase is therefore
   * a cop at infinite range, and the siren's fade on escape or bust is the
   * same arithmetic as him simply dropping too far back.
   */
  copRangeMetres: number;
  /**
   * How fast that range is shrinking, m/s — positive while he is gaining.
   * Feeds the Doppler lean and nothing else; zero whenever range is Infinity.
   */
  copClosingSpeed: number;
  /**
   * True while nothing is being simulated — paused, hidden, context lost.
   *
   * Not the same as "stopped". A stopped wheel still hums; a paused game makes
   * no sound at all, and it has to reach silence smoothly or the pause itself
   * is a click.
   */
  idle: boolean;
}

export function createRideAudioInput(): RideAudioInput {
  return {
    speed: 0,
    throttle: 0,
    load: 0,
    powerStage: 'normal',
    overspeed: 0,
    surface: 'pavement',
    grounded: true,
    suspensionSpeed: 0,
    scrape: 0,
    crashed: false,
    copRangeMetres: Number.POSITIVE_INFINITY,
    copClosingSpeed: 0,
    idle: false,
  };
}

/** One tyre slot's resolved parameters. Two of these are crossfaded. */
export interface TyreSlotFrame {
  /** Which `tyreAudio` id this slot currently carries. */
  voiceId: string;
  /** Final gain, after the voice's level, speed, grain, and the crossfade. */
  gain: number;
  centreHz: number;
  q: number;
  lowHz: number;
  /** Gain of the body layer relative to the texture layer. */
  lowGain: number;
  /**
   * Gain of the recorded offroad loop in this slot, on the same envelope as
   * `gain`. The two split one voice by the voice's `sample` share, so a
   * sampled surface crossfades exactly like a synthesized one — the sink just
   * has a third layer to write.
   */
  sampleGain: number;
  /**
   * Gain of the toko rotation loop in this slot, same envelope again — the
   * third way a voice can be made, split off by its `toko` share.
   */
  tokoGain: number;
  /** Gentle playback-rate sweep for the recorded offroad loop. */
  sampleRate: number;
  /** Playback rate of the per-revolution toko loop, tied to actual rotation. */
  tokoRate: number;
}

/** Every continuous parameter the sink needs. One object, filled in place. */
export interface AudioFrame {
  /**
   * Multiplier over the whole ride bed: ducking, the crash state, and the
   * fade to silence when the game stops simulating, combined.
   */
  bedGain: number;
  /** The general duck level, 0..1. Exposed for the overlay and for tests. */
  duck: number;
  /** The crash duck, which releases on its own much slower constant. */
  crashDuck: number;

  /**
   * The motor, as one fundamental and two **exact** harmonics of it.
   *
   * `motorSingHz` is always `motorHz × motorSingHarmonic` and `motorAirHz` is
   * always `motorHz × motorAirHarmonic`, to the last digit. Nothing is
   * detuned, so nothing beats — see rule 1 at the top of the `AUDIO` group for
   * why that is a hard constraint here rather than a preference.
   */
  motorHz: number;
  motorDriveGain: number;
  motorSingHz: number;
  motorSingGain: number;
  motorAirHz: number;
  motorAirGain: number;
  /**
   * The lowpass the whole motor passes through, and its resonance.
   *
   * These two carry what a tremolo used to: load opens the cutoff, braking
   * closes it and lifts Q into a peak. Everything the player is told about how
   * hard the machine is working arrives through this filter.
   */
  motorCutoffHz: number;
  motorQ: number;

  regenHz: number;
  regenGain: number;

  windGain: number;
  windCutoffHz: number;

  tyre: [TyreSlotFrame, TyreSlotFrame];
  /**
   * Which slot carries the surface the wheel is on *now*.
   *
   * The other slot is the one fading out, and for the 0.2 s of a crossfade it
   * may well be the louder of the two. Reported so a reader — the debug
   * overlay, a spec — can name the voice the tyre is on rather than having to
   * infer it from the gains, which is ambiguous mid-fade and meaningless when
   * the wheel is standing still and both are silent.
   */
  tyreActive: 0 | 1;

  scrapeGain: number;
  scrapeCentreHz: number;
  scrapeRingHz: number;
  scrapeRingGain: number;

  /**
   * The siren's two loops (M18): the far wail and the close wail, already
   * through the range envelope and the equal-power blend — the sink writes
   * these two gains and the shared rate, and decides nothing.
   */
  sirenFarGain: number;
  sirenCloseGain: number;
  /** Playback rate of both loops — the Doppler lean, identical on each. */
  sirenRate: number;
}

function createTyreSlotFrame(): TyreSlotFrame {
  return {
    voiceId: '',
    gain: 0,
    centreHz: 1000,
    q: 1,
    lowHz: 200,
    lowGain: 0,
    sampleGain: 0,
    tokoGain: 0,
    sampleRate: 1,
    tokoRate: 0,
  };
}

export function createAudioFrame(): AudioFrame {
  return {
    bedGain: 0,
    duck: 0,
    crashDuck: 0,
    motorHz: AUDIO.motorIdleHz,
    motorDriveGain: 0,
    motorSingHz: AUDIO.motorIdleHz * AUDIO.motorSingHarmonic,
    motorSingGain: 0,
    motorAirHz: AUDIO.motorIdleHz * AUDIO.motorAirHarmonic,
    motorAirGain: 0,
    motorCutoffHz: AUDIO.motorCutoffAtRest,
    motorQ: AUDIO.motorFilterQ,
    regenHz: AUDIO.motorIdleHz * AUDIO.regenHarmonic,
    regenGain: 0,
    windGain: 0,
    windCutoffHz: AUDIO.windCutoffAtRest,
    tyre: [createTyreSlotFrame(), createTyreSlotFrame()],
    tyreActive: 0,
    scrapeGain: 0,
    scrapeCentreHz: AUDIO.scrapeCentreHz,
    scrapeRingHz: AUDIO.scrapeRingHz,
    scrapeRingGain: 0,
    sirenFarGain: 0,
    sirenCloseGain: 0,
    sirenRate: 1,
  };
}

// ---------------------------------------------------------------------------
// One-shots
// ---------------------------------------------------------------------------

/**
 * Which crash recording plays.
 *
 * **Declared under `audio/` rather than imported from `data/riders.ts`**, and
 * that is the layering rule rather than duplication for its own sake:
 * everything under `audio/` except `samples.ts` runs headlessly under
 * `node --test` with no bundler and no DOM, and it stays that way by owing
 * nothing to `app/`, `data/`, or `ui/`. The composition root maps one to the
 * other, which is the same route `quality` and `speedUnit` already take out of
 * the options store.
 *
 * It lives in *this* file rather than in `sink.ts` since M25 Phase 5, because
 * a `TransientCue` names the voice it wants and a cue is this file's.
 */
export type CrashVoiceId =
  'cool-rider' | 'trollina' | 'red-rider' | 'adonisb2' | 'maribel' | 'wheel-in-motion';

export type CueKind =
  | 'hop' | 'landing' | 'curb' | 'crash' | 'recover' | 'beep' | 'swing' | 'hit'
  /**
   * The max-speed warning — M20.
   *
   * A kind of its own rather than a louder `beep`, because the sink reaches for
   * a *recording* on this one and for synthesis on the other. The tone fields
   * are still filled in and are the fallback before the sample bank lands,
   * which is the same arrangement `crash` has had since M8.
   */
  | 'overspeed'
  /**
   * The race grid's count and its release — M27 Phase 3.
   *
   * Their own kinds rather than a `beep` with different numbers, because
   * §27.3 asks for their own cue, their own timer and their own duck: routing
   * a new warning through the power ladder is exactly how M13's removed
   * beeping came back once already.
   */
  | 'count' | 'go';

/**
 * A one-shot, fully resolved.
 *
 * Every impact in the game is the same two ingredients — a pitched thump that
 * falls, and a filtered noise burst — in different proportions, so one struct
 * and one synthesis path covers hops, landings, kerb strikes, and crashes. A
 * beep is the degenerate case with no thump and no noise, which is why it fits
 * here rather than needing a parallel mechanism.
 */
export interface TransientCue {
  kind: CueKind;
  /** Which bus it plays on. Warnings are `ui` so effects volume cannot hide them. */
  bus: 'sfx' | 'ui';
  /** Linear gain, after the cue's own level and any impact scaling. */
  gain: number;
  /** Seconds from the moment it was queued. The warn pattern's second beep. */
  delaySeconds: number;

  thumpFromHz: number;
  thumpToHz: number;
  thumpSeconds: number;

  noiseHz: number;
  noiseQ: number;
  noiseSeconds: number;

  /** A clean square tone. Warnings and the recovery chirp only. */
  toneHz: number;
  toneSeconds: number;

  /**
   * Whose crash this is — M25 Phase 5, and `null` on every other kind.
   *
   * **The voice travels with the cue rather than being read off a setting when
   * it plays**, because two riders on one screen crash in two different
   * characters (q68 keeps them distinct, so the voices are never ambiguous) and
   * a single "current voice" on the sink would give whichever crash arrived
   * second the wrong person's fall. `null` means "whatever the sink was told
   * last", which is single-player's answer and the one every pre-Phase-5 caller
   * still gets.
   */
  voice: CrashVoiceId | null;
}

function createCue(): TransientCue {
  return {
    kind: 'hop',
    bus: 'sfx',
    gain: 0,
    delaySeconds: 0,
    thumpFromHz: 0,
    thumpToHz: 0,
    thumpSeconds: 0,
    noiseHz: 0,
    noiseQ: 1,
    noiseSeconds: 0,
    toneHz: 0,
    toneSeconds: 0,
    voice: null,
  };
}

/**
 * One rider's one-shot bookkeeping — M25 Phase 5, extended by its QA repair.
 *
 * Three scalars, not a second director. Everything continuous stays singular
 * and stays seat 0's; what is per rider is only the state that answers *"has
 * this wheel already reported something"*, which is meaningless when shared.
 */
interface RiderBook {
  /** Seconds left of this rider's kerb-strike retrigger window. */
  impactHold: number;
  /** How hard their last reported strike was, for the harder-hit exception. */
  lastImpactScale: number;
  /**
   * Whether this rider is off the wheel.
   *
   * Set by `crash`, cleared by `recovered`, and driven for **every** seat
   * including 0 by the composition root's own per-seat edge — so there is one
   * edge detector rather than one per seat plus a spare in here.
   */
  crashing: boolean;
}

/**
 * How many one-shots one update may produce.
 *
 * Generous against the real worst case, and fixed so nothing here allocates.
 * Overflow drops the newest rather than growing, because a frame that wanted
 * more than this many simultaneous impacts has a bug upstream and the honest
 * failure is a missing sound rather than a growing array nobody notices.
 *
 * **Doubled at M25 Phase 5, and the arithmetic is the reason.** One rider's
 * worst case is four — a crash landing on a kerb during tilt-back — and eight
 * was twice that. q66 gives both couch riders their own one-shots, so the
 * worst case became eight and the old ceiling had no headroom left at all:
 * two riders crashing together would have dropped whichever sounds arrived
 * last, silently, and only ever on the loudest frame in the game. Sixteen
 * restores the same 2× margin the number was chosen with.
 *
 * **Doubled again at M27 Phase 1, by re-walking that arithmetic rather than
 * by pattern-matching it.** §27.2 priced a four-seat couch's worst case at
 * sixteen and §27.6 asked for "ring to 16" — written from a reading of this
 * file that was one milestone stale, because M25 had already taken it there.
 * The number the *argument* produces at four seats is thirty-two: four riders
 * × four one-shots each is the worst case, and this ceiling has been twice the
 * worst case since it was first chosen. Leaving it at sixteen would have been
 * the exact defect the M25 paragraph above describes, one couch wider — a
 * silent drop on the loudest frame in the game, which is the frame nobody is
 * listening critically on.
 */
const MAX_CUES_PER_UPDATE = 32;

/** The live subset of `AUDIO` the tuning panel may move. See LIVE_TUNABLES. */
export interface AudioTuning {
  bedTrim: number;
  motorPolePairs: number;
  motorIdleLevel: number;
  motorLoadLevel: number;
  motorSingLevel: number;
  motorAirLevel: number;
  motorLoadBrighten: number;
  regenLevel: number;
  windLevel: number;
  tyreLevel: number;
  beepLevel: number;
  tiltBackLevel: number;
  duckTiltBack: number;
  /**
   * Master for the over-speed beeps — M20, and live for the reason every other
   * level here is: the gate is the owner's own ride, on a phone, and "is the
   * beep loud enough to act on without being loud enough to hate" is a question
   * only an ear settles. At 0 the beeps stop and the cutout stays — which is a
   * combination nobody should ship, so `EUC.cutoutEnabled` is the switch that
   * turns the *feature* off, and this one is only a level.
   */
  overspeedLevel: number;
  /**
   * The two M14 paddle levels.
   *
   * Live for the reason the bed levels above are: the milestone's exit question
   * is about feel, the owner answers it on a handset, and "is the hit louder
   * than the swing by the right amount" is a question only an ear can settle.
   */
  swingLevel: number;
  hitLevel: number;
  /** The race grid's count and release — M27 Phase 3. */
  raceCountLevel: number;
  raceGoLevel: number;
  /**
   * The siren's point-blank ceiling (M18). Live because the standing rule —
   * nothing may be annoying — is judged by the owner's ear on a real ride,
   * and zero is the kill-switch that judgment might reach for.
   */
  sirenLevel: number;
}

export function defaultAudioTuning(): AudioTuning {
  return {
    bedTrim: AUDIO.bedTrim,
    motorPolePairs: AUDIO.motorPolePairs,
    motorIdleLevel: AUDIO.motorIdleLevel,
    motorLoadLevel: AUDIO.motorLoadLevel,
    motorSingLevel: AUDIO.motorSingLevel,
    motorAirLevel: AUDIO.motorAirLevel,
    motorLoadBrighten: AUDIO.motorLoadBrighten,
    regenLevel: AUDIO.regenLevel,
    windLevel: AUDIO.windLevel,
    tyreLevel: AUDIO.tyreLevel,
    beepLevel: AUDIO.beepLevel,
    tiltBackLevel: AUDIO.tiltBackLevel,
    duckTiltBack: AUDIO.duckTiltBack,
    overspeedLevel: AUDIO.overspeedLevel,
    swingLevel: AUDIO.swingLevel,
    hitLevel: AUDIO.hitLevel,
    raceCountLevel: AUDIO.raceCountLevel,
    raceGoLevel: AUDIO.raceGoLevel,
    sirenLevel: AUDIO.sirenLevel,
  };
}

const WHEEL_RADIUS = WHEEL.tyreDiameter * 0.5;

/** The beep pattern for one rung of the power ladder. */
interface BeepPattern {
  readonly hz: number;
  readonly periodSeconds: number;
  readonly level: number;
  readonly duck: number;
  /** Two beeps rather than one. The middle rung, so it reads as escalation. */
  readonly double: boolean;
}

export class AudioDirector {
  readonly frame: AudioFrame = createAudioFrame();

  /** The cue ring. Read `cueCount` entries from index 0 after each update. */
  readonly cues: TransientCue[] = Array.from({ length: MAX_CUES_PER_UPDATE }, createCue);
  cueCount = 0;

  private tuning: AudioTuning = defaultAudioTuning();

  // -- Tyre crossfade -------------------------------------------------------
  //
  // Two slots and one active index. Each slot carries an independent envelope
  // that approaches 1 when it is the active surface and 0 when it is not; the
  // pair is then normalised in *power* rather than in amplitude, which is what
  // keeps the tyre level through a transition. Two uncorrelated noise sources
  // sum in power, so an amplitude crossfade dips about 3 dB in the middle and
  // the tyre audibly ducks on every surface boundary — of which the slice has
  // a great many.
  //
  // Independent envelopes rather than one shared position, because a rider can
  // cross grass, gravel, and dirt inside a quarter of a second. A shared
  // position has to be reset on each change, which makes the outgoing voice
  // jump back to full; independent envelopes are continuous through any
  // sequence of changes, including one that reverses.
  private readonly slotVoice: [string, string] = ['', ''];
  private readonly slotEnvelope: [number, number] = [0, 0];
  /**
   * Output-continuity correction per slot, easing back to 1.
   *
   * Set on eviction so the slot's *output* holds exactly where it was when a
   * new voice replaces a still-audible one, then decays over half a
   * crossfade. The first wiring rescaled the *envelope* instead — but the
   * envelopes share the equal-power normalisation, so touching one stepped
   * the other slot's output too, and with the sample trim spreading effective
   * voice weights across a 20x range the step became audible arithmetic.
   * The correction lives outside the normalisation, so neither slot steps.
   */
  private readonly slotCorrection: [number, number] = [1, 1];
  private activeSlot: 0 | 1 = 0;
  private currentSurface: SurfaceId | '' = '';

  // -- Warnings -------------------------------------------------------------
  private beepStage: PowerStage = 'normal';
  private beepTimer = 0;
  /** Seconds of duck still owed to the most recent beep. */
  private beepDuckHold = 0;
  /**
   * The over-speed beep's own timer and duck — M20, and deliberately its own
   * pair rather than a share of the ladder's above.
   *
   * The ladder is silenced (`AUDIO.beepLevel` is 0) and must stay silenced;
   * routing this through its timer would mean reviving `beepPattern` to carry
   * it, which is how the tilt-back beeping the owner removed would come back
   * by the side door.
   */
  private overspeedTimer = 0;
  private overspeedDuckHold = 0;

  // -- Ducking and state ----------------------------------------------------
  private duck = 0;
  private crashDuck = 0;
  /** Duck demanded by transients, decaying on its own. */
  private transientDuck = 0;
  private crashedBed = 1;
  private idleGain = 0;
  /**
   * Per-rider one-shot bookkeeping — M25 Phase 5, extended by its QA repair.
   *
   * **Per rider and not per world.** The retrigger window's whole meaning is
   * "this wheel already reported a hit", so one shared window means the guest
   * grinding along a wall eats the player's and their real collision arrives
   * silent; and the crash flag's whole meaning is "this rider is sliding", so
   * one shared flag — driven from a `RideAudioInput.crashed` that is seat 0's
   * — silenced the guest's wall for the whole length of the *player's*
   * ragdoll. The *continuous* director is emphatically not duplicated
   * (§25.5): this is three scalars, not a second model.
   */
  private readonly riders: RiderBook[] = [];

  // -- Smoothed continuous values ------------------------------------------
  // Annotated `number` rather than inferred: `AUDIO` is `as const`, so an
  // inferred field would take the literal type of its default and refuse every
  // later assignment.
  private motorHz: number = AUDIO.motorIdleHz;
  private motorGain = 0;
  private singGain = 0;
  private airGain = 0;
  private motorCutoff: number = AUDIO.motorCutoffAtRest;
  private motorQ: number = AUDIO.motorFilterQ;
  private regenGain = 0;
  private windGain = 0;
  private windCutoff: number = AUDIO.windCutoffAtRest;
  private tyreSpeedGain = 0;
  private tyreGrain = 0;
  private scrapeGain = 0;
  // -- The siren (M18) ------------------------------------------------------
  private sirenGain = 0;
  /**
   * The smoothed blend position, 0 = far wail, 1 = close wail. Held rather
   * than zeroed when the pursuit ends, so the fade-out keeps the mix it was
   * caught with instead of audibly sliding back to the far voice under it.
   */
  private sirenBlend = 0;
  private sirenRate = 1;

  setTuning(tuning: Partial<AudioTuning>): void {
    this.tuning = { ...this.tuning, ...tuning };
  }

  /**
   * Collapse every envelope onto silence and forget the ride.
   *
   * Called on a reset and whenever the graph is rebuilt. Without it, a reset
   * from 15 m/s on gravel leaves the tyre and wind decaying for a fifth of a
   * second over a rider who is standing still at the spawn — the audible twin
   * of the smeared rig `Game.syncPoses` exists to prevent.
   */
  reset(): void {
    this.slotVoice[0] = '';
    this.slotVoice[1] = '';
    this.slotEnvelope[0] = 0;
    this.slotEnvelope[1] = 0;
    this.slotCorrection[0] = 1;
    this.slotCorrection[1] = 1;
    this.activeSlot = 0;
    this.currentSurface = '';
    this.beepStage = 'normal';
    this.beepTimer = 0;
    this.beepDuckHold = 0;
    this.overspeedTimer = 0;
    this.overspeedDuckHold = 0;
    this.duck = 0;
    this.crashDuck = 0;
    this.transientDuck = 0;
    this.crashedBed = 1;
    for (const rider of this.riders) {
      if (rider === undefined) continue;
      rider.impactHold = 0;
      rider.lastImpactScale = 0;
      rider.crashing = false;
    }
    this.motorHz = AUDIO.motorIdleHz;
    this.motorGain = 0;
    this.singGain = 0;
    this.airGain = 0;
    this.motorCutoff = AUDIO.motorCutoffAtRest;
    this.motorQ = AUDIO.motorFilterQ;
    this.regenGain = 0;
    this.windGain = 0;
    this.windCutoff = AUDIO.windCutoffAtRest;
    this.tyreSpeedGain = 0;
    this.tyreGrain = 0;
    this.scrapeGain = 0;
    this.sirenGain = 0;
    this.sirenBlend = 0;
    this.sirenRate = 1;
    this.cueCount = 0;
  }

  /**
   * Advance the model by `dt` and fill `frame`, appending any cues it produced.
   *
   * **The ring is emptied by `clearCues`, not here, and the difference is a
   * bug that took a browser to find.** Hops, landings, kerb strikes, and
   * crashes are queued from inside the fixed step, which runs *between* two of
   * these calls. Clearing at the top of `update` therefore threw every one of
   * them away before anything could play it, and left only the cues this
   * method generates itself — so the wheel beeped correctly at tilt-back and
   * was completely silent on landing.
   */
  update(dt: number, input: RideAudioInput): AudioFrame {
    const step = dt > 0 ? dt : 0;

    this.updateTyreSlots(step, input);
    this.updateMotor(step, input);
    this.updateWind(step, input);
    this.updateScrape(step, input);
    this.updateSiren(step, input);
    this.updateWarnings(step, input);
    this.updateOverspeed(step, input);
    this.updateBed(step, input);
    for (const rider of this.riders) {
      if (rider === undefined) continue;
      rider.impactHold = Math.max(0, rider.impactHold - step);
    }

    return this.frame;
  }

  /**
   * Drop the cues collected so far. The consumer calls this after draining.
   *
   * A one-shot that was queued and not played is a sound whose moment has
   * passed; carrying it forward would fire a landing during the next frame's
   * ride. But *when* that happens has to be the consumer's decision, because
   * only the consumer knows when it has read them — see the note on `update`.
   */
  clearCues(): void {
    this.cueCount = 0;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /**
   * The rider left the ground.
   *
   * `charge` is the hop's captured crouch, 0..1: a stamped-out full hop is a
   * heavier sound than a flick off a kerb, and that is the only part of a hop
   * the player controls.
   */
  hop(charge: number): void {
    const cue = this.claimCue();
    if (!cue) return;
    cue.kind = 'hop';
    cue.bus = 'sfx';
    cue.gain = AUDIO.hopLevel * lerp(0.7, 1, clamp01(charge));
    cue.delaySeconds = 0;
    cue.thumpFromHz = AUDIO.hopThumpFromHz;
    cue.thumpToHz = AUDIO.hopThumpToHz;
    cue.thumpSeconds = AUDIO.hopThumpSeconds;
    cue.noiseHz = AUDIO.hopNoiseHz;
    cue.noiseQ = 1.1;
    cue.noiseSeconds = AUDIO.hopNoiseSeconds;
    cue.toneHz = 0;
    cue.toneSeconds = 0;
    this.demandTransientDuck(AUDIO.duckHop);
  }

  /**
   * The tyre touched down.
   *
   * @param impactFraction Closing speed against `EUC.landingImpactReference`.
   * @param surface        Landed on, so the noise burst borrows its tyre voice.
   */
  landing(impactFraction: number, surface: SurfaceId): void {
    const cue = this.claimCue();
    if (!cue) return;
    const scale = lerp(AUDIO.landingMinScale, 1, clamp01(impactFraction));
    const voice = tyreVoiceFor(surface);
    cue.kind = 'landing';
    cue.bus = 'sfx';
    cue.gain = AUDIO.landingLevel * scale;
    cue.delaySeconds = 0;
    cue.thumpFromHz = AUDIO.landingThumpFromHz;
    cue.thumpToHz = AUDIO.landingThumpToHz;
    cue.thumpSeconds = AUDIO.landingThumpSeconds;
    // The landing borrows the tyre voice of the surface it lands on, so gravel
    // lands like gravel and the wood bridge booms — read from the table that
    // already says what they sound like rather than from a second one that
    // would drift away from it.
    cue.noiseHz = voice.centreHz;
    cue.noiseQ = voice.q;
    cue.noiseSeconds = AUDIO.landingNoiseSeconds;
    cue.toneHz = 0;
    cue.toneSeconds = 0;
    this.demandTransientDuck(AUDIO.duckLanding * clamp01(impactFraction));
  }

  /**
   * The wheel hit something solid — a kerb face, a wall, a bollard.
   *
   * Rate-limited, because this is a *level* and not an edge: the controller
   * reports every step in which it refused part of a move, and a wheel
   * grinding along a wall reports one at 120 Hz. See
   * `AUDIO.impactRetriggerSeconds`.
   */
  impact(speed: number, seat = 0): void {
    // Below audibility before a cue is claimed, not after: most refusals are a
    // wheel resting against a kerb rather than an impact.
    const scale = clamp01(speed / AUDIO.curbImpactReference);
    if (scale <= 0.02) return;
    const rider = this.riderBook(seat);
    // A crash owns its own moment; the rider sliding along the ground must not
    // also be reported as a series of kerb strikes. **This rider's own crash,
    // since the Phase 5 QA repair** — it read one shared flag, which is seat
    // 0's, so a player on the ground silenced the guest's wall for the whole
    // length of a ragdoll.
    if (rider.crashing) return;
    // Inside the window, only something clearly harder than the last hit gets
    // through — so a real collision at the end of a scrape still lands.
    if (rider.impactHold > 0 && scale < rider.lastImpactScale * 1.5) return;
    const cue = this.claimCue();
    if (!cue) return;
    rider.impactHold = AUDIO.impactRetriggerSeconds;
    rider.lastImpactScale = scale;
    cue.kind = 'curb';
    cue.bus = 'sfx';
    cue.gain = AUDIO.curbLevel * scale;
    cue.delaySeconds = 0;
    cue.thumpFromHz = AUDIO.curbThumpFromHz;
    cue.thumpToHz = AUDIO.curbThumpToHz;
    cue.thumpSeconds = AUDIO.curbThumpSeconds;
    cue.noiseHz = AUDIO.curbNoiseHz;
    cue.noiseQ = 1.4;
    cue.noiseSeconds = AUDIO.curbNoiseSeconds;
    cue.toneHz = 0;
    cue.toneSeconds = 0;
    this.demandTransientDuck(AUDIO.duckCurb * scale);
  }

  /**
   * The rider came off. The loudest thing in the game, and the longest duck.
   *
   * `voice` is `null` for "whoever the sink was told to use", which is the
   * single-player answer and every pre-M25 caller's. A couch seat names its
   * own character's, because two riders crashing in one world must not both
   * speak in whoever the player last chose.
   */
  crash(speed: number, voice: CrashVoiceId | null = null, seat = 0): void {
    // **Before the cue is claimed, so the flag is set even when the ring is
    // full.** A dropped crash sound is one missing sound; a crash that failed
    // to mark its rider as down would go on reporting their slide as kerb
    // strikes, which is a stream of wrong ones.
    this.riderBook(seat).crashing = true;
    const cue = this.claimCue();
    if (!cue) return;
    cue.voice = voice;
    const scale = lerp(0.55, 1, clamp01(Math.abs(speed) / AUDIO.speedReference));
    cue.kind = 'crash';
    cue.bus = 'sfx';
    cue.gain = AUDIO.crashLevel * scale;
    cue.delaySeconds = 0;
    cue.thumpFromHz = AUDIO.crashThumpFromHz;
    cue.thumpToHz = AUDIO.crashThumpToHz;
    cue.thumpSeconds = AUDIO.crashThumpSeconds;
    cue.noiseHz = AUDIO.crashNoiseHz;
    cue.noiseQ = 0.5;
    cue.noiseSeconds = AUDIO.crashNoiseSeconds;
    cue.toneHz = 0;
    cue.toneSeconds = 0;
    this.crashDuck = Math.max(this.crashDuck, AUDIO.duckCrash);
  }

  /**
   * Forget everything this rider's one-shots were remembering — silently.
   *
   * The audible counterpart of `reset()`, addressed: a rider teleported to the
   * spawn is not recovering from a crash, they simply stopped having one, so
   * this clears the flag without the chirp `recovered` fires. Called wherever a
   * rider's continuity ends — a quick reset, a world swap, and the moment a
   * seat is dismissed, so the next rider seated at that index does not inherit
   * a crash that happened to somebody else.
   */
  forgetRider(seat = 0): void {
    const rider = this.riderBook(seat);
    rider.impactHold = 0;
    rider.lastImpactScale = 0;
    rider.crashing = false;
  }

  /**
   * This rider is back on the wheel — M25 Phase 5's QA repair.
   *
   * **Addressed, and dispatched by the caller rather than watched here.** The
   * director used to detect the crash *end* itself, from the falling edge of
   * `RideAudioInput.crashed`, on the argument that duplicating a rising-edge
   * detector in the composition root would be the more surprising arrangement.
   * That was true with one rider and false with two: the shared input is seat
   * 0's, so a guest who crashed and recovered got no chirp at all — and the
   * only place that knows the answer per seat is the fixed step that already
   * detects the start. One edge detector, in the place that has the seats.
   *
   * It moved from the render clock to the fixed step with that change, which
   * is strictly better and matches every other one-shot: `advance(n)` reaches
   * the same recovery chirps every run.
   */
  recovered(seat = 0): void {
    const rider = this.riderBook(seat);
    // Idempotent, so a caller that simply re-states "not crashed" is correct.
    if (!rider.crashing) return;
    rider.crashing = false;
    this.recover();
  }

  /** Back on the wheel. Two rising tones — the only cue here that goes up. */
  recover(): void {
    for (let index = 0; index < 2; index += 1) {
      const cue = this.claimCue();
      if (!cue) return;
      cue.kind = 'recover';
      cue.bus = 'ui';
      cue.gain = AUDIO.recoverLevel;
      cue.delaySeconds = index * AUDIO.recoverSeconds * 0.55;
      cue.thumpFromHz = 0;
      cue.thumpToHz = 0;
      cue.thumpSeconds = 0;
      cue.noiseHz = 0;
      cue.noiseQ = 1;
      cue.noiseSeconds = 0;
      cue.toneHz = index === 0 ? AUDIO.recoverLowHz : AUDIO.recoverHighHz;
      cue.toneSeconds = AUDIO.recoverSeconds;
    }
  }

  /**
   * The paddle went through the air — M14.
   *
   * **Noise alone, no thump.** A thump is the sound of something being struck,
   * and at the moment of a swing nothing has been. Giving the whoosh a pitched
   * component would make every miss sound faintly like a hit, which is the one
   * confusion this mode cannot afford: the player's whole feedback loop is
   * "did I connect", and §13 q22 answers a miss with silence precisely so that
   * hearing the thump *means* something.
   *
   * Not rate-limited, unlike `impact`. This is a player action rather than a
   * reported level — the swing state machine will not begin another cycle until
   * this one is finished, so the mechanic limits it more tightly than a timer
   * could, and one whoosh per press is exactly the contract.
   */
  swing(): void {
    const cue = this.claimCue();
    if (!cue) return;
    cue.kind = 'swing';
    cue.bus = 'sfx';
    cue.gain = this.tuning.swingLevel;
    cue.delaySeconds = 0;
    cue.thumpFromHz = 0;
    cue.thumpToHz = 0;
    cue.thumpSeconds = 0;
    cue.noiseHz = AUDIO.swingNoiseHz;
    cue.noiseQ = AUDIO.swingNoiseQ;
    cue.noiseSeconds = AUDIO.swingNoiseSeconds;
    cue.toneHz = 0;
    cue.toneSeconds = 0;
    this.demandTransientDuck(AUDIO.duckSwing);
  }

  /**
   * One tick of a race countdown — M27 Phase 3 (§27.3, q88).
   *
   * **A tone, and nothing else.** No thump (nothing has been struck), no noise
   * burst (nothing is moving), and emphatically not a `beep`: the power
   * ladder's pattern is a *warning* and this is an instruction, and M13's
   * standing rule is that a removed beep must not come back wearing another
   * feature's name.
   *
   * Not rate-limited, because the referee is: the count fires once per whole
   * second of a clock that runs on the fixed step, so `advance(n)` reproduces
   * a start beat for beat.
   */
  raceCount(): void {
    this.emitRaceTone('count', this.tuning.raceCountLevel, AUDIO.raceCountToneHz, AUDIO.raceCountToneSeconds);
  }

  /** The release. The same shape an octave up, and the one instruction. */
  raceGo(): void {
    this.emitRaceTone('go', this.tuning.raceGoLevel, AUDIO.raceGoToneHz, AUDIO.raceGoToneSeconds);
  }

  private emitRaceTone(kind: CueKind, gain: number, hz: number, seconds: number): void {
    if (!(gain > 0)) return;
    const cue = this.claimCue();
    if (!cue) return;
    cue.kind = kind;
    // **`ui`, not `sfx`.** A countdown is the game speaking to the room rather
    // than the world making a noise, which is the same argument that puts the
    // recovery chirp and the over-speed alarm on that bus.
    cue.bus = 'ui';
    cue.gain = gain;
    cue.delaySeconds = 0;
    cue.thumpFromHz = 0;
    cue.thumpToHz = 0;
    cue.thumpSeconds = 0;
    cue.noiseHz = 0;
    cue.noiseQ = 0;
    cue.noiseSeconds = 0;
    cue.toneHz = hz;
    cue.toneSeconds = seconds;
    this.demandTransientDuck(AUDIO.duckRaceCue);
  }

  /**
   * It connected — M14. The sound the mode is played for.
   *
   * A dull thump plus a short mid burst: a padded face on a padded pad, nearer
   * a boxing mitt than a bat. It is not rate-limited either, and does not need
   * to be — but **the reason changed at M26 and the conclusion only just
   * survived it.** It used to be that a target leaves the hittable set the
   * instant it is struck, so the "this is a level, not an edge" hazard the kerb
   * knock guards against could not arise. A *rider* is now something this
   * paddle can hit, and a rider is not removed from the world by being hit: the
   * same swing reports them on every active step its head stays in reach, which
   * is two or three of them. The edge is drawn at the caller instead — one
   * swing lands on one rider once (`RiderSeat.lastRiderStrikeSwing`) — so this
   * cue is still handed one call per landed strike. One swing can legitimately
   * reach two targets, and that should still sound like two hits.
   */
  hit(): void {
    const cue = this.claimCue();
    if (!cue) return;
    cue.kind = 'hit';
    cue.bus = 'sfx';
    cue.gain = this.tuning.hitLevel;
    cue.delaySeconds = 0;
    cue.thumpFromHz = AUDIO.hitThumpFromHz;
    cue.thumpToHz = AUDIO.hitThumpToHz;
    cue.thumpSeconds = AUDIO.hitThumpSeconds;
    cue.noiseHz = AUDIO.hitNoiseHz;
    cue.noiseQ = 1.2;
    cue.noiseSeconds = AUDIO.hitNoiseSeconds;
    cue.toneHz = 0;
    cue.toneSeconds = 0;
    this.demandTransientDuck(AUDIO.duckHit);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private claimCue(): TransientCue | null {
    if (this.cueCount >= MAX_CUES_PER_UPDATE) return null;
    const cue = this.cues[this.cueCount];
    this.cueCount += 1;
    // **Reset here rather than trusted to every caller.** The ring is reused,
    // every other field is written unconditionally by whoever claims a cue, and
    // `voice` is the one field only `crash` sets — so without this a beep
    // claimed after a voiced crash would carry a stale name. Harmless today,
    // because only a crash cue is read for it; the next kind that wants a
    // recording would inherit the bug.
    cue.voice = null;
    return cue;
  }

  /**
   * One rider's one-shot bookkeeping, created the first time that seat makes a
   * sound.
   *
   * Lazy rather than sized up front because the director is handed a seat
   * number and has no opinion about how many there are — and because the array
   * is two small objects for the life of a couch session, allocated once,
   * never in a step.
   */
  private riderBook(seat: number): RiderBook {
    const index = seat >= 0 ? seat : 0;
    let book = this.riders[index];
    if (book === undefined) {
      book = { impactHold: 0, lastImpactScale: 0, crashing: false };
      this.riders[index] = book;
    }
    return book;
  }

  private demandTransientDuck(depth: number): void {
    this.transientDuck = Math.max(this.transientDuck, clamp01(depth));
  }

  /**
   * Move the tyre crossfade and resolve both slots.
   *
   * The normalisation at the end is the equal-power correction, and it is
   * exact: `f0² + f1²` is 1 whenever either envelope is above the epsilon, so
   * the total noise power is constant across a transition of any length, in
   * any direction, interrupted any number of times.
   */
  private updateTyreSlots(dt: number, input: RideAudioInput): void {
    if (input.surface !== this.currentSurface) {
      const voiceId = surfaceProperties(input.surface).tyreAudio;
      if (this.currentSurface === '') {
        // First ever surface, or the first after a reset: take a slot outright
        // rather than crossfading up from a voice that was never playing.
        this.activeSlot = 0;
        this.slotVoice[0] = voiceId;
        this.slotVoice[1] = '';
      } else {
        // **Two slots, and a rider who can cross three surfaces in a quarter
        // of a second.** M7.5 frayed every path edge on purpose, so grass and
        // gravel now interleave along a boundary a metre wide. Something has
        // to be evicted, and which one decides whether that is inaudible.
        //
        // Evict the *quieter* slot, not "the other one". Mid-transition the
        // quieter slot is the voice that only just started, so replacing it
        // discards the surface the rider barely touched while the one they
        // were actually on carries on fading out — which is what the ear
        // expects. Reversing back (A→B→A) lands the returning voice in the
        // slot the outgoing copy of A already occupies, so it simply rises
        // again.
        const next: 0 | 1 = this.slotEnvelope[0] <= this.slotEnvelope[1] ? 0 : 1;
        // Even then the evicted slot may still be audible, and its new voice
        // has a different effective weight — so the slot carries a correction
        // that holds its *output* exactly where it was, easing back to 1
        // below. The envelope itself is not touched: it feeds the shared
        // equal-power normalisation, and rescaling it steps the *other*
        // slot's output. Without any of this the swap is a step in gain, and
        // a step in gain is a click.
        const outgoing = this.slotVoice[next];
        if (outgoing !== '' && this.slotEnvelope[next] > 1e-4) {
          const before = voiceLevel(outgoing) * this.slotCorrection[next];
          const after = voiceLevel(voiceId);
          this.slotCorrection[next] = Math.min(25, Math.max(0.04, before / after));
        } else {
          this.slotCorrection[next] = 1;
        }
        this.slotVoice[next] = voiceId;
        this.activeSlot = next;
      }
      this.currentSurface = input.surface;
    }

    // Unrolled rather than iterated over a literal pair: this runs on every
    // render frame, and `[0, 1] as const` would allocate an array each time —
    // exactly the shape of garbage this project's loop comments warn about.
    this.slotEnvelope[0] = approach(
      this.slotEnvelope[0],
      this.activeSlot === 0 && this.slotVoice[0] !== '' ? 1 : 0,
      AUDIO.tyreCrossfadeSeconds,
      dt,
    );
    this.slotEnvelope[1] = approach(
      this.slotEnvelope[1],
      this.activeSlot === 1 && this.slotVoice[1] !== '' ? 1 : 0,
      AUDIO.tyreCrossfadeSeconds,
      dt,
    );
    // The eviction corrections ease home over half a crossfade — long enough
    // to be a fade, short enough that a voice never wears a borrowed level
    // for long.
    this.slotCorrection[0] = approach(
      this.slotCorrection[0], 1, AUDIO.tyreCrossfadeSeconds * 0.5, dt,
    );
    this.slotCorrection[1] = approach(
      this.slotCorrection[1], 1, AUDIO.tyreCrossfadeSeconds * 0.5, dt,
    );

    // The tyre is silent in the air, and it reaches its level with speed.
    const speedTarget = input.grounded
      ? mapRange(
        Math.abs(input.speed),
        0,
        AUDIO.tyreReferenceSpeed,
        AUDIO.tyreStandstillLevel,
        1,
      )
      : 0;
    this.tyreSpeedGain = approach(
      this.tyreSpeedGain,
      speedTarget,
      AUDIO.tyreResponseSeconds,
      dt,
    );

    // Bump excitation, from the suspension that is already answering the
    // surface table's roughness. Rectified, then smoothed a little slower than
    // the level itself so a single kerb reads as a thump and not a buzz.
    const grainTarget = input.grounded
      ? clamp01(Math.abs(input.suspensionSpeed) / AUDIO.tyreGrainReference)
      : 0;
    this.tyreGrain = approach(this.tyreGrain, grainTarget, AUDIO.tyreResponseSeconds * 2, dt);

    this.frame.tyreActive = this.activeSlot;
    const power = Math.hypot(this.slotEnvelope[0], this.slotEnvelope[1]);
    const speedFraction = clamp01(Math.abs(input.speed) / AUDIO.speedReference);
    this.resolveTyreSlot(0, power, speedFraction);
    this.resolveTyreSlot(1, power, speedFraction);
  }

  private resolveTyreSlot(index: 0 | 1, power: number, speedFraction: number): void {
    const slot = this.frame.tyre[index];
    const voiceId = this.slotVoice[index];
    slot.voiceId = voiceId;
    if (voiceId === '') {
      slot.gain = 0;
      slot.sampleGain = 0;
      slot.tokoGain = 0;
      return;
    }
    const voice = AUDIO.tyreVoices[voiceId] ?? AUDIO.tyreVoices['tyre-smooth'];
    const fade = power > 1e-4 ? this.slotEnvelope[index] / power : 0;
    const grain = 1 + voice.grain * AUDIO.tyreGrainGain * this.tyreGrain;
    const level = this.tuning.tyreLevel * voice.level * this.tyreSpeedGain * grain * fade
      * this.slotCorrection[index];
    // One voice, split three ways — synthesized bands, the recorded offroad
    // loop, and the toko rotation loop — by the voice's `sample` and `toko`
    // shares. Everything upstream — crossfade, speed envelope, grain — is
    // common, so a dirt-to-pavement boundary is still one equal-power fade
    // even though the two sides are made differently.
    slot.gain = level * (1 - voice.sample - voice.toko);
    slot.sampleGain = level * voice.sample * AUDIO.tyreSampleTrim;
    slot.tokoGain = level * voice.toko * AUDIO.tokoSampleTrim;
    slot.sampleRate = voice.sampleRate
      * lerp(AUDIO.tyreSampleRateAtRest, AUDIO.tyreSampleRateAtSpeed, speedFraction);
    // The toko asset contains one tap per revolution at `tyreReferenceSpeed`.
    // Its old shared ±10% tape sweep made a walking wheel tap almost as fast
    // as a flat-out one and agreed with the tyre only at one accidental speed.
    slot.tokoRate = speedFraction * AUDIO.speedReference / AUDIO.tyreReferenceSpeed;
    // Brightening with speed is what stops a fast pass over pavement sounding
    // like a slow one played louder.
    slot.centreHz = voice.centreHz * lerp(1, AUDIO.tyreCutoffRise, speedFraction);
    slot.q = voice.q;
    slot.lowHz = voice.lowHz;
    slot.lowGain = voice.lowLevel;
  }

  private updateMotor(dt: number, input: RideAudioInput): void {
    const t = this.tuning;
    const frame = this.frame;

    // The electrical fundamental, which is what a hub motor is actually heard
    // at — rotational frequency times pole pairs. Floored so a stopped wheel
    // hums instead of falling below hearing, and ceilinged so a descent past
    // the reference speed stops rising rather than screaming.
    //
    // **Airborne, the wheel runs away from its rider.** Lift an EUC and it
    // sweeps up toward its free-spin limit with nothing to push against; the
    // reference calls it the spool-up scream. Scaled well down from the real
    // thing, because a game hop lasts a second and the real effect is a siren
    // — but the pitch has to lift, or a hop is a hole in the mix.
    const spin = input.grounded ? 1 : AUDIO.airSpinFactor;
    const targetHz = Math.min(
      AUDIO.motorMaxHz,
      Math.max(AUDIO.motorIdleHz, rollingHz(input.speed, WHEEL_RADIUS) * t.motorPolePairs * spin),
    );
    this.motorHz = approach(this.motorHz, targetHz, AUDIO.motorResponseSeconds, dt);

    // Gain tracks *load*, not speed: a wheel holding 15 m/s on the flat is
    // quieter than one dragging itself up the return climb at 6, and that is
    // the difference the player is being told about. In the air there is no
    // load at all, which is the other half of the free-spin read.
    const drive = Math.max(input.throttle > 0 ? input.throttle : 0, clamp01(input.load));
    const load = input.grounded ? 1 : AUDIO.airDriveFactor;
    const driveTarget = (t.motorIdleLevel + t.motorLoadLevel * drive) * load;
    this.motorGain = approach(this.motorGain, driveTarget, AUDIO.motorResponseSeconds, dt);

    // The two upper partials. Both are gated by *speed*, not by load, and with
    // different curves: the third harmonic arrives early and is the body of
    // the sound, the sixth arrives late and is the only thing in the bed that
    // means "fast" rather than "moving". Together they are the spool-up.
    const speedFraction = clamp01(Math.abs(input.speed) / AUDIO.speedReference);
    this.singGain = approach(
      this.singGain,
      // Floored at the idle share rather than starting from zero: the third
      // harmonic is the only thing a speaker can reproduce while the wheel is
      // stopped, so it is what "the machine is on" sounds like.
      t.motorSingLevel * lerp(
        AUDIO.motorSingIdleShare,
        1,
        speedFraction ** AUDIO.motorSingCurve,
      ),
      AUDIO.motorResponseSeconds,
      dt,
    );
    this.airGain = approach(
      this.airGain,
      t.motorAirLevel * speedFraction ** AUDIO.motorAirCurve,
      AUDIO.motorResponseSeconds,
      dt,
    );

    // Braking, as a fraction: the one input that reshapes the filter rather
    // than adding to the stack. Only while actually moving — a brake held at a
    // standstill is the reverse-arming gesture from M2, not a deceleration.
    const braking = input.throttle < 0 && Math.abs(input.speed) > 0.5 ? -input.throttle : 0;

    // **This is where load is heard.** Speed sets the base cutoff so the upper
    // partials are only let through once they exist; load multiplies it, so a
    // wheel dragging itself up the climb opens up and brightens. Braking does
    // the opposite and pulls it back down over the partials, which — with the
    // Q lift below — sweeps a resonant peak downward as the wheel slows. An
    // electric motor working hard brightens; it does not chug, and it took a
    // sub-octave with a 7 Hz tremolo here to learn that the hard way.
    const brightness = lerp(AUDIO.motorCutoffAtRest, AUDIO.motorCutoffAtSpeed, speedFraction)
      * lerp(1, t.motorLoadBrighten, drive)
      * lerp(1, AUDIO.regenCutoffFactor, braking);
    this.motorCutoff = approach(this.motorCutoff, brightness, AUDIO.motorResponseSeconds, dt);
    this.motorQ = approach(
      this.motorQ,
      lerp(AUDIO.motorFilterQ, AUDIO.regenResonance, braking),
      AUDIO.regenResponseSeconds,
      dt,
    );

    frame.motorHz = this.motorHz;
    frame.motorDriveGain = this.motorGain;
    // Exact integer multiples, computed from the same smoothed fundamental —
    // so the three partials cannot drift apart, and therefore cannot beat.
    frame.motorSingHz = this.motorHz * AUDIO.motorSingHarmonic;
    frame.motorSingGain = this.singGain;
    frame.motorAirHz = this.motorHz * AUDIO.motorAirHarmonic;
    frame.motorAirGain = this.airGain;
    frame.motorCutoffHz = this.motorCutoff;
    frame.motorQ = this.motorQ;

    // Regen's own partial sits at the octave, which fuses with the rest of the
    // stack instead of forming an interval against it. It is deliberately the
    // quiet half of the effect: the loud half is the filter above.
    this.regenGain = approach(
      this.regenGain,
      t.regenLevel * braking * lerp(0.4, 1, speedFraction),
      AUDIO.regenResponseSeconds,
      dt,
    );
    frame.regenHz = this.motorHz * AUDIO.regenHarmonic;
    frame.regenGain = this.regenGain;
  }

  private updateWind(dt: number, input: RideAudioInput): void {
    const t = this.tuning;
    const ramp = mapRange(Math.abs(input.speed), AUDIO.windOnsetSpeed, AUDIO.speedReference, 0, 1);
    const boost = input.grounded ? 1 : AUDIO.windAirBoost;
    this.windGain = approach(
      this.windGain,
      t.windLevel * ramp ** AUDIO.windExponent * boost,
      AUDIO.windResponseSeconds,
      dt,
    );
    this.windCutoff = approach(
      this.windCutoff,
      lerp(AUDIO.windCutoffAtRest, AUDIO.windCutoffAtSpeed, ramp),
      AUDIO.windResponseSeconds,
      dt,
    );
    this.frame.windGain = this.windGain;
    this.frame.windCutoffHz = this.windCutoff;
  }

  private updateScrape(dt: number, input: RideAudioInput): void {
    // Both terms are needed. Overlap alone would scrape while parked at a lean
    // the rider cannot actually hold; speed alone would scrape all the time.
    const depth = clamp01(Math.abs(input.scrape) / AUDIO.scrapeFullOverlap);
    const speed = clamp01(Math.abs(input.speed) / AUDIO.scrapeReferenceSpeed);
    const target = input.grounded ? AUDIO.scrapeLevel * depth * speed : 0;
    this.scrapeGain = approach(this.scrapeGain, target, AUDIO.scrapeResponseSeconds, dt);
    this.frame.scrapeGain = this.scrapeGain;
    this.frame.scrapeCentreHz = AUDIO.scrapeCentreHz;
    this.frame.scrapeRingHz = AUDIO.scrapeRingHz;
    this.frame.scrapeRingGain = this.scrapeGain * AUDIO.scrapeRingLevel;
  }

  /**
   * The siren — a threat radar the player hears (M18).
   *
   * Level follows the cop's range through a curve that reads as distance;
   * inside the blend span the far wail hands over to the close wail on the
   * same equal-power law the tyre's surface fades use, and both loops lean a
   * few percent sharp while he is closing. All of it is range arithmetic: an
   * ended chase arrives here as `copRangeMetres = Infinity` and simply fades
   * on the release constant, which is why escape, bust, and quit need no
   * cases of their own.
   */
  private updateSiren(dt: number, input: RideAudioInput): void {
    const range = input.copRangeMetres;
    const live = Number.isFinite(range);

    const proximity = live
      ? mapRange(range, AUDIO.sirenFarMetres, AUDIO.sirenNearMetres, 0, 1)
        ** AUDIO.sirenDistanceCurve
      : 0;
    const target = this.tuning.sirenLevel * proximity;
    // Rising and in-pursuit falls track the ride; the release only owns the
    // fade after the pursuit itself is gone, so a cop dropping back sounds
    // like distance and a chase ending sounds like the siren being shut off.
    this.sirenGain = approach(
      this.sirenGain,
      target,
      live ? AUDIO.sirenResponseSeconds : AUDIO.sirenReleaseSeconds,
      dt,
    );

    if (live) {
      this.sirenBlend = approach(
        this.sirenBlend,
        mapRange(range, AUDIO.sirenBlendFarMetres, AUDIO.sirenBlendNearMetres, 0, 1),
        AUDIO.sirenBlendSeconds,
        dt,
      );
    }

    // The lean is identical on both loops — a blend of two rates would detune
    // the crossfade — and eases home to native pitch when the pursuit ends.
    const lean = live
      ? clamp(
        input.copClosingSpeed * AUDIO.sirenDopplerPerMs,
        -AUDIO.sirenDopplerMax,
        AUDIO.sirenDopplerMax,
      )
      : 0;
    this.sirenRate = approach(this.sirenRate, 1 + lean, AUDIO.sirenRateSeconds, dt);

    const fade = equalPowerCrossfade(this.sirenBlend);
    this.frame.sirenFarGain = this.sirenGain * fade.from;
    this.frame.sirenCloseGain = this.sirenGain * fade.to;
    this.frame.sirenRate = this.sirenRate;
  }

  /**
   * The power ladder, as sound.
   *
   * The duck is *pulsed* by each beep rather than held for the whole rung, and
   * the difference is the design: at the notice rung the motor dips briefly
   * every 1.3 s and the climb still sounds like a climb, while at tilt-back the
   * beeps arrive faster than the duck releases and the bed simply stays down.
   * Escalation falls out of the timing instead of needing a second mechanism.
   */
  private updateWarnings(dt: number, input: RideAudioInput): void {
    const pattern = this.beepPattern(input.powerStage);

    if (input.powerStage !== this.beepStage) {
      this.beepStage = input.powerStage;
      // Fire immediately on any change *up* the ladder. A rung that waits out
      // the remainder of the previous rung's period announces itself up to a
      // second late, which at tilt-back is a second the rider needed.
      this.beepTimer = 0;
    }

    if (pattern === null || input.idle) {
      this.beepTimer = 0;
      this.beepDuckHold = Math.max(0, this.beepDuckHold - dt);
      return;
    }

    this.beepTimer -= dt;
    if (this.beepTimer <= 0) {
      this.beepTimer += pattern.periodSeconds;
      // Guard the pathological case of a period shorter than the step.
      if (this.beepTimer <= 0) this.beepTimer = pattern.periodSeconds;
      this.emitBeep(pattern, 0);
      if (pattern.double) this.emitBeep(pattern, AUDIO.beepDoubleGapSeconds);
      // Hold the duck a little past the beep itself, so the motor is out of
      // the way for the beep's decay as well as its attack.
      this.beepDuckHold = AUDIO.beepSeconds * 2.2
        + (pattern.double ? AUDIO.beepDoubleGapSeconds : 0);
    }
    this.beepDuckHold = Math.max(0, this.beepDuckHold - dt);
  }

  /**
   * The over-speed beeps — M20, and the one warning the owner asked back.
   *
   * **The rate is the message.** There is one pitch, one level and one length;
   * everything the player learns comes from how often it arrives, from about
   * one a second at 40 mph to seven a second at the edge — both cadences
   * measured off the reference video, at the owner's request. That is what a
   * real wheel does, it is what the owner described ("riding the beeps"), and
   * it is also what keeps the arcade rules honest: a warning that got louder or
   * higher as it got worse would be the thing that hurts, and rule 3 says a
   * warning wins by ducking.
   *
   * **The phase is not reset by a change of rate**, unlike the ladder above,
   * which fires immediately on any rung change. A rider accelerating through
   * the band changes rate continuously, and re-firing on every change would
   * produce a stream of beeps at no rate at all. What the timer does instead is
   * carry its remainder forward and re-clock against the new period, so the
   * pattern tightens smoothly and a rider holding a steady speed hears a steady
   * rate they can recognise.
   */
  private updateOverspeed(dt: number, input: RideAudioInput): void {
    // One level, not a constant times a master: `AUDIO.overspeedLevel` *is* the
    // F4 slider, exactly as `sirenLevel` is. Two multiplied levels would mean
    // the number in the tuning table and the number the owner drags are
    // different quantities, which is how a slider ends up with a useful range
    // of one fifth of its travel.
    const level = this.tuning.overspeedLevel;
    const active = input.overspeed > 0 && level > 0 && !input.idle;
    if (!active) {
      // Re-armed rather than left where it was: a rider who drops out of the
      // band and climbs back into it should be beeped at straight away, and a
      // stale remainder would swallow the first one.
      this.overspeedTimer = 0;
      this.overspeedDuckHold = Math.max(0, this.overspeedDuckHold - dt);
      return;
    }

    const period = overspeedBeepPeriod(
      input.overspeed,
      AUDIO.overspeedSlowestPeriodSeconds,
      AUDIO.overspeedFastestPeriodSeconds,
    );

    this.overspeedTimer -= dt;
    if (this.overspeedTimer <= 0) {
      this.overspeedTimer += period;
      // The pathological case of a period shorter than the step, which a
      // dragged slider can produce and a hang cannot be allowed to follow.
      if (this.overspeedTimer <= 0) this.overspeedTimer = period;
      this.emitOverspeedBeep(level);
      // Long enough to cover the beep's own decay, and capped at the period so
      // that at the top of the ramp the duck is continuous rather than
      // retriggered into a tremolo on the bed — which is rule 4.
      this.overspeedDuckHold = Math.min(period, AUDIO.overspeedBeepSeconds * 2.2);
    }
    this.overspeedDuckHold = Math.max(0, this.overspeedDuckHold - dt);
  }

  /**
   * One over-speed beep.
   *
   * `kind: 'overspeed'` rather than `'beep'`, and the sink keys the *recording*
   * off it. A synthesized tone remains the fallback before the sample bank
   * lands, exactly as it is for a crash — a player on a slow connection gets a
   * warning that is the wrong timbre rather than no warning at all, and the
   * cutout is a rule that fires either way.
   */
  private emitOverspeedBeep(level: number): void {
    const cue = this.claimCue();
    if (!cue) return;
    cue.kind = 'overspeed';
    cue.bus = 'ui';
    cue.gain = level;
    cue.delaySeconds = 0;
    cue.thumpFromHz = 0;
    cue.thumpToHz = 0;
    cue.thumpSeconds = 0;
    cue.noiseHz = 0;
    cue.noiseQ = 1;
    cue.noiseSeconds = 0;
    cue.toneHz = AUDIO.overspeedFallbackHz;
    cue.toneSeconds = AUDIO.overspeedBeepSeconds;
  }

  private emitBeep(pattern: BeepPattern, delaySeconds: number): void {
    const cue = this.claimCue();
    if (!cue) return;
    cue.kind = 'beep';
    cue.bus = 'ui';
    cue.gain = pattern.level;
    cue.delaySeconds = delaySeconds;
    cue.thumpFromHz = 0;
    cue.thumpToHz = 0;
    cue.thumpSeconds = 0;
    cue.noiseHz = 0;
    cue.noiseQ = 1;
    cue.noiseSeconds = 0;
    cue.toneHz = pattern.hz;
    cue.toneSeconds = AUDIO.beepSeconds;
  }

  /**
   * Silenced by owner decision — `AUDIO.beepLevel` is 0, so this returns
   * null for every rung and the ladder neither beeps nor ducks the bed. The
   * patterns are kept whole behind the one master (`Warning beeps` on F4)
   * rather than deleted, the same one-slider-deep treatment the motor got.
   */
  private beepPattern(stage: PowerStage): BeepPattern | null {
    const master = this.tuning.beepLevel;
    if (master <= 0) return null;
    switch (stage) {
      case 'notice':
        return {
          hz: AUDIO.noticeHz,
          periodSeconds: AUDIO.noticePeriodSeconds,
          level: AUDIO.noticeLevel * master,
          duck: AUDIO.duckNotice,
          double: false,
        };
      case 'warn':
        return {
          hz: AUDIO.warnHz,
          periodSeconds: AUDIO.warnPeriodSeconds,
          level: AUDIO.warnLevel * master,
          duck: AUDIO.duckWarn,
          double: true,
        };
      case 'tiltBack':
        return {
          hz: AUDIO.tiltBackHz,
          periodSeconds: AUDIO.tiltBackPeriodSeconds,
          level: this.tuning.tiltBackLevel * master,
          duck: this.tuning.duckTiltBack,
          double: false,
        };
      default:
        return null;
    }
  }

  /**
   * Everything that multiplies the ride bed, resolved into one number.
   *
   * Four independent reasons the bed goes down, deliberately kept apart: a
   * warning is ducking it, a transient is ducking it, the rider is off the
   * wheel, or the game is not simulating. Combining them multiplicatively
   * rather than taking a maximum is what makes a crash during tilt-back
   * quieter than either alone — which is correct, because at that moment
   * neither the motor nor the beeps are the thing worth hearing.
   */
  private updateBed(dt: number, input: RideAudioInput): void {
    const pattern = this.beepPattern(input.powerStage);
    const ladderDemand = pattern !== null && this.beepDuckHold > 0 ? pattern.duck : 0;
    // The over-speed beep ducks on the same mechanism and its own depth — M20.
    // Taken as a maximum with the ladder rather than multiplied, because the
    // two are alternative descriptions of the same trouble and stacking them
    // would push the bed twice as far down for a wheel in no more danger.
    const overspeedDemand = this.overspeedDuckHold > 0 ? AUDIO.overspeedDuck : 0;
    const warningDemand = Math.max(ladderDemand, overspeedDemand);

    // Transient duck demand decays on its own, so a single impact ducks and
    // releases without anything having to remember to cancel it.
    this.transientDuck = Math.max(
      0,
      this.transientDuck - dt / Math.max(1e-6, AUDIO.duckReleaseSeconds),
    );

    this.duck = stepDuck(
      this.duck,
      Math.max(warningDemand, this.transientDuck),
      AUDIO.duckAttackSeconds,
      AUDIO.duckReleaseSeconds,
      dt,
    );
    this.crashDuck = stepDuck(
      this.crashDuck,
      0,
      AUDIO.duckAttackSeconds,
      AUDIO.duckCrashReleaseSeconds,
      dt,
    );

    this.crashedBed = approach(
      this.crashedBed,
      input.crashed ? AUDIO.crashedBedGain : 1,
      AUDIO.crashedBedSeconds,
      dt,
    );

    // The fade to and from silence when the game stops simulating. Fast, but
    // not instant: pause has to be a fade or it is a click.
    this.idleGain = approach(this.idleGain, input.idle ? 0 : 1, 0.05, dt);

    // **`input.crashed` reaches the bed gain above and nothing else**, since
    // the Phase 5 QA repair. It answers for the rider the continuous mix
    // follows — seat 0 — and the recovery chirp and the kerb-strike gate are
    // per rider, dispatched from the fixed step by the one place that knows
    // how many riders there are (`RiderBook`, `recovered`).

    this.frame.duck = this.duck;
    this.frame.crashDuck = this.crashDuck;
    this.frame.bedGain = this.tuning.bedTrim
      * duckToGain(this.duck)
      * duckToGain(this.crashDuck)
      * this.crashedBed
      * this.idleGain;
  }
}

/** The tyre voice for a surface, through the surface table's `tyreAudio` id. */
export function tyreVoiceFor(surface: SurfaceId): TyreVoice {
  const id = surfaceProperties(surface).tyreAudio;
  return AUDIO.tyreVoices[id] ?? AUDIO.tyreVoices['tyre-smooth'];
}

/**
 * A voice's *effective* output weight, for the crossfade's level-preserving
 * eviction. Not the raw `level`: a sampled voice's output is its level times
 * the asset trim, so rescaling by `level` alone would step the slot's output
 * by the whole trim factor at a synth-to-sampled boundary.
 */
function voiceLevel(voiceId: string): number {
  const voice = AUDIO.tyreVoices[voiceId] ?? AUDIO.tyreVoices['tyre-smooth'];
  return voice.level * (
    1 - voice.sample - voice.toko
    + voice.sample * AUDIO.tyreSampleTrim
    + voice.toko * AUDIO.tokoSampleTrim
  );
}
