/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness';

const GAME_MODULE = /\/(?:src\/app\/main\.ts|assets\/main-[^/]+\.js)(?:\?.*)?$/;
const GAME_CSS = /\/(?:src\/ui\/game\.css|assets\/game-[^/]+\.css)(?:\?.*)?$/;
const TOGGLE = '.euc-menu--title [data-menu="ultra"]';

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.game) && window.game.snapshot().loop.frames > 0,
    undefined, { timeout: 90_000 });
  await expect(page.locator('#boot')).toBeHidden();
}

test('static loader paints while required code and CSS are held; input cannot start the ride', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(GAME_MODULE, async route => { await held; await route.continue(); });
  await page.route(GAME_CSS, async route => { await held; await route.continue(); });
  const wavStarts: boolean[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'fetch' && /\.wav(?:\?|$)/.test(request.url())) wavStarts.push(false);
  });
  await page.goto('/?level=generated&seed=euc', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot')).toBeVisible();
  await expect(page.locator('#boot-heading')).toHaveText('Your next ride awaits');
  expect(await page.evaluate(() => Boolean(window.game))).toBe(false);
  await page.keyboard.press('Enter');
  await page.keyboard.down('w');
  for (const size of [{ width: 1280, height: 800 }, { width: 375, height: 812 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    const fit = await page.locator('#boot').evaluate(root => {
      const box = root.getBoundingClientRect();
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('h1, p:not([hidden]), .boot-wheel, #boot-track'));
      return { width: box.width, height: box.height, overflow: root.scrollWidth - root.clientWidth,
        clipped: nodes.some(node => { const b = node.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight; }) };
    });
    expect(fit).toEqual({ width: size.width, height: size.height, overflow: 0, clipped: false });
    await page.screenshot({ path: testInfo.outputPath(`first-paint-${size.width}.png`) });
  }
  expect(wavStarts, 'optional recordings competed with required boot work').toEqual([]);
  release();
  await ready(page);
  await page.keyboard.up('w');
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');
  expect(await page.evaluate(() => window.game.snapshot().euc.speed)).toBe(0);
  expect(errors).toEqual([]);
});

test('failed required module offers a real retry; optional audio failure never blocks readiness', async ({ page }) => {
  await page.route(GAME_MODULE, route => route.abort());
  await page.goto('/?level=slice', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-error')).toContainText('could not load');
  await expect(page.getByRole('button', { name: 'Retry loading' })).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.game))).toBe(false);
  await page.unroute(GAME_MODULE);
  await page.route('**/*.wav', route => route.abort());
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await ready(page);
  await page.locator('.euc-menu--title [data-menu="start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  await expect(page.locator('#boot-error')).toBeHidden();
});

test('missing tiny entry and early failed CSS each expose retry without an endless loader', async ({ page }) => {
  const entry = /\/(?:src\/app\/boot\.ts|assets\/index-[^/]+\.js)(?:\?.*)?$/;
  await page.route(entry, route => route.abort());
  await page.goto('/?level=slice', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-error')).toContainText('could not download');
  await expect(page.locator('#boot-retry')).toBeVisible();
  await page.unroute(entry);
  await page.route(GAME_CSS, route => route.abort());
  await page.locator('#boot-retry').click();
  await expect(page.locator('#boot-error')).toContainText('could not load');
  expect(await page.evaluate(() => Boolean(window.game))).toBe(false);
  await page.unroute(GAME_CSS);
  await page.locator('#boot-retry').click();
  await ready(page);
});

test('first-view failure retains the error/retry surface after disposing the partial game', async ({ page }) => {
  // Deliberately fail the readiness boundary, not the WebGL capability probe.
  await page.route('**/src/app/Game.ts*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source).toContain('prepareFirstFrame()');
    await route.fulfill({ response, body: source.replace(/prepareFirstFrame\(\)\s*\{/, 'prepareFirstFrame() { throw new Error("known-bad first view");') });
  });
  await page.goto('/?level=slice', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot-error')).toContainText('first view could not be prepared', { timeout: 90_000 });
  await expect(page.locator('#boot-retry')).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.game))).toBe(false);
});

