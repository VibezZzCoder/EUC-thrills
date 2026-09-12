/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { CHALLENGE, TRACK_DAY } from '../src/data/tuning.ts';
import { RENDER_BUDGET } from '../src/data/renderCost.ts';
import {
  SWITCHBACK_LAP_METRES,
  SWITCHBACK_LAP_SEGMENT_IDS,
} from '../src/level/switchbackLevel.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M36 Phase 1 — Switchback Park, through the game rather than through the plan.
 *
 * **`src/level/switchbackLevel.test.ts` already rides this venue**: it drives a
 * real `EucController` round the centreline and round the bypass half, feeds
 * every step to a live `TrackDayRun`, and counts both laps. Nothing below
 * repeats that. What it cannot reach is the *path a player takes* — the
 * entrance that chooses a venue, the referee the seat count picks, the store a
 * lap is filed in, the camera that has to show the line, the grid four people
 * stand on, and the counters a rebuilt world leaves behind on a GPU. Those are
 * browser questions and this is where they are asked.
 *
 * Three of these ride a whole lap, which is §36.8 Phase 1's own instruction
 * ("verify laps physically, not by teleporting between gates") and AGENTS.md's
 * checkpoint-mode rule. The cheap claims teleport, on `tests/m10.spec.ts`'s
 * argument — a lap per assertion would make every one of them a test of the
 * layout as much as of the thing it names.
 */

/** The diagnostic entrance. There is no chooser until Phase 5, on purpose. */
const PARK = 'level=switchback';

/**
 * The graybox's plan id — `-r2` is room to retire records (`switchbackLevel.ts`).
 *
 * Phase 2 moved the layout: beat 5 gained a take-off pitch and a level table,
 * the gap's landing deck dropped five centimetres, the spin shelf became a
 * flush deck with a 0.15 m roll-off and `bottom` gave thirty-two metres to the
 * closure. Every one of those changes a lap time, so the `-r1` records retire.
 */
const PLAN_ID = 'switchback-r4';

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

/** m23's helper, unchanged: stand on a gate long enough to be seen crossing it. */
async function crossLine(page: Page, line: Line, hold = 60): Promise<void> {
  await page.evaluate(({ centre, headingY, hold: steps }) => {
    window.game.placeRider({ x: centre.x, y: centre.y, z: centre.z }, headingY);
    window.game.advance(2);
    window.game.advance(steps);
  }, { centre: line.centre, headingY: line.headingY, hold });
}

/** Open a session and put the rider through one whole lap of gates. */
async function ridePhantomLap(page: Page, all: Line[], hold = 60): Promise<void> {
  for (const line of all.slice(1)) await crossLine(page, line, hold);
  await crossLine(page, all[0], 2);
}

/**
 * How many times a ridden path crossed each gate — m23's derivation, unchanged.
 *
 * Two consecutive samples on opposite sides of the gate's own plane and inside
 * its own width is a crossing, which is a test the sampling rate cannot fool.
 */
function gateCrossings(
  page: Page,
  path: readonly { x: number; z: number }[],
): Promise<{ id: string; count: number }[]> {
  return page.evaluate((samples) => {
    const gates = window.game.levelPlan.checkpoints;
    return gates.map((gate) => {
      const cos = Math.cos(gate.headingY);
      const sin = Math.sin(gate.headingY);
      const along = (p: { x: number; z: number }): number =>
        sin * (p.x - gate.centre.x) + cos * (p.z - gate.centre.z);
      const across = (p: { x: number; z: number }): number =>
        cos * (p.x - gate.centre.x) - sin * (p.z - gate.centre.z);
      let count = 0;
      for (let index = 1; index < samples.length; index += 1) {
        const before = along(samples[index - 1]);
        const after = along(samples[index]);
        if (before > 0 === after > 0) continue;
        const share = before / (before - after);
        const lateral = across(samples[index - 1])
          + share * (across(samples[index]) - across(samples[index - 1]));
        if (Math.abs(lateral) <= gate.halfExtents.x) count += 1;
      }
      return { id: gate.id, count };
    });
  }, path as { x: number; z: number }[]);
}

/**
 * The corridors of the lap, confirmed against what the plan actually built.
 *
 * m23's `lapSegments` shape: the ids come from the venue module so a corridor
 * that failed to build fails here rather than being quietly skipped.
 */
async function lapSegments(page: Page): Promise<string[]> {
  const built = await page.evaluate(
    () => window.game.levelPlan.segments.map((segment) => segment.id),
  );
  for (const id of SWITCHBACK_LAP_SEGMENT_IDS) expect(built).toContain(id);
  return [...SWITCHBACK_LAP_SEGMENT_IDS];
}

// ---------------------------------------------------------------------------
// The entrance
// ---------------------------------------------------------------------------

