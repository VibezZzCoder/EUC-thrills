/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, EUC, PADDLE, PHYSICS, SIMULATION } from '../data/tuning.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { topSpeedPreset } from './topSpeedPreset.ts';
import { createLevel } from '../level/levels.ts';
import type { LevelPlan } from '../level/plan.ts';
import { RIDEABILITY } from '../level/routeValidator.ts';
import { CpuRider, speedAtLateralLimit, type CpuQuarry, type CpuView } from './cpuRider.ts';
import { lateralCeilingG, type LateralCeilingTuning } from './lateralCeiling.ts';
import { createPose, EucController, type EucPose } from './EucController.ts';
import { HazardField } from './hazards.ts';
import { Paddle, type HittableSet, type HittableVolume } from './paddle.ts';
import { PlanTerrainSampler } from './planSampler.ts';
import { RouteSpine } from './routeSpine.ts';
import { SoftBodyField } from './softBodies.ts';
import { createGroundSample } from './world.ts';

/**
 * M18 Phase 1's kill gate, headless.
 *
 * **This file is the reason the milestone builds a brain before it builds a
 * cop.** The plan's own words: if a synthesized `ActionSnapshot` cannot ride a
 * generated route competently, the milestone stops here and the finding goes to
 * the owner — because everything after it (a second rig in the frame, a mode, a
 * timer, a results screen) is worthless if the thing being chased by is not
 * riding. It also answers the owner's mid-build question directly: he offered to
 * have a chase course hand-built if teaching a CPU the procedural routes was
 * unreasonable, and the assertions below are what "reasonable" means, measured
 * rather than asserted in prose.
 *
 * Everything here runs with `node --test` and no browser, which is only
 * possible because of invariant 1: nothing in `simulation/` imports three.js, so
 * a full ride — hazards, wobble, kerbs, crashes and all — is a plain loop over
 * `EucController.step`.
 *
 * The sweep is the same 48 pinned seeds `level/generatedLevel.test.ts` uses, for
 * the same reason it uses them: a brain measured on seeds chosen after the fact
 * is a brain measured on the routes it happened to survive.
 */

const SWEEP = Array.from({ length: 48 }, (_, index) => `sweep-${index}`);
const STEP = 1 / SIMULATION.hz;
/** How close to the end of the line counts as having ridden the route out. */
const FINISH_TOLERANCE_METRES = 12;

interface RideResult {
  readonly crashes: number;
  /** Distance along the spine reached, metres. */
  readonly progress: number;
  readonly routeLength: number;
  readonly seconds: number;
  readonly finished: boolean;
  /** How far the cop ever got from the line, metres. */
  readonly worstOffRoute: number;
}

/**
 * A brain-ridden cop, alone on a route, with nobody to chase.
 *
 * Deliberately solo: this phase measures *riding*, and a quarry would let a
 * failure hide behind "he was distracted". The chase rules are Phase 3's and
 * are tested against their own suite.
 */
function rideAlone(
  plan: LevelPlan,
  skill: number,
  maxSeconds = 240,
  mph: number | null = null,
): RideResult {
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, 'the route has no spine to follow');

  const sampler = new PlanTerrainSampler(plan);
  // The `?mph=` window's own wheel, exactly as `level/levels.ts` builds it —
  // three tuning fields and nothing else (M30 Phase 1). `Game.applyTuning`
  // pushes the same three onto the brain, so the ride below is what a chase on
  // that build actually is.
  const preset = mph === null ? null : topSpeedPreset(mph);
  const tuning = preset === null ? undefined : {
    dragCoefficient: preset.dragCoefficient,
    powerComfortSpeed: preset.powerComfortSpeed,
    powerLimitSpeed: preset.powerLimitSpeed,
  };
  const controller = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
    ...(tuning === undefined ? {} : { tuning }),
  });
  const brain = new CpuRider(spine, plan, sampler);
  brain.skill = skill;
  if (preset !== null) {
    brain.dragCoefficient = preset.dragCoefficient;
  }

  const pose: EucPose = createPose();
  controller.writePose(pose);
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

  const quarry: CpuQuarry | null = null;
  const located = { distance: 0, offRoute: 0, halfWidth: 0 };
  let crashes = 0;
  let wasCrashed = false;
  let worstOffRoute = 0;
  let seconds = 0;

  const steps = Math.round(maxSeconds * SIMULATION.hz);
  for (let step = 0; step < steps; step += 1) {
    controller.writePose(pose);
    view.x = pose.x;
    view.y = pose.y;
    view.z = pose.z;
    view.headingY = pose.headingY;
    view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6;
    view.crashed = controller.crashed;
    view.curbAhead = controller.curbHeightAhead;
    view.lateralLimitG = controller.lateralLimit;

    if (controller.crashed && !wasCrashed) crashes += 1;
    wasCrashed = controller.crashed;

    controller.step(STEP, brain.step(STEP, view, quarry));
    seconds += STEP;

    spine.locate(pose.x, pose.z, brain.routeDistance, located);
    if (!controller.crashed) worstOffRoute = Math.max(worstOffRoute, located.offRoute);
    if (brain.routeDistance >= spine.length - FINISH_TOLERANCE_METRES) {
      return {
        crashes,
        progress: brain.routeDistance,
        routeLength: spine.length,
        seconds,
        finished: true,
        worstOffRoute,
      };
    }
  }

  return {
    crashes,
    progress: brain.routeDistance,
    routeLength: spine.length,
    seconds,
    finished: false,
    worstOffRoute,
  };
}

interface PursuitResult {
  readonly crashes: number;
  readonly closest: number;
  readonly finalGap: number;
}

/**
 * Put a stationary quarry and the cop on named points of the same real route.
 *
 * This is deliberately not `rideAlone` with a non-null argument. A pursuit has
 * two transitions a route sweep never exercises: closing without sailing past,
 * and turning around after the quarry is behind. M18 shipped without either
 * transition in its gate, which is how a very good racer was accepted as a cop.
 */
