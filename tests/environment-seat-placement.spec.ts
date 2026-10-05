/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { EUC, POPULATION, SIMULATION } from '../src/data/tuning.ts';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * The most a recovery may take, in fixed steps: the automatic clock, plus two
 * placement reservations of slack (another workstream's recovery timing must
 * not turn this into a flake), plus half a second.
 */
const RECOVERY_BOUND_STEPS = Math.ceil((EUC.crashRecoverAutoSeconds
  + 2 * POPULATION.placementReservationSeconds + 0.5) * SIMULATION.hz);

/**
 * Seat placement in a living world — MI-1, MI-2 and RP-7 (2026-10-03).
 *
 * The population's placement census used to count the other seats' bodies
 * and reservations, so a seat's constructor threw inside `installLevel`, the
 * accepted line-abreast couch slots went staggered, and every group
 * re-placement (rematch pack, race grid, chase grid) was refused and ignored.
 * Every expected layout below is the Sep 26 baseline build's, measured with
 * the same calls. NPC actors and CPU cops still refuse a seat; the seats
 * never refuse each other.
 */

type Spawn = { position: { x: number; y: number; z: number }; headingY: number };
/** The controller fields these checks read (private in the type, live on the bridge). */
type Rider = { x: number; z: number; speed: number; state: string; crashed: boolean; sampler: unknown };
type Internals = {
  levelId: string;
  terrain: unknown;
  levelPlan: { spawn: Spawn };
  seats: Array<{ controller: Rider }>;
  matchPlacement: { spawns: Spawn[] } | null;
  chaseOutlawSeats: number[];
  enterTrackDay(): void;
  resetSeats(): void;
  resetRiderTo(spawn: Spawn, seat: unknown): boolean;
  populationPhysicalPlacementClear(id: string, pose: { x: number; z: number }, ...rest: unknown[]): boolean;
};

test('a couch race at BelVar choosing Trick Run installs Switchback with both riders on the grid — MI-1', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  await page.evaluate(() => {
    const game = window.game;
    game.spawnRider(); game.startTrackDay(); game.advance(600);
    game.setAppState('paused');
    game.switchCouchRide('trickRun');
  });
  // The chooser's swap runs behind the loading cover on a later frame.
  await page.waitForFunction(() => {
    const game = window.game as unknown as Internals & { appState: { current: string } };
    return game.levelId === 'switchback' && game.appState.current === 'trickRun';
  }, undefined, { timeout: 90_000 });
  const result = await page.evaluate(() => {
    const game = window.game as unknown as Internals;
    return { seats: game.seats.map(seat => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2), seat.controller.state]),
      current: game.seats.every(seat => seat.controller.sampler === game.terrain) };
  });
  expect(result.seats).toEqual([[-42.8, -98.4, 'mounted'], [-42.8, -101.6, 'mounted']]);
  expect(result.current).toBe(true);
  expect(errors).toEqual([]);
});

test('a couch opened at Switchback right after boot seats four riders on their own slots — MI-1', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=switchback');
  // Inside human-0's 1.8 s placement reservation: the moment the constructor threw.
  await page.evaluate(() => window.game.setAppState('couchJoin'));
  await page.waitForFunction(() => window.game.appState.current === 'couchJoin' && window.game.seatCount >= 2,
    undefined, { timeout: 90_000 });
  const seats = await page.evaluate(() => {
    const game = window.game;
    while (game.seatCount < 4) game.spawnRider();
    return (game as unknown as Internals).seats.map(seat => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)]);
  });
  expect(seats).toEqual([[16, -100], [16, -101.6], [16, -98.4], [16, -103.2]]);
  expect(errors).toEqual([]);
});

test('a refused seat constructor never escapes a join or a world swap — MI-1 safety net', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=euc');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals & {
      populationPort(id: string, kind: string): { canPlace?: (request: { reason: string }) => boolean } | undefined;
    };
    // A dynamic world that refuses every constructor, as the census used to.
    const port = internal.populationPort.bind(internal);
    internal.populationPort = (id, kind) => {
      const world = port(id, kind);
      return world && { ...world, canPlace: request => request.reason !== 'construct' && (world.canPlace?.(request) ?? true) };
    };
    const thrown: string[] = [];
    try { game.spawnRider(); } catch (error) { thrown.push(String(error)); }
    try { game.startTrackDay(); } catch (error) { thrown.push(String(error)); }
    internal.populationPort = port;
    return { thrown, level: internal.levelId, seats: game.seatCount,
      current: internal.seats.every(seat => seat.controller.sampler === internal.terrain) };
  });
  expect(result.thrown).toEqual([]);
  expect(result.level).toBe('track');
  expect(result.seats).toBe(2);
  expect(result.current).toBe(true);
  expect(errors).toEqual([]);
});

test('the city seats a couch line abreast, the accepted 1.6 m slots — MI-1', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=euc');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    for (let k = 0; k < 3; k += 1) game.spawnRider();
    const spawned = internal.seats.map(seat => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)]);
    game.advance(120); internal.resetSeats();
    return { spawned, reset: internal.seats.map(seat => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)]) };
  });
  expect(result.spawned).toEqual([[0, 0], [-1.6, 0], [1.6, 0], [-3.2, 0]]);
  expect(result.reset).toEqual(result.spawned);
  expect(errors).toEqual([]);
});

