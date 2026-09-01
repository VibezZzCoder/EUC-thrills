/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M27 Phase 0 — the quad probe, in a real browser.
 *
 * The scope lock (`docs/PLANS.md` §27.6) is decided on a frame no seat model
 * can draw yet: four full passes of the real world into four quadrant
 * viewports. `tools/perf-window.js --views 4` is the owner's window onto that
 * frame and its `--self-test` proves the tool end to end; these specs are the
 * *suite's* hold on the renderer half, because the self-test is a command
 * nobody runs by accident and a probe that rots between milestones would be
 * discovered by the owner, foreground, on the measurement that decides q98.
 *
 * Three claims, one each:
 *
 *   1. **Four panes, tiling exactly once, each actually drawn** — at an odd
 *      canvas size, because M25's one visible split defect was a divided
 *      partition flooring both passes to 500 on a 1001 px canvas and leaving
 *      the last column drawn by nobody. The probe partitions on *both* axes,
 *      so both edges get the read. Distinct pixels are the assertion, not
 *      opaque ones: `beginFrame` clears the whole canvas, so an undrawn pane
 *      reads back opaque, uniform, and in the clear colour.
 *   2. **A probe costs nothing once it is cleared** — invariant 10's plateau
 *      on the newest disposable thing in the game, three whole rigs at once,
 *      through the exact remove-then-dispose recipe `despawnSecondRider`
 *      records.
 *   3. **The probe is an instrument, not a mode** — it refuses a couch split,
 *      and clearing it hands back the single-view frame it borrowed.
 *
 * Nothing here reads a frame interval (`AGENTS.md`); draw calls, pixels and
 * resource counts are the reportable axes.
 */

test('the quad probe draws four distinct panes that tile an odd canvas exactly once', async ({ page }) => {
  const errors = collectErrors(page);
  // Odd on both axes, deliberately: 1001 and 701 are the sizes where a
  // divided partition leaves a one-pixel stripe of untouched page down an
  // edge, and the probe rounds boundaries on two axes where the split rounds
  // on one.
  await page.setViewportSize({ width: 1001, height: 701 });
  await boot(page);

  const probe = await page.evaluate(() => {
    const game = window.game;
    const plant = (): void => {
      const euc = game.snapshot().euc;
      game.renderer.plantPerfQuadProbe(
        { x: euc.position.x, y: euc.position.y, z: euc.position.z },
        euc.headingY,
      );
    };
    game.loop.setRunning(false);
    plant();
    // One synchronous frame, then every readback in the same task: the
    // drawing buffer is only valid until the browser composites.
    game.advance(0);

    const renderer = game.renderer;
    const gl = renderer.renderer.getContext();
    const ratio = renderer.viewport().pixelRatio;
    const panes = [0, 1, 2, 3].map((pane) => renderer.perfQuadBounds(pane));

    const sample = (x: number, y: number): string => {
      const px = new Uint8Array(4);
      gl.readPixels(
        Math.min(gl.drawingBufferWidth - 1, Math.floor(x * ratio)),
        Math.min(gl.drawingBufferHeight - 1, Math.floor(y * ratio)),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px,
      );
      return `${px[0]},${px[1]},${px[2]},${px[3]}`;
    };

    const strips = panes.map((pane) => {
      const out: string[] = [];
      for (let i = 0; i < 8; i += 1) {
        const x = pane.x + pane.width * ((i + 0.5) / 8);
        for (const fy of [0.3, 0.6]) out.push(sample(x, pane.y + pane.height * fy));
      }
      return out;
    });

    // The two edges a divided partition would abandon: the last column and
    // the top row (WebGL's origin is bottom-left, so the top row is y max).
    const lastColumn: string[] = [];
    const topRow: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      lastColumn.push(sample(renderer.viewport().width - 0.5, (i + 0.5) * (renderer.viewport().height / 12)));
      topRow.push(sample((i + 0.5) * (renderer.viewport().width / 12), renderer.viewport().height - 0.5));
    }

    return {
      viewport: renderer.viewport(),
      armed: renderer.perfQuadArmed,
      panes,
      distinct: strips.map((strip) => new Set(strip).size),
      stripKeys: strips.map((strip) => strip.join('|')),
      lastColumn,
      topRow,
      calls: renderer.renderer.info.render.calls,
    };
  });

  expect(probe.armed).toBe(true);
  expect(probe.viewport.width % 2).toBe(1);
  expect(probe.viewport.height % 2).toBe(1);

  // The four rects tile the canvas exactly once: every boundary is one number
  // shared by the pane that ends there and the pane that starts there, on
  // both axes.
  const [p0, p1, p2, p3] = probe.panes;
  expect(p0.x).toBe(0);
  expect(p2.x).toBe(0);
  expect(p2.y).toBe(0);
  expect(p3.y).toBe(0);
  expect(p1.x).toBe(p0.width);
  expect(p3.x).toBe(p2.width);
  expect(p0.y).toBe(p2.height);
  expect(p1.y).toBe(p3.height);
  expect(p0.width + p1.width).toBe(probe.viewport.width);
  expect(p2.width + p3.width).toBe(probe.viewport.width);
  expect(p0.height + p2.height).toBe(probe.viewport.height);
  expect(p1.height + p3.height).toBe(probe.viewport.height);
  // An odd canvas splits 500/501 rather than 500.5/500.5 — the honest split.
  expect(Math.abs(p0.width - p1.width)).toBe(1);
  expect(Math.abs(p0.height - p2.height)).toBe(1);

  // Every pane holds a picture, and no two panes hold the same picture: four
  // cameras at four positions framing four different riders.
  for (const [pane, colours] of probe.distinct.entries()) {
    expect(colours, `pane ${pane} reads back ${colours} colour(s) — nothing drew it`).toBeGreaterThan(3);
  }
  expect(new Set(probe.stripKeys).size).toBe(4);

  // The abandoned-edge reads: all opaque (the M25 stripe read back the page's
  // own transparent pixels through the canvas) and more than one colour (a
  // cleared-but-undrawn edge is opaque and uniform).
  expect(probe.lastColumn.every((px) => px.endsWith(',255'))).toBe(true);
  expect(probe.topRow.every((px) => px.endsWith(',255'))).toBe(true);
  expect(new Set(probe.lastColumn).size).toBeGreaterThan(1);
  expect(new Set(probe.topRow).size).toBeGreaterThan(1);

  expect(errors).toEqual([]);
});

test('a planted probe costs nothing once it is cleared', async ({ page }) => {
  await boot(page);
  const trace = await page.evaluate(() => {
    const game = window.game;
    const plant = (): void => {
      const euc = game.snapshot().euc;
      game.renderer.plantPerfQuadProbe(
        { x: euc.position.x, y: euc.position.y, z: euc.position.z },
        euc.headingY,
      );
    };
    game.loop.setRunning(false);
    // Warm up first: the first real frame compiles shaders and uploads the
    // world it booted with, and counting that as growth reports a one-off
    // cost as a leak.
    game.advance(60);
    const baseline = game.resources();

    const armed: ReturnType<typeof game.resources>[] = [];
    const cleared: ReturnType<typeof game.resources>[] = [];
    for (let round = 0; round < 3; round += 1) {
      plant();
      // A step and a draw, so the rigs are uploaded rather than merely built:
      // an unrendered geometry never reaches `info.memory`.
      game.advance(2);
      armed.push(game.resources());
      game.renderer.clearPerfQuadProbe();
      game.advance(2);
      cleared.push(game.resources());
    }
    return { baseline, armed, cleared };
  });

  // Three rigs really were planted, or every comparison below plateaus at
  // zero and this spec guards nothing.
  expect(trace.armed[0].sceneObjects).toBeGreaterThan(trace.baseline.sceneObjects);
  expect(trace.armed[0].geometries).toBeGreaterThan(trace.baseline.geometries);

  for (let round = 1; round < trace.armed.length; round += 1) {
    expect(trace.armed[round], `planting ${round + 1} cost more than planting 1`)
      .toEqual(trace.armed[0]);
  }
  for (const [round, sample] of trace.cleared.entries()) {
    expect(sample, `the probe left something behind after round ${round + 1}`)
      .toEqual(trace.baseline);
  }
});

test('the probe refuses a couch split and hands the single view back cleanly', async ({ page }) => {
  await boot(page);
  const verdict = await page.evaluate(() => {
    const game = window.game;
    const plant = (): void => {
      const euc = game.snapshot().euc;
      game.renderer.plantPerfQuadProbe(
        { x: euc.position.x, y: euc.position.y, z: euc.position.z },
        euc.headingY,
      );
    };
    game.loop.setRunning(false);

    // A couch split is two view cameras, and the probe is a solo instrument.
    game.spawnSecondRider();
    let refusal = '';
    try {
      plant();
    } catch (error) {
      refusal = String(error);
    }
    const armedDuringSplit = game.renderer.perfQuadArmed;
    game.despawnSecondRider();

    // Armed, then cleared: the game camera borrowed for pane 0 must come back
    // with its full-canvas aspect, and the pane surface must be gone.
    plant();
    const armedAspect = game.renderer.cameraFor(0).aspect;
    game.renderer.clearPerfQuadProbe();
    game.advance(0);
    let unarmedBounds = '';
    try {
      game.renderer.perfQuadBounds(0);
    } catch (error) {
      unarmedBounds = String(error);
    }
    const viewport = game.renderer.viewport();
    return {
      refusal,
      armedDuringSplit,
      armedAspect,
      restoredAspect: game.renderer.cameraFor(0).aspect,
      fullAspect: viewport.width / viewport.height,
      quadAspect: Math.round(viewport.width / 2) / (viewport.height - Math.round(viewport.height / 2)),
      unarmedBounds,
      armed: game.renderer.perfQuadArmed,
    };
  });

  expect(verdict.refusal).toContain('solo instrument');
  expect(verdict.armedDuringSplit).toBe(false);
  expect(verdict.armedAspect).toBeCloseTo(verdict.quadAspect, 6);
  expect(verdict.restoredAspect).toBeCloseTo(verdict.fullAspect, 6);
  expect(verdict.unarmedBounds).toContain('not armed');
  expect(verdict.armed).toBe(false);
});

// ---------------------------------------------------------------------------
// M27 Phase 1 — four seats
//
// The probe above measured a four-pass frame before any seat could ask for
// one. These are the same claims made about the *real* partition, plus the
// three things a fourth seat touches that a fourth pass does not: the HUD's
// second axis, contact at six pairs, and the rides a wider couch may not have.
// ---------------------------------------------------------------------------

