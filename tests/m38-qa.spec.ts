/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { TRICK_RUN } from '../src/data/tuning.ts';
import { trickZoneAt, type TrickZone } from '../src/level/trickZones.ts';
import { boot, bootToTitle, collectErrors } from './harness.ts';

/**
 * M38 Phase 5 — independent QA's own browser probes.
 *
 * Deliberately **not** a replay of `tests/m38.spec.ts`. Everything here is a
 * seam that file does not press: the quick reset mid-flight, seat 0's
 * `worldReset` early return racing a guest's landing on the same step, the
 * blur and pad-loss freeze, leaving by the results card's own Back, and the
 * raw storage namespace after a couch run.
 */
test.beforeEach(() => {
  test.slow();
});

const PARK = 'level=switchback';
const TITLE_ENTRY = '.euc-menu--title [data-menu="trick-run"]';

function runState(page: Page) {
  return page.evaluate(() => {
    const snap = window.game.snapshot();
    return {
      state: snap.app.state,
      phase: snap.trickRun.phase,
      elapsedSteps: snap.trickRun.elapsedSteps,
      remainingSteps: snap.trickRun.remainingSteps,
      completed: snap.trickRun.completed,
      wasRecord: snap.trickRun.wasRecord,
      eligible: snap.trickRun.eligible,
      scores: snap.trickRun.seats.map((seat) => seat.score),
      crashes: snap.trickRun.seats.map((seat) => seat.crashes),
      hops: snap.trickRun.seats.map((seat) => seat.tally.chargedHops),
      world: snap.world.levelId,
    };
  });
}

async function armFromTitle(page: Page): Promise<void> {
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  await page.evaluate(() => window.game.loop.setRunning(false));
}

// ---------------------------------------------------------------------------
// The quick reset, mid-flight
// ---------------------------------------------------------------------------

