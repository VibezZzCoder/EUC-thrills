/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { bootToTitle } from './harness.ts';

/**
 * M38 Phase 2 — the live Trick Run lane, measured (`docs/PLANS.md` §38.6).
 *
 * **What only a browser can answer here is fit.** `src/ui/hudModel.test.ts`
 * settles every content decision this lane makes — which words, which rows,
 * which number — as arithmetic. What it cannot say is whether "Charged hop +
 * 180 + One-foot  +1,000" fits the corner of a 360 px phone, whether the rows
 * stay out of the protected middle fifth, and whether a couch quadrant's lane
 * is still inside its own pane. Those are properties of `game.css` against a
 * real layout engine, and this file is where they are asserted.
 *
 * **The fit matrix is driven through a probe rather than through the mode, and
 * the probe is production code.** A pane matrix wants seven window sizes and
 * four seats at the widest text the referee can produce, and no ride reaches
 * that on demand — so each matrix fixture mounts the real `Hud` into the real
 * `.euc-hud-seat` container that
 * `Game.mountSeatHud` builds, with the real stylesheet and the real
 * `HudModel`-computed view. Nothing here is a test double of a layer: only the
 * referee's numbers are typed in rather than ridden for, and a lane measured
 * with them is measured at the size it will actually paint. **The last fixture
 * closes that loop** — it starts the shipped mode through its own entrance and
 * reads the lane the game drew — so the probe is evidence about geometry and
 * the ride is evidence that the geometry is the one a player meets. The mode's
 * doors themselves belong to the spec whose subject they are.
 *
 * **It loads the page for its stylesheet, and does not wait for the game to
 * boot.** Everything measured here is `game.css` against real text in the real
 * `Hud`; a WebGL context, a world and a referee are not inputs to any of it.
 * Waiting for `window.game` would make a fit measurement fail for a reason that
 * says nothing about fit — which is exactly what happened while this was
 * written, with the parallel builder's `app/` mid-edit. Boot health, and
 * console silence during a ride, belong to the specs whose subject they are.
 *
 * **This file runs on `chromium` only, and that is the config's choice rather
 * than a decision.** `playwright.config.ts` matches the `mobile` project to
 * `touch.spec.ts` alone, so a phone is reached here by viewport size and by
 * `setTouchLayout(true)` — the same two things the stylesheet keys off — and
 * the real coarse-pointer controls belong to the touch spec. Stated, not
 * smoothed over.
 */


/**
 * The page, loaded for its stylesheet alone.
 *
 * `game.css` is linked from `index.html`, so it is applied whether or not
 * `app/main.ts` reaches a title screen. The wait is on the sheet having been
 * parsed — asserted by a rule only it declares — rather than on any game state.
 */
async function openStyled(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => {
    const probe = document.createElement('div');
    probe.className = 'euc-hud-seat';
    document.body.appendChild(probe);
    const applied = getComputedStyle(probe).position === 'fixed';
    probe.remove();
    return applied;
  });
}

/** The middle fifth of a box, in both axes — `DESIGN.md` §9's reserved lane. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface RowMetrics {
  readonly box: Box;
  /** True when the row's text is wider than the box it was given. */
  readonly clipped: boolean;
  readonly text: string;
}

interface PaneMetrics {
  readonly pane: Box;
  readonly lane: Box;
  readonly rows: Record<string, RowMetrics>;
  readonly hidden: string[];
}

/**
 * One reading of the lane, per pane, at whatever the page is currently sized.
 *
 * The seats are built exactly as `Game.mountSeatHud` builds them — one
 * `.euc-hud-seat` per rider, `setSplit(side, row)` written onto both the HUD
 * and its container — because the split's whole mechanism is that attribute
 * pair and a probe that skipped it would measure a solo lane four times.
 */
