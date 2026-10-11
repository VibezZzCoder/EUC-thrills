/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LAUNCH_PAD, LIVE_TUNABLES } from '../data/tuning.ts';
import { createOneFootPose, oneFootQualifiedThisFlight, stepOneFootFromController } from '../app/oneFootPose.ts';
import { TrickObserver, createTrickFacts } from '../simulation/trickEvents.ts';
import {
  STEP_SECONDS, lawnPadFixture, levelPadFixture, mesaPadFixture, runPadTrial,
  type PadFixture, type PadTrialResult, type PadWheel,
} from './launchPadBench.ts';

/**
 * M42's pad bench (`docs/PLANS.md` §42.5 "Pad bench"). Pins read the
 * `LAUNCH_PAD` constants, never literals copied from them. Prints one row per
 * speed for each fixture (evidence for the report; the rows are not pinned).
 */

const HEADINGS = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);
/** 3.9 and the minimum itself, ordinary speeds, the shipped top speed and the `?mph=90` cutout edge. */
const SPEEDS = [3.9, LAUNCH_PAD.minimumLaunchSpeed, 6, 10, 15, 20, 29, 37.8] as const;

/** The wheel each speed is ridden on: the shipped table holds up to 20 m/s; 29 needs its cutout off; 37.8 is `?mph=90`. */
function wheelFor(speed: number): PadWheel {
  return speed >= 37 ? 'mph90' : speed >= 25 ? 'cutoutOff' : 'shipped';
}

const level = levelPadFixture();
const mesa = mesaPadFixture();

function sweep(fixture: PadFixture, speed: number): PadTrialResult[] {
  return HEADINGS.map((headingY) => runPadTrial(fixture, { headingY, speed, wheel: wheelFor(speed) }));
}

function row(label: string, speed: number, trial: PadTrialResult): string {
  return `[pad bench] ${label} ${speed.toFixed(1)} m/s: takeoff ${trial.takeoffSpeed.toFixed(2)} m/s, `
    + `vz ${trial.takeoffVz.toFixed(3)}, air ${(trial.airSteps * STEP_SECONDS).toFixed(3)} s, `
    + `apex ${trial.apexMetres.toFixed(3)} m, flight ${trial.flightMetres.toFixed(2)} m, `
    + `${trial.tier} (${trial.score.toFixed(3)})`;
}

test('a launch if and only if armed and at or above the minimum speed, from every heading', () => {
  for (const speed of SPEEDS) {
    for (const headingY of HEADINGS) {
      const armed = runPadTrial(level, { headingY, speed, wheel: wheelFor(speed) });
      const fast = speed >= LAUNCH_PAD.minimumLaunchSpeed;
      assert.equal(armed.launched, fast, `${speed} m/s at ${headingY.toFixed(2)} rad, armed`);
      if (fast) assert.ok(armed.takeoffSpeed >= LAUNCH_PAD.minimumLaunchSpeed);
      assert.equal(armed.hopped, false, 'a pad never mints a hop');
      const disarmed = runPadTrial(level, { headingY, speed, wheel: wheelFor(speed), armed: false });
      assert.equal(disarmed.launched, false, `${speed} m/s disarmed`);
      assert.equal(disarmed.tookOffCount, 0, 'the level ground itself never launches');
    }
  }
});

test('chord offsets at 10 m/s: the 1.4 m trigger is the boundary', () => {
  for (const [chord, fires] of [[0, true], [0.8, true], [1.3, true], [1.5, false], [1.9, false]] as const) {
    for (const headingY of HEADINGS) {
      for (const side of [1, -1]) {
        const trial = runPadTrial(level, { headingY, speed: 10, chord: chord * side });
        assert.equal(trial.launched, fires, `chord ${chord * side} m at ${headingY.toFixed(2)} rad`);
      }
    }
  }
  assert.ok(1.3 < LAUNCH_PAD.triggerRadiusMetres && LAUNCH_PAD.triggerRadiusMetres < 1.5);
});

