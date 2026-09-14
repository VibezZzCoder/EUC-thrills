/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { recordTrickShuttle } from '../src/bench/trickShuttle.ts';
import { replayTrickRun } from '../src/bench/trickRunBench.ts';

/** Point the same regressions at the exact exported Pages subpath. */
async function bootReview(page: Page): Promise<void> {
  if (!process.env.M38_REVIEW_URL) return bootToTitle(page, 'level=switchback');
  const url = new URL(process.env.M38_REVIEW_URL);
  url.searchParams.set('level', 'switchback');
  await page.goto(url.href);
  await page.waitForFunction(() => typeof window.game === 'object'
    && window.game.snapshot().loop.frames > 0, undefined, { timeout: 90_000 });
  await expect(page.locator('#boot-error')).toBeHidden();
  await expect(page.locator('#boot')).toBeHidden();
}

for (const boundary of ['takeoff', 'touchdown'] as const) {
  test(`M38 review: pausing on ${boundary} preserves the completed physics step`, async ({ page }) => {
    const errors = collectErrors(page);
    await bootReview(page);
    await page.locator('.euc-menu--title [data-menu="trick-run"]').click();
    const result = await page.evaluate((edge) => {
      const game = window.game;
      const ride = (pauseAt: number) => {
        game.startTrickRun();
        game.loop.setRunning(false);
        const zone = game.levelPlan.trickZones!.find((entry) => entry.id === 'ledge')!;
        const x = zone.corners.reduce((sum, corner) => sum + corner.x, 0) / zone.corners.length;
        const z = zone.corners.reduce((sum, corner) => sum + corner.z, 0) / zone.corners.length;
        game.placeRider({ x, y: game.sampleGround(x, z).height, z }, 0);
        game.advance(1);
        let held = false;
        let spun = false;
        let launch = -1;
        let landing = -1;
        let paused = false;
        for (let step = 0; step < 240; step += 1) {
          const controller = game.controller;
          const hop = step === 0;
          const spin = !controller.snapshot().grounded && !spun && controller.canAcceptSpin;
          if (hop) held = true;
          if (spin) spun = true;
          game.setActionsFor(0, { throttle: 0, steer: spin ? -1 : 0,
            hop: hop || spin, hopHeld: held && !spin, pause: step === pauseAt });
          game.advance(1);
          if (controller.tookOff) launch = step;
          if (controller.touchedDown) landing = step;
          if (game.appState.current === 'paused') {
            paused = true;
            game.appState.resumeRide();
            game.loop.setRunning(false);
          }
        }
        return { launch, landing, paused, score: game.trickRun.book(0)!.score,
          elapsed: game.trickRun.state.elapsedSteps };
      };
      const control = ride(-1);
      const candidate = ride(edge === 'takeoff' ? control.launch : control.landing);
      return { control, candidate };
    }, boundary);
    expect(result.control.score).toBe(448);
    expect(result.control.launch).toBeGreaterThan(0);
    expect(result.control.landing).toBeGreaterThan(result.control.launch);
    expect(result.candidate.paused).toBe(true);
    expect(result.candidate.score).toBe(result.control.score);
    expect(result.candidate.elapsed).toBe(result.control.elapsed);
    expect(errors).toEqual([]);
  });
}

test('M38 review: a paused flight stays frozen inside Settings', async ({ page }) => {
  const errors = collectErrors(page);
  await bootReview(page);
  await page.locator('.euc-menu--title [data-menu="trick-run"]').click();
  const evidence = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 0, hop: true, hopHeld: true });
    for (let step = 0; step < 60 && !game.controller.tookOff; step += 1) game.advance(1);
    const airborne = !game.controller.snapshot().grounded;
    game.appState.goTo('paused');
    game.appState.goTo('settings');
    game.loop.setRunning(false);
    const before = game.controller.snapshot();
    const clock = game.trickRun.state.elapsedSteps;
    game.advance(300);
    return { airborne, before, after: game.controller.snapshot(), clock,
      afterClock: game.trickRun.state.elapsedSteps };
  });
  expect(evidence.airborne).toBe(true);
  expect(evidence.afterClock).toBe(evidence.clock);
  expect(evidence.after).toEqual(evidence.before);
  expect(errors).toEqual([]);
});

