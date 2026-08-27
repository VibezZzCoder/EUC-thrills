/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { boot, bootToTitle, collectErrors } from './harness.ts';
import { CHARACTER_IDS } from '../src/data/riders.ts';
import { SLOT_LATERAL_METRES, SLOT_MIN_SEPARATION_METRES } from '../src/simulation/spawnSlots.ts';
import { RENDER_BUDGET, RENDER_BUDGET_SPLIT, SPLIT_PASSES } from '../src/data/renderCost.ts';

/**
 * M25 — couch multiplayer, in a real browser.
 *
 * **Phase 2's gate is §21.12's, verbatim: two independently controlled riders
 * in one simulation, on one screen, no netcode, no game mode.** It is an
 * architecture proof rather than a feature, and three of its four claims can
 * only be made here:
 *
 *   1. **That two riders really are two riders.** Headlessly a seat is a
 *      controller and a struct; here it is a rig in a scene graph, stepped by
 *      one loop and drawn by one frame, and the two could silently be the same
 *      rider twice — which is exactly what `setActionsFor(1, …)` did before
 *      this phase taught it to address a seat.
 *   2. **That the world stays one world.** Two riders on one terrain, one
 *      particle pool, one camera, one HUD, one mix — and none of the singular
 *      things may follow the wrong rider. Every one of those is a runtime fact
 *      with a real `WebGLRenderer` behind it.
 *   3. **That a rider costs nothing once they leave.** Invariant 10's plateau,
 *      on the newest disposable thing in the game. The scene-graph half of
 *      this claim is `src/render/riderLifecycle.test.ts`; the GPU counters are
 *      here, and neither substitutes for the other.
 *
 * The fourth is the owner's and cannot be automated: he watches two riders
 * ride apart in one view.
 *
 * Seat 1 is reachable **only** from the QA bridge in this phase — no URL
 * parameter, no menu — which is what keeps the phone contract untouched while
 * a second full rig exists at all. `tests/touch.spec.ts` holds the mobile end
 * of that claim.
 *
 * Nothing here reads a frame interval (`AGENTS.md`).
 */

/** How far apart two rides have to end up before "apart" means anything. */
const APART_METRES = 5;

/**
 * A pair of scripted rides that cannot end in the same place.
 *
 * Straight ahead against a hard right turn: the two diverge in heading on the
 * first step and in position on the second, so a spec that fails to address
 * the seats separately fails immediately rather than after a lucky drift.
 */
const RIDE = [
  { seat: 0, actions: { throttle: 1, steer: 0 } },
  { seat: 1, actions: { throttle: 1, steer: -1 } },
] as const;

/** Boot free ride, freeze the loop, and seat a second rider. */
async function bootTwoRiders(page: import('@playwright/test').Page): Promise<void> {
  await boot(page);
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.spawnSecondRider();
  });
}

/** Drive both seats for `steps` and report where each of them ended up. */
async function rideApart(page: import('@playwright/test').Page, steps: number): Promise<{
  first: { x: number; z: number; heading: number; distance: number };
  second: { x: number; z: number; heading: number; distance: number };
}> {
  return page.evaluate(({ ride, count }) => {
    const game = window.game;
    for (const leg of ride) game.setActionsFor(leg.seat, leg.actions);
    game.advance(count);
    const read = (seat: number) => {
      const euc = game.snapshotFor(seat).euc;
      return {
        x: euc.position.x,
        z: euc.position.z,
        heading: euc.headingY,
        distance: euc.distanceTravelled,
      };
    };
    return { first: read(0), second: read(1) };
  }, { ride: RIDE.map((leg) => ({ seat: leg.seat, actions: { ...leg.actions } })), count: steps });
}

// ---------------------------------------------------------------------------
// The gate: two independently controlled riders in one simulation
// ---------------------------------------------------------------------------

test('a second rider is seated beside the first, in the same world', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  // Before: one seat, and asking for a second says so rather than answering
  // with the player's own numbers.
  expect(await page.evaluate(() => window.game.seatCount)).toBe(1);
  expect(await page.evaluate(() => {
    try {
      window.game.snapshotFor(1);
      return 'answered';
    } catch (error) {
      return (error as Error).message;
    }
  })).toBe('no such seat: 1 (seats: 1)');

  const seated = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const index = game.spawnSecondRider();
    game.advance(2);
    const first = game.snapshotFor(0).euc;
    const second = game.snapshotFor(1).euc;
    return {
      index,
      seats: game.seatCount,
      firstAt: { x: first.position.x, y: first.position.y, z: first.position.z },
      secondAt: { x: second.position.x, y: second.position.y, z: second.position.z },
      firstHeading: first.headingY,
      secondHeading: second.headingY,
      levelPlanId: game.snapshot().levelPlanId,
    };
  });

  expect(seated.index).toBe(1);
  expect(seated.seats).toBe(2);

  // Beside, not on top of — the validated slot, arriving through the real
  // placement path rather than through the helper's own unit test.
  const gap = Math.hypot(
    seated.secondAt.x - seated.firstAt.x,
    seated.secondAt.z - seated.firstAt.z,
  );
  expect(gap).toBeGreaterThanOrEqual(SLOT_MIN_SEPARATION_METRES);
  // On the same ground, facing the same way: one world, one direction to set
  // off in. The heights come from the terrain sampler both controllers share.
  expect(Math.abs(seated.secondAt.y - seated.firstAt.y)).toBeLessThan(0.05);
  expect(seated.secondHeading).toBeCloseTo(seated.firstHeading, 9);
  expect(errors).toEqual([]);
});

test('the two seats ride apart, and each one is steered by its own address', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const ridden = await rideApart(page, 240);

  // Both rode. A seat that never moved would make every "apart" assertion
  // below pass for the wrong reason.
  expect(ridden.first.distance).toBeGreaterThan(APART_METRES);
  expect(ridden.second.distance).toBeGreaterThan(APART_METRES);

  // Seat 0 was told to go straight and seat 1 to turn hard: the headings must
  // disagree, and by more than a wobble.
  expect(Math.abs(ridden.first.heading - ridden.second.heading)).toBeGreaterThan(0.5);

  const apart = Math.hypot(
    ridden.first.x - ridden.second.x,
    ridden.first.z - ridden.second.z,
  );
  expect(apart).toBeGreaterThan(APART_METRES);
  expect(errors).toEqual([]);
});

test('two riders reach the same two places every run, byte for byte', async ({ page }) => {
  // `advance(n)` is the whole basis of every assertion in this suite, and a
  // second rider is the first thing in the game that could make the fixed step
  // order-dependent. Twice through the same script, from the same boot, must
  // land both riders on identical numbers — not merely close ones.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const first = await rideApart(page, 180);
  await page.evaluate(() => {
    const game = window.game;
    game.clearActions();
    game.despawnSecondRider();
    game.spawnSecondRider();
    // Seat 0 back to the spawn too, so the second run starts where the first
    // did. Its own reset, which is what makes this a repeat rather than a
    // continuation.
    window.qa.resetRide();
    game.loop.setRunning(false);
  });
  const second = await rideApart(page, 180);

  expect(second).toEqual(first);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The world stays one world, and the singular things follow one rider
// ---------------------------------------------------------------------------

test('the second rider’s landings do not dip the first rider’s camera', async ({ page }) => {
  // There is one chase camera until Phase 3, and `chase.landingImpulse` fires
  // from inside the per-seat step. An ungated second rider would shove the
  // player's view down every time they came off a hop — the plainest way for
  // two riders to stop being independent.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const trace = await page.evaluate(() => {
    const game = window.game;
    // Seat 0 stands still; seat 1 hops repeatedly. Any dip seat 0's camera
    // shows is seat 1's landing reaching across.
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    game.advance(30);
    const before = game.snapshot().camera.dip;

    let worst = 0;
    let landings = 0;
    for (let round = 0; round < 12; round += 1) {
      game.setActionsFor(1, { throttle: 0.4, hop: true });
      game.advance(40);
      worst = Math.max(worst, Math.abs(game.snapshot().camera.dip - before));
      landings = game.snapshotFor(1).euc.landings;
    }
    return { before, worst, landings, seatZeroSpeed: game.snapshotFor(0).euc.speed };
  });

  // Seat 1 really did land, or the assertion below proves nothing.
  expect(trace.landings).toBeGreaterThan(0);
  expect(Math.abs(trace.seatZeroSpeed)).toBeLessThan(0.5);
  expect(trace.worst).toBe(0);
  expect(errors).toEqual([]);
});

test('the second rider’s hops do not retire the first rider’s first-ride prompt', async ({ page }) => {
  // One `hoppedSinceHudUpdate` flag feeds one HUD and one `Onboarding`, and a
  // prompt retired by somebody else's hop is persisted into the player's saved
  // options — a first-timer taught nothing and told they had been.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  // **The prompt has to actually be on screen before "not retired" means
  // anything.** `Onboarding` walks `ride`, `brake`, `hop` in order and never
  // looks at a later one until the earlier ones are satisfied, so a first pass
  // at this test — seat 0 held at neutral throughout — could not reach the hop
  // prompt at all, and stayed green with the guard deleted. Seat 0 therefore
  // demonstrates riding and braking first, the way a real first-timer does.
  const seen = await page.evaluate(() => {
    const game = window.game;
    const prompts = () => [...game.snapshot().options.seenPrompts];

    // Ride: throttle and a carve, held past the seconds the prompt asks for.
    game.setActionsFor(0, { throttle: 1, steer: 1 });
    game.advance(240);
    // Brake: reverse throttle while genuinely moving. **In small advances**,
    // because the prompt machine is fed once per drawn frame with everything
    // that has happened since the last one — so one `advance(120)` is a single
    // sample of "was the wheel braking, and was it moving" taken at the *end*
    // of the second, by which time the wheel has stopped and the sample says
    // no. Several short ones are what a rider actually looks like.
    game.setActionsFor(0, { throttle: -1, steer: 0 });
    for (let chunk = 0; chunk < 8; chunk += 1) game.advance(15);
    // Breathe, so the machine finishes the second prompt and shows the third.
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    game.advance(360);

    const armed = { prompt: game.snapshot().hud.prompt, seen: prompts() };

    // Now the second rider hops, over and over, while the player does nothing.
    let hops = 0;
    for (let round = 0; round < 12; round += 1) {
      game.setActionsFor(1, { throttle: 0.4, hop: true });
      game.advance(40);
      hops = game.snapshotFor(1).euc.hops;
    }
    return { armed, hops, after: { prompt: game.snapshot().hud.prompt, seen: prompts() } };
  });

  // The prompt this test is about is the one on screen — otherwise the
  // assertions below are about a prompt nobody could have retired.
  expect(seen.armed.prompt).toBe('hop');
  expect(seen.armed.seen).toEqual(expect.arrayContaining(['ride', 'brake']));
  expect(seen.armed.seen).not.toContain('hop');

  // Seat 1 really hopped, or the guard was never tested.
  expect(seen.hops).toBeGreaterThan(0);

  // And the player is still being asked to hop, because they still have not.
  expect(seen.after.prompt).toBe('hop');
  expect(seen.after.seen).not.toContain('hop');
  expect(errors).toEqual([]);
});

test('either rider can respawn without moving the other', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  // **A control run and a treatment run, rather than a before and an after.**
  // A coasting rider keeps moving, so "seat 0 did not move" is not the claim —
  // "seat 0's ride was not *changed*" is, and the only honest way to say that
  // is to ride it twice and compare. The byte-identical repeat the test above
  // establishes is what makes the comparison exact.
  const runs = await page.evaluate(() => {
    const game = window.game;
    const ride = (pressReset: boolean) => {
      game.clearActions();
      if (game.seatCount > 1) game.despawnSecondRider();
      window.qa.resetRide();
      game.loop.setRunning(false);
      game.spawnSecondRider();

      game.setActionsFor(0, { throttle: 1 });
      game.setActionsFor(1, { throttle: 1 });
      game.advance(180);
      // Seat 1's `R`, and nobody else's — or, in the control run, nobody's.
      game.setActionsFor(0, { throttle: 0 });
      game.setActionsFor(1, pressReset ? { throttle: 0, reset: true } : { throttle: 0 });
      game.advance(2);
      return {
        first: { ...game.snapshotFor(0).euc.position },
        second: { ...game.snapshotFor(1).euc.position },
      };
    };
    return { control: ride(false), treated: ride(true) };
  });

  // The rider who pressed it went home.
  const moved = Math.hypot(
    runs.treated.second.x - runs.control.second.x,
    runs.treated.second.z - runs.control.second.z,
  );
  expect(moved).toBeGreaterThan(APART_METRES);
  // The rider who did not rode exactly the ride they would have ridden anyway.
  expect(runs.treated.first).toEqual(runs.control.first);
  expect(errors).toEqual([]);
});

