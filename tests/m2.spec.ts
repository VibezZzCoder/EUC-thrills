/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { PROVING_GROUND, boot as bootGame, collectErrors, disableMaxSpeedCutout } from './harness.ts';
import {
  EUC,
  PHYSICS,
  RIDER,
  RIDER_BLOCKOUT,
  SIMULATION,
  WHEEL,
} from '../src/data/tuning.ts';

/**
 * M2 — the EUC controller on the ground.
 *
 * The headless suite already proves the *model*: accel curves, top speed,
 * braking distance, the reverse gate, the lateral clamp, and the state
 * machine are all checked in `src/simulation/EucController.test.ts` with no
 * browser at all. Repeating any of that here would be slower and no truer.
 *
 * What only a browser can prove is the wiring, and that is what these specs
 * are for: that a real key press moves a real rider, that the scene graph is
 * placed from the controller's state rather than from its own idea of where
 * things are, that the rider and wheel lean the way the simulation says they
 * do, that quick reset works end to end, that F4 reaches the running
 * controller, and that riding around at length produces no console errors and
 * no resource growth.
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

test('a held key rides the wheel forward, and the scene follows the simulation', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.resetRide());

  // A real key, not the bridge: this is the one path the headless suite cannot
  // reach, and the whole chain — event, binding, action, controller, rig — has
  // to be intact for it to move a pixel.
  await page.keyboard.down('KeyW');
  const ridden = await page.evaluate((steps) => {
    window.game.advance(steps);
    return { snapshot: window.game.snapshot(), rig: window.qa.rigTransform() };
  }, STEPS(3));
  await page.keyboard.up('KeyW');

  expect(ridden.snapshot.actions.throttle).toBe(1);
  expect(ridden.snapshot.euc.speed).toBeGreaterThan(4);
  expect(ridden.snapshot.euc.state).toBe('rolling');

  // +Z is forward, so a rider at the default heading rides toward +Z and
  // nowhere else. Getting this backwards makes movement and steering both run
  // the wrong way, and it is hard to spot once other bugs sit on top of it.
  expect(ridden.snapshot.euc.position.z).toBeGreaterThan(4);
  expect(Math.abs(ridden.snapshot.euc.position.x)).toBeLessThan(1e-6);

  // The rig is placed from the pose, so it is where the controller says.
  expect(ridden.rig.position.z).toBeCloseTo(ridden.snapshot.euc.position.z, 3);
  expect(ridden.rig.position.y).toBeCloseTo(0, 6);
  expect(ridden.rig.wheelPitch).toBeGreaterThan(0.02);
  expect(ridden.rig.wheelSpin).toBeGreaterThan(10);
});

test('fore-aft rider lean is strongest while speed changes and relaxes at cruise', async ({ page }, testInfo) => {
  await boot(page);

  /**
   * The head-to-hip span the player actually sees, in metres of world-vertical
   * at the rider's own distance.
   *
   * **Normalised deliberately, and this is an M3 correction to an M2 test.**
   * The raw screen span was the right measurement while the camera was a rigid
   * parked arm. The real chase camera eases both its length and its field of
   * view with speed, so the rider is drawn smaller at cruise than at launch —
   * and a raw span would report the pose *compressing* as the rider stands up,
   * which is the opposite of the truth. Dividing by the projected height of a
   * one-metre world vertical at the rider's position removes distance and
   * field of view exactly, leaving the pose and nothing else.
   */
  const measureChasePose = async (): Promise<number> => page.evaluate(() => {
    const scene = window.game.renderer.scene;
    const neck = scene.getObjectByName('rider-neck');
    const pelvis = scene.getObjectByName('rider-pelvis');
    if (!neck || !pelvis) throw new Error('rider joints missing');
    scene.updateMatrixWorld(true);
    const head = neck.getWorldPosition(neck.position.clone());
    const hip = pelvis.getWorldPosition(pelvis.position.clone());
    const position = window.game.snapshot().euc.position;

    const headY = window.qa.projectPoint(head.x, head.y, head.z).y;
    const hipY = window.qa.projectPoint(hip.x, hip.y, hip.z).y;
    const base = window.qa.projectPoint(position.x, position.y, position.z).y;
    const metre = window.qa.projectPoint(position.x, position.y + 1, position.z).y;
    return (headY - hipY) / (metre - base);
  });

  const captureSideView = async (): Promise<Buffer> => {
    const dataUrl = await page.evaluate((hipHeight) => {
      const game = window.game;
      const snapshot = game.snapshot().euc;
      const camera = game.renderer.camera;
      const source = game.renderer.renderer.domElement;
      const heading = snapshot.headingY;
      const rightX = -Math.cos(heading);
      const rightZ = Math.sin(heading);

      // QA inspection view only: a rear chase image cannot show fore-aft lean.
      // Render and copy in the same task because a presented WebGL drawing
      // buffer may read back empty on the next automation round trip.
      camera.position.set(
        snapshot.position.x + rightX * 4.2,
        snapshot.position.y + 1.45,
        snapshot.position.z + rightZ * 4.2,
      );
      camera.lookAt(
        snapshot.position.x,
        snapshot.position.y + hipHeight,
        snapshot.position.z,
      );
      game.renderer.render();

      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      const context = copy.getContext('2d');
      if (!context) throw new Error('2D capture context unavailable');
      context.drawImage(source, 0, 0);
      return copy.toDataURL('image/png');
    }, RIDER.hipHeight);
    return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  };

  const launch = await page.evaluate(() => {
    window.qa.resetRide();
    return {
      snapshot: window.qa.drive([{ actions: { throttle: 1 }, steps: 120 }])[0],
      rig: window.qa.rigTransform(),
    };
  });
  const launchChase = await measureChasePose();
  await testInfo.attach('m2-launch-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('m2-launch-lean', {
    body: await captureSideView(),
    contentType: 'image/png',
  });

  const cruise = await page.evaluate(() => ({
    snapshot: window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 39 }])[0],
    rig: window.qa.rigTransform(),
  }));
  const cruiseChase = await measureChasePose();
  await testInfo.attach('m2-cruise-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('m2-cruise-lean', {
    body: await captureSideView(),
    contentType: 'image/png',
  });

  const braking = await page.evaluate(() => ({
    snapshot: window.qa.drive([{ actions: { throttle: -1 }, steps: 48 }])[0],
    rig: window.qa.rigTransform(),
  }));
  const brakingChase = await measureChasePose();
  await testInfo.attach('m2-brake-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('m2-brake-lean', {
    body: await captureSideView(),
    contentType: 'image/png',
  });

  const renderedRiderPitch = (rig: typeof launch.rig): number => (
    rig.wheelPitch + rig.pelvisPitch - RIDER_BLOCKOUT.torsoRestPitch
  );

  /**
   * The M23 riding stances' share of the same fore-aft hinge.
   *
   * `render/rider.ts` composes the torso pitch as the controller's lean plus
   * the *stronger* of the two stances — `Math.max`, not a sum, so a charged
   * pull entering a committed corner does not fold the rig twice. Read from
   * the snapshot rather than assumed, because the three identities below are
   * claiming that the rig shows the controller's state and nothing else.
   *
   * **Re-derived 2026-08-23, and the reason is a fixed defect rather than a
   * tolerance.** Until then `Game.renderSeat` interpolated the player's render
   * pose with a hand-written block that wrote 43 of `EucPose`'s 45 scalars,
   * and the two it missed were `attack` and `carveStance` — so the player's
   * copies held their spawn value of zero and this identity passed by
   * accident: the attack and hard-carve stances had never once been drawn on
   * the player, only on the cop, whose branch has always used the derived
   * `lerpPose`. Both riders share that helper now, and the fold below is what
   * the player was supposed to have been shown since M23.
   */
  const stanceFold = (euc: { attack: number; carveStance: number }): number => Math.max(
    euc.attack * RIDER_BLOCKOUT.attackTorsoPitch,
    euc.carveStance * RIDER_BLOCKOUT.carveStanceTorsoPitch,
  );

  expect(launch.snapshot.euc.longitudinalAccel).toBeGreaterThan(4);
  expect(launch.snapshot.euc.riderPitch).toBeGreaterThan(0.66);
  // One second into the pull, so the attack stance has not begun: it charges on
  // a clock and `EUC.attackDelaySeconds` has not elapsed. The launch pose is
  // the controller's lean alone, exactly as it was before M23.
  expect(launch.snapshot.euc.attack).toBe(0);
  expect(renderedRiderPitch(launch.rig)).toBeCloseTo(
    launch.snapshot.euc.riderPitch + stanceFold(launch.snapshot.euc),
    4,
  );

  expect(Math.abs(cruise.snapshot.euc.longitudinalAccel)).toBeLessThan(0.01);
  expect(cruise.snapshot.euc.riderPitch).toBeGreaterThan(0.04);
  expect(cruise.snapshot.euc.riderPitch).toBeLessThan(launch.snapshot.euc.riderPitch * 0.25);
  // Thirty-nine seconds of held full throttle at speed is the attack stance
  // fully charged, and asserting that is what would have caught the missing
  // interpolation: with the stance stuck at zero this passed on a rider who
  // was never in it.
  expect(cruise.snapshot.euc.attack).toBeGreaterThan(0.99);
  expect(renderedRiderPitch(cruise.rig)).toBeCloseTo(
    cruise.snapshot.euc.riderPitch + stanceFold(cruise.snapshot.euc),
    4,
  );

  expect(braking.snapshot.euc.longitudinalAccel).toBeLessThan(-8);
  expect(braking.snapshot.euc.riderPitch).toBeLessThan(-0.66);
  // Four tenths of a second after the throttle was released, so the stance is
  // easing out on `EUC.attackResponseSeconds` rather than gone. It is still
  // part of the hinge, and the identity has to spend it.
  expect(braking.snapshot.euc.attack).toBeGreaterThan(0.2);
  expect(renderedRiderPitch(braking.rig)).toBeCloseTo(
    braking.snapshot.euc.riderPitch + stanceFold(braking.snapshot.euc),
    4,
  );

  // This is the regression the first QA pass missed: a side inspection camera
  // can prove the transform moved while the player's real chase view still
  // looks unchanged. The head-to-hip span the player sees must visibly change
  // between these three moments — in metres of world-vertical, so the M3
  // camera's speed easing cannot fake the result.
  //
  // **Both bounds were re-derived on 2026-08-23 and the reference pose is why.**
  // The M2 version measured launch and braking against a *relaxed* cruise, and
  // since M23 there is no such thing at speed: sustained throttle is the attack
  // stance, which folds the torso `attackTorsoPitch` further and drops the hips
  // `attackHipDrop`, so the pose these differences are measured from is itself
  // a compressed one. Measured before the interpolation fix — launch 0.385,
  // cruise 0.504, braking 0.408; measured after it — launch 0.385, cruise 0.449,
  // braking 0.447. The launch gap survives at a little over half its old size
  // and is asserted at 0.05 with the same proportional margin the 0.10 had.
  //
  // **The braking comparison did not survive, and that is a finding rather than
  // a tolerance failure**: an early hard brake and a settled cruise now present
  // the same span to within 0.002, because this sample is taken while a quarter
  // of the attack stance is still easing out. So the claim is made against the
  // launch pose instead, which is the one the chase view still separates —
  // braking stands the rider back up out of a fold the launch is deep in.
  expect(cruiseChase - launchChase).toBeGreaterThan(0.05);
  expect(brakingChase - launchChase).toBeGreaterThan(0.05);
});

