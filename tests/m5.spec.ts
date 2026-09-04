/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { PROVING_GROUND, boot as bootGame, collectErrors } from './harness.ts';
import { EUC, PHYSICS, SIMULATION, WHEEL } from '../src/data/tuning.ts';

/**
 * M5 — hop, air, landing, and pedal strike.
 *
 * The headless suite already proves the *models*: the compression dwell, the
 * ballistic apex and its air time, the charge bonus arriving as a height rather
 * than as a velocity, the frozen travel direction, the quarter-authority air
 * yaw, the three-input landing score and the order of its tiers, the derived
 * pedal clearance and the grip that decides who reaches it, and that flat
 * pavement still reduces to the ride the owner accepted at M2. All of that is
 * in `src/simulation/` and `src/render/chaseCamera.ts` with no browser at all,
 * which is what architecture invariant 1 is for. Repeating it here would be
 * slower and no truer.
 *
 * What only a browser can prove is that any of it reaches the screen:
 *
 *   - the rig actually leaves the ground, at the height the model says;
 *   - the rider visibly compresses before it does;
 *   - the camera keeps the rider in frame instead of following the hop, and
 *     eases back afterwards rather than snapping;
 *   - a scraping pedal throws sparks and lifts the boot on the correct side —
 *     the side, checked in the rider's own frame, being the only claim a
 *     world-space assertion could agree with while being wrong;
 *   - a landing throws the surface's own particles and nothing on pavement;
 *   - and a long ride full of hops leaves no console errors, no resource
 *     growth, and a draw-call count still inside the budget.
 *
 * Nothing here asserts a frame time. See `playwright.config.ts`.
 */

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

const STEPS = (seconds: number): number => Math.round(seconds * SIMULATION.hz);

/** The apex a hop should reach, from its own launch speed. v²/2g. */
const HOP_APEX = EUC.hopLaunchSpeed ** 2 / (2 * PHYSICS.gravity);
/** And its air time. 2v/g — the number the player actually perceives. */
const HOP_AIR_TIME = (2 * EUC.hopLaunchSpeed) / PHYSICS.gravity;
/** Derived, not written down: where a pedal reaches the ground. */
const PEDAL_CLEARANCE = Math.atan2(WHEEL.pedalHeight, WHEEL.pedalSpan / 2);

