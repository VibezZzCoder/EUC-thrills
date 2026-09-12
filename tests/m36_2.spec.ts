/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { CAMERA } from '../src/data/tuning.ts';
import { markingWidth, PARK_SIGN_WORDS, SIGNS as SIGNS_TUNING } from '../src/data/markings.ts';
import {
  RENDER_BUDGET,
  RENDER_BUDGET_QUAD,
  RENDER_BUDGET_SPLIT,
} from '../src/data/renderCost.ts';
import {
  SWITCHBACK_ENTRY_DISTANCE,
  SWITCHBACK_LAP_METRES,
  SWITCHBACK_LAP_SEGMENT_IDS,
  SWITCHBACK_PALETTE,
  SWITCHBACK_SIGNAGE,
  SWITCHBACK_TURN_ARROWS,
} from '../src/level/switchbackLevel.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { turnArrowMarkings } from '../src/level/parkTurnArrows.ts';

/**
 * M36 Phase 2 — the signed park, through the browser (`docs/PLANS.md` 23065).
 *
 * Phase 2 did two things `tests/m36.spec.ts` cannot see. It moved beat 5 (a
 * take-off pitch and a level table), and it painted nine signs, nine signposts
 * and 949 m² of boardwalk onto a graybox that until now emitted no props and
 * no paint at all. The headless suite proves the geometry and the arithmetic;
 * `src/level/switchbackLevel.test.ts` and `src/level/parkSignage.test.ts` are
 * 144 tests of exactly that, and nothing below repeats them.
 *
 * What only a browser can answer is Phase 2's own gate, which is about a
 * player *seeing* the instruction: the plan the game installed carries the
 * signage the venue module publishes, the renderer built the paint and the
 * boardwalk into the frame it draws, the frame still fits all three render
 * contracts at one, two and four seats, the two laps still count with the new
 * geometry underneath them, **no sign is the thing that pulls the chase camera
 * in on the approach it exists to make readable**, and the marks are legible at
 * the three view sizes §36.4 names — a desktop pane, a quarter of a four-seat
 * couch frame, and a phone held both ways.
 *
 * **The mobile half is viewport emulation and says so.** `playwright.config.ts`
 * gives the `mobile` project `testMatch: /touch\.spec\.ts/`, so this file
 * cannot run there without a config change this agent does not own; the phone
 * shots below set a Pixel 7's CSS viewport inside the chromium project at
 * device-pixel-ratio 1, which is the *conservative* case for legibility (a real
 * Pixel 7 renders the same CSS box with 2.625× the device pixels). No touch
 * claim is made here.
 */

/** The diagnostic entrance. There is no chooser until Phase 5, on purpose. */
const PARK = 'level=switchback';

/** Phase 2's plan id — beat 5 moved, so the `-r1` records retire. */
const PLAN_ID = 'switchback-r4';

/** Where the legibility PNGs are filed for the owner's Phase 2 gate. */
// Screenshots land under a RELATIVE, git-ignored default — never an absolute
// path written down here: a scratchpad path carries the owner's account name
// and the source export refuses to publish a tree containing one (the
// private-token scan). `M36_SHOTS=<dir>` redirects them.
const SHOTS = `${process.env.M36_SHOTS ?? 'test-results/m36'}/phase2`;

/**
 * The technical line, as a lateral profile down the lap — `tests/m36.spec.ts`.
 *
 * Copied rather than exported because it is that spec's hand-authored claim
 * about where the features stand, and a shared constant would let a rename
 * degrade both rides at once without either noticing. Beat 5 is deliberately
 * absent for the reason m36 states: the follower cannot hop and the lip block
 * is 0.9 m clear of the centreline, so the centreline is the right line there.
 */
const TECHNICAL_LINE: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
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
};

/** The three signs §36.8 names for the legibility pass, in riding order. */
const LEGIBILITY = ['stairs', 'kicker', 'spinShelf'] as const;

/**
 * The follower's cap on every approach ride, m/s.
 *
 * Not the measured approach speed, and the difference is a fact about the
 * driver rather than about the signs: the stairs' sign stands on a 90° bend,
 * the kicker's and the spin shelf's two thirds of the way round a 16 m hairpin,
 * and `followRoute` is a two-gain pure-pursuit driver with no eyes that
 * `tests/m36.spec.ts` already has to hold to 7 m/s on this venue's corners.
 * Eight is the fastest that keeps every approach on the trail. The camera's arm
 * and field of view ease with speed (`CAMERA.speedReference` 29.06 m/s), so
 * each shot is taken at an arm of about 4.7 m rather than the 5.6 m a 22 m/s
 * kicker approach would give — a **tighter** frame than the real one, which is
 * the safe direction for a legibility check.
 */
const APPROACH_CAP = 8;

/** How long a rider is given to read a sign and decide — `data/markings.ts`. */
const SIGNS_READ_SECONDS = SIGNS_TUNING.readSeconds;

interface RoutePoint {
  x: number;
  z: number;
  /** Metres round the lap at this point, from the apron's entry socket. */
  lap: number;
}

/**
 * Both ridden lines of the park, with a lap distance on every point.
 *
 * Passed to `page.evaluate` by reference, so it may not close over anything in
 * this module — every input arrives in the argument. The centreline comes from
 * `qa.routePoints`, which reconstructs a corridor's arc from its two sockets
 * (so the polyline is the plan's, not the venue module's), and the technical
 * line is that polyline pushed to the rider's left by the profile above.
 * "Left" is `(dz, −dx)`; the callers below prove it against a real deck rather
 * than trusting it.
 */
