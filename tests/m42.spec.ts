/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
// M42 — city launch pads and the lively throw-ins (docs/PLANS.md §42).
// One block per builder; edit only your own block, between its markers.
//
// Pre-staged by the M42 coordinator. The shared imports and boot helpers below
// belong to the coordinator: call them, never edit them. A block that needs
// another import puts it inside its own markers, above its `test.describe`
// (import declarations are hoisted, so one is valid anywhere at the top
// level); never import a name the shared imports already bind.
import { expect, test, type Page } from '@playwright/test';
import { boot, bootAtTier, bootToTitle, collectErrors, type BootAtTierOptions } from './harness.ts';

// ── M42 shared boot helpers (coordinator) ──
// Exported only so `noUnusedLocals` holds while the four blocks are empty;
// nothing imports a spec file.

/** The default town: pads are armed in its free ride. */
export const M42_TOWN = 'level=generated&seed=euc';

/** Arm the console-error collector, then boot `query` into free ride (harness `boot`). */
export async function bootM42(page: Page, query: string = M42_TOWN): Promise<string[]> {
  const errors = collectErrors(page);
  await boot(page, query);
  return errors;
}

/** Arm the collector, then boot `query` to the title card (Settings, the couch panel, mode entrances). */
export async function bootM42ToTitle(page: Page, query: string = M42_TOWN): Promise<string[]> {
  const errors = collectErrors(page);
  await bootToTitle(page, query);
  return errors;
}

/** Arm the collector, then boot at a saved quality tier (harness `bootAtTier`; free ride unless `ride: false`). */
export async function bootM42AtTier(
  page: Page,
  tier: Parameters<typeof bootAtTier>[2],
  query: string = M42_TOWN,
  settings: BootAtTierOptions = {},
): Promise<string[]> {
  const errors = collectErrors(page);
  await bootAtTier(page, query, tier, settings);
  return errors;
}

/** Every M42 test ends here: no page error and no console error since boot. */
export function expectNoM42Errors(errors: readonly string[]): void {
  expect(errors).toEqual([]);
}
// ── end M42 shared boot helpers ──

// ── M42 A — pads ──
import { generateLevel as m42aGenerateLevel } from '../src/level/generateRoute.ts';
import { preparePopulationWorld as m42aPrepare } from '../src/app/populationWorld.ts';
import { cityLaunchPads as m42aCityLaunchPads } from '../src/level/launchPadSites.ts';

test.describe('M42 A — pads', () => {
  /** The finder corpus (`src/bench/launchPadSites.test.ts`), as boot queries. */
  const M42A_CORPUS: readonly { label: string; query: string; seed: string; mph?: number }[] = [
    ...['euc', 'route-41', 'sweep-39', 'sweep-15', 'euc-7', 'harbour-spark-42',
      'jetty-orchard-74', 'copper-gate-55', 'x67', 'lantern-span-7']
      .map((seed) => ({ label: seed, query: `level=generated&seed=${seed}`, seed })),
    { label: 'euc@50mph', query: 'level=generated&seed=euc&mph=50', seed: 'euc', mph: 50 },
  ];

  /** The Node finder's list for the same prepared world, and its population digest. */
  function m42aNodeSites(seed: string, mph?: number): { sites: { id: string; x: number; z: number }[]; digest: string } {
    const world = m42aPrepare(m42aGenerateLevel(seed, undefined, undefined, mph).plan);
    return {
      sites: m42aCityLaunchPads(world.level, world.population).map(({ id, x, z }) => ({ id, x, z })),
      digest: world.population.contentDigest,
    };
  }

  async function m42aState(page: Page) {
    return page.evaluate(() => window.game.launchPadState());
  }

  for (const { label, query, seed, mph } of M42A_CORPUS) {
    test(`free ride on ${label}: the bridge's pads equal Node's, shown and armed, drawn ids match`, async ({ page }) => {
      test.setTimeout(180_000);
      const expected = m42aNodeSites(seed, mph);
      const errors = await bootM42(page, query);
      const state = await m42aState(page);
      const browserDigest = await page.evaluate(() => window.game.populationState().digest);
      expect(state.sites, `engine parity on ${label}: Node ${JSON.stringify(expected.sites)} `
        + `(population ${expected.digest}) vs browser ${JSON.stringify(state.sites)} (population ${browserDigest})`)
        .toEqual(expected.sites);
      expect(state.sites.length).toBeGreaterThanOrEqual(4);
      expect(state.visible).toBe(true);
      expect(state.armed.length).toBeGreaterThan(0);
      expect(state.armed.every(Boolean)).toBe(true);
      const drawn = await page.evaluate(() => window.game.renderer.presentation()?.launchPads.ids ?? null);
      expect(drawn).toEqual(state.sites.map((site) => site.id));
      expectNoM42Errors(errors);
    });
  }

  test('euc: drawn ids equal armed ids after boot and after a world swap; one finder run per world', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await bootM42ToTitle(page);
    const boot = await m42aState(page);
    expect(await page.evaluate(() => window.game.renderer.presentation()?.launchPads.ids))
      .toEqual(boot.sites.map((site) => site.id));
    // The title shows the pads and arms none.
    expect(boot.visible).toBe(true);
    expect(boot.armed.every((armed) => !armed)).toBe(true);
    // A world swap through the real route panel: one more computation, a new list, drawn as armed.
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await page.locator('#euc-seed').fill('route-41');
    await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().route.pending), { timeout: 120_000 })
      .toBe(false);
    const swapped = await m42aState(page);
    expect(swapped.finderRuns).toBe(boot.finderRuns + 1);
    expect(swapped.sites).toEqual(m42aNodeSites('route-41').sites);
    expect(swapped.sites).not.toEqual(boot.sites);
    expect(await page.evaluate(() => window.game.renderer.presentation()?.launchPads.ids))
      .toEqual(swapped.sites.map((site) => site.id));
    expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');
    expect(swapped.visible).toBe(true);
    expect(swapped.armed.every(Boolean)).toBe(true);
    expectNoM42Errors(errors);
  });

  test('a rider placed 15 m out on three headings rides over the pad: airborne, a non-crash landing, launches rise', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await bootM42(page);
    const result = await page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      const pad = game.launchPadState().sites[0];
      const rows: { heading: number; launched: boolean; airborne: boolean; landed: boolean; crashed: boolean;
        launchesBefore: number; launchesAfter: number }[] = [];
      for (const heading of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
        const x = pad.x - Math.sin(heading) * 15, z = pad.z - Math.cos(heading) * 15;
        game.setActions({ throttle: 0, steer: 0 });
        game.placeRider({ x, y: game.sampleGround(x, z).height, z }, heading, 0, 8);
        const launchesBefore = game.launchPadState().launches;
        let airborne = false, landed = false, crashed = false;
        for (let step = 0; step < 900 && !landed; step += 1) {
          game.setActions({ throttle: airborne ? 0 : 1, steer: 0 });
          game.advance(1);
          const euc = game.snapshot().euc;
          if (!euc.grounded) airborne = true;
          if (airborne && euc.grounded) landed = true;
          crashed ||= euc.crashed;
        }
        game.setActions({ throttle: 0, steer: 0 });
        rows.push({ heading, launched: game.launchPadState().launches > launchesBefore, airborne, landed, crashed,
          launchesBefore, launchesAfter: game.launchPadState().launches });
      }
      return rows;
    });
    for (const row of result) {
      expect(row, JSON.stringify(row)).toMatchObject({ launched: true, airborne: true, landed: true, crashed: false });
      expect(row.launchesAfter).toBe(row.launchesBefore + 1);
    }
    expectNoM42Errors(errors);
  });

  test('chase, Knockabout and Challenge hide and disarm the pads; the menus resolve as the mode table says', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await bootM42(page);
    const freeRide = await m42aState(page);
    expect(freeRide).toMatchObject({ visible: true });
    expect(freeRide.armed.every(Boolean)).toBe(true);
    const via = async (...states: string[]) => page.evaluate((list) => {
      for (const state of list) window.game.setAppState(state as Parameters<typeof window.game.setAppState>[0]);
    }, states);

    // Chase (entered from the title, as the menu does): hidden, disarmed, and
    // every pursuer holds the empty field.
    await via('title');
    await page.evaluate(() => window.game.startChase());
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('chase');
    const chase = await m42aState(page);
    expect(chase.visible).toBe(false);
    expect(chase.armed.every((armed) => !armed)).toBe(true);
    expect(chase.pursuerPads.length).toBeGreaterThan(0);
    expect(chase.pursuerPads.every((count) => count === 0)).toBe(true);

    // Title → settings after the chase (a stale rideReturn): shown, disarmed.
    await via('title', 'settings');
    const settings = await m42aState(page);
    expect(settings.visible).toBe(true);
    expect(settings.armed.every((armed) => !armed)).toBe(true);

    // Back to free ride: shown and armed again.
    await via('title', 'freeRide');
    const back = await m42aState(page);
    expect(back.visible).toBe(true);
    expect(back.armed.every(Boolean)).toBe(true);

    // Knockabout, then pause → settings inside it: hidden and disarmed throughout.
    await via('title');
    await page.evaluate(() => window.game.startKnockabout());
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('knockabout');
    for (const states of [[], ['paused'], ['settings']]) {
      await via(...states);
      const knockabout = await m42aState(page);
      expect(knockabout.visible, `knockabout ${states.join('→')}`).toBe(false);
      expect(knockabout.armed.every((armed) => !armed)).toBe(true);
    }

    // Challenge: hidden and disarmed.
    await via('title');
    await page.evaluate(() => window.game.startTimeTrial());
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('challenge');
    const challenge = await m42aState(page);
    expect(challenge.visible).toBe(false);
    expect(challenge.armed.every((armed) => !armed)).toBe(true);
    expectNoM42Errors(errors);
  });

  test('free ride → pause → Settings: shown, disarmed, and a rider coasting at a pad behind the card is never thrown', async ({ page }) => {
    // QA A r2 minor 1: Settings simulates with no ride input. The same coast
    // in free ride (the control, last) is thrown, so the card case is not vacuous.
    test.setTimeout(240_000);
    const errors = await bootM42(page);
    const result = await page.evaluate(() => {
      const game = window.game;
      const pad = game.launchPadState().sites[0];
      const heading = 0.3;
      const x = pad.x - Math.sin(heading) * 35, z = pad.z - Math.cos(heading) * 35;
      /** Coast 6 s with no input from 35 m out at 20 m/s, aimed at the centre. */
      const coast = () => {
        game.loop.setRunning(false);
        const launchesBefore = game.launchPadState().launches;
        let nearest = Infinity, airborne = false;
        for (let step = 0; step < 720; step += 1) {
          game.advance(1);
          const euc = game.snapshot().euc;
          nearest = Math.min(nearest, Math.hypot(euc.position.x - pad.x, euc.position.z - pad.z));
          airborne ||= !euc.grounded;
        }
        return { launches: game.launchPadState().launches - launchesBefore, nearest, airborne };
      };
      game.loop.setRunning(false);
      game.setActions({ throttle: 0, steer: 0 });
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, heading, 0, 20);
      game.setAppState('paused');
      const paused = game.launchPadState();
      game.setAppState('settings');
      const settings = game.launchPadState();
      const state = game.snapshot().app.state;
      const behindTheCard = coast();
      game.setAppState('paused');
      game.setAppState('freeRide');
      const resumed = game.launchPadState();
      game.setActions({ throttle: 0, steer: 0 });
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, heading, 0, 20);
      const control = coast();
      return { paused, settings, state, behindTheCard, resumed, control };
    });
    expect(result.state).toBe('settings');
    for (const menu of [result.paused, result.settings]) {
      expect(menu.visible).toBe(true);
      expect(menu.armed.every((armed) => !armed)).toBe(true);
    }
    expect(result.behindTheCard.nearest, 'the coast crossed the trigger').toBeLessThan(1.4);
    expect(result.behindTheCard, JSON.stringify(result.behindTheCard)).toMatchObject({ launches: 0, airborne: false });
    expect(result.resumed.visible).toBe(true);
    expect(result.resumed.armed.every(Boolean)).toBe(true);
    expect(result.control, JSON.stringify(result.control)).toMatchObject({ launches: 1, airborne: true });
    expectNoM42Errors(errors);
  });

  test('resources plateau across free ride → Knockabout → free ride', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await bootM42(page);
    const round = async () => page.evaluate(async () => {
      const game = window.game;
      game.setAppState('title');
      game.startKnockabout();
      game.advance(30);
      game.setAppState('title');
      game.setAppState('freeRide');
      game.advance(30);
      return game.resources();
    });
    const first = await round();
    const second = await round();
    const third = await round();
    expect(third).toEqual(second);
    expect(second.geometries).toBeLessThanOrEqual(first.geometries);
    expectNoM42Errors(errors);
  });

  test('R16: in free ride the seat stands on every pad\'s dome, never in it; in Chase (hidden) on the lawn', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = await bootM42(page);
    /** Seat 0 set down at rest on each pad's centre: its height over the lawn there. */
    const heights = async () => page.evaluate(() => {
      const game = window.game;
      game.loop.setRunning(false);
      game.setActions({ throttle: 0, steer: 0 });
      return game.launchPadState().sites.map((pad) => {
        const lawn = game.sampleGround(pad.x, pad.z).height;
        game.placeRider({ x: pad.x, y: lawn, z: pad.z }, 0.4, 0, 0);
        game.advance(2);
        return game.snapshot().euc.position.y - lawn;
      });
    });
    const freeRide = await heights();
    expect(freeRide.length).toBeGreaterThanOrEqual(4);
    // The kicker's crown over the lawn: LAUNCH_PAD.domeHeightMetres + domeCrownMetres (0.75 + 0.04; critic r4).
    for (const rise of freeRide) expect(rise).toBeCloseTo(0.79, 3);
    await page.evaluate(() => { window.game.setAppState('title'); window.game.startChase(); });
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('chase');
    const chase = await heights();
    for (const rise of chase) expect(Math.abs(rise)).toBeLessThan(1e-6);
    expectNoM42Errors(errors);
  });
});
// ── end M42 A ──
// ── M42 B — world render ──
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SIMULATION } from '../src/data/tuning.ts';

