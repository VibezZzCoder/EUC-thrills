/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
/** Focused release journeys. No frame cadence or FPS measurements. */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootAtTier, collectErrors } from './harness.ts';

const out = process.env.EUC_RELEASE_SHOTS ?? 'test-results/export-readiness/current';
// The shared boot harness navigates from a domain root. Map just those
// navigations onto the exact package's hosting base for artifact verification.
test.beforeEach(async ({ page }) => {
  mkdirSync(out, { recursive: true });
  const base = process.env.EUC_RELEASE_URL;
  if (base) {
    const navigate = page.goto.bind(page);
    page.goto = (url, options) => navigate(url.startsWith('/')
      ? new URL(url.slice(1), base).href : url, options);
  }
});

test('four moving seats preserve population and shadow pixels across separated views', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await bootAtTier(page, 'level=generated&seed=euc', 'high', {
    freezeAtStart: true, options: { showFps: false },
  });
  const initial = await page.evaluate(() => {
    const g = window.game;
    while (g.renderer.viewCount < 4) g.spawnRider();
    const points = window.qa.routePoints([g.levelPlan.segments[0].id], 2);
    for (let seat = 0; seat < 4; seat++) {
      const at = 2 + seat * 5, p = points[at], q = points[at + 1];
      if (!p || !q) throw new Error('The separated ride needs a complete first road');
      g.placeRider({ x: p.x, y: g.sampleGround(p.x, p.z).height, z: p.z },
        Math.atan2(q.x - p.x, q.z - p.z), seat);
      g.setActionsFor(seat, { throttle: 0.22 });
    }
    const loop = g.loop as unknown as { callbacks: { render(alpha: number, synthetic?: boolean): void } };
    const draw = loop.callbacks.render;
    loop.callbacks.render = (alpha, synthetic) => { if (synthetic) draw(alpha, synthetic); };
    g.advance(0);
    return { seats: [0, 1, 2, 3].map(i => g.snapshotFor(i).euc.position),
      population: g.populationState(), resources: g.snapshot().resources };
  });
  const records: unknown[] = [];
  for (let frame = 0; frame < 12; frame++) {
    const current = await page.evaluate(frame => {
      const g = window.game, r = g.renderer;
      g.advance(30);
      if (frame >= 6) {
        const a = g.populationState().simulation.actors.find(a => a.kind === 'walker')!;
        for (let seat = 0; seat < 4; seat++) {
          const c = r.cameraFor(seat), yaw = a.headingY + seat * 1.25 + (frame - 6) * 0.12;
          c.position.set(a.x + Math.sin(yaw) * 6, a.y + 1.6, a.z + Math.cos(yaw) * 6);
          c.lookAt(a.x, a.y + 0.9, a.z); c.updateMatrixWorld();
        }
        r.setShadowFocus(a.x, a.y, a.z);
      }
      const owner = (r as unknown as { population: { prepareView: (...args: unknown[]) => void } }).population;
      const prepare = owner.prepareView, gl = r.renderer.getContext();
      const pixels = () => {
        const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
        gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return p;
      };
      r.render(); const a = pixels(), optimized = r.renderer.info.render.triangles;
      owner.prepareView = () => {};
      let b: Uint8Array, reference: number;
      try { r.render(); b = pixels(); reference = r.renderer.info.render.triangles; }
      finally { owner.prepareView = prepare; r.render(); }
      let different = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b![i]) different++;
      return { frame, tick: g.populationState().simulation.tick, different,
        nonzero: a.some(v => v !== 0), optimized, reference: reference!, glError: gl.getError(),
        seats: [0, 1, 2, 3].map(i => g.snapshotFor(i).euc.position),
        cameras: [0, 1, 2, 3].map(i => r.cameraFor(i).position.toArray()),
        population: g.populationState(), presentation: r.presentation()?.population,
        resources: g.snapshot().resources };
    }, frame);
    records.push(current);
    expect(current.tick).toBe(initial.population.simulation.tick + (frame + 1) * 30);
    expect(current.different, `frame ${frame}: culling must preserve all colour and shadow pixels`).toBe(0);
    expect(current.nonzero).toBe(true); expect(current.glError).toBe(0);
    expect(current.resources).toEqual(initial.resources);
    expect(current.presentation!.missingPoseIds).toEqual([]);
    expect(current.presentation!.missingSurfaceSupportIds).toEqual([]);
    if ([0, 5, 6, 11].includes(frame)) await page.screenshot({ path: join(out, `quad-motion-${frame}.png`) });
    if (frame === 11) for (let seat = 0; seat < 4; seat++) {
      const p = initial.seats[seat], q = current.seats[seat];
      expect(Math.hypot(q.x - p.x, q.z - p.z), `seat ${seat} must actually ride`).toBeGreaterThan(1);
    }
  }
  expect(records.some(r => (r as { optimized: number; reference: number }).optimized
    < (r as { reference: number }).reference)).toBe(true);
  expect(errors).toEqual([]);
  writeFileSync(join(out, 'quad-motion.json'), JSON.stringify({ initial, records, errors,
    scope: 'Production fixed-step four-seat motion, six chase samples and six moving-actor camera sweeps. Pixel parity includes shadows. Physical controllers and sustained device play remain owner acceptance.' }, null, 2));
});

