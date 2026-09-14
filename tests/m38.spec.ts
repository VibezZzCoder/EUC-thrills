/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { TRICK_RUN } from '../src/data/tuning.ts';
import { trickZoneAt, type TrickZone } from '../src/level/trickZones.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M38 Phase 2/3 — the Trick Run's mode row, every door, and the personal best.
 *
 * **`src/simulation/trickRun.test.ts` already scores runs** — banking,
 * forfeits, flight identity, the deadline, seat order — and
 * `src/app/trickRecords.test.ts` already attacks the store with hostile rows.
 * Nothing below repeats either. What neither can reach is the path a player
 * takes: the buttons that arm the mode, the clock that ends it, the card that
 * reports it, the one filing decision in the composition root, and the promise
 * that no referee is running anywhere else. Those are browser questions.
 *
 * **Every door is pressed the way a player presses it** (§38.6, and M27 Phase
 * 5's lesson: the QA bridge reaches a *state* without walking the *path*, so at
 * least one spec per control has to arrive through the control). The bridge is
 * used for the clock and for reading the referee, never for the entrance,
 * except in the two specs whose whole subject is that the bridge itself obeys
 * the same guards.
 */
test.beforeEach(() => {
  test.slow();
});

const PARK = 'level=switchback';
const TITLE_ENTRY = '.euc-menu--title [data-menu="trick-run"]';
const ROUTES_ENTRY = '.euc-menu--routes [data-menu="trick-run"]';
const COUCH_PANEL = '.euc-menu--couch';
const COUCH_MODE = `${COUCH_PANEL} [data-menu="couch-mode"]`;
const COUCH_START = `${COUCH_PANEL} [data-menu="couch-start"]`;

function runState(page: Page) {
  return page.evaluate(() => {
    const snap = window.game.snapshot();
    return {
      state: snap.app.state,
      phase: snap.trickRun.phase,
      remainingSteps: snap.trickRun.remainingSteps,
      elapsedSteps: snap.trickRun.elapsedSteps,
      durationSteps: snap.trickRun.durationSteps,
      completed: snap.trickRun.completed,
      wasRecord: snap.trickRun.wasRecord,
      previousBest: snap.trickRun.previousBest,
      eligible: snap.trickRun.eligible,
      scores: snap.trickRun.seats.map((seat) => seat.score),
      world: snap.world.levelId,
    };
  });
}

/**
 * Land `count` charged hops, then run the clock out.
 *
 * A charged hop is the cheapest award this venue can be asked for on demand:
 * crouch past `EUC.hopChargeSeconds`, hop, and let the flight land itself on
 * the flat by the start line. Everything else about scoring is the referee's
 * own headless business.
 */
async function scoreAndFinish(page: Page, count: number, seat = 0): Promise<void> {
  await page.evaluate(({ hops, index }) => {
    const game = window.game;
    game.loop.setRunning(false);
    for (let hop = 0; hop < hops; hop += 1) {
      game.setActionsFor(index, { throttle: 0, crouch: true });
      game.advance(60);
      game.setActionsFor(index, { throttle: 0, crouch: true, hop: true });
      game.advance(4);
      game.setActionsFor(index, { throttle: 0, crouch: false, hop: false });
      // Down and settled before the next charge starts.
      game.advance(120);
    }
    game.setActionsFor(index, { throttle: 0, crouch: false, hop: false });
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  }, { hops: count, index: seat });
}

/**
 * Press Escape and let the one-shot land.
 *
 * **`pause` is claimed inside the fixed step** (§25.9's any-seat-once), so a
 * frozen loop never acts on it: the key goes down, no step runs, and a
 * `waitForFunction` on the state would sit there until the test's own budget
 * ran out. One stepped tick through the bridge is what a live loop would have
 * given it.
 */
async function pauseWithEscape(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.advance(2));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
}

/**
 * Stop the loop, and report where the clock is.
 *
 * A press lands with the loop live, so a handful of fixed steps are always
 * spent between the button and the next round trip. Freezing first is what
 * makes every later step count exact — the harness's own rule 2.
 */
function freeze(page: Page): Promise<number> {
  return page.evaluate(() => {
    window.game.loop.setRunning(false);
    return window.game.snapshot().trickRun.elapsedSteps;
  });
}

/** Run the clock out without trying to earn anything. */
async function finish(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });
}

// ---------------------------------------------------------------------------
// The title entrance, the deadline, the card, and Try again
// ---------------------------------------------------------------------------

test('the title entry brings the park, runs a fixed clock and lands on a card', async ({ page }) => {
  const errors = collectErrors(page);
  // **From the city, so the entrance has to bring its own world** (§38.6).
  await bootToTitle(page);
  await expect(page.locator(`${TITLE_ENTRY} .euc-button__note`))
    .toHaveText('Score tricks at Switchback Park');
  await page.evaluate(() => window.game.clearRecords());

  await page.locator(TITLE_ENTRY).click();
  const spent = await freeze(page);
  const armed = await runState(page);
  expect(armed.state, 'the title entry did not reach the mode').toBe('trickRun');
  expect(armed.phase).toBe('running');
  expect(armed.world, 'the entrance did not bring the park').toBe('switchback');
  expect(armed.durationSteps).toBe(TRICK_RUN.durationSteps);
  expect(armed.remainingSteps).toBe(TRICK_RUN.durationSteps - spent);

  // **No gates.** Switchback carries a lap, and a Trick Run is not measured
  // against it; a cascade of markers would be furniture from a mode nobody
  // chose.
  expect(await page.evaluate(() => window.game.snapshot().trackDay.phase)).toBe('idle');
  expect(await page.evaluate(() => window.game.snapshot().race.phase)).toBe('idle');

  await scoreAndFinish(page, 2);
  const done = await runState(page);
  expect(done.state, 'the deadline did not reach the results card').toBe('results');
  expect(done.phase).toBe('ended');
  expect(done.completed).toBe(true);
  expect(done.scores[0], 'two charged clean hops earned nothing').toBeGreaterThan(0);

  // The card speaks the mode's own words and cannot have inherited the time
  // trial's (M26 Phase 6).
  await expect(page.locator('[data-menu="results-total-caption"]')).toHaveText('Run score');
  await expect(page.locator('[data-menu="results-best-caption"]')).toHaveText('Previous best');
  await expect(page.locator('[data-menu="results-table-caption"]')).toHaveText('Run breakdown');
  await expect(page.locator('[data-menu="results-column-label"]')).toHaveText('Trick');
  await expect(page.locator('[data-menu="results-column-value"]')).toHaveText('Count');
  await expect(page.locator('[data-menu="results-column-delta"]')).toHaveText('Points');
  await expect(page.locator('[data-menu="results-total"]')).toHaveText(`${done.scores[0]}`);

  // **The breakdown adds to the total.** The column is the referee's own
  // attribution, never `count x value`, and the one number the card owes the
  // player is that it sums.
  const columns = await page.evaluate(() => [...document.querySelectorAll(
    '[data-menu="results-rows"] tr',
  )].map((row) => ({
    label: row.querySelector('th')?.textContent ?? '',
    points: row.querySelector('.euc-results__row-delta')?.textContent ?? '',
  })));
  // Two rows are counts rather than points and say so with an em dash — the
  // crashes and, since q189, the flights that landed tricks off every feature.
  // They are excluded by the dash they actually print rather than by a list of
  // labels, so a third count row cannot quietly turn this sum into `NaN`.
  const countRows = columns.filter((row) => row.points === '—').map((row) => row.label);
  expect(countRows, 'the count rows are not the two that carry no points')
    .toEqual(['Tricks off the features', 'Crashes']);
  const summed = columns
    .filter((row) => row.points !== '—')
    .reduce((total, row) => total + Number(row.points), 0);
  expect(summed, 'the breakdown did not add to the run score').toBe(done.scores[0]);

  // Try again is a fresh fixed-clock attempt, on the same card's primary action.
  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  const retrySpent = await freeze(page);
  const again = await runState(page);
  expect(again.state).toBe('trickRun');
  expect(again.remainingSteps).toBe(TRICK_RUN.durationSteps - retrySpent);
  expect(again.scores[0], 'Try again kept the last attempt’s points').toBe(0);

  expect(errors).toEqual([]);
});

