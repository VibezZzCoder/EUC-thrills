/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EUC, PHYSICS, SIMULATION, TERRAIN, WHEEL } from '../data/tuning.ts';
import { DRUNK_STYLE, SOBER_STYLE, type RideStyle } from '../data/rideStyles.ts';
import { SURFACES } from '../data/surfaces.ts';
import { NEUTRAL_ACTIONS, type ActionSnapshot } from '../input/actions.ts';
import { buildLevelPlan } from '../level/buildPlan.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { TRACK_LAP_SEGMENT_IDS, createTrackLevel } from '../level/trackLevel.ts';
import type { Hazard, HazardKind, LevelPlan } from '../level/plan.ts';
import type { SegmentSpec } from '../level/segments.ts';
import { RIDEABILITY } from '../level/routeValidator.ts';
import { CpuRider, type CpuView } from './cpuRider.ts';
import { HazardField } from './hazards.ts';
import { RouteSpine } from './routeSpine.ts';
import { SoftBodyField } from './softBodies.ts';
import {
  EucController,
  createPose,
  defaultEucTuning,
  ladder,
  type EucPose,
  type EucSnapshot,
  type EucTuning,
} from './EucController.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import type { GroundSample, SurfaceId, TerrainSampler, Vec3 } from './world.ts';

/**
 * The EUC controller, tested headlessly.
 *
 * Every assertion below runs with no browser, no canvas, and no WebGL context,
 * which is the entire payoff of architecture invariant 1 — the controller does
 * not import three.js, so accel curves, top speed, braking distance, the
 * reverse gate, and the lateral-acceleration clamp can all be checked in
 * milliseconds instead of by riding around and forming an impression.
 *
 * These tests do not claim the game is *fun*. Nothing automated can; the M2
 * exit question is answered by a person. What they claim is narrower and still
 * worth having: that the curves are the shape the design says they are, that
 * the limits actually bind, and that no input can put the state machine
 * somewhere it cannot leave.
 */

const STEP = 1 / SIMULATION.hz;

function actions(partial: Partial<ActionSnapshot> = {}): ActionSnapshot {
  return { ...NEUTRAL_ACTIONS, ...partial };
}

/**
 * An endless flat plane of one surface, built through the real plan builder.
 *
 * The M2 fixture was a ten-kilometre slab, sized so a rider at top speed could
 * not reach its edge. It does not need to be: the surround is the *same*
 * surface at the same height, so a rider who leaves the authored segment simply
 * carries on over ground that is identical in every respect. That is the plan's
 * own out-of-bounds answer, exercised rather than special-cased, and it makes
 * the fixture two dozen cells instead of a hundred million.
 */
function flatPlan(surface: SurfaceId = 'pavement', spawnY = 0): LevelPlan {
  return buildLevelPlan(
    [{ id: 'flat', length: 24, halfWidth: 12, surface, shoulder: 1 }],
    {
      id: `flat-${surface}`,
      spawn: { position: { x: 0, y: spawnY, z: 0 }, headingY: 0 },
      surround: { height: spawnY, surface },
      spacing: 4,
    },
  );
}

/** A plane with one authored gradient running along +Z, for the slope term. */
function rampPlan(riseOverRun: number): LevelPlan {
  const length = 400;
  const specs: SegmentSpec[] = [{
    id: 'ramp',
    length,
    climb: riseOverRun * length,
    linearClimb: true,
    halfWidth: 30,
    surface: 'pavement',
    shoulder: 2,
  }];
  return buildLevelPlan(specs, {
    id: 'ramp',
    spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
    surround: { height: 0, surface: 'pavement' },
    spacing: 2,
  });
}

function controller(options: {
  tuning?: Partial<EucTuning>;
  plan?: LevelPlan;
  hazards?: readonly Hazard[];
} = {}): EucController {
  const plan = options.plan ?? flatPlan();
  return new EucController(new PlanTerrainSampler(plan), {
    // The wobble gate is opened here because these tests exercise the full
    // QA-hardened M6 mechanic behind it. The *shipped* default is 0 — wobble
    // is disabled by owner decision (2026-08-02, `data/tuning.ts`) — and the
    // default's own guarantee has its own test below: no energy source can
    // feed the oscillator at all.
    // **The max-speed cutout is off by default here** — M20, and it is the
    // AGENTS.md rule about re-deriving a spec rather than patching it. Every
    // test above this file's M20 section was written against a wheel with no
    // failure at the top of its speed range, and a dozen of them ride flat out
    // for ten seconds or more to measure top speed, drag, coast-down and pose.
    // With the cutout on, those fixtures stop measuring what they claim and
    // start measuring how long it takes to fall off. The cutout's own tests
    // switch it back on explicitly, which also makes every one of them say so.
    tuning: { wobbleMasterGain: 1, cutoutEnabled: 0, ...(options.tuning ?? {}) },
    spawn: plan.spawn,
    // Handed separately from the plan, exactly as `Game.installLevel` does it,
    // so these tests exercise the seam the game uses rather than one built for
    // them. Absent means a world with nothing to hit, which is every test above
    // this line and both hand-authored levels.
    hazards: new HazardField(options.hazards ?? []),
  });
}

/**
 * A pothole `metres` straight ahead of the spawn, on a `hazardPlan` world.
 *
 * The spawn faces +Z with a heading of 0, so "ahead" is +Z and a rider holding
 * throttle drives into this and nothing else.
 */
function potholeAhead(metres: number, kind: HazardKind, radius = 1): Hazard {
  return { id: 'hole', kind, centre: { x: 0, y: 0, z: metres }, radius };
}

/**
 * Two hundred metres of straight pavement, for the hazard tests.
 *
 * **`flatPlan` is 24 m long and that is not long enough to be a hazard test.**
 * Past its end the rider is on the surround, which is the same height and the
 * same material — so a ride still *looks* right — but `offCourse` is true, and
 * `updateSafePosition` refuses to record a safe position off the authored
 * course. A test placing a hole at 40 m on that world and asserting the safe
 * position stopped advancing would pass whether or not the hazard rule it
 * claims to test existed at all. It is written down because it happened here,
 * and because a green test that proves nothing is worse than a missing one.
 */
function hazardPlan(): LevelPlan {
  return buildLevelPlan(
    [{ id: 'run', length: 200, halfWidth: 12, surface: 'pavement', shoulder: 1 }],
    {
      id: 'hazard-run',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
      spacing: 4,
    },
  );
}

/** Run `steps` fixed steps with one held input, and report the end state. */
function ride(euc: EucController, steps: number, held: Partial<ActionSnapshot>): EucSnapshot {
  const input = actions(held);
  for (let i = 0; i < steps; i += 1) euc.step(STEP, input);
  return euc.snapshot();
}

/** Hold full throttle until the wheel reaches a speed, then stop stepping. */
function rideToSpeed(euc: EucController, target: number, limitSteps = 4000): EucSnapshot {
  const input = actions({ throttle: 1 });
  let steps = 0;
  while (euc.snapshot().speed < target) {
    euc.step(STEP, input);
    steps += 1;
    assert.ok(steps < limitSteps, `never reached ${target} m/s`);
  }
  return euc.snapshot();
}

const SECONDS = (seconds: number): number => Math.round(seconds * SIMULATION.hz);

// ---------------------------------------------------------------------------
// Longitudinal
// ---------------------------------------------------------------------------

test('lean is a state variable, so one step of full throttle is not full lean', () => {
  // This is the inversion the whole design rests on. If lean snapped to its
  // target, acceleration would be a step function of the key, and the game
  // would feel like a spreadsheet.
  const euc = controller();
  const first = ride(euc, 1, { throttle: 1 });

  assert.ok(first.leanPitch > 0, 'lean started moving');
  assert.ok(
    first.leanPitch < EUC.maxLeanPitch * 0.2,
    `one step reached ${first.leanPitch} rad of ${EUC.maxLeanPitch}`,
  );

  const settled = ride(euc, SECONDS(2), { throttle: 1 });
  assert.ok(Math.abs(settled.leanPitch - EUC.maxLeanPitch) < 0.005, 'lean settles at the target');
});

test('the lean rate limit shapes the onset of a slammed input', () => {
  const slow = controller({ tuning: { leanRateLimit: 0.5 } });
  const fast = controller({ tuning: { leanRateLimit: 30 } });

  const slowLean = ride(slow, SECONDS(0.2), { throttle: 1 }).leanPitch;
  const fastLean = ride(fast, SECONDS(0.2), { throttle: 1 }).leanPitch;

  assert.ok(slowLean < fastLean, 'a lower rate limit reaches less lean in the same time');
  assert.ok(slowLean <= 0.5 * 0.2 + 1e-9, 'and never exceeds the limit it was given');
});

test('holding throttle accelerates from rest and settles at a top speed', () => {
  const euc = controller();

  const early = ride(euc, SECONDS(1), { throttle: 1 });
  assert.ok(early.speed > 3, `one second of throttle reached ${early.speed} m/s`);
  assert.equal(early.state, 'rolling');

  const cruise = ride(euc, SECONDS(20), { throttle: 1 });
  const later = ride(euc, SECONDS(5), { throttle: 1 });

  assert.ok(
    Math.abs(later.speed - cruise.speed) < 0.01,
    `speed still moving at ${cruise.speed} -> ${later.speed}`,
  );
  // A band rather than a number: the exact value is a tuning decision the
  // owner may move with F4, but a top speed outside this range would mean the
  // model has stopped describing a fast wheel. Moved at M16 from 11–17 m/s,
  // when the owner asked for 50 mph and drag was cut to deliver it.
  assert.ok(later.speed > 19 && later.speed < 25, `top speed ${later.speed} m/s`);
  assert.ok(later.speedKph > 70 && later.speedKph < 90, `top speed ${later.speedKph} km/h`);
});

test('top speed is where drive authority balances drag and rolling resistance', () => {
  // Not a restatement of the code: it is the closed-form solution of the model
  // the code is supposed to be integrating. If they disagree, the integration
  // is wrong somewhere the eye would not catch.
  const analytic = Math.sqrt(
    (EUC.leanToAccel * Math.sin(EUC.maxLeanPitch) - SURFACES.pavement.rollingResistance)
      / EUC.dragCoefficient,
  );

  const euc = controller();
  const measured = ride(euc, SECONDS(40), { throttle: 1 }).speed;

  assert.ok(
    Math.abs(measured - analytic) / analytic < 0.02,
    `measured ${measured} m/s against analytic ${analytic} m/s`,
  );
});

test('the rider pitches farther during acceleration and braking, then settles at cruise', () => {
  const euc = controller();

  const launch = ride(euc, SECONDS(1), { throttle: 1 });
  assert.ok(launch.longitudinalAccel > 4, `launch acceleration ${launch.longitudinalAccel}`);
  assert.ok(launch.riderPitch > 0.66, `launch pitch ${launch.riderPitch}`);

  const cruise = ride(euc, SECONDS(39), { throttle: 1 });
  assert.ok(Math.abs(cruise.longitudinalAccel) < 0.01, `cruise acceleration ${cruise.longitudinalAccel}`);
  assert.ok(cruise.riderPitch > 0.04, 'retains a modest lean against drag');
  assert.ok(
    cruise.riderPitch < launch.riderPitch * 0.25,
    `cruise pitch ${cruise.riderPitch} did not settle from ${launch.riderPitch}`,
  );

  const braking = ride(euc, SECONDS(0.4), { throttle: -1 });
  assert.ok(braking.longitudinalAccel < -8, `brake acceleration ${braking.longitudinalAccel}`);
  assert.ok(braking.riderPitch < -0.66, `brake pitch ${braking.riderPitch}`);
  assert.ok(braking.speed > 1, 'sampled the braking transient, not the stopped pose');
});

test('releasing the brake ends the braking state, not only the braking force', () => {
  // Lean decays exponentially and never exactly reaches zero. An epsilon of
  // leftover opposing lean must not classify a hands-off coast as `braking`
  // forever — the HUD and the M8 regen-audio timbre both read this state.
  const euc = controller();
  ride(euc, SECONDS(30), { throttle: 1 });
  ride(euc, SECONDS(0.5), { throttle: -1 });
  const coasting = ride(euc, SECONDS(5), {});

  assert.ok(coasting.speed > 1, 'still moving, so this is a coast rather than a stop');
  assert.equal(coasting.state, 'coasting');
});

test('drag overrunning a partial forward hold does not read as a braking pose', () => {
  // Cruise flat out, then hold *partial* forward. The wheel decelerates toward
  // the lower equilibrium — but that deceleration is drag's doing, not the
  // rider's, and a rider holding forward must not lean backward for the two
  // seconds the speed takes to settle. The pose answers "how hard is the rider
  // pushing", so only effort in the demanded direction may drive it.
  const euc = controller();
  ride(euc, SECONDS(30), { throttle: 1 });

  let minPitch = Infinity;
  const input = actions({ throttle: 0.35 });
  for (let i = 0; i < SECONDS(3); i += 1) {
    euc.step(STEP, input);
    minPitch = Math.min(minPitch, euc.snapshot().riderPitch);
  }
  const settled = euc.snapshot();

  assert.ok(settled.longitudinalAccel < 0.05, 'the wheel was genuinely decelerating or settled');
  assert.ok(minPitch > -0.01, `pitched backward to ${minPitch} while holding forward`);
});

test('swapping from brake to throttle recovers the pose immediately', () => {
  // While force lean unwinds from full brake, the wheel is still slowing —
  // but the player has already asked forward. The body leads with the new
  // intent rather than deepening the braking pose it was told to leave.
  const euc = controller();
  ride(euc, SECONDS(30), { throttle: 1 });
  while (euc.snapshot().speed > 8) euc.step(STEP, actions({ throttle: -1 }));
  const atSwap = euc.snapshot().riderPitch;

  let minPitch = Infinity;
  let crossedAt = -1;
  const input = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(1); i += 1) {
    euc.step(STEP, input);
    const pitch = euc.snapshot().riderPitch;
    minPitch = Math.min(minPitch, pitch);
    if (crossedAt < 0 && pitch > -0.05) crossedAt = i;
  }

  assert.ok(atSwap < -0.6, `started from a real braking pose, not ${atSwap}`);
  assert.ok(minPitch >= atSwap - 1e-9, `deepened the braking pose to ${minPitch} after W was held`);
  assert.ok(
    crossedAt >= 0 && crossedAt <= SECONDS(0.3),
    `pose took ${crossedAt} steps to leave the braking read`,
  );
});

test('lowering drag raises top speed without changing the launch', () => {
  // **The power ladder is lifted out of the way here on purpose** (M6). Drag
  // and the ladder are two different ceilings on speed, and halving the drag
  // takes the wheel past the second one — so a test of the first that left the
  // second in would be measuring tilt-back and calling it drag. That the ladder
  // caps speed whatever drag says is asserted directly in the M6 block below.
  const uncapped = { powerTiltBackLoad: 99, wobbleComfortSpeed: 99 };
  const stock = controller({ tuning: uncapped });
  const slippery = controller({
    tuning: { ...uncapped, dragCoefficient: EUC.dragCoefficient / 2 },
  });

  const stockLaunch = ride(stock, SECONDS(0.5), { throttle: 1 }).speed;
  const slipperyLaunch = ride(slippery, SECONDS(0.5), { throttle: 1 }).speed;
  assert.ok(Math.abs(stockLaunch - slipperyLaunch) < 0.15, 'the first half second is unchanged');

  const stockTop = ride(stock, SECONDS(40), { throttle: 1 }).speed;
  const slipperyTop = ride(slippery, SECONDS(40), { throttle: 1 }).speed;
  assert.ok(slipperyTop > stockTop * 1.3, `${slipperyTop} against ${stockTop}`);
});

test('releasing the throttle coasts down and stops exactly, with no jitter', () => {
  const euc = controller();
  ride(euc, SECONDS(10), { throttle: 1 });

  const justReleased = ride(euc, SECONDS(0.15), {});
  assert.equal(justReleased.state, 'rolling', 'still under the lean that has not decayed yet');
  assert.equal(ride(euc, SECONDS(1), {}).state, 'coasting', 'and coasting once it has');

  let minimum = Infinity;
  for (let i = 0; i < SECONDS(120); i += 1) {
    euc.step(STEP, NEUTRAL_ACTIONS);
    minimum = Math.min(minimum, euc.snapshot().speed);
  }

  const stopped = euc.snapshot();
  // A resistance term that can push speed through zero produces a wheel that
  // creeps backwards forever at a standstill, at about a millimetre a second.
  // It is almost invisible and it poisons every "am I stopped" test later.
  assert.equal(stopped.speed, 0, 'comes to rest at exactly zero');
  assert.ok(minimum >= 0, `coasting drove the speed to ${minimum}`);
  assert.equal(stopped.state, 'mounted');
});

test('braking authority is larger than drive authority at the same lean', () => {
  const euc = controller();
  ride(euc, SECONDS(10), { throttle: 1 });
  const cruise = euc.snapshot();

  // One step of hard brake from a settled forward lean would be measuring the
  // lean ramp, not the authority, so ride the lean fully over first — but not
  // so far that the wheel has already stopped and there is no brake to measure.
  ride(euc, SECONDS(0.6), { throttle: -1 });
  const before = euc.snapshot();
  ride(euc, 1, { throttle: -1 });
  const after = euc.snapshot();

  const brakeDecel = (before.speed - after.speed) / STEP;
  const driveAccel = EUC.leanToAccel * Math.abs(Math.sin(before.leanPitch));

  assert.ok(before.speed > 1, 'still moving forward, so this is a brake');
  assert.ok(brakeDecel > driveAccel, `brake ${brakeDecel} against drive ${driveAccel}`);
  assert.equal(cruise.state, 'rolling');
  assert.equal(before.state, 'braking');
});

test('braking from top speed stops fast, and in a short distance', () => {
  const euc = controller();
  ride(euc, SECONDS(20), { throttle: 1 });

  const start = euc.snapshot();
  let steps = 0;
  while (euc.snapshot().speed > 0) {
    euc.step(STEP, actions({ throttle: -1 }));
    steps += 1;
    assert.ok(steps < SECONDS(20), 'never stopped');
  }
  const stopped = euc.snapshot();

  const seconds = steps * STEP;
  const distance = stopped.distanceTravelled - start.distanceTravelled;

  // The vision asks for braking that feels powerful and satisfying, and says
  // plainly that the player should not be punished with long stopping
  // distances. Roughly a car's emergency stop from the same speed is the
  // target; about two seconds is what makes it feel like a wheel.
  //
  // The bounds moved at M16 with the top speed and nothing else did: brake
  // authority is untouched, so a stop from 22.3 m/s takes about 1.9 s and 22 m,
  // which is a 1.15 g stop and still shorter than the car it is measured
  // against. Judge a retune by the g rather than by either number alone.
  assert.ok(seconds < 2.3, `stopping took ${seconds.toFixed(2)} s`);
  assert.ok(distance < 26, `stopping took ${distance.toFixed(2)} m`);
  assert.ok(distance > 3, `stopping took only ${distance.toFixed(2)} m, which is a teleport`);
});

// ---------------------------------------------------------------------------
// Reverse
// ---------------------------------------------------------------------------

test('a hard stop does not silently roll backwards', () => {
  const euc = controller();
  ride(euc, SECONDS(10), { throttle: 1 });

  // Brake until the wheel is stopped, then keep the brake held for less than
  // the reverse dwell. The rider asked to stop, once. Written as a loop rather
  // than as a fixed number of steps because the stopping time is a function of
  // the top speed, and M16 moved the top speed.
  const input = actions({ throttle: -1 });
  let steps = 0;
  while (euc.snapshot().speed > 0) {
    euc.step(STEP, input);
    steps += 1;
    assert.ok(steps < SECONDS(20), 'never stopped');
  }
  const stopping = ride(euc, SECONDS(EUC.reverseEngageSeconds * 0.8), { throttle: -1 });
  assert.equal(stopping.speed, 0, 'stopped');
  assert.equal(stopping.reversing, false, 'and stayed stopped');
});

test('reverse engages only after the rider asks a second time, and stays capped', () => {
  const euc = controller();

  const early = ride(euc, SECONDS(EUC.reverseEngageSeconds * 0.5), { throttle: -1 });
  assert.equal(early.speed, 0, 'nothing happens inside the dwell');
  assert.equal(early.reversing, false);
  assert.equal(early.state, 'mounted', 'a stationary confirmation dwell is not rolling');

  const engaged = ride(euc, SECONDS(1), { throttle: -1 });
  assert.equal(engaged.reversing, true);
  assert.ok(engaged.speed < 0, `reversing at ${engaged.speed} m/s`);

  const held = ride(euc, SECONDS(10), { throttle: -1 });
  assert.ok(
    held.speed >= -EUC.maxReverseSpeed - 1e-9,
    `reverse reached ${held.speed}, past the ${-EUC.maxReverseSpeed} cap`,
  );
  assert.ok(held.speed < -EUC.maxReverseSpeed * 0.9, 'and does reach the cap');
});

test('releasing lean-back cancels the reverse dwell even while force lean settles', () => {
  const euc = controller();

  ride(euc, SECONDS(EUC.reverseEngageSeconds * 0.5), { throttle: -1 });
  const released = ride(euc, SECONDS(2), {});

  assert.equal(released.speed, 0);
  assert.equal(released.reversing, false);
  assert.equal(released.state, 'mounted');
});

test('reverse is unreachable from speed, however long the brake is held', () => {
  const euc = controller();
  ride(euc, SECONDS(10), { throttle: 1 });

  // Watch the whole braking pass: at no point before the wheel is stopped may
  // it be in reverse, whatever the dwell timer has been doing.
  const input = actions({ throttle: -1 });
  for (let i = 0; i < SECONDS(1.4); i += 1) {
    euc.step(STEP, input);
    const state = euc.snapshot();
    if (state.speed > EUC.reverseEntrySpeed) {
      assert.equal(state.reversing, false, `reversing while travelling at ${state.speed}`);
    }
  }
});

test('leaning forward out of reverse returns to a stop and then drives', () => {
  const euc = controller();
  ride(euc, SECONDS(2), { throttle: -1 });
  assert.equal(euc.snapshot().reversing, true);

  const recovered = ride(euc, SECONDS(3), { throttle: 1 });
  assert.equal(recovered.reversing, false);
  assert.ok(recovered.speed > 1, `back to ${recovered.speed} m/s forward`);
});

test('the look behind arms as a glance during the dwell and completes in reverse', () => {
  const euc = controller();

  // Most of the way through the confirmation dwell: the rider is visibly
  // checking over their shoulder, but the dwell alone never completes the
  // stance — the full look belongs to reverse actually engaging.
  const glancing = ride(euc, SECONDS(EUC.reverseEngageSeconds * 0.8), { throttle: -1 });
  assert.equal(glancing.reversing, false, 'still inside the dwell');
  assert.ok(glancing.reverseBlend > 0.05, `the dwell shows no glance (${glancing.reverseBlend})`);
  assert.ok(
    glancing.reverseBlend <= EUC.reverseGlanceFactor + 1e-9,
    `the dwell alone completed the look (${glancing.reverseBlend})`,
  );
  assert.ok(
    Math.abs(glancing.riderPitch) < 0.02,
    `the reverse glance retained the placeholder brake lean (${glancing.riderPitch})`,
  );

  const engaged = ride(euc, SECONDS(2), { throttle: -1 });
  assert.equal(engaged.reversing, true);
  assert.ok(engaged.reverseBlend > 0.95, `engaged look reached only ${engaged.reverseBlend}`);
  assert.ok(
    Math.abs(engaged.riderPitch) < 0.02,
    `backwards riding retained the placeholder brake lean (${engaged.riderPitch})`,
  );

  // The pose carries the same blend the snapshot reports — one owner.
  const pose = createPose();
  euc.writePose(pose);
  assert.equal(pose.reverseBlend, engaged.reverseBlend);
});

test('a released glance unwinds without reverse ever engaging', () => {
  const euc = controller();
  ride(euc, SECONDS(EUC.reverseEngageSeconds * 0.8), { throttle: -1 });

  const released = ride(euc, SECONDS(2), {});
  assert.equal(released.reversing, false);
  assert.equal(released.speed, 0, 'the glance moved nothing');
  assert.ok(released.reverseBlend < 0.02, `still glancing at ${released.reverseBlend}`);
});

test('driving forward out of reverse unwinds the look behind', () => {
  const euc = controller();
  ride(euc, SECONDS(2), { throttle: -1 });
  assert.ok(euc.snapshot().reverseBlend > 0.95, 'reverse look engaged');

  const forward = ride(euc, SECONDS(3), { throttle: 1 });
  assert.equal(forward.reversing, false);
  assert.ok(forward.reverseBlend < 0.02, `still looking behind at ${forward.reverseBlend}`);
});

test('a reset clears the look behind instantly', () => {
  const euc = controller();
  ride(euc, SECONDS(2), { throttle: -1 });
  assert.ok(euc.snapshot().reverseBlend > 0.95, 'reverse look engaged');

  euc.reset();
  assert.equal(euc.snapshot().reverseBlend, 0);
});

// ---------------------------------------------------------------------------
// Steering and carving
// ---------------------------------------------------------------------------

test('yaw authority is high at low speed and low at high speed', () => {
  const slow = controller();
  rideToSpeed(slow, 3);
  const slowTurn = ride(slow, 1, { throttle: 1, steer: 1 });

  const fast = controller();
  rideToSpeed(fast, 12);
  const fastTurn = ride(fast, 1, { throttle: 1, steer: 1 });

  assert.ok(
    Math.abs(slowTurn.yawRate) > Math.abs(fastTurn.yawRate) * 2,
    `slow ${slowTurn.yawRate} rad/s against fast ${fastTurn.yawRate} rad/s`,
  );

  const slowRadius = Math.abs(slowTurn.speed / slowTurn.yawRate);
  const fastRadius = Math.abs(fastTurn.speed / fastTurn.yawRate);
  // Tight enough at low speed for technical spaces, committed at speed.
  assert.ok(slowRadius < 3, `low-speed turn radius ${slowRadius.toFixed(2)} m`);
  assert.ok(fastRadius > 12, `high-speed turn radius ${fastRadius.toFixed(2)} m`);
});

test('reported lateral acceleration matches the path the heading actually curves', () => {
  // M16's first low-speed pass split delivered yaw into a reported carve and
  // an unreported "pivot" even though ground velocity follows heading. That
  // let the wheel ride a 1.1 g path while its pose, scrub and pedal logic were
  // told it was below the ordinary ceiling. The kinematic identity is the
  // regression guard; the upper bound includes the hard technical allowance.
  const ceiling = (EUC.maxLateralG + EUC.technicalTurnBonusG) * PHYSICS.gravity;
  const euc = controller();
  const input = actions({ throttle: 1, steer: 1 });

  for (let i = 0; i < SECONDS(30); i += 1) {
    euc.step(STEP, input);
    const state = euc.snapshot();
    assert.ok(
      Math.abs(state.lateralAccel - state.speed * state.yawRate) < 1e-9,
      `${state.lateralAccel} did not match ${state.speed} * ${state.yawRate}`,
    );
    assert.ok(
      Math.abs(state.lateralAccel) <= ceiling + 1e-9,
      `lateral ${state.lateralAccel} exceeded ${ceiling} at ${state.speed} m/s`,
    );
  }
});

test('below the lateral limit the requested yaw rate is delivered in full', () => {
  const euc = controller();
  rideToSpeed(euc, 2);
  const turning = ride(euc, 1, { throttle: 1, steer: 1 });

  assert.equal(turning.lateralLimited, false);
  // The falloff exponent shapes the decay between the two authorities (M16);
  // at 1.0 this is the straight line the model shipped with.
  const speedFactor = Math.min(1, Math.abs(turning.speed) / EUC.carveSpeed)
    ** EUC.yawFalloffExponent;
  // Negative, because steering right is a negative yaw about +Y in this frame.
  const expected = -(EUC.yawRateLow + (EUC.yawRateHigh - EUC.yawRateLow) * speedFactor);
  assert.ok(Math.abs(turning.yawRate - expected) < 1e-9, `${turning.yawRate} against ${expected}`);
});

/**
 * The turn radius a full-lock corner settles into at a given speed.
 *
 * Throttle released for the corner itself, so the measurement is of the
 * steering model rather than of a wheel still accelerating out from under it.
 */
function fullLockRadius(euc: EucController, speed: number): EucSnapshot {
  rideToSpeed(euc, speed);
  // Let force lean settle before measuring. Releasing throttle only on the
  // first corner step leaves launch authority accelerating through most of a
  // nominally fixed-speed turn and makes the requested calibration a fiction.
  ride(euc, SECONDS(1), { throttle: 0, steer: 0 });
  return ride(euc, SECONDS(0.6), { throttle: 0, steer: 1 });
}

test('slow riding is playful: a walking-pace turn is tight and visibly EUC-like', () => {
  // **The M16 owner note, in numbers.** "IRL it is very easy to make tight
  // turns and be playful with the wheel at slow speed" — which the game did not
  // let them do, because slow yaw authority was low *and* because the grip
  // clamp charged a pivot as though it were a carve.
  //
  // The first M16 pass made that yaw "free" and therefore hid it from lean.
  // At this actual walking pace the requested path is below the ordinary grip
  // ceiling: the wheel can bank visibly without reaching pedal clearance.
  const slow = fullLockRadius(controller(), 1.5);
  const slowRadius = Math.abs(slow.speed / slow.yawRate);
  assert.ok(slowRadius < 0.8, `a walking-pace turn takes ${slowRadius.toFixed(2)} m of radius`);
  assert.equal(slow.lateralLimited, false, 'and the rider got all the yaw they asked for');
  assert.ok(
    Math.abs(slow.rollAngle) > 0.35 && Math.abs(slow.rollAngle) < 0.6,
    `the machine should bank without scraping: ${slow.rollAngle.toFixed(3)} rad`,
  );
  assert.equal(slow.pedalStrike, 0, 'and nothing is dragging on the ground');
  assert.ok(Math.abs(slow.technicalTurn) > 0.5, 'full lock selects the differential-leg pose');

  // A brisker turn is tighter too — this one takes about 1.4 m where the
  // pivot-free model needs about 2.5 m. It *does* reach the lean limit and
  // scrape, and that is not the regression the assertion above guards against:
  // the old model scraped at this speed and lock as well, because a corner
  // this hard is a corner at the limit either way. What changed is the radius
  // it buys, not the lean it costs.
  const brisk = fullLockRadius(controller(), 3.5);
  const briskRadius = Math.abs(brisk.speed / brisk.yawRate);
  assert.ok(briskRadius < 1.7, `3.5 m/s takes ${briskRadius.toFixed(2)} m of radius`);
});

test('the technical allowance is gone by its fade speed, and the carve is untouched', () => {
  // The safety claim for the whole feature: above the fade speed the M16
  // steering must be the M2 steering, bit for bit. Compared against a
  // controller with the allowance switched off rather than against a recorded
  // number, so it stays true through a retune of anything else.
  const withTechnique = fullLockRadius(controller(), 8);
  const without = fullLockRadius(controller({ tuning: { technicalTurnBonusG: 0 } }), 8);

  assert.equal(withTechnique.yawRate, without.yawRate, 'same yaw');
  assert.equal(withTechnique.lateralAccel, without.lateralAccel, 'same cornering force');
  assert.equal(withTechnique.rollAngle, without.rollAngle, 'same lean');
  assert.ok(withTechnique.lateralLimited, 'and grip is what is limiting it, as it always was');

  // Below the fade speed the two genuinely differ, or the test above would be
  // asserting that the feature does nothing anywhere.
  const slowWith = fullLockRadius(controller(), 3);
  const slowWithout = fullLockRadius(controller({ tuning: { technicalTurnBonusG: 0 } }), 3);
  assert.ok(
    Math.abs(slowWith.yawRate) > Math.abs(slowWithout.yawRate) * 1.2,
    `${slowWith.yawRate} against ${slowWithout.yawRate}`,
  );
  assert.ok(Math.abs(slowWith.rollAngle) > 0.45, 'the low-speed path is visibly banked');
  assert.ok(
    Math.abs(slowWith.lateralAccel - slowWith.speed * slowWith.yawRate) < 1e-9,
    'and every delivered turn reaches the force and pose contract',
  );
});

test('analog steer selects gentle torso twist before the hard differential-leg turn', () => {
  const gentle = controller();
  rideToSpeed(gentle, 3);
  const gentleState = ride(gentle, SECONDS(0.6), { throttle: 0, steer: 0.4 });
  assert.ok(Math.abs(gentleState.riderTurnTwist) > 0.05, 'gentle input twists the torso');
  assert.ok(Math.abs(gentleState.technicalTurn) < 1e-3, 'gentle input is not the hard technique');

  const hard = fullLockRadius(controller(), 3);
  assert.ok(Math.abs(hard.technicalTurn) > 0.4, 'hard input selects the leg-and-wheel technique');
  assert.ok(Math.abs(hard.riderTurnTwist) < 0.02, 'hard input leaves the torso facing forward');
  assert.ok(
    Math.abs(hard.riderRoll) < Math.abs(hard.rollAngle) * 0.15,
    'the wheel banks beneath a nearly upright upper body',
  );
});

test('reverse is riding pace, and a reverse corner reaches the same limit', () => {
  // M16 took the reverse cap from walking pace to 15 mph on the owner's note
  // that backing up was "way too slow". The gate is untouched and has its own
  // tests above; what is new is that a reverse corner is now fast enough to be
  // grip-limited, which is what widened the reverse clearance envelope in
  // `render/riderClearance.test.ts`.
  const euc = controller();
  const backing = ride(euc, SECONDS(12), { throttle: -1 });
  assert.equal(backing.reversing, true);
  assert.ok(
    Math.abs(backing.speed + EUC.maxReverseSpeed) < 1e-6,
    `reverse settled at ${backing.speed} m/s`,
  );
  // Fast, and still emphatically not a second top speed.
  const forwardTopSpeed = Math.sqrt(
    (EUC.leanToAccel * Math.sin(EUC.maxLeanPitch) - SURFACES.pavement.rollingResistance)
      / EUC.dragCoefficient,
  );
  assert.ok(EUC.maxReverseSpeed < forwardTopSpeed * 0.4, 'backwards stays a party trick');

  const cornering = ride(euc, SECONDS(1.5), { throttle: -1, steer: 1 });
  assert.equal(cornering.lateralLimited, true, 'a reverse corner is grip-limited now');
  assert.ok(
    Math.abs(Math.abs(cornering.lateralAccel) - EUC.maxLateralG * PHYSICS.gravity) < 0.03,
    `and reaches the full lateral ceiling: ${cornering.lateralAccel}`,
  );
});

test('steering right turns toward -X, which is the rider\'s right', () => {
  // The world is right-handed with +Y up and +Z forward, so `right = forward x
  // up` is -X and a positive yaw about +Y turns *left*. Getting this backwards
  // makes movement and steering both run the wrong way on screen.
  //
  // This assertion alone is not proof, and it is important to know why: it is
  // written in the same frame as the code, so if the frame itself is wrong
  // they agree and both are wrong. That is exactly what happened during M2.
  // The claim that the frame maps to the *screen* correctly is made in
  // `tests/m2.spec.ts`, which projects a point and looks at where it lands.
  const euc = controller();
  rideToSpeed(euc, 6);
  const right = ride(euc, SECONDS(0.5), { throttle: 1, steer: 1 });

  assert.ok(right.yawRate < 0, 'a right turn is a negative yaw rate');
  assert.ok(right.headingY < 0, 'heading swung from +Z toward -X');
  assert.ok(right.position.x < 0, 'and the wheel actually went to the rider\'s right');
  assert.ok(right.rollAngle < 0, 'leaning right, into the turn');
  assert.ok(right.lateralAccel < 0);

  const left = controller();
  rideToSpeed(left, 6);
  const leaning = ride(left, SECONDS(0.5), { throttle: 1, steer: -1 });
  assert.ok(leaning.yawRate > 0 && leaning.rollAngle > 0, 'and mirrored to the left');
  assert.ok(leaning.position.x > 0);
});