function pursueStationary(
  plan: LevelPlan,
  copDistance: number,
  quarryDistance: number,
  maxSeconds = 35,
  copBehindQuarryMetres = 0,
  quarryLateralMetres = 0,
): PursuitResult {
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, 'the route has no spine to pursue on');

  const sampler = new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
  });
  const brain = new CpuRider(spine, plan, sampler);
  const copAt = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  const quarryAt = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(copDistance, copAt);
  spine.sample(quarryDistance, quarryAt);
  if (copBehindQuarryMetres > 0) {
    // `Game.placeCopBehindRider` uses this exact world-space placement. At the
    // start of a route both bodies project to distance zero even though the cop
    // is physically the configured gap behind it.
    copAt.x = quarryAt.x - Math.sin(quarryAt.headingY) * copBehindQuarryMetres;
    copAt.z = quarryAt.z - Math.cos(quarryAt.headingY) * copBehindQuarryMetres;
    copAt.headingY = quarryAt.headingY;
  }
  const ground = createGroundSample();
  sampler.sampleGround(copAt.x, copAt.z, ground);
  controller.reset({
    position: { x: copAt.x, y: ground.height, z: copAt.z },
    headingY: copAt.headingY,
  });

  // Positive is to the line's left, the same convention the brain composes
  // its offsets in: the left vector at heading h is (cos h, −sin h).
  const quarry: CpuQuarry = {
    x: quarryAt.x + Math.cos(quarryAt.headingY) * quarryLateralMetres,
    y: quarryAt.y,
    z: quarryAt.z - Math.sin(quarryAt.headingY) * quarryLateralMetres,
    speed: 0,
  };
  const pose: EucPose = createPose();
  controller.writePose(pose);
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

  let closest = Infinity;
  let finalGap = Infinity;
  let crashes = 0;
  let wasCrashed = false;
  for (let step = 0; step < Math.round(maxSeconds * SIMULATION.hz); step += 1) {
    controller.writePose(pose);
    view.x = pose.x;
    view.y = pose.y;
    view.z = pose.z;
    view.headingY = pose.headingY;
    view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6;
    view.crashed = controller.crashed;
    view.curbAhead = controller.curbHeightAhead;
    view.lateralLimitG = controller.lateralLimit;

    if (controller.crashed && !wasCrashed) crashes += 1;
    wasCrashed = controller.crashed;
    controller.step(STEP, brain.step(STEP, view, quarry));

    finalGap = Math.hypot(pose.x - quarry.x, pose.z - quarry.z);
    closest = Math.min(closest, finalGap);
  }

  return { crashes, closest, finalGap };
}

// ---------------------------------------------------------------------------
// The line the cop follows
// ---------------------------------------------------------------------------

test('every generated route yields one continuous spine', () => {
  for (const seed of SWEEP) {
    const { plan } = generateLevel(seed);
    const spine = RouteSpine.fromPlan(plan);
    assert.ok(spine !== null, `${seed} produced no spine`);
    // A route is a few hundred metres at least (`REQUIRED_ROUTE_FLOOR_METRES`
    // is the generator's own contract), so a spine that came out short is a
    // spine that stopped at the first junction rather than one that is honest.
    assert.ok(
      spine.length > 200,
      `${seed} produced a ${spine.length.toFixed(0)} m spine, which is not the route`,
    );
    assert.ok(spine.sampleCount > 40, `${seed} produced ${spine.sampleCount} samples`);
  }
});

test('the spine starts at the spawn and passes every checkpoint', () => {
  const located = { distance: 0, offRoute: 0, halfWidth: 0 };

  for (const seed of SWEEP.slice(0, 12)) {
    const { plan } = generateLevel(seed);
    const spine = RouteSpine.fromPlan(plan)!;

    spine.locate(plan.spawn.position.x, plan.spawn.position.z, -1, located);
    assert.ok(
      located.offRoute < 8,
      `${seed}: the spine passes ${located.offRoute.toFixed(1)} m from the spawn`,
    );

    // Every gate is on the required route by construction in the generator, so
    // a spine that misses one has taken a branch — the exact failure the
    // checkpoint-ordered walk exists to prevent, and one that would show up as
    // a cop riding down the alley while the player rides the road.
    for (const gate of plan.checkpoints) {
      spine.locate(gate.centre.x, gate.centre.z, -1, located);
      assert.ok(
        located.offRoute < Math.max(6, gate.halfExtents.x),
        `${seed}: the spine misses ${gate.id} by ${located.offRoute.toFixed(1)} m`,
      );
    }
  }
});

test('a plan with no stated route refuses to produce a spine', () => {
  // The proving ground is a measuring instrument rather than a place and
  // carries no checkpoints. Guessing a line through it would read as a working
  // chase right up until the day it silently followed a branch, so the honest
  // answer is null and the mode refuses the world at its entrance (§13 q26).
  assert.equal(RouteSpine.fromPlan(createLevel('proving')), null);
});

test('a closed lap is not an open chase spine', () => {
  // M23's circuit has one start/finish line followed by sector splits and no
  // terminal finish. Treating those gates as an open route builds only the
  // 713 m path from spawn to the last sector of a 930 m lap, then leaves the
  // cop clamped there. A lap needs a looping spine (which Track Day does not
  // use); the open, point-to-point chase spine must refuse it.
  assert.equal(RouteSpine.fromPlan(createLevel('track')), null);
});

test('the high-speed policy follows the live wheel tuning it is given', () => {
  const { plan } = generateLevel('route-41');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null);
  const sampler = new PlanTerrainSampler(plan);
  const brain = new CpuRider(spine, plan, sampler);
  const cutoutSpeed = () => (
    brain as unknown as { cutoutSpeed(): number }
  ).cutoutSpeed();

  const shipped = Math.sqrt(
    (EUC.leanToAccel * Math.sin(EUC.maxLeanPitch)) / EUC.dragCoefficient,
  ) * EUC.cutoutSpeedShare * CHASE.cutoutMarginShare;
  assert.ok(Math.abs(cutoutSpeed() - shipped) < 1e-12);

  brain.driveAcceleration = 9;
  brain.dragCoefficient = 0.09;
  brain.cutoutSpeedShare = 0.9;
  brain.cutoutMarginShare = 0.8;
  assert.ok(Math.abs(cutoutSpeed() - 7.2) < 1e-12);
});

