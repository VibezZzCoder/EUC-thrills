/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * Settings choice rows (1.2.0): every fixed-value setting is a row of
 * `<button aria-pressed>`s, never a `<select>` or a checkbox.
 *
 * Two journeys the older suites do not cover: the new Frame rate limit row
 * reaching the loop, and the pad's walk along and between rows (Left/Right
 * moves, A chooses, Up/Down lands on the row's value).
 *
 * **Nothing here reads a frame rate or a frame interval** (`AGENTS.md`,
 * "Measuring performance"). The limit is checked by a count the loop keeps —
 * frames it skipped for the cap — rising or not rising: booleans only.
 */

function choice(page: Page, option: string, value: string) {
  return page.locator(`[data-choice="${option}"][data-value="${value}"]`);
}

/** The loop's own counters. Counts only; never a rate. */
function loopCounts(page: Page): Promise<{ mode: string; running: boolean; frames: number; skipped: number }> {
  return page.evaluate(() => {
    const stats = window.game.loop.stats();
    return { mode: stats.mode, running: stats.running, frames: stats.frames, skipped: stats.capSkippedFrames };
  });
}

test('the frame rate limit row reaches the loop: a cap skips frames, and Auto stops skipping', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="settings"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');

  // The premise: the cap acts on animation-frame callbacks, so the loop must
  // be running on them here, or a count that never moves proves nothing.
  const premise = await loopCounts(page);
  expect(premise.mode, 'the loop is not driven by animation frames').toBe('raf');
  expect(premise.running).toBe(true);
  expect(await page.evaluate(() => window.game.snapshot().options.frameRateLimit)).toBe('auto');
  await expect(choice(page, 'frameRateLimit', 'auto')).toHaveAttribute('aria-pressed', 'true');

  // 30 is below any display a test browser draws at, so it is offered.
  await expect(choice(page, 'frameRateLimit', '30')).toBeVisible();
  await choice(page, 'frameRateLimit', '30').click();
  expect(await page.evaluate(() => window.game.snapshot().options.frameRateLimit)).toBe('30');
  await expect(choice(page, 'frameRateLimit', '30')).toHaveAttribute('aria-pressed', 'true');
  const capped = (await loopCounts(page)).skipped;
  await page.waitForFunction(
    (before) => window.game.loop.stats().capSkippedFrames > before + 5,
    capped,
    { timeout: 10_000 },
  );

  // Auto: the count holds still while the loop keeps drawing.
  await choice(page, 'frameRateLimit', 'auto').click();
  expect(await page.evaluate(() => window.game.snapshot().options.frameRateLimit)).toBe('auto');
  const freed = await loopCounts(page);
  await page.waitForFunction(
    (before) => window.game.loop.stats().frames > before + 20,
    freed.frames,
    { timeout: 10_000 },
  );
  expect((await loopCounts(page)).skipped, 'Auto still skipped frames').toBe(freed.skipped);

  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

test('a pad walks a choice row without choosing, and Down lands on the next row\'s value', async ({ page }) => {
  const errors = collectErrors(page);
  // The m9 suite's fake standard pad: the real Gamepad API path.
  await page.addInitScript(() => {
    const pad = {
      index: 0, id: 'fake standard pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { fakePad: typeof pad }).fakePad = pad;
    navigator.getGamepads = () => [pad] as never;
  });
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
  const pulse = (button: number): Promise<void> => page.evaluate(async (which) => {
    const pad = (window as unknown as { fakePad: { buttons: { pressed: boolean; value: number }[] } }).fakePad;
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[which].pressed = true;
    pad.buttons[which].value = 1;
    await frame();
    pad.buttons[which].pressed = false;
    pad.buttons[which].value = 0;
    await frame();
  }, button);
  const DOWN = 13;
  const RIGHT = 15;
  const A = 0;
  const quality = () => page.evaluate(() => window.game.snapshot().options.quality);

  // Settings, opened by the pad's A, opens on the value Quality holds.
  await page.locator('.euc-menu--title [data-menu="settings"]').focus();
  await pulse(A);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
  expect(await quality()).toBe('high');
  await expect(choice(page, 'quality', 'high')).toBeFocused();

  // Right moves to Ultra and chooses nothing.
  await pulse(RIGHT);
  await expect(choice(page, 'quality', 'ultra')).toBeFocused();
  expect(await quality()).toBe('high');
  await expect(choice(page, 'quality', 'ultra')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-option="quality"]')).not.toHaveAttribute('aria-busy', /.*/);

  // Down to Field of view, then Down again lands on the unit Speed units
  // holds — not whichever of the row's buttons sits nearest the column the
  // walk came from.
  await pulse(DOWN);
  await expect(page.locator('[data-option="fieldOfViewTrim"]')).toBeFocused();
  const unit = await page.evaluate(() => window.game.snapshot().options.speedUnit);
  await pulse(DOWN);
  await expect(choice(page, 'speedUnit', unit)).toBeFocused();
  expect(await page.evaluate(() => window.game.snapshot().options.speedUnit)).toBe(unit);
  expect(await quality()).toBe('high');

  expect(errors).toEqual([]);
});
