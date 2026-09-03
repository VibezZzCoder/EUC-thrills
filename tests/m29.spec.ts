/*! EUC Thrills — (c) 2026 VibezZzCoder — MIT — https://github.com/VibezZzCoder/EUC-thrills */
import { expect, test, type Page } from '@playwright/test';
import { CHARACTERS, CHARACTER_IDS } from '../src/data/riders.ts';
import { DRUNK, SIMULATION } from '../src/data/tuning.ts';
import { PROVING_GROUND, boot, bootToTitle, collectErrors, disableMaxSpeedCutout } from './harness.ts';

/**
 * M29 — The Drunkard's seat and his ride style (docs/PLANS.md §29.4, §29.8).
 *
 * Phase 0 put him on the roster: the title's dot row counts the roster rather
 * than a number (`DESIGN.md` §9d-ii), and the seventh card is in the chooser,
 * is a real `<button>`, and applies immediately the way the other six do. His
 * card carries no `<image>`: nothing on him is a right this project may not
 * redraw, so the exception §9d records for two real riders' marks stays used
 * exactly twice.
 *
 * The fit contract — seven cards, the heading and Done inside all twelve
 * supported viewports at once — stays where it lives, in `tests/m22.spec.ts`,
 * which reads the roster and so grew to seven without an edit; Phase 0's
 * change to the phone tier is what makes it green.
 *
 * Phase 1 gave him the Drunken Master, and everything below it is that style
 * asked as a question a browser can answer: choose him and read a lateral
 * weave in the position trace with bounded heading drift; choose Cool Rider
 * and read none; a couch pair with one of each, only one weaving; a stumble
 * reached by `advance(n)` at the same step every run; and the three safeguards
 * only a browser can hold — S6 (`?wobble=0` is a different switch), S7 (F4
 * tunes his numbers and installs no style) and S4 (a fresh world keeps him
 * drunk).
 *
 * **These rides are on the proving ground, and hands-off.** `docs/PLANS.md`
 * §2.5's measuring instrument is the only flat, hazard-free straight in the
 * game long enough for the weave's 6.3 s and 8.7 s sines to show — a generated
 * route would be measuring its own kerbs. The one test that must ride a
 * generated route (S4) rides four seconds of it and stops at the first crash,
 * because a *Fresh route* draws its seed from `Math.random` and the world is
 * different every run.
 */

const STEPS = (seconds: number): number => Math.round(seconds * SIMULATION.hz);
const DEGREES = (radians: number): number => (radians * 180) / Math.PI;

/** One sample of a seat's ride style, small enough to send thousands of. */
interface StyleSample {
  step: number;
  /**
   * Metres along the seat's **initial right vector**, so a spawn heading other
   * than zero still reads as sideways travel rather than as forward travel
   * leaking into x. The sign is the frame's; a band is signless.
   */
  lateral: number;
  /** `headingY` minus the heading this ride started at, radians. */
  headingDrift: number;
  sway: number;
  styleHeading: number;
  styleWeaveRate: number;
  styleYaw: number;
  styleRoll: number;
  styleStumble: number;
  stumbles: number;
  speed: number;
  crashed: boolean;
}

/**
 * Hold full throttle and no steering on every named seat and sample them all.
 *
 * One round trip for the whole ride (AGENTS.md, master §17.2). It stops at the
 * first crashed sample rather than riding on past it, so a ride that was meant
 * to stay upright fails on `crashed` instead of quietly reporting the numbers
 * of a rider lying in the road.
 */
async function rideHandsOff(
  page: Page,
  seats: readonly number[],
  steps: number,
  every: number,
): Promise<StyleSample[][]> {
  return page.evaluate(({ onSeats, total, gap }) => {
    const game = window.game;
    const start = onSeats.map((seat) => {
      const euc = game.snapshotFor(seat).euc;
      return { x: euc.position.x, z: euc.position.z, headingY: euc.headingY };
    });
    for (const seat of onSeats) game.setActionsFor(seat, { throttle: 1, steer: 0 });

    const traces: StyleSample[][] = onSeats.map(() => []);
    for (let step = 0; step <= total; step += gap) {
      if (step > 0) game.advance(gap);
      let down = false;
      onSeats.forEach((seat, index) => {
        const euc = game.snapshotFor(seat).euc;
        const from = start[index];
        const dx = euc.position.x - from.x;
        const dz = euc.position.z - from.z;
        traces[index].push({
          step,
          lateral: dx * Math.cos(from.headingY) - dz * Math.sin(from.headingY),
          headingDrift: euc.headingY - from.headingY,
          sway: euc.styleSway,
          styleHeading: euc.styleHeading,
          styleWeaveRate: euc.styleWeaveRate,
          styleYaw: euc.styleYaw,
          styleRoll: euc.styleRoll,
          styleStumble: euc.styleStumble,
          stumbles: euc.stumbles,
          speed: euc.speed,
          crashed: euc.crashed,
        });
        down = down || euc.crashed;
      });
      if (down) break;
    }
    return traces;
  }, { onSeats: [...seats], total: steps, gap: every });
}