test('the upper body stays much nearer level than the wheel in a hard carve', () => {
  const euc = controller();
  rideToSpeed(euc, 8);
  const turning = ride(euc, SECONDS(1), { throttle: 1, steer: 1 });

  assert.ok(Math.abs(turning.rollAngle) > 0.1, `wheel roll ${turning.rollAngle} is worth looking at`);
  assert.ok(
    Math.abs(turning.riderRoll - turning.rollAngle * EUC.riderUpperBodyRollFactor) < 1e-12,
    'rider roll is the wheel roll scaled by the tuned factor',
  );
  assert.ok(Math.abs(turning.riderRoll) < Math.abs(turning.rollAngle) * 0.25);
  assert.equal(Math.sign(turning.riderRoll), Math.sign(turning.rollAngle), 'and the same way');
});

test('backwards, the button, the lean and the path all agree', () => {
  // The M17 fix, and the reason it is one line of sign. Roll follows
  // `speed * yawRate`, so it was travel-relative from the start: pressing right
  // while reversing used to lean the rider right and carry them left, with the
  // yaw obeying the nose. Two of the three things a player watches agreed with
  // each other and disagreed with the button. Now all three agree.
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: -1 });
  const rolling = euc.snapshot();
  assert.ok(rolling.speed < -1, 'rolling backwards');

  const turning = ride(euc, SECONDS(1), { throttle: -1, steer: 1 });
  assert.ok(turning.yawRate > 0, 'steering right backwards must curve the path right');
  assert.ok(turning.rollAngle < 0, 'and the lean goes with it, into the turn');
  // The path itself, not merely the state: a right turn taken in reverse has to
  // put the rider to the right of where the heading alone would have carried
  // them. Right of the original heading is -X, per the frame note in the
  // controller: the rider's right hand points along `forward x up`.
  assert.ok(
    turning.position.x < rolling.position.x - 0.05,
    `the reverse right-hander tracked to x = ${turning.position.x.toFixed(3)}`,
  );
});

test('nose-relative reverse steering is still available, and forward is untouched', () => {
  // The A/B switch, and the pin that the flip is confined to reverse.
  const nose = controller({ tuning: { reverseSteerTravelRelative: 0 } });
  ride(nose, SECONDS(3), { throttle: -1 });
  const noseTurning = ride(nose, SECONDS(1), { throttle: -1, steer: 1 });
  assert.ok(noseTurning.yawRate < 0, 'at 0 the nose swings the way the rider asked');
  assert.ok(noseTurning.rollAngle > 0, 'and the lean disagrees with the button again');

  const travel = controller();
  const alsoNose = controller({ tuning: { reverseSteerTravelRelative: 0 } });
  rideToSpeed(travel, 8);
  rideToSpeed(alsoNose, 8);
  const a = ride(travel, SECONDS(2), { throttle: 1, steer: 1 });
  const b = ride(alsoNose, SECONDS(2), { throttle: 1, steer: 1 });
  assert.equal(a.yawRate, b.yawRate, 'forward steering must not depend on the switch');
  assert.equal(a.position.x, b.position.x, 'nor the forward line the rider takes');
});

test('roll settles back to upright when the steering is released', () => {
  const euc = controller();
  rideToSpeed(euc, 8);
  ride(euc, SECONDS(1), { throttle: 1, steer: 1 });

  const straightened = ride(euc, SECONDS(2), { throttle: 1 });
  assert.ok(Math.abs(straightened.rollAngle) < 0.005, `roll left at ${straightened.rollAngle}`);
});

test('a steady carve closes its own circle', () => {
  // The exit question is about riding in circles, so the circle had better
  // close: a heading that integrates inconsistently with the position leaves a
  // spiral, which reads in play as the wheel drifting outward for no reason.
  const euc = controller();
  // Half lock selects the ordinary gentle turn, keeping this geometry test
  // independent of the low-speed full-lock technique it is not about.
  const input = actions({ throttle: 0.45, steer: 0.5 });

  for (let i = 0; i < SECONDS(20); i += 1) euc.step(STEP, input);

  const start = euc.snapshot();
  const startHeading = start.headingY;
  let steps = 0;
  // Steering right, so the heading counts *down* through a full turn.
  while (startHeading - euc.snapshot().headingY < Math.PI * 2) {
    euc.step(STEP, input);
    steps += 1;
    assert.ok(steps < SECONDS(60), 'never completed a lap');
  }
  const end = euc.snapshot();

  const drift = Math.hypot(end.position.x - start.position.x, end.position.z - start.position.z);
  const radius = Math.abs(start.speed / start.yawRate);
  assert.ok(radius > 1, `a degenerate circle of radius ${radius} proves nothing`);
  assert.ok(drift < 0.25, `came back ${drift.toFixed(3)} m from where it started`);
});

test('ordinary steering cannot smuggle in the separate stationary emergency pivot', () => {
  const euc = controller();
  const stopped = ride(euc, SECONDS(1), { steer: 1 });

  assert.equal(stopped.speed, 0);
  assert.equal(stopped.yawRate, 0);
  assert.equal(stopped.headingY, 0);
  assert.equal(Math.abs(stopped.lateralAccel), 0, 'no speed, no cornering force, no lean');
  assert.ok(Math.abs(stopped.rollAngle) < 1e-6);
  assert.ok(Math.hypot(stopped.position.x, stopped.position.z) < 1e-9, 'and stayed put');
});

// ---------------------------------------------------------------------------
// Look into the turn (M3)
// ---------------------------------------------------------------------------

test('the head turns toward the corner, mirrored, and settles back', () => {
  // Presentation only: this is the M3 rider-reaction layer, and it is checked
  // here because it is a controller-owned smoothed scalar. Which way is left
  // cannot be settled in this frame — `tests/m3.spec.ts` proves the head turns
  // toward the inside of the corner *on screen*, which is the only test that
  // can (`docs/LESSONS_LEARNED.md`).
  const right = controller();
  const left = controller();
  const turningRight = ride(right, SECONDS(1.5), { throttle: 0.6, steer: 1 });
  const turningLeft = ride(left, SECONDS(1.5), { throttle: 0.6, steer: -1 });

  // The same sign as the yaw rate, so a left turn cannot arrive as a right one.
  assert.ok(Math.sign(turningRight.riderLookYaw) === Math.sign(turningRight.yawRate));
  assert.ok(Math.sign(turningLeft.riderLookYaw) === Math.sign(turningLeft.yawRate));
  assert.ok(
    Math.abs(turningRight.riderLookYaw + turningLeft.riderLookYaw) < 1e-9,
    'the two head turns are not mirrored',
  );
  assert.ok(Math.abs(Math.abs(turningRight.riderLookYaw) - EUC.riderLookIntoTurn) < 1e-3);

  // Half lock turns the head half as far: this reads intent, not a Boolean.
  const partial = ride(controller(), SECONDS(1.5), { throttle: 0.6, steer: 0.5 });
  assert.ok(Math.abs(Math.abs(partial.riderLookYaw) - EUC.riderLookIntoTurn * 0.5) < 1e-3);

  // And it comes back. A decaying presentation state that never returns to
  // neutral leaves the rider permanently glancing sideways.
  const released = ride(right, SECONDS(2), { throttle: 0.6, steer: 0 });
  assert.ok(Math.abs(released.riderLookYaw) < 1e-3);
});

test('the head leads the turn rather than following the wheel into it', () => {
  // Driven from steering intent, not from achieved yaw rate. Two consequences
  // are worth pinning down, because reading the yaw rate instead would look
  // reasonable and get both of them backwards.
  const euc = controller();

  // First: the head starts turning before the wheel has rolled at all.
  const early = ride(euc, SECONDS(0.15), { throttle: 0.6, steer: 1 });
  assert.ok(
    Math.abs(early.riderLookYaw) > Math.abs(early.rollAngle),
    'the head should be ahead of the wheel entering a corner',
  );

  // Second: at speed the lateral clamp throttles the delivered yaw rate, so a
  // head driven from it would turn *least* in exactly the committed carve
  // where a real rider looks furthest through the corner.
  const fast = controller();
  rideToSpeed(fast, 13);
  const committed = ride(fast, SECONDS(2), { throttle: 1, steer: 1 });
  assert.equal(committed.lateralLimited, true, 'expected the clamp to be binding');
  assert.ok(Math.abs(Math.abs(committed.riderLookYaw) - EUC.riderLookIntoTurn) < 1e-3);
});

// ---------------------------------------------------------------------------
// Ground contact, bookkeeping, and robustness
// ---------------------------------------------------------------------------

test('height comes from the terrain sampler, not from an assumption about zero', () => {
  const raised = flatPlan('brick', 1.5);

  const euc = controller({ plan: raised });
  assert.equal(euc.snapshot().position.y, 1.5, 'spawns on the surface it was given');

  const ridden = ride(euc, SECONDS(3), { throttle: 1 });
  assert.equal(ridden.position.y, 1.5);
  assert.equal(ridden.surface, 'brick');
  assert.equal(ridden.grounded, true);
});

test('the spawn heading is respected, so a level can point the rider anywhere', () => {
  const plan = flatPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: { position: { x: 5, y: 0, z: -3 }, headingY: Math.PI / 2 },
  });

  const start = euc.snapshot();
  assert.equal(start.position.x, 5);
  assert.equal(start.position.z, -3);

  // Heading pi/2 faces +X, so riding forward increases x and leaves z alone.
  const ridden = ride(euc, SECONDS(2), { throttle: 1 });
  assert.ok(ridden.position.x > 6, `moved to x = ${ridden.position.x}`);
  assert.ok(Math.abs(ridden.position.z + 3) < 1e-9, `z drifted to ${ridden.position.z}`);
});

test('distance travelled matches the path actually ridden', () => {
  const euc = controller();
  const ridden = ride(euc, SECONDS(6), { throttle: 1 });

  const straightLine = Math.hypot(ridden.position.x, ridden.position.z);
  assert.ok(
    Math.abs(straightLine - ridden.distanceTravelled) < 1e-6,
    `${straightLine} against ${ridden.distanceTravelled}`,
  );
});

test('the tyre rolls at the speed the wheel is travelling', () => {
  const euc = controller();
  const ridden = ride(euc, SECONDS(4), { throttle: 1 });
  const expected = ridden.distanceTravelled / (WHEEL.tyreDiameter / 2);

  assert.ok(Math.abs(ridden.wheelSpin - expected) < 1e-6, 'no wheel slip in the model');
});

test('reset returns the rider to the spawn, stopped and upright', () => {
  const euc = controller();
  ride(euc, SECONDS(5), { throttle: 1, steer: 1 });
  assert.ok(euc.snapshot().speed > 1);

  euc.reset();
  const fresh = euc.snapshot();

  assert.deepEqual(fresh.position, { x: 0, y: 0, z: 0 });
  assert.equal(fresh.headingY, 0);
  assert.equal(fresh.speed, 0);
  assert.equal(fresh.longitudinalAccel, 0);
  assert.equal(fresh.leanPitch, 0);
  assert.equal(fresh.riderPitch, 0);
  assert.equal(fresh.rollAngle, 0);
  assert.equal(fresh.wheelSpin, 0);
  assert.equal(fresh.distanceTravelled, 0);
  assert.equal(fresh.reversing, false);
  assert.equal(fresh.state, 'mounted');
});

test('the same inputs produce the same state, step for step', () => {
  // Determinism is what makes the browser suite able to assert a position at
  // all, and what makes a tuning change measurable rather than an impression.
  const script: Partial<ActionSnapshot>[] = [
    { throttle: 1 },
    { throttle: 1, steer: 1 },
    { throttle: 0 },
    { throttle: -1, steer: -0.4 },
    { throttle: 0.7, steer: 0.2 },
  ];

  const a = controller();
  const b = controller();
  for (const held of script) {
    ride(a, SECONDS(1.5), held);
    ride(b, SECONDS(1.5), held);
  }

  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('a non-finite axis cannot poison the state', () => {
  // The input layer clamps, so this only catches a caller that bypassed it —
  // which is exactly the caller that would otherwise turn every downstream
  // number into NaN, make the rig vanish, and print nothing.
  const euc = controller();
  ride(euc, SECONDS(2), { throttle: 1 });
  ride(euc, SECONDS(1), { throttle: Number.NaN, steer: Number.POSITIVE_INFINITY });

  const state = euc.snapshot();
  for (const [name, value] of Object.entries({
    speed: state.speed,
    x: state.position.x,
    z: state.position.z,
    heading: state.headingY,
    lean: state.leanPitch,
    roll: state.rollAngle,
  })) {
    assert.ok(Number.isFinite(value), `${name} became ${value}`);
  }
});

test('a zero or negative step changes nothing', () => {
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });
  const before = euc.snapshot();

  euc.step(0, actions({ throttle: 1 }));
  euc.step(-STEP, actions({ throttle: 1 }));

  assert.deepEqual(euc.snapshot(), before);
});

test('tuning changes reach the running controller, which is what F4 needs', () => {
  const euc = controller();
  const stockTop = ride(euc, SECONDS(30), { throttle: 1 }).speed;

  euc.setTuning({ leanToAccel: EUC.leanToAccel / 4 });
  const detuned = ride(euc, SECONDS(30), { throttle: 1 }).speed;

  assert.ok(detuned < stockTop * 0.7, `${detuned} against ${stockTop}`);
  assert.equal(euc.tuning.brakeAuthority, EUC.brakeAuthority, 'and nothing else moved');
});

test('the pose written for the renderer agrees with the snapshot', () => {
  // Two readings of one state. They are separate methods because one is
  // allocation-free and called twice a step; a drift between them would show
  // as the rig disagreeing with the debug overlay, which is a bad afternoon.
  const euc = controller();
  ride(euc, SECONDS(4), { throttle: 1, steer: 0.6 });

  const pose = createPose();
  euc.writePose(pose);
  const state = euc.snapshot();

  assert.equal(pose.x, state.position.x);
  assert.equal(pose.y, state.position.y);
  assert.equal(pose.z, state.position.z);
  assert.equal(pose.headingY, state.headingY);
  assert.equal(pose.rollAngle, state.rollAngle);
  assert.equal(pose.riderRoll, state.riderRoll);
  assert.equal(pose.riderPitch, state.riderPitch);
  assert.equal(pose.riderLookYaw, state.riderLookYaw);
  assert.equal(pose.wheelPitch, state.wheelPitch);
  assert.equal(pose.wheelSpin, state.wheelSpin);
  assert.equal(pose.speed, state.speed);
});

test('the state machine reports what the wheel is doing, not what the key says', () => {
  const euc = controller();

  assert.equal(euc.snapshot().state, 'mounted');
  assert.equal(ride(euc, SECONDS(2), { throttle: 1 }).state, 'rolling');
  assert.equal(ride(euc, SECONDS(3), {}).state, 'coasting');
  assert.equal(ride(euc, SECONDS(0.35), { throttle: -1 }).state, 'braking');
  assert.equal(ride(euc, SECONDS(60), {}).state, 'mounted');
});

// ---------------------------------------------------------------------------
// Terrain — M4
// ---------------------------------------------------------------------------

test('the approved M2 ride is unchanged on flat pavement', () => {
  // The load-bearing claim of the whole milestone. The owner accepted this ride
  // on flat pavement; M4 adds a slope term that is exactly zero there, a
  // per-surface resistance whose pavement entry is the value M2 shipped, and a
  // grip multiplier that is exactly 1.0 there. If any of those leaked, the
  // numbers below move — so they are asserted against the closed-form model
  // rather than against a recorded output, which would only prove the code
  // agrees with itself.
  const euc = controller();
  const cruise = ride(euc, SECONDS(40), { throttle: 1 });

  assert.equal(cruise.slopeAccel, 0, 'flat ground contributes no slope term');
  assert.equal(cruise.slope, 0);
  assert.equal(cruise.rollingResistance, SURFACES.pavement.rollingResistance);
  assert.equal(cruise.lateralLimitG, EUC.maxLateralG);

  const analytic = Math.sqrt(
    (EUC.leanToAccel * Math.sin(EUC.maxLeanPitch) - SURFACES.pavement.rollingResistance)
      / EUC.dragCoefficient,
  );
  assert.ok(Math.abs(cruise.speed - analytic) / analytic < 0.02);
});

test('grass costs top speed, and the loss is the surface table, not a fudge', () => {
  // M4's exit question, headlessly: the same wheel, the same input, two
  // surfaces, and a difference big enough to feel without looking.
  const pavement = ride(controller({ plan: flatPlan('pavement') }), SECONDS(40), { throttle: 1 });
  const grass = ride(controller({ plan: flatPlan('grass') }), SECONDS(40), { throttle: 1 });

  assert.equal(grass.surface, 'grass');
  assert.equal(grass.rollingResistance, SURFACES.grass.rollingResistance);
  assert.ok(
    grass.speed < pavement.speed * 0.9,
    `grass ${grass.speed.toFixed(2)} against pavement ${pavement.speed.toFixed(2)} m/s`,
  );

  const analytic = Math.sqrt(
    (EUC.leanToAccel * Math.sin(EUC.maxLeanPitch) - SURFACES.grass.rollingResistance)
      / EUC.dragCoefficient,
  );
  assert.ok(Math.abs(grass.speed - analytic) / analytic < 0.02);
});

test('the global surface-drag scale moves every surface together', () => {
  const light = controller({ plan: flatPlan('grass'), tuning: { rollingResistanceScale: 0.5 } });
  const heavy = controller({ plan: flatPlan('grass'), tuning: { rollingResistanceScale: 2 } });

  const lightTop = ride(light, SECONDS(40), { throttle: 1 }).speed;
  const heavyTop = ride(heavy, SECONDS(40), { throttle: 1 }).speed;
  assert.ok(lightTop > heavyTop, `${lightTop} against ${heavyTop}`);
  assert.equal(
    light.snapshot().rollingResistance,
    SURFACES.grass.rollingResistance * 0.5,
  );
});

test('grip scales the lateral ceiling and nothing else', () => {
  // Grip is deliberately lateral-only (see the file header). Proving the
  // *nothing else* half matters as much as the first: a grip that quietly
  // reached brake authority would retune an approved M2 number.
  const pavement = controller({ plan: flatPlan('pavement') });
  const gravel = controller({ plan: flatPlan('gravel') });

  rideToSpeed(pavement, 12);
  rideToSpeed(gravel, 12);
  const hardPaved = ride(pavement, SECONDS(2), { throttle: 1, steer: 1 });
  const hardLoose = ride(gravel, SECONDS(2), { throttle: 1, steer: 1 });

  assert.equal(hardPaved.lateralLimitG, EUC.maxLateralG);
  assert.equal(hardLoose.lateralLimitG, EUC.maxLateralG * SURFACES.gravel.grip);
  assert.ok(
    Math.abs(hardLoose.lateralAccel) < Math.abs(hardPaved.lateralAccel),
    'the loose surface must not reach the paved surface’s cornering force',
  );
  assert.ok(
    Math.abs(hardLoose.rollAngle) < Math.abs(hardPaved.rollAngle),
    'and must therefore be taken at less lean',
  );
});

test('a hill decelerates a climb and accelerates a descent, by exactly g sin(theta)', () => {
  // `docs/PLANS.md` §4.1 writes the slope term as `-g sin(slopeAngle)`. The
  // implementation never sees an authored gradient — it works from the sampled
  // normal — so this checks it against the closed form the plan states.
  const gradient = 0.15;
  const uphill = controller({ plan: rampPlan(gradient) });
  const downhill = controller({ plan: rampPlan(-gradient) });

  const climbing = ride(uphill, SECONDS(8), { throttle: 1 });
  const dropping = ride(downhill, SECONDS(8), { throttle: 1 });

  const theta = Math.atan(gradient);
  assert.ok(
    Math.abs(climbing.slopeAccel + PHYSICS.gravity * Math.sin(theta)) < 0.05,
    `slope term ${climbing.slopeAccel} against -g sin(theta) ${-PHYSICS.gravity * Math.sin(theta)}`,
  );
  assert.ok(Math.abs(climbing.slope - theta) < 0.01, `reported slope ${climbing.slope}`);
  assert.ok(dropping.slopeAccel > 0, 'a descent must add speed, not remove it');

  // The two equilibrium speeds, from the same closed form the flat case uses,
  // with the slope term moved to the other side.
  const equilibrium = (slopeTerm: number): number => Math.sqrt(
    (EUC.leanToAccel * Math.sin(EUC.maxLeanPitch)
      - SURFACES.pavement.rollingResistance + slopeTerm) / EUC.dragCoefficient,
  );
  const g = PHYSICS.gravity * Math.sin(theta);
  assert.ok(Math.abs(climbing.speed - equilibrium(-g)) < 0.6, `uphill ${climbing.speed}`);
  assert.ok(Math.abs(dropping.speed - equilibrium(g)) < 0.6, `downhill ${dropping.speed}`);
  assert.ok(
    dropping.speed > climbing.speed + 2.5,
    `downhill ${dropping.speed.toFixed(2)} against uphill ${climbing.speed.toFixed(2)} m/s`,
  );
});

test('a hill is never mistaken for a kerb, at any speed', () => {
  // The trap this cost real thought: at 15 m/s one fixed step covers 12 cm of
  // ground, so a steep embankment rises as far in one step as a kerb does. The
  // step logic subtracts what the current surface's own normal predicts, so a
  // slope's excess is zero at any gradient and any speed.
  for (const gradient of [0.1, 0.4, 0.9]) {
    const euc = controller({ plan: rampPlan(-gradient) });
    const ridden = ride(euc, SECONDS(6), { throttle: 1 });
    assert.equal(ridden.lastStepUp, 0, `gradient ${gradient} produced a phantom step`);
    assert.equal(ridden.blocked, false, `gradient ${gradient} blocked the wheel`);
    assert.ok(ridden.speed > 5, `gradient ${gradient} left the wheel at ${ridden.speed} m/s`);
  }
});

/**
 * A flat plan with one raised slab whose leading edge is at z = 40 and which
 * then runs to the end of the course.
 *
 * Forty metres of run-up is enough to reach a real approach speed before the
 * step; running the slab to the end means a ride long enough to observe the
 * mount cannot also ride off the far side of it, which is the shape of fixture
 * bug that reports "the kerb did nothing" when what happened is that the wheel
 * went over it and back down.
 */
function kerbPlan(height: number): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'kerb-run',
      length: 160,
      halfWidth: 12,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{
        s: 90,
        t: 0,
        halfAlong: 50,
        halfLateral: 12,
        height,
        surface: 'pavement',
      }],
    }],
    {
      id: `kerb-${height}`,
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 4,
    },
  );
}

test('a sidewalk kerb is mountable and costs speed; a ledge is not and stops the wheel', () => {
  // The two sides of the derived step-up ceiling. 0.15 m is the sidewalk of
  // `docs/PLANS.md` §6 beat 3; 0.30 m is a ledge. Neither number is written in
  // the controller — the ceiling comes from the wheel's own pedal height.
  const mounted = controller({ plan: kerbPlan(0.15) });
  const before = rideToSpeed(mounted, 12).speed;
  const after = ride(mounted, SECONDS(4), { throttle: 1 });

  assert.ok(after.position.z > 40, 'the wheel got onto the kerb');
  assert.ok(Math.abs(after.position.y - 0.15) < 1e-9, `ended at y = ${after.position.y}`);

  const blocked = controller({ plan: kerbPlan(0.3) });
  rideToSpeed(blocked, 12);
  // Ride to the moment of refusal rather than to a fixed clock: a full-speed
  // hit on an unmountable ledge is an obstacle crash, and the crash-recover
  // cycle is long enough now (stretched to the owner's wipeout recording)
  // that any fixed sample time lands somewhere arbitrary inside it.
  const hit = rideUntil(blocked, { throttle: 1 }, (s) => s.blocked, SECONDS(4));
  assert.ok(hit.reached, 'the ledge never refused the wheel');
  const stopped = ride(blocked, SECONDS(1), { throttle: 1 });

  assert.ok(stopped.position.z < 40.2, `rode through the ledge to z = ${stopped.position.z}`);
  assert.equal(stopped.position.y, 0, 'and never got on top of it');
  assert.ok(stopped.speed < 0.2, `still moving at ${stopped.speed} m/s`);
  assert.ok(before > 11, 'the approach speed was real');
});

test('mounting a kerb costs speed in proportion to its height', () => {
  const speedAfterKerb = (height: number): number => {
    const euc = controller({ plan: kerbPlan(height) });
    rideToSpeed(euc, 12);
    // Step until the wheel is on top of the kerb, then read the speed.
    const input = actions({ throttle: 1 });
    for (let i = 0; i < 600; i += 1) {
      euc.step(STEP, input);
      if (euc.snapshot().lastStepUp > 0) return euc.snapshot().speed;
    }
    throw new Error(`never mounted the ${height} m kerb`);
  };

  const low = speedAfterKerb(0.08);
  const high = speedAfterKerb(0.15);
  assert.ok(high < low, `0.15 m cost less than 0.08 m: ${high} against ${low}`);
  // 0.15 m at 20 (m/s)/m is 3 m/s off an approach near 12.
  assert.ok(low - high > 1, `the two kerbs are indistinguishable: ${low} against ${high}`);
});

test('the forward feeler reports a kerb before the wheel reaches it', () => {
  const euc = controller({ plan: kerbPlan(0.15) });
  const input = actions({ throttle: 1 });

  let sawItComing = false;
  for (let i = 0; i < 2000; i += 1) {
    euc.step(STEP, input);
    const state = euc.snapshot();
    // Seen ahead, and the wheel is still below it.
    if (state.curbAhead > 0.1 && state.position.y === 0) sawItComing = true;
    if (state.lastStepUp > 0) break;
  }
  assert.ok(sawItComing, 'the feeler never announced the kerb');
});

/** A long wall lying across +Z at z = 40, on otherwise endless pavement. */
function wallPlan(): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'wall-run',
      length: 80,
      halfWidth: 30,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{
        s: 40, t: 0, halfAlong: 0.5, halfLateral: 300, height: 1.4, surface: 'pavement',
      }],
    }],
    {
      id: 'wall',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 8,
    },
  );
}

/** A lamp-post-width solid offset far enough that the tyre centreline misses. */
function narrowPostPlan(offset: number): LevelPlan {
  return buildLevelPlan(
    [{
      id: 'post-run',
      length: 80,
      halfWidth: 12,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{
        s: 30,
        t: offset,
        halfAlong: 0.075,
        halfLateral: 0.075,
        height: 4.6,
        surface: 'pavement',
      }],
    }],
    {
      id: `narrow-post-${offset}`,
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 4,
    },
  );
}

test('the pedal-width envelope catches a narrow post beside the tyre', () => {
  const plan = narrowPostPlan(0.20);
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: plan.spawn,
    tuning: { crashRecoverAutoSeconds: 99, crashRecoverEarliestSeconds: 99 },
  });

  rideToSpeed(euc, 10);
  const hit = rideUntil(euc, { throttle: 1 }, (snapshot) => snapshot.crashed, 800);
  assert.ok(hit.reached, 'a pedal-width strike on the narrow post was missed');
  assert.equal(hit.snapshot.blocked, true);
  assert.equal(hit.snapshot.crashCause, 'obstacle');
  assert.ok(
    hit.snapshot.position.z < 30,
    `the machine passed the post centre before collision at z=${hit.snapshot.position.z}`,
  );
});

test('the pedal-width envelope does not invent collision beyond its edge', () => {
  const plan = narrowPostPlan(WHEEL.pedalSpan / 2 + 0.075 + 0.03);
  const euc = new EucController(new PlanTerrainSampler(plan), { spawn: plan.spawn });

  const passed = rideUntil(euc, { throttle: 1 }, (snapshot) => snapshot.position.z > 35, 1800);
  assert.ok(passed.reached, 'the rider never reached the far side of the post');
  assert.equal(passed.snapshot.blocked, false);
  assert.equal(passed.snapshot.crashes, 0);
});

test('wall-slide resolution cannot walk through a rotated narrow post', () => {
  const base = flatPlan();
  const headingY = 1.048691063637002;
  const forwardX = Math.sin(headingY);
  const forwardZ = Math.cos(headingY);
  const leftX = Math.cos(headingY);
  const leftZ = -Math.sin(headingY);
  const halfWidth = 0.0765;
  const lateral = halfWidth + WHEEL.pedalSpan / 2 - 0.03;
  const startAlong = -halfWidth - WHEEL.tyreDiameter / 2 - 0.8;
  const centre = { x: 0, y: 2.3, z: 30 };
  const spawn = {
    position: {
      x: centre.x + leftX * lateral + forwardX * startAlong,
      y: 0,
      z: centre.z + leftZ * lateral + forwardZ * startAlong,
    },
    headingY,
  };
  const plan: LevelPlan = {
    ...base,
    id: 'rotated-narrow-post',
    spawn,
    solids: [{
      centre,
      halfExtents: { x: halfWidth, y: 2.3, z: halfWidth },
      rotationY: headingY,
      surface: 'pavement',
      occludes: false,
    }],
  };
  const euc = new EucController(new PlanTerrainSampler(plan), { spawn });

  const stopped = ride(euc, 180, { throttle: 1 });
  const endAlong = (stopped.position.x - centre.x) * forwardX
    + (stopped.position.z - centre.z) * forwardZ;
  assert.equal(stopped.blocked, true, 'the rotated post stopped making contact');
  assert.ok(endAlong < -halfWidth, `axis resolution walked through the post to ${endAlong}`);
  assert.ok(Math.abs(stopped.speed) < 2, `the post did not arrest the approach: ${stopped.speed}`);
});

test('a fast head-on wall impact keeps the tyre out of the mesh and crashes the rider', () => {
  const plan = wallPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: plan.spawn,
    tuning: { crashRecoverAutoSeconds: 99, crashRecoverEarliestSeconds: 99 },
  });

  rideToSpeed(euc, 12);
  const hit = rideUntil(euc, { throttle: 1 }, (snapshot) => snapshot.crashed, 600);
  assert.ok(hit.reached, 'the solid impact never took the rider off');
  const stopped = hit.snapshot;

  assert.equal(stopped.blocked, true, 'expected to be in contact with the wall');
  const wallFace = 40 - 0.5;
  const wheelRadius = WHEEL.tyreDiameter / 2;
  assert.ok(
    stopped.position.z <= wallFace - wheelRadius + 0.02,
    `tyre centre ${stopped.position.z} clips a wall beginning at ${wallFace}`,
  );
  assert.equal(stopped.position.y, 0, 'and never climbed it');
  assert.equal(stopped.crashCause, 'obstacle');
  assert.equal(stopped.crashMotion, 'sideFall');
  assert.ok(stopped.collisionImpact >= EUC.obstacleCrashSpeed);
});

test('a fast head-on wall impact during a hop crashes before landing', () => {
  const plan = wallPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: plan.spawn,
    tuning: { crashRecoverAutoSeconds: 99, crashRecoverEarliestSeconds: 99 },
  });

  rideToSpeed(euc, 12);
  const approach = rideUntil(
    euc,
    { throttle: 1 },
    (snapshot) => snapshot.position.z >= 34,
    1200,
  );
  assert.ok(approach.reached, 'the rider never reached the jump point');

  pressHop(euc, { throttle: 1 });
  const airborne = rideUntil(
    euc,
    { throttle: 1 },
    (snapshot) => !snapshot.grounded,
    SECONDS(0.5),
  );
  assert.ok(airborne.reached, 'the hop never left the ground');

  const hit = rideUntil(euc, { throttle: 1 }, (snapshot) => snapshot.blocked, 240);
  assert.ok(hit.reached, 'the airborne rider never met the wall');
  assert.equal(hit.snapshot.crashed, true, 'the airborne impact was survived');
  assert.equal(hit.snapshot.crashCause, 'obstacle');
  assert.ok(hit.snapshot.collisionImpact >= EUC.obstacleCrashSpeed);
});

test('a walking-speed bump into a wall is caught without manufacturing a crash', () => {
  const plan = wallPlan();
  const wallFace = 40 - 0.5;
  const wheelRadius = WHEEL.tyreDiameter / 2;
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: {
      position: { x: 0, y: 0, z: wallFace - wheelRadius - 0.15 },
      headingY: 0,
    },
  });

  const stopped = ride(euc, SECONDS(3), { throttle: 1 });
  assert.equal(stopped.blocked, true);
  assert.equal(stopped.crashes, 0, 'a near-standstill catch is not a wipeout');
  assert.ok(stopped.position.z <= wallFace - wheelRadius + 0.02);
});

test('a rider stopped against a solid can pivot away without resetting', () => {
  const plan = wallPlan();
  const wallFace = 40 - 0.5;
  const wheelRadius = WHEEL.tyreDiameter / 2;
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: {
      position: { x: 0, y: 0, z: wallFace - wheelRadius - 0.001 },
      headingY: 0,
    },
  });

  const hit = rideUntil(euc, { throttle: 1 }, (snapshot) => snapshot.blocked, 120);
  assert.ok(hit.reached, 'the wall contact fixture never engaged');
  const contact = hit.snapshot;
  const contactZ = contact.position.z;

  const settled = ride(euc, SECONDS(3), {});
  assert.ok(Math.abs(settled.speed) < 1e-9, `the fixture did not stop: ${settled.speed}`);

  // Releasing the lean must not erase the fact that the wheel is touching a
  // solid. At zero speed that contact is the contextual permission to pivot:
  // ordinary stopped steering stays unavailable away from obstacles.
  const turned = ride(euc, SECONDS(0.85), { steer: 1 });
  assert.ok(
    Math.abs(turned.headingY - settled.headingY) > 2.5,
    `the stopped rider only turned ${Math.abs(turned.headingY - settled.headingY)} rad`,
  );

  const escaped = ride(euc, SECONDS(1), { throttle: 1 });
  assert.equal(escaped.blocked, false, 'the rider remained glued to the wall');
  assert.ok(
    escaped.position.z < contactZ - 1,
    `the rider moved only ${(contactZ - escaped.position.z).toFixed(2)} m away`,
  );
});

test('a shallow scrape slides along the wall rather than manufacturing a crash', () => {
  // The other half of the resolution, and the half that decides whether a wall
  // is furniture or a trap. The spawn heading is set independently of the
  // segment's, so the same wall is met at forty-five degrees.
  const plan = wallPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: { position: { x: 0, y: 0, z: 20 }, headingY: Math.PI * 0.42 },
    // Built directly rather than through `controller()`, so the M20 cutout has
    // to be switched off here too: this fixture holds full throttle for eight
    // seconds to prove the *wall* does not crash the rider, and the wheel now
    // reaches its own speed limit inside that window.
    tuning: { cutoutEnabled: 0 },
  });

  rideToSpeed(euc, 10);
  const scraping = ride(euc, SECONDS(8), { throttle: 1 });

  assert.equal(scraping.blocked, true, 'expected to be in contact with the wall');
  assert.ok(scraping.position.z < 40.5, `passed through the wall to z = ${scraping.position.z}`);
  assert.equal(scraping.position.y, 0, 'and never climbed it');
  assert.ok(
    scraping.position.x > 70,
    `slid only ${scraping.position.x.toFixed(1)} m along the wall`,
  );
  assert.equal(scraping.crashes, 0, 'the scrape spends too little normal speed to crash');
  assert.ok(
    scraping.speed > 4,
    `a 45-degree scrape stopped the wheel dead at ${scraping.speed} m/s`,
  );
});

/**
 * A long wall lying beside the route with its near face at `SIDE_WALL_FACE`,
 * so a rider can travel *along* it instead of into it. `wallPlan` above is the
 * head-on case; this is the one a player actually complained about.
 */
const SIDE_WALL_FACE = 3;

function sideWallPlan(): LevelPlan {
  const base = buildLevelPlan(
    [{ id: 'run', length: 120, halfWidth: 14, surface: 'pavement', shoulder: 2 }],
    {
      id: 'side-wall',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 8,
    },
  );
  return {
    ...base,
    solids: [{
      centre: { x: SIDE_WALL_FACE + 4, y: 3, z: 60 },
      halfExtents: { x: 4, y: 3, z: 50 },
      rotationY: 0,
      surface: 'pavement',
      occludes: true,
    }],
  };
}