/**
 * Where a beat starts, read out of the plan rather than hard-coded.
 *
 * Same helper as `tests/m4.spec.ts`, and for the same reason: every spec here
 * is about a mechanism, and hard-coding the place would turn each of them into
 * a second test of the route's exact dimensions.
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

// ---------------------------------------------------------------------------
// The hop, on screen
// ---------------------------------------------------------------------------

test('the rig leaves the ground, reaches the modelled apex, and comes back', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.resetRide());

  const groundY = await page.evaluate(() => {
    const rig = window.game.renderer.scene.getObjectByName('riding-rig');
    return rig ? rig.position.y : Number.NaN;
  });

  const flight = await page.evaluate(
    ([steps]) => {
      window.qa.freeze();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      return window.qa.hopTrace({ throttle: 1 }, 0, 400);
    },
    [STEPS(4)] as const,
  );

  expect(flight.hops).toBe(1);
  expect(flight.landed).toBe(true);
  expect(flight.compressSteps).toBeGreaterThan(1);

  // The rig itself rose — not just a number in the controller. This is the
  // assertion the whole milestone hangs on being visible at all.
  expect(flight.rigApexY - groundY).toBeGreaterThan(HOP_APEX * 0.9);
  expect(flight.rigApexY - groundY).toBeLessThan(HOP_APEX * 1.1);
  expect(flight.apex).toBeGreaterThan(HOP_APEX * 0.9);

  // And the air time, which is what a rider judges a hop by.
  const airTime = flight.airSteps / SIMULATION.hz;
  expect(airTime).toBeGreaterThan(HOP_AIR_TIME * 0.85);
  expect(airTime).toBeLessThan(HOP_AIR_TIME * 1.15);
});

test('the rider visibly compresses before the wheel leaves the ground', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.resetRide());

  // Read at the deepest point of the compression, from the rig, which is
  // where a player sees it. `EUC_RIDER_MOTION_REFERENCE.md` §12.1: "knees bend
  // deeply, hips lower, torso compresses".
  const pose = await page.evaluate(
    ([steps]) => {
      window.qa.freeze();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));

      const scene = window.game.renderer.scene;
      const pelvis = scene.getObjectByName('rider-pelvis');
      const leftKnee = scene.getObjectByName('rider-knee-left');
      const blockout = scene.getObjectByName('rider-blockout');
      const leftAnkle = scene.getObjectByName('rider-ankle-left');
      if (!pelvis || !leftKnee || !blockout || !leftAnkle) throw new Error('no rider');

      const kneeBend = (): number => {
        scene.updateMatrixWorld(true);
        const knee = blockout.worldToLocal(leftKnee.getWorldPosition(leftKnee.position.clone()));
        const ankle = blockout.worldToLocal(leftAnkle.getWorldPosition(leftAnkle.position.clone()));
        // How far the knee stands proud of the ankle, fore-aft. A bent knee
        // drives forward; a straight one sits over the boot.
        return knee.z - ankle.z;
      };

      const riding = { hip: pelvis.position.y, knee: kneeBend() };

      window.game.setActions({ hop: true });
      let deepest = riding.hip;
      let deepestKnee = riding.knee;
      let steps2 = 0;
      while (steps2 < 60 && window.game.snapshot().euc.grounded) {
        window.game.advance(1);
        steps2 += 1;
        deepest = Math.min(deepest, pelvis.position.y);
        deepestKnee = Math.max(deepestKnee, kneeBend());
      }
      return {
        ridingHip: riding.hip,
        compressedHip: deepest,
        ridingKnee: riding.knee,
        compressedKnee: deepestKnee,
        airborne: !window.game.snapshot().euc.grounded,
      };
    },
    [STEPS(4)] as const,
  );

  expect(pose.airborne).toBe(true);
  // Hips lower by a real amount, not by a rounding error.
  expect(pose.ridingHip - pose.compressedHip).toBeGreaterThan(0.05);
  // And the knees take it, rather than the figure sinking rigidly.
  expect(pose.compressedKnee).toBeGreaterThan(pose.ridingKnee + 0.02);
});

test('a charged hop is visibly higher than an uncharged one', async ({ page }) => {
  await boot(page);

  const plain = await page.evaluate(
    ([steps]) => {
      window.qa.resetRide();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      return window.qa.hopTrace({ throttle: 1 }, 0, 400);
    },
    [STEPS(4)] as const,
  );

  const charged = await page.evaluate(
    ([steps, charge]) => {
      window.qa.resetRide();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      return window.qa.hopTrace({ throttle: 1 }, Number(charge), 400);
    },
    [STEPS(4), STEPS(EUC.hopChargeSeconds + 0.1)] as const,
  );

  expect(charged.apex).toBeGreaterThan(plain.apex * 1.3);
  expect(charged.hops).toBe(1);
  // Both must have been claimed exactly once, however long the key was down.
  expect(plain.hops).toBe(1);
});

test('a Space press just before touchdown is buffered into the next hop', async ({ page }) => {
  await boot(page);

  await page.evaluate(
    ([steps]) => {
      window.qa.resetRide();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      window.game.setActions({ hop: true });
      window.game.advance(1);
      window.game.setActions({ hop: false });

      // Stop within a few fixed steps of touchdown. The press below is early
      // enough to be illegal now and late enough to remain inside the 0.15 s
      // action buffer when the wheel can hop again.
      for (let i = 0; i < 400; i += 1) {
        window.game.advance(1);
        const euc = window.game.snapshot().euc;
        if (!euc.grounded && euc.verticalVelocity < 0 && euc.airHeight < 0.04) return;
      }
      throw new Error('the first hop never reached its final descent');
    },
    [STEPS(4)] as const,
  );

  // Real device input, not a direct controller flag. This exercises the
  // keyboard latch, the composition root's legality check, and the controller.
  await page.keyboard.press('Space');

  const buffered = await page.evaluate(() => {
    const before = window.game.snapshot();
    let becameAirborneAgain = false;
    for (let i = 0; i < 40; i += 1) {
      window.game.advance(1);
      const snapshot = window.game.snapshot();
      if (snapshot.euc.hops >= 2 && !snapshot.euc.grounded) becameAirborneAgain = true;
    }
    const after = window.game.snapshot();
    return {
      hopsBefore: before.euc.hops,
      hopsAfter: after.euc.hops,
      consumedBefore: before.consumed.hop,
      consumedAfter: after.consumed.hop,
      becameAirborneAgain,
    };
  });

  expect(buffered.hopsBefore).toBe(1);
  expect(buffered.hopsAfter).toBe(2);
  expect(buffered.consumedAfter - buffered.consumedBefore).toBe(1);
  expect(buffered.becameAirborneAgain).toBe(true);
});

// ---------------------------------------------------------------------------
// The camera in the air
// ---------------------------------------------------------------------------

test('the camera keeps the rider framed instead of following the hop', async ({ page }) => {
  await boot(page);

  const framing = await page.evaluate(
    ([steps]) => {
      window.qa.resetRide();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));

      const camera = window.game.renderer.camera;
      const groundedCameraY = camera.position.y;

      // Freeze at the apex, which is the only way a capture of a transient
      // means anything, then read where the camera and the rider ended up.
      const atApex = window.qa.freezeMidHop({ throttle: 1 }, 1);
      const rig = window.game.renderer.scene.getObjectByName('riding-rig');
      return {
        riderRise: rig ? rig.position.y : Number.NaN,
        cameraRise: camera.position.y - groundedCameraY,
        heightLag: atApex.camera.heightLag,
        airborne: !atApex.euc.grounded,
      };
    },
    [STEPS(4)] as const,
  );

  expect(framing.airborne).toBe(true);
  expect(framing.riderRise).toBeGreaterThan(0.2);
  // The camera takes part of the rise, not all of it and not none of it.
  expect(framing.cameraRise).toBeGreaterThan(0);
  expect(framing.cameraRise).toBeLessThan(framing.riderRise);
  expect(framing.heightLag).toBeGreaterThan(0.05);
});

test('the camera dips on landing and recovers without oscillating', async ({ page }) => {
  await boot(page);

  const dip = await page.evaluate(
    ([steps]) => {
      window.qa.resetRide();
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      const flight = window.qa.hopTrace({ throttle: 1 }, 0, 400);

      // Sample the dip every step for a second after touchdown.
      const trace: number[] = [window.game.snapshot().camera.dip];
      for (let i = 0; i < 120; i += 1) {
        window.game.advance(1);
        trace.push(window.game.snapshot().camera.dip);
      }
      return { atLanding: flight.cameraDipAfterLanding, trace };
    },
    [STEPS(4)] as const,
  );

  expect(dip.atLanding).toBeGreaterThan(0);
  // Monotone down. A dip that goes back up is shake, which this project does
  // not ship until the M9 attenuation slider exists to turn it down.
  for (let i = 1; i < dip.trace.length; i += 1) {
    expect(dip.trace[i]).toBeLessThanOrEqual(dip.trace[i - 1] + 1e-9);
  }
  expect(dip.trace[dip.trace.length - 1]).toBeLessThan(0.01);
});

// ---------------------------------------------------------------------------
// The kerb — the exit question's own geometry
// ---------------------------------------------------------------------------

test('the boulevard kerb costs speed unhopped and nothing hopped', async ({ page }) => {
  await boot(page);

  // Approach the 0.15 m kerb across the road, so the transition is a step
  // rather than a ride along the top of it.
  const start = await beat(page, 'boulevard', 43, 2);
  const crossing = start.headingY - Math.PI / 2;

  const cost = await page.evaluate(
    ([x, z, heading]) => {
      const measure = (hopAt: number | null): {
        mountedCost: number;
        reachedTop: boolean;
        hops: number;
      } => {
        window.qa.placeRider(Number(x), Number(z), Number(heading));
        window.game.setActions({ throttle: 1 });
        let previous = 0;
        let mountedCost = Number.NaN;
        let reachedTop = false;
        for (let i = 0; i < 600; i += 1) {
          if (hopAt !== null && i === hopAt) window.game.setActions({ hop: true });
          previous = window.game.snapshot().euc.speed;
          window.game.advance(1);
          if (hopAt !== null && i === hopAt) window.game.setActions({ hop: false });
          const snapshot = window.game.snapshot();
          if (!reachedTop && snapshot.euc.position.y > 0.1) {
            reachedTop = true;
            mountedCost = previous - snapshot.euc.speed;
          }
        }
        return { mountedCost, reachedTop, hops: window.game.snapshot().euc.hops };
      };
      return { unhopped: measure(null), hopped: measure(40) };
    },
    [start.x, start.z, crossing] as const,
  );

  expect(cost.unhopped.reachedTop).toBe(true);
  expect(cost.hopped.reachedTop).toBe(true);
  expect(cost.hopped.hops).toBe(1);

  // Rolling on to it is a real, felt cost — `TERRAIN.curbImpactPerMetre` says
  // about 3 m/s for a 0.15 m step.
  expect(cost.unhopped.mountedCost).toBeGreaterThan(1.5);
  // And clearing it costs nothing at all, which is the whole proposition the
  // exit question is asking about.
  expect(cost.hopped.mountedCost).toBeLessThan(0.2);
});

test('riding off the kerb launches the wheel rather than snapping it down', async ({ page }) => {
  await boot(page);
  const start = await beat(page, 'boulevard', 20, -7);

  const drop = await page.evaluate(
    ([x, z, heading]) => {
      // On the kerb, riding along it and then off the far end of it.
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      window.game.setActions({ throttle: 1 });
      let airSteps = 0;
      let maxAir = 0;
      const landingsBefore = window.game.snapshot().euc.landings;
      for (let i = 0; i < 1200; i += 1) {
        window.game.advance(1);
        const snapshot = window.game.snapshot();
        if (!snapshot.euc.grounded) {
          airSteps += 1;
          maxAir = Math.max(maxAir, snapshot.euc.airHeight);
        }
      }
      const after = window.game.snapshot();
      return {
        startedOnKerb: Number(z) !== 0,
        airSteps,
        maxAir,
        landings: after.euc.landings - landingsBefore,
        hops: after.euc.hops,
      };
    },
    [start.x, start.z, start.headingY] as const,
  );

  // No hop was pressed: the air came from the ledge alone.
  expect(drop.hops).toBe(0);
  expect(drop.airSteps).toBeGreaterThan(5);
  expect(drop.landings).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// Pedal strike
// ---------------------------------------------------------------------------

test('a full-lock carve on pavement scrapes, throws sparks, and lifts that boot', async ({ page }) => {
  await boot(page);

  const start = await beat(page, 'pad', 20, 0);
  const scrape = await page.evaluate(
    ([x, z, heading, warmup, hold]) => {
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      // Steering RIGHT. In this world the rider's right is -X and a right turn
      // is a negative yaw, so the wheel leans toward -X and the pedal that
      // reaches the ground is the right one.
      return window.qa.scrapeTrace(1, Number(warmup), Number(hold));
    },
    // **Short since M16, and shorter since M30 Phase 4 — the reason is geometry
    // rather than impatience.** A full-lock carve's radius is
    // `speed² / lateralCeiling`, and the shipped 65 mph wheel rides that carve
    // at 27.04 m/s around a **71 m** radius (`docs/PLANS.md` §30.7's measured
    // table; M16's 22.3 m/s wheel drew 67.5 m). The pad is 80 m wide, so the
    // eight-second warm-up this test used to take, followed by four seconds of
    // lock, rides the rider off the side of it and onto grass, where the lower
    // grip caps the lean *below* pedal clearance and nothing scrapes. That is a
    // real property of the game and it has its own test below; it is not what
    // this one is about. Phase 4 therefore cut the run-up to one and a half
    // seconds: it reaches about 10 m/s, which is well past the ~4.3 m/s where
    // full lock starts pegging the lean at the grip limit, and the circle it
    // draws stays on the pavement.
    [start.x, start.z, start.headingY, STEPS(1.5), STEPS(1.25)] as const,
  );

  // Exactly the pedal geometry: the clearance angle is derived from where the
  // pedals are and nothing else. The suspension is deliberately not in it —
  // see the note in `EucController.updatePedalStrike` for why it was taken
  // out again after being built.
  expect(Math.abs(scrape.pedalClearance)).toBeCloseTo(PEDAL_CLEARANCE, 9);
  expect(Math.abs(scrape.rollAngle)).toBeGreaterThan(scrape.pedalClearance);
  expect(scrape.pedalStrike).toBeLessThan(0);
  expect(scrape.state).toBe('pedalStrike');
  // Sparks are alive, which is the only proof the effect reached the scene.
  expect(scrape.sparks).toBeGreaterThan(0);

  // **The side, checked in the rider's own frame.** A world-space assertion
  // about which boot rose would agree with a wrong frame; measuring both
  // ankles inside the rider root removes the heading and the wheel's lean from
  // the reading. A right-hand carve lifts the right boot.
  expect(scrape.rightAnkleY).toBeGreaterThan(scrape.leftAnkleY);
});

test('grass never reaches pedal clearance, because its grip caps the lean first', async ({ page }) => {
  await boot(page);

  // The pad's own open grass, so this is the level's grass rather than an
  // invented fixture. Stay well outside the plaza props: the previous 44 m
  // line reached a stone block during this eighteen-second run, which only
  // became visible once a riding-speed obstacle impact correctly caused a
  // crash instead of harmless wall scrub.
  const start = await beat(page, 'pad', 40, 70);
  const surface = await page.evaluate(
    ([x, z]) => window.qa.groundAt(Number(x), Number(z)).surface,
    [start.x, start.z] as const,
  );
  expect(surface).toBe('grass');

  const scrape = await page.evaluate(
    ([x, z, heading, warmup, hold]) => {
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      return window.qa.scrapeTrace(1, Number(warmup), Number(hold));
    },
    [start.x, start.z, start.headingY, STEPS(14), STEPS(4)] as const,
  );

  expect(Math.abs(scrape.rollAngle)).toBeGreaterThan(0.25);
  expect(Math.abs(scrape.rollAngle)).toBeLessThan(scrape.pedalClearance);
  expect(scrape.pedalStrike).toBe(0);
  expect(scrape.sparks).toBe(0);
  expect(scrape.state).toBe('rolling');
});

// ---------------------------------------------------------------------------
// Landing particles
// ---------------------------------------------------------------------------

test('a landing throws the surface its own particles, and pavement throws none', async ({ page }) => {
  await boot(page);

  const pavement = await beat(page, 'pad', 20, 0);
  const onPavement = await page.evaluate(
    ([x, z, heading, steps]) => {
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      const flight = window.qa.hopTrace({ throttle: 1 }, 0, 400);
      return { surface: window.game.snapshot().euc.surface, dust: flight.dustAfterLanding };
    },
    [pavement.x, pavement.z, pavement.headingY, STEPS(3)] as const,
  );

  expect(onPavement.surface).toBe('pavement');
  // `data/surfaces.ts` says pavement's particle is `none`, and none means none.
  expect(onPavement.dust).toBe(0);

  const grass = await beat(page, 'pad', 40, 44);
  const onGrass = await page.evaluate(
    ([x, z, heading, steps]) => {
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      window.game.setActions({ throttle: 1 });
      window.game.advance(Number(steps));
      const flight = window.qa.hopTrace({ throttle: 1 }, 0, 400);
      return { surface: window.game.snapshot().euc.surface, dust: flight.dustAfterLanding };
    },
    [grass.x, grass.z, grass.headingY, STEPS(4)] as const,
  );

  expect(onGrass.surface).toBe('grass');
  expect(onGrass.dust).toBeGreaterThan(0);
});

test('a reset clears every particle in the air', async ({ page }) => {
  await boot(page);
  const start = await beat(page, 'pad', 20, 0);

  const counts = await page.evaluate(
    ([x, z, heading, warmup, hold]) => {
      window.qa.placeRider(Number(x), Number(z), Number(heading));
      window.qa.scrapeTrace(1, Number(warmup), Number(hold));
      const scraping = window.game.snapshot().particles;
      window.qa.resetRide();
      return { scraping, afterReset: window.game.snapshot().particles };
    },
    // **One and a half seconds since M30 Phase 4**, matching the sparks spec
    // above and for the identical reason, one top speed later: an eight-second
    // warm-up at 65 mph rides straight off the 80 m pad and onto the grass,
    // where the lower grip caps the lean below pedal clearance and nothing
    // scrapes at all. The note on that spec has the arithmetic.
    [start.x, start.z, start.headingY, STEPS(1.5), STEPS(1.25)] as const,
  );

  expect(counts.scraping.sparks).toBeGreaterThan(0);
  expect(counts.afterReset.sparks).toBe(0);
  expect(counts.afterReset.dust).toBe(0);
});

// ---------------------------------------------------------------------------
// Determinism, budget, and silence
// ---------------------------------------------------------------------------

test('the same hop reaches the same particle field twice', async ({ page }) => {
  // `DESIGN.md` §4 rule 3, applied to the effects M5 adds: the field is spent
  // through a hash of a spawn counter rather than through `Math.random`, so a
  // frozen capture of a landing means something.
  await boot(page);
  const start = await beat(page, 'pad', 20, 0);

  const runs = await page.evaluate(
    ([x, z, heading, warmup, hold]) => {
      const once = (): { sparks: number; positions: number[] } => {
        window.qa.placeRider(Number(x), Number(z), Number(heading));
        window.qa.scrapeTrace(1, Number(warmup), Number(hold));
        const field = window.game.renderer.scene.getObjectByName('fx-sparks') as unknown as {
          geometry: { attributes: { position: { array: Float32Array } }; drawRange: { count: number } };
        };
        const count = field.geometry.drawRange.count;
        return {
          sparks: count,
          positions: Array.from(field.geometry.attributes.position.array.slice(0, count * 3)),
        };
      };
      return [once(), once()];
    },
    // One and a half seconds since M30 Phase 4 — see the reset spec above.
    [start.x, start.z, start.headingY, STEPS(1.5), STEPS(1.25)] as const,
  );

  expect(runs[0].sparks).toBeGreaterThan(0);
  expect(runs[1].sparks).toBe(runs[0].sparks);
  expect(runs[1].positions).toEqual(runs[0].positions);
});

test('a long ride full of hops stays inside the budget and leaves nothing behind', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const trace = await page.evaluate(
    ([steps]) => {
      window.qa.resetRide();
      const resources: ReturnType<typeof window.game.resources>[] = [];
      let draws = 0;
      let triangles = 0;
      let hops = 0;
      let landings = 0;

      for (let round = 0; round < 8; round += 1) {
        window.game.setActions({ throttle: 1, steer: round % 2 === 0 ? 0.8 : -0.8 });
        window.game.advance(Number(steps));
        window.game.setActions({ hop: true });
        window.game.advance(2);
        window.game.setActions({ hop: false });
        window.game.advance(Number(steps));
        const snapshot = window.game.snapshot();
        draws = Math.max(draws, snapshot.render.drawCalls);
        triangles = Math.max(triangles, snapshot.render.triangles);
        hops = snapshot.euc.hops;
        landings = snapshot.euc.landings;
        resources.push(window.game.resources());
      }
      return { resources, draws, triangles, hops, landings };
    },
    [STEPS(2)] as const,
  );

  expect(trace.hops).toBeGreaterThanOrEqual(8);
  expect(trace.landings).toBeGreaterThanOrEqual(8);

  // The budget from `docs/PLANS.md` §9 and `DESIGN.md` §8. The two particle
  // fields are one draw each and only while something is alive.
  expect(trace.draws).toBeLessThanOrEqual(150);
  expect(trace.triangles).toBeLessThanOrEqual(400_000);

  // Pools, so nothing may grow across rounds. A particle system that allocates
  // a geometry per burst is exactly the leak invariant 10 exists to catch.
  const first = trace.resources[1];
  for (const sample of trace.resources.slice(2)) {
    expect(sample.geometries).toBe(first.geometries);
    expect(sample.textures).toBe(first.textures);
    expect(sample.sceneObjects).toBe(first.sceneObjects);
  }

  expect(errors).toEqual([]);
});
