/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { CHARACTER_IDS } from '../src/data/riders.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M14.5 — a second rider, and a fresh-route entrance a casual player can read.
 *
 * Two features, one milestone, and they share a spec because they share the
 * screen they arrive on: the title card gained an entrance to a rider chooser
 * and its `Fresh route` button gained a sentence saying what it gives you.
 *
 * **What only a browser can answer here.** `src/render/riderLook.test.ts`
 * proves both looks are built on one skeleton, dispose cleanly, and fit the
 * ghost's budget — headlessly, with no GL context and no DOM. What it cannot
 * prove is that the *game* swaps them: that the choice reaches the scene, that
 * it reaches the audio layer, that it survives a reload, that it does not touch
 * the world or the records, and that a rig replaced at runtime leaves the GPU
 * counters where it found them. Every one of those is a wiring question, and
 * wiring is what a bridge call sees and a unit test does not.
 *
 * **The rider is asserted twice on purpose** — `snapshot().rider.chosen` is
 * what the player asked for and `.installed` is what the scene is drawing,
 * exactly the split `touch.wanted` makes against `touch.visible`. A swap that
 * silently failed would leave them disagreeing, and a spec that read only the
 * option would call that a pass.
 */

const rider = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.game.snapshot().rider);

const world = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.game.snapshot().world);

const appState = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.game.snapshot().app);

/** Every named mesh under the player's rig, which is how a look is identified. */
const rigMeshNames = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const root = window.game.renderer.scene.getObjectByName('rider-blockout');
  if (!root) return [];
  const names: string[] = [];
  root.traverse((object: { name?: string; type?: string }) => {
    if (object.type === 'Mesh' && object.name) names.push(object.name);
  });
  return names.sort();
});

test('the title screen names the rider and offers a way to change them', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  // The line that used to be a full stop. It still names the active rider —
  // which is what keeps M9's "Cool Rider is identified on the title screen"
  // assertion true — and it is now the control that opens the chooser.
  const chip = page.locator('.euc-menu--title [data-menu="riders"]');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Cool Rider');
  await expect(page.locator('.euc-menu--riders')).toBeHidden();

  // Start ride is still the first focusable control and still the primary
  // action: a rider chooser is not what anybody opened the game to do.
  await expect(page.locator('.euc-menu--title [data-menu="start"]')).toBeFocused();

  await chip.click();
  expect(await appState(page)).toMatchObject({ state: 'riderSelect', menu: 'riders' });
  await expect(page.locator('.euc-menu--riders')).toBeVisible();

  expect(errors).toEqual([]);
});

test('choosing a rider changes the rider in the scene, and only the rider', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  const before = await world(page);
  expect(await rider(page)).toMatchObject({
    chosen: 'cool-rider',
    installed: 'cool-rider',
    crashVoice: 'cool-rider',
  });
  const coolRiderMeshes = await rigMeshNames(page);
  expect(coolRiderMeshes).toContain('rider-shoulder-panels');
  expect(coolRiderMeshes).toContain('rider-sleeve-left');

  await page.locator('.euc-menu--title [data-menu="riders"]').click();
  await page.locator('.euc-menu--riders [data-rider="trollina"]').click();

  // The model, the scene, and the audio layer all moved together.
  expect(await rider(page)).toMatchObject({
    chosen: 'trollina',
    installed: 'trollina',
    crashVoice: 'trollina',
  });
  const trollinaMeshes = await rigMeshNames(page);
  expect(trollinaMeshes).toContain('rider-hair');
  expect(trollinaMeshes).not.toContain('rider-sleeve-left');

  // **The world did not move.** A rider is appearance; a level id is where a
  // run happened. If a character ever reached level identity, every existing
  // personal best would orphan the first time somebody switched.
  expect(await world(page)).toEqual(before);

  // The panel stays open and says who is riding, because the rider it just
  // swapped is standing on the wheel two metres behind the card.
  expect((await appState(page)).state).toBe('riderSelect');
  await expect(page.locator('.euc-menu--riders [data-rider="trollina"]'))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.euc-menu--riders [data-rider="cool-rider"]'))
    .toHaveAttribute('aria-pressed', 'false');

  await page.locator('.euc-menu--riders [data-menu="riders-back"]').click();
  expect((await appState(page)).state).toBe('title');
  await expect(page.locator('.euc-menu--title [data-menu="riders"]')).toContainText('Trollina');

  expect(errors).toEqual([]);
});

