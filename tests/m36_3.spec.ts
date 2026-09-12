/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PROVING_GROUND, boot as bootGame, bootToTitle, collectErrors } from './harness.ts';
import { ONE_FOOT, PHYSICS, RIDER_BLOCKOUT, SIMULATION, TRICKS } from '../src/data/tuning.ts';
import type { TrickFacts, TrickTally } from '../src/simulation/trickEvents.ts';
import type { ScriptedActions } from '../src/input/actions.ts';

/**
 * M36 Phase 3 in a real browser — the held Hop and the one-foot air pose.
 *
 * `docs/PLANS.md` §36.5. The *rules* are headless and stay there: the state
 * machine's whole table is `src/app/oneFootPose.test.ts`, the input grammar is
 * `src/input/*.test.ts`, the controller's air facts are
 * `src/simulation/EucController.test.ts`, and the released leg's clearance on
 * all ten rigs is `src/render/riderClearance*.test.ts`. Repeating any of that
 * here would be slower and no truer.
 *
 * What only a browser can prove is the whole path, once, end to end:
 *
 *   - a *real* key, a *real* pad and the bridge all reach the same per-seat
 *     level, and a rebound Hop key moves both of its meanings;
 *   - the pose engages on the live game's own fixed step, at the dwell the
 *     tuning names, and is back on the pedal before the wheel touches down;
 *   - every reset door a player can actually open — focus, a hidden tab, the
 *     pause menu, a window resize, a lost pad, a seat standing up, a restart,
 *     and the race countdown's GO — takes the level and the pose with it;
 *   - and the channel is presentation only: two seats given identical scripted
 *     input that differs *only* in the held level ride bit-identically.
 *
 * Timings below are derived from `ONE_FOOT` and `SIMULATION.hz` rather than
 * written down, so a tuning change fails here with an arithmetic message
 * instead of a mystery. Nothing here reads a frame interval (`AGENTS.md`).
 */

/**
 * **The M4 proving ground, for m5's reason.** Every number in this file is a
 * step count on a flat, unchanging floor; a hop measured on authored scenery
 * would be measuring the scenery.
 */
const boot = (page: Page, query = ''): Promise<void> => (
  bootGame(page, query === '' ? PROVING_GROUND : `${query}&${PROVING_GROUND}`)
);

/** The park, for the one case that needs a lap world: the race countdown. */
const PARK = 'level=switchback';

/**
 * Where the frames land. **An environment variable with a repo-relative
 * default**, never an absolute path written down here: a scratchpad path
 * carries the machine's own account name, and `tools/export-source.mjs`
 * refuses to publish a tree containing one (the private-token scan). `M36_SHOTS`
 * names the directory the phase folders are made under.
 */
const SHOTS = `${process.env.M36_SHOTS ?? 'test-results/m36'}/phase3`;

/** The dwell, in fixed steps. Eighteen at the shipped 0.15 s and 120 Hz. */
const QUALIFY_STEPS = Math.round(ONE_FOOT.holdQualifySeconds * SIMULATION.hz);
/** The entry travel, in fixed steps. Twelve at 0.10 s. */
const ENTER_STEPS = Math.round(ONE_FOOT.enterSeconds * SIMULATION.hz);
/** The air a late request is refused against: entry + hold + return + margin. */
const READABLE_WINDOW = ONE_FOOT.enterSeconds
  + ONE_FOOT.readableSeconds
  + ONE_FOOT.returnSeconds
  + ONE_FOOT.touchdownMarginSeconds;

/** One fixed step of one seat, as the QA bridge reports it. */
interface PoseSample {
  step: number;
  /** 1-based index of this airborne step, or -1 on the ground. */
  air: number;
  airHeight: number;
  vy: number;
  oneFoot: number;
  state: string;
  qualified: boolean;
  hold: number;
  held: boolean;
  hops: number;
  spins: number;
  landings: number;
  crashed: boolean;
  landing: string;
  heading: number;
  consumedHop: number;
}

interface FlightPlan {
  /** Written the step the run starts — normally the hop press itself. */
  press: ScriptedActions;
  /**
   * Input changes, each written *after* the step it names so the sample that
   * names it is the last one under the old input.
   *
   * `atStep` counts fixed steps from the press; `atAir` counts airborne steps
   * from 1; `atFalling` fires on the first airborne step with the wheel
   * already coming down.
   */
  events: { atStep?: number; atAir?: number; atFalling?: boolean; actions: ScriptedActions }[];
  steps: number;
}

interface FlightResult {
  samples: PoseSample[];
  startHops: number;
  startSpins: number;
  startHeading: number;
  startConsumedHop: number;
}

/**
 * Ride one scripted flight on seat 0 and bring back every step of it.
 *
 * Runs entirely in the page (harness rule 3): one round trip for a whole
 * flight, rather than one per step. The loop is frozen first (rule 2), so
 * every sample below is a fixed step of the real update path and nothing has
 * moved on between two automation calls.
 */
function ridePose(plan: FlightPlan): FlightResult {
  const game = window.game;
  game.loop.setRunning(false);
  game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
  game.advance(60);
  const base = game.snapshotFor(0);
  const startHops = base.euc.hops;
  const startSpins = base.euc.spins;
  const startHeading = base.euc.headingY;
  const startConsumedHop = base.consumed.hop ?? 0;
  const fired = plan.events.map(() => false);

  game.setActionsFor(0, plan.press);
  const samples: PoseSample[] = [];
  let air = 0;
  for (let step = 0; step < plan.steps; step += 1) {
    game.advance(1);
    const s = game.snapshotFor(0);
    // The pose's own definition of flight, so a sample's `air` index and the
    // state machine's eligibility cannot disagree: clearance above the ground
    // and not off the wheel (`app/oneFootPose.ts`).
    const flying = s.euc.airHeight > 0 && !s.euc.crashed;
    if (flying) air += 1;
    samples.push({
      step,
      air: flying ? air : -1,
      airHeight: s.euc.airHeight,
      vy: s.euc.verticalVelocity,
      oneFoot: s.tricks.pose.oneFoot,
      state: s.tricks.pose.state,
      qualified: s.tricks.pose.qualifiedThisFlight,
      hold: s.tricks.pose.holdSeconds,
      held: s.actions.hopHeld,
      hops: s.euc.hops,
      spins: s.euc.spins,
      landings: s.euc.landings,
      crashed: s.euc.crashed,
      landing: s.euc.landingQuality,
      heading: s.euc.headingY,
      consumedHop: s.consumed.hop ?? 0,
    });
    for (let i = 0; i < plan.events.length; i += 1) {
      if (fired[i]) continue;
      const e = plan.events[i];
      const hit = (e.atStep !== undefined && e.atStep === step)
        || (e.atAir !== undefined && flying && e.atAir === air)
        || (e.atFalling === true && flying && s.euc.verticalVelocity < 0);
      if (!hit) continue;
      fired[i] = true;
      game.setActionsFor(0, e.actions);
    }
  }
  return { samples, startHops, startSpins, startHeading, startConsumedHop };
}

/** Where the flight is, as step indices into `samples`. */
function flight(r: FlightResult) {
  const s = r.samples;
  const airSamples = s.filter((x) => x.air > 0);
  const takeoff = s.findIndex((x) => x.air === 1);
  const lastAir = s.reduce((best, x, i) => (x.air > 0 ? i : best), -1);
  const atAir = (n: number): PoseSample | undefined => s.find((x) => x.air === n);
  return {
    takeoff,
    lastAir,
    airSteps: airSamples.length,
    atAir,
    maxOneFoot: Math.max(...s.map((x) => x.oneFoot)),
    states: [...new Set(s.map((x) => x.state))],
    firstPosingAir: atAirOf(s, 'posing'),
    end: s[s.length - 1],
  };
}

/** The airborne index of the first sample in the named state, or -1. */
function atAirOf(samples: PoseSample[], state: string): number {
  const hit = samples.find((x) => x.state === state);
  return hit ? hit.air : -1;
}

/** The controller's own closed-form projection, for cross-checking a refusal. */
function secondsToTouchdown(airHeight: number, vy: number): number {
  const g = PHYSICS.gravity;
  return (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, airHeight))) / g;
}

// ---------------------------------------------------------------------------
// The lifecycle, §36.5's table, ridden in the live game
// ---------------------------------------------------------------------------

test('a tap of Hop is a hop and nothing else — no foot ever leaves its pedal', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    // Released on the step after the press: a tap, and the whole of it spent
    // on the ground inside the hop's own compression.
    events: [{ atStep: 0, actions: { hop: false, hopHeld: false } }],
    steps: 200,
  } satisfies FlightPlan);
  const f = flight(ride);

  expect(f.airSteps, 'the tap left the ground').toBeGreaterThan(30);
  expect(f.end.hops).toBe(ride.startHops + 1);
  expect(f.end.consumedHop).toBe(ride.startConsumedHop + 1);
  expect(f.end.spins).toBe(ride.startSpins);
  // The whole claim: nothing visible. Not "small", zero.
  expect(f.maxOneFoot).toBe(0);
  expect(f.states).toEqual(['idle']);
  expect(f.end.landing).toBe('clean');
  expect(f.end.crashed).toBe(false);
  expect(errors).toEqual([]);
});

test('Hop held through takeoff poses the foot after the dwell, and spins nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    events: [{ atStep: 0, actions: { hop: false } }],
    steps: 200,
  } satisfies FlightPlan);
  const f = flight(ride);
  const s = ride.samples;

  // The flight itself, unchanged by the hold: one hop, one press claimed, no
  // spin — the spin is a press and this is a level.
  expect(f.end.hops).toBe(ride.startHops + 1);
  expect(f.end.consumedHop).toBe(ride.startConsumedHop + 1);
  expect(f.end.spins).toBe(ride.startSpins);
  expect(f.end.landing).toBe('clean');

  // Nothing at all while the wheel is still on the ground, including through
  // the hop's own compression, and the dwell does not count there.
  for (const x of s.slice(0, f.takeoff)) {
    expect(x.oneFoot, `grounded step ${x.step}`).toBe(0);
    expect(x.state, `grounded step ${x.step}`).toBe('idle');
    expect(x.hold, `grounded step ${x.step}`).toBe(0);
  }

  // The dwell: `holdQualifySeconds` of airborne hold, counted in fixed steps.
  expect(f.firstPosingAir).toBe(QUALIFY_STEPS);
  expect(f.atAir(QUALIFY_STEPS - 1)?.state).toBe('qualifying');
  expect(f.atAir(QUALIFY_STEPS - 1)?.hold)
    .toBeCloseTo((QUALIFY_STEPS - 1) / SIMULATION.hz, 9);
  expect(f.atAir(QUALIFY_STEPS)?.qualified).toBe(true);

  // The entry: full gesture one `enterSeconds` later, and no sooner.
  const full = s.find((x) => x.oneFoot >= 0.999);
  expect(full?.air).toBe(QUALIFY_STEPS + ENTER_STEPS - 1);

  // The return: begun on the air the projection no longer covers, finished
  // before the wheel touches down — the §36.5 promise the ground cannot break.
  const backOn = s.find((x) => x.air > (full?.air ?? 0) && x.oneFoot === 0);
  expect(backOn, 'the foot came back before the landing').toBeDefined();
  expect(s[f.lastAir].oneFoot, 'the last airborne step').toBe(0);
  expect((f.lastAir >= 0 ? s[f.lastAir].air : 0) - (backOn?.air ?? 0))
    .toBeGreaterThanOrEqual(5);
  // And the touchdown step itself is flat-footed.
  expect(s[f.lastAir + 1].air).toBe(-1);
  expect(s[f.lastAir + 1].oneFoot).toBe(0);

  expect(f.states).toEqual(['idle', 'qualifying', 'posing', 'returning', 'spent']);
  expect(errors).toEqual([]);
});

