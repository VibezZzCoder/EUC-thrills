/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { EUC, ONE_FOOT, PHYSICS, RIDER_BLOCKOUT, SIMULATION, WHEEL } from '../data/tuning.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import type { Hazard } from '../level/plan.ts';
import { EucController, createPose, type EucPose, type EucTuning } from '../simulation/EucController.ts';
import { GhostPlayer, GhostRecorder, createGhostSample } from '../simulation/ghost.ts';
import { HazardField } from '../simulation/hazards.ts';
import { PlanTerrainSampler } from '../simulation/planSampler.ts';
import { TrickObserver, createTrickFacts } from '../simulation/trickEvents.ts';
import { createGhostRider } from '../render/ghostRider.ts';
import {
  cancelOneFoot,
  createOneFootPose,
  oneFootQualifiedThisFlight,
  readableWindowSeconds,
  resetOneFoot,
  stepOneFoot,
  stepOneFootFromController,
  type OneFootFacts,
  type OneFootPoseState,
} from './oneFootPose.ts';

/**
 * The one-foot air pose's lifecycle — M36 §36.5, held against the real
 * controller and against §36.5's own input table.
 *
 * Two kinds of test. The **ridden** ones drive a production `EucController`
 * on a flat plan and step the pose the way `app/Game.ts` steps it
 * (`stepOneFootFromController`, the one reading), so what is asserted is the
 * timing the game will show on the shipped hop. The **pure** ones hand the
 * state machine synthetic facts, because a crash in mid-air, a countdown and
 * a recovery are cheap to state and expensive to ride.
 *
 * And the two contracts the plan makes non-negotiable: **physical equality**
 * — three rides that differ only in the held level digest to the same bytes
 * — and **the ghost has no channel**.
 */

const STEP = 1 / SIMULATION.hz;

const PLAN = buildLevelPlan(
  [{ id: 'flat', length: 1200, halfWidth: 12, surface: 'pavement', shoulder: 2 }],
  {
    id: 'one-foot-flat',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'pavement' },
    spacing: 8,
  },
);

function controller(tuning: Partial<EucTuning> = {}, hazards: readonly Hazard[] = []): EucController {
  return new EucController(new PlanTerrainSampler(PLAN), {
    spawn: PLAN.spawn,
    tuning,
    hazards: new HazardField(hazards),
  });
}

/** One stepped record, so a failure message can say where in the flight it was. */
interface Sample {
  readonly step: number;
  readonly oneFoot: number;
  readonly state: OneFootPoseState['state'];
  readonly airborne: boolean;
  readonly tookOff: boolean;
  readonly touchedDown: boolean;
  readonly rising: boolean;
  readonly held: boolean;
}

/**
 * A rider: the controller, its pose, its one-foot state, and one `step` that
 * does exactly what `Game.stepSeat` does with them, in that order.
 */
class Rider {
  readonly euc: EucController;
  readonly pose = createPose();
  readonly state: OneFootPoseState;
  readonly trace: Sample[] = [];
  private steps = 0;

  constructor(tuning: Partial<EucTuning> = {}, state = createOneFootPose()) {
    this.euc = controller(tuning);
    this.state = state;
  }

  /** Called after every step, with the pose and state written — a recorder's hook. */
  onStep: (() => void) | null = null;

  step(input: Partial<ActionSnapshot>, held: boolean): Sample {
    const actions: ActionSnapshot = {
      ...NEUTRAL_ACTIONS,
      ...input,
      // Governed off the over-speed warning unless the script says otherwise,
      // the ridden clearance sweep's own rule, so a long run never cuts out.
      throttle: input.throttle ?? (this.euc.overspeed > 0.8 ? 0 : 1),
      hopHeld: held,
    };
    this.euc.step(STEP, actions);
    this.euc.writePose(this.pose);
    stepOneFootFromController(this.state, this.euc, this.pose.recoverBlend, STEP, held, false);
    const sample: Sample = {
      step: this.steps,
      oneFoot: this.state.oneFoot,
      state: this.state.state,
      airborne: this.euc.groundClearance > 0 && !this.euc.crashed,
      tookOff: this.euc.tookOff,
      touchedDown: this.euc.touchedDown,
      rising: this.euc.verticalRate > 0,
      held,
    };
    this.trace.push(sample);
    this.steps += 1;
    this.onStep?.();
    return sample;
  }

  /** Ride straight for `steps`, nothing held. */
  run(steps: number): void {
    for (let i = 0; i < steps; i += 1) this.step({}, false);
  }

  /**
   * Press Hop now, then fly the whole flight under a held rule, and keep
   * stepping `after` more steps on the ground. `held(airSteps, rising)` is
   * asked every step; `airSteps` is -1 on the ground before takeoff, 0 on
   * the takeoff step, and keeps counting on the ground after landing.
   */
  hop(
    held: (airSteps: number, rising: boolean, grounded: boolean) => boolean,
    options: { charge?: number; steer?: number; spinAt?: number; after?: number; throttle?: number } = {},
  ): { takeoff: number; touchdown: number; flight: Sample[] } {
    const start = this.trace.length;
    if (options.charge !== undefined && options.charge > 0) {
      for (let i = 0; i < options.charge; i += 1) {
        this.step({ crouch: true, steer: options.steer ?? 0, throttle: options.throttle }, held(-1, false, true));
      }
    }
    let airSteps = -1;
    let takeoff = -1;
    let touchdown = -1;
    let pressed = false;
    let spun = false;
    for (let i = 0; i < 400; i += 1) {
      const grounded = takeoff === -1 || touchdown !== -1;
      const rising = this.euc.verticalRate > 0;
      const input: Partial<ActionSnapshot> = {
        steer: options.steer ?? 0,
        // The press: once on the ground, plus the optional airborne second
        // press that arms the 180 (a one-step edge, `hopWasHeld` reset between).
        hop: !pressed || (options.spinAt !== undefined && !spun && airSteps === options.spinAt),
        crouch: options.charge !== undefined && options.charge > 0 && i < 2,
        throttle: options.throttle,
      };
      if (input.hop && pressed) spun = true;
      pressed = true;
      const sample = this.step(input, held(airSteps, rising, grounded));
      if (sample.tookOff) { takeoff = this.trace.length - 1; airSteps = 0; }
      else if (airSteps >= 0) airSteps += 1;
      if (sample.touchedDown && takeoff !== -1 && touchdown === -1) touchdown = this.trace.length - 1;
      if (touchdown !== -1 && this.trace.length - 1 - touchdown >= (options.after ?? 60)) break;
    }
    assert.ok(takeoff !== -1, 'the hop never left the ground');
    assert.ok(touchdown !== -1, 'the hop never landed');
    return { takeoff, touchdown, flight: this.trace.slice(start) };
  }
}

