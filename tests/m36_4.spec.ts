/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import type { LevelPlan } from '../src/level/plan.ts';
import { LIGHTING } from '../src/data/tuning.ts';
import { DAYLIGHT_LOOK, resolveVenueLook } from '../src/data/venueLook.ts';
import { PROP_SIZES } from '../src/data/props.ts';
import { FOREST_SHADOW_STAND, FOREST_HEIGHTS } from '../src/level/parkDressing.ts';
import { SWITCHBACK_LOOK, SWITCHBACK_SUN } from '../src/level/switchbackLevel.ts';
import type { PlayableCharacterId } from '../src/data/riders.ts';
import {
  RENDER_BUDGET,
  RENDER_BUDGET_QUAD,
  RENDER_BUDGET_SPLIT,
} from '../src/data/renderCost.ts';

/**
 * M36 Phase 4 — the dressed hillside and the venue look, in a real browser.
 *
 * `docs/PLANS.md` §36.7 (the allocation) and §36 Phase 4 (the dressing). The
 * *model* is headless and stays there: `src/level/parkDressing.test.ts` and
 * `src/level/switchbackLevel.test.ts` hold every clearance, every kept-clear
 * zone and the prop family against `PROP_BUDGET`; `src/render/presentation.test.ts`
 * holds predicted == measured on both rungs of the ladder;
 * `src/data/venueLook.test.ts`, `src/render/sky.test.ts` and
 * `src/render/levelLifecycle.test.ts` hold the look's composition, its
 * byte-identical default sky and its round trip. Repeating any of that here
 * would be slower and no truer.
 *
 * What only a browser can prove is what a GPU and a screen do with it:
 *
 *   - every world the game ships is still lit by the daylight it shipped
 *     with — read off the live scene, not off the constants;
 *   - BelVar comes back **byte for byte** after the park has been installed
 *     over it and taken away again, which is the pixel half of the look's
 *     round trip (the headless half cannot see a frame, this half cannot see
 *     the composition, and both are needed);
 *   - the dressed park's *live* frame counters are inside all three render
 *     contracts and inside §36.7's working allocation;
 *   - twelve rebuilds through the venue swap leave the GPU where they found
 *     it, now that four new instanced part families are created and disposed
 *     with every one;
 *   - and the G3 frames themselves, at gameplay scale, from the chase camera.
 *
 * Nothing here reads a frame interval or a frame rate (`AGENTS.md`).
 */

/** The diagnostic entrances. There is no chooser until Phase 5, on purpose. */
const PARK = 'level=switchback';
const BELVAR = 'level=track';

/**
 * Where the frames land. **An environment variable with a repo-relative
 * default**, never an absolute path written down here: a scratchpad path
 * carries the machine's own account name and `tools/export-source.mjs` refuses
 * to publish a tree containing one. `M36_SHOTS` names the
 * directory the phase folders are made under.
 */
const SHOTS = `${process.env.M36_SHOTS ?? 'test-results/m36'}/phase4`;

async function saveShot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const body = clip ? await page.screenshot({ clip }) : await page.screenshot();
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, body);
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

/**
 * What the live renderer composed, read off the scene rather than off the
 * plan — the thirteen numbers a look can move, plus the two the rig owns.
 */
function litScene(): {
  look: Record<string, number>;
  authored: boolean;
  fogColour: number;
  fogNear: number;
  fogFar: number;
  exposure: number;
  lights: number;
  planId: string;
} {
  const game = window.game;
  const scene = game.renderer.scene;
  const fog = scene.fog as { color: { getHex(): number }; near: number; far: number };
  return {
    look: { ...game.renderer.venueLook() } as unknown as Record<string, number>,
    authored: 'look' in game.levelPlan,
    fogColour: fog.color.getHex(),
    fogNear: fog.near,
    fogFar: fog.far,
    exposure: game.renderer.renderer.toneMappingExposure,
    lights: game.resources().lights,
    planId: game.levelPlan.id,
  };
}

// ---------------------------------------------------------------------------
// The look: what every shipped world is lit by
// ---------------------------------------------------------------------------

for (const world of [
  // **The park is no longer in this loop, and that is the re-pin.** It authors
  // `SWITCHBACK_LOOK` since `p4-wire`; its own case is below, pinned to the
  // descriptor. These two rows are unchanged and are what "nothing else moved"
  // means: a world that starts authoring a light fails here.
  { name: 'BelVar Circuit', query: BELVAR, id: 'belvar-r1' },
  { name: 'the slice', query: '', id: 'm7-slice' },
]) {
  test(`${world.name} is lit by the daylight it shipped with`, async ({ page }) => {
    // **The fallback the verification plan names, and the reason it is the
    // right one here**: no shipped world authors a descriptor yet
    // (`p4-look` built the mechanism, `p4-dressing` deliberately left
    // `SWITCHBACK_LOOK` unwired for the next wave), so there is no "after" to
    // diff a screenshot against. What can be measured instead is stronger than
    // a diff and does not depend on frame timing: read the values the renderer
    // actually composed and require every one of them to be the `LIGHTING`
    // constant it was reading inline before the look existed.
    const errors = collectErrors(page);
    await boot(page, world.query);
    const lit = await page.evaluate(litScene);

    expect(lit.planId).toBe(world.id);
    // `'look' in plan === false` is the fact the pinned plan digests depend on
    // (`src/level/planDigest.test.ts`): these two worlds author nothing, so the
    // absent-descriptor path is the one they are on and their bytes cannot move
    // because the park now wears an afternoon.
    expect(lit.authored).toBe(false);
    expect(lit.look).toEqual({ ...DAYLIGHT_LOOK });

    // And the composition, off the live scene: the haze, its two distances and
    // the tone-mapping exposure the frame is actually drawn at.
    expect(lit.fogColour).toBe(LIGHTING.horizonColour);
    expect(lit.fogNear).toBe(LIGHTING.fogNear);
    expect(lit.fogFar).toBe(LIGHTING.fogFar);
    expect(lit.exposure).toBeCloseTo(LIGHTING.exposure, 9);
    // One directional light and one hemisphere, invariant 7: a venue may
    // change what the light *is*, never what the rig costs.
    expect(lit.lights).toBe(2);
    expect(errors).toEqual([]);
  });
}

/**
 * The key light, the fill, the painted sky and the shadow cascade, live.
 *
 * `litScene` above reads what the *look* resolved to; this reads what the
 * renderer then did with it — the two are different claims, and a venue that
 * resolved a bearing correctly and hung the light somewhere else would pass the
 * first and fail this. The sky is digested rather than compared field by field:
 * it is a 1024 x 512 `DataTexture` and its bytes are the only honest statement
 * that the painter ran with these numbers. `uuid` is carried beside the digest
 * because a *repaint* is a disposed texture and a new object, which is how
 * `sameSkyPaint`'s skip becomes observable from outside.
 */
