/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AUDIO, WHEEL } from '../data/tuning.ts';
import { SURFACES, SURFACE_IDS } from '../data/surfaces.ts';
import { rollingHz } from './mix.ts';
import {
  AudioDirector,
  createRideAudioInput,
  tyreVoiceFor,
  type RideAudioInput,
  type TransientCue,
} from './director.ts';

/**
 * The audio model, asserted with no audio context and no browser.
 *
 * `docs/PLANS.md` §14 states M8's acceptance criteria as four sentences —
 * *motor pitch tracks speed · tire sound changes with surface · wind rises
 * with speed · warnings audible over everything else* — and all four are
 * arithmetic over the director's output. They are asserted here, once, in the
 * layer that decides them, rather than inferred from a spectrogram in a
 * browser where nothing can be isolated.
 *
 * The exit question's own second half — *is the right thing the loudest
 * thing?* — is the ducking ordering at the bottom.
 */

const STEP = 1 / 60;

/** Run the director for `seconds` at render cadence, collecting any cues. */
function run(
  director: AudioDirector,
  seconds: number,
  input: RideAudioInput,
): TransientCue[] {
  const collected: TransientCue[] = [];
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    director.update(STEP, input);
    for (let c = 0; c < director.cueCount; c += 1) {
      // Copied out: the ring is reused once cleared, by design.
      collected.push({ ...director.cues[c] });
    }
    // Draining is the consumer's job — see `AudioDirector.clearCues`. A test
    // that forgets it fills the ring and then silently drops every later cue,
    // which is the same failure the engine would have.
    director.clearCues();
  }
  return collected;
}

function riding(overrides: Partial<RideAudioInput> = {}): RideAudioInput {
  return Object.assign(createRideAudioInput(), overrides);
}

// ---------------------------------------------------------------------------
// The four acceptance sentences
// ---------------------------------------------------------------------------

test('motor pitch tracks speed, and it is the electrical fundamental', () => {
  const director = new AudioDirector();
  const radius = WHEEL.tyreDiameter * 0.5;

  const seen: number[] = [];
  for (const speed of [0, 3, 8, 15]) {
    director.reset();
    run(director, 2, riding({ speed }));
    seen.push(director.frame.motorHz);
  }

  // Strictly rising with speed, which is the acceptance sentence itself.
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `motor pitch did not rise from ${seen[i - 1]} to ${seen[i]}`);
  }

  // And it is the *electrical* fundamental, not the rotation rate. A hub
  // motor's audible pitch is rotation times pole pairs; getting this wrong
  // gives a 9.5 Hz flutter at top speed instead of a 143 Hz whine, which is
  // the difference between an EUC and a fan.
  const expectedTop = rollingHz(15, radius) * AUDIO.motorPolePairs;
  assert.ok(
    Math.abs(seen[3] - expectedTop) < 1,
    `top-speed fundamental was ${seen[3]} Hz, expected about ${expectedTop} Hz`,
  );
  assert.ok(seen[3] > 130 && seen[3] < 160, 'top speed should land near 143 Hz');
});

test('the motor is silent by default, and one slider revives it — rule 5', () => {
  // The owner, after reviewing his own ride footage: a real EUC over solid
  // terrain is nearly silent, and both synthesized motors failed by ear not in
  // timbre but in existing. The pitch model still runs (the fundamental floors
  // at the idle Hz), but every motor level defaults to zero — and the second
  // half of the test is the reversibility promise the tuning panel makes.
  const director = new AudioDirector();
  run(director, 1, riding({ speed: 0 }));
  assert.equal(director.frame.motorHz, AUDIO.motorIdleHz);
  assert.ok(
    director.frame.motorDriveGain < 1e-3,
    'rule 5: the parked wheel is silent by design',
  );

  director.setTuning({ motorIdleLevel: 0.09 });
  run(director, 1, riding({ speed: 0 }));
  assert.ok(
    director.frame.motorDriveGain > 0.05,
    'raising the F4 slider must revive the hum — the silence has to stay one slider deep',
  );
});

test('motor pitch is ceilinged, so a descent past top speed cannot scream', () => {
  const director = new AudioDirector();
  run(director, 2, riding({ speed: 60 }));
  assert.ok(Math.abs(director.frame.motorHz - AUDIO.motorMaxHz) < 1e-3);
});

test('tyre sound changes with surface, and every surface has a voice of its own', () => {
  // The acceptance sentence, and the completeness guarantee behind it: a
  // surface added later without a voice must fail here rather than roll
  // silently in play.
  const centres = new Map<string, number>();
  for (const id of SURFACE_IDS) {
    const voice = tyreVoiceFor(id);
    assert.ok(voice, `${id} has no tyre voice for its "${SURFACES[id].tyreAudio}" id`);
    assert.ok(voice.centreHz > 100 && voice.centreHz < 8000, `${id} centre is out of range`);
    assert.ok(voice.level > 0 && voice.level <= 1, `${id} level is out of range`);
    assert.ok(voice.grain >= 0 && voice.grain <= 1, `${id} grain is out of range`);
    centres.set(SURFACES[id].tyreAudio, voice.centreHz);
  }
  assert.equal(centres.size, SURFACE_IDS.length, 'two surfaces share one tyre voice');

  // Distinguishable, not merely distinct: two voices a few Hz apart pass a
  // deepEqual and sound identical. A quarter-octave is the floor for "the
  // player can tell these apart", which is what §14 actually asks for.
  const sorted = [...centres.values()].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(
      sorted[i] / sorted[i - 1] > 1.25,
      `tyre voices at ${sorted[i - 1]} Hz and ${sorted[i]} Hz are too close to tell apart`,
    );
  }
});

