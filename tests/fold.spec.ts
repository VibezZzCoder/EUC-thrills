/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * Folding phones — the iPhone Duo and Android foldables (2026-10-28).
 *
 * **This spec runs in the `fold` project only**: WebKit, with `hasTouch` and
 * `isMobile` from the iPhone 15 descriptor (see `playwright.config.ts`). It is
 * upstream WebKit, not branded Safari, and `setViewportSize` is not a hinge:
 * passing here is "layout and resize coverage passed", never "verified on a
 * Duo". Folding, Safari's own toolbars, heat and frame rate stay physical-phone
 * checks.
 *
 * The sizes are WebKit's Safari 27.1 reference for the Duo, in CSS pixels,
 * at the small (toolbars shown) and large (toolbars retracted) heights. Short
 * landscape with Safari's toolbar showing leaves 280–300 px, which is where
 * the menus that fit at the usual test size have the least room.
 *
 * What each size has to hold, on the title, a ride, pause, settings and the
 * results card:
 *   - the page itself never scrolls;
 *   - the controls sit inside the window and never over the rider or the
 *     protected middle fifth (`DESIGN.md` §9), and the HUD stays off them, the
 *     rider and the middle fifth;
 *   - every button on title, pause and results is on screen at scroll 0
 *     (settings is a long list and scrolls by design — §9);
 *   - a real tap on the title's mode button and the pause chip works.
 *
 * The continuity case then rides one session through every size without a
 * reload: same page, same world, a running loop and working input after each
 * change, and no finger left held down by a resize.
 */

interface FoldCase {
  readonly name: string;
  readonly width: number;
  readonly smallHeight: number;
  readonly largeHeight: number;
}

const FOLD_VIEWPORTS: readonly FoldCase[] = [
  { name: 'outer-portrait', width: 382, smallHeight: 580, largeHeight: 618 },
  { name: 'outer-landscape', width: 594, smallHeight: 368, largeHeight: 406 },
  { name: 'inner-portrait', width: 669, smallHeight: 867, largeHeight: 902 },
  { name: 'inner-landscape', width: 951, smallHeight: 585, largeHeight: 620 },
  { name: 'split-view', width: 385, smallHeight: 571, largeHeight: 609 },
];

/** Any phone on its side with Safari's toolbar showing. */
const SHORT_LANDSCAPE = [
  { width: 667, height: 280 },
  { width: 780, height: 298 },
] as const;

function fold(name: string): FoldCase {
  const found = FOLD_VIEWPORTS.find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`no fold case ${name}`);
  return found;
}

interface Box { x: number; y: number; w: number; h: number }

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Whether the document itself can be scrolled in either axis. */
function pageScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    window.scrollTo(9999, 9999);
    const moved = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(0, 0);
    return {
      moved,
      wider: root.scrollWidth > window.innerWidth,
      taller: root.scrollHeight > window.innerHeight,
    };
  });
}

async function expectNoPageScroll(page: Page, where: string) {
  expect(await pageScroll(page), `${where}: the page scrolled`).toEqual({
    moved: { x: 0, y: 0 }, wider: false, taller: false,
  });
}

/**
 * Every control on a menu, where the player is handed it: off the window, or
 * under the fold of the menu's own scroll container, counts as missing.
 */
function menuFit(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const menu = document.querySelector<HTMLElement>(selector);
    if (menu === null) throw new Error(`${selector} is not mounted`);
    const port = menu.getBoundingClientRect();
    const shown = (node: Element) => node.getClientRects().length > 0
      && getComputedStyle(node).visibility !== 'hidden';
    const missing = [...menu.querySelectorAll('button, a[href], input, select')]
      .filter(shown)
      .map((node) => ({ node, box: node.getBoundingClientRect() }))
      .filter(({ box }) => box.top < Math.max(0, port.top) - 0.5
        || box.bottom > Math.min(window.innerHeight, port.bottom) + 0.5
        || box.left < -0.5 || box.right > window.innerWidth + 0.5)
      .map(({ node, box }) => `${(node as HTMLElement).dataset.menu ?? node.textContent?.trim()}`
        + ` @${Math.round(box.top)}–${Math.round(box.bottom)}`);
    const heading = menu.querySelector('h1, h2')?.getBoundingClientRect() ?? null;
    return {
      missing,
      scrolled: menu.scrollTop,
      headingTop: heading === null ? null : heading.top,
    };
  }, selector);
}