/** Boot and seat `count` riders through the bridge's own plural surface. */
async function bootSeats(page: import('@playwright/test').Page, count: number): Promise<void> {
  await boot(page);
  await page.evaluate((wanted) => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < wanted) game.spawnRider();
    game.advance(2);
  }, count);
}

test('four seats draw four panes that tile an odd canvas on both axes', async ({ page }) => {
  // M25's defect, at the shape that can reproduce it twice: a divided
  // partition floors 500.5 on both axes and abandons a column *and* a row.
  // The probe proves the arithmetic; this proves the partition the game
  // actually draws through is the same arithmetic.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1001, height: 701 });
  await bootSeats(page, 4);

  const frame = await page.evaluate(() => {
    const game = window.game;
    game.advance(0);
    const renderer = game.renderer;
    const gl = renderer.renderer.getContext();
    const ratio = renderer.viewport().pixelRatio;
    const panes = [0, 1, 2, 3].map((view) => renderer.viewBounds(view));

    const sample = (x: number, y: number): string => {
      const px = new Uint8Array(4);
      gl.readPixels(
        Math.min(gl.drawingBufferWidth - 1, Math.floor(x * ratio)),
        Math.min(gl.drawingBufferHeight - 1, Math.floor(y * ratio)),
        1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px,
      );
      return `${px[0]},${px[1]},${px[2]},${px[3]}`;
    };

    const strips = panes.map((pane) => {
      const out: string[] = [];
      for (let i = 0; i < 8; i += 1) {
        const x = pane.x + pane.width * ((i + 0.5) / 8);
        for (const fy of [0.3, 0.6]) out.push(sample(x, pane.y + pane.height * fy));
      }
      return out;
    });

    const lastColumn: string[] = [];
    const topRow: string[] = [];
    const view = renderer.viewport();
    for (let i = 0; i < 12; i += 1) {
      lastColumn.push(sample(view.width - 0.5, (i + 0.5) * (view.height / 12)));
      topRow.push(sample((i + 0.5) * (view.width / 12), view.height - 0.5));
    }

    // **What the last pass actually asked the GL for.** Pixel distinctness
    // proves something drew each quarter; it cannot see a *viewport* left at
    // full height and merely scissored down to a quarter, which draws the
    // right pixels through the wrong projection — a rider framed too low, in
    // every pane, on a frame that reads as fine in a screenshot.
    const glViewport = [...gl.getParameter(gl.VIEWPORT) as Int32Array];
    const glScissor = [...gl.getParameter(gl.SCISSOR_BOX) as Int32Array];

    return {
      viewport: view,
      seats: game.seatCount,
      views: renderer.viewCount,
      panes,
      glViewport,
      glScissor,
      ratio,
      aspects: [0, 1, 2, 3].map((v) => renderer.cameraFor(v).aspect),
      distinct: strips.map((strip) => new Set(strip).size),
      stripKeys: strips.map((strip) => strip.join('|')),
      lastColumn,
      topRow,
    };
  });

  expect(frame.seats).toBe(4);
  // The pass count is the seat count by construction, never two places
  // agreeing — the rule `spawnRider` states and this is where it is read.
  expect(frame.views).toBe(4);
  expect(frame.viewport.width % 2).toBe(1);
  expect(frame.viewport.height % 2).toBe(1);

  const [p0, p1, p2, p3] = frame.panes;
  expect(p0.x).toBe(0);
  expect(p2.x).toBe(0);
  expect(p2.y).toBe(0);
  expect(p3.y).toBe(0);
  expect(p1.x).toBe(p0.width);
  expect(p0.y).toBe(p2.height);
  expect(p0.width + p1.width).toBe(frame.viewport.width);
  expect(p0.height + p2.height).toBe(frame.viewport.height);
  expect(Math.abs(p0.width - p1.width)).toBe(1);
  expect(Math.abs(p0.height - p2.height)).toBe(1);

  // The final pass's viewport is the final pane's box, and the scissor agrees
  // with it. Two boxes that can disagree are two boxes that will.
  const last = frame.panes[3];
  const expected = [
    Math.floor(last.x * frame.ratio),
    Math.floor(last.y * frame.ratio),
    Math.floor(last.width * frame.ratio),
    Math.floor(last.height * frame.ratio),
  ];
  expect(frame.glViewport).toEqual(expected);
  expect(frame.glScissor).toEqual(expected);

  // Each camera framed for its own pane, not for a quartered canvas: the
  // stretch that reads as "the rider got fatter" rather than as a wrong frame.
  for (const [view, pane] of frame.panes.entries()) {
    expect(frame.aspects[view]).toBeCloseTo(pane.width / pane.height, 6);
  }

  for (const [pane, colours] of frame.distinct.entries()) {
    expect(colours, `pane ${pane} reads back ${colours} colour(s) — nothing drew it`).toBeGreaterThan(3);
  }
  expect(new Set(frame.stripKeys).size).toBe(4);
  expect(frame.lastColumn.every((px) => px.endsWith(',255'))).toBe(true);
  expect(frame.topRow.every((px) => px.endsWith(',255'))).toBe(true);
  expect(new Set(frame.lastColumn).size).toBeGreaterThan(1);
  expect(new Set(frame.topRow).size).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('every HUD sits in its own quarter, and every visible row fits inside it', async ({ page }) => {
  // §27.6's third prerequisite, and the one the owner added: HUD legibility at
  // quarter-screen. The 960x540 capture answered it by eye; this answers it as
  // a contract, in the suite's own 1000x700 window — which is the *worst* case
  // the couch will offer, because the entrance is refused below 1000 px.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await bootSeats(page, 4);

  const layout = await page.evaluate(() => {
    const game = window.game;
    game.advance(2);
    const containers = [...document.querySelectorAll<HTMLElement>('.euc-hud-seat')];
    return {
      count: containers.length,
      panes: containers.map((container) => {
        const box = container.getBoundingClientRect();
        const hud = container.querySelector<HTMLElement>('.euc-hud');
        const rows = hud === null
          ? []
          : [...hud.querySelectorAll<HTMLElement>('[data-hud]')]
            .filter((node) => node.offsetParent !== null && node.getBoundingClientRect().width > 0)
            .map((node) => {
              const row = node.getBoundingClientRect();
              return {
                hook: node.dataset.hud ?? '',
                left: row.left, right: row.right, top: row.top, bottom: row.bottom,
              };
            });
        return {
          side: container.dataset.side,
          row: container.dataset.row,
          split: container.dataset.split,
          hudVw: hud === null ? '' : getComputedStyle(hud).getPropertyValue('--hud-vw').trim(),
          box: { left: box.left, top: box.top, width: box.width, height: box.height },
          rows,
        };
      }),
      window: { width: window.innerWidth, height: window.innerHeight },
    };
  });

  expect(layout.count).toBe(4);
  // Reading order: top-left, top-right, bottom-left, bottom-right.
  expect(layout.panes.map((pane) => `${pane.side}/${pane.row}`)).toEqual([
    'left/top', 'right/top', 'left/bottom', 'right/bottom',
  ]);

  const halfWidth = layout.window.width / 2;
  const halfHeight = layout.window.height / 2;
  for (const [index, pane] of layout.panes.entries()) {
    expect(pane.split).toBe('true');
    // **A quadrant is as wide as a half**, so the view unit it was measured
    // at is already the right one and only the box changed.
    expect(pane.hudVw).toBe('0.5vw');
    expect(pane.box.width).toBeCloseTo(halfWidth, 1);
    expect(pane.box.height, `pane ${index} kept its full height`).toBeCloseTo(halfHeight, 1);
    expect(pane.box.left).toBeCloseTo(pane.side === 'left' ? 0 : halfWidth, 1);
    expect(pane.box.top).toBeCloseTo(pane.row === 'top' ? 0 : halfHeight, 1);

    // Every row the pane is showing sits inside the pane. The failure this
    // catches is not a clipped word: it is a lane drawn over the rider in the
    // pane below, which reads as a rendering bug rather than as a layout one.
    for (const row of pane.rows) {
      expect(row.left, `${row.hook} in pane ${index} starts left of its pane`)
        .toBeGreaterThanOrEqual(pane.box.left - 0.5);
      expect(row.right, `${row.hook} in pane ${index} runs past its right edge`)
        .toBeLessThanOrEqual(pane.box.left + pane.box.width + 0.5);
      expect(row.top, `${row.hook} in pane ${index} starts above its pane`)
        .toBeGreaterThanOrEqual(pane.box.top - 0.5);
      expect(row.bottom, `${row.hook} in pane ${index} runs past its bottom edge`)
        .toBeLessThanOrEqual(pane.box.top + pane.box.height + 0.5);
    }
  }
  expect(errors).toEqual([]);
});

test('three seats leave one quadrant to the room, and the card is in it', async ({ page }) => {
  // q95. The dead space becomes the shared scoreboard rather than a fourth
  // keyhole — DOM over a pane no pass draws, so `seats.length` is still the
  // number of passes and the card costs nothing in the frame.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1000, height: 700 });
  await bootSeats(page, 3);

  const idle = await page.evaluate(() => {
    const game = window.game;
    game.advance(2);
    const card = document.querySelector<HTMLElement>('.euc-idle');
    const box = card?.getBoundingClientRect();
    const rows = card === null
      ? []
      : [...card.querySelectorAll<HTMLElement>('.euc-idle__label')].map((node) => node.textContent ?? '');
    return {
      views: game.renderer.viewCount,
      hole: game.renderer.idleViewBounds(),
      present: card !== null && !card.hidden,
      pointerEvents: card === null ? '' : getComputedStyle(card).pointerEvents,
      title: card?.querySelector<HTMLElement>('.euc-idle__title')?.textContent ?? '',
      rows,
      box: box === undefined ? null : { left: box.left, top: box.top, width: box.width, height: box.height },
      window: { width: window.innerWidth, height: window.innerHeight },
      huds: document.querySelectorAll('.euc-hud-seat').length,
    };
  });

  // Three passes, not four: the idle quadrant is drawn by nobody.
  expect(idle.views).toBe(3);
  expect(idle.huds).toBe(3);
  expect(idle.hole).not.toBeNull();
  expect(idle.present).toBe(true);
  // It covers a quarter of everything the players are riding into, so it must
  // not take a click — `.euc-hud-seat`'s rule, one element along.
  expect(idle.pointerEvents).toBe('none');
  expect(idle.box?.left).toBeCloseTo(idle.window.width / 2, 1);
  expect(idle.box?.top).toBeCloseTo(idle.window.height / 2, 1);
  // The card names the ride, the world, and every rider by seat — the point of
  // it being that a player who has just sat down can find their own pane.
  expect(idle.title).toBe('Free ride');
  expect(idle.rows).toEqual(['World', 'Player 1', 'Player 2', 'Player 3']);
  expect(errors).toEqual([]);
});

test('every pair of riders bumps, and a third rider is three pairs', async ({ page }) => {
  // `contactLive` read `seatCount === 2` from M26 until now, deliberately,
  // because "a third seat is three pairs and a different question". This is
  // the answer: the pairs are enumerated, each with its own cooldown, and the
  // rider in the middle is pushed by both of the others rather than by
  // whichever pair the loop happened to resolve first.
  const errors = collectErrors(page);
  await bootSeats(page, 3);

  const bump = await page.evaluate(() => {
    const game = window.game;
    const live = game.snapshot().contact.live;
    // A tight triangle rather than one point: every pair overlapping, which is
    // the state a single-pair step resolves once and leaves two riders in.
    //
    // **Not one point, deliberately.** Three riders stacked on the same
    // coordinate give the middle one two exactly opposite pushes that cancel,
    // which is correct arithmetic and a fixture that proves nothing. A
    // triangle is the honest version of "everybody is inside everybody".
    const spawn = game.snapshot().euc;
    const offsets = [{ x: 0, z: 0 }, { x: 0.3, z: 0 }, { x: 0.15, z: 0.3 }];
    for (let seat = 0; seat < 3; seat += 1) {
      game.placeRider(
        {
          x: spawn.position.x + offsets[seat].x,
          y: spawn.position.y,
          z: spawn.position.z + offsets[seat].z,
        },
        spawn.headingY,
        seat,
      );
    }
    game.advance(2);
    const before = [0, 1, 2].map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z };
    });
    game.advance(30);
    const after = [0, 1, 2].map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z };
    });
    const gaps: number[] = [];
    for (let a = 0; a < 3; a += 1) {
      for (let b = a + 1; b < 3; b += 1) {
        gaps.push(Math.hypot(after[a].x - after[b].x, after[a].z - after[b].z));
      }
    }
    return {
      live,
      moved: before.map((was, seat) => Math.hypot(after[seat].x - was.x, after[seat].z - was.z)),
      gaps,
    };
  });

  expect(bump.live).toBe(true);
  // Three pairs, so three gaps — and every one of them opened.
  expect(bump.gaps).toHaveLength(3);
  for (const [pair, gap] of bump.gaps.entries()) {
    expect(gap, `pair ${pair} is still merged`).toBeGreaterThan(0.2);
  }
  // And every rider was moved: a loop that resolved one pair would leave the
  // third rider exactly where it was put.
  for (const [seat, distance] of bump.moved.entries()) {
    expect(distance, `seat ${seat} was never separated from anybody`).toBeGreaterThan(0.05);
  }
  expect(errors).toEqual([]);
});