test('gravel is louder than pavement, and it is the recording that carries it', () => {
  // Rule 5's contrast, asserted from both sides: solid surfaces are a faint
  // synthesized hiss, offroad is the owner-approved recording at full level.
  // The gap between them *is* the design — his footage review found exactly
  // this split in the real machine.
  const director = new AudioDirector();
  const totals: Record<string, number> = {};
  for (const surface of ['pavement', 'gravel'] as const) {
    director.reset();
    run(director, 2, riding({ speed: 9, surface }));
    const [a, b] = director.frame.tyre;
    totals[surface] = a.gain + b.gain + a.sampleGain + b.sampleGain;
  }
  assert.ok(
    totals.gravel > totals.pavement * 2.5,
    `gravel (${totals.gravel}) must be clearly louder than pavement (${totals.pavement})`,
  );

  // And each side is made the way it claims: pavement the toko rotation loop
  // over a whisper of hiss, gravel entirely the offroad recording.
  director.reset();
  run(director, 2, riding({ speed: 9, surface: 'pavement' }));
  assert.ok(director.frame.tyre[0].gain > 0.005, 'pavement keeps a whisper of hiss');
  assert.ok(director.frame.tyre[0].sampleGain < 1e-6, 'pavement does not play the offroad recording');
  // The owner's audition pick (2026-08-04): solid ground goes "tokotokotok
  // not shhhhh", and the toko path carries more of pavement than the hiss.
  assert.ok(
    director.frame.tyre[0].tokoGain > director.frame.tyre[0].gain,
    'the toko loop must carry the solid-surface rotation',
  );
  director.reset();
  run(director, 2, riding({ speed: 9, surface: 'gravel' }));
  assert.ok(director.frame.tyre[0].sampleGain > 0.1, 'gravel rides on the recording');
  assert.ok(director.frame.tyre[0].gain < 1e-6, 'and nothing synthesized doubles it');
  assert.ok(director.frame.tyre[0].tokoGain < 1e-6, 'the toko taps stay off the crunch');
});

test('the surface ladder is a contrast, not a cliff', () => {
  // The other half of the test above, and the half that was missing while the
  // owner rode it. "Gravel is clearly louder than pavement" has no ceiling, so
  // it was equally happy at the 23.5 dB gravel actually shipped with: rule 5
  // cut the solid surfaces to a third and left the two sampled voices alone,
  // and nobody did the subtraction. A surface bed plays continuously for
  // minutes, so the spread across the whole table is the number that decides
  // whether crossing onto a shoulder is a change of texture or a fright.
  //
  // Measured in the same effective domain the crossfade's eviction uses — a
  // sampled voice's output is its level times the asset trim, so raw `level`
  // compares two different units and would call gravel *quieter* than wood.
  const effective = (id: string): number => {
    const voice = AUDIO.tyreVoices[id]!;
    return voice.level * (
      1 - voice.sample - voice.toko
      + voice.sample * AUDIO.tyreSampleTrim
      + voice.toko * AUDIO.tokoSampleTrim
    );
  };
  const pavement = effective('tyre-smooth');
  for (const id of Object.keys(AUDIO.tyreVoices)) {
    const dB = 20 * Math.log10(effective(id) / pavement);
    assert.ok(
      dB <= 12,
      `${id} sits ${dB.toFixed(1)} dB over pavement; a continuous bed may lead the table, not tower over it`,
    );
    assert.ok(dB >= -12, `${id} sits ${dB.toFixed(1)} dB under pavement, which is inaudible under the motor`);
  }

  // And the loose ground still reads as a ladder rather than as one lump.
  assert.ok(effective('tyre-gravel') > effective('tyre-dirt'), 'gravel is looser than dirt');
  assert.ok(effective('tyre-dirt') > effective('tyre-grass'), 'dirt crunches where grass swishes');
});

test('the offroad recording tracks gently, while toko follows wheel rotation exactly', () => {
  // One recording has one speed in it; the rate sweep is what lets it track
  // the ride. Bounded tightly, because a recording shifted much past ±15% is
  // audibly a tape effect — the classic failure of sampled vehicle audio.
  const director = new AudioDirector();
  run(director, 2, riding({ speed: 1, surface: 'dirt' }));
  const slow = director.frame.tyre[0].sampleRate;
  run(director, 2, riding({ speed: 15, surface: 'dirt' }));
  const fast = director.frame.tyre[0].sampleRate;
  assert.ok(fast > slow, `rate must rise with speed (${slow} to ${fast})`);
  assert.ok(slow > 0.8 && fast < 1.25, `rates ${slow}..${fast} left the natural-sounding band`);

  // Gravel reads looser and brighter than dirt from the same recording — the
  // per-voice trim is the only thing telling them apart, so it must differ.
  director.reset();
  run(director, 2, riding({ speed: 9, surface: 'gravel' }));
  const gravelRate = director.frame.tyre[0].sampleRate;
  director.reset();
  run(director, 2, riding({ speed: 9, surface: 'dirt' }));
  assert.ok(gravelRate > director.frame.tyre[0].sampleRate * 1.05, 'gravel plays faster than dirt');

  // Toko is different: it was synthesized at one tap per wheel revolution at
  // 9 m/s. Sharing the recording's ±10% tape sweep made a walking wheel tap
  // far too fast and a flat-out wheel too slowly. Its resolved cadence must
  // be the tyre's actual rotational frequency at every riding speed.
  const radius = WHEEL.tyreDiameter * 0.5;
  const referenceHz = rollingHz(AUDIO.tyreReferenceSpeed, radius);
  for (const speed of [1, 4.5, 9, 15]) {
    director.reset();
    run(director, 2, riding({ speed, surface: 'pavement' }));
    const resolvedHz = director.frame.tyre[0].tokoRate * referenceHz;
    const expectedHz = rollingHz(speed, radius);
    assert.ok(
      Math.abs(resolvedHz - expectedHz) < 1e-6,
      `toko cadence was ${resolvedHz} Hz at ${speed} m/s, expected ${expectedHz}`,
    );
  }
});