test('released, then tapped while rising: the 180 throws with no one-foot flash', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    events: [
      { atStep: 0, actions: { hop: false, hopHeld: false } },
      // The second press, latched while the wheel is still rising: M24's move.
      { atAir: 4, actions: { hop: true, hopHeld: true } },
      { atAir: 5, actions: { hop: false, hopHeld: false } },
    ],
    steps: 220,
  } satisfies FlightPlan);
  const f = flight(ride);

  expect(f.end.spins).toBe(ride.startSpins + 1);
  expect(Math.abs(f.end.heading - ride.startHeading - Math.PI)).toBeLessThan(0.15);
  expect(f.end.landing).toBe('clean');
  expect(f.end.crashed).toBe(false);
  // A tap is a press however the level is wired: one step of hold is 1/18th of
  // the dwell, and the foot never moves.
  expect(f.maxOneFoot).toBe(0);
  expect(f.states).not.toContain('posing');
  expect(errors).toEqual([]);
});

test('released, then re-held while rising: the spin still fires and the pose adds to it', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    events: [
      { atStep: 0, actions: { hop: false, hopHeld: false } },
      // The same press as the test above; this one stays down afterwards.
      { atAir: 4, actions: { hop: true, hopHeld: true } },
      { atAir: 5, actions: { hop: false } },
    ],
    steps: 220,
  } satisfies FlightPlan);
  const f = flight(ride);

  expect(f.end.spins).toBe(ride.startSpins + 1);
  expect(Math.abs(f.end.heading - ride.startHeading - Math.PI)).toBeLessThan(0.15);
  expect(f.end.landing).toBe('clean');
  // A fresh dwell from the re-hold, not from the takeoff.
  expect(f.firstPosingAir).toBe(4 + QUALIFY_STEPS);
  expect(f.maxOneFoot).toBeGreaterThanOrEqual(0.999);
  expect(ride.samples[f.lastAir].oneFoot, 'back on the pedal to land').toBe(0);
  expect(errors).toEqual([]);
});

test('re-held too late on the way down: refused outright, with nothing to see', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    events: [
      { atStep: 0, actions: { hop: false, hopHeld: false } },
      // Held again from the first descending step — and only held: a press
      // here could arm nothing anyway (`canAcceptSpin` wants a rising wheel).
      { atFalling: true, actions: { hopHeld: true } },
    ],
    steps: 200,
  } satisfies FlightPlan);
  const f = flight(ride);
  const refused = ride.samples.find((x) => x.state === 'refused');

  expect(refused, 'the late request was refused').toBeDefined();
  expect(refused?.vy).toBeLessThan(0);
  // The refusal is the readable-window rule and not something else: the
  // controller's own projection at that step is short of what the gesture
  // needs (`(v + √(v² + 2gh)) / g`, the closed form it publishes).
  expect(secondsToTouchdown(refused?.airHeight ?? 0, refused?.vy ?? 0))
    .toBeLessThan(READABLE_WINDOW);
  expect(f.maxOneFoot).toBe(0);
  expect(f.states).not.toContain('posing');
  expect(ride.samples.every((x) => !x.qualified)).toBe(true);
  expect(f.end.landing).toBe('clean');
  expect(errors).toEqual([]);
});

test('held through touchdown: the feet are back before the wheel is, and no second hop comes of it', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    events: [
      { atStep: 0, actions: { hop: false } },
      // The hold continues into the next flight, which is a new dwell.
      { atStep: 150, actions: { hop: true } },
      { atStep: 151, actions: { hop: false } },
    ],
    steps: 320,
  } satisfies FlightPlan);
  const s = ride.samples;
  const takeoff = s.findIndex((x) => x.air === 1);
  // The *first* flight's touchdown, not the run's last airborne step: this
  // ride deliberately contains two flights.
  const landed = s.findIndex((x, i) => i > takeoff && x.air === -1);

  expect(takeoff).toBeGreaterThan(0);
  expect(landed).toBeGreaterThan(takeoff + 30);
  // The foot was out, and it was back before the wheel was.
  expect(Math.max(...s.slice(0, landed).map((x) => x.oneFoot))).toBeGreaterThanOrEqual(0.999);
  expect(s[landed - 1].oneFoot, 'the last airborne step').toBe(0);
  expect(s[landed].oneFoot, 'the touchdown step').toBe(0);

  // Every grounded step between the two flights: no foot out, and the level is
  // still held the whole way.
  const between = s.slice(landed, 150);
  expect(between.length).toBeGreaterThan(50);
  for (const x of between) {
    expect(x.oneFoot, `grounded step ${x.step}`).toBe(0);
    expect(x.held, `grounded step ${x.step}`).toBe(true);
  }
  // A held Hop mints no press: the hop count and the claim count are flat
  // across the whole grounded tail.
  expect(between[between.length - 1].hops).toBe(between[0].hops);
  expect(between[between.length - 1].consumedHop).toBe(between[0].consumedHop);

  // And the second flight gets its own pose off the continuing hold.
  const second = s.slice(160);
  expect(second.some((x) => x.state === 'posing')).toBe(true);
  expect(Math.max(...second.map((x) => x.oneFoot))).toBeGreaterThanOrEqual(0.999);
  expect(s[s.length - 1].hops).toBe(ride.startHops + 2);
  expect(errors).toEqual([]);
});

test('one qualification per flight: a release is final until the next takeoff', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const ride = await page.evaluate(ridePose, {
    press: { hop: true, hopHeld: true },
    events: [
      { atStep: 0, actions: { hop: false } },
      // Let go at the apex, then ask again in the same flight.
      { atAir: 32, actions: { hopHeld: false } },
      { atAir: 40, actions: { hopHeld: true } },
    ],
    steps: 200,
  } satisfies FlightPlan);
  const s = ride.samples;

  expect(flight(ride).maxOneFoot).toBeGreaterThanOrEqual(0.999);
  const released = s.filter((x) => x.air > 32);
  // The foot goes back and stays back: the re-hold is `spent`, not a second
  // gesture, and a flicked key cannot bob the boot.
  expect(released.some((x) => x.state === 'returning')).toBe(true);
  expect(released.some((x) => x.state === 'spent')).toBe(true);
  const afterReturn = released.filter((x) => x.state === 'spent');
  for (const x of afterReturn) expect(x.oneFoot, `step ${x.step}`).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The devices
// ---------------------------------------------------------------------------

test('rebinding Hop moves both of its meanings, and frees the old key of both', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.qa.freeze());

  await page.evaluate(() => window.game.setOptions({ bindings: { hop: ['KeyJ'] } }));

  // Space is now nobody's hop — neither the press nor the level. (It is still
  // the seat-claim key, which is a second reading of the same press and not a
  // binding: `input/keyboard.ts`.)
  const beforeSpace = await page.evaluate(() => window.qa.snap().consumed.hop ?? 0);
  await page.keyboard.down('Space');
  await page.evaluate(() => window.game.advance(1));
  const onSpace = await page.evaluate(() => window.qa.snap());
  await page.keyboard.up('Space');
  expect(onSpace.actions.hopHeld).toBe(false);
  expect(onSpace.consumed.hop ?? 0).toBe(beforeSpace);

  // KeyJ carries both, and the pose comes off the rebound key's own level.
  await page.keyboard.down('KeyJ');
  const held = await page.evaluate(() => {
    const game = window.game;
    game.advance(1);
    const pressed = game.snapshotFor(0);
    let best = 0;
    let posing = false;
    for (let i = 0; i < 120; i += 1) {
      game.advance(1);
      const s = game.snapshotFor(0);
      best = Math.max(best, s.tricks.pose.oneFoot);
      posing = posing || s.tricks.pose.state === 'posing';
    }
    return {
      hopHeld: pressed.actions.hopHeld,
      consumed: pressed.consumed.hop ?? 0,
      hops: game.snapshotFor(0).euc.hops,
      best,
      posing,
    };
  });
  await page.keyboard.up('KeyJ');
  const released = await page.evaluate(() => {
    window.game.advance(1);
    return window.qa.snap().actions.hopHeld;
  });

  expect(held.hopHeld).toBe(true);
  expect(held.consumed).toBe(beforeSpace + 1);
  expect(held.hops).toBe(1);
  expect(held.posing).toBe(true);
  expect(held.best).toBeGreaterThanOrEqual(0.999);
  expect(released).toBe(false);

  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

/** m9's fake standard pad, verbatim through the real Gamepad API. */
async function bootWithPad(page: Page): Promise<void> {
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
  await boot(page);
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);
}

const padButton = async (page: Page, index: number, down: boolean): Promise<void> => {
  await page.evaluate(async ({ index: i, down: value }) => {
    const pad = (window as unknown as {
      fakePad: { buttons: { pressed: boolean; value: number }[] };
    }).fakePad;
    pad.buttons[i].pressed = value;
    pad.buttons[i].value = value ? 1 : 0;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, { index, down });
};

/** A (button 0) is Hop on a standard pad. */
const PAD_A = 0;

/** Let the running loop take at least `steps` fixed steps — never wall clock. */
async function rideOn(page: Page, steps: number): Promise<void> {
  const from = await page.evaluate(() => window.game.snapshot().loop.steps);
  await page.waitForFunction((n) => window.game.snapshot().loop.steps > n, from + steps);
}

test('a held pad button is the same level, and two devices release independently', async ({ page }) => {
  const errors = collectErrors(page);
  await bootWithPad(page);

  const before = await page.evaluate(() => window.game.snapshot().consumed.hop ?? 0);
  await padButton(page, PAD_A, true);
  await page.waitForFunction(() => window.game.snapshot().actions.hopHeld === true);
  // Held down, it is still one press: the edge is the hop, the level is the
  // pose. Two seconds of simulation is far past the 0.15 s buffer.
  await rideOn(page, 240);
  expect(await page.evaluate(() => window.game.snapshot().consumed.hop ?? 0)).toBe(before + 1);

  // Two devices on one seat is an OR, not a shared boolean: releasing the pad
  // while the key is down leaves the level standing, and only the last release
  // drops it.
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.game.snapshot().actions.hopHeld === true);
  await padButton(page, PAD_A, false);
  await rideOn(page, 60);
  expect(await page.evaluate(() => window.game.snapshot().actions.hopHeld)).toBe(true);
  await page.keyboard.up('Space');
  await page.waitForFunction(() => window.game.snapshot().actions.hopHeld === false);

  // And the pose comes off a pad-held level like any other. The rider is put
  // back at the spawn first, so what is measured is one flight from a standing
  // start rather than whatever the pad's own hop edge was in the middle of.
  await padButton(page, PAD_A, true);
  await page.waitForFunction(() => window.game.snapshot().actions.hopHeld === true);
  const posed = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { reset: true });
    game.advance(2);
    game.setActionsFor(0, { reset: false, hop: true });
    game.advance(1);
    game.setActionsFor(0, { hop: false });
    let best = 0;
    let posing = false;
    let heldThroughout = true;
    for (let i = 0; i < 150; i += 1) {
      game.advance(1);
      const s = game.snapshotFor(0);
      best = Math.max(best, s.tricks.pose.oneFoot);
      posing = posing || s.tricks.pose.state === 'posing';
      // The level under test is the pad's: the bridge writes only the press.
      heldThroughout = heldThroughout && s.actions.hopHeld;
    }
    return { best, posing, heldThroughout };
  });
  await padButton(page, PAD_A, false);

  expect(posed.heldThroughout).toBe(true);
  expect(posed.posing).toBe(true);
  expect(posed.best).toBeGreaterThanOrEqual(0.999);
  expect(errors).toEqual([]);
});

