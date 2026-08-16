/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M9 — HUD, menus, options, accessibility, input.
 *
 * The exit question is *"can a new player start riding without being told
 * how?"*, and no automated layer can answer it. What this file can do is prove
 * the things that question depends on and that a human cannot check reliably:
 * that the state machine never leaves ride input live behind a menu, that the
 * options firewall holds at runtime as well as at compile time, that settings
 * survive a reload, that a rebind reaches the wheel, and that the speed FOV
 * cue survives the owner's motion cleanup.
 *
 * **The headless suite carries most of M9's logic** — the options model, the
 * state machine, the HUD's dwell timers, the onboarding sequence, the binding
 * resolver and the gamepad mapping are pure and covered by
 * covered by `node --test`. What is here is what only a browser can answer:
 * the DOM exists and says the right thing, real keys and real clicks reach the
 * real systems, focus behaves, and a reload remembers.
 */

/** Options as the game currently has them. */
function options(page: Page) {
  return page.evaluate(() => window.game.snapshot().options);
}

function app(page: Page) {
  return page.evaluate(() => window.game.snapshot().app);
}

/**
 * Scope a menu button to the panel it belongs to.
 *
 * The title and pause menu both offer Settings, and a hidden panel's buttons
 * still match a bare attribute selector — so an unscoped locator is ambiguous
 * rather than merely imprecise. Scoping also states which screen the test
 * believes it is on, which is the thing being tested.
 */
function menuButton(page: Page, panel: 'title' | 'pause' | 'settings', action: string) {
  return page.locator(`.euc-menu--${panel} [data-menu="${action}"]`);
}

