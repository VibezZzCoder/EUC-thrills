/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { WIM_LOGO_HEIGHT, WIM_LOGO_WIDTH } from '../src/data/wimLogoAsset.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M28 — Wheel in Motion's seat, born at Phase 0 (docs/PLANS.md §28.7).
 *
 * Two things a headless test cannot say about a sixth rider, and one it can
 * only say by pixel.
 *
 * **The roster is six everywhere the player meets it.** The title's dot row
 * is what tells a casual player the roster exists at all (`DESIGN.md`
 * §9d-ii), so its count is asserted against the roster rather than against a
 * number — and the sixth card is in the chooser, is a real `<button>`, and
 * applies immediately the way the other five do.
 *
 * **His mark on the card is his file, at its own proportions.** The brief
 * forbids a drawing of the logo and forbids a distorted aspect; the card
 * carries the PNG as an `<image>`, so the test reads the rendered `<image>`
 * back and checks the box it was given is the artwork's own ratio. A card
 * that stretched it would pass every hash in the suite.
 *
 * The fit contract — six cards, the heading and Done inside all twelve
 * supported viewports at once — stays where it lives, in `tests/m22.spec.ts`,
 * which reads the roster and so grew to six without an edit.
 */

test('the sixth rider is on the dot row and in the chooser, and choosing him is immediate', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  // Sixth, by position rather than by being last: M29 appended a seventh
  // (`tests/m29.spec.ts` is that rider's copy of this test).
  expect(CHARACTER_IDS.length).toBeGreaterThanOrEqual(6);
  expect(CHARACTER_IDS[5]).toBe('wheel-in-motion');
  await expect(page.locator('[data-rider-dot]')).toHaveCount(CHARACTERS.length);
  await expect(page.locator('[data-rider-dot="wheel-in-motion"]')).toHaveCount(1);

  await page.locator('.euc-rider-chip').click();
  await expect(page.locator('.euc-menu--riders')).toBeVisible();
  const card = page.locator('.euc-menu--riders [data-rider="wheel-in-motion"]');
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(card.locator('.euc-rider-card__name')).toHaveText('Wheel in Motion');

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'wheel-in-motion');
  expect(await page.evaluate(() => window.game.options.current.character)).toBe('wheel-in-motion');

  expect(errors).toEqual([]);
});

test('his mark on the card is the embedded file at the artwork\'s own aspect', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-rider-chip').click();

  const image = page.locator('.euc-menu--riders [data-rider="wheel-in-motion"] image');
  await expect(image).toHaveCount(1);
  const box = await image.evaluate((element) => {
    const href = element.getAttribute('href') ?? '';
    return {
      isPng: href.startsWith('data:image/png;base64,'),
      length: href.length,
      width: Number(element.getAttribute('width')),
      height: Number(element.getAttribute('height')),
      fit: element.getAttribute('preserveAspectRatio'),
    };
  });
  expect(box.isPng).toBe(true);
  // The whole payload, not a thumbnail: 123 kB of PNG is ~164 k characters.
  expect(box.length).toBeGreaterThan(160_000);
  expect(box.fit).toBe('xMidYMid meet');
  const ratio = box.width / box.height;
  const own = WIM_LOGO_WIDTH / WIM_LOGO_HEIGHT;
  expect(Math.abs(ratio - own)).toBeLessThan(0.01);

  // And it painted: the `<image>` has a rendered box on screen.
  const rendered = await image.boundingBox();
  expect(rendered).not.toBeNull();
  expect(rendered!.width).toBeGreaterThan(8);

  expect(errors).toEqual([]);
});

/**
 * M28 Phase 3 — his crash reaches the sink (`docs/PLANS.md` §28.10).
 *
 * His seat carried `crashVoice: 'red-rider'` as a declared interim through
 * Phases 0–2, and that state is silent from every angle except this one: he
 * falls, a recording plays, it is audible, and it is the wrong rider's.
 * `src/audio/crashVoices.test.ts` proves his file is a sixth distinct one on
 * disk; this proves the *game* reaches for it when he comes off — through the
 * options store, the engine, the bank and `crashFor`, every one of which is
 * wiring. The m19 / m22 / m23 rung, aimed at the rider whose interim was
 * declared in the data.
 */
test('Wheel in Motion crashes with his own file, audibly', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'wheel-in-motion' }));
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
  expect(measured.voice).toBe('wheel-in-motion');
  // The sibling render is the owner's recording outside one 0.8 s band and
  // within a fraction of a decibel of it overall, so m8's bar for a crash
  // being audible over the ride bed is the right bar here unchanged.
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  // And the choice follows the chooser, without a reload — including back
  // off him, which is the direction that would still pass if the mapping
  // were stuck on the interim.
  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('red-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'wheel-in-motion' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('wheel-in-motion');

  expect(errors).toEqual([]);
});