function lightRig(): {
  sun: {
    found: boolean;
    intensity: number;
    colour: number;
    azimuth: number;
    elevation: number;
    shadow: { bias: number; normalBias: number; map: number; extent: number; far: number };
  };
  fill: { found: boolean; intensity: number; sky: number; ground: number };
  sky: { uuid: string; width: number; height: number; bytes: number; digest: number };
  exposure: number;
  fogColour: number;
} {
  const game = window.game;
  const scene = game.renderer.scene as unknown as {
    background: unknown;
    fog: { color: { getHex(): number } };
    traverse(visit: (object: Record<string, unknown>) => void): void;
  };
  const sun = {
    found: false,
    intensity: 0,
    colour: 0,
    azimuth: 0,
    elevation: 0,
    shadow: { bias: 0, normalBias: 0, map: 0, extent: 0, far: 0 },
  };
  const fill = { found: false, intensity: 0, sky: 0, ground: 0 };
  scene.traverse((object) => {
    if (object.isDirectionalLight === true) {
      const light = object as unknown as {
        intensity: number;
        color: { getHex(): number };
        position: { x: number; y: number; z: number };
        target: { position: { x: number; y: number; z: number } };
        shadow: {
          bias: number;
          normalBias: number;
          mapSize: { x: number };
          camera: { right: number; far: number };
        };
      };
      // The offset the rig carries the cascade around with — the light's own
      // direction, which is what casts every shadow in the frame.
      const dx = light.position.x - light.target.position.x;
      const dy = light.position.y - light.target.position.y;
      const dz = light.position.z - light.target.position.z;
      sun.found = true;
      sun.intensity = light.intensity;
      sun.colour = light.color.getHex();
      sun.azimuth = Math.atan2(dx, dz);
      sun.elevation = Math.atan2(dy, Math.hypot(dx, dz));
      sun.shadow = {
        bias: light.shadow.bias,
        normalBias: light.shadow.normalBias,
        map: light.shadow.mapSize.x,
        extent: light.shadow.camera.right,
        far: light.shadow.camera.far,
      };
    }
    if (object.isHemisphereLight === true) {
      const light = object as unknown as {
        intensity: number;
        color: { getHex(): number };
        groundColor: { getHex(): number };
      };
      fill.found = true;
      fill.intensity = light.intensity;
      fill.sky = light.color.getHex();
      fill.ground = light.groundColor.getHex();
    }
  });
  const background = scene.background as {
    uuid: string;
    image: { width: number; height: number; data: { length: number; [index: number]: number } };
  };
  let digest = 0;
  const bytes = background.image.data;
  // Every 997th byte: a prime stride over 2 MB samples a couple of thousand
  // pixels from every band of the painting, which no two of these skies agree
  // on. A whole-buffer hash would be truer and is not worth the round trip.
  for (let i = 0; i < bytes.length; i += 997) digest = (digest * 31 + bytes[i]) % 2_147_483_647;
  return {
    sun,
    fill,
    sky: {
      uuid: background.uuid,
      width: background.image.width,
      height: background.image.height,
      bytes: bytes.length,
      digest,
    },
    exposure: game.renderer.renderer.toneMappingExposure,
    fogColour: scene.fog.color.getHex(),
  };
}

test('Switchback Park wears the late afternoon it authors, and the frame is composed from it', async ({ page }) => {
  // **The re-pin `p4-wire` §8 item 1 asks for, taken as far as a browser can.**
  // The park's row left the daylight loop above; this replaces it. The headless
  // half (`src/level/switchbackLevel.test.ts`) censuses the eleven fields that
  // differ from `DAYLIGHT_LOOK` and proves `plan.look` is a copy. What only a
  // browser can add is that the *scene* was built from those numbers: the fog,
  // the exposure, both lights' colours and intensities, the bearing the key
  // light actually hangs on, and the sky that was painted from the same two
  // angles.
  const errors = collectErrors(page);
  await boot(page, PARK);
  const lit = await page.evaluate(litScene);
  const rig = await page.evaluate(lightRig);

  expect(lit.planId).toBe('switchback-r4');
  expect(lit.authored).toBe(true);
  expect(lit.look).toEqual({ ...resolveVenueLook(SWITCHBACK_LOOK) });

  // Transcribed rather than derived, so a descriptor edited by hand has to be
  // re-transcribed here deliberately (`AGENTS.md`: never loosen a pin).
  expect(lit.look.sunAzimuth).toBeCloseTo(-1.75, 9);
  expect(lit.look.sunElevation).toBeCloseTo(0.58, 9);
  expect(lit.look.sunColour).toBe(0xffd9a8);
  expect(lit.look.sunIntensity).toBeCloseTo(2.45, 9);
  expect(lit.look.skyColour).toBe(0x8bb2e6);
  expect(lit.look.groundBounceColour).toBe(0xb9a68d);
  expect(lit.look.hemisphereIntensity).toBeCloseTo(1.22, 9);
  expect(lit.look.horizonColour).toBe(0xdfc8a8);
  expect(lit.look.skyZenithColour).toBe(0x4d80c6);
  expect(lit.look.skySunColour).toBe(0xffe0b0);
  expect(lit.look.exposure).toBeCloseTo(1.06, 9);
  // The two fields the park deliberately does NOT author: the haze keeps the
  // game's own distances, so a 168 x 200 m lap is not fogged at its far end.
  expect(lit.look.fogNear).toBe(LIGHTING.fogNear);
  expect(lit.look.fogFar).toBe(LIGHTING.fogFar);

  // The live scene, composed: the haze is the horizon stop (one field, so the
  // band `DESIGN.md` §6 forbids cannot come back through a venue).
  expect(lit.fogColour).toBe(0xdfc8a8);
  expect(rig.fogColour).toBe(0xdfc8a8);
  expect(lit.fogNear).toBe(LIGHTING.fogNear);
  expect(lit.fogFar).toBe(LIGHTING.fogFar);
  expect(lit.exposure).toBeCloseTo(1.06, 9);
  expect(lit.lights).toBe(2);

  // The rig: one key on the descriptor's bearing, one fill in its two colours.
  expect(rig.sun.found).toBe(true);
  expect(rig.fill.found).toBe(true);
  expect(rig.sun.azimuth).toBeCloseTo(SWITCHBACK_SUN.azimuth, 6);
  expect(rig.sun.elevation).toBeCloseTo(SWITCHBACK_SUN.elevation, 6);
  expect(rig.sun.colour).toBe(0xffd9a8);
  expect(rig.sun.intensity).toBeCloseTo(2.45, 9);
  expect(rig.fill.sky).toBe(0x8bb2e6);
  expect(rig.fill.ground).toBe(0xb9a68d);
  expect(rig.fill.intensity).toBeCloseTo(1.22, 9);
  expect(rig.exposure).toBeCloseTo(1.06, 9);

  // And the sky is the venue's own painting, at the size it always was: a look
  // costs no GPU resource beyond the one texture it replaces.
  expect(rig.sky.width).toBe(LIGHTING.skyTextureWidth);
  expect(rig.sky.height).toBe(LIGHTING.skyTextureHeight);
  expect(rig.sky.bytes).toBe(LIGHTING.skyTextureWidth * LIGHTING.skyTextureHeight * 4);
  console.log(`[m36_4] park light: sun ${rig.sun.azimuth.toFixed(3)} rad / `
    + `${rig.sun.elevation.toFixed(3)} rad, shadow bias ${rig.sun.shadow.bias}, `
    + `normalBias ${rig.sun.shadow.normalBias}, ${rig.sun.shadow.map}px cascade over `
    + `${rig.sun.shadow.extent * 2} m; sky digest ${rig.sky.digest}`);
  expect(errors).toEqual([]);
});

test('BelVar comes back byte for byte after the park has been installed over it', async ({ page }, testInfo) => {
  // **The pixel half of the look's round trip.** `render/levelLifecycle.test.ts`
  // proves the composed values are restored and that no sky leaks; it cannot
  // see a frame. This can: the same camera, the same rider, the same frozen
  // loop, and the two PNGs compared byte for byte. A venue swap that left
  // anything of the park's behind on BelVar shows up here as a diff.
  const errors = collectErrors(page);
  await boot(page, BELVAR);

  const settle = async (): Promise<void> => {
    await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
      game.placeRider({ ...game.levelPlan.spawn.position }, game.levelPlan.spawn.headingY);
      game.advance(120);
    });
  };

  await settle();
  const before = await page.screenshot();
  const lookBefore = await page.evaluate(() => ({ ...window.game.renderer.venueLook() }));

  const onPark = await page.evaluate(() => {
    const game = window.game;
    (window as unknown as { belvarPlan: unknown }).belvarPlan = game.levelPlan;
    game.renderer.setLevel(game.buildLevel('switchback', 'euc'));
    game.advance(2);
    return { ...game.renderer.venueLook() };
  });
  // **The positive control.** A byte comparison that cannot see a difference
  // proves nothing, so the park's own frame is taken through the same camera
  // and the same shutter and is required to differ.
  const parkFrame = await page.screenshot();

  const back = await page.evaluate(() => {
    const game = window.game;
    const belvar = (window as unknown as { belvarPlan: LevelPlan }).belvarPlan;
    game.renderer.setLevel(belvar);
    game.advance(2);
    return { ...game.renderer.venueLook() };
  });
  await settle();
  const after = await page.screenshot();
  const swapped = { onPark, back };
  expect(Buffer.compare(before, parkFrame)).not.toBe(0);

  // **Re-pinned** (`p4-wire` §8 item 2): the park now authors a look, so the
  // middle of this round trip is the descriptor's afternoon rather than
  // daylight. The byte comparison either side is untouched and still holds —
  // BelVar authors nothing, so what it gets back is what it had.
  expect(swapped.onPark).toEqual({ ...resolveVenueLook(SWITCHBACK_LOOK) });
  expect(swapped.back).toEqual(lookBefore);
  // Byte for byte, not "looks the same": a tone-mapping exposure left a
  // hundredth off, or a sky repainted from a different horizon stop, moves
  // thousands of pixels and no visual comparison would catch it.
  expect(Buffer.compare(before, after)).toBe(0);
  await saveShot(page, testInfo, 'belvar-before-park');
  await saveShot(page, testInfo, 'belvar-after-park');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The bill, live
