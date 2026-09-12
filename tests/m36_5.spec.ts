/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * M36 Phase 5 — the venue chooser, and every mode entrance walked from the park.
 *
 * **`src/app/venues.test.ts`, `src/app/records.test.ts` and
 * `src/app/appState.test.ts` already hold the rules headlessly**: which ids are
 * offered, that a park lap files under its own plan id, and that no transition
 * went missing. Nothing below repeats them. What only a browser can say is
 * whether the *press* composes — whether a row drawn in two panels swaps a
 * world behind an open card, whether Track Day, Race, Chase, Knockabout,
 * retry, back, pause, results and the couch mode switch all still land on
 * legal states when the world under them is Switchback Park rather than
 * BelVar, and whether the room that sat down is the room that arrives on the
 * first racing frame.
 *
 * Every race here is driven through the bridge by standing riders on their own
 * gates, which is `tests/m27.spec.ts`'s recipe and is deliberate: a scripted
 * finish is the only way to assert an *order* without asserting a lap time.
 * The physically-ridden park laps are `tests/m36.spec.ts`'s job and are not
 * repeated.
 *
 * Nothing here reads a frame interval or a frame rate (`AGENTS.md`).
 */

/** The link that was the park's only entrance before this phase, and still works. */
const PARK = 'level=switchback';
const BELVAR = 'level=track';

/** The two plan ids a record can be filed under from the chooser's lap venues. */
const PARK_PLAN = 'switchback-r4';
const BELVAR_PLAN = 'belvar-r1';
const CITY_PLAN = 'm7-slice';

/**
 * Where the frames land. **An environment variable with a repo-relative
 * default**, never an absolute path written down here: a scratchpad path
 * carries the machine's own account name and `tools/export-source.mjs` refuses
 * to publish a tree containing one.
 */
const SHOTS = `${process.env.M36_SHOTS ?? 'test-results/m36'}/phase5`;

const ROUTES = '.euc-menu--routes';
const COUCH = '.euc-menu--couch';

function venueButton(panel: string, venue: string): string {
  return `${panel} [data-menu="venue"][data-venue="${venue}"]`;
}

async function saveShot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const body = clip ? await page.screenshot({ clip }) : await page.screenshot();
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, body);
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

/** Title → Fresh route, which is where the chooser stands for one player. */
async function openRoutes(page: Page, query = ''): Promise<void> {
  await bootToTitle(page, query);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
}

/** Press a venue and wait for the world the press asked for. */
async function pickVenue(page: Page, panel: string, venue: string, planId: string): Promise<void> {
  await page.locator(venueButton(panel, venue)).click();
  await page.waitForFunction((id) => window.game.levelPlan.id === id, planId);
}

const planId = (page: Page): Promise<string> => page.evaluate(() => window.game.levelPlan.id);
const appState = (page: Page): Promise<string> => page.evaluate(
  () => window.game.snapshot().app.state,
);

/**
 * Whether the fresh-route panel has withdrawn its venue row, as the *writer*
 * left it.
 *
 * The DOM property rather than Playwright's visibility. `Menus.writeVenueOffer`
 * sets `hidden`, which is the whole of its contract; whether the element then
 * leaves the screen belongs to `ui/game.css` and is read by `venueOfferBox`
 * beside it — the two halves disagreed until M36 Phase 6, which is why they
 * are measured apart.
 */
const venueOfferHidden = (page: Page): Promise<boolean> => page.evaluate(
  () => document.querySelector<HTMLElement>(
    '.euc-menu--routes [data-menu="venue-chooser"]',
  )?.hidden ?? false,
);

/**
 * What the row actually occupies — the other half of the withdrawal.
 *
 * `display` is the property the defect turned on (an author's `display: grid`
 * on `.euc-couch__mode` beat the user agent's `[hidden] { display: none }`),
 * and the height is what a player would have seen: 98.09 px of three buttons
 * offering places the refused mode cannot ride.
 */
const venueOfferBox = (page: Page): Promise<{ display: string; height: number }> => page.evaluate(
  () => {
    const row = document.querySelector<HTMLElement>('.euc-menu--routes [data-menu="venue-chooser"]');
    if (row === null) return { display: 'missing', height: -1 };
    return {
      display: getComputedStyle(row).display,
      height: row.getBoundingClientRect().height,
    };
  },
);

interface Line {
  centre: { x: number; y: number; z: number };
  headingY: number;
  id: string;
}

/** The lap's gates, in route order — m23's and m27's shape. */
function raceLines(page: Page): Promise<Line[]> {
  return page.evaluate(() => [...window.game.levelPlan.checkpoints]
    .sort((a, b) => a.routeIndex - b.routeIndex)
    .map((cp) => ({
      centre: { x: cp.centre.x, y: cp.centre.y, z: cp.centre.z },
      headingY: cp.headingY,
      id: cp.id,
    })));
}

/** Stand one rider on a gate long enough to be seen crossing it — m23's helper. */
async function crossLine(page: Page, line: Line, hold = 60): Promise<void> {
  await page.evaluate(({ centre, headingY, hold: steps }) => {
    window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
    window.game.advance(2);
    window.game.advance(steps);
  }, { centre: line.centre, headingY: line.headingY, hold });
}

/** Every seat over one gate together. */
async function crossAll(page: Page, line: Line, seats: number): Promise<void> {
  await page.evaluate(({ centre, headingY, count }) => {
    const game = window.game;
    for (let seat = 0; seat < count; seat += 1) game.placeRider({ ...centre }, headingY, seat);
    game.advance(2);
    game.advance(30);
  }, { centre: line.centre, headingY: line.headingY, count: seats });
}

// ---------------------------------------------------------------------------
// Pads and the join panel — m26's and m27's recipes, unchanged.
// ---------------------------------------------------------------------------

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

/** Press and release A on one pad, a real frame apart. */
async function claimWithPad(page: Page, index: number, button = 0): Promise<void> {
  await page.evaluate(async ({ at, button }) => {
    type Pads = { buttons: { pressed: boolean; value: number }[] }[];
    const pad = (window as unknown as { fakePads: Pads }).fakePads[at];
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[button].pressed = true;
    pad.buttons[button].value = 1;
    await frame();
    pad.buttons[button].pressed = false;
    pad.buttons[button].value = 0;
    await frame();
  }, { at: index, button });
}

/**
 * A room of `seats` sitting on the join panel, with pads first and the
 * keyboard last — m27's order, and the panel's own: it opens with two chairs
 * and puts another out only once every chair is taken.
 */
async function sitDown(page: Page, seats: number): Promise<void> {
  await fakePads(page, seats - 1);
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  // The priming frames m25 requires: a button already down when the panel
  // appeared must claim nothing.
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
  for (let pad = 0; pad < seats - 1; pad += 1) {
    await claimWithPad(page, pad);
    await page.waitForFunction(
      (index) => window.game.snapshot().input.devices[index] === `pad:${index}`,
      pad,
    );
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (last) => window.game.snapshot().input.devices[last] === 'keyboard',
    seats - 1,
  );
}