test('a fresh world stands both riders in it, each at their own slot', async ({ page }) => {
  // **Through `New route` on the pause card, because only `installLevel` can
  // fail this.** A first pass at this test swapped worlds with
  // `renderer.setLevel`, which rebuilds the terrain and touches no seat, no
  // controller and no slot — so the separation it measured was just the
  // distance the two riders had already ridden apart, and stacking every seat
  // on `plan.spawn` would have left it green.
  //
  // **The route it takes changed at Phase 5**, and the reason is a real rule
  // rather than a convenience: arriving at the title now *ends* a couch
  // session, because that is what Quit means, so a spec that swapped worlds by
  // way of the title would be asserting that a torn-down session survives.
  // `New route` from the pause card is the path a couch player actually has
  // (§25.5 Phase 5) and it goes through the same `installLevel`.
  const errors = collectErrors(page);
  await bootTwoRiders(page);
  const before = await page.evaluate(() => window.game.snapshot().levelPlanId);

  // Ride them apart first, so "back at their slots" is a real move rather than
  // a pair who never left.
  await page.evaluate(() => {
    const game = window.game;
    game.setActionsFor(0, { throttle: 1 });
    game.setActionsFor(1, { throttle: 1, steer: -0.6 });
    game.advance(180);
    game.clearActions();
    game.loop.setRunning(true);
    game.setAppState('paused');
  });

  await page.locator('.euc-menu--pause [data-menu="new-route"]').click();
  // The build is deferred a frame so "Building…" can paint. Wait on the state,
  // never on a duration.
  await expect
    .poll(async () => page.evaluate(() => window.game.snapshot().route.pending))
    .toBe(false);

  const swapped = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.advance(2);
    return {
      seats: game.seatCount,
      levelPlanId: game.snapshot().levelPlanId,
      spawn: { ...game.levelPlan.spawn.position },
      first: { ...game.snapshotFor(0).euc.position },
      second: { ...game.snapshotFor(1).euc.position },
    };
  });

  // A different world really did install, or nothing below is about a swap.
  expect(swapped.levelPlanId).not.toBe(before);
  // The couch survives it — a world swap must not dissolve a seat.
  expect(swapped.seats).toBe(2);

  const from = (at: { x: number; z: number }) => Math.hypot(
    at.x - swapped.spawn.x,
    at.z - swapped.spawn.z,
  );
  // Seat 0 is at the new world's spawn, exactly as a single player would be.
  expect(from(swapped.first)).toBeLessThan(0.001);
  // And seat 1 is at *its own* slot beside it — this is the assertion that
  // fails if `installLevel` rebuilds every controller at `plan.spawn`.
  expect(from(swapped.second)).toBeCloseTo(SLOT_LATERAL_METRES, 6);
  expect(from(swapped.second)).toBeGreaterThanOrEqual(SLOT_MIN_SEPARATION_METRES);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Invariant 10, on the newest disposable thing in the game
// ---------------------------------------------------------------------------

test('seating and dismissing a second rider three times plateaus GPU objects', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page);

  const trace = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    // Warm up first: the first real frame compiles shaders and uploads the
    // world it booted with, and counting that as growth reports a one-off cost
    // as a leak.
    game.advance(60);
    const baseline = game.resources();

    const seated: ReturnType<typeof game.resources>[] = [];
    const emptied: ReturnType<typeof game.resources>[] = [];
    for (let round = 0; round < 3; round += 1) {
      game.spawnSecondRider();
      // A step and a draw, so the rider is uploaded rather than merely built:
      // an unrendered geometry never reaches `info.memory`.
      game.advance(2);
      seated.push(game.resources());
      game.despawnSecondRider();
      game.advance(2);
      emptied.push(game.resources());
    }
    return { baseline, seated, emptied, seats: game.seatCount };
  });

  // A rider really was seated, or every comparison below plateaus at zero.
  expect(trace.seated[0].sceneObjects).toBeGreaterThan(trace.baseline.sceneObjects);
  expect(trace.seated[0].geometries).toBeGreaterThan(trace.baseline.geometries);

  for (let round = 1; round < trace.seated.length; round += 1) {
    expect(trace.seated[round], `seating ${round + 1} cost more than seating 1`)
      .toEqual(trace.seated[0]);
  }
  for (const [round, sample] of trace.emptied.entries()) {
    expect(sample, `the scene did not empty after round ${round + 1}`).toEqual(trace.baseline);
  }
  expect(trace.seats).toBe(1);
  expect(errors).toEqual([]);
});

test('a dismissed rider stops being addressable', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const gone = await page.evaluate(() => {
    const game = window.game;
    game.despawnSecondRider();
    game.advance(2);
    const ask = (run: () => unknown): string => {
      try {
        run();
        return 'answered';
      } catch (error) {
        return (error as Error).message;
      }
    };
    return {
      seats: game.seatCount,
      snapshot: ask(() => game.snapshotFor(1)),
      actions: ask(() => game.setActionsFor(1, { throttle: 1 })),
      despawn: ask(() => game.despawnSecondRider()),
    };
  });

  expect(gone.seats).toBe(1);
  expect(gone.snapshot).toBe('no such seat: 1 (seats: 1)');
  expect(gone.actions).toBe('no such seat: 1 (seats: 1)');
  expect(gone.despawn).toBe('there is no second rider to despawn');
  expect(errors).toEqual([]);
});

test('the two riders wear different characters, and the player’s own is untouched', async ({ page }) => {
  // q68: distinct characters are required, and seat 1's pick is session state
  // that must never reach `GameOptions` — the options firewall, and the reason
  // `installCharacter` is deliberately not a loop over seats.
  const errors = collectErrors(page);
  await boot(page);

  const worn = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const chosenBefore = game.snapshot().rider.chosen;
    game.spawnSecondRider();
    game.advance(2);
    const first = game.snapshotFor(0).rider;
    const second = game.snapshotFor(1).rider;
    return {
      chosenBefore,
      chosenAfter: game.snapshot().rider.chosen,
      first: { installed: first.installed, voice: first.crashVoice },
      second: { installed: second.installed, voice: second.crashVoice },
    };
  });

  // The player's saved pick is untouched by somebody else sitting down.
  expect(worn.chosenAfter).toBe(worn.chosenBefore);
  expect(worn.first.installed).toBe(worn.chosenBefore);
  // And the second rider is somebody else — the whole of q68, asserted where
  // it can actually fail. `snapshotFor(1).rider` reports seat 1's own rider
  // rather than the player's, which is what makes this assertion possible at
  // all: before Phase 2 it would have compared the player with the player.
  expect(worn.second.installed).not.toBe(worn.first.installed);
  // Distinct riders means distinct voices, which is what q66's per-seat crash
  // sound will need at Phase 5 — and is why the voice is read off the seat.
  expect(worn.second.voice).not.toBe(worn.first.voice);
  expect(errors).toEqual([]);
});

test('a named character is the character the second rider actually wears', async ({ page }) => {
  // The default is derived (`characterBeside`), so the explicit argument is
  // the only way to prove the id reaches the rig rather than being resolved
  // and dropped — which is precisely what the seat's own `character` field
  // was added to make visible.
  const errors = collectErrors(page);
  await boot(page);

  // Derived from the roster rather than spelled here, so a sixth character
  // does not leave this test naming a rider who is no longer last.
  const wanted = CHARACTER_IDS[CHARACTER_IDS.length - 1];

  const named = await page.evaluate((character) => {
    const game = window.game;
    game.loop.setRunning(false);
    const chosen = game.snapshot().rider.chosen;
    game.spawnSecondRider(character);
    game.advance(2);
    return {
      chosen,
      first: game.snapshotFor(0).rider.installed,
      second: game.snapshotFor(1).rider.installed,
    };
  }, wanted);

  expect(named.second).toBe(wanted);
  // And the player is still the player: naming seat 1 must not re-dress them.
  expect(named.first).toBe(named.chosen);
  expect(errors).toEqual([]);
});

test('asking for the player’s own character seats somebody else', async ({ page }) => {
  // The bypass a Codex QA pass found in the first build: q68 was held at the
  // default and at the chooser, and skipped by the one call that names seat 1
  // outright. A rule with a door in it is not a rule — and this is the door
  // Phase 5's join panel walks through, where "the character the player is
  // wearing" is exactly what an unattended second gamepad lands on first.
  //
  // The resolution is the same one `installCharacter` makes from the other
  // side: **seat 0 is the seat that never moves.** There the arriving choice
  // wins because it is the player's own; here it loses because the player is
  // already sitting in it. Both sentences are the same rule.
  const errors = collectErrors(page);
  await boot(page);

  const collided = await page.evaluate((roster) => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().rider;
    // Resolved through the roster rather than cast, which is also the thing
    // worth saying: this is a character a *player* can pick, so it is a
    // request the join panel can really make.
    const wanted = roster.find((id) => id === before.chosen);
    if (wanted === undefined) throw new Error('the player is not on the roster');
    game.spawnSecondRider(wanted);
    game.advance(2);
    const first = game.snapshotFor(0).rider;
    const second = game.snapshotFor(1).rider;
    return {
      wanted,
      before: {
        chosen: before.chosen,
        installed: before.installed,
        voice: before.crashVoice,
      },
      first: {
        chosen: game.snapshot().rider.chosen,
        installed: first.installed,
        voice: first.crashVoice,
      },
      second: { installed: second.installed, voice: second.crashVoice },
      seats: game.seatCount,
    };
  }, CHARACTER_IDS);

  // The player is untouched, in the scene and in the options record: nobody
  // else sitting down may re-dress them or rewrite what they saved.
  expect(collided.first.installed).toBe(collided.before.installed);
  expect(collided.first.voice).toBe(collided.before.voice);
  expect(collided.first.chosen).toBe(collided.before.chosen);
  // And the rider who asked for the player's character is somebody else.
  expect(collided.second.installed).not.toBe(collided.wanted);
  expect(collided.second.installed).not.toBe(collided.first.installed);
  expect(collided.second.voice).not.toBe(collided.first.voice);
  // Refused, not rejected: the second player is seated all the same. A join
  // that threw here would read as a broken button on the couch.
  expect(collided.seats).toBe(2);
  expect(errors).toEqual([]);
});

test('the player choosing the other rider’s character moves the other rider', async ({ page }) => {
  // q68 is a rule about what is on screen, and the rider chooser is reachable
  // from the title while a world is live — so a player can pick the very rider
  // sitting beside them. Their choice wins; the seat that was wearing it moves.
  // Without this, two identical riders share one screen with no way back short
  // of dismissing the second player.
  const errors = collectErrors(page);
  await boot(page);

  const swapped = await page.evaluate((roster) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.spawnSecondRider();
    game.advance(2);
    // Resolved through the roster rather than cast, which also says the thing
    // worth saying: the second rider wears a character a *player* can choose.
    const taken = roster.find((id) => id === game.snapshotFor(1).rider.installed);
    if (taken === undefined) throw new Error('the second rider is not on the roster');
    // The player picks the character the second rider is already wearing.
    game.setOptions({ character: taken });
    game.advance(2);
    return {
      taken,
      first: game.snapshotFor(0).rider.installed,
      second: game.snapshotFor(1).rider.installed,
      chosen: game.snapshot().rider.chosen,
      seats: game.seatCount,
    };
  }, CHARACTER_IDS);

  // The player got what they asked for, and it is what the options record says.
  expect(swapped.first).toBe(swapped.taken);
  expect(swapped.chosen).toBe(swapped.taken);
  // And the two riders are still two riders.
  expect(swapped.second).not.toBe(swapped.first);
  expect(swapped.seats).toBe(2);
  expect(errors).toEqual([]);
});

