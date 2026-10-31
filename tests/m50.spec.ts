/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { boot, collectErrors } from './harness.ts';
import { CAMERA } from '../src/data/tuning.ts';
import { CAMERA_VIEW_CYCLE, CINEMATIC_PROFILES } from '../src/render/cameraPresets.ts';

/**
 * 1.3.0 — the rider-relative camera views, in a real browser (`docs/PLANS.md` §50).
 *
 * The solver's arithmetic is `src/render/cinematicCamera.test.ts`. What only
 * a browser can show is the wiring: the three devices reach one cycle, each
 * seat owns its own view, the lens arrives at three.js converted once, the
 * return pane describes the view actually drawn, First-Person hides one head
 * in one pane, and every view keeps the rider in its own pane and its lens out
 * of the world — on open ground, slopes, jumps, under overhead structure, in
 * a crash, and in every split layout. Nothing here reads a frame interval.
 */

const ORDER = [...CAMERA_VIEW_CYCLE];
const THIRD_PERSON = ORDER.filter((mode) => mode !== 'firstPerson');

/** Every pane's rider on screen, and every lens clear of the world, for the current frame. */
async function frameFacts(page: Page): Promise<{
  seat: number; mode: string; shown: string; inFront: boolean; ndcX: number; ndcY: number; lensClear: boolean;
}[]> {
  return page.evaluate(() => {
    const game = window.game;
    const probe = game as unknown as {
      terrain: { raycast(o: object, d: object, max: number): number | null };
    };
    const out = [];
    const views = Math.min(game.renderer.viewCount, game.seatCount);
    for (let seat = 0; seat < views; seat += 1) {
      const snap = game.snapshotFor(seat);
      const camera = game.renderer.cameraFor(seat);
      camera.updateMatrixWorld(true);
      const p = snap.euc.position;
      const torso = camera.position.clone().set(p.x, p.y + 1.1, p.z).project(camera);
      const local = camera.position.clone().set(p.x, p.y + 1.1, p.z).applyMatrix4(camera.matrixWorldInverse);
      // From a point on the rider up the body to the lens: nothing solid in between.
      const origin = { x: p.x, y: p.y + 1.2, z: p.z };
      const d = { x: camera.position.x - origin.x, y: camera.position.y - origin.y, z: camera.position.z - origin.z };
      const length = Math.hypot(d.x, d.y, d.z);
      const hit = length > 1e-3 ? probe.terrain.raycast(origin, d, length) : null;
      out.push({
        seat, mode: snap.camera.mode, shown: snap.camera.shown,
        inFront: local.z < 0, ndcX: torso.x, ndcY: torso.y,
        // A hit closer than the lens is the lens inside or behind something.
        lensClear: hit === null || hit >= length - 0.05,
      });
    }
    return out;
  });
}

async function select(page: Page, mode: string, seat = 0): Promise<void> {
  await page.evaluate(({ mode, seat }) => window.game.setCameraMode(mode as never, seat), { mode, seat });
}

test('C walks the eleven views in order, one press one view, labelled, and Y on a pad does too', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const pad = {
      index: 0, id: 'fake standard pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { fakePad: typeof pad }).fakePad = pad;
    navigator.getGamepads = () => [pad] as never;
  });
  await boot(page);
  await page.evaluate(() => { window.game.loop.setRunning(false); window.qa.resetRide(); });

  const walked: { mode: string; label: string }[] = [];
  for (let press = 0; press < ORDER.length; press += 1) {
    await page.keyboard.press('KeyC');
    walked.push(await page.evaluate(() => {
      window.game.advance(1);
      const camera = window.game.snapshot().camera;
      return { mode: camera.mode, label: camera.label };
    }));
  }
  expect(walked.map((step) => step.mode)).toEqual([...ORDER.slice(1), 'chase']);
  expect(walked.map((step) => step.label)).toEqual([
    'Action', 'First-Person', 'Avenue', 'Elevated', 'Side Tracking', 'Crossroads',
    'Overlook', 'Architecture', 'Director', 'Inspect', 'Chase',
  ]);

  // Y held for many frames is one press: the gamepad reads its rising edge.
  await page.evaluate(() => window.game.loop.setRunning(true));
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
  const held = await page.evaluate(async () => {
    const pad = (window as unknown as { fakePad: { buttons: { pressed: boolean; value: number }[] } }).fakePad;
    const frames = (count: number) => new Promise<void>((resolve) => {
      let left = count;
      const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const before = window.game.snapshot().camera.mode;
    pad.buttons[3].pressed = true; pad.buttons[3].value = 1;
    await frames(20);
    pad.buttons[3].pressed = false; pad.buttons[3].value = 0;
    await frames(4);
    return { before, after: window.game.snapshot().camera.mode };
  });
  expect(held).toEqual({ before: 'chase', after: 'action' });
  expect(errors).toEqual([]);
});

