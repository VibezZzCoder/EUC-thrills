/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './harness.ts';
import { LIVE_TUNABLES, SIMULATION } from '../src/data/tuning.ts';

/**
 * M1 — loop, input, QA bridge, diagnostics.
 *
 * The milestone's exit question is *can I see the simulation's state and
 * change a constant without a rebuild?* Everything below either proves a piece
 * of the machinery that answers it, or proves one of the properties the
 * headless suite cannot reach because it crosses the renderer or the event
 * layer.
 *
 * Nothing here asserts a frame time. See `playwright.config.ts`.
 */

test('boots to a running fixed-step loop with an empty console', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  await expect(page.locator('#boot')).toBeHidden();

  const snapshot = await page.evaluate(() => window.qa.snap());
  expect(snapshot.loop.running).toBe(true);
  expect(snapshot.loop.frames).toBeGreaterThan(0);
  expect(snapshot.tick).toBeGreaterThan(0);
  expect(snapshot.render.drawCalls).toBeGreaterThan(0);
  expect(snapshot.viewport.width).toBeGreaterThan(0);
  expect(snapshot.viewport.height).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('the first animation frame arrived, so the loop stayed on requestAnimationFrame', async ({ page }) => {
  await boot(page);

  const loop = await page.evaluate(() => window.qa.snap().loop);
  // The timer fallback exists for a browser that exposes requestAnimationFrame
  // and never calls back. A real browser taking it would mean the probe window
  // is too tight, and every timing figure taken afterwards would be worthless.
  expect(loop.timerFallback).toBe(false);
  expect(loop.mode).toBe('raf');
  expect(loop.firstFrameMs).not.toBeNull();
  expect(loop.firstFrameMs!).toBeLessThan(SIMULATION.firstFrameProbeMs);
});

test('advance runs exactly the steps it is asked for, through the real update path', async ({ page }) => {
  await boot(page);

  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot();
    game.advance(240);
    const after = game.snapshot();
    return { before, after };
  });

  expect(result.after.tick - result.before.tick).toBe(240);
  expect(result.after.simTimeSeconds - result.before.simTimeSeconds)
    .toBeCloseTo(240 / SIMULATION.hz, 6);
});

test('freezing stops simulation while rendering continues', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => window.qa.freeze());
  const frozen = await page.evaluate(() => window.qa.snap());

  // Rendering has to keep going while frozen — that is what makes a transient
  // capturable at all. Waiting on frames is safe here because it is the thing
  // being asserted, not a proxy for simulation progress.
  await page.waitForFunction(
    (baseline) => window.game.snapshot().loop.frames > baseline + 3,
    frozen.loop.frames,
  );

  const after = await page.evaluate(() => window.qa.snap());
  expect(after.tick).toBe(frozen.tick);
  expect(after.loop.frames).toBeGreaterThan(frozen.loop.frames);
});

test('rendering interpolates between the two most recent simulation states', async ({ page }) => {
  await boot(page);

  const trace = await page.evaluate(() => window.qa.interpolationTrace(24));

  expect(trace.alphas.length).toBe(24);
  for (const alpha of trace.alphas) {
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
  }
  // If alpha were always zero the loop would be running one step per frame and
  // the interpolation would be decorative. A display cadence and a 120 Hz step
  // rate essentially never divide evenly.
  expect(trace.alphas.some((alpha) => alpha > 0)).toBe(true);

  // Distance ridden is accumulated in fixed steps, not from wall time, so it
  // must advance monotonically while the throttle is held. This was the
  // placeholder orbit at M1; the orbit is no longer what the loop is stepping.
  expect(trace.ridden[trace.ridden.length - 1]).toBeGreaterThan(trace.ridden[0]);
});

test('a real key press reaches the simulation as a semantic action', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.freeze());

  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.game.advance(1));
  expect((await page.evaluate(() => window.qa.snap())).actions.throttle).toBe(1);

  await page.keyboard.down('KeyD');
  await page.evaluate(() => window.game.advance(1));
  expect((await page.evaluate(() => window.qa.snap())).actions.steer).toBe(1);

  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await page.evaluate(() => window.game.advance(1));
  const released = await page.evaluate(() => window.qa.snap());
  expect(released.actions.throttle).toBe(0);
  expect(released.actions.steer).toBe(0);
});

test('losing focus clears held input', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.freeze());

  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.game.advance(1));
  expect((await page.evaluate(() => window.qa.snap())).actions.throttle).toBe(1);

  // A key held when focus leaves never delivers its keyup, so without the
  // reset contract the rider comes back from a tab switch at full throttle.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.game.advance(1));
  expect((await page.evaluate(() => window.qa.snap())).actions.throttle).toBe(0);

  await page.keyboard.up('KeyW');
});

