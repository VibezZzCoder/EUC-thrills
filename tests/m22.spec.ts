/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { COUCH_MIN_WIDTH_PX } from '../src/app/couch.ts';
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
    // **Windows between the devices — M29 Phase 1, from an independent QA
    // pass.** A desktop window can be any size, and 740×650 is one where two
    // columns of blurbed sideways cards make four rows that clip the seventh
    // card and put Done below the fold, while every device above fit. Each of
    // these three sits just inside a column count's height limit for the
    // blurbed card (two columns, three columns, four columns), so the compact
    // tier's derived breakpoints in `game.css` are held here at the exact
    // places they were derived for rather than at the devices they happened
    // to be checked on.
    { width: 740, height: 650 }, { width: 740, height: 481 },
    { width: 1000, height: 560 }, { width: 1280, height: 485 },
    // And the *other* side of each derived breakpoint, at the narrowest width
    // of its column count — where the blurb wraps most and the card is
    // tallest — one pixel above the height at which the compact card takes
    // over. A limit set too high would fail here with the blurbs cut off;
    // a limit set too low fails above with Done below the fold.
    //
    // **Two of the three moved at M35 Phase 0**, because a ninth card adds a
    // row to the blurbed grid at its two narrowest column counts: two columns
    // at 705 go from four rows to five and now need 977 pixels (the limit
    // rounds to 62rem, so the blurbed side is 993), and four columns at 1236
    // go from two rows to three and now need 685 (43rem, so 689). Three
    // columns at 940 stay three rows and their 47rem limit is untouched.
    { width: 705, height: 993 }, { width: 940, height: 753 }, { width: 1236, height: 689 },
    // **And the band the eighth rider opened — M34 Phase 0.** The sideways
    // threshold moved from 92.79rem to 105.69rem to make room for eight
    // full-height cards, so between those two widths the sideways card owns
    // 1486 px, the narrowest width this pair was written for.
    //
    // **Its blurbed side moved from 585 to 689 at M35 Phase 0**, and that move
    // is the whole point of a pair: the limit it straddles was re-derived from
    // 36.5rem to 43rem in the same pass, which left 585 a hundred and three
    // pixels *under* the limit and both heights of this pair on the compact
    // side, testing one side twice. 689 is one pixel above 43rem — the
    // blurbs are still there and must fit (three rows of four, tallest card
    // 143.4, Done 82.4 clear) — and 560 is under it, where the card goes
    // compact and must fit too. Both sides of a derived breakpoint, as the
    // three above are.
    { width: 1486, height: 689 }, { width: 1486, height: 560 },
    // **And the band the ninth rider opened — M35 Phase 0.** The sideways
    // threshold moved again, from 105.69rem to 118.59rem, so the sideways card
    // now owns everything under 1898 px and the new territory runs 1692–1897.
    // 1692 is its narrowest width, where the grid holds five columns in two
    // rows; 689 is one pixel above the compact tier's re-derived 43rem limit
    // (tallest card 177.1, Done 125.3 clear) and 560 is under it. Both sides
    // of the limit, as every pair above is.
    { width: 1692, height: 689 }, { width: 1692, height: 560 },
    // **And the sixth column, which this band does reach** — measured at
    // 1826 px, where the 18rem `auto-fit` floor finally lets six blurbed
    // tracks through (six 288-pixel tracks and five 9.6-pixel gaps need 1776
    // of the 1771.6 a 1826-pixel window leaves after 3.4rem of panel chrome,
    // and the floor collapses the rest). Nine cards are then six and three,
    // with the tallest card at 194 pixels the worst case anywhere in the
    // band; 689 keeps the blurbs (Done 91.6 clear) and 560 goes compact.
    { width: 1826, height: 689 }, { width: 1826, height: 560 },
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
  //
  // **The message names the size as well as the menu**, which it did not until
  // M25 Phase 5 added the first control that only exists at some of them: a
  // failure that says only "the title overflows" sends the reader looking
  // through twelve viewports for the one that did it.
  const unscrollable = async (menu: string, viewport: { width: number; height: number }) => {
    const overflow = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!;
      return root.scrollHeight - root.clientHeight;
    }, menu);
    expect(
      overflow,
      `${menu} has ${overflow}px hidden below the fold at ${viewport.width}x${viewport.height}`,
    ).toBeLessThanOrEqual(1);
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
    //
    // **`ultra` since M39** — the Ultra Graphics toggle shares Settings' row
    // (DESIGN §9g), and phones are offered it exactly as desktops are (q201),
    // so it is held to the same fit at every size here: one line beside
    // Settings in portrait, its own cell in the three-column tiers.
    for (const control of [
      'start', 'challenge', 'track-day', 'trick-run', 'knockabout', 'chase', 'routes',
      'settings', 'ultra', 'riders',
    ]) {
      await fits(page.locator(`.euc-menu--title [data-menu="${control}"]`), viewport.height,
        `title ${control} at ${viewport.width}x${viewport.height}`);
    }

    // **And on a phone held upright the pair costs the title nothing** — M39.
    // Those windows are the stack (taller than 50rem, narrower than 26rem), and
    // the phone contract has the least room of any: a Pixel 7's title fitted by
    // one sentence at M38. So the toggle shows its short label on one line and
    // the row stays as tall as Settings was alone (45 px at full chrome).
    if (viewport.width <= 416 && viewport.height > 800) {
      const settingsBox = await page.locator('.euc-menu--title [data-menu="settings"]').boundingBox();
      const ultraBox = await page.locator('.euc-menu--title [data-menu="ultra"]').boundingBox();
      expect(settingsBox && ultraBox, `the pair has no box at ${viewport.width}x${viewport.height}`)
        .toBeTruthy();
      expect(Math.abs(ultraBox!.y - settingsBox!.y), 'Settings and Ultra left one row')
        .toBeLessThan(0.5);
      expect(ultraBox!.height, `the pair's row grew at ${viewport.width}x${viewport.height}`)
        .toBeLessThanOrEqual(46);
    }

    // **The couch entrance, pinned at its own boundary** — M25 Phase 5.
    //
    // It is the first title control that is not always there, so this contract
    // asserts *both* sides of the predicate rather than only the easy one:
    // absent on every phone and every portrait tablet, which is what protects
    // the fit this whole test exists for — an eighth button is a ninth row on a
    // screen that had no room for a seventh — and, where it does appear, held
    // to exactly the same fit as the seven beside it.
    //
    // Landscape tablets are wide enough and are therefore offered it, and that
    // is deliberate rather than an oversight: this project reports a fine
    // pointer at every size, so a 1194-wide window here is indistinguishable
    // from a 1194-wide desktop window — and the threshold that would tell them
    // apart would also hide the mode in the suite's own 1000-wide window, where
    // every other Phase 5 spec reaches it. See `src/app/couch.ts`.
    const couch = page.locator('.euc-menu--title [data-menu="couch"]');
    if (viewport.width >= COUCH_MIN_WIDTH_PX) {
      await fits(couch, viewport.height,
        `title couch at ${viewport.width}x${viewport.height}`);
    } else {
      await expect(couch, `couch offered at ${viewport.width}x${viewport.height}`).toBeHidden();
    }
    await fits(page.locator('.euc-menu--title .euc-credit'), viewport.height,
      `title credit at ${viewport.width}x${viewport.height}`);
    await unscrollable('.euc-menu--title', viewport);

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
    await unscrollable('.euc-menu--riders', viewport);
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
    await unscrollable('.euc-menu--pause', viewport);
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
    await unscrollable('.euc-menu--pause', viewport);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
  }

  expect(errors).toEqual([]);
});