test('the placeholder rider is in the scene, and the M0 scale post is gone', async ({ page }) => {
  await boot(page);
  const rig = await page.evaluate(() => window.qa.rigTransform());

  expect(rig.riderPresent).toBe(true);
  // The post was a debug aid whose entire job was making scale judgeable
  // before a rider existed. One now does.
  expect(rig.scaleReferencePresent).toBe(false);
});

test('the world does not run out during a five-minute ride in one direction', async ({ page }) => {
  await boot(page);

  // The M2 version of this asserted that a ten-kilometre placeholder plane was
  // wide enough to hold a five-minute run. M4 deleted the plane: the world's
  // outside is now the plan's own surround, which is real ground with a real
  // surface. So the claim is stronger and simpler — ride for five minutes and
  // there is still ground under the wheel, whatever it happens to be.
  const runway = await page.evaluate(() => {
    window.qa.resetRide();
    const ridden = window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 60 * 5 }])[0];
    return {
      euc: ridden.euc,
      surroundHeight: window.game.levelPlan.surround.height,
    };
  });

  expect(runway.euc.grounded).toBe(true);
  expect(runway.euc.position.y).toBe(runway.surroundHeight);
  expect(runway.euc.offCourse).toBe(true);
  expect(runway.euc.distanceTravelled).toBeGreaterThan(3000);
  // Off the authored course is grass, which costs speed — the wheel is still
  // moving, just not as fast as it was on the boulevard.
  expect(runway.euc.speed).toBeGreaterThan(10);
});