async function measure(
  page: Page,
  options: {
    readonly seats: number;
    readonly touch?: boolean;
    readonly input: Record<string, unknown>;
  },
): Promise<PaneMetrics[]> {
  return page.evaluate(async ({ seats, touch, input }) => {
    // **The specifier is a variable, and that is not a style choice.** A
    // literal would be resolved by the type checker against this file's own
    // module graph — where `/src/...` is an absolute filesystem path and not a
    // module — and by Vite at build time. Here it is neither: it is a URL the
    // *page* fetches from the dev server that is already serving these modules
    // to the game itself.
    const load = (path: string): Promise<Record<string, never>> => import(path);
    const [model, dom] = await Promise.all([
      load('/src/ui/hudModel.ts'),
      load('/src/ui/hud.ts'),
    ]);
    const HudModel = model.HudModel as unknown as new () => { update(t: number, i: never): never };
    const Hud = dom.Hud as unknown as new (options: {
      parent: HTMLElement;
      announcesCountdown?: boolean;
    }) => {
      setVisible(visible: boolean): void;
      setTouchLayout(active: boolean): void;
      setSplit(side: 'left' | 'right' | null, row?: 'top' | 'bottom' | null): void;
      update(view: never, prompt: string): void;
      dispose(): void;
    };

    const sides: ('left' | 'right' | null)[] = seats === 1
      ? [null]
      : seats === 2
        ? ['left', 'right']
        : ['left', 'right', 'left', 'right'];
    const rows: ('top' | 'bottom' | null)[] = seats <= 2
      ? sides.map(() => null)
      : ['top', 'top', 'bottom', 'bottom'];

    const rect = (element: Element): Box => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };

    const made: { hud: { dispose(): void }; container: HTMLElement }[] = [];
    const readings: unknown[] = [];
    for (let seat = 0; seat < seats; seat += 1) {
      const container = document.createElement('div');
      container.className = 'euc-hud-seat';
      container.dataset.probe = 'm38';
      document.body.appendChild(container);
      const hud = new Hud({ parent: container, announcesCountdown: seat === 0 });
      hud.setVisible(true);
      hud.setTouchLayout(touch === true);
      hud.setSplit(sides[seat], rows[seat]);
      const view = new HudModel().update(0, input as never);
      hud.update(view, '');
      made.push({ hud, container });

      const root = container.querySelector('.euc-hud') as HTMLElement;
      const lane = root.querySelector('.euc-hud__score') as HTMLElement;
      const named: Record<string, unknown> = {};
      const hidden: string[] = [];
      const parts: Record<string, string> = {
        label: '.euc-hud__score-label',
        score: '.euc-hud__score-value',
        clockLabel: '.euc-hud__score-aside-label',
        clock: '.euc-hud__score-aside-value',
        best: '.euc-hud__trick-best',
        pending: '.euc-hud__trick-pending',
        awardLabel: '.euc-hud__trick-award-label',
        awardPoints: '.euc-hud__trick-award-points',
      };
      for (const [name, selector] of Object.entries(parts)) {
        const node = root.querySelector(selector) as HTMLElement | null;
        if (node === null || node.offsetParent === null && node.getClientRects().length === 0) {
          hidden.push(name);
          continue;
        }
        named[name] = {
          box: rect(node),
          // One pixel of slack: a sub-pixel text metric rounds either way and
          // an assertion balanced on it is testing the rasteriser.
          clipped: node.scrollWidth > node.clientWidth + 1,
          text: node.textContent ?? '',
        };
      }
      readings.push({ pane: rect(container), lane: rect(lane), rows: named, hidden });
    }

    for (const { hud, container } of made) {
      hud.dispose();
      container.remove();
    }
    return readings as never;
  }, options);
}

/**
 * A trick run at its widest: two minutes, five figures, a three-kind flight —
 * and, since q189, that flight launched off every feature, which is the
 * longest award line this lane can be asked to draw.
 */
const WIDEST = {
  speed: 0,
  powerStage: 'normal',
  overspeed: 0,
  tiltBack: 0,
  offCourse: false,
  crashed: false,
  trickRun: {
    phase: 'running',
    remainingSeconds: 120,
    score: 12345,
    best: 12345,
    pendingPoints: 1000,
    lastAward: {
      kinds: ['charged-hop', 'spin-landed', 'one-foot-air'],
      landing: 'clean',
      points: 1000,
      offFeature: true,
    },
    cueSecondsLeft: 2.5,
  },
} as const;

/** §38.6's own widest example — two kinds and a four-figure award. */
const BRIEFED = {
  ...WIDEST,
  trickRun: {
    ...WIDEST.trickRun,
    lastAward: {
      kinds: ['spin-landed', 'one-foot-air'],
      landing: 'clean',
      points: 1000,
      offFeature: false,
    },
  },
} as const;

