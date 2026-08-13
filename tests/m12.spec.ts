/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { RENDER_BUDGET } from '../src/data/renderCost.ts';
import { generateLevel } from '../src/level/generateRoute.ts';
import { withinRenderBudget } from '../src/level/renderBudget.ts';

/**
 * M12 Phase 3 — render scaling, in a real browser.
 *
 * `docs/PLANS.md` §10, Phase 3 asks two things a headless test cannot answer.
 *
 * **Does a generated route cost what the model says it costs?**
 * `src/render/renderCost.test.ts` proves the model equals the built scene, but
 * it builds that scene in Node with no GL context — so it counts what was
 * *submitted*, never what a `WebGLRenderer` reports. This rides the worst seed
 * the sweep found and compares `renderer.info` against the prediction, which
 * is where a model that quietly ignored frustum culling in the wrong direction
 * would show up.
 *
 * **Do N sequential generations plateau GPU objects?** Invariant 10 has been
 * checked since M1 across advancing, resizing, resetting and restarting — all
 * on a world built once. A generator makes the world disposable, and a build
 * path that forgets a single `removeFromParent` or leaves an `InstancedMesh`'s
 * instance buffers alive is invisible while there is only ever one level. The
 * scene-graph half of this runs headlessly in
 * `src/render/levelLifecycle.test.ts`; the GPU counters only exist here.
 *
 * **Nothing here is a frame time** (`AGENTS.md`). Draw calls, triangles, GPU
 * object counts and boot timing are reportable; the frame verdict on the
 * worst-case seed is the owner's, read from `tools/perf-window.js`.
 */

/**
 * The densest route 1,800 seeds produced, and the seed the owner's perf-window
 * gate is written against.
 *
 * Chosen by triangles, because Phase 0 established that draw calls are a set
 * union over a finite library and cannot grow with a route's length, while
 * triangles are additive and are the axis that actually threatens §9.
 */
const WORST_SEED = 'route-41';

/** Six worlds is enough that a per-world leak is unmistakable in the counters. */
const REGENERATION_SEEDS = ['route-41', 'route-278', 'x67', 'seed-8', 'euc-180', 'euc-35'];

test('the densest generated route costs what the model predicted, inside both ceilings', async ({ page }) => {
  await boot(page, `level=generated&seed=${WORST_SEED}`);

  const predicted = withinRenderBudget(generateLevel(WORST_SEED).plan);
  expect(predicted.breaches).toEqual([]);

  // Ride the route rather than reading one resting frame: the camera decides
  // what survives the frustum, and a single heading under-samples the world.
  const worst = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(60); // Warm up: the first frames compile shaders.
    const peak = { drawCalls: 0, triangles: 0 };
    for (let sample = 0; sample < 200; sample += 1) {
      game.setActions({ throttle: 1, steer: Math.sin(sample / 23) * 0.7 });
      game.advance(20);
      const render = game.snapshot().render;
      if (render.drawCalls > peak.drawCalls) peak.drawCalls = render.drawCalls;
      if (render.triangles > peak.triangles) peak.triangles = render.triangles;
    }
    game.setActions({ throttle: 0, steer: 0 });
    return peak;
  });

  // The §9 ceilings, on what the browser actually reported.
  expect(worst.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  expect(worst.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);

  // And the model is an upper bound on it, which is the direction a budget
  // contract has to err in: `planRenderCost` answers "what could this world
  // cost" and ignores culling on purpose, so a browser figure *above* it would
  // mean the contract is passing routes the frame cannot afford.
  expect(worst.drawCalls).toBeLessThanOrEqual(predicted.frame.drawCalls);
  expect(worst.triangles).toBeLessThanOrEqual(predicted.frame.triangles);

  // Not a vacuous bound: the world really is on screen. Anything much below
  // this would mean the ride never left the spawn and the comparison above
  // compared nothing.
  expect(worst.triangles).toBeGreaterThan(predicted.frame.triangles * 0.8);
});

