/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

const directory = process.env.ENVIRONMENT_DISTRICT_SHOTS ?? 'test-results/environment-overhaul/district-r1';

for (const quality of ['high', 'ultra'] as const) test(`connected district street views ${quality}`, async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(directory, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true });
  const state = await page.evaluate(quality => {
    const game = window.game, report = game.levelPlan.districtAdjacency;
    if (!report) throw new Error('Generated course did not install district finishing');
    return { world: 'generated&seed=euc', quality, id: game.levelPlan.id, report, presentation: game.renderer.presentation(),
      resources: game.snapshot().resources,
      groups: report.groups.map(group => ({ ...group,
        props: group.propIndices.map(index => game.levelPlan.props![index]) })) };
  }, quality);
  expect(state.report.frontages.length).toBeGreaterThan(20);
  expect(state.report.links.length).toBeGreaterThan(0);
  expect(state.groups.length).toBeGreaterThan(0);
  const frames: unknown[] = [];
  // A chase-camera arrival shows the complete route-to-building relationship.
  // Diagnostic views show the actual shared group without removing its neighbors.
  const arrivals = state.groups.map(group => ({ label: String(group.district), group: group.id,
    frontage: state.report.frontages.find(front => front.id === group.frontageId)! }));
  const residential = state.report.frontages.find(front => front.role === 'frontage-lawn' && !front.retainedOpening);
  expect(residential, 'an eligible house approach must be shown separately from the civic rest group').toBeTruthy();
  arrivals.push({ label: 'residential-entry', group: residential!.id, frontage: residential! });
  for (const { label, group, frontage } of arrivals) {
    const arrival = await page.evaluate(frontage => {
      const game = window.game;
      game.clearActions();
      let requested: { x: number; z: number } | undefined;
      const refused: { x: number; z: number }[] = [];
      // Keep every world body and its placement guard. Prefer the same arrival,
      // then a bounded nearby position on the actual street or connected walk.
      for (const shift of [2, -0.75, 0, 4]) {
        for (const lateral of [0, 3, -3, 6, -6]) {
          const distance = frontage.reach + shift;
          const x = frontage.position.x + Math.sin(frontage.yaw) * distance + Math.cos(frontage.yaw) * lateral;
          const z = frontage.position.z + Math.cos(frontage.yaw) * distance - Math.sin(frontage.yaw) * lateral;
          const ground = game.sampleGround(x, z);
          if (ground.offCourse || !['pavement', 'roughPavement', 'brick'].includes(ground.surface)) continue;
          try { game.placeRider({ x, y: ground.height, z }, frontage.yaw + Math.PI); requested = { x, z }; break; }
          catch (error) {
            if (!(error instanceof Error) || !error.message.includes('occupied by the living world')) throw error;
            refused.push({ x, z });
          }
        }
        if (requested) break;
      }
      if (!requested) throw new Error('No safe nearby paved district arrival');
      game.advance(0);
      return { requested, refused, pose: game.snapshot().euc,
        ground: game.sampleGround(requested.x, requested.z), camera: game.renderer.camera.position.toArray() };
    }, frontage);
    expect(Math.hypot(arrival.pose.position.x - arrival.requested.x, arrival.pose.position.z - arrival.requested.z)).toBeLessThan(0.01);
    await page.screenshot({ path: join(directory, `${label}-${quality}-arrival.png`) });
    frames.push({ label: `${label}-arrival`, group, frontage, ...arrival });
  }
  await page.evaluate(() => window.game.loop.dispose());
  for (const group of state.groups) {
    const requested = await page.evaluate(group => {
      const renderer = window.game.renderer, camera = renderer.camera;
      const bench = group.props.find(prop => prop.kind === 'bench')!;
      const yaw = bench.rotationY, dx = Math.sin(yaw), dz = Math.cos(yaw);
      camera.position.set(bench.position.x + dx * 12 + dz * 7, bench.position.y + 5,
        bench.position.z + dz * 12 - dx * 7);
      camera.lookAt(bench.position.x, bench.position.y + 1.5, bench.position.z);
      camera.updateMatrixWorld(); renderer.render();
      return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() };
    }, group);
    await page.screenshot({ path: join(directory, `${group.district}-${quality}-group.png`) });
    const captured = await page.evaluate(() => ({ position: window.game.renderer.camera.position.toArray(),
      quaternion: window.game.renderer.camera.quaternion.toArray() }));
    expect(captured).toEqual(requested); frames.push({ label: 'group', group: group.id, requested, captured });
  }
  expect(errors).toEqual([]);
  writeFileSync(join(directory, `district-${quality}.json`), JSON.stringify({ ...state, frames, errors,
    scope: 'Two actual district groups, their connected approaches and one eligible residential entry; generated coverage lives in the separate six-seed census' }, null, 2));
});
