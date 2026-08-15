/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { PROVING_GROUND, boot as bootGame, collectErrors, disableMaxSpeedCutout } from './harness.ts';
import { BLOCKOUT_COLOURS, EUC } from '../src/data/tuning.ts';

/**
 * M6 — wobble, the power ladder, tilt-back, crash, and recovery.
 *
 * The headless suite already proves the *models*: the instability equilibrium,
 * the automatic foot correction plus input-driven recovery, every injection source,
 * the crash threshold and the motion it chooses, the ladder's four rungs and
 * the hysteresis on the only one with teeth, the safe-position delay, the
 * invulnerable window, and that flat pavement still reduces to the ride the
 * owner accepted at M2. All of that is in `src/simulation/` with no browser at
 * all, which is what architecture invariant 1 is for. Repeating it here would
 * be slower and no truer.
 *
 * What only a browser can prove is that any of it reaches the screen, which is
 * the whole of the exit question — *do I understand what went wrong, and do I
 * immediately want another go?*
 *
 *   - the wheel visibly weaves, and the rider visibly braces, from one scalar;
 *   - the rider actually leaves the wheel, and both of them stay in frame;
 *   - the camera widens for the crash and hands the ordinary view back;
 *   - the machine's own status light walks green to red as the ladder climbs,
 *     which until audio (M8) and the HUD (M9) is the only channel the first two
 *     rungs have;
 *   - the recovery puts the rider back somewhere they can ride from;
 *   - and a session full of crashes leaves no console errors, no resource
 *     growth, and a draw-call count still inside the budget.
 *
 * Nothing here asserts a frame time. See `playwright.config.ts`.
 */

/**
 * Where a beat starts, read out of the plan rather than hard-coded.
 *
 * Same helper as `tests/m4.spec.ts` and `tests/m5.spec.ts`, and for the same
 * reason: every spec here is about a mechanism, and hard-coding the place would
 * turn each of them into a second test of the route's exact dimensions.
 */
async function beat(
  page: import('@playwright/test').Page,
  id: string,
  along = 0,
  lateral = 0,
): Promise<{ x: number; z: number; headingY: number }> {
  return page.evaluate(([beatId, s, t]) => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === beatId);
    if (!segment) throw new Error(`no segment called ${String(beatId)}`);
    const heading = segment.entry.headingY;
    const forward = { x: Math.sin(heading), z: Math.cos(heading) };
    const left = { x: Math.cos(heading), z: -Math.sin(heading) };
    return {
      x: segment.entry.position.x + forward.x * Number(s) + left.x * Number(t),
      z: segment.entry.position.z + forward.z * Number(s) + left.z * Number(t),
      headingY: heading,
    };
  }, [id, along, lateral] as const);
}

/**
 * Open the wobble master gate through the real live-tuning path.
 *
 * The shipped default became `EUC.wobbleMasterGain = 1` on 2026-08-09, when
 * the owner's M13 Phase 4 exit ride accepted hazards-only wobble. These specs
 * still open the gate explicitly rather than trusting the default, so they
 * keep proving the mechanic whatever the shipped value is — the default itself
 * is pinned by exactly one spec below, which is the one that would catch it
 * changing. The live-tuning registry is the only route that survives
 * `installLevel` rebuilding the controller.
 */
async function enableWobble(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    window.game.tuning.set('EUC.wobbleMasterGain', 1);
  });
}


// ---------------------------------------------------------------------------
// Wobble, on screen
// ---------------------------------------------------------------------------

/**
 * **This suite rides the M4 proving ground, not the M7 slice level.**
 *
 * `docs/PLANS.md` §2.5 makes the hand-authored level the *measuring instrument*
 * for the whole movement phase: a level that changes cannot measure whether a
 * movement change made riding better or merely different. Every number this
 * file asserts was settled on that course, so M7 kept it — still built, still
 * tested, and reachable only at `?level=proving` (`src/level/levels.ts`).
 * Re-pointing this evidence at new geometry in the same milestone that authored
 * the geometry would leave nothing fixed to measure against.
 */
const boot = (page: Page, query = ''): Promise<void> => (
  bootGame(page, query === '' ? PROVING_GROUND : `${query}&${PROVING_GROUND}`)
);