test('four riders can all crash on one update without a voice going missing', async ({ page }) => {
  // The audio enumeration re-walked for N (§27.6), and the reason it is not a
  // pattern-match: the cue ring is twice the worst case by construction, the
  // worst case is four one-shots a rider, and four seats moved it to sixteen.
  // A ring left at the two-seat number would have dropped the newest cues
  // silently, on the loudest frame in the game.
  const errors = collectErrors(page);
  await bootSeats(page, 4);

  const heard = await page.evaluate(() => {
    const game = window.game;
    const director = game.audio.director;
    // The roster's own ids, in seat order — four different people crashing on
    // one update is the case the ring was doubled for.
    const cast = ['cool-rider', 'trollina', 'red-rider', 'maribel'] as const;
    for (let seat = 0; seat < 4; seat += 1) {
      director.impact(6, seat);
      director.crash(12, cast[seat], seat);
    }
    const voices = director.cues
      .slice(0, director.cueCount)
      .filter((cue) => cue.kind === 'crash')
      .map((cue) => cue.voice);
    const kerbs = director.cues.slice(0, director.cueCount).filter((cue) => cue.kind === 'curb').length;
    return {
      capacity: director.cues.length,
      claimed: director.cueCount,
      voices,
      kerbs,
    };
  });

  // Four crashes, four kerb strikes, none dropped — and each crash carrying
  // its own rider's voice, because a "current voice" read at play time gives
  // the second crash in an update the wrong person.
  expect(heard.voices).toEqual(['cool-rider', 'trollina', 'red-rider', 'maribel']);
  expect(heard.kerbs).toBe(4);
  expect(heard.claimed).toBeLessThanOrEqual(heard.capacity);
  // The ring is twice the worst case, which is what the number means.
  expect(heard.capacity).toBeGreaterThanOrEqual(4 * 4 * 2);
  expect(errors).toEqual([]);
});

test('Knockabout is a two-player fight, and a third seat takes it off the menu', async ({ page }) => {
  // q94. Four-player Knockabout — free-for-all or teams, first to what, N-way
  // spawn fairness against a 2.15 m reach, multi-way draws — is real design
  // nobody has opened, so a wider couch may not quietly be handed a two-seat
  // fight. Refused at the door *and* greyed on the control, on M26's rule that
  // the two must answer on identical terms.
  const errors = collectErrors(page);
  await bootSeats(page, 2);

  const verdict = await page.evaluate(() => {
    const game = window.game;
    game.setCouchRide('knockabout');
    const atTwo = game.snapshot().couch.ride;
    game.spawnRider();
    game.advance(2);
    const afterThird = game.snapshot().couch.ride;
    game.setCouchRide('knockabout');
    const refused = game.snapshot().couch.ride;
    game.despawnRider();
    game.advance(2);
    game.setCouchRide('knockabout');
    return { atTwo, afterThird, refused, backAtTwo: game.snapshot().couch.ride };
  });

  expect(verdict.atTwo).toBe('knockabout');
  // A third seat takes the mode with it rather than leaving a session armed
  // for a fight it cannot referee.
  expect(verdict.afterThird).toBe('freeRide');
  expect(verdict.refused).toBe('freeRide');
  // And it comes back when the couch narrows: the rule is about the room, not
  // a latch that has to be undone.
  expect(verdict.backAtTwo).toBe('knockabout');
  expect(errors).toEqual([]);
});

test('a couch that grows to four and back leaves the GPU where it started', async ({ page }) => {
  // Invariant 10 at the widest the couch goes. Three whole rigs added and
  // removed twice: a plateau is a claim about repetition, so the second round
  // is what makes it one.
  const errors = collectErrors(page);
  await boot(page);

  const plateau = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(60);
    const baseline = game.resources().sceneObjects;
    const wide: number[] = [];
    const narrow: number[] = [];
    for (let round = 0; round < 2; round += 1) {
      while (game.seatCount < 4) game.spawnRider();
      game.advance(2);
      wide.push(game.resources().sceneObjects);
      while (game.seatCount > 1) game.despawnRider();
      game.advance(2);
      narrow.push(game.resources().sceneObjects);
    }
    return { baseline, wide, narrow, seats: game.seatCount, views: game.renderer.viewCount };
  });

  expect(plateau.seats).toBe(1);
  expect(plateau.views).toBe(1);
  expect(plateau.wide[0]).toBe(plateau.wide[1]);
  expect(plateau.narrow[0]).toBe(plateau.baseline);
  expect(plateau.narrow[1]).toBe(plateau.baseline);
  expect(errors).toEqual([]);
});

test('a quadrant keeps the whole screen’s field of view, and a half still gains', async ({ page }) => {
  // §27.2's geometric argument, asserted rather than trusted. A half cuts the
  // horizontal angle and `splitFovGain` exists to buy it back; a quadrant
  // halves both axes, keeps the canvas aspect, and needs none of that — so
  // running the gain on it would hand four players a wider view than one
  // player gets, which is a different game rather than the same one shared.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await boot(page);

  const fov = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(2);
    const solo = game.renderer.cameraFor(0).fov;
    game.spawnRider();
    game.advance(2);
    const half = game.renderer.cameraFor(0).fov;
    while (game.seatCount < 4) game.spawnRider();
    game.advance(2);
    const quad = game.renderer.cameraFor(0).fov;
    const aspects = { half: game.renderer.viewBounds(0), solo: game.renderer.viewport() };
    return { solo, half, quad, aspects };
  });

  expect(fov.half).toBeGreaterThan(fov.solo);
  // Near unity: the quadrant sees what one player sees, at a quarter of the
  // pixels. `CAMERA.quadFovGain` ships at 1 — the value that switches the
  // treatment off, recorded where it will be found.
  expect(fov.quad).toBeCloseTo(fov.solo, 4);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// M27 Phase 3 — the entrance, the grid, and the start
// ---------------------------------------------------------------------------

/** Where every checkpoint is, in route order. `m23.spec.ts`' helper, plural. */
async function raceLines(page: import('@playwright/test').Page): Promise<{
  centre: { x: number; y: number; z: number };
  headingY: number;
  label: string;
}[]> {
  return page.evaluate(() => [...window.game.levelPlan.checkpoints]
    .sort((a, b) => a.routeIndex - b.routeIndex)
    .map((cp) => ({
      centre: { x: cp.centre.x, y: cp.centre.y, z: cp.centre.z },
      headingY: cp.headingY,
      label: cp.label,
    })));
}

/**
 * Boot `seats` riders into a race.
 *
 * **From the title, because that is where the entrance is legal.** `freeRide`
 * lists no `trackDay` successor — a running ride is left by pausing or by
 * going home — so a spec that armed a race from one would be testing a
 * transition no player can make. The seats are spawned *after* the title,
 * because arriving there closes the couch.
 */
async function bootRace(
  page: import('@playwright/test').Page,
  seats = 2,
  laps = 1,
): Promise<void> {
  await bootToTitle(page, 'level=track');
  await page.evaluate(({ wanted, wantedLaps }) => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < wanted) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.laps', wantedLaps);
    game.startTrackDay();
    game.advance(2);
  }, { wanted: seats, wantedLaps: laps });
}