/** The whole couch entrance at a chosen venue: sit, pick the place, pick Race, start. */
async function startPanelRaceAt(page: Page, seats: number, venue: string, plan: string): Promise<void> {
  await sitDown(page, seats);
  await pickVenue(page, COUCH, venue, plan);
  await page.locator(`${COUCH} [data-menu="couch-mode"][data-couch-mode="race"]`).click();
  await page.locator(`${COUCH} [data-menu="couch-start"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
}

// ---------------------------------------------------------------------------
// The control itself
// ---------------------------------------------------------------------------

test('the chooser stands in the two panels that choose a world, and nowhere else', async ({ page }) => {
  // §36 Phase 5's shape, asserted as a *census* rather than as two lookups:
  // the claim is that a place is offered where places are already chosen and
  // nowhere else, so a fourth copy appearing on the title or the pause card
  // has to fail here. A title button is the thing this design refused (the
  // eight-stop grid two pad walks name stop by stop), so the scan is what
  // keeps that refusal true.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const census = await page.evaluate(() => {
    const panelOf = (node: Element): string => {
      const panel = node.closest('.euc-menu');
      if (panel === null) return 'loose';
      return [...panel.classList].find((name) => name.startsWith('euc-menu--')) ?? 'unnamed';
    };
    return {
      groups: [...document.querySelectorAll('[data-menu="venue-chooser"]')].map(panelOf),
      buttons: [...document.querySelectorAll('[data-menu="venue"]')].map((node) => ({
        panel: panelOf(node),
        venue: (node as HTMLElement).dataset.venue ?? '',
        label: node.textContent?.trim() ?? '',
        pressed: node.getAttribute('aria-pressed'),
        disabled: (node as HTMLButtonElement).disabled,
      })),
      rideCity: document.querySelectorAll('[data-menu="ride-city"]').length,
    };
  });

  expect(census.groups.sort()).toEqual(['euc-menu--couch', 'euc-menu--routes']);
  // Three places per copy, in the roster's order, and the same three in both.
  for (const panel of ['euc-menu--routes', 'euc-menu--couch']) {
    const row = census.buttons.filter((button) => button.panel === panel);
    expect(row.map((button) => button.venue), `${panel}'s row`)
      .toEqual(['slice', 'track', 'switchback']);
    expect(row.map((button) => button.label))
      .toEqual(['The city', 'BelVar Circuit', 'Switchback Park']);
    // The loaded venue is lit and taken out of the pad's walk, in both copies.
    expect(row.map((button) => button.pressed)).toEqual(['false', 'false', 'true']);
    expect(row.map((button) => button.disabled)).toEqual([false, false, true]);
  }
  expect(census.buttons.length, 'a third copy of the chooser').toBe(6);
  // And the one button it replaced is gone rather than hidden.
  expect(census.rideCity, 'Go back to the hand-built city outlived its replacement').toBe(0);

  expect(errors).toEqual([]);
});

test('a venue press swaps the world behind the open panel and never navigates', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openRoutes(page);
  expect(await planId(page)).not.toBe(PARK_PLAN);

  await pickVenue(page, ROUTES, 'switchback', PARK_PLAN);
  // The panel is still the panel: a place was chosen, so the place is on screen.
  expect(await appState(page)).toBe('routes');
  await expect(page.locator(ROUTES)).toBeVisible();
  // The address bar follows the press, which is what makes the link shareable.
  expect(await page.evaluate(() => window.location.search)).toBe(`?${PARK}`);
  expect(await page.evaluate(() => window.game.snapshot().world.link))
    .toBe(await page.evaluate(() => window.location.href));
  await expect(page.locator(venueButton(ROUTES, 'switchback'))).toBeDisabled();
  await expect(page.locator(venueButton(ROUTES, 'track'))).toBeEnabled();
  // **The panel says what the press did** (p5-browser IDM-2). It was written
  // `idle` — a successful press that left the line blank — and the next
  // control a player reaches for is `Ride this route`, which answered a
  // question about places with a refusal about seeds. The line now names the
  // place and the control that rides it; `Back → Track Day` is walked in full
  // by the Track Day case below, which is this sentence's promise kept.
  const status = page.locator(`${ROUTES} [data-menu="route-status"]`);
  await expect(status).toHaveText('Switchback Park is ready. Back to the title to ride it or lap it.');
  await expect(status).toHaveAttribute('data-tone', 'ready');
  // And `Ride this route` still means a route: the press neither armed it nor
  // moved the panel's emphasis off the control that makes one.
  await expect(page.locator(`${ROUTES} [data-menu="route-stage"]`))
    .toHaveAttribute('data-stage', 'pick');
  // The join panel's copy moved with it, from one writer.
  await expect(page.locator(venueButton(COUCH, 'switchback'))).toHaveAttribute('aria-pressed', 'true');

  await saveShot(page, testInfo, 'chooser-routes-switchback');

  // BelVar from the same row, and the city back again — the row is a round trip.
  await pickVenue(page, ROUTES, 'track', BELVAR_PLAN);
  expect(await page.evaluate(() => window.location.search)).toBe(`?${BELVAR}`);
  await expect(status).toHaveText('BelVar Circuit is ready. Back to the title to ride it or lap it.');
  await pickVenue(page, ROUTES, 'slice', CITY_PLAN);
  expect(await page.evaluate(() => window.location.search)).toBe('');
  // The city keeps the shape and loses the lap clause: Track Day from here
  // goes to BelVar, so a line offering the city a lap would be the same lie
  // the Track Day note used to tell.
  await expect(status).toHaveText('The city is ready. Back to the title to ride it.');
  expect(await appState(page)).toBe('routes');

  // **A `data-venue` edited in the markup reaches the door and is refused.**
  // `isVenueId` is the guard; this is the press it exists for.
  const hostile = await page.evaluate(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      '.euc-menu--routes [data-menu="venue"][data-venue="track"]',
    );
    if (button === null) return { before: '', after: '' };
    const before = window.game.levelPlan.id;
    for (const forged of ['proving', 'toString', 'generated', 'constructor']) {
      button.dataset.venue = forged;
      button.click();
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
    return { before, after: window.game.levelPlan.id };
  });
  expect(hostile.after, 'a forged data-venue built a world nobody offered')
    .toBe(hostile.before);

  expect(errors).toEqual([]);
});

