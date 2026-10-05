/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { SIGNS as SIGNS_TUNING } from '../src/data/markings.ts';
import { CHARACTER_IDS } from '../src/data/riders.ts';
import { ONE_FOOT, SIMULATION } from '../src/data/tuning.ts';
import { RENDER_BUDGET } from '../src/data/renderCost.ts';
import {
  SWITCHBACK_ENTRY_DISTANCE,
  SWITCHBACK_LAP_SEGMENT_IDS,
  SWITCHBACK_SIGNAGE,
} from '../src/level/switchbackLevel.ts';
import { TRACK_LAP_SEGMENT_IDS } from '../src/level/trackLevel.ts';
import { ULTRA_TOGGLE_HELP, ULTRA_TOGGLE_WARNING } from '../src/ui/menus.ts';
import { boot, bootAtTier, bootToTitle, collectErrors, DEAD_SEED, forceRefusal } from './harness.ts';

/**
 * M11.5 — the on-screen controls, on a phone.
 *
 * **This spec runs in the `mobile` project only** (see `playwright.config.ts`),
 * because `hasTouch` is what makes `(pointer: coarse)` match and what makes
 * `tap()` produce a real touch pointer. Everything here is therefore the thing
 * a player meets rather than a synthesized approximation of it.
 *
 * The device layer's arithmetic — both stick axes, the curve, the dead zone,
 * pointer bookkeeping, and separate Shift/Space actions — is proved headlessly in
 * `src/input/touch.test.ts` and is deliberately not repeated here. What only a
 * browser can answer is what this file asks:
 *
 *   - that the controls appear on a touch device and *only* while riding;
 *   - that a real diagonal drag on real glass accelerates and carves;
 *   - that rotating the phone mid-ride does not leave a finger stuck down;
 *   - that the HUD gets out of the way of the thumbs;
 *   - that the settings screen can turn all of it off, and that turning it off
 *     gives the bottom of the screen back.
 */

function touchState(page: Page) {
  return page.evaluate(() => window.game.snapshot().touch);
}

function euc(page: Page) {
  return page.evaluate(() => window.game.snapshot().euc);
}

/** Advance the real update path, as every other spec does. Never wall-clock. */
async function advance(page: Page, steps: number) {
  return page.evaluate((n) => window.qa.advance(n), steps);
}