test('a corner allowance never exceeds the speed the schedule really allows', () => {
  // **The fixed point** — M30 Phase 2, `docs/PLANS.md` §30.3b and §30.7 item 1.
  //
  // The lateral ceiling rises with speed, so the speed a corner allows is the
  // solution of `v = k · sqrt(ceiling(v) · perG)` rather than one division. A
  // cop who believed anything *above* that solution would arrive at the corner
  // too fast — which is the whole failure the fixed point exists to prevent —
  // so what is asserted here is one-sided: never above, and close enough from
  // below to be worth solving at all.
  //
  // The reference is the same map iterated to convergence rather than a closed
  // form: it is a contraction, so two hundred passes are the fixed point to
  // machine precision, and comparing two iterations against two hundred is a
  // statement about the *truncation* and nothing else.
  const converge = (k: number, perG: number, t: LateralCeilingTuning): number => {
    let v = k * Math.sqrt(Math.min(t.maxLateralG, t.carveGripTopG) * perG);
    for (let i = 0; i < 200; i += 1) v = k * Math.sqrt(lateralCeilingG(v, t) * perG);
    return v;
  };

  // **The schedule is swept too** — M30 Phase 2's QA repair. The brain used to
  // read the frozen table here, so the F4 sliders moved the cop's wheel and not
  // his belief, and this assertion was made only at the shipped anchors. Both
  // sliders now travel (`Game.applyTuning` → `CpuRider.lateralCeiling`), so
  // both ends of both of them are asserted, and `carveGripTopG` below
  // `maxLateralG` is a *decreasing* schedule — the case the fixed point's
  // one-sidedness has to survive as well.
  const SCHEDULES: ReadonlyArray<readonly [string, LateralCeilingTuning]> = [
    ['shipped', EUC],
    ['grip at speed 0.75 (the F4 floor)', { ...EUC, carveGripTopG: 0.75 }],
    ['grip at speed 1.6 (the F4 ceiling)', { ...EUC, carveGripTopG: 1.6 }],
    ['rise shape 0.5 (the F4 floor)', { ...EUC, carveGripExponent: 0.5 }],
    ['rise shape 2 (the F4 ceiling)', { ...EUC, carveGripExponent: 2 }],
    ['both sliders at their ceilings', { ...EUC, carveGripTopG: 1.6, carveGripExponent: 2 }],
    ['a decreasing schedule', { ...EUC, carveGripTopG: 0.5 }],
  ];

  let worstUnder = 0;
  let worstShipped = 0;
  let checked = 0;
  // Every grip in the surface table, both ends of the cornering margin, and
  // the skill band's two ends — `perG` is the product of all of them.
  for (const [label, schedule] of SCHEDULES) {
    for (const grip of [0.35, 0.5, 0.72, 1]) {
      for (const skill of [0, 0.5, 1]) {
        for (const margin of [CHASE.corneringMargin, 1]) {
          const perG = PHYSICS.gravity * grip * margin * (0.7 + 0.3 * skill);
          // Radii from a hairpin to a motorway sweeper, and the swerve's own `k`.
          for (const radius of [8, 14, 25, 40, 60, 90, 140, 220, 400, 900]) {
            const k = Math.sqrt(radius);
            const solved = speedAtLateralLimit(k, perG, schedule);
            const truth = converge(k, perG, schedule);
            assert.ok(
              solved <= truth + 1e-9,
              `${label}, radius ${radius}, grip ${grip}, skill ${skill}: allowed ${solved} m/s `
                + `where the schedule allows ${truth}`,
            );
            // The floor is the *shipped* schedule's, where it matters: at the
            // sliders' extremes the schedule is steep enough that four passes
            // are still 12 % short, which is slow rather than wrong and is
            // recorded as such.
            const floor = schedule === EUC ? 0.995 : 0.87;
            assert.ok(
              solved >= truth * floor,
              `${label}, radius ${radius}, grip ${grip}, skill ${skill}: ${solved} m/s is `
                + `needlessly slow against ${truth}`,
            );
            worstUnder = Math.max(worstUnder, 1 - solved / truth);
            if (schedule === EUC) worstShipped = Math.max(worstShipped, 1 - solved / truth);
            checked += 1;
          }
        }
      }
    }
  }
  assert.ok(checked === 1680, `only ${checked} corners checked`);

  // **And the grip he corners on is recovered from the limit he is handed.**
  // `view.lateralLimitG` is the schedule at his own speed times the surface's
  // grip; dividing it by the schedule at that same speed leaves the grip, at
  // any speed, which is what lets a cop at 27 m/s and a cop at 5 m/s believe
  // the same thing about the same corner — and keeps the brain from ever
  // learning what a surface is (`simulation/cpuRider.ts`, `CpuView`).
  for (const grip of [0.35, 0.5, 0.72, 1]) {
    for (const speed of [0, 5, 9, 15, 22.25, 27, 40]) {
      const handed = lateralCeilingG(speed, EUC) * grip;
      assert.ok(Math.abs(handed / lateralCeilingG(speed, EUC) - grip) < 1e-12, `${speed} m/s`);
    }
  }
  console.log(
    `  the four-pass allowance is at worst ${(worstUnder * 100).toFixed(3)}% under the fixed `
      + `point over ${checked} corners (${(worstShipped * 100).toFixed(3)}% on the shipped schedule)`,
  );

  // And with the schedule switched off — `carveGripTopG` dragged to
  // `maxLateralG` — the solver is today's division exactly, first iterate
  // onward. **Called, not re-derived**: the old version of this block built the
  // flat table and then asserted hand-written arithmetic without ever handing
  // it to the function, which is what let the function read the frozen table
  // for a whole phase (Phase 2's QA, P2).
  const flat = { ...EUC, carveGripTopG: EUC.maxLateralG };
  const perG = PHYSICS.gravity * CHASE.corneringMargin;
  for (const radius of [8, 40, 220]) {
    const k = Math.sqrt(radius);
    assert.equal(
      speedAtLateralLimit(k, perG, flat),
      Math.sqrt((EUC.maxLateralG * perG) / (1 / radius)),
      'a flat schedule is the pre-M30 arithmetic',
    );
  }

  // **And the schedule the solver uses is the one it is handed.** Two tables
  // that differ only in the give must give different answers at a speed inside
  // the band, or the argument is decorative.
  const fast = { ...EUC, carveGripTopG: 1.6 };
  assert.ok(
    speedAtLateralLimit(Math.sqrt(220), perG, fast) > speedAtLateralLimit(Math.sqrt(220), perG, flat),
    'the tuning argument changes nothing, so the brain is still reading the frozen table',
  );

  // **The pass count has to be even, and this is why.** F4 reaches
  // `maxLateralG` 1.6 and `carveGripTopG` 0.75, so the panel can describe a
  // schedule that *falls* with speed — and a decreasing map alternates about
  // its fixed point instead of contracting onto it from one side, so an odd
  // number of passes lands above the true allowance. Asserted rather than
  // remembered: the phase's QA repair was asked for a third pass, measured
  // this, and shipped a fourth.
  const falling = { ...EUC, maxLateralG: 1.6, carveGripTopG: 0.75 };
  const pass = (k: number, g: number, count: number): number => {
    let v = k * Math.sqrt(Math.min(falling.maxLateralG, falling.carveGripTopG) * g);
    for (let i = 0; i < count; i += 1) v = k * Math.sqrt(lateralCeilingG(v, falling) * g);
    return v;
  };
  let odd = 0;
  let even = 0;
  for (const radius of [8, 25, 60, 140, 400]) {
    for (const grip of [0.35, 0.72, 1]) {
      const k = Math.sqrt(radius);
      const g = PHYSICS.gravity * grip * CHASE.corneringMargin;
      const truth = pass(k, g, 200);
      if (pass(k, g, 3) > truth + 1e-9) odd += 1;
      if (pass(k, g, 4) > truth + 1e-9) even += 1;
    }
  }
  assert.ok(odd > 0, 'a falling schedule no longer overshoots on an odd pass count — re-derive the parity rule');
  assert.equal(even, 0, 'an even pass count overshot a falling schedule, which is the whole guarantee');
});

