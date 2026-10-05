/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

const directory = process.env.ENVIRONMENT_FOUNDATION_SHOTS ?? 'test-results/environment-overhaul/foundation-r1';
for (const world of ['generated&seed=euc', 'generated&seed=corner', 'switchback']) {
  for (const quality of ['high', 'ultra'] as const) test(`shared foundation ${world} ${quality}`, async ({ page }) => {
    test.setTimeout(120_000);
    mkdirSync(directory, { recursive: true });
    const errors = collectErrors(page), name = `${world.replaceAll('&', '-').replaceAll('=', '-')}-${quality}`;
    await page.setViewportSize({ width: 1280, height: 900 });
    await bootAtTier(page, `level=${world}`, quality, { freezeAtStart: true });
    const inspect = async () => page.evaluate(() => {
      const game = window.game, report = game.renderer.presentation(), gl = game.renderer.renderer.getContext();
      const programs = (game.renderer.renderer.info.programs ?? []).map(program => ({
        linked: gl.getProgramParameter(program.program as WebGLProgram, gl.LINK_STATUS),
        shared: (gl.getShaderSource(program.fragmentShader) ?? '').includes('sharedPavingTone'),
      }));
      const glErrors: number[] = [];
      for (let i = 0; i < 16; i++) { const error = gl.getError(); if (error === gl.NO_ERROR) break; glErrors.push(error); }
      const snapshot = game.snapshot();
      return { presentation: report, resources: snapshot.resources, render: snapshot.render, glErrors, programs,
        pose: snapshot.euc, clock: snapshot.simTimeSeconds };
    });
    const frames: unknown[] = [], initial = await inspect();
    expect(initial.presentation!.tier.effective).toBe(quality === 'ultra' ? 'ultra' : 'ordinary');
    expect(initial.presentation!.sharedGround!.textures).toBeGreaterThan(0);
    expect(initial.presentation!.sharedGround!.bytes).toBeGreaterThan(0);
    expect(initial.programs.every(program => program.linked)).toBe(true);
    expect(initial.programs.some(program => program.shared)).toBe(true);
    expect(initial.glErrors).toEqual([]);
    await page.screenshot({ path: join(directory, `${name}-spawn.png`) });
    frames.push({ label: 'spawn', ...initial });
    const subjects = await page.evaluate(async () => {
      const path = '/src/data/surfaces.ts', { SURFACES } = await import(path);
      const game = window.game, plan = game.levelPlan;
      const all = plan.segments.flatMap(segment => window.qa.routePoints([segment.id], 3));
      const candidates: { label: string; x: number; z: number; heading: number; surface: string }[] = [];
      for (const label of ['road', 'offroad']) {
        for (let index = 2; index < all.length - 4; index++) {
          const point = all[index], ahead = all[index + 1], ground = game.sampleGround(point.x, point.z);
          const material = SURFACES[ground.surface]?.material;
          if (!(label === 'road' ? ['pavement', 'roughPavement'] : ['dirt', 'gravel']).includes(material)) continue;
          if (Math.hypot(ahead.x - point.x, ahead.z - point.z) > 4 || ground.offCourse) continue;
          candidates.push({ label, x: point.x, z: point.z, surface: ground.surface,
            heading: Math.atan2(ahead.x - point.x, ahead.z - point.z) }); break;
        }
      }
      return candidates;
    });
    expect(subjects.some(subject => subject.label === 'offroad')).toBe(true);
    for (const subject of subjects) {
      await page.evaluate(point => {
        const game = window.game; game.clearActions();
        game.placeRider({ x: point.x, y: game.sampleGround(point.x, point.z).height, z: point.z }, point.heading);
        game.advance(0);
      }, subject);
      await page.screenshot({ path: join(directory, `${name}-${subject.label}.png`) });
      frames.push({ subject, ...await inspect() });
      if (subject.label === 'offroad') {
        await page.evaluate(() => window.game.setActions({ throttle: 0.38, steer: 0 }));
        for (let frame = 0; frame < 12; frame++) {
          await page.evaluate(() => window.game.advance(24));
          await page.screenshot({ path: join(directory, `${name}-motion-${String(frame).padStart(2, '0')}.png`) });
          frames.push({ motionFrame: frame, ...await inspect() });
        }
        await page.evaluate(() => window.game.clearActions());
      }
    }
    const final = await inspect(); expect(final.glErrors).toEqual([]);
    expect(errors).toEqual([]);
    writeFileSync(join(directory, `${name}.json`), JSON.stringify({ world, quality, frames, final, errors }, null, 2));
  });
}