function peak(samples: readonly Sample[]): number {
  return samples.reduce((worst, sample) => Math.max(worst, sample.oneFoot), 0);
}

/** The pedal target the ridingRig tests use, in the rig's lean-pivot frame. */
function pedalTarget(side: number): THREE.Vector3 {
  return new THREE.Vector3(
    side * RIDER_BLOCKOUT.stanceHalfWidth,
    WHEEL.pedalHeight + RIDER_BLOCKOUT.ankleAbovePedal,
    0,
  );
}

// -- The shipped hop, ridden ------------------------------------------------

test('held from the press, the plainest hop carries a full pose that is back before touchdown', () => {
  const rider = new Rider();
  rider.run(240);
  const { takeoff, touchdown } = rider.hop(() => true, { after: 120 });
  const flight = rider.trace.slice(takeoff, touchdown + 1);

  // The pose happened, in full.
  assert.ok(peak(flight) >= 0.999, `the pose peaked at ${peak(flight).toFixed(3)}`);
  // Not before the dwell: the first visible step is the one on which the held
  // level has been eligible for the whole qualification — the takeoff step is
  // the first such step, so `first + 1` steps of hold have been counted. This
  // is what keeps a 180 tap from flashing.
  const first = flight.findIndex((sample) => sample.oneFoot > 0);
  assert.ok(
    (first + 1) * STEP >= ONE_FOOT.holdQualifySeconds - 1e-9,
    `the foot left ${(first * STEP).toFixed(3)} s after takeoff, inside the ${ONE_FOOT.holdQualifySeconds} s dwell`,
  );
  assert.equal(
    first + 1,
    Math.round(ONE_FOOT.holdQualifySeconds / STEP),
    `the dwell qualified on held step ${first + 1} rather than ${Math.round(ONE_FOOT.holdQualifySeconds / STEP)}`,
  );
  // And back on the pedal before the wheel meets the ground, by the margin.
  let last = -1;
  for (let i = 0; i < flight.length; i += 1) if (flight[i]!.oneFoot > 0) last = i;
  const spare = (flight.length - 1 - last) * STEP;
  assert.ok(
    spare >= ONE_FOOT.touchdownMarginSeconds - 2 * STEP,
    `the foot was still out ${spare.toFixed(3)} s before touchdown (margin ${ONE_FOOT.touchdownMarginSeconds} s)`,
  );
  assert.equal(flight[flight.length - 1]!.oneFoot, 0, 'the touchdown step drew a foot in the air');
  // The blend is a single hill: up, held, down — never a bob.
  let phase: 'up' | 'down' = 'up';
  for (let i = 1; i < flight.length; i += 1) {
    const delta = flight[i]!.oneFoot - flight[i - 1]!.oneFoot;
    if (phase === 'up' && delta < -1e-12) phase = 'down';
    else if (phase === 'down') assert.ok(delta <= 1e-12, `the foot went back out at air step ${i}`);
  }
  // The flight is this one's, and it stays readable on the ground afterwards
  // until the next takeoff — the same window the controller's spin latch keeps.
  assert.ok(oneFootQualifiedThisFlight(rider.state, rider.euc.flightIndex), 'the flight was not latched');
  // On the ground with the key still held: nothing, and nothing hopped again.
  const grounded = rider.trace.slice(touchdown + 1);
  assert.ok(grounded.length >= 100, 'the ride ended too soon after landing');
  assert.ok(grounded.every((sample) => sample.oneFoot === 0), 'a foot left the pedal on the ground');
  assert.ok(grounded.every((sample) => sample.held), 'the ride let go of the key');
  assert.equal(rider.euc.snapshot().hops, 1, 'holding Hop through touchdown minted a second hop');
  assert.equal(rider.state.state, 'idle', `the grounded hold reads ${rider.state.state}`);
});

test('a tap, and a hold shorter than the dwell, never show a foot; a hold past it does', () => {
  // The tap: the press step only. The controller sees a level of one step,
  // exactly what a keyboard delivers for a keydown/keyup inside one frame.
  const tap = new Rider();
  tap.run(240);
  const tapped = tap.hop((airSteps) => airSteps === -1);
  assert.equal(peak(tapped.flight), 0, 'a ground tap drew a foot');

  // A hold released one step short of the dwell — the boundary the tuning
  // names. The harness asks `held` before the step and learns of the takeoff
  // after it, so the takeoff step is held at `airSteps === -1` and counts as
  // the first eligible step: `airSteps < n` is `n + 1` held steps in the air.
  const dwell = Math.round(ONE_FOOT.holdQualifySeconds / STEP);
  const short = dwell - 2;
  const brief = new Rider();
  brief.run(240);
  const held = brief.hop((airSteps) => airSteps < short);
  assert.equal(peak(held.flight), 0, `a ${short + 1}-step hold in the air drew a foot`);
  assert.ok(
    held.flight.some((sample) => sample.state === 'qualifying'),
    'the hold was never even counted',
  );

  // The dwell exactly, and the pose shows. The window is the same flight's.
  const long = dwell - 1;
  const enough = new Rider();
  enough.run(240);
  const shown = enough.hop((airSteps) => airSteps < long);
  assert.ok(peak(shown.flight) > 0, `a ${long + 1}-step hold showed nothing`);
  // …and, released the step after qualifying, it returns at once: the peak is
  // a fraction, not the full gesture, and never a flash — it still eases out.
  assert.ok(peak(shown.flight) < 0.5, `a hold released as it qualified reached ${peak(shown.flight).toFixed(3)}`);
});

