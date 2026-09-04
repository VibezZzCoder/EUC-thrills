/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import type { Mesh, Object3D } from 'three';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { CAMERA, EUC, SIMULATION } from '../src/data/tuning.ts';
import { generateLevel } from '../src/level/generateRoute.ts';
import { createSpineLocation, createSpineSample, RouteSpine } from '../src/simulation/routeSpine.ts';
import { lateralCeilingG } from '../src/simulation/lateralCeiling.ts';
import type { EucSnapshot } from '../src/simulation/EucController.ts';
import { riderRollFor } from '../src/simulation/riderLean.ts';
import {
  METRES_PER_SECOND_PER_MPH,
  TOP_SPEED_PATHS,
  topSpeedPreset,
  topSpeedWrites,
} from '../src/simulation/topSpeedPreset.ts';

/**
 * M30 Phase 0 — the `?mph=<n>` switch, in a real browser (`docs/PLANS.md`
 * §30.4 items 1 and 2).
 *
 * The recipe is proven headless (`simulation/topSpeedPreset.test.ts`); what
 * is left for a browser is the half a model cannot answer:
 *
 *   1. **That the switch reaches the wheel the player rides** — through the
 *      URL, the store, `applyTuning` and a real `EucController` on a real
 *      world — so the beeps arrive at 52 mph and the wheel lets go at 64.2 on
 *      a flat-out ride, and the store holds the preset *exactly* rather than
 *      a slider-clamped neighbour of it.
 *   2. **That records are refused**, on the card and in the store, which is
 *      the `Game.probing` join and nothing else — and that the same lap on
 *      the default wheel *is* saved, so the refusal is distinguishable from a
 *      store that never works.
 *   3. **That it survives a fresh route** — `installLevel` builds a new
 *      controller and replays the store onto it — and that `worldLink` never
 *      writes it: the address after the swap carries `mph` exactly as typed
 *      and only ever gains `level` and `seed`.
 *   4. **That a default boot is byte-identical**: the shipped wheel, an empty
 *      store, and no `mph` in any address the game writes.
 *   5. **The crash camera at 65** — the natural cutout faceplant ridden flat
 *      out at the shipped 65 and under the `?mph=50` switch, the ragdoll's projected
 *      extent measured against the frame on every other fixed step of the
 *      crash, the way M16 judged 8.6 → 11.5 (`docs/PLANS.md` §16.2). The
 *      measurement found the arm is not what frames the body at either
 *      speed; the test pins that finding (see `CRASH_DISTANCE_EXPONENT`).
 *
 * The flat-out rides are on the proving ground: its pad, plaza and boulevard
 * are one 310 m straight, and a 65 mph wheel needs about 240 m to reach its
 * cutout (measured headless) — the slice's longest paved run has two corners
 * inside that distance. The slice boot below proves the thresholds and the
 * records; the proving ground proves the ride.
 *
 * ---------------------------------------------------------------------------
 *
 * **Phase 3 — the lean** (`docs/PLANS.md` §30.8 item 4) added the three specs
 * at the foot of this file. Item 4 asked for six things, in two files:
 *
 *   - `m2.spec.ts`' hard-carve pose spec rewritten to assert the schedule at
 *     the speed it rides, and renamed — **done there**, because that suite is
 *     the proving ground's and the number it is calibrated at is its own;
 *   - its low-speed technical-turn spec untouched and green, and
 *     `m6.spec.ts`' wobble-correction assertion (which reads the snapshot's
 *     `riderRoll`) untouched — **both left exactly as they were**;
 *   - a real high-speed carve driven **through the keyboard path** at gameplay
 *     scale, asserting the one expression and attaching the player-view
 *     screenshot: the acceptance view — *the shipped-wheel spec below*;
 *   - **one line** (`|pelvisRoll| < 0.03`) where the schedule saturates, which
 *     needs a wheel that can hold 22.25 m/s through a carve — *the `?mph=65`
 *     spec below*;
 *   - **the cop's pelvis on the same expression** — *the third spec below*.
 *
 * The sixth thing item 4 names — **the hang-off past the ordinary ceiling** —
 * arrived with Phase 2 (§30.7) and **the two carve specs below are where it is
 * asserted**. The wheel's bank saturates at `atan(maxLateralG)` (36.9° on
 * pavement) while `riderLean` keeps chasing the whole cornering force, so at
 * the top of the schedule the body sits 9.5° inside the machine's line and the
 * pelvis hinge that used to be exactly zero is exactly that. Both specs read
 * the hinge off the built rig rather than off the snapshot, which is the half
 * only a browser can see.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

const MPH = 1 / METRES_PER_SECOND_PER_MPH;
/**
 * The two wheels, **swapped at M30 Phase 4**.
 *
 * `SIXTY_FIVE` is the shipped table now (the owner's decision of 2026-09-03),
 * so `topSpeedPreset(65)` is the identity and `?mph=65` writes nothing a store
 * would keep — a `LiveTuning.set` equal to the default *clears* the override.
 * Every claim below about the switch reaching something therefore rides
 * `?mph=50`, M16's wheel, which is what the diagnostic is for now; every claim
 * about how the 65 wheel behaves rides the default boot.
 */
const SIXTY_FIVE = topSpeedPreset(65);
const FIFTY = topSpeedPreset(50);

interface Gate {
  centre: { x: number; y: number; z: number };
  headingY: number;
}

function gates(page: Page): Promise<Gate[]> {
  return page.evaluate(() => window.game.levelPlan.checkpoints.map((cp) => ({
    centre: { ...cp.centre },
    headingY: cp.headingY,
  })));
}

/** M10's lap: arm the run and stand the rider in every gate in order. */
async function completeLap(page: Page, list: Gate[]): Promise<void> {
  await page.evaluate(() => window.game.startTimeTrial());
  for (const gate of list) {
    await page.evaluate(({ centre, headingY }) => {
      window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
      window.game.advance(2);
    }, gate);
    await page.evaluate(() => window.game.advance(60));
  }
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results', undefined, {
    timeout: 20_000,
  });
}

/**
 * Hold full throttle from the spawn until the wheel comes off, frozen so the
 * only simulation is the steps asked for. Sampled every three steps: near the
 * first beep the wheel is still gaining ~4 m/s², so 25 ms is about 0.2 mph.
 */
function rideFlatOut(page: Page) {
  return page.evaluate(() => {
    const game = window.game;
    window.qa.freeze();
    let firstBeep = 0;
    let lastRiding = 0;
    let lastZ = 0;
    for (let i = 0; i < 40 * 40; i += 1) {
      game.setActions({ throttle: 1, steer: 0 });
      game.advance(3);
      const euc = game.snapshot().euc;
      if (firstBeep === 0 && euc.overspeed > 0) firstBeep = Math.abs(euc.speed);
      if (euc.crashed) {
        return {
          firstBeep,
          lastRiding,
          crashCause: euc.crashCause,
          crashMotion: euc.crashMotion,
          crashZ: euc.position.z,
          ranAtZ: lastZ,
          seconds: game.snapshot().simTimeSeconds,
        };
      }
      lastRiding = Math.abs(euc.speed);
      lastZ = euc.position.z;
    }
    return null;
  });
}

/**
 * Ride flat out into the cutout faceplant and, through the whole crash, project
 * the eight corners of every visible rider mesh's local bounding box, and the
 * wheel, through the real chase camera on every other fixed step — the way M16
 * judged the crash arm ("a 50 mph wipeout threw the ragdoll out through the top
 * of the frame").
 *
 * **Corners, not vertices** (Codex's Phase 0 QA, 2026-09-03, on the record's
 * wording). While every corner is in front of the camera the projected mesh
 * lies inside its projected corners, so the peak below is a bound on the body
 * — "never near the top" is a proof. The first corner behind the camera plane
 * (`passedAt`) is a *lower* bound on the body's exit; the last (`allBehindAt`)
 * is when nothing of the body is left in front. Codex's independent per-vertex
 * probe put the whole body off-screen by 0.40 s and behind the camera by
 * 0.45 s at 65, inside those bounds.
 *
 * Returns where the body reached in normalised device coordinates (±1 is the
 * frame's edge) while every corner was still in front of the camera, when the
 * first and the last corner went behind the camera plane, and what the camera
 * was doing at the first.
 */