test('a layout change clears held input, so a resize cannot keep accelerating the rider', async ({ page }) => {
  // The other half of the input reset contract (master starter 8.2): "any
  // resize that actually changed the layout" is listed alongside blur, and the
  // M10 QA pass showed why — a throttle held through an orientation-sized
  // change kept accelerating a rider whose framing had just been yanked out
  // from under them. A key still physically down re-expresses itself on its
  // next auto-repeat, so the player loses nothing.
  await boot(page);

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.game.snapshot().actions.throttle === 1);
  // Genuinely under way, so the deceleration below is unmistakable rather
  // than a fraction of the lean settling back to neutral.
  await page.waitForFunction(() => window.game.snapshot().euc.speed > 2);
  const before = await page.evaluate(() => ({
    layoutChanges: window.game.snapshot().layoutChanges,
  }));

  await page.setViewportSize({ width: 700, height: 700 });
  await page.waitForFunction(
    (n) => window.game.snapshot().layoutChanges > n,
    before.layoutChanges,
  );
  await page.waitForFunction(() => window.game.snapshot().actions.throttle === 0);

  // And the ride agrees. The wheel keeps a moment of its forward lean, so the
  // honest claim is not "speed never rises again" — it is that with nothing
  // held the ride can only coast down, where the held throttle kept it
  // climbing through the QA reproduction.
  const speedAtClear = await page.evaluate(() => window.game.snapshot().euc.speed);
  await page.waitForFunction(
    (s) => window.game.snapshot().euc.speed < s * 0.8,
    speedAtClear,
    { timeout: 10_000 },
  );

  await page.keyboard.up('KeyW');
});

test('a one-shot press is claimed exactly once, from the keyboard', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.freeze());

  const before = await page.evaluate(() => window.qa.snap().consumed.hop);
  await page.keyboard.press('Space');
  await page.evaluate(() => window.game.advance(1));
  const after = await page.evaluate(() => window.qa.snap().consumed.hop);
  // Two hundred and forty further steps is two seconds, far past the buffer.
  await page.evaluate(() => window.game.advance(240));
  const later = await page.evaluate(() => window.qa.snap().consumed.hop);

  expect(after).toBe(before + 1);
  expect(later).toBe(after);
});

test('the bridge sets semantic actions directly, and quick reset acts on the view', async ({ page }) => {
  await boot(page);

  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActions({ throttle: -1, steer: 0.5, crouch: true });
    game.advance(60);
    const held = game.snapshot();

    const fired = window.qa.fireOnce('reset', 1);
    const afterReset = game.snapshot();
    return { held, fired, afterReset };
  });

  expect(result.held.actions.throttle).toBe(-1);
  expect(result.held.actions.steer).toBe(0.5);
  expect(result.held.actions.crouch).toBe(true);

  expect(result.fired.after).toBe(result.fired.before + 1);
  expect(result.fired.afterMoreSteps).toBe(result.fired.after);
});

test('a tuning constant changes the running game without a rebuild', async ({ page }) => {
  await boot(page);

  const changed = await page.evaluate(() => {
    window.qa.resetRide();
    window.game.tuning.set('LIGHTING.exposure', 1.6);
    window.game.tuning.set('CAMERA.fovAtRest', 1.4);
    // **M3 correction.** Exposure is still pushed straight into the renderer,
    // but the field of view is not: from M3 the chase camera eases it every
    // frame, so a value written at tuning-change time would be overwritten
    // before it was ever drawn. The claim this spec makes is unchanged — the
    // number reaches the running game — so it is now read after the camera has
    // had time to move, from a stationary rider whose target is exactly the
    // resting value that was just changed.
    window.game.advance(120 * 5);
    return window.game.snapshot().tuning;
  });

  // The assertion is against what the renderer actually holds, not against
  // what the store was told — a panel that moves a number nothing consults is
  // worse than no panel.
  expect(changed.exposure).toBeCloseTo(1.6, 6);
  // Within a twentieth of a degree: the camera's follower is exponential, so
  // it arrives asymptotically rather than landing exactly.
  expect(changed.fieldOfView).toBeCloseTo((1.4 * 180) / Math.PI, 1);
  expect(changed.overrideCount).toBe(2);

  const reverted = await page.evaluate(() => {
    window.game.tuning.reset();
    return window.game.snapshot().tuning;
  });

  expect(reverted.overrideCount).toBe(0);
  expect(reverted.exposure).toBeCloseTo(1.0, 6);
});