test('a pad walks to the title entry and A arms the run', async ({ page }) => {
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
    navigator.getGamepads = () => [pad] as never;
  });
  await bootToTitle(page, PARK);
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

  // The pad walks the panel's real geometry (M24's `ui/menuRows.ts`), so the
  // stop is found rather than counted: what this spec is about is that the new
  // entrance is *reachable by a pad at all*, which a count would stop proving
  // the next time the title reflows.
  const reached = await page.evaluate(async () => {
    type Pad = { buttons: { pressed: boolean; value: number }[] };
    const pad = (window as unknown as { fakePad: Pad }).fakePad;
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const press = async (button: number) => {
      pad.buttons[button].pressed = true;
      pad.buttons[button].value = 1;
      await frame();
      pad.buttons[button].pressed = false;
      pad.buttons[button].value = 0;
      await frame();
    };
    for (let step = 0; step < 24; step += 1) {
      const active = document.activeElement as HTMLElement | null;
      if (active?.dataset.menu === 'trick-run') return true;
      await press(13);
    }
    return false;
  });
  expect(reached, 'a pad could not walk to the Trick Run entry').toBe(true);

  await page.evaluate(async () => {
    type Pad = { buttons: { pressed: boolean; value: number }[] };
    const pad = (window as unknown as { fakePad: Pad }).fakePad;
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[0].pressed = true;
    pad.buttons[0].value = 1;
    await frame();
    pad.buttons[0].pressed = false;
    pad.buttons[0].value = 0;
    await frame();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The pause card's three answers
// ---------------------------------------------------------------------------

test('pause resumes the same attempt, retries a fresh one, and ends one unfinished', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();

  const base = await freeze(page);
  await page.evaluate(() => window.game.advance(600));
  const midRun = await runState(page);
  expect(midRun.elapsedSteps).toBe(base + 600);

  await pauseWithEscape(page);
  // The pause is claimed *inside* a step, so a tick or two of the run is spent
  // reaching it. What the clock must not do is move from here.
  const frozenAt = (await runState(page)).elapsedSteps;
  expect(frozenAt).toBeGreaterThanOrEqual(base + 600);
  expect(frozenAt).toBeLessThanOrEqual(base + 603);

  // **The clock is frozen by the pause contract, not by a second mechanism.**
  // `settings` simulates — it is the pause one screen deeper — so the run is
  // stepped there too and must still not age.
  await page.locator('.euc-menu--pause [data-menu="settings"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
  await page.evaluate(() => window.game.advance(300));
  expect((await runState(page)).elapsedSteps, 'the clock aged behind the settings screen')
    .toBe(frozenAt);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.evaluate(() => window.game.advance(300));
  expect((await runState(page)).elapsedSteps, 'the clock aged behind the pause card')
    .toBe(frozenAt);

  // The two mode-specific controls are drawn, and they say which session
  // they end rather than inheriting the track day's words.
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"] .euc-button__label'))
    .toHaveText('End run');
  await expect(page.locator('.euc-menu--pause [data-menu="retry-run"]')).toBeVisible();

  // Resume is the same attempt.
  await page.locator('.euc-menu--pause [data-menu="resume"]').click();
  await freeze(page);
  const resumed = await runState(page);
  expect(resumed.state).toBe('trickRun');
  expect(resumed.elapsedSteps, 'Resume started a second clock')
    .toBeGreaterThanOrEqual(frozenAt);
  expect(resumed.elapsedSteps).toBeLessThan(frozenAt + 300);

  // Retry is a new one, from the start.
  await pauseWithEscape(page);
  await page.locator('.euc-menu--pause [data-menu="retry-run"]').click();
  const pauseRetrySpent = await freeze(page);
  const retried = await runState(page);
  expect(retried.state).toBe('trickRun');
  expect(retried.elapsedSteps, 'Retry resumed the old clock').toBe(pauseRetrySpent);
  expect(retried.elapsedSteps).toBeLessThan(frozenAt);
  expect(retried.remainingSteps).toBe(TRICK_RUN.durationSteps - pauseRetrySpent);

  // End run gives an explicitly unfinished card and files nothing.
  await scoreAndFinishPartially(page);
  await pauseWithEscape(page);
  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  const ended = await runState(page);
  expect(ended.state).toBe('results');
  expect(ended.completed, 'an ended run claimed the full clock').toBe(false);
  expect(ended.wasRecord, 'an unfinished run reached the store').toBe(false);
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('Run ended early');
  const notes = await page.locator('[data-menu="results-notes"] li').allTextContents();
  expect(notes.some((note) => note.includes('no best was saved')), notes.join(' | ')).toBe(true);
  expect(await storedBest(page), 'an unfinished run filed a best').toBe(null);

  expect(errors).toEqual([]);
});

/** Earn something, but stop well short of the deadline. */
async function scoreAndFinishPartially(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(120);
  });
}

/** The stored best for the park, read straight out of the store. */
function storedBest(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const game = window.game;
    return game.trickRecords.best(game.levelPlan.id)?.score ?? null;
  });
}

// ---------------------------------------------------------------------------
// The routes panel's contextual action
// ---------------------------------------------------------------------------