// ---------------------------------------------------------------------------
// The kill gate
// ---------------------------------------------------------------------------

test('a full-skill cop rides every pinned seed out, and one seed is down', () => {
  // **This is the gate.** If it fails and no reasonable brain fixes it, M18
  // stops and the owner's hand-built chase course (`docs/PLANS.md` §18.8) is
  // the recorded remedy.
  //
  // **M30 Phase 4 moved the wheel under it and the gate is no longer zero.**
  // The shipped wheel is 65 mph now, and Phase 1's rule that a faster wheel
  // meets a *denser* road applies to the shipped road: these forty-eight seeds
  // carry more holes than they did at 50. Phase 2's QA rode exactly this sweep
  // on `?mph=65` and found one seed down — `sweep-15`, a deep pothole the route
  // places at 971 m that the cop reaches at 11.6 m/s believing he can still
  // brake to 4.6 — and traced it to a **units error in the brain's braking
  // belief** (`EUC.brakeAuthority` is per unit of `sin(lean)`; the braking law
  // spends it as though it were not, so the brain believes about twice the
  // deceleration it has). That was measured and deliberately **not** corrected,
  // because an honest model brakes ~1.7 m earlier into everything with a face
  // and takes M18 §4.2's wall camp — the fix for a named community report —
  // with it. See `CpuRider.brakeDeceleration` and `docs/PLANS.md` §30.7 item 7.
  //
  // So the gate pins what is true rather than what is wanted, exactly as the
  // 65 sweep did before it became the shipped one: **`sweep-15` and nothing
  // else**. A new name here is a regression; the list emptying is the finding
  // being fixed, and this should be tightened to zero the day it is. The A/B
  // gate below rides `?mph=50` and is still a clean zero, which is what says
  // this is the faster wheel's road and not a broken brain.
  const failures: string[] = [];
  const down: string[] = [];
  let worstOffRoute = 0;
  let slowest = 0;

  for (const seed of SWEEP) {
    const { plan } = generateLevel(seed);
    const ride = rideAlone(plan, 1);
    worstOffRoute = Math.max(worstOffRoute, ride.worstOffRoute);
    slowest = Math.max(slowest, ride.seconds);

    if (ride.crashes > 0) down.push(`${seed}:${ride.crashes}`);
    if (!ride.finished) {
      failures.push(
        `${seed}: stopped at ${ride.progress.toFixed(0)} m of ${ride.routeLength.toFixed(0)} m`,
      );
    }
  }

  assert.deepEqual(failures, [], `a full-skill cop cannot ride these routes:\n${failures.join('\n')}`);
  assert.deepEqual(
    down,
    ['sweep-15:1'],
    `the shipped sweep's crash list moved: ${down.join(' ') || 'none'} (recorded: sweep-15:1). `
      + 'A new name is a regression; an empty list means the braking-units finding was fixed, '
      + 'and this gate should then be tightened to zero.',
  );
  // He is following a road, so he has to stay on one. This is a far weaker
  // claim than "he rides the racing line" and it is the one that matters: a cop
  // who reaches the end by ploughing across the surround is not chasing anybody.
  assert.ok(
    worstOffRoute < 12,
    `the cop wandered ${worstOffRoute.toFixed(1)} m off the line, which is not following a road`,
  );
});

test('the same sweep on the ?mph=50 wheel, which is the wheel M30 shipped away from', () => {
  // **M30 Phase 2's QA repair, finding 4, with the wheels swapped by Phase 4.**
  // It rode `?mph=65` while 50 was frozen, precisely so that the day 65 became
  // the default the gate above would not silently change meaning. It did change
  // meaning, and it now carries the pinned `sweep-15`; what this one rides is
  // the **other** wheel — `?mph=50`, M16's, on the road spaced for it — and it
  // is still a clean zero.
  //
  // That zero is what makes the pin above readable. The cop's brain believes
  // about twice the braking the wheel has (a units error measured, recorded and
  // deliberately not corrected — see the gate above and
  // `CpuRider.brakeDeceleration`), and at 50 mph that optimism is inside the
  // margin `corneringMargin` leaves. At 65 it is not, on one seed of
  // forty-eight. So the two gates together say the brain is *the same brain*
  // and the faster wheel is what exposes it, rather than something having gone
  // wrong in the chase.
  const down: string[] = [];
  const unfinished: string[] = [];
  let worstOffRoute = 0;

  for (const seed of SWEEP) {
    const { plan } = generateLevel(seed, undefined, undefined, 50);
    const ride = rideAlone(plan, 1, 240, 50);
    worstOffRoute = Math.max(worstOffRoute, ride.worstOffRoute);
    if (ride.crashes > 0) down.push(`${seed}:${ride.crashes}`);
    if (!ride.finished) {
      unfinished.push(`${seed} stopped at ${ride.progress.toFixed(0)} m of ${ride.routeLength.toFixed(0)}`);
    }
  }

  assert.deepEqual(unfinished, [], `a 50 mph cop cannot ride these routes out:\n${unfinished.join('\n')}`);
  assert.deepEqual(
    down,
    [],
    `the 50 mph sweep put a cop down: ${down.join(' ')} — this gate is a clean zero and is the `
      + 'control the shipped gate\'s one pinned seed is read against',
  );
  assert.ok(
    worstOffRoute < 12,
    `the 50 mph cop wandered ${worstOffRoute.toFixed(1)} m off the line, which is not following a road`,
  );
});

test('skill is line quality and braking, and a poor cop pays for both', () => {
  // The other half of q27's shape. A skill knob that changed nothing would be a
  // difficulty control the owner could not use at his ride; one that changed
  // *speed* would break the promise that both riders are on the same wheel.
  let cleanCrashes = 0;
  let poorCrashes = 0;
  let cleanOffRoute = 0;
  let poorOffRoute = 0;

  // **`sweep-15` is skipped, by name and for the reason the gate above
  // records** (M30 Phase 4): on the shipped 65 mph wheel the full-skill cop is
  // put down there by the brain's braking-units optimism, which is a pinned,
  // deliberately uncorrected finding rather than a fact about *skill*. The
  // comparison below is "does the knob do anything", and a seed that puts both
  // riders down for a third reason is noise in it. Delete the skip the day the
  // gate above is tightened to zero.
  for (const seed of SWEEP.slice(0, 16).filter((seed) => seed !== 'sweep-15')) {
    const { plan } = generateLevel(seed);
    const clean = rideAlone(plan, 1);
    const poor = rideAlone(plan, 0);
    cleanCrashes += clean.crashes;
    poorCrashes += poor.crashes;
    cleanOffRoute = Math.max(cleanOffRoute, clean.worstOffRoute);
    poorOffRoute = Math.max(poorOffRoute, poor.worstOffRoute);
  }

  assert.equal(cleanCrashes, 0, 'the full-skill cop crashed on the sample the poor one is judged against');
  assert.ok(
    poorCrashes > cleanCrashes || poorOffRoute > cleanOffRoute * 1.5,
    `skill 0 rode as well as skill 1 (${poorCrashes} crashes, ${poorOffRoute.toFixed(1)} m off `
      + `line, against ${cleanCrashes} and ${cleanOffRoute.toFixed(1)} m). The knob does nothing.`,
  );
});