test('every panel that names the park describes the venue that shipped', async ({ page }) => {
  // **M36 Phase 6's finding.** `Menus.setWorld` writes one line into three
  // panels — title, pause and the fresh-route panel — and the park's read
  // "still a graybox" from Phase 1 until Phase 6, which is a statement the
  // build contradicts: 624 props, 551 solids, 66 painted marks, 73 soft bodies
  // and the only `LevelPlan.look` on the venue list. Nothing was broken by it,
  // which is exactly why nothing caught it; so the claim is measured against
  // the plan rather than pinned as a string.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const dressing = await page.evaluate(() => {
    const plan = window.game.levelPlan;
    return {
      props: plan.props?.length ?? 0,
      markings: plan.markings?.length ?? 0,
      look: plan.look !== undefined,
    };
  });
  expect(dressing.props, 'the park lost its dressing, so the line may be right after all')
    .toBeGreaterThan(500);
  expect(dressing.markings).toBeGreaterThan(0);
  expect(dressing.look).toBe(true);

  // The line itself, in each of the three panels that carry it — read out of
  // the DOM rather than through a locator, because two of the three are hidden
  // at this moment and are written anyway: `setWorld` has one line and three
  // destinations, and a player meets whichever one they open first.
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
  const lines = await page.evaluate(() => ['title', 'pause', 'routes'].map((panel) => ({
    panel,
    text: document.querySelector<HTMLElement>(
      `.euc-menu--${panel} [data-menu="world"]`,
    )?.textContent ?? '',
  })));
  expect(lines).toHaveLength(3);
  for (const { panel, text } of lines) {
    expect(text, `the ${panel} panel does not name the park`).toContain('Switchback Park');
    expect(text.toLowerCase(), `the ${panel} panel calls the dressed park a graybox`)
      .not.toContain('graybox');
  }

  expect(errors).toEqual([]);
});

test('the ?level=switchback link still round-trips through the chooser', async ({ page }) => {
  // The diagnostic entrance is now also the shape of a shared link, so both
  // directions have to hold: the link builds the park, and a press rewrites
  // the address to the link.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  const arrived = await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    link: window.game.snapshot().world.link,
  }));
  expect(arrived.planId).toBe(PARK_PLAN);
  expect(new URL(arrived.link).searchParams.get('level')).toBe('switchback');
  expect(new URL(arrived.link).searchParams.get('seed')).toBeNull();

  // Leave the park by the row, then come back by it, and the link is the same.
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
  await pickVenue(page, ROUTES, 'track', BELVAR_PLAN);
  await pickVenue(page, ROUTES, 'switchback', PARK_PLAN);
  expect(await page.evaluate(() => window.game.snapshot().world.link)).toBe(arrived.link);

  // And a reload of that address is the same park again.
  await bootToTitle(page, PARK);
  expect(await planId(page)).toBe(PARK_PLAN);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Track Day at the park, chosen rather than linked
// ---------------------------------------------------------------------------

