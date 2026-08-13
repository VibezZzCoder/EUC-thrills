/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { RIDER, RIDER_BLOCKOUT, WHEEL } from '../src/data/tuning.ts';
import { boot, collectErrors } from './harness.ts';

/**
 * M8.6 — the two tweaks from the owner's Safari ride of the M8 build.
 *
 * > 1) crouching (shift) doesn't really crouch that much.
 * > 2) no collision against buildings out in the grass — I went right through
 * >    the buildings as if they were a projection.
 *
 * Both are player-facing, so both are proven here rather than headlessly. The
 * pose half in particular: `docs/PLANS.md` and AGENTS.md both record the M2
 * lesson that a side inspection view can prove a transform moved and still say
 * nothing about whether the player can perceive it, so **the acceptance view
 * for the tuck is the ordinary chase camera**, measured in screen space.
 */

/**
 * Where the rider's head is, both as the player sees it and in the world.
 *
 * `headAboveWheel` is the acceptance measurement: the head's height in the
 * frame, normalised against a world metre so the chase arm easing with speed
 * cannot be mistaken for the rider folding.
 *
 * `headAheadOfHip` is the fold, and it is deliberately **not** a screen
 * measurement. The chase camera looks almost straight down the axis a fore-aft
 * hinge moves along — the M2 lesson this project has already paid for twice —
 * and worse, perspective makes a head that moved *away* from the camera project
 * slightly *higher*, so a screen-space "head nearer the hips" test reads
 * backwards on the very pose it is meant to prove. The hinge is measured along
 * the rider's own heading instead, and the side inspection capture is what a
 * human looks at.
 */
function riderHead(page: Page): Promise<{
  headAboveWheel: number;
  headAheadOfHip: number;
}> {
  return page.evaluate(() => {
    const scene = window.game.renderer.scene;
    const pelvis = scene.getObjectByName('rider-pelvis');
    const neck = scene.getObjectByName('rider-neck');
    if (!pelvis || !neck) throw new Error('rider joints not found');
    scene.updateMatrixWorld(true);
    const head = neck.getWorldPosition(neck.position.clone());
    const hip = pelvis.getWorldPosition(pelvis.position.clone());
    const euc = window.game.snapshot().euc;
    const position = euc.position;
    const headY = window.qa.projectPoint(head.x, head.y, head.z).y;
    const base = window.qa.projectPoint(position.x, position.y, position.z).y;
    const metre = window.qa.projectPoint(position.x, position.y + 1, position.z).y;
    // Forward is (sin h, cos h) — the axis convention, not a guess.
    const forwardX = Math.sin(euc.headingY);
    const forwardZ = Math.cos(euc.headingY);
    return {
      headAboveWheel: (headY - base) / (metre - base),
      headAheadOfHip: (head.x - hip.x) * forwardX + (head.z - hip.z) * forwardZ,
    };
  });
}