/** Peak-to-peak of the lateral trace: the width of the band the rider used. */
const band = (trace: readonly StyleSample[]): number => {
  const lateral = trace.map((sample) => sample.lateral);
  return Math.max(...lateral) - Math.min(...lateral);
};

const peak = (trace: readonly StyleSample[], of: (sample: StyleSample) => number): number => (
  Math.max(...trace.map((sample) => Math.abs(of(sample))))
);

/** Every style output on one sample, for the tests that claim they are all zero. */
const styleFields = (sample: StyleSample): readonly number[] => [
  sample.sway,
  sample.styleHeading,
  sample.styleWeaveRate,
  sample.styleYaw,
  sample.styleRoll,
  sample.styleStumble,
  sample.stumbles,
];

/** Boot the measuring instrument as one character, with the cutout out of the way. */
async function bootAs(page: Page, character: 'drunkard' | 'cool-rider', query = ''): Promise<void> {
  await boot(page, query === '' ? PROVING_GROUND : `${query}&${PROVING_GROUND}`);
  await page.evaluate((id) => window.game.setOptions({ character: id }), character);
  // 25 s of full throttle is well past the cutout speed, and a cutout crash
  // would end the ride this file is trying to measure.
  await disableMaxSpeedCutout(page);
  await page.evaluate(() => window.qa.resetRide());
}

// ---------------------------------------------------------------------------
// Phase 0 — the seventh seat
// ---------------------------------------------------------------------------

