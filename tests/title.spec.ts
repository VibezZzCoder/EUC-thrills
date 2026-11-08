/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { PROVENANCE } from '../src/data/provenance.ts';

/**
 * The title's three place cards and its "Other cities" row (`DESIGN.md` §9u,
 * §9v; owner's 1.4.0 ride, split into two groups at 1.4.1).
 *
 * Row 1 is the town, Wheelhouse Wharf and Foundry Yard, each in its own colour
 * and none badged "New". Start ride (`data-menu="start"`) still rides whatever
 * is loaded — except while the Wharf or the yard is loaded, when it offers the
 * town (both stages have cards of their own). The stage cards
 * (`data-menu="start-place"`, `TITLE_STAGES` in `app/venues.ts`) ride their
 * stage in one press. Under them, "Other cities": EUC NYC and EUC SF, same-tab
 * links to the spin-offs, read from `PROVENANCE.spinOffs`. The fit of every
 * tier is held by the sweep at the end of this file and by the existing sweeps
 * (`tests/m22.spec.ts`, `tests/m25.spec.ts`, `tests/touch.spec.ts`), the pad
 * walk by `tests/m9.spec.ts` and the NYC card's journey by `tests/m40.spec.ts`.
 */

const TITLE = '.euc-menu--title';
const start = (page: Page) => page.locator(`${TITLE} [data-menu="start"]`);
const menuMode = (page: Page, menu: string) => page.locator(`${TITLE} .euc-mode[data-menu="${menu}"]`);
const stage = (page: Page, place: 'euclaude' | 'skatepark') => page.locator(`${TITLE} [data-menu="start-place"][data-place="${place}"]`);
const world = (page: Page) => page.evaluate(() => window.game.snapshot().world);
const state = (page: Page) => page.evaluate(() => window.game.snapshot().app.state);
const plan = (page: Page) => page.evaluate(() => window.game.levelPlan.recordWorldId ?? '');
const YARD_PLAN = /^foundry-yard-r\d+(~living-r1)?$/;
const WHARF_PLAN = /^euclaude-r\d+(~living-r1)?$/;
const toFreeRide = (page: Page) => page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide', undefined, { timeout: 90_000 });

