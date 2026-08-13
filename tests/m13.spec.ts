/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { POTHOLE } from '../src/data/tuning.ts';
import { SLICE_GRAPH } from '../src/level/sliceLevel.ts';
import { centrelineAt, headingAt } from '../src/level/segments.ts';

/**
 * M13 Phase 2 — hazards as geometry, in a real browser.
 *
 * The milestone's next gate is the owner's and cannot be automated: *does a
 * pothole read as a hole at 20 m and at 40 m, on the handset?* What **can** be
 * automated is the arithmetic that gate rests on, and it is the reason this
 * file exists rather than a screenshot: readability at a distance is a claim
 * about **pixels**, and pixels come from the real camera, the real viewport and
 * the real projection. A headless test can prove the mesh has relief; only a
 * browser can say how much of the screen that relief is worth.
 *
 * It is also where two successive readability arguments were caught. The plan
 * assumed a 6 m chase arm; the game's is 4.2 m with the eye 1.95 m up, which is
 * lower and closer and therefore *more* foreshortened, so a flat 1.5 m feature
 * is about 0.84 px tall at forty route-metres. Phase 2 answered that with a
 * quarter of a metre of spoil ring, and this file dutifully asserted the ring
 * was worth more pixels than the hole — which it was, and the owner rejected the
 * result on sight as a tan volcano sitting on the road.
 *
 * **The mistake was measuring the wrong quantity.** A mark that is one pixel
 * tall and forty wide is read by its contrast, not by its height. So the
 * assertions below no longer project vertex positions at all: they render a
 * frame, read it back, and measure the luminance of what actually reached the
 * screen.
 *
 * **`?hazardprobe=` is what makes any of this reachable.** §13 q9 puts hazards
 * in generated routes only and Phase 3 is what teaches the generator to place
 * them, so until then no world in the game contains one to look at.
 *
 * Nothing here reads a frame interval (`AGENTS.md`); the numbers are pixel
 * extents, particle counts, draw calls and GPU object counts.
 */

/** Dense enough that every beat of the slice carries one. */
const PROBE = 'hazardprobe=30';

/**
 * A separate, denser fixture for the readability proof.
 *
 * `park-gate` is the only beat that is all four things this measurement needs:
 * **straight** (a curve puts the viewer's chord off the road), **pavement** (the
 * palette is authored against the road's value, and measuring the dipole over
 * the plaza's warm brick would be measuring a surface no generated route puts a
 * hazard on), **long enough** to stand forty route-metres back from a target,
 * and **wide enough** to stand off the centreline while doing it.
 */
const READ_PROBE = 'hazardprobe=10';
const READ_SEGMENT_ID = 'park-gate';
const READ_TARGET_S = 42;
const READ_SEGMENT = SLICE_GRAPH.main.find((segment) => segment.id === READ_SEGMENT_ID);
if (READ_SEGMENT === undefined) throw new Error(`missing ${READ_SEGMENT_ID} read-distance fixture`);

/**
 * How far off the centreline the viewer stands, metres.
 *
 * Not framing: **a hazard directly ahead at forty metres is behind the rider's
 * own shoulders**, and an earlier version of this test dutifully measured the
 * suit. It is also the realistic pose — a hazard worth seeing is one being
 * steered around.
 */
const VIEWER_OFFSET = 2.6;

/** The halo's outer reach, as a multiple of `Hazard.radius`. */
const HALO_REACH = POTHOLE.haloFraction
  * (1 + POTHOLE.outlineHarmonics.reduce((sum, amplitude) => sum + amplitude, 0));

/**
 * Read distances, metres. Ten is where a rider commits, twenty is where the
 * owner's gate lives, and forty is where the plan claimed a decal would fail.
 */
const DISTANCES = [10, 20, 40] as const;

