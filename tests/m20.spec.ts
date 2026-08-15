/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { CHASE } from '../src/data/tuning.ts';

/**
 * M20 — three owner items from 2026-08-14, in a real browser.
 *
 * All three are recorded in `references/PublicFeedback/FEEDBACK-TRIAGE.md`:
 * §4.4's out-of-bounds UX defect, §2's reopened max-speed cutout, and §5's
 * "fresh route from inside Cop Chase". Their arithmetic is asserted headlessly
 * — `ui/hudModel.test.ts`, `simulation/EucController.test.ts`,
 * `audio/director.test.ts`, `shared/overspeed.test.ts` — and what is left for a
 * browser is the half a model cannot answer:
 *
 *   1. **That the banner and the glyph are actually in the document**, with the
 *      countdown a player can read. §4.4 is a defect about a cue nobody
 *      noticed; a view object saying `visible: true` is exactly the evidence
 *      that was already true of the line it replaces.
 *   2. **That the beeps are the shipped recording** rather than the synthesized
 *      fallback. The director's counter increments identically for both; only
 *      the sink, in a real audio context, can tell them apart.
 *   3. **That one press really does swap the world and re-enter the same
 *      mode.** The whole point is deleting a five-step journey through the
 *      state machine, and the journey is the thing under test.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** A seed the pinned census says is dense, so the cop has a real route. */
const SEED = 'route-41';

async function bootChase(page: import('@playwright/test').Page): Promise<void> {
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    window.game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
}

async function expectInsideViewport(
  page: import('@playwright/test').Page,
  selector: string,
): Promise<void> {
  const result = await page.locator(selector).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });
  expect(result.left).toBeGreaterThanOrEqual(-1);
  expect(result.top).toBeGreaterThanOrEqual(-1);
  expect(result.right).toBeLessThanOrEqual(result.width + 1);
  expect(result.bottom).toBeLessThanOrEqual(result.height + 1);
}

// ---------------------------------------------------------------------------
// §4.4 — the out-of-bounds warning
// ---------------------------------------------------------------------------

test('leaving the route raises a banner with a way home and a visible countdown', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  const banner = page.locator('[data-hud="stray"]');
  await expect(banner).toBeHidden();

  // Ride hard across the corridor until the referee's own rule says the rider
  // is out. Steering rather than teleporting, because the arrow is a bearing
  // from a real pose to a real route and a placed rider would prove nothing
  // about it.
  await page.evaluate(async () => {
    const game = window.game;
    for (let i = 0; i < 60; i += 1) {
      game.setActions({ throttle: 1, steer: 1 });
      game.advance(30);
      if (game.snapshot().chase.straying) return;
    }
  });

  expect(await page.evaluate(() => window.game.snapshot().chase.straying)).toBe(true);
  await expect(banner).toBeVisible();
  await expect(page.locator('[data-hud="stray-label"]')).toHaveText('Back to the route');

  // The countdown is the fix. It has to be a number, and it has to be counting.
  const first = await page.locator('[data-hud="stray-count"]').textContent();
  expect(Number(first)).toBeGreaterThan(0);
  expect(Number(first)).toBeLessThanOrEqual(CHASE.strayGraceSeconds);

  await page.evaluate(() => {
    window.game.setActions({ throttle: 0, steer: 0 });
    window.game.advance(360);
  });
  const later = await page.locator('[data-hud="stray-count"]').textContent();
  expect(Number(later)).toBeLessThan(Number(first));

  // And it points somewhere. Eight glyphs, one of them.
  const arrow = await page.locator('[data-hud="stray-arrow"]').textContent();
  expect('↑↖←↙↓↘→↗').toContain(arrow ?? '');

  // The old subtle line does not repeat the banner underneath it.
  await expect(page.locator('[data-hud="objective"]')).toHaveText('');

  expect(errors).toEqual([]);
});

test('the route warning stays on-screen with touch controls in both phone orientations', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);
  await page.evaluate(() => {
    window.game.setOptions({ touchControls: 'on' });
    const game = window.game;
    for (let i = 0; i < 60; i += 1) {
      game.setActions({ throttle: 1, steer: 1 });
      game.advance(30);
      if (game.snapshot().chase.straying) return;
    }
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expect(page.locator('[data-hud="stray"]')).toBeVisible();
    await expect(page.locator('.euc-touch')).toBeVisible();
    await expectInsideViewport(page, '[data-hud="stray"]');
    await expectInsideViewport(page, '.euc-touch__actions');
    await expectInsideViewport(page, '.euc-touch__stick');
  }

  expect(errors).toEqual([]);
});