test('the routes panel offers the run once the park is selected, and withdraws it otherwise', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'routes');

  // The city is loaded: the action is not offered.
  await expect(page.locator(ROUTES_ENTRY)).toBeHidden();

  await page.locator('.euc-menu--routes [data-menu="venue"][data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().world.levelId === 'switchback');
  // **`pickVenue` still only selects.** The place swapped behind the panel and
  // nothing was armed (§38.6).
  expect((await runState(page)).state, 'choosing a place started a mode').toBe('routes');
  expect((await runState(page)).phase).toBe('idle');
  await expect(page.locator(ROUTES_ENTRY)).toBeVisible();
  // The status line says which next action the press made available.
  await expect(page.locator('[data-menu="route-status"]'))
    .toContainText('Trick Run scores your tricks here');

  // And it withdraws when the selection moves to a place that does not host one.
  await page.locator('.euc-menu--routes [data-menu="venue"][data-venue="track"]').click();
  await page.waitForFunction(() => window.game.snapshot().world.levelId === 'track');
  await expect(page.locator(ROUTES_ENTRY)).toBeHidden();
  await expect(page.locator('[data-menu="route-status"]')).not.toContainText('Trick Run');

  // Back to the park, and the contextual action is the door.
  await page.locator('.euc-menu--routes [data-menu="venue"][data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().world.levelId === 'switchback');
  await page.locator(ROUTES_ENTRY).click();
  const armed = await runState(page);
  expect(armed.state, 'the routes panel’s action did not arm the run').toBe('trickRun');
  expect(armed.phase).toBe('running');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// New route leaves cleanly
// ---------------------------------------------------------------------------

test('New route leaves the run behind and files nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  await scoreAndFinishPartially(page);
  await pauseWithEscape(page);

  await page.locator('.euc-menu--pause [data-menu="new-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'freeRide',
    undefined,
    { timeout: 60_000 },
  );
  const after = await runState(page);
  expect(after.phase, 'a referee survived the world swap').toBe('idle');
  expect(after.world, 'the generated route was not installed').toBe('generated');
  expect(await storedBest(page), 'abandoning filed a score').toBe(null);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// No hidden referee
// ---------------------------------------------------------------------------

test('no other mode runs a trick referee, and the park link alone arms nothing', async ({ page }) => {
  const errors = collectErrors(page);
  // **The link is a world link, never an auto-started mode** (§38.6).
  await bootToTitle(page, PARK);
  expect((await runState(page)).phase, 'a link armed a run').toBe('idle');
  expect((await runState(page)).state).toBe('title');

  await page.evaluate(() => window.game.setAppState('freeRide'));
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.advance(240);
  });
  expect((await runState(page)).phase, 'a free ride kept score').toBe('idle');

  // And a Track Day on the same venue owns its own observer, with no second
  // one counting the session. Through the title, because a mode armed from a
  // ride is a transition no player can make.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await page.evaluate(() => window.game.startTrackDay());
  await page.evaluate(() => window.game.advance(240));
  const lapping = await page.evaluate(() => ({
    state: window.game.snapshot().app.state,
    lap: window.game.snapshot().trackDay.phase,
    trick: window.game.snapshot().trickRun.phase,
    session: window.game.snapshotFor(0).tricks.session,
  }));
  expect(lapping.state).toBe('trackDay');
  expect(lapping.lap).not.toBe('idle');
  expect(lapping.trick, 'a trick referee ran inside a track day').toBe('idle');
  expect(lapping.session, 'the lap session lost its own tally').not.toBe(null);

  expect(errors).toEqual([]);
});

test('the bridge entrance obeys the same guards as the buttons', async ({ page }) => {
  const errors = collectErrors(page);
  // The city does not host a run — but the entrance brings the park, exactly
  // as the title button does, rather than arming on a world that cannot.
  await bootToTitle(page);
  await page.evaluate(() => window.game.startTrickRun());
  const fromCity = await runState(page);
  expect(fromCity.world).toBe('switchback');
  expect(fromCity.state).toBe('trickRun');

  // From a *ride*, the transition is illegal and nothing is armed: `freeRide`
  // lists no `trickRun` successor, and a missing edge fails silently, so this
  // is the refusal being asserted rather than assumed.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await page.evaluate(() => window.game.setAppState('freeRide'));
  await page.evaluate(() => window.game.startTrickRun());
  const fromRide = await runState(page);
  expect(fromRide.state, 'the bridge armed a run from a ride').toBe('freeRide');
  expect(fromRide.phase, 'a hidden referee was armed').toBe('idle');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The personal best — §38.5
// ---------------------------------------------------------------------------

test('a first completed run files a best, an improvement replaces it, a tie and a worse run do not', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());

  await page.locator(TITLE_ENTRY).click();
  expect((await runState(page)).previousBest, 'a cleared store offered a best').toBe(null);
  await scoreAndFinish(page, 1);
  const first = await runState(page);
  expect(first.completed).toBe(true);
  expect(first.wasRecord, 'the first completed run set no best').toBe(true);
  const one = first.scores[0];
  expect(await storedBest(page)).toBe(one);
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New personal best');
  expect(
    (await page.locator('[data-menu="results-notes"] li').allTextContents())
      .some((note) => note.includes('First completed run')),
  ).toBe(true);

  // An improvement: two hops beat one.
  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  expect((await runState(page)).previousBest, 'the arm did not snapshot the best').toBe(one);
  await scoreAndFinish(page, 2);
  const better = await runState(page);
  expect(better.scores[0]).toBeGreaterThan(one);
  expect(better.wasRecord).toBe(true);
  const two = better.scores[0];
  expect(await storedBest(page)).toBe(two);
  // The delta is signed and measured against the best that was *standing*.
  await expect(page.locator('[data-menu="results-delta"]')).toHaveText(`+${two - one}`);

  // A tie keeps the old row and is not a celebration.
  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  await scoreAndFinish(page, 2);
  const tied = await runState(page);
  expect(tied.scores[0]).toBe(two);
  expect(tied.wasRecord, 'matching your own score was called a record').toBe(false);
  expect(await storedBest(page)).toBe(two);
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('Run complete');

  // A worse run leaves it alone, and says by how much.
  await page.locator('.euc-menu--results [data-menu="retry"]').click();
  await finish(page);
  const worse = await runState(page);
  expect(worse.scores[0]).toBe(0);
  expect(worse.wasRecord).toBe(false);
  expect(await storedBest(page)).toBe(two);
  await expect(page.locator('[data-menu="results-delta"]')).toHaveText(`${0 - two}`);

  // **And it is still there after a reload**, which is the whole of what
  // "saved" means.
  await page.reload();
  await page.waitForFunction(() => typeof window.game === 'object' && window.game !== null);
  expect(await storedBest(page), 'the best did not survive a reload').toBe(two);

  expect(errors).toEqual([]);
});

test('a diagnostic session and a teleport both refuse to file, and say so', async ({ page }) => {
  const errors = collectErrors(page);
  // **`?mph=` is a diagnostic even at the shipped speed** — `Game.probing` is
  // the shared predicate and it gates loading the reference as well as filing.
  await bootToTitle(page, `${PARK}&mph=58`);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  await scoreAndFinish(page, 1);
  const probed = await runState(page);
  expect(probed.completed).toBe(true);
  expect(probed.scores[0]).toBeGreaterThan(0);
  expect(probed.wasRecord, 'a diagnostic run filed a best').toBe(false);
  expect(probed.previousBest, 'a diagnostic run was shown a reference').toBe(null);
  expect(await storedBest(page), 'a diagnostic run reached the store').toBe(null);
  expect(
    (await page.locator('[data-menu="results-notes"] li').allTextContents())
      .some((note) => note.includes('Diagnostic session')),
  ).toBe(true);

  // The teleport, on an ordinary session: the latch falls and never rises.
  await page.goto(`/?${PARK}`);
  await page.waitForFunction(() => typeof window.game === 'object' && window.game !== null);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  expect((await runState(page)).eligible).toBe(true);
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const here = game.snapshot().euc.position;
    game.placeRider({ x: here.x, y: here.y, z: here.z }, 0);
  });
  expect((await runState(page)).eligible, 'a teleport left the run eligible').toBe(false);
  await scoreAndFinish(page, 1);
  const teleported = await runState(page);
  expect(teleported.completed).toBe(true);
  expect(teleported.wasRecord, 'a teleported run filed a best').toBe(false);
  expect(await storedBest(page)).toBe(null);

  expect(errors).toEqual([]);
});