/** A pane's own protected middle fifth, in page coordinates. */
function middleFifth(pane: Box): Box {
  return {
    x: pane.x + pane.width * 0.4,
    y: pane.y + pane.height * 0.4,
    width: pane.width * 0.2,
    height: pane.height * 0.2,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Every claim this file makes about one reading, in one place.
 *
 * The reserved-lane rule is a conjunction of both axes (`tests/m9.spec.ts`),
 * so this asserts exactly that conjunction and never the horizontal half on
 * its own: a lane may pass over the middle fifth's columns high above the
 * rider, and the corner has done so since M9.
 */
function assertFits(pane: PaneMetrics, viewport: { width: number; height: number }, where: string) {
  const lane = pane.lane;
  expect(lane.width, `${where}: the lane is drawn`).toBeGreaterThan(0);
  // Inside the viewport, with a pixel of slack for sub-pixel layout.
  expect(lane.x, `${where}: no overflow left`).toBeGreaterThanOrEqual(-1);
  expect(lane.y, `${where}: no overflow top`).toBeGreaterThanOrEqual(-1);
  expect(lane.x + lane.width, `${where}: no overflow right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(lane.y + lane.height, `${where}: no overflow bottom`)
    .toBeLessThanOrEqual(viewport.height + 1);
  // Inside its own pane, which is the claim a split adds.
  expect(lane.x, `${where}: inside the pane`).toBeGreaterThanOrEqual(pane.pane.x - 1);
  expect(lane.x + lane.width, `${where}: inside the pane`)
    .toBeLessThanOrEqual(pane.pane.x + pane.pane.width + 1);
  expect(overlaps(lane, middleFifth(pane.pane)), `${where}: clear of the middle fifth`)
    .toBe(false);
  for (const [name, row] of Object.entries(pane.rows)) {
    expect(row.clipped, `${where}: ${name} is not clipped (${row.text})`).toBe(false);
  }
}

/** The pane matrix §38.6 names, plus the two the brief adds. */
const VIEWPORTS = [
  { name: 'phone portrait 360x800', width: 360, height: 800, seats: 1, touch: true },
  { name: 'phone portrait 375x667', width: 375, height: 667, seats: 1, touch: true },
  { name: 'short phone landscape 667x375', width: 667, height: 375, seats: 1, touch: true },
  { name: 'short window 1000x520', width: 1000, height: 520, seats: 1, touch: false },
  { name: 'desktop 1000x700', width: 1000, height: 700, seats: 1, touch: false },
  { name: 'couch 2-up 1000x700', width: 1000, height: 700, seats: 2, touch: false },
  { name: 'couch 2x2 1000x700', width: 1000, height: 700, seats: 4, touch: false },
] as const;

for (const pane of VIEWPORTS) {
  test(`the trick run lane fits ${pane.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: pane.width, height: pane.height });
    await openStyled(page);

    for (const [label, input] of [['briefed', BRIEFED], ['widest', WIDEST]] as const) {
      const readings = await measure(page, {
        seats: pane.seats,
        touch: pane.touch,
        input: input as unknown as Record<string, unknown>,
      });
      expect(readings).toHaveLength(pane.seats);
      readings.forEach((reading, seat) => {
        assertFits(reading, pane, `${pane.name} / ${label} / seat ${seat}`);
      });
      // The measurement itself is the deliverable §38.8 Phase 0 asks for, so it
      // is recorded rather than merely asserted away.
      testInfo.annotations.push({
        type: `m38-hud ${pane.name} ${label}`,
        description: JSON.stringify(readings.map((reading) => ({
          lane: reading.lane,
          hidden: reading.hidden,
          rows: Object.fromEntries(
            Object.entries(reading.rows).map(([name, row]) => [name, {
              text: row.text,
              width: Math.round(row.box.width * 10) / 10,
              clipped: row.clipped,
            }]),
          ),
        }))),
      });
      console.log(`[m38-hud] ${pane.name} / ${label} ${JSON.stringify(readings.map((r) => ({
        lane: { x: Math.round(r.lane.x), y: Math.round(r.lane.y), w: Math.round(r.lane.width), h: Math.round(r.lane.height) },
        pane: { x: Math.round(r.pane.x), w: Math.round(r.pane.width), h: Math.round(r.pane.height) },
        rows: Object.fromEntries(Object.entries(r.rows).map(([n, row]) => [n, `${row.text}|${Math.round(row.box.width)}${row.clipped ? '|CLIP' : ''}`])),
        hidden: r.hidden,
      })))}`);
    }
  });
}

test('the best row is a solo row, and a split pane does not draw four of them', async ({ page }) => {
  // A saved best belongs to one rider at one venue, so four panes each naming a
  // different one would be four scoreboards in one frame. The composition root
  // hands a couch seat `best: null`; this asserts the stylesheet holds the rule
  // even when it is handed a number, which is what makes the row's absence a
  // property of the layout rather than of a caller remembering.
  await page.setViewportSize({ width: 1000, height: 700 });
  await openStyled(page);

  const solo = await measure(page, { seats: 1, input: WIDEST as unknown as Record<string, unknown> });
  expect(solo[0].hidden).not.toContain('best');
  expect(solo[0].rows.best.text).toBe('Best 12,345');

  const couch = await measure(page, { seats: 4, input: WIDEST as unknown as Record<string, unknown> });
  for (const seat of couch) expect(seat.hidden).toContain('best');
});