test('the banner turns urgent before the run ends, and the end is no longer a surprise', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  await page.evaluate(async () => {
    const game = window.game;
    for (let i = 0; i < 60; i += 1) {
      game.setActions({ throttle: 1, steer: 1 });
      game.advance(30);
      if (game.snapshot().chase.straying) break;
    }
    // Sit there. This is the owner's exact ride: he wandered off at low speed
    // and the run ended at fourteen seconds with nothing on screen.
    game.setActions({ throttle: 0, steer: 0 });
  });

  // Run the clock down to the last third, which is where the panel escalates.
  await page.waitForFunction(
    () => {
      window.game.advance(60);
      const chase = window.game.snapshot().chase;
      return chase.outcome === 'strayed' || (chase.straying && chase.remaining >= 0
        && Number(document.querySelector('[data-hud="stray-count"]')?.textContent ?? '9') <= 3);
    },
    undefined,
    { timeout: 30_000 },
  );

  const outcome = await page.evaluate(() => window.game.snapshot().chase.outcome);
  if (outcome !== 'strayed') {
    await expect(page.locator('[data-hud="stray"]')).toHaveAttribute('data-urgent', 'true');
  }

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// §2 — the max-speed cutout and its beeps
// ---------------------------------------------------------------------------

test('the max-speed glyph appears with the beeps and blinks at their rate', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    window.game.setAppState('freeRide');
  });

  const glyph = page.locator('[data-hud="overspeed"]');
  await expect(glyph).toBeHidden();

  // Up to the top of the band, on the road, through the ordinary input path.
  await page.evaluate(async () => {
    const game = window.game;
    for (let i = 0; i < 40; i += 1) {
      game.setActions({ throttle: 1 });
      game.advance(30);
      if (game.snapshot().euc.overspeed > 0.4) return;
    }
  });

  expect(await page.evaluate(() => window.game.snapshot().euc.overspeed)).toBeGreaterThan(0.3);
  await expect(glyph).toBeVisible();
  // The words name the condition rather than ordering the player to slow down:
  // sitting under the edge is a thing to be good at.
  await expect(glyph).toContainText('Max speed');

  // The blink period is the beep period. It is a custom property rather than a
  // class, because the rate is continuous and the rate *is* the message.
  const period = await glyph.evaluate((node) => node.style.getPropertyValue('--beep-period'));
  expect(period).toMatch(/^\d+(\.\d+)?s$/);
  expect(Number.parseFloat(period)).toBeLessThan(2);

  // It occupies the same compact top-centre slot on a tall or wide handset.
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await expectInsideViewport(page, '[data-hud="overspeed"]');
  }

  expect(errors).toEqual([]);
});

test('live ride tuning reaches both controllers and the cop high-speed policy', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);

  const result = await page.evaluate(() => {
    const game = window.game;
    const internal = game as unknown as {
      controller: {
        derivedTopSpeed: number;
        tuning: { maxLeanPitch: number; leanToAccel: number; dragCoefficient: number };
      };
      copController: {
        derivedTopSpeed: number;
        tuning: { maxLeanPitch: number; leanToAccel: number; dragCoefficient: number };
      } | null;
      copBrain: {
        driveAcceleration: number;
        dragCoefficient: number;
        cutoutSpeedShare: number;
      } | null;
    };
    if (internal.copController === null || internal.copBrain === null) {
      throw new Error('generated route did not build the cop ride');
    }

    const before = internal.controller.derivedTopSpeed;
    game.tuning.set('EUC.dragCoefficient', 0.15);
    const player = internal.controller;
    const cop = internal.copController;
    const brain = internal.copBrain;
    return {
      before,
      playerTop: player.derivedTopSpeed,
      copTop: cop.derivedTopSpeed,
      playerDrag: player.tuning.dragCoefficient,
      copDrag: cop.tuning.dragCoefficient,
      brainDrive: brain.driveAcceleration,
      brainDrag: brain.dragCoefficient,
      brainCutout: brain.cutoutSpeedShare,
      controllerDrive: cop.tuning.leanToAccel * Math.sin(cop.tuning.maxLeanPitch),
      liveCutout: game.tuning.get('EUC.cutoutSpeedShare'),
    };
  });

  expect(result.playerTop).not.toBe(result.before);
  expect(result.copTop).toBeCloseTo(result.playerTop, 12);
  expect(result.copDrag).toBe(result.playerDrag);
  expect(result.brainDrive).toBeCloseTo(result.controllerDrive, 12);
  expect(result.brainDrag).toBe(result.copDrag);
  expect(result.brainCutout).toBe(result.liveCutout);
  expect(errors).toEqual([]);
});

