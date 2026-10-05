/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { DEFAULT_OPTIONS, OPTIONS_KEY } from '../src/app/options.ts';
import { STORAGE_PREFIX } from '../src/platform/storage.ts';
import { generateLevel } from '../src/level/generateRoute.ts';
import { environmentSites } from '../src/level/environmentSites.ts';
import { collectErrors } from './harness.ts';

const shots = process.env.ENVIRONMENT_RETURN_SHOTS
  ?? 'test-results/environment-upgrade/industrial-return-r1';
const baselineRoot = 'test-results/environment-upgrade/baseline/dist';
const referencePath = 'test-results/environment-upgrade/industrial-r6/views/report.json';
const groupName = 'environment-industrial-exemplar';
const originalFields = ['heightfield', 'surround', 'segments', 'props', 'solids', 'hazards', 'targets',
  'checkpoints', 'spawn', 'streetLoops', 'look', 'markings'] as const;
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

/** URL-aware version of the harness's frozen start. The baseline receives only
 * plain saved options and public QA calls; no current game/Three module is
 * imported into its scene. Rendering/GL flags remain the project defaults. */
async function bootDiagnostic(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => {
    const error = document.querySelector<HTMLElement>('#boot-error');
    if (error && !error.hidden && error.getBoundingClientRect().height > 0) {
      throw new Error(`Diagnostic boot failed: ${error.textContent}`);
    }
    return typeof window.game === 'object' && window.game !== null;
  }, undefined, { timeout: 90_000 });
  await expect(page.locator('#boot-error')).toBeHidden();
  await page.waitForFunction(() => window.game.snapshot().loop.frames > 0);
  await expect(page.locator('#boot')).toBeHidden();
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.setAppState('freeRide');
    window.game.loop.setRunning(false);
    window.game.clearActions();
    window.game.setActions({ throttle: 0, steer: 0 });
  });
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
}

type Placement = { position: { x: number; y: number; z: number }; headingY: number };
type Anchor = { position: { x: number; y: number; z: number }; yaw: number; faceWidth: number; height: number };

/** 2026-10-04: the living-world preparation appends props and solids after
 * the builder's own (the builder's arrays stay an exact prefix) and names the
 * plan with a composition hash. `prefixCounts` (the baseline's own counts)
 * digests exactly that original prefix of the current plan. */
async function inspect(page: Page, phase: string, placement: Placement, anchor: Anchor,
  prefixCounts: Record<'props' | 'solids', number> | null = null) {
  return page.evaluate(async ({ phase, placement, anchor, originalFields, groupName, prefixCounts }) => {
    const game = window.game, plan = game.levelPlan, camera = game.renderer.camera;
    const digest = async (value: unknown) => {
      const text = JSON.stringify(value) ?? '';
      const bytes = new TextEncoder().encode(text);
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return { sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''),
        jsonBytes: bytes.byteLength };
    };
    const originals = Object.fromEntries(await Promise.all(originalFields.map(async key => [key, await digest(plan[key])])));
    const counts = { props: plan.props?.length ?? 0, solids: plan.solids?.length ?? 0 };
    const originalPrefixes = Object.fromEntries(await Promise.all((['props', 'solids'] as const).map(async key =>
      [key, await digest((plan[key] ?? []).slice(0, (prefixCounts ?? counts)[key]))])));
    const markingDigests = await Promise.all((plan.markings ?? []).map(async marking => (await digest(marking)).sha256));
    camera.updateMatrixWorld();
    const world = Array.from(camera.matrixWorld.elements), view = Array.from(camera.matrixWorldInverse.elements);
    const projection = Array.from(camera.projectionMatrix.elements);
    const project = (x: number, y: number, z: number) => {
      const ex = view[0] * x + view[4] * y + view[8] * z + view[12];
      const ey = view[1] * x + view[5] * y + view[9] * z + view[13];
      const ez = view[2] * x + view[6] * y + view[10] * z + view[14];
      const cx = projection[0] * ex + projection[4] * ey + projection[8] * ez + projection[12];
      const cy = projection[1] * ex + projection[5] * ey + projection[9] * ez + projection[13];
      const cw = projection[3] * ex + projection[7] * ey + projection[11] * ez + projection[15];
      return { x: cx / cw, y: cy / cw, inFront: cw > 0 };
    };
    const portalPoints = [-1, 1].flatMap(side => [0, anchor.height].map(height => {
      const x = anchor.position.x + Math.cos(anchor.yaw) * side * anchor.faceWidth / 2;
      const y = anchor.position.y + height;
      const z = anchor.position.z - Math.sin(anchor.yaw) * side * anchor.faceWidth / 2;
      return { world: { x, y, z }, projected: project(x, y, z) };
    }));
    const canvas = game.renderer.renderer.domElement, bounds = canvas.getBoundingClientRect();
    const gl = game.renderer.renderer.getContext(), glErrors: number[] = [];
    for (let index = 0; index < 16; index++) { const code = gl.getError(); if (code === gl.NO_ERROR) break; glErrors.push(code); }
    const snap = game.snapshot(), group = game.renderer.scene.getObjectByName(groupName);
    let groupCount = 0;
    game.renderer.scene.traverse(object => { if (object.name === groupName) groupCount++; });
    const presentation = game.renderer.presentation();
    return { phase, url: location.href, originalFields: originals, originalPrefixes, counts, markingDigests, world: snap.world, levelPlanId: plan.id,
      recordWorldId: (plan as { recordWorldId?: string }).recordWorldId ?? plan.id,
      options: snap.options, quality: snap.quality, placement, anchor, pose: snap.euc, camera: snap.camera,
      tick: snap.tick, simTimeSeconds: snap.simTimeSeconds, loopRunning: snap.loop.running,
      ground: game.sampleGround(placement.position.x, placement.position.z),
      viewCount: game.renderer.viewCount, viewArrays: { world, view, projection },
      portalPoints, portalBounds: { left: Math.min(...portalPoints.map(point => point.projected.x)),
        right: Math.max(...portalPoints.map(point => point.projected.x)),
        bottom: Math.min(...portalPoints.map(point => point.projected.y)), top: Math.max(...portalPoints.map(point => point.projected.y)) },
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio,
        rendererPixelRatio: game.renderer.renderer.getPixelRatio(), canvasWidth: canvas.width, canvasHeight: canvas.height,
        canvasBounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } },
      environment: { groupCount, uuid: group?.uuid ?? null, visible: group?.visible ?? null,
        report: presentation?.environmentDecor ?? null },
      surfacePatches: await digest(plan.groundSurfacePatches), resources: snap.resources, render: snap.render,
      glErrors, ultraGlErrors: presentation?.ultra?.glErrors ?? [],
      documentScripts: Array.from(document.scripts, script => script.src).filter(Boolean) };
  }, { phase, placement, anchor, originalFields, groupName, prefixCounts });
}