/** Capture folder for the bird frames (invariant 23: an environment variable, a repo-relative default). */
const M42_B_SHOTS = process.env.M42_SHOTS ?? 'test-results/m42';

/**
 * Step the frozen game until the flock's world clock reaches `seconds`, in
 * bounded chunks (each `advance` draws once, which is what moves that clock).
 */
async function advanceBirdClockTo(page: Page, seconds: number): Promise<void> {
  for (let chunk = 0; chunk < 400; chunk += 1) {
    const left = await page.evaluate(({ target, hz }) => {
      const game = window.game;
      const clock = game.renderer.presentation()!.birds.clockSeconds;
      const steps = Math.min(2400, Math.ceil((target - clock) * hz));
      if (steps > 0) game.advance(steps);
      return target - game.renderer.presentation()!.birds.clockSeconds;
    }, { target: seconds, hz: SIMULATION.hz });
    if (left <= 0) return;
  }
  throw new Error(`the bird clock never reached ${seconds} s`);
}

test.describe('M42 B — world render', () => {
  for (const [world, query] of [['town', M42_TOWN], ['BelVar', 'level=track']] as const) {
    for (const panes of [1, 2] as const) {
      test(`${world}, ${panes} pane(s): mid-pass the flock is drawn, and the frame stays inside its price`, async ({ page }) => {
        // A pass starts 3 s after the world's first frame (owner round 2) and
        // flies fast while fogged out, so its middle comes well inside the
        // simulation this advances in chunks.
        test.setTimeout(900_000);
        const errors = await bootM42(page, query);
        const start = await page.evaluate((views) => {
          const game = window.game;
          game.loop.setRunning(false);
          if (views === 2) {
            game.spawnSecondRider();
            const pose = game.snapshot().euc;
            game.placeRider(pose.position, pose.headingY, 1);
          }
          game.advance(1);
          const presentation = game.renderer.presentation()!;
          return { birds: presentation.birds, pads: presentation.launchPads, views: game.renderer.viewCount };
        }, panes);
        expect(start.views).toBe(panes);
        expect(start.birds.eligible).toBe(true);
        expect(start.birds.flocks).toBe(1);
        expect(start.birds.drawCalls).toBe(1);
        expect(start.birds.colourTriangles, 'R17: nine birds, one draw').toBe(72);
        expect(start.birds.nextPass).not.toBeNull();
        expect(start.pads.pads).toBe(start.pads.ids.length);
        expect(start.pads.drawCalls).toBe(start.pads.pads > 0 ? 1 : 0);
        // A pass is laid when it starts, across a view's heading (R13), so its
        // window is provisional until then: step just past the start, read the
        // laid window, then go to its middle. (Just after the start the flock is
        // still ≥ 540 m out, beyond every far plane: a bound checked there would
        // prove nothing about the birds.)
        const provisional = start.birds.nextPass!;
        await advanceBirdClockTo(page, provisional.startSeconds + 1);
        const laid = await page.evaluate(() => window.game.renderer.presentation()!.birds);
        expect(laid.active, 'the first pass has started').toBe(true);
        expect(laid.passIndex).toBe(0);
        expect(laid.aimedView, 'pass 0 is aimed across view 0').toBe(0);
        const pass = laid.nextPass!;
        expect(pass.startSeconds).toBe(provisional.startSeconds);
        await advanceBirdClockTo(page, (pass.startSeconds + pass.endSeconds) / 2);
        // Stand the rider(s) behind the flock's ground track, facing along it,
        // far enough back that it sits ~14° up: inside the frustum.
        const seen = await page.evaluate(({ views, elevation }) => {
          const game = window.game;
          const birds = game.renderer.presentation()!.birds;
          if (!birds.active || birds.centre === null) return null;
          const { x, y, z } = birds.centre;
          const back = Math.max(150, (y - game.sampleGround(x, z).height) / Math.tan(elevation));
          const rx = x - Math.sin(birds.headingY) * back, rz = z - Math.cos(birds.headingY) * back;
          for (let seat = 0; seat < views; seat += 1) {
            game.placeRider({ x: rx, y: game.sampleGround(rx, rz).height, z: rz }, birds.headingY, seat);
          }
          game.advance(1);
          const presentation = game.renderer.presentation()!;
          return { drawn: presentation.birds.drawn, active: presentation.birds.active, back,
            render: game.snapshot().render,
            predicted: views === 1 ? presentation.cost.frame.solo : presentation.cost.frame.split };
        }, { views: panes, elevation: 0.25 });
        expect(seen, 'the flock is flying mid-pass').not.toBeNull();
        expect(seen!.active).toBe(true);
        expect(seen!.drawn, 'a pane submitted the flock').toBe(true);
        // A browser figure above the price would mean the frame draws something nobody priced.
        expect(seen!.render.drawCalls).toBeLessThanOrEqual(seen!.predicted.drawCalls);
        expect(seen!.render.triangles).toBeLessThanOrEqual(seen!.predicted.triangles);
        mkdirSync(M42_B_SHOTS, { recursive: true });
        await page.screenshot({ path: join(M42_B_SHOTS, `birds-${world}-${panes}.png`) });
        if (panes === 2) await page.evaluate(() => window.game.despawnSecondRider());
        expectNoM42Errors(errors);
      });
    }
  }

  test('town: hidden pads on a never-drawn world upload under the warm pass (and only under it), even when warms overlap', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = await bootM42(page);
    const result = await page.evaluate(async () => {
      const game = window.game, renderer = game.renderer;
      // The booted living world's own plan, presentation and roster (the m36
      // rebuild pattern): each rebuild builds a fresh pad mesh nobody has drawn.
      const living = game as unknown as {
        presentationOverride: Parameters<typeof renderer.setLevel>[1];
        populationPlan: Parameters<typeof renderer.setPopulation>[0];
      };
      const rebuild = (): void => {
        renderer.setLevel(game.levelPlan, living.presentationOverride, living.populationPlan);
        renderer.setPopulation(living.populationPlan);
      };
      game.loop.setRunning(false);
      game.advance(1);
      const before = renderer.presentation()!.launchPads;
      // A mode that hides the pads, then a world swap: warmed under its cover
      // (`warm`) or, the negative control, not.
      const round = async (warm: boolean) => {
        renderer.setLaunchPadsVisible(false);
        rebuild();
        const hidden = renderer.presentation()!.launchPads.visible;
        if (warm) await renderer.warmPrograms();
        const afterWarm = renderer.presentation()!.launchPads.visible;
        game.advance(1);
        const resources = game.resources();
        // Free ride shows them: nothing may link or upload now (a plateau failure).
        renderer.setLaunchPadsVisible(true);
        game.advance(1);
        return { hidden, afterWarm, resources, shown: game.resources(),
          shownVisible: renderer.presentation()!.launchPads.visible };
      };
      const control = await round(false);
      const warmed = await round(true);

      // Overlapping warms (QA-B r1 m2): a world swapped in during one warm's
      // wait is warmed by a second; the first one's `finally` must not hide
      // the new pads before the second one's zero-area draw submits them.
      const padMesh = () => renderer.scene.getObjectByName('launch-pad-instances')!;
      let submitted = 0;
      const count = (): void => { submitted = 0; padMesh().onBeforeRender = () => { submitted += 1; }; };
      renderer.setLaunchPadsVisible(false);
      // The instrument's own negative control: pads hidden behind a warm's back
      // after its compile are not submitted by its draw, and the count says so.
      rebuild();
      count();
      const bypassed = renderer.warmPrograms();
      renderer.scene.getObjectByName('launch-pads')!.visible = false;
      await bypassed;
      const controlSubmitted = submitted;
      rebuild();
      const first = renderer.warmPrograms();
      rebuild();
      count();
      const second = renderer.warmPrograms();
      const [firstReport, secondReport] = await Promise.all([first, second]);
      const overlap = { firstDrawn: firstReport.drawn, secondDrawn: secondReport.drawn, submitted,
        afterBoth: renderer.presentation()!.launchPads.visible };

      renderer.setLaunchPadsVisible(before.visible);
      await renderer.warmPrograms();
      game.advance(1);
      return { before, control, warmed, controlSubmitted, overlap, restored: renderer.presentation()!.launchPads.visible };
    });
    expect(result.before.pads).toBeGreaterThan(0);
    expect(result.before.pads).toBe(result.before.ids.length);
    expect(result.before.drawCalls).toBe(1);
    for (const round of [result.control, result.warmed]) {
      expect(round.hidden).toBe(false);
      expect(round.afterWarm, 'the mode\'s flag holds after the swap (and the warm restores it)').toBe(false);
      expect(round.shownVisible).toBe(true);
    }
    // The negative control: without the warm, showing the pads uploads their buffers mid-session.
    expect(result.control.shown.geometries, 'unwarmed, the hidden pads upload when shown').toBeGreaterThan(result.control.resources.geometries);
    expect(result.warmed.shown.programs, 'the warm linked the hidden pads\' program').toBe(result.warmed.resources.programs);
    expect(result.warmed.shown.geometries, 'and uploaded their buffers').toBe(result.warmed.resources.geometries);
    expect(result.controlSubmitted, 'the draw counter sees pads hidden at draw time').toBe(0);
    expect(result.overlap.firstDrawn, 'the first warm saw its world swapped and skipped its draw').toBe(false);
    expect(result.overlap.secondDrawn).toBe(true);
    expect(result.overlap.submitted, 'the second warm\'s draw submitted the new pads').toBeGreaterThan(0);
    expect(result.overlap.afterBoth, 'the last warm out restored the flag').toBe(false);
    expect(result.restored).toBe(result.before.visible);
    expectNoM42Errors(errors);
  });

  test('town: the hovering marker (R14) is in the pads\' one draw, turns slowly while shown, and holds still while hidden', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = await bootM42(page);
    const result = await page.evaluate(({ hz }) => {
      const game = window.game, renderer = game.renderer;
      game.loop.setRunning(false);
      renderer.setLaunchPadsVisible(true);
      game.advance(1);
      const mesh = renderer.scene.getObjectByName('launch-pad-instances') as unknown as
        { geometry: { getAttribute(name: string): { array: Float32Array; version: number } } };
      const position = mesh.geometry.getAttribute('position');
      // The template's last vertex: a corner of the shaft's cap, turning about the pad's upright.
      const corner = () => { const a = position.array, n = a.length; return { x: a[n - 3], y: a[n - 2], z: a[n - 1], version: position.version }; };
      const pads = renderer.presentation()!.launchPads;
      const steps = Math.round(hz * 1.5);
      const shownBefore = corner();
      game.advance(steps);
      const shownAfter = corner();
      renderer.setLaunchPadsVisible(false);
      game.advance(1);
      const hiddenBefore = corner();
      game.advance(steps);
      const hiddenAfter = corner();
      renderer.setLaunchPadsVisible(true);
      game.advance(1);
      return { pads, steps, shownBefore, shownAfter, hiddenBefore, hiddenAfter };
    }, { hz: SIMULATION.hz });
    expect(result.pads.pads).toBeGreaterThan(0);
    expect(result.pads.drawCalls, 'the marker is in the pads\' one draw').toBe(1);
    // Critic r4: the kicker (104 triangles: top, coping, concave skirt, hazard stripes) and its marker (16).
    expect(result.pads.colourTriangles / result.pads.pads, 'the pad and its marker').toBe(120);
    const angle = (p: { x: number; z: number }) => Math.atan2(p.x, p.z);
    const turned = angle(result.shownAfter) - angle(result.shownBefore);
    const wrapped = Math.atan2(Math.sin(turned), Math.cos(turned));
    // One slow turn per `markerTurnSeconds` (12 s): 1.5 s of simulation is an eighth of a turn.
    expect(result.shownAfter.version).toBeGreaterThan(result.shownBefore.version);
    expect(Math.abs(wrapped - (2 * Math.PI * result.steps) / SIMULATION.hz / 12)).toBeLessThan(1e-3);
    expect(result.shownAfter.y, 'it turns about its upright, never bobbing into a rider').toBe(result.shownBefore.y);
    expect(result.hiddenAfter, 'hidden: no turn, no upload').toEqual(result.hiddenBefore);
    expectNoM42Errors(errors);
  });
});
// ── end M42 B ──
// ── M42 C — pedestrians ──
test.describe('M42 C — pedestrians', () => {
  /**
   * Freeze the loop, then put the rider `gap` m (centre to centre) in front of
   * a walker of the default town, facing them, arriving at `speed` m/s
   * (Builder A's `initialSpeed`), and step the shared fixed clock for up to
   * `seconds`. Every step's facts come back: the rider's crash and the
   * walker's row. A slow rider needs a short gap: from 3 m out the walker
   * steps aside before he arrives (R2C-5), so nothing meets (M42 QA round 1).
   */
  const rideIntoWalker = (page: Page, speed: number, seconds: number, gap = 3) => page.evaluate(({ speed, seconds, gap }) => {
    const game = window.game;
    game.loop.setRunning(false); game.clearActions();
    const walkers = game.populationState().simulation.actors.filter(actor => actor.kind === 'walker' && actor.activity === 'walking');
    for (const walker of walkers) {
      const heading = walker.headingY, x = walker.x + Math.sin(heading) * gap, z = walker.z + Math.cos(heading) * gap;
      const ground = game.sampleGround(x, z);
      if (Math.abs(ground.height - walker.y) > 0.08) continue;
      try { game.placeRider({ x, y: ground.height, z }, heading + Math.PI, 0, speed); } catch { continue; }
      const rows: { crashed: boolean; activity: string; reaction: string | null }[] = [];
      for (let step = 0; step < Math.round(seconds * 120); step += 1) {
        const euc = game.snapshot().euc;
        // Hold the arrival pace until something happens: a crash, or the meeting.
        game.setActions({ throttle: !euc.crashed && Math.abs(euc.speed) < speed ? 0.35 : 0 });
        game.advance(1);
        const row = game.populationState().simulation.actors.find(actor => actor.id === walker.id)!;
        rows.push({ crashed: game.snapshot().euc.crashed, activity: row.activity, reaction: row.impactReaction ?? null });
      }
      game.clearActions();
      return { walker: walker.id, rows };
    }
    return null;
  }, { speed, seconds, gap });

  test('a rider crashing into a walker knocks them down, and they are up again within 3 s', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await bootM42(page);
    const run = await rideIntoWalker(page, 6, 5);
    expect(run, 'a walker of the default town with room to ride at them').not.toBeNull();
    const crash = run!.rows.findIndex(row => row.crashed);
    expect(crash, 'the rider crashes into the walker at 6 m/s').toBeGreaterThanOrEqual(0);
    expect(run!.rows[crash].reaction, 'and knocks them down').toBe('knockdown');
    expect(run!.rows[crash].activity).toBe('impacted');
    // The reaction has ended within 3 s: up, no longer 'impacted', no reaction
    // channel. (Not "walking again": the crashed rider's body can hold the
    // walker in an occupant wait.)
    const ended = run!.rows.findIndex((row, index) => index > crash && row.activity !== 'impacted' && row.reaction === null);
    expect(ended, 'the knock-down ends').toBeGreaterThan(crash);
    expect((ended - crash) / 120, 'within 3 s').toBeLessThanOrEqual(3);
    expectNoM42Errors(errors);
  });

  test('at about 1 m/s the rider does not crash and the walker only staggers', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = await bootM42(page);
    // 1.6 m centre to centre: 0.48 m of air between the hulls (0.70 + 0.42),
    // clear of the 0.35 m placement margin, and met before the walker's
    // 0.6 s occupant wait could turn into a step aside.
    const run = await rideIntoWalker(page, 1, 4, 1.6);
    expect(run, 'a walker of the default town with room to ride at them').not.toBeNull();
    expect(run!.rows.some(row => row.crashed), 'no crash at walking pace').toBe(false);
    expect(run!.rows.some(row => row.reaction !== null), 'never a knock-down').toBe(false);
    expect(run!.rows.some(row => row.activity === 'impacted'), 'the meeting is the stagger').toBe(true);
    expectNoM42Errors(errors);
  });
});
// ── end M42 C ──
// ── M42 D — FPS and barks ──
// Builder D. **Invariant 11: the frame-rate readout is the owner's
// instrument.** Nothing below reads its value back to the runner: every check
// of it runs inside the page and returns booleans or hook names, and no test
// here takes a screenshot (one that did would have to pass
// `mask: [page.locator('[data-hud="fps"]')]`). The automatic failure artifacts
// are covered by `dInkOutFps` and the node's `aria-hidden` (see there).
//
// Barks: a placement zeroes the ridden distance — that is the rule — so every
// case places the rider first and then rides at most 7 m/s toward a standing
// person, with the chance forced through the QA bridge.
import { BARKS as D_BARKS } from '../src/data/tuning.ts';
import { BARK_LINES as D_BARK_LINES } from '../src/ui/barkModel.ts';