test('wind rises with speed, and is silent below the onset', () => {
  const director = new AudioDirector();
  const seen: number[] = [];
  for (const speed of [0, 2, 6, 10, 15]) {
    director.reset();
    run(director, 3, riding({ speed }));
    seen.push(director.frame.windGain);
  }
  assert.equal(seen[0], 0, 'a parked wheel has no wind');
  assert.ok(seen[1] < 1e-6, 'below the onset speed there is no wind');
  for (let i = 3; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `wind did not rise from ${seen[i - 1]} to ${seen[i]}`);
  }
  // Above one, so wind arrives late and hard rather than tracking speed
  // linearly — the cue that separates 15 m/s from 8.
  const halfway = seen[3] / seen[4];
  assert.ok(halfway < 0.5, `wind at 10 m/s was ${halfway} of top; the curve is too flat`);
});

test('the ladder is silent by default, and revived warnings duck harder at each rung', () => {
  // The beeps are gone by owner decision — "get rid of the tiltback beeps, no
  // reason to have that annoyance in arcade (this not a sim)" — and with them
  // their ducking: a bed pumping for a warning nobody hears would be worse
  // than the beeps were. First prove the default is genuinely silent at the
  // top rung, then revive the ladder through the one master and prove the
  // old design is still whole behind it: a warning wins by pushing the wheel
  // down, not by being turned up, and the ordering is the whole design.
  const silent = new AudioDirector();
  const silentInput = riding({ speed: 8, throttle: 1, load: 0.9, powerStage: 'tiltBack' });
  run(silent, 0.5, silentInput);
  let flattest = Infinity;
  for (let i = 0; i < 240; i += 1) {
    silent.update(STEP, silentInput);
    assert.equal(silent.cueCount, 0, 'no rung may emit a beep cue at the defaults');
    silent.clearCues();
    flattest = Math.min(flattest, silent.frame.bedGain);
  }
  assert.ok(
    Math.abs(flattest - AUDIO.bedTrim) < 1e-3,
    `a silent ladder must not duck the bed either, but it dipped to ${flattest}`,
  );

  const depths: number[] = [];
  for (const stage of ['normal', 'notice', 'warn', 'tiltBack'] as const) {
    const director = new AudioDirector();
    director.setTuning({ beepLevel: 1 });
    const input = riding({ speed: 8, throttle: 1, load: 0.9, powerStage: stage });
    // Warm up past the fade-in from silence before measuring, or every stage
    // reports the same minimum: the first frame, when nothing was playing yet.
    run(director, 0.5, input);
    // Then long enough to cover the slowest rung's period, so every stage has
    // actually beeped and its duck is at work.
    let lowest = Infinity;
    for (let i = 0; i < 240; i += 1) {
      director.update(STEP, input);
      director.clearCues();
      lowest = Math.min(lowest, director.frame.bedGain);
    }
    depths.push(lowest);
  }
  for (let i = 1; i < depths.length; i += 1) {
    assert.ok(
      depths[i] < depths[i - 1],
      `rung ${i} did not duck harder than rung ${i - 1} (${depths[i]} vs ${depths[i - 1]})`,
    );
  }
  assert.ok(
    Math.abs(depths[0] - AUDIO.bedTrim) < 1e-3,
    `nothing should duck the bed while the ladder is quiet, but it sat at ${depths[0]}`,
  );
  assert.ok(depths[3] < AUDIO.bedTrim * 0.6, 'tilt-back must clearly own the mix');
});

// ---------------------------------------------------------------------------
// The crossfade
// ---------------------------------------------------------------------------

test('a surface change crossfades at constant power rather than dipping', () => {
  const director = new AudioDirector();
  const input = riding({ speed: 9, surface: 'pavement' });
  run(director, 2, input);
  const before = director.frame.tyre[0].gain + director.frame.tyre[1].gain;

  input.surface = 'roughPavement';
  let dip = Infinity;
  for (let i = 0; i < 40; i += 1) {
    director.update(STEP, input);
    dip = Math.min(dip, director.frame.tyre[0].gain + director.frame.tyre[1].gain);
  }
  // Rough pavement is louder than pavement, so the sum should never fall below
  // the quieter of the two. A linear crossfade would sag through the middle.
  assert.ok(dip > before * 0.85, `the tyre dipped to ${dip} from ${before} across the boundary`);
});

