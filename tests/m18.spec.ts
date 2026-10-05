/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';
import { AUDIO, CHASE, PADDLE } from '../src/data/tuning.ts';

/**
 * M18 — the police chase, in a real browser.
 *
 * The milestone's gate is the owner's and cannot be automated: *is being chased
 * fun, and is losing to him ever unfair?* What can be automated is everything
 * that question rests on, and four of the claims below can only be made here:
 *
 *   1. **That the cop is actually drawn, and that the ghost is not drawn with
 *      him.** The render budget's whole arithmetic depends on the two being
 *      alternatives (`render/renderCost.ts` reserves the worse of the two
 *      rather than their sum), and the thing that makes it true is one slot in
 *      the renderer. A slot is a runtime fact; only a browser has one.
 *   2. **That a second `EucController` really is a second rider.** Headlessly
 *      the cop is a pose; here he is a rig in a scene graph, posed from that
 *      pose every frame, and the two could silently part company.
 *   3. **That the entrance refuses the worlds it says it refuses**, through the
 *      same menu a player clicks rather than through the bridge.
 *   4. **That a first-session Chase choice survives its Fresh route detour.**
 *      A generated-route boot bypasses that handoff entirely, so it can stay
 *      green while the advertised cold-start entrance becomes Free Ride.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** A seed the pinned census says is dense, so the cop has a real route. */
const SEED = 'route-41';

/** Boot straight onto a generated route and start a chase through the bridge. */
/**
 * 2026-10-04: `frozen` stops the loop in the task that enters the chase
 * (entering a mode re-runs `updateRunning`, so an earlier freeze does not
 * hold). Left live, the pursuit runs on wall-clock time between this and the
 * test's first read — on the environment upgrade's heavier frames on a loaded
 * machine, long enough for the tail to close before a "he starts back there"
 * read.
 */
async function bootChase(page: import('@playwright/test').Page, { frozen = false } = {}): Promise<void> {
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate((freeze) => {
    window.game.startChase();
    if (freeze) window.game.loop.setRunning(false);
  }, frozen);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  await page.waitForFunction(() => window.game.snapshot().hud.chase !== '');
}

test('the hand-built city refuses a chase and says what the mode needs', async ({ page }) => {
  // The entrance is always on the title screen (§13 q13's rule, inherited by
  // q26): a control that appears and disappears is a mode nobody learns exists.
  // What it does on a world that cannot host one is name the fix.
  const errors = collectErrors(page);
  await bootToTitle(page);

  expect(await page.evaluate(() => window.game.snapshot().chase.available)).toBe(false);

  await page.locator('.euc-menu--title [data-menu="chase"]').click();
  await expect(page.locator('.euc-menu--routes')).toBeVisible();
  await expect(page.locator('.euc-menu--routes [data-menu="route-status"]'))
    .toContainText('chase needs a generated route');
  await expect(page.locator('.euc-menu--routes [data-menu="ride-route"]'))
    .toHaveText('Start the chase on this route');
  await expect(page.locator('.euc-menu--routes [data-menu="trial-route"]')).toBeHidden();

  expect(await page.evaluate(() => window.game.snapshot().app.state)).toBe('routes');
  expect(errors).toEqual([]);
});

test('a cold-start Police Chase choice survives Surprise me and starts the mode', async ({ page }) => {
  // Regression for the owner's exact first-session path. The hand-built city
  // sends Chase through Fresh route; that deferred world swap must carry the
  // chosen mode instead of quietly falling back to the route chooser or Free
  // Ride, which made only the second title-screen attempt produce the cop.
  const errors = collectErrors(page);
  await bootToTitle(page);

  await page.locator('.euc-menu--title [data-menu="chase"]').click();
  await expect(page.locator('.euc-menu--routes')).toBeVisible();

  // `Math.random() === 0` spells amber-arch. Pinning a known-good route keeps
  // this a state-machine regression rather than a survey of random generation.
  await page.evaluate(() => {
    Math.random = () => 0;
  });
  await page.locator('.euc-menu--routes [data-menu="surprise"]').click();

  await expect.poll(async () => page.evaluate(() => window.game.snapshot().app.state))
    .toBe('chase');
  await expect.poll(async () => page.evaluate(() => window.game.snapshot().hud.chase))
    .not.toBe('');

  const snapshot = await page.evaluate(() => window.game.snapshot());
  expect(snapshot.world).toMatchObject({ generated: true, seed: 'amber-arch' });
  expect(snapshot.chase.phase).toBe('running');
  expect(snapshot.chase.secondRider).toBe('cop');
  expect(errors).toEqual([]);
});

test('a generated route hosts a chase, and the cop rides it', async ({ page }) => {
  const errors = collectErrors(page);
  // 2026-10-04: frozen at the entrance — the start gap is read at GO, not
  // after however much wall-clock time the machine took to reach the read.
  await bootChase(page, { frozen: true });

  const ridden = await page.evaluate(() => {
    const game = window.game;
    const start = game.snapshot();
    // Ride away from him for a few seconds. Full throttle and no steering: the
    // point is that *he* moves and closes, not that the player rides well.
    game.setActions({ throttle: 1 });
    game.advance(600);
    const after = game.snapshot();
    return {
      startGap: start.chase.copGap,
      gap: after.chase.copGap,
      phase: after.chase.phase,
      remaining: after.chase.remaining,
      copMoved: after.chase.copGap !== start.chase.copGap,
      secondRider: after.chase.secondRider,
      // The rig itself, read out of the scene graph by name.
      copInScene: document.title !== '' && (() => {
        const scene = game.renderer.scene;
        const root = scene.getObjectByName('cop-rider');
        return root !== undefined && root.visible;
      })(),
    };
  });

  // He starts the spawn gap behind and is riding by the end of it.
  expect(ridden.startGap).toBeGreaterThan(CHASE.spawnGapMetres * 0.5);
  expect(ridden.copMoved).toBe(true);
  expect(ridden.phase).toBe('running');
  expect(ridden.remaining).toBeLessThan(CHASE.escapeSeconds);
  expect(ridden.secondRider).toBe('cop');
  expect(ridden.copInScene).toBe(true);
  // This corner is shared with Knockabout. The value was correctly changed to
  // the escape clock in M18 while its static label stayed "Targets", which made
  // the live mode describe the wrong objective despite every simulation test
  // passing.
  await expect(page.locator('[data-hud="score-label"]')).toHaveText('Survive');
  expect(errors).toEqual([]);
});