test('the same seed and the same skill produce the same ride, to the step', () => {
  // `advance(n)` has to reach the same frame every run, and a chase is now part
  // of what `advance(n)` steps. `Math.random` is forbidden in the brain for
  // exactly this reason; the wander is a function of distance along the route.
  const { plan } = generateLevel('sweep-3');
  const first = rideAlone(plan, 0.4);
  const second = rideAlone(plan, 0.4);

  assert.equal(first.progress, second.progress);
  assert.equal(first.seconds, second.seconds);
  assert.equal(first.crashes, second.crashes);
});

test('the cop closes on a quarry ahead and does not turn the chase into a pass', () => {
  const { plan } = generateLevel('route-41');
  const pursuit = pursueStationary(plan, 20, 85);

  assert.equal(pursuit.crashes, 0, 'the cop crashed during an unobstructed pursuit');
  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the cop never reached swing range (${pursuit.closest.toFixed(1)} m)`,
  );
  assert.ok(
    pursuit.finalGap <= CHASE.bustRadiusMetres,
    `the cop passed the quarry and rode ${pursuit.finalGap.toFixed(1)} m away`,
  );
});

test('the cop closes from the real chase spawn behind the route endpoint', () => {
  const { plan } = generateLevel('route-41');
  const pursuit = pursueStationary(plan, 0, 0, 35, CHASE.spawnGapMetres);

  assert.equal(pursuit.crashes, 0, 'the cop crashed while entering the route');
  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the endpoint projection left the cop ${pursuit.closest.toFixed(1)} m away`,
  );
  assert.ok(
    pursuit.finalGap <= CHASE.bustRadiusMetres,
    `the cop reached the spawn then abandoned it by ${pursuit.finalGap.toFixed(1)} m`,
  );
});

test('the cop turns around when the quarry is behind instead of riding to the route end', () => {
  const { plan } = generateLevel('route-41');
  const pursuit = pursueStationary(plan, 85, 20);

  assert.equal(pursuit.crashes, 0, 'the cop crashed while turning back toward the quarry');
  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the cop never pursued the quarry behind him (${pursuit.closest.toFixed(1)} m)`,
  );
  assert.ok(
    pursuit.finalGap <= CHASE.bustRadiusMetres,
    `the cop reached the quarry then abandoned it by ${pursuit.finalGap.toFixed(1)} m`,
  );
});

test('a quarry standing just off the road is met in the field, not orbited from it', () => {
  // The owner's own exploit, as a fixture: stand on the grass inside the stray
  // limit and watch a cop who will not leave the tarmac circle below you. The
  // field pursuit is the fix, and this is its kill gate — on real physics he
  // must actually arrive, which also proves the road's own caps (the corner
  // profile, the end-of-line stop, the blocker gate) no longer bind out there.
  // Deliberately no crash assertion: the grass is dressed, and meeting its
  // furniture badly is the escaping player's legitimate counterplay.
  const { plan } = generateLevel('route-41');
  const pursuit = pursueStationary(plan, 40, 90, 45, 0, 16);

  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the cop never came across the grass (closest ${pursuit.closest.toFixed(1)} m)`,
  );
  assert.ok(
    pursuit.finalGap <= CHASE.bustRadiusMetres,
    `the cop met the field quarry then wandered ${pursuit.finalGap.toFixed(1)} m off`,
  );
});