test('GPU objects plateau across twelve sequential generations', async ({ page }) => {
  await boot(page, `level=generated&seed=${WORST_SEED}`);

  const trace = await page.evaluate((seeds) => {
    const game = window.game;
    const original = game.levelPlan;
    game.loop.setRunning(false);
    // Warm up first: the first real frame compiles shaders and uploads the
    // world it booted with, and counting that as growth reports a one-off cost
    // as a leak.
    game.advance(60);
    const baseline = game.resources();

    const rounds: { seed: string; triangles: number; resources: ReturnType<typeof game.resources> }[][] = [];
    for (let round = 0; round < 2; round += 1) {
      const samples = [];
      for (const seed of seeds) {
        // `setLevel` is the real rebuild path — it disposes what it replaces
        // and is what Phase 4 will call when a seed becomes something a player
        // enters. The simulation keeps its original sampler, which is correct
        // for this measurement: a heightfield has no GPU objects.
        const view = game.renderer.setLevel(game.buildLevel('generated', seed));
        // A step and a draw, so the new world is genuinely uploaded rather than
        // merely constructed. An unrendered geometry never reaches info.memory.
        game.advance(2);
        samples.push({ seed, triangles: view.triangles, resources: game.resources() });
      }
      rounds.push(samples);
    }

    // Back to the world the page booted with, which is the strictest claim
    // available: twelve worlds later, the counters are the boot counters.
    game.renderer.setLevel(original);
    game.advance(2);
    return { baseline, rounds, restored: game.resources() };
  }, REGENERATION_SEEDS);

  expect(trace.baseline.lights).toBe(2);

  // Every world was really built, or the comparisons below plateau at zero.
  for (const round of trace.rounds) {
    for (const world of round) expect(world.triangles).toBeGreaterThan(100_000);
  }

  // **The plateau claim, stated correctly.** Worlds differ in which surfaces,
  // block materials and prop parts they contain, and the renderer builds one
  // mesh per kind *present* — so a route that plants no conifers legitimately
  // owns one geometry fewer than one that does, and asserting every world hits
  // the same count would be asserting that every world is the same world.
  // What must not change is the count for a *given* world: build the same six
  // a second time and every counter has to land exactly where it landed first
  // time. Anything a generation leaks accumulates and shows up as round two
  // reading higher than round one.
  for (const [index, second] of trace.rounds[1].entries()) {
    const first = trace.rounds[0][index];
    expect(second.seed).toBe(first.seed);
    expect(
      second.resources,
      `${second.seed} cost more the second time it was generated — `
        + `${JSON.stringify(first.resources)} then ${JSON.stringify(second.resources)}. `
        + 'A generator that leaks a world per seed fails regardless of how cheap '
        + 'each world is.',
    ).toEqual(first.resources);
  }

  expect(
    trace.restored,
    'twelve generations later, rebuilding the world the page booted with did not '
      + 'return the counters to their boot values',
  ).toEqual(trace.baseline);
});

test('a generated route boots inside the budget, generation included', async ({ page }) => {
  // §9: three seconds to playable on a warm cache. Generation is new work at
  // boot — a route is laid, validated, and retried until it passes — so the
  // budget is measured on the *second* load, when the modules are cached and
  // the only variable left is the generator.
  await boot(page, `level=generated&seed=${WORST_SEED}`);

  const started = Date.now();
  await page.goto(`/?level=generated&seed=${WORST_SEED}`);
  await page.waitForFunction(
    () => typeof window.game === 'object'
      && window.game !== null
      && window.game.snapshot().app.state === 'title',
  );
  const bootMs = Date.now() - started;

  expect(await page.evaluate(() => window.game.snapshot().levelPlanId))
    .toBe(`generated-r3-${WORST_SEED}`);
  expect(bootMs, `boot to playable took ${bootMs} ms`).toBeLessThan(3_000);
});

test('the whole Phase 3 surface produces no console errors', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page, `level=generated&seed=${WORST_SEED}`);

  await page.evaluate((seeds) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(60);
    for (const seed of seeds) {
      game.renderer.setLevel(game.buildLevel('generated', seed));
      game.advance(2);
    }
  }, REGENERATION_SEEDS);

  await testInfo.attach('console', { body: errors.join('\n'), contentType: 'text/plain' });
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// M12 Phase 4 — the seed becomes interface
// ---------------------------------------------------------------------------