/** The world the FPS cases boot: light, because the readout is the window's, not the world's. */
const D_SLICE = 'level=slice';
/** Pad buttons (`tests/m24.spec.ts`). */
const D_DPAD_DOWN = 13;
const D_CONFIRM = 0;

/**
 * Invariant 11 for a failed case's automatic artifacts. `screenshot` and
 * `trace` are worker options: a describe cannot turn them off (trying fails
 * the whole file's collection — Rulings Q-C2). So the FPS cases paint the
 * readout's ink transparent from the first document on: its box, and so every
 * placement check, is unchanged, while no failure screenshot or trace frame
 * can show a figure. The node itself is `aria-hidden`, so the page snapshot in
 * a failure's `error-context.md` never carries it either.
 */
async function dInkOutFps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync('[data-hud="fps"] { color: transparent !important; text-shadow: none !important; }');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

/** Seat by seat, whether `[data-hud="fps"]` is laid out. Never its text. */
function dFpsShown(page: Page): Promise<boolean[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.euc-hud-seat')]
    .sort((a, b) => Number(a.dataset.seat) - Number(b.dataset.seat))
    .map((container) => {
      const node = container.querySelector<HTMLElement>('[data-hud="fps"]');
      if (node === null || node.hidden) return false;
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }));
}

