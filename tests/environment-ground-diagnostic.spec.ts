/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { bootAtTier, collectErrors } from './harness.ts';

const directory = process.env.ENVIRONMENT_GROUND_DIAGNOSTIC_SHOTS
  ?? 'test-results/environment-overhaul/ground-diagnostic-r1';

/** Transient shader ablations locate visible seams; these are diagnostic
 * captures, never accepted game output or a production presentation option. */
for (const world of ['generated&seed=euc', 'switchback']) test(`ground seam diagnosis ${world}`, async ({ page }) => {
  test.setTimeout(120_000); mkdirSync(directory, { recursive: true });
  const errors = collectErrors(page), name = world.replaceAll('&', '-').replaceAll('=', '-');
  await page.setViewportSize({ width: 1280, height: 900 });
  await bootAtTier(page, `level=${world}`, 'high', { freezeAtStart: true });
  const subject = await page.evaluate(async () => {
    const path = '/src/data/surfaces.ts', { SURFACES } = await import(path);
    const game = window.game;
    const all = game.levelPlan.segments.flatMap(segment => window.qa.routePoints([segment.id], 3));
    for (let index = 2; index < all.length - 4; index++) {
      const point = all[index], ahead = all[index + 1], ground = game.sampleGround(point.x, point.z);
      if (!['dirt', 'gravel'].includes(SURFACES[ground.surface].material)
        || Math.hypot(ahead.x - point.x, ahead.z - point.z) > 4 || ground.offCourse) continue;
      const heading = Math.atan2(ahead.x - point.x, ahead.z - point.z);
      game.placeRider({ x: point.x, y: ground.height, z: point.z }, heading); game.advance(0);
      game.loop.dispose();
      const terrain = game.renderer.scene.getObjectByName('level-heightfield') as import('three').Mesh;
      const materials = terrain.material as import('three').MeshStandardMaterial[];
      for (const material of materials) material.userData.groundDiagnostic = {
        compile: material.onBeforeCompile, key: material.customProgramCacheKey,
      };
      terrain.userData.groundDiagnosticColours = terrain.geometry.getAttribute('color').array.slice();
      return { x: point.x, z: point.z, heading, surface: ground.surface, pose: game.snapshot().euc };
    }
    throw new Error('No actual off-road transition subject');
  });
  const captures: unknown[] = [];
  for (const variant of ['baseline', 'boundary-off', 'relief-off', 'neighbourhood-off', 'boundary-off-neutral-colour'] as const) {
    const facts = await page.evaluate(variant => {
      const game = window.game, renderer = game.renderer;
      const terrain = renderer.scene.getObjectByName('level-heightfield') as import('three').Mesh;
      const materials = terrain.material as import('three').MeshStandardMaterial[];
      const colours = terrain.geometry.getAttribute('color') as import('three').BufferAttribute;
      colours.array.set(terrain.userData.groundDiagnosticColours as Float32Array);
      if (variant === 'boundary-off-neutral-colour') colours.array.fill(1);
      colours.needsUpdate = true;
      for (const material of materials) {
        const original = material.userData.groundDiagnostic as {
          compile: import('three').MeshStandardMaterial['onBeforeCompile'];
          key: import('three').MeshStandardMaterial['customProgramCacheKey'];
        };
        material.customProgramCacheKey = () => `${original.key.call(material)}/diagnostic/${variant}`;
        material.onBeforeCompile = (shader, glRenderer) => {
          original.compile.call(material, shader, glRenderer);
          if (variant.startsWith('boundary-off')) {
            const anchor = 'boundaryCover = mix(boundaryCover, boundaryRounded, boundaryRound);';
            if (shader.fragmentShader.split(anchor).length !== 2) throw new Error('Diagnostic boundary anchor changed');
            shader.fragmentShader = shader.fragmentShader.replace(anchor, 'boundaryCover = 0.0;');
          }
          if (variant === 'relief-off') {
            const anchor = 'if (abs(sharedDet)>1e-8) normal = normalize(abs(sharedDet)*normal-sharedGrad);';
            if (shader.fragmentShader.includes(anchor)) shader.fragmentShader = shader.fragmentShader.replace(anchor, '');
          }
          if (variant === 'neighbourhood-off') {
            const anchor = 'vec3 transitionTone = vec3(1.0);';
            if (shader.fragmentShader.includes(anchor)) shader.fragmentShader = shader.fragmentShader.replace(anchor,
              'transitionWeight = 0.0;\n' + anchor);
          }
        };
        material.needsUpdate = true;
      }
      renderer.render();
      const gl = renderer.renderer.getContext(), glErrors: number[] = [];
      for (let count = 0; count < 16; count++) { const error = gl.getError(); if (!error) break; glErrors.push(error); }
      return { variant, pose: game.snapshot().euc, glErrors,
        linked: (renderer.renderer.info.programs ?? []).every(program =>
          gl.getProgramParameter(program.program as WebGLProgram, gl.LINK_STATUS)),
        camera: { position: renderer.camera.position.toArray(), quaternion: renderer.camera.quaternion.toArray() } };
    }, variant);
    expect(facts.pose).toEqual(subject.pose); expect(facts.glErrors).toEqual([]); expect(facts.linked).toBe(true);
    await page.screenshot({ path: join(directory, `${name}-${variant}.png`) }); captures.push(facts);
  }
  expect(errors).toEqual([]);
  writeFileSync(join(directory, `${name}.json`), JSON.stringify({ world, subject, captures, errors,
    scope: 'Transient ordinary shader ablations at an actual authored surface transition; diagnostic only' }, null, 2));
});
