/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LiveTuning } from '../data/liveTuning.ts';
import { AUDIO, CAMERA, EUC, HAZARD, LIVE_TUNABLES, SIMULATION } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { LevelPlan } from '../level/plan.ts';
import { EucController, type EucTuning } from './EucController.ts';
import { HazardField } from './hazards.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import {
  METRES_PER_SECOND_PER_MPH,
  TOP_SPEED_PATHS,
  shippedTopSpeedBase,
  shippedTopSpeedMph,
  topSpeedPreset,
  topSpeedWrites,
  type TopSpeedPreset,
} from './topSpeedPreset.ts';

/**
 * The top-speed preset — M30 Phase 0 (`docs/PLANS.md` §30.3a, §30.4 items 1
 * and 3).
 *
 * Three claims. **The recipe is arithmetic**: it reproduces M16's four
 * hand-found constants from M16's own inputs, is the identity at the shipped
 * speed, and lands §30.2 fact 1's 65 mph numbers. **A controller under it
 * rides the wheel the numbers describe**: the beeps and the cutout are
 * shares of `derivedTopSpeed` and follow the drag on their own, so 65 puts
 * them at 52 and 64.2 mph without a line of code naming either. **And the
 * timings fact 7 estimated are measured here**, at 50 and at 65, headless
 * on a kilometre of pavement — the run-up and the flat-out run to the cutout,
 * joined by Phase 1's deep-hole braking distance (§30.5 item 3), which adds
 * 58 to the pair.
 */

const STEP = 1 / SIMULATION.hz;
const MPH = 1 / METRES_PER_SECOND_PER_MPH;

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/** A kilometre of straight pavement — `EucController.test.ts`' runway. */
function runwayPlan(): LevelPlan {
  return buildLevelPlan(
    [{ id: 'runway', length: 2000, halfWidth: 12, surface: 'pavement', shoulder: 1 }],
    {
      id: 'runway',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 4,
    },
  );
}

/** A controller wearing the preset, exactly as `Game.applyTuning` dresses one. */
function controllerUnder(preset: TopSpeedPreset | null, extra: Partial<EucTuning> = {}): EucController {
  const plan = runwayPlan();
  const tuning: Partial<EucTuning> = preset === null
    ? {}
    : {
      dragCoefficient: preset.dragCoefficient,
      powerComfortSpeed: preset.powerComfortSpeed,
      powerLimitSpeed: preset.powerLimitSpeed,
    };
  return new EucController(new PlanTerrainSampler(plan), {
    tuning: { ...tuning, ...extra },
    spawn: plan.spawn,
    hazards: new HazardField([]),
  });
}

/** Ride flat out: the seconds to `share` of the pavement terminal, and to the cutout. */
function timeFlatOut(euc: EucController, terminal: number): {
  toShare: number;
  toShareMetres: number;
  toCutout: number;
  toCutoutMetres: number;
  firstBeepMph: number;
  cutoutMph: number;
} {
  let toShare = Number.NaN;
  let toShareMetres = Number.NaN;
  let firstBeepMph = Number.NaN;
  let lastRiding = 0;
  let toCutout = Number.NaN;
  let toCutoutMetres = Number.NaN;
  for (let i = 0; i < SIMULATION.hz * 40; i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    const state = euc.snapshot();
    const seconds = (i + 1) * STEP;
    if (Number.isNaN(toShare) && Math.abs(state.speed) >= 0.95 * terminal) {
      toShare = seconds;
      toShareMetres = state.position.z;
    }
    if (Number.isNaN(firstBeepMph) && euc.overspeed > 0) firstBeepMph = Math.abs(state.speed) * MPH;
    if (state.crashed) {
      toCutout = seconds;
      toCutoutMetres = state.position.z;
      break;
    }
    lastRiding = Math.abs(state.speed);
  }
  return { toShare, toShareMetres, toCutout, toCutoutMetres, firstBeepMph, cutoutMph: lastRiding * MPH };
}