function buildParkRoutes(input: {
  segments: readonly string[];
  entry: Record<string, number>;
  profile: Record<string, readonly (readonly [number, number])[]>;
  spacing: number;
}): { centre: RoutePoint[]; technical: RoutePoint[] } {
  const centre: RoutePoint[] = [];
  const technical: RoutePoint[] = [];
  let carried = 0;
  for (const id of input.segments) {
    const points = window.qa.routePoints([id], input.spacing);
    const knots = input.profile[id] ?? [[0, 0], [1, 0]];
    const base = input.entry[id];
    let along = 0;
    for (let index = 0; index < points.length; index += 1) {
      if (index > 0) {
        along += Math.hypot(
          points[index].x - points[index - 1].x,
          points[index].z - points[index - 1].z,
        );
      }
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
      // The apron is ridden twice — once as the ring's first corridor and once
      // as the tail that closes the lap — so the tail's lap distances continue
      // past the ring rather than wrapping back to zero.
      const lap = (base === undefined ? carried : base) + along;
      centre.push({ x: points[index].x, z: points[index].z, lap });
      technical.push({
        x: points[index].x + (dz / span) * lateral,
        z: points[index].z - (dx / span) * lateral,
        lap,
      });
    }
    carried = centre[centre.length - 1].lap;
  }
  return { centre, technical };
}

/**
 * Ride a slice of the lap, watching one sign on the screen, and stop on it.
 *
 * **The pursuit loop is written out here rather than borrowed from
 * `qa.followRoute`, and that is the only reason this function exists.**
 * `followRoute` reports a path and a camera arm, both world-space; the question
 * Phase 2 asks is a screen-space one — *is the mark in the frame, for long
 * enough to read* — and the only measurement in the suite that can answer it is
 * `qa.projectPoint`, which has to be called while the ride is running. The two
 * gains, the throttle easing, the speed cap and the two-step cadence are
 * `tests/harness.ts`'s, so this driver rides the same way that one does; it
 * stops the same way too, within `lookAhead` of the last point.
 */
function rideAndWatch(input: {
  route: readonly { x: number; z: number }[];
  /** The mark being watched, in its own corridor's `(s, t)` frame. */
  target: { segment: string; s: number; t: number };
  maxSpeed: number;
  lookAhead: number;
  maxSteps: number;
}): {
  x: number;
  z: number;
  speed: number;
  armDistance: number;
  fov: number;
  offCourseSteps: number;
  crashes: number;
  /** Seconds of the approach on which the mark was inside the frame. */
  readableSeconds: number;
  /** Seconds of the longest unbroken spell of that. */
  longestSpell: number;
  rideSeconds: number;
  target: { x: number; y: number; z: number };
  /** Where the mark sat on screen when it was closest to the middle. */
  bestNdc: { x: number; y: number };
} {
  const game = window.game;
  game.loop.setRunning(false);

  // The mark's world point, from the corridor's two sockets — the same arc
  // reconstruction `qa.routePoints` uses, extended by a lateral offset.
  const segment = game.levelPlan.segments.find((each) => each.id === input.target.segment)!;
  const turn = segment.exit.headingY - segment.entry.headingY;
  const chord = Math.hypot(
    segment.exit.position.x - segment.entry.position.x,
    segment.exit.position.z - segment.entry.position.z,
  );
  const length = Math.abs(turn) < 1e-9 ? chord : (chord * (turn / 2)) / Math.sin(turn / 2);
  const curvature = length > 0 ? turn / length : 0;
  const h0 = segment.entry.headingY;
  const h = h0 + curvature * input.target.s;
  const spine = Math.abs(curvature) < 1e-9
    ? {
      x: segment.entry.position.x + Math.sin(h0) * input.target.s,
      z: segment.entry.position.z + Math.cos(h0) * input.target.s,
    }
    : {
      x: segment.entry.position.x + (Math.cos(h0) - Math.cos(h)) / curvature,
      z: segment.entry.position.z + (Math.sin(h) - Math.sin(h0)) / curvature,
    };
  // Left of the heading, which is the side every feature and every chevron
  // stack stands on.
  const mark = {
    x: spine.x + Math.cos(h) * input.target.t,
    z: spine.z - Math.sin(h) * input.target.t,
  };
  const target = {
    x: mark.x,
    y: game.sampleGround(mark.x, mark.z).height + 0.02,
    z: mark.z,
  };

  game.clearActions();
  const start = input.route[0];
  const next = input.route[1];
  game.placeRider(
    { x: start.x, y: 0, z: start.z },
    Math.atan2(next.x - start.x, next.z - start.z),
  );

  let index = 0;
  let steps = 0;
  let offCourseSteps = 0;
  let inFrame = 0;
  let spell = 0;
  let longest = 0;
  let best = { x: 2, y: 2 };
  const crashesBefore = game.snapshot().euc.crashes;

  while (steps < input.maxSteps) {
    const euc = game.snapshot().euc;
    const { x, z } = euc.position;
    while (
      index < input.route.length - 1
      && Math.hypot(input.route[index].x - x, input.route[index].z - z) < input.lookAhead
    ) index += 1;
    if (index >= input.route.length - 1
      && Math.hypot(
        input.route[input.route.length - 1].x - x,
        input.route[input.route.length - 1].z - z,
      ) < input.lookAhead) break;

    const aim = input.route[index];
    let error = Math.atan2(aim.x - x, aim.z - z) - euc.headingY;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, -error * 1.8));
    const eased = Math.max(0.25, 1 - Math.abs(error));
    game.setActions({ throttle: euc.speed > input.maxSpeed ? 0 : eased, steer });
    game.advance(2);
    steps += 2;

    const after = game.snapshot().euc;
    if (after.offCourse) offCourseSteps += 1;
    const screen = window.qa.projectPoint(target.x, target.y, target.z);
    const visible = screen.inFront && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1;
    if (visible) {
      inFrame += 1;
      spell += 1;
      longest = Math.max(longest, spell);
      if (Math.hypot(screen.x, screen.y) < Math.hypot(best.x, best.y)) {
        best = { x: screen.x, y: screen.y };
      }
    } else {
      spell = 0;
    }
  }

  const snapshot = game.snapshot();
  game.clearActions();
  return {
    x: snapshot.euc.position.x,
    z: snapshot.euc.position.z,
    speed: snapshot.euc.speed,
    armDistance: snapshot.camera.armDistance,
    fov: snapshot.camera.fov,
    offCourseSteps,
    crashes: snapshot.euc.crashes - crashesBefore,
    readableSeconds: (inFrame * 2) / 120,
    longestSpell: (longest * 2) / 120,
    rideSeconds: steps / 120,
    target,
    bestNdc: best,
  };
}