test('a race is a grid, held, and GO releases the whole room at once', async ({ page }) => {
  // q88 and q96 in one ride: a standing grid behind the line, a shared count,
  // and nothing reaching `EucController` until it runs out. The freeze is at
  // the composition root, so the assertion is that the riders **do not move**
  // with the throttle held — not that some flag is set.
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');

  const grid = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.countdownSeconds', 3);
    game.tuning.set('RACE.laps', 3);
    game.startTrackDay();
    game.advance(2);
    const line = [...game.levelPlan.checkpoints]
      .sort((a, b) => a.routeIndex - b.routeIndex)[0];
    const where = (seat: number) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z, heading: euc.headingY };
    };
    return {
      state: game.snapshot().app.state,
      phase: game.snapshot().race.phase,
      seats: game.seatCount,
      level: game.levelPlan.id,
      line: { x: line.centre.x, z: line.centre.z, headingY: line.headingY },
      placed: [where(0), where(1)],
    };
  });

  // The entrance takes the room to the venue: a race has a circuit, and the
  // mode's front door is the one path that swaps a world.
  expect(grid.level).toBe('belvar-r1');
  expect(grid.state).toBe('trackDay');
  expect(grid.phase).toBe('countdown');

  // Behind the line, both of them, and not on top of each other.
  const forwardX = Math.sin(grid.line.headingY);
  const forwardZ = Math.cos(grid.line.headingY);
  for (const [seat, at] of grid.placed.entries()) {
    const behind = -((at.x - grid.line.x) * forwardX + (at.z - grid.line.z) * forwardZ);
    expect(behind, `seat ${seat} is not behind the start line`).toBeGreaterThan(0);
    expect(at.heading).toBeCloseTo(grid.line.headingY, 6);
  }
  const apart = Math.hypot(
    grid.placed[0].x - grid.placed[1].x,
    grid.placed[0].z - grid.placed[1].z,
  );
  expect(apart).toBeGreaterThan(1);

  const start = await page.evaluate(() => {
    const game = window.game;
    const before = [0, 1].map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z };
    });
    // Both riders leaning on the throttle for a whole second of the count.
    game.setActionsFor(0, { throttle: 1 });
    game.setActionsFor(1, { throttle: 1 });
    game.advance(120);
    const held = [0, 1].map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z };
    });
    const counting = game.snapshot().race.phase;
    const shown = document.querySelector<HTMLElement>('[data-hud="count"]');
    const countText = shown === null || shown.hidden ? '' : shown.textContent ?? '';
    // Past the count.
    game.advance(300);
    const released = game.snapshot().race.phase;
    game.advance(60);
    const moved = [0, 1].map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z };
    });
    return {
      counting,
      countText,
      released,
      frozen: before.map((at, seat) => Math.hypot(held[seat].x - at.x, held[seat].z - at.z)),
      ran: held.map((at, seat) => Math.hypot(moved[seat].x - at.x, moved[seat].z - at.z)),
      go: game.snapshot().audio.played.go,
      counts: game.snapshot().audio.played.count,
      hudAfter: document.querySelector<HTMLElement>('[data-hud="count"]')?.hidden ?? true,
    };
  });

  expect(start.counting).toBe('countdown');
  // **Nobody moved**, with the throttle held for a full second. This is the
  // assertion that would fail if the freeze were anywhere but the root.
  for (const [seat, distance] of start.frozen.entries()) {
    expect(distance, `seat ${seat} crept during the countdown`).toBeLessThan(0.01);
  }
  // The room is told, in its own pane and in its own cue.
  expect(start.countText).toMatch(/^[123]$/);
  expect(start.counts).toBeGreaterThanOrEqual(2);

  expect(start.released).toBe('running');
  expect(start.go).toBe(1);
  expect(start.hudAfter).toBe(true);
  for (const [seat, distance] of start.ran.entries()) {
    expect(distance, `seat ${seat} did not set off at GO`).toBeGreaterThan(0.5);
  }
  expect(errors).toEqual([]);
});

test('a two-seat race runs to a finish, and the card names the order', async ({ page }) => {
  // The end-to-end, driven through the bridge so it is deterministic: the
  // riders are placed on the gates rather than ridden, which proves the rules
  // and says nothing about the feel (that is the owner's Phase 5 gate).
  const errors = collectErrors(page);
  await bootRace(page, 2, 1);
  const all = await raceLines(page);

  await page.evaluate(() => {
    const game = window.game;
    // Past the count, so the race clock is running.
    game.advance(400);
  });
  expect(await page.evaluate(() => window.game.snapshot().race.phase)).toBe('running');

  // The standing start's out-lap: both riders cross the line with no sector
  // found, which the no-sector rule turns into a restart rather than a lap.
  for (const line of all) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const seat of [0, 1]) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }

  // Now the flying lap: sectors in order, then the line — seat 0 first.
  for (const line of all.slice(1)) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const seat of [0, 1]) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }

  const finish = await page.evaluate(({ centre, headingY }) => {
    const game = window.game;
    game.placeRider({ ...centre }, headingY, 0);
    game.advance(2);
    const afterLeader = game.snapshot().race;
    // A moment later, the other rider — so the two finishes are on different
    // steps and the gap is real.
    game.advance(60);
    game.placeRider({ ...centre }, headingY, 1);
    game.advance(2);
    game.advance(4);
    return { afterLeader, ended: game.snapshot().race };
  }, { centre: all[0].centre, headingY: all[0].headingY });

  expect(finish.afterLeader.riders[0].finished).toBe(true);
  expect(finish.afterLeader.leaderFinished).toBe(true);
  expect(finish.ended.phase).toBe('ended');
  expect(finish.ended.winner).toBe(0);
  expect(finish.ended.riders[1].finished).toBe(true);
  expect(finish.ended.riders[1].position).toBe(2);

  // The card, in the race's own words.
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText(/wins$/);
  await expect(page.locator('[data-menu="results-table-caption"]')).toHaveText('Finishing order');
  await expect(page.locator('[data-menu="results-column-label"]')).toHaveText('Position');
  await expect(page.locator('[data-menu="results-column-value"]')).toHaveText('Race time');
  await expect(page.locator('[data-menu="results-column-delta"]')).toHaveText('Gap');
  await expect(page.locator('[data-menu="results-rows"] tr')).toHaveCount(2);
  // Nothing is stored, and the card says so rather than leaving a room to
  // wonder where their time went.
  await expect(page.locator('.euc-results__notes')).toContainText('not saved');
  expect(errors).toEqual([]);
});

test('a race keeps nothing, and the solo track day beside it is untouched', async ({ page }) => {
  // q92. A bump-assisted or drafted lap must never take a record earned alone,
  // so the race files nothing at all — and the proof is that a solo session on
  // the same circuit still files everything.
  const errors = collectErrors(page);
  await bootRace(page, 2, 1);
  const all = await raceLines(page);

  await page.evaluate(() => window.game.advance(400));
  for (const line of [...all, ...all.slice(1), all[0]]) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const seat of [0, 1]) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }

  const kept = await page.evaluate(() => ({
    best: window.game.snapshot().record.totalSeconds,
    trackDayPhase: window.game.snapshot().trackDay.phase,
  }));
  // Nothing filed against this circuit: the store is exactly as empty as
  // `clearRecords` left it before the race started.
  expect(kept.best).toBeNull();
  // And the lap referee never armed: one rider on this circuit is a Track Day
  // and two are a race, decided once, by seat count.
  expect(kept.trackDayPhase).toBe('idle');
  expect(errors).toEqual([]);
});