test('three place cards, "Other cities" with EUC NYC and EUC SF, then "Ways to ride" with an accent per mode', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, '');

  expect(await world(page)).toMatchObject({ levelId: 'generated', seed: 'euc' });
  await expect(start(page)).toBeFocused();
  const places = page.locator(`${TITLE} .euc-title__starts > .euc-start`);
  await expect(places).toHaveCount(3);
  expect(await places.locator('.euc-start__place').allTextContents())
    .toEqual(['The town', 'Wheelhouse Wharf', 'Foundry Yard']);
  expect(await places.locator('.euc-start__kicker').allTextContents())
    .toEqual(['Start ride', 'Jump island', 'Skate park']);
  // No "New" badge any more: the colours tell the cards apart.
  await expect(page.locator(`${TITLE} .euc-start__new, ${TITLE} [data-note="start-new"]`)).toHaveCount(0);
  // Names are words; pictures are decoration.
  await expect(stage(page, 'skatepark')).toHaveAccessibleName(/Foundry Yard/);

  const group = page.locator(`${TITLE} .euc-title__cities`);
  await expect(group).toHaveAttribute('role', 'group');
  await expect(group).toHaveAccessibleName('Other cities');
  await expect(group.locator('.euc-title__cities-head')).toHaveText('Other cities');
  const cities = group.locator('a.euc-start--out');
  await expect(cities).toHaveCount(2);
  expect(await cities.locator('.euc-start__place').allTextContents()).toEqual(['EUC NYC', 'EUC SF']);
  // Each leaves in this tab, to its github.io address only (§46), as a pad stop.
  const expected = [
    ['nyc', 'https://vibezzzcoder.github.io/euc-nyc/'],
    ['sf', 'https://vibezzzcoder.github.io/euc-sanfrancisco/'],
  ];
  expect(PROVENANCE.spinOffs.map((spinOff) => [spinOff.id, spinOff.url])).toEqual(expected);
  for (const [index, [id, url]] of expected.entries()) {
    const card = cities.nth(index);
    await expect(card).toHaveClass(new RegExp(`euc-start--${id}`));
    expect(await card.getAttribute('href')).toBe(url);
    expect(await card.getAttribute('target')).toBeNull();
    expect(await card.getAttribute('rel')).toBe('noopener');
    for (const hook of ['data-menu', 'data-outbound', 'tabindex']) expect(await card.getAttribute(hook)).toBeNull();
  }

  const cards = page.locator(`${TITLE} .euc-start`);
  for (const svg of await cards.locator('svg').all()) expect(await svg.getAttribute('aria-hidden')).toBe('true');
  const fills = await cards.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundImage));
  expect(new Set(fills).size, `five different colours: ${fills.join(' | ')}`).toBe(5);
  // At this window: the three places on one row, the two cities side by side under them.
  const tops = async (locator: typeof cards) => locator.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  const placeTops = await tops(places);
  const cityTops = await tops(cities);
  expect(new Set(placeTops).size).toBe(1);
  expect(new Set(cityTops).size).toBe(1);
  expect(cityTops[0]).toBeGreaterThan(placeTops[0]);
  // "Ways to ride": a heading names the modes' group, and each mode has its own
  // accent — an aria-hidden icon before its name and an edge in the same colour.
  const ways = page.locator(`${TITLE} .euc-title__modes`);
  await expect(page.locator(`${TITLE} .euc-title__ways-head`)).toHaveText('Ways to ride');
  await expect(page.locator(`${TITLE} .euc-title__ways-head`)).toBeVisible();
  await expect(ways).toHaveAccessibleName('Ways to ride');
  const modes = ways.locator('.euc-mode:not([hidden])');
  const accents = await modes.evaluateAll((nodes) => nodes.map((node) => {
    const icon = node.querySelector('.euc-mode__icon');
    return {
      menu: (node as HTMLElement).dataset.menu,
      icon: icon !== null && icon.getAttribute('aria-hidden') === 'true',
      stroke: icon === null ? '' : getComputedStyle(icon).stroke,
      edge: getComputedStyle(node).boxShadow,
    };
  }));
  expect(accents.length).toBeGreaterThanOrEqual(6);
  for (const accent of accents) {
    expect(accent.icon, `${accent.menu} has no hidden icon`).toBe(true);
    expect(accent.edge, `${accent.menu} has no accent edge`).toContain(accent.stroke);
  }
  expect(new Set(accents.map((accent) => accent.stroke)).size, 'every mode its own colour').toBe(accents.length);
  await expect(menuMode(page, 'chase')).toHaveAccessibleName(/^Police chase/);
  // Settings and Ultra stay plain: utilities, not ways to play.
  await expect(page.locator(`${TITLE} [data-menu="settings"] .euc-mode__icon`)).toHaveCount(0);

  // Keyboard order: the places, then the cities, then the modes.
  const order = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.euc-menu--title .euc-start, .euc-menu--title .euc-mode')]
    .slice(0, 6).map((node) => node.querySelector('.euc-start__place')?.textContent ?? node.dataset.menu));
  expect(order).toEqual(['The town', 'Wheelhouse Wharf', 'Foundry Yard', 'EUC NYC', 'EUC SF', 'couch']);
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

/**
 * **The fit, measured at 1.4.1** (`DESIGN.md` §9u addendum). At every sweep
 * size: nothing to scroll, every card inside the viewport, every card's words
 * inside its own box, and the layout the stylesheet's measured breakpoints
 * promise — three places across from 437 px wide (two and the yard under
 * them below), the two cities side by side everywhere, and the cities as
 * one-line chips at the compact tier and the short windows just above it,
 * and the "Ways to ride" heading only where it fits.
 * Run on a fine pointer here and on a coarse one below (44 px floors).
 */
const FIT_SIZES: readonly { width: number; height: number }[] = ([
  [360, 800], [375, 667], [390, 844], [412, 915], [320, 568], [430, 932],
  [667, 375], [844, 390], [740, 360], [740, 481], [1280, 485], [1000, 700], [1000, 560],
  [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1600, 500], [1920, 1080], [2560, 1440],
  [1000, 552], [1000, 553], [1000, 576], [1000, 577], [360, 776], [360, 777], [1000, 640], [1000, 641], [1000, 657],
] as [number, number][]).map(([width, height]) => ({ width, height }));

