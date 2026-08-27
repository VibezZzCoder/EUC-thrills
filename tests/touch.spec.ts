/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { CHARACTER_IDS } from '../src/data/riders.ts';
import { TRACK_LAP_SEGMENT_IDS } from '../src/level/trackLevel.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

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
    const errors = collectErrors(page);
    await bootToTitle(page, 'level=track');
    expect(await page.evaluate(() => window.game.levelPlan.id)).toBe('belvar-r1');

    // A real touch starts the ride; the rest is a deterministic physical lap
    // so this tests the mobile renderer and controller rather than a timer.
    await page.locator('[data-menu="start"]').tap();
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');

    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.euc-touch')).toBeVisible();
    expect(await page.evaluate(() => ({
      state: window.game.snapshot().app.state,
      level: window.game.levelPlan.id,
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

    await page.locator('.euc-menu--routes [data-menu="ride-route"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().route.pending))
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

    const targets = ['#euc-seed', '[data-menu="surprise"]', '[data-menu="ride-route"]',
      '[data-menu="trial-route"]', '[data-menu="routes-back"]'];
    for (const selector of targets) {
      const box = await page.locator(`.euc-menu--routes ${selector}`).boundingBox();
      expect(box, `${selector} has no box`).not.toBeNull();
      expect(box!.height, `${selector} is ${box!.height}px tall`).toBeGreaterThanOrEqual(44);
    }

    // A field whose text is under 16px makes a phone zoom in on focus and never
    // zoom back out, leaving the player panning around a panel.
    const fontPx = await page.locator('#euc-seed')
      .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
    expect(fontPx).toBeGreaterThanOrEqual(16);
  });

  test('a refused seed is readable, and leaves the phone where it was', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);
    await page.locator('.euc-menu--title [data-menu="routes"]').tap();

    await page.locator('#euc-seed').fill('route-12');
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

    await page.locator('.euc-menu--routes [data-menu="surprise"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().route.pending))
      .toBe(false);

    const loaded = await page.evaluate(() => window.game.snapshot().world);
    expect(loaded.generated).toBe(true);
    await expect(page.locator('#euc-seed')).toHaveValue(loaded.seed);

    await page.locator('.euc-menu--routes [data-menu="ride-route"]').tap();
    await expect
      .poll(async () => page.evaluate(() => window.game.snapshot().app.state))
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

    // Stand still and let Officer Dorkins do the busting — the owner's own
    // route to this card. Frozen-stepped, the harness's first rule.
    await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      for (let i = 0; i < 400; i += 1) {
        game.setActions({});
        game.advance(60);
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
    await page.waitForFunction(
      () => window.game.snapshot().app.state === 'trackDay',
      undefined,
      { timeout: 30_000 },
    );
    expect(await page.evaluate(() => window.game.levelPlan.id)).toBe('belvar-r1');
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
});