/** The readout's format, checked in the page: a boolean comes back, never the text. */
function dFpsFormatOk(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('.euc-hud-seat[data-seat="0"] [data-hud="fps"]');
    return node !== null && /^\d{1,3} FPS$/.test(node.textContent ?? '');
  });
}

/** Where seat 0's readout sits: inside its pane, and which lanes or thumbs it touches (hook names only). */
function dFpsPlacement(page: Page): Promise<{ inside: boolean; lanes: string[]; thumbs: string[] }> {
  return page.evaluate(() => {
    const container = document.querySelector<HTMLElement>('.euc-hud-seat[data-seat="0"]')!;
    const node = container.querySelector<HTMLElement>('[data-hud="fps"]')!;
    const pane = container.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const meets = (other: DOMRect): boolean => other.width > 0 && other.height > 0
      && other.left < box.right && box.left < other.right && other.top < box.bottom && box.top < other.bottom;
    const lanes = [...container.querySelectorAll<HTMLElement>('[data-hud]')]
      .filter((other) => other !== node && other.offsetParent !== null && other.dataset.hud !== 'match-status')
      .filter((other) => meets(other.getBoundingClientRect()))
      .map((other) => other.dataset.hud ?? '');
    const thumbs = [...document.querySelectorAll<HTMLElement>('.euc-touch__stick, .euc-touch__actions, .euc-touch__system')]
      .filter((other) => meets(other.getBoundingClientRect()))
      .map((other) => other.className);
    return {
      inside: box.left >= pane.left - 0.5 && box.right <= pane.right + 0.5
        && box.top >= pane.top - 0.5 && box.bottom <= pane.bottom + 0.5,
      lanes,
      thumbs,
    };
  });
}

/** Settings opened from the title returns to the title; ride from there, as a player does. */
async function dSettingsToRide(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.game.setAppState('title');
    window.game.setAppState('freeRide');
  });
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
}