test('Track Day offers both tracks, preserves the world on Back, and fits short and portrait windows', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootToTitle(page);
  const entry = page.locator('.euc-menu--title [data-menu="track-day"]');
  const picker = page.locator('.euc-menu--tracks');
  for (const viewport of [{ width: 1000, height: 520 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    await entry.click();
    await expect(picker).toBeVisible();
    await expect(picker.locator('[data-menu="lap-venue"]')).toHaveCount(2);
    expect(await planId(page)).toBe(CITY_PLAN);
    const fits = await picker.evaluate((root) => ({
      scroll: root.scrollHeight - root.clientHeight,
      buttons: [...root.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.height >= 44;
      }),
    }));
    expect(fits.scroll).toBeLessThanOrEqual(1);
    expect(fits.buttons.every(Boolean)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(entry).toBeFocused();
    expect(await planId(page)).toBe(CITY_PLAN);
  }
  await page.setViewportSize({ width: 1000, height: 700 });
  await entry.click();
  await picker.locator('[data-menu="tracks-back"]').click();
  await expect(entry).toBeFocused();
  await entry.click();
  await claimWithPad(page, 0, 1); // B returns without a world swap.
  await expect(entry).toBeFocused();
  expect(await planId(page)).toBe(CITY_PLAN);
  await claimWithPad(page, 0); // A reopens the chooser.
  await expect(picker).toBeVisible();
  await claimWithPad(page, 0, 13); // Down chooses the park.
  await expect(picker.locator('[data-venue="switchback"]')).toBeFocused();
  await claimWithPad(page, 0);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  expect(await planId(page)).toBe(PARK_PLAN);
  await page.keyboard.press('Escape');
  await page.locator('.euc-menu--pause [data-menu="quit"]').click();
  await entry.click();
  await expect(picker.locator('[data-venue="switchback"]')).toBeFocused();
  await picker.locator('[data-venue="track"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  expect(await planId(page)).toBe(BELVAR_PLAN);
  expect(await page.evaluate(() => window.game.snapshot().trackDay.phase)).toBe('outLap');
  expect(errors).toEqual([]);
});

test('Track Day chosen from the row runs an out lap, counts laps in order, and names the park', async ({ page }) => {
  const errors = collectErrors(page);
  await openRoutes(page);
  await pickVenue(page, ROUTES, 'switchback', PARK_PLAN);
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');

  // The title explains that Track Day now opens a choice of tracks.
  await expect(page.locator('.euc-menu--title [data-menu="track-day"] .euc-button__note'))
    .toHaveText('Choose a track. Your best lap rides with you');

  await page.evaluate(() => window.game.clearRecords());
  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  await page.locator('.euc-menu--tracks [data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  expect(await planId(page), 'the chooser was overruled on the way in').toBe(PARK_PLAN);

  const out = await page.evaluate(() => window.game.snapshot().trackDay);
  expect(out.phase).toBe('outLap');
  expect(out.lap).toBe(0);

  const all = await raceLines(page);
  expect(all.map((line) => line.id)).toEqual(['line', 'sector-1', 'sector-2']);

  // The out lap ends at the line; the flying lap is the sectors in order and
  // the line again.
  await crossLine(page, all[0], 30);
  for (const line of all.slice(1)) await crossLine(page, line, 60);
  await crossLine(page, all[0], 2);

  const counted = await page.evaluate(() => window.game.snapshot().trackDay);
  expect(counted.lapsCounted).toBe(1);
  expect(counted.lap).toBe(2);
  expect(counted.bestLapSeconds).not.toBeNull();

  // **Ordered**: the line alone, with no sector found, restarts the lap rather
  // than counting one. The tally must not move.
  await crossLine(page, all[0], 2);
  const restarted = await page.evaluate(() => window.game.snapshot().trackDay);
  expect(restarted.lapsCounted, 'a lap with no sectors in it counted').toBe(1);

  // Last and Best are both on the lane, long after the flash.
  await page.evaluate(() => window.game.advance(600));
  await expect(page.locator('[data-hud="lap-best-label"]')).toHaveText('Best');
  await expect(page.locator('[data-hud="lap-best-value"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);
  await expect(page.locator('[data-hud="split-label"]')).toHaveText('Last');

  expect(errors).toEqual([]);
});

test('the park keeps its own best and its own ghost, and BelVar keeps theirs', async ({ page }) => {
  // The records claim of Phase 5 walked end to end: two lap venues are now
  // reachable by one control, so the thing that must not happen is one
  // venue's session landing in the other's row. Both sessions are ridden, the
  // page is reloaded, and the store is read by id.
  test.slow();
  const errors = collectErrors(page);
  await openRoutes(page);
  await page.evaluate(() => window.game.clearRecords());

  // The two laps are deliberately different lengths — the gates are held for
  // different numbers of steps — so that "two rows, not one overwritten twice"
  // is a claim two numbers can actually carry.
  const session = async (venue: string, plan: string, dwell: number): Promise<number> => {
    await page.evaluate(() => window.game.setAppState('title'));
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
    if (await planId(page) !== plan) await pickVenue(page, ROUTES, venue, plan);
    await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
    await page.locator('.euc-menu--title [data-menu="track-day"]').click();
    await page.locator(`.euc-menu--tracks [data-venue="${venue}"]`).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
    expect(await planId(page)).toBe(plan);

    const all = await raceLines(page);
    await crossLine(page, all[0], 30);
    for (const line of all.slice(1)) await crossLine(page, line, dwell);
    await crossLine(page, all[0], 2);
    const lap = await page.evaluate(() => window.game.snapshot().trackDay);
    expect(lap.lapsCounted, `${plan} counted no lap`).toBe(1);

    // Out through the pause card, which is the door a player uses.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
    await page.locator('.euc-menu--results [data-menu="results-title"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
    return lap.bestLapSeconds as number;
  };

  const belvar = await session('track', BELVAR_PLAN, 60);
  const park = await session('switchback', PARK_PLAN, 150);
  expect(belvar).toBeGreaterThan(0);
  expect(park).toBeGreaterThan(0);

  // **Restarted**, because a store that only agrees inside one page load is
  // not a store. Booted into the city, so neither venue is the loaded one and
  // the read is the store's rather than the snapshot's.
  await bootToTitle(page);
  const stored = await page.evaluate(({ parkId, belvarId }) => {
    const best = (id: string) => {
      const record = window.game.records.best(id);
      return record === null
        ? null
        : { totalSeconds: record.totalSeconds, hasGhost: record.ghost !== null };
    };
    return { park: best(parkId), belvar: best(belvarId) };
  }, { parkId: PARK_PLAN, belvarId: BELVAR_PLAN });

  expect(stored.park, 'the park filed nothing').not.toBeNull();
  expect(stored.belvar, 'BelVar’s record went with the venue swap').not.toBeNull();
  expect(stored.park!.hasGhost, 'a lap with no ghost to race').toBe(true);
  expect(stored.belvar!.hasGhost).toBe(true);
  expect(stored.park!.totalSeconds).toBeCloseTo(park, 6);
  expect(stored.belvar!.totalSeconds).toBeCloseTo(belvar, 6);
  // Two venues, two rows — not one row overwritten twice.
  expect(stored.park!.totalSeconds).not.toBe(stored.belvar!.totalSeconds);

  // And the park's own ghost is the one that comes out to race on the park.
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
  await pickVenue(page, ROUTES, 'switchback', PARK_PLAN);
  expect(await page.evaluate(() => window.game.snapshot().record.hasGhost)).toBe(true);
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  await page.locator('.euc-menu--tracks [data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  const all = await raceLines(page);
  await crossLine(page, all[0], 30);
  await page.evaluate(() => window.game.advance(120));
  expect(await page.evaluate(() => window.game.snapshot().trackDay.ghostVisible)).toBe(true);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The couch, at the park
// ---------------------------------------------------------------------------

for (const seats of [2, 3, 4]) {
  test(`a ${seats}-seat race chosen on the join panel runs three laps at the park`, async ({ page }) => {
    test.slow();
    const errors = collectErrors(page);
    await sitDown(page, seats);

    // The room's venue is the room's: anyone on the panel may press it, and
    // the press must not disturb the room around it.
    await pickVenue(page, COUCH, 'switchback', PARK_PLAN);
    // **The sentence under the mode row**, which is Phase 5's second composed
    // string. `joinBlockReason` asks only about the room's width here — a
    // world with nothing to hit is answered by the routes panel rather than
    // refused — so a room of two reads where the race would be run, and a room
    // of three or four reads the refusal that outranks it.
    await expect(page.locator(`${COUCH} .euc-field__note`).first()).toContainText(
      seats > 2 ? 'Knockabout is a two-player fight' : 'three laps of Switchback Park',
    );
    if (seats > 2) {
      await expect(page.locator(`${COUCH} [data-menu="couch-mode"][data-couch-mode="knockabout"]`))
        .toBeDisabled();
    }
    // The seats and their claims survived the world swap under the panel.
    expect(await page.evaluate(() => window.game.snapshot().input.devices)
      .then((devices) => devices.filter((device) => device !== null).length)).toBe(seats);

    await page.locator(`${COUCH} [data-menu="couch-mode"][data-couch-mode="race"]`).click();
    await page.locator(`${COUCH} [data-menu="couch-start"]`).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');

    // **The first racing frame**, before anything is advanced: this is where
    // the guests used to go home (M27's own defect), and a venue chosen on the
    // way in is one more chance for the exit to fire.
    const armed = await page.evaluate(() => ({
      planId: window.game.levelPlan.id,
      seats: window.game.seatCount,
      views: window.game.renderer.viewCount,
      riders: window.game.snapshot().race.riders.length,
      panes: document.querySelectorAll('.euc-hud-seat').length,
      held: window.game.snapshot().input.devices.filter((device) => device !== null).length,
      phase: window.game.snapshot().race.phase,
      lapPhase: window.game.snapshot().trackDay.phase,
    }));
    expect(armed.planId, 'the race left the venue the room chose').toBe(PARK_PLAN);
    expect(armed.seats).toBe(seats);
    expect(armed.views).toBe(seats);
    expect(armed.riders).toBe(seats);
    expect(armed.panes, 'a rider with no pane to read').toBe(seats);
    expect(armed.held, 'the claims went home with the guests').toBe(seats);
    expect(armed.phase, 'a standing grid is a countdown').toBe('countdown');
    expect(armed.lapPhase, 'the solo referee armed beside the race').toBe('idle');

    // The grid itself: behind the line, on the apron, spaced.
    const grid = await page.evaluate((count) => {
      const game = window.game;
      const line = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex)[0];
      const at = (seat: number) => {
        const euc = game.snapshotFor(seat).euc;
        return { x: euc.position.x, z: euc.position.z, heading: euc.headingY };
      };
      return {
        line: { x: line.centre.x, z: line.centre.z, headingY: line.headingY },
        placed: Array.from({ length: count }, (_unused, seat) => at(seat)),
      };
    }, seats);
    const forwardX = Math.sin(grid.line.headingY);
    const forwardZ = Math.cos(grid.line.headingY);
    for (const [seat, where] of grid.placed.entries()) {
      const behind = -((where.x - grid.line.x) * forwardX + (where.z - grid.line.z) * forwardZ);
      expect(behind, `seat ${seat} is ${behind.toFixed(2)} m behind the line`).toBeGreaterThan(0);
      expect(where.heading).toBeCloseTo(grid.line.headingY, 6);
    }

    // Past the count, then three laps of gates with seat 0 taking the last line
    // first — a scripted winner, so the assertion is about the order rather
    // than about anybody's pace.
    await page.evaluate(() => window.game.advance(400));
    expect(await page.evaluate(() => window.game.snapshot().race.phase)).toBe('running');

    const all = await raceLines(page);
    for (const line of all) await crossAll(page, line, seats);
    for (let lap = 0; lap < 3; lap += 1) {
      for (const line of all.slice(1)) await crossAll(page, line, seats);
      if (lap < 2) await crossAll(page, all[0], seats);
    }

    const finish = await page.evaluate(({ centre, headingY, count }) => {
      const game = window.game;
      game.placeRider({ ...centre }, headingY, 0);
      game.advance(2);
      const afterLeader = game.snapshot().race;
      game.advance(60);
      for (let seat = 1; seat < count; seat += 1) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(6);
      const race = game.snapshot().race;
      return {
        leaderFinished: afterLeader.leaderFinished,
        laps: race.riders.map((rider) => rider.lap),
        phase: race.phase,
        winner: race.winner,
        positions: race.riders.map((rider) => rider.position),
        tricks: race.riders.map((rider) => rider.tricks),
      };
    }, { centre: all[0].centre, headingY: all[0].headingY, count: seats });

    expect(finish.leaderFinished, 'seat 0 crossed the last line and nothing noticed').toBe(true);
    expect(finish.phase).toBe('ended');
    // Three laps, counted — `RACE.laps` is 3 and nothing here moved it.
    for (const [seat, laps] of finish.laps.entries()) {
      expect(laps, `seat ${seat} finished on lap ${laps}`).toBeGreaterThanOrEqual(3);
    }
    expect(finish.winner).toBe(0);
    expect(finish.positions[0]).toBe(1);
    for (let seat = 1; seat < seats; seat += 1) {
      expect(finish.positions[seat], `seat ${seat} finished out of order`).toBeGreaterThan(1);
    }
    // **A tally per seat**, which is the §36.6 integration this venue is for.
    expect(finish.tricks.length).toBe(seats);
    for (const [seat, tally] of finish.tricks.entries()) {
      expect(Object.keys(tally ?? {}).sort(), `seat ${seat}'s tally`)
        .toEqual(['chargedHops', 'cleanLandings', 'oneFootAirs', 'spinsLanded']);
    }

    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
    await expect(page.locator('[data-menu="results-heading"]')).toHaveText(/wins$/);
    await expect(page.locator('[data-menu="results-rows"] tr')).toHaveCount(seats);
    // One Tricks group per rider, and every group carries all four lines.
    await expect(page.locator('[data-menu="results-tricks"]')).toBeVisible();
    await expect(page.locator('.euc-results__trick-group')).toHaveCount(seats);
    await expect(page.locator('.euc-results__trick-group').first().locator('.euc-results__trick'))
      .toHaveCount(4);

    // **A race keeps nothing** (q92), on this venue as on the other one.
    const kept = await page.evaluate((id) => {
      const record = window.game.records.best(id);
      return {
        best: window.game.snapshot().record.totalSeconds,
        hasGhost: window.game.snapshot().record.hasGhost,
        stored: record === null ? null : record.totalSeconds,
      };
    }, PARK_PLAN);
    expect(kept.best, 'a raced lap reached the park’s row').toBeNull();
    expect(kept.hasGhost).toBe(false);
    expect(kept.stored, 'a raced lap reached the store under the park’s id').toBeNull();

    // **Ride it again**, from the race's own card: `resultsMode()` answers
    // `race`, which is `enterTrackDay` again — and the room has to come back to
    // the venue it just raced rather than to BelVar.
    await page.locator('.euc-menu--results [data-menu="retry"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
    expect(await page.evaluate(() => ({
      planId: window.game.levelPlan.id,
      phase: window.game.snapshot().race.phase,
      seats: window.game.seatCount,
      riders: window.game.snapshot().race.riders.length,
    }))).toEqual({ planId: PARK_PLAN, phase: 'countdown', seats, riders: seats });

    expect(errors).toEqual([]);
  });
}

test('the park’s grid rotates between races, so nobody keeps the front row', async ({ page }) => {
  // §27.3's fairness rule, asked on the new venue: the grid is laid out in the
  // start line's frame, and a venue whose line sits on an apron rather than a
  // pit straight must rotate the same way.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const rows = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 3) game.spawnRider();
    game.clearRecords();
    const line = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex)[0];
    const forwardX = Math.sin(line.headingY);
    const forwardZ = Math.cos(line.headingY);
    const order = () => [0, 1, 2].map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return {
        x: euc.position.x,
        z: euc.position.z,
        behind: -((euc.position.x - line.centre.x) * forwardX
          + (euc.position.z - line.centre.z) * forwardZ),
      };
    });
    const races: { x: number; z: number; behind: number }[][] = [];
    for (let round = 0; round < 3; round += 1) {
      game.startTrackDay();
      game.advance(2);
      races.push(order());
      // Out through the results card rather than the title: going home is what
      // sends the guests home, and this loop needs the same three people on
      // three consecutive grids.
      game.setAppState('paused');
      game.setAppState('results');
    }
    return races;
  });

  // Every race is three distinct places behind the line — the grid is two
  // abreast per row, so the *distances* repeat and the positions must not.
  for (const [round, row] of rows.entries()) {
    for (const [seat, where] of row.entries()) {
      expect(where.behind, `race ${round} seat ${seat} is in front of the line`).toBeGreaterThan(0);
    }
    for (let a = 0; a < row.length; a += 1) {
      for (let b = a + 1; b < row.length; b += 1) {
        const apart = Math.hypot(row[a].x - row[b].x, row[a].z - row[b].z);
        expect(apart, `race ${round} stacked seats ${a} and ${b}`).toBeGreaterThan(1);
      }
    }
  }
  // And no seat stands in the same slot two races running: `gridRotation` is
  // the one asymmetry a start line leaves being shared out rather than denied.
  const slots = (row: { behind: number }[]): string => row.map((w) => w.behind.toFixed(3)).join('|');
  expect(slots(rows[1]), 'the grid did not rotate').not.toBe(slots(rows[0]));
  expect(slots(rows[2])).not.toBe(slots(rows[1]));

  expect(errors).toEqual([]);
});

test('two riders who cross the park’s line together draw, and the card says why', async ({ page }) => {
  // The shared-finish path, reached on this venue: a dead heat is decided
  // after every seat has stepped, so it must not become a race won by
  // whichever seat the loop reached first.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.laps', 1);
    game.startTrackDay();
    game.advance(2);
  });
  const all = await raceLines(page);
  await page.evaluate(() => window.game.advance(400));

  for (const line of [...all, ...all.slice(1), all[0]]) await crossAll(page, line, 2);

  const drawn = await page.evaluate(() => {
    const race = window.game.snapshot().race;
    return {
      phase: race.phase,
      winner: race.winner,
      positions: race.riders.map((rider) => rider.position),
      seconds: race.riders.map((rider) => rider.finishSeconds),
    };
  });
  expect(drawn.phase).toBe('ended');
  expect(drawn.winner, 'a dead heat found a winner anyway').toBeNull();
  expect(drawn.positions).toEqual([1, 1]);
  expect(drawn.seconds[0]).toBe(drawn.seconds[1]);

  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('Race drawn');

  // **The card's own mode switch**, pressed rather than merely drawn: it is the
  // third copy of the chooser's neighbouring control, and leaving a race by it
  // must land on a legal state at this venue too.
  await expect(page.locator('[data-menu="results-couch"]')).toBeVisible();
  await expect(page.locator('[data-menu="results-couch"] [data-couch-mode="race"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-menu="results-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  expect(await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    ride: window.game.snapshot().couch.ride,
    seats: window.game.seatCount,
    race: window.game.snapshot().race.phase,
  }))).toEqual({ planId: PARK_PLAN, ride: 'freeRide', seats: 2, race: 'idle' });

  expect(errors).toEqual([]);
});