test('a chosen rider survives a reload', async ({ page }) => {
  // The whole reason the choice lives in `GameOptions` rather than in app
  // state: a player who picked Trollina means it next time, which is the same
  // argument `speedUnit` makes.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.evaluate(() => window.game.setOptions({ character: 'trollina' }));
  expect((await rider(page)).installed).toBe('trollina');

  await page.reload();
  await page.waitForFunction(() => typeof window.game === 'object' && window.game !== null);
  await page.waitForFunction(() => window.game.snapshot().loop.frames > 0);

  expect(await rider(page)).toMatchObject({ chosen: 'trollina', installed: 'trollina' });
  await expect(page.locator('.euc-menu--riders [data-rider="trollina"]'))
    .toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => window.game.resetOptions());
  expect((await rider(page)).installed).toBe('cool-rider');

  expect(errors).toEqual([]);
});

test('swapping riders repeatedly leaves the GPU counters where it found them', async ({ page }) => {
  // Invariant 10, on the one thing this milestone made repeatable. A swap
  // disposes a rig of two dozen geometries and builds another, and it does it
  // twice — once for the player and once for the ghost, which wears the
  // player's rider because it is the player's own earlier run. A missing
  // `removeFromParent` shows up in `sceneObjects` even when `info.memory` looks
  // flat, which is why that field is in the comparison.
  const errors = collectErrors(page);
  await boot(page);

  const settle = async () => {
    await page.evaluate(() => window.game.advance(30));
  };

  // End on the newest (and currently heaviest) look so the before/after pair
  // exercises every Red Rider geometry and material disposal path too.
  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
  await settle();
  const before = await page.evaluate(() => window.game.resources());

  for (let round = 0; round < 6; round += 1) {
    for (const character of CHARACTER_IDS) {
      await page.evaluate((id) => window.game.setOptions({ character: id }), character);
    }
  }
  await settle();
  const after = await page.evaluate(() => window.game.resources());

  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});

test('a rider swap mid-ride does not move the rider or interrupt the world', async ({ page }) => {
  // The swap can land at any moment, because the chooser is reachable from the
  // title while the world is live and `applyOptions` is re-entered from the QA
  // bridge at will. `syncPoses` is what stops the new rig being drawn at the
  // origin for one frame while the chase camera eases across the map after it.
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.advance(120));

  const poseBefore = await page.evaluate(() => {
    const euc = window.game.snapshot().euc;
    return { x: euc.position.x, z: euc.position.z, speed: euc.speed };
  });

  await page.evaluate(() => window.game.setOptions({ character: 'trollina' }));

  const poseAfter = await page.evaluate(() => {
    const euc = window.game.snapshot().euc;
    return { x: euc.position.x, z: euc.position.z, speed: euc.speed };
  });
  expect(poseAfter).toEqual(poseBefore);

  // And the rig in the scene is where the rider is, not at the origin.
  const rigPosition = await page.evaluate(() => {
    const rig = window.game.renderer.scene.getObjectByName('riding-rig');
    return rig ? { x: rig.position.x, z: rig.position.z } : null;
  });
  expect(rigPosition).not.toBeNull();
  expect(Math.abs(rigPosition!.x - poseBefore.x)).toBeLessThan(0.01);
  expect(Math.abs(rigPosition!.z - poseBefore.z)).toBeLessThan(0.01);

  expect(errors).toEqual([]);
});

test('the whole frame still fits the budget with the heavier rider on it', async ({ page }) => {
  // The reserve `level/renderBudget.ts` subtracts is measured over every look
  // and keeps the worst, so this is the browser-side check on that arithmetic:
  // whichever rider is installed, `renderer.info` must stay under the ceiling
  // the generator was told it had.
  const errors = collectErrors(page);
  await boot(page);

  for (const character of CHARACTER_IDS) {
    await page.evaluate((id) => window.game.setOptions({ character: id }), character);
    await page.evaluate(() => window.game.advance(10));
    const render = await page.evaluate(() => window.game.snapshot().render);
    expect(render.drawCalls, `${character} draw calls`).toBeLessThanOrEqual(150);
    expect(render.triangles, `${character} triangles`).toBeLessThanOrEqual(400_000);
  }

  expect(errors).toEqual([]);
});