test('a hop pressed during the countdown is not spent at GO — the fourth door', async ({ page }) => {
  // §27.3, and it is the M25 Phase 4 enumeration gaining its fourth member.
  // The three doors that clear a seat's one-shot sinks are blur/visibility, a
  // layout-changing resize, and a menu boundary; GO is the fourth, because the
  // freeze buffers a press rather than discarding it and a hop latched on "2"
  // would otherwise fire on the first racing step as a jump-start nobody made.
  //
  // **Per seat**, which is the whole reason the enumeration exists: M25's own
  // defect was a rule applied to the keyboard and not to the couch.
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');

  const jump = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.countdownSeconds', 3);
    game.startTrackDay();
    game.advance(2);

    const before = [0, 1].map((seat) => game.snapshotFor(seat).consumed.hop);
    // **Pressed late in the count, on purpose.** A press is buffered for
    // `INPUT.actionBufferSeconds` (0.15 s) and then lapses on its own, so a
    // press early in a three-second countdown proves nothing: it would be gone
    // by GO whatever the release did. This one is made a few hundredths of a
    // second before the room is let go, which is exactly the press a
    // jump-starting player makes and the only one the door can be seen doing
    // anything about.
    game.advance(350);
    game.setActionsFor(0, { hop: true });
    game.setActionsFor(1, { hop: true });
    game.advance(4);
    const held = [0, 1].map((seat) => game.snapshotFor(seat).consumed.hop);
    // **Still holding through GO**, which is what a jump-starting player
    // actually does. The buffered press is the one the door throws away; a
    // button that is merely *down* at the release must not fire, because it
    // was pressed before anybody was allowed to move.
    game.advance(12);
    const after = [0, 1].map((seat) => game.snapshotFor(seat).consumed.hop);

    // And the door does not break hopping: let go, press again, and the wheel
    // answers. A guard that also removed the feature would pass every
    // assertion above.
    game.setActionsFor(0, { hop: false });
    game.setActionsFor(1, { hop: false });
    game.advance(4);
    game.setActionsFor(0, { hop: true });
    game.setActionsFor(1, { hop: true });
    game.advance(20);
    const again = [0, 1].map((seat) => game.snapshotFor(seat).consumed.hop);
    return {
      frozen: held.map((count, seat) => count - before[seat]),
      released: after.map((count, seat) => count - held[seat]),
      later: again.map((count, seat) => count - after[seat]),
      phase: game.snapshot().race.phase,
    };
  });

  expect(jump.phase).toBe('running');
  // Nothing was spent during the freeze: the one-shots are held with the axes.
  expect(jump.frozen).toEqual([0, 0]);
  // And nothing was spent at the release either, for **either** seat.
  expect(jump.released).toEqual([0, 0]);
  // A fresh press after the race is running still hops, for both of them.
  for (const [seat, hops] of jump.later.entries()) {
    expect(hops, `seat ${seat} cannot hop after the release`).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// M27 Phase 4 — standings, the finished pane, and the card
// ---------------------------------------------------------------------------

test('every pane carries its own standings, and a pause does not blank them', async ({ page }) => {
  // §27.4, and the pause clause is M23's lap-lane lesson stated where it can
  // fail again: a player pauses *to read a number*, so the lane is gated on
  // the referee's own phase and never on the app state.
  const errors = collectErrors(page);
  await bootRace(page, 2, 3);
  await page.evaluate(() => window.game.advance(400));

  const lanes = await page.evaluate(() => {
    const game = window.game;
    game.advance(2);
    return [...document.querySelectorAll<HTMLElement>('.euc-hud-seat')].map((pane) => ({
      label: pane.querySelector<HTMLElement>('[data-hud="score-label"]')?.textContent ?? '',
      value: pane.querySelector<HTMLElement>('[data-hud="score-value"]')?.textContent ?? '',
      asideLabel: pane.querySelector<HTMLElement>('[data-hud="score-aside-label"]')?.textContent ?? '',
      aside: pane.querySelector<HTMLElement>('[data-hud="score-aside-value"]')?.textContent ?? '',
      visible: !(pane.querySelector<HTMLElement>('[data-hud="score"]')?.hidden ?? true),
    }));
  });

  expect(lanes).toHaveLength(2);
  for (const [seat, lane] of lanes.entries()) {
    expect(lane.visible, `seat ${seat} has no standings lane`).toBe(true);
    expect(lane.label).toBe('Lap 1 / 3');
    expect(lane.value, `seat ${seat} shows no position`).toMatch(/^[1-4](st|nd|rd|th)$/);
    // Before anybody has finished there is no gap that means anything, so the
    // row under it says how many people are in the race instead.
    expect(lane.asideLabel).toBe('Riders');
    expect(lane.aside).toBe('2');
  }

  // The pause: the lane is still there, with the same numbers on it.
  const paused = await page.evaluate(() => {
    const game = window.game;
    game.setActions({ pause: true });
    game.advance(2);
    game.setActions({ pause: false });
    game.advance(2);
    return {
      state: game.snapshot().app.state,
      label: document.querySelector<HTMLElement>('[data-hud="score-label"]')?.textContent ?? '',
      visible: !(document.querySelector<HTMLElement>('[data-hud="score"]')?.hidden ?? true),
    };
  });
  expect(paused.state).toBe('paused');
  expect(paused.visible, 'the standings blanked the moment somebody paused').toBe(true);
  expect(paused.label).toBe('Lap 1 / 3');
  expect(errors).toEqual([]);
});

test('a finished rider keeps riding under a banner — q97', async ({ page }) => {
  // The owner's answer, and the reason it is not a dead pane: a rider who has
  // crossed for the last time gets a cooldown lap for free, with their place
  // named above them and their clock stopped.
  const errors = collectErrors(page);
  await bootRace(page, 2, 1);
  const all = await raceLines(page);
  await page.evaluate(() => window.game.advance(400));

  // Out lap, then the flying lap, then seat 0 alone over the line.
  for (const line of [...all, ...all.slice(1)]) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const seat of [0, 1]) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }

  const banner = await page.evaluate(({ centre, headingY }) => {
    const game = window.game;
    game.placeRider({ ...centre }, headingY, 0);
    game.advance(2);
    game.advance(30);
    const panes = [...document.querySelectorAll<HTMLElement>('.euc-hud-seat')];
    const read = (pane: HTMLElement) => ({
      objective: pane.querySelector<HTMLElement>('[data-hud="objective"]')?.textContent ?? '',
      label: pane.querySelector<HTMLElement>('[data-hud="score-label"]')?.textContent ?? '',
      value: pane.querySelector<HTMLElement>('[data-hud="score-value"]')?.textContent ?? '',
    });
    const before = game.snapshotFor(0).euc.distanceTravelled;
    // The finished rider is still a rider: give them the throttle and they go.
    game.setActionsFor(0, { throttle: 1 });
    game.advance(120);
    return {
      finished: game.snapshot().race.riders[0].finished,
      panes: panes.map(read),
      rode: game.snapshotFor(0).euc.distanceTravelled - before,
      clock: game.snapshot().race.riders[0].finishSeconds,
      stillRunning: game.snapshot().race.phase,
    };
  }, { centre: all[0].centre, headingY: all[0].headingY });

  expect(banner.finished).toBe(true);
  expect(banner.panes[0].objective).toBe('Finished — 1st');
  expect(banner.panes[0].label).toBe('Finished');
  expect(banner.panes[0].value).toBe('1st');
  // The other pane is still racing and says so.
  expect(banner.panes[1].objective).toBe('');
  expect(banner.panes[1].label).toMatch(/^Lap /);
  // No dead pane: they ride on, and their clock stopped at the line.
  expect(banner.rode, 'the finished rider was frozen').toBeGreaterThan(1);
  expect(banner.clock).not.toBeNull();
  expect(banner.stillRunning).toBe('running');
  expect(errors).toEqual([]);
});

test('three racing seats give the idle quadrant the standings — q95', async ({ page }) => {
  // The dead space becomes the room's shared scoreboard. Each rider's own lane
  // is written from *their* end (q80); this is the view from nobody's, which
  // is the one no pane can show.
  const errors = collectErrors(page);
  await bootRace(page, 3, 3);

  const grid = await page.evaluate(() => {
    const game = window.game;
    game.advance(2);
    const card = document.querySelector<HTMLElement>('.euc-idle');
    return {
      views: game.renderer.viewCount,
      title: card?.querySelector<HTMLElement>('.euc-idle__title')?.textContent ?? '',
      rows: [...(card?.querySelectorAll<HTMLElement>('.euc-idle__label') ?? [])]
        .map((node) => node.textContent ?? ''),
      hidden: card?.hidden ?? true,
    };
  });

  // Three passes, and the fourth quarter is DOM over canvas nobody wrote.
  expect(grid.views).toBe(3);
  expect(grid.hidden).toBe(false);
  expect(grid.title).toBe('On the grid');
  expect(grid.rows).toHaveLength(3);
  for (const row of grid.rows) expect(row).toMatch(/^[123]\. /);

  const running = await page.evaluate(() => {
    const game = window.game;
    game.advance(400);
    const card = document.querySelector<HTMLElement>('.euc-idle');
    return {
      title: card?.querySelector<HTMLElement>('.euc-idle__title')?.textContent ?? '',
      details: [...(card?.querySelectorAll<HTMLElement>('.euc-idle__value') ?? [])]
        .map((node) => node.textContent ?? ''),
    };
  });
  expect(running.title).toBe('3 laps');
  for (const detail of running.details) expect(detail).toMatch(/^Lap \d \/ 3$/);
  expect(errors).toEqual([]);
});

test('the race card speaks the race’s words, and the next card does not', async ({ page }) => {
  // M26 Phase 6's vocabulary lesson, applied at birth and asserted the way it
  // asked to be: **two cards in one journey**, because a constant passes half
  // of a vocabulary test — asserting the new words on one card cannot tell
  // "the view carries them" from "somebody edited the markup".
  const errors = collectErrors(page);
  await bootRace(page, 2, 1);
  const all = await raceLines(page);
  await page.evaluate(() => window.game.advance(400));

  for (const line of [...all, ...all.slice(1), all[0]]) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const seat of [0, 1]) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

  // **The card opens on "Ride it again", not on the ride switch above it** —
  // the pause card's defect one screen over, and the same repair (the owner's
  // 2026-08-31 ride). A room that just finished a race and pressed A would
  // otherwise have changed what they play next instead of playing it again.
  const landed = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      focused: active instanceof HTMLElement ? active.dataset.menu ?? '' : '',
      switchShown: !(document.querySelector<HTMLElement>('[data-menu="results-couch"]')?.hidden ?? true),
    };
  });
  expect(landed.switchShown, 'no switch on the card means there is nothing to land on').toBe(true);
  expect(landed.focused, 'a confirm press here would have changed the next ride').toBe('retry');

  const raceCard = await page.evaluate(() => ({
    caption: document.querySelector<HTMLElement>('[data-menu="results-table-caption"]')?.textContent ?? '',
    label: document.querySelector<HTMLElement>('[data-menu="results-column-label"]')?.textContent ?? '',
    value: document.querySelector<HTMLElement>('[data-menu="results-column-value"]')?.textContent ?? '',
    delta: document.querySelector<HTMLElement>('[data-menu="results-column-delta"]')?.textContent ?? '',
    extra: document.querySelector<HTMLElement>('[data-menu="results-column-extra"]')?.textContent ?? '',
    extraHidden: document.querySelector<HTMLElement>('[data-menu="results-column-extra"]')?.hidden ?? true,
    compare: document.querySelector<HTMLElement>('[data-menu="results-table"]')?.dataset.compare ?? '',
    bests: [...document.querySelectorAll<HTMLElement>('.euc-results__row-extra')]
      .map((node) => node.textContent ?? ''),
    totalCaption: document.querySelector<HTMLElement>('[data-menu="results-total-caption"]')?.textContent ?? '',
  }));

  expect(raceCard.caption).toBe('Finishing order');
  expect(raceCard.label).toBe('Position');
  expect(raceCard.value).toBe('Race time');
  expect(raceCard.delta).toBe('Gap');
  // §27.4's fourth figure, and it is a real column rather than a nameless one.
  expect(raceCard.extraHidden).toBe(false);
  expect(raceCard.extra).toBe('Best lap');
  expect(raceCard.bests).toHaveLength(2);
  for (const best of raceCard.bests) expect(best).toMatch(/^\d+:\d{2}\.\d{2}$/);
  expect(raceCard.totalCaption).toBe('Laps');

  // **The second card of the journey.** Back to the title, ride a solo track
  // day on the same circuit, and the same four hooks must say the lap
  // referee's words instead — which they cannot do if they were edited into
  // the markup.
  await page.evaluate(() => {
    const game = window.game;
    game.despawnRider();
    game.advance(2);
  });
  await page.locator('.euc-menu--results [data-menu="results-title"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearRecords();
    game.startTrackDay();
    game.advance(2);
  });
  const lapLines = await raceLines(page);
  for (const line of [...lapLines, ...lapLines.slice(1), lapLines[0]]) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      game.placeRider({ ...centre }, headingY, 0);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }
  await page.evaluate(() => {
    const game = window.game;
    game.setActions({ pause: true });
    game.advance(2);
    game.setActions({ pause: false });
    game.advance(2);
  });
  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

  const lapCard = await page.evaluate(() => ({
    caption: document.querySelector<HTMLElement>('[data-menu="results-table-caption"]')?.textContent ?? '',
    label: document.querySelector<HTMLElement>('[data-menu="results-column-label"]')?.textContent ?? '',
    extraHidden: document.querySelector<HTMLElement>('[data-menu="results-column-extra"]')?.hidden ?? true,
  }));
  expect(lapCard.caption).not.toBe(raceCard.caption);
  expect(lapCard.label).not.toBe(raceCard.label);
  // And the fourth column goes away with the mode that named it, rather than
  // leaving a nameless empty column behind — M26 Phase 6's own finding.
  expect(lapCard.extraHidden).toBe(true);
  expect(errors).toEqual([]);
});