function measureCrashFraming(page: Page, crashDistance: number | null) {
  return page.evaluate((arm) => {
    const game = window.game;
    window.qa.freeze();
    if (arm !== null) game.tuning.set('CAMERA.crashDistance', arm);

    let lastRiding = 0;
    for (let i = 0; i < 40 * 20; i += 1) {
      game.setActions({ throttle: 1, steer: 0 });
      game.advance(6);
      const euc = game.snapshot().euc;
      if (euc.crashed) break;
      lastRiding = Math.abs(euc.speed);
    }
    const atCrash = game.snapshot();
    game.setActions({ throttle: 0, steer: 0 });
    if (!atCrash.euc.crashed) return null;

    const scene = game.renderer.scene;
    const rider = scene.getObjectByName('rider-blockout') as Object3D | undefined;
    const wheel = scene.getObjectByName('euc-blockout') as Object3D | undefined;
    if (!rider || !wheel) throw new Error('the rig is not in the scene');

    const corners = [
      [0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1], [1, 0, 0], [1, 0, 1], [1, 1, 0], [1, 1, 1],
    ] as const;
    let peakY = -9;
    let peakYAt = 0;
    let peakX = 0;
    let lowY = 9;
    let passedAt = Number.NaN;
    let allBehindAt = Number.NaN;
    let armAtPass = Number.NaN;
    let frameAtPass = Number.NaN;
    let wheelPeakY = 0;
    let wheelBehind = 0;
    let samples = 0;
    // The crash lasts until the automatic recovery (3.6 s); sample for up to
    // four seconds so the end of it is seen too.
    for (let i = 0; i < 240 && game.snapshot().euc.crashed; i += 1) {
      game.advance(2);
      samples += 1;
      scene.updateMatrixWorld(true);
      const seconds = (i + 1) * 2 / 120;
      let behind = 0;
      let inFront = 0;
      // This sample's extrema, kept only if every corner was in front — the
      // projected mesh is inside its projected corners only then.
      let sPeakY = -9;
      let sLowY = 9;
      let sPeakX = 0;
      rider.traverseVisible((object: Object3D) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        if (box === null) return;
        const m = mesh.matrixWorld.elements;
        for (const [cx, cy, cz] of corners) {
          const x = cx ? box.max.x : box.min.x;
          const y = cy ? box.max.y : box.min.y;
          const z = cz ? box.max.z : box.min.z;
          const p = window.qa.projectPoint(
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
          );
          if (!p.inFront) {
            behind += 1;
            continue;
          }
          inFront += 1;
          if (p.y > sPeakY) sPeakY = p.y;
          if (p.y < sLowY) sLowY = p.y;
          if (Math.abs(p.x) > sPeakX) sPeakX = Math.abs(p.x);
        }
      });
      if (behind === 0 && Number.isNaN(passedAt)) {
        if (sPeakY > peakY) {
          peakY = sPeakY;
          peakYAt = seconds;
        }
        if (sLowY < lowY) lowY = sLowY;
        if (sPeakX > peakX) peakX = sPeakX;
      }
      if (behind > 0 && Number.isNaN(passedAt)) {
        passedAt = seconds;
        armAtPass = game.snapshot().camera.armDistance;
        frameAtPass = game.snapshot().camera.crashFrame;
      }
      if (behind > 0 && inFront === 0 && Number.isNaN(allBehindAt)) allBehindAt = seconds;
      const w = wheel.getWorldPosition(wheel.position.clone());
      const wp = window.qa.projectPoint(w.x, w.y + 0.3, w.z);
      if (wp.inFront) wheelPeakY = Math.max(wheelPeakY, Math.abs(wp.y));
      else wheelBehind += 1;
    }

    return {
      cause: atCrash.euc.crashCause,
      motion: atCrash.euc.crashMotion,
      crashSpeed: lastRiding,
      crashZ: atCrash.euc.position.z,
      crashDistance: game.tuning.get('CAMERA.crashDistance'),
      armBefore: atCrash.camera.armDistance,
      peakY,
      peakYAt,
      peakX,
      lowY,
      passedAt,
      allBehindAt,
      armAtPass,
      frameAtPass,
      wheelPeakY,
      wheelBehind,
      armAtEnd: game.snapshot().camera.armDistance,
      samples,
      recovered: !game.snapshot().euc.crashed,
    };
  }, crashDistance);
}

// ---------------------------------------------------------------------------
// The switch reaches the wheel
// ---------------------------------------------------------------------------

