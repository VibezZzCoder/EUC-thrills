/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { BufferAttribute, Mesh, MeshStandardMaterial, Texture } from 'three';
import type { GroundSurfacePatch, LevelPlan } from '../src/level/plan.ts';
import type { IndustrialBaySite } from '../src/level/environmentSites.ts';
import type { StreetFront } from '../src/level/streetFronts.ts';
import type { GroundSample } from '../src/simulation/world.ts';
import { bootAtTier, collectErrors } from './harness.ts';

const shots = process.env.ENVIRONMENT_DECOR_SHOTS ?? 'test-results/environment-upgrade/activity-r1/decor';
const groupName = 'environment-industrial-exemplar';
type View = 'principal' | 'close' | 'oblique' | 'reverse-oblique' | 'street-approach';

/** Pixel evidence here uses explicit QA placements with the production chase
 * camera. It is not normal-spawn riding, listening or device-performance proof. */
async function place(page: Page, view: View, subject: 'industrial' | 'coffee' = 'industrial') {
  return page.evaluate(async ({ view, subject }) => {
    const sitesPath = '/src/level/environmentSites.ts';
    const frontsPath = '/src/level/streetFronts.ts';
    const { environmentSites } = await import(sitesPath);
    const { streetFronts } = await import(frontsPath);
    const game = window.game;
    game.loop.setRunning(false);
    game.setAppState('freeRide');
    game.loop.setRunning(false);
    game.setActions({ throttle: 0, steer: 0 });
    const site = subject === 'industrial'
      ? (environmentSites(game.levelPlan) as readonly IndustrialBaySite[])[0]
      : (streetFronts(game.levelPlan) as StreetFront[]).find(front => front.shop === 'COFFEE');
    if (!site) throw new Error(`No ${subject} site in ${game.levelPlan.recordWorldId ?? game.levelPlan.id} (${game.levelPlan.id})`);
    const normal = view === 'close' ? 5 : 9;
    const lateral = view === 'oblique' ? 8 : view === 'reverse-oblique' ? -8 : view === 'close' ? 2.5 : 0;
    const x = view === 'street-approach' ? site.street.x
      : site.position.x + Math.sin(site.yaw) * normal + Math.cos(site.yaw) * lateral;
    const z = view === 'street-approach' ? site.street.z
      : site.position.z + Math.cos(site.yaw) * normal - Math.sin(site.yaw) * lateral;
    game.placeRider({ x, y: game.sampleGround(x, z).height, z },
      Math.atan2(site.position.x - x, site.position.z - z));
    game.advance(0);
    const snap = game.snapshot();
    return { subject, view, label: 'QA placement; ordinary chase camera; diagnostic view',
      world: game.levelPlan.id, buildingPropIndex: game.levelPlan.props!.indexOf(site.building),
      position: site.position, street: site.street, yaw: site.yaw, faceWidth: site.faceWidth,
      rider: snap.euc, camera: snap.camera,
      openingProjection: window.qa.projectPoint(site.position.x, site.position.y + 2, site.position.z) };
  }, { view, subject });
}

/** Inspect the installed world and actual owners, rather than trusting only
 * the report. Comparisons to a freshly generated source contain no plan writes. */