/** The signage the venue module publishes, flattened for the browser. */
const SIGNS = SWITCHBACK_SIGNAGE.signs.map((sign) => ({
  feature: sign.feature,
  segment: sign.segment,
  fromS: sign.fromS,
  toS: sign.toS,
  lapDistance: sign.lapDistance,
  commitDistance: sign.commitDistance,
  lead: sign.lead,
  requiredLead: sign.requiredLead,
  approachMps: sign.approachMps,
  words: [...sign.words],
  postCameraGap: sign.postCameraGap,
}));

/** Entry distances as a plain object, because a `Map` does not cross the wire. */
const ENTRY: Record<string, number> = Object.fromEntries(SWITCHBACK_ENTRY_DISTANCE);

/** The ring plus the apron again — a lap is opened and closed by the same line. */
const RING_AND_TAIL: readonly string[] = [...SWITCHBACK_LAP_SEGMENT_IDS, 'apron'];

/** Save a PNG where the owner's Phase 2 gate can find it, and attach it. */
async function shoot(page: Page, info: TestInfo, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const body = await page.screenshot();
  const path = `${SHOTS}/${name}.png`;
  writeFileSync(path, body);
  await info.attach(name, { body, contentType: 'image/png' });
  return path;
}

/**
 * Stand the rider on the approach to one sign and photograph what it sees.
 *
 * The slice starts sixty metres before the first paint and ends four metres
 * before it, so the whole sign — the chevron stack on the rider's left, the
 * bypass arrow on their right, and the word where there is one — is in front of
 * the camera and none of it is under the wheel.
 */
async function shootApproach(
  page: Page,
  info: TestInfo,
  routes: { centre: RoutePoint[] },
  feature: string,
  label: string,
): Promise<{
  file: string;
  standoff: number;
  speed: number;
  arm: number;
  readableSeconds: number;
  longestSpell: number;
  rideSeconds: number;
}> {
  const sign = SIGNS.find((each) => each.feature === feature)!;
  const padStart = sign.lapDistance - (sign.toS - sign.fromS);
  const slice = (from: number, to: number): { x: number; z: number }[] => routes.centre
    .filter((point) => point.lap >= from && point.lap <= to)
    .map((point) => ({ x: point.x, z: point.z }));
  // **The chevron stack, which is the last thing on the pad and the mark the
  // lead rule is measured to.** Two metres inside the pad's far edge, and at
  // `t = +4`, which is inside every one of the nine pads' lateral spans (the
  // technical lines run 3.5–4.75 m left of the centreline) — so one number
  // watches every sign without the caller having to carry nine.
  const target = { segment: sign.segment, s: sign.toS - 2, t: 4 };

  // **The reading ride runs all the way to the last mark**, because that is the
  // window the rule actually buys: `lead` metres of trail are promised AFTER
  // the rider passes the paint, and everything before that point is time they
  // have to see it in. Stopping short of the pad would ask the sign to be
  // readable from further away than the rule ever claimed.
  const read = await page.evaluate(rideAndWatch, {
    route: slice(padStart - 60, sign.lapDistance),
    target,
    maxSpeed: APPROACH_CAP,
    lookAhead: 8,
    maxSteps: 12_000,
  });
  expect(read.crashes, `${label}: the reading ride to ${feature} crashed`).toBe(0);

  // The photograph is a second, shorter ride that stops four metres short of
  // the first paint, so the whole sign is in front of the wheel in the frame.
  const stopped = await page.evaluate(rideAndWatch, {
    route: slice(padStart - 60, padStart - 4),
    target,
    maxSpeed: APPROACH_CAP,
    lookAhead: 8,
    maxSteps: 12_000,
  });
  expect(stopped.crashes, `${label}: the approach to ${feature} crashed`).toBe(0);
  expect(stopped.offCourseSteps, `${label}: the approach to ${feature} left the trail`).toBe(0);

  // Where it actually stopped, in lap metres, against the paint it is looking at.
  const nearest = routes.centre.reduce((best, point) => (
    Math.hypot(point.x - stopped.x, point.z - stopped.z)
      < Math.hypot(best.x - stopped.x, best.z - stopped.z) ? point : best
  ));
  const standoff = padStart - nearest.lap;
  const file = await shoot(page, info, `${label}-${feature}`);
  return {
    file,
    standoff,
    speed: stopped.speed,
    arm: stopped.armDistance,
    readableSeconds: read.readableSeconds,
    longestSpell: read.longestSpell,
    rideSeconds: read.rideSeconds,
  };
}

// ---------------------------------------------------------------------------
// 1. The installed plan, and the frame it costs
// ---------------------------------------------------------------------------

