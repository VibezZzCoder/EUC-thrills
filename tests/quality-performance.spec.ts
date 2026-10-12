/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Bounded visual/per-pane submission evidence. No frame cadence or FPS reads. */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';

const out = process.env.QUALITY_PASS_SHOTS ?? 'test-results/quality-performance-2026-10-12/current';
for (const quality of ['high', 'ultra'] as const) test(`pedestrian and entry quality ${quality}`, async ({ page }) => {
  test.setTimeout(180_000); mkdirSync(out, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  const started = Date.now();
  await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true, options: { showFps: false } });
  const bootMilliseconds = Date.now() - started;
  await page.evaluate(() => {
    const loop = window.game.loop as unknown as { callbacks: { render(alpha: number, synthetic?: boolean): void } };
    const draw = loop.callbacks.render;
    loop.callbacks.render = (alpha, synthetic) => { if (synthetic) draw(alpha, synthetic); };
    window.game.advance(0);
  });
  const records: unknown[] = [];
  const entries = await page.evaluate(() => {
    const r = window.game.renderer as unknown as { metricFacade: { descriptors: { apertures: {
      kind: string; mouth: { x: number; y: number; z: number }[]; back: { x: number; y: number; z: number }[];
      id: string }[] } } };
    return r.metricFacade.descriptors.apertures.filter(a => a.kind === 'entry').slice(0, 3);
  });
  for (const [index, entry] of entries.entries()) for (const side of [-1, 1]) {
    await page.evaluate(({ entry, side }) => {
      const [a, b] = entry.mouth, back = entry.back[0], r = window.game.renderer, c = r.camera;
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const nx = a.x - back.x, nz = a.z - back.z, reach = Math.hypot(nx, nz);
      c.position.set(x + nx / reach * 3 + nz / reach * side * 1.5, a.y + 0.65,
        z + nz / reach * 3 - nx / reach * side * 1.5);
      c.lookAt(x, a.y + 0.15, z); c.updateMatrixWorld(); r.setShadowFocus(x, a.y, z); r.render();
    }, { entry, side });
    await page.screenshot({ path: join(out, `entry-${index}-${side}-${quality}.png`) });
  }
  for (let frame = 0; frame < 8; frame++) {
    await page.evaluate(({ entry, frame }) => {
      const g = window.game; g.clearActions(); g.advance(12);
      const [a, b] = entry.mouth, back = entry.back[0], r = g.renderer, c = r.camera;
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
      const nx = a.x - back.x, nz = a.z - back.z, reach = Math.hypot(nx, nz), side = -0.8 + frame * 0.23;
      c.position.set(x + nx / reach * 3 + nz / reach * side, a.y + 0.45,
        z + nz / reach * 3 - nx / reach * side);
      c.lookAt(x, a.y + 0.03, z); c.updateMatrixWorld(); r.setShadowFocus(x, a.y, z); r.render();
    }, { entry: entries[1], frame });
    await page.screenshot({ path: join(out, `entry-motion-${String(frame).padStart(2, '0')}-${quality}.png`) });
  }
  const actors = await page.evaluate(() => window.game.populationState().simulation.actors
    .filter(a => ['walker', 'jogger', 'worker', 'social', 'fictionalEuc'].includes(a.kind)));
  expect(actors.length).toBeGreaterThan(0);
  for (const kind of ['walker', 'worker', 'social', 'fictionalEuc']) {
    const subject = actors.find(a => a.kind === kind); if (!subject) continue;
    for (const [name, distance, yaw] of [['front', 2.5, 0.25], ['back', 2.5, 3.6], ['left', 2.5, 1.6],
      ['right', 2.5, -1.6], ['gameplay', 8, 0.6]] as const) {
      const record = await page.evaluate(({ subject, distance, yaw }) => {
        const r = window.game.renderer, c = r.camera, angle = subject.headingY + yaw;
        c.position.set(subject.x + Math.sin(angle) * distance, subject.y + 1.7, subject.z + Math.cos(angle) * distance);
        c.lookAt(subject.x, subject.y + 1.10, subject.z); c.updateMatrixWorld();
        r.setShadowFocus(subject.x, subject.y, subject.z); r.render();
        return { subject, camera: c.position.toArray(), calls: r.renderer.info.render.calls,
          triangles: r.renderer.info.render.triangles, population: r.presentation()?.population };
      }, { subject, distance, yaw });
      await page.screenshot({ path: join(out, `${kind}-${name}-${quality}.png`) }); records.push(record);
    }
  }
  await page.evaluate(subject => {
    const g = window.game, sn = Math.sin(subject.headingY), cs = Math.cos(subject.headingY);
    for (const side of [1, -1]) {
      const x = subject.x + cs * side * 1.5, z = subject.z - sn * side * 1.5, ground = g.sampleGround(x, z);
      try { g.placeRider({ x, y: ground.height, z }, subject.headingY); g.advance(0); break; } catch { /* Other side. */ }
    }
    const c = g.renderer.camera;
    c.position.set(subject.x + sn * 8 + cs * 3, subject.y + 2.3, subject.z + cs * 8 - sn * 3);
    c.lookAt(subject.x, subject.y + 1, subject.z); c.updateMatrixWorld();
    g.renderer.setShadowFocus(subject.x, subject.y, subject.z); g.renderer.render();
  }, actors.find(a => a.kind === 'walker')!);
  await page.screenshot({ path: join(out, `rider-pedestrian-scale-${quality}.png`) });
  // Genuine fixed steps and oblique head motion, not a renderer-owned animation.
  const subject = actors.find(a => a.kind === 'walker')!;
  for (let frame = 0; frame < 4; frame++) {
    const record = await page.evaluate(id => {
      const g = window.game; g.clearActions(); g.advance(30);
      const a = g.populationState().simulation.actors.find(a => a.id === id)!, c = g.renderer.camera;
      c.position.set(a.x + 2, a.y + 1.7, a.z + 1.8); c.lookAt(a.x, a.y + 1.15, a.z);
      c.updateMatrixWorld(); g.renderer.setShadowFocus(a.x, a.y, a.z); g.renderer.render(); return { actor: a, tick: g.populationState().simulation.tick };
    }, subject.id);
    await page.screenshot({ path: join(out, `walker-motion-${frame}-${quality}.png`) }); records.push(record);
  }
  const fronts = await page.evaluate(async () => {
    const path = '/src/level/streetFronts.ts'; const { streetFronts } = await import(path);
    return streetFronts(window.game.levelPlan);
  });
  for (const front of fronts) for (const side of [-1, 1]) {
    const record = await page.evaluate(({ front, side }) => {
      const c = window.game.renderer.camera, sn = Math.sin(front.yaw), cs = Math.cos(front.yaw);
      c.position.set(front.position.x + cs * side * 3 + sn * 4, front.position.y + 1.0,
        front.position.z - sn * side * 3 + cs * 4);
      c.lookAt(front.position.x, front.position.y + 0.3, front.position.z); c.updateMatrixWorld();
      window.game.renderer.render(); return { front, side, camera: c.position.toArray() };
    }, { front, side });
    await page.screenshot({ path: join(out, `shop-${front.shop}-${side}-${quality}.png`) }); records.push(record);
  }
  if (quality === 'high') {
    const multi = await page.evaluate(() => {
      const g = window.game; while (g.renderer.viewCount < 4) g.spawnRider(); g.advance(0);
      return { calls: g.renderer.renderer.info.render.calls, triangles: g.renderer.renderer.info.render.triangles,
        resources: g.snapshot().resources, population: g.renderer.presentation()?.population };
    });
    await page.screenshot({ path: join(out, 'four-player-high.png') }); records.push({ multi });
    await page.evaluate(subject => {
      const r = window.game.renderer;
      for (let seat = 0; seat < 4; seat++) {
        const c = r.cameraFor(seat), yaw = subject.headingY + seat * 1.3, reach = 5;
        c.position.set(subject.x + Math.sin(yaw) * reach, subject.y + 1.6, subject.z + Math.cos(yaw) * reach);
        c.lookAt(subject.x, subject.y + 1, subject.z); c.updateMatrixWorld();
      }
      r.setShadowFocus(subject.x, subject.y, subject.z); r.render();
    }, actors.find(a => a.kind === 'walker')!);
    await page.screenshot({ path: join(out, 'four-player-pedestrian-diagnostic-high.png') });
  }
  // Same-build negative control: disable only visibility packing, compare the
  // entire framebuffer including shadows, then restore the real implementation.
  const parity = await page.evaluate(() => {
    const g = window.game, r = g.renderer;
    const population = (r as unknown as { population: { prepareView: (...args: unknown[]) => void } }).population;
    const prepare = population.prepareView, gl = r.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = () => { const bytes = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes; };
    const draw = () => { g.advance(0); return { calls: r.renderer.info.render.calls, triangles: r.renderer.info.render.triangles }; };
    const optimized = draw(), a = pixels();
    population.prepareView = () => {};
    let reference, b;
    try { reference = draw(); b = pixels(); } finally { population.prepareView = prepare; draw(); }
    let different = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different++;
    return { optimized, reference, different, bytes: a.length, nonzero: a.some(v => v !== 0) };
  });
  expect(parity.nonzero).toBe(true); expect(parity.different).toBe(0);
  expect(parity.optimized.triangles).toBeLessThan(parity.reference!.triangles);
  records.push({ visibilityParity: parity });
  expect(errors).toEqual([]);
  writeFileSync(join(out, `evidence-${quality}.json`), JSON.stringify({ bootMilliseconds, quality, records, errors }, null, 2));
});