async function sweepTitleFit(page: Page, coarse: boolean): Promise<void> {
  for (const size of FIT_SIZES) {
    await page.setViewportSize(size);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
    const where = `${size.width}x${size.height}${coarse ? ' (coarse)' : ''}`;
    const facts = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.euc-menu--title')!;
      const cards = [...root.querySelectorAll<HTMLElement>('.euc-start')];
      const outside: string[] = [];
      const spills: string[] = [];
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const name = card.querySelector('.euc-start__place')?.textContent ?? '?';
        if (box.top < -0.5 || box.bottom > innerHeight + 0.5) outside.push(name);
        const style = getComputedStyle(card);
        const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        for (const piece of card.querySelectorAll('.euc-start__kicker, .euc-start__place, .euc-start__note')) {
          if (getComputedStyle(piece).display === 'none') continue;
          const range = document.createRange();
          range.selectNodeContents(piece);
          for (const rect of range.getClientRects()) {
            const past = Math.max(left - rect.left, rect.right - right);
            if (rect.width > 0 && past > 0.5) spills.push(`"${piece.textContent?.trim()}" by ${past.toFixed(1)}px`);
          }
        }
      }
      const rowsOf = (selector: string) => new Set([...root.querySelectorAll<HTMLElement>(selector)]
        .map((node) => Math.round(node.getBoundingClientRect().top))).size;
      const sf = root.querySelector<HTMLElement>('.euc-start--sf')!;
      return {
        overflow: root.scrollHeight - root.clientHeight,
        outside,
        spills,
        placeRows: rowsOf('.euc-title__starts > .euc-start'),
        cityRows: rowsOf('.euc-start--out'),
        chip: getComputedStyle(sf.querySelector('.euc-start__art')!).display === 'none',
        waysHead: getComputedStyle(root.querySelector('.euc-title__ways-head')!).display !== 'none',
        minHeight: Math.min(...cards.map((card) => card.getBoundingClientRect().height)),
      };
    });
    expect(facts.overflow, `the title has ${facts.overflow}px to scroll at ${where}`).toBeLessThanOrEqual(1);
    expect(facts.outside, `cards outside the viewport at ${where}`).toEqual([]);
    expect(facts.spills, `words outside their card at ${where}`).toEqual([]);
    expect(facts.placeRows, `place rows at ${where}`).toBe(size.width >= 437 ? 1 : 2);
    expect(facts.cityRows, `the cities left one row at ${where}`).toBe(1);
    const shortWindow = size.height <= (coarse ? 556 : 536);
    const shortPhone = size.width <= 544 && size.height <= 752;
    expect(facts.chip, `city chips at ${where}`).toBe(shortWindow || shortPhone);
    // "Ways to ride" goes a step before the chips do (about 19 px of heading).
    // It also goes just above 640 px, where the mode notes come back.
    const headless = size.height <= (coarse ? 576 : 552) || (size.width <= 544 && size.height <= 776)
      || (size.height > 640 && size.height <= 656);
    expect(facts.waysHead, `the "Ways to ride" heading at ${where}`).toBe(!headless);
    if (coarse) expect(facts.minHeight, `a card under 44 px at ${where}`).toBeGreaterThanOrEqual(43.5);
  }
}

test('the two groups fit every sweep size with nothing to scroll, and the cities become chips when short (1.4.1)', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, '');
  await sweepTitleFit(page, false);
  // The compact tier is one line per city: kicker and name, no picture, no note.
  await page.setViewportSize({ width: 844, height: 390 });
  const sf = page.locator(`${TITLE} .euc-start--sf`);
  await expect(sf.locator('.euc-start__kicker')).toBeVisible();
  await expect(sf.locator('.euc-start__place')).toBeVisible();
  await expect(sf.locator('.euc-start__art')).toBeHidden();
  await expect(sf.locator('.euc-start__note')).toBeHidden();
  const lines = await sf.evaluate((node) => {
    const kicker = node.querySelector('.euc-start__kicker')!.getBoundingClientRect();
    const place = node.querySelector('.euc-start__place')!.getBoundingClientRect();
    return { sameLine: kicker.top < place.bottom && place.top < kicker.bottom, height: node.getBoundingClientRect().height };
  });
  expect(lines.sameLine, 'the chip is not one line').toBe(true);
  expect(lines.height).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test.describe('the title fit on a coarse pointer', () => {
  test.use({ hasTouch: true });
  test('every sweep size, with the 44 px floor on every card (1.4.1)', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page, '');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'not a coarse pointer').toBe(true);
    await sweepTitleFit(page, true);
    expect(errors).toEqual([]);
  });
});