test('shared foundation survives tier rebuilds and separated two/four views', async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(directory, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await bootAtTier(page, 'level=generated&seed=euc', 'high', { freezeAtStart: true });
  const snapshots: unknown[] = [];
  const lastResources = new Map<string, unknown>();
  for (let cycle = 0; cycle < 3; cycle++) for (const quality of ['ultra', 'high'] as const) {
    const report = await page.evaluate(quality => {
      const game = window.game; const before = game.snapshot().euc;
      game.setOptions({ quality }); game.advance(0);
      return { quality, resources: game.snapshot().resources, before, after: game.snapshot().euc,
        shared: game.renderer.presentation()!.sharedGround };
    }, quality);
    expect(report.after).toEqual(report.before);
    expect(report.shared!.textures).toBeGreaterThan(0);
    if (cycle > 0) expect(report.resources).toEqual(lastResources.get(quality));
    lastResources.set(quality, report.resources); snapshots.push(report);
  }
  for (const count of [2, 4]) {
    const views = await page.evaluate(count => {
      const game = window.game;
      while (game.renderer.viewCount < count) game.spawnRider();
      const points = window.qa.routePoints([game.levelPlan.segments[0].id], 2);
      for (let seat = 0; seat < count; seat++) {
        const point = points[Math.min(points.length - 2, 2 + seat * 3)];
        const ahead = points[Math.min(points.length - 1, 3 + seat * 3)];
        game.placeRider({ x: point.x, y: game.sampleGround(point.x, point.z).height, z: point.z },
          Math.atan2(ahead.x - point.x, ahead.z - point.z), seat);
      }
      game.advance(0); const snapshot = game.snapshot();
      return { count: game.renderer.viewCount, render: snapshot.render, resources: snapshot.resources,
        presentation: game.renderer.presentation() };
    }, count);
    expect(views.count).toBe(count); snapshots.push({ label: 'separated-panes', ...views });
    await page.screenshot({ path: join(directory, `euc-${count}-panes.png`) });
  }
  expect(errors).toEqual([]);
  writeFileSync(join(directory, 'rebuilds.json'), JSON.stringify(snapshots, null, 2));
});