test('identical air time, apex, tier and score from every heading; clean on the level; never past the cap', () => {
  for (const speed of SPEEDS.filter((value) => value >= LAUNCH_PAD.minimumLaunchSpeed)) {
    const trials = sweep(level, speed);
    const first = trials[0];
    for (const trial of trials) {
      assert.equal(trial.airSteps, first.airSteps, `${speed} m/s air time`);
      assert.ok(Math.abs(trial.apexMetres - first.apexMetres) <= 1e-9, `${speed} m/s apex`);
      assert.equal(trial.tier, first.tier, `${speed} m/s tier`);
      assert.ok(Math.abs(trial.score - first.score) <= 1e-9, `${speed} m/s score`);
      assert.ok(trial.flightMetres <= LAUNCH_PAD.maximumFlightMetres, `${speed} m/s flew ${trial.flightMetres} m`);
    }
    assert.equal(first.tier, 'clean', `${speed} m/s lands clean on the level`);
    assert.ok(first.takeoffVz <= LAUNCH_PAD.verticalSpeed + 1e-12);
    console.log(row('level', speed, first));
  }
});

test('the low mesa: a 0.6 m drop inside the clear disc never carries a flight past the cap', () => {
  for (const speed of SPEEDS.filter((value) => value >= LAUNCH_PAD.minimumLaunchSpeed)) {
    const trials = sweep(mesa, speed);
    for (const trial of trials) {
      assert.equal(trial.launched, true, `${speed} m/s launched`);
      assert.ok(trial.flightMetres <= LAUNCH_PAD.maximumFlightMetres,
        `${speed} m/s flew ${trial.flightMetres.toFixed(2)} m off the mesa`);
      assert.notEqual(trial.tier, 'crash', `${speed} m/s did not crash`);
    }
    console.log(row('mesa', speed, trials[0]));
  }
});

test('the full Pad lift is used up to the cap and the cap takes over above it', () => {
  // vz = min(lift, g·R/(2v) − Δh·v/R): level ground keeps the full lift at
  // 20 m/s and is capped at 29 and 37.8.
  for (const [speed, capped] of [[10, false], [20, false], [29, true], [37.8, true]] as const) {
    const trial = runPadTrial(level, { headingY: 0, speed, wheel: wheelFor(speed) });
    if (capped) assert.ok(trial.takeoffVz < LAUNCH_PAD.verticalSpeed - 0.1, `${speed} m/s capped (${trial.takeoffVz})`);
    else assert.equal(trial.takeoffVz, LAUNCH_PAD.verticalSpeed, `${speed} m/s full lift`);
  }
});

/**
 * Ride one approach and score it with the real trick observer and one-foot
 * pose, as `Game` runs them. `events` is every credit; `padEvents` only those
 * from the pad's own flight (a hop the key fired on the approach scores apart).
 */
function tricks(script: Parameters<typeof runPadTrial>[1]): {
  trial: PadTrialResult; events: string[]; padEvents: string[]; chargedHops: number;
} {
  const observer = new TrickObserver();
  const pose = createOneFootPose();
  const events: string[] = [];
  const padEvents: string[] = [];
  let padFlight = -1;
  const trial = runPadTrial(level, script, (controller, action) => {
    if (controller.padLaunched) padFlight = controller.flightIndex;
    stepOneFootFromController(pose, controller, 1, STEP_SECONDS, action.hopHeld, false);
    const facts = createTrickFacts();
    Object.assign(facts, { flightIndex: controller.flightIndex, tookOff: controller.tookOff,
      hopped: controller.hopped, hopCharge: controller.hopped ? controller.lastHopCharge : 0,
      spinCompleted: controller.spinCompleted,
      oneFootQualified: oneFootQualifiedThisFlight(pose, controller.flightIndex),
      touchedDown: controller.touchedDown, landingQuality: controller.lastLandingQuality,
      crashed: controller.crashed });
    for (const event of observer.step(STEP_SECONDS, facts)) {
      events.push(event.kind);
      if (padFlight >= 0 && controller.flightIndex === padFlight) padEvents.push(event.kind);
    }
  });
  return { trial, events, padEvents, chargedHops: observer.tally.chargedHops };
}