/** Closest the centreline came to the side wall's face while alongside it. */
function closestToSideWall(
  angle: number,
  cruise: number,
  tuning?: Partial<EucTuning>,
): number {
  const plan = sideWallPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: { position: { x: 0.5, y: 0, z: 20 }, headingY: angle },
    ...(tuning === undefined ? {} : { tuning }),
  });
  let closest = Infinity;
  for (let step = 0; step < SECONDS(30); step += 1) {
    const throttle = euc.snapshot().speed < cruise ? 1 : 0;
    euc.step(STEP, actions({ throttle }));
    const now = euc.snapshot();
    if (now.position.z > 25 && now.position.z < 105) {
      closest = Math.min(closest, SIDE_WALL_FACE - now.position.x);
    }
  }
  return closest;
}

test('riding along a wall keeps the pedals out of it', () => {
  // The M17 defect, reported by a player as riding through the wall. The
  // obstacle cast reaches a wheel radius *along the direction of travel*, so a
  // shallow approach only ever bought `wheelRadius * sin(angle)` of sideways
  // room — creeping parallel to a wall parked the centreline 0.04 m from the
  // face and buried a fifth of a metre of machine and rider in the mesh.
  //
  // The bound is the standoff scaled by the approach angle's cosine, and that
  // is the mechanism rather than a fudge: the standoff is measured along the
  // machine's own lateral axis, because the pedal tip that visibly enters the
  // wall sits on that axis, not on the wall's normal.
  for (const angle of [0.05, 0.15, 0.3]) {
    for (const cruise of [1.4, 6, 14]) {
      const closest = closestToSideWall(angle, cruise);
      const floor = TERRAIN.wallStandoff * Math.cos(angle) - 0.01;
      assert.ok(
        closest >= floor,
        `at ${angle} rad and ${cruise} m/s the centreline reached `
          + `${closest.toFixed(3)} m of the face, inside the ${floor.toFixed(3)} m floor`,
      );
    }
  }
});

test('the wall standoff can be switched off, and the old clipping returns', () => {
  // The F4 escape hatch, and the proof that the pin above is measuring the
  // standoff rather than something else that happens to hold the rider out.
  const off = closestToSideWall(0.15, 1.4, { wallStandoff: 0 });
  assert.ok(off < 0.1, `expected the un-standoffed centreline at the face, got ${off}`);
  assert.ok(
    closestToSideWall(0.15, 1.4) > off + 0.15,
    'the standoff bought less than 0.15 m over the behaviour it replaced',
  );
});

test('a slot narrower than two standoffs centres the machine instead of ejecting it', () => {
  // Both sides are resolved together for exactly this case. Resolved one side
  // at a time, a gap under 0.52 m would push the rider out through the far
  // wall — which is the failure mode a standoff most easily introduces.
  const base = sideWallPlan();
  const halfGap = 0.45;
  const plan: LevelPlan = {
    ...base,
    solids: [halfGap, -halfGap].map((side) => ({
      centre: { x: side + Math.sign(side) * 4, y: 3, z: 60 },
      halfExtents: { x: 4, y: 3, z: 20 },
      rotationY: 0,
      surface: 'pavement',
      occludes: true,
    })),
  };
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: { position: { x: 0.2, y: 0, z: 30 }, headingY: 0 },
  });
  let furthest = 0;
  for (let step = 0; step < SECONDS(25); step += 1) {
    const throttle = euc.snapshot().speed < 3 ? 1 : 0;
    euc.step(STEP, actions({ throttle }));
    const now = euc.snapshot();
    if (now.position.z > 40 && now.position.z < 80) {
      furthest = Math.max(furthest, Math.abs(now.position.x));
    }
  }
  const end = euc.snapshot();
  assert.ok(furthest < halfGap, `the standoff pushed the machine to x = ${furthest}`);
  assert.equal(end.crashes, 0, 'squeezing through the slot crashed the rider');
  assert.ok(end.position.z > 85, `the rider never cleared the slot, ending at ${end.position.z}`);
});

test('a walking-pace head-on stop still leaves exactly one tyre radius', () => {
  // The half that was never broken, pinned so a future standoff change cannot
  // quietly move the stop the crash tests depend on.
  const plan = sideWallPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: { position: { x: 0, y: 0, z: 60 }, headingY: Math.PI / 2 },
  });
  for (let step = 0; step < SECONDS(25); step += 1) {
    const throttle = euc.snapshot().speed < 1.5 ? 0.35 : 0;
    euc.step(STEP, actions({ throttle }));
  }
  const end = euc.snapshot();
  assert.ok(
    Math.abs(SIDE_WALL_FACE - end.position.x - WHEEL.tyreDiameter / 2) < 0.01,
    `head-on stop moved to ${(SIDE_WALL_FACE - end.position.x).toFixed(4)} m`,
  );
  assert.equal(end.blocked, true, 'a wheel parked against a wall is in contact with it');
  assert.equal(end.crashes, 0, 'a walking-pace touch is not a crash');
});

test('suspension moves over rough ground, sits still on smooth ground, and only at speed', () => {
  const travelOver = (surface: SurfaceId, throttle: number): number => {
    const euc = controller({ plan: flatPlan(surface) });
    const input = actions({ throttle });
    let low = Infinity;
    let high = -Infinity;
    for (let i = 0; i < SECONDS(8); i += 1) {
      euc.step(STEP, input);
      if (i < SECONDS(3)) continue;
      const offset = euc.snapshot().suspensionOffset;
      if (offset < low) low = offset;
      if (offset > high) high = offset;
    }
    return high - low;
  };

  const grassAtSpeed = travelOver('grass', 1);
  const pavementAtSpeed = travelOver('pavement', 1);
  const grassParked = travelOver('grass', 0);

  assert.ok(grassAtSpeed > 0.02, `grass barely moved the suspension: ${grassAtSpeed} m`);
  assert.ok(
    grassAtSpeed > pavementAtSpeed * 3,
    `grass ${grassAtSpeed.toFixed(4)} m against pavement ${pavementAtSpeed.toFixed(4)} m`,
  );
  // The roughness field is spatial, so a wheel that is not moving is not being
  // excited. That is the whole reason it is a function of position.
  assert.ok(grassParked < 1e-6, `a parked wheel bobbed by ${grassParked} m`);
});

test('the suspension never exceeds the wheel’s declared travel', () => {
  const euc = controller({
    plan: flatPlan('gravel'),
    // A deliberately absurd surface, to reach the bump stops on purpose.
    tuning: { suspensionDamping: 0.05 },
  });
  euc.setSurfaceResponse('gravel', { roughnessAmplitude: 0.5, roughnessWavelength: 3 });

  const input = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(10); i += 1) {
    euc.step(STEP, input);
    const offset = euc.snapshot().suspensionOffset;
    assert.ok(
      Math.abs(offset) <= WHEEL.suspensionTravel + 1e-9,
      `travel ${offset} exceeded ${WHEEL.suspensionTravel}`,
    );
  }
});

test('the ground-tilt derivation is still correct when the follow is turned up', () => {
  // The default follow fractions keep the rig plumb (asserted below), but the
  // sign derivation must stay right, because the fractions are live on F4 and
  // a fraction of a wrongly-signed angle is still wrong. At full follow the
  // M4 contract holds exactly: climbing is nose-up, which the rig reaches
  // with a negative rotation about its own +X.
  const euc = controller({
    plan: rampPlan(0.2),
    tuning: { groundTiltPitchFollow: 1, groundTiltRollFollow: 1 },
  });
  const pose = createPose();

  // A reset onto a slope lands already tilted: easing in from level would draw
  // a frame of the rig standing upright on a hill.
  euc.writePose(pose);
  const theta = Math.atan(0.2);
  assert.ok(
    Math.abs(pose.groundPitch + theta) < 0.02,
    `spawn tilt ${pose.groundPitch} against nose-up ${-theta}`,
  );
  assert.ok(Math.abs(pose.groundRoll) < 1e-6, 'a fall-line climb has no cross-slope');

  ride(euc, SECONDS(3), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(Math.abs(pose.groundPitch + theta) < 0.02, 'and holds it while climbing');
});

test('the rig stays plumb on a hill and the rider leans into it instead', () => {
  // The owner's M4 ride: a rig tilted to the surface normal leans the rider
  // *away* from a climb, which on a real EUC is how you get hurt. The firmware
  // holds the pedals level with gravity, so the default fore-aft follow is
  // zero and the hill is answered by the rider leaning uphill by the gradient
  // (`EUC.riderSlopeLeanFactor` — the balance equilibrium, see tuning).
  const theta = Math.atan(0.2);
  const pose = createPose();

  const uphill = controller({ plan: rampPlan(0.2) });
  const climbing = ride(uphill, SECONDS(8), { throttle: 1 });
  uphill.writePose(pose);
  assert.ok(
    Math.abs(pose.groundPitch) < 1e-9,
    `climbing rig tilt ${pose.groundPitch} should be zero at the default follow`,
  );
  assert.ok(
    Math.abs(climbing.slopeLean - theta * EUC.riderSlopeLeanFactor) < 0.02,
    `slope lean ${climbing.slopeLean} against uphill ${theta * EUC.riderSlopeLeanFactor}`,
  );
  // And the whole rendered pitch leans further forward than the same steady
  // full-throttle cruise does on the flat.
  const flat = ride(controller(), SECONDS(8), { throttle: 1 });
  assert.ok(
    climbing.riderPitch > flat.riderPitch + theta * 0.8,
    `climbing pitch ${climbing.riderPitch} against flat cruise ${flat.riderPitch}`,
  );
  // The pedals stay level: the wheel's share reads the action pitch alone.
  assert.ok(
    Math.abs(climbing.wheelPitch - (flat.wheelPitch)) < 0.03,
    `climbing wheel pitch ${climbing.wheelPitch} should stay near flat ${flat.wheelPitch}`,
  );

  // Descending, the same term leans the rider back — uphill of the wheel.
  const downhill = controller({ plan: rampPlan(-0.2) });
  const dropping = ride(downhill, SECONDS(8), { throttle: 1 });
  assert.ok(
    Math.abs(dropping.slopeLean + theta * EUC.riderSlopeLeanFactor) < 0.02,
    `descent lean ${dropping.slopeLean} should point back up the hill`,
  );
});

test('the slope lean fades out at a standstill, so a stopped rider stands plumb', () => {
  // Stationary on a hill the pedals hold the rider level and no traction is
  // being commanded, so the balance equilibrium really is vertical.
  const euc = controller({ plan: rampPlan(0.2) });
  ride(euc, SECONDS(6), { throttle: 1 });
  assert.ok(euc.snapshot().slopeLean > 0.1, 'leaning while climbing');

  // Brake to a stop, releasing as soon as the wheel is stopped so the held
  // lean-back cannot arm the reverse gate's dwell.
  const brake = actions({ throttle: -1 });
  let guard = 0;
  while (euc.snapshot().speed > EUC.stoppedSpeed) {
    euc.step(STEP, brake);
    guard += 1;
    assert.ok(guard < 4000, 'never came to a stop on the hill');
  }
  ride(euc, SECONDS(2), {});
  const stopped = euc.snapshot();
  assert.equal(stopped.state, 'mounted');
  assert.ok(
    Math.abs(stopped.slopeLean) < 0.01,
    `stopped on the hill still leaning ${stopped.slopeLean}`,
  );
});

test('reversing down a hill leans the rider toward the hill, not off the back', () => {
  // Backing down a slope the wheel brakes against gravity, so the rider hangs
  // uphill of it — toward the hill they are facing. The heading is unchanged
  // in reverse, so the gradient along the heading is still positive and the
  // same signed term produces exactly this.
  const euc = controller({ plan: rampPlan(0.25) });
  // Mid-ramp, not at the spawn: the ramp starts at z = 0, so backing away
  // from the spawn would immediately land on the flat surround.
  euc.reset({ position: { x: 0, y: 0, z: 200 }, headingY: 0 });
  const input = actions({ throttle: -1 });
  for (let i = 0; i < SECONDS(4); i += 1) euc.step(STEP, input);
  const backing = euc.snapshot();

  assert.ok(backing.reversing, 'reverse engaged on the hill');
  assert.ok(backing.speed < -1, `rolling backwards at ${backing.speed}`);
  assert.ok(
    backing.riderPitch > 0.02,
    `rider pitch ${backing.riderPitch} should lean toward the hill while backing down`,
  );
});

// ---------------------------------------------------------------------------
// The stopped rest stance
// ---------------------------------------------------------------------------

test('a genuinely stopped rider settles into the rest stance, and steps out of it fast', () => {
  // An EUC cannot stand on its own, so a stopped rider grounds a foot. The
  // blend is presentation only — the state stays `mounted` and nothing about
  // pulling away is gated on it.
  const euc = controller();
  assert.equal(euc.snapshot().restFactor, 0, 'a fresh spawn is not yet resting');

  ride(euc, SECONDS(EUC.restDelaySeconds + 4 * EUC.restResponseSeconds), {});
  const rested = euc.snapshot();
  assert.equal(rested.state, 'mounted');
  assert.ok(rested.restFactor > 0.9, `rest blend ${rested.restFactor} after the dwell`);

  // Input returns: the boot is back on the pedal well inside half a second,
  // and the wheel is already moving — rest never delays the ride.
  const away = ride(euc, SECONDS(0.5), { throttle: 1 });
  assert.ok(away.restFactor < 0.1, `rest blend ${away.restFactor} after pulling away`);
  assert.ok(away.speed > 0.5, 'the wheel pulled away regardless of the stance');
});

test('the rest stance never engages while the rider is asking for anything', () => {
  // Steering pivots the wheel on the spot at a standstill, and the reverse
  // dwell is a held backward request — both keep boots on the pedals.
  const pivoting = controller();
  ride(pivoting, SECONDS(3), { steer: 1 });
  assert.equal(pivoting.snapshot().restFactor, 0, 'pivoting on the spot is not resting');

  const askingBack = controller();
  // Two seconds of held lean-back: passes through the reverse dwell and into
  // actual reversing, none of which may read as a rest.
  ride(askingBack, SECONDS(2), { throttle: -1 });
  assert.equal(askingBack.snapshot().restFactor, 0, 'the reverse request is not resting');

  // And riding at speed obviously is not, even with the input released.
  const coasting = controller();
  ride(coasting, SECONDS(3), { throttle: 1 });
  const midCoast = ride(coasting, SECONDS(0.4), {});
  assert.equal(midCoast.restFactor, 0, 'coasting is not resting');
});

test('reset abandons the rest stance immediately', () => {
  const euc = controller();
  ride(euc, SECONDS(3), {});
  assert.ok(euc.snapshot().restFactor > 0.9);
  euc.reset();
  assert.equal(euc.snapshot().restFactor, 0);
});

test('leaving the authored course lands on the surround, not in a void', () => {
  // The M2 sampler answered an off-plan probe with the spawn height, which kept
  // the rider upright on an invisible continuation of nothing. The plan now has
  // a real outside.
  const plan = buildLevelPlan(
    [{ id: 'strip', length: 30, halfWidth: 4, surface: 'pavement', shoulder: 2 }],
    {
      id: 'strip',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
      spacing: 2,
    },
  );

  const euc = controller({ plan });
  const gone = ride(euc, SECONDS(20), { throttle: 1 });

  assert.equal(gone.offCourse, true, 'expected to have left the strip');
  assert.equal(gone.surface, 'grass');
  assert.equal(gone.position.y, 0, 'and to still be on ground');
  assert.equal(gone.grounded, true);
});

test('the step-up ceiling is derived from the wheel, not written down', () => {
  // master §6.1's rule, applied to the one clearance M4 owns. If the wheel's
  // pedal height changes, this moves with it — which is the entire point.
  const euc = controller();
  assert.equal(euc.tuning.maxStepUp, WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor);
  assert.ok(
    euc.tuning.maxStepUp > 0.15 && euc.tuning.maxStepUp < 0.3,
    `a 0.15 m kerb and a 0.30 m ledge must fall either side of ${euc.tuning.maxStepUp}`,
  );
});

// ---------------------------------------------------------------------------
// Hop, air, landing, pedal strike (M5)
// ---------------------------------------------------------------------------

/**
 * Ride until the wheel touches down, or give up. Returns the peak height it
 * reached above the ground on the way.
 */
function flyUntilLanded(
  euc: EucController,
  held: Partial<ActionSnapshot> = {},
  limitSteps = 2000,
): { apex: number; airSteps: number; snapshot: EucSnapshot } {
  const input = actions(held);
  const landingsBefore = euc.snapshot().landings;
  let apex = 0;
  let airSteps = 0;
  for (let i = 0; i < limitSteps; i += 1) {
    euc.step(STEP, input);
    const snapshot = euc.snapshot();
    if (!snapshot.grounded) {
      airSteps += 1;
      apex = Math.max(apex, snapshot.airHeight);
    }
    if (snapshot.landings > landingsBefore) {
      return { apex, airSteps, snapshot };
    }
  }
  return { apex, airSteps, snapshot: euc.snapshot() };
}

/** One hop, pressed on a single step exactly as `app/Game.ts` delivers it. */
function pressHop(euc: EucController, held: Partial<ActionSnapshot> = {}): void {
  euc.step(STEP, actions({ ...held, hop: true }));
}

test('nothing about the flat-pavement ride changed when the wheel learned to leave it', () => {
  // The whole M5 gate, in one assertion. Every airborne branch is behind a
  // state only a hop or a ledge can enter, so a rider who never presses Space
  // on flat ground must get the controller the owner accepted at M2.
  const euc = controller();
  const cruising = ride(euc, SECONDS(12), { throttle: 1 });

  assert.equal(cruising.grounded, true);
  assert.equal(cruising.state, 'rolling');
  assert.equal(cruising.landings, 0, 'no landing without a flight');
  assert.equal(cruising.hops, 0);
  assert.equal(cruising.pedalStrike, 0, 'straight-line riding never scrapes');
  assert.equal(cruising.position.y, 0);
  assert.equal(cruising.landingQuality, 'none', 'and no landing has been scored');
  // The number M2 settled, M4 preserved and M16 moved deliberately: drag
  // balances drive near 22.3 m/s, which is the 50 mph the owner asked for.
  assert.ok(
    cruising.speed > 22.0 && cruising.speed < 22.4,
    `top speed drifted to ${cruising.speed}`,
  );
});

test('a hop compresses first, then leaves the ground', () => {
  // docs/PLANS.md §4.4: "Press → ~90 ms Compressing (rider visibly crouches)
  // → impulse." The dwell is the preload, not input latency.
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });

  pressHop(euc, { throttle: 1 });
  const pressed = euc.snapshot();
  assert.equal(pressed.state, 'compressing', 'the press starts a compression');
  assert.equal(pressed.grounded, true, 'and the wheel is still on the ground');

  // Halfway through the dwell, still down.
  ride(euc, Math.floor(SECONDS(EUC.hopCompressSeconds) / 2), { throttle: 1 });
  assert.equal(euc.snapshot().grounded, true, 'still compressing at half the dwell');

  // Past it, in the air.
  ride(euc, SECONDS(EUC.hopCompressSeconds), { throttle: 1 });
  const flying = euc.snapshot();
  assert.equal(flying.grounded, false);
  assert.equal(flying.state, 'airborne');
  assert.equal(flying.hops, 1);
  assert.ok(flying.verticalVelocity > 0, 'and rising');
});

test('the hop reaches the height its launch speed says it should', () => {
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });
  pressHop(euc, { throttle: 1 });
  const { apex, airSteps } = flyUntilLanded(euc, { throttle: 1 });

  // v^2 / 2g, the whole of ballistics. A couple of per cent under, because the
  // apex is sampled at 120 Hz and lands either side of the true peak.
  const expected = EUC.hopLaunchSpeed ** 2 / (2 * PHYSICS.gravity);
  assert.ok(
    Math.abs(apex - expected) < 0.02,
    `apex ${apex} should be about ${expected}`,
  );
  // And the air time: 2v/g, which is what the player actually perceives.
  const expectedAirTime = (2 * EUC.hopLaunchSpeed) / PHYSICS.gravity;
  const airTime = airSteps * STEP;
  assert.ok(
    Math.abs(airTime - expectedAirTime) < 0.05,
    `air time ${airTime} should be about ${expectedAirTime}`,
  );
  // Comfortably over the 0.15 m kerb of docs/PLANS.md §6 beat 3, which is the
  // whole reason the number is what it is.
  assert.ok(apex > 0.30, `a ${apex} m hop does not clear a kerb with confidence`);
});

test('a held crouch buys the height the plan promises, and it is a HEIGHT', () => {
  // §4.4: "Holding crouch beforehand adds up to 40% height". Height goes as
  // the square of launch speed, so a bonus applied to the velocity would
  // deliver 96% and the constant would stop meaning what the plan says.
  const plain = controller();
  ride(plain, SECONDS(3), { throttle: 1 });
  pressHop(plain, { throttle: 1 });
  const uncharged = flyUntilLanded(plain, { throttle: 1 }).apex;

  const charged = controller();
  ride(charged, SECONDS(3), { throttle: 1 });
  ride(charged, SECONDS(EUC.hopChargeSeconds + 0.1), { throttle: 1, crouch: true });
  pressHop(charged, { throttle: 1, crouch: true });
  const boosted = flyUntilLanded(charged, { throttle: 1 }).apex;

  const ratio = boosted / uncharged;
  assert.ok(
    Math.abs(ratio - (1 + EUC.hopChargeHeightBonus)) < 0.03,
    `a full charge gave ${ratio}x the height, not ${1 + EUC.hopChargeHeightBonus}x`,
  );
});

test('a partial crouch buys a partial bonus, and letting go spends it', () => {
  const half = controller();
  ride(half, SECONDS(3), { throttle: 1 });
  ride(half, SECONDS(EUC.hopChargeSeconds / 2), { throttle: 1, crouch: true });
  const armed = half.snapshot();
  assert.ok(
    Math.abs(armed.crouchCharge - 0.5) < 0.05,
    `half the hold should be about half the charge, not ${armed.crouchCharge}`,
  );

  // Releasing crouch drops the charge outright: the bonus is for setting up,
  // not for having once thought about it.
  ride(half, SECONDS(0.2), { throttle: 1 });
  assert.equal(half.snapshot().crouchCharge, 0, 'releasing crouch spends the charge');
});

test('letting go of crouch in the same step as the press still buys the bonus', () => {
  // A player who mashes both and lets go of both has jumped, not stood up.
  // Reading the charge after the release bookkeeping gave them an uncharged
  // hop at random, which is the difference between a demanding mechanic and a
  // broken one.
  const together = controller();
  ride(together, SECONDS(3), { throttle: 1 });
  ride(together, SECONDS(EUC.hopChargeSeconds + 0.1), { throttle: 1, crouch: true });
  // Crouch already released on the very step the hop arrives.
  pressHop(together, { throttle: 1, crouch: false });
  const withRelease = flyUntilLanded(together, { throttle: 1 }).apex;

  const held = controller();
  ride(held, SECONDS(3), { throttle: 1 });
  ride(held, SECONDS(EUC.hopChargeSeconds + 0.1), { throttle: 1, crouch: true });
  pressHop(held, { throttle: 1, crouch: true });
  const withHold = flyUntilLanded(held, { throttle: 1 }).apex;

  assert.ok(
    Math.abs(withRelease - withHold) < 0.005,
    `same-step release lost the bonus: ${withRelease} against ${withHold}`,
  );

  // And standing up first genuinely does spend it, which is the design.
  const stoodUp = controller();
  ride(stoodUp, SECONDS(3), { throttle: 1 });
  ride(stoodUp, SECONDS(EUC.hopChargeSeconds + 0.1), { throttle: 1, crouch: true });
  ride(stoodUp, SECONDS(0.3), { throttle: 1 });
  pressHop(stoodUp, { throttle: 1 });
  const uncharged = flyUntilLanded(stoodUp, { throttle: 1 }).apex;
  assert.ok(uncharged < withHold - 0.05, 'standing up first must spend the preload');
});

test('the hop is one press, however long the key is held', () => {
  // `app/Game.ts` claims the one-shot exactly once per press and hands the
  // controller the snapshot taken before the claim, so `actions.hop` is true on
  // exactly one step. This asserts the controller's half of that contract: a
  // hop flag left true forever must not machine-gun.
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });
  const stuck = actions({ throttle: 1, hop: true });
  for (let i = 0; i < SECONDS(4); i += 1) euc.step(STEP, stuck);
  assert.equal(euc.snapshot().hops, 1, 'a held hop flag produced more than one hop');
});

test('there is no second hop in the air', () => {
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });
  pressHop(euc, { throttle: 1 });
  ride(euc, SECONDS(EUC.hopCompressSeconds + 0.05), { throttle: 1 });
  assert.equal(euc.snapshot().grounded, false);

  pressHop(euc, { throttle: 1 });
  assert.equal(euc.snapshot().hops, 1, 'a hop fired while airborne');
  assert.equal(euc.snapshot().state, 'airborne');
});

test('the wheel does not accelerate, brake, or reverse in the air', () => {
  // §4.4: gravity plus limited yaw. Nothing else. A throttle that worked in
  // flight would make every jump a launch pad and would make take-off choices
  // meaningless.
  const euc = controller();
  ride(euc, SECONDS(6), { throttle: 1 });
  const cruise = euc.snapshot().speed;

  pressHop(euc);
  ride(euc, SECONDS(EUC.hopCompressSeconds + 0.05), {});
  const launched = euc.snapshot().speed;

  // Full throttle for the flight cannot make it faster than it left at.
  const flight = flyUntilLanded(euc, { throttle: 1 });
  assert.ok(
    flight.snapshot.speed <= launched + 1e-9,
    `the wheel gained speed in the air: ${launched} -> ${flight.snapshot.speed}`,
  );

  // And full brake cannot stop it, either.
  const braked = controller();
  ride(braked, SECONDS(6), { throttle: 1 });
  pressHop(braked);
  ride(braked, SECONDS(EUC.hopCompressSeconds + 0.05), {});
  const beforeBrake = braked.snapshot().speed;
  ride(braked, SECONDS(0.2), { throttle: -1 });
  const braking = braked.snapshot();
  assert.equal(braking.state, 'airborne', 'braking in the air is not braking');
  assert.ok(
    braking.speed > beforeBrake * 0.9,
    `the brake bit in the air: ${beforeBrake} -> ${braking.speed}`,
  );
  assert.ok(cruise > 10, 'sanity: the fixture actually got up to speed');
});

test('air steering turns the wheel and does not turn the trajectory', () => {
  // The heart of §4.4: "velocity direction is never steerable in the air —
  // takeoff choices must matter." The heading moves; the path does not.
  //
  // **The steering has to start after take-off, not before it.** The 90 ms
  // compression is time spent *on the ground* with full steering authority, so
  // a spec that holds the key from the press onward curves the approach and
  // then measures the curve it caused — which is how this test failed the
  // first time it was written.
  const launched = (): EucController => {
    const euc = controller();
    ride(euc, SECONDS(5), { throttle: 1 });
    pressHop(euc);
    ride(euc, SECONDS(EUC.hopCompressSeconds) + 2, {});
    assert.equal(euc.snapshot().grounded, false, 'sanity: airborne before steering');
    return euc;
  };

  const straight = launched();
  const straightStart = straight.snapshot().position.x;
  const straightFlight = flyUntilLanded(straight, {});
  const straightDrift = straightFlight.snapshot.position.x - straightStart;

  const steered = launched();
  const steeredStart = steered.snapshot().position.x;
  const steeredFlight = flyUntilLanded(steered, { steer: 1 });
  const steeredDrift = steeredFlight.snapshot.position.x - steeredStart;

  assert.ok(
    Math.abs(steeredDrift - straightDrift) < 0.001,
    `full air steering moved the landing sideways by ${steeredDrift - straightDrift} m`,
  );
  assert.ok(
    steeredFlight.snapshot.landingMisalignment > 0.05,
    'but it must have changed which way the wheel is pointing',
  );
});

test('air yaw authority is a quarter of the ground rate', () => {
  const euc = controller();
  ride(euc, SECONDS(8), { throttle: 1 });
  const groundRate = Math.abs(ride(euc, SECONDS(1), { throttle: 1, steer: 1 }).yawRate);

  const flier = controller();
  ride(flier, SECONDS(8), { throttle: 1 });
  pressHop(flier);
  ride(flier, SECONDS(EUC.hopCompressSeconds + 0.05), {});
  const airRate = Math.abs(ride(flier, SECONDS(0.05), { steer: 1 }).yawRate);

  assert.ok(flier.snapshot().grounded === false, 'sanity: still in the air');
  // The ground rate is throttled by the lateral clamp and the air rate is not,
  // so this compares the raw authority rather than the achieved rate.
  const requested = EUC.yawRateHigh * EUC.airYawFactor;
  assert.ok(
    Math.abs(airRate - requested) < 0.02,
    `air yaw was ${airRate}, expected about ${requested}`,
  );
  assert.ok(groundRate > 0, 'sanity: the ground turns at all');
});

test('a clean landing costs nothing and a misaligned one costs geometry', () => {
  const clean = controller();
  ride(clean, SECONDS(5), { throttle: 1 });
  pressHop(clean);
  const straight = flyUntilLanded(clean, {});
  assert.equal(straight.snapshot.landingQuality, 'clean');
  assert.equal(straight.snapshot.landingSpeedLoss, 0, 'a clean landing is free');
  assert.ok(straight.snapshot.landingMisalignment < 1e-9);

  const crooked = controller();
  ride(crooked, SECONDS(5), { throttle: 1 });
  pressHop(crooked);
  const turned = flyUntilLanded(crooked, { steer: 1 });
  assert.ok(turned.snapshot.landingMisalignment > 0.05);
  // The across-track component is simply scrubbed, which is the geometry
  // half of the cost and happens before any score is charged.
  assert.ok(
    turned.snapshot.speed < straight.snapshot.speed,
    'landing sideways must cost speed',
  );
});

test('the landing score rises with impact, and its tiers are ordered', () => {
  // Driven through the hop's own launch speed, which is the only lever a test
  // has on impact without inventing a fixture with a cliff in it.
  const tiers: string[] = [];
  const scores: number[] = [];
  for (const drop of [0.5, 1.2, 2.5, 5, 9]) {
    const euc = controller({
      tuning: { hopLaunchSpeed: Math.sqrt(2 * PHYSICS.gravity * drop) },
    });
    pressHop(euc);
    const landed = flyUntilLanded(euc, {}, 4000).snapshot;
    tiers.push(landed.landingQuality);
    scores.push(landed.landingScore);
  }

  for (let i = 1; i < scores.length; i += 1) {
    assert.ok(scores[i] > scores[i - 1], 'a bigger drop must score higher');
  }
  assert.equal(tiers[0], 'clean', 'a half-metre drop is nothing');
  assert.ok(tiers.includes('heavy'), 'somewhere in there is a heavy landing');
  assert.ok(tiers.includes('wobble'), 'and somewhere is one bad enough to wobble');

  // **M5 scored these two tiers and deliberately declined to guess at what they
  // would do; M6 is the answer.** A landing in the `crash` tier now crashes
  // outright — the tier's whole name — rather than reporting a classification
  // and charging for it in speed. The `wobble` tier's half of the answer is
  // asserted in the M6 block below: it feeds the oscillator instead.
  const euc = controller({ tuning: { hopLaunchSpeed: 14 } });
  pressHop(euc);
  const hard = flyUntilLanded(euc, {}, 4000).snapshot;
  assert.equal(hard.landingQuality, 'crash');
  assert.equal(hard.state, 'crashing');
  assert.equal(hard.crashCause, 'landing');
});

test('a rougher surface makes the same landing worse', () => {
  const scoreOn = (surface: SurfaceId): number => {
    const euc = controller({ plan: flatPlan(surface) });
    pressHop(euc);
    return flyUntilLanded(euc, {}).snapshot.landingScore;
  };
  assert.ok(
    scoreOn('gravel') > scoreOn('pavement'),
    'landing on gravel must score worse than landing on pavement',
  );
});

test('a landing reads the surface touched down on, not the takeoff surface', () => {
  class TransitionSampler implements TerrainSampler {
    surface: SurfaceId = 'pavement';

    sampleGround(_x: number, _z: number, out: GroundSample): GroundSample {
      out.height = 0;
      out.normal.x = 0;
      out.normal.y = 1;
      out.normal.z = 0;
      out.surface = this.surface;
      out.offCourse = false;
      return out;
    }

    raycast(_origin: Vec3, _direction: Vec3, _maxDistance: number): number | null {
      return null;
    }
  }

  const landOn = (landingSurface: SurfaceId): EucSnapshot => {
    const sampler = new TransitionSampler();
    const euc = new EucController(sampler);
    rideToSpeed(euc, 10);
    pressHop(euc, { throttle: 1 });

    for (let i = 0; i < 400; i += 1) {
      const before = euc.snapshot();
      const nextFall = (-before.verticalVelocity + PHYSICS.gravity * STEP) * STEP;
      if (!before.grounded && before.verticalVelocity < 0 && before.airHeight <= nextFall) {
        // Change what the next ground query returns only on the touchdown
        // step. The response cached at the top of that step is still pavement;
        // the contact sample and authoritative surface are now the target.
        sampler.surface = landingSurface;
        euc.step(STEP, actions({ throttle: 1 }));
        const landed = euc.snapshot();
        assert.equal(landed.grounded, true, 'the selected step touched down');
        assert.equal(landed.surface, landingSurface);
        return landed;
      }
      euc.step(STEP, actions({ throttle: 1 }));
    }
    assert.fail('flight never reached its touchdown step');
  };

  const pavement = landOn('pavement');
  const gravel = landOn('gravel');
  const expectedSurfaceDelta = EUC.landingSurfaceWeight
    * ((SURFACES.gravel.roughnessAmplitude - SURFACES.pavement.roughnessAmplitude)
      / EUC.landingRoughnessReference);
  assert.ok(
    Math.abs((gravel.landingScore - pavement.landingScore) - expectedSurfaceDelta) < 1e-9,
    `a pavement takeoff onto gravel scored ${gravel.landingScore - pavement.landingScore}`
      + ` surface points instead of ${expectedSurfaceDelta}`,
  );
});

test('riding off a ledge launches, and riding down a hill does not', () => {
  // The same test that separates a kerb from a slope, in its negative form.
  const ledge = buildLevelPlan(
    [{
      id: 'run',
      length: 120,
      halfWidth: 12,
      surface: 'pavement',
      shoulder: 2,
      blocks: [{
        s: 20, t: 0, halfAlong: 20, halfLateral: 6, height: 0.4,
        surface: 'pavement', appearance: 'concrete',
      }],
    }],
    {
      id: 'ledge',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 1,
    },
  );

  const off = new EucController(new PlanTerrainSampler(ledge), {
    spawn: { position: { x: 0, y: 0, z: 20 }, headingY: 0 },
  });
  assert.equal(off.snapshot().position.y, 0.4, 'sanity: starts on top of the block');
  const flight = flyUntilLanded(off, { throttle: 1 }, 2000);
  assert.ok(flight.airSteps > 10, 'riding off a 0.4 m ledge must produce air');
  assert.equal(flight.snapshot.landings, 1);

  // And the hill, at every speed the wheel can reach, must not.
  for (const gradient of [0.1, 0.2, -0.1, -0.2]) {
    const hill = controller({ plan: rampPlan(gradient) });
    const ridden = ride(hill, SECONDS(20), { throttle: 1 });
    assert.equal(ridden.grounded, true, `a ${gradient} gradient launched the wheel`);
    assert.equal(ridden.landings, 0);
  }
});