/**
 * The pre-M30 table's inputs to the recipe — the 50 mph wheel M16 shipped and
 * M30 Phases 0 to 3 were built on, recorded here because the shipped table no
 * longer holds them.
 *
 * `driveAccel` and `rollingResistance` are read from the live table on
 * purpose: they did **not** move at Phase 4 (M16's decision, restated in
 * `topSpeedPreset.ts` — the drive is never touched), and reading them means
 * that if one ever does, the derivation below stops reproducing the shipped
 * table and says so instead of quietly agreeing with itself.
 */
const PRE_M30_BASE = Object.freeze({
  ...shippedTopSpeedBase(),
  dragCoefficient: 0.0147,
  powerComfortSpeed: 17.0,
  powerLimitSpeed: 25.1,
  crashDistance: 11.5,
});

test('the shipped table IS the 65 mph preset applied to the pre-M30 table, to the bit', () => {
  // **M30 Phase 4, `docs/PLANS.md` §30.9 item 2 — the owner's decision of
  // 2026-09-03: "we will ship at 65. i pre-approve."**
  //
  // The six literals in `data/tuning.ts` are not hand-typed numbers. They are
  // what this recipe writes for 65 mph applied to the 50 mph table above,
  // transcribed as the shortest decimal that round-trips to the same double.
  // This is the test that makes that claim checkable: derive them again and
  // compare with `assert.equal`, which is `===`. A tidied literal, a rounded
  // one, or a seventh constant somebody moved by hand all fail here.
  assert.ok(
    Math.abs(PRE_M30_BASE.driveAccel - 7.670808617667248) < 1e-12
      && Math.abs(PRE_M30_BASE.rollingResistance - 0.35) < 1e-12,
    'the drive or the rolling resistance moved, so the recorded pre-M30 base no longer '
      + 'describes the wheel the shipped table was derived from — re-derive both, do not widen this',
  );

  const preset = topSpeedPreset(65, PRE_M30_BASE);
  const writes = topSpeedWrites(preset);
  assert.deepEqual(Object.keys(writes), [...TOP_SPEED_PATHS]);

  assert.equal(EUC.dragCoefficient, writes['EUC.dragCoefficient']);
  assert.equal(EUC.powerComfortSpeed, writes['EUC.powerComfortSpeed']);
  assert.equal(EUC.powerLimitSpeed, writes['EUC.powerLimitSpeed']);
  assert.equal(CAMERA.speedReference, writes['CAMERA.speedReference']);
  assert.equal(AUDIO.speedReference, writes['AUDIO.speedReference']);
  assert.equal(CAMERA.crashDistance, writes['CAMERA.crashDistance']);

  // And the figures `docs/PLANS.md` §30.2 fact 1 quotes, which is what the
  // owner was shown before he chose. The ratio is measured against the 50 mph
  // wheel, so it belongs to this derivation and not to the shipped one (where
  // the preset is now the identity — the test below).
  assert.ok(Math.abs(preset.dragCoefficient - 0.00867) < 0.00001, `drag ${preset.dragCoefficient}`);
  assert.ok(Math.abs(preset.pavementTerminal - 29.06) < 0.01, `terminal ${preset.pavementTerminal}`);
  assert.ok(Math.abs(preset.dragOnlyTop - 29.74) < 0.01, `drag-only top ${preset.dragOnlyTop}`);
  assert.ok(Math.abs(preset.ratio - 1.302) < 0.002, `ratio ${preset.ratio}`);
  assert.ok(Math.abs(preset.powerComfortSpeed - 22.1) < 0.05, `comfort ${preset.powerComfortSpeed}`);
  assert.ok(Math.abs(preset.powerLimitSpeed - 32.7) < 0.05, `limit ${preset.powerLimitSpeed}`);
  assert.ok(Math.abs(preset.crashDistance - 14.97) < 0.01, `crash arm ${preset.crashDistance}`);
  assert.equal(writes['CAMERA.speedReference'], preset.pavementTerminal);
  assert.equal(writes['AUDIO.speedReference'], preset.pavementTerminal);
});