/**
 * The entrance, walked the way a player walks it.
 *
 * Everything below drives the real DOM — the field is typed into, the buttons
 * are clicked — rather than calling a bridge method that happens to do the same
 * thing. That is deliberate for one flow in particular: the owner's q6 answer
 * says a seed that does not build is **rejected**, and the correct behaviour is
 * that *nothing happens to the world*. A bridge call could report a refusal
 * while the panel silently swapped a level underneath it; only the DOM path can
 * show that it did not.
 *
 * The seed normalisation, the refusal itself, and the record keying are proved
 * headlessly in `src/level/levels.test.ts` and `src/app/records.test.ts` and are
 * not repeated. What only a browser can answer is asked here.
 */

/** A seed known to build, used wherever the identity of the route does not matter. */
const GOOD_SEED = 'ember-quay';
/** A second one, so "two seeds are two places" can be shown rather than assumed. */
const OTHER_SEED = 'slate-ridge';
/** A player-shaped seed whose through line has no jump, for physical routing. */
const PHYSICAL_ROUTE_SEED = 'copper-drift';
const PHYSICAL_ROUTE_IDS = generateLevel(PHYSICAL_ROUTE_SEED).layout.throughIds;
/**
 * A seed that exhausts every attempt and is refused.
 *
 * About one seed in 360 does; this one was found by sweeping 1,100 on
 * 2026-08-08 and is pinned in `src/level/levels.test.ts` with the note that a
 * seed which starts building is the generator having changed, not a test to
 * relax.
 */
const DEAD_SEED = 'route-12';

function world(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.game.snapshot().world);
}

function routeState(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.game.snapshot().route);
}

/** Type a seed into the real field and press the real button. */
async function askForRoute(
  page: import('@playwright/test').Page,
  seed: string,
  action: 'ride-route' | 'trial-route' = 'ride-route',
): Promise<void> {
  await page.locator('#euc-seed').fill(seed);
  await page.locator(`.euc-menu--routes [data-menu="${action}"]`).click();
  // The build is deferred by one frame so the "Building…" line can paint before
  // the main thread goes away. Waiting on the state rather than on a duration
  // keeps this a test of the game and not of how fast this machine is.
  await expect.poll(async () => (await routeState(page)).pending).toBe(false);
}

test('the slice is still the default world, and a fresh route is opt-in', async ({ page }) => {
  // `docs/PLANS.md` §13 q5, first half: *the slice remains the default world*.
  // A new player must land in the tuned, known-good world the published README
  // describes, and must never be given a generated one by accident.
  await bootToTitle(page);

  expect(await world(page)).toMatchObject({ levelId: 'slice', generated: false, seed: '' });
  expect(await page.evaluate(() => window.game.snapshot().levelPlanId)).toBe('m7-slice');

  const title = page.locator('.euc-menu--title');
  await expect(title.locator('[data-menu="start"]')).toHaveClass(/euc-button--primary/);
  await expect(title.locator('[data-menu="routes"]')).toBeVisible();
  await expect(title.locator('[data-menu="routes"]')).not.toHaveClass(/euc-button--primary/);
  await expect(title.locator('[data-menu="world"]')).toContainText('hand-built city');

  // And the panel is a screen the player has to ask for.
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');
  await expect(page.locator('.euc-menu--routes')).toBeHidden();
});

test('a seed typed into the field becomes the world the player is riding', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');
  await expect(page.locator('.euc-menu--routes')).toBeVisible();

  // Typed the way a phone would type it, to prove the field and the link agree
  // about what one seed is.
  await askForRoute(page, 'Ember Quay');

  expect(await world(page)).toMatchObject({
    levelId: 'generated', generated: true, seed: GOOD_SEED,
  });
  expect(await page.evaluate(() => window.game.snapshot().levelPlanId)).toBe(`generated-r3-${GOOD_SEED}`);
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');

  // Seed-forward, in all three places that carry it (§13 q5, second half).
  expect(new URL(page.url()).searchParams.get('seed')).toBe(GOOD_SEED);
  await page.evaluate(() => window.game.setAppState('paused'));
  await expect(page.locator('.euc-menu--pause [data-menu="world"]')).toContainText(GOOD_SEED);
  await page.evaluate(() => window.game.setAppState('title'));
  await expect(page.locator('.euc-menu--title [data-menu="world"]')).toContainText(GOOD_SEED);

  expect(errors).toEqual([]);
});