test('pedal clearance is derived from the wheel, and grip decides who reaches it', () => {
  // The same rule as the step-up ceiling: the angle a pedal reaches the ground
  // at is a fact about where the pedals are.
  const euc = controller();
  const expected = Math.atan2(WHEEL.pedalHeight, WHEEL.pedalSpan / 2);
  assert.ok(
    Math.abs(euc.snapshot().pedalClearance - expected) < 1e-9,
    'pedal clearance must come from the pedal geometry',
  );
  // And from nothing else. The suspension is deliberately not a term: see the
  // note in `updatePedalStrike`. Riding gravel hard must not move it by so
  // much as a rounding error, at any point in the ride.
  const rough = controller({ plan: flatPlan('gravel') });
  const input = actions({ throttle: 1 });
  let travelSeen = 0;
  for (let i = 0; i < SECONDS(8); i += 1) {
    rough.step(STEP, input);
    const state = rough.snapshot();
    travelSeen = Math.max(travelSeen, Math.abs(state.suspensionOffset));
    assert.ok(Math.abs(state.pedalClearance - expected) < 1e-9);
  }
  assert.ok(travelSeen > 0.01, 'sanity: the suspension is genuinely working');

  // Pavement's lateral ceiling allows more lean than the pedals clear, so a
  // full-lock carve on a hard surface scrapes — §4.4's "learnable limit".
  const hard = controller();
  ride(hard, SECONDS(8), { throttle: 1 });
  const carving = ride(hard, SECONDS(4), { throttle: 1, steer: 1 });
  assert.ok(carving.pedalStrike !== 0, 'a full-lock carve on pavement must scrape');
  assert.equal(carving.state, 'pedalStrike');
  // Signed by the side that is down. Steering right is a negative yaw and a
  // negative roll, so the pedal on the ground is the one toward -X.
  assert.ok(carving.pedalStrike < 0, 'a right-hand carve scrapes the right pedal');

  // Grass caps the lean below clearance through its grip, so it never does.
  const soft = controller({ plan: flatPlan('grass') });
  ride(soft, SECONDS(12), { throttle: 1 });
  const grassCarve = ride(soft, SECONDS(4), { throttle: 1, steer: 1 });
  assert.equal(grassCarve.pedalStrike, 0, 'grass must never reach pedal clearance');
  assert.ok(Math.abs(grassCarve.rollAngle) > 0.3, 'sanity: it is genuinely carving');

  // And the grace angle: a carve past the *geometric* clearance but inside
  // the grace margin does not strike, because the strike is saved for
  // genuinely hard carves — owner, 2026-08-04: "not every basic turn like it
  // is now". A partial steer still saturates the lateral clamp, so the lean
  // is placed inside the window through the clamp itself: atan(0.65) ≈ 0.576
  // rad sits past the 0.552 rad clearance and short of the 0.607 rad onset.
  const firm = controller({ tuning: { maxLateralG: 0.65 } });
  ride(firm, SECONDS(8), { throttle: 1 });
  const firmCarve = ride(firm, SECONDS(4), { throttle: 1, steer: 1 });
  assert.ok(
    Math.abs(firmCarve.rollAngle) > firmCarve.pedalClearance,
    `sanity: the carve reaches past the geometric clearance, at ${firmCarve.rollAngle}`,
  );
  assert.equal(
    firmCarve.pedalStrike,
    0,
    `a carve inside the grace angle must not scrape (roll ${firmCarve.rollAngle})`,
  );
});

test('a scrape costs speed in proportion to how deep it is', () => {
  const carveSpeed = (decel: number): number => {
    const euc = controller({ tuning: { pedalStrikeDecel: decel } });
    ride(euc, SECONDS(8), { throttle: 1 });
    return ride(euc, SECONDS(8), { throttle: 1, steer: 1 }).speed;
  };
  const free = carveSpeed(0);
  const scraping = carveSpeed(EUC.pedalStrikeDecel);
  assert.ok(scraping < free - 1, `a scrape must cost real speed: ${free} -> ${scraping}`);
  // Bounded on purpose: a limit meant to be learned has to leave the rider
  // enough speed to notice they learned something.
  assert.ok(
    scraping > free * 0.8,
    `a scrape took ${((1 - scraping / free) * 100).toFixed(0)}% of the carve`,
  );
});

test('a scrape does not mask the fact that the rider is braking', () => {
  // The state enum says what the rider is *doing*; the scrape is a condition
  // they are in and has its own signed field. Letting the condition win lost
  // information for nothing, which is why braking outranks it.
  const euc = controller();
  ride(euc, SECONDS(8), { throttle: 1 });
  const scraping = ride(euc, SECONDS(2), { throttle: 1, steer: 1 });
  assert.equal(scraping.state, 'pedalStrike', 'a scraping carve says so');

  const braking = ride(euc, SECONDS(0.4), { throttle: -1, steer: 1 });
  assert.ok(braking.pedalStrike !== 0, 'sanity: still scraping');
  assert.equal(braking.state, 'braking', 'but braking is what the rider is doing');
});

test('the scrape band opens gradually rather than at a cliff', () => {
  // A limit the rider can learn has to be approachable: there is a range of
  // steering the wheel takes cleanly, and past it the pedal touches down.
  //
  // **The band is a function of speed, and M16 made that visible.** A scrape is
  // the lean reaching the pedal's clearance angle, the lean is the cornering
  // force, and the force is `speed × yaw` — so the faster the approach, the
  // less lock it takes. At the M2 top speed the first input to touch down was
  // half lock; at the M16 top speed it is a little under four tenths. Both are
  // the same rule, and stating the speed is what keeps the test about the rule
  // rather than about a number that moves with the drag coefficient.
  const depthAtLock = (lock: number): number => {
    const euc = controller();
    ride(euc, SECONDS(12), { throttle: 1 });
    return Math.abs(ride(euc, SECONDS(5), { throttle: 1, steer: lock }).pedalStrike);
  };
  assert.equal(depthAtLock(0.2), 0, 'a fifth of lock is clear at top speed');
  assert.equal(depthAtLock(0.3), 0, 'and so is three tenths');
  assert.ok(depthAtLock(0.5) > 0, 'half lock scrapes');
  assert.ok(depthAtLock(1) >= depthAtLock(0.5), 'and full lock scrapes at least as hard');
});

test('the compression preloads the suspension and the launch releases it', () => {
  // "Suspension compresses, tire loads" then "suspension rebounds, tire leaves
  // ground" (EUC_RIDER_MOTION_REFERENCE.md §12.1, §12.2), both out of the
  // damper that already existed rather than animated over the top of it.
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });
  const level = euc.snapshot().suspensionOffset;

  pressHop(euc, { throttle: 1 });
  ride(euc, Math.max(1, SECONDS(EUC.hopCompressSeconds) - 2), { throttle: 1 });
  const loaded = euc.snapshot().suspensionOffset;
  assert.ok(loaded < level - 0.005, `the preload did not compress: ${level} -> ${loaded}`);

  ride(euc, SECONDS(EUC.hopCompressSeconds + 0.08), { throttle: 1 });
  const airborneOffset = euc.snapshot();
  assert.equal(airborneOffset.grounded, false);
  assert.ok(
    airborneOffset.suspensionOffset > loaded,
    'and it did not rebound on the way out',
  );
});