test('the 180 press is a tap that spins and shows nothing; a sustained re-hold adds the pose', () => {
  // The press on the ground, released at once; the second press while rising
  // with the stick held — the M24 spin — held for one step.
  const spin = new Rider();
  spin.run(240);
  const spun = spin.hop((airSteps) => airSteps === 4, { spinAt: 4, steer: 1 });
  assert.equal(spin.euc.snapshot().spins, 1, 'the second press did not arm the spin');
  assert.equal(peak(spun.flight), 0, 'the spin tap flashed a foot');

  // The same second press, held from there: the spin still fires and the pose
  // rides the sweep. On the uncharged flight the window is open by 0.09 s.
  const both = new Rider();
  both.run(240);
  const flown = both.hop((airSteps) => airSteps >= 4, { spinAt: 4, steer: -1 });
  assert.equal(both.euc.snapshot().spins, 1, 'the held second press did not arm the spin');
  assert.ok(both.euc.spinCompleted, 'the sweep did not complete');
  assert.ok(peak(flown.flight) >= 0.999, `the re-hold while rising reached only ${peak(flown.flight).toFixed(3)}`);
  const flight = both.trace.slice(flown.takeoff, flown.touchdown + 1);
  assert.equal(flight[flight.length - 1]!.oneFoot, 0, 'the foot was out at touchdown');
});

test('a re-hold on the way down is refused when the flight cannot carry it, and taken when it can', () => {
  // The shipped hop: from the apex there is ~0.30 s of air, the dwell spends
  // 0.15 of it, and the readable window wants 0.33 — refused, visibly nothing.
  const shipped = new Rider();
  shipped.run(240);
  const refused = shipped.hop((airSteps, rising) => airSteps >= 0 && !rising);
  assert.equal(peak(refused.flight), 0, 'a descending re-hold on the shipped hop showed a foot');
  assert.ok(refused.flight.some((sample) => sample.state === 'refused'), 'the refusal was not named');
  assert.ok(!oneFootQualifiedThisFlight(shipped.state, shipped.euc.flightIndex), 'a refused pose was latched');

  // The F4 slider's ceiling (`EUC.hopLaunchSpeed` max 6 m/s, ~1.22 s of air):
  // the same rule finds 0.61 − 0.15 = 0.46 s after the dwell and starts.
  const big = new Rider({ hopLaunchSpeed: 6 });
  big.run(240);
  const taken = big.hop((airSteps, rising) => airSteps >= 0 && !rising);
  assert.ok(peak(taken.flight) >= 0.999, `the descending re-hold on big air reached ${peak(taken.flight).toFixed(3)}`);
  const flight = big.trace.slice(taken.takeoff, taken.touchdown + 1);
  let last = -1;
  for (let i = 0; i < flight.length; i += 1) if (flight[i]!.oneFoot > 0) last = i;
  const spare = (flight.length - 1 - last) * STEP;
  assert.ok(spare >= ONE_FOOT.touchdownMarginSeconds - 2 * STEP, `back only ${spare.toFixed(3)} s before touchdown`);
});

test('a release begins recovery, a re-hold in the same flight is spent, and the next flight qualifies again', () => {
  const rider = new Rider({ hopLaunchSpeed: 6 });
  rider.run(240);
  // Held from the press; released 30 steps after takeoff (the pose is fully
  // out by then); re-held 8 steps later and kept through the landing.
  const { takeoff, touchdown } = rider.hop((airSteps) => airSteps < 30 || airSteps >= 38);
  const flight = rider.trace.slice(takeoff, touchdown + 1);
  assert.ok(flight[29]!.oneFoot >= 0.999, `the pose was ${flight[29]!.oneFoot.toFixed(3)} at the release`);
  // From the release the blend only falls.
  for (let i = 31; i < flight.length; i += 1) {
    assert.ok(
      flight[i]!.oneFoot <= flight[i - 1]!.oneFoot + 1e-12,
      `the foot went back out at air step ${i} (${flight[i]!.state})`,
    );
  }
  assert.ok(flight.slice(31).some((sample) => sample.state === 'returning'), 'the release did not begin recovery');
  // The re-hold reads `spent` once the foot is down, and shows nothing.
  const down = flight.findIndex((sample, i) => i > 31 && sample.oneFoot === 0);
  assert.ok(down > 31, 'the foot never came back');
  assert.ok(flight.slice(down).every((sample) => sample.oneFoot === 0), 'the re-hold showed a foot');
  assert.ok(flight.slice(down + 1, -1).every((sample) => sample.state === 'spent'), 'the re-hold was not spent');

  // The next flight is a new identity: the same hold qualifies again.
  rider.run(120);
  const again = rider.hop(() => true);
  assert.ok(peak(again.flight) >= 0.999, 'the next flight did not get its pose');
});

// -- The suppressions, stated ----------------------------------------------

/** Facts for a synthetic flight at `t` seconds after leaving the ground at `v0`. */
function inFlight(t: number, v0: number, over: Partial<OneFootFacts> = {}): OneFootFacts {
  const g = PHYSICS.gravity;
  const h = Math.max(0, v0 * t - (g * t * t) / 2);
  const rate = v0 - g * t;
  return {
    dt: STEP,
    held: true,
    airborne: h > 0,
    compressing: false,
    crashing: false,
    recovering: false,
    countdownFrozen: false,
    groundClearance: h,
    verticalRate: rate,
    secondsToTouchdown: h > 0 ? (rate + Math.sqrt(rate * rate + 2 * g * h)) / g : 0,
    flightIndex: 1,
    ...over,
  };
}