test('two riders who cross together draw it, and the card says why', async ({ page }) => {
  // q86's shape, inherited: finishes are recorded as the seats step and the
  // standings are decided after every seat has stepped, so a genuine dead heat
  // is a shared position rather than a race won by whichever seat the loop
  // reached first. **A draw is still a card** — a heading with nobody's name in
  // it reads as a bug on a screen the player has never seen before, so it says
  // what happened instead.
  const errors = collectErrors(page);
  await bootRace(page, 2, 1);
  const all = await raceLines(page);
  await page.evaluate(() => window.game.advance(400));

  // Both riders through every gate together, including the last one: the same
  // step, the same clock, no order to find.
  for (const line of [...all, ...all.slice(1), all[0]]) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const seat of [0, 1]) game.placeRider({ ...centre }, headingY, seat);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }

  const drawn = await page.evaluate(() => {
    const race = window.game.snapshot().race;
    return {
      phase: race.phase,
      winner: race.winner,
      positions: race.riders.map((rider) => rider.position),
      seconds: race.riders.map((rider) => rider.finishSeconds),
    };
  });

  expect(drawn.phase).toBe('ended');
  expect(drawn.winner, 'a dead heat found a winner anyway').toBeNull();
  expect(drawn.positions).toEqual([1, 1]);
  expect(drawn.seconds[0]).toBe(drawn.seconds[1]);

  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('Race drawn');
  await expect(page.locator('.euc-menu--results')).not.toContainText('wins');
  await expect(page.locator('[data-menu="results-notes"]')).toContainText('same step');
  expect(errors).toEqual([]);
});

test('a paused race offers no pit-in, and the mode switch is how you leave', async ({ page }) => {
  // **A control drawn for a session its own handler will not serve** — M26's
  // rule, and a race walked straight into it: a race rides on the `trackDay`
  // row, so "End session" was offered on a paused race and its handler asked
  // the *lap* referee to end, which during a race is idle. A visible button
  // that did nothing.
  //
  // Hidden rather than made to work, which is a decision: pitting in is a
  // track day's idea, and §27.4 already says a race is quit by changing what
  // the couch is doing — which is why the card has a print for a rider who
  // left that way.
  const errors = collectErrors(page);
  await bootRace(page, 2, 3);
  await page.evaluate(() => {
    const game = window.game;
    game.advance(400);
    game.setActions({ pause: true });
    game.advance(2);
    game.setActions({ pause: false });
    game.advance(2);
  });

  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"]')).toBeHidden();
  // And the handler refuses on the same terms as the control, so a stale click
  // through the bridge cannot reach past it either.
  const stuck = await page.evaluate(() => {
    const game = window.game;
    document.querySelector<HTMLElement>('.euc-menu--pause [data-menu="end-session"]')?.click();
    game.advance(2);
    return { state: game.snapshot().app.state, phase: game.snapshot().race.phase };
  });
  expect(stuck.state).toBe('paused');
  expect(stuck.phase).toBe('running');

  // The way out that *is* offered: the couch's own mode switch, on the screen
  // the room is already looking at.
  await expect(
    page.locator('.euc-menu--pause [data-menu="switch-mode"][data-couch-mode="freeRide"]'),
  ).toBeVisible();
  await page.locator(
    '.euc-menu--pause [data-menu="switch-mode"][data-couch-mode="freeRide"]',
  ).click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  // And the referee left with the run, so no countdown or standings follow the
  // room into a free ride.
  expect(await page.evaluate(() => window.game.snapshot().race.phase)).toBe('idle');
  expect(errors).toEqual([]);
});

test('a solo track day still pits in, which is the control this did not break', async ({ page }) => {
  // The other half of the same claim, and the reason it is a separate test: a
  // guard that hid the button for *everybody* would pass every assertion above
  // and delete a feature M23 shipped.
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearRecords();
    game.startTrackDay();
    game.advance(2);
    game.setActions({ pause: true });
    game.advance(2);
    game.setActions({ pause: false });
    game.advance(2);
  });

  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('paused');
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"]')).toBeVisible();
  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// QA repair, 2026-08-31 — the coverage the independent pass found missing.
//
// Four browser claims: the six-pair pile-up at the full couch, the
// contact history of a seat refilled on the step it emptied, one countdown
// voice for a room of four, and the grace-cut rider's row on the card. Each
// sits beside the repair it proves; the referee-side halves (the same-step
// flag, the missed sector, the live gap, signed progress) are node tests in
// `src/simulation/raceRun.test.ts`, where the rules live.
// ---------------------------------------------------------------------------

test('four riders stacked together are six pairs, and the pile-up proves it', async ({ page }) => {
  // The three-seat test above proves the pairs are enumerated and separation
  // opens them. What four seats add is the *count*: 4·3/2 pairs whose bumps
  // accumulate — \"two pairs pushing one rider add up the way two shoves
  // would\" (M27 Phase 1) — so a rider in a four-way stack takes three
  // charges at once where the triangle's riders took two. The observable is
  // the game's own verdict on that much wobble: the triangle stays upright,
  // and the four-way stack is a pile-up that puts everybody down (M15's fun
  // wipeouts, arrived at honestly). A partial enumeration — one pair, or a
  // star around one seat — cannot put all four down, because the probe data
  // says two charges are survivable; only all six pairs give every rider
  // their third.
  const errors = collectErrors(page);
  await bootSeats(page, 4);

  const pileUp = await page.evaluate(() => {
    const game = window.game;
    const live = game.snapshot().contact.live;
    const spawn = game.snapshot().euc;
    const offsets = [
      { x: 0, z: 0 }, { x: 0.3, z: 0 }, { x: 0.15, z: 0.3 }, { x: -0.15, z: 0.15 },
    ];
    for (let seat = 0; seat < 4; seat += 1) {
      game.placeRider(
        {
          x: spawn.position.x + offsets[seat].x,
          y: spawn.position.y,
          z: spawn.position.z + offsets[seat].z,
        },
        spawn.headingY,
        seat,
      );
    }
    game.advance(12);
    return {
      live,
      riders: [0, 1, 2, 3].map((seat) => {
        const euc = game.snapshotFor(seat).euc;
        return { crashed: euc.crashed, crashes: euc.crashes };
      }),
    };
  });

  expect(pileUp.live).toBe(true);
  for (const [seat, rider] of pileUp.riders.entries()) {
    // The wobble itself is spent by the fall, so the durable evidence is the
    // crash counter and the ragdoll still on the ground.
    expect(rider.crashes, `seat ${seat} was never put down`).toBeGreaterThanOrEqual(1);
    expect(rider.crashed, `seat ${seat} stayed upright through a four-way pile-up`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('a seat refilled on the step it emptied does not inherit the old bump', async ({ page }) => {
  // **The stale-pair defect, at zero steps.** `stepContact` clears every pair
  // on a discontinuity — but only on a step it runs, and a seat despawned and
  // refilled between steps used to hand the replacement rider the old pair's
  // merged latch and cooldown, so their first real meeting produced no bump.
  // The existing lifecycle test advanced ten steps between the two calls,
  // which is exactly the window that hid it (QA repair, 2026-08-31).
  //
  // No `placeRider` after the respawn: a teleport trips the reset door and
  // clears every pair anyway, which would prove the door rather than the
  // despawn. The new rider appears in their own spawn slot, so rider 0 is
  // parked beside *that* before the seat is recycled.
  const errors = collectErrors(page);
  await bootSeats(page, 3);

  const verdict = await page.evaluate(() => {
    const game = window.game;
    // A bump is a rise in wobble energy on both riders at once (m26's rule),
    // and wobble otherwise only decays — so a charge is found by stepping one
    // step at a time and watching for the shared rise, never by comparing two
    // endpoints across a decay.
    const charges = (first: number, second: number, steps: number): number => {
      let found = 0;
      let a = game.snapshotFor(first).euc.wobbleEnergy;
      let b = game.snapshotFor(second).euc.wobbleEnergy;
      for (let i = 0; i < steps; i += 1) {
        game.advance(1);
        const nextA = game.snapshotFor(first).euc.wobbleEnergy;
        const nextB = game.snapshotFor(second).euc.wobbleEnergy;
        if (nextA > a + 1e-9 && nextB > b + 1e-9) found += 1;
        a = nextA;
        b = nextB;
      }
      return found;
    };

    const slot = game.snapshotFor(2).euc.position;
    // Rider 1 far away so exactly one pair is in play; rider 0 beside the
    // seat-2 slot, inside the contact radius.
    game.placeRider({ x: slot.x + 30, y: slot.y, z: slot.z + 30 }, 0, 1);
    game.placeRider({ x: slot.x + 0.25, y: slot.y, z: slot.z }, 0, 0);
    // Sampled from the very first step: the teleport door spends step one,
    // and the charge lands the moment the door is clear — a warm-up advance
    // here would eat the rise the fixture is checking for.
    const armed = charges(0, 2, 8);

    // The recycle, with no step between: the room's fourth player handed the
    // pad straight to somebody else.
    game.despawnRider();
    game.spawnRider();
    const landed = game.snapshotFor(2).euc.position;
    const zero = game.snapshotFor(0).euc.position;
    const gap = Math.hypot(landed.x - zero.x, landed.z - zero.z);

    // Well inside the old pair's cooldown (0.40 s is 48 steps): if its
    // history survived the recycle, nothing can charge in this window.
    const met = charges(0, 2, 10);
    return { armed, gap, met };
  });

  // The fixture armed the state it claims to: the first meeting really did
  // charge, and the recycled seat really did land back inside the radius.
  expect(verdict.armed, 'the first pairing never charged').toBeGreaterThan(0);
  expect(verdict.gap, 'the respawned rider did not land beside rider 0').toBeLessThan(0.7);
  // **The claim**: the replacement rider's first meeting is a first meeting.
  expect(verdict.met, 'the new rider inherited the old pair\'s bump').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('four panes show the count, and exactly one of them says it aloud', async ({ page }) => {
  // Four `aria-live="assertive"` regions changing on the same step would have
  // a screen reader announce "3" over itself three times — the room shares
  // one clock, so it gets one voice, on the first seat's pane (QA repair,
  // 2026-08-31). Every pane still *shows* the number.
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');

  const count = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 4) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.countdownSeconds', 3);
    game.startTrackDay();
    game.advance(2);
    game.advance(30);
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-hud="count"]')];
    return {
      phase: game.snapshot().race.phase,
      panes: nodes.map((node) => ({
        text: node.textContent ?? '',
        hidden: node.hidden,
        live: node.getAttribute('aria-live'),
        seat: node.closest<HTMLElement>('.euc-hud-seat')?.dataset.seat ?? '',
      })),
    };
  });

  expect(count.phase).toBe('countdown');
  expect(count.panes).toHaveLength(4);
  for (const pane of count.panes) {
    expect(pane.hidden, `seat ${pane.seat} is not showing the count`).toBe(false);
    expect(pane.text).toBe('3');
  }
  const voices = count.panes.filter((pane) => pane.live === 'assertive');
  expect(voices).toHaveLength(1);
  expect(voices[0].seat).toBe('0');
  expect(errors).toEqual([]);
});

test('the grace cuts a rider to a Did-not-finish row, and the headline is the winner’s clock', async ({ page }) => {
  // Two presentation claims off one ride (QA repair, 2026-08-31): a rider the
  // grace classified is an honest row — "Did not finish", no gap dressed as a
  // time — and the big "Race time" is the winner's clock, not the moment the
  // grace ran out. The second is the headline defect: `result.seconds` is
  // when the *race* ended, and with a grace that is the field's time wearing
  // the winner's label.
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.laps', 1);
    game.tuning.set('RACE.finishGraceSeconds', 4);
    game.startTrackDay();
    game.advance(2);
    // Past the countdown, so the gates below are ridden by a *running* race.
    game.advance(420);
  });
  const all = await raceLines(page);

  // Seat 0 rides the lap through every gate; seat 1 never leaves the grid.
  for (const line of [...all, ...all.slice(1), all[0]]) {
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      game.placeRider({ ...centre }, headingY, 0);
      game.advance(2);
      game.advance(30);
    }, { centre: line.centre, headingY: line.headingY });
  }

  const raced = await page.evaluate(() => {
    const game = window.game;
    const atFinish = game.snapshot().race;
    // The grace, spent: four seconds at 120 steps a second, and a margin.
    game.advance(520);
    return { atFinish, ended: game.snapshot().race };
  });
  expect(raced.atFinish.riders[0].finished).toBe(true);
  expect(raced.atFinish.phase).toBe('running');
  expect(raced.ended.phase).toBe('ended');
  expect(raced.ended.riders[1].finished).toBe(false);

  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  const card = await page.evaluate(() => ({
    winnerSeconds: window.game.snapshot().race.riders[0].finishSeconds,
    heading: document.querySelector<HTMLElement>('[data-menu="results-heading"]')?.textContent ?? '',
    headline: document.querySelector<HTMLElement>('[data-menu="results-best"]')?.textContent ?? '',
    rows: [...document.querySelectorAll<HTMLElement>('[data-menu="results-rows"] tr')]
      .map((row) => [...row.querySelectorAll('th,td')].map((cell) => cell.textContent ?? '')),
  }));

  expect(card.heading).toMatch(/wins$/);
  expect(card.rows).toHaveLength(2);
  // The cut rider: named position, an honest time cell, no invented gap, and
  // no best lap to show — they never closed one.
  expect(card.rows[1][0]).toMatch(/^2\./);
  expect(card.rows[1][1]).toBe('Did not finish');
  expect(card.rows[1][2]).toBe('');
  expect(card.rows[1][3]).toBe('—');
  // The headline is the winner's own row, to the digit.
  expect(card.rows[0][1]).toBe(card.headline);
  expect(card.headline).not.toBe('');

  // And the room can leave: the card's own door works after a grace ending.
  await page.locator('.euc-menu--results [data-menu="results-title"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  expect(errors).toEqual([]);
});

