/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './harness.ts';
import { EUC, LIGHTING, PHYSICS, SIMULATION, TERRAIN, WHEEL } from '../src/data/tuning.ts';
import { MARKINGS } from '../src/data/markings.ts';
import {
  ALLEY_ROUTE,
  SAFE_ROUTE,
  SLICE_BEATS,
  SLICE_POCKETS,
} from '../src/level/sliceLevel.ts';

/**
 * M7 — the vertical-slice level.
 *
 * The level's *geometry* is proven headlessly in `src/level/sliceLevel.test.ts`:
 * the beats, the sockets, the fork's exact rejoin, the kicker's drop, the
 * pockets' heights against the wheel's own hop, the loop's closure, and the
 * bound on corridor crossings. All of that is arithmetic on plain data and a
 * browser would make it slower and no truer.
 *
 * What only a browser can prove is the half that involves three.js and the
 * controller together:
 *
 * - that the **renderer built this world from the plan**, on a second producer
 *   of `LevelPlan` — which is invariant 2 demonstrated rather than asserted;
 * - that **both routes can actually be ridden**, and that the shortcut is
 *   faster when a rider drives it rather than when a test adds up lengths;
 * - that the beats **do the thing they were authored to do** — the kerb costs
 *   speed, the alley's steps launch, the kicker throws the wheel, the ledge
 *   needs the charged hop, the gate occludes the camera, the climb loads the
 *   power ladder;
 * - that a long free ride over all of it leaves a **clean console and a
 *   resource plateau**, on a world an order of magnitude larger than M4's.
 *
 * Nothing here asserts a frame time. See `playwright.config.ts`.
 */

const STEPS = (seconds: number): number => Math.round(seconds * SIMULATION.hz);
const STEP_UP = WHEEL.pedalHeight * TERRAIN.stepUpPedalFactor;
const HOP_HEIGHT = (EUC.hopLaunchSpeed ** 2) / (2 * PHYSICS.gravity);

/** A place on a named beat, in world space, from the plan the game shipped. */
async function spotOn(
  page: import('@playwright/test').Page,
  id: string,
  along: number,
  lateral = 0,
): Promise<{ x: number; z: number; headingY: number }> {
  return page.evaluate(([beatId, s, t]) => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === beatId);
    if (segment === undefined) throw new Error(`no segment ${String(beatId)}`);
    const turn = segment.exit.headingY - segment.entry.headingY;
    const dx = segment.exit.position.x - segment.entry.position.x;
    const dz = segment.exit.position.z - segment.entry.position.z;
    const chord = Math.hypot(dx, dz);
    const length = Math.abs(turn) < 1e-9 ? chord : (chord * (turn / 2)) / Math.sin(turn / 2);
    const curvature = length > 0 ? turn / length : 0;
    const h0 = segment.entry.headingY;
    const distance = Number(s);
    const heading = h0 + curvature * distance;
    const centre = Math.abs(curvature) < 1e-9
      ? {
        x: segment.entry.position.x + Math.sin(h0) * distance,
        z: segment.entry.position.z + Math.cos(h0) * distance,
      }
      : {
        x: segment.entry.position.x + (Math.cos(h0) - Math.cos(heading)) / curvature,
        z: segment.entry.position.z + (Math.sin(heading) - Math.sin(h0)) / curvature,
      };
    return {
      x: centre.x + Math.cos(heading) * Number(t),
      z: centre.z - Math.sin(heading) * Number(t),
      headingY: heading,
    };
  }, [id, along, lateral] as const);
}

// ---------------------------------------------------------------------------
// The world that shipped
// ---------------------------------------------------------------------------

test('the game ships the slice level, and the renderer built it from the plan', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const snapshot = await page.evaluate(() => window.qa.snap());
  expect(snapshot.levelPlanId).toBe('m7-slice');

  // Invariant 2, on a second producer: the sampler's colliders and the
  // renderer's cells came out of the same structure, and the renderer still has
  // no ground of its own.
  const scene = await page.evaluate(() => window.qa.terrainScene());
  expect(scene.placeholderGroundPresent).toBe(false);
  expect(scene.placeholderGridPresent).toBe(false);
  expect(scene.heightfieldPresent).toBe(true);
  expect(scene.surroundPresent).toBe(true);
  expect(scene.heightfieldHasVertexColours).toBe(true);
  expect(snapshot.level.cellsDrawn).toBeGreaterThan(0);
  // Two triangles per drawn heightfield cell, plus whatever the merged block
  // meshes add — so the ground's own count is a floor rather than the total.
  expect(snapshot.level.triangles).toBeGreaterThanOrEqual(snapshot.level.cellsDrawn * 2);
  expect(snapshot.level.colliders).toBeGreaterThan(50);
  expect(snapshot.level.segments).toBeGreaterThanOrEqual(
    SLICE_BEATS.reduce((total, beat) => total + beat.segments.length, 0),
  );

  // Every painted surface reaches the screen as its own material, or the level
  // is one the player cannot read.
  expect(new Set(scene.heightfieldColours).size).toBe(snapshot.level.surfaces.length);
  expect(scene.blockMeshes.length).toBeGreaterThan(2);

  // **The backstop goes under the world, not under the surround.** The city
  // sits at the surround's own height and the river valley six and a half
  // metres below it, so a plane parked a few centimetres under the surround is
  // a lid over the whole park — correct ground underneath and nothing visible
  // but grass. Found by riding the Pages build to the park gate.
  const lowest = await page.evaluate(
    () => Math.min(...window.game.levelPlan.heightfield.heights),
  );
  expect(lowest).toBeLessThan(-6);
  expect(scene.surroundCentre.y).toBeLessThan(lowest);

  expect(errors).toEqual([]);
});

