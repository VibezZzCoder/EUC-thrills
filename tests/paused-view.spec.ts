/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { RENDER } from '../src/data/tuning.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * The held paused view — performance pass 2026-10-17 (idle-audio A).
 *
 * A settled player pause stops submitting to the GPU and the canvas keeps the
 * picture it last presented. What the headless gate and the source census
 * (`src/app/pausedView*.test.ts`) cannot see is the browser: that a held
 * canvas really keeps its picture, that every invalidation really redraws,
 * and that input still works while nothing is drawn. Cadence-independent:
 * every assertion counts callbacks and submissions, never time, and nothing
 * here reads the frame-rate counter.
 *
 * Submissions are counted by wrapping `WebGLRenderer.render` for the game's
 * scene: `renderer.info` keeps the last drawn frame's counters on a held
 * frame, so it cannot answer "did this callback draw".
 */

const SETTLE = RENDER.pausedViewSettleFrames;

interface Sample { synthetic: boolean; steps: number; submissions: number; state: string }

interface Probe {
  samples: Sample[];
  submissions: number;
  begin(): void;
  wait(count: number): Promise<Sample[]>;
  /** Review repair (2026-10-18): capture every seat rig's world matrices at each submission. */
  captureRigs: boolean;
  lastDrawnRigs: number[] | null;
  rigNow(): number[];
}

interface RigGap { comparable: boolean; differing: number; gap: number }

declare global {
  interface Window { pausedProbe: Probe }
}

/** Count real scene submissions per loop callback, without touching game code. */
async function instrument(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = window.game;
    const three = game.renderer.renderer;
    const scene = game.renderer.scene;
    const callbacks = (game.loop as unknown as { callbacks: { onFrameSampled?: (s: { synthetic: boolean; steps: number }) => void } }).callbacks;
    const seatRigs = (): number[] => {
      const values: number[] = [];
      const seats = (game as unknown as { seats: { rig: { group: { traverse(visit: (node: { matrixWorld: { elements: number[] } }) => void): void } } }[] }).seats;
      for (const seat of seats) seat.rig.group.traverse((node) => { for (const v of node.matrixWorld.elements) values.push(v); });
      return values;
    };
    const probe: Probe = {
      samples: [],
      submissions: 0,
      captureRigs: false,
      lastDrawnRigs: null,
      rigNow() { scene.updateMatrixWorld(true); return seatRigs(); },
      begin() { probe.samples = []; },
      wait(count) {
        return new Promise((resolve) => {
          const poll = (): void => {
            const real = probe.samples.filter((s) => !s.synthetic);
            if (real.length >= count) resolve(real.slice(0, count));
            else requestAnimationFrame(poll);
          };
          poll();
        });
      },
    };
    window.pausedProbe = probe;
    const render = three.render.bind(three);
    three.render = (target, camera) => {
      if (target === scene) probe.submissions += 1;
      render(target, camera);
      if (target === scene && probe.captureRigs) probe.lastDrawnRigs = seatRigs();
    };
    const sampled = callbacks.onFrameSampled;
    callbacks.onFrameSampled = (sample) => {
      sampled?.(sample);
      probe.samples.push({
        synthetic: sample.synthetic, steps: sample.steps,
        submissions: probe.submissions, state: game.appState.current,
      });
      probe.submissions = 0;
    };
  });
}

/** Run `action` and return the next `count` real callbacks' submission counts, in one task. */
async function after(page: Page, count: number, action: string): Promise<number[]> {
  const samples = await page.evaluate(async ({ count, action }) => {
    window.pausedProbe.begin();
    // eslint-disable-next-line no-new-func
    new Function('game', action)(window.game);
    return window.pausedProbe.wait(count);
  }, { count, action });
  return samples.map((s) => s.submissions);
}

/** Start a window, let Node act, then return the window's submission counts. */
async function around(page: Page, count: number, act: () => Promise<void>): Promise<number[]> {
  await page.evaluate(() => window.pausedProbe.begin());
  await act();
  const samples = await page.evaluate((count) => window.pausedProbe.wait(count), count);
  return samples.map((s) => s.submissions);
}

const settled = (count: number, perDraw = 1): number[] =>
  [...Array<number>(SETTLE).fill(perDraw), ...Array<number>(count - SETTLE).fill(0)];

/** The canvas alone, every DOM overlay hidden for the capture. */
async function canvasShot(page: Page): Promise<Buffer> {
  const box = await page.locator('#viewport').boundingBox();
  if (box === null) throw new Error('no canvas');
  return page.screenshot({
    clip: box, animations: 'disabled', caret: 'hide',
    style: 'body * { visibility: hidden !important; } #viewport { visibility: visible !important; }',
  });
}

