/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { TRICK_RUN } from '../src/data/tuning.ts';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * 1.4.0 — Foundry Yard, the fifth venue, through the game's own doors
 * (`docs/PLANS.md` §51).
 *
 * **`src/level/skateparkLevel.test.ts` and `src/app/venues.test.ts` hold the
 * plan's facts headlessly**: one `start` checkpoint and no finish or lap, so
 * no Time trial, Track Day or Race can run here, and the Trick Run roster
 * carries the yard second. What only a browser can say is whether those facts
 * reach the screen: the boot, the five-place chooser's fit at every width the
 * game is played at, the solo and couch Trick Run entrances keeping the yard
 * (with the couch on §51.5.6's 2 × 2 grid), the notes naming the yard rather
 * than the other park, the world swaps to and from it, and a pause in the
 * middle of a run.
 *
 * Nothing here reads a frame interval or a frame rate (`AGENTS.md`).
 */

const YARD = 'level=skatepark';
/** The yard's record key: the builder's id, plus `~living-r1` if preparation
 * ever adds physical content (it does not today — zero population). */
const YARD_PLAN = /^foundry-yard-r\d+(~living-r1)?$/;
const PARK_PLAN = /^switchback-r\d+(~living-r1)?$/;
const WHARF_PLAN = /^euclaude-r\d+(~living-r1)?$/;

const TITLE = '.euc-menu--title';
const ROUTES = '.euc-menu--routes';
const COUCH = '.euc-menu--couch';
const VENUES = ['slice', 'track', 'switchback', 'euclaude', 'skatepark'];

/**
 * Where the frames land: repo-relative by default, never an absolute path
 * (`tools/export-source.mjs` refuses a tree that carries one).
 */
const SHOTS = process.env.SKATEPARK_SHOTS ?? 'test-results/skatepark/interface';

async function saveShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const body = await page.screenshot();
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, body);
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
  }));
}

/** Wait for a covered world swap to hand the player back their game. */
async function coverLifted(page: Page): Promise<void> {
  await page.waitForFunction(() => !window.game.snapshot().route.pending, undefined, { timeout: 60_000 });
}