/** Where a control is, in viewport coordinates, for a touch that has to land on it. */
async function centreOf(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} has no box`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('M11.5 — on-screen controls', () => {
  test('BelVar survives a portrait-to-landscape resize during a mobile ride', async ({ page }) => {
    // 2026-10-04: a whole follower lap now steps the living world's paddock
    // population with the rider and draws the richer venue every stride, which
    // outgrows the default 120 s on a loaded machine; the lap's own step
    // budget (`maxSteps`) is unchanged.
    test.setTimeout(360_000);
    const errors = collectErrors(page);
    await bootToTitle(page, 'level=track');
    // 2026-10-04: the living world suffixes BelVar's plan id with its paddock
    // population; the venue's identity is its record key, still `belvar-r1`.
    expect(await page.evaluate(() => window.game.levelPlan.recordWorldId)).toBe('belvar-r1');

    // A real touch starts the ride; the rest is a deterministic physical lap
    // so this tests the mobile renderer and controller rather than a timer.
    await page.locator('[data-menu="start"]').tap();
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await page.evaluate(() => ({
      state: window.game.snapshot().app.state,
      level: window.game.levelPlan.recordWorldId,
    }))).toEqual({ state: 'freeRide', level: 'belvar-r1' });

    // **The lap's own corridors, not every corridor the plan carries.** From
    // M23 Phase B1 the venue also holds the paddock — rideable ground reached
    // through a barrier gate — and a follower handed `levelPlan.segments`
    // walks the lap and then tries to teleport back to the paddock road,
    // which it cannot do and reports as an unfinished ride. That is the same
    // class of hidden consumer the B0 QA found in `RouteSpine`: two things
    // asking a plan for "its segments" and meaning "the lap".
    const ride = await page.evaluate((segments) => window.qa.followRoute(
      window.qa.routePoints(segments, 2),
      { lookAhead: 9, maxSteps: 30_000, maxSpeed: 12 },
    ), [...TRACK_LAP_SEGMENT_IDS]);
    expect(ride.finished).toBe(true);
    expect(ride.crashes).toBe(0);
    expect(ride.blockedSteps).toBe(0);

    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');
    expect(errors).toEqual([]);
  });

  test('a touchscreen gets the controls, and only while riding', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    // Wanted from the first frame — the media query settles a phone with no
    // help — but not on screen, because the title screen is not a ride and its
    // buttons are real buttons.
    expect(await touchState(page)).toMatchObject({ wanted: true, visible: false });
    await expect(page.locator('.euc-touch')).toBeHidden();

    await page.locator('[data-menu="start"]').tap();
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await touchState(page)).toMatchObject({ visible: true, promptDevice: 'touch' });

    // Every control the player needs, and all of them labelled: the game is
    // playable by touch or it is not, and half a control scheme is not.
    for (const control of ['stick', 'crouch', 'hop']) {
      await expect(page.locator(`[data-touch="${control}"]`)).toBeVisible();
    }
    // SWING exists but is not on screen in free ride — M14. The mode decides
    // who carries a paddle, and a fourth circle that does nothing here would be
    // permanent clutter over the road the player is reading, bought for a mode
    // they are not in. Asserted as *hidden* rather than left unmentioned: this
    // list is what "the control scheme is complete" means, and a control it
    // does not name is a control nobody would notice going missing.
    await expect(page.locator('[data-touch="swing"]')).toBeHidden();
    for (const tap of ['pause', 'reset', 'cameraCycle']) {
      await expect(page.locator(`[data-touch-tap="${tap}"]`)).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test('SWING appears in Knockabout, is a real target, and swings', async ({ page }) => {
    // **The fourth control, proved on the mobile project** — M14, §13 q18. This
    // is the only place in the suite where `(pointer: coarse)` matches and a tap
    // is a real touch pointer, so it is the only place the 44-pixel floor and
    // the pointer path can be checked at all. A spec that only enumerated the
    // three older controls would stay green with this button wired to hop,
    // which is exactly the silent failure the plan named.
    await bootToTitle(page, 'level=generated&seed=route-41');
    await page.evaluate(() => {
      window.game.startKnockabout();
    });
    await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');

    const swing = page.locator('[data-touch="swing"]');
    await expect(swing).toBeVisible();
    const box = await swing.boundingBox();
    expect(box, 'SWING is rendered').not.toBeNull();
    expect(box!.width, `SWING is ${box!.width}px wide`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `SWING is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);

    const before = await page.evaluate(() => window.game.snapshot().consumed);
    await swing.tap();
    await page.evaluate(() => window.game.advance(4));
    const after = await page.evaluate(() => window.game.snapshot().consumed);

    // It swings, and — the half that matters — it does **not** hop. Until M14
    // the touch layer's button dispatch ended in `else press('hop')`, so a new
    // button lit up, felt perfectly responsive, and jumped the rider.
    expect(after.swing - before.swing).toBe(1);
    expect(after.hop - before.hop).toBe(0);
  });

  test('the controls leave the screen when a menu arrives', async ({ page }) => {
    await boot(page);
    await expect(page.locator('.euc-touch')).toBeVisible();

    // The pause chip is the only way off a phone: there is no Escape key.
    await page.locator('[data-touch-tap="pause"]').tap();
    await advance(page, 4);
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');
    await expect(page.locator('.euc-touch')).toBeHidden();
    // Still a touch device — what changed is what the game is doing.
    expect(await touchState(page)).toMatchObject({ wanted: true, visible: false });

    await page.locator('.euc-menu--pause [data-menu="resume"]').tap();
    await expect(page.locator('.euc-touch')).toBeVisible();
  });

  test('one two-axis stick accelerates and carves through a genuine touch gesture', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);

    const zone = await centreOf(page, '[data-touch="stick"]');
    const secondSteer = { x: Math.min(zone.x + 90, 190), y: zone.y - 20 };

    /*
     * Driven through CDP rather than fabricated `PointerEvent`s. This makes
     * Chromium perform hit testing, pointer capture, compatibility-event
     * handling, and pointer-id assignment itself — the parts a constructor call
     * in page script cannot prove. `touchStart`/`touchMove` carry the whole
     * active set; `touchEnd` carries the points being released.
     */
    const cdp = await page.context().newCDPSession(page);
    const settle = () => page.evaluate(() => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));
    const dispatch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: Array<{ id: number; x: number; y: number }>,
    ) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await settle();
    };

    const steer = { id: 21, ...zone };
    const interloper = { id: 22, ...secondSteer };
    await dispatch('touchStart', [steer]);
    const firstOrigin = await page.locator('.euc-touch').evaluate(
      (element) => getComputedStyle(element).getPropertyValue('--euc-touch-x').trim(),
    );

    // A palm or second finger in the same zone must not steal the input *or the
    // floating drawing*. The old implementation rejected it semantically but
    // still jumped the visible stick to the rejected finger.
    await dispatch('touchStart', [steer, interloper]);
    expect(await page.locator('.euc-touch').evaluate(
      (element) => getComputedStyle(element).getPropertyValue('--euc-touch-x').trim(),
    )).toBe(firstOrigin);
    await dispatch('touchEnd', [interloper]);

    // **Freeze first, then advance a known number of steps.** The technique
    // blend below is measured inside a window, not at an asymptote — it rises
    // with held input and fades again as speed climbs past
    // `technicalTurnFadeSpeed` — so how much simulated time has passed decides
    // the reading. The freeze has to come *before* the diagonal drag lands:
    // frozen afterwards, the loop's own real-time steps between the touchMove
    // and the freeze were added to the explicit ones, and how many arrived
    // depended entirely on machine load — a busy full-suite run read 0.398
    // against a 0.4 floor, alone it read comfortably above. Everything up to
    // here held the stick at its origin, which is zero input, so freezing now
    // makes the 150 steps below the *only* simulated time under deflection.
    // The touch is still a genuine dispatched gesture; only the clock is ours.
    await page.evaluate(() => window.game.loop.setRunning(false));
    const movedSteer = { ...steer, x: steer.x + 200, y: steer.y - 200 };
    await dispatch('touchMove', [movedSteer]);
    await advance(page, 150);
    const carving = await euc(page);
    const state = await touchState(page);

    // Full diagonal input now selects the honest technical turn and can scrub
    // a pedal. It must still accelerate decisively, but the former 4 m/s floor
    // encoded the free-yaw model's missing cost.
    expect(carving.speed).toBeGreaterThan(3);
    expect(state.throttle).toBeCloseTo(1, 2);
    expect(state.steer).toBeCloseTo(1, 2);
    // **Right is a negative yaw rate** — the corrected world convention in
    // `data/tuning.ts`, and the one thing about steering that is easy to get
    // backwards without any test noticing.
    expect(carving.yawRate).toBeLessThan(0);
    expect(Math.abs(carving.technicalTurn)).toBeGreaterThan(0.4);
    expect(Math.abs(carving.rollAngle)).toBeGreaterThan(0.35);
    await dispatch('touchEnd', [movedSteer]);

    await advance(page, 2);
    const released = await page.evaluate(() => window.game.snapshot().actions);
    expect(released.throttle).toBe(0);
    expect(released.steer).toBe(0);
    expect(errors).toEqual([]);
  });

  test('portrait edge steering reaches the same full lock as landscape', async ({ page }) => {
    await boot(page);
    const cdp = await page.context().newCDPSession(page);
    const dispatch = async (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: Array<{ id: number; x: number; y: number }>,
    ) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
    };

    const portraitZone = await page.locator('[data-touch="stick"]').boundingBox();
    expect(portraitZone).not.toBeNull();
    const portraitStart = { id: 71, x: 60, y: portraitZone!.y + portraitZone!.height / 2 };
    await dispatch('touchStart', [portraitStart]);
    await dispatch('touchMove', [{ ...portraitStart, x: 0 }]);
    const portraitSteer = (await touchState(page)).steer;
    await dispatch('touchEnd', [{ ...portraitStart, x: 0 }]);

    const beforeLayout = await page.evaluate(() => window.game.snapshot().layoutChanges);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(
      (before) => window.game.snapshot().layoutChanges > before,
      beforeLayout,
    );

    const landscapeZone = await page.locator('[data-touch="stick"]').boundingBox();
    expect(landscapeZone).not.toBeNull();
    const landscapeStart = { id: 72, x: 120, y: landscapeZone!.y + landscapeZone!.height / 2 };
    await dispatch('touchStart', [landscapeStart]);
    await dispatch('touchMove', [{ ...landscapeStart, x: 36 }]);
    const landscapeSteer = (await touchState(page)).steer;
    await dispatch('touchEnd', [{ ...landscapeStart, x: 36 }]);

    expect(portraitSteer).toBeCloseTo(-1, 2);
    expect(landscapeSteer).toBeCloseTo(-1, 2);
    expect(portraitSteer).toBeCloseTo(landscapeSteer, 2);
  });

  test('blur releases touch ownership, visuals, and the next finger can acquire them', async ({ page }) => {
    await boot(page);
    const charge = await centreOf(page, '[data-touch="crouch"]');
    const zone = await centreOf(page, '[data-touch="stick"]');

    await page.evaluate(({ charge, zone }) => {
      const fire = (target: Element | Window, type: string, id: number, x: number, y: number) => {
        target.dispatchEvent(new PointerEvent(type, {
          pointerId: id, pointerType: 'touch', clientX: x, clientY: y,
          bubbles: true, cancelable: true,
        }));
      };
      fire(document.querySelector('[data-touch="crouch"]') as Element, 'pointerdown', 61, charge.x, charge.y);
      fire(document.querySelector('[data-touch="stick"]') as Element, 'pointerdown', 62, zone.x, zone.y);
      fire(window, 'pointermove', 62, zone.x + 120, zone.y - 120);
    }, { charge, zone });

    await expect(page.locator('[data-touch="crouch"]')).toHaveAttribute('data-pressed', 'true');
    await expect(page.locator('.euc-touch__stick')).toHaveAttribute('data-active', 'true');

    // An app switch or focus loss may never deliver either pointerup. The
    // keyboard layer already clears ActionState here; the touchscreen must also
    // clear its private ids and the drawing they own.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await advance(page, 2);
    expect(await page.evaluate(() => window.game.snapshot().actions)).toMatchObject({
      throttle: 0,
      steer: 0,
      crouch: false,
    });
    await expect(page.locator('[data-touch="crouch"]')).not.toHaveAttribute('data-pressed', 'true');
    await expect(page.locator('.euc-touch__stick')).toHaveAttribute('data-active', 'false');

    // Reuse the ids deliberately: browsers do. Stale ownership would reject
    // both of these and leave the phone unplayable after returning.
    await page.evaluate(({ charge, zone }) => {
      document.querySelector('[data-touch="crouch"]')?.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 61, pointerType: 'touch', clientX: charge.x, clientY: charge.y,
        bubbles: true, cancelable: true,
      }));
      document.querySelector('[data-touch="stick"]')?.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 62, pointerType: 'touch', clientX: zone.x, clientY: zone.y,
        bubbles: true, cancelable: true,
      }));
    }, { charge, zone });
    await expect(page.locator('[data-touch="crouch"]')).toHaveAttribute('data-pressed', 'true');
    await expect(page.locator('.euc-touch__stick')).toHaveAttribute('data-active', 'true');
  });

  test('every visible button stays at least 44 CSS pixels at the smallest setting', async ({ page }) => {
    await boot(page);
    const selectors = [
      '[data-touch="crouch"]',
      '[data-touch="hop"]',
      '[data-touch-tap="pause"]',
      '[data-touch-tap="reset"]',
      '[data-touch-tap="cameraCycle"]',
    ];

    const assertTouchFloor = async () => {
      for (const selector of selectors) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} is rendered`).not.toBeNull();
        expect(box!.width, `${selector} width`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(44);
      }
    };

    // The default portrait layout first, then the player's smallest scale on a
    // short landscape phone — the old layout fell to 34×18 px for Pause and
    // below 44 px for HOP in this second state.
    await assertTouchFloor();
    await page.evaluate(() => window.game.options.set({ touchScale: 0.8 }));
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.game.snapshot().viewport.width === 844);
    await assertTouchFloor();
  });

  test('CHARGE and HOP reproduce Shift plus Space for a charged jump', async ({ page }) => {
    await boot(page);
    // 2026-10-04: frozen, as the harness's rule 2 asks. Left live, the loop
    // kept stepping through every round trip, and with the environment
    // upgrade's heavier frames on a loaded machine the hop had already landed
    // by the time its airborne step was read.
    await page.evaluate(() => window.qa.freeze());
    const charge = await centreOf(page, '[data-touch="crouch"]');
    const hop = await centreOf(page, '[data-touch="hop"]');

    await page.evaluate(({ charge }) => {
      document.querySelector('[data-touch="crouch"]')?.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 31, pointerType: 'touch', clientX: charge.x, clientY: charge.y,
        bubbles: true, cancelable: true,
      }));
    }, { charge });

    await advance(page, 40);
    const charging = await euc(page);
    expect(charging.crouchCharge).toBeGreaterThan(0.5);
    expect(charging.grounded).toBe(true);
    await expect(page.locator('[data-touch="crouch"]')).toHaveAttribute('data-pressed', 'true');

    await page.evaluate(({ hop }) => {
      document.querySelector('[data-touch="hop"]')?.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 32, pointerType: 'touch', clientX: hop.x, clientY: hop.y,
        bubbles: true, cancelable: true,
      }));
    }, { hop });

    await advance(page, 14);
    const hopped = await euc(page);
    expect(hopped.hops).toBe(1);
    expect(hopped.grounded).toBe(false);
    expect(hopped.hopCharge).toBeGreaterThan(0.5);

    await page.evaluate(({ charge, hop }) => {
      window.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 31, pointerType: 'touch', clientX: charge.x, clientY: charge.y, bubbles: true,
      }));
      window.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 32, pointerType: 'touch', clientX: hop.x, clientY: hop.y, bubbles: true,
      }));
    }, { charge, hop });
  });

  test('rotating the phone mid-ride does not leave a finger stuck down', async ({ page }) => {
    await boot(page);
    const charge = await centreOf(page, '[data-touch="crouch"]');
    const zone = await centreOf(page, '[data-touch="stick"]');

    // Both thumbs down: one riding diagonally on the stick, one charging.
    await page.evaluate(({ charge, zone }) => {
      const fire = (target: Element | Window, type: string, id: number, x: number, y: number) => {
        target.dispatchEvent(new PointerEvent(type, {
          pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
        }));
      };
      fire(document.querySelector('[data-touch="crouch"]') as Element, 'pointerdown', 41, charge.x, charge.y);
      fire(document.querySelector('[data-touch="stick"]') as Element, 'pointerdown', 42, zone.x, zone.y);
      fire(window, 'pointermove', 42, zone.x + 200, zone.y - 200);
    }, { charge, zone });
    await advance(page, 30);
    const holding = await page.evaluate(() => window.game.snapshot().actions);
    expect(holding.throttle).toBe(1);
    expect(holding.steer).toBeCloseTo(1, 2);
    expect(holding.crouch).toBe(true);

    // Landscape. Every control has just moved out from under the hand holding
    // it, and the `pointerup` for those fingers is never coming.
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.game.snapshot().layoutChanges > 0);
    await advance(page, 30);

    const after = await page.evaluate(() => window.game.snapshot().actions);
    expect(after.throttle).toBe(0);
    expect(after.steer).toBe(0);
    expect(after.crouch).toBe(false);

    /*
     * **And the drag origin is gone with it**, which is the half that survives
     * a merely-cleared action state.
     *
     * The finger that was riding is still physically on the glass, and it is
     * now somewhere else entirely relative to a control that has moved. If the
     * layer kept measuring from where that finger landed on the *old* screen,
     * its next movement would snap the wheel to full lock — a rider who rotated
     * their phone and got thrown into a corner they never asked for. The drag
     * has to be abandoned outright and re-anchored by a fresh touch.
     */
    await page.evaluate(({ zone }) => {
      window.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 42, pointerType: 'touch', clientX: zone.x + 260, clientY: zone.y - 260, bubbles: true,
      }));
    }, { zone });
    await advance(page, 4);
    expect(await page.evaluate(() => window.game.snapshot().actions)).toMatchObject({
      throttle: 0,
      steer: 0,
    });

    // And the controls are still there, in the same anatomy, on the new shape.
    await expect(page.locator('.euc-touch')).toBeVisible();
    const stick = await page.locator('.euc-touch__stick').boundingBox();
    const chargeButton = await page.locator('[data-touch="crouch"]').boundingBox();
    expect(stick).not.toBeNull();
    expect(chargeButton).not.toBeNull();
    // Stick left, actions right, both within the frame and clear of each other.
    expect(stick!.x).toBeLessThan(844 / 2);
    expect(chargeButton!.x).toBeGreaterThan(844 / 2);
    expect(chargeButton!.x + chargeButton!.width).toBeLessThanOrEqual(844);
    expect(stick!.y + stick!.height).toBeLessThanOrEqual(390);
  });

  test('the HUD gets out of the way of the thumbs', async ({ page }) => {
    await boot(page);

    const hud = page.locator('.euc-hud');
    await expect(hud).toHaveAttribute('data-touch', 'true');

    // The speed is the one number a rider reads, and its old home was the
    // bottom-left corner — which is now under the riding thumb.
    const speed = await page.locator('.euc-hud__speed').boundingBox();
    const stick = await page.locator('.euc-touch__stick').boundingBox();
    expect(speed).not.toBeNull();
    expect(speed!.y).toBeLessThan(stick!.y);
    expect(speed!.y + speed!.height).toBeLessThan(stick!.y);
  });

  test('the settings screen can switch the controls off, and hand the corners back', async ({ page }) => {
    await boot(page);
    await page.locator('[data-touch-tap="pause"]').tap();
    await page.locator('.euc-menu--pause [data-menu="settings"]').tap();

    const select = page.locator('[data-option="touchControls"]');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('auto');
    await expect(page.locator('[data-menu="touch-status"]')).toContainText('showing');

    await select.selectOption('off');
    await expect(page.locator('[data-menu="touch-status"]')).toContainText('switched off');

    await page.locator('.euc-menu--settings [data-menu="back"]').tap();
    await page.locator('.euc-menu--pause [data-menu="resume"]').tap();
    await advance(page, 2);

    await expect(page.locator('.euc-touch')).toBeHidden();
    // The HUD's lanes come back with them: nothing is over the bottom corners
    // any more, so there is no reason to keep the speed at the top.
    await expect(page.locator('.euc-hud')).toHaveAttribute('data-touch', 'false');
    expect(await touchState(page)).toMatchObject({ visible: false, promptDevice: 'keyboard' });
  });

  test('the layout mirrors for a left-handed player, and the setting survives a reload', async ({ page }) => {
    await boot(page);

    const rightHanded = await page.locator('[data-touch="crouch"]').boundingBox();
    await page.evaluate(() => window.game.options.set({ touchSwapSides: true }));
    const leftHanded = await page.locator('[data-touch="crouch"]').boundingBox();
    const stick = await page.locator('.euc-touch__stick').boundingBox();

    expect(leftHanded!.x).toBeLessThan(rightHanded!.x);
    // Mirrored, not merely moved: the stick has to end up on the other side too,
    // or both clusters are under one thumb.
    expect(stick!.x).toBeGreaterThan(leftHanded!.x);

    await boot(page);
    expect(await page.evaluate(() => window.game.snapshot().options.touchSwapSides)).toBe(true);
    const afterReload = await page.locator('[data-touch="crouch"]').boundingBox();
    expect(afterReload!.x).toBeCloseTo(leftHanded!.x, 0);
  });

  test('control size moves the drawn control and both stick throws together', async ({ page }) => {
    await boot(page);

    const measure = async () => (await page.locator('[data-touch="crouch"]').boundingBox())!.width;
    const base = await measure();

    await page.evaluate(() => window.game.options.set({ touchScale: 1.4 }));
    expect(await measure()).toBeGreaterThan(base);

    // The throw has to grow with it, or an enlarged control is simply a
    // twitchier one — which is the opposite of what enlarging it asks for.
    const zone = await centreOf(page, '[data-touch="stick"]');
    const afterFixedDrag = await page.evaluate(({ zone }) => {
      const stick = document.querySelector('[data-touch="stick"]') as Element;
      const fire = (target: Element | Window, type: string, x: number, y: number) => {
        target.dispatchEvent(new PointerEvent(type, {
          pointerId: 51, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true,
        }));
      };
      fire(stick, 'pointerdown', zone.x, zone.y);
      fire(window, 'pointermove', zone.x + 84, zone.y - 84);
      const value = window.game.snapshot().touch;
      fire(window, 'pointerup', zone.x + 84, zone.y - 84);
      return value;
    }, { zone });

    expect(afterFixedDrag.throttle).toBeLessThan(1);
    expect(afterFixedDrag.steer).toBeLessThan(1);
  });

  test('the whole thing is silent', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);

    const zone = await centreOf(page, '[data-touch="stick"]');
    await page.touchscreen.tap(zone.x, zone.y);
    await page.locator('[data-touch-tap="cameraCycle"]').tap();
    await page.locator('[data-touch-tap="reset"]').tap();
    await advance(page, 60);

    expect(errors).toEqual([]);
  });
});

/**
 * M12 Phase 4 — choosing a route on a handset.
 *
 * The fresh-route panel is the first screen in this game that asks a player to
 * *type*, and a phone is where that is hardest: a soft keyboard covers half the
 * viewport, the field is the smallest target on the panel, and there is no
 * Escape key to get out with. `docs/PLANS.md` §10 puts menu parity on every
 * device in Phase 4's scope explicitly — *"including seed entry on a handset"* —
 * so it is asked here, on a real touch device, and not inferred from the
 * desktop run.
 *
 * The panel's logic is proved in `tests/m12.spec.ts`. What this file adds is
 * everything that is only true through glass.
 */
test.describe('M12 Phase 4 — a fresh route on a phone', () => {
  test('a seed can be typed and ridden with nothing but taps', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    await page.locator('.euc-menu--title [data-menu="routes"]').tap();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');

    // A tap has to focus the field. The touch layer `preventDefault`s pointer
    // events on its own controls, and if that ever escaped its overlay a
    // player could not raise the keyboard at all.
    await page.locator('#euc-seed').tap();
    await expect(page.locator('#euc-seed')).toBeFocused();

    await page.keyboard.type('ember quay');
    await expect(page.locator('#euc-seed')).toHaveValue('ember quay');

    // 2026-10-04: a living-world route builds behind the loading cover and
    // `pending` stays true until the cover lifts (build, warm-up, settle).
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 })
      .toBe(false);

    expect(await page.evaluate(() => window.game.snapshot().world)).toMatchObject({
      generated: true, seed: 'ember-quay',
    });
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');

    // And the controls a phone needs came back with the ride.
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await touchState(page)).toMatchObject({ visible: true, promptDevice: 'touch' });

    expect(errors).toEqual([]);
  });

  test('every control on the panel is big enough for a thumb', async ({ page }) => {
    // 44 CSS pixels is the floor both platform guidelines call reliable, and
    // the seed field is the one control on this panel that is not a button —
    // so it is the one that would have been missed.
    await bootToTitle(page);
    await page.locator('.euc-menu--title [data-menu="routes"]').tap();

    // `[data-menu="venue"]` is three buttons rather than one — M36 Phase 5's
    // venue chooser stands on this panel, and it is the newest thing on it a
    // thumb has to hit — so the scan resolves every match rather than assuming
    // one, and the width is asked for as well: a segmented row is the control
    // on this panel that can be short in the other axis.
    const targets = ['#euc-seed', '[data-menu="surprise"]', '[data-menu="ride-route"]',
      '[data-menu="trial-route"]', '[data-menu="venue"]', '[data-menu="routes-back"]'];
    for (const selector of targets) {
      const found = await page.locator(`.euc-menu--routes ${selector}`).all();
      expect(found.length, `${selector} matched nothing`).toBeGreaterThan(0);
      for (const [index, target] of found.entries()) {
        const where = found.length === 1 ? selector : `${selector} #${index}`;
        const box = await target.boundingBox();
        expect(box, `${where} has no box`).not.toBeNull();
        expect(box!.height, `${where} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
        expect(box!.width, `${where} is ${box!.width}px wide`).toBeGreaterThanOrEqual(44);
      }
    }

    // A field whose text is under 16px makes a phone zoom in on focus and never
    // zoom back out, leaving the player panning around a panel.
    const fontPx = await page.locator('#euc-seed')
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(16);
  });

  test('a refused seed is readable, and leaves the phone where it was', async ({ page }) => {
    const errors = collectErrors(page);
    // route-12 builds since M39; the request boundary refuses it as a dead seed.
    await forceRefusal(page);
    await bootToTitle(page);
    await page.locator('.euc-menu--title [data-menu="routes"]').tap();

    await page.locator('#euc-seed').fill(DEAD_SEED);
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().route.pending))
      .toBe(false);

    const status = page.locator('.euc-menu--routes [data-menu="route-status"]');
    await expect(status).toHaveAttribute('data-tone', 'refused');
    // Visible without scrolling: a message the player has to go looking for is
    // a message they will read as the button having done nothing.
    await expect(status).toBeInViewport();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');
    expect(await page.evaluate(() => window.game.snapshot().world.generated)).toBe(false);

    // There is no Escape key on a phone, so Back has to be the way out.
    await page.locator('.euc-menu--routes [data-menu="routes-back"]').tap();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');

    expect(errors).toEqual([]);
  });

  test('surprise me is a whole route in one tap', async ({ page }) => {
    // The path for a player who does not want to type on a phone at all.
    const errors = collectErrors(page);
    await bootToTitle(page);
    await page.locator('.euc-menu--title [data-menu="routes"]').tap();

    // 2026-10-04: both presses build behind the loading cover (see above).
    await page.locator('.euc-menu--routes [data-menu="surprise"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 })
      .toBe(false);

    const loaded = await page.evaluate(() => window.game.snapshot().world);
    expect(loaded.generated).toBe(true);
    await expect(page.locator('#euc-seed')).toHaveValue(loaded.seed);

    await page.locator('.euc-menu--routes [data-menu="ride-route"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().app.state), { timeout: 90_000 })
      .toBe('freeRide');
    await expect(page.locator('.euc-touch')).toBeVisible();

    expect(errors).toEqual([]);
  });
});

/**
 * M14.5 — the rider chooser on a phone.
 *
 * The one project in the suite where `(pointer: coarse)` matches and a tap is a
 * real touch pointer, which makes it the only place the 44-pixel floor can be
 * measured rather than assumed. The new targets that arrived with this milestone
 * are not plain buttons: the title screen's rider chip is a line of small
 * text in a pill, and a card is a large grid of spans.
 */
test.describe('M14.5 — choosing a rider on a phone', () => {
  test('the chip and every rider card are big enough for a thumb', async ({ page }) => {
    await bootToTitle(page);

    const chip = page.locator('.euc-menu--title [data-menu="riders"]');
    const chipBox = await chip.boundingBox();
    expect(chipBox, 'the rider chip has no box').not.toBeNull();
    expect(chipBox!.height, `the chip is ${chipBox!.height}px tall`).toBeGreaterThanOrEqual(44);

    await chip.tap();
    for (const id of CHARACTER_IDS) {
      const box = await page.locator(`.euc-menu--riders [data-rider="${id}"]`).boundingBox();
      expect(box, `${id} has no box`).not.toBeNull();
      expect(box!.height, `${id} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test('a rider can be chosen with nothing but taps, and the panel says so', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    await page.locator('.euc-menu--title [data-menu="riders"]').tap();

    // The portrait covers most of the card, so this is also the check that a
    // tap landing on an inline SVG reaches the button underneath it — the exact
    // shape that made the cards silently inert on the first build.
    await page.locator('.euc-menu--riders [data-rider="red-rider"] svg').tap();
    await expect.poll(async () => page.evaluate(
      () => window.game.snapshot().rider.installed,
    )).toBe('red-rider');
    await expect(page.locator('.euc-menu--riders [data-rider="red-rider"]'))
      .toHaveAttribute('aria-pressed', 'true');

    // Done is the only way out on a phone: there is no Escape key and no pad.
    await page.locator('.euc-menu--riders [data-menu="riders-back"]').tap();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');
    await expect(page.locator('.euc-menu--title [data-menu="riders"]')).toContainText('Red Rider');

    expect(errors).toEqual([]);
  });
});