test('a settled pause holds its picture: the settle frames draw, then nothing, while frames and focus move', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await instrument(page);

  expect(await after(page, 30, "game.setAppState('paused');")).toEqual(settled(30));
  const framesBefore = await page.evaluate(() => window.game.snapshot().loop.frames);
  const first = await canvasShot(page);
  expect(await after(page, 60, '')).toEqual(Array<number>(60).fill(0));
  const later = await canvasShot(page);
  expect(later.equals(first), 'the held canvas kept its picture').toBe(true);
  expect(later.length, 'and it is a drawn street, not a cleared buffer').toBeGreaterThan(20_000);
  // The loop still counts every callback (tests/stability.spec.ts's contract).
  expect(await page.evaluate(() => window.game.snapshot().loop.frames)).toBeGreaterThan(framesBefore + 60);
  expect(await page.evaluate(() => window.game.pausedViewState().holding)).toBe(true);

  // A returning tab redraws the settle frames. Whether that fresh draw is
  // byte-identical to the held picture depends on the GPU redrawing a frozen
  // state identically, which the idle-audio probe checks against a baseline
  // control; here it is recorded, not asserted.
  expect(await after(page, 20, "document.dispatchEvent(new Event('visibilitychange'));")).toEqual(settled(20));
  test.info().annotations.push({
    type: 'fresh-draw-equals-held', description: String((await canvasShot(page)).equals(first)),
  });

  // Pause-card focus moves while nothing is submitted.
  const focus = () => page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80) ?? '');
  const before = await focus();
  expect(await around(page, 10, () => page.keyboard.press('Tab'))).toEqual(Array<number>(10).fill(0));
  expect(await focus()).not.toBe(before);

  // Escape resumes: the ride steps and every callback draws.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  await page.evaluate(() => window.pausedProbe.begin());
  const riding = await page.evaluate(() => window.pausedProbe.wait(20));
  expect(riding.filter((s) => s.state === 'freeRide').every((s) => s.submissions > 0)).toBe(true);
  expect(riding.reduce((sum, s) => sum + s.steps, 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every write that can change the paused picture redraws exactly the settle frames, then holds again', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await instrument(page);
  expect(await after(page, 20, "game.setAppState('paused');")).toEqual(settled(20));
  const held = await canvasShot(page);

  // F4's path: a live tuning write.
  expect(await after(page, 20,
    "const t = game.tuning; t.set('LIGHTING.exposure', t.get('LIGHTING.exposure') * 1.3);")).toEqual(settled(20));
  expect((await canvasShot(page)).equals(held), 'the exposure change reached the held picture').toBe(false);
  expect(await after(page, 20,
    "const t = game.tuning; t.set('LIGHTING.exposure', t.defaultOf('LIGHTING.exposure'));")).toEqual(settled(20));

  // A player option, advance(0), and the state machine's own round trip in one task.
  expect(await after(page, 20, 'game.setOptions({ fieldOfViewTrim: 6 });')).toEqual(settled(20));
  expect(await after(page, 20, 'game.setOptions({ fieldOfViewTrim: 0 });')).toEqual(settled(20));
  expect(await after(page, 20, 'game.advance(0);')).toEqual(settled(20));
  expect(await after(page, 20, "game.appState.goTo('settings'); game.appState.goTo('paused');")).toEqual(settled(20));

  // A window resize (layout and buffer): at least the settle frames, then a hold.
  const resized = await around(page, 40, () => page.setViewportSize({ width: 1100, height: 700 }));
  expect(resized.filter((n) => n > 0).length).toBeGreaterThanOrEqual(SETTLE);
  expect(resized.slice(-10)).toEqual(Array<number>(10).fill(0));

  // A seat spawned while paused: two panes per drawn callback, then none.
  const spawned = await after(page, 30, 'game.spawnRider();');
  expect(spawned.filter((n) => n > 0).length).toBeGreaterThanOrEqual(SETTLE);
  expect(Math.max(...spawned)).toBe(2);
  expect(spawned.slice(-10)).toEqual(Array<number>(10).fill(0));
  expect(errors).toEqual([]);
});

test('negative controls: Settings, a QA-frozen ride and a running loop never hold', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await instrument(page);
  const allDraw = (counts: number[]): boolean => counts.every((n) => n > 0);

  expect(allDraw(await after(page, 30, "game.setAppState('paused'); game.setAppState('settings');")),
    'Settings simulates behind its card').toBe(true);
  expect(allDraw(await after(page, 30, "game.setAppState('paused'); game.setAppState('freeRide'); game.loop.setRunning(false);")),
    'a QA-frozen ride keeps drawing (specs photograph it)').toBe(true);
  expect(await after(page, 20, "game.setAppState('paused');")).toEqual(settled(20));
  expect(allDraw(await after(page, 30, 'game.loop.setRunning(true);')), 'a running loop in paused').toBe(true);
  expect(await after(page, 20, 'game.loop.setRunning(false);')).toEqual(settled(20));
  expect(errors).toEqual([]);
});

// --- Review repair (2026-10-18): pauses that take a paddle out of the hand ---

/**
 * The rig puts the paddle carry down by 1/12 per render call
 * (`RidingRig.settling`), not on the simulation clock: eleven settling
 * callbacks after the pause, and the gate's settle frames after those. The
 * review found a hold after the settle frames alone froze the right arm 48 mm
 * short, and the next fresh draw jumped it while still paused.
 */