/** Drive a fresh state to the full gesture on a long synthetic flight. */
function posed(): OneFootPoseState {
  const state = createOneFootPose();
  for (let k = 1; k < 80; k += 1) stepOneFoot(state, inFlight(k * STEP, 6));
  assert.equal(state.state, 'posing');
  assert.ok(state.oneFoot >= 0.999, 'the fixture never reached the full gesture');
  return state;
}

test('compression, the ground, a crash, the recovery and the countdown each suppress the pose', () => {
  // Each one, on a rider holding the key in the middle of a flight that would
  // otherwise carry the pose — and each one is a gate of its own, because the
  // controller's `airborne` stays true through a mid-air crash.
  const gates: ReadonlyArray<[string, Partial<OneFootFacts>]> = [
    ['compressing', { compressing: true }],
    ['the ground', { airborne: false, groundClearance: 0, secondsToTouchdown: 0 }],
    ['a crash', { crashing: true }],
    ['the recovery', { recovering: true }],
    ['the countdown', { countdownFrozen: true }],
  ];
  for (const [name, over] of gates) {
    // Never starts under it.
    const fresh = createOneFootPose();
    for (let k = 1; k < 80; k += 1) stepOneFoot(fresh, inFlight(k * STEP, 6, over));
    assert.equal(fresh.oneFoot, 0, `${name}: a pose started`);
    assert.equal(fresh.state, 'idle', `${name}: reads ${fresh.state}`);
    assert.equal(fresh.holdSeconds, 0, `${name}: the dwell counted`);

    // And ends a pose already out, at the abort rate — the return the plan
    // asks for on a touchdown the projection got wrong, faster than a release.
    const out = posed();
    const abortSteps = Math.ceil(ONE_FOOT.abortSeconds / STEP);
    let taken = 0;
    while (out.oneFoot > 0 && taken < 100) {
      stepOneFoot(out, inFlight(0.5, 6, over));
      taken += 1;
      if (out.oneFoot > 0) assert.equal(out.state, 'returning', `${name}: reads ${out.state} mid-return`);
    }
    assert.ok(taken <= abortSteps + 1, `${name}: the abort took ${taken} steps (${abortSteps} allowed)`);
    assert.equal(out.state, 'idle', `${name}: ends as ${out.state}`);
  }
});

test('reset zeroes everything; cancel drops the dwell and begins the return, keeping the flight latch', () => {
  const state = posed();
  const flight = state.qualifiedFlight;
  cancelOneFoot(state);
  assert.equal(state.state, 'returning');
  assert.equal(state.holdSeconds, 0);
  assert.equal(state.qualifiedFlight, flight, 'a cancel forgot the flight');
  assert.ok(state.oneFoot >= 0.999, 'a cancel snapped the foot');
  // Still held, still airborne: the return is final, the flight is spent.
  for (let k = 0; k < 40; k += 1) stepOneFoot(state, inFlight(0.5, 6));
  assert.equal(state.oneFoot, 0);
  assert.equal(state.state, 'spent');

  // A cancel while qualifying drops the count.
  const counting = createOneFootPose();
  for (let k = 1; k < 10; k += 1) stepOneFoot(counting, inFlight(k * STEP, 6));
  assert.equal(counting.state, 'qualifying');
  assert.ok(counting.holdSeconds > 0);
  cancelOneFoot(counting);
  assert.equal(counting.holdSeconds, 0);
  assert.equal(counting.state, 'idle');

  const full = posed();
  resetOneFoot(full);
  assert.deepEqual(
    { ...full },
    { ...createOneFootPose(full.side) },
    'a reset left something behind',
  );
});

test('the readable window is the sum the tuning names, and a synthetic flight keeps the margin', () => {
  assert.equal(
    readableWindowSeconds(),
    ONE_FOOT.enterSeconds + ONE_FOOT.readableSeconds + ONE_FOOT.returnSeconds + ONE_FOOT.touchdownMarginSeconds,
  );
  // The refusal is exactly the window: one step of air either side of it.
  const short = createOneFootPose();
  const window = readableWindowSeconds();
  for (let k = 1; k < 40; k += 1) {
    stepOneFoot(short, inFlight(0.2, 6, { secondsToTouchdown: window - 1e-3 }));
  }
  assert.equal(short.state, 'refused');
  assert.equal(short.oneFoot, 0);
  const enough = createOneFootPose();
  for (let k = 1; k < 40; k += 1) {
    stepOneFoot(enough, inFlight(0.2, 6, { secondsToTouchdown: window + 1e-3 }));
  }
  assert.equal(enough.state, 'posing');
  assert.ok(enough.oneFoot > 0);

  // The plainest flight, synthetic, so the arithmetic in `ONE_FOOT`'s own
  // comment is checked against the constants rather than believed.
  const v0 = EUC.hopLaunchSpeed;
  const state = createOneFootPose();
  const blends: number[] = [];
  for (let k = 1; ; k += 1) {
    const facts = inFlight(k * STEP, v0);
    if (!facts.airborne) break;
    stepOneFoot(state, facts);
    blends.push(state.oneFoot);
  }
  assert.ok(Math.max(...blends) >= 0.999, 'the shipped flight does not carry a full pose');
  let last = -1;
  for (let i = 0; i < blends.length; i += 1) if (blends[i]! > 0) last = i;
  const spare = (blends.length - last) * STEP;
  assert.ok(
    spare >= ONE_FOOT.touchdownMarginSeconds - STEP,
    `the synthetic flight had the foot out until ${spare.toFixed(3)} s before touchdown`,
  );
});

// -- Physical equality --------------------------------------------------------

/** FNV-1a over the float64 bytes of every number handed in, two lanes. */
class Digest {
  private a = 0x811c9dc5;
  private b = 0x050c5d1f;
  private readonly bytes = new DataView(new ArrayBuffer(8));

