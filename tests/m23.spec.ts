/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { RENDER_BUDGET } from '../src/data/renderCost.ts';
import { CHARACTERS } from '../src/data/riders.ts';
import { TRACK_LAP_SEGMENT_IDS } from '../src/level/trackLevel.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M23 — Maribel Vargas's seat, and the way in to the roster she joined.
 *
 * Two things here that no headless test can answer, and one tripwire.
 *
 * **The chip advertises the roster exactly once, ever.** The owner's report
 * was that the way into the chooser is missed entirely by casual players, so
 * it now attracts attention until it has been used and then stops for good.
 * Both halves are the contract: an attract that never retires is the nagging
 * the standing rule forbids, and one that retires without being persisted
 * comes back on the next launch, which is the same thing with extra steps.
 * Only a browser can say whether the flag survives a reload, because only a
 * browser has the storage.
 *
 * **The dots are the roster.** They are what tells a player there is more than
 * one rider at all, so a dot row that does not follow the choice — or that
 * does not have one dot per rider — is the defect this screen was changed to
 * fix, silently reintroduced.
 */

test('the way into the roster shows itself once, then never again', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  // A player who has never opened the chooser. `bootToTitle` starts on a fresh
  // storage origin, so this is the real first-run state rather than a poke.
  const chip = page.locator('.euc-rider-chip');
  await expect(chip).toHaveAttribute('data-attract', 'true');

  // One dot per rider, and the current one is marked. Marked rather than
  // merely coloured: the row has to read for a player who cannot separate two
  // of the hues, which is why the state is an attribute and not just a fill.
  const dots = page.locator('[data-rider-dot]');
  await expect(dots).toHaveCount(CHARACTERS.length);
  await expect(page.locator('[data-rider-dot][data-current="true"]')).toHaveCount(1);
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'cool-rider');

  // Opening it is what retires the advertisement.
  await chip.click();
  await expect(page.locator('.euc-menu--riders')).toBeVisible();
  await expect(chip).toHaveAttribute('data-attract', 'false');

  // The dot follows the choice, with the panel still open — the same
  // apply-immediately rule the cards themselves follow.
  await page.locator('[data-rider="maribel-vargas"]').click();
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'maribel-vargas');
  await page.locator('[data-menu="riders-back"]').click();

  // And it is still retired after a reload, which is the half that needs the
  // record rather than the DOM: a session-only flag would flash at this player
  // every time they opened the game.
  await bootToTitle(page);
  await expect(page.locator('.euc-rider-chip')).toHaveAttribute('data-attract', 'false');
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'maribel-vargas');

  expect(errors).toEqual([]);
});

/**
 * Her crash voice is her own, **and the test that used to stand here is why
 * this one can be trusted**.
 *
 * Phase A0 seated her on Red Rider's crash — the one with no voice in it at
 * all — because her own recording did not exist yet, and this spec asserted
 * *that*, in as many words, so that Phase A3 landing would break it. It did,
 * on 2026-08-20, which is the whole value of writing an interim down as an
 * assertion rather than as a comment: an interim that nothing watches is an
 * interim that ships.
 *
 * What replaces it is the M22 shape, and it needs a browser for the same
 * reason his did. `crashVoice` reports the *choice*; only a real crash in a
 * real mix says the chosen file is the one that reached the output. The
 * follow-up swaps off her and back, because the direction that would still
 * pass on a stuck mapping is the one leaving her.
 */
