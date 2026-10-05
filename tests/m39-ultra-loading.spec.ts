/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

/**
 * M39 follow-up — the Ultra loading notice (the owner's desktop and iPhone
 * rides, 2026-09-25: "ultra graphics mode needs like a 'loading...' message
 * … so it is obvious why it frozen for a few seconds"; "don't want players to
 * start mashing recklessly cause they don't know if its working or not").
 *
 * Switching Ultra on builds its world, sky, environment light, far shadow map
 * and every Ultra program in one synchronous call — about 0.8–1.8 s on an M1
 * in this harness, "a couple of secs" on his iPhone — and switching it off
 * tears that down. Both entrances (the title's Ultra Graphics toggle and
 * Settings' quality select, which the pause menu opens too) now:
 *
 *   1. write the busy state first — "Loading Ultra graphics…" on the toggle
 *      and in Settings' polite readout, `aria-busy` on the control — and let
 *      the loop draw two frames before the work starts, so the notice is on
 *      screen while the game is frozen;
 *   2. ignore every further press on that control until the work is done and
 *      the input queued behind the freeze has been delivered, whichever device
 *      it came from;
 *   3. clear the notice and show the honest state ("On", "Using High", "Off").
 *
 * **How the spec holds the game still.** The loop asks the global
 * `requestAnimationFrame` for every frame (`app/loop.ts`), so the probe below
 * can hold those requests: while held, no frame runs, the deferred work cannot
 * start, and presses land exactly in the window a mashing player's would.
 * Releasing hands the held callbacks back to the real `requestAnimationFrame`.
 * `renderer.reconcileUltra` is wrapped to count tier switches and to record
 * what the page showed at the instant the heavy work began.
 *
 * The words are literals here on purpose (they are the owner-facing contract,
 * and `menus.test.ts` pins the exported constants to the same text), so this
 * file runs unchanged against the code before the fix — the failing control.
 *
 *     EUC_PORT=5197 node tools/run-tests.mjs browser tests/m39-ultra-loading.spec.ts --project=chromium
 */

const LOADING = 'Loading Ultra graphics…';
const LEAVING = 'Turning Ultra off…';

const TOGGLE = '.euc-menu--title [data-menu="ultra"]';
const QUALITY = '[data-option="quality"]';

interface Facts {
  /** `renderer.reconcileUltra` calls since the probe was installed: tier switches. */
  readonly switches: number;
  readonly quality: string;
  readonly effective: string;
  readonly pressed: string | null;
  readonly busy: string | null;
  readonly state: string | null;
  /** The toggle's busy line, as drawn: its text, and whether it is on screen. */
  readonly notice: string;
  readonly noticeShown: boolean;
  /** The title's polite status region. */
  readonly status: string;
  readonly selectValue: string | null;
  readonly selectBusy: string | null;
  readonly readout: string;
  readonly readoutShown: boolean;
}

interface WorkFacts extends Facts {
  /** Loop frames drawn between the busy state appearing and the work starting. */
  readonly framesSinceNotice: number | null;
}

interface LoadingProbe {
  facts(): Facts;
  atWork: WorkFacts[];
  hold(): void;
  release(): void;
  heldCount(): number;
  /** At the first switch: a click queued behind the freeze, and the pad's A held through it. */
  armFreezePresses(): void;
}

declare global {
  interface Window {
    m39Loading: LoadingProbe;
    fakePad?: { buttons: { pressed: boolean; value: number }[] };
  }
}

/** A standard-mapping pad the page can read, as `tests/m24.spec.ts` installs one. */
async function installFakePad(page: Page): Promise<void> {
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
    navigator.getGamepads = () => [pad] as never;
  });
}