test('the rider stands on the wheel at a believable scale', async ({ page }) => {
  await boot(page);

  // Boot can legitimately spend long enough waiting for WebGL that the M4
  // one-foot-down rest stance has already begun. This assertion is about the
  // mounted riding stance, so select that state deterministically instead of
  // letting machine speed decide which valid pose it measures.
  await page.evaluate(() => window.qa.resetRide());

  const measured = await page.evaluate(() => {
    const scene = window.game.renderer.scene;
    const rider = scene.getObjectByName('rider-blockout');
    const helmet = scene.getObjectByName('rider-neck');
    const boot = scene.getObjectByName('rider-ankle-left');
    if (!rider || !helmet || !boot) throw new Error('rider joints missing');
    rider.updateWorldMatrix(true, true);
    return {
      neckY: helmet.getWorldPosition(helmet.position.clone()).y,
      ankleY: boot.getWorldPosition(boot.position.clone()).y,
    };
  });

  // The boots are on the pedals rather than near them — a rider floating above
  // the wheel or sunk into it is the first thing a viewer sees and the last
  // thing a code review catches.
  expect(measured.ankleY).toBeCloseTo(WHEEL.pedalHeight + 0.06, 2);
  // Shoulders roughly where a person of RIDER.height would have them.
  expect(measured.neckY).toBeGreaterThan(RIDER.hipHeight + 0.35);
  expect(measured.neckY).toBeLessThan(RIDER.height);
});

test('pressing D steers toward the right of the screen, and leans into it', async ({ page }) => {
  await boot(page);

  // **This is the only test in the project that can tell left from right.**
  //
  // The controller, the rig, and every headless assertion are written in the
  // world frame. If that frame is wrong they all agree with one another and
  // all of them are wrong — which is exactly what happened while M2 was being
  // built: the declared convention ("+Z forward, +X right, right-handed") is
  // the left-handed identity, three.js is right-handed, and steering right
  // carved left on screen with the rider leaning out of every corner. A
  // world-space sign test cannot catch that. Projecting to screen space can.
  const probe = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 0.4 }, steps: 120 * 3 }]);
    const snapshot = window.game.snapshot();
    // A fixed landmark, planted straight ahead of the rider before the turn.
    // The camera is rigidly locked to the heading at M2, so a point measured
    // *relative to the rider* stays dead centre however hard they carve; only
    // something nailed to the world moves across the screen.
    const landmark = {
      x: snapshot.euc.position.x + Math.sin(snapshot.euc.headingY) * 25,
      y: 1,
      z: snapshot.euc.position.z + Math.cos(snapshot.euc.headingY) * 25,
    };
    return {
      straight: window.qa.screenProbe(3),
      landmark,
      landmarkBefore: window.qa.projectPoint(landmark.x, landmark.y, landmark.z),
    };
  });

  expect(probe.straight.ahead.inFront).toBe(true);
  expect(probe.straight.rider.inFront).toBe(true);
  // The camera is parked behind the rider, so the way they are going is the
  // middle of the screen.
  expect(Math.abs(probe.straight.ahead.x)).toBeLessThan(0.02);
  // And the rider's right hand is on the right half of it.
  expect(probe.straight.riderRight.x).toBeGreaterThan(0.1);
  expect(probe.straight.riderLeft.x).toBeLessThan(-0.1);
  expect(Math.abs(probe.landmarkBefore.x)).toBeLessThan(0.02);

  // Now steer right with a real key, and check on screen.
  await page.keyboard.down('KeyD');
  const carving = await page.evaluate((landmark) => {
    // A third of a second of full lock swings the heading about 28 degrees —
    // enough to be unambiguous, little enough that the landmark stays inside
    // the frustum rather than passing behind the camera.
    window.game.advance(40);
    const midTurn = window.qa.projectPoint(landmark.x, landmark.y, landmark.z);
    const snapshot = window.game.snapshot();

    // Leaning into the turn, measured while the rider is still in it: the
    // helmet is displaced toward the inside of the corner, which here is the
    // right of the screen.
    const scene = window.game.renderer.scene;
    const camera = window.game.renderer.camera;
    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    const neck = scene.getObjectByName('rider-neck');
    const rig = scene.getObjectByName('riding-rig');
    if (!neck || !rig) throw new Error('rig missing');
    const head = neck.getWorldPosition(neck.position.clone());
    const base = rig.getWorldPosition(rig.position.clone());
    const m = camera.matrixWorld.elements;
    const lean = {
      alongScreenRight:
        (head.x - base.x) * m[0] + (head.y - base.y) * m[1] + (head.z - base.z) * m[2],
      headAboveBase: head.y - base.y,
    };

    return { midTurn, snapshot, lean };
  }, probe.landmark);
  await page.keyboard.up('KeyD');

  // **M3 correction to an M2 test.** The camera used to be rigidly locked to
  // the heading, so the landmark left the centre of the screen the instant the
  // rider turned. The real chase camera lags, so half a second of that turn is
  // still on the camera rather than on the world — the assertion below now
  // releases the steering and lets the camera catch up first, which is a
  // stronger claim anyway: the rider turned right, and once the camera has
  // finished following, what was ahead of them is on their left.
  const settled = await page.evaluate((landmark) => {
    window.game.setActions({ steer: 0 });
    window.game.advance(90);
    window.game.clearActions();
    return {
      probe: window.qa.screenProbe(3),
      landmarkAfter: window.qa.projectPoint(landmark.x, landmark.y, landmark.z),
      camera: window.qa.cameraTransform(),
    };
  }, probe.landmark);

  expect(carving.snapshot.actions.steer).toBe(1);
  // The camera lagged rather than tracking rigidly, so the landmark has only
  // begun to move while the turn is still being made.
  expect(carving.midTurn.x).toBeLessThan(-0.05);

  // Turn right and what was ahead of you ends up on your left. This is the
  // assertion that fails when steering is mirrored.
  expect(settled.landmarkAfter.inFront).toBe(true);
  expect(settled.landmarkAfter.x).toBeLessThan(-0.2);
  // And the camera did finish catching up rather than staying behind.
  expect(Math.abs(settled.camera.yawLag)).toBeLessThan(0.02);
  // The rider's right is still their right: they leaned, they did not
  // teleport into a mirror.
  expect(settled.probe.riderRight.x).toBeGreaterThan(settled.probe.riderLeft.x);

  expect(carving.lean.headAboveBase).toBeGreaterThan(0.8);
  expect(carving.lean.alongScreenRight).toBeGreaterThan(0.15);
});