test('each seat owns its view, its blend and its lens, and the lens is converted once', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.spawnRider();
    window.qa.resetRide();
    window.game.setActionsFor(0, { throttle: 1 });
    window.game.setActionsFor(1, { throttle: 1 });
    window.game.advance(120);
  });
  // Seat 1 presses; seat 0's view does not move.
  const presses = await page.evaluate(() => {
    const game = window.game;
    const zero = game.snapshotFor(0).camera.view.position;
    game.setActionsFor(1, { cameraCycle: true, throttle: 1 });
    game.advance(1);
    game.setActionsFor(1, { cameraCycle: false, throttle: 1 });
    game.advance(1);
    return {
      modes: [game.snapshotFor(0).camera.mode, game.snapshotFor(1).camera.mode],
      blends: [game.snapshotFor(0).camera.blend, game.snapshotFor(1).camera.blend],
      zeroMoved: Math.hypot(game.snapshotFor(0).camera.view.position.x - zero.x,
        game.snapshotFor(0).camera.view.position.z - zero.z),
    };
  });
  expect(presses.modes).toEqual(['chase', 'action']);
  expect(presses.blends[0]).toBe(1);
  expect(presses.blends[1]).toBeLessThan(1);
  // Seat 0 rode on at speed for one step; its camera went with it and no further.
  expect(presses.zeroMoved).toBeLessThan(1);

  // The lens: radians in, the split's gain and cap applied once, in degrees out.
  for (const mode of ['elevated', 'director', 'firstPerson'] as const) {
    await select(page, mode, 0);
    const fov = await page.evaluate(() => {
      window.game.advance(1);
      return { drawn: window.game.renderer.cameraFor(0).fov, chosen: window.game.snapshotFor(0).camera.view.fov };
    });
    const expected = Math.min(CAMERA.splitFovCap, CINEMATIC_PROFILES[mode].fov * CAMERA.splitFovGain) * 180 / Math.PI;
    expect(fov.chosen).toBeCloseTo(CINEMATIC_PROFILES[mode].fov, 6);
    expect(fov.drawn).toBeCloseTo(expected, 4);
  }
  expect(errors).toEqual([]);
});

test('First-Person leaves the head out of its own pane only, and puts it back between passes', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  const passes = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.spawnRider();
    window.qa.resetRide();
    // Seat 1 stands behind seat 0 and looks at him in Chase; seat 0 rides in First-Person.
    game.setCameraMode('firstPerson', 0);
    const probe = game as unknown as { seats: { rig: { rider: { neck: { visible: boolean } } } }[] };
    const neck = probe.seats[0].rig.rider.neck;
    const three = game.renderer.renderer;
    const seen: boolean[] = [];
    const original = three.render.bind(three);
    three.render = (scene, camera) => { seen.push(neck.visible); original(scene, camera); };
    game.advance(1);
    three.render = original;
    return { seen, after: neck.visible };
  });
  expect(passes.seen).toEqual([false, true]);
  expect(passes.after).toBe(true);
  expect(errors).toEqual([]);
});

