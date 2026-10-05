/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

const shots = process.env.STREET_LIFE_SHOTS ?? 'test-results/street-life/revision-8';

test('commercial storefronts draw at ordinary tiers, share panes and survive world rebuilds', async ({ page }) => {
  // 2026-10-04: ten menu world swaps now each prepare a living world behind
  // the loading cover (~5–6 s apiece on a quiet machine); the default 120 s
  // budget no longer covers this fixture (5.9 min on a loaded shared machine).
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await bootAtTier(page, '', 'high');
  mkdirSync(shots, { recursive: true });
  const reports = [];
  for (let shop = 0; shop < 3; shop += 1) {
    const report = await page.evaluate(async (index) => {
      const modulePath = '/src/render/streetLife.ts';
      const { streetFronts } = await import(modulePath);
      const game = window.game;
      game.loop.setRunning(false);
      game.setAppState('freeRide');
      const front = streetFronts(game.levelPlan)[index];
      const x = front.position.x + Math.sin(front.yaw) * 9;
      const z = front.position.z + Math.cos(front.yaw) * 9;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, front.yaw + Math.PI);
      game.advance(1);
      return { life: game.renderer.presentation()!.streetLife, render: game.snapshot().render,
        predicted: game.renderer.presentation()!.cost.frame.solo };
    }, shop);
    reports.push(report);
    expect(report.life).toMatchObject({ storefronts: 3, people: 6, drawCalls: 9 });
    expect(report.render.drawCalls).toBeLessThanOrEqual(report.predicted.drawCalls);
    expect(report.render.triangles).toBeLessThanOrEqual(report.predicted.triangles);
    await page.screenshot({ path: join(shots, `high-shop-${shop}.png`) });
    await page.evaluate(async (index) => {
      const modulePath = '/src/render/streetLife.ts';
      const { streetFronts } = await import(modulePath);
      const game = window.game, front = streetFronts(game.levelPlan)[index];
      const x = front.position.x + Math.sin(front.yaw) * 9 + Math.cos(front.yaw) * 8;
      const z = front.position.z + Math.cos(front.yaw) * 9 - Math.sin(front.yaw) * 8;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
      game.advance(0);
    }, shop);
    await page.screenshot({ path: join(shots, `oblique-shop-${shop}.png`) });
    await page.evaluate(async (index) => {
      const modulePath = '/src/render/streetLife.ts';
      const { streetFronts } = await import(modulePath);
      const game = window.game, front = streetFronts(game.levelPlan)[index];
      const x = front.position.x + Math.sin(front.yaw) * 9;
      const z = front.position.z + Math.cos(front.yaw) * 9;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, front.yaw + Math.PI);
      game.advance(0);
    }, shop);
    await page.evaluate(async (index) => {
      const modulePath = '/src/render/streetLife.ts';
      const { streetFronts } = await import(modulePath);
      const game = window.game, front = streetFronts(game.levelPlan)[index];
      const x = front.position.x + Math.sin(front.yaw) * 5 + Math.cos(front.yaw) * 3;
      const z = front.position.z + Math.cos(front.yaw) * 5 - Math.sin(front.yaw) * 3;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
      game.advance(0);
    }, shop);
    await page.screenshot({ path: join(shots, `close-shop-${shop}.png`) });
    await page.evaluate(async (index) => {
      const modulePath = '/src/render/streetLife.ts';
      const { streetFronts } = await import(modulePath);
      const game = window.game, front = streetFronts(game.levelPlan)[index];
      const x = front.position.x + Math.sin(front.yaw) * 9;
      const z = front.position.z + Math.cos(front.yaw) * 9;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, front.yaw + Math.PI);
      game.advance(0);
      game.options.set({ quality: 'ultra' });
      game.advance(0);
    }, shop);
    expect(await page.evaluate(() => window.game.renderer.presentation()!.tier.effective)).toBe('ultra');
    expect(await page.evaluate(() => window.game.renderer.presentation()!.supplementMaterialOwners)).toBeGreaterThan(0);
    await page.screenshot({ path: join(shots, `ultra-shop-${shop}.png`) });
    await page.evaluate(() => { window.game.options.set({ quality: 'high' }); window.game.advance(0); });
    expect(await page.evaluate(() => window.game.renderer.presentation()!.supplementMaterialOwners)).toBe(0);
    if (shop === 0) {
      // Diagnostic only: hiding the interior group leaves the facade colour
      // openings in place. This is not an old-scene comparison.
      await page.evaluate(() => {
        window.game.renderer.scene.getObjectByName('street-life-pilot')!.visible = false;
        window.game.advance(0);
      });
      await page.screenshot({ path: join(shots, 'interiors-hidden-openings-remain.png') });
      await page.evaluate(() => {
        window.game.renderer.scene.getObjectByName('street-life-pilot')!.visible = true;
        window.game.advance(0);
      });
    }
  }
  await page.evaluate(async () => {
    const modulePath = '/src/render/streetLife.ts';
    const { streetFronts } = await import(modulePath);
    const game = window.game;
    const front = streetFronts(game.levelPlan)[0];
    const x = front.position.x + Math.sin(front.yaw) * 10 + Math.cos(front.yaw) * 9;
    const z = front.position.z + Math.cos(front.yaw) * 10 - Math.sin(front.yaw) * 9;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z },
      Math.atan2(front.position.x - x, front.position.z - z));
    game.advance(1);
  });
  await page.screenshot({ path: join(shots, 'corner-oblique.png') });
  // Restore the repair frontage used by the shared-view checks.
  await page.evaluate(async () => {
    const modulePath = '/src/render/streetLife.ts';
    const { streetFronts } = await import(modulePath);
    const game = window.game;
    const front = streetFronts(game.levelPlan)[2];
    const x = front.position.x + Math.sin(front.yaw) * 9;
    const z = front.position.z + Math.cos(front.yaw) * 9;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z }, front.yaw + Math.PI);
    game.advance(0);
  });
  const parity = await page.evaluate(() => {
    const game = window.game;
    const group = game.renderer.scene.getObjectByName('street-life-pilot')!;
    const before = game.snapshot().euc;
    const answers = [];
    for (const tier of ['low', 'medium', 'high'] as const) {
      game.options.set({ quality: tier });
      game.advance(0);
      answers.push({ tier, sameGroup: group === game.renderer.scene.getObjectByName('street-life-pilot'),
        life: game.renderer.presentation()!.streetLife, pose: game.snapshot().euc });
    }
    return { before, answers };
  });
  for (const answer of parity.answers) {
    expect(answer.sameGroup).toBe(true);
    expect(answer.pose).toEqual(parity.before);
    expect(answer.life).toMatchObject({ storefronts: 3, people: 6, drawCalls: 9 });
  }
  await page.screenshot({ path: join(shots, 'high-repair.png') });
  for (let phase = 0; phase < 7; phase++) {
    await page.evaluate(async (index) => {
      const modulePath = '/src/render/streetLife.ts';
      const { streetFronts } = await import(modulePath);
      const game = window.game, front = streetFronts(game.levelPlan)[2];
      const lateral = -6 + index * 2;
      const x = front.position.x + Math.sin(front.yaw) * 7 + Math.cos(front.yaw) * lateral;
      const z = front.position.z + Math.cos(front.yaw) * 7 - Math.sin(front.yaw) * lateral;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
      game.advance(90);
    }, phase);
    await page.screenshot({ path: join(shots, `motion-sequence-${phase}.png`) });
  }
  await page.evaluate(async () => {
    const modulePath = '/src/render/streetLife.ts';
    const { streetFronts } = await import(modulePath);
    const game = window.game, front = streetFronts(game.levelPlan)[2];
    const x = front.position.x + Math.sin(front.yaw) * 9 + Math.cos(front.yaw) * 3;
    const z = front.position.z + Math.cos(front.yaw) * 9 - Math.sin(front.yaw) * 3;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
    game.advance(0);
  });

  // Continuous diagnostic camera sweep: real rendered parallax and shared
  // indoor gestures. The QA bridge positions the rider; this is not a ridden
  // gameplay/performance recording.
  const clip = await page.evaluate(async () => {
    const modulePath = '/src/render/streetLife.ts';
    const { streetFronts } = await import(modulePath);
    const game = window.game, front = streetFronts(game.levelPlan)[2];
    const canvas = document.querySelector('canvas')!;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm', videoBitsPerSecond: 2_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    const result = new Promise<string>(resolve => {
      recorder.onstop = () => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
      };
    });
    recorder.start();
    await new Promise<void>(resolve => {
      let began = 0, previousStep = 0;
      const draw = (time: number) => {
        if (!began) began = time;
        const elapsed = Math.min((time - began) / 1000, 6);
        const lateral = -6 + elapsed * 2;
        const x = front.position.x + Math.sin(front.yaw) * 7 + Math.cos(front.yaw) * lateral;
        const z = front.position.z + Math.cos(front.yaw) * 7 - Math.sin(front.yaw) * lateral;
        game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
        const step = Math.floor(elapsed * 120);
        game.advance(step - previousStep); previousStep = step;
        if (elapsed < 6) requestAnimationFrame(draw); else resolve();
      };
      requestAnimationFrame(draw);
    });
    recorder.stop();
    const encoded = await result;
    for (const track of stream.getTracks()) track.stop();
    return encoded;
  });
  writeFileSync(join(shots, 'repair-parallax.webm'), Buffer.from(clip, 'base64'));

  const shared = await page.evaluate(() => {
    const game = window.game;
    const group = game.renderer.scene.getObjectByName('street-life-pilot');
    const before = game.renderer.presentation()!.streetLife.clockSeconds;
    game.spawnSecondRider();
    const pose = game.snapshot().euc;
    game.placeRider(pose.position, pose.headingY, 1);
    game.advance(0);
    return { sameGroup: group === game.renderer.scene.getObjectByName('street-life-pilot'),
      groups: game.renderer.scene.children.filter((child) => child.name === 'street-life-pilot').length,
      before, life: game.renderer.presentation()!.streetLife, views: game.renderer.viewCount };
  });
  expect(shared.sameGroup).toBe(true);
  expect(shared.groups).toBe(1);
  expect(shared.views).toBe(2);
  expect(shared.life.clockSeconds).toBe(shared.before);
  expect(shared.life.people).toBe(6);
  await page.screenshot({ path: join(shots, 'split-repair.png') });
  const quad = await page.evaluate(() => {
    const game = window.game;
    const group = game.renderer.scene.getObjectByName('street-life-pilot');
    const pose = game.snapshot().euc;
    for (let index = 2; index < 4; index += 1) {
      game.spawnRider();
      game.placeRider(pose.position, pose.headingY, index);
    }
    game.advance(0);
    return { sameGroup: group === game.renderer.scene.getObjectByName('street-life-pilot'),
      life: game.renderer.presentation()!.streetLife, views: game.renderer.viewCount,
      render: game.snapshot().render, predicted: game.renderer.presentation()!.cost.frame.quad };
  });
  expect(quad.sameGroup).toBe(true);
  expect(quad.views).toBe(4);
  expect(quad.life.people).toBe(6);
  expect(quad.render.drawCalls).toBeLessThanOrEqual(quad.predicted.drawCalls);
  expect(quad.render.triangles).toBeLessThanOrEqual(quad.predicted.triangles);
  await page.screenshot({ path: join(shots, 'quad-repair.png') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.game.advance(120));
  expect(await page.evaluate(() => window.game.renderer.presentation()!.streetLife.clockSeconds)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => window.game.advance(0));
  expect(await page.evaluate(() => window.game.renderer.presentation()!.streetLife.clockSeconds)).toBeGreaterThan(0);
  await page.evaluate(() => { window.game.despawnRider(); window.game.despawnRider(); });
  await page.evaluate(() => { window.game.despawnSecondRider(); window.game.setAppState('title'); });
  // 2026-10-04: a living world's plan id is a composition hash, so worlds are
  // identified by recordWorldId; and a menu world swap now builds behind the
  // loading cover, so each check waits for the swap to finish (cover lifted)
  // instead of reading the old world in the same task as the click.
  const installed = async (recordWorldId: string) => {
    await expect.poll(() => page.evaluate(() => window.game.levelPlan.recordWorldId), { timeout: 90_000 }).toBe(recordWorldId);
    await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
  };
  const counts = [];
  for (let rebuild = 0; rebuild < 3; rebuild += 1) {
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await page.locator('.euc-menu--routes [data-venue="slice"]').click();
    await installed('m7-slice~living-r1');
    expect(await page.evaluate(() => window.game.renderer.presentation()!.streetLife.storefronts)).toBe(0);
    await page.locator('#euc-seed').fill('euc');
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
    await installed('generated-r6-euc~living-r1');
    await page.evaluate(() => { window.game.advance(0); });
    counts.push(await page.evaluate(() => ({ resources: window.game.snapshot().resources,
      life: window.game.renderer.presentation()!.streetLife,
      groups: window.game.renderer.scene.children.filter((child) => child.name === 'street-life-pilot').length })));
    await page.evaluate(() => { window.game.loop.setRunning(false); window.game.setAppState('title'); });
  }
  for (const count of counts) {
    expect(count.groups).toBe(1);
    expect(count.life.people).toBe(6);
    expect(count.resources).toEqual(counts[0].resources);
  }
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('#euc-seed').fill('corner');
  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  await installed('generated-r6-corner~living-r1');
  await page.evaluate(async () => {
    const modulePath = '/src/render/streetLife.ts';
    const { streetFronts } = await import(modulePath);
    const game = window.game, front = streetFronts(game.levelPlan)[0];
    game.loop.setRunning(false);
    game.setAppState('freeRide');
    const x = front.position.x + Math.sin(front.yaw) * 9 + Math.cos(front.yaw) * 3;
    const z = front.position.z + Math.cos(front.yaw) * 9 - Math.sin(front.yaw) * 3;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
    game.advance(0);
  });
  await page.screenshot({ path: join(shots, 'generated-corner-course.png') });
  const approaches = [];
  for (const seed of ['city', 'night', 'rider']) {
    await page.evaluate(() => { window.game.setAppState('title'); });
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await page.locator('#euc-seed').fill(seed);
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
    await installed(`generated-r6-${seed}~living-r1`);
    await page.evaluate(async () => {
      const path = '/src/render/streetLife.ts', { streetFronts } = await import(path);
      const game = window.game, front = streetFronts(game.levelPlan)[0];
      game.loop.setRunning(false); game.setAppState('freeRide');
      const x = front.position.x + Math.sin(front.yaw) * 10 + Math.cos(front.yaw) * 5;
      const z = front.position.z + Math.cos(front.yaw) * 10 - Math.sin(front.yaw) * 5;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, Math.atan2(front.position.x - x, front.position.z - z));
      game.advance(0);
    });
    await page.screenshot({ path: join(shots, `generated-${seed}-approach.png`) });
    approaches.push(await page.evaluate(() => ({ level: window.game.levelPlan.id,
      paving: window.game.levelPlan.groundSurfacePatches?.map(p => ({ id: p.id, triangles: p.triangles.length })),
      life: window.game.renderer.presentation()!.streetLife })));
  }
  const ridden = [];
  for (const direction of [-1, 1]) {
    await page.evaluate(async (sign) => {
      const path = '/src/render/streetLife.ts', { streetFronts } = await import(path);
      const game = window.game, front = streetFronts(game.levelPlan)[0];
      const x = front.street.x - Math.cos(front.yaw) * 8 * sign;
      const z = front.street.z + Math.sin(front.yaw) * 8 * sign;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, front.yaw + sign * Math.PI / 2);
      game.setActions({ throttle: 0.65, steer: 0 });
      game.advance(0);
    }, direction);
    for (let frame = 0; frame < 4; frame++) {
      await page.evaluate(() => { window.game.advance(120); });
      ridden.push(await page.evaluate(() => window.game.snapshot().euc));
      await page.screenshot({ path: join(shots, `road-${direction === 1 ? 'forward' : 'return'}-${frame}.png`) });
    }
    await page.evaluate(() => { window.game.setActions({ throttle: 0, steer: 0 }); });
  }
  writeFileSync(join(shots, 'evidence.json'), JSON.stringify({ reports, parity, shared, quad, counts,
    approaches, ridden, errors }, null, 2));
  expect(errors).toEqual([]);
});