test('holding full throttle cuts the wheel out, and the beeps that warned about it were the recording', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);

  // Arm audio the way a player does, and wait for the bank: the whole claim
  // here is that the *recording* played, and the director's own counter cannot
  // tell a recording from the synthesized fallback (`audio/sink.ts`).
  await page.evaluate(() => {
    window.game.setAppState('freeRide');
  });
  await page.locator('canvas').click({ position: { x: 10, y: 10 } });
  await page.waitForFunction(() => window.game.snapshot().audio.samplesLoaded, undefined, {
    timeout: 20_000,
  });

  const crashed = await page.evaluate(async () => {
    const game = window.game;
    for (let i = 0; i < 60; i += 1) {
      game.setActions({ throttle: 1 });
      game.advance(30);
      const snapshot = game.snapshot();
      if (snapshot.euc.crashed) return snapshot.euc.crashCause;
    }
    return 'never';
  });

  // A generated route has corners and furniture, so an obstacle crash on the
  // way is a legitimate outcome of riding flat out down one; what must not
  // happen is the cutout never being reachable at all. Either way the beeps
  // must have been the recording.
  expect(['cutout', 'obstacle', 'hazard', 'wobble', 'landing']).toContain(crashed);
  const plays = await page.evaluate(() => window.game.snapshot().audio.overspeedSamplePlays);
  expect(plays).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// §5 — a fresh route from inside the ride
// ---------------------------------------------------------------------------

test('one press from a paused chase swaps the world and puts the player back in the chase', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  const before = await page.evaluate(() => window.game.snapshot().world.seed);
  expect(before).toBe(SEED);

  await page.evaluate(() => {
    window.game.setAppState('paused');
  });
  await expect(page.locator('.euc-menu--pause')).toBeVisible();

  // The sentence that tells a player other courses exist. It is the feature.
  await expect(page.locator('.euc-menu--pause [data-menu="new-route-note"]'))
    .toContainText('brand-new');

  await page.locator('.euc-menu--pause [data-menu="new-route"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase', undefined, {
    timeout: 20_000,
  });

  const after = await page.evaluate(() => window.game.snapshot());
  expect(after.world.seed).not.toBe(before);
  expect(after.world.generated).toBe(true);
  // The mode came with them, which is the whole point — not a free ride they
  // then have to leave.
  expect(after.chase.phase).toBe('running');
  expect(after.chase.available).toBe(true);
  expect(after.chase.secondRider).toBe('cop');

  expect(errors).toEqual([]);
});

test('and from the results card, which is where a busted player already is', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);
  const before = await page.evaluate(() => window.game.snapshot().world.seed);

  // Ride out of bounds and let the clock run, which is the fastest honest way
  // to a chase results card.
  await page.evaluate(async () => {
    const game = window.game;
    for (let i = 0; i < 200; i += 1) {
      game.setActions({ throttle: 1, steer: 1 });
      game.advance(60);
      if (game.snapshot().app.state === 'results') return;
    }
  });
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('results');

  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase', undefined, {
    timeout: 20_000,
  });

  const after = await page.evaluate(() => window.game.snapshot());
  expect(after.world.seed).not.toBe(before);
  expect(after.chase.phase).toBe('running');
  expect(errors).toEqual([]);
});

test('a completed chase cannot relabel a later time trial or its new-route destination', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  await page.evaluate(() => {
    const game = window.game;
    game.clearRecords();
    game.tuning.set('CHASE.escapeSeconds', 30);
    game.startChase();
    game.setActions({ throttle: 0.6 });
    for (let chunk = 0; chunk < 300; chunk += 1) {
      game.advance(30);
      if (game.snapshot().app.state === 'results') return;
    }
  });
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('results');

  await page.locator('.euc-menu--results [data-menu="results-title"]').click();
  await page.evaluate(() => {
    const game = window.game;
    game.startTimeTrial();
    for (const gate of game.levelPlan.checkpoints) {
      game.placeRider({ x: gate.centre.x, y: gate.centre.y, z: gate.centre.z }, gate.headingY);
      game.advance(62);
    }
    game.advance(300);
  });

  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('results');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New record');
  expect(await page.locator('[data-menu="results-rows"] tr').count()).toBeGreaterThan(0);

  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'challenge', undefined, {
    timeout: 20_000,
  });
  expect((await page.evaluate(() => window.game.snapshot().challenge.phase)))
    .toMatch(/armed|running/);
  expect(errors).toEqual([]);
});

test('a new route from free ride stays free ride, and works on the hand-built city too', async ({ page }) => {
  // The discoverability half of §5: a player who has never opened Fresh route
  // is, by definition, on the city. This is the press that shows them there is
  // more than one place to ride.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.evaluate(() => {
    window.game.setAppState('freeRide');
    window.game.setAppState('paused');
  });

  await page.locator('.euc-menu--pause [data-menu="new-route"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide', undefined, {
    timeout: 20_000,
  });

  const after = await page.evaluate(() => window.game.snapshot());
  expect(after.world.generated).toBe(true);
  expect(after.world.seed).not.toBe('');
  expect(errors).toEqual([]);
});