test('two riders in the same place on the park are pushed apart, not put down', async ({ page }) => {
  // Contact on the new venue. The park's ground is graded everywhere the city's
  // is not, and the resolver moves riders along it — so "nobody goes down" is a
  // claim about this terrain rather than one inherited from the circuit.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const bump = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    const line = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex)[0];
    const cos = Math.cos(line.headingY);
    const sin = Math.sin(line.headingY);
    // Well back down the apron, so nothing is crossed and the ground is flat.
    const spot = {
      x: line.centre.x - sin * 20,
      y: line.centre.y,
      z: line.centre.z - cos * 20,
    };
    for (const seat of [0, 1]) game.placeRider({ ...spot }, line.headingY, seat);
    game.advance(2);
    const at = (seat: number) => game.snapshotFor(seat).euc;
    const before = Math.hypot(
      at(0).position.x - at(1).position.x,
      at(0).position.z - at(1).position.z,
    );
    game.advance(120);
    const after = Math.hypot(
      at(0).position.x - at(1).position.x,
      at(0).position.z - at(1).position.z,
    );
    return {
      before,
      after,
      crashed: [at(0).crashed, at(1).crashed],
      finite: [at(0).position.x, at(0).position.z, at(1).position.x, at(1).position.z]
        .every((value) => Number.isFinite(value)),
    };
  });

  expect(bump.finite, 'a merged pair resolved to NaN').toBe(true);
  expect(bump.after, 'the pair stayed merged').toBeGreaterThan(bump.before);
  expect(bump.crashed, 'a bump on the apron put somebody down').toEqual([false, false]);
  expect(errors).toEqual([]);
});