test('a stopped rider remains the quarry instead of being left to chase the cop', async ({ page }) => {
  // The adversarial pursuit case the original Phase 1 gate omitted. Riding all
  // 48 routes alone proved a competent racer; it said nothing about what
  // happens after the cop reaches the rider. The shipped first pass copied the
  // rider's lateral line only while they were ahead, passed a stopped rider,
  // and continued to the route end.
  const errors = collectErrors(page);
  await bootChase(page);

  const pursuit = await page.evaluate(({ swingRange, bustRadius }) => {
    const game = window.game;
    game.clearActions();
    let closest = Infinity;
    let finalGap = game.snapshot().chase.copGap;
    for (let chunk = 0; chunk < 240; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      finalGap = snapshot.chase.copGap;
      closest = Math.min(closest, finalGap);
      if (snapshot.app.state === 'results') break;
    }
    const snapshot = game.snapshot();
    return {
      closest,
      finalGap,
      state: snapshot.app.state,
      outcome: snapshot.chase.outcome,
      reached: closest <= swingRange,
      stillPursuing: finalGap <= bustRadius || snapshot.chase.outcome === 'caught',
    };
  }, { swingRange: CHASE.swingRangeMetres, bustRadius: CHASE.bustRadiusMetres });

  expect(pursuit.reached).toBe(true);
  expect(pursuit.stillPursuing).toBe(true);
  expect(errors).toEqual([]);
});

test('the second-rider slot holds one rider, never two', async ({ page }) => {
  // The assertion the render budget rests on. `NON_LEVEL_RESERVE` reserves the
  // worse of the ghost frame and the cop frame rather than their sum, and on
  // the densest known route the sum does not fit the §9 ceiling — so "they
  // never coexist" has to be a fact about the code rather than a convention.
  const errors = collectErrors(page);
  await bootChase(page);

  const slots = await page.evaluate(() => {
    const game = window.game;
    const seen: string[] = [];
    const both = (): { ghost: boolean; cop: boolean } => {
      const scene = game.renderer.scene;
      return {
        ghost: scene.getObjectByName('ghost-rider')?.visible === true,
        cop: scene.getObjectByName('cop-rider')?.visible === true,
      };
    };

    game.advance(30);
    seen.push(game.renderer.secondRiderShown);
    const during = both();

    // Ask for the ghost while the cop is up. One slot: the cop must go.
    game.renderer.setGhostVisible(true);
    const afterGhost = both();
    seen.push(game.renderer.secondRiderShown);

    game.renderer.setCopVisible(true);
    const afterCop = both();
    seen.push(game.renderer.secondRiderShown);

    return { seen, during, afterGhost, afterCop };
  });

  expect(slots.seen).toEqual(['cop', 'ghost', 'cop']);
  expect(slots.during).toEqual({ ghost: false, cop: true });
  expect(slots.afterGhost).toEqual({ ghost: true, cop: false });
  expect(slots.afterCop).toEqual({ ghost: false, cop: true });
  expect(errors).toEqual([]);
});

test('the drawn cop stands where the simulated cop is', async ({ page }) => {
  // The claim only a browser can make: he is posed from a controller pose every
  // frame, the way the player's rig is. A rig that stopped being updated would
  // sit at the origin while the chase carried on behind the camera.
  const errors = collectErrors(page);
  await bootChase(page);

  const placed = await page.evaluate(() => {
    const game = window.game;
    game.setActions({ throttle: 1 });
    game.advance(420);
    const root = game.renderer.scene.getObjectByName('cop-rider');
    const rig = root?.getObjectByName('cop-riding-rig');
    rig?.updateWorldMatrix(true, false);
    const rider = game.snapshot().euc.position;
    return {
      rig: rig === undefined ? null : { x: rig.position.x, y: rig.position.y, z: rig.position.z },
      rider,
      // **The tail's own gap, not `copGap`** — M39 Part P (§39.6b.3). `copGap`
      // became the nearest *standing* cop of three, parked patrols included,
      // so on a ride past a post it can be a patrol's distance while
      // `cop-rider` is still the tail. The rig under test is the tail's.
      gap: game.snapshot().chase.pursuers[0].gap,
    };
  });

  expect(placed.rig).not.toBeNull();
  const rig = placed.rig!;
  // The rig is somewhere real, and it is within the reported gap of the rider —
  // one comparison that fails for both of the ways this can break: a rig left
  // at the origin, and a `copGap` computed from a pose nobody drew.
  const distance = Math.hypot(rig.x - placed.rider.x, rig.z - placed.rider.z);
  expect(distance).toBeLessThan(placed.gap + 2);
  expect(distance).toBeGreaterThan(placed.gap - 2);
  expect(errors).toEqual([]);
});