async function openRoutes(page: Page): Promise<void> {
  await page.locator(`${TITLE} [data-menu="routes"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
}

async function routesBack(page: Page): Promise<void> {
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
}

/** Press a venue on the routes panel and wait for the world it asked for. */
async function pickVenue(page: Page, venue: string, plan: RegExp): Promise<void> {
  await page.locator(`${ROUTES} [data-menu="venue"][data-venue="${venue}"]`).click();
  await page.waitForFunction(
    (pattern) => new RegExp(pattern).test(window.game.levelPlan.recordWorldId ?? ''),
    plan.source,
    { timeout: 60_000 },
  );
  await coverLifted(page);
}

/** Each venue button of one panel, measured as the player meets it. */
function venueRow(page: Page, panel: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector)!;
    return [...root.querySelectorAll<HTMLElement>('[data-menu="venue"]')].map((button) => {
      const outer = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const inner = range.getBoundingClientRect();
      // Lines of the label, from its text alone (a picture is not a line).
      const tops = new Set<number>();
      const walk = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const text = document.createRange();
        text.selectNodeContents(node);
        for (const rect of text.getClientRects()) if (rect.width > 1) tops.add(Math.round(rect.top));
      }
      return {
        venue: button.dataset.venue ?? '',
        x: outer.left,
        top: Math.round(outer.top),
        width: outer.width,
        height: outer.height,
        lines: tops.size,
        inside: inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5
          && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5,
        clipped: button.scrollWidth > button.clientWidth + 1,
        onScreen: outer.left >= -0.5 && outer.right <= window.innerWidth + 0.5,
      };
    });
  }, panel);
}

/** Whether anything on the page scrolls sideways. */
function sidewaysScroll(page: Page, panel: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector)!;
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panel: root.scrollWidth - root.clientWidth,
    };
  }, panel);
}

function trickState(page: Page) {
  return page.evaluate(() => {
    const snap = window.game.snapshot();
    return {
      state: snap.app.state,
      phase: snap.trickRun.phase,
      seats: snap.trickRun.seats.length,
      elapsedSteps: snap.trickRun.elapsedSteps,
      durationSteps: snap.trickRun.durationSteps,
      world: snap.world.levelId,
    };
  });
}

/** The seats' riders, rounded to the centimetre the grid is laid out in. */
function seatPositions(page: Page) {
  return page.evaluate(() => {
    type Rider = { x: number; z: number };
    const game = window.game as unknown as { seats: Array<{ controller: Rider }> };
    return game.seats.map((seat) => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)]);
  });
}

// ---------------------------------------------------------------------------
// Boot, and the doors the plan's facts close
// ---------------------------------------------------------------------------

test('?level=skatepark boots the yard, names it, and offers no race, lap or time trial', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootToTitle(page, YARD);

  const world = await page.evaluate(() => ({
    levelId: window.game.snapshot().world.levelId,
    record: window.game.levelPlan.recordWorldId ?? '',
    lap: window.game.levelPlan.lap ?? null,
    kinds: window.game.levelPlan.checkpoints.map((checkpoint) => checkpoint.kind),
    challenge: window.game.snapshot().challenge.available,
    trackDay: window.game.snapshot().trackDay.available,
    link: window.game.snapshot().world.link,
  }));
  expect(world.levelId).toBe('skatepark');
  expect(world.record).toMatch(YARD_PLAN);
  // The facts the doors below are answered from (§51.5.6).
  expect(world.lap).toBeNull();
  expect(world.kinds).toEqual(['start']);
  expect(world.challenge, 'a lone start line was offered as a timed route').toBe(false);
  expect(world.trackDay, 'the yard was offered a lap').toBe(false);
  expect(new URL(world.link).search).toBe(`?${YARD}`);

  // The yard has its own place card, so the first card offers the town back
  // (1.4.0 owner ride); Trick Run names the yard, and Time trial is withdrawn
  // (no finish line to time to).
  await expect(page.locator(`${TITLE} [data-menu="start"] [data-note="start-place"]`)).toHaveText('The town');
  await expect(page.locator(`${TITLE} [data-menu="start-place"][data-place="skatepark"] [data-note="start-place"]`)).toHaveText('Foundry Yard');
  await expect(page.locator(`${TITLE} [data-menu="trick-run"] .euc-button__note`))
    .toHaveText('Score tricks at Foundry Yard');
  await expect(page.locator(`${TITLE} [data-menu="challenge"]`)).toBeHidden();
  await saveShot(page, testInfo, 'title-1000x700');

  // **Track Day never lists the yard.** The title's Track Day is the door to
  // the lap venues and keeps working from here, as it does from the Wharf;
  // what it offers is the roster of places that close a lap.
  await page.locator(`${TITLE} [data-menu="track-day"]`).click();
  const laps = page.locator('.euc-menu--tracks [data-menu="lap-venue"]');
  await expect(laps.first()).toBeVisible();
  expect(await laps.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.venue)))
    .toEqual(['track', 'switchback']);
  await page.locator('.euc-menu--tracks [data-menu="tracks-back"]').click();
  await expect(page.locator(`${TITLE} [data-menu="routes"]`)).toBeVisible();
  // Cancelling the chooser never loads a world.
  expect(await page.evaluate(() => window.game.snapshot().world.levelId)).toBe('skatepark');

  // The routes panel: the yard is lit and disabled, the contextual Trick Run
  // is offered and names the yard, and the status line after a press says so
  // (asserted in the swap case below).
  await openRoutes(page);
  await expect(page.locator(`${ROUTES} [data-menu="world"]`)).toContainText('Foundry Yard');
  await expect(page.locator(`${ROUTES} [data-menu="venue"][data-venue="skatepark"]`)).toBeDisabled();
  await expect(page.locator(`${ROUTES} [data-menu="venue"][data-venue="skatepark"]`))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`${ROUTES} [data-menu="trick-run"]`)).toBeVisible();
  await expect(page.locator(`${ROUTES} [data-menu="trick-run"] .euc-button__note`))
    .toHaveText('Score tricks at Foundry Yard');
  await routesBack(page);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Five places on the chooser
// ---------------------------------------------------------------------------

test('five places fit both chooser panels on a desktop window', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootToTitle(page, YARD);
  await page.waitForFunction(() => window.game.snapshot().couch.available);

  // **The fresh-route panel: three and two** (`game.css`, DESIGN §9z). One row
  // of five is 115 px a track on its 608 px strip, too narrow for
  // `Wheelhouse Wharf` behind its picture; two full rows fit every label on
  // one line.
  await openRoutes(page);
  await settle(page);
  const routes = await venueRow(page, ROUTES);
  expect(routes.map((button) => button.venue)).toEqual(VENUES);
  const routeRows = [...new Set(routes.map((button) => button.top))];
  expect(routeRows.length, 'the fresh-route row is not three and two').toBe(2);
  expect(routes.filter((button) => button.top === routeRows[0]).map((button) => button.venue))
    .toEqual(['slice', 'track', 'switchback']);
  for (const button of routes) {
    expect(button.inside, `${button.venue}'s words spill out of its button`).toBe(true);
    expect(button.clipped, `${button.venue}'s button scrolls sideways`).toBe(false);
    expect(button.lines, `${button.venue} wrapped on the fresh-route panel`).toBe(1);
  }
  // Both rows are full: the second row's two places split its width.
  const second = routes.filter((button) => button.top === routeRows[1]);
  expect(second.length).toBe(2);
  expect(Math.abs(second[0].width - second[1].width)).toBeLessThan(1);
  expect(second[0].width).toBeGreaterThan(routes[0].width);
  expect(await sidewaysScroll(page, ROUTES)).toEqual({ document: 0, panel: 0 });
  await saveShot(page, testInfo, 'routes-1000x700');
  await routesBack(page);

  // **The join panel: one row sized by its words.** Every label on one line,
  // so the row is no taller than the four-place row it replaced and the
  // panel's pinned fold (`tests/m25.spec.ts`) does not move.
  await page.locator(`${TITLE} [data-menu="couch"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  // Opening the couch raises the loading cover while the seats are built.
  await expect(page.locator('#boot')).toBeHidden();
  await settle(page);
  const couch = await venueRow(page, COUCH);
  expect(couch.map((button) => button.venue)).toEqual(VENUES);
  expect(new Set(couch.map((button) => button.top)).size, 'the join row broke into two').toBe(1);
  for (const button of couch) {
    expect(button.inside, `${button.venue}'s words spill out of its button`).toBe(true);
    expect(button.clipped, `${button.venue}'s button scrolls sideways`).toBe(false);
    expect(button.lines, `${button.venue} wrapped on the join panel`).toBe(1);
    expect(button.height, `${button.venue} grew past its one-line floor`).toBeLessThanOrEqual(40.5);
  }
  const fold = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.euc-menu--couch')!;
    return root.scrollHeight - root.clientHeight;
  });
  expect(fold, `the join panel has ${fold}px below the fold`).toBeLessThanOrEqual(1);
  expect(await sidewaysScroll(page, COUCH)).toEqual({ document: 0, panel: 0 });
  testInfo.annotations.push({
    type: 'fit',
    description: `join row widths ${couch.map((button) => `${button.venue} ${button.width.toFixed(1)}`).join(', ')}`,
  });
  await saveShot(page, testInfo, 'couch-join-1000x700');

  expect(errors).toEqual([]);
});

