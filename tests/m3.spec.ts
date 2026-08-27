/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { PROVING_GROUND, boot as bootGame, collectErrors, disableMaxSpeedCutout } from './harness.ts';
import { CAMERA, RIDER, RIDER_BLOCKOUT, SIMULATION } from '../src/data/tuning.ts';

/**
 * M3 — the chase camera and the rider's reaction to it.
 *
 * The camera's own arithmetic is proven headlessly in
 * `src/render/chaseCamera.test.ts`, and the head's smoothing in
 * `src/simulation/EucController.test.ts`. Repeating either here would be
 * slower and no truer.
 *
 * What only a browser can prove is the half those files deliberately cannot
 * touch: **which way is left**. Every scalar in the camera is expressed in the
 * same world frame as the code that produced it, so a frame error would make
 * the tests and the implementation agree and both be wrong — the exact failure
 * that cost M2 a milestone and is written up in `docs/LESSONS_LEARNED.md`. The
 * bank, the look-into-turn, and the framing are therefore all asserted in
 * screen space here, and only here.
 *
 * Everything is captured from the **chase camera**, deliberately. The
 * inspection orbit is a diagnostic; a framing is only proven readable from the
 * view the player actually rides behind.
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

test('the camera pulls back and widens with speed, and neither snaps', async ({ page }, testInfo) => {
  await boot(page);
  // Sustained top speed is the fixture, and M20 put a cutout there. See
  // `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);

  const parked = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 0 }, steps: 120 * 2 }]);
    return { camera: window.qa.cameraTransform(), euc: window.game.snapshot().euc };
  });
  await testInfo.attach('m3-standstill', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  const flying = await page.evaluate(() => {
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 13 }]);
    return { camera: window.qa.cameraTransform(), euc: window.game.snapshot().euc };
  });
  await testInfo.attach('m3-top-speed', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(parked.euc.speed).toBeLessThan(0.1);
  expect(flying.euc.speed).toBeGreaterThan(14);

  // Distance: the arm the renderer is actually using, measured from the scene
  // rather than read back out of the state that asked for it.
  expect(parked.camera.armLength).toBeCloseTo(CAMERA.distanceAtRest, 1);
  expect(flying.camera.armLength).toBeCloseTo(CAMERA.distanceAtSpeed, 1);
  expect(flying.camera.armLength - parked.camera.armLength).toBeGreaterThan(1.5);

  // Field of view: read off the projection matrix three.js is rendering with.
  expect(parked.camera.fov).toBeCloseTo(CAMERA.fovAtRest, 2);
  expect(flying.camera.fov).toBeCloseTo(CAMERA.fovAtSpeed, 2);

  // And the transition is eased rather than stepped: a tenth of a second of
  // hard braking from top speed must not visibly jump either one.
  const braking = await page.evaluate(() => {
    const before = window.qa.cameraTransform();
    window.qa.drive([{ actions: { throttle: -1 }, steps: 12 }]);
    return { before, after: window.qa.cameraTransform() };
  });
  expect(Math.abs(braking.after.state.distance - braking.before.state.distance)).toBeLessThan(0.25);
  expect(Math.abs(braking.after.fov - braking.before.fov)).toBeLessThan(0.03);
});

test('at speed the player is looking at ground they have not reached yet', async ({ page }, testInfo) => {
  await boot(page);

  const parked = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 0 }, steps: 120 * 2 }]);
    return { centre: window.qa.groundAtScreenCentre(), camera: window.qa.cameraTransform() };
  });

  const flying = await page.evaluate(() => {
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 13 }]);
    return { centre: window.qa.groundAtScreenCentre(), camera: window.qa.cameraTransform() };
  });
  await testInfo.attach('m3-look-ahead-at-speed', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // The look-ahead offset itself: nothing at a standstill, most of its ceiling
  // at top speed.
  expect(parked.camera.state.lookAhead).toBe(0);
  expect(flying.camera.state.lookAhead).toBeGreaterThan(2.9);

  // And the consequence the milestone is judged on. The point of ground in the
  // middle of the screen is a few metres ahead of a parked rider and far up
  // the road at speed, because the arm lengthens and the aim moves forward
  // together, flattening the camera.
  expect(parked.centre.hitsGround).toBe(true);
  expect(flying.centre.hitsGround).toBe(true);
  expect(parked.centre.aheadOfRider).toBeGreaterThan(3);
  expect(parked.centre.aheadOfRider).toBeLessThan(14);
  expect(flying.centre.aheadOfRider).toBeGreaterThan(parked.centre.aheadOfRider * 2);

  // The rider is still framed while that happens — terrain visibility does not
  // get to cost rider readability.
  const framing = await page.evaluate(() => window.qa.screenProbe(0.5));
  expect(framing.rider.inFront).toBe(true);
  expect(Math.abs(framing.rider.x)).toBeLessThan(0.35);
  expect(framing.rider.y).toBeLessThan(0.2);
  expect(framing.rider.y).toBeGreaterThan(-0.95);
});

test('the heading leads the camera, which catches up without overshooting', async ({ page }) => {
  await boot(page);

  const turning = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 6 }]);
    const straight = window.qa.cameraTransform();
    // Half a second of full lock, sampled finely enough to see the lag build.
    const during = window.qa.cameraTrace({ throttle: 1, steer: 1 }, 60, 6);
    // Then release and let it settle.
    const after = window.qa.cameraTrace({ throttle: 1, steer: 0 }, 180, 6);
    return { straight, during, after };
  });

  // Riding straight, the camera is behind the heading and not lagging.
  expect(Math.abs(turning.straight.yawLag)).toBeLessThan(0.01);

  // Steering right swings the heading negative, so the camera trailing it
  // leaves `heading - yaw` negative. The lag builds rather than appearing at
  // once — the heading is genuinely leading the camera.
  const lags = turning.during.map((sample) => sample.yawLag);
  expect(lags[0]).toBeLessThan(0);
  expect(lags[lags.length - 1]).toBeLessThan(lags[0]);
  // Bounded: the camera trails the rider, it does not lose them.
  expect(Math.max(...lags.map(Math.abs))).toBeLessThan(0.5);

  // And the camera never passes the heading on the way back — a follow that
  // overshoots rocks on every corner exit, which is the motion-sickness
  // failure mode this milestone is most exposed to. The lag closes
  // monotonically and never changes sign.
  const settling = turning.after.map((sample) => sample.yawLag);
  for (let i = 1; i < settling.length; i += 1) {
    expect(Math.abs(settling[i])).toBeLessThanOrEqual(Math.abs(settling[i - 1]) + 1e-9);
    expect(settling[i]).toBeLessThan(1e-6);
  }
  expect(Math.abs(settling[settling.length - 1])).toBeLessThan(0.01);
});

test('the camera banks INTO the corner, mirrored and capped, in screen space', async ({ page }, testInfo) => {
  await boot(page);

  /**
   * The pole is planted at the camera's own aim point, so it projects near the
   * centre of the screen and perspective contributes almost nothing to its
   * lean. What is left is the camera's roll.
   */
  const carve = async (steer: number): Promise<{
    tilt: number;
    bank: number;
    rollAngle: number;
  }> => page.evaluate((direction) => {
    window.qa.resetRide();
    window.qa.drive([
      { actions: { throttle: 1 }, steps: 120 * 6 },
      { actions: { throttle: 1, steer: direction }, steps: 120 * 3 },
    ]);
    const camera = window.qa.cameraTransform();
    return {
      tilt: window.qa.screenTilt(camera.target.x, camera.target.z, 0, 6).tilt,
      bank: camera.state.bank,
      rollAngle: window.game.snapshot().euc.rollAngle,
    };
  }, steer);

  const straight = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 6 }]);
    const camera = window.qa.cameraTransform();
    return {
      tilt: window.qa.screenTilt(camera.target.x, camera.target.z, 0, 6).tilt,
      bank: camera.state.bank,
    };
  });

  const right = await carve(1);
  await testInfo.attach('m3-bank-hard-right', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const left = await carve(-1);
  await testInfo.attach('m3-bank-hard-left', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // Riding straight the horizon is level.
  expect(Math.abs(straight.bank)).toBeLessThan(1e-3);
  expect(Math.abs(straight.tilt)).toBeLessThan(0.005);

  // **The whole point of this spec.** Leaning into a right-hand corner tilts
  // the camera's up axis toward the right of the screen, which makes a
  // world-vertical appear to lean the other way — exactly as it does when you
  // tilt your head. A negative tilt is therefore a bank to the rider's right,
  // and the rider is carving right.
  expect(right.rollAngle).toBeLessThan(-0.5);
  expect(left.rollAngle).toBeGreaterThan(0.5);
  expect(right.tilt).toBeLessThan(-0.01);
  expect(left.tilt).toBeGreaterThan(0.01);

  // Mirrored, to a tolerance that only the residual perspective term can use.
  expect(Math.abs(right.tilt + left.tilt)).toBeLessThan(Math.abs(right.tilt) * 0.35);
  expect(Math.abs(right.bank + left.bank)).toBeLessThan(1e-6);

  // Capped, and nowhere near enough to tip the horizon out of usefulness. An
  // uncapped bank is a motion-sickness trap, and a tilted horizon costs the
  // terrain readability that outranks speed sensation.
  expect(Math.abs(right.bank)).toBeLessThanOrEqual(CAMERA.bankMaxRadians + 1e-9);
  expect(Math.abs(right.bank)).toBeGreaterThan(0.05);
  expect(Math.abs(right.bank)).toBeLessThan(Math.abs(right.rollAngle) * 0.2);
});