  number(value: number): void {
    this.bytes.setFloat64(0, value);
    this.word(this.bytes.getUint32(0));
    this.word(this.bytes.getUint32(4));
  }

  text(value: string): void {
    for (let i = 0; i < value.length; i += 1) this.word(value.charCodeAt(i));
  }

  private word(value: number): void {
    this.a = Math.imul(this.a ^ value, 0x01000193) >>> 0;
    this.b = Math.imul(this.b ^ value, 0x01000193) >>> 0;
  }

  hex(): string {
    return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0');
  }
}

/** Every number the controller produces that the plan names, hashed each step. */
function digestStep(euc: EucController, pose: EucPose, digest: Digest): void {
  euc.writePose(pose);
  for (const [key, value] of Object.entries(pose)) {
    if (typeof value === 'number') digest.number(value);
    else if (value instanceof Float32Array) for (let i = 0; i < value.length; i += 1) digest.number(value[i]!);
    else assert.fail(`the pose grew a field this digest does not hash: ${key}`);
  }
  const snapshot = euc.snapshot();
  digest.text(snapshot.state);
  digest.number(snapshot.hops);
  digest.number(snapshot.landings);
  digest.number(snapshot.spins);
  digest.number(snapshot.crashes);
  digest.number(snapshot.wobbleEnergy);
  digest.number(snapshot.verticalVelocity);
  digest.number(euc.lastLandingImpact);
  digest.text(euc.lastLandingQuality);
  digest.number(euc.lastHopCharge);
  digest.number(euc.hopped ? 1 : 0);
  digest.number(euc.spinCompleted ? 1 : 0);
  digest.number(euc.flightIndex);
  digest.number(euc.groundClearance);
  digest.number(euc.verticalRate);
  digest.number(euc.secondsToTouchdown);
  digest.number(euc.pedalStrikeDepth);
  digest.number(euc.obstacleImpact);
  digest.number(euc.crashed ? 1 : 0);
}

/**
 * The script: hops charged and not, a 180 both ways, a corner, a fakie hop
 * after the reverse engages, and a deep pothole that puts the rider down and
 * lets the automatic recovery bring them back. `hopHeld` is the one field the
 * script does not set; the caller does, every step.
 */
type Script = readonly (readonly [Partial<ActionSnapshot>, number])[];
const SCRIPT: Script = [
  // Straight into the hole at 40 m, down, and the automatic recovery
  // (`EUC.crashRecoverAutoSeconds` 3.6 s) with the throttle off; then a
  // full-lock turn off the line so the respawn does not ride into it again.
  [{ throttle: 1 }, 600],
  [{}, 600],
  [{ throttle: 1, steer: 1 }, 180],
  [{ throttle: 1 }, 240],
  [{ throttle: 1, hop: true }, 1],
  [{ throttle: 1 }, 120],
  [{ throttle: 1, crouch: true }, 60],
  [{ throttle: 1, crouch: true, hop: true }, 1],
  [{ throttle: 1 }, 20],
  [{ throttle: 1, hop: true, steer: 1 }, 1],
  [{ throttle: 1, steer: 1 }, 120],
  [{ throttle: 1, hop: true }, 1],
  [{ throttle: 1 }, 18],
  [{ throttle: 1, hop: true, steer: -1 }, 1],
  [{ throttle: 1, steer: -1 }, 120],
  [{ throttle: 1, steer: 0.6 }, 240],
  [{ throttle: 1 }, 480],
  [{ throttle: -1 }, 960],
  [{ throttle: -1, hop: true }, 1],
  [{ throttle: -1 }, 120],
  [{ throttle: 1 }, 600],
];
const HOLE: Hazard = { id: 'hole', kind: 'potholeDeep', centre: { x: 0, y: 0, z: 40 }, radius: 1.2 };

function rideScript(
  held: (step: number) => boolean,
  watch?: (euc: EucController, step: number) => void,
  vary?: (input: ActionSnapshot, step: number) => ActionSnapshot,
): { digest: string; crashes: number; hops: number; spins: number } {
  const euc = controller({ cutoutEnabled: 0 }, [HOLE]);
  const pose = createPose();
  const digest = new Digest();
  let step = 0;
  for (const [partial, count] of SCRIPT) {
    for (let i = 0; i < count; i += 1) {
      let input: ActionSnapshot = { ...NEUTRAL_ACTIONS, ...partial, hopHeld: held(step) };
      if (vary) input = vary(input, step);
      euc.step(STEP, input);
      digestStep(euc, pose, digest);
      watch?.(euc, step);
      step += 1;
    }
  }
  const final = euc.snapshot();
  return { digest: digest.hex(), crashes: final.crashes, hops: final.hops, spins: final.spins };
}

test('rides that differ only in the held level are bit-identical, and the pose was out while they were', () => {
  const never = rideScript(() => false);
  // The ride is the one the plan enumerates: hops, a spin, a crash, a fakie.
  assert.ok(never.hops >= 3, `only ${never.hops} hops were ridden`);
  assert.ok(never.spins >= 1, 'no spin was ridden');
  assert.ok(never.crashes >= 1, 'no crash was ridden');

  // Held on every step of the ride, with the pose stepped beside the
  // controller exactly as `Game.stepSeat` steps it, so this run is a run in
  // which the foot actually left the pedal.
  const state = createOneFootPose();
  const pose = createPose();
  let peakBlend = 0;
  const always = rideScript(() => true, (euc) => {
    euc.writePose(pose);
    stepOneFootFromController(state, euc, pose.recoverBlend, STEP, true, false);
    peakBlend = Math.max(peakBlend, state.oneFoot);
  });
  assert.ok(peakBlend >= 0.999, `the held ride never posed the foot (peak ${peakBlend.toFixed(3)})`);
  // And a flicked level, which is what a player's hand actually delivers.
  const flicked = rideScript((step) => Math.floor(step / 7) % 2 === 0);

  assert.equal(always.digest, never.digest, 'holding Hop changed the ride');
  assert.equal(flicked.digest, never.digest, 'flicking Hop changed the ride');
  assert.deepEqual(
    [always.crashes, always.hops, always.spins],
    [never.crashes, never.hops, never.spins],
  );

  // The digest is not blind: the same ride with one other bit changed on one
  // step reads differently, so the equality above is a measurement.
  const nudged = rideScript(() => false, undefined, (input, step) => (
    step === 300 ? { ...input, crouch: !input.crouch } : input
  ));
  assert.notEqual(nudged.digest, never.digest, 'the digest cannot see a changed input');
});