test('the proving ground is still reachable, and is not what a player gets', async ({ page }) => {
  // M7's answer to `docs/PLANS.md` §10 decision 5, made visible: the M2–M6
  // measuring instrument survives as a diagnostic behind a query parameter, and
  // the shipped world is the slice.
  await boot(page, 'level=proving');
  expect((await page.evaluate(() => window.qa.snap())).levelPlanId).toBe('m4-proving-ground');

  await boot(page, 'level=nonsense');
  expect((await page.evaluate(() => window.qa.snap())).levelPlanId).toBe('m7-slice');
});

test('the rider starts in the plaza with room to find the throttle', async ({ page }) => {
  await boot(page);

  const ground = await page.evaluate(() => window.qa.groundAt(0, 0));
  expect(ground.surface).toBe('brick');
  expect(ground.offCourse).toBe(false);

  // Ten seconds of full throttle from the spawn without meeting anything: the
  // plaza's furniture is all off the centre lane on purpose.
  const trace = await page.evaluate(([steps]) => window.qa.rideTrace(
    { throttle: 1, steer: 0 },
    Number(steps),
    30,
  ), [STEPS(6)] as const);
  expect(trace.every((sample) => !sample.blocked)).toBe(true);
  expect(trace[trace.length - 1].speed).toBeGreaterThan(10);
});

// ---------------------------------------------------------------------------
// Beat 4: both routes are rideable, and the shortcut is a shortcut
// ---------------------------------------------------------------------------

test('both routes through the fork are rideable, and the alley is the faster one', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // One driver, two routes, driven equally badly — see `followRoute`. Each run
  // starts at the fork's exit and ends at the park gate, so the two are timed
  // over exactly the same pair of sockets.
  //
  // **Speed-capped since M16, at the old full throttle's top speed.** This
  // driver has two gains and no eyes; it was calibrated against a wheel that
  // ran out of pull at 15 m/s, and at the shipped 29.06 m/s (65 mph — 22.3 m/s
  // when M16 wrote this) it arrives at the alley's drops far too fast and
  // crashes — which measures the follower, not the fork. The cap brakes it back to 15 and leaves its acceleration and its
  // hill climbing untouched, so both routes are still driven equally badly in
  // the same way they always were. A human rider keeps the whole new range.
  const run = async (ids: readonly string[]) => page.evaluate(([route]) => {
    const points = window.qa.routePoints(route as string[], 3);
    return window.qa.followRoute(points, { lookAhead: 7, maxSteps: 6000, maxSpeed: 10 });
  }, [ids] as const);

  const safe = await run(SAFE_ROUTE);
  const alley = await run(ALLEY_ROUTE);

  expect(safe.finished).toBe(true);
  expect(alley.finished).toBe(true);
  expect(safe.crashes).toBe(0);
  expect(alley.crashes).toBe(0);

  // The road is the fast, open one; the alley is the short, tight one. Both
  // facts have to hold or the fork is not a choice.
  expect(safe.meanSpeed).toBeGreaterThan(alley.meanSpeed);
  expect(alley.seconds).toBeLessThan(safe.seconds);
  // Measured on this build: the road is 212.8 m at a mean 12.6 m/s and the
  // alley 120.6 m at 10.2, so the shortcut is worth about five seconds. The
  // bound is deliberately looser than the measurement — this is evidence that
  // the trade exists, not a lock on today's tuning.
  expect(safe.seconds - alley.seconds).toBeGreaterThan(3);

  // And the alley makes the rider work for it: three committed drops on the way
  // through, against a road that never leaves the ground.
  expect(alley.landings).toBeGreaterThanOrEqual(3);
  expect(safe.landings).toBeLessThan(alley.landings);

  expect(errors).toEqual([]);
});

test('the alley’s three steps put the wheel in the air, one at a time', async ({ page }) => {
  await boot(page);

  const start = await spotOn(page, 'alley-upper', 4);
  const flight = await page.evaluate(([x, z, heading, steps]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    // **Half throttle since M16, and there is a band either side of it.** At
    // 0.7 the raised top speed carries the wheel over the first two steps in
    // one flight — a different and entirely correct thing happening, but not
    // the "one at a time" this test is named for — and much under 0.4 it
    // trickles down them without leaving the ground at all. Anything from
    // about 0.42 to 0.6 shows the three separate drops; 0.5 is the middle of
    // that band rather than an edge of it.
    const samples = window.qa.rideTrace({ throttle: 0.5, steer: 0 }, Number(steps), 1);
    // Count the separate airborne spells rather than the airborne steps: three
    // steps in nine metres is three drops, not one long one.
    let spells = 0;
    let wasAirborne = true;
    let peak = 0;
    for (const sample of samples) {
      if (!sample.grounded && wasAirborne === false) spells += 1;
      if (!sample.grounded) peak = Math.max(peak, sample.airHeight);
      wasAirborne = !sample.grounded;
    }
    return { spells, peak, landings: samples[samples.length - 1].landings };
  }, [start.x, start.z, start.headingY, STEPS(6)] as const);

  expect(flight.spells).toBeGreaterThanOrEqual(3);
  expect(flight.landings).toBeGreaterThanOrEqual(3);
});