test('the rider looks into the corner, mirrored, on top of the pitch stabilisation', async ({ page }, testInfo) => {
  await boot(page);

  const carve = async (steer: number): Promise<{
    headOffsetX: number;
    torsoOffsetX: number;
    neckYaw: number;
    neckPitch: number;
    riderLookYaw: number;
    pelvisYaw: number;
  }> => page.evaluate((direction) => {
    window.qa.resetRide();
    // Accelerating hard *while* turning, so the neck is carrying the fore/aft
    // stabilisation and the look-into-turn at the same time. If the two
    // compose badly this is where it shows.
    // This is the gentle hips-and-shoulders technique. The hard full-lock
    // technique deliberately keeps the torso forward and has its own M2 gate.
    window.qa.drive([{ actions: { throttle: 1, steer: direction * 0.4 }, steps: 120 }]);
    const probe = window.qa.lookProbe();
    return {
      ...probe,
      riderLookYaw: window.game.snapshot().euc.riderLookYaw,
      pelvisYaw: window.qa.rigTransform().pelvisYaw,
    };
  }, steer);

  const right = await carve(1);
  await testInfo.attach('m3-look-into-right-turn', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const left = await carve(-1);
  await testInfo.attach('m3-look-into-left-turn', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const straight = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 }]);
    return window.qa.lookProbe();
  });

  // Straight ahead the head faces the way the torso does.
  expect(Math.abs(straight.neckYaw)).toBeLessThan(1e-3);
  expect(Math.abs(straight.headOffsetX - straight.torsoOffsetX)).toBeLessThan(0.03);

  // **Screen space, because nothing else can tell left from right.** Turning
  // right, the point a metre in front of the helmet lands to the right of the
  // helmet — and further right than the chest's own facing, so it is the head
  // that turned rather than the whole rider.
  expect(right.headOffsetX).toBeGreaterThan(right.torsoOffsetX + 0.01);
  expect(left.headOffsetX).toBeLessThan(left.torsoOffsetX - 0.01);

  // Mirrored.
  expect(Math.abs(right.neckYaw + left.neckYaw)).toBeLessThan(1e-9);
  expect(Math.abs(right.pelvisYaw + left.pelvisYaw)).toBeLessThan(1e-9);
  expect(Math.abs(right.pelvisYaw)).toBeGreaterThan(0.05);
  expect(Math.abs(right.neckYaw + right.pelvisYaw)).toBeCloseTo(
    Math.abs(right.riderLookYaw),
    6,
  );

  // Composed, not replaced: the launch pose is still holding the head up off
  // the contact patch while it is turned into the corner.
  expect(right.neckPitch).toBeLessThan(-0.3);
  expect(left.neckPitch).toBeLessThan(-0.3);
  expect(Math.abs(right.neckPitch - left.neckPitch)).toBeLessThan(1e-6);
});