/**
 * **The same contract on a touch tablet with no pad — FU, 2026-09-23** (Fable's
 * QA of A28, an observation outside it).
 *
 * The tablets above run in the chromium project, whose pointer is fine, so at
 * 1000 px and wider the couch is offered and puts the title in its two
 * columns. A real tablet held sideways has a *coarse* pointer, and without a
 * pad it is not offered the couch (`couchEligible`) — so the title fell through
 * to the one-column stack, which needs about 880 px since Trick Run, and
 * scrolled: 19 px at 1024x768, 58 at 1180x820, 44 at 1194x834, 87 at 1024x700.
 * No project produces that machine, so this block builds it (AGENTS.md: "a rule
 * that no project can reach is a rule nobody has verified"): `hasTouch` makes
 * `(pointer: coarse)` match and leaves `(any-pointer: fine)` false, which is
 * exactly the tablet `couchEligible` refuses. `game.css` now gives every title
 * 62.5rem and wider two columns below 60rem of height, couch or not, and drops
 * the notes below 40rem as the couch title does.
 *
 * Both orientations of the tablets above, plus shorter landscape heights of
 * the kind a browser's toolbars leave (1024x700, 1133x680) and a 1024x600
 * tablet, which is the 40rem tier. The chooser is held too: a coarse card is
 * taller, and a fit contract that measures only the title would pass while
 * the chooser clipped.
 */