test('a hard carve tilts the lower body while the torso stays near level and the inside knee bends', async ({ page }, testInfo) => {
  await boot(page);

  const carve = await page.evaluate((steps) => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps }]);
    const straight = window.qa.rigTransform();
    const turning = window.qa.drive([{ actions: { throttle: 1, steer: 1 }, steps }])[0];
    return { straight, turning, rig: window.qa.rigTransform() };
  }, STEPS(2.5));

  expect(Math.abs(carve.straight.leanRoll)).toBeLessThan(0.01);
  expect(Math.abs(carve.turning.euc.rollAngle)).toBeGreaterThan(0.15);

  // A rotation about +Z takes +Y toward -X, so the pivot's sign is inverted
  // relative to the roll angle.
  expect(carve.rig.leanRoll).toBeCloseTo(-carve.turning.euc.rollAngle, 3);
  expect(carve.rig.headingY).toBeCloseTo(carve.turning.euc.headingY, 3);

  // The upper body counter-rolls against the wheel. The difference is carried
  // above the hip while the articulated legs keep the boots on the pedals.
  const extra = carve.turning.euc.riderRoll - carve.turning.euc.rollAngle;
  expect(Math.abs(extra)).toBeGreaterThan(0);
  expect(Math.sign(extra)).toBe(-Math.sign(carve.turning.euc.rollAngle));
  expect(carve.rig.pelvisRoll).toBeCloseTo(-extra, 4);
  expect(Math.abs(carve.turning.euc.riderRoll)).toBeLessThan(
    Math.abs(carve.turning.euc.rollAngle) * 0.25,
  );
  expect(Math.abs(carve.rig.leanRoll + carve.rig.pelvisRoll)).toBeCloseTo(
    Math.abs(carve.turning.euc.riderRoll),
    3,
  );

  // D is a right turn. With +X rider-left, the named right hip is on -X and
  // is the inside leg: it drops farther so its knee bends while both feet stay
  // planted on the pedals.
  expect(carve.rig.pelvisY).toBeLessThan(RIDER.hipHeight - 0.03);
  expect(carve.rig.rightHipY).toBeLessThan(carve.rig.leftHipY - 0.05);

  await testInfo.attach('m2-hard-carve-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('a real full-lock key at low speed banks the wheel and bends the outside leg', async ({ page }, testInfo) => {
  await boot(page);
  await page.evaluate(() => window.qa.resetRide());

  // Reach walking/jogging pace through the real keyboard path, then let the
  // force lean settle so the capture is a turn rather than a launch pose.
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.game.advance(45));
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.game.advance(60));

  await page.keyboard.down('KeyD');
  const turn = await page.evaluate(() => {
    window.game.advance(50);
    return { snapshot: window.game.snapshot(), rig: window.qa.rigTransform() };
  });
  await page.keyboard.up('KeyD');

  expect(turn.snapshot.actions.steer).toBe(1);
  expect(Math.abs(turn.snapshot.euc.technicalTurn)).toBeGreaterThan(0.35);
  expect(Math.abs(turn.snapshot.euc.rollAngle)).toBeGreaterThan(0.35);
  expect(turn.snapshot.euc.lateralAccel).toBeCloseTo(
    turn.snapshot.euc.speed * turn.snapshot.euc.yawRate,
    6,
  );
  expect(Math.abs(turn.rig.pelvisYaw)).toBeLessThan(0.02);
  // Right turn: the right leg is inside and stays long; the left/outside leg
  // bends to load its raised pedal. Compare the solved knee angles rather than
  // hip heights: wheel bank itself raises the outside pedal, so a world/local
  // Y comparison can report the opposite of the actual articulation.
  expect(turn.rig.leftKneeFlex).toBeGreaterThan(turn.rig.rightKneeFlex + 0.08);
  expect(Math.abs(turn.snapshot.euc.riderRoll)).toBeLessThan(
    Math.abs(turn.snapshot.euc.rollAngle) * 0.15,
  );

  await testInfo.attach('m16-low-speed-technical-turn-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('braking is a hips-back semi-squat and launching drives the hips forward, not only torso tilts', async ({ page }) => {
  await boot(page);

  const stances = await page.evaluate(() => {
    const read = () => ({
      rig: window.qa.rigTransform(),
      euc: window.game.snapshot().euc,
    });
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 }]);
    const launch = read();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 39 }]);
    const cruise = read();
    window.qa.drive([{ actions: { throttle: -1 }, steps: 48 }]);
    const braking = read();
    return { launch, cruise, braking };
  });

  /**
   * What the M23 attack stance is contributing to this sample's hips and head.
   *
   * **Re-derived 2026-08-23.** These three assertions were written against a
   * rider the attack stance had never reached: `Game.renderSeat` interpolated
   * the player's pose by hand and never wrote `attack` or `carveStance`, so
   * they sat at their spawn zero and the stance was drawn on the cop alone.
   * Subtracting the stance's own offsets is what leaves the acceleration pose
   * these assertions are actually about — it is an isolation, not a widened
   * bound, and every term below is the constant `render/rider.ts` spends.
   */
  const stance = (sample: typeof stances.cruise) => ({
    /** Hips carried back as the torso goes over them. */
    hipShift: sample.euc.attack * RIDER_BLOCKOUT.attackHipShift,
    /** A third of a tuck's drop, because the attack stance keeps legs long. */
    hipDrop: sample.euc.attack * RIDER_BLOCKOUT.attackHipDrop,
    /**
     * The head's give-back. The neck stabilises against the *total* fore-aft
     * hinge, and the stance's fold is part of that total, so the helmet comes
     * down by its share of it on the tuck allowance.
     */
    headGive: Math.min(
      RIDER_BLOCKOUT.tuckHeadStabilizationMax,
      sample.euc.attack * RIDER_BLOCKOUT.attackTorsoPitch
        * RIDER_BLOCKOUT.tuckHeadStabilization,
    ),
  });

  // Launch: hips ahead of neutral, knees loaded, eyes still on the route
  // rather than on the contact patch. One second in, so the stance has not
  // begun charging and none of the corrections above apply here.
  expect(stances.launch.euc.attack).toBe(0);
  expect(stances.launch.rig.pelvisZ).toBeGreaterThan(0.06);
  expect(stances.launch.rig.pelvisY).toBeLessThan(RIDER.hipHeight - 0.02);
  expect(stances.launch.rig.neckPitch).toBeLessThan(-0.4);

  // Cruise: the *acceleration* stance relaxes with the pose — near neutral,
  // near full height — underneath a fully charged attack stance, which is
  // what thirty-nine seconds of held throttle at speed now means.
  expect(stances.cruise.euc.attack).toBeGreaterThan(0.99);
  expect(
    Math.abs(stances.cruise.rig.pelvisZ + stance(stances.cruise).hipShift),
  ).toBeLessThan(0.02);
  expect(
    stances.cruise.rig.pelvisY + stance(stances.cruise).hipDrop,
  ).toBeGreaterThan(RIDER.hipHeight - 0.01);

  // Braking: hips well behind the axle in a deep squat with both knees bent —
  // not only the backward torso tilt the motion reference forbids — and no
  // backward head-throw. Sampled four tenths of a second after the throttle
  // was released, so a quarter of the attack stance is still easing out and
  // the head is still giving back its share of that fold.
  expect(stances.braking.rig.pelvisZ).toBeLessThan(-0.1);
  expect(stances.braking.rig.pelvisY).toBeLessThan(RIDER.hipHeight - 0.06);
  expect(stances.braking.rig.leftHipY).toBeLessThan(RIDER.hipHeight - 0.06);
  expect(stances.braking.rig.rightHipY).toBeLessThan(RIDER.hipHeight - 0.06);
  expect(
    stances.braking.rig.neckPitch + stance(stances.braking).headGive,
  ).toBeGreaterThan(0.3);
});

