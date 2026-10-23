/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * The 2026-10-22 title: two start cards (`DESIGN.md` §9u).
 *
 * The owner asked for the new stage to be as easy to find as the town the
 * game opens on, and for a player to be able to pick between the two. Start
 * ride (`data-menu="start"`) still rides whatever is loaded; the second card
 * (`data-menu="start-place"`) rides Wheelhouse Wharf in one press, and while
 * the Wharf is loaded it offers the town instead. The fit of every tier is
 * held by the existing sweeps (`tests/m22.spec.ts`, `tests/m25.spec.ts`,
 * `tests/touch.spec.ts`) and the pad walk by `tests/m9.spec.ts`; this file is
 * the cards' behaviour.
 */

const card = (page: Page, menu: 'start' | 'start-place') => page.locator(`.euc-menu--title [data-menu="${menu}"]`);
const world = (page: Page) => page.evaluate(() => window.game.snapshot().world);
const state = (page: Page) => page.evaluate(() => window.game.snapshot().app.state);

test('the second start card rides Wheelhouse Wharf, and from the Wharf offers the town back', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, '');

  // The town the game opens on, named rather than shown as its seed.
  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });
  await expect(card(page, 'start')).toBeFocused();
  await expect(card(page, 'start').locator('[data-note="start-place"]')).toHaveText('The town');
  await expect(card(page, 'start-place').locator('[data-note="start-place"]')).toHaveText('Wheelhouse Wharf');
  await expect(card(page, 'start-place').locator('[data-note="start-new"]')).toBeVisible();
  // Its name is its words; the pictures are decoration.
  await expect(card(page, 'start-place')).toHaveAccessibleName(/Wheelhouse Wharf/);
  expect(await card(page, 'start-place').locator('svg').getAttribute('aria-hidden')).toBe('true');

  await card(page, 'start-place').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide', undefined, { timeout: 90_000 });
  expect((await world(page)).levelId).toBe('euclaude');
  expect(new URL(page.url()).searchParams.get('level')).toBe('euclaude');

  await page.evaluate(() => window.game.setAppState('title'));
  await expect(card(page, 'start').locator('[data-note="start-place"]')).toHaveText('Wheelhouse Wharf');
  await expect(card(page, 'start-place').locator('[data-note="start-place"]')).toHaveText('The town');
  await expect(card(page, 'start-place').locator('[data-note="start-new"]')).toBeHidden();

  await card(page, 'start-place').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide', undefined, { timeout: 90_000 });
  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });

  // And Start ride rides what is loaded, with no world swap at all.
  await page.evaluate(() => window.game.setAppState('title'));
  await card(page, 'start').click();
  expect(await state(page)).toBe('freeRide');
  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });
  expect(errors).toEqual([]);
});

test('a fresh route is named by its seed on Start ride, and the second card still offers the Wharf', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=RIVER-42');
  await expect(card(page, 'start').locator('[data-note="start-place"]')).toHaveText('Fresh route · river-42');
  await expect(card(page, 'start-place').locator('[data-note="start-place"]')).toHaveText('Wheelhouse Wharf');
  expect(errors).toEqual([]);
});