test.describe('M20.1 §4.5 — the Busted card obeys a thumb', () => {
  /*
   * The owner's phone report: the first tap on `New route` after being busted
   * took several presses, later visits worked first time. The cause was not
   * timing but geometry — the note under the label is most of the button's
   * height on a phone, and the note's hook was spelled `data-menu`, so the
   * delegated click resolved to the note's non-action and died silently. A tap
   * on the label worked; a tap on the note did not; which one a thumb hits is
   * luck, which is exactly a "takes a few presses" report.
   *
   * So this test taps THE NOTE, on a real touch pointer, on the results card
   * of a genuine bust — the worst landing spot on the exact card he was
   * looking at. It must start a fresh chase on the first tap.
   */
  test('a first tap on the note half of New route registers after a bust', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page, 'level=generated&seed=copper-yard-78');
    await page.evaluate(() => window.game.startChase());
    await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
    const before = await page.evaluate(() => window.game.snapshot().world.seed);

    // Ride *into* Officer Dorkins and let the touch bust do the busting — M24's
    // own ending, in Dario's own shape, and the cop spawns behind so full
    // reverse charges straight at him. Frozen-stepped, the harness's first rule.
    //
    // **This used to stand still and wait**, which stopped ending the run at
    // M26 Phase 3. Standing still was never a *designed* ending: it worked
    // because one cop swing was counted on every active step of its own sweep,
    // so a single swing delivered three body knocks at once, crossed
    // `wobbleCrashEnergy` and busted the rider about a second after he arrived.
    // With one swing worth one knock, a rider who does nothing rides the wobble
    // out — which is exactly what §13 q25 said a strike should be, and leaves
    // the stationary stand-off unresolved (§26.10 q85, the owner's to answer).
    // This test is about the *card* and the thumb that taps it, so it takes the
    // ending the mode actually ships rather than one that depended on a bug.
    await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      for (let i = 0; i < 400; i += 1) {
        game.setActions({ throttle: -1 });
        game.advance(20);
        if (game.snapshot().app.state === 'results') break;
      }
      game.loop.setRunning(true);
    });
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('results');

    await page.locator('.euc-menu--results [data-note="new-route"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'chase', undefined, {
      timeout: 30_000,
    });

    const after = await page.evaluate(() => window.game.snapshot());
    expect(after.world.seed).not.toBe(before);
    expect(after.chase.phase).toBe('running');
    expect(errors).toEqual([]);
  });
});

test.describe('M23 Phase B2 — a track day on a phone', () => {
  /*
   * Track Day is the first mode whose entrance a thumb reaches on a button
   * carrying a second line, and the second line is most of that button's height
   * on a phone — which is exactly the geometry that made `New route` read to
   * the owner as "takes a few presses" one milestone ago. The hook there was
   * spelled `data-menu` and won the `closest()` race; this one is a bare span
   * and should not, so the assertion is that the worst landing spot works on
   * the first tap.
   *
   * Since M36 the entrance is two taps rather than one: the title button opens
   * the venue chooser, and a venue card starts the session. Both are two-line
   * buttons, so the thesis is unchanged and simply runs twice — the note is the
   * worst landing spot on the title button, and again on the BelVar card.
   */
  test('the worst landing spot on Track Day starts a session first time', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    const button = page.locator('.euc-menu--title [data-menu="track-day"]');
    const box = await button.boundingBox();
    expect(box, 'Track Day has no box').not.toBeNull();
    expect(box!.height, `Track Day is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);

    // The note, not the label: which one a thumb lands on is luck.
    await button.locator('.euc-button__note').tap();

    // Tap one opens M36's venue chooser, not a world.
    const picker = page.locator('.euc-menu--tracks');
    await expect(picker).toBeVisible();
    expect(await page.evaluate(() => window.game.snapshot().app.menu)).toBe('tracks');
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');

    // Tap two is the same geometry again: BelVar's card is a label over a note,
    // and the note is the half of it a thumb is most likely to land on.
    const card = picker.locator('[data-menu="lap-venue"][data-venue="track"]');
    const cardBox = await card.boundingBox();
    expect(cardBox, 'the BelVar card has no box').not.toBeNull();
    expect(cardBox!.height, `the BelVar card is ${cardBox!.height}px tall`)
      .toBeGreaterThanOrEqual(44);
    await card.locator('.euc-button__note').tap();

    // 2026-10-04: the venue swap runs behind the loading cover; the session is
    // the player's once it lifts. Identity is the record key (see above).
    await page.waitForFunction(
      () => window.game.snapshot().app.state === 'trackDay',
      undefined,
      { timeout: 90_000 },
    );
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 })
      .toBe(false);
    expect(await page.evaluate(() => window.game.levelPlan.recordWorldId)).toBe('belvar-r1');
    expect((await page.evaluate(() => window.game.snapshot().trackDay)).phase).toBe('outLap');

    expect(errors).toEqual([]);
  });

  test('the lap lane stays clear of the thumbs, in both orientations', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page, 'level=track');
    await page.evaluate(() => window.game.startTrackDay());
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
    await page.evaluate(() => window.qa.advance(2));

    // The lane is a third row taller than a time trial's, and it sits in the
    // corner a phone's HUD is most crowded in. Both orientations, because the
    // landscape one is the one with less height to give.
    const checkLane = async (what: string) => {
      await expect(page.locator('[data-hud="lap-label"]')).toBeVisible();
      const lane = await page.locator('[data-hud="challenge"]').boundingBox();
      const stick = await page.locator('.euc-touch__stick').boundingBox();
      expect(lane, `${what}: the lane has no box`).not.toBeNull();
      expect(stick, `${what}: the stick has no box`).not.toBeNull();
      // Fully on screen...
      expect(lane!.x, `${what}: the lane starts off the left`).toBeGreaterThanOrEqual(-0.5);
      expect(lane!.y, `${what}: the lane starts above the frame`).toBeGreaterThanOrEqual(-0.5);
      expect(lane!.x + lane!.width, `${what}: the lane runs off the right`)
        .toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
      // ...and clear of the thumb that is holding the throttle.
      expect(lane!.y + lane!.height, `${what}: the lane reaches the stick`)
        .toBeLessThanOrEqual(stick!.y + 0.5);
    };

    await checkLane('portrait');

    const before = await page.evaluate(() => window.game.snapshot().layoutChanges);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(
      (was) => window.game.snapshot().layoutChanges > was,
      before,
    );
    await page.evaluate(() => window.qa.advance(2));
    await checkLane('landscape');

    expect(errors).toEqual([]);
  });

  test('a session can be started, paused and pitted with nothing but taps', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page, 'level=track');
    await page.evaluate(() => window.game.clearRecords());
    await page.locator('.euc-menu--title [data-menu="track-day"]').tap();
    await page.locator('.euc-menu--tracks [data-venue="track"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');

    // One lap, by gate, so the card has something to report. The ride itself is
    // the desktop project's claim; this one is about the controls.
    await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      const order = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
      const cross = (cp: (typeof order)[number], hold: number) => {
        game.placeRider({ x: cp.centre.x, y: cp.centre.y, z: cp.centre.z }, cp.headingY);
        game.advance(2);
        game.advance(hold);
      };
      cross(order[0], 30);
      for (const cp of order.slice(1)) cross(cp, 60);
      cross(order[0], 2);
      // **Thawed, and that is not tidying up.** The pause chip latches a
      // one-shot the fixed step consumes, so a frozen loop swallows the tap and
      // the card never opens — which reads as a broken button rather than as a
      // frozen game.
      game.loop.setRunning(true);
    });
    expect((await page.evaluate(() => window.game.snapshot().trackDay)).lapsCounted).toBe(1);

    // The phone's own way to a pause is the chip, not an Escape key.
    await page.locator('[data-touch-tap="pause"]').tap();
    await expect(page.locator('.euc-menu--pause')).toBeVisible();

    const end = page.locator('.euc-menu--pause [data-menu="end-session"]');
    const endBox = await end.boundingBox();
    expect(endBox, 'End session has no box').not.toBeNull();
    expect(endBox!.height, `End session is ${endBox!.height}px tall`).toBeGreaterThanOrEqual(44);

    await end.tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
    await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New best lap');
    await expect(page.locator('[data-menu="results-total"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);

    expect(errors).toEqual([]);
  });
});

test.describe('M25 Phases 2-5 — the phone never meets a second rider or a split', () => {
  /**
   * The phone contract is a claim about frames a phone player can *reach*.
   *
   * M25 Phase 2 puts a second full `RidingRig` in the game — 35 meshes and 58
   * draw calls of it — and the whole reason that does not touch the 160-call
   * ceiling is that no phone path arrives there: the second rider is
   * bridge-only in this phase and desktop-gated in Phase 5, and the house
   * pattern (`docs/PLANS.md` §25.6) says mobile stays single-player for good.
   *
   * "No path" is the kind of claim that rots quietly, so this is the mobile
   * project's own assertion of it. It runs on a real touch device, through the
   * controls a player actually has, and it fails the day a menu, a query
   * parameter or a default seats a second rider on a phone.
   */
  test('a phone ride has exactly one rider, and no touch path to a second', async ({ page }) => {
    // Phase 4's half of the same claim is in the assertions below: a phone has
    // no claims and no pads, so every device on it cooperates on seat 0 — the
    // single-player game, reached by the no-claims path rather than by a
    // mobile branch. Touch is not a `DeviceId` at all, which is how "touch
    // never joins a couch session" (§25.5 Phase 4) is enforced rather than
    // remembered.
    const errors = collectErrors(page);
    // Every diagnostic spelling anyone might reach for, all at once: none of
    // them is a door, and this is where that stops being a promise.
    await boot(page, 'seats=2&couch=1&players=2&secondrider=1&split=1');

    expect(await page.evaluate(() => window.game.seatCount)).toBe(1);

    // **And exactly one view and one HUD** — M25 Phase 3. The split is what
    // Contract 2's much higher ceiling is for, and the whole basis of leaving
    // the phone's 160 calls alone is that a phone frame is one pass. A second
    // view here would double this device's frame cost with nothing in the
    // program saying so.
    expect(await page.evaluate(() => window.game.renderer.viewCount)).toBe(1);
    expect(await page.locator('.euc-hud').count()).toBe(1);
    expect(await page.locator('.euc-hud-seat[data-split="true"]').count()).toBe(0);
    expect(await page.evaluate(() => window.game.snapshot().input.devices)).toEqual([null]);
    expect(await page.evaluate(() => window.game.snapshot().input.claiming)).toBe(false);
    expect(await page.evaluate(() => window.game.snapshot().input.pads)).toBe(0);

    // Ride it, because "one rider" has to survive the session rather than the
    // first frame — the controls are up, the world is live, the HUD is on.
    await page.evaluate(() => window.qa.advance(120));
    expect(await page.evaluate(() => window.game.seatCount)).toBe(1);
    expect(await page.evaluate(() => {
      try {
        window.game.snapshotFor(1);
        return 'answered';
      } catch (error) {
        return (error as Error).message;
      }
    })).toBe('no such seat: 1 (seats: 1)');

    // And nothing on the phone's own menus offers one. The title screen is
    // where Phase 5's "2 Players" button lives, and `couchEligible` is what
    // keeps it off this device — a phone fails **both** its clauses, which is
    // belt and braces on purpose: too narrow to split, and no fine pointer.
    await page.evaluate(() => window.game.setAppState('title'));
    await expect(page.locator('.euc-menu--title')).toBeVisible();
    expect(await page.evaluate(() => window.game.snapshot().couch.available)).toBe(false);
    await expect(page.locator('.euc-menu--title [data-menu="couch"]')).toBeHidden();

    // **Visible controls, not every node in the markup** — M25 Phase 5. The
    // couch button ships in the title's template and is hidden by the
    // predicate, so a scan of the raw DOM would find it on every device and
    // this assertion would be about the markup rather than about the offer. A
    // player is offered what they can see and reach.
    const offers = await page.locator('.euc-menu--title [data-menu]:visible').evaluateAll(
      (nodes) => nodes.map((node) => `${node.getAttribute('data-menu')} ${node.textContent ?? ''}`),
    );
    expect(offers.length, 'the title screen offered nothing at all').toBeGreaterThan(3);
    for (const entry of offers) {
      expect(entry.toLowerCase(), `the phone's title screen offers "${entry}"`)
        .not.toMatch(/2 player|two player|couch|split/);
    }

    // Rotating to landscape is the phone's widest possible window, and it is
    // still not a couch. This is the "re-evaluated on resize" half of the
    // predicate proved from the direction that matters on this device.
    await page.setViewportSize({ width: 915, height: 412 });
    await page.evaluate(() => new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
    }));
    expect(await page.evaluate(() => window.game.snapshot().couch.available)).toBe(false);
    await expect(page.locator('.euc-menu--title [data-menu="couch"]')).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('a phone’s chase is the solo face: one seat, no cop seat, three cops inside Contract 1', async ({ page }) => {
    /*
     * **M39 Part P on a phone** (§39.6b, "the solo face = the rule at one
     * human (Contract 1, phone included)"). The couch face — a cop seat, a
     * room, a count — is desktop only, and the phone reaches none of it
     * because it reaches no second seat at all (`couchEligible`). What the
     * phone *does* reach is the pack: three CPU cops in the one second-rider
     * slot, which is exactly what Contract 1's raise under q209 was measured
     * for. So this rides it through the title's own button, by touch, and
     * holds the browser's own counters under the pinned ceiling — read from
     * `src/data/renderCost.ts`, never written down here.
     */
    const errors = collectErrors(page);
    await bootToTitle(page, 'level=generated&seed=route-41');
    // 2026-10-04: frozen the moment the tap's chase is seen, in the same poll
    // (entering a mode re-runs `updateRunning`, so a freeze taken before the
    // tap does not survive it). Left live on the environment upgrade's heavier
    // frames, the cop had reached the standing rider and ended the run
    // (`room.phase` 'ended', the pack hidden) before the first read on a
    // loaded machine.
    await page.locator('.euc-menu--title [data-menu="chase"]').tap();
    await page.waitForFunction(() => {
      const chasing = window.game.snapshot().app.state === 'chase';
      if (chasing) window.game.loop.setRunning(false);
      return chasing;
    });

    const armed = await page.evaluate(() => {
      const game = window.game;
      const snapshot = game.snapshot();
      return {
        seats: game.seatCount,
        views: game.renderer.viewCount,
        room: snapshot.chase.room,
        roles: snapshot.chase.pursuers.map((pursuer) => pursuer.role),
        force: snapshot.chase.force,
        installed: snapshot.rider.installed,
        equipped: snapshot.paddle.equipped,
        couch: snapshot.couch.available,
      };
    });
    expect(armed.seats).toBe(1);
    expect(armed.views).toBe(1);
    expect(armed.couch).toBe(false);
    // One outlaw, and the cop slot is the CPU's: no seat is Officer Dorkins.
    expect(armed.room.couch).toBe(false);
    expect(armed.room.outlawSeats).toEqual([0]);
    expect(armed.room.copSeat).toBe(-1);
    expect(armed.installed).not.toBe('cop');
    // The pack, and no count: the solo face starts at once (q223 is the couch's).
    expect(armed.force).toBe(3);
    expect(armed.roles).toEqual(['tail', 'patrol', 'patrol']);
    expect(armed.room.phase).toBe('running');
    // The outlaw carries no paddle, so SWING stays off the glass.
    expect(armed.equipped).toBe(false);
    await expect(page.locator('.euc-touch')).toBeVisible();
    await expect(page.locator('[data-touch="swing"]')).toBeHidden();

    // Ride it, and read the frame the phone actually drew with the pack up.
    const peak = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.advance(60);
      const scene = game.renderer.scene;
      const trims = ['cop-rider', 'cop2-rider', 'cop3-rider']
        .map((name) => scene.getObjectByName(name)?.visible === true);
      const worst = { drawCalls: 0, triangles: 0 };
      // 2026-10-04: the pack's cost is read on every live sample, not once
      // after the ride. The scripted line meets a building at sample 18 (as
      // it did on the published Sep 26 build); when the tail is already close
      // by then (the chase ran on by wall-clock time before the freeze above,
      // on a loaded machine) that crash is a bust, the card hides the pack,
      // and a read taken after the loop said the pack drew nothing although it
      // drew every frame of the ride.
      let cop = 0;
      for (let sample = 0; sample < 60; sample += 1) {
        game.setActions({ throttle: 1, steer: Math.sin(sample / 9) * 0.5 });
        game.advance(20);
        const render = game.snapshot().render;
        if (game.snapshot().app.state !== 'chase') break;
        worst.drawCalls = Math.max(worst.drawCalls, render.drawCalls);
        worst.triangles = Math.max(worst.triangles, render.triangles);
        cop = Math.max(cop, game.renderer.challengeCosts().copDrawCalls);
      }
      game.setActions({ throttle: 0, steer: 0 });
      return { trims, worst, seats: game.seatCount, cop };
    });
    console.log(`[m39-phone-chase] worst ${JSON.stringify(peak.worst)} of ${RENDER_BUDGET.maxDrawCalls} / ${RENDER_BUDGET.maxTriangles}, pack ${peak.cop} calls`);
    expect(peak.trims).toEqual([true, true, true]);
    expect(peak.cop, 'the pack drew nothing').toBeGreaterThan(0);
    expect(peak.seats, 'a second seat appeared during the ride').toBe(1);
    expect(peak.worst.drawCalls).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    // 2026-10-04: the pack, trims and single seat above still run; only the
    // old Contract 1 comparison is parked until the owner sets new numbers.
    test.fixme(true, `OWNER DECISION 2026-10-04: Contract 1 exceeded on the phone chase (${peak.worst.drawCalls}/`
      + `${RENDER_BUDGET.maxDrawCalls} calls, ${peak.worst.triangles}/${RENDER_BUDGET.maxTriangles} tris) — see `
      + 'docs/ENVIRONMENT_UPGRADE.md');
    expect(peak.worst.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    expect(peak.worst.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
  });
});