test('native multiplayer entry saves High, solo return skips Ultra rebuild, and manual reenable is covered', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const pad = { index: 0, id: 'loading QA pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    (window as unknown as { loadingPad: typeof pad }).loadingPad = pad;
    navigator.getGamepads = () => [pad] as never;
  });
  await bootAtTier(page, 'level=slice', 'ultra', { ride: false });
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.evaluate(() => {
    const game = window.game;
    const reconcile = game.renderer.reconcileUltra.bind(game.renderer);
    const work: { busy: boolean; heading: string; frames: number }[] = [];
    (window as unknown as { loadingWork: typeof work }).loadingWork = work;
    game.renderer.reconcileUltra = () => {
      work.push({ busy: document.getElementById('boot')!.getAttribute('aria-busy') === 'true',
        heading: document.getElementById('boot-heading')!.textContent!, frames: game.loop.stats().frames });
      const pad = (window as unknown as { loadingPad: { buttons: { pressed: boolean; value: number }[] } }).loadingPad;
      pad.buttons[0].pressed = true; pad.buttons[0].value = 1;
      return reconcile();
    };
  });
  const before = await page.evaluate(() => window.game.loop.stats().frames);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await expect(page.locator('#boot')).toBeHidden();
  const joined = await page.evaluate(() => window.game.snapshot());
  expect(joined.options.quality).toBe('high');
  expect(joined.quality.effective).toBe('high');
  expect(joined.input.devices, 'a pad held during loading claimed a seat').toEqual([null, null]);
  await page.evaluate(() => {
    const pad = (window as unknown as { loadingPad: { buttons: { pressed: boolean; value: number }[] } }).loadingPad;
    pad.buttons[0].pressed = false; pad.buttons[0].value = 0;
  });
  const firstWork = await page.evaluate(() => (window as unknown as { loadingWork: { busy: boolean; frames: number }[] }).loadingWork);
  expect(firstWork).toHaveLength(1);
  expect(firstWork[0].busy).toBe(true);
  expect(firstWork[0].frames - before).toBeGreaterThanOrEqual(2);
  await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await expect(page.locator('#boot')).toBeHidden();
  expect(await page.evaluate(() => window.game.snapshot().options.quality)).toBe('high');
  expect(await page.evaluate(() => (window as unknown as { loadingWork: unknown[] }).loadingWork.length)).toBe(1);
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => window.game.snapshot().options.quality)).toBe('high');
  await page.locator(TOGGLE).click();
  await expect(page.locator('#boot-heading')).toHaveText('Loading Ultra graphics…');
  await page.screenshot({ path: testInfo.outputPath('manual-ultra-loading.png') });
  await expect(page.locator('#boot')).toBeHidden({ timeout: 90_000 });
  expect(await page.evaluate(() => window.game.snapshot().quality.effective)).toBe('ultra');
  expect(errors).toEqual([]);
});

test('reduced motion stops loader animation without hiding status or blocking completion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(GAME_MODULE, async route => { await held; await route.continue(); });
  await page.goto('/?level=slice', { waitUntil: 'domcontentloaded' });
  for (const selector of ['.boot-wheel', '#boot-bar']) {
    expect(await page.locator(selector).evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  }
  await expect(page.locator('#boot-status')).toBeVisible();
  release();
  await ready(page);
});

/** The living world made a world swap long enough to freeze the old screen. */
test('a native world swap paints the cover first, rebuilds behind it, then releases input', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?level=switchback');
  await ready(page);
  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  const venue = '.euc-menu--tracks [data-menu="lap-venue"][data-venue="track"]';
  await expect(page.locator(venue)).toBeVisible();
  // The press only queues the swap: the cover is up and the old world remains.
  // 2026-10-04: pressed, read and Escaped in one task. Separate round trips
  // after a real click raced the cover's paint/work/settle frames on a loaded
  // machine: the read could see the swap already run behind the cover, and
  // the Escape could land after the cover lifted (and rightly pause the ride).
  const queued = await page.evaluate((selector) => {
    document.querySelector<HTMLElement>(selector)!.click();
    const escape = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true }));
    return { kind: document.getElementById('boot')!.dataset.kind, hidden: document.getElementById('boot')!.hidden,
      state: window.game.snapshot().app.state, escapeRefused: escape.defaultPrevented };
  }, venue);
  expect(queued).toEqual({ kind: 'world', hidden: false, state: 'title', escapeRefused: true });
  await expect(page.locator('#boot-heading')).toHaveText('Heading to the track');
  await expect(page.locator('#boot')).toBeHidden({ timeout: 60_000 });
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('trackDay');
  expect(errors).toEqual([]);
});

test('the bridge world-swap entrances stay synchronous instruments without a cover', async ({ page }) => {
  await page.goto('/?level=slice');
  await ready(page);
  const after = await page.evaluate(() => { window.game.startTrackDay();
    return { state: window.game.snapshot().app.state, cover: document.getElementById('boot')!.hidden }; });
  expect(after).toEqual({ state: 'trackDay', cover: true });
});

test('Surprise me builds the fresh route behind the cover and reports it ready', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?level=slice');
  await ready(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('.euc-menu--routes [data-menu="surprise"]').click();
  await expect(page.locator('#boot')).toBeVisible();
  await expect(page.locator('#boot-heading')).toHaveText('Building a fresh route');
  await expect(page.locator('#boot')).toBeHidden({ timeout: 90_000 });
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]')).toContainText('ready to ride');
  // Focus returns to the shown panel, so a keyboard or pad can carry on.
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.euc-menu--routes')))).toBe(true);
  expect(errors).toEqual([]);
});

test('after a multiplayer cover the shown panel has focus; browser keys pass the cover', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { seenKeys: [string, boolean][] }).seenKeys = [];
    window.addEventListener('keydown', (event) => (window as unknown as { seenKeys: [string, boolean][] })
      .seenKeys.push([event.code, event.defaultPrevented]));
  });
  await page.goto('/?level=slice', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#boot')).toBeVisible();
  await page.evaluate(() => {
    for (const [code, altKey] of [['F5', false], ['ArrowLeft', true], ['Enter', false]] as const) {
      document.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, altKey, bubbles: true, cancelable: true }));
    }
  });
  await ready(page);
  // F5 and Alt+Left reach the browser unprevented; the game's Enter is held.
  expect(await page.evaluate(() => (window as unknown as { seenKeys: [string, boolean][] }).seenKeys))
    .toEqual([['F5', false], ['ArrowLeft', false]]);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await expect(page.locator('#boot')).toBeHidden();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.euc-menu--couch')))).toBe(true);
  await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await expect(page.locator('#boot')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-menu'))).toBe('start');
});
