/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { boot, bootAtTier, bootToTitle, collectErrors } from './harness.ts';

test('the eleventh rider is drawn, installed immediately and remembered', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);
  expect(CHARACTER_IDS.length).toBeGreaterThanOrEqual(11);
  expect(CHARACTER_IDS[10]).toBe('gnarwheel');
  await expect(page.locator('[data-rider-dot]')).toHaveCount(CHARACTERS.length);
  await expect(page.locator('[data-rider-dot="gnarwheel"]')).toHaveCount(1);

  await page.locator('.euc-rider-chip').click();
  const card = page.locator('.euc-menu--riders [data-rider="gnarwheel"]');
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(card.locator('.euc-rider-card__name')).toHaveText('Gnarwheel');
  await expect(card.locator('.euc-rider-card__blurb')).toHaveText(CHARACTERS[10].blurb);
  await expect(card.locator('image')).toHaveCount(1);
  await expect(card.locator('svg path')).not.toHaveCount(0);
  expect(await card.innerHTML()).not.toContain('SMLS');

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'gnarwheel');
  expect(await page.evaluate(() => window.game.options.current.character)).toBe('gnarwheel');
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('gnarwheel');
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('gnarwheel');

  await page.locator('.euc-menu--riders [data-menu="riders-back"]').click();
  await page.reload();
  await page.waitForFunction(() => typeof window.game === 'object' && window.game.snapshot().loop.frames > 0);
  expect(await page.evaluate(() => window.game.options.current.character)).toBe('gnarwheel');
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('gnarwheel');
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('gnarwheel');
  await page.locator('.euc-rider-chip').click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('Gnarwheel crashes with his own recording, on the output bus, and swap restores each choice', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'gnarwheel' }));
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

  const measured = await page.evaluate(async () => {
    window.qa.freeze();
    window.qa.resetRide();
    const idle = await window.qa.audioOutputMax(500, 5);
    const before = window.qa.snap().audio;
    let steps = 0;
    while (steps < 3000 && !window.game.snapshot().euc.crashed) {
      window.game.setActions({ throttle: 1, steer: Math.floor(steps / 30) % 2 === 0 ? 1 : -1 });
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

  expect(measured.voice).toBe('gnarwheel');
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('red-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('cool-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'gnarwheel' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('gnarwheel');
  expect(errors).toEqual([]);
});

const SHOTS = process.env.M43_SHOTS ?? 'test-results/m43';
const DESKTOP = { width: 1280, height: 800 };

async function saveEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string,
  evidence: unknown,
): Promise<void> {
  const directory = join(SHOTS, testInfo.project.name);
  await mkdir(directory, { recursive: true });
  const image = await page.screenshot({ animations: 'disabled' });
  const receipt = JSON.stringify(evidence, null, 2);
  await writeFile(join(directory, `${name}.png`), image);
  await writeFile(join(directory, `${name}.json`), receipt);
  await testInfo.attach(name, { body: image, contentType: 'image/png' });
  await testInfo.attach(`${name}-state`, { body: receipt, contentType: 'application/json' });
}

function frameEvidence() {
  const game = window.game;
  game.advance(1);
  const snapshot = game.snapshot();
  const gl = game.renderer.renderer.getContext();
  const views = game.renderer.viewCount;
  const columns = views === 1 ? 1 : 2;
  const rows = views <= 2 ? 1 : 2;
  const panes = Array.from({ length: views }, (_, seat) => {
    const column = seat % columns;
    const row = rows - Math.floor(seat / columns) - 1;
    const x0 = Math.round(gl.drawingBufferWidth * column / columns);
    const x1 = Math.round(gl.drawingBufferWidth * (column + 1) / columns);
    const y0 = Math.round(gl.drawingBufferHeight * row / rows);
    const y1 = Math.round(gl.drawingBufferHeight * (row + 1) / rows);
    const colours = new Set<string>();
    for (let x = 0; x < 8; x += 1) {
      for (const fraction of [0.25, 0.55, 0.8]) {
        const pixel = new Uint8Array(4);
        gl.readPixels(Math.floor(x0 + (x1 - x0) * (x + 0.5) / 8),
          Math.floor(y0 + (y1 - y0) * fraction), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        colours.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
      }
    }
    const rider = game.snapshotFor(seat);
    return {
      seat,
      character: rider.rider.installed,
      camera: rider.camera.mode,
      position: rider.euc.position,
      distinctColours: colours.size,
    };
  });
  const at = snapshot.euc.position;
  return {
    quality: snapshot.quality,
    seatCount: game.seatCount,
    views,
    panes,
    resources: game.resources(),
    rider: snapshot.rider.installed,
    camera: snapshot.camera.mode,
    subject: window.qa.projectPoint(at.x, at.y + 0.6, at.z),
    speed: snapshot.euc.speed,
    airHeight: snapshot.euc.airHeight,
    oneFoot: snapshot.tricks.pose.oneFoot,
    crashed: snapshot.euc.crashed,
    ragdolling: snapshot.euc.ragdolling,
    crashTime: snapshot.euc.crashTime,
    glError: gl.getError(),
  };
}

function expectDrawnFrame(frame: ReturnType<typeof frameEvidence>, views: number, tier: string): void {
  expect(frame.quality).toMatchObject({ requested: tier, effective: tier });
  expect(frame.seatCount).toBe(views);
  expect(frame.views).toBe(views);
  expect(frame.rider).toBe('gnarwheel');
  expect(frame.camera).toBe('chase');
  expect(frame.panes[0].character).toBe('gnarwheel');
  expect(new Set(frame.panes.map((pane) => pane.character)).size).toBe(views);
  for (const pane of frame.panes) {
    expect(pane.camera, `seat ${pane.seat}'s camera`).toBe('chase');
    expect(pane.distinctColours, `seat ${pane.seat}'s drawn world`).toBeGreaterThan(3);
  }
  expect(frame.resources.geometries).toBeGreaterThan(0);
  expect(frame.resources.textures).toBeGreaterThan(0);
  expect(frame.subject.inFront).toBe(true);
  expect(Math.abs(frame.subject.x)).toBeLessThan(1);
  expect(Math.abs(frame.subject.y)).toBeLessThan(1);
  expect(frame.glError).toBe(0);
}

async function neutralRide(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.qa.resetRide();
    window.game.setActions({ throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
    window.game.advance(60);
  });
}

test('Gnarwheel resources plateau and installed views supply private review evidence', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const audioRequests: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/assets\/live\/audio\//.test(path)) audioRequests.push(path);
  });
  await page.setViewportSize(DESKTOP);
  await bootAtTier(page, 'level=slice', 'high', {
    freezeAtStart: true,
    options: { character: 'gnarwheel' },
  });

  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);
  await neutralRide(page);
  const requestedAudio = [...audioRequests];
  const lifecycle = await page.evaluate(() => {
    const game = window.game;
    const endpoint = (character: 'cool-rider' | 'gnarwheel') => {
      game.setOptions({ character });
      game.advance(30);
      const audio = game.audioSnapshot();
      return {
        character: game.snapshot().rider.installed,
        resources: game.resources(),
        audio: { samplesLoaded: audio.samplesLoaded, permanentNodes: audio.permanentNodes, voice: audio.crashVoice },
      };
    };

    endpoint('cool-rider');
    endpoint('gnarwheel');
    const baseline = { cool: endpoint('cool-rider'), gnarwheel: endpoint('gnarwheel') };
    const rounds = Array.from({ length: 3 }, () => ({
      cool: endpoint('cool-rider'), gnarwheel: endpoint('gnarwheel'),
    }));
    return { baseline, rounds };
  });
  expect(lifecycle.baseline.cool.character).toBe('cool-rider');
  expect(lifecycle.baseline.gnarwheel.character).toBe('gnarwheel');
  expect(lifecycle.baseline.gnarwheel.audio).toMatchObject({ samplesLoaded: true, voice: 'gnarwheel' });
  expect(lifecycle.baseline.gnarwheel.audio.permanentNodes).toBeGreaterThan(0);
  for (const round of lifecycle.rounds) {
    expect(round.cool).toEqual(lifecycle.baseline.cool);
    expect(round.gnarwheel).toEqual(lifecycle.baseline.gnarwheel);
  }
  expect(audioRequests).toEqual(requestedAudio);
  await testInfo.attach('gnarwheel-swap-lifecycle', {
    body: JSON.stringify(lifecycle, null, 2), contentType: 'application/json',
  });

  await page.evaluate(() => window.game.setAppState('title'));
  await page.locator('.euc-rider-chip').click();
  const menu = page.locator('.euc-menu--riders');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-rider]')).toHaveCount(CHARACTERS.length);
  for (const viewport of [DESKTOP, { width: 375, height: 667 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction((size) => {
      const actual = window.game.renderer.viewport();
      return actual.width === size.width && actual.height === size.height;
    }, viewport);
    const layout = await menu.evaluate((element) => {
      const box = (node: Element) => {
        const bounds = node.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, right: bounds.right, bottom: bounds.bottom };
      };
      const done = element.querySelector('[data-menu="riders-back"]');
      if (!done) throw new Error('the rider chooser has no Done control');
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
        cards: [...element.querySelectorAll('[data-rider]')].map(box),
        done: box(done),
        scrollOverflow: element.scrollHeight - element.clientHeight,
      };
    });
    expect(layout.scrollOverflow).toBeLessThanOrEqual(1);
    for (const card of layout.cards) {
      expect(card.width).toBeGreaterThanOrEqual(44);
      expect(card.height).toBeGreaterThanOrEqual(44);
      expect(card.x).toBeGreaterThanOrEqual(0);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(viewport.width + 1);
      expect(card.bottom).toBeLessThanOrEqual(viewport.height + 1);
    }
    if (layout.coarsePointer) {
      expect(layout.done.width).toBeGreaterThanOrEqual(44);
      expect(layout.done.height).toBeGreaterThanOrEqual(44);
    }
    expect(layout.done.x).toBeGreaterThanOrEqual(0);
    expect(layout.done.y).toBeGreaterThanOrEqual(0);
    expect(layout.done.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(layout.done.bottom).toBeLessThanOrEqual(viewport.height - (viewport.width < 1000 ? 16 : 0));
    await saveEvidence(page, testInfo, `chooser-${viewport.width}x${viewport.height}`, layout);
  }
  await menu.locator('[data-menu="riders-back"]').click();
  await page.setViewportSize(DESKTOP);
  await page.evaluate(() => {
    window.game.setAppState('freeRide');
    window.game.loop.setRunning(false);
  });
  await neutralRide(page);
  const high = await page.evaluate(frameEvidence);
  expectDrawnFrame(high, 1, 'high');
  expect(high.crashed).toBe(false);
  expect(high.oneFoot).toBe(0);
  await saveEvidence(page, testInfo, 'gnarwheel-high-neutral-chase', high);

  const hop = await page.evaluate(() => {
    window.qa.resetRide();
    const game = window.game;
    game.setActions({ throttle: 1, steer: 0, crouch: false, hop: false, hopHeld: false });
    game.advance(300);
    game.setActions({ hop: true });
    game.advance(1);
    game.setActions({ hop: false });
    let air = 0;
    for (let step = 0; step < 200 && air < 30; step += 1) {
      game.advance(1);
      if (game.snapshot().euc.airHeight > 0) air += 1;
    }
    return { air, ...game.snapshot().tricks.pose };
  });
  expect(hop.air).toBe(30);
  const hopped = await page.evaluate(frameEvidence);
  expectDrawnFrame(hopped, 1, 'high');
  expect(hopped.crashed).toBe(false);
  expect(hopped.airHeight).toBeGreaterThan(0);
  expect(hopped.oneFoot).toBe(0);
  await saveEvidence(page, testInfo, 'gnarwheel-high-hop-chase', hopped);

  await page.evaluate(() => {
    window.qa.resetRide();
    const game = window.game;
    game.setActions({ throttle: 1, steer: 0, crouch: false, hop: false, hopHeld: false });
    game.advance(300);
    game.setActions({ hop: true, hopHeld: true });
    game.advance(1);
    game.setActions({ hop: false });
    for (let step = 0; step < 200; step += 1) {
      game.advance(1);
      if (game.snapshot().tricks.pose.oneFoot >= 0.999) return;
    }
    throw new Error('Gnarwheel never reached the full held-hop gesture');
  });
  const oneFoot = await page.evaluate(frameEvidence);
  expectDrawnFrame(oneFoot, 1, 'high');
  expect(oneFoot.crashed).toBe(false);
  expect(oneFoot.airHeight).toBeGreaterThan(0);
  expect(oneFoot.oneFoot).toBeGreaterThanOrEqual(0.999);
  await saveEvidence(page, testInfo, 'gnarwheel-high-one-foot-chase', oneFoot);

  await page.evaluate(() => {
    window.qa.resetRide();
    const game = window.game;
    game.setActions({ crouch: false, hop: false, hopHeld: false });
    let steps = 0;
    while (steps < 3000 && !game.snapshot().euc.crashed) {
      game.setActions({ throttle: 1, steer: Math.floor(steps / 30) % 2 === 0 ? 1 : -1 });
      game.advance(6);
      steps += 6;
    }
    game.setActions({ throttle: 0, steer: 0 });
    game.advance(24);
  });
  const crash = await page.evaluate(frameEvidence);
  expectDrawnFrame(crash, 1, 'high');
  expect(crash.crashed).toBe(true);
  expect(crash.ragdolling).toBe(true);
  expect(crash.crashTime).toBeGreaterThan(0);
  await saveEvidence(page, testInfo, 'gnarwheel-high-crash-chase', crash);

  await neutralRide(page);
  await page.evaluate(() => {
    window.game.spawnSecondRider('cool-rider');
    window.game.advance(30);
  });
  const split = await page.evaluate(frameEvidence);
  expectDrawnFrame(split, 2, 'high');
  expect(split.quality.multiplayer).toBe(true);
  await saveEvidence(page, testInfo, 'gnarwheel-high-two-seat-chase', split);
  await page.evaluate(() => {
    window.game.spawnRider('trollina');
    window.game.spawnRider('red-rider');
    window.game.advance(30);
  });
  const quad = await page.evaluate(frameEvidence);
  expectDrawnFrame(quad, 4, 'high');
  expect(quad.quality.multiplayer).toBe(true);
  await saveEvidence(page, testInfo, 'gnarwheel-high-four-seat-chase', quad);

  for (const tier of ['low', 'medium', 'ultra'] as const) {
    await bootAtTier(page, 'level=slice', tier, {
      freezeAtStart: true,
      options: { character: 'gnarwheel' },
    });
    await neutralRide(page);
    const frame = await page.evaluate(frameEvidence);
    expectDrawnFrame(frame, 1, tier);
    expect(frame.quality.multiplayer).toBe(false);
    expect(frame.crashed).toBe(false);
    expect(frame.oneFoot).toBe(0);
    await saveEvidence(page, testInfo, `gnarwheel-${tier}-neutral-chase`, frame);
  }
  expect(errors).toEqual([]);
});