for (const quality of ['high', 'ultra'] as const) test(`shared grass close and oblique ${quality}`, async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(directory, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true });
  const subject = await page.evaluate(() => {
    const game = window.game, camera = game.renderer.camera;
    const group = game.renderer.scene.getObjectByName('environment-vegetation')!;
    const spawn = game.levelPlan.spawn.position;
    const candidates: { x: number; y: number; z: number; distance: number }[] = [];
    for (const child of group.children) {
      const mesh = child as import('three').InstancedMesh;
      if (!mesh.visible || !mesh.name.includes('-base-')) continue;
      for (let index = 0; index < mesh.count; index++) {
        const matrix = camera.matrixWorld.clone(); mesh.getMatrixAt(index, matrix);
        const point = camera.position.clone().setFromMatrixPosition(matrix);
        const distance = Math.hypot(point.x - spawn.x, point.z - spawn.z);
        if (distance < 12 || distance > 70) continue;
        const rider = game.sampleGround(point.x - 2, point.z - 4);
        if (rider.surface !== 'grass' || rider.offCourse || rider.normal.y < 0.95) continue;
        candidates.push({ x: point.x, y: point.y, z: point.z, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
    const point = candidates[0]; if (!point) throw new Error('No admitted near-spawn grass subject');
    game.placeRider({ x: point.x - 2, y: game.sampleGround(point.x - 2, point.z - 4).height, z: point.z - 4 },
      Math.atan2(2, 4)); game.advance(0);
    return point;
  });
  const chasePixels = await page.screenshot({ path: join(directory, `grass-${quality}-chase.png`) });
  // Frozen simulation still renders on RAF. Stop that scheduler for these
  // diagnostic angles so the chase camera cannot overwrite the requested view.
  await page.evaluate(() => window.game.loop.dispose());
  const angles: unknown[] = [];
  let previousPixels = chasePixels;
  for (const view of ['close', 'oblique'] as const) {
    const requestedCamera = await page.evaluate(({ subject, view }) => {
      const renderer = window.game.renderer, camera = renderer.camera;
      camera.position.set(subject.x + (view === 'close' ? 0.9 : 2), subject.y + (view === 'close' ? 0.65 : 0.4),
        subject.z - (view === 'close' ? 1.1 : 1.7));
      camera.lookAt(subject.x, subject.y + 0.12, subject.z); camera.updateMatrixWorld(); renderer.render();
      return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() };
    }, { subject, view });
    const pixels = await page.screenshot({ path: join(directory, `grass-${quality}-${view}.png`) });
    const capturedCamera = await page.evaluate(() => ({
      position: window.game.renderer.camera.position.toArray(),
      quaternion: window.game.renderer.camera.quaternion.toArray(),
    }));
    expect(capturedCamera).toEqual(requestedCamera);
    expect(pixels.equals(chasePixels)).toBe(false);
    expect(pixels.equals(previousPixels)).toBe(false);
    previousPixels = pixels; angles.push({ view, requestedCamera, capturedCamera });
  }
  expect(errors).toEqual([]);
  writeFileSync(join(directory, `grass-${quality}.json`), JSON.stringify({ quality, subject, angles, errors,
    scope: 'One deterministic admitted clump, normal chase and diagnostic close/oblique camera; not full-world density acceptance' }, null, 2));
});

for (const quality of ['high', 'ultra'] as const) test(`shared tree forms close and oblique ${quality}`, async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(directory, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true });
  const subjects = await page.evaluate(() => {
    const game = window.game, spawn = game.levelPlan.spawn.position;
    return (['broadleafTree', 'conifer', 'shrub'] as const).map(kind => {
      const prop = (game.levelPlan.props ?? []).filter(prop => prop.kind === kind)
        .sort((a, b) => Math.hypot(a.position.x - spawn.x, a.position.z - spawn.z)
          - Math.hypot(b.position.x - spawn.x, b.position.z - spawn.z))[0];
      if (!prop) throw new Error(`Missing vegetation subject ${kind}`);
      return { kind, position: prop.position, scale: prop.scale,
        propIndex: game.levelPlan.props!.indexOf(prop) };
    });
  });
  await page.evaluate(() => window.game.loop.dispose());
  const angles: unknown[] = [];
  for (const subject of subjects) {
    let previousPixels: Buffer | null = null;
    for (const view of ['close', 'oblique'] as const) {
      const requested = await page.evaluate(async ({ subject, view }) => {
        const renderer = window.game.renderer, camera = renderer.camera;
        const path = '/src/render/sharedVegetation.ts';
        const { SHARED_VEGETATION_CONTRACTS } = await import(path);
        const family = subject.kind === 'broadleafTree' ? 'crown' : subject.kind === 'conifer' ? 'coniferFoliage' : 'shrub';
        const bounds = SHARED_VEGETATION_CONTRACTS[family];
        const bottom = Math.min(0,bounds.min[1])*subject.scale,top=bounds.max[1]*subject.scale;
        const halfY=(top-bottom)/2,halfX=Math.max(-bounds.min[0],bounds.max[0])*subject.scale;
        const halfZ=Math.max(-bounds.min[2],bounds.max[2])*subject.scale;
        const radius=Math.hypot(halfX,halfY,halfZ);
        const verticalHalfFov=camera.fov*Math.PI/360;
        const halfFov=Math.min(verticalHalfFov,Math.atan(Math.tan(verticalHalfFov)*camera.aspect));
        const distance=radius/Math.sin(halfFov)*(view === 'close'?1.06:1.35);
        const centre=camera.position.clone().set(subject.position.x,subject.position.y+(bottom+top)/2,subject.position.z);
        // Choose a real clear angle; a nearby lamp shade obscured the former
        // whole-form view. No scene object is hidden or moved for this capture.
        const propsPath='/src/data/props.ts';
        const { PROP_SPREADS, PROP_VERTICAL_SPANS }=await import(propsPath);
        const plan=window.game.levelPlan;
        const boxes=(plan.props ?? []).flatMap((prop,index) => {
          if (index === subject.propIndex) return [];
          const spread=PROP_SPREADS[prop.kind],span=PROP_VERTICAL_SPANS[prop.kind];
          return [{x:prop.position.x,z:prop.position.z,yaw:prop.rotationY,
            halfX:(spread.shape === 'circle'?spread.radius:spread.halfX*(prop.size?.x ?? 1))*prop.scale,
            halfZ:(spread.shape === 'circle'?spread.radius:spread.halfZ*(prop.size?.z ?? 1))*prop.scale,
            minY:prop.position.y+span.bottom*prop.scale,maxY:prop.position.y+span.top*prop.scale}];
        });
        for (const box of [...(plan.solids ?? []),...(plan.softBodies ?? []),...plan.segments.flatMap(segment=>segment.colliders)]) {
          if (Math.hypot(box.centre.x-subject.position.x,box.centre.z-subject.position.z)<1e-6) continue;
          boxes.push({x:box.centre.x,z:box.centre.z,yaw:box.rotationY,halfX:box.halfExtents.x,halfZ:box.halfExtents.z,
            minY:box.centre.y-box.halfExtents.y,maxY:box.centre.y+box.halfExtents.y});
        }
        const blocked=(from:import('three').Vector3,to:import('three').Vector3):boolean=>boxes.some(box=>{
          const ch=Math.cos(box.yaw),sh=Math.sin(box.yaw);
          const local=(point:import('three').Vector3)=>[ch*(point.x-box.x)-sh*(point.z-box.z),point.y,
            sh*(point.x-box.x)+ch*(point.z-box.z)];
          const first=local(from),last=local(to),low=[-box.halfX,box.minY,-box.halfZ],high=[box.halfX,box.maxY,box.halfZ];
          let enter=0,leave=0.985;
          for(let axis=0;axis<3;axis++){
            const delta=last[axis]-first[axis];
            if(Math.abs(delta)<1e-9){if(first[axis]<low[axis]||first[axis]>high[axis])return false;continue;}
            const a=(low[axis]-first[axis])/delta,b=(high[axis]-first[axis])/delta;
            enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));if(enter>leave)return false;
          }
          return leave>=enter;
        });
        const preferred=Math.atan2(view === 'close'?0.6:-0.8,-1);
        const choices=[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI*3/4,-Math.PI*3/4,Math.PI].map(turn=>{
          const yaw=preferred+turn;
          const direction=camera.position.clone().set(Math.sin(yaw),view === 'close'?0.32:0.12,Math.cos(yaw)).normalize();
          const position=centre.clone().addScaledVector(direction,distance);
          const sideways=centre.clone().set(Math.cos(yaw),0,-Math.sin(yaw));
          const targets=[centre,centre.clone().addScaledVector(sideways,halfX*0.45),centre.clone().addScaledVector(sideways,-halfX*0.45),
            centre.clone().add(camera.position.clone().set(0,halfY*0.5,0)),centre.clone().add(camera.position.clone().set(0,-halfY*0.5,0))];
          return {yaw,position,blocked:targets.filter(target=>blocked(position,target)).length};
        });
        choices.sort((a,b)=>a.blocked-b.blocked);
        const chosen=choices[0];
        camera.position.copy(chosen.position);
        camera.lookAt(centre);camera.updateMatrixWorld();renderer.render();
        return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
          occlusion:{blockedSamples:chosen.blocked,yaw:chosen.yaw,candidates:choices.map(choice=>({yaw:choice.yaw,blockedSamples:choice.blocked}))} };
      }, { subject, view });
      const pixels = await page.screenshot({ path: join(directory, `${subject.kind}-${quality}-${view}.png`) });
      const captured = await page.evaluate(() => ({ position: window.game.renderer.camera.position.toArray(),
        quaternion: window.game.renderer.camera.quaternion.toArray() }));
      expect(captured).toEqual({position:requested.position,quaternion:requested.quaternion});
      expect(requested.occlusion.blockedSamples).toBe(0);
      if (previousPixels) expect(pixels.equals(previousPixels)).toBe(false);
      previousPixels = pixels; angles.push({ subject, view, requested, captured });
    }
  }
  expect(errors).toEqual([]);
  writeFileSync(join(directory, `tree-forms-${quality}.json`), JSON.stringify({ subjects, angles, errors,
    scope: 'Nearest original broadleaf, conifer and shrub; diagnostic whole-form construction views, not district acceptance' }, null, 2));
});