test('a pad in a sparse slot is the same device, and losing it brings the foot home', async ({ page }) => {
  const errors = collectErrors(page);
  // **Slot 1 with an empty slot 0.** `navigator.getGamepads()` returns a
  // sparse array on every browser — a disconnected pad leaves a hole rather
  // than closing up — and a layer that iterated it as a dense list would read
  // the hole as the pad.
  await page.addInitScript(() => {
    const pad = {
      index: 1,
      id: 'fake standard pad',
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    (window as unknown as { fakePad: typeof pad }).fakePad = pad;
    navigator.getGamepads = () => [null, pad] as never;
  });
  await boot(page);
  await page.waitForFunction(() => window.game.snapshot().gamepadConnected);

  await padButton(page, PAD_A, true);
  await page.waitForFunction(() => window.game.snapshot().actions.hopHeld === true);

  // The pose, off the sparse pad's own level.
  const posed = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { reset: true });
    game.advance(2);
    game.setActionsFor(0, { reset: false, hop: true });
    game.advance(1);
    game.setActionsFor(0, { hop: false });
    for (let i = 0; i < 150; i += 1) {
      game.advance(1);
      const s = game.snapshotFor(0);
      if (s.tricks.pose.oneFoot >= 0.999) {
        return { oneFoot: s.tricks.pose.oneFoot, held: s.actions.hopHeld, state: s.tricks.pose.state };
      }
    }
    throw new Error('the pose never reached the full gesture');
  });
  expect(posed.oneFoot).toBeGreaterThanOrEqual(0.999);
  expect(posed.held).toBe(true);

  // **Device loss, mid-gesture.** The pad vanishes from the array with the
  // button still down, so no release event is ever delivered — the case the
  // door exists for.
  await page.evaluate(() => {
    (window as unknown as { fakePad: { connected: boolean } }).fakePad.connected = false;
    navigator.getGamepads = () => [null, null] as never;
  });
  await page.waitForFunction(() => window.game.snapshot().actions.hopHeld === false, undefined, {
    timeout: 20_000,
  });
  const lost = await page.evaluate(() => {
    const game = window.game;
    const atDoor = game.snapshotFor(0);
    // **The pose is read on a fixed step, so it is measured on one.** The
    // unplug is a DOM-side event and this spec's loop is frozen; nothing about
    // the gesture can have moved until the game is stepped, and asserting on
    // the reading between the two would be asserting about the automation.
    game.advance(1);
    const next = game.snapshotFor(0);
    let back = -1;
    for (let i = 0; i < 40 && back < 0; i += 1) {
      game.advance(1);
      if (game.snapshotFor(0).tricks.pose.oneFoot === 0) back = i;
    }
    return {
      held: atDoor.actions.hopHeld,
      state: next.tricks.pose.state,
      hold: next.tricks.pose.holdSeconds,
      oneFoot: next.tricks.pose.oneFoot,
      back,
    };
  });
  expect(lost.held).toBe(false);
  expect(lost.state).toBe('returning');
  expect(lost.hold).toBe(0);
  expect(lost.oneFoot).toBeLessThan(posed.oneFoot);
  // And it is a return, not a snap: the foot takes the ordinary travel home.
  expect(lost.back).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The reset doors, enumerated — §36.5 and `docs/PLANS.md` §36 Phase 3
// ---------------------------------------------------------------------------

/**
 * Freeze, hop with the level held, and stop with the foot fully out.
 *
 * Every door test below starts here, so what each one measures is the door and
 * not the way in.
 */
function poseOut(): { oneFoot: number; state: string; held: boolean; air: number } {
  const game = window.game;
  game.loop.setRunning(false);
  game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
  game.advance(60);
  game.setActionsFor(0, { hop: true, hopHeld: true });
  game.advance(1);
  game.setActionsFor(0, { hop: false });
  let air = 0;
  for (let i = 0; i < 200; i += 1) {
    game.advance(1);
    const s = game.snapshotFor(0);
    if (s.euc.airHeight > 0) air += 1;
    if (s.tricks.pose.oneFoot >= 0.999) {
      return { oneFoot: s.tricks.pose.oneFoot, state: s.tricks.pose.state, held: s.actions.hopHeld, air };
    }
  }
  throw new Error('the pose never reached the full gesture');
}

test('the focus doors: a blur and a hidden tab each take the level and begin the return', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const out = await page.evaluate(poseOut);
  expect(out.oneFoot).toBeGreaterThanOrEqual(0.999);
  expect(out.held).toBe(true);

  const blurred = await page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    const atDoor = window.game.snapshotFor(0);
    window.game.advance(1);
    const next = window.game.snapshotFor(0);
    let back = -1;
    for (let i = 0; i < 40 && back < 0; i += 1) {
      window.game.advance(1);
      if (window.game.snapshotFor(0).tricks.pose.oneFoot === 0) back = i;
    }
    return {
      heldAtDoor: atDoor.actions.hopHeld,
      stateAtDoor: atDoor.tricks.pose.state,
      holdAtDoor: atDoor.tricks.pose.holdSeconds,
      nextState: next.tricks.pose.state,
      nextOneFoot: next.tricks.pose.oneFoot,
      back,
    };
  });

  // The blur is the world's own reset: the scripted level goes with the
  // devices (`ActionState.clearAll`), the dwell is dropped, and the foot
  // begins coming back rather than snapping home.
  expect(blurred.heldAtDoor).toBe(false);
  expect(blurred.stateAtDoor).toBe('returning');
  expect(blurred.holdAtDoor).toBe(0);
  expect(blurred.nextOneFoot).toBeLessThan(out.oneFoot);
  expect(blurred.back).toBeGreaterThanOrEqual(0);

  // The tab going away is the same door through a different event. The page's
  // own `visibilityState` is what the production handler reads, so it is what
  // is stubbed — the handler, the reset and the cancel are all the real ones.
  const out2 = await page.evaluate(poseOut);
  expect(out2.oneFoot).toBeGreaterThanOrEqual(0.999);
  const hidden = await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const atDoor = window.game.snapshotFor(0);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return {
      held: atDoor.actions.hopHeld,
      state: atDoor.tricks.pose.state,
      hold: atDoor.tricks.pose.holdSeconds,
    };
  });
  expect(hidden.held).toBe(false);
  expect(hidden.state).toBe('returning');
  expect(hidden.hold).toBe(0);
  expect(errors).toEqual([]);
});

test('the menu boundary cancels the pose, and coming back does not re-kick the foot', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const out = await page.evaluate(poseOut);
  expect(out.oneFoot).toBeGreaterThanOrEqual(0.999);

  // Escape is latched by the input layer and claimed on the *following* fixed
  // step (m10 says the same), and this spec froze the loop to pose the foot —
  // so the step has to be asked for.
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.advance(2));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  const paused = await page.evaluate(() => window.game.snapshotFor(0));
  expect(paused.actions.hopHeld).toBe(false);
  expect(paused.tricks.pose.state).toBe('returning');
  expect(paused.tricks.pose.holdSeconds).toBe(0);

  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.advance(2));
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);
  const resumed = await page.evaluate(() => {
    const game = window.game;
    let best = 0;
    for (let i = 0; i < 60; i += 1) {
      game.advance(1);
      best = Math.max(best, game.snapshotFor(0).tricks.pose.oneFoot);
    }
    return { best, state: game.snapshotFor(0).tricks.pose.state, oneFoot: game.snapshotFor(0).tricks.pose.oneFoot };
  });
  // The foot only ever comes back: nothing the player did not ask for again.
  expect(resumed.best).toBeLessThan(out.oneFoot);
  expect(resumed.oneFoot).toBe(0);
  expect(errors).toEqual([]);
});

test('a layout-changing resize drops the dwell while a scripted hold survives it', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // Caught mid-dwell rather than mid-pose, which is the case with something to
  // watch afterwards: the scripted level is not a device and survives
  // `clearDevices`, so a fresh dwell re-qualifies inside the same flight.
  const before = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
    game.advance(60);
    game.setActionsFor(0, { hop: true, hopHeld: true });
    game.advance(1);
    game.setActionsFor(0, { hop: false });
    let air = 0;
    while (air < 10) {
      game.advance(1);
      if (game.snapshotFor(0).euc.airHeight > 0) air += 1;
    }
    const s = game.snapshotFor(0);
    return {
      layoutChanges: game.snapshot().layoutChanges,
      hold: s.tricks.pose.holdSeconds,
      state: s.tricks.pose.state,
    };
  });
  expect(before.state).toBe('qualifying');
  expect(before.hold).toBeGreaterThan(0);

  await page.setViewportSize({ width: 900, height: 640 });
  await page.waitForFunction((n) => window.game.snapshot().layoutChanges > n, before.layoutChanges);

  const after = await page.evaluate(() => {
    const game = window.game;
    const atDoor = game.snapshotFor(0);
    let best = 0;
    let posingAt = -1;
    for (let i = 0; i < 60; i += 1) {
      game.advance(1);
      const s = game.snapshotFor(0);
      best = Math.max(best, s.tricks.pose.oneFoot);
      if (posingAt < 0 && s.tricks.pose.state === 'posing') posingAt = i;
    }
    return {
      heldAtDoor: atDoor.actions.hopHeld,
      holdAtDoor: atDoor.tricks.pose.holdSeconds,
      stateAtDoor: atDoor.tricks.pose.state,
      best,
      posingAt,
    };
  });

  expect(after.heldAtDoor).toBe(true);
  expect(after.holdAtDoor).toBe(0);
  expect(after.stateAtDoor).toBe('idle');
  // The dwell restarted at the door, so the pose arrives a whole dwell later.
  expect(after.posingAt).toBe(QUALIFY_STEPS - 1);
  expect(after.best).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a restart and a teleport put both boots back on the pedals outright', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const out = await page.evaluate(poseOut);
  expect(out.oneFoot).toBeGreaterThanOrEqual(0.999);

  const reset = await page.evaluate(() => {
    const game = window.game;
    // The player's own restart, through the real one-shot.
    game.setActionsFor(0, { reset: true });
    game.advance(1);
    const s = game.snapshotFor(0);
    return {
      oneFoot: s.tricks.pose.oneFoot,
      state: s.tricks.pose.state,
      qualified: s.tricks.pose.qualifiedThisFlight,
      grounded: s.euc.grounded,
    };
  });
  expect(reset.oneFoot).toBe(0);
  expect(reset.state).toBe('idle');
  expect(reset.qualified).toBe(false);

  const out2 = await page.evaluate(poseOut);
  expect(out2.oneFoot).toBeGreaterThanOrEqual(0.999);
  const teleported = await page.evaluate(() => {
    const game = window.game;
    const at = game.snapshotFor(0).euc.position;
    game.placeRider({ x: at.x + 6, y: at.y, z: at.z }, 0);
    const s = game.snapshotFor(0);
    return {
      oneFoot: s.tricks.pose.oneFoot,
      state: s.tricks.pose.state,
      qualified: s.tricks.pose.qualifiedThisFlight,
    };
  });
  // A teleport ends the flight, so it ends the pose — and it does so before a
  // frame is drawn, which is what keeps a placed rider from being drawn
  // mid-gesture.
  expect(teleported.oneFoot).toBe(0);
  expect(teleported.state).toBe('idle');
  expect(teleported.qualified).toBe(false);
  expect(errors).toEqual([]);
});