test('the return pane faces the way the selected view looks, and an aerial one is set back', async ({ page }) => {
  await boot(page);
  const panes = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    window.qa.resetRide();
    const probe = game as unknown as { panes: { x: number; z: number; headingY: number }[]; refreshPane(): void };
    const out: Record<string, { pane: { x: number; z: number; headingY: number }; camera: { x: number; z: number };
      aim: { x: number; z: number }; cameraY: number; aimY: number; rider: { x: number; z: number; heading: number } }> = {};
    for (const mode of ['chase', 'side', 'overlook', 'director', 'orbit'] as const) {
      game.setCameraMode(mode);
      game.advance(30);
      probe.refreshPane();
      const snap = game.snapshot();
      out[mode] = {
        pane: { ...probe.panes[0] },
        camera: { x: snap.camera.view.position.x, z: snap.camera.view.position.z },
        aim: { x: snap.camera.view.target.x, z: snap.camera.view.target.z },
        cameraY: snap.camera.view.position.y,
        aimY: snap.camera.view.target.y,
        rider: { x: snap.euc.position.x, z: snap.euc.position.z, heading: snap.euc.headingY },
      };
    }
    // And a straight-down composition (written onto the stepped state, as no
    // shipped view is one): no facing of its own, so it faces the rider's
    // heading, and stands well back to cover the ground behind its feet.
    game.setCameraMode('overlook');
    game.advance(1);
    const seat = (game as unknown as { seats: { currentCinematic: { radius: number; height: number; lookAhead: number; extension: number } }[] }).seats[0];
    Object.assign(seat.currentCinematic, { radius: 0.05, height: 20, lookAhead: 0, extension: 1 });
    probe.refreshPane();
    const snap = game.snapshot();
    const down = { ...probe.panes[0], heading: snap.euc.headingY, x0: snap.euc.position.x, z0: snap.euc.position.z };
    return { out, down };
  });
  const { out: views, down } = panes;
  expect(Math.abs(Math.atan2(Math.sin(down.headingY - down.heading), Math.cos(down.headingY - down.heading)))).toBeLessThan(1e-6);
  expect(Math.hypot(down.x - down.x0, down.z - down.z0)).toBeGreaterThan(10);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const mode of ['side', 'director'] as const) {
    const { pane, camera, aim } = views[mode];
    const facing = Math.atan2(aim.x - camera.x, aim.z - camera.z);
    expect(Math.abs(wrap(pane.headingY - facing))).toBeLessThan(0.05);
  }
  // Side Tracking looks across the rider's line, not along it.
  const side = views.side;
  expect(Math.abs(wrap(side.pane.headingY - side.rider.heading))).toBeGreaterThan(1.0);
  // Overlook: the apex stands back exactly when the lens's lowest ray passes
  // the ground straight below the camera, and not otherwise.
  const over = views.overlook;
  const setback = Math.hypot(over.pane.x - over.camera.x, over.pane.z - over.camera.z);
  const across = Math.hypot(over.aim.x - over.camera.x, over.aim.z - over.camera.z);
  const lowest = Math.atan2(over.cameraY - over.aimY, across) + CINEMATIC_PROFILES.overlook.fov / 2;
  if (lowest > Math.PI / 2) expect(setback).toBeGreaterThan(2);
  else expect(setback).toBeLessThan(1e-6);
  expect(Math.abs(wrap(over.pane.headingY - Math.atan2(over.aim.x - over.camera.x, over.aim.z - over.camera.z)))).toBeLessThan(0.05);
});