test('the crossfade survives a rapid sequence of surface changes', () => {
  // The slice has boundaries a rider crosses in a fraction of a second — the
  // gravel spur's edges, the frayed grass margins. A crossfade that restarts
  // from zero on each change makes the outgoing voice jump back to full.
  const director = new AudioDirector();
  const input = riding({ speed: 9, surface: 'pavement' });
  run(director, 1, input);

  // Total output across both slots and all three construction paths: a
  // voice's level is split between synthesis, the offroad recording, and the
  // toko loop, so continuity is a property of the sum, not of any path alone.
  const output = (): number => {
    const [a, b] = director.frame.tyre;
    return a.gain + b.gain + a.sampleGain + b.sampleGain + a.tokoGain + b.tokoGain;
  };
  let previous = output();
  for (const surface of ['grass', 'gravel', 'grass', 'dirt', 'pavement'] as const) {
    input.surface = surface;
    // No step larger than a quarter of the loudest voice's full effective
    // gain in one frame: that is the threshold above which a transition stops
    // being a fade and becomes an edge. Scaled to the effective scale rather
    // than written as a constant, because the sample trim multiplied the top
    // of the range — the same 0.2 s crossfade now covers three times the gain
    // entering gravel, which is a *fast fade* (the sink still glides every
    // write), not a click.
    const step = 0.25 * AUDIO.tyreSampleTrim * AUDIO.tyreLevel;
    for (let i = 0; i < 6; i += 1) {
      director.update(STEP, input);
      const total = output();
      assert.ok(
        Math.abs(total - previous) < step,
        `tyre level jumped from ${previous} to ${total} entering ${surface}`,
      );
      previous = total;
    }
  }
});

test('the tyre is silent in the air and at a standstill', () => {
  const total = (director: AudioDirector): number =>
    director.frame.tyre[0].gain + director.frame.tyre[0].sampleGain;
  const director = new AudioDirector();
  run(director, 2, riding({ speed: 12, surface: 'gravel' }));
  assert.ok(total(director) > 0.05, 'a wheel rolling on gravel makes noise');

  run(director, 1, riding({ speed: 12, surface: 'gravel', grounded: false }));
  assert.ok(total(director) < 0.005, 'nothing is touching the ground in the air');

  director.reset();
  run(director, 2, riding({ speed: 0, surface: 'gravel' }));
  assert.ok(total(director) < 0.005, 'a stopped tyre makes no noise');
});

test('bumps make the tyre work, and only on surfaces that have grain', () => {
  const director = new AudioDirector();
  const smooth = riding({ speed: 9, surface: 'pavement' });
  run(director, 2, smooth);
  const pavementQuiet = director.frame.tyre[0].gain;
  run(director, 1, riding({ speed: 9, surface: 'pavement', suspensionSpeed: 0.5 }));
  const pavementBumpy = director.frame.tyre[0].gain;

  director.reset();
  run(director, 2, riding({ speed: 9, surface: 'gravel' }));
  const gravelQuiet = director.frame.tyre[0].sampleGain;
  run(director, 1, riding({ speed: 9, surface: 'gravel', suspensionSpeed: 0.5 }));
  const gravelBumpy = director.frame.tyre[0].sampleGain;

  assert.ok(gravelBumpy / gravelQuiet > pavementBumpy / pavementQuiet * 1.5,
    'gravel should answer the suspension far more than pavement does');
});

// ---------------------------------------------------------------------------
// The motor's other layers
// ---------------------------------------------------------------------------

test('the motor answers load, not only speed — when revived', () => {
  // Default is silence at every load (rule 5); the load model itself is kept
  // alive behind the sliders, so the check runs at the second pass's levels.
  const director = new AudioDirector();
  run(director, 2, riding({ speed: 8, throttle: 1, load: 0.9 }));
  assert.ok(director.frame.motorDriveGain < 1e-3, 'full load is still silent by default');

  director.setTuning({ motorIdleLevel: 0.09, motorLoadLevel: 0.20 });
  director.reset();
  run(director, 2, riding({ speed: 8, throttle: 0, load: 0 }));
  const coasting = director.frame.motorDriveGain;
  run(director, 2, riding({ speed: 8, throttle: 1, load: 0.9 }));
  const climbing = director.frame.motorDriveGain;
  assert.ok(
    climbing > coasting * 1.8,
    `dragging up a hill (${climbing}) must be audibly harder work than coasting (${coasting})`,
  );
});

test('the motor is one harmonic series, and no part of it is detuned', () => {
  // **This test exists because the first pass failed the owner's ride.** Two
  // sawtooths seven cents apart over a tremolo'd sub-octave is a recipe for an
  // internal-combustion engine: detuning is how cylinders are put out of phase
  // and a modulated sub-octave is how a stroke is written. Exact integer
  // harmonics fuse into one timbre instead and cannot beat at any speed, which
  // is what an electric machine sounds like. Rule 1 of the `AUDIO` group.
  const director = new AudioDirector();
  for (const speed of [0, 4, 9, 15]) {
    director.reset();
    run(director, 2, riding({ speed, throttle: 1 }));
    const frame = director.frame;
    const partials: readonly [number, number, string][] = [
      [frame.motorSingHz, AUDIO.motorSingHarmonic, 'sing'],
      [frame.motorAirHz, AUDIO.motorAirHarmonic, 'air'],
      [frame.regenHz, AUDIO.regenHarmonic, 'regen'],
    ];
    for (const [hz, harmonic, name] of partials) {
      const beat = Math.abs(hz - frame.motorHz * harmonic);
      // A hundredth of a hertz is a beat period of a hundred seconds. Anything
      // a listener could hear as movement is orders of magnitude above this.
      assert.ok(
        beat < 0.01,
        `the ${name} partial is ${beat} Hz off the exact ${harmonic}th at ${speed} m/s — `
          + 'any offset at all is a beat, and a beat at this fundamental is an engine',
      );
    }
  }
});