test('a seat that stands up takes its pose with it, and the player keeps theirs', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const guest = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.spawnRider('cool-rider');
    // The guest holds; the player does not. Addressed forms throughout.
    game.setActionsFor(1, { hop: true, hopHeld: true });
    game.advance(1);
    game.setActionsFor(1, { hop: false });
    let best = 0;
    for (let i = 0; i < 120; i += 1) {
      game.advance(1);
      best = Math.max(best, game.snapshotFor(1).tricks.pose.oneFoot);
    }
    return {
      seats: game.seatCount,
      guestBest: best,
      guestState: game.snapshotFor(1).tricks.pose.state,
      playerOneFoot: game.snapshotFor(0).tricks.pose.oneFoot,
      playerState: game.snapshotFor(0).tricks.pose.state,
    };
  });
  expect(guest.seats).toBe(2);
  expect(guest.guestBest).toBeGreaterThanOrEqual(0.999);
  // The player's own seat never moved: the level is per seat, not per game.
  expect(guest.playerOneFoot).toBe(0);
  expect(guest.playerState).toBe('idle');

  const removed = await page.evaluate(() => {
    const game = window.game;
    game.despawnRider();
    let missing = '';
    try {
      game.snapshotFor(1);
    } catch (error) {
      missing = (error as Error).message;
    }
    game.advance(30);
    // A chair that comes back is a new seat with both boots down.
    game.spawnRider('cool-rider');
    game.advance(1);
    const fresh = game.snapshotFor(1).tricks.pose;
    return {
      seats: game.seatCount,
      missing,
      freshOneFoot: fresh.oneFoot,
      freshState: fresh.state,
      freshHeld: game.snapshotFor(1).actions.hopHeld,
    };
  });
  expect(removed.missing).toContain('no such seat: 1');
  expect(removed.seats).toBe(2);
  expect(removed.freshOneFoot).toBe(0);
  expect(removed.freshState).toBe('idle');
  expect(removed.freshHeld).toBe(false);
  expect(errors).toEqual([]);
});

test('the race countdown keeps the pose off, and GO drops the dwell with the buffered press', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const lights = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider('cool-rider');
    game.clearRecords();
    game.tuning.set('RACE.laps', 1);
    game.startTrackDay();
    game.advance(2);
    // Both a held level and a press, standing on the grid behind the lights.
    game.setActionsFor(0, { hop: true, hopHeld: true });
    const before = game.snapshotFor(0).consumed.hop ?? 0;
    let worst = 0;
    let steps = 0;
    while (game.snapshot().race.phase === 'countdown' && steps < 2400) {
      game.advance(1);
      steps += 1;
      worst = Math.max(worst, game.snapshotFor(0).tricks.pose.oneFoot);
    }
    const atGo = game.snapshotFor(0);
    return {
      phase: game.snapshot().race.phase,
      worstDuringCountdown: worst,
      heldAtGo: atGo.actions.hopHeld,
      holdAtGo: atGo.tricks.pose.holdSeconds,
      stateAtGo: atGo.tricks.pose.state,
      consumedBefore: before,
      consumedAtGo: atGo.consumed.hop ?? 0,
      hopsAtGo: atGo.euc.hops,
    };
  });

  expect(lights.phase).toBe('running');
  // Behind the lights the root substitutes neutral intent, so nothing the
  // player leans on can show.
  expect(lights.worstDuringCountdown).toBe(0);
  // GO drops the buffered one-shot (nobody jump-starts) and the dwell with it,
  // while the held level itself stands — it is airborne-only and the grid is
  // on the ground.
  expect(lights.consumedAtGo).toBe(lights.consumedBefore);
  expect(lights.hopsAtGo).toBe(0);
  expect(lights.holdAtGo).toBe(0);
  expect(lights.stateAtGo).toBe('idle');
  expect(lights.heldAtGo).toBe(true);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Physical equality, in the live game
// ---------------------------------------------------------------------------

/**
 * Two seats, the same place, the same script — one holding Hop and one not.
 *
 * **Rider contact is switched off for the run** (`setContactEnabled(false)`):
 * two riders standing on one coordinate would bump each other, and a
 * comparison whose two sides are shoving one another proves nothing about the
 * held level. Everything else is the shipped path.
 */