test('the recipe reproduces M16 from M16\'s own inputs', () => {
  // M16 cut drag from about 0.032 to 0.0147 for 50 mph and rescaled four
  // constants by hand: 11.5 → 17.0, 17.0 → 25.1, and both references
  // 15.0 → 22.3 (`docs/PLANS.md` §16.2). Fed the pre-M16 table, the recipe
  // has to land on the same four numbers within a percent — that is what
  // makes it a recipe rather than a checklist.
  const shipped = shippedTopSpeedBase();
  const m16 = { ...shipped, dragCoefficient: 0.032, powerComfortSpeed: 11.5, powerLimitSpeed: 17.0, crashDistance: 8.6 };
  const preset = topSpeedPreset(50, m16);
  const within = (actual: number, expected: number, what: string): void => {
    assert.ok(
      Math.abs(actual / expected - 1) < 0.01,
      `${what}: ${actual.toFixed(3)} against M16's ${expected}`,
    );
  };
  within(preset.dragCoefficient, 0.0147, 'drag');
  within(preset.powerComfortSpeed, 17.0, 'powerComfortSpeed');
  within(preset.powerLimitSpeed, 25.1, 'powerLimitSpeed');
  within(preset.speedReference, 22.3, 'CAMERA.speedReference');
  within(topSpeedWrites(preset)['AUDIO.speedReference'], 22.3, 'AUDIO.speedReference');
});

test('the shipped wheel reads 65 mph out of the table, and ?mph=65 is the identity on it', () => {
  // The other direction of the same claim: `shippedTopSpeedBase()` /
  // `shippedTopSpeedMph()` read the *table*, so once the table is the 65 mph
  // preset they must say 65 — exactly, because the drag literal is the exact
  // double the recipe produced rather than a rounded one. (The old 50 mph
  // table read 49.92 for exactly the reason this one does not: 0.0147 was a
  // number a human chose off the F4 grid.)
  const mph = shippedTopSpeedMph();
  assert.ok(Math.abs(mph - 65) < 1e-9, `the shipped wheel is ${mph.toFixed(4)} mph on pavement`);
  const preset = topSpeedPreset(mph);
  assert.ok(Math.abs(preset.ratio - 1) < 1e-9);
  assert.equal(preset.dragCoefficient, EUC.dragCoefficient);
  assert.ok(Math.abs(preset.powerComfortSpeed - EUC.powerComfortSpeed) < 1e-9);
  assert.ok(Math.abs(preset.powerLimitSpeed - EUC.powerLimitSpeed) < 1e-9);
  assert.ok(Math.abs(preset.crashDistance - CAMERA.crashDistance) < 1e-9);
  assert.ok(Math.abs(preset.speedReference - CAMERA.speedReference) < 1e-9);
  assert.ok(Math.abs(preset.speedReference - AUDIO.speedReference) < 1e-9);
  // So a `?mph=65` URL on the shipped build writes the table back onto itself
  // — the switch is now the A/B *away* from the default rather than toward it.
  const writes = topSpeedWrites(topSpeedPreset(65));
  assert.equal(writes['EUC.dragCoefficient'], EUC.dragCoefficient);
  assert.equal(writes['CAMERA.speedReference'], CAMERA.speedReference);
});