test('QA: a quick reset in mid-air discards the flight, is not a crash, and never stops the clock', async ({ page }) => {
  const errors = collectErrors(page);
  await armFromTitle(page);

  const trace = await page.evaluate(() => {
    const game = window.game;
    // A charged hop, then `R` while the wheel is still off the ground.
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    let air = 0;
    while (air < 60 && game.snapshotFor(0).euc.grounded) {
      game.advance(1);
      air += 1;
    }
    const airborne = !game.snapshotFor(0).euc.grounded;
    const before = game.snapshot().trickRun.elapsedSteps;
    game.setActionsFor(0, { throttle: 0, reset: true });
    game.advance(1);
    game.setActionsFor(0, { throttle: 0, reset: false });
    game.advance(180);
    const snap = game.snapshot();
    return {
      airborne,
      before,
      after: snap.trickRun.elapsedSteps,
      state: snap.app.state,
      score: snap.trickRun.seats[0].score,
      crashes: snap.trickRun.seats[0].crashes,
      hops: snap.trickRun.seats[0].tally.chargedHops,
      eligible: snap.trickRun.eligible,
    };
  });

  expect(trace.airborne, 'the rider was not in the air when R landed').toBe(true);
  // The clock does not pause, restart or skip the reset step.
  expect(trace.after, 'the reset stopped or restarted the run clock').toBe(trace.before + 181);
  expect(trace.state).toBe('trickRun');
  expect(trace.score, 'a discarded flight banked points').toBe(0);
  expect(trace.crashes, 'a quick reset was counted as a crash').toBe(0);
  expect(trace.hops, 'the observer lost the launch it counted').toBe(1);
  // §38.5: an ordinary player reset keeps the run eligible.
  expect(trace.eligible, 'a quick reset disqualified the attempt').toBe(true);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Seat 0's `worldReset` early return, against a guest's landing
// ---------------------------------------------------------------------------

async function fakePads(page: Page, count: number): Promise<void> {
  await page.addInitScript((wanted) => {
    const pads = Array.from({ length: wanted }, (_unused, index) => ({
      index,
      id: `fake standard pad ${index}`,
      connected: true,
      mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    }));
    (window as unknown as { fakePads: typeof pads }).fakePads = pads;
    navigator.getGamepads = () => pads.map((pad) => (pad.connected ? pad : null)) as never;
  }, count);
}

test('QA: seat 0 pressing R cannot strand a guest’s facts, skip the clock, or defer their award', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  // Two seats, armed through the real bridge entrance (the doors themselves
  // are `m38.spec.ts`'s subject; this one is about the fixed step).
  await page.evaluate(() => {
    window.game.spawnRider();
    window.game.startTrickRun();
    window.game.loop.setRunning(false);
  });
  expect((await runState(page)).scores.length).toBe(2);

  const trace = await page.evaluate(() => {
    const game = window.game;
    // Seat 1 charges and hops; seat 0 stands still.
    game.setActionsFor(0, { throttle: 0 });
    game.setActionsFor(1, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(1, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(1, { throttle: 0, crouch: false, hop: false });
    // Step one at a time until the guest's touchdown is the *next* step, then
    // press `R` on seat 0 for exactly that step.
    let takeoff = 0;
    while (takeoff < 60 && game.snapshotFor(1).euc.grounded) {
      game.advance(1);
      takeoff += 1;
    }
    const launched = !game.snapshotFor(1).euc.grounded;
    let steps = 0;
    let pressedAt = -1;
    let elapsedBefore = -1;
    while (steps < 240) {
      const airborne = !game.snapshotFor(1).euc.grounded;
      const height = game.snapshotFor(1).euc.airHeight;
      const falling = game.snapshotFor(1).euc.verticalVelocity < 0;
      if (airborne && falling && height < 0.05 && pressedAt < 0) {
        elapsedBefore = game.snapshot().trickRun.elapsedSteps;
        game.setActionsFor(0, { throttle: 0, reset: true });
        pressedAt = steps;
      } else {
        game.setActionsFor(0, { throttle: 0, reset: false });
      }
      game.advance(1);
      steps += 1;
      if (pressedAt >= 0 && steps > pressedAt + 4) break;
    }
    game.setActionsFor(0, { throttle: 0, reset: false });
    const snap = game.snapshot();
    return {
      launched,
      pressedAt,
      elapsedBefore,
      elapsed: snap.trickRun.elapsedSteps,
      steps,
      guestScore: snap.trickRun.seats[1].score,
      guestHops: snap.trickRun.seats[1].tally.chargedHops,
      hostScore: snap.trickRun.seats[0].score,
      hostCrashes: snap.trickRun.seats[0].crashes,
    };
  });

  expect(trace.launched, 'the guest never left the ground').toBe(true);
  expect(trace.pressedAt, 'the guest never reached a landing to race').toBeGreaterThanOrEqual(0);
  // **The clock ran on every step, including seat 0's reset step.**
  expect(trace.elapsed - trace.elapsedBefore, 'the host’s R skipped the room’s clock')
    .toBe(trace.steps - trace.pressedAt);
  expect(trace.guestHops, 'the guest’s flight was never opened').toBe(1);
  expect(trace.guestScore, 'the guest’s landing was lost or deferred by the host’s R')
    .toBeGreaterThan(0);
  expect(trace.hostScore).toBe(0);
  expect(trace.hostCrashes, 'a respawn was counted as a crash').toBe(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Blur and controller loss
// ---------------------------------------------------------------------------

test('QA: a blur mid-flight releases the keys without inventing a landing or a second clock', async ({ page }) => {
  const errors = collectErrors(page);
  await armFromTitle(page);

  const trace = await page.evaluate(() => {
    const game = window.game;
    // Launch, then blur the window while the wheel is still in the air.
    game.setActionsFor(0, { throttle: 0.6, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0.6, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0.6, crouch: false, hop: false });
    let air = 0;
    while (air < 60 && game.snapshotFor(0).euc.grounded) {
      game.advance(1);
      air += 1;
    }
    const airborne = !game.snapshotFor(0).euc.grounded;
    const before = game.snapshot();
    window.dispatchEvent(new Event('blur'));
    game.advance(1);
    const atDoor = game.snapshot();
    game.advance(240);
    const after = game.snapshot();
    return {
      airborne,
      beforeElapsed: before.trickRun.elapsedSteps,
      doorElapsed: atDoor.trickRun.elapsedSteps,
      afterElapsed: after.trickRun.elapsedSteps,
      beforeScore: before.trickRun.seats[0].score,
      doorScore: atDoor.trickRun.seats[0].score,
      crashes: after.trickRun.seats[0].crashes,
      phase: after.trickRun.phase,
      state: after.app.state,
    };
  });

  expect(trace.airborne, 'the rider was not in the air when the blur landed').toBe(true);
  // **One step is one step.** A blur must not deliver an extra tick of the
  // shared clock, and it must not mint a landing out of the released keys.
  expect(trace.doorElapsed, 'the blur cost or added a step')
    .toBe(trace.beforeElapsed + 1);
  expect(trace.doorScore, 'a blur banked something').toBe(trace.beforeScore);
  expect(trace.afterElapsed, 'the clock ran twice after the blur')
    .toBe(trace.doorElapsed + 240);
  expect(trace.phase).toBe('running');
  expect(trace.state).toBe('trickRun');
  expect(errors).toEqual([]);
});

test('QA: losing a pad mid-run leaves one attempt, one clock and no fabricated award', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.advance(300);
  });
  const before = await runState(page);

  const dropped = await page.evaluate(async () => {
    type Pads = { connected: boolean; index: number }[];
    const pads = (window as unknown as { fakePads: Pads }).fakePads;
    pads[0].connected = false;
    // A real `GamepadEvent` carries the pad it is about; the layer reads its
    // index, so a bare `Event` would be a test artefact rather than a probe.
    const gone = new Event('gamepaddisconnected');
    Object.defineProperty(gone, 'gamepad', { value: pads[0] });
    window.dispatchEvent(gone);
    await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    window.game.loop.setRunning(false);
    window.game.advance(120);
    const snap = window.game.snapshot();
    return {
      phase: snap.trickRun.phase,
      elapsed: snap.trickRun.elapsedSteps,
      score: snap.trickRun.seats[0].score,
      seats: snap.trickRun.seats.length,
    };
  });
  expect(dropped.phase, 'losing a pad abandoned the attempt').toBe('running');
  expect(dropped.seats, 'losing a pad changed the room’s book count').toBe(1);
  expect(dropped.score, 'a disconnect banked something').toBe(before.scores[0]);

  // And the pad coming back does not start a second clock or a second attempt.
  const reclaimed = await page.evaluate(async () => {
    type Pads = { connected: boolean; index: number }[];
    const pads = (window as unknown as { fakePads: Pads }).fakePads;
    pads[0].connected = true;
    const back = new Event('gamepadconnected');
    Object.defineProperty(back, 'gamepad', { value: pads[0] });
    window.dispatchEvent(back);
    await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    window.game.loop.setRunning(false);
    const at = window.game.snapshot().trickRun.elapsedSteps;
    window.game.advance(100);
    const snap = window.game.snapshot();
    return { at, elapsed: snap.trickRun.elapsedSteps, phase: snap.trickRun.phase, seats: snap.trickRun.seats.length };
  });
  expect(reclaimed.phase).toBe('running');
  expect(reclaimed.seats).toBe(1);
  expect(reclaimed.elapsed - reclaimed.at, 'the reclaim left a second clock running')
    .toBe(100);
  expect(reclaimed.at, 'the reclaim rewound or restarted the clock')
    .toBeGreaterThanOrEqual(dropped.elapsed);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Leaving by the card's own Back
// ---------------------------------------------------------------------------

test('QA: Back to title from the Trick Run card leaves no referee and no stranded card', async ({ page }) => {
  const errors = collectErrors(page);
  await armFromTitle(page);
  await page.evaluate(() => {
    const game = window.game;
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });
  expect((await runState(page)).state).toBe('results');

  await page.locator('.euc-menu--results [data-menu="results-title"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'title');
  const home = await runState(page);
  expect(home.phase, 'a referee survived the trip to the title').toBe('idle');
  expect(home.scores.length, 'a book survived the trip to the title').toBe(0);

  // And the next mode does not inherit the card.
  await page.locator('.euc-menu--title [data-menu="start"]').click();
  await page.waitForFunction(() => window.game.snapshot().app.state === 'freeRide');
  expect((await runState(page)).phase).toBe('idle');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

test('QA: a couch run writes nothing into the tricks namespace, and a hostile row cannot survive a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());

  const keyed = await page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.includes('trick')) keys.push(key);
    }
    return keys;
  });

  await page.evaluate(() => {
    window.game.spawnRider();
    window.game.startTrickRun();
    window.game.loop.setRunning(false);
    const game = window.game;
    for (const seat of [0, 1]) game.setActionsFor(seat, { throttle: 0, crouch: true });
    game.advance(60);
    for (const seat of [0, 1]) game.setActionsFor(seat, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    for (const seat of [0, 1]) game.setActionsFor(seat, { throttle: 0, crouch: false, hop: false });
    game.advance(200);
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });

  const couchDone = await runState(page);
  expect(couchDone.state).toBe('results');
  expect(couchDone.scores[0], 'seat 0 scored nothing on the couch run').toBeGreaterThan(0);
  expect(couchDone.wasRecord).toBe(false);

  const written = await page.evaluate(() => {
    const found: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.includes('trick')) found[key] = localStorage.getItem(key) ?? '';
    }
    return found;
  });
  for (const [key, value] of Object.entries(written)) {
    expect(value, `a couch run wrote a score into ${key}`).not.toMatch(/"score"\s*:\s*[1-9]/);
  }
  expect(keyed.length).toBeGreaterThanOrEqual(0);

  // A hand-edited hostile row is dropped on the way back in, and the store
  // still answers rather than handing a function to the results screen.
  const namespaced = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null && key.endsWith('tricks')) return key;
    }
    return null;
  });
  expect(namespaced, 'the tricks namespace was never written at all').not.toBeNull();
  await page.evaluate((key) => {
    localStorage.setItem(key as string, JSON.stringify({
      routes: {
        __proto__: { levelId: '__proto__', score: 9, durationSteps: 1, rulesRevision: 'x', setAt: 'x' },
        constructor: { levelId: 'constructor', score: 9, durationSteps: 1, rulesRevision: 'x', setAt: 'x' },
        switchback: { levelId: 'switchback', score: '999', durationSteps: 1, rulesRevision: 'x', setAt: 'x' },
      },
    }));
  }, namespaced);

  await boot(page, PARK);
  const survived = await page.evaluate(() => {
    const game = window.game;
    return {
      switchback: game.trickRecords.best('switchback'),
      hostile: game.trickRecords.best('constructor'),
      proto: Object.getPrototypeOf(game.trickRecords.current.routes) === null,
    };
  });
  expect(survived.switchback, 'a string score survived coercion').toBe(null);
  expect(survived.hostile, 'a reserved key survived coercion').toBe(null);
  expect(survived.proto, 'the route map is not null-prototype').toBe(true);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// The generic diagnostic switch still works, and still refuses a record