async function expectMenuFits(page: Page, selector: string, where: string) {
  const fit = await menuFit(page, selector);
  expect(fit.missing, `${where}: controls off screen`).toEqual([]);
  expect(fit.scrolled, `${where}: opened already scrolled`).toBeLessThanOrEqual(1);
  expect(fit.headingTop, `${where}: heading above the window`).not.toBeNull();
  expect(fit.headingTop!, `${where}: heading above the window`).toBeGreaterThanOrEqual(0);
}

/**
 * The ride, measured: controls against the window, the rider and the middle
 * fifth; HUD lanes against the controls. The rider's box is projected from
 * feet to head through the game's own camera.
 */
function rideFacts(page: Page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const { position } = window.game.snapshot().euc;
    const toPx = (p: { x: number; y: number }) => ({
      x: (p.x * 0.5 + 0.5) * width,
      y: (0.5 - p.y * 0.5) * height,
    });
    const feet = toPx(window.qa.projectPoint(position.x, position.y, position.z));
    const head = toPx(window.qa.projectPoint(position.x, position.y + 1.75, position.z));
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const shown = (node: Element) => node.getClientRects().length > 0
      && getComputedStyle(node).visibility !== 'hidden';
    const controls = [...document.querySelectorAll(
      '.euc-touch__stick, [data-touch="crouch"], [data-touch="hop"], [data-touch-tap]',
    )].filter(shown).map((node) => ({
      id: node.getAttribute('data-touch') ?? node.getAttribute('data-touch-tap') ?? 'stick',
      ...box(node),
    }));
    const lanes = [...document.querySelectorAll('.euc-hud [class*="euc-hud__"]')]
      .filter((node) => shown(node) && node.parentElement !== null
        && (node.parentElement.classList.contains('euc-hud')
          || node.parentElement.classList.contains('euc-hud-seat')))
      .map((node) => ({ id: node.className.toString().split(' ')[0], ...box(node) }))
      .filter((lane) => lane.w > 0 && lane.h > 0);
    return {
      width,
      height,
      rider: { x: Math.min(feet.x, head.x) - 20, y: head.y, w: 40, h: feet.y - head.y },
      controls,
      lanes,
    };
  });
}

async function expectRideFits(page: Page, where: string) {
  const facts = await rideFacts(page);
  const middle = { x: facts.width * 0.4, y: facts.height * 0.4, w: facts.width * 0.2, h: facts.height * 0.2 };
  expect(facts.controls.length, `${where}: no controls drawn`).toBeGreaterThanOrEqual(6);
  expect(facts.rider.h, `${where}: the rider is off the frame`).toBeGreaterThan(40);
  for (const control of facts.controls) {
    expect(control.x, `${where}: ${control.id} off the left`).toBeGreaterThanOrEqual(0);
    expect(control.y, `${where}: ${control.id} off the top`).toBeGreaterThanOrEqual(0);
    expect(control.x + control.w, `${where}: ${control.id} off the right`).toBeLessThanOrEqual(facts.width + 0.5);
    expect(control.y + control.h, `${where}: ${control.id} off the bottom`).toBeLessThanOrEqual(facts.height + 0.5);
    expect(overlaps(control, facts.rider), `${where}: ${control.id} over the rider`).toBe(false);
    expect(overlaps(control, middle), `${where}: ${control.id} in the middle fifth`).toBe(false);
    for (const lane of facts.lanes) {
      expect(overlaps(control, lane), `${where}: ${lane.id} on ${control.id}`).toBe(false);
    }
  }
  // The HUD keeps the centre and the rider clear too — measured with the
  // first-ride prompt up, which is the tallest the cue lane gets at the start.
  for (const lane of facts.lanes) {
    expect(overlaps(lane, middle), `${where}: ${lane.id} in the middle fifth`).toBe(false);
    expect(overlaps(lane, facts.rider), `${where}: ${lane.id} over the rider`).toBe(false);
  }
  return facts;
}

async function shoot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

/** Title → Track Day at BelVar, by real taps on the title and venue buttons. */
async function rideTrackDay(page: Page) {
  await page.locator('.euc-menu--title [data-menu="track-day"]').tap();
  await page.locator('.euc-menu--tracks [data-venue="track"]').tap();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay'
    && window.game.snapshot().app.acceptsRideInput);
}