test('backing out while a route is building cancels the request', async ({ page }) => {
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('#euc-seed').fill(GOOD_SEED);

  // Same task, same event turn: ask for the slowest path and immediately use
  // the panel's real Escape handler. The one-frame loading affordance creates
  // a genuine cancellation window; leaving it must mean leave, not "ride as
  // soon as the synchronous generator gives the main thread back".
  await page.evaluate(() => {
    const ride = document.querySelector<HTMLButtonElement>(
      '.euc-menu--routes [data-menu="ride-route"]',
    );
    if (ride === null) throw new Error('no route button');
    ride.click();
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', bubbles: true, cancelable: true,
    }));
  });

  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');
  await expect.poll(async () => (await routeState(page)).pending).toBe(false);
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');
  expect(await world(page)).toMatchObject({ levelId: 'slice', generated: false, seed: '' });
});

test('a generated time trial composes into a finishable physical ride', async ({ page }) => {
  // 300 s, not the 180 s this shipped with: the two 40k-step rides run
  // synchronously inside one evaluate and their wall-clock scales with suite
  // CPU contention, not with the game. At M13's close (wobble live by
  // default) the ride measured 1.5 min alone and 3.2 min under the full
  // parallel suite — the old budget failed on load, not on behaviour, and a
  // timeout that flakes under contention reports "the route broke" for a
  // machine being busy.
  test.setTimeout(300_000);
  // Teleporting through six trigger volumes proves referee ordering, not that
  // a stitched route can be ridden. Drive a word-seed route from its emitted
  // LevelPlan with the same deliberately ordinary pure-pursuit controller used
  // for the hand-authored course. This seed omits the kicker so the driver does
  // not need privileged knowledge of where to charge a hop.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${PHYSICAL_ROUTE_SEED}`);

  const ridden = await page.evaluate((ids) => {
    window.game.clearRecords();
    const points = window.qa.routePoints(ids, 3);
    const lastId = ids[ids.length - 1];
    const last = window.game.levelPlan.segments.find((segment) => segment.id === lastId);
    if (last === undefined) throw new Error(`no final segment ${String(lastId)}`);
    points.push({
      x: last.exit.position.x + Math.sin(last.exit.headingY) * 10,
      z: last.exit.position.z + Math.cos(last.exit.headingY) * 10,
    });
    window.game.setAppState('freeRide');
    const navigation = window.qa.followRoute(points, {
      lookAhead: 8,
      maxSteps: 40_000,
      throttle: 0.7,
    });

    // The finish gate is inset from the end of the final segment. Once it is
    // crossed, the results screen correctly stops ride input before the
    // follower can reach the synthetic point beyond the segment, so timing
    // and end-to-end navigation are two runs rather than contradictory stop
    // conditions in one run.
    window.game.setAppState('title');
    window.game.startTimeTrial();
    const timed = window.qa.followRoute(points, {
      lookAhead: 8,
      maxSteps: 40_000,
      throttle: 0.7,
    });
    return { navigation, timed, challenge: window.game.snapshot().challenge };
  }, PHYSICAL_ROUTE_IDS);

  expect(ridden.navigation.finished, 'the rider did not reach the end of the generated course')
    .toBe(true);
  expect(ridden.navigation.crashes, 'the generated reference ride should not require recovery')
    .toBe(0);
  expect(ridden.timed.crashes, 'the timed reference ride should not require recovery').toBe(0);
  expect(ridden.challenge.phase, JSON.stringify(ridden)).toBe('finished');
  expect(ridden.challenge.passed).toBe(ridden.challenge.total);
  expect(errors).toEqual([]);
});