test('M38 review: the deadline wins a pause on the final physics step', async ({ page }) => {
  await bootReview(page);
  const result = await page.evaluate(() => {
    const game = window.game;
    game.startTrickRun();
    game.loop.setRunning(false);
    game.advance(game.trickRun.durationSteps - 1);
    game.setActionsFor(0, { pause: true });
    game.advance(1);
    return { state: game.appState.current, run: game.trickRun.result() };
  });
  expect(result.state).toBe('results');
  expect(result.run?.completed).toBe(true);
  expect(result.run?.elapsedSteps).toBe(result.run?.durationSteps);
});

test('M38 review: a guest pauses every airborne seat through Settings', async ({ page }) => {
  const errors = collectErrors(page);
  await bootReview(page);
  const evidence = await page.evaluate(() => {
    const game = window.game;
    while (game.seatCount < 4) game.spawnRider();
    game.startTrickRun();
    game.loop.setRunning(false);
    for (let seat = 0; seat < 4; seat += 1) game.setActionsFor(seat, { hop: true, hopHeld: true });
    game.advance(30);
    game.setActionsFor(3, { pause: true });
    game.advance(1);
    const paused = game.appState.current;
    game.appState.goTo('settings');
    game.loop.setRunning(false);
    const before = Array.from({ length: 4 }, (_, seat) => game.snapshotFor(seat).euc);
    const clock = game.trickRun.state.elapsedSteps;
    game.advance(600);
    const after = Array.from({ length: 4 }, (_, seat) => game.snapshotFor(seat).euc);
    const afterClock = game.trickRun.state.elapsedSteps;
    game.appState.exitSettings();
    game.appState.resumeRide();
    game.loop.setRunning(false);
    game.advance(180);
    return { paused, before, after, clock, afterClock,
      books: game.trickRun.state.books, stored: game.trickRecords.best(game.levelPlan.id) };
  });
  expect(evidence.paused).toBe('paused');
  expect(evidence.before.every((rider) => !rider.grounded)).toBe(true);
  expect(evidence.after).toEqual(evidence.before);
  expect(evidence.afterClock).toBe(evidence.clock);
  expect(evidence.books.map((book) => book.score)).toEqual([10, 10, 10, 10]);
  expect(evidence.stored).toBeNull();
  expect(errors).toEqual([]);
});

test('M38 review: q191 is a continuous eligible ride from the normal start', async ({ page }) => {
  const errors = collectErrors(page);
  const trace = recordTrickShuttle();
  const expected = replayTrickRun([trace.recording]);
  await bootReview(page);
  const result = await page.evaluate((actions) => {
    const game = window.game;
    game.startTrickRun();
    game.loop.setRunning(false);
    for (let step = 0; step < actions.length;) {
      const action = actions[step];
      let count = 1;
      // Batch only identical held inputs with no press, preserving every tick.
      if (!action.hop) {
        while (step + count < actions.length && !actions[step + count].hop
          && actions[step + count].throttle === action.throttle
          && actions[step + count].steer === action.steer
          && actions[step + count].hopHeld === action.hopHeld) count += 1;
      }
      game.setActionsFor(0, action);
      game.advance(count);
      step += count;
    }
    const snap = game.snapshot();
    return { state: snap.app.state, run: snap.trickRun,
      distance: snap.euc.distanceTravelled,
      stored: game.trickRecords.best(game.levelPlan.id)?.score };
  }, trace.actions);
  expect(result.state).toBe('results');
  expect(result.run.eligible).toBe(true);
  expect(result.run.completed).toBe(true);
  expect(result.run.seats[0].crashes).toBe(0);
  expect(result.run.seats[0].score).toBe(expected.scores[0]);
  expect(result.distance).toBeCloseTo(trace.distance, 6);
  expect(result.stored).toBe(expected.scores[0]);
  // A known balance weakness, deliberately pinned rather than called a pass
  // for balance. The route includes the 29-second approach and every turn.
  expect(expected.scores[0]).toBe(1782);
  await bootReview(page);
  expect(await page.evaluate(() => window.game.trickRecords.best(window.game.levelPlan.id)?.score)).toBe(1782);
  expect(errors).toEqual([]);
});