test('the arms react to load and lean without ever looking like handlebars', async ({ page }, testInfo) => {
  await boot(page);
  // Sustained top speed is the fixture, and M20 put a cutout there. See
  // `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);

  const poses = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 13 }]);
    const cruise = window.qa.handPose();
    window.qa.drive([{ actions: { throttle: -1 }, steps: 48 }]);
    const braking = window.qa.handPose();

    window.qa.resetRide();
    window.qa.drive([
      { actions: { throttle: 1 }, steps: 120 * 6 },
      { actions: { throttle: 1, steer: 1 }, steps: 120 * 3 },
    ]);
    const carvingRight = window.qa.handPose();

    window.qa.resetRide();
    window.qa.drive([
      { actions: { throttle: 1 }, steps: 120 * 6 },
      { actions: { throttle: 1, steer: -1 }, steps: 120 * 3 },
    ]);
    const carvingLeft = window.qa.handPose();

    return { cruise, braking, carvingRight, carvingLeft };
  });
  await testInfo.attach('m3-arm-reaction-carve', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // The static asymmetry the M2 reassessment established is still there, and
  // no reaction has flattened the arms into a mirrored pair.
  expect(poses.cruise.right.outboard).toBeGreaterThan(poses.cruise.left.outboard + 0.02);
  expect(poses.cruise.right.forward).toBeGreaterThan(poses.cruise.left.forward + 0.02);

  // Braking sends both hands forward and outward to counterbalance hips that
  // have gone behind the axle (motion reference 23).
  expect(poses.braking.left.forward).toBeGreaterThan(poses.cruise.left.forward + 0.03);
  expect(poses.braking.right.forward).toBeGreaterThan(poses.cruise.right.forward + 0.03);
  expect(poses.braking.left.outboard).toBeGreaterThan(poses.cruise.left.outboard + 0.01);

  // Carving right, the OUTSIDE (left) arm opens and lifts while the inside one
  // tucks — the asymmetric turning response, and the pose in the owner's own
  // action photographs.
  expect(poses.carvingRight.left.outboard).toBeGreaterThan(poses.cruise.left.outboard + 0.03);
  expect(poses.carvingRight.left.height).toBeGreaterThan(poses.cruise.left.height + 0.02);
  expect(poses.carvingRight.right.outboard).toBeLessThan(poses.cruise.right.outboard - 0.01);

  // And it mirrors: a left carve opens the right arm by the same amount the
  // right carve opened the left one.
  //
  // **Stated as a proportion of the opening since 2026-08-23, and that is a
  // re-derivation rather than a loosened bound.** The absolute 0.005 was sized
  // when the outside arm had one splay channel — the ordinary carve reaction —
  // because M23's `carveStanceOutsideSplay` was reaching the cop and not the
  // player: `Game.renderSeat` interpolated the player's pose by hand and never
  // wrote `carveStance`. With the stance drawn, the opening roughly doubles
  // (the M23 term alone is `carveStanceOutsideSplay`), and the two arms are
  // deliberately asymmetric at rest, so an identical offset resolves through
  // each arm's own solve to a slightly different hand. The mirror claim is
  // about the *reaction*, so bound the mismatch by the reaction's own size: a
  // tenth is tighter in proportion than the old absolute bound ever was
  // (0.005 of a 0.032 opening was 16%; the measured mismatch here is 8%).
  expect(poses.carvingLeft.right.outboard).toBeGreaterThan(poses.cruise.right.outboard + 0.03);
  const openedLeft = poses.carvingRight.left.outboard - poses.cruise.left.outboard;
  const openedRight = poses.carvingLeft.right.outboard - poses.cruise.right.outboard;
  expect(Math.abs(openedLeft - openedRight)).toBeLessThan(
    Math.min(openedLeft, openedRight) * 0.10,
  );

  // **Never handlebar-like.** Hands stay low and stay out: they never rise
  // toward the chest and never converge toward the centreline, which is what
  // the two halves of a handlebar pose actually look like.
  for (const pose of [poses.cruise, poses.braking, poses.carvingRight, poses.carvingLeft]) {
    for (const hand of [pose.left, pose.right]) {
      expect(hand.outboard).toBeGreaterThan(RIDER_BLOCKOUT.shoulderHalfWidth);
      expect(hand.forward).toBeLessThan(0.25);
    }
    expect(pose.leftWorldY).toBeLessThan(RIDER.hipHeight + 0.2);
    expect(pose.rightWorldY).toBeLessThan(RIDER.hipHeight + 0.2);
  }
});