function equalityRun(plan: { hold: boolean; crouchOnGuest: boolean; steps: number }): {
  digests: [string, string];
  firstDiff: number;
  guestBest: number;
  ends: [string, string];
} {
  const game = window.game;
  game.loop.setRunning(false);
  game.setContactEnabled(false);
  // Two sober riders, named rather than left to the roster: the Drunkard's
  // manner of riding is a real difference in the ride (M29), and a comparison
  // that let him in would be comparing two things at once.
  game.setOptions({ character: 'cool-rider' });
  while (game.seatCount < 2) game.spawnRider('red-rider');
  game.advance(2);

  // **The plan's own spawn, not wherever the last run left somebody.** Every
  // run of this function must start from the same coordinate or the rides are
  // not comparable across runs, and `placeRider` resets the controller (hops,
  // landings and the odometer with it) so each run starts from zero.
  const spawn = game.levelPlan.spawn;
  const at = { x: spawn.position.x, y: spawn.position.y, z: spawn.position.z };
  game.placeRider(at, spawn.headingY, 0);
  game.placeRider(at, spawn.headingY, 1);

  // Exact, and exactly comparable: `JSON.stringify` prints the shortest string
  // that round-trips a double, so two equal strings are two equal doubles —
  // with -0 and the non-finites spelled out rather than flattened.
  const digest = (value: unknown): string => JSON.stringify(value, (_key, v) => {
    if (typeof v !== 'number') return v;
    if (Object.is(v, -0)) return '-0';
    return Number.isFinite(v) ? v : String(v);
  });

  const script: { actions: ScriptedActions; steps: number }[] = [
    { actions: { throttle: 1 }, steps: 240 },
    { actions: { hop: true }, steps: 1 },
    { actions: { hop: false }, steps: 120 },
    { actions: { steer: 0.8 }, steps: 120 },
    { actions: { crouch: true }, steps: 40 },
    { actions: { crouch: false, hop: true }, steps: 1 },
    { actions: { hop: false, steer: -0.6 }, steps: 150 },
    { actions: { throttle: -1, steer: 0 }, steps: 120 },
  ];

  const traces: string[][] = [[], []];
  let guestBest = 0;
  let written = 0;
  for (const segment of script) {
    for (let seat = 0; seat < 2; seat += 1) {
      const actions: ScriptedActions = { ...segment.actions };
      // The one difference between the two rides, written on every segment so
      // neither side can inherit a level from an earlier run.
      actions.hopHeld = seat === 1 && plan.hold;
      // The positive control: a difference that *is* physical, on the segment
      // the guest would otherwise ride exactly as the player does.
      if (seat === 1 && plan.crouchOnGuest && written === 0) actions.crouch = true;
      game.setActionsFor(seat, actions);
    }
    written += 1;
    for (let i = 0; i < segment.steps && traces[0].length < plan.steps; i += 1) {
      game.advance(1);
      for (let seat = 0; seat < 2; seat += 1) traces[seat].push(digest(game.snapshotFor(seat).euc));
      guestBest = Math.max(guestBest, game.snapshotFor(1).tricks.pose.oneFoot);
    }
  }

  let firstDiff = -1;
  for (let i = 0; i < traces[0].length; i += 1) {
    if (traces[0][i] !== traces[1][i]) { firstDiff = i; break; }
  }
  const fold = (rows: string[]): string => {
    // FNV-1a over the whole ride, so the wire carries a digest and not a ride.
    let h = 0x811c9dc5;
    for (const row of rows) {
      for (let i = 0; i < row.length; i += 1) {
        h ^= row.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
    }
    return (h >>> 0).toString(16);
  };
  return {
    digests: [fold(traces[0]), fold(traces[1])],
    firstDiff,
    guestBest,
    ends: [traces[0][traces[0].length - 1], traces[1][traces[1].length - 1]],
  };
}

test('the held level is presentation: two seats riding one script differ only in the foot', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await boot(page);

  // The control first: with neither seat holding, the two seats must already
  // be bit-identical, or nothing below could mean anything.
  const control = await page.evaluate(equalityRun, { hold: false, crouchOnGuest: false, steps: 700 });
  expect(control.firstDiff, 'two seats, one script, no hold').toBe(-1);
  expect(control.digests[0]).toBe(control.digests[1]);
  expect(control.guestBest).toBe(0);

  // The claim: the same run with the guest holding Hop throughout.
  const held = await page.evaluate(equalityRun, { hold: true, crouchOnGuest: false, steps: 700 });
  expect(held.firstDiff, 'the held level moved the ride').toBe(-1);
  expect(held.digests[0]).toBe(held.digests[1]);
  expect(held.ends[0]).toBe(held.ends[1]);
  // And the foot really was out, or the equality is of a gesture nobody made.
  expect(held.guestBest).toBeGreaterThanOrEqual(0.999);
  // The ride is the same ride as the control's, too: the held level changed
  // neither seat, not merely both alike.
  expect(held.digests[0]).toBe(control.digests[0]);

  // The positive control: a difference this comparison *can* see.
  const crouched = await page.evaluate(equalityRun, { hold: true, crouchOnGuest: true, steps: 700 });
  expect(crouched.firstDiff).toBeGreaterThanOrEqual(0);
  expect(crouched.digests[0]).not.toBe(crouched.digests[1]);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// What is drawn
// ---------------------------------------------------------------------------

/**
 * Both ankles of each named rig, in that rig's own root frame.
 *
 * Read out of the scene graph by name, on `rigTransform`'s argument: it proves
 * the object is in the scene the player is looking at, which is the thing a
 * screenshot would otherwise have to establish.
 */
function anklesOf(prefixes: string[]): {
  prefix: string;
  left: { x: number; y: number; z: number };
  right: { x: number; y: number; z: number };
}[] {
  const scene = window.game.renderer.scene;
  scene.updateMatrixWorld(true);
  return prefixes.map((prefix) => {
    const root = scene.getObjectByName(`${prefix}blockout`);
    const left = scene.getObjectByName(`${prefix}ankle-left`);
    const right = scene.getObjectByName(`${prefix}ankle-right`);
    if (!root || !left || !right) throw new Error(`no rig named ${prefix}*`);
    const read = (node: typeof left) => {
      const local = root.worldToLocal(node.getWorldPosition(node.position.clone()));
      return { x: local.x, y: local.y, z: local.z };
    };
    return { prefix, left: read(left), right: read(right) };
  });
}

/**
 * One hop from the plan's spawn, stopped on a named airborne step, with the
 * rig read as three.js actually has it.
 *
 * Both readings a with/without comparison needs come from here, so the only
 * difference between them is the argument.
 */
function riderAtAir(plan: { air: number; hold: boolean }): {
  oneFoot: number;
  air: number;
  rig: ReturnType<Window['qa']['rigTransform']>;
  /** Both ankles and the rider's own two sides, in normalised device space. */
  screen: {
    right: { x: number; y: number; inFront: boolean };
    left: { x: number; y: number; inFront: boolean };
    riderRight: { x: number; y: number; inFront: boolean };
    riderLeft: { x: number; y: number; inFront: boolean };
  };
} {
  const game = window.game;
  game.loop.setRunning(false);
  const spawn = game.levelPlan.spawn;
  game.placeRider({ x: spawn.position.x, y: spawn.position.y, z: spawn.position.z }, spawn.headingY);
  game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
  game.advance(60);
  game.setActionsFor(0, { hop: true, hopHeld: plan.hold });
  game.advance(1);
  game.setActionsFor(0, { hop: false });
  let air = 0;
  for (let i = 0; i < 300; i += 1) {
    game.advance(1);
    if (game.snapshotFor(0).euc.airHeight > 0) air += 1;
    if (air >= plan.air) {
      // Screen space is the one measurement in this suite that can tell left
      // from right (`tests/harness.ts`), so the drawn side is read there.
      const scene = game.renderer.scene;
      scene.updateMatrixWorld(true);
      const ankle = (name: string) => {
        const node = scene.getObjectByName(name);
        if (!node) throw new Error(`no ${name} in the scene`);
        const world = node.getWorldPosition(node.position.clone());
        return window.qa.projectPoint(world.x, world.y, world.z);
      };
      const probe = window.qa.screenProbe(1);
      return {
        oneFoot: game.snapshotFor(0).tricks.pose.oneFoot,
        air,
        rig: window.qa.rigTransform(),
        screen: {
          right: ankle('rider-ankle-right'),
          left: ankle('rider-ankle-left'),
          riderRight: probe.riderRight,
          riderLeft: probe.riderLeft,
        },
      };
    }
  }
  throw new Error(`the flight never reached air step ${plan.air}`);
}

test('the gesture is drawn on the released side, and the ghost keeps both boots down', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await boot(page);

  // **The same step of the same flight, with the level and without it.** A
  // standing rider is not the comparison: the air stance alone bends both
  // knees, so a grounded "before" would score the tuck as the gesture. Both
  // readings below are taken on airborne step 40 of a hop from the plan's
  // spawn, so the only difference between them is the held Hop.
  const posed = await page.evaluate(riderAtAir, { air: 40, hold: true });
  const neutral = await page.evaluate(riderAtAir, { air: 40, hold: false });
  expect(posed.oneFoot).toBeGreaterThanOrEqual(0.999);
  expect(neutral.oneFoot).toBe(0);

  // `RIDER_BLOCKOUT.oneFootReleaseSide` is -1, the rider's right. The right
  // ankle rises and trails; the left stays exactly where it was.
  expect(RIDER_BLOCKOUT.oneFootReleaseSide).toBe(-1);
  const rise = posed.rig.rightAnkleY - neutral.rig.rightAnkleY;
  const trail = posed.rig.rightAnkleZ - neutral.rig.rightAnkleZ;
  expect(rise, 'the released ankle rises').toBeGreaterThan(0.08);
  expect(trail, 'the released ankle trails behind its pedal').toBeLessThan(-0.15);
  expect(Math.abs(posed.rig.leftAnkleY - neutral.rig.leftAnkleY), 'the planted ankle').toBeLessThan(1e-9);
  expect(Math.abs(posed.rig.leftAnkleZ - neutral.rig.leftAnkleZ), 'the planted ankle').toBeLessThan(1e-9);

  // What the gesture actually spends, recorded rather than merely bounded:
  // the numbers a later change to `RIDER_BLOCKOUT.oneFoot*` should be read
  // against.
  await testInfo.attach('one-foot-ankle-travel', {
    body: [
      `released (right) ankle rise  ${(rise * 1000).toFixed(1)} mm`,
      `released (right) ankle trail ${(trail * 1000).toFixed(1)} mm (negative is behind)`,
      `planted (left) ankle dY ${(posed.rig.leftAnkleY - neutral.rig.leftAnkleY).toExponential(2)} m`,
      `planted (left) ankle dZ ${(posed.rig.leftAnkleZ - neutral.rig.leftAnkleZ).toExponential(2)} m`,
      `screen rise of the released boot ${(posed.screen.right.y - posed.screen.left.y).toFixed(4)} NDC`,
    ].join('\n'),
    contentType: 'text/plain',
  });
  console.log(`[m36_3] ankle rise ${(rise * 1000).toFixed(1)} mm, trail ${(trail * 1000).toFixed(1)} mm,`
    + ` planted dY ${(posed.rig.leftAnkleY - neutral.rig.leftAnkleY).toExponential(2)},`
    + ` screen rise ${(posed.screen.right.y - posed.screen.left.y).toFixed(4)}`);

  // And on screen, which is the only reading in this suite that can tell the
  // rider's left from their right. Without the hold the two boots sit level;
  // with it, the boot on the rider's own right side is the one that has risen.
  for (const point of [posed.screen.right, posed.screen.left, posed.screen.riderRight]) {
    expect(point.inFront).toBe(true);
  }
  expect(Math.abs(neutral.screen.right.y - neutral.screen.left.y), 'level boots').toBeLessThan(0.005);
  expect(posed.screen.right.y - posed.screen.left.y, 'the risen boot').toBeGreaterThan(0.02);
  // The risen boot is on the side the constant names, checked against the
  // camera rather than against a sign written down here.
  expect(Math.sign(posed.screen.right.x - posed.screen.left.x))
    .toBe(Math.sign(posed.screen.riderRight.x - posed.screen.riderLeft.x));

  // The ghost has no such channel to reach (`render/ghostRider.ts` forwards
  // `apply` only), and the live scene agrees: with the player's foot fully
  // out, the ghost's two boots are mirror images of each other. Ghost
  // *playback* with the foot out is proved sample by sample headlessly in
  // `src/render/ghostRider.test.ts`; what a browser adds is that the two rigs
  // share a scene and still do not share the pose.
  const again = await page.evaluate(riderAtAir, { air: 40, hold: true });
  expect(again.oneFoot).toBeGreaterThanOrEqual(0.999);
  await page.evaluate(() => {
    window.game.renderer.setGhostVisible(true);
    window.game.advance(1);
  });
  const rigs = await page.evaluate(anklesOf, ['rider-', 'ghost-rider-']);
  const player = rigs[0];
  const ghost = rigs[1];
  expect(Math.abs(ghost.left.y - ghost.right.y)).toBeLessThan(1e-9);
  expect(Math.abs(ghost.left.z - ghost.right.z)).toBeLessThan(1e-9);
  expect(Math.abs(ghost.left.x + ghost.right.x)).toBeLessThan(1e-9);
  // And the same reading on the player's rig is nothing like symmetric.
  expect(Math.abs(player.left.y - player.right.y)).toBeGreaterThan(0.08);
  expect(errors).toEqual([]);
});

/** Ride up to speed, hop with the level held, and stop at the full gesture. */
function poseAtSpeed(): {
  speed: number;
  oneFoot: number;
  camera: string;
  /** Where the rider's hips are on screen, in NDC, for the close crop. */
  rider: { x: number; y: number; inFront: boolean };
  /**
   * How far the released boot has risen above the planted one *on screen*,
   * in NDC, at this speed and this camera distance — the legibility number
   * the owner's G2 ride is the judge of, recorded rather than guessed at.
   */
  screenRise: number;
} {
  const game = window.game;
  game.loop.setRunning(false);
  game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
  game.advance(30);
  game.setActionsFor(0, { throttle: 1 });
  game.advance(300);
  game.setActionsFor(0, { hop: true, hopHeld: true });
  game.advance(1);
  game.setActionsFor(0, { hop: false });
  for (let i = 0; i < 200; i += 1) {
    game.advance(1);
    const s = game.snapshotFor(0);
    if (s.tricks.pose.oneFoot >= 0.999) {
      const at = s.euc.position;
      const scene = game.renderer.scene;
      scene.updateMatrixWorld(true);
      const ankle = (name: string) => {
        const node = scene.getObjectByName(name);
        if (!node) throw new Error(`no ${name} in the scene`);
        const world = node.getWorldPosition(node.position.clone());
        return window.qa.projectPoint(world.x, world.y, world.z);
      };
      return {
        speed: s.euc.speed,
        oneFoot: s.tricks.pose.oneFoot,
        camera: s.camera.mode,
        rider: window.qa.projectPoint(at.x, at.y + 0.6, at.z),
        screenRise: ankle('rider-ankle-right').y - ankle('rider-ankle-left').y,
      };
    }
  }
  throw new Error('the pose never reached the full gesture');
}

const LOOKS = ['cool-rider', 'drunkard', 'trollina', 'seal-on-a-wheel', 'maribel-vargas'] as const;

for (const look of LOOKS) {
  test(`the one-foot air reads on the chase camera: ${look}`, async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await boot(page);
    await page.evaluate((id) => window.game.setOptions({ character: id }), look);

    const shot = await page.evaluate(poseAtSpeed);
    expect(shot.oneFoot).toBeGreaterThanOrEqual(0.999);
    // Gameplay scale, on the camera the player rides behind — not a rig view.
    expect(shot.camera).toBe('chase');
    expect(shot.speed).toBeGreaterThan(4);

    const view0 = page.viewportSize();
    const pixels = (shot.screenRise / 2) * (view0?.height ?? 700);
    console.log(`[m36_3] ${look}: ${(shot.speed * 3.6).toFixed(0)} km/h,`
      + ` released boot ${shot.screenRise.toFixed(4)} NDC (~${pixels.toFixed(0)} px) above the planted one`);
    await testInfo.attach(`${look}-legibility`, {
      body: `speed ${(shot.speed * 3.6).toFixed(1)} km/h; released boot ${shot.screenRise.toFixed(4)} NDC`
        + ` (~${pixels.toFixed(0)} px of ${view0?.height ?? 700}) above the planted one`,
      contentType: 'text/plain',
    });
    // It is drawn, at gameplay scale, on the camera the player rides behind.
    expect(shot.screenRise).toBeGreaterThan(0);
    await saveShot(page, testInfo, `${look}-one-foot`);
    // The same frame again, cropped to the rider: the claim is about a gesture
    // a few centimetres across on a rig forty pixels tall at gameplay scale,
    // and a reviewer should not have to take the full frame's word for it.
    // Nothing is re-rendered and nothing moves — the loop is frozen.
    expect(shot.rider.inFront).toBe(true);
    const view = page.viewportSize();
    const cx = ((shot.rider.x + 1) / 2) * (view?.width ?? 1000);
    const cy = ((1 - shot.rider.y) / 2) * (view?.height ?? 700);
    await saveShot(page, testInfo, `${look}-one-foot-crop`, {
      x: Math.max(0, Math.round(cx - 160)),
      y: Math.max(0, Math.round(cy - 160)),
      width: 320,
      height: 320,
    });
    expect(errors).toEqual([]);
  });
}

async function saveShot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  clip?: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const body = clip ? await page.screenshot({ clip }) : await page.screenshot();
  await mkdir(SHOTS, { recursive: true });
  await writeFile(`${SHOTS}/${name}.png`, body);
  await testInfo.attach(name, { body, contentType: 'image/png' });
}

// ---------------------------------------------------------------------------
// §36.6 — the trick tally, on the park, and the card that prints it
//
// The *rules* are headless and stay there: `simulation/trickEvents.test.ts`
// holds the observer's whole table (17 tests), `trackDay.test.ts` and
// `raceRun.test.ts` hold the two referees' lifecycle (11 more), and every one
// of those guards has been shown to fail without the thing it guards. What
// only a browser can prove is the *wiring*: that the ten facts `app/Game.ts`
// assembles each fixed step are the facts the rider's own hop, spin and pose
// produced; that the session counting them is the one the player is in; and
// that the counts reach the screen with the words this screen owns.
//
// Every case below rides the park, because that is the venue §36 is about and
// because its apron is the one level surface on it (`switchbackLevel.test.ts`
// §7 pins the apron level in every axis) — a hop measured on a 6.5 % descent
// would be measuring the hillside.
// ---------------------------------------------------------------------------