test('the debug overlay reports the authoritative state, and only while open', async ({ page }) => {
  await boot(page);

  await expect(page.locator('#euc-debug-overlay')).toHaveCount(0);

  const state = await page.evaluate(() => {
    const game = window.game;
    game.setOverlayVisible(true);
    game.loop.setRunning(false);
    game.advance(120);
    return game.snapshot();
  });

  const overlay = page.locator('#euc-debug-overlay');
  await expect(overlay).toBeVisible();

  // The overlay must contain the value it names. Reaching the right state and
  // taking a picture is not evidence that the picture shows it.
  const tickText = await overlay.locator('[data-field="tick"]').textContent();
  expect(tickText?.replace(/[^\d]/g, '')).toBe(String(state.tick));
  await expect(overlay.locator('[data-field="state"]')).toHaveText('FROZEN');
  await expect(overlay.locator('[data-field="scheduler"]')).toContainText('raf');

  // Synthetic frames are counted, and named as excluded from the timing window.
  await expect(overlay.locator('[data-field="window"]')).toContainText('synthetic excluded');

  await page.evaluate(() => window.game.setOverlayVisible(false));
  await expect(overlay).toBeHidden();
});

test('the tuning panel is generated from the registry and reverts exactly', async ({ page }) => {
  await boot(page, 'panel=1');

  const panel = page.locator('#euc-tuning-panel');
  await expect(panel).toBeVisible();
  // Generated from LIVE_TUNABLES, so there is no second list to drift.
  await expect(panel.locator('.euc-tunable')).toHaveCount(LIVE_TUNABLES.length);

  const row = panel.locator('.euc-tunable[data-path="LIGHTING.exposure"]');
  await expect(row.locator('output')).toHaveText('1 ×');
  await row.locator('input[type="range"]').evaluate((element) => {
    const slider = element as HTMLInputElement;
    slider.value = '1.5';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(row).toHaveClass(/is-overridden/);
  await expect(row.locator('output')).toHaveText('1.5 ×');
  expect(await page.evaluate(() => window.game.snapshot().tuning.exposure)).toBeCloseTo(1.5, 6);

  await row.locator('.euc-revert').click();

  await expect(row).not.toHaveClass(/is-overridden/);
  expect(await page.evaluate(() => window.game.snapshot().tuning.exposure)).toBeCloseTo(1.0, 6);
  expect(await page.evaluate(() => window.game.snapshot().tuning.overrideCount)).toBe(0);
});

test('the two diagnostics remain separately readable in a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'debug=1&panel=1');

  const overlay = page.locator('#euc-debug-overlay');
  const panel = page.locator('#euc-tuning-panel');
  await expect(overlay).toBeVisible();
  await expect(panel).toBeVisible();

  const overlayBox = await overlay.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(overlayBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  if (!overlayBox || !panelBox) return;

  expect(overlayBox.y + overlayBox.height).toBeLessThanOrEqual(panelBox.y);
  expect(overlayBox.x).toBeGreaterThanOrEqual(0);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(390);
});

test('the level plan is on the bridge in its shipping shape', async ({ page }) => {
  await boot(page);

  const plan = await page.evaluate(() => ({
    id: window.game.levelPlan.id,
    segments: window.game.levelPlan.segments.length,
    checkpoints: window.game.levelPlan.checkpoints.length,
    spawn: window.game.levelPlan.spawn,
    surround: window.game.levelPlan.surround,
    heightfield: {
      columns: window.game.levelPlan.heightfield.columns,
      rows: window.game.levelPlan.heightfield.rows,
      spacing: window.game.levelPlan.heightfield.spacing,
      heights: window.game.levelPlan.heightfield.heights.length,
      surfaces: window.game.levelPlan.heightfield.surfaces.length,
    },
  }));

  // The shipped level from M7 on. M1's own assertions are about the plan's
  // *shape* on the wire, which is why they survived the world changing under
  // them: nothing here knows what the level looks like.
  expect(plan.id).toBe('m7-slice');
  expect(plan.segments).toBeGreaterThan(1);
  // Checkpoints arrived at M10 and the field's *shape* is what M1 asserts —
  // it was reserved and empty here since M0 precisely so that filling it would
  // change a number and not a structure, which is exactly what happened.
  expect(plan.checkpoints).toBe(6);
  expect(plan.surround.surface).toBe('grass');
  expect(plan.spawn.headingY).toBe(0);
  // The arrays are the size the dimensions claim, on the wire as well as in
  // the builder — the plan is plain serializable data (invariant 2), and this
  // is the assertion that it still is.
  expect(plan.heightfield.heights).toBe(plan.heightfield.columns * plan.heightfield.rows);
  expect(plan.heightfield.surfaces)
    .toBe((plan.heightfield.columns - 1) * (plan.heightfield.rows - 1));
  expect((await page.evaluate(() => window.qa.snap())).levelPlanId).toBe(plan.id);
});

test('a synthetic frame is excluded from the timing window but not from its steps', async ({ page }) => {
  await boot(page);

  const report = await page.evaluate(() => {
    const game = window.game;
    // Everything in one evaluate, so no real animation frame can land between
    // the calls and contaminate the window.
    game.loop.setRunning(false);
    game.profileBegin();
    game.advance(100);
    game.advance(100);
    game.advance(100);
    return game.profile();
  });

  expect(report.sampled).toBe(0);
  expect(report.syntheticExcluded).toBe(3);
  // Excluding an unsampled render's timing must not exclude the state it
  // changed (master starter 17.5).
  expect(report.steps).toBe(300);
});

test('a real measurement window records our own millisecond percentiles', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => window.game.profileBegin());
  await page.waitForFunction(() => window.game.profile().sampled >= 20);
  const report = await page.evaluate(() => window.game.profile());

  expect(report.sampled).toBeGreaterThanOrEqual(20);
  expect(report.renderMs.p50).toBeGreaterThan(0);
  expect(report.renderMs.p99).toBeGreaterThanOrEqual(report.renderMs.p50);
  expect(report.renderMs.worst).toBeGreaterThanOrEqual(report.renderMs.p99);
});