test('a live tuning override disqualifies the attempt, and putting it back does not re-qualify it', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  expect((await runState(page)).eligible).toBe(true);

  const moved = await page.evaluate(() => {
    const game = window.game;
    const path = 'EUC.hopLaunchSpeed';
    const original = game.tuning.defaultOf(path);
    game.tuning.set(path, original * 1.5);
    const dirty = game.snapshot().trickRun.eligible;
    // **Back to the default**, which clears the override marker — and must not
    // clear the latch (§38.5).
    game.tuning.set(path, original);
    return { dirty, overrides: game.tuning.overrideCount() };
  });
  expect(moved.dirty, 'an override left the attempt eligible').toBe(false);
  expect(moved.overrides, 'the override marker did not clear').toBe(0);
  expect((await runState(page)).eligible, 'putting the slider back re-qualified the run')
    .toBe(false);

  await scoreAndFinish(page, 1);
  expect((await runState(page)).wasRecord).toBe(false);
  expect(await storedBest(page)).toBe(null);
  expect(
    (await page.locator('[data-menu="results-notes"] li').allTextContents())
      .some((note) => note.includes('Development tuning')),
  ).toBe(true);

  expect(errors).toEqual([]);
});

test('clearing records takes the tricks namespace with it', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  await scoreAndFinish(page, 1);
  expect(await storedBest(page)).toBeGreaterThan(0);
  await page.evaluate(() => window.game.clearRecords());
  expect(await storedBest(page), 'clearing records left a trick score behind').toBe(null);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Scoring cannot change the ride — §38.4
// ---------------------------------------------------------------------------

test('the same input script rides identically with scoring absent and present', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);

  // **The script is the same object and the world is the same world**; the
  // only difference between the two passes is which mode owns the ride. A
  // referee that touched a force, a landing tier or the pose would show up as
  // a divergence in the first few hundred steps.
  const trace = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const ride = () => {
      const samples: string[] = [];
      // **`flights` and `landings` are lifetime counters on the controller**
      // ("Never reset", `EucController`), so the second pass starts where the
      // first one stopped. Both are baselined here so the trace compares what
      // this script *did* rather than how many rides preceded it — the counts
      // themselves are still compared, one flight and one landing at a time.
      const zero = window.game.snapshot();
      const flightBase = window.game.snapshotFor(0).tricks.facts.flightIndex;
      const landingBase = zero.euc.landings;
      for (let block = 0; block < 6; block += 1) {
        game.setActionsFor(0, { throttle: 1, steer: block % 2 === 0 ? 0.4 : -0.4, crouch: true });
        game.advance(50);
        game.setActionsFor(0, { throttle: 1, steer: 0, crouch: true, hop: true });
        game.advance(4);
        game.setActionsFor(0, { throttle: 0.5, steer: 0, crouch: false, hop: false });
        game.advance(80);
        const euc = game.snapshot().euc;
        const tricks = game.snapshotFor(0).tricks;
        samples.push([
          euc.position.x.toFixed(6), euc.position.y.toFixed(6), euc.position.z.toFixed(6),
          euc.speed.toFixed(6), euc.landings - landingBase, euc.landingQuality,
          tricks.facts.flightIndex - flightBase, tricks.pose.state,
        ].join(','));
      }
      return samples;
    };

    // Pass one: free ride, no scoring anywhere.
    game.setAppState('title');
    game.setAppState('freeRide');
    game.placeRider(game.levelPlan.spawn.position, game.levelPlan.spawn.headingY);
    game.advance(2);
    const absent = ride();
    const absentPhase = game.snapshot().trickRun.phase;

    // Pass two: the same script inside a Trick Run.
    game.setAppState('title');
    game.startTrickRun();
    game.placeRider(game.levelPlan.spawn.position, game.levelPlan.spawn.headingY);
    game.advance(2);
    const present = ride();
    const presentPhase = game.snapshot().trickRun.phase;

    return { absent, present, absentPhase, presentPhase, score: game.snapshot().trickRun.seats[0]?.score ?? 0 };
  });

  expect(trace.absentPhase, 'a free ride was scoring').toBe('idle');
  expect(trace.presentPhase, 'the second pass was not scored').toBe('running');
  expect(trace.present, 'scoring changed the ride').toEqual(trace.absent);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// q189 — trick points bank only on flights launched from a park feature
//
// The referee's own arithmetic is `src/simulation/trickRun.test.ts`'s and the
// polygons are `src/level/trickZones.test.ts`'s. What only a browser can say is
// that the composition root hands the referee the *right point*: the contact
// patch on the last grounded step, not the airborne pose on the takeoff step,
// and not the rider's pose sampled at some other moment. Two identical hops —
// one standing on a feature, one standing on the start straight — are the whole
// experiment, and everything else about them is held equal by construction.
// ---------------------------------------------------------------------------

interface HopReading {
  readonly x: number;
  readonly z: number;
  readonly score: number;
  readonly flights: number;
  readonly offZoneFlights: number;
  readonly openZone: string | null;
  readonly chargedHops: number;
  readonly award: {
    readonly kinds: string[];
    readonly landing: string;
    readonly points: number;
    readonly zone: string | null;
  } | null;
}

/**
 * Arm a run, stand the rider at `where`, take one charged hop, and report.
 *
 * **The same script both times.** The only variable between the two calls is
 * the XZ the rider is standing on, which is exactly the fact q189 says decides
 * the award — so a difference in the reading is a difference the rule made.
 * The hop itself is `scoreAndFinish`'s own inner loop: crouch past the charge
 * window, hop, and let the flight land itself.
 *
 * The placement disqualifies the attempt from filing (§38.5's teleport latch),
 * which is irrelevant here and deliberately not worked around: this is about
 * what banks, not about what is saved.
 */