test('the G1 inputs: a 180 (Hop tapped on the first rising step) lands clean and fakie at every speed', () => {
  for (const speed of SPEEDS.filter((value) => value >= 6)) {
    for (const spinTap of ['left', 'right'] as const) {
      const { trial, events, chargedHops } = tricks({ headingY: Math.PI / 4, speed, wheel: wheelFor(speed), spinTap });
      assert.ok(trial.spinArmed, `${speed} m/s: the tap armed the spin`);
      assert.equal(trial.tier, 'clean', `${speed} m/s ${spinTap}: the 180 lands clean`);
      assert.equal(trial.reversing, true, `${speed} m/s ${spinTap}: and rides away fakie`);
      assert.deepEqual(events, ['spin-landed']);
      assert.equal(chargedHops, 0);
    }
  }
});

test('the pose level alone (held from before the trigger, no press: not a player input) is a one-foot; with a tap 180 + one-foot; never a charged hop', () => {
  // The one-foot pose and the observer on a pad flight, isolated: the level is
  // held with no Hop press, which no player can produce on the ground (a held
  // key starts with a press, and a grounded press is a hop). The player's
  // inputs are the real-key tests below (QA A r2 minor 2).
  for (const speed of [6, 10, 15, 20] as const) {
    const held = tricks({ headingY: 0, speed, hopHeld: true });
    assert.ok(held.trial.launched);
    assert.deepEqual(held.events, ['one-foot-air'], `${speed} m/s held from before the trigger`);
    assert.equal(held.chargedHops, 0);
    const both = tricks({ headingY: 0, speed, hopHeld: true, spinTap: 'left' });
    assert.deepEqual([...both.events].sort(), ['one-foot-air', 'spin-landed'], `${speed} m/s tap + hold`);
  }
});

test('the lawn (R12, R16, critic r4): on a pad\'s own grass every Pad lift on the slider lands heavy below the cap speed, never a crash', () => {
  // The F4 note's claim, measured on the slider's own grid. Every city pad
  // stands on grass, whose roughness adds to the landing score; on pavement the
  // shipped lift is clean (pinned above). Heavy costs a little speed, never a crash.
  // Critic r4: the flight leaves the top of a 0.75 m kicker and falls that much
  // further, so a clean lawn landing needs a lift of about 1.3 — a hop off the
  // lip, below the slider (2.4–5.5). R12's clean-lawn try is a coordinator note.
  const slider = LIVE_TUNABLES.find((spec) => spec.path === 'LAUNCH_PAD.verticalSpeed');
  assert.ok(slider !== undefined, 'the F4 Pad lift entry exists');
  assert.equal(slider.min, 2.4);
  assert.ok(slider.min < LAUNCH_PAD.verticalSpeed && LAUNCH_PAD.verticalSpeed < slider.max, 'the shipped lift is on the slider');
  const lawn = lawnPadFixture();
  const stepsOnGrid = Math.round((slider.max - slider.min) / slider.step);
  const rows: string[] = [];
  for (let k = 0; k <= stepsOnGrid; k += 1) {
    const lift: number = Math.round((slider.min + k * slider.step) * 100) / 100;
    const tiers: string[] = [];
    for (const speed of [6, 10, 16] as const) {
      const trial = runPadTrial(lawn, { headingY: 0, speed, lift });
      assert.ok(trial.launched && !trial.crashed && !trial.crashedAfter, `lift ${lift} at ${speed} m/s`);
      assert.equal(trial.takeoffVz, lift, `lift ${lift} at ${speed} m/s is below the cap speed`);
      assert.equal(trial.tier, 'heavy', `lift ${lift} at ${speed} m/s lands heavy on the lawn`);
      tiers.push(`${speed} m/s ${trial.tier} (${trial.score.toFixed(3)})`);
    }
    if (lift <= 2.5 || lift === LAUNCH_PAD.verticalSpeed || lift === slider.max) rows.push(`[pad bench] lawn, Pad lift ${lift.toFixed(2)}: ${tiers.join(', ')}`);
  }
  console.log(rows.join('\n'));
});

// ---------------------------------------------------------------------------
// The G1 trick inputs with a real Hop key (QA A r2 minor 2)
// ---------------------------------------------------------------------------
//
// `hopKey` works the key as a finger does: the input layer latches the press
// (its 0.15 s buffer) and holds the level; the press is claimed only on a step
// the controller can take it, exactly as `Game.stepSeat` claims it. M36's
// one-foot semantics are unchanged (§36.5): a grounded press is a hop, a press
// while rising is the 180, and the one-foot is the *held* key in the air —
// "hold Hop through takeoff", where a hold that continues through a touchdown
// is a new dwell in the next flight (`app/oneFootPose.ts`).

