/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test } from '@playwright/test';
import { bootToTitle, collectErrors } from './harness.ts';

/**
 * M38 blind adversarial pass, 2026-09-14 — the per-FEATURE repeat clocks.
 *
 * `src/simulation/trickRun.qa.test.ts` attacks the referee's arithmetic; this
 * file asks the running game the two questions arithmetic cannot answer. Does
 * the exploit the new clocks were built to close survive when a stationary
 * rider uses **more than one** feature — the case every earlier camping
 * fixture sampled one of — and does the screen still say exactly what the
 * referee decided once repeats are in the book?
 *
 * Nothing here injects a scoring fact: every award is the real controller's
 * flight through the real `Game.stepTrickRun` seam, the way
 * `tests/m38-codex.spec.ts` takes its own. `placeRider` is the move between
 * features, and it makes the attempt ineligible for a personal best — asserted
 * rather than assumed.
 */

test('blind QA: the per-feature clocks pay a stationary camper once per feature', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=switchback');
  await page.locator('.euc-menu--title [data-menu="trick-run"]').click();

  const evidence = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);

    /** Stand at a zone's centre and land one hop + 180 + one-foot air. */
    const camp = (id: string, budget: number) => {
      const zone = game.levelPlan.trickZones?.find((entry) => entry.id === id);
      if (zone === undefined) throw new Error(`no zone ${id}`);
      const x = zone.corners.reduce((sum, corner) => sum + corner.x, 0) / zone.corners.length;
      const z = zone.corners.reduce((sum, corner) => sum + corner.z, 0) / zone.corners.length;
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, 0);
      game.advance(1);
      const controller = game.controller;
      let held = false;
      let spun = false;
      let launched = false;
      let displacement = 0;
      for (let step = 0; step < budget; step += 1) {
        const before = controller.snapshot();
        const hop = !launched && controller.canAcceptHop;
        const spin = !before.grounded && !spun && controller.canAcceptSpin;
        if (spin) spun = true;
        if (hop) held = true;
        game.setActionsFor(0, {
          throttle: 0, steer: spin ? -1 : 0, crouch: false,
          hop: hop || spin, hopHeld: held && !spin,
        });
        game.advance(1);
        if (controller.tookOff) launched = true;
        const position = controller.snapshot().position;
        displacement = Math.max(displacement, Math.hypot(position.x - x, position.z - z));
        if (launched && controller.touchedDown) {
          const award = game.trickRun.book(0)?.lastAward ?? null;
          return {
            id,
            displacement,
            award: award === null ? null : {
              points: award.points,
              kinds: [...award.kinds] as string[],
              zone: award.zone,
              repeated: award.repeated,
            },
          };
        }
      }
      return { id, displacement, award: null };
    };

    // Four features on two corridors. `skinny` and `stepUp` are 1.8 m apart on
    // one straight. This placement test proves the payouts, not the travel
    // time. tests/m38-review.spec.ts covers the continuous ride from the start.
    const visits = ['ledge', 'skinny', 'stepUp', 'stairs'].map((id) => camp(id, 900));
    // And the first feature again, immediately: the clock that must still bite.
    visits.push(camp('ledge', 900));
    const run = game.snapshot().trickRun;
    return {
      visits,
      eligible: run.eligible,
      score: run.seats[0].score,
      crashes: run.seats[0].crashes,
    };
  });

  // The move between features is a teleport, so the attempt files nothing.
  expect(evidence.eligible).toBe(false);
  expect(evidence.crashes).toBe(0);
  for (const visit of evidence.visits) {
    expect(visit.displacement, `${visit.id} drifted`).toBeLessThan(0.01);
    expect(visit.award, `${visit.id} banked nothing`).not.toBeNull();
    expect(visit.award?.zone, `${visit.id} did not launch from its own zone`).toBe(visit.id);
    expect(visit.award?.kinds).toEqual(['spin-landed', 'one-foot-air']);
  }

  // **The measurement, pinned and explicitly not a balance acceptance.** Each
  // feature has its own clock, so four stationary flights inside a few seconds
  // are each paid in full; the fifth is the ledge again inside its own window
  // and is halved. A scoring decision that changes this must move this pin,
  // `src/simulation/trickRun.qa.test.ts`'s camping pins and the bench's
  // camping rows together.
  const opening = evidence.visits.slice(0, 4);
  expect(opening.map((visit) => visit.award?.repeated)).toEqual([false, false, false, false]);
  expect(opening.map((visit) => visit.award?.points)).toEqual([448, 448, 448, 448]);
  expect(evidence.visits[4].award?.repeated).toBe(true);
  expect(evidence.visits[4].award?.points).toBe(224);
  expect(evidence.score).toBe(448 * 4 + 224);

  expect(errors).toEqual([]);
});