test('native world changes and graphics rebuilds plateau; each tier keeps one stable roster', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page), records: unknown[] = [];
  await bootAtTier(page, 'level=generated&seed=euc', 'high', {
    freezeAtStart: true, options: { showFps: false },
  });
  const previous = new Map<string, unknown>();
  for (let cycle = 0; cycle < 3; cycle++) for (const seed of [null, 'corner', 'euc']) {
    await page.evaluate(() => { window.game.setAppState('title'); window.game.loop.setRunning(false); });
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    if (seed === null) await page.locator('.euc-menu--routes [data-menu="venue"][data-venue="slice"]').click();
    else {
      await page.locator('#euc-seed').fill(seed);
      await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
    }
    const identity = seed === null ? 'm7-slice~living-r1' : `generated-r6-${seed}~living-r1`;
    await expect.poll(() => page.evaluate(() => window.game.levelPlan.recordWorldId), { timeout: 90_000 }).toBe(identity);
    await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
    const current = await page.evaluate(() => {
      const g = window.game; g.loop.setRunning(false); g.advance(0);
      return { population: g.populationState(), resources: g.snapshot().resources,
        glError: g.renderer.renderer.getContext().getError() };
    });
    expect(current.glError).toBe(0);
    if (cycle === 2) expect(current.resources).toEqual(previous.get(identity));
    previous.set(identity, current.resources); records.push({ cycle, identity, ...current });
  }
  // M47 (PLANS §47.3): the effective tier picks the living world's roster.
  // Low is the living-r1 base, Medium and High their density layers, and
  // Ultra draws High's. Each tier's roster is the same on every visit, a
  // switch never re-identifies the world, and High's is the boot's.
  const baseline = await page.evaluate(() => window.game.populationState());
  expect(baseline.densityLayer).toBe('high');
  const layerOf = { low: 'base', medium: 'medium', high: 'high', ultra: 'high' } as const;
  const tiers = new Map<string, unknown>();
  const rosters = new Map<string, { digest: string; rosterActors: number; simulation: unknown }>();
  for (let cycle = 0; cycle < 3; cycle++) for (const [index, quality] of (['low', 'medium', 'high', 'ultra', 'high'] as const).entries()) {
    const key = index === 4 ? 'high-return' : quality;
    const current = await page.evaluate(quality => {
      const g = window.game; g.setOptions({ quality }); g.advance(0);
      return { population: g.populationState(), resources: g.snapshot().resources,
        recordWorldId: g.levelPlan.recordWorldId, glError: g.renderer.renderer.getContext().getError() };
    }, quality);
    expect(current.recordWorldId).toBe('generated-r6-euc~living-r1');
    expect(current.population.densityLayer).toBe(layerOf[quality]);
    expect(current.population.densityPending).toBe(false);
    expect(current.population.rosterActors).toBe(current.population.simulation.actors.length);
    // High and Ultra share one roster; every other tier keeps its own.
    const roster = rosters.get(layerOf[quality]);
    if (roster) {
      expect(current.population.digest).toBe(roster.digest);
      expect(current.population.rosterActors).toBe(roster.rosterActors);
      // Ultra over High changes no roster, so the living world runs on untouched.
      if (quality === 'ultra') expect(current.population.simulation).toEqual(roster.simulation);
    } else rosters.set(layerOf[quality], { digest: current.population.digest,
      rosterActors: current.population.rosterActors, simulation: current.population.simulation });
    expect(current.glError).toBe(0);
    if (cycle === 2) expect(current.resources).toEqual(tiers.get(key));
    tiers.set(key, current.resources); records.push({ cycle, quality, key, ...current });
  }
  expect(rosters.get('high')!.digest).toBe(baseline.digest);
  expect(new Set([...rosters.values()].map(value => value.digest)).size).toBe(3);
  expect(rosters.get('base')!.rosterActors).toBeLessThan(rosters.get('medium')!.rosterActors);
  expect(rosters.get('medium')!.rosterActors).toBeLessThan(rosters.get('high')!.rosterActors);
  // A change during a timed attempt waits for it: the attempt keeps the roster
  // it started with, and the change is taken on the way back to a free ride,
  // or by the next timed start (which restarts the living world anyway).
  const pending = await page.evaluate(() => {
    const g = window.game, read = () => {
      const { densityLayer, densityPending, digest, rosterActors } = g.populationState();
      return { densityLayer, densityPending, digest, rosterActors, state: g.snapshot().app.state };
    };
    const rows: Record<string, ReturnType<typeof read>> = {};
    // The title's Time trial button, as a player reaches it from a free ride.
    g.setAppState('title'); g.startTimeTrial(); g.advance(0); rows.started = read();
    g.setAppState('paused'); g.setOptions({ quality: 'low' }); g.advance(0); rows.changed = read();
    g.setAppState('challenge'); g.advance(2); rows.resumed = read();
    g.setAppState('paused'); g.setAppState('freeRide'); g.advance(0); rows.freeRide = read();
    g.setAppState('title'); g.startTimeTrial(); g.advance(0); g.setAppState('paused'); g.setOptions({ quality: 'high' }); g.advance(0);
    rows.changedAgain = read();
    // The pause card's Retry: a new attempt, the living world restarted for it.
    g.startTimeTrial(); g.advance(0); rows.restarted = read();
    g.setAppState('paused'); g.setAppState('freeRide'); g.advance(0); rows.done = read();
    return rows;
  });
  records.push({ pending });
  expect(pending.started).toMatchObject({ state: 'challenge', densityLayer: 'high', densityPending: false });
  expect(pending.changed).toMatchObject({ state: 'paused', densityLayer: 'high', densityPending: true,
    digest: rosters.get('high')!.digest });
  expect(pending.resumed).toMatchObject({ state: 'challenge', densityLayer: 'high', densityPending: true });
  expect(pending.freeRide).toMatchObject({ state: 'freeRide', densityLayer: 'base', densityPending: false,
    digest: rosters.get('base')!.digest });
  expect(pending.changedAgain).toMatchObject({ state: 'paused', densityLayer: 'base', densityPending: true });
  expect(pending.restarted).toMatchObject({ state: 'challenge', densityLayer: 'high', densityPending: false,
    digest: rosters.get('high')!.digest });
  expect(pending.done).toMatchObject({ state: 'freeRide', densityLayer: 'high', densityPending: false });
  // Low's roster is the one a Low boot installs: the living-r1 base itself.
  await bootAtTier(page, 'level=generated&seed=euc', 'low', { freezeAtStart: true, options: { showFps: false } });
  const lowBoot = await page.evaluate(() => ({ population: window.game.populationState(),
    recordWorldId: window.game.levelPlan.recordWorldId }));
  expect(lowBoot.recordWorldId).toBe('generated-r6-euc~living-r1');
  expect(lowBoot.population.densityLayer).toBe('base');
  expect(lowBoot.population.digest).toBe(rosters.get('base')!.digest);
  expect(lowBoot.population.rosterActors).toBe(rosters.get('base')!.rosterActors);
  records.push({ lowBoot });
  expect(errors).toEqual([]);
  writeFileSync(join(out, 'lifecycle.json'), JSON.stringify({ records, errors }, null, 2));
});