test('the alley-only ledge is out of reach of a plain hop and inside a charged one', async ({ page }) => {
  await boot(page);

  const ledge = await page.evaluate(() => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === 'alley-ledge');
    const alley = window.game.levelPlan.segments.find((each) => each.id === 'alley-upper');
    if (segment === undefined || alley === undefined) throw new Error('no ledge');
    return { rise: segment.entry.position.y - alley.entry.position.y };
  });

  // The wheel's own two hop heights, measured through the controller rather than
  // taken from the table, exactly as `m5.spec.ts` measures them.
  const start = await spotOn(page, 'alley-upper', 6);
  const hops = await page.evaluate(([x, z, heading]) => {
    const measure = (crouch: boolean): number => {
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      if (crouch) {
        window.game.setActions({ crouch: true });
        window.game.advance(60);
      }
      window.game.setActions({ crouch, hop: true });
      window.game.advance(1);
      window.game.setActions({ crouch, hop: false });
      let peak = 0;
      for (let i = 0; i < 200; i += 1) {
        window.game.advance(1);
        peak = Math.max(peak, window.game.snapshot().euc.airHeight);
      }
      window.game.clearActions();
      return peak;
    };
    return { plain: measure(false), charged: measure(true) };
  }, [start.x, start.z, start.headingY] as const);

  expect(hops.plain).toBeLessThan(ledge.rise);
  expect(hops.charged).toBeGreaterThan(ledge.rise);
});

// ---------------------------------------------------------------------------
// The beats that teach something
// ---------------------------------------------------------------------------

test('the curb run costs speed rolled and costs nothing hopped', async ({ page }) => {
  await boot(page);

  // Beat 3, on the level the player rides. The measurable half of "hop up to cut
  // a corner": the sidewalk is a step, and the step has a price.
  const kerb = await page.evaluate(() => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === 'curb-run');
    if (segment === undefined) throw new Error('no curb run');
    const block = segment.colliders[0];
    return {
      top: block.centre.y + block.halfExtents.y,
      x: block.centre.x,
      z: block.centre.z,
      heading: block.rotationY,
    };
  });
  expect(kerb.top).toBeGreaterThan(TERRAIN.curbThreshold);
  expect(kerb.top).toBeLessThan(STEP_UP);

  // Approach from the road side, square on to the kerb's own heading.
  const cost = await page.evaluate(([x, z, heading]) => {
    // Start out in the road and ride straight at the kerb's face. `left(h)` is
    // `(cos h, -sin h)`, and the kerb sits on the corridor's right — so the
    // approach starts to its LEFT and heads along `-left`, which is a heading of
    // `h - pi/2` (`data/tuning.ts`: forward is `(sin h, cos h)`).
    const reach = 11;
    const startX = Number(x) + Math.cos(Number(heading)) * reach;
    const startZ = Number(z) - Math.sin(Number(heading)) * reach;
    window.qa.placeRider(startX, startZ, Number(heading) - Math.PI / 2);
    const samples = window.qa.rideTrace({ throttle: 1, steer: 0 }, 360, 1);
    const index = samples.findIndex((sample) => sample.lastStepUp > 0);
    if (index < 1) return { before: 0, stepUp: 0, after: 0 };
    return {
      before: samples[index - 1].speed,
      stepUp: samples[index].lastStepUp,
      after: samples[index].speed,
    };
  }, [kerb.x, kerb.z, kerb.heading] as const);

  expect(cost.stepUp).toBeGreaterThan(TERRAIN.curbThreshold);
  expect(cost.before - cost.after).toBeGreaterThan(1.5);
});

test('the kicker throws the wheel off its lip and puts it back down on the flat', async ({ page }) => {
  await boot(page);

  const start = await spotOn(page, 'kicker-run', 2);
  const jump = await page.evaluate(([x, z, heading, steps]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    const samples = window.qa.rideTrace({ throttle: 1, steer: 0 }, Number(steps), 1);
    let peak = 0;
    let airborneSteps = 0;
    let quality = 'none';
    let landings = 0;
    for (const sample of samples) {
      if (!sample.grounded) {
        airborneSteps += 1;
        peak = Math.max(peak, sample.airHeight);
      }
      if (sample.landings > landings) {
        landings = sample.landings;
        quality = sample.landingQuality;
      }
    }
    return { peak, airborneSteps, quality, landings };
  }, [start.x, start.z, start.headingY, STEPS(9)] as const);

  // A 1.20 m drop off the lip is a real flight, not a bump.
  expect(jump.airborneSteps).toBeGreaterThan(STEPS(0.35));
  expect(jump.landings).toBeGreaterThanOrEqual(1);
  // And it is survivable ridden square, which is the whole difference between a
  // jump with a consequence and a jump with a punishment.
  expect(jump.quality).not.toBe('crash');
});

