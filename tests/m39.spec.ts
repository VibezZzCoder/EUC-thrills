/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';

test('M39 curated launch, original city and typed/shared seed retain their identities', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, '');
  expect(await page.evaluate(() => window.game.snapshot().world)).toMatchObject({
    levelId: 'generated', generated: true, seed: 'euc',
  });
  expect(await page.evaluate(() => window.game.levelPlan.streetLoops?.length)).toBe(7);
  await page.locator('.euc-menu--title [data-menu="start"]').click();
  const ride = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().euc.position;
    game.setActions({ throttle: 0.4, steer: 0 });
    game.advance(240);
    game.setActions({ throttle: 0, steer: 0 });
    const after = game.snapshot().euc.position;
    return Math.hypot(after.x - before.x, after.z - before.z);
  });
  expect(ride).toBeGreaterThan(1);
  const shots = process.env.M39_SHOTS ?? 'test-results/m39';
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: join(shots, 'town-ring-euc.png') });
  const side = await page.evaluate(() => {
    const game = window.game;
    game.startChase();
    const street = game.levelPlan.segments.find((s) => s.id === 'city-residential-side-street')!;
    game.placeRider({ x: (street.entry.position.x + street.exit.position.x) / 2, y: street.entry.position.y,
      z: (street.entry.position.z + street.exit.position.z) / 2 }, street.entry.headingY);
    game.advance(2);
    const result = { offRoute: game.snapshot().chase.offRoute, render: game.snapshot().render,
      predicted: game.renderer.presentation()!.cost.frame.solo };
    return result;
  });
  await page.screenshot({ path: join(shots, 'town-ring-street.png') });
  await page.evaluate(() => window.game.setAppState('title'));
  expect(side.offRoute).toBeLessThan(1);
  expect(side.render.drawCalls).toBeLessThanOrEqual(side.predicted.drawCalls);
  expect(side.render.triangles).toBeLessThanOrEqual(side.predicted.triangles);
  expect(side.render.triangles).toBeGreaterThan(0);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('.euc-menu--routes [data-venue="slice"]').click();
  // 2026-10-04: a venue press swaps the world behind the loading cover; the
  // swap has landed when `pending` clears.
  await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
  const original = await page.evaluate(() => window.game.snapshot().world);
  expect(original.levelId).toBe('slice');
  expect(new URL(original.link).searchParams.get('level')).toBe('slice');
  await page.goto(original.link);
  await page.waitForFunction(() => window.game?.snapshot().world.levelId === 'slice');
  await expect(page.locator('#boot')).toBeHidden();
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('#euc-seed').fill('sweep-15');
  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  // 2026-10-04: the typed seed builds behind the loading cover, and a living
  // world's identity is its record key (`levelPlan.recordWorldId`); its plan id
  // is a composition hash.
  await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
  await expect.poll(() => page.evaluate(() => window.game.levelPlan.recordWorldId))
    .toBe('generated-r6-sweep-15~living-r1');
  const shared = await page.evaluate(() => window.game.snapshot().world.link);
  await page.goto(shared);
  await page.waitForFunction(() => window.game?.levelPlan?.recordWorldId === 'generated-r6-sweep-15~living-r1',
    undefined, { timeout: 90_000 });
  expect(errors).toEqual([]);
});


test('the town ring rides home up the return climb and into the plaza it left', async ({ page }) => {
  // M39 r6: the ring closes into the plaza's own entry socket. Ride the last
  // join, the return climb and on into the plaza with the real controller.
  const errors = collectErrors(page);
  await bootToTitle(page, '');
  const result = await page.evaluate(() => {
    const game = window.game;
    game.setAppState('freeRide');
    const ids = game.levelPlan.segments.map((s) => s.id);
    const climb = ids.find((id) => id.startsWith('return-climb@'))!;
    const home = ids.find((id) => id.startsWith('return-plaza@'))!;
    const before = ids[ids.indexOf(climb) - 1];
    const points = window.qa.routePoints([before, climb, home, 'plaza@0'], 3);
    return window.qa.followRoute(points, { lookAhead: 7, maxSteps: 7200, throttle: 0.3, maxSpeed: 9 });
  });
  expect(result.finished).toBe(true);
  expect(result.crashes).toBe(0);
  expect(errors).toEqual([]);
});