test('no query parameter seats a second rider', async ({ page }) => {
  // The bridge is the only door in this phase. A URL that opened one would be
  // a path a phone player could take, which is the claim the phone contract
  // rests on (§25.5 Phase 2).
  const errors = collectErrors(page);
  await boot(page, 'seats=2&couch=1&players=2&secondrider=1');
  expect(await page.evaluate(() => window.game.seatCount)).toBe(1);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 3 — the split screen
// ---------------------------------------------------------------------------

/**
 * Sample a strip of the drawing buffer.
 *
 * Read back inside the same task as the render, because the context is not
 * `preserveDrawingBuffer` — the buffer is valid until the browser composites,
 * which is the end of the task. `advance()` renders synchronously, so a read
 * in the same `page.evaluate` sees the frame it just drew.
 *
 * WebGL's origin is bottom-left; the fractions below are therefore measured up
 * from the bottom, which is why they read as upside down against a screenshot.
 */
const STRIP_SOURCE = `(gl, x0, x1, h) => {
  const out = [];
  for (let i = 0; i < 8; i += 1) {
    const x = Math.floor(x0 + (x1 - x0) * (i + 0.5) / 8);
    for (const fy of [0.25, 0.55, 0.8]) {
      const px = new Uint8Array(4);
      gl.readPixels(x, Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.push(px[0] + ',' + px[1] + ',' + px[2]);
    }
  }
  return out;
}`;

test('the screen splits, and each half draws its own rider', async ({ page }) => {
  // The phase's gate, first half: **both halves draw**. Asserted off the
  // drawing buffer rather than off the view count, because a second camera
  // that was configured and never rendered would satisfy every counter in the
  // program and leave one half of the screen black.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const frame = await page.evaluate((stripSource) => {
    const game = window.game;
    const strip = eval(stripSource) as (
      gl: WebGLRenderingContext, x0: number, x1: number, h: number,
    ) => string[];
    for (const leg of [
      { seat: 0, actions: { throttle: 1, steer: 0 } },
      { seat: 1, actions: { throttle: 1, steer: -1 } },
    ]) game.setActionsFor(leg.seat, leg.actions);
    game.advance(300);
    const gl = game.renderer.renderer.getContext();
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const left = strip(gl, 0, width / 2, height);
    const right = strip(gl, width / 2, width, height);
    return {
      views: game.renderer.viewCount,
      left,
      right,
      leftDistinct: new Set(left).size,
      rightDistinct: new Set(right).size,
      cameras: [0, 1].map((view) => {
        const camera = game.renderer.cameraFor(view);
        return {
          x: camera.position.x,
          z: camera.position.z,
          aspect: camera.aspect,
        };
      }),
      canvasAspect: gl.drawingBufferWidth / gl.drawingBufferHeight,
    };
  }, STRIP_SOURCE);

  expect(frame.views).toBe(2);
  // Neither half is the clear colour: a rendered world has many colours in it,
  // and an undrawn half would report one.
  expect(frame.leftDistinct).toBeGreaterThan(3);
  expect(frame.rightDistinct).toBeGreaterThan(3);
  // And they are not the same picture, which is what "each half draws its own
  // rider" means once the two rides have diverged.
  expect(frame.left.join('|')).not.toBe(frame.right.join('|'));

  // Each camera is somewhere else, following its own rider.
  const [first, second] = frame.cameras;
  expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThan(APART_METRES);
  // **Each camera has the aspect of its own half, not of the canvas.** A
  // camera left on the full-canvas aspect while drawing into half of it
  // stretches the world horizontally — a defect that reads as the rider being
  // fatter rather than as the frame being wrong.
  expect(first.aspect).toBeCloseTo(frame.canvasAspect / 2, 3);
  expect(second.aspect).toBeCloseTo(first.aspect, 6);
  expect(errors).toEqual([]);
});

test('the two halves’ HUDs disagree wherever the rides do', async ({ page }) => {
  // The phase's gate, second half. Read off the **DOM**, not off the model:
  // two `HudModel`s that both computed the right answer into one shared set of
  // nodes would pass every model-level assertion and put one number on screen.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const huds = await page.evaluate(() => {
    const game = window.game;
    game.setActionsFor(0, { throttle: 1, steer: 0 });
    game.setActionsFor(1, { throttle: 0.25, steer: -1 });
    game.advance(300);
    const roots = Array.from(document.querySelectorAll<HTMLElement>('.euc-hud'));
    return {
      count: roots.length,
      sides: roots.map((root) => root.dataset.split),
      speeds: roots.map((root) => (
        root.querySelector<HTMLElement>('[data-hud="speed"]')?.textContent ?? ''
      )),
      snapshots: [0, 1].map((seat) => game.snapshotFor(seat).hud.speed),
      kmh: [0, 1].map((seat) => Math.round(game.snapshotFor(seat).euc.speed * 3.6)),
    };
  });

  expect(huds.count).toBe(2);
  expect(huds.sides).toEqual(['left', 'right']);
  // The two riders really did end up at different speeds…
  expect(huds.kmh[0]).not.toBe(huds.kmh[1]);
  // …each seat's snapshot says so…
  expect(huds.snapshots[0]).not.toBe(huds.snapshots[1]);
  // …and so does the text actually on screen, in each half.
  expect(huds.speeds[0]).toBe(huds.snapshots[0]);
  expect(huds.speeds[1]).toBe(huds.snapshots[1]);
  expect(huds.speeds[0]).not.toBe(huds.speeds[1]);
  expect(errors).toEqual([]);
});

test('each half’s HUD stays in its own half, and neither eats a click', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const layout = await page.evaluate(() => {
    const game = window.game;
    game.advance(4);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.euc-hud')).map((root) => {
      const rect = root.getBoundingClientRect();
      return { x: rect.x, width: rect.width, split: root.dataset.split };
    });
    // The click-through contract the HUD has had since M9, now with a
    // container in front of it: the corner of each half must still be canvas.
    const corners = [width * 0.06, width * 0.56].map((x) => (
      document.elementFromPoint(x, height * 0.92)?.tagName ?? 'none'
    ));
    return { width, boxes, corners };
  });

  expect(layout.boxes).toHaveLength(2);
  // Left half starts at the left edge and stops at the middle; right half
  // starts at the middle. A HUD still `inset: 0` against the *window* would
  // report the full width here, twice, and the two would sit on top of one
  // another.
  expect(layout.boxes[0].x).toBe(0);
  expect(layout.boxes[0].width).toBeCloseTo(layout.width / 2, 0);
  expect(layout.boxes[1].x).toBeCloseTo(layout.width / 2, 0);
  expect(layout.boxes[1].width).toBeCloseTo(layout.width / 2, 0);
  expect(layout.corners).toEqual(['CANVAS', 'CANVAS']);
  expect(errors).toEqual([]);
});

test('a half re-grids off its own width, never off the window’s', async ({ page }) => {
  // §25.9's instruction, and the reason it is an instruction. `game.css` has
  // an `@media (max-width: 34rem)` rule that gives the challenge clock its own
  // row so the centred objective cannot paint over it. In this suite's own
  // 1000x700 window each half is 500 px — 31.25rem, well inside the collision
  // — but the query measures the *window*, 62.5rem, and never fires. Keyed off
  // the window, both halves would collide with every test green.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const grids = await page.evaluate(() => {
    const game = window.game;
    game.advance(4);
    const roots = Array.from(document.querySelectorAll<HTMLElement>('.euc-hud'));
    return {
      windowWidth: window.innerWidth,
      mediaQueryWouldFire: window.matchMedia('(max-width: 34rem)').matches,
      areas: roots.map((root) => getComputedStyle(root).gridTemplateAreas),
      viewUnit: roots.map((root) => getComputedStyle(root).getPropertyValue('--hud-vw').trim()),
    };
  });

  // The premise: the window is too wide for the media query to fire.
  expect(grids.mediaQueryWouldFire).toBe(false);
  // And yet both halves are on the stacked grid — four rows, the objective
  // spanning both columns — which is only possible if the attribute did it.
  for (const areas of grids.areas) {
    expect(areas).toContain('objective objective');
  }
  // The view unit halves with the view, so type sized in `vw` arrives at the
  // size it was drawn for.
  expect(grids.viewUnit).toEqual(['0.5vw', '0.5vw']);
  expect(errors).toEqual([]);
});

test('a split frame costs both passes, and stays inside Contract 2', async ({ page }) => {
  // Two things at once, and the first is what makes the second meaningful:
  // three resets `info.render` at the top of every `render()` call, so a
  // two-pass frame reports **only the right-hand half** unless `autoReset` is
  // off and the counters are reset once per frame. Without that, a split frame
  // would look cheaper than a single-player one and this ceiling would be
  // measuring nothing.
  const errors = collectErrors(page);
  await boot(page);

  const cost = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 1, steer: 0 });
    game.advance(120);
    const solo = game.snapshot().render;
    game.spawnSecondRider();
    game.setActionsFor(1, { throttle: 1, steer: -0.4 });
    game.advance(120);
    const split = game.snapshot().render;
    return {
      solo: { drawCalls: solo.drawCalls, triangles: solo.triangles },
      split: { drawCalls: split.drawCalls, triangles: split.triangles },
      views: game.renderer.viewCount,
    };
  });

  expect(cost.views).toBe(2);
  // The sum of the passes: a split frame is strictly dearer than the same
  // scene drawn once, and by more than a rounding error.
  expect(cost.split.drawCalls).toBeGreaterThan(cost.solo.drawCalls * 1.5);
  expect(cost.split.triangles).toBeGreaterThan(cost.solo.triangles * 1.5);
  // Contract 2 governs the split frame…
  expect(cost.split.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxDrawCalls);
  expect(cost.split.triangles).toBeLessThanOrEqual(RENDER_BUDGET_SPLIT.maxTriangles);
  // …and Contract 1 still governs the single-player one. This is the assertion
  // that would fail if the split had been paid for by relaxing the phone's
  // budget rather than by writing a second one.
  expect(cost.solo.drawCalls).toBeLessThanOrEqual(RENDER_BUDGET.maxDrawCalls);
  expect(cost.solo.triangles).toBeLessThanOrEqual(RENDER_BUDGET.maxTriangles);
  expect(SPLIT_PASSES).toBe(2);
  expect(errors).toEqual([]);
});

test('a camera cycle moves only the seat that pressed it', async ({ page }) => {
  // `cameraCycle` was global at Phase 2 because there was one camera to cycle.
  // With two, a guest pressing V to look at their own wheel must not swing the
  // player's view into an orbit mid-corner.
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const modes = await page.evaluate(() => {
    const game = window.game;
    game.advance(4);
    const before = [0, 1].map((seat) => game.snapshotFor(seat).camera.mode);
    // Seat 1 presses it, and only seat 1.
    game.setActionsFor(1, { cameraCycle: true });
    game.advance(2);
    game.setActionsFor(1, { cameraCycle: false });
    game.advance(2);
    return { before, after: [0, 1].map((seat) => game.snapshotFor(seat).camera.mode) };
  });

  expect(modes.before).toEqual(['chase', 'chase']);
  expect(modes.after[1]).not.toBe(modes.before[1]);
  expect(modes.after[0]).toBe('chase');
  expect(errors).toEqual([]);
});

test('a guest’s first-ride prompts never reach the saved options', async ({ page }) => {
  // The options firewall, in the one direction Phase 3 opened a door in.
  // P2 may be a genuine first-timer, so seat 1 gets its own prompts from an
  // empty seen set — and its progress through them is session state.
  const errors = collectErrors(page);
  await boot(page);

  const prompts = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const saved = () => JSON.parse(localStorage.getItem('options') ?? '{}')?.seenPrompts ?? [];
    // Retire the player's whole sequence first, so the record is full and any
    // later write by seat 1 would have to *shorten* or repeat it to be visible.
    game.setActionsFor(0, { throttle: 1, steer: 0 });
    game.advance(240);
    const before = saved();
    game.spawnSecondRider();
    // Seat 1 rides, hops and brakes — everything that retires a prompt.
    game.setActionsFor(1, { throttle: 1, steer: 0 });
    game.advance(120);
    game.setActionsFor(1, { throttle: 1, steer: 0, hop: true });
    game.advance(30);
    game.setActionsFor(1, { throttle: -1, steer: 0 });
    for (let chunk = 0; chunk < 8; chunk += 1) game.advance(15);
    return {
      before,
      after: saved(),
      seatPrompts: [0, 1].map((seat) => game.snapshotFor(seat).hud.prompt),
    };
  });

  // The guest rode, and the saved record did not move.
  expect(prompts.after).toEqual(prompts.before);
  expect(errors).toEqual([]);
});

test('dismissing the second rider gives the whole screen back', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  const back = await page.evaluate(() => {
    const game = window.game;
    game.advance(60);
    const split = {
      views: game.renderer.viewCount,
      huds: document.querySelectorAll('.euc-hud').length,
      containers: document.querySelectorAll('.euc-hud-seat').length,
    };
    game.despawnSecondRider();
    game.advance(4);
    const root = document.querySelector<HTMLElement>('.euc-hud');
    const rect = root?.getBoundingClientRect();
    return {
      split,
      views: game.renderer.viewCount,
      huds: document.querySelectorAll('.euc-hud').length,
      containers: document.querySelectorAll('.euc-hud-seat').length,
      splitAttribute: root?.dataset.split,
      width: rect?.width,
      windowWidth: window.innerWidth,
      aspect: game.renderer.camera.aspect,
      canvasAspect: (() => {
        const gl = game.renderer.renderer.getContext();
        return gl.drawingBufferWidth / gl.drawingBufferHeight;
      })(),
    };
  });

  expect(back.split).toEqual({ views: 2, huds: 2, containers: 2 });
  // **Exactly one of each afterwards.** A second `.euc-hud` left in the
  // document would break every Playwright locator naming that class — which is
  // the loud failure this assertion exists to keep loud.
  expect(back.views).toBe(1);
  expect(back.huds).toBe(1);
  expect(back.containers).toBe(1);
  expect(back.splitAttribute).toBe('none');
  expect(back.width).toBeCloseTo(back.windowWidth, 0);
  // And the camera goes back to the whole canvas rather than staying on half
  // of it, which would leave the world squashed for the rest of the session.
  expect(back.aspect).toBeCloseTo(back.canvasAspect, 3);
  expect(errors).toEqual([]);
});

