/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';

const out = process.env.PEDESTRIAN_FACE_SHOTS ?? 'test-results/pedestrian-face-2026-10-12/current';
for (const quality of ['high', 'ultra'] as const) test(`plain pedestrian clothing and basic mouth ${quality}`, async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(out, { recursive: true });
  const errors = collectErrors(page); await page.setViewportSize({ width: 1280, height: 800 });
  await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true, options: { showFps: false } });
  await page.evaluate(() => {
    const loop = window.game.loop as unknown as { callbacks: { render(alpha: number, synthetic?: boolean): void } };
    const draw = loop.callbacks.render; loop.callbacks.render = (alpha, synthetic) => { if (synthetic) draw(alpha, synthetic); };
  });
  const records: unknown[] = [];
  const actors = await page.evaluate(() => window.game.populationState().simulation.actors);
  for (const kind of ['walker', 'social', 'worker', 'fictionalEuc']) {
    const subject = actors.find(a => a.kind === kind)!;
    for (const [name, distance, angle] of [['front', 2.5, 0.25], ['oblique', 2.5, 0.8], ['gameplay', 8, 0.6]] as const) {
      const record = await page.evaluate(({ subject, distance, angle }) => {
        const r = window.game.renderer, c = r.camera, yaw = subject.headingY + angle;
        c.position.set(subject.x + Math.sin(yaw) * distance, subject.y + 1.7, subject.z + Math.cos(yaw) * distance);
        c.lookAt(subject.x, subject.y + 1.1, subject.z); c.updateMatrixWorld();
        r.setShadowFocus(subject.x, subject.y, subject.z); r.render();
        return { subject, name: subject.kind, distance, camera: c.position.toArray(), population: r.presentation()?.population };
      }, { subject, distance, angle });
      await page.screenshot({ path: join(out, `${kind}-${name}-${quality}.png`) }); records.push(record);
    }
  }
  const walker = actors.find(a => a.kind === 'walker')!;
  for (let frame = 0; frame < 4; frame++) {
    await page.evaluate(({ id, frame }) => {
      const g = window.game; g.clearActions(); g.advance(24);
      const a = g.populationState().simulation.actors.find(a => a.id === id)!, c = g.renderer.camera, yaw = a.headingY + frame * 0.12;
      c.position.set(a.x + Math.sin(yaw) * 2.5, a.y + 1.7, a.z + Math.cos(yaw) * 2.5);
      c.lookAt(a.x, a.y + 1.1, a.z); c.updateMatrixWorld(); g.renderer.setShadowFocus(a.x, a.y, a.z); g.renderer.render();
    }, { id: walker.id, frame });
    await page.screenshot({ path: join(out, `walker-motion-${frame}-${quality}.png`) });
  }
  if (quality === 'high') {
    await page.evaluate(subject => {
      const g = window.game, r = g.renderer; while (r.viewCount < 4) g.spawnRider(); g.advance(0);
      for (let seat = 0; seat < 4; seat++) {
        const c = r.cameraFor(seat), yaw = subject.headingY + seat * 0.3;
        c.position.set(subject.x + Math.sin(yaw) * 4, subject.y + 1.7, subject.z + Math.cos(yaw) * 4);
        c.lookAt(subject.x, subject.y + 1.1, subject.z); c.updateMatrixWorld();
      }
      r.setShadowFocus(subject.x, subject.y, subject.z); r.render();
    }, walker);
    await page.screenshot({ path: join(out, 'four-pane-pedestrian-high.png') });
  }
  expect(errors).toEqual([]);
  writeFileSync(join(out, `evidence-${quality}.json`), JSON.stringify({ quality, records, errors }, null, 2));
});