for (const quality of ['high', 'ultra'] as const) test(`shared terrain faster controller approach ${quality}`, async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(directory, { recursive: true });
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await bootAtTier(page, 'level=generated&seed=euc', quality, { freezeAtStart: true });
  const source = await page.evaluate(() => {
    const game = window.game, plan = game.levelPlan;
    for (const segment of plan.segments) {
      const a = segment.entry, heading = a.headingY;
      const sameHeading = (other: number) => Math.abs(Math.atan2(Math.sin(other - heading), Math.cos(other - heading))) < 1e-6;
      if (!sameHeading(segment.exit.headingY)) continue;
      const chain = [segment]; let b = segment.exit;
      while (Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z) < 115) {
        const next = plan.segments.find(other => !chain.includes(other) && sameHeading(other.entry.headingY)
          && sameHeading(other.exit.headingY) && Math.hypot(other.entry.position.x - b.position.x,
            other.entry.position.z - b.position.z) < 0.02);
        if (!next) break;
        chain.push(next); b = next.exit;
      }
      const length = Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
      if (length < 115) continue;
      // 2026-10-04: the living world runs traffic loops, walkers and riders on
      // authored lanes, and the first selected straight (a commercial side
      // street) is now a traffic lane: at 65 km/h the rider correctly crashed
      // into the van driving it. Actors are not this terrain evidence's subject
      // any more than hazards are, so the driver's corridor also keeps 4.5 m
      // from every population lane centreline (read, never edited).
      const lanes = (game as unknown as { populationPlan: { paths: readonly { points: readonly { x: number; z: number }[] }[] } })
        .populationPlan.paths;
      const nearLane = (x: number, z: number) => lanes.some(path => path.points.some((point, index) => {
        if (index === 0) return false;
        const previous = path.points[index - 1], dx = point.x - previous.x, dz = point.z - previous.z, length2 = dx * dx + dz * dz;
        const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - previous.x) * dx + (z - previous.z) * dz) / length2)) : 0;
        return Math.hypot(x - previous.x - t * dx, z - previous.z - t * dz) < 4.5;
      }));
      for (const lateral of [0, 2, -2]) {
        let clear = true;
        for (let distance = 8; distance <= 108; distance += 0.5) {
          const x = a.position.x + Math.sin(heading) * distance + Math.cos(heading) * lateral;
          const z = a.position.z + Math.cos(heading) * distance - Math.sin(heading) * lateral;
          const ground = game.sampleGround(x, z), referenceY = a.position.y + (b.position.y - a.position.y) * distance / length;
          if (!['pavement', 'roughPavement'].includes(ground.surface) || ground.offCourse
            || Math.abs(ground.height - referenceY) > 0.2 || (plan.hazards ?? []).some(hazard =>
              Math.hypot(x - hazard.centre.x, z - hazard.centre.z) < hazard.radius + 2) || nearLane(x, z)) { clear = false; break; }
        }
        if (clear) return { segmentIds: chain.map(source => source.id), lateral,
          x: a.position.x + Math.sin(heading) * 8 + Math.cos(heading) * lateral,
          z: a.position.z + Math.cos(heading) * 8 - Math.sin(heading) * lateral, heading, length };
      }
    }
    throw new Error('No long clear original straight for faster controller evidence');
  });
  await page.evaluate(source => {
    const game = window.game; game.clearActions();
    game.placeRider({ x: source.x, y: game.sampleGround(source.x, source.z).height, z: source.z }, source.heading);
    game.setActions({ throttle: 0.65, steer: 0 });
  }, source);
  const trace: unknown[] = [];
  // Inspect each fixed-step batch: a successful end alone would hide a reset
  // or crash during acceleration. This is real controller motion from rest.
  for (let batch = 0; batch < 30; batch++) {
    const pose = await page.evaluate(() => { window.game.advance(24); return window.game.snapshot().euc; });
    expect(pose.crashed).toBe(false); expect(pose.offCourse).toBe(false); trace.push({ batch, pose });
  }
  const motion: unknown[] = [];
  for (let frame = 0; frame < 12; frame++) {
    const state = await page.evaluate(() => { window.game.advance(12); return window.game.snapshot(); });
    expect(state.euc.speed).toBeGreaterThan(8.33);
    expect(state.euc.crashed).toBe(false); expect(state.euc.offCourse).toBe(false);
    await page.screenshot({ path: join(directory, `faster-${quality}-motion-${String(frame).padStart(2, '0')}.png`) });
    motion.push({ frame, pose: state.euc, camera: state.camera, resources: state.resources, render: state.render });
  }
  await page.evaluate(() => window.game.clearActions());
  expect(errors).toEqual([]);
  writeFileSync(join(directory, `faster-${quality}.json`), JSON.stringify({ source, trace, motion, errors,
    scope: 'Controller acceleration followed by twelve 0.1-second sampled frames above 30 km/h; no hazard interaction or device-performance claim' }, null, 2));
});