test('a device can leave a seat on the park’s join panel and take it back', async ({ page }) => {
  // The claim window is open for as long as the panel is, so a pad that is put
  // down mid-decision has to be able to pick the same seat up again — and a
  // venue press between the two must not disturb either.
  const errors = collectErrors(page);
  await sitDown(page, 3);
  await pickVenue(page, COUCH, 'switchback', PARK_PLAN);

  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'pad:1', 'keyboard']);

  expect(await page.evaluate(() => window.game.unclaimSeat(1))).toBe(true);
  await page.waitForFunction(() => window.game.snapshot().input.devices[1] === null);
  // The chair stays out and the world stays put while the seat is empty.
  expect(await page.evaluate(() => window.game.seatCount)).toBe(3);
  expect(await planId(page)).toBe(PARK_PLAN);

  // A venue press with a seat vacant, then the pad comes back to it.
  await pickVenue(page, COUCH, 'track', BELVAR_PLAN);
  await pickVenue(page, COUCH, 'switchback', PARK_PLAN);
  await claimWithPad(page, 1);
  await page.waitForFunction(() => window.game.snapshot().input.devices[1] === 'pad:1');
  expect(await page.evaluate(() => window.game.seatCount)).toBe(3);

  // And the room still starts, whole, on the venue it chose.
  await page.locator(`${COUCH} [data-menu="couch-mode"][data-couch-mode="race"]`).click();
  await page.locator(`${COUCH} [data-menu="couch-start"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  expect(await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    seats: window.game.seatCount,
    riders: window.game.snapshot().race.riders.length,
  }))).toEqual({ planId: PARK_PLAN, seats: 3, riders: 3 });

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Every other door, from the park
// ---------------------------------------------------------------------------

test('pause, mode switch, results and retry all come back to the park', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await startPanelRaceAt(page, 2, 'switchback', PARK_PLAN);
  await page.evaluate(() => window.game.advance(500));

  // Pause lands on Resume, and the switch names the venue the room is on.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  // Knockabout is refused here because the park carries nothing to hit — the
  // mode declines the venue on the control rather than after the press, and
  // the note says which of the two reasons it is.
  await expect(page.locator('[data-menu="pause-couch"] [data-couch-mode="knockabout"]')).toBeDisabled();
  await expect(page.locator('[data-menu="pause-couch"] .euc-field__note'))
    .toContainText('needs a route with things to hit');
  expect(await page.evaluate(() => window.game.snapshot().targets.total)).toBe(0);

  // Free ride and back to Race: the park survives both switches.
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="freeRide"]').click();
  await page.waitForFunction(() => window.game.snapshot().couch.ride === 'freeRide');
  expect(await planId(page)).toBe(PARK_PLAN);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.locator('[data-menu="pause-couch"] [data-couch-mode="race"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  const again = await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    phase: window.game.snapshot().race.phase,
    seats: window.game.seatCount,
  }));
  expect(again.planId, 'a mode switch took the room off the park').toBe(PARK_PLAN);
  expect(again.phase).toBe('countdown');
  expect(again.seats).toBe(2);

  expect(errors).toEqual([]);
});

test('a solo park session retries onto the park, and Back leaves it where it was', async ({ page }) => {
  const errors = collectErrors(page);
  await openRoutes(page);
  await pickVenue(page, ROUTES, 'switchback', PARK_PLAN);
  // **Back is what leaves**, and it leaves the venue chosen rather than undone.
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  expect(await planId(page)).toBe(PARK_PLAN);

  await page.evaluate(() => window.game.clearRecords());
  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  await page.locator('.euc-menu--tracks [data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

  // Retry from the card: the same venue, a fresh out lap.
  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  const retried = await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    phase: window.game.snapshot().trackDay.phase,
    lap: window.game.snapshot().trackDay.lap,
  }));
  expect(retried.planId, 'retry took the rider to BelVar').toBe(PARK_PLAN);
  expect(retried.phase).toBe('outLap');
  expect(retried.lap).toBe(0);

  // And the join panel's Back is the same promise for a room.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await page.locator(`${COUCH} [data-menu="couch-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  expect(await planId(page)).toBe(PARK_PLAN);

  expect(errors).toEqual([]);
});

