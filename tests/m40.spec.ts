/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, devices, type Page } from '@playwright/test';
import { bootToTitle, boot, collectErrors } from './harness.ts';
import { PROVENANCE, devlogHandle } from '../src/data/provenance.ts';

/**
 * M40 Phase 1 — the shared build's stamp, its About and licences panel, and
 * the link "Copy link" shares (`docs/PLANS.md` §40.7).
 *
 * Every journey arrives the way a player does — the title's or the pause
 * card's Settings button, then the panel's own row — by mouse, by keyboard,
 * by a fake pad through the real Gamepad API, and by a real tap on a phone
 * configuration this spec builds itself (the `mobile` project only matches
 * `touch.spec.ts`; AGENTS, "A rule that no project can reach…").
 *
 * The two long texts are compared with the project's own files: the dev
 * server runs the same `vite.config.ts` transform a build does, so what is
 * read here is what the one-file packager checks byte for byte.
 */

const LICENCE = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
const NOTICE = readFileSync(new URL('../NOTICE.md', import.meta.url), 'utf8');
const LICENCE_FIRST_LINE = LICENCE.split('\n').find((line) => line.trim() !== '')!.trim();

/** Review captures: an env override, repo-relative by default (invariant 23). */
const SHOTS = process.env.M40_SHOTS ?? 'test-results/m40';

const about = (page: Page) => page.locator('.euc-menu--about');
const region = (page: Page) => page.locator('.euc-menu--about [data-about="text"]');
const aboutRow = (page: Page) => page.locator('.euc-menu--settings [data-menu="about"]');

function menuState(page: Page) {
  return page.evaluate(() => {
    const { app } = window.game.snapshot();
    return { state: app.state, menu: app.menu };
  });
}

function scrollTop(page: Page): Promise<number> {
  return region(page).evaluate((node) => node.scrollTop);
}

function scrollMax(page: Page): Promise<number> {
  return region(page).evaluate((node) => node.scrollHeight - node.clientHeight);
}

