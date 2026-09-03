/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { CHASE } from '../src/data/tuning.ts';

/**
 * M24 — three items from the 2026-08-22 triage review, in a real browser.
 *
 * 1. **Touch the cop = Busted** (Dario's publicly promised rule). The referee's
 *    attribution matrix is headless (`simulation/chase.test.ts`); what only a
 *    browser can prove is the whole journey — a real rider reversing into a
 *    real cop on a generated route ends on the Busted card with the touch's
 *    own note, and the cop's own arrival at strike range scores nothing.
 *
 * 2. **Controller submenu navigation** (§4.6, the owner's report). The row
 *    arithmetic is headless (`ui/menuRows.test.ts`); what only a browser can
 *    prove is the fix against the real panels through the real pad path: the
 *    rider chooser walks as the grid the player sees (the pre-M24 walk jammed
 *    on the SVG `<image>` in a card portrait and could never reach Done), and
 *    confirm operates the dropdowns the report named.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** The m9 suite's fake standard pad, verbatim — the real Gamepad API path. */
async function bootWithPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'fake standard pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { fakePad: typeof pad }).fakePad = pad;
    navigator.getGamepads = () => [pad] as never;
  });
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
}

const pulse = async (page: Page, button: number): Promise<void> =>
  page.evaluate(async (index) => {
    const pad = (window as unknown as { fakePad: {
      buttons: { pressed: boolean; value: number }[];
    } }).fakePad;
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[index].pressed = true;
    pad.buttons[index].value = 1;
    await frame();
    pad.buttons[index].pressed = false;
    pad.buttons[index].value = 0;
    await frame();
  }, button);

const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;
const CONFIRM = 0;

/** The m18 suite's pinned dense seed, so the cop has a real route. */
const SEED = 'route-41';

