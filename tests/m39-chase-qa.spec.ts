/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import type { RiderSeat } from '../src/app/seats.ts';
import type { PatrolPosts } from '../src/simulation/copPack.ts';
import { bootToTitle, collectErrors } from './harness.ts';

// Part P's integration seams that the flat-grid and chase-camera journeys
// do not exercise. No corpus sweep: one real town and one real hillside.
for (const human of [true, false]) test(`a held ${human ? 'human' : 'CPU'} cop stays put on a slope, then physics resumes after the hold`, async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=route-41');
  const result = await page.evaluate((human) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('CHASE.copHoldSeconds', 15);
    game.setCouchRide('chase');
    game.spawnRider(human ? 'cop' : 'trollina');
    game.startChase();
    // The existing m37 freeze fixture: actual pavement, steeper than the
    // rolling-resistance hold. Neutral input alone demonstrably rolls here.
    const hill = { x: 604.55, z: -160.72, heading: 3.66668 };
    const ground = game.sampleGround(hill.x, hill.z);
    const ahead = game.sampleGround(hill.x + Math.sin(hill.heading) * 2, hill.z + Math.cos(hill.heading) * 2);
    const point = { x: hill.x, y: ground.height, z: hill.z };
    if (human) game.placeRider(point, hill.heading, 1);
    else {
      game.copController!.reset({ position: point, headingY: hill.heading });
      game.copController!.writePose(game.copCurrent);
    }
    const position = () => human
      ? game.snapshotFor(1).euc.position
      : { x: game.copCurrent.x, z: game.copCurrent.z };
    game.clearActions();
    game.advance(361);
    const start = position();
    game.advance(360);
    const held = position();
    const heldFlag = game.snapshot().chase.room.pursuersHeld;
    game.advance(12 * 120);
    const released = position();
    game.advance(360);
    const after = position();
    return {
      surface: ground.surface, grade: (ground.height - ahead.height) / 2,
      heldFlag, heldMovement: Math.hypot(held.x - start.x, held.z - start.z),
      releasedMovement: Math.hypot(after.x - released.x, after.z - released.z),
    };
  }, human);
  expect(result.surface).toBe('pavement');
  expect(result.grade).toBeGreaterThan(0.03);
  expect(result.heldFlag).toBe(true);
  expect(result.heldMovement, 'Cop hold still integrates gravity').toBeLessThan(1e-6);
  expect(result.releasedMovement, 'positive control: the same hill must roll after release').toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});

test('patrol returns respect the selected orbit view in solo and couch panes', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=route-41');
  const rows = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const probe = game as unknown as {
      seats: RiderSeat[];
      patrolPosts: PatrolPosts;
      pursuers: { current: { x: number; z: number }; controller: { crashed: boolean } }[];
      returnToPost(pursuer: unknown, outlaw: number): boolean;
      placeCamera(seat: RiderSeat, view: number, alpha: number): void;
      goTo(state: 'title'): void;
    };
    const out = [];
    for (const couch of [false, true]) {
      if (couch) {
        probe.goTo('title');
        game.setCouchRide('chase');
        game.spawnSecondRider('trollina');
      }
      game.startChase();
      const post = probe.patrolPosts.posts[0];
      if (post === null) throw new Error('The fixture must offer a real patrol post');
      // Only one legal post is offered: 150 m behind the outlaw's travel,
      // inside the return visibility line. Orbit looks back onto it.
      probe.patrolPosts = { ...probe.patrolPosts, posts: [post] };
      const seat = probe.seats[couch ? 1 : 0];
      for (const rider of probe.seats) {
        Object.assign(rider.currentPose, { x: post.x, y: post.y, z: post.z + 150, headingY: 0, speed: 0 });
        Object.assign(rider.currentCamera, { yaw: 0 });
      }
      // The other cops cannot occupy the candidate and invalidate the probe.
      for (const pursuer of probe.pursuers) Object.assign(pursuer.current, { x: post.x + 500, z: post.z });
      Object.assign(seat.renderPose, seat.currentPose);
      seat.cameraMode = 'orbit';
      seat.orbitAngle = 0;
      seat.previousOrbitAngle = 0;
      probe.placeCamera(seat, couch ? 1 : 0, 1);
      const camera = game.renderer.cameraFor(couch ? 1 : 0);
      camera.updateMatrixWorld(true);
      const screen = camera.position.clone().set(post.x, post.y + 1, post.z).project(camera);
      const accepted = probe.returnToPost(probe.pursuers[1], 0);
      seat.cameraMode = 'chase';
      const offscreenAccepted = probe.returnToPost(probe.pursuers[1], 0);
      out.push({ couch, screen: { x: screen.x, y: screen.y, z: screen.z }, accepted, offscreenAccepted });
    }
    return out;
  });
  for (const row of rows) {
    expect(Math.abs(row.screen.x)).toBeLessThan(1);
    expect(Math.abs(row.screen.y)).toBeLessThan(1);
    expect(Math.abs(row.screen.z)).toBeLessThan(1);
    expect(row.accepted, `patrol materialized inside ${row.couch ? 'guest' : 'solo'} orbit view`).toBe(false);
    expect(row.offscreenAccepted, 'positive control: the same post behind the chase view must be usable').toBe(true);
  }
  expect(errors).toEqual([]);
});