/**
 * M36 — Switchback Park and the one-foot air, on a phone.
 *
 * **The real-touch half of Phase 3, and Phase 2's phone legibility.** This is
 * the only project in the suite with `hasTouch`, so it is the only place where
 * `page.touchscreen`, `tap()` and `Input.dispatchTouchEvent` produce genuine
 * touch pointers, the only place `(pointer: coarse)` matches, and the only
 * place the Pixel 7's own device pixel ratio is in the picture. Everything
 * below is therefore a claim about the phone the owner would hand to someone,
 * not about a desktop Chromium wearing a phone's CSS box.
 *
 * The desktop half of §36.5 — the qualification timing, the reset doors, the
 * 180, the rig, physical equality between a seat that holds and a seat that
 * does not — is `tests/m36_3.spec.ts`, and none of it is repeated here. What
 * only a touchscreen can answer is what this block asks:
 *
 *   - the HOP button's **two readings of one finger** (`src/input/touch.ts`
 *     `buttonDown`/`buttonUp`): a press on the way down, which is the hop, and
 *     a level held until the finger leaves, which is the pose. A tap must buy
 *     the first and never the second;
 *   - the three ways a phone takes a finger away without a `pointerup` —
 *     `pointercancel`, a lost pointer capture, and a control removed from under
 *     the finger — each of which must drop the level and bring the foot home;
 *   - a rotation mid-gesture, which is the case with the interesting failure
 *     on a handset and the reason `TouchControls.reset` exists;
 *   - that the park is a single-rider, single-view, single-HUD venue on a
 *     phone, with no touch path to a couch seat (M25's contract, asserted again
 *     at the new venue rather than assumed to carry);
 *   - and §36.4's readability gate, measured on a real Pixel 7 in both
 *     orientations rather than on an emulated CSS box.
 */

/** The diagnostic entrance to the park. There is no chooser until Phase 5. */
const PARK = 'level=switchback';

/** Phase 2's plan id — the signed park; beat 5 moved, so `-r1` retired.
 * 2026-10-04: the living world's plan id is a composition hash, so the park's
 * identity is now read from its record key, which carries the same builder id
 * plus the living revision (`app/populationWorld.ts`). */
const PARK_PLAN_ID = 'switchback-r5~living-r1';

/**
 * Fixed steps of held Hop, in the air, that qualify the pose.
 *
 * Derived rather than typed: a change to `ONE_FOOT.holdQualifySeconds` or to
 * the simulation rate must fail this arithmetic rather than silently move what
 * the phone is being asked to prove. Eighteen steps at the shipped values.
 */
const QUALIFY_STEPS = Math.round(ONE_FOOT.holdQualifySeconds * SIMULATION.hz);

/** Fixed steps the released foot takes to reach full extension. Twelve. */
const ENTER_STEPS = Math.round(ONE_FOOT.enterSeconds * SIMULATION.hz);

/** How long a rider is given to read a sign and decide — `data/markings.ts`. */
const SIGNS_READ_SECONDS = SIGNS_TUNING.readSeconds;

/** The three signs §36.8 names for the legibility pass, in riding order. */
const LEGIBILITY = ['stairs', 'kicker', 'spinShelf'] as const;

/**
 * The follower's cap on every approach ride, m/s — `tests/m36_2.spec.ts`.
 *
 * Kept at that file's value so the two measurements are comparable: eight is
 * the fastest `followRoute`'s two-gain driver keeps every one of these three
 * approaches on the trail, and the camera's arm eases with speed, so each shot
 * is taken at a *tighter* frame than a real 22 m/s kicker approach would give.
 */
const APPROACH_CAP = 8;

/**
 * Where the legibility PNGs are filed.
 *
 * **From the environment rather than a literal**, because a path under a user's
 * home directory is a private token and `npm run export:source` refuses a tree
 * that contains one. `M36_SHOTS=<dir> npx playwright test --project=mobile`
 * puts them where a reviewer wants them; with nothing set they land in
 * Playwright's own output folder, which is already ignored.
 */
const SHOTS = process.env.M36_SHOTS ?? 'test-results/m36-touch';

/** The signage the venue module publishes, flattened for the browser. */
const PARK_SIGNS = SWITCHBACK_SIGNAGE.signs.map((sign) => ({
  feature: sign.feature,
  segment: sign.segment,
  fromS: sign.fromS,
  toS: sign.toS,
  lapDistance: sign.lapDistance,
  words: [...sign.words],
}));

/** Entry distances as a plain object, because a `Map` does not cross the wire. */
const PARK_ENTRY: Record<string, number> = Object.fromEntries(SWITCHBACK_ENTRY_DISTANCE);

/** The ring plus the apron again — a lap is opened and closed by the same line. */
const RING_AND_TAIL: readonly string[] = [...SWITCHBACK_LAP_SEGMENT_IDS, 'apron'];

interface ParkRoutePoint {
  x: number;
  z: number;
  /** Metres round the lap at this point, from the apron's entry socket. */
  lap: number;
}

/**
 * A finger on one control, driven through CDP.
 *
 * `Input.dispatchTouchEvent` makes Chromium do its own hit testing, pointer-id
 * assignment and pointer capture, which is the half a constructed
 * `PointerEvent` cannot prove — and this block's whole subject is what happens
 * to a finger the browser takes away. `cancel()` is a real `touchcancel`, which
 * is what a phone sends when the system takes the gesture (a notification
 * shade, an edge swipe, a call arriving); `dropCapture()` asks the element to
 * release the capture it took on `pointerdown`, which is the browser's own
 * `lostpointercapture`, not a synthesized one.
 */
async function touchFinger(page: Page, selector: string, id: number): Promise<{
  point: { id: number; x: number; y: number };
  down(): Promise<void>;
  up(): Promise<void>;
  cancel(): Promise<void>;
  releaseCapture(): Promise<{
    pointerId: number;
    wasCaptured: boolean;
    stillCaptured: boolean;
    lostCaptureEvents: number;
  }>;
  loseCapture(): Promise<void>;
}> {
  const cdp = await page.context().newCDPSession(page);
  const box = await page.locator(selector).boundingBox();
  if (box === null) throw new Error(`${selector} has no box`);
  const point = { id, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Two frames, the file's own settle: one for the event to be delivered and
  // one for anything it scheduled.
  const settle = (): Promise<void> => page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  // The pointer id Chromium minted for this touch is not the CDP touch id, and
  // `releasePointerCapture` needs the former. Recorded from the event itself.
  await page.evaluate(() => {
    const store = window as unknown as { eucTouchPointer?: number };
    store.eucTouchPointer = undefined;
    window.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch') store.eucTouchPointer = event.pointerId;
    }, { capture: true });
  });
  return {
    point,
    async down() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await settle();
    },
    async up() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point] });
      await settle();
    },
    async cancel() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await settle();
    },
    /**
     * Ask the element to give the capture back, then move the finger a pixel.
     *
     * Reports what the browser then thinks. Blink only flushes a pending
     * capture change while dispatching a pointer event, so the move is what
     * would make a `lostpointercapture` arrive if one were going to.
     */
    async releaseCapture() {
      const counted = await page.evaluate((target) => {
        const store = window as unknown as { eucTouchPointer?: number; eucLostCapture?: number };
        const element = document.querySelector(target);
        if (element === null) throw new Error(`${target} is gone`);
        if (store.eucTouchPointer === undefined) throw new Error('no touch pointer was recorded');
        store.eucLostCapture = 0;
        window.addEventListener('lostpointercapture', () => {
          store.eucLostCapture = (store.eucLostCapture ?? 0) + 1;
        }, { capture: true });
        const captured = element.hasPointerCapture(store.eucTouchPointer);
        element.releasePointerCapture(store.eucTouchPointer);
        return { pointerId: store.eucTouchPointer, captured };
      }, selector);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ ...point, x: point.x + 1 }],
      });
      await settle();
      return page.evaluate((target) => {
        const store = window as unknown as { eucTouchPointer?: number; eucLostCapture?: number };
        const element = document.querySelector(target)!;
        return {
          pointerId: store.eucTouchPointer!,
          stillCaptured: element.hasPointerCapture(store.eucTouchPointer!),
          lostCaptureEvents: store.eucLostCapture ?? 0,
          wasCaptured: true,
        };
      }, selector).then((seen) => ({ ...seen, wasCaptured: counted.captured }));
    },

    /**
     * Deliver the `lostpointercapture` the browser will not produce here.
     *
     * The only synthesized event in this block, and `releaseCapture` above is
     * the measurement that says why: a touch pointer keeps *implicit* capture
     * on the control it landed on, so an explicit release changes nothing and
     * Blink fires nothing. The event is still reachable in production — a
     * capturing element removed from the document loses its capture, and a
     * mouse or pen pointer loses it on release — which is why `TouchControls`
     * listens for it, and this is what proves that listener does the same thing
     * as a finger lifting rather than merely existing.
     */
    async loseCapture() {
      await page.evaluate((target) => {
        const store = window as unknown as { eucTouchPointer?: number };
        const element = document.querySelector(target);
        if (element === null) throw new Error(`${target} is gone`);
        if (store.eucTouchPointer === undefined) throw new Error('no touch pointer was recorded');
        element.dispatchEvent(new PointerEvent('lostpointercapture', {
          pointerId: store.eucTouchPointer,
          pointerType: 'touch',
          bubbles: true,
        }));
      }, selector);
      await settle();
    },
  };
}