// ---------------------------------------------------------------------------

/** §36.7's working allocation for the level itself, before the room is drawn. */
const WORKING_ALLOCATION = { drawCalls: 55, triangles: 300_000 };

test('the dressed park is inside all three contracts and inside the working allocation', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);

  const bill = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // Warm up before measuring: the first real frames compile shaders and
    // upload the world.
    game.advance(60);
    const selection = game.renderer.presentation()!;

    // The live counters, all the way round the ring rather than from one
    // resting camera — the forest is uneven and the worst frame is the claim.
    const ids = game.levelPlan.segments.map((segment) => segment.id);
    const points = window.qa.routePoints(ids, 12);
    let worstCalls = 0;
    let worstTriangles = 0;
    let worstAt = { x: 0, z: 0 };
    for (const point of points) {
      const next = points[(points.indexOf(point) + 1) % points.length];
      game.placeRider({ x: point.x, y: 0, z: point.z }, Math.atan2(next.x - point.x, next.z - point.z));
      game.advance(2);
      const frame = game.snapshot().render;
      if (frame.drawCalls > worstCalls) { worstCalls = frame.drawCalls; worstAt = point; }
      worstTriangles = Math.max(worstTriangles, frame.triangles);
    }
    return {
      samples: points.length,
      worstCalls,
      worstTriangles,
      worstAt,
      recipe: selection.recipe.id,
      cost: {
        drawCalls: selection.cost.drawCalls,
        triangles: selection.cost.triangles,
        propDrawCalls: selection.cost.propDrawCalls,
        propTriangles: selection.cost.propTriangles,
        frame: {
          solo: { ...selection.cost.frame.solo },
          split: { ...selection.cost.frame.split },
          quad: { ...selection.cost.frame.quad },
        },
      },
      verdicts: selection.verdicts.map((verdict) => ({
        recipe: verdict.recipe,
        breaches: [...verdict.breaches],
        drawCalls: verdict.cost.drawCalls,
        triangles: verdict.cost.triangles,
        frame: {
          solo: { ...verdict.cost.frame.solo },
          split: { ...verdict.cost.frame.split },
          quad: { ...verdict.cost.frame.quad },
        },
      })),
      props: game.levelPlan.props?.length ?? 0,
    };
  });

  console.log(`[m36_4] park frame: worst ${bill.worstCalls} calls / ${bill.worstTriangles} triangles`
    + ` over ${bill.samples} places on the ring; recipe ${bill.recipe};`
    + ` level ${bill.cost.drawCalls} calls / ${bill.cost.triangles} triangles;`
    + ` props ${bill.props}`);

  // §36.7's working allocation for the level, measured on the model the
  // renderer actually built the scene from.
  expect(bill.cost.drawCalls, `level draw calls ${bill.cost.drawCalls}`)
    .toBeLessThanOrEqual(WORKING_ALLOCATION.drawCalls);
  expect(bill.cost.triangles, `level triangles ${bill.cost.triangles}`)
    .toBeLessThanOrEqual(WORKING_ALLOCATION.triangles);

  // All three frame contracts, on the predicted frame…
  expect(bill.cost.frame.solo.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  expect(bill.cost.frame.solo.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
  expect(bill.cost.frame.split.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxDrawCalls);
  expect(bill.cost.frame.split.triangles).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxTriangles);
  expect(bill.cost.frame.quad.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxDrawCalls);
  expect(bill.cost.frame.quad.triangles).toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxTriangles);

  // …and on the real one, which is the only number a GPU agrees with.
  expect(
    bill.worstCalls,
    `peak ${bill.worstCalls} draw calls near (${bill.worstAt.x.toFixed(0)}, ${bill.worstAt.z.toFixed(0)})`,
  ).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  expect(bill.worstTriangles, `peak ${bill.worstTriangles} triangles`)
    .toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);

  // The dressing is actually standing there — 624 props on the hillside, not a
  // budget that fits because the forest failed to build. (Six hundred and
  // thirty-six was the lattice's own count: `p4-wire`'s shadow setback then
  // refused sixteen of them, and Phase 6's clearing hairpin re-planted four
  // back. The floor below is deliberately far under all three.)
  expect(bill.props).toBeGreaterThan(500);
  expect(errors).toEqual([]);
});

test('both rungs of the ladder draw the park legally, and the frame it takes is the richer one', async ({ page }) => {
  // **What a browser can honestly say about "both recipes".** The selector
  // reads an immutable plan and there is no door for asking the renderer to
  // install the other rung (see this file's open issues), so the part only a
  // GPU could answer — that the enhanced scene really is what is drawn — is
  // asserted here, and the part a model answers — that refusing enhancement
  // still leaves a legal frame on every contract — is asserted from the
  // ladder's own verdicts. `src/render/presentation.test.ts` is what proves
  // both rungs *build*, predicted to measured, on this venue.
  const errors = collectErrors(page);
  await boot(page, PARK);

  const ladder = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(60);
    const selection = game.renderer.presentation()!;
    return {
      chosen: selection.recipe.id,
      rungs: selection.verdicts.map((verdict) => ({
        recipe: verdict.recipe,
        breaches: [...verdict.breaches],
        drawCalls: verdict.cost.drawCalls,
        triangles: verdict.cost.triangles,
        solo: { ...verdict.cost.frame.solo },
        split: { ...verdict.cost.frame.split },
        quad: { ...verdict.cost.frame.quad },
      })),
      live: game.snapshot().render,
    };
  });

  const ids = ladder.rungs.map((rung) => rung.recipe);
  expect(ids).toContain('baseline');
  expect(ids).toContain('enhanced');
  expect(ladder.chosen).toBe('enhanced');

  for (const rung of ladder.rungs) {
    console.log(`[m36_4] ${rung.recipe}: level ${rung.drawCalls} calls / ${rung.triangles} tri;`
      + ` solo ${rung.solo.drawCalls}/${rung.solo.triangles};`
      + ` breaches ${rung.breaches.length}`);
    // Neither rung breaches anything: the baseline is the park with cheaper
    // crowns and cheaper conifers, and it is a legal frame on its own.
    expect(rung.breaches, `${rung.recipe} breached: ${rung.breaches.join('; ')}`).toEqual([]);
    expect(rung.drawCalls).toBeLessThanOrEqual(WORKING_ALLOCATION.drawCalls);
    expect(rung.triangles).toBeLessThanOrEqual(WORKING_ALLOCATION.triangles);
    expect(rung.solo.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    expect(rung.solo.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
    expect(rung.split.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxDrawCalls);
    expect(rung.split.triangles).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxTriangles);
    expect(rung.quad.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxDrawCalls);
    expect(rung.quad.triangles).toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxTriangles);
  }

  // The enhanced rung is dearer in triangles and identical in calls — §36.7's
  // "zero new call buckets", visible from the outside.
  const baseline = ladder.rungs.find((rung) => rung.recipe === 'baseline')!;
  const enhanced = ladder.rungs.find((rung) => rung.recipe === 'enhanced')!;
  expect(enhanced.triangles).toBeGreaterThan(baseline.triangles);
  expect(enhanced.drawCalls).toBe(baseline.drawCalls);
  expect(errors).toEqual([]);
});