test.describe('M9 — HUD, menus, options', () => {
  test('the game boots to a title screen with the ride one click away', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    expect(await app(page)).toMatchObject({ state: 'title', menu: 'title', acceptsRideInput: false });
    // Start Ride is the primary action and the first thing focus lands on, so
    // a player who touches nothing but the keyboard is already on it.
    const start = page.locator('[data-menu="start"]');
    await expect(start).toBeVisible();
    await expect(start).toBeFocused();
    // Cool Rider is identified on the title screen rather than behind a
    // one-choice selection screen — the owner's decision, 2026-08-05.
    await expect(page.locator('.euc-menu--title')).toContainText('Cool Rider');
    await expect(page.locator('.euc-menu--title [data-menu="controls"]')).toHaveCount(0);
    await expect(page.locator('.euc-menu--title [data-menu="settings"]')).toBeVisible();

    await start.click();
    expect(await app(page)).toMatchObject({ state: 'freeRide', menu: 'none', acceptsRideInput: true });
    await expect(page.locator('.euc-hud')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('a key pressed at the title screen does not ride the wheel away', async ({ page }) => {
    // The reason the state machine exists. Before M9 the game booted into a
    // live ride; a menu that left the throttle live would send the rider into
    // the distance behind a card the player is still reading.
    await bootToTitle(page);

    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => window.game.snapshot().tick > 120);
    const parked = await page.evaluate(() => window.game.snapshot().euc.speed);
    await page.keyboard.up('KeyW');
    expect(parked).toBe(0);

    // And the world is still alive behind the card rather than frozen — the
    // title is the real level, not a still image.
    expect(await page.evaluate(() => window.game.snapshot().app.simulates)).toBe(true);
  });

  test('the HUD reports the ride and keeps the playfield centre clear', async ({ page }) => {
    await boot(page);

    const reading = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.setActions({ throttle: 1 });
      game.advance(600);
      game.setActions({ throttle: 0 });
      const snap = game.snapshot();
      const speedNode = document.querySelector('[data-hud="speed"]');
      const hud = document.querySelector('.euc-hud') as HTMLElement;
      const box = hud.getBoundingClientRect();
      // Every lane, as the browser actually laid it out.
      const lanes = [...hud.querySelectorAll<HTMLElement>('.euc-hud__speed, .euc-hud__objective, .euc-hud__cues, .euc-hud__challenge')]
        .filter((node) => node.getBoundingClientRect().width > 0)
        .map((node) => node.getBoundingClientRect());
      return {
        hudSpeed: snap.hud.speed,
        domSpeed: speedNode?.textContent ?? '',
        kph: snap.euc.speedKph,
        // The middle fifth of the screen in both axes: the rider, and the
        // ground they are about to reach.
        centre: {
          left: box.width * 0.4,
          right: box.width * 0.6,
          top: box.height * 0.4,
          bottom: box.height * 0.6,
        },
        lanes,
      };
    });

    // The model and the DOM agree, which is the thing a DOM-only assertion
    // could not tell you.
    expect(reading.domSpeed).toBe(reading.hudSpeed);
    expect(Number(reading.hudSpeed)).toBe(Math.round(reading.kph));
    expect(Number(reading.hudSpeed)).toBeGreaterThan(10);

    for (const lane of reading.lanes) {
      const overlaps = lane.right > reading.centre.left
        && lane.left < reading.centre.right
        && lane.bottom > reading.centre.top
        && lane.top < reading.centre.bottom;
      expect(overlaps, `a HUD lane covers the playfield centre: ${JSON.stringify(lane)}`).toBe(false);
    }
  });

  test('the HUD does not swallow a click aimed at the game', async ({ page }) => {
    await boot(page);
    const target = await page.evaluate(() => {
      const hud = document.querySelector('.euc-hud') as HTMLElement;
      const box = hud.getBoundingClientRect();
      // Bottom-left, right on top of the big speed number.
      const hit = document.elementFromPoint(box.width * 0.06, box.height * 0.92);
      return hit?.tagName ?? 'none';
    });
    expect(target).toBe('CANVAS');
  });

  test('the power ladder finally has the amber HUD it was promised at M6', async ({ page }) => {
    await boot(page);

    const warned = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      // Drive the load straight from the controller's own tuning rather than
      // hunting for a hill: the HUD's contract is with the power stage, and
      // which terrain produced it is M6's business, not M9's.
      game.tuning.set('EUC.powerComfortSpeed', 2);
      game.setActions({ throttle: 1 });
      game.advance(900);
      const snap = game.snapshot();
      const node = document.querySelector('[data-hud="warning"]') as HTMLElement;
      return {
        stage: snap.euc.powerStage,
        warning: snap.hud.warning,
        label: node.textContent ?? '',
        hidden: node.hidden,
        level: node.dataset.level ?? '',
      };
    });

    expect(warned.stage).not.toBe('normal');
    expect(warned.warning).not.toBe('none');
    expect(warned.hidden).toBe(false);
    expect(warned.label.length).toBeGreaterThan(0);
    // The HUD's rung agrees with the machine's own status light, which is the
    // whole point of taking both from the same ladder (`DESIGN.md` §6c).
    expect(warned.level).toBe(warned.warning);
  });

  test('the first ride offers a prompt, and doing the thing clears it', async ({ page }) => {
    await boot(page);

    const shown = await page.evaluate(async () => {
      const game = window.game;
      game.loop.setRunning(false);
      // Small advances, so the render frame the prompt lives on runs at
      // something like a real cadence rather than swallowing seconds at once.
      const seen: string[] = [];
      for (let i = 0; i < 90; i += 1) {
        game.advance(2);
        const prompt = game.snapshot().hud.prompt;
        if (prompt !== null && !seen.includes(prompt)) seen.push(prompt);
      }
      const node = document.querySelector('[data-hud="prompt-text"]');
      return { seen, text: node?.textContent ?? '' };
    });

    expect(shown.seen).toEqual(['ride']);
    expect(shown.text).toContain('W');

    // Demonstrating both halves clears it, and it is not replaced immediately.
    const cleared = await page.evaluate(() => {
      const game = window.game;
      game.setActions({ throttle: 1, steer: 1 });
      for (let i = 0; i < 90; i += 1) game.advance(2);
      game.setActions({ throttle: 0, steer: 0 });
      return {
        prompt: game.snapshot().hud.prompt,
        seenPrompts: game.snapshot().options.seenPrompts,
        hidden: (document.querySelector('[data-hud="prompt"]') as HTMLElement).hidden,
      };
    });

    expect(cleared.prompt).not.toBe('ride');
    // And the seen flag was persisted, so the next ride does not repeat it.
    expect(cleared.seenPrompts).toContain('ride');
  });

  test('a prompt can be dismissed, and dismissing one dismisses the sequence', async ({ page }) => {
    await boot(page);

    await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      for (let i = 0; i < 90; i += 1) game.advance(2);
    });
    await expect(page.locator('[data-hud="prompt"]')).toBeVisible();

    await page.locator('[data-hud="prompt-dismiss"]').click();
    await expect(page.locator('[data-hud="prompt"]')).toBeHidden();

    // Waving away a hint must not summon the next one — the owner's standing
    // rule is that nothing may be annoying.
    const after = await page.evaluate(() => {
      const game = window.game;
      for (let i = 0; i < 400; i += 1) game.advance(2);
      return game.snapshot().hud.prompt;
    });
    expect(after).toBeNull();
  });

  test('Escape opens the pause menu and Escape closes it again', async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    await expect(page.locator('.euc-menu--pause')).toBeVisible();
    await expect(page.locator('[data-menu="resume"]')).toBeFocused();

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
    await expect(page.locator('.euc-menu--pause')).toBeHidden();
    // It stays resumed. Escape has two owners and they see the same keypress;
    // before the menu stopped the event, a resume was immediately followed by
    // a fresh pause latched from the same press.
    await page.waitForTimeout(200);
    expect((await app(page)).state).toBe('freeRide');

    expect(errors).toEqual([]);
  });

  test('settings return to wherever they were opened from', async ({ page }) => {
    await boot(page);

    await page.keyboard.press('Escape');
    await menuButton(page, 'pause', 'settings').click();
    expect((await app(page)).state).toBe('settings');
    await menuButton(page, 'settings', 'back').click();
    expect((await app(page)).state).toBe('paused');

    await menuButton(page, 'pause', 'quit').click();
    expect((await app(page)).state).toBe('title');
    await menuButton(page, 'title', 'settings').click();
    expect((await app(page)).state).toBe('settings');
    await page.keyboard.press('Escape');
    expect((await app(page)).state).toBe('title');
  });

  test('the settings panel is reachable from top to bottom in a short window', async ({ page }) => {
    // A centred panel taller than its container overflows in *both*
    // directions, and the overflow above it cannot be scrolled to. This cost
    // the settings screen its heading and its entire first section.
    await page.setViewportSize({ width: 900, height: 620 });
    await boot(page);
    await page.evaluate(() => window.game.setAppState('paused'));
    await menuButton(page, 'pause', 'settings').click();

    const reach = await page.evaluate(() => {
      const menu = document.querySelector('.euc-menu--settings') as HTMLElement;
      menu.scrollTop = 0;
      const heading = document.getElementById('euc-settings-heading') as HTMLElement;
      const headingTop = heading.getBoundingClientRect().top;
      menu.scrollTop = menu.scrollHeight;
      const last = document.querySelector('[data-menu="reset"]') as HTMLElement;
      return {
        headingTop,
        scrollable: menu.scrollHeight > menu.clientHeight,
        lastBottom: last.getBoundingClientRect().bottom,
        viewport: menu.clientHeight,
      };
    });

    expect(reach.scrollable).toBe(true);
    expect(reach.headingTop).toBeGreaterThanOrEqual(0);
    expect(reach.lastBottom).toBeLessThanOrEqual(reach.viewport + 1);
  });

  test('every control is a real control, and Tab stays inside the dialog', async ({ page }) => {
    // ARIA paired with real keyboard behaviour, never declared in place of it
    // (master §14.1). The check is that these are native elements: each one
    // arrives with its own keyboard handling and its own announcement, which
    // no amount of `role=` on a div reproduces.
    await boot(page);
    await page.evaluate(() => window.game.setAppState('paused'));
    await menuButton(page, 'pause', 'settings').click();

    const shape = await page.evaluate(() => {
      const panel = document.querySelector('.euc-menu--settings .euc-menu__panel') as HTMLElement;
      const controls = [...panel.querySelectorAll<HTMLElement>('[data-option]')];
      return {
        dialog: panel.getAttribute('role'),
        modal: panel.getAttribute('aria-modal'),
        labelled: panel.getAttribute('aria-labelledby'),
        tags: [...new Set(controls.map((node) => node.tagName))].sort(),
        // Every control has a real label associated with it.
        unlabelled: controls.filter((node) => {
          const id = node.id;
          return id === '' || panel.querySelector(`label[for="${id}"]`) === null;
        }).length,
        groups: panel.querySelectorAll('fieldset > legend').length,
      };
    });

    expect(shape.dialog).toBe('dialog');
    expect(shape.modal).toBe('true');
    expect(shape.labelled).toBeTruthy();
    expect(shape.tags).toEqual(['INPUT', 'SELECT']);
    expect(shape.unlabelled).toBe(0);
    expect(shape.groups).toBeGreaterThanOrEqual(3);

    // Tab from the last control wraps to the first rather than walking out
    // into the canvas behind the dialog, where the player cannot see what has
    // focus.
    const trapped = await page.evaluate(async () => {
      const panel = document.querySelector('.euc-menu--settings') as HTMLElement;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button, input, select')];
      const last = focusable[focusable.length - 1];
      last.focus();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
      return document.activeElement === focusable[0];
    });
    expect(trapped).toBe(true);
  });

  test('options survive a reload, and the panel comes back showing them', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => window.game.optionsPersist())).toBe(true);

    await page.evaluate(() => {
      window.game.setOptions({
        quality: 'low',
        speedUnit: 'mph',
        volumeMaster: 0.5,
        fieldOfViewTrim: 6,
      });
    });

    await boot(page);
    const restored = await options(page);
    expect(restored).toMatchObject({
      quality: 'low',
      speedUnit: 'mph',
      volumeMaster: 0.5,
      fieldOfViewTrim: 6,
    });

    // The controls show what was restored rather than their defaults, and the
    // two retired motion settings no longer exist in the menu.
    const shown = await page.evaluate(() => ({
      quality: (document.querySelector('[data-option="quality"]') as HTMLSelectElement).value,
      retiredControls: document.querySelectorAll(
        '[data-option="cameraShake"], [data-option="reducedMotion"]',
      ).length,
    }));
    expect(shown.quality).toBe('low');
    // The model is restored before the next HUD write. Assert the rendered
    // value with Playwright's retrying locator rather than sampling that
    // one-frame seam; the failure screenshot already showed the correct mph.
    await expect(page.locator('[data-hud="unit"]')).toHaveText('mph');
    expect(shown.retiredControls).toBe(0);

    await page.evaluate(() => window.game.resetOptions());
  });

  test('speed still widens the field of view after camera shake is removed', async ({ page }) => {
    await boot(page);
    const fov = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.placeRider(game.levelPlan.spawn.position, game.levelPlan.spawn.headingY);
      const atRest = game.snapshot().camera.fov;
      game.setActions({ throttle: 1 });
      game.advance(1200);
      game.setActions({ throttle: 0 });
      return { atRest, atSpeed: game.snapshot().camera.fov };
    });
    expect(fov.atSpeed).toBeGreaterThan(fov.atRest + 0.1);
  });

  test('a rebound key reaches the wheel, and Escape cannot be taken', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.game.setAppState('paused'));
    await menuButton(page, 'pause', 'settings').click();

    // Through the real capture path: click Change, press a key.
    await page.locator('[data-binding-set="accelerate"]').click();
    await page.keyboard.press('KeyT');
    await expect(page.locator('[data-binding-keys="accelerate"]')).toContainText('T');

    await menuButton(page, 'settings', 'back').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

    const rode = await page.evaluate(async () => {
      const game = window.game;
      game.loop.setRunning(false);
      return { before: game.snapshot().euc.speed };
    });
    expect(rode.before).toBe(0);

    await page.keyboard.down('KeyT');
    const withNewKey = await page.evaluate(() => {
      window.game.advance(180);
      return window.game.snapshot().euc.speed;
    });
    await page.keyboard.up('KeyT');
    expect(withNewKey).toBeGreaterThan(0);

    // W is genuinely free now.
    await page.evaluate(() => {
      window.game.placeRider(window.game.levelPlan.spawn.position, 0);
    });
    await page.keyboard.down('KeyW');
    const withOldKey = await page.evaluate(() => {
      window.game.advance(180);
      return window.game.snapshot().euc.speed;
    });
    await page.keyboard.up('KeyW');
    expect(withOldKey).toBe(0);

    // Escape refuses to be rebound, so a player can always get out.
    await page.evaluate(() => window.game.setAppState('paused'));
    await menuButton(page, 'pause', 'settings').click();
    await page.locator('[data-binding-set="hop"]').click();
    await page.keyboard.press('Escape');
    const bindings = (await options(page)).bindings;
    expect(bindings.hop === undefined || !bindings.hop.includes('Escape')).toBe(true);
    expect((await app(page)).state).toBe('settings');

    await page.evaluate(() => window.game.resetOptions());
  });

  test('M mutes, and the settings screen agrees that it did', async ({ page }) => {
    // `docs/PLANS.md` §4.7 said M would become the keyboard shortcut for M9's
    // faders rather than being removed. This is that, and the thing worth
    // asserting is that the two surfaces cannot disagree.
    await boot(page);
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => window.game.snapshot().options.muted === true);

    await page.evaluate(() => window.game.setAppState('paused'));
    await menuButton(page, 'pause', 'settings').click();
    const checked = await page.evaluate(
      () => (document.querySelector('[data-option="muted"]') as HTMLInputElement).checked,
    );
    expect(checked).toBe(true);
    await page.evaluate(() => window.game.resetOptions());
  });

  test('a gamepad can navigate and operate the menus it opens', async ({ page }) => {
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

    const pulse = async (button: number): Promise<void> => page.evaluate(async (index) => {
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

    // Down walks the title screen's real focus order. **M10 inserted Time
    // trial between Start ride and Settings, M12 Phase 4 inserted Fresh route
    // after it, M14 inserted Knockabout between those two, and M18 inserted
    // Police chase after Knockabout**, so this is five presses now rather than
    // one — and asserting every intermediate stop is the point: the pad follows
    // the panel's actual Tab order rather than a list of buttons this test
    // remembers, which is exactly what should happen when the menu grows. Each
    // time it has, this test has failed by naming the wrong stop, which is the
    // failure it is for. A activates what is focused.
    await pulse(13);
    await expect(menuButton(page, 'title', 'challenge')).toBeFocused();
    await pulse(13);
    await expect(menuButton(page, 'title', 'knockabout')).toBeFocused();
    await pulse(13);
    await expect(menuButton(page, 'title', 'chase')).toBeFocused();
    await pulse(13);
    await expect(menuButton(page, 'title', 'routes')).toBeFocused();
    await pulse(13);
    await expect(menuButton(page, 'title', 'settings')).toBeFocused();
    await pulse(0);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'settings');
    await expect(page.locator('[data-option="quality"]')).toBeFocused();

    // Left adjusts the focused native select through the same option path as
    // keyboard/mouse input, then B returns to the title.
    await pulse(14);
    expect((await options(page)).quality).toBe('medium');
    await pulse(1);
    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
    await page.evaluate(() => window.game.resetOptions());
  });

  test('the gamepad status line is filled even when no pad was ever attached', async ({ page }) => {
    // The exact packaged-artifact finding (M10 QA, F4): the paragraph was only
    // written on a connection *transition*, so a player who opened Settings →
    // Controls with no pad read an empty line where an answer belonged.
    await bootToTitle(page);
    await menuButton(page, 'title', 'settings').click();
    await expect(page.locator('[data-menu="gamepad-status"]'))
      .toHaveText(/No gamepad detected/);
  });

  test('a Linux-shaped pad with its d-pad on the hat axes still walks the menus', async ({ page }) => {
    // The owner's Ubuntu QA pass: Firefox on Linux has shipped an Xbox pad
    // through the Gamepad API claiming the standard mapping while defining
    // fewer buttons than the mapping names, with the d-pad on hat axes 6/7.
    // Buttons 12–15 do not exist on such a pad, so a reader that only asks
    // them left the d-pad dead in every menu while the stick worked — which
    // is exactly "some inputs wouldn't register".
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: 'fake linux pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0, 0, 0, 0, 0],
        buttons: Array.from({ length: 11 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      (window as unknown as { fakePad: typeof pad }).fakePad = pad;
      navigator.getGamepads = () => [pad] as never;
    });
    await bootToTitle(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    const pulseHat = async (axis: number, value: number): Promise<void> => page.evaluate(
      async ({ axis, value }) => {
        const pad = (window as unknown as { fakePad: { axes: number[] } }).fakePad;
        const frame = () => new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        pad.axes[axis] = value;
        await frame();
        pad.axes[axis] = 0;
        await frame();
      },
      { axis, value },
    );

    // Hat down (+1 on axis 7) walks the title's focus order; hat up walks back.
    await pulseHat(7, 1);
    await expect(menuButton(page, 'title', 'challenge')).toBeFocused();
    await pulseHat(7, 1);
    await expect(menuButton(page, 'title', 'knockabout')).toBeFocused();
    await pulseHat(7, -1);
    await expect(menuButton(page, 'title', 'challenge')).toBeFocused();
  });

  test('a held menu direction repeats in the pause menu, where the sim clock is frozen', async ({ page }) => {
    // `paused` runs no simulation steps, and the pad's menu-repeat pacing used
    // to be scheduled from the simulation clock — so "hold down to travel the
    // list" worked on the title screen and died in the pause menu, the one
    // place a rider most often holds a direction. Repeats now pace themselves
    // by the frame's wall clock, which this spec spends real time to prove.
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
    await boot(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
    await expect(page.locator('[data-menu="resume"]')).toBeFocused();

    // Hold d-pad down for ~0.9 s of real time: one immediate move plus, at the
    // shipped 0.42 s delay and 0.14 s interval, three repeats. Two focus
    // changes is the floor that proves repeating at all under a slow frame.
    const focusChanges = await page.evaluate(async () => {
      const pad = (window as unknown as { fakePad: {
        buttons: { pressed: boolean; value: number }[];
      } }).fakePad;
      const frame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      pad.buttons[13].pressed = true;
      pad.buttons[13].value = 1;
      const started = performance.now();
      let changes = 0;
      let last = document.activeElement;
      while (performance.now() - started < 900) {
        await frame();
        if (document.activeElement !== last) {
          changes += 1;
          last = document.activeElement;
        }
      }
      pad.buttons[13].pressed = false;
      pad.buttons[13].value = 0;
      await frame();
      return changes;
    });
    expect(focusChanges).toBeGreaterThanOrEqual(2);

    // And the frozen clock the repeats no longer read really was frozen.
    expect((await app(page)).state).toBe('paused');
  });

  test('a pad the browser reports without the standard mapping is named in the settings', async ({ page }) => {
    // The other documented Linux shape: the browser lists the pad with
    // `mapping: ""`. The game refuses to guess at its indices (M9), but the
    // refusal used to be silent — the settings line read "No gamepad
    // detected" with a pad in the player's hands, which made a browser
    // quirk look like a game defect.
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: 'fake raw pad',
        connected: true,
        mapping: '',
        axes: [0, 0, 0, 0, 0, 0, 0, 0],
        buttons: Array.from({ length: 11 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      navigator.getGamepads = () => [pad] as never;
    });
    await bootToTitle(page);

    expect(await page.evaluate(() => window.game.snapshot().gamepadConnected)).toBe(false);
    await menuButton(page, 'title', 'settings').click();
    await expect(page.locator('[data-menu="gamepad-status"]'))
      .toHaveText(/standard button layout/);
  });

  /*
   * The touch controls' desktop half (M11.5).
   *
   * Their own spec runs in the `mobile` project, where a finger is the primary
   * pointer. The question *this* project can answer is the one that project
   * structurally cannot: that a mouse-and-keyboard machine is left completely
   * alone by the feature, and that a player at such a machine — a touch monitor,
   * a convertible the media query has misjudged — can still ask for them.
   */
  test('a desktop is left alone by the on-screen controls, and can still ask for them', async ({ page }) => {
    await boot(page);

    // Nothing shown, nothing detected, and the HUD keeps the corners it has had
    // since M9: the bottom-left speed is the reading a rider takes without
    // looking, and it must not move for a feature this machine is not using.
    expect(await page.evaluate(() => window.game.snapshot().touch))
      .toMatchObject({ wanted: false, visible: false, promptDevice: 'keyboard' });
    await expect(page.locator('.euc-touch')).toBeHidden();
    await expect(page.locator('.euc-hud')).toHaveAttribute('data-touch', 'false');

    // Forced on from the settings screen — the override that exists precisely
    // because automatic detection cannot be right about every machine.
    await page.evaluate(() => window.game.options.set({ touchControls: 'on' }));
    await expect(page.locator('.euc-touch')).toBeVisible();
    await expect(page.locator('[data-touch="stick"]')).toBeVisible();
    await expect(page.locator('[data-touch="crouch"]')).toBeVisible();
    await expect(page.locator('.euc-hud')).toHaveAttribute('data-touch', 'true');

    // The override is for hybrid touch hardware; it must not turn a normal
    // mouse click in the lower-left playfield into an analog riding gesture
    // (master §8.5).
    await page.locator('[data-touch="stick"]').dispatchEvent('pointerdown', {
      pointerId: 91, pointerType: 'mouse', clientX: 100, clientY: 500, isPrimary: true,
    });
    await page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 91, pointerType: 'mouse', clientX: 200, clientY: 400, bubbles: true,
      }));
    });
    await page.evaluate(() => window.qa.advance(60));
    expect(await page.evaluate(() => window.game.snapshot().actions)).toMatchObject({
      throttle: 0,
      steer: 0,
    });

    // A real touch pointer on that same machine does acquire the stick.
    await page.evaluate(() => {
      const stick = document.querySelector('[data-touch="stick"]') as Element;
      stick.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 92, pointerType: 'touch', clientX: 100, clientY: 500,
        bubbles: true, cancelable: true,
      }));
      window.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 92, pointerType: 'touch', clientX: 200, clientY: 400, bubbles: true,
      }));
    });
    await page.evaluate(() => window.qa.advance(2));
    expect((await page.evaluate(() => window.game.snapshot().actions)).throttle).toBeGreaterThan(0);

    await page.evaluate(() => window.game.resetOptions());
    // Auto now has evidence of an actual finger, so reset correctly keeps the
    // controls visible. Expecting desktop detection to forget a real touch was
    // the test contradicting the hybrid-device contract.
    expect(await page.evaluate(() => window.game.snapshot().touch)).toMatchObject({
      wanted: true,
      visible: true,
      promptDevice: 'touch',
    });
    await page.evaluate(() => window.game.options.set({ touchControls: 'off' }));
    await expect(page.locator('.euc-touch')).toBeHidden();
  });

  test('disabling a connected pad updates the status line, and re-enabling restores it', async ({ page }) => {
    await page.addInitScript(() => {
      const pad = {
        index: 0,
        id: 'fake standard pad',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
      };
      navigator.getGamepads = () => [pad] as never;
    });
    await bootToTitle(page);
    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    await menuButton(page, 'title', 'settings').click();
    const status = page.locator('[data-menu="gamepad-status"]');
    await expect(status).toHaveText(/Gamepad connected/);

    // Unticking the box never fires a disconnection event — the pad is still
    // on the desk — so the status has to be refreshed by the option change
    // itself, or the stale "connected" line contradicts the box beside it.
    await page.locator('[data-option="gamepadEnabled"]').uncheck();
    await expect(status).toHaveText(/switched off/);

    await page.locator('[data-option="gamepadEnabled"]').check();
    await expect(status).toHaveText(/Gamepad connected/);

    await page.evaluate(() => window.game.resetOptions());
  });

  test('a gamepad is read when one appears, and the keyboard keeps working', async ({ page }) => {
    // A fake pad, because CI has no hardware. It drives the real device layer
    // through the real `navigator.getGamepads`, so what is proven is the whole
    // path rather than a mapping function called directly.
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
    await boot(page);

    await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

    const ridden = await page.evaluate(async () => {
      const game = window.game;
      const pad = (window as unknown as { fakePad: {
        axes: number[];
        buttons: { pressed: boolean; value: number }[];
      } }).fakePad;
      // **A polled device needs a real frame.** `advance()` runs steps and one
      // draw; it deliberately does not run `beforeFrame`, which is where the
      // pad is read — so a stick moved and then advanced over would never be
      // seen at all. Yielding to two animation frames is what lets the device
      // layer observe the new axis before the steps that should react to it.
      const frame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      game.loop.setRunning(false);
      game.clearActions();
      // The Gamepad API reports a stick pushed away from the player as
      // negative, so accelerating is -1 on the Y axis.
      pad.axes[1] = -1;
      await frame();
      game.advance(600);
      const withPad = game.snapshot().euc.speed;
      pad.axes[1] = 0;
      await frame();
      game.advance(240);
      return { withPad, coasting: game.snapshot().euc.speed };
    });

    expect(ridden.withPad).toBeGreaterThan(1);
    expect(ridden.coasting).toBeLessThan(ridden.withPad);

    // Turning the pad off in the settings screen genuinely stops it.
    await page.evaluate(() => window.game.setOptions({ gamepadEnabled: false }));
    const afterDisable = await page.evaluate(async () => {
      const game = window.game;
      const pad = (window as unknown as { fakePad: { axes: number[] } }).fakePad;
      game.placeRider(game.levelPlan.spawn.position, 0);
      pad.axes[1] = -1;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      game.advance(600);
      pad.axes[1] = 0;
      return game.snapshot().euc.speed;
    });
    expect(afterDisable).toBe(0);
    await page.evaluate(() => window.game.resetOptions());
  });

  test('a full menu and settings pass leaves the resources where it found them', async ({ page }) => {
    // Invariant 10, applied to the layer M9 added: the HUD and three menu
    // surfaces are DOM, but the quality preset disposes and rebuilds a shadow
    // map, and that is a GPU object.
    const errors = collectErrors(page);
    await boot(page);
    await page.evaluate(() => window.game.advance(120));
    const before = await page.evaluate(() => window.game.resources());

    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => {
        const game = window.game;
        game.setAppState('paused');
        game.setAppState('settings');
        game.setOptions({ quality: 'low' });
        game.setOptions({ quality: 'medium' });
        game.setOptions({ quality: 'high' });
        game.setAppState('paused');
        game.setAppState('title');
        game.setAppState('freeRide');
        game.advance(60);
      });
    }

    const after = await page.evaluate(() => window.game.resources());
    expect(after.geometries).toBeLessThanOrEqual(before.geometries);
    expect(after.textures).toBeLessThanOrEqual(before.textures + 1);
    expect(after.sceneObjects).toBe(before.sceneObjects);
    expect(after.lights).toBe(before.lights);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.game.resetOptions());
  });

  test('the whole M9 surface produces no console errors', async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page);

    await menuButton(page, 'title', 'settings').click();
    await menuButton(page, 'settings', 'back').click();
    await menuButton(page, 'title', 'start').click();
    await page.evaluate(() => window.game.advance(240));
    await page.keyboard.press('Escape');
    await menuButton(page, 'pause', 'settings').click();
    await page.evaluate(() => {
      const game = window.game;
      game.setOptions({ quality: 'low', speedUnit: 'mph' });
      game.setOptions({ quality: 'high', speedUnit: 'kph' });
    });
    await menuButton(page, 'settings', 'reset').click();
    await menuButton(page, 'settings', 'back').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.game.advance(240));

    expect(errors).toEqual([]);
  });
});
