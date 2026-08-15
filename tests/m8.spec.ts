/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { PROVING_GROUND, boot, collectErrors, disableMaxSpeedCutout } from './harness.ts';
// The surface table imports nothing that needs a browser (invariant 1), so the
// spec can hold the game's own answer for what each surface should sound like
// rather than a second copy of it that would drift.
import { SURFACES } from '../src/data/surfaces.ts';
import { AUDIO } from '../src/data/tuning.ts';
import type { SurfaceId } from '../src/simulation/world.ts';

/**
 * M8 — audio, in a real browser.
 *
 * The headless suite (`src/audio/*.test.ts`) already asserts every decision the
 * audio model makes, because the model imports nothing that needs a browser.
 * What it cannot ask is whether any of it reaches a speaker, and that is the
 * whole job of this file:
 *
 *   1. **The autoplay contract.** Nothing is built until a real user gesture,
 *      and it *is* built on the first one.
 *   2. **The graph exists and carries signal.** A model that is right in every
 *      particular and a single missing `connect` produce identical snapshots
 *      and complete silence. `audioOutput` is the only measurement here that
 *      can tell those apart.
 *   3. **The wiring.** `docs/PLANS.md` §14's four acceptance sentences depend
 *      on the composition root feeding the model the right ride — pitch
 *      tracking speed proves nothing if the speed being read is the camera's.
 *   4. **Lifecycle.** Reset, pause, mute, restart, and the resource plateau
 *      invariant 10 requires.
 *
 * Everything is driven through the QA bridge and `advance()`, never by waiting
 * on wall-clock time to reach a simulation state — with one deliberate
 * exception, `audioOutput`, which reads the *audio* clock and must let real
 * milliseconds pass for the buffer it samples to have been written.
 */