test('the diagnostic entrance builds the park and arms its lap referee', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);

  const built = await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    link: window.game.snapshot().world.link,
    search: window.location.search,
    trackDay: window.game.snapshot().trackDay,
    challenge: window.game.snapshot().challenge.available,
    chase: window.game.chaseAvailable,
  }));

  expect(built.planId).toBe(PLAN_ID);
  // The address reproduces the world, and the query parameter *is* the link.
  expect(built.link.endsWith(`?${PARK}`)).toBe(true);
  expect(built.search).toBe(`?${PARK}`);

  // The lap referee accepts the venue and the point-to-point one declines it,
  // with no branch anywhere on which world is loaded (invariant 2).
  expect(built.trackDay.available).toBe(true);
  expect(built.challenge).toBe(false);
  // And the chase declines it too: §13 q26 is generated routes only.
  expect(built.chase).toBe(false);

  // The referee measured the same ring the venue module states.
  expect(Math.round(built.trackDay.lapMetres)).toBe(Math.round(SWITCHBACK_LAP_METRES));

  expect(errors).toEqual([]);
});

test('Track Day keeps the park it was already on, through the title button', async ({ page }) => {
  // **The real door, walked** — AGENTS.md, "a mode with two doors is tested
  // through one of them": the QA bridge reaches a state without walking the
  // path, so this presses the control a player presses. Before §36.2 item 6's
  // fix, `enterTrackDay` tested `levelId !== 'track'` and this click took a
  // Switchback Park rider to BelVar.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe(PLAN_ID);

  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  await page.locator('.euc-menu--tracks [data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');

  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe(PLAN_ID);
  expect(await page.evaluate(() => window.location.search)).toBe(`?${PARK}`);

  const lap = await lapState(page);
  expect(lap.phase).toBe('outLap');
  expect(lap.lap).toBe(0);

  expect(errors).toEqual([]);
});

test('the same entrance arms the race referee on the park when two seats are sitting', async ({ page }) => {
  // The other door through the same entrance: Track Day versus Race is the seat
  // count and nothing else (§27.1), and the venue retention has to hold for the
  // referee this session is actually going to run rather than for its sibling.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const armed = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.laps', 1);
    game.startTrackDay();
    game.advance(2);
    return {
      planId: game.levelPlan.id,
      state: game.snapshot().app.state,
      phase: game.snapshot().race.phase,
      seats: game.seatCount,
      lapPhase: game.snapshot().trackDay.phase,
    };
  });

  expect(armed.seats).toBe(2);
  expect(armed.state).toBe('trackDay');
  expect(armed.phase).toBe('countdown');
  // The venue is retained, so a race is run where the room already was.
  expect(armed.planId).toBe(PLAN_ID);
  // And the single-seat referee is never armed for it.
  expect(armed.lapPhase).toBe('idle');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Two ridden laps
// ---------------------------------------------------------------------------

/**
 * Every ridden route below is the ring **plus the apron again**.
 *
 * A lap is opened *and* closed by the same line (`AGENTS.md`: a closed lap's
 * route is `start` then splits, with no `finish`), so a route that walks the
 * ring exactly once crosses that line once and counts nothing. The tail also
 * has to be longer than `lookAhead`, because the pursuit driver stops that far
 * short of its last point — and the line is 62 m along an 80 m apron, so the
 * whole apron is the smallest tail that works. `switchbackLevel.test.ts` takes
 * the identical shape headlessly.
 */