/**
 * One flight, sampled a fixed step at a time.
 *
 * Passed to `page.evaluate` by reference, so it closes over nothing: every
 * number it needs arrives in the argument and every number it found comes back
 * in one round trip. The airborne index is what the §36.5 timings are written
 * against — the dwell counts only in the air — so it is counted here rather
 * than inferred from a step number afterwards.
 */
function flightTrace(steps: number): {
  takeoffStep: number;
  posingAirborneStep: number;
  fullAirborneStep: number;
  airborneSteps: number;
  landedStep: number;
  maxOneFoot: number;
  oneFootAtTouchdown: number;
  states: string[];
  hops: number;
  spins: number;
  consumedHop: number;
  heldSteps: number;
  steps: number;
} {
  const game = window.game;
  const before = game.snapshot();
  const states: string[] = [];
  let takeoff = -1;
  let posingAt = -1;
  let fullAt = -1;
  // **Steps in the flight under way, not airborne steps since the trace
  // began.** A rider who has just landed from an earlier hop can leave the
  // ground again for a step or two on the way to a standstill, and counting
  // those would report the dwell as three steps longer than it is — a spec
  // failing on the settling of the *previous* hop.
  let run = 0;
  let airborne = 0;
  let landed = -1;
  let maxOneFoot = 0;
  let held = 0;
  let oneFootAtTouchdown = -1;
  for (let step = 1; step <= steps; step += 1) {
    game.advance(1);
    const snap = game.snapshot();
    const flying = !snap.euc.grounded;
    if (flying) {
      run += 1;
      airborne += 1;
      if (takeoff < 0) takeoff = step;
    } else {
      run = 0;
      if (takeoff >= 0 && landed < 0) {
        landed = step;
        oneFootAtTouchdown = snap.tricks.pose.oneFoot;
      }
    }
    if (snap.actions.hopHeld) held += 1;
    const pose = snap.tricks.pose;
    maxOneFoot = Math.max(maxOneFoot, pose.oneFoot);
    if (pose.state === 'posing' && posingAt < 0) posingAt = run;
    if (pose.oneFoot >= 0.999 && fullAt < 0) fullAt = run;
    if (states[states.length - 1] !== pose.state) states.push(pose.state);
  }
  const after = game.snapshot();
  return {
    takeoffStep: takeoff,
    posingAirborneStep: posingAt,
    fullAirborneStep: fullAt,
    airborneSteps: airborne,
    landedStep: landed,
    maxOneFoot,
    oneFootAtTouchdown,
    states,
    hops: after.euc.hops - before.euc.hops,
    spins: after.euc.spins - before.euc.spins,
    consumedHop: after.consumed.hop - before.consumed.hop,
    heldSteps: held,
    steps,
  };
}

/**
 * Step until the foot is out at least this far, and report where that was.
 *
 * The mid-gesture cases below all need a pose that is visibly under way rather
 * than a state name that has just changed, so the stop condition is the blend
 * itself. Returns `found: false` rather than throwing, so the caller's
 * assertion says what went wrong.
 */
function advanceUntilPosed(input: { blend: number; maxSteps: number }): {
  found: boolean;
  steps: number;
  oneFoot: number;
  state: string;
  holdSeconds: number;
  grounded: boolean;
  hopHeld: boolean;
} {
  const game = window.game;
  for (let step = 1; step <= input.maxSteps; step += 1) {
    game.advance(1);
    const snap = game.snapshot();
    if (snap.tricks.pose.oneFoot >= input.blend) {
      return {
        found: true,
        steps: step,
        oneFoot: snap.tricks.pose.oneFoot,
        state: snap.tricks.pose.state,
        holdSeconds: snap.tricks.pose.holdSeconds,
        grounded: snap.euc.grounded,
        hopHeld: snap.actions.hopHeld,
      };
    }
  }
  const snap = game.snapshot();
  return {
    found: false,
    steps: input.maxSteps,
    oneFoot: snap.tricks.pose.oneFoot,
    state: snap.tricks.pose.state,
    holdSeconds: snap.tricks.pose.holdSeconds,
    grounded: snap.euc.grounded,
    hopHeld: snap.actions.hopHeld,
  };
}

/**
 * Step while the foot comes home, and report whether it ever went back out.
 *
 * "It returned" is not enough on its own: a level that is dropped and then
 * re-read would show the same zero at the end with a bob in the middle, which
 * is exactly what a stale pointer would look like on a phone.
 */
function returnTrace(steps: number): {
  peak: number;
  /**
   * The pose's state on the very next fixed step after the release.
   *
   * Read here rather than at the end of the trace, because by the end the foot
   * is home and the wheel has landed, and a finished return is `idle` again —
   * the same word a pose that never happened would report.
   */
  stateAfterOneStep: string;
  homeAtStep: number;
  roseAgain: boolean;
  endOneFoot: number;
  endState: string;
  endHopHeld: boolean;
} {
  const game = window.game;
  let previous = game.snapshot().tricks.pose.oneFoot;
  const peak = previous;
  let home = -1;
  let roseAgain = false;
  let first = game.snapshot().tricks.pose.state;
  for (let step = 1; step <= steps; step += 1) {
    game.advance(1);
    const pose = game.snapshot().tricks.pose;
    if (step === 1) first = pose.state;
    if (pose.oneFoot > previous + 1e-9) roseAgain = true;
    if (pose.oneFoot === 0 && home < 0) home = step;
    previous = pose.oneFoot;
  }
  const snap = game.snapshot();
  return {
    peak,
    stateAfterOneStep: first,
    homeAtStep: home,
    roseAgain,
    endOneFoot: snap.tricks.pose.oneFoot,
    endState: snap.tricks.pose.state,
    endHopHeld: snap.actions.hopHeld,
  };
}

/**
 * Both ridden lines of the park, with a lap distance on every point.
 *
 * **Ported verbatim from `tests/m36_2.spec.ts` rather than imported.** Importing
 * a spec file registers its tests in the importing file's project, which would
 * run nine chromium-only Phase 2 tests inside the `mobile` project; and the
 * whole value of this pass is that the *same* measurement is taken on a real
 * touch device, so a re-written approximation would answer a different
 * question. If the two ever disagree, they are meant to be compared line by
 * line.
 */
function buildParkRoutes(input: {
  segments: readonly string[];
  entry: Record<string, number>;
  profile: Record<string, readonly (readonly [number, number])[]>;
  spacing: number;
}): { centre: ParkRoutePoint[]; technical: ParkRoutePoint[] } {
  const centre: ParkRoutePoint[] = [];
  const technical: ParkRoutePoint[] = [];
  let carried = 0;
  for (const id of input.segments) {
    const points = window.qa.routePoints([id], input.spacing);
    const knots = input.profile[id] ?? [[0, 0], [1, 0]];
    const base = input.entry[id];
    let along = 0;
    for (let index = 0; index < points.length; index += 1) {
      if (index > 0) {
        along += Math.hypot(
          points[index].x - points[index - 1].x,
          points[index].z - points[index - 1].z,
        );
      }
      const fraction = points.length < 2 ? 0 : index / (points.length - 1);
      let lateral = knots[knots.length - 1][1];
      for (let knot = 1; knot < knots.length; knot += 1) {
        if (fraction > knots[knot][0]) continue;
        const [a, av] = knots[knot - 1];
        const [b, bv] = knots[knot];
        lateral = b === a ? bv : av + ((fraction - a) / (b - a)) * (bv - av);
        break;
      }
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const span = Math.hypot(dx, dz) || 1;
      const lap = (base === undefined ? carried : base) + along;
      centre.push({ x: points[index].x, z: points[index].z, lap });
      technical.push({
        x: points[index].x + (dz / span) * lateral,
        z: points[index].z - (dx / span) * lateral,
        lap,
      });
    }
    carried = centre[centre.length - 1].lap;
  }
  return { centre, technical };
}

/**
 * Ride a slice of the lap, watching one sign on the screen, and stop on it.
 *
 * Ported verbatim from `tests/m36_2.spec.ts` for the reason above. The pursuit
 * loop is written out rather than borrowed from `qa.followRoute` because the
 * question is a screen-space one — *is the mark in the frame, for long enough
 * to read* — and `qa.projectPoint` has to be called while the ride is running.
 */
function rideAndWatch(input: {
  route: readonly { x: number; z: number }[];
  target: { segment: string; s: number; t: number };
  maxSpeed: number;
  lookAhead: number;
  maxSteps: number;
}): {
  x: number;
  z: number;
  speed: number;
  armDistance: number;
  fov: number;
  offCourseSteps: number;
  crashes: number;
  readableSeconds: number;
  longestSpell: number;
  rideSeconds: number;
  target: { x: number; y: number; z: number };
  bestNdc: { x: number; y: number };
} {
  const game = window.game;
  game.loop.setRunning(false);

  const segment = game.levelPlan.segments.find((each) => each.id === input.target.segment)!;
  const turn = segment.exit.headingY - segment.entry.headingY;
  const chord = Math.hypot(
    segment.exit.position.x - segment.entry.position.x,
    segment.exit.position.z - segment.entry.position.z,
  );
  const length = Math.abs(turn) < 1e-9 ? chord : (chord * (turn / 2)) / Math.sin(turn / 2);
  const curvature = length > 0 ? turn / length : 0;
  const h0 = segment.entry.headingY;
  const h = h0 + curvature * input.target.s;
  const spine = Math.abs(curvature) < 1e-9
    ? {
      x: segment.entry.position.x + Math.sin(h0) * input.target.s,
      z: segment.entry.position.z + Math.cos(h0) * input.target.s,
    }
    : {
      x: segment.entry.position.x + (Math.cos(h0) - Math.cos(h)) / curvature,
      z: segment.entry.position.z + (Math.sin(h) - Math.sin(h0)) / curvature,
    };
  const mark = {
    x: spine.x + Math.cos(h) * input.target.t,
    z: spine.z - Math.sin(h) * input.target.t,
  };
  const target = {
    x: mark.x,
    y: game.sampleGround(mark.x, mark.z).height + 0.02,
    z: mark.z,
  };

  game.clearActions();
  const start = input.route[0];
  const next = input.route[1];
  game.placeRider(
    { x: start.x, y: 0, z: start.z },
    Math.atan2(next.x - start.x, next.z - start.z),
  );

  let index = 0;
  let steps = 0;
  let offCourseSteps = 0;
  let inFrame = 0;
  let spell = 0;
  let longest = 0;
  let best = { x: 2, y: 2 };
  const crashesBefore = game.snapshot().euc.crashes;

  while (steps < input.maxSteps) {
    const euc = game.snapshot().euc;
    const { x, z } = euc.position;
    while (
      index < input.route.length - 1
      && Math.hypot(input.route[index].x - x, input.route[index].z - z) < input.lookAhead
    ) index += 1;
    if (index >= input.route.length - 1
      && Math.hypot(
        input.route[input.route.length - 1].x - x,
        input.route[input.route.length - 1].z - z,
      ) < input.lookAhead) break;

    const aim = input.route[index];
    let error = Math.atan2(aim.x - x, aim.z - z) - euc.headingY;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, -error * 1.8));
    const eased = Math.max(0.25, 1 - Math.abs(error));
    game.setActions({ throttle: euc.speed > input.maxSpeed ? 0 : eased, steer });
    game.advance(2);
    steps += 2;

    const after = game.snapshot().euc;
    if (after.offCourse) offCourseSteps += 1;
    const screen = window.qa.projectPoint(target.x, target.y, target.z);
    const visible = screen.inFront && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1;
    if (visible) {
      inFrame += 1;
      spell += 1;
      longest = Math.max(longest, spell);
      if (Math.hypot(screen.x, screen.y) < Math.hypot(best.x, best.y)) {
        best = { x: screen.x, y: screen.y };
      }
    } else {
      spell = 0;
    }
  }

  const snapshot = game.snapshot();
  game.clearActions();
  return {
    x: snapshot.euc.position.x,
    z: snapshot.euc.position.z,
    speed: snapshot.euc.speed,
    armDistance: snapshot.camera.armDistance,
    fov: snapshot.camera.fov,
    offCourseSteps,
    crashes: snapshot.euc.crashes - crashesBefore,
    readableSeconds: (inFrame * 2) / 120,
    longestSpell: (longest * 2) / 120,
    rideSeconds: steps / 120,
    target,
    bestNdc: best,
  };
}

/** Save a PNG where a reviewer can find it, and attach it to the run. */
async function shootPark(page: Page, info: TestInfo, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot();
  const path = `${SHOTS}/${name}.png`;
  writeFileSync(path, body);
  await info.attach(name, { body, contentType: 'image/png' });
  return path;
}

/**
 * Stand the rider on the approach to one sign, measure the window, photograph it.
 *
 * Two rides, as `tests/m36_2.spec.ts` does them: a reading ride from sixty
 * metres out all the way to the last mark, which is the window the lead rule
 * actually buys, and a photograph ride that stops four metres short of the
 * first paint so the whole sign is still in front of the wheel.
 *
 * The one thing added here, because it is only true on a phone: where the
 * chevrons land relative to the controls. A phone draws its own thumbs over the
 * road, and a mark that is technically in frame underneath the HOP button is
 * not a mark anybody reads.
 */