/** Boot straight onto a generated route and start a chase through the bridge. */
async function bootChase(
  page: import('@playwright/test').Page,
  extraQuery = '',
): Promise<void> {
  await bootToTitle(page, `level=generated&seed=${SEED}${extraQuery}`);
  await page.evaluate(() => {
    window.game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  await page.waitForFunction(() => window.game.snapshot().hud.chase !== '');
}

/**
 * Ram Officer Dorkins head-on and report which way the run ended.
 *
 * Dario's own shape: he rode *into* the officer and passed through, which is
 * what prompted the promise. The cop spawns 20 m behind, so full reverse charges
 * straight at him along the road while he closes.
 */
async function ramTheCop(page: Page): Promise<{
  failed?: string;
  outcome?: string;
  phase?: string;
  contactGap?: number;
  state?: string;
  crashed?: boolean;
  crashCause?: string;
  tail?: string;
}> {
  return page.evaluate(({ touchReach }) => {
    const game = window.game;
    game.clearActions();

    // The ram, in Dario's own shape: he rode *into* the officer and passed
    // through, which is what prompted the promise. The cop spawns 20 m
    // behind, so full reverse charges straight at him along the road while he
    // closes.
    game.setActions({ throttle: -1 });
    const trace: number[] = [];
    for (let chunk = 0; chunk < 120; chunk += 1) {
      game.advance(5);
      const snapshot = game.snapshot();
      trace.push(Math.round(snapshot.chase.copGap * 100) / 100);
      if (snapshot.chase.phase === 'busted' || snapshot.app.state === 'results') {
        return {
          outcome: snapshot.chase.outcome,
          phase: snapshot.chase.phase,
          contactGap: Math.min(...trace),
          state: snapshot.app.state,
          crashed: snapshot.euc.crashed,
          crashCause: snapshot.euc.crashCause,
          tail: trace.slice(-8).join(','),
        };
      }
    }
    return {
      failed: `no bust: gaps ${trace.filter((_, i) => i % 12 === 0).join(', ')} against ${touchReach} m`,
    };
  }, { touchReach: CHASE.touchBustMetres });
}

test('touching the cop busts the rider, and the cop closing scores nothing', async ({ page }) => {
  const errors = collectErrors(page);
  /*
   * **The fixture holds the cop's paddle off, and since 2026-08-27 it has to.**
   *
   * `?wobble=0` is M13's sanctioned diagnostic silencer and used to be enough:
   * the cop's led swing lands during any frontal ram, and with the oscillator
   * off his body knock could not fell this scripted rider, so the *touch* ended
   * the run deterministically. The owner's ride made every landed strike a
   * knockdown (`PADDLE.hardKnockShare`, §26.4), and a knockdown is a crash
   * rather than a wobble — so the silencer stopped silencing the thing that
   * matters and his paddle now usually gets there first.
   *
   * Winding the share to the top of its slider restores exactly what `wobble=0`
   * used to buy, and it is the same fixture decision `m26.spec.ts` makes for the
   * cop's stand-off: this spec is about **the touch bust** — its radius, its
   * outcome and its card — not about what his paddle does on the way. The
   * second test below is the one that says what the shipped game does to a
   * rider who rams him.
   */
  await bootChase(page, '&wobble=0');
  await page.evaluate(() => window.game.tuning.set('PADDLE.hardKnockShare', 3));

  const result = await ramTheCop(page);

  expect(result.failed, result.failed ?? '').toBeUndefined();
  expect(result.outcome, JSON.stringify(result)).toBe('touched');

  // The card, with the touch's own sentence on it — the player is told what
  // ended the run, not just that it ended.
  await expect(page.locator('.euc-menu--results')).toBeVisible();
  await expect(page.locator('.euc-menu--results')).toContainText('Busted');
  await expect(page.locator('.euc-menu--results')).toContainText('touched Officer Dorkins');
  expect(errors).toEqual([]);
});

test('riding into the cop ends the run on the values the game ships', async ({ page }) => {
  /*
   * **The promise, without the fixture** — and it is a public one: Dario asked
   * that *"the police should arrest you if you touch the police officer"*, and
   * M24 shipped it. What a player owes that promise is that riding into him ends
   * the run and they are told they were busted.
   *
   * **Which of the two endings closes it is deliberately not asserted.** On the
   * shipped values his paddle usually gets there first, because every landed
   * strike is a knockdown since 2026-08-27 and §26.4 priced exactly this: his
   * one-touch ending moves from 1.1 m to about 1.75 m. A crash beside him is a
   * bust (`caught`) and a body-to-body arrival is a bust (`touched`); the run
   * ends either way and the card says Busted either way. Pinning the label here
   * would be pinning a race — which is what the test above exists to avoid, by
   * removing the race instead of by tolerating it.
   */
  const errors = collectErrors(page);
  await bootChase(page);

  const result = await ramTheCop(page);

  expect(result.failed, result.failed ?? '').toBeUndefined();
  expect(result.phase, JSON.stringify(result)).toBe('busted');
  expect(['touched', 'caught'], JSON.stringify(result)).toContain(result.outcome);
  await expect(page.locator('.euc-menu--results')).toBeVisible();
  await expect(page.locator('.euc-menu--results')).toContainText('Busted');
  expect(errors).toEqual([]);
});

test('the cop’s own arrival at a standing rider is never read as a touch', async ({ page }) => {
  // The design guard, live and on shipped values: every metre of closing here
  // is the cop's, including his overshoot right through touch range, so if
  // the run ever ends `touched` the plumbing has handed him a way to score by
  // ramming. What he *may* do to a standing rider is exactly what M18 always
  // let him do — strike, knock, and catch — so the run is allowed to end
  // `caught`, and this spec outlives any rebalance of how quickly that
  // happens.
  const errors = collectErrors(page);
  await bootChase(page);

  const result = await page.evaluate(() => {
    const game = window.game;
    game.clearActions();
    for (let chunk = 0; chunk < 120; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      if (snapshot.chase.phase !== 'running') {
        return { ended: true, outcome: snapshot.chase.outcome, gap: snapshot.chase.copGap };
      }
    }
    return { ended: false, outcome: game.snapshot().chase.outcome, gap: game.snapshot().chase.copGap };
  });

  expect(result.outcome, JSON.stringify(result)).not.toBe('touched');
  expect(errors).toEqual([]);
});

// -- Item 2: controller submenu navigation (§4.6) -----------------------------

test('a pad drives the rider chooser as the grid the player sees', async ({ page }) => {
  const errors = collectErrors(page);
  await bootWithPad(page);
  await page.evaluate(() => window.game.setAppState('riderSelect'));
  // Entry focuses the riding character's card — the M22 chooser behaviour.
  await expect(page.locator('[data-rider]:focus')).toHaveCount(1);

  // Right moves along the card row, and confirm picks the focused card
  // without leaving the screen — the §4.6 "doesn't accept action button"
  // half, disproved through the real pad path.
  await pulse(page, DPAD.right);
  const picked = await page.evaluate(
    () => (document.activeElement as HTMLElement).dataset.rider ?? '',
  );
  expect(picked).not.toBe('');
  await pulse(page, CONFIRM);
  await expect(page.locator(`[data-rider="${picked}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.game.snapshot().options.character)).toBe(picked);
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('riderSelect');

  // Down moves to the card *below* — the row walk — and the walk reaches
  // Done. Before M24 this exact journey jammed: the bare `[href]` clause in
  // the focus census matched the SVG `<image>` inside a card portrait, focus
  // silently refused to move onto it, and Done was unreachable from the last
  // card forever.
  const columnBefore = await page.evaluate(
    () => (document.activeElement as HTMLElement).getBoundingClientRect().left,
  );
  await pulse(page, DPAD.down);
  const below = await page.evaluate(() => {
    const active = document.activeElement as HTMLElement;
    return { rider: active.dataset.rider ?? active.dataset.menu ?? '', left: active.getBoundingClientRect().left };
  });
  expect(Math.abs(below.left - columnBefore)).toBeLessThan(2);
  // And keeps walking down until Done — however many rows the roster makes at
  // this width. A bounded walk rather than "one more press" since M29 Phase
  // 0: seven cards at 1000×700 are three columns in rows of 3, 3 and 1, and
  // from the second row's middle card a press of down lands on the ragged
  // last row's nearest card (`ui/menuRows.ts`' rule), not on Done. The bound
  // is the roster — more presses than cards means the walk is jammed, which
  // is the M24 defect this paragraph exists to pin.
  const cardCount = await page.locator('[data-rider]').count();
  let presses = 0;
  while (!(await page.locator('[data-menu="riders-back"]').evaluate((el) => el === document.activeElement))) {
    expect(presses, 'down never reached Done').toBeLessThan(cardCount);
    await pulse(page, DPAD.down);
    presses += 1;
  }
  await expect(page.locator('[data-menu="riders-back"]')).toBeFocused();

  // The regression pin at the jam site itself: from the roster's *last* card,
  // one press of down must land on Done.
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-rider]')];
    cards[cards.length - 1].focus();
  });
  await pulse(page, DPAD.down);
  await expect(page.locator('[data-menu="riders-back"]')).toBeFocused();

  // And confirm on Done leaves the chooser, exactly as a click does.
  await pulse(page, CONFIRM);
  await expect.poll(() => page.evaluate(() => window.game.snapshot().app.state)).toBe('title');
  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

test('a pad operates the settings dropdowns, and binding rows are one stop each', async ({ page }) => {
  const errors = collectErrors(page);
  await bootWithPad(page);
  await page.evaluate(() => window.game.setAppState('settings'));
  await expect(page.locator('[data-option="quality"]')).toBeFocused();

  // Confirm cycles the focused select — the §4.6 report's named controls,
  // graphics quality and the mph/km-h dropdown, were exactly the ones a
  // pad's A did nothing on, because `.click()` on a native select is a
  // no-op. A full lap of presses returns to the starting value, so the
  // cycle provably wraps rather than sticking at the last option.
  const qualityStart = await page.evaluate(() => window.game.snapshot().options.quality);
  await pulse(page, CONFIRM);
  const qualityNext = await page.evaluate(() => window.game.snapshot().options.quality);
  expect(qualityNext).not.toBe(qualityStart);
  const qualityCount = await page.evaluate(
    () => (document.querySelector('[data-option="quality"]') as HTMLSelectElement).options.length,
  );
  for (let press = 1; press < qualityCount; press += 1) await pulse(page, CONFIRM);
  expect(await page.evaluate(() => window.game.snapshot().options.quality)).toBe(qualityStart);

  // Down walks the Display rows to the speed-unit dropdown, and confirm
  // cycles it too.
  await pulse(page, DPAD.down);
  await pulse(page, DPAD.down);
  await expect(page.locator('[data-option="speedUnit"]')).toBeFocused();
  const unitStart = await page.evaluate(() => window.game.snapshot().options.speedUnit);
  await pulse(page, CONFIRM);
  expect(await page.evaluate(() => window.game.snapshot().options.speedUnit)).not.toBe(unitStart);

  // The key-binding rows: each is one down-stop (the pre-M24 walk visited
  // Change and Clear separately, doubling the trip through Controls), and the
  // Clear beside a Change is a right-press away, with the walk keeping the
  // column on the way down.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-binding-set="accelerate"]')?.focus();
  });
  await pulse(page, DPAD.down);
  await expect(page.locator('[data-binding-set="brake"]')).toBeFocused();
  await pulse(page, DPAD.right);
  await expect(page.locator('[data-binding-clear="brake"]')).toBeFocused();
  await pulse(page, DPAD.down);
  await expect(page.locator('[data-binding-clear="steerLeft"]')).toBeFocused();

  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

// -- Item 3: the 180° spin jump ----------------------------------------------

test('an air-tap of hop throws a 180 through the real input path', async ({ page }) => {
  // The move's whole matrix is headless (`EucController.test.ts`); what only
  // a browser can prove is the grammar through the real one-shot latch — a
  // second hop press, latched while airborne, must arrive at the controller
  // as its own rising edge and come back out of the QA bridge as one spin.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  const result = await page.evaluate(() => {
    const game = window.game;
    game.clearActions();
    const before = game.snapshot().euc.headingY;

    game.setActions({ hop: true });
    let guard = 0;
    while (game.snapshot().euc.grounded && (guard += 1) < 200) game.advance(5);
    if (game.snapshot().euc.grounded) return { failed: 'the hop never left the ground' };

    game.setActions({ hop: true });
    guard = 0;
    while (!game.snapshot().euc.grounded && (guard += 1) < 400) game.advance(5);
    const euc = game.snapshot().euc;
    return {
      spins: euc.spins,
      turned: euc.headingY - before,
      crashed: euc.crashed,
      landing: euc.landingQuality,
    };
  });

  expect(result.failed, result.failed ?? '').toBeUndefined();
  expect(result.spins).toBe(1);
  expect(Math.abs((result.turned ?? 0) - Math.PI)).toBeLessThan(0.15);
  expect(result.crashed).toBe(false);
  expect(result.landing).toBe('clean');
  expect(errors).toEqual([]);
});