type Evidence = Awaited<ReturnType<typeof inspect>>;

/** Diagnostic matching only. These images do not classify the dark return as
 * original/candidate or approve a repair. No original geometry is hidden. */
test.describe('matched original depot return diagnosis', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  for (const quality of ['high', 'ultra'] as const) {
    test(`baseline/current/hidden-environment exact R6 oblique: ${quality}`, async ({ page }) => {
      test.setTimeout(180_000);
      test.skip(!existsSync(join(baselineRoot, 'index.html')) || !existsSync(referencePath),
        'This bounded diagnosis requires the preserved baseline and R6 reference artifacts; no baseline verdict is available without them.');
      const directory = join(shots, quality), errors = collectErrors(page), evidence: Evidence[] = [];
      const servedBaselineAssets: { requestedUrl: string; artifact: string; sha256: string; bytes: number }[] = [];
      let outcome = 'not-started', ultraUnsupported = false;
      mkdirSync(directory, { recursive: true });
      const source = generateLevel('euc').plan, site = environmentSites(source)[0];
      if (!site) throw new Error('Current source has no protected diagnostic anchor');
      const referenceBytes = readFileSync(referencePath), reference = JSON.parse(referenceBytes.toString()) as {
        frames: { label: string; framing: { position: Anchor['position']; yaw: number; faceWidth: number;
          buildingPropIndex: number; rider: { position: Placement['position']; headingY: number }; camera: unknown } }[] };
      const frame = reference.frames.find(frame => frame.label === `${quality}-industrial-oblique`);
      if (!frame) throw new Error('The preserved R6 oblique reference is unavailable');
      const placement: Placement = { position: frame.framing.rider.position, headingY: frame.framing.rider.headingY };
      const anchor: Anchor = { position: frame.framing.position, yaw: frame.framing.yaw,
        faceWidth: frame.framing.faceWidth, height: site.height };
      const nodeReferenceOriginals = Object.fromEntries(originalFields.map(key => {
        const text = JSON.stringify(source[key]) ?? '';
        return [key, { sha256: sha(text), jsonBytes: Buffer.byteLength(text) }];
      }));
      const baselineIndex = readFileSync(join(baselineRoot, 'index.html'));
      const assets = async (route: Route) => {
        const name = new URL(route.request().url()).pathname.slice('/assets/'.length);
        if (!name || name.includes('/') || name.includes('..')) { await route.abort(); return; }
        const artifact = join(baselineRoot, 'assets', name);
        if (!existsSync(artifact)) { await route.abort(); return; }
        const bytes = readFileSync(artifact);
        servedBaselineAssets.push({ requestedUrl: route.request().url(), artifact, sha256: sha(bytes), bytes: bytes.byteLength });
        const mime = { '.js': 'application/javascript', '.css': 'text/css', '.wav': 'audio/wav',
          '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
        await route.fulfill({ body: bytes, contentType: mime[extname(name) as keyof typeof mime] ?? 'application/octet-stream' });
      };
      try {
        expect(anchor.position).toEqual(site.position); expect(anchor.yaw).toBe(site.yaw);
        expect(frame.framing.buildingPropIndex).toBe(source.props!.indexOf(site.building));
        expect(placement.position.x).toBeCloseTo(site.position.x + Math.sin(site.yaw) * 9 + Math.cos(site.yaw) * 8, 10);
        expect(placement.position.z).toBeCloseTo(site.position.z + Math.cos(site.yaw) * 9 - Math.sin(site.yaw) * 8, 10);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.addInitScript(({ key, options }) => {
          localStorage.setItem(key, JSON.stringify(options));
          let current: unknown;
          Object.defineProperty(window, 'game', { configurable: true, enumerable: true,
            get: () => current,
            set(game: { start(...args: unknown[]): unknown; loop: { setRunning(running: boolean): void } }) {
              current = game;
              const start = game.start.bind(game);
              game.start = (...args: unknown[]) => { const result = start(...args); game.loop.setRunning(false); return result; };
            } });
        }, { key: `${STORAGE_PREFIX}${OPTIONS_KEY}`, options: { ...DEFAULT_OPTIONS, quality,
          seenPrompts: ['ride', 'brake', 'hop'], seenRiderChooser: true } });
        const place = () => page.evaluate(placement => {
          const game = window.game;
          const ground = game.sampleGround(placement.position.x, placement.position.z);
          if (Math.abs(ground.height - placement.position.y) > 1e-9) throw new Error('Reference ground height changed');
          game.placeRider(placement.position, placement.headingY); game.advance(0);
        }, placement);
        await page.route('**/assets/**', assets);
        await bootDiagnostic(page, `/${baselineRoot}/index.html?level=generated&seed=euc`);
        await place();
        const baseline = await inspect(page, 'preserved-baseline', placement, anchor); evidence.push(baseline);
        await page.screenshot({ path: join(directory, `baseline-requested-${quality}-effective-${baseline.quality.effective}.png`) });
        await page.unroute('**/assets/**', assets);
        await bootDiagnostic(page, '/?level=generated&seed=euc'); await place();
        const current = await inspect(page, 'current-candidate', placement, anchor, baseline.counts); evidence.push(current);
        await page.screenshot({ path: join(directory, `current-requested-${quality}-effective-${current.quality.effective}.png`) });
        const savedVisibility = await page.evaluate(groupName => {
          const group = window.game.renderer.scene.getObjectByName(groupName);
          if (!group) throw new Error('Current environment group is absent');
          const visible = group.visible; group.visible = false; window.game.advance(0); return visible;
        }, groupName);
        try {
          const hidden = await inspect(page, 'current-environment-group-hidden', placement, anchor, baseline.counts); evidence.push(hidden);
          await page.screenshot({ path: join(directory, `current-group-hidden-requested-${quality}-effective-${hidden.quality.effective}.png`) });
        } finally {
          await page.evaluate(({ groupName, visible }) => {
            const group = window.game.renderer.scene.getObjectByName(groupName);
            if (!group) throw new Error('Current environment owner disappeared during diagnosis');
            group.visible = visible; window.game.advance(0);
          }, { groupName, visible: savedVisibility });
        }
        const hidden = evidence[2];
        for (const item of evidence) {
          // Compare the two browser-produced plans bit for bit. Node and Chromium
          // transcendental arithmetic can differ at the last decimal; Node's
          // source hashes are retained as provenance, not cross-engine goldens.
          // 2026-10-04: the living world appends props/solids after the
          // builder's own (intended), so those two compare as an exact prefix.
          // The builder has since added twelve lane-marking runs at euc (Codex,
          // Oct 1–3; all 44 preserved-baseline runs are kept byte-identical),
          // so every baseline marking must still be present. Every other
          // original field is still compared whole.
          for (const key of originalFields) {
            if (key === 'props' || key === 'solids') {
              expect(item.originalPrefixes[key], `original ${key} prefix`).toEqual(baseline.originalFields[key]);
              expect(item.counts[key]).toBeGreaterThanOrEqual(baseline.counts[key]);
            } else if (key === 'markings') {
              expect(baseline.markingDigests.filter(marking => !item.markingDigests.includes(marking)), 'baseline markings kept').toEqual([]);
              expect(item.markingDigests.length).toBeGreaterThanOrEqual(baseline.markingDigests.length);
            } else expect(item.originalFields[key], `original ${key}`).toEqual(baseline.originalFields[key]);
          }
          // The baseline predates the living world; the current builds key on recordWorldId.
          expect(item.recordWorldId).toBe(item === baseline ? 'generated-r6-euc' : 'generated-r6-euc~living-r1');
          expect(item.world.seed).toBe('euc');
          expect(item.loopRunning).toBe(false); expect(item.pose.position).toEqual(placement.position);
          expect(item.pose.headingY).toBe(placement.headingY); expect(item.pose.speed).toBe(0);
          expect(item.camera.mode).toBe('chase'); expect(item.camera.scriptedOcclusion).toBe(false);
          expect(item.viewCount).toBe(1); expect(item.viewport.devicePixelRatio).toBe(1);
          expect(item.viewport.rendererPixelRatio).toBe(1);
          expect(item.viewport.canvasBounds).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
          expect(item.viewport.canvasWidth).toBe(1280); expect(item.viewport.canvasHeight).toBe(720);
          expect(item.glErrors).toEqual([]); expect(item.ultraGlErrors).toEqual([]);
        }
        expect(baseline.environment.groupCount).toBe(0); expect(baseline.environment.report).toBeNull();
        expect(current.environment.groupCount).toBe(1); expect(current.environment.visible).toBe(true);
        expect(hidden.environment.groupCount).toBe(1); expect(hidden.environment.visible).toBe(false);
        expect(hidden.environment.uuid).toBe(current.environment.uuid);
        for (const item of [current, hidden]) {
          expect(item.pose).toEqual(baseline.pose); expect(item.camera).toEqual(baseline.camera);
          expect(item.camera).toEqual(frame.framing.camera);
          expect(item.viewArrays).toEqual(baseline.viewArrays); expect(item.portalPoints).toEqual(baseline.portalPoints);
          expect(item.portalBounds).toEqual(baseline.portalBounds); expect(item.viewport).toEqual(baseline.viewport);
          expect(item.options).toEqual(baseline.options); expect(item.ground).toEqual(baseline.ground);
          expect(item.tick).toBe(baseline.tick); expect(item.simTimeSeconds).toBe(baseline.simTimeSeconds);
        }
        expect(hidden.surfacePatches).toEqual(current.surfacePatches);
        expect(servedBaselineAssets.some(asset => asset.artifact.endsWith('.js'))).toBe(true);
        expect(baseline.documentScripts.some(url => new URL(url).pathname.startsWith('/assets/'))).toBe(true);
        expect(current.documentScripts.some(url => new URL(url).pathname.startsWith('/src/'))).toBe(true);
        expect(errors).toEqual([]);
        if (quality === 'ultra' && (baseline.quality.effective !== 'ultra' || current.quality.effective !== 'ultra')) {
          outcome = 'Ultra was not effective on both builds; captures labelled with actual tier, no matched Ultra claim';
          ultraUnsupported = true;
        } else {
          expect(baseline.quality.effective).toBe(quality); expect(current.quality.effective).toBe(quality);
          outcome = 'Matching controls passed; dark-return pixel diagnosis pending';
        }
      } catch (error) {
        outcome = `Matching controls failed: ${error instanceof Error ? error.message : String(error)}`;
        await page.screenshot({ path: join(directory, 'failure.png') }).catch(() => undefined);
        throw error;
      } finally {
        await page.unroute('**/assets/**', assets);
        writeFileSync(join(directory, 'report.json'), JSON.stringify({ quality, outcome, evidence, errors,
          reference: { path: referencePath, sha256: sha(referenceBytes), label: frame.label, localNormalMetres: 9, localLateralMetres: 8 },
          baseline: { indexPath: join(baselineRoot, 'index.html'), indexSha256: sha(baselineIndex), servedAssets: servedBaselineAssets,
            assetRouting: 'Absolute /assets requests were fulfilled with byte-identical files read from the preserved baseline artifact; files unchanged. Routing was removed before current boot.' },
          nodeReferenceOriginals, originalHost: site.building,
          originalBody: source.solids?.find(body => body.centre.x === site.building.position.x
            && body.centre.z === site.building.position.z),
          scope: 'Explicit diagnostic QA placement copied from R6 oblique; ordinary production chase camera. Current-only group visibility toggle leaves original geometry and facade opening hook in place. No geometry/terrain/camera edits and no visual repair or verdict.' }, null, 2) + '\n');
      }
      test.skip(ultraUnsupported, outcome);
    });
  }
});