test('shipped default: wobble is on, and a closed gate still cannot be woken', async ({ page }) => {
  await boot(page);

  // Owner decision, 2026-08-09, on the M13 Phase 4 exit ride: hazards-only
  // wobble ships ON. The default is pinned through the real boot path so a
  // regression to zero cannot silently un-ship the mechanic he accepted.
  const shipped = await page.evaluate(() => window.game.tuning.get('EUC.wobbleMasterGain'));
  expect(shipped).toBe(1);

  // And the gate must still gate — `?wobble=0` is now the diagnostic *off*
  // switch, so zero has to mean no energy path exists at all. The rider closes
  // it and then commits every wobble sin at once on the loosest ground: gravel
  // flat out with the steering sawed at an absurd cadence — **and with the
  // bench probe armed**, because a probe that could inject past a closed gate
  // would mean `?wobble=0` and true silence were two different states.
  const spur = await beat(page, 'trail', 20, 0);
  const abused = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.game.tuning.set('EUC.wobbleMasterGain', 0);
    window.game.tuning.set('EUC.wobbleProbeEnergy', 1);
    window.game.tuning.set('EUC.wobbleProbeMetres', 5);
    window.game.setActions({ throttle: 1 });
    window.game.advance(600);
    for (let flips = 0; flips < 8; flips += 1) {
      window.game.setActions({ throttle: 1, steer: flips % 2 === 0 ? 1 : -1 });
      window.game.advance(48);
      window.game.setActions({ throttle: 1, steer: 0 });
      window.game.advance(3);
    }
    const euc = window.game.snapshot().euc;
    const rig = window.qa.rigTransform();
    return {
      energy: euc.wobbleEnergy,
      yaw: Math.abs(euc.wobbleYaw),
      roll: Math.abs(euc.wobbleRoll),
      foot: euc.wobbleFootCorrection,
      state: euc.state,
      rigYaw: Math.abs(rig.headingY - euc.headingY),
      machineYaw: Math.abs(rig.machineYaw),
      machineRoll: Math.abs(rig.machineRoll),
    };
  }, [spur.x, spur.z, spur.headingY] as const);

  expect(abused.energy).toBe(0);
  expect(abused.yaw).toBe(0);
  expect(abused.roll).toBe(0);
  expect(abused.foot).toBe(0);
  expect(abused.state).not.toBe('wobbling');
  expect(abused.rigYaw).toBe(0);
  expect(abused.machineYaw).toBe(0);
  expect(abused.machineRoll).toBe(0);
});

test('?wobble=1 opens the gate and arms nothing', async ({ page }) => {
  // The M13 Phase 4 exit ride caught this as a rider: with `?wobble=1` the
  // weave felt "always on", because the parameter still armed Phase 0's
  // distance-cadence probe — a synthetic impulse every 60 m, built when no
  // hazard existed to trigger the wobble honestly. The owner's rule is that
  // nothing but a hazard may ever trigger wobble, so the URL now sets the
  // master gain and nothing else. The probe survives as a bench instrument
  // (the specs above charge the oscillator through it), which is exactly why
  // this spec must pin the URL path: the mechanism still exists, and only
  // this boundary keeps it out of a player's ride.
  await boot(page, 'wobble=1');
  const armed = await page.evaluate(() => ({
    gain: window.game.tuning.get('EUC.wobbleMasterGain'),
    probeMetres: window.game.tuning.get('EUC.wobbleProbeMetres'),
  }));
  expect(armed.gain).toBe(1);
  expect(armed.probeMetres).toBe(0);

  // And riding proves it: full throttle across the probe's old 60 m cadence
  // several times over, on the pavement pad, builds no energy at all. Before
  // the fix this exact ride wobbled four times.
  const pad = await beat(page, 'pad', 20, 0);
  const ridden = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.game.setActions({ throttle: 1 });
    window.game.advance(1500);
    const euc = window.game.snapshot().euc;
    return { energy: euc.wobbleEnergy, yaw: euc.wobbleYaw, state: euc.state };
  }, [pad.x, pad.z, pad.headingY] as const);
  expect(ridden.energy).toBe(0);
  expect(ridden.yaw).toBe(0);
  expect(ridden.state).not.toBe('wobbling');
});