test('a four-seat Knockabout rematch after riding stands every seat on the new pack — MI-2', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=euc');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    const miss = () => internal.seats.map((seat, index) => {
      const spot = internal.matchPlacement!.spawns[index].position;
      return +Math.hypot(seat.controller.x - spot.x, seat.controller.z - spot.z).toFixed(2);
    });
    const still = () => internal.seats.every(seat => seat.controller.state === 'mounted' && seat.controller.speed === 0);
    for (let k = 0; k < 3; k += 1) game.spawnRider();
    game.advance(200); game.startKnockabout();
    const first = miss();
    game.advance(240);
    for (let i = 0; i < 4; i += 1) game.setActionsFor(i, { throttle: 0.8, steer: [0.6, -0.6, 0.3, -0.3][i] });
    game.advance(240);
    for (let i = 0; i < 4; i += 1) game.setActionsFor(i, { throttle: -0.6, steer: 0 });
    game.advance(240); game.clearActions();
    const ridden = internal.seats.some(seat => seat.controller.speed !== 0);
    game.startKnockabout();
    const rematch = miss(), rematchStill = still();
    game.startKnockabout();
    return { first, ridden, rematch, rematchStill, standing: miss(), standingStill: still() };
  });
  expect(result.ridden, 'the fixture must leave riders moving before the rematch').toBe(true);
  expect(result.first).toEqual([0, 0, 0, 0]);
  expect(result.rematch).toEqual([0, 0, 0, 0]);
  expect(result.rematchStill).toBe(true);
  expect(result.standing).toEqual([0, 0, 0, 0]);
  expect(result.standingStill).toBe(true);
  expect(errors).toEqual([]);
});

test('BelVar race retries rotate four riders through the grid — MI-2', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  const grids = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    const grid = () => internal.seats.map(seat => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)]);
    for (let k = 1; k < 4; k += 1) game.spawnRider();
    game.startTrackDay();
    const out = [grid()];
    for (let race = 2; race <= 4; race += 1) {
      game.advance(240); game.setAppState('paused'); internal.enterTrackDay(); out.push(grid());
    }
    return out;
  });
  const A = [109.4, -29.2], B = [112.6, -29.2], C = [109.4, -32.4], D = [112.6, -32.4];
  expect(grids).toEqual([[A, B, C, D], [B, C, D, A], [C, D, A, B], [D, A, B, C]]);
  expect(errors).toEqual([]);
});

test('the first couch chase stands every outlaw on the race grid at the spawn — MI-2', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=euc');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    const grid = () => internal.seats.map(seat => [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)]);
    for (let k = 1; k < 3; k += 1) game.spawnRider();
    internal.resetSeats(); game.advance(240);
    game.startChase();
    const first = { outlaws: [...internal.chaseOutlawSeats], grid: grid() };
    game.advance(240); game.startChase();
    return { first, second: grid() };
  });
  expect(result.first.outlaws).toEqual([0, 1, 2]);
  expect(result.first.grid).toEqual([[-1.6, -3.2], [1.6, -3.2], [-1.6, -6.4]]);
  expect(result.second).toEqual([[1.6, -3.2], [-1.6, -6.4], [-1.6, -3.2]]);
  expect(errors).toEqual([]);
});

test('a seat whose grid slot is truly blocked takes the nearest free place, stopped and clear of the others — MI-2', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=track');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    for (let k = 1; k < 4; k += 1) game.spawnRider();
    game.startTrackDay(); game.advance(240);
    // Stand an "NPC" on the slot seat 2 rotates onto: the census refuses it.
    const blocked = { x: 112.6, z: -32.4 };
    const census = internal.populationPhysicalPlacementClear.bind(internal);
    let refusals = 0;
    internal.populationPhysicalPlacementClear = (id, pose, ...rest) => {
      if (id.startsWith('human-') && Math.hypot(pose.x - blocked.x, pose.z - blocked.z) < 0.5) { refusals += 1; return false; }
      return census(id, pose, ...rest);
    };
    game.setAppState('paused'); internal.enterTrackDay();
    internal.populationPhysicalPlacementClear = census;
    const seats = internal.seats.map(seat => ({ at: [+seat.controller.x.toFixed(2), +seat.controller.z.toFixed(2)],
      state: seat.controller.state, speed: seat.controller.speed }));
    let apart = Infinity;
    for (let i = 0; i < seats.length; i += 1) for (let j = i + 1; j < seats.length; j += 1) {
      apart = Math.min(apart, Math.hypot(seats[i].at[0] - seats[j].at[0], seats[i].at[1] - seats[j].at[1]));
    }
    return { refusals, seats, apart, offBlocked: Math.hypot(seats[2].at[0] - blocked.x, seats[2].at[1] - blocked.z) };
  });
  expect(result.refusals).toBeGreaterThan(0);
  expect(result.seats.map(seat => seat.at).filter((_, index) => index !== 2)).toEqual([[112.6, -29.2], [109.4, -32.4], [109.4, -29.2]]);
  expect(result.offBlocked).toBeGreaterThanOrEqual(1.5);
  expect(result.apart).toBeGreaterThanOrEqual(1.6 - 1e-6);
  for (const seat of result.seats) { expect(seat.state).toBe('mounted'); expect(seat.speed).toBe(0); }
  expect(errors).toEqual([]);
});