test('?mph=50 is the A/B back to the wheel M16 shipped', () => {
  // q117, kept: the switch stays as a diagnostic on `?wobble=`'s terms, and
  // with 65 shipped its working use is `?mph=50` — the old wheel, one URL
  // away, still refusing records (`Game.probing`, §30.2 fact 8).
  //
  // It is the M16 wheel to a third of a percent rather than to the bit, and
  // the difference is worth stating: 0.0147 was a number chosen off the F4
  // grid whose true terminal was 49.92 mph, while `?mph=50` asks for 50 and
  // gets it. Riding the exact pre-M30 table is `?mph=49.92`.
  const fifty = topSpeedPreset(50);
  assert.ok(Math.abs(fifty.pavementTerminal - 22.352) < 0.001, `terminal ${fifty.pavementTerminal}`);
  assert.ok(
    Math.abs(fifty.dragCoefficient / PRE_M30_BASE.dragCoefficient - 1) < 0.004,
    `?mph=50 writes drag ${fifty.dragCoefficient}, against M16's ${PRE_M30_BASE.dragCoefficient}`,
  );
  const exact = topSpeedPreset(shippedTopSpeedMph(PRE_M30_BASE));
  assert.ok(Math.abs(exact.dragCoefficient - PRE_M30_BASE.dragCoefficient) < 1e-12);
  assert.ok(Math.abs(exact.powerComfortSpeed - PRE_M30_BASE.powerComfortSpeed) < 1e-9);
  assert.ok(Math.abs(exact.crashDistance - PRE_M30_BASE.crashDistance) < 1e-9);
});

test('every write fits its F4 slider at both ends of the URL window, or the store would bend the wheel', () => {
  // `LiveTuning.set` clamps to the registered range. A preset that lands
  // outside it would be quietly clamped into a wheel nobody asked for, which
  // is the "malformed URL silently means a different valid URL" class the
  // parser exists to refuse — so the window `levels.ts` accepts (20–90 mph)
  // has to fit inside the sliders, and this is where that is pinned.
  const specs = new Map(LIVE_TUNABLES.map((spec) => [spec.path, spec]));
  for (const mph of [20, 50, 65, 90]) {
    const writes = topSpeedWrites(topSpeedPreset(mph));
    for (const path of TOP_SPEED_PATHS) {
      const spec = specs.get(path);
      assert.ok(spec, `${path} has no LIVE_TUNABLES entry`);
      const value = writes[path];
      assert.ok(
        value >= spec.min && value <= spec.max,
        `${mph} mph writes ${path} = ${value.toFixed(4)}, outside ${spec.min}..${spec.max}`,
      );
    }
  }
});

test('the F4 drag slider resolves the whole ?mph= window, and reset does not need the grid', () => {
  // §30.3a: "F4 keeps its drag slider, with the step reduced so 0.0087 is
  // reachable; the panel and the parameter write one store and cannot
  // disagree."
  //
  // **Re-derived at M30 Phase 4**, because the claim it used to make is no
  // longer the right one. It asserted that the *shipped* drag sits on the
  // range input's `min + k · step` grid — true of M16's hand-chosen 0.0147
  // and false of every derived preset, 65's included: the exact 65 mph drag
  // is 0.008670408739376268 and the nearest grid point is 0.0087. That was
  // always true of `?mph=` (the store takes the exact number; only the
  // input's *thumb* snaps), so the old assertion was passing on an accident
  // of which number a human happened to type.
  //
  // The two claims worth making instead: the grid is fine enough to be a
  // usable instrument across the window the URL accepts, and resetting the
  // slider restores the exact default regardless of the grid, because
  // `LiveTuning.reset` writes the default rather than reading the input.
  const spec = LIVE_TUNABLES.find((entry) => entry.path === 'EUC.dragCoefficient');
  assert.ok(spec, 'EUC.dragCoefficient has no slider');
  const snap = (value: number): number => spec.min + Math.round((value - spec.min) / spec.step) * spec.step;
  assert.ok(spec.step <= 0.0001, `a step of ${spec.step} cannot resolve 65 mph's 0.0087 from 50 mph's 0.0147`);

  // One step of the slider is worth well under a mile an hour anywhere in the
  // 20–90 mph window — the resolution claim, in the units the owner rides in.
  const mphAt = (drag: number): number =>
    Math.sqrt((PRE_M30_BASE.driveAccel - PRE_M30_BASE.rollingResistance) / drag) / METRES_PER_SECOND_PER_MPH;
  for (const mph of [20, 50, 65, 90]) {
    const drag = topSpeedPreset(mph).dragCoefficient;
    assert.ok(
      Math.abs(mphAt(snap(drag)) - mph) < 1,
      `the nearest grid point to ${mph} mph's drag is ${mphAt(snap(drag)).toFixed(2)} mph`,
    );
  }

  // And the store's reset is exact even though the shipped drag is off-grid.
  const tuning = new LiveTuning();
  tuning.set('EUC.dragCoefficient', 0.0147);
  assert.equal(tuning.get('EUC.dragCoefficient'), 0.0147);
  tuning.reset('EUC.dragCoefficient');
  assert.equal(tuning.get('EUC.dragCoefficient'), EUC.dragCoefficient);
});

