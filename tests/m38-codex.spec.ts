/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootToTitle, collectErrors } from './harness.ts';

/** Installed-zone attack: no injected awards, controller resets between hops or spliced idle time. */
test('Codex QA: paced stationary feature hops use the real controller and score path', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=switchback');
  await page.locator('.euc-menu--title [data-menu="trick-run"]').click();
  const evidence = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const zone = game.levelPlan.trickZones!.find((entry) => entry.id === 'ledge')!;
    const x = zone.corners.reduce((sum, corner) => sum + corner.x, 0) / zone.corners.length;
    const z = zone.corners.reduce((sum, corner) => sum + corner.z, 0) / zone.corners.length;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z }, 0);
    game.advance(1); // Spend the placement's discard; the whole run remains ineligible.
    const awards: { points: number; kinds: readonly string[]; zone: string | null; repeated: boolean }[] = [];
    let lastLaunch = -1260;
    let held = false;
    let spun = false;
    let maxDisplacement = 0;
    for (let step = 0; step < 3600; step += 1) {
      const controller = game.controller;
      const before = controller.snapshot();
      const hop = controller.canAcceptHop && step - lastLaunch >= 1260;
      const spin = !before.grounded && !spun && controller.canAcceptSpin;
      if (spin) spun = true;
      if (hop) held = true;
      game.setActionsFor(0, { throttle: 0, steer: spin ? -1 : 0, crouch: false,
        hop: hop || spin, hopHeld: held && !spin });
      game.advance(1);
      if (controller.tookOff) lastLaunch = step;
      if (controller.touchedDown) {
        held = false;
        spun = false;
        const award = game.trickRun.book(0)?.lastAward;
        if (award) awards.push({ points: award.points, kinds: award.kinds, zone: award.zone, repeated: award.repeated });
      }
      const p = controller.snapshot().position;
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(p.x - x, p.z - z));
    }
    const run = game.snapshot().trickRun;
    return { awards, maxDisplacement, eligible: run.eligible, score: run.seats[0].score,
      crashes: run.seats[0].crashes, openZone: run.seats[0].openZone };
  });
  expect(evidence.maxDisplacement).toBe(0);
  expect(evidence.crashes).toBe(0);
  expect(evidence.eligible).toBe(false);
  expect(evidence.awards).toHaveLength(3);
  for (const award of evidence.awards) {
    expect(award.zone).toBe('ledge');
    expect(award.kinds).toEqual(['spin-landed', 'one-foot-air']);
  }
  // A measurement pin for the current owner-approved rule, not balance acceptance.
  // A scoring-rule change must update this and the bench's camping comparison together.
  // 2026-09-14: the owner's per-feature repeat clocks answer exactly this finding —
  // the same ledge paying again inside a minute pays half, then a quarter, of the
  // whole flight (448 → 224 → 112), where the per-trick clocks paid 448 three times.
  expect(evidence.awards.map((award) => award.points)).toEqual([448, 224, 112]);
  expect(evidence.awards.map((award) => award.repeated)).toEqual([false, true, true]);
  expect(evidence.score).toBe(784);
  const directory = process.env.M38_SHOTS ?? 'test-results/m38-codex';
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'feature-camping-browser.json'), JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: join(directory, 'feature-camping-browser.png') });
  expect(errors).toEqual([]);
});