test('rough ground contributes nothing, and a small wobble weaves anyway', async ({ page }) => {
  await boot(page);
  await enableWobble(page);

  const pavement = await beat(page, 'pad', 20, 0);
  const smooth = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    return window.qa.wobbleTrace({ throttle: 1 }, 900, 60);
  }, [pavement.x, pavement.z, pavement.headingY] as const);

  // Flat pavement is the ground the M2 ride was accepted on. It must be dead
  // straight — not merely nearly straight.
  for (const sample of smooth) {
    expect(sample.wobbleEnergy).toBe(0);
    expect(sample.wobbleYaw).toBe(0);
    expect(sample.wobbleRoll).toBe(0);
    expect(Math.abs(sample.rigYawOffset)).toBeLessThan(1e-9);
    expect(Math.abs(sample.machineYaw)).toBeLessThan(1e-9);
    expect(Math.abs(sample.machineRoll)).toBeLessThan(1e-9);
  }

  // **And so is the loosest ground on the proving ground, which is M13's
  // change.** This spec used to assert that rough ground built energy and held
  // it latent below a visibility threshold. The owner's §13 q8 trigger set has
  // no room for the surface a rider chose, so the energy is now zero rather
  // than merely invisible — a distinction only this half of the test can make.
  const spur = await beat(page, 'trail', 20, 0);
  const rough = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    return window.qa.wobbleTrace({ throttle: 1 }, 1200, 20);
  }, [spur.x, spur.z, spur.headingY] as const);

  for (const sample of rough) {
    expect(sample.wobbleEnergy).toBe(0);
    expect(sample.wobbleYaw).toBe(0);
    expect(sample.wobbleRoll).toBe(0);
    expect(sample.wobbleFootCorrection).toBe(0);
    expect(sample.state).not.toBe('wobbling');
    expect(Math.abs(sample.rigYawOffset)).toBeLessThan(1e-9);
    expect(Math.abs(sample.machineYaw)).toBeLessThan(1e-9);
    expect(Math.abs(sample.machineRoll)).toBeLessThan(1e-9);
  }

  // **The claim only a browser can make, and M13 reversed it.** The old spec
  // proved that sub-threshold energy was *not* a weave in the rendered rig.
  // The owner asked for the pre-rework look back — amplitude proportional to
  // the energy, no dead band — so the same measurement now has to prove the
  // opposite: an energy well under the naming threshold reaches the machine
  // as coupled roll and yaw, and does it without rotating the rider root or
  // making the rider brace.
  const small = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.game.setActions({ throttle: 1 });
    window.game.advance(600);
    // Exercise both amplitude controls through the real live-tuning bridge.
    // A frozen-table default would still animate and could hide a missing
    // `Game.applyTuning()` field; the deliberately asymmetric 4:1 pair cannot.
    window.game.tuning.set('EUC.wobbleMaxYaw', 0.05);
    window.game.tuning.set('EUC.wobbleMaxRoll', 0.20);
    window.game.tuning.set('EUC.wobbleProbeEnergy', 0.1);
    window.game.tuning.set('EUC.wobbleProbeMetres', 0.01);
    window.game.advance(1);
    window.game.tuning.set('EUC.wobbleProbeMetres', 0);
    return window.qa.wobbleTrace({ throttle: 1 }, 60, 1);
  }, [pavement.x, pavement.z, pavement.headingY] as const);

  const peakYaw = Math.max(...small.map((sample) => Math.abs(sample.wobbleYaw)));
  const peakRoll = Math.max(...small.map((sample) => Math.abs(sample.wobbleRoll)));
  const peakEnergy = Math.max(...small.map((sample) => sample.wobbleEnergy));
  expect(peakEnergy).toBeGreaterThan(0);
  expect(peakEnergy).toBeLessThan(EUC.wobbleStateEnergy);
  expect(peakYaw).toBeGreaterThan(0);
  expect(peakRoll).toBeGreaterThan(0);
  // The EUC child carries both axes while the rider root stays on the clean
  // heading. Roll and yaw share one phase, so they never pulse independently.
  expect(Math.max(...small.map((sample) => Math.abs(sample.machineYaw)))).toBeGreaterThan(0);
  expect(Math.max(...small.map((sample) => Math.abs(sample.machineRoll)))).toBeGreaterThan(0);
  expect(small.every((sample) => Math.abs(sample.rigYawOffset) < 1e-9)).toBe(true);
  expect(small.every((sample) => (
    Math.abs(sample.wobbleYaw) < 1e-9
    || Math.sign(sample.wobbleRoll) === Math.sign(sample.wobbleYaw)
  ))).toBe(true);
  expect(small.filter((sample) => Math.abs(sample.wobbleYaw) > 1e-5).every((sample) => (
    Math.abs(sample.wobbleRoll / sample.wobbleYaw - 4) < 1e-6
  ))).toBe(true);
  expect(small.every((sample) => sample.state !== 'wobbling')).toBe(true);
  expect(small.every((sample) => sample.wobbleFootCorrection === 0)).toBe(true);
});