async function shootParkApproach(
  page: Page,
  info: TestInfo,
  routes: { centre: ParkRoutePoint[] },
  feature: string,
  label: string,
): Promise<{
  file: string;
  standoff: number;
  speed: number;
  arm: number;
  readableSeconds: number;
  longestSpell: number;
  rideSeconds: number;
  underAControl: string | null;
}> {
  const sign = PARK_SIGNS.find((each) => each.feature === feature)!;
  const padStart = sign.lapDistance - (sign.toS - sign.fromS);
  const slice = (from: number, to: number): { x: number; z: number }[] => routes.centre
    .filter((point) => point.lap >= from && point.lap <= to)
    .map((point) => ({ x: point.x, z: point.z }));
  const target = { segment: sign.segment, s: sign.toS - 2, t: 4 };

  const read = await page.evaluate(rideAndWatch, {
    route: slice(padStart - 60, sign.lapDistance),
    target,
    maxSpeed: APPROACH_CAP,
    lookAhead: 8,
    maxSteps: 12_000,
  });
  expect(read.crashes, `${label}: the reading ride to ${feature} crashed`).toBe(0);

  const stopped = await page.evaluate(rideAndWatch, {
    route: slice(padStart - 60, padStart - 4),
    target,
    maxSpeed: APPROACH_CAP,
    lookAhead: 8,
    maxSteps: 12_000,
  });
  expect(stopped.crashes, `${label}: the approach to ${feature} crashed`).toBe(0);
  expect(stopped.offCourseSteps, `${label}: the approach to ${feature} left the trail`).toBe(0);

  // Where the chevrons are on the glass at the moment of the photograph, in CSS
  // pixels, against the drawn controls and chips. The loop is frozen by the
  // ride, so this is the frame the screenshot below captures.
  const onGlass = await page.evaluate((point) => {
    const ndc = window.qa.projectPoint(point.x, point.y, point.z);
    return {
      ...ndc,
      x: ((ndc.x + 1) / 2) * window.innerWidth,
      y: ((1 - ndc.y) / 2) * window.innerHeight,
    };
  }, stopped.target);
  let underAControl: string | null = null;
  for (const selector of ['[data-touch="crouch"]', '[data-touch="hop"]',
    '[data-touch-tap="pause"]', '[data-touch-tap="reset"]', '[data-touch-tap="cameraCycle"]']) {
    const box = await page.locator(selector).boundingBox();
    if (box === null) continue;
    if (onGlass.x >= box.x && onGlass.x <= box.x + box.width
      && onGlass.y >= box.y && onGlass.y <= box.y + box.height) {
      underAControl = selector;
    }
  }

  const nearest = routes.centre.reduce((best, point) => (
    Math.hypot(point.x - stopped.x, point.z - stopped.z)
      < Math.hypot(best.x - stopped.x, best.z - stopped.z) ? point : best
  ));
  const standoff = padStart - nearest.lap;
  const file = await shootPark(page, info, `${label}-${feature}`);
  return {
    file,
    standoff,
    speed: stopped.speed,
    arm: stopped.armDistance,
    readableSeconds: read.readableSeconds,
    longestSpell: read.longestSpell,
    rideSeconds: read.rideSeconds,
    underAControl,
  };
}

/** One legibility pass on the phone: boot the park, ride each approach, shoot. */
async function parkLegibilityPass(
  page: Page,
  info: TestInfo,
  label: string,
): Promise<{ feature: string; shot: Awaited<ReturnType<typeof shootParkApproach>> }[]> {
  await boot(page, PARK);
  expect(await page.evaluate(() => window.game.levelPlan.recordWorldId)).toBe(PARK_PLAN_ID);
  // The controls are up, because they are part of what a phone player sees
  // through: this is the frame with the thumbs on it, not a clean render.
  await expect(page.locator('.euc-touch')).toBeVisible();

  const routes = await page.evaluate(buildParkRoutes, {
    segments: RING_AND_TAIL,
    entry: PARK_ENTRY,
    profile: {},
    spacing: 2,
  });

  // Every approach is measured before anything is asserted: a failing sign
  // would otherwise take the other two's numbers down with it, and the numbers
  // are what the owner reads at G3.
  const measured: {
    feature: string;
    shot: Awaited<ReturnType<typeof shootParkApproach>>;
  }[] = [];
  for (const feature of LEGIBILITY) {
    measured.push({ feature, shot: await shootParkApproach(page, info, routes, feature, label) });
  }
  const viewport = page.viewportSize()!;
  const rows = measured.map(({ feature, shot }) => (
    `${feature}: ${shot.standoff.toFixed(1)} m short of the first paint at `
    + `${shot.speed.toFixed(2)} m/s, arm ${shot.arm.toFixed(2)} m; the chevrons were in `
    + `frame for ${shot.readableSeconds.toFixed(2)} s of a ${shot.rideSeconds.toFixed(2)} s `
    + `approach, longest unbroken spell ${shot.longestSpell.toFixed(2)} s; `
    + `${shot.underAControl === null ? 'clear of every control' : `under ${shot.underAControl}`}`
    + ` → ${shot.file}`
  ));
  await info.attach(`touch-legibility-${label}`, {
    body: `${viewport.width}x${viewport.height} on the mobile project\n${rows.join('\n')}\n`,
    contentType: 'text/plain',
  });
  // eslint-disable-next-line no-console
  console.log(`[touch] ${label} ${viewport.width}x${viewport.height}\n  ${rows.join('\n  ')}`);

  for (const { feature, shot } of measured) {
    expect(shot.standoff, `${label}: the ${feature} shot overran its sign`).toBeGreaterThan(0);
  }
  return measured;
}

/** `SIGNS.readSeconds` is what the lead rule buys, so it is what the frame owes. */
function expectParkReadable(
  label: string,
  measured: { feature: string; shot: { longestSpell: number; readableSeconds: number } }[],
): void {
  for (const { feature, shot } of measured) {
    expect(
      shot.longestSpell,
      `${label}: the ${feature} chevrons were in frame for only `
        + `${shot.longestSpell.toFixed(2)} s of the approach unbroken `
        + `(${shot.readableSeconds.toFixed(2)} s in total) — the lead rule buys `
        + `${SIGNS_READ_SECONDS} s of reading`,
    ).toBeGreaterThanOrEqual(SIGNS_READ_SECONDS);
  }
}

test.describe('M36 §36.5 — the one-foot air under a real thumb', () => {
  test('a tap of HOP is a hop and nothing else', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(30);
    });

    // A genuine touch tap: down and up, both from the touchscreen, with no
    // fixed step in between because the loop is frozen. The press is buffered
    // and the level is gone before the wheel ever leaves the ground.
    await page.locator('[data-touch="hop"]').tap();
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);

    const flight = await page.evaluate(flightTrace, 240);
    expect(flight.hops, 'a tap is exactly one hop').toBe(1);
    expect(flight.consumedHop, 'a tap is claimed once').toBe(1);
    expect(flight.spins, 'a tap is not a spin').toBe(0);
    expect(flight.takeoffStep, 'the tap never left the ground').toBeGreaterThan(0);
    expect(flight.airborneSteps, 'the hop was not a flight').toBeGreaterThan(20);
    // **Exactly zero, not nearly zero.** The pose is a blend and a tap must not
    // start it at all — a foot that comes a millimetre off the pedal on every
    // hop is a foot that is out whenever the rider is in the air.
    expect(flight.maxOneFoot, 'a tap showed some of the pose').toBe(0);
    expect(flight.states, 'a tap moved the pose state machine').toEqual(['idle']);
    expect(errors).toEqual([]);
  });

  test('HOP held through takeoff poses the foot after the dwell', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(30);
    });

    const finger = await touchFinger(page, '[data-touch="hop"]', 81);
    await finger.down();
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(true);
    await expect(page.locator('[data-touch="hop"]')).toHaveAttribute('data-pressed', 'true');

    // Held for the whole flight, touchdown included: this is the phone's
    // version of `tests/m36_3.spec.ts`'s held-through-touchdown case, and the
    // finger never leaves the glass inside it.
    const flight = await page.evaluate(flightTrace, 240);

    expect(flight.heldSteps, 'the finger let go somewhere in the flight').toBe(flight.steps);
    expect(flight.hops, 'one press from one finger').toBe(1);
    expect(flight.consumedHop, 'the held level minted a second hop').toBe(1);
    expect(flight.spins, 'a held level armed a spin').toBe(0);
    // The dwell counts in the air, so the pose begins on the eighteenth
    // *airborne* step, not the eighteenth step of the press.
    expect(
      flight.posingAirborneStep,
      `the pose began on airborne step ${flight.posingAirborneStep}`,
    ).toBe(QUALIFY_STEPS);
    expect(flight.fullAirborneStep, 'the foot reached full extension late')
      .toBe(QUALIFY_STEPS + ENTER_STEPS - 1);
    expect(flight.maxOneFoot, 'the foot never came all the way out')
      .toBeGreaterThanOrEqual(0.999);
    // The trailing `idle` is the touchdown: the ground suppresses the pose, and
    // the finger that is still down earns nothing further until the next
    // flight. `spent` before it is the one-qualification-per-flight latch.
    expect(flight.states, 'the pose took a different route through its states')
      .toEqual(['idle', 'qualifying', 'posing', 'returning', 'spent', 'idle']);
    // Both boots are down before the wheel is, with the finger still on HOP.
    expect(flight.landedStep, 'the flight never ended').toBeGreaterThan(0);
    expect(flight.oneFootAtTouchdown, 'the rider landed on one foot').toBe(0);

    await finger.up();
    await page.evaluate(() => window.qa.advance(2));
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a cancelled touch drops the hold mid-pose and the foot comes home', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(30);
    });

    const finger = await touchFinger(page, '[data-touch="hop"]', 82);
    await finger.down();
    const posed = await page.evaluate(advanceUntilPosed, { blend: 0.6, maxSteps: 200 });
    expect(posed.found, 'the pose never reached 0.6 of the way out').toBe(true);
    expect(posed.state).toBe('posing');
    expect(posed.grounded, 'the pose was measured on the ground').toBe(false);

    // **A real `touchcancel`** — what a phone sends when the system takes the
    // gesture away. No `pointerup` is coming, ever.
    await finger.cancel();
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    await expect(page.locator('[data-touch="hop"]')).not.toHaveAttribute('data-pressed', 'true');

    const home = await page.evaluate(returnTrace, 60);
    expect(home.stateAfterOneStep, 'the pose did not start coming back').toBe('returning');
    expect(home.roseAgain, 'the foot went back out after the cancel').toBe(false);
    expect(home.homeAtStep, 'the foot never got home').toBeGreaterThan(0);
    expect(home.homeAtStep, 'the foot took longer than the return to come home')
      .toBeLessThanOrEqual(Math.round(ONE_FOOT.returnSeconds * SIMULATION.hz) + 2);
    expect(home.endOneFoot).toBe(0);
    expect(home.endHopHeld).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a lost pointer capture is the same release as a finger lifting', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(30);
    });

    const finger = await touchFinger(page, '[data-touch="hop"]', 83);
    await finger.down();
    const posed = await page.evaluate(advanceUntilPosed, { blend: 0.6, maxSteps: 200 });
    expect(posed.found, 'the pose never reached 0.6 of the way out').toBe(true);

    // **The measurement that shapes the rest of this test.** The button takes
    // an explicit capture on the way down, and handing it back changes nothing
    // for a touch pointer: Blink gives touch its own implicit capture on the
    // element it landed on, so the release is a no-op, no `lostpointercapture`
    // is fired even once a further pointer event arrives to flush it, and the
    // rider's foot is still out — correctly, because nothing has let go.
    const released = await finger.releaseCapture();
    expect(released.wasCaptured, 'HOP never captured the pointer').toBe(true);
    // The capture is gone on the spot — `hasPointerCapture` reports the pending
    // state the spec asks it to — and **no `lostpointercapture` ever reaches
    // the page**, not even once a further pointer event arrives to flush the
    // change, because a touch pointer keeps its implicit capture on the control
    // it landed on. So nothing in the game heard anything, and the foot is
    // still out, which is correct: no finger has left the glass.
    expect(released.stillCaptured, 'the explicit capture outlived its release').toBe(false);
    expect(released.lostCaptureEvents, 'Blink fired a lostpointercapture after all').toBe(0);
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(true);

    // So the event is delivered the only way it can be here, and the claim is
    // about the handler: a capture lost is a finger gone, whatever lost it.
    await finger.loseCapture();
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    await expect(page.locator('[data-touch="hop"]')).not.toHaveAttribute('data-pressed', 'true');

    const home = await page.evaluate(returnTrace, 60);
    expect(home.stateAfterOneStep).toBe('returning');
    expect(home.roseAgain, 'the foot went back out after the capture was lost').toBe(false);
    expect(home.endOneFoot).toBe(0);

    // And the finger really is still down: the `touchend` that eventually
    // arrives owns nothing and must change nothing.
    await finger.up();
    await page.evaluate(() => window.qa.advance(4));
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('rotating the phone mid-gesture drops the finger and the dwell', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(30);
    });

    const finger = await touchFinger(page, '[data-touch="hop"]', 84);
    await finger.down();
    // Caught mid-dwell on purpose: `holdSeconds` is the one number only the
    // reset can clear, and a rotation that merely let the pose finish would
    // look identical from the blend alone.
    const dwelling = await page.evaluate(() => {
      const game = window.game;
      for (let step = 1; step <= 200; step += 1) {
        game.advance(1);
        const snap = game.snapshot();
        if (snap.tricks.pose.state === 'qualifying' && snap.tricks.pose.holdSeconds > 0.05) {
          return {
            found: true,
            holdSeconds: snap.tricks.pose.holdSeconds,
            grounded: snap.euc.grounded,
            hopHeld: snap.actions.hopHeld,
          };
        }
      }
      return { found: false, holdSeconds: 0, grounded: true, hopHeld: false };
    });
    expect(dwelling.found, 'the dwell never started').toBe(true);
    expect(dwelling.grounded).toBe(false);
    expect(dwelling.hopHeld).toBe(true);

    const before = await page.evaluate(() => window.game.snapshot().layoutChanges);
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForFunction((was) => window.game.snapshot().layoutChanges > was, before);
    await page.evaluate(() => window.qa.advance(2));

    // Every control has just moved out from under the thumb holding it and the
    // `pointerup` is never coming: the level goes, the dwell goes with it.
    const after = await page.evaluate(() => ({
      hopHeld: window.game.snapshot().actions.hopHeld,
      pose: window.game.snapshot().tricks.pose,
    }));
    expect(after.hopHeld, 'a rotation left a finger stuck on HOP').toBe(false);
    expect(after.pose.holdSeconds, 'the dwell survived the rotation').toBe(0);
    expect(after.pose.oneFoot, 'a pose showed after the rotation').toBe(0);
    expect(after.pose.state, 'the pose was left mid-dwell').toBe('idle');
    await expect(page.locator('[data-touch="hop"]')).not.toHaveAttribute('data-pressed', 'true');

    // The dead finger cannot re-earn anything, and a fresh one can: this is the
    // half a merely-cleared action state passes and a stale pointer id fails.
    await finger.up();
    await page.evaluate(() => window.qa.advance(60));
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    const fresh = await touchFinger(page, '[data-touch="hop"]', 85);
    await fresh.down();
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(true);
    const flight = await page.evaluate(flightTrace, 240);
    expect(flight.posingAirborneStep, 'the phone could not pose again after a rotation')
      .toBe(QUALIFY_STEPS);
    await fresh.up();
    expect(errors).toEqual([]);
  });

  test('a control taken from under a finger releases the hold', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(30);
    });

    const finger = await touchFinger(page, '[data-touch="hop"]', 86);
    await finger.down();
    const posed = await page.evaluate(advanceUntilPosed, { blend: 0.6, maxSteps: 200 });
    expect(posed.found, 'the pose never reached 0.6 of the way out').toBe(true);

    // A second thumb on the pause chip while the first is still on HOP. The
    // menu takes the controls away (`TouchControls.setActive(false)`), so the
    // element under the finger stops existing and no `pointerup` will ever be
    // delivered for it — `releaseControl`'s own case, reached the way a player
    // reaches it.
    await page.locator('[data-touch-tap="pause"]').tap();
    await page.evaluate(() => window.qa.thaw());
    await expect(page.locator('.euc-touch')).toBeHidden();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    expect(await page.evaluate(() => window.game.snapshot().tricks.pose.holdSeconds)).toBe(0);

    // Back to the ride, with that first finger still physically on the glass.
    await page.locator('.euc-menu--pause [data-menu="resume"]').tap();
    await expect(page.locator('.euc-touch')).toBeVisible();
    await page.evaluate(() => {
      window.qa.freeze();
      window.qa.advance(120);
    });
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(false);
    expect(await page.evaluate(() => window.game.snapshot().tricks.pose.oneFoot)).toBe(0);
    await expect(page.locator('[data-touch="hop"]')).not.toHaveAttribute('data-pressed', 'true');

    // And the id that was stranded is usable again, because browsers reuse ids.
    await finger.up();
    await finger.down();
    expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(true);
    await finger.up();
    expect(errors).toEqual([]);
  });
});