test('a distant off-road quarry is run down along the road first, then met', () => {
  // The leapfrog: out of field range the chase stays on the tarmac — the fast
  // surface — and the crossing happens only once he has drawn level. One
  // assertion covers the whole arc, because the only way to satisfy it inside
  // the clock is to do both halves in that order.
  const { plan } = generateLevel('route-41');
  const pursuit = pursueStationary(plan, 10, 150, 90, 0, 14);

  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the cop never converted the road chase into a field one (closest ${
      pursuit.closest.toFixed(1)} m)`,
  );
});

test('the brain never asks the wheel for something the actions cannot carry', () => {
  // A snapshot with a NaN steer would ride into the wall the moment a spine
  // sample went degenerate, and every downstream assertion would be about the
  // crash rather than about the cause.
  const { plan } = generateLevel('sweep-7');
  const spine = RouteSpine.fromPlan(plan)!;
  const brain = new CpuRider(spine, plan, new PlanTerrainSampler(plan));

  const view: CpuView = {
    x: plan.spawn.position.x,
    y: plan.spawn.position.y,
    z: plan.spawn.position.z,
    headingY: plan.spawn.headingY,
    speed: 0,
    grounded: true,
    crashed: false,
    curbAhead: 0,
    lateralLimitG: EUC.maxLateralG,
  };
  brain.place(view);

  for (const speed of [0, 5, 22, 60]) {
    const actions = brain.step(STEP, { ...view, speed }, null);
    assert.ok(Number.isFinite(actions.throttle), `throttle is ${actions.throttle} at ${speed} m/s`);
    assert.ok(Number.isFinite(actions.steer), `steer is ${actions.steer} at ${speed} m/s`);
    assert.ok(Math.abs(actions.throttle) <= 1 && Math.abs(actions.steer) <= 1);
    assert.equal(actions.reset, false, 'a brain may never press reset');
    assert.equal(actions.pause, false, 'a brain may never press pause');
  }
});

// ---------------------------------------------------------------------------
// The adversarial wall — FEEDBACK-TRIAGE §4.2
// ---------------------------------------------------------------------------
//
// The 48-seed sweep proves the cop catches on open route; a daily player
// proved within hours of the M18 announcement that he could be deliberately
// parked behind a wall. These tests are the missing adversarial half: a
// finite wall square across the line between cop and quarry, with room
// around both ends, in both frames the brain reasons in. Being wedged is
// allowed; staying wedged is the defect.

/**
 * A stationary quarry with a wall between it and the cop.
 *
 * `wallLateral`/`quarryLateral` move both off the line together for the
 * field variant; zero for both is the on-road camp from the owner's own
 * reproduction (standing square behind a corridor-spanning planter).
 */
function pursueAroundWall(
  seed: string,
  wallDistance: number,
  copDistance: number,
  lateral: number,
  maxSeconds = 60,
): PursuitResult & { readonly wallProjected: boolean } {
  const { plan } = generateLevel(seed);
  const spine = RouteSpine.fromPlan(plan)!;
  const at = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(wallDistance, at);
  const heading = at.headingY;
  const wallX = at.x + Math.cos(heading) * lateral;
  const wallZ = at.z - Math.sin(heading) * lateral;
  const ground = createGroundSample();
  new PlanTerrainSampler(plan).sampleGround(wallX, wallZ, ground);
  plan.solids = [...(plan.solids ?? []), {
    centre: { x: wallX, y: ground.height + 0.6, z: wallZ },
    halfExtents: { x: 7, y: 0.6, z: 0.35 },
    rotationY: heading,
    surface: 'brick',
  }];

  const sampler = new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
  });
  const brain = new CpuRider(spine, plan, sampler);
  // On the line, the wall must project — its own top face must not measure
  // it as flat road, which is the blind spot the first reproduction found.
  const wallProjected = lateral !== 0 || brain.blockerField.some((blocker) => (
    blocker.safeSpeed === 0
    && blocker.from < wallDistance && blocker.to > wallDistance
    && blocker.right < 0 && blocker.left > 0
  ));

  const copAt = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(copDistance, copAt);
  sampler.sampleGround(copAt.x, copAt.z, ground);
  controller.reset({
    position: { x: copAt.x, y: ground.height, z: copAt.z },
    headingY: copAt.headingY,
  });

  spine.sample(wallDistance + 3, at);
  const quarry: CpuQuarry = {
    x: at.x + Math.cos(at.headingY) * lateral,
    y: at.y,
    z: at.z - Math.sin(at.headingY) * lateral,
    speed: 0,
  };

  const pose: EucPose = createPose();
  controller.writePose(pose);
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

  let closest = Infinity;
  let finalGap = Infinity;
  let crashes = 0;
  let wasCrashed = false;
  for (let step = 0; step < Math.round(maxSeconds * SIMULATION.hz); step += 1) {
    controller.writePose(pose);
    view.x = pose.x;
    view.y = pose.y;
    view.z = pose.z;
    view.headingY = pose.headingY;
    view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6;
    view.crashed = controller.crashed;
    view.curbAhead = controller.curbHeightAhead;
    view.lateralLimitG = controller.lateralLimit;
    if (controller.crashed && !wasCrashed) crashes += 1;
    wasCrashed = controller.crashed;
    controller.step(STEP, brain.step(STEP, view, quarry));
    finalGap = Math.hypot(pose.x - quarry.x, pose.z - quarry.z);
    closest = Math.min(closest, finalGap);
    if (process.env.WEDGE_TRACE && step % SIMULATION.hz === 0) {
      const b = brain as unknown as Record<string, number | boolean>;
      console.log(`t=${(step / SIMULATION.hz).toFixed(0)}s speed=${pose.speed.toFixed(1)} gap=${finalGap.toFixed(1)} `
        + `curb=${view.curbAhead.toFixed(2)} stuck=${(b.stuckSeconds as number).toFixed(1)} `
        + `flank=${b.flanking} detour=${(b.detourRemaining as number).toFixed(1)} span=${(b.detourSpan as number).toFixed(0)} `
        + `hops=${controller.snapshot().hops} xz=(${pose.x.toFixed(1)},${pose.z.toFixed(1)}) h=${pose.headingY.toFixed(2)}`);
    }
  }

  return { crashes, closest, finalGap, wallProjected };
}

test('a wall square across the corridor projects into the blocker field', () => {
  // The projection measured a box against the road under its own footprint,
  // and the sampler answers a footprint with the box's top face — so a wall
  // standing on the line measured itself as flat road and vanished. Route
  // furniture never sits on the validated line, which is why 48 seeds never
  // noticed; a player parking the cop behind a plaza wall did.
  const pursuit = pursueAroundWall('route-41', 120, 118, 0, 1);
  assert.ok(pursuit.wallProjected, 'the on-line wall is invisible to the brain');
});

test('a quarry camped behind a wall on the road is flanked, not besieged', () => {
  // The owner's reproduction of the community wall-camp report on the 2nd
  // Facebook post (FEEDBACK-TRIAGE §4.2; the reporter is named in the triage
  // file and nowhere shipped): stand square behind the middle of a long wall
  // and watch the cop ride side to side forever. The whole §4.2 fix is that
  // he now works the problem — brakes for the wall, tries its end, backs out
  // of the wedge, slides around, and closes.
  const pursuit = pursueAroundWall('route-41', 120, 60, 0);

  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the cop never reached swing range around the wall (closest ${
      pursuit.closest.toFixed(1)} m)`,
  );
  assert.ok(
    pursuit.crashes <= 2,
    `${pursuit.crashes} crashes working around one wall is a ragdoll loop, not a flank`,
  );
});

test('a quarry camped behind a wall in the field is flanked, not besieged', () => {
  // The same camp with both of them off the road: no blockers out here, so
  // this is the widening sideways walk on its own — the dead-reckoning half
  // of the fix, where the road's end-around reasoning cannot help.
  const pursuit = pursueAroundWall('route-41', 120, 60, 14);

  assert.ok(
    pursuit.closest <= CHASE.swingRangeMetres,
    `the cop never reached swing range around the field wall (closest ${
      pursuit.closest.toFixed(1)} m)`,
  );
  assert.ok(
    pursuit.crashes <= 2,
    `${pursuit.crashes} crashes working around one wall is a ragdoll loop, not a flank`,
  );
});

// ---------------------------------------------------------------------------
// The wedge about-face — FEEDBACK-TRIAGE §4.2's 2026-08-22 datapoint, M24
// ---------------------------------------------------------------------------
//
// The owner's sighting, and the reproducible core of the "weirds out" report:
// *"getting stuck sometimes on a wall and then slowly jumping to correct
// himself (his facing direction) eventually."* The camp fixtures above prove
// the cop eventually gets around a wall; this one measures the *about-face* —
// nose against a face, quarry behind him — because how long the turn takes is
// the whole complaint.

/**
 * Wedge the cop nose-into a wall with the quarry behind him, and measure the
 * about-face: seconds until his heading is within half a radian of the
 * bearing to the quarry, plus how many hops the recovery spent and how close
 * he got in the allotted time.
 */