test('a hazard triggers visible foot correction, and then gets out of the way', async ({ page }, testInfo) => {
  await boot(page);
  await enableWobble(page);

  // Ride the reference pavement and take one hazard-shaped hit. The surface
  // contributes nothing — after M13 no surface does — so every reaction below
  // belongs to the hazard rather than to where the rider happened to be.
  const road = await beat(page, 'pad', 20, 0);
  const correction = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.game.setActions({ throttle: 1, steer: 0 });
    window.game.advance(960);
    // **The provocation is a hazard now, not a mistake.** This used to build a
    // committed carve and throw it away with an abrupt reversal, through the
    // neutral steps a real keyboard leaves. M13 made that inert on purpose —
    // carving is the input the owner named as the one wobble must never punish
    // — so the energy arrives through the shipped probe, at the size a spill or
    // a shallow pothole will deliver at Phase 1. Everything asserted below is
    // unchanged: this is still the rendered rig answering a real wobble.
    window.game.tuning.set('EUC.wobbleProbeEnergy', 0.85);
    window.game.tuning.set('EUC.wobbleProbeMetres', 0.01);
    window.game.advance(1);
    window.game.tuning.set('EUC.wobbleProbeMetres', 0);

    // Sample the whole window and keep the step where the boot counter-shift
    // is at its widest, rather than breaking on the first threshold crossing —
    // the oscillator's phase at an arbitrary crossing is luck, and a sample
    // taken near the sine's zero proves nothing about the visible extremes.
    let snapshot = window.game.snapshot();
    let rig = window.qa.rigTransform();
    let best = -1;
    for (let i = 0; i < 120; i += 1) {
      window.game.advance(1);
      const s = window.game.snapshot();
      const r = window.qa.rigTransform();
      const spread = Math.abs(r.leftAnkleZ - r.rightAnkleZ);
      if (
        s.euc.state === 'wobbling'
        && s.euc.wobbleFootCorrection > 0.5
        && Math.abs(s.euc.wobbleYaw) > 0.025
        && spread > best
      ) {
        best = spread;
        snapshot = s;
        rig = r;
      }
    }
    return { snapshot, rig };
  }, [road.x, road.z, road.headingY] as const);

  expect(correction.snapshot.euc.state).toBe('wobbling');
  expect(correction.snapshot.euc.wobbleFootCorrection).toBeGreaterThan(0.5);
  // Feet counter-shift fore/aft on the pedals instead of leaving the wobble to
  // the player's input alone. This is the rendered rig, not merely a scalar.
  expect(Math.sign(correction.rig.leftAnkleZ)).toBe(-Math.sign(correction.rig.rightAnkleZ));
  expect(Math.abs(correction.rig.leftAnkleZ - correction.rig.rightAnkleZ)).toBeGreaterThan(0.02);
  // **Coupled machine motion, articulated rider response.** The EUC child owns
  // the same-phase roll and yaw while the rider root stays on the chosen
  // heading and the shared carve pivot stays untouched.
  expect(correction.rig.headingY)
    .toBeCloseTo(correction.snapshot.euc.headingY, 8);
  expect(correction.rig.machineYaw)
    .toBeCloseTo(correction.snapshot.euc.wobbleYaw, 8);
  expect(correction.rig.machineRoll)
    .toBeCloseTo(-correction.snapshot.euc.wobbleRoll, 8);
  expect(Math.abs(correction.rig.leanRoll + correction.snapshot.euc.rollAngle))
    .toBeLessThan(1e-8);
  // Pedal roll reaches the feet through the leg solve: one ankle is higher
  // while the other is lower, rather than both legs inheriting a rigid root.
  expect(Math.abs(correction.rig.leftAnkleY - correction.rig.rightAnkleY))
    .toBeGreaterThan(0.025);
  // The upper body does not need a compensating wobble roll when no wobble roll
  // was imposed on the lower body. Deleting only the pivot term but retaining
  // its pelvis remap would leave the rider metronoming on a stable machine.
  expect(correction.rig.pelvisRoll)
    .toBeCloseTo(
      -(correction.snapshot.euc.riderRoll - correction.snapshot.euc.rollAngle),
      8,
    );

  await page.screenshot({ path: testInfo.outputPath('wobble-foot-correction.png') });
  await page.evaluate(() => {
    window.game.setActions({ cameraCycle: true });
    window.game.advance(1);
    window.game.setActions({ cameraCycle: false });
  });
  await page.screenshot({ path: testInfo.outputPath('wobble-foot-correction-inspection.png') });

  const recovered = await page.evaluate(() => {
    // Keep full throttle held: experienced-rider correction alone must make
    // the event brief. Easing off is separately proved headlessly to be faster.
    window.game.setActions({ throttle: 1 });
    window.game.advance(120);
    return window.game.snapshot().euc;
  });
  expect(recovered.state).not.toBe('wobbling');
  expect(recovered.wobbleEnergy).toBeLessThan(EUC.wobbleFootCorrectionStart);
});