function installLoadingProbe(): void {
  const game = window.game;
  const renderer = game.renderer;
  const reconcile = renderer.reconcileUltra.bind(renderer);
  const realFrame = window.requestAnimationFrame.bind(window);
  let held: FrameRequestCallback[] | null = null;
  let switches = 0;
  let noticeFrame: number | null = null;
  let armed = false;

  const shown = (node: HTMLElement | null): boolean => {
    if (node === null || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) === 0) return false;
    const box = node.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return false;
    // Nothing on top of it, and inside the viewport.
    if (box.right < 0 || box.bottom < 0 || box.left > innerWidth || box.top > innerHeight) return false;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit !== null && (hit === node || node.contains(hit) || hit.contains(node));
  };

  const facts = (): Facts => {
    const toggle = document.querySelector<HTMLButtonElement>('.euc-menu--title [data-menu="ultra"]');
    const line = toggle?.querySelector<HTMLElement>('[data-ultra-busy-text]') ?? null;
    const status = document.querySelector<HTMLElement>('[data-ultra-status]');
    const select = document.querySelector<HTMLSelectElement>('[data-option="quality"]');
    const readout = document.querySelector<HTMLElement>('[data-readout="quality-state"]');
    const snapshot = game.snapshot();
    return {
      switches,
      quality: snapshot.options.quality,
      effective: snapshot.quality.effective,
      pressed: toggle?.getAttribute('aria-pressed') ?? null,
      busy: toggle?.getAttribute('aria-busy') ?? null,
      state: toggle?.querySelector('[data-ultra-text]')?.textContent?.trim() ?? null,
      notice: line?.textContent?.trim() ?? '',
      noticeShown: shown(document.getElementById('boot-heading')) && document.getElementById('boot')?.dataset.kind === 'quality',
      status: status?.textContent?.trim() ?? '',
      selectValue: select?.value ?? null,
      selectBusy: select?.getAttribute('aria-busy') ?? null,
      readout: readout?.textContent?.trim() ?? '',
      readoutShown: shown(document.getElementById('boot-heading')) && document.getElementById('boot')?.dataset.kind === 'quality',
    };
  };

  const probe: LoadingProbe = {
    facts,
    atWork: [],
    hold(): void {
      held = [];
      window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        held?.push(callback);
        return 0;
      };
    },
    release(): void {
      const waiting = held ?? [];
      held = null;
      window.requestAnimationFrame = realFrame;
      for (const callback of waiting) realFrame(callback);
    },
    heldCount: () => held?.length ?? 0,
    armFreezePresses(): void {
      armed = true;
    },
  };

  // When the busy state first appears on either control, note the loop's frame.
  const watch = new MutationObserver(() => {
    const busy = document.querySelector('.euc-menu--title [data-menu="ultra"]')?.getAttribute('aria-busy') === 'true'
      || document.querySelector('[data-option="quality"]')?.getAttribute('aria-busy') === 'true';
    if (busy && noticeFrame === null) noticeFrame = game.loop.stats().frames;
    if (!busy) noticeFrame = null;
  });
  watch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['aria-busy'] });

  renderer.reconcileUltra = () => {
    switches += 1;
    probe.atWork.push({
      ...facts(),
      framesSinceNotice: noticeFrame === null ? null : game.loop.stats().frames - noticeFrame,
    });
    if (armed) {
      armed = false;
      // A press a mashing player makes while the game is frozen reaches the
      // page after the work: a click queued behind this task, and a pad whose
      // A is still down at the first poll after it.
      const toggle = document.querySelector<HTMLButtonElement>('.euc-menu--title [data-menu="ultra"]');
      window.setTimeout(() => toggle?.click(), 0);
      const pad = window.fakePad;
      if (pad) {
        pad.buttons[0].pressed = true;
        pad.buttons[0].value = 1;
      }
    }
    return reconcile();
  };
  window.m39Loading = probe;
}

async function facts(page: Page): Promise<Facts> {
  return page.evaluate(() => window.m39Loading.facts());
}

/** Stop the loop between frames: wait until its next request is held. */
async function holdFrames(page: Page): Promise<void> {
  await page.evaluate(() => window.m39Loading.hold());
  await page.waitForFunction(() => window.m39Loading.heldCount() > 0);
}

async function releaseFrames(page: Page): Promise<void> {
  await page.evaluate(() => window.m39Loading.release());
}

async function releasePad(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pad = window.fakePad;
    if (!pad) return;
    pad.buttons[0].pressed = false;
    pad.buttons[0].value = 0;
  });
}

async function attachShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/** Done: nothing busy anywhere, and the words describe the frame again. */
async function waitUntilSettled(page: Page, pressed: 'true' | 'false'): Promise<Facts> {
  await expect.poll(async () => {
    const now = await facts(page);
    return { busy: now.busy, selectBusy: now.selectBusy, pressed: now.pressed, notice: now.notice };
  }, { message: 'the switch never settled', timeout: 20_000 }).toEqual({
    busy: null,
    selectBusy: null,
    pressed,
    notice: '',
  });
  await expect(page.locator('#boot')).toBeHidden();
  return facts(page);
}

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

test.beforeEach(() => {
  // Each case builds Ultra at least once.
  test.slow();
});

