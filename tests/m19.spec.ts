/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, collectErrors } from './harness.ts';

/**
 * M19 — Red Rider, and the one thing about him only a browser can answer.
 *
 * His look, his machine and his crash file are all proved headlessly:
 * `src/render/redRider.test.ts` builds the rig and counts its draw calls,
 * `src/audio/crashVoices.test.ts` opens the three shipped recordings and
 * proves his is the owner's own with 0.8 s re-textured. Neither can say
 * whether the *game* reaches for it when he falls off — that runs through the
 * options store, the engine, the sink's bank and `crashFor`, and every one of
 * those joins is wiring.
 *
 * **`lastCrashVoice` is the only honest witness.** `crashSamplePlays` counts
 * the source node and proves a recording played rather than the synthesized
 * fallback, but all three riders have one, so it cannot say whose. The sink
 * records which buffer it reached for at the moment it reached for it. This is
 * the same rung m14_5 climbs for Trollina, aimed at the rider whose file
 * shipped last and whose bank entry was optional until it did.
 */

test('Red Rider crashes with his own recording, audibly', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
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
  expect(measured.voice).toBe('red-rider');
  // His file is the owner's recording with one band of 0.8 s re-textured at the
  // same level, so m8's bar for a crash being audible over the ride bed is the
  // right bar here unchanged.
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  // And the choice follows the chooser, without a reload.
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('cool-rider');

  expect(errors).toEqual([]);
});