test('left and right hard carves mirror, and the inside knee opens toward the apex', async ({ page }, testInfo) => {
  await boot(page);

  const right = await page.evaluate((steps) => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps }]);
    const straight = window.qa.rigTransform();
    window.qa.drive([{ actions: { throttle: 1, steer: 1 }, steps }]);
    return { straight, rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
  }, STEPS(2.5));
  await testInfo.attach('m2-hard-carve-right-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  const left = await page.evaluate((steps) => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps }]);
    window.qa.drive([{ actions: { throttle: 1, steer: -1 }, steps }]);
    return { rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
  }, STEPS(2.5));
  await testInfo.attach('m2-hard-carve-left-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // Steering right rolls toward -X and steering left toward +X, at the same
  // magnitude: the two carves are the same carve, mirrored.
  expect(right.euc.rollAngle).toBeLessThan(-0.15);
  expect(left.euc.rollAngle).toBeGreaterThan(0.15);
  expect(Math.abs(left.euc.rollAngle + right.euc.rollAngle)).toBeLessThan(0.03);

  // The inside hip drops on the inside of each turn — right hip in a right
  // carve, left hip in a left carve — by the same margin.
  expect(right.rig.rightHipY).toBeLessThan(right.rig.leftHipY - 0.05);
  expect(left.rig.leftHipY).toBeLessThan(left.rig.rightHipY - 0.05);
  expect(
    Math.abs((right.rig.leftHipY - right.rig.rightHipY) - (left.rig.rightHipY - left.rig.leftHipY)),
  ).toBeLessThan(0.01);

  // The inside knee opens outboard, toward the apex; the outside knee keeps
  // its forward bend against the wheel. Straight riding is the baseline.
  expect(right.rig.rightKneeOutboard).toBeGreaterThan(right.straight.rightKneeOutboard + 0.04);
  expect(right.rig.rightKneeOutboard).toBeGreaterThan(right.rig.leftKneeOutboard + 0.04);
  expect(left.rig.leftKneeOutboard).toBeGreaterThan(left.rig.rightKneeOutboard + 0.04);
  expect(
    Math.abs(left.rig.leftKneeOutboard - right.rig.rightKneeOutboard),
  ).toBeLessThan(0.01);
});

