/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Local built-artifact comparison; no source-module imports in the page. */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';

test('matched built-game costs, boot and exact visibility parity', async ({ browser }) => {
  test.skip(!process.env.QUALITY_ARTIFACT_URLS,
    'Preserved-artifact diagnostic: set QUALITY_ARTIFACT_URLS to before,current,owner-export server URLs.');
  test.setTimeout(180_000);
  const out = process.env.QUALITY_ARTIFACT_SHOTS ?? 'test-results/quality-artifact'; mkdirSync(out, { recursive: true });
  const urls = process.env.QUALITY_ARTIFACT_URLS!.split(',').map(url => url.trim());
  expect(urls).toHaveLength(3);
  const evidence: unknown[] = [];
  for (const [index, label] of (['before', 'current', 'owner-export'] as const).entries()) {
    const page = await browser.newPage({ baseURL: urls[index], viewport: { width: 1280, height: 800 } });
    const errors = collectErrors(page), start = Date.now();
    try {
      await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true, options: { showFps: false } });
      const bootMilliseconds = Date.now() - start;
      const result = await page.evaluate(label => {
        const g = window.game, r = g.renderer;
        const population = (r as unknown as { population: { prepareView?: (...args: unknown[]) => void } }).population;
        const prepare = population.prepareView;
        const gl = r.renderer.getContext();
        const pixels = () => { const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
        const shapes = [];
        for (const count of [1, 2, 4]) {
          while (r.viewCount < count) g.spawnRider(); g.advance(0);
          const optimized = { calls: r.renderer.info.render.calls, triangles: r.renderer.info.render.triangles }, a = pixels();
          if (label === 'current') population.prepareView = () => {};
          let reference, b;
          try { g.advance(0); reference = { calls: r.renderer.info.render.calls, triangles: r.renderer.info.render.triangles }; b = pixels(); }
          finally { if (prepare) population.prepareView = prepare; g.advance(0); }
          let different = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different++;
          shapes.push({ count, optimized, reference, different, nonzero: a.some(v => v !== 0) });
        }
        return { shapes, presentation: r.presentation(), resources: g.snapshot().resources,
          populationDigest: g.populationState().digest, planId: g.levelPlan.id, glError: gl.getError() };
      }, label);
      expect(result.glError).toBe(0); expect(errors).toEqual([]);
      for (const shape of result.shapes) { expect(shape.nonzero).toBe(true); expect(shape.different).toBe(0); }
      await page.screenshot({ path: join(out, `${label}-quad.png`) });
      evidence.push({ label, bootMilliseconds, ...result, errors });
    } finally { await page.close(); }
  }
  writeFileSync(join(out, 'comparison.json'), JSON.stringify(evidence, null, 2));
});