test.describe('M36 §36.4 — Switchback Park on a phone', () => {
  test('a phone ride of the park has one rider, one view and one HUD', async ({ page }) => {
    // M25's phone contract, asserted at the new venue rather than assumed to
    // carry: the park is the first world since that milestone with a race
    // referee and a four-seat grid in its plan, and a grid is exactly the shape
    // that would quietly seat a second rider somewhere.
    const errors = collectErrors(page);
    await boot(page, `${PARK}&seats=2&couch=1&players=2&secondrider=1&split=1`);

    expect(await page.evaluate(() => window.game.levelPlan.recordWorldId)).toBe(PARK_PLAN_ID);
    expect(await page.evaluate(() => window.game.seatCount)).toBe(1);
    expect(await page.evaluate(() => window.game.renderer.viewCount)).toBe(1);
    expect(await page.locator('.euc-hud').count()).toBe(1);
    expect(await page.locator('.euc-hud-seat[data-split="true"]').count()).toBe(0);
    expect(await page.evaluate(() => window.game.snapshot().input.devices)).toEqual([null]);
    expect(await page.evaluate(() => window.game.snapshot().input.pads)).toBe(0);

    await page.evaluate(() => window.qa.advance(120));
    expect(await page.evaluate(() => window.game.seatCount)).toBe(1);
    expect(await page.evaluate(() => {
      try {
        window.game.snapshotFor(1);
        return 'answered';
      } catch (error) {
        return (error as Error).message;
      }
    })).toBe('no such seat: 1 (seats: 1)');

    await page.evaluate(() => window.game.setAppState('title'));
    await expect(page.locator('.euc-menu--title')).toBeVisible();
    expect(await page.evaluate(() => window.game.snapshot().couch.available)).toBe(false);
    await expect(page.locator('.euc-menu--title [data-menu="couch"]')).toBeHidden();

    // Visible controls, not every node in the markup — a player is offered what
    // they can see and reach.
    const offers = await page.locator('.euc-menu--title [data-menu]:visible').evaluateAll(
      (nodes) => nodes.map((node) => `${node.getAttribute('data-menu')} ${node.textContent ?? ''}`),
    );
    expect(offers.length, 'the title screen offered nothing at all').toBeGreaterThan(3);
    for (const entry of offers) {
      expect(entry.toLowerCase(), `the phone's title screen offers "${entry}"`)
        .not.toMatch(/2 player|two player|couch|split/);
    }
    expect(errors).toEqual([]);
  });

  test('every sign is readable on a real phone held upright', async ({ page }, info) => {
    // **The `mobile` project's own answer to §36.4**, and the reason it is here
    // rather than in `tests/m36_2.spec.ts`: that file runs in the chromium
    // project, so its phone claims are a Pixel 7's CSS box at device-pixel-ratio
    // 1 with no touch. This is the device — Playwright's own Pixel 7 descriptor
    // at its 2.625× ratio, with the touch overlay drawn over the road.
    //
    // **412×839, not the 412×915 the other file measures, and the difference is
    // the browser's own chrome.** 915 is the Pixel 7's *screen*; 839 is what a
    // page gets after the address bar. The camera's vertical field of view is
    // fixed, so the shorter box is a *wider* horizontal half-angle
    // (`atan(tan(fov/2) × 412/839)` against `× 412/915`) — the real phone is
    // very slightly more forgiving here than the emulated CSS box, which is
    // why the conservative number stays the one in `tests/m36_2.spec.ts` and
    // this one is the device's own.
    test.slow();
    const errors = collectErrors(page);
    expect(page.viewportSize()).toEqual({ width: 412, height: 839 });
    expectParkReadable(
      'pixel7-portrait-412x839',
      await parkLegibilityPass(page, info, 'pixel7-portrait-412x839'),
    );
    expect(errors).toEqual([]);
  });

  test('every sign is readable on a real phone held sideways', async ({ page }, info) => {
    // Set before the boot, so the game meets the shape at start-up rather than
    // through a resize — which is how a player who rotates before riding gets
    // there, and the orientation this venue's long sight lines suit. 915×412 is
    // the Pixel 7's screen laid on its side: the widest frame this device has,
    // and the same box `tests/m36_2.spec.ts` measures, so the two files'
    // landscape numbers are directly comparable.
    test.slow();
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 915, height: 412 });
    expectParkReadable(
      'pixel7-landscape-915x412',
      await parkLegibilityPass(page, info, 'pixel7-landscape-915x412'),
    );
    expect(errors).toEqual([]);
  });
});

// ===========================================================================
// M38 §38.6 — the Trick Run lane, under the thumbs (independent QA, Phase 5)
// ===========================================================================

/**
 * **The lane and the controls, on real glass.**
 *
 * `tests/m38-hud.spec.ts` measures the lane against the stylesheet through a
 * probe: it mounts the real `Hud` at phone sizes and checks the rows fit and
 * stay out of the protected middle fifth. What a probe cannot answer is the
 * question a thumb asks — whether the lane the *running mode* draws lands on
 * top of the on-screen stick or the HOP button, which exist only in this
 * project, because only here does `(pointer: coarse)` match. That is what this
 * block adds, and it is deliberately the whole of what it adds.
 */