test('Chase and Knockabout decline the park and land on the panel that can help', async ({ page }) => {
  // §36 Phase 5's "explicitly decline" clause. Neither mode can run on any
  // hand-built place, so the venue row is *hidden* on the panel they open: three
  // buttons that each take the player somewhere the mode refuses again is the
  // stranded card M23 taught this file about.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  expect(await page.evaluate(() => ({
    chase: window.game.snapshot().chase.available,
    targets: window.game.snapshot().targets.total,
  }))).toEqual({ chase: false, targets: 0 });

  await page.locator('.euc-menu--title [data-menu="chase"]').click();
  await expect(page.locator(ROUTES)).toBeVisible();
  await expect(page.locator(`${ROUTES} [data-menu="route-status"]`))
    .toContainText('chase needs a generated route');
  // **Both halves of the withdrawal, measured apart.** `Menus.writeVenueOffer`
  // writes the `hidden` property, which is the whole of its contract; whether
  // the row then leaves the screen belonged to `src/ui/game.css`, and until
  // M36 Phase 6 it did not — `.euc-couch__mode`'s author `display: grid` beat
  // the user agent's `[hidden] { display: none }` whatever the specificity, so
  // the property was set and the row still drew 98.09 px of three buttons at
  // 1000 x 700 (p5-browser defect 1). What that cost is exactly what the
  // design argued against: a player whose chase was refused is offered three
  // places, none of which can host a chase, and pressing one swaps the world
  // and refuses again.
  expect(await venueOfferHidden(page), 'the panel kept offering places').toBe(true);
  expect(await venueOfferBox(page), 'the hidden venue row was still drawn').toEqual({
    display: 'none',
    height: 0,
  });
  await expect(page.locator(`${ROUTES} [data-menu="venue-chooser"]`)).toBeHidden();
  // And nothing on it can be pressed: no box means no hit target, which is the
  // difference between a row that is marked withdrawn and a row that is gone.
  for (const venue of ['slice', 'track', 'switchback']) {
    const button = page.locator(venueButton(ROUTES, venue));
    await expect(button, `the ${venue} button survived the withdrawal`).toBeHidden();
    expect(await button.boundingBox(), `the ${venue} button still has a hit target`).toBeNull();
  }
  await expect(page.locator(`${ROUTES} [data-menu="route-stage"]`))
    .toHaveAttribute('data-purpose', 'chase');
  // Nothing was armed and nothing was stranded: the panel is the state, the
  // park is still loaded, and Surprise me is the offer.
  expect(await appState(page)).toBe('routes');
  expect(await planId(page)).toBe(PARK_PLAN);
  expect(await page.evaluate(() => window.game.snapshot().chase.phase)).toBe('idle');
  await expect(page.locator(`${ROUTES} [data-menu="surprise"]`)).toBeVisible();

  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');

  await page.locator('.euc-menu--title [data-menu="knockabout"]').click();
  await expect(page.locator(ROUTES)).toBeVisible();
  await expect(page.locator(`${ROUTES} [data-menu="route-status"]`))
    .toContainText('Knockabout needs');
  expect(await venueOfferHidden(page), 'the panel kept offering places').toBe(true);
  expect(await venueOfferBox(page), 'the hidden venue row was still drawn').toEqual({
    display: 'none',
    height: 0,
  });
  await expect(page.locator(venueButton(ROUTES, 'switchback'))).toBeHidden();
  await expect(page.locator(`${ROUTES} [data-menu="route-stage"]`))
    .toHaveAttribute('data-purpose', 'knockabout');
  expect(await appState(page)).toBe('routes');
  expect(await planId(page)).toBe(PARK_PLAN);

  // **And the row comes back** when the panel is opened to choose a place
  // again, which is what makes the withdrawal a statement about the question on
  // screen rather than about the places.
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');
  expect(await venueOfferHidden(page)).toBe(false);
  expect((await venueOfferBox(page)).display, 'the row came back withdrawn').toBe('grid');
  await expect(page.locator(`${ROUTES} [data-menu="venue-chooser"]`)).toBeVisible();
  await expect(page.locator(venueButton(ROUTES, 'switchback'))).toBeDisabled();

  // Time trial declines the park on the button itself — it is withdrawn from the
  // title rather than offered and refused, so there is no card to strand.
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await expect(page.locator('.euc-menu--title [data-menu="challenge"]')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the chooser opens no new door to the couch on a window too small for one', async ({ page }) => {
  // **The width clause of `couchEligible`, from the desktop project.** The
  // pointer clause and the phone's own title-screen scan belong to
  // `tests/touch.spec.ts` on the mobile project, which is the only place a
  // coarse pointer is real; what can be asked here is whether the new control
  // is itself a way in. It is not: it swaps worlds and never navigates, so a
  // window that refuses the couch still refuses it with the row on screen.
  const errors = collectErrors(page);
  await openRoutes(page, PARK);
  await expect(page.locator(`${ROUTES} [data-menu="venue-chooser"]`)).toBeVisible();

  await page.setViewportSize({ width: 720, height: 700 });
  await page.evaluate(() => new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
  }));
  expect(await page.evaluate(() => window.game.snapshot().couch.available)).toBe(false);

  // Press every venue on the narrow window; none of them opens the entrance.
  for (const [venue, plan] of [['track', BELVAR_PLAN], ['switchback', PARK_PLAN]] as const) {
    await pickVenue(page, ROUTES, venue, plan);
    expect(await appState(page), `${venue} navigated somewhere`).toBe('routes');
    expect(await page.evaluate(() => window.game.snapshot().couch.available)).toBe(false);
    expect(await page.evaluate(() => window.game.seatCount)).toBe(1);
  }
  await page.locator(`${ROUTES} [data-menu="routes-back"]`).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await expect(page.locator('.euc-menu--title [data-menu="couch"]')).toBeHidden();

  // And no venue button carries a word the phone's own scan forbids.
  const words = await page.locator(`${ROUTES} [data-menu="venue"]`).evaluateAll(
    (nodes) => nodes.map((node) => node.textContent ?? ''),
  );
  for (const word of words) {
    expect(word.toLowerCase(), `a venue button says "${word}"`)
      .not.toMatch(/2 player|two player|couch|split/);
  }

  expect(errors).toEqual([]);
});