test.describe('M8 — audio', () => {
  test('nothing is built until a real user gesture, and then it is', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);

    // The autoplay contract (`docs/PLANS.md` §8.3). A context constructed at
    // boot is one stuck in `suspended` that the browser logs a warning about,
    // and every later resume inherits that suspicion.
    const atBoot = await page.evaluate(() => window.qa.snap().audio);
    expect(atBoot.supported).toBe(true);
    expect(atBoot.armed).toBe(false);
    expect(atBoot.contextState).toBe('unavailable');

    // The model runs regardless, so the wheel is already at the right pitch on
    // the step the context comes alive rather than sliding up to it.
    expect(atBoot.motorHz).toBeGreaterThan(0);

    // A Playwright key press is a trusted event, so this is the same gesture a
    // player makes — and it is the one they make first.
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().armed);

    const armed = await page.evaluate(() => window.qa.snap().audio);
    expect(armed.armed).toBe(true);
    expect(['running', 'suspended']).toContain(armed.contextState);
    expect(armed.sampleRate).toBeGreaterThan(8000);
    // The permanent ride: four motor partials through one filter (silenced by
    // rule 5 but kept, so F4 can revive them), the wind, two tyre slots — each
    // carrying gains for the recorded offroad loop and the toko rotation loop
    // — the scrape and its restrained ring, all their filters, four buses, the
    // bed, the transient trim, and the limiter. The rejected synthetic wobble
    // tone is deliberately absent; the sample bank adds five looping sources
    // and a trim when it lands.
    // Asserted as a floor rather than an exact count, because the exact count
    // is what the plateau test below cares about and pinning it here would
    // fail every time a voice is added rather than when one leaks.
    expect(armed.permanentNodes).toBeGreaterThan(30);

    // The third pass ships recordings, and they must actually arrive: the
    // approved offroad tyre, the wind howl, and the owner's own crash. Until
    // this flag flips, the sampled voices play synthesized fallbacks.
    await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

    expect(errors).toEqual([]);
  });

  test('the graph carries signal, and mute genuinely silences it', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

    const measured = await page.evaluate(async () => {
      window.qa.freeze();
      window.qa.resetRide();

      // Parked: **silence, by design** — rule 5, the owner's own words after
      // reviewing his ride footage. A real EUC standing still makes no sound,
      // and neither does this one any more.
      window.game.setActions({ throttle: 0 });
      window.game.advance(120);
      const parked = await window.qa.audioOutput(400);

      // Six seconds rather than three and a half, since M16: the wind and the
      // tyre are both referenced to the wheel's top speed, and the top speed
      // moved, so 3.5 s of run-up now samples the bed at two thirds of its
      // range instead of near the top of it. The claim is that the graph makes
      // a sound at riding speed, and this is what riding speed is now.
      window.qa.audioTrace({ throttle: 1 }, 720, 60);
      const riding = await window.qa.audioOutput(260);

      window.game.setMuted(true);
      const muted = await window.qa.audioOutput(320);
      window.game.setMuted(false);
      const unmuted = await window.qa.audioOutput(320);

      window.game.setVolumes({ master: 0 });
      const silentMaster = await window.qa.audioOutput(320);
      window.game.setVolumes({ master: 1 });

      return { parked, riding, muted, unmuted, silentMaster };
    });

    // This is the assertion that separates "the model is right" from "the game
    // makes a sound". Everything else in this milestone is upstream of it.
    expect(measured.riding).toBeGreaterThan(0.01);
    expect(measured.parked).toBeLessThan(0.002);
    expect(measured.muted).toBeLessThan(1e-4);
    expect(measured.unmuted).toBeGreaterThan(0.01);
    expect(measured.silentMaster).toBeLessThan(1e-4);

    expect(errors).toEqual([]);
  });

  test('nothing sustained sings up where a continuous sound rings', async ({ page }) => {
    // **The owner's rule, measured on the real output.** He rode the first M8
    // build and described ear fatigue; a spectrum of the running game found a
    // fixed 1.9 kHz carrier standing clear of everything around it whenever the
    // wheel was parked, plus a tyre band at 3.1 kHz that played for the whole
    // ride. Both are gone. This is the assertion that keeps them gone, and it
    // is deliberately downstream of the whole graph — every headless test in
    // `src/audio/director.test.ts` passed while the first pass was fatiguing,
    // because a director frame says what should play and not what it sounds
    // like once forty nodes have had their turn.
    const errors = collectErrors(page);
    await boot(page);
    // **The rule this asserts is about *sustained* tones**, and M20's
    // over-speed beep is a 75 ms one-shot by construction — but a band peak
    // taken over a window cannot tell the two apart, and the flat-out read
    // below now reaches the speed that fires it. Out of the fixture, with its
    // own coverage elsewhere. See `disableMaxSpeedCutout`.
    await disableMaxSpeedCutout(page);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

    const measured = await page.evaluate(async () => {
      window.qa.freeze();
      window.qa.resetRide();

      // Parked, which is the case that matters most: a player stops constantly,
      // and a fixed tone under a stationary wheel never changes and never ends.
      // The arm gesture rode briefly, so wait for the graph's real output to
      // decay before measuring — under a loaded parallel run the analyser's
      // smoothing can otherwise still be draining the ride at a fixed delay.
      window.game.setActions({ throttle: 0 });
      window.game.advance(120);
      for (let i = 0; i < 12; i += 1) {
        if ((await window.qa.audioOutput(150)) < 5e-4) break;
      }
      const parked = await window.qa.audioBandPeaks(1500, 400);

      // And flat out, where the recorded wind and the tyre bed are at their
      // brightest. Peak-held across several reads: the howl loop swells over
      // its five seconds, so any single read samples one arbitrary phase of
      // it and the band margin swings a few dB run to run. The loop keeps
      // playing under the frozen simulation, so spaced reads cover it.
      window.qa.audioTrace({ throttle: 1 }, 600, 60);
      const riding = { lowDb: -Infinity, lowHz: 0, highDb: -Infinity, highHz: 0 };
      for (let i = 0; i < 4; i += 1) {
        const read = await window.qa.audioBandPeaks(1500, 300);
        if (read.lowDb > riding.lowDb) {
          riding.lowDb = read.lowDb;
          riding.lowHz = read.lowHz;
        }
        if (read.highDb > riding.highDb) {
          riding.highDb = read.highDb;
          riding.highHz = read.highHz;
        }
      }

      return { parked, riding };
    });

    // A parked wheel is silent — rule 5 replaced the second pass's 66 Hz hum
    // with nothing at all, on the owner's word. Both bands must sit at the
    // analyser's floor, not merely below a ceiling.
    expect(measured.parked.lowDb).toBeLessThan(-70);
    expect(measured.parked.highDb).toBeLessThan(-70);

    // Riding: the loudest thing in the mix still has to live down where the
    // machine is, not up where a hiss lives. Re-based after the sample
    // wiring, and looser than the synthesized passes' 15 dB on purpose: real
    // recordings are honestly broadband — the howl and the offroad crunch
    // both carry genuine energy above 1.5 kHz, which is part of why they
    // sound real — and the measured margin swings 10–16 dB with the loops'
    // own phases. 8 dB (a factor of 2.5) is below every observed run and far
    // above every failure this guard exists for: a resurrected carrier or an
    // un-trimmed band up high drives the margin to zero or negative. The
    // tonal hazards themselves are asserted structurally in the headless
    // suite, which is the right place for them.
    expect(measured.riding.lowDb).toBeGreaterThan(-90);
    expect(measured.riding.lowHz).toBeLessThan(1500);
    expect(measured.riding.highDb).toBeLessThan(measured.riding.lowDb - 8);

    expect(errors).toEqual([]);
  });

  test('motor pitch tracks speed, and the motor is silent by design, on the real ride', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');

    const result = await page.evaluate(() => {
      window.qa.freeze();
      window.qa.resetRide();
      const accelerating = window.qa.audioTrace({ throttle: 1 }, 720, 60);
      const coasting = window.qa.audioTrace({ throttle: 0 }, 60, 60);
      return { accelerating, coasting };
    });

    const rising = result.accelerating;
    expect(rising.length).toBeGreaterThan(8);

    // The acceptance sentence: motor pitch tracks speed. Asserted against the
    // ride's own speed rather than against the step count, so a controller
    // change that alters the acceleration curve cannot silently break it.
    const first = rising[0];
    const last = rising[rising.length - 1];
    expect(last.speed).toBeGreaterThan(first.speed + 8);
    expect(last.motorHz).toBeGreaterThan(first.motorHz * 3);
    for (let i = 1; i < rising.length; i += 1) {
      if (rising[i].speed <= rising[i - 1].speed) continue;
      expect(rising[i].motorHz).toBeGreaterThanOrEqual(rising[i - 1].motorHz - 1e-6);
    }
    // A hub motor's electrical fundamental near this wheel's top speed —
    // rotational frequency times fifteen pole pairs, which at 22.3 m/s on a
    // 0.5 m tyre is a little over 200 Hz. The band moved with the top speed at
    // M16 (from 110–160) and the model behind it did not: the pitch is derived
    // from how fast the tyre is actually turning, so a faster wheel is a
    // higher note for the same physical reason a real one is.
    expect(last.motorHz).toBeGreaterThan(160);
    expect(last.motorHz).toBeLessThan(230);

    // And the motor is *silent* on the real ride — rule 5. The pitch model
    // above stays correct because it still drives the (zero-gain) stack and
    // the F4 revival path; the gain saying nothing is now the design.
    const coasting = result.coasting[result.coasting.length - 1];
    expect(last.motorGain).toBeLessThan(1e-3);
    expect(coasting.motorGain).toBeLessThan(1e-3);
    expect(coasting.motorHz).toBeGreaterThan(last.motorHz * 0.8);

    expect(errors).toEqual([]);
  });

  test('wind rises with speed and the tyre answers the surface under it', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');

    const parked = await page.evaluate(() => {
      window.qa.freeze();
      window.qa.resetRide();
      window.game.advance(120);
      return window.qa.snap().audio.windGain;
    });
    // A parked wheel has no wind at all — the onset speed, not merely a small
    // number at the bottom of a curve.
    expect(parked).toBe(0);

    const wind = await page.evaluate(() => window.qa.audioTrace({ throttle: 1 }, 720, 30));

    // And rising thereafter — the third acceptance sentence, measured against
    // real speeds off the real controller rather than against a step count.
    for (let i = 1; i < wind.length; i += 1) {
      if (wind[i].speed <= wind[i - 1].speed) continue;
      expect(wind[i].windGain).toBeGreaterThanOrEqual(wind[i - 1].windGain - 1e-6);
    }
    expect(wind[wind.length - 1].windGain).toBeGreaterThan(0.1);

    // A top-end sound, by owner instruction after riding the third pass:
    // "playing too soon; should be more like at the top end of the speed."
    // The onset is 9 m/s of a 15 m/s wheel, so the town-speed half of the
    // speedometer has no wind at all.
    for (const point of wind) {
      if (point.speed < AUDIO.windOnsetSpeed * 0.9) {
        expect(
          point.windGain,
          `wind audible at ${point.speed.toFixed(1)} m/s, below the onset`,
        ).toBeLessThan(0.02);
      }
    }

    const sweep = await page.evaluate(() => window.qa.audioSurfaceSweep());

    // The second acceptance sentence. The slice paints several surfaces and
    // every one of them must select its own voice — the check is that the
    // voice matches the surface the wheel is *actually* on, so a mapping that
    // silently falls back to pavement fails here rather than sounding vaguely
    // wrong in play.
    expect(sweep.length).toBeGreaterThanOrEqual(3);
    const voices = new Set<string>();
    for (const entry of sweep) {
      expect(entry.voice).not.toBe('');
      voices.add(entry.voice);
      expect(entry.tyreGain).toBeGreaterThan(0);
    }
    expect(voices.size).toBeGreaterThanOrEqual(3);

    // And the voice is the one the surface table declares — not merely *a*
    // voice. A lookup that silently falls back to pavement passes every check
    // above while making six of the seven surfaces sound the same.
    for (const entry of sweep) {
      const surface = SURFACES[entry.surface as SurfaceId];
      expect(surface, `unknown surface "${entry.surface}"`).toBeTruthy();
      expect(
        entry.voice,
        `${entry.surface} selected "${entry.voice}" instead of "${surface.tyreAudio}"`,
      ).toBe(surface.tyreAudio);
    }

    expect(errors).toEqual([]);
  });

  test('grass is a restrained low rustle, not broadband white noise', async ({ page }) => {
    // The old surface test proved only that grass selected a distinct model
    // voice. It stayed green while the real bus made grass roughly twice as
    // loud as same-speed pavement with equal energy above and below 1.5 kHz —
    // exactly the loud white-noise report this adversarial pass began from.
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

    const measured = await page.evaluate(async () => {
      window.qa.freeze();
      const field = window.game.levelPlan.heightfield;
      const columns = field.columns - 1;
      const rows = field.rows - 1;
      const at = (column: number, row: number): string | null => (
        column < 0 || row < 0 || column >= columns || row >= rows
          ? null
          : field.surfaces[row * columns + column]
      );
      const points = new Map<string, { x: number; z: number }>();
      for (let row = 2; row < rows - 2; row += 1) {
        for (let column = 2; column < columns - 2; column += 1) {
          const surface = at(column, row);
          if ((surface !== 'grass' && surface !== 'pavement') || points.has(surface)) continue;
          let uniform = true;
          for (let dz = -2; dz <= 2 && uniform; dz += 1) {
            for (let dx = -2; dx <= 2; dx += 1) {
              if (at(column + dx, row + dz) !== surface) uniform = false;
            }
          }
          if (uniform) points.set(surface, {
            x: field.originX + (column + 0.5) * field.spacing,
            z: field.originZ + (row + 0.5) * field.spacing,
          });
        }
      }

      const result: Record<string, {
        speed: number;
        rms: number;
        lowDb: number;
        highDb: number;
      }> = {};
      for (const surface of ['grass', 'pavement']) {
        const point = points.get(surface);
        if (!point) throw new Error(`no uniform ${surface} patch`);
        window.qa.resetRide();
        window.qa.placeRider(point.x, point.z, 0);
        window.game.setActions({ throttle: 1 });
        let steps = 0;
        while (window.qa.snap().euc.speed < 2.5 && steps < 360) {
          window.game.advance(4);
          steps += 4;
        }
        window.game.clearActions();
        const speed = window.qa.snap().euc.speed;
        // Let the previous slot finish its real-audio-time crossfade, then
        // average a little over one wheel revolution. A single RMS window can
        // land between the sparse pavement toko taps and make the same mix
        // appear to change level from run to run even though the grass bed is
        // steady. That phase accident hid neither defect, but it made the
        // loudness guard flaky.
        await window.qa.audioOutput(300);
        let rmsTotal = 0;
        const bands = { lowDb: -Infinity, highDb: -Infinity };
        for (let i = 0; i < 4; i += 1) {
          rmsTotal += await window.qa.audioOutput(250);
          const read = await window.qa.audioBandPeaks(1500, 100);
          bands.lowDb = Math.max(bands.lowDb, read.lowDb);
          bands.highDb = Math.max(bands.highDb, read.highDb);
        }
        result[surface] = {
          speed,
          rms: rmsTotal / 4,
          lowDb: bands.lowDb,
          highDb: bands.highDb,
        };
      }
      return result;
    });

    expect(Math.abs(measured.grass.speed - measured.pavement.speed)).toBeLessThan(0.25);
    // Grass can remain more present than pavement, but not become a blanket of
    // noise. Use a shipped-output ceiling here rather than a tight ratio: the
    // corrected pavement is a sparse per-revolution tap, so one analyser
    // window can legitimately fall between taps while grass is continuous.
    // The old loud white bed measured above 0.0023 in this exact state; the
    // corrected low rustle stays below 0.0015.
    expect(measured.grass.rms).toBeLessThan(0.0015);
    // And its sustained spectrum has weight below the hiss band. The failing
    // white-noise graph put these two peaks level with each other.
    expect(measured.grass.lowDb).toBeGreaterThan(-95);
    expect(measured.grass.highDb).toBeLessThan(measured.grass.lowDb - 6);

    expect(errors).toEqual([]);
  });

  test('a hard-carve scrape stays audible without owning the high-frequency mix', async ({ page }) => {
    // Isolate the scrape on the proving ground. Before this audit its 2.0 kHz
    // peak stood about 11 dB above the entire lower mix even after two rounds
    // of "quieter" tuning — model gain alone never exposed that shape.
    const errors = collectErrors(page);
    await boot(page, PROVING_GROUND);
    await page.keyboard.press('KeyW');

    const measured = await page.evaluate(async () => {
      window.qa.freeze();
      const pad = window.game.levelPlan.segments.find((segment) => segment.id === 'pad');
      if (!pad) throw new Error('missing proving-ground pad');
      const heading = pad.entry.headingY;
      const x = pad.entry.position.x + Math.sin(heading) * 20;
      const z = pad.entry.position.z + Math.cos(heading) * 20;

      // Motor is already silent. Removing tyre and wind makes this a direct
      // analyser proof that the scrape graph itself sounds and has the right
      // spectral balance, not an inference from the full ride bed.
      window.game.tuning.set('AUDIO.windLevel', 0);
      window.game.tuning.set('AUDIO.tyreLevel', 0);
      window.qa.placeRider(x, z, heading);
      // Short since M16, for the geometry reason `m5.spec.ts` records: at the
      // raised top speed a long full-lock carve leaves the 80 m pad and lands
      // on grass, where the grip cap stops the pedal ever touching down and
      // there is no scrape left to listen to.
      const scrape = window.qa.scrapeTrace(1, 180, 150);
      const scrapeGain = window.qa.snap().audio.scrapeGain;
      const rms = await window.qa.audioOutput(450);
      const bands = await window.qa.audioBandPeaks(1500, 120);
      return { ...scrape, scrapeGain, rms, lowDb: bands.lowDb, highDb: bands.highDb };
    });

    expect(Math.abs(measured.pedalStrike)).toBeGreaterThan(0.02);
    expect(measured.scrapeGain).toBeGreaterThan(0.07);
    expect(measured.rms).toBeGreaterThan(0.002);
    expect(measured.rms).toBeLessThan(0.012);
    expect(measured.lowDb).toBeGreaterThan(-90);
    expect(measured.highDb).toBeLessThan(measured.lowDb - 8);

    expect(errors).toEqual([]);
  });

  test('a crossing between surfaces is a fade, not an edge', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');

    const crossing = await page.evaluate(() => {
      window.qa.freeze();
      window.qa.resetRide();
      // Ride until the surface under the wheel changes at least once, sampling
      // every step so a one-frame discontinuity cannot hide between samples.
      const samples = window.qa.audioTrace({ throttle: 1, steer: 0 }, 1800, 2);
      return samples;
    });

    const changes: number[] = [];
    for (let i = 1; i < crossing.length; i += 1) {
      if (crossing[i].surface !== crossing[i - 1].surface) changes.push(i);
    }
    expect(changes.length, 'the ride should cross at least one surface boundary').toBeGreaterThan(0);

    // Around every boundary, the tyre level must move continuously. A linear
    // crossfade dips ~3 dB through the middle of every one of these, and a
    // slot swapped mid-fade steps — both are inaudible as causes and obvious
    // as this number. Scaled by the sample trim for the same reason the
    // headless twin of this check is: a boundary into the recorded offroad
    // voice legitimately covers trim-times the gain in the same 0.2 s fade.
    const step = 0.12 * AUDIO.tyreSampleTrim;
    for (const index of changes) {
      const from = Math.max(1, index - 12);
      const to = Math.min(crossing.length - 1, index + 12);
      for (let i = from; i <= to; i += 1) {
        const jump = Math.abs(crossing[i].tyreGain - crossing[i - 1].tyreGain);
        expect(
          jump,
          `tyre level stepped ${jump.toFixed(3)} in one sample across a ${crossing[i - 1].surface}`
            + ` → ${crossing[i].surface} boundary`,
        ).toBeLessThan(step);
      }
    }

    expect(errors).toEqual([]);
  });

  test('the power ladder is silent by default, and revived beeps duck the wheel', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');

    // Owner decision (2026-08-04): "get rid of the tiltback beeps, no reason
    // to have that annoyance in arcade (this not a sim)." The ladder still
    // climbs — the HUD light test proves that — but climbing it must make no
    // sound at the shipped defaults.
    const silent = await page.evaluate(() => {
      window.qa.freeze();
      window.qa.resetRide();
      // Reach a steady ride first, so `quietBed` is the bed of a wheel that is
      // working rather than one that has not started.
      window.qa.audioTrace({ throttle: 1 }, 240, 60);
      return window.qa.audioLadder(0.12, 4);
    });

    expect(silent.stage).toBe('tiltBack');
    expect(silent.beeps).toBe(0);

    // The whole set lives behind one F4 master, exactly like the motor: one
    // slider revives the second-pass ladder unchanged.
    const revived = await page.evaluate(() => {
      window.game.tuning.set('AUDIO.beepLevel', 1);
      const ladder = window.qa.audioLadder(0.12, 4);
      window.game.tuning.reset('AUDIO.beepLevel');
      return ladder;
    });

    expect(revived.stage).toBe('tiltBack');
    expect(revived.beeps).toBeGreaterThan(4);

    // **The exit question's second half, as a number.** The warning wins by
    // pushing the wheel down rather than by being turned up — a beep loud
    // enough to beat a full-throttle motor is a beep that hurts when the wheel
    // is quiet.
    expect(revived.lowestBed).toBeLessThan(revived.quietBed * 0.75);
    expect(revived.maxDuck).toBeGreaterThan(0.2);

    // The reset at the end of the helper has to have taken: the next spec
    // rides the shipped wheel, not one with a 0.12 tilt-back threshold.
    const after = await page.evaluate(() => window.qa.snap().tuning.overrideCount);
    expect(after).toBe(0);

    expect(errors).toEqual([]);
  });

  test('hop, landing, and crash each make their own sound', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');

    const hopped = await page.evaluate(() => {
      window.qa.freeze();
      window.qa.resetRide();
      const before = window.qa.snap().audio.played.hop;
      window.qa.audioTrace({ throttle: 1 }, 240, 120);
      window.game.setActions({ hop: true });
      window.game.advance(1);
      window.game.setActions({ hop: false });
      window.game.advance(240);
      const snap = window.qa.snap();
      return {
        hops: snap.euc.hops,
        landings: snap.euc.landings,
        hopCues: snap.audio.played.hop - before,
        landingCues: snap.audio.played.landing,
        dropped: snap.audio.droppedVoices,
      };
    });

    // One sound per event, not one per step and not none. A takeoff is a
    // single-step edge, so both failures are entirely plausible.
    expect(hopped.hops).toBe(1);
    expect(hopped.hopCues).toBe(1);
    expect(hopped.landings).toBe(1);
    expect(hopped.landingCues).toBe(1);
    expect(hopped.dropped).toBe(0);

    const crashed = await page.evaluate(() => {
      window.qa.resetRide();
      const before = window.qa.snap().audio.played;
      const run = window.qa.crashRun(3000);
      const after = window.qa.snap().audio;
      return {
        crashed: run.crashed,
        recovered: run.recovered,
        recoveryStatusColour: run.recoveryStatusColour,
        recoveryStatusIntensity: run.recoveryStatusIntensity,
        crashCues: after.played.crash - before.crash,
        recoverCues: after.played.recover - before.recover,
        bedAfter: after.bedGain,
        dropped: after.droppedVoices,
      };
    });

    expect(crashed.crashed).toBe(true);
    expect(crashed.crashCues).toBeGreaterThanOrEqual(1);
    // The recovery edge still exists for instrumentation, but the owner
    // silenced its chirp. The moment moved to the machine's status light:
    // cool boot white, brighter than the ordinary alarm ceiling.
    expect(crashed.recovered).toBe(true);
    expect(crashed.recoverCues).toBeGreaterThanOrEqual(1);
    const recoveryColour = Number.parseInt(crashed.recoveryStatusColour, 16);
    const recoveryRed = (recoveryColour >> 16) & 0xff;
    const recoveryGreen = (recoveryColour >> 8) & 0xff;
    const recoveryBlue = recoveryColour & 0xff;
    expect(recoveryRed).toBeGreaterThan(190);
    expect(recoveryGreen).toBeGreaterThan(recoveryRed);
    expect(recoveryBlue).toBeGreaterThan(recoveryGreen);
    expect(crashed.recoveryStatusIntensity).toBeGreaterThan(2.6);
    // And the ride bed has to have come back with it.
    expect(crashed.bedAfter).toBeGreaterThan(0.3);
    expect(crashed.dropped).toBe(0);

    expect(errors).toEqual([]);
  });

  test('a crash plays the owner\'s recording, audibly', async ({ page }) => {
    // Three rungs, because the M10 QA pass showed the old single-window level
    // read failing on timing alone (RMS 0.013–0.018 against the 0.02 bar):
    //
    //   1. `crashSamplePlays` is counted inside the sink at the moment the
    //      recording's own `AudioBufferSourceNode` starts — it stays zero for
    //      the synthesized fallback, so it is the counter that proves *which*
    //      crash voice sounded. (`played.crash` cannot: it increments before
    //      the sink is asked, identically for both.)
    //   2. The level is the loudest of sixteen analyser windows across 1.6 s
    //      of the 3.4 s tumble, read post-limiter on the real audio clock, so
    //      one window landing in a quiet stretch of the recording cannot fail
    //      the run. The 0.02 bar itself is unchanged.
    //   3. The same measurement taken at idle *before* the crash pins the
    //      level on the recording rather than on the ride bed: the bed must
    //      not be able to explain the crash reading.
    //
    // The crash is driven inline rather than through `crashRun`, which rides
    // out the whole recovery before returning — by then the tumble recording
    // is well underway on the audio clock, which is exactly the timing edge
    // that made the old test flaky.
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

    const measured = await page.evaluate(async () => {
      window.qa.freeze();
      window.qa.resetRide();
      const idle = await window.qa.audioOutputMax(500, 5);
      const before = window.qa.snap().audio;

      // Full-speed steering mistakes faster than Cool Rider can correct them,
      // exactly as `crashRun` drives them — but stopping at the crash, so the
      // measurement below runs while the recording is actually sounding.
      let steps = 0;
      while (steps < 3000 && !window.game.snapshot().euc.crashed) {
        const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
        window.game.setActions({ throttle: 1, steer: flip });
        window.game.advance(6);
        steps += 6;
      }
      window.game.setActions({ throttle: 0, steer: 0 });

      const after = window.qa.snap().audio;
      const during = await window.qa.audioOutputMax(1600, 16);
      return {
        crashed: window.game.snapshot().euc.crashed,
        cues: after.played.crash - before.played.crash,
        samplePlays: after.crashSamplePlays - before.crashSamplePlays,
        idle,
        during,
      };
    });

    expect(measured.crashed).toBe(true);
    expect(measured.cues).toBeGreaterThanOrEqual(1);
    // The recording, not the fallback: counted at the source node itself.
    expect(measured.samplePlays).toBeGreaterThanOrEqual(1);
    expect(measured.during).toBeGreaterThan(0.02);
    // And the level is attributable to the recording, not to the ride bed the
    // rider left behind: the crash ducks the bed, so anything this far above
    // the idle reading is the tumble.
    expect(measured.during).toBeGreaterThan(measured.idle * 3);

    expect(errors).toEqual([]);
  });

  test('pause fades to silence and resume brings the ride back', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');

    const riding = await page.evaluate(async () => {
      window.qa.freeze();
      window.qa.resetRide();
      window.qa.audioTrace({ throttle: 1 }, 420, 120);
      window.game.clearActions();
      return window.qa.audioOutput(220);
    });
    expect(riding).toBeGreaterThan(0.01);

    // The real pause path — the real key, the loop, the notice, and the input
    // reset — rather than a direct call into the audio layer. The loop has to
    // be live for `Escape` to be heard at all, because a paused loop runs no
    // steps and the render frame is the only thing left listening.
    await page.evaluate(() => window.qa.thaw());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().paused);
    const whilePaused = await page.evaluate(() => window.qa.audioOutput(600));

    // Silence, reached by a fade rather than a cut. The fade's shape is
    // asserted headlessly; what matters here is that it completes at all,
    // which it cannot if the model is driven only by a step clock that has
    // itself stopped.
    expect(whilePaused).toBeLessThan(riding * 0.05);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.game.snapshot().paused);
    const resumed = await page.evaluate(async () => {
      window.game.setActions({ throttle: 1 });
      // Long enough to get back above the wind onset. With the wind pushed to
      // the top third of the speedometer and the solid surfaces at rule 5's
      // faint tyre bed, a wheel only a second into re-acceleration is quiet
      // *by design* — the claim under test is that resume restores the audio
      // path, so ride far enough that the restored path has something to say.
      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      const level = await window.qa.audioOutput(220);
      window.game.clearActions();
      return level;
    });
    expect(resumed).toBeGreaterThan(0.01);

    expect(errors).toEqual([]);
  });

  test('a context the OS takes away comes back; one the page parked stays parked', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().armed);
    await page.waitForFunction(() => window.game.audioSnapshot().contextState === 'running');

    // An uninvited suspension — what iOS does to a home-screen web app at
    // launch, on lock, and on return from the app switcher (there it reports
    // the non-standard `interrupted`; Chromium's `suspended` exercises the
    // same negative-comparison path). The engine must notice through
    // `statechange` and come back on its own, because no later gesture is
    // guaranteed to ever arrive.
    await page.evaluate(() => {
      const engine = window.game.audio as unknown as { context: AudioContext };
      void engine.context.suspend();
    });
    await page.waitForFunction(() => window.game.audioSnapshot().contextState === 'running');

    // A deliberate park — the hidden-tab path — must not be fought by that
    // same recovery: the whole point of `setSuspended(true)` is giving the
    // audio thread back while nobody is looking at the page.
    await page.evaluate(() => window.game.audio.setSuspended(true));
    await page.waitForFunction(() => window.game.audioSnapshot().contextState === 'suspended');
    // Real milliseconds, deliberately: the recovery handler acts on the audio
    // clock's side of the fence, and asserting it *stayed* parked needs time
    // in which it could have misbehaved.
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.game.audioSnapshot().contextState)).toBe('suspended');

    await page.evaluate(() => window.game.audio.setSuspended(false));
    await page.waitForFunction(() => window.game.audioSnapshot().contextState === 'running');

    expect(errors).toEqual([]);
  });

  test('quick reset takes the sound of the ride with it', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    // `audioTrace` runs 720 fixed steps in a few milliseconds of *wall* time,
    // so M20's beeps — paced in simulation seconds — all land inside one audio
    // instant and are still sounding when the reset lands. That is an artefact
    // of instant advancement rather than anything a player meets at sixty
    // frames a second, and this test is about the ride bed.
    // See `disableMaxSpeedCutout`.
    await disableMaxSpeedCutout(page);
    await page.keyboard.press('KeyW');

    const reset = await page.evaluate(() => {
      window.qa.freeze();
      window.qa.resetRide();
      const fast = window.qa.audioTrace({ throttle: 1 }, 720, 240);
      const before = fast[fast.length - 1];
      window.game.clearActions();
      window.game.setActions({ reset: true });
      window.game.advance(2);
      const after = window.qa.snap();
      return {
        before: { tyre: before.tyreGain, wind: before.windGain, speed: before.speed },
        after: {
          tyre: after.audio.tyreGain,
          wind: after.audio.windGain,
          speed: after.euc.speed,
          voices: after.audio.voices,
        },
      };
    });

    expect(reset.before.speed).toBeGreaterThan(8);
    expect(reset.before.wind).toBeGreaterThan(0.05);
    expect(reset.after.speed).toBeLessThan(0.1);
    // The audible twin of the smeared rig `syncPoses` exists to prevent: a
    // tyre still roaring over gravel above a rider standing at the spawn.
    expect(reset.after.tyre).toBeLessThan(0.01);
    expect(reset.after.wind).toBeLessThan(0.01);
    expect(reset.after.voices).toBe(0);

    expect(errors).toEqual([]);
  });

  test('audio resources plateau across repeated rides', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.keyboard.press('KeyW');
    // The plateau is measured after the sample bank lands: installing it is
    // the one legitimate one-time growth of the permanent graph (three
    // looping sources), and waiting here is what keeps the count below a
    // constant worth asserting.
    await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

    const trace = await page.evaluate(async () => {
      window.qa.freeze();
      const rounds: { nodes: number; voices: number; dropped: number }[] = [];
      for (let round = 0; round < 5; round += 1) {
        window.qa.resetRide();
        window.qa.audioTrace({ throttle: 1 }, 360, 60);
        window.game.setActions({ hop: true });
        window.game.advance(1);
        window.game.setActions({ hop: false });
        window.game.advance(360);
        window.game.clearActions();
        // Let every one-shot's envelope finish on the audio clock, which is
        // the only thing that can retire a voice.
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        const audio = window.qa.snap().audio;
        rounds.push({
          nodes: audio.permanentNodes,
          voices: audio.voices,
          dropped: audio.droppedVoices,
        });
      }
      return rounds;
    });

    // Invariant 10: every node has a disposal path and resources plateau. The
    // permanent graph is built once, so it must not grow by a single node; the
    // one-shots must all have retired.
    const nodes = new Set(trace.map((round) => round.nodes));
    expect(nodes.size, `permanent node count moved: ${JSON.stringify(trace)}`).toBe(1);
    for (const round of trace) {
      expect(round.voices, `one-shots left sounding: ${JSON.stringify(trace)}`).toBe(0);
      expect(round.dropped).toBe(0);
    }

    expect(errors).toEqual([]);
  });

  test('F3 reports the audio layer, and M mutes it', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, 'debug=1');
    await page.keyboard.press('KeyW');
    await page.waitForFunction(() => window.game.audioSnapshot().armed);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.audioTrace({ throttle: 1 }, 240, 120);
    });

    const overlay = page.locator('#euc-debug-overlay');
    await expect(overlay).toBeVisible();
    for (const field of ['audiostate', 'audiomix', 'audiomotor', 'audioworld', 'audiovoices']) {
      await expect(overlay.locator(`[data-field="${field}"]`)).not.toHaveText('—');
    }
    await expect(overlay.locator('[data-field="audiostate"]')).toContainText('running');

    // The mute key, through the real binding and the real action buffer — and
    // therefore only claimable by a step that actually runs. A frozen loop runs
    // none, so the press would sit in the buffer until it lapsed.
    await page.evaluate(() => window.qa.thaw());
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => window.game.audioSnapshot().muted);
    await expect(overlay.locator('[data-field="audiostate"]')).toContainText('MUTED');
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => !window.game.audioSnapshot().muted);

    expect(errors).toEqual([]);
  });
});