test('a safe centreline lap counts, ridden through the game, with no camera pull-in', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const ids = await lapSegments(page);

  const ride = await page.evaluate((segments) => {
    const game = window.game;
    // Warm up before measuring the camera: the first real frames compile
    // shaders and upload the world.
    game.loop.setRunning(false);
    game.advance(60);
    const wanted = game.snapshot().camera.distance;
    const ring = window.qa.routePoints(segments, 2);
    const points = [...ring, ...window.qa.routePoints(['apron'], 2)];
    const result = window.qa.followRoute(points, {
      lookAhead: 9,
      maxSteps: 45_000,
      // Seven, because R10 at eight is 0.65 g against the wheel's 0.75 and a
      // pure-pursuit driver enters a ten-metre radius already carrying a
      // heading error. It is a fact about the driver, not about the venue
      // (`switchbackLevel.test.ts` records the same number for the same reason).
      maxSpeed: 7,
      watch: 20,
    });
    return { result, wanted, lap: game.snapshot().trackDay, record: game.snapshot().record };
  }, ids);

  // Navigable end to end, without touching anything and without leaving the
  // trail. `offCourseSteps` is the terrain's verdict, not the referee's.
  expect(ride.result.finished).toBe(true);
  expect(ride.result.crashes).toBe(0);
  expect(ride.result.blockedSteps).toBe(0);
  expect(ride.result.offCourseSteps).toBe(0);

  // **And it never left the ground** — §36.3's central promise, ridden through
  // the game: a legal lap needs no hop, because every feature stands on the
  // rider's left and no socket join on the ring folds hard enough to launch.
  // It is also what makes the technical lap's `landings >= 4` mean something:
  // the two rides differ by 4.25 m of lateral offset and nothing else.
  expect(
    ride.result.landings,
    `the safe line was launched ${ride.result.landings} times`,
  ).toBe(0);

  // Each gate on the ridden line, and the line twice: once to open the lap and
  // once to close it.
  const crossings = await gateCrossings(page, ride.result.path);
  expect(crossings.map((gate) => gate.id)).toEqual(['line', 'sector-1', 'sector-2']);
  expect(crossings.find((gate) => gate.id === 'line')!.count).toBe(2);
  for (const gate of crossings.filter((each) => each.id !== 'line')) {
    expect(gate.count, `${gate.id} was crossed ${gate.count} times on one lap`).toBe(1);
  }

  // The referee counted it, and the store kept it: the park is not a probe
  // world, so a lap ridden on it is a lap filed against `switchback-r4`.
  expect(ride.lap.lapsRidden).toBe(1);
  expect(
    ride.lap.lapsCounted,
    `a clean centreline lap did not count (voided: ${ride.lap.voided})`,
  ).toBe(1);
  expect(ride.lap.lastLapSeconds).not.toBeNull();
  expect(
    ride.lap.lastLapSeconds!,
    `the safe lap took ${ride.lap.lastLapSeconds!.toFixed(2)} s over `
      + `${SWITCHBACK_LAP_METRES.toFixed(0)} m at a 7 m/s cap`,
  ).toBeGreaterThan(0);
  expect(ride.record.totalSeconds).toBeCloseTo(ride.lap.lastLapSeconds!, 6);

  // **The chase arm is never shortened anywhere on the lap** — m23's claim on a
  // hillside, where the cuttings rather than barriers are what could take it.
  // Phase 1's gate asks whether the owner can read each choice at speed and
  // this is the automated half of it.
  const base = ride.result.path[0].armDistance;
  const pulled = ride.result.path.filter((sample) => sample.armDistance < base - 1e-6);
  expect(
    pulled.length,
    `the camera pulled in on ${pulled.length} of ${ride.result.path.length} samples; `
      + `the arm started at ${base.toFixed(3)} m (wanted ${ride.wanted.toFixed(3)}) and reached `
      + `${Math.min(...ride.result.path.map((s) => s.armDistance)).toFixed(3)} m`,
  ).toBe(0);

  // The frame, measured over a real ride rather than from one resting camera.
  const peak = ride.result.path.reduce(
    (worst: { drawCalls: number; triangles: number }, sample) => ({
      drawCalls: Math.max(worst.drawCalls, sample.drawCalls),
      triangles: Math.max(worst.triangles, sample.triangles),
    }),
    { drawCalls: 0, triangles: 0 },
  );
  expect(peak.drawCalls, `peak draw calls ${peak.drawCalls}`)
    .toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  expect(peak.triangles, `peak triangles ${peak.triangles}`)
    .toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);

  expect(errors).toEqual([]);
});

/**
 * The technical line, as a lateral profile down the lap.
 *
 * Every feature stands at `PARK.wideT = 4.25` on the rider's LEFT and the right
 * half of each corridor is the bypass, so "ride the features" is "ride 4.25 m
 * left of the centreline on the corridors that carry them". The profile is
 * piecewise-linear in the *fraction along each corridor* so the line is
 * continuous at every socket — a polyline that jumped 4.25 m sideways at a join
 * would be a lane change the pursuit driver takes as a corner.
 *
 * **`timber` is ridden on the bypass until its last third, and that is a
 * finding rather than a preference.** A follower cannot hop, and both features
 * on that corridor are hop-gated by design: the skinny stands 0.30 m proud at
 * its start and the charged step-up 0.50 m, against a wheel that can mount
 * `WHEEL.pedalHeight × TERRAIN.stepUpPedalFactor` = 0.216 m. Aiming a hopless
 * rider at either is a bonk, not a jump. The offset comes back on after the
 * step-up ends (s = 26 of 46) so the line is on the left for the staircase,
 * whose treads are 0.15 m blocks and are therefore mountable from the side.
 */
const TECHNICAL_LINE: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  // Swing out across the entrance so the ledge at s = 4 is met already on line.
  entrance: [[0, 0], [1, 4.25]],
  'terrace-drop': [[0, 4.25], [1, 4.25]],
  'terrace-turn': [[0, 4.25], [1, 0]],
  timber: [[0, 0], [0.6, 0], [0.87, 4.25], [1, 4.25]],
  'timber-steps': [[0, 4.25], [1, 4.25]],
  'timber-turn': [[0, 4.25], [1, 4.25]],
  'rock-rhythm': [[0, 4.25], [1, 4.25]],
  'rhythm-turn': [[0, 4.25], [1, 0]],
  'shelf-in': [[0, 0], [0.15, 4.25], [1, 4.25]],
  'shelf-pad': [[0, 4.25], [1, 0]],
  // **Beat 5 is deliberately absent, and Phase 2's two new corridors with it.**
  // `kicker-lip` and `kicker-table` carry the take-off block at t = +4.5 with
  // its inner edge 0.9 m off the centreline, and this follower cannot hop — so
  // the line through the kicker clearing is the centreline, which is what every
  // corridor not named here falls back to. A corridor that were RENAMED would
  // fall back to the same centreline silently, which is why `lapSegments` above
  // asserts every id in `SWITCHBACK_LAP_SEGMENT_IDS` is in the built plan and
  // why the landing floor below is the thing that catches a degraded line.
};