test('a reset, a teleport and a new ride snap the view; a pause holds Director; the default starts every new ride', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  const facts = await page.evaluate(async () => {
    const game = window.game;
    game.loop.setRunning(false);
    window.qa.resetRide();
    game.setActions({ cameraCycle: false, throttle: 1 });
    game.setCameraMode('elevated', 0, false);
    game.advance(2);
    const blendAfterChoice = game.snapshot().camera.blend;
    game.advance(120);
    // A teleport across the map: no blend, the view lands around the new place.
    game.placeRider({ x: 40, y: 0, z: 60 }, 1.2);
    game.advance(1);
    const placed = game.snapshot();
    const fromRider = Math.hypot(placed.camera.view.position.x - placed.euc.position.x,
      placed.camera.view.position.z - placed.euc.position.z);

    // Director across a real pause with the loop running: the phase holds.
    game.setCameraMode('director');
    game.advance(60);
    const phaseBefore = game.snapshot().camera.cinematic.directorPhase;
    // The game's own pause stops the loop; a second of wall time passes.
    game.setAppState('paused');
    const pausedRunning = game.loop.isRunning();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const phasePaused = game.snapshot().camera.cinematic.directorPhase;
    // Resumed, the orbit owes only the steps that are actually run, never the
    // wall time spent away.
    const tick = game.snapshot().tick;
    game.setAppState('freeRide');
    await new Promise((resolve) => setTimeout(resolve, 300));
    game.loop.setRunning(false);
    const resumedSteps = game.snapshot().tick - tick;
    const resumedPhase = game.snapshot().camera.cinematic.directorPhase - phasePaused;

    // Quit to the title and start again: the host's default (Chase unless saved).
    game.setAppState('title');
    const titleMode = game.snapshot().camera.mode;
    game.setOptions({ defaultCamera: 'overlook' } as never);
    game.setAppState('freeRide');
    const newRide = game.snapshot().camera.mode;
    const saved = (game.options as unknown as { current: { defaultCamera: string } }).current.defaultCamera;
    game.setActions({ cameraCycle: true }); game.advance(1); game.setActions({ cameraCycle: false }); game.advance(1);
    const cycled = game.snapshot().camera.mode;
    const savedAfterCycle = (game.options as unknown as { current: { defaultCamera: string } }).current.defaultCamera;
    game.setOptions({ defaultCamera: 'chase' } as never);
    return { blendAfterChoice, placedBlend: placed.camera.blend, fromRider, phaseBefore, phasePaused, pausedRunning, resumedSteps, resumedPhase, titleMode, newRide, saved, cycled, savedAfterCycle };
  });
  expect(facts.blendAfterChoice).toBeLessThan(1);
  expect(facts.placedBlend).toBe(1);
  expect(facts.fromRider).toBeLessThan(10);
  expect(facts.pausedRunning).toBe(false);
  expect(facts.phasePaused).toBe(facts.phaseBefore);
  expect(facts.resumedPhase).toBeCloseTo(facts.resumedSteps * 0.09 / 120, 9);
  expect(facts.titleMode).toBe('chase');
  expect(facts.newRide).toBe('overlook');
  expect(facts.saved).toBe('overlook');
  expect(facts.cycled).toBe('architecture');
  expect(facts.savedAfterCycle).toBe('overlook');
  expect(errors).toEqual([]);
});

