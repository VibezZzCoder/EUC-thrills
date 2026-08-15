/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { CHASE, EUC, PADDLE, SIMULATION } from '../data/tuning.ts';
import { generateLevel } from '../level/generateRoute.ts';
import { createLevel } from '../level/levels.ts';
import type { LevelPlan } from '../level/plan.ts';
import { RIDEABILITY } from '../level/routeValidator.ts';
import { CpuRider, type CpuQuarry, type CpuView } from './cpuRider.ts';
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
function rideAlone(plan: LevelPlan, skill: number, maxSeconds = 240): RideResult {
  const spine = RouteSpine.fromPlan(plan);
  assert.ok(spine !== null, 'the route has no spine to follow');

  const sampler = new PlanTerrainSampler(plan);
  const controller = new EucController(sampler, {
    spawn: plan.spawn,
    hazards: new HazardField(plan.hazards ?? []),
    softBodies: new SoftBodyField(plan.softBodies ?? []),
  });
  const brain = new CpuRider(spine, plan, sampler);
  brain.skill = skill;

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

// ---------------------------------------------------------------------------
// The kill gate
// ---------------------------------------------------------------------------

test('a full-skill cop rides every pinned seed out without crashing', () => {
  // **This is the gate.** If it fails and no reasonable brain fixes it, M18
  // stops and the owner's hand-built chase course (`docs/PLANS.md` §18.8) is
  // the recorded remedy.
  const failures: string[] = [];
  let worstOffRoute = 0;
  let slowest = 0;

  for (const seed of SWEEP) {
    const { plan } = generateLevel(seed);
    const ride = rideAlone(plan, 1);
    worstOffRoute = Math.max(worstOffRoute, ride.worstOffRoute);
    slowest = Math.max(slowest, ride.seconds);

    if (ride.crashes > 0) {
      failures.push(`${seed}: ${ride.crashes} crash(es) at ${ride.progress.toFixed(0)} m`);
    }
    if (!ride.finished) {
      failures.push(
        `${seed}: stopped at ${ride.progress.toFixed(0)} m of ${ride.routeLength.toFixed(0)} m`,
      );
    }
  }

  assert.deepEqual(failures, [], `a full-skill cop cannot ride these routes:\n${failures.join('\n')}`);
  // He is following a road, so he has to stay on one. This is a far weaker
  // claim than "he rides the racing line" and it is the one that matters: a cop
  // who reaches the end by ploughing across the surround is not chasing anybody.
  assert.ok(
    worstOffRoute < 12,
    `the cop wandered ${worstOffRoute.toFixed(1)} m off the line, which is not following a road`,
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

  for (const seed of SWEEP.slice(0, 16)) {
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
  // The owner's reproduction of Gaven Sydnes's report: stand square behind
  // the middle of a long wall and watch the cop ride side to side forever.
  // The whole §4.2 fix is that he now works the problem — brakes for the
  // wall, tries its end, backs out of the wedge, slides around, and closes.
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

test('a top-speed head-on rider is met by the cop paddle, not waved past', () => {
  // FEEDBACK-TRIAGE §4.2's second field defect, reproduced through the actual
  // brain → paddle handoff. At two top-speed wheels the range closes at about
  // 44 m/s. Waiting until the ordinary 3.4 m swing radius means the whole gap
  // disappears during the 0.10 s wind-up, so the paddle begins its strike only
  // after the quarry is behind it. A swept paddle cannot repair a swing that
  // was asked for too late.
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
    // This 12 m stretch is straight in route-41. Sampling the real route keeps
    // the brain in its production frame while the two riders travel toward one
    // another at the same physical top speed.
    spine.sample(70 + speed * seconds, copAt);
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