test("the controller's source never reads the held level, and nothing under simulation/ does but the cop's literal", () => {
  const root = new URL('../simulation/', import.meta.url);
  const files = readdirSync(root).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
  assert.ok(files.includes('EucController.ts'), 'the controller was not scanned');
  const offenders: string[] = [];
  let literals = 0;
  for (const name of files) {
    const source = readFileSync(new URL(name, root), 'utf8');
    const lines = source.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!;
      if (!line.includes('hopHeld')) continue;
      // Prose may name the field; code may not read it.
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // The one permitted form: the cop's hand-written neutral snapshot,
      // which sets the field and reads nothing.
      if (name === 'cpuRider.ts' && /hopHeld:\s*false/.test(line)) { literals += 1; continue; }
      offenders.push(`${name}:${i + 1}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], 'simulation/ reads the held level');
  assert.ok(literals >= 1, "the cop's neutral literal was not found — the scan is not seeing the token");
  // The scanner sees the token where it is meant to be.
  const actions = readFileSync(new URL('../input/actions.ts', import.meta.url), 'utf8');
  assert.ok(actions.includes('hopHeld'), 'the scan cannot see the field at its definition');
});

// -- The ghost ----------------------------------------------------------------

test('a recorded ghost never receives the channel: both boots stay on their pedals in replay', () => {
  // Record a ride whose player had the foot out — the pose is stepped beside
  // the controller and reaches the full gesture — and replay it through the
  // ghost rig. `GhostSample` carries no channel and the ghost rig exposes
  // none, so the feet are neutral by construction, and this is the reading.
  const rider = new Rider();
  const recorder = new GhostRecorder({ sampleHz: 60 });
  let seconds = 0;
  let peakBlend = 0;
  const record = (): void => {
    recorder.record(seconds, {
      x: rider.pose.x,
      y: rider.pose.y,
      z: rider.pose.z,
      groundY: rider.pose.groundY,
      headingY: rider.pose.headingY,
      rollAngle: rider.pose.rollAngle,
      speed: rider.pose.speed,
      crouch: rider.pose.crouch,
    });
    seconds += STEP;
    peakBlend = Math.max(peakBlend, rider.state.oneFoot);
  };
  rider.onStep = record;
  rider.run(240);
  rider.hop(() => true, { after: 120 });
  assert.ok(peakBlend >= 0.999, 'the recorded ride never posed the foot');
  const track = recorder.finish(PLAN.id, seconds);
  assert.ok(track, 'no track was recorded');

  const ghost = createGhostRider();
  const player = new GhostPlayer(track);
  const sample = createGhostSample();
  try {
    assert.ok(!('setTrickPose' in ghost), 'the ghost rig exposes a trick channel');
    const pivot = ghost.group.getObjectByName('ghost-riding-lean-pivot');
    const left = ghost.group.getObjectByName('ghost-rider-ankle-left');
    const right = ghost.group.getObjectByName('ghost-rider-ankle-right');
    assert.ok(pivot && left && right, 'the ghost rig is missing its pivot or an ankle');
    const world = new THREE.Vector3();
    let replayed = 0;
    let airborne = 0;
    for (let t = 0; t <= seconds; t += 1 / 60) {
      if (!player.sample(t, sample)) continue;
      ghost.apply(sample);
      ghost.group.updateMatrixWorld(true);
      replayed += 1;
      if (sample.y - sample.groundY > 0.01) airborne += 1;
      for (const [joint, side] of [[left, 1], [right, -1]] as const) {
        joint.getWorldPosition(world);
        pivot.worldToLocal(world);
        const off = world.distanceTo(pedalTarget(side));
        assert.ok(
          off < 1e-6,
          `at ${t.toFixed(3)} s the ghost's ${side > 0 ? 'left' : 'right'} boot is ${off.toFixed(6)} m off its pedal`,
        );
      }
    }
    assert.ok(replayed > 200, `only ${replayed} samples replayed`);
    assert.ok(airborne > 20, `only ${airborne} replayed samples were in the air — the hop was not recorded`);
  } finally {
    ghost.dispose();
  }
});

// -- The review's attacks (M36 Phase 6, p3-review 2026-09-11) -----------------

/**
 * `Game.stepSeat`'s facts assembly, in shape, so the observer here is fed
 * exactly what the game feeds it — and the two latches that matter to §36.6
 * (`oneFootQualified` from the pose, `crashed` from the wheel) arrive in the
 * same step they are true in the game.
 */
function feedObserver(observer: TrickObserver, euc: EucController, state: OneFootPoseState): readonly { kind: string }[] {
  const facts = createTrickFacts();
  facts.flightIndex = euc.flightIndex;
  facts.tookOff = euc.tookOff;
  facts.hopped = euc.hopped;
  facts.hopCharge = euc.hopped ? euc.lastHopCharge : 0;
  facts.spinCompleted = euc.spinCompleted;
  facts.oneFootQualified = oneFootQualifiedThisFlight(state, euc.flightIndex);
  facts.touchedDown = euc.touchedDown;
  facts.landingQuality = euc.lastLandingQuality;
  facts.crashed = euc.crashed;
  return observer.step(STEP, facts);
}