test('braking is a descending resonant sweep, and only while moving', () => {
  // The regen partial defaults to silent with the rest of the motor; the
  // sweep machinery is asserted at the revived level so it stays correct for
  // the day the slider comes back up.
  const director = new AudioDirector();
  director.setTuning({ regenLevel: 0.14 });
  const coasting = new AudioDirector();
  run(coasting, 2, riding({ speed: 10, throttle: 0 }));
  const openCutoff = coasting.frame.motorCutoffHz;

  run(director, 2, riding({ speed: 10, throttle: -1 }));
  assert.ok(director.frame.regenGain > 0.05, 'regen must be audible under braking');
  // The octave, so it fuses with the stack instead of forming an interval
  // against it — the first pass used a fifth, which was a chord over a motor.
  const ratio = director.frame.regenHz / director.frame.motorHz;
  assert.ok(Math.abs(ratio - AUDIO.regenHarmonic) < 0.01, `regen interval was ${ratio}`);
  // And the loud half of the effect: the filter closes over the partials and
  // its Q lifts into a peak, so the motor is swept rather than added to.
  assert.ok(
    director.frame.motorCutoffHz < openCutoff * 0.6,
    `braking must pull the cutoff down (${director.frame.motorCutoffHz} against ${openCutoff})`,
  );
  assert.ok(
    director.frame.motorQ > AUDIO.motorFilterQ * 2,
    `braking must lift the resonance (Q was ${director.frame.motorQ})`,
  );

  director.reset();
  // Brake held at a standstill is M2's reverse-arming gesture, not braking.
  run(director, 2, riding({ speed: 0, throttle: -1 }));
  assert.ok(director.frame.regenGain < 1e-3, 'a stationary wheel is not regenerating');
  assert.ok(Math.abs(director.frame.motorQ - AUDIO.motorFilterQ) < 0.05, 'and it does not ring');

  director.reset();
  run(director, 2, riding({ speed: 10, throttle: 1 }));
  assert.ok(director.frame.regenGain < 1e-3, 'accelerating is not braking');
});

test('working hard is heard as brightness, not as a modulated sub-octave', () => {
  // The replacement for the strain layer, and the reason it was replaced: an
  // electric motor under load brightens, it does not chug. Load moves the
  // filter, and the filter is the only thing that changes.
  const director = new AudioDirector();
  const seen: number[] = [];
  for (const load of [0, 0.35, 0.7, 1.0]) {
    director.reset();
    run(director, 2, riding({ speed: 6, load }));
    seen.push(director.frame.motorCutoffHz);
  }
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] > seen[i - 1], `brightness must grow with load: ${seen.join(', ')}`);
  }
  assert.ok(
    seen[3] > seen[0] * 1.8,
    `full load must be unmistakably brighter than none (${seen[0]} to ${seen[3]})`,
  );

  // The upper partials are gated by *speed*, not by load, so the two axes stay
  // independent: a hard climb at 6 m/s is bright, and it is still not fast.
  // Asserted at the revived level, since the default is silence.
  director.setTuning({ motorAirLevel: 0.12 });
  director.reset();
  run(director, 2, riding({ speed: 6, load: 1, throttle: 1 }));
  const slowClimb = director.frame.motorAirGain;
  director.reset();
  run(director, 2, riding({ speed: 15, load: 0 }));
  assert.ok(director.frame.motorAirGain > slowClimb * 2, 'the sixth harmonic means speed');
});

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

test('each rung beeps at its own pitch and rate', () => {
  const cases = [
    { stage: 'notice' as const, hz: AUDIO.noticeHz, period: AUDIO.noticePeriodSeconds, perCycle: 1 },
    { stage: 'warn' as const, hz: AUDIO.warnHz, period: AUDIO.warnPeriodSeconds, perCycle: 2 },
    {
      stage: 'tiltBack' as const,
      hz: AUDIO.tiltBackHz,
      period: AUDIO.tiltBackPeriodSeconds,
      perCycle: 1,
    },
  ];
  let previousHz = 0;
  let previousCycles = 0;
  for (const { stage, hz, period, perCycle } of cases) {
    // The ladder ships silent; these are the revived rungs behind the master.
    const director = new AudioDirector();
    director.setTuning({ beepLevel: 1 });
    const seconds = 6;
    const cues = run(director, seconds, riding({ speed: 8, load: 1, powerStage: stage }))
      .filter((cue) => cue.kind === 'beep');
    const cycles = Math.floor(seconds / period);
    assert.ok(
      cues.length >= cycles * perCycle - perCycle && cues.length <= (cycles + 2) * perCycle,
      `${stage} produced ${cues.length} beeps in ${seconds}s, expected about ${cycles * perCycle}`,
    );
    assert.ok(cues.every((cue) => cue.toneHz === hz), `${stage} beeped at the wrong pitch`);
    assert.ok(cues.every((cue) => cue.bus === 'ui'), `${stage} must beep on the warning bus`);

    // Rising in pitch AND in rate. Either alone is ambiguous over a motor that
    // is itself changing pitch.
    //
    // Rate here is *pattern* rate — how often the warning repeats — not beeps
    // per second, and the difference is not pedantry. The warn rung fires two
    // beeps in quick succession and then waits; counting beeps makes it look
    // faster than a top rung that fires one beep three times as often, which
    // is the opposite of how the two are heard.
    assert.ok(hz > previousHz, `${stage} is not higher than the rung below it`);
    const cyclesPerSecond = 1 / period;
    assert.ok(
      cyclesPerSecond > previousCycles * 1.5,
      `${stage} repeats at ${cyclesPerSecond.toFixed(2)} Hz against the rung below it at `
        + `${previousCycles.toFixed(2)} Hz — not a clear enough step up`,
    );
    previousHz = hz;
    previousCycles = cyclesPerSecond;
  }
});

