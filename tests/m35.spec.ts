/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M35 — Seal on a Wheel's seat (`docs/PLANS.md` §35.8).
 *
 * Phase 0 put him on the roster: the title's dot row counts the roster rather
 * than a number (`DESIGN.md` §9d-ii), and the ninth card is in the chooser, is
 * a real `<button>`, and applies immediately the way the other eight do. His
 * card carries no `<image>`: nothing on him is a mark this project may not
 * redraw — not the manufacturer's, not the small chest wordmark the
 * photographs show — so the exception §9d records for two real riders' marks
 * stays used exactly twice.
 *
 * **He is asserted by position rather than by count**, the shape M28 settled
 * on and M34 repeated: `CHARACTER_IDS[8]` is his and the length is a floor, so
 * a tenth rider added behind him leaves this file green. Nothing anywhere in
 * `src/`, `tests/` or `tools/` asserts that the roster is exactly nine; the
 * only hard counts a new rider moves are the audio fixtures, and they move at
 * Phase 3.
 *
 * The fit contract — nine cards, the heading and Done inside twenty-five
 * supported viewports at once — stays where it lives, in `tests/m22.spec.ts`,
 * which reads the roster and so counts nine cards without an edit. **Its
 * viewport list did need one**, which is the part M34 could say it did not:
 * a ninth card adds a row to the blurbed grid at two column counts, so two of
 * the compact tier's derived height limits moved (52rem → 62rem at two
 * columns, 36.5rem → 43rem at four), every pair that straddles one of them
 * moved with it — 705×993, 1236×689, and the blurbed side of the 1486, 1692
 * and 1826 pairs, all three now at 689 — and the 1826 pair is new, because
 * this band is the first to reach a sixth column.
 *
 * Phase 0's change to the chooser is the cap, the sideways threshold and that
 * widest clause in `game.css`, all three re-derived for a ninth card, **plus
 * a real change to the phone tier's anatomy**, measured rather than predicted:
 * the compact card's padding and grid gap trimmed everywhere compact, which
 * takes the card from 54.5 to 49.8 pixels, and the sideways `auto-fit` floor
 * dropped to 12.36rem under `max-height: 30rem` alone, so a phone lying down
 * holds three columns instead of two. Either alone fixes one orientation and
 * leaves the other over the fold; `game.css` carries the measurements.
 *
 * Phase 3 appended the crash test below it: the seat's `crashVoice` was an
 * interim on Red Rider's file for three phases, and the wiring that ends it is
 * invisible to every test of the bytes. His is the first crash on this roster
 * with two provenances — the owner's voice-scrubbed wipeout plus one CC0 layer
 * — and what this rung asserts is the round trip, not the mix.
 */

// ---------------------------------------------------------------------------
// Phase 0 — the ninth seat
// ---------------------------------------------------------------------------

test('the ninth rider is on the dot row and in the chooser, and choosing him is immediate', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  expect(CHARACTER_IDS.length).toBeGreaterThanOrEqual(9);
  expect(CHARACTER_IDS[8]).toBe('seal-on-a-wheel');
  await expect(page.locator('[data-rider-dot]')).toHaveCount(CHARACTERS.length);
  await expect(page.locator('[data-rider-dot="seal-on-a-wheel"]')).toHaveCount(1);

  await page.locator('.euc-rider-chip').click();
  await expect(page.locator('.euc-menu--riders')).toBeVisible();
  const card = page.locator('.euc-menu--riders [data-rider="seal-on-a-wheel"]');
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(card.locator('.euc-rider-card__name')).toHaveText('Seal on a Wheel');
  // Drawn, not embedded: the `<image>` exception is for marks this project may
  // not redraw, and his portrait — lid, body and wheel — is the project's own
  // shapes throughout.
  await expect(card.locator('image')).toHaveCount(0);
  await expect(card.locator('svg path, svg rect')).not.toHaveCount(0);

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'seal-on-a-wheel');
  expect(await page.evaluate(() => window.game.options.current.character)).toBe('seal-on-a-wheel');
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('seal-on-a-wheel');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 3 — the crash voice (`docs/PLANS.md` §35.6)
// ---------------------------------------------------------------------------

/**
 * M35 Phase 3 — his crash reaches the sink, the m19 / m22 / m23 / m28 / m34 rung.
 *
 * His seat carried `crashVoice: 'red-rider'` as a declared interim through
 * Phases 0–2, and that state is silent from every angle except this one: he
 * falls, a recording plays, it is audible, and it is the wrong rider's. **His
 * is the quietest version of that failure yet**, because Red Rider's file *is*
 * this same crash from another donor — the interim surviving would play
 * something that sounds nearly right and has no seal in it at all.
 * `src/audio/crashVoices.test.ts` proves his file is a ninth distinct one on
 * disk and that the bark is in it; this proves the *game* reaches for it when
 * he comes off — through the options store, the engine, the bank and
 * `crashFor`, every one of which is wiring no test of the bytes can see.
 */
test('Seal on a Wheel crashes with his own file, audibly', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'seal-on-a-wheel' }));
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
  expect(measured.voice).toBe('seal-on-a-wheel');
  // The fourth render is the owner's recording outside one 0.8 s band and
  // within 0.21 dB of it overall — the bark is 270 ms at −8 dBFS peak inside
  // that band and moves the file's own level by almost nothing — so m8's bar
  // for a crash being audible over the ride bed is the right bar here
  // unchanged.
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  // And the choice follows the chooser, without a reload — including back off
  // him onto the rider whose voice he borrowed for three phases, which is the
  // direction that would still pass if the mapping were stuck on the interim.
  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('red-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'seal-on-a-wheel' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('seal-on-a-wheel');

  expect(errors).toEqual([]);
});