test('a technical lap counts too, and the catch ground it lands on is legal', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const ids = await lapSegments(page);

  const ride = await page.evaluate(({ segments, profile }) => {
    const game = window.game;

    /** Left of a heading is `(dz, −dx)` — proved below before it is trusted. */
    const offset = (ids: readonly string[]): { x: number; z: number }[] => {
      const out: { x: number; z: number }[] = [];
      for (const id of ids) {
        const points = window.qa.routePoints([id], 2);
        const knots = profile[id] ?? [[0, 0], [1, 0]];
        for (let index = 0; index < points.length; index += 1) {
          const fraction = points.length < 2 ? 0 : index / (points.length - 1);
          let lateral = knots[knots.length - 1][1];
          for (let knot = 1; knot < knots.length; knot += 1) {
            if (fraction > knots[knot][0]) continue;
            const [a, av] = knots[knot - 1];
            const [b, bv] = knots[knot];
            lateral = b === a ? bv : av + ((fraction - a) / (b - a)) * (bv - av);
            break;
          }
          const before = points[Math.max(0, index - 1)];
          const after = points[Math.min(points.length - 1, index + 1)];
          const dx = after.x - before.x;
          const dz = after.z - before.z;
          const span = Math.hypot(dx, dz) || 1;
          out.push({
            x: points[index].x + (dz / span) * lateral,
            z: points[index].z - (dx / span) * lateral,
          });
        }
      }
      return out;
    };

    // **The sign, checked against a block rather than assumed.** The ledge deck
    // stands on `terrace-drop` at t = +4.25; if `(dz, −dx)` were the rider's
    // right, the offset line would be 8.5 m away from it instead of on it.
    const terrace = window.game.levelPlan.segments.find((each) => each.id === 'terrace-drop')!;
    const spine = window.qa.routePoints(['terrace-drop'], 2);
    const dx = spine[1].x - spine[0].x;
    const dz = spine[1].z - spine[0].z;
    const span = Math.hypot(dx, dz);
    const deck = terrace.colliders.reduce((best, collider) => (
      Math.hypot(collider.centre.x - spine[4].x, collider.centre.z - spine[4].z)
        < Math.hypot(best.centre.x - spine[4].x, best.centre.z - spine[4].z) ? collider : best
    ));
    const leftOfDeck = ((deck.centre.x - spine[0].x) * (dz / span))
      + ((deck.centre.z - spine[0].z) * (-dx / span));

    const ring = offset(segments);
    const points = [...ring, ...offset(['apron'])];
    const result = window.qa.followRoute(points, {
      lookAhead: 9,
      maxSteps: 45_000,
      // A metre under the safe lap's: this line meets nine decks and a
      // staircase, and the follower has to settle between them.
      maxSpeed: 6,
      watch: 20,
    });
    return { result, leftOfDeck, lap: game.snapshot().trackDay };
  }, { segments: ids, profile: TECHNICAL_LINE as Record<string, [number, number][]> });

  // The frame is what the venue module says it is: the blocks are on the left.
  expect(ride.leftOfDeck, 'the offset frame is mirrored — the features are on the other side')
    .toBeGreaterThan(2);

  expect(ride.result.finished).toBe(true);
  expect(ride.result.crashes).toBe(0);
  expect(ride.result.offCourseSteps).toBe(0);

  // **It actually left the ground**, which is what makes this a technical lap
  // and not the bypass under a different name: the ledge, the gap's catch and
  // its exit, the three staircase treads, the rhythm's three drops and the spin
  // shelf are all on this line.
  expect(
    ride.result.landings,
    `the technical line landed ${ride.result.landings} times, worst `
      + `"${ride.result.worstLanding}" — a bypass lands none`,
  ).toBeGreaterThanOrEqual(4);

  expect(ride.lap.lapsRidden).toBe(1);
  expect(
    ride.lap.lapsCounted,
    `the technical lap was voided (${ride.lap.voided}) — the catch ground is off the envelope`,
  ).toBe(1);
  expect(
    ride.lap.lastLapSeconds!,
    `the technical lap took ${ride.lap.lastLapSeconds?.toFixed(2)} s with `
      + `${ride.result.landings} landings at a 6 m/s cap`,
  ).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The rules, on this venue's own geometry
// ---------------------------------------------------------------------------

test('a lap that leaves the trail is ridden and not counted', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);

  await crossLine(page, all[0], 30);

  // The hillside beside the timber line. The envelope's reach is the corridor's
  // own half-width — read off `plan.lap`, which is the array the referee
  // actually judges against — plus `TRACK_DAY.offCourseMarginMetres`, so three
  // metres past the pair is outside by a margin nothing rounds away.
  //
  // **The clearance is computed against every span of the ring, not against
  // this corridor**, because a switchback folds the lap back on itself: three
  // metres clear of `timber` would mean nothing if it were inside the leg
  // running back the other way. `sampleGround().offCourse` is the wrong
  // question here and was the first draft's mistake — on a venue whose ground
  // is a `groundAt` hillside, the whole field is authored ground, so it reads
  // false sixty metres off the trail.
  const off = await page.evaluate(({ margin, clear }) => {
    const points = window.qa.routePoints(['timber'], 2);
    const middle = points[Math.floor(points.length / 2)];
    const next = points[Math.floor(points.length / 2) + 1];
    const dx = next.x - middle.x;
    const dz = next.z - middle.z;
    const span = Math.hypot(dx, dz);
    const lap = window.game.levelPlan.lap!;
    const nearest = lap.points.reduce((best, point) => (
      Math.hypot(point.x - middle.x, point.z - middle.z)
        < Math.hypot(best.x - middle.x, best.z - middle.z) ? point : best
    ));
    const out = nearest.halfWidth + margin + clear;
    // The rider's RIGHT is the negative of the left, which is the bypass side
    // and the one that carries no blocks to be stopped by on the way out.
    const x = middle.x - (dz / span) * out;
    const z = middle.z + (dx / span) * out;

    // `LapEnvelope.contains`'s own arithmetic, point to span, over the ring.
    let clearance = Infinity;
    for (let index = 0; index < lap.points.length - 1; index += 1) {
      const a = lap.points[index];
      const b = lap.points[index + 1];
      const ax = b.x - a.x;
      const az = b.z - a.z;
      const length = ax * ax + az * az;
      const t = length === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - a.x) * ax + (z - a.z) * az) / length));
      const distance = Math.hypot(x - (a.x + ax * t), z - (a.z + az * t));
      clearance = Math.min(clearance, distance - (Math.max(a.halfWidth, b.halfWidth) + margin));
    }

    window.game.placeRider({ x, y: 0, z }, Math.atan2(dx, dz));
    window.game.advance(2);
    return { halfWidth: nearest.halfWidth, out, clearance, surface: window.game.sampleGround(x, z).surface };
  }, { margin: TRACK_DAY.offCourseMarginMetres, clear: 3 });

  expect(off.halfWidth, 'the timber corridor is not eight metres wide any more').toBe(8);
  expect(
    off.clearance,
    `${off.out.toFixed(2)} m out is only ${off.clearance.toFixed(2)} m clear of the nearest `
      + `span of the ring (on ${off.surface}) — the cut is not outside the envelope`,
  ).toBeGreaterThan(2);

  const cut = await lapState(page);
  expect(cut.onCourse).toBe(false);
  expect(cut.voided).toBe('off-course');
  expect(cut.valid).toBe(false);

  // Round the rest of it, and the lap still does not count — coming back does
  // not un-ride the part that was missed.
  await ridePhantomLap(page, all);
  const closed = await lapState(page);
  expect(closed.lapsRidden).toBe(1);
  expect(closed.lapsCounted).toBe(0);
  expect(closed.bestLapSeconds).toBeNull();
  expect(await page.evaluate(() => window.game.snapshot().record.totalSeconds)).toBeNull();

  expect(errors).toEqual([]);
});