test('an obstruction pulls the camera in fast and gives it back slowly', async ({ page }, testInfo) => {
  await boot(page);

  const pull = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.setOcclusion(null);
    window.qa.drive([{ actions: { throttle: 0.5 }, steps: 120 * 6 }]);
    const clear = window.qa.cameraTransform();

    // Something solid 2.4 m along the arm. The QA bridge scripts the probe the
    // same way it scripts input — the real code path, not a parallel one — and
    // the general probe is covered headlessly with a test double.
    window.qa.setOcclusion(2.4);
    window.qa.drive([{ actions: { throttle: 0.5 }, steps: 24 }]);
    const pulled = window.qa.cameraTransform();

    window.qa.setOcclusion(null);
    window.qa.drive([{ actions: { throttle: 0.5 }, steps: 24 }]);
    const restoring = window.qa.cameraTransform();
    window.qa.drive([{ actions: { throttle: 0.5 }, steps: 120 * 3 }]);
    const restored = window.qa.cameraTransform();

    return { clear, pulled, restoring, restored };
  });
  await testInfo.attach('m3-obstruction-pulled-in', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // In: a fifth of a second is essentially all of it, and the camera stops
  // short of the obstruction rather than touching it.
  expect(pull.clear.armLength).toBeGreaterThan(4);
  expect(pull.pulled.armLength).toBeLessThan(2.4 - CAMERA.obstructionRadius + 0.1);
  expect(pull.pulled.armLength).toBeGreaterThanOrEqual(CAMERA.obstructionMinDistance - 0.01);

  // Out: the same fifth of a second recovers only a fraction. Symmetric rates
  // would snap the camera outward past every pillar the rider passes.
  const gap = pull.clear.armLength - pull.pulled.armLength;
  const recovered = (pull.restoring.armLength - pull.pulled.armLength) / gap;
  expect(recovered).toBeGreaterThan(0.02);
  expect(recovered).toBeLessThan(0.5);
  // Fully restored means back on the speed-eased arm — compared against the
  // camera's own current target rather than against the length it had before
  // the obstruction, because the rider kept accelerating throughout.
  expect(pull.restored.armLength).toBeCloseTo(pull.restored.state.distance, 1);

  // The camera slid along the arm rather than dropping, so the pull-in is not
  // a sudden looking-down-at-the-rider shot.
  expect(pull.pulled.position.y).toBeLessThan(pull.clear.position.y);
  expect(pull.pulled.position.y).toBeGreaterThan(RIDER.hipHeight);
});