/** What one approach saw. Lines and hook names; never a frame-rate figure. */
interface DApproach {
  tried: number;
  shown: boolean;
  actorId: string | null;
  line: number;
  text: string;
  /** Seconds the seat's `[data-bark]` was laid out. */
  visibleSeconds: number;
  /** Seconds from the model's start to the DOM bubble being gone, or -1. */
  goneAfter: number;
  /** Any other seat's bubble was laid out during the approach. */
  elsewhere: boolean;
  /** `[data-bark]` nodes laid out at the first measured frame, across every pane. */
  visibleCount: number;
  insidePane: boolean;
  canvasAtCentre: boolean;
  /** `[data-hud]` hooks in the bubble's pane that the bubble overlapped, over its whole life. */
  laneOverlaps: string[];
  /** Touch controls the bubble overlapped (phone cases). */
  thumbOverlaps: string[];
  fontPx: number;
}

/**
 * Place `seat` 34–40 m from a standing person (a social group member or a
 * worker) on the side that person faces, 2.5 m off their line, on a run the
 * world's rays say is clear and level; then ride at `speed` toward them with
 * `advance()`, braking once a bubble shows (or stopping within 4 m and
 * waiting for the stop bark). Runs entirely in the page, with the loop
 * stopped, so every step is one the spec took. `attempts` caps the placed
 * approaches (a mode that must stay silent needs only one).
 */
async function dApproach(
  page: Page, seat: number, exclude: readonly string[] = [], speed = 5, attempts = 64,
): Promise<DApproach> {
  return page.evaluate(({ seat: index, exclude: skip, speed: target, attempts: cap, watch }) => {
    const game = window.game;
    const world = game as unknown as {
      terrain: { raycast(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, max: number): number | null };
    };
    const CHUNK = 6;
    const SECONDS = CHUNK / 120;
    game.loop.setRunning(false);
    game.setBarksEnabled(true, true);
    const result = {
      tried: 0, shown: false, actorId: null as string | null, line: -1, text: '', visibleSeconds: 0, goneAfter: -1,
      elsewhere: false, visibleCount: 0, insidePane: false, canvasAtCentre: false,
      laneOverlaps: [] as string[], thumbOverlaps: [] as string[], fontPx: 0,
    };
    const container = document.querySelector<HTMLElement>(`.euc-hud-seat[data-seat="${index}"]`)!;
    const laidOut = (node: HTMLElement | null): node is HTMLElement => {
      if (node === null || node.hidden) return false;
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    };
    const meets = (a: DOMRect, b: DOMRect): boolean => a.width > 0 && a.height > 0
      && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const measure = (bark: HTMLElement, first: boolean): void => {
      const box = bark.getBoundingClientRect();
      for (const lane of container.querySelectorAll<HTMLElement>('[data-hud]')) {
        if (lane.offsetParent === null || lane.dataset.hud === 'match-status') continue;
        if (meets(lane.getBoundingClientRect(), box) && !result.laneOverlaps.includes(lane.dataset.hud ?? '')) {
          result.laneOverlaps.push(lane.dataset.hud ?? '');
        }
      }
      for (const thumb of document.querySelectorAll<HTMLElement>('.euc-touch__stick, .euc-touch__actions, .euc-touch__system')) {
        if (meets(thumb.getBoundingClientRect(), box) && !result.thumbOverlaps.includes(thumb.className)) {
          result.thumbOverlaps.push(thumb.className);
        }
      }
      if (!first) return;
      const pane = container.getBoundingClientRect();
      result.insidePane = box.left >= pane.left - 0.5 && box.right <= pane.right + 0.5
        && box.top >= pane.top - 0.5 && box.bottom <= pane.bottom + 0.5;
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      result.canvasAtCentre = hit instanceof HTMLCanvasElement;
      result.fontPx = Number.parseFloat(getComputedStyle(bark).fontSize);
      result.text = bark.textContent ?? '';
      result.visibleCount = [...document.querySelectorAll<HTMLElement>('[data-bark]')].filter((node) => laidOut(node)).length;
    };
    const others = (): boolean => [...document.querySelectorAll<HTMLElement>('.euc-hud-seat')]
      .filter((other) => other !== container)
      .some((other) => laidOut(other.querySelector<HTMLElement>('[data-bark]')));

    const people = game.populationState().simulation.actors
      .filter((actor) => (actor.kind === 'social' || actor.kind === 'worker')
        && actor.activity !== 'impacted' && !skip.includes(actor.id));
    for (const actor of people) {
      for (const distance of [40, 34]) {
        for (const side of [2.5, -2.5]) {
          const fx = Math.sin(actor.headingY);
          const fz = Math.cos(actor.headingY);
          const sx = actor.x + fz * side + fx * distance;
          const sz = actor.z - fx * side + fz * distance;
          const start = game.sampleGround(sx, sz);
          if (!Number.isFinite(start.height)) continue;
          const along = { x: -fx, y: 0, z: -fz };
          if (world.terrain.raycast({ x: sx, y: start.height + 0.5, z: sz }, along, distance - 3) !== null) continue;
          if (world.terrain.raycast({ x: sx, y: start.height + 2.2, z: sz }, along, distance) !== null) continue;
          let level = true;
          for (let d = 2; d <= distance && level; d += 2) {
            const ground = game.sampleGround(sx - fx * d, sz - fz * d);
            level = Number.isFinite(ground.height) && Math.abs(ground.height - start.height) < 1.2;
          }
          if (!level) continue;
          try {
            game.placeRider({ x: sx, y: start.height, z: sz }, Math.atan2(-fx, -fz), index);
          } catch {
            continue;
          }
          result.tried += 1;

          let startedAt = -1;
          let stoppedFor = 0;
          for (let chunk = 0; chunk < 600; chunk += 1) {
            const euc = game.snapshotFor(index).euc;
            if (euc.state === 'crashing' || euc.state === 'recovering' || euc.state === 'dismounted') break;
            const near = Math.hypot(euc.position.x - actor.x, euc.position.z - actor.z) < 4.2;
            const braking = startedAt >= 0 || near;
            const throttle = braking
              ? (euc.speed > 0.4 ? -0.6 : 0)
              : euc.speed < target - 0.5 ? 0.5 : euc.speed > target + 0.5 ? -0.3 : 0.08;
            game.setActionsFor(index, { throttle, steer: 0 });
            game.advance(CHUNK);
            if (others()) result.elsewhere = true;
            const state = game.barkState()[index];
            if (startedAt < 0 && state.visible) {
              startedAt = chunk;
              result.shown = true;
              result.actorId = state.actorId;
              result.line = state.line;
            }
            if (startedAt >= 0) {
              const bark = container.querySelector<HTMLElement>('[data-bark]');
              if (laidOut(bark)) {
                measure(bark, result.visibleSeconds === 0);
                result.visibleSeconds += SECONDS;
              } else if (result.visibleSeconds > 0 && result.goneAfter < 0) {
                result.goneAfter = (chunk - startedAt) * SECONDS;
              }
              if ((chunk - startedAt) * SECONDS > watch) break;
            } else if (braking && Math.abs(euc.speed) < 0.4) {
              stoppedFor += SECONDS;
              if (stoppedFor > 3) break;
            }
          }
          game.setActionsFor(index, { throttle: 0, steer: 0 });
          if (result.shown || result.tried >= cap) return result;
        }
      }
    }
    return result;
  }, { seat, exclude: [...exclude], speed, attempts, watch: D_BARKS.lifetimeSeconds + D_BARKS.fadeSeconds + 0.5 });
}

/** The common verdict on a bubble that showed. */
function dExpectBubble(seen: DApproach, what: string): void {
  expect(seen.shown, `${what}: no bubble after ${seen.tried} placed approaches`).toBe(true);
  expect(D_BARK_LINES, `${what}: the bubble said something else`).toContain(seen.text);
  expect(seen.text).toBe(D_BARK_LINES[seen.line]);
  expect(seen.visibleCount, `${what}: one bubble on screen`).toBe(1);
  expect(seen.insidePane, `${what}: the bubble leaves its pane`).toBe(true);
  expect(seen.canvasAtCentre, `${what}: the bubble takes the pointer`).toBe(true);
  expect(seen.laneOverlaps, `${what}: the bubble sits on a HUD lane`).toEqual([]);
  expect(seen.thumbOverlaps, `${what}: the bubble sits under a thumb`).toEqual([]);
}

/** What one stop-near run saw (critic-people item 18). */
interface DStopNear {
  tried: number;
  /** Runs abandoned because a pass bark (someone else) showed during the ride in. */
  spoiled: number;
  shown: boolean;
  text: string;
  /** Rider speed and rider-to-asker distance on the frame the bubble started. */
  speedAtStart: number;
  askerMetres: number;
  /** The rider's top speed from the pivot on (it should stay a stop). */
  creepTopSpeed: number;
  visibleSeconds: number;
  /** Bubbles that started later in the same stop, parked past the seat cooldown. */
  laterBubbles: number;
  /** One line per placed stop, for a failure message. */
  notes: string[];
}