test('the game installs the signed park, and its frame fits all three contracts', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);

  const installed = await page.evaluate(() => {
    const plan = window.game.levelPlan;
    const paints: Record<string, number> = {};
    const widths: Record<string, number> = {};
    const centroids: { x: number; z: number }[] = [];
    for (const marking of plan.markings ?? []) {
      paints[marking.paint] = (paints[marking.paint] ?? 0) + 1;
      const key = marking.width.toFixed(2);
      widths[key] = (widths[key] ?? 0) + 1;
      let x = 0;
      let z = 0;
      for (const point of marking.points) { x += point.x; z += point.z; }
      centroids.push({ x: x / marking.points.length, z: z / marking.points.length });
    }
    return {
      planId: plan.id,
      props: (plan.props ?? []).map((prop) => ({
        kind: prop.kind,
        x: prop.position.x,
        z: prop.position.z,
      })),
      markings: (plan.markings ?? []).length,
      paints,
      widths,
      // What the sampler says is under every mark — the boardwalk, through the
      // same `TerrainSampler` the simulation reads, not through the plan.
      under: centroids.map((point) => window.game.sampleGround(point.x, point.z).surface),
      hazards: plan.hazards === undefined,
      targets: plan.targets === undefined,
      palette: plan.palette === undefined ? null : { ...plan.palette },
      scene: window.qa.terrainScene(),
    };
  });

  expect(installed.planId).toBe(PLAN_ID);

  // **The signage the module publishes is the signage the game installed.**
  const authored = [...SWITCHBACK_SIGNAGE.markings.values()]
    .reduce((total, runs) => total + runs.length, 0);
  const posts = [...SWITCHBACK_SIGNAGE.props.values()]
    .reduce((total, props) => total + props.length, 0);
  // Phase 4's dressing (the forest, rails, benches, cribbing) shares the
  // installed prop list with Phase 2's signposts, so the signage claim is made
  // on the signposts alone.
  const signposts = installed.props.filter((prop) => prop.kind === 'signpost');
  expect(installed.markings).toBe(authored + SWITCHBACK_TURN_ARROWS.length * 2);
  expect(signposts.length).toBe(posts);
  expect(signposts.length).toBe(SIGNS.length);

  // The vocabulary, by the width that carries it: chevrons and words on the
  // glyph line, the bypass arrows and the landing boxes' sides on the edge
  // line, and the two threshold bars — the only red on the venue — on the bar.
  expect(installed.widths[markingWidth('glyph').toFixed(2)]).toBe(67);
  expect(installed.widths[markingWidth('edge').toFixed(2)]).toBe(24);
  expect(installed.widths[markingWidth('bar').toFixed(2)]).toBe(2);
  expect(installed.paints).toEqual({ road: 59, path: 18, kerb: 2, ink: 14 });

  // The words, and only the words §36.4 asked for.
  const spoken = SIGNS.flatMap((sign) => sign.words);
  expect(spoken).toEqual(['DROP', 'DOWN', 'AIR', '180', 'TAP']);
  for (const word of spoken) expect(PARK_SIGN_WORDS).toContain(word);

  // **Every mark stands on boardwalk**, read through the sampler rather than
  // through the plan: `dirt` is not paintable and a run that drifted off its
  // patch would be clipped away silently rather than fail anything.
  expect(new Set(installed.under)).toEqual(new Set(['wood']));

  // **No hazards and no targets, and a palette that is now Phase 4's.**
  // This assertion read `plan.palette === undefined` while Phase 2 was the
  // whole of the park — "signage and nothing else". Phase 4's dressing shipped
  // the retint the milestone asks for (a landing has to read brighter than the
  // ground beside it, and the kit shipped `wood` as the darkest of the three),
  // so the claim is re-pinned rather than deleted: the park carries **exactly**
  // three overrides, all of them `MaterialId`s the library already draws, which
  // is what keeps the draw-call set union — and `LIBRARY_MAX_DRAW_CALLS` — where
  // it was. A fourth key, or a new material, fails here.
  expect(installed.hazards).toBe(true);
  expect(installed.targets).toBe(true);
  expect(installed.palette).toEqual({ grass: 0x405332, dirt: 0x6b5945, wood: 0x796854 });
  expect(installed.palette).toEqual({ ...SWITCHBACK_PALETTE });

  // The renderer built it: all the paint on one mesh (identity travels on the
  // vertex colour), and a fifth surface group on the heightfield for the wood.
  expect(installed.scene.paint.meshes).toBe(1);
  expect(installed.scene.paint.triangles).toBeGreaterThan(0);
  expect(installed.scene.paint.castsShadow).toBe(false);
  expect(installed.scene.heightfieldGroups).toBe(5);

  // **The frame, at one, two and four seats.** Contract 1 is the solo frame,
  // contract 2 the two-seat split and contract 3 the four-seat grid; the
  // signage was priced against all three headlessly and this is the live
  // renderer's own count of what it drew.
  const frames = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const measured: { seats: number; drawCalls: number; triangles: number }[] = [];
    for (const wanted of [1, 2, 4]) {
      while (game.seatCount < wanted) game.spawnRider();
      game.advance(12);
      const frame = game.snapshot().render;
      measured.push({ seats: game.seatCount, ...frame });
    }
    return measured;
  });

  const contracts = [RENDER_BUDGET, RENDER_BUDGET_SPLIT, RENDER_BUDGET_QUAD];
  for (const [index, frame] of frames.entries()) {
    const budget = contracts[index];
    expect(frame.seats).toBe([1, 2, 4][index]);
    expect(
      frame.drawCalls,
      `${frame.seats} seats drew ${frame.drawCalls} calls against ${budget.maxDrawCalls}`,
    ).toBeLessThanOrEqual(budget.maxDrawCalls);
    expect(
      frame.triangles,
      `${frame.seats} seats drew ${frame.triangles} triangles against ${budget.maxTriangles}`,
    ).toBeLessThanOrEqual(budget.maxTriangles);
  }
  // eslint-disable-next-line no-console
  console.log('[m36_2] frames', JSON.stringify(frames));

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. The two laps, on the moved geometry and the new surfaces
// ---------------------------------------------------------------------------