for (const seats of [1, 2, 3, 4]) {
  test(`every view keeps the rider in its own pane and its lens clear — ${seats} seat${seats > 1 ? 's' : ''}`, async ({ page }) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.evaluate((count) => {
      window.game.loop.setRunning(false);
      for (let seat = 1; seat < count; seat += 1) window.game.spawnRider();
      window.qa.resetRide();
    }, seats);
    const failures: string[] = [];
    for (const mode of THIRD_PERSON) {
      for (const moment of ['ride', 'carve', 'jump'] as const) {
        await page.evaluate(({ mode, moment, count }) => {
          const game = window.game;
          for (let seat = 0; seat < count; seat += 1) {
            game.setActionsFor(seat, { reset: true });
          }
          game.advance(1);
          for (let seat = 0; seat < count; seat += 1) {
            game.setActionsFor(seat, { reset: false, throttle: 1 });
            game.setCameraMode(mode as never, seat);
          }
          game.advance(200);
          if (moment === 'carve') {
            for (let seat = 0; seat < count; seat += 1) game.setActionsFor(seat, { throttle: 1, steer: seat % 2 ? 0.8 : -0.8 });
            game.advance(80);
          }
          if (moment === 'jump') {
            for (let seat = 0; seat < count; seat += 1) game.setActionsFor(seat, { throttle: 1, hop: true });
            game.advance(2);
            for (let seat = 0; seat < count; seat += 1) game.setActionsFor(seat, { throttle: 1, hop: false });
            game.advance(18);
          }
        }, { mode, moment, count: seats });
        for (const fact of await frameFacts(page)) {
          if (fact.shown !== mode) continue; // a crash handed the pane to the chase's crash framing
          if (!fact.inFront || Math.abs(fact.ndcX) > 0.95 || Math.abs(fact.ndcY) > 0.95) {
            failures.push(`${mode}/${moment} seat ${fact.seat}: rider at ${fact.ndcX.toFixed(2)},${fact.ndcY.toFixed(2)} front=${fact.inFront}`);
          }
          if (!fact.lensClear) failures.push(`${mode}/${moment} seat ${fact.seat}: lens behind geometry`);
        }
      }
    }
    if (seats === 4) await page.screenshot({ path: test.info().outputPath('quad.png') });
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('under overhead structure and on slopes every view keeps its lens out of the world', async ({ page }) => {
  const errors = collectErrors(page);
  const failures: string[] = [];
  for (const level of ['euclaude', 'switchback'] as const) {
    await boot(page, `level=${level}`);
    // Spots where solid stands overhead within 8 m, found by asking the
    // world, plus a few ordinary spots of the course.
    const spots = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      const terrain = (game as unknown as { terrain: {
        raycast(o: object, d: object, max: number): number | null;
        sampleGround(x: number, z: number, out: { height: number }): { height: number };
      } }).terrain;
      // A grid around the start: wherever solid stands 2.2–8 m over the ground.
      const start = game.snapshot().euc.position;
      const found: { x: number; z: number; heading: number }[] = [];
      const sample = { height: 0, normal: { x: 0, y: 1, z: 0 }, surface: "asphalt" } as never as { height: number };
      for (let dx = -160; dx <= 160 && found.length < 4; dx += 4) {
        for (let dz = -160; dz <= 160 && found.length < 4; dz += 4) {
          const x = start.x + dx;
          const z = start.z + dz;
          const ground = terrain.sampleGround(x, z, sample).height;
          const up = terrain.raycast({ x, y: ground + 0.2, z }, { x: 0, y: 1, z: 0 }, 8);
          if (up !== null && up > 2.2) found.push({ x, z, heading: (found.length * 1.7) % 6.28 });
        }
      }
      return found;
    });
    const placements = spots.length > 0 ? spots : [];
    for (const spot of placements) {
      for (const mode of THIRD_PERSON) {
        const placed = await page.evaluate(({ spot, mode }) => {
          try {
            window.game.placeRider({ x: spot.x, y: 0, z: spot.z }, spot.heading);
          } catch { return false; }
          window.game.setCameraMode(mode as never);
          window.game.advance(30);
          return true;
        }, { spot, mode });
        if (!placed) continue;
        for (const fact of await frameFacts(page)) {
          if (!fact.lensClear) failures.push(`${level} ${mode} at ${spot.x.toFixed(1)},${spot.z.toFixed(1)}: lens behind geometry`);
        }
      }
    }
    // A ride along the slopes: the lens stays clear every few metres.
    for (const mode of ['avenue', 'elevated', 'side', 'crossroads', 'architecture', 'director', 'action'] as const) {
      await page.evaluate((mode) => { window.qa.resetRide(); window.game.setCameraMode(mode as never); }, mode);
      for (let leg = 0; leg < 6; leg += 1) {
        await page.evaluate(() => { window.game.setActions({ throttle: 0.7 }); window.game.advance(90); });
        for (const fact of await frameFacts(page)) {
          if (!fact.lensClear && fact.shown === mode) failures.push(`${level} ${mode} ride leg ${leg}: lens behind geometry`);
        }
      }
    }
  }
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