test('an odd canvas is tiled to its last column, with no gap and no overlap', async ({ page }) => {
  // A Codex QA pass found this on the day Phase 3 shipped: `width / views` on
  // a 1001 px canvas is 500.5, both passes floored to 500, and the final
  // column was drawn by nobody — a one-pixel stripe of untouched page down the
  // right edge of the game. Even widths were flawless, which is exactly what
  // made it survive a suite whose window is 1000x700.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1001, height: 701 });
  await bootTwoRiders(page);

  const tiling = await page.evaluate((stripSource) => {
    const game = window.game;
    const strip = eval(stripSource) as (
      gl: WebGLRenderingContext, x0: number, x1: number, h: number,
    ) => string[];
    game.setActionsFor(0, { throttle: 1, steer: 0 });
    game.setActionsFor(1, { throttle: 1, steer: -1 });
    game.advance(240);

    const gl = game.renderer.renderer.getContext();
    const bufferWidth = gl.drawingBufferWidth;
    const bufferHeight = gl.drawingBufferHeight;
    // Every row of the very last device-pixel column.
    //
    // **Distinctness is the assertion, not opacity.** `beginFrame` clears the
    // whole canvas before the passes, so a column no pass reaches still reads
    // back opaque — it holds the clear colour, uniformly, down its whole
    // height. A drawn column holds a picture. The alpha check below is kept
    // as a second, weaker net for the day somebody makes the context
    // transparent.
    const column: string[] = [];
    let opaque = 0;
    for (let i = 0; i < 16; i += 1) {
      const y = Math.floor((bufferHeight - 1) * (i / 15));
      const px = new Uint8Array(4);
      gl.readPixels(bufferWidth - 1, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (px[3] === 255) opaque += 1;
      column.push(`${px[0]},${px[1]},${px[2]}`);
    }
    const neighbour = strip(gl, bufferWidth - 3, bufferWidth - 1, bufferHeight);

    const viewport = game.renderer.viewport();
    const panes = [0, 1].map((view) => game.renderer.viewBounds(view));
    return {
      viewport,
      bufferWidth,
      panes,
      column,
      columnDistinct: new Set(column).size,
      columnOpaque: opaque,
      neighbourDistinct: new Set(neighbour).size,
      aspects: [0, 1].map((view) => game.renderer.cameraFor(view).aspect),
    };
  }, STRIP_SOURCE);

  // The premise: an odd canvas that does not divide in two.
  expect(tiling.viewport.width % 2).toBe(1);

  // **Tiled exactly once.** No gap (the widths sum to the whole canvas), no
  // overlap (the second pane starts where the first ends), nothing before the
  // first (it starts at zero). The panes are unequal by a pixel, which is the
  // honest answer for an odd width.
  expect(tiling.panes[0].x).toBe(0);
  expect(tiling.panes[1].x).toBe(tiling.panes[0].width);
  expect(tiling.panes[0].width + tiling.panes[1].width).toBe(tiling.viewport.width);
  expect(Math.abs(tiling.panes[0].width - tiling.panes[1].width)).toBe(1);

  // **The last column is drawn.** This is the assertion the defect failed:
  // every sampled pixel is opaque, and the column carries a picture rather
  // than one flat value.
  expect(tiling.columnOpaque).toBe(16);
  expect(tiling.columnDistinct).toBeGreaterThan(1);
  expect(tiling.neighbourDistinct).toBeGreaterThan(1);

  // And each camera is framed for its own pane rather than for half a canvas,
  // so the wider pane is not a pixel of horizontal stretch.
  for (const [view, pane] of tiling.panes.entries()) {
    expect(tiling.aspects[view]).toBeCloseTo(pane.width / tiling.viewport.height, 6);
  }
  expect(tiling.aspects[0]).not.toBe(tiling.aspects[1]);
  expect(errors).toEqual([]);
});

test('an even canvas still splits down the middle, and a resize re-tiles it', async ({ page }) => {
  // The other half of the fix: the rounded partition must not have moved the
  // even case, which is every window the suite and the owner's desktop
  // actually use. And the panes have to survive a resize — `setSize` resets
  // the viewport to the whole canvas, so state set once at the split would be
  // silently undone by the next poll.
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await bootTwoRiders(page);

  const retiled = await page.evaluate(() => {
    const game = window.game;
    game.advance(30);
    const read = () => ({
      viewport: game.renderer.viewport(),
      panes: [0, 1].map((view) => game.renderer.viewBounds(view)),
      aspects: [0, 1].map((view) => game.renderer.cameraFor(view).aspect),
    });
    const even = read();
    // Resize through the method the loop polls every frame — the real path,
    // called directly because `advance()` deliberately does not poll it.
    game.renderer.resize();
    game.advance(2);
    return { even, afterSameSize: read() };
  });

  expect(retiled.even.viewport.width).toBe(1280);
  expect(retiled.even.panes[0]).toEqual({ x: 0, width: 640 });
  expect(retiled.even.panes[1]).toEqual({ x: 640, width: 640 });
  for (const aspect of retiled.even.aspects) {
    expect(aspect).toBeCloseTo(640 / retiled.even.viewport.height, 6);
  }
  // Idempotent: polling the same size again changes nothing.
  expect(retiled.afterSameSize.panes).toEqual(retiled.even.panes);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 4 — input for two: two pads, two claims, one world
// ---------------------------------------------------------------------------

/**
 * Synthetic standard pads, installed before the page's own script runs.
 *
 * The seam the plan named (§25.5 Phase 4's gate): `GamepadInput` takes its
 * source as a constructor default of `navigator`, so replacing
 * `navigator.getGamepads` puts fake pads through **the whole real path** —
 * `beforeFrame`'s poll, the scan, the routing, the claim edge — rather than
 * through a test double of the layer. The owner's couch is one pad and a
 * keyboard (q65); this is how the two-pad half is proven until a second pad
 * exists in the room.
 *
 * **Three slots, and the list is sparse.** Two matter to begin with; the third
 * is the *replacement* pad, so a rejoin can be proved by a pad at a genuinely
 * different index rather than by the same one coming back. And a disconnected
 * pad leaves a `null` **hole** where it was, because that is what the real API
 * does — an earlier version of this helper filtered the list, which quietly
 * renumbered every pad after the one that left and made a fake that could not
 * reproduce the case the code is keyed against.
 */
async function twoPads(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const make = (index: number, connected: boolean) => ({
      index,
      id: `fake standard pad ${index}`,
      connected,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    });
    const pads = [make(0, true), make(1, true), make(2, false)];
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  });
}

type FakePads = {
  index: number;
  connected: boolean;
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
}[];

/** Press and release one button on one pad, a real frame apart. */
async function pulsePad(
  page: import('@playwright/test').Page,
  padIndex: number,
  button: number,
): Promise<void> {
  await page.evaluate(async ({ padIndex: slot, button: at }) => {
    const pads = (window as unknown as { fakePads: FakePads }).fakePads;
    // Addressed by the pad's own `index`, exactly as the game addresses it —
    // the array position and the index agree only while the list is full, and
    // the whole point of the sparse fake is that it does not stay full.
    const pad = pads.find((entry) => entry.index === slot);
    if (pad === undefined) throw new Error(`no fake pad ${slot}`);
    const frame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    pad.buttons[at].pressed = true;
    pad.buttons[at].value = 1;
    await frame();
    pad.buttons[at].pressed = false;
    pad.buttons[at].value = 0;
    await frame();
  }, { padIndex, button });
}

/**
 * Open the claim window, then let the priming frame go by.
 *
 * **Not a workaround — it is the rule being honoured.** `beginClaiming` makes
 * every pad's current buttons stale, and the poll that follows reads them as
 * levels rather than edges, so a button already down when the panel opened
 * claims nothing. A human presses A some hundreds of milliseconds after a
 * panel appears; a spec can press it inside the same sixteen milliseconds,
 * which is indistinguishable from pressing it *before* the panel opened. The
 * two frames here are the spec agreeing to be as slow as a person.
 */
async function openClaims(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => window.game.beginClaiming());
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
}

/** Standard-mapping button indices this file names. */
const PAD_A = 0;
const PAD_B = 1;
const PAD_START = 9;
const PAD_DPAD_DOWN = 13;

test('two pads claim two seats, and each one carves only its own rider', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  // Nothing claimed: the game is exactly the single-player game it has always
  // been — pad 0 is seat 0's and pad 1 is nobody's. This is the preservation
  // the plan asked for, asserted at the top of the couch spec rather than
  // buried in it.
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual([null, null]);

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await pulsePad(page, 1, PAD_START);
  await page.evaluate(() => window.game.endClaiming());

  // Whoever presses first claims (q65). Start counts as well as A — both are
  // confirm on a pad, and the player reaching for the one they know must not
  // find that the game only accepts the other.
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'pad:1']);
  expect(await page.evaluate(() => window.game.snapshot().input.claiming)).toBe(false);

  // Now ride: pad 1 alone, hard right, with pad 0 untouched on the desk.
  const apart = await page.evaluate(async () => {
    const game = window.game;
    const pads = (window as unknown as { fakePads: FakePads }).fakePads;
    game.loop.setRunning(true);
    // Slot 1's own entry, for `pulsePad`'s reason.
    const second = pads[1];
    // Straight ahead rather than diagonally: the dead zone rescales radially,
    // so a stick pushed into a corner reads 0.707 on each axis and the ride
    // would be measuring the geometry of the rescale rather than the routing.
    second.axes[1] = -1;
    await new Promise<void>((resolve) => {
      let frames = 0;
      const tick = (): void => {
        frames += 1;
        if (frames > 90) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    second.axes[1] = 0;
    return {
      first: game.snapshotFor(0).euc.distanceTravelled,
      second: game.snapshotFor(1).euc.distanceTravelled,
    };
  });

  // The foundation gate, through real hardware plumbing rather than through
  // the script bridge: one player's stick moved one player's rider.
  expect(apart.second).toBeGreaterThan(1);
  expect(apart.first).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('an unclaimed pad still drives the menu the other player paused into', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await page.evaluate(() => window.game.endClaiming());
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', null]);

  // The pause card is opened by whoever paused, and q69 keeps it identical for
  // both seats — so a pad that is holding no seat at all still has to be able
  // to work it. Before Phase 4 only the one adopted pad reached a menu.
  await page.evaluate(() => {
    window.game.loop.setRunning(true);
    window.game.setAppState('paused');
  });
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  const focused = (): Promise<string | null> => page.evaluate(
    () => document.activeElement?.getAttribute('data-menu') ?? null,
  );

  const before = await focused();
  await pulsePad(page, 1, PAD_DPAD_DOWN);
  const after = await focused();

  expect(await page.evaluate(() => window.game.snapshot().app.menu)).toBe('pause');
  expect(before).not.toBeNull();
  expect(after).not.toBe(before);
  expect(errors).toEqual([]);
});

test('a claimed pad disconnecting holds the seat, pauses, and asks for a pad', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await pulsePad(page, 1, PAD_A);
  await page.evaluate(() => {
    window.game.endClaiming();
    window.game.loop.setRunning(true);
  });
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);

  // A flat battery is not a decision to leave the game (§25.5 Phase 4).
  await page.evaluate(() => {
    (window as unknown as { fakePads: FakePads }).fakePads[1].connected = false;
  });
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === 1);

  const held = await page.evaluate(() => ({
    seats: window.game.seatCount,
    state: window.game.snapshot().app.state,
    devices: window.game.snapshot().input.devices,
    claiming: window.game.snapshot().input.claiming,
    status: document.querySelector('[data-menu="gamepad-status"]')?.textContent ?? '',
  }));

  expect(held.seats, 'the rider is still in the world').toBe(2);
  expect(held.state).toBe('paused');
  expect(held.devices).toEqual(['pad:0', null]);
  expect(held.claiming, 'the window reopens so a pad can rejoin').toBe(true);
  expect(held.status).toContain('Player 2');

  // **A different pad entirely**, which is the case that matters: the dead pad
  // stays unplugged and slot 2 arrives in its place. A re-plug usually
  // re-enumerates, and no player can see the number that changed — so a rejoin
  // that only worked for the same index would be a rejoin that mostly did not
  // work at all.
  await page.evaluate(() => {
    (window as unknown as { fakePads: FakePads }).fakePads[2].connected = true;
  });
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await pulsePad(page, 2, PAD_A);

  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'pad:2']);
  expect(await page.evaluate(() => window.game.snapshot().input.awaiting)).toBeNull();
  expect(errors).toEqual([]);
});

test('two seats asking to mute in one tick toggle it once, not back again', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  // §25.9's any-seat-once, and the case that made it non-optional: `muteAudio`
  // is a *toggle*, so two claims in one tick silenced and un-silenced the game
  // and read as a dead key. Pause is the same rule and the plan's own example;
  // mute is the one a spec can see without leaving the ride.
  const muted = await page.evaluate(() => {
    const game = window.game;
    const before = game.snapshot().options.muted;
    game.setActionsFor(0, { muteAudio: true });
    game.setActionsFor(1, { muteAudio: true });
    game.advance(1);
    const after = game.snapshot().options.muted;
    game.setActionsFor(0, { muteAudio: true });
    game.advance(1);
    return { before, after, alone: game.snapshot().options.muted };
  });

  expect(muted.after).toBe(!muted.before);
  expect(muted.alone, 'and one seat alone still toggles it').toBe(muted.before);

  // Pause, the plan's own example, from the second seat: two simultaneous
  // presses must not toggle twice into "still riding".
  const paused = await page.evaluate(() => {
    const game = window.game;
    game.setActionsFor(0, { pause: true });
    game.setActionsFor(1, { pause: true });
    game.advance(1);
    return game.snapshot().app.state;
  });
  expect(paused).toBe('paused');
  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

test('camera cycle and respawn stay strictly per seat', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  // The other half of the aggregation rule: what is global is global, and what
  // is a rider's is not. A guest cycling to the inspection camera must not
  // swing the player's half of the screen.
  const cameras = await page.evaluate(() => {
    const game = window.game;
    const before = [game.snapshotFor(0).camera.mode, game.snapshotFor(1).camera.mode];
    game.setActionsFor(1, { cameraCycle: true });
    game.advance(1);
    return { before, after: [game.snapshotFor(0).camera.mode, game.snapshotFor(1).camera.mode] };
  });

  expect(cameras.after[0]).toBe(cameras.before[0]);
  expect(cameras.after[1]).not.toBe(cameras.before[1]);
  expect(errors).toEqual([]);
});

