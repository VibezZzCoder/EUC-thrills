/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { PADDLE, TARGET } from '../src/data/tuning.ts';

/**
 * M14 — Knockabout, in a real browser.
 *
 * The milestone's gates are the owner's and cannot be automated: *does throwing
 * the paddle feel like swinging something, does a target read far enough ahead
 * to set the line up for it, is this a thing I would choose from the title
 * screen?* What **can** be automated is everything those questions rest on, and
 * two of the claims below can only be made here:
 *
 *   1. **Which side the paddle is on, in screen space.** This project has
 *      already shipped a steering sign that the entire headless suite agreed
 *      with, because every assertion was written in the same wrong frame. The
 *      check that works is to project the paddle and a rider-right probe
 *      through the *real* chase camera in the same frame and compare their NDC
 *      x — and there is no camera outside a browser.
 *   2. **That the drawn paddle and the swept paddle are the same paddle.** The
 *      hit test sweeps a point the swing arithmetic computes; the mesh is aimed
 *      at that point through an arm the stance solver placed. How far apart
 *      they end up is a fact about the rig, and the rig only exists here.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

const SEED = 'route-41';

test('a cold-start Knockabout choice survives Surprise me and starts the mode', async ({ page }) => {
  // Regression for the first-session path: the hand-built city has no targets,
  // so Knockabout sends the player through Fresh route. That detour must keep
  // the mode they chose rather than quietly degrading into a generic route
  // chooser that offers only free ride and Time trial.
  const errors = collectErrors(page);
  await bootToTitle(page);

  await page.locator('.euc-menu--title [data-menu="knockabout"]').click();
  await expect(page.locator('.euc-menu--routes')).toBeVisible();
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toContainText('Knockabout needs');
  await expect(page.locator('.euc-menu--routes [data-menu="ride-route"]'))
    .toHaveText('Play Knockabout on this route');
  await expect(page.locator('.euc-menu--routes [data-menu="trial-route"]')).toBeHidden();

  // `Math.random() === 0` spells amber-arch; the generator fixture confirms it
  // builds and carries targets. Pinning it keeps this state-machine regression
  // deterministic without bypassing the real Surprise me path.
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await page.locator('.euc-menu--routes [data-menu="surprise"]').click();

  await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state))
    .toBe('knockabout');
  const snapshot = await page.evaluate(() => window.game.snapshot());
  expect(snapshot.world).toMatchObject({ generated: true, seed: 'amber-arch' });
  expect(snapshot.targets.total).toBeGreaterThan(0);
  expect(snapshot.hud.knockabout).not.toBe('');
  expect(errors).toEqual([]);
});

/** Boot into Knockabout on a seed the census says carries plenty of targets. */
async function bootKnockabout(page: import('@playwright/test').Page): Promise<void> {
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    window.game.startKnockabout();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  // The state changes on the fixed step; the HUD view is published on the
  // following render. Wait for the player-visible lane rather than racing that
  // frame and intermittently reading the previous state's empty value.
  await page.waitForFunction(() => window.game.snapshot().hud.knockabout !== '');
}

/**
 * Park the rider a little short of one target, on the side its pad reaches
 * toward, and swing when it comes into range.
 *
 * Returns what the run did. `index` picks which target, so a spec can use one
 * the previous test has not already knocked down.
 */
async function swingAt(
  page: import('@playwright/test').Page,
  index: number,
): Promise<{ struck: number; swings: number; hud: string; freezeMidSwing: boolean }> {
  return page.evaluate(async ({ target }) => {
    const game = window.game;
    const plan = game.buildLevel('generated', 'route-41');
    const stand = (plan.targets ?? [])[target];
    // Inboard of the pad and short of it, riding +Z: the pad is then on the
    // rider's right, which is where the swing goes.
    const start = { x: stand.centre.x + 1.15, z: stand.centre.z - 6 };
    const ground = game.sampleGround(start.x, start.z);
    game.placeRider({ x: start.x, y: ground.height, z: start.z }, 0);
    game.clearActions();

    let swings = 0;
    for (let step = 0; step < 600; step += 1) {
      const before = game.snapshot();
      const ahead = stand.centre.z - before.euc.position.z;
      if (before.paddle.phase === 'idle' && ahead < 1.2 && ahead > 0) {
        game.setActions({ swing: true });
        swings += 1;
      }
      game.setActions({ throttle: 0.5 });
      game.advance(1);
      const after = game.snapshot();
      if (after.targets.struck > 0) {
        return {
          struck: after.targets.struck,
          swings,
          hud: after.hud.knockabout,
          freezeMidSwing: false,
        };
      }
    }
    const end = game.snapshot();
    return { struck: end.targets.struck, swings, hud: end.hud.knockabout, freezeMidSwing: false };
  }, { target: index });
}