test('two seats who crash on top of each other both get back up — RP-7', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=euc');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    game.setAppState('freeRide'); game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    internal.resetSeats();
    // Seat 1 a slot behind on the right: the same scripted ride then lays both
    // crashes within a metre of each other's safe points.
    const spawn = internal.levelPlan.spawn;
    internal.resetRiderTo({ position: { x: spawn.position.x - 1.6, y: spawn.position.y, z: spawn.position.z - 3.2 }, headingY: spawn.headingY }, internal.seats[1]);
    const down = () => internal.seats.map(seat => seat.controller.crashed);
    let together = -1, apart = Infinity; const up = [-1, -1];
    for (let step = 0; step < 3000; step += 1) {
      const actions = together >= 0 ? { throttle: 0, steer: 0 } : { throttle: 0.9, steer: step > 180 ? Math.sin(step / 40) * 0.6 : 0 };
      for (let i = 0; i < 2; i += 1) game.setActionsFor(i, actions);
      game.advance(1);
      const crashed = down();
      if (together < 0 && crashed.every(Boolean)) {
        together = step;
        apart = Math.hypot(internal.seats[0].controller.x - internal.seats[1].controller.x, internal.seats[0].controller.z - internal.seats[1].controller.z);
      }
      if (together >= 0) for (let i = 0; i < 2; i += 1) if (up[i] < 0 && !crashed[i]) up[i] = step - together;
      if (together >= 0 && (up.every(value => value >= 0) || step - together > 1500)) break;
    }
    return { together, apart, up };
  });
  expect(result.together, 'the scripted ride must put both seats down at once').toBeGreaterThanOrEqual(0);
  expect(result.apart, 'and on top of each other').toBeLessThan(1.5);
  for (const steps of result.up) {
    expect(steps).toBeGreaterThanOrEqual(0);
    expect(steps).toBeLessThanOrEqual(RECOVERY_BOUND_STEPS);
  }
  expect(errors).toEqual([]);
});

test('a seat knocked down 1.6 m abreast of a standing seat gets up while the other stays put — RP-7 review', async ({ page }) => {
  // 2026-10-03 review (knockedBeside): the restored abreast slots sit inside a
  // mounted body's recovery clearance, and the census held the fallen rider
  // down until the other one rode away. Seats never veto seats, recovery too.
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=generated&seed=euc');
  const result = await page.evaluate(() => {
    const game = window.game, internal = game as unknown as Internals;
    game.setAppState('freeRide'); game.loop.setRunning(false);
    while (game.seatCount < 2) game.spawnRider();
    internal.resetSeats(); game.advance(240);
    const spawn = internal.levelPlan.spawn, lx = Math.cos(spawn.headingY), lz = -Math.sin(spawn.headingY);
    // Stood there past the census, so this checks the recovery alone (a build
    // whose seats still veto seats would refuse the second placement).
    const census = internal.populationPhysicalPlacementClear;
    internal.populationPhysicalPlacementClear = () => true;
    const placed = [
      internal.resetRiderTo({ position: { ...spawn.position }, headingY: spawn.headingY }, internal.seats[0]),
      internal.resetRiderTo({ position: { x: spawn.position.x - lx * 1.6, y: spawn.position.y, z: spawn.position.z - lz * 1.6 },
        headingY: spawn.headingY }, internal.seats[1]),
    ];
    internal.populationPhysicalPlacementClear = census;
    game.advance(240);
    const knocked = (internal.seats[1].controller as unknown as { hardKnock(x: number, z: number): boolean }).hardKnock(-lx, -lz);
    const still = { x: internal.seats[0].controller.x, z: internal.seats[0].controller.z };
    let up = -1;
    for (let step = 0; step < 1500 && up < 0; step += 1) {
      for (let i = 0; i < 2; i += 1) game.setActionsFor(i, { throttle: 0, steer: 0 });
      game.advance(1);
      if (step > 10 && !internal.seats[1].controller.crashed) up = step;
    }
    const partner = internal.seats[0].controller;
    return { placed, knocked, up, partnerMoved: Math.hypot(partner.x - still.x, partner.z - still.z), partnerState: partner.state };
  });
  expect(result.placed).toEqual([true, true]);
  expect(result.knocked).toBe(true);
  expect(result.partnerState, 'the standing seat never rode away').toBe('mounted');
  expect(result.partnerMoved).toBeLessThan(0.5);
  expect(result.up, 'the fallen seat must get up beside a standing seat').toBeGreaterThanOrEqual(0);
  expect(result.up).toBeLessThanOrEqual(RECOVERY_BOUND_STEPS);
  expect(errors).toEqual([]);
});
