/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M22 — Adonisb2, and the one thing about him only a browser can answer.
 *
 * His look and his machine are proved headlessly by `src/render/adonisb2.test.ts`,
 * and his crash file by `src/audio/crashVoices.test.ts`, which opens all four
 * shipped recordings and proves his is a fourth distinct one that hits inside
 * its first second. None of that can say whether the *game* reaches for it when
 * he falls off: that runs through the options store, the engine, the sink's
 * bank and `crashFor`, and every one of those joins is wiring.
 *
 * **The failure this exists to catch is specific and it was live until Phase 3.**
 * His roster entry carried `crashVoice: 'cool-rider'` as a declared interim
 * while his recording did not exist, and that state is silent from every angle
 * except this one — he falls, a recording plays, it is audible, it is the wrong
 * rider's. `lastCrashVoice` reports the buffer the sink actually reached for,
 * which is the only witness that can tell the two apart. Same rung m19 and
 * m14_5 climb, aimed at the rider whose file arrived before his wiring did.
 */

test('Adonisb2 crashes with his own recording, audibly', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'adonisb2' }));
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
  expect(measured.voice).toBe('adonisb2');
  // His file is a different recording rather than a re-cut of the owner's, but
  // `tools/make-crash-adonisb2.mjs` matches it to the same RMS on purpose —
  // swapping rider must not change how loud a crash is — so m8's bar for a
  // crash being audible over the ride bed is the right bar here unchanged.
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  // And the choice follows the chooser, without a reload — including back off
  // him, which is the direction that would still pass if the mapping were
  // stuck on the interim.
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('cool-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'adonisb2' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('adonisb2');

  expect(errors).toEqual([]);
});

/**
 * The roster no longer fits by accident — so fitting is now asserted.
 *
 * Four riders broke what three quietly permitted: on every supported phone
 * size the chooser overflowed (653 pixels in the worst portrait), the title
 * screen lost Settings, the rider chip and the credit in landscape, and the
 * pause card clipped its own hint — and `overflow-y: auto` on `.euc-menu`
 * turned all of it into a scrollbar no test was looking at. The M14.5 spec
 * only ever asserted that the *saved* card was visible, which stayed green
 * while three of the four cards and Done sat below the fold.
 *
 * The contract here is the stronger one QA asked for: every card, the
 * heading and Done **simultaneously** inside the viewport, and the menu
 * containers with nothing to scroll to at all.
 *
 * **The rider selected while measuring is the one with the longest blurb, and
 * it is computed rather than named.** A card's height is its words plus, on
 * the selected one, the visible "Riding now" pill — so the tallest a card ever
 * gets is the longest blurb wearing the pill. That was Adonisb2 at M22 and is
 * Maribel at M23, which is exactly the kind of fact that goes stale silently:
 * a hard-coded name would have kept passing while measuring the second-tallest
 * card. Reading it off `CHARACTERS` means the next rider re-aims this test by
 * existing.
 *
 * **Tablets joined the list at M23**, on the owner's ask, and they are not
 * decorative additions: a tablet is the one shape that is wide enough to look
 * like a desktop and short enough to run out of height, and 1024×768 sits
 * exactly at the width where the roster stops fitting in one row. Both
 * orientations of three common sizes are here for that reason.
 */