async function hopAt(
  page: Page,
  where: { x: number; z: number } | 'spawn',
): Promise<HopReading> {
  return page.evaluate((target) => {
    const game = window.game;
    game.setAppState('title');
    game.startTrickRun();
    game.loop.setRunning(false);

    const spot = target === 'spawn'
      ? { x: game.levelPlan.spawn.position.x, z: game.levelPlan.spawn.position.z }
      : target;
    const ground = game.sampleGround(spot.x, spot.z);
    game.placeRider({ x: spot.x, y: ground.height, z: spot.z }, 0);
    // Let the teleport's own discard land before the hop is charged, so the
    // flight below is the only flight this reading contains.
    game.advance(10);
    // Where the wheel is actually standing, which is the point the rule is
    // about — read before the hop rather than after, because the landing is
    // metres away and is explicitly not what q189 asks.
    const stood = game.snapshot().euc.position;

    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(120);

    const seat = game.snapshot().trickRun.seats[0];
    return {
      x: stood.x,
      z: stood.z,
      score: seat.score,
      flights: seat.flights,
      offZoneFlights: seat.offZoneFlights,
      openZone: seat.openZone,
      chargedHops: seat.tally.chargedHops,
      award: seat.lastAward === null ? null : {
        kinds: [...seat.lastAward.kinds],
        landing: seat.lastAward.landing,
        points: seat.lastAward.points,
        zone: seat.lastAward.zone,
      },
    };
  }, where) as Promise<HopReading>;
}

/** The park's zones, as the running game carries them. */
function zonesOf(page: Page): Promise<TrickZone[]> {
  return page.evaluate(() => (window.game.levelPlan.trickZones ?? []).map((zone) => ({
    id: zone.id,
    corners: zone.corners.map((corner) => ({ x: corner.x, z: corner.z })),
  }))) as Promise<TrickZone[]>;
}

/**
 * The centre of a named feature's zone, in world XZ.
 *
 * A convex polygon contains the mean of its own corners, so this needs no
 * search — and it is derived from the plan the game is running rather than
 * typed in, so moving a feature along its corridor moves this test with it.
 */
function zoneCentre(zones: readonly TrickZone[], id: string): { x: number; z: number } {
  const zone = zones.find((each) => each.id === id);
  if (zone === undefined) throw new Error(`the park emitted no "${id}" zone`);
  const sum = zone.corners.reduce(
    (total, corner) => ({ x: total.x + corner.x, z: total.z + corner.z }),
    { x: 0, z: 0 },
  );
  return { x: sum.x / zone.corners.length, z: sum.z / zone.corners.length };
}

test('a flight launched from a park feature banks its tricks and names the feature', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);
  const zones = await zonesOf(page);
  expect(zones.length, 'the park emitted no trick zones').toBe(9);

  // Two of the nine, chosen because the brief names them and because they sit
  // on different corridors: a rule that only worked on one feature's geometry
  // would pass with either alone.
  for (const feature of ['ledge', 'kicker']) {
    const reading = await hopAt(page, zoneCentre(zones, feature));
    // The rider really is standing on it — `trickZoneAt` over the plan the
    // page is running, not a number typed into this file.
    expect(trickZoneAt(zones, reading.x, reading.z), `the rider drifted off the ${feature}`)
      .toBe(feature);
    expect(reading.chargedHops, 'the hop was not charged').toBe(1);
    expect(reading.flights, 'the hop opened no flight').toBe(1);
    expect(reading.award, 'the flight banked nothing at all').not.toBeNull();
    const award = reading.award as NonNullable<HopReading['award']>;
    expect(award.kinds, 'the charged hop was not counted').toContain('charged-hop');
    expect(award.zone, 'the award did not name the feature it launched from')
      .toBe(feature);
    expect(reading.offZoneFlights, `the ${feature} flight was called off-feature`).toBe(0);
    // The hop's own points are in there beside the landing's, which is the
    // whole of what q189 grants a feature flight.
    expect(reading.score, 'a feature flight banked only its landing')
      .toBeGreaterThan(TRICK_RUN.cleanLandingPoints);
    expect(reading.openZone, 'a landed flight left a zone open').toBeNull();
  }

  expect(errors).toEqual([]);
});

test('the same hop on the start straight banks only the landing and is counted off-feature', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);
  const zones = await zonesOf(page);

  const off = await hopAt(page, 'spawn');
  expect(trickZoneAt(zones, off.x, off.z), 'the start straight is inside a feature zone')
    .toBeNull();
  expect(off.chargedHops, 'the hop was not charged').toBe(1);
  expect(off.flights).toBe(1);

  const award = off.award as NonNullable<HopReading['award']>;
  expect(off.award, 'the flight banked nothing at all').not.toBeNull();
  // **The trick is still named.** The player rode it, and a corner that
  // silently dropped the words would read as a missed trick rather than as a
  // rule; the number beside it is the landing's alone.
  expect(award.kinds, 'the charged hop stopped being counted').toContain('charged-hop');
  expect(award.zone, 'a flat hop claimed a feature').toBeNull();
  expect(award.points, 'the flat hop was paid for its trick')
    .toBe(TRICK_RUN.cleanLandingPoints);
  expect(off.score).toBe(TRICK_RUN.cleanLandingPoints);
  expect(off.offZoneFlights, 'the refusal was not counted').toBe(1);

  // And the corner says so, in the words `ui/hudModel.ts` chose: the tricks,
  // then the qualifier, then the number — unshrunk and last (DESIGN §9p).
  const lane = page.locator('.euc-hud__score');
  await expect(lane.locator('[data-hud="trick-award-label"]'))
    .toHaveText('Charged hop · off feature');
  await expect(lane.locator('[data-hud="trick-award-points"]'))
    .toHaveText(`+${TRICK_RUN.cleanLandingPoints}`);

  // The card carries the count row and the sentence that explains it.
  await finish(page);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  const rows = await page.evaluate(() => [...document.querySelectorAll(
    '[data-menu="results-rows"] tr',
  )].map((row) => ({
    label: row.querySelector('th')?.textContent ?? '',
    count: row.querySelector('.euc-results__row-time')?.textContent ?? '',
    points: row.querySelector('.euc-results__row-delta')?.textContent ?? '',
  })));
  const offRow = rows.find((row) => row.label === 'Tricks off the features');
  expect(offRow, 'the card has no off-feature row').toBeDefined();
  expect(offRow?.count).toBe('1');
  expect(offRow?.points, 'a count row printed a points figure').toBe('—');
  // Directly after Repeat visits, and before Crashes.
  expect(rows.map((row) => row.label).slice(-3))
    .toEqual(['Repeat visits', 'Tricks off the features', 'Crashes']);
  await expect(page.locator('[data-menu="results-notes"]'))
    .toContainText('Tricks only score on flights launched from a park feature; 1 landed off one.');

  expect(errors).toEqual([]);
});