// ---------------------------------------------------------------------------

test('QA: ?mph=50 is an ordinary diagnostic — it applies, and it files nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, `${PARK}&mph=50`);
  await page.evaluate(() => window.game.clearRecords());
  // The generic switch still reaches the wheel: `applyTopSpeedPreset` writes
  // the preset through live tuning, exactly as it does for any other value.
  const overrides = await page.evaluate(() => window.game.snapshot().tuning.overrides);
  expect(Object.keys(overrides), 'the generic switch stopped accepting 50')
    .toContain('EUC.dragCoefficient');

  await page.locator(TITLE_ENTRY).click();
  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(200);
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });
  const done = await runState(page);
  expect(done.state).toBe('results');
  expect(done.scores[0]).toBeGreaterThan(0);
  expect(done.wasRecord, 'a diagnostic run filed a best').toBe(false);
  const stored = await page.evaluate(() => window.game.trickRecords.best(window.game.levelPlan.id));
  expect(stored, 'a diagnostic run reached the store').toBe(null);
  const notes = await page.locator('[data-menu="results-notes"] li').allTextContents();
  expect(notes.some((note) => note.toLowerCase().includes('no best')), notes.join(' | ')).toBe(true);
  expect(TRICK_RUN.durationSteps).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('QA: a hazard-probe session refuses to file, on the probe predicate alone', async ({ page }) => {
  /*
   * **The one diagnostic that leaves live tuning clean.** `?mph=` reaches the
   * wheel through `applyTopSpeedPreset`, which writes live tuning — so an
   * `?mph=` run is *also* disqualified by §38.5's eligibility latch, and a
   * spec built on it cannot tell the two refusals apart. A hazard probe writes
   * no tuning at all: it is `Game.probing` or nothing, which is what makes this
   * the case that holds that clause up.
   */
  const errors = collectErrors(page);
  await bootToTitle(page, `${PARK}&hazardprobe=30`);
  await page.evaluate(() => window.game.clearRecords());
  await page.locator(TITLE_ENTRY).click();
  const armed = await runState(page);
  expect(armed.state).toBe('trickRun');
  expect(armed.eligible, 'a hazard probe moved the tuning latch').toBe(true);

  await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(200);
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });
  const done = await runState(page);
  expect(done.completed).toBe(true);
  expect(done.scores[0], 'the probe run scored nothing to file').toBeGreaterThan(0);
  expect(done.wasRecord, 'a probe session filed a best').toBe(false);
  expect(await page.evaluate(() => window.game.trickRecords.best(window.game.levelPlan.id)))
    .toBe(null);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Four-seat identity, in the DOM the players are looking at