test('sixty-four tones in two steps saturate the sink politely', async ({ page }) => {
  // The voice cap's boundary, stood on (QA repair, 2026-08-31): forty-eight
  // is derived — three sources a cue at the four-seat worst case — and the
  // previous coverage never approached it. `raceCount` is not rate-limited
  // (the referee limits it), so the bridge can honestly demand more one-shots
  // than the sink will hold, and the claim is that the cap refuses the excess
  // without an error and without wedging what follows.
  const errors = collectErrors(page);
  await boot(page);
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().armed);

  const heard = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const director = game.audio.director;
    for (let i = 0; i < 32; i += 1) director.raceCount();
    game.advance(1);
    for (let i = 0; i < 32; i += 1) director.raceCount();
    game.advance(1);
    const at = game.audioSnapshot();
    return { voices: at.voices, dropped: at.droppedVoices, ringAfter: director.cueCount };
  });

  // The ring was drained by its consumer, the sink held its cap, and the
  // overflow was counted out rather than thrown.
  expect(heard.ringAfter).toBe(0);
  expect(heard.voices).toBeGreaterThan(0);
  expect(heard.voices).toBeLessThanOrEqual(48);
  expect(heard.dropped).toBeGreaterThan(0);

  // And the sink is not wedged: the next ordinary cue still sounds.
  const after = await page.evaluate(() => {
    const game = window.game;
    const before = game.audioSnapshot().played.curb;
    game.audio.director.impact(8, 0);
    game.advance(2);
    return { before, now: game.audioSnapshot().played.curb };
  });
  expect(after.now).toBeGreaterThan(after.before);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The owner's couch ride, 2026-08-31 — two defects a bridge could not see
// ---------------------------------------------------------------------------

/** `count` standard pads, so a couch can seat `count + 1` with the keyboard. */
async function fakePads(page: import('@playwright/test').Page, count: number): Promise<void> {
  await page.addInitScript((wanted) => {
    const pads = Array.from({ length: wanted }, (_unused, index) => ({
      index,
      id: `fake standard pad ${index}`,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    }));
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  }, count);
}

/** Press and release A on one pad, a real frame apart — `m26.spec.ts`'s recipe. */
async function claimWithPad(page: import('@playwright/test').Page, index: number): Promise<void> {
  await page.evaluate(async (at) => {
    type Pads = { buttons: { pressed: boolean; value: number }[] }[];
    const pad = (window as unknown as { fakePads: Pads }).fakePads[at];
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[0].pressed = true;
    pad.buttons[0].value = 1;
    await frame();
    pad.buttons[0].pressed = false;
    pad.buttons[0].value = 0;
    await frame();
  }, index);
}

/**
 * Three players into a race **the way a room actually does it** — the join
 * panel, its own Race control, Start riding.
 *
 * Every other race in this file is armed through the QA bridge or reached from
 * a free ride through the pause card's switch, which is exactly how the
 * entrance below went a whole milestone without being ridden.
 *
 * Booted into the game's own world rather than `level=track`, because the
 * player's route swaps worlds on the way to the circuit and the swap is part
 * of the entrance.
 *
 * **The claims run pads first and the keyboard last, and that order is the
 * panel's rather than a preference.** It opens with two chairs already out and
 * `growCouch` puts another one out only once every chair already out is
 * claimed, so each pad after the first is what grows the room. `seats - 1`
 * pads and the keyboard therefore fill a room of any size up to `COUCH_SEATS`.
 */
async function startPanelRace(
  page: import('@playwright/test').Page,
  seats: number,
): Promise<void> {
  await fakePads(page, seats - 1);
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  // The priming frames `m25.spec.ts` requires: a button already down when the
  // panel appeared must claim nothing.
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });

  for (let pad = 0; pad < seats - 1; pad += 1) {
    await claimWithPad(page, pad);
    await page.waitForFunction(
      (index) => window.game.snapshot().input.devices[index] === `pad:${index}`,
      pad,
    );
  }
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (last) => window.game.snapshot().input.devices[last] === 'keyboard',
    seats - 1,
  );

  await page.locator('.euc-menu--couch [data-menu="couch-mode"][data-couch-mode="race"]').click();
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
}

/*
 * **The owner's 2026-08-31 ride, at both room sizes.** Choosing Race on the
 * join panel armed the referee for the whole room and laid the grid out — and
 * then sent every guest home on the way in. `onStateChanged` enumerates the
 * exits that *are* the couch session, and `trackDay` was written a milestone
 * before the race existed, so the room arrived as one rider in one view with
 * the race HUD still counting three and every device falling through to seat
 * 0.
 *
 * Run at three **and four**, because the rule that broke says nothing about
 * how many chairs are out: a room of any size was emptied by it, and a spec
 * that only ever filled three would leave the full couch — the thing M27 is
 * for — resting on the assumption that four behaves like three.
 */
for (const seats of [3, 4]) {
  test(`the panel’s own Race keeps all ${seats} of them in it`, async ({ page }) => {
    const errors = collectErrors(page);
    await startPanelRace(page, seats);

    const started = await page.evaluate(() => ({
      seats: window.game.seatCount,
      views: window.game.renderer.viewCount,
      riders: window.game.snapshot().race.riders.length,
      phase: window.game.snapshot().race.phase,
      held: window.game.snapshot().input.devices.filter((device) => device !== null).length,
      panes: document.querySelectorAll('.euc-hud-seat').length,
    }));
    expect(started.seats, 'the exit sent the guests home on the way into the race').toBe(seats);
    expect(started.views, 'a room of riders drawn in one view').toBe(seats);
    expect(started.riders).toBe(seats);
    expect(started.panes, 'a rider with no pane to read').toBe(seats);
    expect(started.phase, 'a race that never armed').not.toBe('idle');
    expect(started.held, 'the claims went home with the guests').toBe(seats);
    expect(errors).toEqual([]);
  });
}