test.describe('a touch tablet with no pad', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test('the title and the chooser fit every touch tablet size with nothing to scroll to, couch or not', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    // The premise, asserted rather than assumed: a coarse pointer and no couch.
    // If either were false this would be measuring the desktop layout again.
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
      'this context is not actually coarse-pointered').toBe(true);
    expect(await page.evaluate(() => window.game.snapshot().couch.available),
      'a touch tablet with no pad was offered the couch').toBe(false);

    const tallest = [...CHARACTERS].sort((a, b) => b.blurb.length - a.blurb.length)[0].id;
    await page.evaluate((id) => window.game.setOptions({ character: id }), tallest);

    const VIEWPORTS = [
      { width: 1024, height: 768 }, { width: 768, height: 1024 },
      { width: 1180, height: 820 }, { width: 820, height: 1180 },
      { width: 1194, height: 834 }, { width: 834, height: 1194 },
      { width: 1024, height: 700 }, { width: 1133, height: 680 },
      { width: 1024, height: 600 },
    ];

    const unscrollable = async (menu: string, where: string) => {
      const overflow = await page.evaluate((sel) => {
        const root = document.querySelector<HTMLElement>(sel)!;
        return root.scrollHeight - root.clientHeight;
      }, menu);
      expect(overflow, `${menu} has ${overflow}px hidden below the fold at ${where}`).toBeLessThanOrEqual(1);
    };
    const fits = async (locator: import('@playwright/test').Locator, height: number, what: string) => {
      const box = await locator.boundingBox();
      expect(box, `${what} has no box`).not.toBeNull();
      expect(box!.y, `${what} starts above the viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(box!.y + box!.height, `${what} ends below the viewport`).toBeLessThanOrEqual(height + 0.5);
    };

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
      }));
      const where = `${viewport.width}x${viewport.height} (touch, no pad)`;

      await expect(page.locator('.euc-menu--title [data-menu="couch"]'), `couch offered at ${where}`).toBeHidden();
      for (const control of [
        'start', 'challenge', 'track-day', 'trick-run', 'knockabout', 'chase', 'routes',
        'settings', 'ultra', 'riders',
      ]) {
        await fits(page.locator(`.euc-menu--title [data-menu="${control}"]`), viewport.height,
          `title ${control} at ${where}`);
      }
      await fits(page.locator('.euc-menu--title .euc-credit'), viewport.height, `title credit at ${where}`);
      await unscrollable('.euc-menu--title', where);

      await page.locator('.euc-menu--title [data-menu="riders"]').click();
      for (const id of CHARACTER_IDS) {
        await fits(page.locator(`.euc-menu--riders [data-rider="${id}"]`), viewport.height, `card ${id} at ${where}`);
      }
      await fits(page.locator('.euc-menu--riders [data-menu="riders-back"]'), viewport.height,
        `chooser Done at ${where}`);
      await unscrollable('.euc-menu--riders', where);
      await page.keyboard.press('Escape');
      await page.locator('.euc-menu--title:not([hidden])').waitFor();
    }

    expect(errors).toEqual([]);
  });

  test('the title fits the window grid on a touch screen with no pad (FU2)', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
      'this context is not actually coarse-pointered').toBe(true);
    await sweepTitleGrid(page, [...TITLE_GRID, ...TITLE_GRID_NARROW], 'touch, no pad', () => false);
    expect(errors).toEqual([]);
  });
});

/**
 * **A touch screen with a pad is offered the couch — FU2.** The one machine
 * that puts the couch's ninth entrance on a title with the coarse floors: a
 * tablet or a touch laptop with a controller seen (`couchEligible`). It is
 * the tightest title at the notes' boundary (1000x641 clears by about 6 px),
 * and no project reached it. The fake pad is the m9 suite's, on the real
 * Gamepad API path.
 */
test.describe('a touch screen with a pad', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

  test('the title fits the window grid with the couch offered (FU2)', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const pad = {
        index: 0, id: 'fake standard pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      navigator.getGamepads = () => [pad] as never;
    });
    await bootToTitle(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
      'this context is not actually coarse-pointered').toBe(true);
    await sweepTitleGrid(page, TITLE_GRID, 'touch and a pad', (width) => width >= COUCH_MIN_WIDTH_PX);
    expect(errors).toEqual([]);
  });
});

/**
 * **The title over a grid of windows, not a list of devices — FU2,
 * 2026-09-23 (FU's residuals).**
 *
 * Every list above samples devices and the boundaries M29 derived, and the
 * stack's own need — about 880 px at a 34rem panel, more when narrower — was
 * not one of them: under the couch width a window between 800 and about
 * 880 px tall scrolled (768x801 by 62, 999x820 by 48, 900x850 by 18), and a
 * phone held sideways at 360 px tall by 10. So this walks 768–1999 × 600–900
 * across every tier boundary in it (640/641 for the notes, 800/801 for the
 * compact tier, the couch's 999/1000) on each machine that reaches a
 * different tier, plus the stack band and short windows under 768 on the
 * machines that have them. At each: nothing to scroll, every title control and
 * the credit inside the viewport, and every button's words inside its own text
 * box. The couch offer is asserted too, so a grid walked on the wrong machine
 * fails rather than measuring the other layout.
 */
const TITLE_GRID: readonly { width: number; height: number }[] = [768, 834, 900, 999, 1000, 1280, 1600, 1999]
  .flatMap((width) => [600, 640, 641, 700, 800, 801, 820, 850, 880, 900].map((height) => ({ width, height })));
/** Under 768: the stack's band (widths a desktop window reaches) and short windows. */
const TITLE_GRID_NARROW: readonly { width: number; height: number }[] = [
  { width: 500, height: 801 }, { width: 600, height: 801 }, { width: 700, height: 820 },
  { width: 767, height: 850 }, { width: 600, height: 900 },
  { width: 640, height: 360 }, { width: 740, height: 360 }, { width: 667, height: 375 },
];

test('the title fits every window from 768 to 1999 wide and 600 to 900 tall (FU2)', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);
  await sweepTitleGrid(page, [...TITLE_GRID, ...TITLE_GRID_NARROW], 'fine pointer',
    (width) => width >= COUCH_MIN_WIDTH_PX);
  expect(errors).toEqual([]);
});

async function sweepTitleGrid(
  page: Page,
  sizes: readonly { width: number; height: number }[],
  machine: string,
  couchAt: (width: number) => boolean,
): Promise<void> {
  for (const size of sizes) {
    await page.setViewportSize(size);
    const where = `${size.width}x${size.height} (${machine})`;
    // The couch offer is re-derived from the canvas's width on the next frame.
    await expect.poll(() => page.evaluate(() => window.game.snapshot().couch.available),
      { message: `the couch offer at ${where}` }).toBe(couchAt(size.width));
    await page.evaluate(() => new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
    }));
    const facts = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.euc-menu--title')!;
      const seen = (node: Element): boolean => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility === 'visible'
          && box.width > 1 && box.height > 1 && style.clipPath === 'none';
      };
      const outside: string[] = [];
      for (const node of root.querySelectorAll<HTMLElement>('[data-menu], .euc-credit')) {
        if (node.offsetParent === null) continue;
        const box = node.getBoundingClientRect();
        if (box.top < -0.5 || box.bottom > innerHeight + 0.5) outside.push(node.dataset.menu ?? 'credit');
      }
      const spills: string[] = [];
      for (const button of root.querySelectorAll<HTMLElement>('.euc-menu__actions button')) {
        if (button.offsetParent === null) continue;
        const style = getComputedStyle(button);
        const box = button.getBoundingClientRect();
        const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
        for (const piece of button.querySelectorAll(
          '.euc-button__label, .euc-button__note, .euc-ultra__state, .euc-ultra__warn',
        )) {
          if (!seen(piece)) continue;
          const range = document.createRange();
          range.selectNodeContents(piece);
          for (const rect of range.getClientRects()) {
            const past = Math.max(left - rect.left, rect.right - right);
            if (rect.width > 0 && past > 0.5) {
              spills.push(`${button.dataset.menu} "${piece.textContent?.trim()}" by ${past.toFixed(1)}px`);
            }
          }
        }
      }
      return { overflow: root.scrollHeight - root.clientHeight, outside, spills };
    });
    expect(facts.overflow, `the title has ${facts.overflow}px to scroll at ${where}`).toBeLessThanOrEqual(1);
    expect(facts.outside, `title controls outside the viewport at ${where}`).toEqual([]);
    expect(facts.spills, `words outside their button at ${where}`).toEqual([]);
  }
}