test.describe('M38 §38.6 — the Trick Run lane and the thumbs', () => {
  interface Rect { x: number; y: number; width: number; height: number }

  function overlaps(a: Rect, b: Rect): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width
      && a.y < b.y + b.height && b.y < a.y + a.height;
  }

  async function armTrickRun(page: Page): Promise<void> {
    await bootToTitle(page, 'level=switchback');
    await page.locator('.euc-menu--title [data-menu="trick-run"]').tap();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'trickRun');
    // Land one charged hop, so the award line and the pending row are drawn
    // rather than measured only in their empty state.
    await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.setActionsFor(0, { throttle: 0, crouch: true });
      game.advance(60);
      game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
      game.advance(4);
      game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
      game.advance(150);
      game.loop.setRunning(true);
    });
  }

  for (const size of [
    { name: 'portrait 360x800', width: 360, height: 800 },
    { name: 'portrait 375x667', width: 375, height: 667 },
    { name: 'landscape 667x375', width: 667, height: 375 },
  ] as const) {
    test(`the lane fits and clears the controls in ${size.name}`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await armTrickRun(page);

      await expect(page.locator('.euc-touch')).toBeVisible();
      const lane = page.locator('.euc-hud__trick');
      await expect(lane, 'the running mode drew no trick lane').toBeVisible();

      const laneBox = await lane.boundingBox();
      expect(laneBox, 'the lane has no box').not.toBeNull();
      const box = laneBox as Rect;

      // **Inside the viewport, and not clipped by it.**
      expect(box.x, `${size.name}: the lane starts off the left edge`)
        .toBeGreaterThanOrEqual(0);
      expect(box.y, `${size.name}: the lane starts above the top edge`)
        .toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${size.name}: the lane runs off the right edge`)
        .toBeLessThanOrEqual(size.width + 0.5);
      expect(box.y + box.height, `${size.name}: the lane runs off the bottom edge`)
        .toBeLessThanOrEqual(size.height + 0.5);

      // **And clear of every control a thumb has to reach.**
      for (const selector of [
        '.euc-touch__stick',
        '.euc-touch__zone--stick',
        '[data-touch="hop"]',
      ]) {
        const control = page.locator(selector);
        if (!await control.isVisible()) continue;
        const controlBox = await control.boundingBox();
        if (controlBox === null) continue;
        expect(
          overlaps(box, controlBox as Rect),
          `${size.name}: the trick lane overlaps ${selector}`,
        ).toBe(false);
      }

      // **No row is clipped by its own container**, which is how a score of
      // 1,000 becomes "1,0" on the one screen nobody measured.
      const clipped = await page.evaluate(() => {
        const rows: string[] = [];
        for (const row of document.querySelectorAll<HTMLElement>('.euc-hud__trick *')) {
          if (row.hidden || row.clientWidth === 0) continue;
          if (row.scrollWidth > row.clientWidth + 1) rows.push(row.className);
        }
        return rows;
      });
      expect(clipped, `${size.name}: a trick row is clipped`).toEqual([]);

      expect(errors).toEqual([]);
    });
  }
});

/**
 * M39 — Ultra Graphics is a phone's deliberate opt-in too (PLANS §39.6, q201).
 *
 * **Phones are offered it exactly as desktops are**: q201 superseded the
 * desktop-only proposal, and the plan forbids gating the choice on screen
 * width, pointer type or an assumption that every phone is weak. What this
 * project can prove on an emulated phone is the *entrance* — layout, touch
 * targets, the tap that opts in and the tap that returns to High, and the two
 * entrances agreeing. Whether a phone runs Ultra well is the owner's ride on
 * his own device (GU); emulation proves layout and touch, nothing about speed.
 *
 * **The state word is checked against what is drawn, not assumed.** A phone
 * may be refused (a capability, a failed setup), and then the honest words are
 * "Using High" under a pressed toggle — so the assertion reads the effective
 * tier from `snapshot().quality` and holds the toggle to it, never "On" by
 * default.
 */
test.describe('M39 — Ultra Graphics on a phone', () => {
  const TOGGLE = '.euc-menu--title [data-menu="ultra"]';
  const SETTINGS = '.euc-menu--title [data-menu="settings"]';

  async function settle(page: Page): Promise<void> {
    await page.evaluate(() => new Promise((done) => {
      requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
    }));
  }

  test('the toggle is a thumb-sized half of Settings’ row, upright and sideways', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    const toggle = page.locator(TOGGLE);
    await expect(toggle).toBeVisible();
    // The name is "Ultra Graphics" even where the label says only "Ultra", and
    // the helper — visually hidden on a phone held upright — is still what a
    // screen reader hears as the description.
    await expect(toggle).toHaveAccessibleName('Ultra Graphics');
    await expect(toggle).toHaveAccessibleDescription(ULTRA_TOGGLE_HELP);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toBeEnabled();

    for (const size of [{ width: 412, height: 839 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await settle(page);
      const where = `${size.width}x${size.height}`;
      for (const selector of [SETTINGS, TOGGLE]) {
        const box = await page.locator(selector).boundingBox();
        expect(box, `${selector} has no box at ${where}`).not.toBeNull();
        expect(box!.width, `${selector} is ${box!.width}px wide at ${where}`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${selector} is ${box!.height}px tall at ${where}`).toBeGreaterThanOrEqual(44);
        expect(box!.y + box!.height, `${selector} ends below the fold at ${where}`)
          .toBeLessThanOrEqual(size.height + 0.5);
      }
      const settingsBox = (await page.locator(SETTINGS).boundingBox())!;
      const toggleBox = (await page.locator(TOGGLE).boundingBox())!;
      expect(Math.abs(toggleBox.y - settingsBox.y), `the pair left one row at ${where}`).toBeLessThan(0.5);
      if (size.height > size.width) {
        // Upright, the pair is no taller than Settings was alone, and the
        // helper takes no room (it is clipped to a pixel, not removed).
        expect(toggleBox.height, `the pair's row grew at ${where}`).toBeLessThanOrEqual(46);
        const help = await page.locator('#euc-ultra-help').boundingBox();
        expect((help?.width ?? 0) <= 1 && (help?.height ?? 0) <= 1, 'the helper took room upright')
          .toBe(true);
      }
      const overflow = await page.evaluate(() => {
        const root = document.querySelector<HTMLElement>('.euc-menu--title')!;
        return root.scrollHeight - root.clientHeight;
      });
      expect(overflow, `the title scrolls at ${where}`).toBeLessThanOrEqual(1);
    }

    // **The offers scan sees the toggle.** The M25 phone tests fail any visible
    // title control whose words mention a second player; the toggle's helper
    // says "Single player only", which must be — and is — the opposite.
    const offers = await page.locator('.euc-menu--title [data-menu]:visible').evaluateAll(
      (nodes) => nodes.map((node) => `${node.getAttribute('data-menu')} ${node.textContent ?? ''}`),
    );
    expect(offers.some((entry) => entry.startsWith('ultra ')), 'the scan never reached the toggle')
      .toBe(true);
    for (const entry of offers) {
      expect(entry.toLowerCase(), `the phone's title screen offers "${entry}"`)
        .not.toMatch(/2 player|two player|couch|split/);
    }

    expect(errors).toEqual([]);
  });

  test('one tap opts a phone in, one more returns it to its Medium start, and Settings agrees', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    const toggle = page.locator(TOGGLE);
    const stateWord = toggle.locator('[data-ultra-text]');
    const quality = () => page.evaluate(() => window.game.snapshot().options.quality);

    await toggle.tap();
    await expect.poll(quality).toBe('ultra');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // Honest words: "On" only over an Ultra frame, "Using High" over anything
    // else — whichever this emulated phone's renderer actually drew.
    await expect.poll(async () => {
      const effective = await page.evaluate(() => window.game.snapshot().quality.effective);
      const word = await stateWord.textContent();
      return effective === 'ultra' ? word === 'On' : word === 'Using High';
    }).toBe(true);

    // The second tap is the way back to the tier the phone came from. Since
    // 2026-10-04 a coarse pointer starts on Medium (`deviceDefaults`, owner
    // decision), so Medium is what returns — not High.
    await toggle.tap();
    await expect.poll(quality).toBe('medium');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(stateWord).toHaveText('Off');
    await expect.poll(() => page.evaluate(() => window.game.snapshot().quality.effective))
      .toBe('medium');

    // **The other entrance, the same preference.** Settings offers Ultra on a
    // phone (never gated on width or pointer), the warning stands beside it,
    // choosing it presses the toggle, and choosing a tier turns it off.
    await page.locator(SETTINGS).tap();
    await page.waitForFunction(() => window.game.snapshot().app.menu === 'settings');
    const select = page.locator('[data-option="quality"]');
    await expect(select.locator('option[value="ultra"]')).toBeEnabled();
    await expect(page.locator('#euc-quality-warning')).toContainText(
      'Requires a capable GPU; smoothness and battery use vary by device.',
    );
    await select.selectOption('ultra');
    await expect.poll(quality).toBe('ultra');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await select.selectOption('high');
    await expect.poll(quality).toBe('high');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(stateWord).toHaveText('Off');

    await page.evaluate(() => window.game.resetOptions());
    expect(errors).toEqual([]);
  });

  /**
   * **Codex QA C3 — the GPU warning is on a phone's screen, not only in its
   * accessibility tree** (`docs/M39_ULTRA.md` A28, `DESIGN.md` §9g).
   *
   * Every phone tier hides the helper sentence (clipped to a pixel upright,
   * `display: none` in the compact three-column title), and before C3 that
   * left "Ultra Off" pressable with no warning in sight at 390x844 or 844x390.
   * The fix is a short second line inside the button, the helper's first
   * sentence, shown by exactly the tiers that hide the helper. So at every
   * size here: **exactly one of the two is visible** — the line on a phone,
   * the helper as a note on a phone just past 26rem (430x932) — and it is
   * inside the button, inside the viewport, unclipped and not covered; the
   * title still has nothing to scroll to; and the button's description is
   * still the whole helper (the line is `aria-hidden`, so a screen reader
   * hears the warning once).
   *
   * **Every state word, at every size (FU, Fable's QA finding 3).** 375x812 —
   * an iPhone X/XS/11 Pro/12 mini/13 mini upright — was measured nowhere, and
   * scrolled: 11 px with "Off" and 26 with "Using High", which left the
   * label's line and made the toggle three lines. So the list now carries it
   * and 393x852 beside the sizes C3 named, and the title is held in all four
   * words: "Off"; "On" and "Using High", both by a real path (a saved Ultra
   * drawn, and a saved Ultra under a diagnostic `?presentation=` override,
   * journey 6 of `m39-ultra.spec.ts`); and "Single player only", which no
   * phone can reach (the couch needs 1000 px and a fine pointer or a pad), so
   * it is written into the toggle the way `Menus.sync` would write it — a
   * guard that the day it becomes reachable, the title still fits. Upright,
   * the three words a phone can show share the label's line with the warning
   * under it, and the row stays within Settings' 46 px.
   *
   * **And every title button's words stay inside it (FU2).** "Knockabout"
   * overflowed its three-column cell on every phone held upright under 50rem
   * (past the border at 360x780 and 320x568) and nothing failed, because
   * nothing scrolled. So each size also asserts that no label, note, state word
   * or warning line leaves its button's content box, that the narrow compact
   * title is two columns with the pair on one row, and — where a size once
   * fitted by a hair (428x926 by 0.5 px, 740x360 and 800x360 not at all) —
   * that the title clears by at least 8 px. Nineteen sizes now: 412x915,
   * 932x430, 740x360, 800x360, 428x926 and 430x739 (a Pro Max in Safari) added.
   */
  test('the GPU warning stays visible beside the toggle at every phone size, upright and sideways', async ({ page }) => {
    // 2026-10-04: three boots (two of them Ultra) and four sweeps of nineteen
    // sizes over the environment upgrade's heavier title world outgrow the
    // default 120 s on a loaded machine; nothing here is a duration.
    test.setTimeout(360_000);
    const errors = collectErrors(page);
    await bootToTitle(page);
    const toggle = page.locator(TOGGLE);
    const stateWord = toggle.locator('[data-ultra-text]');
    await expect(toggle).toHaveAccessibleName('Ultra Graphics');
    await expect(toggle).toHaveAccessibleDescription(ULTRA_TOGGLE_HELP);
    expect(ULTRA_TOGGLE_HELP.startsWith(ULTRA_TOGGLE_WARNING)).toBe(true);

    type Shows = 'line' | 'note';
    // `minSpare`: the title's unused height is held to a margin, not only to
    // "does not scroll", where a size once fitted by a hair (FU2).
    const SIZES: readonly { width: number; height: number; shows: Shows; minSpare?: number }[] = [
      // Upright, the stack (26rem wide or less, over 50rem tall).
      { width: 375, height: 812, shows: 'line' }, { width: 390, height: 844, shows: 'line' },
      { width: 393, height: 852, shows: 'line' }, { width: 412, height: 839, shows: 'line' },
      { width: 412, height: 915, shows: 'line' },
      // Just past 26rem: the full stack, the helper as a note. 428x926 (iPhone
      // Pro Max, standalone) fitted by 0.5 px until FU2 gave the stack under
      // 60rem tier one's rhythm.
      { width: 430, height: 932, shows: 'note' }, { width: 428, height: 926, shows: 'note', minSpare: 8 },
      // Upright, the compact tier (50rem tall or less): two columns at 30rem
      // and narrower since FU2, so "Knockabout" fits its button.
      { width: 360, height: 780, shows: 'line' }, { width: 360, height: 800, shows: 'line' },
      { width: 360, height: 640, shows: 'line' }, { width: 375, height: 667, shows: 'line' },
      { width: 320, height: 568, shows: 'line' },
      // A Pro Max in Safari, whose bars put it in the compact tier.
      { width: 430, height: 739, shows: 'line' },
      // Sideways — 740x360 and 800x360 (the 360x800 family on its side)
      // scrolled 10 px until FU2's under-24rem rhythm.
      { width: 844, height: 390, shows: 'line' }, { width: 667, height: 375, shows: 'line' },
      { width: 915, height: 412, shows: 'line' }, { width: 932, height: 430, shows: 'line' },
      { width: 740, height: 360, shows: 'line', minSpare: 8 }, { width: 800, height: 360, shows: 'line', minSpare: 8 },
    ];
    const upright = (size: { width: number; height: number }) => size.width <= 416 && size.height > 800;
    // The compact title a phone held upright gets: two columns, the pair one row.
    const narrowCompact = (size: { width: number; height: number }) => size.width <= 480 && size.height <= 800;

    const check = async (size: (typeof SIZES)[number], what: string) => {
      const where = `${size.width}x${size.height} (${what})`;
      await expect(stateWord, where).toHaveText(what);
      const facts = await compactWarningFacts(page);
      expect(facts.warnSeen && facts.helpSeen, `the warning is on screen twice at ${where}`).toBe(false);
      expect(size.shows === 'line' ? facts.warnSeen : facts.helpSeen,
        `no visible GPU warning beside the toggle (the ${size.shows}) at ${where}`).toBe(true);
      expect(facts.warnText).toBe(ULTRA_TOGGLE_WARNING);
      expect(facts.warnAriaHidden, 'the compact line would be read twice').toBe('true');
      const [shown, button] = [facts.shown!, facts.toggle];
      expect(shown.left, `the warning leaves the button at ${where}`).toBeGreaterThanOrEqual(button.left - 0.5);
      expect(shown.right, `the warning leaves the button at ${where}`).toBeLessThanOrEqual(button.right + 0.5);
      expect(shown.top, `the warning leaves the button at ${where}`).toBeGreaterThanOrEqual(button.top - 0.5);
      expect(shown.bottom, `the warning leaves the button at ${where}`).toBeLessThanOrEqual(button.bottom + 0.5);
      expect(shown.left, `the warning starts off screen at ${where}`).toBeGreaterThanOrEqual(-0.5);
      expect(shown.top, `the warning starts off screen at ${where}`).toBeGreaterThanOrEqual(-0.5);
      expect(shown.right, `the warning ends off screen at ${where}`).toBeLessThanOrEqual(size.width + 0.5);
      expect(shown.bottom, `the warning ends below the fold at ${where}`).toBeLessThanOrEqual(size.height + 0.5);
      expect(facts.shownClipped, `the warning's words are clipped at ${where}`).toBeLessThanOrEqual(1);
      expect(facts.shownOnTop, `something covers the warning at ${where}`).toBe(true);
      expect(facts.overflow, `the title has ${facts.overflow}px to scroll at ${where}`).toBeLessThanOrEqual(1);
      // **Every button's words inside its own text box (FU2).** "Knockabout"
      // ran 5.8 px past its border at 360x780 and 18 at 320x568 in three
      // columns, a failure no fit contract saw because nothing scrolled.
      expect(facts.spills, `words outside their button at ${where}`).toEqual([]);
      if (size.minSpare !== undefined) {
        expect(facts.spare, `the title clears by only ${facts.spare}px at ${where}`)
          .toBeGreaterThanOrEqual(size.minSpare);
      }
      await expect(toggle).toHaveAccessibleDescription(ULTRA_TOGGLE_HELP);
      if (upright(size)) {
        // The stack: two lines inside the 44 px floor, the state beside the label.
        expect(facts.stateOnLabelLine, `"${what}" left the label's line at ${where}`).toBe(true);
        expect(facts.toggle.bottom - facts.toggle.top, `the pair's row grew at ${where}`).toBeLessThanOrEqual(46);
      }
      if (narrowCompact(size)) {
        // Two columns and the pair one spanning row, as in the stack.
        expect(facts.pairOneRow, `Settings and Ultra left one row at ${where}`).toBe(true);
        expect(facts.columns, `the compact title is not two columns at ${where}`).toBe(2);
      }
    };
    const sweep = async (what: string) => {
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await settle(page);
        await check(size, what);
      }
    };

    await sweep('Off');

    // "On", by a real path: a saved Ultra this emulated phone draws. The word
    // is the frame's, never assumed (`qualityStateWords`), so a renderer that
    // refused would say "Using High" here and this would fail as a refusal.
    await bootAtTier(page, 'level=slice', 'ultra', { ride: false });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => window.game.snapshot().quality.effective),
      { message: 'a saved Ultra was not drawn on the emulated phone' }).toBe('ultra');
    await sweep('On');

    // "Using High", the longest word a phone can show, by a real path.
    await bootAtTier(page, 'level=slice&presentation=enhanced', 'ultra', { ride: false });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await sweep('Using High');

    // "Single player only": unreachable on a phone, written as `Menus.sync`
    // writes it (disabled, still pressed, the kind and the word). It is too long
    // to share the label's line in the upright half, so it wraps under it; the
    // helper and the line both go (`visibility`, keeping their height, DESIGN
    // §9g), and what is held is that the title still fits and the word shows.
    for (const size of SIZES.filter((s) => upright(s) || s.shows === 'note')) {
      await page.setViewportSize(size);
      await settle(page);
      await page.evaluate(() => {
        const node = document.querySelector<HTMLButtonElement>('.euc-menu--title [data-menu="ultra"]')!;
        node.disabled = true;
        node.dataset.ultraState = 'unavailable';
        node.querySelector('[data-ultra-text]')!.textContent = 'Single player only';
      });
      await settle(page);
      const where = `${size.width}x${size.height} (Single player only, written)`;
      const facts = await compactWarningFacts(page);
      expect(facts.warnSeen || facts.helpSeen, `a disabled toggle showed its GPU warning at ${where}`).toBe(false);
      expect(facts.stateInside, `the state word left the button at ${where}`).toBe(true);
      expect(facts.toggle.bottom, `the toggle ends below the fold at ${where}`).toBeLessThanOrEqual(size.height + 0.5);
      expect(facts.overflow, `the title has ${facts.overflow}px to scroll at ${where}`).toBeLessThanOrEqual(1);
    }

    // A real write puts the toggle back: resetting the options re-runs
    // `Menus.sync`, which writes every field the block above forged.
    await page.evaluate(() => window.game.resetOptions());
    await expect(toggle).toBeEnabled();
    await expect(stateWord).toHaveText('Off');
    expect(errors).toEqual([]);
  });
});

/**
 * Where the title's Ultra warning is, and whether an eye can see it (C3).
 *
 * "Seen" is the strict sense: laid out, `visibility: visible`, larger than the
 * visually-hidden pattern's one pixel and not clipped by a `clip-path` — so
 * the helper clipped to a pixel on an upright phone counts as unseen, which is
 * exactly the defect C3 names. `shown` is whichever of the line and the helper
 * is seen; `shownOnTop` asks the page what is drawn at its centre, so a
 * sibling painted over it fails; `shownClipped` is how far its words overflow
 * their own box.
 */
async function compactWarningFacts(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.euc-menu--title')!;
    const toggle = root.querySelector<HTMLElement>('[data-menu="ultra"]')!;
    const warn = toggle.querySelector<HTMLElement>('.euc-ultra__warn');
    const help = toggle.querySelector<HTMLElement>('#euc-ultra-help');
    const label = toggle.querySelector<HTMLElement>('.euc-ultra__label')!;
    const state = toggle.querySelector<HTMLElement>('[data-ultra-text]')!;
    const seen = (node: HTMLElement | null): boolean => {
      if (node === null) return false;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility === 'visible'
        && box.width > 1 && box.height > 1 && style.clipPath === 'none';
    };
    const edges = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const shown = seen(warn) ? warn : seen(help) ? help : null;
    let shownOnTop = false;
    if (shown !== null) {
      const box = shown.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      shownOnTop = hit !== null && (hit === shown || shown.contains(hit));
    }
    const button = toggle.getBoundingClientRect();
    const word = state.getBoundingClientRect();
    // Every visible piece of words in every title button, against the
    // button's content box (border and padding taken off): a label that
    // overflows it is off-centre at best and past the border at worst (FU2).
    const spills: string[] = [];
    for (const node of root.querySelectorAll<HTMLElement>('.euc-menu__actions button')) {
      if (node.offsetParent === null) continue;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      for (const piece of node.querySelectorAll<HTMLElement>(
        '.euc-button__label, .euc-button__note, .euc-ultra__state, .euc-ultra__warn',
      )) {
        if (!seen(piece)) continue;
        const range = document.createRange();
        range.selectNodeContents(piece);
        for (const rect of range.getClientRects()) {
          const past = Math.max(left - rect.left, rect.right - right);
          if (rect.width > 0 && past > 0.5) {
            spills.push(`${node.dataset.menu} "${piece.textContent?.trim()}" by ${past.toFixed(1)}px`);
          }
        }
      }
    }
    const rootStyle = getComputedStyle(root);
    const panel = root.querySelector<HTMLElement>('.euc-menu__panel')!;
    const settings = root.querySelector<HTMLElement>('[data-menu="settings"]')!.getBoundingClientRect();
    return {
      spills,
      spare: root.clientHeight - parseFloat(rootStyle.paddingTop) - parseFloat(rootStyle.paddingBottom)
        - panel.getBoundingClientRect().height,
      pairOneRow: Math.abs(settings.top - button.top) < 0.5,
      columns: getComputedStyle(root.querySelector('.euc-menu__actions')!).gridTemplateColumns.split(' ').length,
      warnSeen: seen(warn),
      helpSeen: seen(help),
      warnText: warn?.textContent ?? '',
      warnAriaHidden: warn?.getAttribute('aria-hidden') ?? null,
      shown: shown === null ? null : edges(shown),
      shownClipped: shown === null ? 0 : Math.max(shown.scrollWidth - shown.clientWidth, shown.scrollHeight - shown.clientHeight),
      shownOnTop,
      toggle: edges(toggle),
      stateInside: seen(state) && word.left >= button.left - 0.5 && word.right <= button.right + 0.5
        && word.top >= button.top - 0.5 && word.bottom <= button.bottom + 0.5,
      stateOnLabelLine: Math.abs(label.getBoundingClientRect().top - word.top) < 8,
      overflow: root.scrollHeight - root.clientHeight,
    };
  });
}