test('the trick run lane speaks to nobody, and leaves the room its one voice', async ({ page }) => {
  // §38.6: new score text must not create a live region that reads four
  // changing HUDs aloud. The lane inherits the mode lane's silence — the
  // Knockabout figure, the chase clock and M37's tally are all mute — so the
  // only live regions in a trick run frame are the ones a couch already had.
  await page.setViewportSize({ width: 1000, height: 700 });
  await openStyled(page);

  const live = await page.evaluate(async () => {
    // **The specifier is a variable, and that is not a style choice.** A
    // literal would be resolved by the type checker against this file's own
    // module graph — where `/src/...` is an absolute filesystem path and not a
    // module — and by Vite at build time. Here it is neither: it is a URL the
    // *page* fetches from the dev server that is already serving these modules
    // to the game itself.
    const load = (path: string): Promise<Record<string, never>> => import(path);
    const [model, dom] = await Promise.all([
      load('/src/ui/hudModel.ts'),
      load('/src/ui/hud.ts'),
    ]);
    const HudModel = model.HudModel as unknown as new () => { update(t: number, i: never): never };
    const Hud = dom.Hud as unknown as new (options: {
      parent: HTMLElement;
      announcesCountdown?: boolean;
    }) => {
      setVisible(visible: boolean): void;
      setTouchLayout(active: boolean): void;
      setSplit(side: 'left' | 'right' | null, row?: 'top' | 'bottom' | null): void;
      update(view: never, prompt: string): void;
      dispose(): void;
    };
    const container = document.createElement('div');
    container.className = 'euc-hud-seat';
    document.body.appendChild(container);
    const hud = new Hud({ parent: container });
    hud.setVisible(true);
    const view = new HudModel().update(0, {
      speed: 0,
      powerStage: 'normal',
      overspeed: 0,
      tiltBack: 0,
      offCourse: false,
      crashed: false,
      trickRun: {
        phase: 'running',
        remainingSeconds: 90,
        score: 10,
        best: null,
        pendingPoints: 0,
        lastAward: { kinds: ['spin-landed'], landing: 'clean', points: 200 },
        cueSecondsLeft: 2.5,
      },
    } as never);
    hud.update(view, '');
    const root = container.querySelector('.euc-hud') as HTMLElement;
    const inside = [...root.querySelectorAll('.euc-hud__score [aria-live], .euc-hud__score [role]')]
      .map((node) => node.className);
    const all = [...root.querySelectorAll('[aria-live]')].map((node) => node.className);
    hud.dispose();
    container.remove();
    return { inside, all };
  });

  expect(live.inside, 'nothing in the mode lane announces').toEqual([]);
  // The countdown and the match status, and nothing this milestone added.
  expect(live.all.sort()).toEqual([
    'euc-hud__count',
    'euc-hud__match-status',
    'euc-hud__stray',
    'euc-hud__warning',
  ].sort());
});

test('the shipped mode paints this lane, with its own words in it', async ({ page }) => {
  // **The one fixture here that rides rather than probes.** Everything above
  // measures `game.css` against text typed in at the referee's widest; this
  // asserts the lane a player actually meets is that lane — entered through
  // `Game.startTrickRun`, which runs the same guards as the buttons, and read
  // off the HUD the game itself mounted.
  await page.setViewportSize({ width: 1000, height: 700 });
  await bootToTitle(page);
  await page.evaluate(() => window.game.startTrickRun());

  const lane = page.locator('.euc-hud__score');
  await expect(lane.locator('[data-hud="score-label"]')).toHaveText('Trick run');
  // Banked, and a run that has landed nothing has banked nothing.
  await expect(lane.locator('[data-hud="score-value"]')).toHaveText('0');
  // The clock is a deadline in `M:SS`, counting down from the run's own length.
  await expect(lane.locator('[data-hud="score-aside-label"]')).toHaveText('Time');
  await expect(lane.locator('[data-hud="score-aside-value"]')).toHaveText(/^\d:\d\d$/);
  // Solo, with nothing stored for this venue yet — the sentence rather than a
  // blank row, and the row exists at all because this is not a split.
  await expect(lane.locator('[data-hud="trick-best"]')).toHaveText(/^(No best yet|Best [\d,]+)$/);
  // Nothing is in the air and nothing has landed, so neither row is drawn.
  await expect(lane.locator('[data-hud="trick-pending"]')).toBeHidden();
  await expect(lane.locator('[data-hud="trick-award"]')).toBeHidden();

  const box = await lane.boundingBox();
  expect(box).not.toBeNull();
  const drawn = box as NonNullable<typeof box>;
  expect(drawn.x).toBeGreaterThanOrEqual(-1);
  expect(drawn.x + drawn.width).toBeLessThanOrEqual(1001);
  expect(
    overlaps(drawn, middleFifth({ x: 0, y: 0, width: 1000, height: 700 })),
    'the lane a player meets is clear of the protected middle fifth',
  ).toBe(false);

  // And the run lane does not share the cell with it: the park is lap-capable,
  // which is exactly where two producers in one grid area would stack.
  await expect(page.locator('.euc-hud__challenge')).toBeHidden();
});