/**
 * Track Day's two tracks are place cards too (1.4.1): BelVar Circuit in Track
 * Day's green with the chequered flag, Switchback Park in hillside ochre with
 * its pines, every word shown (the title's height tiers do not reach this
 * panel), stacked one per row at 434 px and narrower and side by side from
 * 435 (measured). A pad walks them: Right crosses, Down reaches Back.
 */
test('Track Day offers its two tracks as coloured place cards, and a pad walks them (1.4.1)', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const pad = {
      index: 0, id: 'fake standard pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { fakePad: typeof pad }).fakePad = pad;
    navigator.getGamepads = () => [pad, null, null, null] as never;
  });
  await bootToTitle(page, '');
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
  await page.locator(`${TITLE} [data-menu="track-day"]`).click();
  const panel = page.locator('.euc-menu--tracks');
  const cards = panel.locator('[data-menu="lap-venue"]');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveClass(/euc-start/);
  expect(await cards.locator('.euc-start__place').allTextContents()).toEqual(['BelVar Circuit', 'Switchback Park']);
  expect(await cards.locator('.euc-start__kicker').allTextContents()).toEqual(['Paved circuit', 'Hillside jump park']);
  expect(await cards.locator('.euc-start__note').allTextContents())
    .toEqual(['Flowing corners and fast laps', 'Drops, jumps and tight turns']);
  for (const svg of await cards.locator('svg').all()) expect(await svg.getAttribute('aria-hidden')).toBe('true');
  const fills = await cards.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundImage));
  expect(new Set(fills).size, `two colours: ${fills.join(' | ')}`).toBe(2);
  expect(fills.some((fill) => fill.includes('59, 139, 255')), 'a track card kept the town blue').toBe(false);

  for (const size of [
    { width: 320, height: 568, across: 1 }, { width: 390, height: 844, across: 1 }, { width: 434, height: 800, across: 1 },
    { width: 435, height: 800, across: 2 }, { width: 844, height: 390, across: 2 }, { width: 1000, height: 520, across: 2 },
    { width: 1440, height: 900, across: 2 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(null)))));
    const where = `${size.width}x${size.height}`;
    const facts = await panel.evaluate((root) => {
      const nodes = [...root.querySelectorAll<HTMLElement>('[data-menu="lap-venue"]')];
      return {
        scroll: root.scrollHeight - root.clientHeight,
        rows: new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size,
        heights: nodes.map((node) => node.getBoundingClientRect().height),
        notes: nodes.every((node) => getComputedStyle(node.querySelector('.euc-start__note')!).display !== 'none'),
        onScreen: [...root.querySelectorAll('button')].every((node) => {
          const box = node.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && box.height >= 44;
        }),
      };
    });
    expect(facts.scroll, `the panel scrolls at ${where}`).toBeLessThanOrEqual(1);
    expect(facts.rows, `track rows at ${where}`).toBe(size.across === 2 ? 1 : 2);
    expect(facts.notes, `a note is hidden at ${where}`).toBe(true);
    expect(facts.onScreen, `a control is off screen or under 44 px at ${where}`).toBe(true);
    // One line of kicker beside the picture: no card grows past its roomy height.
    for (const height of facts.heights) expect(height, `a card grew at ${where}`).toBeLessThan(112);
  }

  await page.setViewportSize({ width: 1000, height: 700 });
  const pulse = async (button: number): Promise<void> => page.evaluate(async (index) => {
    const pad = (window as unknown as { fakePad: { buttons: { pressed: boolean; value: number }[] } }).fakePad;
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    pad.buttons[index].pressed = true;
    pad.buttons[index].value = 1;
    await frame();
    pad.buttons[index].pressed = false;
    pad.buttons[index].value = 0;
    await frame();
  }, button);
  const venue = (id: string) => panel.locator(`[data-venue="${id}"]`);
  await venue('track').focus();
  await pulse(15);
  await expect(venue('switchback')).toBeFocused();
  await pulse(14);
  await expect(venue('track')).toBeFocused();
  await pulse(13);
  await expect(panel.locator('[data-menu="tracks-back"]')).toBeFocused();
  await pulse(12);
  await expect(venue('track')).toBeFocused();
  // B leaves without loading a world.
  await pulse(1);
  await expect(page.locator(`${TITLE} [data-menu="track-day"]`)).toBeFocused();
  expect((await world(page)).levelId).toBe('generated');
  expect(errors).toEqual([]);
});