/** The panel says what it should, whichever door it was opened through. */
async function expectAboutContents(page: Page): Promise<void> {
  await expect(about(page)).toBeVisible();
  await expect(about(page).locator('#euc-about-heading')).toHaveText('About and licences');
  await expect(about(page).locator('.euc-about__name')).toContainText(PROVENANCE.title);
  await expect(about(page).locator('[data-note="about-stamp"]')).toHaveText(`v${PROVENANCE.version}`);
  await expect(about(page).locator('[data-about="author"]')).toHaveAttribute('href', PROVENANCE.authorUrl);
  await expect(about(page).locator('[data-about="author"]')).toHaveText(PROVENANCE.author);

  const links = [
    ['play', PROVENANCE.homepageUrl, 'Play online'],
    ['source', PROVENANCE.repositoryUrl, 'Source'],
    ['devlog', PROVENANCE.devlogUrl, `${devlogHandle()} on YouTube`],
    // §46: the pad's way to the spin-off, since the title chip is not a stop.
    ['spin-off', PROVENANCE.spinOffUrl, `${PROVENANCE.spinOffTitle}, the Manhattan spin-off`],
  ] as const;
  for (const [hook, href, text] of links) {
    const link = about(page).locator(`[data-about="${hook}"]`);
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveText(text);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
  }

  // The whole of both files, as text — `textContent` in, `textContent` out.
  const texts = await about(page).evaluate((root) => ({
    licence: root.querySelector('[data-about="licence"]')?.textContent ?? null,
    notice: root.querySelector('[data-about="notice"]')?.textContent ?? null,
    missingShown: !(root.querySelector('[data-about="missing"]') as HTMLElement).hidden,
    whiteSpace: getComputedStyle(root.querySelector('[data-about="licence"]')!).whiteSpace,
  }));
  // Shown reflowed for narrow screens (menus.ts `reflowParagraphs`); the page's
  // raw block, asserted byte for byte below, is the file itself.
  expect(texts.licence?.split(/\s+/).join(' ').trim()).toBe(LICENCE.split(/\s+/).join(' ').trim());
  // Shown as plain text (menus.ts `plainNotice`): the same letters and digits in
  // order, with no Markdown table rules; the raw block is asserted byte for byte below.
  const letters = (text: string | null): string => ((text ?? '').toLowerCase().match(/[a-z0-9]/g) ?? []).join('');
  expect(letters(texts.notice)).toBe(letters(NOTICE.replace(/^\s*#\s[^\n]*\n/, '')));
  expect(texts.notice).not.toMatch(/^\s*\|?-{3}/m);
  expect(texts.missingShown).toBe(false);
  expect(texts.whiteSpace).toBe('pre-wrap');
  await expect(region(page)).toContainText(LICENCE_FIRST_LINE);
  await expect(region(page)).toContainText('ORIGIN');

  // The text is long enough to scroll inside its own box, or none of the
  // scrolling journeys below would prove anything.
  expect(await scrollMax(page)).toBeGreaterThan(200);
}

test.describe('M40 — stamp, About and licences, share link (desktop)', () => {
  test('the title carries the stamp and a credit read from PROVENANCE; the page carries both texts', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    const stamp = page.locator('.euc-menu--title .euc-credit__stamp');
    await expect(stamp).toBeVisible();
    await expect(stamp).toHaveText(`v${PROVENANCE.version}`);
    const credit = page.locator('.euc-menu--title .euc-credit__link');
    await expect(credit).toHaveAttribute('href', PROVENANCE.repositoryUrl);
    await expect(credit).toHaveText(PROVENANCE.author);

    // Text, not a control: no tabindex, no hook an action could resolve to,
    // and nothing the focus census would count as a stop.
    const shape = await stamp.evaluate((node) => ({
      tag: node.tagName,
      tabindex: node.getAttribute('tabindex'),
      menu: node.closest('[data-menu]') === null,
      focusableInside: node.querySelectorAll('a, button, input, select, [tabindex]').length,
    }));
    expect(shape).toEqual({ tag: 'SPAN', tabindex: null, menu: true, focusableInside: 0 });

    // The two raw-text blocks, byte for byte as the files (vite.config.ts).
    const blocks = await page.evaluate(() => {
      const licence = document.getElementById('euc-licence-text');
      const notice = document.getElementById('euc-notice-text');
      if (licence === null || notice === null) return null;
      return {
        licence: licence.textContent,
        licenceType: licence.getAttribute('type'),
        notice: notice.textContent,
        noticeType: notice.getAttribute('type'),
        inBody: notice.parentElement === document.body,
      };
    });
    expect(blocks).toEqual({
      licence: LICENCE, licenceType: 'text/plain', notice: NOTICE, noticeType: 'text/plain', inBody: true,
    });
    expect(errors).toEqual([]);
  });

  test('the title\'s EUC NYC card links the spin-off from PROVENANCE, in the same tab, and the pad can take it (1.4.0)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: 'fake standard pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      (window as unknown as { fakePad: typeof pad }).fakePad = pad;
      navigator.getGamepads = () => [pad, null, null, null] as never;
    });
    await bootToTitle(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    // The fourth place card (owner's 1.4.0 ride), replacing §46's foot chip.
    const card = page.locator('.euc-menu--title .euc-title__starts a.euc-start--nyc');
    await expect(card).toBeVisible();
    expect(await card.getAttribute('href')).toBe(PROVENANCE.spinOffUrl);
    expect(PROVENANCE.spinOffUrl).toBe('https://vibezzzcoder.github.io/euc-nyc/');
    expect(await card.getAttribute('target')).toBeNull();
    await expect(card.locator('.euc-start__place')).toHaveText('EUC NYC');
    expect(await card.getAttribute('data-menu')).toBeNull();
    await expect(page.locator('.euc-menu--title .euc-spin-off-chip')).toHaveCount(0);

    const pulse = async (button: number): Promise<void> => page.evaluate(async (index) => {
      const pad = (window as unknown as { fakePad: { buttons: { pressed: boolean; value: number }[] } }).fakePad;
      const frame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      pad.buttons[index].pressed = true;
      pad.buttons[index].value = 1;
      await frame();
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
      await frame();
    }, button);

    // Right three times from Start ride stands on it, like any place card…
    await expect(page.locator('.euc-menu--title [data-menu="start"]')).toBeFocused();
    for (let step = 0; step < 3; step += 1) await pulse(15);
    await expect(card).toBeFocused();
    expect(errors).toEqual([]);

    // …and A goes there in this tab, and Back brings the title back alive
    // (a back-forward cache restore reloads rather than showing a disposed game).
    await page.route(/^https:\/\/vibezzzcoder\.github\.io\/euc-nyc\//, (route) => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>EUC NYC</title><p>stub</p>',
    }));
    // The press navigates while the pulse is still waiting on frames.
    await pulse(0).catch(() => undefined);
    await page.waitForURL(PROVENANCE.spinOffUrl);
    await page.goBack();
    await page.waitForFunction(() => window.game?.snapshot().app.state === 'title', null, { timeout: 60_000 });
    await expect(page.locator('.euc-menu--title a.euc-start--nyc')).toBeVisible();
  });

  test('a mouse opens About from the title\'s Settings, and Back and Escape step back one screen', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    await page.locator('.euc-menu--title [data-menu="settings"]').click();
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'settings' });

    // The new last row of Settings.
    const last = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('.euc-menu--settings button, .euc-menu--settings input, '
        + '.euc-menu--settings select, .euc-menu--settings a[href]')];
      return (controls[controls.length - 1] as HTMLElement).dataset.menu;
    });
    expect(last).toBe('about');
    await expect(aboutRow(page)).toHaveText('About and licences');

    const world = await page.evaluate(() => window.game.snapshot().world.link);
    await aboutRow(page).click();
    // A subpanel: the app state stays Settings underneath and no world moved.
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'about' });
    expect(await page.evaluate(() => window.game.snapshot().world.link)).toBe(world);
    await expectAboutContents(page);
    // Safe first focus: the text that only scrolls, never an external link.
    await expect(region(page)).toBeFocused();

    await about(page).locator('[data-menu="about-back"]').click();
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'settings' });
    await expect(aboutRow(page)).toBeFocused();

    // Escape from About is one step, to Settings — not out of Settings.
    await aboutRow(page).click();
    await page.keyboard.press('Escape');
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'settings' });
    await expect(aboutRow(page)).toBeFocused();
    await page.keyboard.press('Escape');
    expect(await menuState(page)).toEqual({ state: 'title', menu: 'title' });
    expect(errors).toEqual([]);
  });

  test('the keyboard reaches About, scrolls it by arrows, pages and ends, and returns to its row', async ({ page }) => {
    const errors = collectErrors(page);
    // From the pause card this time: About is wherever Settings is.
    await boot(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    await page.locator('.euc-menu--pause [data-menu="settings"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
    // Settings opens on the value Quality holds (1.2.0 choice rows), which is
    // the row's third button; native Shift+Tab walks back to its first.
    await expect(page.locator('[data-choice="quality"][data-value="high"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-choice="quality"][data-value="low"]')).toBeFocused();

    // The Tab trap wraps backwards from the first control to the last, which
    // is the About row.
    await page.keyboard.press('Shift+Tab');
    await expect(aboutRow(page)).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'about' });
    await expect(region(page)).toBeFocused();
    await expectAboutContents(page);

    const max = await scrollMax(page);
    expect(await scrollTop(page)).toBe(0);
    await page.keyboard.press('ArrowDown');
    const afterArrow = await scrollTop(page);
    expect(afterArrow).toBeGreaterThan(0);
    await page.keyboard.press('PageDown');
    const afterPage = await scrollTop(page);
    expect(afterPage - afterArrow).toBeGreaterThan(afterArrow);
    await page.keyboard.press('ArrowUp');
    expect(await scrollTop(page)).toBeLessThan(afterPage);
    await page.keyboard.press('End');
    expect(Math.abs(await scrollTop(page) - max)).toBeLessThanOrEqual(1);
    await page.keyboard.press('PageUp');
    expect(await scrollTop(page)).toBeLessThan(max);
    await page.keyboard.press('Home');
    expect(await scrollTop(page)).toBe(0);
    // The keys scrolled the text and nothing else: still on the region.
    await expect(region(page)).toBeFocused();

    await page.keyboard.press('Escape');
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'settings' });
    await expect(aboutRow(page)).toBeFocused();
    // And Settings still returns to the pause it was opened from.
    await page.keyboard.press('Escape');
    expect((await menuState(page)).state).toBe('paused');
    expect(errors).toEqual([]);
  });

  test('a pad opens About from Settings, scrolls it a step at a time, walks off its edges, and B returns', async ({ page }) => {
    const errors = collectErrors(page);
    // `tests/m9.spec.ts`'s fake standard pad, reported in a sparse list as a
    // real browser reports one: the holes are part of the shape.
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: 'fake standard pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      (window as unknown as { fakePad: typeof pad }).fakePad = pad;
      navigator.getGamepads = () => [pad, null, null, null] as never;
    });
    await bootToTitle(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    const pulse = async (button: number): Promise<void> => page.evaluate(async (index) => {
      const pad = (window as unknown as { fakePad: { buttons: { pressed: boolean; value: number }[] } }).fakePad;
      const frame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      pad.buttons[index].pressed = true;
      pad.buttons[index].value = 1;
      await frame();
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
      await frame();
    }, button);
    const UP = 12;
    const DOWN = 13;
    const A = 0;
    const B = 1;
    /** The pad's own cursor, by the style a player sees (AGENTS: never only activeElement). */
    const cursorOn = (selector: string) => page.evaluate((target) => {
      const active = document.activeElement as HTMLElement | null;
      return active !== null && active.matches(target) && active.dataset.padCursor === 'true'
        && getComputedStyle(active).outlineStyle !== 'none';
    }, selector);

    // The title's Settings button, pressed by the pad's A.
    await page.locator('.euc-menu--title [data-menu="settings"]').focus();
    await pulse(A);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
    await expect(page.locator('[data-choice="quality"][data-value="high"]')).toBeFocused();
    // Up from the first row wraps to the last: the About row.
    await pulse(UP);
    expect(await cursorOn('.euc-menu--settings [data-menu="about"]')).toBe(true);
    await pulse(A);
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'about' });
    expect(await cursorOn('.euc-menu--about [data-about="text"]')).toBe(true);
    await expectAboutContents(page);

    // Down scrolls the text by a step, and the cursor stays on it.
    expect(await scrollTop(page)).toBe(0);
    await pulse(DOWN);
    const one = await scrollTop(page);
    expect(one).toBeGreaterThan(0);
    await pulse(DOWN);
    const two = await scrollTop(page);
    expect(two).toBeGreaterThan(one);
    expect(await cursorOn('.euc-menu--about [data-about="text"]')).toBe(true);
    await pulse(UP);
    expect(await scrollTop(page)).toBeLessThan(two);

    // Near the bottom, Down finishes the text first and only then walks on.
    const max = await scrollMax(page);
    await region(page).evaluate((node, top) => { node.scrollTop = top; }, max - 10);
    await pulse(DOWN);
    expect(Math.abs(await scrollTop(page) - max)).toBeLessThanOrEqual(1);
    expect(await cursorOn('.euc-menu--about [data-about="text"]')).toBe(true);
    await pulse(DOWN);
    expect(await cursorOn('.euc-menu--about [data-menu="about-back"]')).toBe(true);
    // Up from Back comes back onto the text (still at its end), and Up then
    // reads backwards rather than leaving.
    await pulse(UP);
    expect(await cursorOn('.euc-menu--about [data-about="text"]')).toBe(true);
    await pulse(UP);
    expect(await scrollTop(page)).toBeLessThan(max);

    // At the top, Up walks off onto the links, and Down comes back.
    await region(page).evaluate((node) => { node.scrollTop = 0; });
    await pulse(UP);
    expect(await cursorOn('.euc-about__links [data-about]')).toBe(true);
    await pulse(DOWN);
    expect(await cursorOn('.euc-menu--about [data-about="text"]')).toBe(true);

    // B is one step back, onto the row that opened the panel.
    await pulse(B);
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'settings' });
    expect(await cursorOn('.euc-menu--settings [data-menu="about"]')).toBe(true);
    await pulse(B);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
    expect(errors).toEqual([]);
  });

  test('a page without the two text blocks says where the licence and notices are', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    await page.evaluate(() => {
      document.getElementById('euc-licence-text')?.remove();
      document.getElementById('euc-notice-text')?.remove();
    });
    await page.locator('.euc-menu--title [data-menu="settings"]').click();
    await aboutRow(page).click();
    const missing = about(page).locator('[data-about="missing"]');
    await expect(missing).toBeVisible();
    await expect(missing).toContainText('LICENSE');
    await expect(missing).toContainText('NOTICE.md');
    await expect(about(page).locator('[data-about="licence"]')).toBeHidden();
    await expect(about(page).locator('[data-about="notice"]')).toBeHidden();
    // The links still stand on their own.
    await expect(about(page).locator('[data-about="devlog"]')).toHaveAttribute('href', PROVENANCE.devlogUrl);
    expect(errors).toEqual([]);
  });

  test('under the http dev server the shared link is the page\'s own world link', async ({ page }) => {
    await bootToTitle(page, 'level=generated&seed=m40-share');
    const world = await page.evaluate(() => window.game.snapshot().world);
    expect(world.link.startsWith('http://')).toBe(true);
    expect(world.shareLink).toBe(world.link);
  });
});