test('a safe centreline lap still counts with the boardwalk under it', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });

  const routes = await page.evaluate(buildParkRoutes, {
    segments: RING_AND_TAIL,
    entry: ENTRY,
    profile: TECHNICAL_LINE as Record<string, [number, number][]>,
    spacing: 2,
  });

  const ride = await page.evaluate((points) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(60);
    const result = window.qa.followRoute(points, {
      lookAhead: 9,
      maxSteps: 45_000,
      maxSpeed: 7,
      watch: 2,
    });
    return { result, lap: game.snapshot().trackDay };
  }, routes.centre.map((point) => ({ x: point.x, z: point.z })));

  expect(ride.result.finished).toBe(true);
  expect(ride.result.crashes).toBe(0);
  expect(ride.result.blockedSteps).toBe(0);
  // **The boardwalk is a surface change on the riding line**, so the claim the
  // signage pass has to keep is that it changed nothing the referee reads: the
  // safe line is still inside the envelope every metre of the way.
  expect(ride.result.offCourseSteps).toBe(0);
  // And it still never leaves the ground: 949 m² of planking did not build a
  // kicker by accident.
  expect(
    ride.result.landings,
    `the safe line was launched ${ride.result.landings} times`,
  ).toBe(0);

  expect(ride.lap.lapsRidden).toBe(1);
  expect(
    ride.lap.lapsCounted,
    `a clean centreline lap did not count (voided: ${ride.lap.voided})`,
  ).toBe(1);
  expect(Math.round(ride.lap.lapMetres)).toBe(Math.round(SWITCHBACK_LAP_METRES));

  expect(errors).toEqual([]);
});

test('a technical lap counts, and no sign pulls the camera in on its own approach', async ({ page }, info) => {
  test.slow();
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => { window.game.clearRecords(); window.game.startTrackDay(); });

  const routes = await page.evaluate(buildParkRoutes, {
    segments: RING_AND_TAIL,
    entry: ENTRY,
    profile: TECHNICAL_LINE as Record<string, [number, number][]>,
    spacing: 2,
  });

  const ride = await page.evaluate((points) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(60);

    // **The frame, checked against a block rather than assumed** — m36's own
    // guard: the ledge deck stands on `terrace-drop` at t = +4.25, so if
    // `(dz, −dx)` were the rider's right the offset line would be 8.5 m from
    // it instead of on it.
    const terrace = game.levelPlan.segments.find((each) => each.id === 'terrace-drop')!;
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

    const result = window.qa.followRoute(points, {
      lookAhead: 9,
      maxSteps: 45_000,
      maxSpeed: 6,
      // Every other step, which is the finest this driver can offer: it steps
      // in twos. The obstruction pull-in engages over 0.05 s — six steps — so a
      // coarser watch could step over the dip it exists to catch.
      watch: 2,
    });
    return { result, leftOfDeck, lap: game.snapshot().trackDay };
  }, routes.technical.map((point) => ({ x: point.x, z: point.z })));

  expect(ride.leftOfDeck, 'the offset frame is mirrored — the features are on the other side')
    .toBeGreaterThan(2);
  expect(ride.result.finished).toBe(true);
  expect(ride.result.crashes).toBe(0);
  expect(ride.result.offCourseSteps).toBe(0);
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

  // -- The camera, sample by sample --------------------------------------
  //
  // `armDistance` is the arm *after* the obstruction pull-in and the camera's
  // own resting arm is `CAMERA.distanceAtRest`; the speed easing only ever
  // lengthens it and a crash lengthens it further (`CAMERA.crashDistance` is
  // 14.97 m). So a sample below the resting arm can only be the world pulling
  // the camera in, and 4.2 m is a threshold with a meaning rather than a
  // tolerance. `p2-integrate` reports every one of the nine posts standing
  // 6.35 m clear of its technical line — `CAMERA.distanceAtSpeed` plus
  // `obstructionRadius` exactly — and this is that claim ridden.
  const floor = CAMERA.distanceAtRest;
  const nearestLap = (x: number, z: number): number => routes.technical.reduce(
    (best, point) => (
      Math.hypot(point.x - x, point.z - z) < Math.hypot(best.x - x, best.z - z) ? point : best
    ),
  ).lap;

  const perFeature = SIGNS.map((sign) => {
    // From ten metres before the first paint to the point the feature can no
    // longer be refused: the whole window the sign has to survive.
    const from = sign.lapDistance - (sign.toS - sign.fromS) - 10;
    const to = sign.commitDistance;
    let min = Number.POSITIVE_INFINITY;
    let samples = 0;
    for (const sample of ride.result.path) {
      const lap = nearestLap(sample.x, sample.z);
      if (lap < from || lap > to) continue;
      samples += 1;
      min = Math.min(min, sample.armDistance);
    }
    return { feature: sign.feature, from, to, samples, minArm: min };
  });

  const overall = Math.min(...ride.result.path.map((sample) => sample.armDistance));
  const summary = perFeature
    .map((row) => `${row.feature}: min arm ${row.minArm.toFixed(3)} m over ${row.samples} samples `
      + `(lap ${row.from.toFixed(1)}–${row.to.toFixed(1)} m)`)
    .join('\n');
  await info.attach('m36_2-camera-arm-per-feature', {
    body: `${summary}\nwhole lap: min arm ${overall.toFixed(3)} m, floor ${floor} m\n`,
    contentType: 'text/plain',
  });
  // eslint-disable-next-line no-console
  console.log(`[m36_2] technical lap: ${ride.result.landings} landings, worst `
    + `"${ride.result.worstLanding}", ${ride.result.seconds.toFixed(2)} s, `
    + `${ride.result.path.length} camera samples\n[m36_2] camera arm\n${summary}\n`
    + `[m36_2] whole lap min arm ${overall.toFixed(3)}`);

  for (const row of perFeature) {
    expect(row.samples, `no samples on ${row.feature}'s approach`).toBeGreaterThan(0);
    expect(
      row.minArm,
      `the camera pulled in to ${row.minArm.toFixed(3)} m on the approach to ${row.feature}`,
    ).toBeGreaterThanOrEqual(floor - 1e-6);
  }
  expect(
    overall,
    `the camera pulled in to ${overall.toFixed(3)} m somewhere on the technical lap`,
  ).toBeGreaterThanOrEqual(floor - 1e-6);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. The tabletop