test.describe('the chooser on a phone-shaped touchscreen', () => {
  /*
   * **A coarse pointer, on the desktop project, by `tests/m26.spec.ts`'s own
   * precedent** (its "join panel on a wide touchscreen" block, whose comment
   * states the machine): `hasTouch` gives a genuinely coarse-pointered context
   * — `(pointer: coarse)` matches, so `game.css`'s finger-sized floors are
   * measured rather than simulated — and Playwright reports `any-pointer:
   * fine` as false, which is exactly a phone. The rest of the phone contract
   * stays in `tests/touch.spec.ts` on the mobile project, which is the only
   * place a tap is a real touch pointer; what is asked here is only what the
   * new control adds, because `touch.spec.ts`'s own thumb scan names its
   * targets one by one and the venue buttons are not among them.
   */
  test.use({ hasTouch: true, viewport: { width: 412, height: 839 } });

  test('every venue button is thumb-sized, and neither couch clause softens', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await openRoutes(page, PARK);

    // Both clauses of `couchEligible` fail on this machine — too narrow to
    // split, and no fine pointer — and the chooser changes neither.
    expect(await page.evaluate(() => window.game.snapshot().couch.available)).toBe(false);
    await expect(page.locator(`${ROUTES} [data-menu="venue-chooser"]`)).toBeVisible();

    for (const venue of ['slice', 'track', 'switchback']) {
      const box = await page.locator(venueButton(ROUTES, venue)).boundingBox();
      expect(box, `${venue} has no box`).not.toBeNull();
      expect(box!.height, `${venue} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${venue} is ${box!.width}px wide`).toBeGreaterThanOrEqual(44);
    }

    // A tap on one is a world swap and nothing else: still the panel, still
    // one seat, still no couch.
    await page.locator(venueButton(ROUTES, 'track')).tap();
    await page.waitForFunction((id) => window.game.levelPlan.id === id, BELVAR_PLAN);
    expect(await appState(page)).toBe('routes');
    expect(await page.evaluate(() => ({
      seats: window.game.seatCount,
      views: window.game.renderer.viewCount,
      couch: window.game.snapshot().couch.available,
    }))).toEqual({ seats: 1, views: 1, couch: false });
    expect(await page.locator('.euc-hud').count()).toBe(1);
    expect(await page.locator('.euc-hud-seat[data-split="true"]').count()).toBe(0);

    // **The panel it stands on is taller than the phone, and that is legal
    // here.** `.euc-menu` is `overflow-y: auto` by design (`game.css:1251`),
    // and the no-scroll contract belongs to the *join* panel — the one screen
    // with four seat cards and an armed Start on it. What this panel owes a
    // phone is that everything on it can still be reached, so the measurement
    // is recorded and the reach is asserted.
    const overflow = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.euc-menu--routes');
      return root === null ? -1 : root.scrollHeight - root.clientHeight;
    });
    testInfo.annotations.push({
      type: 'fit',
      description: `fresh-route panel, coarse 412 x 839: ${overflow}px below the fold`,
    });
    await page.locator(`${ROUTES} [data-menu="routes-back"]`).scrollIntoViewIfNeeded();
    await page.locator(`${ROUTES} [data-menu="routes-back"]`).tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
    expect(await planId(page)).toBe(BELVAR_PLAN);

    expect(errors).toEqual([]);
  });
});

test('the four-rider park race card carries a Tricks group for every rider', async ({ page }, testInfo) => {
  // The screenshot case, and the one that makes the counts worth photographing:
  // every seat charges a hop and lands it before the gates are walked, so the
  // card shows numbers a player could have earned rather than four zeros.
  test.slow();
  const errors = collectErrors(page);
  await startPanelRaceAt(page, 4, 'switchback', PARK_PLAN);
  await page.evaluate(() => window.game.advance(400));
  expect(await page.evaluate(() => window.game.snapshot().race.phase)).toBe('running');

  // A full charge is `EUC.hopChargeSeconds` of crouch and a margin, then the
  // press — m36_3's driver, with every seat doing it at once.
  const hopped = await page.evaluate(() => {
    const game = window.game;
    const seats = [0, 1, 2, 3];
    for (const seat of seats) {
      game.setActionsFor(seat, { throttle: 0, steer: 0, crouch: true, hop: false });
    }
    game.advance(72);
    for (const seat of seats) game.setActionsFor(seat, { crouch: false, hop: true });
    game.advance(1);
    for (const seat of seats) game.setActionsFor(seat, { hop: false });
    game.advance(180);
    for (const seat of seats) {
      game.setActionsFor(seat, { throttle: 0, steer: 0, crouch: false, hop: false });
    }
    game.advance(30);
    return game.snapshot().race.riders.map((rider) => rider.tricks);
  });
  for (const [seat, tally] of hopped.entries()) {
    expect(tally!.chargedHops, `seat ${seat} never charged a hop`).toBeGreaterThan(0);
    expect(tally!.cleanLandings, `seat ${seat} never landed it`).toBeGreaterThan(0);
  }

  const all = await raceLines(page);
  for (const line of all) await crossAll(page, line, 4);
  for (let lap = 0; lap < 3; lap += 1) {
    for (const line of all.slice(1)) await crossAll(page, line, 4);
    if (lap < 2) await crossAll(page, all[0], 4);
  }
  await page.evaluate(({ centre, headingY }) => {
    const game = window.game;
    game.placeRider({ ...centre }, headingY, 0);
    game.advance(2);
    game.advance(60);
    for (const seat of [1, 2, 3]) game.placeRider({ ...centre }, headingY, seat);
    game.advance(2);
    game.advance(6);
  }, { centre: all[0].centre, headingY: all[0].headingY });

  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await expect(page.locator('[data-menu="results-tricks"]')).toBeVisible();
  await expect(page.locator('.euc-results__trick-group')).toHaveCount(4);
  // Every group is named, because a card with four riders on it has to say
  // whose counts these are.
  const named = await page.locator('.euc-results__trick-rider').evaluateAll(
    (nodes) => nodes.map((node) => node.textContent ?? ''),
  );
  expect(named.length).toBe(4);
  for (const name of named) expect(name.trim().length).toBeGreaterThan(0);
  // And at least one line in the card is not a zero.
  const counts = await page.locator('.euc-results__trick dd').evaluateAll(
    (nodes) => nodes.map((node) => Number(node.textContent ?? '0')),
  );
  expect(counts.length).toBe(16);
  expect(Math.max(...counts)).toBeGreaterThan(0);

  // **How the card fits**, reported rather than asserted: the results panel
  // scrolls, and a four-rider race card carries four Tricks groups under a
  // four-row table. The number is recorded so a later fit decision has a
  // measurement to start from rather than an impression.
  const fit = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.euc-menu--results');
    if (panel === null) return null;
    const scroller = panel.scrollHeight > panel.clientHeight
      ? panel
      : panel.querySelector<HTMLElement>('[data-menu="results-panel"]') ?? panel;
    scroller.scrollTop = 0;
    return {
      below: Math.max(0, scroller.scrollHeight - scroller.clientHeight),
      viewport: window.innerHeight,
    };
  });
  await page.evaluate(() => new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
  }));
  testInfo.annotations.push({
    type: 'fit',
    description: `four-rider race card, 1000 x 700: ${JSON.stringify(fit)}`,
  });

  await saveShot(page, testInfo, 'race-results-four-riders-tricks');
  expect(errors).toEqual([]);
});