test('open ground never occludes the camera, so the real probe is quiet', async ({ page }) => {
  await boot(page);

  // The other half of the obstruction claim, and the one that uses the real
  // level probe rather than a scripted one: ground the camera is above must
  // never pull it in, at any speed or lean.
  //
  // **Rewritten at M4, because the world stopped being a flat plane.** The M3
  // version rode straight from the spawn, which the proving ground now sends
  // through a gateway; and a gateway is exactly the geometry the pull-in is
  // supposed to fire against, so that ride would have proved the opposite of
  // what it claims. The manoeuvre below is a hard low-speed carve that circles
  // inside the open half of the plaza — nothing within the camera's reach
  // stands higher than the probe's own line, which is where the claim belongs.
  const trace = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.setOcclusion(null);
    return window.qa.cameraTrace({ throttle: 0.35, steer: 1 }, 120 * 12, 60);
  });

  expect(trace.length).toBeGreaterThan(10);
  for (const sample of trace) {
    expect(sample.armDistance).toBeGreaterThan(CAMERA.distanceAtRest - 0.01);
  }
  const snapshot = await page.evaluate(() => window.game.snapshot());
  expect(snapshot.camera.scriptedOcclusion).toBe(false);
});

test('the chase camera survives a resize and a restart without growing resources', async ({ page }) => {
  await boot(page);

  const before = await page.evaluate(() => {
    window.qa.resetRide();
    // A hard low-speed turn can now bank far enough to activate the already
    // allocated spark field. renderer.info counts that hidden geometry only
    // after first render, so warm it before calling first visibility growth.
    window.qa.drive([
      { actions: { throttle: 1, steer: 1 }, steps: 240 },
      { actions: { throttle: -1, steer: 0 }, steps: 120 },
    ]);
    window.qa.resetRide();
    window.game.advance(60);
    return window.game.resources();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  // A synthetic frame deliberately skips `beforeFrame`, which is where the
  // viewport is polled, so the resize has to be observed on a real frame.
  await page.waitForFunction(() => window.game.snapshot().viewport.width === 390);
  const portrait = await page.evaluate(() => {
    window.game.advance(60);
    return { camera: window.qa.cameraTransform(), viewport: window.game.snapshot().viewport };
  });
  expect(portrait.viewport.width).toBe(390);
  // A tall viewport must not move the camera: the field of view is vertical,
  // so the projection changes and the transform does not.
  expect(portrait.camera.armLength).toBeCloseTo(CAMERA.distanceAtRest, 1);

  await page.setViewportSize({ width: 1000, height: 700 });

  const trace = await page.evaluate(() => {
    const samples = [];
    for (let round = 0; round < 5; round += 1) {
      window.qa.drive([
        { actions: { throttle: 1, steer: round % 2 === 0 ? 1 : -1 }, steps: 240 },
        { actions: { throttle: -1, steer: 0 }, steps: 120 },
      ]);
      window.qa.setOcclusion(round % 2 === 0 ? 2.0 : null);
      window.game.advance(60);
      window.qa.setOcclusion(null);
      window.qa.resetRide();
      samples.push(window.game.resources());
    }
    return samples;
  });

  for (const sample of trace) {
    expect(sample.geometries).toBe(before.geometries);
    expect(sample.textures).toBe(before.textures);
    expect(sample.programs).toBe(before.programs);
    expect(sample.sceneObjects).toBe(before.sceneObjects);
  }
});

test('a full camera ride produces no console errors', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page, 'debug=1');

  // Every camera behaviour the milestone owns, driven from real keys.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyC');
  await page.keyboard.press('KeyR');

  const captured = await page.evaluate(() => {
    // Frozen before the capture, so the picture shows the state the test names
    // rather than whatever the loop reached during the round trip.
    window.qa.resetRide();
    window.qa.drive([
      { actions: { throttle: 1 }, steps: 120 * 8 },
      { actions: { throttle: 1, steer: 1 }, steps: 120 * 2 },
    ]);
    return { snapshot: window.game.snapshot(), camera: window.qa.cameraTransform() };
  });
  await testInfo.attach('m3-carving-at-speed', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(captured.snapshot.camera.mode).toBe('chase');
  expect(captured.snapshot.euc.speed).toBeGreaterThan(10);
  expect(captured.camera.state.bank).toBeGreaterThan(0.05);
  expect(captured.camera.state.lookAhead).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('a camera constant changed through F4 reaches the running camera', async ({ page }) => {
  await boot(page, 'panel=1');
  // Sustained top speed is the fixture, and M20 put a cutout there. See
  // `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);

  const stock = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 13 }]);
    return window.qa.cameraTransform();
  });
  expect(stock.armLength).toBeCloseTo(CAMERA.distanceAtSpeed, 1);

  // Through the visible control, not through the store.
  const row = page.locator('.euc-tunable[data-path="CAMERA.distanceAtSpeed"]');
  await expect(row).toBeVisible();
  await row.locator('input[type="range"]').evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = '9';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Each reading starts from the spawn and rides the same distance down the
  // same pavement. Continuing from where the previous one stopped would leave
  // the rider on a different surface at a different speed, and the arm length
  // under test is a function of both.
  const stretched = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 13 }]);
    return window.qa.cameraTransform();
  });
  expect(stretched.armLength).toBeGreaterThan(stock.armLength + 2);

  await row.locator('.euc-revert').click();
  const restored = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 13 }]);
    return window.qa.cameraTransform();
  });
  expect(restored.armLength).toBeCloseTo(stock.armLength, 1);
});

test('the inspection orbit stays available as a diagnostic and holds a fixed field of view', async ({ page }, testInfo) => {
  await boot(page);
  // Sustained top speed is the fixture, and M20 put a cutout there. See
  // `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);

  const views = await page.evaluate((steps) => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps }]);
    const chase = window.qa.cameraTransform();
    window.qa.drive([{ actions: { cameraCycle: true, throttle: 1 }, steps: 1 }]);
    window.game.advance(60);
    const orbit = window.qa.cameraTransform();
    return { chase, orbit };
  }, STEPS(13));
  await testInfo.attach('m3-inspection-orbit', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(views.chase.mode).toBe('chase');
  expect(views.orbit.mode).toBe('orbit');
  // The diagnostic holds the resting field of view whatever the rider is
  // doing, so an inspection capture does not depend on how fast they happened
  // to be going. The chase camera at the same moment is at speed.
  expect(views.chase.fov).toBeCloseTo(CAMERA.fovAtSpeed, 2);
  expect(views.orbit.fov).toBeCloseTo(CAMERA.fovAtRest, 2);
  expect(views.orbit.distanceToRider).toBeLessThan(5);
});