// ---------------------------------------------------------------------------

test('a charged hop off the kicker lip lands clean on the landing face, through the game', async ({ page }) => {
  // The big jump (ride round 1, 2026-09-12), ridden rather than benched: the
  // 12 m table ends in a brow and a 16 m landing face falling at 30 %, so a
  // charged hop at the signed speed clears the table and comes down on the
  // face, where the closing speed is taken along the surface normal and the
  // fall is mostly carried away. The bench says clean at 47–50 mph; this asks
  // the browser for one of them, on the same beat-5 chain the player meets,
  // with the boardwalk and the signage installed.
  const errors = collectErrors(page);
  await boot(page, PARK);

  const hop = await page.evaluate((geometry) => {
    const game = window.game;
    game.loop.setRunning(false);

    // Beat 5 is a straight chain, so the approach is one heading and a lap
    // distance along it is a projection rather than an arc walk.
    const approach = game.levelPlan.segments.find((each) => each.id === 'kicker-approach')!;
    const heading = approach.entry.headingY;
    const origin = approach.entry.position;
    const along = (point: { x: number; z: number }): number => geometry.approachEntry
      + (point.x - origin.x) * Math.sin(heading)
      + (point.z - origin.z) * Math.cos(heading);
    // Two metres in, on the technical line the take-off block stands on.
    const left = { x: Math.cos(heading), z: -Math.sin(heading) };
    window.qa.placeRider(
      origin.x + Math.sin(heading) * 2 + left.x * geometry.technicalT,
      origin.z + Math.cos(heading) * 2 + left.z * geometry.technicalT,
      heading,
    );

    // **The hop is flown by hand rather than by `qa.hopTrace`**, for one
    // reason: the harness reports the flight but not where it started, and the
    // whole claim here is that the wheel left the ground ON THE LIP — six
    // metres of falling pitch carrying a flush take-off — rather than on the
    // table beyond it, which would be Phase 1's geometry under a new name.
    // T11b's 28.7 mph hairpin-exit ceiling, then earn speed through the
    // production update path. Starting here at rest only reached 43 mph.
    const start = game.snapshot().euc;
    game.controller.reset({ position: start.position, headingY: heading }, 28.7 * 0.44704);
    game.setActions({ throttle: 1, crouch: true });
    let runSteps = 0;
    while (runSteps < 4000) {
      const euc = game.snapshot().euc;
      if (along(euc.position) >= geometry.lipLap - euc.speed * 0.1 - 0.4) break;
      game.advance(1);
      runSteps += 1;
    }
    const charged = game.snapshot().euc;

    game.setActions({ throttle: 1, crouch: true, hop: true });
    let compressSteps = 0;
    while (compressSteps < 120 && game.snapshot().euc.grounded) {
      game.advance(1);
      compressSteps += 1;
    }
    const airborne = game.snapshot().euc;
    game.setActions({ throttle: 0, crouch: false, hop: false });

    const landingsBefore = airborne.landings;
    let airSteps = 0;
    let apex = 0;
    while (airSteps < 900) {
      game.advance(1);
      airSteps += 1;
      const euc = game.snapshot().euc;
      apex = Math.max(apex, euc.airHeight);
      if (euc.landings > landingsBefore) break;
    }
    const landed = game.snapshot().euc;
    return {
      reached: runSteps < 4000,
      charge: airborne.hopCharge,
      chargedSpeed: charged.speed,
      launchSpeed: airborne.speed,
      compressSteps,
      apex,
      airSteps,
      tookOffAt: along(airborne.position),
      landedAt: along(landed.position),
      landings: landed.landings - landingsBefore,
      landingQuality: landed.landingQuality,
      surface: landed.surface,
      offCourse: landed.offCourse,
      crashes: landed.crashes,
    };
  }, {
    technicalT: 4.5,
    approachEntry: ENTRY['kicker-approach'],
    lipLap: ENTRY['kicker-table'],
  });

  expect(hop.reached, 'the run-up never reached the lip').toBe(true);
  expect(hop.landings, 'the hop never came down inside 900 steps').toBe(1);
  expect(hop.charge, 'the claimed full charge must actually reach the launch').toBe(1);
  expect(hop.launchSpeed).toBeGreaterThan(46 * 0.44704);
  expect(hop.launchSpeed).toBeLessThan(50 * 0.44704);

  // eslint-disable-next-line no-console
  console.log(`[m36_2] kicker hop: charge ${hop.chargedSpeed.toFixed(2)} m/s, `
    + `airborne at ${hop.launchSpeed.toFixed(2)} m/s after ${hop.compressSteps} compression steps, `
    + `take-off lap ${hop.tookOffAt.toFixed(1)} m, landing lap ${hop.landedAt.toFixed(1)} m, `
    + `"${hop.landingQuality}", apex ${hop.apex.toFixed(3)} m, surface ${hop.surface}`);

  // It left the ground on the lip pitch, which is what makes the 0.15 m face
  // part of the measurement.
  expect(
    hop.tookOffAt,
    `the wheel left the ground at lap ${hop.tookOffAt.toFixed(1)} m; the lip runs `
      + `${ENTRY['kicker-lip'].toFixed(1)}–${ENTRY['kicker-table'].toFixed(1)} m`,
  ).toBeGreaterThanOrEqual(ENTRY['kicker-lip']);
  expect(hop.tookOffAt).toBeLessThanOrEqual(ENTRY['kicker-table']);

  // And it came down on the landing face — past the table and its brow,
  // before the flare — rather than short on the table or long in the run-out.
  expect(
    hop.landedAt,
    `the hop came down at lap ${hop.landedAt.toFixed(1)} m; the landing face runs `
      + `${ENTRY['kicker-landing'].toFixed(1)}–${ENTRY['kicker-flare'].toFixed(1)} m`,
  ).toBeGreaterThan(ENTRY['kicker-landing']);
  expect(hop.landedAt).toBeLessThan(ENTRY['kicker-flare']);

  // **The claim.** A heavy landing here means the face no longer matches the flight.
  expect(
    hop.landingQuality,
    `a charged hop from ${hop.launchSpeed.toFixed(2)} m/s landed "${hop.landingQuality}"`,
  ).toBe('clean');
  expect(hop.crashes).toBe(0);
  expect(hop.offCourse).toBe(false);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. Legibility, at the three view sizes §36.4 names
// ---------------------------------------------------------------------------

/**
 * One legibility pass: boot, build the centreline, ride each approach, shoot.
 *
 * The viewport is set before the boot so the game meets it at start-up rather
 * than through a resize, which is how a player's own window arrives.
 */
async function legibilityPass(
  page: Page,
  info: TestInfo,
  label: string,
  viewport: { width: number; height: number },
  seats: number,
): Promise<{ feature: string; shot: Awaited<ReturnType<typeof shootApproach>> }[]> {
  const errors = collectErrors(page);
  await page.setViewportSize(viewport);
  await boot(page, PARK);

  if (seats > 1) {
    const grid = await page.evaluate((wanted) => {
      const game = window.game;
      game.loop.setRunning(false);
      while (game.seatCount < wanted) game.spawnRider();
      game.advance(12);
      return { seats: game.seatCount, viewport: game.snapshot().viewport };
    }, seats);
    expect(grid.seats).toBe(seats);
  }

  const routes = await page.evaluate(buildParkRoutes, {
    segments: RING_AND_TAIL,
    entry: ENTRY,
    profile: {},
    spacing: 2,
  });

  // **Every approach is ridden and measured before anything is asserted.** A
  // failing sign would otherwise take the other two's numbers down with it, and
  // the numbers are the point: this report is what the owner reads at G3.
  const measured: {
    feature: string;
    shot: Awaited<ReturnType<typeof shootApproach>>;
  }[] = [];
  for (const feature of LEGIBILITY) {
    measured.push({ feature, shot: await shootApproach(page, info, routes, feature, label) });
  }
  const rows = measured.map(({ feature, shot }) => (
    `${feature}: ${shot.standoff.toFixed(1)} m short of the first paint at `
    + `${shot.speed.toFixed(2)} m/s, arm ${shot.arm.toFixed(2)} m; the chevrons were in `
    + `frame for ${shot.readableSeconds.toFixed(2)} s of a ${shot.rideSeconds.toFixed(2)} s `
    + `approach, longest unbroken spell ${shot.longestSpell.toFixed(2)} s → ${shot.file}`
  ));
  await info.attach(`m36_2-legibility-${label}`, {
    body: `${viewport.width}x${viewport.height}, ${seats} seat(s)\n${rows.join('\n')}\n`,
    contentType: 'text/plain',
  });
  // eslint-disable-next-line no-console
  console.log(`[m36_2] ${label} ${viewport.width}x${viewport.height}\n  ${rows.join('\n  ')}`);

  for (const { feature, shot } of measured) {
    // The sign has to still be ahead of the rider when the shutter falls.
    expect(shot.standoff, `${label}: the ${feature} shot overran its sign`).toBeGreaterThan(0);
  }

  expect(errors).toEqual([]);
  return measured;
}

/**
 * **`SIGNS.readSeconds` is what the lead rule buys, so it is what the frame
 * owes.**
 *
 * `parkSignage` places every sign `readSeconds × v + v²/2a` before its
 * commitment point, and `switchbackLevel.test.ts` proves that arithmetic down
 * to the metre. It is an arithmetic about *distance along the trail* and it
 * says nothing about where the mark is on the screen — and on this venue three
 * of the nine signs stand on 16 m hairpins, where the camera is aimed a long
 * way off the sign at the distance the rule measures from. These are different
 * questions and this is the second one.
 */
function expectReadable(
  label: string,
  measured: { feature: string; shot: { longestSpell: number; readableSeconds: number } }[],
): void {
  for (const { feature, shot } of measured) {
    expect(
      shot.longestSpell,
      `${label}: the ${feature} chevrons were in frame for only `
        + `${shot.longestSpell.toFixed(2)} s of the approach unbroken `
        + `(${shot.readableSeconds.toFixed(2)} s in total) — the lead rule buys `
        + `${SIGNS_READ_SECONDS} s of reading`,
    ).toBeGreaterThanOrEqual(SIGNS_READ_SECONDS);
  }
}

test('the signs are photographed and read at the desktop pane', async ({ page }, info) => {
  test.slow();
  expectReadable(
    'desktop-1000x700',
    await legibilityPass(page, info, 'desktop-1000x700', { width: 1000, height: 700 }, 1),
  );
});

test('the signs are photographed and read at a four-seat quarter pane', async ({ page }, info) => {
  // `CAMERA.quadFovGain` is 1, so a quarter pane frames exactly what the full
  // canvas frames at half the linear resolution and nothing scales a world-space
  // mark back up — the HUD rescales itself and paint cannot. That asymmetry is
  // why §36.4 names this view, and the shot is of the whole frame so the owner
  // sees the quarter a player actually gets. The in-frame seconds therefore
  // match the desktop pane's exactly, by construction; what a quarter costs is
  // pixels, which is what the picture is for.
  test.slow();
  expectReadable(
    'quad-quarter-pane-1000x700',
    await legibilityPass(page, info, 'quad-quarter-pane-1000x700', { width: 1000, height: 700 }, 4),
  );
});

test('the signs are photographed and read at a phone held sideways', async ({ page }, info) => {
  // **Emulation, and it says so in the name.** The `mobile` project matches only
  // `touch.spec.ts`, so this is a Pixel 7's CSS box inside the chromium project
  // at device-pixel-ratio 1 — the conservative direction, since the phone draws
  // the same box with 2.625× the device pixels. No touch claim is made.
  test.slow();
  expectReadable(
    'pixel7-emulated-landscape-915x412',
    await legibilityPass(
      page,
      info,
      'pixel7-emulated-landscape-915x412',
      { width: 915, height: 412 },
      1,
    ),
  );
});

test('the signs are photographed at a phone held upright', async ({ page }, info) => {
  // The picture §36.8 asks for. The reading claim for this orientation is the
  // test below, which measures the same ride and now holds — see the note there
  // for what it took and for the before-and-after numbers.
  test.slow();
  await legibilityPass(
    page,
    info,
    'pixel7-emulated-portrait-412x915',
    { width: 412, height: 915 },
    1,
  );
});

/**
 * **A portrait phone can see every sign, and this used to be the defect.**
 *
 * Longest unbroken spell the chevron stack was inside the frame, over the whole
 * approach from sixty metres out to the last mark, against the 1.5 s
 * `SIGNS.readSeconds` buys. The first three columns are what this file measured
 * when the signs were placed by the lead rule alone; the last is the same
 * measurement after `parkSignage` gained its read rule (`SIGNS.paneAspect`,
 * `SIGNS.readMetres`, and a `findPad` that walks candidates latest-first and
 * takes the latest one the approach can actually *see*):
 *
 * | view | stairs | kicker | spin shelf |
 * |---|---|---|---|
 * | 1000×700 desktop | 8.08 → **7.40 s** | 3.03 → **7.72 s** | 2.90 → **9.42 s** |
 * | four-seat quarter pane | 8.08 → **7.40 s** | 3.03 → **7.72 s** | 2.90 → **9.42 s** |
 * | Pixel 7 landscape 915×412 | 8.08 → **7.40 s** | 7.53 → **7.72 s** | 3.72 → **9.42 s** |
 * | **Pixel 7 portrait 412×915** | 4.52 → **5.48 s** | 0.00 → **6.85 s** | 1.25 → **9.42 s** |
 *
 * A portrait viewport's horizontal half-angle is `atan(tan(fov/2) × aspect)` =
 * atan(tan 0.565 × 0.450) ≈ **17°**, against 44° at 1000×700, and the two
 * failing pads stood two thirds of the way round 16 m hairpins — where the lead
 * rule's distance *along the trail* is right and the paint is still not in the
 * picture. Both pads now sit at the head of their bend instead, which is why
 * every sign is in frame for the whole approach in the three wide views and for
 * most of it in portrait. The stairs' and the kicker's portrait spells are
 * shorter than their rides because the pad passes out of a 17° window as the
 * rider closes on it, not because it was ever missed.
 *
 * **The threshold was never weakened to get here**, per §36.8's own rule: it is
 * still `SIGNS.readSeconds`, and the worst number in the table is 3.6× it. The
 * `test.fixme` this test carried while the defect stood came off once the read
 * rule shipped; the same measurement is run on the real `mobile` project — real
 * touch, real device pixel ratio — in `tests/touch.spec.ts`.
 */
test('every sign is readable on a phone held upright', async ({ page }, info) => {
  test.slow();
  expectReadable(
    'pixel7-emulated-portrait-412x915',
    await legibilityPass(
      page,
      info,
      'pixel7-emulated-portrait-412x915',
      { width: 412, height: 915 },
      1,
    ),
  );
});

test('turn arrows point the right way in desktop and portrait chase views', async ({ page }, info) => {
  const errors = collectErrors(page);
  await boot(page, PARK);
  for (const viewport of [{ width: 1000, height: 700 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(viewport);
    for (const [index, arrow] of SWITCHBACK_TURN_ARROWS.entries()) {
      const projected = await page.evaluate(({ arrow, shaft }) => {
        const game = window.game;
        const segment = game.levelPlan.segments.find((s) => s.id === arrow.segment)!;
        const heading = segment.entry.headingY;
        const point = (s: number, t: number) => ({
          x: segment.entry.position.x + Math.sin(heading) * s + Math.cos(heading) * t,
          y: 0,
          z: segment.entry.position.z + Math.cos(heading) * s - Math.sin(heading) * t,
        });
        const start = point(arrow.s - 13, 0);
        window.qa.placeRider(start.x, start.z, heading);
        game.controller.reset({ position: start, headingY: heading }, 10);
        game.setActions({ throttle: 0.35 });
        game.advance(36);
        game.clearActions();
        return shaft.slice(1).map(({ s, t }) => {
          const p = point(s, t);
          return window.qa.projectPoint(p.x, game.sampleGround(p.x, p.z).height + 0.015, p.z);
        });
      }, { arrow, shaft: turnArrowMarkings(arrow)[0].path });
      const [elbow, tip] = projected;
      expect(tip.inFront).toBe(true);
      expect(Math.abs(tip.x)).toBeLessThan(1);
      expect(Math.abs(tip.y)).toBeLessThan(1);
      // A screen-space direction check catches a shared world-sign mistake.
      expect(Math.sign(tip.x - elbow.x)).toBe(arrow.turn === 'left' ? -1 : 1);
      await shoot(page, info, `turn-${index + 1}-${arrow.segment}-${viewport.width}`);
    }
  }
  expect(errors).toEqual([]);
});