test('a world without the probe has no hazards, and the mesh is absent with them', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const bare = await page.evaluate(() => {
    const game = window.game;
    const meshes: string[] = [];
    game.renderer.scene.traverse((object: { name: string }) => { meshes.push(object.name); });
    return {
      hazards: (game.levelPlan.hazards ?? []).length,
      hazardMeshes: meshes.filter((name) => name.startsWith('level-hazards')),
    };
  });

  // The shipped world is the hazard-free one the owner decided it should be,
  // and the renderer spends nothing on a family it has no data for.
  expect(bare.hazards).toBe(0);
  expect(bare.hazardMeshes).toEqual(['level-hazards']);
  expect(errors).toEqual([]);
});

test('a diagnostic hazard course cannot write a best or ghost for the ordinary route', async ({ page }) => {
  const errors = collectErrors(page);
  const seed = 'ember-quay';
  await bootToTitle(page, `level=generated&seed=${seed}&${PROBE}`);
  await page.evaluate(() => window.game.clearRecords());

  const identity = await page.evaluate(() => ({
    id: window.game.levelPlan.id,
    hazards: window.game.levelPlan.hazards?.length ?? 0,
  }));
  expect(identity.id).toBe(`generated-r3-${seed}`);
  expect(identity.hazards).toBeGreaterThan(0);

  await page.evaluate(() => window.game.startTimeTrial());
  const gates = await page.evaluate(() => window.game.levelPlan.checkpoints.map((gate) => ({
    centre: { ...gate.centre },
    headingY: gate.headingY,
  })));
  for (const gate of gates) {
    await page.evaluate(({ centre, headingY }) => {
      window.game.placeRider(centre, headingY);
      window.game.advance(2);
      window.game.advance(60);
    }, gate);
  }
  await page.evaluate(() => window.game.advance(240));

  expect(await page.evaluate(() => window.game.snapshot().record)).toMatchObject({
    totalSeconds: null,
    hasGhost: false,
  });
  expect(await page.evaluate(() => window.game.snapshot().challenge.recordedSamples)).toBe(0);
  await expect(page.locator('.euc-menu--results [data-menu="results-notes"]'))
    .toContainText('Diagnostic run — personal best and replay not saved');

  // Reload the same level id without the diagnostic. Before the fix, the probe
  // run above appeared here as a legitimate best and its ghost was armed on a
  // course carrying an entirely different hazard placement.
  await bootToTitle(page, `level=generated&seed=${seed}`);
  expect(await page.evaluate(() => window.game.snapshot().record)).toMatchObject({
    totalSeconds: null,
    hasGhost: false,
  });
  expect(errors).toEqual([]);
});

test('the probe fills the world through the real build path, and draws it in two meshes', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PROBE);

  const probed = await page.evaluate(() => {
    const game = window.game;
    const plan = game.levelPlan;
    const drawn: { name: string; casts: boolean }[] = [];
    game.renderer.scene.traverse((object: { name: string; isMesh?: boolean; castShadow: boolean }) => {
      if (object.isMesh === true && object.name.startsWith('level-hazards')) {
        drawn.push({ name: object.name, casts: object.castShadow });
      }
    });
    const hazards = plan.hazards ?? [];
    return {
      total: hazards.length,
      kinds: [...new Set(hazards.map((hazard: { kind: string }) => hazard.kind))].sort(),
      spillCells: plan.heightfield.surfaces.filter((surface: string) => surface === 'spill').length,
      drawn,
    };
  });

  expect(probed.total).toBeGreaterThan(10);
  // Every kind, because the gate is partly about telling a shallow hole from a
  // deep one at speed.
  expect(probed.kinds).toEqual(['potholeDeep', 'potholeShallow', 'spill']);
  // The spill half really painted, so it is ground rather than a drawn sheen.
  expect(probed.spillCells).toBeGreaterThan(0);
  // Every hazard in the world in two meshes — all the broken asphalt in one and
  // all the standing water in the other — and neither casts, because a recess
  // casting into the cascade would draw a dark ring beside every hole.
  expect(probed.drawn.map((mesh) => mesh.name).sort())
    .toEqual(['level-hazards-ground', 'level-hazards-water']);
  expect(probed.drawn.every((mesh) => !mesh.casts)).toBe(true);
  expect(errors).toEqual([]);
});