test('the rider compresses for the hop, tucks in the air, and absorbs the landing', () => {
  const euc = controller();
  const pose = createPose();
  ride(euc, SECONDS(3), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(pose.crouch < 0.05, 'riding along is not a crouch');

  pressHop(euc, { throttle: 1 });
  ride(euc, Math.max(1, SECONDS(EUC.hopCompressSeconds) - 2), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(pose.crouch > 0.4, `the preload must be visible, not ${pose.crouch}`);

  ride(euc, SECONDS(0.25), { throttle: 1 });
  euc.writePose(pose);
  assert.equal(euc.snapshot().grounded, false);
  assert.ok(
    pose.crouch > 0.1 && pose.crouch < 0.6,
    `the air tuck is partial, not ${pose.crouch}`,
  );

  const landed = flyUntilLanded(euc, { throttle: 1 });
  assert.equal(landed.snapshot.grounded, true);
  euc.writePose(pose);
  assert.ok(pose.crouch > 0.2, `the landing must be absorbed, not ${pose.crouch}`);
});

test('a held crouch is its own pose, and only a held crouch reaches it', () => {
  // **M8.6, from the owner's ride: "crouching doesn't really crouch that
  // much".** `crouch` above is one depth for three causes — preload, air tuck,
  // landing absorb — and all three are knee events with the torso where it
  // was. `tuck` is the fourth thing, and the one the owner meant: the whole
  // body folding down over the wheel, with the torso hinged and the arms drawn
  // back. It must reach *full* on a held crouch, because 55% of a shallow drop
  // is what he could not see, and it must be exactly zero for the other three,
  // because a rider absorbing a landing does not bow.
  const euc = controller();
  const pose = createPose();

  ride(euc, SECONDS(3), { throttle: 1 });
  euc.writePose(pose);
  assert.equal(pose.tuck, 0, 'riding along is not a tuck');

  ride(euc, SECONDS(0.5), { throttle: 1, crouch: true });
  euc.writePose(pose);
  assert.ok(pose.tuck > 0.95, `a held crouch must go all the way, not ${pose.tuck}`);
  // And the compression it shares a button with is still its own, shallower
  // number — the suspension preload reads that one and must not have moved.
  assert.ok(
    Math.abs(pose.crouch - EUC.crouchHeldAmount) < 0.02,
    `the held compression changed to ${pose.crouch}`,
  );

  // Released: back to nothing, quickly.
  ride(euc, SECONDS(0.5), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(pose.tuck < 0.02, `letting go must stand the rider up, not ${pose.tuck}`);

  // The hop's own compression is not a tuck, even though it drives `crouch` to
  // full. A fresh controller, and the hop pressed without ever holding crouch,
  // so `tuck` is exactly zero rather than a decayed remnant — an assertion of
  // exact zero is what proves the two scalars are genuinely independent, where
  // a tolerance would also pass on a leak that merely faded.
  const hopper = controller();
  ride(hopper, SECONDS(3), { throttle: 1 });
  pressHop(hopper, { throttle: 1 });
  ride(hopper, Math.max(1, SECONDS(EUC.hopCompressSeconds) - 2), { throttle: 1 });
  hopper.writePose(pose);
  assert.ok(pose.crouch > 0.4, `the preload must still be visible, not ${pose.crouch}`);
  assert.equal(pose.tuck, 0, 'the hop preload folded the rider over');

  // Nor is the air tuck, nor the landing absorb.
  ride(hopper, SECONDS(0.25), { throttle: 1 });
  assert.equal(hopper.snapshot().grounded, false);
  hopper.writePose(pose);
  assert.equal(pose.tuck, 0, 'the air tuck folded the rider over');

  const landed = flyUntilLanded(hopper, { throttle: 1 });
  assert.equal(landed.snapshot.grounded, true);
  hopper.writePose(pose);
  assert.ok(pose.crouch > 0.2, 'the landing must still be absorbed');
  assert.equal(pose.tuck, 0, 'the landing absorb folded the rider over');
});

test('a charged hop keeps the held tuck through its ground preload', () => {
  // The preload is a separate source for `crouch`, but it does not release the
  // Shift key and it does not leave the ground. The presentation-only tuck must
  // therefore compose with it until takeoff rather than unfolding for the
  // 90 ms compression immediately before the hop.
  const euc = controller();
  const pose = createPose();
  ride(euc, SECONDS(3), { throttle: 1 });
  ride(euc, SECONDS(0.5), { throttle: 1, crouch: true });
  euc.writePose(pose);
  assert.ok(pose.tuck > 0.95, `the charged rider never reached the tuck: ${pose.tuck}`);

  pressHop(euc, { throttle: 1, crouch: true });
  ride(
    euc,
    Math.max(1, SECONDS(EUC.hopCompressSeconds) - 2),
    { throttle: 1, crouch: true },
  );
  euc.writePose(pose);
  assert.equal(euc.snapshot().grounded, true, 'the assertion missed the ground preload');
  assert.ok(pose.crouch > 0.4, `the hop preload did not compress: ${pose.crouch}`);
  assert.ok(pose.tuck > 0.95, `the held tuck unfolded during preload: ${pose.tuck}`);
});

test('the ground tuck eases away in air and returns on touchdown', () => {
  // Holding crouch through a flight is a real thing a player does — it is how
  // the next hop gets charged. The held ground tuck now correctly survives the
  // preload, then eases away after takeoff so the M5 air tuck owns the pose. It
  // returns only when the wheel and the held input are both back on the ground.
  const euc = controller();
  const pose = createPose();
  ride(euc, SECONDS(3), { throttle: 1 });
  pressHop(euc, { throttle: 1, crouch: true });
  ride(euc, SECONDS(0.3), { throttle: 1, crouch: true });
  assert.equal(euc.snapshot().grounded, false);
  euc.writePose(pose);
  assert.ok(pose.tuck < 0.05, `the ground tuck persisted in the air: ${pose.tuck}`);

  flyUntilLanded(euc, { throttle: 1, crouch: true });
  ride(euc, SECONDS(0.5), { throttle: 1, crouch: true });
  euc.writePose(pose);
  assert.ok(pose.tuck > 0.95, `landing back onto a held crouch must fold, not ${pose.tuck}`);
});

test('the wheel and the rider pitch together in the air and separately on the ground', () => {
  // On the ground the firmware holds the pedals level and the wheel takes only
  // a fraction of the rider's hinge; in the air nothing holds anything level,
  // so the whole rig sets its attitude together.
  //
  // Not instantly, and deliberately: the ground action pose decays on its own
  // 0.08 s constant rather than being cut at take-off, because a wheel that
  // snapped from its 0.45 share to the full pitch the moment it left the
  // ground would pop out of every hard-accelerating hop.
  const euc = controller();
  ride(euc, SECONDS(4), { throttle: 1 });
  const grounded = euc.snapshot();
  assert.ok(
    Math.abs(grounded.wheelPitch) < Math.abs(grounded.riderPitch),
    'on the ground the pedals stay closer to level than the rider does',
  );

  pressHop(euc);
  ride(euc, SECONDS(EUC.hopCompressSeconds + 0.35), { throttle: 1 });
  const rising = euc.snapshot();
  assert.equal(rising.grounded, false);
  assert.ok(
    Math.abs(rising.wheelPitch - rising.riderPitch) < 0.01,
    `in the air they converge: wheel ${rising.wheelPitch}, rider ${rising.riderPitch}`,
  );
  assert.ok(rising.wheelPitch > 0.02, 'and the throttle sets a real attitude');
});

test('a reset in mid-air puts the rider back on the ground', () => {
  // Quick reset is also M6's crash recovery and M10's checkpoint respawn. A
  // respawn that inherited a flight would drop the rider out of the sky.
  const euc = controller();
  ride(euc, SECONDS(3), { throttle: 1 });
  pressHop(euc);
  ride(euc, SECONDS(EUC.hopCompressSeconds + 0.1), {});
  assert.equal(euc.snapshot().grounded, false);

  euc.reset();
  const back = euc.snapshot();
  assert.equal(back.grounded, true);
  assert.equal(back.position.y, 0);
  assert.equal(back.state, 'mounted');
  assert.equal(back.hops, 0);
  assert.equal(back.landings, 0);
  assert.equal(back.landingQuality, 'none');
  assert.equal(back.airTime, 0);
});

// ---------------------------------------------------------------------------
// Wobble, power, crash, recovery — M6
// ---------------------------------------------------------------------------

/** Hold an input until a predicate holds, and report where that got to. */
function rideUntil(
  euc: EucController,
  held: Partial<ActionSnapshot>,
  done: (snapshot: EucSnapshot) => boolean,
  limitSteps = 4000,
): { reached: boolean; steps: number; snapshot: EucSnapshot } {
  const input = actions(held);
  for (let i = 0; i < limitSteps; i += 1) {
    if (done(euc.snapshot())) return { reached: true, steps: i, snapshot: euc.snapshot() };
    euc.step(STEP, input);
  }
  return { reached: done(euc.snapshot()), steps: limitSteps, snapshot: euc.snapshot() };
}

/**
 * Ride until the rider comes off, the way M13's hazards will do it.
 *
 * **After M13 there is no riding *input* that can crash you on open ground, and
 * that is the design.** M6's version of this helper sawed the steering at a
 * quarter-second cadence, because a reversed carve was then the cheapest way to
 * reach the crash funnel. The owner's §13 q8 answer removed that trigger by
 * name — carving is the thing he enjoys, so it cannot be the thing that ends
 * his run — and the saw now correctly does nothing at all.
 *
 * What stands in is the shipped diagnostic probe, at the energy a deep pothole
 * delivers. **It stays the probe now that Phase 1 has built real hazards, and
 * that is deliberate**: every caller of this helper is testing the *wobble*
 * crash funnel — the oscillator running away, and what the rider keeps when it
 * does. A real deep pothole reaches a different funnel with a different cause
 * (`'hazard'`, tested in its own section below), so swapping it in here would
 * quietly redirect a dozen assertions to a mechanic they were not written
 * about. The probe provokes the crash through the same `injectWobble` door a
 * spill and a shallow hole use, and because it counts *ground covered* on the
 * fixed step rather than seconds on a clock, it lands on the same step every
 * run.
 */
function crashOnHazard(euc: EucController, limitSeconds = 40): EucSnapshot {
  euc.setTuning({ wobbleMasterGain: 1, wobbleProbeMetres: 12, wobbleProbeEnergy: 1 });
  const steps = SECONDS(limitSeconds);
  for (let i = 0; i < steps; i += 1) {
    if (euc.snapshot().crashed) break;
    euc.step(STEP, actions({ throttle: 1 }));
  }
  return euc.snapshot();
}

/**
 * Put a hazard-shaped wobble into a rider who is already up to speed.
 *
 * **After M13 no riding input starts one**, so every test that needs a live
 * oscillator has to inject what a spill or a shallow pothole will inject at
 * Phase 1. It goes through the shipped diagnostic probe rather than a private
 * hook, so these tests stay pointed at the same door the game uses — a test
 * that reaches past the gate would keep passing after the gate broke.
 */
function wobbleFrom(euc: EucController, energy = 0.55, seconds = 8): EucSnapshot {
  ride(euc, SECONDS(seconds), { throttle: 1 });
  euc.setTuning({ wobbleProbeMetres: 0.01, wobbleProbeEnergy: energy });
  ride(euc, 1, { throttle: 1 });
  euc.setTuning({ wobbleProbeMetres: 0 });
  // One impulse, then long enough for the automatic foot correction to engage
  // on its own 0.12 s response — a snapshot taken on the impact step would show
  // the energy but none of the rider's answer to it.
  return ride(euc, SECONDS(0.25), { throttle: 1 });
}

test('nothing about the flat-pavement ride changed when the wheel learned to lose it', () => {
  // The M6 gate, and the same claim M4 and M5 each had to make in turn. Every
  // consequence this milestone adds is gated on something flat pavement does
  // not produce: it injects no wobble at any speed, the wobble comfort speed is
  // above what the wheel can reach there under its own power, and flat-out
  // riding sits two thirds of the way up a ladder whose only mechanical rung is
  // at the top. A rider going straight must get the controller M2 accepted.
  const euc = controller();
  const cruising = ride(euc, SECONDS(12), { throttle: 1 });

  assert.equal(cruising.state, 'rolling');
  assert.equal(cruising.wobbleEnergy, 0, 'pavement injects nothing at any speed');
  assert.equal(cruising.wobbleYaw, 0, 'so the wheel travels dead straight');
  assert.equal(cruising.wobbleRoll, 0, 'and the machine stays upright');
  assert.equal(cruising.tiltBack, 0, 'and the throttle is still answering');
  assert.equal(cruising.crashes, 0);
  assert.equal(cruising.crashCause, 'none');
  assert.ok(cruising.speed > 22.0 && cruising.speed < 22.4, `topped out at ${cruising.speed}`);
  // The ladder is *live* on the flat — it reaches its first rung near top speed,
  // which is the wheel warning about its own limit and costs nothing. What it
  // must not reach is the rung that takes the throttle away.
  assert.equal(cruising.powerStage, 'notice');
  assert.ok(
    cruising.loadFactor < EUC.powerWarnLoad,
    `flat-out is ${cruising.loadFactor}, which must stay below the amber rung`,
  );
});

test('ordinary rough ground no longer feeds the oscillator, and still feels rough', () => {
  // **M13 inverted this test, and the inversion is the deliverable.** M6 let
  // the surface contribute energy so rough ground made a later mistake harder
  // to absorb. The owner's §13 q8 answer replaced the whole trigger set with
  // hazards, on the reasoning that a trigger must be something the rider can
  // see and choose to avoid — and the ground you picked is the opposite of
  // that. Choosing gravel is a texture decision again, not a risk one.
  const euc = controller({ plan: flatPlan('gravel') });
  const settled = ride(euc, SECONDS(20), { throttle: 1 });
  assert.equal(settled.wobbleEnergy, 0, 'gravel injects nothing at any speed');
  assert.equal(settled.wobbleYaw, 0, 'so the wheel travels dead straight over it');
  assert.equal(settled.wobbleRoll, 0, 'and carries no hidden tilt');
  assert.equal(settled.wobbleFootCorrection, 0);
  assert.equal(settled.state, 'rolling');
  assert.equal(settled.crashes, 0);

  // **The texture is untouched, and that distinction is the point.** M13 emptied
  // one column of the surface table and nothing else, so gravel still resists,
  // still grips less, and still shakes the suspension. A gravel that had
  // quietly stopped being lively underfoot would be a different regression
  // wearing this one's clothes, and only this half of the test would catch it.
  assert.equal(SURFACES.gravel.wobbleInjection, 0, 'the emptied column');
  assert.ok(
    SURFACES.gravel.roughnessAmplitude > SURFACES.pavement.roughnessAmplitude,
    'and the column that was left alone',
  );
  assert.ok(SURFACES.gravel.rollingResistance > SURFACES.pavement.rollingResistance);
  assert.ok(SURFACES.gravel.grip < SURFACES.pavement.grip);
});

test('a mistake triggers foot correction, and easing off stacks with it', () => {
  // **The claim survives M13; only the provocation changed.** This is the
  // milestone's "is the wobble fair to recover from?" spec, and it is the one
  // the owner's ride-gate turns on — so it is asserted against the energy a
  // hazard actually delivers rather than against a steering error that can no
  // longer produce any.
  const mistake = (euc: EucController): EucSnapshot => wobbleFrom(euc);

  const held = controller();
  const heldMistake = mistake(held);
  assert.equal(heldMistake.state, 'wobbling');
  assert.ok(heldMistake.wobbleFootCorrection > 0.4, 'the rider is adjusting their feet');
  const heldRecovery = ride(held, SECONDS(1), { throttle: 1 });
  assert.equal(heldRecovery.state, 'rolling', 'automatic correction makes the event brief');
  assert.ok(heldRecovery.wobbleEnergy < EUC.wobbleFootCorrectionStart);

  const eased = controller();
  mistake(eased);
  const easedRecovery = ride(eased, SECONDS(1), {});
  assert.ok(easedRecovery.wobbleSmoothness > 0.9, 'easing selects the high damping');
  assert.ok(
    easedRecovery.wobbleEnergy < heldRecovery.wobbleEnergy * 0.75,
    `easing ${easedRecovery.wobbleEnergy} against feet alone ${heldRecovery.wobbleEnergy}`,
  );
});

test('pavement never wobbles, however hard it is ridden', () => {
  const euc = controller();
  const flat = ride(euc, SECONDS(30), { throttle: 1 });
  assert.equal(flat.wobbleEnergy, 0);
  // **This assertion used to run the other way, and it was the rejected
  // mechanic written down as a requirement**: "though a full-lock carve scrapes
  // a pedal, and a scrape does feed it". A full-lock carve is the input the
  // owner named at §13 q8 as the one wobble must never punish, so inverting
  // this was M13's deliverable rather than collateral damage from it.
  const held = ride(euc, SECONDS(6), { throttle: 1, steer: 1 });
  assert.equal(held.wobbleEnergy, 0, 'carving is never a wobble trigger');
  // The scrape still happens and still has its own consequence — it costs speed
  // and it names the state. What it no longer does is reach the oscillator.
  assert.equal(held.state, 'pedalStrike', 'and the specific cause outranks the symptom');
});

test('no steering input can start a wobble, however violently it is reversed', () => {
  // **Two tests died here, and they were the best-argued tests in the file.**
  // M6 charged a reversal against the lean it threw away — slam the opposite
  // key at a committed carve and it cost half a crash, ease through neutral
  // first and it cost almost nothing — and a second test drove the input
  // exactly the way a keyboard does, through the 80-200 ms neutral gap human
  // fingers need, because the owner's playtest could not reproduce a wobble
  // that every script raised easily. Both were right about what they measured.
  //
  // They are gone because the owner settled what wobble is *for* at §13 q8: a
  // trigger has to be a situation the rider can see and choose to avoid, and
  // carving is the thing he enjoys. A reversal is an input, so it cannot be a
  // trigger, however skilful avoiding it would have been. What replaces them is
  // the same provocations asserting zero — kept rather than deleted outright,
  // because the cheapest way for this decision to be undone by accident is for
  // nothing to be watching the path it was removed from.
  const slam = controller();
  ride(slam, SECONDS(8), { throttle: 1 });
  ride(slam, SECONDS(1.5), { throttle: 1, steer: 1 });
  const slammed = ride(slam, SECONDS(0.1), { throttle: 1, steer: -1 }).wobbleEnergy;
  assert.equal(slammed, 0, 'the hardest reversal the input can express costs nothing');

  const ease = controller();
  ride(ease, SECONDS(8), { throttle: 1 });
  ride(ease, SECONDS(1.5), { throttle: 1, steer: 1 });
  ride(ease, SECONDS(0.6), { throttle: 1, steer: 0 });
  assert.equal(ride(ease, SECONDS(0.1), { throttle: 1, steer: -1 }).wobbleEnergy, 0);

  // Including through the neutral gaps a real keyboard leaves, which is the
  // shape the deleted regression test existed to cover.
  for (const gapSteps of [1, 3, 12, 24]) {
    const euc = controller();
    ride(euc, SECONDS(8), { throttle: 1 });
    ride(euc, SECONDS(1.5), { throttle: 1, steer: 1 });
    ride(euc, gapSteps, { throttle: 1, steer: 0 });
    let peak = 0;
    for (let i = 0; i < SECONDS(1); i += 1) {
      euc.step(STEP, actions({ throttle: 1, steer: -1 }));
      peak = Math.max(peak, euc.snapshot().wobbleEnergy);
    }
    assert.equal(peak, 0, `a ${gapSteps}-step gap is still not a trigger`);
  }
});

test('the weave starts at the first hundredth, with no dead band to cross', () => {
  // **The single thing the owner asked to have back.** M6 hid the oscillation
  // below `wobbleStateEnergy`, so a small wobble was a number on a snapshot and
  // nothing on screen; the direction recorded for the redesign was that the
  // pre-rework look — amplitude simply proportional to the energy — had been
  // right. This is that claim, asserted at the energy M6 would have rendered as
  // perfectly straight.
  const euc = controller();
  const small = wobbleFrom(euc, EUC.wobbleStateEnergy * 0.4);
  assert.ok(
    small.wobbleEnergy > 0 && small.wobbleEnergy < EUC.wobbleStateEnergy,
    `sanity: below the naming threshold at ${small.wobbleEnergy}`,
  );

  let peak = 0;
  let peakRoll = 0;
  for (let i = 0; i < SECONDS(0.5); i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    const sample = euc.snapshot();
    peak = Math.max(peak, Math.abs(sample.wobbleYaw));
    peakRoll = Math.max(peakRoll, Math.abs(sample.wobbleRoll));
  }
  assert.ok(peak > 0 && peakRoll > 0, 'a sub-threshold wobble moves both axes');

  // And the rider does *not* brace for it — one threshold, doing one job. This
  // is the half that stops "no dead band" from meaning "Cool Rider panics at
  // every pebble".
  assert.notEqual(small.state, 'wobbling', 'it is not an event yet');
  const pose = createPose();
  euc.writePose(pose);
  assert.equal(pose.wobbleFight, 0, 'so the bracing stance stays out of it');
});

test('the oscillator stays in the real 3–8 Hz band and tightens as it runs away', () => {
  assert.ok(EUC.wobbleFrequencyHz >= 3, 'the mild wobble is not a slow sway');
  assert.ok(EUC.wobbleFrequencyAtCrashHz <= 8, 'the severe wobble stays in the observed band');
  assert.ok(
    EUC.wobbleFrequencyAtCrashHz > EUC.wobbleFrequencyHz,
    'the ramp exists in the shipped table, not only in the code',
  );

  // **Damping is switched off for the measurement, and it has to be.** The
  // frequency is a function of the energy, and the energy is falling the whole
  // time a real wobble runs — so over any window long enough to count cycles in,
  // both a small wobble and a large one spend most of it at the *same* low
  // energy and report the same rate. Holding the energy still is what isolates
  // the variable under test; the decay has its own tests above.
  const cycles = (energy: number): number => {
    const euc = controller({
      tuning: {
        wobbleDampingAggressive: 0,
        wobbleDampingSmooth: 0,
        wobbleFootCorrectionDamping: 0,
      },
    });
    wobbleFrom(euc, energy);
    // Count sign changes of the swing: two per cycle, and it needs no access to
    // the phase the controller keeps to itself.
    let previous = euc.snapshot().wobbleYaw;
    let crossings = 0;
    for (let i = 0; i < SECONDS(2); i += 1) {
      euc.step(STEP, actions({ throttle: 1 }));
      const now = euc.snapshot().wobbleYaw;
      if (previous !== 0 && now !== 0 && Math.sign(now) !== Math.sign(previous)) crossings += 1;
      previous = now;
    }
    return crossings;
  };

  const gentle = cycles(0.25);
  const severe = cycles(0.95);
  assert.ok(
    severe > gentle * 1.3,
    `a wheel near the crash oscillates markedly faster than one that just got `
      + `hit: ${severe} against ${gentle} sign changes in two seconds`,
  );
});

test('roll and yaw are one continuous coupled oscillation, never two pulses', () => {
  const euc = controller({
    tuning: {
      wobbleDampingAggressive: 0,
      wobbleDampingSmooth: 0,
      wobbleFootCorrectionDamping: 0,
    },
  });
  wobbleFrom(euc, 0.65);

  let nonZero = 0;
  let zeroRun = 0;
  let longestZeroRun = 0;
  for (let i = 0; i < SECONDS(1); i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    const sample = euc.snapshot();
    if (Math.abs(sample.wobbleYaw) < 1e-10) {
      zeroRun += 1;
      longestZeroRun = Math.max(longestZeroRun, zeroRun);
      continue;
    }
    zeroRun = 0;
    nonZero += 1;
    assert.equal(
      Math.sign(sample.wobbleRoll),
      Math.sign(sample.wobbleYaw),
      'the machine rolls into the same side it yaws toward',
    );
    assert.ok(
      Math.abs(sample.wobbleRoll / sample.wobbleYaw - EUC.wobbleMaxRoll / EUC.wobbleMaxYaw)
        < 1e-9,
      'both axes are driven by one phase and one amplitude envelope',
    );
  }
  assert.ok(nonZero > SECONDS(0.9), 'the event oscillates continuously');
  assert.ok(longestZeroRun <= 1, 'crossing centre is not a stop/start dwell');
});

test('the diagnostic probe is deterministic, because it counts ground and not seconds', () => {
  // The probe exists so the redesign can be ridden before any hazard is built,
  // and a diagnostic that lands somewhere different every run is worse than
  // none — every frozen capture and every `advance(n)` assertion in the browser
  // suite depends on this. Distance on the fixed step is what buys it.
  const run = (): { energy: number; yaw: number; roll: number } => {
    const euc = controller();
    euc.setTuning({ wobbleProbeMetres: 12, wobbleProbeEnergy: 0.4 });
    const end = ride(euc, SECONDS(20), { throttle: 1 });
    return { energy: end.wobbleEnergy, yaw: end.wobbleYaw, roll: end.wobbleRoll };
  };
  const first = run();
  const second = run();
  assert.ok(first.energy > 0, 'sanity: the probe fired at all');
  assert.deepEqual(second, first, 'two identical runs reach an identical oscillator');
});

test('wobbleFight brackets the bracing stance against the state the wheel reports', () => {
  // One threshold for the name and the pose, so they cannot drift — and both
  // remaps computed in the controller, because the rig used to derive this one
  // for itself out of the *frozen* tuning table. That detached the rider's pose
  // from the F4 panel, and left a divisor that collapsed to zero the moment the
  // amplitude threshold was removed.
  const pose = createPose();
  const at = (energy: number): { fight: number; state: string } => {
    const euc = controller();
    wobbleFrom(euc, energy);
    euc.writePose(pose);
    return { fight: pose.wobbleFight, state: euc.snapshot().state };
  };

  const below = at(EUC.wobbleStateEnergy * 0.5);
  assert.equal(below.fight, 0, 'no bracing below the threshold');
  assert.notEqual(below.state, 'wobbling', 'and no name for it either');

  const above = at(EUC.wobbleCrashEnergy * 0.95);
  assert.ok(above.fight > 0.5, `fighting hard near the crash: ${above.fight}`);
  assert.equal(above.state, 'wobbling', 'and the wheel says so');
});

test('an idle oscillator reports positive zero, not negative zero', () => {
  // `wobbleMaxYaw * 0 * Math.sin(phase)` is `-0` on every step whose phase
  // lands in the sine's negative half, and the phase advances whether or not
  // there is any energy. `-0` is not `0` to `Object.is`, to `assert.strict`, to
  // a deep-equality check, or to a plan digest — `level/segments.ts` and
  // `level/planDigest.ts` already guard the same value class. Left alone it
  // makes "the wheel travels dead straight" fail intermittently, depending
  // only on which step the assertion happens to land on.
  const euc = controller();
  let sawNegativeZero = false;
  for (let i = 0; i < SECONDS(2); i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    if (Object.is(euc.snapshot().wobbleYaw, -0)) sawNegativeZero = true;
  }
  assert.equal(sawNegativeZero, false, 'no step reports a signed zero');
});

test('the shipped default enables wobble, and the closed gate still silences every source', () => {
  // Owner decision, 2026-08-09, on the M13 Phase 4 exit ride: hazards-only
  // wobble ships ON — the seven-year gate opened by the ride M6 was waiting
  // for. Pinning the default matters in both directions now: a regression to 0
  // would silently un-ship the mechanic the owner accepted.
  assert.equal(EUC.wobbleMasterGain, 1, 'the shipped default is on');
  // And zero must still mean *no energy path exists* — not a weave too small
  // to see — because `?wobble=0` is now the diagnostic off switch and the gate
  // has to gate. This rider commits every wobble sin at once with the gate
  // explicitly closed: gravel flat out, a committed carve, repeated abrupt
  // reversals.
  const euc = controller({
    tuning: { wobbleMasterGain: 0 },
    plan: flatPlan('gravel'),
  });
  ride(euc, SECONDS(6), { throttle: 1 });
  for (let flips = 0; flips < 8; flips += 1) {
    ride(euc, SECONDS(0.4), { throttle: 1, steer: flips % 2 === 0 ? 1 : -1 });
    ride(euc, 3, { throttle: 1, steer: 0 });
  }
  const abused = euc.snapshot();
  assert.equal(abused.wobbleEnergy, 0, 'no energy, whatever the rider does');
  // **No `Math.abs` here any more, and that is a real assertion.** This used to
  // read `Math.abs(abused.wobbleYaw)` because zero amplitude times a negative
  // sine is `-0`, which strict equality distinguishes from `0` — a workaround
  // in the test for a defect in the source. M13 normalises the sign where the
  // value is produced, so asserting the bare field is now safe, and asserting
  // it bare is what keeps it that way.
  assert.equal(abused.wobbleYaw, 0);
  assert.equal(abused.wobbleFootCorrection, 0);
  assert.notEqual(abused.state, 'wobbling');
});

test('an unhopped kerb costs speed, and no longer costs balance', () => {
  // **`docs/PLANS.md` §6 beat 3 asked for both halves and now gets one, on
  // purpose.** "Rolling over it unhopped costs speed and injects wobble" was
  // deferred by M4, built by M6, and half-removed by M13: the owner's §13 q8
  // trigger set is hazards, and a kerb you chose to ride over is not one.
  // Hopping is still the faster line through beat 3; it is no longer also the
  // safe one. The speed cost is the beat, and this test is what keeps it.
  const plan = buildLevelPlan(
    [{
      id: 'run',
      length: 160,
      halfWidth: 12,
      surface: 'pavement',
      shoulder: 1,
      // The same 0.15 m sidewalk the boulevard authors, laid across the path so
      // the wheel meets it as a step rather than riding along the top of it.
      blocks: [{
        s: 90,
        t: 0,
        halfAlong: 20,
        halfLateral: 11,
        height: 0.15,
        surface: 'pavement',
        appearance: 'concrete',
      }],
    }],
    {
      id: 'kerb',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 2,
    },
  );
  const euc = controller({ plan });
  const mounted = rideUntil(euc, { throttle: 1 }, (s) => s.lastStepUp > 0);
  assert.ok(mounted.reached, 'the fixture has a kerb the wheel actually mounts');

  const after = ride(euc, SECONDS(0.05), { throttle: 1 });
  assert.equal(after.wobbleEnergy, 0, 'the kerb no longer reaches the oscillator');
  assert.equal(after.crashed, false, 'and one kerb is a lesson, not a crash');

  // The half that survives, measured rather than asserted from the tuning
  // table: the same wheel over the same ground *without* the step keeps more of
  // its speed. Hopping is the fast line because of this number.
  const flat = controller({ plan: flatPlan('pavement') });
  const unbroken = rideUntil(
    flat,
    { throttle: 1 },
    (s) => s.position.z >= mounted.snapshot.position.z,
    8000,
  );
  assert.ok(
    unbroken.snapshot.speed > mounted.snapshot.speed + 1,
    `mounting the kerb cost real speed: ${mounted.snapshot.speed} against `
      + `${unbroken.snapshot.speed} over the same ground`,
  );
});

test('the wobble landing tier is still named, and no longer feeds the oscillator', () => {
  // **The tier outlived its consequence, and keeping it is deliberate.** M5
  // scored `wobble` and `crash` and declined to guess what they would do; M6
  // charged this one in energy; M13 removed that with the rest of the non-hazard
  // trigger set. The name stays because it is the rung the `crash` tier is
  // measured against, and because a landing this bad should still read as a
  // distinct event on the results screen even when it no longer unsettles the
  // wheel. What it costs now is speed and power headroom.
  const euc = controller({
    tuning: { hopLaunchSpeed: Math.sqrt(2 * PHYSICS.gravity * 5) },
  });
  pressHop(euc);
  const landed = flyUntilLanded(euc, {}, 4000).snapshot;
  assert.equal(landed.landingQuality, 'wobble', 'the classification survives');
  assert.equal(landed.crashed, false, 'the wobble tier is survivable by name');
  assert.equal(landed.wobbleEnergy, 0, 'and it is no longer charged in energy');
  // Read a step later: `land()` books the landing load at the end of the step
  // that resolves the touchdown, and the ladder reads it on the next one.
  assert.ok(
    ride(euc, 1, {}).loadFactor > 0,
    'the landing still spends power headroom',
  );
});

test('wobble past its threshold crashes, and the crash reports its own cause', () => {
  const euc = controller({ plan: flatPlan('gravel') });
  const lost = crashOnHazard(euc);
  assert.equal(lost.crashed, true, 'fighting a squirming wheel eventually loses it');
  assert.equal(lost.state, 'crashing');
  assert.ok(
    lost.crashCause === 'wobble' || lost.crashCause === 'pedalStrike',
    `the oscillator is the cause, not a landing: ${lost.crashCause}`,
  );
  assert.equal(lost.crashes, 1);
  assert.equal(lost.wobbleEnergy, 0, 'and the oscillator is spent');
});

test('a crash picks its motion from the speed, not from the trigger', () => {
  // `EUC_RIDER_MOTION_REFERENCE.md` §16. The same cause at three speeds must
  // read as three different non-graphic outcomes.
  // Ride up to the speed first, *then* drop the crash threshold to nothing, so
  // the speed the rider was carrying is the only thing that differs between the
  // three cases. Lowering it up front would crash the wheel at a standstill
  // every time and prove only that a step-off is a step-off.
  const motionAt = (speed: number): string => {
    const euc = controller({ plan: flatPlan('gravel') });
    const reached = rideUntil(euc, { throttle: 1 }, (s) => s.speed >= speed, 8000);
    assert.ok(reached.reached, `never got to ${speed} m/s`);
    // Dropping the threshold is no longer enough on its own: after M13 nothing
    // on open ground supplies the energy to cross even a threshold of nothing,
    // so the probe has to deliver the hazard this crash is standing in for.
    euc.setTuning({
      wobbleCrashEnergy: 1e-6,
      wobbleProbeMetres: 0.01,
      wobbleProbeEnergy: 1,
    });
    const lost = rideUntil(euc, { throttle: 1 }, (s) => s.crashed, 600);
    assert.ok(lost.reached, `never lost it at ${speed} m/s`);
    return lost.snapshot.crashMotion;
  };

  assert.equal(motionAt(1), 'stepOff', 'a slow loss is a step-off');
  assert.equal(motionAt(6), 'runOut', 'a moderate one is a run-out');
  assert.equal(motionAt(12), 'sideFall', 'a fast one is a side fall');
});

test('the crash covers the wipeout recording, and it tumbles instead of freezing', () => {
  // Owner, 2026-08-04: his recorded wipeout runs 3.4 s, and the animation
  // must outlast it — "don't make the audio shorter, make the animation
  // longer (more wipeout ish)". The duration is the contract with the asset;
  // the tumble is the "wipeout ish": a damped wave that keeps the fallen
  // rider moving through the middle of the crash and has settled before
  // manual recovery opens.
  assert.ok(
    EUC.crashRecoverAutoSeconds >= 3.4,
    'auto-recovery must not stand the rider up while the recording still tumbles',
  );

  const euc = controller({
    plan: flatPlan('gravel'),
    tuning: { crashRecoverAutoSeconds: 99, crashRecoverEarliestSeconds: 99 },
  });
  const lost = crashOnHazard(euc);
  assert.equal(lost.crashed, true);
  assert.equal(lost.crashMotion, 'sideFall', 'a full-speed loss falls sideways');

  // Sample the applied pose through the crash. The wave rides on crashRoll
  // and crashDrop, so a frozen crash would show zero movement after the
  // separation blend finishes.
  const pose = createPose();
  const rollAt: number[] = [];
  const dropAt: number[] = [];
  for (let i = 0; i < SECONDS(3); i += 1) {
    euc.step(STEP, actions({}));
    euc.writePose(pose);
    rollAt.push(pose.crashRoll);
    dropAt.push(pose.crashDrop);
  }
  const window = (from: number, to: number, values: number[]): number => {
    let low = Infinity;
    let high = -Infinity;
    for (let i = Math.floor(from * SECONDS(1)); i < Math.min(values.length, to * SECONDS(1)); i += 1) {
      low = Math.min(low, values[i]);
      high = Math.max(high, values[i]);
    }
    return high - low;
  };

  // Mid-crash (after the separation is mostly blended) the body still rocks
  // and bounces; by the time manual recovery opens the wave has decayed to a
  // fraction of that. Judged relative to the mid-crash motion rather than as
  // absolute stillness, because the separation blend's own exponential tail
  // never quite reaches zero and that creep is not the tumble.
  const midRoll = window(0.6, 1.6, rollAt);
  assert.ok(midRoll > 0.08, `the roll must keep rocking mid-crash, moved ${midRoll}`);
  assert.ok(
    window(0.6, 1.6, dropAt) > 0.02,
    `the body must bounce off the ground, moved ${window(0.6, 1.6, dropAt)}`,
  );
  assert.ok(
    window(2.5, 3.0, rollAt) < midRoll * 0.3,
    `and have all but settled before recovery opens, still moving ${window(2.5, 3.0, rollAt)}`,
  );
  assert.ok(
    window(2.5, 3.0, dropAt) < 0.01,
    `the bounce must be spent by then, still moving ${window(2.5, 3.0, dropAt)}`,
  );
});

test('the riderless wheel rolls on, slows down, and lies over', () => {
  const euc = controller({
    plan: flatPlan('gravel'),
    tuning: { crashRecoverAutoSeconds: 99, crashRecoverEarliestSeconds: 99 },
  });
  const lost = crashOnHazard(euc);
  assert.equal(lost.crashed, true);

  const atCrash = lost.speed;
  const pose = createPose();

  const rolling = ride(euc, SECONDS(0.3), { throttle: 1 });
  assert.equal(rolling.state, 'crashing', 'input does nothing while the rider is off');
  assert.ok(rolling.speed < atCrash, 'the wheel is slowing under damped motion');
  assert.ok(rolling.speed > 0, 'but it has not stopped dead where the rider left it');

  // Long enough for the stretched separation (0.85 s time constant) to have
  // all but finished — the crash itself now runs 3.6 s to cover the recording.
  const later = ride(euc, SECONDS(2.4), {});
  assert.ok(later.speed < rolling.speed);
  euc.writePose(pose);
  assert.ok(Math.abs(pose.wheelCrashLean) > 1, `the wheel lies over: ${pose.wheelCrashLean}`);
  assert.ok(pose.crashBlend > 0.85, 'and the rider has all but finished separating');
  assert.ok(
    Math.hypot(pose.crashForward, pose.crashLateral) > 0.5,
    'somewhere other than on the pedals',
  );
});

test('recovery restores the rider at a safe position, keeping the run counters', () => {
  const euc = controller({ plan: flatPlan('gravel') });
  const beforeLoss = crashOnHazard(euc);
  assert.equal(beforeLoss.crashed, true);
  const safe = beforeLoss.safePosition;
  const ridden = beforeLoss.distanceTravelled;

  // Nothing held: the automatic recovery has to arrive on its own.
  const recovered = rideUntil(
    euc,
    {},
    (s) => !s.crashed,
    SECONDS(EUC.crashRecoverAutoSeconds + 0.5),
  );
  assert.ok(recovered.reached, 'the automatic recovery fires without any input');
  const back = recovered.snapshot;

  assert.equal(back.state, 'recovering');
  assert.equal(back.grounded, true);
  assert.ok(Math.abs(back.position.x - safe.x) < 1e-6, 'restored at the safe position');
  assert.ok(Math.abs(back.position.z - safe.z) < 1e-6);
  assert.equal(back.wobbleEnergy, 0, 'and not still wobbling');
  assert.ok(back.invulnerable > 0, 'with a brief invulnerable window');
  assert.equal(back.crashes, 1, 'a recovery is not a reset: the crash still happened');
  assert.ok(back.distanceTravelled >= ridden, 'and the run continues');
});

test('a recovery input takes it early, and never before it is offered', () => {
  const euc = controller({ plan: flatPlan('gravel') });
  crashOnHazard(euc);

  // Held throttle through the whole hold-off window must not shorten it.
  const early = ride(euc, SECONDS(EUC.crashRecoverEarliestSeconds - 0.2), { throttle: 1 });
  assert.equal(early.crashed, true, 'a crash cannot be cancelled the instant it starts');
  assert.equal(early.recoveryReady, false);

  const asked = rideUntil(euc, { throttle: 1 }, (s) => !s.crashed, SECONDS(0.6));
  assert.ok(asked.reached, 'once offered, a riding input takes it');
  assert.ok(
    asked.snapshot.crashTime === 0,
    'well before the automatic recovery would have arrived',
  );
});

test('the invulnerable window stops the ground that got you getting you again', () => {
  const euc = controller({ plan: flatPlan('gravel') });
  crashOnHazard(euc);
  rideUntil(euc, {}, (s) => !s.crashed, SECONDS(EUC.crashRecoverAutoSeconds + 0.5));

  const during = ride(euc, SECONDS(EUC.crashInvulnerableSeconds - 0.1), { throttle: 1 });
  assert.ok(during.invulnerable > 0);
  assert.equal(during.wobbleEnergy, 0, 'gravel injects nothing while invulnerable');
  assert.equal(during.crashes, 1, 'so it cannot immediately crash again');

  const after = ride(euc, SECONDS(1.5), { throttle: 1 });
  assert.equal(after.invulnerable, 0);
  assert.ok(after.wobbleEnergy > 0, 'and the window really does close');
});

test('a bump never re-aims the rider, and spends one bush-grade soft knock', () => {
  /*
   * **This test used to assert the re-aiming, and the owner's couch ride is why
   * it does not** (2026-08-27). `bump` summed the push into the velocity and
   * took `atan2` of the result — correct for a free body, wrong for one whose
   * heading is where the player is *looking*. The error scaled inversely with
   * speed: a parked rider has no velocity for a 1.2 m/s push to be a couple of
   * degrees *of*, so `atan2` returned the push bearing itself and spun them to
   * face exactly away from whoever touched them. **180° in a single step**, and
   * the camera went with it.
   *
   * Coming apart sideways is `separate`'s job now, because it is a change of
   * place. What `bump` keeps is the part that really is a change of motion: the
   * component of the push along the way the rider is already facing.
   */
  const bushEnergy = 0.73;
  const euc = controller({ tuning: { softBodyWobbleEnergy: bushEnergy } });
  const before = rideToSpeed(euc, 6);
  const speedCost = 1.5;

  // A pure side push — the worst case for the old build, and the one that has
  // to change nothing but the wobble.
  euc.bump(1.2, 0, speedCost);
  const sideways = euc.snapshot();
  assert.equal(sideways.headingY, before.headingY, 'a side shove re-aimed the rider');
  assert.ok(
    Math.abs(sideways.speed - (before.speed - speedCost)) < 1e-12,
    'a side shove is all cost and no push along the heading',
  );
  assert.equal(sideways.wobbleEnergy, bushEnergy, 'the bump delivered exactly a bush\'s energy');
  assert.equal(sideways.crashed, false, 'contact never creates a direct crash funnel');

  // And a shove from behind speeds the rider up before the cost is taken, which
  // is the half that *is* a change of motion. Facing +Z at rest by
  // construction, so a +Z push is directly up the rider's own line.
  const pushed = controller({ tuning: { softBodyWobbleEnergy: bushEnergy } });
  const rolling = rideToSpeed(pushed, 6);
  pushed.bump(0, 2, speedCost);
  const shunted = pushed.snapshot();
  assert.equal(shunted.headingY, rolling.headingY, 'a shunt re-aimed the rider');
  assert.ok(
    Math.abs(shunted.speed - (rolling.speed + 2 - speedCost)) < 1e-12,
    'a shove along the heading is a change of speed',
  );
});

test('a bump refuses to move or knock a crashed rider', () => {
  const euc = controller({
    tuning: { crashRecoverAutoSeconds: 99, crashRecoverEarliestSeconds: 99 },
  });
  const crashed = crashOnHazard(euc);
  assert.equal(crashed.crashed, true, 'fixture never reached the required crash');

  euc.bump(3, -2, 1.5);
  const after = euc.snapshot();
  assert.equal(after.speed, crashed.speed);
  assert.equal(after.headingY, crashed.headingY);
  assert.equal(after.wobbleEnergy, crashed.wobbleEnergy);
});

test('a bump refuses the whole recovery invulnerability window', () => {
  const euc = controller({
    tuning: {
      crashRecoverAutoSeconds: 0.2,
      crashRecoverEarliestSeconds: 0.1,
      crashInvulnerableSeconds: 0.8,
    },
  });
  const crashed = crashOnHazard(euc);
  assert.equal(crashed.crashed, true, 'fixture never reached the required crash');
  const recovered = rideUntil(euc, {}, (snapshot) => !snapshot.crashed, SECONDS(1));
  assert.ok(recovered.reached, 'fixture never reached recovery');
  assert.ok(recovered.snapshot.invulnerable > 0, 'fixture missed the invulnerable window');

  euc.bump(3, -2, 1.5);
  const after = euc.snapshot();
  assert.equal(after.speed, recovered.snapshot.speed);
  assert.equal(after.headingY, recovered.snapshot.headingY);
  assert.equal(after.wobbleEnergy, recovered.snapshot.wobbleEnergy);
});

test('the safe position lags the trouble rather than tracking it', () => {
  // The delay is what makes "last validated safe position" useful instead of
  // merely recent: without it a wobble crash would restore the rider a tenth of
  // a second before they lost it, on the same ground, at the same speed.
  const euc = controller({ plan: flatPlan('gravel') });
  const lost = crashOnHazard(euc);
  const back = Math.hypot(
    lost.position.x - lost.safePosition.x,
    lost.position.z - lost.safePosition.z,
  );
  assert.ok(back > 1, `the safe spot is ${back} m behind where the rider lost it`);
});

test('a quick reset is a fresh run and a recovery is not', () => {
  const euc = controller({ plan: flatPlan('gravel') });
  crashOnHazard(euc);
  rideUntil(euc, {}, (s) => !s.crashed, SECONDS(EUC.crashRecoverAutoSeconds + 0.5));
  assert.equal(euc.snapshot().crashes, 1);

  euc.reset();
  const fresh = euc.snapshot();
  assert.equal(fresh.crashes, 0, 'reset clears the crash count');
  assert.equal(fresh.crashCause, 'none');
  assert.equal(fresh.wobbleEnergy, 0);
  assert.equal(fresh.loadFactor, 0);
  assert.equal(fresh.tiltBack, 0);
  assert.equal(fresh.state, 'mounted');
});

test('the power ladder climbs with speed and the flat never reaches tilt-back', () => {
  const euc = controller();
  const stages: string[] = [];
  for (let i = 0; i < SECONDS(30); i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    stages.push(euc.snapshot().powerStage);
  }
  assert.ok(stages.includes('normal'), 'it starts at nothing');
  assert.ok(stages.includes('notice'), 'and warns as the wheel nears its own top speed');
  assert.ok(!stages.includes('tiltBack'), 'but flat pavement must never take the throttle away');
});

test('charging a hill at speed tilts back, and the tilt-back lets go again', () => {
  // §4.5's fourth rung, and the vision's own cutout conditions (§8.4) applied
  // to a stage the rider can ride out of instead of a failure they cannot.
  const plan = buildLevelPlan(
    [
      { id: 'pad', length: 160, halfWidth: 20, surface: 'pavement', shoulder: 2 },
      {
        id: 'hill',
        length: 200,
        climb: 0.194 * 200,
        linearClimb: true,
        halfWidth: 20,
        surface: 'pavement',
        shoulder: 2,
      },
    ],
    {
      id: 'runup',
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'pavement' },
      spacing: 2,
    },
  );
  const euc = controller({ plan });

  const engaged = rideUntil(euc, { throttle: 1 }, (s) => s.powerStage === 'tiltBack', 4000);
  assert.ok(engaged.reached, 'hitting the hill flat out must reach tilt-back');
  const atEngage = engaged.snapshot.speed;

  // It has to actually take the throttle away, and it has to give it back.
  const held = ride(euc, SECONDS(0.6), { throttle: 1 });
  assert.ok(held.tiltBack > 0.5, `tilt-back engaged to ${held.tiltBack}`);
  assert.equal(held.state, 'tiltBack', 'and says so, over the braking it looks like');
  assert.ok(held.speed < atEngage, 'speed falls even under full throttle');

  const released = rideUntil(euc, { throttle: 1 }, (s) => s.powerStage !== 'tiltBack', 2000);
  assert.ok(released.reached, 'and the wheel is not stranded on the hill by its own limiter');
  const climbing = ride(euc, SECONDS(4), { throttle: 1 });
  assert.ok(climbing.speed > 5, `it climbs on at ${climbing.speed} m/s`);
});

test('tilt-back caps the throttle without capping the brake', () => {
  // Latched permanently, by putting the engage rung under what a standing start
  // produces and the release ratio at zero. The hysteresis is what makes the
  // stage one event rather than a flicker, and it is exactly what stops a
  // *settled* reading of a fully engaged tilt-back from being obtainable on a
  // wheel that is allowed to ride out of it — which is the behaviour the hill
  // test above asserts instead.
  const euc = controller({ tuning: { powerTiltBackLoad: 0.05, powerTiltBackRelease: 0 } });
  const capped = rideUntil(euc, { throttle: 1 }, (s) => s.tiltBack > 0.99, 2000);
  assert.ok(capped.reached, 'the stage engages and stays engaged');
  assert.equal(capped.snapshot.powerStage, 'tiltBack');
  assert.ok(
    capped.snapshot.leanPitch < 0,
    `full throttle is held past neutral, not at ${capped.snapshot.leanPitch}`,
  );
  assert.ok(
    Math.abs(capped.snapshot.leanPitch + EUC.tiltBackLeanBack) < 0.01,
    'and held exactly where the ceiling puts it',
  );

  // A rider asking for more lean-back than the ceiling still gets all of it:
  // tilt-back is a limit on the throttle, never on the brake.
  const braking = ride(euc, SECONDS(0.5), { throttle: -1 });
  assert.ok(
    braking.leanPitch < -EUC.tiltBackLeanBack * 3,
    `braking is untouched at ${braking.leanPitch}`,
  );
});

test('a descent spends no power headroom, however fast it gets', () => {
  // Climbing costs headroom; falling gives it back. Letting the slope term
  // subtract would let a downhill mask a demand the rider is making, so it is
  // clamped at zero instead — and the speed term is left to do the work, which
  // on a fast descent is plenty.
  //
  // Twelve seconds rather than twenty since M16: the ramp is 400 m long and
  // ends in a cliff back to the surround's height, and at the speed a descent
  // now reaches, twenty seconds rides off it. What that measured was the fall,
  // not the headroom.
  const euc = controller({ plan: rampPlan(-0.194) });
  const bombing = ride(euc, SECONDS(12), { throttle: 1 });
  assert.ok(bombing.slope < 0, 'sanity: this is a descent');
  assert.ok(bombing.speed > 23, `and a fast one at ${bombing.speed} m/s`);
  assert.notEqual(bombing.powerStage, 'tiltBack', 'a descent must not tilt back');
  // **And it no longer wobbles either.** M6 put a comfort speed above the
  // wheel's flat top speed precisely so that a descent — the one place it could
  // be exceeded — would wobble. M13 deleted `wobbleComfortSpeed` with the rest
  // of the trigger set: going fast is not a mistake the rider can see coming and
  // choose to avoid, it is the game. Bombing a hill is now purely a power
  // question, which is what the rest of this test measures.
  assert.equal(bombing.wobbleEnergy, 0, 'speed alone is not a wobble trigger');
});

test('the wobble oscillation is spent on the position, never on the heading', () => {
  // The structural half of "a wobble can never accumulate into a turn". The
  // stored heading is untouched by the oscillator. Induce one real mistake,
  // release the steering, and watch only the automatic recovery interval.
  const euc = controller();
  wobbleFrom(euc, 0.8);
  const aimed = euc.snapshot();
  const weaving = ride(euc, SECONDS(0.2), { throttle: 1, steer: 0 });
  assert.ok(weaving.wobbleEnergy > 0.3, 'sanity: it is genuinely wobbling');
  assert.ok(Math.abs(weaving.wobbleYaw) > 0, 'and oscillating right now');
  assert.ok(Math.abs(weaving.wobbleRoll) > 0, 'with the coupled machine roll');
  assert.equal(weaving.headingY, aimed.headingY, 'yet the heading has not drifted at all');
  // Two tenths of a second of travel, plus a metre of slack for the oscillator
  // itself. Written against the speed rather than as a fixed distance because
  // the wheel's speed is a tuning decision and this claim is about the *shape*
  // of the movement: forward, not sideways.
  assert.ok(
    Math.hypot(
      weaving.position.x - aimed.position.x,
      weaving.position.z - aimed.position.z,
    ) < aimed.speed * 0.2 + 1,
    'the brief recovery moved forward rather than inventing a new heading',
  );
});

test('an airborne wheel neither wobbles nor spends power', () => {
  const euc = controller({ plan: flatPlan('gravel') });
  // Gravel is inert after M13, so the wobble this test needs has to be put
  // there — and it must be *visible* on the ground, because the claim below is
  // that leaving the ground is what silences it.
  const grounded = wobbleFrom(euc, 0.8);
  assert.ok(grounded.wobbleEnergy > 0.3, 'sanity: the wheel is carrying a wobble');
  assert.ok(Math.abs(grounded.wobbleYaw) > 0, 'and showing it, on the ground');
  assert.ok(Math.abs(grounded.wobbleRoll) > 0, 'on both coupled axes');

  pressHop(euc);
  const flying = ride(euc, SECONDS(EUC.hopCompressSeconds + 0.2), { throttle: 1 });
  assert.equal(flying.grounded, false);
  assert.equal(flying.wobbleYaw, 0, 'nothing to oscillate against off the ground');
  assert.equal(flying.wobbleRoll, 0, 'and no machine roll survives in the air');
  assert.ok(
    flying.wobbleEnergy < grounded.wobbleEnergy,
    'and the energy only decays while in flight',
  );
});

test('the alert ladder lands each colour stop on the rung it names', () => {
  // The power ladder's rungs are deliberately not evenly spaced, so a status
  // light driven from the raw load showed nearly the amber colour while the
  // wheel was still reporting `notice`. A machine whose warning light disagrees
  // with its own state is worse than a machine with no light.
  const rungs = [EUC.powerNoticeLoad, EUC.powerWarnLoad, EUC.powerTiltBackLoad];
  assert.equal(ladder(0, rungs), 0);
  assert.ok(Math.abs(ladder(EUC.powerNoticeLoad, rungs) - 1 / 3) < 1e-9);
  assert.ok(Math.abs(ladder(EUC.powerWarnLoad, rungs) - 2 / 3) < 1e-9);
  assert.equal(ladder(EUC.powerTiltBackLoad, rungs), 1);
  assert.equal(ladder(99, rungs), 1, 'and it saturates rather than running off');

  // Every rung is on F4. An owner dragging the tilt-back rung below the amber
  // one must not get a light that runs backwards; the buried rung simply
  // becomes unreachable, which is what the stage machine does with it too.
  const inverted = ladder(0.5, [0.6, 0.82, 0.3]);
  assert.ok(inverted >= 0 && inverted <= 1, `stayed in range at ${inverted}`);
  assert.ok(
    ladder(0.9, [0.6, 0.82, 0.3]) >= ladder(0.5, [0.6, 0.82, 0.3]),
    'and it still only ever increases',
  );
});

test('the alert scalar reports the worse of the two things that can end a run', () => {
  const pose = createPose();

  // Power alone, on the flat at top speed: the first rung and nothing more.
  const fast = controller();
  ride(fast, SECONDS(30), { throttle: 1 });
  fast.writePose(pose);
  const fromPower = pose.alert;
  assert.ok(fromPower > 1 / 3, 'flat out is past the first rung');
  assert.ok(fromPower < 2 / 3, 'and short of the second');

  // Wobble alone, after one hazard-shaped hit: the same scalar, driven by the
  // other system. The provocation changed at M13 — a steering error can no
  // longer produce one — but the claim that the light reports the worse of the
  // two systems is exactly what it was.
  const mistaken = controller();
  wobbleFrom(mistaken, 0.8);
  mistaken.writePose(pose);
  assert.ok(
    pose.alert > fromPower,
    `a wheel that is squirming reports worse than one that is merely fast: `
      + `${pose.alert} against ${fromPower}`,
  );
});

// ---------------------------------------------------------------------------
// M13 Phase 1: what a hazard does
// ---------------------------------------------------------------------------

/**
 * Ride forward to `toZ` at full throttle, watching what happens on the way.
 *
 * Distance rather than steps, because what these tests are about is *where* the
 * hazard is, and a step count would stop meaning the same thing the moment
 * anybody touched the accel curve.
 *
 * **The peak is the measurement, not the end state**, and the first draft of
 * these tests got that wrong in a way worth recording. A hazard's energy is
 * damped from the step it arrives, so reading it a few metres later measures
 * the decay curve rather than the hit — and it does so *unfairly*, because a
 * wide hole is entered earlier than a narrow one and has therefore been
 * decaying for longer by any fixed finish line. Two holes that inject exactly
 * the same energy looked 30 % apart. What a hole costs is its peak; how long
 * that lasts is the oscillator's business and is tested separately.
 *
 * `lowestSpeed` is likewise sampled only from `afterZ` onward, so the launch
 * from a standstill cannot be mistaken for the hazard's speed cost.
 */
function rideThrough(euc: EucController, afterZ: number, toZ: number): {
  peakWobble: number;
  everWobbling: boolean;
  lowestSpeed: number;
  snapshot: EucSnapshot;
} {
  const input = actions({ throttle: 1 });
  let peakWobble = 0;
  let everWobbling = false;
  let lowestSpeed = Infinity;
  for (let i = 0; i < 6000; i += 1) {
    const snapshot = euc.snapshot();
    peakWobble = Math.max(peakWobble, snapshot.wobbleEnergy);
    if (snapshot.state === 'wobbling') everWobbling = true;
    if (snapshot.position.z >= afterZ) lowestSpeed = Math.min(lowestSpeed, snapshot.speed);
    if (snapshot.crashed || snapshot.position.z >= toZ) break;
    euc.step(STEP, input);
  }
  return { peakWobble, everWobbling, lowestSpeed, snapshot: euc.snapshot() };
}

test('a shallow pothole costs speed and starts a wobble worth the name', () => {
  // The owner's §13 q8 answer, in one assertion each: a shallow hole is what
  // *starts* a wobble now that nothing else does, and it charges for itself in
  // the currency a timed run is measured in.
  const clean = rideThrough(controller({ plan: hazardPlan() }), 40, 48);
  const hit = rideThrough(controller({ plan: hazardPlan(), hazards: [potholeAhead(40, 'potholeShallow')] }), 40, 48);

  assert.ok(hit.peakWobble > EUC.wobbleStateEnergy, `energy peaked at ${hit.peakWobble}`);
  assert.equal(hit.everWobbling, true, 'and it is an event, not a twitch');
  assert.equal(clean.everWobbling, false, 'which pavement alone never produces');
  assert.ok(
    hit.lowestSpeed < clean.lowestSpeed - 1,
    `${hit.lowestSpeed} against a clean ${clean.lowestSpeed}`,
  );
  assert.equal(hit.snapshot.crashed, false, 'but a shallow hole is survivable at any speed');
});

test('a deep pothole at riding speed ends the run, and the cause names the hole', () => {
  const hit = rideThrough(controller({ plan: hazardPlan(), hazards: [potholeAhead(40, 'potholeDeep')] }), 40, 48);

  assert.equal(hit.snapshot.crashed, true);
  // Not 'wobble'. The rider needs to be told what got them, and a deep hole
  // taken at speed is not something they could have ridden out of.
  assert.equal(hit.snapshot.crashCause, 'hazard');
});

test('the same deep pothole is survivable slowly — and is not cheap', () => {
  // The speed gate is the whole of the owner's answer: deep potholes are a
  // wipeout, *unless* you saw it and slowed for it. This is the reward for
  // having braked, and it is deliberately not a free pass.
  const euc = controller({
    hazards: [potholeAhead(40, 'potholeDeep')],
    tuning: { hazardCrashSpeed: 20 },
  });
  const hit = rideThrough(euc, 40, 48);
  const clean = rideThrough(controller({ tuning: { hazardCrashSpeed: 20 } }), 40, 48);

  assert.equal(hit.snapshot.crashed, false, 'under the gate the wheel is kept');
  assert.ok(
    hit.peakWobble > EUC.wobbleStateEnergy * 2,
    `but it is the worst wobble in the game: ${hit.peakWobble}`,
  );
  assert.ok(hit.peakWobble < EUC.wobbleCrashEnergy, 'and still a recovery, not a formality');
  // Measured against the same stretch ridden clean rather than against a fixed
  // number, because what "ends a competitive run" means is *the speed the
  // hazard took off you*, and the speed you arrive at 40 m with is a tuning
  // decision the owner moved at M16.
  assert.ok(
    clean.lowestSpeed - hit.lowestSpeed > EUC.hazardDeepSpeedCost * 0.9,
    `and the speed cost alone ends a competitive run: ${clean.lowestSpeed} -> ${hit.lowestSpeed}`,
  );
});

test('a hole charges once on the way in, however wide it is', () => {
  // A two-metre hole is thirty-two steps wide at top speed. Charged per step it
  // would be an instant crash, and a narrow one a scratch — so the width of a
  // pothole would decide its severity instead of its depth, which is neither
  // what the owner asked for nor what the rendered shape will promise.
  const narrow = rideThrough(controller({
    hazards: [potholeAhead(40, 'potholeShallow', 0.5)],
  }), 40, 50);
  const wide = rideThrough(controller({
    hazards: [potholeAhead(40, 'potholeShallow', 6)],
  }), 40, 50);

  assert.ok(
    Math.abs(narrow.peakWobble - wide.peakWobble) < 1e-9,
    `${narrow.peakWobble} against ${wide.peakWobble}`,
  );
  assert.equal(wide.snapshot.crashed, false, 'a wide hole is not a deadly one');
});

test('hopping a pothole clears it, with no hop-specific code anywhere', () => {
  // The contact test only runs on the ground, so this falls out of the airborne
  // check rather than out of a rule about jumps. It is also the skill the whole
  // mechanic is asking for.
  const euc = controller({ plan: hazardPlan(), hazards: [potholeAhead(20, 'potholeDeep', 0.8)] });
  const input = actions({ throttle: 1 });

  for (let i = 0; i < 6000; i += 1) {
    const snapshot = euc.snapshot();
    if (snapshot.crashed || snapshot.position.z > 24) break;
    // Commit the hop from far enough back that the wheel is airborne over the
    // rim rather than compressing on top of it.
    if (snapshot.position.z > 16 && snapshot.position.z < 17.5 && snapshot.grounded) {
      pressHop(euc, { throttle: 1 });
      continue;
    }
    euc.step(STEP, input);
  }

  const cleared = euc.snapshot();
  assert.equal(cleared.crashed, false, 'the hop cleared a hole that would have ended the run');
  assert.equal(cleared.wobbleEnergy, 0, 'and it cost nothing at all');
});

test('a spill in the plan is ground, not a contact event', () => {
  // `plan.hazards` carries spills so `render/` can draw them and so a safe
  // position is refused inside one, but the field drops them: a puddle's ride
  // response is the `spill` surface painted under it. If this ever started
  // firing, the same puddle would be answered by two systems at once.
  const euc = controller({
    hazards: [{ id: 'puddle', kind: 'spill', centre: { x: 0, y: 0, z: 40 }, radius: 3 }],
  });
  const through = rideThrough(euc, 40, 48);

  assert.equal(through.peakWobble, 0, 'no impulse — the flat plan is pavement under it');
  assert.equal(through.snapshot.crashed, false);
});

test('the wobble gate silences the weave but not the speed, and never the wipeout', () => {
  // **The shipped default, which is what a player without the switch rides.**
  // `wobbleMasterGain` is 0, so a hazard's wobble half is silent — but a hole
  // still slows the wheel and a deep one at speed still ends the run, because
  // losing speed in a hole is not a wobble and a wipeout is not a weave.
  const bumped = rideThrough(controller({
    hazards: [potholeAhead(40, 'potholeShallow')],
    tuning: { wobbleMasterGain: 0 },
  }), 40, 48);
  const clean = rideThrough(controller({ plan: hazardPlan(), tuning: { wobbleMasterGain: 0 } }), 40, 48);

  assert.equal(bumped.peakWobble, 0, 'the gate holds');
  assert.equal(bumped.snapshot.wobbleYaw, 0, 'so the wheel still travels straight');
  assert.ok(bumped.lowestSpeed < clean.lowestSpeed - 1, 'and the hole was still there');

  const deep = rideThrough(controller({
    hazards: [potholeAhead(40, 'potholeDeep')],
    tuning: { wobbleMasterGain: 0 },
  }), 40, 48);
  assert.equal(deep.snapshot.crashCause, 'hazard');
});

test('a world with no hazards rides exactly as it did before M13 built them', () => {
  // The regression that matters most: the slice and the proving ground carry
  // none by owner decision, so this is the ride every existing player has.
  //
  // Eight seconds rather than twelve since M16: `hazardPlan` is 200 m of
  // pavement in a grass surround, and at the new top speed twelve seconds runs
  // off the far end onto the grass — where the wheel is legitimately slower,
  // and where this test would be measuring the surround rather than the ride.
  const before = controller({ plan: hazardPlan() });
  const cruising = ride(before, SECONDS(8), { throttle: 1 });
  assert.equal(cruising.wobbleEnergy, 0);
  assert.equal(cruising.crashes, 0);
  assert.ok(cruising.speed > 21.8 && cruising.speed < 22.4, `topped out at ${cruising.speed}`);
});

test('no safe position is ever recorded inside a hazard footprint', () => {
  // Without this the rider who loses it inside a wide spill or a broad hole can
  // have that exact spot stored as the last place they were riding cleanly, and
  // be restored into it. The invulnerable window holds energy at zero on
  // arrival so it is not an infinite loop — it is worse than a loop: they come
  // out of invulnerability already standing in the thing that got them, with no
  // idea why it happened twice.
  //
  // Twenty metres of footprint is far more than Phase 3 will place, and that is
  // the point: it holds the rider inside for several seconds, which is longer
  // than `crashSafeDelaySeconds`, so a controller missing the `!inHazard` term
  // would have every opportunity to record one and would fail here loudly.
  const euc = controller({ plan: hazardPlan(), hazards: [potholeAhead(40, 'potholeShallow', 20)] });
  rideThrough(euc, 40, 55);
  const inside = euc.snapshot();
  assert.ok(inside.position.z > 45, 'the rider is well inside the footprint');
  assert.ok(
    inside.safePosition.z < 20,
    `but the safe position is still short of the rim: ${inside.safePosition.z}`,
  );

  // And it starts updating again the moment they are clear of it, or the rule
  // would strand a rider's recovery point at the last hazard for the whole run.
  rideThrough(euc, 60, 90);
  assert.ok(
    euc.snapshot().safePosition.z > 60,
    `clear of the hole it tracks again: ${euc.snapshot().safePosition.z}`,
  );
});

/**
 * A pavement corridor with a puddle of `radius` metres centred at 60 m.
 *
 * Built through `buildLevelPlan` with a real `HazardSpec` rather than by
 * painting a whole world `spill`, because the thing worth testing is that the
 * three layers agree: the build paints the cells, the sampler reports the
 * surface, and the controller answers it. A `flatPlan('spill')` world would
 * test the third of those and quietly assume the first two.
 *
 * One-metre cells, because a four-metre grid cannot express a puddle.
 */
function spillPlan(radius: number): LevelPlan {
  return buildLevelPlan(
    [{ id: 'run', length: 300, halfWidth: 10, surface: 'pavement', shoulder: 1 }],
    {
      id: `spill-${radius}`,
      spawn: { position: { x: 0, y: 0, z: 0 }, headingY: 0 },
      surround: { height: 0, surface: 'grass' },
      spacing: 1,
      hazards: [{ id: 'puddle', segment: 'run', s: 60, t: 0, kind: 'spill', radius }],
    },
  );
}

/**
 * Ride into the puddle, optionally easing off once the wobble is an event.
 *
 * `clearedAfter` is metres past the far edge before the energy falls back under
 * `wobbleStateEnergy`. **Not metres until it reaches zero** — the decay is
 * exponential, so it never does, and an `=== 0` assertion on the far side is
 * asserting a property of floating point rather than of the game. What the
 * design actually claims is that leaving the water ends the *event*, and that
 * is a threshold crossing with a distance attached.
 */
function rideSpill(euc: EucController, ease: boolean): {
  peak: number; announcedAfter: number; clearedAfter: number; snapshot: EucSnapshot;
} {
  let peak = 0;
  let enteredAt = -1;
  let exitedAt = -1;
  let announcedAfter = Infinity;
  let clearedAfter = Infinity;
  let eased = false;
  for (let i = 0; i < 40000; i += 1) {
    const s = euc.snapshot();
    peak = Math.max(peak, s.wobbleEnergy);
    if (s.surface === 'spill') {
      if (enteredAt < 0) enteredAt = s.position.z;
      if (announcedAfter === Infinity && s.wobbleEnergy >= EUC.wobbleStateEnergy) {
        announcedAfter = s.position.z - enteredAt;
      }
    } else if (enteredAt >= 0) {
      if (exitedAt < 0) exitedAt = s.position.z;
      if (clearedAfter === Infinity && s.wobbleEnergy < EUC.wobbleStateEnergy) {
        clearedAfter = s.position.z - exitedAt;
      }
    }
    if (s.crashed || s.position.z > 280) break;
    if (ease && s.wobbleEnergy > EUC.wobbleStateEnergy) eased = true;
    euc.step(STEP, actions({ throttle: eased ? 0 : 1 }));
  }
  return { peak, announcedAfter, clearedAfter, snapshot: euc.snapshot() };
}

test('a spill announces itself about three metres in, whatever speed you entered at', () => {
  // **The nicest property the injection number has, and it is not a
  // coincidence.** Energy per *metre* of water is `wobbleInjection ×
  // wobbleSurfaceGain` and carries no speed term — the injection scales with
  // speed and so does the ground covered, so they cancel while the decay term
  // is still negligible. The consequence is that how far into a puddle the
  // weave becomes an event is a property of the puddle rather than of the
  // approach, which is what makes a spill something a player can learn.
  const wide = rideSpill(controller({ plan: spillPlan(40) }), false);
  const narrow = rideSpill(controller({ plan: spillPlan(4) }), false);

  for (const run of [wide, narrow]) {
    assert.ok(run.announcedAfter > 2 && run.announcedAfter < 4, `announced after ${run.announcedAfter} m`);
  }
});

test('a puddle is something you ride out of, and it lets go the moment you do', () => {
  const euc = controller({ plan: spillPlan(4) });
  const run = rideSpill(euc, false);

  assert.equal(run.snapshot.crashed, false, 'eight metres of water is not a death sentence');
  assert.ok(run.peak > EUC.wobbleStateEnergy, `but it is a real event: ${run.peak}`);
  assert.ok(run.peak < EUC.wobbleCrashEnergy);
  assert.equal(run.snapshot.surface, 'pavement', 'the rider is out the far side');
  // Well under a second at riding speed. The injection stops dead at the
  // water's edge, so what is left is only the decay — which is a *time*, so the
  // distance it covers scales with the speed. The bound moved with the top
  // speed at M16 and the second it stands for did not.
  assert.ok(run.clearedAfter < 16, `it stopped being an event ${run.clearedAfter} m past the edge`);
});

test("the owner's own sentence: don't correct and you crash — as a wobble, not as a hole", () => {
  // §13 q8, verbatim: "if the rider doesn't reduce speed to correct the wobble,
  // they crash". Forty metres of continuous water at full throttle is what that
  // costs, which is a chain of puddles rather than a puddle.
  const run = rideSpill(controller({ plan: spillPlan(20) }), false);

  assert.equal(run.snapshot.crashed, true);
  // **Not `'hazard'`, and the distinction is the design.** A deep pothole is a
  // wipeout — it happened to you, at the rim, in one step. Water gives you
  // several seconds and two ways out; losing it anyway is losing the
  // oscillation, which is what `'wobble'` has meant since M6.
  assert.equal(run.snapshot.crashCause, 'wobble');
});

test('and the other half of it: ease off and the same water cannot touch you', () => {
  // The instruction has to be reachable or the sentence above is just a
  // punishment. Easing off the throttle on a held line takes the damping from
  // `wobbleDampingAggressive` to `wobbleDampingSmooth` on top of the automatic
  // foot correction, which drops the ceiling below the crash threshold — and
  // the speed the injection scales with falls at the same time.
  const run = rideSpill(controller({ plan: spillPlan(20) }), true);

  assert.equal(run.snapshot.crashed, false, 'the same forty metres of water, survived');
  assert.ok(run.peak < EUC.wobbleCrashEnergy * 0.8, `never close to it: ${run.peak}`);
  assert.ok(run.peak > EUC.wobbleStateEnergy, 'still a genuine wobble, still worth respecting');
});

// ---------------------------------------------------------------------------
// The max-speed cutout — M20
// ---------------------------------------------------------------------------

/**
 * The one failure condition the owner reopened, and the beeps that warn about
 * it (`references/PublicFeedback/FEEDBACK-TRIAGE.md` §2, 2026-08-14).
 *
 * Cut-outs were implemented once, playtested, and removed as annoying. What
 * came back is deliberately narrow — the wheel gives up at the very top of its
 * own speed range and nowhere else — so the tests below are as much about what
 * *cannot* happen as about what can: no cutout under load on a hill, none in
 * the air, none for a rider who backs off, and none at all with the switch off.
 */

/** A kilometre of straight pavement — long enough to actually reach top speed. */
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

/** Hold an input for `seconds`, stopping early on the first crash. */
function hold(euc: EucController, seconds: number, input: ActionSnapshot): EucSnapshot {
  const steps = Math.round(seconds * SIMULATION.hz);
  for (let i = 0; i < steps; i += 1) {
    euc.step(STEP, input);
    if (euc.snapshot().crashed) break;
  }
  return euc.snapshot();
}

test('the wheel derives its own top speed, and it is the one the route validator uses', () => {
  // `RIDEABILITY.topSpeed` is under `level/` and reads the frozen table; the
  // controller has to answer for whatever F4 has just dragged, so it computes
  // the same expression from its own live tuning. If the two ever disagree, a
  // generated route's hazard spacing and the speed the wheel cuts out at are
  // being derived from different wheels.
  assert.ok(
    Math.abs(controller().derivedTopSpeed - RIDEABILITY.topSpeed) < 1e-9,
    `controller says ${controller().derivedTopSpeed}, routeValidator says ${RIDEABILITY.topSpeed}`,
  );
});

test('the beeps start just past the owner\'s 40 mph floor and reach the edge before the cutout does', () => {
  const euc = controller({ plan: runwayPlan(), tuning: { cutoutEnabled: 1 } });
  const top = euc.derivedTopSpeed;

  let firstBeepSpeed = 0;
  let lastRidingSpeed = 0;
  for (let i = 0; i < SIMULATION.hz * 20; i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    const state = euc.snapshot();
    if (firstBeepSpeed === 0 && euc.overspeed > 0) firstBeepSpeed = Math.abs(state.speed);
    if (state.crashed) break;
    lastRidingSpeed = Math.abs(state.speed);
  }

  // "It should beep no earlier than 40mph" — the owner's revision after riding
  // the 30 mph build, so the floor is his and hard; the ceiling only says the
  // share has not wandered.
  assert.ok(
    firstBeepSpeed * 2.236936 >= 40 && firstBeepSpeed * 2.236936 < 41.5,
    `the first beep was at ${(firstBeepSpeed * 2.236936).toFixed(1)} mph`,
  );
  // Full throttle on flat pavement reaches the edge, which is the whole
  // mechanic: the wheel's terminal speed is *above* the cutout speed, so
  // holding the throttle open is what eventually takes the rider off. If this
  // ever fails it means the cutout share has drifted above what the surface's
  // rolling resistance leaves reachable, and the feature has silently become
  // a downhill-only event.
  assert.equal(euc.snapshot().crashed, true, 'flat-out on the flat never reached the cutout');
  assert.equal(euc.snapshot().crashCause, 'cutout');
  assert.ok(
    lastRidingSpeed > top * EUC.cutoutSpeedShare - 0.2,
    `the cutout fired at ${lastRidingSpeed.toFixed(2)} m/s against a threshold of `
      + `${(top * EUC.cutoutSpeedShare).toFixed(2)}`,
  );
});

test('the rider gets seconds of accelerating beeps before it fires, not an ambush', () => {
  const euc = controller({ plan: runwayPlan(), tuning: { cutoutEnabled: 1 } });
  let beepingFor = 0;
  for (let i = 0; i < SIMULATION.hz * 20; i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    if (euc.overspeed > 0) beepingFor += STEP;
    if (euc.snapshot().crashed) break;
  }
  // Measured at about 5 s on the shipped tuning (down from 6.5 when the band
  // started at 30 mph rather than the owner's revised 40). The floor is
  // deliberately well under that: what this pins is that the warning is a
  // *warning* and not a formality, and a fixture that demanded the exact
  // figure would fail on every legitimate tuning change instead.
  assert.ok(beepingFor > 3, `only ${beepingFor.toFixed(2)}s of beeps before the wheel let go`);
});

test('backing off is the counterplay: the hold resets and the wheel keeps going', () => {
  const euc = controller({ plan: runwayPlan(), tuning: { cutoutEnabled: 1 } });
  // Up to the top of the band...
  for (let i = 0; i < SIMULATION.hz * 20; i += 1) {
    euc.step(STEP, actions({ throttle: 1 }));
    if (euc.overspeedHeld > 0) break;
  }
  assert.ok(euc.overspeedHeld > 0, 'the fixture never reached the cutout speed');
  assert.equal(euc.snapshot().crashed, false, 'it fired before the hold was up');

  // ...and off it. **Half a second, not three**, and the number is the point:
  // drag at this speed is 7 m/s², so a wheel that coasts for three seconds has
  // lost fifteen metres per second and is nowhere near the band any more. The
  // counterplay this test is about is a *lift*, not a stop.
  const after = hold(euc, 0.5, actions({ throttle: 0 }));
  assert.equal(after.crashed, false, 'lifting off did not save the rider');
  assert.equal(euc.overspeedHeld, 0, 'the hold is reset, not decayed');
  // Above zero rather than a mid-band figure: since the owner moved the first
  // beep to 40 mph the band is ~4 m/s wide, and drag at the top of it sheds
  // most of that in this half second. What matters is that a *lift* leaves the
  // rider still inside the warning rather than teleported to silence.
  assert.ok(euc.overspeed > 0, 'and the beeps are still going, which is the point');
});

test('riding the beeps: a steady speed just under the edge is survivable indefinitely', () => {
  // The mechanic the owner named. A rider who modulates the throttle to sit
  // under the cutout speed can hold the fastest riding in the game for as long
  // as they like, at the fastest beep rate — that gap between "as fast as the
  // wheel goes" and "as fast as you dare" is the whole feature.
  const euc = controller({ plan: runwayPlan(), tuning: { cutoutEnabled: 1 } });
  const edge = euc.derivedTopSpeed * EUC.cutoutSpeedShare;
  let fastestSeen = 0;
  for (let i = 0; i < SIMULATION.hz * 30; i += 1) {
    // The simplest possible pilot: full throttle under the edge, off it above.
    const speed = Math.abs(euc.snapshot().speed);
    euc.step(STEP, actions({ throttle: speed < edge - 0.35 ? 1 : 0 }));
    fastestSeen = Math.max(fastestSeen, speed);
    if (euc.snapshot().crashed) break;
  }
  assert.equal(euc.snapshot().crashed, false, 'a rider holding under the edge was cut out anyway');
  assert.ok(fastestSeen > edge - 1, `they only managed ${fastestSeen.toFixed(2)} m/s of ${edge.toFixed(2)}`);
  assert.ok(euc.overspeed > 0.9, 'and they are riding the fastest beeps while they do it');
});

test('a climb at full throttle is the ladder\'s business and never the cutout\'s', () => {
  // The distinction the whole design rests on. Tilt-back exists for load and
  // the cutout exists for speed; a hill is the one situation that produces the
  // first and forbids the second, so a rider grinding up one must be able to
  // hold full throttle for as long as the hill lasts. A cutout here would be
  // the removed realism coming back through the side door.
  const euc = controller({ plan: rampPlan(0.2), tuning: { cutoutEnabled: 1 } });
  const climbed = hold(euc, 12, actions({ throttle: 1 }));
  assert.equal(climbed.crashed, false, `the climb cut the rider out (${climbed.crashCause})`);
  // `warn` rather than `tiltBack` at a settled 1-in-5: `data/tuning.ts` says a
  // settled climb at full throttle sits in the amber rung and it is *charging*
  // a hill at speed that spikes into tilt-back. What matters here is only that
  // the ladder is the mechanism that answered a hill, so the assertion is that
  // it is lit rather than which rung.
  assert.notEqual(climbed.powerStage, 'normal', 'the ladder said nothing about a 1-in-5 climb');
  // **The beeps may legitimately be sounding here, and that is not a bug.** A
  // 1-in-5 climb at full throttle still settles near 44 mph on this wheel, which
  // is genuinely inside the over-speed band — the rider really is going that
  // fast. What must not happen is the *cutout*, and the margin is what says so:
  // the climb costs enough drive authority that the edge is out of reach, which
  // is the arithmetic keeping load and speed as two separate questions.
  assert.ok(
    euc.overspeed < 0.95,
    `the climb reached ${euc.overspeed.toFixed(2)} of the band — too close to the edge to be safe`,
  );
});

test('the switch turns the whole feature off, beeps included', () => {
  const euc = controller({ plan: runwayPlan(), tuning: { cutoutEnabled: 0 } });
  const ridden = hold(euc, 20, actions({ throttle: 1 }));
  assert.equal(ridden.crashed, false, 'the cutout fired with the feature switched off');
  assert.equal(euc.overspeed, 0, 'and it was beeping about a cutout that cannot happen');
  assert.ok(
    Math.abs(ridden.speed) > euc.derivedTopSpeed * EUC.cutoutSpeedShare,
    'the fixture never got fast enough for the assertion above to mean anything',
  );
});

test('a crash of any kind clears the over-speed state rather than replaying it', () => {
  // Both halves matter and for different reasons. A beep or a glyph over the
  // top of a wipeout describes a situation that has stopped existing; a *hold*
  // left running would cut the rider out again the instant they respawned, on
  // a wheel that is standing still.
  const euc = controller({ plan: runwayPlan(), tuning: { cutoutEnabled: 1 } });
  hold(euc, 20, actions({ throttle: 1 }));
  assert.equal(euc.snapshot().crashCause, 'cutout');
  assert.equal(euc.overspeed, 0, 'still beeping at a rider on the floor');
  assert.equal(euc.overspeedHeld, 0, 'the hold survived the crash it caused');
});

test('the attack stance takes a held throttle at speed, and nothing else', () => {
  // **M23, from two photographs the owner filed in `references/`.** He asked
  // for the racer's forward lean, and he said exactly when it may arrive: the
  // rider has *"held forward for like a couple of seconds"*. That word is the
  // whole contract — a blip must not produce the pose, and neither must a
  // rider who is merely moving fast on a rolling throttle.
  const euc = controller();
  const pose = createPose();

  // Up to speed, but only just there: the clock has not run.
  ride(euc, SECONDS(1.0), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(
    pose.attack < 0.02,
    `a second of throttle is not the attack stance: ${pose.attack}`,
  );

  // Held. The delay plus the ramp plus the blend's own easing.
  ride(euc, SECONDS(EUC.attackDelaySeconds + EUC.attackRampSeconds + 1), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(pose.attack > 0.95, `a held throttle must reach the stance, not ${pose.attack}`);

  // Released: the clock resets at once and the blend eases out.
  ride(euc, SECONDS(1.0), { throttle: 0 });
  euc.writePose(pose);
  assert.ok(pose.attack < 0.05, `lifting off must stand the rider up, not ${pose.attack}`);

  // And it does not come back on the *next* blip, because the clock restarted.
  ride(euc, SECONDS(0.5), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(pose.attack < 0.05, `a blip re-entered the stance at ${pose.attack}`);

  // Speed is a gate of its own: a rider who has held the throttle forever but
  // is crawling — up a hill, off-surface, whatever costs them the speed — is
  // not in a racer's tuck.
  const crawler = controller();
  const slow = createPose();
  ride(crawler, SECONDS(0.4), { throttle: 1 });
  crawler.writePose(slow);
  assert.ok(crawler.snapshot().speed < EUC.attackSpeed, 'the crawler got up to speed too fast');
  assert.equal(slow.attack, 0, 'the stance arrived below its speed gate');
});

test('the hard-carve stance needs roll AND speed, which is the owner\'s rule', () => {
  // **M23.** *"Not at slow speed, as that's when people [are] fooling around
  // doing playful turns, not carving."* So the blend is a product: either
  // input alone is a pose the game already has — a full-lock steer at walking
  // pace is the technical turn, and speed on its own is the attack stance.
  const euc = controller();
  const pose = createPose();

  // Fast and straight: nothing.
  ride(euc, SECONDS(4), { throttle: 1 });
  euc.writePose(pose);
  assert.ok(euc.snapshot().speed > EUC.carveStanceFullSpeed, 'the run-up did not reach speed');
  assert.equal(pose.carveStance, 0, 'a straight line is not a carve');

  // Fast and turning hard: the stance.
  ride(euc, SECONDS(2), { throttle: 0.6, steer: 1 });
  euc.writePose(pose);
  assert.ok(
    Math.abs(euc.snapshot().rollAngle) > EUC.carveStanceFullRoll,
    `the carve did not reach full roll: ${euc.snapshot().rollAngle}`,
  );
  assert.ok(pose.carveStance > 0.9, `a committed corner must reach the stance, not ${pose.carveStance}`);

  // Straightening up drops it.
  ride(euc, SECONDS(1.5), { throttle: 0.6 });
  euc.writePose(pose);
  assert.ok(pose.carveStance < 0.05, `the stance outlived the corner: ${pose.carveStance}`);

  // Slow and turning hard: the playful turn, and nothing else.
  const playing = controller();
  const play = createPose();
  ride(playing, SECONDS(0.8), { throttle: 0.35 });
  ride(playing, SECONDS(2), { throttle: 0.2, steer: 1 });
  playing.writePose(play);
  assert.ok(
    playing.snapshot().speed < EUC.carveStanceSpeed,
    `the playful turn was not slow: ${playing.snapshot().speed}`,
  );
  assert.equal(play.carveStance, 0, 'a playful turn reached the racing stance');
});

// ---------------------------------------------------------------------------
// The 180° spin jump — M24
// ---------------------------------------------------------------------------
//
// The owner-accepted trick input (FEEDBACK-TRIAGE §5): pressing hop again while
// airborne sweeps the heading through π. The physics was already paid for by
// M5 — travel frozen at takeoff, heading free in flight, landing speed
// recomposed as `speed * alignment` — so what these pin is the move's own
// grammar: the sweep, the landing fold that keeps a clean 180 from scoring as
// a crash, and the reverse-state reconciliation that makes it the first legal
// way to enter reverse at speed.

/** Hop from the current state, air-tap at apex-ish, ride out the landing. */
function spinJump(euc: EucController, held: Partial<ActionSnapshot> = {}): EucSnapshot {
  ride(euc, 1, { ...held, hop: true });
  // Let the compression spend itself and the wheel leave the ground.
  let guard = 0;
  while (euc.snapshot().grounded) {
    ride(euc, 1, held);
    assert.ok((guard += 1) < 200, 'the hop never left the ground');
  }
  // The air-tap. One step with the flag up is exactly what a press delivers.
  ride(euc, 1, { ...held, hop: true });
  guard = 0;
  while (!euc.snapshot().grounded) {
    ride(euc, 1, held);
    assert.ok((guard += 1) < 400, 'the spin jump never landed');
  }
  return euc.snapshot();
}

test('a standing spin jump lands facing the other way, cleanly', () => {
  const euc = controller();
  const before = euc.snapshot().headingY;
  const after = spinJump(euc);

  assert.ok(
    Math.abs(after.headingY - (before + Math.PI)) < 0.02,
    `heading moved ${(after.headingY - before).toFixed(3)} rad, not +π`,
  );
  assert.equal(after.spins, 1);
  assert.equal(after.crashed, false);
  assert.equal(after.landingQuality, 'clean', `landing scored ${after.landingQuality}`);
  assert.ok(
    after.landingMisalignment < 0.05,
    `a completed 180 was charged ${after.landingMisalignment.toFixed(2)} rad of misalignment`,
  );
  assert.ok(Math.abs(after.speed) < 0.2, 'a standing spin invented travel');
  assert.equal(after.reversing, false, 'a standing spin engaged reverse');
});

test('steer held at the tap picks the spin direction, and right is negative yaw', () => {
  // Steer is applied only on the tap step: held through the flight it would
  // *also* spend the ordinary quarter-authority air yaw on top of the sweep,
  // which is legal riding (over-rotation is the player's own doing) but not
  // what a direction test should measure.
  const spinWithTapSteer = (steer: number): { before: number; after: number } => {
    const euc = controller();
    const before = euc.snapshot().headingY;
    ride(euc, 1, { hop: true });
    let guard = 0;
    while (euc.snapshot().grounded) {
      ride(euc, 1, {});
      assert.ok((guard += 1) < 200, 'the hop never left the ground');
    }
    ride(euc, 1, { hop: true, steer });
    guard = 0;
    while (!euc.snapshot().grounded) {
      ride(euc, 1, {});
      assert.ok((guard += 1) < 400, 'the spin jump never landed');
    }
    return { before, after: euc.snapshot().headingY };
  };

  const right = spinWithTapSteer(1);
  assert.ok(
    Math.abs(right.after - (right.before - Math.PI)) < 0.05,
    `full right steer at the tap did not spin through −π (moved ${
      (right.after - right.before).toFixed(3)} rad)`,
  );
  const neutral = spinWithTapSteer(0);
  assert.ok(
    Math.abs(neutral.after - (neutral.before + Math.PI)) < 0.05,
    'a neutral tap did not take the default left spin',
  );
});

test('a spin at speed lands fakie: rolling backward, reverse engaged, capped', () => {
  const euc = controller();
  rideToSpeed(euc, 10);
  const spun = spinJump(euc, { throttle: 0 });

  assert.ok(spun.speed < 0, `landed at ${spun.speed.toFixed(2)} m/s, not rolling backward`);
  assert.equal(spun.reversing, true, 'the fakie landing left the reverse state disengaged');
  assert.equal(spun.crashed, false, 'a clean 180 crashed');
  // The next grounded step applies the reverse branch's own ceiling: the
  // machine's reverse envelope holds, trick or no trick.
  ride(euc, 2, {});
  const settled = euc.snapshot();
  assert.ok(
    settled.speed >= -EUC.maxReverseSpeed - 1e-6,
    `fakie speed ${settled.speed.toFixed(2)} m/s outran the reverse envelope`,
  );
});

test('a spin out of reverse lands rolling forward and releases reverse', () => {
  const euc = controller();
  // Enter reverse the ordinary way: ask twice from a stop, then build speed.
  ride(euc, SECONDS(1.5), { throttle: -1 });
  const reversing = euc.snapshot();
  assert.equal(reversing.reversing, true, 'the fixture never entered reverse');
  assert.ok(reversing.speed < -2, `reverse only reached ${reversing.speed.toFixed(2)} m/s`);

  const spun = spinJump(euc, { throttle: 0 });
  assert.ok(spun.speed > 0, `landed at ${spun.speed.toFixed(2)} m/s, still backward`);
  assert.equal(spun.reversing, false, 'reverse survived being spun out of');
  assert.equal(spun.crashed, false);
});

test('one flight holds one spin, however often the button is pressed', () => {
  const euc = controller();
  ride(euc, 1, { hop: true });
  let guard = 0;
  while (euc.snapshot().grounded) {
    ride(euc, 1, {});
    assert.ok((guard += 1) < 200, 'the hop never left the ground');
  }
  const before = euc.snapshot().headingY;
  // Mash the button through the flight — press, release, press, release —
  // the way "spam it for crazy spins" will actually be played.
  guard = 0;
  while (!euc.snapshot().grounded) {
    ride(euc, 1, { hop: guard % 2 === 0 });
    assert.ok((guard += 1) < 400, 'the spin jump never landed');
  }
  const after = euc.snapshot();
  assert.equal(after.spins, 1, `${after.spins} spins from one flight`);
  assert.ok(
    Math.abs(after.headingY - (before + Math.PI)) < 0.05,
    'mashing swept past a single 180',
  );
});

test('the spin window is the rising half of the flight, and a falling press is not one', () => {
  // The split that keeps M5's buffered landing hop intact: a press on the
  // way up always has at least the descent left to finish the sweep, so it
  // spins; a press on the way down is the slightly-early hop it always was —
  // `canAcceptSpin` refuses it here, and `app/Game.ts`'s one-shot buffer
  // holds the latch for the landing. Without the refusal, mistiming a
  // landing hop by a tenth of a second would buy a quarter-finished spin and
  // a scrubbed landing nobody asked for.
  const euc = controller();
  rideToSpeed(euc, 8);
  ride(euc, 1, { hop: true });
  let guard = 0;
  while (euc.snapshot().grounded) {
    ride(euc, 1, {});
    assert.ok((guard += 1) < 200, 'the hop never left the ground');
  }
  assert.equal(euc.snapshot().spinning, false);
  // Ride past the apex, then press: the press must not arm a spin.
  guard = 0;
  while (euc.snapshot().verticalVelocity > -0.5) {
    ride(euc, 1, {});
    assert.ok((guard += 1) < 400, 'the flight never turned downward');
  }
  const headingAtPress = euc.snapshot().headingY;
  ride(euc, 1, { hop: true });
  assert.equal(euc.snapshot().spinning, false, 'a falling press armed a spin');
  guard = 0;
  while (!euc.snapshot().grounded) {
    ride(euc, 1, {});
    assert.ok((guard += 1) < 400, 'the flight never landed');
  }
  const after = euc.snapshot();
  assert.equal(after.spins, 0, 'a falling press was counted as a trick');
  assert.ok(
    Math.abs(after.headingY - headingAtPress) < 0.05,
    'a falling press swept the heading anyway',
  );
  assert.equal(after.landingQuality, 'clean', 'the refused press spoiled an ordinary landing');
});

test('the spin state does not survive a crash or a reset', () => {
  const euc = controller();
  rideToSpeed(euc, 10);
  ride(euc, 1, { hop: true });
  let guard = 0;
  while (euc.snapshot().grounded) {
    ride(euc, 1, {});
    assert.ok((guard += 1) < 200, 'the hop never left the ground');
  }
  ride(euc, 1, { hop: true });
  assert.equal(euc.snapshot().spinning, true);
  euc.reset({ position: { x: 0, y: 0, z: 0 }, headingY: 0 });
  assert.equal(euc.snapshot().spinning, false, 'a reset kept a spin in flight');
  assert.equal(euc.snapshot().spins, 0, 'a reset kept the trick counter');
});

test('a wheel stopped inside a bush can drive itself out — M24', () => {
  // The trap the M24 chase work uncovered: the M15 foliage drag's constant
  // term (6.5 m/s²) outmuscled everything a standing start can build, so a
  // wheel that came to rest inside a dense bush held 0.00 m/s under full
  // throttle forever — six measured seconds on this exact fixture — and only
  // Reset could leave. The constant term now fades below
  // `softBodyDragFadeSpeed`, which keeps the cushion untouched at riding
  // speeds (the assertions below check that too) and gives the stopped wheel
  // a walking-pace shove out.
  const plan = flatPlan();
  const euc = new EucController(new PlanTerrainSampler(plan), {
    tuning: { wobbleMasterGain: 0, cutoutEnabled: 0 },
    spawn: plan.spawn,
    hazards: new HazardField([]),
    softBodies: new SoftBodyField([
      { centre: { x: 0, y: 0.6, z: 2 }, halfExtents: { x: 1.6, y: 0.7, z: 1.6 }, rotationY: 0, surface: 'grass' },
    ]),
  });

  // Park dead-centre in the hedge, from rest.
  euc.reset({ position: { x: 0, y: 0, z: 2 }, headingY: 0 });
  const out = ride(euc, SECONDS(6), { throttle: 1 });
  assert.ok(
    Math.hypot(out.position.x - 0, out.position.z - 2) > 1.6,
    `six seconds of full throttle left the wheel inside the hedge (moved to z=${
      out.position.z.toFixed(2)})`,
  );

  // And the cushion still cushions: the same coast with the hedge in the way
  // ends measurably slower than without it, so the fade cannot have eaten the
  // M15 drag the owner accepted — only the standstill trap.
  const coast = (withHedge: boolean): number => {
    const euc = new EucController(new PlanTerrainSampler(plan), {
      tuning: { wobbleMasterGain: 0, cutoutEnabled: 0 },
      spawn: plan.spawn,
      hazards: new HazardField([]),
      softBodies: new SoftBodyField(withHedge
        ? [{
          centre: { x: 0, y: 0.6, z: 60 },
          halfExtents: { x: 1.6, y: 0.7, z: 1.6 },
          rotationY: 0,
          surface: 'grass',
        }]
        : []),
    });
    // Drive through the hedge's station flat out and report the speed just
    // past it, so the two runs differ only by what the body cost.
    const input = actions({ throttle: 1 });
    for (let step = 0; step < SECONDS(10); step += 1) {
      euc.step(STEP, input);
      if (euc.snapshot().position.z >= 64) break;
    }
    return euc.snapshot().speed;
  };
  const clear = coast(false);
  const hedged = coast(true);
  assert.ok(
    hedged < clear - 2,
    `the hedge stopped cushioning (clear coast ${clear.toFixed(1)}, hedged ${hedged.toFixed(1)})`,
  );
});

// ---------------------------------------------------------------------------
// The hard knock — M26 Phase 3 (docs/PLANS.md §26.4, q74/q75/q79)
// ---------------------------------------------------------------------------

/**
 * How far the crash has thrown the rider sideways, signed.
 *
 * `crashSide` is private and it is the whole point of these tests, so it is
 * read where the renderer reads it: `crashLateral` is `crashSide` times a
 * positive spread times a positive blend, so the two share a sign once the
 * separation has begun. A few tenths of a second of stepping is what gets the
 * blend off zero.
 */
function crashLateralAfter(euc: EucController, seconds = 0.4): number {
  ride(euc, SECONDS(seconds), {});
  const pose = createPose();
  euc.writePose(pose);
  return pose.crashLateral;
}

test('a committed strike puts the rider down sideways, parked or flat out', () => {
  // A side fall **at any speed**, on the pedal strike's own argument: the body
  // was deflected out from under the wheel rather than left behind it. A parked
  // rider is the case that would otherwise fall through to `stepOff`, so it is
  // the one worth pinning.
  const parked = controller();
  assert.equal(parked.hardKnock(1, 0), true);
  const down = parked.snapshot();
  assert.equal(down.crashed, true);
  assert.equal(down.crashCause, 'struck');
  assert.equal(down.crashMotion, 'sideFall', 'a struck rider never steps off tidily');

  const moving = controller();
  rideToSpeed(moving, 12);
  assert.equal(moving.hardKnock(1, 0), true);
  assert.equal(moving.snapshot().crashMotion, 'sideFall');
});

test('a struck rider falls the way the paddle was travelling', () => {
  // **Invisible in a test that only asks whether they crashed, and unmistakable
  // on screen** (§26.4): a rider struck from their right must not fall to their
  // right, back into the swing. Riding down +Z, the rider's left is +X, so a
  // head travelling in +X sweeps them to their left and a head travelling in −X
  // sweeps them to their right.
  const left = controller();
  assert.equal(left.hardKnock(1, 0), true);
  assert.ok(crashLateralAfter(left) > 0, 'a head crossing to +X lays them down to their left');

  const right = controller();
  assert.equal(right.hardKnock(-1, 0), true);
  assert.ok(crashLateralAfter(right) < 0, 'and a head crossing to −X to their right');

  // The heading is part of that arithmetic and not an assumption about +X.
  // Turned to face +X, the rider's left is −Z, so the same world-space head
  // travel now lays them down the other way.
  const turned = controller();
  ride(turned, SECONDS(2), { throttle: 0.4, steer: -1 });
  const heading = turned.snapshot().headingY;
  assert.ok(Math.abs(heading) > 0.5, `the fixture must really have turned: ${heading}`);
  const expected = Math.sign(Math.cos(heading));
  assert.equal(turned.hardKnock(1, 0), true);
  assert.equal(
    Math.sign(crashLateralAfter(turned)),
    expected,
    'the side is the head’s travel across *this* rider, not across the world',
  );
});

test('a strike straight down the nose falls back to the lean', () => {
  // A head coming at the chest with no lateral travel has no side to offer.
  // Zero rather than a guess, and `beginCrash` then uses the rule it has always
  // used — which for a dead-upright rider is a step off to their left.
  const euc = controller();
  assert.equal(euc.hardKnock(0, 1), true);
  assert.ok(crashLateralAfter(euc) > 0, 'the default side is the rider’s left');
});

test('nobody is knocked down twice, or while they are getting up', () => {
  // q79's "briefly untouchable" is the window that already exists, not a new
  // timer. Delete either clause of the guard and one of these two fails.
  const euc = controller();
  assert.equal(euc.hardKnock(1, 0), true);
  assert.equal(euc.hardKnock(1, 0), false, 'a rider already on the ground cannot be re-struck');

  const recovered = rideUntil(euc, {}, (snapshot) => !snapshot.crashed, SECONDS(30));
  assert.equal(recovered.reached, true, 'the fixture must actually get back up');
  assert.equal(
    euc.hardKnock(1, 0),
    false,
    'and cannot be put straight back down inside the recovery window',
  );

  // The window is finite, so the refusal is a grace period rather than immunity.
  ride(euc, SECONDS(EUC.crashInvulnerableSeconds + 0.1), {});
  assert.equal(euc.hardKnock(1, 0), true, 'once the window closes they are fair game again');
});

test('a hard knock is not a wobble door', () => {
  // The standing rule from the M13 exit ride, checked at the new caller: a
  // struck rider goes down, and nothing on the way there feeds the oscillator.
  // `softKnock` is the *soft* half's door and stays the fourth and last one.
  const euc = controller({ tuning: { wobbleMasterGain: 1 } });
  ride(euc, SECONDS(2), { throttle: 1 });
  assert.equal(euc.snapshot().wobbleEnergy, 0, 'the fixture starts unwobbled');
  euc.hardKnock(1, 0);
  assert.equal(euc.snapshot().wobbleEnergy, 0);
});

// ---------------------------------------------------------------------------
// M29 — the sober digests (safeguard S1, `docs/PLANS.md` §29.4, §29.8)
// ---------------------------------------------------------------------------

/**
 * **Recorded on 2026-09-02 from the tree as it stood before a ride style
 * existed, and never to be re-pinned without saying why.**
 *
 * M29 gives one rider a *ride style* — theatre on the path and the pose that
 * the owner asked for by name and that every other rider must never catch as
 * a bug. The style is threaded through the controller as a record of numbers
 * whose sober value is zero in every field, so with the sober style installed
 * every term it adds is exactly `+ 0` and the trajectory is bit-for-bit what
 * it was before the style was written. That is a claim about arithmetic, and
 * the way to hold a claim about arithmetic is to hash the whole ride.
 *
 * Six scripted rides, each hashing every pose field the renderer reads at
 * every fixed step — and the ragdoll's floats, and the two snapshot facts a
 * pose does not carry (the wobble energy and whether the rider is down) —
 * folded into one 64-bit digest and pinned below as a number. The scenarios
 * cover the branches a style could plausibly reach: a straight at full
 * throttle, a slalom, a hop and its landing, a shallow pothole and the wobble
 * it starts, a deep pothole's crash and the automatic recovery out of it,
 * and a brake to a stop into reverse with a corner in it.
 *
 * **If one of these moves, a sober controller's ride moved.** That is a red
 * test rather than a report from somebody's couch, which is the whole point:
 * a change that means to move the ride re-pins the digest *and* says so in
 * the changelog; a change that does not mean to has been caught. The field
 * list is spelled out rather than read off `createPose()`, so a pose channel
 * added later (the style's own three, for instance) is not silently folded
 * into a hash that was recorded without it — a new channel gets its own
 * assertion that it is zero on a sober seat, not a re-pin here.
 */

/** The pose fields as `createPose()` listed them on 2026-09-02. Frozen on purpose. */
const DIGEST_FIELDS = Object.freeze([
  'x', 'y', 'z', 'headingY', 'rollAngle', 'riderRoll', 'riderPitch', 'riderLookYaw',
  'riderTurnTwist', 'technicalTurn', 'reverseBlend', 'wheelPitch', 'wheelSpin',
  'groundPitch', 'groundRoll', 'suspensionOffset', 'restFactor', 'speed',
  'crouch', 'tuck', 'attack', 'carveStance', 'airBlend', 'airHeight', 'groundY', 'pedalStrike',
  'wobble', 'wobbleFootCorrection', 'wobbleYaw', 'wobbleRoll', 'wobbleSway', 'wobbleFight',
  'alert', 'crashBlend', 'crashForward', 'crashLateral', 'crashDrop', 'crashTumble', 'crashRoll',
  'wheelCrashLean', 'wheelCrashSpin', 'wheelCrashPop', 'ragdollBlend', 'recoverBlend', 'tiltBack',
] as const);

/**
 * A 64-bit FNV-1a over the exact bytes of every number fed to it, as two
 * independent 32-bit lanes. Bytes rather than decimal strings, so a change
 * in the last bit of a double is a change in the digest — the identity this
 * suite asserts is bit-for-bit, not "close".
 */
class RideDigest {
  private readonly bytes = new DataView(new ArrayBuffer(8));
  private a = 0x811c9dc5;
  private b = 0x050c5d1f;

  number(value: number): void {
    this.bytes.setFloat64(0, value, true);
    for (let i = 0; i < 8; i += 1) this.byte(this.bytes.getUint8(i));
  }

  float32(value: number): void {
    this.bytes.setFloat32(0, value, true);
    for (let i = 0; i < 4; i += 1) this.byte(this.bytes.getUint8(i));
  }

  private byte(value: number): void {
    this.a = Math.imul(this.a ^ value, 0x01000193) >>> 0;
    this.b = Math.imul(this.b ^ value, 0x01000193) >>> 0;
  }

  hex(): string {
    return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0');
  }
}

/** One fixed step, hashed: every listed pose field, the ragdoll, and two snapshot facts. */
function digestStep(euc: EucController, pose: EucPose, digest: RideDigest, input: ActionSnapshot): void {
  euc.step(STEP, input);
  euc.writePose(pose);
  for (const field of DIGEST_FIELDS) digest.number(pose[field]);
  for (let i = 0; i < pose.ragdoll.length; i += 1) digest.float32(pose.ragdoll[i]);
  const snapshot = euc.snapshot();
  digest.number(snapshot.wobbleEnergy);
  digest.number(snapshot.crashed ? 1 : 0);
}

interface DigestRun {
  readonly digest: string;
  readonly steps: number;
  /** Two human-readable facts, so a moved digest says roughly *what* moved. */
  readonly finalZ: number;
  readonly finalSpeed: number;
  readonly crashes: number;
}

/**
 * Each scenario is a script of held inputs against a fresh `controller()` —
 * the suite's own fixture, wobble gate open and cutout off, exactly as every
 * test above rides — and returns the digest of the whole ride.
 */
type DigestScenario = () => { euc: EucController; script: readonly [Partial<ActionSnapshot>, number][] };

const SOBER_SCENARIOS = Object.freeze({
  // A straight at full throttle, through the launch and into the drag limit.
  straight: () => ({
    euc: controller(),
    script: [[{ throttle: 1 }, SECONDS(30)]],
  }),
  // A slalom: full-lock flips every second at speed, then two steady partial carves.
  slalom: () => ({
    euc: controller(),
    script: [
      [{ throttle: 1 }, SECONDS(4)],
      ...Array.from({ length: 12 }, (_, i): [Partial<ActionSnapshot>, number] =>
        [{ throttle: 1, steer: i % 2 === 0 ? 1 : -1 }, SECONDS(1)]),
      [{ throttle: 1, steer: 0.35 }, SECONDS(6)],
      [{ throttle: 1, steer: -0.35 }, SECONDS(6)],
    ],
  }),
  // A hop at speed and the landing after it.
  hop: () => ({
    euc: controller(),
    script: [
      [{ throttle: 1 }, SECONDS(4)],
      [{ throttle: 1, hop: true }, 1],
      [{ throttle: 1 }, SECONDS(5)],
    ],
  }),
  // A shallow pothole at 40 m, the wobble it starts, and the ride out of it.
  pothole: () => ({
    euc: controller({ plan: hazardPlan(), hazards: [potholeAhead(40, 'potholeShallow')] }),
    script: [[{ throttle: 1 }, SECONDS(14)]],
  }),
  // A deep pothole at 40 m: the crash, the tumble, the automatic recovery, and riding on.
  crash: () => ({
    euc: controller({ plan: hazardPlan(), hazards: [potholeAhead(40, 'potholeDeep')] }),
    script: [
      [{ throttle: 1 }, SECONDS(8)],
      [{}, SECONDS(10)],
      [{ throttle: 1 }, SECONDS(6)],
    ],
  }),
  // A brake to a stop, the second ask that engages reverse, a reverse corner, and forward again.
  reverse: () => ({
    euc: controller(),
    script: [
      [{ throttle: 1 }, SECONDS(5)],
      [{ throttle: -1 }, SECONDS(8)],
      [{ throttle: -1, steer: 0.5 }, SECONDS(4)],
      [{ throttle: 1 }, SECONDS(4)],
    ],
  }),
  // `satisfies` rather than an annotation on the constant: `Object.freeze` is
  // generic and would otherwise infer the scripts as loose arrays, while the
  // literal keys stay literal for the pin table below.
} satisfies Record<string, DigestScenario>);

/**
 * Run one scenario and digest it.
 *
 * `dress` is M29 Phase 1's addition and is the whole of safeguard S4's first
 * half: a controller that is handed a style — the sober one explicitly, or a
 * drunk one and then sobered again — has to reproduce the pin below, because
 * *installing* a style is exactly the operation the composition root performs
 * on every seat at every re-dress. The default is no dressing at all, which is
 * the ride the pins were recorded from.
 */
function runSoberScenario(
  name: keyof typeof SOBER_SCENARIOS,
  dress?: (euc: EucController) => void,
): DigestRun {
  const { euc, script } = SOBER_SCENARIOS[name]();
  dress?.(euc);
  const pose = createPose();
  const digest = new RideDigest();
  let steps = 0;
  for (const [held, count] of script) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) digestStep(euc, pose, digest, input);
    steps += count;
  }
  const final = euc.snapshot();
  return {
    digest: digest.hex(),
    steps,
    finalZ: Number(final.position.z.toFixed(4)),
    finalSpeed: Number(final.speed.toFixed(4)),
    crashes: final.crashes,
  };
}

/**
 * The pins. **Recorded before `RideStyle` existed** — the order of Phase 0
 * was the digests first and the plumbing second, so these numbers are the
 * sober controller's own and not the sober *style's*.
 */
const SOBER_DIGESTS: Readonly<Record<keyof typeof SOBER_SCENARIOS, DigestRun>> = Object.freeze({
  straight: { digest: '64740a2c3edb5a2e', steps: 3600, finalZ: 617.723, finalSpeed: 22.2523, crashes: 0 },
  slalom: { digest: '721e285c258f46d2', steps: 3360, finalZ: 430.1683, finalSpeed: 22.2518, crashes: 0 },
  hop: { digest: '72470d1feac04b99', steps: 1081, finalZ: 145.7091, finalSpeed: 21.9176, crashes: 0 },
  pothole: { digest: '0f8857054baee20f', steps: 1680, finalZ: 253.6453, finalSpeed: 19.0448, crashes: 0 },
  crash: { digest: '0dc4dda173d57cdb', steps: 2880, finalZ: 205.8304, finalSpeed: 20.9002, crashes: 1 },
  reverse: { digest: 'ca074ad161f7f7d7', steps: 2520, finalZ: 28.1827, finalSpeed: 17.151, crashes: 0 },
});

test('the six sober rides digest to the numbers recorded before any ride style existed', () => {
  // Every scenario is run before anything is asserted, so a failure names
  // all the rides that moved rather than the first one the loop met.
  const moved: string[] = [];
  for (const name of Object.keys(SOBER_SCENARIOS) as (keyof typeof SOBER_SCENARIOS)[]) {
    const run = runSoberScenario(name);
    try {
      assert.deepEqual(run, SOBER_DIGESTS[name]);
    } catch {
      moved.push(`"${name}": ${JSON.stringify(run)} against the pin ${JSON.stringify(SOBER_DIGESTS[name])}`);
    }
  }
  assert.deepEqual(
    moved,
    [],
    `a sober ride moved:\n  ${moved.join('\n  ')}\nA sober controller's ride is not allowed to `
      + 'change by accident (docs/PLANS.md §29.4 S1); if the change is meant, re-pin and say so.',
  );
});

test('the digest is deterministic, and it is sensitive to the ride rather than to the fixture', () => {
  // Two runs of one scenario agree — the hash is of the ride and nothing
  // else — and a ride that really differs hashes differently, so a green
  // pin above is evidence and not a constant that happens to match itself.
  assert.equal(runSoberScenario('slalom').digest, runSoberScenario('slalom').digest);

  const { euc, script } = SOBER_SCENARIOS.straight();
  euc.setTuning({ dragCoefficient: EUC.dragCoefficient * 1.001 });
  const pose = createPose();
  const digest = new RideDigest();
  for (const [held, count] of script) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) digestStep(euc, pose, digest, input);
  }
  assert.notEqual(digest.hex(), SOBER_DIGESTS.straight.digest, 'a tenth of a percent of drag must move the digest');
});

test('the six scenarios exercise the branches they are named for', () => {
  // A digest of a ride that never left the ground would hold a hop scenario
  // to nothing. Each scenario is checked once for the state it exists to
  // cover, so the pins above are pins of the rides they claim to be.
  const reached = (name: keyof typeof SOBER_SCENARIOS, done: (s: EucSnapshot) => boolean): boolean => {
    const { euc, script } = SOBER_SCENARIOS[name]();
    let hit = false;
    for (const [held, count] of script) {
      const input = actions(held);
      for (let i = 0; i < count; i += 1) {
        euc.step(STEP, input);
        if (done(euc.snapshot())) hit = true;
      }
    }
    return hit;
  };
  assert.equal(reached('straight', (s) => s.speed > 22), true, 'the straight reaches top speed');
  assert.equal(reached('slalom', (s) => s.lateralLimited), true, 'the slalom hits the lateral limit');
  assert.equal(reached('hop', (s) => s.state === 'airborne'), true, 'the hop leaves the ground');
  assert.equal(reached('hop', (s) => s.landings === 1), true, 'and lands');
  assert.equal(reached('pothole', (s) => s.state === 'wobbling'), true, 'the shallow hole starts a wobble');
  assert.equal(reached('pothole', (s) => s.crashed), false, 'and is survivable');
  assert.equal(reached('crash', (s) => s.crashed && s.crashCause === 'hazard'), true, 'the deep hole crashes');
  assert.equal(reached('crash', (s) => s.ragdolling), true, 'the crash ragdolls');
  const { euc: recovered, script: crashScript } = SOBER_SCENARIOS.crash();
  for (const [held, count] of crashScript) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) recovered.step(STEP, input);
  }
  assert.equal(recovered.snapshot().crashed, false, 'and the rider is back up and riding by the end');
  assert.ok(recovered.snapshot().speed > 3, `riding on at ${recovered.snapshot().speed} m/s`);
  assert.equal(reached('reverse', (s) => s.reversing && s.speed < -1), true, 'reverse engages and rolls');
  assert.equal(reached('reverse', (s) => s.reversing && Math.abs(s.yawRate) > 0.2), true, 'and corners in reverse');
});