const PUT_DOWN = 11;

/** Bit-exact difference between two captures of the seat rigs' world matrices. */
async function rigGap(page: Page, which: 'heldVsNow' | 'heldVsFresh'): Promise<RigGap> {
  return page.evaluate((mode) => {
    const probe = window.pausedProbe;
    const store = window as unknown as { pausedHeldRigs?: number[] | null };
    let a: number[] | null;
    let b: number[] | null;
    if (mode === 'heldVsNow') {
      store.pausedHeldRigs = probe.lastDrawnRigs;
      a = probe.lastDrawnRigs;
      b = probe.rigNow();
    } else {
      a = store.pausedHeldRigs ?? null;
      b = probe.lastDrawnRigs;
    }
    if (a === null || b === null || a.length !== b.length) return { comparable: false, differing: -1, gap: -1 };
    let differing = 0;
    let gap = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) { differing += 1; gap = Math.max(gap, Math.abs(a[i] - b[i])); }
    }
    return { comparable: true, differing, gap };
  }, which);
}

/** Ride with the paddle in hand, pause, and prove the hold waits for the put-down and shows a fresh draw's rigs. */
async function pauseWithPaddle(page: Page, panes: number): Promise<void> {
  await page.waitForFunction(() => !window.game.snapshot().route.pending, undefined, { timeout: 120_000 });
  await page.evaluate(() => { window.pausedProbe.captureRigs = true; });
  const riding = await after(page, 30, '');
  expect(riding.every((n) => n === panes), `riding draws every pane every callback: ${JSON.stringify(riding)}`).toBe(true);

  const counts = await after(page, PUT_DOWN + SETTLE + 20, "game.setAppState('paused');");
  expect(await page.evaluate(() => window.game.appState.current)).toBe('paused');
  expect(counts, 'the put-down draws, then the settle frames, then the hold').toEqual([
    ...Array<number>(PUT_DOWN + SETTLE).fill(panes), ...Array<number>(20).fill(0),
  ]);
  const heldVsNow = await rigGap(page, 'heldVsNow');
  expect(heldVsNow, 'the held frame drew the rigs as they stand now (no arm frozen mid-put-down)')
    .toEqual({ comparable: true, differing: 0, gap: 0 });
  const held = await canvasShot(page);

  // A returning tab: a fresh draw of the same paused state moves nothing.
  expect(await after(page, 20, "document.dispatchEvent(new Event('visibilitychange'));")).toEqual(settled(20, panes));
  expect(await rigGap(page, 'heldVsFresh'), 'a fresh draw submitted the rigs the hold showed')
    .toEqual({ comparable: true, differing: 0, gap: 0 });
  // Pixels are recorded, not asserted, for the first test's reason (GPU
  // redraw determinism is the idle-audio probe's baseline control).
  test.info().annotations.push({
    type: 'paddle-fresh-draw-equals-held', description: String((await canvasShot(page)).equals(held)),
  });
  await page.evaluate(() => { window.pausedProbe.captureRigs = false; });
}

/** Which seats carry a paddle right now (`paddleEquippedFor`). */
async function armedSeats(page: Page): Promise<boolean[]> {
  return page.evaluate(() => {
    const game = window.game;
    return Array.from({ length: game.seatCount }, (_, seat) => game.paddleEquippedFor(seat));
  });
}

/** A world with targets: Knockabout refuses one without (m14's and m37's seed). */
const PADDLE_QUERY = 'level=generated&seed=route-41';

test('a Knockabout pause holds only once the paddle is put down, solo and on a two-seat couch', async ({ page }) => {
  const errors = collectErrors(page);
  // Knockabout is refused from free ride; enter it from the title, as m14 and m26 do.
  await bootToTitle(page, PADDLE_QUERY);
  await page.evaluate(() => window.game.startKnockabout());
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  await instrument(page);
  expect(await armedSeats(page)).toEqual([true]);
  await pauseWithPaddle(page, 1);

  await page.evaluate(() => {
    const game = window.game;
    game.setAppState('title');
    game.spawnRider();
    game.startKnockabout();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout' && window.game.seatCount === 2);
  expect(await armedSeats(page)).toEqual([true, true]);
  await pauseWithPaddle(page, 2);
  expect(errors).toEqual([]);
});

test('a couch-chase pause of the cop seat holds only once his paddle is put down', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PADDLE_QUERY);
  await page.evaluate(() => {
    const game = window.game;
    // m25's couch-chase recipe through the bridge, with a human cop (seat 2).
    game.setCouchRide('chase');
    game.spawnSecondRider();
    game.spawnRider('cop');
    game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  await instrument(page);
  const armed = await armedSeats(page);
  expect(armed.filter(Boolean).length, `only the cop seat carries a paddle: ${JSON.stringify(armed)}`).toBe(1);
  expect(armed.indexOf(true)).toBe(await page.evaluate(() => window.game.snapshot().chase.room.copSeat));
  await pauseWithPaddle(page, 3);
  expect(errors).toEqual([]);
});
