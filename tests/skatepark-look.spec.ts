/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';

/**
 * 1.4.0 — Foundry Yard's look, captured in game (`docs/PLANS.md` §51.5.9 C6,
 * §51.6). Eight viewpoints at desktop High and at a phone-sized Medium: the
 * start lane in Chase, the bowl, the mini, the east wall, the snake, the stair
 * block and euro gap, the Overlook view over the bowl and the Director view
 * high over the middle of the yard.
 *
 * **What a browser alone can say**: the coping pipe and the yard's wear reach
 * the screen, the console stays silent, and the installed world's spatial
 * batching costs the one tile §51.4.1 promised (+24 colour calls, no shadow
 * call). The price itself is held headlessly (`render/renderCost.test.ts`,
 * `level/skateparkLevel.test.ts`). Nothing here reads a frame interval
 * (`AGENTS.md`).
 */

const SHOTS = process.env.SKATEPARK_LOOK_SHOTS ?? 'test-results/skatepark/look-b4';

interface View {
  readonly name: string;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly camera: 'chase' | 'overlook' | 'director';
  readonly steps?: number;
}

const P = Math.PI;
const VIEWS: readonly View[] = [
  { name: 'start-lane', x: 100, z: 124, heading: P / 2, camera: 'chase' },
  { name: 'bowl', x: 104, z: 147.5, heading: 0, camera: 'chase' },
  { name: 'mini', x: 97.25, z: 116, heading: P, camera: 'chase' },
  { name: 'qp-east', x: 150, z: 118, heading: P / 2, camera: 'chase' },
  { name: 'snake', x: 137, z: 151, heading: -P / 2 + 0.45, camera: 'chase' },
  { name: 'stair-euro', x: 131, z: 114, heading: P + 0.3, camera: 'chase' },
  { name: 'overlook', x: 104, z: 149, heading: 0, camera: 'overlook', steps: 60 },
  { name: 'overhead', x: 122, z: 128, heading: P / 4, camera: 'director', steps: 60 },
];

async function captureViews(page: Page, suffix: string): Promise<void> {
  for (const view of VIEWS) {
    await page.evaluate(({ x, z, heading, camera, steps }) => {
      const game = window.game;
      game.placeRider({ x, y: 0, z }, heading);
      game.setActions({ throttle: 0, steer: 0 });
      game.setCameraMode(camera);
      game.advance(steps);
    }, { ...view, steps: view.steps ?? 30 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
    await page.screenshot({ path: join(SHOTS, `${view.name}-${suffix}.png`) });
  }
  await page.evaluate(() => { window.game.setCameraMode('chase'); window.game.advance(1); });
}

test('Foundry Yard: eight viewpoints at desktop High and phone Medium, silent console, one render tile', async ({ page }) => {
  test.setTimeout(240_000);
  await mkdir(SHOTS, { recursive: true });
  const errors = collectErrors(page);

  await page.setViewportSize({ width: 1280, height: 720 });
  await bootAtTier(page, 'level=skatepark', 'high', { freezeAtStart: true, options: { showFps: false } });
  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe('foundry-yard-r1');
  const report = await page.evaluate(() => {
    const presentation = window.game.renderer.presentation();
    return presentation === null ? null : {
      spatialBatching: presentation.spatialBatching,
      recipe: presentation.recipe?.id ?? null,
    };
  });
  await captureViews(page, 'high');

  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { window.game.setOptions({ quality: 'medium' }); window.game.advance(1); });
  await captureViews(page, 'phone-medium');

  await writeFile(join(SHOTS, 'report.json'), JSON.stringify({ report, errors }, null, 2));
  // One tile (§51.4.1): the spatial split adds colour calls only, never a shadow one.
  expect(report?.spatialBatching.shadowDrawDelta).toBe(0);
  expect(report?.spatialBatching.colourDrawDelta).toBe(24);
  expect(errors).toEqual([]);
});