test('combined steer transitions articulate coherently and recover to neutral', async ({ page }, testInfo) => {
  await boot(page);

  const combined = await page.evaluate((steps) => {
    window.qa.resetRide();
    window.qa.drive([
      { actions: { throttle: 1 }, steps: steps * 2 },
      { actions: { throttle: 1, steer: 1 }, steps: Math.round(steps * 1.5) },
    ]);
    const accelSteer = window.qa.rigTransform();
    window.qa.drive([{ actions: { throttle: -1, steer: 1 }, steps: Math.round(steps * 0.6) }]);
    const brakeSteer = { rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
    // Scripted axes persist until overwritten, so releasing is an explicit
    // zero, not an empty object.
    window.qa.drive([{ actions: { throttle: 0, steer: 0 }, steps: steps * 4 }]);
    const recovered = { rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
    return { accelSteer, brakeSteer, recovered };
  }, STEPS(1));
  await testInfo.attach('m2-brake-while-steering-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  // Throttle plus steer: hips forward of neutral while the inside hip is
  // dropped — both reactions present at once.
  expect(combined.accelSteer.pelvisZ).toBeGreaterThan(0.01);
  expect(combined.accelSteer.rightHipY).toBeLessThan(combined.accelSteer.leftHipY - 0.03);

  // Brake plus steer: the hips swing behind the axle and squat deepens while
  // the carve articulation stays on the inside leg.
  expect(combined.brakeSteer.euc.state).toBe('braking');
  expect(combined.brakeSteer.rig.pelvisZ).toBeLessThan(-0.05);
  expect(combined.brakeSteer.rig.pelvisY).toBeLessThan(RIDER.hipHeight - 0.06);
  expect(combined.brakeSteer.rig.rightHipY).toBeLessThan(combined.brakeSteer.rig.leftHipY);

  // Releasing everything eases the whole stance back to neutral: upright,
  // centred hips, level wheel, and a settled pose — with no residual offset
  // left behind by any of the transitions above.
  expect(Math.abs(combined.recovered.euc.rollAngle)).toBeLessThan(0.02);
  expect(Math.abs(combined.recovered.euc.riderPitch)).toBeLessThan(0.03);
  expect(Math.abs(combined.recovered.rig.pelvisZ)).toBeLessThan(0.01);
  expect(combined.recovered.rig.pelvisY).toBeGreaterThan(RIDER.hipHeight - 0.015);
  expect(Math.abs(combined.recovered.rig.leanRoll)).toBeLessThan(0.02);
});

test('a fast turn goes wide because the lateral limit binds, not because input was dropped', async ({ page }) => {
  await boot(page);

  const trace = await page.evaluate((steps) => {
    window.qa.resetRide();
    // Accelerate straight to the top of the speed range first, so the sweep
    // below passes through every speed the limit behaves differently at.
    window.qa.drive([{ actions: { throttle: 1 }, steps: steps * 8 }]);
    return window.qa.rideTrace({ throttle: 1, steer: 1 }, steps * 10, 12);
  }, STEPS(1));

  const ceiling = EUC.maxLateralG * PHYSICS.gravity;
  for (const sample of trace) {
    expect(Math.abs(sample.lateralAccel)).toBeLessThanOrEqual(ceiling + 1e-6);
  }
  expect(trace.some((sample) => sample.lateralLimited)).toBe(true);

  // And the turn is a real, closed arc rather than a spiral: the widest radius
  // seen is bounded by the ceiling at the speed the wheel is actually doing.
  const limited = trace.filter((sample) => sample.lateralLimited && sample.speed > 1);
  expect(limited.length).toBeGreaterThan(0);
  for (const sample of limited) {
    const radius = Math.abs(sample.speed ** 2 / sample.lateralAccel);
    expect(radius).toBeGreaterThan(1);
    expect(radius).toBeLessThan(200);
  }
});

test('riding a full circle comes back to where it started', async ({ page }) => {
  await boot(page);

  const lap = await page.evaluate(() => {
    window.qa.resetRide();
    // Spawn is on the rounded end-cap of the pad. Move the fixture into its
    // flat interior so the accelerating spiral cannot spend its first metre on
    // grass and stall before the steady circle even begins.
    window.qa.placeRider(0, 60, 0);
    // Settle into a steady carve first; the first seconds are the wheel
    // getting up to speed, and their radius is meaningless.
    //
    // **A quarter throttle since M16, to hold the circle the same size.** The
    // radius is `speed² / lateralLimit`, so the raised top speed drew a 30 m
    // radius at the old 0.45 and took the lap off the pad and across terrain
    // that is not flat — which distorts a geometric claim about a circle. 0.23
    // settles at almost exactly the 10 m/s this test has always measured, and
    // the circle is the one it was written against.
    // Stay below the hard technical-turn threshold: this is a closed-circle
    // geometry fixture, not a pedal-scrape endurance test.
    window.qa.drive([{ actions: { throttle: 0.23, steer: 0.5 }, steps: 120 * 20 }]);
    const start = window.game.snapshot().euc;

    const samples = window.qa.rideTrace({ throttle: 0.23, steer: 0.5 }, 120 * 40, 6);
    const closed = samples.find(
      // Steering right, so the heading counts down through a full turn.
      (sample) => start.headingY - sample.headingY >= Math.PI * 2,
    );
    return {
      start,
      closed,
      samples: samples.length,
      last: samples.at(-1),
      minHeading: Math.min(...samples.map((sample) => sample.headingY)),
      maxHeading: Math.max(...samples.map((sample) => sample.headingY)),
      minSpeed: Math.min(...samples.map((sample) => sample.speed)),
    };
  });

  expect(lap.closed, JSON.stringify(lap)).toBeTruthy();
  if (!lap.closed) return;

  const drift = Math.hypot(
    lap.closed.x - lap.start.position.x,
    lap.closed.z - lap.start.position.z,
  );
  // Sampled every six steps, so a little under a step of arc is the floor here.
  expect(drift).toBeLessThan(0.5);
});

test('braking is powerful, and the state machine says so', async ({ page }) => {
  await boot(page);
  // Sustained top speed is the fixture, and M20 put a cutout there. See
  // `disableMaxSpeedCutout`.
  await disableMaxSpeedCutout(page);

  const stop = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 20 }]);
    const cruising = window.game.snapshot().euc;
    window.game.setActions({ throttle: -1 });
    window.game.advance(60);
    const braking = window.game.snapshot().euc;
    const result = window.qa.rideUntilStopped({ throttle: -1 }, 120 * 5);
    return { cruising, braking, result };
  });

  expect(stop.cruising.speed).toBeGreaterThan(11);
  expect(stop.braking.state).toBe('braking');
  expect(stop.result.stopped).toBe(true);
  expect(stop.result.steps / SIMULATION.hz).toBeLessThan(2);
  expect(stop.result.distance).toBeLessThan(16);
});