test.describe('five places on a phone', () => {
  // A coarse pointer on the desktop project, `tests/m36_5.spec.ts`'s recipe:
  // `(pointer: coarse)` matches, so the 44 px floors are measured.
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('portrait and landscape: every place is thumb-sized, nothing spills, nothing scrolls sideways', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await bootToTitle(page, YARD);
    await openRoutes(page);

    const sizes = [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 375, height: 667 },
      { width: 412, height: 839 },
      { width: 568, height: 320 },
      { width: 667, height: 375 },
      { width: 844, height: 390 },
    ];
    for (const size of sizes) {
      await page.setViewportSize(size);
      await settle(page);
      const at = `${size.width}x${size.height}`;
      const row = await venueRow(page, ROUTES);
      expect(row.map((button) => button.venue)).toEqual(VENUES);
      for (const button of row) {
        expect(button.inside, `${button.venue}'s words spill at ${at}`).toBe(true);
        expect(button.clipped, `${button.venue} scrolls sideways at ${at}`).toBe(false);
        expect(button.onScreen, `${button.venue} is off screen at ${at}`).toBe(true);
        expect(button.width, `${button.venue} is ${button.width}px wide at ${at}`).toBeGreaterThanOrEqual(44);
        expect(button.height, `${button.venue} is ${button.height}px tall at ${at}`).toBeGreaterThanOrEqual(44);
      }
      const rows = [...new Set(row.map((button) => button.top))];
      if (size.width < 600) {
        // Two columns, and the odd fifth place takes the whole last row.
        expect(rows.length, `not two by two plus one at ${at}`).toBe(3);
        const last = row[row.length - 1];
        expect(last.width, `the fifth place is a half row at ${at}`).toBeGreaterThan(row[0].width * 1.8);
      } else {
        expect(rows.length, `not three and two at ${at}`).toBe(2);
      }
      expect(await sidewaysScroll(page, ROUTES), `sideways scroll at ${at}`)
        .toEqual({ document: 0, panel: 0 });
      testInfo.annotations.push({
        type: 'fit',
        description: `${at}: ${row.map((button) => `${button.venue} ${button.width.toFixed(1)}x${button.height.toFixed(1)}/${button.lines}`).join(', ')}`,
      });
      if (size.width === 320 || size.width === 667) {
        await page.locator(`${ROUTES} [data-menu="venue-chooser"]`).scrollIntoViewIfNeeded();
        await saveShot(page, testInfo, `routes-phone-${at}`);
      }
    }

    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Trick Run, solo and on the couch
// ---------------------------------------------------------------------------

test('a solo Trick Run starts at the yard, pauses and resumes on the same clock', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootToTitle(page, YARD);

  // The title's button keeps the loaded park rather than bringing Switchback.
  await page.locator(`${TITLE} [data-menu="trick-run"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');
  await page.evaluate(() => window.game.loop.setRunning(false));
  const armed = await trickState(page);
  expect(armed.world, 'the yard\'s Trick Run brought another world').toBe('skatepark');
  expect(armed.phase).toBe('running');
  expect(armed.seats).toBe(1);
  expect(armed.durationSteps).toBe(TRICK_RUN.durationSteps);
  // The solo start: 18 m behind the line on the run-up floor (§51.5.6). The
  // rider has rolled a few steps since the press, so only the lane is exact.
  const [[x, z]] = await seatPositions(page);
  expect(Math.abs(z - 124), `the rider started off the run-up lane (z ${z})`).toBeLessThan(0.2);
  expect(x).toBeGreaterThan(97);
  expect(x).toBeLessThan(104);

  // Ride a little, then pause mid-run: the clock stands still behind the card.
  await page.evaluate(() => {
    window.game.setActionsFor(0, { throttle: 0.4 });
    window.game.advance(240);
    window.game.setActionsFor(0, { throttle: 0 });
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.advance(2));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  const frozenAt = (await trickState(page)).elapsedSteps;
  await page.evaluate(() => window.game.advance(300));
  expect((await trickState(page)).elapsedSteps, 'the clock aged behind the pause card').toBe(frozenAt);
  await expect(page.locator('.euc-menu--pause [data-menu="world"]')).toContainText('Foundry Yard');
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"] .euc-button__label')).toHaveText('End run');
  await saveShot(page, testInfo, 'pause-trick-run-1000x700');

  // Resume is the same attempt.
  await page.locator('.euc-menu--pause [data-menu="resume"]').click();
  await page.evaluate(() => window.game.loop.setRunning(false));
  const resumed = await trickState(page);
  expect(resumed.state).toBe('trickRun');
  expect(resumed.world).toBe('skatepark');
  expect(resumed.elapsedSteps, 'Resume started a second clock').toBeGreaterThanOrEqual(frozenAt);
  expect(resumed.elapsedSteps).toBeLessThan(frozenAt + 300);
  await page.evaluate(() => window.game.advance(60));
  expect((await trickState(page)).elapsedSteps).toBeGreaterThanOrEqual(resumed.elapsedSteps + 60);

  expect(errors).toEqual([]);
});

async function fakePads(page: Page, count: number): Promise<void> {
  await page.addInitScript((wanted) => {
    const pads = Array.from({ length: wanted }, (_unused, index) => ({
      index,
      id: `fake standard pad ${index}`,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    }));
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  }, count);
}

async function claimWithPad(page: Page, index: number): Promise<void> {
  await page.evaluate(async (at) => {
    type Pads = { buttons: { pressed: boolean; value: number }[] }[];
    const pad = (window as unknown as { fakePads: Pads }).fakePads[at];
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[0].pressed = true;
    pad.buttons[0].value = 1;
    await frame();
    pad.buttons[0].pressed = false;
    pad.buttons[0].value = 0;
    await frame();
  }, index);
}

/** §51.5.6's couch grid: 1.6 m apart across the lane, 3.2 m stagger, all on
 * the level run-up and none inside a zone. Seat 0 takes the +Z column. */
const GRID = [[112.8, 125.6], [112.8, 122.4], [109.6, 125.6], [109.6, 122.4]];

test('a 2-seat couch Trick Run starts at the yard on its grid', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootToTitle(page, YARD);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator(`${TITLE} [data-menu="couch"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await expect(page.locator('#boot')).toBeHidden();
  await settle(page);
  await claimWithPad(page, 0);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().input.devices[1] === 'keyboard');

  // The chooser's paragraph names the park the run would be ridden at — the
  // yard, which is loaded — and keeps BelVar for the race, which this world
  // does not lap.
  const mode = `${COUCH} [data-menu="couch-mode"][data-couch-mode="trickRun"]`;
  await page.locator(mode).click();
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('trickRun');
  const note = page.locator(`${COUCH} .euc-couch__mode .euc-field__note`).last();
  await expect(note).toContainText('one clock at Foundry Yard');
  await expect(note).toContainText('three laps of BelVar Circuit');
  await expect(note).not.toContainText('Switchback');

  await page.locator(`${COUCH} [data-menu="couch-start"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun', undefined, { timeout: 60_000 });
  await coverLifted(page);
  await expect(page.locator('#boot')).toBeHidden();
  await page.evaluate(() => window.game.loop.setRunning(false));
  const armed = await trickState(page);
  expect(armed.world, 'the couch run brought another world').toBe('skatepark');
  expect(armed.phase).toBe('running');
  expect(armed.seats).toBe(2);
  expect(await page.evaluate(() => window.game.snapshot().input.devices.length), 'a guest went home').toBe(2);
  // Seats rolled a few steps between the press and the freeze: the lanes are
  // exact, the rows within a step's travel.
  const seats = await seatPositions(page);
  for (const [index, [x, z]] of seats.entries()) {
    expect(Math.abs(z - GRID[index][1]), `seat ${index} left its lane (z ${z})`).toBeLessThan(0.05);
    expect(x, `seat ${index} started ahead of its slot`).toBeGreaterThanOrEqual(GRID[index][0] - 0.05);
    expect(x, `seat ${index} is far past its slot`).toBeLessThan(GRID[index][0] + 3);
  }
  await saveShot(page, testInfo, 'couch-trick-run-2-seats');

  expect(errors).toEqual([]);
});

test('a 4-seat room is laid out on the 2 x 2 grid of §51.5.6', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, YARD);
  await page.evaluate(() => window.game.setAppState('couchJoin'));
  await page.waitForFunction(() => window.game.appState.current === 'couchJoin' && window.game.seatCount >= 2,
    undefined, { timeout: 60_000 });
  // The bridge in one task, so the grid is read before a step has run.
  const result = await page.evaluate(() => {
    const game = window.game;
    while (game.seatCount < 4) game.spawnRider();
    game.loop.setRunning(false);
    game.startTrickRun();
    type Rider = { x: number; z: number; state: string };
    const seats = (game as unknown as { seats: Array<{ controller: Rider }> }).seats;
    const snap = game.snapshot();
    return {
      state: snap.app.state,
      world: snap.world.levelId,
      armed: snap.trickRun.seats.length,
      seats: seats.map((seat) => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2), seat.controller.state]),
    };
  });
  expect(result.state).toBe('trickRun');
  expect(result.world).toBe('skatepark');
  expect(result.armed).toBe(4);
  expect(result.seats).toEqual(GRID.map(([x, z]) => [x, z, 'mounted']));
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// World swaps
// ---------------------------------------------------------------------------

test('the yard swaps with Switchback and the Wharf, and every note follows the loaded place', async ({ page }, testInfo) => {
  test.slow();
  const errors = collectErrors(page);
  await bootToTitle(page, YARD);
  await openRoutes(page);
  const routeNote = page.locator(`${ROUTES} [data-menu="trick-run"] .euc-button__note`);
  const titleNote = page.locator(`${TITLE} [data-menu="trick-run"] .euc-button__note`);

  // Yard → Switchback: the other park, its own name on the routes action.
  await pickVenue(page, 'switchback', PARK_PLAN);
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');
  await expect(page.locator(`${ROUTES} [data-menu="trick-run"]`)).toBeVisible();
  await expect(routeNote).toHaveText('Score tricks at Switchback Park');

  // Switchback → the Wharf: no park, so the routes action withdraws and the
  // title's note names where its button would take you.
  await pickVenue(page, 'euclaude', WHARF_PLAN);
  await expect(page.locator(`${ROUTES} [data-menu="trick-run"]`)).toBeHidden();
  await expect(page.locator(`${ROUTES} [data-menu="route-status"]`)).not.toContainText('Trick Run');
  await routesBack(page);
  await expect(titleNote).toHaveText('Score tricks at Switchback Park');
  await openRoutes(page);

  // The Wharf → the yard: the line says what the press made available and
  // never offers a lap.
  await pickVenue(page, 'skatepark', YARD_PLAN);
  await expect(page.locator(`${ROUTES} [data-menu="route-status"]`)).toHaveText(
    'Foundry Yard is ready. Trick Run scores your tricks here, or Back to the title to ride it.',
  );
  await expect(page.locator(`${ROUTES} [data-menu="trick-run"]`)).toBeVisible();
  await expect(routeNote).toHaveText('Score tricks at Foundry Yard');
  expect(await page.evaluate(() => window.location.search)).toBe(`?${YARD}`);
  await saveShot(page, testInfo, 'routes-after-swaps');

  // And the routes panel's action is the door: it arms the run here.
  await page.locator(`${ROUTES} [data-menu="trick-run"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');
  const armed = await trickState(page);
  expect(armed.world).toBe('skatepark');
  expect(armed.phase).toBe('running');

  expect(errors).toEqual([]);
});