test('the seventh rider is on the dot row and in the chooser, and choosing him is immediate', async ({ page }) => {
  const errors = collectErrors(page);
  await bootToTitle(page);

  expect(CHARACTER_IDS.length).toBe(7);
  expect(CHARACTER_IDS[CHARACTER_IDS.length - 1]).toBe('drunkard');
  await expect(page.locator('[data-rider-dot]')).toHaveCount(CHARACTERS.length);
  await expect(page.locator('[data-rider-dot="drunkard"]')).toHaveCount(1);

  await page.locator('.euc-rider-chip').click();
  await expect(page.locator('.euc-menu--riders')).toBeVisible();
  // The chooser used to promise "Looks only — every rider rides exactly the
  // same" a line above a rider whose path is meant to weave, which would
  // make the weave read as a defect (the QA pass's one wording finding). It
  // now says what is shared and what is his.
  await expect(page.locator('.euc-menu--riders .euc-menu__tagline')).toContainText('The Drunkard weaves');
  await expect(page.locator('.euc-menu--riders .euc-menu__tagline')).toContainText('Same wheel for everyone');
  const card = page.locator('.euc-menu--riders [data-rider="drunkard"]');
  await expect(card).toBeVisible();
  expect(await card.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(card.locator('.euc-rider-card__name')).toHaveText('The Drunkard');
  // Drawn, not embedded: the `<image>` exception is for marks this project may not redraw.
  await expect(card.locator('image')).toHaveCount(0);
  await expect(card.locator('svg path, svg rect')).not.toHaveCount(0);

  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-rider-dot][data-current="true"]'))
    .toHaveAttribute('data-rider-dot', 'drunkard');
  expect(await page.evaluate(() => window.game.options.current.character)).toBe('drunkard');
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('drunkard');

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 1 — the weave, and the sober line beside it
// ---------------------------------------------------------------------------

/**
 * The bounds this file rides against, all three of them measured rather than
 * copied out of the tuning table.
 *
 * The **band** is the claim with two ends, and both matter. A floor of 0.15 m
 * fails a wheel riding a straight line with a `styleSway` that moves nothing —
 * a sway written to the pose and never to the path would still satisfy every
 * other assertion here. A ceiling of 0.9 m fails a weave that has become a
 * kerb-finder, which is the whole reason §29.4 holds the excursion constant
 * above cruising instead of letting it grow with speed. Measured over 25 s
 * hands-off from a standstill: **0.581 m**, against 0.480 m over the first
 * 20 s — the growth is the stumbles' own sideways kicks, not a drift.
 */
const BAND_FLOOR_METRES = 0.15;
const BAND_CEILING_METRES = 0.9;
/**
 * The weave is a *bounded offset*, not a rate, so `headingY` must come back to
 * where it started every cycle. `weaveHeading` is 1.72° and the excursion hold
 * scales it by `weaveSpeedFull / speed`, so at the 18–22 m/s this ride reaches
 * the offset can only be about 0.75°. Measured peak over 25 s: **0.745°**.
 * 1.5° is twice the reachable bound and would fail a weave that integrated.
 */
const HEADING_DRIFT_LIMIT_DEGREES = 1.5;

test('the Drunkard weaves hands-off, and his heading comes back every time', async ({ page }) => {
  const errors = collectErrors(page);
  await bootAs(page, 'drunkard');

  const [trace] = await rideHandsOff(page, [0], STEPS(25), 10);

  // He never comes off. The ride runs off the end of the 180 m pad onto the
  // proving ground's flat grass at about 438 m and keeps rolling at 18 m/s;
  // that is a surface change and not a hazard, and a crash here would mean the
  // weave found something, which is exactly what it must not do.
  expect(trace.some((sample) => sample.crashed)).toBe(false);
  expect(trace.length).toBe(STEPS(25) / 10 + 1);

  // The sway is a real swing of the body, not a twitch: it reaches nearly the
  // oscillator's full travel (measured 0.998).
  expect(peak(trace, (sample) => sample.sway)).toBeGreaterThan(0.5);
  // And it is a sway rather than a lean — it must cross zero and come back.
  expect(Math.min(...trace.map((sample) => sample.sway))).toBeLessThan(-0.5);
  expect(Math.max(...trace.map((sample) => sample.sway))).toBeGreaterThan(0.5);

  // The path itself: a band of sideways travel with two ends.
  expect(band(trace)).toBeGreaterThan(BAND_FLOOR_METRES);
  expect(band(trace)).toBeLessThan(BAND_CEILING_METRES);

  // The heading never leaves; every sample, not merely the last one, because a
  // weave that integrated would pass an endpoint check on the right phase.
  expect(DEGREES(peak(trace, (sample) => sample.headingDrift)))
    .toBeLessThan(HEADING_DRIFT_LIMIT_DEGREES);
  // `headingY`'s excursion *is* the style's offset while nothing else steers,
  // which is what makes the bound above a statement about the weave.
  expect(peak(trace, (sample) => sample.styleHeading))
    .toBeCloseTo(peak(trace, (sample) => sample.headingDrift), 9);

  expect(errors).toEqual([]);
});

test('Cool Rider rides the same ride with every style field at exactly zero', async ({ page }) => {
  // The sober digests (S1) hold this headlessly at the level of the pose; this
  // is the same claim where the player meets it, through the options store,
  // `dressSeat` and the snapshot. `=== 0` rather than a tolerance on purpose:
  // §29.4 makes every line of `stepStyle` a `+ 0` for a sober style, so a
  // sober seat that reported 1e-17 would mean a term had started to exist.
  const errors = collectErrors(page);
  await bootAs(page, 'cool-rider');

  const [trace] = await rideHandsOff(page, [0], STEPS(25), 10);

  expect(trace.some((sample) => sample.crashed)).toBe(false);
  expect(trace.length).toBe(STEPS(25) / 10 + 1);
  for (const sample of trace) {
    expect(styleFields(sample), `step ${sample.step}`).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }
  // And nothing moved him sideways: 2 cm over 25 s of full throttle, where the
  // Drunkard used 58. Measured: 0.
  expect(band(trace)).toBeLessThan(0.02);

  expect(errors).toEqual([]);
});

test('a couch pair with one of each has exactly one weaving seat', async ({ page }) => {
  // S3 asked per seat, never per room, and this is the two-seat case of it in
  // a real browser: one simulation, one world, one `advance`, two styles.
  //
  // **The Drunkard takes seat 0 and the sober rider is the guest**, which is
  // the way round the proving ground allows. Seat 1's slot is 1.6 m to the
  // left, and from there the weave finds something at about 12 s that a sober
  // rider on the same slot rides straight past — so the mirrored arrangement
  // would be measuring the proving ground's furniture rather than the style.
  const errors = collectErrors(page);
  await bootAs(page, 'drunkard');
  await page.evaluate(() => {
    window.game.loop.setRunning(false);
    window.game.spawnSecondRider('cool-rider');
  });
  expect(await page.evaluate(() => [
    window.game.snapshotFor(0).rider.installed,
    window.game.snapshotFor(1).rider.installed,
  ])).toEqual(['drunkard', 'cool-rider']);

  const [drunk, sober] = await rideHandsOff(page, [0, 1], STEPS(10), 10);

  expect(drunk.some((sample) => sample.crashed)).toBe(false);
  expect(sober.some((sample) => sample.crashed)).toBe(false);

  // The drunk seat: measured 0.874 of sway and a 0.480 m band.
  expect(peak(drunk, (sample) => sample.sway)).toBeGreaterThan(0.5);
  expect(band(drunk)).toBeGreaterThan(BAND_FLOOR_METRES);

  // The seat beside him, at every sample: exactly zero, and a straight line.
  for (const sample of sober) {
    expect(styleFields(sample), `seat 1, step ${sample.step}`).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }
  expect(band(sober)).toBeLessThan(0.02);

  expect(errors).toEqual([]);
});

test('a stumble lands on the same fixed step every run', async ({ page }) => {
  /**
   * The metres are counted on the fixed step, so `advance(n)` reaches the same
   * stumble every run — and *that* is the claim, not the number. The number is
   * a property of this fixture (the proving ground, full throttle, from a
   * standstill) and the game world will put it somewhere else, so the test
   * boots twice and compares rather than pinning 859.
   */
  const findFirstStumble = async (): Promise<{
    step: number;
    atTrigger: number;
    next: number;
    peakEnvelope: number;
    headingAtTrigger: number;
    headingLater: number;
  }> => {
    await bootAs(page, 'drunkard');
    return page.evaluate((stumbleSteps) => {
      const game = window.game;
      game.setActions({ throttle: 1, steer: 0 });
      let step = 0;
      while (step < 4000 && game.snapshot().euc.stumbles < 1) {
        game.advance(1);
        step += 1;
      }
      const trigger = game.snapshot().euc;
      const atTrigger = trigger.styleStumble;
      const headingAtTrigger = trigger.headingY;
      game.advance(1);
      const next = game.snapshot().euc.styleStumble;
      let peakEnvelope = next;
      for (let n = 1; n < stumbleSteps; n += 1) {
        game.advance(1);
        peakEnvelope = Math.max(peakEnvelope, game.snapshot().euc.styleStumble);
      }
      return {
        step,
        atTrigger,
        next,
        peakEnvelope,
        headingAtTrigger,
        headingLater: game.snapshot().euc.headingY,
      };
    }, STEPS(DRUNK.stumbleSeconds));
  };

  const first = await findFirstStumble();
  const again = await findFirstStumble();

  // The whole claim: the same step, twice, from two boots of the same page.
  expect(again.step).toBe(first.step);
  // And it is a stumble reached by *riding*, not by the clock — the spacing is
  // metres and the ride is an accelerating one, so the step is later than the
  // spacing divided by top speed. Measured: step 859, about 7.2 s.
  expect(first.step).toBeGreaterThan(STEPS(DRUNK.stumbleEvery / 22));

  // **The envelope is zero at both ends by design, and the trigger step is one
  // of those ends**: `stepStyle` writes the envelope before it counts the
  // metres, so the step the counter moves on is the step before the shimmy.
  // The envelope is alive on the very next one and reaches its full height
  // inside the stumble's own half second.
  expect(first.atTrigger).toBe(0);
  expect(first.next).toBeGreaterThan(0);
  expect(first.peakEnvelope).toBeGreaterThan(0.99);
  expect(again.next).toBe(first.next);
  expect(again.peakEnvelope).toBe(first.peakEnvelope);

  // A stumble is spent on the travel heading and never on `headingY`: half a
  // second of shimmy leaves the rider pointing where they were. Measured
  // across the stumble: 0.055°.
  expect(DEGREES(Math.abs(first.headingLater - first.headingAtTrigger))).toBeLessThan(0.5);
});

// ---------------------------------------------------------------------------
// The safeguards a browser is the only place to hold
// ---------------------------------------------------------------------------

test('S6 — ?wobble=0 silences the wobble and leaves the style alone', async ({ page }) => {
  // They are different things, and a diagnostic that silenced the wobble
  // should not silence the joke (§29.4, S6). There is deliberately no `?drunk=`
  // to test the other way round: M13's `?wobbleprobe=` lesson is that a URL
  // which arms a ride behaviour becomes an "always on" nobody chose.
  const errors = collectErrors(page);
  await bootAs(page, 'drunkard', 'wobble=0');

  const gate = await page.evaluate(() => ({
    now: window.game.tuning.get('EUC.wobbleMasterGain'),
    byDefault: window.game.tuning.defaultOf('EUC.wobbleMasterGain'),
  }));
  // The query really did shut the wobble door, or the rest of this test is
  // asserting that a style survives nothing at all.
  expect(gate.now).toBe(0);
  expect(gate.byDefault).not.toBe(0);

  const [trace] = await rideHandsOff(page, [0], STEPS(15), 10);
  expect(trace.some((sample) => sample.crashed)).toBe(false);
  // Measured with the wobble gate shut: 0.874 of sway and a 0.480 m band —
  // the same numbers the default boot produces over the same 15 s.
  expect(peak(trace, (sample) => sample.sway)).toBeGreaterThan(0.5);
  expect(band(trace)).toBeGreaterThan(BAND_FLOOR_METRES);
  expect(trace[trace.length - 1].stumbles).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('S7 — F4 moves his numbers and cannot put a style on a sober seat', async ({ page }) => {
  /**
   * A tunable is only testable by moving it, and two very different settings
   * have to be *distinguishable* (AGENTS.md, M26's finding). So each half here
   * rides the default first and the override second and compares the two,
   * rather than asserting one number at one setting.
   */
  const errors = collectErrors(page);
  await bootAs(page, 'drunkard');
  // `disableMaxSpeedCutout` is itself an override, so the counts below are all
  // measured against what the boot already put in the store.
  const overrides = async (): Promise<number> => page.evaluate(
    () => window.game.snapshot().tuning.overrideCount,
  );
  const baseline = await overrides();

  const [byDefault] = await rideHandsOff(page, [0], STEPS(15), 10);
  const defaultBand = band(byDefault);
  expect(peak(byDefault, (sample) => sample.styleHeading)).toBeGreaterThan(0);

  // -- `weaveHeading` to zero: the weave goes, the sway stays --------------
  //
  // §29.4 says so in as many words: "zero is a legal value that leaves the
  // sway, the stumble, the stagger and the sip standing". If the owner's ride
  // says the weave fights him, this is the one constant that answers, and this
  // assertion is what says the answer is available.
  await page.evaluate(() => {
    window.game.tuning.set('DRUNK.weaveHeading', 0);
    // `applyTuning` re-dresses every seat, so the ride below is the seat the
    // panel just touched rather than the one that was built at boot.
    window.qa.resetRide();
  });
  expect(await overrides()).toBe(baseline + 1);
  const [zeroed] = await rideHandsOff(page, [0], STEPS(15), 10);

  for (const sample of zeroed) {
    expect(sample.styleHeading, `step ${sample.step}`).toBe(0);
    expect(sample.styleWeaveRate, `step ${sample.step}`).toBe(0);
  }
  // The body still sways through both signs — measured −0.874 to +0.534.
  expect(Math.max(...zeroed.map((sample) => sample.sway))
    - Math.min(...zeroed.map((sample) => sample.sway))).toBeGreaterThan(0.8);
  expect(peak(zeroed, (sample) => sample.sway)).toBeGreaterThan(0.5);
  // And the path went straight, to within the stumbles' own kicks: a
  // 0.13 m band against the default weave's 0.26 (measured after the QA
  // repairs brought the weave down to 0.022 rad; before them it was 0.15
  // against 0.48). Two absolute bounds rather than a ratio, because the
  // ratio between a shimmy's kick and the weave is a tuning fact and not the
  // claim — the claim is that the weave is gone and the stumble is not.
  expect(band(zeroed)).toBeLessThan(0.2);
  expect(defaultBand).toBeGreaterThan(0.2);
  expect(band(zeroed)).toBeLessThan(defaultBand);

  // -- `stumbleEvery`: the same road, more stumbles ------------------------
  const overTwoHundredMetres = async (): Promise<number> => page.evaluate(() => {
    const game = window.game;
    window.qa.resetRide();
    const from = game.snapshot().euc.distanceTravelled;
    game.setActions({ throttle: 1, steer: 0 });
    let steps = 0;
    while (steps < 6000 && game.snapshot().euc.distanceTravelled - from < 200) {
      game.advance(10);
      steps += 10;
    }
    return game.snapshot().euc.stumbles;
  });

  // `tuning.reset()` clears *every* override, the cutout among them, so the
  // harness's call has to be made again or the control ride below is a ride
  // into the cutout rather than a ride at the shipped spacing.
  await page.evaluate(() => window.game.tuning.reset());
  await disableMaxSpeedCutout(page);
  expect(await overrides()).toBe(baseline);
  // 200 m at the shipped 110 m spacing is one stumble, and it is the control
  // for the number below rather than a claim of its own.
  expect(await overTwoHundredMetres()).toBe(1);
  await page.evaluate(() => window.game.tuning.set('DRUNK.stumbleEvery', 20));
  // Measured at a 20 m spacing: 7.
  expect(await overTwoHundredMetres()).toBeGreaterThanOrEqual(3);

  // -- The panel tunes numbers; it does not install a style ----------------
  //
  // The absurd setting is worth riding precisely because it must be visibly
  // absurd on his seat and completely invisible on anybody else's.
  await page.evaluate(() => {
    window.game.setOptions({ character: 'cool-rider' });
    window.game.tuning.set('DRUNK.weaveHeading', 0.3);
    window.game.tuning.set('DRUNK.stumbleEvery', 20);
  });
  // Both DRUNK numbers really are in the store while the sober ride runs.
  expect(await overrides()).toBe(baseline + 2);
  await page.evaluate(() => window.qa.resetRide());

  const [sober] = await rideHandsOff(page, [0], STEPS(10), 10);
  for (const sample of sober) {
    expect(styleFields(sample), `sober, step ${sample.step}`).toEqual([0, 0, 0, 0, 0, 0, 0]);
  }
  expect(band(sober)).toBeLessThan(0.02);

  await page.evaluate(() => window.game.tuning.reset());
  expect(errors).toEqual([]);
});

test('S7 — his F4 overrides survive a trip through the chooser and back', async ({ page }) => {
  // The QA pass's finding 5: `dressSeat` installed the shipped record while
  // `applyTuning` installed the store's, so choosing another rider and
  // choosing him again silently put a zeroed weave back to 0.03 and a 20 m
  // stumble spacing back to 110 while the panel still showed the overrides.
  // Every dressing reads the store now. Two overrides at absurd settings, so
  // the ride after the round trip is unmistakably the tuned one: no heading
  // offset at all, and stumbles every twenty metres.
  const errors = collectErrors(page);
  await bootAs(page, 'drunkard');
  await page.evaluate(() => {
    window.game.tuning.set('DRUNK.weaveHeading', 0);
    window.game.tuning.set('DRUNK.stumbleEvery', 20);
  });
  // Away, and back — through the same option write the chooser's cards make.
  await page.evaluate(() => window.game.options.set({ character: 'cool-rider' }));
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('cool-rider');
  await page.evaluate(() => window.game.options.set({ character: 'drunkard' }));
  expect(await page.evaluate(() => window.game.snapshot().rider.installed)).toBe('drunkard');
  await page.evaluate(() => window.qa.resetRide());

  const [trace] = await rideHandsOff(page, [0], STEPS(12), 10);
  for (const sample of trace) {
    expect(sample.styleHeading, `step ${sample.step}`).toBe(0);
  }
  // Measured: 7 stumbles in 200 m at 20 m against 1 at the shipped 110 m.
  const last = trace[trace.length - 1];
  expect(last.stumbles).toBeGreaterThanOrEqual(3);
  // And the body is still his — the sway survived the round trip too.
  expect(peak(trace, (sample) => sample.sway)).toBeGreaterThan(0.5);

  await page.evaluate(() => window.game.tuning.reset());
  expect(errors).toEqual([]);
});

test('S4 — a fresh world keeps him drunk', async ({ page }) => {
  /**
   * `installLevel` rebuilds every controller from the new plan, which is one of
   * the three places §29.4's S2 names as a writer of a seat's style — and the
   * one a player reaches without meaning to. Through **New route on the pause
   * card**, for M25's reason: only `installLevel` can fail this, and swapping
   * worlds any other way measures nothing.
   *
   * A *Fresh route* draws its seed from `Math.random`, so the world below is
   * different every run. That is why this ride is four seconds long and stops
   * at the first crash: the sway crosses 0.5 at step 300 on every seed (eight
   * checked, all identical, because the oscillator's clock restarts with the
   * ride and the speed ramp is the same everywhere), and the earliest a
   * hands-off rider met a kerb on any of them was step 600.
   */
  const errors = collectErrors(page);
  // The shipped slice, not the proving ground: the world being left has to be
  // one a player is actually in when they press New route.
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'drunkard' }));
  await disableMaxSpeedCutout(page);
  const before = await page.evaluate(() => window.game.snapshot().levelPlanId);

  await page.evaluate(() => {
    window.game.loop.setRunning(true);
    window.game.setAppState('paused');
  });
  await page.locator('.euc-menu--pause [data-menu="new-route"]').click();
  // The build is deferred a frame so "Building…" can paint. Wait on the state,
  // never on a duration.
  await expect
    .poll(async () => page.evaluate(() => window.game.snapshot().route.pending))
    .toBe(false);
  await page.evaluate(() => window.qa.resetRide());

  const swapped = await page.evaluate(() => ({
    levelPlanId: window.game.snapshot().levelPlanId,
    installed: window.game.snapshot().rider.installed,
  }));
  // A different world really did install, or nothing below is about a swap.
  expect(swapped.levelPlanId).not.toBe(before);
  expect(swapped.installed).toBe('drunkard');

  const [trace] = await rideHandsOff(page, [0], STEPS(4), 10);
  // Measured on eight seeds: 0.874, first over 0.5 at step 300.
  expect(peak(trace, (sample) => sample.sway)).toBeGreaterThan(0.5);
  expect(peak(trace, (sample) => sample.styleHeading)).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// Phase 4 — his crash voice, and the stumble's sound (§29.12, q112)
// ---------------------------------------------------------------------------

/**
 * Crash for real and read what the sink reached for — the m28 pattern.
 *
 * Full throttle with the steer flipped every 30 steps finds something solid
 * on the shipped slice inside a few seconds for every rider; the drunk seat's
 * weave does not change that. What comes back is the sink's own account:
 * the recording counter, not the director's intent, and the voice it named
 * at the moment it named it.
 */
async function crashForReal(page: Page): Promise<{
  crashed: boolean;
  samplePlays: number;
  voice: string | null;
}> {
  return page.evaluate(() => {
    window.qa.resetRide();
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
    return {
      crashed: window.game.snapshot().euc.crashed,
      samplePlays: after.crashSamplePlays - before.crashSamplePlays,
      voice: after.lastCrashVoice,
    };
  });
}

test('the Drunkard crashes with his own composed file, audibly, and the voice follows the chooser both ways', async ({ page }) => {
  // `src/audio/crashVoices.test.ts` proves his file is a seventh distinct one
  // on disk and a composition rather than a slice; this proves the *game*
  // reaches for it — through the options store, the engine, the bank and
  // `crashFor`, every one of which is wiring. The m19 / m22 / m23 / m28 rung,
  // aimed at the rider whose interim (`'red-rider'`, three phases long) was
  // declared in the data.
  const errors = collectErrors(page);
  await boot(page);
  await page.evaluate(() => window.game.setOptions({ character: 'drunkard' }));
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);
  await page.evaluate(() => window.qa.freeze());

  const idle = await page.evaluate(async () => {
    window.qa.resetRide();
    return window.qa.audioOutputMax(500, 5);
  });
  const his = await crashForReal(page);
  const during = await page.evaluate(() => window.qa.audioOutputMax(1600, 16));

  expect(his.crashed).toBe(true);
  expect(his.samplePlays).toBeGreaterThanOrEqual(1);
  expect(his.voice).toBe('drunkard');
  // RMS-matched to Cool Rider's, so m8's bar for a crash being audible over
  // the ride bed is the right bar here unchanged.
  expect(during).toBeGreaterThan(0.02);
  expect(during).toBeGreaterThan(idle * 3);

  // Away, and a real crash in the other voice — the direction that would
  // still pass if the mapping were stuck on either end.
  await page.evaluate(() => window.game.setOptions({ character: 'cool-rider' }));
  expect(await page.evaluate(() => window.game.audioSnapshot().crashVoice)).toBe('cool-rider');
  const theirs = await crashForReal(page);
  expect(theirs.crashed).toBe(true);
  expect(theirs.samplePlays).toBeGreaterThanOrEqual(1);
  expect(theirs.voice).toBe('cool-rider');

  // And back, for real again: `lastCrashVoice` is written only by a crash,
  // so reading `crashVoice` after the swap would prove the setting moved and
  // not that the next fall speaks as him.
  await page.evaluate(() => window.game.setOptions({ character: 'drunkard' }));
  const again = await crashForReal(page);
  expect(again.crashed).toBe(true);
  expect(again.samplePlays).toBeGreaterThanOrEqual(1);
  expect(again.voice).toBe('drunkard');

  expect(errors).toEqual([]);
});

/**
 * Ride hands-off, one fixed step at a time, and watch the stumble's counter
 * and the sink's counter side by side until just past the first stumble.
 *
 * `advance(1)` runs the step and then the one drawn frame that hands the
 * director's cues to the sink, so a cue claimed on a step is counted by the
 * time `advance` returns — which is what lets "the same step" be asserted
 * rather than "soon after".
 */
async function rideToFirstStumble(page: Page, limit: number): Promise<{
  step: number;
  stumbles: number;
  playsBefore: number;
  playsAtTrigger: number;
  playsLater: number;
  intentAtTrigger: number;
  stumblesLater: number;
}> {
  return page.evaluate((maxSteps) => {
    const game = window.game;
    game.setActions({ throttle: 1, steer: 0 });
    let step = 0;
    let playsBefore = 0;
    while (step < maxSteps && game.snapshot().euc.stumbles < 1) {
      playsBefore = game.audioSnapshot().stumbleSamplePlays;
      game.advance(1);
      step += 1;
    }
    const audio = game.audioSnapshot();
    const stumbles = game.snapshot().euc.stumbles;
    // Ten more steps: the counter must not fire again while the shimmy runs.
    game.advance(10);
    return {
      step,
      stumbles,
      playsBefore,
      playsAtTrigger: audio.stumbleSamplePlays,
      intentAtTrigger: audio.played.stumble,
      playsLater: game.audioSnapshot().stumbleSamplePlays,
      stumblesLater: game.snapshot().euc.stumbles,
    };
  }, limit);
}

/** Arm the audio with a real gesture, wait for the bank, and freeze the loop for `advance`. */
async function armAudio(page: Page): Promise<void> {
  await page.keyboard.press('KeyW');
  await page.waitForFunction(() => window.game.audioSnapshot().samplesLoaded);
  await page.evaluate(() => {
    window.qa.freeze();
    window.qa.resetRide();
  });
}

test('the cans knock on the fixed step the stumble is counted, once, and never for Cool Rider', async ({ page }) => {
  // The edge lives in `app/Game.ts`, per seat, beside the crash's: the
  // controller's count rises on a step and the director is asked on that
  // step. What this catches is the three ways that can be wrong — a cue
  // fired on a rebuilt controller's zero, a cue a step late (a render-clock
  // edge), and a sober seat's edge firing because the count was read off the
  // wrong rider — and the fourth that only a bank can show: the recording
  // counter staying at zero while `played.stumble` moved, meaning the file
  // never reached the sink.
  const errors = collectErrors(page);
  await bootAs(page, 'drunkard');
  await armAudio(page);
  // The reset above rebuilt nothing and the boot's controller is fresh: no
  // cue may have sounded before the ride starts.
  expect(await page.evaluate(() => window.game.audioSnapshot().stumbleSamplePlays)).toBe(0);

  const his = await rideToFirstStumble(page, 4000);
  // Measured on this fixture: step 859, the same step the Phase 1 test
  // reaches from a second boot.
  expect(his.stumbles).toBe(1);
  expect(his.step).toBeGreaterThan(STEPS(DRUNK.stumbleEvery / 22));
  expect(his.playsBefore).toBe(0);
  expect(his.playsAtTrigger).toBe(1);
  expect(his.intentAtTrigger).toBe(1);
  // The shimmy runs half a second after the count moves; nothing fires again
  // inside it, and the count agrees.
  expect(his.stumblesLater).toBe(1);
  expect(his.playsLater).toBe(1);

  // Cool Rider's identical ride: the count never moves, so nothing sounds —
  // at the same step or any other. Same fixture, same arming, same length.
  await bootAs(page, 'cool-rider');
  await armAudio(page);
  const sober = await page.evaluate((steps) => {
    window.game.setActions({ throttle: 1, steer: 0 });
    window.game.advance(steps);
    const audio = window.game.audioSnapshot();
    return {
      stumbles: window.game.snapshot().euc.stumbles,
      plays: audio.stumbleSamplePlays,
      intent: audio.played.stumble,
      crashed: window.game.snapshot().euc.crashed,
    };
  }, his.step + 10);
  expect(sober.crashed).toBe(false);
  expect(sober.stumbles).toBe(0);
  expect(sober.plays).toBe(0);
  expect(sober.intent).toBe(0);

  expect(errors).toEqual([]);
});