test('the park gate puts something between the rider and their own camera', async ({ page }) => {
  await boot(page);

  // **A straight run through a gap does not occlude anything**, which is the
  // finding the proving ground's gateway cost and which is written up in
  // `docs/LESSONS_LEARNED.md`: the camera follows the rider through whatever
  // gap they went through. What occludes is being *past* the gate and off to
  // one side, so a pier sits on the line between the rider and the camera —
  // the commonest place a third-person camera meets a wall.
  const pastTheGate = await spotOn(page, 'park-gate', 19, -4.5);
  const behind = await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
    window.qa.placeRider(spot.x, spot.z, spot.headingY);
    window.qa.advance(240);
    const parked = window.qa.snap().camera;
    const restoring = window.qa.occlusionTrace({ throttle: 0.6, steer: 0 }, 300, 20);
    return { parked, restoring };
  }, pastTheGate);

  expect(behind.parked.scriptedOcclusion).toBe(false);
  // The arm is pulled in to the pier's own face rather than to a fraction: the
  // measured stop is about 3.7 m against the 4.2 m the speed easing asked for,
  // which is where the stone is.
  expect(behind.parked.armDistance).toBeLessThan(behind.parked.distance - 0.4);

  // And it gives the arm back slowly rather than popping, which is the
  // asymmetry M3 built and M4 measured against the proving ground's gateway.
  const restored = behind.restoring[behind.restoring.length - 1];
  expect(restored.ratio).toBeGreaterThan(behind.restoring[0].ratio);
  for (let i = 1; i < behind.restoring.length; i += 1) {
    expect(behind.restoring[i].armDistance)
      .toBeGreaterThanOrEqual(behind.restoring[i - 1].armDistance - 1e-6);
  }
});

test('the gate’s own opening leaves the camera alone', async ({ page }) => {
  await boot(page);

  // The other half of the claim: a probe that fires everywhere is not a
  // feature. Dead centre in the passage, with nothing on the sight line, the
  // arm must be exactly the arm the speed easing asked for.
  const inTheGap = await spotOn(page, 'park-gate', 12, 0);
  const clear = await page.evaluate((spot: { x: number; z: number; headingY: number }) => {
    window.qa.placeRider(spot.x, spot.z, spot.headingY);
    window.qa.advance(240);
    return window.qa.snap().camera;
  }, inTheGap);

  expect(clear.armDistance).toBeCloseTo(clear.distance, 2);
});

test('the return climb loads the power ladder on the way home', async ({ page }) => {
  await boot(page);

  // From the landing, so the rider hits the ramp with speed rather than
  // grinding up it from a standstill — the ladder's hill term is scaled by
  // speed, because climbing costs power rather than torque (`EucController`).
  const start = await spotOn(page, 'kicker-land', 8);
  const climb = await page.evaluate(([x, z, heading, steps]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    const startY = window.game.snapshot().euc.position.y;
    window.game.setActions({ throttle: 1, steer: 0 });
    let peakLoad = 0;
    let flatLoad = 0;
    let peakSlope = 0;
    for (let i = 0; i < Number(steps); i += 4) {
      window.game.advance(4);
      const euc = window.game.snapshot().euc;
      // The run-up is flat dirt; the ramp is everything with a gradient. Both
      // are ridden at full throttle by the same wheel, which is what makes the
      // comparison below a measurement of the hill and of nothing else.
      if (euc.slope > 0.02) {
        peakLoad = Math.max(peakLoad, euc.loadFactor);
        peakSlope = Math.max(peakSlope, euc.slope);
      } else if (peakSlope === 0) {
        flatLoad = Math.max(flatLoad, euc.loadFactor);
      }
    }
    const gained = window.game.snapshot().euc.position.y - startY;
    window.game.clearActions();
    return { peakLoad, flatLoad, peakSlope, gained };
  }, [start.x, start.z, start.headingY, STEPS(7)] as const);

  expect(climb.gained).toBeGreaterThan(2);
  expect(climb.peakSlope).toBeGreaterThan(0.1);
  // **Measured against the same wheel on the flat, since M16.** This used to
  // assert the amber rung by name, and at 15 m/s a five-metre ramp reached it:
  // the wheel spent about four seconds on the hill, which is long enough for a
  // 0.55 s load response to build. At M16's 22.3 m/s the same ramp was crested
  // in two, and at the shipped 29.06 m/s it goes by quicker still, so the
  // ladder — correctly — barely notices a climb this short. What §4.1
  // actually promises is that "hill climbing consumes power headroom", and that
  // is still emphatically true: the ramp costs about four times what the flat
  // run-up into it costs. A *sustained* climb still reaches the rungs, and
  // `EucController.test.ts` holds that claim on a fixture long enough to show it.
  expect(climb.flatLoad).toBeGreaterThan(0);
  expect(climb.peakLoad).toBeGreaterThan(climb.flatLoad * 2.5);
  expect(climb.peakLoad).toBeGreaterThan(0.35);
});

// ---------------------------------------------------------------------------
// The pockets
// ---------------------------------------------------------------------------