/** What a flight is asked to do, and where. Read by `runTricks`, in the page. */
interface TrickPlan {
  /** Cross the start line first, so the session is on a counting lap. */
  cross: boolean;
  /** Leave the envelope and come back before riding: a lap already voided. */
  voidLap: boolean;
  /** Hold the crouch through the whole charge window before the press. */
  charge: boolean;
  /** Hold the Hop level through the flight — §36.5's one-foot air. */
  hold: boolean;
  /** Press Hop again on this airborne step to throw the 180; 0 for none. */
  spinAtAir: number;
  /** Interrupt the flight on this airborne step; 0 for none. */
  interruptAtAir: number;
  /** How it is interrupted: the player's own restart, or a bridge teleport. */
  interrupt: 'reset' | 'teleport';
  /** Live tuning pushed before the flight. The page is thrown away after. */
  tuning: [string, number][];
  /** Fixed steps to run after the press. */
  steps: number;
  /** How many times to fly the same script in the one session. */
  flights: number;
}

const TRICK_PLAN: TrickPlan = {
  cross: true,
  voidLap: false,
  charge: false,
  hold: false,
  spinAtAir: 0,
  interruptAtAir: 0,
  interrupt: 'reset',
  tuning: [],
  steps: 180,
  flights: 1,
};

/** One end of a flight, as the bridge reported it on that single step. */
interface TrickEdge {
  air: number;
  facts: TrickFacts;
  session: TrickTally | null;
}

interface TrickRun {
  phase: string;
  voided: string | null;
  /** The clearance of the off-envelope point, when one was used. */
  offClearance: number;
  before: TrickTally | null;
  launch: TrickEdge | null;
  touchdown: TrickEdge | null;
  after: TrickTally | null;
  airSteps: number;
  maxOneFoot: number;
  /** The most spins the controller ever reported — a reset zeroes its counter. */
  maxSpins: number;
  qualifiedInAir: boolean;
  spinCompletedInAir: boolean;
  euc: {
    hops: number;
    spins: number;
    landings: number;
    landingQuality: string;
    crashed: boolean;
    surface: string;
  };
  lap: { lapsCounted: number; lapsRidden: number; voided: string | null; phase: string };
}

/**
 * Open a track day on the park and fly one scripted flight in it.
 *
 * Runs whole in the page (harness rule 3). The loop is frozen first, so every
 * reading below is a fixed step of the real update path.
 */
function runTricks(plan: TrickPlan): TrickRun {
  const game = window.game;
  game.loop.setRunning(false);
  game.clearRecords();
  game.startTrackDay();
  game.advance(2);
  for (const [path, value] of plan.tuning) game.tuning.set(path, value);

  const gates = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
  const line = gates[0];
  /** A point `metres` back down the apron from the start line. */
  const backFromLine = (metres: number) => ({
    x: line.centre.x - Math.sin(line.headingY) * metres,
    y: line.centre.y,
    z: line.centre.z - Math.cos(line.headingY) * metres,
  });

  if (plan.cross) {
    game.placeRider({ ...line.centre }, line.headingY);
    game.advance(2);
    game.advance(30);
  }

  let offClearance = 0;
  if (plan.voidLap) {
    // **Off the envelope, measured against every span of the ring**, because a
    // switchback folds the lap back on itself and being clear of one corridor
    // says nothing about the leg running the other way. m36.spec.ts's own
    // arithmetic, anchored on the apron and taking whichever side of it is the
    // further from everything else.
    const lap = game.levelPlan.lap!;
    const here = backFromLine(20);
    const clearanceAt = (x: number, z: number): number => {
      let worst = Infinity;
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
        worst = Math.min(worst, distance - Math.max(a.halfWidth, b.halfWidth));
      }
      return worst;
    };
    const sideways = [1, -1].map((sign) => ({
      x: here.x + Math.cos(line.headingY) * 24 * sign,
      z: here.z - Math.sin(line.headingY) * 24 * sign,
    }));
    const out = sideways[0];
    const best = clearanceAt(sideways[0].x, sideways[0].z) >= clearanceAt(sideways[1].x, sideways[1].z)
      ? sideways[0]
      : sideways[1];
    out.x = best.x;
    out.z = best.z;
    offClearance = clearanceAt(out.x, out.z);
    game.placeRider({ x: out.x, y: 0, z: out.z }, line.headingY);
    game.advance(2);
    game.advance(10);
    // Back onto the apron, short of the line so nothing is crossed: the void is
    // sticky and the rider is on the racing surface again.
    game.placeRider(backFromLine(20), line.headingY);
    game.advance(4);
  }

  const phase = game.snapshot().trackDay.phase;
  const voided = game.snapshot().trackDay.voided;
  const before = game.snapshotFor(0).tricks.session;

  let launch: TrickEdge | null = null;
  let touchdown: TrickEdge | null = null;
  let airSteps = 0;
  let maxOneFoot = 0;
  let maxSpins = 0;
  let qualifiedInAir = false;
  let spinCompletedInAir = false;

  for (let flight = 0; flight < plan.flights; flight += 1) {
    if (plan.charge) {
      // The whole charge window and a margin: `EUC.hopChargeSeconds` is 0.40 s
      // and the crouch grows one fixed step at a time.
      game.setActionsFor(0, { throttle: 0, steer: 0, crouch: true, hop: false, hopHeld: false });
      game.advance(72);
    }
    game.setActionsFor(0, { crouch: false, hop: true, hopHeld: plan.hold });
    game.advance(1);
    game.setActionsFor(0, { hop: false, hopHeld: plan.hold });

    let air = 0;
    let spun = false;
    let interrupted = false;
    for (let step = 0; step < plan.steps; step += 1) {
      game.advance(1);
      const s = game.snapshotFor(0);
      const flying = s.euc.airHeight > 0 && !s.euc.crashed;
      if (flying) air += 1;
      if (flying) airSteps += 1;
      maxOneFoot = Math.max(maxOneFoot, s.tricks.pose.oneFoot);
      maxSpins = Math.max(maxSpins, s.euc.spins);
      const facts = s.tricks.facts;
      if (facts.oneFootQualified) qualifiedInAir = true;
      if (facts.spinCompleted) spinCompletedInAir = true;
      if (facts.tookOff) {
        launch = { air, facts: { ...facts }, session: s.tricks.session };
      }
      if (facts.touchedDown) {
        touchdown = { air, facts: { ...facts }, session: s.tricks.session };
      }
      if (!spun && plan.spinAtAir > 0 && flying && air >= plan.spinAtAir) {
        spun = true;
        // The second press, latched while the wheel is still rising — M24's
        // move, and the only thing the controller accepts a spin from.
        game.setActionsFor(0, { hop: true, hopHeld: plan.hold });
        game.advance(1);
        game.setActionsFor(0, { hop: false, hopHeld: plan.hold });
      }
      if (!interrupted && plan.interruptAtAir > 0 && flying && air >= plan.interruptAtAir) {
        interrupted = true;
        if (plan.interrupt === 'reset') {
          game.setActionsFor(0, { reset: true, hop: false, hopHeld: plan.hold });
          game.advance(1);
          game.setActionsFor(0, { reset: false, hop: false, hopHeld: plan.hold });
        } else {
          game.placeRider(backFromLine(20), line.headingY);
          game.advance(1);
        }
      }
    }
    game.setActionsFor(0, { throttle: 0, steer: 0, crouch: false, hop: false, hopHeld: false });
    game.advance(30);
  }

  const end = game.snapshotFor(0);
  const lap = game.snapshot().trackDay;
  return {
    phase,
    voided,
    offClearance,
    before,
    launch,
    touchdown,
    after: end.tricks.session,
    airSteps,
    maxOneFoot,
    maxSpins,
    qualifiedInAir,
    spinCompletedInAir,
    euc: {
      hops: end.euc.hops,
      spins: end.euc.spins,
      landings: end.euc.landings,
      landingQuality: end.euc.landingQuality,
      crashed: end.euc.crashed,
      surface: end.euc.surface,
    },
    lap: {
      lapsCounted: lap.lapsCounted,
      lapsRidden: lap.lapsRidden,
      voided: lap.voided,
      phase: lap.phase,
    },
  };
}

const ZERO: TrickTally = { cleanLandings: 0, chargedHops: 0, spinsLanded: 0, oneFootAirs: 0 };

test('one flight banks the charged hop at the launch and the 180 and the foot at the landing', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const run = await page.evaluate(runTricks, {
    ...TRICK_PLAN,
    charge: true,
    hold: true,
    spinAtAir: 4,
    steps: 200,
  } satisfies TrickPlan);

  expect(run.phase).toBe('running');
  expect(run.before).toEqual(ZERO);

  // **The charge is read at the launch and only at the launch.** The struct the
  // observer was handed on that one step is on the bridge, so this is the fact
  // it judged rather than a reconstruction of it.
  expect(run.launch).not.toBeNull();
  expect(run.launch!.facts.hopped).toBe(true);
  expect(run.launch!.facts.hopCharge).toBeGreaterThanOrEqual(TRICKS.chargedHopMinCharge);
  // Banked before the rider is down: a hop is charged at the press, whatever
  // the landing turns out to be.
  expect(run.launch!.session!.chargedHops).toBe(1);
  expect(run.launch!.session!.spinsLanded).toBe(0);
  expect(run.launch!.session!.oneFootAirs).toBe(0);

  // The 180 swept in full and the foot qualified, both mid-air, both latched.
  expect(run.spinCompletedInAir).toBe(true);
  expect(run.qualifiedInAir).toBe(true);
  expect(run.maxOneFoot).toBeGreaterThanOrEqual(0.999);
  expect(run.euc.spins).toBe(1);

  // And the touchdown is where the two of them are paid.
  expect(run.touchdown).not.toBeNull();
  expect(run.touchdown!.facts.landingQuality).toBe('clean');
  expect(run.touchdown!.facts.crashed).toBe(false);
  expect(run.after).toEqual({
    cleanLandings: 1,
    chargedHops: 1,
    spinsLanded: 1,
    oneFootAirs: 1,
  });
  expect(errors).toEqual([]);
});

test('the out lap earns nothing, and the identical flight on a counting lap earns everything', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const out = await page.evaluate(runTricks, {
    ...TRICK_PLAN,
    cross: false,
    charge: true,
    hold: true,
    spinAtAir: 4,
    steps: 200,
  } satisfies TrickPlan);

  expect(out.phase).toBe('outLap');
  // The flight really happened — this is not a script that failed to fly.
  expect(out.airSteps).toBeGreaterThan(30);
  expect(out.euc.hops).toBe(1);
  expect(out.euc.spins).toBe(1);
  expect(out.spinCompletedInAir).toBe(true);
  expect(out.qualifiedInAir).toBe(true);
  expect(out.euc.landings).toBe(1);
  // And it earned nothing at all. A rider on the way to the line is not on a
  // lap, and §36.6 counts the afternoon's laps.
  expect(out.after).toEqual(ZERO);

  const counted = await page.evaluate(runTricks, {
    ...TRICK_PLAN,
    charge: true,
    hold: true,
    spinAtAir: 4,
    steps: 200,
  } satisfies TrickPlan);
  expect(counted.phase).toBe('running');
  expect(counted.after).toEqual({
    cleanLandings: 1,
    chargedHops: 1,
    spinsLanded: 1,
    oneFootAirs: 1,
  });
  expect(errors).toEqual([]);
});