test('the keyboard drives the seat it claimed, and a resize clears it', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await page.evaluate(() => window.game.loop.setRunning(true));

  // **The couch the owner actually has** (q65): one pad and the keyboard. The
  // pad presses first and takes seat 0, so Enter takes seat 1 — and W is then
  // the *guest's* throttle, on a keyboard the player is sitting in front of.
  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.game.endClaiming());
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'keyboard']);

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.game.snapshotFor(1).actions.throttle === 1);
  expect(await page.evaluate(() => window.game.snapshotFor(0).actions.throttle)).toBe(0);

  // The M9 input-reset contract, applied per seat (§25.5 Phase 4): a layout
  // change clears held and analog state on **every** seat, because the window
  // moved under both players' hands. Before Phase 4 this line cleared exactly
  // one action state, and the guest would have carried a throttle nobody could
  // release through a window resize.
  const changes = await page.evaluate(() => window.game.snapshot().layoutChanges);
  await page.setViewportSize({ width: 900, height: 640 });
  await page.waitForFunction((was) => window.game.snapshot().layoutChanges > was, changes);

  expect(await page.evaluate(() => window.game.snapshotFor(1).actions.throttle)).toBe(0);
  await page.keyboard.up('KeyW');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 4, repaired — four defects an independent QA pass found
// ---------------------------------------------------------------------------

test('the guest leaving hands the keyboard back to the player', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await page.evaluate(() => window.game.loop.setRunning(true));

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await page.keyboard.press('Enter');
  await page.evaluate(() => window.game.endClaiming());
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'keyboard']);

  // **The exit path.** Deleting the guest's claim is only half of putting the
  // keyboard back: its layer holds a *sink*, and that sink is the action state
  // of a seat that has just left the table. Miss the repoint and W writes into
  // an object nothing samples — the player is left holding a keyboard that
  // does nothing at all, on their own rider, with no way to tell why.
  await page.evaluate(() => window.game.despawnSecondRider());
  // The player's own pad is untouched — only the claim that pointed at the
  // seat which left is dropped, because a device claimed to the rider who has
  // gone has no opinion about the rider who stayed.
  expect(await page.evaluate(() => window.game.snapshot().input.devices)).toEqual(['pad:0']);

  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.game.snapshot().actions.throttle === 1);
  await page.keyboard.up('KeyW');
  expect(errors).toEqual([]);
});

test('a menu boundary clears every seat, so no guest press survives a pause', async ({ page }) => {
  const errors = collectErrors(page);
  await bootTwoRiders(page);

  // A one-shot latched by seat 1 and never claimed — the wheel is airborne, so
  // the hop stays pending — then a pause and a resume. Before the repair the
  // keyboard cleared only the sink it happened to be pointing at, so the
  // guest's buffered press outlived the menu and fired on the first resumed
  // step: the blur bug arriving through a third door, on a rider whose device
  // had not even opened the menu.
  const round = await page.evaluate(() => {
    const game = window.game;
    const hops = () => game.snapshotFor(1).consumed.hop;
    game.setActionsFor(1, { hop: true });
    const before = { pending: game.snapshotFor(1).actions.hop, hops: hops() };
    game.setAppState('paused');
    const during = { pending: game.snapshotFor(1).actions.hop, hops: hops() };
    game.setAppState('freeRide');
    const after = { pending: game.snapshotFor(1).actions.hop, hops: hops() };
    game.advance(30);
    return { before, during, after, settled: hops() };
  });

  expect(round.before.pending).toBe(true);
  expect(round.during.pending).toBe(false);
  expect(round.after.pending).toBe(false);
  expect(round.settled, 'and it never became a hop').toBe(round.before.hops);
  expect(errors).toEqual([]);
});

test('each half is told about the device its own player is holding', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await boot(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  // A first-ride session, so both riders are owed the prompts: seat 1 starts
  // from an empty seen set by construction (§25.5), and seat 0 is cleared here
  // because this browser profile may have finished them long ago.
  await page.evaluate(() => {
    window.game.setOptions({ seenPrompts: [] });
    window.game.loop.setRunning(false);
    window.game.spawnSecondRider();
  });

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.game.endClaiming();
    window.game.loop.setRunning(true);
  });
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'keyboard']);

  // **The words on the screen, not the field behind them.** With a pad on seat
  // 0 and the keyboard on seat 1, a machine-wide "what has this room been seen
  // using" is wrong for one of the two players by construction — and the one
  // it is wrong for is the guest, who is the person in the room least able to
  // work out that the game is describing somebody else's hardware.
  await page.waitForFunction(() => {
    const huds = document.querySelectorAll('[data-hud="prompt-text"]');
    return huds.length === 2 && (huds[0].textContent ?? '') !== ''
      && (huds[1].textContent ?? '') !== '';
  }, undefined, { timeout: 20000 });

  const prompts = await page.locator('[data-hud="prompt-text"]').allTextContents();
  expect(prompts[0]).toMatch(/trigger|stick/i);
  expect(prompts[0]).not.toMatch(/Hold W|Space/);
  expect(prompts[1]).toMatch(/Hold W|Hold S|Space/);
  expect(prompts[1]).not.toMatch(/trigger|left stick/i);

  expect(await page.evaluate(() => window.game.snapshotFor(0).touch.promptDevice))
    .toBe('gamepad');
  expect(await page.evaluate(() => window.game.snapshotFor(1).touch.promptDevice))
    .toBe('keyboard');
  await page.evaluate(() => window.game.resetOptions());
  expect(errors).toEqual([]);
});

test('the seat waiting for a pad stops being mentioned when its rider leaves', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await pulsePad(page, 1, PAD_A);
  await page.evaluate(() => window.game.endClaiming());

  await page.evaluate(() => {
    (window as unknown as { fakePads: FakePads }).fakePads[1].connected = false;
  });
  await page.waitForFunction(() => window.game.snapshot().input.awaiting === 1);
  const status = (): Promise<string> => page.evaluate(
    () => document.querySelector('[data-menu="gamepad-status"]')?.textContent ?? '',
  );
  expect(await status()).toContain('Player 2');

  // The line is about a **seat**. Drop the seat without saying so and it stands
  // there for ever, holding a place for somebody who is no longer in the room,
  // with nothing left in the game able to clear it.
  await page.evaluate(() => window.game.despawnSecondRider());
  expect(await page.evaluate(() => window.game.snapshot().input.awaiting)).toBeNull();
  expect(await status()).not.toContain('Player 2');
  expect(errors).toEqual([]);
});

test('a browser that compacts its pad list does not shuffle the couch', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const make = (index: number, connected: boolean) => ({
      index,
      id: `fake standard pad ${index}`,
      connected,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    });
    const pads = [make(0, true), make(1, true)];
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    // **The hostile shape**, on purpose. The Gamepad API says a pad's `index`
    // is its position in this list and the list is sparse — but the promise is
    // the *browser's*, and a pad's identity is what a claim is made of. A list
    // that closes its holes must not hand seat 1 to whoever is left standing
    // next to it, so the game keys a pad by the index the pad reports rather
    // than by where it happened to land.
    navigator.getGamepads = () => pads.filter((pad) => pad.connected) as never;
  });
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await pulsePad(page, 1, PAD_A);
  await page.evaluate(() => window.game.endClaiming());
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'pad:1']);

  // Pad 0 leaves. In a compacting list pad 1 slides into slot 0 — and the
  // player who is still holding it must still be in seat 1.
  await page.evaluate(() => {
    (window as unknown as { fakePads: FakePads }).fakePads[0].connected = false;
  });
  await page.waitForFunction(() => window.game.snapshot().input.pads === 1);

  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual([null, 'pad:1']);
  expect(await page.evaluate(() => window.game.snapshot().input.awaiting)).toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 5 — the mode: two-player free ride
// ---------------------------------------------------------------------------

/**
 * Phase 5 is the first phase a *player* can reach, and that is what these
 * specs are for. Everything below Phase 4 was proven through the QA bridge
 * because there was no screen in front of it; from here the way in is a button
 * on the title, a panel, and two people pressing two things — so the specs
 * press them.
 *
 * Four claims can only be made here:
 *
 *   1. **The entrance appears exactly where a couch could happen** and nowhere
 *      else. It is a live predicate over the window's width, so it is a
 *      browser question by construction.
 *   2. **A claim press is not also a button press.** The one interaction bug
 *      this panel can have that nothing else in the game can: Enter and A mean
 *      "I am sitting down" *and* "press the focused control", and the moment
 *      the second seat fills is the moment Start becomes pressable.
 *   3. **The session is given back.** A seat, a rig, a HUD, a claim and half a
 *      screen, across repeated visits — invariant 10 on the newest disposable
 *      thing in the game, now reached the way a player reaches it.
 *   4. **Both riders are heard** (q66), each crash in its own voice (q68),
 *      which needs a real sample bank and a real mix.
 */

/** Boot to the title in a window wide enough to be offered a couch. */
async function bootToCouchTitle(page: import('@playwright/test').Page): Promise<void> {
  await bootToTitle(page);
  await page.waitForFunction(() => window.game.snapshot().couch.available);
}

/** Open the join panel through the title button a player would press. */
async function openJoinPanel(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('.euc-menu--title [data-menu="couch"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'couchJoin');
  // The claim window's priming frame, for `openClaims`' reason: a spec can
  // press a button inside the sixteen milliseconds that are indistinguishable
  // from pressing it before the panel opened.
  await page.evaluate(async () => {
    for (let i = 0; i < 2; i += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
  });
}

test('the couch entrance appears only where two halves would fit', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToCouchTitle(page);

  const button = page.locator('.euc-menu--title [data-menu="couch"]');
  await expect(button).toBeVisible();

  // A window that cannot hold two legible halves is not offered the mode. The
  // threshold is the width the split's own HUD contract was measured at, so
  // this is the entrance agreeing with the thing behind it rather than with a
  // number somebody liked.
  await page.setViewportSize({ width: 820, height: 700 });
  await page.waitForFunction(() => window.game.snapshot().couch.available === false);
  await expect(button).toBeHidden();

  // And it comes back, because the predicate is re-evaluated rather than
  // sampled once at boot — a player who drags their window wider has changed
  // the answer.
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForFunction(() => window.game.snapshot().couch.available === true);
  await expect(button).toBeVisible();
  expect(errors).toEqual([]);
});

test('the join panel seats a pad and the keyboard, then rides', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootToCouchTitle(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  await openJoinPanel(page);

  // Two seats exist the moment the panel does, and both are empty: this is a
  // screen for sitting down at, so it has somewhere to sit.
  expect(await page.evaluate(() => window.game.snapshot().input.devices)).toEqual([null, null]);
  const start = page.locator('.euc-menu--couch [data-menu="couch-start"]');
  await expect(start).toBeDisabled();

  await pulsePad(page, 0, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  // One seat is not a couch.
  await expect(start).toBeDisabled();

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().couch.ready);
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'keyboard']);
  await expect(start).toBeEnabled();

  // Whoever pressed first sits first, and the panel says what is holding each
  // seat in words a player can act on.
  await expect(page.locator('[data-couch-status="0"]')).toHaveText(/Gamepad 1/);
  await expect(page.locator('[data-couch-status="1"]')).toHaveText(/Keyboard/);

  await start.click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  // A ride, with two seats, two HUDs and the claims intact — and the claim
  // window shut, so a stray A during the ride cannot re-seat anybody.
  const riding = await page.evaluate(() => {
    const snapshot = window.game.snapshot();
    return {
      seats: window.game.seatCount,
      devices: snapshot.input.devices,
      claiming: snapshot.input.claiming,
      huds: document.querySelectorAll('.euc-hud-seat').length,
    };
  });
  expect(riding.seats).toBe(2);
  expect(riding.devices).toEqual(['pad:0', 'keyboard']);
  expect(riding.claiming).toBe(false);
  expect(riding.huds).toBe(2);
  expect(errors).toEqual([]);
});