test('a controller is born sober, a style is stored where it was put, and a reset keeps it', () => {
  // The Phase 0 plumbing, end to end: nothing reads the record yet, so this
  // is the whole of what can be asserted about it — and the digests above are
  // what assert that storing one changed nothing. A reset is `R`, and the seat
  // is still the same character afterwards, so the style must survive it.
  const euc = controller();
  assert.equal(euc.rideStyle, SOBER_STYLE, 'born sober, by default and not by data');

  const style: RideStyle = Object.freeze({ ...SOBER_STYLE, weaveHeading: 0.1 });
  euc.setRideStyle(style);
  assert.equal(euc.rideStyle, style);
  euc.reset();
  assert.equal(euc.rideStyle, style, 'a reset changes the ride, not who is riding');

  euc.setRideStyle(SOBER_STYLE);
  assert.equal(euc.rideStyle, SOBER_STYLE, 'and a seat can be sobered again');
});

// ---------------------------------------------------------------------------
// M29 Phase 1 — the Drunken Master: neutrality, the gates, and the stumble
// (`docs/PLANS.md` §29.4, §29.9 — safeguards S1, S3, S4 and S6)
// ---------------------------------------------------------------------------

/**
 * **A style is theatre. A stat would be a different rider to race against.**
 *
 * The section above pins what a *sober* controller does. This one measures the
 * one rider who is not sober, and every assertion in it is a number rather than
 * a claim, because "he only *looks* drunk" is precisely the kind of promise a
 * couch cannot check. M26 spent a milestone making the couch fair and M27 put
 * four people on it; the Drunkard may not spend that back.
 *
 * The measurements §29.4 asks for, in its own order: the style carries no
 * tuning key; a hands-off straight reaches a mark in the same time; the heading
 * integrated over a minute of hands-off cruising drifts under 2°; the peak
 * lateral excursion is under 0.35 m at every speed; the same hazard reaches the
 * same wobble energy and the same crash verdict; `softKnock` and `hardKnock`
 * return the same outcomes; and a continuously-steered lap is the same lap.
 *
 * Then the gates — walking pace, reverse, air, wobble, crash, steer — and the
 * stumble's own five promises, because §29.4's fun contract ("never annoying")
 * is entirely a claim about when the joke is *off*.
 *
 * Every number below was measured on 2026-09-02 against `DRUNK_STYLE` as it
 * stood that day. The bounds are the plan's where the plan states one, and the
 * measurement with margin where it does not; the measured value is written
 * beside each, so a bound that starts passing for a new reason is visible.
 */