test('blind QA: the lane, the card and the referee agree once repeats are in the book', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page, 'level=switchback');
  await page.locator('.euc-menu--title [data-menu="trick-run"]').click();

  const live = await page.evaluate(() => {
    const game = window.game;
    game.loop.setRunning(false);

    const campAt = (x: number, z: number, budget: number) => {
      game.placeRider({ x, y: game.sampleGround(x, z).height, z }, 0);
      game.advance(1);
      const controller = game.controller;
      let held = false;
      let spun = false;
      let launched = false;
      for (let step = 0; step < budget; step += 1) {
        const before = controller.snapshot();
        const hop = !launched && controller.canAcceptHop;
        const spin = !before.grounded && !spun && controller.canAcceptSpin;
        if (spin) spun = true;
        if (hop) held = true;
        game.setActionsFor(0, {
          throttle: 0, steer: spin ? -1 : 0, crouch: false,
          hop: hop || spin, hopHeld: held && !spin,
        });
        game.advance(1);
        if (controller.tookOff) launched = true;
        if (launched && controller.touchedDown) return true;
      }
      return false;
    };
    const centreOf = (id: string) => {
      const zone = game.levelPlan.trickZones?.find((entry) => entry.id === id);
      if (zone === undefined) throw new Error(`no zone ${id}`);
      return {
        x: zone.corners.reduce((sum, corner) => sum + corner.x, 0) / zone.corners.length,
        z: zone.corners.reduce((sum, corner) => sum + corner.z, 0) / zone.corners.length,
      };
    };

    // Two flights off one feature, so the book carries a repeat, then one off
    // the flat, so it carries an off-feature flight too.
    const kicker = centreOf('kicker');
    campAt(kicker.x, kicker.z, 900);
    campAt(kicker.x, kicker.z, 900);
    const spawn = game.levelPlan.spawn.position;
    campAt(spawn.x, spawn.z, 900);

    const book = game.trickRun.book(0);
    if (book === null) throw new Error('no book');
    const pane = document.querySelector('.euc-hud-seat');
    return {
      score: book.score,
      repeatedFlights: book.breakdown.repeatedFlights,
      repeatAdjustment: book.breakdown.repeatAdjustment,
      offZoneFlights: book.breakdown.offZoneFlights,
      laneScore: pane?.querySelector('[data-hud="score-value"]')?.textContent ?? '',
      laneAward: pane?.querySelector('[data-hud="trick-award-points"]')?.textContent ?? '',
      laneLabel: pane?.querySelector('[data-hud="trick-award-label"]')?.textContent ?? '',
      lastAwardPoints: book.lastAward?.points ?? null,
      lastAwardZone: book.lastAward?.zone ?? null,
    };
  });

  expect(live.repeatedFlights).toBe(1);
  expect(live.repeatAdjustment).toBeLessThan(0);
  expect(live.offZoneFlights).toBe(1);
  // The lane never prints a number the referee did not decide.
  expect(live.laneScore.replace(/[^0-9]/g, '')).toBe(`${live.score}`);
  expect(live.laneAward.replace(/[^0-9]/g, '')).toBe(`${live.lastAwardPoints}`);
  // And the off-feature cue is on exactly the flight that launched off one.
  expect(live.lastAwardZone).toBeNull();
  expect(live.laneLabel).toContain('off feature');

  await page.evaluate(() => window.game.endTrickRun());
  await expect(page.locator('.euc-menu--results')).toBeVisible();

  const card = await page.evaluate(() => ({
    total: document.querySelector('[data-menu="results-total"]')?.textContent ?? '',
    rows: [...document.querySelectorAll('[data-menu="results-rows"] tr')].map((row) => ({
      label: row.querySelector('th')?.textContent ?? '',
      count: row.querySelector('.euc-results__row-time')?.textContent ?? '',
      points: row.querySelector('.euc-results__row-delta')?.textContent ?? '',
    })),
  }));

  const repeat = card.rows.find((row) => row.label === 'Repeat visits');
  expect(repeat, 'the renamed repeat row is missing from the card').toBeTruthy();
  expect(repeat?.count).toBe(`${live.repeatedFlights}`);
  expect(Number(repeat?.points)).toBe(live.repeatAdjustment);
  const summed = card.rows
    .filter((row) => row.points !== '—')
    .reduce((total, row) => total + Number(row.points), 0);
  expect(summed, 'the card stopped adding to the run score').toBe(live.score);
  expect(card.total.replace(/[^0-9]/g, '')).toBe(`${live.score}`);

  expect(errors).toEqual([]);
});