test('the three off-route pockets are ground a rider can reach and ride', async ({ page }) => {
  await boot(page);

  for (const pocket of SLICE_POCKETS) {
    for (const id of pocket.segments) {
      const spot = await spotOn(page, id, 6);
      const ground = await page.evaluate(([x, z]) => window.qa.groundAt(Number(x), Number(z)),
        [spot.x, spot.z] as const);
      expect(ground.offCourse, `${pocket.name} is off the heightfield`).toBe(false);
      expect(Number.isFinite(ground.height)).toBe(true);
    }
  }

  // The swale is genuinely below grade, and its banks are climbable: the rider
  // gets in by falling in and out by riding.
  const floor = await spotOn(page, 'drain-run', 30);
  const climbOut = await page.evaluate(([x, z, heading, steps]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading));
    const start = window.game.snapshot().euc.position.y;
    // Turn across the channel, then release the turn and drive up the bank.
    // Holding full technical lock for all six seconds draws a tight circle on
    // the floor; it no longer means "cross the channel" after M16.
    window.qa.rideTrace({ throttle: 1, steer: 1 }, 60, 10);
    const samples = window.qa.rideTrace(
      { throttle: 1, steer: 0 },
      Math.max(0, Number(steps) - 60),
      10,
    );
    return { start, peak: Math.max(...samples.map((sample) => sample.y)) };
  }, [floor.x, floor.z, floor.headingY, STEPS(6)] as const);

  expect(climbOut.start).toBeLessThan(-0.5);
  expect(climbOut.peak).toBeGreaterThan(climbOut.start + 0.4);
});

test('the low walls are one the wheel mounts and one it has to be hopped onto', async ({ page }) => {
  await boot(page);

  const walls = await page.evaluate(() => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === 'terrace');
    if (segment === undefined) throw new Error('no terrace');
    return segment.colliders
      .filter((collider) => collider.halfExtents.y < 1)
      .map((collider) => collider.centre.y + collider.halfExtents.y - segment.entry.position.y)
      .sort((a, b) => a - b);
  });

  expect(walls.length).toBeGreaterThanOrEqual(2);
  expect(walls[0]).toBeLessThan(STEP_UP);
  expect(walls[walls.length - 1]).toBeGreaterThan(STEP_UP);
  expect(walls[walls.length - 1]).toBeLessThan(HOP_HEIGHT);
});

test('a solid plaza obstacle takes the rider off before the tyre clips into it', async (
  { page },
  testInfo,
) => {
  const errors = collectErrors(page);
  await boot(page);

  // Approach the fountain's near face square-on from the open centre of the
  // plaza. This is the player-visible version of the screenshot report: the
  // point contact patch used to stop at the face, leaving most of the rendered
  // tyre and the rider inside it, while the controller merely scrubbed to zero.
  const approach = await spotOn(page, 'plaza', 31, 5);
  const collision = await page.evaluate(([x, z, heading, maxSteps]) => {
    window.qa.placeRider(Number(x), Number(z), Number(heading) + Math.PI / 2);
    const plaza = window.game.levelPlan.segments.find((segment) => segment.id === 'plaza');
    const fountain = plaza?.colliders.find((collider) => (
      collider.appearance === 'stone' && collider.halfExtents.y < 1
    ));
    if (fountain === undefined) throw new Error('no plaza fountain');

    const rideToImpact = (stopWhenBlocked: boolean) => {
      window.game.setActions({ throttle: 1, steer: 0 });
      let steps = 0;
      while (steps < Number(maxSteps)) {
        window.game.advance(1);
        steps += 1;
        const euc = window.game.snapshot().euc;
        if (euc.crashed || (stopWhenBlocked && euc.blocked)) break;
      }
      window.game.clearActions();
      return { steps, snapshot: window.game.snapshot() };
    };

    // Prove the F4 path reaches the running controller, not merely the visible
    // registry: this same impact is catchable when its threshold is raised.
    window.game.tuning.set('EUC.obstacleCrashSpeed', 12);
    const raised = rideToImpact(true);

    window.game.tuning.reset('EUC.obstacleCrashSpeed');
    window.qa.placeRider(Number(x), Number(z), Number(heading) + Math.PI / 2);
    const defaultRun = rideToImpact(false);
    const atImpact = defaultRun.snapshot;

    // Freeze the named transient after the impact long enough for the lateral
    // separation and crash camera to become plainly visible.
    window.game.advance(36);
    window.game.loop.setRunning(false);
    const scene = window.game.renderer.scene;
    const rider = scene.getObjectByName('rider-blockout');
    const after = window.game.snapshot();
    return {
      steps: defaultRun.steps,
      raised: raised.snapshot.euc,
      atImpact: atImpact.euc,
      crashFrame: after.camera.crashFrame,
      riderLocal: rider === undefined
        ? { x: Number.NaN, z: Number.NaN }
        : { x: rider.position.x, z: rider.position.z },
      nearFace: fountain.centre.x - fountain.halfExtents.x,
    };
  }, [approach.x, approach.z, approach.headingY, STEPS(8)] as const);

  await testInfo.attach('m15-obstacle-ragdoll-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.evaluate(() => window.game.loop.setRunning(true));

  expect(collision.raised.blocked).toBe(true);
  expect(collision.raised.collisionImpact).toBeGreaterThanOrEqual(EUC.obstacleCrashSpeed);
  expect(collision.raised.collisionImpact).toBeLessThan(12);
  expect(collision.raised.crashed).toBe(false);
  expect(collision.atImpact.crashed).toBe(true);
  expect(collision.atImpact.crashCause).toBe('obstacle');
  expect(collision.atImpact.crashMotion).toBe('sideFall');
  expect(collision.atImpact.collisionImpact).toBeGreaterThanOrEqual(EUC.obstacleCrashSpeed);
  expect(collision.atImpact.position.x).toBeLessThanOrEqual(
    collision.nearFace - WHEEL.tyreDiameter / 2 + 0.03,
  );
  expect(collision.crashFrame).toBeGreaterThan(0.4);
  // M15: the ragdoll owns the separated body, so where it lands is dynamics
  // rather than a scripted axis. The claim that survives is the one the
  // original screenshot report was about — the rider is visibly separated
  // from the wheel, not standing inside it.
  expect(collision.atImpact.ragdolling).toBe(true);
  expect(Math.hypot(collision.riderLocal.x, collision.riderLocal.z)).toBeGreaterThan(0.2);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Free ride, which is the mode the vision makes the primary success test
// ---------------------------------------------------------------------------

test('a long free ride across the whole loop is clean and does not grow', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // Two laps of the ten beats, driven end to end, then a spell of aimless
  // riding — which is the thing `docs/PLANS.md` §14 calls the deciding gate and
  // the closest an automated pass can get to it.
  //
  // **The plateau is measured between the two laps, not against boot.** The
  // particle fields' geometry is created on first use, so a lap that lands hard
  // enough to throw dust legitimately allocates once; what must not happen is
  // that the *second* lap allocates again.
  // Driven at 70% throttle since the pedal-strike retune (owner, 2026-08-04:
  // scrapes saved for hard carves). The retune changed how much drag a hard
  // corner sees, and this dumb proportional follower was riding the old drag
  // to within centimetres of the plaza props — at full throttle it now clips
  // the fountain on a line a player would simply not take. 70% keeps the lap
  // a genuine fast ride while giving the follower the margin a human's eyes
  // provide. This remains a fast whole-level ride, but it no longer asks the
  // route follower to take the dirt jump at its landing-crash threshold.
  const laps = await page.evaluate(([ids]) => {
    const route = window.qa.routePoints(ids as string[], 4);
    // The hard low-speed technique now spends the real lateral load and can
    // alter this blind follower's take-off alignment after a sharp correction.
    // Cap at 8 m/s so its no-eyes dirt-jump line stays below the crash tier;
    // throttle remains 0.7 so the return climb keeps its authority.
    const drive = { lookAhead: 8, maxSteps: 30000, throttle: 0.7, maxSpeed: 8 };
    const first = window.qa.followRoute(route, drive);
    const before = window.game.snapshot().resources;
    const second = window.qa.followRoute(route, drive);
    return { first, second, before };
  }, [SLICE_BEATS.flatMap((beat) => beat.segments).filter((id) => !id.startsWith('alley'))] as const);
  const before = laps.before;

  expect(laps.first.finished, JSON.stringify(laps.first)).toBe(true);
  expect(laps.second.finished, JSON.stringify(laps.second)).toBe(true);
  // Deterministic: the same drive twice reaches the same place in the same time.
  expect(laps.second.steps).toBe(laps.first.steps);
  expect(laps.first.offCourseSteps / Math.max(1, laps.first.steps)).toBeLessThan(0.25);

  await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.rideTrace({ throttle: 1, steer: 0.4 }, 2400, 600);
    window.qa.resetRide();
  });

  const after = await page.evaluate(() => window.qa.snap().resources);
  expect(after.geometries).toBeLessThanOrEqual(before.geometries);
  expect(after.textures).toBeLessThanOrEqual(before.textures);
  expect(after.sceneObjects).toBeLessThanOrEqual(before.sceneObjects);
  expect(after.lights).toBe(before.lights);

  expect(errors).toEqual([]);
});