test('a claim press is not also a press of whatever had focus', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootToCouchTitle(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await openJoinPanel(page);

  // The worst case, staged: focus on the one control that leaves the panel,
  // and a player sitting down. Both halves of "I'm in" — a pad's A and the
  // keyboard's Enter — arrive at a screen where the browser and the game both
  // think they are being spoken to.
  const back = page.locator('.euc-menu--couch [data-menu="couch-back"]');
  await back.focus();
  await pulsePad(page, 0, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  expect(await page.evaluate(() => window.game.snapshot().app.state))
    .toBe('couchJoin');

  await back.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().couch.ready);
  expect(await page.evaluate(() => window.game.snapshot().app.state))
    .toBe('couchJoin');

  // And the suppression lifts the instant it stops being needed: a device that
  // holds a seat is a person choosing something, so the very next Enter is an
  // ordinary confirm. Without this the panel would be a room nobody can leave.
  await back.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  expect(errors).toEqual([]);
});

test('the two cards can never agree, and the guest never reaches the saved record', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  await openJoinPanel(page);

  const walk = await page.evaluate(async () => {
    const step = async (seat: number, way: 'prev' | 'next') => {
      document
        .querySelector<HTMLElement>(`[data-couch-step="${seat}"][data-menu="couch-${way}"]`)
        ?.click();
      await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      const snapshot = window.game.snapshot();
      return { player: snapshot.options.character, guest: snapshot.couch.guest };
    };
    const seen = [await step(1, 'next')];
    // A full lap of each card, in both directions, from both seats. q68 is a
    // property of the control rather than a rule applied afterwards, so there
    // is no arrangement of presses that can make the two agree.
    for (let i = 0; i < 6; i += 1) seen.push(await step(0, 'next'));
    for (let i = 0; i < 6; i += 1) seen.push(await step(1, 'prev'));
    for (let i = 0; i < 6; i += 1) seen.push(await step(0, 'prev'));
    return seen;
  });

  for (const pair of walk) {
    expect(pair.player, 'the two riders wore the same character').not.toEqual(pair.guest);
  }

  // The guest's pick is session state. The saved record answers for the person
  // whose browser this is and for nobody else — the same firewall that keeps a
  // guest's first-ride prompts out of `seenPrompts`.
  const saved = await page.evaluate(() => {
    const raw = window.localStorage.getItem('euc-thrills.options.v1');
    return raw === null ? '' : raw;
  });
  const guest = walk[walk.length - 1].guest;
  expect(saved).not.toContain(guest);

  // And the world agrees with the cards: the rider standing in seat 1 is the
  // one the card names, because the card writes the rig.
  expect(await page.evaluate(() => window.game.snapshotFor(1).rider.installed)).toBe(guest);
  expect(errors).toEqual([]);
});

test('leaving the panel and the ride both give the whole screen back', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootToCouchTitle(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  const alone = await page.evaluate(() => window.game.resources());

  // Three round trips, two of them all the way through a ride, because a leak
  // that only shows on the second visit is the leak this test is for.
  for (let visit = 0; visit < 3; visit += 1) {
    await openJoinPanel(page);
    expect(await page.evaluate(() => window.game.seatCount)).toBe(2);

    if (visit === 0) {
      // Back, without ever riding.
      await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
    } else {
      await pulsePad(page, 0, PAD_A);
      await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.game.snapshot().couch.ready);
      await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
      await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
      await page.evaluate(() => window.game.advance(60));
      // Out through the pause card, which is the way a player leaves — and the
      // pause menu is the same menu for both seats (q69), with no authority
      // guard on Quit.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
      await page.locator('.euc-menu--pause [data-menu="quit"]').click();
    }

    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
    const back = await page.evaluate(() => ({
      seats: window.game.seatCount,
      devices: window.game.snapshot().input.devices,
      huds: document.querySelectorAll('.euc-hud-seat').length,
      resources: window.game.resources(),
    }));
    expect(back.seats, `visit ${visit} kept a seat`).toBe(1);
    expect(back.devices, `visit ${visit} kept a claim`).toEqual([null]);
    expect(back.huds, `visit ${visit} kept a HUD`).toBe(1);
    expect(back.resources.geometries, `visit ${visit} leaked geometry`)
      .toBeLessThanOrEqual(alone.geometries);
    expect(back.resources.sceneObjects, `visit ${visit} leaked scene objects`)
      .toBeLessThanOrEqual(alone.sceneObjects);
  }
  expect(errors).toEqual([]);
});

test('either seat pauses the one world, and the pad that paused it can leave', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootToCouchTitle(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await openJoinPanel(page);
  await pulsePad(page, 0, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().couch.ready);
  await page.locator('.euc-menu--couch [data-menu="couch-start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  // The guest's keyboard pauses the shared world.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');

  // And so does the player's pad — Start, which is the pause button on a pad.
  await pulsePad(page, 0, PAD_START);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');

  // **The pause card is identical for both seats** — q69, the owner's explicit
  // call over both agents' advice: the couch is trusted, so there is no
  // authority guard on Quit or New route, and the pad that paused can walk the
  // card and press them.
  await expect(page.locator('.euc-menu--pause [data-menu="quit"]')).toBeVisible();
  await pulsePad(page, 0, PAD_DPAD_DOWN);
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-menu')))
    .not.toBe(null);
  expect(errors).toEqual([]);
});

test('both riders are heard, and each crash speaks its own character', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  // A gesture, so there is a real graph and a real sample bank to reach for —
  // `lastCrashVoice` is the sink's report of the buffer it actually played, and
  // it is the only honest witness (m19).
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);

  await openJoinPanel(page);
  // Seat 1 wears somebody else by q68's rule; name them so the assertion can.
  const guest = await page.evaluate(() => window.game.snapshot().couch.guest);
  expect(guest).toBe('trollina');
  await page.evaluate(() => window.game.setAppState('freeRide'));
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);

  const heard = await page.evaluate(async () => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().audio;

    // **The guest alone.** Seat 0 stands still with no input at all, so every
    // sound below is seat 1's — which is the whole of q66: before Phase 5 this
    // rider made no sound whatsoever.
    //
    // A hop first, because it is the cheapest edge to produce deliberately and
    // it brings a landing with it: three of the four one-shots that used to be
    // gated on "is this the seat the mix follows", proved in one ride.
    game.setActionsFor(1, { hop: true });
    game.advance(4);
    game.setActionsFor(1, { hop: false });
    game.advance(90);
    const airborne = game.snapshot().audio;

    let steps = 0;
    while (steps < 3000 && !game.snapshotFor(1).euc.crashed) {
      const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
      game.setActionsFor(1, { throttle: 1, steer: flip });
      game.advance(6);
      steps += 6;
    }
    game.setActionsFor(1, { throttle: 0, steer: 0 });
    const after = game.snapshot().audio;
    return {
      guestHops: airborne.played.hop - before.played.hop,
      guestLandings: airborne.played.landing - before.played.landing,
      guestCrashed: game.snapshotFor(1).euc.crashed,
      playerCrashed: game.snapshotFor(0).euc.crashed,
      crashes: after.played.crash - airborne.played.crash,
      voice: after.lastCrashVoice,
    };
  });

  expect(heard.guestHops, 'the guest hopped in silence').toBeGreaterThanOrEqual(1);
  expect(heard.guestLandings, 'the guest landed in silence').toBeGreaterThanOrEqual(1);
  expect(heard.guestCrashed, 'the guest never came off').toBe(true);
  expect(heard.playerCrashed, 'the player fell over doing nothing').toBe(false);
  expect(heard.crashes, 'the guest crashed in silence').toBeGreaterThanOrEqual(1);
  // The voice is the *guest's*, not the player's saved one. q68's rule is what
  // makes this unambiguous rather than merely correct: two riders on one screen
  // are never the same character, so a fall you hear is a fall you can place.
  expect(heard.voice).toBe('trollina');
  expect(await page.evaluate(() => window.game.snapshot().options.character)).toBe('cool-rider');
  expect(errors).toEqual([]);
});

test('the guest’s max-speed warning beeps even while the player is standing still', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  await openJoinPanel(page);
  await page.evaluate(() => window.game.setAppState('freeRide'));
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);

  const warned = await page.evaluate(async () => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().audio;
    // Seat 1 flat out; seat 0 untouched. The bed stays the player's — that is
    // deliberate and is what `updateAudio` says — but the *warning* is
    // everybody's, because a guest riding into the cutout with no beep is being
    // told nothing at all (q66).
    for (let i = 0; i < 60; i += 1) {
      game.setActionsFor(1, { throttle: 1 });
      game.advance(30);
      if (game.snapshotFor(1).euc.overspeed > 0.4) break;
    }
    const after = game.snapshot().audio;
    return {
      guestOverspeed: game.snapshotFor(1).euc.overspeed,
      playerOverspeed: game.snapshotFor(0).euc.overspeed,
      beeps: after.played.overspeed - before.played.overspeed,
    };
  });

  expect(warned.playerOverspeed, 'the player moved').toBe(0);
  expect(warned.guestOverspeed, 'the guest never reached the band').toBeGreaterThan(0.3);
  expect(warned.beeps, 'the guest rode into the cutout in silence').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/**
 * The desktop fit contract — M25 Phase 5, and it is M23's lesson written down
 * as a test rather than as a paragraph.
 *
 * M23's seventh title button clipped the heading **in the browser suite's own
 * 1000 × 700 window with every one of its specs green**, because the fit
 * contract that existed measured phone and tablet sizes only and the desktop
 * breakpoint it relied on had been *chosen* rather than derived. The eighth
 * button is the same hazard, and it is worse: it appears only on the desktop,
 * so the mobile contract cannot see it at all.
 *
 * The sizes are deliberately not round. Two are the suite's own windows, two
 * are ordinary laptops, and the rest are the shapes a browser window actually
 * takes when somebody has not maximised it — including the short-and-wide ones
 * that broke first (1600 × 500 overflowed by 67 px before the layout tiers
 * below 56 rem and 40 rem existed, and 1000 × 560 by 7).
 */