/**
 * The stop-near bark in the real game (critic-people item 18), with no pass
 * bark possible from the asker: placed 50 m out on a bearing 50° off a
 * standing person's facing (straight on, a face-to-face partner stands in the
 * line of sight and the sight test rightly holds the asker back), ride
 * straight at them at 5 m/s and brake 10 m outside the pass box's far edge,
 * so the wheel stops short of it — the asker never enters the pass box at
 * pass speed, and the 20 m ridden rule is met — then creep in under
 * `stopMaximumSpeed` (a creep is never a pass) to 3 m and hold still. A
 * bubble that starts with the asker inside the stop radius, nearer than the
 * pass box's near edge, is the stop bark. Then stay parked past the seat
 * cooldown: once per stop, so nothing more.
 */
async function dStopNear(page: Page, attempts = 24): Promise<DStopNear> {
  return page.evaluate(({ cap, hold, brakeAt }) => {
    const game = window.game;
    const world = game as unknown as {
      terrain: { raycast(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }, max: number): number | null };
    };
    const CHUNK = 6;
    const SECONDS = CHUNK / 120;
    const BRAKE_AT = brakeAt;
    const START = BRAKE_AT + 12;
    game.loop.setRunning(false);
    game.setBarksEnabled(true, true);
    const result = {
      tried: 0, spoiled: 0, shown: false, text: '', speedAtStart: -1, askerMetres: -1, creepTopSpeed: 0,
      visibleSeconds: 0, laterBubbles: 0, notes: [] as string[],
    };
    const container = document.querySelector<HTMLElement>('.euc-hud-seat[data-seat="0"]')!;
    const laidOut = (): HTMLElement | null => {
      const node = container.querySelector<HTMLElement>('[data-bark]');
      if (node === null || node.hidden) return null;
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? node : null;
    };
    const wrap = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
    const clear = (x: number, z: number, y: number, dx: number, dz: number, length: number): boolean => {
      for (const lift of [0.5, 2.2]) {
        if (world.terrain.raycast({ x, y: y + lift, z }, { x: dx, y: 0, z: dz }, length) !== null) return false;
      }
      for (let d = 2; d <= length; d += 2) {
        const ground = game.sampleGround(x + dx * d, z + dz * d);
        if (!Number.isFinite(ground.height) || Math.abs(ground.height - y) > 1.2) return false;
      }
      return true;
    };
    const step = (throttle: number, steer: number): ReturnType<typeof game.snapshotFor>['euc'] => {
      game.setActionsFor(0, { throttle, steer });
      game.advance(CHUNK);
      return game.snapshotFor(0).euc;
    };
    const down = (euc: ReturnType<typeof game.snapshotFor>['euc']): boolean =>
      euc.state === 'crashing' || euc.state === 'recovering' || euc.state === 'dismounted';

    const people = game.populationState().simulation.actors
      .filter((actor) => (actor.kind === 'social' || actor.kind === 'worker') && actor.activity !== 'impacted');
    for (const actor of people) for (const angle of [0.87, -0.87]) {
      if (result.tried >= cap) return result;
      // The bearing out from the person, 50° off their facing.
      const gx = Math.sin(actor.headingY + angle);
      const gz = Math.cos(actor.headingY + angle);
      {
        const sx = actor.x + gx * START;
        const sz = actor.z + gz * START;
        const start = game.sampleGround(sx, sz);
        if (!Number.isFinite(start.height)) continue;
        if (!clear(sx, sz, start.height, -gx, -gz, START - 2.5)) continue;
        try {
          game.placeRider({ x: sx, y: start.height, z: sz }, Math.atan2(-gx, -gz), 0);
        } catch {
          continue;
        }
        result.tried += 1;
        const toPerson = (euc: ReturnType<typeof game.snapshotFor>['euc']): { distance: number; error: number } => {
          const live = game.populationState().simulation.actors.find((other) => other.id === actor.id) ?? actor;
          const toX = live.x - euc.position.x;
          const toZ = live.z - euc.position.z;
          return { distance: Math.hypot(toX, toZ), error: wrap(Math.atan2(toX, toZ) - euc.headingY) };
        };

        // 1. The ride in: 5 m/s straight at the person, braking 10 m outside
        // the pass box so the wheel stops short of it.
        let euc = game.snapshotFor(0).euc;
        let ok = true;
        let spoiled = false;
        let shortOf = -1;
        for (let chunk = 0; chunk < 900; chunk += 1) {
          const { distance, error } = toPerson(euc);
          const braking = distance <= BRAKE_AT;
          if (braking && Math.abs(euc.speed) < 0.1) { shortOf = distance; break; }
          const throttle = braking ? (euc.speed > 0.1 ? -0.8 : 0) : euc.speed < 4.5 ? 0.5 : euc.speed > 5.5 ? -0.3 : 0.08;
          euc = step(throttle, braking ? 0 : Math.max(-1, Math.min(1, -error * 1.8)));
          if (down(euc)) { ok = false; break; }
          if (game.barkState()[0].visible) { spoiled = true; break; }
        }
        // 2. Creep in under the stop speed (throttle breaks away near 0.45;
        // the band below holds ≈ 0.3–0.5 m/s) to 3 m, then stop.
        if (ok && !spoiled) {
          for (let chunk = 0; chunk < 2400; chunk += 1) {
            const { distance, error } = toPerson(euc);
            if (distance <= 3 && Math.abs(euc.speed) < 0.1) break;
            const throttle = distance <= 3 ? (euc.speed > 0.1 ? -0.6 : 0)
              : euc.speed < 0.3 ? 0.5 : euc.speed > 0.55 ? -0.2 : 0.36;
            euc = step(throttle, Math.max(-1, Math.min(1, -error * 1.5)));
            result.creepTopSpeed = Math.max(result.creepTopSpeed, Math.abs(euc.speed));
            if (down(euc)) { ok = false; break; }
            if (game.barkState()[0].visible) break;
          }
        }
        // 4. Hold still: the stop bark, then nothing more for this stop.
        let startedAt = -1;
        if (ok && !spoiled) {
          const chunks = Math.ceil(hold / SECONDS);
          let was = false;
          for (let chunk = 0; chunk < chunks; chunk += 1) {
            const state = game.barkState()[0];
            if (state.visible && !was) {
              if (startedAt < 0) {
                startedAt = chunk;
                const asker = game.populationState().simulation.actors.find((other) => other.id === state.actorId);
                result.shown = true;
                result.speedAtStart = Math.abs(euc.speed);
                result.askerMetres = asker === undefined ? -1
                  : Math.hypot(asker.x - euc.position.x, asker.z - euc.position.z);
              } else {
                result.laterBubbles += 1;
              }
            }
            was = state.visible;
            const bark = laidOut();
            if (bark !== null && startedAt >= 0 && result.laterBubbles === 0) {
              if (result.text === '') result.text = bark.textContent ?? '';
              result.visibleSeconds += SECONDS;
            }
            if (startedAt < 0 && chunk * SECONDS > 6) break;
            euc = step(euc.speed > 0.1 ? -0.4 : 0, 0);
            if (down(euc)) break;
          }
        }
        game.setActionsFor(0, { throttle: 0, steer: 0 });
        {
          const live = game.populationState().simulation.actors.find((other) => other.id === actor.id);
          const gap = live === undefined ? -1 : Math.hypot(live.x - euc.position.x, live.z - euc.position.z);
          result.notes.push(`${actor.kind}: ${ok ? 'up' : 'down'}${spoiled ? ', spoiled' : ''}, `
            + `ride-in stopped ${shortOf.toFixed(1)} m short, ended ${gap.toFixed(1)} m `
            + `at ${Math.abs(euc.speed).toFixed(2)} m/s, ridden ${game.barkState()[0].riddenMetres.toFixed(0)} m, `
            + `creep top ${result.creepTopSpeed.toFixed(2)} m/s`);
        }
        if (result.shown) return result;
        if (spoiled) {
          // Someone else's pass took the seat cooldown: let it lapse unseen.
          result.spoiled += 1;
          game.setBarksEnabled(false);
          game.advance(Math.ceil((hold + 1) * 120));
          game.setBarksEnabled(true, true);
        }
      }
    }
    return result;
  }, {
    cap: attempts, hold: D_BARKS.seatCooldownSeconds + 5, brakeAt: D_BARKS.passAheadMetres[1] + 10,
  });
}