async function inspect(page: Page, seed: string, label: string) {
  return page.evaluate(async ({ seed, label, groupName }) => {
    const sitesPath = '/src/level/environmentSites.ts', groundPath = '/src/level/environmentGround.ts';
    const generatorPath = '/src/level/generateRoute.ts', samplerPath = '/src/simulation/planSampler.ts';
    const worldPath = '/src/simulation/world.ts', builderPath = '/src/level/buildPlan.ts';
    const pavingOwnerPath = '/src/render/exactPavingOwnership.ts', livingPath = '/src/app/populationWorld.ts';
    const [{ environmentSites, industrialPersonnelDoorOffset }, { industrialGroundPatches, INDUSTRIAL_APPROACH_RULES }, { generateLevel },
      { PlanTerrainSampler }, { createGroundSample }, { fieldHeightAt }, { exactPavingDrawsPatch }, { preparePopulationWorld }] = await Promise.all([
      import(sitesPath), import(groundPath), import(generatorPath), import(samplerPath), import(worldPath), import(builderPath),
      import(pavingOwnerPath), import(livingPath),
    ]);
    // 2026-10-04: generated worlds are installed through the living-world
    // preparation, which intentionally appends props/solids/ground patches and
    // names the plan with a composition hash. The fresh source is that same
    // preparation of a freshly generated plan (same engine, computed once per
    // page and seed because it costs seconds); identity is pinned through
    // recordWorldId. Entrance-ground semantics are judged against that source
    // with only this site's own industrial patches removed, which is exactly
    // the ground the industrial entrance replaced.
    const cache = ((window as unknown as { decorSources?: Map<string, { generated: LevelPlan; source: LevelPlan }> })
      .decorSources ??= new Map());
    let fresh = cache.get(seed);
    if (!fresh) {
      const generated: LevelPlan = generateLevel(seed).plan;
      fresh = { generated, source: preparePopulationWorld(generated).level as LevelPlan }; cache.set(seed, fresh);
    }
    const game = window.game, plan = game.levelPlan, source: LevelPlan = fresh.source;
    const presentation = game.renderer.presentation();
    if (!presentation) throw new Error('Missing installed presentation');
    const sites = environmentSites(plan) as readonly IndustrialBaySite[];
    const groundSource: LevelPlan = { ...source, groundSurfacePatches: (source.groundSurfacePatches ?? [])
      .filter(patch => !sites.some(site => patch.id.startsWith(`street-${site.id}-`))) };
    const sourceSampler = new PlanTerrainSampler(groundSource);
    const before: GroundSample = createGroundSample(), after: GroundSample = createGroundSample();
    const digest = (value: unknown): string => {
      const text = JSON.stringify(value) ?? '';
      let hash = 2166136261;
      for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const preserved = ['heightfield', 'segments', 'props', 'solids', 'hazards', 'targets',
      'checkpoints', 'spawn', 'streetLoops', 'look'] as const;
    const originals = Object.fromEntries(preserved.map(key => [key, {
      same: JSON.stringify(plan[key]) === JSON.stringify(source[key]),
      sourceDigest: digest(source[key]), installedDigest: digest(plan[key]),
    }]));
    const group = game.renderer.scene.getObjectByName(groupName);
    let groups = 0, pavingMeshes = 0, meshes = 0, triangles = 0, geometryBytes = 0, invalidNumbers = 0;
    let casters = 0, transparent = 0, mapped = 0;
    const materials = new Set<MeshStandardMaterial>(), geometries = new Set<object>(), textures = new Set<Texture>();
    const shape: unknown[] = [];
    game.renderer.scene.traverse(object => {
      if (object.name === groupName) groups++;
      if (object.name === 'street-life-paving') pavingMeshes++;
    });
    group?.traverse(object => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      meshes++;
      casters += Number(mesh.castShadow);
      const geometry = mesh.geometry;
      const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materialList) {
        const standard = material as MeshStandardMaterial;
        materials.add(standard);
        transparent += Number(standard.transparent);
        mapped += Number(standard.map !== null);
        if (standard.map) textures.add(standard.map);
      }
      if (!geometries.has(geometry)) {
        geometries.add(geometry);
        if (geometry.index) geometryBytes += geometry.index.array.byteLength;
        for (const attribute of Object.values(geometry.attributes)) {
          const values = (attribute as BufferAttribute).array;
          geometryBytes += values.byteLength;
          for (const value of values) if (!Number.isFinite(value)) invalidNumbers++;
        }
      }
      triangles += (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
      shape.push(Array.from((geometry.getAttribute('position') as BufferAttribute).array));
    });
    const textureOwners = [...textures].map(texture => {
      const image = texture.image as { width: number; height: number; data: { byteLength: number } };
      return { uuid: texture.uuid, name: texture.name,
        dataTexture: (texture as Texture & { isDataTexture?: boolean }).isDataTexture === true,
        width: image.width, height: image.height, baseBytes: image.data.byteLength,
        generateMipmaps: texture.generateMipmaps, colorSpace: texture.colorSpace,
        bytesWithMipEstimate: Math.ceil(image.data.byteLength * (texture.generateMipmaps ? 4 / 3 : 1)) };
    });
    const installedPatches = plan.groundSurfacePatches ?? [];
    const paving = game.renderer.scene.getObjectByName('street-life-paving') as Mesh | undefined;
    let maximumHeightError = 0, samplerHeightError = 0, samplerNormalError = 0;
    let semanticMismatches = 0, offCourseMismatches = 0, wrongWinding = 0, grassChanges = 0;
    const groundChecks = sites.map(site => {
      const derived = industrialGroundPatches(plan, site) as GroundSurfacePatch[];
      const installed = installedPatches.filter(patch => patch.id.startsWith(`street-${site.id}-`));
      const footprint = derived[0]?.footprint;
      const footprints = [...new Map(derived.filter(patch => patch.footprint)
        .map(patch => [patch.footprint!.id, patch.footprint!])).values()];
      for (const patch of derived) for (const triangle of patch.triangles) {
        const [a, b, c] = triangle.vertices;
        if ((b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) <= 0) wrongWinding++;
        for (const point of triangle.vertices) maximumHeightError = Math.max(maximumHeightError,
          Math.abs(point.y - fieldHeightAt(source.heightfield, source.surround, point.x, point.z)));
        const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
        sourceSampler.sampleGround(x, z, before);
        Object.assign(after, game.sampleGround(x, z));
        samplerHeightError = Math.max(samplerHeightError, Math.abs(after.height - before.height));
        samplerNormalError = Math.max(samplerNormalError, Math.hypot(after.normal.x - before.normal.x,
          after.normal.y - before.normal.y, after.normal.z - before.normal.z));
        offCourseMismatches += Number(after.offCourse !== before.offCourse);
        // Original collider tops retain their own semantics over surface-only paving.
        const groundHeight = fieldHeightAt(source.heightfield, source.surround, x, z);
        const expected = Math.abs(before.height - groundHeight) < 1e-7 && before.surface === patch.sourceSurface
          ? patch.surface : before.surface;
        semanticMismatches += Number(after.surface !== expected);
        if (before.surface === 'grass' && after.surface === 'pavement') grassChanges++;
      }
      const door = industrialPersonnelDoorOffset(site), c = Math.cos(site.yaw), s = Math.sin(site.yaw);
      const expectedOrigin = { x: site.position.x + c * door, y: site.position.y, z: site.position.z - s * door };
      const expectedApronOrigin = { x: site.position.x + c * INDUSTRIAL_APPROACH_RULES.serviceApronOffset,
        y: site.position.y, z: site.position.z - s * INDUSTRIAL_APPROACH_RULES.serviceApronOffset };
      const edgeSamples = footprints.flatMap(current => [1, current.far / 2].flatMap(distance => [-1, 1].map(side => {
        const inside = side * (current.width / 2 - 0.001), outside = side * (current.width / 2 + 0.001);
        const sample = (offset: number) => {
          const x = current.origin.x + c * offset + s * distance;
          const z = current.origin.z - s * offset + c * distance;
          sourceSampler.sampleGround(x, z, before);
          return { source: { ...before, normal: { ...before.normal } }, installed: game.sampleGround(x, z) };
        };
        return { footprintId: current.id, distance, side, inside: sample(inside), outside: sample(outside) };
      })));
      const outsideApronSamples = [1, 4].map(distance => {
        const x = site.position.x - c * 3 + s * distance, z = site.position.z + s * 3 + c * distance;
        sourceSampler.sampleGround(x, z, before);
        return { localX: -3, distance, source: { ...before, normal: { ...before.normal } }, installed: game.sampleGround(x, z) };
      });
      const bodyIndex = plan.solids?.findIndex(body => Math.hypot(body.centre.x - site.building.position.x,
        body.centre.z - site.building.position.z) < 0.001) ?? -1;
      return { id: site.id, buildingPropIndex: plan.props!.indexOf(site.building), building: site.building,
        sourceBuildingUnchanged: JSON.stringify(site.building) === JSON.stringify(source.props![plan.props!.indexOf(site.building)]),
        sourceSolidIndex: bodyIndex, originalBody: bodyIndex >= 0 ? plan.solids![bodyIndex] : null,
        sourceBodyUnchanged: bodyIndex >= 0 && JSON.stringify(plan.solids![bodyIndex]) === JSON.stringify(source.solids![bodyIndex]),
        position: site.position, yaw: site.yaw, faceWidth: site.faceWidth, roomWidth: site.roomWidth,
        roomDepth: site.roomDepth, height: site.height, street: site.street, doorOffset: door, expectedOrigin,
        footprint, footprints, expectedApronOrigin, serviceApronWidth: INDUSTRIAL_APPROACH_RULES.serviceApronWidth,
        installedEqualsDerived: JSON.stringify(installed) === JSON.stringify(derived), edgeSamples, outsideApronSamples,
        patches: installed.map(patch => ({ id: patch.id, footprintId: patch.footprint?.id,
          surface: patch.surface, sourceSurface: patch.sourceSurface,
          triangles: patch.triangles.length, cells: new Set(patch.triangles.map(triangle => triangle.cell)).size })) };
    });
    const snap = game.snapshot(), gl = game.renderer.renderer.getContext(), glErrors: number[] = [];
    for (let index = 0; index < 16; index++) { const code = gl.getError(); if (code === gl.NO_ERROR) break; glErrors.push(code); }
    const views = game.renderer.viewCount;
    const predicted = views === 4 ? presentation.cost.frame.quad : views === 2 ? presentation.cost.frame.split : presentation.cost.frame.solo;
    return { label, seed, world: plan.id, sourceWorld: source.id, recordWorld: plan.recordWorldId,
      generatedWorld: fresh.generated.id, originals, originalCounts: {
      props: source.props?.length ?? 0, solids: source.solids?.length ?? 0, hazards: source.hazards?.length ?? 0 },
      sites: groundChecks, report: presentation.environmentDecor, commercial: presentation.streetLife,
      scene: { groups, groupUuid: group?.uuid, meshes, triangles, geometryBytes, materialOwners: materials.size,
        geometryOwners: geometries.size, textureOwners: textures.size, textures: textureOwners,
        textureBytes: textureOwners.reduce((sum, texture) => sum + texture.bytesWithMipEstimate, 0),
        invalidNumbers, casters, transparent, mapped, shapeDigest: digest(shape), pavingMeshes,
        pavingTriangles: (paving?.geometry.getAttribute('position').count ?? 0) / 3,
        // 2026-10-03 (VIS-1): the same owner also draws the living-world warehouse bay and driveway.
        allStreetPatchTriangles: installedPatches.filter(exactPavingDrawsPatch)
          .reduce((sum, patch) => sum + patch.triangles.length, 0) },
      sampler: { maximumHeightError, samplerHeightError, samplerNormalError, semanticMismatches,
        offCourseMismatches, wrongWinding, grassChanges }, resources: snap.resources,
      views, render: snap.render, predicted, tier: presentation.tier, requestedQuality: snap.options.quality,
      cost: presentation.cost, ultraGlErrors: presentation.ultra?.glErrors ?? [], glErrors,
      tick: snap.tick, simTimeSeconds: snap.simTimeSeconds, rider: snap.euc, camera: snap.camera };
  }, { seed, label, groupName });
}