test('the title toggle shows "Loading Ultra graphics…" before the work, ignores every repeat press, and clears', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await installFakePad(page);
  await bootAtTier(page, 'level=slice', 'high', { ride: false });
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
  await page.evaluate(installLoadingProbe);

  const toggle = page.locator(TOGGLE);
  await toggle.focus();
  const before = await facts(page);
  expect(before).toMatchObject({ switches: 0, quality: 'high', pressed: 'false', busy: null, state: 'Off', notice: '', status: '' });

  // Mouse twice, then Enter and Space on the focused toggle — all while the
  // loop is held, so every one of them lands before the work can start.
  await holdFrames(page);
  await page.evaluate(() => window.m39Loading.armFreezePresses());
  const box = (await toggle.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.click(centre.x, centre.y);
  await page.mouse.click(centre.x, centre.y);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');

  const pressed = await facts(page);
  expect.soft(pressed.switches, 'the press did the heavy work inside the click, before anything could paint').toBe(0);
  expect.soft(pressed.quality, 'a repeat press toggled again').toBe('high');
  expect.soft(pressed.busy, 'the toggle is not aria-busy').toBe('true');
  expect.soft(pressed.notice, 'no loading line on the toggle').toBe(LOADING);
  expect.soft(pressed.noticeShown, 'the loading line is not on screen').toBe(true);
  expect.soft(pressed.status, 'the polite status region is silent').toBe(LOADING);
  await attachShot(page, testInfo, 'title-toggle-loading');

  await releaseFrames(page);
  const done = await waitUntilSettled(page, 'true');
  await releasePad(page);

  expect(done.switches, 'repeat presses (mouse, keyboard, a click queued behind the freeze, a pad held through it) switched again').toBe(1);
  expect(done.quality).toBe('ultra');
  const work = (await page.evaluate(() => window.m39Loading.atWork))[0];
  // (The store already holds the new tier here — `applyOptions` is what runs
  // the switch — but the toggle still shows the state it was pressed in.)
  expect(work, 'the notice was not up when the work began').toMatchObject({ busy: 'true', notice: LOADING, noticeShown: true, pressed: 'false', status: LOADING });
  expect(work.framesSinceNotice, 'the work started before the loop drew two frames with the notice').toBeGreaterThanOrEqual(2);
  expect(done.state).toBe(done.effective === 'ultra' ? 'On' : 'Using High');
  expect(done).toMatchObject({ noticeShown: false, status: '', selectValue: 'ultra' });

  // And back off: the same notice discipline, in the leaving words.
  await toggle.focus();
  await holdFrames(page);
  await toggle.click();
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.euc-menu--title [data-menu="ultra"]')!.click());
  const leaving = await facts(page);
  expect(leaving).toMatchObject({ switches: 1, quality: 'ultra', busy: 'true', notice: LEAVING, noticeShown: true, status: LEAVING });
  await releaseFrames(page);
  const off = await waitUntilSettled(page, 'false');
  expect(off).toMatchObject({ switches: 2, quality: 'high', state: 'Off', effective: 'high', status: '' });
  expect(errors).toEqual([]);
});

test('Settings (the pause menu’s too) shows the notice beside the quality select, and a second choice while loading is refused', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootAtTier(page, 'level=slice', 'ultra', { ride: true });
  await page.evaluate(installLoadingProbe);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.locator('.euc-menu--pause [data-menu="settings"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
  const select = page.locator(QUALITY);
  await expect(select).toHaveValue('ultra');

  // Leaving Ultra, then a second choice before the work has run.
  await holdFrames(page);
  await select.selectOption('high');
  await select.selectOption('low');
  const leaving = await facts(page);
  expect.soft(leaving.switches, 'the choice did the heavy work inside the event').toBe(0);
  expect.soft(leaving.selectBusy, 'the select is not aria-busy').toBe('true');
  expect.soft(leaving.readout, 'no notice beside the select').toBe(LEAVING);
  expect.soft(leaving.readoutShown).toBe(true);
  expect.soft(leaving.selectValue, 'the refused second choice stayed in the select').toBe('high');
  expect.soft(leaving.quality).toBe('ultra');
  await releaseFrames(page);
  const high = await waitUntilSettled(page, 'false');
  expect(high).toMatchObject({ switches: 1, quality: 'high', selectValue: 'high', readout: '', readoutShown: false });

  // Entering Ultra from the same select.
  await holdFrames(page);
  await select.selectOption('ultra');
  await select.selectOption('medium');
  const entering = await facts(page);
  expect(entering).toMatchObject({ switches: 1, quality: 'high', selectBusy: 'true', readout: LOADING, readoutShown: true, selectValue: 'ultra' });
  await attachShot(page, testInfo, 'settings-loading');
  await releaseFrames(page);
  const ultra = await waitUntilSettled(page, 'true');
  expect(ultra).toMatchObject({ switches: 2, quality: 'ultra', selectValue: 'ultra' });
  const work = (await page.evaluate(() => window.m39Loading.atWork))[1];
  expect(work).toMatchObject({ selectBusy: 'true', readout: LOADING, readoutShown: true });
  expect(work.framesSinceNotice).toBeGreaterThanOrEqual(2);
  // No notice left behind, and the readout says nothing unless Ultra fell back.
  expect(ultra.readout).toBe(ultra.effective === 'ultra' ? '' : ultra.readout);
  expect(errors).toEqual([]);
});