test('a wheel under the 65 preset beeps at 52 mph and lets go at 64.2', () => {
  const preset = topSpeedPreset(65);
  const euc = controllerUnder(preset, { cutoutEnabled: 1 });
  const top = euc.derivedTopSpeed;
  assert.ok(Math.abs(top - preset.dragOnlyTop) < 1e-9, 'the controller derives the preset\'s own top');
  assert.ok(Math.abs(top * EUC.overspeedBeepShare * MPH - 52.2) < 0.2, `beep share at ${(top * EUC.overspeedBeepShare * MPH).toFixed(1)} mph`);
  assert.ok(Math.abs(top * EUC.cutoutSpeedShare * MPH - 64.2) < 0.2, `cutout share at ${(top * EUC.cutoutSpeedShare * MPH).toFixed(1)} mph`);

  const ride = timeFlatOut(euc, preset.pavementTerminal);
  assert.equal(euc.snapshot().crashCause, 'cutout', `the ride ended by ${euc.snapshot().crashCause}`);
  assert.ok(Math.abs(ride.firstBeepMph - 52.2) < 0.5, `the first beep was at ${ride.firstBeepMph.toFixed(1)} mph`);
  assert.ok(Math.abs(ride.cutoutMph - 64.2) < 0.5, `the cutout fired at ${ride.cutoutMph.toFixed(1)} mph`);
});

test('the run-up and the cutout, timed at 50 and at 65 (fact 7\'s estimates, measured)', () => {
  // Fact 7 estimated "about 8 s → about 10.5 s" to top speed and "about 10 s
  // → about 13 s" to the cutout. Recorded here as measurements so the cost
  // report has numbers; the bounds are loose on purpose — a legitimate
  // launch tune moves them and should not fail here — and the message
  // carries the figure.
  //
  // **The two wheels swapped places at M30 Phase 4**: 65 is the frozen table
  // now and 50 is the preset, so `controllerUnder(null)` is the fast one and
  // the slow one is `?mph=50`'s. The claim is unchanged — the faster wheel
  // takes longer to get there at the same drive — and it is stated in terms
  // of which wheel is faster rather than which is shipped.
  const fiftyPreset = topSpeedPreset(50);
  const fifty = timeFlatOut(
    controllerUnder(fiftyPreset, { cutoutEnabled: 1 }),
    fiftyPreset.pavementTerminal,
  );
  const preset = topSpeedPreset(shippedTopSpeedMph());
  const sixtyFive = timeFlatOut(controllerUnder(null, { cutoutEnabled: 1 }), preset.pavementTerminal);

  const report = `50 mph: 0.95 of terminal in ${fifty.toShare.toFixed(2)} s (${fifty.toShareMetres.toFixed(0)} m), `
    + `cutout at ${fifty.toCutout.toFixed(2)} s (${fifty.toCutoutMetres.toFixed(0)} m, ${fifty.cutoutMph.toFixed(1)} mph); `
    + `65 mph: 0.95 of terminal in ${sixtyFive.toShare.toFixed(2)} s (${sixtyFive.toShareMetres.toFixed(0)} m), `
    + `cutout at ${sixtyFive.toCutout.toFixed(2)} s (${sixtyFive.toCutoutMetres.toFixed(0)} m, ${sixtyFive.cutoutMph.toFixed(1)} mph)`;

  assert.ok(Number.isFinite(fifty.toShare) && Number.isFinite(fifty.toCutout), report);
  assert.ok(Number.isFinite(sixtyFive.toShare) && Number.isFinite(sixtyFive.toCutout), report);
  // The faster wheel takes longer to get there, at the same drive.
  assert.ok(sixtyFive.toShare > fifty.toShare + 1, report);
  assert.ok(sixtyFive.toCutout > fifty.toCutout + 1, report);
  // And neither is a chore: under twenty seconds to the edge on either wheel.
  assert.ok(fifty.toCutout < 20 && sixtyFive.toCutout < 20, report);
});