/** A side inspection capture. QA evidence only; never an acceptance view. */
async function sideView(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate((hipHeight) => {
    const game = window.game;
    const snapshot = game.snapshot().euc;
    const camera = game.renderer.camera;
    const source = game.renderer.renderer.domElement;
    const heading = snapshot.headingY;
    // Render and copy in the same task: a presented WebGL drawing buffer may
    // read back empty on the next automation round trip.
    camera.position.set(
      snapshot.position.x - Math.cos(heading) * 4.2,
      snapshot.position.y + 1.45,
      snapshot.position.z + Math.sin(heading) * 4.2,
    );
    camera.lookAt(snapshot.position.x, snapshot.position.y + hipHeight, snapshot.position.z);
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
}

test('the held crouch is a crouch the player can see, from the chase camera', async (
  { page },
  testInfo,
) => {
  const errors = collectErrors(page);
  await boot(page);

  const uprightRig = await page.evaluate(() => {
    window.qa.resetRide();
    window.qa.drive([{ actions: { throttle: 1 }, steps: 120 * 4 }]);
    // Coasting rather than launching. The acceleration stance already drops the
    // hips and hinges the torso, so measuring the tuck against a launch would
    // credit the tuck with the launch.
    window.qa.drive([{ actions: { throttle: 0.06 }, steps: 120 * 2 }]);
    return window.qa.rigTransform();
  });
  const upright = { pose: await riderHead(page), rig: uprightRig };
  await testInfo.attach('m8_6-upright-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('m8_6-upright-side', {
    body: await sideView(page),
    contentType: 'image/png',
  });

  const tuckedRig = await page.evaluate(() => {
    window.qa.drive([{ actions: { throttle: 0.06, crouch: true }, steps: 120 }]);
    return window.qa.rigTransform();
  });
  const tucked = { pose: await riderHead(page), rig: tuckedRig };
  await testInfo.attach('m8_6-tucked-player-view', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await testInfo.attach('m8_6-tucked-side', {
    body: await sideView(page),
    contentType: 'image/png',
  });

  // -- What the player sees -------------------------------------------------
  // The head drops by a quarter of a metre *in the frame*, from the ordinary
  // gameplay camera. The pose this replaced moved it about nine centimetres
  // with the torso bolt upright, which is what "doesn't really crouch that
  // much" was describing.
  const headDrop = upright.pose.headAboveWheel - tucked.pose.headAboveWheel;
  expect(headDrop).toBeGreaterThan(0.25);
  // And the rider *folds* rather than merely sinking: the head travels a fifth
  // of a metre ahead of the hips along the direction of travel.
  expect(tucked.pose.headAheadOfHip - upright.pose.headAheadOfHip).toBeGreaterThan(0.2);

  // -- The joint decomposition ---------------------------------------------
  // Three articulations rather than one deeper hip drop. Checked apart, because
  // a rig that only lowered the hips would pass a silhouette test and still be
  // the pose the owner rejected.
  expect(upright.rig.pelvisY).toBeGreaterThan(RIDER.hipHeight - 0.05);
  expect(tucked.rig.pelvisY).toBeLessThan(RIDER.hipHeight - 0.2);
  expect(tucked.rig.pelvisPitch).toBeGreaterThan(
    upright.rig.pelvisPitch + RIDER_BLOCKOUT.tuckTorsoPitch * 0.9,
  );
  expect(tucked.rig.pelvisPitch).toBeLessThanOrEqual(RIDER_BLOCKOUT.tuckTorsoPitchMax + 1e-6);

  // Head up, which is the difference between a tuck and a bow. `neckPitch`
  // counter-rotates the torso's hinge, so the two nearly cancel.
  expect(tucked.rig.neckPitch).toBeLessThan(upright.rig.neckPitch - 0.3);
  expect(Math.abs(tucked.rig.pelvisPitch + tucked.rig.neckPitch)).toBeLessThan(0.3);

  // -- Letting go stands them back up --------------------------------------
  // `crouch: false` explicitly. A scripted action persists until it is
  // overridden — that is what makes `drive` scriptable at all — so omitting it
  // here would leave the rider tucked and quietly assert nothing.
  const released = await page.evaluate(() => {
    window.qa.drive([{ actions: { throttle: 0.06, crouch: false }, steps: 120 }]);
    return window.qa.rigTransform();
  });
  expect(released.pelvisY).toBeGreaterThan(RIDER.hipHeight - 0.06);
  expect(released.pelvisPitch).toBeLessThan(upright.rig.pelvisPitch + 0.05);

  expect(errors).toEqual([]);
});

test('a building out in the grass stops the rider instead of letting them through', async (
  { page },
  testInfo,
) => {
  const errors = collectErrors(page);
  await boot(page);

  const level = await page.evaluate(() => window.game.snapshot().level);
  expect(level.solids).toBeGreaterThan(100);
  expect(level.colliders).toBeLessThan(200);

  // Four different blocks, because one of them could be standing somewhere the
  // terrain happens to stop a rider anyway.
  const runs = await page.evaluate((indices) => {
    const blocks = (window.game.levelPlan.props ?? []).filter((prop) => prop.kind === 'building');
    return indices.map((index) => {
      const block = blocks[index % blocks.length];
      const size = block.size ?? { x: 12, y: 18, z: 12 };
      // Approach along world +Z toward the block's centre, from clear of its own
      // half-depth. The facing comes from the axis convention rather than from
      // eyeballing which way looks right: local +Z maps to world (sin h, cos h),
      // so a heading of zero drives along +Z (AGENTS.md, world conventions).
      const from = {
        x: block.position.x,
        y: block.position.y,
        z: block.position.z - size.z / 2 - 7,
      };
      window.game.placeRider(from, 0);
      window.qa.drive([{ actions: { throttle: 1 }, steps: 420 }]);
      const after = window.game.snapshot().euc;
      return {
        face: block.position.z - size.z / 2,
        startZ: from.z,
        endZ: after.position.z,
        speed: after.speed,
        state: after.state,
      };
    });
  }, [0, 7, 19, 41]);

  for (const run of runs) {
    // They set off — this is not a rider who never moved.
    expect(run.endZ - run.startZ).toBeGreaterThan(1);
    // And they stopped short of the wall rather than inside it. A few
    // centimetres of the wheel's own radius is margin; passing the face is not.
    expect(run.endZ).toBeLessThan(run.face + 0.05);
    // Hard against it: whatever speed they carried has gone into the wall.
    expect(Math.abs(run.speed)).toBeLessThan(2);
  }

  await testInfo.attach('m8_6-stopped-by-a-building', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});

test('trees, posts and fences are solid; a shrub drags instead (M15)', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page);

  // Asked of `game.sampleGround`, which is the controller's own sampler on the
  // QA bridge — so this is what the *simulation* believes, not what the plan
  // says. A solid reports its top face under its own origin. A shrub, twice
  // revised, now reports the ground it stands on: the 2026-08-10 pass made it
  // wall-solid and the forum answered "a collision with a bush now reacts
  // like a boulder", so M15 rerouted its box to `plan.softBodies`.
  const answers = await page.evaluate((kinds) => kinds.map((kind) => {
    const props = (window.game.levelPlan.props ?? []).filter((prop) => prop.kind === kind);
    if (props.length === 0) return null;
    const prop = props[Math.floor(props.length / 2)];
    return {
      kind,
      above: window.game.sampleGround(prop.position.x, prop.position.z).height - prop.position.y,
    };
  }), ['broadleafTree', 'conifer', 'lampPost', 'fenceBay', 'bench', 'litterBin']);

  for (const answer of answers) {
    expect(answer, 'a kind vanished from the level').not.toBeNull();
    if (answer === null) continue;
    expect(answer.above, `a ${answer.kind} is not solid`).toBeGreaterThan(0.5);
  }

  const shrubGround = await page.evaluate(() => {
    const bodies = window.game.levelPlan.softBodies ?? [];
    if (bodies.length === 0) return null;
    const body = bodies[Math.floor(bodies.length / 2)];
    return window.game.sampleGround(body.centre.x, body.centre.z).height
      - (body.centre.y - body.halfExtents.y);
  });
  expect(shrubGround, 'the level carries no soft bodies').not.toBeNull();
  expect(shrubGround ?? 99, 'a shrub box leaked into the sampler').toBeLessThan(0.5);

  // The report was about a ride, so ride it: drive at three separated soft
  // bodies along their local +Z. The wheel must pass out the far side having
  // shed real speed inside — a cushion, never a wall and never a crash.
  const runs = await page.evaluate(({ wheelRadius }) => {
    const all = window.game.levelPlan.softBodies ?? [];
    const solids = window.game.levelPlan.solids ?? [];
    // Shrubs grow in rows under trees; a fixture that drives *through* one
    // needs a bush whose run-out is not a tree trunk, or the crash-and-respawn
    // that follows measures the forest, not the foliage.
    const clear = all.filter((body) => !solids.some((solid) => (
      Math.hypot(solid.centre.x - body.centre.x, solid.centre.z - body.centre.z) < 9
    )));
    if (clear.length < 3) throw new Error(`only ${clear.length} clear soft bodies`);
    const picks = [clear[0], clear[Math.floor(clear.length / 2)], clear[clear.length - 1]];
    return picks.map((body) => {
      const forwardX = Math.sin(body.rotationY);
      const forwardZ = Math.cos(body.rotationY);
      const startLocalZ = -body.halfExtents.z - wheelRadius - 6;
      window.qa.placeRider(
        body.centre.x + forwardX * startLocalZ,
        body.centre.z + forwardZ * startLocalZ,
        body.rotationY,
      );
      window.game.setActions({ throttle: 1 });
      let entrySpeed = 0;
      let minInside = Number.POSITIVE_INFINITY;
      let peakWobble = 0;
      let sawFoliage = false;
      for (let i = 0; i < 400; i += 1) {
        window.game.advance(2);
        const euc = window.game.snapshot().euc;
        if (euc.inFoliage) {
          if (!sawFoliage) entrySpeed = Math.abs(euc.speed);
          sawFoliage = true;
          minInside = Math.min(minInside, Math.abs(euc.speed));
          peakWobble = Math.max(peakWobble, euc.wobbleEnergy);
        }
        const localZ = (euc.position.x - body.centre.x) * forwardX
          + (euc.position.z - body.centre.z) * forwardZ;
        if (localZ > body.halfExtents.z + 1) break;
      }
      window.game.clearActions();
      const after = window.game.snapshot().euc;
      return {
        sawFoliage,
        entrySpeed,
        minInside,
        peakWobble,
        crashes: after.crashes,
        endLocalZ: (after.position.x - body.centre.x) * forwardX
          + (after.position.z - body.centre.z) * forwardZ,
        farFace: body.halfExtents.z,
      };
    });
  }, { wheelRadius: WHEEL.tyreDiameter / 2 });

  for (const run of runs) {
    expect(run.sawFoliage, `the rider never entered the bush: ${JSON.stringify(run)}`).toBe(true);
    expect(run.endLocalZ, 'the bush stopped the wheel like a wall').toBeGreaterThan(run.farFace);
    expect(run.crashes, 'the bush manufactured a crash').toBe(0);
    expect(run.peakWobble, 'the soft foliage hazard injected no wobble').toBeGreaterThan(0);
    expect(
      run.entrySpeed - run.minInside,
      'the bush cost no speed at all — the drag is not reaching the wheel',
    ).toBeGreaterThan(0.3);
  }

  await testInfo.attach('forum-feedback-bush-drags-not-boulder', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(errors).toEqual([]);
});

test('lamp posts and every authored bollard family catch the machine beside the tyre', async (
  { page },
  testInfo,
) => {
  const errors = collectErrors(page);
  await boot(page);

  const runs = await page.evaluate(({ lampIndices, bollardIndices, pedalHalfSpan, wheelRadius }) => {
    const plan = window.game.levelPlan;
    const props = plan.props ?? [];
    const allColliders = [
      ...plan.segments.flatMap((segment) => segment.colliders),
      ...(plan.solids ?? []),
    ];
    const lamps = props.filter((prop) => prop.kind === 'lampPost');
    const caps = props.filter((prop) => prop.kind === 'bollardCap');

    const fixtures = [
      ...lampIndices.map((index) => ({ family: 'lamp', index, prop: lamps[index % lamps.length] })),
      ...bollardIndices.map((index) => ({ family: 'bollard', index, prop: caps[index % caps.length] })),
    ];

    return fixtures.map(({ family, index, prop }) => {
      const solid = allColliders.find((candidate) => (
        Math.abs(candidate.centre.x - prop.position.x) < 1e-6
        && Math.abs(candidate.centre.z - prop.position.z) < 1e-6
        && candidate.halfExtents.x <= 0.11
        && candidate.halfExtents.z <= 0.11
      ));
      if (solid === undefined) throw new Error(`${family} has no narrow solid`);

      const forwardX = Math.sin(solid.rotationY);
      const forwardZ = Math.cos(solid.rotationY);
      const leftX = Math.cos(solid.rotationY);
      const leftZ = -Math.sin(solid.rotationY);
      // Miss the authored box with the tyre centre by a wide margin while the
      // outer 30 mm of the pedal envelope overlaps it. This is the player's
      // report in one number: the old centre ray passed every one of these.
      const lateral = solid.halfExtents.x + pedalHalfSpan - 0.03;
      const startLocalZ = -solid.halfExtents.z - wheelRadius - 0.8;
      const start = {
        x: solid.centre.x + leftX * lateral + forwardX * startLocalZ,
        z: solid.centre.z + leftZ * lateral + forwardZ * startLocalZ,
      };
      const ground = window.game.sampleGround(start.x, start.z).height;
      window.game.placeRider({ x: start.x, y: ground, z: start.z }, solid.rotationY);
      window.qa.drive([{ actions: { throttle: 1 }, steps: 180 }]);
      const after = window.game.snapshot().euc;
      return {
        family,
        index,
        startLocalZ,
        endLocalZ: (after.position.x - solid.centre.x) * forwardX
          + (after.position.z - solid.centre.z) * forwardZ,
        face: -solid.halfExtents.z,
        blocked: after.blocked,
        speed: after.speed,
      };
    });
  }, {
    lampIndices: [0, 17, 39],
    // First and fifth are plaza posts; the last two are the traffic-island
    // family on the route, so this cannot go green on one authored cluster.
    bollardIndices: [0, 4, 8, 9],
    pedalHalfSpan: WHEEL.pedalSpan / 2,
    wheelRadius: WHEEL.tyreDiameter / 2,
  });

  for (const run of runs) {
    const label = `${run.family} ${run.index}: ${JSON.stringify(run)}`;
    expect(run.endLocalZ - run.startLocalZ, `${label} was never approached`).toBeGreaterThan(0.5);
    expect(run.endLocalZ, `${label} was passed through`).toBeLessThan(run.face + 0.05);
    expect(run.blocked, `${label} never made physical contact`).toBe(true);
    expect(Math.abs(run.speed), `${label} did not arrest the approach`).toBeLessThan(2);
  }

  await testInfo.attach('machine-width-post-collision', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});

test('the dressing does not make the chase camera duck', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // Five hundred new solids stand between the rider and the camera constantly.
  // Only buildings occlude, so the arm has to behave exactly as it did — easing
  // out with speed and pulling in only where the level has something to hide
  // behind. A camera collapsing on every trunk and lamp post shows up here as a
  // distance that never settles.
  const trace = await page.evaluate(() => {
    window.qa.resetRide();
    const distances: number[] = [];
    for (let index = 0; index < 60; index += 1) {
      window.qa.drive([{ actions: { throttle: 1 }, steps: 24 }]);
      distances.push(window.qa.cameraTransform().distanceToRider);
    }
    return distances;
  });

  expect(trace.length).toBe(60);
  // The arm eases 4.2 m to 6.0 m with speed. Count how often it collapses well
  // inside its parked length, which is what an obstruction pull-in looks like.
  expect(trace.filter((distance) => distance < 3.6).length).toBeLessThan(6);
  // And it spends most of the ride out at speed rather than sawing in and out.
  expect(trace.filter((distance) => distance > 4.5).length).toBeGreaterThan(trace.length / 2);

  expect(errors).toEqual([]);
});