test.describe('M40 — review captures (desktop 1280×720)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('title stamp and About panel, top and scrolled into NOTICE', async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    await bootToTitle(page);
    await page.screenshot({ path: `${SHOTS}/desktop-title.png` });
    await page.locator('.euc-menu--title [data-menu="settings"]').click();
    await aboutRow(page).click();
    await expect(about(page)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/desktop-about-top.png` });
    await scrollToNotice(page);
    await page.screenshot({ path: `${SHOTS}/desktop-about-notice.png` });
  });
});

/** Put the NOTICE heading at the top of the text box. */
async function scrollToNotice(page: Page): Promise<void> {
  await region(page).evaluate((node) => {
    const heading = node.querySelectorAll('.euc-about__heading')[1] as HTMLElement;
    node.scrollTop += heading.getBoundingClientRect().top - node.getBoundingClientRect().top - 8;
  });
  expect(await scrollTop(page)).toBeGreaterThan(0);
}

// The phone, built here: the `mobile` project matches `touch.spec.ts` only.
const { defaultBrowserType: _ignored, ...pixel7 } = devices['Pixel 7'];

test.describe('M40 — About on a phone (Pixel 7, real touch)', () => {
  test.use(pixel7);

  test('a tap opens About, a touch drag scrolls the text, every target meets the floor, and Back returns', async ({ page }) => {
    const errors = collectErrors(page);
    mkdirSync(SHOTS, { recursive: true });
    await bootToTitle(page);
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

    // The stamp sits inside the phone's width, in the credit's own line.
    const stamp = page.locator('.euc-menu--title .euc-credit__stamp');
    await expect(stamp).toHaveText(`v${PROVENANCE.version}`);
    const stampBox = await stamp.boundingBox();
    const width = page.viewportSize()!.width;
    expect(stampBox !== null && stampBox.x >= 0 && stampBox.x + stampBox.width <= width).toBe(true);
    await page.screenshot({ path: `${SHOTS}/mobile-title.png` });

    await page.locator('.euc-menu--title [data-menu="settings"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
    await aboutRow(page).tap();
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'about' });
    await expectAboutContents(page);
    await page.screenshot({ path: `${SHOTS}/mobile-about-top.png` });

    // Readable at phone width: the box fits the screen, the type is not tiny.
    const metrics = await region(page).evaluate((node) => {
      const box = node.getBoundingClientRect();
      const pre = node.querySelector('[data-about="licence"]') as HTMLElement;
      return {
        left: box.left, right: box.right, height: box.height,
        fontSize: parseFloat(getComputedStyle(pre).fontSize),
        sideScroll: node.scrollWidth - node.clientWidth,
      };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(width);
    expect(metrics.height).toBeGreaterThan(150);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(12);
    expect(metrics.sideScroll).toBeLessThanOrEqual(1);

    // Every target on the panel meets the 44 px coarse-pointer floor.
    const targets = await about(page).evaluate((root) => [...root.querySelectorAll('a[href], button')]
      .map((node) => ({ name: node.textContent!.trim(), height: node.getBoundingClientRect().height })));
    expect(targets.length).toBe(6);
    for (const target of targets) expect(target.height, target.name).toBeGreaterThanOrEqual(44 - 0.5);

    // A real touch drag on the text scrolls the text, natively.
    const box = (await region(page).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height * 0.75),
      yDistance: -Math.round(box.height * 0.5),
      gestureSourceType: 'touch',
      speed: 800,
    });
    await expect.poll(() => scrollTop(page)).toBeGreaterThan(20);

    await scrollToNotice(page);
    await page.screenshot({ path: `${SHOTS}/mobile-about-notice.png` });

    await about(page).locator('[data-menu="about-back"]').tap();
    expect(await menuState(page)).toEqual({ state: 'settings', menu: 'settings' });
    await expect(aboutRow(page)).toBeFocused();
    expect(errors).toEqual([]);
  });
});