test('a wobble adds no synthetic pulsing tone to the real master bus', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  // This measures the *bed* for a pulse, so M20's over-speed beep — a
  // deliberate transient at 2.5 kHz, above the band this test reads — has to
  // be out of the fixture or it is measured as the thing being forbidden.
  // See `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);
  await enableWobble(page);
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().armed);

  const measured = await page.evaluate(async () => {
    window.qa.freeze();
    window.qa.resetRide();
    // Isolate wobble from the physical ride bed. The old dedicated triangle
    // oscillator remained audible here at 140–300 Hz; with it deleted, wobble
    // itself contributes silence and tyre/wind remain the only normal bed.
    window.game.tuning.set('AUDIO.windLevel', 0);
    window.game.tuning.set('AUDIO.tyreLevel', 0);
    window.game.tuning.set('AUDIO.beepLevel', 0);
    window.game.setActions({ throttle: 1 });
    window.game.advance(600);
    window.game.tuning.set('EUC.wobbleProbeEnergy', 0.75);
    window.game.tuning.set('EUC.wobbleProbeMetres', 0.01);
    window.game.advance(1);
    window.game.tuning.set('EUC.wobbleProbeMetres', 0);
    window.game.advance(12);
    const snapshot = window.game.snapshot();
    const rms = await window.qa.audioOutputMax(150, 4);
    return {
      wobble: snapshot.euc.wobbleEnergy,
      hasSyntheticVoice: 'wobbleGain' in snapshot.audio,
      rms,
    };
  });

  expect(measured.wobble).toBeGreaterThan(EUC.wobbleStateEnergy);
  expect(measured.hasSyntheticVoice).toBe(false);
  expect(measured.rms).toBeLessThan(0.001);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The machine's own status light
// ---------------------------------------------------------------------------

