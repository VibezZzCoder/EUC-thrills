/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { PROVENANCE } from '../src/data/provenance.ts';

/**
 * The title's four place cards (`DESIGN.md` §9u; owner's 1.4.0 ride).
 *
 * The town, Wheelhouse Wharf, Foundry Yard and EUC NYC, each in its own colour
 * and none badged "New". Start ride (`data-menu="start"`) still rides whatever
 * is loaded — except while the Wharf or the yard is loaded, when it offers the
 * town (both stages have cards of their own). The stage cards
 * (`data-menu="start-place"`, `TITLE_STAGES` in `app/venues.ts`) ride their
 * stage in one press; the NYC card is a same-tab link to the spin-off. The fit
 * of every tier is held by the existing sweeps (`tests/m22.spec.ts`,
 * `tests/m25.spec.ts`, `tests/touch.spec.ts`), the pad walk by
 * `tests/m9.spec.ts` and the NYC card's journey by `tests/m40.spec.ts`; this
 * file is the cards' behaviour.
 */

const TITLE = '.euc-menu--title';
const start = (page: Page) => page.locator(`${TITLE} [data-menu="start"]`);
const stage = (page: Page, place: 'euclaude' | 'skatepark') => page.locator(`${TITLE} [data-menu="start-place"][data-place="${place}"]`);
const world = (page: Page) => page.evaluate(() => window.game.snapshot().world);
const state = (page: Page) => page.evaluate(() => window.game.snapshot().app.state);
const plan = (page: Page) => page.evaluate(() => window.game.levelPlan.recordWorldId ?? '');
const YARD_PLAN = /^foundry-yard-r\d+(~living-r1)?$/;
const WHARF_PLAN = /^euclaude-r\d+(~living-r1)?$/;
const toFreeRide = (page: Page) => page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide', undefined, { timeout: 90_000 });

test('four place cards in four colours: the town, the Wharf, the yard and EUC NYC', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, '');

  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });
  await expect(start(page)).toBeFocused();
  const cards = page.locator(`${TITLE} .euc-title__starts > .euc-start`);
  await expect(cards).toHaveCount(4);
  expect(await cards.locator('.euc-start__place').allTextContents())
    .toEqual(['The town', 'Wheelhouse Wharf', 'Foundry Yard', 'EUC NYC']);
  expect(await cards.locator('.euc-start__kicker').allTextContents())
    .toEqual(['Start ride', 'Jump island', 'Skate park', 'Spin-off']);
  // No "New" badge any more: the colours tell the cards apart.
  await expect(page.locator(`${TITLE} .euc-start__new, ${TITLE} [data-note="start-new"]`)).toHaveCount(0);
  const fills = await cards.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundImage));
  expect(new Set(fills).size, `four different colours: ${fills.join(' | ')}`).toBe(4);
  // Names are words; pictures are decoration.
  await expect(stage(page, 'skatepark')).toHaveAccessibleName(/Foundry Yard/);
  for (const svg of await cards.locator('svg').all()) expect(await svg.getAttribute('aria-hidden')).toBe('true');
  // EUC NYC leaves in this tab, to the github.io address only (§46).
  const nyc = cards.nth(3);
  expect(await nyc.evaluate((node) => node.tagName)).toBe('A');
  expect(await nyc.getAttribute('href')).toBe(PROVENANCE.spinOffUrl);
  expect(await nyc.getAttribute('target')).toBeNull();
  // Every card on one row at this window.
  const tops = await cards.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(errors).toEqual([]);
});

test('each stage card rides its stage, and from a stage the first card offers the town', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await bootToTitle(page, '');

  await stage(page, 'skatepark').click();
  await toFreeRide(page);
  expect((await world(page)).levelId).toBe('skatepark');
  expect(await plan(page)).toMatch(YARD_PLAN);
  expect(new URL(page.url()).searchParams.get('level')).toBe('skatepark');

  await page.evaluate(() => window.game.setAppState('title'));
  await expect(start(page).locator('[data-note="start-place"]')).toHaveText('The town');
  await expect(start(page)).toHaveAttribute('data-place', 'town');
  // The loaded stage's own card rides it with no world swap.
  await stage(page, 'skatepark').click();
  expect(await state(page)).toBe('freeRide');
  expect((await world(page)).levelId).toBe('skatepark');

  await page.evaluate(() => window.game.setAppState('title'));
  await stage(page, 'euclaude').click();
  await toFreeRide(page);
  expect((await world(page)).levelId).toBe('euclaude');
  expect(await plan(page)).toMatch(WHARF_PLAN);

  await page.evaluate(() => window.game.setAppState('title'));
  await expect(start(page).locator('[data-note="start-place"]')).toHaveText('The town');
  await start(page).click();
  await toFreeRide(page);
  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });

  // Back on the town, Start ride rides what is loaded, with no world swap.
  await page.evaluate(() => window.game.setAppState('title'));
  await expect(start(page)).not.toHaveAttribute('data-place', /.*/);
  await start(page).click();
  expect(await state(page)).toBe('freeRide');
  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });
  expect(errors).toEqual([]);
});

test('a fresh route is named by its seed on Start ride, and a forged card is refused', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=RIVER-42');
  await expect(start(page).locator('[data-note="start-place"]')).toHaveText('Fresh route · river-42');
  await expect(stage(page, 'euclaude').locator('[data-note="start-place"]')).toHaveText('Wheelhouse Wharf');
  await expect(stage(page, 'skatepark').locator('[data-note="start-place"]')).toHaveText('Foundry Yard');

  // A card naming a place the title does not offer does nothing.
  await stage(page, 'skatepark').evaluate((node) => { (node as HTMLElement).dataset.place = 'switchback'; });
  await page.locator(`${TITLE} [data-place="switchback"]`).click();
  expect(await state(page)).toBe('title');
  expect((await world(page)).levelId).toBe('generated');
  expect(errors).toEqual([]);
});