test('the world carries targets, the mode starts, and a swing knocks one down', async ({ page }) => {
  const errors = collectErrors(page);
  await bootKnockabout(page);

  const world = await page.evaluate(() => {
    const snapshot = window.game.snapshot();
    return {
      levelId: snapshot.levelPlanId,
      targets: snapshot.level.targets,
      equipped: snapshot.paddle.equipped,
      hud: snapshot.hud.knockabout,
    };
  });

  // The level-identity revision §13 q16 asked for, spent at M14.
  expect(world.levelId).toBe(`generated-r3-${SEED}`);
  expect(world.targets).toBeGreaterThan(4);
  expect(world.equipped).toBe(true);
  // "In the mode, having hit nothing yet" draws a lane; it is not the same as
  // "not in the mode", which draws none.
  expect(world.hud).toBe(`0 / ${world.targets}`);

  const run = await swingAt(page, 0);
  expect(run.struck).toBe(1);
  expect(run.swings).toBe(1);
  expect(run.hud).toBe(`1 / ${world.targets}`);
  expect(errors).toEqual([]);
});

test('the swing is claimed exactly once per press', async ({ page }) => {
  await bootKnockabout(page);
  // The `consumed` counter is where silent failure #4 would show: a
  // `PressedAction` missing its zero initialiser makes `consumed[action] += 1`
  // yield NaN, which the harness's `?? 0` does not catch.
  const claims = await page.evaluate(() => window.qa.fireOnce('swing', 12));
  expect(claims.after - claims.before).toBe(1);
  expect(claims.afterMoreSteps).toBe(claims.after);
  expect(Number.isNaN(claims.after)).toBe(false);
});

test('the paddle is drawn on the rider’s right — in screen space', async ({ page }) => {
  await bootKnockabout(page);

  const projected = await page.evaluate(async () => {
    const game = window.game;
    const plan = game.buildLevel('generated', 'route-41');
    const stand = (plan.targets ?? [])[1];
    const start = { x: stand.centre.x + 1.15, z: stand.centre.z - 8 };
    const ground = game.sampleGround(start.x, start.z);
    game.placeRider({ x: start.x, y: ground.height, z: start.z }, 0);
    game.clearActions();

    // Freeze inside the strike window, where the claim is about the pose the
    // player is actually looking at when a hit happens.
    let frozen = null;
    for (let step = 0; step < 900; step += 1) {
      if (step === 40) game.setActions({ swing: true });
      game.setActions({ throttle: 0.18 });
      game.advance(1);
      const snapshot = game.snapshot();
      if (snapshot.paddle.phase === 'active') { frozen = snapshot; break; }
    }
    if (frozen === null) return null;

    const renderer = game.renderer as unknown as {
      camera: { updateMatrixWorld(): void };
      scene: { getObjectByName(name: string): unknown };
    };
    const camera = renderer.camera as never;
    const paddle = renderer.scene.getObjectByName('rider-paddle') as never;
    if (paddle === undefined || paddle === null) return null;

    type Vec = {
      set(x: number, y: number, z: number): Vec;
      clone(): Vec;
      project(camera: never): Vec;
      applyMatrix4(matrix: never): Vec;
      distanceTo(other: Vec): number;
      x: number; y: number; z: number;
    };
    const group = paddle as unknown as {
      position: { constructor: new (x: number, y: number, z: number) => Vec };
      matrixWorld: never;
      updateWorldMatrix(parents: boolean, children: boolean): void;
      visible: boolean;
    };
    group.updateWorldMatrix(true, true);
    const V = group.position.constructor;

    // The drawn head: the far end of the shaft, in the group's own +Z.
    const shaft = 1.40 * 0.62;
    const drawn = new V(0, 0, shaft).applyMatrix4(group.matrixWorld);
    const simHead = new V(frozen.paddle.head.x, frozen.paddle.head.y, frozen.paddle.head.z);

    // A probe one metre to the rider's RIGHT. +X is the rider's LEFT, so their
    // right is −X — the convention this whole check exists to police.
    const heading = frozen.euc.headingY;
    const right = new V(
      frozen.euc.position.x - Math.cos(heading),
      frozen.euc.position.y + 1,
      frozen.euc.position.z + Math.sin(heading),
    );
    const centre = new V(frozen.euc.position.x, frozen.euc.position.y + 1, frozen.euc.position.z);
    const ndcX = (point: Vec): number => point.clone().project(camera).x;

    return {
      visible: group.visible,
      drawnNdcX: ndcX(drawn),
      rightNdcX: ndcX(right),
      centreNdcX: ndcX(centre),
      gap: drawn.distanceTo(simHead),
    };
  });

  expect(projected).not.toBeNull();
  const shot = projected as NonNullable<typeof projected>;
  expect(shot.visible).toBe(true);

  // The rider's right is on one side of the screen; the paddle is on that same
  // side, and further out than the probe. A world-space test cannot make this
  // claim, because a test written from the wrong frame agrees with the bug.
  const rightIsPositive = shot.rightNdcX > shot.centreNdcX;
  expect(rightIsPositive
    ? shot.drawnNdcX > shot.rightNdcX
    : shot.drawnNdcX < shot.rightNdcX).toBe(true);

  // And the drawn paddle is the swept paddle. The arm does not reach exactly
  // where the swing wanted the grip, so this is a tolerance rather than an
  // equality — but it has to stay far inside the strike radius, or the player
  // sees a miss the simulation scored and vice versa.
  expect(shot.gap).toBeLessThan((PADDLE.headRadius + TARGET.discRadius) * 0.5);
});