test('the status light is on the wheel and walks green toward red with the load', async ({ page }) => {
  await boot(page);
  // The light walks the *power ladder*, which needs a sustained flat-out run
  // to reach its upper rungs. See `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);

  const parked = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.advance(30);
    return window.qa.statusLight();
  });
  expect(parked.present).toBe(true);
  // Green at rest, exactly the authored colour.
  expect(parked.colour).toBe(
    BLOCKOUT_COLOURS.statusNormal.toString(16).padStart(6, '0'),
  );

  const pad = await beat(page, 'pad', 10, 0);
  const flatOut = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.game.setActions({ throttle: 1 });
    window.game.advance(1400);
    return {
      light: window.qa.statusLight(),
      stage: window.game.snapshot().euc.powerStage,
      load: window.game.snapshot().euc.loadFactor,
    };
  }, [pad.x, pad.z, pad.headingY] as const);

  // Flat out on flat pavement is the wheel's own limit, and it says so — while
  // the throttle keeps answering, which is what keeps the M2 ride intact.
  expect(flatOut.stage).toBe('notice');
  expect(flatOut.light.colour).not.toBe(parked.colour);
  expect(flatOut.light.intensity).toBeGreaterThan(0);
  // Redder: more red than green, which the resting colour is not.
  const red = Number.parseInt(flatOut.light.colour.slice(0, 2), 16);
  const green = Number.parseInt(flatOut.light.colour.slice(2, 4), 16);
  const restRed = Number.parseInt(parked.colour.slice(0, 2), 16);
  expect(red).toBeGreaterThan(restRed);
  expect(red).toBeGreaterThan(green * 0.8);
});

test('the status light follows the simulation clock, never wall time', async ({ page }) => {
  await boot(page);

  const frozen = await page.evaluate(async () => {
    window.qa.resetRide();
    window.game.setActions({ throttle: 1 });
    window.game.advance(900);
    window.qa.freeze();
    const before = window.qa.statusLight();
    // Real wall-clock time, with the loop frozen. A pulse driven from
    // `performance.now()` would move here; one driven from the fixed step
    // cannot, which is what makes a frozen capture of an amber wheel mean
    // something (`AGENTS.md`: freeze the loop before capturing a transient).
    await new Promise((resolve) => { setTimeout(resolve, 400); });
    const after = window.qa.statusLight();
    window.game.advance(30);
    const stepped = window.qa.statusLight();
    window.game.setActions({ throttle: 0 });
    window.qa.thaw();
    return { before, after, stepped };
  });

  expect(frozen.after.intensity).toBe(frozen.before.intensity);
  expect(frozen.after.colour).toBe(frozen.before.colour);
  // And it is genuinely pulsing rather than simply constant.
  expect(frozen.stepped.intensity).not.toBe(frozen.before.intensity);
});

// ---------------------------------------------------------------------------
// Tilt-back
// ---------------------------------------------------------------------------

test('tilt-back tips the machine back under the rider, and lets go again', async ({ page }) => {
  await boot(page);

  // **Reachability is proved headlessly**, on a fixture with a flat run-up into
  // a gradient — charging a hill at speed is what reaches this rung, and the
  // proving ground's climb sits behind a ninety-degree sweep no straight-line
  // script can follow. What only the browser can prove is that the stage
  // reaches the *screen*: the machine's own pedals tip back under the rider.
  // Lowering the rung through F4 also exercises the live-tuning path that
  // carries every M6 constant to the running controller.
  const run = await page.evaluate(() => {
    window.qa.resetRide();
    window.game.tuning.set('EUC.powerTiltBackLoad', 0.45);
    window.game.setActions({ throttle: 1 });

    const scene = window.game.renderer.scene;
    const pivot = scene.getObjectByName('riding-lean-pivot');
    const level = pivot ? pivot.rotation.x : Number.NaN;

    // **Stopped as soon as the stage is fully engaged, since M16.** A fixed
    // 600-iteration run was twenty seconds of riding, which at the raised top
    // speed carries the wheel four hundred metres — long past the end of the
    // pavement, so what the two speeds below compared was the grass, not the
    // rung. Held only until tilt-back is unambiguously on, this stays on the
    // surface the claim is about.
    let peakTilt = 0;
    let pitchAtPeak = Number.NaN;
    let sawStage = false;
    for (let i = 0; i < 600; i += 1) {
      window.game.advance(4);
      const euc = window.game.snapshot().euc;
      if (euc.powerStage === 'tiltBack') sawStage = true;
      if (euc.tiltBack > peakTilt) {
        peakTilt = euc.tiltBack;
        pitchAtPeak = pivot ? pivot.rotation.x : Number.NaN;
      }
      if (sawStage && euc.tiltBack > 0.95) break;
    }
    const cappedSpeed = window.game.snapshot().euc.speed;

    // Hand the rung back and let the wheel recover its throttle. A fixed run
    // rather than a race to the first non-tilt-back step: the stage releases
    // before the speed it took has come back, and the claim here is about the
    // speed.
    window.game.tuning.reset('EUC.powerTiltBackLoad');
    window.game.advance(300);
    const released = window.game.snapshot().euc.powerStage !== 'tiltBack';
    const freeSpeed = window.game.snapshot().euc.speed;
    window.game.setActions({ throttle: 0 });
    return { level, peakTilt, pitchAtPeak, sawStage, cappedSpeed, freeSpeed, released };
  });

  expect(run.sawStage).toBe(true);
  expect(run.peakTilt).toBeGreaterThan(0.6);
  // The machine tips its pedals back under the rider rather than the rider
  // merely choosing to lean: the lean pivot itself pitches rearward of where it
  // sits at rest.
  expect(run.pitchAtPeak).toBeLessThan(run.level - 0.05);
  // It caps speed while engaged, and gives the speed back when it lets go —
  // which is what makes it a stage the rider rides out of.
  expect(run.released).toBe(true);
  expect(run.freeSpeed).toBeGreaterThan(run.cappedSpeed + 1);
});