/**
 * Ride at a held speed and report the lateral band the weave carved.
 *
 * Throttle on below the target and off above it — a cruise control crude
 * enough to leave the weave completely alone, which is the point: any steering
 * input at all would fade the gate by `(1 − |steer|)²` and the number that
 * came back would be an answer to a different question.
 */
function lateralBand(
  euc: EucController,
  target: number,
  settleSteps: number,
  measureSteps: number,
): { readonly band: number; readonly peakSway: number; readonly fromLine: number } {
  let fromLine = 0;
  const hold = (steps: number): { lo: number; hi: number; peak: number } => {
    let lo = Infinity;
    let hi = -Infinity;
    let peak = 0;
    for (let i = 0; i < steps; i += 1) {
      euc.step(STEP, actions({ throttle: euc.snapshot().speed < target ? 1 : 0 }));
      const now = euc.snapshot();
      lo = Math.min(lo, now.position.x);
      hi = Math.max(hi, now.position.x);
      peak = Math.max(peak, Math.abs(now.styleSway));
      // From the line the ride started on, every step of it — the settle
      // included. An independent QA pass found the first cut of this test
      // measuring half the band around the trace's own midpoint, which
      // passed a rider sitting 0.56 m off the line he launched on.
      fromLine = Math.max(fromLine, Math.abs(now.position.x));
    }
    return { lo, hi, peak };
  };
  hold(settleSteps);
  const measured = hold(measureSteps);
  return { band: measured.hi - measured.lo, peakSway: measured.peak, fromLine };
}

/** A fresh controller already dressed in a style. */
function drunkController(
  style: RideStyle = DRUNK_STYLE,
  options: Parameters<typeof controller>[0] = {},
): EucController {
  const euc = controller(options);
  euc.setRideStyle(style);
  return euc;
}

test("the drunk style carries no key the wheel's tuning table has, and every number is finite", () => {
  // Neutrality *by construction*, and the cheapest of the seven safeguards to
  // hold: a style with no tuning field cannot change top speed, launch,
  // braking, the lateral limit, the power ladder, wobble energy, a crash
  // threshold or the knock arithmetic, because it has nothing to say about
  // them. A future field named `topSpeed` would fail here on the day it was
  // written rather than on the day somebody lost a race to it.
  const tuning = new Set(Object.keys(defaultEucTuning()));
  const shared = Object.keys(DRUNK_STYLE).filter((key) => tuning.has(key));
  assert.deepEqual(shared, [], `a ride style may not name a tuning field: ${shared.join(', ')}`);

  // And every field is a finite number, which is what makes each term the
  // controller adds a product that a sober zero annihilates rather than a
  // `NaN` that would poison the trajectory of whoever was handed it.
  for (const [key, value] of Object.entries(DRUNK_STYLE)) {
    assert.equal(Number.isFinite(value), true, `${key} is ${value}`);
  }
  assert.equal(Object.isFrozen(DRUNK_STYLE), true);
  assert.equal(Object.keys(DRUNK_STYLE).length, Object.keys(SOBER_STYLE).length);
});

test('the time to a mark is the same drunk or sober, to a tenth of a percent', () => {
  // §29.4's first measured neutrality claim: a hands-off straight at full
  // throttle, timed to a mark. The weave is a *heading* offset and never a
  // speed term, so the wheel covers the same ground at the same rate and only
  // wanders a little across it — the extra path length of a 0.03 rad weave is
  // about 5 parts in 10,000, well inside a fixed step.
  const mark = 500;
  const stepsTo = (euc: EucController): number => {
    const input = actions({ throttle: 1 });
    let steps = 0;
    while (euc.snapshot().position.z < mark) {
      euc.step(STEP, input);
      steps += 1;
      assert.ok(steps < 20000, `never reached ${mark} m`);
    }
    return steps;
  };
  const sober = stepsTo(controller());
  const drunk = stepsTo(drunkController());
  // Measured 2026-09-02: 2966 steps each, *exactly equal* — the bound is the
  // plan's 0.1% because that is what §29.4 promises the owner, but the wheel
  // is currently doing better than the promise, and a drift away from equality
  // is worth reading here before it reaches the bound.
  assert.ok(
    Math.abs(drunk - sober) / sober <= 0.001,
    `${drunk} steps drunk against ${sober} sober is ${((drunk - sober) / sober * 100).toFixed(3)}%`,
  );
});

test('a minute of hands-off cruising drifts under two degrees and comes back to straight', () => {
  // The reason the weave is an *offset* and not a rate. A yaw rate gated on
  // and off mid-cycle leaves a residual heading every time it closes — the
  // first cut measured 2° and 19 m of sideways drift over this same minute —
  // and a rider who ends up pointing somewhere else is a hand on the wheel,
  // which is the one thing §29.4 forbids.
  const euc = drunkController();
  const input = actions({ throttle: 1 });
  let worst = 0;
  let worstX = 0;
  for (let i = 0; i < SECONDS(60); i += 1) {
    euc.step(STEP, input);
    worst = Math.max(worst, Math.abs(euc.snapshot().headingY));
    worstX = Math.max(worstX, Math.abs(euc.snapshot().position.x));
  }
  const degrees = worst * 180 / Math.PI;
  // Measured 2026-09-02 (after the QA repairs): peak 0.44°, residual 0.0000°,
  // peak |x| 0.333 m from the line.
  assert.ok(degrees < 2, `heading reached ${degrees.toFixed(4)}° during the minute`);
  // The heading the rider *keeps* is the heading minus the live offset — the
  // offset is the weave still in progress, and it is owed back to the line
  // the moment the gate closes. What must be zero is everything else.
  const final = euc.snapshot();
  const residual = Math.abs(final.headingY - final.styleHeading) * 180 / Math.PI;
  assert.ok(residual < 0.05, `the minute left ${residual.toFixed(6)}° that the weave does not owe`);
  // The sideways position is bounded from the line the ride started on, the
  // launch included — §29.4's number, measured the way the QA pass asked.
  assert.ok(worstX < 0.35, `wandered ${worstX.toFixed(4)} m from the line`);
});

test("the hands-off weave stays inside a shoulder's width at every speed", () => {
  // §29.4's stated bound — peak lateral excursion under 0.35 m — held at six
  // speeds from below the floor to the top of the range, because the amplitude
  // is speed-dependent twice over: `pace` ramps it in from walking pace, and
  // above cruising `weaveSpeedFull / speed` holds the *excursion* constant
  // rather than letting a fixed heading offset grow into metres at 22 m/s.
  // That second term is the one a reader would not think to check, and the
  // 22 m/s row is the whole reason this test holds six speeds and not one.
  //
  //
  // **Measured from the line the ride started on, launch included** — the
  // independent QA pass's correction. The band is one-sided by arithmetic
  // (the offset's first quarter-lobe is spent under the opening gate, so the
  // lateral integral runs from the line to one side of it), which is why
  // half the peak-to-peak band is not the excursion and never was: the first
  // cut measured 0.31 m around the trace's own midpoint while the rider sat
  // 0.56 m off his line.
  //
  // Measured 2026-09-02, peak |x| from the line over the whole hold:
  //   4 m/s 0.07 · 6 m/s 0.22 · 8 m/s 0.25 · 12 m/s 0.22 · 16 m/s 0.22 ·
  //   22 m/s 0.32
  for (const target of [4, 6, 8, 12, 16, 22]) {
    const euc = drunkController();
    const { band, peakSway, fromLine } = lateralBand(euc, target, SECONDS(20), SECONDS(40));
    assert.ok(
      fromLine < 0.35,
      `at ${target} m/s the weave reached ${fromLine.toFixed(4)} m from the line`,
    );
    if (target >= 6) {
      // And it really is weaving. A gate that silently closed would pass the
      // bound above perfectly, which is the failure mode this half exists for.
      assert.ok(
        band > 0.2,
        `at ${target} m/s the band is only ${band.toFixed(4)} m wide — it has stopped happening`,
      );
    }
    if (target >= 8) {
      assert.ok(peakSway > 0.9, `the sway only reached ${peakSway.toFixed(4)} at ${target} m/s`);
    }
  }
});

test('the same hazard reaches the same wobble energy and the same crash verdict', () => {
  // The neutrality claim that matters most on a couch: a pothole is a pothole.
  // Both hazard scenarios are ridden twice, sober and drunk, and the peak
  // energy and the crash verdict are compared.
  //
  // **The full style, weave and all** — §29.4 anticipated that the weave might
  // move the wheel far enough sideways to change *whether* the hole is hit,
  // and offered a weave-zeroed fallback. It is not needed: the hole is on the
  // spawn line, the weave's excursion is a quarter of a metre and the hazard's
  // radius is a metre, so the hit happens either way and the energy it deposits
  // is identical to the last bit (measured 2026-09-02: 0.550 against 0.550 on
  // the shallow hole, delta exactly 0; the deep hole crashes at 0 energy in
  // both, cause `hazard`, one crash each).
  const run = (kind: HazardKind, style: RideStyle | null): {
    peakEnergy: number; crashes: number; cause: string;
  } => {
    const euc = controller({ plan: hazardPlan(), hazards: [potholeAhead(40, kind)] });
    if (style) euc.setRideStyle(style);
    const script: readonly [Partial<ActionSnapshot>, number][] = kind === 'potholeDeep'
      ? [[{ throttle: 1 }, SECONDS(8)], [{}, SECONDS(10)], [{ throttle: 1 }, SECONDS(6)]]
      : [[{ throttle: 1 }, SECONDS(14)]];
    let peakEnergy = 0;
    let cause = 'none';
    for (const [held, count] of script) {
      const input = actions(held);
      for (let i = 0; i < count; i += 1) {
        euc.step(STEP, input);
        const now = euc.snapshot();
        peakEnergy = Math.max(peakEnergy, now.wobbleEnergy);
        if (now.crashCause !== 'none') cause = now.crashCause;
      }
    }
    return { peakEnergy, crashes: euc.snapshot().crashes, cause };
  };

  const shallowSober = run('potholeShallow', null);
  const shallowDrunk = run('potholeShallow', DRUNK_STYLE);
  assert.ok(shallowSober.peakEnergy > 0.1, 'the shallow hole is a real wobble to compare');
  assert.ok(
    Math.abs(shallowDrunk.peakEnergy - shallowSober.peakEnergy) < 1e-9,
    `the drunk rider took ${shallowDrunk.peakEnergy} out of the hole, sober took ${shallowSober.peakEnergy}`,
  );
  assert.equal(shallowDrunk.crashes, shallowSober.crashes);
  assert.equal(shallowDrunk.cause, shallowSober.cause);

  const deepSober = run('potholeDeep', null);
  const deepDrunk = run('potholeDeep', DRUNK_STYLE);
  assert.equal(deepSober.crashes, 1, 'the deep hole is a real crash to compare');
  assert.equal(deepDrunk.crashes, deepSober.crashes, 'and it is the same crash');
  assert.equal(deepDrunk.cause, deepSober.cause);
  assert.ok(Math.abs(deepDrunk.peakEnergy - deepSober.peakEnergy) < 1e-9);
});

test('both knock doors answer a drunk rider exactly as they answer a sober one', () => {
  // `softKnock` and `hardKnock` are the couch's two contact outcomes and the
  // arithmetic M26 spent a milestone making symmetric. Neither reads the style
  // — the proof is that two controllers in the same state answer identically.
  const atSpeed = (style: RideStyle | null): EucController => {
    const euc = controller();
    if (style) euc.setRideStyle(style);
    const input = actions({ throttle: 1 });
    for (let i = 0; i < SECONDS(6); i += 1) euc.step(STEP, input);
    return euc;
  };

  const soberSoft = atSpeed(null);
  const drunkSoft = atSpeed(DRUNK_STYLE);
  // The same state to start with, because a knock's outcome is a function of
  // it: same speed, same energy. (Measured 2026-09-02: 21.329212534324984 m/s
  // on both, which is the sober digests' claim restated one more time.)
  assert.equal(drunkSoft.snapshot().speed, soberSoft.snapshot().speed);
  soberSoft.softKnock(5);
  drunkSoft.softKnock(5);
  assert.equal(drunkSoft.snapshot().speed, soberSoft.snapshot().speed, 'the soft knock cost the same speed');
  assert.equal(drunkSoft.snapshot().wobbleEnergy, soberSoft.snapshot().wobbleEnergy, 'and the same wobble');
  assert.ok(soberSoft.snapshot().wobbleEnergy > 0, 'a soft knock is a wobble door, so there is something to compare');

  const soberHard = atSpeed(null);
  const drunkHard = atSpeed(DRUNK_STYLE);
  const soberLanded = soberHard.hardKnock(1, 0);
  const drunkLanded = drunkHard.hardKnock(1, 0);
  assert.equal(soberLanded, true, 'a hard knock lands on a rider who is up');
  assert.equal(drunkLanded, soberLanded, 'and it lands on him too');
  assert.equal(drunkHard.snapshot().crashCause, soberHard.snapshot().crashCause);
  assert.equal(drunkHard.snapshot().crashMotion, soberHard.snapshot().crashMotion);
  assert.equal(drunkHard.snapshot().crashes, soberHard.snapshot().crashes);
});

test('S6 — the style never writes wobble energy', () => {
  // The wobble door has four sanctioned callers and the census that says so
  // lives in `simulation/paddle.test.ts`, which this milestone does not touch.
  // This is the other half of the claim: a rider who weaves for a minute, and
  // stumbles eleven times doing it, never puts a single joule into the
  // oscillator — the stumble is *a wobble's look with none of its energy*, so
  // it enters nothing, damps nothing, stacks with nothing and cannot crash.
  const euc = drunkController();
  const input = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(60); i += 1) {
    euc.step(STEP, input);
    const now = euc.snapshot();
    // `Object.is` rather than `=== 0`: a negative zero here would mean some
    // arithmetic had reached the field, which is the thing being denied.
    assert.ok(
      Object.is(now.wobbleEnergy, 0),
      `step ${i} put ${now.wobbleEnergy} into the oscillator`,
    );
    assert.equal(now.state === 'wobbling', false, `step ${i} entered the wobbling state`);
  }
  const final = euc.snapshot();
  assert.equal(final.crashes, 0);
  // Measured 2026-09-02: 11 stumbles in the minute, so the loop above really
  // did watch the thing it claims cannot leak.
  assert.ok(final.stumbles >= 8, `only ${final.stumbles} stumbles happened in the minute`);
});

test('the weave is exactly zero below walking pace', () => {
  // The first gate, and the only one that can be *exactly* zero rather than
  // eased to nothing: a wheel that never got above the floor never opened the
  // gate at all, so `styleGate` is still the zero it was born with and every
  // product hanging off it is a true `+0`.
  const euc = drunkController();
  for (let i = 0; i < SECONDS(20); i += 1) {
    euc.step(STEP, actions({ throttle: euc.snapshot().speed < 2 ? 1 : 0 }));
    const now = euc.snapshot();
    assert.ok(Object.is(now.styleSway, 0), `step ${i}: sway ${now.styleSway} at ${now.speed} m/s`);
    assert.ok(Object.is(now.styleHeading, 0), `step ${i}: heading offset ${now.styleHeading}`);
    assert.ok(Object.is(now.styleWeaveRate, 0), `step ${i}: weave rate ${now.styleWeaveRate}`);
  }
  // And the ride really did happen below the floor rather than never starting.
  assert.ok(euc.snapshot().distanceTravelled > 20, 'the wheel rolled');
  assert.ok(euc.snapshot().speed < DRUNK_STYLE.weaveSpeedFloor, 'and stayed under walking pace');
});

test('the weave eases to nothing in reverse', () => {
  // **Not exactly zero, and it should not be.** The gate is eased at
  // `weaveFadeRate` rather than switched, which §29.4 asks for by name so that
  // "nothing switches"; a rider braking through the floor into reverse
  // therefore carries a decaying remnant rather than a step to zero. What is
  // asserted is the decay: the remnant is already small when reverse engages
  // and is gone by any standard a player could see.
  //
  // Measured 2026-09-02 over the `reverse` scenario's 1289 steps of negative
  // speed: 0.0591 at the first, 0.0109 after half a second, 7.7e-6 after two.
  const euc = drunkController();
  const script: readonly [Partial<ActionSnapshot>, number][] = [
    [{ throttle: 1 }, SECONDS(5)],
    [{ throttle: -1 }, SECONDS(8)],
    [{ throttle: -1, steer: 0.5 }, SECONDS(4)],
    [{ throttle: 1 }, SECONDS(4)],
  ];
  let reversing = 0;
  let firstSway = 0;
  let afterHalf = 0;
  let afterTwo = 0;
  for (const [held, count] of script) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) {
      euc.step(STEP, input);
      const now = euc.snapshot();
      if (now.speed >= 0) continue;
      reversing += 1;
      const sway = Math.abs(now.styleSway);
      if (reversing === 1) firstSway = sway;
      if (reversing * STEP > 0.5) afterHalf = Math.max(afterHalf, sway);
      if (reversing * STEP > 2) afterTwo = Math.max(afterTwo, sway);
    }
  }
  assert.ok(reversing > SECONDS(8), `only ${reversing} steps were spent rolling backwards`);
  assert.ok(firstSway < 0.1, `reverse began with ${firstSway.toFixed(4)} of sway still on the wheel`);
  assert.ok(afterHalf < 0.02, `half a second into reverse the sway was still ${afterHalf.toFixed(5)}`);
  assert.ok(afterTwo < 1e-4, `two seconds into reverse the sway was still ${afterTwo.toExponential(3)}`);
});

test('the weave eases to nothing in the air, at the rate the style names', () => {
  // Airborne is the gate whose closing a player *watches*, and a flight is
  // short — 72 steps at 120 Hz on this hop — so the honest assertion is not
  // "zero" but "already shutting, at the declared rate". The gate is eased by
  // `weaveFadeRate` per second toward a target of zero, and the oscillator it
  // multiplies never exceeds one, so at the nth airborne step the sway cannot
  // exceed `(1 − weaveFadeRate·dt)ⁿ`. That bound is arithmetic rather than a
  // measurement, so it fails the moment the air gate stops being applied —
  // and it is not vacuous, because the sway *starts* the flight near its peak.
  //
  // Measured 2026-09-02: 0.751 at take-off, 0.078 at touchdown, and the worst
  // ratio against the envelope 0.770 of the way to it.
  const euc = drunkController();
  const script: readonly [Partial<ActionSnapshot>, number][] = [
    [{ throttle: 1 }, SECONDS(4)],
    [{ throttle: 1, hop: true }, 1],
    [{ throttle: 1 }, SECONDS(5)],
  ];
  const decay = 1 - Math.min(1, DRUNK_STYLE.weaveFadeRate * STEP);
  let airborne = 0;
  let firstSway = 0;
  let lastSway = 0;
  for (const [held, count] of script) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) {
      euc.step(STEP, input);
      const now = euc.snapshot();
      if (now.state !== 'airborne') continue;
      airborne += 1;
      const sway = Math.abs(now.styleSway);
      if (airborne === 1) firstSway = sway;
      lastSway = sway;
      assert.ok(
        sway <= decay ** airborne + 1e-12,
        `airborne step ${airborne}: sway ${sway} is above the fade envelope ${decay ** airborne}`,
      );
    }
  }
  assert.ok(airborne > SECONDS(0.4), `the hop only spent ${airborne} steps in the air`);
  assert.ok(firstSway > 0.5, `the flight began with only ${firstSway.toFixed(4)} of sway to shut off`);
  assert.ok(lastSway < firstSway * 0.25, `landed still carrying ${lastSway.toFixed(4)} of ${firstSway.toFixed(4)}`);
});