for (const quality of ['high', 'ultra'] as const) test(`road and curb seam parallax ${quality}`, async ({ page }) => {
  test.setTimeout(150_000); mkdirSync(out, { recursive: true });
  const errors = collectErrors(page); await page.setViewportSize({ width: 1280, height: 800 });
  const evidence: unknown[] = [];
  for (const world of ['slice', 'generated'] as const) {
    await bootAtTier(page, `level=${world}&seed=euc`, quality, { freezeAtStart: true, options: { showFps: false } });
    const target = await page.evaluate(world => {
      const g = window.game;
      const loop = g.loop as unknown as { callbacks: { render(alpha: number, synthetic?: boolean): void } };
      const draw = loop.callbacks.render; loop.callbacks.render = (alpha, synthetic) => { if (synthetic) draw(alpha, synthetic); };
      if (world === 'slice') {
        const block = g.levelPlan.segments.find(s => s.id === 'curb-run')!.colliders
          .find(b => b.appearance === 'concrete')!;
        if (!block) throw new Error('The authored curb-run must supply its concrete sidewalk');
        return { x: block.centre.x, y: block.centre.y + block.halfExtents.y, z: block.centre.z, yaw: block.rotationY };
      }
      const patch = g.levelPlan.groundSurfacePatches!.find(p => p.id.includes('/driveway-') && p.sourceSurface === 'grass')!;
      const vertices = patch.triangles[0].vertices;
      return { x: vertices.reduce((s,v) => s + v.x / 3, 0), y: vertices.reduce((s,v) => s + v.y / 3, 0),
        z: vertices.reduce((s,v) => s + v.z / 3, 0), yaw: 0 };
    }, world);
    evidence.push({ world, target });
    for (let frame = 0; frame < 8; frame++) {
      await page.evaluate(({ target, frame }) => {
        const g = window.game; g.clearActions(); g.advance(12); const r = g.renderer, c = r.camera;
        const yaw = target.yaw + 0.5 + frame * 0.07;
        c.position.set(target.x + Math.cos(yaw) * 4, target.y + 0.7, target.z + Math.sin(yaw) * 4);
        c.lookAt(target.x, target.y, target.z); c.updateMatrixWorld(); r.setShadowFocus(target.x, target.y, target.z); r.render();
      }, { target, frame });
      await page.screenshot({ path: join(out, `${world}-road-motion-${String(frame).padStart(2, '0')}-${quality}.png`) });
    }
  }
  expect(errors).toEqual([]); writeFileSync(join(out, `road-evidence-${quality}.json`), JSON.stringify({ evidence, errors }, null, 2));
});