test('the slice stays inside the draw-call and triangle budget', async ({ page }) => {
  await boot(page);

  // DESIGN.md §8. Triangles and draw calls are reportable; a frame time is not.
  const idle = await page.evaluate(() => {
    window.qa.freeze();
    window.qa.advance(1);
    return window.qa.snap();
  });
  expect(idle.render.drawCalls).toBeLessThanOrEqual(150);
  expect(idle.render.triangles).toBeLessThanOrEqual(400_000);

  // And under load, riding, with contact particles alive.
  const riding = await page.evaluate(([steps]) => {
    window.qa.thaw();
    window.qa.rideTrace({ throttle: 1, steer: 0.5 }, Number(steps), 200);
    return window.qa.snap();
  }, [STEPS(8)] as const);
  expect(riding.render.drawCalls).toBeLessThanOrEqual(150);
  expect(riding.render.triangles).toBeLessThanOrEqual(400_000);
});

// ---------------------------------------------------------------------------
// M7.5 stage 4 and 5 — the paint, the edges, and the coupled system
// ---------------------------------------------------------------------------

test('the renderer built the road paint, in one draw call, off the kerbs', async ({ page }) => {
  await boot(page);
  const scene = await page.evaluate(() => window.qa.terrainScene());

  // One mesh for every painted line in the world. Two paints ride on the vertex
  // colour, exactly as a hundred tree tones ride on an instance colour, so a
  // second mesh here means somebody split the material and spent a draw call.
  expect(scene.paint.meshes).toBe(1);
  expect(scene.paint.triangles).toBeGreaterThan(500);
  expect(scene.paint.triangles).toBeLessThanOrEqual(MARKINGS.maxTriangles);

  // The instance-colour trap's other face (`DESIGN.md` §7c): a colour attribute
  // the material never declares renders black, and there is no warning.
  expect(scene.paint.hasVertexColours).toBe(true);
  // The sixth time this project would have shipped something too dark.
  expect(scene.paint.darkestTone).toBeGreaterThan(0.1);
  expect(scene.paint.brightestTone).toBeLessThan(0.7);

  // Paint is the road, not a thing standing on it. Casting would draw a grey
  // dashed line beside every white one; not receiving would make it glow
  // through a tree's shadow.
  expect(scene.paint.castsShadow).toBe(false);
  expect(scene.paint.receivesShadow).toBe(true);

  const ribbonAudit = await page.evaluate((lift) => {
    let maximum = 0;
    let unpaintable = 0;
    let offCourse = 0;
    window.game.renderer.scene.traverse((object) => {
      if (object.name !== 'level-markings-paint') return;
      const mesh = object as unknown as {
        geometry: { attributes: { position: {
          count: number;
          getX(index: number): number;
          getY(index: number): number;
          getZ(index: number): number;
        } } };
      };
      const position = mesh.geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const ground = window.qa.groundAt(position.getX(index), position.getZ(index));
        maximum = Math.max(maximum, Math.abs(position.getY(index) - ground.height - lift));
        if (!['brick', 'pavement', 'roughPavement'].includes(ground.surface)) unpaintable += 1;
        if (ground.offCourse) offCourse += 1;
      }
    });
    return { maximum, unpaintable, offCourse };
  }, MARKINGS.lift);
  expect(ribbonAudit.maximum).toBeLessThan(1e-4);
  expect(ribbonAudit.unpaintable).toBe(0);
  expect(ribbonAudit.offCourse).toBe(0);
});

