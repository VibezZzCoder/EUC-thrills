/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M34 — FloWithZo's seat (`docs/PLANS.md` §34.7).
 *
 * Phase 0 put him on the roster: the title's dot row counts the roster rather
 * than a number (`DESIGN.md` §9d-ii), and the eighth card is in the chooser,
 * is a real `<button>`, and applies immediately the way the other seven do.
 * His card carries no `<image>`: nothing on him is a mark this project may not
 * redraw, so the exception §9d records for two real riders' marks stays used
 * exactly twice.
 *
 * **He is asserted by position rather than by count.** `CHARACTER_IDS[7]` is
 * his and the length is a floor, so a ninth rider added behind him leaves this
 * file green and moves only the one hard count the roster keeps
 * (`tests/m29.spec.ts`), which is the shape M28 settled on.
 *
 * The fit contract — eight cards, the heading and Done inside twenty-one
 * supported viewports at once — stays where it lives, in `tests/m22.spec.ts`,
 * which reads the roster and so grew to eight without an edit. Phase 0's
 * change to the chooser is the cap and the sideways threshold in `game.css`;
 * the phone tier needed nothing, measured rather than predicted.
 *
 * Phase 3 appended the crash test below it: the seat's `crashVoice` was an
 * interim on Red Rider's file for three phases, and the wiring that ends it is
 * invisible to every test of the bytes.
 */

// ---------------------------------------------------------------------------
// Phase 0 — the eighth seat
// ---------------------------------------------------------------------------

test('the eighth rider is on the dot row and in the chooser, and choosing him is immediate', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  expect(CHARACTER_IDS.length).toBeGreaterThanOrEqual(8);
  expect(CHARACTER_IDS[7]).toBe('flo-with-zo');
  await expect(page.locator('[data-rider-dot]')).toHaveCount(CHARACTERS.length);
  await expect(page.locator('[data-rider-dot="flo-with-zo"]')).toHaveCount(1);

  await page.locator('.euc-rider-chip').click();
  await expect(page.locator('.euc-menu--riders')).toBeVisible();
  const card = page.locator('.euc-menu--riders [data-rider="flo-with-zo"]');
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(card.locator('.euc-rider-card__name')).toHaveText('FloWithZo');
  // Drawn, not embedded: the `<image>` exception is for marks this project may
  // not redraw, and his portrait is three shapes of the project's own.
  await expect(card.locator('image')).toHaveCount(0);
  await expect(card.locator('svg path, svg rect')).not.toHaveCount(0);

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'flo-with-zo');
  expect(await page.evaluate(() => window.game.options.current.character)).toBe('flo-with-zo');
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('flo-with-zo');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 3 — the crash voice (`docs/PLANS.md` §34.10)
// ---------------------------------------------------------------------------

/**
 * M34 Phase 3 — his crash reaches the sink, the m19 / m22 / m23 / m28 rung.
 *
 * His seat carried `crashVoice: 'red-rider'` as a declared interim through
 * Phases 0–2, and that state is silent from every angle except this one: he
 * falls, a recording plays, it is audible, and it is the wrong rider's.
 * `src/audio/crashVoices.test.ts` proves his file is an eighth distinct one on
 * disk; this proves the *game* reaches for it when he comes off — through the
 * options store, the engine, the bank and `crashFor`, every one of which is
 * wiring that no test of the bytes can see.
 */
test('FloWithZo crashes with his own file, audibly', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'flo-with-zo' }));
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

  const measured = await page.evaluate(async () => {
    window.qa.freeze();
    window.qa.resetRide();
    const idle = await window.qa.audioOutputMax(500, 5);
    const before = window.qa.snap().audio;

    let steps = 0;
    while (steps < 3000 && !window.game.snapshot().euc.crashed) {
      const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
      window.game.setActions({ throttle: 1, steer: flip });
      window.game.advance(6);
      steps += 6;
    }
    window.game.setActions({ throttle: 0, steer: 0 });

    const after = window.qa.snap().audio;
    const during = await window.qa.audioOutputMax(1600, 16);
    return {
      crashed: window.game.snapshot().euc.crashed,
      samplePlays: after.crashSamplePlays - before.crashSamplePlays,
      voice: after.lastCrashVoice,
      idle,
      during,
    };
  });

  expect(measured.crashed).toBe(true);
  expect(measured.samplePlays).toBeGreaterThanOrEqual(1);
  expect(measured.voice).toBe('flo-with-zo');
  // The third render is the owner's recording outside one 0.8 s band and
  // within a fraction of a decibel of it overall, so m8's bar for a crash
  // being audible over the ride bed is the right bar here unchanged.
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  // And the choice follows the chooser, without a reload — including back
  // off him onto the rider whose voice he borrowed for three phases, which
  // is the direction that would still pass if the mapping were stuck on the
  // interim.
  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('red-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'flo-with-zo' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('flo-with-zo');

  expect(errors).toEqual([]);
});