test('the shipped wheel puts the beeps at 52 mph and the cutout at 64.2 on a flat-out ride', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=proving');

  // **M30 Phase 4 made this the default build's ride rather than the switch's.**
  // The controller derives the top speed the frozen table describes, with an
  // empty store — and `?mph=65` on top of it is a no-op, because every write
  // the preset produces equals the default and `LiveTuning.set` clears an
  // override equal to the default. That is worth asserting rather than
  // assuming: it is the cheapest possible statement that the table really is
  // the preset's output.
  const store = await page.evaluate(() => ({
    overrides: window.game.snapshot().tuning.overrides,
    derivedTopSpeed: window.game.controller.derivedTopSpeed,
  }));
  expect(store.overrides).toEqual({});
  expect(store.derivedTopSpeed).toBeCloseTo(SIXTY_FIVE.dragOnlyTop, 6);

  const ride = await rideFlatOut(page);
  expect(ride, 'the wheel never came off in forty seconds flat out').not.toBeNull();
  if (ride === null) return;
  expect(ride.crashCause).toBe('cutout');
  expect(ride.crashMotion).toBe('faceplant');
  // §30.2 fact 1: 0.785 × 29.74 = 23.3 m/s (52 mph), 0.965 × 29.74 = 28.7 (64.2).
  expect(ride.firstBeep * MPH).toBeGreaterThan(51.6);
  expect(ride.firstBeep * MPH).toBeLessThan(52.8);
  expect(ride.lastRiding * MPH).toBeGreaterThan(63.6);
  expect(ride.lastRiding * MPH).toBeLessThan(64.8);
  // On the straight — pad, plaza and boulevard — rather than into the sweep.
  expect(ride.crashZ).toBeLessThan(310);

  // -- And the switch, which now writes the *other* wheel ------------------
  //
  // The store holds the preset exactly — six writes, none of them bent by a
  // slider range — and the controller derives the top speed those numbers
  // describe. This is the half that proves the parameter still reaches the
  // wheel at all, and it has to ride a speed that is not the shipped one.
  await boot(page, 'level=proving&mph=50');
  const fifty = await page.evaluate(() => ({
    overrides: window.game.snapshot().tuning.overrides,
    derivedTopSpeed: window.game.controller.derivedTopSpeed,
  }));
  const writes = topSpeedWrites(FIFTY);
  for (const path of TOP_SPEED_PATHS) {
    expect(fifty.overrides[path], path).toBeCloseTo(writes[path], 9);
  }
  expect(Object.keys(fifty.overrides).sort()).toEqual([...TOP_SPEED_PATHS].sort());
  expect(fifty.derivedTopSpeed).toBeCloseTo(FIFTY.dragOnlyTop, 6);
  expect(fifty.derivedTopSpeed).toBeLessThan(store.derivedTopSpeed);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Records are refused
// ---------------------------------------------------------------------------

test('a personal best set under ?mph= is refused, on the card and in the store', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'mph=65');
  await page.evaluate(() => window.game.clearRecords());
  const list = await gates(page);
  expect(list.length).toBe(6);

  await completeLap(page, list);

  // The card says so, in the words the probes already use.
  const panel = page.locator('[data-menu="results-panel"]');
  await expect(panel).toHaveAttribute('data-record', 'false');
  await expect(page.locator('[data-menu="results-heading"]')).not.toHaveText('New record');
  await expect(page.locator('[data-menu="results-notes"]'))
    .toContainText('Diagnostic run — personal best and replay not saved');

  // And the store never saw it: no best for this world, no ghost, nothing to
  // race next time.
  const after = await page.evaluate(() => ({
    best: window.game.records.best(window.game.levelPlan.id),
    record: window.game.snapshot().record,
    persistent: window.game.records.persistent,
  }));
  expect(after.persistent, 'the store has to be able to save for the refusal to mean anything').toBe(true);
  expect(after.best).toBeNull();
  expect(after.record.totalSeconds).toBeNull();
  expect(after.record.hasGhost).toBe(false);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// It survives a fresh route, and the address never gains it
// ---------------------------------------------------------------------------

test('the switch survives a fresh route, and worldLink writes only level and seed', async ({ page }) => {
  // **`?mph=50` since M30 Phase 4**, because 65 is the frozen table: a switch
  // that writes the defaults leaves an empty store, and this test's whole
  // subject is whether the store *carries* the switch across an
  // `installLevel`. Asking for the shipped speed would pass on an identity.
  const errors = collectErrors(page);
  await boot(page, 'mph=50&debug=0');

  const before = await page.evaluate(() => ({
    derivedTopSpeed: window.game.controller.derivedTopSpeed,
    search: window.location.search,
    seed: window.game.snapshot().world.seed,
  }));
  expect(before.derivedTopSpeed).toBeCloseTo(FIFTY.dragOnlyTop, 6);
  expect(before.seed).toBe('');

  // The pause card's New route is a real `installLevel`: a new plan, a new
  // sampler, a **new controller**, and `applyTuning()` replayed onto it.
  await page.evaluate(() => { window.game.setAppState('paused'); });
  await expect(page.locator('.euc-menu--pause')).toBeVisible();
  await page.locator('.euc-menu--pause [data-note="new-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'freeRide' && window.game.snapshot().world.generated,
    undefined,
    { timeout: 20_000 },
  );

  const after = await page.evaluate(() => ({
    derivedTopSpeed: window.game.controller.derivedTopSpeed,
    drag: window.game.snapshot().tuning.overrides['EUC.dragCoefficient'],
    overrideCount: window.game.snapshot().tuning.overrideCount,
    href: window.location.href,
    link: window.game.snapshot().world.link,
    seed: window.game.snapshot().world.seed,
    levelId: window.game.snapshot().world.levelId,
  }));
  expect(after.levelId).toBe('generated');
  expect(after.seed).not.toBe('');
  // The new controller rides the 50 mph wheel: the store carried it.
  expect(after.derivedTopSpeed).toBeCloseTo(FIFTY.dragOnlyTop, 6);
  expect(after.drag).toBeCloseTo(FIFTY.dragCoefficient, 9);
  expect(after.overrideCount).toBe(TOP_SPEED_PATHS.length);

  // `worldLink` rebuilt the address from the live href and rewrote `level`
  // and `seed` alone: `mph` is still exactly what was typed, `debug` is still
  // there, and nothing else was added. It is not level identity — the same
  // seed under no switch is the same route on the shipped wheel.
  const params = new URL(after.href).searchParams;
  expect(params.get('mph')).toBe('50');
  expect(params.get('debug')).toBe('0');
  expect(params.get('level')).toBe('generated');
  expect(params.get('seed')).toBe(after.seed);
  expect([...params.keys()].sort()).toEqual(['debug', 'level', 'mph', 'seed']);
  expect(after.link).toBe(after.href);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The default boot is byte-identical
// ---------------------------------------------------------------------------

test('a default boot rides the shipped wheel with nothing in the store, and its lap is saved', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  const shipped = await page.evaluate(() => ({
    derivedTopSpeed: window.game.controller.derivedTopSpeed,
    overrides: window.game.snapshot().tuning.overrides,
    overrideCount: window.game.snapshot().tuning.overrideCount,
  }));
  // sqrt(16 · sin 0.50 / 0.00867) — §30.2 fact 1's 29.74, which is the frozen
  // table's own drag-only top since M30 Phase 4 (22.84 before it).
  expect(shipped.derivedTopSpeed).toBeCloseTo(
    Math.sqrt((EUC.leanToAccel * Math.sin(EUC.maxLeanPitch)) / EUC.dragCoefficient),
    9,
  );
  expect(shipped.derivedTopSpeed).toBeCloseTo(29.74, 2);
  expect(shipped.overrides).toEqual({});
  expect(shipped.overrideCount).toBe(0);

  // The control for the refusal above: the identical lap on the shipped wheel
  // is a personal best, so the refusal is the join and not a broken store.
  await page.evaluate(() => window.game.clearRecords());
  await completeLap(page, await gates(page));
  await expect(page.locator('[data-menu="results-panel"]')).toHaveAttribute('data-record', 'true');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New record');
  await expect(page.locator('[data-menu="results-notes"]')).not.toContainText('Diagnostic run');
  const saved = await page.evaluate(() => window.game.records.best(window.game.levelPlan.id));
  expect(saved).not.toBeNull();

  // And a world swap from here writes no `mph` into the address.
  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(() => window.game.snapshot().world.generated, undefined, { timeout: 20_000 });
  const params = new URL(await page.evaluate(() => window.location.href)).searchParams;
  expect(params.has('mph')).toBe(false);
  expect([...params.keys()].sort()).toEqual(['level', 'seed']);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The crash camera at 65 (§30.4 item 2)
// ---------------------------------------------------------------------------

test('the crash camera at 65: the body never nears the top of the frame, and the arm is not what frames it', async ({ page }) => {
  // **What this pins is a measurement, not a hope.** §30.4 item 2 asked for
  // M16's judgement repeated at 65 — M16 lengthened the arm because "a 50 mph
  // wipeout threw the ragdoll out through the *top* of the frame". Measured on
  // today's crash, at both speeds, the body does no such thing: its highest
  // point is a few hundredths above centre in the first frames, and it leaves
  // through the **bottom** — the camera is anchored on a wheel that rolls on
  // at ~22 m/s (~28 at 65) while the ragdoll stops within metres, so the
  // camera plane reaches the body's first corner at 0.65 s (50) / 0.40 s (65) with the crash
  // arm still at its riding length: it eases at `distanceResponseSeconds`
  // under the crash blend and has not moved yet. The arm therefore decides
  // nothing about the body at either speed (11.5 → 18.0 m at 65 all exit at
  // 0.35–0.37 s; M16's own 8.6 m at 50 exits at 0.60 s), and the preset keeps
  // the plan's linear scale (`CRASH_DISTANCE_EXPONENT`). If any of the numbers
  // below move, the camera changed and the exponent is worth re-measuring.
  const errors = collectErrors(page);

  //
  // **The two wheels swapped at M30 Phase 4**: 65 is the shipped table and 50
  // is the switch, so the default boot is the fast leg and `?mph=50` is the
  // slow one. Every measurement below is unchanged — this is the same pair of
  // wheels, read from the other side.
  await boot(page, 'level=proving&mph=50');
  const fifty = await measureCrashFraming(page, null);
  expect(fifty, 'the 50 mph wheel never cut out on the pad').not.toBeNull();
  if (fifty === null) return;

  await boot(page, 'level=proving');
  const sixtyFive = await measureCrashFraming(page, null);
  expect(sixtyFive, 'the shipped 65 mph wheel never cut out on the straight').not.toBeNull();
  if (sixtyFive === null) return;

  const describe = (label: string, r: NonNullable<typeof fifty>): string => (
    `${label} @ arm ${r.crashDistance.toFixed(2)} m, ${r.cause}/${r.motion} at ${(r.crashSpeed * MPH).toFixed(1)} mph: `
    + `body peak y ${r.peakY.toFixed(3)} at ${r.peakYAt.toFixed(2)} s, peak |x| ${r.peakX.toFixed(2)}, low y ${r.lowY.toFixed(2)}; `
    + `first corner behind the camera at ${r.passedAt.toFixed(2)} s, last at ${r.allBehindAt.toFixed(2)} s `
    + `(arm ${r.armAtPass.toFixed(2)} of riding ${r.armBefore.toFixed(2)}, `
    + `crash blend ${r.frameAtPass.toFixed(2)}); wheel peak |y| ${r.wheelPeakY.toFixed(2)}, behind ${r.wheelBehind}/${r.samples}; `
    + `arm at the end ${r.armAtEnd.toFixed(2)}`
  );
  const report = `${describe('50', fifty)} || ${describe('65', sixtyFive)}`;
  test.info().annotations.push({ type: 'crash framing', description: report });
  console.log(`[m30 crash framing] ${report}`);

  for (const [label, r] of [['50', fifty], ['65', sixtyFive]] as const) {
    expect(r.cause, label).toBe('cutout');
    expect(r.motion, label).toBe('faceplant');
    expect(r.recovered, label).toBe(true);
    // Never out through the top: M16's failure mode is absent at both speeds.
    expect(r.peakY, `${label}: ${report}`).toBeLessThan(0.15);
    expect(r.peakY, `${label}: ${report}`).toBeGreaterThan(-0.15);
    // Out through the bottom instead, and then behind the camera plane.
    expect(r.lowY, `${label}: ${report}`).toBeLessThan(-1);
    expect(Number.isNaN(r.passedAt), `${label}: no corner of the body ever went behind the camera — ${report}`).toBe(false);
    expect(Number.isNaN(r.allBehindAt), `${label}: some corner of the body stayed in front — ${report}`).toBe(false);
    expect(r.allBehindAt, `${label}: ${report}`).toBeGreaterThanOrEqual(r.passedAt);
    // While the crash arm is still the riding arm — which is why its length
    // has no purchase on the body.
    expect(r.armAtPass, `${label}: ${report}`).toBeLessThan(r.armBefore + 1);
    expect(r.armAtPass, `${label}: ${report}`).toBeLessThan(r.crashDistance - 3);
    // The wheel — what the camera is actually framing — stays in shot.
    expect(r.wheelBehind, label).toBe(0);
    expect(r.wheelPeakY, label).toBeLessThan(0.5);
  }
  // The accepted 50: 11.5 m, exit at about two thirds of a second.
  expect(fifty.crashDistance).toBeCloseTo(FIFTY.crashDistance, 9);
  expect(fifty.passedAt).toBeGreaterThan(0.5);
  expect(fifty.passedAt).toBeLessThan(0.9);
  // The last corner follows the first within a tenth of a second (0.55 → 0.65 s
  // measured): the body goes as one, not limb by limb.
  expect(fifty.allBehindAt).toBeLessThan(0.9);
  // 65 at the preset's arm: no worse above, sooner below — the relative speed
  // between a rolling wheel and a stopped body is the whole of it.
  expect(sixtyFive.crashDistance).toBeCloseTo(CAMERA.crashDistance, 9);
  expect(sixtyFive.crashDistance).toBeCloseTo(SIXTY_FIVE.crashDistance, 9);
  expect(sixtyFive.peakY).toBeLessThanOrEqual(fifty.peakY + 0.05);
  expect(sixtyFive.passedAt).toBeGreaterThan(0.3);
  expect(sixtyFive.passedAt).toBeLessThan(fifty.passedAt);
  // 0.35 → 0.40 s measured; Codex's per-vertex probe put the whole body
  // behind the camera at 0.45 s.
  expect(sixtyFive.allBehindAt).toBeLessThan(0.6);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The route is spaced for the wheel it is ridden on (§30.5 item 1)
// ---------------------------------------------------------------------------

/** The hazards and targets a loaded world carries, by id and in plan order. */
function loadedContent(page: Page): Promise<{ hazards: string[]; targets: string[]; seed: string }> {
  return page.evaluate(() => ({
    hazards: (window.game.levelPlan.hazards ?? []).map((hazard) => hazard.id),
    targets: (window.game.levelPlan.targets ?? []).map((target) => target.id),
    seed: window.game.snapshot().world.seed,
  }));
}

test('under ?mph=50 a route is spaced for the wheel it is ridden on, at boot and after a fresh route', async ({ page }) => {
  // **M30 Phase 1's browser half** (`docs/PLANS.md` §30.5 item 1), **with the
  // wheels swapped by Phase 4**. The arithmetic is proven headless
  // (`src/level/topSpeedRoutes.test.ts`): hazard and target separation are
  // *times*, so the shipped 65 mph wheel is spaced ≈82 m and ≈26 m where the
  // 50 is spaced ≈63 and ≈20, while the *density* is anchored on M16's 50 mph
  // wheel and scaled up with the top speed — so route-41 carries seven holes
  // on the shipped wheel against six under `?mph=50`, and not the same six
  // inside them. What only a browser can answer is whether the switch reaches
  // the **generator** through the two doors `Game` builds a world with — the
  // boot world built in the constructor, and `installLevel`'s fresh route,
  // which is the door M25's own lesson says a per-session value is most likely
  // to be dropped at.
  //
  // The world is compared against the headless build of the same seed rather
  // than against a count, because a count is satisfied by a world spaced for
  // some *other* wheel.
  const errors = collectErrors(page);
  const shipped = generateLevel('route-41').plan;
  const slow = generateLevel('route-41', undefined, undefined, 50).plan;
  const shippedIds = (shipped.hazards ?? []).map((hazard) => hazard.id);
  const slowIds = (slow.hazards ?? []).map((hazard) => hazard.id);
  // The fixture has to be able to tell the two apart, or every assertion below
  // passes on a world that ignored the switch.
  expect(slowIds).not.toEqual(shippedIds);

  await boot(page, 'mph=50&level=generated&seed=route-41');
  const booted = await loadedContent(page);
  expect(booted.seed).toBe('route-41');
  expect(await page.evaluate(() => window.game.controller.derivedTopSpeed))
    .toBeCloseTo(FIFTY.dragOnlyTop, 6);

  expect(booted.hazards, 'the boot world was spaced for the shipped wheel').toEqual(slowIds);
  expect(booted.targets).toEqual((slow.targets ?? []).map((target) => target.id));
  expect(booted.hazards).not.toEqual(shippedIds);

  // -- And through `installLevel`, which builds the next world from scratch --
  await page.evaluate(() => { window.game.setAppState('paused'); });
  await expect(page.locator('.euc-menu--pause')).toBeVisible();
  await page.locator('.euc-menu--pause [data-note="new-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'freeRide' && window.game.snapshot().world.generated,
    undefined,
    { timeout: 20_000 },
  );

  const fresh = await loadedContent(page);
  expect(fresh.seed).not.toBe('route-41');
  const freshSlow = generateLevel(fresh.seed, undefined, undefined, 50).plan;
  const freshShipped = generateLevel(fresh.seed).plan;
  expect(fresh.hazards, `the fresh route ${fresh.seed} was not spaced for 50`)
    .toEqual((freshSlow.hazards ?? []).map((hazard) => hazard.id));
  expect(fresh.targets).toEqual((freshSlow.targets ?? []).map((target) => target.id));
  // Surprise-me picks the seed, so whether its 50 and 65 builds differ at all
  // is luck. Assert the difference only where headless says there is one —
  // otherwise this line would flake on a seed the switch happens to leave
  // alone, which is a real and legal outcome. (On the density amendment all
  // sixteen of `topSpeedRoutes.test.ts`'s sweep seeds gain hazards at 65 and
  // none places the identical set at both speeds, where four of them used to;
  // the guard stays, because a fresh route is not one of those sixteen.)
  const freshShippedIds = (freshShipped.hazards ?? []).map((hazard) => hazard.id);
  if (JSON.stringify(freshShippedIds) !== JSON.stringify(fresh.hazards)) {
    expect(fresh.hazards).not.toEqual(freshShippedIds);
  }

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 3 — the lean (§30.8 item 4)
// ---------------------------------------------------------------------------

/**
 * Phase 0's `--pose fast-carve` recipe, in steps: five seconds flat out, then
 * full lock at full throttle held long enough for the roll to settle (the
 * response is 0.11 s) — `tools/rider-views.mjs`. The specs below ride it
 * through the **keyboard**, which is the half no capture tool and no headless
 * test covers: event → binding → action → controller → rig, at gameplay scale.
 */
const FLAT_OUT_STEPS = 600;
const CARVE_STEPS = 90;

/** The one expression, evaluated on a snapshot's own fields. */
function scheduledRiderRoll(euc: EucSnapshot): number {
  return riderRollFor(euc.rollAngle, euc.riderLean, euc.technicalTurn, euc.speed, EUC);
}

/**
 * Hold W for five seconds, then W and D together for three quarters of one,
 * and read the controller and the rig at the end of it. Real keys, not the
 * bridge: `setActions` would prove the schedule and nothing about the wire.
 *
 * The loop is frozen first, so the only simulation is the steps asked for and
 * the pose read out is the pose the assertions name (`AGENTS.md`).
 */
async function keyboardFastCarve(page: Page) {
  await page.evaluate(() => {
    window.qa.freeze();
    // Through the game's own reset, which hands the axes back to the device —
    // a scripted zero would outrank the keys below.
    window.qa.resetRide();
  });
  await page.keyboard.down('KeyW');
  await page.evaluate((steps) => { window.game.advance(steps); }, FLAT_OUT_STEPS);
  await page.keyboard.down('KeyD');
  const reading = await page.evaluate((steps) => {
    window.game.advance(steps);
    const snapshot = window.game.snapshot();
    const rig = window.qa.rigTransform();
    return {
      euc: snapshot.euc,
      throttle: snapshot.actions.throttle,
      steer: snapshot.actions.steer,
      pelvisRoll: rig.pelvisRoll,
      leanRoll: rig.leanRoll,
      distance: snapshot.euc.distanceTravelled,
    };
  }, CARVE_STEPS);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  return reading;
}

function describeCarve(label: string, euc: EucSnapshot, pelvisRoll: number): string {
  return `${label}: ${euc.speed.toFixed(2)} m/s on ${euc.surface}, wheel ${euc.rollAngle.toFixed(3)} rad, `
    + `rider ${euc.riderRoll.toFixed(3)} (share ${(euc.riderRoll / euc.rollAngle).toFixed(3)}), `
    + `lean ${euc.riderLean.toFixed(3)}, pelvis ${pelvisRoll.toFixed(4)}`;
}

test('a real fast carve on the shipped wheel: the wheel holds its bank and the rider hangs inside it', async ({ page }, testInfo) => {
  // **The acceptance view** (§30.8 item 4). The slice, because that is the
  // world Phase 0's "before" captures were taken in and the world the player
  // rides; its spawn straight is 116 m of pavement and this ride measures 78
  // of them, ending at 20.58 m/s and 0.643 rad — Phase 0's `--pose fast-carve`
  // capture to the hundredth, which is what makes the "before" baselines the
  // right thing to judge the "after" against.
  //
  // What it claims is the schedule *as the game computed it* — `riderRoll` is
  // `riderRollFor` of the snapshot's own fields, so a controller that drifted
  // from `simulation/riderLean.ts` fails here — plus the two things only a
  // browser can see: that the number reached the **rig** as the pelvis hinge,
  // and what it looks like from the normal camera.
  const errors = collectErrors(page);
  await boot(page);

  const carve = await keyboardFastCarve(page);
  const euc = carve.euc;
  const report = `${describeCarve('50', euc, carve.pelvisRoll)}, ridden ${carve.distance.toFixed(0)} m`;
  testInfo.annotations.push({ type: 'lean at 50', description: report });
  console.log(`[m30 lean] ${report}`);

  // The keyboard drove it, and the ride is where Phase 0 measured it:
  // 20.58 m/s and −0.643 rad on the spawn straight, still on pavement.
  expect(carve.throttle).toBe(1);
  expect(carve.steer).toBe(1);
  expect(euc.surface).toBe('pavement');
  expect(euc.offCourse).toBe(false);
  // Inside the 116 m spawn straight, which is what keeps the surface one thing.
  expect(carve.distance).toBeLessThan(116);
  expect(Math.abs(euc.speed)).toBeGreaterThan(18);
  expect(Math.abs(euc.rollAngle)).toBeGreaterThan(0.5);

  // The one expression.
  expect(euc.riderRoll).toBeCloseTo(scheduledRiderRoll(euc), 6);

  // **The hang** (M30 Phase 2, §30.7 item 3). The wheel's bank saturates at
  // the ordinary ceiling — `atan(maxLateralG)`, 36.9° on pavement — while the
  // rider's lean keeps chasing the whole cornering force, which at this speed
  // the schedule puts around 1.01 g. So the two are no longer one number: the
  // machine is at its bank ceiling and the body is past it.
  const bankCeiling = Math.atan(EUC.maxLateralG);
  expect(Math.abs(euc.rollAngle)).toBeLessThanOrEqual(bankCeiling + 1e-3);
  expect(Math.abs(euc.rollAngle)).toBeGreaterThan(bankCeiling - 1e-3);
  expect(Math.abs(euc.riderLean)).toBeGreaterThan(Math.abs(euc.rollAngle) + 0.1);
  expect(Math.sign(euc.riderLean)).toBe(Math.sign(euc.rollAngle));
  // Near the top of the *speed* schedule — 20.6 m/s is 0.90 of the way from 6
  // to 22.25 — so the body takes about 0.92 of the force lean, which over a
  // saturated bank is already more than the wheel's own angle.
  const shareOfLean = euc.riderRoll / euc.riderLean;
  expect(shareOfLean).toBeGreaterThan(0.85);
  expect(shareOfLean).toBeLessThanOrEqual(EUC.carveLeanShareTop);
  expect(Math.abs(euc.riderRoll)).toBeGreaterThan(Math.abs(euc.rollAngle));

  // And it reached the rig: the pelvis is the hinge that carries the
  // difference, which is what keeps the boots on the pedals while the torso
  // hangs inside. Its sign is the hang's — into the corner, not out of it.
  expect(carve.pelvisRoll).toBeCloseTo(-(euc.riderRoll - euc.rollAngle), 4);
  expect(Math.sign(carve.pelvisRoll)).toBe(-Math.sign(euc.rollAngle));
  expect(carve.leanRoll).toBeCloseTo(-euc.rollAngle, 3);

  await testInfo.attach('m30-fast-carve-player-view-50', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(errors).toEqual([]);
});

test('under ?mph=65 the same carve reaches full share: the rider hangs the whole 9.5 degrees inside', async ({ page }, testInfo) => {
  // **The world is the proving ground's pad, and it is a measurement.** The
  // schedule saturates at `carveLeanFullSpeed` (22.25 m/s), so this spec needs
  // a carve *held* above that speed. The 65 mph wheel passes it about four
  // seconds in, and the whole recipe — five seconds flat out and the hold —
  // measures **90 m at 25.3 m/s**. The slice's spawn straight is 116 m to the
  // bend, which leaves no room for that plus the two metres the carve walks
  // sideways; the proving ground's **pad** is 180 m long and 80 m wide, all of
  // it pavement (`level/provingGround.ts`), so the whole ride happens on one
  // surface with room on both sides. It is also the world the flat-out rides
  // at the top of this file already use, for the same reason.
  //
  // At full share `riderRoll === riderLean`: the body takes the whole of the
  // cornering lean. **Since M30 Phase 2 that is not the wheel's angle** — the
  // bank saturates at `atan(maxLateralG)` = 36.9° while the force asks for
  // `atan(carveGripTopG)` = 46.4°, so the pelvis hinge is 9.5° of hang rather
  // than zero. That is the pose of the §30.1 photographs, and it is the whole
  // of what the owner asked Phase 2 for: *"i need the rider to do the hang
  // like u say to corner at higher speeds."*
  const errors = collectErrors(page);
  await boot(page, 'level=proving&mph=65');

  const carve = await keyboardFastCarve(page);
  const euc = carve.euc;
  const report = `${describeCarve('65', euc, carve.pelvisRoll)}, ridden ${carve.distance.toFixed(0)} m`;
  testInfo.annotations.push({ type: 'lean at 65', description: report });
  console.log(`[m30 lean] ${report}`);

  expect(carve.throttle).toBe(1);
  expect(carve.steer).toBe(1);
  // Still on the pad, with the carve inside it.
  expect(euc.surface).toBe('pavement');
  expect(euc.offCourse).toBe(false);
  expect(carve.distance).toBeLessThan(180);
  // Above the anchor, which is the whole point of riding the fast wheel.
  expect(Math.abs(euc.speed)).toBeGreaterThanOrEqual(EUC.carveLeanFullSpeed);
  expect(Math.abs(euc.rollAngle)).toBeGreaterThan(0.5);

  expect(euc.riderRoll).toBeCloseTo(scheduledRiderRoll(euc), 6);
  // The whole of the force lean, at the top of the speed schedule.
  expect(euc.riderRoll / euc.riderLean).toBeCloseTo(EUC.carveLeanShareTop, 6);
  expect(euc.riderRoll).toBeCloseTo(euc.riderLean, 6);

  // The wheel is on its bank ceiling and the body is 9.5° inside it.
  const bankCeiling = Math.atan(EUC.maxLateralG);
  const leanCeiling = Math.atan(EUC.carveGripTopG);
  expect(Math.abs(euc.rollAngle)).toBeLessThanOrEqual(bankCeiling + 1e-3);
  expect(Math.abs(euc.rollAngle)).toBeGreaterThan(bankCeiling - 1e-3);
  expect(Math.abs(euc.riderLean)).toBeCloseTo(leanCeiling, 2);
  const hang = Math.abs(euc.riderRoll) - Math.abs(euc.rollAngle);
  expect(hang).toBeCloseTo(leanCeiling - bankCeiling, 2);
  // And the rig is where it shows: the pelvis hinge is the hang, measured off
  // the built rider rather than off the snapshot.
  expect(carve.pelvisRoll).toBeCloseTo(-(euc.riderRoll - euc.rollAngle), 4);
  expect(Math.abs(carve.pelvisRoll)).toBeGreaterThan(0.1);
  expect(carve.leanRoll).toBeCloseTo(-euc.rollAngle, 3);

  await testInfo.attach('m30-fast-carve-player-view-65', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(errors).toEqual([]);
});

test('the cop leans on the same expression, and his pelvis is the same hinge', async ({ page }) => {
  // **He is not a seat**, so `setActions` cannot reach him and the keyboard
  // path above is not his. `Game.stepCop` asks `copBrain.step` for an intent
  // every fixed step and rides `copController` on it, so the brain is hooked
  // the way `tools/rider-views.mjs` hooks it for his `--pose fast-carve`
  // capture: the brain still thinks, and only its throttle and steer are
  // overridden. The cast that reaches both objects is `tests/m20.spec.ts`'.
  //
  // The world is the slice under `?chaseprobe=1` — the M18 probe, a
  // brain-ridden cop on whatever world is loaded with no chase rules — which
  // is exactly the address his fast-carve baseline was captured at.
  //
  // What this pins is that his rig is not a second implementation: his rig is
  // the player's with every node name prefixed `cop-` (`render/copRider.ts`),
  // and the pelvis hinge on it has to be the same expression over his own
  // controller's numbers.
  const errors = collectErrors(page);
  await boot(page, 'chaseprobe=1');

  const carve = await page.evaluate(({ flatOut, carveSteps }) => {
    const game = window.game;
    window.qa.freeze();
    const internal = game as unknown as {
      copController: {
        reset(placement: { position: { x: number; y: number; z: number }; headingY: number }): void;
        snapshot(): EucSnapshot;
      } | null;
      copBrain: {
        step: (dt: number, view: unknown, quarry: unknown) => Record<string, unknown>;
      } | null;
    };
    const cop = internal.copController;
    const brain = internal.copBrain;
    if (cop === null || brain === null) throw new Error('the chase probe built no cop');

    // A few metres up the straight from the parked player, so the two never
    // share a contact patch.
    const spawn = game.levelPlan.spawn;
    const ahead = 8;
    cop.reset({
      position: {
        x: spawn.position.x + Math.sin(spawn.headingY) * ahead,
        y: spawn.position.y,
        z: spawn.position.z + Math.cos(spawn.headingY) * ahead,
      },
      headingY: spawn.headingY,
    });

    const think = brain.step.bind(brain);
    let script: Record<string, unknown> | null = null;
    brain.step = (dt, view, quarry) => {
      const intent = think(dt, view, quarry);
      return script === null ? intent : { ...intent, ...script, swing: false, hop: false };
    };
    const drive = (actions: Record<string, unknown>, steps: number): void => {
      script = actions;
      game.advance(steps);
    };
    drive({ throttle: 1 }, flatOut);
    drive({ throttle: 1, steer: 1 }, carveSteps);

    const pelvis = game.renderer.scene.getObjectByName('cop-rider-pelvis');
    const leanPivot = game.renderer.scene.getObjectByName('cop-riding-lean-pivot');
    if (!pelvis || !leanPivot) throw new Error('the cop rig is not in the scene');
    return {
      euc: cop.snapshot(),
      pelvisRoll: pelvis.rotation.z,
      leanRoll: leanPivot.rotation.z,
    };
  }, { flatOut: FLAT_OUT_STEPS, carveSteps: CARVE_STEPS });

  const euc = carve.euc;
  const report = describeCarve('cop', euc, carve.pelvisRoll);
  test.info().annotations.push({ type: 'lean, the cop', description: report });
  console.log(`[m30 lean] ${report}`);

  expect(Math.abs(euc.speed)).toBeGreaterThan(18);
  expect(Math.abs(euc.rollAngle)).toBeGreaterThan(0.5);
  // The same schedule over his own controller's fields — the live tuning that
  // reaches both controllers (`tests/m20.spec.ts`) is what makes `EUC` the
  // right table to ask.
  expect(euc.riderRoll).toBeCloseTo(scheduledRiderRoll(euc), 6);
  expect(euc.riderRoll / euc.rollAngle).toBeGreaterThan(0.85);
  // And the same hinge, on the prefixed copy of the rig.
  expect(carve.pelvisRoll).toBeCloseTo(-(euc.riderRoll - euc.rollAngle), 4);
  expect(carve.leanRoll).toBeCloseTo(-euc.rollAngle, 3);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 3b — the settle (§30.8, the owner's ride on Phase 3)
// ---------------------------------------------------------------------------

/** Ticks of the flick sampled one at a time, in the browser's own loop. */
const FLICK_STEPS = 150;

test('a flick at 65 keeps the old pose through the swing and settles back into the line', async ({ page }, testInfo) => {
  // **Phase 3b's acceptance view.** The owner rode Phase 3 and found what a
  // pure function of the wheel's state cannot express: *"the characters go V
  // like a motorcycle… from leaning all the way left to all the way right, and
  // vice versa (very stiff) meaning there is no transition. no animation. it
  // is awkward looking."* At the top of the schedule the pelvis hinge is zero
  // and the whole body whipped with the machine.
  //
  // Everything about the settle is proven headlessly
  // (`simulation/riderLean.test.ts`, `simulation/EucController.test.ts`); what
  // is left for a browser is the half no model covers — **the real keyboard**,
  // A against D, through binding, action, controller and rig at gameplay
  // scale, on the world the 65 mph specs above already ride for the reason
  // they give (the proving ground's 180 m pad, one surface, room either side).
  //
  // The loop is frozen and stepped one tick at a time inside a single
  // evaluate, so the wire carries one summary rather than one message per
  // sample (`AGENTS.md`).
  const errors = collectErrors(page);
  await boot(page, 'level=proving&mph=65');

  await page.evaluate(() => {
    window.qa.freeze();
    window.qa.resetRide();
  });
  await page.keyboard.down('KeyW');
  await page.evaluate((steps) => { window.game.advance(steps); }, FLAT_OUT_STEPS);
  await page.keyboard.down('KeyD');
  const held = await page.evaluate((steps) => {
    window.game.advance(steps);
    return {
      euc: window.game.snapshot().euc,
      pelvisRoll: window.qa.rigTransform().pelvisRoll,
      steer: window.game.snapshot().actions.steer,
    };
  }, CARVE_STEPS);

  // The bank is held, the settle is home, and the rider takes the whole of the
  // cornering lean — the pose the flick has to leave and come back to.
  // Unchanged by Phase 3b, which is the point of a settle that reaches exactly
  // one; **and since Phase 2 that pose is the hang**, because the wheel's bank
  // saturated at `atan(maxLateralG)` and the body did not.
  expect(held.steer).toBe(1);
  expect(held.euc.leanSettle).toBe(1);
  expect(Math.abs(held.euc.rollAngle)).toBeGreaterThan(0.5);
  expect(held.euc.riderRoll).toBeCloseTo(held.euc.riderLean, 6);
  expect(Math.abs(held.euc.riderLean)).toBeGreaterThan(Math.abs(held.euc.rollAngle) + 0.1);
  expect(held.pelvisRoll).toBeCloseTo(-(held.euc.riderRoll - held.euc.rollAngle), 4);
  expect(Math.abs(held.pelvisRoll)).toBeGreaterThan(0.1);

  // The flick itself: D up, A down, no simulation in between (the loop is
  // frozen), so the wheel never sees a tick of neutral steer.
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyA');
  const flick = await page.evaluate((steps) => {
    const samples: Array<{
      roll: number; rider: number; lean: number; settle: number; speed: number;
      pelvisRoll: number; surface: string; offCourse: boolean;
    }> = [];
    for (let i = 0; i < steps; i += 1) {
      window.game.advance(1);
      const euc = window.game.snapshot().euc;
      samples.push({
        roll: euc.rollAngle,
        rider: euc.riderRoll,
        lean: euc.riderLean,
        settle: euc.leanSettle,
        speed: euc.speed,
        pelvisRoll: window.qa.rigTransform().pelvisRoll,
        surface: euc.surface,
        offCourse: euc.offCourse,
      });
    }
    return { samples, steer: window.game.snapshot().actions.steer };
  }, FLICK_STEPS);
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');

  const samples = flick.samples;
  expect(flick.steer).toBe(-1);
  expect(samples).toHaveLength(FLICK_STEPS);

  const step = 1 / SIMULATION.hz;
  const rates = samples.map((sample, i) => (
    (sample.roll - (i === 0 ? held.euc.rollAngle : samples[i - 1]!.roll)) / step
  ));
  const lowShare = EUC.riderUpperBodyRollFactor;
  const crossing = samples.findIndex((sample) => Math.sign(sample.roll) !== Math.sign(held.euc.rollAngle));
  const zeroed = samples.findIndex((sample) => sample.settle === 0);
  const settled = samples.findIndex((sample, i) => i > crossing && sample.settle === 1);
  const report = `flick at 65: crossing tick ${crossing}, settle 0 at ${zeroed}, `
    + `back to 1 at ${settled}, speeds ${Math.min(...samples.map((s) => s.speed)).toFixed(2)}`
    + `-${Math.max(...samples.map((s) => s.speed)).toFixed(2)} m/s, `
    + `worst mid-swing pelvis ${Math.max(...samples.map((s) => Math.abs(s.pelvisRoll))).toFixed(3)} rad`;
  testInfo.annotations.push({ type: 'the settle, at 65', description: report });
  console.log(`[m30 settle] ${report}`);

  // The ride stayed on the pad, which is what keeps every sample comparable.
  for (const sample of samples) {
    expect(sample.surface).toBe('pavement');
    expect(sample.offCourse).toBe(false);
  }

  // (a) The body never leads the *cornering lean* and never leans the other
  // way from the wheel. The bound is `riderLean` rather than `rollAngle` since
  // M30 Phase 2: the wheel's bank saturates and the body's does not, so a
  // settled carve legitimately has the torso outside the machine's angle — and
  // the sign claim, which is what keeps the boots on the pedals, is unchanged.
  for (const [i, sample] of samples.entries()) {
    expect(Math.sign(sample.rider), `tick ${i}`).toBe(Math.sign(sample.roll));
    expect(Math.sign(sample.lean), `tick ${i}`).toBe(Math.sign(sample.roll));
    expect(Math.abs(sample.rider), `tick ${i}`)
      .toBeLessThanOrEqual(Math.abs(sample.lean) * EUC.carveLeanShareTop + 1e-12);
    expect(Math.abs(sample.lean), `tick ${i}`)
      .toBeGreaterThanOrEqual(Math.abs(sample.roll) - 1e-12);
    expect(sample.settle).toBeGreaterThanOrEqual(0);
    expect(sample.settle).toBeLessThanOrEqual(1);
  }

  // (b) **The old pose through the swing** — asserted where the swing has
  // lasted longer than the settle-out ramp itself, since the first few ticks
  // of any flick are the body leaving the lean rather than a breach of it.
  let swinging = 0;
  let sustained = 0;
  for (const [i, sample] of samples.entries()) {
    swinging = Math.abs(rates[i]!) >= EUC.carveLeanSwingRate ? swinging + step : 0;
    if (swinging < EUC.carveLeanSettleOut) continue;
    sustained += 1;
    expect(sample.settle, `tick ${i}`).toBe(0);
    expect(Math.abs(sample.rider / sample.roll - lowShare), `tick ${i}`).toBeLessThan(0.05);
    // And it reached the **rig**: the hinge the plank had lost is back, which
    // is the thing a screenshot would otherwise have to show.
    expect(Math.abs(sample.pelvisRoll), `tick ${i}`)
      .toBeCloseTo(Math.abs(sample.rider - sample.roll), 4);
  }
  expect(sustained, 'no sustained swing in a full-lock flick').toBeGreaterThan(3);

  // (c) No wobble: the settle is home before the wheel crosses upright, so the
  // body's angle falls once and rises once.
  expect(crossing).toBeGreaterThan(0);
  expect(zeroed).toBeGreaterThanOrEqual(0);
  expect(zeroed).toBeLessThan(crossing);
  expect(settled).toBeGreaterThan(crossing);
  for (let i = 1; i < crossing; i += 1) {
    expect(Math.abs(samples[i]!.rider), `tick ${i}`)
      .toBeLessThanOrEqual(Math.abs(samples[i - 1]!.rider) + 1e-12);
  }
  for (let i = crossing + 2; i <= settled; i += 1) {
    expect(Math.abs(samples[i]!.rider), `tick ${i}`)
      .toBeGreaterThanOrEqual(Math.abs(samples[i - 1]!.rider) - 1e-12);
  }

  // (d) And the lean arrives: once the wheel holds its new bank the settle
  // climbs back inside the ramp's own time, the share with it, and the pose is
  // the line again — the pelvis hinge back at zero on the far side.
  const holding = samples.findIndex((sample, i) => Math.abs(rates[i]!) < EUC.carveLeanHoldRate && sample.settle < 1);
  expect(holding).toBeGreaterThan(0);
  expect(settled - holding).toBeLessThanOrEqual(Math.round(EUC.carveLeanSettleIn * SIMULATION.hz) + 3);
  for (let i = holding + 1; i <= settled; i += 1) {
    expect(samples[i]!.settle, `tick ${i}`).toBeGreaterThanOrEqual(samples[i - 1]!.settle);
  }
  const back = samples[settled]!;
  expect(back.rider).toBeCloseTo(
    riderRollFor(back.roll, back.lean, 0, back.speed, EUC),
    9,
  );
  if (Math.abs(back.speed) >= EUC.carveLeanFullSpeed) {
    // The whole of the lean again — which over a saturated bank is the hang,
    // not one line (M30 Phase 2).
    expect(back.rider).toBeCloseTo(back.lean * EUC.carveLeanShareTop, 9);
    expect(back.pelvisRoll).toBeCloseTo(-(back.rider - back.roll), 4);
  }

  await testInfo.attach('m30-settle-player-view-65', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 2 — the give at speed (§30.7 item 3)
// ---------------------------------------------------------------------------

/** The pinned dense seed the chase specs use, so the cop has a real route. */
const CHASE_SEED = 'route-41';

/** One cop sample: where he is, how fast, and what the clamp gave him. */
interface CopSample {
  x: number; z: number; speed: number; lateralAccel: number;
  limitG: number; crashed: boolean;
}

/**
 * Start a chase and drive the *player* along the route while sampling the cop.
 *
 * The player has to ride the line: the cop chases the quarry, so a rider who
 * holds the throttle straight off into the field takes him with her and the
 * corners never happen (the first draft of this measured 150 m of field). The
 * driver is `qa.followRoute`'s — two gains, no eyes, and the same negative
 * steer sign for the same reason (`tests/harness.ts`) — inlined so the cop can
 * be read as it goes.
 *
 * `gripTopG` is the A/B: `null` rides the shipped schedule, and a number is
 * what the F4 slider does, so passing `EUC.maxLateralG` is the pre-M30 ride.
 */
async function driveChaseAt65(
  page: Page,
  route: readonly { x: number; z: number }[],
  gripTopG: number | null,
): Promise<{ samples: CopSample[]; steps: number; phase: string; secondRider: string; crashes: number }> {
  await page.evaluate(() => { window.game.startChase(); });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  return page.evaluate(({ points, grip }) => {
    const game = window.game;
    // His own controller, reached the way `tests/m20.spec.ts` and the cop's
    // pelvis spec above reach it: the scene rig's root carries its placement in
    // a child, and what this needs is his state anyway.
    const internal = game as unknown as { copController: { snapshot(): EucSnapshot } | null };
    const cop = internal.copController;
    if (cop === null) throw new Error('the chase built no cop');
    // The panel reaches both controllers (`tests/m20.spec.ts`), which is what
    // makes this an A/B of the schedule rather than of the player's wheel.
    if (grip !== null) game.tuning.set('EUC.carveGripTopG', grip);
    // Frozen, so the only simulation is the steps asked for.
    window.qa.freeze();

    const samples: CopSample[] = [];
    let index = 0;
    let steps = 0;
    const lookAhead = 24;
    while (steps < 5400) {
      const euc = game.snapshot().euc;
      const { x, z } = euc.position;
      while (
        index < points.length - 1
        && Math.hypot(points[index]!.x - x, points[index]!.z - z) < lookAhead
      ) index += 1;
      if (index >= points.length - 1) break;
      const target = points[index]!;
      let error = Math.atan2(target.x - x, target.z - z) - euc.headingY;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      game.setActions({
        throttle: Math.max(0.25, 1 - Math.abs(error)),
        steer: Math.max(-1, Math.min(1, -error * 1.8)),
      });
      game.advance(15);
      steps += 15;
      if (game.snapshot().chase.phase !== 'running') break;
      const state = cop.snapshot();
      samples.push({
        x: state.position.x,
        z: state.position.z,
        speed: state.speed,
        lateralAccel: state.lateralAccel,
        limitG: state.lateralLimitG,
        crashed: state.crashed,
      });
    }
    game.clearActions();
    const end = game.snapshot();
    return {
      samples,
      steps,
      phase: end.chase.phase,
      secondRider: end.chase.secondRider,
      crashes: cop.snapshot().crashes,
    };
  }, { points: route as { x: number; z: number }[], grip: gripTopG });
}

test('at 65 the cop still holds the corridor through the fastest corner he meets', async ({ page }, testInfo) => {
  // **The cop's half of Phase 2** (§30.7 items 1 and 3). The lateral ceiling
  // rises with speed, so the speed a corner allows is the fixed point of
  // `v = sqrt(ceiling(v) · grip · g / κ)` rather than one division, and a brain
  // that read the ceiling at the speed it is *currently* doing would believe a
  // bend it is braking into holds 1.05 g and arrive far too fast.
  // `simulation/cpuRider.test.ts` asserts the fixed point itself and the
  // 48-seed sweep asserts he rides the routes out; what only a browser can add
  // is the whole thing wired together at the top of the speed range — the
  // switch, the generated route, the live tuning, two controllers and the
  // brain — with his line measured against the actual road.
  //
  // **And it is measured as an A/B**, because "in the corridor" is not by
  // itself a claim about the phase: a chase is a pursuit and a cop's line
  // legitimately runs a little wide of the centre corridor whatever the grip
  // is. What the phase has to answer is *did the give make it worse* — so the
  // same route is ridden twice, once on the schedule and once with
  // `carveGripTopG` on the F4 slider's floor, which is the shipped ride
  // exactly.
  //
  // The corridor is the route's own: `RouteSpine.locate` gives the distance off
  // the line and the rideable half-width there, which is the half-width the
  // route validator judges fairness by.
  const errors = collectErrors(page);
  const { plan } = generateLevel(CHASE_SEED, undefined, undefined, 65);
  const spine = RouteSpine.fromPlan(plan);
  expect(spine).not.toBeNull();
  if (spine === null) return;

  // The line itself, every five metres, from the same spine the cop's brain
  // follows rather than from a second reconstruction of the route.
  const line = createSpineSample();
  const points: { x: number; z: number }[] = [];
  for (let d = 0; d <= spine.length; d += 5) {
    spine.sample(d, line);
    points.push({ x: line.x, z: line.z });
  }
  expect(points.length).toBeGreaterThan(60);

  await bootToTitle(page, `level=generated&seed=${CHASE_SEED}&mph=65`);

  /** The worst his line got, and the fastest bend he met, measured off the spine. */
  const measure = (samples: readonly CopSample[]): {
    worstRatio: number; worstOff: number; worstHalf: number; worstAt: number;
    fastestAllow: number; fastestRadius: number; fastestRatio: number; ridden: number;
  } => {
    const location = createSpineLocation();
    const a = createSpineSample();
    const b = createSpineSample();
    let near = -1;
    let travelled = 0;
    let ridden = 0;
    let worstRatio = 0;
    let worstOff = 0;
    let worstHalf = 0;
    let worstAt = 0;
    let fastestAllow = 0;
    let fastestRadius = 0;
    let fastestRatio = 0;
    for (const [i, sample] of samples.entries()) {
      if (i > 0) {
        const previous = samples[i - 1]!;
        const step = Math.hypot(sample.x - previous.x, sample.z - previous.z);
        travelled += step;
        ridden += step;
      }
      // **The search window advances by what he actually rode, not by where
      // the last search landed.** `locate` windows around `near` so a route
      // that crosses itself cannot teleport a follower onto the other road —
      // and feeding it its own previous answer lets one bad landing carry: a
      // first draft read three single-sample spikes of 47, 30 and 19 metres
      // between neighbours a tenth of a second and three metres apart, which
      // is a mis-location rather than a cop.
      spine.locate(sample.x, sample.z, near < 0 ? -1 : near + travelled, location);
      near = near < 0 ? location.distance : near + travelled;
      travelled = 0;
      // He spawns `CHASE.spawnGapMetres` *behind* the route's start, so his
      // first seconds are legitimately off a line that has not begun yet.
      if (location.distance < 20) continue;
      const ratio = location.offRoute / Math.max(1e-6, location.halfWidth);
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstOff = location.offRoute;
        worstHalf = location.halfWidth;
        worstAt = location.distance;
      }
      // The corner he is in, and the speed the schedule allows there. The
      // "fastest corner" is the quickest bend on his line that is a bend at
      // all: a straight allows any speed and says nothing about the give.
      const curvature = Math.abs(spine.curvature(location.distance, location.distance + 6, a, b));
      if (curvature <= 2e-3) continue;
      const allow = Math.sqrt((lateralCeilingG(29, EUC) * 9.81) / curvature);
      if (allow > fastestAllow) {
        fastestAllow = allow;
        fastestRadius = 1 / curvature;
        fastestRatio = ratio;
      }
    }
    return {
      worstRatio, worstOff, worstHalf, worstAt,
      fastestAllow, fastestRadius, fastestRatio, ridden,
    };
  };

  const on = await driveChaseAt65(page, points, null);
  const off = await driveChaseAt65(page, points, EUC.maxLateralG);

  expect(on.secondRider).toBe('cop');
  expect(on.samples.length).toBeGreaterThan(100);
  expect(off.samples.length).toBeGreaterThan(100);

  const withGive = measure(on.samples);
  const without = measure(off.samples);

  const say = (label: string, r: ReturnType<typeof measure>, run: typeof on): string => (
    `${label}: ${run.samples.length} samples over ${run.steps} steps, ${r.ridden.toFixed(0)} m `
    + `at up to ${Math.max(...run.samples.map((sample) => sample.speed)).toFixed(1)} m/s; worst line `
    + `${r.worstOff.toFixed(2)} m off a ${r.worstHalf.toFixed(2)} m half-width `
    + `(${(r.worstRatio * 100).toFixed(0)}%) at ${r.worstAt.toFixed(0)} m; fastest bend `
    + `1/${r.fastestRadius.toFixed(0)} m allows ${r.fastestAllow.toFixed(1)} m/s, `
    + `his line ${(r.fastestRatio * 100).toFixed(0)}% of the corridor there`
  );
  const report = `${say('with the give', withGive, on)} | ${say('without', without, off)}`;
  testInfo.annotations.push({ type: 'the cop at 65', description: report });
  console.log(`[m30 chase] ${report}`);

  // He actually went somewhere, which is what stops a stuck cop from passing a
  // corridor test by standing on the line — and he stayed on the wheel, which
  // is the other half of not overcooking a corner.
  expect(withGive.ridden).toBeGreaterThan(400);
  expect(on.crashes).toBe(0);
  expect(on.samples.some((sample) => sample.crashed)).toBe(false);
  expect(Math.max(...on.samples.map((sample) => sample.speed))).toBeGreaterThan(20);

  // **The A/B.** The give must not push his line wider than the shipped ride
  // does. A tenth of a half-width of slack, because the two rides are different
  // rides — he corners faster on the schedule and meets the same bends from
  // slightly different places.
  expect(withGive.worstRatio).toBeLessThanOrEqual(without.worstRatio + 0.1);
  // And through the fastest bend on his line he is well inside the road.
  expect(withGive.fastestRatio).toBeLessThanOrEqual(1);
  expect(withGive.fastestRadius).toBeLessThan(500);

  // His cornering force never passes what the wheel can hold at the speed he is
  // doing: the M30 schedule, plus M16's technical-turn bonus where it has not
  // faded out — the bonus is what lets a cop pull nearly a g at walking pace to
  // get himself round something, and it is unchanged by this phase. Read with
  // the same half-a-metre-a-second allowance `tests/m2.spec.ts` uses, for the
  // same intra-step reason, and without the surface's grip, which only ever
  // makes the true limit smaller.
  for (const sample of on.samples) {
    const speed = Math.abs(sample.speed);
    const bonus = EUC.technicalTurnBonusG
      * Math.max(0, 1 - Math.max(0, speed - 0.5) / EUC.technicalTurnFadeSpeed);
    expect(Math.abs(sample.lateralAccel))
      .toBeLessThanOrEqual((lateralCeilingG(speed + 0.5, EUC) + bonus) * 9.81 + 1e-6);
    expect(sample.limitG).toBeGreaterThan(0);
  }

  expect(errors).toEqual([]);
});