test('a reset returns to the pit-out on the apron and keeps the session', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);

  await crossLine(page, all[0], 30);
  await ridePhantomLap(page, all);
  const best = (await lapState(page)).bestLapSeconds;
  expect(best, 'the phantom lap crossed every gate and still did not count').not.toBeNull();

  // Mid-lap, with a clock worth losing.
  await crossLine(page, all[1], 240);
  expect((await lapState(page)).elapsed).toBeGreaterThan(1.5);

  await page.keyboard.press('KeyR');
  await page.evaluate(() => window.game.advance(2));

  const reset = await lapState(page);
  expect(reset.phase).toBe('outLap');
  expect(reset.lap).toBe(0);
  expect(reset.elapsed).toBe(0);
  // A spin is not a reason to lose the afternoon.
  expect(reset.bestLapSeconds).toBeCloseTo(best!, 6);
  expect(reset.lapsCounted).toBe(1);

  // **The pit-out, not the plan spawn.** `resetChallengeRider` stands the rider
  // `CHALLENGE.startRunupMetres` short of the start line so the first flying lap
  // is comparable with the fortieth; on this venue that is 44 m along the apron
  // and the plan's own spawn is at 0, so asserting the spawn here would be
  // asserting a layout rather than the rule.
  const where = await page.evaluate(({ runup }) => {
    const line = [...window.game.levelPlan.checkpoints]
      .sort((a, b) => a.routeIndex - b.routeIndex)[0];
    const euc = window.game.snapshot().euc;
    const x = line.centre.x - Math.sin(line.headingY) * runup;
    const z = line.centre.z - Math.cos(line.headingY) * runup;
    return {
      fromPitOut: Math.hypot(euc.position.x - x, euc.position.z - z),
      fromSpawn: Math.hypot(
        euc.position.x - window.game.levelPlan.spawn.position.x,
        euc.position.z - window.game.levelPlan.spawn.position.z,
      ),
      surface: euc.surface,
      offCourse: euc.offCourse,
    };
  }, { runup: CHALLENGE.startRunupMetres });

  expect(where.fromPitOut, `the reset landed ${where.fromPitOut.toFixed(2)} m from the pit-out`)
    .toBeLessThan(3);
  expect(where.surface).toBe('pavement');
  expect(where.offCourse).toBe(false);
  // The apron is the only pavement on the venue, so this is also "on the apron".
  expect(where.fromSpawn).toBeLessThan(80);

  expect(errors).toEqual([]);
});