test('a voided lap still counts what the rider actually landed', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const run = await page.evaluate(runTricks, {
    ...TRICK_PLAN,
    voidLap: true,
    charge: true,
    hold: true,
    spinAtAir: 4,
    steps: 200,
  } satisfies TrickPlan);

  // The lap is gone before a wheel leaves the ground, and it is gone by a
  // margin nothing rounds away.
  expect(
    run.offClearance,
    `the excursion was only ${run.offClearance.toFixed(2)} m clear of the ring`,
  ).toBeGreaterThan(2);
  expect(run.voided).toBe('off-course');
  expect(run.phase).toBe('running');

  // A rider who cut the corner still landed the 180 they landed.
  expect(run.after).toEqual({
    cleanLandings: 1,
    chargedHops: 1,
    spinsLanded: 1,
    oneFootAirs: 1,
  });
  // And the lap is still not a lap.
  expect(run.lap.voided).toBe('off-course');
  expect(run.lap.lapsCounted).toBe(0);
  expect(errors).toEqual([]);
});

test('a quick reset keeps the afternoon and loses only the flight it interrupted', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const kept = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearRecords();
    game.startTrackDay();
    game.advance(2);
    const line = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex)[0];
    game.placeRider({ ...line.centre }, line.headingY);
    game.advance(2);
    game.advance(30);

    // One landed flight, so there is an afternoon worth keeping.
    game.setActionsFor(0, { crouch: true });
    game.advance(72);
    game.setActionsFor(0, { crouch: false, hop: true, hopHeld: true });
    game.advance(1);
    game.setActionsFor(0, { hop: false, hopHeld: true });
    // Airborne first — the press compresses for eleven steps before the wheel
    // leaves the ground, and a grounded second press is another hop.
    game.advance(20);
    game.setActionsFor(0, { hop: true, hopHeld: true });
    game.advance(1);
    game.setActionsFor(0, { hop: false, hopHeld: true });
    game.advance(180);
    game.setActionsFor(0, { hop: false, hopHeld: false });
    game.advance(10);
    const earned = game.snapshotFor(0).tricks.session;

    // The player's own restart, through the real one-shot.
    game.setActionsFor(0, { reset: true });
    game.advance(1);
    game.setActionsFor(0, { reset: false });
    game.advance(30);
    const after = game.snapshotFor(0);
    return {
      earned,
      kept: after.tricks.session,
      phase: game.snapshot().trackDay.phase,
      elapsed: game.snapshot().trackDay.elapsed,
      pose: after.tricks.pose,
      facts: after.tricks.facts,
    };
  });

  expect(kept.earned).toEqual({
    cleanLandings: 1,
    chargedHops: 1,
    spinsLanded: 1,
    oneFootAirs: 1,
  });
  // A spin is not a reason to lose the afternoon: the clock and the lap go, the
  // counts stay.
  expect(kept.phase).toBe('outLap');
  expect(kept.elapsed).toBe(0);
  expect(kept.kept).toEqual(kept.earned);
  // And the flight the reset was standing in is simply gone.
  expect(kept.pose.state).toBe('idle');
  expect(kept.pose.qualifiedThisFlight).toBe(false);
  expect(errors).toEqual([]);
});

for (const door of ['reset', 'teleport'] as const) {
  test(`a ${door} mid-flight credits nothing, with the 180 swept and the foot out`, async ({ page }) => {
    const errors = collectErrors(page);
    await bootToTitle(page, PARK);

    const run = await page.evaluate(runTricks, {
      ...TRICK_PLAN,
      hold: true,
      spinAtAir: 4,
      // The sweep is pi at `EUC.spinYawRate` = 7.5 rad/s, so it is finished by
      // air step 55 of a 72-step flight, and the dwell qualifies at 18. The
      // interrupt lands after both and before the wheel is down: everything
      // §36.6 pays for has happened, and none of it was ridden out.
      interruptAtAir: 60,
      interrupt: door,
      steps: 200,
    } satisfies TrickPlan);

    expect(run.phase).toBe('running');
    expect(run.spinCompletedInAir).toBe(true);
    expect(run.qualifiedInAir).toBe(true);
    expect(run.maxOneFoot).toBeGreaterThanOrEqual(0.999);
    // Read at its peak rather than at the end: the door resets the controller,
    // and its own spin counter goes with it.
    expect(run.maxSpins).toBe(1);
    // Nothing. A step that integrates nothing observes nothing, and a flight
    // that was never ridden out pays for nothing.
    expect(run.after).toEqual(ZERO);
    expect(errors).toEqual([]);
  });
}

test('a crash landing forfeits the 180 and the foot, and keeps the charged hop', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const run = await page.evaluate(runTricks, {
    ...TRICK_PLAN,
    charge: true,
    hold: true,
    spinAtAir: 4,
    // **The crash is made by the landing, not by the scenery.** A tenth of the
    // shipped impact reference turns the ordinary 3 m/s touchdown of a standing
    // hop into a score past `EUC.landingCrashScore`, on the same flat apron
    // every other case here flies from — so the only thing that differs between
    // this run and the first one is how the rider arrived.
    tuning: [['EUC.landingImpactReference', 0.5]],
    steps: 200,
  } satisfies TrickPlan);

  expect(run.phase).toBe('running');
  expect(run.spinCompletedInAir).toBe(true);
  expect(run.qualifiedInAir).toBe(true);
  expect(run.touchdown).not.toBeNull();
  expect(run.touchdown!.facts.landingQuality).toBe('crash');
  // The completion and the qualification are still standing on the struct the
  // observer was handed — they are true and they are worth nothing.
  expect(run.touchdown!.facts.spinCompleted).toBe(true);
  expect(run.touchdown!.facts.oneFootQualified).toBe(true);

  expect(run.after!.spinsLanded).toBe(0);
  expect(run.after!.oneFootAirs).toBe(0);
  expect(run.after!.cleanLandings).toBe(0);
  // Banked at the launch, and a bin does not take it back.
  expect(run.after!.chargedHops).toBe(1);
  expect(errors).toEqual([]);
});

test('arming a spin that runs out of air credits nothing, and the rider lands anyway', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const run = await page.evaluate(runTricks, {
    ...TRICK_PLAN,
    spinAtAir: 2,
    // **A hop too small to turn in.** Pi at 7.5 rad/s needs 0.419 s of air and
    // a 1.2 m/s launch buys 2 x 1.2 / 9.81 = 0.245 s, so the sweep is cut off
    // by the ground with about 100 degrees still to go. `EUC.hopLaunchSpeed` is
    // a shipped slider (`LIVE_TUNABLES`), not a back door.
    tuning: [['EUC.hopLaunchSpeed', 1.2]],
    steps: 200,
  } satisfies TrickPlan);

  expect(run.phase).toBe('running');
  expect(run.airSteps).toBeGreaterThan(10);
  // Arming is not completing: the press counted a spin the instant it was made.
  expect(run.euc.spins).toBe(1);
  expect(run.spinCompletedInAir).toBe(false);
  // The rider came down, and came down alive — so the refusal below is about
  // the sweep that never finished and not about a crash.
  expect(run.touchdown).not.toBeNull();
  expect(run.touchdown!.facts.landingQuality).not.toBe('crash');
  expect(run.touchdown!.facts.spinCompleted).toBe(false);
  expect(run.after!.spinsLanded).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

const TRICK_LABELS = ['Clean landings', 'Charged hops', '180s landed', 'One-foot airs'];

/** The Tricks region, read off the live card exactly as a player sees it. */
function readTricksRegion(): {
  hidden: boolean;
  groups: { rider: string; labels: string[]; counts: string[] }[];
  rows: number;
  notes: string[];
  panelText: string;
} {
  const panel = document.querySelector<HTMLElement>('.euc-menu--results') ?? document.body;
  const region = document.querySelector<HTMLElement>('[data-menu="results-tricks"]')!;
  const groups = [...document.querySelectorAll<HTMLElement>(
    '[data-menu="results-tricks-groups"] .euc-results__trick-group',
  )].map((group) => ({
    rider: group.querySelector('.euc-results__trick-rider')?.textContent ?? '',
    labels: [...group.querySelectorAll('.euc-results__trick dt')].map((dt) => dt.textContent ?? ''),
    counts: [...group.querySelectorAll('.euc-results__trick dd')].map((dd) => dd.textContent ?? ''),
  }));
  return {
    hidden: region.hidden,
    groups,
    rows: document.querySelectorAll('[data-menu="results-rows"] tr').length,
    notes: [...document.querySelectorAll('[data-menu="results-notes"] li')]
      .map((li) => li.textContent ?? ''),
    panelText: panel.textContent ?? '',
  };
}

/** Does anything on this card scroll sideways? Panels, region and each group. */
function overflowProbe(): { name: string; scrollWidth: number; clientWidth: number }[] {
  const named: [string, Element | null][] = [
    ['menu', document.querySelector('.euc-menu--results')],
    ['panel', document.querySelector('.euc-results')],
    ['tricks', document.querySelector('[data-menu="results-tricks"]')],
    ['groups', document.querySelector('[data-menu="results-tricks-groups"]')],
    ['table', document.querySelector('[data-menu="results-table"]')],
  ];
  const out = named
    .filter(([, node]) => node !== null)
    .map(([name, node]) => ({
      name,
      scrollWidth: (node as HTMLElement).scrollWidth,
      clientWidth: (node as HTMLElement).clientWidth,
    }));
  [...document.querySelectorAll<HTMLElement>('.euc-results__trick-group')].forEach((group, i) => {
    out.push({ name: `group-${i}`, scrollWidth: group.scrollWidth, clientWidth: group.clientWidth });
  });
  return out;
}

test('the track-day card prints the afternoon in its own Tricks region, and calls nothing a score', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const session = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearRecords();
    game.startTrackDay();
    game.advance(2);
    const gates = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
    game.placeRider({ ...gates[0].centre }, gates[0].headingY);
    game.advance(2);
    game.advance(30);

    // Two charged, held flights, the first of them spun: four labels with four
    // different numbers behind them, so a card that printed one count in the
    // wrong row could not pass.
    for (const spin of [true, false]) {
      game.setActionsFor(0, { crouch: true });
      game.advance(72);
      game.setActionsFor(0, { crouch: false, hop: true, hopHeld: true });
      game.advance(1);
      game.setActionsFor(0, { hop: false, hopHeld: true });
      if (spin) {
        // **Twenty steps, not six.** The press compresses for
        // `EUC.hopCompressSeconds` before the wheel leaves the ground (measured
        // at eleven steps earlier in this file), and a second press made on the
        // ground is another hop request rather than M24's spin.
        game.advance(20);
        game.setActionsFor(0, { hop: true, hopHeld: true });
        game.advance(1);
        game.setActionsFor(0, { hop: false, hopHeld: true });
      }
      game.advance(200);
      game.setActionsFor(0, { hopHeld: false });
      game.advance(20);
    }
    // A lap of the gates, so the card has splits and notes of its own.
    for (const gate of [...gates.slice(1), gates[0]]) {
      game.placeRider({ ...gate.centre }, gate.headingY);
      game.advance(2);
      game.advance(30);
    }
    const tally = game.snapshot().trackDay.tricks;
    game.endTrackDay();
    return { tally, state: game.snapshot().app.state };
  });

  expect(session.state).toBe('results');
  expect(session.tally.chargedHops).toBe(2);
  expect(session.tally.oneFootAirs).toBe(2);
  expect(session.tally.spinsLanded).toBe(1);
  expect(session.tally.cleanLandings).toBe(2);

  const card = await page.evaluate(readTricksRegion);

  // The region is shown, once, with no rider name on a card with one rider.
  expect(card.hidden).toBe(false);
  expect(card.groups).toHaveLength(1);
  expect(card.groups[0].rider).toBe('');
  expect(card.groups[0].labels).toEqual(TRICK_LABELS);
  expect(card.groups[0].counts).toEqual([
    `${session.tally.cleanLandings}`,
    `${session.tally.chargedHops}`,
    `${session.tally.spinsLanded}`,
    `${session.tally.oneFootAirs}`,
  ]);

  // **Counts with short labels, and nothing added up.** §36.6 asks for no
  // grand total called a score, and the card must not have invented one.
  expect(card.panelText).not.toMatch(/score/i);
  expect(card.panelText).not.toMatch(/total/i);
  expect(card.panelText).toContain('Tricks');

  // The rows above it are m23's three sectors, untouched: the region is a
  // section of its own and never a row in the splits table.
  expect(card.rows).toBe(3);
  expect(card.notes.length).toBeGreaterThan(0);
  // m23's own print, still on the card and still first: the region was added
  // beside the notes, not in front of them.
  expect(card.notes.join(' ')).toMatch(/laps? counted/);

  // Portrait and landscape, the two shapes a phone offers.
  for (const view of [
    { name: 'portrait', width: 375, height: 667 },
    { name: 'landscape', width: 740, height: 420 },
    { name: 'desktop', width: 1000, height: 700 },
  ]) {
    await page.setViewportSize({ width: view.width, height: view.height });
    const probe = await page.evaluate(overflowProbe);
    for (const box of probe) {
      expect(
        box.scrollWidth,
        `${view.name}: ${box.name} scrolls sideways (${box.scrollWidth} > ${box.clientWidth})`,
      ).toBeLessThanOrEqual(box.clientWidth + 1);
    }
    await saveShot(page, testInfo, `lap-card-${view.name}`);
  }
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The race: one tally a rider
// ---------------------------------------------------------------------------