test('a rung change is heard immediately, not at the end of the previous period', () => {
  const director = new AudioDirector();
  director.setTuning({ beepLevel: 1 });
  const input = riding({ speed: 8, load: 0.7, powerStage: 'notice' });
  // Beep once, then sit most of the way through the long notice period.
  run(director, 0.6, input);
  input.powerStage = 'tiltBack';
  const cues = run(director, STEP * 2, input).filter((cue) => cue.kind === 'beep');
  assert.ok(cues.length > 0, 'escalating to tilt-back must sound at once');
  assert.equal(cues[0].toneHz, AUDIO.tiltBackHz);
});

test('the wheel does not beep at the player while they are lying on the ground', () => {
  // Revived, so this tests the crash gate rather than the silent master.
  const director = new AudioDirector();
  director.setTuning({ beepLevel: 1 });
  const cues = run(director, 3, riding({ speed: 4, load: 1, powerStage: 'tiltBack', crashed: true }));
  assert.equal(cues.filter((cue) => cue.kind === 'beep').length, 0);
});

// ---------------------------------------------------------------------------
// Transients and state
// ---------------------------------------------------------------------------

test('every one-shot ducks the bed, in the stated order of importance', () => {
  const measure = (fire: (director: AudioDirector) => void): number => {
    const director = new AudioDirector();
    const input = riding({ speed: 10, throttle: 1 });
    run(director, 1, input);
    fire(director);
    let lowest = Infinity;
    for (let i = 0; i < 60; i += 1) {
      director.update(STEP, input);
      director.clearCues();
      lowest = Math.min(lowest, director.frame.bedGain);
    }
    return lowest;
  };

  const hop = measure((d) => d.hop(1));
  const landing = measure((d) => d.landing(1, 'pavement'));
  const curb = measure((d) => d.impact(6));
  const crash = measure((d) => d.crash(10));

  assert.ok(crash < curb, 'a crash must own the mix more than a kerb strike');
  assert.ok(curb < landing, 'a solid hit is a bigger event than a landing');
  assert.ok(landing < hop, 'landing is louder news than taking off');
  assert.ok(hop < AUDIO.bedTrim, 'a hop still ducks a little');
});

/** Fire one event and read the cue it produced. The ring is reused per update. */
function fireOne(fire: (director: AudioDirector) => void): TransientCue {
  const director = new AudioDirector();
  fire(director);
  assert.equal(director.cueCount, 1, 'expected exactly one cue');
  return { ...director.cues[0] };
}

test('a landing borrows the voice of the surface it lands on', () => {
  const wood = fireOne((d) => d.landing(1, 'wood'));
  const gravel = fireOne((d) => d.landing(1, 'gravel'));
  assert.equal(wood.noiseHz, tyreVoiceFor('wood').centreHz);
  assert.equal(gravel.noiseHz, tyreVoiceFor('gravel').centreHz);
  assert.notEqual(wood.noiseHz, gravel.noiseHz);
});

test('a gentle landing is quieter than a heavy one, but never silent', () => {
  const gentle = fireOne((d) => d.landing(0, 'pavement')).gain;
  const heavy = fireOne((d) => d.landing(1, 'pavement')).gain;
  assert.ok(gentle > 0, 'the softest touchdown is still a touchdown');
  assert.ok(heavy > gentle * 2, 'a hard landing must read as harder');
});

test('a scuff against a kerb makes no sound; hitting one does', () => {
  const director = new AudioDirector();
  director.impact(0.05);
  assert.equal(director.cueCount, 0, 'the controller reports every refused millimetre');
  director.impact(5);
  assert.equal(director.cueCount, 1);
  assert.equal(director.cues[0].kind, 'curb');
});

test('grinding along a wall is one sound, not one hundred and twenty a second', () => {
  // A solid impact is a level, not an edge: the controller reports every step
  // in which it refused part of a move. Without a rate limit a scrape along a
  // wall empties the voice cap in a fifth of a second and swallows the mix.
  // Found by the dropped-voice counter in `tests/m8.spec.ts`.
  const director = new AudioDirector();
  const input = riding({ speed: 8 });
  let fired = 0;
  for (let i = 0; i < 120; i += 1) {
    director.impact(4);
    fired += director.cueCount;
    director.clearCues();
    director.update(STEP, input);
    fired += director.cueCount;
    director.clearCues();
  }
  // Two seconds of continuous grinding, at a 0.14 s window.
  assert.ok(fired > 5 && fired < 20, `two seconds of grinding produced ${fired} impact sounds`);
});

test('a real collision at the end of a scrape is not swallowed by the scrape', () => {
  const director = new AudioDirector();
  director.impact(1.5);
  assert.equal(director.cueCount, 1);
  director.clearCues();
  director.impact(1.5);
  assert.equal(director.cueCount, 0, 'the same scrape again is the same scrape');
  director.impact(6);
  assert.equal(director.cueCount, 1, 'hitting something hard mid-scrape must still be heard');
});