test('riding into the surround runs the boundary out and busts the run', async ({ page }) => {
  // §13 q27, "not cheatable by going far off road". The strategy the boundary
  // exists to refuse is precisely this one: point away from the route and hold
  // throttle until the clock runs out.
  const errors = collectErrors(page);
  await bootChase(page);

  const strayed = await page.evaluate(async ({ limit, grace }) => {
    const game = window.game;
    // **Teleported rather than ridden out there**, and deliberately: what is
    // under test is the boundary, not the ninety seconds of riding it takes to
    // reach it. Riding out also ends the run for the *other* reason half the
    // time — a rider ploughing across a surround at full throttle crashes into
    // the dressing with the cop still on them, which is a bust rather than a
    // stray and would make this spec measure something else on some seeds.
    const start = game.snapshot().euc;
    const away = limit * 2.5;
    const x = start.position.x + Math.cos(start.headingY) * away;
    const z = start.position.z - Math.sin(start.headingY) * away;
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, start.headingY);
    game.clearActions();

    let sawWarning = false;
    let sawObjective = false;
    let sawCountdown = '';
    for (let chunk = 0; chunk < 200; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      if (snapshot.chase.straying) sawWarning = true;
      // **The words moved to their own panel at M20** and the objective line
      // deliberately goes quiet underneath it: the owner's §4.4 report was that
      // this sentence, as one line of body text, was too subtle to notice while
      // riding. What this spec is claiming is unchanged — that the player is
      // *told* — so it reads the cue that now carries the telling.
      if (snapshot.hud.stray.visible
        && snapshot.hud.stray.label.includes('Back to the route')) sawObjective = true;
      if (snapshot.hud.stray.visible && sawCountdown === '') {
        sawCountdown = snapshot.hud.stray.seconds;
      }
      if (snapshot.chase.phase !== 'running') {
        return {
          outcome: snapshot.chase.outcome,
          sawWarning,
          sawObjective,
          sawCountdown,
          offRoute: snapshot.chase.offRoute,
          limit,
          grace,
        };
      }
    }
    const end = game.snapshot();
    return {
      outcome: end.chase.outcome,
      sawWarning,
      sawObjective,
      sawCountdown,
      offRoute: end.chase.offRoute,
      limit,
      grace,
    };
  }, { limit: CHASE.strayLimitMetres, grace: CHASE.strayGraceSeconds });

  expect(strayed.offRoute).toBeGreaterThan(CHASE.strayLimitMetres);
  expect(strayed.sawWarning).toBe(true);
  expect(strayed.sawObjective).toBe(true);
  // And the countdown that made it fair (§4.4): a whole number of seconds, on
  // screen, inside the grace the rule actually keeps.
  expect(Number(strayed.sawCountdown)).toBeGreaterThan(0);
  expect(Number(strayed.sawCountdown)).toBeLessThanOrEqual(CHASE.strayGraceSeconds);
  expect(strayed.outcome).toBe('strayed');
  expect(errors).toEqual([]);
});

test('camping off the road inside the stray limit brings the cop across the grass', async ({ page }) => {
  // The owner's own first-ride exploit, as a fixture. The stray rule busts a
  // rider who goes *far*; between the road's edge and that limit there was a
  // band where standing still was safe — the cop chased along the tarmac
  // below and would not step onto the verge. The field pursuit is the fix,
  // and the browser is where the whole of it can be watched at once: brain,
  // controller, paddle and referee.
  const errors = collectErrors(page);
  await bootChase(page);

  const camped = await page.evaluate(({ limit, swingRange }) => {
    const game = window.game;
    // Half the stray limit off the route: far enough that reaching the rider
    // means leaving the road, near enough that the stray rule never fires.
    const start = game.snapshot().euc;
    const away = limit * 0.5;
    const x = start.position.x + Math.cos(start.headingY) * away;
    const z = start.position.z - Math.sin(start.headingY) * away;
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, start.headingY);
    game.clearActions();

    let closest = Infinity;
    let sawWarning = false;
    for (let chunk = 0; chunk < 400; chunk += 1) {
      game.advance(15);
      const snapshot = game.snapshot();
      closest = Math.min(closest, snapshot.chase.copGap);
      if (snapshot.chase.straying) sawWarning = true;
      if (snapshot.app.state === 'results') break;
    }
    const end = game.snapshot();
    return {
      closest,
      reached: closest <= swingRange,
      sawWarning,
      outcome: end.chase.outcome,
    };
  }, { limit: CHASE.strayLimitMetres, swingRange: CHASE.swingRangeMetres });

  // He came across the grass all the way to swing range — a cop who will not
  // leave the tarmac can get no closer than the rider's own off-route
  // distance minus the road's half width.
  expect(camped.reached).toBe(true);
  // The rider never neared the limit, so the boundary must not have fired.
  expect(camped.sawWarning).toBe(false);
  // Standing still under a paddle is not safe: the run either was still being
  // pressured or ended as a bust. It must never end as a stray from here.
  expect(['none', 'caught']).toContain(camped.outcome);
  expect(errors).toEqual([]);
});

test('the cop mirrors his swing when the rider is beside his left shoulder', async ({ page }) => {
  // Owner field report: the cop could stand close enough to swing forever from
  // some angles without landing one. This is the rendered integration boundary
  // behind that symptom — actual Game placement, production brain, cop paddle,
  // rider target and the hit event — rather than a second collision model in
  // the spec. TypeScript private is deliberately only compile-time here; these
  // two live objects are read as diagnostics and never mutated.
  const errors = collectErrors(page);
  // 2026-10-04: frozen from the chase's first step, so the cop's pose when the
  // rider is stood beside him is the same every run. Left live, the wall-clock
  // gap between the entrance and this fixture moved him along a street that a
  // living-world service vehicle now works, and the run read whichever pose
  // the machine's load happened to leave him in.
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    // Entering the chase re-runs `updateRunning`, so the freeze follows it in
    // the same task.
    window.game.startChase();
    window.game.loop.setRunning(false);
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');

  const struck = await page.evaluate(({ reach, swingRange }) => {
    const game = window.game;
    const internal = game as unknown as {
      readonly copCurrent: { x: number; y: number; z: number; headingY: number };
      readonly copPaddle: { readonly swingSide: 'right' | 'left' };
    };
    game.advance(1);
    // 2026-10-04: a seat placement is now refused where it would overlap a CPU
    // cop's or an NPC's occupancy prism (MI-1; `Game.placeRider` throws
    // "occupied by the living world"). Exactly `PADDLE.reach` off his left
    // shoulder overlaps the cop himself, and a living-world service vehicle
    // works the street beside route-41's cop post (measured blocking 2–3 m
    // out). Stand the rider at the first clear spot on the same bearing, at
    // most 0.6 m beyond the paddle's reach and well inside swing range,
    // stepping the chase on a few frames if the vehicle is in the way.
    let placedAt: number | null = null;
    for (let attempt = 0; attempt < 8 && placedAt === null; attempt += 1) {
      const cop = internal.copCurrent;
      const targetBearing = cop.headingY + Math.PI / 4;
      for (let distance = reach; distance <= reach + 0.6 + 1e-9 && placedAt === null; distance += 0.05) {
        const x = cop.x + Math.sin(targetBearing) * distance;
        const z = cop.z + Math.cos(targetBearing) * distance;
        const ground = game.sampleGround(x, z);
        try {
          game.placeRider({ x, y: ground.height, z }, cop.headingY);
          placedAt = distance;
        } catch (error) {
          if (!String(error).includes('occupied by the living world')) throw error;
        }
      }
      if (placedAt === null) game.advance(15);
    }
    if (placedAt === null || placedAt >= swingRange) {
      throw new Error(`no clear spot beside the cop's left shoulder within ${reach + 0.6} m`);
    }
    game.clearActions();

    const before = game.snapshot().audio.played.hit;
    let sawLeftSwing = false;
    for (let step = 0; step < 120; step += 1) {
      game.advance(1);
      sawLeftSwing ||= internal.copPaddle.swingSide === 'left';
      const hits = game.snapshot().audio.played.hit - before;
      if (hits > 0) return { hits, sawLeftSwing, gap: game.snapshot().chase.copGap, placedAt };
    }
    return {
      hits: game.snapshot().audio.played.hit - before,
      sawLeftSwing,
      gap: game.snapshot().chase.copGap,
      placedAt,
    };
  }, { reach: PADDLE.reach, swingRange: CHASE.swingRangeMetres });

  expect(struck.sawLeftSwing, `rider stood ${struck.placedAt} m off his left shoulder`).toBe(true);
  expect(struck.hits).toBeGreaterThan(0);
  expect(struck.gap).toBeLessThan(CHASE.swingRangeMetres);
  expect(errors).toEqual([]);
});

