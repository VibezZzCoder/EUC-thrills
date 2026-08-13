/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './harness.ts';

/**
 * Stability and input-contract fixes from the adversarial QA pass of
 * 2026-08-02.
 *
 * Every test here exists because an earlier test proved a weaker thing than
 * it appeared to: the m1 suite verified that Escape was *consumed* while the
 * binding did nothing, and verified that reset was *claimed* while a held
 * throttle was re-applied within the same step. These assert the
 * player-visible behaviour instead — the simulation actually freezes, the
 * rider is actually at the spawn, the notice is actually on screen.
 */

test('Escape pauses the simulation, shows the pause menu, and Escape resumes', async ({ page }) => {
  // **Updated at M9**, which replaced `ui/notice.ts`'s placeholder pause card
  // with the real pause menu — exactly as that file's own header said it
  // would. What is asserted is unchanged and is the point of the test: the
  // simulation genuinely stops, something visible says so, and Escape brings
  // it back. Only the element carrying "something visible" is different.
  //
  // The resume half caught a real defect when it was rewritten: Escape has two
  // owners, the menu while one is up and the pause action while one is not,
  // and they see the same keypress. Before the menu stopped the event, a
  // resume was followed by a fresh pause latched from the same press, and
  // Escape could never resume a ride at all.
  const errors = collectErrors(page);
  await boot(page);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().paused === true);

  const paused = await page.evaluate(() => window.qa.snap());
  expect(paused.loop.running).toBe(false);
  expect(paused.consumed.pause).toBe(1);
  expect(paused.app.state).toBe('paused');
  expect(paused.app.menu).toBe('pause');
  await expect(page.locator('.euc-menu--pause')).toBeVisible();
  // The HUD stays up behind it: a player who paused to read their speed
  // should not have the number they paused to read disappear.
  expect(paused.hud.visible).toBe(true);

  // Genuinely stopped: rendering continues (that is what keeps the card and
  // any diagnostics alive), simulation does not. Waiting on frames is safe
  // here because frames-while-frozen is the thing being asserted.
  await page.waitForFunction(
    (baseline) => window.game.snapshot().loop.frames > baseline + 3,
    paused.loop.frames,
  );
  const still = await page.evaluate(() => window.qa.snap());
  expect(still.tick).toBe(paused.tick);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().paused === false);
  await expect(page.locator('.euc-menu--pause')).toBeHidden();
  // The resume is the menu's, not the pause action's, so the pause counter
  // does not move — and it must stay at one. A second claim here would be the
  // same keypress being heard twice, which is the defect described above.
  expect(await page.evaluate(() => window.qa.snap().consumed.pause)).toBe(1);
  await page.waitForFunction(
    (baseline) => window.game.snapshot().tick > baseline,
    still.tick,
  );
  // And it stays resumed rather than re-pausing a frame later.
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.qa.snap().app.state)).toBe('freeRide');

  expect(errors).toEqual([]);
});

test('losing the WebGL context freezes the game and shows the recovery notice', async ({ page }) => {
  // No console-emptiness assertion here: the browser itself logs the forced
  // context loss, and that message is the mechanism, not a defect.
  await boot(page);

  await page.evaluate(() => {
    const gl = window.game.renderer.renderer.getContext() as WebGLRenderingContext;
    // Held across the loss: getExtension is not reliable on a lost context,
    // so restoreContext must be called on the object obtained before losing.
    const ext = gl.getExtension('WEBGL_lose_context');
    (window as unknown as { loseExt: unknown }).loseExt = ext;
    ext?.loseContext();
  });

  await page.waitForFunction(() => window.game.snapshot().contextLost === true);
  const lost = await page.evaluate(() => window.qa.snap());
  expect(lost.loop.running).toBe(false);
  await expect(page.locator('#euc-context-notice')).toBeVisible();
  await expect(page.locator('#euc-context-notice')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#euc-context-notice button')).toBeFocused();

  // The simulation must not run behind the dead canvas.
  await page.waitForFunction(
    (baseline) => window.game.snapshot().loop.frames > baseline + 3,
    lost.loop.frames,
  );
  expect(await page.evaluate(() => window.qa.snap().tick)).toBe(lost.tick);

  await page.evaluate(() => {
    (window as unknown as { loseExt: { restoreContext(): void } }).loseExt.restoreContext();
  });

  await page.waitForFunction(() => window.game.snapshot().contextLost === false);
  await expect(page.locator('#euc-context-notice')).toBeHidden();
  await page.waitForFunction(() => window.game.snapshot().loop.running === true);
  await page.waitForFunction(
    (baseline) => window.game.snapshot().tick > baseline,
    lost.tick,
  );
  // And it still draws: a rendered frame after restore has real draw calls.
  await page.evaluate(() => window.game.advance(1));
  expect(await page.evaluate(() => window.qa.snap().render.drawCalls)).toBeGreaterThan(0);
});

test('reset lands exactly on the spawn even while movement input is held', async ({ page }) => {
  await boot(page);

  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActions({ throttle: 1, steer: 1 });
    game.advance(240);
    const moving = game.snapshot().euc;
    // Throttle and steer stay scripted — that is the point: the reset step
    // itself must not integrate them.
    game.setActions({ reset: true });
    game.advance(1);
    const afterReset = game.snapshot().euc;
    game.advance(120);
    const later = game.snapshot().euc;
    return { moving, afterReset, later, spawn: game.levelPlan.spawn };
  });

  expect(result.moving.speed).toBeGreaterThan(0);

  // Exact equality on purpose. "Very nearly the spawn" is precisely the
  // defect this guards against: one step of held input applied inside the
  // reset step left the rider 3 µm out and 0.4 mm/s moving.
  expect(result.afterReset.position.x).toBe(result.spawn.position.x);
  expect(result.afterReset.position.z).toBe(result.spawn.position.z);
  expect(result.afterReset.headingY).toBe(result.spawn.headingY);
  expect(result.afterReset.speed).toBe(0);

  // Held input deliberately survives the reset and applies from the next
  // step — a rider holding W through a reset expects to pull away again.
  expect(result.later.speed).toBeGreaterThan(0);
});

test('releasing one keyboard alias does not cancel the other', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => window.qa.freeze());

  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => window.qa.snap().actions.throttle)).toBe(1);

  await page.keyboard.up('ArrowUp');
  expect(await page.evaluate(() => window.qa.snap().actions.throttle)).toBe(0);

  // Same contract on the steer axis, opposite release order.
  await page.keyboard.down('KeyA');
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.up('ArrowLeft');
  expect(await page.evaluate(() => window.qa.snap().actions.steer)).toBe(-1);
  await page.keyboard.up('KeyA');
  expect(await page.evaluate(() => window.qa.snap().actions.steer)).toBe(0);
});

test('the QA bridge refuses a non-finite step count instead of hanging', async ({ page }) => {
  await boot(page);

  // Before the guard, advance(Infinity) was an unbounded loop — this test
  // did not fail, it timed out with a frozen tab.
  const result = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().tick;
    game.advance(Number.POSITIVE_INFINITY);
    game.advance(Number.NaN);
    game.advance(-100);
    return { before, after: game.snapshot().tick };
  });

  expect(result.after).toBe(result.before);
});