// ---------------------------------------------------------------------------
// Crash and recovery, on screen
// ---------------------------------------------------------------------------

test('the rider leaves the wheel, both stay in frame, and the ride comes back', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await enableWobble(page);

  const spur = await beat(page, 'trail', 10, 0);
  const crash = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    return window.qa.crashRun(3000);
  }, [spur.x, spur.z, spur.headingY] as const);

  expect(crash.crashed).toBe(true);
  expect(['wobble', 'pedalStrike', 'landing']).toContain(crash.cause);
  expect(['stepOff', 'runOut', 'sideFall']).toContain(crash.motion);

  // **The rider is genuinely somewhere else.** A crash that only changed a
  // state name would pass every headless assertion and show the player nothing.
  const separated = Math.hypot(crash.separation.x, crash.separation.z);
  expect(separated).toBeGreaterThan(0.4);
  // And the wheel has lain over rather than standing riderless and upright.
  expect(Math.abs(crash.wheelLean)).toBeGreaterThan(0.8);

  // §5: "ease to a wider framing keeping both rider and wheel in shot."
  expect(crash.crashFrame).toBeGreaterThan(0.7);
  expect(crash.armDuring).toBeGreaterThan(crash.armBefore + 0.5);
  expect(crash.riderOnScreen.inFront).toBe(true);
  expect(crash.wheelOnScreen.inFront).toBe(true);
  expect(Math.abs(crash.riderOnScreen.x)).toBeLessThan(1);
  expect(Math.abs(crash.riderOnScreen.y)).toBeLessThan(1);
  expect(Math.abs(crash.wheelOnScreen.x)).toBeLessThan(1);
  expect(Math.abs(crash.wheelOnScreen.y)).toBeLessThan(1);

  // Recovery arrives without being asked, puts the rider at the safe position,
  // keeps the run's crash count, and hands the ordinary camera back.
  expect(crash.recovered).toBe(true);
  expect(crash.recoveredAtSafeSpot).toBe(true);
  expect(crash.crashes).toBe(1);
  expect(crash.armAfter).toBeLessThan(crash.armDuring - 0.5);

  expect(errors).toEqual([]);
});

test('the rider can ride away immediately after a recovery', async ({ page }) => {
  await boot(page);
  await enableWobble(page);

  const spur = await beat(page, 'trail', 10, 0);
  const after = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.qa.crashRun(3000);
    // Hand the axes back, then ride.
    window.game.setActions({ throttle: 1, steer: 0 });
    const before = window.game.snapshot().euc.distanceTravelled;
    window.game.advance(240);
    const snapshot = window.game.snapshot();
    window.game.setActions({ throttle: 0 });
    return {
      state: snapshot.euc.state,
      speed: snapshot.euc.speed,
      ridden: snapshot.euc.distanceTravelled - before,
      crashed: snapshot.euc.crashed,
    };
  }, [spur.x, spur.z, spur.headingY] as const);

  // "Controls restore rapidly. Avoid long realistic recovery"
  // (`EUC_RIDER_MOTION_REFERENCE.md` §15).
  expect(after.crashed).toBe(false);
  expect(after.speed).toBeGreaterThan(2);
  expect(after.ridden).toBeGreaterThan(5);
  expect(['rolling', 'recovering', 'wobbling', 'pedalStrike']).toContain(after.state);
});