test('chooser, title and pause fit every supported phone and tablet size with nothing to scroll to', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  const tallest = [...CHARACTERS].sort((a, b) => b.blurb.length - a.blurb.length)[0].id;
  await page.evaluate((id) => window.game.setOptions({ character: id }), tallest);

  const VIEWPORTS = [
    // Phones, both orientations.
    { width: 360, height: 800 }, { width: 375, height: 667 },
    { width: 390, height: 844 }, { width: 412, height: 915 },
    { width: 667, height: 375 }, { width: 844, height: 390 },
    // Tablets, both orientations — M23.
    { width: 768, height: 1024 }, { width: 1024, height: 768 },
    { width: 820, height: 1180 }, { width: 1180, height: 820 },
    { width: 834, height: 1194 }, { width: 1194, height: 834 },
  ];

  // A layout change is an input-reset moment by contract (master §8.2): the
  // frame that absorbs it drops buffered one-shots, so an Escape pressed into
  // the gap between the resize and the game's next poll is *deliberately*
  // swallowed — Game.ts documents why. A player cannot rotate a phone and
  // press pause inside one frame; a test can, so it must wait the frame out.
  const resizeTo = async (viewport: { width: number; height: number }) => {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
    }));
  };

  // A menu root with anything to scroll to is a failed layout, whatever it is.
  const unscrollable = async (menu: string) => {
    const overflow = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!;
      return root.scrollHeight - root.clientHeight;
    }, menu);
    expect(overflow, `${menu} has ${overflow}px hidden below the fold`).toBeLessThanOrEqual(1);
  };

  // And the things a player came for are each fully inside the viewport.
  const fits = async (locator: import('@playwright/test').Locator, height: number, what: string) => {
    const box = await locator.boundingBox();
    expect(box, `${what} has no box`).not.toBeNull();
    expect(box!.y, `${what} starts above the viewport`).toBeGreaterThanOrEqual(-0.5);
    expect(box!.y + box!.height, `${what} ends below the viewport`).toBeLessThanOrEqual(height + 0.5);
  };

  for (const viewport of VIEWPORTS) {
    await resizeTo(viewport);

    // The title: every action, the world line, the chip, and the credit. The
    // list is spelled out rather than queried, so a button that stops being
    // rendered fails here instead of quietly dropping out of the contract.
    for (const control of [
      'start', 'challenge', 'track-day', 'knockabout', 'chase', 'routes', 'settings', 'riders',
    ]) {
      await fits(page.locator(`.euc-menu--title [data-menu="${control}"]`), viewport.height,
        `title ${control} at ${viewport.width}x${viewport.height}`);
    }
    await fits(page.locator('.euc-menu--title .euc-credit'), viewport.height,
      `title credit at ${viewport.width}x${viewport.height}`);
    await unscrollable('.euc-menu--title');

    // The chooser: every card and Done, at once.
    await page.locator('.euc-menu--title [data-menu="riders"]').click();
    for (const id of CHARACTER_IDS) {
      await fits(page.locator(`.euc-menu--riders [data-rider="${id}"]`), viewport.height,
        `card ${id} at ${viewport.width}x${viewport.height}`);
    }
    await fits(page.locator('.euc-menu--riders .euc-riders__heading'), viewport.height,
      `chooser heading at ${viewport.width}x${viewport.height}`);
    await fits(page.locator('.euc-menu--riders [data-menu="riders-back"]'), viewport.height,
      `chooser Done at ${viewport.width}x${viewport.height}`);
    await unscrollable('.euc-menu--riders');
    await page.keyboard.press('Escape');
  }

  // The pause card, in the ride, at the two landscape sizes that clipped it.
  await page.evaluate(() => window.game.setAppState('freeRide'));
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
  for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
    await resizeTo(viewport);
    await page.keyboard.press('Escape');
    await page.locator('.euc-menu--pause:not([hidden])').waitFor();
    for (const control of ['resume', 'settings', 'quit']) {
      await fits(page.locator(`.euc-menu--pause [data-menu="${control}"]`), viewport.height,
        `pause ${control} at ${viewport.width}x${viewport.height}`);
    }
    await fits(page.locator('.euc-menu--pause .euc-controls-note'), viewport.height,
      `pause hint at ${viewport.width}x${viewport.height}`);
    await unscrollable('.euc-menu--pause');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
  }

  // **And the pause card during a track day, which is the tallest it gets** —
  // M23. End session is hidden in every other ride, so the four-button card
  // above is not the worst case any more, and a fit contract measuring only the
  // easy one is a contract that passes while the hard one clips.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.evaluate(() => window.game.startTrackDay());
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  for (const viewport of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
    await resizeTo(viewport);
    await page.keyboard.press('Escape');
    await page.locator('.euc-menu--pause:not([hidden])').waitFor();
    for (const control of ['resume', 'end-session', 'new-route', 'settings', 'quit']) {
      await fits(page.locator(`.euc-menu--pause [data-menu="${control}"]`), viewport.height,
        `track-day pause ${control} at ${viewport.width}x${viewport.height}`);
    }
    await unscrollable('.euc-menu--pause');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
  }

  expect(errors).toEqual([]);
});