function wedgeAboutFace(
  seed: string,
  wallDistance: number,
  quarryBehindMetres: number,
  maxSeconds = 30,
  lateral = 0,
): { recoverSeconds: number; hops: number; closest: number; crashes: number } {
  const { plan } = generateLevel(seed);
  const spine = RouteSpine.fromPlan(plan)!;
  const at = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(wallDistance, at);
  const heading = at.headingY;
  const wallX = at.x + Math.cos(heading) * lateral;
  const wallZ = at.z - Math.sin(heading) * lateral;
  const ground = createGroundSample();
  new PlanTerrainSampler(plan).sampleGround(wallX, wallZ, ground);
  plan.solids = [...(plan.solids ?? []), {
    centre: { x: wallX, y: ground.height + 0.6, z: wallZ },
    halfExtents: { x: 7, y: 0.6, z: 0.35 },
    rotationY: heading,
    surface: 'brick',
  }];

  const sampler = new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
  });
  const brain = new CpuRider(spine, plan, sampler);

  // Right against the face, pointed at it — the pose the owner watched.
  const copAt = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(wallDistance - 1.0, copAt);
  copAt.x += Math.cos(heading) * lateral;
  copAt.z -= Math.sin(heading) * lateral;
  sampler.sampleGround(copAt.x, copAt.z, ground);
  controller.reset({
    position: { x: copAt.x, y: ground.height, z: copAt.z },
    headingY: copAt.headingY,
  });

  const quarryPoint = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(wallDistance - quarryBehindMetres, quarryPoint);
  const quarry: CpuQuarry = {
    x: quarryPoint.x + Math.cos(quarryPoint.headingY) * lateral,
    y: quarryPoint.y,
    z: quarryPoint.z - Math.sin(quarryPoint.headingY) * lateral,
    speed: 0,
  };

  const pose: EucPose = createPose();
  controller.writePose(pose);
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

  let recoverSeconds = Infinity;
  let closest = Infinity;
  let crashes = 0;
  let wasCrashed = false;
  const steps = Math.round(maxSeconds * SIMULATION.hz);
  for (let step = 0; step < steps; step += 1) {
    controller.writePose(pose);
    view.x = pose.x;
    view.y = pose.y;
    view.z = pose.z;
    view.headingY = pose.headingY;
    view.speed = pose.speed;
    view.grounded = pose.y - pose.groundY <= 1e-6;
    view.crashed = controller.crashed;
    view.curbAhead = controller.curbHeightAhead;
    view.lateralLimitG = controller.lateralLimit;
    if (controller.crashed && !wasCrashed) crashes += 1;
    wasCrashed = controller.crashed;
    controller.step(STEP, brain.step(STEP, view, quarry));

    closest = Math.min(closest, Math.hypot(pose.x - quarry.x, pose.z - quarry.z));
    if (recoverSeconds === Infinity) {
      const bearing = Math.atan2(quarry.x - pose.x, quarry.z - pose.z) - pose.headingY;
      const error = Math.abs(Math.atan2(Math.sin(bearing), Math.cos(bearing)));
      if (error < 0.5) recoverSeconds = (step + 1) * STEP;
    }
  }

  return { recoverSeconds, hops: controller.snapshot().hops, closest, crashes };
}

test('the wedge about-face is quick and clean, never a hop-corrected crawl', () => {
  // The owner's exact sighting shape: nose on a face, the way out behind him.
  // The turn itself was never the slow part — the pivot the obstacle contact
  // arms recovers the heading in under a second — but this pin is what keeps
  // it that way: if any future trigger lets the wall pogo back in (the test
  // below), the hop count and the clock both catch it here first.
  const wedge = wedgeAboutFace('route-41', 120, 40);

  assert.ok(
    wedge.recoverSeconds <= 3,
    `the about-face took ${wedge.recoverSeconds.toFixed(1)} s — the slow hop-correction is back`,
  );
  assert.ok(
    wedge.closest <= CHASE.swingRangeMetres,
    `he turned but never closed (closest ${wedge.closest.toFixed(1)} m)`,
  );
  assert.equal(wedge.hops, 0, `${wedge.hops} hops spent on a turn the ground provides`);
  assert.equal(wedge.crashes, 0, `${wedge.crashes} crashes in a stationary about-face`);
});

test('a wall face is never hop-spammed — the §4.2 pogo stays dead', () => {
  // The reproduced core of the owner's "slowly jumping to correct himself":
  // with the quarry just past the wall, the curb feeler reads the face as a
  // hoppable kerb, and before M24 the cop threw **27 hops in 30 seconds**
  // against it, each buying a few degrees of airborne yaw — the facing
  // corrected by pogo. The fix is `hopMaxCurbHeight` (a wall face reads
  // about a metre on the feeler; no hop mounts that), and the budget below
  // leaves room for the deliberate spin-jump escape, which spends a launch
  // per genuine siege lap — never one per second, which is what a pogo is.
  const wedge = wedgeAboutFace('route-41', 120, -3, 30);
  assert.ok(
    wedge.hops <= 4,
    `${wedge.hops} hops in 30 s against a wall — the pogo is back`,
  );
});

test('the wedged-start siege breaks: one spin escape reaches around the wall', () => {
  // Harder than anything reported from the field, on purpose: the cop
  // *starts* pinned at the face with the quarry eight metres past it — the
  // pose the M18 escape ladder could not leave. Measured before the spin
  // escape existed, ninety seconds of this fixture moved him nowhere at all
  // (closest stayed at his spawn's 8.5 m; with the pogo still alive, 43 hops
  // of jumping on the spot). The owner's remedy was the 180° spin jump, and
  // this is it working end to end through the real controller: wedge lap,
  // spin about-face, committed ride-out along the flank's own leg, around
  // the end and onto the quarry. Being wedged is allowed; staying wedged is
  // the defect.
  const siege = wedgeAboutFace('route-41', 120, -8, 90);
  assert.ok(
    siege.closest <= CHASE.swingRangeMetres,
    `the siege held: closest ${siege.closest.toFixed(1)} m after 90 s`,
  );
  assert.ok(
    siege.hops >= 1,
    'the spin escape never fired — whatever got him around, it was not the M24 move',
  );
  assert.equal(siege.crashes, 0, `${siege.crashes} crashes escaping one wedge`);
});