test('rebuilding the dressed level releases its per-instance GPU buffers', async ({ page }) => {
  await page.addInitScript(() => {
    const stats = { created: 0, deleted: 0 };
    Object.defineProperty(window, '__m7BufferStats', { value: stats, configurable: true });
    for (const name of ['WebGLRenderingContext', 'WebGL2RenderingContext']) {
      const constructor = (window as unknown as Record<string, {
        prototype: WebGLRenderingContext;
      }>)[name];
      if (constructor === undefined) continue;
      const prototype = constructor.prototype;
      const originalCreate = prototype.createBuffer;
      const originalDelete = prototype.deleteBuffer;
      prototype.createBuffer = function createBuffer(): WebGLBuffer {
        const buffer = originalCreate.call(this);
        stats.created += 1;
        return buffer;
      };
      prototype.deleteBuffer = function deleteBuffer(buffer: WebGLBuffer | null): void {
        if (buffer !== null) stats.deleted += 1;
        originalDelete.call(this, buffer);
      };
    }
  });
  await boot(page);

  const live = await page.evaluate(() => {
    const stats = (window as unknown as {
      __m7BufferStats: { created: number; deleted: number };
    }).__m7BufferStats;
    window.qa.freeze();
    window.game.renderer.render();
    const samples = [stats.created - stats.deleted];
    for (let rebuild = 0; rebuild < 4; rebuild += 1) {
      window.game.renderer.setLevel(window.game.levelPlan);
      window.game.renderer.render();
      samples.push(stats.created - stats.deleted);
    }
    return samples;
  });

  expect(live[0]).toBeGreaterThan(0);
  expect(live.slice(1)).toEqual([live[0], live[0], live[0], live[0]]);
});

test('the paint costs one draw call and stays inside the whole budget', async ({ page }) => {
  await boot(page);

  const withPaint = await page.evaluate(() => {
    window.qa.freeze();
    window.qa.advance(1);
    return window.qa.snap().render;
  });
  const without = await page.evaluate(() => {
    window.game.renderer.scene.traverse((object) => {
      if (object.name.startsWith('level-markings-')) object.visible = false;
    });
    window.qa.advance(1);
    const render = window.qa.snap().render;
    window.game.renderer.scene.traverse((object) => {
      if (object.name.startsWith('level-markings-')) object.visible = true;
    });
    return render;
  });

  // Measured against the same frame with the paint hidden, rather than against
  // a number written down at some earlier milestone.
  expect(withPaint.drawCalls - without.drawCalls).toBeLessThanOrEqual(MARKINGS.maxDrawCalls);
  expect(withPaint.drawCalls).toBeLessThanOrEqual(150);
  expect(withPaint.triangles).toBeLessThanOrEqual(400_000);
});

test('the coupled system is the one M7.5 stage 5 settled on', async ({ page }) => {
  await boot(page);
  const scene = await page.evaluate(() => window.qa.terrainScene());
  const state = await page.evaluate(() => {
    const renderer = window.game.renderer;
    return {
      exposure: renderer.renderer.toneMappingExposure,
      background: renderer.scene.background !== null,
    };
  });

  // The haze and the sky's horizon stop are the same value by contract
  // (`DESIGN.md` §6f), and the fog's near distance was pulled in at stage 5 so
  // aerial perspective starts before the skyline rather than at it.
  expect(scene.fog).not.toBeNull();
  expect(scene.fog!.near).toBe(LIGHTING.fogNear);
  expect(scene.fog!.far).toBe(LIGHTING.fogFar);
  expect(scene.fog!.near).toBeLessThan(scene.fog!.far);
  // Aerial perspective has to begin beyond anything the rider is reading the
  // ground at, and well inside the skyline it is there to soften.
  expect(scene.fog!.near).toBeGreaterThan(80);
  expect(scene.fog!.near).toBeLessThan(200);

  expect(state.background).toBe(true);
  expect(state.exposure).toBe(LIGHTING.exposure);
});