test('every style channel is exactly zero while the rider is down', () => {
  // A crash clears the style outright rather than fading it, because the
  // theatre stops with the rider: `beginCrash` calls the same clear the reset
  // does, and a stumble that was running is over rather than paused.
  const euc = drunkController(DRUNK_STYLE, {
    plan: hazardPlan(),
    hazards: [potholeAhead(40, 'potholeDeep')],
  });
  const script: readonly [Partial<ActionSnapshot>, number][] = [
    [{ throttle: 1 }, SECONDS(8)],
    [{}, SECONDS(10)],
    [{ throttle: 1 }, SECONDS(6)],
  ];
  let crashed = 0;
  for (const [held, count] of script) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) {
      euc.step(STEP, input);
      const now = euc.snapshot();
      if (!now.crashed) continue;
      crashed += 1;
      assert.ok(Object.is(now.styleSway, 0), `crashed step ${crashed}: sway ${now.styleSway}`);
      assert.ok(Object.is(now.styleHeading, 0), `crashed step ${crashed}: heading ${now.styleHeading}`);
      assert.ok(Object.is(now.styleWeaveRate, 0), `crashed step ${crashed}: rate ${now.styleWeaveRate}`);
      assert.ok(Object.is(now.styleYaw, 0), `crashed step ${crashed}: yaw ${now.styleYaw}`);
      assert.ok(Object.is(now.styleRoll, 0), `crashed step ${crashed}: roll ${now.styleRoll}`);
      assert.ok(Object.is(now.styleStumble, 0), `crashed step ${crashed}: stumble ${now.styleStumble}`);
    }
  }
  // Measured 2026-09-02: 301 crashed steps, every channel a true `+0` on all
  // of them, and the rider back up and riding by the end.
  assert.ok(crashed > SECONDS(2), `only ${crashed} steps were spent on the ground`);
  assert.equal(euc.snapshot().crashed, false, 'and the recovery happened');
});

test('the weave fades away under the stick and settles back when it is let go', () => {
  // §29.4's fun contract in one measurement: a player threading a gap never
  // feels a hand on the wheel. The fade is `(1 − |steer|)²`, so half the weave
  // is gone at a third of a stick and full lock leaves essentially none of it.
  //
  // Measured 2026-09-02: hands-off peak 0.998; full lock 7.1e-4, which is
  // 0.071% of it; and within two to four seconds of release the sway is back
  // past a third of its hands-off peak — the recovery is the *gate* easing in
  // at 3/s (99.8% back in two seconds), and what the window is waiting for is
  // the two incommensurate cosines to come back round to an excursion.
  const euc = drunkController();
  const open = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(20); i += 1) euc.step(STEP, open);
  let handsOff = 0;
  for (let i = 0; i < SECONDS(8); i += 1) {
    euc.step(STEP, open);
    handsOff = Math.max(handsOff, Math.abs(euc.snapshot().styleSway));
  }
  assert.ok(handsOff > 0.9, `the hands-off baseline only reached ${handsOff.toFixed(4)}`);

  // Two seconds of full lock to let the gate close, then measure two more.
  const locked = actions({ throttle: 1, steer: 1 });
  for (let i = 0; i < SECONDS(2); i += 1) euc.step(STEP, locked);
  let underLock = 0;
  for (let i = 0; i < SECONDS(2); i += 1) {
    euc.step(STEP, locked);
    underLock = Math.max(underLock, Math.abs(euc.snapshot().styleSway));
  }
  assert.ok(
    underLock < handsOff * 0.05,
    `full lock left ${(underLock / handsOff * 100).toFixed(3)}% of the weave on the wheel`,
  );

  let back = 0;
  for (let i = 0; i < SECONDS(4); i += 1) {
    euc.step(STEP, open);
    back = Math.max(back, Math.abs(euc.snapshot().styleSway));
  }
  assert.ok(
    back > handsOff * 0.3,
    `four seconds after letting go the weave was only ${(back / handsOff * 100).toFixed(1)}% back`,
  );
});

test('the stumble arrives at the same step every run, a spacing of road apart', () => {
  // "Counted on the fixed step, so `advance(n)` reaches the same one every
  // run" — the promise the browser spec will lean on, made here where it is
  // cheap. Two fresh controllers, identical scripts, and the same step.
  //
  // Measured 2026-09-02: step 858 (0-based), at 110.107 m of distance
  // travelled against a 110 m spacing, 11 stumbles in a minute, and every
  // gap between consecutive ones 110.07–110.15 m.
  const firstStumbleStep = (): { step: number; distance: number } => {
    const euc = drunkController();
    const input = actions({ throttle: 1 });
    for (let step = 0; step < SECONDS(60); step += 1) {
      euc.step(STEP, input);
      if (euc.snapshot().stumbles > 0) return { step, distance: euc.snapshot().distanceTravelled };
    }
    assert.fail('no stumble inside a minute of riding');
  };
  const first = firstStumbleStep();
  const second = firstStumbleStep();
  assert.equal(second.step, first.step, 'two identical rides stumbled on different steps');
  assert.equal(second.distance, first.distance);
  assert.ok(
    Math.abs(first.distance - DRUNK_STYLE.stumbleEvery) < 2,
    `the first stumble came at ${first.distance.toFixed(3)} m, not near the ${DRUNK_STYLE.stumbleEvery} m spacing`,
  );

  // And never twice inside the spacing: the metre count goes back to zero
  // rather than to minus the spacing, so a stumble held back by a gate does
  // not owe the road a sooner one.
  const euc = drunkController();
  const input = actions({ throttle: 1 });
  const gaps: number[] = [];
  let seen = 0;
  let lastDistance = 0;
  for (let step = 0; step < SECONDS(120); step += 1) {
    euc.step(STEP, input);
    const now = euc.snapshot();
    if (now.stumbles === seen) continue;
    seen = now.stumbles;
    if (lastDistance > 0) gaps.push(now.distanceTravelled - lastDistance);
    lastDistance = now.distanceTravelled;
  }
  assert.ok(gaps.length > 15, `only ${gaps.length + 1} stumbles in two minutes`);
  for (const gap of gaps) {
    assert.ok(
      gap >= DRUNK_STYLE.stumbleEvery - 1,
      `two stumbles were only ${gap.toFixed(3)} m apart`,
    );
  }
});

test('a stumble lasts its half second, peaks where the style says, and sums to nothing', () => {
  // The shape of the burst, and the reason it is safe to spend on the travel
  // heading. A sine envelope zero at both ends, a symmetric shimmy inside it:
  // the machine leaves and returns to exactly where it was, so the contact
  // patch really shimmies and the ride ends up nowhere new.
  //
  // Measured 2026-09-02: 59 steps of envelope against the 60 a half second
  // asks for, peak |yaw| 0.88 of `stumbleYaw`, and the worst per-stumble sum
  // 3.0e-16 rad — floating-point dust rather than a drift.
  //
  // **The peak is under the style's number, and that is the shape's
  // guarantee, not a shortfall.** The shimmy is odd about the burst's
  // midpoint — the QA pass found the first cut's carrier cancelling only at
  // the shipped 3 Hz × 0.5 s and drifting 4.3 m a minute at a legal 1 Hz —
  // so the carrier crosses zero exactly where the envelope peaks, and the
  // product's peak lands a little either side of the middle.
  const euc = drunkController();
  const input = actions({ throttle: 1 });
  const lengths: number[] = [];
  const sums: number[] = [];
  const peaks: number[] = [];
  let running = false;
  let length = 0;
  let sum = 0;
  let peak = 0;
  for (let step = 0; step < SECONDS(120); step += 1) {
    euc.step(STEP, input);
    const now = euc.snapshot();
    if (now.styleStumble > 0) {
      running = true;
      length += 1;
      sum += now.styleYaw;
      peak = Math.max(peak, Math.abs(now.styleYaw));
      // The roll rides the same envelope and the same shimmy, so the two are
      // in a fixed ratio all the way through — one oscillator, not two.
      assert.ok(
        Math.abs(now.styleRoll * DRUNK_STYLE.stumbleYaw - now.styleYaw * DRUNK_STYLE.stumbleRoll) < 1e-12,
        'the stumble roll and yaw came off different clocks',
      );
    } else if (running) {
      running = false;
      lengths.push(length);
      sums.push(sum);
      peaks.push(peak);
      length = 0;
      sum = 0;
      peak = 0;
    }
  }
  assert.ok(lengths.length > 15, `only ${lengths.length} complete stumbles in two minutes`);
  const wanted = Math.round(DRUNK_STYLE.stumbleSeconds * SIMULATION.hz);
  for (const measured of lengths) {
    assert.ok(
      Math.abs(measured - wanted) <= 2,
      `a stumble ran ${measured} steps against the ${wanted} its half second asks for`,
    );
  }
  for (const measured of sums) {
    assert.ok(Math.abs(measured) < 1e-9, `a stumble's yaw summed to ${measured.toExponential(3)} rad`);
  }
  for (const measured of peaks) {
    assert.ok(
      measured > 0.8 * DRUNK_STYLE.stumbleYaw && measured <= DRUNK_STYLE.stumbleYaw + 1e-12,
      `a stumble peaked at ${measured} rad against the style's ${DRUNK_STYLE.stumbleYaw}`,
    );
  }
});

test('a stumble sums to nothing at every length and rate the panel allows, not only the shipped pair', () => {
  // The QA pass's finding 6, as a test: with the weave off so the stumble is
  // the only thing moving the wheel, a minute of riding at each of five
  // legal F4 pairs ends within a centimetre of the line it started on. The
  // first cut drifted 4.27 m at 1 Hz × 0.5 s and 0.3 m at 3 Hz × 0.45 s;
  // the odd carrier makes every pair 0.0003 m or less (measured).
  for (const [rate, seconds] of [[1, 0.5], [3, 0.5], [3, 0.45], [3, 0.55], [5, 0.35], [8, 1.5]] as const) {
    const euc = drunkController({ ...DRUNK_STYLE, weaveHeading: 0, stumbleRate: rate, stumbleSeconds: seconds });
    const input = actions({ throttle: 1 });
    let sum = 0;
    for (let i = 0; i < SECONDS(60); i += 1) {
      euc.step(STEP, input);
      sum += euc.snapshot().styleYaw;
    }
    const final = euc.snapshot();
    assert.ok(final.stumbles >= 8, `${rate} Hz × ${seconds} s: only ${final.stumbles} stumbles in a minute`);
    assert.ok(
      Math.abs(final.position.x) < 0.01,
      `${rate} Hz × ${seconds} s: drifted ${final.position.x.toFixed(4)} m over ${final.stumbles} stumbles`,
    );
    assert.ok(Math.abs(sum) < 1e-9, `${rate} Hz × ${seconds} s: the yaw summed to ${sum.toExponential(3)}`);
    assert.ok(Object.is(final.headingY, 0) || Math.abs(final.headingY) < 1e-12, 'the heading never saw it');
  }
});

test('a full-lock carve through the grip limit leaves no heading the weave does not owe', () => {
  // The QA pass's finding 1. The lateral clamp clips the *sum* of the
  // steering and the weave, and a full-lock carve at speed is where it binds;
  // the first cut recorded the weave's return correction as delivered when
  // the clamp had thrown it away, and a rider came out of every hard corner
  // 0.68° off the heading a sober rider took out of the same corner, and
  // 2.8 m away ten seconds later. The offset now advances by what the clamp
  // let through, so the debt is repaid once the clamp stops binding: the
  // residual after the corner is 0.0004° (measured), and it is measured
  // *against a sober rider driven identically* so the corner itself is not
  // in the number. Both directions, and the offset's own sign is checked at
  // the moment of release so the test is known to be looking at a debt.
  for (const steer of [1, -1]) {
    const sober = controller();
    const drunk = drunkController();
    for (const euc of [sober, drunk]) {
      for (let i = 0; i < SECONDS(4); i += 1) euc.step(STEP, actions({ throttle: 1 }));
      for (let i = 0; i < SECONDS(10); i += 1) euc.step(STEP, actions({ throttle: 1, steer }));
    }
    assert.ok(drunk.snapshot().lateralLimited || sober.snapshot().lateralLimited, 'the carve reached the grip limit');
    const owedAtRelease = drunk.snapshot().styleHeading;
    assert.ok(Math.abs(owedAtRelease) > 1e-4, `nothing was owed at release (${owedAtRelease}) — the clamp never bit the weave`);
    for (const euc of [sober, drunk]) {
      for (let i = 0; i < SECONDS(10); i += 1) euc.step(STEP, actions({ throttle: 1 }));
    }
    const d = drunk.snapshot();
    const residual = Math.abs(d.headingY - sober.snapshot().headingY - d.styleHeading) * 180 / Math.PI;
    assert.ok(residual < 0.02, `steer ${steer}: ${residual.toFixed(5)}° of heading survived the corner unowed`);
  }
});

test('S4 — dressing a drunk seat sober clears the sway, the stumble and the offset on the spot', () => {
  // The QA pass's finding 2. A sober record is every field at zero, and a
  // product with zero cannot undo a sway that was already standing or a
  // stumble already running — and a zero fade rate is exactly what stopped
  // the gate from ever closing them: the sway sat frozen at −0.86 five
  // seconds after a swap, the new rig's first frame wore the old stumble's
  // bracing, and the first sober step asked for 1.4 rad/s of yaw to return
  // an offset nobody owned any more. `setRideStyle` now clears the live
  // state when the style changes *kind*, and this rides the exact sequence
  // the chooser produces: ride drunk, swap, keep riding — no reset.
  const euc = drunkController();
  const input = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(8); i += 1) euc.step(STEP, input);
  assert.ok(Math.abs(euc.snapshot().styleSway) > 0.1, 'the seat was swaying up to the swap');
  euc.setRideStyle(SOBER_STYLE);
  euc.step(STEP, input);
  const first = euc.snapshot();
  for (const [name, value] of Object.entries({
    styleSway: first.styleSway, styleHeading: first.styleHeading, styleWeaveRate: first.styleWeaveRate,
    styleYaw: first.styleYaw, styleRoll: first.styleRoll, styleStumble: first.styleStumble,
  })) {
    assert.ok(Object.is(value, 0), `the first sober step still carried ${name} = ${value}`);
  }
  assert.equal(first.stumbles, 0, 'the stumble count is the new rider\'s');
  for (let i = 0; i < SECONDS(5); i += 1) euc.step(STEP, input);
  assert.ok(Object.is(euc.snapshot().styleSway, 0), 'and five seconds later the sway is still exactly zero');

  // A swap in the middle of a stumble ends it there and then.
  const mid = drunkController();
  let swapped = false;
  for (let i = 0; i < SECONDS(30) && !swapped; i += 1) {
    mid.step(STEP, input);
    if (mid.snapshot().styleStumble > 0.5) {
      mid.setRideStyle(SOBER_STYLE);
      swapped = true;
    }
  }
  assert.equal(swapped, true, 'a stumble was reached to swap inside of');
  mid.step(STEP, input);
  assert.ok(Object.is(mid.snapshot().styleStumble, 0) && Object.is(mid.snapshot().styleYaw, 0),
    'the stumble did not survive the swap');

  // And a retune of the *same kind* keeps its continuity — a slider is not a
  // new rider. The F4 path hands the controller a fresh copy on every change.
  const tuned = drunkController();
  for (let i = 0; i < SECONDS(8); i += 1) tuned.step(STEP, input);
  const before = tuned.snapshot().styleSway;
  tuned.setRideStyle({ ...DRUNK_STYLE, stumbleEvery: 50 });
  tuned.step(STEP, input);
  assert.ok(Math.abs(tuned.snapshot().styleSway - before) < 0.05, 'a retune did not restart the sway');
});

test('a stumble never fires in the air, in a crash, or below walking pace', () => {
  // Three gates, each ridden with a **five-metre spacing** rather than the
  // shipped 110 m. That substitution is what makes these assertions able to
  // fail: at the real spacing a hop is over long before the next stumble is
  // due, so a test that watched one would be green whether the gate existed
  // or not. At five metres a rider covers two spacings inside a single hop.
  const tight: RideStyle = Object.freeze({ ...DRUNK_STYLE, stumbleEvery: 5 });

  // In the air: metres are counted only while riding, so a flight banks none —
  // and a stumble that was running when the wheel left the ground is over,
  // not paused. (Measured 2026-09-02: a stumble at 0.999 of its envelope one
  // step before take-off, and nothing live on any of the 72 airborne steps.)
  const hopper = drunkController(tight);
  const hopScript: readonly [Partial<ActionSnapshot>, number][] = [
    [{ throttle: 1 }, SECONDS(4)],
    [{ throttle: 1, hop: true }, 1],
    [{ throttle: 1 }, SECONDS(5)],
  ];
  let airborne = 0;
  let stumblesAtTakeOff = -1;
  let liveAtTakeOff = 0;
  for (const [held, count] of hopScript) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) {
      const before = hopper.snapshot();
      hopper.step(STEP, input);
      const now = hopper.snapshot();
      if (now.state !== 'airborne') continue;
      if (airborne === 0) {
        stumblesAtTakeOff = before.stumbles;
        liveAtTakeOff = before.styleStumble;
      }
      airborne += 1;
      assert.ok(Object.is(now.styleStumble, 0), `airborne step ${airborne} was stumbling`);
      assert.ok(Object.is(now.styleYaw, 0), `airborne step ${airborne} carried ${now.styleYaw} of stumble yaw`);
      assert.ok(Object.is(now.styleRoll, 0), `airborne step ${airborne} carried ${now.styleRoll} of stumble roll`);
      assert.equal(now.stumbles, stumblesAtTakeOff, `a stumble started at airborne step ${airborne}`);
    }
  }
  assert.ok(airborne > SECONDS(0.4), `the hop only lasted ${airborne} steps`);
  assert.ok(stumblesAtTakeOff > 0, 'the tight spacing really was firing stumbles before the hop');
  assert.ok(liveAtTakeOff > 0.5, 'and one was running as the wheel left the ground, so the cut is visible');

  // In a crash: the same claim over ten times as many steps, and the rider is
  // travelling for most of them.
  const faller = drunkController(tight, {
    plan: hazardPlan(),
    hazards: [potholeAhead(40, 'potholeDeep')],
  });
  const crashScript: readonly [Partial<ActionSnapshot>, number][] = [
    [{ throttle: 1 }, SECONDS(8)],
    [{}, SECONDS(10)],
    [{ throttle: 1 }, SECONDS(6)],
  ];
  let down = 0;
  let stumblesAtImpact = -1;
  for (const [held, count] of crashScript) {
    const input = actions(held);
    for (let i = 0; i < count; i += 1) {
      const before = faller.snapshot();
      faller.step(STEP, input);
      const now = faller.snapshot();
      if (!now.crashed) continue;
      if (down === 0) stumblesAtImpact = before.stumbles;
      down += 1;
      assert.equal(now.stumbles, stumblesAtImpact, `a stumble started on crashed step ${down}`);
    }
  }
  assert.ok(down > SECONDS(2), `only ${down} steps were spent on the ground`);
  assert.ok(stumblesAtImpact > 0, 'the tight spacing was firing before the hole, too');

  // Below walking pace: over a hundred metres of road at 2 m/s, and not one.
  const crawler = drunkController(tight);
  for (let i = 0; i < SECONDS(60); i += 1) {
    crawler.step(STEP, actions({ throttle: crawler.snapshot().speed < 2 ? 1 : 0 }));
  }
  const crawled = crawler.snapshot();
  assert.ok(crawled.distanceTravelled > 100, `only ${crawled.distanceTravelled.toFixed(1)} m were crawled`);
  assert.equal(crawled.stumbles, 0, `${crawled.stumbles} stumbles happened under walking pace`);
});

test("the stumble is spent on the travel heading and never on the rider's own", () => {
  // Fact 14's rule, measured: `styleYaw` joins `wobbleYaw` on the travel
  // heading, so the contact patch shimmies while `headingY` — the number the
  // camera and the whole rig are hung off — never learns the stumble happened.
  //
  // The control is the same style with the stumble switched off, which leaves
  // the weave untouched: if a single radian of shimmy leaked into `headingY`
  // the two traces would separate at the first stumble and never rejoin.
  // Measured 2026-09-02: the worst difference over a minute is exactly 0.
  const withStumble = drunkController();
  const without = drunkController({ ...DRUNK_STYLE, stumbleEvery: 0 });
  const input = actions({ throttle: 1 });
  let worst = 0;
  for (let step = 0; step < SECONDS(60); step += 1) {
    withStumble.step(STEP, input);
    without.step(STEP, input);
    worst = Math.max(worst, Math.abs(withStumble.snapshot().headingY - without.snapshot().headingY));
  }
  assert.ok(worst < 1e-6, `the stumble moved the heading by ${worst.toExponential(3)} rad`);
  assert.ok(withStumble.snapshot().stumbles > 8, 'the control really did have stumbles to hide');
  assert.equal(without.snapshot().stumbles, 0, 'and the control really had none');
});

test('S4 — a seat dressed sober, or sobered again, rides the sober digests', () => {
  // Safeguard S4's first half: swap hygiene. The composition root re-dresses a
  // seat whenever the character changes, so "sober" has to mean the same thing
  // whether it was never anything else, was installed explicitly, or arrived
  // by way of the Drunkard. All three reproduce the pins recorded before a
  // ride style existed — which is S1 asserted a second time, from the swap.
  const moved: string[] = [];
  for (const name of Object.keys(SOBER_SCENARIOS) as (keyof typeof SOBER_SCENARIOS)[]) {
    const installed = runSoberScenario(name, (euc) => euc.setRideStyle(SOBER_STYLE));
    if (installed.digest !== SOBER_DIGESTS[name].digest) moved.push(`${name} (sober installed)`);
    const resobered = runSoberScenario(name, (euc) => {
      euc.setRideStyle(DRUNK_STYLE);
      euc.setRideStyle(SOBER_STYLE);
      // A re-dress at the chooser is followed by the ride starting over, which
      // is the reset that also clears the style's own clock and metre count.
      euc.reset();
    });
    if (resobered.digest !== SOBER_DIGESTS[name].digest) moved.push(`${name} (drunk then sobered)`);
  }
  assert.deepEqual(
    moved,
    [],
    `a re-dressed sober seat did not ride the sober digest: ${moved.join(', ')}`,
  );
});

test('S4 — a sober seat re-dressed drunk mid-ride starts weaving', () => {
  // The other direction, and the half that would fail silently: a style that
  // only took effect at a reset would leave the guest who just picked him
  // riding like Cool Rider until the next restart, and nothing on screen would
  // say so. (Measured 2026-09-02: the sway is non-zero on the very first step
  // after the swap and reaches 0.874 inside five seconds.)
  const euc = controller();
  const input = actions({ throttle: 1 });
  for (let i = 0; i < SECONDS(10); i += 1) euc.step(STEP, input);
  assert.ok(Object.is(euc.snapshot().styleSway, 0), 'the seat was sober up to the swap');

  euc.setRideStyle(DRUNK_STYLE);
  let peak = 0;
  for (let i = 0; i < SECONDS(5); i += 1) {
    euc.step(STEP, input);
    peak = Math.max(peak, Math.abs(euc.snapshot().styleSway));
  }
  assert.ok(peak > 0.25, `five seconds after the swap the sway had only reached ${peak.toFixed(4)}`);
});

test('S3 — a style is per seat, never per room', () => {
  // Four controllers alive at once, stepped in lockstep on one script, with
  // the Drunkard in seat 2. Three of them reproduce the straight's pinned
  // digest exactly and the fourth does not — which is the shape of the bug
  // this safeguard exists for: a style stored on a shared object, or read off
  // anything but the seat's own controller, would move all four.
  const seats = [0, 1, 2, 3].map(() => controller());
  seats[2].setRideStyle(DRUNK_STYLE);
  const poses = seats.map(() => createPose());
  const digests = seats.map(() => new RideDigest());
  const input = actions({ throttle: 1 });
  for (let step = 0; step < SOBER_DIGESTS.straight.steps; step += 1) {
    for (let seat = 0; seat < seats.length; seat += 1) {
      digestStep(seats[seat], poses[seat], digests[seat], input);
    }
  }
  for (const seat of [0, 1, 3]) {
    assert.equal(
      digests[seat].hex(),
      SOBER_DIGESTS.straight.digest,
      `seat ${seat} rode somebody else's ride`,
    );
  }
  assert.notEqual(digests[2].hex(), SOBER_DIGESTS.straight.digest, 'seat 2 rode sober');
  // And the difference is visible where the joke lives: only seat 2 wandered.
  for (const seat of [0, 1, 3]) {
    assert.ok(Object.is(seats[seat].snapshot().position.x, 0), `seat ${seat} wandered sideways`);
  }
  assert.ok(seats[2].snapshot().stumbles > 0, 'and only seat 2 stumbled');
});

test('the four new pose channels are exactly zero on a sober seat, in every scenario', () => {
  // The promise the digest block above makes in prose: a pose channel added
  // after the pins were recorded is *not* folded into the hash — it gets its
  // own assertion that it is zero on a sober seat. This is that assertion, on
  // all six scripted rides and every step of each, including the airborne, the
  // wobbling and the crashed ones where a style's clock is at its busiest.
  const pose = createPose();
  for (const name of Object.keys(SOBER_SCENARIOS) as (keyof typeof SOBER_SCENARIOS)[]) {
    const { euc, script } = SOBER_SCENARIOS[name]();
    let step = 0;
    for (const [held, count] of script) {
      const input = actions(held);
      for (let i = 0; i < count; i += 1) {
        euc.step(STEP, input);
        euc.writePose(pose);
        step += 1;
        assert.ok(Object.is(pose.styleSway, 0), `${name} step ${step}: styleSway ${pose.styleSway}`);
        assert.ok(Object.is(pose.styleYaw, 0), `${name} step ${step}: styleYaw ${pose.styleYaw}`);
        assert.ok(Object.is(pose.styleRoll, 0), `${name} step ${step}: styleRoll ${pose.styleRoll}`);
        assert.ok(Object.is(pose.styleStumble, 0), `${name} step ${step}: styleStumble ${pose.styleStumble}`);
      }
    }
  }
});

/**
 * A route ridden end to end by the harness's own follower, sober or drunk.
 *
 * `simulation/cpuRider.test.ts`'s `rideAlone`, trimmed to what a neutrality
 * measurement needs. The follower steers *continuously*, which is exactly why
 * §29.4 asks for this measurement: with a stick in hand the weave's gate is
 * faded by `(1 − |steer|)²` for most of the lap, so what is left to measure is
 * whether the style costs or buys anything on a course somebody is driving.
 */
function followRoute(plan: LevelPlan, spine: RouteSpine, style: RideStyle | null): {
  readonly seconds: number;
  readonly crashes: number;
  readonly finished: boolean;
} {
  const sampler = new PlanTerrainSampler(plan);
  const euc = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
  });
  if (style) euc.setRideStyle(style);
  const brain = new CpuRider(spine, plan, sampler);
  brain.skill = 1;

  const pose = createPose();
  euc.writePose(pose);
  const view: { -readonly [K in keyof CpuView]: CpuView[K] } = {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    headingY: pose.headingY,
    speed: 0,
    grounded: true,
    crashed: false,
    curbAhead: 0,
    lateralLimitG: EUC.maxLateralG,
  };
  brain.place(view);

  const finish = spine.length - 12;
  let crashes = 0;
  let wasCrashed = false;
  let seconds = 0;
  for (let step = 0; step < SECONDS(300); step += 1) {
    euc.writePose(pose);
    view.x = pose.x;
    view.y = pose.y;
    view.z = pose.z;
    view.headingY = pose.headingY;
    view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6;
    view.crashed = euc.crashed;
    view.curbAhead = euc.curbHeightAhead;
    view.lateralLimitG = euc.lateralLimit;
    if (euc.crashed && !wasCrashed) crashes += 1;
    wasCrashed = euc.crashed;

    euc.step(STEP, brain.step(STEP, view, null));
    seconds += STEP;
    if (brain.routeDistance >= finish) return { seconds, crashes, finished: true };
  }
  return { seconds, crashes, finished: false };
}

test("a driven lap costs him nothing — and the follower's own spread says how little", () => {
  // §29.4's second measured claim, with one substitution and one addition.
  //
  // **The substitution: a generated route, not BelVar.** The plan asks for a
  // scripted BelVar lap through the harness's route-follower, and the follower
  // cannot ride BelVar: `RouteSpine.fromPlan` refuses a circuit's
  // `start, split, split…` spelling on purpose, because accepting it silently
  // builds a truncated 713 m spine across a 930 m lap. So the eight pinned
  // seeds `simulation/cpuRider.test.ts` already sweeps stand in — a kilometre
  // of continuously-steered road each, chosen before the fact.
  //
  // **What the per-seed number is, and is not.** A route-follower is a closed
  // loop: it re-steers around wherever the wheel actually is, so a small
  // perturbation changes which line it takes into the next corner and lap
  // times separate chaotically. Measured 2026-09-02 over fourteen seeds, the
  // drunk rider's per-seed difference reached 0.73% while a style with the
  // weave switched off entirely — whose stumble provably moves the heading
  // by nothing — reached 0.49% on the same seeds. A per-seed bound on *this*
  // follower measures the follower, so the claims held here are the
  // aggregate ones: the mean difference is inside the plan's 0.5%, and nobody
  // gains systematically, because the signed mean is near zero and both
  // signs occur. **The plan's per-course bound is held where the plan put
  // it — on BelVar — in the test below**, through a follower whose steering
  // is a plain pursuit rather than a corridor planner.
  //
  // Measured over these eight seeds on 2026-09-02: mean |Δ| 0.169%, signed
  // mean +0.070% (a hair *slower* on average), five of eight faster.
  const seeds = Array.from({ length: 8 }, (_, index) => `sweep-${index}`);
  const differences: number[] = [];

  for (const seed of seeds) {
    const { plan } = generateLevel(seed);
    const spine = RouteSpine.fromPlan(plan);
    assert.ok(spine !== null, `${seed} has no spine to follow`);

    const sober = followRoute(plan, spine, null);
    const drunk = followRoute(plan, spine, DRUNK_STYLE);
    for (const [label, run] of [['sober', sober], ['drunk', drunk]] as const) {
      assert.equal(run.finished, true, `${seed}: the ${label} rider never reached the end`);
      assert.equal(run.crashes, 0, `${seed}: the ${label} rider crashed ${run.crashes} times`);
    }
    differences.push((drunk.seconds - sober.seconds) / sober.seconds);
  }

  const mean = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const meanAbsolute = mean(differences.map(Math.abs));
  assert.ok(
    meanAbsolute < 0.005,
    `a driven lap moved by ${(meanAbsolute * 100).toFixed(4)}% on average`,
  );
  assert.ok(
    Math.abs(mean(differences)) < 0.0025,
    `the drunk rider is systematically ${(mean(differences) * 100).toFixed(4)}% off the sober lap`,
  );
  assert.ok(
    differences.some((value) => value > 0) && differences.some((value) => value < 0),
    'every seed went the same way, which is a stat and not chaos',
  );
});

/**
 * BelVar's lap as a polyline, and a rider driven round it by pure pursuit.
 *
 * `RouteSpine` refuses a circuit on purpose, so the harness's own
 * route-point arithmetic is reproduced here instead: every lap segment's
 * entry-to-exit arc sampled every two metres, a 9 m look-ahead, steering
 * proportional to the bearing error, throttle off above 12 m/s. The shape is
 * the independent QA pass's BelVar probe, which is where §29.4's per-course
 * bound was first held on the course it names; it runs one lap in about a
 * third of a second.
 */
function lapBelVar(style: RideStyle | null): { readonly seconds: number; readonly crashes: number; readonly finished: boolean } {
  const plan = createTrackLevel();
  const points: { x: number; z: number }[] = [];
  for (const id of TRACK_LAP_SEGMENT_IDS) {
    const segment = plan.segments.find((candidate) => candidate.id === id);
    assert.ok(segment, `BelVar has no segment ${id}`);
    const turn = segment.exit.headingY - segment.entry.headingY;
    const dx = segment.exit.position.x - segment.entry.position.x;
    const dz = segment.exit.position.z - segment.entry.position.z;
    const chord = Math.hypot(dx, dz);
    const length = Math.abs(turn) < 1e-9 ? chord : chord * (turn / 2) / Math.sin(turn / 2);
    const curve = turn / length;
    const count = Math.max(1, Math.round(length / 2));
    for (let i = 0; i <= count; i += 1) {
      const along = length * i / count;
      const h0 = segment.entry.headingY;
      const h = h0 + curve * along;
      points.push(Math.abs(curve) < 1e-9
        ? { x: segment.entry.position.x + Math.sin(h0) * along, z: segment.entry.position.z + Math.cos(h0) * along }
        : { x: segment.entry.position.x + (Math.cos(h0) - Math.cos(h)) / curve, z: segment.entry.position.z + (Math.sin(h) - Math.sin(h0)) / curve });
    }
  }
  const euc = new EucController(new PlanTerrainSampler(plan), {
    spawn: { position: { x: points[0].x, y: 0, z: points[0].z }, headingY: Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z) },
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
  });
  if (style) euc.setRideStyle(style);
  const last = points[points.length - 1];
  let index = 0;
  let steps = 0;
  while (steps < SECONDS(250)) {
    const now = euc.snapshot();
    const { x, z } = now.position;
    while (index < points.length - 1 && Math.hypot(points[index].x - x, points[index].z - z) < 9) index += 1;
    if (index >= points.length - 1 && Math.hypot(last.x - x, last.z - z) < 9) {
      return { seconds: steps * STEP, crashes: now.crashes, finished: true };
    }
    let error = Math.atan2(points[index].x - x, points[index].z - z) - now.headingY;
    while (error > Math.PI) error -= 2 * Math.PI;
    while (error < -Math.PI) error += 2 * Math.PI;
    const input = actions({
      throttle: now.speed > 12 ? 0 : Math.max(0.25, 1 - Math.abs(error)),
      steer: Math.max(-1, Math.min(1, -error * 1.8)),
    });
    euc.step(STEP, input);
    euc.step(STEP, input);
    steps += 2;
  }
  return { seconds: steps * STEP, crashes: euc.snapshot().crashes, finished: false };
}

test('a driven BelVar lap is the same lap drunk or sober, to half a percent — the plan\'s own course', () => {
  // §29.4's per-course bound, on the course it names. Measured 2026-09-02:
  // sober 79.87 s, drunk 79.92 s, +0.063%, both clean.
  const sober = lapBelVar(null);
  const drunk = lapBelVar(DRUNK_STYLE);
  for (const [label, lap] of [['sober', sober], ['drunk', drunk]] as const) {
    assert.equal(lap.finished, true, `the ${label} rider never finished the lap`);
    assert.equal(lap.crashes, 0, `the ${label} rider crashed ${lap.crashes} times`);
  }
  const difference = (drunk.seconds - sober.seconds) / sober.seconds;
  assert.ok(Math.abs(difference) < 0.005, `the drunk lap is ${(difference * 100).toFixed(4)}% off the sober lap`);
});