test('race progress rises with the road and never jumps a switchback', async ({ page }) => {
  test.slow();
  // **The one thing `LapEnvelope.progressAt` can get wrong on this venue.**
  // §36.2 item 7: nearest-point progress does not distinguish stacked paths, and
  // a switchback puts two legs of the lap within tens of metres of each other.
  // A projection stolen by the adjacent leg would show as a progress step of
  // tens of metres between two samples a fifth of a second apart.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  const ids = await lapSegments(page);

  const run = await page.evaluate((segments) => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.countdownSeconds', 1);
    game.tuning.set('RACE.laps', 1);
    game.startTrackDay();
    // Past GO, with seat 1 idle on the grid throughout.
    game.advance(130);

    // **A local pursuit loop rather than `followRoute`.** The toolkit's driver
    // places the rider at its first point, and a teleport in a race is a void
    // (§27.3) — this one starts from the grid slot the entrance stood seat 0 on
    // and simply aims at the nearest route point ahead. The steering is the
    // toolkit's own two gains, unchanged, so the ride is the same ride.
    const ring = window.qa.routePoints(segments, 2);
    const points = [...ring, ...window.qa.routePoints(['apron'], 2)];
    const lookAhead = 9;
    const maxSpeed = 7;

    const start = game.snapshotFor(0).euc.position;
    let index = 0;
    let bestGap = Infinity;
    for (let candidate = 0; candidate < points.length; candidate += 1) {
      const gap = Math.hypot(points[candidate].x - start.x, points[candidate].z - start.z);
      if (gap < bestGap) { bestGap = gap; index = candidate; }
    }

    const progress: number[] = [];
    const laps: number[] = [];
    let steps = 0;
    while (steps < 45_000) {
      const euc = game.snapshotFor(0).euc;
      const { x, z } = euc.position;
      while (
        index < points.length - 1
        && Math.hypot(points[index].x - x, points[index].z - z) < lookAhead
      ) index += 1;
      if (index >= points.length - 1
        && Math.hypot(points[points.length - 1].x - x, points[points.length - 1].z - z)
          < lookAhead) break;

      const target = points[index];
      let error = Math.atan2(target.x - x, target.z - z) - euc.headingY;
      while (error > Math.PI) error -= Math.PI * 2;
      while (error < -Math.PI) error += Math.PI * 2;
      const eased = Math.max(0.25, 1 - Math.abs(error));
      game.setActionsFor(0, {
        throttle: euc.speed > maxSpeed ? 0 : eased,
        steer: Math.max(-1, Math.min(1, -error * 1.8)),
      });
      game.advance(2);
      steps += 2;

      if (steps % 10 < 2) {
        const race = game.snapshotFor(0).race;
        progress.push(race.riders[0].progressMetres);
        laps.push(race.riders[0].lapsCompleted);
        if (race.riders[0].finished) break;
      }
    }
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    return {
      progress,
      laps,
      steps,
      lapMetres: game.snapshot().trackDay.lapMetres,
      rider: game.snapshotFor(0).race.riders[0],
    };
  }, ids);

  expect(run.progress.length, 'the race ride produced no samples at all').toBeGreaterThan(200);
  // It got round: a rider who never opened a lap would sit at a negative
  // progress behind the line for the whole run.
  expect(Math.max(...run.progress)).toBeGreaterThan(SWITCHBACK_LAP_METRES * 0.9);

  // **The step, sample to sample.** Ten fixed steps at a 7 m/s cap is 0.58 m of
  // road; thirty metres is fifty times that and is the size of gap a stolen
  // projection produces on this layout (the shelf hairpin's legs are 20 m
  // apart, the rhythm's 32 m).
  let worstStep = 0;
  let worstAt = 0;
  const drops: { at: number; from: number; to: number }[] = [];
  for (let index = 1; index < run.progress.length; index += 1) {
    const step = run.progress[index] - run.progress[index - 1];
    if (step < 0) drops.push({ at: index, from: run.progress[index - 1], to: run.progress[index] });
    if (Math.abs(step) > worstStep) { worstStep = Math.abs(step); worstAt = index; }
  }

  // A lap that counts hands its metres to `lapsCompleted × length`, so the
  // sequence is continuous across the line; a lap that did not count evaporates
  // there, which is the one legitimate drop. Either way there is at most one.
  expect(
    drops.length,
    `progress fell ${drops.length} times: ${JSON.stringify(drops.slice(0, 5))}`,
  ).toBeLessThanOrEqual(1);
  if (drops.length === 1) {
    expect(drops[0].from - drops[0].to).toBeCloseTo(run.lapMetres, 0);
  }
  expect(
    worstStep,
    `the largest progress step was ${worstStep.toFixed(2)} m at sample ${worstAt} of `
      + `${run.progress.length} (lap ${run.lapMetres.toFixed(1)} m, ${run.steps} steps)`,
  ).toBeLessThanOrEqual(30);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The world, and the room that stands on it
// ---------------------------------------------------------------------------

test('rebuilding the park twelve times plateaus GPU objects', async ({ page }) => {
  // Invariant 10 on the fifth producer, and this one has a *function* for its
  // ground and its field cells: a missing `dispose` here is invisible until
  // something rebuilds it, and Track Day's retry does.
  const errors = collectErrors(page);
  await boot(page, PARK);

  const trace = await page.evaluate(() => {
    const game = window.game;
    const original = game.levelPlan;
    game.loop.setRunning(false);
    game.advance(60);
    const baseline = game.resources();

    const rounds: ReturnType<typeof game.resources>[] = [];
    for (let round = 0; round < 12; round += 1) {
      game.renderer.setLevel(game.buildLevel('switchback', 'euc'));
      // A step and a draw, so the world is uploaded rather than merely built.
      game.advance(2);
      rounds.push(game.resources());
    }
    game.renderer.setLevel(original);
    game.advance(2);
    return { baseline, rounds, restored: game.resources() };
  });

  for (let round = 1; round < trace.rounds.length; round += 1) {
    expect(
      trace.rounds[round],
      `rebuild ${round} moved the counters: ${JSON.stringify(trace.rounds[round - 1])} `
        + `then ${JSON.stringify(trace.rounds[round])}`,
    ).toEqual(trace.rounds[0]);
  }
  expect(trace.restored).toEqual(trace.baseline);

  expect(errors).toEqual([]);
});

test('leaving the park by the public door takes its session and its referee with it', async ({ page }) => {
  // The `installLevel` half of the plateau, walked rather than called: Track
  // Day on the park, ended from the pause card, then New route from the results
  // card — the three controls a player presses. Nothing brings the park *back*
  // without reloading the query parameter, which is Phase 5's chooser.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  await page.locator('.euc-menu--title [data-menu="track-day"]').click();
  await page.locator('.euc-menu--tracks [data-venue="switchback"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'trackDay');
  expect(await page.evaluate(() => window.game.levelPlan.id)).toBe(PLAN_ID);

  await page.keyboard.press('Escape');
  await expect(page.locator('.euc-menu--pause [data-menu="end-session"]')).toBeVisible();
  await page.locator('.euc-menu--pause [data-menu="end-session"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'results');

  await page.locator('.euc-menu--results [data-menu="new-route"]').click();
  await page.waitForFunction(
    () => window.game.snapshot().app.state === 'freeRide' && window.game.snapshot().world.generated,
    undefined,
    { timeout: 30_000 },
  );

  const after = await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    trackDay: window.game.snapshot().trackDay,
    race: window.game.snapshot().race.phase,
  }));
  expect(after.planId).not.toBe(PLAN_ID);
  expect(after.trackDay.phase).toBe('idle');
  // A generated course is point-to-point and carries no lap, so both referees
  // decline it — which is the same fact `enterTrackDay` now asks before it
  // swaps a world.
  expect(after.trackDay.available).toBe(false);
  expect(after.race).toBe('idle');

  expect(errors).toEqual([]);
});