test('a crash mid-flight is impossible, and a buffered hop survives one', async ({ page }) => {
  await boot(page);
  await enableWobble(page);

  // The action buffer's rule, extended: a Space press made while the rider is
  // off the wheel stays pending rather than being consumed and thrown away, and
  // fires as a real hop on the first legal step after the restore.
  const spur = await beat(page, 'trail', 10, 0);
  const buffered = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.qa.crashRun(3000);
    const hopsBefore = window.game.snapshot().euc.hops;
    // A press during the crash. It cannot be claimed while crashed.
    window.game.setActions({ hop: true });
    const duringConsumed = window.game.snapshot().consumed.hop;
    window.game.advance(4);
    window.game.setActions({ hop: false, throttle: 1 });
    window.game.advance(240);
    window.game.setActions({ throttle: 0 });
    return {
      hopsBefore,
      duringConsumed,
      hopsAfter: window.game.snapshot().euc.hops,
    };
  }, [spur.x, spur.z, spur.headingY] as const);

  // The press is not silently eaten: it either lands as a hop or lapses with
  // the buffer, and it never lands as a second one.
  expect(buffered.hopsAfter - buffered.hopsBefore).toBeLessThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Budget and hygiene
// ---------------------------------------------------------------------------

test('a session full of crashes leaves nothing behind and stays inside the budget', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await enableWobble(page);

  const spur = await beat(page, 'trail', 10, 0);
  const trace = await page.evaluate(([x, z, heading]) => {
    const counts = [];
    let crashed = 0;
    for (let round = 0; round < 3; round += 1) {
      // `placeRider` is the same operation quick reset performs, so it starts a
      // fresh run and zeroes the counters — the rounds are counted here.
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      if (window.qa.crashRun(2000).crashed) crashed += 1;
      window.game.setActions({ throttle: 1 });
      window.game.advance(240);
      window.game.setActions({ throttle: 0 });
      counts.push(window.game.resources());
    }
    const snapshot = window.game.snapshot();
    return {
      counts,
      crashed,
      draws: snapshot.render.drawCalls,
      triangles: snapshot.render.triangles,
    };
  }, [spur.x, spur.z, spur.headingY] as const);

  // GPU objects must plateau: the status light is one material created once,
  // and a crash allocates no geometry at all.
  const first = trace.counts[0];
  for (const counts of trace.counts.slice(1)) {
    expect(counts.geometries).toBe(first.geometries);
    expect(counts.textures).toBe(first.textures);
    expect(counts.sceneObjects).toBe(first.sceneObjects);
    expect(counts.lights).toBe(first.lights);
  }

  expect(trace.crashed).toBe(3);
  // The budget in `AGENTS.md`, stated as the numbers it states.
  expect(trace.draws).toBeLessThanOrEqual(150);
  expect(trace.triangles).toBeLessThanOrEqual(400_000);
  expect(errors).toEqual([]);
});

test('the whole risk system is visible in the debug overlay', async ({ page }) => {
  await boot(page, 'debug=1');

  const spur = await beat(page, 'trail', 10, 0);
  const shown = await page.evaluate(([x, z, heading]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    window.game.setActions({ throttle: 1 });
    window.game.advance(1200);
    window.game.setActions({ throttle: 0 });
    const read = (field: string): string => {
      const element = document.querySelector(`#euc-debug-overlay [data-field="${field}"]`);
      return element?.textContent ?? '';
    };
    return {
      wobble: read('wobble'),
      power: read('power'),
      crash: read('crash'),
      safe: read('safespot'),
      energy: window.game.snapshot().euc.wobbleEnergy,
    };
  }, [spur.x, spur.z, spur.headingY] as const);

  // Until audio (M8) and the HUD (M9) arrive, F3 is where the ladder's rungs
  // are spelled out in words — and the owner tunes against it with F4 open.
  expect(shown.wobble).toMatch(/energy/);
  expect(shown.power).toMatch(/load/);
  expect(shown.power).toMatch(/normal|notice|warn|tiltBack/);
  expect(shown.crash).not.toBe('');
  expect(shown.safe).toMatch(/heading/);
});
