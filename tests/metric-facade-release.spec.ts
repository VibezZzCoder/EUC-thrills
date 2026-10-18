/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

/**
 * 2026-10-17 audit §5 (perf item "memory"), in a real browser: the installed
 * metric-facade view releases `MetricFacadePlan.surfaces` once it has written
 * them into its own vertex buffers. Node proves the emission, prices, reports,
 * the Ultra rebuild and the retention (`metricFacadeRelease.test.ts` and the
 * memory harness); only a browser runs the real `GameRenderer.levelBuildSteps`
 * wiring, the Ultra toggle (the one post-install path that re-prices) and a
 * native world swap. A reader of the released records would throw
 * "released after emission" and show up here as a page error.
 *
 * No frame cadence, FPS or frame interval is read (AGENTS.md invariant 11).
 * Written by the memory builder (2026-10-18) for the coordinator; not run by it.
 */
interface ReleaseFacts {
  levelId: string;
  effectiveTier: string;
  preparedPlan: boolean;
  surfacesEmitted: boolean | null;
  preparedSurfaces: number | null;
  viewSurfaces: number | null;
  sameSlimPlan: boolean | null;
  apertures: number | null;
  replacements: number | null;
  report: { drawCalls: number; colourTriangles: number; geometryBytes: number; shadowDrawCalls: number; shadowTriangles: number } | null;
  facadeMeshes: number;
}
function releaseFacts(page: Page): Promise<ReleaseFacts> {
  return page.evaluate(() => {
    type Plan = { surfaces: readonly unknown[]; surfacesEmitted?: true; apertures: readonly unknown[]; replacements: readonly unknown[] };
    const renderer = window.game.renderer as unknown as {
      preparedEnvironmentSupplements: { metric: { descriptors: Plan | null } } | null;
      metricFacade: { descriptors: Plan; group: { children: readonly unknown[] };
        report(): { drawCalls: number; colourTriangles: number; geometryBytes: number; shadowDrawCalls: number; shadowTriangles: number } } | null;
      effectiveTier(): string;
    };
    const prepared = renderer.preparedEnvironmentSupplements?.metric.descriptors ?? null;
    const view = renderer.metricFacade;
    const report = view?.report() ?? null;
    return {
      levelId: String((window.game as unknown as { levelId: string }).levelId),
      effectiveTier: renderer.effectiveTier(),
      preparedPlan: prepared !== null,
      surfacesEmitted: prepared === null ? null : prepared.surfacesEmitted === true,
      preparedSurfaces: prepared?.surfaces.length ?? null,
      viewSurfaces: view ? view.descriptors.surfaces.length : null,
      sameSlimPlan: view ? view.descriptors === prepared : null,
      apertures: prepared?.apertures.length ?? null,
      replacements: prepared?.replacements.length ?? null,
      report: report && { drawCalls: report.drawCalls, colourTriangles: report.colourTriangles, geometryBytes: report.geometryBytes,
        shadowDrawCalls: report.shadowDrawCalls, shadowTriangles: report.shadowTriangles },
      facadeMeshes: view?.group.children.length ?? 0,
    };
  });
}
function expectReleased(facts: ReleaseFacts, where: string): void {
  expect(facts.preparedPlan, `${where}: the city carries a metric facade`).toBe(true);
  expect(facts.surfacesEmitted, `${where}: surfacesEmitted`).toBe(true);
  expect(facts.preparedSurfaces, `${where}: prepared surfaces`).toBe(0);
  expect(facts.viewSurfaces, `${where}: view surfaces`).toBe(0);
  expect(facts.sameSlimPlan, `${where}: one slim plan for both holders`).toBe(true);
  expect(facts.apertures ?? 0, `${where}: apertures kept`).toBeGreaterThan(0);
  expect(facts.report?.drawCalls ?? 0, `${where}: facade draws`).toBeGreaterThan(0);
  expect(facts.facadeMeshes, `${where}: facade meshes`).toBe(facts.report?.drawCalls);
}
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
  });
}

test('the city keeps its facade released through Ultra on, Ultra off and a world swap', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await bootAtTier(page, 'level=generated&seed=euc', 'high', { options: { showFps: false } });
  await page.evaluate(() => window.game.loop.setRunning(false));
  const boot = await releaseFacts(page);
  expectReleased(boot, 'boot at High');
  expect(boot.effectiveTier).toBe('ordinary');

  // Ultra entry and exit rebuild the terrain from the same prepared owners
  // (props read only `replacements`) and re-price from the cached price.
  await page.evaluate(() => window.game.setOptions({ quality: 'ultra' }));
  await twoFrames(page);
  const ultra = await releaseFacts(page);
  expect(ultra.effectiveTier, 'Ultra activated (or the page reports why not)').toBe('ultra');
  expectReleased(ultra, 'at Ultra');
  expect(ultra.report).toEqual(boot.report);
  expect(ultra.replacements).toBe(boot.replacements);
  await page.evaluate(() => window.game.setOptions({ quality: 'high' }));
  await twoFrames(page);
  const back = await releaseFacts(page);
  expect(back.effectiveTier).toBe('ordinary');
  expectReleased(back, 'back at High');
  expect(back.report).toEqual(boot.report);

  // A native world swap through the production queue (`pickVenue`, behind the
  // cover): every install prepares afresh, so the new owner is released again,
  // and a tier round trip there re-prices from it too.
  await page.evaluate(() => { window.game.setAppState('title'); window.game.loop.setRunning(false); });
  await page.evaluate(() => (window.game as unknown as { pickVenue(venue: string): void }).pickVenue('slice'));
  await page.waitForFunction(() => (window.game as unknown as { levelId: string }).levelId === 'slice'
    && !(window.game as unknown as { loadingScreen: { busy: boolean } }).loadingScreen.busy, undefined, { timeout: 120_000 });
  await page.evaluate(() => window.game.loop.setRunning(false));
  const slice = await releaseFacts(page);
  expectReleased(slice, 'the slice after the swap');
  await page.evaluate(() => window.game.setOptions({ quality: 'ultra' }));
  await twoFrames(page);
  const sliceUltra = await releaseFacts(page);
  expect(sliceUltra.effectiveTier).toBe('ultra');
  expectReleased(sliceUltra, 'the slice at Ultra');
  expect(sliceUltra.report).toEqual(slice.report);
  await page.evaluate(() => window.game.setOptions({ quality: 'high' }));
  await twoFrames(page);
  expectReleased(await releaseFacts(page), 'the slice back at High');
  expect(errors).toEqual([]);
});