test('G1 one-foot, real key: Hop down a second or more before the pad and held — one hop lands short, the pad flight is a one-foot', () => {
  // The player instruction for G1 (builder-A-report "Finish round"): press
  // Hop at least a second out and keep holding as the pad throws you. The
  // press is a small hop that lands short of the pad; the held key carries
  // into the pad's flight, whose one-foot is credited. No 180, no charged hop.
  for (const speed of [6, 10, 15, 20, 23] as const) {
    for (const seconds of [1.0, 1.5, 3.0] as const) {
      const lead = seconds * speed;
      const { trial, padEvents, chargedHops } = tricks({ headingY: 0, speed, wheel: wheelFor(speed),
        hopKey: { metresBeforeTrigger: lead }, approachMetres: lead + LAUNCH_PAD.triggerRadiusMetres + 10 });
      const label = `${speed} m/s, key down ${seconds} s (${lead.toFixed(1)} m) before the trigger`;
      assert.ok(trial.launched, `${label}: the pad threw the wheel`);
      assert.equal(trial.flightsBeforePad, 1, `${label}: exactly one hop on the approach`);
      assert.notEqual(trial.tier, 'crash', label);
      assert.deepEqual(padEvents, ['one-foot-air'], `${label}: the pad flight is a one-foot`);
      assert.equal(chargedHops, 0, label);
    }
  }
});

test('G1 180 + one-foot, real key: Hop down while rising after the throw and held — the press is the 180, the hold the one-foot', () => {
  for (const speed of [6, 10, 15, 20] as const) {
    const { trial, padEvents, chargedHops } = tricks({ headingY: 0, speed, wheel: wheelFor(speed),
      hopKey: { stepsAfterLaunch: 1 } });
    assert.ok(trial.launched && trial.flightsBeforePad === 0, `${speed} m/s`);
    assert.deepEqual([...padEvents].sort(), ['one-foot-air', 'spin-landed'], `${speed} m/s`);
    assert.equal(chargedHops, 0);
  }
});

test('G1 timing windows, real key at 10 m/s: at the pad the press is eaten; 0.3 s out the hop lands on the kicker and is thrown (q235 evidence)', () => {
  // Printed per lead time; two rows pinned so a change to either is deliberate:
  // a press in the hop's 0.09 s compression as the wheel meets the trigger is
  // eaten by the pad (§42.2e, accepted) and the held key gives the one-foot;
  // a press 0.3 s out fires a hop that comes down on the kicker and is thrown
  // from it (critic r4: a hop's apex is below the 0.75 m lip, so the q235 dead
  // band — R16 measured 0.1–0.5 s of hops carried over the pad — shrinks to
  // the ≈ 0.1 s whose hop lands beyond the trigger).
  const rows: string[] = [];
  let eaten: ReturnType<typeof tricks> | null = null, cleared: ReturnType<typeof tricks> | null = null;
  for (const seconds of [0.02, 0.05, 0.08, 0.12, 0.2, 0.3, 0.45, 0.6, 0.7, 0.8, 1.0] as const) {
    const run = tricks({ headingY: 0, speed: 10, hopKey: { metresBeforeTrigger: seconds * 10 },
      approachMetres: 30 });
    if (seconds === 0.02) eaten = run;
    if (seconds === 0.3) cleared = run;
    rows.push(`[pad bench] key down ${seconds.toFixed(2)} s before the trigger at 10 m/s: `
      + `${run.trial.flightsBeforePad} hop(s) first, ${run.trial.launched ? `pad flight (${run.padEvents.join(', ') || 'no trick'})` : 'NO pad flight'}`);
  }
  console.log(rows.join('\n'));
  assert.ok(eaten !== null && cleared !== null);
  assert.equal(eaten.trial.flightsBeforePad, 0, 'the pad eats a press made at the trigger');
  assert.deepEqual(eaten.padEvents, ['one-foot-air']);
  assert.equal(cleared.trial.flightsBeforePad, 1, 'a hop 0.3 s out flies first');
  assert.equal(cleared.trial.launched, true, '… comes down on the kicker, and the pad throws it');
});