test('the seat block reports the rule’s own facts, and a world with no features answers none', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);

  // Idle sessions publish no books at all, which is what `phase: 'idle'` has
  // always meant here; the three q189 fields arrive with the books.
  expect(await page.evaluate(() => window.game.snapshot().trickRun.seats))
    .toEqual([]);

  const armed = await page.evaluate(() => {
    const game = window.game;
    game.setAppState('title');
    game.startTrickRun();
    game.loop.setRunning(false);
    game.advance(2);
    const seat = game.snapshot().trickRun.seats[0];
    return {
      flights: seat.flights,
      offZoneFlights: seat.offZoneFlights,
      openZone: seat.openZone,
      lastAward: seat.lastAward,
    };
  });
  expect(armed.flights).toBe(0);
  expect(armed.offZoneFlights).toBe(0);
  expect(armed.openZone, 'a run with nothing in the air named a feature').toBeNull();
  expect(armed.lastAward).toBeNull();

  // **The open flight names its launch feature while it is in the air**, which
  // is the field a HUD could say *pending on the kicker* with if the owner ever
  // asks for one. Read at the top of a flight from the ledge.
  const zones = await zonesOf(page);
  const ledge = zoneCentre(zones, 'ledge');
  const aloft = await page.evaluate((spot) => {
    const game = window.game;
    // Re-armed here rather than leaning on the reading above: this evaluate is
    // its own experiment and must not depend on what the last one left behind.
    game.setAppState('title');
    game.startTrickRun();
    game.loop.setRunning(false);
    const ground = game.sampleGround(spot.x, spot.z);
    game.placeRider({ x: spot.x, y: ground.height, z: spot.z }, 0);
    game.advance(10);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    // A third of the way into the flight, well before the touchdown: a charged
    // hop's launch trails the press by the compression's own release, so a
    // handful of steps is still on the ground.
    game.advance(30);
    const seat = game.snapshot().trickRun.seats[0];
    return { openZone: seat.openZone, flights: seat.flights };
  }, ledge);
  expect(aloft.flights, 'no flight was in the air to read').toBe(1);
  expect(aloft.openZone, 'the open flight forgot where it launched from').toBe('ledge');

  // A world that carries no zones answers null for every point by
  // construction, which is what keeps the four other producers unchanged.
  await boot(page);
  expect(await page.evaluate(() => window.game.levelPlan.trickZones ?? null))
    .toBeNull();

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The couch — 2, 3 and 4 seats
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

async function claimWithPad(page: Page, index: number, button = 0): Promise<void> {
  await page.evaluate(async ({ at, which }) => {
    type Pads = { buttons: { pressed: boolean; value: number }[] }[];
    const pad = (window as unknown as { fakePads: Pads }).fakePads[at];
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[which].pressed = true;
    pad.buttons[which].value = 1;
    await frame();
    pad.buttons[which].pressed = false;
    pad.buttons[which].value = 0;
    await frame();
  }, { at: index, which: button });
}