/**
 * Ride flat out until the speed stops moving, then hold the brake lean down to
 * `EUC.hazardCrashSpeed`: the deep-hole stopping distance, measured through the
 * controller. `drag` is the wheel's own drag coefficient, which the floor below
 * needs and the caller already has.
 */
function brakeToHazardSpeed(euc: EucController, drag: number): {
  terminal: number;
  metres: number;
  seconds: number;
  fullBrakeSeconds: number;
  kinematic: number;
  floor: number;
} {
  // 1. Flat out until terminal: steady inside 0.01 m/s across a whole second,
  //    capped at forty. The caller disables the cutout, or the wheel would let
  //    go before it ever settled.
  const oneSecond = Math.round(SIMULATION.hz);
  const speeds: number[] = [];
  let terminal = Number.NaN;
  let start = Number.NaN;
  let rolling = 0;
  for (let i = 0; i < SIMULATION.hz * 40; i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    const state = euc.snapshot();
    const speed = Math.abs(state.speed);
    speeds.push(speed);
    const secondAgo = speeds.length - 1 - oneSecond;
    if (secondAgo >= 0 && Math.abs(speed - speeds[secondAgo]) < 0.01) {
      terminal = speed;
      start = state.position.z;
      rolling = state.rollingResistance;
      break;
    }
  }

  // 2. Brake. There is no brake input: leaning back *is* the brake, so the
  //    throttle axis goes to −1, and a lean opposing travel is what reads
  //    `brakeAuthority` instead of `leanToAccel` (`EucController.step`
  //    section 2). It has to be held — `leanPitch` is a state variable that
  //    approaches its target, so releasing the axis releases the brake with it.
  let metres = Number.NaN;
  let seconds = Number.NaN;
  let fullBrakeSeconds = Number.NaN;
  for (let i = 0; i < SIMULATION.hz * 40; i += 1) {
    euc.step(STEP, actions({ throttle: -1 }));
    const state = euc.snapshot();
    if (Number.isNaN(fullBrakeSeconds) && state.leanPitch <= -0.99 * EUC.maxLeanPitch) {
      fullBrakeSeconds = (i + 1) * STEP;
    }
    if (Math.abs(state.speed) <= EUC.hazardCrashSpeed) {
      metres = state.position.z - start;
      seconds = (i + 1) * STEP;
      break;
    }
  }

  const authority = EUC.brakeAuthority * Math.sin(EUC.maxLeanPitch);
  const crash = EUC.hazardCrashSpeed;
  // Fact 7's arithmetic: full authority, arriving instantly, nothing else.
  const kinematic = (terminal * terminal - crash * crash) / (2 * authority);
  // The floor the wheel physically cannot beat: the same instant brake with
  // its own drag and rolling resistance helping, ∫ v dv / (a + r + k v²).
  const floor = Math.log(
    (authority + rolling + drag * terminal * terminal) / (authority + rolling + drag * crash * crash),
  ) / (2 * drag);
  return { terminal, metres, seconds, fullBrakeSeconds, kinematic, floor };
}