test('a seed that does not build is refused, and the world does not move', async ({ page }) => {
  // **The owner's decision, 2026-08-08 (§13, under q6): reject and ask for
  // another — no silent world swap, ever.** The assertion that matters is the
  // negative one: after the refusal the player is on exactly the world they
  // were on, and it is not the hand-authored slice standing in for their seed.
  const errors = collectErrors(page);
  await bootToTitle(page);

  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await askForRoute(page, GOOD_SEED);
  await page.evaluate(() => window.game.setAppState('title'));
  await page.locator('.euc-menu--title [data-menu="routes"]').click();

  const before = await world(page);
  await askForRoute(page, DEAD_SEED);

  expect(await routeState(page)).toMatchObject({ status: 'no-route', seed: DEAD_SEED });
  expect(await world(page), 'the refused seed changed the world').toEqual(before);
  // Still on seed entry, not dropped into a ride and not dismissed.
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');
  await expect(page.locator('.euc-menu--routes')).toBeVisible();
  // Said plainly, and said as a refusal rather than as an apology or an offer.
  const status = page.locator('.euc-menu--routes [data-menu="route-status"]');
  await expect(status).toHaveAttribute('data-tone', 'refused');
  await expect(status).toContainText(DEAD_SEED);
  // The seed is still in the field, because the next thing the player does is
  // edit it.
  await expect(page.locator('#euc-seed')).toHaveValue(DEAD_SEED);

  expect(errors).toEqual([]);
});

test('a link that names a dead seed lands in the city and says so', async ({ page }) => {
  // The same rule at the other entrance. Once the panel writes seeds into the
  // address bar, a link is something one player sends another — so a boot must
  // not quietly present the slice as the route the link promised.
  await bootToTitle(page, `level=generated&seed=${DEAD_SEED}`);

  expect(await world(page)).toMatchObject({ levelId: 'slice', generated: false });
  expect(await routeState(page)).toMatchObject({ status: 'no-route', seed: DEAD_SEED });
  // And the address stops claiming a world the player is not in.
  expect(new URL(page.url()).searchParams.get('seed')).toBe(null);

  // Opening the panel puts the failed seed back in front of them to edit.
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await expect(page.locator('#euc-seed')).toHaveValue(DEAD_SEED);
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toHaveAttribute('data-tone', 'refused');
});

test('a shared link rides the same place the field built', async ({ page }) => {
  // "Shareable" in the only sense that matters: the address the panel produced,
  // opened cold, is the same ground — not a similar route, the same one.
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await askForRoute(page, GOOD_SEED);

  const link = (await world(page)).link;
  const first = await page.evaluate(() => ({
    id: window.game.snapshot().levelPlanId,
    spawn: { ...window.game.levelPlan.spawn.position },
    segments: window.game.levelPlan.segments.length,
    checkpoints: window.game.levelPlan.checkpoints.map((cp) => `${cp.id}@${cp.centre.x},${cp.centre.z}`),
  }));

  await page.goto(link);
  await page.waitForFunction(() => typeof window.game === 'object' && window.game !== null);
  await page.waitForFunction(() => window.game.snapshot().loop.frames > 0);

  const second = await page.evaluate(() => ({
    id: window.game.snapshot().levelPlanId,
    spawn: { ...window.game.levelPlan.spawn.position },
    segments: window.game.levelPlan.segments.length,
    checkpoints: window.game.levelPlan.checkpoints.map((cp) => `${cp.id}@${cp.centre.x},${cp.centre.z}`),
  }));

  expect(second).toEqual(first);
});

test('surprise me hands over a route that builds, spelled the way the field spells it', async ({ page }) => {
  // A pad cannot type, so this is the gamepad's only route to a route — and it
  // is the one affordance the owner's q6 answer allows to skip failing seeds
  // internally, because choosing a different seed is not repair.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();

  await page.locator('.euc-menu--routes [data-menu="surprise"]').click();
  await expect.poll(async () => (await routeState(page)).pending).toBe(false);

  const state = await routeState(page);
  expect(state.status).toBe('ready');
  const loaded = await world(page);
  expect(loaded.generated).toBe(true);
  expect(loaded.seed).toBe(state.seed);
  // The field agrees with the world, so pressing Ride is not a second draw.
  await expect(page.locator('#euc-seed')).toHaveValue(loaded.seed);
  // It stays on the panel: the player still has to choose free ride or timed.
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');

  await page.locator('.euc-menu--routes [data-menu="ride-route"]').click();
  await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');
  expect((await world(page)).seed).toBe(loaded.seed);

  expect(errors).toEqual([]);
});