test('reverse needs asking for twice, and the rider stays put in between', async ({ page }) => {
  await boot(page);

  const reverse = await page.evaluate((dwellSteps) => {
    window.qa.resetRide();
    const early = window.qa.drive([{ actions: { throttle: -1 }, steps: dwellSteps }])[0];
    const engaged = window.qa.drive([{ actions: { throttle: -1 }, steps: 120 * 4 }])[0];
    return { early, engaged };
  }, Math.floor(EUC.reverseEngageSeconds * SIMULATION.hz * 0.5));

  expect(reverse.early.euc.speed).toBe(0);
  expect(reverse.early.euc.reversing).toBe(false);

  expect(reverse.engaged.euc.reversing).toBe(true);
  expect(reverse.engaged.euc.speed).toBeLessThan(0);
  expect(reverse.engaged.euc.speed).toBeGreaterThanOrEqual(-EUC.maxReverseSpeed - 1e-9);
  // Reverse is for repositioning, so it goes backwards, not far backwards.
  expect(reverse.engaged.euc.position.z).toBeLessThan(-1);
});

test('riding backwards, the rider checks over their shoulder instead of staring ahead', async ({ page }) => {
  await boot(page);

  const look = await page.evaluate((dwellSteps) => {
    window.qa.resetRide();
    const forward = window.qa.rigTransform();
    // Most of the way through the confirmation dwell: the held second request
    // is answered by a visible partial shoulder check before anything rolls.
    window.qa.drive([{ actions: { throttle: -1 }, steps: dwellSteps }]);
    const glance = { rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
    // Deep into reverse: the full look-behind stance, held while rolling.
    window.qa.drive([{ actions: { throttle: -1 }, steps: 120 * 4 }]);
    const engaged = { rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
    // Forward again: the whole stance unwinds.
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 4 }]);
    const recovered = { rig: window.qa.rigTransform(), euc: window.game.snapshot().euc };
    return { forward, glance, engaged, recovered };
  }, Math.floor(EUC.reverseEngageSeconds * SIMULATION.hz * 0.8));

  // Forward riding carries no chest twist and no resting head yaw.
  expect(Math.abs(look.forward.pelvisYaw)).toBeLessThan(1e-6);
  expect(Math.abs(look.forward.neckYaw)).toBeLessThan(1e-6);

  // The glance: partially armed, nothing rolling yet.
  expect(look.glance.euc.reversing).toBe(false);
  expect(look.glance.euc.speed).toBe(0);
  expect(look.glance.rig.pelvisYaw).toBeGreaterThan(0.02);
  expect(look.glance.rig.neckYaw).toBeGreaterThan(0.05);
  expect(Math.abs(look.glance.euc.riderPitch)).toBeLessThan(0.02);
  expect(Math.abs(look.glance.rig.pelvisZ)).toBeLessThan(0.02);

  // Engaged: chest open toward the left shoulder, head turned over it, and
  // the whole thing measured through the real scene graph after a real render.
  expect(look.engaged.euc.reversing).toBe(true);
  expect(look.engaged.euc.reverseBlend).toBeGreaterThan(0.95);
  expect(look.engaged.rig.pelvisYaw).toBeGreaterThan(RIDER_BLOCKOUT.reverseTorsoTwist * 0.9);
  expect(look.engaged.rig.neckYaw).toBeGreaterThan(RIDER_BLOCKOUT.reverseHeadYaw * 0.9);
  expect(Math.abs(look.engaged.euc.riderPitch)).toBeLessThan(0.02);
  expect(Math.abs(look.engaged.rig.pelvisZ)).toBeLessThan(0.02);
  // The twist stays above the hips: both boots remain on their pedals.
  expect(Math.abs(look.engaged.rig.leftAnkleZ)).toBeLessThan(0.02);
  expect(Math.abs(look.engaged.rig.rightAnkleZ)).toBeLessThan(0.02);

  // Riding forward again releases the look.
  expect(look.recovered.euc.reversing).toBe(false);
  expect(look.recovered.rig.pelvisYaw).toBeLessThan(0.02);
  expect(look.recovered.rig.neckYaw).toBeLessThan(0.05);
});

test('quick reset puts the rider back at the spawn from the keyboard', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    window.qa.resetRide();
    window.game.setActions({ throttle: 1, steer: 0.7 });
    window.game.advance(120 * 4);
    window.game.clearActions();
  });

  const before = await page.evaluate(() => window.game.snapshot().euc);
  expect(Math.hypot(before.position.x, before.position.z)).toBeGreaterThan(5);

  await page.keyboard.press('KeyR');
  const after = await page.evaluate(() => {
    window.game.advance(1);
    return { euc: window.game.snapshot().euc, rig: window.qa.rigTransform() };
  });

  expect(after.euc.position).toEqual({ x: 0, y: 0, z: 0 });
  expect(after.euc.headingY).toBe(0);
  expect(after.euc.speed).toBe(0);
  expect(after.euc.distanceTravelled).toBe(0);
  // The rig follows immediately: a reset that leaves the previous pose in the
  // interpolation history draws one frame smeared across the whole map.
  expect(after.rig.position.x).toBeCloseTo(0, 6);
  expect(after.rig.position.z).toBeCloseTo(0, 6);
});