test('a pixel-ratio change is not a viewport change; a resize is', async ({ page }) => {
  await boot(page);

  const before = await page.evaluate(() => window.qa.snap());

  const afterRatio = await page.evaluate(() => {
    window.game.tuning.set('RENDER.maxPixelRatio', 0.5);
    return window.game.snapshot();
  });

  // Backing the same CSS box with fewer device pixels must not run the full
  // viewport-change path, which also drops cached control geometry and
  // releases the in-flight gesture (master starter 8.7).
  expect(afterRatio.viewport.pixelRatio).toBeCloseTo(0.5, 6);
  expect(afterRatio.viewport.width).toBe(before.viewport.width);
  expect(afterRatio.layoutChanges).toBe(before.layoutChanges);

  await page.setViewportSize({ width: 700, height: 520 });
  await page.waitForFunction(
    (baseline) => window.game.snapshot().layoutChanges > baseline,
    before.layoutChanges,
  );

  const afterResize = await page.evaluate(() => window.qa.snap());
  expect(afterResize.viewport.width).toBe(700);
  expect(afterResize.viewport.height).toBe(520);
});

test('GPU objects plateau across advancing, resizing, and opening the diagnostics', async ({ page }) => {
  await boot(page);

  const trace = await page.evaluate(async () => {
    const game = window.game;
    game.loop.setRunning(false);
    // Warm up first: the first real frame compiles shaders, and counting that
    // as growth would report a one-off cost as a leak.
    game.advance(60);
    const baseline = game.resources();

    const samples = [baseline];
    for (let round = 0; round < 4; round += 1) {
      game.setOverlayVisible(true);
      game.setTuningPanelVisible(true);
      game.advance(60);
      game.setOverlayVisible(false);
      game.setTuningPanelVisible(false);
      game.tuning.set('RENDER.maxPixelRatio', round % 2 === 0 ? 1 : 2);
      game.advance(60);
      samples.push(game.resources());
    }
    game.tuning.reset();
    return samples;
  });

  const baseline = trace[0];
  expect(baseline.lights).toBe(2);
  for (const sample of trace) {
    expect(sample.geometries).toBe(baseline.geometries);
    expect(sample.textures).toBe(baseline.textures);
    expect(sample.programs).toBe(baseline.programs);
    expect(sample.sceneObjects).toBe(baseline.sceneObjects);
  }
});

test('a full interaction pass produces no console errors', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page, 'debug=1');

  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyA');
  await page.keyboard.press('Space');
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyC');
  await page.keyboard.press('Escape');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  await page.keyboard.press('F4');
  await page.setViewportSize({ width: 520, height: 900 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));

  // Freeze before capturing, so the picture is of a state that was asked for
  // rather than of whatever the loop had reached by the time the screenshot
  // round trip completed.
  const state = await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.advance(120);
    return window.game.snapshot();
  });

  await expect(page.locator('#euc-debug-overlay')).toBeVisible();
  await expect(page.locator('#euc-tuning-panel')).toBeVisible();
  expect(state.consumed.hop).toBe(1);
  expect(state.consumed.cameraCycle).toBe(1);
  expect(state.consumed.pause).toBe(1);
  expect(state.consumed.reset).toBeGreaterThanOrEqual(1);

  await testInfo.attach('m1-diagnostics', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(errors).toEqual([]);
});