test('the shadow cascade reaches the dressing, not only the rider', async ({ page }) => {
  await boot(page);
  const shadow = await page.evaluate(() => {
    const scene = window.game.renderer.scene;
    let found: { left: number; right: number; mapSize: number } | null = null;
    scene.traverse((object) => {
      const light = object as unknown as {
        isDirectionalLight?: boolean;
        shadow?: { camera: { left: number; right: number }; mapSize: { x: number } };
      };
      if (light.isDirectionalLight === true && light.shadow !== undefined) {
        found = {
          left: light.shadow.camera.left,
          right: light.shadow.camera.right,
          mapSize: light.shadow.mapSize.x,
        };
      }
    });
    return found;
  });
  expect(shadow).not.toBeNull();
  const cascade = shadow as unknown as { left: number; right: number; mapSize: number };
  expect(cascade.right).toBe(LIGHTING.shadowRadius);
  expect(cascade.left).toBe(-LIGHTING.shadowRadius);
  // Stage 5 widened it so a tree twenty-five metres away still sits on the
  // ground. The budget allows one 2048 map, and the texel it buys has to stay
  // finer than the rider's own contact shadow.
  expect(cascade.mapSize).toBe(2048);
  expect(LIGHTING.shadowRadius).toBeGreaterThanOrEqual(24);
  expect((2 * LIGHTING.shadowRadius) / cascade.mapSize).toBeLessThan(0.05);
});

test('the buildings wear storeys, and nothing grows out of a wall', async ({ page }) => {
  await boot(page);

  // From the owner's ride on 2026-08-03: foliage intersecting a building, and
  // blocks with no windows. Both are checked headlessly against the plan; what
  // only a browser can say is that the renderer actually built two facades and
  // that the glazing survives into the geometry it draws.
  const facades = await page.evaluate(() => {
    const out: { name: string; vertices: number; glazed: number }[] = [];
    window.game.renderer.scene.traverse((object) => {
      if (!object.name.startsWith('level-props-building')) return;
      const mesh = object as unknown as {
        geometry: { attributes: { color?: { count: number; getX(i: number): number } } };
      };
      const colour = mesh.geometry.attributes.color;
      if (colour === undefined) return;
      let glazed = 0;
      for (let index = 0; index < colour.count; index += 1) {
        if (colour.getX(index) < 1) glazed += 1;
      }
      out.push({ name: object.name, vertices: colour.count, glazed });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

  const bodies = facades.filter((part) => part.name !== 'level-props-buildingCap');
  expect(bodies.length).toBe(2);
  for (const part of bodies) {
    expect(part.glazed).toBeGreaterThan(0);
    expect(part.glazed).toBeLessThan(part.vertices);
  }
  // The tall pattern carries more bands than the low one, which is the whole
  // reason there are two of them.
  const tall = bodies.find((part) => part.name === 'level-props-buildingTall');
  const low = bodies.find((part) => part.name === 'level-props-buildingBody');
  expect(tall!.vertices).toBeGreaterThan(low!.vertices);
});

test('the crowned boulevard really does fall to its gutters', async ({ page }) => {
  await boot(page);

  // The cross section is authored in the level and read by the sampler the
  // controller uses, so this is the ground the rider is actually on rather than
  // a mesh that looks like it.
  const centre = await spotOn(page, 'boulevard-north', 31, 0);
  const gutter = await spotOn(page, 'boulevard-north', 31, -8);
  const other = await spotOn(page, 'boulevard-north', 31, 8);

  const heights = await page.evaluate(([a, b, c]) => [a, b, c].map(
    (point) => window.qa.groundAt(point.x, point.z).height,
  ), [centre, gutter, other] as const);

  expect(heights[0]).toBeGreaterThan(heights[1]);
  expect(heights[0]).toBeGreaterThan(heights[2]);
  expect(Math.abs(heights[1] - heights[2])).toBeLessThan(0.02);
});

test('the berm banks into its own corner', async ({ page }) => {
  await boot(page);

  const inside = await spotOn(page, 'berm', 17, 4);
  const outside = await spotOn(page, 'berm', 17, -4);
  const banked = await page.evaluate(([a, b]) => ({
    inside: window.qa.groundAt(a.x, a.z),
    outside: window.qa.groundAt(b.x, b.z),
  }), [inside, outside] as const);

  // A left-hander's outside is the rider's right, which is negative t — so the
  // bank has to be higher there, and the surface normal has to say so too.
  expect(banked.outside.height).toBeGreaterThan(banked.inside.height + 0.8);
  expect(Math.abs(banked.outside.normal.x) + Math.abs(banked.outside.normal.z))
    .toBeGreaterThan(0.1);
});

test('the ford gives a rider a wooden deck and a way back onto it', async ({ page }) => {
  await boot(page);

  const deck = await spotOn(page, 'ford-in', 15, 0);
  const surfaces = await page.evaluate(([point]) => {
    const on = window.qa.groundAt(point.x, point.z);
    // Two metres to the side is off the deck and in the ford.
    const beside = window.qa.groundAt(
      point.x + Math.cos(point.headingY) * 4.4,
      point.z - Math.sin(point.headingY) * 4.4,
    );
    return { on, beside };
  }, [deck] as const);

  expect(surfaces.on.surface).toBe('wood');
  expect(surfaces.beside.surface).toBe('dirt');
  const step = surfaces.on.height - surfaces.beside.height;
  expect(step).toBeGreaterThan(STEP_UP);
  expect(step).toBeLessThan(HOP_HEIGHT * (1 + EUC.hopChargeHeightBonus));
});