test('Maribel crashes with her own recording, audibly', async ({ page }) => {
  const errors = collectErrors(page);
  // `boot`, not `bootToTitle`: this one has to actually ride her into a crash,
  // and the title screen is not riding.
  await boot(page);

  await page.evaluate(() => window.game.setOptions({ character: 'maribel-vargas' }));
  expect(await page.evaluate(() => window.game.snapshot().options.character))
    .toBe('maribel-vargas');
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('maribel');

  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

  const measured = await page.evaluate(async () => {
    window.qa.freeze();
    window.qa.resetRide();
    const idle = await window.qa.audioOutputMax(500, 5);
    const before = window.qa.snap().audio;

    let steps = 0;
    while (steps < 3000 && !window.game.snapshot().euc.crashed) {
      const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
      window.game.setActions({ throttle: 1, steer: flip });
      window.game.advance(6);
      steps += 6;
    }
    window.game.setActions({ throttle: 0, steer: 0 });

    const after = window.qa.snap().audio;
    const during = await window.qa.audioOutputMax(1600, 16);
    return {
      crashed: window.game.snapshot().euc.crashed,
      samplePlays: after.crashSamplePlays - before.crashSamplePlays,
      voice: after.lastCrashVoice,
      idle,
      during,
    };
  });

  expect(measured.crashed).toBe(true);
  expect(measured.samplePlays).toBeGreaterThanOrEqual(1);
  expect(measured.voice).toBe('maribel');
  // Her file is RMS-matched to `crash_wipeout` like every other rider's, so
  // m8's bar for a crash being audible over the ride bed is the right bar here
  // unchanged — swapping rider must not change how loud a crash is.
  expect(measured.during).toBeGreaterThan(0.02);
  expect(measured.during).toBeGreaterThan(measured.idle * 3);

  await page.evaluate(() => window.game.setOptions({ character: 'red-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('red-rider');
  await page.evaluate(() => window.game.setOptions({ character: 'maribel-vargas' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('maribel');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Workstream B, Phase B0 — BelVar Circuit, the graybox
// ---------------------------------------------------------------------------

/**
 * The venue, in a browser — M23 §23.13.
 *
 * Three claims live here and only here, because none of them can be made
 * headlessly.
 *
 * **One physically ridden lap, not teleports.** AGENTS.md's checkpoint-mode
 * discipline says a routed lap is what proves a course is navigable, and a
 * circuit is the case it was written for: the layout below closes on itself,
 * so "can it be ridden" and "does it come home" are the same question. The
 * route follower places the rider once, at the start of the main straight, and
 * everything after that is riding.
 *
 * **The sector gates are on the ridden line.** The M10 referee declines this
 * venue on purpose — a lap cannot start and stop, so `ChallengeRun.available`
 * is false and Phase B2's referee is what will read these gates. That leaves
 * nobody to notice a gate the rider passes *beside*, so the crossings are
 * taken off the ride itself: two consecutive samples straddling a gate's plane
 * inside its own width is a crossing, at any sampling rate.
 *
 * **The chase camera never pulls in.** Phase B0's owner gate asks whether
 * every corner is readable at speed, and the automated half of that is the
 * obstruction pull-in: a block occludes by default, and 245 barrier blocks
 * standing beside the racing line for nine hundred metres is the shape of a
 * defect that would slam the camera in on every corner of every lap. The
 * barriers are 0.9 m and the rider is 1.7 m over a half-metre wheel, so the
 * claim is that the arm is never shortened at all.
 */

/** The lap, in riding order. `trackLevel.ts`'s own order, read from the plan. */
async function lapSegments(page: Page): Promise<string[]> {
  // **The lap's own corridors, not every corridor the plan carries.** From
  // Phase B1 the venue also holds the paddock, which is rideable ground
  // reached through a barrier gate — so a route follower handed
  // `levelPlan.segments` would try to drive up the paddock road. The plan is
  // still asked for the ids, so a corridor that failed to build fails here
  // rather than being quietly skipped.
  const built = await page.evaluate(() => window.game.levelPlan.segments.map((segment) => segment.id));
  for (const id of TRACK_LAP_SEGMENT_IDS) expect(built).toContain(id);
  return [...TRACK_LAP_SEGMENT_IDS];
}

test('BelVar Circuit rides one closed lap, through every sector gate', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=track');

  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe('belvar-r1');
  // The venue is a lap, so the M10 time trial declines it — with no branch
  // anywhere on which level is loaded. Phase B2 is what changes this.
  expect(await page.evaluate(() => window.game.snapshot().challenge.available)).toBe(false);

  const ids = await lapSegments(page);
  expect(ids).toHaveLength(18);

  const ride = await page.evaluate((segments) => {
    const points = window.qa.routePoints(segments, 2);
    // A cap rather than a lower throttle: the follower has two gains and no
    // eyes, and a slower *throttle* would take its hill-climbing with it
    // (AGENTS.md). 12 m/s is under the hairpin's own lateral limit, so the
    // corner is never what stops the run.
    const result = window.qa.followRoute(points, {
      lookAhead: 9,
      maxSteps: 30_000,
      maxSpeed: 12,
      watch: 20,
    });
    return { result, start: points[0], end: points[points.length - 1], count: points.length };
  }, ids);

  // Navigable end to end, at riding speed, without touching anything.
  expect(ride.result.finished).toBe(true);
  expect(ride.result.crashes).toBe(0);
  expect(ride.result.blockedSteps).toBe(0);
  // The follower is allowed to clip a verge; it is not allowed to spend the
  // lap out there, which is what a corner it cannot take would look like.
  expect(ride.result.offCourseSteps).toBeLessThan(ride.result.steps / 60);

  // A lap: it came home to the line it left, having ridden the whole ring.
  const home = ride.result.path[ride.result.path.length - 1];
  expect(Math.hypot(home.x - ride.start.x, home.z - ride.start.z)).toBeLessThan(20);
  expect(ride.result.distance).toBeGreaterThan(900);
  expect(ride.result.distance).toBeLessThan(1100);

  // Every gate, crossed. A crossing is two consecutive samples on opposite
  // sides of the gate's own plane and inside its own width, which is a test
  // the sampling rate cannot fool.
  const crossings = await page.evaluate((path) => {
    const gates = window.game.levelPlan.checkpoints;
    return gates.map((gate) => {
      const cos = Math.cos(gate.headingY);
      const sin = Math.sin(gate.headingY);
      const along = (p: { x: number; z: number }): number =>
        sin * (p.x - gate.centre.x) + cos * (p.z - gate.centre.z);
      const across = (p: { x: number; z: number }): number =>
        cos * (p.x - gate.centre.x) - sin * (p.z - gate.centre.z);
      let count = 0;
      for (let index = 1; index < path.length; index += 1) {
        const before = along(path[index - 1]);
        const after = along(path[index]);
        if (before > 0 === after > 0) continue;
        const share = before / (before - after);
        const lateral = across(path[index - 1]) + share * (across(path[index]) - across(path[index - 1]));
        if (Math.abs(lateral) <= gate.halfExtents.x) count += 1;
      }
      return { id: gate.id, count };
    });
  }, ride.result.path);

  expect(crossings.map((gate) => gate.id)).toEqual(['line', 'sector-1', 'sector-2']);
  for (const gate of crossings) {
    expect(gate.count, `${gate.id} was crossed ${gate.count} times on one lap`).toBe(1);
  }

  expect(errors).toEqual([]);
});

test('the paddock junction rides in and out at speed without a trap or long camera pull-in', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=track');

  const measured = await page.evaluate(() => {
    const exit = window.qa.routePoints(['exit'], 0.5);
    const road = window.qa.routePoints(['paddock-road'], 0.5);
    const apron = window.qa.routePoints(['paddock'], 0.5);
    const end = road[0];
    // The closest exit-centre point to the road's entry is the junction's
    // tangent intersection: ten metres along the track and ten metres across
    // its right shoulder. A quadratic through it is the physical right turn a
    // rider makes, rather than a teleport from one corridor centre to another.
    const control = exit.reduce((best, point) => (
      Math.hypot(point.x - end.x, point.z - end.z)
        < Math.hypot(best.x - end.x, best.z - end.z) ? point : best
    ));
    const start = exit[0];
    const bend = Array.from({ length: 25 }, (_, index) => {
      const t = index / 24;
      const one = 1 - t;
      return {
        x: one * one * start.x + 2 * one * t * control.x + t * t * end.x,
        z: one * one * start.z + 2 * one * t * control.z + t * t * end.z,
      };
    });
    const inboundPoints = [...bend, ...road.slice(1), ...apron.slice(1)];
    const wanted = window.game.snapshot().camera.distance;
    const options = { lookAhead: 3, maxSteps: 12_000, maxSpeed: 8, watch: 10 };
    const inbound = window.qa.followRoute(inboundPoints, options);
    const outbound = window.qa.followRoute([...inboundPoints].reverse(), options);
    return { inbound, outbound, wanted };
  });

  for (const [direction, ride] of [
    ['into', measured.inbound],
    ['out of', measured.outbound],
  ] as const) {
    expect(ride.finished, `the ride ${direction} the paddock did not finish`).toBe(true);
    expect(ride.crashes, `the ride ${direction} the paddock crashed`).toBe(0);
    expect(ride.blockedSteps, `the ride ${direction} the paddock snagged`).toBe(0);
    expect(ride.offCourseSteps).toBeLessThan(ride.steps / 8);
    expect(ride.meanSpeed).toBeGreaterThan(3);

    const severe = ride.path.filter((sample) => sample.armDistance < measured.wanted * 0.75);
    expect(
      severe.length,
      `${direction} the paddock, the camera lost over a quarter of its arm on `
        + `${severe.length} of ${ride.path.length} samples: ${JSON.stringify(
          severe.map((sample) => ({ x: sample.x, z: sample.z, arm: sample.armDistance })),
        )}`,
    ).toBe(0);

    let currentPull = 0;
    let longestPull = 0;
    for (const sample of ride.path) {
      currentPull = sample.armDistance < measured.wanted * 0.9 ? currentPull + 1 : 0;
      longestPull = Math.max(longestPull, currentPull);
    }
    // Samples are ten fixed steps apart, so thirteen consecutive samples are
    // over a second of a visibly shortened chase arm.
    expect(longestPull, `${direction} the paddock, the camera stayed pulled in for ${longestPull} samples`)
      .toBeLessThanOrEqual(12);
  }

  expect(errors).toEqual([]);
});

test('watching the route follower does not perturb the ride it records', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=track');

  const compared = await page.evaluate(() => {
    const points = window.qa.routePoints(['main'], 2);
    const options = { lookAhead: 9, maxSteps: 4_000, maxSpeed: 10 };
    const plain = window.qa.followRoute(points, options);
    const watched = window.qa.followRoute(points, { ...options, watch: 20 });
    return { plain, watched };
  });

  expect(compared.plain.path).toEqual([]);
  expect(compared.watched.path.length).toBeGreaterThan(0);
  // `watch` takes an extra snapshot at each sample. A snapshot is an observer,
  // never a simulation step, so every ride result outside the recording must
  // be bit-for-bit identical to the run that did not watch.
  expect({ ...compared.watched, path: [] }).toEqual(compared.plain);
  expect(errors).toEqual([]);
});

test('a lap of the circuit never pulls the chase camera in, and stays inside §9', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, 'level=track');
  const ids = await lapSegments(page);

  const ride = await page.evaluate((segments) => {
    const game = window.game;
    // Warm up before measuring: the first real frames compile shaders and
    // upload the world, and counting that would report a one-off as a peak.
    game.loop.setRunning(false);
    game.advance(60);
    const wanted = game.snapshot().camera.distance;
    const result = window.qa.followRoute(window.qa.routePoints(segments, 2), {
      lookAhead: 9,
      maxSteps: 30_000,
      maxSpeed: 12,
      watch: 20,
    });
    return { wanted, path: result.path, steps: result.steps };
  }, ids);

  // **The arm is never shortened.** `armDistance` is the arm after the
  // obstruction pull-in and `distance` is the arm it wanted; on a venue whose
  // only geometry is barriers a rider can see over, the two never differ.
  const pulled = ride.path.filter((sample) => sample.armDistance < 0.98 * ride.wanted);
  expect(
    pulled.length,
    `the camera pulled in on ${pulled.length} of ${ride.path.length} samples`,
  ).toBe(0);

  // The frame, measured over a real ride rather than from one resting camera.
  const peak = ride.path.reduce(
    (worst: { drawCalls: number; triangles: number }, sample) => ({
      drawCalls: Math.max(worst.drawCalls, sample.drawCalls),
      triangles: Math.max(worst.triangles, sample.triangles),
    }),
    { drawCalls: 0, triangles: 0 },
  );
  expect(peak.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  expect(peak.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);

  expect(errors).toEqual([]);
});

test('rebuilding the venue twelve times plateaus GPU objects', async ({ page }) => {
  // Invariant 10, on the fourth producer. A hand-authored world is built once
  // in play, so a missing `dispose` in the venue's build path is invisible
  // until something rebuilds it — and Phase B2's retry does. The scene-graph
  // half of this is `render/levelLifecycle.test.ts`; the GPU counters only
  // exist in a browser.
  const errors = collectErrors(page);
  await boot(page, 'level=track');

  const trace = await page.evaluate(() => {
    const game = window.game;
    const original = game.levelPlan;
    game.loop.setRunning(false);
    game.advance(60);
    const baseline = game.resources();

    const rounds: ReturnType<typeof game.resources>[] = [];
    for (let round = 0; round < 12; round += 1) {
      game.renderer.setLevel(game.buildLevel('track', 'euc'));
      // A step and a draw, so the world is uploaded rather than merely built:
      // an unrendered geometry never reaches `info.memory`.
      game.advance(2);
      rounds.push(game.resources());
    }
    game.renderer.setLevel(original);
    game.advance(2);
    return { baseline, rounds, restored: game.resources() };
  });

  // Every rebuild after the first settles on one set of counters — the first
  // is allowed to differ because the boot world is disposed inside it.
  for (let round = 1; round < trace.rounds.length; round += 1) {
    expect(
      trace.rounds[round],
      `rebuild ${round} moved the counters: ${JSON.stringify(trace.rounds[round - 1])} `
        + `then ${JSON.stringify(trace.rounds[round])}`,
    ).toEqual(trace.rounds[0]);
  }
  // And twelve worlds later the counters are the boot counters, which is the
  // strictest available form of the claim.
  expect(trace.restored).toEqual(trace.baseline);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase B2 — Track Day, the mode
// ---------------------------------------------------------------------------

/**
 * The lap referee, wired into a real browser.
 *
 * **The rules are proven headlessly, on this venue's own geometry**
 * (`src/simulation/trackDay.test.ts` rides the emitted centreline for every one
 * of them), so nothing below re-asserts what a lap is. What these ask is the
 * half a `node --test` cannot: that a crossing reaches the HUD, that a lap
 * reaches `localStorage`, that the ghost the store handed back is the one on
 * screen, that the card says what the store did, and that a session can be
 * ended from the pause card by the two presses a player actually makes.
 *
 * Most of them teleport between gates rather than riding, on `tests/m10.spec.ts`'s
 * own argument: riding the whole circuit for each claim would make every
 * assertion a test of the layout as much as of the thing it names, and a
 * minute of lap per scenario would put this file out of reach of a routine
 * run. **One of them does ride**, at the end, because "a real lap on the real
 * racing line counts" is a claim only a real lap can make.
 */

interface Line {
  id: string;
  routeIndex: number;
  label: string;
  centre: { x: number; y: number; z: number };
  headingY: number;
}

function lapState(page: Page) {
  return page.evaluate(() => window.game.snapshot().trackDay);
}

function lines(page: Page): Promise<Line[]> {
  return page.evaluate(() => window.game.levelPlan.checkpoints.map((cp) => ({
    id: cp.id,
    routeIndex: cp.routeIndex,
    label: cp.label,
    centre: { ...cp.centre },
    headingY: cp.headingY,
  })));
}

async function crossLine(page: Page, line: Line, hold = 60): Promise<void> {
  await page.evaluate(({ centre, headingY, hold: steps }) => {
    window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
    // Two steps to be seen crossing, then the hold, so the lap has a duration
    // the arithmetic can tell apart from zero.
    window.game.advance(2);
    window.game.advance(steps);
  }, { centre: line.centre, headingY: line.headingY, hold });
}

/** Open a session and put the rider through one whole lap of gates. */
async function ridePhantomLap(page: Page, all: Line[], hold = 60): Promise<void> {
  for (const line of all.slice(1)) await crossLine(page, line, hold);
  await crossLine(page, all[0], 2);
}

test('Track Day brings its own circuit, and opens on an out lap', async ({ page }) => {
  const errors = collectErrors(page);
  // **From the city, deliberately.** The mode's entrance is the only one in the
  // game that changes the world, which is what makes it always offered rather
  // than conditionally hidden — and the button's own note says where it goes,
  // so this is a journey the player asked for rather than a silent swap.
  await bootToTitle(page);
  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe('m7-slice');

  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');

  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe('belvar-r1');
  // The address bar follows, so the circuit is a link like every other world.
  expect(await page.evaluate(() => window.location.search)).toBe('?level=track');

  const lap = await lapState(page);
  expect(lap.available).toBe(true);
  expect(lap.phase).toBe('outLap');
  expect(lap.lap).toBe(0);
  expect(Math.round(lap.lapMetres)).toBe(930);

  // And the M10 referee still declines the venue, which is the tripwire that
  // says the two referees stayed separate rather than one growing a branch.
  expect(await page.evaluate(() => window.game.snapshot().challenge.available)).toBe(false);
  await expect(page.locator('.euc-menu--title [data-menu="challenge"]')).toBeHidden();

  expect(errors).toEqual([]);
});

test('the lap lane names the lap, the clock and the time to beat', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  await page.evaluate(() => { window.game.loop.setRunning(false); window.game.advance(2); });

  await expect(page.locator('[data-hud="challenge"]')).toBeVisible();
  await expect(page.locator('[data-hud="lap-label"]')).toHaveText('Out lap');
  await expect(page.locator('[data-hud="timer"]')).toHaveText('0:00.00');
  // Before the first crossing there is no other cue that the game is waiting.
  await expect(page.locator('[data-hud="objective"]')).toHaveText(/Ride to the start line/);

  const all = await lines(page);
  await crossLine(page, all[0], 120);
  await expect(page.locator('[data-hud="lap-label"]')).toHaveText('Lap 1');
  await expect(page.locator('[data-hud="timer"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);
  // A circuit tells a rider where to go by being a circuit, so the objective
  // goes quiet the moment the lap starts.
  await expect(page.locator('[data-hud="objective"]')).toHaveText('');

  // A sector crossing flashes in the row under the clock.
  await crossLine(page, all[1], 4);
  await expect(page.locator('[data-hud="splits"]')).toBeVisible();
  await expect(page.locator('[data-hud="split-label"]')).toHaveText(all[1].label);
  await expect(page.locator('[data-hud="split-delta"]')).toHaveText('Best');

  expect(errors).toEqual([]);
});

test('a lap that closes is timed, kept, and raced against from the next lap on', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);

  await crossLine(page, all[0], 30);
  await ridePhantomLap(page, all);

  const after = await lapState(page);
  expect(after.lapsCounted).toBe(1);
  expect(after.lapsRidden).toBe(1);
  // The next lap opens on the crossing that closed the last one: on a circuit
  // there is no moment between the two.
  expect(after.lap).toBe(2);
  expect(after.bestLapSeconds).not.toBeNull();

  // In the store, with a ghost, under the plan's own id.
  const record = await page.evaluate(() => window.game.snapshot().record);
  expect(record.totalSeconds).toBeCloseTo(after.bestLapSeconds!, 6);
  expect(record.hasGhost).toBe(true);
  expect(record.splits.length).toBe(4);
  expect(record.splits[0]).toBe(0);
  expect(record.splits[3]).toBeCloseTo(record.totalSeconds!, 6);

  // The lane flashed the lap time itself, because that is the number the rider
  // crossed the line for.
  await expect(page.locator('[data-hud="split-label"]')).toHaveText(/^Lap \d+:\d{2}\.\d{2}$/);


  // **The ghost is racing before the next lap is over**, which is the whole
  // difference between this and a time trial: a lap ghost restarts on the line
  // rather than playing once from the start of a run.
  await page.evaluate(() => window.game.advance(60));
  expect((await lapState(page)).ghostVisible).toBe(true);

  // **The lap and the time to beat are still on the lane long after the flash
  // has gone**, which is the owner's first-session report: he looked up six
  // seconds after the line and found neither, and read the lane as resetting.
  await page.evaluate(() => window.game.advance(1200));
  await expect(page.locator('[data-hud="lap-best"]')).toBeVisible();
  await expect(page.locator('[data-hud="lap-best-label"]')).toHaveText('Best');
  await expect(page.locator('[data-hud="lap-best-value"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);
  await expect(page.locator('[data-hud="split-label"]')).toHaveText('Last');
  await expect(page.locator('[data-hud="split-delta"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);

  // And it survives the reload, which is the half only a browser can say.
  await bootToTitle(page, 'level=track');
  const stored = await page.evaluate(() => window.game.snapshot().record);
  expect(stored.persistent).toBe(true);
  expect(stored.totalSeconds).toBeCloseTo(record.totalSeconds!, 6);
  expect(stored.hasGhost).toBe(true);

  expect(errors).toEqual([]);
});

test('leaving the circuit voids the lap, and the lane says so where the lap is named', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);

  await crossLine(page, all[0], 30);
  await crossLine(page, all[1], 4);
  // Sixty metres beside the circuit is the infield, which is reachable ground
  // and is not the racing surface.
  await page.evaluate(({ centre, headingY }) => {
    const cos = Math.cos(headingY);
    const sin = Math.sin(headingY);
    window.game.placeRider(
      { x: centre.x + cos * 60, y: centre.y, z: centre.z - sin * 60 },
      headingY,
    );
    window.game.advance(4);
  }, { centre: all[1].centre, headingY: all[1].headingY });

  const off = await lapState(page);
  expect(off.onCourse).toBe(false);
  expect(off.voided).toBe('off-course');
  expect(off.valid).toBe(false);
  await expect(page.locator('[data-hud="lap-label"]')).toHaveText('Lap 1 · no time');

  // Back on, round the rest of it, and the lap still does not count — coming
  // back does not un-ride the part that was missed.
  await crossLine(page, all[2], 4);
  await crossLine(page, all[0], 4);
  const closed = await lapState(page);
  expect(closed.lapsRidden).toBe(1);
  expect(closed.lapsCounted).toBe(0);
  expect(closed.bestLapSeconds).toBeNull();
  await expect(page.locator('[data-hud="split-label"]')).toHaveText('No time');
  await expect(page.locator('[data-hud="split-delta"]')).toHaveText('');
  // Nothing reached the store.
  expect(await page.evaluate(() => window.game.snapshot().record.totalSeconds)).toBeNull();
  // And the lap that has just opened is clean.
  expect(closed.valid).toBe(true);
  await expect(page.locator('[data-hud="lap-label"]')).toHaveText('Lap 2');

  expect(errors).toEqual([]);
});

test('a quick reset returns to the pit-out and keeps the session', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);

  await crossLine(page, all[0], 30);
  await ridePhantomLap(page, all);
  const best = (await lapState(page)).bestLapSeconds;
  expect(best).not.toBeNull();

  await crossLine(page, all[1], 240);
  expect((await lapState(page)).elapsed).toBeGreaterThan(1.5);

  await page.keyboard.press('KeyR');
  await page.evaluate(() => window.game.advance(2));
  const reset = await lapState(page);
  expect(reset.phase).toBe('outLap');
  expect(reset.elapsed).toBe(0);
  expect(reset.lap).toBe(0);
  // A spin is not a reason to lose the afternoon.
  expect(reset.bestLapSeconds).toBeCloseTo(best!, 6);
  expect(reset.lapsCounted).toBe(1);
  expect(reset.recordedSamples).toBe(0);

  expect(errors).toEqual([]);
});

test('pitting from the pause card ends the session and reports the best lap', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);

  await crossLine(page, all[0], 30);
  await ridePhantomLap(page, all, 60);
  await ridePhantomLap(page, all, 90);

  // The two presses a player makes, and no others: End session exists only
  // inside a session, so a free-ride pause must not carry it.
  await page.keyboard.press('Escape');
  await expect(page.locator('.euc-menu--pause')).toBeVisible();
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"]')).toBeVisible();
  // The world line names where the session happened, on the pause card as well
  // as the title — the circuit used to wear the city's own sentence.
  await expect(page.locator('.euc-menu--pause [data-menu="world"]')).toHaveText(/BelVar Circuit/);

  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

  await expect(page.locator('[data-menu="results-panel"]')).toHaveAttribute('data-record', 'true');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New best lap');
  await expect(page.locator('[data-menu="results-total"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);
  // Three rows: the two sector lines and the line that closed the lap. The
  // opening crossing's zero is deliberately not shown.
  await expect(page.locator('[data-menu="results-rows"] tr')).toHaveCount(3);
  await expect(page.locator('[data-menu="results-notes"] li').first()).toHaveText(/laps counted/);

  // Retry means the mode that just ended, which for a fourth mode is the thing
  // the tagless results union gets wrong if an entrance forgets to clear.
  await page.locator('[data-menu="retry"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  const fresh = await lapState(page);
  expect(fresh.phase).toBe('outLap');
  expect(fresh.lapsCounted, 'a retry is a new afternoon').toBe(0);
  // The record it set is still there to be chased.
  expect(fresh.recordSeconds).not.toBeNull();

  expect(errors).toEqual([]);
});

test('a paused lap keeps the clock it was paused to read, and New route can leave', async ({ page }) => {
  // Two defects the adversarial pass found, kept together because they are the
  // same mistake twice: a lap state that was gated on the app state where the
  // timed run gates on its own referee.
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);
  await crossLine(page, all[0], 120);
  await expect(page.locator('[data-hud="lap-label"]')).toHaveText('Lap 1');

  // **The gates stay lit through a pause, so the clock must too.** A player who
  // paused to read their lap time cannot have the number they paused for
  // vanish, which is the rule the time trial's lane has followed since M10.
  await page.keyboard.press('Escape');
  await expect(page.locator('.euc-menu--pause')).toBeVisible();
  await expect(page.locator('[data-hud="challenge"]')).toBeVisible();
  await expect(page.locator('[data-hud="lap-label"]')).toHaveText('Lap 1');
  await expect(page.locator('[data-hud="timer"]')).toHaveText(/^\d+:\d{2}\.\d{2}$/);

  // Still there, and not ageing: one of the two places in this suite where
  // real time is spent on purpose, because the claim is that *nothing* happens.
  const paused = await page.locator('[data-hud="timer"]').textContent();
  expect(paused).not.toBe('0:00.00');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-hud="timer"]')).toHaveText(paused!);

  // And New route from the card really leaves. `results` used to refuse the
  // only destination a generated course can host, so the world was replaced
  // underneath a frozen lap card the player could not get out of.
  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'freeRide',
    undefined,
    { timeout: 30_000 },
  );
  const after = await page.evaluate(() => window.game.snapshot());
  expect(after.world.generated).toBe(true);
  expect(after.trackDay.phase).toBe('idle');
  await expect(page.locator('.euc-menu--results')).toBeHidden();

  expect(errors).toEqual([]);
});

test('a free-ride pause carries no way to end a session there is none of', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.locator('.euc-menu--title [data-menu="start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
  await page.keyboard.press('Escape');
  await expect(page.locator('.euc-menu--pause')).toBeVisible();
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"]')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a real lap of the racing line counts, and the ghost joins the one after it', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });

  const ids = await lapSegments(page);
  const ride = await page.evaluate((segments) => {
    // Two laps of the ring from the corridor's own start, which is seventy
    // metres short of the line: the first crossing opens lap one and the second
    // closes it, so this is one *timed* lap plus the out lap that precedes it
    // and the beginning of the one that follows.
    const one = window.qa.routePoints(segments, 2);
    const points = [...one, ...one];
    const result = window.qa.followRoute(points, {
      lookAhead: 9,
      maxSteps: 40_000,
      // Under the hairpin's own lateral limit, so the corner is never what
      // stops the run — the same cap the free-ride lap of this venue uses.
      maxSpeed: 12,
      watch: 200,
    });
    return { result, lap: window.game.snapshot().trackDay };
  }, ids);

  expect(ride.result.crashes).toBe(0);
  expect(ride.result.blockedSteps).toBe(0);
  expect(ride.lap.lapsCounted, 'a clean lap of the racing line did not count').toBe(1);
  expect(ride.lap.lapsRidden).toBe(1);
  expect(ride.lap.lap).toBe(2);
  // A 930 m lap at a capped 12 m/s. Wide, because the point is that it is a lap
  // time and not a number: the follower is not a rider and its pace is its own.
  expect(ride.lap.bestLapSeconds).toBeGreaterThan(60);
  expect(ride.lap.bestLapSeconds).toBeLessThan(140);

  // The stored best is that lap, with the replay of it.
  const record = await page.evaluate(() => window.game.snapshot().record);
  expect(record.totalSeconds).toBeCloseTo(ride.lap.bestLapSeconds!, 6);
  expect(record.hasGhost).toBe(true);

  // And the ghost is on the road for the lap that followed, which is the one
  // thing a phantom lap cannot show: the recorder ran for a whole real lap and
  // the player is now racing it.
  expect((await lapState(page)).ghostVisible).toBe(true);
  const calls = await page.evaluate(() => window.game.snapshot().render.drawCalls);
  expect(calls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);

  expect(errors).toEqual([]);
});

test('a gamepad alone can pit, which is the mode’s own new control', async ({ page }) => {
  // **Three devices reach every control or the mode is not finished.** The
  // keyboard and a thumb are covered above and in `tests/touch.spec.ts`; this
  // is the pad, on the one control Track Day adds to a card the pad already
  // walked. It is not a test of `navigate()` — that is M9's — it is a test that
  // a button which is *hidden in every other ride* is in the focus order when
  // it is not, which is the half a conditional control gets wrong.
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
  await bootToTitle(page, 'level=track');
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

  // The pad is polled in `beforeFrame`, which `advance()` deliberately does not
  // run, so every press is two real animation frames.
  const press = async (button: number) => page.evaluate(async (index) => {
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

  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  const all = await lines(page);
  await crossLine(page, all[0], 30);
  await ridePhantomLap(page, all);

  await page.keyboard.press('Escape');
  await expect(page.locator('.euc-menu--pause [data-menu="resume"]')).toBeFocused();
  // One step down the pause card's real focus order. On every other ride that
  // press lands on New route, because End session is not there to be walked to.
  await press(13);
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"]')).toBeFocused();
  await press(0);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');
  await expect(page.locator('[data-menu="results-heading"]')).toHaveText('New best lap');

  expect(errors).toEqual([]);
});