/** One lap by gate, frozen-stepped, so the results card has a lap to report. */
async function countOneLap(page: Page) {
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const order = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
    const cross = (cp: (typeof order)[number], hold: number) => {
      game.placeRider({ x: cp.centre.x, y: cp.centre.y, z: cp.centre.z }, cp.headingY);
      game.advance(2);
      game.advance(hold);
    };
    cross(order[0], 30);
    for (const cp of order.slice(1)) cross(cp, 60);
    cross(order[0], 2);
    // Thawed: the pause chip latches a one-shot the fixed step consumes.
    game.loop.setRunning(true);
  });
}

async function setSize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(({ width, height }) => {
    const viewport = window.game.renderer.viewport();
    return viewport.width === width && viewport.height === height;
  }, { width, height });
}

/**
 * The stick, through real touch pointer events: a fresh finger lands on the
 * zone, pushes up, the ride must answer, and the finger lifts.
 */
async function stickRides(page: Page, pointerId: number) {
  const zone = await page.locator('[data-touch="stick"]').boundingBox();
  if (zone === null) throw new Error('the stick zone has no box');
  const x = zone.x + zone.width / 2;
  const y = zone.y + zone.height / 2;
  const fire = (type: string, dx: number, dy: number) => page.evaluate(({ type, x, y, id }) => {
    const target = type === 'pointerdown' ? document.querySelector('[data-touch="stick"]')! : window;
    target.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  }, { type, x: x + dx, y: y + dy, id: pointerId });
  await fire('pointerdown', 0, 0);
  await fire('pointermove', 0, -120);
  await page.evaluate(() => window.qa.advance(6));
  const throttle = (await page.evaluate(() => window.game.snapshot().actions)).throttle;
  await fire('pointerup', 0, -120);
  await page.evaluate(() => window.qa.advance(2));
  return throttle;
}

test.describe('Folding phones — the Duo sizes, cold', () => {
  for (const size of FOLD_VIEWPORTS) {
    test(`${size.name} ${size.width}×${size.smallHeight}/${size.largeHeight}: title, ride, pause, settings and results fit`, async ({ page }, info) => {
      test.setTimeout(240_000);
      const errors = collectErrors(page);
      const heights = [size.smallHeight, size.largeHeight];
      await page.setViewportSize({ width: size.width, height: size.smallHeight });
      await bootToTitle(page, 'level=track');

      for (const height of heights) {
        await setSize(page, size.width, height);
        await expectNoPageScroll(page, `title ${height}`);
        await expectMenuFits(page, '.euc-menu--title', `title ${size.width}×${height}`);
      }
      await setSize(page, size.width, size.smallHeight);
      await shoot(page, info, `${size.name}-title`);

      await rideTrackDay(page);
      for (const height of heights) {
        await setSize(page, size.width, height);
        await expectNoPageScroll(page, `ride ${height}`);
        await expectRideFits(page, `ride ${size.width}×${height}`);
      }
      await setSize(page, size.width, size.smallHeight);
      await shoot(page, info, `${size.name}-ride`);

      await countOneLap(page);
      await page.locator('[data-touch-tap="pause"]').tap();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
      for (const height of heights) {
        await setSize(page, size.width, height);
        await expectNoPageScroll(page, `pause ${height}`);
        await expectMenuFits(page, '.euc-menu--pause', `pause ${size.width}×${height}`);
      }
      await setSize(page, size.width, size.smallHeight);
      await shoot(page, info, `${size.name}-pause`);

      // Settings is a long list and scrolls inside its own panel (§9); the
      // page must not, and the heading must open on screen.
      await page.locator('.euc-menu--pause [data-menu="settings"]').tap();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
      await expectNoPageScroll(page, 'settings');
      const settings = await menuFit(page, '.euc-menu--settings');
      expect(settings.scrolled).toBeLessThanOrEqual(1);
      expect(settings.headingTop!).toBeGreaterThanOrEqual(0);
      await shoot(page, info, `${size.name}-settings`);
      await page.locator('.euc-menu--settings [data-menu="back"]').tap();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');

      await page.locator('.euc-menu--pause [data-menu="end-session"]').tap();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
      for (const height of heights) {
        await setSize(page, size.width, height);
        await expectNoPageScroll(page, `results ${height}`);
        await expectMenuFits(page, '.euc-menu--results', `results ${size.width}×${height}`);
      }
      await setSize(page, size.width, size.smallHeight);
      await shoot(page, info, `${size.name}-results`);

      expect(errors).toEqual([]);
    });
  }

  test('short landscape with the toolbar showing: ride, pause and results still fit', async ({ page }, info) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    const [first] = SHORT_LANDSCAPE;
    await page.setViewportSize(first);
    await bootToTitle(page, 'level=track');
    await rideTrackDay(page);
    await countOneLap(page);
    for (const size of SHORT_LANDSCAPE) {
      await setSize(page, size.width, size.height);
      await expectNoPageScroll(page, `ride ${size.width}×${size.height}`);
      await expectRideFits(page, `ride ${size.width}×${size.height}`);
    }
    await page.locator('[data-touch-tap="pause"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    for (const size of SHORT_LANDSCAPE) {
      await setSize(page, size.width, size.height);
      await expectMenuFits(page, '.euc-menu--pause', `pause ${size.width}×${size.height}`);
    }
    await page.locator('.euc-menu--pause [data-menu="end-session"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
    for (const size of SHORT_LANDSCAPE) {
      await setSize(page, size.width, size.height);
      await expectNoPageScroll(page, `results ${size.width}×${size.height}`);
      await expectMenuFits(page, '.euc-menu--results', `results ${size.width}×${size.height}`);
      await shoot(page, info, `results-${size.width}x${size.height}`);
    }
    expect(errors).toEqual([]);
  });
});