// ---------------------------------------------------------------------------

test('QA: each pane’s lane shows its own seat’s numbers, not the host’s', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 3);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.evaluate(() => {
    const game = window.game;
    game.spawnRider();
    game.spawnRider();
    game.spawnRider();
    game.startTrickRun();
    game.loop.setRunning(false);
  });
  expect((await runState(page)).scores.length).toBe(4);

  // **Only seat 2 hops.** Every other pane must read zero, and seat 2's own
  // pane must be the one showing the award.
  await page.evaluate(() => {
    const game = window.game;
    game.setActionsFor(2, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(2, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(2, { throttle: 0, crouch: false, hop: false });
    game.advance(150);
  });

  const referee = await runState(page);
  expect(referee.scores[2], 'seat 2 never landed the hop').toBeGreaterThan(0);
  for (const seat of [0, 1, 3]) {
    expect(referee.scores[seat], `seat ${seat} scored seat 2's flight`).toBe(0);
  }

  const lanes = await page.evaluate(() => {
    const panes = [...document.querySelectorAll('.euc-hud-seat')];
    return panes.map((pane) => ({
      value: pane.querySelector('[data-hud="score-value"]')?.textContent ?? '',
      award: pane.querySelector('[data-hud="trick-award-points"]')?.textContent ?? '',
      awardHidden: (pane.querySelector('[data-hud="trick-award"]') as HTMLElement | null)?.hidden
        ?? true,
    }));
  });
  expect(lanes.length, 'a seat lost its pane').toBe(4);
  // Every pane names its own seat's banked total.
  for (let seat = 0; seat < 4; seat += 1) {
    expect(lanes[seat].value, `pane ${seat} does not carry seat ${seat}'s score`)
      .toContain(`${referee.scores[seat]}`);
  }
  expect(lanes[2].awardHidden, 'seat 2’s own award line is not drawn').toBe(false);
  for (const seat of [0, 1, 3]) {
    expect(lanes[seat].awardHidden, `pane ${seat} borrowed seat 2's award line`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('QA: Play next to the race and back to the Trick Run keeps every claim', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 2);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.evaluate(() => {
    const game = window.game;
    game.spawnRider();
    game.spawnRider();
    game.startTrickRun();
    game.loop.setRunning(false);
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
  });
  expect((await runState(page)).state).toBe('results');
  const claims = await page.evaluate(() => window.game.snapshot().input.devices.length);
  expect(claims).toBe(3);

  // **Out to the race**, which is the couch ride that also changes the world.
  await page.locator('[data-menu="results-couch"] [data-couch-mode="race"]').click();
  await page.evaluate(() => window.game.loop.setRunning(false));
  const raced = await page.evaluate(() => {
    window.game.advance(4);
    const snap = window.game.snapshot();
    const lanes = [...document.querySelectorAll('.euc-hud-seat')].map((pane) => {
      const lane = pane.querySelector('.euc-hud__trick') as HTMLElement | null;
      return lane === null ? true : lane.hidden;
    });
    return {
      state: snap.app.state,
      trick: snap.trickRun.phase,
      race: snap.race.phase,
      devices: snap.input.devices.length,
      world: snap.world.levelId,
      lanes,
    };
  });
  expect(raced.state, 'Play next did not reach the race').toBe('trackDay');
  /*
   * **Phase 5's repair.** Switchback carries a lap, so the race keeps the park
   * — which means `enterTrackDay` reaches its own referee without ever calling
   * `installLevel`, the one place that used to abandon the attempt. The run
   * survived into the race and every pane kept drawing its Trick Run lane over
   * the race's own HUD.
   */
  expect(raced.trick, 'a trick referee survived Play next to the race').toBe('idle');
  expect(raced.race, 'Play next did not arm the race').not.toBe('idle');
  expect(raced.world, 'the race left the park it was offered on').toBe('switchback');
  expect(raced.lanes, 'a Trick Run lane is drawn over the race HUD')
    .toEqual(raced.lanes.map(() => true));
  expect(raced.devices, 'the room lost a claim leaving for the race').toBe(3);

  // **And back to the Trick Run**, which has to bring the park with it again.
  // Past the race's own countdown first: a seat cannot pause it (§27), so an
  // Escape thrown at the lights is swallowed and the wait below would be a
  // wait for nothing.
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.advance(600);
    window.game.loop.setRunning(true);
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.game.advance(2));
  await page.waitForFunction(() => window.game.snapshot().app.state === 'paused');
  await page.locator('.euc-menu--pause [data-couch-mode="trickRun"]').click();
  await page.evaluate(() => window.game.loop.setRunning(false));
  const back = await page.evaluate(() => {
    const snap = window.game.snapshot();
    return {
      state: snap.app.state,
      phase: snap.trickRun.phase,
      seats: snap.trickRun.seats.length,
      devices: snap.input.devices.length,
      world: snap.world.levelId,
      race: snap.race.phase,
    };
  });
  expect(back.state, 'the pause card’s mode switch did not reach the run').toBe('trickRun');
  expect(back.phase).toBe('running');
  expect(back.world, 'coming back did not bring the park').toBe('switchback');
  expect(back.seats, 'the referee was re-armed for the wrong room').toBe(3);
  expect(back.devices, 'the room lost a claim coming back').toBe(3);
  expect(back.race, 'a race referee survived the switch to a trick run').toBe('idle');
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// q189 — the point the composition root hands the referee
//
// `m38.spec.ts` proves the rule with two STANDING hops, one on a feature and
// one off it. A standing rider's contact patch and airborne pose are the same
// XZ, so that experiment cannot tell the two apart — and the whole of
// `Game.ts`'s q189 comment is that they are not the same thing. These probes
// ride ACROSS a zone boundary, so the last grounded contact and the takeoff
// step's pose fall on opposite sides of it, and then ask which one the award
// agrees with.
// ---------------------------------------------------------------------------

/** The park's zones, as the running game carries them. */
function zonesOf(page: Page): Promise<TrickZone[]> {
  return page.evaluate(() => (window.game.levelPlan.trickZones ?? []).map((zone) => ({
    id: zone.id,
    corners: zone.corners.map((corner) => ({ x: corner.x, z: corner.z })),
  }))) as Promise<TrickZone[]>;
}

interface ZoneFrame {
  readonly id: string;
  /** The zone's near corner and its unit vectors along and across. */
  readonly x0: number;
  readonly z0: number;
  readonly ux: number;
  readonly uz: number;
  readonly vx: number;
  readonly vz: number;
  readonly length: number;
  readonly width: number;
}

/** One zone as the `(along, across)` frame its corners describe. */
async function zoneFrame(page: Page, id: string): Promise<ZoneFrame> {
  const corners = await page.evaluate((wanted) => {
    const zone = (window.game.levelPlan.trickZones ?? []).find((each) => each.id === wanted);
    if (zone === undefined) throw new Error(`no "${wanted}" zone`);
    return zone.corners.map((corner) => ({ x: corner.x, z: corner.z }));
  }, id);
  const [a, b, , d] = corners;
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const width = Math.hypot(d.x - a.x, d.z - a.z);
  return {
    id,
    x0: a.x,
    z0: a.z,
    ux: (b.x - a.x) / length,
    uz: (b.z - a.z) / length,
    vx: (d.x - a.x) / width,
    vz: (d.z - a.z) / width,
    length,
    width,
  };
}

interface CrossingAttempt {
  /** Along-distance of the last grounded contact and of the takeoff pose. */
  readonly alongContact: number;
  readonly alongTakeoff: number;
  readonly contact: { readonly x: number; readonly z: number };
  readonly takeoff: { readonly x: number; readonly z: number };
  readonly stepTravel: number;
  readonly zone: string | null;
  readonly kinds: string[];
  readonly landed: boolean;
}

/**
 * Ride at a boundary and hop across it, reporting both points.
 *
 * `pressRemaining` is how far short of `boundary` the hop is pressed; the
 * caller calibrates it, because the press-to-launch distance depends on the
 * speed the run-up reached and this file refuses to hard-code it.
 */
async function hopAcross(
  page: Page,
  frame: ZoneFrame,
  boundary: number,
  startBack: number,
  pressRemaining: number,
): Promise<CrossingAttempt> {
  return page.evaluate((input) => {
    const { frame: f, boundary: edge, startBack: back, pressRemaining: press } = input;
    const game = window.game;
    game.setAppState('title');
    game.startTrickRun();
    game.loop.setRunning(false);

    const along = (x: number, z: number) => (x - f.x0) * f.ux + (z - f.z0) * f.uz;
    const startAlong = edge - back;
    // Half the corridor's own half-width out, which is the technical line's
    // side of it — the zone's `across` axis points away from the bypass.
    const across = f.width * 0.5;
    const x = f.x0 + f.ux * startAlong + f.vx * across;
    const z = f.z0 + f.uz * startAlong + f.vz * across;
    const ground = game.sampleGround(x, z);
    game.placeRider({ x, y: ground.height, z }, Math.atan2(f.ux, f.uz));
    game.advance(8);

    game.setActionsFor(0, { throttle: 1, crouch: true });
    let contact = { x, z };
    let previous = { x, z };
    let takeoff: { x: number; z: number } | null = null;
    let pressed = false;
    for (let guard = 0; guard < 1500 && takeoff === null; guard += 1) {
      const here = game.snapshotFor(0).euc.position;
      if (!pressed && edge - along(here.x, here.z) <= press) {
        game.setActionsFor(0, { throttle: 1, crouch: true, hop: true });
        pressed = true;
      }
      game.advance(1);
      const now = game.snapshotFor(0);
      const spot = { x: now.euc.position.x, z: now.euc.position.z };
      if (now.euc.grounded) {
        previous = contact;
        contact = spot;
      } else if (pressed) {
        takeoff = spot;
      }
      if (!pressed && along(spot.x, spot.z) > edge + 40) break;
    }
    game.setActionsFor(0, { throttle: 1, crouch: false, hop: false });
    game.advance(160);

    const seat = game.snapshot().trickRun.seats[0];
    const landing = takeoff ?? contact;
    return {
      alongContact: along(contact.x, contact.z),
      alongTakeoff: along(landing.x, landing.z),
      contact,
      takeoff: landing,
      stepTravel: Math.hypot(contact.x - previous.x, contact.z - previous.z),
      zone: seat.lastAward === null ? null : seat.lastAward.zone,
      kinds: seat.lastAward === null ? [] : [...seat.lastAward.kinds],
      landed: seat.lastAward !== null,
    };
  }, { frame, boundary, startBack, pressRemaining }) as Promise<CrossingAttempt>;
}

/**
 * Search press timings until the contact and the takeoff pose straddle
 * `boundary`, which is the only arrangement that can tell them apart.
 *
 * One calibration ride measures the press-to-launch distance, then the aim is
 * nudged by fractions of a step until the launch lands on the straddling step.
 * Every attempt is returned, because the invariant below holds on all of them.
 */
async function straddle(
  page: Page,
  frame: ZoneFrame,
  boundary: number,
  startBack: number,
): Promise<{ attempts: CrossingAttempt[]; straddled: CrossingAttempt | null }> {
  const attempts: CrossingAttempt[] = [];
  let aim = 4;
  for (let tries = 0; tries < 10; tries += 1) {
    const attempt = await hopAcross(page, frame, boundary, startBack, aim);
    attempts.push(attempt);
    if (!attempt.landed) break;
    if (attempt.alongContact <= boundary && attempt.alongTakeoff > boundary) {
      return { attempts, straddled: attempt };
    }
    // The press-to-launch distance this ride actually spent, then aim the
    // launch at half a step short of the boundary.
    const spent = attempt.alongContact - (boundary - aim);
    const half = Math.max(0.01, attempt.stepTravel * 0.5);
    const next = spent + half * (tries % 2 === 0 ? 1 : 1.5);
    if (!Number.isFinite(next) || next <= 0) break;
    aim = next;
  }
  return { attempts, straddled: null };
}

test('QA: the award follows the last grounded contact, not the takeoff step’s pose', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  const zones = await zonesOf(page);
  const frame = await zoneFrame(page, 'kicker');

  // **Arriving.** The rider rolls up the trail in front of the kicker and hops
  // across its near boundary: the last grounded contact is still short of the
  // zone and the takeoff step's pose is already inside it. This is the
  // direction that matters — reading the airborne pose here would PAY a flight
  // that launched from open ground, which is the whole of what q189 refuses.
  //
  // The two points are one fixed step apart, so the arrangement has to be
  // searched for rather than assumed; `straddle` calibrates the press.
  const arriving = await straddle(page, frame, 0, 26);
  expect(arriving.attempts.length, 'no ride reached the kicker at all').toBeGreaterThan(0);

  // The invariant, on every ride the search made — the ones that straddled and
  // the ones that did not: the award names the zone under the CONTACT PATCH,
  // whatever the pose one step later was standing over.
  for (const attempt of arriving.attempts) {
    if (!attempt.landed) continue;
    expect(
      attempt.zone,
      `an award disagreed with the contact patch at ${attempt.alongContact.toFixed(3)} m`,
    ).toBe(trickZoneAt(zones, attempt.contact.x, attempt.contact.z));
  }

  expect(arriving.straddled, 'no ride straddled the kicker’s near boundary').not.toBeNull();
  const into = arriving.straddled!;
  expect(into.alongContact, 'the contact was not short of the zone').toBeLessThanOrEqual(0);
  expect(into.alongTakeoff, 'the takeoff pose was not inside the zone').toBeGreaterThan(0);
  expect(trickZoneAt(zones, into.takeoff.x, into.takeoff.z), 'the takeoff pose was not on the kicker')
    .toBe('kicker');
  expect(into.zone, 'a flight launched in front of the kicker claimed it').toBeNull();

  expect(errors).toEqual([]);
});

test('QA: a quick reset re-seats the contact patch, so the next hop is off the features', async ({ page }) => {
  const errors = collectErrors(page);
  await armFromTitle(page);

  const trace = await page.evaluate(() => {
    const game = window.game;
    const zones = game.levelPlan.trickZones ?? [];
    const centre = (() => {
      const zone = zones.find((each) => each.id === 'ledge');
      if (zone === undefined) throw new Error('no ledge zone');
      const sum = zone.corners.reduce(
        (total, corner) => ({ x: total.x + corner.x, z: total.z + corner.z }),
        { x: 0, z: 0 },
      );
      return { x: sum.x / zone.corners.length, z: sum.z / zone.corners.length };
    })();

    // Stand on the ledge and open a flight from it, so a `seatContactX/Z` that
    // survived the reset would be the ledge's.
    const ground = game.sampleGround(centre.x, centre.z);
    game.placeRider({ x: centre.x, y: ground.height, z: centre.z }, 0);
    game.advance(10);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(120);
    const onLedge = game.snapshot().trickRun.seats[0].lastAward?.zone ?? null;

    // R, and then the very next hop — charged from the first step after the
    // respawn, so the only grounded steps behind it are the reset's own.
    game.setActionsFor(0, { throttle: 0, reset: true });
    game.advance(1);
    game.setActionsFor(0, { throttle: 0, reset: false, crouch: true });
    game.advance(60);
    const stood = game.snapshotFor(0).euc.position;
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(120);

    const seat = game.snapshot().trickRun.seats[0];
    return {
      onLedge,
      stood: { x: stood.x, z: stood.z },
      after: seat.lastAward === null ? null : seat.lastAward.zone,
      offZoneFlights: seat.offZoneFlights,
      flights: seat.flights,
    };
  });

  expect(trace.onLedge, 'the control hop did not launch from the ledge').toBe('ledge');
  // The precondition: R put the rider somewhere that is not trick ground.
  const zones = await zonesOf(page);
  expect(trickZoneAt(zones, trace.stood.x, trace.stood.z), 'the reset target is inside a zone')
    .toBeNull();
  expect(trace.flights, 'the second hop never opened a flight').toBe(2);
  expect(trace.after, 'a hop after R inherited the feature it was reset from').toBeNull();
  expect(trace.offZoneFlights, 'the post-reset hop was not counted off-feature').toBe(1);

  expect(errors).toEqual([]);
});

test('QA: each couch seat’s launch patch is its own', async ({ page }) => {
  const errors = collectErrors(page);
  await fakePads(page, 1);
  await bootToTitle(page, PARK);
  await page.evaluate(() => window.game.clearRecords());
  await page.evaluate(() => {
    window.game.spawnRider();
    window.game.startTrickRun();
    window.game.loop.setRunning(false);
  });

  const trace = await page.evaluate(() => {
    const game = window.game;
    const zones = game.levelPlan.trickZones ?? [];
    const centre = (id: string) => {
      const zone = zones.find((each) => each.id === id);
      if (zone === undefined) throw new Error(`no ${id} zone`);
      const sum = zone.corners.reduce(
        (total, corner) => ({ x: total.x + corner.x, z: total.z + corner.z }),
        { x: 0, z: 0 },
      );
      return { x: sum.x / zone.corners.length, z: sum.z / zone.corners.length };
    };
    // Seat 1 onto the gap; seat 0 stays on the start straight.
    const gap = centre('gap');
    const ground = game.sampleGround(gap.x, gap.z);
    game.placeRider({ x: gap.x, y: ground.height, z: gap.z }, 0, 1);
    game.advance(10);
    // The same script for both seats, on the same steps.
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.setActionsFor(1, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.setActionsFor(1, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.setActionsFor(1, { throttle: 0, crouch: false, hop: false });
    game.advance(140);
    const seats = game.snapshot().trickRun.seats;
    return seats.map((seat) => ({
      zone: seat.lastAward === null ? null : seat.lastAward.zone,
      offZoneFlights: seat.offZoneFlights,
      flights: seat.flights,
    }));
  });

  expect(trace.length).toBe(2);
  expect(trace[0].flights, 'seat 0 never left the ground').toBe(1);
  expect(trace[1].flights, 'seat 1 never left the ground').toBe(1);
  expect(trace[0].zone, 'the host borrowed the guest’s feature').toBeNull();
  expect(trace[1].zone, 'the guest lost the feature it launched from').toBe('gap');
  expect(trace[0].offZoneFlights, 'the host’s flat hop was not counted off-feature').toBe(1);
  expect(trace[1].offZoneFlights, 'the guest’s feature flight was called off-feature').toBe(0);

  expect(errors).toEqual([]);
});

test('QA: a free ride in the park has no referee, so no zone lookup decides anything', async ({ page }) => {
  const errors = collectErrors(page);
  await boot(page, PARK);
  const trace = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);
    const zones = game.levelPlan.trickZones ?? [];
    const zone = zones.find((each) => each.id === 'kicker');
    if (zone === undefined) throw new Error('no kicker zone');
    const sum = zone.corners.reduce(
      (total, corner) => ({ x: total.x + corner.x, z: total.z + corner.z }),
      { x: 0, z: 0 },
    );
    const spot = { x: sum.x / zone.corners.length, z: sum.z / zone.corners.length };
    const ground = game.sampleGround(spot.x, spot.z);
    game.placeRider({ x: spot.x, y: ground.height, z: spot.z }, 0);
    game.advance(10);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(140);
    const snap = game.snapshot();
    return {
      phase: snap.trickRun.phase,
      seats: snap.trickRun.seats.length,
      state: snap.app.state,
      zones: zones.length,
    };
  });
  expect(trace.zones, 'the park stopped carrying its zones').toBe(9);
  expect(trace.phase, 'a free ride armed a referee').toBe('idle');
  expect(trace.seats, 'a free ride published books').toBe(0);
  expect(trace.state).toBe('freeRide');
  expect(errors).toEqual([]);
});

test('QA: the card’s off-feature note stays away when nothing landed off a feature', async ({ page }) => {
  const errors = collectErrors(page);
  await armFromTitle(page);

  const banked = await page.evaluate(() => {
    const game = window.game;
    const zone = (game.levelPlan.trickZones ?? []).find((each) => each.id === 'ledge');
    if (zone === undefined) throw new Error('no ledge zone');
    const sum = zone.corners.reduce(
      (total, corner) => ({ x: total.x + corner.x, z: total.z + corner.z }),
      { x: 0, z: 0 },
    );
    const spot = { x: sum.x / zone.corners.length, z: sum.z / zone.corners.length };
    const ground = game.sampleGround(spot.x, spot.z);
    game.placeRider({ x: spot.x, y: ground.height, z: spot.z }, 0);
    game.advance(10);
    game.setActionsFor(0, { throttle: 0, crouch: true });
    game.advance(60);
    game.setActionsFor(0, { throttle: 0, crouch: true, hop: true });
    game.advance(4);
    game.setActionsFor(0, { throttle: 0, crouch: false, hop: false });
    game.advance(140);
    // Run the clock out where it stands, so the card is a completed one.
    const remaining = game.snapshot().trickRun.remainingSteps;
    if (remaining > 0) game.advance(remaining);
    const seat = game.snapshot().trickRun.seats[0];
    return { zone: seat.lastAward?.zone ?? null, offZoneFlights: seat.offZoneFlights };
  });
  expect(banked.zone, 'the control flight did not launch from the ledge').toBe('ledge');
  expect(banked.offZoneFlights, 'the control run landed something off a feature').toBe(0);

  await expect(page.locator('.euc-menu--results')).toBeVisible();
  // The ROW is unconditional and prints the count; the NOTE is the sentence
  // that explains the rule and is printed only to a player it happened to.
  const rows = await page.evaluate(() => [...document.querySelectorAll(
    '[data-menu="results-rows"] tr',
  )].map((row) => ({
    label: row.querySelector('th')?.textContent ?? '',
    count: row.querySelector('.euc-results__row-time')?.textContent ?? '',
  })));
  const offRow = rows.find((row) => row.label === 'Tricks off the features');
  expect(offRow, 'the card dropped the off-feature row').toBeDefined();
  expect(offRow?.count, 'the off-feature row counted a flight that never happened').toBe('0');
  await expect(page.locator('[data-menu="results-notes"]'))
    .not.toContainText('Tricks only score on flights launched from a park feature');

  expect(errors).toEqual([]);
});