test('a crash does not also report itself as a series of kerb strikes', () => {
  const director = new AudioDirector();
  const input = riding({ speed: 10, crashed: true });
  director.crash(10);
  director.clearCues();
  director.update(STEP, input);
  director.clearCues();
  let strikes = 0;
  for (let i = 0; i < 120; i += 1) {
    director.impact(5);
    strikes += director.cueCount;
    director.clearCues();
    director.update(STEP, input);
    director.clearCues();
  }
  assert.equal(strikes, 0, 'the crash owns its own moment');
});

// ---------------------------------------------------------------------------
// The acoustic reference (owner-supplied, 2026-08-03)
// ---------------------------------------------------------------------------

test('a parked wheel is silent, and even a revived motor stays below the ring band', () => {
  // **Rules 2 and 5 together.** The first pass synthesised the PWM carrier —
  // 7.8 kHz, then 1.9 kHz — and deleted it; the second pass left a 66 Hz hum;
  // the third deletes even that, because the owner's own footage showed the
  // real machine simply does not sound when parked. Silence is now the
  // asserted default — and if the panel ever revives the motor, everything it
  // emits must still sit below the band a sustained tone rings in.
  const director = new AudioDirector();
  run(director, 1, riding({ speed: 0 }));
  const frame = director.frame;

  const parked = frame.motorDriveGain + frame.motorSingGain + frame.motorAirGain
    + frame.regenGain + frame.tyre[0].gain + frame.tyre[1].gain
    + frame.tyre[0].sampleGain + frame.tyre[1].sampleGain + frame.windGain;
  assert.ok(parked < 1e-3, `a parked wheel is silent by design; something summed to ${parked}`);

  // Revive at the second pass's levels and re-check rule 2's ceiling.
  director.setTuning({
    motorIdleLevel: 0.09, motorSingLevel: 0.17, motorAirLevel: 0.12, regenLevel: 0.14,
  });
  run(director, 1, riding({ speed: 0 }));
  const audible: readonly [string, number, number][] = [
    ['fundamental', frame.motorHz, frame.motorDriveGain],
    ['third harmonic', frame.motorSingHz, frame.motorSingGain],
    ['sixth harmonic', frame.motorAirHz, frame.motorAirGain],
    ['regen', frame.regenHz, frame.regenGain],
  ];
  for (const [name, hz, gain] of audible) {
    if (gain < 1e-3) continue;
    assert.ok(
      hz < 1500,
      `the parked wheel emits ${name} at ${hz} Hz — nothing sustained may sit that high`,
    );
  }
});

test('an unloaded wheel in the air runs away, and lands again', () => {
  // Pitch is live at any level; the unload check needs the revived gains.
  const director = new AudioDirector();
  director.setTuning({ motorIdleLevel: 0.09, motorLoadLevel: 0.20 });
  const rolling = riding({ speed: 10, throttle: 1 });
  run(director, 2, rolling);
  const groundHz = director.frame.motorHz;
  const groundGain = director.frame.motorDriveGain;

  run(director, 0.5, riding({ speed: 10, throttle: 1, grounded: false }));
  assert.ok(
    director.frame.motorHz > groundHz * 1.1,
    'lift the wheel and it sweeps up — a hop must not be a hole in the mix',
  );
  assert.ok(director.frame.motorDriveGain < groundGain * 0.8, 'and it unloads');

  run(director, 1, rolling);
  assert.ok(Math.abs(director.frame.motorHz - groundHz) < groundHz * 0.05, 'and it resolves');
});

test('no tyre voice sits in the band a continuous sound rings in', () => {
  // **Rule 4's other half.** The tyre is the one voice that plays for minutes
  // without stopping, so it decides how long a player can ride. The first pass
  // put pavement — the surface the slice is mostly made of — at 3100 Hz, in
  // the ear's most sensitive octave, and then modulated it at the wheel's
  // rotation rate on top. Both are gone. This is the ceiling that keeps them
  // gone, checked at the brightest the band ever gets.
  const brightest = AUDIO.tyreCutoffRise;
  for (const id of SURFACE_IDS) {
    const voice = tyreVoiceFor(id);
    assert.ok(
      voice.centreHz * brightest < 2400,
      `${id} reaches ${voice.centreHz * brightest} Hz flat out — a continuous band that high `
        + 'is a hiss the player cannot stop hearing',
    );
  }
});

test('nothing in the ride bed is amplitude-modulated', () => {
  // A structural check rather than a behavioural one, and deliberately so: the
  // two modulators that were here — a 7 Hz tremolo on the strain layer and a
  // tread LFO reaching 110 Hz on the tyre — were both removed after the owner
  // rode the first pass. `AudioFrame` is the entire contract between the model
  // and the graph, so an LFO depth reintroduced anywhere has to appear in it,
  // and this fails the moment one does.
  const director = new AudioDirector();
  run(director, 2, riding({ speed: 12, throttle: 1, load: 0.9, surface: 'gravel' }));
  const fields = Object.keys(director.frame).concat(Object.keys(director.frame.tyre[0]));
  for (const field of fields) {
    assert.ok(
      !/lfo|tremolo|modulat|tread|depth/i.test(field),
      `\`${field}\` looks like a modulator — nothing sustained in this game may pulse`,
    );
  }
});