test('the results card names the outcome and the mode keeps its own best', async ({ page }) => {
  const errors = collectErrors(page);
  await bootChase(page);

  const finished = await page.evaluate(async () => {
    const game = window.game;
    // Shorten the clock rather than riding five real minutes: the tunable is
    // the shipped one, and the mode reads it at `arm`.
    game.tuning.set('CHASE.escapeSeconds', 30);
    game.startChase();
    game.setActions({ throttle: 0.6 });
    for (let chunk = 0; chunk < 300; chunk += 1) {
      game.advance(30);
      if (game.snapshot().app.state === 'results') break;
    }
    const snapshot = game.snapshot();
    return {
      state: snapshot.app.state,
      outcome: snapshot.chase.outcome,
      best: snapshot.chase.best,
      bestEscaped: snapshot.chase.bestEscaped,
    };
  });

  expect(finished.state).toBe('results');
  // Either ending is a legitimate result of a scripted ride; what must hold is
  // that the run *ended*, that it was filed, and that the card says which.
  expect(['escaped', 'caught', 'strayed']).toContain(finished.outcome);
  expect(finished.best).not.toBeNull();

  const heading = await page.locator('.euc-menu--results [data-menu="results-heading"]').textContent();
  expect(['Escaped', 'Escaped — new record', 'Busted', 'Out of bounds']).toContain(heading?.trim());

  // A chase best is not a lap time and must never be filed as one: the timed
  // run's own record for this world is still empty.
  const timed = await page.evaluate(() => window.game.snapshot().record.totalSeconds);
  expect(timed).toBeNull();
  expect(errors).toEqual([]);
});