test('a four-seat grid stands on the apron, spaced, level and behind the line', async ({ page }) => {
  // §36.8 Phase 1: check four-seat grid space *now*, before trees can hide a
  // layout fault. The apron is the only pavement on the venue and the only
  // corridor with no gradient at all, which is exactly what this asks for.
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const grid = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 4) game.spawnRider();
    game.clearRecords();
    game.tuning.set('RACE.countdownSeconds', 1);
    game.startTrackDay();
    game.advance(2);
    const line = [...game.levelPlan.checkpoints]
      .sort((a, b) => a.routeIndex - b.routeIndex)[0];
    const at = (seat: number) => {
      const euc = game.snapshotFor(seat).euc;
      return {
        x: euc.position.x,
        y: euc.position.y,
        z: euc.position.z,
        surface: euc.surface,
        offCourse: euc.offCourse,
      };
    };
    return {
      seats: game.seatCount,
      phase: game.snapshot().race.phase,
      line: { x: line.centre.x, z: line.centre.z, headingY: line.headingY },
      placed: [at(0), at(1), at(2), at(3)],
    };
  });

  expect(grid.seats).toBe(4);
  expect(grid.phase).toBe('countdown');

  const forwardX = Math.sin(grid.line.headingY);
  const forwardZ = Math.cos(grid.line.headingY);
  for (const [seat, where] of grid.placed.entries()) {
    const behind = -((where.x - grid.line.x) * forwardX + (where.z - grid.line.z) * forwardZ);
    expect(behind, `seat ${seat} is ${behind.toFixed(2)} m behind the line`).toBeGreaterThan(0);
    expect(where.surface, `seat ${seat} is on ${where.surface}`).toBe('pavement');
    expect(where.offCourse).toBe(false);
  }
  for (let a = 0; a < 4; a += 1) {
    for (let b = a + 1; b < 4; b += 1) {
      const apart = Math.hypot(
        grid.placed[a].x - grid.placed[b].x,
        grid.placed[a].z - grid.placed[b].z,
      );
      expect(apart, `seats ${a} and ${b} are ${apart.toFixed(2)} m apart`).toBeGreaterThanOrEqual(1.5);
    }
  }
  const heights = grid.placed.map((where) => where.y);
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(spread, `the grid's four heights spread ${spread.toFixed(3)} m`).toBeLessThanOrEqual(0.05);

  // And a couple of seconds of the count and the release does not spill anyone.
  const after = await page.evaluate(() => {
    window.game.advance(200);
    return [0, 1, 2, 3].map((seat) => {
      const euc = window.game.snapshotFor(seat).euc;
      return { crashed: euc.crashed, onCourse: !euc.offCourse };
    });
  });
  for (const [seat, state] of after.entries()) {
    expect(state.crashed, `seat ${seat} crashed on the grid`).toBe(false);
    expect(state.onCourse, `seat ${seat} left the apron on the grid`).toBe(true);
  }

  expect(errors).toEqual([]);
});