// The parked-chase spec that lived here is gone: it asserted that the camera
// was rigid, which was M2's placeholder and is exactly what M3 replaced. Every
// claim about where the camera is now lives in `tests/m3.spec.ts`.

test('C cycles to the inspection camera without disturbing the ride', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 2 }]);
  });
  const before = await page.evaluate(() => window.game.snapshot());

  await page.keyboard.press('KeyC');
  const orbiting = await page.evaluate(() => {
    window.game.advance(1);
    return { snapshot: window.game.snapshot(), camera: window.qa.cameraTransform() };
  });

  expect(orbiting.snapshot.camera.mode).toBe('orbit');
  expect(orbiting.camera.mode).toBe('orbit');
  // The orbit is centred on the rider now, not on the world origin.
  expect(orbiting.camera.distanceToRider).toBeLessThan(5);
  expect(orbiting.snapshot.euc.speed).toBeCloseTo(before.euc.speed, 1);

  await page.keyboard.press('KeyC');
  const back = await page.evaluate(() => {
    window.game.advance(1);
    return window.game.snapshot().camera.mode;
  });
  expect(back).toBe('chase');
});

test('a controller constant changed through F4 reaches the running wheel', async ({ page }) => {
  await boot(page, 'panel=1');

  const stock = await page.evaluate(() => {
    window.qa.resetRide();
    return window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 30 }])[0].euc.speed;
  });
  expect(stock).toBeGreaterThan(11);

  // Through the visible control, not through the store: a slider that moves a
  // number nothing consults is worse than no slider.
  const row = page.locator('.euc-tunable[data-path="EUC.leanToAccel"]');
  await expect(row).toBeVisible();
  await row.locator('input[type="range"]').evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = '5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const detuned = await page.evaluate(() => {
    window.qa.resetRide();
    return window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 30 }])[0].euc.speed;
  });

  expect(detuned).toBeLessThan(stock * 0.7);

  await row.locator('.euc-revert').click();
  const restored = await page.evaluate(() => {
    window.qa.resetRide();
    return window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 30 }])[0].euc.speed;
  });
  expect(restored).toBeCloseTo(stock, 3);
});

test('the debug overlay reports the ride state it is looking at', async ({ page }) => {
  await boot(page, 'debug=1');

  const state = await page.evaluate(() => {
    window.qa.resetRide();
    // Down the pad first, then carve. Carving from a standstill swings the
    // heading past ninety degrees inside a second and takes the rider back off
    // the end of the beat they started on, which is a real thing a rider can
    // do and a poor place to read a surface from.
    window.qa.drive([
      { actions: { throttle: 1, steer: 0 }, steps: 120 * 4 },
      { actions: { throttle: 1, steer: 1 }, steps: 120 * 2 },
    ]);
    return window.game.snapshot().euc;
  });

  const overlay = page.locator('#euc-debug-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('[data-field="ridestate"]')).toHaveText(state.state);
  await expect(overlay.locator('[data-field="camera"]')).toHaveText('chase');

  // The overlay must contain the value it names, not merely a plausible one.
  const speedText = await overlay.locator('[data-field="speed"]').textContent();
  const speedKph = Number(speedText?.split(' ')[0]);
  expect(speedKph).toBeCloseTo(state.speedKph, 1);

  await expect(overlay.locator('[data-field="surface"]')).toHaveText('pavement');
});

test('GPU objects plateau across repeated rides and resets', async ({ page }) => {
  await boot(page);

  const trace = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // Warm up both shader compilation and the full-lock scrape path. Honest
    // low-speed banking can now light the pooled spark field; renderer.info
    // does not count that preallocated geometry until it has first rendered,
    // so sampling before a representative ride mistakes activation for a leak.
    game.advance(60);
    window.qa.drive([
      { actions: { throttle: 1, steer: 1 }, steps: 240 },
      { actions: { throttle: -1, steer: 0 }, steps: 240 },
    ]);
    window.qa.resetRide();
    const samples = [game.resources()];

    for (let round = 0; round < 5; round += 1) {
      window.qa.drive([
        { actions: { throttle: 1, steer: round % 2 === 0 ? 1 : -1 }, steps: 240 },
        { actions: { throttle: -1, steer: 0 }, steps: 240 },
      ]);
      window.qa.resetRide();
      samples.push(game.resources());
    }
    return samples;
  });

  const baseline = trace[0];
  expect(baseline.lights).toBe(2);
  for (const sample of trace) {
    expect(sample.geometries).toBe(baseline.geometries);
    expect(sample.textures).toBe(baseline.textures);
    expect(sample.programs).toBe(baseline.programs);
    expect(sample.sceneObjects).toBe(baseline.sceneObjects);
  }
});

test('a long riding pass produces no console errors', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page, 'debug=1');

  // A ride with every input the milestone owns, driven from real keys.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyS');
  await page.keyboard.press('KeyR');

  const captured = await page.evaluate(() => {
    // Freeze before capturing, so the picture shows a state that was asked for
    // rather than whatever the loop reached during the screenshot round trip.
    window.qa.resetRide();
    window.qa.drive([
      { actions: { throttle: 1 }, steps: 120 * 6 },
      { actions: { throttle: 1, steer: 1 }, steps: 120 * 2 },
    ]);
    return window.game.snapshot();
  });

  expect(captured.euc.speed).toBeGreaterThan(6);
  expect(Math.abs(captured.euc.rollAngle)).toBeGreaterThan(0.1);
  expect(captured.euc.grounded).toBe(true);

  await testInfo.attach('m2-carving', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(errors).toEqual([]);
});