test.describe('M42 D — FPS and barks', () => {
  test.describe('the frame-rate readout', () => {
    // The readout is the owner's instrument (invariant 11): no automatic
    // failure screenshot or trace frame may show its figure (`dInkOutFps`).
    test.beforeEach(async ({ page }) => {
      await dInkOutFps(page);
    });

    test('off by default; the Settings checkbox shows it in seat 0 only, at one, two and four seats', async ({ page }) => {
      const errors = await bootM42ToTitle(page, D_SLICE);
      expect(await page.evaluate(() => window.game.snapshot().options.showFps)).toBe(false);
      expect(await dFpsShown(page)).toEqual([false]);

      // By pointer, in the Settings Display group, after Speed units.
      await page.evaluate(() => window.game.setAppState('settings'));
      const order = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
        '.euc-menu--settings [data-option]',
      )].map((node) => node.dataset.option));
      expect(order.indexOf('showFps')).toBe(order.indexOf('speedUnit') + 1);
      await page.locator('#euc-opt-fps').click();
      expect(await page.evaluate(() => window.game.snapshot().options.showFps)).toBe(true);

      await dSettingsToRide(page);
      await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true]);
      expect(await dFpsFormatOk(page)).toBe(true);

      await page.evaluate(() => {
        while (window.game.seatCount < 2) window.game.spawnRider();
      });
      await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true, false]);
      await page.evaluate(() => {
        while (window.game.seatCount < 4) window.game.spawnRider();
      });
      await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true, false, false, false]);
      expect(await dFpsFormatOk(page)).toBe(true);
      const placed = await dFpsPlacement(page);
      expect(placed.inside, 'the readout leaves pane 0').toBe(true);
      expect(placed.lanes, 'the readout sits on another lane').toEqual([]);

      // Off hides it everywhere.
      await page.evaluate(() => window.game.setOptions({ showFps: false }));
      await expect.poll(() => dFpsShown(page)).toEqual([false, false, false, false]);
      await page.evaluate(() => window.game.resetOptions());
      expectNoM42Errors(errors);
    });

    test('a pad reaches the checkbox one Down past Speed units and toggles it', async ({ page }) => {
      await page.addInitScript(() => {
        const pad = {
          index: 0, id: 'fake standard pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
        };
        (window as unknown as { fakePad: typeof pad }).fakePad = pad;
        navigator.getGamepads = () => [pad] as never;
      });
      const errors = await bootM42ToTitle(page, D_SLICE);
      await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
      const pulse = (button: number): Promise<void> => page.evaluate(async (which) => {
        const pad = (window as unknown as { fakePad: { buttons: { pressed: boolean; value: number }[] } }).fakePad;
        const frame = () => new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        pad.buttons[which].pressed = true;
        pad.buttons[which].value = 1;
        await frame();
        pad.buttons[which].pressed = false;
        pad.buttons[which].value = 0;
        await frame();
      }, button);

      await page.evaluate(() => window.game.setAppState('settings'));
      await expect(page.locator('[data-option="quality"]')).toBeFocused();
      await pulse(D_DPAD_DOWN);
      await pulse(D_DPAD_DOWN);
      await expect(page.locator('[data-option="speedUnit"]')).toBeFocused();
      await pulse(D_DPAD_DOWN);
      await expect(page.locator('#euc-opt-fps')).toBeFocused();
      await pulse(D_CONFIRM);
      expect(await page.evaluate(() => window.game.snapshot().options.showFps)).toBe(true);
      await expect(page.locator('#euc-opt-fps')).toBeChecked();
      await dSettingsToRide(page);
      await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true]);

      // From a ride, Settings is under the pause card.
      await page.evaluate(() => {
        window.game.setAppState('paused');
        window.game.setAppState('settings');
      });
      await page.locator('#euc-opt-fps').focus();
      await pulse(D_CONFIRM);
      expect(await page.evaluate(() => window.game.snapshot().options.showFps)).toBe(false);
      await page.evaluate(() => window.game.resetOptions());
      expectNoM42Errors(errors);
    });

    test('the setting survives a reload, and turning it off hides the readout', async ({ page }) => {
      const errors = await bootM42(page, D_SLICE);
      await page.evaluate(() => window.game.setOptions({ showFps: true }));
      await bootM42(page, D_SLICE);
      expect(await page.evaluate(() => window.game.snapshot().options.showFps)).toBe(true);
      await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true]);
      await expect(page.locator('#euc-opt-fps')).toBeChecked();
      await page.evaluate(() => window.game.setOptions({ showFps: false }));
      await expect.poll(() => dFpsShown(page)).toEqual([false]);
      await page.evaluate(() => window.game.resetOptions());
      expectNoM42Errors(errors);
    });

    test.describe('on a phone', () => {
      test.use({ hasTouch: true, viewport: { width: 412, height: 839 } });

      test('the readout sits in the speed pill, clear of every thumb, in portrait and landscape', async ({ page }) => {
        const errors = await bootM42(page, D_SLICE);
        await page.evaluate(() => window.game.setOptions({ touchControls: 'on', showFps: true }));
        await expect(page.locator('.euc-touch__stick')).toBeVisible();
        await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true]);
        const portrait = await dFpsPlacement(page);
        expect(portrait.inside, 'portrait: the readout leaves the screen').toBe(true);
        expect(portrait.lanes, 'portrait: the readout sits on a lane').toEqual([]);
        expect(portrait.thumbs, 'portrait: the readout sits under a thumb').toEqual([]);

        const before = await page.evaluate(() => window.game.snapshot().layoutChanges);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction((was) => window.game.snapshot().layoutChanges > was, before);
        await expect.poll(() => dFpsShown(page), { timeout: 10_000 }).toEqual([true]);
        const landscape = await dFpsPlacement(page);
        expect(landscape.inside, 'landscape: the readout leaves the screen').toBe(true);
        expect(landscape.lanes, 'landscape: the readout sits on a lane').toEqual([]);
        expect(landscape.thumbs, 'landscape: the readout sits under a thumb').toEqual([]);
        await page.evaluate(() => window.game.resetOptions());
        expectNoM42Errors(errors);
      });
    });
  });

  test.describe('the question barks', () => {
    test('a slow approach asks one of the five questions, readable, then a different one', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await bootM42(page);
      const first = await dApproach(page, 0);
      dExpectBubble(first, 'solo');
      expect(first.visibleSeconds, `the bubble showed under ${D_BARKS.minimumReadableSeconds} s`)
        .toBeGreaterThanOrEqual(D_BARKS.minimumReadableSeconds);
      expect(first.goneAfter, 'the bubble outlived its life and fade').toBeGreaterThan(0);
      expect(first.goneAfter).toBeLessThanOrEqual(D_BARKS.lifetimeSeconds + D_BARKS.fadeSeconds + 0.2);
      expect(await page.evaluate(() => window.game.barkState()[0].visible)).toBe(false);

      // Past the seat cooldown, then a second person (the first is in its
      // person memory): never the same line twice in a row.
      await page.evaluate((s) => window.game.advance(Math.ceil(s + 1) * 120), D_BARKS.seatCooldownSeconds);
      const second = await dApproach(page, 0, [first.actorId!]);
      dExpectBubble(second, 'solo, second');
      expect(second.line, 'the same line twice in a row').not.toBe(first.line);
      expectNoM42Errors(errors);
    });

    test('a stop beside a standing person asks once (the stop bark, no pass possible)', async ({ page }) => {
      test.setTimeout(420_000);
      const errors = await bootM42(page);
      const seen = await dStopNear(page);
      expect(seen.shown, `no stop bark after ${seen.tried} placed stops (${seen.spoiled} spoiled by a pass):\n`
        + seen.notes.join('\n')).toBe(true);
      console.log(`[stop bark] after ${seen.tried} placed stop(s): asker ${seen.askerMetres.toFixed(2)} m, `
        + `speed ${seen.speedAtStart.toFixed(2)} m/s at the start, creep top ${seen.creepTopSpeed.toFixed(2)} m/s, `
        + `shown ${seen.visibleSeconds.toFixed(2)} s, ${seen.laterBubbles} later bubble(s); ${seen.notes.at(-1) ?? ''}`);
      expect(D_BARK_LINES).toContain(seen.text);
      // A stop, not a pass: the rider stood still, nearer the asker than the
      // pass box starts, inside the stop radius.
      expect(seen.creepTopSpeed, 'the creep in became a pass').toBeLessThan(D_BARKS.stopMaximumSpeed);
      expect(seen.speedAtStart).toBeLessThan(D_BARKS.stopMaximumSpeed);
      expect(seen.askerMetres).toBeGreaterThanOrEqual(0);
      expect(seen.askerMetres).toBeLessThanOrEqual(D_BARKS.stopRadiusMetres + 0.3);
      expect(seen.askerMetres).toBeLessThan(D_BARKS.passAheadMetres[0]);
      expect(seen.visibleSeconds, `the stop bubble showed under ${D_BARKS.minimumReadableSeconds} s`)
        .toBeGreaterThanOrEqual(D_BARKS.minimumReadableSeconds);
      // Once per stop: parked past the seat cooldown, nothing more.
      expect(seen.laterBubbles, 'a parked stop asked again').toBe(0);
      expectNoM42Errors(errors);
    });

    test('two seats: only the passing seat\'s pane shows the bubble', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await bootM42(page);
      await page.evaluate(() => {
        while (window.game.seatCount < 2) window.game.spawnRider();
      });
      const seen = await dApproach(page, 1);
      dExpectBubble(seen, 'two seats, seat 1');
      expect(seen.elsewhere, 'seat 0 showed a bubble it never earned').toBe(false);
      expect(await page.evaluate(() => window.game.barkState()[0].visible)).toBe(false);
      expectNoM42Errors(errors);
    });

    test.describe('in a 1280 px window', () => {
      test.use({ viewport: { width: 1280, height: 720 } });

      test('four seats: the bubble stays clear of pane 0\'s lanes at a readable size', async ({ page }) => {
        test.setTimeout(240_000);
        const errors = await bootM42(page);
        await page.evaluate(() => {
          while (window.game.seatCount < 4) window.game.spawnRider();
        });
        const seen = await dApproach(page, 0);
        dExpectBubble(seen, 'four seats, seat 0');
        expect(seen.elsewhere).toBe(false);
        expect(seen.fontPx, 'the quad-pane bubble is under 12 px').toBeGreaterThanOrEqual(12);
        expectNoM42Errors(errors);
      });
    });

    test('Challenge, with the timer showing: the bubble keeps off the lanes', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await bootM42ToTitle(page);
      await page.evaluate(() => {
        window.game.startTimeTrial();
        window.game.loop.setRunning(false);
        window.game.advance(2);
      });
      expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('challenge');
      await expect(page.locator('.euc-hud-seat[data-seat="0"] [data-hud="timer"]')).toBeVisible();
      const seen = await dApproach(page, 0);
      dExpectBubble(seen, 'Challenge');
      expectNoM42Errors(errors);
    });

    test('Knockabout stays silent', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = await bootM42ToTitle(page);
      await page.evaluate(() => {
        window.game.startKnockabout();
        window.game.loop.setRunning(false);
        window.game.advance(2);
      });
      expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('knockabout');
      const knockabout = await dApproach(page, 0, [], 5, 1);
      expect(knockabout.tried, 'Knockabout: no approach could be placed').toBeGreaterThan(0);
      expect(knockabout.shown, 'a bubble in Knockabout').toBe(false);
      expect(knockabout.elsewhere).toBe(false);
      expectNoM42Errors(errors);
    });

    test('a chase is quiet on the room\'s own facts: a cop or the siren inside 60 m silences, beyond it a bubble shows', async ({ page }) => {
      // The quiet line's 59/60/61 m, the countdown and the start hold are
      // proved headlessly (`barkQuiet.test.ts`, `barkModel.test.ts`). This
      // proves Game's glue: the room's facts reach the model's `quiet`. The
      // bridge cannot place a cop, so the room's two readings are replaced on
      // the instance (the method and the getter Game reads), and its bust,
      // touch and stray rules are switched off on the instance so the real
      // cop cannot end the round under the probe. Solo: no countdown.
      test.setTimeout(240_000);
      const errors = await bootM42ToTitle(page);
      const entered = await page.evaluate(() => {
        const game = window.game;
        const inner = game as unknown as {
          chaseRoom: {
            phase: string; pursuersHeld: boolean; bustRadiusMetres: number; touchBustMetres: number;
            strayLimitMetres: number; nearestCopMetres: (outlaw: number) => number;
          };
          chaseSeatOutlaw: number[];
        };
        game.startChase();
        game.loop.setRunning(false);
        const room = inner.chaseRoom;
        for (let guard = 0; guard < 2000 && (room.phase !== 'running' || room.pursuersHeld); guard += 1) game.advance(12);
        room.bustRadiusMetres = -1;
        room.touchBustMetres = -1;
        room.strayLimitMetres = Infinity;
        const facts = { cop: 100, siren: 100 };
        (window as unknown as { dBarkFacts: typeof facts }).dBarkFacts = facts;
        room.nearestCopMetres = () => facts.cop;
        Object.defineProperty(room, 'sirenRangeMetres', { configurable: true, get: () => facts.siren });
        return {
          state: game.snapshot().app.state, phase: room.phase, held: room.pursuersHeld, outlaw: inner.chaseSeatOutlaw[0],
        };
      });
      expect(entered).toEqual({ state: 'chase', phase: 'running', held: false, outlaw: 0 });

      /** Set the room's two readings, then count seat 0's allowed and quiet frames over 20 drawn chunks. */
      const quietFrames = (cop: number, siren: number): Promise<{ allowed: number; quiet: number; standing: boolean }> =>
        page.evaluate(({ cop: copMetres, siren: sirenMetres }) => {
          const game = window.game;
          const inner = game as unknown as {
            barkFrames: { modeAllows: boolean; quiet: boolean }[];
            chaseRoom: { statusOf(outlaw: number): string };
          };
          const facts = (window as unknown as { dBarkFacts: { cop: number; siren: number } }).dBarkFacts;
          facts.cop = copMetres;
          facts.siren = sirenMetres;
          game.setBarksEnabled(true, true);
          let allowed = 0;
          let quiet = 0;
          for (let chunk = 0; chunk < 20; chunk += 1) {
            game.advance(6);
            const frame = inner.barkFrames[0];
            if (!frame.modeAllows) continue;
            allowed += 1;
            if (frame.quiet) quiet += 1;
          }
          return { allowed, quiet, standing: inner.chaseRoom.statusOf(0) === 'standing' };
        }, { cop, siren });

      for (const [cop, siren, quiet] of [[30, 100, true], [100, 59, true], [100, 100, false]] as const) {
        const seen = await quietFrames(cop, siren);
        const what = `cop at ${cop} m, siren at ${siren} m`;
        expect(seen.standing, `${what}: the outlaw went down`).toBe(true);
        expect(seen.allowed, `${what}: the mode refused barks`).toBeGreaterThan(0);
        expect(seen.quiet, `${what}: quiet frames`).toBe(quiet ? seen.allowed : 0);
      }

      // Inside the line, a forced approach never asks...
      await quietFrames(30, 100);
      const near = await dApproach(page, 0, [], 5, 2);
      expect(near.tried, 'chase, cop at 30 m: no approach could be placed').toBeGreaterThan(0);
      expect(near.shown, 'a bubble with a cop at 30 m').toBe(false);
      // ...and beyond it, the same pipeline does: the silence above was the line's.
      await quietFrames(100, 100);
      const far = await dApproach(page, 0);
      dExpectBubble(far, 'chase, cop and siren at 100 m');
      expect(await page.evaluate(() => (window.game as unknown as {
        chaseRoom: { statusOf(outlaw: number): string };
      }).chaseRoom.statusOf(0)), 'the outlaw went down under the probe').toBe('standing');
      expectNoM42Errors(errors);
    });

    test.describe('on a phone', () => {
      test.use({ hasTouch: true, viewport: { width: 412, height: 839 } });

      test('the bubble keeps clear of the touch controls and the lanes, in portrait and landscape', async ({ page }) => {
        test.setTimeout(300_000);
        const errors = await bootM42(page);
        await page.evaluate(() => window.game.setOptions({ touchControls: 'on' }));
        await expect(page.locator('.euc-touch__stick')).toBeVisible();
        const portrait = await dApproach(page, 0);
        dExpectBubble(portrait, 'phone portrait');

        const before = await page.evaluate(() => window.game.snapshot().layoutChanges);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForFunction((was) => window.game.snapshot().layoutChanges > was, before);
        // Past the seat cooldown, with barks switched off meanwhile so
        // nobody else takes the slot (switching off suspends; it never clears
        // the cooldown, so the wait is real).
        await page.evaluate((s) => {
          window.game.setBarksEnabled(false);
          window.game.advance(Math.ceil(s + 1) * 120);
        }, D_BARKS.seatCooldownSeconds);
        const landscape = await dApproach(page, 0, [portrait.actorId!]);
        dExpectBubble(landscape, 'phone landscape');
        await page.evaluate(() => window.game.resetOptions());
        expectNoM42Errors(errors);
      });
    });
  });
});
// ── end M42 D ──