test('one session survives open, rotate, Split View, close and turn, with working touch after each', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  const outer = fold('outer-portrait');
  await page.setViewportSize({ width: outer.width, height: outer.smallHeight });
  await bootToTitle(page, 'level=track');
  await rideTrackDay(page);

  // A document-lifetime token: any reload or remount of the page loses it.
  const session = await page.evaluate(() => {
    const token = `fold-${performance.timeOrigin}`;
    (window as unknown as { foldSession: string }).foldSession = token;
    return { token, world: window.game.levelPlan.recordWorldId };
  });

  // A finger held on the stick through the first change must be dropped, not
  // left riding the wheel on the new shape.
  const zone = await page.locator('[data-touch="stick"]').boundingBox();
  await page.evaluate(({ x, y }) => {
    document.querySelector('[data-touch="stick"]')!.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 70, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 70, pointerType: 'touch', clientX: x, clientY: y - 120, bubbles: true,
    }));
  }, { x: zone!.x + zone!.width / 2, y: zone!.y + zone!.height / 2 });
  await page.evaluate(() => window.qa.advance(6));
  expect((await page.evaluate(() => window.game.snapshot().actions)).throttle).toBeGreaterThan(0);

  const journey = ['inner-portrait', 'inner-landscape', 'split-view', 'inner-landscape', 'outer-portrait', 'outer-landscape'];
  let pointer = 80;
  for (const [index, name] of journey.entries()) {
    const size = fold(name);
    const changesBefore = await page.evaluate(() => window.game.snapshot().layoutChanges);
    await setSize(page, size.width, size.smallHeight);
    await page.waitForFunction((n) => window.game.snapshot().layoutChanges > n, changesBefore);
    const where = `${index + 1}. ${name} ${size.width}×${size.smallHeight}`;

    if (index === 0) {
      await page.evaluate(() => window.qa.advance(4));
      expect((await page.evaluate(() => window.game.snapshot().actions)).throttle,
        `${where}: the held finger survived the change`).toBe(0);
    }

    // The same document, the same world, the same ride, and a loop that runs.
    const now = await page.evaluate(() => ({
      token: (window as unknown as { foldSession?: string }).foldSession,
      world: window.game.levelPlan.recordWorldId,
      state: window.game.snapshot().app.state,
      frames: window.game.snapshot().loop.frames,
    }));
    expect({ token: now.token, world: now.world, state: now.state }, where)
      .toEqual({ token: session.token, world: session.world, state: 'trackDay' });
    await page.waitForFunction((frames) => window.game.snapshot().loop.frames > frames + 2, now.frames);

    await expectNoPageScroll(page, where);
    await expectRideFits(page, where);
    expect(await stickRides(page, pointer++), `${where}: the stick did not ride`).toBeGreaterThan(0);

    // A real tap on the pause chip, and a real tap back into the ride.
    await page.locator('[data-touch-tap="pause"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    await expectMenuFits(page, '.euc-menu--pause', where);
    await page.locator('.euc-menu--pause [data-menu="resume"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay'
      && window.game.snapshot().app.acceptsRideInput);
    await shoot(page, info, `${index + 1}-${name}`);
  }
  expect(errors).toEqual([]);
});