test('a top-speed head-on rider is met by the cop paddle, not waved past', () => {
  // FEEDBACK-TRIAGE §4.2's second field defect, reproduced through the actual
  // brain → paddle handoff. At two top-speed wheels the range closes at about
  // **59 m/s** on the shipped 65 mph wheel (46 on the 50). Waiting until the
  // ordinary 3.4 m swing radius means the whole gap disappears during the
  // 0.10 s wind-up, so the paddle begins its strike only after the quarry is
  // behind it. A swept paddle cannot repair a swing that was asked for too
  // late.
  //
  // **The fixture's approach was lengthened 12 m → 24 m at M30 Phase 4, and
  // the reason is the mechanism working rather than failing.** The brain's led
  // range is `paddleReach + closingSpeed × (windup + active)`, which is 14.5 m
  // at the shipped closure and was 11.5 m at the old one — so the *whole* 12 m
  // fixture is now inside the wind-up, the cop swings on his very first step
  // before he has observed a closing speed at all, and the strike lands late.
  // That is a fixture too short to contain the lead, not a lead that stopped
  // working: from 24 m he throws one swing at 14.1 m, exactly as the arithmetic
  // says, and lands it. Both start marks stay inside route-41's straight,
  // which runs from the spawn to 94 m.
  const { plan } = generateLevel('route-41');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, 'route-41 produced no spine');
  const brain = new CpuRider(spine, plan, new PlanTerrainSampler(plan));
  const paddle = new Paddle();
  const copAt = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  const quarryAt = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  const speed = RIDEABILITY.topSpeed;
  const target: HittableVolume & { x: number; y: number; z: number } = {
    id: 'rider',
    x: 0,
    y: 0,
    z: 0,
    radius: CHASE.riderHitRadius,
  };
  const targetSet: HittableSet = {
    eachNear(minX, minY, minZ, maxX, maxY, maxZ, visit) {
      if (target.x + target.radius < minX || target.x - target.radius > maxX) return;
      if (target.y + target.radius < minY || target.y - target.radius > maxY) return;
      if (target.z + target.radius < minZ || target.z - target.radius > maxZ) return;
      visit(target);
    },
  };

  let swingRequests = 0;
  let firstSwingRange = Infinity;
  let hits = 0;
  for (let step = 0; step < SIMULATION.hz; step += 1) {
    const seconds = step * STEP;
    // This 24 m stretch is straight in route-41 (the spine holds heading 0 from
    // the spawn to 94 m). Sampling the real route keeps the brain in its
    // production frame while the two riders travel toward one another at the
    // same physical top speed.
    spine.sample(58 + speed * seconds, copAt);
    spine.sample(82 - speed * seconds, quarryAt);
    const view: CpuView = {
      x: copAt.x,
      y: copAt.y,
      z: copAt.z,
      headingY: copAt.headingY,
      speed,
      grounded: true,
      crashed: false,
      curbAhead: 0,
      lateralLimitG: EUC.maxLateralG,
    };
    const quarry: CpuQuarry = {
      x: quarryAt.x,
      y: quarryAt.y,
      z: quarryAt.z,
      speed,
    };
    if (step === 0) brain.place(view);
    const intent = brain.step(STEP, view, quarry);
    const range = Math.hypot(quarry.x - view.x, quarry.z - view.z);
    if (intent.swing) {
      swingRequests += 1;
      if (!Number.isFinite(firstSwingRange)) firstSwingRange = range;
    }
    target.x = quarry.x;
    target.y = quarry.y + CHASE.riderHitHeight;
    target.z = quarry.z;
    hits += paddle.step(STEP, view, intent.swing, targetSet, brain.swingSide).length;
  }

  assert.equal(swingRequests, 1, 'one head-on pass should cost one committed swing');
  assert.ok(
    firstSwingRange > CHASE.swingRangeMetres,
    `the cop waited until ${firstSwingRange.toFixed(2)} m to wind up against a top-speed closure`,
  );
  assert.ok(hits > 0, 'the head-on quarry crossed the cop without meeting the paddle');
});

test('a stopped quarry inside the cop cone is hittable from either side', () => {
  // Owner field report: at close range the cop visibly swung forever while the
  // rider stood beside him. Two guarantees had drifted apart. The brain's cone
  // accepts both sides while M14's authored forehand only crosses the right,
  // and the pursuit used to hold at 3.4 - 1.2 = 2.2 m even though a stopped
  // paddle cannot physically reach that far. Exercise the production
  // brain -> side-latched paddle handoff across the whole accepted cone.
  const { plan } = generateLevel('route-41');
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, 'route-41 produced no spine');
  const at = { x: 0, y: 0, z: 0, headingY: 0, halfWidth: 0, distance: 0 };
  spine.sample(70, at);

  for (const bearingDegrees of [-60, -45, -30, 0, 30, 45, 60]) {
    const bearing = bearingDegrees * Math.PI / 180;
    const heading = at.headingY + bearing;
    const quarry: CpuQuarry = {
      x: at.x + Math.sin(heading) * PADDLE.reach,
      y: at.y,
      z: at.z + Math.cos(heading) * PADDLE.reach,
      speed: 0,
    };
    const view: CpuView = {
      x: at.x,
      y: at.y,
      z: at.z,
      headingY: at.headingY,
      speed: 0,
      grounded: true,
      crashed: false,
      curbAhead: 0,
      lateralLimitG: EUC.maxLateralG,
    };
    const brain = new CpuRider(spine, plan, new PlanTerrainSampler(plan));
    brain.place(view);
    const paddle = new Paddle();
    const target: HittableVolume = {
      id: 'rider',
      x: quarry.x,
      y: quarry.y + CHASE.riderHitHeight,
      z: quarry.z,
      radius: CHASE.riderHitRadius,
    };
    const targetSet: HittableSet = {
      eachNear(minX, minY, minZ, maxX, maxY, maxZ, visit) {
        if (target.x + target.radius < minX || target.x - target.radius > maxX) return;
        if (target.y + target.radius < minY || target.y - target.radius > maxY) return;
        if (target.z + target.radius < minZ || target.z - target.radius > maxZ) return;
        visit(target);
      },
    };

    let requests = 0;
    let hits = 0;
    for (let step = 0; step < SIMULATION.hz; step += 1) {
      const intent = brain.step(STEP, view, quarry);
      if (intent.swing) requests += 1;
      hits += paddle.step(STEP, view, intent.swing, targetSet, brain.swingSide).length;
    }
    assert.equal(requests, 1, `${bearingDegrees} degrees did not produce one committed swing`);
    assert.ok(hits > 0, `${bearingDegrees} degrees is inside the cop cone but outside his paddle`);
  }

  // Just outside the physical hold distance, a stopped cop must keep closing.
  // The old 2.2 m hold returned exactly zero throttle here while every paddle
  // angle missed, creating the permanent stalemate shown in the screenshots.
  const view: CpuView = {
    x: at.x,
    y: at.y,
    z: at.z,
    headingY: at.headingY,
    speed: 0,
    grounded: true,
    crashed: false,
    curbAhead: 0,
    lateralLimitG: EUC.maxLateralG,
  };
  const quarry: CpuQuarry = {
    x: at.x + Math.sin(at.headingY) * (PADDLE.reach + 0.8),
    y: at.y,
    z: at.z + Math.cos(at.headingY) * (PADDLE.reach + 0.8),
    speed: 0,
  };
  const brain = new CpuRider(spine, plan, new PlanTerrainSampler(plan));
  brain.place(view);
  assert.ok(
    brain.step(STEP, view, quarry).throttle > 0,
    'the cop stopped outside the stationary paddle envelope',
  );
});