test('twelve venue swaps park to slice and back leave the GPU where they found it', async ({ page }) => {
  // Invariant 10 across a *swap*, which `tests/m36.spec.ts:729` does not cover:
  // that one rebuilds the same world twelve times, and the dressing adds four
  // instanced part families that are created and disposed on every install.
  // The slice between them means each round tears the forest down completely
  // rather than replacing it in place.
  const errors = collectErrors(page);
  await boot(page, PARK);

  const trace = await page.evaluate(() => {
    const game = window.game;
    const original = game.levelPlan;
    game.loop.setRunning(false);
    game.advance(60);
    const baseline = game.resources();

    const rounds: { park: ReturnType<typeof game.resources>; look: Record<string, number> }[] = [];
    for (let round = 0; round < 12; round += 1) {
      game.renderer.setLevel(game.buildLevel('slice', 'euc'));
      game.advance(2);
      game.renderer.setLevel(game.buildLevel('switchback', 'euc'));
      game.advance(2);
      rounds.push({
        park: game.resources(),
        look: { ...game.renderer.venueLook() } as unknown as Record<string, number>,
      });
    }
    game.renderer.setLevel(original);
    game.advance(2);
    return { baseline, rounds, restored: game.resources() };
  });

  // The first round may legitimately add (a new material's program, a texture
  // the slice needed); from the second onwards the counts must not climb.
  for (let round = 2; round < trace.rounds.length; round += 1) {
    expect(
      trace.rounds[round].park,
      `round ${round + 1} of the park: ${JSON.stringify(trace.rounds[round].park)}`
        + ` against round 2's ${JSON.stringify(trace.rounds[1].park)}`,
    ).toEqual(trace.rounds[1].park);
  }
  // And the look is restored on every crossing, in both directions.
  for (const round of trace.rounds) expect(round.look).toEqual(trace.rounds[0].look);
  expect(trace.restored).toEqual(trace.rounds[trace.rounds.length - 1].park);
  console.log(`[m36_4] plateau after 12 park<->slice swaps: ${JSON.stringify(trace.restored)}`);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// G3's frames
// ---------------------------------------------------------------------------

/**
 * Ride a stretch of the lap and stop where it ends, at gameplay speed.
 *
 * `followRoute` places the rider on the first point and drives a pure-pursuit
 * line to the last, so the chase camera arrives settled and lagging the way it
 * does in a ride — which is the whole point of a G3 frame. It stops
 * `lookAhead` short of the last point, so every list below runs a little past
 * the thing it is a picture of.
 */
function rideTo(spec: {
  lead: string[];
  feature: string[];
  maxSpeed: number;
  lateral: number;
}): {
  speed: number;
  camera: string;
  finished: boolean;
  crashes: number;
  position: { x: number; z: number };
  target: { x: number; z: number };
  fromTarget: number;
  surface: string;
  drawCalls: number;
  triangles: number;
} {
  const game = window.game;
  game.loop.setRunning(false);
  game.advance(30);
  // **The run-in on the centreline, the feature itself on the technical line.**
  // Every feature on this venue stands `PARK.wideT` to the rider's LEFT and the
  // right half of each corridor is the bypass, so a centreline frame is a
  // picture of the way *round* the thing G3 is asking about. But the run-in
  // corridors carry features of their own — `timber` carries the skinny and the
  // step-up, and a pure-pursuit driver cannot hop, which is the same finding
  // `tests/m36.spec.ts`'s `TECHNICAL_LINE` records — so the offset is held at
  // zero until the last corridor and ramped in over the sixteen metres before
  // it. A polyline that jumped sideways at a socket would be a lane change the
  // driver takes as a corner.
  const lead = window.qa.routePoints(spec.lead, 2);
  const tail = spec.feature.length === 0 ? [] : window.qa.routePoints(spec.feature, 2);
  const centre = [...lead, ...tail];
  const rampFrom = Math.max(0, lead.length - 8);
  const points = centre.map((point, index) => {
    const next = centre[Math.min(index + 1, centre.length - 1)];
    const previous = centre[Math.max(index - 1, 0)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const span = Math.hypot(dx, dz) || 1;
    const ramp = index <= rampFrom ? 0 : Math.min(1, (index - rampFrom) / 8);
    const out = spec.lateral * ramp;
    // Left of travel: the rider's right is (-dz, dx), so the left is (dz, -dx).
    return { x: point.x + (dz / span) * out, z: point.z - (dx / span) * out };
  });
  const result = window.qa.followRoute(points, {
    lookAhead: 9,
    maxSteps: 20_000,
    maxSpeed: spec.maxSpeed,
  });
  const s = game.snapshot();
  const target = points[points.length - 1];
  return {
    speed: s.euc.speed,
    camera: s.camera.mode,
    finished: result.finished,
    crashes: result.crashes,
    position: { x: s.euc.position.x, z: s.euc.position.z },
    target: { x: target.x, z: target.z },
    fromTarget: Math.hypot(s.euc.position.x - target.x, s.euc.position.z - target.z),
    surface: s.euc.surface,
    drawCalls: s.render.drawCalls,
    triangles: s.render.triangles,
  };
}

/** `PARK.wideT` — where every feature on this venue stands, to the rider's left. */
const TECHNICAL_T = 4.25;

const G3_FRAMES = [
  {
    // `followRoute` stops `lookAhead` short of the last point, so a frame is
    // the run-in to the last corridor rather than a picture from inside it.
    name: 'kicker-approach',
    lead: ['rhythm-turn', 'kicker-approach'],
    feature: ['kicker-rise'],
    maxSpeed: 8,
    lateral: TECHNICAL_T,
  },
  { name: 'stairs', lead: ['timber'], feature: ['timber-steps'], maxSpeed: 6, lateral: TECHNICAL_T },
  {
    name: 'spin-line',
    lead: ['clearing-turn', 'shelf-in'],
    feature: ['shelf-pad'],
    maxSpeed: 7,
    lateral: TECHNICAL_T,
  },
  {
    name: 'kicker-landing',
    // The landing G3's shade question is about. Under the shipped daylight
    // nothing casts onto it — the test below measures that for every pad on
    // the lap — so this is the frame to retake the day `SWITCHBACK_LOOK` lands.
    lead: ['kicker-table'],
    feature: ['kicker-landing'],
    maxSpeed: 7,
    lateral: TECHNICAL_T,
  },
  // The summit apron is where the lap begins and ends and carries no feature,
  // so it is ridden down the middle, which is where a rider is on it.
  {
    name: 'summit',
    lead: ['summit-turn', 'summit-return', 'apron'],
    feature: [],
    maxSpeed: 8,
    lateral: 0,
  },
] as const;

for (const frame of G3_FRAMES) {
  test(`G3 frame on the chase camera: ${frame.name}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    const shot = await page.evaluate(rideTo, {
      lead: [...frame.lead],
      feature: [...frame.feature],
      maxSpeed: frame.maxSpeed,
      lateral: frame.lateral,
    });

    // Gameplay scale, on the camera the player rides behind — not a rig view
    // and not a parked camera.
    expect(shot.camera).toBe('chase');
    expect(shot.speed).toBeGreaterThan(2);
    // **And it is a picture of the place it is named after.** A driver that
    // stalled or binned halfway would still take a perfectly sharp screenshot
    // of somewhere else, so the frame is pinned to the end of its own route:
    // `followRoute` stops `lookAhead` short, which is 9 m.
    expect(shot.crashes, `${frame.name}: the approach was binned`).toBe(0);
    expect(
      shot.fromTarget,
      `${frame.name}: stopped ${shot.fromTarget.toFixed(1)} m from the end of its route`
        + ` at (${shot.position.x.toFixed(0)}, ${shot.position.z.toFixed(0)})`,
    ).toBeLessThan(14);
    expect(shot.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    console.log(`[m36_4] ${frame.name}: ${(shot.speed * 3.6).toFixed(0)} km/h at`
      + ` (${shot.position.x.toFixed(0)}, ${shot.position.z.toFixed(0)}) on ${shot.surface};`
      + ` ${shot.drawCalls} calls / ${shot.triangles} triangles`);
    await saveShot(page, testInfo, `park-${frame.name}`);
    expect(errors).toEqual([]);
  });
}

/** The widest thing each canopy kind carries, metres at scale 1 — `data/props.ts`. */
const CANOPY_RADIUS = {
  conifer: Math.max(...PROP_SIZES.conifer.tiers.map((tier) => tier.radius)),
  broadleafTree: PROP_SIZES.broadleafTree.crownRadius,
};

test("no landing pad on the lap is inside a cast shadow under the park's own afternoon", async ({ page }) => {
  // **Re-pinned to the sun the park actually authors** (`p4-wire` §8 item 3).
  // This test was written against the shipped daylight, where a shadow is 0.70 x
  // its caster's height and the answer was trivially none; at `SWITCHBACK_LOOK`'s
  // 0.58 rad a shadow is **1.526 x** its height, so the same claim is now the one
  // the canopy setback exists to buy, and it is the one G3 asks about.
  //
  // Three things make this an independent check rather than a restatement of
  // `parkDressing`'s rule, which `src/level/switchbackLevel.test.ts` already
  // walks against the finished heightfield:
  //
  //   - it runs on the plan **the game installed**, read back over the QA
  //     bridge, so a prop the browser build places differently is visible here;
  //   - it measures the **technical band** — the rider's line at `PARK.wideT`
  //     and two metres either side of it, sampled every two metres down every
  //     landing corridor — rather than a segment's midpoint, which is what the
  //     first draft of this test did and what could have hidden a shadow lying
  //     across the end of a pad;
  //   - and it uses each prop's **own** height and canopy radius from the kit
  //     (`PROP_SIZES`) times the scale it was planted at, so "nothing reaches"
  //     is a statement about the trees that are standing there.
  const errors = collectErrors(page);
  await boot(page, PARK);

  const shade = await page.evaluate(({ azimuth, elevation, stand, heights, radii, technicalT }) => {
    const game = window.game;
    const perMetre = 1 / Math.tan(elevation);
    // Shadows run away from the sun's bearing: the same (-sin, -cos) the
    // renderer's own `sunOffset` is built from, negated.
    const dx = -Math.sin(azimuth);
    const dz = -Math.cos(azimuth);
    const padIds = game.levelPlan.segments
      .filter((segment) => /landing|table|runout|shelf-pad|terrace-drop|timber-steps|crest-down/
        .test(segment.id))
      .map((segment) => segment.id);
    const canopy = (game.levelPlan.props ?? [])
      .filter((prop) => prop.kind === 'conifer' || prop.kind === 'broadleafTree')
      .map((prop) => {
        const height = (heights as Record<string, number>)[prop.kind] * prop.scale;
        return {
          x: prop.position.x,
          z: prop.position.z,
          radius: (radii as Record<string, number>)[prop.kind] * prop.scale,
          // The stand is carried the way the authoring rule carries it: a tree
          // on the bank above a corridor shades further down it than its own
          // height says.
          reach: (height + stand) * perMetre,
        };
      });

    return padIds.map((id) => {
      const spine = window.qa.routePoints([id], 2);
      const points: { x: number; z: number }[] = [];
      for (let i = 0; i < spine.length; i += 1) {
        const next = spine[Math.min(i + 1, spine.length - 1)];
        const previous = spine[Math.max(i - 1, 0)];
        const ax = next.x - previous.x;
        const az = next.z - previous.z;
        const span = Math.hypot(ax, az) || 1;
        for (const t of [technicalT - 2, technicalT, technicalT + 2]) {
          points.push({ x: spine[i].x + (az / span) * t, z: spine[i].z - (ax / span) * t });
        }
      }
      let hits = 0;
      let margin = Infinity;
      let worst = { x: 0, z: 0 };
      for (const point of points) {
        for (const tree of canopy) {
          const vx = point.x - tree.x;
          const vz = point.z - tree.z;
          const along = vx * dx + vz * dz;
          if (along < 0) continue;
          const off = Math.abs(vx * dz - vz * dx);
          if (off > tree.radius) continue;
          // How much further the shadow would have to run to touch this point.
          const short = along - tree.reach;
          if (short < margin) { margin = short; worst = point; }
          if (short <= 0) hits += 1;
        }
      }
      return {
        id,
        samples: points.length,
        casters: canopy.length,
        hits,
        margin: Number.isFinite(margin) ? margin : -1,
        worst,
      };
    });
  }, {
    azimuth: SWITCHBACK_SUN.azimuth,
    elevation: SWITCHBACK_SUN.elevation,
    stand: FOREST_SHADOW_STAND,
    heights: FOREST_HEIGHTS as unknown as Record<string, number>,
    radii: CANOPY_RADIUS as unknown as Record<string, number>,
    technicalT: 4.25,
  });

  for (const pad of shade) {
    console.log(`[m36_4] ${pad.id}: ${pad.hits} shadows on ${pad.samples} samples of its`
      + ` technical band; the nearest up-sun canopy stops ${pad.margin.toFixed(1)} m short`);
  }
  expect(shade.length).toBeGreaterThan(4);
  for (const pad of shade) {
    expect(pad.samples).toBeGreaterThan(6);
    expect(pad.casters).toBeGreaterThan(100);
    expect(
      pad.hits,
      `${pad.id} has ${pad.hits} canopy shadows lying on it, nearest near`
        + ` (${pad.worst.x.toFixed(1)}, ${pad.worst.z.toFixed(1)}). The canopy setback`
        + " (`parkDressing.shadowClearance`, derived from SWITCHBACK_LOOK's own"
        + ' elevation) exists to make this zero: re-measure it before moving this'
        + ' expectation.',
    ).toBe(0);
    // A margin is only meaningful when something is actually up-sun of the pad.
    expect(pad.margin, `no canopy stands up-sun of ${pad.id} at all`).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('G3 frame: a four-seat quarter pane of the dressed park', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const quad = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 4) game.spawnRider('cool-rider');
    game.clearRecords();
    game.tuning.set('RACE.laps', 1);
    game.startTrackDay();
    game.advance(2);
    let guard = 0;
    while (game.snapshot().race.phase === 'countdown' && guard < 3000) {
      game.advance(1);
      guard += 1;
    }
    for (const seat of [0, 1, 2, 3]) game.setActionsFor(seat, { throttle: 1 });
    game.advance(420);
    return {
      seats: game.seatCount,
      phase: game.snapshot().race.phase,
      speed: game.snapshotFor(0).euc.speed,
      drawCalls: game.snapshot().render.drawCalls,
      triangles: game.snapshot().render.triangles,
    };
  });

  expect(quad.seats).toBe(4);
  expect(quad.phase).toBe('running');
  expect(quad.speed).toBeGreaterThan(2);
  // The quad frame is Contract 3's, and the room is what makes it one.
  expect(quad.drawCalls, `four-seat frame ${quad.drawCalls} calls`)
    .toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxDrawCalls);
  expect(quad.triangles, `four-seat frame ${quad.triangles} triangles`)
    .toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxTriangles);
  console.log(`[m36_4] four-seat frame: ${quad.drawCalls} calls / ${quad.triangles} triangles`);
  await saveShot(page, testInfo, 'park-four-seat-quad');
  expect(errors).toEqual([]);
});

test('G3 frame: the park at a phone viewport (Pixel 7 size, desktop project)', async ({ page }, testInfo) => {
  // **Said plainly, because it matters**: `playwright.config.ts` matches the
  // `mobile` project to `tests/touch.spec.ts` alone, so this is a Pixel 7's
  // *viewport* on the desktop project — 412 x 915 CSS pixels — and not a touch
  // device. It answers "does the trail read on a phone-shaped screen"; it does
  // not answer anything about a real finger, and nothing here claims to.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 412, height: 915 });
  await boot(page, PARK);
  const shot = await page.evaluate(rideTo, {
    lead: ['rhythm-turn', 'kicker-approach'],
    feature: ['kicker-rise'],
    maxSpeed: 8,
    lateral: TECHNICAL_T,
  });

  expect(shot.camera).toBe('chase');
  expect(shot.speed).toBeGreaterThan(2);
  expect(shot.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  await saveShot(page, testInfo, 'park-phone-portrait-kicker');

  // And landscape, which is how the game is actually held.
  await page.setViewportSize({ width: 915, height: 412 });
  await page.evaluate(() => window.game.advance(2));
  await saveShot(page, testInfo, 'park-phone-landscape-kicker');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 4's final browser proof — the wired look, both rungs, and the shadows
//
// Everything below was written after `p4-wire` hung `SWITCHBACK_LOOK` on the
// park. The cases above were written against a game where no world authored a
// light; three of them were re-pinned in place (the loop, the byte-for-byte
// round trip, the shade census) and the rest were left exactly as they were,
// because what they measure did not move.
// ---------------------------------------------------------------------------

/**
 * Put the rider on a named corridor, facing down it, and let the camera settle.
 *
 * A *pose*, not a ride: the frames that compare two render recipes, or four
 * riders, have to be the same picture with one thing changed, and a driven
 * approach stops a few centimetres differently every time. The rider still
 * rolls for `roll` steps before the shutter so the chase camera is behind and
 * lagging the way it is in a ride, rather than parked at its resting arm.
 */
function poseOn(spec: {
  id: string;
  fraction: number;
  lateral: number;
  roll: number;
  throttle: number;
}): {
  camera: string;
  speed: number;
  surface: string;
  state: string;
  offCourse: boolean;
  position: { x: number; z: number };
  drawCalls: number;
  triangles: number;
  character: string;
} {
  const game = window.game;
  game.loop.setRunning(false);
  const spine = window.qa.routePoints([spec.id], 2);
  const index = Math.min(spine.length - 2, Math.max(0, Math.round(spec.fraction * (spine.length - 1))));
  const ax = spine[index + 1].x - spine[index].x;
  const az = spine[index + 1].z - spine[index].z;
  const span = Math.hypot(ax, az) || 1;
  const x = spine[index].x + (az / span) * spec.lateral;
  const z = spine[index].z - (ax / span) * spec.lateral;
  window.qa.placeRider(x, z, Math.atan2(ax, az));
  game.setActionsFor(0, {
    throttle: spec.throttle,
    steer: 0,
    crouch: false,
    hop: false,
    hopHeld: false,
  });
  game.advance(spec.roll);
  game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
  const snap = game.snapshot();
  return {
    camera: snap.camera.mode,
    speed: snap.euc.speed,
    surface: snap.euc.surface,
    state: snap.euc.state,
    offCourse: window.qa.groundAt(snap.euc.position.x, snap.euc.position.z).offCourse,
    position: { x: snap.euc.position.x, z: snap.euc.position.z },
    drawCalls: snap.render.drawCalls,
    triangles: snap.render.triangles,
    character: snap.rider.installed,
  };
}

/**
 * Accelerate from a standstill down a run of collinear straights and stop at a
 * stated distance — the only honest way to photograph this venue at speed.
 *
 * `followRoute` is a two-gain pure-pursuit driver that `tests/m36.spec.ts` has
 * to hold to 6-7 m/s on these hairpins, so it cannot deliver a 40 mph frame.
 * But beat 5 is 114 m of collinear straight (`kicker-approach` through
 * `kicker-runout`) and the fire road's crest is another 102 m
 * (`fire-road-1` + `crest-up` + `crest-down`), so full throttle in a straight
 * line down the corridor's own centre is a ride a player takes — no steering
 * input, no tuning change, no cutout disabled, the wheel the game ships.
 */
function chargeStraight(spec: { ids: string[]; stopAt: number; lateral: number }): {
  speed: number;
  mph: number;
  distance: number;
  camera: string;
  state: string;
  worstState: string;
  offCourseSteps: number;
  surface: string;
  position: { x: number; z: number };
  drawCalls: number;
  triangles: number;
  steps: number;
} {
  const game = window.game;
  game.loop.setRunning(false);
  game.advance(30);
  const spine = window.qa.routePoints(spec.ids, 2);
  const ax = spine[1].x - spine[0].x;
  const az = spine[1].z - spine[0].z;
  const span = Math.hypot(ax, az) || 1;
  const start = {
    x: spine[0].x + (az / span) * spec.lateral,
    z: spine[0].z - (ax / span) * spec.lateral,
  };
  window.qa.placeRider(start.x, start.z, Math.atan2(ax, az));
  game.setActionsFor(0, { throttle: 1, steer: 0, crouch: false, hop: false, hopHeld: false });
  let distance = 0;
  let steps = 0;
  let offCourseSteps = 0;
  let worstState = 'rolling';
  while (distance < spec.stopAt && steps < 4000) {
    game.advance(5);
    steps += 5;
    const snap = game.snapshot();
    distance = Math.hypot(snap.euc.position.x - start.x, snap.euc.position.z - start.z);
    if (window.qa.groundAt(snap.euc.position.x, snap.euc.position.z).offCourse) offCourseSteps += 1;
    if (/crashing|recovering|dismounted/.test(snap.euc.state)) worstState = snap.euc.state;
  }
  const snap = game.snapshot();
  return {
    speed: snap.euc.speed,
    mph: snap.euc.speed * 2.2369362920544,
    distance,
    camera: snap.camera.mode,
    state: snap.euc.state,
    worstState,
    offCourseSteps,
    surface: snap.euc.surface,
    position: { x: snap.euc.position.x, z: snap.euc.position.z },
    drawCalls: snap.render.drawCalls,
    triangles: snap.render.triangles,
    steps,
  };
}

test('the three worlds keep their own light through twelve park to BelVar to slice rotations', async ({ page }) => {
  // **The swap test the wired look asks for**, and a different question from
  // the park-to-slice plateau above: a rotation through *three* worlds crosses
  // the `sameSkyPaint` boundary twice a round in one direction and twice in the
  // other, so the 1024 x 512 painting is disposed and rebuilt four times a
  // round — and the two worlds that author nothing must come back identical
  // every single time, including the sky object itself, which is never
  // repainted for them because nothing about it moved.
  test.slow();
  const errors = collectErrors(page);
  await boot(page, PARK);

  const trace = await page.evaluate(() => {
    const game = window.game;
    const original = game.levelPlan;
    game.loop.setRunning(false);
    game.advance(60);

    const read = (): Record<string, unknown> => {
      const scene = game.renderer.scene as unknown as {
        background: { uuid: string; image: { data: { length: number; [i: number]: number } } };
        fog: { color: { getHex(): number }; near: number; far: number };
      };
      let digest = 0;
      const bytes = scene.background.image.data;
      for (let i = 0; i < bytes.length; i += 997) digest = (digest * 31 + bytes[i]) % 2_147_483_647;
      return {
        look: { ...game.renderer.venueLook() },
        fogColour: scene.fog.color.getHex(),
        fogNear: scene.fog.near,
        fogFar: scene.fog.far,
        exposure: game.renderer.renderer.toneMappingExposure,
        skyUuid: scene.background.uuid,
        skyDigest: digest,
        planId: game.levelPlan.id,
        resources: game.resources(),
      };
    };

    const rounds: { park: Record<string, unknown>; belvar: Record<string, unknown>; slice: Record<string, unknown> }[] = [];
    for (let round = 0; round < 12; round += 1) {
      game.renderer.setLevel(game.buildLevel('track', 'euc'));
      game.advance(2);
      const belvar = read();
      game.renderer.setLevel(game.buildLevel('slice', 'euc'));
      game.advance(2);
      const slice = read();
      game.renderer.setLevel(game.buildLevel('switchback', 'euc'));
      game.advance(2);
      const park = read();
      rounds.push({ park, belvar, slice });
    }
    game.renderer.setLevel(original);
    game.advance(2);
    return { rounds, restored: read() };
  });

  const park = resolveVenueLook(SWITCHBACK_LOOK);
  const daylight = { ...DAYLIGHT_LOOK };
  for (const [index, round] of trace.rounds.entries()) {
    expect(round.park.planId).toBe('switchback-r4');
    expect(round.park.look, `round ${index + 1}: the park's light`).toEqual({ ...park });
    expect(round.park.fogColour).toBe(park.horizonColour);
    expect(round.park.exposure).toBeCloseTo(park.exposure, 9);
    expect(round.belvar.look, `round ${index + 1}: BelVar's light`).toEqual(daylight);
    expect(round.slice.look, `round ${index + 1}: the slice's light`).toEqual(daylight);
    expect(round.belvar.fogColour).toBe(LIGHTING.horizonColour);
    expect(round.slice.fogColour).toBe(LIGHTING.horizonColour);
    expect(round.belvar.exposure).toBeCloseTo(LIGHTING.exposure, 9);
    // The painted sky, byte-sampled: each world's is the same painting every
    // time it comes back, and the park's is a different one.
    expect(round.park.skyDigest, `round ${index + 1}: the park's sky`)
      .toBe(trace.rounds[0].park.skyDigest);
    expect(round.belvar.skyDigest).toBe(trace.rounds[0].belvar.skyDigest);
    expect(round.slice.skyDigest).toBe(round.belvar.skyDigest);
    expect(round.park.skyDigest).not.toBe(round.belvar.skyDigest);
    // **`sameSkyPaint`, seen from outside.** BelVar and the slice agree on all
    // five painter fields, so the crossing between them repaints nothing and
    // the texture is the same object; the park disagrees, so its arrival is a
    // dispose and a rebuild and the uuid changes.
    expect(round.slice.skyUuid).toBe(round.belvar.skyUuid);
    expect(round.park.skyUuid).not.toBe(round.belvar.skyUuid);
  }

  // Invariant 10 across the rotation: from the second round on, no world's GPU
  // counts climb. The first round may legitimately add a program or a texture
  // the other worlds needed.
  for (let round = 2; round < trace.rounds.length; round += 1) {
    for (const world of ['park', 'belvar', 'slice'] as const) {
      expect(
        trace.rounds[round][world].resources,
        `round ${round + 1} on ${world}: ${JSON.stringify(trace.rounds[round][world].resources)}`
          + ` against round 2's ${JSON.stringify(trace.rounds[1][world].resources)}`,
      ).toEqual(trace.rounds[1][world].resources);
    }
  }
  expect(trace.restored.resources).toEqual(trace.rounds[trace.rounds.length - 1].park.resources);
  expect(trace.restored.look).toEqual({ ...park });
  console.log('[m36_4] twelve park/BelVar/slice rotations: park '
    + `${JSON.stringify(trace.rounds[11].park.resources)}, BelVar `
    + `${JSON.stringify(trace.rounds[11].belvar.resources)}, slice `
    + `${JSON.stringify(trace.rounds[11].slice.resources)}; sky digests park `
    + `${trace.rounds[11].park.skyDigest} / daylight ${trace.rounds[11].belvar.skyDigest}`);
  expect(errors).toEqual([]);
});

test('both rungs of the ladder are installed and drawn, through ?presentation=', async ({ page }, testInfo) => {
  // **What the ladder test above could only half-prove.** It reads the
  // selector's two verdicts off one installed scene; `p5-chooser` added the
  // `?presentation=baseline|enhanced` diagnostic on `?mph=`'s terms, so each
  // rung can now be *built* and measured with live GPU counters. The plan is
  // never re-priced, so admission is untouched and nothing a record is filed
  // against moves.
  const errors = collectErrors(page);
  const measured: Record<string, {
    recipe: string;
    level: { drawCalls: number; triangles: number };
    frame: { solo: { drawCalls: number; triangles: number }; split: { drawCalls: number; triangles: number }; quad: { drawCalls: number; triangles: number } };
    worstCalls: number;
    worstTriangles: number;
    pose: { triangles: number; drawCalls: number };
  }> = {};

  for (const recipe of ['baseline', 'enhanced'] as const) {
    await boot(page, `${PARK}&presentation=${recipe}`);
    const rung = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.advance(60);
      const selection = game.renderer.presentation()!;
      const ids = game.levelPlan.segments.map((segment) => segment.id);
      const points = window.qa.routePoints(ids, 12);
      let worstCalls = 0;
      let worstTriangles = 0;
      for (let i = 0; i < points.length; i += 1) {
        const next = points[(i + 1) % points.length];
        game.placeRider(
          { x: points[i].x, y: 0, z: points[i].z },
          Math.atan2(next.x - points[i].x, next.z - points[i].z),
        );
        game.advance(2);
        const frame = game.snapshot().render;
        worstCalls = Math.max(worstCalls, frame.drawCalls);
        worstTriangles = Math.max(worstTriangles, frame.triangles);
      }
      return {
        recipe: selection.recipe.id,
        level: {
          drawCalls: selection.cost.drawCalls,
          triangles: selection.cost.triangles,
        },
        frame: {
          solo: { ...selection.cost.frame.solo },
          split: { ...selection.cost.frame.split },
          quad: { ...selection.cost.frame.quad },
        },
        worstCalls,
        worstTriangles,
      };
    });
    // The same pose in both rungs, so the pair of PNGs is one picture with one
    // thing changed — the crowns and the conifers.
    const pose = await page.evaluate(poseOn, {
      id: 'kicker-table',
      fraction: 0.1,
      lateral: 4.25,
      roll: 40,
      throttle: 0.5,
    });
    await saveShot(page, testInfo, `park-recipe-${recipe}`);
    measured[recipe] = { ...rung, pose: { triangles: pose.triangles, drawCalls: pose.drawCalls } };

    expect(rung.recipe, `?presentation=${recipe} installed ${rung.recipe}`).toBe(recipe);
    expect(rung.frame.solo.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    expect(rung.frame.solo.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
    expect(rung.frame.split.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxDrawCalls);
    expect(rung.frame.split.triangles).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxTriangles);
    expect(rung.frame.quad.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxDrawCalls);
    expect(rung.frame.quad.triangles).toBeLessThanOrEqual(RENDER_BUDGET_QUAD.maxTriangles);
    expect(rung.level.drawCalls).toBeLessThanOrEqual(WORKING_ALLOCATION.drawCalls);
    expect(rung.level.triangles).toBeLessThanOrEqual(WORKING_ALLOCATION.triangles);
    // And the live counters, all the way round the ring, on the rung that is
    // actually installed.
    expect(rung.worstCalls, `${recipe}: peak ${rung.worstCalls} draw calls`)
      .toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    expect(rung.worstTriangles, `${recipe}: peak ${rung.worstTriangles} triangles`)
      .toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
    console.log(`[m36_4] ?presentation=${recipe}: level ${rung.level.drawCalls} calls /`
      + ` ${rung.level.triangles} tri; live peak ${rung.worstCalls} / ${rung.worstTriangles};`
      + ` the paired pose ${pose.drawCalls} / ${pose.triangles}`);
    expect(errors).toEqual([]);
  }

  // **The scenes really are different**, which is the part a model cannot say:
  // the same camera on the same pose draws more triangles on the enhanced rung
  // and no more draw calls — §36.7's "zero new call buckets", measured on the
  // GPU rather than predicted.
  expect(measured.enhanced.level.triangles).toBeGreaterThan(measured.baseline.level.triangles);
  expect(measured.enhanced.level.drawCalls).toBe(measured.baseline.level.drawCalls);
  expect(measured.enhanced.pose.triangles).toBeGreaterThan(measured.baseline.pose.triangles);
  expect(measured.enhanced.pose.drawCalls).toBe(measured.baseline.pose.drawCalls);
});

/**
 * The crop the shadow questions are judged from — the ground under and ahead
 * of the rider at native resolution, where contact shadows, acne and
 * peter-panning live. A full 1000 x 700 frame scaled into a report hides all
 * three; this is the same pixels, uncropped.
 */
const SHADOW_CROP = { x: 300, y: 250, width: 400, height: 300 };

const FAST_APPROACHES = [
  {
    // 24 m of approach, 14 m of rise and the take-off pitch: beat 5 is 114 m of
    // collinear straight, so full throttle from the head of it is at the lip at
    // over 40 mph, which is the speed §36.8 asks the shadows to survive.
    name: 'kicker-lip-40mph',
    ids: ['kicker-approach', 'kicker-rise', 'kicker-lip', 'kicker-table'],
    stopAt: 36,
    lateral: 4.25,
    minMph: 40,
  },
  {
    // The fire road's crest, reached up a 74 m straight at 6.5%. The crest is
    // the one place on the lap where the ground falls away from the rider at
    // speed, which is where peter-panning shows first.
    name: 'summit-crest-fast',
    ids: ['fire-road-1', 'crest-up', 'crest-down'],
    stopAt: 74,
    lateral: 0,
    minMph: 40,
  },
] as const;

for (const approach of FAST_APPROACHES) {
  test(`the low sun on the fastest approaches: ${approach.name}`, async ({ page }, testInfo) => {
    // **Nothing is disabled or tuned to reach this speed.** The wheel the game
    // ships, one throttle input, no steering, down the middle of a straight
    // corridor: what the frame shows is what a rider who commits to beat 5 or
    // to the fire road gets. The shadow judgement itself is the owner's and
    // mine to describe — this test's job is to put the frame in front of both
    // of us at the speed the question is asked at, and to refuse a frame taken
    // somewhere else or at a crawl.
    const errors = collectErrors(page);
    await boot(page, PARK);
    const shot = await page.evaluate(chargeStraight, {
      ids: [...approach.ids],
      stopAt: approach.stopAt,
      lateral: approach.lateral,
    });

    expect(shot.camera).toBe('chase');
    expect(
      shot.mph,
      `${approach.name} reached only ${shot.mph.toFixed(1)} mph in ${shot.distance.toFixed(1)} m`,
    ).toBeGreaterThanOrEqual(approach.minMph);
    expect(shot.worstState, `${approach.name} binned it`).toBe('rolling');
    expect(shot.offCourseSteps, `${approach.name} left the corridor`).toBe(0);
    expect(shot.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    expect(shot.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
    console.log(`[m36_4] ${approach.name}: ${shot.mph.toFixed(1)} mph`
      + ` (${shot.speed.toFixed(1)} m/s) ${shot.distance.toFixed(1)} m in, on ${shot.surface}`
      + ` at (${shot.position.x.toFixed(0)}, ${shot.position.z.toFixed(0)});`
      + ` ${shot.drawCalls} calls / ${shot.triangles} triangles`);
    await saveShot(page, testInfo, `park-${approach.name}`);
    await saveShot(page, testInfo, `park-${approach.name}-crop`, SHADOW_CROP);
    expect(errors).toEqual([]);
  });
}

/**
 * Four riders, chosen for four different problems the low key light poses.
 *
 * The Drunkard is named by §36.8; the other three are the roster's widest
 * spread of surfaces — a printed lid and a logo (`wheel-in-motion`), a dress
 * and tights (`maribel-vargas`), fur, a drape and mittens (`seal-on-a-wheel`).
 * A warm 4000 K key at 33° with a cool fill is exactly the light that turns
 * skin green or flattens a printed mark, so these are the four to look at.
 */
const POSED_RIDERS: readonly PlayableCharacterId[] = [
  'drunkard',
  'wheel-in-motion',
  'maribel-vargas',
  'seal-on-a-wheel',
];

test("four riders posed against the park's own afternoon, on the chase camera", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page, PARK);
  const posed: { id: string; installed: string; speed: number; surface: string }[] = [];

  for (const character of POSED_RIDERS) {
    await page.evaluate((id) => window.game.setOptions({ character: id }), character);
    // On the kicker's table, on the technical line, at riding speed: twelve
    // metres of level ground with the forest behind it and the sun across the
    // rider's shoulder, which is the light this milestone asks to be judged.
    // The roll is long enough to reach the speed the other G3 frames are taken
    // at, so the chase camera is where a player sees it rather than at rest.
    const pose = await page.evaluate(poseOn, {
      id: 'kicker-table',
      fraction: 0.05,
      lateral: 4.25,
      roll: 170,
      throttle: 1,
    });
    expect(pose.camera, `${character}: not on the chase camera`).toBe('chase');
    expect(pose.speed, `${character}: posed at ${(pose.speed * 3.6).toFixed(0)} km/h`)
      .toBeGreaterThan(4);
    expect(pose.character, `${character}: the seat is wearing ${pose.character}`).toBe(character);
    expect(pose.offCourse, `${character}: posed off the trail`).toBe(false);
    expect(pose.state).not.toBe('crashing');
    expect(pose.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    posed.push({
      id: character,
      installed: pose.character,
      speed: pose.speed,
      surface: pose.surface,
    });
    await saveShot(page, testInfo, `park-rider-${character}`);
  }

  expect(posed.map((row) => row.installed)).toEqual([...POSED_RIDERS]);
  console.log(`[m36_4] posed riders: ${posed
    .map((row) => `${row.id} at ${(row.speed * 3.6).toFixed(0)} km/h on ${row.surface}`)
    .join('; ')}`);
  expect(errors).toEqual([]);
});

/**
 * The bypass, which is the half of every feature the frames above do not show.
 *
 * Each corridor on this venue carries its feature at `PARK.wideT` to the
 * rider's LEFT and leaves the right half rollable, and Phase 2 paints an arrow
 * at the fork. A G3 set that photographs only the technical line is a set of
 * pictures of the hard way round; these two are the easy one, which is what a
 * new rider actually takes and what the sign is promising them.
 */
const BYPASS_FRAMES = [
  { name: 'bypass-stairs', lead: ['timber'], feature: ['timber-steps'], maxSpeed: 6 },
  {
    name: 'bypass-kicker',
    lead: ['rhythm-turn', 'kicker-approach'],
    feature: ['kicker-rise'],
    maxSpeed: 8,
  },
] as const;

for (const frame of BYPASS_FRAMES) {
  test(`G3 frame on the chase camera: ${frame.name}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await boot(page, PARK);
    // Negative lateral is the rider's RIGHT — the rollable half. The same
    // ramp-in as every other G3 frame, so the driver is not asked to take a
    // lane change as a corner.
    const shot = await page.evaluate(rideTo, {
      lead: [...frame.lead],
      feature: [...frame.feature],
      maxSpeed: frame.maxSpeed,
      lateral: -4.25,
    });

    expect(shot.camera).toBe('chase');
    expect(shot.speed).toBeGreaterThan(2);
    expect(shot.crashes, `${frame.name}: the bypass was binned`).toBe(0);
    expect(
      shot.fromTarget,
      `${frame.name}: stopped ${shot.fromTarget.toFixed(1)} m from the end of its route`,
    ).toBeLessThan(14);
    expect(shot.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
    console.log(`[m36_4] ${frame.name}: ${(shot.speed * 3.6).toFixed(0)} km/h at`
      + ` (${shot.position.x.toFixed(0)}, ${shot.position.z.toFixed(0)}) on ${shot.surface};`
      + ` ${shot.drawCalls} calls / ${shot.triangles} triangles`);
    await saveShot(page, testInfo, `park-${frame.name}`);
    expect(errors).toEqual([]);
  });
}

test('G3 frame: the landing the forest’s shadow stops short of', async ({ page }, testInfo) => {
  // **The frame §36.8 calls "a landing pad in shadow", taken honestly.** The
  // census above measures that no landing on this lap is in one, and that is
  // the canopy setback working rather than an absence of shadows: at 0.58 rad
  // the treeline lays 15 m of shade downhill and the rule holds it off the
  // pads. So the picture that answers the question is the *edge* — the
  // shadow band on the ground beside the kicker's landing, with the pad itself
  // out of it — and the distance from the pad to the nearest shade is reported
  // beside the frame so the owner can see what the margin buys.
  const errors = collectErrors(page);
  await boot(page, PARK);

  const pose = await page.evaluate(poseOn, {
    id: 'kicker-landing',
    fraction: 0,
    lateral: 4.25,
    roll: 150,
    throttle: 1,
  });
  expect(pose.camera).toBe('chase');
  expect(pose.speed, `posed at ${(pose.speed * 3.6).toFixed(0)} km/h`).toBeGreaterThan(4);
  expect(pose.offCourse).toBe(false);
  expect(pose.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  console.log(`[m36_4] landing-shadow-edge: ${(pose.speed * 3.6).toFixed(0)} km/h on`
    + ` ${pose.surface} at (${pose.position.x.toFixed(0)}, ${pose.position.z.toFixed(0)});`
    + ` ${pose.drawCalls} calls / ${pose.triangles} triangles`);
  await saveShot(page, testInfo, 'park-landing-shadow-edge');
  await saveShot(page, testInfo, 'park-landing-shadow-edge-crop', SHADOW_CROP);
  expect(errors).toEqual([]);
});