test('a crash taken in mid-air on the real wheel aborts the pose and earns the flight nothing', () => {
  // The controller's own `airborne` flag stays true through a mid-air crash
  // (wave 1's recorded quirk), and there is one reachable step on which the
  // pose reads `crashed` with the wheel still off the ground: the obstacle
  // funnel fires at the *end* of the step that flew the wheel into a wall,
  // and the crash branch that pins the wheel to the ground runs on the next.
  // (A paddle knock lands between steps and is pinned before the pose can
  // read it, so it cannot reach this case.) This rides that step: a wall
  // across the road, a held hop taken fourteen metres short of it at speed, the
  // foot fully out when the wheel meets the face.
  const WALL = 300;
  const plan = buildLevelPlan(
    [{
      id: 'road',
      length: 1200,
      halfWidth: 12,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{ s: WALL, t: 0, halfAlong: 0.5, halfLateral: 300, height: 1.4, surface: 'pavement' }],
    }],
    { id: 'one-foot-wall', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'pavement' }, spacing: 4 },
  );
  const euc = new EucController(new PlanTerrainSampler(plan), { spawn: plan.spawn, hazards: new HazardField([]) });
  const pose = createPose();
  const state = createOneFootPose();
  const observer = new TrickObserver();
  const step = (input: Partial<ActionSnapshot>, held: boolean): void => {
    euc.step(STEP, {
      ...NEUTRAL_ACTIONS,
      ...input,
      throttle: input.throttle ?? (euc.overspeed > 0.8 ? 0 : 1),
      hopHeld: held,
    });
    euc.writePose(pose);
    stepOneFootFromController(state, euc, pose.recoverBlend, STEP, held, false);
    feedObserver(observer, euc, state);
  };
  let guard = 0;
  while (pose.z < WALL - 14 && guard < 6000) { step({}, false); guard += 1; }
  assert.ok(pose.speed > 15, `only ${pose.speed.toFixed(1)} m/s at the wall`);
  const flight = euc.flightIndex + 1;
  let pressed = false;
  let peakBlend = 0;
  let crashAir = -1;
  let air = -1;
  for (let i = 0; i < 200 && crashAir < 0; i += 1) {
    step({ hop: !pressed }, true);
    pressed = true;
    if (euc.tookOff) air = 0;
    else if (air >= 0) air += 1;
    if (euc.crashed) crashAir = air;
    else peakBlend = Math.max(peakBlend, state.oneFoot);
  }
  assert.ok(crashAir > 0, 'the wall never crashed the rider in the air');
  assert.ok(peakBlend >= 0.999, `the foot was only ${peakBlend.toFixed(3)} out when the wall arrived (air step ${crashAir})`);
  assert.equal(euc.flightIndex, flight);

  // **The step of the crash.** The wheel is still in the air — the quirk's
  // one reachable frame — and the pose is already suppressed *at the abort
  // rate*, which is the explicit crash gate at work and not the ground's:
  // without it the pose would read the projection's zero as a release and
  // start home at the slower `returnSeconds`, which the phase left catches.
  assert.ok(euc.groundClearance > 0, `the crash step already pinned the wheel (clearance ${euc.groundClearance.toFixed(3)})`);
  assert.equal(euc.secondsToTouchdown, 0);
  assert.equal(state.state, 'returning', `the crash left the pose ${state.state}`);
  assert.equal(state.holdSeconds, 0);
  assert.ok(
    state.phase <= 1 - STEP / ONE_FOOT.abortSeconds + 1e-9,
    `on the crash step the phase is ${state.phase.toFixed(3)} — the crash did not abort`,
  );
  // The observer closed the flight where it was, credited nothing, and kept
  // the qualification as a diagnostic.
  assert.equal(observer.flightOpen, false);
  assert.equal(observer.lastFlight?.ended, 'crashed');
  assert.equal(observer.lastFlight?.oneFoot, true, 'the diagnostic forgot the qualification');
  assert.equal(observer.tally.oneFootAirs, 0, 'a crash flight was credited');

  // The foot comes home within the abort, and is not re-qualified by the
  // hold through the crash or the automatic recovery.
  let taken = 1;
  while (state.oneFoot > 0 && taken < 30) { step({}, true); taken += 1; }
  assert.ok(taken <= Math.ceil(ONE_FOOT.abortSeconds / STEP) + 1, `the abort took ${taken} steps`);
  assert.equal(state.state, 'idle');
  assert.equal(euc.groundClearance, 0, 'the crash branch did not pin the wheel');
  let drawn = 0;
  let steps = 0;
  while ((euc.crashed || pose.recoverBlend < 1) && steps < 2000) {
    step({}, true);
    drawn = Math.max(drawn, state.oneFoot);
    steps += 1;
  }
  assert.ok(steps > 100 && steps < 2000, `the crash and recovery took ${steps} steps`);
  assert.equal(drawn, 0, 'a foot was drawn during the crash or the recovery');
  assert.ok(oneFootQualifiedThisFlight(state, flight), 'the latch was lost');
  assert.equal(euc.flightIndex, flight, 'the respawn changed the flight identity');
  assert.equal(observer.tally.oneFootAirs, 0);

  // And the next flight is a new one: turned away from the wall, it poses and
  // is credited exactly once.
  for (let i = 0; i < 300; i += 1) step({ steer: 1, throttle: 0.6 }, false);
  for (let i = 0; i < 240; i += 1) step({}, false);
  pressed = false;
  let nextPeak = 0;
  let landed = false;
  for (let i = 0; i < 400 && !landed; i += 1) {
    step({ hop: !pressed }, true);
    pressed = true;
    nextPeak = Math.max(nextPeak, state.oneFoot);
    if (euc.touchedDown) landed = true;
  }
  assert.ok(landed && !euc.crashed, 'the flight after the recovery did not land');
  assert.ok(nextPeak >= 0.999, `the flight after the recovery posed only ${nextPeak.toFixed(3)}`);
  assert.equal(observer.tally.oneFootAirs, 1);
});