test('the title and the join panel fit every desktop window that is offered them', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  const VIEWPORTS = [
    { width: 1000, height: 700 },   // the browser suite's own window
    { width: 1000, height: 520 },   // and a short one at the same width
    { width: 1000, height: 560 },
    { width: 1024, height: 600 },
    { width: 1180, height: 820 },
    { width: 1280, height: 720 },
    { width: 1280, height: 640 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1600, height: 500 },   // short and wide: the one that broke worst
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ];

  const settle = async (): Promise<void> => {
    await page.evaluate(async () => {
      for (let i = 0; i < 2; i += 1) {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
      }
    });
  };

  const unscrollable = async (menu: string, at: { width: number; height: number }) => {
    const overflow = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel);
      if (root === null) throw new Error(`no ${sel}`);
      return root.scrollHeight - root.clientHeight;
    }, menu);
    expect(
      overflow,
      `${menu} has ${overflow}px hidden below the fold at ${at.width}x${at.height}`,
    ).toBeLessThanOrEqual(1);
  };

  const inside = async (selector: string, at: { width: number; height: number }) => {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} has no box at ${at.width}x${at.height}`).not.toBeNull();
    if (box === null) return;
    expect(box.y, `${selector} starts above ${at.width}x${at.height}`).toBeGreaterThanOrEqual(-0.5);
    expect(box.y + box.height, `${selector} ends below ${at.width}x${at.height}`)
      .toBeLessThanOrEqual(at.height + 0.5);
  };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await settle();

    // Every one of these windows is wide enough to be offered a couch, which is
    // the point: the eighth entrance is what the fit has to survive.
    expect(
      await page.evaluate(() => window.game.snapshot().couch.available),
      `no couch offered at ${viewport.width}x${viewport.height}`,
    ).toBe(true);
    await unscrollable('.euc-menu--title', viewport);
    await inside('.euc-menu--title [data-menu="couch"]', viewport);
    await inside('.euc-menu--title [data-menu="settings"]', viewport);
    await inside('.euc-menu--title .euc-credit', viewport);

    // And the panel behind that button, whose own two cards and armed Start
    // have to be reachable without scrolling on the same windows.
    await openJoinPanel(page);
    await unscrollable('.euc-menu--couch', viewport);
    await inside('.euc-menu--couch [data-couch-seat="0"]', viewport);
    await inside('.euc-menu--couch [data-couch-seat="1"]', viewport);
    await inside('.euc-menu--couch [data-menu="couch-start"]', viewport);
    await inside('.euc-menu--couch [data-menu="couch-back"]', viewport);
    await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
    await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  }
  expect(errors).toEqual([]);
});

test('a machine with one keyboard and no pad says so instead of repeating itself', async ({ page }) => {
  // The entrance predicate is deliberately loose — a desktop with a mouse and
  // no pad passes it, because a pad can be plugged in at any moment — so the
  // panel is where a second device is actually proved. It has to be able to
  // say there is nothing left to press: a seat the keyboard is already holding,
  // beside a line reading "press Enter on the keyboard", is a screen the player
  // concludes is broken rather than one they can act on.
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  expect(await page.evaluate(() => window.game.snapshot().input.pads)).toBe(0);
  await openJoinPanel(page);

  await expect(page.locator('[data-couch-status="0"]')).toHaveText(/press Enter on the keyboard/);
  await expect(page.locator('[data-couch-status="1"]')).toHaveText(/press Enter on the keyboard/);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'keyboard');

  await expect(page.locator('[data-couch-status="0"]')).toHaveText(/Keyboard/);
  // The seat that is left names the only thing that could still fill it.
  await expect(page.locator('[data-couch-status="1"]')).toHaveText(/plug in a gamepad/);
  await expect(page.locator('.euc-menu--couch [data-menu="couch-start"]')).toBeDisabled();
  expect(await page.evaluate(() => window.game.snapshot().couch.ready)).toBe(false);
  expect(errors).toEqual([]);
});

test('the guest is re-chosen when the player has taken their rider in between', async ({ page }) => {
  // **The gap between two visits**, which the panel's own controls cannot
  // reach and which the mutation check found: the guest's pick is session
  // state that survives Back, and the *player* can change who they are while
  // the panel is shut. `installCharacter`'s q68 re-dress moves whoever is
  // wearing the taken rider, but between visits there is nobody in seat 1 to
  // move — so the remembered guest is the only thing left holding the clash,
  // and it has to be asked again on the way in.
  //
  // Without the re-derive both cards read the same name while the two rigs in
  // the world are different riders, because `spawnSecondRider` enforces q68 at
  // its own door and the panel does not: the geometry stays right and the
  // screen starts lying about it.
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));

  await openJoinPanel(page);
  const guest = await page.evaluate(() => window.game.snapshot().couch.guest);
  expect(guest).not.toBe('cool-rider');
  await page.locator('.euc-menu--couch [data-menu="couch-back"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');

  // The player takes the rider the guest had chosen, through the chooser they
  // actually have — which is reachable from the title and only from there.
  await page.evaluate((id) => window.game.setOptions({ character: id as never }), guest);
  expect(await page.evaluate(() => window.game.snapshot().options.character)).toBe(guest);

  await openJoinPanel(page);
  const after = await page.evaluate(() => ({
    player: window.game.snapshot().options.character,
    guest: window.game.snapshot().couch.guest,
    card: [...document.querySelectorAll('[data-couch-rider]')].map((n) => n.textContent),
    seatZero: window.game.snapshotFor(0).rider.installed,
    seatOne: window.game.snapshotFor(1).rider.installed,
  }));

  expect(after.guest, 'the guest kept a rider the player had taken').not.toBe(after.player);
  expect(after.card[0]).not.toBe(after.card[1]);
  // And the cards agree with the world, which is the half that would have
  // silently stayed correct while the screen stopped being.
  expect(after.seatOne).toBe(after.guest);
  expect(after.seatZero).toBe(after.player);
  expect(errors).toEqual([]);
});

test('the guest the game remembers is always the guest standing in the world', async ({ page }) => {
  // q68 is held in two places at once and they must not drift: the *geometry*
  // (`RiderSeat.character`, written beside the rig) and the *session field* the
  // panel draws and a re-entry respawns from. `installCharacter` already moves
  // whoever is wearing a rider the player has just taken; this is the other
  // half of that move.
  //
  // The panel's own controls cannot reach it — each card steps over the other's
  // pick — so the way in is the surface the owner actually has beside them: the
  // console. A defensive line earns its place by having a test that fails
  // without it.
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  await openJoinPanel(page);

  const taken = await page.evaluate(() => window.game.snapshot().couch.guest);
  expect(taken).not.toBe('cool-rider');

  // The player takes the guest's rider out from under them, mid-session.
  await page.evaluate((id) => window.game.setOptions({ character: id as never }), taken);
  const after = await page.evaluate(() => ({
    guest: window.game.snapshot().couch.guest,
    standing: window.game.snapshotFor(1).rider.installed,
    player: window.game.snapshotFor(0).rider.installed,
  }));

  expect(after.player).toBe(taken);
  expect(after.standing, 'the guest kept a rider the player took').not.toBe(taken);
  expect(after.guest, 'the remembered guest and the standing guest disagree')
    .toBe(after.standing);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 5's QA repair — four defects an independent pass found
// ---------------------------------------------------------------------------

test('a player on the ground does not take the guest’s warnings away', async ({ page }) => {
  // **The defect this repair exists for, at the level a player meets it.**
  // `RideAudioInput.crashed` is seat 0's — it answers for the rider the
  // continuous bed follows — and the director was using it to gate the
  // *aggregated* warnings as well. So the moment the player fell off, the guest
  // could ride into the cutout in total silence, which is exactly what q66
  // forbids and is machine-verifiable rather than a matter of taste.
  //
  // **On the proving ground, and that is not a shortcut.** This spec needs one
  // rider held near the cutout while another is on the ground, for a measurable
  // window — and in the city a rider doing 50 mph blind hits a building inside
  // a second, which measures the city rather than the mix. The proving ground
  // is the flat instrument that exists for exactly this.
  //
  // **Only the cutout family is asserted here, and the other one cannot be.**
  // The power ladder needs the wheel to run out of power, which a flat ride at
  // this tuning never does — `powerStage` is `normal` from a standing start to
  // the cutout — so a browser assertion about it would be a test that cannot
  // fail. Its aggregation is pinned where it *can* fail, twice:
  // `src/app/riderMix.test.ts` and `src/audio/director.test.ts`.
  const errors = collectErrors(page);
  await boot(page, 'level=proving');

  const heard = await page.evaluate(async () => {
    const game = window.game;
    game.loop.setRunning(false);
    game.spawnSecondRider();

    // Both up into the cutout band together.
    let up = 0;
    while (up < 3000 && game.snapshotFor(1).euc.overspeed <= 0.55) {
      game.setActionsFor(0, { throttle: 1 });
      game.setActionsFor(1, { throttle: 1 });
      game.advance(10);
      up += 10;
    }

    // The guest holds the band from here rather than climbing out of it: the
    // cutout's hold only accumulates *past* the edge, so easing off keeps them
    // beeping indefinitely without ever being thrown off by it.
    const hold = (): void => {
      const overspeed = game.snapshotFor(1).euc.overspeed;
      game.setActionsFor(1, { throttle: overspeed < 0.5 ? 1 : 0.2 });
    };

    // Now put the player on the ground.
    let steps = 0;
    while (steps < 2000 && !game.snapshotFor(0).euc.crashed) {
      const flip = Math.floor(steps / 12) % 2 === 0 ? 1 : -1;
      game.setActionsFor(0, { throttle: 1, steer: flip });
      hold();
      game.advance(6);
      steps += 6;
    }
    game.setActionsFor(0, { throttle: 0, steer: 0 });

    // The window this measures is the player's ragdoll, and the loop is frozen
    // so it lasts exactly as long as this asks it to.
    const before = game.snapshot().audio;
    let measured = 0;
    while (measured < 120 && game.snapshotFor(0).euc.crashed) {
      hold();
      game.advance(6);
      measured += 6;
    }
    const after = game.snapshot().audio;
    return {
      playerDown: game.snapshotFor(0).euc.crashed,
      guestUp: !game.snapshotFor(1).euc.crashed,
      guestOverspeed: game.snapshotFor(1).euc.overspeed,
      cutoutBeeps: after.played.overspeed - before.played.overspeed,
    };
  });

  expect(heard.playerDown, 'the player got up before the measurement finished').toBe(true);
  expect(heard.guestUp, 'the guest fell too, so this measures nothing').toBe(true);
  expect(heard.guestOverspeed, 'the guest left the band').toBeGreaterThan(0.3);
  expect(heard.cutoutBeeps, 'the guest rode into the cutout in silence').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('the guest gets their own recovery chirp, and the player does not get two', async ({ page }) => {
  // The recovery chirp was the one cue the director still detected for itself,
  // from the falling edge of an input that answers only for seat 0 — so a guest
  // who crashed and picked themselves up was met with silence. Both ends of the
  // crash are now dispatched from the same per-seat edge in the fixed step.
  const errors = collectErrors(page);
  await bootToCouchTitle(page);
  await openJoinPanel(page);
  await page.evaluate(() => window.game.setAppState('freeRide'));
  await page.waitForFunction(() => window.game.snapshot().app.acceptsRideInput);

  const recovered = await page.evaluate(async () => {
    const game = window.game;
    game.loop.setRunning(false);
    const before = game.snapshot().audio.played.recover;

    // The guest alone: seat 0 is given no input at all, so a chirp can only be
    // seat 1's — and a *pair* of chirps would be the double-fire.
    let steps = 0;
    while (steps < 4000 && !game.snapshotFor(1).euc.crashed) {
      const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
      game.setActionsFor(1, { throttle: 1, steer: flip });
      game.advance(6);
      steps += 6;
    }
    game.setActionsFor(1, { throttle: 0, steer: 0 });
    const down = game.snapshotFor(1).euc.crashed;

    // Ride it out to the automatic respawn rather than resetting, because a
    // reset is a rider who stopped having a crash and is deliberately silent.
    let waited = 0;
    while (waited < 2000 && game.snapshotFor(1).euc.crashed) {
      game.advance(10);
      waited += 10;
    }
    return {
      down,
      up: !game.snapshotFor(1).euc.crashed,
      playerUp: !game.snapshotFor(0).euc.crashed,
      chirps: game.snapshot().audio.played.recover - before,
    };
  });

  expect(recovered.down, 'the guest never came off').toBe(true);
  expect(recovered.up, 'the guest never got back on').toBe(true);
  expect(recovered.playerUp, 'the player fell over doing nothing').toBe(true);
  // Two cues per recovery — it is a two-tone chirp — and exactly one recovery.
  expect(recovered.chirps, 'the guest came back in silence').toBe(2);
  expect(errors).toEqual([]);
});

test('the pad’s B leaves the join panel, and takes the session with it', async ({ page }) => {
  // `handleMenuAction`'s own comment promised this — "a pad with no seat may
  // still press B to leave" — and the branch was never written, so a guest who
  // changed their mind was stuck on the panel with nothing but the mouse. Every
  // openable panel in this game has three doors: its Back button, Escape, and
  // the pad's B.
  const errors = collectErrors(page);
  await twoPads(page);
  await bootToCouchTitle(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);
  await openJoinPanel(page);

  // A pad that has taken a seat, so this also proves B is not swallowed by the
  // claim rule — only *confirm* is, and only while it would claim.
  await pulsePad(page, 0, PAD_A);
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'pad:0');

  await pulsePad(page, 0, PAD_B);
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');

  const back = await page.evaluate(() => ({
    seats: window.game.seatCount,
    devices: window.game.snapshot().input.devices,
    claiming: window.game.snapshot().input.claiming,
    views: window.game.renderer.viewCount,
    huds: document.querySelectorAll('.euc-hud-seat').length,
  }));
  expect(back.seats, 'the second seat outlived the panel').toBe(1);
  expect(back.devices, 'a claim outlived the panel').toEqual([null]);
  expect(back.claiming).toBe(false);
  expect(back.views, 'the screen stayed split').toBe(1);
  expect(back.huds).toBe(1);
  expect(errors).toEqual([]);
});

test('a touchscreen laptop is still offered a couch', async ({ page }) => {
  // **The hybrid machine §25.9 named, and the query was the wrong one.**
  // `(pointer: fine)` asks about the machine's *primary* pointer, so a laptop
  // with a touchscreen — coarse primary, fine trackpad — answered no and lost
  // the mode, which is exactly the case the plan says must not lose it. The
  // question the entrance wants is whether a precise pointer exists at all.
  //
  // Stubbed before the page's own script runs, because the real answer is the
  // host machine's and a spec cannot grow a touchscreen.
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    // **A hand-built list, not a spread of the real one.** A `MediaQueryList`
    // keeps `matches`, `addEventListener` and the rest on its prototype, so
    // `{ ...real(query) }` is an empty object with a `matches` bolted on — and
    // the game's own `addEventListener` on it throws before `window.game` ever
    // exists. A fake that is tidier than the API it stands in for is a lesson
    // this milestone has already learned once.
    const stub = (query: string, matches: boolean): MediaQueryList => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }) as unknown as MediaQueryList;
    window.matchMedia = ((query: string) => {
      // A touchscreen laptop: the finger is primary, the trackpad still exists.
      if (query === '(pointer: coarse)') return stub(query, true);
      if (query === '(pointer: fine)') return stub(query, false);
      if (query === '(any-pointer: fine)') return stub(query, true);
      return real(query);
    }) as typeof window.matchMedia;
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await bootToTitle(page);

  expect(
    await page.evaluate(() => window.game.snapshot().couch.available),
    'a touchscreen laptop was refused a couch it can host',
  ).toBe(true);
  await expect(page.locator('.euc-menu--title [data-menu="couch"]')).toBeVisible();

  // And the panel behind it works, because the entrance is only worth having
  // if what it opens does.
  await openJoinPanel(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.game.snapshot().input.devices[0] === 'keyboard');
  expect(errors).toEqual([]);
});

/**
 * The one place in the slice that is known to stop a wheel dead.
 *
 * `tests/m4.spec.ts` proves the plaza gateway is solid and more than 1.5 m
 * tall; this reuses the same two points, so the specs below are riding into a
 * wall the world has already been asserted to have rather than into whatever
 * happened to be in front of them. Both come back in the segment's own frame:
 * +X is the rider's left at a zero heading, matching `level/segments.ts`.
 */
async function plazaGateway(page: import('@playwright/test').Page, along: number): Promise<{
  x: number; z: number; headingY: number;
}> {
  return page.evaluate((s) => {
    const segment = window.game.levelPlan.segments.find((each) => each.id === 'plaza');
    if (segment === undefined) throw new Error('no plaza segment');
    const heading = segment.entry.headingY;
    const forward = { x: Math.sin(heading), z: Math.cos(heading) };
    const left = { x: Math.cos(heading), z: -Math.sin(heading) };
    return {
      x: segment.entry.position.x + forward.x * s + left.x * 6,
      z: segment.entry.position.z + forward.z * s + left.z * 6,
      headingY: heading,
    };
  }, along);
}

test('a guest hits the wall in front of them, whoever else is on the ground', async ({ page }) => {
  // **Three lines of wiring that a mutation check found unpinned**, all of the
  // same species and all producing the same silent bug: the guest rides into a
  // wall and hears nothing, for the rest of the session.
  //
  //   - the kerb-strike cue must be *addressed* (`impact(speed, seat)`), or the
  //     player's ragdoll gates the guest's collisions;
  //   - a respawn must forget that rider's crash, or a guest reset mid-ragdoll
  //     keeps a flag nothing will ever clear;
  //   - a dismissed seat must give its bookkeeping back, or the next guest
  //     inherits somebody else's crash.
  //
  // All three need one thing a spec could not do until now: stand the *guest*
  // in front of something solid. `placeRider` is addressed for that, and the
  // wall is the plaza gateway `tests/m4.spec.ts` already proves is there.
  const errors = collectErrors(page);
  await boot(page);

  const runUp = await plazaGateway(page, 14);
  const strikes = await page.evaluate(async (start) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();
    game.spawnSecondRider();

    /**
     * Ride the guest into the gateway from the run-up, and count what sounded.
     *
     * **Budgeted at 300 steps**, which is two and a half seconds and about
     * twice what the twenty-four metre run-up takes — and comfortably inside
     * the player's ragdoll, which is the window the second call has to land in.
     * An unbounded charge would quietly wait for the player to get up and then
     * measure nothing.
     */
    const chargeTheWall = (): number => {
      game.placeRider({ x: start.x, y: 0, z: start.z }, start.headingY, 1);
      const before = game.snapshot().audio.played.curb;
      for (let i = 0; i < 20; i += 1) {
        game.setActionsFor(1, { throttle: 1 });
        game.advance(15);
        if (game.snapshot().audio.played.curb > before) break;
      }
      game.setActionsFor(1, { throttle: 0 });
      return game.snapshot().audio.played.curb - before;
    };

    const clean = chargeTheWall();

    // Now the player goes down, and stays down while the guest charges again.
    let steps = 0;
    while (steps < 4000 && !game.snapshotFor(0).euc.crashed) {
      const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
      game.setActionsFor(0, { throttle: 1, steer: flip });
      game.advance(6);
      steps += 6;
    }
    game.setActionsFor(0, { throttle: 0, steer: 0 });
    const playerDown = game.snapshotFor(0).euc.crashed;
    const whileDown = chargeTheWall();
    const stillDown = game.snapshotFor(0).euc.crashed;

    return { clean, playerDown, whileDown, stillDown };
  }, runUp);

  expect(strikes.clean, 'the guest rode into a wall and it made no sound at all')
    .toBeGreaterThan(0);
  expect(strikes.playerDown, 'the player never fell').toBe(true);
  // Asserted *after* the charge, or a player who got up half-way through it
  // would leave this measuring an ordinary wall hit and passing for it.
  expect(strikes.stillDown, 'the player got up before the guest reached the wall').toBe(true);
  expect(strikes.whileDown, 'the player’s ragdoll silenced the guest’s wall')
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('a guest who is reset, or replaced, does not stay silent against walls', async ({ page }) => {
  // The two continuity ends, and the same silent failure at each: a guest
  // respawned mid-ragdoll, and a seat dismissed mid-ragdoll whose index is
  // handed to somebody else.
  const errors = collectErrors(page);
  await boot(page);
  const runUp = await plazaGateway(page, 14);

  const heard = await page.evaluate(async (start) => {
    const game = window.game;
    game.loop.setRunning(false);
    game.clearActions();

    const crashTheGuest = (): void => {
      let steps = 0;
      while (steps < 4000 && !game.snapshotFor(1).euc.crashed) {
        const flip = Math.floor(steps / 30) % 2 === 0 ? 1 : -1;
        game.setActionsFor(1, { throttle: 1, steer: flip });
        game.advance(6);
        steps += 6;
      }
      game.setActionsFor(1, { throttle: 0, steer: 0 });
    };

    const chargeTheWall = (): number => {
      game.placeRider({ x: start.x, y: 0, z: start.z }, start.headingY, 1);
      const before = game.snapshot().audio.played.curb;
      for (let i = 0; i < 20; i += 1) {
        game.setActionsFor(1, { throttle: 1 });
        game.advance(15);
        if (game.snapshot().audio.played.curb > before) break;
      }
      game.setActionsFor(1, { throttle: 0 });
      return game.snapshot().audio.played.curb - before;
    };

    // 1. Crash the guest, then put them straight back with the `R` a player
    //    actually presses rather than waiting the ragdoll out.
    //
    //    **The reset has to be the real one.** `resetRiderTo` clears
    //    `seat.wasCrashed`, which is what stops the next step's own falling
    //    edge from healing the audio layer — so `R` is the one door where the
    //    crash flag can be left behind, and a spec that teleported instead
    //    would be walking past it.
    game.spawnSecondRider();
    crashTheGuest();
    const crashedBeforeReset = game.snapshotFor(1).euc.crashed;
    game.setActionsFor(1, { reset: true });
    game.advance(4);
    game.setActionsFor(1, { reset: false });
    const afterReset = chargeTheWall();

    // 2. Crash the guest again and dismiss the seat while they are still down,
    //    then seat somebody new at the same index.
    crashTheGuest();
    const crashedBeforeSwap = game.snapshotFor(1).euc.crashed;
    game.despawnSecondRider();
    game.spawnSecondRider();
    const afterSwap = chargeTheWall();

    return { crashedBeforeReset, afterReset, crashedBeforeSwap, afterSwap };
  }, runUp);

  expect(heard.crashedBeforeReset, 'the guest never came off before the reset').toBe(true);
  expect(heard.afterReset, 'a guest respawned mid-ragdoll stayed silent against walls')
    .toBeGreaterThan(0);
  expect(heard.crashedBeforeSwap, 'the guest never came off before the swap').toBe(true);
  expect(heard.afterSwap, 'a new guest inherited the last one’s crash')
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/**
 * **The pad's cursor has to be drawn, because no browser will draw it for us**
 * — M25 Phase 5 QA, from an Ubuntu Firefox report.
 *
 * The owner could walk the menus with a controller and reach the right screen
 * — "down once then A in pause took me to New route" — while the screen showed
 * him nothing at all. Focus was moving; the ring was not following.
 *
 * `:focus-visible` is the browser guessing whether the human is navigating by
 * *key*. A gamepad presses none, so the guess is only ever inherited: Chrome
 * re-arms it on any keydown at all, Firefox only on a focus-moving Tab. The
 * first mouse click on a menu button clears it, and from that moment a pad
 * walks an invisible cursor for the rest of the session.
 *
 * **This is not a Firefox bug, which is why it is asserted here.** The suite
 * runs Chromium, and the sequence below failed in Chromium too before the fix
 * — the engine difference only decides how likely a player is to stumble into
 * a keypress that hides it again. Asserting the *painted* outline rather than
 * `document.activeElement` is the whole point: every existing focus assertion
 * in this file (and in m9, and m24) reads which element has focus, and all of
 * them stayed green through a bug whose entire content is that you cannot see
 * which element has focus.
 */
test('a pad that walks the menus draws a cursor, even after a mouse click', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootToCouchTitle(page);

  const ringOnFocus = () => page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return { on: null as string | null, ring: false };
    const style = getComputedStyle(active);
    return {
      on: active.dataset.menu ?? active.tagName,
      // A real ring is a style *and* a width — `outline-style: none` still
      // reports the inherited colour, so colour alone would pass on nothing.
      ring: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
    };
  });

  // **A genuine pointer click on a menu button, and then not one keystroke.**
  // Both halves are the experiment. It has to be a *button*, because that is
  // what moves the browser's modality from keyboard to pointer — clicking bare
  // panel background leaves an earlier keyboard arrival standing and the ring
  // with it. And nothing may press a key afterwards, because Chrome re-arms
  // `:focus-visible` on any keydown at all: a spec that so much as presses
  // Escape on its way to a menu hands the ring back by accident and then
  // passes against a completely broken build.
  await page.locator('.euc-menu--title [data-menu="settings"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.menu === 'settings');

  // Now the pad walks, exactly as the owner did — no keyboard anywhere.
  await pulsePad(page, 0, PAD_DPAD_DOWN);
  const walked = await ringOnFocus();
  expect(walked.on, 'the pad moved focus').not.toBeNull();
  expect(walked.ring, 'the control the pad walked onto is drawn').toBe(true);

  await pulsePad(page, 0, PAD_DPAD_DOWN);
  const walkedAgain = await ringOnFocus();
  expect(walkedAgain.on, 'and it kept moving').not.toBe(walked.on);
  expect(walkedAgain.ring, 'the cursor followed it').toBe(true);

  // Exactly one, so the cursor moves rather than accumulating a trail.
  expect(
    await page.evaluate(() => document.querySelectorAll('[data-pad-cursor]').length),
    'exactly one control carries the pad cursor',
  ).toBe(1);

  // **And it hands back.** A ring that outlived the pad would light a second
  // cursor the moment somebody reached for the mouse. Panel background is the
  // right target here and a button would be the wrong one: this half is about
  // `onClick`'s own release, which any real pointer press must trigger — not
  // about the browser's modality, which is what the button click above was
  // needed for.
  const panel = page.locator('.euc-menu--settings .euc-menu__panel');
  const box = await panel.boundingBox();
  expect(box, 'the settings panel is on screen').not.toBeNull();
  await page.mouse.click(box!.x + 6, box!.y + 6);
  expect(
    await page.evaluate(() => document.querySelectorAll('[data-pad-cursor]').length),
    'a pointer click takes the pad cursor away',
  ).toBe(0);

  expect(errors).toEqual([]);
});

/**
 * **The keyboard is not a third player** — M25 Phase 5 QA, from the owner's
 * couch with two controllers plugged in.
 *
 * *"Noticed that if I touched the keyboard it allowed me to control player 1
 * as well."* `sinkForPad` had refused this for pads since Phase 4, in those
 * words — "an unclaimed pad in a couch session drives nobody, because the
 * alternative is a spectator's controller steering a player" — and the
 * keyboard was simply never given the same rule. Same species as the four
 * defects Phase 4's own QA pass found: something made plural everywhere except
 * one place.
 *
 * The second half is the harder half and the reason the rule was awkward to
 * apply. Pause and mute ride through the same `ActionState` as the throttle,
 * so the obvious fix — point the spectating keyboard at nothing — takes Escape
 * away from a room where the only other way to pause is a pad two people are
 * holding. A couch you cannot stop is worse than a couch that steers wrong.
 */
test('a keyboard holding no seat steers nobody, and still pauses', async ({ page }) => {
  const errors = collectErrors(page);
  await twoPads(page);
  await bootTwoRiders(page);
  await page.waitForFunction(() => window.game.snapshot().input.pads === 2);

  await openClaims(page);
  await pulsePad(page, 0, PAD_A);
  await pulsePad(page, 1, PAD_START);
  await page.evaluate(() => window.game.endClaiming());
  expect(await page.evaluate(() => window.game.snapshot().input.devices))
    .toEqual(['pad:0', 'pad:1']);

  // Both riders are on pads. Now lean on the keyboard, exactly as somebody
  // sharing a desk with two players does.
  await page.evaluate(() => window.game.loop.setRunning(true));
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  const drifted = await page.evaluate(async () => {
    const game = window.game;
    const before = game.snapshotFor(0).euc.distanceTravelled;
    await new Promise<void>((resolve) => {
      let frames = 0;
      const tick = (): void => {
        frames += 1;
        if (frames > 90) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return {
      moved: game.snapshotFor(0).euc.distanceTravelled - before,
      throttle: game.snapshotFor(0).actions.throttle,
      guest: game.snapshotFor(1).euc.distanceTravelled,
    };
  });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');

  expect(drifted.throttle, 'the keys never reached Player 1').toBe(0);
  expect(drifted.moved, 'so Player 1 stayed where their pad left them')
    .toBeLessThan(0.05);

  // **And the machine's keys still work.** This is the half a naive fix loses.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.game.snapshot().app.menu === 'pause');
  expect(await page.evaluate(() => window.game.snapshot().app.menu)).toBe('pause');

  expect(errors).toEqual([]);
});