test('?level=switchback&mph=50 is the same park on a slower wheel, and files nothing', async ({ page }) => {
  const errors = collectErrors(page);

  // The shipped wheel first, so the comparison is against a number this build
  // actually produces rather than against a constant copied from §30.
  //
  // `bootToTitle` rather than `boot` in both halves, and it is load-bearing:
  // `freeRide` lists no `trackDay` successor, so `startTrackDay` from a started
  // ride is refused before it arms anything and the phantom lap below would
  // cross three gates nobody was listening to.
  await bootToTitle(page, PARK);
  const shipped = await page.evaluate(() => window.game.controller.derivedTopSpeed);

  await bootToTitle(page, `${PARK}&mph=50`);
  const probe = await page.evaluate(() => ({
    planId: window.game.levelPlan.id,
    link: window.game.snapshot().world.link,
    href: window.location.href,
    derivedTopSpeed: window.game.controller.derivedTopSpeed,
    persistent: window.game.records.persistent,
  }));

  // The same venue, from the same producer.
  expect(probe.planId).toBe(PLAN_ID);
  // `worldLink` rewrites `level` and `seed` and preserves everything else, so
  // the park's link still carries the wheel it is being ridden on.
  const params = new URL(probe.link).searchParams;
  expect(params.get('level')).toBe('switchback');
  expect(params.get('mph')).toBe('50');
  expect(params.get('seed')).toBeNull();
  expect(probe.link).toBe(probe.href);

  // A slower wheel, and the comparison is the assertion: two boots, one number.
  expect(probe.derivedTopSpeed).toBeLessThan(shipped);

  // **And nothing reaches the store**, which is the half `?mph=` exists for:
  // a record has no tuning fingerprint, so a lap set on the 50 mph wheel would
  // be a cheat by accident on the 65 mph leaderboard (§30.2 fact 8). The store
  // is able to save — that is what makes the refusal mean anything.
  expect(probe.persistent).toBe(true);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });
  const all = await lines(page);
  await crossLine(page, all[0], 30);
  await ridePhantomLap(page, all);

  const filed = await page.evaluate(() => ({
    lap: window.game.snapshot().trackDay,
    record: window.game.snapshot().record,
    best: window.game.records.best(window.game.levelPlan.id),
  }));
  // The lap itself counted — this is the store refusing, not the referee.
  expect(filed.lap.lapsCounted).toBe(1);
  expect(filed.record.totalSeconds).toBeNull();
  expect(filed.record.hasGhost).toBe(false);
  expect(filed.best).toBeNull();

  expect(errors).toEqual([]);
});