type Evidence = Awaited<ReturnType<typeof inspect>>;
function expectInstalled(evidence: Evidence): void {
  expect(evidence.world).toBe(evidence.sourceWorld);
  // 2026-10-04: the engine-independent identity of the living world.
  expect(evidence.recordWorld).toBe(`${evidence.generatedWorld}~living-r1`);
  for (const [key, fact] of Object.entries(evidence.originals)) expect(fact.same, `${evidence.label}: source ${key}`).toBe(true);
  expect(evidence.report).toMatchObject({ industrialBays: 1, vehicles: 1, bicycles: 2, people: 0, motion: 'ventilation', ventilationFans: 1,
    drawCalls: 8, textureBytes: 1_048_576, instanceBytes: 0, shadowDrawCalls: 0 });
  expect(evidence.scene).toMatchObject({ groups: 1, meshes: 8, materialOwners: 7, geometryOwners: 8,
    textureOwners: 1, textureBytes: 1_048_576,
    invalidNumbers: 0, casters: 0, transparent: 0, mapped: 1, pavingMeshes: 1 });
  expect(evidence.scene.textures).toHaveLength(1);
  expect(evidence.scene.textures[0]).toMatchObject({ name: 'original-environment-depot-sign', dataTexture: true,
    width: 768, height: 256, baseBytes: 786_432, generateMipmaps: true, colorSpace: 'srgb', bytesWithMipEstimate: 1_048_576 });
  expect(evidence.scene.triangles).toBe(evidence.report.colourTriangles);
  expect(evidence.scene.geometryBytes).toBe(evidence.report.geometryBytes);
  expect(evidence.scene.materialOwners).toBe(evidence.report.materialOwners);
  expect(evidence.scene.textureBytes).toBe(evidence.report.textureBytes);
  expect(evidence.scene.pavingTriangles).toBe(evidence.scene.allStreetPatchTriangles);
  expect(evidence.scene.triangles).toBeGreaterThan(2000);
  expect(evidence.scene.triangles).toBeLessThan(10_000);
  expect(evidence.sites).toHaveLength(1);
  for (const site of evidence.sites) {
    expect(site.building.look).toBe('industrial');
    expect(site.sourceBuildingUnchanged && site.sourceBodyUnchanged && site.installedEqualsDerived).toBe(true);
    expect(site.sourceSolidIndex).toBeGreaterThanOrEqual(0);
    expect(site.footprint?.width).toBe(1.5);
    expect(site.footprint?.origin).toEqual(site.expectedOrigin);
    expect(site.footprints).toHaveLength(2);
    expect(site.footprints[0].id).toBe(`street-${site.id}-personnel-entry`);
    expect(site.footprints[0].origin).toEqual(site.expectedOrigin);
    expect(site.footprints[1].id).toBe(`street-${site.id}-service-apron`);
    expect(site.footprints[1].origin).toEqual(site.expectedApronOrigin);
    expect(site.footprints[1].width).toBe(4.4);
    expect(site.serviceApronWidth).toBe(4.4);
    expect(new Set(site.patches.map(patch => patch.footprintId)).size).toBe(2);
    expect(site.patches.length).toBeGreaterThanOrEqual(2);
    expect(site.patches.length).toBeLessThanOrEqual(8);
    for (const patch of site.patches) expect(patch.surface).toBe(patch.sourceSurface === 'grass' ? 'pavement' : patch.sourceSurface);
    expect(site.edgeSamples).toHaveLength(8);
    for (const sample of site.edgeSamples) {
      expect(sample.outside.installed).toEqual(sample.outside.source);
      expect(sample.inside.installed.height).toBe(sample.inside.source.height);
      expect(sample.inside.installed.normal).toEqual(sample.inside.source.normal);
      expect(sample.inside.installed.surface).toBe(sample.inside.source.surface === 'grass' ? 'pavement' : sample.inside.source.surface);
    }
    for (const sample of site.outsideApronSamples) expect(sample.installed).toEqual(sample.source);
  }
  expect(evidence.sampler.maximumHeightError).toBeLessThan(1e-7);
  expect(evidence.sampler.samplerHeightError).toBeLessThan(1e-7);
  expect(evidence.sampler.samplerNormalError).toBeLessThan(1e-7);
  expect(evidence.sampler).toMatchObject({ semanticMismatches: 0, offCourseMismatches: 0, wrongWinding: 0 });
  expect(evidence.sampler.grassChanges).toBeGreaterThan(0);
  expect(evidence.render.drawCalls).toBeGreaterThan(0);
  expect(evidence.render.drawCalls).toBeLessThanOrEqual(evidence.predicted.drawCalls);
  expect(evidence.render.triangles).toBeLessThanOrEqual(evidence.predicted.triangles);
  expect(evidence.camera.mode).toBe('chase');
  expect(evidence.glErrors).toEqual([]);
  expect(evidence.ultraGlErrors).toEqual([]);
}