/** m37's `sitDown`, unchanged: a room of `seats` people on the real panel. */
async function sitDown(page: Page, seats: number, query: string): Promise<void> {
  await fakePads(page, seats - 1);
  await bootToTitle(page, query);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
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

for (const seats of [2, 3, 4]) {
  test(`a ${seats}-seat room scores together, keeps its claims and plays next`, async ({ page }) => {
    const errors = collectErrors(page);
    // **From the city, so Start has to name and bring the destination.**
    await sitDown(page, seats, '');
    await page.evaluate(() => window.game.clearRecords());

    // The chooser offers the new member, and its note names the destination.
    await expect(page.locator(`${COUCH_MODE}[data-couch-mode="trickRun"]`)).toBeVisible();
    await page.locator(`${COUCH_MODE}[data-couch-mode="trickRun"]`).click();
    expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('trickRun');
    await expect(page.locator('.euc-menu--couch .euc-couch__mode .euc-field__note').last())
      .toContainText('Switchback Park');

    await page.locator(COUCH_START).click();
    const armed = await page.evaluate(() => {
      const snap = window.game.snapshot();
      return {
        state: snap.app.state,
        phase: snap.trickRun.phase,
        seats: snap.trickRun.seats.length,
        world: snap.world.levelId,
        devices: snap.input.devices,
      };
    });
    expect(armed.state, 'the join panel did not reach the mode').toBe('trickRun');
    expect(armed.phase).toBe('running');
    expect(armed.seats, 'the referee was armed for the wrong room').toBe(seats);
    expect(armed.world).toBe('switchback');
    // **Start preserves the claims.** M27 Phase 5's defect was exactly this:
    // a mode added to the panel and left out of the couch-preservation exits
    // sent every guest home between the arm and the first frame.
    expect(armed.devices.length, 'a guest went home on the way in').toBe(seats);

    // One shared clock, and every seat scores on it.
    await page.evaluate((count) => {
      const game = window.game;
      game.loop.setRunning(false);
      for (let seat = 0; seat < count; seat += 1) {
        game.setActionsFor(seat, { throttle: 0, crouch: true });
      }
      game.advance(60);
      for (let seat = 0; seat < count; seat += 1) {
        game.setActionsFor(seat, { throttle: 0, crouch: true, hop: true });
      }
      game.advance(4);
      for (let seat = 0; seat < count; seat += 1) {
        game.setActionsFor(seat, { throttle: 0, crouch: false, hop: false });
      }
      game.advance(160);
    }, seats);
    await finish(page);

    const done = await page.evaluate(() => {
      const snap = window.game.snapshot();
      return {
        state: snap.app.state,
        scores: snap.trickRun.seats.map((seat) => seat.score),
        wasRecord: snap.trickRun.wasRecord,
        devices: snap.input.devices,
      };
    });
    expect(done.state).toBe('results');
    expect(done.scores.length).toBe(seats);
    // **A couch files nothing, seat 0 included** (§38.5).
    expect(done.wasRecord).toBe(false);
    expect(await storedBest(page), `a ${seats}-seat couch run filed a best`).toBe(null);

    // One named group per seat, in seat order, with no personal-best column.
    const groups = await page.locator('.euc-results__trick-rider').allTextContents();
    expect(groups.length, 'a seat lost its group on the card').toBe(seats);
    const rows = await page.locator('[data-menu="results-rows"] tr').count();
    expect(rows, 'the couch card lost a seat row').toBe(seats);
    await expect(page.locator('[data-menu="results-column-label"]')).toHaveText('Player');
    await expect(page.locator('[data-menu="results-column-value"]')).toHaveText('Points');

    // **Play next** knows the new member and keeps the room together.
    await page.locator('[data-menu="results-couch"] [data-couch-mode="freeRide"]').click();
    const moved = await page.evaluate(() => {
      const snap = window.game.snapshot();
      return {
        state: snap.app.state,
        phase: snap.trickRun.phase,
        devices: snap.input.devices,
      };
    });
    expect(moved.state, 'Play next did not leave for the other mode').toBe('freeRide');
    expect(moved.phase, 'a referee survived the mode switch').toBe('idle');
    expect(moved.devices.length, 'the room lost its claims changing mode').toBe(seats);

    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// The couch card fits the window the mode guarantees it can be played in
// ---------------------------------------------------------------------------

for (const seats of [2, 3, 4] as const) {
  test(`every control on the ${seats}-seat Trick Run card is above the fold at the couch's own minimum`, async ({ page }) => {
    /*
     * **M37 §37.5's contract, applied to the card M38 adds.** The panel is in
     * the stylesheet's scroll-by-design group, but a control below the fold is
     * a control somebody has to go looking for — and 1000 x 700 is the one
     * window the couch guarantees it can be played at (`COUCH_MIN_WIDTH_PX`,
     * which is also this suite's own).
     *
     * This card carries more than any other: a row a seat, a *group* a seat,
     * the notes, the chooser and three actions. Measured as built it was 48 px
     * past the fold at two seats and 255 at four, which is how the compact
     * one-line-a-seat Tricks rows and the card's other trims were chosen
     * (`game.css`). Every control, not the last one, so the next row that
     * arrives cannot quietly push a second one out.
     */
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    await sitDown(page, seats, '');
    await page.locator(`${COUCH_MODE}[data-couch-mode="trickRun"]`).click();
    await page.locator(COUCH_START).click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');
    await finish(page);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

    const fit = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('.euc-menu--results')!;
      const panel = menu.querySelector<HTMLElement>('.euc-results')!;
      return {
        content: menu.scrollHeight,
        window: window.innerHeight,
        rows: panel.querySelectorAll('[data-menu="results-rows"] tr').length,
        groups: panel.querySelectorAll('.euc-results__trick-group').length,
        controls: [...panel.querySelectorAll<HTMLElement>('button, [data-couch-mode]')]
          .filter((node) => node.offsetParent !== null)
          .map((node) => ({
            what: node.dataset.menu ?? node.dataset.couchMode ?? '',
            top: node.getBoundingClientRect().top,
            bottom: node.getBoundingClientRect().bottom,
          })),
      };
    });

    // A row and a group per seat: the fit is only meaningful if the card is
    // actually carrying everybody.
    expect(fit.rows, 'the card lost a seat row').toBe(seats);
    expect(fit.groups, 'the card lost a seat group').toBe(seats);
    expect(fit.controls.length, 'the card drew no controls at all').toBeGreaterThan(3);
    for (const control of fit.controls) {
      expect(
        control.bottom,
        `"${control.what}" ends ${(control.bottom - fit.window).toFixed(1)} px below the fold `
          + `at ${seats} seats (card content ${fit.content} px in a ${fit.window} px window)`,
      ).toBeLessThanOrEqual(fit.window);
      expect(control.top, `"${control.what}" starts above the window`).toBeGreaterThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}


/**
 * The solo card is the one that actually grew a row — q189's count row and,
 * when it happened, the sentence that explains it.
 *
 * **What this pins, and what pins the fit.** This spec is about the *row* — it
 * is on the card, in its place, at two of the sizes the card is drawn at. The
 * solo card's fit has its own contract below (`every control on the solo Trick
 * Run card…`), across the whole viewport list, added when the repair landed:
 * as built, the card ran 815 px of content into a 700 px window and its lowest
 * control sat 94 px below the fold, and it fits every one of those windows now.
 *
 * **The window is set before the card is built, not after.** The panel picks
 * its fit tier as it is shown, so resizing a card already on screen reads a
 * geometry no player meets — 679 px against a 640 px window, against 626 px
 * for the same card built at that size.
 */
for (const viewport of [{ width: 1000, height: 640 }, { width: 1600, height: 500 }] as const) {
  test(`the solo Trick Run card carries the off-feature row at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await bootToTitle(page, PARK);
    await page.evaluate(() => window.game.clearRecords());
    // The widest this card gets for a solo rider: a run with something to
    // explain as well as something to report.
    await hopAt(page, 'spawn');
    await finish(page);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
    await expect(page.locator('[data-menu="results-notes"]'))
      .toContainText('Tricks only score on flights launched from a park feature; 1 landed off one.');

    const fit = await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.euc-results')!;
      return {
        rows: [...panel.querySelectorAll('[data-menu="results-rows"] th')]
          .map((cell) => cell.textContent ?? ''),
        controls: [...panel.querySelectorAll<HTMLElement>('button')]
          .filter((node) => node.offsetParent !== null)
          .map((node) => ({
            what: node.dataset.menu ?? '',
            top: node.getBoundingClientRect().top,
            bottom: node.getBoundingClientRect().bottom,
          })),
        window: window.innerHeight,
      };
    });

    expect(fit.rows, 'the off-feature row is missing').toContain('Tricks off the features');
    expect(fit.rows.slice(-3), 'the row moved out of its place')
      .toEqual(['Repeat visits', 'Tricks off the features', 'Crashes']);
    expect(fit.controls.length, 'the card drew no controls at all').toBeGreaterThan(2);
    for (const control of fit.controls) {
      expect(
        control.bottom,
        `"${control.what}" ends ${(control.bottom - fit.window).toFixed(1)} px below the fold`,
      ).toBeLessThanOrEqual(fit.window + 1);
      expect(control.top, `"${control.what}" starts above the window`).toBeGreaterThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------
// The solo card fits every desktop window the results panel is contracted at
// ---------------------------------------------------------------------------

/** The m26 viewport list — the one every results-card fit contract is read at. */
const SOLO_FOLD_VIEWPORTS = [
  { width: 1000, height: 700 },   // the browser suite's own window, and the desktop minimum
  { width: 1000, height: 640 },   // where the short-window trims engage
  { width: 1000, height: 560 },
  { width: 1000, height: 520 },
  { width: 1280, height: 720 },
  { width: 1600, height: 500 },   // short and wide, the worst shape
  { width: 1920, height: 1080 },
] as const;

/** Every row this card must still be carrying for the fit above to mean anything. */
const SOLO_TRICK_ROWS = [
  'Clean landings',
  'Charged hops',
  '180s landed',
  'One-foot airs',
  'Two tricks in a flight',
  'Landing quality',
  'Repeat visits',
  'Tricks off the features',
  'Crashes',
] as const;

test('every control on the solo Trick Run card is above the fold at every desktop window', async ({ page }) => {
  /*
   * **M26's results-card contract, extended to the card that has the most on
   * it.** The couch cards (2/3/4 seats) are pinned above and in
   * `tests/m37.spec.ts`; the solo Trick Run card was the one left out, and it
   * measured **94 px below the fold at 1000 x 700** — eight breakdown rows and
   * Crashes, the Tricks region, and two notes, on a window where none of the
   * card's short-window trims have engaged.
   *
   * The fix was layout and nothing was dropped: on *this* card the Tricks
   * region repeats the table's own Count column four times, so it is withdrawn
   * by `data-results-mode="trickRun"` (the solo card's mode; the couch Trick
   * Run card, whose table carries points rather than counts, keeps its region).
   *
   * **The window is set before the card is built, not after.** The panel picks
   * its fit tier as it is shown, so resizing a card already on screen reads a
   * geometry no player meets — the pitfall the two specs above this one record.
   * Each size therefore gets its own run, its own clean record store and its
   * own freshly built card.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const report: string[] = [];
  for (const viewport of SOLO_FOLD_VIEWPORTS) {
    await page.setViewportSize(viewport);
    // A first run every time, so every size measures the same card: the same
    // notes, the same rows, and the widest this card gets for one rider — a
    // run with something to explain (the off-feature note) as well as
    // something to report.
    await page.evaluate(() => window.game.clearRecords());
    await hopAt(page, 'spawn');
    await finish(page);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

    const fit = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('.euc-menu--results')!;
      const panel = menu.querySelector<HTMLElement>('.euc-results')!;
      const tricks = panel.querySelector<HTMLElement>('[data-menu="results-tricks"]');
      return {
        content: menu.scrollHeight,
        client: menu.clientHeight,
        scrolled: menu.scrollTop,
        window: window.innerHeight,
        mode: panel.dataset.resultsMode ?? '',
        tricksPainted: tricks === null ? 0 : tricks.getBoundingClientRect().height,
        rows: [...panel.querySelectorAll('[data-menu="results-rows"] th')]
          .map((cell) => cell.textContent ?? ''),
        notes: [...panel.querySelectorAll('[data-menu="results-notes"] li')]
          .map((item) => item.textContent ?? ''),
        controls: [...panel.querySelectorAll<HTMLElement>('button, [data-couch-mode]')]
          .filter((node) => node.offsetParent !== null)
          .map((node) => ({
            what: node.dataset.menu ?? node.dataset.couchMode ?? '',
            top: node.getBoundingClientRect().top,
            bottom: node.getBoundingClientRect().bottom,
          })),
      };
    });

    const size = `${viewport.width}x${viewport.height}`;
    const lowest = Math.max(...fit.controls.map((control) => control.bottom));
    report.push(`${size}: content ${fit.content} in ${fit.window}, lowest control ${lowest.toFixed(1)}`);

    // **The card fits, rather than having been scrolled into fitting.** A
    // focused control is scrolled into view by the browser, and `Ride it
    // again` is not the lowest button on this card — so a card that overflows
    // can still present *it* while the two under it sit off the screen, and
    // the amount scrolled moves with the overflow. Measured on the card itself
    // (M26's own metric) and then on every control, in the position the player
    // is handed.
    //
    // The slack is M26's own and means the same thing there: the *menu's*
    // 14.4 px of bottom padding, of which 2 px hang below the fold at
    // 1000 x 700 once the panel itself has fitted (measured: the panel ends at
    // 687.4 in a 700 px window). Four pixels, so a new row — twenty at the
    // very least — still fails here rather than quietly pushing a button off
    // the screen.
    expect(
      fit.content - fit.client,
      `the card has ${fit.content - fit.client} px below the fold at ${size}`,
    ).toBeLessThanOrEqual(4);
    expect(fit.scrolled, `the card opened already scrolled at ${size}`).toBeLessThanOrEqual(1);

    // **The card is the Trick Run's own, and it is complete.** A fit contract
    // over a card that has quietly lost a row is a contract over nothing.
    expect(fit.mode, `the card at ${size} is not marked as the solo Trick Run's`).toBe('trickRun');
    expect(fit.rows, `the breakdown lost or reordered a row at ${size}`)
      .toEqual([...SOLO_TRICK_ROWS]);
    expect(fit.notes.join(' | '), `the off-feature note is missing at ${size}`)
      .toContain('Tricks only score on flights launched from a park feature');
    // The counts the withdrawn region used to repeat are still on the card,
    // in the Count column the table heads.
    expect(fit.tricksPainted, `the Tricks region is painting on the solo card at ${size}`).toBe(0);

    const named = fit.controls.map((control) => control.what);
    for (const control of ['retry', 'new-route', 'results-title']) {
      expect(named, `"${control}" is not on the card at ${size}`).toContain(control);
    }

    for (const control of fit.controls) {
      expect(
        control.bottom,
        `"${control.what}" ends ${(control.bottom - fit.window).toFixed(1)} px below the fold `
          + `at ${size} (card content ${fit.content} px in a ${fit.window} px window)`,
      ).toBeLessThanOrEqual(fit.window + 1);
      expect(control.top, `"${control.what}" starts above the window at ${size}`)
        .toBeGreaterThanOrEqual(0);
    }
  }
  console.log(`solo Trick Run card fit:\n  ${report.join('\n  ')}`);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Resource plateau across repeated retries and mode swaps
// ---------------------------------------------------------------------------

test('repeated retries and mode swaps plateau GPU objects and listeners', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());

  const trace = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const counts: { geometries: number; textures: number; programs: number }[] = [];
    for (let round = 0; round < 4; round += 1) {
      game.startTrickRun();
      game.advance(120);
      // Out to the title and back in, which is the exit that disposes.
      game.setAppState('title');
      game.startTrackDay();
      game.advance(60);
      game.setAppState('title');
      const resources = game.resources();
      counts.push({
        geometries: resources.geometries,
        textures: resources.textures,
        programs: resources.programs,
      });
    }
    return counts;
  });

  const last = trace[trace.length - 1];
  const settled = trace[1];
  expect(last.geometries, 'geometries grew across repeated runs')
    .toBeLessThanOrEqual(settled.geometries);
  expect(last.textures, 'textures grew across repeated runs')
    .toBeLessThanOrEqual(settled.textures);
  expect(last.programs, 'programs grew across repeated runs')
    .toBeLessThanOrEqual(settled.programs);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// A real finger — §38.6's "inner note/SVG targets with genuine touch"
// ---------------------------------------------------------------------------

/**
 * **The spec builds the configuration the suite's projects do not produce.**
 * `hasTouch` gives a genuinely coarse-pointered context, so `tap()` sends real
 * touch pointers and the floor below is measured rather than simulated — the
 * rule AGENTS records after M26 shipped an 18 px target under a comment naming
 * the machine that needed 44.
 */
test.describe('the Trick Run entry under a real finger', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 800 } });

  test('a tap on the entry, and on its note, both arm the run', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page, PARK);

    const entry = page.locator(TITLE_ENTRY);
    const box = await entry.boundingBox();
    expect(box, 'the entry is not on screen in portrait').not.toBeNull();
    expect(box?.height ?? 0, 'the entry is under the finger-sized floor')
      .toBeGreaterThanOrEqual(44);

    // **An inner element, not the button.** M20's defect: `onClick` resolves
    // the nearest `data-menu` ancestor, so a hook *inside* a control makes a
    // tap on that line a silent no-op — and on a phone the inner lines are
    // most of a button's height, so which one a thumb hits is luck.
    //
    // Which inner element is the *stylesheet's* answer, not this spec's: the
    // narrow title tier hides every button note (`game.css`), so asking the
    // page is how this stays a test of the real screen rather than of a layout
    // that has moved. Both lines are hooks-free and must both arm the run.
    const note = page.locator(`${TITLE_ENTRY} .euc-button__note`);
    const inner = await note.isVisible() ? note : page.locator(`${TITLE_ENTRY} .euc-button__label`);
    await inner.tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');
    expect((await runState(page)).phase).toBe('running');

    // And the pause card's two controls are reachable by finger as well.
    await pauseWithEscape(page);
    for (const control of ['end-session', 'retry-run']) {
      const button = page.locator(`.euc-menu--pause [data-menu="${control}"]`);
      const bounds = await button.boundingBox();
      expect(bounds, `${control} is not on screen`).not.toBeNull();
      expect(bounds?.height ?? 0, `${control} is under the finger-sized floor`)
        .toBeGreaterThanOrEqual(44);
    }
    await page.locator('.euc-menu--pause [data-menu="retry-run"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');

    expect(errors).toEqual([]);
  });
});