/** What each seat is told to do after GO. */
type SeatScript = 'charged-spin-foot' | 'charged' | 'plain-foot' | 'nothing';

interface RacePlan {
  seats: number;
  scripts: SeatScript[];
  /** Ride the scripts at all — the control run rides none of them. */
  tricks: boolean;
}

interface RaceRun {
  countdown: (TrickTally | null)[];
  countdownHops: number[];
  afterScripts: (TrickTally | null)[];
  /** Seat 0 after it finished and kept riding, and seat 1 beside it. */
  finishedSeat: TrickTally | null;
  unfinishedSeat: TrickTally | null;
  order: { seat: number; position: number; seconds: number | null; laps: number }[];
  state: string;
  phase: string;
}

function runRace(plan: RacePlan): RaceRun {
  const game = window.game;
  game.loop.setRunning(false);
  while (game.seatCount < plan.seats) game.spawnRider('cool-rider');
  game.clearRecords();
  game.tuning.set('RACE.laps', 1);
  game.startTrackDay();
  game.advance(2);

  const seats = [...Array(plan.seats).keys()];
  const gates = [...game.levelPlan.checkpoints].sort((a, b) => a.routeIndex - b.routeIndex);
  const cross = (gate: typeof gates[number], who: number[]): void => {
    for (const seat of who) game.placeRider({ ...gate.centre }, gate.headingY, seat);
    game.advance(2);
    game.advance(30);
  };
  /**
   * One flight of one seat, on a schedule that spends **the same 314 fixed
   * steps whatever the script asks for**.
   *
   * A race clock is real time, so a control run that simply did less work would
   * finish at a different second for a reason that has nothing to do with the
   * trick channel. Every branch below is in the *actions*, never in the number
   * of steps: the crouch is held or not, the press is made or not, the second
   * press is made or not, and the clock cannot tell.
   */
  const fly = (seat: number, script: SeatScript): void => {
    const charge = script === 'charged-spin-foot' || script === 'charged';
    const hold = script === 'charged-spin-foot' || script === 'plain-foot';
    const hop = script !== 'nothing';
    const spin = script === 'charged-spin-foot';
    game.setActionsFor(seat, {
      throttle: 0, steer: 0, crouch: charge, hop: false, hopHeld: false,
    });
    game.advance(72);
    game.setActionsFor(seat, { crouch: false, hop, hopHeld: hold });
    game.advance(1);
    game.setActionsFor(seat, { hop: false, hopHeld: hold });
    // Airborne by now: the press compresses for eleven steps first, and a
    // second press made on the ground is another hop rather than M24's spin.
    game.advance(20);
    game.setActionsFor(seat, { hop: spin, hopHeld: hold });
    game.advance(1);
    game.setActionsFor(seat, { hop: false, hopHeld: hold });
    game.advance(200);
    game.setActionsFor(seat, { throttle: 0, crouch: false, hop: false, hopHeld: false });
    game.advance(20);
  };

  // **Behind the lights.** Everybody leans on everything they have.
  for (const seat of seats) game.setActionsFor(seat, { crouch: true, hop: true, hopHeld: true });
  let guard = 0;
  while (game.snapshot().race.phase === 'countdown' && guard < 3000) {
    game.advance(1);
    guard += 1;
  }
  const countdown = seats.map((seat) => game.snapshot().race.riders[seat].tricks);
  const countdownHops = seats.map((seat) => game.snapshotFor(seat).euc.hops);
  for (const seat of seats) {
    game.setActionsFor(seat, { crouch: false, hop: false, hopHeld: false });
  }
  game.advance(30);

  for (const seat of seats) fly(seat, plan.tricks ? plan.scripts[seat] : 'nothing');
  const afterScripts = seats.map((seat) => game.snapshot().race.riders[seat].tricks);

  // The out lap: every gate, with no sector found, is a restart rather than a
  // lap — m27's shape, on this venue's three gates.
  for (const gate of gates) cross(gate, seats);
  // The flying lap: sectors in order.
  for (const gate of gates.slice(1)) cross(gate, seats);

  // Seat 0 takes the flag alone, and then keeps riding.
  cross(gates[0], [0]);
  fly(0, plan.tricks ? 'charged-spin-foot' : 'nothing');
  // ...and a seat that has *not* taken the flag flies the same script beside
  // it, so the refusal below is about the flag rather than about the phase.
  fly(1, plan.tricks ? 'charged-spin-foot' : 'nothing');
  const finishedSeat = game.snapshot().race.riders[0].tricks;
  const unfinishedSeat = game.snapshot().race.riders[1].tricks;

  cross(gates[0], seats.slice(1));
  // **The card is not instant, and it should not be.** `RACE.resultsDelaySeconds`
  // exists so a room that has just crossed a line at speed watches itself
  // finish rather than a dialog, so this waits the delay out rather than
  // asserting against it.
  let settle = 0;
  while (game.snapshot().app.state !== 'results' && settle < 900) {
    game.advance(1);
    settle += 1;
  }

  const race = game.snapshot().race;
  return {
    countdown,
    countdownHops,
    afterScripts,
    finishedSeat,
    unfinishedSeat,
    order: race.riders.map((rider, seat) => ({
      seat,
      position: rider.position,
      seconds: rider.finishSeconds ?? null,
      laps: rider.lap,
    })),
    state: game.snapshot().app.state,
    phase: race.phase,
  };
}

test('a two-seat race counts each rider its own, and the channel moves no position or time', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const run = await page.evaluate(runRace, {
    seats: 2,
    scripts: ['charged-spin-foot', 'charged'],
    tricks: true,
  } satisfies RacePlan);

  // Behind the lights the root substitutes neutral intent, so nothing anybody
  // leans on shows — and no hop was even minted, which is what makes the
  // all-zero tally a fact about the countdown rather than about the script.
  expect(run.countdown[0]).toEqual(ZERO);
  expect(run.countdown[1]).toEqual(ZERO);
  expect(run.countdownHops).toEqual([0, 0]);

  // One tally a rider, and they are not each other's.
  expect(run.afterScripts[0]).toEqual({
    cleanLandings: 1, chargedHops: 1, spinsLanded: 1, oneFootAirs: 1,
  });
  expect(run.afterScripts[1]).toEqual({
    cleanLandings: 1, chargedHops: 1, spinsLanded: 0, oneFootAirs: 0,
  });

  // A seat that has taken the flag earns nothing more, while the seat still
  // racing beside it goes on earning.
  expect(run.finishedSeat).toEqual(run.afterScripts[0]);
  expect(run.unfinishedSeat!.chargedHops).toBe(2);
  expect(run.unfinishedSeat!.spinsLanded).toBe(1);
  expect(run.unfinishedSeat!.oneFootAirs).toBe(1);

  expect(run.phase).toBe('ended');
  expect(run.state).toBe('results');

  // **The control: the identical race with nobody touching Hop.** Same page,
  // same build, same teleports on the same steps — so if the trick channel
  // moved a position, a race time, a lap count or the order, this is where it
  // would show.
  await bootToTitle(page, PARK);
  const control = await page.evaluate(runRace, {
    seats: 2,
    scripts: ['nothing', 'nothing'],
    tricks: false,
  } satisfies RacePlan);
  expect(control.order).toEqual(run.order);
  expect(control.afterScripts[0]).toEqual(ZERO);
  expect(errors).toEqual([]);
});

test('a four-seat race gives the card one Tricks line a rider, at every viewport', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);

  const run = await page.evaluate(runRace, {
    seats: 4,
    scripts: ['charged-spin-foot', 'charged', 'plain-foot', 'nothing'],
    tricks: true,
  } satisfies RacePlan);

  for (const tally of run.countdown) expect(tally).toEqual(ZERO);
  expect(run.afterScripts[0]).toEqual({
    cleanLandings: 1, chargedHops: 1, spinsLanded: 1, oneFootAirs: 1,
  });
  expect(run.afterScripts[1]).toEqual({
    cleanLandings: 1, chargedHops: 1, spinsLanded: 0, oneFootAirs: 0,
  });
  // An uncharged hop with the level held: the foot and the landing, no charge.
  expect(run.afterScripts[2]).toEqual({
    cleanLandings: 1, chargedHops: 0, spinsLanded: 0, oneFootAirs: 1,
  });
  expect(run.afterScripts[3]).toEqual(ZERO);
  expect(run.state).toBe('results');

  const card = await page.evaluate(readTricksRegion);
  expect(card.hidden).toBe(false);
  expect(card.groups).toHaveLength(4);
  for (const group of card.groups) {
    expect(group.rider).not.toBe('');
    expect(group.labels).toEqual(TRICK_LABELS);
    expect(group.counts).toHaveLength(4);
  }
  expect(card.rows).toBe(4);
  expect(card.panelText).not.toMatch(/score/i);

  for (const view of [
    { name: 'portrait', width: 375, height: 667 },
    { name: 'landscape', width: 740, height: 420 },
    { name: 'desktop', width: 1000, height: 700 },
  ]) {
    await page.setViewportSize({ width: view.width, height: view.height });
    const probe = await page.evaluate(overflowProbe);
    for (const box of probe) {
      expect(
        box.scrollWidth,
        `${view.name}: ${box.name} scrolls sideways (${box.scrollWidth} > ${box.clientWidth})`,
      ).toBeLessThanOrEqual(box.clientWidth + 1);
    }
    await saveShot(page, testInfo, `race-card-${view.name}`);
  }
  expect(errors).toEqual([]);
});