async function selectWorld(page: Page, seed: string | null): Promise<void> {
  await page.evaluate(() => { window.game.setAppState('title'); window.game.loop.setRunning(false); });
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  if (seed === null) await page.locator('.euc-menu--routes [data-venue="slice"]').click();
  else {
    await page.locator('#euc-seed').fill(seed);
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  }
  // 2026-10-04: plan ids of living worlds are composition hashes; the builder
  // identity is recordWorldId, and a menu world swap now prepares the living
  // world behind the loading cover (seconds, not one synchronous call).
  await expect.poll(() => page.evaluate(() => window.game.levelPlan.recordWorldId), { timeout: 90_000 })
    .toBe(seed === null ? 'm7-slice~living-r1' : `generated-r6-${seed}~living-r1`);
  await expect.poll(() => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 90_000 }).toBe(false);
  await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(0); });
}

test('industrial furnishing and coffee planter have fresh High/Ultra diagnostic views and shared couch owners', async ({ page }) => {
  // 2026-10-04: the fresh source is now the full living-world preparation
  // (seconds, computed once per page) on top of the original 180 s budget.
  test.setTimeout(300_000);
  const directory = join(shots, 'views'), errors = collectErrors(page), frames: unknown[] = [], reports: Evidence[] = [];
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true });
    for (const quality of ['high', 'ultra'] as const) {
      await page.evaluate(quality => { window.game.setOptions({ quality }); window.game.advance(0); }, quality);
      for (const view of ['principal', 'close', 'oblique', 'reverse-oblique', 'street-approach'] as const) {
        const framing = await place(page, view), label = `${quality}-industrial-${view}`;
        const evidence = await inspect(page, 'euc', label);
        frames.push({ label, framing }); reports.push(evidence);
        await page.screenshot({ path: join(directory, `${label}.png`) });
        expectInstalled(evidence);
        expect(evidence.tier.effective).toBe(quality === 'ultra' ? 'ultra' : 'ordinary');
        expect(evidence.sites[0].id).toBe('industrial-bay-490');
        expect(framing.openingProjection.inFront).toBe(true);
      }
      for (const view of ['principal', 'oblique'] as const) {
        const framing = await place(page, view, 'coffee'), label = `${quality}-coffee-${view}`;
        const evidence = await inspect(page, 'euc', label);
        frames.push({ label, framing }); reports.push(evidence);
        await page.screenshot({ path: join(directory, `${label}.png`) });
        expectInstalled(evidence);
        expect(evidence.commercial.planters).toBe(1);
      }
    }
    await page.evaluate(() => { window.game.setOptions({ quality: 'high' }); window.game.advance(0); });
    await place(page, 'oblique');
    const solo = await inspect(page, 'euc', 'solo-before-couch');
    const shared = await page.evaluate(() => {
      const game = window.game, group = game.renderer.scene.getObjectByName('environment-industrial-exemplar');
      game.spawnSecondRider();
      const pose = game.snapshot().euc;
      game.placeRider(pose.position, pose.headingY, 1);
      game.advance(0);
      return { sameGroup: group === game.renderer.scene.getObjectByName('environment-industrial-exemplar'),
        seat0: game.snapshotFor(0).euc, seat1: game.snapshotFor(1).euc };
    });
    const split = await inspect(page, 'euc', 'two-pane-industrial'); reports.push(split); frames.push({ label: split.label, shared });
    await page.screenshot({ path: join(directory, 'two-pane-industrial.png') });
    expectInstalled(split); expect(shared.sameGroup).toBe(true); expect(split.views).toBe(2);
    expect(split.scene.shapeDigest).toBe(solo.scene.shapeDigest); expect(split.report).toEqual(solo.report);
    expect(split.scene.textures).toEqual(solo.scene.textures);
    expect(shared.seat1.position).toEqual(shared.seat0.position);
    await page.evaluate(async () => {
      const path = '/src/level/environmentSites.ts', { environmentSites } = await import(path);
      const game = window.game, site = (environmentSites(game.levelPlan) as readonly IndustrialBaySite[])[0];
      for (let seat = 2; seat < 4; seat++) {
        game.spawnRider();
        const lateral = seat === 2 ? -5 : 5;
        const x = site.position.x + Math.sin(site.yaw) * 9 + Math.cos(site.yaw) * lateral;
        const z = site.position.z + Math.cos(site.yaw) * 9 - Math.sin(site.yaw) * lateral;
        game.placeRider({ x, y: game.sampleGround(x, z).height, z },
          Math.atan2(site.position.x - x, site.position.z - z), seat);
      }
      game.advance(0);
    });
    const quad = await inspect(page, 'euc', 'four-pane-industrial'); reports.push(quad);
    await page.screenshot({ path: join(directory, 'four-pane-industrial.png') });
    expectInstalled(quad); expect(quad.views).toBe(4);
    expect(quad.scene.groupUuid).toBe(solo.scene.groupUuid); expect(quad.report).toEqual(solo.report);
    expect(quad.scene.textures).toEqual(solo.scene.textures);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => window.game.advance(120));
    const reduced = await inspect(page, 'euc', 'four-pane-reduced-motion'); reports.push(reduced);
    expect(reduced.scene.shapeDigest).toBe(quad.scene.shapeDigest);
    expect(reduced.report).toEqual(quad.report);
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ kind: 'diagnostic QA placements, not a continuous ride',
      viewport: { width: 1280, height: 720 }, frames, reports, errors,
      acceptance: 'Fresh pixels require independent visual review; listening and sustained device performance unverified' }, null, 2));
  }
});