test('the bed falls while the rider is off the wheel, and comes back on recovery', () => {
  const director = new AudioDirector();
  const input = riding({ speed: 10, throttle: 1 });
  run(director, 1, input);
  const riding0 = director.frame.bedGain;

  input.crashed = true;
  input.throttle = 0;
  run(director, 1.5, input);
  assert.ok(
    director.frame.bedGain < riding0 * 0.5,
    'nobody is riding — the mix should say so',
  );

  input.crashed = false;
  const cues = run(director, 1.5, input);
  assert.ok(
    director.frame.bedGain > riding0 * 0.8,
    'the ride bed must come back after a recovery',
  );
  assert.ok(
    cues.some((cue) => cue.kind === 'recover'),
    'coming back deserves a sound, or the moment simply does not exist',
  );
});

test('pausing fades to silence rather than cutting', () => {
  const director = new AudioDirector();
  const input = riding({ speed: 12, throttle: 1 });
  run(director, 1, input);
  const live = director.frame.bedGain;
  assert.ok(live > 0.1);

  input.idle = true;
  director.update(STEP, input);
  assert.ok(director.frame.bedGain < live, 'the fade has started');
  assert.ok(director.frame.bedGain > live * 0.5, 'one frame must not be the whole fade');
  run(director, 0.5, input);
  assert.ok(director.frame.bedGain < live * 0.01, 'and it reaches silence');
});

test('reset collapses the ride rather than leaving it decaying at the spawn', () => {
  const director = new AudioDirector();
  run(director, 2, riding({ speed: 15, throttle: 1, surface: 'gravel' }));
  assert.ok(director.frame.tyre[0].sampleGain > 0.05);
  director.reset();
  director.update(STEP, riding({ speed: 0 }));
  assert.ok(
    director.frame.tyre[0].gain + director.frame.tyre[0].sampleGain < 1e-3,
    'the tyre must not follow the rider to the spawn',
  );
  assert.ok(director.frame.windGain < 1e-3);
  assert.equal(director.frame.duck, 0);
});

test('the pedal scrape needs both a deep lean and some speed', () => {
  const director = new AudioDirector();
  run(director, 1, riding({ speed: 10, scrape: 0 }));
  assert.ok(director.frame.scrapeGain < 1e-3, 'clear pedals are silent');

  run(director, 1, riding({ speed: 0.2, scrape: 0.1 }));
  assert.ok(director.frame.scrapeGain < 0.02, 'a pedal resting on the ground is not scraping');

  run(director, 1, riding({ speed: 10, scrape: 0.1 }));
  assert.ok(director.frame.scrapeGain > 0.07, 'a scrape at speed must remain clearly present');
  assert.ok(director.frame.scrapeRingGain > 0, 'metal rings; sandpaper does not');
});

test('wobble adds no synthetic electronic voice to the physical ride bed', () => {
  const director = new AudioDirector();
  run(director, 1, riding({ speed: 8 }));
  assert.equal('wobbleGain' in director.frame, false);
  assert.equal('wobbleHz' in director.frame, false);
});

test('nothing the director produces is ever NaN or negative', () => {
  // A single NaN in a Web Audio parameter silences that node for the rest of
  // the session, with no error anywhere. Cheap to rule out here; close to
  // impossible to diagnose from a browser.
  const director = new AudioDirector();
  const hostile: RideAudioInput = riding({
    speed: -40,
    throttle: -1,
    load: 3,
    powerStage: 'tiltBack',
    surface: 'wood',
    grounded: false,
    suspensionSpeed: -12,
    scrape: -0.4,
    crashed: true,
  });
  for (let i = 0; i < 300; i += 1) {
    director.update(STEP, hostile);
    director.clearCues();
  }

  const frame = director.frame;
  for (const [key, value] of Object.entries(frame)) {
    if (typeof value !== 'number') continue;
    assert.ok(Number.isFinite(value), `${key} was ${value}`);
    assert.ok(value >= 0, `${key} went negative at ${value}`);
  }
  for (const slot of frame.tyre) {
    assert.ok(Number.isFinite(slot.gain) && slot.gain >= 0);
    assert.ok(slot.centreHz > 0 && slot.centreHz < 22050, `tyre centre ${slot.centreHz} Hz`);
    assert.ok(slot.lowHz > 0 && slot.lowHz < 22050);
  }
  assert.ok(frame.motorHz > 0 && frame.motorHz < 22050);
  assert.ok(frame.regenHz > 0 && frame.regenHz < 22050);
});

test('a zero or negative step changes nothing', () => {
  const director = new AudioDirector();
  const input = riding({ speed: 10, throttle: 1 });
  run(director, 1, input);
  const before = director.frame.motorDriveGain;
  director.update(0, input);
  assert.equal(director.frame.motorDriveGain, before);
  director.update(-1, input);
  assert.equal(director.frame.motorDriveGain, before);
});

test('the cue ring never overflows into an allocation', () => {
  const director = new AudioDirector();
  const capacity = director.cues.length;
  for (let i = 0; i < capacity * 3; i += 1) director.hop(1);
  assert.equal(director.cues.length, capacity, 'the ring must be fixed');
  assert.ok(director.cueCount <= capacity);
});

test('live tuning reaches the mix', () => {
  const director = new AudioDirector();
  const input = riding({ speed: 10, throttle: 1 });
  run(director, 1, input);
  const before = director.frame.bedGain;
  director.setTuning({ bedTrim: AUDIO.bedTrim * 0.5 });
  director.update(STEP, input);
  assert.ok(
    Math.abs(director.frame.bedGain - before * 0.5) < 1e-6,
    'a panel slider that moves nothing teaches you to distrust the panel',
  );
});