test('the tracker refuses an overlapping regroup, then returns safely when the route has room', async ({ page }) => {
  // The super tracker, M20.2 — the owner's "i can still loose him easily by
  // getting far away from him… the mode is about the tension, not freeriding".
  // Two equal wheels can never honestly re-close a stretched gap, so the
  // referee demands a regroup and `Game.regroupCop` puts him back on the route
  // behind the rider, at speed. Staged with the shipped tunables at their F4
  // extremes rather than by riding minutes of real route: the cop spawns 80 m
  // back with the trigger at 60 m, so the opening IS a blown-out gap, and the
  // first build's proof accidentally exposed a worse defect: at the route
  // start, sampling 30 m behind clamps to the start and put the cop 1.1 m from
  // the rider. Its assertion treated any large gap reduction as success. Pin
  // both halves now: no overlap at the start, and a real return once the
  // rider is placed far enough along the same route.
  const errors = collectErrors(page);
  await bootChase(page);

  const tracked = await page.evaluate(async () => {
    const game = window.game;
    game.tuning.set('CHASE.spawnGapMetres', 80);
    game.tuning.set('CHASE.trackerGapMetres', 60);
    game.tuning.set('CHASE.trackerReturnMetres', 30);
    game.tuning.set('CHASE.trackerHoldSeconds', 1);
    game.startChase();

    // **The tail's own gap throughout** — M39 Part P. The regroup is the
    // tail's (`regroupTail`); `copGap` is now the nearest standing cop of
    // three, and a rider placed at a checkpoint can land inside a parked
    // patrol's reach, which would read as a "snap" that no return made.
    const tailGap = (): number => game.snapshot().chase.pursuers[0].gap;
    const startGaps: number[] = [];
    for (let chunk = 0; chunk < 8; chunk += 1) {
      game.advance(30);
      startGaps.push(tailGap());
    }

    // Start a clean run, then place the rider at a real route checkpoint. The
    // tracker owns re-acquisition rather than the journey to the fixture, so a
    // deterministic bridge placement isolates the composition rule.
    game.startChase();
    const plan = game.buildLevel('generated', game.snapshot().world.seed);
    const checkpoint = plan.checkpoints[0];
    const ground = game.sampleGround(checkpoint.centre.x, checkpoint.centre.z);
    game.placeRider(
      { x: checkpoint.centre.x, y: ground.height, z: checkpoint.centre.z },
      checkpoint.headingY,
    );

    const placedGaps: number[] = [];
    let snapped = false;
    let gapAfterSnap = Infinity;
    for (let chunk = 0; chunk < 20; chunk += 1) {
      game.advance(30);
      const gap = tailGap();
      const previous = placedGaps[placedGaps.length - 1];
      placedGaps.push(gap);
      if (previous !== undefined && previous - gap > 20) {
        snapped = true;
        gapAfterSnap = gap;
        break;
      }
    }
    return { startGaps, snapped, gapAfterSnap, tailReturns: game.snapshot().chase.demands.tailReturns };
  });

  // The opening really was beyond the trigger, and nothing collapsed onto the
  // rider's own position. Since M39 r6's Codex QA a town's line is a closed
  // ring, so a rider at the start has real road behind them — the return
  // climb — and the tracker may legitimately bring the cop back there; it
  // must still land outside the bust radius. The open-route start clamp the
  // first build blessed is refused headless (`copRegroup.test.ts`).
  expect(tracked.startGaps[0]).toBeGreaterThan(60);
  expect(Math.min(...tracked.startGaps)).toBeGreaterThan(CHASE.bustRadiusMetres);
  // With real route behind the rider, the regroup fires at a safe separation.
  expect(tracked.snapped).toBe(true);
  // And the snap was a return the referee demanded and Game placed, which is
  // what the demand counter says since M39 Part P — not a patrol waking.
  expect(tracked.tailReturns).toBeGreaterThanOrEqual(1);
  expect(tracked.gapAfterSnap).toBeGreaterThan(CHASE.bustRadiusMetres);
  expect(tracked.gapAfterSnap).toBeGreaterThan(25);
  expect(tracked.gapAfterSnap).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test('the chase probe puts a cop on the road with no rules attached', async ({ page }) => {
  // Phase 2's owner gate: ride behind him and look at him, before the mode
  // exists to be ridden. It changes nothing about the world, so unlike the
  // hazard and target probes it does not refuse records.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}&chaseprobe=1`);

  const probed = await page.evaluate(() => {
    const game = window.game;
    game.setAppState('freeRide');
    const before = game.snapshot().chase.copGap;
    game.setActions({ throttle: 1 });
    game.advance(600);
    const after = game.snapshot();
    return {
      before,
      gap: after.chase.copGap,
      phase: after.chase.phase,
      state: after.app.state,
      secondRider: after.chase.secondRider,
      // The probe must not refuse records — it changes no world.
      hudChase: after.hud.chase,
    };
  });

  expect(probed.state).toBe('freeRide');
  // He is riding, and the chase's rules are not.
  expect(probed.phase).toBe('idle');
  expect(probed.gap).not.toBe(probed.before);
  expect(probed.secondRider).toBe('cop');
  // No mode, so no lane: the probe is a look at a rider, not a run.
  expect(probed.hudChase).toBe('');
  expect(errors).toEqual([]);
});

test('the siren follows the cop, and only while the pursuit is live', async ({ page }) => {
  // The audio model runs whether or not a context is armed — the engine's own
  // design promise — so a spec can watch the siren as arithmetic without ever
  // owning a microphone. What only a browser can prove is the *wiring*: that
  // `Game.updateAudio` actually hands the chase's range to the director.
  const errors = collectErrors(page);
  // 2026-10-04: frozen in the task that enters the chase (entering a mode
  // re-runs `updateRunning`, so the freeze follows it), so no wall-clock time
  // passes between the start and the first sample below.
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    window.game.startChase();
    window.game.loop.setRunning(false);
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  await page.waitForFunction(() => window.game.snapshot().hud.chase !== '');

  const watched = await page.evaluate(() => {
    const game = window.game;
    // 2026-10-04: frozen at the entrance (above) and sampled every 60 steps
    // rather than every 300. Left live, the chase ran on by wall-clock time
    // between the entrance and this call — on the environment upgrade's
    // heavier frames on a loaded machine, far enough that the tail reached the
    // standing rider inside the first 300-step block: the run had ended before
    // any sample was taken and the closest gap read Infinity. The minute
    // watched is the same; only the reading is finer.
    game.loop.setRunning(false);
    game.clearActions();
    const atStart = game.snapshot().audio.sirenGain;

    // Stand still and let him come. Sampled along the way, because the run
    // may end in a bust before the last sample — which is itself the fade
    // half of the claim.
    let peak = 0;
    let peakRate = 1;
    let closestGap = Infinity;
    let sirenWhileFar = 0;
    for (let round = 0; round < 60; round += 1) {
      game.advance(60);
      const snap = game.snapshot();
      if (snap.chase.phase !== 'running') break;
      if (snap.audio.sirenGain > peak) {
        peak = snap.audio.sirenGain;
        peakRate = snap.audio.sirenRate;
      }
      closestGap = Math.min(closestGap, snap.chase.copGap);
      if (snap.chase.copGap > 70) {
        sirenWhileFar = Math.max(sirenWhileFar, snap.audio.sirenGain);
      }
    }
    const end = game.snapshot();
    return {
      atStart,
      peak,
      peakRate,
      closestGap,
      sirenWhileFar,
      endPhase: end.chase.phase,
      endSiren: end.audio.sirenGain,
    };
  });

  // He closed, and the siren rose with him.
  expect(watched.closestGap).toBeLessThan(30);
  expect(watched.peak).toBeGreaterThan(0.02);
  // Beyond the onset range it contributed nothing.
  expect(watched.sirenWhileFar).toBe(0);
  // The Doppler lean stays inside its cap — a detuned siren is an alarm bell.
  expect(watched.peakRate).toBeGreaterThan(0.96);
  expect(watched.peakRate).toBeLessThan(1.04);
  // However the minute ended — still running, or busted by the strike on a
  // standing rider — the siren's answer is consistent with it: a live pursuit
  // keeps a live siren; an ended one is fading through the release.
  if (watched.endPhase !== 'running') {
    expect(watched.endSiren).toBeLessThanOrEqual(watched.peak);
  } else {
    expect(watched.endSiren).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('the siren reaches the real output bus and obeys mute', async ({ page }) => {
  // The model-level chase spec above can stay green if a gain is disconnected.
  // Park the wheel so the siren is the only sustained signal, then read the
  // analyser downstream of the master bus: this is audible output, not intent.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);

  // Arm Web Audio with a trusted gesture while the title still owns input, so
  // the key cannot move the rider or contaminate the parked baseline.
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

  const measured = await page.evaluate(async () => {
    window.qa.freeze();
    const idle = await window.qa.audioOutputMax(220, 3);
    window.game.startChase();
    window.game.clearActions();

    let peakModel = 0;
    let closest = Number.POSITIVE_INFINITY;
    for (let round = 0; round < 20; round += 1) {
      window.game.advance(120);
      const snapshot = window.game.snapshot();
      peakModel = Math.max(peakModel, snapshot.audio.sirenGain);
      closest = Math.min(closest, snapshot.chase.copGap);
      if (peakModel > 0.12 || snapshot.chase.phase !== 'running') break;
    }

    const audible = await window.qa.audioOutputMax(250, 6);
    window.game.setMuted(true);
    // A regular reading after the parameter glide settles, rather than a peak
    // hold that would deliberately retain the pre-mute signal.
    const muted = await window.qa.audioOutput(320);
    window.game.setMuted(false);
    const restored = await window.qa.audioOutputMax(250, 4);
    return { idle, peakModel, closest, audible, muted, restored };
  });

  expect(measured.idle).toBeLessThan(0.002);
  expect(measured.closest).toBeLessThan(30);
  expect(measured.peakModel).toBeGreaterThan(0.05);
  expect(measured.audible).toBeGreaterThan(0.005);
  expect(measured.muted).toBeLessThan(1e-4);
  expect(measured.restored).toBeGreaterThan(0.005);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// M39 Part P — the solo face: one outlaw against a pack of three
// ---------------------------------------------------------------------------

/**
 * **The pack, as a browser proves it** (`docs/PLANS.md` §39.6b.3, q206–q209).
 *
 * The referee's arithmetic over N outlaws and M pursuers is headless
 * (`simulation/chase.test.ts`, `copPack.test.ts`, the bench). What only a
 * browser can say is the composition: three controllers stepped by one loop,
 * three trims in the one second-rider slot, each drawn where his own pose is,
 * the wake and the bust reaching the real referee through Game's step, and the
 * card and the record store agreeing about which force a run was ridden
 * against. The bridge fields these read are Game's (`snapshot().chase.pursuers`,
 * `posts`, `force`, `copsProbe`, `bustedBy`, `demands`).
 */

/** The pursuer poses Game holds privately — read as diagnostics, never written. */
interface PackInternals {
  readonly pursuers: readonly { readonly current: { x: number; z: number; headingY: number } }[];
}

/**
 * Stand the rider `metres` from patrol `index`, still, inside his wake range,
 * and step until he leaves his post or the run ends. The solo builder's
 * measured recipe: 40 m ahead of a parked patrol wakes him on proximity.
 */
async function standBeforePatrol(
  page: import('@playwright/test').Page,
  index: number,
  metres: number,
): Promise<{ wakeGap: number; wokeAtChunk: number; wakes: number }> {
  return page.evaluate(({ at, reach }) => {
    const game = window.game;
    const internal = game as unknown as PackInternals;
    const cop = internal.pursuers[at].current;
    const x = cop.x + Math.sin(cop.headingY) * reach;
    const z = cop.z + Math.cos(cop.headingY) * reach;
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, cop.headingY + Math.PI);
    game.clearActions();
    for (let chunk = 0; chunk < 80; chunk += 1) {
      game.advance(3);
      const snapshot = game.snapshot();
      const patrol = snapshot.chase.pursuers[at];
      if (!patrol.parked) {
        return { wakeGap: patrol.gap, wokeAtChunk: chunk, wakes: snapshot.chase.demands.proximityWakes };
      }
      if (snapshot.chase.phase !== 'running') break;
    }
    const snapshot = game.snapshot();
    return { wakeGap: Infinity, wokeAtChunk: -1, wakes: snapshot.chase.demands.proximityWakes };
  }, { at: index, reach: metres });
}

test('the solo chase rides three cops: a tail and two patrols at their posts, each drawn where he is', async ({ page }) => {
  // q207: one human is three CPU cops (`cpuPackSize(1, false)`). The tail
  // starts 20 m behind as M18's one cop did; the patrols stand at posts on the
  // town ring, parked, until the referee wakes them (§39.6b.3).
  const errors = collectErrors(page);
  await bootChase(page);

  const pack = await page.evaluate(() => {
    const game = window.game;
    game.advance(60);
    const chase = game.snapshot().chase;
    const scene = game.renderer.scene;
    const drawn = (['cop-rider', 'cop2-rider', 'cop3-rider'] as const).map((name, index) => {
      const root = scene.getObjectByName(name);
      const rigName = index === 0 ? 'cop-riding-rig' : `cop${index + 1}-riding-rig`;
      const rig = root?.getObjectByName(rigName);
      rig?.updateWorldMatrix(true, false);
      const m = rig?.matrixWorld.elements;
      return {
        visible: root?.visible === true,
        at: m === undefined ? null : { x: m[12], z: m[14] },
      };
    });
    return {
      force: chase.force,
      probe: chase.copsProbe,
      posts: chase.posts,
      second: chase.secondRider,
      slot: game.renderer.secondRiderShown,
      pursuers: chase.pursuers.map((p) => ({
        role: p.role, phase: p.phase, parked: p.parked, crashed: p.crashed, x: p.x, z: p.z, gap: p.gap,
      })),
      copGap: chase.copGap,
      drawn,
    };
  });

  expect(pack.force, 'the shipped chase is not the three-cop chase').toBe(3);
  expect(pack.probe).toBeNull();
  expect(pack.pursuers.map((p) => p.role)).toEqual(['tail', 'patrol', 'patrol']);
  // route-41 is a town with a ring, so both patrols have a post (q206); the
  // echelon fallback would put them behind the tail, unparked.
  expect(pack.posts).toBe('ring');
  expect(pack.pursuers[0].parked).toBe(false);
  expect(pack.pursuers[1].parked && pack.pursuers[2].parked, 'a patrol left his post unprompted').toBe(true);
  expect(pack.pursuers.map((p) => p.phase)).toEqual(['chasing', 'parked', 'parked']);
  expect(pack.pursuers.every((p) => !p.crashed)).toBe(true);
  // One slot, keeping its word (R-7): the pack is `cop`, and all three trims
  // are up in it.
  expect(pack.second).toBe('cop');
  expect(pack.slot).toBe('cop');
  expect(pack.drawn.map((d) => d.visible)).toEqual([true, true, true]);
  // **Each trim stands where his own pose is** — the M18 claim, three times.
  // A trim posed from the wrong pursuer's pose, or left at its build-time
  // origin, fails here on the cop it belongs to.
  for (let index = 0; index < 3; index += 1) {
    const at = pack.drawn[index].at;
    expect(at, `trim ${index} has no rig`).not.toBeNull();
    const off = Math.hypot(at!.x - pack.pursuers[index].x, at!.z - pack.pursuers[index].z);
    expect(off, `trim ${index} is ${off.toFixed(2)} m from pursuer ${index}`).toBeLessThan(1.5);
  }
  // `copGap` is the nearest standing cop, so it is never above any one of them.
  expect(pack.copGap).toBeLessThanOrEqual(Math.min(...pack.pursuers.map((p) => p.gap)) + 1e-6);
  expect(errors).toEqual([]);
});

test('a parked patrol wakes inside the siren line, and a patrol bust ends the run credited to him', async ({ page }) => {
  // q206's promise and §39.6b.3's wake rule together: a patrol sleeps at his
  // post until the rider is inside `patrolWakeMetres`, which is the siren's
  // far edge on purpose, so a wake is *heard* as it happens. Then the run is
  // ended by him rather than the tail, and the referee's attribution names
  // which cop it was (`bustedBy`, a pursuer index).
  expect(CHASE.patrolWakeMetres, 'the wake left the siren line').toBe(AUDIO.sirenFarMetres);
  const errors = collectErrors(page);
  await bootChase(page);
  await page.evaluate(() => window.game.advance(10));

  const woke = await standBeforePatrol(page, 1, 40);
  expect(woke.wokeAtChunk, 'patrol 1 never left his post with the rider 40 m away').toBeGreaterThanOrEqual(0);
  expect(woke.wakes).toBeGreaterThanOrEqual(1);
  expect(woke.wakeGap).toBeLessThanOrEqual(CHASE.patrolWakeMetres);

  const ended = await page.evaluate(() => {
    const game = window.game;
    let sirenOnceWoken = 0;
    let closest = Infinity;
    for (let chunk = 0; chunk < 400; chunk += 1) {
      game.advance(6);
      const snapshot = game.snapshot();
      sirenOnceWoken = Math.max(sirenOnceWoken, snapshot.audio.sirenGain);
      closest = Math.min(closest, snapshot.chase.pursuers[1].gap);
      if (snapshot.chase.phase !== 'running') break;
    }
    for (let chunk = 0; chunk < 60 && game.snapshot().app.state !== 'results'; chunk += 1) game.advance(10);
    const snapshot = game.snapshot();
    return {
      phase: snapshot.chase.phase,
      outcome: snapshot.chase.outcome,
      bustedBy: snapshot.chase.bustedBy,
      roles: snapshot.chase.pursuers.map((p) => p.role),
      busts: snapshot.chase.pursuers.map((p) => p.busts),
      state: snapshot.app.state,
      sirenOnceWoken,
      closest,
    };
  });

  // He came in with the siren up, all the way to the rider.
  expect(ended.sirenOnceWoken).toBeGreaterThan(0);
  expect(ended.closest).toBeLessThan(CHASE.swingRangeMetres);
  // And a patrol, not the tail, ended it: the credit is his and only his.
  expect(['caught', 'touched']).toContain(ended.outcome);
  expect(ended.bustedBy, 'no pursuer was credited with the bust').toBeGreaterThanOrEqual(1);
  expect(ended.roles[ended.bustedBy]).toBe('patrol');
  expect(ended.busts[ended.bustedBy]).toBe(1);
  expect(ended.busts.reduce((a, b) => a + b, 0), 'a bust was credited twice').toBe(1);
  expect(ended.state).toBe('results');
  await expect(page.locator('.euc-menu--results [data-menu="results-heading"]')).toHaveText(/Busted/);
  expect(errors).toEqual([]);
});

test('?cops=1 is the one-cop chase, and it files no record', async ({ page }) => {
  // R-14: the pre-Part-P chase kept for an A/B ride. It is a diagnostic, so it
  // joins `Game.probing` and takes the existing diagnostic note — a best set
  // against one cop by a probe would otherwise be read as a three-cop best, or
  // shadow a real one-cop best from before Part P.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}&cops=1`);

  const run = await page.evaluate(() => {
    const game = window.game;
    game.clearRecords();
    game.tuning.set('CHASE.escapeSeconds', 30);
    game.startChase();
    game.setActions({ throttle: 0.6 });
    game.advance(2);
    const scene = game.renderer.scene;
    const trims = ['cop-rider', 'cop2-rider', 'cop3-rider'].map((name) => scene.getObjectByName(name)?.visible === true);
    const chase = game.snapshot().chase;
    const start = { force: chase.force, probe: chase.copsProbe, roles: chase.pursuers.map((p) => p.role), posts: chase.posts };
    for (let chunk = 0; chunk < 300; chunk += 1) {
      game.advance(30);
      if (game.snapshot().app.state === 'results') break;
    }
    // 2026-10-03 (LC-1): bests are filed under the engine-independent record key.
    const id = game.levelPlan.recordWorldId!;
    return {
      trims,
      start,
      state: game.snapshot().app.state,
      best: game.snapshot().chase.best,
      stored: [1, 2, 3].map((force) => game.chaseRecords.best(id, force)),
    };
  });

  expect(run.start).toEqual({ force: 1, probe: 1, roles: ['tail'], posts: 'none' });
  expect(run.trims).toEqual([true, false, false]);
  expect(run.state).toBe('results');
  expect(run.best).toBeNull();
  expect(run.stored).toEqual([null, null, null]);
  await expect(page.locator('.euc-menu--results [data-menu="results-notes"]'))
    .toContainText('Diagnostic run — personal best not saved');
  expect(errors).toEqual([]);
});

test('the shipped chase files against three cops, and a one-cop best is named on the card — q208, q213', async ({ page }) => {
  // q208: a best set against three cops is not comparable with one set against
  // one, so the store keeps them apart by force and the card reads force 3.
  // q213: a player who has a pre-Part-P best is told it still exists, in one
  // line, rather than finding his record "gone".
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);

  const run = await page.evaluate(() => {
    const game = window.game;
    game.clearRecords();
    // 2026-10-03 (LC-1): bests are filed under the engine-independent record key.
    const id = game.levelPlan.recordWorldId!;
    // An old row: no `force`, which reads as one cop (R-8).
    game.chaseRecords.submit({ levelId: id, seconds: 300, escaped: true, setAt: new Date().toISOString() });
    game.tuning.set('CHASE.escapeSeconds', 30);
    game.startChase();
    const before = game.snapshot().chase.best;
    game.setActions({ throttle: 0.6 });
    for (let chunk = 0; chunk < 300; chunk += 1) {
      game.advance(30);
      if (game.snapshot().app.state === 'results') break;
    }
    return {
      before,
      state: game.snapshot().app.state,
      best: game.snapshot().chase.best,
      one: game.chaseRecords.best(id, 1),
      three: game.chaseRecords.best(id, 3),
    };
  });

  // The one-cop best is not the three-cop best the card starts from.
  expect(run.before).toBeNull();
  expect(run.state).toBe('results');
  expect(run.three, 'the three-cop run filed nothing').not.toBeNull();
  expect(run.three!.force).toBe(3);
  expect(run.best).toBe(run.three!.seconds);
  expect(run.one).toMatchObject({ seconds: 300, escaped: true, force: 1 });
  await expect(page.locator('.euc-menu--results [data-menu="results-notes"]'))
    .toContainText('Best against one cop: 5:00.00, escaped');
  expect(errors).toEqual([]);
});

test('touching any officer is a bust, the card says so in the plan’s words, and R in the delay still reaches it', async ({ page }) => {
  // §39.6b.3 "Sound, HUD, card": with three cops the note names no one of
  // them — "You touched an officer". M24's ram, against the tail, on the
  // values M24's own fixture uses (`wobble=0`, the paddle's knock share at the
  // top of its slider so his swing cannot end it first). And q175: an R
  // pressed in the results delay used to strand an ended run on the road.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}&wobble=0`);
  await page.evaluate(() => {
    window.game.tuning.set('PADDLE.hardKnockShare', 3);
    window.game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');

  const rammed = await page.evaluate(() => {
    const game = window.game;
    game.clearActions();
    game.setActions({ throttle: -1 });
    for (let chunk = 0; chunk < 160; chunk += 1) {
      game.advance(5);
      const snapshot = game.snapshot();
      if (snapshot.chase.phase !== 'running') {
        // R inside the delay (q175). The R zeroes the delay; the fix is that
        // the ended round still reaches its card rather than sitting on the
        // road with the referee answering quiet steps.
        const inDelay = snapshot.app.state === 'chase' && snapshot.challenge.resultsIn > 0;
        game.setActions({ throttle: 0, reset: true });
        game.advance(2);
        game.setActions({ reset: false });
        for (let wait = 0; wait < 60 && game.snapshot().app.state !== 'results'; wait += 1) game.advance(1);
        const end = game.snapshot();
        return {
          outcome: snapshot.chase.outcome,
          bustedBy: end.chase.bustedBy,
          role: end.chase.pursuers[Math.max(0, end.chase.bustedBy)]?.role ?? null,
          inDelay,
          state: end.app.state,
        };
      }
    }
    return { outcome: 'none', bustedBy: -1, role: null, inDelay: false, state: game.snapshot().app.state };
  });

  expect(rammed.outcome, JSON.stringify(rammed)).toBe('touched');
  expect(rammed.inDelay, 'the R was not pressed inside the results delay').toBe(true);
  expect(rammed.state, 'an R in the results delay stranded the run (q175)').toBe('results');
  expect(rammed.bustedBy).toBeGreaterThanOrEqual(0);
  const notes = page.locator('.euc-menu--results [data-menu="results-notes"]');
  await expect(notes).toContainText('You touched an officer — that is an instant bust');
  await expect(notes).not.toContainText('touched Officer Dorkins');
  expect(errors).toEqual([]);
});

test('F3 lists the pack: the count, where the posts came from, and every cop’s state', async ({ page }) => {
  // The director is otherwise invisible from the saddle (§39.6b.3, F3): which
  // cop is asleep, which is riding in, which is owed a return.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}&debug=1`);
  await page.evaluate(() => {
    window.game.startChase();
    window.game.advance(30);
  });
  const overlay = page.locator('#euc-debug-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('[data-field="chasepack"]')).toContainText('3 cops');
  await expect(overlay.locator('[data-field="chasepack"]')).toContainText('posts ring');
  await expect(overlay.locator('[data-field="chasecop0"]')).toContainText(/^tail\s+chasing\s+\d+ m\s+cap /);
  await expect(overlay.locator('[data-field="chasecop1"]')).toContainText(/^patrol\s+parked\s/);
  await expect(overlay.locator('[data-field="chasecop2"]')).toContainText(/^patrol\s+parked\s/);
  expect(errors).toEqual([]);
});

test('F4’s Cop hold is the couch face’s remedy: a solo chase ignores it and the tail rides from GO (QA r2)', async ({ page }) => {
  // q224's hold is listed under the couch face and the solo chase has none —
  // the 20 m spawn gap is the head start. The room is shared by both faces
  // and snapshots the hold at `arm`, so the solo arm has to zero it: a 5 s
  // hold tried for a human cop at GC used to freeze Dorkins 20 m behind the
  // next solo rider for 5 s after GO.
  const errors = collectErrors(page);
  await bootToTitle(page, `level=generated&seed=${SEED}`);
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.tuning.set('CHASE.copHoldSeconds', 5);
    game.startChase();
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'chase');
  const ride = await page.evaluate(() => {
    const game = window.game;
    const room = game.chaseRoom;
    const start = game.snapshot().chase.pursuers[0];
    const atGo = { phase: room.phase, held: room.pursuersHeld, hold: room.copHoldSeconds };
    game.advance(120);
    const later = game.snapshot().chase.pursuers[0];
    return {
      atGo,
      heldAfterOne: room.pursuersHeld,
      tailMoved: Math.hypot(later.x - start.x, later.z - start.z),
      knob: game.tuning.get('CHASE.copHoldSeconds'),
    };
  });
  expect(ride.knob, 'the knob was not set, so this proves nothing').toBe(5);
  expect(ride.atGo.phase).toBe('running');
  expect(ride.atGo.hold, 'the solo arm carried the couch face’s hold').toBe(0);
  expect(ride.atGo.held, 'the solo pack is held after GO').toBe(false);
  expect(ride.heldAfterOne).toBe(false);
  expect(ride.tailMoved, 'the tail stood still for the first second of a solo chase').toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});