test('a personal best belongs to its seed, and so does the ghost that races it', async ({ page }) => {
  // A ghost is only comparable against the same ground. This is that sentence
  // as a player experience: set a time on one route, look for it on another,
  // and come back to find it — with a ghost the second attempt can race.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.evaluate(() => window.game.clearRecords());

  const rideTo = async (seed: string) => {
    await page.evaluate(() => window.game.setAppState('title'));
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await askForRoute(page, seed, 'trial-route');
    await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('challenge');
  };

  const runLap = async () => {
    const list = await page.evaluate(() => window.game.levelPlan.checkpoints.map((cp) => ({
      centre: { ...cp.centre }, headingY: cp.headingY,
    })));
    for (const gate of list) {
      await page.evaluate(({ centre, headingY }) => {
        window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
        window.game.advance(2);
      }, gate);
      await page.evaluate(() => window.game.advance(60));
    }
    // The results screen arrives on its own delay; the record is written on the
    // finish frame, before it.
    await page.evaluate(() => window.game.advance(240));
  };

  await rideTo(GOOD_SEED);
  await runLap();
  const firstRecord = await page.evaluate(() => window.game.snapshot().record);
  expect(firstRecord.totalSeconds).not.toBeNull();
  expect(firstRecord.hasGhost).toBe(true);
  // The results screen names the route the time is a time on.
  await expect(page.locator('.euc-menu--results [data-menu="results-notes"]'))
    .toContainText(`Route seed ${GOOD_SEED}`);

  // A different seed is a different set of records — nothing carried over.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await askForRoute(page, OTHER_SEED);
  expect(await page.evaluate(() => window.game.snapshot().record)).toMatchObject({
    totalSeconds: null, hasGhost: false,
  });

  // And coming back finds the time, and a ghost armed against it.
  await rideTo(GOOD_SEED);
  expect(await page.evaluate(() => window.game.snapshot().record)).toMatchObject({
    totalSeconds: firstRecord.totalSeconds, hasGhost: true,
  });
  await page.evaluate(() => window.game.advance(120));
  expect(await page.evaluate(() => window.game.snapshot().challenge.phase)).not.toBe('idle');

  expect(errors).toEqual([]);
});

test('choosing routes through the menu plateaus GPU objects', async ({ page }) => {
  // Invariant 10 across the path a *player* takes, which is not the path
  // `tests/m12.spec.ts` already covers: that one drives `renderer.setLevel`
  // directly, and this one goes through `Game.installLevel`, which also
  // replaces the sampler, the controller and the referee. A leak in any of
  // those three is invisible to the earlier test.
  const errors = collectErrors(page);
  await bootToTitle(page);

  const visit = async (seed: string) => {
    await page.evaluate(() => window.game.setAppState('title'));
    await page.locator('.euc-menu--title [data-menu="routes"]').click();
    await askForRoute(page, seed);
    await page.evaluate(() => window.game.advance(30));
    return page.evaluate(() => window.game.resources());
  };

  // Round one seeds the caches; round two is the measurement. A single
  // baseline would assert every world is the same world, which they are not —
  // the renderer builds one mesh per kind *present*.
  const first = [await visit(GOOD_SEED), await visit(OTHER_SEED), await visit('quarry-pier')];
  const second = [await visit(GOOD_SEED), await visit(OTHER_SEED), await visit('quarry-pier')];
  for (let index = 0; index < first.length; index += 1) {
    expect(second[index], `round two of world ${index} grew`).toEqual(first[index]);
  }

  // And the way back is clean too: the city returns to what booting into it costs.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('.euc-menu--routes [data-menu="ride-city"]').click();
  expect(await world(page)).toMatchObject({ levelId: 'slice', generated: false });
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');

  expect(errors).toEqual([]);
});

