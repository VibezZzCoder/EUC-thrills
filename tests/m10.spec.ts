/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { ALLEY_ROUTE, SAFE_ROUTE } from '../src/level/sliceLevel.ts';
import { CHALLENGE } from '../src/data/tuning.ts';

/**
 * The actual six-gate lap, expressed only as segment ids.
 *
 * M10's focused scenarios teleport into checkpoint volumes so a rule failure
 * does not have to wait for a whole lap. That makes them fast and precise, but
 * it also means they cannot prove the checkpoints compose into a route a rider
 * can complete. This list closes that gap through the same `LevelPlan` surface
 * an M12-generated course will expose: the route follower reconstructs every
 * point from `levelPlan.segments`, never from slice authoring geometry.
 */
const TIMED_SAFE_ROUTE: readonly string[] = [
  'plaza',
  'boulevard-north',
  'boulevard-bend',
  'curb-run',
  'fork',
  ...SAFE_ROUTE,
  'park-gate',
  'riverside',
  'ford-in',
  'ford-out',
  'riverside-lower',
  'gravel-spur',
  'trailhead',
  'berm',
  'kicker-run',
  'kicker-land',
  'return-climb',
  'return-plaza',
];

const TIMED_ALLEY_ROUTE: readonly string[] = [
  'plaza',
  'boulevard-north',
  'boulevard-bend',
  'curb-run',
  'fork',
  ...ALLEY_ROUTE,
  'park-gate',
  'riverside',
  'ford-in',
  'ford-out',
  'riverside-lower',
  'gravel-spur',
  'trailhead',
  'berm',
  'kicker-run',
  'kicker-land',
  'return-climb',
  'return-plaza',
];

/**
 * M10 — the challenge: checkpoints, timer, splits, ghost, save data, results.
 *
 * The exit question is *"do I want to beat my own time?"*, and like every exit
 * question it is a human's to answer. What a browser can prove is the set of
 * things that question silently depends on, and the ones a human would never
 * reliably catch:
 *
 *   - **A run measures riding, not the route the player found through the
 *     menus.** The clock starts on the line, restarts cleanly, and survives a
 *     pause without becoming a free ride.
 *   - **A personal best is still there after a reload**, which is the entire
 *     value of the feature and the one thing no amount of playing tests,
 *     because a player only discovers it is broken tomorrow.
 *   - **The mode costs nothing when it is off.** Free ride must return to its
 *     exact M9 draw-call figure; a challenge that leaks geometry into the mode
 *     the owner's five-minute test is judged in would be a regression nobody
 *     attributed to M10.
 *
 * **Most of M10's logic is headless and belongs there** — the referee, the
 * ghost's arithmetic, the record rules, the HUD model's dwell, and the gate
 * geometry are all pure and covered by `node --test`, including the yaw
 * convention and the anti-tunnelling margin. This file is for what only a real
 * browser answers: that the DOM says what the model decided, that a reload
 * remembers, and that the frame does not grow.
 *
 * Runs are driven by teleporting between the plan's own checkpoints rather than
 * by riding the lap. That is deliberate and is the same reasoning `placeRider`
 * was built on at M4: riding the whole route would make every assertion below a
 * test of the route as much as of the thing it names, and a three-minute lap
 * per scenario would put this file out of reach of a routine run.
 */

interface Gate {
  id: string;
  routeIndex: number;
  kind: string;
  label: string;
  centre: { x: number; y: number; z: number };
  headingY: number;
}

function challenge(page: Page) {
  return page.evaluate(() => window.game.snapshot().challenge);
}

function gates(page: Page): Promise<Gate[]> {
  return page.evaluate(() => window.game.levelPlan.checkpoints.map((cp) => ({
    id: cp.id,
    routeIndex: cp.routeIndex,
    kind: cp.kind,
    label: cp.label,
    centre: { ...cp.centre },
    headingY: cp.headingY,
  })));
}

/**
 * Put the wheel inside a gate and take one step, so the referee sees it.
 *
 * The gate's centre is one half-height above the surface and the contact patch
 * rides on the ground, so the rider is placed at the centre's XZ with the
 * controller left to resolve its own height — which is what a real crossing
 * looks like and what would expose a gate whose box was authored too high.
 */
async function crossGate(page: Page, gate: Gate, steps = 2): Promise<void> {
  await page.evaluate(
    ({ centre, headingY, steps: n }) => {
      window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
      window.game.advance(n);
    },
    { centre: gate.centre, headingY: gate.headingY, steps },
  );
}