test('under a random hand, every flight poses at most once and is credited exactly when it posed and landed', () => {
  // A seeded hand flicks the level at random through a hundred flights on the
  // hop slider's ceiling, with random steer and a 180 on a third of them. The
  // pose may enter `posing` at most once per flight; on the flat the foot is
  // always home by the touchdown step; and the observer's count equals the
  // number of flights that posed and landed without a crash — no more, no less.
  let seed = 0x2f6e2b1;
  const random = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const rider = new Rider({ hopLaunchSpeed: 6 });
  const observer = new TrickObserver();
  let lastState: OneFootPoseState['state'] = 'idle';
  const entries = new Map<number, number>();
  rider.onStep = () => {
    feedObserver(observer, rider.euc, rider.state);
    if (lastState !== 'posing' && rider.state.state === 'posing') {
      entries.set(rider.euc.flightIndex, (entries.get(rider.euc.flightIndex) ?? 0) + 1);
    }
    lastState = rider.state.state;
  };
  rider.run(240);
  let posedAndLanded = 0;
  let posed = 0;
  for (let flight = 0; flight < 100; flight += 1) {
    let held = random() < 0.5;
    const flick = 0.05 + random() * 0.3;
    const spin = random() < 0.3;
    const { touchdown } = rider.hop(
      () => { if (random() < flick) held = !held; return held; },
      { steer: (random() - 0.5) * 2, spinAt: spin ? 3 : undefined, after: 20 },
    );
    assert.equal(rider.trace[touchdown]!.oneFoot, 0, `flight ${flight}: the foot was out on the touchdown step`);
    const count = entries.get(rider.euc.flightIndex) ?? 0;
    assert.ok(count <= 1, `flight ${flight} entered posing ${count} times`);
    if (count === 1) {
      posed += 1;
      if (!rider.euc.crashed && rider.euc.lastLandingQuality !== 'crash') posedAndLanded += 1;
    }
    rider.run(60 + Math.floor(random() * 60));
    while (rider.euc.crashed || rider.pose.recoverBlend < 1) rider.step({}, held);
  }
  assert.ok(posed >= 20, `only ${posed} of 100 random flights posed — the hand is not exercising the pose`);
  assert.equal(observer.tally.oneFootAirs, posedAndLanded);
});

/**
 * **The descent case, and the defect it was written against** — p3-review,
 * 2026-09-11, repaired in Phase 6. The controller's `secondsToTouchdown` used
 * to project onto the ground under the wheel *now*; on a descent that ground
 * keeps falling away beneath the flight, so the projection under-read the air
 * by the ground's own fall rate and the readable window was refused for the
 * whole flight — on a 7 % descent at 15 m/s (5 % at 20, 10 % at 12) a held
 * plain hop that actually carries 0.60 s of air, exactly as on the flat, drew
 * nothing. Switchback Park descends steeper than 3 % for 210 m of its 949 m
 * lap, so that was 22.1 % of the park's own ride. The repair is the
 * controller's — the sampled normal gives the gradient along the frozen air
 * travel and the wheel's horizontal speed turns it into the ground's vertical
 * rate (`EucController.secondsToTouchdown`, and its own two graded tests) —
 * and this is the case it was blocked on, riding the real wheel. The failure
 * message carries the projection, because a regression here will be the
 * projection again.
 */
test('a held plain hop on a 7 % descent at 15 m/s carries the pose, as the same hop on the flat does', () => {
  const grade = -0.07;
  const plan = buildLevelPlan(
    [
      { id: 'lead', length: 40, halfWidth: 12, surface: 'pavement', shoulder: 2 },
      { id: 'descent', length: 600, climb: Math.tan(grade) * 600, linearClimb: true, halfWidth: 12, surface: 'pavement', shoulder: 2 },
      { id: 'out', length: 200, halfWidth: 12, surface: 'pavement', shoulder: 2 },
    ],
    { id: 'one-foot-descent', spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 }, surround: { height: 0, surface: 'pavement' }, spacing: 4 },
  );
  const euc = new EucController(new PlanTerrainSampler(plan), { spawn: plan.spawn, hazards: new HazardField([]) });
  const pose = createPose();
  const state = createOneFootPose();
  const step = (input: Partial<ActionSnapshot>, held: boolean): void => {
    euc.step(STEP, { ...NEUTRAL_ACTIONS, ...input, hopHeld: held });
    euc.writePose(pose);
    stepOneFootFromController(state, euc, pose.recoverBlend, STEP, held, false);
  };
  const target = 15;
  let guard = 0;
  while ((pose.z < 250 || Math.abs(pose.speed - target) > 0.3) && guard < 30000) {
    step({ throttle: pose.speed < target ? 1 : pose.speed > target + 0.3 ? -0.3 : 0 }, false);
    guard += 1;
  }
  let air = -1;
  let pressed = false;
  let peakBlend = 0;
  let maxProjected = 0;
  for (let i = 0; i < 600; i += 1) {
    step({ throttle: pose.speed < target ? 1 : 0, hop: !pressed }, true);
    pressed = true;
    if (euc.tookOff) air = 0;
    else if (air >= 0) air += 1;
    if (air >= 0) {
      peakBlend = Math.max(peakBlend, state.oneFoot);
      maxProjected = Math.max(maxProjected, euc.secondsToTouchdown);
      if (euc.touchedDown) break;
    }
  }
  assert.ok(air * STEP > 0.55, `the descent hop had only ${(air * STEP).toFixed(2)} s of air`);
  assert.ok(
    peakBlend >= 0.999,
    `the pose peaked at ${peakBlend.toFixed(3)} on ${(air * STEP).toFixed(2)} s of real air: `
      + `the projection never read more than ${maxProjected.toFixed(2)} s (window ${readableWindowSeconds().toFixed(2)} s)`,
  );
});