test('the keyboard alone can reach a route and leave the panel', async ({ page }) => {
  // Parity, M9's rule: every menu works on a keyboard. The seed field is the
  // one control in the game that a key press must reach *through* the menu
  // layer's own capture-phase handler rather than being intercepted by it.
  const errors = collectErrors(page);
  await bootToTitle(page);
  await page.locator('.euc-menu--title [data-menu="routes"]').click();

  // **Focus lands on Surprise me, not in the field** — changed at M14.5.
  // The field held focus from M12 Phase 4 because a soft keyboard eats the
  // bottom half of a phone and the field had to be above it. What that missed
  // is that opening this panel then raised the keyboard *every time*, on a
  // screen whose whole purpose is to offer a route to somebody who does not
  // want to type one. The status line moved above the field instead, which
  // answers the original argument without the side effect.
  await expect(page.locator('.euc-menu--routes [data-menu="surprise"]')).toBeFocused();

  // Tab reaches the field, and typing works through the capture-phase handler.
  await page.locator('#euc-seed').focus();
  await page.keyboard.type(GOOD_SEED);
  await expect(page.locator('#euc-seed')).toHaveValue(GOOD_SEED);

  // Enter means "ride this one" — the phone's go key and the desk's habit.
  await page.keyboard.press('Enter');
  await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state)).toBe('freeRide');
  expect((await world(page)).seed).toBe(GOOD_SEED);

  // Escape leaves the panel for the title, the same meaning it has everywhere
  // else in the game — including while the caret is in the field.
  await page.evaluate(() => window.game.setAppState('title'));
  await page.locator('.euc-menu--title [data-menu="routes"]').click();
  await page.locator('#euc-seed').focus();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');

  expect(errors).toEqual([]);
});

test('a gamepad alone can reach a route it cannot type', async ({ page }) => {
  // **The seed field is the first control in this game a pad cannot operate**,
  // and it takes focus when the panel opens. Parity therefore is not "the pad
  // can walk the list" — it is that the pad has a complete path to a route, and
  // that pressing A on the control it lands on first does something legible
  // rather than nothing at all.
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'fake standard pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { fakePad: typeof pad }).fakePad = pad;
    navigator.getGamepads = () => [pad] as never;
  });
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

  /** Hold a standard-mapping button for two real frames, then release it. */
  const press = async (button: number) => {
    await page.evaluate(async (index) => {
      const pad = (window as unknown as {
        fakePad: { buttons: { pressed: boolean; value: number }[] };
      }).fakePad;
      const frame = () => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      pad.buttons[index].pressed = true;
      pad.buttons[index].value = 1;
      await frame();
      pad.buttons[index].pressed = false;
      pad.buttons[index].value = 0;
      await frame();
    }, button);
  };

  const DPAD_DOWN = 13;
  const A = 0;
  const B = 1;

  // Down four times from Start ride reaches Fresh route; A opens it. It was
  // twice until M14 put Knockabout between Time trial and here, and three until
  // M18 put Police chase after that — the walk follows the panel's real Tab
  // order, so a menu that grows moves this count and is meant to.
  await page.locator('.euc-menu--title [data-menu="start"]').focus();
  await press(DPAD_DOWN);
  await press(DPAD_DOWN);
  await press(DPAD_DOWN);
  await press(DPAD_DOWN);
  await expect(page.locator('.euc-menu--title [data-menu="routes"]')).toBeFocused();
  await press(A);
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');

  // **Focus lands on Surprise me** — the panel's first control since M14.5,
  // and strictly better parity than the field that used to be there: the pad
  // now opens the screen already on the one control it can operate, and A is a
  // whole route in one press.
  await expect(page.locator('.euc-menu--routes [data-menu="surprise"]')).toBeFocused();
  await press(A);
  await expect.poll(async () => (await routeState(page)).pending).toBe(false);
  expect((await world(page)).generated).toBe(true);

  // The field is still reachable and still says something legible when a pad
  // presses A on it — that is the M12 Phase 4 rule and it has not moved. It
  // names Surprise me, which is the one thing a pad player can do about it.
  await page.locator('#euc-seed').focus();
  await page.evaluate(() => { (document.querySelector('#euc-seed') as HTMLInputElement).value = ''; });
  await press(A);
  await expect.poll(async () => (await routeState(page)).status).toBe('blank');
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toContainText('Surprise me');

  // B leaves the panel, the third door out alongside Escape and the Back button.
  await press(B);
  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('title');

  expect(errors).toEqual([]);
});