/** Arm a run and cross every gate in order. Returns the finished snapshot. */
async function completeLap(page: Page, list: Gate[], holdSteps = 60) {
  await page.evaluate(() => window.game.startTimeTrial());
  for (const gate of list) {
    await crossGate(page, gate);
    // Time between gates, so the splits are distinguishable rather than all
    // landing on the same hundredth.
    await page.evaluate((n) => window.game.advance(n), holdSteps);
  }
  return challenge(page);
}

test.describe('M10 — the challenge', () => {
  test('the slice offers a timed route and the proving ground does not', async ({ page }) => {
    await bootToTitle(page);

    const list = await gates(page);
    expect(list.length, 'the slice carries six checkpoints').toBe(6);
    expect(list[0].kind).toBe('start');
    expect(list[list.length - 1].kind).toBe('finish');
    expect(list.map((gate) => gate.routeIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect((await challenge(page)).available).toBe(true);

    await expect(page.locator('.euc-menu--title [data-menu="challenge"]')).toBeVisible();
    // Start ride stays the primary action. Free ride is the game, and the
    // owner's deciding gate is five minutes with no objective at all.
    await expect(page.locator('.euc-menu--title [data-menu="start"]')).toHaveClass(/euc-button--primary/);

    // The proving ground is a measuring instrument rather than a place, so it
    // carries no route and cannot be timed.
    await bootToTitle(page, 'level=proving');
    expect(await gates(page)).toEqual([]);
    expect((await challenge(page)).available).toBe(false);
  });

  test('the clock starts on the line, not on the button', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    const list = await gates(page);

    await page.evaluate(() => window.game.startTimeTrial());
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('challenge');
    await page.evaluate(() => window.game.advance(1));
    expect((await challenge(page)).distanceToNext).toBeCloseTo(CHALLENGE.startRunupMetres, 0);

    // Two seconds waiting in the run-up before reaching the line. None of it is
    // timed — there is no countdown, so retry is instant and the player rolls
    // into the start rather than sitting through one.
    let armed = await page.evaluate(() => {
      window.game.advance(240);
      return window.game.snapshot().challenge;
    });
    expect(armed.phase).toBe('armed');
    expect(armed.elapsed).toBe(0);
    expect(armed.passed).toBe(0);

    await crossGate(page, list[0]);
    const running = await challenge(page);
    expect(running.phase).toBe('running');
    expect(running.passed).toBe(1);
    // The clock is running but has barely started: the crossing step itself.
    expect(running.elapsed).toBeGreaterThan(0);
    expect(running.elapsed).toBeLessThan(0.1);

    await page.evaluate(() => window.game.advance(120));
    expect((await challenge(page)).elapsed).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
  });

  test('a hidden tab freezes a timed run rather than letting its clock advance', async ({ page }) => {
    // A hidden ride is a frozen ride (M10 QA, F2). Before the fix the loop
    // kept stepping whichever state simulates, so a run's clock advanced while
    // the player could not see it — a fairness defect on the one mode that is
    // entirely about the clock. The state itself is preserved: hiding is not a
    // pause, and coming back resumes the same run with the clock re-anchored.
    const errors = collectErrors(page);
    await bootToTitle(page);
    const list = await gates(page);

    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    await page.waitForFunction(() => window.game.snapshot().challenge.phase === 'running');

    // The document goes hidden, through the same property and event the real
    // browser fires. The rAF loop keeps running in headless, which is exactly
    // the condition the QA reproduction exploited.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const atHide = await challenge(page);
    await page.waitForTimeout(500);
    const whileHidden = await challenge(page);
    expect(whileHidden.elapsed).toBe(atHide.elapsed);
    expect(whileHidden.phase).toBe('running');

    // Visible again: the run resumes where it stood, and the hidden interval
    // was not replayed as half a second of simulation.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(
      (frozen) => window.game.snapshot().challenge.elapsed > frozen,
      whileHidden.elapsed,
    );
    const resumed = await challenge(page);
    expect(resumed.phase).toBe('running');
    expect(resumed.elapsed).toBeLessThan(whileHidden.elapsed + 0.45);

    expect(errors).toEqual([]);
  });

  test('the objective bearing turns with the rider, so a missed gate is recoverable', async ({ page }) => {
    await bootToTitle(page);
    await page.evaluate(() => {
      window.game.startTimeTrial();
      window.game.advance(1);
    });

    const objective = page.locator('[data-hud="objective"]');
    await expect(objective).toHaveText(/^↑ Ride to the start line/);

    await page.evaluate(() => {
      const rider = window.game.snapshot().euc;
      window.game.placeRider(rider.position, rider.headingY + Math.PI);
      window.game.advance(1);
    });
    await expect(objective).toHaveText(/^↓ Ride to the start line/);
  });

  test('a gate out of order is ignored, which is what stops the course being cut', async ({ page }) => {
    await bootToTitle(page);
    const list = await gates(page);

    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);

    // Straight to the finish. The loop closes into the plaza, so this is a
    // short ride in the real world — and it must count for nothing.
    await crossGate(page, list[5]);
    let state = await challenge(page);
    expect(state.phase, 'the finish must not end a run that skipped four gates').toBe('running');
    expect(state.passed).toBe(1);
    expect(state.nextIndex).toBe(1);

    // Skipping to a later split is refused for the same reason.
    await crossGate(page, list[3]);
    state = await challenge(page);
    expect(state.passed).toBe(1);
    expect(state.nextIndex).toBe(1);

    // And the gate it is actually looking for still works afterwards.
    await crossGate(page, list[1]);
    expect((await challenge(page)).passed).toBe(2);
  });

  test('a full lap finishes, splits are ordered, and the results screen follows', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    const finished = await completeLap(page, list);
    expect(finished.phase).toBe('finished');
    expect(finished.passed).toBe(6);
    expect(finished.splits.length).toBe(6);
    expect(finished.splits[0]).toBe(0);
    for (let i = 1; i < finished.splits.length; i += 1) {
      expect(finished.splits[i], 'splits must increase along the route')
        .toBeGreaterThan(finished.splits[i - 1]);
    }

    // The results screen waits, so the player sees themselves cross the line
    // rather than a dialog appearing over the moment they earned.
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('challenge');
    expect(finished.resultsIn).toBeGreaterThan(0);

    await page.evaluate(() => window.game.advance(300));
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('results');
    await expect(page.locator('.euc-menu--results')).toBeVisible();

    const panel = page.locator('[data-menu="results-panel"]');
    await expect(panel).toHaveAttribute('data-record', 'true');
    await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New record');
    // The first run has nothing to compare against, and says so rather than
    // inventing a delta.
    await expect(page.locator('[data-menu="results-best"]')).toHaveText('—');

    // The corner clock and the panel's total are produced by the same
    // formatter, so they cannot disagree about the same instant.
    const total = await page.locator('[data-menu="results-total"]').textContent();
    expect(total).toMatch(/^\d+:\d{2}\.\d{2}$/);

    // Four split rows: the start's zero row is deliberately not shown.
    await expect(page.locator('[data-menu="results-rows"] tr')).toHaveCount(5);

    // **And the words over them are this mode's**, which is the half M26 Phase
    // 6's QA pass found missing everywhere else: the caption and the three
    // column headers were markup, so four later modes printed their own rows
    // under a timed run's vocabulary. They are still the right words *here* —
    // these rows really are checkpoints, really are times, and really are
    // measured against a personal best — and this is the card that has to keep
    // saying so while the other four say something different.
    await expect(page.locator('[data-menu="results-table-caption"]')).toHaveText('Splits');
    await expect(page.locator('[data-menu="results-column-label"]')).toHaveText('Checkpoint');
    await expect(page.locator('[data-menu="results-column-value"]')).toHaveText('Time');
    await expect(page.locator('[data-menu="results-column-delta"]')).toHaveText('vs best');
    await expect(page.locator('[data-menu="results-table"]')).toHaveAttribute('data-compare', 'true');
    // And it is a column with room in it, which is what `data-compare` buys:
    // the three cards that compare nothing collapse this to zero.
    const compare = await page.locator('[data-menu="results-column-delta"]').boundingBox();
    expect(compare?.width ?? 0).toBeGreaterThan(40);
    expect(errors).toEqual([]);
  });

  test('the six checkpoints compose into a finishable ride over the LevelPlan route', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    const rides = await page.evaluate((routes) => routes.map((ids) => {
      window.game.clearRecords();
      window.game.startTimeTrial();
      const points = window.qa.routePoints(ids as string[], 3);
      // The generic follower stops once it is within one look-ahead of the
      // final point. The finish sits six metres before that point, so extend
      // the route by one look-ahead to make the driver ride *through* the line
      // rather than stop two metres before it.
      const lastId = ids[ids.length - 1];
      const last = window.game.levelPlan.segments.find((segment) => segment.id === lastId);
      if (last === undefined) throw new Error(`no final segment ${String(lastId)}`);
      points.push({
        x: last.exit.position.x + Math.sin(last.exit.headingY) * 10,
        z: last.exit.position.z + Math.cos(last.exit.headingY) * 10,
      });
      const route = window.qa.followRoute(points, {
        lookAhead: 8,
        maxSteps: 30_000,
        throttle: 0.7,
        maxSpeed: 10,
      });
      return { route, challenge: window.game.snapshot().challenge };
    }), [TIMED_SAFE_ROUTE, TIMED_ALLEY_ROUTE] as const);

    for (const ridden of rides) {
      expect(ridden.route.finished, 'the rider did not reach the end of the course').toBe(true);
      expect(ridden.route.crashes, 'the reference lap should not need a crash/recovery').toBe(0);
      expect(
        ridden.challenge.phase,
        `the route ended at ${ridden.challenge.passed}/${ridden.challenge.total}; `
          + `still seeking ${ridden.challenge.nextLabel} `
          + `(${ridden.challenge.distanceToNext.toFixed(1)} m away)`,
      ).toBe('finished');
      expect(ridden.challenge.passed).toBe(ridden.challenge.total);
    }
    expect(errors).toEqual([]);
  });

  test('a personal best survives a reload and the next run races it', async ({ page }) => {
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    const first = await completeLap(page, list);
    await page.evaluate(() => window.game.advance(300));
    const stored = await page.evaluate(() => window.game.snapshot().record);
    expect(stored.persistent, 'this browser can save; otherwise the test proves nothing').toBe(true);
    expect(stored.totalSeconds).toBeCloseTo(first.elapsed, 5);
    expect(stored.hasGhost, 'a completed run leaves a ghost to race').toBe(true);

    // The whole value of the feature, and the half a player only discovers is
    // broken the next day.
    await bootToTitle(page);
    const reloaded = await page.evaluate(() => window.game.snapshot().record);
    expect(reloaded.totalSeconds).toBeCloseTo(stored.totalSeconds as number, 5);
    expect(reloaded.hasGhost).toBe(true);

    // A second, slower run compares against it and is not kept.
    const list2 = await gates(page);
    const second = await completeLap(page, list2, 90);
    expect(second.elapsed).toBeGreaterThan(stored.totalSeconds as number);
    await page.evaluate(() => window.game.advance(300));
    await expect(page.locator('[data-menu="results-panel"]')).toHaveAttribute('data-record', 'false');
    await expect(page.locator('[data-menu="results-heading"]')).toHaveText('Run complete');
    await expect(page.locator('[data-menu="results-delta"]')).toHaveAttribute('data-ahead', 'false');
    const kept = await page.evaluate(() => window.game.snapshot().record);
    expect(kept.totalSeconds).toBeCloseTo(stored.totalSeconds as number, 5);
  });

  test('pausing a timed run resumes the run, not a free ride', async ({ page }) => {
    await bootToTitle(page);
    const list = await gates(page);
    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    await page.evaluate(() => window.game.advance(180));

    const before = await challenge(page);
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');
    // The clock the player paused to look at is still on screen behind the card.
    await expect(page.locator('.euc-hud')).toBeVisible();

    // **The clock genuinely stops, measured over real wall time.**
    //
    // Not by comparing against a reading taken before the keypress — Escape is
    // latched by the input layer and consumed on the following fixed step, so
    // the loop legitimately runs two or three more steps while the event makes
    // its way through, and asserting exact equality across that boundary tests
    // the automation's timing rather than the pause. Waiting on wall time is
    // normally a flake in this suite; here it is the point, because the claim
    // being made is that *nothing happens*, and the only way to be wrong about
    // that is to let real time pass and find that something did.
    const paused = await challenge(page);
    expect(paused.elapsed).toBeGreaterThanOrEqual(before.elapsed);
    await page.waitForTimeout(300);
    expect((await challenge(page)).elapsed, 'a paused run must not age')
      .toBe(paused.elapsed);

    // A round trip through settings must not change which ride is underneath.
    await page.locator('.euc-menu--pause [data-menu="settings"]').click();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('settings');
    await page.locator('.euc-menu--settings [data-menu="back"]').click();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');

    // **The budget is the wall time actually spent resuming, not a constant.**
    // Once resume lands the rider is riding again, and every millisecond
    // between that click and the reading below is real riding that the run is
    // entitled to charge. A fixed allowance instead measures how quickly this
    // machine can click and read: at four workers it spent 0.15 s and passed,
    // at six it spent 0.22 s and failed a 0.2 s bound while the game behaved
    // identically. Timing the round trip asserts the actual claim — the menus
    // and the settings detour, which took far longer than this, were free.
    const resumeStarted = Date.now();
    await page.locator('.euc-menu--pause [data-menu="resume"]').click();
    expect(await page.evaluate(() => window.game.snapshot().app.state))
      .toBe('challenge');
    const after = await challenge(page);
    const resumeSeconds = (Date.now() - resumeStarted) / 1000;
    expect(after.phase).toBe('running');
    expect(after.passed).toBe(before.passed);
    // The run picks up from where it stopped rather than from where it would
    // have been had the pause menu, the settings panel, and the reading of both
    // all counted against the player's time.
    expect(after.elapsed).toBeGreaterThanOrEqual(paused.elapsed);
    expect(after.elapsed - paused.elapsed, 'time spent in menus is not charged to the run')
      .toBeLessThan(resumeSeconds + 0.1);
  });

  test('the results screen survives a detour through settings while it is pending', async ({ page }) => {
    // The countdown between the finish and the panel used to tick behind any
    // state that simulates — and `settings` does. It expired there, `goTo`
    // refused the move because settings cannot reach results, and `resultsIn`
    // had already been zeroed: a finished run with no results screen, no way
    // to reach one, and the splits gone.
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    await completeLap(page, list, 20);
    expect((await challenge(page)).phase).toBe('finished');

    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');
    await page.locator('.euc-menu--pause [data-menu="settings"]').click();
    // Far longer than `resultsDelaySeconds`, in real time and in steps.
    await page.waitForTimeout(400);
    await page.evaluate(() => window.game.advance(600));
    await page.locator('.euc-menu--settings [data-menu="back"]').click();
    await page.locator('.euc-menu--pause [data-menu="resume"]').click();

    // Back in the run, and the results screen still arrives.
    await page.evaluate(() => window.game.advance(300));
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('results');
    await expect(page.locator('.euc-menu--results')).toBeVisible();
  });

  test('the split table compares against the record that was standing before', async ({ page }) => {
    // On a record run the store already holds the new time by the time the
    // panel is built, so re-reading it compares the lap against itself: every
    // row prints `0.00` and reads as *behind*, under a summary line correctly
    // showing several seconds gained.
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    // A slow first run to set the record, then a clearly faster second one.
    await completeLap(page, list, 120);
    await page.evaluate(() => window.game.advance(300));
    await completeLap(page, list, 20);
    await page.evaluate(() => window.game.advance(300));

    await expect(page.locator('[data-menu="results-panel"]')).toHaveAttribute('data-record', 'true');
    const rows = await page.locator('[data-menu="results-rows"] tr').evaluateAll(
      (list2) => list2.map((row) => ({
        delta: row.querySelector('.euc-results__row-delta')?.textContent ?? '',
        ahead: row.querySelector('.euc-results__row-delta')?.getAttribute('data-ahead') ?? '',
      })),
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.delta, 'a record lap compared against itself prints 0.00').not.toBe('0.00');
      expect(row.delta).toMatch(/^−\d+\.\d{2}$/);
      expect(row.ahead).toBe('true');
    }
  });

  test('a gamepad Back out of a pause resumes the run rather than ending it', async ({ page }) => {
    // Escape and the Resume button both go through `resumeRide()`; the pad's
    // Back was still hard-coded to free ride, so pressing B during a timed run
    // discarded the clock and the ghost with no confirmation.
    // The pad has to exist before boot — `GamepadInput` reports a connection
    // once and the menus change their wording on it — and it has to be pulsed
    // across real animation frames, because the pad is polled in `beforeFrame`
    // and the QA bridge's `advance()` deliberately does not run one.
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
    await bootToTitle(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    const list = await gates(page);
    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    await page.evaluate(() => window.game.advance(120));
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');

    // B, which the input layer maps to a menu Back.
    await page.evaluate(async () => {
      const pad = (window as unknown as { fakePad: {
        buttons: { pressed: boolean; value: number }[];
      } }).fakePad;
      const frame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      pad.buttons[1].pressed = true;
      pad.buttons[1].value = 1;
      await frame();
      pad.buttons[1].pressed = false;
      pad.buttons[1].value = 0;
      await frame();
    });

    await page.waitForFunction(() => window.game.snapshot().app.state === 'challenge');
    const after = await challenge(page);
    expect(after.phase, 'the pad must not throw the run away').toBe('running');
    expect(after.passed).toBe(1);
  });

  test('quick reset restarts the run instead of teleporting near the finish', async ({ page }) => {
    await bootToTitle(page);
    const list = await gates(page);
    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    await crossGate(page, list[1]);
    await page.evaluate(() => window.game.advance(240));
    expect((await challenge(page)).passed).toBe(2);

    // The exploit this closes: the route is a loop back into the plaza, so the
    // a teleport near the finish would otherwise turn restart into a shortcut.
    await page.keyboard.press('KeyR');
    await page.evaluate(() => window.game.advance(4));

    const restarted = await challenge(page);
    expect(restarted.phase).toBe('armed');
    expect(restarted.elapsed).toBe(0);
    expect(restarted.passed).toBe(0);
    expect(restarted.nextIndex).toBe(0);
    expect(restarted.recordedSamples).toBe(0);
    expect(restarted.distanceToNext).toBeCloseTo(CHALLENGE.startRunupMetres, 0);
  });

  test('free ride is untouched: no lane, no gates, and the M9 draw call figure', async ({ page }) => {
    await boot(page);

    const free = await page.evaluate(() => {
      window.game.advance(120);
      const snap = window.game.snapshot();
      return { draws: snap.render.drawCalls, phase: snap.challenge.phase };
    });
    expect(free.phase, 'free ride runs no clock').toBe('idle');
    await expect(page.locator('[data-hud="challenge"]')).toBeHidden();

    // Enter a run, then leave it, and the frame must come back to exactly what
    // it was. A mode that leaks draw calls into free ride is the regression
    // nobody would attribute to this milestone.
    const timed = await page.evaluate(() => {
      window.game.startTimeTrial();
      // Challenge attempts now begin at a short start-line run-up rather than
      // the level spawn. Draw-call comparisons still need the same camera and
      // culling pose on both sides, so put the rider back at the shared sample
      // point before asking what the gate costs.
      window.game.placeRider(window.game.levelPlan.spawn.position, window.game.levelPlan.spawn.headingY);
      window.game.advance(120);
      return window.game.snapshot().render.drawCalls;
    });
    expect(timed, 'the gates cost something while they are shown')
      .toBeGreaterThanOrEqual(free.draws);
    expect(timed, 'the whole frame stays inside the 150-call budget').toBeLessThanOrEqual(150);

    const back = await page.evaluate(() => {
      window.game.setAppState('title');
      window.game.setAppState('freeRide');
      window.game.advance(120);
      return window.game.snapshot().render.drawCalls;
    });
    expect(back).toBe(free.draws);
  });

  test('the challenge lane stays out of the playfield centre', async ({ page }) => {
    // The M9 lane test filters zero-width lanes, so it has never actually
    // measured this one — it was reserved and empty until now. This is that
    // assertion, taken with a run armed and the lane carrying real digits.
    await bootToTitle(page);
    const list = await gates(page);
    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    await page.evaluate(() => window.game.advance(120));

    await expect(page.locator('[data-hud="challenge"]')).toBeVisible();
    const reading = await page.evaluate(() => {
      const hud = document.querySelector('.euc-hud') as HTMLElement;
      const box = hud.getBoundingClientRect();
      const lane = (document.querySelector('[data-hud="challenge"]') as HTMLElement)
        .getBoundingClientRect();
      return {
        lane: { left: lane.left, right: lane.right, top: lane.top, bottom: lane.bottom },
        centre: {
          left: box.width * 0.4,
          right: box.width * 0.6,
          top: box.height * 0.4,
          bottom: box.height * 0.6,
        },
        timer: document.querySelector('[data-hud="timer"]')?.textContent ?? '',
      };
    });

    expect(reading.timer).toMatch(/^\d+:\d{2}\.\d{2}$/);
    const overlaps = reading.lane.right > reading.centre.left
      && reading.lane.left < reading.centre.right
      && reading.lane.bottom > reading.centre.top
      && reading.lane.top < reading.centre.bottom;
    expect(overlaps, 'the challenge lane covers the playfield centre').toBe(false);
  });

  test('the objective and timer remain distinct in a narrow portrait viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootToTitle(page);
    await page.evaluate(() => {
      window.game.startTimeTrial();
      window.game.advance(1);
    });

    const reading = await page.evaluate(() => {
      const objective = (document.querySelector('[data-hud="objective"]') as HTMLElement)
        .getBoundingClientRect();
      const timer = (document.querySelector('[data-hud="timer"]') as HTMLElement)
        .getBoundingClientRect();
      return {
        objective: {
          left: objective.left,
          right: objective.right,
          top: objective.top,
          bottom: objective.bottom,
        },
        timer: {
          left: timer.left,
          right: timer.right,
          top: timer.top,
          bottom: timer.bottom,
        },
        viewport: { width: innerWidth, height: innerHeight },
      };
    });

    const overlaps = reading.objective.right > reading.timer.left
      && reading.objective.left < reading.timer.right
      && reading.objective.bottom > reading.timer.top
      && reading.objective.top < reading.timer.bottom;
    expect(overlaps, 'the longer checkpoint objective overlaps the run clock').toBe(false);
    expect(reading.objective.left).toBeGreaterThanOrEqual(0);
    expect(reading.objective.right).toBeLessThanOrEqual(reading.viewport.width);
    expect(reading.timer.right).toBeLessThanOrEqual(reading.viewport.width);
  });

  test('a split appears on crossing and clears itself', async ({ page }) => {
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    await page.evaluate(() => window.game.advance(120));
    await crossGate(page, list[1]);
    // One frame past the crossing, so the render pass has written the DOM.
    await page.evaluate(() => window.game.advance(2));

    const splits = page.locator('[data-hud="splits"]');
    await expect(splits).toBeVisible();
    await expect(page.locator('[data-hud="split-label"]')).toHaveText(list[1].label);
    // A first run has no record leg to be behind, so the lane says so.
    await expect(page.locator('[data-hud="split-delta"]')).toHaveText('Best');

    // It clears on the simulation clock, so it is gone before the next corner
    // needs the player's eyes. `splitHoldSeconds` is 2.6.
    await page.evaluate(() => window.game.advance(360));
    await expect(splits).toBeHidden();
  });

  test('the ghost rides only while a recorded run is being raced', async ({ page }) => {
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    await completeLap(page, list);
    await page.evaluate(() => window.game.advance(300));
    expect((await page.evaluate(() => window.game.snapshot().record)).hasGhost).toBe(true);

    const baseline = await page.evaluate(() => {
      window.game.setAppState('title');
      window.game.advance(60);
      return window.game.snapshot().render.drawCalls;
    });

    // Second attempt: the ghost is loaded and rides the recorded line.
    await page.evaluate(() => window.game.startTimeTrial());
    await crossGate(page, list[0]);
    const withGhost = await page.evaluate(() => {
      window.game.advance(120);
      return window.game.snapshot().render.drawCalls;
    });
    expect(withGhost, 'a second rider is on screen').toBeGreaterThan(baseline);
    expect(withGhost, 'and the budget still holds with both riders and the gates')
      .toBeLessThanOrEqual(150);
  });

  test('resources plateau across repeated runs', async ({ page }) => {
    // Invariant 10. A run allocates a ghost track, a results view, and six
    // gate flares, and does it again on every retry — this is the mode most
    // likely to leak, and the leak would only show after a player's tenth
    // attempt at a corner.
    await bootToTitle(page);
    await page.evaluate(() => window.game.clearRecords());
    const list = await gates(page);

    const counts: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      await completeLap(page, list, 20);
      await page.evaluate(() => window.game.advance(300));
      counts.push(await page.evaluate(() => {
        window.game.setAppState('title');
        window.game.advance(30);
        const res = window.game.snapshot().resources;
        return res.geometries + res.textures + res.sceneObjects;
      }));
    }

    // The first round may legitimately build the ghost's rig and the gates for
    // the first time. Everything after it must be flat.
    expect(counts[3]).toBe(counts[1]);
    expect(counts[2]).toBe(counts[1]);
  });
});