test('a hole is a light/dark pair against the road, at every read distance', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, READ_PROBE);

  const fixture = await page.evaluate(({ segmentId, minS }) => {
    const game = window.game;
    const plan = game.levelPlan;
    const segment = plan.segments.find((candidate: { id: string }) => candidate.id === segmentId)!;
    const entry = segment.entry;
    const hazards = (plan.hazards ?? []) as {
      id: string; kind: string; radius: number; centre: { x: number; y: number; z: number };
    }[];
    const along = (hazard: { centre: { x: number; z: number } }): number => (
      Math.hypot(hazard.centre.x - entry.position.x, hazard.centre.z - entry.position.z)
    );
    const target = hazards
      .filter((hazard) => hazard.kind !== 'spill' && hazard.id.startsWith(`probe-${segmentId}-`))
      .filter((hazard) => along(hazard) >= minS)
      .sort((a, b) => along(a) - along(b))[0];
    if (target === undefined) throw new Error(`no pothole past ${minS} m on ${segmentId}`);
    // Which side of the centreline it sits on, so the viewer can be put on the
    // other one — at forty metres a hazard dead ahead is behind the rider's own
    // shoulders, which is how the first version of this test measured a suit.
    const right = { x: Math.cos(entry.headingY), z: -Math.sin(entry.headingY) };
    const side = Math.sign(
      (target.centre.x - entry.position.x) * right.x + (target.centre.z - entry.position.z) * right.z,
    ) || 1;
    return { target, entry, targetS: along(target), side };
  }, { segmentId: READ_SEGMENT_ID, minS: READ_TARGET_S });

  const measured: {
    distance: number;
    viewport: string;
    devicePixels: string;
    widthPx: number;
    heightPx: number;
    road: number;
    darkest: number;
    brightest: number;
    surface: string;
    offCourse: boolean;
    onScreen: boolean;
  }[] = [];

  for (const distance of DISTANCES) {
    const viewerS = fixture.targetS - distance;
    const centre = centrelineAt(fixture.entry, READ_SEGMENT, viewerS);
    const headingY = headingAt(fixture.entry, READ_SEGMENT, viewerS);
    const lateral = -fixture.side * VIEWER_OFFSET;
    const position = {
      x: centre.x + Math.cos(headingY) * lateral,
      y: centre.y,
      z: centre.z - Math.sin(headingY) * lateral,
    };

    measured.push(await page.evaluate(({ distance, position, headingY, target, reach }) => {
      const game = window.game;
      const canvas = document.getElementById('viewport') as HTMLCanvasElement;

      game.loop.setRunning(false);
      // `placeRider` already snaps the chase camera (`Game.syncPoses`). Stepping
      // after it let gravity roll an earlier fixture onto grass; zero steps
      // forces the named pose to render without moving it.
      // `advance` renders on its way out (`app/loop.ts`), which is what puts a
      // frame in the drawing buffer for the capture below.
      game.placeRider(position, headingY);
      game.advance(0);

      // **Read the frame, not the geometry.** The claim being tested is about
      // what reaches the player's eye, and that is albedo, shading, tone mapping
      // and the depth of the pit all together — none of which a projection of
      // vertex positions can see. Captured synchronously in the same task as the
      // render, because the drawing buffer is not preserved across one.
      const camera = game.renderer.camera;
      const scratch = camera.position.clone();
      const project = (x: number, y: number, z: number): { x: number; y: number } => {
        scratch.set(x, y, z).project(camera);
        return { x: (scratch.x * 0.5 + 0.5) * canvas.width, y: (1 - (scratch.y * 0.5 + 0.5)) * canvas.height };
      };
      const heading = headingY;
      const forward = { x: Math.sin(heading), z: Math.cos(heading) };
      const right = { x: Math.cos(heading), z: -Math.sin(heading) };
      const span = target.radius * reach;
      const middle = project(target.centre.x, target.centre.y, target.centre.z);
      const side = project(
        target.centre.x + right.x * span, target.centre.y, target.centre.z + right.z * span,
      );
      const near = project(
        target.centre.x - forward.x * span, target.centre.y, target.centre.z - forward.z * span,
      );
      const far = project(
        target.centre.x + forward.x * span, target.centre.y, target.centre.z + forward.z * span,
      );
      const halfW = Math.hypot(side.x - middle.x, side.y - middle.y);
      const halfH = Math.max(Math.abs(far.y - near.y) / 2, 1);

      const buffer = document.createElement('canvas');
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      const ctx = buffer.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0);
      const frame = ctx.getImageData(0, 0, buffer.width, buffer.height);
      const decode = (value: number): number => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (x: number, y: number): number => {
        const at = (Math.round(y) * frame.width + Math.round(x)) * 4;
        return 0.2126 * decode(frame.data[at])
          + 0.7152 * decode(frame.data[at + 1])
          + 0.0722 * decode(frame.data[at + 2]);
      };

      let darkest = 1;
      let brightest = 0;
      for (let dx = -halfW; dx <= halfW; dx += Math.max(0.5, halfW / 28)) {
        for (let dy = -halfH; dy <= halfH; dy += Math.max(0.5, halfH / 12)) {
          if ((dx / halfW) ** 2 + (dy / halfH) ** 2 > 1) continue;
          const value = luminance(middle.x + dx, middle.y + dy);
          darkest = Math.min(darkest, value);
          brightest = Math.max(brightest, value);
        }
      }

      const pose = game.snapshot().euc;
      return {
        distance,
        viewport: `${canvas.clientWidth}x${canvas.clientHeight}`,
        devicePixels: `${canvas.width}x${canvas.height}`,
        widthPx: halfW * 2,
        heightPx: halfH * 2,
        // Sampled well clear of the feature, on the same row, so shade under a
        // tree moves the reference with the hazard instead of failing the test.
        road: luminance(middle.x + halfW * 2.6, middle.y),
        darkest,
        brightest,
        surface: pose.surface,
        offCourse: pose.offCourse,
        onScreen: middle.x > 0 && middle.x < canvas.width && middle.y > 0 && middle.y < canvas.height,
      };
    }, { distance, position, headingY, target: fixture.target, reach: HALO_REACH }));
  }

  for (const sample of measured) {
    const where = `${sample.distance} m in ${sample.devicePixels}`;
    expect(sample.surface, `viewer ground at ${sample.distance} m`).toBe('pavement');
    expect(sample.offCourse, `viewer course status at ${sample.distance} m`).toBe(false);
    expect(sample.onScreen, `target on screen at ${sample.distance} m`).toBe(true);

    // **The claim the family exists to make, and it is not the one the first
    // build made.** That build put a quarter of a metre of spoil ring above the
    // road because a flat feature is under a pixel tall at forty route-metres —
    // true, and the wrong conclusion. A mark one pixel tall and forty wide is
    // read by its *contrast*, not its height, and a ring tall enough to be read
    // by height is a kerb. So what is asserted here is the dipole: a pit far
    // under the road's value and a broken rim above it, in the same feature.
    //
    // **What this proves, and what it does not.** It proves the pair survives
    // the whole pipeline — albedo, faked normals, baked occlusion, the sun, the
    // hemisphere, tone mapping, the projection. It does *not* isolate the
    // palette: on this beat the road is in shade and the lip is in sun, so
    // recolouring the rim to pavement still leaves it several times brighter
    // than its surroundings, which was confirmed by mutation rather than
    // assumed. The palette's own ordering is guarded headlessly instead, in
    // `render/hazards.test.ts`, where flattening the rim does turn it red.
    expect(sample.darkest, `pit against road at ${where}`).toBeLessThan(sample.road * 0.4);
    expect(sample.brightest, `rim against road at ${where}`).toBeGreaterThan(sample.road * 1.8);
    expect(sample.brightest / sample.darkest, `dipole at ${where}`).toBeGreaterThan(6);
    // And the mark has to be big enough to carry it. Width, not height: at forty
    // metres the feature is a couple of pixels tall and that is simply what a
    // road surface looks like from a two-metre eye.
    expect(sample.widthPx, `width at ${where}`).toBeGreaterThan(30);
  }

  // The far read distance is the one the gate is really about, so it is stated
  // separately rather than left inside the loop.
  const far = measured.find((sample) => sample.distance === 40)!;
  expect(far.heightPx, 'a road feature at 40 m is a sliver, and that is the point')
    .toBeLessThan(far.widthPx / 4);
  expect(far.road / far.darkest, 'the pit at 40 m').toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('a wheel crossing water throws spray, and dry road throws none', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PROBE);

  const ride = await page.evaluate(() => {
    const game = window.game;
    const plan = game.levelPlan;
    const hazards = (plan.hazards ?? []) as {
      id: string; kind: string; radius: number; centre: { x: number; y: number; z: number };
    }[];
    const spill = hazards.find((hazard) => hazard.kind === 'spill')!;
    const holes = hazards.filter((hazard) => hazard.kind !== 'spill');
    const near = holes.reduce((best, hazard) => (
      Math.hypot(hazard.centre.x - spill.centre.x, hazard.centre.z - spill.centre.z)
        < Math.hypot(best.centre.x - spill.centre.x, best.centre.z - spill.centre.z) ? hazard : best
    ));
    const dx = spill.centre.x - near.centre.x;
    const dz = spill.centre.z - near.centre.z;
    const length = Math.hypot(dx, dz);
    const dir = { x: dx / length, z: dz / length };

    // The gate is shut in the shipped default, and the spray must not be —
    // seeing the water is not the same decision as feeling it.
    game.tuning.set('EUC.wobbleMasterGain', 1);
    game.loop.setRunning(false);
    game.placeRider({
      x: spill.centre.x - dir.x * 14,
      y: spill.centre.y,
      z: spill.centre.z - dir.z * 14,
    }, Math.atan2(dir.x, dir.z));
    game.setActions({ throttle: 1, steer: 0 });

    let onSpill = 0;
    let sprayOnSpill = 0;
    let sprayOnDry = 0;
    let peakWobble = 0;
    for (let sample = 0; sample < 70; sample += 1) {
      game.advance(8);
      const snapshot = game.snapshot();
      if (snapshot.euc.surface === 'spill') {
        onSpill += 1;
        sprayOnSpill = Math.max(sprayOnSpill, snapshot.particles.dust);
        peakWobble = Math.max(peakWobble, snapshot.euc.wobbleEnergy ?? 0);
      } else if (onSpill === 0) {
        sprayOnDry = Math.max(sprayOnDry, snapshot.particles.dust);
      }
    }
    game.clearActions();
    game.tuning.set('EUC.wobbleMasterGain', 0);
    return { onSpill, sprayOnSpill, sprayOnDry, peakWobble };
  });

  expect(ride.onSpill, 'the ride never reached the water').toBeGreaterThan(2);
  // A spill is a *place*, so the spray is continuous while the wheel is in it —
  // the half of the spill's readability problem no mesh can solve, since a
  // puddle has no relief to give it (`DESIGN.md` §6d).
  expect(ride.sprayOnSpill).toBeGreaterThan(0);
  // And nothing at all on dry road, which is what a landing-only emitter would
  // also satisfy — hence the pair.
  expect(ride.sprayOnDry).toBe(0);
  // Phase 1's response is still on the other end of it.
  expect(ride.peakWobble).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});

test('worlds full of hazards plateau GPU objects across repeated rebuilds', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PROBE);

  // Invariant 10, for the mesh family added this phase. The scene-graph half is
  // headless (`render/hazards.test.ts`, `render/levelLifecycle.test.ts`); the
  // GPU counters only exist here, and a geometry that is removed from the graph
  // while its buffers stay alive is invisible to the headless half.
  const rounds = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(30);
    const census: { geometries: number; textures: number; programs: number }[] = [];
    for (let round = 0; round < 6; round += 1) {
      const plan = game.buildLevel('slice', '');
      game.renderer.setLevel(plan);
      game.advance(2);
      census.push(game.resources());
    }
    return census;
  });

  for (const [index, sample] of rounds.entries()) {
    expect(sample, `round ${index + 1} against round 1`).toEqual(rounds[0]);
  }
  expect(errors).toEqual([]);
});