test('a pending Ultra choice cannot survive an options reset or enter Ultra after couch opens', async ({ page }) => {
  const errors = collectErrors(page);
  await bootAtTier(page, 'level=slice', 'high', { ride: false });
  await page.evaluate(installLoadingProbe);
  await holdFrames(page);
  await page.locator(TOGGLE).click();
  expect((await facts(page)).busy).toBe('true');
  await page.evaluate(() => window.game.resetOptions());
  expect(await facts(page)).toMatchObject({ quality: 'high', busy: null, switches: 0 });
  await releaseFrames(page);
  await holdFrames(page);
  await page.locator(TOGGLE).click();
  await page.evaluate(() => window.game.spawnSecondRider('trollina'));
  await releaseFrames(page);
  await page.waitForFunction(() => window.m39Loading.facts().busy === null);
  expect(await facts(page)).toMatchObject({ quality: 'high', effective: 'high', busy: null });
  expect(errors).toEqual([]);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

  test('the shared loading notice fits mobile, landscape and desktop, with no overflow', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootAtTier(page, 'level=slice', 'high', { ride: false });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.evaluate(installLoadingProbe);
    await holdFrames(page);
    await page.locator(TOGGLE).tap();
    expect(await page.locator('.euc-menu--title .euc-busy-sweep__bar').evaluate(node => Number.parseFloat(getComputedStyle(node).animationDuration))).toBeLessThanOrEqual(0.00001);

    const measure = () => page.evaluate(() => {
      const root = document.getElementById('boot')!;
      const toggle = root;
      const line = document.getElementById('boot-heading');
      const edges = (node: Element) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        toggle: edges(toggle),
        line: line === null ? null : edges(line),
        clipped: line === null ? 0 : Math.max(line.scrollWidth - line.clientWidth, line.scrollHeight - line.clientHeight),
        titleOverflow: root.scrollHeight - root.clientHeight,
        pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        shown: window.m39Loading.facts().noticeShown,
      };
    });

    for (const size of [
      { width: 375, height: 812 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      { width: 667, height: 375 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(size);
      const where = `${size.width}x${size.height}`;
      const fit = await measure();
      expect(fit.line, `no busy line at ${where}`).not.toBeNull();
      expect(fit.shown, `the busy line is not on screen at ${where}`).toBe(true);
      expect(fit.line!.left, `the line leaves the toggle at ${where}`).toBeGreaterThanOrEqual(fit.toggle.left - 0.5);
      expect(fit.line!.right, `the line leaves the toggle at ${where}`).toBeLessThanOrEqual(fit.toggle.right + 0.5);
      expect(fit.line!.top, `the line leaves the toggle at ${where}`).toBeGreaterThanOrEqual(fit.toggle.top - 0.5);
      expect(fit.line!.bottom, `the line leaves the toggle at ${where}`).toBeLessThanOrEqual(fit.toggle.bottom + 0.5);
      expect(fit.clipped, `the line's words are clipped at ${where}`).toBeLessThanOrEqual(1);
      expect(fit.titleOverflow, `the title scrolls at ${where}`).toBeLessThanOrEqual(1);
      expect(fit.pageOverflowX, `the page scrolls sideways at ${where}`).toBeLessThanOrEqual(0);
      if (size.width === 375) await attachShot(page, testInfo, 'toggle-loading-375');
    }
    await page.setViewportSize({ width: 375, height: 812 });

    await releaseFrames(page);
    await waitUntilSettled(page, 'true');

    // Settings at 375 px, leaving Ultra: the readout wraps inside the panel.
    await page.locator('.euc-menu--title [data-menu="settings"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
    await holdFrames(page);
    await page.locator(QUALITY).selectOption('high');
    const settings = await page.evaluate(() => {
      const readout = document.getElementById('boot-heading')!;
      const box = readout.getBoundingClientRect();
      return {
        right: box.right,
        left: box.left,
        clipped: readout.scrollWidth - readout.clientWidth,
        pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        facts: window.m39Loading.facts(),
      };
    });
    expect(settings.facts).toMatchObject({ readout: LEAVING, readoutShown: true, selectBusy: 'true' });
    expect(settings.left).toBeGreaterThanOrEqual(0);
    expect(settings.right).toBeLessThanOrEqual(375);
    expect(settings.clipped).toBeLessThanOrEqual(1);
    expect(settings.pageOverflowX).toBeLessThanOrEqual(0);
    await attachShot(page, testInfo, 'settings-leaving-375');
    await releaseFrames(page);
    await waitUntilSettled(page, 'false');
    expect(errors).toEqual([]);
  });
});