test('industrial sites on generated corner, city and rider retain original hosts and exact entrance ground', async ({ page }) => {
  test.setTimeout(180_000);
  const directory = join(shots, 'generated'), errors = collectErrors(page), reports: Evidence[] = [], frames: unknown[] = [];
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  try {
    await bootAtTier(page, 'level=generated&seed=corner', 'high', { freezeAtStart: true });
    for (const seed of ['corner', 'city', 'rider']) {
      if (seed !== 'corner') await selectWorld(page, seed);
      for (const view of ['oblique', 'street-approach'] as const) {
        const framing = await place(page, view), label = `${seed}-high-${view}`;
        const evidence = await inspect(page, seed, label); reports.push(evidence); frames.push({ label, framing });
        await page.screenshot({ path: join(directory, `${label}.png`) });
        expectInstalled(evidence);
        expect(evidence.recordWorld).toBe(`generated-r6-${seed}~living-r1`);
      }
    }
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ frames, reports, errors,
      kind: 'Generated-world diagnostic QA placements; no source plan mutations' }, null, 2));
  }
});

test('industrial owner disposes on menu world swaps and plateaus through tier and context rebuilds', async ({ page }) => {
  // 2026-10-04: six menu world swaps now prepare a living world behind the
  // loading cover, and the fresh source is the same preparation (seconds each).
  // On a loaded shared machine the full fixture (6 swaps, 15 tier rebuilds,
  // 4 context restores) passed every assertion up to its last restore at 300 s.
  test.setTimeout(480_000);
  const directory = join(shots, 'lifecycle'), errors = collectErrors(page), worlds: Evidence[] = [], tiers: Evidence[] = [];
  const disposals: unknown[] = [], restores: unknown[] = [];
  const tierPlateau = { totalCycles: 3, warmupCycle: 0, comparedCycles: [1, 2],
    stateOrder: ['low', 'medium', 'high', 'ultra', 'high-after-ultra'],
    reason: 'The first complete cycle populates lazy geometry/program caches; all first-cycle evidence is retained.',
    predicate: 'Exact resource equality at each matching state in the second and third complete cycles.' };
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  try {
    await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true });
    await place(page, 'principal');
    for (let round = 0; round < 3; round++) {
      await page.evaluate(() => {
        const group = window.game.renderer.scene.getObjectByName('environment-industrial-exemplar');
        if (!group) throw new Error('No industrial owner to observe');
        const geometries = new Set<Mesh['geometry']>(), materials = new Set<MeshStandardMaterial>(), textures = new Set<Texture>();
        group.traverse(object => {
          if (!(object as Mesh).isMesh) return;
          const mesh = object as Mesh; geometries.add(mesh.geometry);
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const standard = material as MeshStandardMaterial;
            materials.add(standard);
            if (standard.map) textures.add(standard.map);
          }
        });
        const owners = [
          ...[...geometries].map(owner => ({ owner, kind: 'geometry' as const })),
          ...[...materials].map(owner => ({ owner, kind: 'material' as const })),
          ...[...textures].map(owner => ({ owner, kind: 'texture' as const })),
        ].map(({ owner, kind }) => {
          const record = { owner, kind, uuid: owner.uuid, calls: 0, listener: () => { record.calls++; } };
          owner.addEventListener('dispose', record.listener); return record;
        });
        (window as unknown as { environmentDisposal: unknown }).environmentDisposal = { group, owners,
          geometries: geometries.size, materials: materials.size, textures: textures.size };
      });
      await selectWorld(page, null);
      const disposed = await page.evaluate(() => {
        const saved = (window as unknown as { environmentDisposal: {
          group: { parent: unknown }; owners: { owner: { removeEventListener(type: string, listener: () => void): void };
            kind: 'geometry' | 'material' | 'texture'; uuid: string;
            calls: number; listener: () => void }[]; geometries: number; materials: number; textures: number } }).environmentDisposal;
        const report = { detached: saved.group.parent === null, geometries: saved.geometries,
          materials: saved.materials, textures: saved.textures, calls: saved.owners.map(record => record.calls),
          owners: saved.owners.map(record => ({ kind: record.kind, uuid: record.uuid, disposeCalls: record.calls })),
          empty: window.game.renderer.presentation()!.environmentDecor };
        for (const record of saved.owners) record.owner.removeEventListener('dispose', record.listener);
        delete (window as unknown as { environmentDisposal?: unknown }).environmentDisposal;
        return report;
      });
      disposals.push(disposed);
      expect(disposed.detached).toBe(true); expect(disposed.geometries).toBe(8); expect(disposed.materials).toBe(7);
      expect(disposed.textures).toBe(1);
      expect(disposed.calls).toEqual(Array(16).fill(1));
      expect(disposed.owners.filter(owner => owner.kind === 'texture')).toHaveLength(1);
      expect(disposed.owners.filter(owner => owner.kind === 'texture').map(owner => owner.disposeCalls)).toEqual([1]);
      expect(disposed.empty.industrialBays + disposed.empty.drawCalls + disposed.empty.geometryBytes
        + disposed.empty.materialOwners + disposed.empty.textureBytes).toBe(0);
      await selectWorld(page, 'euc'); await place(page, 'principal');
      const rebuilt = await inspect(page, 'euc', `menu-world-round-${round}`); worlds.push(rebuilt); expectInstalled(rebuilt);
    }
    expect(worlds[2].resources).toEqual(worlds[1].resources);
    expect(worlds[2].report).toEqual(worlds[0].report);
    for (let round = 0; round < 3; round++) for (const quality of ['low', 'medium', 'high', 'ultra', 'high'] as const) {
      const unchanged = await page.evaluate(quality => {
        const game = window.game, pose = game.snapshot().euc, group = game.renderer.scene.getObjectByName('environment-industrial-exemplar');
        game.setOptions({ quality }); game.advance(0);
        return { poseUnchanged: JSON.stringify(pose) === JSON.stringify(game.snapshot().euc),
          sameGroup: group === game.renderer.scene.getObjectByName('environment-industrial-exemplar') };
      }, quality);
      const evidence = await inspect(page, 'euc', `tier-${round}-${quality}`); tiers.push(evidence); expectInstalled(evidence);
      expect(unchanged).toEqual({ poseUnchanged: true, sameGroup: true });
      expect(evidence.scene.textures).toEqual(worlds[worlds.length - 1].scene.textures);
      expect(evidence.tier.effective).toBe(quality === 'ultra' ? 'ultra' : 'ordinary');
    }
    // Keep the first cycle as measured warmup, then prove that another whole
    // cycle adds nothing at each matching tier state, including the Ultra exit.
    for (let index = 0; index < 5; index++) expect(tiers[index + 10].resources,
      `second/third cycle resource plateau at ${tierPlateau.stateOrder[index]}`).toEqual(tiers[index + 5].resources);
    const restoredByQuality = new Map<string, Evidence>();
    for (const quality of ['high', 'ultra'] as const) for (let restoreRound = 0; restoreRound < 2; restoreRound++) {
      await page.evaluate(quality => { window.game.setOptions({ quality }); window.game.advance(0); }, quality);
      const before = await inspect(page, 'euc', `${quality}-${restoreRound}-before-loss`);
      await page.evaluate(() => {
        const renderer = window.game.renderer.renderer, gl = renderer.getContext(), extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('WEBGL_lose_context unavailable; restore evidence cannot be claimed');
        const state = { extension, restored: null as number[] | null };
        (window as unknown as { environmentContext: unknown }).environmentContext = state;
        renderer.domElement.addEventListener('webglcontextrestored', () => {
          window.game.loop.setRunning(false);
          const codes: number[] = [];
          for (let index = 0; index < 16; index++) { const code = gl.getError(); if (code === gl.NO_ERROR) break; codes.push(code); }
          state.restored = codes;
        }, { once: true });
        extension.loseContext();
      });
      await page.waitForFunction(() => window.game.snapshot().contextLost);
      const lost = await page.evaluate(() => ({ tick: window.game.snapshot().tick,
        running: window.game.snapshot().loop.running, noticeVisible: !document.querySelector<HTMLElement>('#euc-context-notice')!.hidden }));
      expect(lost.tick).toBe(before.tick); expect(lost.running).toBe(false);
      await expect(page.locator('#euc-context-notice')).toBeVisible();
      await page.evaluate(() => {
        (window as unknown as { environmentContext: { extension: { restoreContext(): void } } }).environmentContext.extension.restoreContext();
      });
      await page.waitForFunction(() => !window.game.snapshot().contextLost
        && (window as unknown as { environmentContext: { restored: number[] | null } }).environmentContext.restored !== null);
      await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(0); });
      const restoredFlags = await page.evaluate(() => (window as unknown as { environmentContext: { restored: number[] } }).environmentContext.restored);
      const after = await inspect(page, 'euc', `${quality}-${restoreRound}-after-restore`);
      restores.push({ quality, restoreRound, before, lost, restoredFlags, after });
      await page.screenshot({ path: join(directory, `${quality}-restored-${restoreRound}.png`) });
      expect(restoredFlags).toEqual([]); expectInstalled(after);
      expect(after.tick).toBe(before.tick); expect(after.rider).toEqual(before.rider);
      expect(after.scene.groupUuid).toBe(before.scene.groupUuid); expect(after.scene.shapeDigest).toBe(before.scene.shapeDigest);
      expect(after.scene.textures).toEqual(before.scene.textures);
      expect(after.resources.sceneObjects).toBe(before.resources.sceneObjects);
      expect(after.resources.lights).toBe(before.resources.lights);
      expect(after.resources.geometries).toBeGreaterThan(0);
      expect(after.report).toEqual(before.report);
      // A loss clears uploads of objects seen only in earlier menu/views.
      // Compare repeated restored frames to each other, at the same view and
      // tier, rather than requiring those old cache uploads to survive a loss.
      const previousRestore = restoredByQuality.get(quality);
      if (previousRestore) expect(after.resources).toEqual(previousRestore.resources);
      restoredByQuality.set(quality, after);
      // The post-restore teardown path must also draw without dead-context deletes.
      await page.evaluate(() => { window.game.setOptions({ quality: 'low' }); window.game.advance(0);
        window.game.setOptions({ quality: 'high' }); window.game.advance(0); });
      const later = await inspect(page, 'euc', `${quality}-${restoreRound}-post-restore-tier-round`); expectInstalled(later); tiers.push(later);
      await page.evaluate(() => { delete (window as unknown as { environmentContext?: unknown }).environmentContext; });
    }
    const expectedMechanism = /CONTEXT_LOST_WEBGL|context lost|context restored/i;
    expect(errors.filter(line => !expectedMechanism.test(line))).toEqual([]);
  } finally {
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ worlds, tiers, tierPlateau, disposals, restores, errors,
      ownerScope: 'Seven unique geometries, seven unique materials, and one original mapped DataTexture; every owner emits exactly one dispose on each menu world replacement. The same texture owner survives tier/pane/context upload rebuilds.',
      kind: 'Exact owner/resource/work checks; no frame intervals or device performance claim' }, null, 2));
  }
});