test('a pause in a couch race lands on Resume, not on the mode switch', async ({ page }) => {
  /*
   * **The owner's race, ended by his own pause on the last lap.** The couch
   * mode switch is drawn above the actions — the right place for it to read —
   * and `focusFirst` took the first focusable node, so pausing put the cursor
   * on *Free ride*. One confirm press, meaning "carry on", took the whole room
   * out of the race and into a free ride instead.
   *
   * Asserted twice over: where the focus lands, and what pressing it does.
   */
  const errors = collectErrors(page);
  await startPanelRace(page, 4);
  await page.evaluate(() => window.game.advance(400));

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  const paused = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      focused: active instanceof HTMLElement ? active.dataset.menu ?? '' : '',
      switchShown: !(document.querySelector<HTMLElement>('[data-menu="pause-couch"]')?.hidden ?? true),
      ride: window.game.snapshot().couch.ride,
    };
  });
  expect(paused.switchShown, 'no switch on the card means there is nothing to land on').toBe(true);
  expect(paused.ride).toBe('race');
  expect(paused.focused, 'a confirm press here would have changed everybody’s ride').toBe('resume');

  // And the press itself: the room carries on, and it is still a race.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  const after = await page.evaluate(() => ({
    ride: window.game.snapshot().couch.ride,
    phase: window.game.snapshot().race.phase,
    seats: window.game.seatCount,
  }));
  expect(after.ride, 'resuming changed the ride').toBe('race');
  expect(after.phase).toBe('running');
  expect(after.seats).toBe(4);
  expect(errors).toEqual([]);
});

test('the join panel splits for the players in it, not the chairs put out', async ({ page }) => {
  /*
   * **The owner's 2026-08-31 ride, third find.** He took seat 1 on the
   * keyboard and seat 2 on an Xbox pad, and the screen behind the panel split
   * into *three* — because a claim can only point at a seat that already
   * exists, so the panel puts the next chair out as soon as the last one is
   * taken, and views followed riders. It corrected itself at Start riding
   * (`trimUnclaimedSeats`), which is what made it an oddity rather than a bug;
   * he chose to have the split follow the players instead.
   *
   * Walked claim by claim, because the whole claim is about the moments
   * *between* claims — an assertion taken only at the end would pass on the
   * unfixed game, which corrects itself on the way into the ride.
   */
  const errors = collectErrors(page);
  await fakePads(page, 2);
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });

  const room = () => page.evaluate(() => ({
    chairs: window.game.seatCount,
    views: window.game.renderer.viewCount,
    players: window.game.snapshot().input.devices.filter((device) => device !== null).length,
  }));
  const claimed = (count: number) => page.waitForFunction(
    (wanted) => window.game.snapshot().input.devices.filter((device) => device !== null).length === wanted,
    count,
  );

  // Two chairs are out before anybody has sat down, and nobody is a player yet.
  expect(await room()).toEqual({ chairs: 2, views: 1, players: 0 });

  await page.keyboard.press('Enter');
  await claimed(1);
  expect(await room(), 'one player, one screen').toEqual({ chairs: 2, views: 1, players: 1 });

  // **The moment he saw.** The second claim fills the last chair, so a third is
  // put out for the spare pad — and the split must stay with the two people.
  await claimWithPad(page, 0);
  await claimed(2);
  expect(await room(), 'a pane was drawn for a chair nobody had taken')
    .toEqual({ chairs: 3, views: 2, players: 2 });

  await claimWithPad(page, 1);
  await claimed(3);
  expect(await room(), 'the third player never got their pane')
    .toEqual({ chairs: 3, views: 3, players: 3 });

  // And the ride agrees with the panel it came from.
  await page.locator('.euc-menu--couch [data-menu="couch-mode"][data-couch-mode="race"]').click();
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  expect(await room()).toEqual({ chairs: 3, views: 3, players: 3 });
  expect(errors).toEqual([]);
});

/** A generated world with discs in it, so a fight has something to knock down. */
const DUEL_SEED = 'route-41';

/** Open the join panel on a stated world and let the priming frames go by. */
async function openPanelOn(page: import('@playwright/test').Page, query = ''): Promise<void> {
  await bootToTitle(page, query);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
}

/** How many devices are holding a seat right now. */
function playersIn(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => window.game.snapshot().input.devices.filter((device) => device !== null).length,
  );
}

async function waitForPlayers(page: import('@playwright/test').Page, count: number): Promise<void> {
  await page.waitForFunction(
    (wanted) => window.game.snapshot().input.devices.filter((device) => device !== null).length === wanted,
    count,
  );
}

const knockaboutOff = (page: import('@playwright/test').Page): Promise<boolean> => page.evaluate(
  () => document.querySelector<HTMLButtonElement>(
    '.euc-menu--couch [data-couch-mode="knockabout"]',
  )?.disabled ?? true,
);

test('two players may have the two-player fight, spare chair or not', async ({ page }) => {
  /*
   * **The owner's 2026-08-31 ride, fourth find.** q94 keeps Knockabout a
   * two-seat fight until its four-player rules are opened, and the join panel
   * asked that question of the *seat* count — but the panel puts the next chair
   * out as soon as the last one is claimed, so two players with a third pad
   * plugged in were a room of three chairs and the fight was struck off the
   * menu they were entitled to. The width question counts people now
   * (`Game.roomSize`), which is the same number everywhere a ride is running.
   */
  const errors = collectErrors(page);
  await fakePads(page, 2);
  await openPanelOn(page, `level=generated&seed=${DUEL_SEED}`);

  await page.keyboard.press('Enter');
  await waitForPlayers(page, 1);
  await claimWithPad(page, 0);
  await waitForPlayers(page, 2);

  // Two players, three chairs — the exact room that was refused.
  expect(await page.evaluate(() => window.game.seatCount), 'no spare chair, so nothing is proved').toBe(3);
  expect(await playersIn(page)).toBe(2);
  expect(await knockaboutOff(page), 'a two-player couch was refused the two-player fight').toBe(false);

  await page.locator('.euc-menu--couch [data-menu="couch-mode"][data-couch-mode="knockabout"]').click();
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'knockabout');
  const fight = await page.evaluate(() => ({
    seats: window.game.seatCount,
    views: window.game.renderer.viewCount,
    match: window.game.snapshot().match.phase,
    scores: window.game.snapshot().match.scores.length,
    equipped: window.game.snapshot().paddle.equipped,
  }));
  expect(fight.seats, 'the spare chair came to the fight').toBe(2);
  expect(fight.views).toBe(2);
  expect(fight.match, 'two seats in Knockabout is a match').toBe('running');
  expect(fight.scores).toBe(2);
  expect(fight.equipped, 'a fight without paddles is not one').toBe(true);
  expect(errors).toEqual([]);
});

test('a third player still takes the fight off the menu — q94', async ({ page }) => {
  /*
   * The other half of the same repair, and the one that could have been broken
   * by it: q94 is not relaxed, it is re-keyed. A *chair* arriving used to strike
   * Knockabout off, which was one player too early; a **player** arriving does
   * it now, and the chooser is painted with the ride the room actually has
   * rather than leaving a selected mode nobody may have.
   */
  const errors = collectErrors(page);
  await fakePads(page, 2);
  await openPanelOn(page, `level=generated&seed=${DUEL_SEED}`);

  await page.keyboard.press('Enter');
  await waitForPlayers(page, 1);
  await claimWithPad(page, 0);
  await waitForPlayers(page, 2);
  await page.locator('.euc-menu--couch [data-menu="couch-mode"][data-couch-mode="knockabout"]').click();
  expect(await page.evaluate(() => window.game.snapshot().couch.ride)).toBe('knockabout');

  // The third player sits down, and the fight goes with them.
  await claimWithPad(page, 1);
  await waitForPlayers(page, 3);
  expect(await knockaboutOff(page), 'a room of three was still offered the two-seat fight').toBe(true);
  expect(
    await page.evaluate(() => window.game.snapshot().couch.ride),
    'the room was left holding a ride it may not have',
  ).toBe('freeRide');
  expect(errors).toEqual([]);
});

/*
 * **`R` costs the lap — for the host too** (the 2026-09-01 audit).
 *
 * §27.3 makes the reset self-harm: it voids exactly one rider's lap and
 * nobody else's. It did not reach seat 0. `Game.step` records each seat's
 * reset into `seatResetThisStep` and then, when *seat 0* resets, returns early
 * at `worldReset` — single-seat semantics kept byte for byte — and that return
 * sits above the line that steps the race. The flag was overwritten on the
 * next step before the referee ever read it, so the host could bin it and bank
 * the lap anyway, while every guest lost theirs.
 *
 * Run for both seats: seat 1 is the control that always worked, and a spec
 * that only exercised the broken seat could not tell "fixed" from "voids
 * everybody now".
 */
for (const seat of [0, 1]) {
  test(`R costs seat ${seat} the lap they were on`, async ({ page }) => {
    const errors = collectErrors(page);
    await bootRace(page, 2, 1);
    const all = await raceLines(page);
    await page.evaluate(() => window.game.advance(400));

    // Both riders ride a lap that would count: the line opens it, then both
    // sectors are found in order.
    for (const line of all) {
      await page.evaluate(({ centre, headingY }) => {
        const game = window.game;
        for (const rider of [0, 1]) game.placeRider({ ...centre }, headingY, rider);
        game.advance(2);
        game.advance(30);
      }, { centre: line.centre, headingY: line.headingY });
    }

    // One of them bins it, a whole lap in.
    await page.evaluate((who) => {
      const game = window.game;
      game.setActionsFor(who, { reset: true });
      game.advance(2);
      game.setActionsFor(who, { reset: false });
      game.advance(2);
    }, seat);

    // And both come back to the line.
    await page.evaluate(({ centre, headingY }) => {
      const game = window.game;
      for (const rider of [0, 1]) game.placeRider({ ...centre }, headingY, rider);
      game.advance(2);
      game.advance(30);
    }, { centre: all[0].centre, headingY: all[0].headingY });

    const laps = await page.evaluate(
      () => window.game.snapshot().race.riders.map((rider) => rider.lapsCompleted),
    );
    expect(laps[seat], 'the reset did not cost the lap').toBe(0);
    expect(
      laps[1 - seat],
      'the fixture never banked a lap at all, so it proves nothing about the one it voided',
    ).toBe(1);
    expect(errors).toEqual([]);
  });
}