test('riding into a target knocks it out, at a bush’s price — never a crash', async ({ page }) => {
  await bootKnockabout(page);
  const outcome = await page.evaluate(({ bodyKnockRadius }) => {
    const game = window.game;
    const plan = game.buildLevel('generated', 'route-41');
    const stand = (plan.targets ?? [])[3];
    // `TargetField.eachNear` is only a broadphase: its AABB deliberately
    // returns the corner of the square around the two circular bodies. Prove
    // the body-knock owner applies the exact plan-distance test rather than
    // treating every broadphase candidate as contact.
    const combinedRadius = bodyKnockRadius + stand.radius;
    const nearMiss = {
      x: stand.centre.x + combinedRadius * 0.9,
      z: stand.centre.z + combinedRadius * 0.9,
    };
    const nearMissGround = game.sampleGround(nearMiss.x, nearMiss.z);
    game.placeRider({ x: nearMiss.x, y: nearMissGround.height, z: nearMiss.z }, 0);
    game.clearActions();
    game.advance(1);
    const diagonalNearMissStruck = game.snapshot().targets.struck;

    // Straight at the pad, no swing. The owner's 2026-08-12 ride: the paddle
    // asked for more precision than the mode is about, so body contact is the
    // second way a target goes down. A target is still never a collider — the
    // wheel is not stopped — but the knock costs the rider a bush: one soft
    // wobble plus a speed cost, and no crash at any speed.
    const start = { x: stand.centre.x, z: stand.centre.z - 8 };
    const ground = game.sampleGround(start.x, start.z);
    game.placeRider({ x: start.x, y: ground.height, z: start.z }, 0);
    game.clearActions();
    game.setActions({ throttle: 0.7 });

    let speedBefore = 0;
    let speedAfter = null;
    for (let step = 0; step < 400; step += 1) {
      const wasStruck = game.snapshot().targets.struck;
      game.advance(1);
      const snapshot = game.snapshot();
      if (speedAfter === null && snapshot.targets.struck > wasStruck) {
        speedAfter = snapshot.euc.speed;
        break;
      }
      speedBefore = snapshot.euc.speed;
    }
    game.setActions({ throttle: 0.7 });
    game.advance(300);
    const snapshot = game.snapshot();
    return {
      diagonalNearMissStruck,
      struck: snapshot.targets.struck,
      hud: snapshot.hud.knockabout,
      speedBefore,
      speedAfter,
      passed: snapshot.euc.position.z > stand.centre.z,
      crashed: snapshot.euc.crashed,
      blocked: snapshot.euc.blocked,
    };
  }, { bodyKnockRadius: TARGET.bodyKnockRadius });

  expect(outcome.diagonalNearMissStruck).toBe(0);
  expect(outcome.struck).toBe(1);
  expect(outcome.crashed).toBe(false);
  expect(outcome.blocked).toBe(false);
  expect(outcome.passed).toBe(true);
  // The bush's price: the knock took real speed off on the step it landed.
  expect(outcome.speedAfter).not.toBeNull();
  expect(outcome.speedAfter as number).toBeLessThan(outcome.speedBefore - 1);
});

test('a struck target stays down across a level rebuild', async ({ page }) => {
  await bootKnockabout(page);
  await swingAt(page, 0);

  const kept = await page.evaluate(() => {
    const game = window.game;
    const before = game.snapshot().targets.struck;
    // The renderer throws the instanced family away and builds a new one on
    // every `setLevel`. Without the struck set living on `Renderer`, a rebuild
    // mid-run repaints every struck target standing while the score stays put.
    const renderer = game.renderer as unknown as { setLevel(plan: unknown): unknown };
    renderer.setLevel(game.levelPlan);
    const family = (game.renderer as unknown as {
      targets: { struck(): readonly string[] } | null;
    }).targets;
    return { before, after: game.snapshot().targets.struck, repainted: family?.struck().length ?? -1 };
  });

  expect(kept.before).toBe(1);
  expect(kept.after).toBe(1);
  expect(kept.repainted).toBe(1);
});

test('free ride carries no paddle and draws no score lane', async ({ page }) => {
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    window.game.setAppState('freeRide');
  });
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);

  const free = await page.evaluate(() => {
    const game = window.game;
    game.setActions({ swing: true });
    game.advance(60);
    const snapshot = game.snapshot();
    return {
      equipped: snapshot.paddle.equipped,
      phase: snapshot.paddle.phase,
      hud: snapshot.hud.knockabout,
      struck: snapshot.targets.struck,
      targets: snapshot.level.targets,
    };
  });

  // The mode decides who carries a paddle. The targets are still in the world —
  // they are level data — but nothing is swinging at them.
  expect(free.targets).toBeGreaterThan(4);
  expect(free.equipped).toBe(false);
  expect(free.phase).toBe('idle');
  expect(free.hud).toBe('');
  expect(free.struck).toBe(0);
});