test('the fresh-route panel leads with the control that needs no knowledge', async ({ page }) => {
  // The M14.5 rework, as a claim rather than as a screenshot: a player who has
  // never heard the word "seed" can reach a route without typing, and the panel
  // says what it is for before it asks for anything.
  const errors = collectErrors(page);
  await bootToTitle(page);

  // The entrance says what it gives you.
  await expect(page.locator('.euc-menu--title [data-menu="routes"]'))
    .toContainText('brand-new place to ride');
  await expect(page.locator('.euc-menu--title [data-menu="routes"]'))
    .toContainText('procedurally generate');

  await page.locator('.euc-menu--title [data-menu="routes"]').click();

  // Surprise me is first, focused, and carries its own explanation. It is also
  // still called Surprise me — the phrase the game has always used, and the one
  // the refusal message names.
  const surprise = page.locator('.euc-menu--routes [data-menu="surprise"]');
  await expect(surprise).toBeFocused();
  await expect(surprise).toContainText('Surprise me');
  await expect(surprise).toContainText('no typing');
  await expect(surprise).toContainText('Procedurally generate');

  // The field is still there for anyone who wants it, introduced by a question
  // rather than by a bare noun, and it still says "seed" once for the people
  // who came looking for the word.
  await expect(page.locator('.euc-menu--routes .euc-routes__legend')).toContainText('route name');
  await expect(page.locator('#euc-seed')).toBeVisible();
  await expect(page.locator('.euc-menu--routes #euc-routes-hint')).toContainText('seed');

  // A refusal points at the fix rather than only at the mistake. `route-12` is
  // m12's pinned dead seed — one that reaches the generator and fails to make a
  // route, rather than one that merely looks unlikely.
  await page.locator('#euc-seed').fill('route-12');
  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  await expect.poll(async () => page.evaluate(() => window.game.snapshot().route.status))
    .toBe('no-route');
  const status = page.locator('.euc-menu--routes [data-menu="route-status"]');
  await expect(status).toHaveAttribute('data-tone', 'refused');
  await expect(status).toContainText('route-12');
  await expect(status).toContainText('Surprise me');
  // And the world did not move, which is the owner's q6 answer and is the one
  // thing about this panel that may never change.
  expect((await world(page)).generated).toBe(false);

  expect(errors).toEqual([]);
});

test('the panel moves its emphasis to Ride once there is something to ride', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();

  const stage = page.locator('.euc-menu--routes [data-menu="route-stage"]');
  await expect(stage).toHaveAttribute('data-stage', 'pick');

  await page.locator('.euc-menu--routes [data-menu="surprise"]').click();
  await expect.poll(async () => page.evaluate(() => window.game.snapshot().route.pending))
    .toBe(false);

  // Built, named, and the emphasis has moved to the button that rides it.
  await expect(stage).toHaveAttribute('data-stage', 'ready');
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toContainText('ready to ride');
  await expect(page.locator('#euc-seed')).not.toHaveValue('');

  expect(errors).toEqual([]);
});

test('the rider chooser is a real dialog a keyboard can operate', async ({ page }) => {
  // M9's accessibility contract, applied to the newest screen: a real modal,
  // native controls only, a label on the group, Escape to leave, and a Tab
  // cycle that stays inside the panel.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="riders"]').click();

  const panel = page.locator('.euc-menu--riders .euc-menu__panel');
  await expect(panel).toHaveAttribute('role', 'dialog');
  await expect(panel).toHaveAttribute('aria-modal', 'true');
  const labelledBy = await panel.getAttribute('aria-labelledby');
  expect(labelledBy).toBeTruthy();
  await expect(page.locator(`#${labelledBy}`)).toBeVisible();

  // Every control is a real control. A card built as a div would fall out of
  // the focus selector entirely — no Tab, no pad, no focus ring.
  const shape = await page.evaluate(() => {
    const root = document.querySelector('.euc-menu--riders .euc-menu__panel')!;
    const controls = [...root.querySelectorAll('[data-menu]')];
    return {
      tags: [...new Set(controls.map((node) => node.tagName))].sort(),
      groups: root.querySelectorAll('fieldset > legend').length,
    };
  });
  expect(shape.tags).toEqual(['BUTTON']);
  expect(shape.groups).toBeGreaterThanOrEqual(1);

  // Tab stays inside, and Escape leaves — the one meaning this key has across
  // every screen in the game that has somewhere to go back to.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const inside = await page.evaluate(
    () => document.activeElement?.closest('.euc-menu--riders') !== null,
  );
  expect(inside).toBe(true);

  await page.keyboard.press('Escape');
  expect((await appState(page)).state).toBe('title');

  expect(errors).toEqual([]);
});

test('Trollina crashes with her own recording, audibly', async ({ page }) => {
  // **The rung that matters, and the reason `lastCrashVoice` exists.**
  // `crashSamplePlays` counts the source node and both riders have one, so it
  // proves a *recording* played rather than the synthesized fallback — it
  // cannot say whose. The sink now records which buffer it reached for at the
  // moment it reached for it, which is the only place that answer is true.
  //
  // The level check is m8's, unchanged in shape: the loudest of sixteen
  // analyser windows across 1.6 s of the 3.4 s tumble, against the same idle
  // reading, so the ride bed cannot explain it. Her file is the same length and
  // is RMS-matched to his, which is what makes one bar correct for both.
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'trollina' }));
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
  expect(measured.voice).toBe('trollina');
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  // And switching back switches the voice back, without a reload: the engine
  // holds the choice and pushes it at the sink, so it survives an armed
  // context rather than only a fresh one.
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('cool-rider');

  expect(errors).toEqual([]);
});