test('the deep-hole braking distance at 50, 58 and 65, measured through the controller', (t) => {
  // `docs/PLANS.md` §30.5 item 3: fact 7's deep-hole bargain measured rather
  // than computed. Each wheel rides flat out to terminal with the cutout off,
  // then holds full brake lean to `EUC.hazardCrashSpeed`, and the distance is
  // read against `HAZARD.readMetres` — the 40 m at which a hole is shown,
  // measured by eye, which does not scale with the wheel.
  //
  // The measured stop exceeds an *instant* brake of the same authority,
  // because the lean is a state variable: swinging from full drive to full
  // brake takes about 0.8 s (most of it inside the first quarter second), and
  // the wheel is still accelerating for the first few frames of it. It comes
  // in *under* fact 7's figure all the same, because that arithmetic counts
  // brake authority alone: at 29 m/s the 65 wheel's own drag is another
  // 7.3 m/s² pushing the same way as the brake's 10.5. `floor` is the
  // comparison that survives both effects.
  //
  // **M30 Phase 4 swapped which of the three is the frozen table.** 65 is the
  // shipped wheel and rides on `controllerUnder(null)`; 50 and 58 are presets.
  // The finding the cost report was written for is now a fact about the
  // shipped game rather than about a diagnostic: 40 m still covers the stop,
  // with metres of reserve rather than tens of them.
  const wheels = [
    ...[50, 58].map((mph) => {
      const preset = topSpeedPreset(mph);
      return { mph, euc: controllerUnder(preset, { cutoutEnabled: 0 }), drag: preset.dragCoefficient };
    }),
    { mph: shippedTopSpeedMph(), euc: controllerUnder(null, { cutoutEnabled: 0 }), drag: EUC.dragCoefficient },
  ];
  const runs = wheels.map((wheel) => ({ mph: wheel.mph, ...brakeToHazardSpeed(wheel.euc, wheel.drag) }));
  const fifty = runs[0];
  const fiftyEight = runs[1];
  const sixtyFive = runs[2];
  assert.ok(Math.abs(sixtyFive.mph - 65) < 1e-9, `the shipped wheel is ${sixtyFive.mph} mph, not 65`);

  const report = `deep-hole braking to ${EUC.hazardCrashSpeed} m/s at full lean, against `
    + `HAZARD.readMetres ${HAZARD.readMetres} m:\n`
    + runs.map((run) => `  ${run.mph.toFixed(0)} mph wheel: terminal ${run.terminal.toFixed(2)} m/s `
      + `(${(run.terminal * MPH).toFixed(1)} mph) — ${run.metres.toFixed(1)} m in ${run.seconds.toFixed(2)} s, `
      + `margin ${(HAZARD.readMetres - run.metres).toFixed(1)} m; `
      + `fact 7's kinematic ${run.kinematic.toFixed(1)} m, instant-brake floor ${run.floor.toFixed(1)} m, `
      + `full lean at ${run.fullBrakeSeconds.toFixed(2)} s`).join('\n');
  t.diagnostic(report);

  for (const run of runs) {
    assert.ok(Number.isFinite(run.terminal), `${run.mph.toFixed(0)} mph never settled at terminal\n${report}`);
    assert.ok(Number.isFinite(run.metres) && Number.isFinite(run.seconds), report);
    // The controller cannot brake harder than its own authority plus its own
    // resistance, and it loses the lean swing on top of that. A stop under
    // this floor is a broken brake, not a retune.
    assert.ok(run.metres > run.floor, report);
  }
  // Faster wheel, longer stop — the whole of fact 7's bargain.
  assert.ok(sixtyFive.metres > fiftyEight.metres && fiftyEight.metres > fifty.metres, report);
  // Loose bands: a launch or brake retune moves these and should not fail here.
  assert.ok(fifty.metres > 15 && fifty.metres < 35, report);
  assert.ok(sixtyFive.metres > 30 && sixtyFive.metres < 70, report);
  // And the finding the cost report is for: 40 m still covers the stop at 65,
  // but only just — the reserve is metres, not tens of them.
  assert.ok(HAZARD.readMetres - sixtyFive.metres > 0, report);
});

test('a speed that is not a speed is refused rather than written', () => {
  assert.throws(() => topSpeedPreset(0), /not a speed/);
  assert.throws(() => topSpeedPreset(Number.NaN), /not a speed/);
  assert.throws(() => topSpeedPreset(-65), /not a speed/);
  assert.throws(
    () => topSpeedPreset(65, { ...shippedTopSpeedBase(), rollingResistance: 99 }),
    /rolling resistance/,
  );
});
